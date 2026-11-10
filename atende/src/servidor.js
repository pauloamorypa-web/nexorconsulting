/* Servidor do Nexor Atende IA.
   GET  /                    → painel (public/)
   /api/*                    → API do painel (login por cookie)
   GET  /webhook/whatsapp    → verificação do webhook pela Meta
   POST /webhook/whatsapp    → mensagens e status da WhatsApp Cloud API
   GET  /health              → verificação de saúde */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
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
import { criarCentralNexor, recusaPorTeste } from "./nexor/central.js";
import { CATALOGO as CATALOGO_NEXOR, LIMITES_TESTE, bloqueadoPorAjuste, iaLiberada, recusaPorLicenca } from "./nexor/politica.js";
import { criarCofre, gerarToken, iguais } from "./seguranca.js";
import { apagarDadosDemo, criarModoDemo } from "./demo/index.js";
import { instalarTravaDeRede } from "./demo/rede.js";
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

// Em produção o painel só deve abrir por HTTPS (o cookie de sessão já é Secure)
const HSTS = { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" };

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

/** Saúde enviada à Nexor Central: só contagens, nenhum dado de conversa ou contato */
function saudeDaInstalacao(repo, cfg, agora) {
  const n = (sql, ...p) => repo.db.prepare(sql).get(...p)?.n ?? 0;
  const inicioDoDia = agora() - ((agora() - 3 * 3600_000) % 86400_000);
  let banco_mb;
  try {
    banco_mb = Math.round(statSync(join(cfg.pastaDados, "atende.db")).size / 1048576);
  } catch {
    /* banco em memória (testes) */
  }
  let conversas_hoje;
  try {
    conversas_hoje = n("SELECT COUNT(*) n FROM conversas WHERE ultima_msg_em >= ?", inicioDoDia);
  } catch {
    conversas_hoje = undefined;
  }
  return { empresas: n("SELECT COUNT(*) n FROM empresas"), usuarios: n("SELECT COUNT(*) n FROM usuarios WHERE ativo = 1 AND nexor = 0"), conversas_hoje, banco_mb, uptime_s: Math.round(process.uptime()), node: process.version };
}

/** Monta todas as peças. Os testes trocam o cliente do Claude e o fetch da Meta por versões falsas. */
export function montarAplicacao({ cfg = configPadrao, caminhoBanco, clienteIA, fetchFn = fetch, agora = () => Date.now(), atrasoAgrupamento, atrasoIA } = {}) {
  // Modo Demonstração: trava de rede, simuladores no lugar da Meta, da IA e da Central (ver DEMO.md)
  const destravarRede = cfg.demo ? instalarTravaDeRede({ iaReal: cfg.demoIaReal }) : () => {};
  if (cfg.demo && cfg.demoReset && caminhoBanco !== ":memory:") apagarDadosDemo(cfg.pastaDados);
  const demo = cfg.demo ? criarModoDemo({ cfg, agora, atrasoIA }) : null;
  if (demo) {
    fetchFn = demo.fetchFn;
    clienteIA ??= demo.clienteIA ?? undefined;
  }
  const cofre = criarCofre(cfg);
  cfg = { ...cfg, meta: { ...cfg.meta, tokenVerificacao: tokenVerificacao(cfg) } };
  const repo = abrirBanco(caminhoBanco ?? join(cfg.pastaDados, "atende.db"));
  const cliente = clienteIA ?? new Anthropic();
  const conhecimento = criarCacheConhecimento(repo);
  const midia = criarMidia(cfg.pastaDados);
  const eventos = criarEventos();
  const agente = criarAgente({ cliente, repo, conhecimento, carregarMidia: (a) => midia.ler(a), agora, ia: cfg.ia });
  const copiloto = criarCopiloto({ cliente, repo, conhecimento, ia: cfg.ia });
  const central = demo ? demo.central : criarCentralNexor({ cfg, agora, fetchFn, produto: "atende", versao: "1.0.0", saude: () => saudeDaInstalacao(repo, cfg, agora) });
  const atendimento = criarAtendimento({ repo, cofre, agente, copiloto, eventos, midia, fetchFn, agora, ia: cfg.ia, versaoGraph: cfg.meta.versaoGraph, atrasoAgrupamento, iaLiberada: () => iaLiberada(central.estado(), () => saudeDaInstalacao(repo, cfg, agora)) });
  const agendador = criarAgendador({ repo, atendimento, eventos, agora });
  const api = criarApi({ repo, cofre, atendimento, copiloto, conhecimento, eventos, midia, cfg, fetchFn, agora, central });
  demo?.ligar({ repo, atendimento, cofre });

  /** O webhook pode ser assinado pelo app global (META_APP_SECRET) ou pelo app próprio da empresa */
  function webhookAutentico(corpo, assinatura) {
    if (assinaturaValida(corpo, assinatura, cfg.meta.segredoApp)) return true;
    let payload;
    try {
      payload = JSON.parse(corpo.toString("utf8"));
    } catch {
      return false;
    }
    // Cada mudança precisa ser de um número cujo segredo próprio confere a assinatura. Sem isso, uma empresa
    // que cadastrou o próprio segredo poderia assinar um payload com o número de outra empresa junto.
    const mudancas = (payload?.entry ?? []).flatMap((e) => e.changes ?? []);
    const ids = mudancas.map((c) => c.value?.metadata?.phone_number_id);
    if (!ids.length || ids.some((id) => !id)) return false;
    return [...new Set(ids)].every((id) => {
      const canal = repo.canalPorNumero(id);
      return Boolean(canal?.segredo_app_cripto) && assinaturaValida(corpo, assinatura, cofre.decifrar(canal.segredo_app_cripto));
    });
  }

  async function arquivoEstatico(caminho, res) {
    let relativo;
    try {
      relativo = caminho === "/" ? "index.html" : decodeURIComponent(caminho).replace(/^\/+/, "");
    } catch {
      return false;
    }
    let alvo = normalize(join(PUBLICO, relativo));
    // Com o separador no fim: "/app/public-x" não passa por estar dentro de "/app/public"
    if (!alvo.startsWith(PUBLICO + sep) || relativo.includes("\0")) return false;
    let info = await stat(alvo).catch(() => null);
    // Rotas do painel (sem extensão) devolvem o index.html
    if (!info && !extname(alvo)) {
      alvo = join(PUBLICO, "index.html");
      info = await stat(alvo).catch(() => null);
    }
    if (!info?.isFile()) return false;
    const html = alvo.endsWith(".html");
    res.writeHead(200, { "Content-Type": TIPOS[extname(alvo)] ?? "application/octet-stream", "Cache-Control": html ? "no-cache" : "public, max-age=3600", ...SEGURANCA, ...(cfg.producao ? HSTS : {}) });
    res.end(demo && html ? demo.html(await readFile(alvo, "utf8")) : await readFile(alvo));
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
    // Contrato com a Nexor e itens escondidos pelo Suporte Nexor (que nunca é barrado)
    if (rota.opcoes.nexor && !usuario?.nexor) return json(res, 403, { erro: "Área exclusiva do Suporte Nexor." });
    if (!usuario?.nexor) {
      const lic = central.estado();
      const recusa = recusaPorLicenca(lic, req.method, url.pathname);
      if (recusa) return json(res, 423, { erro: recusa, codigo: "licenca", situacao: lic.situacao, link: lic.link });
      const teste = recusaPorTeste(lic, req.method, url.pathname, { catalogo: CATALOGO_NEXOR, rotas: LIMITES_TESTE, contar: () => saudeDaInstalacao(repo, cfg, agora) });
      if (teste) return json(res, 402, { erro: teste, codigo: "teste", link: lic.link });
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
      // Cloudflare (na frente do Render) grava o IP real nesses cabeçalhos; X-Forwarded-For pode vir do visitante
      ip: String(req.headers["true-client-ip"] ?? req.headers["cf-connecting-ip"] ?? "").trim() || String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim(),
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

      // Rotas do Modo Demonstração: só existem com DEMO=1 (em produção respondem 404)
      if (/^\/(api\/)?demo(\/|$)/.test(url.pathname)) return demo ? await demo.tratar(req, res, url) : json(res, 404, { erro: "não encontrado" });

      if (url.pathname.startsWith("/api/")) return await tratarApi(req, res, url);

      if (req.method === "GET" && (await arquivoEstatico(url.pathname, res))) return;
      json(res, 404, { erro: "não encontrado" });
    } catch (err) {
      // Erros da API do Claude viram 502 com mensagem genérica: um 401 da Anthropic não pode deslogar o painel
      // nem expor detalhes da conta da IA
      const ehIA = err instanceof Anthropic.APIError;
      const status = ehIA ? 502 : (err.status ?? 500);
      if (status >= 500) console.error("[servidor]", err);
      const mensagem = ehIA ? "A IA está indisponível no momento. Tente de novo em instantes." : err instanceof ErroHttp || (err.status && err.status < 500) ? err.message : "Erro interno.";
      json(res, status, { erro: mensagem, ...(err.codigo ? { codigo: err.codigo } : {}) });
    }
  });

  return {
    servidor,
    repo,
    central,
    atendimento,
    agendador,
    eventos,
    cofre,
    cfg,
    demo,
    fechar() {
      demo?.parar();
      destravarRede();
      central.parar();
      agendador.parar();
      atendimento.parar();
      servidor.close();
      repo.fechar();
    },
  };
}

/** Na demonstração, só o próprio computador acessa (DEMO_PUBLICO=1 para a versão online atrás do Cloudflare Access) */
export const hostDeEscuta = (cfg) => (cfg.demo && !cfg.demoPublico ? "127.0.0.1" : undefined);

/* Inicia quando executado diretamente: node src/servidor.js */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const app = montarAplicacao();
  app.agendador.iniciar();
  app.central.iniciar();
  app.servidor.listen(app.cfg.porta, hostDeEscuta(app.cfg), () => {
    if (app.cfg.demo) {
      console.log(`Nexor Atende IA · MODO DEMONSTRAÇÃO (dados fictícios, IA ${app.demo.ia}, sem chamadas externas)`);
      console.log(`Abra http://localhost:${app.cfg.porta}/demo/entrar?papel=dono  (papéis: dono, admin, atendente · senha ${"demo1234"})`);
      return;
    }
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
