/* WhatsApp Cloud API (Meta): assinatura do webhook, leitura de mensagens, envio de texto e botões. */

import { createHmac, timingSafeEqual } from "node:crypto";

const LIMITE = 4000;

export function assinaturaValida(corpoBruto, cabecalho, segredo) {
  if (!segredo || !cabecalho?.startsWith("sha256=")) return false;
  const esperado = Buffer.from("sha256=" + createHmac("sha256", segredo).update(corpoBruto).digest("hex"));
  const recebido = Buffer.from(cabecalho);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

export function extrairMensagens(payload) {
  const saida = [];
  for (const e of payload?.entry ?? []) {
    for (const m0 of e.changes ?? []) {
      for (const m of m0.value?.messages ?? []) {
        saida.push({
          id: m.id,
          de: m.from,
          tipo: m.type,
          texto: m.type === "text" ? m.text?.body : undefined,
          botao: m.type === "interactive" ? m.interactive?.button_reply?.id : m.type === "button" ? m.button?.payload : undefined,
        });
      }
    }
  }
  return saida;
}

/** Divide em balões: blocos separados por linha em branco e cortes nos textos muito longos. */
export function emBaloes(texto, maximo = 4) {
  const blocos = String(texto ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const juntos = blocos.length <= maximo ? blocos : [...blocos.slice(0, maximo - 1), blocos.slice(maximo - 1).join("\n\n")];
  return juntos.flatMap((b) => (b.length <= LIMITE ? [b] : b.match(new RegExp(`[\\s\\S]{1,${LIMITE}}`, "g"))));
}

export function criarWhatsApp({ token, idNumero, versaoGraph, fetchFn = fetch }) {
  const enviar = async (corpo) => {
    const r = await fetchFn(`https://graph.facebook.com/${versaoGraph}/${idNumero}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
    });
    if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${await r.text()}`);
  };
  return {
    configurado: Boolean(token && idNumero),
    async texto(para, texto) {
      for (const b of emBaloes(texto)) await enviar({ to: para, type: "text", text: { body: b } });
    },
    /** Pede aprovação com dois botões. O id do botão volta no webhook: aprovar:A1B2C3 / recusar:A1B2C3 */
    async aprovacao(para, { id, resumo, conector, metodo }) {
      const corpo = `🔐 Pedido ${id}\n\n${resumo}\n\nSistema: ${conector} · ${{ POST: "criar", PUT: "alterar", PATCH: "alterar", DELETE: "apagar", GET: "consultar" }[metodo] ?? metodo}`;
      await enviar({
        to: para,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: corpo.slice(0, 1024) },
          action: { buttons: [{ type: "reply", reply: { id: `aprovar:${id}`, title: "✅ Aprovar" } }, { type: "reply", reply: { id: `recusar:${id}`, title: "✖️ Recusar" } }] },
        },
      });
    },
    async marcarLida(id) {
      await enviar({ status: "read", message_id: id, typing_indicator: { type: "text" } }).catch(() => {});
    },
  };
}
