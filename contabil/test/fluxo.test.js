/* Fluxo completo de um escritório: cliente novo → pendências e tarefas do mês → cobrança → cliente envia pelo
   portal e pelo WhatsApp → IA lê, confere e sugere lançamentos → contador corrige (o sistema aprende) → confere
   → exporta → guia entregue no portal → chamados. */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { CNPJ_ESCRITORIO, CNPJ_FORNECEDOR, CNPJ_PADARIA, PDF, iaFalsa, leitura, msgWhats, subir } from "./ajuda.js";

const agora = () => Date.parse("2026-11-04T12:00:00-03:00");
let s, eq, cli, portal;

before(async () => {
  s = await subir({ agora, ia: iaFalsa() });
  eq = s.cliente();
  assert.equal((await eq.post("/api/cadastro", { razao_social: "Contábil Exemplo Ltda", nome_fantasia: "Contábil Exemplo", cnpj: CNPJ_ESCRITORIO, nome: "Marta Lima", email: "marta@contabil.com", senha: "senha-forte-1" })).status, 200);
  const canais = await eq.put("/api/canais", { whatsapp: { token: "EAAtokenfalso", id_numero: "1234567890", segredo_app: "segredo-meta", verificacao: "verifica-123" }, email: { chave: "re_chave", remetente: "Contábil Exemplo <nao-responda@contabil.com>" } });
  assert.equal(canais.status, 200, JSON.stringify(canais.dados));
  assert.equal(canais.dados.config.whatsapp.token, true, "o token não volta para o navegador");
  assert.equal(JSON.stringify(canais.dados).includes("EAAtokenfalso"), false);
});
after(() => s.fechar());

test("cliente novo já nasce com os documentos esperados, as pendências e as obrigações do mês", async () => {
  const r = await eq.post("/api/clientes", { razao_social: "Padaria Pão Dourado Ltda", nome_fantasia: "Pão Dourado", cnpj: "45.723.174/0001-10", regime: "simples", tem_funcionarios: true, contato_nome: "Rosa Martins", whatsapp: "(34) 99999-0001", email: "rosa@paodourado.com.br" });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  cli = r.dados;
  assert.equal((await eq.post("/api/clientes", { razao_social: "Outra", cnpj: CNPJ_PADARIA, regime: "simples" })).status, 409, "CNPJ repetido");
  const det = (await eq.get(`/api/clientes/${cli.id}`)).dados;
  assert.equal(det.esperados.length, 4, "simples: extrato, notas, comprovantes + variáveis da folha");
  const pend = (await eq.get(`/api/pendencias?cliente=${cli.id}`)).dados;
  assert.ok(pend.some((p) => p.competencia === "2026-10" && p.tipo === "extrato" && p.prazo === "2026-11-05"));
  assert.ok(pend.some((p) => p.tipo === "folha" && p.competencia === "2026-11" && p.prazo === "2026-11-25"));
  const tarefas = (await eq.get(`/api/tarefas?cliente=${cli.id}`)).dados;
  const prazo = (nome) => tarefas.find((t) => t.nome.startsWith(nome))?.prazo_legal;
  assert.equal(prazo("DAS (Simples"), "2026-11-23", "dia 20/11 é feriado (Consciência Negra): o DAS posterga para segunda 23/11");
  assert.equal(prazo("FGTS"), "2026-11-19", "o FGTS antecipa para 19/11");
  assert.equal(prazo("eSocial"), "2026-11-13", "15/11 é domingo e feriado: antecipa para sexta 13/11");
  assert.ok(!tarefas.some((t) => t.nome.startsWith("PIS")), "PIS/COFINS não é do Simples");
  assert.equal((await eq.post(`/api/clientes/${cli.id}/gerar`, { competencia: "2026-10" })).dados.tarefas, 0, "gerar de novo não duplica");
});

