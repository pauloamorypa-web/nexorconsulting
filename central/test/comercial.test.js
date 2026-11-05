/* Nexor Central, parte comercial: teste grátis de 30 dias (licença com limites e bloqueio no fim), contratação
   pelo catálogo com programa de fundadores e implantação, comissões de vendedor e parceiro e portal do parceiro. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { FUNDADORES } from "../src/planos.js";
import { codigoTotp, conferirAssinado } from "../src/seguranca.js";
import { montarCentral } from "../src/servidor.js";

const DIA = 86400_000;
let relogio = Date.parse("2026-11-04T12:00:00-03:00");
const agora = () => relogio;
let s, url, pasta, dono, segredo, cli, sis, rep, parc;

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
async function entrar() {
  dono = cliente();
  await dono.post("/api/entrar", { email: "paulo@nexor.com", senha: "senha-muito-forte" });
  assert.equal((await dono.post("/api/totp", { codigo: codigoTotp(segredo, agora()) })).status, 200);
}
async function avancar(dias) {
  relogio += dias * DIA;
  await entrar();
}
const sincronizar = async () => {
  const r = await fetch(url + "/api/v1/sincronizar", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sis.token}` }, body: JSON.stringify({ versao: "1.0.0", saude: { barbeiros: 1 } }) });
  return conferirAssinado((await r.json()).licenca, s.assinador.chavePublica);
};

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "nexor-central-com-"));
  const cfg = { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste", urlPublica: "https://central.teste", codigoInstalacao: "ABCD2345", contato: { whatsapp: "5534997337499", email: "contato@nexor.teste" }, asaas: { url: "https://asaas.teste", chave: "", webhookToken: "" } };
  s = montarCentral({ cfg, caminhoBanco: ":memory:", agora });
  await new Promise((r) => s.servidor.listen(0, r));
  url = `http://localhost:${s.servidor.address().port}`;
  dono = cliente();
  await dono.post("/api/cadastro", { nome: "Paulo", email: "paulo@nexor.com", senha: "senha-muito-forte", codigo_instalacao: "ABCD2345" });
  segredo = (await dono.get("/api/totp/novo")).dados.segredo;
  assert.equal((await dono.post("/api/totp", { codigo: codigoTotp(segredo, agora()) })).status, 200);
});
after(() => {
  s.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

test("catálogo: planos, teste de 30 dias, fundadores e comissões", async () => {
  const c = (await dono.get("/api/catalogo")).dados;
  assert.equal(c.teste.dias, 30);
  assert.ok(c.planos.barber.planos.find((p) => p.id === "barber-barbearia"));
  assert.deepEqual(c.fundadores.produtos, FUNDADORES.produtos);
  assert.equal(c.fundadores.usadas.barber, 0);
  assert.equal(c.comissoes.revenda.recorrente, 20);
});

test("vendedor e parceiro com as regras de comissão do tipo", async () => {
  rep = (await dono.post("/api/parceiros", { nome: "Rita Representante", tipo: "representante", pix: "rita@pix.teste" })).dados;
  assert.equal(rep.regra.primeira, 100);
  parc = (await dono.post("/api/parceiros", { nome: "Lima Contabilidade", tipo: "revenda", empresa: "Lima Contabilidade Ltda" })).dados;
  assert.equal(parc.regra.recorrente, 20);
  assert.equal((await dono.post("/api/parceiros", { nome: "X", tipo: "inventado" })).status, 400);
});

test("teste grátis: 30 dias com limites na licença e bloqueio depois do último dia", async () => {
  const r = await dono.post("/api/clientes", { razao_social: "Barbearia Navalha Ltda", nome_fantasia: "Navalha", cnpj: "11222333000181", valor_centavos: 0, teste_produto: "barber", parceiro_id: parc.id });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  cli = r.dados;
  assert.equal(cli.fase, "teste");
  assert.equal(cli.teste_ate, "2026-12-03", "30 dias contando hoje");
  assert.equal(cli.situacao, "aviso");
  assert.match(cli.mensagem, /Teste grátis até 03\/12\/2026/);
  sis = (await dono.post(`/api/clientes/${cli.id}/sistemas`, { produto: "barber", url: "https://barber.navalha.teste" })).dados;
  let lic = await sincronizar();
  assert.equal(lic.plano, "teste");
  assert.equal(lic.situacao, "aviso");
  assert.deepEqual(lic.limites, { barbeiros: 2, agendamentos_mes: 150 });
  assert.deepEqual(lic.travados, ["modulo.relatorios"]);
  assert.match(lic.link, /^https:\/\/wa\.me\/5534997337499\?text=/, "a faixa leva para a contratação");
  assert.equal((await dono.post("/api/faturas/gerar")).dados.criadas, 0, "no teste não há mensalidade");
  const painel = (await dono.get("/api/painel")).dados;
  assert.equal(painel.clientes.em_teste, 1);

  await avancar(30);
  lic = await sincronizar();
  assert.equal(lic.situacao, "bloqueado");
  assert.match(lic.mensagem, /teste grátis terminou/i);
  assert.ok((await dono.get("/api/painel")).dados.alertas.some((a) => a.tipo === "teste"));
  // Prorrogar é possível (no máximo 30 dias por vez)
  assert.equal((await dono.post(`/api/clientes/${cli.id}/teste`, { dias: 45 })).status, 400);
  assert.equal((await dono.post(`/api/clientes/${cli.id}/teste`, { dias: 5 })).dados.teste_ate, "2026-12-09");
  assert.equal((await sincronizar()).situacao, "aviso");
});

test("contratação: fundador com 40% por 12 meses, implantação com 50% e preço travado", async () => {
  assert.equal((await dono.post(`/api/clientes/${cli.id}/contratar`, { plano_id: "rh-ponto", quantidade: 10, fundador: true })).status, 400, "RH não está no programa de fundadores");
  const r = await dono.post(`/api/clientes/${cli.id}/contratar`, { plano_id: "barber-barbearia", fundador: true, vendedor_id: rep.id, dia_vencimento: 10 });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const c = r.dados;
  assert.equal(c.fase, "contrato");
  assert.equal(c.valor_centavos, 18900);
  assert.equal(c.desconto_pct, 40);
  assert.equal(c.desconto_ate, "2027-11");
  assert.equal(c.fundador, true);
  assert.equal(c.regras.preco_travado_ate, "2028-12");
  const lic = await sincronizar();
  assert.equal(lic.plano, "contratado");
  assert.deepEqual(lic.limites, {});
  assert.equal(lic.situacao, "ativo");
  const faturas = (await dono.get(`/api/faturas?cliente=${cli.id}`)).dados;
  const impl = faturas.find((f) => f.tipo === "implantacao");
  assert.equal(impl.valor_centavos, 34500, "R$ 690 com 50% de fundador");
  const mens = faturas.find((f) => f.tipo === "mensalidade");
  assert.equal(mens.valor_centavos, 11340, "R$ 189 com 40% de fundador");
  assert.match(mens.descricao, /fundador 40%/);
  assert.equal((await dono.get("/api/catalogo")).dados.fundadores.usadas.barber, 1);
});

test("comissões: geradas no pagamento, carência de 30 dias, estorno na reabertura e pagamento", async () => {
  const faturas = (await dono.get(`/api/faturas?cliente=${cli.id}`)).dados;
  const impl = faturas.find((f) => f.tipo === "implantacao");
  const mens = faturas.find((f) => f.tipo === "mensalidade");
  await dono.post(`/api/faturas/${impl.id}/pagar`, { forma: "pix" });
  await dono.post(`/api/faturas/${mens.id}/pagar`, { forma: "pix" });
  let cs = (await dono.get("/api/comissoes")).dados;
  const de = (nome, tipo) => cs.find((x) => x.parceiro === nome && x.tipo === tipo);
  assert.equal(de("Rita Representante", "implantacao").valor_centavos, 3450);
  assert.equal(de("Lima Contabilidade", "implantacao").valor_centavos, 3450);
  assert.equal(de("Rita Representante", "primeira").valor_centavos, 11340, "100% da 1ª mensalidade paga");
  assert.equal(de("Lima Contabilidade", "recorrente").valor_centavos, 2268, "20% recorrente");
  assert.ok(cs.every((x) => x.status === "prevista"));

  // Reabriu a mensalidade: a comissão dela é estornada; paga de novo, volta
  await dono.post(`/api/faturas/${mens.id}/reabrir`);
  cs = (await dono.get("/api/comissoes")).dados;
  assert.equal(cs.filter((x) => x.status === "estornada").length, 2);
  await dono.post(`/api/faturas/${mens.id}/pagar`, { forma: "pix" });
  cs = (await dono.get("/api/comissoes")).dados;
  assert.equal(cs.filter((x) => x.status === "estornada").length, 0);
  assert.equal(cs.length, 4, "não duplica");

  const x = de("Rita Representante", "primeira");
  assert.equal((await dono.post(`/api/comissoes/${x.id}/pagar`)).status, 409, "em carência");
  await avancar(31);
  await dono.post("/api/faturas/gerar");
  cs = (await dono.get("/api/comissoes?status=a_pagar")).dados;
  assert.equal(cs.length, 4);
  assert.equal((await dono.post(`/api/comissoes/${x.id}/pagar`, {})).dados.status, "paga");
  const painel = (await dono.get("/api/painel")).dados;
  assert.equal(painel.financeiro.comissoes_a_pagar, 3450 + 3450 + 2268);
  assert.equal(painel.financeiro.mrr, 11340, "MRR com o desconto de fundador");
});

test("portal do parceiro: link próprio, clientes, comissões e indicações", async () => {
  const { link } = (await dono.post(`/api/parceiros/${parc.id}/portal`)).dados;
  assert.match(link, /^https:\/\/central\.teste\/parceiro\/#t=nxp_/);
  const token = link.split("#t=")[1];
  const h = { authorization: `Parceiro ${token}` };
  const r = await fetch(url + "/api/portal-parceiro", { headers: h });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.parceiro.nome, "Lima Contabilidade");
  assert.equal(d.clientes.length, 1);
  assert.equal(d.clientes[0].nome, "Navalha");
  assert.equal(d.clientes[0].cnpj, undefined, "o portal não expõe dados do cliente além do necessário");
  assert.equal(d.totais.a_receber, 3450 + 2268);
  const ind = await fetch(url + "/api/portal-parceiro/indicacoes", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ empresa: "Padaria Pão Dourado", contato: "Rosa", telefone: "34999990000", produto: "rh" }) });
  assert.equal(ind.status, 200);
  assert.equal((await dono.get("/api/indicacoes")).dados[0].empresa, "Padaria Pão Dourado");
  assert.equal((await fetch(url + "/api/portal-parceiro", { headers: { authorization: "Parceiro nxp_invalido_invalido_invalido" } })).status, 401);
  // Trocar o link derruba o anterior
  await dono.post(`/api/parceiros/${parc.id}/portal`);
  assert.equal((await fetch(url + "/api/portal-parceiro", { headers: h })).status, 401);
});

test("cancelamento nos primeiros 90 dias estorna a comissão da 1ª mensalidade ainda não paga", async () => {
  const c2 = (await dono.post("/api/clientes", { razao_social: "Oficina Roda Viva ME", cnpj: "45723174000110", valor_centavos: 0 })).dados;
  await dono.post(`/api/clientes/${c2.id}/contratar`, { plano_id: "agente-essencial", vendedor_id: rep.id, cobrar_implantacao: false });
  const mens = (await dono.get(`/api/faturas?cliente=${c2.id}`)).dados.find((f) => f.tipo === "mensalidade");
  await dono.post(`/api/faturas/${mens.id}/pagar`);
  assert.equal((await dono.get(`/api/comissoes?parceiro=${rep.id}`)).dados.find((x) => x.cliente === "Oficina Roda Viva ME").valor_centavos, 49700);
  await dono.post(`/api/clientes/${c2.id}/cancelar`, { motivo: "desistiu" });
  assert.equal((await dono.get(`/api/comissoes?parceiro=${rep.id}`)).dados.find((x) => x.cliente === "Oficina Roda Viva ME").status, "estornada");
});
