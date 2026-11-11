/* API do Nexor Elo. Monta o roteador e as rotas de contas (cadastro, login, equipe) e da operação Nexor;
   as rotas de cada perfil ficam em fornecedor.js, instalador.js e publico.js.

   Opções de rota: { publico: true } (sem login) · { conta: "fornecedor"|"instalador"|"nexor", pode: "acao" } ·
   { limite: bytes } (corpo maior que o padrão de 256 KB). O servidor confere sessão, papel e CSRF antes da rota. */

import { z } from "zod";
import { gerarHashSenha, gerarToken, hashSenha, iguais, mascarar, precisaRefazerHash, senhaConfere, sha256 } from "../seguranca.js";
import { cnaesCompativeis } from "../regras/documentos.js";
import { criarRoteador, falha } from "./roteador.js";
import { PAPEIS, pode } from "./permissoes.js";
import { COOKIES, cnaes, cnpj, email, op, senha, t, telefone, uf, usuarioPublico, validar } from "./validacao.js";
import { rotasFornecedor } from "./fornecedor.js";
import { rotasInstalador } from "./instalador.js";
import { rotasPublicas } from "./publico.js";

export const TIPOS = ["fornecedor", "instalador", "nexor"];

/** Conta sem segredos (walletId, tokens e chaves viram "configurado: sim/não" ou só o final) */
export function contaPublica(c, cofre) {
  if (!c) return null;
  const { wallet_cripto, focus_token_cripto, asaas_chave_cripto, asaas_webhook_cripto, ...config } = c.config ?? {};
  let wallet = null;
  let walletIlegivel = false;
  try {
    wallet = wallet_cripto ? mascarar(cofre.decifrar(wallet_cripto)) : null;
  } catch {
    // Banca P-10: cadastrado, mas não decifra (chave mestra trocada ou dado corrompido): é preciso cadastrar de novo
    wallet = null;
    walletIlegivel = true;
  }
  return { ...c, config: { ...config, wallet, ...(walletIlegivel ? { wallet_ilegivel: true } : {}), focus_token: Boolean(focus_token_cripto), asaas_chave: Boolean(asaas_chave_cripto) } };
}

