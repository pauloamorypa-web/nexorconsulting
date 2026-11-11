import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { criarAgente } from "../src/agente.js";
import { criarArmazenamento } from "../src/armazenamento.js";
import { cadenciaDoLead, cadenciaPendente } from "../src/cadencia.js";
import { CAMPANHAS, campanhaPorId, contextoCampanha, detectarCampanha } from "../src/campanhas.js";
import { config } from "../src/config.js";
import { criarExecutor } from "../src/ferramentas.js";
import { conversaoGoogle, eventoConversao, valorConversao } from "../src/meta.js";
import { classeDaNota, extrairSinais, pontuarLead, regiao } from "../src/qualificacao.js";
import { lerInvestimento, resumirCampanhas } from "../src/relatorio.js";
import { registrarConversao } from "../src/servidor.js";
import { extrairMensagens } from "../src/whatsapp.js";

const sha = (v) => createHash("sha256").update(v).digest("hex");

/* ---------- Registro ---------- */

test("registro: uma campanha por produto pronto, uma de TI e a guarda-chuva, todas completas", () => {
  assert.deepEqual(CAMPANHAS.map((c) => c.id), ["atende-ia", "rh-ponto", "contabil", "barber", "agente", "elo", "ti", "qualquer-cenario"]);
  assert.equal(new Set(CAMPANHAS.map((c) => c.id)).size, CAMPANHAS.length);
  for (const c of CAMPANHAS) {
    assert.ok(c.utm.length && c.produto && c.publico && c.abertura.includes("Blue"), c.id);
    assert.ok(c.perguntas.length >= 3 && c.perguntas.length <= 4, `${c.id}: 3 a 4 perguntas`);
    assert.ok(c.sinais_compra.length && c.sinais_descarte.length, c.id);
    assert.ok(c.preco && c.material, c.id);
    for (const d of ["d0", "d2", "d7"]) assert.ok(c.cadencia[d].whatsapp && c.cadencia[d].email.assunto && c.cadencia[d].email.texto, `${c.id} ${d}`);
  }
  assert.equal(CAMPANHAS.filter((c) => c.umbrella).length, 1);
});

test("contexto da campanha: abertura, perguntas e sinais; preço só com a opção ligada", () => {
  const c = campanhaPorId("barber");
  const sem = contextoCampanha(c);
  assert.match(sem, /<campanha id="barber">/);
  assert.match(sem, /Quantos barbeiros/);
  assert.doesNotMatch(sem, /R\$ 89/);
  assert.match(contextoCampanha(c, { mostrarPreco: true }), /R\$ 89/);
});

/* ---------- Detecção ---------- */

test("detecção pela utm_campaign, utm_content e utm_source, nessa ordem", () => {
  assert.equal(detectarCampanha({ origem: { utm_campaign: "meta-barber-teste30d" } }).id, "barber");
  assert.equal(detectarCampanha({ origem: { utm_campaign: "Google_Contabil_Fundadores" } }).id, "contabil");
  assert.equal(detectarCampanha({ origem: { utm_campaign: "teste12h" } }).id, "atende-ia");
  assert.equal(detectarCampanha({ origem: { utm_campaign: "nexor-agente" } }).id, "agente");
  assert.equal(detectarCampanha({ origem: { utm_campaign: "nexor-atende-qualquer-cenario" } }).id, "qualquer-cenario");
  const porConteudo = detectarCampanha({ origem: { utm_campaign: "black-friday", utm_content: "video-elo-instaladores" } });
  assert.deepEqual([porConteudo.id, porConteudo.via], ["elo", "utm_content"]);
  assert.equal(detectarCampanha({ origem: { utm_source: "service-desk-parceiro" } }).via, "utm_source");
  // "ti" só vale como palavra inteira
  assert.equal(detectarCampanha({ origem: { utm_campaign: "retirada" } }).id, "qualquer-cenario");
});

