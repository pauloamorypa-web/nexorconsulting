import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { contaPronta, ferramenta, iniciarApp, mensagemRecebida, statusRecebido, texto } from "./ajuda.js";

describe("conta e segurança", async () => {
  const t = await iniciarApp();
  after(() => t.fechar());

  test("primeiro acesso cria a empresa e o dono", async () => {
    assert.equal((await t.chamar("GET", "/api/estado")).dados.primeiroAcesso, true);
    const r = await t.chamar("POST", "/api/cadastro", { empresa: "Clínica Sorriso", nome: "Rita", email: "rita@x.com", senha: "12345678x" });
    assert.equal(r.status, 200);
    const eu = await t.chamar("GET", "/api/eu");
    assert.equal(eu.dados.usuario.papel, "dono");
    assert.equal(eu.dados.empresa.nome, "Clínica Sorriso");
    assert.equal(eu.dados.usuario.senha_hash, undefined);
  });

  test("depois do primeiro acesso o cadastro fecha", async () => {
    t.sair();
    const r = await t.chamar("POST", "/api/cadastro", { empresa: "Outra", nome: "X", email: "x@x.com", senha: "12345678x" });
    assert.equal(r.status, 403);
  });

  test("login errado e certo", async () => {
    assert.equal((await t.chamar("POST", "/api/entrar", { email: "rita@x.com", senha: "errada" })).status, 401);
    assert.equal((await t.chamar("POST", "/api/entrar", { email: "rita@x.com", senha: "12345678x" })).status, 200);
  });

  test("sem o cabeçalho anti-CSRF, alterações são recusadas", async () => {
    const r = await t.chamar("PUT", "/api/empresa", { nome: "Hack" }, { "x-nexor": "0" });
    assert.equal(r.status, 403);
  });

  test("sem login a API pede autenticação", async () => {
    t.sair();
    assert.equal((await t.chamar("GET", "/api/conversas")).status, 401);
  });

  test("webhook com assinatura errada é recusado", async () => {
    assert.equal(await t.webhook(mensagemRecebida("oi"), "outro-segredo"), 401);
  });

  test("verificação do webhook pela Meta", async () => {
    const ok = await fetch(`${t.base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=123`);
    assert.equal(await ok.text(), "123");
    const ruim = await fetch(`${t.base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123`);
    assert.equal(ruim.status, 403);
  });
});

