/* API de Conversões da Meta: envia os leads do site para a Meta (com telefone e e-mail em hash SHA-256),
   para os anúncios aprenderem a buscar pessoas parecidas com quem virou lead quente. */

import { createHash } from "node:crypto";
import { config } from "./config.js";

const hash = (v) => createHash("sha256").update(v).digest("hex");
/** E-mail e telefone no formato que o Meta pede (e que a Nexor Central usa): minúsculas; só dígitos com DDI 55. */
export const hashEmail = (v) => (typeof v === "string" && v.includes("@") ? hash(v.trim().toLowerCase()) : undefined);
export const hashTelefone = (v) => {
  const tel = String(v ?? "").replace(/\D/g, "");
  return tel.length >= 10 ? hash(tel.length <= 11 ? `55${tel}` : tel) : undefined;
};

export const metaConfigurada = () => Boolean(config.meta.pixel && config.meta.token);

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

/* ---------- Conversões das campanhas (conversas qualificadas pela Blue) ----------
   O valor acompanha a nota (0 a 100), para a Meta e o Google otimizarem para lead quente, não para volume.
   Só vão códigos e números: nota, classe, campanha e produto. Nada de texto da conversa (dor, mensagens). */

export const EVENTOS_CONVERSAO = ["Lead", "LeadQualificado", "AgendouDemo"];
const FATOR = { Lead: 3, LeadQualificado: 3, AgendouDemo: 4 };

/** Valor em reais do evento, proporcional à nota: nota 80 → Lead R$ 240, AgendouDemo R$ 320. */
export const valorConversao = (nota, evento = "Lead") => Math.round(Math.max(0, Math.min(100, Number(nota) || 0)) * (FATOR[evento] ?? 3));

function dadosDoUsuario(lead) {
  const user_data = {};
  const ph = hashTelefone(lead.telefone);
  if (ph) user_data.ph = [ph];
  const em = hashEmail(lead.email);
  if (em) user_data.em = [em];
  user_data.country = [hash("br")];
  user_data.external_id = [hash(lead.conversa ?? lead.sessao ?? lead.id)];
  if (lead.origem?.fbc) user_data.fbc = lead.origem.fbc;
  if (lead.origem?.fbp) user_data.fbp = lead.origem.fbp;
  if (lead.origem?.ctwa_clid) user_data.ctwa_clid = lead.origem.ctwa_clid;
  if (lead.canal === "whatsapp" && config.meta.wabaId) user_data.whatsapp_business_account_id = config.meta.wabaId;
  return user_data;
}

/** Evento da API de Conversões para um lead de conversa (site ou WhatsApp). */
export function eventoConversao(evento, lead, quando = new Date()) {
  const whatsapp = lead.canal === "whatsapp";
  return {
    event_name: evento,
    event_id: `${lead.id}-${evento}`,
    event_time: Math.floor(new Date(quando).getTime() / 1000),
    // Conversa no WhatsApp vinda de anúncio: business_messaging; no site: website
    action_source: whatsapp ? "business_messaging" : "website",
    ...(whatsapp ? { messaging_channel: "whatsapp" } : { event_source_url: lead.origem?.pagina ?? config.siteUrl }),
    user_data: dadosDoUsuario(lead),
    custom_data: {
      value: valorConversao(lead.nota, evento),
      currency: "BRL",
      lead_nota: lead.nota,
      lead_classe: lead.classe,
      campanha: lead.campanha,
      content_name: lead.produto,
    },
  };
}

/** Linha de conversão offline do Google Ads (importação por planilha, n8n ou Zapier). Só com gclid. */
export function conversaoGoogle(evento, lead, quando = new Date()) {
  const clique = lead.origem?.gclid ?? lead.origem?.gbraid ?? lead.origem?.wbraid;
  if (!clique) return null;
  const nomes = { Lead: config.google.conversaoLead, LeadQualificado: config.google.conversaoQualificado, AgendouDemo: config.google.conversaoDemo };
  return {
    gclid: lead.origem.gclid,
    gbraid: lead.origem.gbraid,
    wbraid: lead.origem.wbraid,
    conversion_name: nomes[evento] || evento,
    conversion_time: new Date(quando).toISOString(),
    conversion_value: valorConversao(lead.nota, evento),
    currency_code: "BRL",
    order_id: `${lead.id}-${evento}`,
  };
}

/* ---------- Conversão offline (vinda da Nexor Central) ----------
   Teste de 30 dias ativado → StartTrial; contrato fechado → Purchase. Valor em reais de verdade (receita),
   action_source "system_generated" (o evento nasce no sistema, não no site). */

export const EVENTO_OFFLINE = { teste_ativado: "StartTrial", contrato_fechado: "Purchase" };

/** fbc a partir do fbclid, no formato do Meta (fb.1.<ms do clique>.<fbclid>), quando o site não gravou o cookie _fbc. */
export const fbcDe = (origem = {}, quandoClique) => origem.fbc ?? (origem.fbclid ? `fb.1.${Date.parse(quandoClique) || Date.now()}.${origem.fbclid}` : undefined);

/**
 * Evento do Meta para a conversão offline.
 * @param {{id: string, evento: string, quando: string, valor: number, moeda?: string, produto?: string, plano?: string, em?: string, ph?: string}} conv
 * @param {object} [lead] lead da Blue achado pelo e-mail ou telefone (para campanha, fbc, fbp, ctwa_clid)
 */
export function eventoOffline(conv, lead) {
  const user_data = lead ? dadosDoUsuario(lead) : { country: [hash("br")] };
  if (conv.em) user_data.em = [conv.em];
  if (conv.ph) user_data.ph = [conv.ph];
  const fbc = lead && fbcDe(lead.origem, lead.primeiro_registro ?? lead.registrado_em);
  if (fbc) user_data.fbc = fbc;
  return {
    event_name: EVENTO_OFFLINE[conv.evento],
    event_id: `${conv.id}-${conv.evento}`,
    event_time: Math.floor(new Date(conv.quando).getTime() / 1000),
    action_source: "system_generated",
    user_data,
    custom_data: {
      value: conv.valor,
      currency: conv.moeda ?? "BRL",
      content_name: conv.produto ?? lead?.produto,
      ...(conv.plano ? { content_ids: [conv.plano] } : {}),
      ...(lead?.campanha ? { campanha: lead.campanha } : {}),
    },
  };
}

/** Linha de conversão offline do Google Ads para teste ativado e contrato. Só com gclid, gbraid ou wbraid. */
export function conversaoGoogleOffline(conv, lead) {
  const o = lead?.origem ?? {};
  if (!o.gclid && !o.gbraid && !o.wbraid) return null;
  return {
    gclid: o.gclid,
    gbraid: o.gbraid,
    wbraid: o.wbraid,
    conversion_name: conv.evento === "contrato_fechado" ? config.google.conversaoContrato : config.google.conversaoTeste,
    conversion_time: new Date(conv.quando).toISOString(),
    conversion_value: conv.valor,
    currency_code: conv.moeda ?? "BRL",
    order_id: `${conv.id}-${conv.evento}`,
  };
}

/** Envia uma lista de eventos para a Meta. Nunca lança erro: só registra no log. */
export async function enviarEventosMeta(eventos, { fetchFn = fetch } = {}) {
  if (!metaConfigurada() || !eventos.length) return false;
  try {
    const corpo = { data: eventos };
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

/** Envia o lead para a Meta. Nunca lança erro: só registra no log. */
export async function enviarParaMeta(lead, contexto, { fetchFn = fetch } = {}) {
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
