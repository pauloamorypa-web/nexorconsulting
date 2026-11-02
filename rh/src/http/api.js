/* API do Nexor RH. Três públicos, cada um com sua sessão:
   - Painel (RH, administradores e gestores): cookie nx_rh, papéis admin / rh / gestor
   - Aplicativo do trabalhador: cookie nx_app, ativado com CPF + código de convite
   - Quiosque (tablet na entrada): token próprio do estabelecimento, mostra o QR Code rotativo
   Toda consulta usa a empresa da sessão: uma empresa nunca vê dados de outra. */

import { z } from "zod";
import { cnpjValido, email, empresaPublica, op, senha, t, usuarioPublico, validar } from "./validacao.js";
import { conferirSenha, gerarHashSenha, gerarToken, sha256 } from "../seguranca.js";
import { configCompleta } from "../servicos/nucleo.js";
import { rotasApp } from "./rotas-app.js";
import { rotasCadastros } from "./rotas-cadastros.js";
import { rotasEsocial } from "./rotas-esocial.js";
import { rotasFolha } from "./rotas-folha.js";
import { rotasPessoas } from "./rotas-pessoas.js";
import { rotasPonto } from "./rotas-ponto.js";
import { criarRoteador, falha } from "./roteador.js";

export * from "./validacao.js";
import { COOKIE_APP, COOKIE_PAINEL } from "./validacao.js";

/**
 * @param {object} d
 * @param {ReturnType<import('../db.js').abrirBanco>} d.repo
 * @param {ReturnType<import('../servicos/nucleo.js').criarNucleo>} d.nucleo
 */
