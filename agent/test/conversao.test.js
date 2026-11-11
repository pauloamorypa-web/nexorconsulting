/* Conversão offline vinda da Nexor Central: POST /api/conversao (fetch falso para o Meta e o webhook do Google). */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { config } from "../src/config.js";
import { acharLead, lerConversao } from "../src/conversao.js";
import { resumirCampanhas } from "../src/relatorio.js";
import { criarServidor } from "../src/servidor.js";

const sha = (v) => createHash("sha256").update(v).digest("hex");
let base;
let servidor;
const registros = [];
const chamadas = [];
let foraDoAr = false;

/* fetch falso: Graph API do Meta e LEAD_WEBHOOK_URL (linha do Google) */
const fetchFalso = async (alvo, op) => {
  const corpo = JSON.parse(op.body);
  chamadas.push({ alvo: String(alvo), corpo });
  if (foraDoAr) return new Response("indisponível", { status: 503 });
  return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
};
const paraMeta = () => chamadas.filter((c) => c.alvo.startsWith("https://graph.facebook.com/"));
const paraGoogle = () => chamadas.filter((c) => c.alvo === "https://webhook.teste/leads");

const LEADS = [
  // Veio do Google e do Meta, com consentimento de medição no aviso de cookies
  { id: "lead-ana-0001", tipo: "conversa", conversa: "site:ana00001", canal: "site", campanha: "barber", produto: "Nexor Barber", email: "Ana@Navalha.com.br", telefone: "(34) 99733-7499", consentimento_medicao: true, origem: { utm_source: "google", utm_medium: "cpc", utm_campaign: "barber", gclid: "gclid-ana", fbclid: "fbclid-ana", fbp: "fb.1.1700000000000.123" }, registrado_em: "2026-11-01T12:00:00.000Z" },
  // Sem consentimento
  { id: "lead-bia-0002", tipo: "teste", sessao: "bia00002", canal: "site", campanha: "contabil", email: "bia@contabil.com.br", consentimento_medicao: false, origem: { gclid: "gclid-bia" }, registrado_em: "2026-11-02T12:00:00.000Z" },
  // Com consentimento, mas sem identificador de clique
  { id: "lead-caio-003", tipo: "conversa", conversa: "site:caio0003", canal: "site", campanha: "rh-ponto", email: "caio@rh.com.br", consentimento_medicao: true, origem: { utm_source: "instagram" }, registrado_em: "2026-11-03T12:00:00.000Z" },
];

