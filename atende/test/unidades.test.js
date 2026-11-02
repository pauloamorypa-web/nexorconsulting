import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";
import { configCompleta } from "../src/db.js";
import { montarMensagens } from "../src/ia/agente.js";
import { criarIndice, dividirEmTrechos, termos } from "../src/ia/conhecimento.js";
import { montarInstrucoes } from "../src/ia/prompt.js";
import { componentesDoModelo, criarCloudAPI, dividirTexto, ErroMeta, paraFormatoWhatsApp, textoDoModelo, variaveisDoModelo } from "../src/meta/cloud-api.js";
import { assinaturaValida, extrairEventos } from "../src/meta/webhook.js";
import { criarCofre, conferirSenha, gerarHashSenha } from "../src/seguranca.js";
import { horariosLivres, instanteDe, situacaoHorario } from "../src/servicos/agenda.js";
import { preencherVariavel } from "../src/servicos/agendador.js";

describe("webhook da Meta", () => {
  test("assinatura HMAC", () => {
    const corpo = Buffer.from('{"a":1}');
    const ok = "sha256=" + createHmac("sha256", "s").update(corpo).digest("hex");
    assert.equal(assinaturaValida(corpo, ok, "s"), true);
    assert.equal(assinaturaValida(corpo, ok, "outro"), false);
    assert.equal(assinaturaValida(corpo, undefined, "s"), false);
    assert.equal(assinaturaValida(corpo, ok, ""), false);
  });

  test("lê todos os tipos de mensagem e status", () => {
    const valor = (messages, statuses) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "1" }, contacts: [{ wa_id: "55", profile: { name: "Zé" } }], messages, statuses } }] }] });
    const ev = extrairEventos(
      valor(
        [
          { from: "55", id: "a", timestamp: "1", type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "olha" } },
          { from: "55", id: "b", timestamp: "1", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "op1", title: "Sim" } } },
          { from: "55", id: "c", timestamp: "1", type: "location", location: { latitude: 1, longitude: 2, name: "Loja" } },
          { from: "55", id: "d", timestamp: "1", type: "audio", audio: { id: "m2", mime_type: "audio/ogg", voice: true } },
          { from: "55", id: "e", timestamp: "1", type: "reaction", reaction: { message_id: "x", emoji: "👍" } },
        ],
        [{ id: "w1", status: "failed", timestamp: "1", recipient_id: "55", errors: [{ code: 131047, title: "Re-engagement" }] }],
      ),
    );
    assert.equal(ev.length, 6);
    assert.deepEqual([ev[0].evento, ev[0].tipo, ev[0].texto, ev[0].midia.id, ev[0].nome], ["mensagem", "image", "olha", "m1", "Zé"]);
    assert.deepEqual([ev[1].tipo, ev[1].texto, ev[1].resposta.id], ["resposta", "Sim", "op1"]);
    assert.match(ev[2].texto, /Loja/);
    assert.equal(ev[3].midia.voz, true);
    assert.equal(ev[4].reacao.emoji, "👍");
    assert.deepEqual([ev[5].evento, ev[5].status, ev[5].erro.codigo], ["status", "falhou", 131047]);
  });

  test("ignora payloads de outros produtos", () => {
    assert.deepEqual(extrairEventos({ object: "page", entry: [] }), []);
  });
});

