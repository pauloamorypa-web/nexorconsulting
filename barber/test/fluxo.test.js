import assert from "node:assert/strict";
import { test } from "node:test";
import { barbeariaPronta, clienteApp, subir, tokenGoogle } from "./ajuda.js";

test("cliente entra pelo WhatsApp, agenda com o último barbeiro e ninguém pega o mesmo horário", async () => {
  const s = await subir();
  try {
    const { corte, rafael, dono } = await barbeariaPronta(s);
    const info = (await s.cliente().get("/api/app/info")).dados;
    assert.equal(info.nome, "Barbearia Navalha");
    assert.deepEqual(info.entrar, { google: "123-teste.apps.googleusercontent.com", whatsapp: true, sms: true });
    assert.equal(info.servicos.length, 4);

    const lucas = await clienteApp(s);
    const eu = (await lucas.get("/api/app/eu")).dados;
    assert.equal(eu.cliente.nome, "Lucas Cliente");
    assert.equal(eu.cliente.fone, "5534999990001");
    assert.equal(eu.de_sempre, null, "sem histórico ainda");

    const dias = (await lucas.get(`/api/app/dias?servico=${corte.id}`)).dados;
    assert.equal(dias[0].dia, "2026-11-10");
    assert.ok(dias[0].livres > 0);
    assert.equal(dias.find((d) => d.dia === "2026-11-16").livres, 0, "segunda fechado");

    const h = (await lucas.get(`/api/app/horarios?servico=${corte.id}&barbeiro=${rafael.id}&dia=2026-11-10`)).dados;
    assert.ok(h.horarios.includes("10:00"));
    const a = await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-10", hora: "10:00" });
    assert.equal(a.status, 200, JSON.stringify(a.dados));
    assert.equal(a.dados.preco_centavos, 5000);
    assert.match(s.rede.whatsapp.at(-1).text.body, /confirmado: Corte com Rafael/);

    const outro = await clienteApp(s, "34999990002", "Pedro");
    const dup = await outro.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-10", hora: "10:15" });
    assert.equal(dup.status, 409, "sobrepõe o corte das 10:00");
    // Sem barbeiro escolhido: vai para quem está livre (Bruno)
    const livre = await outro.post("/api/app/agendar", { servico_id: corte.id, dia: "2026-11-10", hora: "10:00" });
    assert.equal(livre.status, 200);
    assert.equal(livre.dados.barbeiro.nome, "Bruno");

    // Painel vê o dia
    const hoje = (await dono.get("/api/hoje?dia=2026-11-10")).dados;
    assert.equal(hoje.agendamentos.length, 2);
    assert.equal(hoje.resumo.agendados, 2);

    // Estou chegando (até 2 h antes)
    const cheg = await lucas.post(`/api/app/agendamentos/${a.dados.id}/cheguei`);
    assert.equal(cheg.status, 200);
    assert.equal(cheg.dados.status, "chegou");

    // Fecha o atendimento e o "de sempre" aparece na próxima visita
    s.agora.ir("2026-11-10T10:45:00-03:00");
    const fim = await dono.post(`/api/agendamentos/${a.dados.id}/concluir`, { forma: "pix" });
    assert.equal(fim.status, 200, JSON.stringify(fim.dados));
    assert.equal(fim.dados.venda.total_centavos, 5000);
    const depois = (await lucas.get("/api/app/eu")).dados;
    assert.equal(depois.de_sempre.barbeiro.nome, "Rafael");
    assert.equal(depois.de_sempre.servico.nome, "Corte");
    assert.equal(depois.de_sempre.hora_de_sempre, "10:00");
    assert.equal(depois.de_sempre.dia_semana, 2);
    assert.ok(depois.de_sempre.dia >= "2026-11-11");

    const ics = await lucas.get(`/api/app/agendamentos/${a.dados.id}/ics`);
    assert.match(ics.dados, /BEGIN:VEVENT[\s\S]*Corte · Barbearia Navalha/);
  } finally {
    s.fechar();
  }
});

