import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { config } from "../src/config.js";
import { criarServidor } from "../src/servidor.js";

let base;
let servidor;
const recebidas = [];
const leads = [];
const avisos = [];
const paraMeta = [];

before(async () => {
  config.whatsapp.tokenVerificacao = "token-teste";
  config.whatsapp.segredoApp = "segredo";
  config.tokenRelatorio = "relatorio-secreto";
  const agente = {
    async responder(m) {
      recebidas.push(m);
      return { resposta: `eco: ${m.texto}`, transferido: false };
    },
  };
  const agenteDemo = {
    async responder(m) {
      recebidas.push(m);
      return { resposta: "demo", transferido: false };
    },
  };
  servidor = criarServidor({ agente, agenteDemo, armazenamento: { salvarLead: async (l) => leads.push(l), listarLeads: async () => leads },
    notificar: async (t, d) => avisos.push({ ...d, texto: t }),
    enviarMeta: async (l, ctx) => paraMeta.push({ l, ctx }),
  });
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

const lead = (corpo) =>
  fetch(`${base}/api/lead`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://pauloamorypa-web.github.io" }, body: JSON.stringify(corpo) });

test("modo de teste usa o agente de demonstração com os dados da empresa", async () => {
  const r = await chat({ sessao: "demo1234", mensagem: "Vocês abrem sábado?", modo: "demo", negocio: { nome: "Pizzaria Bella", segmento: "pizzaria", info: "Abre de terça a domingo, 18h às 23h" } });
  assert.equal((await r.json()).resposta, "demo");
  const m = recebidas.at(-1);
  assert.equal(m.idConversa, "demo:demo1234");
  assert.match(m.contexto, /Pizzaria Bella/);
});

test("lead de teste grátis é salvo e avisa a equipe", async () => {
  const r = await lead({ sessao: "lead1234", tipo: "teste", solucao: "Nexor Commerce", dados: { nome: "Bia", telefone: "34999990000" }, pontuacao: 3 });
  assert.equal(r.status, 200);
  assert.equal(leads.at(-1).solucao, "Nexor Commerce");
  assert.equal(avisos.at(-1).tipo, "teste");
});

test("lead parcial só avisa a equipe quando é quente, e não repete", async () => {
  const antes = avisos.length;
  await lead({ sessao: "parc1234", tipo: "parcial", dados: { telefone: "34988887777" }, pontuacao: 2 });
  assert.equal(avisos.length, antes);
  await lead({ sessao: "parc1234", tipo: "parcial", dados: { telefone: "34988887777" }, pontuacao: 12 });
  assert.equal(avisos.length, antes + 1);
  const salvos = leads.length;
  await lead({ sessao: "parc1234", tipo: "parcial", dados: { telefone: "34988887777" }, pontuacao: 12 });
  assert.equal(leads.length, salvos);
});

test("lead sem contato ou com tipo inválido é recusado", async () => {
  assert.equal((await lead({ sessao: "x1234567", tipo: "teste", dados: { nome: "Sem contato" } })).status, 400);
  assert.equal((await lead({ sessao: "x1234567", tipo: "spam", dados: { telefone: "1" } })).status, 400);
});

test("lead sem consentimento ou com recusa no aviso de cookies não vai para a Meta, e a escolha fica registrada", async () => {
  const antes = paraMeta.length;
  await lead({ id: "sem-consent-1", sessao: "camp9999", tipo: "interesse", dados: { nome: "Ana", telefone: "34977775555" }, pontuacao: 4 });
  assert.equal(leads.at(-1).consentimento.medicao, false);
  await lead({ id: "recusou-1234", sessao: "camp9998", tipo: "interesse", dados: { telefone: "34977775554" }, consentimento: { medicao: false, versao: 2, em: "2026-11-09T10:00:00.000Z" } });
  const l = leads.at(-1);
  assert.equal(l.consentimento.medicao, false);
  assert.equal(l.consentimento.escolhido_em, "2026-11-09T10:00:00.000Z");
  assert.equal(l.consentimento.origem, "aviso-de-cookies");
  // valor "truthy" que não é true não conta como consentimento
  await lead({ id: "texto-sim-12", sessao: "camp9997", tipo: "interesse", dados: { telefone: "34977775553" }, consentimento: { medicao: "sim" } });
  assert.equal(paraMeta.length, antes, "sem medicao: true, nada vai para a Meta");
  assert.equal(leads.at(-1).aceita_novidades, false);
});

test("lead guarda a origem da campanha, calcula a temperatura e vai para a Meta (com consentimento)", async () => {
  const r = await lead({
    consentimento: { medicao: true, versao: 2, em: "2026-11-09T12:00:00.000Z" },
    novidades: true,
    id: "abc-12345678",
    sessao: "camp1234",
    tipo: "interesse",
    temperatura: "frio", // o servidor ignora a temperatura enviada pelo navegador
    dados: { nome: "Carlos Lima", telefone: "34977776666" },
    pontuacao: 4,
    origem: { utm_source: "instagram", utm_medium: "pago", utm_campaign: "teste12h", fbc: "fb.1.1.XYZ", lixo: "x" },
  });
  assert.equal(r.status, 200);
  const l = leads.at(-1);
  assert.equal(l.id, "abc-12345678");
  assert.equal(l.temperatura, "quente");
  assert.deepEqual(l.origem, { utm_source: "instagram", utm_medium: "pago", utm_campaign: "teste12h", fbc: "fb.1.1.XYZ" });
  assert.equal(paraMeta.at(-1).l.id, "abc-12345678");
  assert.deepEqual({ ...l.consentimento, recebido_em: undefined }, { medicao: true, versao: 2, escolhido_em: "2026-11-09T12:00:00.000Z", recebido_em: undefined, origem: "aviso-de-cookies" });
  assert.equal(l.aceita_novidades, true);
  assert.match(avisos.at(-1).texto, /Quente · origem: instagram \/ pago \/ teste12h/);
});

test("relatório exige token e agrupa leads por campanha", async () => {
  assert.equal((await fetch(`${base}/api/relatorio`)).status, 401);
  assert.equal((await fetch(`${base}/api/relatorio`, { headers: { Authorization: "Bearer errado" } })).status, 401);
  const r = await fetch(`${base}/api/relatorio?dias=30`, { headers: { Authorization: "Bearer relatorio-secreto" } });
  assert.equal(r.status, 200);
  const rel = await r.json();
  assert.equal(rel.total.leads, leads.length);
  const camp = rel.porOrigem.find((g) => g.origem === "instagram / pago / teste12h");
  assert.equal(camp.quente, 1);
});

test("limitador barra excesso por chave e libera depois da janela", async () => {
  const { criarLimitador } = await import("../src/servidor.js");
  let t = 0;
  const lim = criarLimitador({ quantidade: 2, janelaMs: 1000 }, () => t);
  assert.equal(lim("a"), true);
  assert.equal(lim("a"), true);
  assert.equal(lim("a"), false);
  assert.equal(lim("b"), true);
  t = 1500;
  assert.equal(lim("a"), true);
});

test("ip do cliente: sem proxy confiável, ignora cabeçalhos forjados e usa o IP da conexão", async () => {
  const { ipDoCliente } = await import("../src/servidor.js");
  const semProxy = { confiaveis: [], tunel: false };
  const forjado = { "cf-connecting-ip": "8.8.8.8", "true-client-ip": "8.8.4.4", "x-forwarded-for": "1.1.1.1" };
  assert.equal(ipDoCliente({ headers: forjado, socket: { remoteAddress: "203.0.113.7" } }, semProxy), "203.0.113.7");
  assert.equal(ipDoCliente({ headers: forjado, socket: { remoteAddress: "::ffff:203.0.113.7" } }, semProxy), "203.0.113.7");
  // Um proxy na lista não confia em quem está fora dela
  const outro = { confiaveis: ["10.0.0.0/8"], tunel: false };
  assert.equal(ipDoCliente({ headers: forjado, socket: { remoteAddress: "198.51.100.9" } }, outro), "198.51.100.9");
});

test("ip do cliente: atrás de proxy confiável ou túnel, usa os cabeçalhos", async () => {
  const { ipDoCliente } = await import("../src/servidor.js");
  const lista = { confiaveis: ["10.0.0.0/8", "127.0.0.1"], tunel: false };
  const doProxy = (headers) => ({ headers, socket: { remoteAddress: "10.1.2.3" } });
  assert.equal(ipDoCliente(doProxy({ "cf-connecting-ip": "8.8.8.8", "x-forwarded-for": "1.1.1.1" }), lista), "8.8.8.8");
  assert.equal(ipDoCliente(doProxy({ "true-client-ip": "8.8.4.4" }), lista), "8.8.4.4");
  // X-Forwarded-For: o visitante pode pôr o que quiser à esquerda; vale o último antes dos proxies confiáveis
  assert.equal(ipDoCliente(doProxy({ "x-forwarded-for": "6.6.6.6, 9.9.9.9, 10.0.0.5" }), lista), "9.9.9.9");
  // Valor que não é IP é ignorado
  assert.equal(ipDoCliente(doProxy({ "cf-connecting-ip": "<script>", "x-forwarded-for": "lixo" }), lista), "10.1.2.3");
  // Túnel: toda conexão vem dele (ex.: cloudflared em 127.0.0.1)
  assert.equal(ipDoCliente({ headers: { "cf-connecting-ip": "8.8.8.8" }, socket: { remoteAddress: "127.0.0.1" } }, { confiaveis: [], tunel: true }), "8.8.8.8");
});

test("lista de proxies aceita IP exato e faixa CIDR", async () => {
  const { ipNaLista } = await import("../src/servidor.js");
  assert.equal(ipNaLista("10.20.30.40", ["10.0.0.0/8"]), true);
  assert.equal(ipNaLista("11.0.0.1", ["10.0.0.0/8"]), false);
  assert.equal(ipNaLista("::1", ["::1"]), true);
  assert.equal(ipNaLista("não-é-ip", ["0.0.0.0/0"]), false);
});

test("respostas da API saem com cabeçalhos de segurança", async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
});
