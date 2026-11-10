/* Modo Demonstração: só existe com DEMO=1, semeia a Clínica Sorriso, entra por papel, não deixa nada sair
   para a internet, reinicia para o estado original e escuta só em 127.0.0.1. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { RedeBloqueada } from "../src/demo/rede.js";
import { hostDeEscuta, montarAplicacao } from "../src/servidor.js";

const pastas = [];
const pasta = (prefixo) => {
  const p = mkdtempSync(join(tmpdir(), prefixo));
  pastas.push(p);
  return p;
};
after(() => pastas.forEach((p) => rmSync(p, { recursive: true, force: true })));

async function subir(env) {
  const cfg = lerConfig({ DATA_DIR: pasta("atende-demo-"), ...env });
  const app = montarAplicacao({ cfg, caminhoBanco: ":memory:", atrasoAgrupamento: 0, atrasoIA: 0 });
  await new Promise((r) => app.servidor.listen(0, hostDeEscuta(cfg), r));
  const base = `http://127.0.0.1:${app.servidor.address().port}`;
  let cookie = "";
  const chamar = async (metodo, caminho, corpo, { redirecionar = true } = {}) => {
    const r = await fetch(base + caminho, { method: metodo, redirect: redirecionar ? "follow" : "manual", headers: { "Content-Type": "application/json", "x-nexor": "1", ...(cookie ? { cookie } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, headers: r.headers, dados: tipo.includes("json") ? await r.json() : await r.text() };
  };
  return { app, cfg, base, chamar };
}

const esperar = async (cond, ms = 4000) => {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const v = await cond();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("tempo esgotado");
};

describe("sem DEMO=1", () => {
  let t;
  before(async () => (t = await subir({})));
  after(() => t.app.fechar());

  test("(a) as rotas /demo e /api/demo respondem 404 e o painel não muda", async () => {
    for (const [m, c] of [["GET", "/api/demo"], ["GET", "/demo/entrar?papel=dono"], ["GET", "/demo"], ["POST", "/api/demo/reiniciar"], ["POST", "/api/demo/receber"], ["GET", "/api/demo/mensagens"], ["GET", "/demo/faixa.js"]]) {
      assert.equal((await t.chamar(m, c, m === "POST" ? {} : undefined)).status, 404, `${m} ${c}`);
    }
    const html = await t.chamar("GET", "/");
    assert.ok(!html.dados.includes("/demo/faixa.js"));
    assert.ok(html.dados.includes("fonts.googleapis.com"));
    assert.equal(hostDeEscuta(t.cfg), undefined);
    assert.equal(t.app.repo.contarUsuarios(), 0, "nada é semeado fora da demo");
    assert.equal(globalThis.fetch.travaDemo, undefined);
  });
});

describe("com DEMO=1", () => {
  let t;
  before(async () => (t = await subir({ DEMO: "1" })));
  after(() => t.app.fechar());

  test("(b) semeia a Clínica Sorriso e /demo/entrar loga em cada papel", async () => {
    const info = await t.chamar("GET", "/api/demo");
    assert.equal(info.status, 200);
    assert.equal(info.dados.demo, true);
    assert.equal(info.dados.sistema, "atende");
    assert.equal(info.dados.ia, "simulada");
    assert.deepEqual(info.dados.papeis.map((p) => p.papel), ["dono", "admin", "atendente"]);

    for (const papel of ["dono", "admin", "atendente"]) {
      const r = await t.chamar("GET", `/demo/entrar?papel=${papel}`, undefined, { redirecionar: false });
      assert.equal(r.status, 302);
      assert.match(r.headers.get("location"), /^\/#\//);
      const eu = await t.chamar("GET", "/api/eu");
      assert.equal(eu.status, 200);
      assert.equal(eu.dados.usuario.papel, papel);
      assert.equal(eu.dados.empresa.nome, "Clínica Sorriso");
      assert.equal(eu.dados.licenca.situacao, "ativo");
      assert.match(eu.dados.licenca.mensagem, /demonstração/i);
    }
    assert.equal((await t.chamar("GET", "/demo/entrar?papel=hacker", undefined, { redirecionar: false })).status, 400);

    const contagem = (await t.chamar("GET", "/api/conversas/contagem")).dados;
    assert.ok(contagem.aguardando >= 3, "fila de atendimento");
    const contatos = (await t.chamar("GET", "/api/contatos")).dados;
    assert.ok(contatos.total >= 60 && contatos.itens.every((c) => /^553499999\d{4}$/.test(c.wa_id)), "telefones fictícios 99999-xxxx");
    assert.ok((await t.chamar("GET", "/api/tags")).dados.length >= 5, "etiquetas");
    const campanhas = (await t.chamar("GET", "/api/campanhas")).dados;
    assert.ok(campanhas.some((c) => c.status === "concluida" && c.enviados > 40 && c.respondidos > 5));
    const m = (await t.chamar("GET", "/api/metricas?dias=7")).dados;
    assert.ok(m.conversas.total > 20 && m.automacao > 50 && m.mensagens.pela_ia > 0);

    const html = await t.chamar("GET", "/");
    assert.ok(html.dados.includes("/demo/faixa.js") && !html.dados.includes("fonts.googleapis.com"));
  });

  test("(c) nenhuma chamada sai para host externo: a trava lança e a IA responde pelo simulador", async () => {
    assert.equal(globalThis.fetch.travaDemo, true);
    for (const url of ["https://api.anthropic.com/v1/messages", "https://graph.facebook.com/v23.0/me", "https://central.nexorconsultingit.com.br/api/v1/sincronizar", "https://www.asaas.com/api"]) {
      await assert.rejects(() => fetch(url), RedeBloqueada, url);
    }
    // A Central não é chamada: sincronizar responde localmente
    assert.equal((await t.app.central.sincronizar()).ok, false);

    const r = await t.chamar("POST", "/api/demo/receber", { texto: "Oi, quanto custa uma limpeza?" });
    assert.equal(r.status, 200);
    assert.ok(r.dados.conversa_id);
    const resposta = await esperar(async () => (await t.chamar("GET", "/api/demo/mensagens?para=5534999997001")).dados[0]);
    assert.match(resposta.texto, /R\$ 180/);
    assert.deepEqual(resposta.opcoes, ["Ver horários", "Tirar outra dúvida"]);
    const conversa = (await t.chamar("GET", `/api/conversas/${r.dados.conversa_id}`)).dados;
    assert.ok(conversa.mensagens.some((x) => x.autor === "ia" && /R\$ 180/.test(x.texto ?? "")));

    // Fluxo completo: horários → escolha → agendado
    await t.chamar("POST", "/api/demo/receber", { texto: "Ver horários" });
    const horarios = await esperar(async () => (await t.chamar("GET", "/api/demo/mensagens?para=5534999997001")).dados.find((x) => /Tenho estes horários/.test(x.texto)));
    await t.chamar("POST", "/api/demo/receber", { texto: horarios.opcoes[0] });
    await esperar(async () => (await t.chamar("GET", "/api/demo/mensagens?para=5534999997001")).dados.find((x) => /Prontinho/.test(x.texto)));

    // Urgência vai para a fila com prioridade alta
    await t.chamar("POST", "/api/demo/receber", { de: "5534999990042", texto: "Estou com muita dor no dente", nome: "Teste Urgência" });
    await esperar(async () => (await t.chamar("GET", "/api/conversas?filtro=aguardando")).dados.find((c) => c.contato_wa_id === "5534999990042" && c.prioridade === "alta"));
  });

  test("(d) reiniciar volta os dados ao estado original", async () => {
    const antes = t.app.repo.db.prepare("SELECT COUNT(*) n FROM contatos").get().n;
    assert.ok(t.app.repo.contatoPorWa("demo-clinica-sorriso", "5534999997001"), "contato criado na demo");
    assert.ok(t.app.demo.enviadas.length > 0);
    const r = await t.chamar("POST", "/api/demo/reiniciar");
    assert.deepEqual(r.dados, { ok: true });
    assert.equal(t.app.repo.contatoPorWa("demo-clinica-sorriso", "5534999997001"), undefined);
    assert.ok(t.app.repo.db.prepare("SELECT COUNT(*) n FROM contatos").get().n < antes);
    assert.equal(t.app.demo.enviadas.length, 0);
    // A sessão caiu com o reinício: entra de novo
    assert.equal((await t.chamar("GET", "/api/eu")).status, 401);
    await t.chamar("GET", "/demo/entrar?papel=dono", undefined, { redirecionar: false });
    assert.equal((await t.chamar("GET", "/api/eu")).status, 200);
    // Sem o cabeçalho do painel, a ação é recusada (CSRF)
    const sem = await fetch(`${t.base}/api/demo/reiniciar`, { method: "POST" });
    assert.equal(sem.status, 403);
  });

  test("(e) escuta só em 127.0.0.1 (a menos de DEMO_PUBLICO=1)", () => {
    assert.equal(hostDeEscuta(t.cfg), "127.0.0.1");
    assert.equal(t.app.servidor.address().address, "127.0.0.1");
    assert.equal(hostDeEscuta(lerConfig({ DEMO: "1", DEMO_PUBLICO: "1" })), undefined);
    assert.equal(lerConfig({ DEMO: "1" }).pastaDados, "./data-demo");
    assert.ok(lerConfig({ DEMO: "1" }).chaveMestra);
  });
});
