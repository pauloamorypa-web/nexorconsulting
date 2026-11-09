/* LGPD no Barber: aceite de termos, opt-in de marketing (painel, app e SAIR/PARAR), exportação e exclusão de
   cliente com bloqueio do fiscal, isolamento entre barbearias e expurgo por prazo. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { barbeariaPronta, clienteApp, subir } from "./ajuda.js";

test("termos: cadastro exige aceite e grava versão, data e IP; nova versão pede o aceite de novo", async () => {
  const s = await subir();
  try {
    const dono = s.cliente();
    assert.equal((await dono.post("/api/cadastro", { barbearia: "Navalha", nome: "Rafael", email: "r@n.test", senha: "senha-forte-1" })).status, 400);
    assert.equal((await dono.post("/api/cadastro", { aceite_termos: true, barbearia: "Navalha", nome: "Rafael", email: "r@n.test", senha: "senha-forte-1" })).status, 200);
    assert.equal((await dono.get("/api/eu")).dados.termos.pendente, false);
    const aceites = (await dono.get("/api/lgpd/aceites")).dados;
    assert.equal(aceites[0].versao, s.app.cfg.termos.versao);
    assert.equal(aceites[0].origem, "cadastro");
    assert.ok(aceites[0].ip);
    s.app.cfg.termos.versao = "2099-01-01";
    assert.equal((await dono.get("/api/clientes")).status, 428);
    assert.equal((await dono.get("/api/eu")).dados.termos.pendente, true);
    assert.equal((await dono.post("/api/termos/aceite", { aceito: true })).status, 200);
    assert.equal((await dono.get("/api/clientes")).status, 200);
  } finally {
    s.fechar();
  }
});

test("opt-in de marketing: desmarcado por padrão; painel e app gravam data e origem; SAIR/PARAR retira", async () => {
  const s = await subir();
  try {
    const { dono } = await barbeariaPronta(s);
    const c = (await dono.post("/api/clientes", { nome: "Pedro", fone: "34 99999-0002" })).dados;
    assert.equal(c.marketing_optin, false);
    const m = (await dono.put(`/api/clientes/${c.id}`, { marketing_optin: true })).dados;
    assert.equal(m.marketing_optin, true);
    assert.equal(m.marketing_optin_origem, "painel: Rafael Dono");
    assert.ok(m.marketing_optin_em);
    assert.equal(s.app.nucleo.mensagemRecebida("5534999990002", "ok, obrigado"), false);
    assert.equal(s.app.nucleo.mensagemRecebida("5534999990002", "PARAR"), true);
    let depois = s.app.repo.obter("clientes", c.id);
    assert.equal(depois.marketing_optin, false);
    assert.match(depois.marketing_optin_origem, /WhatsApp: respondeu "PARAR"/);
    // O cliente marca no app
    const lucas = await clienteApp(s);
    await lucas.put("/api/app/eu", { marketing_optin: true });
    const l = (await dono.get("/api/clientes")).dados.find((x) => x.nome === "Lucas Cliente");
    assert.equal(l.marketing_optin, true);
    assert.equal(l.marketing_optin_origem, "app do cliente");
    s.app.nucleo.mensagemRecebida("553499990001", "Sair"); // sem o 9: mesmo número
    depois = s.app.repo.obter("clientes", l.id);
    assert.equal(depois.marketing_optin, false);
  } finally {
    s.fechar();
  }
});

test("exportar e excluir cliente: JSON completo; vendas ficam bloqueadas, o cadastro é anonimizado", async () => {
  const s = await subir();
  try {
    const { dono, corte, rafael } = await barbeariaPronta(s);
    const lucas = await clienteApp(s);
    const a = (await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-10", hora: "10:00" })).dados;
    const cli = (await dono.get("/api/clientes")).dados.find((x) => x.nome === "Lucas Cliente");
    assert.equal((await dono.post(`/api/lgpd/titulares/cliente/${cli.id}/excluir`, { confirmar: true })).status, 409, "tem horário marcado");
    s.agora.ir("2026-11-10T10:45:00-03:00");
    assert.equal((await dono.post(`/api/agendamentos/${a.id}/concluir`, { forma: "pix" })).status, 200);

    const exp = await dono.post(`/api/lgpd/titulares/cliente/${cli.id}/exportar`);
    assert.equal(exp.status, 200);
    assert.equal(exp.dados.dados.cadastro[0].fone, "5534999990001");
    assert.equal(exp.dados.dados.agendamentos.length, 1);
    assert.equal(exp.dados.dados.vendas.length, 1);

    const r = await dono.post(`/api/lgpd/titulares/cliente/${cli.id}/excluir`, { confirmar: true });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    const vendas = r.dados.bloqueados.find((b) => b.parte === "vendas");
    assert.equal(vendas.categoria, "fiscal");
    assert.equal(vendas.guardar_ate, "2031-11-10");
    const c = s.app.repo.obter("clientes", cli.id);
    assert.equal(c.nome, "Cliente removido (LGPD)");
    assert.equal(c.fone, null);
    assert.equal(c.ativo, false);
    assert.equal(c.lgpd_bloqueado_ate, "2031-11-10");
    assert.equal(s.app.repo.um("SELECT COUNT(*) n FROM vendas WHERE cliente_id = ?", cli.id).n, 1, "venda continua");
    assert.equal((await lucas.get("/api/app/eu")).status, 401, "sessão do app encerrada");
    const pedidos = (await dono.get("/api/lgpd/pedidos")).dados;
    assert.deepEqual(pedidos.slice(0, 2).map((p) => p.tipo), ["exclusao", "exportacao"]);
    assert.equal(pedidos[0].autor, "Rafael Dono");
    assert.ok((await dono.get("/api/auditoria")).dados.some((x) => x.acao === "lgpd_exclusao"));
  } finally {
    s.fechar();
  }
});

test("barbearia A não exporta nem apaga cliente da barbearia B; barbeiro não acessa", async () => {
  const s = await subir();
  try {
    const { dono, bruno } = await barbeariaPronta(s);
    const outra = s.app.repo.inserir("barbearias", { nome: "Outra Barbearia", config: {} });
    const deOutra = s.app.repo.inserir("clientes", { barbearia_id: outra.id, nome: "Zeca", fone: "5534988887777" });
    assert.equal((await dono.post(`/api/lgpd/titulares/cliente/${deOutra.id}/exportar`)).status, 404);
    assert.equal((await dono.post(`/api/lgpd/titulares/cliente/${deOutra.id}/excluir`, { confirmar: true })).status, 404);
    assert.equal(s.app.repo.obter("clientes", deOutra.id).nome, "Zeca");
    await dono.post("/api/usuarios", { nome: "Bruno", email: "bruno@navalha.test", senha: "senha-bruno-1", papel: "barbeiro", barbeiro_id: bruno.id });
    const br = s.cliente();
    await br.post("/api/entrar", { email: "bruno@navalha.test", senha: "senha-bruno-1" });
    await br.post("/api/termos/aceite", { aceito: true });
    const meu = (await dono.post("/api/clientes", { nome: "Pedro" })).dados;
    assert.equal((await br.post(`/api/lgpd/titulares/cliente/${meu.id}/exportar`)).status, 403);
    assert.equal((await br.post(`/api/lgpd/titulares/cliente/${meu.id}/excluir`, { confirmar: true })).status, 403);
  } finally {
    s.fechar();
  }
});

test("expurgo: cliente sem visita há 24 meses é anonimizado; recente fica; registro de envios velho sai", async () => {
  const s = await subir();
  try {
    const { dono } = await barbeariaPronta(s);
    const b = s.app.repo.barbearia();
    const velho = s.app.repo.inserir("clientes", { barbearia_id: b.id, nome: "Antigo", fone: "5534977776666", ultima_visita: "2024-05-01" });
    const recente = s.app.repo.inserir("clientes", { barbearia_id: b.id, nome: "Recente", fone: "5534977775555", ultima_visita: "2026-09-01" });
    const ha3anos = Date.parse("2023-11-01T12:00:00Z");
    s.app.repo.rodar("UPDATE clientes SET criado_em = ? WHERE id IN (?, ?)", ha3anos, velho.id, recente.id);
    s.app.repo.inserir("envios", { barbearia_id: b.id, cliente_id: recente.id, canal: "whatsapp", motivo: "retorno", status: "enviado", criado_em: ha3anos });
    const r = (await dono.post("/api/lgpd/expurgo")).dados;
    assert.equal(r.resultado.cliente_inativo, 1);
    assert.ok(r.resultado.registro_de_envios >= 1);
    assert.equal(s.app.repo.obter("clientes", velho.id).nome, "Cliente removido (LGPD)");
    assert.equal(s.app.repo.obter("clientes", recente.id).nome, "Recente");
    assert.equal((await dono.get("/api/lgpd/prazos")).dados.fiscal.acao, "bloquear");
    // A rotina chama o expurgo (uma vez por dia)
    s.agora.avancar(86400_000);
    assert.equal(typeof (await s.app.rotina()).lgpd, "number");
    assert.equal((await dono.get("/api/lgpd/expurgo")).dados.length, 2);
  } finally {
    s.fechar();
  }
});
