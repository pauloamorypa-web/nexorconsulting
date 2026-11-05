/* Teste grátis no Atende IA: a IA pausa acima das conversas do dia e as campanhas ficam travadas. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { recusaPorTeste } from "../src/nexor/central.js";
import { CATALOGO, LIMITES_TESTE, iaLiberada } from "../src/nexor/politica.js";

const lic = { situacao: "aviso", plano: "teste", limites: { conversas_hoje: 30 }, travados: ["modulo.campanhas"] };

test("IA responde até o limite de conversas do dia no teste e pausa acima dele", () => {
  assert.equal(iaLiberada(lic, () => ({ conversas_hoje: 30 })), true);
  assert.equal(iaLiberada(lic, () => ({ conversas_hoje: 31 })), false);
  assert.equal(iaLiberada({ ...lic, plano: "contratado" }, () => ({ conversas_hoje: 999 })), true, "contratado não tem limite");
  assert.equal(iaLiberada({ situacao: "bloqueado" }), false);
});

test("campanhas travadas no teste; o resto passa", () => {
  const op = { catalogo: CATALOGO, rotas: LIMITES_TESTE };
  assert.match(recusaPorTeste(lic, "GET", "/api/campanhas", op), /Campanhas não faz parte do teste grátis/);
  assert.equal(recusaPorTeste(lic, "GET", "/api/contatos", op), null);
  assert.equal(recusaPorTeste({ ...lic, plano: "contratado" }, "GET", "/api/campanhas", op), null);
});
