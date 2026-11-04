import assert from "node:assert/strict";
import { test } from "node:test";
import { HORARIO_PADRAO, REGRAS_PADRAO, cabe, horariosLivres, ocupacao } from "../src/regras/agenda.js";
import { cicloDe, cicloDeRetorno, cobertura, deSempre } from "../src/regras/clube.js";
import { diaSemana, horaBR, hojeBR, paraMs, somarMeses } from "../src/regras/datas.js";
import { normalizarFone, mesmoFone } from "../src/servicos/canais.js";
import { cpfValido } from "../src/http/validacao.js";

const barbearia = { config: { horario: HORARIO_PADRAO, regras: REGRAS_PADRAO } };
const barbeiro = { id: "b1", ativo: true, servicos: [] };
const corte = { id: "s1", ativo: true, duracao_min: 40 };
const agora = paraMs("2026-11-10", "08:00");

test("datas em Brasília", () => {
  assert.equal(diaSemana("2026-11-10"), 2); // terça
  assert.equal(hojeBR(paraMs("2026-11-10", "23:30")), "2026-11-10");
  assert.equal(horaBR(paraMs("2026-11-10", "09:15")), "09:15");
  assert.equal(somarMeses("2026-01-31", 1), "2026-02-28");
  assert.deepEqual(cicloDe("2026-11-10"), { ciclo_inicio: "2026-11-10", ciclo_fim: "2026-12-09" });
});

test("horários livres respeitam expediente, almoço, duração e ocupados", () => {
  const livres = horariosLivres({ barbearia, barbeiro, servico: corte, dia: "2026-11-10", ocupados: [], agora });
  assert.equal(livres[0], "09:00");
  assert.ok(!livres.includes("11:30"), "11:30 + 40 min invade o almoço");
  assert.ok(livres.includes("11:15"));
  assert.ok(livres.includes("13:00"));
  assert.equal(livres.at(-1), "18:15");
  const ocupado = [{ inicio: paraMs("2026-11-10", "10:00"), fim: paraMs("2026-11-10", "10:40") }];
  const com = horariosLivres({ barbearia, barbeiro, servico: corte, dia: "2026-11-10", ocupados: ocupado, agora });
  assert.ok(!com.includes("09:30") && !com.includes("10:00") && !com.includes("10:15"));
  assert.ok(com.includes("09:15") && com.includes("10:45"));
  assert.deepEqual(horariosLivres({ barbearia, barbeiro, servico: corte, dia: "2026-11-09", ocupados: [], agora }), [], "segunda fechado");
  assert.deepEqual(horariosLivres({ barbearia, barbeiro: { ...barbeiro, servicos: ["outro"] }, servico: corte, dia: "2026-11-10", ocupados: [], agora }), []);
});

test("antecedência mínima, janela e encaixe", () => {
  const as0915 = paraMs("2026-11-10", "09:10");
  const livres = horariosLivres({ barbearia, barbeiro, servico: corte, dia: "2026-11-10", ocupados: [], agora: as0915 });
  assert.equal(livres[0], "09:45");
  assert.deepEqual(horariosLivres({ barbearia, barbeiro, servico: corte, dia: "2027-01-20", ocupados: [], agora }), []);
  assert.equal(cabe({ barbearia, barbeiro, servico: corte, dia: "2026-11-10", hora: "21:00", ocupados: [], agora }).ok, false);
  assert.equal(cabe({ barbearia, barbeiro, servico: corte, dia: "2026-11-10", hora: "21:00", ocupados: [], agora, encaixe: true }).ok, true);
  const ocupado = [{ inicio: paraMs("2026-11-10", "21:00"), fim: paraMs("2026-11-10", "21:30") }];
  assert.equal(cabe({ barbearia, barbeiro, servico: corte, dia: "2026-11-10", hora: "21:10", ocupados: ocupado, agora, encaixe: true }).ok, false, "encaixe nunca por cima de outro cliente");
});

test("expediente próprio do barbeiro e exceções (feriado)", () => {
  const meio = { ...barbeiro, horario: { 2: [["14:00", "16:00"]] } };
  const l = horariosLivres({ barbearia, barbeiro: meio, servico: corte, dia: "2026-11-10", ocupados: [], agora });
  assert.equal(l[0], "14:00");
  assert.equal(l.at(-1), "15:15");
  const feriado = { config: { ...barbearia.config, excecoes: { "2026-11-20": [] } } };
  assert.deepEqual(horariosLivres({ barbearia: feriado, barbeiro, servico: corte, dia: "2026-11-20", ocupados: [], agora }), []);
  const ag = [{ status: "agendado", inicio: paraMs("2026-11-10", "09:00"), fim: paraMs("2026-11-10", "10:00") }];
  assert.ok(ocupacao(barbearia, [barbeiro], "2026-11-10", ag) > 0.09);
});

test("clube: cobertura por serviço, limite, dia da semana e atraso", () => {
  const plano = { itens: [{ servico_id: "s1", quantidade: 0 }, { servico_id: "s2", quantidade: 2 }], dias_semana: [2, 3, 4] };
  const a = { status: "ativa", ciclo_inicio: "2026-11-01", ciclo_fim: "2026-11-30" };
  assert.equal(cobertura(plano, a, "s1", "2026-11-10", 9).coberto, true, "ilimitado");
  assert.equal(cobertura(plano, a, "s2", "2026-11-10", 1).coberto, true);
  assert.equal(cobertura(plano, a, "s2", "2026-11-10", 2).coberto, false);
  assert.match(cobertura(plano, a, "s1", "2026-11-14", 0).motivo, /dia da semana/);
  assert.equal(cobertura(plano, a, "s3", "2026-11-10", 0).coberto, false);
  assert.match(cobertura(plano, { ...a, status: "atrasada" }, "s1", "2026-11-10", 0).motivo, /atraso/);
  assert.equal(cobertura(plano, a, "s1", "2026-12-01", 0).coberto, false, "fora do ciclo");
});

test("ciclo de retorno e o de sempre", () => {
  assert.equal(cicloDeRetorno(["2026-09-01"]), null);
  assert.equal(cicloDeRetorno(["2026-09-01", "2026-09-22", "2026-10-13"]), 21);
  assert.equal(cicloDeRetorno(["2026-10-01", "2026-10-03"]), 7, "mínimo de 7 dias");
  const hist = [
    { barbeiro_id: "b2", servico_id: "s9", inicio: paraMs("2026-10-28", "18:00") },
    { barbeiro_id: "b1", servico_id: "s1", inicio: paraMs("2026-10-07", "18:00") },
    { barbeiro_id: "b1", servico_id: "s1", inicio: paraMs("2026-09-16", "10:00") },
  ];
  assert.deepEqual(deSempre(hist), { barbeiro_id: "b2", servico_id: "s9", dia_semana: 3, hora: "18:00" });
  assert.equal(deSempre([]), null);
});

test("telefone e CPF", () => {
  assert.equal(normalizarFone("(34) 99999-0001"), "5534999990001");
  assert.equal(normalizarFone("+55 34 99999 0001"), "5534999990001");
  assert.equal(normalizarFone("123"), "");
  assert.ok(mesmoFone("5534999990001", "553499990001"));
  assert.ok(cpfValido("529.982.247-25"));
  assert.ok(!cpfValido("111.111.111-11"));
  assert.ok(!cpfValido("529.982.247-24"));
});
