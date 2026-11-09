/* Servidor do Nexor Contábil.
   /                     → painel do escritório (public/index.html)
   /portal/              → portal do cliente do escritório
   /api/*                → API (painel e /api/portal/*)
   /webhook/whatsapp     → WhatsApp do escritório (API oficial da Meta)
   /health               → verificação de saúde */

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
import { hojeBR } from "./regras/datas.js";
import { criarCofre, iguais } from "./seguranca.js";
import { assinaturaMetaValida } from "./servicos/canais.js";
import { criarNucleo } from "./servicos/nucleo.js";

const PUBLICO = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'";

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
    throw new Error("PUBLIC_URL é obrigatória em produção (ex.: https://contabil.seuescritorio.com.br).");
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

/** Saúde enviada à Nexor Central: só contagens, nenhum dado dos clientes do escritório */
function saudeDaInstalacao(repo, cfg, agora) {
  const n = (sql, ...p) => repo.um(sql, ...p)?.n ?? 0;
  const h = hojeBR(agora());
  let banco_mb;
  let backup_ultimo;
  try {
    banco_mb = Math.round(statSync(join(cfg.pastaDados, "contabil.db")).size / 1048576);
  } catch {
    /* banco em memória (testes) */
  }
  try {
    backup_ultimo = JSON.parse(readFileSync(join(cfg.pastaDados, "ultimo-backup.json"), "utf8")).em;
  } catch {
    /* sem backup ainda */
  }
  return {
    empresas: n("SELECT COUNT(*) n FROM empresas"),
    usuarios: n("SELECT COUNT(*) n FROM usuarios WHERE ativo = 1 AND nexor = 0"),
    carteira: n("SELECT COUNT(*) n FROM clientes WHERE ativo = 1"),
    documentos_mes: n("SELECT COUNT(*) n FROM documentos WHERE criado_em >= ?", Date.parse(`${h.slice(0, 7)}-01T00:00:00-03:00`)),
    pendencias: n("SELECT COUNT(*) n FROM pendencias WHERE status = 'pendente' AND prazo < ?", h),
    tarefas_atrasadas: n("SELECT COUNT(*) n FROM tarefas WHERE status IN ('a_fazer','em_andamento') AND prazo_legal < ?", h),
    banco_mb,
    backup_ultimo,
    uptime_s: Math.round(process.uptime()),
    node: process.version,
  };
}

