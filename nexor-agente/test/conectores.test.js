import assert from "node:assert/strict";
import { test } from "node:test";
import { carregarConectores, chamarHttp, descreverSistemas, montarUrl, precisaAprovacao } from "../src/conectores.js";

const env = { CRM_TOKEN: "segredo-123" };
const { http } = carregarConectores({ env, conteudo: { http: [{ nome: "crm", descricao: "CRM", base: "https://api.crm.com/v1", cabecalhos: { Authorization: "Bearer ${CRM_TOKEN}" }, caminhos_permitidos: ["/clientes"] }] } });
const crm = http[0];

test("segredo vem do ambiente e não aparece na descrição para a IA", () => {
  assert.equal(crm.cabecalhos.Authorization, "Bearer segredo-123");
  assert.doesNotMatch(descreverSistemas({ http, mcp: [] }), /segredo-123|api\.crm\.com/);
});

test("URL não escapa da base nem da lista de caminhos", () => {
  assert.equal(montarUrl(crm, "/clientes/10", { a: "1" }).href, "https://api.crm.com/v1/clientes/10?a=1");
  for (const ruim of ["/clientes/../admin", "//evil.com/x", "clientes", "/pedidos", "/clientesx", "/clientes\r\nX: y", "/clientes\\..\\a"]) {
    assert.throws(() => montarUrl(crm, ruim), undefined, ruim);
  }
});

test("escrita pede aprovação por padrão e pode ser bloqueada", () => {
  assert.equal(precisaAprovacao(crm, "GET"), false);
  assert.equal(precisaAprovacao(crm, "POST"), true);
  assert.equal(precisaAprovacao({ ...crm, escrita: "bloqueada" }, "DELETE"), null);
});

test("base precisa ser https e variável ausente é erro", () => {
  assert.throws(() => carregarConectores({ env, conteudo: { http: [{ nome: "x1", base: "http://a.com" }] } }), /https/);
  assert.throws(() => carregarConectores({ env: {}, conteudo: { http: [{ nome: "x1", base: "https://a.com", cabecalhos: { A: "${NAO}" } }] } }), /NAO/);
});

test("chamada HTTP não segue redirecionamento e corta resposta grande", async () => {
  let opcoes;
  const r = await chamarHttp(crm, { metodo: "GET", caminho: "/clientes" }, { fetchFn: async (u, o) => ((opcoes = o), new Response("x".repeat(50))), tamanhoMaximo: 10 });
  assert.equal(opcoes.redirect, "error");
  assert.equal(opcoes.headers.Authorization, "Bearer segredo-123");
  assert.match(r.texto, /cortada/);
});

test("rede interna do ecossistema aceita http só para nome de serviço (sem ponto)", () => {
  const ok = carregarConectores({ env: { NODE_ENV: "production" }, conteudo: { http: [{ nome: "nexor-rh", base: "http://rh:8791/api/integracao/v1" }] } });
  assert.equal(ok.http[0].base, "http://rh:8791/api/integracao/v1");
  assert.throws(() => carregarConectores({ env: { NODE_ENV: "production" }, conteudo: { http: [{ nome: "x1", base: "http://exemplo.com" }] } }), /https/);
});