test("código: SMS, código errado bloqueia em 5 tentativas, limite por hora", async () => {
  const s = await subir();
  try {
    await barbeariaPronta(s);
    const c = s.cliente();
    assert.equal((await c.post("/api/app/codigo", { fone: "34 98888-7777", canal: "sms" })).status, 200);
    assert.equal(s.rede.sms.at(-1).To, "+5534988887777");
    for (let i = 0; i < 5; i++) assert.equal((await c.post("/api/app/verificar", { fone: "34988887777", codigo: "000000" })).status, 400);
    assert.equal((await c.post("/api/app/verificar", { fone: "34988887777", codigo: s.rede.ultimoCodigo() })).status, 429, "bloqueado depois de 5 erros");
    for (let i = 0; i < 4; i++) await c.post("/api/app/codigo", { fone: "34988887777", canal: "sms" });
    assert.equal((await c.post("/api/app/codigo", { fone: "34988887777", canal: "sms" })).status, 429, "5 por hora");
    assert.equal((await c.post("/api/app/codigo", { fone: "12", canal: "sms" })).status, 400);
    assert.equal((await c.get("/api/app/eu")).status, 401);
  } finally {
    s.fechar();
  }
});

test("Google: token conferido, conta nova pede celular e une com o cadastro antigo", async () => {
  const s = await subir();
  try {
    const { corte, dono } = await barbeariaPronta(s);
    // Cliente antigo cadastrado pela recepção com o celular
    await dono.post("/api/clientes", { nome: "Ana Antiga", fone: "34977776666" });
    const g = s.cliente();
    assert.equal((await g.post("/api/app/google", { credencial: tokenGoogle({ sub: "g-1", email: "ana@gmail.com", name: "Ana" }, s.agora()) })).status, 200);
    const eu = (await g.get("/api/app/eu")).dados;
    assert.equal(eu.precisa_celular, true);
    assert.equal((await g.post("/api/app/agendar", { servico_id: corte.id, dia: "2026-11-11", hora: "10:00" })).status, 400, "sem celular não agenda");
    await g.post("/api/app/codigo", { fone: "34977776666", canal: "whatsapp" });
    const cel = await g.post("/api/app/celular", { fone: "34977776666", codigo: s.rede.ultimoCodigo() });
    assert.equal(cel.dados.unificado, true);
    const eu2 = (await g.get("/api/app/eu")).dados;
    assert.equal(eu2.cliente.nome, "Ana Antiga");
    assert.equal(eu2.cliente.google, true);
    // Token com público errado ou adulterado é recusado
    const ruim = tokenGoogle({ sub: "g-2", aud: "outro.apps.googleusercontent.com" }, s.agora());
    assert.equal((await s.cliente().post("/api/app/google", { credencial: ruim })).status, 401);
    const bom = tokenGoogle({ sub: "g-3" }, s.agora()).split(".");
    bom[1] = Buffer.from(JSON.stringify({ sub: "hacker", aud: "123-teste.apps.googleusercontent.com", iss: "accounts.google.com", exp: 9e9 })).toString("base64url");
    assert.equal((await s.cliente().post("/api/app/google", { credencial: bom.join(".") })).status, 401);
  } finally {
    s.fechar();
  }
});

