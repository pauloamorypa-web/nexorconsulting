import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { criarArmazenamento } from "../src/armazenamento.js";
import { calcularRetorno, criarExecutor, formatarHorario, horariosLivres } from "../src/ferramentas.js";

// Sexta-feira, 30/10/2026, 16:00 em Brasília
const AGORA = new Date("2026-10-30T16:00:00-03:00");

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

async function executorDeTeste() {
  const pasta = await mkdtemp(path.join(tmpdir(), "nexor-"));
  const avisos = [];
  const executar = criarExecutor({
    armazenamento: criarArmazenamento(pasta),
    notificar: async (texto, dados) => avisos.push(dados),
    agora: () => AGORA,
  });
  const ctx = { idConversa: "wa:5534999999999", canal: "whatsapp", telefone: "5534999999999", transferir() {} };
  return { pasta, avisos, executar, ctx };
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

test("agendar_diagnostico recusa horário fora da agenda", async () => {
  const { executar, ctx } = await executorDeTeste();
  const r = JSON.parse((await executar({ id: "a", name: "agendar_diagnostico", input: { horario: "2026-11-01T10:30", nome: "Ana", contato: "x", assunto: "y" } }, ctx)).content);
  assert.equal(r.ok, false); // domingo
});

test("entrada inválida vira erro para o modelo corrigir, sem executar", async () => {
  const { executar, ctx } = await executorDeTeste();
  const r = await executar({ id: "x", name: "estimar_retorno", input: { atendimentos_mes: -5 } }, ctx);
  assert.equal(r.is_error, true);
  assert.match(r.content, /Dados inválidos/);
});
