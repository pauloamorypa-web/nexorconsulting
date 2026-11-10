/* Painel web do Nexor Agente: chat com o agente, fila de aprovações e histórico de tarefas.
   Liga só com PAINEL_SENHA definida (ou no modo demonstração). Sessão em cookie HttpOnly,
   SameSite=Strict; POST exige JSON e mesma origem. */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLICO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const ESTATICOS = { "/": ["index.html", "text/html; charset=utf-8"], "/painel.js": ["painel.js", "text/javascript; charset=utf-8"], "/painel.css": ["painel.css", "text/css; charset=utf-8"], "/demo-faixa.js": ["demo-faixa.js", "text/javascript; charset=utf-8"] };
const CSP_PAGINA = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const COOKIE = "nxa_sessao";
const DURACAO_MS = 12 * 3600_000;

const iguais = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

/** Linha do tempo das conversas por dono (WhatsApp e painel), em memória. */
export function criarLinha({ agora = () => Date.now(), maximo = 300 } = {}) {
  const linhas = new Map();
  return {
    registrar(dono, item) {
      const l = linhas.get(dono) ?? [];
      l.push({ em: agora(), ...item });
      if (l.length > maximo) l.splice(0, l.length - maximo);
      linhas.set(dono, l);
    },
    de: (dono) => [...(linhas.get(dono) ?? [])],
    definir: (dono, itens) => linhas.set(dono, [...itens]),
  };
}

