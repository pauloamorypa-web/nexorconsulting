/* Núcleo do Nexor Assist: guarda as conversas e roda o ciclo com o Claude e as ferramentas. */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { INSTRUCOES } from "./conhecimento.js";
import { DEFINICOES, criarExecutor } from "./ferramentas.js";

const MAX_ITERACOES = 8;
const FALHA = "Desculpe, tive um problema para responder agora. Você pode falar direto com a equipe no WhatsApp (34) 99733-7499.";

const SISTEMA = [{ type: "text", text: INSTRUCOES }];

const quandoAgora = (d) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const textoDa = (mensagem) =>
  mensagem.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

/**
 * @param {object} [deps]
 * @param {Anthropic} [deps.cliente]
 * @param {ReturnType<import('./armazenamento.js').criarArmazenamento>} deps.armazenamento
 * @param {(texto: string, dados: object) => Promise<void>} [deps.notificar]
 * @param {() => Date} [deps.agora]
 */
export function criarAgente({ cliente = new Anthropic(), armazenamento, notificar = async () => {}, agora = () => new Date() }) {
  const executar = criarExecutor({ armazenamento, notificar, agora });
  /** @type {Map<string, {mensagens: Anthropic.Beta.BetaMessageParam[], atualizadaEm: number, pausadaAte: number, envios: number[], fila: Promise<unknown>}>} */
  const conversas = new Map();

  const obterConversa = (id) => {
    const t = agora().getTime();
    let c = conversas.get(id);
    const expirada =
      c && (t - c.atualizadaEm > config.conversaExpiraHoras * 3600_000 || c.mensagens.length >= config.conversaMaxMensagens);
    if (!c || expirada) {
      // Uma conversa nova em vez de cortar o histórico: o histórico só cresce (append-only),
      // o que mantém o cache válido e os blocos de raciocínio do modelo consistentes.
      c = { mensagens: [], atualizadaEm: t, pausadaAte: c?.pausadaAte ?? 0, envios: c?.envios ?? [], fila: Promise.resolve() };
      conversas.set(id, c);
    }
    return c;
  };

  const dentroDoLimite = (c) => {
    const t = agora().getTime();
    const janela = config.limiteMensagens.janelaMinutos * 60_000;
    c.envios = c.envios.filter((x) => t - x < janela);
    if (c.envios.length >= config.limiteMensagens.quantidade) return false;
    c.envios.push(t);
    return true;
  };

  async function rodar(c, { idConversa, canal, texto, telefone }) {
    let transferido = false;
    const ctx = { idConversa, canal, telefone, transferir: () => (transferido = true) };

    c.mensagens.push({
      role: "user",
      content: [
        { type: "text", text: `<contexto>agora: ${quandoAgora(agora())} (horário de Brasília) · canal: ${canal}${telefone ? ` · WhatsApp do cliente: ${telefone}` : ""}</contexto>` },
        { type: "text", text: texto },
      ],
    });

    for (let i = 0; i < MAX_ITERACOES; i++) {
      const resposta = await cliente.beta.messages.create({
        model: config.modelo,
        max_tokens: config.maxTokens,
        system: SISTEMA,
        tools: DEFINICOES,
        messages: c.mensagens,
        output_config: { effort: config.esforco },
        cache_control: { type: "ephemeral" },
        // Se o modelo recusar por política, a API tenta outro modelo na mesma chamada
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      // O conteúdo completo volta ao histórico (inclui blocos de raciocínio e de fallback)
      c.mensagens.push({ role: "assistant", content: resposta.content });

      if (resposta.stop_reason === "pause_turn") continue;

      if (resposta.stop_reason === "refusal") {
        c.mensagens = [];
        return { resposta: "Não consigo ajudar com isso por aqui. Se quiser, falo com a equipe da Nexor para continuar o seu atendimento.", transferido };
      }

      const chamadas = resposta.content.filter((b) => b.type === "tool_use");
      if (resposta.stop_reason !== "tool_use" || chamadas.length === 0) {
        return { resposta: textoDa(resposta) || FALHA, transferido };
      }

      const resultados = await Promise.all(chamadas.map((b) => executar(b, ctx)));
      c.mensagens.push({ role: "user", content: resultados });
    }

    console.warn(`[agente] limite de iterações atingido em ${idConversa}`);
    return { resposta: FALHA, transferido };
  }

  return {
    /**
     * Responde a uma mensagem do cliente.
     * @returns {Promise<{resposta: string | null, transferido: boolean}>} resposta null = conversa com a equipe humana, o agente fica em silêncio
     */
    responder({ idConversa, canal, texto, telefone }) {
      const c = obterConversa(idConversa);
      if (c.pausadaAte > agora().getTime()) return Promise.resolve({ resposta: null, transferido: true });
      if (!dentroDoLimite(c)) {
        return Promise.resolve({ resposta: "Recebi muitas mensagens seguidas. Aguarde alguns minutos ou fale com a equipe no WhatsApp (34) 99733-7499.", transferido: false });
      }

      // Uma resposta por vez em cada conversa, na ordem de chegada
      const tarefa = c.fila.then(async () => {
        c.atualizadaEm = agora().getTime();
        try {
          const r = await rodar(c, { idConversa, canal, texto, telefone });
          if (r.transferido) c.pausadaAte = agora().getTime() + config.pausaAposTransferenciaHoras * 3600_000;
          return r;
        } catch (err) {
          console.error(`[agente] erro em ${idConversa}:`, err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
          // Recomeça a conversa para não carregar um histórico pela metade
          c.mensagens = [];
          return { resposta: FALHA, transferido: false };
        }
      });
      c.fila = tarefa.catch(() => {});
      return tarefa;
    },

    /** Devolve a conversa ao agente antes do fim da pausa (ex.: equipe encerrou o atendimento). */
    retomar(idConversa) {
      const c = conversas.get(idConversa);
      if (c) c.pausadaAte = 0;
    },
  };
}
