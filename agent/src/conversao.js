/* Conversão offline vinda da Nexor Central (POST /api/conversao): teste de 30 dias ativado e contrato fechado.
   A Central manda só o e-mail e o telefone em hash SHA-256, o produto e os valores. Aqui a Blue:
   1. acha o lead pelo hash (compara com o hash do e-mail/telefone dos leads gravados);
   2. completa com a campanha e os identificadores de clique (fbc/fbclid, fbp, gclid);
   3. envia ao Meta (StartTrial / Purchase) e gera a linha do Google (com gclid) para LEAD_WEBHOOK_URL,
      só o que o consentimento permite;
   4. registra a conversão no arquivo de leads (tipo "conversao_offline") para o relatório por campanha.
   Idempotente pelo id do evento: reentrega da Central não envia de novo. */

import { config } from "./config.js";
import { consolidarLeads, NAO_SAO_LEADS } from "./leads.js";
import { conversaoGoogleOffline, enviarEventosMeta, eventoOffline, hashEmail, hashTelefone, metaConfigurada } from "./meta.js";

export const EVENTOS_OFFLINE = new Set(["teste_ativado", "contrato_fechado"]);
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{8,80}$/;
const valor = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? Math.round(n * 100) / 100 : 0;
};
const curto = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Valida e normaliza o corpo recebido. Aceita e-mail/telefone em texto (vira hash na hora e o texto é descartado). */
export function lerConversao(d) {
  if (!d || typeof d !== "object" || !EVENTOS_OFFLINE.has(d.evento) || !ID.test(String(d.id ?? ""))) return null;
  const em = HASH.test(String(d.em ?? "")) ? d.em : hashEmail(d.email);
  const ph = HASH.test(String(d.ph ?? "")) ? d.ph : hashTelefone(d.telefone);
  const quando = d.quando && !Number.isNaN(Date.parse(d.quando)) ? new Date(d.quando).toISOString() : new Date().toISOString();
  const mensalidade = valor(d.mensalidade);
  const implantacao = valor(d.implantacao);
  return {
    id: String(d.id),
    evento: d.evento,
    quando,
    produto: curto(d.produto, 40),
    plano: curto(d.plano, 60),
    mensalidade,
    implantacao,
    valor: d.valor !== undefined ? valor(d.valor) : Math.round((mensalidade + implantacao) * 100) / 100,
    moeda: /^[A-Z]{3}$/.test(String(d.moeda ?? "")) ? d.moeda : "BRL",
    em,
    ph,
  };
}

const temClique = (l) => Boolean(l.origem?.gclid || l.origem?.gbraid || l.origem?.wbraid || l.origem?.fbc || l.origem?.fbclid || l.origem?.ctwa_clid);

/** Acha o lead da Blue com o mesmo e-mail ou telefone (em hash). Prefere o que tem clique de anúncio, depois o mais recente. */
export function acharLead(registros, { em, ph }) {
  if (!em && !ph) return null;
  const achados = consolidarLeads(registros.filter((r) => !NAO_SAO_LEADS.has(r.tipo))).filter((l) => (em && hashEmail(l.email) === em) || (ph && hashTelefone(l.telefone) === ph));
  achados.sort((a, b) => Number(temClique(b)) - Number(temClique(a)) || Date.parse(b.registrado_em) - Date.parse(a.registrado_em));
  return achados[0] ?? null;
}

/**
 * Processa uma conversão offline. Devolve { ok, duplicado?, registro } ou { ok: false, erro } quando um envio que
 * deveria sair falhou (a Central tenta de novo: nada é registrado e o event_id/order_id iguais evitam duplicar).
 */
export async function processarConversaoOffline(conv, { armazenamento, fetchFn = fetch, agora = () => new Date() }) {
  const registros = await armazenamento.listarLeads();
  const anterior = registros.find((r) => r.tipo === "conversao_offline" && r.id === conv.id && r.evento === conv.evento);
  if (anterior) return { ok: true, duplicado: true, registro: anterior };

  const lead = acharLead(registros, conv);
  // Consentimento de medição (aviso de cookies no site; no WhatsApp, anúncio de origem + META_CAPI_WHATSAPP):
  // sem lead achado ou sem consentimento, a conversão só fica registrada aqui.
  const permitido = Boolean(lead?.consentimento_medicao);
  const doWhatsapp = lead?.canal === "whatsapp";
  const podeMeta = permitido && metaConfigurada() && (!doWhatsapp || (config.metaWhatsapp && lead.origem?.ctwa_clid));
  const linhaGoogle = permitido ? conversaoGoogleOffline(conv, lead) : null;

  let meta = false;
  if (podeMeta) {
    meta = await enviarEventosMeta([eventoOffline(conv, lead)], { fetchFn });
    if (!meta) return { ok: false, erro: "falha ao enviar ao Meta" };
  }
  let google = false;
  if (linhaGoogle && config.webhookLeads) {
    try {
      const r = await fetchFn(config.webhookLeads, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "conversao_google", evento: conv.evento, lead: lead.id, campanha: lead.campanha, google: linhaGoogle }) });
      if (!r.ok) throw new Error(`webhook ${r.status}`);
      google = true;
    } catch (err) {
      console.error("[google] falha ao enviar conversão offline:", err.message ?? err);
      return { ok: false, erro: "falha ao enviar a linha do Google" };
    }
  }

  // Registro mínimo: sem e-mail, telefone ou hash; só a ligação com o lead, a campanha e os valores
  const registro = {
    tipo: "conversao_offline",
    id: conv.id,
    evento: conv.evento,
    quando: conv.quando,
    produto: conv.produto,
    plano: conv.plano,
    valor: conv.valor,
    mensalidade: conv.mensalidade,
    implantacao: conv.implantacao,
    moeda: conv.moeda,
    lead: lead?.id ?? null,
    campanha: lead?.campanha ?? null,
    origem: lead?.origem?.utm_source || lead?.origem?.utm_campaign ? { utm_source: lead.origem.utm_source, utm_medium: lead.origem.utm_medium, utm_campaign: lead.origem.utm_campaign } : undefined,
    enviado: { meta, google },
    // Por que algo não saiu: lead não achado, sem consentimento ou, no Google, sem gclid
    motivo: !lead ? "lead_nao_encontrado" : !permitido ? "sem_consentimento" : !linhaGoogle ? "sem_gclid" : undefined,
    registrado_em: agora().toISOString(),
  };
  await armazenamento.salvarLead(registro);
  return { ok: true, registro };
}
