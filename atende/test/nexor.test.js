/* Atende IA ligado à Nexor Central de verdade: régua de cobrança, IA pausada no bloqueio (mensagens guardadas),
   acesso do Suporte Nexor por link de uso único e módulos escondidos pelo Suporte. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { lerConfig as configCentral } from "../../central/src/config.js";
import { montarCentral } from "../../central/src/servidor.js";
import { contaPronta, mensagemRecebida } from "./ajuda.js";

const TOKEN = "nxs_" + "a".repeat(43);
let central, pasta, t, sistema, cliente;

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "central-atende-"));
  central = montarCentral({ cfg: { ...configCentral({}), pastaDados: pasta, chaveMestra: "x" }, caminhoBanco: ":memory:" });
  await new Promise((r) => central.servidor.listen(0, r));
  cliente = central.repo.inserir("clientes", { razao_social: "Loja Teste Ltda", cnpj: "11222333000181", valor_centavos: 39900, dia_vencimento: 10, regras: {} });
  sistema = central.repo.inserir("sistemas", { cliente_id: cliente.id, produto: "atende", url: "https://atende.teste", token_hash: createHash("sha256").update(TOKEN).digest("hex"), prefixo: TOKEN.slice(0, 10) });
  t = await contaPronta({ extraCfg: { nexor: { central: `http://localhost:${central.servidor.address().port}`, instancia: sistema.id, token: TOKEN, chavePublica: central.assinador.chavePublica, intervaloMin: 5 } } });
});
after(() => {
  t.fechar();
  central.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

const sincronizar = () => t.app.central.sincronizar();

test("em dia: a Central recebe a saúde e o painel funciona", async () => {
  assert.equal((await sincronizar()).situacao, "ativo");
  assert.equal((await t.chamar("GET", "/api/eu")).dados.licenca.situacao, "ativo");
  const s = central.repo.obter("sistemas", sistema.id);
  assert.equal(s.saude.usuarios, 1);
  assert.equal(typeof s.saude.conversas_hoje, "number");
});

test("bloqueado: painel suspenso e a IA para de responder, mas a mensagem fica guardada", async () => {
  central.repo.atualizar("clientes", cliente.id, { bloqueio_manual: "teste de bloqueio" });
  await sincronizar();
  const eu = (await t.chamar("GET", "/api/eu")).dados;
  assert.equal(eu.licenca.situacao, "bloqueado");
  assert.equal((await t.chamar("GET", "/api/conversas")).status, 423);
  const antes = t.claude.chamadas.length;
  const enviadosAntes = t.meta.enviados.length;
  assert.equal(await t.webhook(mensagemRecebida("Oi, vocês abrem sábado?")), 200);
  assert.equal(t.claude.chamadas.length, antes, "a IA não foi chamada");
  assert.equal(t.meta.enviados.length, enviadosAntes, "nada foi enviado ao cliente");
  const n = t.app.repo.db.prepare("SELECT COUNT(*) n FROM mensagens WHERE direcao = 'entrada'").get().n;
  assert.ok(n >= 1, "a mensagem foi guardada");

  // restrito: consulta ok, alteração recusada, IA volta a responder
  central.repo.atualizar("clientes", cliente.id, { bloqueio_manual: null });
  const venc = new Date(Date.now() - 12 * 86400_000).toISOString().slice(0, 10);
  central.repo.inserir("faturas", { cliente_id: cliente.id, descricao: "Mensalidade", valor_centavos: 39900, vencimento: venc });
  await sincronizar();
  assert.equal(t.app.central.estado().situacao, "restrito");
  assert.equal((await t.chamar("GET", "/api/conversas")).status, 200);
  assert.equal((await t.chamar("POST", "/api/respostas-rapidas", { atalho: "oi", texto: "Olá!" })).status, 423);
  await t.webhook(mensagemRecebida("Oi de novo", { de: "5534977776666" }));
  assert.ok(t.claude.chamadas.length > antes, "no somente leitura a IA continua atendendo");

  for (const f of central.repo.lista("faturas", "WHERE status = 'aberta'")) central.repo.atualizar("faturas", f.id, { status: "paga", pago_em: venc });
  await sincronizar();
  assert.equal(t.app.central.estado().situacao, "ativo");
});

test("Suporte Nexor entra pelo link, some da equipe, esconde módulos e não é barrado", async () => {
  const link = (extra = {}) => central.assinador.assinar({ v: 1, tipo: "acesso", inst: sistema.id, nome: "Paulo", email: "paulo@nexor.com", exp: Date.now() + 120_000, nonce: `n-${Math.random()}`, ...extra });
  const tk = link();
  const r = await fetch(`${t.base}/api/nexor/entrar?t=${tk}`, { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.equal((await fetch(`${t.base}/api/nexor/entrar?t=${tk}`, { redirect: "manual" })).status, 403, "uso único");
  assert.equal((await fetch(`${t.base}/api/nexor/entrar?t=${link({ inst: "outra" })}`, { redirect: "manual" })).status, 403);
  const cookie = r.headers.getSetCookie()[0].split(";")[0];
  const sup = (metodo, caminho, corpo) => fetch(t.base + caminho, { method: metodo, headers: { cookie, "x-nexor": "1", "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }).then(async (x) => ({ status: x.status, dados: await x.json() }));
  const eu = (await sup("GET", "/api/eu")).dados;
  assert.equal(eu.usuario.nexor, true);
  assert.match(eu.usuario.nome, /Suporte Nexor · Paulo/);
  assert.ok((await t.chamar("GET", "/api/usuarios")).dados.every((u) => !u.nexor), "a equipe do cliente não mostra o Suporte");
  assert.equal((await t.chamar("PUT", `/api/usuarios/${eu.usuario.id}`, { ativo: false })).status, 404);
  assert.equal((await t.chamar("GET", "/api/nexor/ajustes")).status, 403);
  assert.equal((await sup("PUT", "/api/nexor/ajustes", { ocultos: ["modulo.campanhas", "config.whatsapp"] })).status, 200);
  assert.deepEqual((await t.chamar("GET", "/api/eu")).dados.ocultos, ["modulo.campanhas", "config.whatsapp"]);
  assert.equal((await t.chamar("GET", "/api/campanhas")).status, 403);
  assert.equal((await t.chamar("POST", "/api/canais", { phone_number_id: "1", waba_id: "2", token: "EAAxxxxxxxxxxxxxxxxxx" })).status, 403);
  assert.equal((await sup("GET", "/api/campanhas")).status, 200);
  const aud = (await t.chamar("GET", "/api/auditoria")).dados;
  assert.ok(JSON.stringify(aud).includes("acesso_suporte_nexor"), "o acesso aparece no histórico do cliente");

  central.repo.atualizar("clientes", cliente.id, { bloqueio_manual: "x" });
  await sincronizar();
  assert.equal((await sup("GET", "/api/conversas")).status, 200, "o Suporte Nexor não é barrado");
  assert.equal((await t.chamar("GET", "/api/estado")).dados.primeiroAcesso, false);
});