test("detecção pela página e pelo texto de entrada do WhatsApp", () => {
  assert.equal(detectarCampanha({ origem: { pagina: "https://nexorconsultingit.com.br/solucoes/agente-de-ia-no-whatsapp/" } }).id, "atende-ia");
  assert.equal(detectarCampanha({ origem: { pagina: "https://nexorconsultingit.com.br/solucoes/rede-fornecedores-instaladores/" } }).id, "elo");
  const casos = {
    "Quero o teste do Nexor Barber": "barber",
    "Olá, quero conhecer o Nexor Contábil": "contabil",
    "Oi! Vim pelo anúncio do ponto eletrônico": "rh-ponto",
    "Quero saber do Nexor Agente": "agente",
    "Tenho interesse no Nexor Elo": "elo",
    "Vocês têm sistema de chamados com SLA?": "ti",
    "Quero testar o Atende IA": "atende-ia",
    "Oi, tudo bem?": "qualquer-cenario",
  };
  for (const [texto, id] of Object.entries(casos)) assert.equal(detectarCampanha({ texto }).id, id, texto);
  assert.equal(detectarCampanha({ texto: "oi" }).via, "padrao");
});

test("detecção pelo anúncio de clique para o WhatsApp (referral)", () => {
  const payload = { entry: [{ changes: [{ value: { messages: [{ id: "m1", from: "5534900000001", type: "text", text: { body: "Olá!" }, referral: { source_type: "ad", source_id: "123", headline: "Teste grátis do Nexor Barber", ctwa_clid: "clid" } }] } }] }] };
  const [m] = extrairMensagens(payload);
  assert.deepEqual(m.referral, { source_type: "ad", source_id: "123", headline: "Teste grátis do Nexor Barber", ctwa_clid: "clid" });
  const d = detectarCampanha({ texto: m.texto, referral: m.referral });
  assert.deepEqual([d.id, d.via], ["barber", "anuncio_whatsapp"]);
  assert.equal(detectarCampanha({ referral: { source_url: "https://site/x?utm_campaign=rh-ponto" } }).id, "rh-ponto");
});

/* ---------- Pontuação ---------- */

const somaDosMotivos = (motivos) => motivos.reduce((a, m) => a + (Number(m.match(/^([+-]\d+) /)?.[1]) || 0), 0);

test("nota explicável: a soma dos motivos dá a nota e as classes seguem os limiares", () => {
  const r = pontuarLead(
    { segmento: "barbearia", porte_numero: 3, porte_unidade: "barbeiros", cargo: "dono", cidade: "Araguari", dor: "cliente falta muito", urgencia: "alta", orcamento: "sim", pediu_demo: true, telefone: "34900000000", ferramenta_atual: "caderno" },
    campanhaPorId("barber"),
  );
  assert.equal(r.nota, somaDosMotivos(r.motivos));
  assert.deepEqual(r.componentes, { fit: 40, intencao: 30, engajamento: 23 });
  assert.equal(r.nota, 93);
  assert.equal(r.classe, "quente");
  assert.equal(r.proxima_acao, "agendar_demo");
  assert.deepEqual([classeDaNota(70), classeDaNota(69), classeDaNota(40), classeDaNota(39)], ["quente", "morno", "morno", "frio"]);
});

test("região: Triângulo Mineiro pesa mais que o resto de MG e que outros estados", () => {
  const nota = (cidade) => pontuarLead({ segmento: "barbearia", cidade }, campanhaPorId("barber")).nota;
  assert.deepEqual([regiao("Ituiutaba").tipo, regiao("Belo Horizonte").tipo, regiao("Curitiba").tipo, regiao("", "MG").tipo], ["triangulo", "minas", "outra", "minas"]);
  assert.ok(nota("Uberlândia") > nota("Belo Horizonte") && nota("Belo Horizonte") > nota("Curitiba"));
});

