/* Atendente virtual: monta a conversa para o Claude (texto, imagens e PDFs do cliente),
   roda o ciclo de ferramentas e devolve o que deve ser enviado ao cliente. */

import Anthropic from "@anthropic-ai/sdk";
import { config as configGlobal } from "../config.js";
import { executarFerramenta, ferramentasDaEmpresa } from "./ferramentas.js";
import { montarContexto, montarInstrucoes } from "./prompt.js";

const IMAGENS = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGEM = 5 * 1024 * 1024;
const MAX_PDF = 20 * 1024 * 1024;
const MAX_MIDIAS_POR_TURNO = 4;

export const FALHA = "Desculpe, tive uma instabilidade agora. Já chamei uma pessoa da equipe para continuar com você. 🙏";

const textoDa = (resposta) =>
  resposta.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

/** Descrição em texto de uma mensagem que não vai como mídia para o modelo */
export function descreverMensagem(m) {
  const c = m.conteudo ?? {};
  switch (m.tipo) {
    case "text":
    case "resposta":
      return m.texto ?? "";
    case "image":
      return `[imagem${m.texto ? `: ${m.texto}` : ""}]`;
    case "sticker":
      return "[figurinha]";
    case "video":
      return `[vídeo${m.texto ? `: ${m.texto}` : ""}]`;
    case "audio":
      return c.transcricao ? `[áudio transcrito] ${c.transcricao}` : "[áudio de voz — transcrição indisponível]";
    case "document":
      return `[documento ${c.midia?.nome ?? ""}${m.texto ? `: ${m.texto}` : ""}]`;
    case "template":
      return m.texto ?? `[modelo ${c.nome ?? ""}]`;
    case "interactive":
      return `${m.texto ?? ""}${c.opcoes ? `\n[opções enviadas: ${c.opcoes.join(" | ")}]` : ""}`;
    case "reaction":
      return `[reagiu com ${m.texto}]`;
    default:
      return m.texto || `[${m.tipo}]`;
  }
}

/**
 * Converte o histórico do banco em mensagens da API.
 * As mídias das mensagens ainda sem resposta vão como imagem/PDF; as antigas, como descrição.
 */
export async function montarMensagens(historico, { contexto, carregarMidia, notaFinal }) {
  const ultimaSaida = historico.findLastIndex((m) => m.direcao === "saida");
  const turnos = [];
  let midias = 0;
  for (const [i, m] of historico.entries()) {
    if (m.direcao === "nota" || m.tipo === "reaction") continue;
    const papel = m.direcao === "entrada" ? "user" : "assistant";
    const blocos = [];
    const midia = m.conteudo?.midia;
    if (papel === "user" && i > ultimaSaida && midia?.arquivo && carregarMidia && midias < MAX_MIDIAS_POR_TURNO) {
      const tipo = midia.tipo?.split(";")[0];
      const ehImagem = IMAGENS.has(tipo) && m.tipo !== "sticker";
      const ehPdf = tipo === "application/pdf";
      if (ehImagem || ehPdf) {
        const dados = await carregarMidia(midia.arquivo).catch(() => null);
        if (dados && dados.length <= (ehImagem ? MAX_IMAGEM : MAX_PDF)) {
          midias++;
          blocos.push(
            ehImagem
              ? { type: "image", source: { type: "base64", media_type: tipo, data: dados.toString("base64") } }
              : { type: "document", source: { type: "base64", media_type: "application/pdf", data: dados.toString("base64") }, title: midia.nome ?? "documento" },
          );
          if (m.texto) blocos.push({ type: "text", text: m.texto });
          else blocos.push({ type: "text", text: ehImagem ? "[o cliente enviou esta imagem]" : `[o cliente enviou este documento: ${midia.nome ?? "PDF"}]` });
        }
      }
    }
    if (!blocos.length) {
      const t = descreverMensagem(m).trim();
      if (!t) continue;
      blocos.push({ type: "text", text: t });
    }
    const anterior = turnos.at(-1);
    if (anterior?.role === papel) anterior.content.push(...blocos);
    else turnos.push({ role: papel, content: blocos });
  }
  if (turnos[0]?.role === "assistant") turnos.unshift({ role: "user", content: [{ type: "text", text: "[início da conversa: a empresa escreveu primeiro]" }] });
  if (!turnos.length || turnos.at(-1).role === "assistant") turnos.push({ role: "user", content: [] });
  const ultimo = turnos.at(-1);
  ultimo.content.unshift({ type: "text", text: contexto });
  if (notaFinal) ultimo.content.push({ type: "text", text: notaFinal });
  if (ultimo.content.length === 1) ultimo.content.push({ type: "text", text: "[sem texto]" });
  return turnos;
}

