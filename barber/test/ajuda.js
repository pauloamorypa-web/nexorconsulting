/* Utilitários dos testes: servidor em porta livre, relógio controlado, cliente HTTP com cookies e
   APIs falsas (WhatsApp da Meta, SMS do Twilio, certificados do Google e Asaas). */
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerConfig } from "../src/config.js";
import { montarAplicacao } from "../src/servidor.js";

export const GOOGLE_CLIENT = "123-teste.apps.googleusercontent.com";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: "jwk" }), kid: "chave1", alg: "RS256", use: "sig" };

/** Token do Google assinado com a chave falsa (o servidor confere com o JWK publicado pela rede falsa) */
export function tokenGoogle(dados, agora = Date.now()) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const cab = b64({ alg: "RS256", kid: "chave1", typ: "JWT" });
  const corpo = b64({ iss: "https://accounts.google.com", aud: GOOGLE_CLIENT, exp: Math.floor(agora / 1000) + 3600, iat: Math.floor(agora / 1000), email_verified: true, ...dados });
  return `${cab}.${corpo}.${sign("RSA-SHA256", Buffer.from(`${cab}.${corpo}`), privateKey).toString("base64url")}`;
}

export function rede() {
  const whatsapp = [];
  const sms = [];
  const asaas = [];
  /** Caminhos do Asaas falso que devem falhar (regex), para testar erros no meio do caminho */
  const falhas = [];
  /** Provedores fora do ar (hostname): WhatsApp "graph.facebook.com", SMS "api.twilio.com" */
  const fora = new Set();
  /** Provedores lentos (hostname → ms antes de responder) */
  const atraso = new Map();
  let n = 0;
  let assinaturas = 0;
  const resp = (status, dados, cab = {}) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json", ...cab } });
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname.startsWith("/api/v1/")) return fetch(url, init);
    if (atraso.has(u.hostname)) await new Promise((ok) => setTimeout(ok, atraso.get(u.hostname)));
    if (fora.has(u.hostname)) return resp(500, { error: { message: `erro técnico do provedor ${u.hostname}` } });
    if (u.hostname === "graph.facebook.com") {
      whatsapp.push(JSON.parse(init.body));
      return resp(200, { messages: [{ id: `wamid.${++n}` }] });
    }
    if (u.hostname === "api.twilio.com") {
      sms.push(Object.fromEntries(new URLSearchParams(init.body)));
      return resp(201, { sid: `SM${++n}` });
    }
    if (u.hostname === "www.googleapis.com") return resp(200, { keys: [JWK] }, { "cache-control": "public, max-age=3600" });
    if (u.hostname.includes("asaas.com")) {
      const corpo = init.body ? JSON.parse(init.body) : null;
      asaas.push({ metodo: init.method, caminho: u.pathname, corpo });
      if (falhas.some((re) => re.test(`${init.method} ${u.pathname}`))) return resp(500, { errors: [{ description: "falha simulada" }] });
      if (u.pathname.endsWith("/customers")) return resp(200, { id: "cus_1" });
      // Cada assinatura nova ganha um id (sub_1, sub_2…) e a primeira cobrança dela (pay_1, pay_2…)
      if (u.pathname.endsWith("/subscriptions") && init.method === "POST") return resp(200, { id: `sub_${++assinaturas}` });
      const pag = /\/subscriptions\/sub_(\d+)\/payments$/.exec(u.pathname);
      if (pag) return resp(200, { data: [{ id: `pay_${pag[1]}`, invoiceUrl: `https://asaas.com/i/pay_${pag[1]}`, dueDate: corpo?.nextDueDate ?? "2026-11-10", value: 89.9 }] });
      if (/\/payments\/[^/]+\/receiveInCash$/.test(u.pathname)) return resp(200, { id: u.pathname.split("/").at(-2), status: "RECEIVED_IN_CASH" });
      if (init.method === "DELETE") return resp(200, { deleted: true });
    }
    return resp(404, { erro: "não simulado" });
  };
  /** Último código enviado (WhatsApp ou SMS) */
  const ultimoCodigo = () => {
    const w = whatsapp.at(-1);
    const texto = w?.template?.components?.[0]?.parameters?.[0]?.text ?? w?.text?.body ?? sms.at(-1)?.Body ?? "";
    return /\d{6}/.exec(texto)?.[0];
  };
  return { fetchFn, whatsapp, sms, asaas, falhas, fora, atraso, ultimoCodigo };
}