export function criarApi(ctxApp) {
  const { repo, cofre, cfg, agora, negocio, cnpjs } = ctxApp;
  const r = criarRoteador();
  const tentativas = new Map();
  const HASH_FALSO = gerarHashSenha(gerarToken());
  const JANELA = 15 * 60_000;

  const recentes = (chave) => (tentativas.get(chave) ?? []).filter((x) => agora() - x < JANELA);
  function conferirLimite(chave, maximo = cfg.limites.tentativasLogin) {
    if (recentes(chave).length >= maximo) falha(429, "Muitas tentativas. Aguarde alguns minutos.");
  }
  function contarTentativa(chave) {
    const l = recentes(chave);
    l.push(agora());
    tentativas.set(chave, l);
    if (tentativas.size > 20_000) tentativas.delete(tentativas.keys().next().value);
  }
  const limitar = (chave, maximo) => (conferirLimite(chave, maximo), contarTentativa(chave));

  function cookie(res, nome, valor, dias) {
    const a = [`${nome}=${valor}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.round(dias * 86400)}`];
    if (cfg.producao) a.push("Secure");
    const atual = res.getHeader("Set-Cookie");
    res.setHeader("Set-Cookie", [...(Array.isArray(atual) ? atual : atual ? [atual] : []), a.join("; ")]);
  }
  function iniciarSessao(res, u, dias = cfg.sessaoDias) {
    const token = gerarToken();
    repo.criarSessao(sha256(token), u.id, u.tipo, dias);
    cookie(res, COOKIES[u.tipo], token, dias);
    return token;
  }
  /** Usuário da sessão daquele tipo de conta (cada tipo tem seu cookie: um não abre a área do outro) */
  function sessao(tipo, cookies) {
    const tk = cookies[COOKIES[tipo]];
    const s = tk ? repo.sessao(sha256(tk), tipo) : null;
    if (!s) return null;
    const u = repo.obter("usuarios", s.usuario_id);
    return u?.ativo && u.tipo === tipo ? u : null;
  }
  const auditar = (ctx, acao, detalhe = null) => repo.auditar(ctx.conta?.id ?? null, ctx.usuario?.nome ?? "sistema", acao, detalhe, ctx.ip);
  /** Registro da própria conta (multi-inquilino: nunca enxerga o de outra conta) */
  function daConta(tabela, idReg, campo, contaId, rotulo) {
    const x = repo.obter(tabela, idReg);
    if (!x || x[campo] !== contaId) falha(404, `${rotulo} não encontrado.`);
    return x;
  }

  const h = { ...ctxApp, r, limitar, conferirLimite, contarTentativa, auditar, daConta, iniciarSessao, sessao, contaPublica: (c) => contaPublica(c, cofre) };

  /* ---------- Cadastro ---------- */
  const usuarioNovo = z.object({ nome: t(120), email, senha, telefone: telefone.optional() });
  async function criarDono(tipo, contaDados, d) {
    if (repo.usuarioPorEmail(tipo, d.email) || repo.um("SELECT 1 FROM usuarios WHERE tipo = ? AND email = ?", tipo, d.email)) falha(409, "Este e-mail já tem cadastro. Entre com sua senha.");
    if (contaDados.cnpj && repo.um("SELECT 1 FROM contas WHERE tipo = ? AND cnpj = ?", tipo, contaDados.cnpj)) falha(409, "Este CNPJ já tem cadastro no Elo. Peça acesso ao responsável da empresa.");
    const senhaHash = await hashSenha(d.senha);
    return repo.transacao(() => {
      if (repo.um("SELECT 1 FROM usuarios WHERE tipo = ? AND email = ?", tipo, d.email)) falha(409, "Este e-mail já tem cadastro. Entre com sua senha.");
      const c = repo.inserir("contas", { tipo, ...contaDados });
      const u = repo.inserir("usuarios", { conta_id: c.id, tipo, nome: d.nome, email: d.email, senha_hash: senhaHash, papel: PAPEIS[tipo][0], telefone: d.telefone || null });
      return { c, u };
    });
  }

  r.post("/api/fornecedor/cadastro", { publico: true }, async (ctx) => {
    limitar(`cadastro:${ctx.ip}`, 10);
    const d = validar(usuarioNovo.extend({ cnpj, razao_social: t(160), nome_fantasia: op(120), cnaes, cidade: t(80), uf, prazo_reserva_dias: z.number().int().min(1).max(30).optional(), email_empresa: email.optional() }), await ctx.corpo());
    const { c, u } = await criarDono("fornecedor", { cnpj: d.cnpj, razao_social: d.razao_social, nome_fantasia: d.nome_fantasia || null, cnaes: [...new Set(d.cnaes)], cidade: d.cidade, uf: d.uf, telefone: d.telefone || null, email: d.email_empresa ?? d.email, status: "pendente", config: { prazo_reserva_dias: d.prazo_reserva_dias ?? 7, prazo_titulo_dias: 7 } }, d);
    repo.auditar(c.id, u.nome, "conta_criada", { tipo: "fornecedor" }, ctx.ip);
    for (const operador of repo.lista("contas", "WHERE tipo = 'nexor'")) negocio.avisar(operador.id, "fornecedor_novo", `Novo fornecedor aguardando aprovação: ${d.razao_social} (${d.cidade}/${d.uf}).`, c.id);
    iniciarSessao(ctx.res, u);
    return { ok: true, conta: contaPublica(c, cofre), aviso: "Cadastro recebido. A equipe Nexor confere os dados e libera o fornecedor para os instaladores." };
  });

  r.post("/api/instalador/cadastro", { publico: true }, async (ctx) => {
    limitar(`cadastro:${ctx.ip}`, 10);
    const d = validar(usuarioNovo.extend({ cnpj, nome_fantasia: op(120) }), await ctx.corpo());
    const rf = await cnpjs.consultar(d.cnpj);
    if (rf.situacao !== "ATIVA") falha(400, `O CNPJ está com situação "${rf.situacao || "desconhecida"}" na Receita. Só CNPJ ativo pode se cadastrar.`);
    if (!rf.cnaes.length) falha(400, "Não encontramos CNAEs neste CNPJ.");
    const { c, u } = await criarDono("instalador", { cnpj: d.cnpj, razao_social: rf.razao_social, nome_fantasia: d.nome_fantasia || rf.nome_fantasia, cnaes: rf.cnaes, cidade: rf.cidade, uf: rf.uf, telefone: d.telefone || null, email: d.email, status: "ativo", config: { cnae_principal: rf.cnae_principal } }, d);
    repo.auditar(c.id, u.nome, "conta_criada", { tipo: "instalador", cnpj_consultado: true }, ctx.ip);
    iniciarSessao(ctx.res, u);
    return { ok: true, conta: contaPublica(c, cofre) };
  });

  /* ---------- Login, sessão e senha (um par de rotas por tipo de conta) ---------- */
  for (const tipo of TIPOS) {
    r.post(`/api/${tipo}/entrar`, { publico: true }, async (ctx) => {
      const d = validar(z.object({ email, senha: z.string().min(1).max(200) }), await ctx.corpo());
      // Só os erros contam (por e-mail+IP e, mais folgado, por IP); um acerto zera o contador da conta
      const chaveConta = `login:${tipo}:${d.email}:${ctx.ip}`;
      const chaveIp = `login:${ctx.ip}`;
      conferirLimite(chaveConta);
      conferirLimite(chaveIp, cfg.limites.tentativasLogin * 3);
      const u = repo.usuarioPorEmail(tipo, d.email);
      const ok = await senhaConfere(d.senha, u?.senha_hash ?? HASH_FALSO);
      if (!u || !ok) {
        contarTentativa(chaveConta);
        contarTentativa(chaveIp);
        falha(401, "E-mail ou senha incorretos.");
      }
      const c = repo.obter("contas", u.conta_id);
      if (["suspenso", "recusado"].includes(c?.status) && tipo !== "nexor") falha(403, c.status === "suspenso" ? "Esta conta está suspensa. Fale com a Nexor." : "O cadastro desta empresa não foi aprovado.");
      tentativas.delete(chaveConta);
      if (precisaRefazerHash(u.senha_hash)) repo.rodar("UPDATE usuarios SET senha_hash = ? WHERE id = ?", await hashSenha(d.senha), u.id);
      iniciarSessao(ctx.res, u);
      repo.auditar(u.conta_id, u.nome, "login", null, ctx.ip);
      return { ok: true };
    });
    r.post(`/api/${tipo}/sair`, { publico: true }, ({ cookies, res }) => {
      if (cookies[COOKIES[tipo]]) repo.encerrarSessao(sha256(cookies[COOKIES[tipo]]));
      res.setHeader("Set-Cookie", `${COOKIES[tipo]}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      return { ok: true };
    });
    r.get(`/api/${tipo}/eu`, { conta: tipo }, (ctx) => ({
      usuario: usuarioPublico(ctx.usuario),
      conta: contaPublica(ctx.conta, cofre),
      nao_lidas: repo.um("SELECT COUNT(*) n FROM notificacoes WHERE conta_id = ? AND lida = 0", ctx.conta.id).n,
    }));
    r.post(`/api/${tipo}/eu/senha`, { conta: tipo }, async (ctx) => {
      const d = validar(z.object({ atual: z.string().min(1).max(200), nova: senha }), await ctx.corpo());
      limitar(`senha:${ctx.usuario.id}`, 5);
      if (!(await senhaConfere(d.atual, ctx.usuario.senha_hash))) falha(400, "Senha atual incorreta.");
      repo.atualizar("usuarios", ctx.usuario.id, { senha_hash: await hashSenha(d.nova) });
      repo.encerrarSessoesDo(ctx.usuario.id);
      iniciarSessao(ctx.res, ctx.usuario);
      auditar(ctx, "senha_trocada");
      return { ok: true };
    });
  }

  /* ---------- Equipe (fornecedor e instalador) ---------- */
  for (const tipo of ["fornecedor", "instalador"]) {
    r.get(`/api/${tipo}/equipe`, { conta: tipo, pode: tipo === "fornecedor" ? "ver" : "equipe" }, (ctx) => repo.lista("usuarios", "WHERE conta_id = ? ORDER BY nome", ctx.conta.id).map(usuarioPublico));
    r.post(`/api/${tipo}/equipe`, { conta: tipo, pode: "equipe" }, async (ctx) => {
      const d = validar(usuarioNovo.extend({ papel: z.enum(PAPEIS[tipo].filter((p) => p !== "dono")) }), await ctx.corpo());
      if (repo.um("SELECT 1 FROM usuarios WHERE tipo = ? AND email = ?", tipo, d.email)) falha(409, "Este e-mail já tem acesso.");
      const u = repo.inserir("usuarios", { conta_id: ctx.conta.id, tipo, nome: d.nome, email: d.email, senha_hash: await hashSenha(d.senha), papel: d.papel, telefone: d.telefone || null });
      auditar(ctx, "acesso_criado", { usuario_id: u.id, papel: d.papel });
      return usuarioPublico(u);
    });
    r.put(`/api/${tipo}/equipe/:id`, { conta: tipo, pode: "equipe" }, async (ctx) => {
      const alvo = daConta("usuarios", ctx.params.id, "conta_id", ctx.conta.id, "Acesso");
      const d = validar(z.object({ nome: t(120).optional(), papel: z.enum(PAPEIS[tipo].filter((p) => p !== "dono")).optional(), ativo: z.boolean().optional(), telefone: telefone.optional() }), await ctx.corpo());
      if (alvo.papel === "dono" && (d.papel || d.ativo === false)) falha(403, "O acesso do dono não pode ser rebaixado nem desativado.");
      if (alvo.id === ctx.usuario.id && d.ativo === false) falha(400, "Você não pode desativar o próprio acesso.");
      const u = repo.atualizar("usuarios", alvo.id, d);
      if (d.ativo === false || d.papel) repo.encerrarSessoesDo(alvo.id);
      auditar(ctx, "acesso_alterado", { usuario_id: alvo.id, ...d });
      return usuarioPublico(u);
    });
  }

  /* ---------- Operação Nexor ---------- */
  r.get("/api/nexor/estado", { publico: true }, () => ({ primeiro_acesso: repo.contarUsuarios("nexor") === 0, exige_codigo: Boolean(cfg.codigoInstalacao) }));
  r.post("/api/nexor/primeiro-acesso", { publico: true }, async (ctx) => {
    if (repo.contarUsuarios("nexor") > 0) falha(403, "O operador Nexor já foi criado.");
    limitar(`nexor:${ctx.ip}`, 5);
    const b = await ctx.corpo();
    if (!cfg.codigoInstalacao || !iguais(String(b?.codigo_instalacao ?? "").trim(), cfg.codigoInstalacao)) falha(403, "Código de instalação incorreto.");
    const d = validar(usuarioNovo, b);
    const senhaHash = await hashSenha(d.senha);
    const u = repo.transacao(() => {
      if (repo.contarUsuarios("nexor") > 0) falha(403, "O operador Nexor já foi criado.");
      const c = repo.inserir("contas", { tipo: "nexor", razao_social: "Nexor Consulting", status: "ativo", email: d.email });
      return repo.inserir("usuarios", { conta_id: c.id, tipo: "nexor", nome: d.nome, email: d.email, senha_hash: senhaHash, papel: "operador" });
    });
    repo.auditar(u.conta_id, u.nome, "operador_criado", null, ctx.ip);
    iniciarSessao(ctx.res, u);
    return { ok: true };
  });
  const OP = { conta: "nexor", pode: "operar" };
  r.post("/api/nexor/operadores", OP, async (ctx) => {
    const d = validar(usuarioNovo, await ctx.corpo());
    if (repo.um("SELECT 1 FROM usuarios WHERE tipo = 'nexor' AND email = ?", d.email)) falha(409, "Este e-mail já tem acesso.");
    const u = repo.inserir("usuarios", { conta_id: ctx.conta.id, tipo: "nexor", nome: d.nome, email: d.email, senha_hash: await hashSenha(d.senha), papel: "operador" });
    auditar(ctx, "operador_criado", { usuario_id: u.id });
    return usuarioPublico(u);
  });
  for (const tipo of ["fornecedor", "instalador"]) {
    r.get(`/api/nexor/${tipo}es`, OP, ({ query }) => {
      const st = query.get("status") ?? "";
      return repo.lista("contas", "WHERE tipo = ? AND (? = '' OR status = ?) ORDER BY criado_em DESC LIMIT 500", tipo, st, st).map((c) => ({ ...contaPublica(c, cofre), usuarios: repo.um("SELECT COUNT(*) n FROM usuarios WHERE conta_id = ?", c.id).n }));
    });
    const mudar = (acao, de, para) =>
      r.post(`/api/nexor/${tipo}es/:id/${acao}`, OP, async (ctx) => {
        const c = repo.obter("contas", ctx.params.id);
        if (!c || c.tipo !== tipo) falha(404, "Conta não encontrada.");
        const d = validar(z.object({ motivo: op(300) }), await ctx.corpo());
        if (!de.includes(c.status)) falha(409, `Não é possível ${acao} uma conta com situação "${c.status}".`);
        const nova = repo.atualizar("contas", c.id, { status: para, ...(para === "ativo" ? { aprovado_por: ctx.usuario.nome, aprovado_em: agora() } : {}) });
        if (para !== "ativo") for (const u of repo.lista("usuarios", "WHERE conta_id = ?", c.id)) repo.encerrarSessoesDo(u.id);
        auditar(ctx, `${tipo}_${acao}`, { conta_id: c.id, motivo: d.motivo ?? null });
        repo.auditar(c.id, ctx.usuario.nome, `nexor_${acao}`, { motivo: d.motivo ?? null }, ctx.ip);
        if (acao === "aprovar") negocio.avisar(c.id, "conta_aprovada", "Seu cadastro no Nexor Elo foi aprovado. Os instaladores já podem pedir vínculo.");
        return contaPublica(nova, cofre);
      });
    if (tipo === "fornecedor") {
      mudar("aprovar", ["pendente", "recusado"], "ativo");
      mudar("recusar", ["pendente"], "recusado");
    }
    mudar("suspender", ["ativo", "pendente"], "suspenso");
    mudar("reativar", ["suspenso"], "ativo");
  }
  r.get("/api/nexor/metricas", OP, () => {
    const n = (sql, ...p) => repo.um(sql, ...p).n;
    return {
      fornecedores: { ativos: n("SELECT COUNT(*) n FROM contas WHERE tipo='fornecedor' AND status='ativo'"), pendentes: n("SELECT COUNT(*) n FROM contas WHERE tipo='fornecedor' AND status='pendente'") },
      instaladores: n("SELECT COUNT(*) n FROM contas WHERE tipo='instalador' AND status='ativo'"),
      vinculos_aprovados: n("SELECT COUNT(*) n FROM vinculos WHERE status='aprovado'"),
      propostas: Object.fromEntries(repo.todos("SELECT status, COUNT(*) n FROM propostas GROUP BY status").map((x) => [x.status, x.n])),
      pago_total_centavos: n("SELECT COALESCE(SUM(valor_centavos),0) n FROM pagamentos WHERE status='pago'"),
      taxa_plataforma_centavos: n("SELECT COALESCE(SUM(valor_centavos),0) n FROM repasses WHERE destino='nexor' AND status='recebido'"),
      ordens_abertas: n("SELECT COUNT(*) n FROM ordens WHERE status NOT IN ('concluida','cancelada')"),
    };
  });
  r.get("/api/nexor/integracoes", OP, (ctx) => {
    auditar(ctx, "integracoes_vistas");
    return {
      asaas: { configurada: Boolean(ctxApp.chaveAsaas()), url: cfg.asaas.url, wallet_nexor: mascarar(ctxApp.walletNexor()), token_webhook: ctxApp.tokenWebhookAsaas(), webhook: `${cfg.urlPublica}/webhook/asaas` },
      cnpj: { url: cfg.cnpj.url, cache_dias: cfg.cnpj.cacheDias },
      whatsapp: Boolean(cfg.whatsapp.token), email: Boolean(cfg.email.chave),
      taxa_plataforma_bps: cfg.taxaPlataformaBps,
    };
  });
  r.put("/api/nexor/integracoes", OP, async (ctx) => {
    const d = validar(z.object({ asaas_chave: op(300), wallet_nexor: op(100), gerar_token_webhook: z.boolean().optional() }), await ctx.corpo());
    if (d.asaas_chave) repo.definirPlataforma("asaas_chave_cripto", cofre.cifrar(d.asaas_chave));
    if (d.wallet_nexor) repo.definirPlataforma("wallet_nexor_cripto", cofre.cifrar(d.wallet_nexor));
    if (d.gerar_token_webhook) repo.definirPlataforma("asaas_webhook_cripto", cofre.cifrar(gerarToken(24)));
    auditar(ctx, "integracoes_alteradas", { asaas_chave: Boolean(d.asaas_chave), wallet_nexor: Boolean(d.wallet_nexor), token_webhook: Boolean(d.gerar_token_webhook) });
    return { ok: true, token_webhook: ctxApp.tokenWebhookAsaas() };
  });
  r.get("/api/nexor/auditoria", OP, ({ query }) => repo.lista("auditoria", "WHERE (? = '' OR conta_id = ?) ORDER BY criado_em DESC LIMIT 300", query.get("conta_id") ?? "", query.get("conta_id") ?? ""));
  r.get("/api/nexor/notificacoes", OP, (ctx) => repo.lista("notificacoes", "WHERE conta_id = ? ORDER BY criado_em DESC LIMIT 100", ctx.conta.id));

  /* ---------- Perfis ---------- */
  rotasFornecedor(h);
  rotasInstalador(h);
  rotasPublicas(h);

  return { roteador: r, sessao, cnaesCompativeis };
}
