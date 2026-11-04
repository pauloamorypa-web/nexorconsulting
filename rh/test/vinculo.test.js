/* Vinculação imediata pelo código do cliente (NX-XXXX-XXXX): o sistema se cadastra sozinho na Nexor Central. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { lerConfig as configCentral } from "../../central/src/config.js";
import { montarCentral } from "../../central/src/servidor.js";
import { novoCodigo } from "../../central/src/db.js";
import { subir } from "./ajuda.js";

let central, pasta, urlCentral, cliente;
before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "nexor-vinculo-"));
  central = montarCentral({ cfg: { ...configCentral({}), pastaDados: pasta, chaveMestra: "x" }, caminhoBanco: ":memory:" });
  await new Promise((r) => central.servidor.listen(0, r));
  urlCentral = `http://localhost:${central.servidor.address().port}`;
  cliente = central.repo.inserir("clientes", { razao_social: "Escritório Contábil Exemplo Ltda", cnpj: "11222333000181", regras: {}, codigo: novoCodigo() });
});
after(() => {
  central.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

test("código digitado no painel vincula na hora, sem copiar token", async () => {
  const rh = await subir({ cfg: { urlPublica: "https://rh.exemplo.com.br", nexor: { central: urlCentral, codigo: "" } } });
  try {
    const adm = rh.cliente();
    await adm.post("/api/cadastro", { razao_social: "Exemplo Ltda", cnpj: "11.222.333/0001-81", nome: "Ana", email: "ana@ex.com", senha: "senha-forte-1" });
    assert.equal((await adm.get("/api/eu")).dados.licenca.vinculado, false);
    assert.equal((await adm.post("/api/nexor/vincular", { codigo: "NX-ERRA-DO00" })).status, 400);
    // a pessoa digita em minúsculas e sem hífen: funciona
    const r = await adm.post("/api/nexor/vincular", { codigo: cliente.codigo.toLowerCase().replace(/-/g, " ") });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.cliente, "Escritório Contábil Exemplo Ltda");
    assert.equal(r.dados.situacao, "ativo");
    assert.equal((await adm.get("/api/eu")).dados.licenca.vinculado, true);
    const sis = central.repo.lista("sistemas", "WHERE cliente_id = ?", cliente.id);
    assert.equal(sis.length, 1);
    assert.equal(sis[0].produto, "rh");
    assert.equal(sis[0].url, "https://rh.exemplo.com.br");
    assert.ok(sis[0].ultimo_contato, "já sincronizou");
    assert.equal((await adm.post("/api/nexor/vincular", { codigo: cliente.codigo })).status, 409, "não vincula duas vezes");
    assert.ok(central.repo.lista("auditoria", "WHERE acao = 'sistema_vinculado'").length >= 1);
  } finally {
    rh.fechar();
  }
});

test("NEXOR_CODIGO no .env vincula sozinho ao iniciar; reinstalação reaproveita o mesmo sistema", async () => {
  const subirComCodigo = async () => {
    const rh = await subir({ cfg: { urlPublica: "https://rh2.exemplo.com.br", nexor: { central: urlCentral, codigo: cliente.codigo } } });
    // o que o iniciar() faz: sem vínculo e com código → vincula
    const r = await rh.app.central.vincular(cliente.codigo);
    return { rh, r };
  };
  const a = await subirComCodigo();
  assert.equal(a.r.ok, true);
  const inst = a.rh.app.central.info().instancia;
  a.rh.fechar();
  const b = await subirComCodigo(); // pasta de dados nova = reinstalação
  assert.equal(b.r.ok, true);
  assert.equal(b.rh.app.central.info().instancia, inst, "mesmo produto no mesmo endereço: mesma instância");
  b.rh.fechar();
});

test("cliente com contrato encerrado não vincula", async () => {
  const c = central.repo.inserir("clientes", { razao_social: "Encerrado Ltda", cnpj: "45723174000110", regras: {}, codigo: novoCodigo(), status: "cancelado" });
  const r = await fetch(`${urlCentral}/api/v1/vincular`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo: c.codigo, produto: "rh" }) });
  assert.equal(r.status, 409);
});
