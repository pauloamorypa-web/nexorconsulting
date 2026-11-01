/* Regras de qualificação dos leads e resumo por campanha. */

/* Temperatura: quente = pronto para conversar com vendas. Mesma regra do site (assets/js/leads.js). */
const BASE = { interesse: 2, diagnostico: 2, teste: 1, calculadora: 1, blue: 1, saida: 1, parcial: 0 };
const NIVEIS = ["frio", "morno", "quente"];

export function temperatura(tipo, pontos) {
  const extra = pontos >= 10 || (tipo === "parcial" && pontos >= 8) ? 1 : 0;
  return NIVEIS[Math.min(2, (BASE[tipo] ?? 0) + extra)];
}

const texto = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Limpa os dados de origem (utm_*, gclid, fbclid...) enviados pelo site. */
export function limparOrigem(o) {
  if (!o || typeof o !== "object") return {};
  const r = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referencia"]) {
    const v = texto(o[k], 120);
    if (v) r[k] = v;
  }
  for (const k of ["gclid", "gbraid", "wbraid", "fbclid", "fbc", "fbp"]) {
    const v = texto(o[k], 300);
    if (v) r[k] = v;
  }
  const pagina = texto(o.pagina, 300);
  if (pagina) r.pagina = pagina;
  return r;
}

/** Nome legível da origem: "instagram / pago / teste12h" */
export function rotuloOrigem(o = {}) {
  if (o.utm_source || o.utm_campaign) return [o.utm_source ?? "?", o.utm_medium, o.utm_campaign].filter(Boolean).join(" / ");
  if (o.gclid || o.gbraid || o.wbraid) return "google / anúncio";
  if (o.fbclid || o.fbc) return "meta / anúncio";
  if (o.referencia) return /google\./.test(o.referencia) ? "google / busca" : o.referencia;
  return "direto";
}

/** Agrupa leads por origem e campanha. */
export function resumirLeads(leads, { desde } = {}) {
  const lista = leads.filter((l) => !desde || new Date(l.registrado_em) >= desde);
  const grupos = new Map();
  for (const l of lista) {
    const chave = rotuloOrigem(l.origem);
    const g = grupos.get(chave) ?? { origem: chave, leads: 0, quente: 0, morno: 0, frio: 0, tipos: {}, solucoes: {} };
    g.leads++;
    g[l.temperatura ?? "frio"]++;
    g.tipos[l.tipo] = (g.tipos[l.tipo] ?? 0) + 1;
    if (l.solucao) g.solucoes[l.solucao] = (g.solucoes[l.solucao] ?? 0) + 1;
    grupos.set(chave, g);
  }
  const porOrigem = [...grupos.values()]
    .map((g) => ({ ...g, taxa_quente: g.leads ? Math.round((g.quente / g.leads) * 100) : 0 }))
    .sort((a, b) => b.quente - a.quente || b.leads - a.leads);
  const total = { leads: lista.length, quente: 0, morno: 0, frio: 0 };
  for (const l of lista) total[l.temperatura ?? "frio"]++;
  return { total, porOrigem };
}
