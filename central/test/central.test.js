/* Nexor Central: login com 2FA, clientes, faturas, régua de cobrança (aviso → somente leitura → bloqueio),
   licença assinada, webhook do Asaas, acesso de suporte e permissões. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { codigoTotp, conferirAssinado } from "../src/seguranca.js";
import { mensalidadesDevidas, situacaoCliente, vencimentoDe } from "../src/regras.js";
import { montarCentral } from "../src/servidor.js";

const DIA = 86400_000;
let relogio = Date.parse("2026-11-04T12:00:00-03:00");
const agora = () => relogio;
let s, url, pasta, dono, segredoDono;

function cliente() {
  const cookies = new Map();
  const chamar = async (metodo, caminho, corpo, extra = {}) => {
    const r = await fetch(url + caminho, { method: metodo, headers: { "x-nexor": "1", cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...extra }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    for (const c of r.headers.getSetCookie()) {
      const [k, v] = c.split(";")[0].split("=");
      if (v) cookies.set(k, v);
      else cookies.delete(k);
    }
    return { status: r.status, dados: (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : await r.text() };
  };
  return { get: (c, e) => chamar("GET", c, undefined, e), post: (c, b = {}, e) => chamar("POST", c, b, e), put: (c, b = {}) => chamar("PUT", c, b) };
}

/** Avança o relógio e entra de novo (a sessão do painel dura 12 horas) */
async function avancar(dias) {
  relogio += dias * DIA;
  dono = cliente();
  await dono.post("/api/entrar", { email: "paulo@nexor.com", senha: "senha-muito-forte" });
  assert.equal((await dono.post("/api/totp", { codigo: codigoTotp(segredoDono, agora()) })).status, 200);
}

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "nexor-central-"));
  const cfg = { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste", urlPublica: "https://central.teste", codigoInstalacao: "ABCD2345", asaas: { url: "https://asaas.teste", chave: "", webhookToken: "tok-webhook-asaas" } };
  s = montarCentral({ cfg, caminhoBanco: ":memory:", agora });
  await new Promise((r) => s.servidor.listen(0, r));
  url = `http://localhost:${s.servidor.address().port}`;
  dono = cliente();
});
after(() => {
  s.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

test("primeiro usuário exige o código de instalação e configura o 2FA", async () => {
  assert.equal((await dono.post("/api/cadastro", { nome: "Paulo", email: "paulo@nexor.com", senha: "senha-muito-forte" })).status, 403);
  const r = await dono.post("/api/cadastro", { nome: "Paulo", email: "paulo@nexor.com", senha: "senha-muito-forte", codigo_instalacao: "ABCD2345" });
  assert.equal(r.status, 200);
  assert.equal(r.dados.proximo, "configurar");
  assert.equal((await dono.get("/api/painel")).status, 401, "sem o 2FA a sessão não vale");
  const novo = await dono.get("/api/totp/novo");
  assert.match(novo.dados.qr, /^data:image\/png;base64,/);
  segredoDono = novo.dados.segredo;
  assert.equal((await dono.post("/api/totp", { codigo: "000000" })).status, 401);
  assert.equal((await dono.post("/api/totp", { codigo: codigoTotp(segredoDono, agora()) })).status, 200);
  assert.equal((await dono.get("/api/painel")).status, 200);
  assert.equal((await cliente().post("/api/cadastro", { nome: "X", email: "x@x.com", senha: "senha-muito-forte", codigo_instalacao: "ABCD2345" })).status, 403, "só o primeiro");
});

test("login seguinte pede o código do autenticador", async () => {
  const c = cliente();
  assert.equal((await c.post("/api/entrar", { email: "paulo@nexor.com", senha: "errada-errada" })).status, 401);
  const r = await c.post("/api/entrar", { email: "paulo@nexor.com", senha: "senha-muito-forte" });
  assert.equal(r.dados.proximo, "codigo");
  assert.equal((await c.get("/api/totp/novo")).status, 401, "não mostra outro QR para quem já tem 2FA");
  assert.equal((await c.post("/api/totp", { codigo: codigoTotp(segredoDono, agora()) })).status, 200);
});

test("pedido sem o cabeçalho do painel é recusado (CSRF)", async () => {
  const r = await fetch(url + "/api/clientes", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(r.status, 403);
});

test("regras: vencimento em mês curto, mensalidades e régua", () => {
  assert.equal(vencimentoDe("2027-02", 31), "2027-02-28");
  const padrao = { aviso: 1, restrito: 10, bloqueio: 20, antecedencia: 10, manter_ponto: true };
  const c = { status: "ativo", valor_centavos: 50000, dia_vencimento: 10, inicio_cobranca: "2026-11-01", regras: {}, criado_em: 0 };
  assert.deepEqual(mensalidadesDevidas(c, [], "2026-11-04", padrao).map((f) => f.vencimento), ["2026-11-10"]);
  assert.deepEqual(mensalidadesDevidas(c, [], "2026-12-01", padrao).map((f) => f.vencimento), ["2026-12-10"]);
  const f = [{ status: "aberta", vencimento: "2026-11-10" }];
  assert.equal(situacaoCliente(c, f, "2026-11-10", padrao).situacao, "ativo", "no dia do vencimento ainda está em dia");
  assert.equal(situacaoCliente(c, f, "2026-11-11", padrao).situacao, "aviso");
  assert.equal(situacaoCliente(c, f, "2026-11-20", padrao).situacao, "restrito");
  assert.equal(situacaoCliente(c, f, "2026-11-30", padrao).situacao, "bloqueado");
  assert.equal(situacaoCliente({ ...c, liberado_ate: "2026-12-05" }, f, "2026-11-30", padrao).situacao, "ativo", "liberação temporária");
  assert.equal(situacaoCliente({ ...c, bloqueio_manual: "teste" }, [], "2026-11-30", padrao).situacao, "bloqueado");
});

test("ciclo completo: fatura, atraso, bloqueio automático e desbloqueio pelo pagamento", async () => {
  const c = await dono.post("/api/clientes", { razao_social: "Padaria Pão Dourado Ltda", nome_fantasia: "Pão Dourado", cnpj: "11.222.333/0001-81", valor_centavos: 49900, dia_vencimento: 10, plano: "RH Essencial" });
  assert.equal(c.status, 200, JSON.stringify(c.dados));
  const id = c.dados.id;
  const sis = await dono.post(`/api/clientes/${id}/sistemas`, { produto: "rh", url: "https://rh.paodourado.com.br/" });
  assert.equal(sis.status, 200);
  assert.match(sis.dados.token, /^nxs_/);
  assert.match(sis.dados.env, /NEXOR_CHAVE_PUBLICA=/);
  assert.equal(sis.dados.sistema.url, "https://rh.paodourado.com.br");
  const chave = s.assinador.chavePublica;

  const sincronizar = async (token = sis.dados.token) => {
    const r = await fetch(url + "/api/v1/sincronizar", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ versao: "1.1.0", saude: { colaboradores: 12, backup_ultimo: agora(), nome: "não deve passar" } }) });
    return { status: r.status, dados: await r.json() };
  };
  assert.equal((await sincronizar("nxs_" + "x".repeat(43))).status, 401);
  let lic = conferirAssinado((await sincronizar()).dados.licenca, chave);
  assert.equal(lic.situacao, "ativo");
  assert.equal(lic.inst, sis.dados.sistema.id);
  assert.equal(lic.manter_ponto, true);

  const det = (await dono.get(`/api/clientes/${id}`)).dados;
  assert.equal(det.faturas.length, 1, "mensalidade de novembro criada (vence em 6 dias)");
  assert.equal(det.sistemas[0].saude.colaboradores, 12);
  assert.equal(det.sistemas[0].saude.nome, undefined, "só os campos de saúde permitidos");
  const fatura = det.faturas[0];

  await avancar(7); // 11/11
  lic = conferirAssinado((await sincronizar()).dados.licenca, chave);
  assert.equal(lic.situacao, "aviso");
  assert.match(lic.mensagem, /10\/11\/2026/);
  await avancar(10); // 21/11
  assert.equal(conferirAssinado((await sincronizar()).dados.licenca, chave).situacao, "restrito");
  await avancar(10); // 01/12
  assert.equal(conferirAssinado((await sincronizar()).dados.licenca, chave).situacao, "bloqueado");

  // Promessa de pagamento: libera até uma data
  assert.equal((await dono.post(`/api/clientes/${id}/desbloquear`, { ate: "2026-12-03", motivo: "promessa" })).dados.situacao, "ativo");
  await avancar(3); // 04/12: a liberação venceu
  assert.equal(conferirAssinado((await sincronizar()).dados.licenca, chave).situacao, "bloqueado");

  // Pagou: volta sozinho
  assert.equal((await dono.post(`/api/faturas/${fatura.id}/pagar`, { forma: "pix" })).status, 200);
  const painel = (await dono.get("/api/painel")).dados;
  assert.ok(painel.financeiro.recebido_mes >= 49900);
  const st = conferirAssinado((await sincronizar()).dados.licenca, chave).situacao;
  assert.ok(st === "ativo" || st === "aviso", "a de novembro foi paga; a de dezembro ainda não venceu");

  // Bloqueio manual
  await dono.post(`/api/clientes/${id}/bloquear`, { motivo: "contrato em revisão" });
  lic = conferirAssinado((await sincronizar()).dados.licenca, chave);
  assert.equal(lic.situacao, "bloqueado");
  assert.match(lic.mensagem, /contrato em revisão/);
  await dono.post(`/api/clientes/${id}/desbloquear`, {});
  assert.notEqual(conferirAssinado((await sincronizar()).dados.licenca, chave).situacao, "bloqueado");
});

