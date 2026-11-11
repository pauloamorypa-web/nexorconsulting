/* Personas simuladas (test/personas/*.json): cada conversa passa pela Blue com o modelo SIMULADO
   e conferimos a campanha detectada, a nota, a classe, o descarte, os motivos e o aviso à equipe. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { CAMPANHAS } from "../src/campanhas.js";
import { carregarPersonas, matrizDeAcerto, rodarPersona } from "../simulacao/modelo-simulado.js";

const personas = await carregarPersonas();
const resultados = [];

test("banco de personas: cerca de 4 por campanha, com quentes, mornos, frios e curiosos", () => {
  for (const c of CAMPANHAS) {
    const delas = personas.filter((p) => p.esperado.campanha === c.id);
    assert.ok(delas.length >= 3 && delas.length <= 5, `${c.id}: ${delas.length} personas`);
    assert.ok(delas.some((p) => p.esperado.classe === "quente"), `${c.id} sem quente`);
    assert.ok(delas.some((p) => p.tipo === "curioso"), `${c.id} sem curioso`);
  }
  assert.equal(new Set(personas.map((p) => p.id)).size, personas.length);
});

for (const p of personas) {
  test(`persona ${p.id}`, async () => {
    const r = await rodarPersona(p);
    resultados.push(r);
    const e = p.esperado;
    assert.equal(r.campanha, e.campanha, "campanha");
    assert.equal(r.classe, e.classe, `classe (nota ${r.nota}: ${r.motivos.join("; ")})`);
    assert.ok(r.nota >= e.nota_min && r.nota <= e.nota_max, `nota ${r.nota} fora de ${e.nota_min}-${e.nota_max}`);
    if ("descarte" in e) assert.equal(r.descarte, e.descarte, "descarte");
    for (const m of e.motivos ?? []) assert.ok(r.motivos.some((x) => x.includes(m)), `motivo "${m}" ausente: ${r.motivos.join("; ")}`);
    if (e.produto_indicado) assert.equal(r.produto_indicado, e.produto_indicado);
    assert.ok(r.motivos.length > 0, "toda nota tem motivos");
    // Quente avisa a equipe na hora e vira LeadQualificado; os outros não
    const quente = r.avisos.filter((a) => a.dados.tipo === "lead_quente");
    assert.equal(quente.length, e.classe === "quente" ? 1 : 0, "aviso de lead quente");
    assert.equal(r.conversoes.some((c) => c.evento === "LeadQualificado"), e.classe === "quente");
    if (["concorrente", "estudante", "pessoa_fisica"].includes(r.descarte)) assert.equal(r.conversoes.length, 0, "descartado não vira conversão");
    // A Blue sempre responde com texto (nada de resposta vazia nem de nota para o cliente)
    assert.ok(r.respostas.every((t) => t && !/nota|quente|morno|frio/i.test(t)), r.respostas.join(" | "));
  });
}

test("matriz de acerto das personas: 100% com o modelo simulado", () => {
  const m = matrizDeAcerto(resultados);
  assert.equal(m.total, personas.length);
  assert.equal(m.classeOk, m.total, m.erros.map((x) => x.persona).join(", "));
  assert.equal(m.campanhaOk, m.total);
});
