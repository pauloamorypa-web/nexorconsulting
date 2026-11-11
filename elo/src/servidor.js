/* Servidor do Nexor Elo.
   /                         → app provisório (public/index.html); o painel e o app PWA virão dos agentes de frontend
   /p/:token                 → página pública da proposta (cliente final, sem login)
   /os/:token                → acompanhamento público da ordem de serviço
   /api/*                    → API (ver API.md)
   /webhook/asaas            → pagamentos das propostas (conta Asaas da plataforma, com split)
   /webhook/asaas/instalador/:id → mensalidades dos contratos recorrentes (conta Asaas do instalador)
   /health                   → verificação de saúde */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as configPadrao } from "./config.js";
import { abrirBanco } from "./db.js";
import { criarApi } from "./http/api.js";
import { pode } from "./http/permissoes.js";
import { ErroHttp, json, lerCookies, lerCorpo } from "./http/roteador.js";
import { criarCofre, gerarToken, iguais } from "./seguranca.js";
import { criarAsaas, criarConsultaCnpj, criarFiscal, criarNotificador } from "./servicos/adaptadores.js";
import { criarNegocio } from "./servicos/negocio.js";
import { criarRotasDemo } from "./demo/index.js";
import { criarSimulador, travarRede } from "./demo/simulador.js";

const PUBLICO = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const CSP = "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const LIMITE_CORPO = 256 * 1024;

export function ipCliente(req, proxies = 0) {
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
    throw new Error("PUBLIC_URL é obrigatória em produção (ex.: https://elo.nexorconsulting.com.br).");
  }
  if (u.protocol !== "https:") throw new Error("PUBLIC_URL precisa começar com https:// em produção.");
  if (u.pathname !== "/" || u.search || u.hash || u.username) throw new Error("PUBLIC_URL deve ser só o endereço, sem caminho.");
}

function codigoDeInstalacao(pasta) {
  const arquivo = join(pasta, "codigo-instalacao.txt");
  if (existsSync(arquivo)) return readFileSync(arquivo, "utf8").trim();
  mkdirSync(pasta, { recursive: true });
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codigo = [...randomBytes(10)].map((b) => letras[b % letras.length]).join("");
  writeFileSync(arquivo, codigo + "\n", { mode: 0o600 });
  console.log(`Instalação nova: código para criar o primeiro operador Nexor em ${arquivo}`);
  return codigo;
}

