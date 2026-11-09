import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import { config } from "../src/config.js";
import { criarServidor } from "../src/servidor.js";

let base;
let servidor;
const recebidas = [];
const leads = [];
const avisos = [];
const paraMeta = [];
const optOutSends = [];
const optOutWaiters = [];

before(async () => {
  config.whatsapp.tokenVerificacao = "token-teste";
  config.whatsapp.segredoApp = "segredo";
  config.tokenRelatorio = "relatorio-secreto";
  config.vendas.habilitado = true;
  config.vendas.token = "x".repeat(40);
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
  servidor = criarServidor({ agente, agenteDemo, armazenamento: {
    salvarLead: async (l) => leads.push(l),
    listarLeads: async () => leads,
    async revogarLembretes(numero) { optOutSends.push({ tipo: "revogar", numero }); },
    async cancelarAgendamentos(numero) { optOutSends.push({ tipo: "cancelar_reuniao", numero }); return [{ id: "m1", calendar_event_id: "n12345678901234567890123456789012" }]; },
  },
    notificar: async (t, d) => avisos.push({ ...d, texto: t }),
    enviarMeta: async (l, ctx) => paraMeta.push({ l, ctx }),
    clienteVendas: { messages: { async create() { return { content: [{ type: "text", text: "Sou a assistente virtual da Nexor. Vi que vocês estão avaliando atendimento no WhatsApp; vale uma conversa curta?" }] }; } } },
    enviarTextoWhatsApp: async (numero, texto) => {
      optOutSends.push({ tipo: "mensagem", numero, texto });
      optOutWaiters.shift()?.();
    },
    marcarLidaWhatsApp: async () => {},
    calendario: { configurado: () => true, async cancelarReuniao(id) { optOutSends.push({ tipo: "calendar_delete", id }); } },
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

test("webhook de opt-out revoga lembretes antes da confirmação e deduplica repetição da Meta", async () => {
  const corpo = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ id: "wamid-optout-001", from: "5534999911111", type: "text", text: { body: "PARAR" } }] } }] }] });
  const assinatura = "sha256=" + createHmac("sha256", "segredo").update(Buffer.from(corpo)).digest("hex");
  const enviar = () => fetch(`${base}/webhook/whatsapp`, { method: "POST", headers: { "X-Hub-Signature-256": assinatura }, body: corpo });
  const esperar = new Promise((resolve) => optOutWaiters.push(resolve));
  assert.equal((await enviar()).status, 200);
  await esperar;
  assert.equal(optOutSends.at(-2).tipo, "revogar");
  assert.equal(optOutSends.at(-2).numero, "5534999911111");
  assert.match(optOutSends.at(-1).texto, /cancelei os lembretes/i);
  assert.equal((await enviar()).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(optOutSends.length, 2, "reenvio da Meta não repete a ação");
});

