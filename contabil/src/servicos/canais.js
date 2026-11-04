/* Canais de envio do escritório: WhatsApp (API oficial da Meta, número do próprio escritório) e e-mail (Resend).
   Os tokens ficam criptografados na configuração do escritório. */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Telefone brasileiro → só dígitos com 55. Aceita com ou sem o 9 do celular. */
export function normalizarFone(v) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 11) d = `55${d}`;
  return d;
}
/** Mesmo número? Compara DDD + 8 últimos dígitos (o WhatsApp às vezes manda sem o 9) */
export function mesmoFone(a, b) {
  const x = normalizarFone(a);
  const y = normalizarFone(b);
  if (!x || !y) return false;
  return x.slice(2, 4) === y.slice(2, 4) && x.slice(-8) === y.slice(-8);
}

export function assinaturaMetaValida(corpo, assinatura, segredo) {
  if (!segredo || !assinatura?.startsWith("sha256=")) return false;
  const esperado = Buffer.from(createHmac("sha256", segredo).update(corpo).digest("hex"));
  const recebido = Buffer.from(assinatura.slice(7));
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

export function criarWhatsApp({ token, idNumero, versao = "v23.0", fetchFn = fetch }) {
  const base = `https://graph.facebook.com/${versao}`;
  const ativo = Boolean(token && idNumero);
  async function chamar(caminho, corpo) {
    const r = await fetchFn(`${base}/${caminho}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(20_000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error?.message ?? `WhatsApp respondeu ${r.status}`);
    return d;
  }
  return {
    ativo,
    texto: (para, texto) => chamar(`${idNumero}/messages`, { messaging_product: "whatsapp", to: normalizarFone(para), type: "text", text: { body: texto.slice(0, 4000), preview_url: false } }),
    /** Mensagem fora da janela de 24 h: só com modelo aprovado pela Meta */
    modelo: (para, nome, idioma, parametros) =>
      chamar(`${idNumero}/messages`, { messaging_product: "whatsapp", to: normalizarFone(para), type: "template", template: { name: nome, language: { code: idioma }, components: [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: String(t).slice(0, 1000) })) }] } }),
    async baixarMidia(id) {
      const r = await fetchFn(`${base}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
      const info = await r.json().catch(() => ({}));
      if (!r.ok || !info.url) throw new Error("Não foi possível obter o arquivo do WhatsApp.");
      const u = new URL(info.url);
      if (u.protocol !== "https:" || !/(^|\.)(fbcdn\.net|whatsapp\.net|facebook\.com|fbsbx\.com)$/.test(u.hostname)) throw new Error("Endereço do arquivo do WhatsApp inesperado.");
      const a = await fetchFn(info.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
      if (!a.ok) throw new Error("Falha ao baixar o arquivo do WhatsApp.");
      return { dados: Buffer.from(await a.arrayBuffer()), mime: info.mime_type ?? a.headers.get("content-type") ?? "application/octet-stream" };
    },
  };
}

export function criarEmail({ chave, remetente, url, fetchFn = fetch }) {
  const ativo = Boolean(chave && remetente);
  return {
    ativo,
    async enviar({ para, assunto, texto, html }) {
      const r = await fetchFn(url, { method: "POST", headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: remetente, to: [para], subject: assunto, text: texto, ...(html ? { html } : {}) }), signal: AbortSignal.timeout(20_000) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message ?? d?.error ?? `E-mail respondeu ${r.status}`);
      return d;
    },
  };
}

/** Extrai as mensagens recebidas do webhook da Meta */
export function mensagensDoWebhook(payload) {
  const saida = [];
  for (const e of payload?.entry ?? [])
    for (const c of e.changes ?? []) {
      const v = c.value ?? {};
      const nomes = Object.fromEntries((v.contacts ?? []).map((k) => [k.wa_id, k.profile?.name]));
      for (const m of v.messages ?? []) {
        const midia = m.image ?? m.document ?? null;
        saida.push({ id: m.id, de: m.from, nome: nomes[m.from] ?? null, numero: v.metadata?.phone_number_id ?? null, tipo: m.type, texto: m.text?.body ?? m.image?.caption ?? m.document?.caption ?? null, midia: midia ? { id: midia.id, mime: midia.mime_type, nome: m.document?.filename ?? null } : null });
      }
    }
  return saida;
}