/** Monta todas as peças. Os testes trocam o relógio, o cliente da IA e o fetch (Meta, e-mail, Central). */
export function montarAplicacao({ cfg = configPadrao, caminhoBanco, agora = () => Date.now(), clienteIA, fetchFn = fetch } = {}) {
  conferirEnderecoPublico(cfg);
  const cofre = criarCofre(cfg);
  const repo = abrirBanco(caminhoBanco ?? join(cfg.pastaDados, "contabil.db"), agora);
  if (cfg.producao && !cfg.codigoInstalacao && repo.contarUsuarios() === 0) cfg = { ...cfg, codigoInstalacao: codigoDeInstalacao(cfg.pastaDados) };
  const central = criarCentralNexor({ cfg, agora, fetchFn, produto: "contabil", versao: cfg.sistema.versao, saude: () => saudeDaInstalacao(repo, cfg, agora) });
  const nucleo = criarNucleo({ repo, cofre, cfg, clienteIA, fetchFn, agora, licenca: () => central.estado() });
  const api = criarApi({ repo, nucleo, cofre, cfg, central, agora });
  const escritorio = () => {
    const e = repo.um("SELECT id FROM empresas ORDER BY criada_em LIMIT 1");
    return e ? nucleo.empresa(e.id) : null;
  };

  async function arquivoEstatico(caminho, res) {
    let rel;
    try {
      rel = decodeURIComponent(caminho).replace(/^\/+/, "");
    } catch {
      return false;
    }
    if (rel.includes("\0")) return false;
    const portal = rel === "portal" || rel.startsWith("portal/");
    if (rel === "" || rel === "portal") rel = portal ? "portal/index.html" : "index.html";
    let alvo = normalize(join(PUBLICO, rel));
    if (alvo !== PUBLICO && !alvo.startsWith(PUBLICO + sep)) return false;
    let info = await stat(alvo).catch(() => null);
    if (info?.isDirectory()) {
      alvo = join(alvo, "index.html");
      info = await stat(alvo).catch(() => null);
    }
    if (!info && !extname(alvo)) {
      alvo = join(PUBLICO, portal ? "portal" : "", "index.html");
      info = await stat(alvo).catch(() => null);
    }
    if (!info?.isFile()) return false;
    const html = alvo.endsWith(".html");
    res.writeHead(200, { "Content-Type": TIPOS[extname(alvo)] ?? "application/octet-stream", "Cache-Control": html ? "no-cache" : "public, max-age=3600", "Permissions-Policy": "camera=(self), geolocation=(), microphone=()" });
    res.end(await readFile(alvo));
    return true;
  }

  async function tratarApi(req, res, url) {
    const { rota, params, caminhoExiste } = api.roteador.encontrar(req.method, url.pathname);
    if (!rota) return json(res, caminhoExiste ? 405 : 404, { erro: caminhoExiste ? "método não permitido" : "não encontrado" });
    // Proteção contra CSRF: o painel e o portal sempre mandam este cabeçalho
    if (req.method !== "GET" && req.headers["x-nexor"] !== "1") return json(res, 403, { erro: "requisição recusada" });
    const cookies = lerCookies(req.headers.cookie);
    let usuario = null;
    let empresa = null;
    let portal = null;
    if (rota.opcoes.portal) {
      portal = api.sessaoPortal(cookies);
      if (!portal) return json(res, 401, { erro: "Entre no portal para continuar." });
    } else if (!rota.opcoes.publico) {
      usuario = api.sessaoPainel(cookies);
      if (!usuario) return json(res, 401, { erro: "Faça login para continuar." });
      if (rota.opcoes.papeis && !rota.opcoes.papeis.includes(usuario.papel)) return json(res, 403, { erro: "Seu perfil não tem permissão para esta ação." });
      empresa = nucleo.empresa(usuario.empresa_id);
    }
    if (rota.opcoes.nexor && !usuario?.nexor) return json(res, 403, { erro: "Área exclusiva do Suporte Nexor." });
    if (!usuario?.nexor) {
      const lic = central.estado();
      const recusa = recusaPorLicenca(lic, req.method, url.pathname);
      if (recusa) return json(res, 423, { erro: recusa, codigo: "licenca", situacao: lic.situacao, link: portal ? null : lic.link });
      const teste = recusaPorTeste(lic, req.method, url.pathname, { catalogo: CATALOGO_NEXOR, rotas: LIMITES_TESTE, contar: () => saudeDaInstalacao(repo, cfg, agora) });
      if (teste) return json(res, 402, { erro: teste, codigo: "teste", link: portal ? null : lic.link });
      if (usuario) {
        const oculto = bloqueadoPorAjuste(repo.ocultos(usuario.empresa_id), req.method, url.pathname);
        if (oculto) return json(res, 403, { erro: `${oculto} não está disponível no seu plano. Fale com a Nexor.` });
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
      empresa,
      portal,
      ip: ipCliente(req, cfg.proxies),
      corpo: async () => {
        if (lido === undefined) {
          const b = await lerCorpo(req, 1024 * 1024);
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
    if (resultado !== undefined) json(res, 200, resultado);
  }

  async function webhook(req, res, url) {
    const e = escritorio();
    const w = e?.config.whatsapp ?? {};
    if (req.method === "GET") {
      const ok = e && url.searchParams.get("hub.mode") === "subscribe" && iguais(url.searchParams.get("hub.verify_token") ?? "", w.verificacao ?? "");
      res.writeHead(ok ? 200 : 403, { "Content-Type": "text/plain" });
      return res.end(ok ? (url.searchParams.get("hub.challenge") ?? "") : "forbidden");
    }
    if (req.method !== "POST") return json(res, 405, { erro: "método não permitido" });
    const corpo = await lerCorpo(req, 3 * 1024 * 1024);
    if (!e || !assinaturaMetaValida(corpo, req.headers["x-hub-signature-256"], nucleo.segredo(w.segredo_cripto))) return json(res, 401, { erro: "assinatura inválida" });
    let payload;
    try {
      payload = JSON.parse(corpo.toString("utf8"));
    } catch {
      return json(res, 400, { erro: "JSON inválido" });
    }
    // Responde na hora: a Meta reenvia se demorar
    json(res, 200, { ok: true });
    filaWebhook = filaWebhook.then(() => nucleo.processarWebhook(e.id, payload)).catch((err) => console.error("[webhook]", err.message));
  }
  let filaWebhook = Promise.resolve();

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Content-Security-Policy", CSP);
    if (cfg.producao) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    try {
      if (url.pathname === "/health") return json(res, 200, { ok: true });
      if (url.pathname === "/webhook/whatsapp") return await webhook(req, res, url);
      if (url.pathname.startsWith("/api/")) return await tratarApi(req, res, url);
      if (req.method === "GET" && (await arquivoEstatico(url.pathname, res))) return;
      json(res, 404, { erro: "não encontrado" });
    } catch (err) {
      const status = err.status ?? 500;
      if (status >= 500) console.error("[servidor]", err);
      // err.cabecalhos: o limite de tentativas manda o Retry-After junto com o 429
      json(res, status, { erro: status < 500 ? err.message : "Erro interno." }, err.cabecalhos);
    }
  });

  let relogio = null;
  return {
    servidor,
    repo,
    nucleo,
    central,
    cfg,
    /** Espera leituras e webhooks em andamento (testes) */
    ocioso: async () => {
      await filaWebhook;
      await nucleo.ocioso();
    },
    iniciar() {
      central.iniciar();
      const rodar = () => nucleo.rotina().catch((e) => console.error("[rotina]", e.message));
      setTimeout(rodar, 10_000).unref();
      relogio = setInterval(rodar, 15 * 60_000);
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
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const clienteIA = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null;
  const app = montarAplicacao({ clienteIA });
  app.iniciar();
  app.servidor.listen(app.cfg.porta, () => {
    console.log(`Nexor Contábil no ar em http://localhost:${app.cfg.porta}   ·   portal do cliente: /portal/`);
    if (!clienteIA) console.warn("ANTHROPIC_API_KEY vazia: a leitura de documentos e o assistente do WhatsApp ficam desligados.");
    if (!app.cfg.urlPublica) console.warn("PUBLIC_URL vazia: só aceitável em teste local.");
  });
  const desligar = () => (app.fechar(), process.exit(0));
  process.on("SIGINT", desligar);
  process.on("SIGTERM", desligar);
}