test("webhook do Asaas confirma o pagamento só com o token certo", async () => {
  const c = (await dono.get("/api/clientes")).dados[0];
  const f = (await dono.post("/api/faturas", { cliente_id: c.id, descricao: "Implantação", valor_centavos: 150000, vencimento: "2026-12-20" })).dados;
  const enviar = (token) => fetch(url + "/api/webhooks/asaas", { method: "POST", headers: { "content-type": "application/json", "asaas-access-token": token }, body: JSON.stringify({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1", externalReference: f.id, paymentDate: "2026-12-04", billingType: "PIX" } }) });
  assert.equal((await enviar("errado")).status, 401);
  assert.equal((await enviar("tok-webhook-asaas")).status, 200);
  const depois = (await dono.get(`/api/faturas?cliente=${c.id}`)).dados.find((x) => x.id === f.id);
  assert.equal(depois.status, "paga");
  assert.equal(depois.forma, "pix");
});

test("acesso de suporte gera link assinado, curto e registrado", async () => {
  const sis = (await dono.get("/api/sistemas")).dados[0];
  const r = await dono.post(`/api/sistemas/${sis.id}/acesso`);
  assert.equal(r.status, 200);
  const u = new URL(r.dados.url);
  assert.equal(u.origin, "https://rh.paodourado.com.br");
  assert.equal(u.pathname, "/api/nexor/entrar");
  const t = conferirAssinado(u.searchParams.get("t"), s.assinador.chavePublica);
  assert.equal(t.tipo, "acesso");
  assert.equal(t.inst, sis.id);
  assert.ok(t.exp - agora() <= 120_000);
  const aud = (await dono.get("/api/auditoria")).dados;
  assert.ok(aud.some((a) => a.acao === "acesso_suporte"));
});

test("perfil financeiro não abre sistemas de clientes; suporte não mexe em faturas", async () => {
  for (const papel of ["financeiro", "suporte"]) assert.equal((await dono.post("/api/usuarios", { nome: papel, email: `${papel}@nexor.com`, papel, senha: "senha-provisoria" })).status, 200);
  const entrar = async (email) => {
    const c = cliente();
    await c.post("/api/entrar", { email, senha: "senha-provisoria" });
    const { segredo } = (await c.get("/api/totp/novo")).dados;
    assert.equal((await c.post("/api/totp", { codigo: codigoTotp(segredo, agora()) })).status, 200);
    return c;
  };
  const fin = await entrar("financeiro@nexor.com");
  const sup = await entrar("suporte@nexor.com");
  const sis = (await dono.get("/api/sistemas")).dados[0];
  const f = (await dono.get("/api/faturas")).dados[0];
  assert.equal((await fin.post(`/api/sistemas/${sis.id}/acesso`)).status, 403);
  assert.equal((await sup.post(`/api/faturas/${f.id}/cancelar`)).status, 403);
  assert.equal((await sup.post(`/api/sistemas/${sis.id}/acesso`)).status, 200);
  assert.equal((await fin.get("/api/usuarios")).status, 403);
});

test("código do cliente: formato, normalização e troca", async () => {
  const { novoCodigo, normalizarCodigo } = await import("../src/db.js");
  const c = novoCodigo();
  assert.match(c, /^NX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normalizarCodigo(c.toLowerCase().replace(/-/g, " ")), c);
  assert.equal(normalizarCodigo("nx abc"), null);
  const cli = (await dono.get("/api/clientes")).dados[0];
  assert.match(cli.codigo, /^NX-/);
  const novo = (await dono.post(`/api/clientes/${cli.id}/codigo`)).dados.codigo;
  assert.notEqual(novo, cli.codigo);
  const r = await fetch(url + "/api/v1/vincular", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo: cli.codigo, produto: "rh" }) });
  assert.equal(r.status, 404, "o código antigo não vincula mais");
});
