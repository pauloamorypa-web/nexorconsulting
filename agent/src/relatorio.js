/* Relatório de campanhas: resumo dos leads por origem e, se pedido, uma análise feita pelo Claude
   com o que escalar, o que pausar e o que testar. */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { resumirLeads } from "./leads.js";

const INSTRUCOES_ANALISE = `Você é o gestor de tráfego da Nexor Consulting (software sob medida, sistemas e IA para empresas).
Recebe um resumo dos leads do site agrupados por origem/campanha (utm_source / utm_medium / utm_campaign) e, quando houver, o investimento de cada campanha.
Lead quente = pronto para vendas; morno = interessado; frio = só deixou contato.
Responda em português do Brasil, direto, em no máximo 12 linhas:
1. O que está funcionando (origens com mais leads quentes e maior taxa de quentes).
2. O que pausar ou corrigir (muito lead frio ou nenhum quente).
3. Três ações para a próxima semana (orçamento, público, criativo ou oferta).
Use só os números recebidos. Se houver poucos dados (menos de 20 leads), diga isso e sugira manter as campanhas rodando antes de mudar.`;

export async function gerarRelatorio({ armazenamento, dias = 7, analise = false, investimento, cliente, agora = () => new Date() }) {
  const desde = new Date(agora().getTime() - dias * 86400_000);
  const resumo = resumirLeads(await armazenamento.listarLeads(), { desde });
  const relatorio = { periodo_dias: dias, desde: desde.toISOString(), ...resumo };
  if (!analise || resumo.total.leads === 0) return relatorio;

  const c = cliente ?? new Anthropic();
  const resposta = await c.beta.messages.create({
    model: config.modelo,
    max_tokens: 4000,
    system: [{ type: "text", text: INSTRUCOES_ANALISE }],
    messages: [{ role: "user", content: JSON.stringify({ ...relatorio, investimento: investimento ?? "não informado" }) }],
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
