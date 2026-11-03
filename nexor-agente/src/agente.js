/* Ciclo do agente: conversa com o dono, chama as ferramentas e os servidores MCP até concluir. */

import Anthropic from "@anthropic-ai/sdk";
import { descreverSistemas } from "./conectores.js";
import { DEFINICOES, criarExecutor } from "./ferramentas.js";
import { INSTRUCOES } from "./instrucoes.js";
import { textoDoPerfil } from "./perfil.js";

const MAX_ITERACOES = 12;
const FALHA = "Tive um problema para concluir agora. Pode repetir o pedido daqui a pouco?";

const quandoAgora = (d) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const textoDa = (m) => m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

/** Parte MCP da requisição: servidores e conjuntos de ferramentas (com lista fechada quando configurada). */
export function parametrosMcp(mcp) {
  if (!mcp.length) return { mcp_servers: undefined, toolsets: [] };
  return {
    mcp_servers: mcp.map((s) => ({ type: "url", url: s.url, name: s.nome, ...(s.token ? { authorization_token: s.token } : {}) })),
    toolsets: mcp.map((s) => ({
      type: "mcp_toolset",
      mcp_server_name: s.nome,
      ...(s.ferramentas ? { default_config: { enabled: false }, configs: Object.fromEntries(s.ferramentas.map((n) => [n, { enabled: true }])) } : {}),
    })),
  };
}

export function criarAgente({ config, cliente = new Anthropic(), conectores, perfil, aprovacoes, pedirAprovacao, auditar = () => {}, fetchFn, agora = () => new Date() }) {
  const executar = criarExecutor({ conectores, perfil, aprovacoes, pedirAprovacao, auditar, fetchFn, opcoesHttp: { tempoLimiteMs: config.tempoLimiteSistemaMs, tamanhoMaximo: config.tamanhoMaximoResposta } });
  const { mcp_servers, toolsets } = parametrosMcp(conectores.mcp);
  const ferramentas = [...DEFINICOES, ...toolsets];
  const betas = ["server-side-fallback-2026-07-01", ...(mcp_servers ? ["mcp-client-2025-11-20"] : [])];
  const conversas = new Map();

  const obter = (dono) => {
    const t = agora().getTime();
    let c = conversas.get(dono);
    if (!c || t - c.atualizadaEm > config.conversaExpiraHoras * 3600_000 || c.mensagens.length >= config.conversaMaxMensagens) {
      c = { mensagens: [], atualizadaEm: t, envios: c?.envios ?? [], fila: Promise.resolve() };
      conversas.set(dono, c);
    }
    return c;
  };

  const dentroDoLimite = (c) => {
    const t = agora().getTime();
    c.envios = c.envios.filter((x) => t - x < config.limiteMensagens.janelaMinutos * 60_000);
    if (c.envios.length >= config.limiteMensagens.quantidade) return false;
    c.envios.push(t);
    return true;
  };

  async function rodar(c, { dono, texto, evento }) {
    const sistema = [
      { type: "text", text: INSTRUCOES },
      { type: "text", text: `${textoDoPerfil(perfil.obter())}\n\n<sistemas_conectados>\n${descreverSistemas(conectores)}\n</sistemas_conectados>` },
    ];
    c.mensagens.push({
      role: "user",
      content: [
        { type: "text", text: `<contexto>agora: ${quandoAgora(agora())} (Brasília) · mensagem do dono pelo WhatsApp</contexto>` },
        { type: "text", text: evento ? `<evento_do_sistema>${evento}</evento_do_sistema>` : texto },
      ],
    });

    for (let i = 0; i < MAX_ITERACOES; i++) {
      const r = await cliente.beta.messages.create({
        model: config.modelo,
        max_tokens: config.maxTokens,
        system: sistema,
        tools: ferramentas,
        ...(mcp_servers ? { mcp_servers } : {}),
        messages: c.mensagens,
        output_config: { effort: config.esforco },
        cache_control: { type: "ephemeral" },
        betas,
        fallbacks: "default",
      });
      c.mensagens.push({ role: "assistant", content: r.content });
      if (r.stop_reason === "pause_turn") continue;
      if (r.stop_reason === "refusal") {
        c.mensagens = [];
        return "Não posso fazer isso. Se precisar, me peça de outro jeito ou fale com a Nexor.";
      }
      const chamadas = r.content.filter((b) => b.type === "tool_use");
      if (r.stop_reason !== "tool_use" || !chamadas.length) return textoDa(r) || FALHA;
      const resultados = await Promise.all(chamadas.map((b) => executar(b, { dono })));
      c.mensagens.push({ role: "user", content: resultados });
    }
    return FALHA;
  }

  return {
    /** Mensagem do dono (texto) ou evento do sistema (resultado de uma aprovação). Uma por vez, na ordem. */
    responder({ dono, texto, evento }) {
      const c = obter(dono);
      if (!evento && !dentroDoLimite(c)) return Promise.resolve("Recebi muitas mensagens seguidas. Me dá uns minutinhos e manda de novo?");
      const tarefa = c.fila.then(async () => {
        c.atualizadaEm = agora().getTime();
        try {
          return await rodar(c, { dono, texto, evento });
        } catch (err) {
          console.error(`[agente] erro:`, err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
          c.mensagens = [];
          return FALHA;
        }
      });
      c.fila = tarefa.catch(() => {});
      return tarefa;
    },
    esquecerConversa: (dono) => conversas.delete(dono),
  };
}
