/* Teste grátis no Nexor RH: até 10 colaboradores ativos, eSocial e recrutamento travados. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { recusaPorTeste } from "../src/nexor/central.js";
import { CATALOGO, LIMITES_TESTE } from "../src/nexor/politica.js";

const lic = { situacao: "aviso", plano: "teste", limites: { colaboradores: 10 }, travados: ["modulo.esocial", "modulo.recrutamento"] };
const op = (n) => ({ catalogo: CATALOGO, rotas: LIMITES_TESTE, contar: () => ({ colaboradores: n }) });

test("cadastra até 10 colaboradores no teste", () => {
  assert.equal(recusaPorTeste(lic, "POST", "/api/colaboradores", op(9)), null);
  assert.match(recusaPorTeste(lic, "POST", "/api/colaboradores", op(10)), /limite é de 10 colaboradores ativos/);
  assert.equal(recusaPorTeste(lic, "PUT", "/api/colaboradores", op(10)), null, "editar continua liberado");
});

test("eSocial e recrutamento travados; ponto e folha liberados", () => {
  assert.match(recusaPorTeste(lic, "GET", "/api/esocial/eventos", op(1)), /eSocial não faz parte do teste grátis/);
  assert.match(recusaPorTeste(lic, "GET", "/api/vagas", op(1)), /Recrutamento/);
  assert.equal(recusaPorTeste(lic, "GET", "/api/folhas", op(1)), null);
  assert.equal(recusaPorTeste({ ...lic, plano: "contratado" }, "GET", "/api/esocial", op(1)), null);
});