test("pedido explícito de cancelamento interrompe reunião, evento Google e lembretes", async () => {
  const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid-cancel-001", from: "5534999911111", type: "text", text: { body: "Quero cancelar a reunião, por favor" } }] } }] }] });
  const assinatura = "sha256=" + createHmac("sha256", "segredo").update(Buffer.from(corpo)).digest("hex");
  const esperar = new Promise((resolve) => optOutWaiters.push(resolve));
  const r = await fetch(`${base}/webhook/whatsapp`, { method: "POST", headers: { "X-Hub-Signature-256": assinatura }, body: corpo });
  assert.equal(r.status, 200);
  await esperar;
  assert.equal(optOutSends.at(-3).tipo, "cancelar_reuniao");
  assert.equal(optOutSends.at(-2).tipo, "calendar_delete");
  assert.match(optOutSends.at(-1).texto, /cancelei a reunião/i);
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

test("qualificação comercial exige bearer válido e registra lead sem enviar mensagem ao prospect", async () => {
  const payload = {
    nome: "Ana",
    empresa: "Clínica Horizonte",
    necessidade: "Precisamos atender pacientes pelo WhatsApp e reduzir o tempo de resposta da recepção.",
    canal_origem: "linkedin_lead_form",
    fonte_url: "https://www.linkedin.com/company/clinica-horizonte/",
    contato: { email: "ana@example.com" },
  };
  const endpoint = `${base}/api/vendas/qualificar`;
  assert.equal((await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer errado" }, body: JSON.stringify(payload) })).status, 401);
  const antes = avisos.length;
  const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.vendas.token}` }, body: JSON.stringify(payload) });
  assert.equal(r.status, 201);
  const corpo = await r.json();
  assert.equal(corpo.qualificacao.produto_recomendado, "Nexor Atende IA");
  assert.equal(corpo.qualificacao.envio_automatico_habilitado, false);
  assert.equal(avisos.length, antes + 1, "só avisa a equipe comercial para lead com score qualificado");
  assert.equal(leads.at(-1).tipo, "vendas_qualificacao");
  assert.equal(leads.at(-1).contato_permitido, false);
});

test("API comercial fica invisível se desabilitada ou sem segredo forte", async () => {
  const endpoint = `${base}/api/vendas/qualificar`;
  config.vendas.habilitado = false;
  const r1 = await fetch(endpoint, { method: "POST" });
  assert.equal(r1.status, 404);
  config.vendas.habilitado = true;
  config.vendas.token = "curto";
  const r2 = await fetch(endpoint, { method: "POST" });
  assert.equal(r2.status, 404);
  config.vendas.token = "x".repeat(40);
});

test("rascunho comercial exige autorização e retorna texto sem enviar ao prospect", async () => {
  const endpoint = `${base}/api/vendas/rascunho`;
  const baseLead = {
    nome: "Ana", empresa: "Clínica Horizonte", necessidade: "Precisamos atender clientes pelo WhatsApp com mais agilidade.",
    canal_origem: "site", contato: { email: "ana@example.com" },
  };
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${config.vendas.token}` };
  assert.equal((await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(baseLead) })).status, 401);
  assert.equal((await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(baseLead) })).status, 403);
  const r = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({
    ...baseLead,
    permissao: { canal: "email", autorizacao_registrada: true, finalidade: "retorno_comercial", origem: "formulário do site", registrada_em: "2026-11-09T12:00:00.000Z" },
  }) });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.aprovacao_humana_obrigatoria, true);
  assert.equal(d.envio_automatico_habilitado, false);
});

test("lead guarda a origem da campanha, calcula a temperatura e vai para a Meta (com consentimento)", async () => {
  const antes = paraMeta.length;
  await lead({ id: "sem-consent-1", sessao: "camp9999", tipo: "interesse", dados: { nome: "Ana", telefone: "34977775555" }, pontuacao: 4 });
  assert.equal(paraMeta.length, antes, "sem consentimento de cookies, nada vai para a Meta");
  assert.equal(leads.at(-1).consentimento_medicao, false);
  const r = await lead({
    consentimento: true,
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
  assert.match(avisos.at(-1).texto, /Quente · origem: instagram \/ pago \/ teste12h/);
});

test("relatório exige token e agrupa leads por campanha", async () => {
  assert.equal((await fetch(`${base}/api/relatorio`)).status, 401);
  assert.equal((await fetch(`${base}/api/relatorio`, { headers: { Authorization: "Bearer errado" } })).status, 401);
  assert.equal((await fetch(`${base}/api/relatorio?token=relatorio-secreto`)).status, 401, "segredo em URL é recusado");
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

test("limitador falha fechado com configuração NaN, zero ou negativa", async () => {
  const { criarLimitador } = await import("../src/servidor.js");
  for (const parametros of [{ quantidade: NaN, janelaMs: NaN }, { quantidade: 0, janelaMs: -1 }]) {
    const limite = criarLimitador(parametros);
    assert.equal(limite("x"), true);
    assert.equal(limite("x"), false);
  }
});

test("ip encaminhado só é aceito com prova do proxy confiável", async () => {
  const { ipDoCliente } = await import("../src/servidor.js");
  config.proxySecret = "proxy-secreto";
  assert.equal(ipDoCliente({ headers: { "true-client-ip": "8.8.8.8", "x-nexor-proxy-secret": "errado" }, socket: { remoteAddress: "127.0.0.1" } }), "127.0.0.1");
  assert.equal(ipDoCliente({ headers: { "true-client-ip": "8.8.8.8", "x-nexor-proxy-secret": "proxy-secreto", "x-forwarded-for": "1.1.1.1" }, socket: { remoteAddress: "127.0.0.1" } }), "8.8.8.8");
  assert.equal(ipDoCliente({ headers: { "x-forwarded-for": "1.1.1.1, 9.9.9.9" }, socket: { remoteAddress: "127.0.0.1" } }), "127.0.0.1");
  assert.equal(ipDoCliente({ headers: {}, socket: { remoteAddress: "2.2.2.2" } }), "2.2.2.2");
  config.proxySecret = "";
});

test("respostas da API saem com cabeçalhos de segurança", async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
});
