import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { criarArmazenamento } from "../src/armazenamento.js";
import { calcularRetorno, criarExecutor, formatarHorario, horariosLivres } from "../src/ferramentas.js";

// Sexta-feira, 30/10/2026, 16:00 em Brasília
const AGORA = new Date("2026-10-30T16:00:00-03:00");
const pastasTeste = new Set();

after(async () => Promise.all([...pastasTeste].map((p) => rm(p, { recursive: true, force: true }))));

test("horários livres pulam fim de semana, o passado próximo e os ocupados", () => {
  const agenda = { diasDaSemana: [1, 2, 3, 4, 5], horarios: ["09:00", "17:00"], diasAdiante: 4, antecedenciaMinimaHoras: 3 };
  const livres = horariosLivres(AGORA, new Set(["2026-11-02T09:00"]), agenda);
  // sexta 17:00 fica a menos de 3 h; sábado e domingo ficam de fora; segunda 09:00 está ocupado
  assert.deepEqual(livres, ["2026-11-02T17:00", "2026-11-03T09:00", "2026-11-03T17:00"]);
});

test("horário formatado em português", () => {
  assert.equal(formatarHorario("2026-11-04T10:30"), "quarta, 04/11 às 10:30");
});

test("cálculo de retorno bate com a calculadora do site", () => {
  const r = calcularRetorno({ atendimentos_mes: 5000, minutos_por_atendimento: 6, custo_hora: 35, percentual_ia: 60 });
  assert.equal(r.horas_liberadas_por_mes, 300);
  assert.equal(r.economia_por_ano_reais, 126000);
});

async function executorDeTeste({ calendario } = {}) {
  // Usa o diretório do pacote para que o sandbox Windows permita testar a troca atômica.
  const pasta = await mkdtemp(path.join(process.cwd(), ".nexor-test-"));
  pastasTeste.add(pasta);
  const avisos = [];
  const armazenamento = criarArmazenamento(pasta);
  const executar = criarExecutor({
    armazenamento,
    notificar: async (texto, dados) => avisos.push(dados),
    agora: () => AGORA,
    calendario,
  });
  const ctx = { idConversa: "wa:5534999999999", canal: "whatsapp", telefone: "5534999999999", transferir() {} };
  return { pasta, avisos, executar, ctx, armazenamento };
}

test("registrar_lead salva, usa o telefone do WhatsApp e avisa a equipe", async () => {
  const { pasta, avisos, executar, ctx } = await executorDeTeste();
  const r = await executar({ id: "t1", name: "registrar_lead", input: { nome: "Ana", necessidade: "Atender clientes à noite" } }, ctx);
  assert.equal(r.is_error, undefined);
  const salvo = JSON.parse((await readFile(path.join(pasta, "leads.jsonl"), "utf8")).trim());
  assert.equal(salvo.telefone, "5534999999999");
  assert.equal(avisos[0].tipo, "lead");
});

test("agendar_diagnostico não aceita o mesmo horário duas vezes", async () => {
  const { executar, ctx } = await executorDeTeste();
  const entrada = { horario: "2026-11-03T10:30", nome: "Ana", contato: "5534999999999", assunto: "IA no WhatsApp" };
  const primeiro = JSON.parse((await executar({ id: "a", name: "agendar_diagnostico", input: entrada }, ctx)).content);
  const segundo = JSON.parse((await executar({ id: "b", name: "agendar_diagnostico", input: entrada }, ctx)).content);
  assert.equal(primeiro.ok, true);
  assert.equal(segundo.ok, false);
});

test("100 reservas concorrentes para o mesmo horário concedem exatamente uma vaga", async () => {
  const { armazenamento } = await executorDeTeste();
  const resultado = await Promise.all(Array.from({ length: 100 }, (_, i) => armazenamento.reservar({ id: `conc-${i}`, horario: "2026-11-03T10:30", status: "agendado" })));
  assert.equal(resultado.filter(Boolean).length, 1);
  assert.equal((await armazenamento.listarAgendamentos()).length, 1);
});

test("agendar_diagnostico recusa horário fora da agenda", async () => {
  const { executar, ctx } = await executorDeTeste();
  const r = JSON.parse((await executar({ id: "a", name: "agendar_diagnostico", input: { horario: "2026-11-01T10:30", nome: "Ana", contato: "x", assunto: "y" } }, ctx)).content);
  assert.equal(r.ok, false); // domingo
});

test("agenda confirma disponibilidade Google antes de gravar e devolve o link Meet", async () => {
  let pedido;
  const calendario = {
    configurado: () => true,
    async ocupados() { return []; },
    async criarReuniao(d) { pedido = d; return { id: "n123", link: "https://calendar.google.com/event", linkReuniao: "https://meet.google.com/abc-defg-hij" }; },
  };
  const { pasta, executar, ctx } = await executorDeTeste({ calendario });
  const r = JSON.parse((await executar({ id: "g", name: "agendar_diagnostico", input: { horario: "2026-11-03T10:30", nome: "Ana", contato: "ana@example.com", assunto: "Apresentação" } }, ctx)).content);
  assert.equal(r.ok, true);
  assert.equal(r.link_reuniao, "https://meet.google.com/abc-defg-hij");
  assert.equal(pedido.inicio, "2026-11-03T10:30");
  assert.equal((await JSON.parse(await readFile(path.join(pasta, "agendamentos.json"), "utf8")))[0].calendar_event_id, "n123");
});

test("não agenda se Google Calendar reportar conflito ou cair", async () => {
  const conflito = { configurado: () => true, async ocupados() { return [{ inicio: new Date("2026-11-03T13:00:00Z"), fim: new Date("2026-11-03T14:00:00Z") }]; }, async criarReuniao() { throw new Error("não deveria criar"); } };
  const { executar, ctx, armazenamento } = await executorDeTeste({ calendario: conflito });
  const entrada = { horario: "2026-11-03T10:30", nome: "Ana", contato: "ana@example.com", assunto: "Apresentação" };
  const r = JSON.parse((await executar({ id: "g", name: "agendar_diagnostico", input: entrada }, ctx)).content);
  assert.equal(r.ok, false);
  assert.equal((await armazenamento.listarAgendamentos()).length, 0);
});

test("entrada inválida vira erro para o modelo corrigir, sem executar", async () => {
  const { executar, ctx } = await executorDeTeste();
  const r = await executar({ id: "x", name: "estimar_retorno", input: { atendimentos_mes: -5 } }, ctx);
  assert.equal(r.is_error, true);
  assert.match(r.content, /Dados inválidos/);
});
