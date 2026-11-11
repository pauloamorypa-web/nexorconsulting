/* Isolamento na Nexor Central, rota por rota (ver test/isolamento-ajuda.js).
   A Central é de uso interno da Nexor: não há "empresas" com painel próprio. As fronteiras que importam são:
   - Sem sessão (ou com a sessão parada no meio do 2FA), toda rota fora de PUBLICAS responde 401.
   - Portal do parceiro: o parceiro B, com o próprio token, não vê clientes, comissões nem indicações do
     parceiro A, e não aceita IDs do A na URL.
   - Perfil "suporte" não mexe em dinheiro nem na equipe (403 nas rotas financeiras e de equipe).
   Falhas reais conhecidas ficam em PENDENTES (todo) e estão em docs/seguranca/revisao-completa.md. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { codigoTotp } from "../src/seguranca.js";
import { montarCentral } from "../src/servidor.js";
import { chave, cliente, preencher, rotasDosFontes, vazou } from "./isolamento-ajuda.js";

const MARCA = "MARCA-PARCEIRO-A-7f3c";

/* Rotas sem a sessão do painel, de propósito, e a proteção de cada uma */
const PUBLICAS = {
  "GET /api/estado": "só diz se há usuário e em que fase do login está",
  "POST /api/cadastro": "só o primeiro usuário, com código de instalação",
  "POST /api/entrar": "login (senha), com limite de tentativas; a sessão só vale depois do 2FA",
  "GET /api/totp/novo": "exige a sessão da fase senha",
  "POST /api/totp": "exige a sessão da fase senha, com limite de tentativas",
  "POST /api/sair": "encerra a própria sessão",
  "POST /api/v1/vincular": "código do cliente NX-XXXX-XXXX, com limite por IP",
  "POST /api/v1/sincronizar": "token nxs_ do sistema (Bearer)",
  "POST /api/webhooks/asaas": "token do webhook no cabeçalho asaas-access-token",
  "GET /api/portal-parceiro": "token nxp_ do parceiro",
  "POST /api/portal-parceiro/indicacoes": "token nxp_ do parceiro",
};
const COM_CREDENCIAL = ["GET /api/totp/novo", "POST /api/totp", "POST /api/v1/sincronizar", "POST /api/webhooks/asaas", "GET /api/portal-parceiro", "POST /api/portal-parceiro/indicacoes"];

/* O perfil suporte não pode chamar estas (dinheiro e equipe) */
const SO_FINANCEIRO_OU_DONO = { test: (k) => /^(POST|PUT) \/api\/(faturas|parceiros|comissoes|indicacoes)\b/.test(k) || /^(POST|PUT) \/api\/clientes(\/:id(\/(bloquear|desbloquear|cancelar|contratar|teste))?)?$/.test(k) || /^(GET|POST|PUT) \/api\/usuarios\b/.test(k) };

const PENDENTES = {};

const rotas = rotasDosFontes(new URL("../src", import.meta.url).pathname);
let s, url, pasta, dono, suporte, tokenA, tokenB, ids;
const agora = () => Date.parse("2026-11-04T12:00:00-03:00");