/**
 * @param {object} deps
 * @param {Anthropic} [deps.cliente]
 * @param {ReturnType<import('../db.js').abrirBanco>} deps.repo
 * @param {ReturnType<import('./conhecimento.js').criarCacheConhecimento>} deps.conhecimento
 * @param {(arquivo: string) => Promise<Buffer>} [deps.carregarMidia]
 * @param {() => number} [deps.agora]
 */
export function criarAgente({ cliente = new Anthropic(), repo, conhecimento, carregarMidia, agora = () => Date.now(), ia = configGlobal.ia }) {
  /**
   * @param {object} p
   * @param {object} p.empresa empresa com config completa
   * @param {object} p.contato
   * @param {object} p.conversa
   * @param {Array} p.historico mensagens do banco, em ordem
   * @param {object} [p.horario] situação do horário de funcionamento
   * @param {boolean} [p.simulacao]
   * @param {string} [p.notaFinal] instrução extra ao fim (ex.: follow-up)
   */
  async function responder({ empresa, contato, conversa, historico, horario, simulacao = false, notaFinal, agendamentos = [] }) {
    const temCatalogo = repo.produtos(empresa.id, true).length > 0;
    const temConhecimento = conhecimento.indice(empresa.id).tamanho > 0;
    const sistema = [{ type: "text", text: montarInstrucoes(empresa, { aprendizados: repo.aprendizados(empresa.id, 40), temCatalogo, temConhecimento }) }];
    const ferramentas = ferramentasDaEmpresa({ config: empresa.config, temCatalogo, temConhecimento });
    const contexto = montarContexto({
      agora: agora(),
      contato,
      horario,
      conversaNova: !historico.some((m) => m.direcao === "saida"),
      agendamentos,
    });
    const mensagens = await montarMensagens(historico.slice(-ia.historico), { contexto, carregarMidia, notaFinal });
    const saida = { opcoes: null, midias: [], transferencia: null, encerrar: null, eventos: [], ferramentas: [], contatoAtualizado: false };
    const ctx = { repo, empresa, contato, conversa, conhecimento, agora: agora(), simulacao, saida, horario };

    for (let i = 0; i < ia.maxIteracoes; i++) {
      const resposta = await cliente.beta.messages.create({
        model: ia.modelo,
        max_tokens: ia.maxTokens,
        system: sistema,
        tools: ferramentas,
        messages: mensagens,
        output_config: { effort: ia.esforco },
        cache_control: { type: "ephemeral" },
        // Se o modelo recusar por política, a API tenta outro modelo na mesma chamada
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (!simulacao) repo.registrarUsoIA(empresa.id, resposta.usage);

      // O conteúdo completo volta ao histórico deste turno (inclui blocos de raciocínio)
      mensagens.push({ role: "assistant", content: resposta.content });

      if (resposta.stop_reason === "pause_turn") continue;
      if (resposta.stop_reason === "refusal") {
        return { texto: "Esse assunto eu não consigo tratar por aqui. Vou chamar uma pessoa da equipe para te ajudar.", ...saida, transferencia: saida.transferencia ?? { motivo: "assunto recusado pela IA", resumo: "A IA não pôde responder a última mensagem.", prioridade: "normal" }, contato: ctx.contato };
      }
      const chamadas = resposta.content.filter((b) => b.type === "tool_use");
      if (resposta.stop_reason !== "tool_use" || chamadas.length === 0) {
        let texto = textoDa(resposta);
        if (saida.opcoes && texto && saida.opcoes.texto.includes(texto.slice(0, 40))) texto = "";
        return { texto, ...saida, contato: ctx.contato };
      }
      const resultados = await Promise.all(chamadas.map((b) => executarFerramenta(b, ctx)));
      mensagens.push({ role: "user", content: resultados });
    }
    console.warn(`[agente] limite de iterações atingido na conversa ${conversa?.id}`);
    return { texto: "", ...saida, transferencia: saida.transferencia ?? { motivo: "a IA não concluiu a resposta", resumo: "Conversa precisa de atenção humana.", prioridade: "normal" }, contato: ctx.contato };
  }

  return { responder };
}