test("CNAE do ICP conta como segmento; porte abaixo do mínimo não pontua", () => {
  const r = pontuarLead({ cnae: "6920-6/01", porte_numero: 5, porte_unidade: "empresas na carteira" }, campanhaPorId("contabil"));
  assert.ok(r.motivos.some((m) => m.startsWith("+15 CNAE 6920-6/01")));
  assert.ok(r.motivos.includes("porte abaixo do mínimo: 5 empresas na carteira (mínimo 15)"));
});

test("filtros anti-curioso: concorrente, estudante e pessoa física sem empresa", () => {
  const forte = { segmento: "barbearia", porte_numero: 5, porte_unidade: "barbeiros", cargo: "dono", dor: "x".repeat(10), urgencia: "alta", pediu_demo: true, telefone: "349" };
  const barber = campanhaPorId("barber");
  assert.deepEqual([pontuarLead({ ...forte, concorrente: true }, barber).nota, pontuarLead({ ...forte, concorrente: true }, barber).descarte], [10, "concorrente"]);
  assert.equal(pontuarLead({ ...forte, estudante: true }, barber).nota, 15);
  const pf = pontuarLead({ dor: "quero organizar minhas contas", pessoa_fisica: true, telefone: "349" }, campanhaPorId("agente"));
  assert.deepEqual([pf.classe, pf.descarte, pf.proxima_acao], ["frio", "pessoa_fisica", "explicar_produto_para_empresas"]);
  // Profissional autônomo não é "pessoa física sem empresa" no Barber, no Contábil e no Elo
  assert.equal(pontuarLead({ pessoa_fisica: true, perfil: "instalador", segmento: "cftv" }, campanhaPorId("elo")).descarte !== "pessoa_fisica", true);
});

test("quem só quer preço vira morno com o material certo, nunca é descartado", () => {
  const r = pontuarLead({ pediu_preco: true, apenas_preco: true }, campanhaPorId("contabil"));
  assert.deepEqual([r.nota, r.classe, r.descarte, r.proxima_acao], [40, "morno", null, "enviar_material_preco"]);
  // Mas concorrente que pede preço continua frio
  assert.equal(pontuarLead({ pediu_preco: true, concorrente: true }, campanhaPorId("contabil")).classe, "frio");
});

test("campanha guarda-chuva indica o produto e pontua pelo ICP dele", () => {
  const r = pontuarLead({ segmento: "pizzaria", dor: "demoro pra responder no WhatsApp e perco pedido" }, campanhaPorId("qualquer-cenario"));
  assert.equal(r.produto_indicado, "Nexor Atende IA");
  assert.equal(r.produto, "Nexor Atende IA");
  // Campanha de produto com lead de outro segmento: aponta o produto certo
  const outro = pontuarLead({ segmento: "escritório de contabilidade", dor: "cobrar documento dos clientes" }, campanhaPorId("barber"));
  assert.equal(outro.produto_indicado, "Nexor Contábil");
});

test("extrator de sinais lê porte, cargo, cidade, urgência, preço e contatos", () => {
  const s = extrairSinais(["Sou a dona de uma clínica em Araguari, chegam 900 mensagens por mês", "Quanto custa? Meu e-mail é ana@exemplo.com.br, quero começar logo"], { campanha: campanhaPorId("atende-ia") });
  assert.equal(s.porte_numero, 30);
  assert.equal(s.porte_unidade, "mensagens por dia");
  assert.equal(s.cargo, "dona");
  assert.equal(s.cidade, "Araguari");
  assert.equal(s.urgencia, "alta");
  assert.equal(s.pediu_preco, true);
  assert.equal(s.email, "ana@exemplo.com.br");
  // Nome de cidade que também é palavra comum só conta com preposição antes
  assert.equal(extrairSinais(["foi uma conquista abrir a loja"]).cidade, undefined);
});

/* ---------- Ferramenta, aviso à equipe e conversões ---------- */

