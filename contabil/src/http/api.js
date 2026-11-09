/* API do painel do escritório (cookie nx_contabil). Papéis: dono e admin (tudo), equipe (o dia a dia, sem as
   configurações). Toda consulta usa o escritório da sessão. */

import { z } from "zod";
import { DEPARTAMENTOS, REGIMES } from "../regras/catalogo.js";
import { competenciaAnterior, diasEntre, hojeBR, somarDias } from "../regras/datas.js";
import { gerarPendencias, gerarTarefas, prazoInterno, prazoLegal, semearEscritorio, semearEsperados } from "../regras/geracao.js";
import { TIPOS_DOCUMENTO } from "../ia/leitura.js";
import { conferirSenha, gerarHashSenha, gerarToken, iguais, precisaRefazerHash, sha256 } from "../seguranca.js";
import { CATALOGO, chaveValida } from "../nexor/politica.js";
import { criarLimites } from "./limite.js";
import { criarRoteador, falha, lerCorpo } from "./roteador.js";
import { COOKIE_PAINEL, centavos, competencia, data, documentoFiscal, email, enviarArquivo, escritorioPublico, fone, nomeArquivo, op, portalPublico, senha, t, usuarioPublico, validar } from "./validacao.js";
import { rotasPortal } from "./portal.js";

const ADM = { papeis: ["dono", "admin"] };
const DEP = z.enum(Object.keys(DEPARTAMENTOS));
const ESQ_CLIENTE = z.object({
  razao_social: t(150),
  nome_fantasia: op(150),
  cnpj: documentoFiscal,
  regime: z.enum(Object.keys(REGIMES)),
  municipio: op(80),
  uf: z.string().trim().toUpperCase().length(2).optional().nullable(),
  contato_nome: op(120),
  whatsapp: fone,
  email: email.optional().nullable().or(z.literal("").transform(() => null)),
  tem_funcionarios: z.boolean().optional(),
  contribuinte_icms: z.boolean().optional(),
  presta_servico: z.boolean().optional(),
  responsavel_id: op(40),
  honorario_centavos: centavos.optional().nullable(),
  cobrar: z.boolean().optional(),
  ativo: z.boolean().optional(),
  observacoes: op(2000),
});

