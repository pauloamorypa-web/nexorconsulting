/* Cobrança automática pelo Asaas (API simulada): cliente e cobrança criados uma vez, link guardado na fatura,
   erro registrado para nova tentativa. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { lerConfig } from "../src/config.js";
import { montarCentral } from "../src/servidor.js";

test("cria o cliente e a cobrança no Asaas e guarda o link de pagamento", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-asaas-"));
  const chamadas = [];
  let falhar = true;
  const fetchFn = async (url, op) => {
    const corpo = op.body ? JSON.parse(op.body) : null;
    chamadas.push({ url, metodo: op.method, corpo, chave: op.headers.access_token });
    if (url.endsWith("/customers")) return new Response(JSON.stringify({ id: "cus_1" }), { status: 200 });
    if (url.endsWith("/payments")) {
      if (falhar) {
        falhar = false;
        return new Response(JSON.stringify({ errors: [{ description: "CPF/CNPJ inválido" }] }), { status: 400 });
      }
      return new Response(JSON.stringify({ id: "pay_9", invoiceUrl: "https://www.asaas.com/i/pay_9" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const agora = () => Date.parse("2026-11-04T12:00:00-03:00");
  const cfg = { ...lerConfig({}), pastaDados: pasta, chaveMestra: "x", asaas: { url: "https://asaas.teste/v3", chave: "aact_teste", webhookToken: "w" } };
  const s = montarCentral({ cfg, caminhoBanco: ":memory:", agora, fetchFn });
  try {
    const c = s.repo.inserir("clientes", { razao_social: "Padaria Ltda", cnpj: "11222333000181", valor_centavos: 49900, dia_vencimento: 10, inicio_cobranca: "2026-11-01", regras: {} });
    await s.rotina();
    let f = s.repo.lista("faturas", "WHERE cliente_id = ?", c.id)[0];
    assert.match(f.erro_cobranca, /CPF\/CNPJ inválido/, "o erro fica na fatura");
    assert.equal(f.externo_id, null);
    assert.equal(s.repo.obter("clientes", c.id).asaas_cliente_id, null);
    await s.rotina(); // nova tentativa
    f = s.repo.obter("faturas", f.id);
    assert.equal(f.externo_id, "pay_9");
    assert.equal(f.link, "https://www.asaas.com/i/pay_9");
    assert.equal(f.erro_cobranca, null);
    assert.equal(s.repo.obter("clientes", c.id).asaas_cliente_id, "cus_1");
    const pag = chamadas.filter((x) => x.url.endsWith("/payments")).at(-1);
    assert.equal(pag.corpo.billingType, "UNDEFINED", "o cliente escolhe Pix, boleto ou cartão");
    assert.equal(pag.corpo.value, 499);
    assert.equal(pag.corpo.dueDate, "2026-11-10");
    assert.equal(pag.corpo.externalReference, f.id);
    assert.equal(pag.chave, "aact_teste");
    const antes = chamadas.length;
    await s.rotina();
    assert.equal(chamadas.length, antes, "não cobra duas vezes");
  } finally {
    s.fechar();
    rmSync(pasta, { recursive: true, force: true });
  }
});