describe("Cloud API", () => {
  test("formatação para o WhatsApp", () => {
    assert.equal(paraFormatoWhatsApp("**oi** e [site](https://x.com)\n- item"), "*oi* e site: https://x.com\n• item");
  });

  test("divide textos longos em partes", () => {
    const partes = dividirTexto("a".repeat(3000) + "\n" + "b".repeat(3000), 4096);
    assert.equal(partes.length, 2);
    assert.ok(partes.every((p) => p.length <= 4096));
  });

  test("erros da Meta em português e temporários com nova tentativa", async () => {
    assert.match(new ErroMeta(400, { error: { code: 131047 } }).message, /24 horas/);
    let chamadas = 0;
    const api = criarCloudAPI({
      token: "t",
      idNumero: "1",
      tentativas: 3,
      fetchFn: async () => {
        chamadas++;
        if (chamadas === 1) return { ok: false, status: 500, headers: new Headers(), text: async () => "{}" };
        return { ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify({ messages: [{ id: "wamid.1" }] }) };
      },
    });
    const r = await api.enviarTexto("55", "oi");
    assert.equal(r.wamid, "wamid.1");
    assert.equal(chamadas, 2);
  });

  test("botões e listas respeitam os limites da Meta", async () => {
    let corpo;
    const api = criarCloudAPI({ token: "t", idNumero: "1", fetchFn: async (_, i) => ((corpo = JSON.parse(i.body)), { ok: true, status: 200, headers: new Headers(), text: async () => '{"messages":[{"id":"x"}]}' }) });
    await api.enviarBotoes("55", { texto: "Escolha", botoes: [{ titulo: "Uma opção com nome muito comprido" }, { titulo: "B" }, { titulo: "C" }, { titulo: "D" }] });
    assert.equal(corpo.interactive.action.buttons.length, 3);
    assert.equal(corpo.interactive.action.buttons[0].reply.title.length, 20);
  });

  test("modelos: variáveis, componentes e texto", () => {
    const m = { nome: "x", componentes: [{ type: "BODY", text: "Oi {{1}}, seu pedido {{2}} chegou" }] };
    assert.equal(variaveisDoModelo(m), 2);
    assert.equal(textoDoModelo(m, ["Ana", "#12"]), "Oi Ana, seu pedido #12 chegou");
    assert.deepEqual(componentesDoModelo(m, ["Ana", ""]), [{ type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "-" }] }]);
  });
});

describe("base de conhecimento", () => {
  const indice = criarIndice([
    { id: "1", titulo: "Prazo de entrega", conteudo: "Entregamos em Uberlândia em 24 horas. Interior de MG em até 5 dias úteis." },
    { id: "2", titulo: "Trocas e devoluções", conteudo: "Você pode trocar em até 30 dias com a etiqueta." },
    { id: "3", titulo: "Formas de pagamento", conteudo: "Aceitamos Pix, boleto e cartão em até 10x." },
  ]);

  test("acha o trecho certo mesmo com plural, acento e conjugação diferentes", () => {
    assert.equal(indice.buscar("quanto tempo demora a entrega?")[0].id, "1");
    assert.equal(indice.buscar("posso trocar?")[0].id, "2");
    assert.equal(indice.buscar("parcela no cartao")[0].id, "3");
    assert.deepEqual(indice.buscar("oi tudo bem"), []);
  });

  test("normalização e trechos", () => {
    assert.deepEqual(termos("Entregas"), termos("entregamos"));
    assert.deepEqual(termos("o pagamento"), termos("pagar"));
    const trechos = dividirEmTrechos("x".repeat(500) + "\n\n" + "y".repeat(500), 700);
    assert.equal(trechos.length, 2);
  });
});

describe("agenda", () => {
  const config = configCompleta({ agenda: { ativa: true, intervalo_min: 60, antecedencia_horas: 0, dias_adiante: 3 }, horario: { ativo: true, dias: { 0: [], 1: ["09:00-12:00"], 2: ["09:00-12:00"], 3: ["09:00-12:00"], 4: ["09:00-12:00"], 5: ["09:00-12:00"], 6: [] } } });
  const segunda8h = instanteDe("2026-11-02", "08:00");

  test("lista horários dentro do expediente e respeita ocupados", () => {
    const livres = horariosLivres({ config, ocupados: [{ inicio: instanteDe("2026-11-02", "10:00"), duracao_min: 60, status: "confirmado" }], agora: segunda8h, duracao: 60, limite: 5 });
    assert.deepEqual(
      livres.map((l) => l.horario),
      ["2026-11-02T09:00", "2026-11-02T11:00", "2026-11-03T09:00", "2026-11-03T10:00", "2026-11-03T11:00"],
    );
    assert.match(livres[0].texto, /segunda, 02\/11 às 09:00/);
  });

  test("serviço longo não ultrapassa o fim do expediente", () => {
    const livres = horariosLivres({ config, ocupados: [], agora: segunda8h, duracao: 150, limite: 3 });
    assert.ok(livres.every((l) => l.horario.endsWith("09:00")));
  });

  test("aberto ou fechado e quando volta", () => {
    assert.equal(situacaoHorario(config.horario, instanteDe("2026-11-02", "10:00")).aberto, true);
    const fechado = situacaoHorario(config.horario, instanteDe("2026-11-02", "13:00"));
    assert.equal(fechado.aberto, false);
    assert.match(fechado.abreTexto, /terça, 03\/11 às 09:00/);
  });
});

