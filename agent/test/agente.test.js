import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { criarAgente } from "../src/agente.js";
import { criarArmazenamento } from "../src/armazenamento.js";

/* Cliente falso: devolve as respostas na ordem e guarda cada requisição. */
function clienteFalso(respostas) {
  const requisicoes = [];
  return {
    requisicoes,
    beta: {
      messages: {
        async create(params) {
          requisicoes.push(structuredClone(params));
          const r = respostas.shift();
          if (!r) throw new Error("sem resposta preparada");
          return r;
        },
      },
    },
  };
}

const texto = (t) => ({ type: "text", text: t });
const pastasTeste = new Set();
after(async () => Promise.all([...pastasTeste].map((p) => rm(p, { recursive: true, force: true }))));

async function agenteDeTeste(respostas) {
  const cliente = clienteFalso(respostas);
  const avisos = [];
  const agente = criarAgente({
    cliente,
    armazenamento: criarArmazenamento(await criarPastaTeste()),
    notificar: async (t, dados) => avisos.push(dados),
    agora: () => new Date("2026-11-02T10:00:00-03:00"),
  });
  return { agente, cliente, avisos };
}

async function criarPastaTeste() {
  const pasta = await mkdtemp(path.join(process.cwd(), ".nexor-agent-test-"));
  pastasTeste.add(pasta);
  return pasta;
}

test("executa a ferramenta, devolve o resultado e responde com o texto final", async () => {
  const { agente, cliente, avisos } = await agenteDeTeste([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "registrar_lead", input: { nome: "Carlos", necessidade: "Loja no Mercado Livre" } }] },
    { stop_reason: "end_turn", content: [texto("Prontinho, Carlos! Quer agendar o diagnóstico?")] },
  ]);

  const r = await agente.responder({ idConversa: "wa:1", canal: "whatsapp", texto: "Sou o Carlos", telefone: "5534988887777" });

  assert.equal(r.resposta, "Prontinho, Carlos! Quer agendar o diagnóstico?");
  assert.equal(avisos[0].telefone, "5534988887777");
  const segunda = cliente.requisicoes[1];
  assert.equal(segunda.model, "claude-opus-5-5");
  assert.deepEqual(segunda.betas, ["server-side-fallback-2026-07-01"]);
  // O histórico só cresce: a segunda requisição começa exatamente com a primeira
  assert.deepEqual(segunda.messages.slice(0, 1), cliente.requisicoes[0].messages);
  const resultado = segunda.messages.at(-1).content[0];
  assert.equal(resultado.type, "tool_result");
  assert.equal(resultado.tool_use_id, "tu1");
});

test("a conversa continua com o histórico completo no turno seguinte", async () => {
  const { agente, cliente } = await agenteDeTeste([
    { stop_reason: "end_turn", content: [texto("Olá! Como posso ajudar?")] },
    { stop_reason: "end_turn", content: [texto("Claro!")] },
  ]);
  await agente.responder({ idConversa: "site:abcdefgh", canal: "site", texto: "oi" });
  await agente.responder({ idConversa: "site:abcdefgh", canal: "site", texto: "quero um site" });
  const msgs = cliente.requisicoes[1].messages;
  assert.equal(msgs.length, 3);
  assert.equal(msgs[1].role, "assistant");
  assert.equal(msgs[2].content.at(-1).text, "quero um site");
});

test("depois de transferir para humano, o agente fica em silêncio", async () => {
  const { agente, avisos } = await agenteDeTeste([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "h1", name: "transferir_para_humano", input: { motivo: "pediu atendente", resumo: "Cliente quer falar com alguém" } }] },
    { stop_reason: "end_turn", content: [texto("Vou chamar alguém da equipe.")] },
  ]);
  const r1 = await agente.responder({ idConversa: "wa:2", canal: "whatsapp", texto: "quero falar com uma pessoa", telefone: "5534" });
  assert.equal(r1.transferido, true);
  assert.equal(avisos[0].tipo, "transferencia");
  const r2 = await agente.responder({ idConversa: "wa:2", canal: "whatsapp", texto: "oi?", telefone: "5534" });
  assert.equal(r2.resposta, null);
});

test("erro da API vira mensagem amigável e a conversa recomeça", async () => {
  const { agente, cliente } = await agenteDeTeste([
    { stop_reason: "end_turn", content: [texto("Oi!")] },
  ]);
  const r1 = await agente.responder({ idConversa: "site:zzzzzzzz", canal: "site", texto: "oi" });
  assert.equal(r1.resposta, "Oi!");
  const r2 = await agente.responder({ idConversa: "site:zzzzzzzz", canal: "site", texto: "e aí" }); // sem resposta preparada → erro
  assert.match(r2.resposta, /99733-7499/);
  cliente.beta.messages.create = async (p) => ({ stop_reason: "end_turn", content: [texto(`msgs=${p.messages.length}`)] });
  const r3 = await agente.responder({ idConversa: "site:zzzzzzzz", canal: "site", texto: "voltei" });
  assert.equal(r3.resposta, "msgs=1");
});

test("lembrete WhatsApp só é registrado quando o cliente confirma na própria mensagem", async () => {
  async function agendar(textoCliente) {
    const pasta = await criarPastaTeste();
    const armazenamento = criarArmazenamento(pasta);
    const cliente = clienteFalso([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "book", name: "agendar_diagnostico", input: { horario: "2026-11-03T10:30", nome: "Ana", contato: "5534999990000", assunto: "Apresentação" } }] },
      { stop_reason: "end_turn", content: [texto("Agendado")] },
    ]);
    const agente = criarAgente({
      cliente,
      armazenamento,
      agora: () => new Date("2026-11-02T10:00:00-03:00"),
      calendario: { configurado: () => true, async ocupados() { return []; }, async criarReuniao() { return { id: "n123", link: "https://calendar.google.com/event", linkReuniao: "https://meet.google.com/abc-defg-hij" }; } },
    });
    await agente.responder({ idConversa: "wa:5534999990000", canal: "whatsapp", telefone: "5534999990000", texto: textoCliente });
    return JSON.parse(await readFile(path.join(pasta, "agendamentos.json"), "utf8"))[0];
  }
  const autorizado = await agendar("Sim, aceito receber os lembretes pelo WhatsApp.");
  const naoAutorizado = await agendar("Sim, pode mandar o link no WhatsApp.");
  assert.equal(autorizado.whatsapp_optin, true);
  assert.equal(autorizado.whatsapp_optin_em, "2026-11-02T13:00:00.000Z");
  assert.equal(naoAutorizado.whatsapp_optin, false);
});