test("régua de cobrança: e-mail com a lista do que falta; WhatsApp fora da janela sem modelo é pulado", async () => {
  const r = await eq.post("/api/rotina");
  assert.equal(r.status, 200);
  assert.equal(s.rede.emails.length, 1);
  const em = s.rede.emails[0];
  assert.deepEqual(em.to, ["rosa@paodourado.com.br"]);
  assert.match(em.text, /Olá, Rosa!/);
  assert.match(em.text, /Extrato bancário/);
  assert.match(em.text, /05\/11\/2026/);
  assert.match(em.text, /https:\/\/contabil\.teste\/portal\//);
  assert.equal(s.rede.whatsapp.length, 0, "sem modelo aprovado e fora da janela de 24 h, não manda WhatsApp");
  const envios = (await eq.get("/api/envios")).dados;
  assert.ok(envios.some((e) => e.canal === "whatsapp" && e.status === "pulado"));
  await eq.post("/api/rotina");
  assert.equal(s.rede.emails.length, 1, "a régua não repete no mesmo dia");
  assert.equal((await eq.post(`/api/cobrar/${cli.id}`)).status, 200, "cobrar agora ignora a régua");
  assert.equal(s.rede.emails.length, 2);
});

test("portal: convite, senha e envio do extrato pela pendência; a IA lê e sugere os lançamentos", async () => {
  const conv = await eq.post(`/api/clientes/${cli.id}/portal`, { nome: "Rosa Martins", email: "rosa@paodourado.com.br", whatsapp: "34999990001" });
  assert.equal(conv.status, 200);
  const token = conv.dados.link.split("/convite/")[1];
  portal = s.cliente();
  assert.equal((await portal.get(`/api/portal/convite/${token}`)).dados.empresa, "Pão Dourado");
  assert.equal((await portal.post(`/api/portal/convite/${token}`, { senha: "senha-da-rosa" })).status, 200);
  assert.equal((await portal.post(`/api/portal/convite/${token}`, { senha: "outra-senha" })).status, 404, "convite de uso único");
  const pend = (await portal.get("/api/portal/pendencias")).dados;
  const extrato = pend.find((p) => p.tipo === "extrato");
  assert.equal(pend.some((p) => "cobrancas" in p), false, "o cliente não vê o controle interno da régua");

  s.ia.leituras.push(leitura({ tipo: "extrato_bancario", banco: "Sicoob 1234-5", competencia: "2026-10", data_emissao: "2026-10-31", movimentos: [{ data: "2026-10-05", descricao: "PIX RECEBIDO CLIENTE", valor: 820.5 }, { data: "2026-10-12", descricao: "PAGTO BOLETO DISTRIBUIDORA", valor: -150 }] }));
  const up = await portal.enviar(`/api/portal/documentos?pendencia=${extrato.id}`, PDF, "application/pdf", "extrato outubro.pdf");
  assert.equal(up.status, 200, JSON.stringify(up.dados));
  await s.app.ocioso();
  const doc = (await eq.get(`/api/documentos/${up.dados.id}`)).dados;
  assert.equal(doc.origem, "portal");
  assert.equal(doc.leitura_status, "lido");
  assert.equal(doc.tipo, "extrato_bancario");
  assert.equal(doc.lancamentos.length, 2);
  const entrada = doc.lancamentos.find((l) => l.valor_centavos === 82050);
  assert.equal(entrada.debito, "Bancos conta movimento");
  assert.equal(entrada.credito, "Entradas a classificar");
  assert.equal((await portal.get("/api/portal/pendencias")).dados.find((p) => p.id === extrato.id).status, "recebido");
  const chamada = s.ia.chamadas.at(-1);
  assert.equal(chamada.output_config.format.type, "json_schema", "saída estruturada");
  assert.equal(chamada.messages[0].content[0].type, "document", "PDF vai como documento");
});

let nota;
test("nota de compra: conciliada com o extrato; a correção da conta é aprendida para a próxima", async () => {
  const nf = (numero) => leitura({ tipo: "nota_fiscal_entrada", emitente_nome: "Distribuidora Boa Massa", emitente_cnpj: CNPJ_FORNECEDOR, destinatario_cnpj: CNPJ_PADARIA, numero, data_emissao: "2026-10-10", valor_total: 150, competencia: "2026-10" });
  s.ia.leituras.push(nf("1001"));
  const up = await eq.enviar(`/api/documentos?cliente=${cli.id}`, Buffer.concat([PDF, Buffer.from("nota1")]), "application/pdf", "nf-1001.pdf");
  assert.equal(up.status, 200, JSON.stringify(up.dados));
  await s.app.ocioso();
  nota = (await eq.get(`/api/documentos/${up.dados.id}`)).dados;
  assert.deepEqual(nota.alertas, []);
  const l = nota.lancamentos[0];
  assert.equal(l.debito, "Despesas a classificar");
  assert.equal(l.credito, "Fornecedores a pagar");
  assert.equal(l.valor_centavos, 15000);
  assert.match(l.historico, /nº 1001 · Distribuidora Boa Massa/);
  const extratoLanc = (await eq.get(`/api/lancamentos?cliente=${cli.id}&competencia=2026-10`)).dados.find((x) => x.valor_centavos === 15000 && x.documento_id !== nota.id);
  assert.equal(extratoLanc.conciliado_com, nota.id, "pagamento do extrato conciliado com a nota (mesmo valor, 2 dias depois)");
  assert.ok((await eq.get(`/api/pendencias?cliente=${cli.id}&competencia=2026-10`)).dados.find((p) => p.tipo === "notas_entrada").status === "recebido", "a nota cumpriu a pendência de notas de entrada");

  assert.equal((await eq.put(`/api/lancamentos/${l.id}`, { debito: "Matéria-prima" })).status, 200);
  s.ia.leituras.push(nf("1002"));
  const up2 = await eq.enviar(`/api/documentos?cliente=${cli.id}`, Buffer.concat([PDF, Buffer.from("nota2")]), "application/pdf", "nf-1002.pdf");
  await s.app.ocioso();
  assert.equal((await eq.get(`/api/documentos/${up2.dados.id}`)).dados.lancamentos[0].debito, "Matéria-prima", "aprendeu com a correção");
});

test("duplicidade: arquivo idêntico e mesma nota em outro arquivo são avisados", async () => {
  s.ia.leituras.push(leitura({ tipo: "nota_fiscal_entrada", emitente_cnpj: CNPJ_FORNECEDOR, destinatario_cnpj: CNPJ_PADARIA, numero: "1001", data_emissao: "2026-10-10", valor_total: 150 }));
  const up = await eq.enviar(`/api/documentos?cliente=${cli.id}`, Buffer.concat([PDF, Buffer.from("nota1")]), "application/pdf", "de-novo.pdf");
  await s.app.ocioso();
  const d = (await eq.get(`/api/documentos/${up.dados.id}`)).dados;
  assert.ok(d.alertas.some((a) => a.startsWith("Arquivo idêntico")));
  assert.ok(d.alertas.some((a) => a.startsWith("Possível duplicidade")));
  assert.equal((await eq.post(`/api/documentos/${d.id}/rejeitar`, { motivo: "duplicado" })).status, 200);
  assert.equal((await eq.get(`/api/documentos/${d.id}`)).dados.lancamentos.length, 0, "rejeitado não gera lançamento");
});

test("conferência por código: CNPJ inválido e nota de outra empresa", async () => {
  s.ia.leituras.push(leitura({ tipo: "nota_fiscal_entrada", emitente_cnpj: "11111111111111", destinatario_cnpj: "19131243000197", numero: "9", data_emissao: "2026-10-03", valor_total: 10 }));
  const up = await eq.enviar(`/api/documentos?cliente=${cli.id}`, Buffer.concat([PDF, Buffer.from("x")]), "application/pdf", "estranha.pdf");
  await s.app.ocioso();
  const d = (await eq.get(`/api/documentos/${up.dados.id}`)).dados;
  assert.ok(d.alertas.some((a) => a.includes("CNPJ do emitente inválido")));
  assert.ok(d.alertas.some((a) => a.includes("não aparece como emitente nem como destinatário")));
  await eq.post(`/api/documentos/${d.id}/rejeitar`, { motivo: "não é do cliente", reabrir_pendencia: false });
});

test("falha da IA não perde o documento e dá para ler de novo", async () => {
  s.ia.leituras.push(new Error("Overloaded"));
  const up = await eq.enviar(`/api/documentos?cliente=${cli.id}`, Buffer.concat([PDF, Buffer.from("recibo")]), "application/pdf", "recibo.pdf");
  await s.app.ocioso();
  assert.equal((await eq.get(`/api/documentos/${up.dados.id}`)).dados.leitura_status, "erro");
  s.ia.leituras.push(leitura({ tipo: "recibo", emitente_nome: "João Eletricista", data_emissao: "2026-10-20", valor_total: 300 }));
  await eq.post(`/api/documentos/${up.dados.id}/ler`);
  await s.app.ocioso();
  const d = (await eq.get(`/api/documentos/${up.dados.id}`)).dados;
  assert.equal(d.leitura_status, "lido");
  assert.equal(d.lancamentos.length, 1);
});

test("conferir e exportar: só os aprovados, no layout do escritório, uma vez", async () => {
  const docs = (await eq.get(`/api/documentos?cliente=${cli.id}&status=novo`)).dados;
  for (const d of docs) assert.equal((await eq.post(`/api/documentos/${d.id}/conferir`)).status, 200);
  const r = await fetch(`${s.url}/api/lancamentos/exportar?cliente=${cli.id}&competencia=2026-10`, { headers: { cookie: (await loginCookie()) } });
  assert.equal(r.status, 200);
  const csv = await r.text();
  const linhas = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(linhas[0], "data;debito;credito;valor;historico;documento");
  assert.ok(linhas.some((x) => x.startsWith("05/10/2026;Bancos conta movimento;Entradas a classificar;820,50;")));
  assert.ok(linhas.some((x) => x.includes(";Matéria-prima;Fornecedores a pagar;150,00;")));
  assert.equal((await fetch(`${s.url}/api/lancamentos/exportar?cliente=${cli.id}&competencia=2026-10`, { headers: { cookie: (await loginCookie()) } })).status, 404, "já exportados");
  const l = (await eq.get(`/api/lancamentos?cliente=${cli.id}&status=exportado`)).dados[0];
  assert.equal((await eq.put(`/api/lancamentos/${l.id}`, { valor_centavos: 1 })).status, 409, "exportado não muda");
});
async function loginCookie() {
  const r = await fetch(`${s.url}/api/entrar`, { method: "POST", headers: { "content-type": "application/json", "x-nexor": "1" }, body: JSON.stringify({ email: "marta@contabil.com", senha: "senha-forte-1" }) });
  return r.headers.getSetCookie()[0].split(";")[0];
}

test("WhatsApp: o cliente manda o PDF, o sistema guarda, lê e confirma; pergunta respondida pela IA", async () => {
  s.ia.leituras.push(leitura({ tipo: "comprovante_pagamento", emitente_nome: "Energia", data_emissao: "2026-10-28", valor_total: 410.3, competencia: "2026-10" }));
  assert.equal(await s.webhook(msgWhats("5534999990001", { midia: "conta-luz.pdf" })), 200);
  const doc = (await eq.get(`/api/documentos?cliente=${cli.id}`)).dados.find((d) => d.nome === "conta-luz.pdf");
  assert.ok(doc, "documento guardado no cliente certo (número do cadastro)");
  assert.equal(doc.origem, "whatsapp");
  assert.equal(doc.leitura_status, "lido");
  assert.match(s.rede.whatsapp.at(-1).text.body, /Recebi "conta-luz\.pdf" ✅/);

  s.ia.respostas.push({ resposta: "Oi, Rosa! Falta só a lista de variáveis da folha de novembro, até 25/11.", encaminhar_equipe: false, assunto: null, departamento: "dp" });
  await s.webhook(msgWhats("553499990001", { texto: "o que está faltando?" }));
  assert.match(s.rede.whatsapp.at(-1).text.body, /variáveis da folha/);
  const pedido = s.ia.chamadas.at(-1);
  assert.match(JSON.stringify(pedido.system), /Documentos faltando: Variáveis da folha/, "a IA recebe os dados do cliente");

  s.ia.respostas.push({ resposta: "Vou passar para a equipe fiscal.", encaminhar_equipe: true, assunto: "Dúvida sobre ICMS", departamento: "fiscal" });
  await s.webhook(msgWhats("5534999990001", { texto: "posso tirar o ICMS da nota?" }));
  const ch = (await eq.get("/api/chamados?status=aberto")).dados.find((c) => c.origem === "whatsapp");
  assert.equal(ch.assunto, "Dúvida sobre ICMS");
  const resp = await eq.post(`/api/chamados/${ch.id}/responder`, { texto: "Rosa, vamos analisar e te retorno hoje." });
  assert.equal(resp.dados.status, "respondido");
  assert.match(s.rede.whatsapp.at(-1).text.body, /vamos analisar/, "a resposta da equipe vai para o WhatsApp");

  const antes = s.rede.whatsapp.length;
  await s.webhook(msgWhats("5511988887777", { texto: "oi" }));
  assert.match(s.rede.whatsapp.at(-1).text.body, /Não encontrei este número/);
  await s.webhook(msgWhats("5511988887777", { texto: "oi de novo" }));
  assert.equal(s.rede.whatsapp.length, antes + 1, "número desconhecido recebe o aviso uma vez por dia");
  const repetida = msgWhats("5534999990001", { texto: "repetida", id: "wamid.fixo" });
  await s.webhook(repetida);
  const n = s.rede.whatsapp.length;
  await s.webhook(repetida);
  assert.equal(s.rede.whatsapp.length, n, "a Meta reenvia: processa uma vez só");
});

test("guia entregue: conclui a tarefa, avisa o cliente, aparece no portal e o cliente marca como paga", async () => {
  const das = (await eq.get(`/api/tarefas?cliente=${cli.id}&status=abertas`)).dados.find((t) => t.nome.startsWith("DAS"));
  const arq = await eq.enviar("/api/arquivos", PDF, "application/pdf", "DAS-10-2026.pdf");
  assert.equal(arq.status, 200);
  const emails = s.rede.emails.length;
  const e = await eq.post("/api/entregas", { cliente_id: cli.id, arquivo_id: arq.dados.id, titulo: "DAS 10/2026", tipo: "guia", competencia: "2026-10", vencimento: "2026-11-23", valor_centavos: 123456, tarefa_id: das.id });
  assert.equal(e.status, 200, JSON.stringify(e.dados));
  assert.equal(e.dados.avisado, true);
  assert.equal(s.rede.emails.length, emails + 1);
  assert.match(s.rede.emails.at(-1).text, /DAS 10\/2026, vencimento 23\/11\/2026, R\$ 1234,56/);
  assert.equal((await eq.get(`/api/tarefas?cliente=${cli.id}`)).dados.find((t) => t.id === das.id).status, "concluida");
  const guias = (await portal.get("/api/portal/entregas")).dados;
  assert.equal(guias[0].titulo, "DAS 10/2026");
  const baixar = await portal.get(`/api/portal/entregas/${guias[0].id}/arquivo`);
  assert.equal(baixar.status, 200);
  assert.equal(baixar.cabecalhos.get("content-security-policy"), "sandbox");
  assert.equal((await portal.post(`/api/portal/entregas/${guias[0].id}/paga`)).status, 200);
  assert.equal((await eq.get(`/api/entregas?cliente=${cli.id}`)).dados[0].status, "paga");
});

test("chamado pelo portal e tarefa concluída com o tempo gasto", async () => {
  const c = await portal.post("/api/portal/chamados", { assunto: "Admissão de funcionário", texto: "Vou contratar uma atendente dia 10.", departamento: "dp" });
  assert.equal(c.status, 200);
  await eq.post(`/api/chamados/${c.dados.id}/responder`, { texto: "Mande RG, CPF e carteira de trabalho.", resolver: false });
  const meus = (await portal.get("/api/portal/chamados")).dados;
  assert.equal(meus.find((x) => x.id === c.dados.id).mensagens.length, 2);
  assert.equal((await portal.get("/api/portal/eu")).dados.contagem.chamados, 2, "respostas novas (portal e WhatsApp) aparecem para o cliente");
  const t = (await eq.get(`/api/tarefas?cliente=${cli.id}&status=abertas`)).dados[0];
  const r = await eq.put(`/api/tarefas/${t.id}`, { status: "concluida", minutos: 25 });
  assert.equal(r.dados.status, "concluida");
  assert.equal(r.dados.concluida_por, "Marta Lima");
  const painel = (await eq.get("/api/painel")).dados;
  assert.ok(painel.tarefas.concluidas_mes >= 2);
  assert.equal(painel.clientes, 1);
});

test("catálogo de obrigações editável: mudar o prazo recalcula as tarefas abertas", async () => {
  const fech = (await eq.get("/api/obrigacoes")).dados.find((o) => o.codigo === "FECHAMENTO");
  const r = await eq.put(`/api/obrigacoes/${fech.id}`, { regra: { mes: 1, tipo: "dia", dia: 10, ajuste: "antecipa" } });
  assert.equal(r.status, 200);
  const t = (await eq.get(`/api/tarefas?cliente=${cli.id}`)).dados.find((x) => x.obrigacao_id === fech.id);
  assert.equal(t.prazo_legal, "2026-11-10");
});
