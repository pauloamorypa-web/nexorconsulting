/* LGPD no Atende: aceite de termos, opt-in de marketing (painel, CSV e SAIR/PARAR no WhatsApp),
   exportação e exclusão de contato, isolamento entre empresas e expurgo por prazo. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { criarMidia } from "../src/servicos/midia.js";
import { iniciarApp, mensagemRecebida } from "./ajuda.js";

let t;
let a; // dono da empresa A (tem o número 123456789)
let b; // dono da empresa B
let empA;
let empB;

/** Cliente com o próprio cookie (duas empresas no mesmo teste) */
function cliente() {
  let cookie = "";
  return async (metodo, caminho, corpo) => {
    const r = await fetch(t.base + caminho, { method: metodo, headers: { "Content-Type": "application/json", "x-nexor": "1", ...(cookie ? { cookie } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, dados: tipo.includes("json") ? await r.json() : await r.text(), cabecalhos: r.headers };
  };
}

before(async () => {
  t = await iniciarApp({ extraCfg: { permitirCadastro: true } });
  a = cliente();
  b = cliente();
  assert.equal((await a("POST", "/api/cadastro", { empresa: "Loja A", nome: "Paula Dona", email: "paula@a.com", senha: "senha-forte-123" })).status, 400, "sem aceite dos termos");
  assert.equal((await a("POST", "/api/cadastro", { aceite_termos: true, empresa: "Loja A", nome: "Paula Dona", email: "paula@a.com", senha: "senha-forte-123" })).status, 200);
  assert.equal((await b("POST", "/api/cadastro", { aceite_termos: true, empresa: "Loja B", nome: "Beto Dono", email: "beto@b.com", senha: "senha-forte-123" })).status, 200);
  assert.equal((await a("POST", "/api/canais", { phone_number_id: "123456789", waba_id: "987654321", token: "EAAtokenfalso1234567890" })).status, 200);
  empA = (await a("GET", "/api/eu")).dados.empresa.id;
  empB = (await b("GET", "/api/eu")).dados.empresa.id;
});
after(() => t.fechar());

const repo = () => t.app.repo;
const publico = async () => (await a("POST", "/api/campanhas/publico", { tags: [], etapas: [] })).dados.total;

test("termos: aceite no cadastro com IP; nova versão bloqueia o painel até aceitar", async () => {
  const eu = (await a("GET", "/api/eu")).dados;
  assert.equal(eu.termos.pendente, false);
  const aceites = (await a("GET", "/api/lgpd/aceites")).dados;
  assert.equal(aceites[0].origem, "cadastro");
  assert.ok(aceites[0].ip);
  const antiga = t.app.cfg.termos.versao;
  t.app.cfg.termos.versao = "2099-01-01";
  try {
    assert.equal((await a("GET", "/api/eu")).dados.termos.pendente, true);
    assert.equal((await a("GET", "/api/contatos")).status, 428);
    assert.equal((await a("POST", "/api/termos/aceite", { aceito: true, versao: "2099-01-01" })).status, 200);
    assert.equal((await a("GET", "/api/contatos")).status, 200);
  } finally {
    t.app.cfg.termos.versao = antiga;
  }
});

test("opt-in: contato novo entra sem; painel marca com data e origem; SAIR/PARAR no WhatsApp retira", async () => {
  await t.webhook(mensagemRecebida("Oi, quero saber o preço", { de: "5534911110001", nome: "Lia" }));
  let c = repo().contatoPorWa(empA, "5534911110001");
  assert.equal(c.marketing_optin, false, "desmarcado por padrão");
  assert.equal(await publico(), 0, "campanha só para quem tem opt-in");
  const r = await a("PUT", `/api/contatos/${c.id}`, { marketing_optin: true });
  assert.equal(r.status, 200);
  assert.equal(r.dados.marketing_optin, true);
  assert.equal(r.dados.marketing_optin_origem, "painel: Paula Dona");
  assert.ok(r.dados.marketing_optin_em > 0);
  assert.equal(await publico(), 1);
  for (const palavra of ["SAIR", "parar"]) {
    await a("PUT", `/api/contatos/${c.id}`, { marketing_optin: true, opt_out: false });
    await t.webhook(mensagemRecebida(palavra, { de: "5534911110001", nome: "Lia" }));
    c = repo().contatoPorWa(empA, "5534911110001");
    assert.equal(c.marketing_optin, false, palavra);
    assert.match(c.marketing_optin_origem, new RegExp(`WhatsApp: respondeu "${palavra}"`));
    assert.equal(await publico(), 0);
  }
});

test("importar CSV: sem coluna de opt-in todos entram sem; com coluna, vale o que ela diz", async () => {
  let r = await a("POST", "/api/contatos/importar", { csv: "nome,telefone\nCarlos,34 99999-0001\nDora,34 99999-0002" });
  assert.equal(r.dados.importados, 2);
  assert.equal(r.dados.com_optin, 0);
  r = await a("POST", "/api/contatos/importar", { csv: "nome;whatsapp;opt-in marketing\nEva;34 99999-0003;sim\nFabio;34 99999-0004;não\nCarlos;34 99999-0001;" });
  assert.equal(r.dados.com_optin, 1);
  const eva = repo().contatoPorWa(empA, "5534999990003");
  assert.equal(eva.marketing_optin, true);
  assert.equal(eva.marketing_optin_origem, "importação CSV por Paula Dona");
  assert.equal(repo().contatoPorWa(empA, "5534999990004").marketing_optin, false);
  assert.equal(repo().contatoPorWa(empA, "5534999990001").marketing_optin, false, "vazio não dá opt-in");
});

async function contatoComConversa(wa) {
  await t.webhook(mensagemRecebida("Mando a foto do produto", { de: wa, nome: "Gil Souza" }));
  const c = repo().contatoPorWa(empA, wa);
  const conversa = repo().conversaAtiva(empA, c.id);
  const midia = criarMidia(t.app.cfg.pastaDados);
  const arquivo = await midia.salvar(empA, Buffer.from("foto-do-cliente"), "image/jpeg");
  repo().salvarMensagem({ empresa_id: empA, conversa_id: conversa.id, direcao: "entrada", autor: "cliente", tipo: "image", texto: "", conteudo: { midia: { arquivo, tipo: "image/jpeg" } } });
  const ag = repo().criarAgendamento({ empresa_id: empA, contato_id: c.id, inicio: Date.now() + 86400_000, duracao_min: 30, servico: "Prova", observacoes: "alergia a látex" });
  return { c, conversa, arquivo, ag };
}

test("exportar e excluir contato: JSON com conversas e mídias; exclusão apaga tudo e registra o pedido", async () => {
  const { c, arquivo } = await contatoComConversa("5534922220001");
  const exp = await a("POST", `/api/lgpd/titulares/contato/${c.id}/exportar`);
  assert.equal(exp.status, 200);
  assert.match(exp.cabecalhos.get("content-disposition"), /attachment/);
  assert.equal(exp.dados.dados.cadastro[0].wa_id, "5534922220001");
  assert.ok(exp.dados.dados.mensagens.length >= 2);
  assert.equal(exp.dados.dados.agendamentos[0].observacoes, "alergia a látex");
  assert.equal(Buffer.from(exp.dados.arquivos.find((x) => x.id === arquivo).base64, "base64").toString(), "foto-do-cliente");

  assert.equal((await a("POST", `/api/lgpd/titulares/contato/${c.id}/excluir`, {})).status, 400, "precisa confirmar");
  const r = await a("POST", `/api/lgpd/titulares/contato/${c.id}/excluir`, { confirmar: true });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.apagados.cadastro, 1);
  assert.deepEqual(r.dados.bloqueados, [], "atendimento não tem guarda legal");
  assert.ok(!repo().contato(empA, c.id));
  assert.equal(repo().db.prepare("SELECT COUNT(*) n FROM conversas WHERE contato_id = ?").get(c.id).n, 0);
  assert.equal(existsSync(join(t.app.cfg.pastaDados, "midia", arquivo)), false, "mídia apagada do disco");
  const ag = repo().db.prepare("SELECT * FROM agendamentos WHERE empresa_id = ? AND servico = 'Prova'").get(empA);
  assert.equal(ag.contato_id, null);
  assert.equal(ag.observacoes, null);
  const pedidos = (await a("GET", "/api/lgpd/pedidos")).dados;
  assert.deepEqual(pedidos.slice(0, 2).map((p) => p.tipo), ["exclusao", "exportacao"]);
  assert.equal(pedidos[0].autor, "Paula Dona");
  assert.ok((await a("GET", "/api/auditoria")).dados.some((x) => x.acao === "lgpd_exclusao"));
});

test("empresa B não exporta nem apaga contato da empresa A; atendente não acessa", async () => {
  const { c } = await contatoComConversa("5534933330001");
  assert.equal((await b("POST", `/api/lgpd/titulares/contato/${c.id}/exportar`)).status, 404);
  assert.equal((await b("POST", `/api/lgpd/titulares/contato/${c.id}/excluir`, { confirmar: true })).status, 404);
  assert.ok(repo().contato(empA, c.id), "continua lá");
  assert.equal((await b("GET", "/api/lgpd/pedidos")).dados.length, 0);
  await a("POST", "/api/usuarios", { nome: "Ato", email: "ato@a.com", senha: "senha-do-ato-1", papel: "atendente" });
  const at = cliente();
  await at("POST", "/api/entrar", { email: "ato@a.com", senha: "senha-do-ato-1" });
  await at("POST", "/api/termos/aceite", { aceito: true });
  assert.equal((await at("POST", `/api/lgpd/titulares/contato/${c.id}/exportar`)).status, 403);
  assert.equal((await at("POST", `/api/lgpd/titulares/contato/${c.id}/excluir`, { confirmar: true })).status, 403);
  assert.ok(empB);
});

test("expurgo: conversa com mais de 24 meses e lead parado há 12 meses saem; cliente e recentes ficam", async () => {
  const velha = await contatoComConversa("5534944440001"); // vira lead parado
  const cliente = await contatoComConversa("5534944440002"); // cliente com conversa velha
  const recente = await contatoComConversa("5534944440003");
  repo().atualizarContato(empA, cliente.c.id, { etapa: "cliente" });
  const ha25meses = Date.now() - 25 * 31 * 86400_000;
  repo().db.prepare("UPDATE conversas SET ultima_msg_em = ? WHERE id IN (?, ?)").run(ha25meses, velha.conversa.id, cliente.conversa.id);
  repo().db.prepare("UPDATE contatos SET ultima_entrada_em = ?, atualizado_em = ? WHERE id IN (?, ?)").run(ha25meses, ha25meses, velha.c.id, cliente.c.id);
  const r = (await a("POST", "/api/lgpd/expurgo")).dados;
  assert.ok(r.resultado.conversa_atendimento >= 2);
  assert.ok(r.resultado.lead >= 1);
  assert.ok(!repo().contato(empA, velha.c.id), "lead parado sai");
  assert.ok(repo().contato(empA, cliente.c.id), "cliente fica");
  assert.ok(!repo().conversaAtiva(empA, cliente.c.id), "mas a conversa velha dele sai");
  assert.equal(existsSync(join(t.app.cfg.pastaDados, "midia", cliente.arquivo)), false);
  assert.ok(repo().conversaAtiva(empA, recente.c.id), "conversa recente fica");
  assert.equal((await a("GET", "/api/lgpd/prazos")).dados.conversa_atendimento.meses, 24);
  // O agendador roda o expurgo das outras empresas uma vez por dia
  await t.app.agendador.ciclo();
  assert.ok(repo().db.prepare("SELECT 1 FROM lgpd_expurgos WHERE empresa_id = ?").get(empB));
  assert.ok((await a("GET", "/api/lgpd/expurgo")).dados.length >= 1);
});
