/* Regressões da Banca de Testes (veredito de 2026-11-10). Um teste por item V-xx. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { abrirBanco } from "../src/db.js";
import { barbeariaPronta, clienteApp, subir } from "./ajuda.js";

/** Cria um acesso e devolve o cliente HTTP já logado */
async function acesso(s, dono, dados) {
  const r = await dono.post("/api/usuarios", { senha: "senha-forte-2", ...dados });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const c = s.cliente();
  assert.equal((await c.post("/api/entrar", { email: dados.email, senha: dados.senha ?? "senha-forte-2" })).status, 200);
  return { c, usuario: r.dados };
}

test("V-07: admin não troca a senha nem altera a conta do dono; o dono troca a própria senha com a senha atual", async () => {
  const s = await subir();
  try {
    const { dono } = await barbeariaPronta(s);
    const { c: adm, usuario: uAdm } = await acesso(s, dono, { nome: "Adm", email: "adm@t.test", papel: "admin" });
    const d = (await adm.get("/api/usuarios")).dados.find((u) => u.papel === "dono");
    assert.equal((await adm.put(`/api/usuarios/${d.id}`, { senha: "tomada-123456" })).status, 403, "admin não troca a senha do dono");
    assert.equal((await adm.put(`/api/usuarios/${d.id}`, { nome: "Outro nome" })).status, 403, "admin não altera o dono");
    assert.equal((await s.cliente().post("/api/entrar", { email: "dono@navalha.test", senha: "tomada-123456" })).status, 401);
    assert.equal((await dono.get("/api/eu")).status, 200, "a sessão do dono continua");
    // Admin ainda administra os outros acessos
    const { usuario: uRec } = await acesso(s, dono, { nome: "Rec", email: "rec@t.test", papel: "recepcao" });
    assert.equal((await adm.put(`/api/usuarios/${uRec.id}`, { senha: "nova-senha-rec-1" })).status, 200);
    // Ninguém troca a própria senha por esta rota (precisa da senha atual)
    assert.equal((await adm.put(`/api/usuarios/${uAdm.id}`, { senha: "outra-senha-1" })).status, 400);
    // Troca da própria senha pede a senha atual
    assert.equal((await dono.put("/api/eu/senha", { atual: "errada-0000", nova: "senha-nova-dono-1" })).status, 400);
    assert.equal((await dono.put("/api/eu/senha", { atual: "senha-forte-1", nova: "senha-nova-dono-1" })).status, 200);
    assert.equal((await s.cliente().post("/api/entrar", { email: "dono@navalha.test", senha: "senha-nova-dono-1" })).status, 200);
    assert.equal((await dono.get("/api/eu")).status, 200, "a sessão atual continua depois de trocar a própria senha");
  } finally {
    s.fechar();
  }
});

test("V-03: token do webhook do Asaas e verificação do WhatsApp só para dono e admin, cifrados e gerados no servidor", async () => {
  const s = await subir();
  try {
    const { dono, bruno } = await barbeariaPronta(s);
    const conf = (await dono.put("/api/canais", { asaas: { chave: "$aact_teste", ambiente: "sandbox", token_webhook: "curto" } })).dados;
    const tok = conf.asaas.token_webhook;
    assert.equal(typeof tok, "string");
    assert.ok(tok.length >= 24, "token gerado no servidor, com 24+ caracteres");
    assert.notEqual(tok, "curto", "token mandado pelo painel é ignorado");
    const verif = conf.whatsapp.verificacao;
    assert.equal(typeof verif, "string");
    const { c: rec } = await acesso(s, dono, { nome: "Rec", email: "rec@t.test", papel: "recepcao" });
    const { c: bar } = await acesso(s, dono, { nome: "Bar", email: "bar@t.test", papel: "barbeiro", barbeiro_id: bruno.id });
    for (const quem of [rec, bar, dono]) {
      for (const rota of ["/api/config", "/api/eu"]) {
        const txt = JSON.stringify((await quem.get(rota)).dados);
        assert.ok(!txt.includes(tok), `${rota} não traz o token do Asaas`);
        assert.ok(!txt.includes(verif), `${rota} não traz a verificação do WhatsApp`);
      }
    }
    assert.equal((await rec.get("/api/canais")).status, 403);
    assert.equal((await bar.get("/api/canais")).status, 403);
    const adm = (await dono.get("/api/canais")).dados;
    assert.equal(adm.asaas.token_webhook, tok);
    assert.equal(adm.whatsapp.verificacao, verif);
    // Gravado cifrado
    const bruto = s.app.repo.um("SELECT config FROM barbearias").config;
    assert.ok(!bruto.includes(tok), "o token não fica em texto puro no banco");
    // Webhook aceita o token certo
    const enviar = (t) => fetch(`${s.url}/webhook/asaas`, { method: "POST", headers: { "content-type": "application/json", "asaas-access-token": t }, body: JSON.stringify({ event: "PAYMENT_CREATED", payment: { id: "pay_x" } }) });
    assert.equal((await enviar(tok)).status, 200);
    assert.equal((await enviar("false")).status, 401);
    // Gerar um token novo invalida o antigo
    const novo = (await dono.put("/api/canais", { asaas: { novo_token_webhook: true } })).dados.asaas.token_webhook;
    assert.notEqual(novo, tok);
    assert.equal((await enviar(tok)).status, 401);
    assert.equal((await enviar(novo)).status, 200);

    // Banco antigo: token em texto puro é cifrado na migração; token curto é trocado
    const migrar = (asaas) => {
      const b = s.app.repo.barbearia();
      s.app.repo.atualizar("barbearias", b.id, { config: { ...b.config, asaas } });
      s.app.nucleo.migrarConfig();
      s.app.nucleo.migrarConfig(); // idempotente
      return s.app.repo.barbearia().config.asaas;
    };
    const antigo = "abcdefghijklmnopqrstuvwxyz0123";
    const a1 = migrar({ chave_cripto: "", token_webhook: antigo });
    assert.equal(a1.token_webhook, undefined);
    assert.equal((await dono.get("/api/canais")).dados.asaas.token_webhook, antigo);
    assert.equal((await enviar(antigo)).status, 200);
    const a2 = migrar({ token_webhook: "false" });
    assert.equal(a2.token_webhook, undefined);
    assert.ok((await dono.get("/api/canais")).dados.asaas.token_webhook.length >= 24);
    assert.equal((await enviar("false")).status, 401);
  } finally {
    s.fechar();
  }
});

