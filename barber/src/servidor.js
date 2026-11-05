/* Servidor do Nexor Barber.
   /                  → painel da barbearia (public/index.html)
   /app/              → app do cliente (PWA: instala no celular)
   /api/*             → API do painel; /api/app/* → API do app do cliente
   /webhook/whatsapp  → WhatsApp da barbearia (API oficial da Meta)
   /webhook/asaas     → pagamentos do clube de assinatura
   /health            → verificação de saúde */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as configPadrao } from "./config.js";
import { abrirBanco } from "./db.js";
import { criarApi } from "./http/api.js";
import { ErroHttp, json, lerCookies, lerCorpo } from "./http/roteador.js";
import { criarCentralNexor, recusaPorTeste } from "./nexor/central.js";
import { CATALOGO as CATALOGO_NEXOR, LIMITES_TESTE, bloqueadoPorAjuste, recusaPorLicenca } from "./nexor/politica.js";
import { hojeBR, paraMs } from "./regras/datas.js";
import { criarCofre, iguais } from "./seguranca.js";
import { assinaturaMetaValida, criarGoogle } from "./servicos/canais.js";
import { ErroRegra, criarNucleo } from "./servicos/nucleo.js";

const PUBLICO = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const CSP_PAINEL = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'";
// O app do cliente carrega o botão "Entrar com Google" (Google Identity Services)
const CSP_APP = "default-src 'self'; img-src 'self' data: blob: https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://accounts.google.com/gsi/client; frame-src https://accounts.google.com/gsi/; connect-src 'self' https://accounts.google.com/gsi/; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export function ipCliente(req, proxies = 1) {
  const direto = String(req.socket?.remoteAddress ?? "");
  if (!proxies) return direto;
  const lista = String(req.headers["x-forwarded-for"] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return lista.length ? (lista[Math.max(0, lista.length - proxies)] ?? direto) : direto;
}

export function conferirEnderecoPublico(cfg) {
  if (!cfg.producao) return;
  let u;
  try {
    u = new URL(cfg.urlPublica);
  } catch {
    throw new Error("PUBLIC_URL é obrigatória em produção (ex.: https://agenda.suabarbearia.com.br).");
  }
  if (u.protocol !== "https:") throw new Error("PUBLIC_URL precisa começar com https:// em produção.");
  if (u.pathname !== "/" || u.search || u.hash || u.username) throw new Error("PUBLIC_URL deve ser só o endereço, sem caminho.");
}

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

/** Saúde enviada à Nexor Central: só contagens, nenhum dado de cliente */
function saudeDaInstalacao(repo, cfg, agora) {
  const n = (sql, ...p) => repo.um(sql, ...p)?.n ?? 0;
  const h = hojeBR(agora());
  let banco_mb;
  let backup_ultimo;
  try {
    banco_mb = Math.round(statSync(join(cfg.pastaDados, "barber.db")).size / 1048576);
  } catch {
    /* banco em memória (testes) */
  }
  try {
    backup_ultimo = JSON.parse(readFileSync(join(cfg.pastaDados, "ultimo-backup.json"), "utf8")).em;
  } catch {
    /* sem backup ainda */
  }
  return {
    usuarios: n("SELECT COUNT(*) n FROM usuarios WHERE ativo = 1 AND nexor = 0"),
    barbeiros: n("SELECT COUNT(*) n FROM barbeiros WHERE ativo = 1"),
    clientes: n("SELECT COUNT(*) n FROM clientes WHERE ativo = 1"),
    agendamentos_mes: n("SELECT COUNT(*) n FROM agendamentos WHERE inicio >= ? AND status <> 'cancelado'", paraMs(`${h.slice(0, 7)}-01`)),
    assinantes: n("SELECT COUNT(*) n FROM assinaturas WHERE status = 'ativa'"),
    estoque_baixo: n("SELECT COUNT(*) n FROM produtos WHERE ativo = 1 AND estoque <= estoque_minimo"),
    banco_mb,
    backup_ultimo,
    uptime_s: Math.round(process.uptime()),
    node: process.version,
  };
}

