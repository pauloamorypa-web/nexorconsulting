/* Testes de segurança: isolamento entre empresas no webhook, contas, sessões e arquivos. */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, describe, test } from "node:test";
import { iniciarApp, mensagemRecebida } from "./ajuda.js";

const assinar = (corpo, segredo) => "sha256=" + createHmac("sha256", segredo).update(corpo).digest("hex");

describe("isolamento entre empresas no webhook", async () => {
  const t = await iniciarApp({ extraCfg: { permitirCadastro: true } });
  after(() => t.fechar());

  // Empresa A cadastra o próprio segredo de app; a empresa B usa o app global
  await t.chamar("POST", "/api/cadastro", { empresa: "Empresa A", nome: "Ana", email: "a@teste.com", senha: "senha-forte-aaa" });
  await t.chamar("POST", "/api/canais", { phone_number_id: "111111", waba_id: "900001", token: "EAAtokenfalsoAAAAAAAAAAAA", segredo_app: "segredo-da-a" });
  t.sair();
  await t.chamar("POST", "/api/cadastro", { empresa: "Empresa B", nome: "Beto", email: "b@teste.com", senha: "senha-forte-bbb" });
  await t.chamar("POST", "/api/canais", { phone_number_id: "222222", waba_id: "900002", token: "EAAtokenfalsoBBBBBBBBBBBB" });

  const enviar = async (payload, segredo) => {
    const corpo = JSON.stringify(payload);
    const r = await fetch(`${t.base}/webhook/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": assinar(corpo, segredo) }, body: corpo });
    await new Promise((res) => setTimeout(res, 20));
    await t.app.atendimento.ocioso();
    return r.status;
  };

  test("o segredo próprio da empresa A não assina mensagens para o número da empresa B", async () => {
    const daA = mensagemRecebida("oi", { numero: "111111", de: "5534911110000" });
    const forjada = mensagemRecebida("mensagem falsa", { numero: "222222", de: "5534922220000" });
    const payload = { ...daA, entry: [...daA.entry, ...forjada.entry] };
    assert.equal(await enviar(payload, "segredo-da-a"), 401);
    assert.equal(await enviar(forjada, "segredo-da-a"), 401);
    const conversasB = await t.chamar("GET", "/api/conversas?filtro=todas");
    assert.equal(conversasB.dados.length, 0);
  });

  test("o segredo próprio continua valendo para o número da própria empresa", async () => {
    assert.equal(await enviar(mensagemRecebida("oi", { numero: "111111", de: "5534911110000" }), "segredo-da-a"), 200);
  });
});

describe("contas e sessões", async () => {
  const t = await iniciarApp();
  after(() => t.fechar());
  await t.chamar("POST", "/api/cadastro", { empresa: "Loja", nome: "Dona", email: "dona@teste.com", senha: "senha-da-dona-1" });
  const dono = (await t.chamar("GET", "/api/eu")).dados.usuario;
  await t.chamar("POST", "/api/usuarios", { nome: "Admin", email: "admin@teste.com", senha: "senha-do-admin-1", papel: "admin" });

  test("um admin não troca a senha do dono", async () => {
    t.sair();
    assert.equal((await t.chamar("POST", "/api/entrar", { email: "admin@teste.com", senha: "senha-do-admin-1" })).status, 200);
    const r = await t.chamar("PUT", `/api/usuarios/${dono.id}`, { senha: "senha-tomada-123" });
    assert.equal(r.status, 403);
    t.sair();
    assert.equal((await t.chamar("POST", "/api/entrar", { email: "dona@teste.com", senha: "senha-da-dona-1" })).status, 200);
  });

  test("trocar a senha encerra as outras sessões e mantém a atual", async () => {
    t.sair();
    await t.chamar("POST", "/api/entrar", { email: "dona@teste.com", senha: "senha-da-dona-1" });
    const outra = (await fetch(`${t.base}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json", "x-nexor": "1" }, body: JSON.stringify({ email: "dona@teste.com", senha: "senha-da-dona-1" }) })).headers
      .get("set-cookie")
      .split(";")[0];
    assert.equal((await t.chamar("GET", "/api/eu", undefined, { cookie: outra })).status, 200);
    const r = await t.chamar("PUT", `/api/usuarios/${dono.id}`, { senha: "senha-nova-da-dona", senha_atual: "senha-da-dona-1" });
    assert.equal(r.status, 200);
    assert.equal((await t.chamar("GET", "/api/eu", undefined, { cookie: outra })).status, 401);
    assert.equal((await t.chamar("GET", "/api/eu")).status, 200);
  });

  test("cookie malformado não derruba a API", async () => {
    const r = await fetch(`${t.base}/api/eu`, { headers: { cookie: "outro=%E0%A4%A; nx_sessao=%zz" } });
    assert.equal(r.status, 401);
  });
});

describe("arquivos", async () => {
  const t = await iniciarApp();
  after(() => t.fechar());
  await t.chamar("POST", "/api/cadastro", { empresa: "Loja", nome: "Dona", email: "dona@teste.com", senha: "senha-da-dona-1" });

  test("arquivos que não são mídia baixam com CSP isolada", async () => {
    const up = await t.chamar("POST", "/api/midia", "<script>alert(1)</script>", { "Content-Type": "text/plain" });
    assert.equal(up.status, 200);
    const cab = await fetch(`${t.base}/api/midia/${up.dados.arquivo}`, { headers: { cookie: await loginCookie(t) } });
    assert.equal(cab.status, 200);
    assert.equal(cab.headers.get("content-disposition"), "attachment");
    assert.match(cab.headers.get("content-security-policy"), /sandbox/);
    assert.equal(cab.headers.get("x-content-type-options"), "nosniff");
  });

  test("caminhos fora da pasta pública não são servidos", async () => {
    for (const caminho of ["/..%2fpackage.json", "/..%2f..%2fatende%2fpackage.json", "/%E0%A4%A"]) {
      const r = await fetch(`${t.base}${caminho}`);
      assert.notEqual(r.status, 200, caminho);
      assert.doesNotMatch(await r.text(), /nexor-atende-ia/);
    }
  });

  test("respostas da API vão com nosniff", async () => {
    const r = await fetch(`${t.base}/api/estado`);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  });
});

async function loginCookie(t) {
  const r = await fetch(`${t.base}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json", "x-nexor": "1" }, body: JSON.stringify({ email: "dona@teste.com", senha: "senha-da-dona-1" }) });
  return r.headers.get("set-cookie").split(";")[0];
}
