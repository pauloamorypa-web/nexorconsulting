/* Nexor Central: centro de controle da Nexor.
   /                     → painel da equipe Nexor (login com senha + 2FA)
   /api/*                → API do painel
   /api/v1/sincronizar   → cada sistema instalado no cliente envia a saúde e recebe a licença assinada
   /api/webhooks/asaas   → confirmação de pagamento
   /health               → verificação de saúde */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import QRCode from "qrcode";
import { acaoDoEvento, criarAsaas } from "./asaas.js";
import { config as configPadrao } from "./config.js";
import { abrirBanco, normalizarCodigo, novoCodigo } from "./db.js";
import { conferirSenha, conferirTotp, criarAssinador, criarCofre, gerarHashSenha, gerarToken, iguais, novoSegredoTotp, sha256 } from "./seguranca.js";
import { conteudoLicenca, hojeBR, mensalidadesDevidas, situacaoCliente } from "./regras.js";

const PUBLICO = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json" };
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const COOKIE = "nx_central";
export const PRODUTOS = { rh: "Nexor RH e Ponto", atende: "Atende IA", agente: "Nexor Agente", one: "Nexor One", contabil: "Nexor Contábil" };
const PAPEIS = ["dono", "financeiro", "suporte"];
const ONLINE_MS = 15 * 60_000;
// Produtos com painel em que o Suporte Nexor entra pelo link assinado
const COM_ACESSO = new Set(["rh", "atende", "contabil"]);
const PREFIXO_ENV = { atende: "ATENDE_", agente: "AGENTE_", contabil: "CONTABIL_" };

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}
const falha = (status, mensagem) => {
  throw new ErroHttp(status, mensagem);
};
function json(res, status, corpo, cab = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cab });
  res.end(JSON.stringify(corpo));
}
function lerCorpo(req, limite = 256 * 1024) {
  return new Promise((ok, erro) => {
    const partes = [];
    let n = 0;
    req.on("data", (p) => {
      n += p.length;
      if (n > limite) {
        erro(new ErroHttp(413, "Conteúdo grande demais."));
        req.destroy();
      } else partes.push(p);
    });
    req.on("end", () => ok(Buffer.concat(partes)));
    req.on("error", erro);
  });
}
const lerCookies = (c = "") => Object.fromEntries(c.split(";").map((p) => p.trim().split("=")).filter(([k, v]) => k && v).map(([k, v]) => [k, decodeURIComponent(v)]));

export function ipCliente(req, proxies = 1) {
  const direto = String(req.socket?.remoteAddress ?? "");
  if (!proxies) return direto;
  const lista = String(req.headers["x-forwarded-for"] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return lista.length ? (lista[Math.max(0, lista.length - proxies)] ?? direto) : direto;
}

/* ---------- Validação simples ---------- */
const V = {
  texto(v, max, { obrig = false, rotulo = "campo" } = {}) {
    if (v === undefined || v === null || String(v).trim() === "") {
      if (obrig) falha(400, `Preencha: ${rotulo}.`);
      return v === undefined ? undefined : null;
    }
    const s = String(v).trim();
    if (s.length > max) falha(400, `${rotulo}: no máximo ${max} caracteres.`);
    return s;
  },
  inteiro(v, min, max, rotulo) {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) falha(400, `${rotulo}: use um número entre ${min} e ${max}.`);
    return n;
  },
  data(v, rotulo, obrig = false) {
    if (v === undefined || v === null || v === "") {
      if (obrig) falha(400, `Preencha: ${rotulo}.`);
      return v === "" ? null : v;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) falha(400, `${rotulo}: use a data no formato AAAA-MM-DD.`);
    return String(v);
  },
  url(v) {
    const s = V.texto(v, 200, { rotulo: "endereço" });
    if (!s) return s;
    let u;
    try {
      u = new URL(s);
    } catch {
      falha(400, "Endereço inválido (ex.: https://rh.cliente.com.br).");
    }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) falha(400, "O endereço precisa começar com https://");
    return u.origin;
  },
  email(v, obrig = false) {
    const s = V.texto(v, 160, { obrig, rotulo: "e-mail" });
    if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) falha(400, "E-mail inválido.");
    return s ? s.toLowerCase() : s;
  },
  cnpj(v) {
    const d = String(v ?? "").replace(/\D/g, "");
    if (d.length !== 14 && d.length !== 11) falha(400, "CNPJ (ou CPF) inválido.");
    return d;
  },
};

/** Lê ou cria DATA_DIR/codigo-instalacao.txt */
function codigoDeInstalacao(pasta) {
  const arquivo = join(pasta, "codigo-instalacao.txt");
  if (existsSync(arquivo)) return readFileSync(arquivo, "utf8").trim();
  mkdirSync(pasta, { recursive: true });
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codigo = [...randomBytes(8)].map((b) => letras[b % letras.length]).join("");
  writeFileSync(arquivo, codigo + "\n", { mode: 0o600 });
  console.log(`Instalação nova: código para criar o primeiro usuário em ${arquivo}`);
  return codigo;
}

