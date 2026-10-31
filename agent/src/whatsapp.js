/* Integração com a WhatsApp Cloud API (Meta): assinatura do webhook, leitura de mensagens e envio. */

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

const LIMITE_TEXTO = 4000; // a API aceita até 4096 caracteres por mensagem

/** Confere o cabeçalho X-Hub-Signature-256 enviado pela Meta. */
export function assinaturaValida(corpoBruto, cabecalho, segredo) {
  if (!segredo || !cabecalho?.startsWith("sha256=")) return false;
  const esperado = Buffer.from("sha256=" + createHmac("sha256", segredo).update(corpoBruto).digest("hex"));
  const recebido = Buffer.from(cabecalho);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

/** Extrai as mensagens recebidas de um payload de webhook. */
export function extrairMensagens(payload) {
  const mensagens = [];
  for (const entrada of payload?.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const valor = mudanca.value ?? {};
      const nomes = Object.fromEntries((valor.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of valor.messages ?? []) {
        mensagens.push({
          id: m.id,
          de: m.from,
          nome: nomes[m.from],
          tipo: m.type,
          texto: m.type === "text" ? m.text?.body : m.type === "button" ? m.button?.text : m.type === "interactive" ? (m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title) : undefined,
        });
      }
    }
  }
  return mensagens;
}

/** Divide textos longos em partes que cabem numa mensagem, quebrando em parágrafos quando possível. */
export function dividirTexto(texto, limite = LIMITE_TEXTO) {
  const partes = [];
  let resto = texto;
  while (resto.length > limite) {
    let corte = resto.lastIndexOf("\n", limite);
    if (corte < limite / 2) corte = resto.lastIndexOf(" ", limite);
    if (corte < limite / 2) corte = limite;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

export const whatsappConfigurado = () => Boolean(config.whatsapp.token && config.whatsapp.idNumero);

/** Envia uma mensagem de texto. Fora da janela de 24 h da última mensagem do contato, a Meta exige template. */
export async function enviarTexto(para, texto) {
  const { token, idNumero, versaoGraph } = config.whatsapp;
  for (const parte of dividirTexto(texto)) {
    const resposta = await fetch(`https://graph.facebook.com/${versaoGraph}/${idNumero}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: parte, preview_url: true } }),
    });
    if (!resposta.ok) {
      throw new Error(`WhatsApp ${resposta.status}: ${await resposta.text()}`);
    }
  }
}

/** Marca a mensagem como lida (os dois tiques azuis). Falhas aqui não interrompem o atendimento. */
export async function marcarComoLida(idMensagem) {
  const { token, idNumero, versaoGraph } = config.whatsapp;
  try {
    await fetch(`https://graph.facebook.com/${versaoGraph}/${idNumero}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: idMensagem }),
    });
  } catch {
    /* ignorado */
  }
}
