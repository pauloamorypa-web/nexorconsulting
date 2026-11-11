/* Conversão offline: teste ativado e contrato fechado vão para a Blue (fetch falso), uma vez por cliente e evento,
   com fila que tenta de novo quando a Blue está fora e só e-mail/telefone em hash. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { hashEmail, hashTelefone, valorReferencia } from "../src/conversao.js";
import { codigoTotp } from "../src/seguranca.js";
import { montarCentral } from "../src/servidor.js";

let relogio = Date.parse("2026-11-04T12:00:00-03:00");
const agora = () => relogio;
let s, url, pasta, cookie;
let blueFora = false;
const enviados = [];
const sha = (v) => createHash("sha256").update(v).digest("hex");

/* fetch falso: só a URL da Blue é atendida aqui; o resto (o próprio servidor de teste) usa o fetch real */
const fetchFalso = async (alvo, op) => {
  if (String(alvo) !== "https://blue.teste/api/conversao") throw new Error(`fetch inesperado: ${alvo}`);
  enviados.push({ auth: op.headers.Authorization, corpo: JSON.parse(op.body) });
  if (blueFora) throw new Error("ECONNREFUSED");
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const api = async (metodo, caminho, corpo) => {
  const r = await fetch(url + caminho, { method: metodo, headers: { "x-nexor": "1", cookie, ...(corpo ? { "content-type": "application/json" } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const c = r.headers.getSetCookie()[0];
  if (c && c.split(";")[0].split("=")[1]) cookie = c.split(";")[0];
  return { status: r.status, dados: await r.json() };
};
const doEvento = (evento) => enviados.filter((e) => e.corpo.evento === evento);

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "nexor-central-conv-"));
  const cfg = { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste", urlPublica: "https://central.teste", codigoInstalacao: "ABCD2345", asaas: { url: "https://asaas.teste", chave: "", webhookToken: "tok" }, conversao: { url: "https://blue.teste/api/conversao", token: "tok-blue" } };
  s = montarCentral({ cfg, caminhoBanco: ":memory:", agora, fetchFn: fetchFalso });
  await new Promise((r) => s.servidor.listen(0, r));
  url = `http://localhost:${s.servidor.address().port}`;
  await api("POST", "/api/cadastro", { nome: "Paulo", email: "paulo@nexor.com", senha: "senha-muito-forte", codigo_instalacao: "ABCD2345" });
  const { segredo } = (await api("GET", "/api/totp/novo")).dados;
  assert.equal((await api("POST", "/api/totp", { codigo: codigoTotp(segredo, agora()) })).status, 200);
});
after(() => {
  s.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

test("hash igual ao do Meta: e-mail minúsculo, telefone com DDI 55", () => {
  assert.equal(hashEmail("  Ana@Empresa.com.br "), sha("ana@empresa.com.br"));
  assert.equal(hashTelefone("(34) 99733-7499"), sha("5534997337499"));
  assert.equal(hashTelefone("5534997337499"), sha("5534997337499"));
  assert.equal(hashEmail("não é e-mail"), undefined);
  assert.equal(valorReferencia("barber"), 8900);
});

test("teste ativado: evento enviado uma vez só, mesmo com prorrogação e reprocessamento", async () => {
  const r = await api("POST", "/api/clientes", { razao_social: "Barbearia Navalha Ltda", nome_fantasia: "Navalha", cnpj: "11222333000181", email: "Dono@Navalha.com.br", telefone: "(34) 99733-7499", valor_centavos: 0, teste_produto: "barber" });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  await s.conversao.processar();
  assert.equal(doEvento("teste_ativado").length, 1);
  const { auth, corpo } = doEvento("teste_ativado")[0];
  assert.equal(auth, "Bearer tok-blue");
  assert.equal(corpo.em, sha("dono@navalha.com.br"));
  assert.equal(corpo.ph, sha("5534997337499"));
  assert.equal(corpo.produto, "barber");
  assert.equal(corpo.valor, 89);
  assert.equal(corpo.moeda, "BRL");
  // LGPD: nada de nome, CNPJ, e-mail ou telefone em texto, nem o id interno do cliente
  const texto = JSON.stringify(corpo);
  for (const proibido of ["Navalha", "11222333000181", "navalha.com.br", "99733", r.dados.id]) assert.ok(!texto.includes(proibido), proibido);

  // Prorrogação do teste e novas rodadas da fila não reenviam
  assert.equal((await api("POST", `/api/clientes/${r.dados.id}/teste`, { dias: 10 })).status, 200);
  await s.rotina();
  await s.conversao.processar();
  assert.equal(doEvento("teste_ativado").length, 1);
  assert.equal(s.repo.um("SELECT status FROM conversoes WHERE cliente_id = ? AND evento = 'teste_ativado'", r.dados.id).status, "enviada");
});

test("contrato: evento com mensalidade e implantação; o primeiro pagamento não duplica", async () => {
  const c = (await api("GET", "/api/clientes")).dados.find((x) => x.nome_fantasia === "Navalha");
  const r = await api("POST", `/api/clientes/${c.id}/contratar`, { plano_id: "barber-barbearia" });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  await s.conversao.processar();
  assert.equal(doEvento("contrato_fechado").length, 1);
  const corpo = doEvento("contrato_fechado")[0].corpo;
  assert.equal(corpo.mensalidade, 189);
  assert.equal(corpo.implantacao, 690);
  assert.equal(corpo.valor, 879);
  assert.equal(corpo.plano, "barber-barbearia");

  const fatura = s.repo.um("SELECT id FROM faturas WHERE cliente_id = ? AND tipo = 'implantacao'", c.id);
  assert.equal((await api("POST", `/api/faturas/${fatura.id}/pagar`, { forma: "pix" })).status, 200);
  await s.conversao.processar();
  assert.equal(doEvento("contrato_fechado").length, 1);
});

test("cliente já em contrato: o primeiro pagamento conta como contrato fechado", async () => {
  const r = await api("POST", "/api/clientes", { razao_social: "Ótica Visão Ltda", cnpj: "11444777000161", email: "financeiro@visao.com.br", valor_centavos: 49700, dia_vencimento: 10 });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const f = s.repo.um("SELECT id FROM faturas WHERE cliente_id = ? ORDER BY vencimento LIMIT 1", r.dados.id);
  assert.ok(f, "mensalidade gerada");
  const antes = doEvento("contrato_fechado").length;
  assert.equal((await api("POST", `/api/faturas/${f.id}/pagar`, { forma: "pix" })).status, 200);
  await s.conversao.processar();
  assert.equal(doEvento("contrato_fechado").length, antes + 1);
  assert.equal(doEvento("contrato_fechado").at(-1).corpo.mensalidade, 497);
  assert.equal(doEvento("contrato_fechado").at(-1).corpo.ph, undefined); // sem telefone: só o e-mail em hash
});

test("fila tenta de novo quando a Blue está fora, com espera crescente", async () => {
  blueFora = true;
  const r = await api("POST", "/api/clientes", { razao_social: "Contábil Lima Ltda", cnpj: "11222333000181", email: "lima@contabil.com.br", teste_produto: "contabil" });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  await s.conversao.processar();
  const ver = () => s.repo.um("SELECT status, tentativas, erro, proxima_em FROM conversoes WHERE cliente_id = ?", r.dados.id);
  assert.equal(ver().status, "pendente");
  assert.equal(ver().tentativas, 1);
  assert.match(ver().erro, /ECONNREFUSED/);

  // Antes do horário da nova tentativa, nada sai
  const n = enviados.length;
  await s.conversao.processar();
  assert.equal(enviados.length, n);

  // Blue de volta, passada a espera: enviado, e uma vez só
  blueFora = false;
  relogio += 2 * 60_000;
  await s.conversao.processar();
  assert.equal(ver().status, "enviada");
  assert.equal(ver().tentativas, 2);
  await s.conversao.processar();
  assert.equal(doEvento("teste_ativado").filter((e) => e.corpo.produto === "contabil").length, 2); // 1 falha + 1 sucesso, mesmo id
  const ids = new Set(doEvento("teste_ativado").filter((e) => e.corpo.produto === "contabil").map((e) => e.corpo.id));
  assert.equal(ids.size, 1, "a nova tentativa usa o mesmo id (a Blue deduplica)");
});

test("painel lista a fila de conversões", async () => {
  const r = await api("GET", "/api/conversoes");
  assert.equal(r.status, 200);
  assert.equal(r.dados.ativo, true);
  assert.ok(r.dados.eventos.length >= 4);
  assert.ok(r.dados.eventos.every((e) => !("dados" in e)));
});
