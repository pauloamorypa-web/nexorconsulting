/* Servidor do Nexor Atende IA.
   GET  /                    → painel (public/)
   /api/*                    → API do painel (login por cookie)
   GET  /webhook/whatsapp    → verificação do webhook pela Meta
   POST /webhook/whatsapp    → mensagens e status da WhatsApp Cloud API
   GET  /health              → verificação de saúde */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { config as configPadrao } from "./config.js";
import { abrirBanco, configCompleta } from "./db.js";
import { criarApi } from "./http/api.js";
import { ErroHttp, json, lerCookies, lerCorpo } from "./http/roteador.js";
import { criarAgente } from "./ia/agente.js";
import { criarCacheConhecimento } from "./ia/conhecimento.js";
import { criarCopiloto } from "./ia/copiloto.js";
import { assinaturaValida } from "./meta/webhook.js";
import { criarCofre, gerarToken, iguais } from "./seguranca.js";
import { criarAgendador } from "./servicos/agendador.js";
import { criarAtendimento } from "./servicos/atendimento.js";
import { criarEventos } from "./servicos/eventos.js";
import { criarMidia } from "./servicos/midia.js";

const PUBLICO = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const SEGURANCA = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://connect.facebook.net; connect-src 'self' https://*.facebook.com; frame-src https://*.facebook.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

/** Token de verificação do webhook: META_VERIFY_TOKEN ou um gerado e guardado na pasta de dados */
function tokenVerificacao(cfg) {
  if (cfg.meta.tokenVerificacao) return cfg.meta.tokenVerificacao;
  mkdirSync(cfg.pastaDados, { recursive: true });
  const arquivo = join(cfg.pastaDados, ".verificacao");
  if (existsSync(arquivo)) return readFileSync(arquivo, "utf8").trim();
  const t = gerarToken(18);
  writeFileSync(arquivo, t, { mode: 0o600 });
  return t;
}

