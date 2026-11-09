/* Núcleo determinístico do Sales Agent. Não envia mensagens nem consulta fontes externas. */

import { z } from "zod";

const contato = z.object({
  canal: z.enum(["email", "whatsapp", "linkedin"]),
  autorizacao_registrada: z.literal(true),
  finalidade: z.literal("retorno_comercial"),
  origem: z.string().trim().min(1).max(240),
  registrada_em: z.string().datetime(),
}).strict();

const urlHttps = z.string().url().max(2048).refine((valor) => {
  try { return new URL(valor).protocol === "https:"; } catch { return false; }
}, "a fonte precisa usar HTTPS");

export const entradaLead = z.object({
  id_externo: z.string().trim().min(1).max(160).optional(),
  nome: z.string().trim().min(1).max(120),
  empresa: z.string().trim().min(1).max(160),
  cargo: z.string().trim().max(120).optional(),
  necessidade: z.string().trim().min(1).max(2000),
  segmento: z.string().trim().max(120).optional(),
  canal_origem: z.enum(["site", "linkedin_lead_form", "indicacao", "manual"]),
  fonte_url: urlHttps.optional(),
  url_publica: urlHttps.optional(),
  contato: z.object({ email: z.string().email().max(254).optional(), whatsapp: z.string().regex(/^\+?[0-9 ()-]{8,24}$/).optional() }).strict().refine((v) => v.email || v.whatsapp, "informe email ou WhatsApp"),
  permissao: contato.optional(),
}).strict().superRefine((lead, ctx) => {
  if (lead.permissao?.canal === "email" && !lead.contato.email) ctx.addIssue({ code: "custom", path: ["permissao", "canal"], message: "permissão de email exige email informado" });
  if (lead.permissao?.canal === "whatsapp" && !lead.contato.whatsapp) ctx.addIssue({ code: "custom", path: ["permissao", "canal"], message: "permissão de WhatsApp exige WhatsApp informado" });
  if (lead.permissao?.canal === "linkedin" && lead.canal_origem !== "linkedin_lead_form") ctx.addIssue({ code: "custom", path: ["permissao", "canal"], message: "permissão de LinkedIn exige origem Lead Gen Form" });
});

const PRODUTOS = [
  { nome: "Nexor Atende IA", sinais: [/whats?app|atendimento|conversa|chat|responder|lead|agendament|recep[cç][aã]o/i] },
  { nome: "Nexor Commerce", sinais: [/loja virtual|e-?commerce|marketplace|marketplaces|carrinho|estoque online/i] },
  { nome: "Nexor Gestão", sinais: [/erp|financeiro|estoque|compras|nota fiscal|crm|gest[aã]o empresarial/i] },
  { nome: "Nexor RH", sinais: [/rh|recursos humanos|folha|ponto eletr[oô]nico|esocial|f[eé]rias/i] },
  { nome: "Nexor Site Pro", sinais: [/site|presen[cç]a digital|p[aá]gina|landing page/i] },
  { nome: "Nexor Barber", sinais: [/barbearia|barbeiro|agenda de cortes/i] },
  { nome: "Nexor Cont[aá]bil", sinais: [/contabilidade|contador|cont[aá]bil|documentos fiscais/i] },
  { nome: "Automação", sinais: [/automat|tarefa repetitiva|integra[cç][aã]o entre sistemas/i] },
];

const contem = (texto, regexes) => regexes.some((r) => r.test(texto));

export function qualificarLead(dados) {
  const lead = entradaLead.parse(dados);
  const texto = `${lead.necessidade} ${lead.segmento ?? ""}`.toLocaleLowerCase("pt-BR");
  const produto = PRODUTOS.find((p) => contem(texto, p.sinais))?.nome ?? null;
  const motivos = [];
  let pontos = 0;

  if (lead.necessidade.length >= 40) { pontos += 25; motivos.push("necessidade descrita com contexto"); }
  else { pontos += 10; motivos.push("necessidade identificada; falta detalhar o cenário"); }
  if (contem(texto, [/preciso|precisamos|quero|busco|procurando|avaliando|or[cç]amento|contratar|implantar|urgente|perdendo|dificuldade/i])) {
    pontos += 25; motivos.push("intenção de compra ou problema explicitado");
  }
  if (produto) { pontos += 25; motivos.push("necessidade associada a uma solução do catálogo"); }
  if (lead.canal_origem === "indicacao" || lead.canal_origem === "linkedin_lead_form") {
    pontos += 15; motivos.push("origem de lead identificável");
  } else if (lead.canal_origem === "site") { pontos += 10; motivos.push("lead entrou pelo site da Nexor"); }
  if (lead.permissao) { pontos += 15; motivos.push("permissão documentada para retorno comercial"); }

  const score = Math.min(100, pontos);
  const temperatura = score >= 70 ? "quente" : score >= 40 ? "morno" : "frio";
  return {
    lead: { ...lead, necessidade: lead.necessidade.slice(0, 1000) },
    score,
    temperatura,
    motivos,
    produto_recomendado: produto,
    confianca_recomendacao: produto ? "media" : "baixa",
    proxima_acao: !produto ? "pedir_mais_contexto" : !lead.permissao ? "aguardar_permissao_ou_revisao_humana" : "revisao_humana",
    contato_permitido: Boolean(lead.permissao),
    envio_automatico_habilitado: false,
    fontes: [lead.fonte_url, lead.url_publica].filter(Boolean),
  };
}
