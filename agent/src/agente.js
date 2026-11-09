/* Núcleo do agente (Blue): guarda as conversas e roda o ciclo com o Claude e as ferramentas. */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { INSTRUCOES } from "./conhecimento.js";
import { DEFINICOES, criarExecutor } from "./ferramentas.js";
import { CONTATO_HUMANO, MENSAGEM_LIMITE_DIARIO, criarOrcamento } from "./orcamento.js";

const MAX_ITERACOES = 8;
const FALHA = "Desculpe, tive um problema para responder agora. Você pode falar direto com a equipe no WhatsApp (34) 99733-7499.";
const MENSAGEM_LONGA = "Sua mensagem ficou longa demais para mim 😅 Pode resumir em poucas linhas? Se preferir, mande os detalhes para a equipe pelo WhatsApp (34) 99733-7499.";
const CONVERSA_LONGA = `Nossa conversa já ficou bem longa por hoje! Para continuar com calma, a equipe da Nexor te atende pelo ${CONTATO_HUMANO}.`;

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
 * @param {string} [deps.instrucoes] instruções de sistema (padrão: a Blue, assistente da Nexor)
 * @param {boolean} [deps.comFerramentas] false = só conversa, sem registrar leads nem agendar (modo de teste)
 * @param {ReturnType<import('./orcamento.js').criarOrcamento>} [deps.orcamento] teto diário de chamadas e tokens (compartilhe entre agentes)
 */
export function criarAgente({ cliente = new Anthropic(), armazenamento, notificar = async () => {}, agora = () => new Date(), instrucoes = INSTRUCOES, comFerramentas = true, orcamento = criarOrcamento({ agora }) }) {
  const executar = criarExecutor({ armazenamento, notificar, agora });
  const sistema = [{ type: "text", text: instrucoes }];
  const ferramentas = comFerramentas ? DEFINICOES : [];
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
      c = { mensagens: [], atualizadaEm: t, pausadaAte: c?.pausadaAte ?? 0, envios: c?.envios ?? [], uso: c?.uso, fila: Promise.resolve() };
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

  /* Teto por conversa em 24 h: soma o que o visitante escreveu, mesmo quando o histórico recomeça. */
  const cabeNaConversa = (c, texto) => {
    const t = agora().getTime();
    if (!c.uso || t - c.uso.inicio > 24 * 3600_000) c.uso = { inicio: t, caracteres: 0, mensagens: 0 };
    if (c.uso.mensagens + 1 > config.conversaMaxMensagensDia || c.uso.caracteres + texto.length > config.conversaMaxCaracteres) return false;
    c.uso.mensagens++;
    c.uso.caracteres += texto.length;
    return true;
  };

  async function rodar(c, { idConversa, canal, texto, telefone, contexto }) {
    let transferido = false;
    if (!orcamento.reservarChamada()) return { resposta: MENSAGEM_LIMITE_DIARIO, transferido, limite: true };
    const ctx = { idConversa, canal, telefone, transferir: () => (transferido = true) };

    c.mensagens.push({
      role: "user",
      content: [
        { type: "text", text: `<contexto>agora: ${quandoAgora(agora())} (horário de Brasília) · canal: ${canal}${telefone ? ` · WhatsApp do cliente: ${telefone}` : ""}${contexto ? `\n${contexto}` : ""}</contexto>` },
        { type: "text", text: texto },
      ],
    });

    for (let i = 0; i < MAX_ITERACOES; i++) {
      if (i > 0 && !orcamento.reservarChamada()) {
        c.mensagens = []; // não deixa um histórico pela metade (resultado de ferramenta sem resposta)
        return { resposta: MENSAGEM_LIMITE_DIARIO, transferido, limite: true };
      }
      const resposta = await cliente.beta.messages.create({
        model: config.modelo,
        max_tokens: config.maxTokens,
        system: sistema,
        ...(ferramentas.length ? { tools: ferramentas } : {}),
        messages: c.mensagens,
        output_config: { effort: config.esforco },
        cache_control: { type: "ephemeral" },
        // Se o modelo recusar por política, a API tenta outro modelo na mesma chamada
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      orcamento.registrarUso(resposta.usage);

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
    responder({ idConversa, canal, texto, telefone, contexto }) {
      const c = obterConversa(idConversa);
      if (c.pausadaAte > agora().getTime()) return Promise.resolve({ resposta: null, transferido: true });
      if (typeof texto !== "string" || texto.length > config.tamanhoMaximoMensagem) return Promise.resolve({ resposta: MENSAGEM_LONGA, transferido: false, limite: true });
      if (!cabeNaConversa(c, texto)) return Promise.resolve({ resposta: CONVERSA_LONGA, transferido: false, limite: true });
      if (!dentroDoLimite(c)) {
        return Promise.resolve({ resposta: "Recebi muitas mensagens seguidas. Aguarde alguns minutos ou fale com a equipe no WhatsApp (34) 99733-7499.", transferido: false });
      }

      // Uma resposta por vez em cada conversa, na ordem de chegada
      const tarefa = c.fila.then(async () => {
        c.atualizadaEm = agora().getTime();
        try {
          const r = await rodar(c, { idConversa, canal, texto, telefone, contexto });
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
