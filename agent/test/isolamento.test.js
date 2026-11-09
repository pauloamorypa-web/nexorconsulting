/* Autenticação de cada rota da Blue (agent/). Não há empresas nem sessões de painel aqui: o servidor tem o
   chat e o formulário públicos do site, o relatório (REPORT_TOKEN) e o webhook do WhatsApp (assinatura da
   Meta). O teste lê as rotas do próprio src/servidor.js e confere que cada uma está nesta lista, com a
   proteção esperada. Achados em docs/seguranca/revisao-completa.md. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { config } from "../src/config.js";
import { criarServidor } from "../src/servidor.js";

/* Rota → como ela se protege */
const ROTAS = {
  "/health": "pública (só { ok: true })",
  "/api/chat": "pública (chat do site): origem permitida + limite por IP e teto global por hora",
  "/api/lead": "pública (formulário do site): origem permitida + limite por IP",
  "/api/relatorio": "REPORT_TOKEN (Bearer)",
  "/webhook/whatsapp": "GET: token de verificação; POST: assinatura X-Hub-Signature-256",
};

let base, servidor;
const respostas = [];
before(async () => {
  config.whatsapp.tokenVerificacao = "token-teste";
  config.whatsapp.segredoApp = "segredo";
  config.tokenRelatorio = "relatorio-secreto";
  const agente = { responder: async (m) => (respostas.push(m), { resposta: "ok", transferido: false }) };
  servidor = criarServidor({ agente, agenteDemo: agente, armazenamento: { salvarLead: async () => {}, listarLeads: async () => [] }, notificar: async () => {}, enviarMeta: async () => {} });
  await new Promise((r) => servidor.listen(0, r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test("toda rota do servidor está na lista, com a proteção indicada", () => {
  const fonte = readFileSync(new URL("../src/servidor.js", import.meta.url), "utf8");
  const noCodigo = [...new Set([...fonte.matchAll(/url\.pathname === "([^"]+)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(noCodigo, Object.keys(ROTAS).sort());
});

test("relatório sem token, com token errado ou no método errado: recusado", async () => {
  assert.equal((await fetch(`${base}/api/relatorio`)).status, 401);
  assert.equal((await fetch(`${base}/api/relatorio`, { headers: { authorization: "Bearer errado" } })).status, 401);
  assert.equal((await fetch(`${base}/api/relatorio?token=quase-relatorio-secreto`)).status, 401);
  assert.equal((await fetch(`${base}/api/relatorio`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`${base}/api/relatorio`, { headers: { authorization: "Bearer relatorio-secreto" } })).status, 200, "controle: com o token certo responde");
});

test("webhook: verificação exige o token e mensagem exige assinatura válida", async () => {
  assert.equal((await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=x`)).status, 403);
  const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid.x1", from: "5534900000000", type: "text", text: { body: "oi" } }] } }] }] });
  const post = (assinatura) => fetch(`${base}/webhook/whatsapp`, { method: "POST", headers: { "content-type": "application/json", ...(assinatura ? { "x-hub-signature-256": assinatura } : {}) }, body: corpo });
  assert.equal((await post()).status, 401);
  assert.equal((await post("sha256=" + createHmac("sha256", "outro-segredo").update(corpo).digest("hex"))).status, 401);
  assert.equal(respostas.length, 0, "nada chegou à IA");
});

test("webhook: a mesma mensagem reenviada pela Meta é respondida uma vez só", async () => {
  const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid.repetida", from: "5534900000001", type: "text", text: { body: "oi" } }] } }] }] });
  const assinatura = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
  for (let i = 0; i < 3; i++) assert.equal((await fetch(`${base}/webhook/whatsapp`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": assinatura }, body: corpo })).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(respostas.filter((m) => m.telefone === "5534900000001").length, 1);
});

test("chat e lead recusam origem de outro site", async () => {
  for (const c of ["/api/chat", "/api/lead"]) {
    const r = await fetch(base + c, { method: "POST", headers: { "content-type": "application/json", origin: "https://site-malicioso.example" }, body: JSON.stringify({ sessao: "sessao-teste-1", mensagem: "oi", tipo: "teste", dados: { email: "a@b.com" } }) });
    assert.equal(r.status, 403, c);
  }
});
