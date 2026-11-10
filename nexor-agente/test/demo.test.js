import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { lerConfig } from "../src/config.js";
import { carregarConectores } from "../src/conectores.js";
import { escutar, montarPeloAmbiente, montarServidor } from "../src/servidor.js";

const pastaTemp = (p) => mkdtempSync(path.join(tmpdir(), p));
const base = (srv) => `http://127.0.0.1:${srv.address().port}`;

test("(a) sem DEMO as rotas de demonstração não existem (404), nem com o painel ligado", async () => {
  const pasta = pastaTemp("agente-prod-");
  for (const extra of [{}, { PAINEL_SENHA: "senha-forte-1" }]) {
    const config = { ...lerConfig({ DONOS: "5534999990000", DATA_DIR: pasta, ...extra }), pastaDados: pasta, porta: 0 };
    const app = montarServidor({ config, conectores: carregarConectores({ conteudo: { http: [] } }), cliente: {}, whats: { texto: async () => {} }, fetchFn: async () => new Response("{}") });
    await escutar(app.servidor, config);
    try {
      for (const [metodo, rota] of [["GET", "/demo/entrar?papel=dono"], ["GET", "/api/demo"], ["POST", "/api/demo/reiniciar"], ["GET", "/api/demo/mensagens"], ["POST", "/api/demo/receber"]]) {
        const r = await fetch(base(app.servidor) + rota, { method: metodo, redirect: "manual" });
        assert.equal(r.status, 404, `${metodo} ${rota} ${JSON.stringify(extra)}`);
      }
      const painel = await fetch(base(app.servidor) + "/");
      assert.equal(painel.status, extra.PAINEL_SENHA ? 200 : 404, "painel só existe com PAINEL_SENHA");
    } finally {
      app.servidor.close();
    }
  }
});

test("(b-e) com DEMO: semeia, entra, roteiro ao vivo, trava de rede, reiniciar e loopback", async () => {
  const pasta = pastaTemp("agente-demo-");
  const env = { DEMO: "1", DEMO_RESET: "1", DATA_DIR: pasta, PORT: "0", DEMO_ATRASO_MS: "0" };
  const { app, config, demo } = await montarPeloAmbiente(env);
  await escutar(app.servidor, config);
  const url = base(app.servidor);
  try {
    // (e) só loopback
    assert.equal(app.servidor.address().address, "127.0.0.1");

    // (b) semeado e /demo/entrar cria a sessão
    const info = await (await fetch(url + "/api/demo")).json();
    assert.equal(info.demo, true);
    assert.equal(info.ia, "simulada");
    assert.ok(info.papeis.some((p) => p.papel === "dono"));
    assert.equal(info.nome, "Nexor Agente");
    assert.equal(info.empresa, "Distribuidora Vale Verde");
    for (const p of info.papeis) {
      assert.ok(p.nome && p.descricao && p.url.startsWith("/demo/entrar?papel="));
      assert.ok(!("email" in p) && !("senha" in p));
    }
    const entrar = await fetch(url + "/demo/entrar?papel=dono", { redirect: "manual" });
    assert.equal(entrar.status, 302);
    const cookie = entrar.headers.get("set-cookie").split(";")[0];
    const get = (rota) => fetch(url + rota, { headers: { cookie } }).then((r) => r.json());
    const post = (rota, corpo) => fetch(url + rota, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then((r) => r.json());
    const inicial = await get("/api/painel");
    assert.equal(inicial.agente.nome, "Luna");
    assert.equal(inicial.pendentes.length, 3);
    assert.ok(inicial.historico.length >= 10);
    assert.equal(app.central.estado().rotulo, "Demonstração");
    const pedidosAntes = JSON.parse(readFileSync(path.join(pasta, "empresa.json"), "utf8")).pedidos.length;

    // roteiro: vendas e cobrança com aprovação
    const vendas = await post("/api/chat", { texto: "quanto vendemos ontem?" });
    assert.match(vendas.resposta, /vendemos R\$|não teve venda/);
    const cob = await post("/api/chat", { texto: "manda a cobrança para os clientes atrasados" });
    assert.match(cob.resposta, /6 clientes com 7 boletos vencidos/);
    const pend = (await get("/api/painel")).pendentes.find((p) => /cobrança/i.test(p.resumo));
    assert.ok(pend);
    const feito = await post(`/api/aprovacoes/${pend.id}`, { acao: "aprovar" });
    assert.match(feito.resposta, /Enviei 6 mensagens/);
    const { mensagens } = await (await fetch(url + "/api/demo/mensagens")).json();
    assert.equal(mensagens.filter((m) => m.origem === "empresa" && /boleto\.exemplo/.test(m.texto)).length, 6);

    // WhatsApp simulado chegando pelo webhook
    const rec = await post("/api/demo/receber", { texto: "cria um pedido de 30 fardos de refrigerante cola para o Mercado Bom Preço" });
    assert.ok(rec.respostas.some((t) => /Pedido A[0-9A-F]{6}/.test(t)));
    const id = rec.respostas.join("\n").match(/pedido (A[0-9A-F]{6})/)[1];
    const ok = await post("/api/demo/receber", { texto: `aprovar:${id}` });
    assert.match(ok.respostas.join("\n"), /Pedido \d+ criado/);
    await post("/api/chat", { texto: "seu nome agora é Bia" });
    assert.equal(app.perfil.obter().nome, "Bia");

    // (c) nenhuma chamada sai para host externo
    await assert.rejects(fetch("https://example.com/"), /bloqueada/);
    await assert.rejects(fetch("https://api.anthropic.com/v1/messages"), /bloqueada/);
    await assert.rejects(demo.fetchFn("https://api.asaas.com/v3/payments"), /bloqueada/);

    // (d) reiniciar volta ao original
    assert.deepEqual(await (await fetch(url + "/api/demo/reiniciar", { method: "POST" })).json(), { ok: true });
    const depois = await get("/api/painel");
    assert.equal(depois.agente.nome, "Luna");
    assert.equal(depois.pendentes.length, 3);
    assert.deepEqual(depois.conversa.map((m) => m.texto), inicial.conversa.map((m) => m.texto));
    assert.equal(JSON.parse(readFileSync(path.join(pasta, "empresa.json"), "utf8")).pedidos.length, pedidosAntes);
    assert.equal((await (await fetch(url + "/api/demo/mensagens")).json()).mensagens.length, 0);
  } finally {
    app.servidor.close();
  }
});

test("DEMO_PUBLICO=1 escuta em todas as interfaces", async () => {
  const { config } = await montarPeloAmbiente({ DEMO: "1", DEMO_PUBLICO: "1", DATA_DIR: pastaTemp("agente-pub-"), PORT: "0" });
  assert.equal(config.host, undefined);
});
