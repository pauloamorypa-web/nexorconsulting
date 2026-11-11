/* Autenticação de cada rota do Nexor Agente e limites dos conectores. Não há painel nem empresas: o servidor
   só tem /health e o webhook do WhatsApp, e só o dono (DONOS) dá ordens. O teste lê as rotas do próprio
   src/servidor.js e confere a proteção de cada uma. Achados em docs/seguranca/revisao-completa.md. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { carregarConectores, montarUrl } from "../src/conectores.js";
import { montarServidor } from "../src/servidor.js";

const ROTAS = {
  "/health": "pública (só { ok: true })",
  "/webhook/whatsapp": "GET: token de verificação; POST: assinatura X-Hub-Signature-256; ordens só dos DONOS",
};

let base, app, pedidosIa;
before(async () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "agente-iso-"));
  const config = { ...lerConfig({ DONOS: "5534999990000", DATA_DIR: pasta, WHATSAPP_APP_SECRET: "segredo", WHATSAPP_VERIFY_TOKEN: "verifica" }), pastaDados: pasta };
  config.whatsapp = { ...config.whatsapp, segredoApp: "segredo", tokenVerificacao: "verifica" };
  pedidosIa = [];
  const whats = { configurado: true, texto: async () => {}, aprovacao: async () => {}, marcarLida: async () => {} };
  const cliente = { beta: { messages: { create: async (r) => (pedidosIa.push(r), { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }) } } };
  app = montarServidor({ config, conectores: { http: [], mcp: [] }, cliente, whats, fetchFn: async () => new Response("{}") });
  await new Promise((r) => app.servidor.listen(0, r));
  base = `http://127.0.0.1:${app.servidor.address().port}`;
});
after(() => app.servidor.close());

test("toda rota do servidor está na lista, com a proteção indicada", () => {
  const fonte = readFileSync(new URL("../src/servidor.js", import.meta.url), "utf8");
  const noCodigo = [...new Set([...fonte.matchAll(/url\.pathname === "([^"]+)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(noCodigo, Object.keys(ROTAS).sort());
});

test("webhook: verificação exige o token e mensagem exige assinatura válida", async () => {
  assert.equal((await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=x`)).status, 403);
  const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "w1", from: "5534999990000", type: "text", text: { body: "apaga tudo" } }] } }] }] });
  const post = (a) => fetch(`${base}/webhook/whatsapp`, { method: "POST", headers: { "content-type": "application/json", ...(a ? { "x-hub-signature-256": a } : {}) }, body: corpo });
  assert.equal((await post()).status, 401);
  assert.equal((await post("sha256=" + createHmac("sha256", "outro").update(corpo).digest("hex"))).status, 401);
  assert.equal(pedidosIa.length, 0, "nada chegou à IA");
});

test("webhook: a mesma mensagem reenviada é processada uma vez só", async () => {
  const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "w-repetida", from: "5534999990000", type: "text", text: { body: "oi" } }] } }] }] });
  const a = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
  for (let i = 0; i < 3; i++) await fetch(`${base}/webhook/whatsapp`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": a }, body: corpo });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(pedidosIa.length, 1);
});

const crm = carregarConectores({ env: {}, conteudo: { http: [{ nome: "crm", descricao: "CRM", base: "https://crm.exemplo.com/api", caminhos_permitidos: ["/clientes"] }] } }).http[0];

test("conector: caminho fora da lista ou fugindo da base é recusado", () => {
  for (const p of ["/admin", "/clientes/../admin", "//evil.example/x", "/clientes\\..\\admin", "https://evil.example/"]) assert.throws(() => montarUrl(crm, p), p);
  assert.equal(montarUrl(crm, "/clientes/123").href, "https://crm.exemplo.com/api/clientes/123");
});

test("conector: pontos codificados (%2e%2e) não escapam da lista de caminhos permitidos", { todo: "R-NA1: montarUrl confere a lista antes de normalizar; /clientes/%2e%2e/admin vira /api/admin" }, () => {
  for (const p of ["/clientes/%2e%2e/admin", "/clientes/%2E%2E/%2e%2e/config", "/clientes/.%2e/admin"]) {
    let destino = null;
    try {
      destino = montarUrl(crm, p).pathname;
    } catch {
      continue;
    }
    assert.ok(destino.startsWith("/api/clientes"), `${p} foi para ${destino}`);
  }
});
