import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { assinaturaValida, dividirTexto, extrairMensagens } from "../src/whatsapp.js";

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
