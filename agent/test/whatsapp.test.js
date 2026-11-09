import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { config } from "../src/config.js";
import { assinaturaValida, dividirTexto, enviarTemplate, extrairMensagens } from "../src/whatsapp.js";

test("assinatura do webhook: aceita a correta e recusa as outras", () => {
  const corpo = Buffer.from('{"entry":[]}');
  const assinatura = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
  assert.equal(assinaturaValida(corpo, assinatura, "segredo"), true);
  assert.equal(assinaturaValida(corpo, assinatura, "outro"), false);
  assert.equal(assinaturaValida(corpo, undefined, "segredo"), false);
  assert.equal(assinaturaValida(corpo, assinatura, ""), false);
});

test("extrai texto, remetente e nome do perfil", () => {
  const payload = {
    entry: [{ changes: [{ value: {
      contacts: [{ wa_id: "5534911112222", profile: { name: "Maria" } }],
      messages: [
        { id: "m1", from: "5534911112222", type: "text", text: { body: "Olá" } },
        { id: "m2", from: "5534911112222", type: "image", image: {} },
      ],
    } }] }],
  };
  assert.deepEqual(extrairMensagens(payload), [
    { id: "m1", de: "5534911112222", nome: "Maria", tipo: "text", texto: "Olá" },
    { id: "m2", de: "5534911112222", nome: "Maria", tipo: "image", texto: undefined },
  ]);
});

test("divide textos longos sem perder conteúdo", () => {
  const longo = Array.from({ length: 50 }, (_, i) => `Parágrafo ${i} ` + "x".repeat(150)).join("\n");
  const partes = dividirTexto(longo, 1000);
  assert.ok(partes.every((p) => p.length <= 1000));
  assert.equal(partes.join("\n").replace(/\s/g, ""), longo.replace(/\s/g, ""));
});

test("resposta em balões como no WhatsApp, com pausa proporcional", async () => {
  const { emBaloes, pausaDigitando } = await import("../src/whatsapp.js");
  assert.deepEqual(emBaloes("Oi!\n\nMe conta uma coisa:\n\ncomo é hoje?"), ["Oi!", "Me conta uma coisa:", "como é hoje?"]);
  assert.deepEqual(emBaloes("a\n\nb\n\nc\n\nd\n\ne"), ["a", "b", "c", "d\n\ne"]);
  assert.deepEqual(emBaloes("linha 1\nlinha 2"), ["linha 1\nlinha 2"]);
  assert.deepEqual(emBaloes(""), []);
  assert.equal(pausaDigitando("oi"), 800);
  assert.equal(pausaDigitando("x".repeat(1000)), 3500);
});

test("lembrete só usa template oficial e normaliza telefone internacional", async () => {
  const anterior = { ...config.whatsapp };
  Object.assign(config.whatsapp, { token: "secret", idNumero: "123", versaoGraph: "v23.0", idiomaTemplate: "pt_BR" });
  let pedido;
  const resposta = await enviarTemplate("+55 (34) 99999-0000", "nexor_reuniao_24h", ["Ana", "10/11/2026 15:00", "https://meet.google.com/abc-defg-hij"], {
    fetchFn: async (url, options) => {
      assert.match(url, /graph\.facebook\.com\/v23\.0\/123\/messages/);
      pedido = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, "Bearer secret");
      return new Response(JSON.stringify({ messages: [{ id: "wamid.mock" }] }), { status: 200 });
    },
  });
  assert.equal(resposta.messages[0].id, "wamid.mock");
  assert.equal(pedido.to, "5534999990000");
  assert.equal(pedido.type, "template");
  assert.equal(pedido.template.name, "nexor_reuniao_24h");
  assert.equal(pedido.template.language.code, "pt_BR");
  assert.equal(pedido.template.components[0].parameters.length, 3);
  Object.assign(config.whatsapp, anterior);
});

test("rejeita nome de template ou telefone inválido sem chamar Meta", async () => {
  const anterior = { ...config.whatsapp };
  Object.assign(config.whatsapp, { token: "secret", idNumero: "123", versaoGraph: "v23.0" });
  let chamadas = 0;
  await assert.rejects(() => enviarTemplate("+1", "template", [], { fetchFn: async () => { chamadas++; } }));
  await assert.rejects(() => enviarTemplate("5534999990000", "template malicious", [], { fetchFn: async () => { chamadas++; } }));
  assert.equal(chamadas, 0);
  Object.assign(config.whatsapp, anterior);
});
