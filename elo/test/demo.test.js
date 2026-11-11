/* Modo Demonstração: só existe com DEMO=1, semeia a rede fictícia, não deixa nada sair da máquina,
   escuta só em loopback, entra por papel e reinicia. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { lerConfig } from "../src/config.js";
import { subirDemo } from "../src/servidor.js";
import { subir } from "./ajuda.js";

test("Demo: sem DEMO=1 as rotas de demonstração não existem (404)", async () => {
  const s = await subir();
  try {
    const c = s.cliente();
    assert.equal((await c.get("/api/demo")).status, 404);
    assert.equal((await c.get("/demo")).status, 404);
    assert.equal((await c.get("/demo/entrar?papel=fornecedor_dono")).status, 404);
    assert.equal((await c.post("/api/demo/reiniciar")).status, 404);
    assert.equal((await c.post("/api/demo/pagar")).status, 404);
    assert.equal(lerConfig({}).demo, false);
    assert.equal(lerConfig({}).porta, 8796);
  } finally {
    s.fechar();
  }
});

test("Demo: semeia, trava a rede, escuta só em loopback, entra por papel, simula pagamento e reinicia", { timeout: 240_000 }, async () => {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-elo-demo-"));
  const original = globalThis.fetch;
  const cfg = { ...lerConfig({ DEMO: "1", DEMO_RESET: "1", DATA_DIR: pasta }), porta: 0 };
  const app = await subirDemo(cfg, { log: () => {} });
  try {
    const end = app.servidor.address();
    assert.equal(end.address, "127.0.0.1", "só loopback");
    const url = `http://127.0.0.1:${end.port}`;
    for (const host of ["https://api.asaas.com/v3/payments", "https://brasilapi.com.br/api/cnpj/v1/1", "https://graph.facebook.com/v23.0/me", "https://api.focusnfe.com.br/v2/nfe"]) await assert.rejects(() => fetch(host), /conexão externa bloqueada/);

    const info = await (await fetch(`${url}/api/demo`)).json();
    assert.equal(info.demo, true);
    assert.equal(info.sistema, "elo");
    assert.deepEqual(info.papeis.map((p) => p.papel), ["fornecedor_dono", "fornecedor_comercial", "fornecedor_financeiro", "fornecedor2_dono", "instalador_dono", "instalador_tecnico", "nexor", "cliente"]);
    assert.ok(!JSON.stringify(info).includes("@"), "não expõe e-mails");
    assert.equal((await fetch(`${url}/demo`)).status, 200);

    const entrar = async (papel) => {
      const r = await fetch(`${url}/demo/entrar?papel=${papel}`, { redirect: "manual" });
      assert.equal(r.status, 302, papel);
      const cookie = r.headers.getSetCookie()[0]?.split(";")[0];
      return { local: r.headers.get("location"), get: (c) => fetch(url + c, { headers: { cookie } }).then((x) => x.json()), post: (c, b) => fetch(url + c, { method: "POST", headers: { cookie, "x-nexor": "1", "content-type": "application/json" }, body: JSON.stringify(b ?? {}) }) };
    };
    const forn = await entrar("fornecedor_dono");
    const eu = await forn.get("/api/fornecedor/eu");
    assert.equal(eu.conta.razao_social, "Distribuidora Vigia Forte Ltda");
    assert.equal(eu.conta.cidade, "Araguari");
    const painel = await forn.get("/api/fornecedor/painel");
    assert.ok(painel.propostas.paga >= 8, "histórico de vendas pagas");
    assert.ok(painel.propostas.expirada >= 1 && painel.propostas.enviada >= 1 && painel.propostas.vista >= 1 && painel.propostas.aceita >= 1);
    assert.ok(painel.reservas_ativas > 0);
    assert.ok(painel.vinculos_pendentes >= 1);
    assert.ok(painel.financeiro.recebido_split_30d_centavos > 0);
    assert.ok(painel.financeiro.titulos_vencidos >= 1, "Eletro Rocha bloqueado por título vencido");
    assert.ok((await forn.get("/api/fornecedor/vinculos")).some((v) => v.credito.bloqueio_inadimplencia));

    const inst = await entrar("instalador_dono");
    const pi = await inst.get("/api/instalador/painel");
    assert.ok(pi.os_abertas >= 2 && pi.contratos_ativos === 2);
    assert.ok((await inst.get("/api/instalador/os")).some((o) => o.status === "em_execucao"));
    assert.ok((await inst.get("/api/instalador/titulos")).length >= 1);
    const cmp = await inst.get("/api/instalador/comparar?codigo=CAM-BL-1080");
    assert.equal(cmp.length, 2, "comparador com os dois fornecedores");
    const tec = await entrar("instalador_tecnico");
    assert.ok((await tec.get("/api/instalador/os")).length >= 2);
    assert.equal((await entrar("nexor")).local, "/#/nexor");
    for (const p of ["fornecedor_comercial", "fornecedor_financeiro", "fornecedor2_dono"]) await entrar(p);
    const cli = await entrar("cliente");
    assert.match(cli.local, /^\/p\/[\w-]+$/);
    const prop = await (await fetch(`${url}/api/publico${cli.local.replace("/p/", "/propostas/")}`)).json();
    assert.ok(prop.total_centavos > 0);

    // Simular o Asaas avisando o pagamento da cobrança em aberto
    const pagasAntes = painel.propostas.paga;
    assert.equal((await fetch(`${url}/api/demo/pagar`, { method: "POST" })).status, 403, "exige o cabeçalho anti-CSRF");
    assert.equal((await forn.post("/api/demo/pagar")).status, 200);
    assert.equal((await forn.get("/api/fornecedor/painel")).propostas.paga, pagasAntes + 1);
    const msgs = await (await fetch(`${url}/api/demo/mensagens`)).json();
    assert.ok(msgs.some((m) => m.canal === "asaas"));

    // Reiniciar volta ao retrato original
    assert.equal((await forn.post("/api/demo/reiniciar")).status, 200);
    const forn2 = await entrar("fornecedor_dono");
    assert.equal((await forn2.get("/api/fornecedor/painel")).propostas.paga, pagasAntes);
  } finally {
    app.fechar();
    globalThis.fetch = original;
    rmSync(pasta, { recursive: true, force: true });
  }
});