export function criarApi({ repo, nucleo, cofre, cfg, central, agora = () => Date.now() }) {
  const r = criarRoteador();
  // Limite de tentativas em memória (processo único): 429 com Retry-After quando estoura
  const limites = criarLimites({ agora });
  const HASH_FALSO = gerarHashSenha(gerarToken());
  const hoje = () => hojeBR(agora());

  const limitar = (chave, maximo = cfg.limites.tentativasLogin, janela = 15 * 60_000) => limites.contar(chave, maximo, janela);
  function cookie(res, nome, token, dias) {
    const a = [`${nome}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.round(dias * 86400)}`];
    if (cfg.producao) a.push("Secure");
    const atual = res.getHeader("Set-Cookie");
    res.setHeader("Set-Cookie", [...(Array.isArray(atual) ? atual : atual ? [atual] : []), a.join("; ")]);
  }
  function iniciarSessao(res, usuario_id, dias = cfg.sessaoDias) {
    const token = gerarToken();
    repo.criarSessao(sha256(token), { usuario_id }, dias);
    cookie(res, COOKIE_PAINEL, token, dias);
  }
  function sessaoPainel(cookies) {
    const s = cookies[COOKIE_PAINEL] ? repo.sessao(sha256(cookies[COOKIE_PAINEL])) : null;
    if (!s?.usuario_id) return null;
    const u = repo.obter("usuarios", null, s.usuario_id);
    return u?.ativo ? u : null;
  }
  const auditar = (ctx, acao, detalhe) => repo.auditar(ctx.empresa.id, ctx.usuario?.nome ?? "sistema", acao, detalhe);
  const exigir = (tabela, ctx, id, rotulo) => repo.obter(tabela, ctx.empresa.id, id) ?? falha(404, `${rotulo} não encontrado.`);

  /* ---------- Login ---------- */
  const exigeCodigo = () => repo.contarUsuarios() === 0 && Boolean(cfg.codigoInstalacao);
  r.get("/api/estado", { publico: true }, ({ cookies }) => ({ primeiroAcesso: repo.contarUsuarios() === 0, exigeCodigo: exigeCodigo(), logado: Boolean(sessaoPainel(cookies)) }));

  r.post("/api/cadastro", { publico: true }, async ({ corpo, res, ip }) => {
    if (repo.contarUsuarios() > 0) falha(403, "Este sistema já tem um escritório. Peça um convite ao administrador.");
    limitar(`cadastro:${ip}`);
    const b = await corpo();
    if (exigeCodigo() && !iguais(String(b?.codigo_instalacao ?? "").trim(), cfg.codigoInstalacao)) falha(403, "Código de instalação incorreto. Ele está no arquivo codigo-instalacao.txt do servidor ou com a Nexor.");
    const d = validar(z.object({ razao_social: t(150), nome_fantasia: op(150), cnpj: documentoFiscal, nome: t(120), email, senha }), b);
    const u = repo.transacao(() => {
      const e = repo.inserir("empresas", { razao_social: d.razao_social, nome_fantasia: d.nome_fantasia, cnpj: d.cnpj, config: {} });
      semearEscritorio(repo, e.id);
      return repo.inserir("usuarios", { empresa_id: e.id, nome: d.nome, email: d.email, senha_hash: gerarHashSenha(d.senha), papel: "dono" });
    });
    repo.auditar(u.empresa_id, u.nome, "conta_criada");
    iniciarSessao(res, u.id);
    return { ok: true };
  });

  r.post("/api/entrar", { publico: true }, async ({ corpo, res, ip }) => {
    const d = validar(z.object({ email, senha: z.string().min(1).max(200) }), await corpo());
    const tentativa = limites.tentativa("login", { ip, conta: d.email }, cfg.limites.login);
    const u = repo.usuarioPorEmail(d.email);
    const ok = conferirSenha(d.senha, u?.senha_hash ?? HASH_FALSO);
    if (!u || !ok) {
      tentativa.falhou();
      falha(401, "E-mail ou senha incorretos.");
    }
    tentativa.acertou();
    if (precisaRefazerHash(u.senha_hash)) repo.rodar("UPDATE usuarios SET senha_hash = ? WHERE id = ?", gerarHashSenha(d.senha), u.id);
    iniciarSessao(res, u.id);
    repo.auditar(u.empresa_id, u.nome, "login");
    return { ok: true };
  });
  r.post("/api/sair", { publico: true }, ({ cookies, res }) => {
    if (cookies[COOKIE_PAINEL]) repo.encerrarSessao(sha256(cookies[COOKIE_PAINEL]));
    res.setHeader("Set-Cookie", `${COOKIE_PAINEL}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  r.get("/api/eu", ({ usuario, empresa }) => {
    const n = (sql, ...p) => repo.um(sql, ...p).n;
    const lic = central.estado();
    return {
      usuario: usuarioPublico(usuario),
      escritorio: escritorioPublico(empresa),
      licenca: { situacao: lic.situacao, mensagem: lic.mensagem, link: lic.link, contato: lic.contato, vinculado: central.configurada },
      ocultos: repo.ocultos(empresa.id),
      ia: Boolean(nucleo.temIA),
      catalogos: { departamentos: DEPARTAMENTOS, regimes: REGIMES, tipos: TIPOS_DOCUMENTO },
      contagem: {
        documentos: n("SELECT COUNT(*) n FROM documentos WHERE empresa_id = ? AND status = 'novo'", empresa.id),
        tarefas: n("SELECT COUNT(*) n FROM tarefas WHERE empresa_id = ? AND status IN ('a_fazer','em_andamento') AND prazo_interno <= ?", empresa.id, hoje()),
        chamados: n("SELECT COUNT(*) n FROM chamados WHERE empresa_id = ? AND status = 'aberto'", empresa.id),
      },
    };
  });
  r.put("/api/eu", async ({ corpo, usuario, cookies }) => {
    const d = validar(z.object({ nome: op(120), senha: senha.optional(), senha_atual: z.string().max(200).optional() }), await corpo());
    if (d.senha && !conferirSenha(d.senha_atual ?? "", usuario.senha_hash)) falha(400, "Senha atual incorreta.");
    if (d.senha) repo.rodar("DELETE FROM sessoes WHERE usuario_id = ? AND token_hash != ?", usuario.id, sha256(cookies[COOKIE_PAINEL] ?? ""));
    return usuarioPublico(repo.atualizar("usuarios", null, usuario.id, { nome: d.nome || undefined, senha_hash: d.senha ? gerarHashSenha(d.senha) : undefined }));
  });

  /* ---------- Visão geral ---------- */
  r.get("/api/painel", ({ empresa }) => {
    const id = empresa.id;
    const h = hoje();
    const n = (sql, ...p) => repo.um(sql, ...p).n;
    // O mês que o escritório está fechando: a competência anterior (as variáveis de folha do mês atual ficam fora)
    const comp = competenciaAnterior(h);
    const totalPend = n("SELECT COUNT(*) n FROM pendencias WHERE empresa_id = ? AND competencia = ? AND status != 'dispensado'", id, comp);
    const recebidas = n("SELECT COUNT(*) n FROM pendencias WHERE empresa_id = ? AND competencia = ? AND status = 'recebido'", id, comp);
    return {
      hoje: h,
      competencia: comp,
      clientes: n("SELECT COUNT(*) n FROM clientes WHERE empresa_id = ? AND ativo = 1", id),
      documentos: { recebidos_mes: n("SELECT COUNT(*) n FROM documentos WHERE empresa_id = ? AND criado_em >= ?", id, Date.parse(`${h.slice(0, 7)}-01T00:00:00-03:00`)), a_conferir: n("SELECT COUNT(*) n FROM documentos WHERE empresa_id = ? AND status = 'novo'", id), sem_cliente: n("SELECT COUNT(*) n FROM documentos WHERE empresa_id = ? AND cliente_id IS NULL AND status = 'novo'", id) },
      pendencias: { total: totalPend, recebidas, atrasadas: n("SELECT COUNT(*) n FROM pendencias WHERE empresa_id = ? AND status = 'pendente' AND prazo < ?", id, h) },
      tarefas: {
        atrasadas: n("SELECT COUNT(*) n FROM tarefas WHERE empresa_id = ? AND status IN ('a_fazer','em_andamento') AND prazo_legal < ?", id, h),
        hoje: n("SELECT COUNT(*) n FROM tarefas WHERE empresa_id = ? AND status IN ('a_fazer','em_andamento') AND prazo_interno <= ? AND prazo_legal >= ?", id, h, h),
        semana: n("SELECT COUNT(*) n FROM tarefas WHERE empresa_id = ? AND status IN ('a_fazer','em_andamento') AND prazo_interno > ? AND prazo_interno <= ?", id, h, somarDias(h, 7)),
        concluidas_mes: n("SELECT COUNT(*) n FROM tarefas WHERE empresa_id = ? AND status = 'concluida' AND concluida_em >= ?", id, Date.parse(`${h.slice(0, 7)}-01T00:00:00-03:00`)),
      },
      chamados: n("SELECT COUNT(*) n FROM chamados WHERE empresa_id = ? AND status = 'aberto'", id),
      proximas: repo.todos("SELECT t.*, COALESCE(c.nome_fantasia, c.razao_social) cliente FROM tarefas t JOIN clientes c ON c.id = t.cliente_id WHERE t.empresa_id = ? AND t.status IN ('a_fazer','em_andamento') ORDER BY t.prazo_interno LIMIT 10", id),
      piores: repo.todos("SELECT c.id, COALESCE(c.nome_fantasia, c.razao_social) cliente, COUNT(*) faltando, MIN(p.prazo) desde FROM pendencias p JOIN clientes c ON c.id = p.cliente_id WHERE p.empresa_id = ? AND p.status = 'pendente' AND p.prazo < ? GROUP BY c.id ORDER BY faltando DESC, desde LIMIT 8", id, h),
    };
  });

  /* ---------- Clientes ---------- */
  r.get("/api/clientes", ({ empresa, query }) => {
    const busca = `%${(query.get("q") ?? "").trim().toLowerCase()}%`;
    const h = hoje();
    return repo
      .todos(
        `SELECT c.*,
           (SELECT COUNT(*) FROM pendencias p WHERE p.cliente_id = c.id AND p.status = 'pendente') pendentes,
           (SELECT COUNT(*) FROM pendencias p WHERE p.cliente_id = c.id AND p.status = 'pendente' AND p.prazo < ?) atrasadas,
           (SELECT COUNT(*) FROM documentos d WHERE d.cliente_id = c.id AND d.status = 'novo') a_conferir,
           (SELECT COUNT(*) FROM tarefas t WHERE t.cliente_id = c.id AND t.status IN ('a_fazer','em_andamento') AND t.prazo_legal < ?) tarefas_atrasadas
         FROM clientes c WHERE c.empresa_id = ? AND (lower(c.razao_social) LIKE ? OR lower(COALESCE(c.nome_fantasia,'')) LIKE ? OR c.cnpj LIKE ?) ORDER BY c.ativo DESC, COALESCE(c.nome_fantasia, c.razao_social)`,
        h,
        h,
        empresa.id,
        busca,
        busca,
        busca,
      )
      .map((c) => repo.ler("clientes", c));
  });
  r.post("/api/clientes", async (ctx) => {
    const d = validar(ESQ_CLIENTE, await ctx.corpo());
    if (repo.um("SELECT 1 FROM clientes WHERE empresa_id = ? AND cnpj = ?", ctx.empresa.id, d.cnpj)) falha(409, "Já existe um cliente com este CNPJ.");
    if (d.responsavel_id) exigir("usuarios", ctx, d.responsavel_id, "Responsável");
    const c = repo.transacao(() => {
      const novo = repo.inserir("clientes", { ...d, empresa_id: ctx.empresa.id });
      semearEsperados(repo, novo);
      return novo;
    });
    gerarPendencias(repo, ctx.empresa.id, hoje(), { cliente_id: c.id });
    gerarTarefas(repo, ctx.empresa.id, hoje(), { cliente_id: c.id });
    auditar(ctx, "cliente_criado", { cliente: c.id, cnpj: c.cnpj });
    return c;
  });
  r.get("/api/clientes/:id", (ctx) => {
    const c = exigir("clientes", ctx, ctx.params.id, "Cliente");
    return {
      ...c,
      esperados: repo.lista("esperados", "WHERE empresa_id = ? AND cliente_id = ? ORDER BY ativo DESC, nome", ctx.empresa.id, c.id),
      portal: repo.lista("portal_usuarios", "WHERE empresa_id = ? AND cliente_id = ? ORDER BY nome", ctx.empresa.id, c.id).map(portalPublico),
      envios: repo.lista("envios", "WHERE empresa_id = ? AND cliente_id = ? ORDER BY criado_em DESC LIMIT 20", ctx.empresa.id, c.id),
    };
  });
  r.put("/api/clientes/:id", async (ctx) => {
    const c = exigir("clientes", ctx, ctx.params.id, "Cliente");
    const d = validar(ESQ_CLIENTE.partial(), await ctx.corpo());
    if (d.cnpj && d.cnpj !== c.cnpj && repo.um("SELECT 1 FROM clientes WHERE empresa_id = ? AND cnpj = ?", ctx.empresa.id, d.cnpj)) falha(409, "Já existe um cliente com este CNPJ.");
    if (d.responsavel_id) exigir("usuarios", ctx, d.responsavel_id, "Responsável");
    auditar(ctx, "cliente_alterado", { cliente: c.id });
    return repo.atualizar("clientes", ctx.empresa.id, c.id, d);
  });
  // Gera (de novo, sem duplicar) as pendências e as tarefas de uma competência
  r.post("/api/clientes/:id/gerar", async (ctx) => {
    const c = exigir("clientes", ctx, ctx.params.id, "Cliente");
    const d = validar(z.object({ competencia }), await ctx.corpo());
    return { pendencias: gerarPendencias(repo, ctx.empresa.id, hoje(), { competencia: d.competencia, cliente_id: c.id }), tarefas: gerarTarefas(repo, ctx.empresa.id, hoje(), { competencia: d.competencia, cliente_id: c.id }) };
  });

  // Documentos esperados do cliente (a lista que vira cobrança todo mês)
  const ESQ_ESPERADO = z.object({ nome: t(160), tipo: z.enum(["extrato", "notas_entrada", "notas_saida", "comprovantes", "faturamento", "folha", "estoque", "outro"]), dia_limite: z.number().int().min(1).max(31), departamento: DEP, ativo: z.boolean().optional() });
  r.post("/api/clientes/:id/esperados", async (ctx) => {
    const c = exigir("clientes", ctx, ctx.params.id, "Cliente");
    return repo.inserir("esperados", { ...validar(ESQ_ESPERADO, await ctx.corpo()), empresa_id: ctx.empresa.id, cliente_id: c.id });
  });
  r.put("/api/esperados/:id", async (ctx) => repo.atualizar("esperados", ctx.empresa.id, exigir("esperados", ctx, ctx.params.id, "Documento esperado").id, validar(ESQ_ESPERADO.partial(), await ctx.corpo())));
  r.delete("/api/esperados/:id", (ctx) => ({ ok: repo.remover("esperados", ctx.empresa.id, exigir("esperados", ctx, ctx.params.id, "Documento esperado").id) }));

  // Acesso do cliente ao portal: convite com link de uso único (7 dias)
  function convite(ctx, p) {
    const token = gerarToken(24);
    repo.atualizar("portal_usuarios", ctx.empresa.id, p.id, { convite_hash: sha256(token), convite_expira: agora() + 7 * 86400_000 });
    const base = cfg.urlPublica || `${ctx.req.headers["x-forwarded-proto"] ?? "http"}://${ctx.req.headers.host}`;
    return { link: `${base}/portal/#/convite/${token}`, expira_em: agora() + 7 * 86400_000 };
  }
  r.post("/api/clientes/:id/portal", async (ctx) => {
    const c = exigir("clientes", ctx, ctx.params.id, "Cliente");
    const d = validar(z.object({ nome: t(120), email, whatsapp: fone }), await ctx.corpo());
    if (repo.um("SELECT 1 FROM portal_usuarios WHERE empresa_id = ? AND email = ?", ctx.empresa.id, d.email)) falha(409, "Este e-mail já tem acesso ao portal.");
    const p = repo.inserir("portal_usuarios", { empresa_id: ctx.empresa.id, cliente_id: c.id, nome: d.nome, email: d.email, whatsapp: d.whatsapp || null });
    auditar(ctx, "portal_convidado", { cliente: c.id, email: d.email });
    return { usuario: portalPublico(repo.obter("portal_usuarios", ctx.empresa.id, p.id)), ...convite(ctx, p) };
  });
  r.post("/api/portal-usuarios/:id/convite", (ctx) => {
    const p = exigir("portal_usuarios", ctx, ctx.params.id, "Acesso");
    repo.rodar("DELETE FROM sessoes WHERE portal_id = ?", p.id);
    repo.atualizar("portal_usuarios", ctx.empresa.id, p.id, { senha_hash: null });
    auditar(ctx, "portal_novo_convite", { email: p.email });
    return convite(ctx, p);
  });
  r.put("/api/portal-usuarios/:id", async (ctx) => {
    const p = exigir("portal_usuarios", ctx, ctx.params.id, "Acesso");
    const d = validar(z.object({ nome: op(120), whatsapp: fone, ativo: z.boolean().optional() }), await ctx.corpo());
    if (d.ativo === false) repo.rodar("DELETE FROM sessoes WHERE portal_id = ?", p.id);
    return portalPublico(repo.atualizar("portal_usuarios", ctx.empresa.id, p.id, { ...d, whatsapp: d.whatsapp === undefined ? undefined : d.whatsapp || null }));
  });

  /* ---------- Documentos ---------- */
  const comCliente = "SELECT d.*, COALESCE(c.nome_fantasia, c.razao_social) cliente FROM documentos d LEFT JOIN clientes c ON c.id = d.cliente_id";
  r.get("/api/documentos", ({ empresa, query }) => {
    const cond = ["d.empresa_id = ?"];
    const p = [empresa.id];
    if (query.get("status")) cond.push("d.status = ?"), p.push(query.get("status"));
    if (query.get("cliente")) cond.push("d.cliente_id = ?"), p.push(query.get("cliente"));
    if (query.get("sem_cliente")) cond.push("d.cliente_id IS NULL");
    if (/^\d{4}-\d{2}$/.test(query.get("competencia") ?? "")) cond.push("d.competencia = ?"), p.push(query.get("competencia"));
    if (query.get("alertas")) cond.push("d.alertas != '[]'");
    return repo.todos(`${comCliente} WHERE ${cond.join(" AND ")} ORDER BY d.criado_em DESC LIMIT 300`, ...p).map((d) => repo.ler("documentos", d));
  });
  r.post("/api/documentos", async (ctx) => {
    const cliente = ctx.query.get("cliente") ? exigir("clientes", ctx, ctx.query.get("cliente"), "Cliente") : null;
    const comp = ctx.query.get("competencia");
    const pend = ctx.query.get("pendencia") ? exigir("pendencias", ctx, ctx.query.get("pendencia"), "Pendência") : null;
    if (pend && pend.cliente_id !== cliente?.id) falha(400, "A pendência é de outro cliente.");
    const dados = await lerCorpo(ctx.req, cfg.limites.tamanhoArquivo + 1);
    return nucleo.receberDocumento({ empresa_id: ctx.empresa.id, cliente_id: cliente?.id ?? null, dados, mime: ctx.req.headers["content-type"], nome: nomeArquivo(ctx.req, "documento"), origem: "equipe", enviado_por: ctx.usuario.nome, competencia: /^\d{4}-\d{2}$/.test(comp ?? "") ? comp : null, pendencia_id: pend?.id ?? null });
  });
  r.get("/api/documentos/:id", (ctx) => {
    const d = repo.ler("documentos", repo.um(`${comCliente} WHERE d.id = ? AND d.empresa_id = ?`, ctx.params.id, ctx.empresa.id)) ?? falha(404, "Documento não encontrado.");
    return { ...d, lancamentos: repo.lista("lancamentos", "WHERE empresa_id = ? AND documento_id = ? ORDER BY data, valor_centavos", ctx.empresa.id, d.id), pendencias: d.cliente_id ? repo.lista("pendencias", "WHERE empresa_id = ? AND cliente_id = ? AND (status = 'pendente' OR id = ?) ORDER BY prazo DESC LIMIT 30", ctx.empresa.id, d.cliente_id, d.pendencia_id ?? "") : [] };
  });
  r.get("/api/documentos/:id/arquivo", async (ctx) => {
    const d = exigir("documentos", ctx, ctx.params.id, "Documento");
    const a = await nucleo.lerArquivo(ctx.empresa.id, d.arquivo_id);
    if (!a) falha(404, "Arquivo não encontrado.");
    enviarArquivo(ctx.res, { ...a, nome: d.nome, mime: d.mime }, { baixar: ctx.query.get("baixar") === "1" });
  });
  r.post("/api/documentos/:id/ler", async (ctx) => {
    const d = exigir("documentos", ctx, ctx.params.id, "Documento");
    if (!d.cliente_id) falha(400, "Escolha o cliente do documento antes de ler.");
    if (!nucleo.temIA) falha(400, "A IA não está configurada neste servidor (ANTHROPIC_API_KEY).");
    repo.atualizar("documentos", ctx.empresa.id, d.id, { leitura_status: "pendente" });
    nucleo.enfileirarLeitura(ctx.empresa.id, d.id);
    return { ok: true };
  });
  r.put("/api/documentos/:id", async (ctx) => {
    const d = exigir("documentos", ctx, ctx.params.id, "Documento");
    const b = validar(z.object({ cliente_id: op(40), competencia: competencia.optional().nullable(), tipo: z.enum(Object.keys(TIPOS_DOCUMENTO)).optional(), pendencia_id: op(40) }), await ctx.corpo());
    if (b.cliente_id) exigir("clientes", ctx, b.cliente_id, "Cliente");
    const novo = repo.atualizar("documentos", ctx.empresa.id, d.id, { cliente_id: b.cliente_id ?? undefined, competencia: b.competencia ?? undefined, tipo: b.tipo });
    if (b.pendencia_id) {
      if (!nucleo.marcarPendencia(ctx.empresa.id, b.pendencia_id, d.id, novo.cliente_id)) falha(400, "Pendência inválida para este cliente.");
    }
    // Cliente definido agora (veio de número desconhecido no WhatsApp): lê com a IA
    if (b.cliente_id && !d.cliente_id && nucleo.temIA && ["sem_ia", "pendente"].includes(d.leitura_status)) {
      repo.atualizar("documentos", ctx.empresa.id, d.id, { leitura_status: "pendente" });
      nucleo.enfileirarLeitura(ctx.empresa.id, d.id);
    }
    auditar(ctx, "documento_alterado", { documento: d.id });
    return repo.obter("documentos", ctx.empresa.id, d.id);
  });
  // Conferido: os lançamentos sugeridos viram aprovados (prontos para exportar)
  r.post("/api/documentos/:id/conferir", (ctx) => {
    const d = exigir("documentos", ctx, ctx.params.id, "Documento");
    if (!d.cliente_id) falha(400, "Escolha o cliente do documento.");
    repo.rodar("UPDATE lancamentos SET status = 'aprovado', atualizado_em = ? WHERE documento_id = ? AND status = 'sugerido'", agora(), d.id);
    auditar(ctx, "documento_conferido", { documento: d.id });
    return repo.atualizar("documentos", ctx.empresa.id, d.id, { status: "conferido", conferido_por: ctx.usuario.nome, conferido_em: agora() });
  });
  r.post("/api/documentos/:id/rejeitar", async (ctx) => {
    const d = exigir("documentos", ctx, ctx.params.id, "Documento");
    const b = validar(z.object({ motivo: t(300), reabrir_pendencia: z.boolean().optional() }), await ctx.corpo());
    repo.rodar("DELETE FROM lancamentos WHERE documento_id = ? AND status != 'exportado'", d.id);
    if (b.reabrir_pendencia !== false && d.pendencia_id) repo.rodar("UPDATE pendencias SET status = 'pendente', documento_id = NULL, recebido_em = NULL WHERE id = ? AND empresa_id = ?", d.pendencia_id, ctx.empresa.id);
    auditar(ctx, "documento_rejeitado", { documento: d.id, motivo: b.motivo });
    return repo.atualizar("documentos", ctx.empresa.id, d.id, { status: "rejeitado", motivo: b.motivo, conferido_por: ctx.usuario.nome, conferido_em: agora() });
  });

  /* ---------- Lançamentos ---------- */
  const ESQ_LANC = z.object({ data, debito: t(120), credito: t(120), valor_centavos: centavos.refine((v) => v > 0, "valor maior que zero"), historico: t(200) });
  r.get("/api/lancamentos", ({ empresa, query }) => {
    const cond = ["l.empresa_id = ?"];
    const p = [empresa.id];
    if (query.get("cliente")) cond.push("l.cliente_id = ?"), p.push(query.get("cliente"));
    if (/^\d{4}-\d{2}$/.test(query.get("competencia") ?? "")) cond.push("l.competencia = ?"), p.push(query.get("competencia"));
    if (query.get("status")) cond.push("l.status = ?"), p.push(query.get("status"));
    return repo.todos(`SELECT l.*, d.nome documento_nome, COALESCE(c.nome_fantasia, c.razao_social) cliente FROM lancamentos l JOIN clientes c ON c.id = l.cliente_id LEFT JOIN documentos d ON d.id = l.documento_id WHERE ${cond.join(" AND ")} ORDER BY l.data, l.criado_em LIMIT 2000`, ...p);
  });
  r.post("/api/lancamentos", async (ctx) => {
    const b = await ctx.corpo();
    const d = validar(ESQ_LANC, b);
    const doc = exigir("documentos", ctx, String(b.documento_id ?? ""), "Documento");
    if (!doc.cliente_id) falha(400, "Escolha o cliente do documento.");
    return repo.inserir("lancamentos", { ...d, empresa_id: ctx.empresa.id, cliente_id: doc.cliente_id, documento_id: doc.id, competencia: doc.competencia ?? d.data.slice(0, 7), status: doc.status === "conferido" ? "aprovado" : "sugerido" });
  });
  r.put("/api/lancamentos/:id", async (ctx) => {
    const l = exigir("lancamentos", ctx, ctx.params.id, "Lançamento");
    if (l.status === "exportado") falha(409, "Lançamento já exportado: corrija no sistema contábil.");
    const d = validar(ESQ_LANC.partial(), await ctx.corpo());
    const novo = repo.atualizar("lancamentos", ctx.empresa.id, l.id, d);
    // Aprende a correção de contas para os próximos documentos do mesmo emitente ou histórico
    if ((d.debito && d.debito !== l.debito) || (d.credito && d.credito !== l.credito)) nucleo.aprender(ctx.empresa.id, l.cliente_id, l.chave, novo.debito, novo.credito);
    return novo;
  });
  r.delete("/api/lancamentos/:id", (ctx) => {
    const l = exigir("lancamentos", ctx, ctx.params.id, "Lançamento");
    if (l.status === "exportado") falha(409, "Lançamento já exportado.");
    return { ok: repo.remover("lancamentos", ctx.empresa.id, l.id) };
  });
  // Arquivo para importar no sistema contábil (só lançamentos aprovados; marca como exportados)
  r.get("/api/lancamentos/exportar", (ctx) => {
    const cliente = exigir("clientes", ctx, ctx.query.get("cliente") ?? "", "Cliente");
    const comp = ctx.query.get("competencia");
    if (!/^\d{4}-\d{2}$/.test(comp ?? "")) falha(400, "Informe a competência.");
    const status = ctx.query.get("incluir_exportados") === "1" ? ["aprovado", "exportado"] : ["aprovado"];
    const lista = repo.todos(`SELECT l.*, d.nome documento_nome, c.cnpj cliente_cnpj FROM lancamentos l JOIN clientes c ON c.id = l.cliente_id LEFT JOIN documentos d ON d.id = l.documento_id WHERE l.empresa_id = ? AND l.cliente_id = ? AND l.competencia = ? AND l.status IN (${status.map(() => "?").join(",")}) ORDER BY l.data`, ctx.empresa.id, cliente.id, comp, ...status);
    if (!lista.length) falha(404, "Nenhum lançamento aprovado nesta competência. Confira os documentos antes.");
    const conteudo = nucleo.exportar(ctx.empresa.id, lista);
    repo.rodar(`UPDATE lancamentos SET status = 'exportado', exportado_em = ? WHERE empresa_id = ? AND cliente_id = ? AND competencia = ? AND status = 'aprovado'`, agora(), ctx.empresa.id, cliente.id, comp);
    auditar(ctx, "lancamentos_exportados", { cliente: cliente.id, competencia: comp, quantidade: lista.length });
    const nome = `lancamentos-${cliente.cnpj}-${comp}.csv`;
    ctx.res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    ctx.res.end("﻿" + conteudo);
  });

  /* ---------- Pendências e cobrança ---------- */
  r.get("/api/pendencias", ({ empresa, query }) => {
    const cond = ["p.empresa_id = ?"];
    const pr = [empresa.id];
    if (query.get("cliente")) cond.push("p.cliente_id = ?"), pr.push(query.get("cliente"));
    if (/^\d{4}-\d{2}$/.test(query.get("competencia") ?? "")) cond.push("p.competencia = ?"), pr.push(query.get("competencia"));
    if (query.get("status")) cond.push("p.status = ?"), pr.push(query.get("status"));
    if (query.get("atrasadas")) cond.push("p.status = 'pendente' AND p.prazo < ?"), pr.push(hoje());
    return repo.todos(`SELECT p.*, COALESCE(c.nome_fantasia, c.razao_social) cliente, c.whatsapp, c.email FROM pendencias p JOIN clientes c ON c.id = p.cliente_id WHERE ${cond.join(" AND ")} ORDER BY p.status = 'pendente' DESC, p.prazo, cliente LIMIT 2000`, ...pr);
  });
  r.post("/api/pendencias/:id/dispensar", async (ctx) => {
    const p = exigir("pendencias", ctx, ctx.params.id, "Pendência");
    auditar(ctx, "pendencia_dispensada", { pendencia: p.id });
    return repo.atualizar("pendencias", ctx.empresa.id, p.id, { status: "dispensado" });
  });
  r.post("/api/pendencias/:id/reabrir", (ctx) => repo.atualizar("pendencias", ctx.empresa.id, exigir("pendencias", ctx, ctx.params.id, "Pendência").id, { status: "pendente", documento_id: null, recebido_em: null }));
  // Recebido por fora (e-mail, papel): marca sem documento
  r.post("/api/pendencias/:id/receber", (ctx) => {
    const p = exigir("pendencias", ctx, ctx.params.id, "Pendência");
    auditar(ctx, "pendencia_recebida_manual", { pendencia: p.id });
    return repo.atualizar("pendencias", ctx.empresa.id, p.id, { status: "recebido", recebido_em: agora() });
  });
  r.post("/api/cobrar/:cliente", async (ctx) => {
    const c = exigir("clientes", ctx, ctx.params.cliente, "Cliente");
    const res = await nucleo.cobrarCliente(ctx.empresa.id, c.id, { forcar: true });
    auditar(ctx, "cobranca_manual", { cliente: c.id, enviado: res.enviado });
    if (!res.enviado) falha(400, `Não foi possível cobrar: ${res.motivo}. Confira o WhatsApp e o e-mail do cliente e os canais em Configurações.`);
    return res;
  });

  /* ---------- Obrigações e tarefas ---------- */
  r.get("/api/tarefas", ({ empresa, query, usuario }) => {
    const cond = ["t.empresa_id = ?"];
    const p = [empresa.id];
    const st = query.get("status");
    if (st === "abertas") cond.push("t.status IN ('a_fazer','em_andamento')");
    else if (st) cond.push("t.status = ?"), p.push(st);
    if (query.get("departamento")) cond.push("t.departamento = ?"), p.push(query.get("departamento"));
    if (query.get("cliente")) cond.push("t.cliente_id = ?"), p.push(query.get("cliente"));
    if (query.get("minhas")) cond.push("t.responsavel_id = ?"), p.push(usuario.id);
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.get("ate") ?? "")) cond.push("t.prazo_interno <= ?"), p.push(query.get("ate"));
    if (/^\d{4}-\d{2}$/.test(query.get("competencia") ?? "")) cond.push("t.competencia = ?"), p.push(query.get("competencia"));
    return repo.todos(`SELECT t.*, COALESCE(c.nome_fantasia, c.razao_social) cliente, u.nome responsavel FROM tarefas t JOIN clientes c ON c.id = t.cliente_id LEFT JOIN usuarios u ON u.id = t.responsavel_id WHERE ${cond.join(" AND ")} ORDER BY t.status IN ('concluida','dispensada'), t.prazo_interno, cliente LIMIT 2000`, ...p);
  });
  r.post("/api/tarefas", async (ctx) => {
    const d = validar(z.object({ cliente_id: t(40), nome: t(160), departamento: DEP, competencia, prazo_legal: data, prazo_interno: data.optional(), responsavel_id: op(40) }), await ctx.corpo());
    exigir("clientes", ctx, d.cliente_id, "Cliente");
    if (d.responsavel_id) exigir("usuarios", ctx, d.responsavel_id, "Responsável");
    return repo.inserir("tarefas", { ...d, empresa_id: ctx.empresa.id, prazo_interno: d.prazo_interno ?? d.prazo_legal });
  });
  r.put("/api/tarefas/:id", async (ctx) => {
    const tf = exigir("tarefas", ctx, ctx.params.id, "Tarefa");
    const d = validar(z.object({ status: z.enum(["a_fazer", "em_andamento", "concluida", "dispensada"]).optional(), responsavel_id: op(40), minutos: z.number().int().min(0).max(100_000).optional().nullable(), observacao: op(1000), prazo_interno: data.optional() }), await ctx.corpo());
    if (d.responsavel_id) exigir("usuarios", ctx, d.responsavel_id, "Responsável");
    const fim = d.status === "concluida" && tf.status !== "concluida";
    if (fim || d.status) auditar(ctx, `tarefa_${d.status ?? "alterada"}`, { tarefa: tf.id });
    return repo.atualizar("tarefas", ctx.empresa.id, tf.id, { ...d, ...(fim ? { concluida_em: agora(), concluida_por: ctx.usuario.nome } : d.status && d.status !== "concluida" ? { concluida_em: null, concluida_por: null } : {}) });
  });
  r.get("/api/obrigacoes", ({ empresa }) => repo.lista("obrigacoes", "WHERE empresa_id = ? ORDER BY departamento, nome", empresa.id));
  const ESQ_OBRIG = z.object({
    nome: t(160),
    departamento: DEP,
    regimes: z.array(z.enum(Object.keys(REGIMES))).min(1),
    condicao: z.object({ tem_funcionarios: z.boolean(), contribuinte_icms: z.boolean(), presta_servico: z.boolean() }).partial().nullable().optional(),
    periodicidade: z.enum(["mensal", "trimestral", "anual"]),
    regra: z.object({ mes: z.number().int().min(0).max(12).optional(), mes_fixo: z.number().int().min(1).max(12).optional(), tipo: z.enum(["dia", "dia_util", "ultimo_dia_util"]), dia: z.number().int().min(1).max(31).optional(), ajuste: z.enum(["antecipa", "posterga", "nenhum"]).optional() }),
    antecedencia: z.number().int().min(0).max(60),
    ativo: z.boolean().optional(),
  });
  r.post("/api/obrigacoes", ADM, async (ctx) => {
    const d = validar(ESQ_OBRIG, await ctx.corpo());
    return repo.inserir("obrigacoes", { ...d, empresa_id: ctx.empresa.id, codigo: `P_${gerarToken(6)}` });
  });
  r.put("/api/obrigacoes/:id", ADM, async (ctx) => {
    const o = exigir("obrigacoes", ctx, ctx.params.id, "Obrigação");
    const d = validar(ESQ_OBRIG.partial(), await ctx.corpo());
    const nova = repo.atualizar("obrigacoes", ctx.empresa.id, o.id, d);
    // Prazo mudou: recalcula as tarefas ainda abertas dessa obrigação
    if (d.regra || d.antecedencia !== undefined || d.periodicidade)
      for (const tf of repo.lista("tarefas", "WHERE empresa_id = ? AND obrigacao_id = ? AND status IN ('a_fazer','em_andamento')", ctx.empresa.id, o.id)) {
        const legal = prazoLegal(nova, tf.competencia);
        repo.atualizar("tarefas", ctx.empresa.id, tf.id, { prazo_legal: legal, prazo_interno: prazoInterno(legal, nova.antecedencia), nome: nova.nome });
      }
    auditar(ctx, "obrigacao_alterada", { obrigacao: o.id });
    return nova;
  });
  r.get("/api/obrigacoes/previa", ({ empresa, query }) => {
    const o = repo.obter("obrigacoes", empresa.id, query.get("id") ?? "") ?? falha(404, "Obrigação não encontrada.");
    const comp = /^\d{4}-\d{2}$/.test(query.get("competencia") ?? "") ? query.get("competencia") : hoje().slice(0, 7);
    const legal = prazoLegal(o, comp);
    return { competencia: comp, prazo_legal: legal, prazo_interno: prazoInterno(legal, o.antecedencia), dias: diasEntre(legal, hoje()) };
  });

  /* ---------- Guias e relatórios para o cliente (portal) ---------- */
  r.post("/api/arquivos", async (ctx) => {
    const dados = await lerCorpo(ctx.req, cfg.limites.tamanhoArquivo + 1);
    const nome = nomeArquivo(ctx.req, "arquivo");
    const mime = nucleo.validarArquivo({ nome, mime: ctx.req.headers["content-type"], dados });
    const a = await nucleo.salvarArquivo(ctx.empresa.id, { nome, mime, dados });
    return { id: a.id, nome: a.nome, tamanho: a.tamanho };
  });
  r.get("/api/entregas", ({ empresa, query }) => repo.todos(`SELECT e.*, a.nome arquivo_nome, COALESCE(c.nome_fantasia, c.razao_social) cliente FROM entregas e JOIN clientes c ON c.id = e.cliente_id JOIN arquivos a ON a.id = e.arquivo_id WHERE e.empresa_id = ?${query.get("cliente") ? " AND e.cliente_id = ?" : ""} ORDER BY e.criado_em DESC LIMIT 500`, empresa.id, ...(query.get("cliente") ? [query.get("cliente")] : [])));
  r.post("/api/entregas", async (ctx) => {
    const d = validar(z.object({ cliente_id: t(40), arquivo_id: t(40), titulo: t(160), tipo: z.enum(["guia", "relatorio", "holerite", "documento"]), competencia: competencia.optional().nullable(), vencimento: data.optional().nullable(), valor_centavos: centavos.optional().nullable(), tarefa_id: op(40), avisar: z.boolean().optional() }), await ctx.corpo());
    exigir("clientes", ctx, d.cliente_id, "Cliente");
    exigir("arquivos", ctx, d.arquivo_id, "Arquivo");
    if (repo.um("SELECT 1 FROM entregas WHERE arquivo_id = ?", d.arquivo_id)) falha(409, "Este arquivo já foi entregue.");
    const { avisar, ...campos } = d;
    const e = repo.inserir("entregas", { ...campos, empresa_id: ctx.empresa.id, enviado_por: ctx.usuario.nome });
    // Guia ligada a uma tarefa: a tarefa fica concluída
    if (d.tarefa_id) {
      const tf = repo.obter("tarefas", ctx.empresa.id, d.tarefa_id);
      if (tf && tf.cliente_id === d.cliente_id && tf.status !== "concluida") repo.atualizar("tarefas", ctx.empresa.id, tf.id, { status: "concluida", concluida_em: agora(), concluida_por: ctx.usuario.nome });
    }
    auditar(ctx, "entrega_criada", { entrega: e.id, cliente: d.cliente_id });
    const aviso = avisar === false ? null : await nucleo.avisarEntrega(ctx.empresa.id, e.id);
    return { ...repo.obter("entregas", ctx.empresa.id, e.id), avisado: Boolean(aviso?.ok) };
  });
  r.post("/api/entregas/:id/avisar", async (ctx) => {
    const e = exigir("entregas", ctx, ctx.params.id, "Entrega");
    const res = await nucleo.avisarEntrega(ctx.empresa.id, e.id);
    if (!res.ok) falha(400, "Não foi possível avisar o cliente: confira o WhatsApp e o e-mail dele e os canais em Configurações.");
    return res;
  });
  r.delete("/api/entregas/:id", async (ctx) => {
    const e = exigir("entregas", ctx, ctx.params.id, "Entrega");
    repo.remover("entregas", ctx.empresa.id, e.id);
    await nucleo.removerArquivo(ctx.empresa.id, e.arquivo_id);
    auditar(ctx, "entrega_removida", { entrega: e.id });
    return { ok: true };
  });
  r.get("/api/entregas/:id/arquivo", async (ctx) => {
    const e = exigir("entregas", ctx, ctx.params.id, "Entrega");
    const a = await nucleo.lerArquivo(ctx.empresa.id, e.arquivo_id);
    if (!a) falha(404, "Arquivo não encontrado.");
    enviarArquivo(ctx.res, a);
  });

  /* ---------- Chamados ---------- */
  r.get("/api/chamados", ({ empresa, query }) => repo.todos(`SELECT h.*, COALESCE(c.nome_fantasia, c.razao_social) cliente FROM chamados h JOIN clientes c ON c.id = h.cliente_id WHERE h.empresa_id = ?${query.get("status") ? " AND h.status = ?" : ""}${query.get("cliente") ? " AND h.cliente_id = ?" : ""} ORDER BY h.status = 'aberto' DESC, h.atualizado_em DESC LIMIT 500`, empresa.id, ...[query.get("status"), query.get("cliente")].filter(Boolean)).map((x) => repo.ler("chamados", x)));
  r.post("/api/chamados/:id/responder", async (ctx) => {
    const h = exigir("chamados", ctx, ctx.params.id, "Chamado");
    const d = validar(z.object({ texto: t(4000), resolver: z.boolean().optional() }), await ctx.corpo());
    const msgs = [...h.mensagens, { de: "escritorio", nome: ctx.usuario.nome, texto: d.texto, em: agora() }];
    const novo = repo.atualizar("chamados", ctx.empresa.id, h.id, { mensagens: msgs, status: d.resolver ? "resolvido" : "respondido" });
    // Chamado do WhatsApp: a resposta vai para o WhatsApp do cliente
    if (h.origem === "whatsapp") await nucleo.responderWhatsApp(ctx.empresa.id, h.cliente_id, d.texto).catch(() => {});
    auditar(ctx, "chamado_respondido", { chamado: h.id });
    return novo;
  });
  r.put("/api/chamados/:id", async (ctx) => {
    const h = exigir("chamados", ctx, ctx.params.id, "Chamado");
    const d = validar(z.object({ status: z.enum(["aberto", "respondido", "resolvido"]).optional(), departamento: DEP.optional() }), await ctx.corpo());
    return repo.atualizar("chamados", ctx.empresa.id, h.id, d);
  });
  r.get("/api/mensagens", ({ empresa, query }) => repo.lista("mensagens", "WHERE empresa_id = ? AND cliente_id = ? ORDER BY criado_em DESC LIMIT 100", empresa.id, query.get("cliente") ?? ""));
  r.get("/api/envios", ({ empresa }) => repo.todos("SELECT v.*, COALESCE(c.nome_fantasia, c.razao_social) cliente FROM envios v LEFT JOIN clientes c ON c.id = v.cliente_id WHERE v.empresa_id = ? ORDER BY v.criado_em DESC LIMIT 300", empresa.id));

  /* ---------- Configurações ---------- */
  r.get("/api/escritorio", ({ empresa }) => escritorioPublico(empresa));
  r.put("/api/escritorio", ADM, async (ctx) => {
    const d = validar(z.object({ razao_social: t(150).optional(), nome_fantasia: op(150), cnpj: documentoFiscal.optional(), crc: op(30), assistente: z.object({ ativo: z.boolean(), assinatura: op(80) }).partial().optional(), portal: z.object({ cor: z.string().regex(/^#[0-9a-fA-F]{6}$/), boas_vindas: op(500) }).partial().optional() }), await ctx.corpo());
    const c = ctx.empresa.config;
    const config = { ...c, ...(d.assistente ? { assistente: { ...c.assistente, ...d.assistente } } : {}), ...(d.portal ? { portal: { ...c.portal, ...d.portal } } : {}) };
    auditar(ctx, "escritorio_alterado");
    return escritorioPublico({ ...repo.atualizar("empresas", null, ctx.empresa.id, { razao_social: d.razao_social, nome_fantasia: d.nome_fantasia, cnpj: d.cnpj, crc: d.crc, config }), config: nucleo.configCompleta(config) });
  });
  // WhatsApp (API oficial da Meta) e e-mail: segredos criptografados; vazio mantém o atual
  r.put("/api/canais", ADM, async (ctx) => {
    const d = validar(
      z.object({
        whatsapp: z.object({ token: op(600), id_numero: z.string().trim().regex(/^\d{0,30}$/).optional(), segredo_app: op(200), verificacao: op(100), template_cobranca: op(100), template_aviso: op(100), idioma: op(10) }).partial().optional(),
        email: z.object({ chave: op(300), remetente: op(160) }).partial().optional(),
      }),
      await ctx.corpo(),
    );
    const c = ctx.empresa.config;
    const w = { ...c.whatsapp };
    if (d.whatsapp) {
      const { token, segredo_app, ...resto } = d.whatsapp;
      Object.assign(w, Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined && v !== null)));
      // "true"/"false" é o marcador de "configurado" que vai ao navegador: nunca vira segredo
      const valido = (v) => v && !["true", "false"].includes(v);
      if (valido(token)) w.token_cripto = cofre.cifrar(token);
      if (valido(segredo_app)) w.segredo_cripto = cofre.cifrar(segredo_app);
      if (!w.verificacao) w.verificacao = gerarToken(18);
    }
    const em = { ...c.email };
    if (d.email) {
      if (d.email.chave && !["true", "false"].includes(d.email.chave)) em.chave_cripto = cofre.cifrar(d.email.chave);
      if (d.email.remetente !== undefined) em.remetente = d.email.remetente ?? "";
    }
    auditar(ctx, "canais_alterados");
    const e = repo.atualizar("empresas", null, ctx.empresa.id, { config: { ...c, whatsapp: w, email: em } });
    return escritorioPublico({ ...e, config: nucleo.configCompleta(e.config) });
  });
  r.post("/api/canais/testar", ADM, async (ctx) => {
    const d = validar(z.object({ canal: z.enum(["whatsapp", "email"]), destino: t(160) }), await ctx.corpo());
    const res = await nucleo.testarCanal(ctx.empresa.id, d.canal, d.destino);
    if (!res.ok) falha(400, res.erro);
    return res;
  });
  r.put("/api/regua", ADM, async (ctx) => {
    const d = validar(z.object({ ativa: z.boolean(), antes: z.number().int().min(0).max(15), a_cada: z.number().int().min(1).max(30), maximo: z.number().int().min(1).max(15), canais: z.array(z.enum(["whatsapp", "email"])).min(1) }).partial(), await ctx.corpo());
    const c = ctx.empresa.config;
    auditar(ctx, "regua_alterada", d);
    return repo.atualizar("empresas", null, ctx.empresa.id, { config: { ...c, regua: { ...c.regua, ...d } } }).config.regua;
  });
  r.put("/api/exportacao", ADM, async (ctx) => {
    const d = validar(
      z.object({
        exportacao: z.object({ separador: z.enum([";", ",", "|", "tab"]), data: z.enum(["dd/mm/aaaa", "aaaa-mm-dd", "ddmmaaaa"]), decimal: z.enum([",", "."]), cabecalho: z.boolean(), colunas: z.array(z.enum(["data", "debito", "credito", "valor", "historico", "documento", "cnpj_cliente", "competencia"])).min(3) }).partial().optional(),
        contas: z.record(z.enum(["bancos", "fornecedores", "clientes", "receita", "despesa", "entradas", "saidas", "impostos"]), t(120)).optional(),
      }),
      await ctx.corpo(),
    );
    const c = ctx.empresa.config;
    const config = { ...c, exportacao: { ...c.exportacao, ...(d.exportacao ?? {}) }, contas: { ...c.contas, ...(d.contas ?? {}) } };
    auditar(ctx, "exportacao_alterada");
    const e = repo.atualizar("empresas", null, ctx.empresa.id, { config });
    return nucleo.configCompleta(e.config);
  });
  r.post("/api/rotina", ADM, async () => ({ resultado: await nucleo.rotina({ forcar: true }) }));

  r.get("/api/usuarios", ({ empresa }) => repo.lista("usuarios", "WHERE empresa_id = ? AND nexor = 0 ORDER BY nome", empresa.id).map(usuarioPublico));
  r.post("/api/usuarios", ADM, async (ctx) => {
    const d = validar(z.object({ nome: t(120), email, senha, papel: z.enum(["admin", "equipe"]), departamento: DEP }), await ctx.corpo());
    if (repo.um("SELECT 1 FROM usuarios WHERE email = ?", d.email)) falha(409, "Já existe um usuário com este e-mail.");
    const { senha: s, ...resto } = d;
    auditar(ctx, "usuario_criado", { email: d.email, papel: d.papel });
    return usuarioPublico(repo.inserir("usuarios", { ...resto, empresa_id: ctx.empresa.id, senha_hash: gerarHashSenha(s) }));
  });
  r.put("/api/usuarios/:id", ADM, async (ctx) => {
    const u = repo.obter("usuarios", ctx.empresa.id, ctx.params.id);
    if (!u || u.nexor) falha(404, "Usuário não encontrado.");
    const d = validar(z.object({ nome: op(120), papel: z.enum(["admin", "equipe"]).optional(), departamento: DEP.optional(), ativo: z.boolean().optional(), senha: senha.optional() }), await ctx.corpo());
    if (u.papel === "dono" && (d.papel || d.ativo === false)) falha(400, "O dono da conta não pode ser alterado.");
    if (u.id === ctx.usuario.id && (d.papel || d.ativo === false)) falha(400, "Você não pode mudar o próprio perfil.");
    const novo = repo.atualizar("usuarios", ctx.empresa.id, u.id, { ...d, senha: undefined, senha_hash: d.senha ? gerarHashSenha(d.senha) : undefined });
    if (d.ativo === false || d.senha) repo.rodar("DELETE FROM sessoes WHERE usuario_id = ?", u.id);
    auditar(ctx, "usuario_alterado", { email: u.email });
    return usuarioPublico(novo);
  });
  r.get("/api/auditoria", ADM, ({ empresa }) => repo.lista("auditoria", "WHERE empresa_id = ? ORDER BY criado_em DESC LIMIT 300", empresa.id));

  /* ---------- Suporte Nexor ---------- */
  r.get("/api/nexor/entrar", { publico: true }, ({ query, res, ip }) => {
    limitar(`nexor:${ip}`, 20);
    const d = central.conferirAcesso(query.get("t"));
    const pagina = (status, titulo, texto) => {
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
      res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px"><h1 style="font-size:20px">${titulo}</h1><p style="color:#4a5a73;line-height:1.5">${texto}</p><p><a href="/">Ir para o painel</a></p></body></html>`);
    };
    if (!d) return pagina(403, "Link de acesso inválido", "O link de suporte venceu, já foi usado ou não é desta instalação. Gere um novo na Nexor Central.");
    const e = repo.um("SELECT id FROM empresas ORDER BY criada_em LIMIT 1");
    if (!e) return pagina(409, "Escritório ainda não criado", "O cliente ainda não criou a conta neste sistema. Use o código de instalação.");
    const nome = `Suporte Nexor · ${String(d.nome ?? "equipe").slice(0, 60)}`;
    let u = repo.um("SELECT * FROM usuarios WHERE empresa_id = ? AND nexor = 1", e.id);
    if (u) repo.rodar("UPDATE usuarios SET nome = ?, ativo = 1 WHERE id = ?", nome, u.id);
    else u = repo.inserir("usuarios", { empresa_id: e.id, nome, email: `suporte-${e.id}@nexor.invalid`, senha_hash: "!sem-senha", papel: "admin", nexor: true });
    const token = gerarToken();
    repo.criarSessao(sha256(token), { usuario_id: u.id }, 8 / 24);
    repo.auditar(e.id, nome, "acesso_suporte_nexor", { email: d.email ?? null, ip });
    res.writeHead(302, { Location: "/#/inicio", "Cache-Control": "no-store", "Set-Cookie": [`${COOKIE_PAINEL}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${8 * 3600}`, ...(cfg.producao ? ["Secure"] : [])].join("; ") });
    res.end();
  });
  r.get("/api/nexor/ajustes", { nexor: true }, ({ empresa }) => {
    const a = repo.um("SELECT atualizado_por, atualizado_em FROM nexor_ajustes WHERE empresa_id = ?", empresa.id);
    return { catalogo: CATALOGO, ocultos: repo.ocultos(empresa.id), atualizado_por: a?.atualizado_por ?? null, atualizado_em: a?.atualizado_em ?? null, licenca: central.estado(), central: central.info() };
  });
  r.put("/api/nexor/ajustes", { nexor: true }, async (ctx) => {
    const d = validar(z.object({ ocultos: z.array(z.string().max(60)).max(60) }), await ctx.corpo());
    const invalidos = d.ocultos.filter((k) => !chaveValida(k));
    if (invalidos.length) falha(400, `Itens desconhecidos: ${invalidos.join(", ")}`);
    const ocultos = [...new Set(d.ocultos)];
    repo.rodar("INSERT INTO nexor_ajustes (empresa_id, ocultos, atualizado_por, atualizado_em) VALUES (?,?,?,?) ON CONFLICT (empresa_id) DO UPDATE SET ocultos = excluded.ocultos, atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em", ctx.empresa.id, JSON.stringify(ocultos), ctx.usuario.nome, agora());
    auditar(ctx, "ajustes_nexor", { ocultos });
    return { ocultos };
  });
  r.post("/api/nexor/sincronizar", { nexor: true }, async () => ({ ...(await central.sincronizar()), licenca: central.estado(), central: central.info() }));
  r.post("/api/nexor/vincular", ADM, async (ctx) => {
    limitar(`vincular:${ctx.ip}`, 10);
    if (central.configurada) falha(409, "Este sistema já está vinculado à Nexor Central.");
    const d = validar(z.object({ codigo: z.string().trim().min(8).max(20) }), await ctx.corpo());
    const res = await central.vincular(d.codigo, { nome: ctx.empresa.nome_fantasia || ctx.empresa.razao_social });
    if (!res.ok) falha(400, res.erro);
    auditar(ctx, "vinculado_nexor_central", { cliente: res.cliente });
    return res;
  });

  const portal = rotasPortal({ r, repo, nucleo, cfg, agora, limitar, limites, cookie });
  return { roteador: r, sessaoPainel, sessaoPortal: portal.sessaoPortal };
}
