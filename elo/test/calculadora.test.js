/* Calculadora de precificação: preço que entrega a margem líquida pedida, com impostos do regime e taxas. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularPreco } from "../src/regras/calculadora.js";
import { cenario, subir } from "./ajuda.js";

const custos = { produtos_centavos: 100000, mao_obra_centavos: 50000, deslocamento_centavos: 5000 };

test("Calculadora: Simples Nacional entrega a margem pedida e fecha a conta", () => {
  const r = calcularPreco({ custos, margem_pct: 20, regime: { tipo: "simples", anexo: "III", aliquota_pct: 6 }, taxa_meio_pct: 1.99, taxa_plataforma_pct: 2.5 });
  assert.equal(r.preco_sugerido_centavos, Math.ceil(155000 / (1 - 0.06 - 0.0199 - 0.025 - 0.2)));
  assert.equal(r.impostos.total_centavos, Math.round(r.preco_sugerido_centavos * 0.06));
  assert.equal(r.taxa_plataforma_centavos, Math.round(r.preco_sugerido_centavos * 0.025));
  assert.equal(r.preco_sugerido_centavos - r.impostos.total_centavos - r.taxa_meio_centavos - r.taxa_plataforma_centavos - r.custos_centavos, r.lucro_liquido_centavos);
  assert.ok(Math.abs(r.margem_real_pct - 20) < 0.01, `margem real ${r.margem_real_pct}`);
  assert.ok(r.avisos.some((a) => /ISS incluído/.test(a)));
});

test("Calculadora: MEI sem imposto por venda; Presumido com ISS só na parte de serviço", () => {
  const mei = calcularPreco({ custos, margem_pct: 25, regime: { tipo: "mei" }, taxa_plataforma_pct: 2.5 });
  assert.equal(mei.impostos.total_centavos, 0);
  assert.equal(mei.preco_sugerido_centavos, Math.ceil(155000 / (1 - 0.25 - 0.025)));
  const pres = calcularPreco({ custos, margem_pct: 15, regime: { tipo: "presumido" }, iss_pct: 5, taxa_plataforma_pct: 2.5 });
  const s = 55000 / 155000;
  const aliquota = (0.65 + 3 + 4.8 * s + 1.2 * (1 - s) + 2.88 * s + 1.08 * (1 - s) + 5 * s) / 100;
  assert.ok(Math.abs(pres.impostos.aliquota_efetiva_pct - aliquota * 100) < 0.01, `${pres.impostos.aliquota_efetiva_pct} vs ${aliquota * 100}`);
  assert.ok(pres.impostos.detalhamento.some((d) => d.nome.startsWith("ISS")));
  assert.ok(Math.abs(pres.margem_real_pct - 15) < 0.01);
  // Só serviço: ISS integral
  const serv = calcularPreco({ custos: { mao_obra_centavos: 10000 }, margem_pct: 10, regime: { tipo: "presumido" }, iss_pct: 3, taxa_plataforma_pct: 0 });
  assert.equal(serv.impostos.detalhamento.find((d) => d.nome.startsWith("ISS")).aliquota_pct, 3);
});

test("Calculadora: simular um preço dado, prejuízo e margem impossível", () => {
  const r = calcularPreco({ custos, margem_pct: 0, regime: { tipo: "simples", anexo: "I", aliquota_pct: 4 }, taxa_plataforma_pct: 2.5, preco_centavos: 150000 });
  assert.equal(r.preco_sugerido_centavos, 150000);
  assert.ok(r.lucro_liquido_centavos < 0);
  assert.ok(r.avisos.some((a) => /prejuízo/.test(a)));
  assert.ok(calcularPreco({ custos, margem_pct: 90, regime: { tipo: "simples", anexo: "V", aliquota_pct: 15.5 }, taxa_plataforma_pct: 2.5 }).erro);
});

test("Calculadora: rota do instalador valida o regime e usa a taxa da plataforma configurada", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const r = await c.inst.ok.post("/api/instalador/calculadora", { custos, margem_pct: 20, regime: { tipo: "simples", anexo: "III", aliquota_pct: 6 }, taxa_meio_pct: 1.99 });
    assert.equal(r.taxa_plataforma_pct, 2.5);
    assert.ok(Math.abs(r.margem_real_pct - 20) < 0.01);
    const e = await c.inst.post("/api/instalador/calculadora", { custos, margem_pct: 20, regime: { tipo: "simples" } });
    assert.equal(e.status, 400);
    assert.match(e.dados.erro, /Anexo/);
    assert.equal((await c.inst.post("/api/instalador/calculadora", { custos, margem_pct: 89, regime: { tipo: "simples", anexo: "V", aliquota_pct: 15 } })).status, 400);
  } finally {
    s.fechar();
  }
});
