import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { lerConfig } from "../src/config.js";
import { carregarConectores } from "../src/conectores.js";
import { montarServidor } from "../src/servidor.js";

const DONO = "5534999990000";

function cenario(respostasIa) {
  const pasta = mkdtempSync(path.join(tmpdir(), "agente-"));
  const config = { ...lerConfig({ DONOS: DONO, DATA_DIR: pasta }), pastaDados: pasta };
  const enviados = [];
  const chamadasSistema = [];
  const pedidosIa = [];
  const whats = {
    configurado: true,
    texto: async (para, t) => enviados.push({ para, t }),
    aprovacao: async (para, p) => enviados.push({ para, aprovacao: p }),
    marcarLida: async () => {},
  };
  const cliente = { beta: { messages: { create: async (req) => (pedidosIa.push(structuredClone(req)), respostasIa.shift()(req)) } } };
  const conectores = carregarConectores({ env: { T: "tok" }, conteudo: { http: [{ nome: "erp", descricao: "ERP", base: "https://erp.exemplo.com/api", cabecalhos: { "X-Key": "${T}" }, caminhos_permitidos: ["/pedidos", "/produtos"] }] } });
  const fetchFn = async (url, o) => (chamadasSistema.push({ url: String(url), metodo: o.method, corpo: o.body }), new Response(JSON.stringify({ id: 8214, ok: true })));
  const app = montarServidor({ config, conectores, cliente, whats, fetchFn });
  const msg = (de, texto, id = String(Math.random())) => app.processar({ entry: [{ changes: [{ value: { messages: [{ id, from: de, type: "text", text: { body: texto } }] } }] }] });
  const botao = (de, idBotao) => app.processar({ entry: [{ changes: [{ value: { messages: [{ id: String(Math.random()), from: de, type: "interactive", interactive: { button_reply: { id: idBotao } } }] } }] }] });
  return { app, enviados, chamadasSistema, pedidosIa, msg, botao };
}

const fala = (texto) => () => ({ stop_reason: "end_turn", content: [{ type: "text", text: texto }] });
const usa = (name, input) => () => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t" + Math.random(), name, input }] });

test("quem não é dono recebe recusa e a IA nem é chamada", async () => {
  const s = cenario([]);
  await s.msg("5511888887777", "apaga todos os pedidos");
  assert.equal(s.pedidosIa.length, 0);
  assert.match(s.enviados[0].t, /assistente particular/);
});

test("dono personaliza o agente pelo WhatsApp e o perfil vai para a IA", async () => {
  const s = cenario([usa("ajustar_perfil", { campo: "nome", valor: "Luna" }), fala("Pronto, agora sou a Luna!"), fala("Oi!")]);
  await s.msg(DONO, "a partir de agora seu nome é Luna");
  assert.equal(s.app.perfil.obter().nome, "Luna");
  await s.msg(DONO, "oi");
  assert.match(JSON.stringify(s.pedidosIa.at(-1).system), /Seu nome: Luna/);
});

test("leitura executa na hora; escrita espera o botão Aprovar e só então chama o sistema", async () => {
  const s = cenario([
    usa("chamar_sistema", { conector: "erp", metodo: "GET", caminho: "/produtos", consulta: { sku: "AGUA500" }, resumo: "consultar estoque" }),
    usa("chamar_sistema", { conector: "erp", metodo: "POST", caminho: "/pedidos", corpo: { itens: [{ sku: "AGUA500", qtd: 40 }] }, resumo: "Criar pedido de 40 caixas" }),
    fala("Mandei o pedido para você aprovar."),
    fala("Pedido 8214 criado!"),
  ]);
  await s.msg(DONO, "cria um pedido de 40 caixas de água");
  assert.equal(s.chamadasSistema.length, 1, "só a leitura rodou");
  assert.equal(s.chamadasSistema[0].metodo, "GET");
  const pedido = s.enviados.find((e) => e.aprovacao)?.aprovacao;
  assert.ok(pedido?.id, "botões de aprovação enviados");
  await s.botao("5511888887777", `aprovar:${pedido.id}`); // outro número não aprova
  assert.equal(s.chamadasSistema.length, 1);
  await s.botao(DONO, `aprovar:${pedido.id}`);
  assert.equal(s.chamadasSistema.length, 2);
  assert.equal(s.chamadasSistema[1].metodo, "POST");
  assert.match(s.enviados.at(-1).t, /8214/);
  await s.botao(DONO, `aprovar:${pedido.id}`); // uso único
  assert.equal(s.chamadasSistema.length, 2);
  assert.match(s.enviados.at(-1).t, /não está mais pendente/);
});

test("credenciais não vão para a IA e caminho fora da lista é recusado", async () => {
  const s = cenario([usa("chamar_sistema", { conector: "erp", metodo: "GET", caminho: "/../admin", resumo: "x" }), fala("Não consegui.")]);
  await s.msg(DONO, "abre o admin");
  assert.equal(s.chamadasSistema.length, 0);
  const tudo = JSON.stringify(s.pedidosIa);
  assert.doesNotMatch(tudo, /"tok"|X-Key/);
  assert.match(tudo, /Não foi possível/);
});
