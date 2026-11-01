import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { config } from "../src/config.js";
import { limparOrigem, resumirLeads, rotuloOrigem, temperatura } from "../src/leads.js";
import { enviarParaMeta, eventosMeta } from "../src/meta.js";
import { gerarRelatorio } from "../src/relatorio.js";

const sha = (v) => createHash("sha256").update(v).digest("hex");

test("temperatura do lead", () => {
  assert.equal(temperatura("interesse", 0), "quente");
  assert.equal(temperatura("teste", 3), "morno");
  assert.equal(temperatura("teste", 12), "quente");
  assert.equal(temperatura("parcial", 2), "frio");
  assert.equal(temperatura("parcial", 8), "morno");
});

test("origem: limpa campos e gera rótulo legível", () => {
  assert.deepEqual(limparOrigem({ utm_source: " google ", outra: "x", gclid: "abc" }), { utm_source: "google", gclid: "abc" });
  assert.equal(rotuloOrigem({ utm_source: "google", utm_medium: "cpc", utm_campaign: "erp" }), "google / cpc / erp");
  assert.equal(rotuloOrigem({ gclid: "x" }), "google / anúncio");
  assert.equal(rotuloOrigem({ referencia: "www.google.com" }), "google / busca");
  assert.equal(rotuloOrigem({}), "direto");
});

test("resumo por campanha com taxa de leads quentes", () => {
  const agora = new Date().toISOString();
  const r = resumirLeads([
    { tipo: "teste", temperatura: "quente", origem: { utm_source: "meta", utm_campaign: "a" }, registrado_em: agora },
    { tipo: "teste", temperatura: "frio", origem: { utm_source: "meta", utm_campaign: "a" }, registrado_em: agora },
    { tipo: "blue", temperatura: "morno", origem: {}, registrado_em: "2020-01-01T00:00:00Z" },
  ], { desde: new Date(Date.now() - 86400_000) });
  assert.deepEqual(r.total, { leads: 2, quente: 1, morno: 0, frio: 1 });
  assert.equal(r.porOrigem[0].origem, "meta / a");
  assert.equal(r.porOrigem[0].taxa_quente, 50);
});

test("eventos da Meta usam hash e mandam LeadQuente para leads quentes", () => {
  const ev = eventosMeta(
    { id: "id-123456", sessao: "s1234567", tipo: "interesse", temperatura: "quente", nome: "Ana Souza", telefone: "(34) 99999-0000", email: " Ana@X.com ", registrado_em: "2026-11-01T12:00:00Z", origem: { fbc: "fb.1.1.Z" } },
    { ip: "1.2.3.4", navegador: "ua" },
  );
  assert.deepEqual(ev.map((e) => e.event_name), ["Lead", "LeadQuente"]);
  assert.equal(ev[0].event_id, "id-123456");
  assert.deepEqual(ev[0].user_data.ph, [sha("5534999990000")]);
  assert.deepEqual(ev[0].user_data.em, [sha("ana@x.com")]);
  assert.deepEqual(ev[0].user_data.fn, [sha("ana")]);
  assert.equal(ev[0].user_data.fbc, "fb.1.1.Z");
  assert.equal(ev[0].custom_data.value, 300);
});

test("envio para a Meta só acontece quando configurado e não manda leads parciais", async () => {
  const chamadas = [];
  const fetchFn = async (url, init) => (chamadas.push({ url, corpo: JSON.parse(init.body) }), { ok: true });
  const lead = { id: "id-123456", sessao: "s1234567", tipo: "teste", temperatura: "morno", telefone: "34999990000", registrado_em: new Date().toISOString() };
  assert.equal(await enviarParaMeta(lead, {}, { fetchFn }), false);
  Object.assign(config.meta, { pixel: "999", token: "tok" });
  try {
    assert.equal(await enviarParaMeta({ ...lead, tipo: "parcial" }, {}, { fetchFn }), false);
    assert.equal(await enviarParaMeta(lead, {}, { fetchFn }), true);
    assert.match(chamadas[0].url, /graph\.facebook\.com\/v\d+\.\d+\/999\/events\?access_token=tok/);
    assert.equal(chamadas[0].corpo.data[0].event_name, "Lead");
  } finally {
    Object.assign(config.meta, { pixel: "", token: "" });
  }
});

test("relatório pede a análise ao Claude só quando há leads", async () => {
  let pedido;
  const cliente = { beta: { messages: { create: async (p) => ((pedido = p), { content: [{ type: "text", text: "Escalar meta / a." }] }) } } };
  const armazenamento = { listarLeads: async () => [{ tipo: "teste", temperatura: "quente", origem: { utm_source: "meta", utm_campaign: "a" }, registrado_em: new Date().toISOString() }] };
  const r = await gerarRelatorio({ armazenamento, analise: true, cliente, investimento: "meta/a: R$ 100" });
  assert.equal(r.analise, "Escalar meta / a.");
  assert.match(pedido.messages[0].content, /R\$ 100/);
  const vazio = await gerarRelatorio({ armazenamento: { listarLeads: async () => [] }, analise: true, cliente: null });
  assert.equal(vazio.analise, undefined);
});