describe("atendimento pelo WhatsApp", async () => {
  const t = await contaPronta();
  after(() => t.fechar());

  test("o número conectado aparece sem expor o token", async () => {
    const canais = (await t.chamar("GET", "/api/canais")).dados;
    assert.equal(canais[0].numero, "+55 34 99999-0000");
    assert.equal(canais[0].token, "••••••••");
    const modelos = (await t.chamar("GET", "/api/modelos")).dados;
    assert.equal(modelos[0].nome, "boas_vindas");
    assert.equal(modelos[0].variaveis, 1);
  });

  test("a IA responde, usa ferramentas e atualiza o CRM", async () => {
    t.claude.fila.push(ferramenta("atualizar_contato", { nome: "Ana Souza", interesse: "vestido de festa", etapa: "qualificado" }), texto("Oi, **Ana**! Temos vestidos lindos. Qual o tamanho?"));
    assert.equal(await t.webhook(mensagemRecebida("Oi, quero um vestido de festa")), 200);
    const enviado = t.meta.enviados.at(-1);
    assert.equal(enviado.to, "5534988887777");
    assert.equal(enviado.text.body, "Oi, *Ana*! Temos vestidos lindos. Qual o tamanho?");
    const conversas = (await t.chamar("GET", "/api/conversas")).dados;
    assert.equal(conversas.length, 1);
    assert.equal(conversas[0].contato_nome, "Ana Souza");
    assert.equal(conversas[0].contato_etapa, "qualificado");
    // O contexto vai para a IA com o horário e os dados do cliente
    const ultima = t.claude.chamadas.at(-2).messages.at(-1);
    assert.match(ultima.content[0].text, /<contexto>/);
    assert.match(ultima.content.at(-1).text, /vestido de festa/);
  });

  test("mensagem repetida pela Meta não gera resposta duplicada", async () => {
    const antes = t.meta.enviados.length;
    const p = mensagemRecebida("tamanho M", { id: "wamid.repetida" });
    t.claude.fila.push(texto("Perfeito!"));
    await t.webhook(p);
    await t.webhook(p);
    assert.equal(t.meta.enviados.length, antes + 1);
  });

  test("status de entrega atualiza a mensagem", async () => {
    const conversa = (await t.chamar("GET", "/api/conversas")).dados[0];
    const det = (await t.chamar("GET", `/api/conversas/${conversa.id}`)).dados;
    const saida = det.mensagens.find((m) => m.direcao === "saida" && m.wamid);
    await t.webhook(statusRecebido(saida.wamid, "read"));
    await t.webhook(statusRecebido(saida.wamid, "delivered")); // fora de ordem: não volta
    const depois = (await t.chamar("GET", `/api/conversas/${conversa.id}`)).dados.mensagens.find((m) => m.id === saida.id);
    assert.equal(depois.status, "lida");
  });

  test("botões interativos enviados pela IA", async () => {
    t.claude.fila.push(ferramenta("enviar_opcoes", { texto: "Prefere qual cor?", opcoes: [{ titulo: "Azul" }, { titulo: "Preto" }] }), texto(""));
    await t.webhook(mensagemRecebida("quais cores?"));
    const env = t.meta.enviados.at(-1);
    assert.equal(env.type, "interactive");
    assert.equal(env.interactive.type, "button");
    assert.deepEqual(env.interactive.action.buttons.map((b) => b.reply.title), ["Azul", "Preto"]);
  });

  test("transferência para humano pausa a IA e alerta a equipe", async () => {
    t.claude.fila.push(ferramenta("transferir_para_humano", { motivo: "quer desconto", resumo: "Cliente quer 20% de desconto" }), texto("Vou chamar uma pessoa da equipe 😉"));
    await t.webhook(mensagemRecebida("me dá um desconto?"));
    const c = (await t.chamar("GET", "/api/conversas?filtro=aguardando")).dados[0];
    assert.equal(c.modo, "humano");
    assert.equal(c.status, "aguardando");
    // Nova mensagem do cliente não chama a IA
    const chamadas = t.claude.chamadas.length;
    await t.webhook(mensagemRecebida("alô?"));
    assert.equal(t.claude.chamadas.length, chamadas);
  });

  test("a equipe responde, assume e devolve para a IA", async () => {
    const c = (await t.chamar("GET", "/api/conversas")).dados[0];
    const r = await t.chamar("POST", `/api/conversas/${c.id}/mensagens`, { texto: "Oi Ana, aqui é a Paula!" });
    assert.equal(r.status, 200);
    assert.equal(r.dados.autor, "humano");
    assert.equal(t.meta.enviados.at(-1).text.body, "Oi Ana, aqui é a Paula!");
    const devolvida = await t.chamar("POST", `/api/conversas/${c.id}/modo`, { modo: "ia" });
    assert.equal(devolvida.dados.modo, "ia");
  });

  test("corrigir uma resposta da IA vira aprendizado e entra nas instruções", async () => {
    const c = (await t.chamar("GET", "/api/conversas")).dados[0];
    const msgs = (await t.chamar("GET", `/api/conversas/${c.id}`)).dados.mensagens;
    const daIA = msgs.find((m) => m.autor === "ia" && m.tipo === "text");
    const r = await t.chamar("POST", `/api/mensagens/${daIA.id}/corrigir`, { resposta_ideal: "Temos do P ao GG, quer ver fotos?" });
    assert.equal(r.status, 200);
    t.claude.fila.push(texto("ok"));
    await t.webhook(mensagemRecebida("e o tamanho?"));
    assert.match(t.claude.chamadas.at(-1).system[0].text, /Temos do P ao GG/);
  });

  test("cliente pede para sair das campanhas", async () => {
    await t.webhook(mensagemRecebida("PARAR"));
    const contato = (await t.chamar("GET", "/api/contatos")).dados.itens[0];
    assert.equal(contato.opt_out, true);
    const publico = await t.chamar("POST", "/api/campanhas/publico", { tags: [], etapas: [] });
    assert.equal(publico.dados.total, 0);
  });

  test("fora da janela de 24 h a equipe precisa de modelo", async () => {
    const r = await t.chamar("POST", "/api/conversas/nova", { wa_id: "5511000000001", nome: "Bruno" });
    const outra = await t.chamar("POST", `/api/conversas/${r.dados.id}/mensagens`, { texto: "oi" });
    assert.equal(outra.status, 409);
    assert.equal(outra.dados.codigo, "janela_fechada");
    const comModelo = await t.chamar("POST", `/api/conversas/${r.dados.id}/mensagens`, { modelo: { nome: "boas_vindas", idioma: "pt_BR", variaveis: ["Bruno"] } });
    assert.equal(comModelo.status, 200);
    assert.equal(comModelo.dados.texto, "Olá Bruno, temos novidades!");
    assert.equal(t.meta.enviados.at(-1).template.components[0].parameters[0].text, "Bruno");
  });

  test("erro da Meta volta explicado em português", async () => {
    const r = await t.chamar("POST", "/api/conversas/nova", { wa_id: "5511000000000", modelo: { nome: "boas_vindas", idioma: "pt_BR", variaveis: ["X"] } });
    assert.equal(r.status, 502);
    assert.match(r.dados.erro, /24 horas/);
  });

  test("análise inteligente da conversa", async () => {
    const c = (await t.chamar("GET", "/api/conversas?filtro=todas")).dados.find((x) => x.contato_wa_id === "5534988887777");
    t.claude.fila.push(
      texto(JSON.stringify({ sentimento: "positivo", intencao: "Compra", urgencia: "media", temperatura_lead: 82, etapa_sugerida: "proposta", resumo: "Quer vestido M azul.", proxima_acao: "Enviar fotos", precisa_humano: false, motivo_alerta: "", objecoes: ["preço"] })),
    );
    const a = await t.chamar("POST", `/api/conversas/${c.id}/analisar`);
    assert.equal(a.status, 200);
    assert.equal(a.dados.temperatura_lead, 82);
    assert.equal(t.claude.chamadas.at(-1).output_config.format.type, "json_schema");
    const contato = (await t.chamar("GET", "/api/contatos")).dados.itens.find((x) => x.wa_id === "5534988887777");
    assert.equal(contato.pontuacao, 82);
    assert.equal(contato.etapa, "proposta");
  });

  test("playground testa a IA sem gravar nada", async () => {
    const antes = (await t.chamar("GET", "/api/conversas?filtro=todas")).dados.length;
    t.claude.fila.push(ferramenta("atualizar_contato", { nome: "Teste" }), texto("Olá, **Teste**!"));
    const r = await t.chamar("POST", "/api/playground", { mensagens: [{ autor: "cliente", texto: "oi, sou o Teste" }] });
    assert.equal(r.status, 200);
    assert.equal(r.dados.texto, "Olá, *Teste*!");
    assert.deepEqual(r.dados.ferramentas, ["atualizar_contato"]);
    assert.equal((await t.chamar("GET", "/api/conversas?filtro=todas")).dados.length, antes);
  });

  test("métricas do painel", async () => {
    const m = (await t.chamar("GET", "/api/metricas?dias=7")).dados;
    assert.ok(m.mensagens.recebidas >= 5);
    assert.ok(m.mensagens.pela_ia >= 2);
    assert.ok(m.automacao > 0);
  });
});