describe("IA", () => {
  test("instruções incluem a empresa, regras e aprendizados, sem dados voláteis", () => {
    const empresa = { nome: "Pet Feliz", segmento: "pet shop", config: configCompleta({ agente: { nome: "Bia", sobre: "Banho e tosa desde 2015" } }) };
    const t = montarInstrucoes(empresa, { aprendizados: [{ situacao: "pergunta preço", resposta_ideal: "Banho a partir de R$ 50" }], temConhecimento: true });
    assert.match(t, /Você é Bia, atendente virtual da empresa Pet Feliz \(pet shop\)/);
    assert.match(t, /Banho e tosa desde 2015/);
    assert.match(t, /Banho a partir de R\$ 50/);
    assert.match(t, /buscar_conhecimento/);
    assert.doesNotMatch(t, /\d{2}:\d{2}/);
  });

  test("monta a conversa alternando papéis e com a imagem pendente", async () => {
    const hist = [
      { direcao: "saida", autor: "campanha", tipo: "template", texto: "Promoção!", conteudo: {}, criada_em: 1 },
      { direcao: "entrada", autor: "cliente", tipo: "text", texto: "oi", conteudo: {}, criada_em: 2 },
      { direcao: "entrada", autor: "cliente", tipo: "image", texto: "", conteudo: { midia: { arquivo: "a", tipo: "image/png" } }, criada_em: 3 },
    ];
    const msgs = await montarMensagens(hist, { contexto: "<contexto>x</contexto>", carregarMidia: async () => Buffer.from("png") });
    assert.deepEqual(
      msgs.map((m) => m.role),
      ["user", "assistant", "user"],
    );
    const ultimo = msgs.at(-1).content;
    assert.equal(ultimo[0].text, "<contexto>x</contexto>");
    assert.equal(ultimo.find((b) => b.type === "image").source.data, Buffer.from("png").toString("base64"));
  });
});

describe("segurança e utilidades", () => {
  test("senhas com scrypt", () => {
    const h = gerarHashSenha("minha-senha");
    assert.equal(conferirSenha("minha-senha", h), true);
    assert.equal(conferirSenha("outra", h), false);
  });

  test("cofre criptografa e decifra; adulteração falha", () => {
    const cofre = criarCofre({ chaveMestra: "chave-teste" });
    const c = cofre.cifrar("EAAtoken");
    assert.notEqual(c, "EAAtoken");
    assert.equal(cofre.decifrar(c), "EAAtoken");
    const partes = c.split(".");
    partes[3] = Buffer.from("xxxxxxxx").toString("base64");
    assert.throws(() => cofre.decifrar(partes.join(".")));
  });

  test("variáveis de campanha", () => {
    const c = { nome: "Maria Clara Souza", wa_id: "5534999990000", campos: { cidade: "Uberlândia" } };
    assert.equal(preencherVariavel("{primeiro_nome}", c), "Maria");
    assert.equal(preencherVariavel("de {campo:cidade}", c), "de Uberlândia");
    assert.equal(preencherVariavel("{primeiro_nome}", { wa_id: "1" }), "cliente");
  });
});
