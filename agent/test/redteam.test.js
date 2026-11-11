import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { qualificarLead } from "../src/vendas/qualificacao.js";

const valido = {
  nome: "João",
  empresa: "Empresa Exemplo",
  necessidade: "Queremos reduzir o tempo de resposta da equipe no WhatsApp.",
  canal_origem: "site",
  contato: { whatsapp: "+55 34 99999-0000" },
};

test("10 mil qualificações determinísticas ficam abaixo de 2 s e não acionam rede", () => {
  const inicio = performance.now();
  for (let i = 0; i < 10_000; i++) {
    const r = qualificarLead(valido);
    assert.equal(r.envio_automatico_habilitado, false);
  }
  assert.ok(performance.now() - inicio < 2000, "regressão de latência no núcleo determinístico");
});

test("fuzz de entradas hostis sempre falha fechado ou retorna objetos limitados", () => {
  let seed = 0x12345678;
  const aleatorio = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  const chars = ["a", "\n", "\u0000", "<", ">", "{", "}", "🧨", "\u202e", " "];
  for (let i = 0; i < 1000; i++) {
    const tamanho = aleatorio() % 2300;
    const sujeira = Array.from({ length: tamanho }, () => chars[aleatorio() % chars.length]).join("");
    try {
      const r = qualificarLead({ ...valido, necessidade: sujeira });
      assert.equal(r.envio_automatico_habilitado, false);
      assert.ok(r.score >= 0 && r.score <= 100);
      assert.ok(r.lead.necessidade.length <= 1000);
    } catch (err) {
      assert.equal(err.name, "ZodError", "entradas recusadas devem falhar por validação conhecida");
      assert.ok(err.issues.every((issue) => issue.path[0] === "necessidade"));
    }
  }
});

test("evidência não permite protocolos de navegação nem URL maior que o limite", () => {
  for (const protocolo of ["javascript:", "data:", "file:", "ftp:"]) {
    assert.throws(() => qualificarLead({ ...valido, fonte_url: `${protocolo}alert(1)` }));
  }
  assert.throws(() => qualificarLead({ ...valido, fonte_url: `https://example.com/${"x".repeat(3000)}` }));
});
