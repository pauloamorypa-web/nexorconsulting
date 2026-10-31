import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { config } from "../src/config.js";
import { criarServidor } from "../src/servidor.js";

let base;
let servidor;
const recebidas = [];

before(async () => {
  config.whatsapp.tokenVerificacao = "token-teste";
  config.whatsapp.segredoApp = "segredo";
  const agente = {
    async responder(m) {
      recebidas.push(m);
      return { resposta: `eco: ${m.texto}`, transferido: false };
    },
  };
  servidor = criarServidor({ agente });
  await new Promise((r) => servidor.listen(0, r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

const chat = (corpo, origem = "https://pauloamorypa-web.github.io") =>
  fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origem }, body: JSON.stringify(corpo) });

test("health responde ok", async () => {
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { ok: true });
});

test("chat do site responde e libera CORS para o site da Nexor", async () => {
  const r = await chat({ sessao: "abc12345", mensagem: "Olá" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://pauloamorypa-web.github.io");
  assert.equal((await r.json()).resposta, "eco: Olá");
  assert.equal(recebidas.at(-1).idConversa, "site:abc12345");
});

test("chat recusa outra origem, sessão inválida e mensagem longa", async () => {
  assert.equal((await chat({ sessao: "abc12345", mensagem: "oi" }, "https://outro.site")).status, 403);
  assert.equal((await chat({ sessao: "x", mensagem: "oi" })).status, 400);
  assert.equal((await chat({ sessao: "abc12345", mensagem: "a".repeat(5000) })).status, 400);
});

test("verificação do webhook do WhatsApp", async () => {
  const ok = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=token-teste&hub.challenge=42`);
  assert.equal(await ok.text(), "42");
  const ruim = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42`);
  assert.equal(ruim.status, 403);
});

test("webhook sem assinatura válida é recusado", async () => {
  const r = await fetch(`${base}/webhook/whatsapp`, { method: "POST", headers: { "X-Hub-Signature-256": "sha256=00" }, body: "{}" });
  assert.equal(r.status, 401);
});
