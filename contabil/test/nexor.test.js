/* Nexor Contábil ligado à Nexor Central de verdade: vinculação pelo código, licença, bloqueio (painel e portal
   suspensos, IA e régua pausadas, WhatsApp guardado), Suporte Nexor e itens escondidos. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { lerConfig as configCentral } from "../../central/src/config.js";
import { novoCodigo } from "../../central/src/db.js";
import { montarCentral } from "../../central/src/servidor.js";
import { CNPJ_ESCRITORIO, CNPJ_PADARIA, PDF, leitura, msgWhats, subir } from "./ajuda.js";

let central, pasta, s, eq, cliCentral, cli, portal;
before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "central-contabil-"));
  central = montarCentral({ cfg: { ...configCentral({}), pastaDados: pasta, chaveMestra: "x" }, caminhoBanco: ":memory:" });
  await new Promise((r) => central.servidor.listen(0, r));
  cliCentral = central.repo.inserir("clientes", { razao_social: "Contábil Exemplo Ltda", cnpj: CNPJ_ESCRITORIO, regras: {}, codigo: novoCodigo() });
  s = await subir({ cfg: { nexor: { central: `http://localhost:${central.servidor.address().port}`, codigo: "" } } });
  eq = s.cliente();
  await eq.post("/api/cadastro", { aceite_termos: true, razao_social: "Contábil Exemplo Ltda", cnpj: CNPJ_ESCRITORIO, nome: "Marta", email: "marta@contabil.com", senha: "senha-forte-1" });
  await eq.put("/api/canais", { whatsapp: { token: "EAAx", id_numero: "1234567890", segredo_app: "segredo-meta" } });
  cli = (await eq.post("/api/clientes", { razao_social: "Padaria", cnpj: CNPJ_PADARIA, regime: "simples", whatsapp: "34999990001" })).dados;
  const conv = await eq.post(`/api/clientes/${cli.id}/portal`, { nome: "Rosa", email: "rosa@p.com" });
  portal = s.cliente();
  await portal.post(`/api/portal/convite/${conv.dados.link.split("/convite/")[1]}`, { senha: "senha-da-rosa" });
});
after(() => {
  s.fechar();
  central.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

test("vincula pelo código do cliente e aparece na Central com a saúde", async () => {
  const r = await eq.post("/api/nexor/vincular", { codigo: cliCentral.codigo });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const sis = central.repo.lista("sistemas", "WHERE cliente_id = ?", cliCentral.id)[0];
  assert.equal(sis.produto, "contabil");
  assert.equal(sis.saude.carteira, 1);
  assert.equal((await eq.get("/api/eu")).dados.licenca.vinculado, true);
});

test("bloqueado: painel e portal suspensos, IA pausada, WhatsApp guardado sem resposta", async () => {
  central.repo.atualizar("clientes", cliCentral.id, { bloqueio_manual: "teste" });
  await s.app.central.sincronizar();
  assert.equal((await eq.get("/api/clientes")).status, 423);
  const p = await portal.get("/api/portal/pendencias");
  assert.equal(p.status, 423);
  assert.match(p.dados.erro, /Fale com o seu escritório/, "o cliente do escritório não vê a cobrança da Nexor");
  assert.equal(p.dados.link, null);
  assert.equal((await portal.get("/api/portal/eu")).status, 200, "o portal ainda abre e mostra o aviso");
  const antes = s.rede.whatsapp.length;
  const leituras = s.ia.chamadas.length;
  s.ia.leituras.push(leitura({ tipo: "recibo", valor_total: 10, data_emissao: "2026-10-01" }));
  await s.webhook(msgWhats("5534999990001", { midia: "recibo.pdf" }));
  assert.equal(s.rede.whatsapp.length, antes, "sem resposta automática");
  assert.equal(s.ia.chamadas.length, leituras, "sem leitura com IA");
  const doc = s.app.repo.um("SELECT * FROM documentos WHERE nome = 'recibo.pdf'");
  assert.ok(doc, "o arquivo ficou guardado");
  assert.equal(doc.leitura_status, "pendente", "lê quando o contrato normalizar");
  assert.deepEqual(await s.app.nucleo.rotina({ forcar: true }), [], "régua pausada");

  central.repo.atualizar("clientes", cliCentral.id, { bloqueio_manual: null });
  await s.app.central.sincronizar();
  assert.equal((await eq.get("/api/clientes")).status, 200);
});

test("restrito: escritório só consulta, mas os clientes continuam enviando pelo portal", async () => {
  const venc = new Date(Date.now() - 12 * 86400_000).toISOString().slice(0, 10);
  central.repo.inserir("faturas", { cliente_id: cliCentral.id, descricao: "Mensalidade", valor_centavos: 99700, vencimento: venc });
  await s.app.central.sincronizar();
  assert.equal(s.app.central.estado().situacao, "restrito");
  assert.equal((await eq.get("/api/clientes")).status, 200);
  assert.equal((await eq.post("/api/clientes", { razao_social: "Nova", cnpj: "19131243000197", regime: "mei" })).status, 423);
  assert.equal((await portal.enviar("/api/portal/documentos", PDF, "application/pdf", "nota.pdf")).status, 200);
  for (const f of central.repo.lista("faturas", "WHERE status = 'aberta'")) central.repo.atualizar("faturas", f.id, { status: "paga", pago_em: venc });
  await s.app.central.sincronizar();
});

test("Suporte Nexor entra, esconde o módulo de cobrança e não aparece na equipe", async () => {
  const sis = central.repo.lista("sistemas", "WHERE cliente_id = ?", cliCentral.id)[0];
  const t = central.assinador.assinar({ v: 1, tipo: "acesso", inst: sis.id, nome: "Paulo", email: "p@nexor.com", exp: Date.now() + 120_000, nonce: "n1" });
  const r = await fetch(`${s.url}/api/nexor/entrar?t=${t}`, { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.equal((await fetch(`${s.url}/api/nexor/entrar?t=${t}`, { redirect: "manual" })).status, 403);
  const cookie = r.headers.getSetCookie()[0].split(";")[0];
  const sup = (m, c, b) => fetch(s.url + c, { method: m, headers: { cookie, "x-nexor": "1", "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  assert.equal((await sup("PUT", "/api/nexor/ajustes", { ocultos: ["modulo.cobranca", "config.canais"] })).status, 200);
  assert.equal((await eq.get("/api/pendencias")).status, 403);
  assert.equal((await eq.put("/api/canais", { email: { remetente: "x" } })).status, 403);
  assert.equal((await sup("GET", "/api/pendencias")).status, 200);
  assert.ok((await eq.get("/api/usuarios")).dados.every((u) => !u.nexor));
  assert.equal((await eq.get("/api/estado")).dados.primeiroAcesso, false);
});
