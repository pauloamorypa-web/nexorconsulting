/* Servidor do Nexor RH.
   /            → painel do RH (public/index.html)
   /app/        → aplicativo do trabalhador (PWA instalável)
   /quiosque/   → tela do QR Code rotativo para o tablet da entrada
   /vagas/      → página pública de vagas
   /api/*       → API
   /health      → verificação de saúde */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as configPadrao } from "./config.js";
import { abrirBanco } from "./db.js";
import { criarApi } from "./http/api.js";
import { arquivosConhecidos, paginaBaixar } from "./http/baixar.js";
import { ErroHttp, json, lerCookies, lerCorpo } from "./http/roteador.js";
import { criarCentralNexor } from "./nexor/central.js";
import { bloqueadoPorAjuste, recusaPorLicenca } from "./nexor/politica.js";
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

/** Saúde enviada à Nexor Central: só contagens e datas técnicas, nenhum dado pessoal */
function saudeDaInstalacao(repo, cfg, agora) {
  const n = (sql, ...p) => repo.um(sql, ...p)?.n ?? 0;
  const inicioDoDia = agora() - ((agora() - 3 * 3600_000) % 86400_000);
  let banco_mb;
  let backup_ultimo;
  try {
    banco_mb = Math.round(statSync(join(cfg.pastaDados, "rh.db")).size / 1048576);
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
    colaboradores: n("SELECT COUNT(*) n FROM colaboradores WHERE status != 'desligado'"),
    usuarios: n("SELECT COUNT(*) n FROM usuarios WHERE ativo = 1 AND nexor = 0"),
    marcacoes_hoje: n("SELECT COUNT(*) n FROM marcacoes WHERE momento >= ?", inicioDoDia),
    banco_mb,
    backup_ultimo,
    uptime_s: Math.round(process.uptime()),
    node: process.version,
  };
}

/** Monta todas as peças. Os testes trocam o relógio e o cliente SOAP do eSocial. */
/** Em produção, o endereço público é obrigatório: links do QR, da biometria (WebAuthn) e das vagas
    não podem depender do cabeçalho Host de cada acesso (envenenamento de cache e de links). */
export function conferirEnderecoPublico(cfg) {
  if (!cfg.producao) return;
  let u;
  try {
    u = new URL(cfg.urlPublica);
  } catch {
    throw new Error("PUBLIC_URL é obrigatória em produção (ex.: https://rh.suaempresa.com.br).");
  }
  if (u.protocol !== "https:") throw new Error("PUBLIC_URL precisa começar com https:// em produção.");
  if (u.pathname !== "/" || u.search || u.hash || u.username) throw new Error("PUBLIC_URL deve ser só o endereço, sem caminho (ex.: https://rh.suaempresa.com.br).");
}

/** Lê ou cria DATA_DIR/codigo-instalacao.txt (8 caracteres fáceis de digitar). */
function codigoDeInstalacao(pasta) {
  const arquivo = join(pasta, "codigo-instalacao.txt");
  if (existsSync(arquivo)) return readFileSync(arquivo, "utf8").trim();
  mkdirSync(pasta, { recursive: true });
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codigo = [...randomBytes(8)].map((b) => letras[b % letras.length]).join("");
  writeFileSync(arquivo, codigo + "\n", { mode: 0o600 });
  console.log(`Instalação nova: código para criar o primeiro administrador em ${arquivo}`);
  return codigo;
}

export function montarAplicacao({ cfg = configPadrao, caminhoBanco, agora = () => Date.now(), fetchSoap, fetchFn = fetch } = {}) {
  conferirEnderecoPublico(cfg);
  const cofre = criarCofre(cfg);
  const repo = abrirBanco(caminhoBanco ?? join(cfg.pastaDados, "rh.db"));
  if (cfg.producao && !cfg.codigoInstalacao && repo.contarUsuarios() === 0) {
    // Sem administrador ainda: gera o código de instalação e grava só no servidor
    cfg = { ...cfg, codigoInstalacao: codigoDeInstalacao(cfg.pastaDados) };
  }
  const nucleo = criarNucleo({ repo, cofre, cfg, agora });
  const eventos = criarEventos();
  const central = criarCentralNexor({ cfg, agora, fetchFn, produto: "rh", versao: cfg.sistema.versao, saude: () => saudeDaInstalacao(repo, cfg, agora) });
  const api = criarApi({ repo, nucleo, cofre, cfg, eventos, central, agora, fetchSoap, fetchFn });

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
    // Contrato com a Nexor e itens escondidos pelo Suporte Nexor (que nunca é barrado)
    if (rota.opcoes.nexor && !usuario?.nexor) return json(res, 403, { erro: "Área exclusiva do Suporte Nexor." });
    if (!usuario?.nexor) {
      const lic = central.estado();
      const recusa = recusaPorLicenca(lic, req.method, url.pathname);
      if (recusa) return json(res, 423, { erro: recusa, codigo: "licenca", situacao: lic.situacao, link: lic.link });
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
    central,
    fechar() {
      central.parar();
      eventos.fechar();
      servidor.close();
      repo.fechar();
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const app = montarAplicacao();
  app.central.iniciar();
  app.servidor.listen(app.cfg.porta, () => {
    console.log(`Nexor RH no ar em http://localhost:${app.cfg.porta}`);
    console.log(`Painel: /   ·   App do trabalhador: /app/   ·   Quiosque: /quiosque/   ·   Vagas: /vagas/`);
    if (!app.cfg.urlPublica) console.warn("PUBLIC_URL vazia: só aceitável em teste local. Em produção (NODE_ENV=production) ela é obrigatória.");
  });
  const desligar = () => {
    app.fechar();
    process.exit(0);
  };
  process.on("SIGINT", desligar);
  process.on("SIGTERM", desligar);
}