async function executorDeTeste() {
  const avisos = [];
  const conversoes = [];
  const armazenamento = criarArmazenamento(await mkdtemp(path.join(tmpdir(), "nexor-")));
  const executar = criarExecutor({
    armazenamento,
    notificar: async (texto, dados) => avisos.push({ texto, dados }),
    agora: () => new Date("2026-10-30T16:00:00-03:00"),
    conversao: async (evento, lead) => conversoes.push({ evento, lead }),
  });
  const ctx = { idConversa: "wa:5534900000009", canal: "whatsapp", telefone: "5534900000009", campanha: campanhaPorId("barber"), campanhaVia: "texto", origem: {}, consentimento: true, transferir() {} };
  return { avisos, conversoes, executar, ctx, armazenamento };
}

test("qualificar_lead soma os sinais, avisa a equipe uma vez quando fica quente e manda Lead, LeadQualificado e AgendouDemo", async () => {
  const { avisos, conversoes, executar, ctx, armazenamento } = await executorDeTeste();
  const passo = async (input) => JSON.parse((await executar({ id: "q", name: "qualificar_lead", input }, ctx)).content);
  const r1 = await passo({ segmento: "barbearia", porte_numero: 4, porte_unidade: "barbeiros" });
  assert.equal(r1.classe, "morno");
  assert.equal(avisos.length, 0, "morno não avisa a equipe na hora");
  assert.deepEqual(conversoes.map((c) => c.evento), ["Lead"]);
  const r2 = await passo({ cargo: "dono", dor: "cliente falta", urgencia: "alta", pediu_demo: true });
  assert.equal(r2.classe, "quente");
  assert.equal(r2.proxima_acao, "agendar_demo");
  await passo({ cidade: "Uberlândia" });
  assert.equal(avisos.length, 1, "aviso de quente só uma vez");
  assert.match(avisos[0].texto, /🔥 Lead quente · Nexor Barber · nota \d+\/100/);
  assert.match(avisos[0].texto, /Por quê: \+15 segmento no ICP: barbearia/);
  const agendado = JSON.parse((await executar({ id: "a", name: "agendar_diagnostico", input: { horario: "2026-11-03T10:30", nome: "Teste", contato: "5534900000009", assunto: "Barber" } }, ctx)).content);
  assert.equal(agendado.ok, true);
  assert.deepEqual(conversoes.map((c) => c.evento), ["Lead", "LeadQualificado", "AgendouDemo"]);
  const leads = await armazenamento.listarLeads();
  assert.equal(leads.at(-1).agendou_demo, true);
  assert.equal(leads.at(-1).classe, "quente");
});

test("concorrente, estudante e pessoa física não viram evento de conversão", async () => {
  const { conversoes, executar, ctx } = await executorDeTeste();
  await executar({ id: "q", name: "qualificar_lead", input: { concorrente: true, pediu_preco: true } }, ctx);
  assert.equal(conversoes.length, 0);
});