before(async () => {
  config.tokenConversao = "tok-blue";
  config.meta.pixel = "123456";
  config.meta.token = "capi-token";
  config.meta.codigoTeste = "";
  config.webhookLeads = "https://webhook.teste/leads";
  registros.push(...LEADS);
  servidor = criarServidor({
    agente: { responder: async () => ({ resposta: "" }) },
    armazenamento: { salvarLead: async (l) => registros.push(l), listarLeads: async () => registros },
    notificar: async () => {},
    fetchConversao: fetchFalso,
  });
  await new Promise((r) => servidor.listen(0, r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

const enviar = (corpo, token = "tok-blue") =>
  fetch(`${base}/api/conversao`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(corpo) });
const teste = { id: "c0nv-teste-ana-0001", evento: "teste_ativado", quando: "2026-11-05T15:00:00.000Z", produto: "barber", mensalidade: 89, implantacao: 0, valor: 89, moeda: "BRL", em: sha("ana@navalha.com.br") };

test("token errado ou ausente: 401", async () => {
  assert.equal((await enviar(teste, "errado")).status, 401);
  assert.equal((await enviar(teste, "")).status, 401);
  assert.equal(chamadas.length, 0);
});

test("corpo inválido: 400", async () => {
  assert.equal((await enviar({ ...teste, evento: "outro" })).status, 400);
  assert.equal((await enviar({ ...teste, id: "x" })).status, 400);
});

test("teste ativado: StartTrial no Meta e linha do Google, uma vez só mesmo com reentrega", async () => {
  const r = await enviar(teste);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual([d.lead_encontrado, d.campanha, d.enviado, d.duplicado], [true, "barber", { meta: true, google: true }, false]);
  assert.equal(paraMeta().length, 1);
  const ev = paraMeta()[0].corpo.data[0];
  assert.equal(ev.event_name, "StartTrial");
  assert.equal(ev.action_source, "system_generated");
  assert.equal(ev.custom_data.value, 89);
  assert.equal(ev.custom_data.currency, "BRL");
  assert.equal(ev.custom_data.campanha, "barber");
  assert.deepEqual(ev.user_data.em, [sha("ana@navalha.com.br")]);
  assert.deepEqual(ev.user_data.ph, [sha("5534997337499")]); // completado pelo lead, em hash
  assert.match(ev.user_data.fbc, /^fb\.1\.\d+\.fbclid-ana$/);
  assert.equal(ev.user_data.fbp, "fb.1.1700000000000.123");
  assert.ok(!JSON.stringify(ev).includes("navalha.com.br"), "nada de e-mail em texto");
  const g = paraGoogle()[0].corpo;
  assert.equal(g.tipo, "conversao_google");
  assert.deepEqual([g.google.gclid, g.google.conversion_name, g.google.conversion_value, g.google.order_id], ["gclid-ana", "TesteAtivado", 89, "c0nv-teste-ana-0001-teste_ativado"]);

  // A Central reenvia (timeout do lado dela): nada sai de novo
  const de2 = await (await enviar(teste)).json();
  assert.equal(de2.duplicado, true);
  assert.equal(paraMeta().length, 1);
  assert.equal(paraGoogle().length, 1);
  assert.equal(registros.filter((x) => x.tipo === "conversao_offline").length, 1);
});

test("contrato: Purchase com valor da mensalidade + implantação", async () => {
  const r = await enviar({ id: "c0nv-contrato-ana-01", evento: "contrato_fechado", quando: "2026-11-20T15:00:00.000Z", produto: "barber", plano: "barber-barbearia", mensalidade: 189, implantacao: 690, valor: 879, em: sha("ana@navalha.com.br") });
  assert.equal(r.status, 200);
  const ev = paraMeta().at(-1).corpo.data[0];
  assert.equal(ev.event_name, "Purchase");
  assert.equal(ev.custom_data.value, 879);
  assert.deepEqual(ev.custom_data.content_ids, ["barber-barbearia"]);
  assert.equal(ev.event_id, "c0nv-contrato-ana-01-contrato_fechado");
  assert.equal(paraGoogle().at(-1).corpo.google.conversion_name, "Contrato");
});

test("lead não encontrado: registra sem quebrar e não envia nada", async () => {
  const n = chamadas.length;
  const r = await enviar({ id: "c0nv-sem-lead-0001", evento: "contrato_fechado", mensalidade: 497, implantacao: 1500, em: sha("ninguem@empresa.com.br") });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.lead_encontrado, false);
  assert.equal(d.motivo, "lead_nao_encontrado");
  assert.equal(chamadas.length, n);
  const reg = registros.at(-1);
  assert.equal(reg.valor, 1997);
  assert.equal(reg.lead, null);
  // Sem nenhum identificador também é aceito (só registra)
  assert.equal((await enviar({ id: "c0nv-sem-nada-0001", evento: "teste_ativado" })).status, 200);
});

test("sem consentimento: registra e não manda ao Meta nem ao Google", async () => {
  const n = chamadas.length;
  const d = await (await enviar({ id: "c0nv-bia-teste-0001", evento: "teste_ativado", valor: 397, em: sha("bia@contabil.com.br") })).json();
  assert.deepEqual([d.lead_encontrado, d.campanha, d.motivo, d.enviado], [true, "contabil", "sem_consentimento", { meta: false, google: false }]);
  assert.equal(chamadas.length, n);
});

test("sem gclid: vai só ao Meta (hash do e-mail), sem linha do Google", async () => {
  const g = paraGoogle().length;
  const d = await (await enviar({ id: "c0nv-caio-teste-001", evento: "teste_ativado", valor: 149, email: "Caio@RH.com.br" })).json();
  assert.deepEqual([d.enviado, d.motivo], [{ meta: true, google: false }, "sem_gclid"]);
  assert.equal(paraGoogle().length, g);
  assert.deepEqual(paraMeta().at(-1).corpo.data[0].user_data.em, [sha("caio@rh.com.br")]);
  assert.ok(!JSON.stringify(registros.at(-1)).includes("rh.com.br"), "e-mail em texto não é gravado");
});

test("Meta fora do ar: 502 e nada registrado, para a Central tentar de novo", async () => {
  foraDoAr = true;
  const conv = { id: "c0nv-ana-retry-0001", evento: "contrato_fechado", valor: 100, em: sha("ana@navalha.com.br") };
  assert.equal((await enviar(conv)).status, 502);
  assert.ok(!registros.some((x) => x.id === conv.id));
  foraDoAr = false;
  assert.equal((await enviar(conv)).status, 200);
  assert.equal(registros.filter((x) => x.id === conv.id).length, 1);
});

test("relatório por campanha: testes, contratos, receita e CAC real", () => {
  const { porCampanha, conversao_offline } = resumirCampanhas(registros, { investimento: "barber: R$ 500; contabil: R$ 200" });
  const barber = porCampanha.find((g) => g.campanha === "barber");
  assert.equal(barber.testes, 1);
  assert.equal(barber.contratos, 2);
  assert.equal(barber.receita, 979);
  assert.equal(barber.cac, 250);
  assert.equal(barber.custo_por_teste, 500);
  assert.equal(porCampanha.find((g) => g.campanha === "contabil").testes, 1);
  assert.equal(conversao_offline.sem_lead.contratos, 1);
  assert.equal(conversao_offline.contratos, 3);
  assert.equal(conversao_offline.receita, 2976);
  assert.equal(conversao_offline.cac_geral, Math.round((700 / 3) * 100) / 100);
  // As conversões não contam como leads
  assert.equal(barber.leads, 1);
});

test("lerConversao e acharLead: e-mail/telefone em texto viram hash; acha pelo telefone", () => {
  const c = lerConversao({ id: "abcdefgh", evento: "teste_ativado", telefone: "34 99733-7499", email: "X@Y.com" });
  assert.equal(c.ph, sha("5534997337499"));
  assert.equal(c.em, sha("x@y.com"));
  assert.ok(!("telefone" in c) && !("email" in c));
  assert.equal(acharLead(registros, { ph: sha("5534997337499") }).id, "lead-ana-0001");
  assert.equal(acharLead(registros, {}), null);
});