export function criarPainel({ config, agente, aprovacoes, perfil, central, linha, decidir, lerHistorico, seguranca, lerCorpo, demo }) {
  const sessoes = new Map();
  const tentativas = new Map();
  const ligado = Boolean(config.painelSenha) || Boolean(demo);

  const json = (res, s, corpo, extra = {}) => {
    res.writeHead(s, { ...seguranca, "Content-Type": "application/json; charset=utf-8", ...extra });
    res.end(JSON.stringify(corpo));
  };
  const lerJson = async (req) => {
    const bruto = (await lerCorpo(req)).toString("utf8");
    if (!bruto) return {};
    try {
      return JSON.parse(bruto);
    } catch {
      throw Object.assign(new Error("JSON inválido"), { status: 400 });
    }
  };
  const sessaoDe = (req) => {
    const token = String(req.headers.cookie ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{48})`))?.[1];
    const s = token && sessoes.get(token);
    if (!s || s.expira < Date.now()) return null;
    return s;
  };
  const entrar = (res, dono, nome) => {
    const token = randomBytes(24).toString("hex");
    sessoes.set(token, { dono, nome, expira: Date.now() + DURACAO_MS });
    res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURACAO_MS / 1000}`);
  };
  /** POST só com JSON e da mesma origem (proteção contra CSRF, junto com SameSite=Strict). */
  const postSeguro = (req) => {
    const temCorpo = Number(req.headers["content-length"] ?? 0) > 0 || Boolean(req.headers["transfer-encoding"]);
    if (temCorpo && !String(req.headers["content-type"] ?? "").startsWith("application/json")) return false;
    const origem = req.headers.origin;
    return !origem || origem === `http://${req.headers.host}` || origem === `https://${req.headers.host}`;
  };

  const resumoPendente = (p) => ({ id: p.id, resumo: p.resumo, conector: p.conector, metodo: p.metodo, caminho: p.caminho, criadoEm: p.criadoEm, expiraEm: p.expiraEm });

  async function tratar(req, res, url) {
    if (!ligado) return false;
    if (!demo && (url.pathname === "/api/demo" || url.pathname.startsWith("/api/demo/") || url.pathname.startsWith("/demo/"))) return false;
    const h = { json, lerJson, entrar };

    const estatico = req.method === "GET" && ESTATICOS[url.pathname];
    if (estatico) {
      res.writeHead(200, { ...seguranca, "Content-Type": estatico[1], "Content-Security-Policy": CSP_PAGINA });
      res.end(readFileSync(path.join(PUBLICO, estatico[0])));
      return true;
    }
    if (req.method === "POST" && !postSeguro(req) && (url.pathname.startsWith("/api/"))) {
      json(res, 403, { erro: "requisição recusada" });
      return true;
    }
    if (demo && (await demo.tratar(req, res, url, h))) return true;

    if (req.method === "POST" && url.pathname === "/api/entrar") {
      if (!config.painelSenha) return json(res, 404, { erro: "não encontrado" }), true;
      const ip = req.socket.remoteAddress ?? "";
      const t = tentativas.get(ip) ?? { n: 0, desde: Date.now() };
      if (Date.now() - t.desde > 60_000) Object.assign(t, { n: 0, desde: Date.now() });
      if (++t.n > 5) return tentativas.set(ip, t), json(res, 429, { erro: "muitas tentativas, espere um minuto" }), true;
      tentativas.set(ip, t);
      const { senha } = await lerJson(req);
      if (!iguais(senha, config.painelSenha) || !config.donos[0]) return json(res, 401, { erro: "senha incorreta" }), true;
      entrar(res, config.donos[0], "Dono");
      json(res, 200, { ok: true });
      return true;
    }
    if (!url.pathname.startsWith("/api/")) return false;

    const s = sessaoDe(req);
    if (url.pathname === "/api/sessao" && req.method === "GET") {
      json(res, 200, s ? { logado: true, nome: s.nome, senha: Boolean(config.painelSenha) } : { logado: false, senha: Boolean(config.painelSenha) });
      return true;
    }
    if (!s) return json(res, 401, { erro: "entre para continuar" }), true;

    if (req.method === "POST" && url.pathname === "/api/sair") {
      for (const [k, v] of sessoes) if (v === s) sessoes.delete(k);
      json(res, 200, { ok: true }, { "Set-Cookie": `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/painel") {
      const p = perfil.obter();
      const lic = central.estado();
      json(res, 200, {
        usuario: { nome: s.nome },
        agente: { nome: p.nome, empresa: p.empresa },
        licenca: { situacao: lic.situacao, rotulo: lic.rotulo ?? null, mensagem: lic.mensagem ?? "" },
        conversa: linha.de(s.dono).slice(-80),
        pendentes: aprovacoes.pendentesDe(s.dono).map(resumoPendente).reverse(),
        historico: lerHistorico(s.dono, 25),
      });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      const texto = String((await lerJson(req)).texto ?? "").trim().slice(0, 4000);
      if (!texto) return json(res, 400, { erro: "mensagem vazia" }), true;
      if (central.estado().situacao === "bloqueado") return json(res, 423, { erro: central.estado().mensagem || "Assistente pausado." }), true;
      linha.registrar(s.dono, { de: "dono", canal: "painel", texto });
      const resposta = await agente.responder({ dono: s.dono, texto });
      linha.registrar(s.dono, { de: "agente", canal: "painel", texto: resposta });
      json(res, 200, { resposta });
      return true;
    }
    const ap = url.pathname.match(/^\/api\/aprovacoes\/([A-Za-z0-9]{7})$/);
    if (req.method === "POST" && ap) {
      const acao = (await lerJson(req)).acao;
      if (!["aprovar", "recusar"].includes(acao)) return json(res, 400, { erro: "ação inválida" }), true;
      const id = ap[1].toUpperCase();
      linha.registrar(s.dono, { de: "dono", canal: "painel", texto: acao === "aprovar" ? `✅ Aprovei o pedido ${id}` : `✖️ Recusei o pedido ${id}` });
      const resposta = await decidir(s.dono, acao, id);
      linha.registrar(s.dono, { de: "agente", canal: "painel", texto: resposta });
      json(res, 200, { resposta });
      return true;
    }
    json(res, 404, { erro: "não encontrado" });
    return true;
  }

  return { tratar, ligado };
}