test("cancelamento abre a vaga para a lista de espera; o primeiro que confirma leva", async () => {
  const s = await subir();
  try {
    const { corte, rafael } = await barbeariaPronta(s);
    const lucas = await clienteApp(s);
    const a = (await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-11", hora: "18:00" })).dados;
    const pedro = await clienteApp(s, "34999990002", "Pedro");
    const joao = await clienteApp(s, "34999990003", "João");
    assert.equal((await pedro.post("/api/app/espera", { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-11", de: "17:00", ate: "19:00" })).status, 200);
    assert.equal((await joao.post("/api/app/espera", { servico_id: corte.id, dia: "2026-11-11", de: "17:30", ate: "18:30" })).status, 200);
    assert.equal((await joao.post("/api/app/espera", { servico_id: corte.id, dia: "2026-11-11", de: "08:00", ate: "09:00" })).status, 409, "um pedido por dia");

    const antes = s.rede.whatsapp.length;
    assert.equal((await lucas.post(`/api/app/agendamentos/${a.id}/cancelar`)).status, 200);
    await new Promise((ok) => setTimeout(ok, 50));
    const ofertas = s.rede.whatsapp.slice(antes).map((m) => m.text.body);
    assert.equal(ofertas.length, 2, "as duas pessoas recebem a oferta");
    const tokenJoao = /#vaga-([\w-]+)/.exec(ofertas[1])[1];
    const tokenPedro = /#vaga-([\w-]+)/.exec(ofertas[0])[1];
    assert.equal((await pedro.get(`/api/app/vaga/${tokenJoao}`)).status, 403, "oferta é pessoal");
    const ver = (await joao.get(`/api/app/vaga/${tokenJoao}`)).dados;
    assert.equal(ver.hora, "18:00");
    assert.equal(ver.vencida, false);
    const ok = await joao.post(`/api/app/vaga/${tokenJoao}`);
    assert.equal(ok.status, 200, JSON.stringify(ok.dados));
    assert.equal(ok.dados.origem, "espera");
    const tarde = await pedro.post(`/api/app/vaga/${tokenPedro}`);
    assert.ok([409, 410].includes(tarde.status), "Pedro chegou tarde");
    // Pedro continua na fila
    assert.equal((await pedro.get("/api/app/eu")).dados.espera[0].status, "aguardando");
  } finally {
    s.fechar();
  }
});

test("clube: assinatura no balcão cobre o corte, limite de barbas e desconto em produtos", async () => {
  const s = await subir();
  try {
    const { dono, corte, barba, rafael } = await barbeariaPronta(s);
    const plano = await dono.post("/api/planos", { nome: "Clube Navalha", preco_centavos: 8990, itens: [{ servico_id: corte.id, quantidade: 0 }, { servico_id: barba.id, quantidade: 1 }], desconto_produtos: 10 });
    assert.equal(plano.status, 200, JSON.stringify(plano.dados));
    const lucas = await clienteApp(s);
    // Sem Asaas: assina pelo app e paga no balcão
    const ass = await lucas.post("/api/app/assinar", { plano_id: plano.dados.id });
    assert.equal(ass.status, 200, JSON.stringify(ass.dados));
    assert.equal(ass.dados.status, "pendente");
    assert.equal(ass.dados.pagar_no_balcao, true);
    const pg = await dono.post(`/api/assinaturas/${ass.dados.id}/pagamento`, { forma: "pix" });
    assert.equal(pg.dados.status, "ativa");
    assert.equal(pg.dados.ciclo_fim, "2026-12-09");

    const h = (await lucas.get(`/api/app/horarios?servico=${corte.id}&dia=2026-11-11`)).dados;
    assert.equal(h.clube.coberto, true);
    const a1 = (await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-11", hora: "09:00" })).dados;
    assert.equal(a1.preco_centavos, 0);
    assert.equal(a1.clube, true);
    const b1 = (await lucas.post("/api/app/agendar", { servico_id: barba.id, barbeiro_id: rafael.id, dia: "2026-11-12", hora: "09:00" })).dados;
    assert.equal(b1.preco_centavos, 0);
    const b2 = (await lucas.post("/api/app/agendar", { servico_id: barba.id, barbeiro_id: rafael.id, dia: "2026-11-13", hora: "09:00" })).dados;
    assert.equal(b2.preco_centavos, 4000, "a barba do ciclo já foi usada");

    const produto = (await dono.post("/api/produtos", { nome: "Pomada Matte", preco_centavos: 4500, custo_centavos: 2000, estoque: 5, estoque_minimo: 2 })).dados;
    s.agora.ir("2026-11-11T09:40:00-03:00");
    const fim = await dono.post(`/api/agendamentos/${a1.id}/concluir`, { forma: "dinheiro", produtos: [{ id: produto.id, quantidade: 1 }] });
    assert.equal(fim.status, 200, JSON.stringify(fim.dados));
    assert.equal(fim.dados.venda.total_centavos, 4050, "corte pelo clube + pomada com 10%");
    const eu = (await lucas.get("/api/app/eu")).dados;
    assert.equal(eu.clube.status, "ativa");
    assert.equal(eu.clube.usos.find((u) => u.nome === "Corte").usados, 1);
    // Cancelar o agendamento devolve o uso
    s.agora.ir("2026-11-11T10:00:00-03:00");
    assert.equal((await lucas.post(`/api/app/agendamentos/${b1.id}/cancelar`)).status, 200);
    const b3 = (await lucas.post("/api/app/agendar", { servico_id: barba.id, barbeiro_id: rafael.id, dia: "2026-11-14", hora: "09:00" })).dados;
    assert.equal(b3.preco_centavos, 0);
    const resumo = (await dono.get("/api/assinaturas")).dados.resumo;
    assert.equal(resumo.ativas, 1);
    assert.equal(resumo.receita_mensal_centavos, 8990);
  } finally {
    s.fechar();
  }
});

test("clube pelo Asaas: CPF obrigatório, link de pagamento e webhook ativa", async () => {
  const s = await subir();
  try {
    const { dono, corte } = await barbeariaPronta(s);
    const conf = (await dono.put("/api/canais", { asaas: { chave: "$aact_teste", ambiente: "sandbox" } })).dados;
    assert.equal(conf.asaas.chave, true);
    const tokenWebhook = conf.asaas.token_webhook;
    const plano = (await dono.post("/api/planos", { nome: "Ilimitado", preco_centavos: 8990, itens: [{ servico_id: corte.id, quantidade: 0 }] })).dados;
    const lucas = await clienteApp(s);
    assert.equal((await lucas.post("/api/app/assinar", { plano_id: plano.id })).status, 400, "CPF obrigatório");
    const ass = await lucas.post("/api/app/assinar", { plano_id: plano.id, cpf: "529.982.247-25" });
    assert.equal(ass.status, 200, JSON.stringify(ass.dados));
    assert.equal(ass.dados.link, "https://asaas.com/i/pay_1");
    assert.equal(s.rede.asaas.find((x) => x.caminho.endsWith("/subscriptions")).corpo.cycle, "MONTHLY");

    const enviar = (corpo, token = tokenWebhook) => fetch(`${s.url}/webhook/asaas`, { method: "POST", headers: { "content-type": "application/json", "asaas-access-token": token }, body: JSON.stringify(corpo) });
    assert.equal((await enviar({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1", subscription: "sub_1", value: 89.9 } }, "errado")).status, 401);
    assert.equal((await enviar({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1", subscription: "sub_1", value: 89.9, billingType: "PIX" } })).status, 200);
    assert.equal((await enviar({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1", subscription: "sub_1", value: 89.9, billingType: "PIX" } })).status, 200, "repetido não renova de novo");
    const eu = (await lucas.get("/api/app/eu")).dados;
    assert.equal(eu.clube.status, "ativa");
    assert.equal(eu.clube.ciclo_fim, "2026-12-09");
    await enviar({ event: "PAYMENT_OVERDUE", payment: { id: "pay_2", subscription: "sub_1", invoiceUrl: "https://asaas.com/i/pay_2" } });
    assert.equal((await lucas.get("/api/app/eu")).dados.clube.status, "atrasada");
    assert.equal((await lucas.post("/api/app/assinatura/cancelar")).dados.status, "cancelada");
    assert.ok(s.rede.asaas.some((x) => x.metodo === "DELETE"));
  } finally {
    s.fechar();
  }
});

test("produtos: reserva pelo app, baixa no estoque, comissão e estorno", async () => {
  const s = await subir();
  try {
    const { dono, corte, bruno } = await barbeariaPronta(s);
    const p = (await dono.post("/api/produtos", { nome: "Óleo de barba", preco_centavos: 3000, estoque: 2, estoque_minimo: 1 })).dados;
    assert.equal(p.estoque, 2);
    const lucas = await clienteApp(s);
    const info = (await lucas.get("/api/app/info")).dados;
    assert.equal(info.vitrine[0].disponivel, 2);
    assert.equal((await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: bruno.id, dia: "2026-11-10", hora: "14:00", reservas: [{ produto_id: p.id, quantidade: 3 }] })).status, 409, "mais do que tem");
    const a = (await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: bruno.id, dia: "2026-11-10", hora: "14:00", reservas: [{ produto_id: p.id, quantidade: 2 }] })).dados;
    assert.equal(a.reservas.length, 1);
    assert.equal((await lucas.get("/api/app/info")).dados.vitrine[0].disponivel, 0, "reservado sai da vitrine");
    // Venda avulsa não pode usar o que está reservado
    assert.equal((await dono.post("/api/vendas", { itens: [{ tipo: "produto", id: p.id, quantidade: 1 }], forma: "pix" })).status, 409);

    s.agora.ir("2026-11-10T14:45:00-03:00");
    const fim = await dono.post(`/api/agendamentos/${a.id}/concluir`, { forma: "credito", desconto_centavos: 1000 });
    assert.equal(fim.status, 200, JSON.stringify(fim.dados));
    assert.equal(fim.dados.venda.total_centavos, 5000 + 6000 - 1000);
    const prods = (await dono.get("/api/produtos")).dados;
    assert.equal(prods[0].estoque, 0);
    assert.equal(prods[0].baixo, true);
    const com = (await dono.get("/api/comissoes?de=2026-11-01&ate=2026-11-30")).dados;
    const doBruno = com.por_barbeiro.find((x) => x.nome === "Bruno");
    // Desconto de R$ 10 dividido: base 4545 no corte (50%) e 5455 nos óleos (10%, arredondado)
    assert.equal(doBruno.servicos_centavos, 2273);
    assert.equal(doBruno.produtos_centavos, 546);
    const caixa = (await dono.get("/api/caixa?dia=2026-11-10")).dados;
    assert.equal(caixa.por_forma.credito, 10000);

    const cancel = await dono.post(`/api/vendas/${fim.dados.venda.id}/cancelar`);
    assert.equal(cancel.dados.status, "cancelada");
    assert.equal((await dono.get("/api/produtos")).dados[0].estoque, 2, "estoque volta");
    assert.equal((await dono.get("/api/comissoes?de=2026-11-01&ate=2026-11-30")).dados.por_barbeiro.length, 0);
    const mov = (await dono.get(`/api/produtos/${p.id}/movimentos`)).dados.map((m) => m.tipo);
    assert.deepEqual(mov, ["estorno", "venda", "entrada"]);
  } finally {
    s.fechar();
  }
});

test("rotina: lembrete antes do horário e retorno no tempo certo", async () => {
  const s = await subir({ cfg: { sessaoDias: 365 } });
  try {
    const { dono, corte, rafael } = await barbeariaPronta(s);
    const lucas = await clienteApp(s);
    // Três visitas com 21 dias de intervalo
    for (const dia of ["2026-11-10", "2026-12-01", "2026-12-22"]) {
      s.agora.ir(`${dia}T08:00:00-03:00`);
      const a = (await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: rafael.id, dia, hora: "10:00" })).dados;
      s.agora.ir(`${dia}T06:30:00-03:00`);
      assert.equal((await s.app.rotina()).lembretes, 0, "ainda longe do horário");
      s.agora.ir(`${dia}T07:30:00-03:00`);
      assert.equal((await s.app.rotina()).lembretes, 1);
      assert.match(s.rede.whatsapp.at(-1).text.body, /lembrete: Corte com Rafael hoje às 10:00/);
      assert.equal((await s.app.rotina()).lembretes, 0, "um lembrete só");
      s.agora.ir(`${dia}T10:45:00-03:00`);
      await dono.post(`/api/agendamentos/${a.id}/concluir`, { forma: "pix" });
    }
    const cli = (await dono.get("/api/clientes")).dados.find((c) => c.nome === "Lucas Cliente");
    assert.equal(cli.ciclo_dias, 21);
    // Retorno é mensagem promocional: sem opt-in de marketing não vai (o lembrete do horário vai)
    s.agora.ir("2027-01-14T11:00:00-03:00");
    assert.equal((await s.app.rotina()).retornos, 0, "sem opt-in não manda");
    await lucas.put("/api/app/eu", { marketing_optin: true });
    s.agora.ir("2027-01-14T09:00:00-03:00");
    assert.equal((await s.app.rotina()).retornos, 0, "antes das 10h não manda");
    s.agora.ir("2027-01-14T11:00:00-03:00");
    const r = await s.app.rotina();
    assert.equal(r.retornos, 1);
    assert.match(s.rede.whatsapp.at(-1).text.body, /já faz 23 dias do seu último corte/);
    assert.equal((await s.app.rotina()).retornos, 0, "um aviso por ciclo");
    assert.equal((await dono.get("/api/clientes?filtro=sumidos")).dados.length, 0);
  } finally {
    s.fechar();
  }
});

test("app identifica o assinante na hora de agendar: incluído, limite, fora do plano e atraso", async () => {
  const s = await subir();
  try {
    const { dono, corte, barba, servicos, rafael } = await barbeariaPronta(s);
    const sobrancelha = servicos.find((x) => x.nome === "Sobrancelha");
    const plano = (await dono.post("/api/planos", { nome: "Clube Navalha", preco_centavos: 8990, itens: [{ servico_id: corte.id, quantidade: 0 }, { servico_id: barba.id, quantidade: 1 }] })).dados;
    const lucas = await clienteApp(s);
    // Sem assinatura: nada de clube
    assert.equal((await lucas.get("/api/app/clube/servicos")).dados.assinante, false);
    assert.equal((await lucas.get(`/api/app/horarios?servico=${corte.id}&dia=2026-11-11`)).dados.clube.assinante, false);

    // Assinatura feita no balcão: o app reconhece pelo celular
    const cli = (await dono.get("/api/clientes")).dados.find((c) => c.nome === "Lucas Cliente");
    await dono.post("/api/assinaturas", { cliente_id: cli.id, plano_id: plano.id, pago_agora: "pix" });
    const cob = (await lucas.get("/api/app/clube/servicos")).dados;
    assert.equal(cob.assinante, true);
    assert.equal(cob.plano.nome, "Clube Navalha");
    assert.equal(cob.servicos[corte.id].coberto, true);
    assert.equal(cob.servicos[corte.id].restante, null, "ilimitado");
    assert.equal(cob.servicos[barba.id].restante, 0, "1 barba: depois desta, restam 0");
    assert.equal(cob.servicos[sobrancelha.id].coberto, false);
    assert.match(cob.servicos[sobrancelha.id].motivo, /não faz parte do seu plano/);

    const h = (await lucas.get(`/api/app/horarios?servico=${barba.id}&dia=2026-11-11`)).dados.clube;
    assert.deepEqual([h.assinante, h.coberto, h.plano.nome, h.status], [true, true, "Clube Navalha", "ativa"]);

    const a = (await lucas.post("/api/app/agendar", { servico_id: barba.id, barbeiro_id: rafael.id, dia: "2026-11-11", hora: "09:00" })).dados;
    assert.equal(a.preco_centavos, 0);
    assert.deepEqual(a.assinante, { plano: { id: plano.id, nome: "Clube Navalha", desconto_produtos: 0 }, status: "ativa", coberto: true, restante: 0 });
    assert.match(s.rede.whatsapp.at(-1).text.body, /Incluído no seu Clube Navalha \(restam 0 no ciclo\)/);

    // Limite do ciclo atingido: identifica o motivo e cobra
    const h2 = (await lucas.get(`/api/app/horarios?servico=${barba.id}&dia=2026-11-12`)).dados.clube;
    assert.equal(h2.coberto, false);
    assert.match(h2.motivo, /já usou os 1/);
    const b2 = (await lucas.post("/api/app/agendar", { servico_id: sobrancelha.id, barbeiro_id: rafael.id, dia: "2026-11-12", hora: "09:00" })).dados;
    assert.equal(b2.preco_centavos, 1500);
    assert.equal(b2.assinante.coberto, false, "assinante identificado, mas fora do plano");

    // O painel vê o assinante no horário
    const hoje = (await dono.get("/api/hoje?dia=2026-11-11")).dados;
    assert.equal(hoje.agendamentos[0].assinante.plano.nome, "Clube Navalha");

    // Mensalidade atrasada: identifica e não cobre
    s.app.repo.rodar("UPDATE assinaturas SET status = 'atrasada'");
    const h3 = (await lucas.get(`/api/app/horarios?servico=${corte.id}&dia=2026-11-13`)).dados.clube;
    assert.deepEqual([h3.assinante, h3.coberto, h3.status], [true, false, "atrasada"]);
    assert.match(h3.motivo, /atraso/);
  } finally {
    s.fechar();
  }
});