/** Monta todas as peças. Os testes trocam o relógio, o banco e o fetch (BrasilAPI, Asaas, Focus, WhatsApp, e-mail). */
export function montarAplicacao({ cfg = configPadrao, caminhoBanco, agora = () => Date.now(), fetchFn } = {}) {
  conferirEnderecoPublico(cfg);
  const sim = cfg.demo ? criarSimulador({ agora }) : null;
  fetchFn = fetchFn ?? sim?.fetchFn ?? fetch;
  const cofre = criarCofre(cfg);
  const repo = abrirBanco(caminhoBanco ?? join(cfg.pastaDados, "elo.db"), agora);
  if (cfg.producao && !cfg.codigoInstalacao && repo.contarUsuarios("nexor") === 0) cfg = { ...cfg, codigoInstalacao: codigoDeInstalacao(cfg.pastaDados) };

  // Segredos da plataforma: token do webhook do Asaas (gerado na primeira subida), chave e wallet da Nexor
  const decifrar = (v) => {
    try {
      return v ? cofre.decifrar(v) : "";
    } catch {
      return "";
    }
  };
  if (!repo.plataforma("asaas_webhook_cripto")) repo.definirPlataforma("asaas_webhook_cripto", cofre.cifrar(gerarToken(24)));
  const tokenWebhookAsaas = () => decifrar(repo.plataforma("asaas_webhook_cripto"));
  const chaveAsaas = () => cfg.asaas.chave || decifrar(repo.plataforma("asaas_chave_cripto"));
  const walletNexor = () => cfg.asaas.walletNexor || decifrar(repo.plataforma("wallet_nexor_cripto"));
  const asaasPlataforma = new Proxy({}, { get: (_, nome) => (...a) => criarAsaas({ fetchFn, url: cfg.asaas.url, chave: chaveAsaas() })[nome](...a) });

  const notificador = criarNotificador({ repo, fetchFn, cfg });
  const negocio = criarNegocio({ repo, cofre, cfg, agora, asaasPlataforma, notificador });
  const cnpjs = criarConsultaCnpj({ repo, fetchFn, cfg, agora });
  const fiscal = criarFiscal({ fetchFn, cfg, agora });
  const api = criarApi({ repo, cofre, cfg, agora, negocio, cnpjs, fiscal, fetchFn, chaveAsaas, walletNexor, tokenWebhookAsaas });

  async function arquivoEstatico(caminho, res) {
    let rel;
    try {
      rel = decodeURIComponent(caminho).replace(/^\/+/, "");
    } catch {
      return false;
    }
    if (rel.includes("\0")) return false;
    // Páginas com token no endereço: sem Referer (o token não vaza para links externos) e fora dos buscadores
    const comToken = /^(p|os)\/[\w-]+$/.test(rel);
    // Mapa das telas: / (entrada) · /fornecedor/ (painel) · /nexor/ (operação) · /app/ (instalador, PWA) · /p/:token e /os/:token (cliente final)
    const area = rel.split("/")[0];
    if (rel === "") rel = "index.html";
    else if (comToken) rel = area === "p" ? "publico/proposta.html" : "publico/os.html";
    const raizArea = ["fornecedor", "nexor", "app"].includes(area) ? area : "";
    let alvo = normalize(join(PUBLICO, rel));
    if (alvo !== PUBLICO && !alvo.startsWith(PUBLICO + sep)) return false;
    let info = await stat(alvo).catch(() => null);
    if (info?.isDirectory()) {
      alvo = join(alvo, "index.html");
      info = await stat(alvo).catch(() => null);
    }
    if (!info && !extname(alvo)) {
      // Rotas internas de cada tela (#/… ou /area/…) caem no index.html da própria área
      alvo = join(PUBLICO, raizArea, "index.html");
      info = await stat(alvo).catch(() => null);
    }
    if (!info?.isFile()) return false;
    const html = alvo.endsWith(".html");
    const cab = { "Content-Type": TIPOS[extname(alvo)] ?? "application/octet-stream", "Cache-Control": html ? "no-cache" : "public, max-age=3600", "Permissions-Policy": "camera=(self), geolocation=(), microphone=()" };
    if (comToken) Object.assign(cab, { "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" });
    res.writeHead(200, cab);
    let conteudo = await readFile(alvo);
    if (cfg.demo && html) conteudo = Buffer.from(conteudo.toString("utf8").replace(/^\s*<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*$/gm, ""));
    res.end(conteudo);
    return true;
  }

  async function tratarApi(req, res, url) {
    const { rota, params, caminhoExiste } = api.roteador.encontrar(req.method, url.pathname);
    if (!rota) return json(res, caminhoExiste ? 405 : 404, { erro: caminhoExiste ? "método não permitido" : "não encontrado" });
    // CSRF: o painel, o app e a página pública sempre mandam este cabeçalho (um formulário de outro site não consegue)
    if (req.method !== "GET" && req.headers["x-nexor"] !== "1") return json(res, 403, { erro: "requisição recusada" });
    const cookies = lerCookies(req.headers.cookie);
    let usuario = null;
    let conta = null;
    const o = rota.opcoes;
    if (!o.publico) {
      usuario = api.sessao(o.conta, cookies);
      if (!usuario) return json(res, 401, { erro: "Faça login para continuar." });
      conta = repo.obter("contas", usuario.conta_id);
      if (!conta || ["suspenso", "recusado"].includes(conta.status)) return json(res, 403, { erro: conta?.status === "suspenso" ? "Esta conta está suspensa. Fale com a Nexor." : "O cadastro desta empresa não foi aprovado." });
      if (o.pode && !pode(usuario, o.pode)) return json(res, 403, { erro: "Seu perfil não tem permissão para esta ação." });
    }
    if (url.pathname.startsWith("/api/publico/")) res.setHeader("Referrer-Policy", "no-referrer");
    let lido;
    const ctx = {
      req,
      res,
      params,
      query: url.searchParams,
      cookies,
      usuario,
      conta,
      ip: ipCliente(req, cfg.proxies),
      corpo: async () => {
        if (lido === undefined) {
          const b = await lerCorpo(req, o.limite ?? LIMITE_CORPO);
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

  /** Asaas: o token do cabeçalho asaas-access-token é comparado ao token cifrado guardado no banco */
  async function webhookAsaas(req, res, url) {
    if (req.method !== "POST") return json(res, 405, { erro: "método não permitido" });
    const m = /^\/webhook\/asaas\/instalador\/([\w-]{1,60})$/.exec(url.pathname);
    let token;
    let instaladorId = null;
    if (m) {
      const c = repo.obter("contas", m[1]);
      if (c?.tipo !== "instalador") return json(res, 401, { erro: "token inválido" });
      instaladorId = c.id;
      token = decifrar(c.config.asaas_webhook_cripto);
    } else token = tokenWebhookAsaas();
    if (!token || !iguais(String(req.headers["asaas-access-token"] ?? ""), token)) return json(res, 401, { erro: "token inválido" });
    const corpo = await lerCorpo(req, 512 * 1024);
    let evento;
    try {
      evento = JSON.parse(corpo.toString("utf8"));
    } catch {
      return json(res, 400, { erro: "JSON inválido" });
    }
    return json(res, 200, negocio.eventoAsaas(evento, { instaladorId }));
  }

  const rotasDemo = sim ? criarRotasDemo({ cfg, repo, negocio, sim, tokenWebhookAsaas }) : null;

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (cfg.producao) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    try {
      if (url.pathname === "/health") return json(res, 200, { ok: true });
      if (rotasDemo && (await rotasDemo(req, res, url))) return;
      if (!rotasDemo && (url.pathname === "/demo" || url.pathname.startsWith("/demo/") || url.pathname.startsWith("/api/demo"))) return json(res, 404, { erro: "não encontrado" });
      if (url.pathname === "/webhook/asaas" || url.pathname.startsWith("/webhook/asaas/")) return await webhookAsaas(req, res, url);
      if (url.pathname.startsWith("/api/")) return await tratarApi(req, res, url);
      if (req.method === "GET" && (await arquivoEstatico(url.pathname, res))) return;
      json(res, 404, { erro: "não encontrado" });
    } catch (err) {
      const status = err instanceof ErroHttp ? err.status : (err.status ?? 500);
      if (status >= 500 && status !== 502 && status !== 503) console.error("[servidor]", err);
      if (err.fecharConexao) {
        if (!res.headersSent) res.setHeader("Connection", "close");
        res.once("finish", () => req.destroy());
      }
      const corpo = { erro: status < 500 || status === 502 || status === 503 ? err.message : "Erro interno." };
      if (err.codigo) corpo.codigo = err.codigo;
      json(res, status, corpo, err.retryAfter ? { "Retry-After": String(err.retryAfter) } : {});
    }
  });

  let relogio = null;
  const rotina = async () => negocio.rotina();
  return {
    servidor,
    api,
    repo,
    negocio,
    sim,
    cfg,
    cofre,
    tokenWebhookAsaas,
    rotina,
    ocioso: () => negocio.ocioso(),
    iniciar() {
      const rodar = () => rotina().catch((e) => console.error("[rotina]", e.message));
      setTimeout(rodar, 10_000).unref();
      relogio = setInterval(rodar, cfg.rotinaMin * 60_000);
      relogio.unref();
    },
    fechar() {
      clearInterval(relogio);
      servidor.close();
      repo.fechar();
    },
  };
}

/** Sobe a demonstração: trava a rede, semeia (na primeira vez ou com DEMO_RESET=1) e escuta só nesta máquina */
export async function subirDemo(cfg = configPadrao, { log = console.log } = {}) {
  travarRede();
  const { semear } = await import("./demo/semear.js");
  const { ORIGINAL } = await import("./demo/index.js");
  if (cfg.demoReiniciar || !existsSync(join(cfg.pastaDados, ORIGINAL))) {
    log("Montando a demonstração (Distribuidora Vigia Forte e Instala Seg Araguari)...");
    const { banco } = await semear({ cfg, montarAplicacao, log });
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(banco);
    db.prepare("VACUUM INTO ?").run(join(cfg.pastaDados, ORIGINAL));
    db.close();
  }
  const app = montarAplicacao({ cfg });
  app.iniciar();
  const host = cfg.demoPublico ? "0.0.0.0" : "127.0.0.1";
  await new Promise((ok) => app.servidor.listen(cfg.porta, host, ok));
  log(`Nexor Elo · DEMONSTRAÇÃO em http://localhost:${app.servidor.address().port}/demo   (dados fictícios; nada sai desta máquina)`);
  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href && configPadrao.demo) {
  const app = await subirDemo();
  const desligar = () => (app.fechar(), process.exit(0));
  process.on("SIGINT", desligar);
  process.on("SIGTERM", desligar);
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const app = montarAplicacao();
  app.iniciar();
  app.servidor.listen(app.cfg.porta, () => {
    console.log(`Nexor Elo no ar em http://localhost:${app.cfg.porta}`);
    if (!app.cfg.urlPublica) console.warn("PUBLIC_URL vazia: os links das propostas ficam sem endereço. Só aceitável em teste local.");
  });
  const desligar = () => (app.fechar(), process.exit(0));
  process.on("SIGINT", desligar);
  process.on("SIGTERM", desligar);
}