export function montarCentral({ cfg = configPadrao, caminhoBanco, agora = () => Date.now(), fetchFn = fetch } = {}) {
  if (cfg.producao && !/^https:\/\//.test(cfg.urlPublica)) throw new Error("PUBLIC_URL é obrigatória em produção (ex.: https://central.nexorconsultingit.com.br).");
  const cofre = criarCofre(cfg);
  const assinador = criarAssinador(cfg);
  const repo = abrirBanco(caminhoBanco ?? join(cfg.pastaDados, "central.db"), agora);
  if (cfg.producao && !cfg.codigoInstalacao && repo.contarUsuarios() === 0) cfg = { ...cfg, codigoInstalacao: codigoDeInstalacao(cfg.pastaDados) };
  const asaas = criarAsaas({ cfg, fetchFn });
  const tentativas = new Map();
  const HASH_FALSO = gerarHashSenha(gerarToken());

  function limitar(chave, maximo = cfg.limites.tentativasLogin, janela = 15 * 60_000) {
    const t0 = agora();
    const l = (tentativas.get(chave) ?? []).filter((x) => t0 - x < janela);
    if (l.length >= maximo) falha(429, "Muitas tentativas. Aguarde alguns minutos.");
    l.push(t0);
    tentativas.set(chave, l);
    if (tentativas.size > 10_000) tentativas.delete(tentativas.keys().next().value);
  }

  /* ---------- Regras aplicadas ---------- */
  const hoje = () => hojeBR(agora());
  const faturasAbertas = (cliente_id) => repo.lista("faturas", "WHERE cliente_id = ? AND status = 'aberta'", cliente_id);
  const situacaoDe = (cliente) => situacaoCliente(cliente, faturasAbertas(cliente.id), hoje(), cfg.regrasPadrao);
  const resumoSituacao = (st) => ({ situacao: st.situacao, motivo: st.motivo, mensagem: st.mensagem, atraso: st.atraso, link: st.link, fatura_id: st.fatura?.id ?? null });

  function clientePublico(c) {
    const { asaas_cliente_id, ...resto } = c;
    return { ...resto, regras: { ...cfg.regrasPadrao, ...c.regras }, asaas: Boolean(asaas_cliente_id), ...resumoSituacao(situacaoDe(c)) };
  }
  const online = (s) => Boolean(s.ultimo_contato && agora() - s.ultimo_contato < ONLINE_MS);
  const sistemaPublico = (s) => {
    const { token_hash, ...resto } = s;
    return { ...resto, online: online(s), produto_nome: PRODUTOS[s.produto] ?? s.produto, acesso: COM_ACESSO.has(s.produto) };
  };

  /** Gera as mensalidades devidas e manda para o Asaas as que ainda não têm cobrança */
  async function rotina() {
    const criadas = [];
    for (const c of repo.lista("clientes", "WHERE status = 'ativo'")) {
      const existentes = repo.lista("faturas", "WHERE cliente_id = ? AND competencia IS NOT NULL", c.id);
      for (const n of mensalidadesDevidas(c, existentes, hoje(), cfg.regrasPadrao)) {
        try {
          criadas.push(repo.inserir("faturas", { cliente_id: c.id, ...n }));
        } catch (e) {
          if (!String(e.message).includes("UNIQUE")) throw e;
        }
      }
    }
    if (asaas.ativo) {
      for (const f of repo.lista("faturas", "WHERE status = 'aberta' AND externo_id IS NULL ORDER BY vencimento LIMIT 50")) {
        const c = repo.obter("clientes", f.cliente_id);
        try {
          const r = await asaas.cobrar(c, f);
          if (r.cliente_id !== c.asaas_cliente_id) repo.atualizar("clientes", c.id, { asaas_cliente_id: r.cliente_id });
          repo.atualizar("faturas", f.id, { externo_id: r.id, link: r.link, erro_cobranca: null });
        } catch (e) {
          repo.atualizar("faturas", f.id, { erro_cobranca: String(e.message).slice(0, 300) });
        }
      }
    }
    return criadas;
  }

  /* ---------- Sessão ---------- */
  function sessao(cookies) {
    const s = cookies[COOKIE] ? repo.sessao(sha256(cookies[COOKIE])) : null;
    if (!s) return null;
    const u = repo.obter("usuarios", s.usuario_id);
    return u?.ativo ? { ...u, sessao: s } : null;
  }
  function abrirSessao(res, usuario_id, fase) {
    const token = gerarToken();
    repo.criarSessao(sha256(token), usuario_id, fase === "ok" ? cfg.sessaoHoras : 0.25, fase);
    const a = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${Math.round((fase === "ok" ? cfg.sessaoHoras : 0.25) * 3600)}`];
    if (cfg.producao) a.push("Secure");
    res.setHeader("Set-Cookie", a.join("; "));
    return token;
  }
  const usuarioPublico = ({ senha_hash, totp, ...u }) => ({ ...u, totp: Boolean(totp) });

  /* ---------- Rotas ---------- */
  const rotas = [];
  const rota = (metodo, caminho, opcoes, fn) => {
    if (typeof opcoes === "function") [fn, opcoes] = [opcoes, {}];
    const nomes = [];
    const padrao = new RegExp("^" + caminho.replace(/\/:(\w+)/g, (_, n) => (nomes.push(n), "/([^/]+)")) + "$");
    rotas.push({ metodo, padrao, nomes, opcoes, fn });
  };
  const TODOS = { papeis: PAPEIS };
  const FIN = { papeis: ["dono", "financeiro"] };
  const SUP = { papeis: ["dono", "suporte"] };
  const DONO = { papeis: ["dono"] };
  const SUP_FIN = { papeis: ["dono", "financeiro", "suporte"] };
  const auditar = (ctx, acao, cliente_id, detalhe) => repo.auditar(ctx.usuario?.nome ?? "sistema", acao, cliente_id, detalhe);

  // Login: senha → 2FA (configurar na primeira vez) → sessão completa
  rota("GET", "/api/estado", { publico: true }, ({ cookies }) => {
    const u = sessao(cookies);
    return { primeiroAcesso: repo.contarUsuarios() === 0, exigeCodigo: repo.contarUsuarios() === 0 && Boolean(cfg.codigoInstalacao), fase: u?.sessao.fase ?? null };
  });

  async function etapaTotp(res, u) {
    abrirSessao(res, u.id, "senha");
    if (u.totp) return { proximo: "codigo" };
    return { proximo: "configurar" };
  }

  rota("POST", "/api/cadastro", { publico: true }, async (ctx) => {
    if (repo.contarUsuarios() > 0) falha(403, "A Central já tem usuários. Peça um convite ao dono da conta.");
    limitar(`cadastro:${ctx.ip}`);
    const b = await ctx.corpo();
    if (cfg.codigoInstalacao && !iguais(String(b.codigo_instalacao ?? "").trim(), cfg.codigoInstalacao)) falha(403, "Código de instalação incorreto. Ele está no arquivo codigo-instalacao.txt do servidor.");
    const senha = String(b.senha ?? "");
    if (senha.length < 10) falha(400, "A senha precisa ter pelo menos 10 caracteres.");
    const u = repo.inserir("usuarios", { nome: V.texto(b.nome, 120, { obrig: true, rotulo: "nome" }), email: V.email(b.email, true), senha_hash: gerarHashSenha(senha), papel: "dono" });
    repo.auditar(u.nome, "conta_criada");
    return etapaTotp(ctx.res, u);
  });

  rota("POST", "/api/entrar", { publico: true }, async (ctx) => {
    const b = await ctx.corpo();
    const email = V.email(b.email, true);
    limitar(`login:${ctx.ip}`);
    limitar(`login:${email}`);
    const u = repo.usuarioPorEmail(email);
    const ok = conferirSenha(String(b.senha ?? ""), u?.senha_hash ?? HASH_FALSO);
    if (!u || !ok) falha(401, "E-mail ou senha incorretos.");
    return etapaTotp(ctx.res, u);
  });

  // Primeira vez: mostra o QR do aplicativo autenticador
  rota("GET", "/api/totp/novo", { publico: true }, async ({ cookies }) => {
    const u = sessao(cookies);
    if (!u || u.sessao.fase !== "senha" || u.totp) falha(401, "Entre com e-mail e senha primeiro.");
    let segredo = u.sessao.totp_novo ? cofre.decifrar(u.sessao.totp_novo) : null;
    if (!segredo) {
      segredo = novoSegredoTotp();
      repo.rodar("UPDATE sessoes SET totp_novo = ? WHERE token_hash = ?", cofre.cifrar(segredo), u.sessao.token_hash);
    }
    const otpauth = `otpauth://totp/${encodeURIComponent(`Nexor Central:${u.email}`)}?secret=${segredo}&issuer=${encodeURIComponent("Nexor Central")}`;
    return { segredo, qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }) };
  });

  rota("POST", "/api/totp", { publico: true }, async (ctx) => {
    const u = sessao(ctx.cookies);
    if (!u || u.sessao.fase !== "senha") falha(401, "Entre com e-mail e senha primeiro.");
    limitar(`totp:${u.id}`, 6);
    const { codigo } = await ctx.corpo();
    const novo = !u.totp;
    const segredo = novo ? (u.sessao.totp_novo ? cofre.decifrar(u.sessao.totp_novo) : null) : cofre.decifrar(u.totp);
    if (!conferirTotp(segredo, codigo, agora())) falha(401, "Código incorreto. Confira o horário do celular e tente o código novo.");
    if (novo) repo.atualizar("usuarios", u.id, { totp: cofre.cifrar(segredo) });
    repo.rodar("DELETE FROM sessoes WHERE token_hash = ?", u.sessao.token_hash);
    abrirSessao(ctx.res, u.id, "ok");
    repo.atualizar("usuarios", u.id, { ultimo_acesso: agora() });
    repo.auditar(u.nome, "login");
    return { ok: true };
  });

  rota("POST", "/api/sair", { publico: true }, ({ cookies, res }) => {
    if (cookies[COOKIE]) repo.rodar("DELETE FROM sessoes WHERE token_hash = ?", sha256(cookies[COOKIE]));
    res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    return { ok: true };
  });

  rota("GET", "/api/eu", TODOS, ({ usuario }) => ({ usuario: usuarioPublico(usuario), produtos: PRODUTOS, asaas: asaas.ativo, contato: cfg.contato }));

  /* ---------- Visão geral ---------- */
  rota("GET", "/api/painel", TODOS, () => {
    const clientes = repo.lista("clientes", "ORDER BY razao_social").map(clientePublico);
    const ativos = clientes.filter((c) => c.status === "ativo");
    const sistemas = repo.lista("sistemas", "WHERE ativo = 1").map(sistemaPublico);
    const h = hoje();
    const mes = h.slice(0, 7);
    const soma = (sql, ...p) => repo.um(sql, ...p).s ?? 0;
    const porSituacao = { ativo: 0, aviso: 0, restrito: 0, bloqueado: 0 };
    for (const c of ativos) porSituacao[c.situacao]++;
    const alertas = [];
    for (const c of clientes) if (c.status === "ativo" && c.situacao !== "ativo") alertas.push({ tipo: c.situacao, cliente_id: c.id, texto: `${c.nome_fantasia || c.razao_social}: ${c.situacao === "aviso" ? "fatura em atraso" : c.situacao === "restrito" ? "em modo somente leitura" : "sistema bloqueado"}${c.atraso ? ` (${c.atraso} dias)` : ""}` });
    for (const s of sistemas) {
      const c = clientes.find((x) => x.id === s.cliente_id);
      if (!s.online) alertas.push({ tipo: "offline", cliente_id: s.cliente_id, sistema_id: s.id, texto: `${c?.nome_fantasia || c?.razao_social}: ${s.produto_nome} ${s.ultimo_contato ? "sem contato" : "ainda não conectou"}` });
      const bk = s.saude?.backup_ultimo;
      if (s.online && s.produto === "rh" && (!bk || agora() - bk > 36 * 3600_000)) alertas.push({ tipo: "backup", cliente_id: s.cliente_id, sistema_id: s.id, texto: `${c?.nome_fantasia || c?.razao_social}: backup ${bk ? "atrasado" : "não encontrado"}` });
    }
    const ordem = { bloqueado: 0, restrito: 1, offline: 2, backup: 3, aviso: 4 };
    alertas.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
    return {
      clientes: { total: ativos.length, cancelados: clientes.length - ativos.length, porSituacao },
      financeiro: {
        mrr: ativos.reduce((s, c) => s + c.valor_centavos, 0),
        vencido: soma("SELECT SUM(valor_centavos) s FROM faturas WHERE status = 'aberta' AND vencimento < ?", h),
        a_vencer: soma("SELECT SUM(valor_centavos) s FROM faturas WHERE status = 'aberta' AND vencimento >= ?", h),
        recebido_mes: soma("SELECT SUM(valor_centavos) s FROM faturas WHERE status = 'paga' AND substr(pago_em, 1, 7) = ?", mes),
      },
      sistemas: { total: sistemas.length, online: sistemas.filter((s) => s.online).length, porProduto: Object.fromEntries(Object.keys(PRODUTOS).map((p) => [p, sistemas.filter((s) => s.produto === p).length])) },
      alertas: alertas.slice(0, 50),
      proximas: repo.lista("faturas", "WHERE status = 'aberta' AND vencimento >= ? ORDER BY vencimento LIMIT 8", h).map((f) => ({ ...f, cliente: clientes.find((c) => c.id === f.cliente_id)?.nome_fantasia || clientes.find((c) => c.id === f.cliente_id)?.razao_social })),
    };
  });

  /* ---------- Clientes ---------- */
  function dadosCliente(b, parcial) {
    const regras = b.regras
      ? {
          aviso: V.inteiro(b.regras.aviso, 0, 60, "dias para o aviso"),
          restrito: V.inteiro(b.regras.restrito, 1, 90, "dias para somente leitura"),
          bloqueio: V.inteiro(b.regras.bloqueio, 1, 120, "dias para o bloqueio"),
          antecedencia: V.inteiro(b.regras.antecedencia, 0, 30, "antecedência da fatura"),
          manter_ponto: b.regras.manter_ponto === undefined ? undefined : Boolean(b.regras.manter_ponto),
        }
      : undefined;
    if (regras) {
      for (const k of Object.keys(regras)) if (regras[k] === undefined) delete regras[k];
      const r = { ...cfg.regrasPadrao, ...regras };
      if (!(r.aviso <= r.restrito && r.restrito <= r.bloqueio)) falha(400, "Os prazos precisam seguir a ordem: aviso ≤ somente leitura ≤ bloqueio.");
    }
    return {
      razao_social: V.texto(b.razao_social, 150, { obrig: !parcial, rotulo: "razão social" }),
      nome_fantasia: V.texto(b.nome_fantasia, 150),
      cnpj: b.cnpj !== undefined || !parcial ? V.cnpj(b.cnpj) : undefined,
      contato_nome: V.texto(b.contato_nome, 120),
      email: V.email(b.email),
      telefone: V.texto(b.telefone, 30),
      cidade: V.texto(b.cidade, 80),
      plano: V.texto(b.plano, 80),
      valor_centavos: V.inteiro(b.valor_centavos, 0, 100_000_000, "mensalidade"),
      dia_vencimento: V.inteiro(b.dia_vencimento, 1, 31, "dia do vencimento"),
      inicio_cobranca: V.data(b.inicio_cobranca, "início da cobrança"),
      observacoes: V.texto(b.observacoes, 2000),
      regras,
    };
  }
  const exigirCliente = (id) => repo.obter("clientes", id) ?? falha(404, "Cliente não encontrado.");

  rota("GET", "/api/clientes", TODOS, () => repo.lista("clientes", "ORDER BY razao_social").map((c) => ({ ...clientePublico(c), sistemas: repo.lista("sistemas", "WHERE cliente_id = ? AND ativo = 1", c.id).map(sistemaPublico) })));
  rota("POST", "/api/clientes", FIN, async (ctx) => {
    const d = dadosCliente(await ctx.corpo(), false);
    const c = repo.inserir("clientes", { ...d, inicio_cobranca: d.inicio_cobranca ?? hoje(), regras: d.regras ?? {}, codigo: novoCodigo() });
    auditar(ctx, "cliente_criado", c.id, { razao_social: c.razao_social });
    await rotina();
    return clientePublico(repo.obter("clientes", c.id));
  });
  rota("GET", "/api/clientes/:id", TODOS, ({ params }) => {
    const c = exigirCliente(params.id);
    return {
      ...clientePublico(c),
      sistemas: repo.lista("sistemas", "WHERE cliente_id = ? ORDER BY criado_em", c.id).map(sistemaPublico),
      faturas: repo.lista("faturas", "WHERE cliente_id = ? ORDER BY vencimento DESC LIMIT 60", c.id),
      historico: repo.lista("auditoria", "WHERE cliente_id = ? ORDER BY criado_em DESC LIMIT 40", c.id),
    };
  });
  rota("PUT", "/api/clientes/:id", FIN, async (ctx) => {
    const c = exigirCliente(ctx.params.id);
    const d = dadosCliente(await ctx.corpo(), true);
    if (d.regras) d.regras = { ...c.regras, ...d.regras };
    const novo = repo.atualizar("clientes", c.id, d);
    auditar(ctx, "cliente_alterado", c.id, Object.keys(d).filter((k) => d[k] !== undefined));
    return clientePublico(novo);
  });
  rota("POST", "/api/clientes/:id/bloquear", FIN, async (ctx) => {
    const c = exigirCliente(ctx.params.id);
    const motivo = V.texto((await ctx.corpo()).motivo, 200, { obrig: true, rotulo: "motivo" });
    auditar(ctx, "bloqueio_manual", c.id, { motivo });
    return clientePublico(repo.atualizar("clientes", c.id, { bloqueio_manual: motivo, liberado_ate: null }));
  });
  // Desbloqueia: tira o bloqueio manual e, se informado, libera até uma data mesmo com fatura em atraso
  rota("POST", "/api/clientes/:id/desbloquear", FIN, async (ctx) => {
    const c = exigirCliente(ctx.params.id);
    const b = await ctx.corpo();
    const ate = V.data(b.ate, "liberar até");
    if (ate && ate < hoje()) falha(400, "A data de liberação já passou.");
    auditar(ctx, "desbloqueio", c.id, { ate: ate ?? null, motivo: V.texto(b.motivo, 200) ?? null });
    return clientePublico(repo.atualizar("clientes", c.id, { bloqueio_manual: null, liberado_ate: ate ?? null }));
  });
  // Código vazou ou o cliente trocou de responsável: gera outro (os sistemas já vinculados continuam funcionando)
  rota("POST", "/api/clientes/:id/codigo", SUP_FIN, (ctx) => {
    const c = exigirCliente(ctx.params.id);
    auditar(ctx, "codigo_trocado", c.id);
    return clientePublico(repo.atualizar("clientes", c.id, { codigo: novoCodigo() }));
  });
  rota("POST", "/api/clientes/:id/cancelar", DONO, async (ctx) => {
    const c = exigirCliente(ctx.params.id);
    const b = await ctx.corpo();
    const reativar = Boolean(b.reativar);
    auditar(ctx, reativar ? "contrato_reativado" : "contrato_cancelado", c.id, { motivo: V.texto(b.motivo, 200) ?? null });
    return clientePublico(repo.atualizar("clientes", c.id, { status: reativar ? "ativo" : "cancelado" }));
  });

  /* ---------- Faturas ---------- */
  const exigirFatura = (id) => repo.obter("faturas", id) ?? falha(404, "Fatura não encontrada.");
  rota("GET", "/api/faturas", TODOS, ({ query }) => {
    const cond = [];
    const p = [];
    const st = query.get("status");
    if (st === "vencida") cond.push("f.status = 'aberta' AND f.vencimento < ?"), p.push(hoje());
    else if (["aberta", "paga", "cancelada"].includes(st)) cond.push("f.status = ?"), p.push(st);
    if (query.get("cliente")) cond.push("f.cliente_id = ?"), p.push(query.get("cliente"));
    if (/^\d{4}-\d{2}$/.test(query.get("mes") ?? "")) cond.push("substr(f.vencimento, 1, 7) = ?"), p.push(query.get("mes"));
    return repo.todos(`SELECT f.*, COALESCE(c.nome_fantasia, c.razao_social) cliente FROM faturas f JOIN clientes c ON c.id = f.cliente_id ${cond.length ? `WHERE ${cond.join(" AND ")}` : ""} ORDER BY f.vencimento DESC LIMIT 500`, ...p);
  });
  rota("POST", "/api/faturas", FIN, async (ctx) => {
    const b = await ctx.corpo();
    const c = exigirCliente(b.cliente_id);
    const f = repo.inserir("faturas", { cliente_id: c.id, descricao: V.texto(b.descricao, 200, { obrig: true, rotulo: "descrição" }), valor_centavos: V.inteiro(b.valor_centavos, 1, 100_000_000, "valor") ?? falha(400, "Informe o valor."), vencimento: V.data(b.vencimento, "vencimento", true), link: V.url(b.link) ?? null });
    auditar(ctx, "fatura_criada", c.id, { fatura: f.id, valor: f.valor_centavos });
    await rotina();
    return repo.obter("faturas", f.id);
  });
  rota("POST", "/api/faturas/gerar", FIN, async (ctx) => {
    const criadas = await rotina();
    auditar(ctx, "faturas_geradas", null, { quantidade: criadas.length });
    return { criadas: criadas.length };
  });
  rota("POST", "/api/faturas/:id/pagar", FIN, async (ctx) => {
    const f = exigirFatura(ctx.params.id);
    if (f.status === "paga") falha(409, "Esta fatura já está paga.");
    const b = await ctx.corpo();
    const data = V.data(b.data, "data do pagamento") ?? hoje();
    auditar(ctx, "fatura_paga", f.cliente_id, { fatura: f.id, forma: b.forma ?? "manual" });
    return repo.atualizar("faturas", f.id, { status: "paga", pago_em: data, forma: V.texto(b.forma, 40) ?? "manual" });
  });
  rota("POST", "/api/faturas/:id/reabrir", FIN, (ctx) => {
    const f = exigirFatura(ctx.params.id);
    auditar(ctx, "fatura_reaberta", f.cliente_id, { fatura: f.id });
    return repo.atualizar("faturas", f.id, { status: "aberta", pago_em: null, forma: null });
  });
  rota("POST", "/api/faturas/:id/cancelar", FIN, async (ctx) => {
    const f = exigirFatura(ctx.params.id);
    if (f.status === "paga") falha(409, "Fatura paga não pode ser cancelada. Reabra antes, se for o caso.");
    await asaas.cancelar(f.externo_id).catch(() => {});
    auditar(ctx, "fatura_cancelada", f.cliente_id, { fatura: f.id });
    return repo.atualizar("faturas", f.id, { status: "cancelada" });
  });
  rota("PUT", "/api/faturas/:id", FIN, async (ctx) => {
    const f = exigirFatura(ctx.params.id);
    if (f.status !== "aberta") falha(409, "Só faturas em aberto podem ser alteradas.");
    const b = await ctx.corpo();
    auditar(ctx, "fatura_alterada", f.cliente_id, { fatura: f.id });
    return repo.atualizar("faturas", f.id, { vencimento: V.data(b.vencimento, "vencimento"), valor_centavos: V.inteiro(b.valor_centavos, 1, 100_000_000, "valor"), descricao: V.texto(b.descricao, 200), link: b.link === undefined ? undefined : V.url(b.link) });
  });

  /* ---------- Sistemas instalados ---------- */
  const exigirSistema = (id) => repo.obter("sistemas", id) ?? falha(404, "Sistema não encontrado.");
  function credenciais(s, token) {
    return {
      token,
      // No .env do pacote de implantação, Atende e Agente usam nomes com prefixo (cada sistema tem o seu token)
      env: [`NEXOR_CENTRAL_URL=${cfg.urlPublica || "http://localhost:" + cfg.porta}`, `NEXOR_CHAVE_PUBLICA=${assinador.chavePublica}`, `${PREFIXO_ENV[s.produto] ?? ""}NEXOR_INSTANCIA=${s.id}`, `${PREFIXO_ENV[s.produto] ?? ""}NEXOR_TOKEN=${token}`].join("\n"),
    };
  }
  rota("GET", "/api/sistemas", TODOS, () => repo.todos("SELECT s.*, COALESCE(c.nome_fantasia, c.razao_social) cliente FROM sistemas s JOIN clientes c ON c.id = s.cliente_id ORDER BY c.razao_social, s.produto").map((s) => ({ ...sistemaPublico(repo.ler("sistemas", s)), cliente: s.cliente })));
  rota("POST", "/api/clientes/:id/sistemas", SUP, async (ctx) => {
    const c = exigirCliente(ctx.params.id);
    const b = await ctx.corpo();
    if (!PRODUTOS[b.produto]) falha(400, "Escolha o produto.");
    const token = `nxs_${gerarToken(32)}`;
    const s = repo.inserir("sistemas", { cliente_id: c.id, produto: b.produto, nome: V.texto(b.nome, 80) ?? PRODUTOS[b.produto], url: V.url(b.url) ?? null, token_hash: sha256(token), prefixo: token.slice(0, 10) });
    auditar(ctx, "sistema_criado", c.id, { sistema: s.id, produto: s.produto });
    return { sistema: sistemaPublico(s), ...credenciais(s, token) };
  });
  rota("PUT", "/api/sistemas/:id", SUP, async (ctx) => {
    const s = exigirSistema(ctx.params.id);
    const b = await ctx.corpo();
    auditar(ctx, "sistema_alterado", s.cliente_id, { sistema: s.id });
    return sistemaPublico(repo.atualizar("sistemas", s.id, { nome: V.texto(b.nome, 80), url: b.url === undefined ? undefined : V.url(b.url), ativo: b.ativo === undefined ? undefined : Boolean(b.ativo) }));
  });
  rota("POST", "/api/sistemas/:id/token", SUP, (ctx) => {
    const s = exigirSistema(ctx.params.id);
    const token = `nxs_${gerarToken(32)}`;
    repo.atualizar("sistemas", s.id, { token_hash: sha256(token), prefixo: token.slice(0, 10) });
    auditar(ctx, "sistema_token_trocado", s.cliente_id, { sistema: s.id });
    return credenciais(s, token);
  });
  // Acesso de suporte: link assinado, válido por 2 minutos e de uso único, que abre o sistema do cliente
  // como "Suporte Nexor" (administrador com as opções de desenvolvedor). Fica registrado aqui e na auditoria do cliente.
  rota("POST", "/api/sistemas/:id/acesso", SUP, (ctx) => {
    const s = exigirSistema(ctx.params.id);
    if (!s.ativo) falha(409, "Sistema desativado.");
    if (!COM_ACESSO.has(s.produto)) falha(400, "O acesso direto de suporte está disponível para o Nexor RH, o Atende IA e o Nexor Contábil.");
    if (!s.url) falha(400, "Cadastre o endereço do sistema (ex.: https://rh.cliente.com.br) antes.");
    const token = assinador.assinar({ v: 1, tipo: "acesso", inst: s.id, nome: ctx.usuario.nome, email: ctx.usuario.email, exp: agora() + cfg.acessoSegundos * 1000, nonce: gerarToken(16) });
    auditar(ctx, "acesso_suporte", s.cliente_id, { sistema: s.id });
    return { url: `${s.url}/api/nexor/entrar?t=${token}` };
  });
  rota("GET", "/api/chave-publica", TODOS, () => ({ chave: assinador.chavePublica }));

  // Sincronização: o sistema do cliente manda a saúde (só contagens, nenhum dado pessoal) e recebe a licença
  const SAUDE = { colaboradores: "n", usuarios: "n", empresas: "n", marcacoes_hoje: "n", banco_mb: "n", disco_livre_mb: "n", backup_ultimo: "n", uptime_s: "n", node: "s", erros_24h: "n", conversas_hoje: "n", conectores: "n", carteira: "n", documentos_mes: "n", pendencias: "n", tarefas_atrasadas: "n" };
  // Vinculação imediata: o sistema instalado no cliente manda o código do cliente (NX-XXXX-XXXX) e recebe a
  // instância, o token e a chave pública. Reinstalação do mesmo produto no mesmo endereço reaproveita a instância.
  rota("POST", "/api/v1/vincular", { publico: true, maquina: true }, async (ctx) => {
    limitar(`vincular:${ctx.ip}`, 10);
    const b = await ctx.corpo();
    const codigo = normalizarCodigo(b.codigo);
    const c = codigo ? repo.um("SELECT * FROM clientes WHERE codigo = ?", codigo) : null;
    if (!c) {
      repo.auditar("sistema", "vinculacao_recusada", null, { ip: ctx.ip, produto: String(b.produto ?? "").slice(0, 20) });
      falha(404, "Código do cliente não encontrado. Confira na Nexor Central (Clientes → cliente → Código).");
    }
    if (c.status !== "ativo") falha(409, "Contrato deste cliente está encerrado na Nexor Central.");
    if (!PRODUTOS[b.produto]) falha(400, "Produto desconhecido.");
    let url = null;
    try {
      url = b.url ? V.url(b.url) : null;
    } catch {
      url = null;
    }
    const token = `nxs_${gerarToken(32)}`;
    const existente = url ? repo.um("SELECT * FROM sistemas WHERE cliente_id = ? AND produto = ? AND url = ?", c.id, b.produto, url) : null;
    let s;
    if (existente) s = repo.atualizar("sistemas", existente.id, { token_hash: sha256(token), prefixo: token.slice(0, 10), ativo: true });
    else s = repo.inserir("sistemas", { cliente_id: c.id, produto: b.produto, nome: V.texto(b.nome, 80) ?? PRODUTOS[b.produto], url, token_hash: sha256(token), prefixo: token.slice(0, 10) });
    repo.auditar("sistema", "sistema_vinculado", c.id, { sistema: s.id, produto: s.produto, url, ip: ctx.ip, reaproveitado: Boolean(existente) });
    return { instancia: s.id, token, chave_publica: assinador.chavePublica, cliente: c.nome_fantasia || c.razao_social };
  });

  rota("POST", "/api/v1/sincronizar", { publico: true, maquina: true }, async (ctx) => {
    const token = String(ctx.req.headers.authorization ?? "").match(/^Bearer\s+(nxs_[\w-]{20,80})$/)?.[1];
    limitar(`sync:${ctx.ip}`, 120, 5 * 60_000);
    const s = token ? repo.um("SELECT * FROM sistemas WHERE token_hash = ?", sha256(token)) : null;
    if (!s) falha(401, "Credencial do sistema inválida.");
    const sis = repo.ler("sistemas", s);
    const b = await ctx.corpo();
    const saude = {};
    for (const [k, tipo] of Object.entries(SAUDE)) {
      const v = b.saude?.[k];
      if (tipo === "n" && Number.isFinite(v)) saude[k] = v;
      if (tipo === "s" && typeof v === "string") saude[k] = v.slice(0, 40);
    }
    const c = repo.obter("clientes", sis.cliente_id);
    const st = sis.ativo ? situacaoDe(c) : { situacao: "bloqueado", mensagem: "Instalação desativada pela Nexor.", link: null, regras: { ...cfg.regrasPadrao, ...c.regras } };
    if (st.situacao !== sis.situacao) repo.auditar("sistema", "situacao_aplicada", c.id, { sistema: sis.id, de: sis.situacao, para: st.situacao });
    repo.atualizar("sistemas", sis.id, { ultimo_contato: agora(), versao: V.texto(b.versao, 30) ?? sis.versao, saude, ip: ctx.ip, situacao: st.situacao });
    return { licenca: assinador.assinar(conteudoLicenca(sis, c, st, agora(), cfg.licencaDias, cfg.contato)), hora: agora() };
  });

  // Webhook do Asaas: confere o token configurado no painel do Asaas (Integrações → Webhooks)
  rota("POST", "/api/webhooks/asaas", { publico: true, maquina: true }, async (ctx) => {
    if (!cfg.asaas.webhookToken || !iguais(String(ctx.req.headers["asaas-access-token"] ?? ""), cfg.asaas.webhookToken)) falha(401, "não autorizado");
    const b = await ctx.corpo();
    const acao = acaoDoEvento(b.event);
    const p = b.payment ?? {};
    if (!acao) return { ok: true, ignorado: true };
    const f = (p.id && repo.um("SELECT id FROM faturas WHERE externo_id = ?", String(p.id))) || (p.externalReference && repo.um("SELECT id FROM faturas WHERE id = ?", String(p.externalReference)));
    if (!f) return { ok: true, ignorado: true };
    const fat = repo.obter("faturas", f.id);
    if (acao === "paga") repo.atualizar("faturas", fat.id, { status: "paga", pago_em: /^\d{4}-\d{2}-\d{2}$/.test(p.paymentDate ?? "") ? p.paymentDate : hoje(), forma: String(p.billingType ?? "asaas").toLowerCase().slice(0, 40), externo_id: fat.externo_id ?? String(p.id ?? "") });
    else if (acao === "aberta") repo.atualizar("faturas", fat.id, { status: "aberta", pago_em: null, forma: null });
    else if (fat.status !== "paga") repo.atualizar("faturas", fat.id, { status: "cancelada" });
    repo.auditar("Asaas", `webhook_${acao}`, fat.cliente_id, { fatura: fat.id, evento: b.event });
    return { ok: true };
  });

  /* ---------- Equipe e auditoria ---------- */
  rota("GET", "/api/usuarios", DONO, () => repo.lista("usuarios", "ORDER BY nome").map(usuarioPublico));
  rota("POST", "/api/usuarios", DONO, async (ctx) => {
    const b = await ctx.corpo();
    if (!PAPEIS.includes(b.papel)) falha(400, "Escolha o perfil.");
    const email = V.email(b.email, true);
    if (repo.um("SELECT 1 FROM usuarios WHERE email = ?", email)) falha(409, "Já existe um usuário com este e-mail.");
    if (String(b.senha ?? "").length < 10) falha(400, "A senha provisória precisa ter pelo menos 10 caracteres.");
    const u = repo.inserir("usuarios", { nome: V.texto(b.nome, 120, { obrig: true, rotulo: "nome" }), email, papel: b.papel, senha_hash: gerarHashSenha(String(b.senha)) });
    auditar(ctx, "usuario_criado", null, { email, papel: b.papel });
    return usuarioPublico(u);
  });
  rota("PUT", "/api/usuarios/:id", DONO, async (ctx) => {
    const u = repo.obter("usuarios", ctx.params.id) ?? falha(404, "Usuário não encontrado.");
    const b = await ctx.corpo();
    if (u.id === ctx.usuario.id && (b.ativo === false || (b.papel && b.papel !== u.papel))) falha(400, "Você não pode mudar o próprio perfil.");
    if (b.papel && !PAPEIS.includes(b.papel)) falha(400, "Perfil inválido.");
    if (b.senha !== undefined && String(b.senha).length < 10) falha(400, "A senha precisa ter pelo menos 10 caracteres.");
    const novo = repo.atualizar("usuarios", u.id, { nome: V.texto(b.nome, 120), papel: b.papel, ativo: b.ativo === undefined ? undefined : Boolean(b.ativo), senha_hash: b.senha ? gerarHashSenha(String(b.senha)) : undefined, totp: b.zerar_2fa ? null : undefined });
    if (b.ativo === false || b.senha || b.zerar_2fa) repo.rodar("DELETE FROM sessoes WHERE usuario_id = ?", u.id);
    auditar(ctx, "usuario_alterado", null, { email: u.email, zerar_2fa: Boolean(b.zerar_2fa) });
    return usuarioPublico(novo);
  });
  rota("PUT", "/api/eu/senha", TODOS, async (ctx) => {
    const b = await ctx.corpo();
    if (!conferirSenha(String(b.atual ?? ""), ctx.usuario.senha_hash)) falha(400, "Senha atual incorreta.");
    if (String(b.nova ?? "").length < 10) falha(400, "A senha nova precisa ter pelo menos 10 caracteres.");
    repo.atualizar("usuarios", ctx.usuario.id, { senha_hash: gerarHashSenha(String(b.nova)) });
    repo.rodar("DELETE FROM sessoes WHERE usuario_id = ? AND token_hash != ?", ctx.usuario.id, ctx.usuario.sessao.token_hash);
    return { ok: true };
  });
  rota("GET", "/api/auditoria", TODOS, ({ query }) => repo.todos("SELECT a.*, COALESCE(c.nome_fantasia, c.razao_social) cliente FROM auditoria a LEFT JOIN clientes c ON c.id = a.cliente_id ORDER BY a.criado_em DESC LIMIT ?", Math.min(500, Number(query.get("limite")) || 200)).map((r) => repo.ler("auditoria", r)));

  /* ---------- HTTP ---------- */
  async function tratarApi(req, res, url) {
    const cookies = lerCookies(req.headers.cookie);
    let caminhoExiste = false;
    let achada = null;
    let params = {};
    for (const r of rotas) {
      const m = r.padrao.exec(url.pathname);
      if (!m) continue;
      caminhoExiste = true;
      if (r.metodo !== req.method) continue;
      achada = r;
      params = Object.fromEntries(r.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      break;
    }
    if (!achada) return json(res, caminhoExiste ? 405 : 404, { erro: caminhoExiste ? "método não permitido" : "não encontrado" });
    if (req.method !== "GET" && !achada.opcoes.maquina && req.headers["x-nexor"] !== "1") return json(res, 403, { erro: "requisição recusada" });
    let usuario = null;
    if (!achada.opcoes.publico) {
      usuario = sessao(cookies);
      if (!usuario || usuario.sessao.fase !== "ok") return json(res, 401, { erro: "Faça login para continuar." });
      if (!achada.opcoes.papeis.includes(usuario.papel)) return json(res, 403, { erro: "Seu perfil não tem permissão para esta ação." });
    }
    let lido;
    const ctx = {
      req,
      res,
      params,
      cookies,
      usuario,
      query: url.searchParams,
      ip: ipCliente(req, cfg.proxies),
      corpo: async () => {
        if (lido === undefined) {
          const b = await lerCorpo(req);
          try {
            lido = b.length ? JSON.parse(b.toString("utf8")) : {};
          } catch {
            throw new ErroHttp(400, "JSON inválido.");
          }
          if (!lido || typeof lido !== "object") lido = {};
        }
        return lido;
      },
    };
    const r = await achada.fn(ctx);
    if (r !== undefined) json(res, 200, r);
  }

  async function estatico(caminho, res) {
    let rel = decodeURIComponent(caminho).replace(/^\/+/, "") || "index.html";
    let alvo = normalize(join(PUBLICO, rel));
    if (alvo !== PUBLICO && !alvo.startsWith(PUBLICO + sep)) return false;
    let info = await stat(alvo).catch(() => null);
    if (!info && !extname(alvo)) {
      alvo = join(PUBLICO, "index.html");
      info = await stat(alvo).catch(() => null);
    }
    if (!info?.isFile()) return false;
    res.writeHead(200, { "Content-Type": TIPOS[extname(alvo)] ?? "application/octet-stream", "Cache-Control": alvo.endsWith(".html") ? "no-cache" : "public, max-age=3600", "Permissions-Policy": "camera=(), geolocation=(), microphone=()" });
    res.end(await readFile(alvo));
    return true;
  }

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", CSP);
    if (cfg.producao) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    try {
      if (url.pathname === "/health") return json(res, 200, { ok: true });
      if (url.pathname.startsWith("/api/")) return await tratarApi(req, res, url);
      if (req.method === "GET" && (await estatico(url.pathname, res))) return;
      json(res, 404, { erro: "não encontrado" });
    } catch (err) {
      const status = err.status ?? 500;
      if (status >= 500) console.error("[central]", err);
      json(res, status, { erro: status < 500 ? err.message : "Erro interno." });
    }
  });

  let relogio = null;
  return {
    servidor,
    repo,
    cfg,
    assinador,
    rotina,
    situacaoDe,
    iniciarRotina() {
      setTimeout(() => rotina().catch((e) => console.error("[rotina]", e)), 5_000).unref();
      relogio = setInterval(() => rotina().catch((e) => console.error("[rotina]", e)), 3600_000);
      relogio.unref();
    },
    fechar() {
      clearInterval(relogio);
      servidor.close();
      repo.fechar();
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const app = montarCentral();
  app.iniciarRotina();
  app.servidor.listen(app.cfg.porta, () => {
    console.log(`Nexor Central no ar em http://localhost:${app.cfg.porta}`);
    console.log(`Chave pública das licenças (NEXOR_CHAVE_PUBLICA): ${app.assinador.chavePublica}`);
  });
  const desligar = () => (app.fechar(), process.exit(0));
  process.on("SIGINT", desligar);
  process.on("SIGTERM", desligar);
}