async function entrar(email, senha, segredo) {
  const c = cliente(url);
  const r = await c.post("/api/entrar", { email, senha });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  if (!segredo) segredo = (await c.get("/api/totp/novo")).dados.segredo;
  assert.equal((await c.post("/api/totp", { codigo: codigoTotp(segredo, agora()) })).status, 200);
  return { c, segredo };
}
const ok = async (p, msg) => {
  const r = await p;
  assert.ok(r.status < 300, `${msg}: ${r.status} ${JSON.stringify(r.dados)}`);
  return r.dados;
};

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "central-iso-"));
  const cfg = { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste", urlPublica: "https://central.teste", codigoInstalacao: "ABCD2345", asaas: { url: "https://asaas.teste", chave: "", webhookToken: "tok-webhook-asaas" } };
  s = montarCentral({ cfg, caminhoBanco: ":memory:", agora });
  await new Promise((r) => s.servidor.listen(0, r));
  url = `http://localhost:${s.servidor.address().port}`;
  const c0 = cliente(url);
  await ok(c0.post("/api/cadastro", { nome: "Paulo", email: "paulo@nexor.com", senha: "senha-muito-forte", codigo_instalacao: "ABCD2345" }), "cadastro");
  const seg = (await c0.get("/api/totp/novo")).dados.segredo;
  assert.equal((await c0.post("/api/totp", { codigo: codigoTotp(seg, agora()) })).status, 200);
  dono = c0;
  await ok(dono.post("/api/usuarios", { nome: "Sara Suporte", email: "sara@nexor.com", papel: "suporte", senha: "senha-do-suporte" }), "usuário suporte");
  suporte = (await entrar("sara@nexor.com", "senha-do-suporte")).c;

  const pA = await ok(dono.post("/api/parceiros", { nome: `Parceiro ${MARCA}`, tipo: "revenda", empresa: `Revenda ${MARCA}` }), "parceiro A");
  const pB = await ok(dono.post("/api/parceiros", { nome: "Parceiro B", tipo: "revenda", empresa: "Revenda B" }), "parceiro B");
  const cliA = await ok(dono.post("/api/clientes", { razao_social: `Cliente ${MARCA}`, cnpj: "11222333000181", valor_centavos: 10000, dia_vencimento: 10, parceiro_id: pA.id }), "cliente do parceiro A");
  tokenA = (await ok(dono.post(`/api/parceiros/${pA.id}/portal`), "portal A")).link.split("#t=")[1];
  tokenB = (await ok(dono.post(`/api/parceiros/${pB.id}/portal`), "portal B")).link.split("#t=")[1];
  const ind = await fetch(`${url}/api/portal-parceiro/indicacoes`, { method: "POST", headers: { authorization: `Parceiro ${tokenA}`, "content-type": "application/json" }, body: JSON.stringify({ empresa: `Indicação ${MARCA}`, contato: "Rosa" }) });
  assert.equal(ind.status, 200);
  ids = { cliente: cliA.id, parceiro: pA.id };
});
after(() => {
  s?.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

test("a lista de rotas foi lida dos fontes", () => {
  assert.ok(rotas.length > 40, `só ${rotas.length} rotas encontradas`);
  for (const k of Object.keys(PUBLICAS)) assert.ok(rotas.some((r) => chave(r) === k), `rota pública listada que não existe mais: ${k}`);
});

describe("sem sessão: 401 (exceto as públicas)", () => {
  for (const r of rotas) {
    const k = chave(r);
    const publica = k in PUBLICAS && !COM_CREDENCIAL.includes(k);
    test(k, { todo: PENDENTES[`anonimo ${k}`] }, async () => {
      const resp = await cliente(url).chamar(r.metodo, preencher(r.caminho, () => "id-qualquer-123"), r.metodo === "GET" ? undefined : {});
      assert.ok(resp.status !== 405 && !(resp.status === 404 && /"não encontrado"/.test(resp.bruto)), `${k} não está registrada no servidor (${resp.status})`);
      if (!publica) assert.equal(resp.status, 401, `${k} sem sessão respondeu ${resp.status}: ${resp.bruto.slice(0, 200)}`);
    });
  }
});

test("sessão parada na fase da senha (sem 2FA) não abre o painel", async () => {
  const meio = cliente(url);
  await ok(meio.post("/api/entrar", { email: "sara@nexor.com", senha: "senha-do-suporte" }), "senha");
  for (const r of rotas.filter((x) => !(chave(x) in PUBLICAS))) {
    const resp = await meio.chamar(r.metodo, preencher(r.caminho, () => "id-qualquer-123"), r.metodo === "GET" ? undefined : {});
    assert.equal(resp.status, 401, `${chave(r)} com sessão sem 2FA respondeu ${resp.status}`);
  }
});

test("portal do parceiro B não vê nada do parceiro A", async () => {
  const r = await fetch(`${url}/api/portal-parceiro`, { headers: { authorization: `Parceiro ${tokenB}` } });
  const bruto = await r.text();
  assert.equal(r.status, 200);
  assert.deepEqual(vazou(bruto, [MARCA, "11222333000181", ids.cliente]), []);
  const a = await (await fetch(`${url}/api/portal-parceiro`, { headers: { authorization: `Parceiro ${tokenA}` } })).text();
  assert.ok(a.includes(MARCA), "controle: o parceiro A vê os próprios dados");
  // O token do portal não abre o painel
  for (const r2 of rotas.filter((x) => !(chave(x) in PUBLICAS))) {
    const resp = await cliente(url, { authorization: `Parceiro ${tokenA}` }).chamar(r2.metodo, preencher(r2.caminho, (n) => ids[n] ?? ids.cliente), r2.metodo === "GET" ? undefined : {});
    assert.equal(resp.status, 401, `${chave(r2)} com token de parceiro respondeu ${resp.status}`);
  }
});

describe("perfil suporte: 403 em dinheiro e equipe", () => {
  for (const r of rotas.filter((x) => SO_FINANCEIRO_OU_DONO.test(chave(x)) && !(chave(x) in PUBLICAS))) {
    const k = chave(r);
    test(k, { todo: PENDENTES[`suporte ${k}`] }, async () => {
      const resp = await suporte.chamar(r.metodo, preencher(r.caminho, (n) => ids[n] ?? ids.cliente), r.metodo === "GET" ? undefined : { cliente_id: ids.cliente });
      assert.equal(resp.status, 403, `${k} como suporte respondeu ${resp.status}: ${resp.bruto.slice(0, 200)}`);
    });
  }
});
