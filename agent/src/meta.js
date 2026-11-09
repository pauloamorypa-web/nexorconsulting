/* API de Conversões da Meta: envia os leads do site para a Meta (com telefone e e-mail em hash SHA-256),
   para os anúncios aprenderem a buscar pessoas parecidas com quem virou lead quente. */

import { createHash } from "node:crypto";
import { config } from "./config.js";

const hash = (v) => createHash("sha256").update(v).digest("hex");

export const metaConfigurada = () => Boolean(config.meta.pixel && config.meta.token);

/**
 * Registro do consentimento dado no aviso de cookies do site, para guardar junto com o lead.
 * Aceita o formato atual { medicao, versao, em } e o antigo (true/false).
 */
export function registroConsentimento(recebido, agora = new Date()) {
  const r = recebido && typeof recebido === "object" ? recebido : { medicao: recebido === true, versao: 1 };
  const em = typeof r.em === "string" && !Number.isNaN(Date.parse(r.em)) ? new Date(r.em).toISOString() : null;
  return {
    medicao: r.medicao === true,
    versao: Number.isInteger(r.versao) && r.versao > 0 && r.versao < 1000 ? r.versao : null,
    escolhido_em: em, // quando a pessoa clicou no aviso (informado pelo navegador)
    recebido_em: agora.toISOString(), // quando o servidor recebeu o lead
    origem: "aviso-de-cookies",
  };
}

/** true só se o lead traz o consentimento de medição de anúncios dado no aviso de cookies. */
export const temConsentimentoMarketing = (lead) => lead?.consentimento?.medicao === true;

const VALOR = { quente: 300, morno: 80, frio: 15 };

/** Monta os eventos da API de Conversões para um lead. */
export function eventosMeta(lead, { ip, navegador } = {}) {
  const user_data = {};
  const tel = lead.telefone?.replace(/\D/g, "");
  if (tel && tel.length >= 10) user_data.ph = [hash(tel.length <= 11 ? `55${tel}` : tel)];
  if (lead.email) user_data.em = [hash(lead.email.trim().toLowerCase())];
  const [primeiro, ...resto] = (lead.nome ?? "").trim().toLowerCase().split(/\s+/);
  if (primeiro) user_data.fn = [hash(primeiro)];
  if (resto.length) user_data.ln = [hash(resto.at(-1))];
  user_data.country = [hash("br")];
  user_data.external_id = [hash(lead.sessao)];
  if (lead.origem?.fbc) user_data.fbc = lead.origem.fbc;
  if (lead.origem?.fbp) user_data.fbp = lead.origem.fbp;
  if (ip) user_data.client_ip_address = ip;
  if (navegador) user_data.client_user_agent = navegador;

  const base = {
    event_time: Math.floor(new Date(lead.registrado_em).getTime() / 1000),
    action_source: "website",
    event_source_url: lead.origem?.pagina ?? config.siteUrl,
    user_data,
  };
  const custom_data = { content_name: lead.tipo, lead_temperatura: lead.temperatura, value: VALOR[lead.temperatura] ?? 15, currency: "BRL" };
  const eventos = [{ ...base, event_name: "Lead", event_id: lead.id, custom_data }];
  if (lead.temperatura === "quente") eventos.push({ ...base, event_name: "LeadQuente", event_id: `${lead.id}-q`, custom_data });
  return eventos;
}

/** Envia o lead para a Meta, só com consentimento de medição. Nunca lança erro: só registra no log. */
export async function enviarParaMeta(lead, contexto, { fetchFn = fetch } = {}) {
  if (!temConsentimentoMarketing(lead)) return false; // LGPD: sem o Aceitar no aviso de cookies, nada sai
  if (!metaConfigurada() || lead.tipo === "parcial") return false;
  try {
    const corpo = { data: eventosMeta(lead, contexto) };
    if (config.meta.codigoTeste) corpo.test_event_code = config.meta.codigoTeste;
    const r = await fetchFn(`https://graph.facebook.com/${config.meta.versaoGraph}/${config.meta.pixel}/events?access_token=${encodeURIComponent(config.meta.token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    return true;
  } catch (err) {
    console.error("[meta] falha ao enviar conversão:", err.message ?? err);
    return false;
  }
}
