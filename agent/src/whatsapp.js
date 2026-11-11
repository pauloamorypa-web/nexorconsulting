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
        const msg = {
          id: m.id,
          de: m.from,
          nome: nomes[m.from],
          tipo: m.type,
          texto: m.type === "text" ? m.text?.body : m.type === "button" ? m.button?.text : m.type === "interactive" ? (m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title) : undefined,
        };
        // Mensagem que veio de um anúncio de clique para o WhatsApp: a Meta manda o anúncio de origem
        if (m.referral && typeof m.referral === "object") {
          const r = m.referral;
          const corta = (v, n) => (typeof v === "string" ? v.slice(0, n) : undefined);
          msg.referral = Object.fromEntries(
            Object.entries({ source_url: corta(r.source_url, 300), source_id: corta(r.source_id, 60), source_type: corta(r.source_type, 20), headline: corta(r.headline, 200), body: corta(r.body, 500), ctwa_clid: corta(r.ctwa_clid, 300) }).filter(([, v]) => v),
          );
        }
        mensagens.push(msg);
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

/** Divide a resposta em balões, como uma pessoa digitando no WhatsApp: cada bloco separado
    por linha em branco vira uma mensagem (no máximo 4; o excesso vai junto no último). */
export function emBaloes(texto, maximo = 4) {
  const blocos = String(texto ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocos.length <= maximo) return blocos;
  return [...blocos.slice(0, maximo - 1), blocos.slice(maximo - 1).join("\n\n")];
}

/** Pausa de "digitando" entre balões, proporcional ao tamanho do texto (0,8 s a 3,5 s) */
export const pausaDigitando = (texto) => Math.min(3500, Math.max(800, 500 + String(texto).length * 20));

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
      // typing_indicator mostra "digitando..." para o cliente enquanto a Blue prepara a resposta
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: idMensagem, typing_indicator: { type: "text" } }),
    });
  } catch {
    /* ignorado */
  }
}
