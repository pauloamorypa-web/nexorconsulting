/* Webhook da WhatsApp Cloud API: confere a assinatura e transforma o payload da Meta em eventos simples. */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Confere o cabeçalho X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o segredo do app). */
export function assinaturaValida(corpoBruto, cabecalho, segredo) {
  if (!segredo || typeof cabecalho !== "string" || !cabecalho.startsWith("sha256=")) return false;
  const esperado = Buffer.from("sha256=" + createHmac("sha256", segredo).update(corpoBruto).digest("hex"));
  const recebido = Buffer.from(cabecalho);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

const STATUS = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" };

/** Lê o conteúdo de uma mensagem recebida, qualquer que seja o tipo. */
export function lerMensagem(m) {
  const base = { wamid: m.id, de: m.from, quando: Number(m.timestamp) * 1000 || Date.now(), tipo: m.type, responde_a: m.context?.id, encaminhada: Boolean(m.context?.forwarded) };
  switch (m.type) {
    case "text":
      return { ...base, texto: m.text?.body ?? "" };
    case "image":
    case "video":
    case "audio":
    case "document":
    case "sticker": {
      const x = m[m.type] ?? {};
      return {
        ...base,
        texto: x.caption ?? "",
        midia: { id: x.id, tipo: x.mime_type, nome: x.filename, sha256: x.sha256, voz: Boolean(x.voice), animado: Boolean(x.animated) },
      };
    }
    case "location":
      return {
        ...base,
        texto: `📍 Localização${m.location?.name ? `: ${m.location.name}` : ""}${m.location?.address ? ` (${m.location.address})` : ""}`,
        local: { latitude: m.location?.latitude, longitude: m.location?.longitude, nome: m.location?.name, endereco: m.location?.address, url: m.location?.url },
      };
    case "contacts": {
      const cs = (m.contacts ?? []).map((c) => ({ nome: c.name?.formatted_name, telefones: (c.phones ?? []).map((p) => p.wa_id ?? p.phone) }));
      return { ...base, texto: `👤 Contato compartilhado: ${cs.map((c) => `${c.nome} ${c.telefones.join(", ")}`).join("; ")}`, contatos: cs };
    }
    case "button":
      return { ...base, tipo: "resposta", texto: m.button?.text ?? "", resposta: { id: m.button?.payload, titulo: m.button?.text } };
    case "interactive": {
      const i = m.interactive ?? {};
      const r = i.button_reply ?? i.list_reply;
      if (r) return { ...base, tipo: "resposta", texto: r.title + (r.description ? ` — ${r.description}` : ""), resposta: { id: r.id, titulo: r.title } };
      if (i.nfm_reply) return { ...base, tipo: "formulario", texto: "📝 Formulário respondido", formulario: safeJson(i.nfm_reply.response_json) };
      return { ...base, texto: "" };
    }
    case "reaction":
      return { ...base, texto: m.reaction?.emoji ?? "", reacao: { emoji: m.reaction?.emoji, wamid: m.reaction?.message_id } };
    case "order": {
      const itens = m.order?.product_items ?? [];
      return { ...base, texto: `🛒 Pedido pelo catálogo: ${itens.map((p) => `${p.quantity}x ${p.product_retailer_id}`).join(", ")}`, pedido: m.order };
    }
    case "request_welcome":
      return { ...base, tipo: "boas_vindas", texto: "" };
    case "unsupported":
    default:
      return { ...base, tipo: "nao_suportado", texto: "" };
  }
}

const safeJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

/**
 * Transforma o payload do webhook em eventos:
 * { evento: "mensagem", idNumero, nome, tipo, texto, midia... }
 * { evento: "status", idNumero, wamid, status, para, erro, conversa }
 * { evento: "modelo", situacao, idModelo, nome, idioma, motivo }
 * { evento: "conta", campo, valor }
 */
export function extrairEventos(payload) {
  const eventos = [];
  if (payload?.object !== "whatsapp_business_account") return eventos;
  for (const entrada of payload.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const v = mudanca.value ?? {};
      const idNumero = v.metadata?.phone_number_id;
      if (mudanca.field === "messages") {
        const nomes = Object.fromEntries((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
        for (const m of v.messages ?? []) eventos.push({ ...lerMensagem(m), evento: "mensagem", idNumero, nome: nomes[m.from] });
        for (const s of v.statuses ?? []) {
          const e = s.errors?.[0];
          eventos.push({
            evento: "status",
            idNumero,
            wamid: s.id,
            status: STATUS[s.status] ?? s.status,
            para: s.recipient_id,
            quando: Number(s.timestamp) * 1000 || Date.now(),
            erro: e ? { codigo: e.code, titulo: e.title, detalhe: e.error_data?.details ?? e.message } : undefined,
            conversa: s.conversation ? { id: s.conversation.id, origem: s.conversation.origin?.type, expira: Number(s.conversation.expiration_timestamp) * 1000 || undefined } : undefined,
            cobranca: s.pricing ? { categoria: s.pricing.category, cobravel: s.pricing.billable, modelo: s.pricing.pricing_model } : undefined,
          });
        }
        for (const e of v.errors ?? []) eventos.push({ evento: "erro", idNumero, codigo: e.code, titulo: e.title, detalhe: e.error_data?.details });
      } else if (mudanca.field === "message_template_status_update") {
        eventos.push({ evento: "modelo", situacao: v.event, idModelo: String(v.message_template_id ?? ""), nome: v.message_template_name, idioma: v.message_template_language, motivo: v.reason });
      } else {
        eventos.push({ evento: "conta", campo: mudanca.field, valor: v, idConta: entrada.id });
      }
    }
  }
  return eventos;
}