/** Monta todas as peças. Os testes trocam o relógio e o fetch (Meta, SMS, Google, Asaas, Central). */
export function montarAplicacao({ cfg = configPadrao, caminhoBanco, agora = () => Date.now(), fetchFn = fetch } = {}) {
  conferirEnderecoPublico(cfg);
  const cofre = criarCofre(cfg);
  const repo = abrirBanco(caminhoBanco ?? join(cfg.pastaDados, "barber.db"), agora);
  if (cfg.producao && !cfg.codigoInstalacao && repo.contarUsuarios() === 0) cfg = { ...cfg, codigoInstalacao: codigoDeInstalacao(cfg.pastaDados) };
  const central = criarCentralNexor({ cfg, agora, fetchFn, produto: "barber", versao: cfg.sistema.versao, saude: () => saudeDaInstalacao(repo, cfg, agora) });
  const nucleo = criarNucleo({ repo, cofre, cfg, fetchFn, agora });
  const google = criarGoogle({ url: cfg.google.certificados, fetchFn, agora });
  const api = criarApi({ repo, nucleo, cofre, cfg, central, agora, google });
  const pausado = () => central.estado().situacao === "bloqueado";

  async function arquivoEstatico(caminho, res) {
    let rel;
    try {
      rel = decodeURIComponent(caminho).replace(/^\/+/, "");
    } catch {
      return false;
    }
    if (rel.includes("\0")) return false;
    const app = rel === "app" || rel.startsWith("app/");
    if (rel === "" || rel === "app") rel = app ? "app/index.html" : "index.html";
    let alvo = normalize(join(PUBLICO, rel));
    if (alvo !== PUBLICO && !alvo.startsWith(PUBLICO + sep)) return false;
    let info = await stat(alvo).catch(() => null);
    if (info?.isDirectory()) {
      alvo = join(alvo, "index.html");
      info = await stat(alvo).catch(() => null);
    }
    if (!info && !extname(alvo)) {
      alvo = join(PUBLICO, app ? "app" : "", "index.html");
      info = await stat(alvo).catch(() => null);
    }
    if (!info?.isFile()) return false;
    const html = alvo.endsWith(".html");
    res.setHeader("Content-Security-Policy", app ? CSP_APP : CSP_PAINEL);
    res.writeHead(200, { "Content-Type": TIPOS[extname(alvo)] ?? "application/octet-stream", "Cache-Control": html || alvo.endsWith("sw.js") ? "no-cache" : "public, max-age=3600", "Permissions-Policy": "camera=(), geolocation=(), microphone=()" });
    res.end(await readFile(alvo));
    return true;
  }

  async function tratarApi(req, res, url) {
    const { rota, params, caminhoExiste } = api.roteador.encontrar(req.method, url.pathname);
    if (!rota) return json(res, caminhoExiste ? 405 : 404, { erro: caminhoExiste ? "método não permitido" : "não encontrado" });
    // Proteção contra CSRF: o painel e o app sempre mandam este cabeçalho
    if (req.method !== "GET" && req.headers["x-nexor"] !== "1") return json(res, 403, { erro: "requisição recusada" });
    const cookies = lerCookies(req.headers.cookie);
    let usuario = null;
    let cliente = null;
    let barbearia = null;
    if (rota.opcoes.cliente) {
      cliente = api.sessaoCliente(cookies);
      if (!cliente) return json(res, 401, { erro: "Entre para continuar." });
    } else if (!rota.opcoes.publico) {
      usuario = api.sessaoPainel(cookies);
      if (!usuario) return json(res, 401, { erro: "Faça login para continuar." });
      if (rota.opcoes.papeis && !rota.opcoes.papeis.includes(usuario.papel)) return json(res, 403, { erro: "Seu perfil não tem permissão para esta ação." });
      barbearia = nucleo.barbearia();
    }
    if (rota.opcoes.nexor && !usuario?.nexor) return json(res, 403, { erro: "Área exclusiva do Suporte Nexor." });
    if (!usuario?.nexor) {
      const lic = central.estado();
      const recusa = recusaPorLicenca(lic, req.method, url.pathname);
      if (recusa) return json(res, 423, { erro: recusa, codigo: "licenca", situacao: lic.situacao, link: cliente ? null : lic.link });
      // No app do cliente, a mensagem do limite do teste é para o cliente da barbearia, não para o dono
      const teste = recusaPorTeste(lic, req.method, url.pathname, { catalogo: CATALOGO_NEXOR, rotas: LIMITES_TESTE, contar: () => saudeDaInstalacao(repo, cfg, agora) });
      if (teste) return json(res, 402, { erro: url.pathname.startsWith("/api/app/") ? "A agenda online está indisponível no momento. Fale com a barbearia." : teste, codigo: "teste", link: cliente ? null : lic.link });
      const b = barbearia ?? repo.barbearia();
      if (b) {
        const oculto = bloqueadoPorAjuste(repo.ocultos(b.id), req.method, url.pathname);
        if (oculto) return json(res, 403, { erro: `${oculto} não está disponível no seu plano.` });
      }
    }
    let lido;
    const ctx = {
      req,
      res,
      params,
      query: url.searchParams,
      cookies,
      usuario,
      cliente,
      barbearia,
      ip: ipCliente(req, cfg.proxies),
      corpo: async () => {
        if (lido === undefined) {
          const b = await lerCorpo(req, 256 * 1024);
          try {
            lido = b.length ? JSON.parse(b.toString("utf8")) : {};
          } catch {
            throw new ErroHttp(400, "JSON inválido.");
          }
        }
        return lido;
      },
    };
    const resultado = await rota.fn(ctx);
    if (resultado !== undefined && !res.headersSent) json(res, 200, resultado);
  }

  /** WhatsApp: confere a assinatura e responde quem escreve com o link do app (uma vez por dia por número) */
  const respondidos = new Map();
  async function webhookWhatsapp(req, res, url) {
    const b = repo.barbearia();
    const w = b?.config.whatsapp ?? {};
    if (req.method === "GET") {
      const ok = b && url.searchParams.get("hub.mode") === "subscribe" && iguais(url.searchParams.get("hub.verify_token") ?? "", w.verificacao ?? "");
      res.writeHead(ok ? 200 : 403, { "Content-Type": "text/plain" });
      return res.end(ok ? (url.searchParams.get("hub.challenge") ?? "") : "forbidden");
    }
    if (req.method !== "POST") return json(res, 405, { erro: "método não permitido" });
    const corpo = await lerCorpo(req, 1024 * 1024);
    if (!b || !assinaturaMetaValida(corpo, req.headers["x-hub-signature-256"], nucleo.segredo(w.segredo_cripto))) return json(res, 401, { erro: "assinatura inválida" });
    json(res, 200, { ok: true });
    if (pausado() || w.resposta_automatica === false) return;
    let payload;
    try {
      payload = JSON.parse(corpo.toString("utf8"));
    } catch {
      return;
    }
    const hoje = hojeBR(agora());
    for (const e of payload?.entry ?? [])
      for (const c of e.changes ?? [])
        for (const m of c.value?.messages ?? []) {
          if (!m.from || respondidos.get(m.from) === hoje) continue;
          respondidos.set(m.from, hoje);
          if (respondidos.size > 5000) respondidos.delete(respondidos.keys().next().value);
          fila = fila
            .then(() => nucleo.canais().whatsapp.texto(m.from, `Olá! 💈 Aqui é a ${b.nome}. Agende, remarque ou veja seu horário em segundos pelo nosso app: ${nucleo.linkApp()}\nSe precisar falar com a gente, é só escrever por aqui.`))
            .catch((err) => console.error("[whatsapp]", err.message));
        }
  }

  async function webhookAsaas(req, res) {
    if (req.method !== "POST") return json(res, 405, { erro: "método não permitido" });
    const b = repo.barbearia();
    const token = b?.config.asaas?.token_webhook;
    if (!token || !iguais(String(req.headers["asaas-access-token"] ?? ""), token)) return json(res, 401, { erro: "token inválido" });
    const corpo = await lerCorpo(req, 512 * 1024);
    let evento;
    try {
      evento = JSON.parse(corpo.toString("utf8"));
    } catch {
      return json(res, 400, { erro: "JSON inválido" });
    }
    return json(res, 200, nucleo.eventoAsaas(evento));
  }
  let fila = Promise.resolve();

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Content-Security-Policy", CSP_PAINEL);
    if (cfg.producao) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    try {
      if (url.pathname === "/health") return json(res, 200, { ok: true });
      if (url.pathname === "/webhook/whatsapp") return await webhookWhatsapp(req, res, url);
      if (url.pathname === "/webhook/asaas") return await webhookAsaas(req, res);
      if (url.pathname.startsWith("/api/")) return await tratarApi(req, res, url);
      if (req.method === "GET" && (await arquivoEstatico(url.pathname, res))) return;
      json(res, 404, { erro: "não encontrado" });
    } catch (err) {
      const status = err instanceof ErroRegra || err instanceof ErroHttp ? err.status : (err.status ?? 500);
      if (status >= 500 && status !== 502) console.error("[servidor]", err);
      json(res, status, { erro: status < 500 || status === 502 ? err.message : "Erro interno." });
    }
  });

  let relogio = null;
  const rodarRotina = () => (pausado() ? Promise.resolve({}) : nucleo.rotina());
  return {
    servidor,
    repo,
    nucleo,
    central,
    cfg,
    rotina: rodarRotina,
    ocioso: () => fila,
    iniciar() {
      central.iniciar();
      const rodar = () => rodarRotina().catch((e) => console.error("[rotina]", e.message));
      setTimeout(rodar, 10_000).unref();
      relogio = setInterval(rodar, cfg.rotinaMin * 60_000);
      relogio.unref();
    },
    fechar() {
      clearInterval(relogio);
      central.parar();
      servidor.close();
      repo.fechar();
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const app = montarAplicacao();
  app.iniciar();
  app.servidor.listen(app.cfg.porta, () => {
    console.log(`Nexor Barber no ar em http://localhost:${app.cfg.porta}   ·   app do cliente: /app/`);
    if (!app.cfg.urlPublica) console.warn("PUBLIC_URL vazia: os links do WhatsApp ficam sem endereço. Só aceitável em teste local.");
  });
  const desligar = () => (app.fechar(), process.exit(0));
  process.on("SIGINT", desligar);
  process.on("SIGTERM", desligar);
}