test("eventos: valor proporcional à nota, dados em hash e nada de texto da conversa", () => {
  assert.deepEqual([valorConversao(80), valorConversao(80, "LeadQualificado"), valorConversao(80, "AgendouDemo"), valorConversao(150)], [240, 240, 320, 300]);
  const lead = { id: "conv-1", conversa: "wa:5534900000001", canal: "whatsapp", telefone: "5534900000001", nota: 85, classe: "quente", campanha: "barber", produto: "Nexor Barber", motivos: ["+12 dor declarada"], sinais: { dor: "segredo" }, origem: { ctwa_clid: "clid" } };
  const ev = eventoConversao("LeadQualificado", lead, new Date("2026-11-01T12:00:00Z"));
  assert.equal(ev.event_id, "conv-1-LeadQualificado");
  assert.equal(ev.action_source, "business_messaging");
  assert.equal(ev.messaging_channel, "whatsapp");
  assert.deepEqual(ev.user_data.ph, [sha("5534900000001")]);
  assert.equal(ev.user_data.ctwa_clid, "clid");
  assert.deepEqual(ev.custom_data, { value: 255, currency: "BRL", lead_nota: 85, lead_classe: "quente", campanha: "barber", content_name: "Nexor Barber" });
  assert.doesNotMatch(JSON.stringify(ev), /segredo|dor declarada|5534900000001"/);
  assert.equal(conversaoGoogle("Lead", lead), null, "sem gclid não há conversão do Google");
  const g = conversaoGoogle("AgendouDemo", { ...lead, origem: { gclid: "G1" } }, new Date("2026-11-01T12:00:00Z"));
  assert.deepEqual([g.gclid, g.conversion_name, g.conversion_value, g.order_id], ["G1", "AgendouDemo", 340, "conv-1-AgendouDemo"]);
});

test("conversões respeitam a LGPD: sem consentimento nada sai; no WhatsApp só com anúncio e a opção ligada", async () => {
  const enviados = [];
  const enviarMeta = async (eventos) => (enviados.push(...eventos), true);
  const base = { id: "conv-2", nota: 75, classe: "quente", campanha: "elo", produto: "Nexor Elo", telefone: "5534900000002" };
  assert.deepEqual(await registrarConversao("Lead", { ...base, canal: "site", consentimento_medicao: false }, { enviarMeta }), { meta: false, google: false });
  assert.equal((await registrarConversao("Lead", { ...base, canal: "site", consentimento_medicao: true }, { enviarMeta })).meta, true);
  assert.equal((await registrarConversao("Lead", { ...base, canal: "whatsapp", consentimento_medicao: true, origem: { ctwa_clid: "c" } }, { enviarMeta })).meta, false);
  config.metaWhatsapp = true;
  config.webhookLeads = "https://webhook.exemplo/x";
  try {
    const chamadas = [];
    const fetchFn = async (url, init) => (chamadas.push(JSON.parse(init.body)), { ok: true });
    const r = await registrarConversao("LeadQualificado", { ...base, canal: "whatsapp", consentimento_medicao: true, origem: { ctwa_clid: "c", gclid: "G" } }, { enviarMeta, fetchFn });
    assert.deepEqual(r, { meta: true, google: true });
    assert.equal(chamadas[0].tipo, "conversao_google");
    assert.equal(chamadas[0].google.conversion_value, 225);
  } finally {
    config.metaWhatsapp = false;
    config.webhookLeads = "";
  }
  assert.equal(enviados.length, 2);
});

/* ---------- Agente: contexto da campanha ---------- */

test("a Blue recebe o bloco da campanha só na primeira mensagem, e a campanha padrão cede a uma detectada", async () => {
  const pedidos = [];
  const cliente = { beta: { messages: { create: async (p) => (pedidos.push(structuredClone(p)), { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }) } } };
  const agente = criarAgente({ cliente, armazenamento: criarArmazenamento(await mkdtemp(path.join(tmpdir(), "nexor-"))) });
  const contexto = (i) => pedidos[i].messages.at(-1).content[0].text;
  await agente.responder({ idConversa: "wa:1", canal: "whatsapp", texto: "oi", telefone: "1", campanha: detectarCampanha({ texto: "oi" }) });
  assert.match(contexto(0), /<campanha id="qualquer-cenario">/);
  await agente.responder({ idConversa: "wa:1", canal: "whatsapp", texto: "tenho uma barbearia", telefone: "1", campanha: detectarCampanha({ texto: "tenho uma barbearia" }) });
  assert.match(contexto(1), /<campanha id="barber">/);
  await agente.responder({ idConversa: "wa:1", canal: "whatsapp", texto: "e o contábil?", telefone: "1", campanha: detectarCampanha({ texto: "Nexor Contábil" }) });
  assert.doesNotMatch(contexto(2), /<campanha/, "campanha já definida não muda nem repete o bloco");
});

/* ---------- Relatório e cadência ---------- */

const H = (h) => new Date(Date.parse("2026-11-10T09:00:00-03:00") + h * 3600_000).toISOString();

test("relatório por campanha: % de quentes, custo por lead quente, tempos e motivos de descarte", () => {
  const registros = [
    { tipo: "conversa", id: "conv-a", conversa: "wa:1", campanha: "barber", classe: "morno", nota: 50, telefone: "5534900000001", inicio_em: H(0), primeira_resposta_em: H(0.001), registrado_em: H(0) },
    { tipo: "conversa", id: "conv-a", conversa: "wa:1", campanha: "barber", classe: "quente", nota: 85, telefone: "5534900000001", quente_em: H(0.1), inicio_em: H(0), primeira_resposta_em: H(0.001), registrado_em: H(0.1) },
    { tipo: "conversa", id: "conv-b", conversa: "wa:2", campanha: "barber", classe: "frio", nota: 10, descarte: "concorrente", registrado_em: H(1) },
    { tipo: "conversa", id: "conv-c", conversa: "site:3", campanha: "barber", classe: "quente", nota: 90, registrado_em: H(2), quente_em: H(2) },
    { tipo: "teste", id: "site-1", temperatura: "morno", solucao: "Nexor Contábil", origem: {}, registrado_em: H(3) },
    { tipo: "contato_equipe", telefone: "34900000001", contato_em: H(0.6), registrado_em: H(0.6) },
  ];
  const { porCampanha, investimento_sem_campanha } = resumirCampanhas(registros, { investimento: "meta/barber: R$ 400; contabil: 100; outra: 50" });
  const b = porCampanha.find((g) => g.campanha === "barber");
  assert.deepEqual([b.leads, b.quente, b.frio, b.pct_quentes, b.nota_media], [3, 2, 1, 67, 62]);
  assert.deepEqual([b.investimento, b.custo_por_lead, b.custo_por_lead_quente], [400, 133.33, 200]);
  assert.equal(b.primeira_resposta_blue_mediana_s, 3.6);
  assert.equal(b.primeiro_contato_equipe_mediana_min, 30);
  assert.equal(b.quentes_sem_contato, 1);
  assert.deepEqual(b.motivos_descarte, { concorrente: 1 });
  const c = porCampanha.find((g) => g.campanha === "contabil");
  assert.deepEqual([c.leads, c.morno, c.custo_por_lead_quente], [1, 1, null]);
  assert.deepEqual(investimento_sem_campanha, { outra: 50 });
  assert.deepEqual(lerInvestimento("barber: R$ 1.200,50").porCampanha, { barber: 1200.5 });
});

test("cadência dos mornos: D+0, D+2 e D+7 por WhatsApp e e-mail, só sugerida e só com opt-in", () => {
  const lead = { id: "conv-x", campanha: "rh-ponto", classe: "morno", nome: "Carla Souza", empresa: "Loja Exemplo", aceita_contato: true, sinais: { pediu_preco: true }, registrado_em: "2026-11-10T12:00:00Z" };
  const c = cadenciaDoLead(lead);
  assert.equal(c.envio_automatico, false);
  assert.deepEqual(c.passos.map((p) => [p.dia, p.data]), [["D+0", "2026-11-10"], ["D+2", "2026-11-12"], ["D+7", "2026-11-17"]]);
  assert.match(c.passos[0].whatsapp, /^Oi, Carla! .*Nexor RH \+ Ponto.*R\$ 9,90/);
  assert.match(c.passos[1].email.texto, /Loja Exemplo/);
  assert.ok(c.passos.every((p) => p.whatsapp && p.email.assunto && !/\{\w+\}/.test(p.whatsapp + p.email.texto)));
  const semOptIn = cadenciaDoLead({ ...lead, aceita_contato: false, nome: undefined });
  assert.equal(semOptIn.passos.length, 1);
  assert.match(semOptIn.passos[0].whatsapp, /^Oi! .*Posso te mandar um resumo sobre o Nexor RH \+ Ponto/);
  const pend = cadenciaPendente([lead, { ...lead, id: "q", classe: "quente" }], new Date("2026-11-13T12:00:00Z"));
  assert.deepEqual(pend.map((p) => [p.lead, p.proximo.dia]), [["conv-x", "D+7"]]);
});