describe("agenda pela IA", async () => {
  const t = await contaPronta();
  after(() => t.fechar());

  test("a IA vê horários e agenda; horário ocupado é recusado", async () => {
    const cfg = { agenda: { ativa: true, servicos: [{ nome: "Consulta", duracao: 60 }], antecedencia_horas: 0, dias_adiante: 10, intervalo_min: 60 }, horario: { ativo: true, dias: { 0: ["08:00-18:00"], 1: ["08:00-18:00"], 2: ["08:00-18:00"], 3: ["08:00-18:00"], 4: ["08:00-18:00"], 5: ["08:00-18:00"], 6: ["08:00-18:00"] } } };
    assert.equal((await t.chamar("PUT", "/api/empresa", { config: cfg })).status, 200);
    const livres = (await t.chamar("GET", "/api/agenda/livres?servico=Consulta")).dados;
    assert.ok(livres.length > 0);
    const h = livres[0].horario;
    t.claude.fila.push(ferramenta("agendar", { horario: h, servico: "Consulta" }), texto("Agendado!"));
    await t.webhook(mensagemRecebida("pode marcar"));
    const agenda = (await t.chamar("GET", "/api/agenda")).dados;
    assert.equal(agenda.length, 1);
    assert.equal(agenda[0].servico, "Consulta");
    // O mesmo horário de novo: a ferramenta devolve erro para a IA oferecer outro
    let resultado;
    t.claude.fila.push(ferramenta("agendar", { horario: h, servico: "Consulta" }), (p) => {
      resultado = p.messages.at(-1).content[0].content;
      return texto("Esse já foi, veja outros.");
    });
    await t.webhook(mensagemRecebida("marca de novo", { de: "5534911112222" }));
    assert.match(resultado, /não está mais livre/);
  });
});
