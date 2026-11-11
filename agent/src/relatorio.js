/* Relatório de campanhas: resumo dos leads por origem e, se pedido, uma análise feita pelo Claude
   com o que escalar, o que pausar e o que testar. */

import Anthropic from "@anthropic-ai/sdk";
import { cadenciaPendente } from "./cadencia.js";
import { CAMPANHAS, detectarCampanha } from "./campanhas.js";
import { config } from "./config.js";
import { consolidarLeads, resumirLeads, rotuloOrigem } from "./leads.js";

/* ---------- Relatório por campanha ---------- */

/** "R$ 1.200,50" → 1200.5 */
const reais = (v) => {
  const n = Number(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Lê o investimento informado ("barber: R$ 350; meta/teste12h: R$ 280") e soma por campanha. */
export function lerInvestimento(texto) {
  const porCampanha = {};
  const semCampanha = {};
  for (const parte of String(texto ?? "").split(/[;\n]+/)) {
    const m = parte.match(/^\s*([^:=]+?)\s*[:=]\s*(.+)$/);
    if (!m) continue;
    const valor = reais(m[2]);
    if (valor === null) continue;
    const chave = m[1].trim();
    const ultima = chave.split("/").at(-1);
    const d = detectarCampanha({ origem: { utm_campaign: chave.replace(/\//g, "-") } });
    const d2 = d.via === "padrao" ? detectarCampanha({ origem: { utm_campaign: ultima } }) : d;
    if (d2.via === "padrao") semCampanha[chave] = (semCampanha[chave] ?? 0) + valor;
    else porCampanha[d2.id] = (porCampanha[d2.id] ?? 0) + valor;
  }
  return { porCampanha, semCampanha };
}

const mediana = (xs) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
const digitos = (v) => String(v ?? "").replace(/\D/g, "");
const mesmoTelefone = (a, b) => {
  const x = digitos(a);
  const y = digitos(b);
  return x.length >= 10 && y.length >= 10 && (x.endsWith(y.slice(-10)) || y.endsWith(x.slice(-10)));
};

/**
 * Resume os leads por campanha: quantidade, % de quentes, custo por lead quente, tempo até o
 * primeiro contato (resposta da Blue e contato da equipe) e motivos de descarte.
 */
export function resumirCampanhas(registros, { desde, investimento } = {}) {
  const contatos = registros.filter((r) => r.tipo === "contato_equipe");
  const leads = consolidarLeads(registros).filter((l) => !desde || new Date(l.registrado_em) >= desde);
  const gasto = lerInvestimento(investimento);
  const grupos = new Map(CAMPANHAS.map((c) => [c.id, { campanha: c.id, nome: c.nome, produto: c.produto, leads: 0, quente: 0, morno: 0, frio: 0, notas: [], agendaram_demo: 0, resposta_blue_s: [], contato_equipe_min: [], quentes_sem_contato: 0, motivos_descarte: {}, origens: {}, produtos_indicados: {} }]));

  for (const l of leads) {
    const id = l.campanha ?? detectarCampanha({ origem: l.origem, texto: l.solucao ?? "" }).id;
    const g = grupos.get(id) ?? grupos.get("qualquer-cenario");
    const classe = l.classe ?? l.temperatura ?? "frio";
    g.leads++;
    g[classe]++;
    if (Number.isFinite(l.nota)) g.notas.push(l.nota);
    if (l.agendou_demo) g.agendaram_demo++;
    const origem = rotuloOrigem(l.origem);
    g.origens[origem] = (g.origens[origem] ?? 0) + 1;
    if (l.produto_indicado) g.produtos_indicados[l.produto_indicado] = (g.produtos_indicados[l.produto_indicado] ?? 0) + 1;
    if (classe === "frio") {
      const motivo = l.descarte ?? "sem_qualificacao";
      g.motivos_descarte[motivo] = (g.motivos_descarte[motivo] ?? 0) + 1;
    }
    if (l.inicio_em && l.primeira_resposta_em) g.resposta_blue_s.push(Math.max(0, (Date.parse(l.primeira_resposta_em) - Date.parse(l.inicio_em)) / 1000));
    // Contato da equipe: conta a partir do momento em que o lead ficou quente (ou do primeiro registro)
    const base = Date.parse(l.quente_em ?? l.primeiro_registro ?? l.registrado_em);
    const contato = contatos
      .filter((c) => (c.lead && c.lead === l.id) || (c.conversa && c.conversa === l.conversa) || (c.telefone && mesmoTelefone(c.telefone, l.telefone)))
      .map((c) => Date.parse(c.contato_em))
      .filter((t) => t >= base - 60_000)
      .sort((a, b) => a - b)[0];
    if (contato) g.contato_equipe_min.push(Math.max(0, Math.round((contato - base) / 60_000)));
    else if (classe === "quente") g.quentes_sem_contato++;
  }

  const porCampanha = [...grupos.values()]
    .map(({ notas, resposta_blue_s, contato_equipe_min, ...g }) => {
      const investido = gasto.porCampanha[g.campanha];
      return {
        ...g,
        pct_quentes: g.leads ? Math.round((g.quente / g.leads) * 100) : 0,
        nota_media: notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null,
        investimento: investido ?? null,
        custo_por_lead: investido !== undefined && g.leads ? Math.round((investido / g.leads) * 100) / 100 : null,
        custo_por_lead_quente: investido !== undefined && g.quente ? Math.round((investido / g.quente) * 100) / 100 : null,
        primeira_resposta_blue_mediana_s: mediana(resposta_blue_s),
        primeiro_contato_equipe_mediana_min: mediana(contato_equipe_min),
      };
    })
    .filter((g) => g.leads || g.investimento !== null)
    .sort((a, b) => b.quente - a.quente || b.leads - a.leads);
  return { porCampanha, investimento_sem_campanha: gasto.semCampanha };
}

const INSTRUCOES_ANALISE = `Você é o gestor de tráfego da Nexor Consulting (software sob medida, sistemas e IA para empresas).
Recebe um resumo dos leads do site agrupados por origem/campanha (utm_source / utm_medium / utm_campaign) e, quando houver, o investimento de cada campanha.
Lead quente = pronto para vendas; morno = interessado; frio = só deixou contato.
Responda em português do Brasil, direto, em no máximo 12 linhas:
1. O que está funcionando (origens com mais leads quentes e maior taxa de quentes).
2. O que pausar ou corrigir (muito lead frio ou nenhum quente).
3. Três ações para a próxima semana (orçamento, público, criativo ou oferta).
Também recebe porCampanha: por produto, a % de leads quentes, a nota média, o custo por lead quente (quando o investimento foi informado), o tempo até o primeiro contato da equipe e os motivos de descarte. Priorize o custo por lead quente, não o volume de leads.
Use só os números recebidos. Se houver poucos dados (menos de 20 leads), diga isso e sugira manter as campanhas rodando antes de mudar.`;

export async function gerarRelatorio({ armazenamento, dias = 7, analise = false, investimento, cadencia = false, cliente, agora = () => new Date() }) {
  const desde = new Date(agora().getTime() - dias * 86400_000);
  const registros = await armazenamento.listarLeads();
  const resumo = resumirLeads(registros, { desde });
  const relatorio = { periodo_dias: dias, desde: desde.toISOString(), ...resumo, ...resumirCampanhas(registros, { desde, investimento }) };
  if (cadencia) {
    relatorio.cadencia_mornos = cadenciaPendente(consolidarLeads(registros).filter((l) => new Date(l.registrado_em) >= desde), agora());
  }
  if (!analise || resumo.total.leads === 0) return relatorio;

  const c = cliente ?? new Anthropic();
  const resposta = await c.beta.messages.create({
    model: config.modelo,
    max_tokens: 4000,
    system: [{ type: "text", text: INSTRUCOES_ANALISE }],
    messages: [{ role: "user", content: JSON.stringify({ ...relatorio, cadencia_mornos: undefined, investimento: investimento ?? "não informado" }) }], // sem nomes e contatos
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  relatorio.analise = resposta.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return relatorio;
}
