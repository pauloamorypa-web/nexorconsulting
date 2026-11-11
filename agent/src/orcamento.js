/* Teto diário de gasto com a IA: chamadas à API e tokens, somando todas as conversas.
   Sem ele, o chat público do site poderia gerar uma conta sem limite. Zera à meia-noite de Brasília. */

import { config } from "./config.js";

export const CONTATO_HUMANO = "WhatsApp (34) 99733-7499";
export const MENSAGEM_LIMITE_DIARIO = `Hoje a nossa assistente de IA já atendeu muita gente e fez uma pausa até amanhã 😊 Mas a equipe da Nexor está aqui: fale com a gente pelo ${CONTATO_HUMANO} ou pelo e-mail contato@nexorconsultingit.com.br.`;

const diaEmBrasilia = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Soma os tokens de uma resposta da API (entrada, saída e cache). */
export const tokensDa = (usage = {}) =>
  (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);

/**
 * @param {object} [opcoes]
 * @param {number} [opcoes.chamadas] máximo de chamadas à API por dia
 * @param {number} [opcoes.tokens] máximo de tokens por dia
 * @param {() => Date} [opcoes.agora]
 */
export function criarOrcamento({ chamadas = config.orcamentoDiario.chamadas, tokens = config.orcamentoDiario.tokens, agora = () => new Date() } = {}) {
  let dia = diaEmBrasilia(agora());
  let uso = { chamadas: 0, tokens: 0 };
  let avisado = false;

  const virarDia = () => {
    const hoje = diaEmBrasilia(agora());
    if (hoje !== dia) {
      dia = hoje;
      uso = { chamadas: 0, tokens: 0 };
      avisado = false;
    }
  };

  return {
    /** true = ainda pode chamar a API hoje. Reserva a chamada. */
    reservarChamada() {
      virarDia();
      if (uso.chamadas >= chamadas || uso.tokens >= tokens) {
        if (!avisado) console.warn(`[orcamento] teto diário de IA atingido (${uso.chamadas} chamadas, ${uso.tokens} tokens)`);
        avisado = true;
        return false;
      }
      uso.chamadas++;
      return true;
    },
    /** Registra os tokens gastos por uma resposta. */
    registrarUso(usage) {
      virarDia();
      uso.tokens += tokensDa(usage);
    },
    estado: () => (virarDia(), { dia, ...uso, limites: { chamadas, tokens } }),
  };
}
