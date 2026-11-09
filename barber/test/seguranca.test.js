/* Permissões por papel, isolamento entre clientes do app, CSRF, segredos e webhooks. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { barbeariaPronta, clienteApp, subir } from "./ajuda.js";

test("papéis: barbeiro só mexe no que é dele, recepção não vê relatórios nem configura", async () => {
  const s = await subir();
  try {
    const { dono, corte, rafael, bruno } = await barbeariaPronta(s);
    assert.equal((await dono.post("/api/usuarios", { nome: "Bruno", email: "bruno@navalha.test", senha: "senha-bruno-1", papel: "barbeiro", barbeiro_id: bruno.id })).status, 200);
    assert.equal((await dono.post("/api/usuarios", { nome: "Carla", email: "carla@navalha.test", senha: "senha-carla-1", papel: "recepcao" })).status, 200);
    const br = s.cliente();
    await br.post("/api/entrar", { email: "bruno@navalha.test", senha: "senha-bruno-1" });
    await br.post("/api/termos/aceite", { aceito: true });
    const rec = s.cliente();
    await rec.post("/api/entrar", { email: "carla@navalha.test", senha: "senha-carla-1" });
    await rec.post("/api/termos/aceite", { aceito: true });

    const lucas = await clienteApp(s);
    const doRafael = (await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-11", hora: "09:00" })).dados;
    const hojeBruno = (await br.get("/api/hoje?dia=2026-11-11")).dados;
    assert.equal(hojeBruno.agendamentos.length, 0, "não vê a agenda do Rafael");
    assert.equal(hojeBruno.resumo.faturado_centavos, null);
    assert.equal((await br.put(`/api/agendamentos/${doRafael.id}`, { status: "faltou" })).status, 403);
    assert.equal((await br.post(`/api/agendamentos/${doRafael.id}/concluir`, { forma: "pix" })).status, 403);
    // Agenda para si mesmo, mesmo pedindo outro barbeiro
    const meu = await br.post("/api/agendamentos", { cliente: { nome: "Walk-in" }, servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-11", hora: "09:00" });
    assert.equal(meu.dados.barbeiro.nome, "Bruno");
    // Folga só dele; não muda a comissão
    const folga = await br.post("/api/bloqueios", { barbeiro_id: rafael.id, dia: "2026-11-12", de: "09:00", ate: "12:00", motivo: "médico" });
    assert.equal(folga.dados.bloqueio.barbeiro_id, bruno.id);
    await br.put(`/api/barbeiros/${bruno.id}`, { comissao_servico: 100, bio: "Degradê" });
    const eu = (await dono.get("/api/barbeiros")).dados.find((x) => x.id === bruno.id);
    assert.equal(eu.comissao_servico, 50);
    assert.equal(eu.bio, "Degradê");
    assert.equal((await br.put(`/api/barbeiros/${rafael.id}`, { bio: "x" })).status, 403);
    assert.equal((await br.get("/api/relatorios")).status, 403);
    assert.equal((await br.get("/api/caixa")).status, 403);

    assert.equal((await rec.get("/api/relatorios")).status, 403);
    assert.equal((await rec.put("/api/config", { nome: "X" })).status, 403);
    assert.equal((await rec.get("/api/caixa")).status, 200);
    assert.equal((await rec.post("/api/clientes", { nome: "Novo", fone: "34 98888-1111" })).status, 200);
  } finally {
    s.fechar();
  }
});

test("app: um cliente não mexe no horário do outro; limites e regras de cancelamento", async () => {
  const s = await subir();
  try {
    const { corte, rafael } = await barbeariaPronta(s);
    const lucas = await clienteApp(s);
    const pedro = await clienteApp(s, "34999990002", "Pedro");
    const a = (await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-10", hora: "11:00" })).dados;
    assert.equal((await pedro.post(`/api/app/agendamentos/${a.id}/cancelar`)).status, 404);
    assert.equal((await pedro.get(`/api/app/agendamentos/${a.id}/ics`)).status, 404);
    s.agora.ir("2026-11-10T09:30:00-03:00");
    assert.equal((await lucas.post(`/api/app/agendamentos/${a.id}/cancelar`)).status, 409, "menos de 2 h antes");
    assert.equal((await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-10", hora: "09:45" })).status, 409, "antecedência mínima");
    for (const dia of ["2026-11-11", "2026-11-12"]) assert.equal((await lucas.post("/api/app/agendar", { servico_id: corte.id, dia, hora: "15:00" })).status, 200);
    assert.equal((await lucas.post("/api/app/agendar", { servico_id: corte.id, dia: "2026-11-13", hora: "15:00" })).status, 409, "no máximo 3 futuros");
    const resto = await lucas.post("/api/app/agendar", { servico_id: corte.id, dia: "2026-11-11", hora: "16:00" });
    assert.equal(resto.status, 409);
  } finally {
    s.fechar();
  }
});

test("CSRF, segredos fora das respostas e webhooks assinados", async () => {
  const s = await subir();
  try {
    const { dono } = await barbeariaPronta(s);
    const semCabecalho = await fetch(`${s.url}/api/app/codigo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fone: "34999990001", canal: "sms" }) });
    assert.equal(semCabecalho.status, 403);
    const conf = (await dono.get("/api/config")).dados.config;
    assert.equal(conf.whatsapp.token, true);
    assert.equal(conf.whatsapp.token_cripto, undefined);
    assert.equal(conf.sms.token_cripto, undefined);
    assert.ok(!JSON.stringify(await dono.get("/api/eu")).includes("tk-meta"));
    // Salvar sem mexer no token mantém o token
    await dono.put("/api/canais", { whatsapp: { token: "", id_numero: "999" } });
    assert.equal((await dono.post("/api/canais/testar", { canal: "whatsapp", fone: "34999990001" })).status, 200);
    assert.equal(s.rede.whatsapp.at(-1).to, "5534999990001");

    const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "5534911112222", type: "text", text: { body: "oi" } }] } }] }] });
    const assinar = (seg) => "sha256=" + createHmac("sha256", seg).update(corpo).digest("hex");
    const w = (assinatura) => fetch(`${s.url}/webhook/whatsapp`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": assinatura }, body: corpo });
    assert.equal((await w(assinar("errado"))).status, 401);
    const antes = s.rede.whatsapp.length;
    assert.equal((await w(assinar("seg-meta"))).status, 200);
    await s.app.ocioso();
    await new Promise((ok) => setTimeout(ok, 20));
    assert.match(s.rede.whatsapp.at(-1).text.body, /agenda\.teste\/app\//, "responde com o link do app");
    await w(assinar("seg-meta"));
    await s.app.ocioso();
    assert.equal(s.rede.whatsapp.length, antes + 1, "uma resposta por dia");
    const verif = (await dono.get("/api/config")).dados.config.whatsapp.verificacao;
    const v = await fetch(`${s.url}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${verif}&hub.challenge=42`);
    assert.equal(await v.text(), "42");
    assert.equal((await fetch(`${s.url}/webhook/asaas`, { method: "POST", body: "{}" })).status, 401);
  } finally {
    s.fechar();
  }
});

test("primeiro acesso: só uma barbearia e código de instalação em produção", async () => {
  const s = await subir({ cfg: { codigoInstalacao: "ABCD1234" } });
  try {
    const c = s.cliente();
    assert.equal((await c.get("/api/estado")).dados.exigeCodigo, true);
    assert.equal((await c.post("/api/cadastro", { aceite_termos: true, barbearia: "X", nome: "Y", email: "y@y.test", senha: "senha-forte-1" })).status, 403);
    assert.equal((await c.post("/api/cadastro", { aceite_termos: true, barbearia: "X", nome: "Y", email: "y@y.test", senha: "senha-forte-1", codigo_instalacao: "ABCD1234" })).status, 200);
    assert.equal((await s.cliente().post("/api/cadastro", { aceite_termos: true, barbearia: "Z", nome: "Z", email: "z@z.test", senha: "senha-forte-1", codigo_instalacao: "ABCD1234" })).status, 403);
    assert.equal((await s.cliente().post("/api/entrar", { email: "y@y.test", senha: "errada-123" })).status, 401);
  } finally {
    s.fechar();
  }
});
