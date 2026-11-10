/* Portal do cliente do escritório (cookie nx_portal). Cada acesso enxerga só os dados da própria empresa:
   o cliente_id vem sempre da sessão, nunca do pedido. */

import { z } from "zod";
import { conferirSenha, gerarHashSenha, gerarToken, sha256 } from "../seguranca.js";
import { falha, lerCorpo } from "./roteador.js";
import { COOKIE_PORTAL, competencia, email, enviarArquivo, nomeArquivo, senha, t, validar } from "./validacao.js";

export function rotasPortal({ r, repo, nucleo, cfg, agora, limitar, cookie }) {
  const P = { portal: true };
  const HASH_FALSO = gerarHashSenha(gerarToken());

  function sessaoPortal(cookies) {
    const s = cookies[COOKIE_PORTAL] ? repo.sessao(sha256(cookies[COOKIE_PORTAL])) : null;
    if (!s?.portal_id) return null;
    const p = repo.obter("portal_usuarios", null, s.portal_id);
    if (!p?.ativo || !p.senha_hash) return null;
    const c = repo.obter("clientes", p.empresa_id, p.cliente_id);
    return c?.ativo ? { ...p, cliente: c } : null;
  }
  function abrir(res, p) {
    const token = gerarToken();
    repo.criarSessao(sha256(token), { portal_id: p.id }, cfg.sessaoPortalDias);
    cookie(res, COOKIE_PORTAL, token, cfg.sessaoPortalDias);
    repo.rodar("UPDATE portal_usuarios SET ultimo_acesso = ? WHERE id = ?", agora(), p.id);
  }
  const escritorio = () => {
    const e = repo.um("SELECT id FROM empresas ORDER BY criada_em LIMIT 1");
    return e ? nucleo.empresa(e.id) : null;
  };

  r.get("/api/portal/estado", { publico: true }, ({ cookies }) => {
    const e = escritorio();
    return { logado: Boolean(sessaoPortal(cookies)), escritorio: e ? { nome: e.nome_fantasia || e.razao_social, cor: e.config.portal.cor } : null };
  });
  const porConvite = (token) => {
    const p = token ? repo.um("SELECT * FROM portal_usuarios WHERE convite_hash = ? AND ativo = 1", sha256(String(token))) : null;
    return p && p.convite_expira > agora() ? p : null;
  };
  r.get("/api/portal/convite/:token", { publico: true }, ({ params, ip }) => {
    limitar(`convite:${ip}`, 20);
    const p = porConvite(params.token) ?? falha(404, "Convite inválido ou vencido. Peça um novo ao escritório.");
    const c = repo.obter("clientes", p.empresa_id, p.cliente_id);
    return { nome: p.nome, email: p.email, empresa: c?.nome_fantasia || c?.razao_social };
  });
  r.post("/api/portal/convite/:token", { publico: true }, async ({ params, corpo, res, ip }) => {
    limitar(`convite:${ip}`, 20);
    const p = porConvite(params.token) ?? falha(404, "Convite inválido ou vencido. Peça um novo ao escritório.");
    const d = validar(z.object({ senha }), await corpo());
    repo.rodar("UPDATE portal_usuarios SET senha_hash = ?, convite_hash = NULL, convite_expira = NULL WHERE id = ?", gerarHashSenha(d.senha), p.id);
    repo.auditar(p.empresa_id, p.nome, "portal_ativado", { email: p.email });
    abrir(res, p);
    return { ok: true };
  });
  r.post("/api/portal/entrar", { publico: true }, async ({ corpo, res, ip }) => {
    const d = validar(z.object({ email, senha: z.string().min(1).max(200) }), await corpo());
    limitar(`portal:${ip}`);
    limitar(`portal:${d.email}`);
    const p = repo.um("SELECT * FROM portal_usuarios WHERE email = ? AND ativo = 1", d.email);
    const ok = conferirSenha(d.senha, p?.senha_hash ?? HASH_FALSO);
    if (!p || !ok) falha(401, "E-mail ou senha incorretos.");
    abrir(res, p);
    return { ok: true };
  });
  r.post("/api/portal/sair", { publico: true }, ({ cookies, res }) => {
    if (cookies[COOKIE_PORTAL]) repo.encerrarSessao(sha256(cookies[COOKIE_PORTAL]));
    res.setHeader("Set-Cookie", `${COOKIE_PORTAL}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  r.get("/api/portal/eu", P, ({ portal }) => {
    const e = nucleo.empresa(portal.empresa_id);
    const c = portal.cliente;
    const n = (sql, ...p) => repo.um(sql, ...p).n;
    return {
      usuario: { nome: portal.nome, email: portal.email },
      ...(cfg.demo ? { demo: true } : {}),
      empresa: { nome: c.nome_fantasia || c.razao_social, cnpj: c.cnpj },
      escritorio: { nome: e.nome_fantasia || e.razao_social, cor: e.config.portal.cor, boas_vindas: e.config.portal.boas_vindas },
      contagem: { pendencias: n("SELECT COUNT(*) n FROM pendencias WHERE cliente_id = ? AND status = 'pendente'", c.id), guias: n("SELECT COUNT(*) n FROM entregas WHERE cliente_id = ? AND status != 'paga' AND tipo = 'guia'", c.id), chamados: n("SELECT COUNT(*) n FROM chamados WHERE cliente_id = ? AND status = 'respondido'", c.id) },
    };
  });
  r.put("/api/portal/senha", P, async ({ portal, corpo, cookies }) => {
    const d = validar(z.object({ atual: z.string().max(200), nova: senha }), await corpo());
    if (!conferirSenha(d.atual, portal.senha_hash)) falha(400, "Senha atual incorreta.");
    repo.rodar("UPDATE portal_usuarios SET senha_hash = ? WHERE id = ?", gerarHashSenha(d.nova), portal.id);
    repo.rodar("DELETE FROM sessoes WHERE portal_id = ? AND token_hash != ?", portal.id, sha256(cookies[COOKIE_PORTAL] ?? ""));
    return { ok: true };
  });

  r.get("/api/portal/pendencias", P, ({ portal }) => repo.lista("pendencias", "WHERE cliente_id = ? AND status != 'dispensado' ORDER BY status = 'pendente' DESC, CASE WHEN status = 'pendente' THEN prazo END ASC, prazo DESC LIMIT 60", portal.cliente.id).map(({ cobrancas, ultima_cobranca, ...p }) => p));
  r.get("/api/portal/documentos", P, ({ portal }) => repo.todos("SELECT id, nome, mime, tamanho, origem, competencia, status, motivo, criado_em FROM documentos WHERE cliente_id = ? ORDER BY criado_em DESC LIMIT 200", portal.cliente.id));
  r.post("/api/portal/documentos", P, async (ctx) => {
    const c = ctx.portal.cliente;
    const pendId = ctx.query.get("pendencia");
    const pend = pendId ? repo.obter("pendencias", c.empresa_id, pendId) : null;
    if (pendId && (!pend || pend.cliente_id !== c.id)) falha(404, "Pendência não encontrada.");
    const comp = ctx.query.get("competencia");
    const dados = await lerCorpo(ctx.req, cfg.limites.tamanhoArquivo + 1);
    const d = await nucleo.receberDocumento({ empresa_id: c.empresa_id, cliente_id: c.id, dados, mime: ctx.req.headers["content-type"], nome: nomeArquivo(ctx.req, "documento"), origem: "portal", enviado_por: ctx.portal.nome, competencia: competencia.safeParse(comp).success ? comp : null, pendencia_id: pend?.id ?? null });
    return { id: d.id, nome: d.nome };
  });

  r.get("/api/portal/entregas", P, ({ portal }) => repo.todos("SELECT id, titulo, tipo, competencia, vencimento, valor_centavos, status, criado_em FROM entregas WHERE cliente_id = ? ORDER BY criado_em DESC LIMIT 200", portal.cliente.id));
  r.get("/api/portal/entregas/:id/arquivo", P, async ({ portal, params, res }) => {
    const e = repo.obter("entregas", portal.empresa_id, params.id);
    if (!e || e.cliente_id !== portal.cliente.id) falha(404, "Arquivo não encontrado.");
    const a = await nucleo.lerArquivo(portal.empresa_id, e.arquivo_id);
    if (!a) falha(404, "Arquivo não encontrado.");
    if (e.status === "disponivel") repo.rodar("UPDATE entregas SET status = 'visualizada', visualizado_em = ? WHERE id = ?", agora(), e.id);
    enviarArquivo(res, { ...a, nome: `${e.titulo}${a.nome.includes(".") ? a.nome.slice(a.nome.lastIndexOf(".")) : ""}` });
  });
  r.post("/api/portal/entregas/:id/paga", P, ({ portal, params }) => {
    const e = repo.obter("entregas", portal.empresa_id, params.id);
    if (!e || e.cliente_id !== portal.cliente.id) falha(404, "Guia não encontrada.");
    if (e.tipo !== "guia") falha(400, "Só guias podem ser marcadas como pagas.");
    repo.rodar("UPDATE entregas SET status = 'paga', pago_em = ? WHERE id = ?", agora(), e.id);
    repo.auditar(portal.empresa_id, portal.nome, "guia_paga_portal", { entrega: e.id });
    return { ok: true };
  });

  r.get("/api/portal/chamados", P, ({ portal }) => repo.lista("chamados", "WHERE cliente_id = ? ORDER BY atualizado_em DESC LIMIT 100", portal.cliente.id));
  r.post("/api/portal/chamados", P, async ({ portal, corpo }) => {
    const d = validar(z.object({ assunto: t(140), texto: t(4000), departamento: z.enum(["fiscal", "contabil", "dp", "societario", "geral"]).optional() }), await corpo());
    return repo.inserir("chamados", { empresa_id: portal.empresa_id, cliente_id: portal.cliente.id, assunto: d.assunto, departamento: d.departamento ?? "geral", origem: "portal", mensagens: [{ de: "cliente", nome: portal.nome, texto: d.texto, em: agora() }] });
  });
  r.post("/api/portal/chamados/:id/mensagem", P, async ({ portal, params, corpo }) => {
    const h = repo.obter("chamados", portal.empresa_id, params.id);
    if (!h || h.cliente_id !== portal.cliente.id) falha(404, "Chamado não encontrado.");
    const d = validar(z.object({ texto: t(4000) }), await corpo());
    return repo.atualizar("chamados", portal.empresa_id, h.id, { mensagens: [...h.mensagens, { de: "cliente", nome: portal.nome, texto: d.texto, em: agora() }], status: "aberto" });
  });

  return { sessaoPortal };
}