/** Monta todas as peças. Os testes trocam o cliente do Claude e o fetch da Meta por versões falsas. */
export function montarAplicacao({ cfg = configPadrao, caminhoBanco, clienteIA, fetchFn = fetch, agora = () => Date.now(), atrasoAgrupamento } = {}) {
  const cofre = criarCofre(cfg);
  cfg = { ...cfg, meta: { ...cfg.meta, tokenVerificacao: tokenVerificacao(cfg) } };
  const repo = abrirBanco(caminhoBanco ?? join(cfg.pastaDados, "atende.db"));
  const cliente = clienteIA ?? new Anthropic();
  const conhecimento = criarCacheConhecimento(repo);
  const midia = criarMidia(cfg.pastaDados);
  const eventos = criarEventos();
  const agente = criarAgente({ cliente, repo, conhecimento, carregarMidia: (a) => midia.ler(a), agora, ia: cfg.ia });
  const copiloto = criarCopiloto({ cliente, repo, conhecimento, ia: cfg.ia });
  const atendimento = criarAtendimento({ repo, cofre, agente, copiloto, eventos, midia, fetchFn, agora, ia: cfg.ia, versaoGraph: cfg.meta.versaoGraph, atrasoAgrupamento });
  const agendador = criarAgendador({ repo, atendimento, eventos, agora });
  const api = criarApi({ repo, cofre, atendimento, copiloto, conhecimento, eventos, midia, cfg, fetchFn, agora });

  /** O webhook pode ser assinado pelo app global (META_APP_SECRET) ou pelo app próprio da empresa */
  function webhookAutentico(corpo, assinatura) {
    if (assinaturaValida(corpo, assinatura, cfg.meta.segredoApp)) return true;
    let payload;
    try {
      payload = JSON.parse(corpo.toString("utf8"));
    } catch {
      return false;
    }
    const ids = new Set((payload?.entry ?? []).flatMap((e) => (e.changes ?? []).map((c) => c.value?.metadata?.phone_number_id)).filter(Boolean));
    for (const id of ids) {
      const canal = repo.canalPorNumero(id);
      if (canal?.segredo_app_cripto && assinaturaValida(corpo, assinatura, cofre.decifrar(canal.segredo_app_cripto))) return true;
    }
    return false;
  }

  async function arquivoEstatico(caminho, res) {
    const relativo = caminho === "/" ? "index.html" : decodeURIComponent(caminho).replace(/^\/+/, "");
    let alvo = normalize(join(PUBLICO, relativo));
    if (!alvo.startsWith(PUBLICO)) return false;
    let info = await stat(alvo).catch(() => null);
    // Rotas do painel (sem extensão) devolvem o index.html
    if (!info && !extname(alvo)) {
      alvo = join(PUBLICO, "index.html");
      info = await stat(alvo).catch(() => null);
    }
    if (!info?.isFile()) return false;
    const html = alvo.endsWith(".html");
    res.writeHead(200, { "Content-Type": TIPOS[extname(alvo)] ?? "application/octet-stream", "Cache-Control": html ? "no-cache" : "public, max-age=3600", ...SEGURANCA });
    res.end(await readFile(alvo));
    return true;
  }

  async function tratarApi(req, res, url) {
    const { rota, params, caminhoExiste } = api.roteador.encontrar(req.method, url.pathname);
    if (!rota) return json(res, caminhoExiste ? 405 : 404, { erro: caminhoExiste ? "método não permitido" : "não encontrado" });
    const cookies = lerCookies(req.headers.cookie);
    // Proteção contra CSRF: o painel sempre manda este cabeçalho; formulários de outros sites não conseguem
    if (req.method !== "GET" && req.headers["x-nexor"] !== "1") return json(res, 403, { erro: "requisição recusada" });
    let usuario = null;
    let empresa = null;
    if (!rota.opcoes.publico) {
      usuario = api.sessaoDe(cookies);
      if (!usuario) return json(res, 401, { erro: "Faça login para continuar." });
      if (rota.opcoes.papeis && !rota.opcoes.papeis.includes(usuario.papel)) return json(res, 403, { erro: "Seu perfil não tem permissão para esta ação." });
      const e = repo.empresa(usuario.empresa_id);
      empresa = { ...e, config: configCompleta(e.config) };
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
      ip: String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim(),
      corpo: async () => {
        if (lido === undefined) {
          const b = await lerCorpo(req, 6 * 1024 * 1024);
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
    try {
      if (url.pathname === "/health") return json(res, 200, { ok: true });

      if (url.pathname === "/webhook/whatsapp") {
        if (req.method === "GET") {
          const ok = url.searchParams.get("hub.mode") === "subscribe" && iguais(url.searchParams.get("hub.verify_token") ?? "", cfg.meta.tokenVerificacao);
          res.writeHead(ok ? 200 : 403, { "Content-Type": "text/plain" });
          return res.end(ok ? (url.searchParams.get("hub.challenge") ?? "") : "forbidden");
        }
        if (req.method === "POST") {
          const corpo = await lerCorpo(req, 3 * 1024 * 1024);
          if (!webhookAutentico(corpo, req.headers["x-hub-signature-256"])) return json(res, 401, { erro: "assinatura inválida" });
          // Responde 200 na hora; a Meta reenvia se demorar
          json(res, 200, { ok: true });
          return atendimento.processarWebhook(JSON.parse(corpo.toString("utf8")));
        }
        return json(res, 405, { erro: "método não permitido" });
      }

      if (url.pathname.startsWith("/api/")) return await tratarApi(req, res, url);

      if (req.method === "GET" && (await arquivoEstatico(url.pathname, res))) return;
      json(res, 404, { erro: "não encontrado" });
    } catch (err) {
      const status = err.status ?? (err instanceof Anthropic.APIError ? 502 : 500);
      if (status >= 500) console.error("[servidor]", err);
      const mensagem = err instanceof ErroHttp || (err.status && err.status < 500) ? err.message : err instanceof Anthropic.APIError ? "A IA está indisponível no momento. Tente de novo em instantes." : "Erro interno.";
      json(res, status, { erro: mensagem, ...(err.codigo ? { codigo: err.codigo } : {}) });
    }
  });

  return {
    servidor,
    repo,
    atendimento,
    agendador,
    eventos,
    cofre,
    cfg,
    fechar() {
      agendador.parar();
      atendimento.parar();
      servidor.close();
      repo.fechar();
    },
  };
}

/* Inicia quando executado diretamente: node src/servidor.js */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const app = montarAplicacao();
  app.agendador.iniciar();
  app.servidor.listen(app.cfg.porta, () => {
    console.log(`Nexor Atende IA no ar em http://localhost:${app.cfg.porta} · modelo ${app.cfg.ia.modelo}`);
    console.log(`Webhook: ${app.cfg.urlPublica || "https://SEU-SERVIDOR"}/webhook/whatsapp · token de verificação: ${app.cfg.meta.tokenVerificacao}`);
    if (!app.cfg.meta.segredoApp) console.warn("META_APP_SECRET vazio: só serão aceitos webhooks de números com segredo próprio cadastrado.");
    if (!process.env.ANTHROPIC_API_KEY) console.warn("ANTHROPIC_API_KEY vazia: a IA não vai responder.");
  });
  const desligar = () => {
    console.log("Desligando...");
    app.fechar();
    process.exit(0);
  };
  process.on("SIGTERM", desligar);
  process.on("SIGINT", desligar);
}