/** Relógio controlado: começa numa terça-feira, 10/11/2026 às 08:00 de Brasília */
export function relogio(inicio = Date.parse("2026-11-10T08:00:00-03:00")) {
  let t = inicio;
  const f = () => t;
  f.avancar = (ms) => (t += ms);
  f.ir = (iso) => (t = Date.parse(iso));
  return f;
}

export async function subir({ agora = relogio(), cfg: extra = {} } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-barber-"));
  const r = rede();
  const cfg = { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste-chave-mestra", urlPublica: "https://agenda.teste", ...extra };
  const app = montarAplicacao({ cfg, caminhoBanco: ":memory:", agora, fetchFn: r.fetchFn });
  await new Promise((ok) => app.servidor.listen(0, ok));
  const url = `http://localhost:${app.servidor.address().port}`;
  return {
    app,
    url,
    agora,
    rede: r,
    cliente: () => criarCliente(url),
    fechar() {
      app.fechar();
      rmSync(pasta, { recursive: true, force: true });
    },
  };
}

export function criarCliente(url) {
  const cookies = new Map();
  async function chamar(metodo, caminho, corpo, extra = {}) {
    const r = await fetch(url + caminho, {
      method: metodo,
      headers: { "x-nexor": "1", cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...extra },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    for (const c of r.headers.getSetCookie()) {
      const [k, v] = c.split(";")[0].split("=");
      if (v) cookies.set(k, v);
      else cookies.delete(k);
    }
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, dados: tipo.includes("json") ? await r.json() : await r.text(), cabecalhos: r.headers };
  }
  /** Requisição com corpo lento: manda os cabeçalhos e o começo do corpo; o resto só quando chamar fim() */
  function lenta(metodo, caminho, corpo) {
    const txt = JSON.stringify(corpo);
    let fim;
    const p = new Promise((ok, falhou) => {
      const req = http.request(url + caminho, { method: metodo, agent: false, headers: { "x-nexor": "1", "content-type": "application/json", "content-length": Buffer.byteLength(txt), cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } }, (r) => {
        let b = "";
        r.on("data", (d) => (b += d));
        r.on("end", () => ok({ status: r.statusCode, dados: JSON.parse(b || "{}") }));
      });
      req.on("error", falhou);
      req.write(txt.slice(0, 2));
      fim = () => req.end(txt.slice(2));
    });
    return { p, fim: () => fim() };
  }
  return {
    lenta,
    get: (c) => chamar("GET", c),
    post: (c, b = {}, extra) => chamar("POST", c, b, extra),
    put: (c, b = {}) => chamar("PUT", c, b),
    del: (c) => chamar("DELETE", c),
  };
}

/** Barbearia pronta: dono logado, WhatsApp e SMS configurados, um segundo barbeiro */
export async function barbeariaPronta(s) {
  const dono = s.cliente();
  const c = await dono.post("/api/cadastro", { barbearia: "Barbearia Navalha", nome: "Rafael Dono", email: "dono@navalha.test", senha: "senha-forte-1", tambem_corta: true });
  if (c.status !== 200) throw new Error(JSON.stringify(c.dados));
  await dono.put("/api/canais", { whatsapp: { id_numero: "999", token: "tk-meta", segredo: "seg-meta" }, sms: { sid: "AC1", token: "tk-sms", de: "+15550001" }, google: { client_id: GOOGLE_CLIENT } });
  const servicos = (await dono.get("/api/servicos")).dados;
  const barbeiros = (await dono.get("/api/barbeiros")).dados;
  const bruno = (await dono.post("/api/barbeiros", { nome: "Bruno", comissao_servico: 50, comissao_produto: 10 })).dados;
  const corte = servicos.find((x) => x.nome === "Corte");
  const barba = servicos.find((x) => x.nome === "Barba");
  return { dono, servicos, corte, barba, rafael: barbeiros[0], bruno };
}

/** Cliente do app logado pelo WhatsApp, com nome preenchido */
export async function clienteApp(s, fone = "34999990001", nome = "Lucas Cliente") {
  const c = s.cliente();
  const e = await c.post("/api/app/codigo", { fone, canal: "whatsapp" });
  if (e.status !== 200) throw new Error(JSON.stringify(e.dados));
  const v = await c.post("/api/app/verificar", { fone, codigo: s.rede.ultimoCodigo() });
  if (v.status !== 200) throw new Error(JSON.stringify(v.dados));
  await c.put("/api/app/eu", { nome });
  return c;
}
