/* Nexor Service Desk no catálogo: franquia de 5 técnicos, técnico extra e programa de fundadores */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNDADORES, PROJETOS, TESTE, comDesconto, mensalidadeDe, planoPorId, plural } from "../src/planos.js";
import { PRODUTOS } from "../src/servidor.js";

test("Service Desk: R$ 299 até 5 técnicos e R$ 49 por técnico extra", () => {
  const p = planoPorId("servicedesk-equipe");
  assert.equal(p.produto, "servicedesk");
  assert.equal(p.unidade, "técnico");
  assert.equal(mensalidadeDe(p, 1), 29900);
  assert.equal(mensalidadeDe(p, 5), 29900);
  assert.equal(mensalidadeDe(p, 6), 34800);
  assert.equal(mensalidadeDe(p, 10), 54400);
  assert.equal(p.implantacao, 99000);
});

test("Service Desk entra no programa de fundadores, no teste grátis e sai dos projetos", () => {
  assert.ok(FUNDADORES.produtos.includes("servicedesk"));
  assert.equal(comDesconto(mensalidadeDe(planoPorId("servicedesk-equipe"), 5), FUNDADORES.desconto_mensal), 17940, "R$ 299 com 40%");
  assert.equal(comDesconto(99000, FUNDADORES.desconto_implantacao), 49500, "R$ 990 com 50%");
  assert.ok(TESTE.produtos.servicedesk);
  assert.equal(PRODUTOS.servicedesk, "Nexor Service Desk");
  assert.ok(!PROJETOS.some((x) => /Service Desk/.test(x.nome)));
});

test("plural da unidade", () => {
  assert.equal(plural("colaborador"), "colaboradores");
  assert.equal(plural("técnico"), "técnicos");
});
