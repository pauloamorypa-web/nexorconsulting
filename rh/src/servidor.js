/* Servidor do Nexor RH.
   /            → painel do RH (public/index.html)
   /app/        → aplicativo do trabalhador (PWA instalável)
   /quiosque/   → tela do QR Code rotativo para o tablet da entrada
   /vagas/      → página pública de vagas
   /api/*       → API
   /health      → verificação de saúde */

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as configPadrao } from "./config.js";
import { abrirBanco } from "./db.js";
import { criarApi } from "./http/api.js";
import { arquivosConhecidos, paginaBaixar } from "./http/baixar.js";
import { ErroHttp, json, lerCookies, lerCorpo } from "./http/roteador.js";
import { criarCofre } from "./seguranca.js";
import { criarNucleo } from "./servicos/nucleo.js";

const PUBLICO = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const seguranca = (permissoes) => ({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": permissoes,
  "Content-Security-Policy": CSP,
});

/** IP do cliente. Atrás de N proxies, vale a N-ésima entrada do X-Forwarded-For contando da direita: as da
    esquerda vêm do próprio cliente e podem ser forjadas (burlariam o limite de tentativas e o IP gravado no ponto). */
export function ipCliente(req, proxies = 1) {
  const direto = String(req.socket?.remoteAddress ?? "");
  if (!proxies) return direto;
  const lista = String(req.headers["x-forwarded-for"] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return lista.length ? (lista[Math.max(0, lista.length - proxies)] ?? direto) : direto;
}

/** Eventos em tempo real para o painel (SSE), por empresa */
function criarEventos() {
  const clientes = new Map();
  return {
    conectar(empresa_id, res) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write(": ok\n\n");
      const lista = clientes.get(empresa_id) ?? new Set();
      lista.add(res);
      clientes.set(empresa_id, lista);
      const pulso = setInterval(() => res.write(": pulso\n\n"), 25_000);
      res.on("close", () => {
        clearInterval(pulso);
        lista.delete(res);
      });
    },
    emitir(empresa_id, tipo, dados = {}) {
      for (const res of clientes.get(empresa_id) ?? []) res.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`);
    },
    fechar() {
      for (const l of clientes.values()) for (const res of l) res.end();
    },
  };
}

/** Monta todas as peças. Os testes trocam o relógio e o cliente SOAP do eSocial. */
export function montarAplicacao({ cfg = configPadrao, caminhoBanco, agora = () => Date.now(), fetchSoap, fetchFn = fetch } = {}) {
  const cofre = criarCofre(cfg);
  const repo = abrirBanco(caminhoBanco ?? join(cfg.pastaDados, "rh.db"));
  const nucleo = criarNucleo({ repo, cofre, cfg, agora });
  const eventos = criarEventos();
  const api = criarApi({ repo, nucleo, cofre, cfg, eventos, agora, fetchSoap, fetchFn });

  async function arquivoEstatico(caminho, res) {
    let relativo = decodeURIComponent(caminho).replace(/^\/+/, "");
    const area = ["app", "quiosque", "vagas"].find((a) => relativo === a || relativo.startsWith(`${a}/`));
    if (relativo === "" || relativo === area) relativo = area ? `${area}/index.html` : "index.html";
    let alvo = normalize(join(PUBLICO, relativo));
    if (alvo !== PUBLICO && !alvo.startsWith(PUBLICO + sep)) return false;
    let info = await stat(alvo).catch(() => null);
    if (info?.isDirectory()) {
      alvo = join(alvo, "index.html");
      info = await stat(alvo).catch(() => null);
    }
    if (!info && !extname(alvo)) {
      alvo = join(PUBLICO, area ?? "", "index.html");
      info = await stat(alvo).catch(() => null);
    }
    if (!info?.isFile()) return false;
    const semCache = alvo.endsWith(".html") || alvo.endsWith("sw.js") || alvo.endsWith(".webmanifest");
    // O app precisa de câmera (QR) e localização; o painel não
    const permissoes = area === "app" ? "camera=(self), geolocation=(self), microphone=()" : area ? "camera=(), geolocation=(), microphone=()" : "camera=(), geolocation=(self), microphone=()";
    res.writeHead(200, { "Content-Type": TIPOS[extname(alvo)] ?? "application/octet-stream", "Cache-Control": semCache ? "no-cache" : "public, max-age=3600", ...(alvo.endsWith("sw.js") ? { "Service-Worker-Allowed": "/app/" } : {}), ...seguranca(permissoes) });
    res.end(await readFile(alvo));
    return true;
  }

  // App das lojas (Capacitor): telas embutidas no app, origem local. Só a API do app aceita essas origens,
  // e sem cookies: a autenticação é pelo token no cabeçalho Authorization.
  const ORIGENS_APP = new Set(["capacitor://localhost", "https://localhost", "http://localhost", "ionic://localhost"]);
  function cors(req, res, url) {
    const origem = req.headers.origin;
    if (!origem || !ORIGENS_APP.has(origem) || !url.pathname.startsWith("/api/app/")) return false;
    res.setHeader("Access-Control-Allow-Origin", origem);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-nexor, x-nome, x-app-nativo");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.setHeader("Access-Control-Max-Age", "600");
    return true;
  }

  async function tratarApi(req, res, url) {
    if (cors(req, res, url) && req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    const cookies = lerCookies(req.headers.cookie);
    if (url.pathname === "/api/eventos") {
      const u = api.sessaoPainel(cookies);
      if (!u) return json(res, 401, { erro: "Faça login para continuar." });
      return eventos.conectar(u.empresa_id, res);
    }
    const { rota, params, caminhoExiste } = api.roteador.encontrar(req.method, url.pathname);
    if (!rota) return json(res, caminhoExiste ? 405 : 404, { erro: caminhoExiste ? "método não permitido" : "não encontrado" });
    // Proteção contra CSRF: o painel e o app sempre mandam este cabeçalho; formulários de outros sites não conseguem
    if (req.method !== "GET" && !rota.opcoes.webhook && req.headers["x-nexor"] !== "1") return json(res, 403, { erro: "requisição recusada" });
    let usuario = null;
    let colaborador = null;
    let empresa = null;
    if (rota.opcoes.app) {
      colaborador = api.sessaoApp(cookies, req);
      if (!colaborador) return json(res, 401, { erro: "Entre no aplicativo com seu CPF e o código do RH." });
      empresa = nucleo.empresa(colaborador.empresa_id);
    } else if (!rota.opcoes.publico) {
      usuario = api.sessaoPainel(cookies);
      if (!usuario) return json(res, 401, { erro: "Faça login para continuar." });
      if (rota.opcoes.papeis && !rota.opcoes.papeis.includes(usuario.papel)) return json(res, 403, { erro: "Seu perfil não tem permissão para esta ação." });
      empresa = nucleo.empresa(usuario.empresa_id);
    }
    let lido;
    const ctx = {
      req,
      res,
      params,
      query: url.searchParams,
      cookies,
      usuario,
      colaborador,
      empresa,
      ip: ipCliente(req, cfg.proxies ?? 1),
      corpo: async () => {
        if (lido === undefined) {
          const b = await lerCorpo(req, 10 * 1024 * 1024);
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

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // Cabeçalhos de segurança padrão em toda resposta (páginas e arquivos podem trocar o CSP pelo seu)
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", CSP);
    if (cfg.producao) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    try {
      if (url.pathname === "/health") return json(res, 200, { ok: true });
      if (req.method === "GET" && url.pathname.startsWith("/.well-known/")) {
        const corpo = arquivosConhecidos(cfg, url.pathname);
        if (!corpo) return json(res, 404, { erro: "não encontrado" });
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" });
        return res.end(corpo);
      }
      if (req.method === "GET" && (url.pathname === "/baixar" || url.pathname === "/baixar/")) {
        const b = cfg.urlPublica || `${req.headers["x-forwarded-proto"] ?? "http"}://${req.headers.host}`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", "Content-Security-Policy": "default-src 'self'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" });
        return res.end(paginaBaixar(cfg, b));
      }
      if (url.pathname.startsWith("/api/")) return await tratarApi(req, res, url);
      if (req.method === "GET" && url.pathname.startsWith("/vagas/") && api.paginasVagas(req, res, url)) return;
      if (req.method === "GET" && (await arquivoEstatico(url.pathname, res))) return;
      json(res, 404, { erro: "não encontrado" });
    } catch (err) {
      const status = err.status ?? 500;
      if (status >= 500) console.error("[servidor]", err);
      json(res, status, { erro: status < 500 || err instanceof ErroHttp ? err.message : status === 502 ? err.message : "Erro interno." });
    }
  });

  return {
    servidor,
    repo,
    nucleo,
    cfg,
    fechar() {
      eventos.fechar();
      servidor.close();
      repo.fechar();
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const app = montarAplicacao();
  app.servidor.listen(app.cfg.porta, () => {
    console.log(`Nexor RH no ar em http://localhost:${app.cfg.porta}`);
    console.log(`Painel: /   ·   App do trabalhador: /app/   ·   Quiosque: /quiosque/   ·   Vagas: /vagas/`);
    if (!app.cfg.urlPublica) console.warn("PUBLIC_URL vazia: os links do QR Code usarão o endereço de cada acesso.");
  });
  const desligar = () => {
    app.fechar();
    process.exit(0);
  };
  process.on("SIGINT", desligar);
  process.on("SIGTERM", desligar);
}