test("V-01: comanda fechada duas vezes ao mesmo tempo gera uma venda só; cancelar não passa por cima do concluído", async () => {
  const s = await subir();
  try {
    const { dono, corte, rafael } = await barbeariaPronta(s);
    const { c: rec } = await acesso(s, dono, { nome: "Rec", email: "rec@t.test", papel: "recepcao" });
    const p = (await dono.post("/api/produtos", { nome: "Pomada", preco_centavos: 3000, estoque: 5 })).dados;
    const lucas = await clienteApp(s);
    const a = (await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-10", hora: "10:00" })).dados;
    s.agora.ir("2026-11-10T10:45:00-03:00");
    const corpo = { forma: "pix", produtos: [{ id: p.id, quantidade: 1 }] };
    // Corpo lento: as quatro requisições chegam antes de qualquer uma terminar (celular com rede ruim)
    const pedidos = [dono.lenta("POST", `/api/agendamentos/${a.id}/concluir`, corpo), rec.lenta("POST", `/api/agendamentos/${a.id}/concluir`, corpo), rec.lenta("PUT", `/api/agendamentos/${a.id}`, { status: "cancelado" }), dono.lenta("PUT", `/api/agendamentos/${a.id}`, { status: "faltou" })];
    await new Promise((ok) => setTimeout(ok, 150));
    for (const x of pedidos) x.fim();
    const r = await Promise.all(pedidos.map((x) => x.p));
    assert.deepEqual(r.map((x) => x.status).sort(), [200, 409, 409, 409], JSON.stringify(r.map((x) => [x.status, x.dados.erro])));
    const repo = s.app.repo;
    assert.equal(repo.um("SELECT COUNT(*) n FROM vendas WHERE agendamento_id = ? AND status = 'paga'", a.id).n, 1, "uma venda");
    assert.equal(repo.obter("produtos", p.id).estoque, 4, "estoque baixado uma vez");
    assert.equal(repo.um("SELECT COUNT(*) n FROM comissoes").n, 2, "comissão do serviço e do produto, uma vez cada");
    assert.equal(repo.obter("agendamentos", a.id).status, "concluido");
    // O banco também recusa uma segunda venda paga do mesmo atendimento
    assert.throws(() => repo.inserir("vendas", { barbearia_id: "x", agendamento_id: a.id, subtotal_centavos: 1, total_centavos: 1, forma: "pix", dia: "2026-11-10" }), /UNIQUE/);
  } finally {
    s.fechar();
  }
});

test("V-01: migração do índice único de vendas em banco antigo com venda duplicada não quebra e espera a correção", () => {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-barber-mig-"));
  const arquivo = join(pasta, "barber.db");
  try {
    let repo = abrirBanco(arquivo);
    const b = repo.inserir("barbearias", { nome: "B", config: {} });
    repo.db.exec("DROP INDEX IF EXISTS vendas_agendamento_paga");
    const venda = (id) => repo.inserir("vendas", { id, barbearia_id: b.id, agendamento_id: "ag1", subtotal_centavos: 100, total_centavos: 100, forma: "pix", dia: "2026-11-10" });
    venda("v1");
    venda("v2");
    repo.fechar();
    repo = abrirBanco(arquivo); // não pode quebrar
    assert.equal(repo.um("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'vendas_agendamento_paga'").n, 0, "índice espera a correção");
    assert.ok(repo.um("SELECT 1 FROM auditoria WHERE acao = 'migracao_pendente'"), "a pendência fica na auditoria");
    repo.rodar("UPDATE vendas SET status = 'cancelada' WHERE id = 'v2'");
    repo.fechar();
    repo = abrirBanco(arquivo);
    assert.equal(repo.um("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'vendas_agendamento_paga'").n, 1, "criado depois da correção");
    repo.fechar();
    repo = abrirBanco(arquivo); // idempotente
    repo.fechar();
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("V-02: pagamento manual da assinatura não é registrado duas vezes; com Asaas dá baixa na cobrança aberta", async () => {
  const s = await subir();
  try {
    const { dono, corte } = await barbeariaPronta(s);
    const { c: rec } = await acesso(s, dono, { nome: "Rec", email: "rec@t.test", papel: "recepcao" });
    const plano = (await dono.post("/api/planos", { nome: "Clube", preco_centavos: 8990, itens: [{ servico_id: corte.id, quantidade: 0 }] })).dados;
    const lucas = await clienteApp(s);
    const ass = (await lucas.post("/api/app/assinar", { plano_id: plano.id })).dados;
    const repo = s.app.repo;
    const pagas = (id) => repo.um("SELECT COUNT(*) n FROM cobrancas WHERE assinatura_id = ? AND status = 'paga'", id).n;
    // Duplo envio (dois aparelhos, rede lenta)
    const pedidos = [dono.lenta("POST", `/api/assinaturas/${ass.id}/pagamento`, { forma: "pix" }), rec.lenta("POST", `/api/assinaturas/${ass.id}/pagamento`, { forma: "dinheiro" })];
    await new Promise((ok) => setTimeout(ok, 100));
    for (const x of pedidos) x.fim();
    const r = await Promise.all(pedidos.map((x) => x.p));
    assert.deepEqual(r.map((x) => x.status).sort(), [200, 409], JSON.stringify(r.map((x) => x.dados)));
    assert.equal(pagas(ass.id), 1);
    assert.equal(repo.obter("assinaturas", ass.id).ciclo_fim, "2026-12-09", "o ciclo não estende dois meses");
    // Mesma chave de idempotência (reenvio do mesmo pedido): responde 200 e não duplica
    s.agora.avancar(10 * 60_000);
    const chave = "chave-teste-0000000001";
    assert.equal((await dono.post(`/api/assinaturas/${ass.id}/pagamento`, { forma: "pix", chave })).status, 200);
    assert.equal((await dono.post(`/api/assinaturas/${ass.id}/pagamento`, { forma: "pix", chave })).status, 200);
    assert.equal(pagas(ass.id), 2, "o segundo pagamento de propósito (outro mês) entra uma vez só");

    // Com Asaas: a cobrança aberta lá recebe a baixa (receiveInCash) em vez de nascer outra aqui
    await dono.put("/api/canais", { asaas: { chave: "$aact_teste", ambiente: "sandbox" } });
    const pedro = await clienteApp(s, "34999990002", "Pedro");
    const a2 = (await pedro.post("/api/app/assinar", { plano_id: plano.id, cpf: "529.982.247-25" })).dados;
    assert.equal(repo.um("SELECT COUNT(*) n FROM cobrancas WHERE assinatura_id = ?", a2.id).n, 1, "cobrança aberta do Asaas");
    const pg = await rec.post(`/api/assinaturas/${a2.id}/pagamento`, { forma: "dinheiro" });
    assert.equal(pg.status, 200, JSON.stringify(pg.dados));
    assert.equal(pg.dados.status, "ativa");
    assert.ok(s.rede.asaas.some((x) => x.metodo === "POST" && x.caminho.endsWith("/payments/pay_1/receiveInCash")), "baixa no Asaas");
    assert.equal(repo.um("SELECT COUNT(*) n FROM cobrancas WHERE assinatura_id = ?", a2.id).n, 1, "nenhuma cobrança nova");
    assert.equal(pagas(a2.id), 1);
    assert.equal((await dono.post(`/api/assinaturas/${a2.id}/pagamento`, { forma: "pix" })).status, 409, "2º toque logo depois da baixa");
    assert.equal(pagas(a2.id), 1);
  } finally {
    s.fechar();
  }
});

/** Barbearia com Asaas ligado, plano ilimitado de corte e um cliente com assinatura pendente (sub_1 / pay_1) */
async function clubeAsaas(s) {
  const base = await barbeariaPronta(s);
  const conf = (await base.dono.put("/api/canais", { asaas: { chave: "$aact_teste", ambiente: "sandbox" } })).dados;
  const plano = (await base.dono.post("/api/planos", { nome: "Ilimitado", preco_centavos: 8990, itens: [{ servico_id: base.corte.id, quantidade: 0 }] })).dados;
  const lucas = await clienteApp(s);
  const ass = await lucas.post("/api/app/assinar", { plano_id: plano.id, cpf: "529.982.247-25" });
  assert.equal(ass.status, 200, JSON.stringify(ass.dados));
  const evento = (event, payment) => fetch(`${s.url}/webhook/asaas`, { method: "POST", headers: { "content-type": "application/json", "asaas-access-token": conf.asaas.token_webhook }, body: JSON.stringify({ event, payment: { subscription: "sub_1", value: 89.9, billingType: "PIX", ...payment } }) }).then(async (r) => ({ status: r.status, dados: await r.json() }));
  const coberto = async (dia) => (await lucas.get(`/api/app/horarios?servico=${base.corte.id}&dia=${dia}`)).dados.clube;
  return { ...base, plano, lucas, assinatura: ass.dados, evento, coberto };
}

test("V-04: estorno e chargeback tiram o clube; o pagamento reenviado depois do estorno não renova", async () => {
  const s = await subir();
  try {
    const { evento, coberto, assinatura } = await clubeAsaas(s);
    assert.equal((await evento("PAYMENT_RECEIVED", { id: "pay_1" })).status, 200);
    assert.equal((await coberto("2026-11-20")).coberto, true);
    // Chargeback do cartão: sai do clube na hora
    s.agora.ir("2026-11-20T10:00:00-03:00");
    assert.equal((await evento("PAYMENT_CHARGEBACK_REQUESTED", { id: "pay_1" })).status, 200);
    let c = await coberto("2026-11-20");
    assert.equal(c.coberto, false);
    assert.equal(c.status, "atrasada");
    // Reentrega do RECEIVED antigo não devolve o clube
    await evento("PAYMENT_RECEIVED", { id: "pay_1" });
    assert.equal((await coberto("2026-11-20")).coberto, false);
    // Novo pagamento volta a valer; o estorno dele tira de novo; a reentrega não renova
    s.agora.ir("2026-12-10T10:00:00-03:00");
    await evento("PAYMENT_CREATED", { id: "pay_2", dueDate: "2026-12-10" });
    await evento("PAYMENT_RECEIVED", { id: "pay_2" });
    assert.equal((await coberto("2026-12-10")).coberto, true);
    s.agora.ir("2026-12-15T10:00:00-03:00");
    await evento("PAYMENT_REFUNDED", { id: "pay_2" });
    c = await coberto("2026-12-15");
    assert.equal(c.coberto, false);
    assert.equal(c.status, "atrasada");
    await evento("PAYMENT_RECEIVED", { id: "pay_2" });
    assert.equal((await coberto("2026-12-15")).coberto, false, "reentrega depois do estorno não renova");
    const repo = s.app.repo;
    const a = repo.obter("assinaturas", assinatura.id);
    assert.ok(!a.ciclo_fim || a.ciclo_fim <= "2027-01-09", "o ciclo não salta mais um mês");
    assert.equal(repo.um("SELECT COUNT(*) n FROM cobrancas WHERE assinatura_id = ? AND status = 'paga'", assinatura.id).n, 0, "estornadas não contam como recebidas");
    assert.ok(repo.um("SELECT 1 FROM auditoria WHERE acao = 'assinatura_estornada'"));
  } finally {
    s.fechar();
  }
});

test("V-05: assinar de novo ou ao mesmo tempo não cria assinatura órfã no Asaas; falha no meio cancela lá também", async () => {
  const s = await subir();
  try {
    const { lucas, plano, assinatura, dono, corte } = await clubeAsaas(s);
    const subs = () => s.rede.asaas.filter((x) => x.metodo === "POST" && x.caminho.endsWith("/subscriptions")).length;
    const dels = () => s.rede.asaas.filter((x) => x.metodo === "DELETE").map((x) => x.caminho.split("/").at(-1));
    // Assinar de novo o mesmo plano enquanto está pendente: devolve a mesma, com o link
    const de_novo = await lucas.post("/api/app/assinar", { plano_id: plano.id, cpf: "529.982.247-25" });
    assert.equal(de_novo.status, 200);
    assert.equal(de_novo.dados.id, assinatura.id);
    assert.equal(de_novo.dados.link, "https://asaas.com/i/pay_1");
    assert.equal(subs(), 1);
    // Trocar de plano enquanto pendente: a anterior é cancelada no Asaas
    const outro = (await dono.post("/api/planos", { nome: "Outro", preco_centavos: 5990, itens: [{ servico_id: corte.id, quantidade: 2 }] })).dados;
    const troca = await lucas.post("/api/app/assinar", { plano_id: outro.id, cpf: "529.982.247-25" });
    assert.equal(troca.status, 200, JSON.stringify(troca.dados));
    assert.deepEqual(dels(), ["sub_1"]);
    assert.equal(s.app.repo.obter("assinaturas", assinatura.id).status, "cancelada");

    // Dois pedidos ao mesmo tempo (outro cliente): só uma assinatura no Asaas
    const pedro = await clienteApp(s, "34999990002", "Pedro");
    const antes = subs();
    const pedidos = [pedro.lenta("POST", "/api/app/assinar", { plano_id: plano.id, cpf: "529.982.247-25" }), pedro.lenta("POST", "/api/app/assinar", { plano_id: plano.id, cpf: "529.982.247-25" })];
    await new Promise((ok) => setTimeout(ok, 100));
    for (const x of pedidos) x.fim();
    const r = await Promise.all(pedidos.map((x) => x.p));
    assert.ok(r.some((x) => x.status === 200), JSON.stringify(r));
    assert.equal(subs() - antes, 1, "uma assinatura criada no Asaas");
    const vigentes = s.app.repo.um("SELECT COUNT(*) n FROM assinaturas a JOIN clientes c ON c.id = a.cliente_id WHERE c.nome = 'Pedro' AND a.status IN ('pendente','ativa','atrasada')").n;
    assert.equal(vigentes, 1);

    // Falha depois de criar a assinatura no Asaas: ela é cancelada lá também
    const joao = await clienteApp(s, "34999990003", "João");
    s.rede.falhas.push(/^GET .*\/subscriptions\/[^/]+\/payments$/);
    const falhou = await joao.post("/api/app/assinar", { plano_id: plano.id, cpf: "529.982.247-25" });
    assert.equal(falhou.status, 502);
    const criada = `sub_${subs()}`;
    assert.ok(dels().includes(criada), `a assinatura ${criada} criada antes da falha foi cancelada no Asaas`);
    const local = s.app.repo.um("SELECT a.* FROM assinaturas a JOIN clientes c ON c.id = a.cliente_id WHERE c.nome = 'João'");
    assert.equal(local.status, "cancelada");
    assert.equal(local.asaas_assinatura, criada, "o id fica guardado assim que é criado");
    // O banco também impede duas assinaturas vigentes do mesmo cliente
    const cli = s.app.repo.um("SELECT id FROM clientes WHERE nome = 'Pedro'").id;
    assert.throws(() => s.app.repo.inserir("assinaturas", { barbearia_id: "x", cliente_id: cli, plano_id: plano.id, status: "pendente" }), /UNIQUE/);
  } finally {
    s.fechar();
  }
});

test("V-06: pagamento depois do cancelamento não reativa; falha ao cancelar no Asaas fica pendente e a rotina tenta de novo", async () => {
  const s = await subir();
  try {
    const { lucas, evento, assinatura } = await clubeAsaas(s);
    const repo = s.app.repo;
    await evento("PAYMENT_RECEIVED", { id: "pay_1" });
    // O Asaas está fora na hora do cancelamento
    s.rede.falhas.push(/^DELETE /);
    const c = await lucas.post("/api/app/assinatura/cancelar");
    assert.equal(c.status, 200);
    assert.equal(c.dados.status, "cancelada");
    assert.equal(repo.obter("assinaturas", assinatura.id).cancelamento_pendente, 1, "cancelamento no Asaas fica pendente");
    // Chega um pagamento da assinatura cancelada: registra o dinheiro, mas não reativa
    s.agora.ir("2026-12-10T10:00:00-03:00");
    await evento("PAYMENT_CREATED", { id: "pay_2", dueDate: "2026-12-10" });
    assert.equal((await evento("PAYMENT_RECEIVED", { id: "pay_2" })).status, 200);
    const a = repo.obter("assinaturas", assinatura.id);
    assert.equal(a.status, "cancelada");
    assert.equal(repo.um("SELECT status FROM cobrancas WHERE externo_id = 'pay_2'").status, "paga", "o dinheiro recebido fica registrado");
    assert.ok(repo.um("SELECT 1 FROM auditoria WHERE acao = 'pagamento_assinatura_cancelada'"), "a equipe vê na auditoria");
    assert.equal((await lucas.get("/api/app/eu")).dados.clube, null, "o cliente não volta a ser assinante");
    // A rotina tenta cancelar de novo no Asaas
    s.rede.falhas.length = 0;
    const antes = s.rede.asaas.filter((x) => x.metodo === "DELETE").length;
    const r = await s.app.rotina();
    assert.equal(r.cancelamentos_asaas, 1);
    assert.equal(s.rede.asaas.filter((x) => x.metodo === "DELETE").length, antes + 1);
    assert.equal(repo.obter("assinaturas", assinatura.id).cancelamento_pendente, 0);
    assert.equal((await s.app.rotina()).cancelamentos_asaas, 0, "uma vez só");
  } finally {
    s.fechar();
  }
});

test("V-08: renovação paga antes do fim do ciclo não tira o clube; renovação atrasada parte do fim do período pago", async () => {
  const s = await subir({ cfg: { sessaoDias: 365, sessaoClienteDias: 365 } });
  try {
    const { dono, corte, barba, rafael } = await barbeariaPronta(s);
    const plano = (await dono.post("/api/planos", { nome: "Clube", preco_centavos: 8990, itens: [{ servico_id: corte.id, quantidade: 0 }, { servico_id: barba.id, quantidade: 1 }] })).dados;
    const lucas = await clienteApp(s);
    const ass = (await lucas.post("/api/app/assinar", { plano_id: plano.id })).dados;
    const pagar = () => dono.post(`/api/assinaturas/${ass.id}/pagamento`, { forma: "pix" });
    const coberto = async (servico, dia) => (await lucas.get(`/api/app/horarios?servico=${servico}&dia=${dia}`)).dados.clube.coberto;
    assert.equal((await pagar()).dados.ciclo_fim, "2026-12-09");
    // Paga adiantado em 05/12: continua coberto até 09/12 e o período pago vai até 09/01
    s.agora.ir("2026-12-05T10:00:00-03:00");
    const b1 = (await lucas.post("/api/app/agendar", { servico_id: barba.id, barbeiro_id: rafael.id, dia: "2026-12-05", hora: "15:00" })).dados;
    assert.equal(b1.preco_centavos, 0, "barba do ciclo de novembro");
    const r = (await pagar()).dados;
    assert.equal(r.status, "ativa");
    assert.equal(r.pago_ate, "2027-01-09");
    assert.equal(await coberto(corte.id, "2026-12-05"), true, "hoje continua coberto");
    assert.equal(await coberto(corte.id, "2026-12-08"), true);
    assert.equal(await coberto(barba.id, "2026-12-08"), false, "a barba de novembro já foi usada");
    assert.equal(await coberto(barba.id, "2026-12-12"), true, "dezembro tem a sua barba");
    assert.equal(await coberto(corte.id, "2027-01-09"), true);
    // Agendar no ciclo seguinte conta o uso no ciclo seguinte
    const b2 = (await lucas.post("/api/app/agendar", { servico_id: barba.id, barbeiro_id: rafael.id, dia: "2026-12-12", hora: "15:00" })).dados;
    assert.equal(b2.preco_centavos, 0);
    assert.equal(s.app.repo.um("SELECT ciclo_inicio FROM usos WHERE agendamento_id = ?", b2.id).ciclo_inicio, "2026-12-10");
    // O ciclo vira sozinho em 10/12
    s.agora.ir("2026-12-11T10:00:00-03:00");
    const eu = (await lucas.get("/api/app/eu")).dados.clube;
    assert.equal(eu.ciclo_inicio, "2026-12-10");
    assert.equal(eu.ciclo_fim, "2027-01-09");
    assert.equal(eu.usos.find((u) => u.nome === "Barba").usados, 1);
    // Atrasou: a rotina marca depois da tolerância; o pagamento atrasado cobre a partir de 10/01, não de hoje
    s.agora.ir("2027-01-15T10:00:00-03:00");
    await s.app.rotina();
    assert.equal(s.app.repo.obter("assinaturas", ass.id).status, "atrasada");
    const tarde = (await pagar()).dados;
    assert.equal(tarde.status, "ativa");
    assert.equal(tarde.ciclo_inicio, "2027-01-10");
    assert.equal(tarde.pago_ate, "2027-02-09");
  } finally {
    s.fechar();
  }
});

test("V-08: migração corrige assinaturas antigas renovadas antes da hora", () => {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-barber-mig-"));
  const arquivo = join(pasta, "barber.db");
  try {
    let repo = abrirBanco(arquivo);
    const b = repo.inserir("barbearias", { nome: "B", config: {} });
    const cli = repo.inserir("clientes", { barbearia_id: b.id, nome: "C" });
    const pl = repo.inserir("planos", { barbearia_id: b.id, nome: "P", preco_centavos: 100, itens: [] });
    // Como o código antigo deixava: pagou em 05/12 e o ciclo saltou para 10/12 a 09/01
    const adiantada = repo.inserir("assinaturas", { barbearia_id: b.id, cliente_id: cli.id, plano_id: pl.id, status: "ativa", ciclo_inicio: "2026-12-10", ciclo_fim: "2027-01-09" });
    repo.inserir("usos", { barbearia_id: b.id, assinatura_id: adiantada.id, servico_id: "s", agendamento_id: "ag1", ciclo_inicio: "2026-11-10" });
    const cli2 = repo.inserir("clientes", { barbearia_id: b.id, nome: "D" });
    const normal = repo.inserir("assinaturas", { barbearia_id: b.id, cliente_id: cli2.id, plano_id: pl.id, status: "ativa", ciclo_inicio: "2026-11-20", ciclo_fim: "2026-12-19" });
    repo.rodar("UPDATE assinaturas SET pago_ate = NULL"); // banco anterior à coluna
    repo.fechar();
    const agora = () => Date.parse("2026-12-05T10:00:00-03:00");
    repo = abrirBanco(arquivo, agora);
    let a = repo.obter("assinaturas", adiantada.id);
    assert.deepEqual([a.ciclo_inicio, a.ciclo_fim, a.pago_ate], ["2026-11-10", "2026-12-09", "2027-01-09"]);
    const n = repo.obter("assinaturas", normal.id);
    assert.deepEqual([n.ciclo_inicio, n.ciclo_fim, n.pago_ate], ["2026-11-20", "2026-12-19", "2026-12-19"]);
    repo.fechar();
    repo = abrirBanco(arquivo, () => Date.parse("2027-03-01T10:00:00-03:00")); // idempotente
    a = repo.obter("assinaturas", adiantada.id);
    assert.deepEqual([a.ciclo_inicio, a.ciclo_fim, a.pago_ate], ["2026-11-10", "2026-12-09", "2027-01-09"]);
    repo.fechar();
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("V-18: PAYMENT_OVERDUE fora de ordem não marca como atrasado quem já pagou", async () => {
  const s = await subir();
  try {
    const { evento, coberto } = await clubeAsaas(s);
    await evento("PAYMENT_RECEIVED", { id: "pay_1" });
    // Chega o OVERDUE atrasado da própria cobrança paga
    await evento("PAYMENT_OVERDUE", { id: "pay_1" });
    assert.equal((await coberto("2026-11-10")).status, "ativa");
    // OVERDUE de outra cobrança enquanto o período pago cobre hoje: ignora
    s.agora.ir("2026-12-05T10:00:00-03:00");
    await evento("PAYMENT_OVERDUE", { id: "pay_2", invoiceUrl: "https://asaas.com/i/pay_2" });
    let c = await coberto("2026-12-05");
    assert.equal(c.status, "ativa");
    assert.equal(c.coberto, true);
    // Depois que o período pago acabou, o OVERDUE vale
    s.agora.ir("2026-12-11T10:00:00-03:00");
    await evento("PAYMENT_OVERDUE", { id: "pay_2", invoiceUrl: "https://asaas.com/i/pay_2" });
    c = await coberto("2026-12-11");
    assert.equal(c.status, "atrasada");
  } finally {
    s.fechar();
  }
});

test("V-19: webhook do Asaas malformado responde 200 com ignorado, sem erro 500 e sem mexer na assinatura", async () => {
  const s = await subir();
  try {
    const { evento, coberto } = await clubeAsaas(s);
    const semValor = await evento("PAYMENT_CREATED", { id: "pay_9", value: undefined });
    assert.equal(semValor.status, 200);
    assert.equal(semValor.dados.ignorado, true);
    assert.equal((await evento("PAYMENT_CREATED", { id: "pay_9", dueDate: "amanhã" })).dados.ignorado, true);
    const valorRuim = await evento("PAYMENT_RECEIVED", { id: "pay_1", value: "abc" });
    assert.equal(valorRuim.status, 200);
    assert.equal(valorRuim.dados.ignorado, true);
    assert.equal((await coberto("2026-11-10")).coberto, false, "evento malformado não ativa");
    assert.equal((await evento("PAYMENT_RECEIVED", { id: { $ne: 1 } })).status, 200);
    // O mesmo evento bem formado funciona
    assert.equal((await evento("PAYMENT_RECEIVED", { id: "pay_1" })).dados.ok, true);
    assert.equal((await coberto("2026-11-10")).coberto, true);
  } finally {
    s.fechar();
  }
});

test("V-09: o clube só cobre com cobertura válida ao remarcar, ao voltar de 'faltou' e ao fechar a comanda", async () => {
  const s = await subir();
  try {
    const { dono, corte, barba, rafael, bruno } = await barbeariaPronta(s);
    const plano = (await dono.post("/api/planos", { nome: "Clube", preco_centavos: 8990, itens: [{ servico_id: corte.id, quantidade: 0 }, { servico_id: barba.id, quantidade: 1 }] })).dados;
    const lucas = await clienteApp(s);
    const ass = (await lucas.post("/api/app/assinar", { plano_id: plano.id })).dados;
    await dono.post(`/api/assinaturas/${ass.id}/pagamento`, { forma: "pix" });
    const agendar = async (servico, dia, hora, barbeiro = rafael.id) => {
      const r = await lucas.post("/api/app/agendar", { servico_id: servico, barbeiro_id: barbeiro, dia, hora });
      assert.equal(r.status, 200, JSON.stringify(r.dados));
      return r.dados;
    };
    // "Faltou" libera o uso; outro horário usa; voltar o primeiro para "agendado" cobra o preço
    const x = await agendar(barba.id, "2026-11-11", "09:00");
    assert.equal(x.preco_centavos, 0);
    assert.equal((await dono.put(`/api/agendamentos/${x.id}`, { status: "faltou" })).status, 200);
    const y = await agendar(barba.id, "2026-11-12", "09:00");
    assert.equal(y.preco_centavos, 0, "a barba do ciclo ficou livre");
    const volta = await dono.put(`/api/agendamentos/${x.id}`, { status: "agendado" });
    assert.equal(volta.status, 200, JSON.stringify(volta.dados));
    assert.equal(volta.dados.preco_centavos, 4000, "a cota do ciclo já foi usada pelo outro horário");
    assert.equal(volta.dados.clube, false);
    // Transições sem sentido são recusadas
    s.agora.ir("2026-11-11T09:40:00-03:00");
    assert.equal((await dono.post(`/api/agendamentos/${x.id}/concluir`, { forma: "pix" })).status, 200);
    assert.equal((await dono.put(`/api/agendamentos/${x.id}`, { status: "agendado" })).status, 409, "concluído não volta");
    // Remarcar para cima de outro horário do próprio cliente é recusado
    const c1 = await agendar(corte.id, "2026-11-13", "10:00");
    await agendar(corte.id, "2026-11-13", "15:00", bruno.id);
    const sobre = await dono.put(`/api/agendamentos/${c1.id}`, { dia: "2026-11-13", hora: "15:00", barbeiro_id: rafael.id });
    assert.equal(sobre.status, 409, "o cliente já tem horário nesse momento");
    // Assinatura cancelada antes do atendimento: a comanda cobra o serviço
    assert.equal((await lucas.post("/api/app/assinatura/cancelar")).status, 200);
    s.agora.ir("2026-11-13T10:45:00-03:00");
    const fim = await dono.post(`/api/agendamentos/${c1.id}/concluir`, { forma: "pix" });
    assert.equal(fim.status, 200, JSON.stringify(fim.dados));
    assert.equal(fim.dados.venda.total_centavos, 5000, "sem clube válido, o corte é cobrado");
    assert.equal(fim.dados.agendamento.clube, false);
  } finally {
    s.fechar();
  }
});

test("V-09: remarcar para o ciclo seguinte leva o uso junto e libera a cota do ciclo de origem", async () => {
  const s = await subir({ cfg: { sessaoDias: 365, sessaoClienteDias: 365 } });
  try {
    const { dono, barba, rafael } = await barbeariaPronta(s);
    const plano = (await dono.post("/api/planos", { nome: "Clube", preco_centavos: 8990, itens: [{ servico_id: barba.id, quantidade: 1 }] })).dados;
    const lucas = await clienteApp(s);
    const ass = (await lucas.post("/api/app/assinar", { plano_id: plano.id })).dados;
    await dono.post(`/api/assinaturas/${ass.id}/pagamento`, { forma: "pix" });
    s.agora.ir("2026-11-20T08:00:00-03:00");
    await dono.post(`/api/assinaturas/${ass.id}/pagamento`, { forma: "pix" }); // dezembro pago adiantado
    const a = (await lucas.post("/api/app/agendar", { servico_id: barba.id, barbeiro_id: rafael.id, dia: "2026-11-25", hora: "09:00" })).dados;
    assert.equal(a.preco_centavos, 0);
    const r = await dono.put(`/api/agendamentos/${a.id}`, { dia: "2026-12-15", hora: "09:00" });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.preco_centavos, 0);
    assert.equal(s.app.repo.um("SELECT ciclo_inicio FROM usos WHERE agendamento_id = ?", a.id).ciclo_inicio, "2026-12-10");
    const b = (await lucas.post("/api/app/agendar", { servico_id: barba.id, barbeiro_id: rafael.id, dia: "2026-11-26", hora: "09:00" })).dados;
    assert.equal(b.preco_centavos, 0, "a barba de novembro voltou a estar livre");
    const c = (await lucas.post("/api/app/agendar", { servico_id: barba.id, barbeiro_id: rafael.id, dia: "2026-12-16", hora: "09:00" })).dados;
    assert.equal(c.preco_centavos, 4000, "a de dezembro já foi usada pelo remarcado");
  } finally {
    s.fechar();
  }
});

test("V-13: preço inválido não vira R$ 0,00; produto de graça não vai para a vitrine do app", async () => {
  const { paraCentavos } = await import("../public/js/comum.js");
  for (const ruim of ["abc", "1,234.56", "", "-5", "1,2,3"]) assert.equal(paraCentavos(ruim), null, ruim);
  assert.equal(paraCentavos("1.234,56"), 123456);
  assert.equal(paraCentavos("45,90"), 4590);
  assert.equal(paraCentavos("R$ 12,50"), 1250);
  assert.equal(paraCentavos("12.50"), 1250);
  assert.equal(paraCentavos("0"), 0);
  const s = await subir();
  try {
    const { dono } = await barbeariaPronta(s);
    assert.equal((await dono.post("/api/produtos", { nome: "Grátis", preco_centavos: 0, estoque: 3 })).status, 400, "vitrine exige preço");
    const interno = await dono.post("/api/produtos", { nome: "Uso interno", preco_centavos: 0, estoque: 3, vitrine: false });
    assert.equal(interno.status, 200, "fora da vitrine pode custar zero");
    assert.equal((await dono.put(`/api/produtos/${interno.dados.id}`, { vitrine: true })).status, 400);
    // Produto antigo gravado com zero não aparece no app
    s.app.repo.rodar("UPDATE produtos SET vitrine = 1");
    assert.equal((await s.cliente().get("/api/app/info")).dados.vitrine.length, 0);
  } finally {
    s.fechar();
  }
});

test("V-14: acesso de barbeiro sem barbeiro vinculado não vê a agenda, as vendas nem as comissões de todos", async () => {
  const s = await subir();
  try {
    const { dono } = await barbeariaPronta(s);
    const { c: rec, usuario } = await acesso(s, dono, { nome: "Rec", email: "rec@t.test", papel: "recepcao" });
    assert.equal((await dono.put(`/api/usuarios/${usuario.id}`, { papel: "barbeiro" })).status, 400, "PUT exige o vínculo, como o POST");
    // Dado antigo já errado no banco
    s.app.repo.rodar("UPDATE usuarios SET papel = 'barbeiro', barbeiro_id = NULL WHERE id = ?", usuario.id);
    for (const rota of ["/api/comissoes", "/api/vendas", "/api/hoje", "/api/agendamentos"]) assert.equal((await rec.get(rota)).status, 403, rota);
    assert.equal((await rec.get("/api/eu")).status, 200, "ainda vê quem é (para o painel explicar)");
  } finally {
    s.fechar();
  }
});

test("V-10: conferir senha não trava o servidor (scrypt assíncrono com fila)", async () => {
  const seg = await import("../src/seguranca.js");
  assert.equal(typeof seg.senhaConfere, "function");
  const guardado = await seg.hashSenha("senha-forte-1");
  assert.equal(seg.conferirSenha("senha-forte-1", guardado), true, "compatível com o formato atual");
  // Assíncrono de verdade: o laço de eventos roda enquanto o scrypt calcula
  let rodou = false;
  setImmediate(() => (rodou = true));
  assert.equal(await seg.senhaConfere("senha-forte-1", guardado), true);
  assert.equal(rodou, true);
  assert.equal(await seg.senhaConfere("errada", guardado), false);
  assert.equal(await seg.senhaConfere("x", "lixo"), false);

  const s = await subir();
  try {
    await barbeariaPronta(s);
    const t0 = Date.now();
    const logins = Array.from({ length: 6 }, () => s.cliente().post("/api/entrar", { email: "ninguem@t.test", senha: "qualquer-1" }).then(() => Date.now() - t0));
    await new Promise((ok) => setTimeout(ok, 20));
    const h0 = Date.now();
    assert.equal((await fetch(`${s.url}/health`)).status, 200);
    const saude = Date.now() - h0;
    const total = Math.max(...(await Promise.all(logins)));
    assert.ok(saude < total / 2, `/health respondeu em ${saude} ms com logins levando ${total} ms`);
  } finally {
    s.fechar();
  }
});

test("V-11: retorno no tempo certo funciona com mais de 40 clientes com ciclo", async () => {
  const s = await subir();
  try {
    await barbeariaPronta(s);
    const repo = s.app.repo;
    const b = repo.barbearia();
    // 45 clientes que ainda não venceram (eram os 40 primeiros e travavam a fila) + 1 que venceu
    for (let i = 0; i < 45; i++) repo.inserir("clientes", { barbearia_id: b.id, nome: `A${String(i).padStart(2, "0")}`, fone: `55349900${String(10000 + i)}`, ultima_visita: "2026-11-05", ciclo_dias: 21 });
    repo.inserir("clientes", { barbearia_id: b.id, nome: "Zé Vencido", fone: "5534999998888", ultima_visita: "2026-10-01", ciclo_dias: 21 });
    s.agora.ir("2026-11-10T11:00:00-03:00");
    const r = await s.app.rotina();
    assert.equal(r.retornos, 1);
    assert.match(s.rede.whatsapp.at(-1).text.body, /Zé, já faz 40 dias/);
  } finally {
    s.fechar();
  }
});
