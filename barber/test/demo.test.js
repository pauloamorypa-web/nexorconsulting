/* Modo Demonstração: só existe com DEMO=1, monta a Barbearia Navalha, não deixa nada sair da máquina e reinicia. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { lerConfig } from "../src/config.js";
import { subirDemo } from "../src/servidor.js";
import { criarCliente, subir } from "./ajuda.js";

test("Demo: sem DEMO=1 as rotas de demonstração não existem (404)", async () => {
  const s = await subir();
  try {
    const c = s.cliente();
    assert.equal((await c.get("/api/demo")).status, 404);
    assert.equal((await c.get("/demo/entrar?papel=dono")).status, 404);
    assert.equal((await c.post("/api/demo/reiniciar")).status, 404);
    assert.equal(lerConfig({}).demo, false);
  } finally {
    s.fechar();
  }
});

test("Demo: semeia, entra por papel, trava a rede, escuta só nesta máquina e reinicia", { timeout: 240_000 }, async () => {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-barber-demo-"));
  const original = globalThis.fetch;
  const cfg = { ...lerConfig({ DEMO: "1", DEMO_RESET: "1", DATA_DIR: pasta }), porta: 0 };
  const app = await subirDemo(cfg, { log: () => {} });
  try {
    const end = app.servidor.address();
    assert.equal(end.address, "127.0.0.1", "só loopback");
    const url = `http://127.0.0.1:${end.port}`;
    // A trava recusa qualquer host externo, mesmo que algum caminho esquecido chame o fetch global
    await assert.rejects(() => fetch("https://api.asaas.com/v3/payments"), /conexão externa bloqueada/);
    await assert.rejects(() => fetch("https://graph.facebook.com/v23.0/me"), /conexão externa bloqueada/);

    const info = await (await fetch(`${url}/api/demo`)).json();
    assert.equal(info.demo, true);
    assert.deepEqual(info.papeis.map((p) => p.papel), ["dono", "recepcao", "barbeiro", "cliente"]);
    assert.ok(!JSON.stringify(info).includes("@"), "não expõe e-mails nem senhas");

    // As páginas da demonstração não buscam nada fora (fontes do Google removidas)
    for (const pag of ["/", "/app/"]) assert.ok(!(await (await fetch(url + pag)).text()).includes("fonts.g"), `sem fontes externas em ${pag}`);
    // Entrar como dono: cookie de sessão e painel com dados vivos
    const r = await fetch(`${url}/demo/entrar?papel=dono`, { redirect: "manual" });
    assert.equal(r.status, 302);
    const dono = criarCliente(url);
    const cookie = r.headers.getSetCookie()[0].split(";")[0];
    const get = (c) => fetch(url + c, { headers: { cookie } }).then((x) => x.json());
    const eu = await get("/api/eu");
    assert.equal(eu.usuario.papel, "dono");
    assert.equal(eu.barbearia.nome, "Barbearia Navalha");
    const hoje = await get("/api/hoje");
    assert.ok(hoje.agendamentos.length >= 10, "agenda de hoje cheia");
    const clube = await get("/api/assinaturas");
    assert.ok(clube.resumo.ativas >= 10);
    // Barbeiro vê só a própria agenda; cliente entra no app
    const rb = await fetch(`${url}/demo/entrar?papel=barbeiro`, { redirect: "manual" });
    const eub = await fetch(`${url}/api/eu`, { headers: { cookie: rb.headers.getSetCookie()[0].split(";")[0] } }).then((x) => x.json());
    assert.equal(eub.usuario.papel, "barbeiro");
    const rc = await fetch(`${url}/demo/entrar?papel=cliente`, { redirect: "manual" });
    assert.equal(rc.headers.get("location"), "/app/#inicio");
    const euc = await fetch(`${url}/api/app/eu`, { headers: { cookie: rc.headers.getSetCookie()[0].split(";")[0] } }).then((x) => x.json());
    assert.equal(euc.cliente?.nome ?? euc.nome, "Lucas Andrade");

    // Simular o pagamento do Asaas: a assinatura pendente vira ativa
    const pendentesAntes = clube.resumo.pendentes;
    const post = (c, b) => fetch(url + c, { method: "POST", headers: { "x-nexor": "1", "content-type": "application/json", cookie }, body: JSON.stringify(b ?? {}) });
    assert.equal((await fetch(`${url}/api/demo/pagar`, { method: "POST" })).status, 403, "exige o cabeçalho anti-CSRF");
    assert.equal((await post("/api/demo/pagar")).status, 200);
    assert.equal((await get("/api/assinaturas")).resumo.pendentes, pendentesAntes - 1);
    // Mensagem chegando pelo WhatsApp: passa pelo webhook real e a resposta sai pelo simulador
    assert.equal((await post("/api/demo/receber", { de: "5534999123456", texto: "Oi, tem horário?" })).status, 200);
    await new Promise((ok) => setTimeout(ok, 300));
    const msgs = await (await fetch(`${url}/api/demo/mensagens`)).json();
    assert.ok(msgs.some((m) => m.canal === "whatsapp" && m.para === "5534999123456" && /app/.test(m.texto)));

    // Reiniciar: volta ao retrato original (a pendente volta a ficar pendente)
    assert.equal((await post("/api/demo/reiniciar")).status, 200);
    const r2 = await fetch(`${url}/demo/entrar?papel=dono`, { redirect: "manual" });
    const c2 = r2.headers.getSetCookie()[0].split(";")[0];
    const depois = await fetch(`${url}/api/assinaturas`, { headers: { cookie: c2 } }).then((x) => x.json());
    assert.equal(depois.resumo.pendentes, pendentesAntes);
    void dono;
  } finally {
    app.fechar();
    globalThis.fetch = original;
    rmSync(pasta, { recursive: true, force: true });
  }
});
