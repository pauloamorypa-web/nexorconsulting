/* Modo Demonstração: rotas só com DEMO=1, semeadura, login por papel, trava de rede, simuladores
   (WhatsApp, IA roteirizada, Asaas), reinício e escuta só em 127.0.0.1. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { montarAplicacao } from "../src/servidor.js";
import { subir } from "./ajuda.js";

async function subirDemo(env = {}) {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-contabil-demo-"));
  const cfg = lerConfig({ DEMO: "1", DATA_DIR: pasta, DEMO_PAGAMENTO_SEGUNDOS: "1", ...env });
  const app = montarAplicacao({ cfg });
  await app.pronto;
  const end = await app.escutar(0);
  return { app, end, url: `http://127.0.0.1:${end.port}`, fechar: () => (app.fechar(), rmSync(pasta, { recursive: true, force: true })) };
}
const json = (url, corpo, cookie = "") => fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-nexor": "1", cookie }, body: JSON.stringify(corpo ?? {}) });
const contagem = (repo) => Object.fromEntries(["clientes", "documentos", "pendencias", "tarefas", "lancamentos", "entregas", "chamados", "mensagens", "envios", "demo_honorarios", "usuarios", "portal_usuarios"].map((t) => [t, repo.um(`SELECT COUNT(*) n FROM ${t}`).n]));
async function entrar(url, papel) {
  const r = await fetch(`${url}/demo/entrar?papel=${papel}`, { redirect: "manual" });
  return { status: r.status, destino: r.headers.get("location"), cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
}

test("(a) sem DEMO=1 as rotas de demonstração não existem (404) e nada muda nas telas", async () => {
  const s = await subir();
  try {
    assert.equal((await fetch(`${s.url}/demo/entrar?papel=dono`, { redirect: "manual" })).status, 404);
    assert.equal((await fetch(`${s.url}/api/demo`)).status, 404);
    assert.equal((await fetch(`${s.url}/api/demo/mensagens`)).status, 404);
    assert.equal((await s.cliente().post("/api/demo/reiniciar")).status, 404);
    assert.equal((await s.cliente().post("/api/demo/receber", { texto: "oi" })).status, 404);
    assert.equal((await fetch(`${s.url}/demo/pagamento/x`)).status, 404);
    const html = await (await fetch(`${s.url}/`)).text();
    assert.ok(!html.includes("/js/demo.js"), "a faixa da demonstração não entra fora do modo demo");
    assert.equal(s.app.cfg.demo, false);
    assert.equal(lerConfig({}).pastaDados, "./data");
    assert.equal(lerConfig({}).chaveMestra, "", "sem DEMO não existe chave mestra padrão");
  } finally {
    s.fechar();
  }
});

describe("com DEMO=1", () => {
  let d;
  before(async () => {
    d = await subirDemo();
  });
  after(() => d.fechar());

  test("(e) escuta só em 127.0.0.1", () => {
    assert.equal(d.end.address, "127.0.0.1");
  });

  test("(b) semeia o Escritório Exemplo e cada papel entra pelo /demo/entrar", async () => {
    const n = contagem(d.app.repo);
    assert.equal(n.clientes, 12);
    assert.ok(n.documentos > 50 && n.tarefas > 100 && n.mensagens > 5 && n.demo_honorarios === 36, JSON.stringify(n));
    const info = await (await fetch(`${d.url}/api/demo`)).json();
    assert.equal(info.demo, true);
    assert.equal(info.ia, "simulada");
    assert.deepEqual(info.papeis.map((p) => p.papel), ["dono", "colaborador", "cliente"]);
    assert.ok(info.papeis.every((p) => p.nome && p.descricao && p.url));
    assert.equal(info.empresa, "Escritório Exemplo Contabilidade");
    assert.equal(info.nome, "Nexor Contábil");
    assert.ok(info.papeis.every((p) => p.url.startsWith("/demo/entrar?papel=") && !("email" in p) && !("senha" in p) && !("login" in p)), "sem e-mail nem senha");

    const dono = await entrar(d.url, "dono");
    assert.equal(dono.status, 302);
    assert.equal(dono.destino, "/#/inicio");
    const eu = await (await fetch(`${d.url}/api/eu`, { headers: { cookie: dono.cookie } })).json();
    assert.equal(eu.usuario.papel, "dono");
    assert.equal(eu.demo, true);
    assert.equal(eu.licenca.situacao, "ativo");
    assert.equal(eu.licenca.mensagem, "Demonstração");
    assert.equal(eu.escritorio.nome_fantasia, "Escritório Exemplo Contabilidade");
    const painel = await (await fetch(`${d.url}/api/painel`, { headers: { cookie: dono.cookie } })).json();
    assert.ok(painel.tarefas.atrasadas >= 1, "há obrigação atrasada");
    assert.ok(painel.tarefas.concluidas_mes >= 1, "há obrigação entregue");
    assert.ok(painel.documentos.a_conferir >= 5, "há documentos para conferir");
    const hon = await (await fetch(`${d.url}/api/demo/honorarios`, { headers: { cookie: dono.cookie } })).json();
    const sits = new Set(hon.lista.map((x) => x.situacao));
    assert.ok(sits.has("pago") && sits.has("atrasado") && sits.has("a_vencer"));
    assert.ok(hon.lista.some((x) => x.forma === "Pix · Asaas"), "um pago pelo Asaas");

    const colab = await entrar(d.url, "colaborador");
    const eu2 = await (await fetch(`${d.url}/api/eu`, { headers: { cookie: colab.cookie } })).json();
    assert.equal(eu2.usuario.papel, "equipe");
    assert.equal((await fetch(`${d.url}/api/usuarios`, { method: "POST", headers: { cookie: colab.cookie, "x-nexor": "1", "content-type": "application/json" }, body: "{}" })).status, 403, "colaborador não mexe na equipe");

    const cli = await entrar(d.url, "cliente");
    assert.equal(cli.destino, "/portal/#/inicio");
    const peu = await (await fetch(`${d.url}/api/portal/eu`, { headers: { cookie: cli.cookie } })).json();
    assert.equal(peu.empresa.nome, "Padaria Pão Dourado");
    assert.equal(peu.demo, true);
    assert.equal((await entrar(d.url, "intruso")).status, 404);

    const html = await (await fetch(`${d.url}/portal/`)).text();
    assert.ok(html.includes('<script type="module" src="/js/demo.js"></script>'), "faixa no portal");
    assert.ok((await (await fetch(`${d.url}/`)).text()).includes("/js/demo.js"), "faixa no painel");
  });

  test("(c) nenhuma chamada sai para host externo: a trava lança e os provedores são simulados", async () => {
    await assert.rejects(() => fetch("https://api.asaas.com/v3/payments"), /bloqueada/);
    await assert.rejects(() => fetch("https://graph.facebook.com/v23.0/x/messages", { method: "POST" }), /bloqueada/);
    await assert.rejects(() => fetch("https://central.nexorconsultingit.com.br/api/v1/sincronizar"), /bloqueada/);
    await assert.rejects(() => d.app.demo.simulador.fetchFn("https://example.com/"), /bloqueada/);
    assert.equal((await fetch(`${d.url}/health`)).status, 200, "localhost continua liberado");
    assert.equal(d.app.central.configurada, false);
  });

  test("cliente manda mensagem e documento pelo WhatsApp: a IA responde e classifica", async () => {
    const r1 = await (await json(`${d.url}/api/demo/receber`, { de: "34999990002", texto: "Oi, o que ainda falta eu mandar?" })).json();
    assert.equal(r1.cliente, "Mercadinho Bom Preço");
    assert.match(r1.respostas[0], /ainda faltam/);
    const r2 = await (await json(`${d.url}/api/demo/receber`, { de: "34999990002", arquivo: "extrato" })).json();
    assert.equal(r2.documento.leitura_status, "lido");
    assert.equal(r2.documento.tipo, "extrato_bancario");
    assert.ok(r2.documento.pendencia_cumprida?.startsWith("Extrato"), JSON.stringify(r2.documento));
    const r3 = await (await json(`${d.url}/api/demo/receber`, { de: "34999990009", texto: "Posso mudar para o lucro presumido para pagar menos imposto?" })).json();
    assert.ok(r3.chamado, "dúvida tributária vai para a equipe");
    assert.equal(r3.chamado.departamento, "fiscal");
    const log = await (await fetch(`${d.url}/api/demo/mensagens`)).json();
    assert.ok(log.some((m) => m.canal === "whatsapp" && m.texto.includes("ainda faltam")));
  });

  test("honorário cobrado pelo Asaas simulado dá baixa sozinho", async () => {
    const { cookie } = await entrar(d.url, "dono");
    const hon = await (await fetch(`${d.url}/api/demo/honorarios`, { headers: { cookie } })).json();
    const atrasado = hon.lista.find((x) => x.situacao === "atrasado");
    const c = await (await json(`${d.url}/api/demo/honorarios/${atrasado.id}/cobrar`, {}, cookie)).json();
    assert.match(c.asaas_id, /^pay_demo/);
    assert.equal((await fetch(`${d.url}${c.link}`)).status, 200, "tela de pagamento fictícia");
    await new Promise((ok) => setTimeout(ok, 1600));
    const depois = await (await fetch(`${d.url}/api/demo/honorarios`, { headers: { cookie } })).json();
    const x = depois.lista.find((y) => y.id === atrasado.id);
    assert.equal(x.status, "pago");
    assert.equal(x.forma, "Pix · Asaas");
    const outro = depois.lista.find((y) => y.situacao !== "pago");
    assert.equal((await (await json(`${d.url}/api/demo/pagar/${outro.id}`)).json()).status, "pago", "pagamento na hora");
  });

  test("(d) reiniciar volta os dados ao estado original", async () => {
    const r = await fetch(`${d.url}/api/demo/reiniciar`, { method: "POST", headers: { "x-nexor": "1" } });
    assert.deepEqual(await r.json(), { ok: true });
    const original = contagem(d.app.repo);
    await json(`${d.url}/api/demo/receber`, { de: "34999990001", arquivo: "nota", nome: "nf-compra.pdf" });
    const { cookie } = await entrar(d.url, "dono");
    const hon = await (await fetch(`${d.url}/api/demo/honorarios`, { headers: { cookie } })).json();
    await json(`${d.url}/api/demo/pagar/${hon.lista.find((x) => x.status !== "pago").id}`);
    assert.notDeepEqual(contagem(d.app.repo), original);
    assert.equal((await fetch(`${d.url}/api/demo/reiniciar`, { method: "POST" })).status, 403, "sem o cabeçalho do painel é recusado (CSRF)");
    const outro = await entrar(d.url, "colaborador");
    assert.deepEqual(await (await fetch(`${d.url}/api/demo/reiniciar`, { method: "POST", headers: { "x-nexor": "1", cookie } })).json(), { ok: true });
    assert.deepEqual(contagem(d.app.repo), original);
    assert.equal(d.app.repo.um("SELECT COUNT(*) n FROM demo_honorarios WHERE status = 'pago'").n, hon.lista.filter((x) => x.status === "pago").length);
    assert.equal((await fetch(`${d.url}/api/eu`, { headers: { cookie } })).status, 200, "quem reiniciou continua logado");
    assert.equal((await fetch(`${d.url}/api/eu`, { headers: { cookie: outro.cookie } })).status, 401, "as outras sessões caem com o reinício");
  });
});

test("(e) DEMO_PUBLICO=1 escuta em todas as interfaces; sem DEMO não força 127.0.0.1", async () => {
  const p = await subirDemo({ DEMO_PUBLICO: "1" });
  try {
    assert.notEqual(p.end.address, "127.0.0.1");
  } finally {
    p.fechar();
  }
  const { enderecoEscuta } = await import("../src/servidor.js");
  assert.equal(enderecoEscuta(lerConfig({})), undefined);
  assert.equal(enderecoEscuta(lerConfig({ DEMO: "1" })), "127.0.0.1");
});

test("DEMO_RESET recusa apagar uma pasta que não é de demonstração", () => {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-contabil-real-"));
  try {
    writeFileSync(join(pasta, "contabil.db"), "dados reais");
    assert.throws(() => montarAplicacao({ cfg: lerConfig({ DEMO: "1", DEMO_RESET: "1", DATA_DIR: pasta }) }), /não é uma pasta de demonstração/);
    assert.equal(readFileSync(join(pasta, "contabil.db"), "utf8"), "dados reais");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
