/* Ferramentas que o agente pode usar e o executor que as roda. */

import { chamarHttp, METODOS, montarUrl, precisaAprovacao } from "./conectores.js";

export const DEFINICOES = [
  {
    name: "chamar_sistema",
    description:
      "Faz uma chamada a um sistema conectado por API (ver <sistemas_conectados>). Leitura (GET) normalmente é executada na hora. Criar, editar ou apagar (POST, PUT, PATCH, DELETE) vai para aprovação do dono pelo WhatsApp: nesse caso a ferramenta responde que está aguardando e você deve avisar o dono.",
    input_schema: {
      type: "object",
      properties: {
        conector: { type: "string", description: "Nome do sistema conectado, ex.: crm" },
        metodo: { type: "string", enum: METODOS },
        caminho: { type: "string", description: "Caminho da API começando com /, ex.: /clientes/123" },
        consulta: { type: "object", description: "Parâmetros de consulta (query string), opcional", additionalProperties: { type: "string" } },
        corpo: { type: "object", description: "Corpo JSON para POST, PUT ou PATCH, opcional" },
        resumo: { type: "string", description: "O que esta chamada faz, em português simples, para o dono aprovar. Ex.: Criar pedido de 40 caixas de água para o Mercado Bom Preço, total R$ 1.080" },
      },
      required: ["conector", "metodo", "caminho", "resumo"],
    },
  },
  {
    name: "ajustar_perfil",
    description: "Muda o nome do agente, o nome da empresa do dono ou o jeito de falar, quando o dono pedir.",
    input_schema: {
      type: "object",
      properties: { campo: { type: "string", enum: ["nome", "empresa", "tom"] }, valor: { type: "string" } },
      required: ["campo", "valor"],
    },
  },
  {
    name: "guardar",
    description: "Guarda uma instrução permanente (algo que o agente deve sempre ou nunca fazer) ou uma memória (dado, preferência, contato) pedida pelo dono.",
    input_schema: {
      type: "object",
      properties: { tipo: { type: "string", enum: ["instrucoes", "memorias"] }, texto: { type: "string" } },
      required: ["tipo", "texto"],
    },
  },
  {
    name: "remover",
    description: "Remove uma instrução ou memória pelo número mostrado no perfil, quando o dono pedir.",
    input_schema: {
      type: "object",
      properties: { tipo: { type: "string", enum: ["instrucoes", "memorias"] }, numero: { type: "integer", minimum: 1 } },
      required: ["tipo", "numero"],
    },
  },
];

const resultado = (bloco, conteudo, erro = false) => ({ type: "tool_result", tool_use_id: bloco.id, content: typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo), ...(erro ? { is_error: true } : {}) });

/**
 * @param {object} deps
 * @param {{http: object[]}} deps.conectores
 * @param {ReturnType<import('./perfil.js').criarPerfil>} deps.perfil
 * @param {ReturnType<import('./aprovacoes.js').criarAprovacoes>} deps.aprovacoes
 * @param {(dono: string, pedido: object) => Promise<void>} deps.pedirAprovacao envia os botões ao dono
 * @param {(registro: object) => void} deps.auditar
 */
export function criarExecutor({ conectores, perfil, aprovacoes, pedirAprovacao, auditar, fetchFn, opcoesHttp = {} }) {
  return async function executar(bloco, ctx) {
    const e = bloco.input ?? {};
    try {
      switch (bloco.name) {
        case "chamar_sistema": {
          const c = conectores.http.find((x) => x.nome === e.conector);
          if (!c) return resultado(bloco, `Sistema "${e.conector}" não está conectado. Sistemas disponíveis: ${conectores.http.map((x) => x.nome).join(", ") || "nenhum"}.`, true);
          const metodo = String(e.metodo ?? "").toUpperCase();
          if (!METODOS.includes(metodo)) return resultado(bloco, "Método não permitido.", true);
          montarUrl(c, e.caminho, e.consulta); // valida antes de pedir aprovação
          const exige = precisaAprovacao(c, metodo);
          if (exige === null) {
            auditar({ evento: "bloqueado", dono: ctx.dono, conector: c.nome, metodo, caminho: e.caminho });
            return resultado(bloco, `Alterações no sistema ${c.nome} estão bloqueadas pela configuração. Só leitura é permitida.`, true);
          }
          const pedido = { dono: ctx.dono, conector: c.nome, metodo, caminho: e.caminho, consulta: e.consulta, corpo: e.corpo, resumo: String(e.resumo ?? "").slice(0, 600) };
          if (exige) {
            const id = aprovacoes.criar(pedido);
            auditar({ evento: "aprovacao_pedida", id, ...pedido });
            await pedirAprovacao(ctx.dono, { ...pedido, id });
            return resultado(bloco, `Pedido ${id} enviado ao dono para aprovação. Não repita a chamada. Avise em uma frase que está aguardando a aprovação dele.`);
          }
          const r = await chamarHttp(c, pedido, { fetchFn, ...opcoesHttp });
          auditar({ evento: "executado", ...pedido, status: r.status });
          return resultado(bloco, { status: r.status, resposta: r.texto }, !r.ok);
        }
        case "ajustar_perfil":
          auditar({ evento: "perfil", dono: ctx.dono, campo: e.campo });
          return resultado(bloco, perfil.ajustar(e.campo, e.valor));
        case "guardar":
          auditar({ evento: "guardar", dono: ctx.dono, tipo: e.tipo });
          return resultado(bloco, perfil.adicionar(e.tipo, e.texto));
        case "remover":
          auditar({ evento: "remover", dono: ctx.dono, tipo: e.tipo });
          return resultado(bloco, perfil.remover(e.tipo, e.numero));
        default:
          return resultado(bloco, `Ferramenta desconhecida: ${bloco.name}`, true);
      }
    } catch (err) {
      return resultado(bloco, `Não foi possível: ${err.message}`, true);
    }
  };
}

/** Executa um pedido que o dono aprovou. */
export async function executarAprovado(pedido, { conectores, auditar, fetchFn, opcoesHttp = {} }) {
  const c = conectores.http.find((x) => x.nome === pedido.conector);
  if (!c) throw new Error("sistema não está mais conectado");
  const r = await chamarHttp(c, pedido, { fetchFn, ...opcoesHttp });
  auditar({ evento: "aprovado_executado", id: pedido.id, dono: pedido.dono, conector: c.nome, metodo: pedido.metodo, caminho: pedido.caminho, resumo: pedido.resumo, status: r.status });
  return r;
}