export function criarApi({ repo, nucleo, cofre, cfg, eventos, agora = () => Date.now(), fetchSoap }) {
  const r = criarRoteador();
  const tentativas = new Map();

  function limitar(chave, maximo = cfg.limites.tentativasLogin, janelaMs = 15 * 60_000) {
    const t0 = agora();
    const lista = (tentativas.get(chave) ?? []).filter((x) => t0 - x < janelaMs);
    if (lista.length >= maximo) falha(429, "Muitas tentativas. Aguarde alguns minutos.");
    lista.push(t0);
    tentativas.set(chave, lista);
    if (tentativas.size > 20_000) tentativas.delete(tentativas.keys().next().value);
  }

  function cookie(res, nome, token, dias) {
    const a = [`${nome}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${dias * 86400}`];
    if (cfg.producao) a.push("Secure");
    const atual = res.getHeader("Set-Cookie");
    res.setHeader("Set-Cookie", [...(Array.isArray(atual) ? atual : atual ? [atual] : []), a.join("; ")]);
  }

  function iniciarSessao(res, { usuario_id, colaborador_id }) {
    const token = gerarToken();
    const dias = colaborador_id ? cfg.sessaoAppDias : cfg.sessaoDias;
    repo.criarSessao(sha256(token), { usuario_id, colaborador_id }, dias);
    cookie(res, colaborador_id ? COOKIE_APP : COOKIE_PAINEL, token, dias);
  }

  /** Usuário do painel da sessão (ou null) */
  function sessaoPainel(cookies) {
    const s = cookies[COOKIE_PAINEL] ? repo.sessao(sha256(cookies[COOKIE_PAINEL])) : null;
    if (!s?.usuario_id) return null;
    const u = repo.obter("usuarios", null, s.usuario_id);
    return u?.ativo ? u : null;
  }

  /** Colaborador da sessão do aplicativo (ou null). A sessão é renovada a cada uso. */
  function sessaoApp(cookies) {
    const token = cookies[COOKIE_APP];
    const s = token ? repo.sessao(sha256(token)) : null;
    if (!s?.colaborador_id) return null;
    const c = repo.obter("colaboradores", null, s.colaborador_id);
    if (!c || c.status === "desligado") return null;
    if (s.expira_em - agora() < (cfg.sessaoAppDias - 1) * 86400_000) repo.renovarSessao(s.token_hash, cfg.sessaoAppDias);
    return c;
  }

  /** Colaboradores que o usuário pode ver: gestor vê só o próprio departamento */
  function filtroEquipe(usuario) {
    if (usuario.papel !== "gestor") return { sql: "", params: [] };
    const deps = repo.todos("SELECT id FROM departamentos WHERE empresa_id = ? AND (gestor_id = ? OR id = ?)", usuario.empresa_id, usuario.id, usuario.departamento_id ?? "").map((d) => d.id);
    if (!deps.length) return { sql: " AND 0", params: [] };
    return { sql: ` AND departamento_id IN (${deps.map(() => "?").join(",")})`, params: deps };
  }
  function exigirColaborador(ctx, id) {
    const c = repo.obter("colaboradores", ctx.empresa.id, id);
    if (!c) falha(404, "Colaborador não encontrado.");
    const f = filtroEquipe(ctx.usuario);
    if (f.sql && !repo.um(`SELECT 1 FROM colaboradores WHERE id = ?${f.sql}`, id, ...f.params)) falha(403, "Este colaborador não é da sua equipe.");
    return c;
  }

  const auditar = (ctx, acao, detalhe) => repo.auditar(ctx.empresa.id, ctx.usuario?.nome ?? ctx.colaborador?.nome ?? "sistema", acao, detalhe);
  const aviso = (empresa_id, tipo, dados) => eventos?.emitir(empresa_id, tipo, dados);

  /** Endereço público (QR Code, links do aplicativo, WebAuthn) */
  function base(req) {
    if (cfg.urlPublica) return cfg.urlPublica;
    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? `localhost:${cfg.porta}`;
    const proto = req.headers["x-forwarded-proto"] ?? (req.socket.encrypted ? "https" : "http");
    return `${proto}://${host}`;
  }

  /* ---------- Login do painel ---------- */

  r.get("/api/estado", { publico: true }, ({ cookies }) => ({ primeiroAcesso: repo.contarUsuarios() === 0, cadastroAberto: cfg.permitirCadastro, logado: Boolean(sessaoPainel(cookies)) }));

  r.post("/api/cadastro", { publico: true }, async ({ corpo, res, ip }) => {
    if (repo.contarUsuarios() > 0 && !cfg.permitirCadastro) falha(403, "O cadastro de novas empresas está fechado. Peça um convite ao administrador.");
    limitar(`cadastro:${ip}`);
    const d = validar(z.object({ razao_social: t(150), nome_fantasia: op(150), cnpj: z.string().transform((v) => v.replace(/\D/g, "")).refine(cnpjValido, "CNPJ inválido"), nome: t(120), email, senha }), await corpo());
    if (repo.usuarioPorEmail(d.email)) falha(409, "Já existe uma conta com este e-mail.");
    const usuario = repo.transacao(() => {
      const emp = repo.inserir("empresas", { razao_social: d.razao_social, nome_fantasia: d.nome_fantasia, cnpj: d.cnpj, config: {} });
      repo.inserir("estabelecimentos", { empresa_id: emp.id, nome: d.nome_fantasia || "Matriz", cnpj: d.cnpj, qr_segredo: gerarToken(32) });
      repo.inserir("jornadas", { empresa_id: emp.id, nome: "Comercial 44h (seg a sex 8h48)", tipo: "semanal", dias: Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, { entrada: "08:00", saida: "17:48", intervalo_min: 60 }])), horas_semanais: 44 });
      repo.inserir("jornadas", { empresa_id: emp.id, nome: "Escala 12x36 (7h às 19h)", tipo: "escala", escala: { trabalha: 1, folga: 1, entrada: "07:00", saida: "19:00", intervalo_min: 60, inicio: new Date(agora()).toISOString().slice(0, 10) }, horas_semanais: 42 });
      for (const nome of ["Administrativo", "Operacional", "Comercial"]) repo.inserir("departamentos", { empresa_id: emp.id, nome });
      return repo.inserir("usuarios", { empresa_id: emp.id, nome: d.nome, email: d.email, senha_hash: gerarHashSenha(d.senha), papel: "admin" });
    });
    repo.auditar(usuario.empresa_id, usuario.nome, "conta_criada");
    iniciarSessao(res, { usuario_id: usuario.id });
    return { ok: true };
  });

  r.post("/api/entrar", { publico: true }, async ({ corpo, res, ip }) => {
    const d = validar(z.object({ email, senha: z.string().min(1).max(200) }), await corpo());
    limitar(`login:${ip}`);
    limitar(`login:${d.email}`);
    const u = repo.usuarioPorEmail(d.email);
    if (!u || !conferirSenha(d.senha, u.senha_hash)) falha(401, "E-mail ou senha incorretos.");
    iniciarSessao(res, { usuario_id: u.id });
    repo.auditar(u.empresa_id, u.nome, "login");
    return { ok: true };
  });

  r.post("/api/sair", { publico: true }, ({ cookies, res }) => {
    if (cookies[COOKIE_PAINEL]) repo.encerrarSessao(sha256(cookies[COOKIE_PAINEL]));
    res.setHeader("Set-Cookie", `${COOKIE_PAINEL}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  r.get("/api/eu", ({ usuario, empresa }) => {
    const pend = (sql, ...p) => repo.um(sql, ...p).n;
    return {
      usuario: usuarioPublico(usuario),
      empresa: empresaPublica(empresa),
      contagem: {
        ajustes: pend("SELECT COUNT(*) n FROM ajustes WHERE empresa_id = ? AND status = 'pendente'", empresa.id),
        ferias: pend("SELECT COUNT(*) n FROM ferias WHERE empresa_id = ? AND status = 'solicitada'", empresa.id),
        afastamentos: pend("SELECT COUNT(*) n FROM afastamentos WHERE empresa_id = ? AND status = 'pendente'", empresa.id),
        esocial: pend("SELECT COUNT(*) n FROM esocial_eventos WHERE empresa_id = ? AND status IN ('gerado','assinado','erro')", empresa.id),
        candidatos: pend("SELECT COUNT(*) n FROM candidatos WHERE empresa_id = ? AND etapa = 'triagem'", empresa.id),
      },
    };
  });

  r.put("/api/eu", async ({ corpo, usuario }) => {
    const d = validar(z.object({ nome: op(120), senha: senha.optional(), senha_atual: z.string().max(200).optional() }), await corpo());
    if (d.senha && !conferirSenha(d.senha_atual ?? "", usuario.senha_hash)) falha(400, "Senha atual incorreta.");
    return usuarioPublico(repo.atualizar("usuarios", null, usuario.id, { nome: d.nome || undefined, senha_hash: d.senha ? gerarHashSenha(d.senha) : undefined }));
  });

  const deps = { r, repo, nucleo, cofre, cfg, agora, limitar, iniciarSessao, sessaoApp, filtroEquipe, exigirColaborador, auditar, aviso, base, fetchSoap, configCompleta };
  rotasCadastros(deps);
  rotasPonto(deps);
  rotasFolha(deps);
  rotasPessoas(deps);
  rotasEsocial(deps);
  rotasApp(deps);

  return { roteador: r, sessaoPainel, sessaoApp };
}
