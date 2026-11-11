/* Simulação das campanhas: roda personas pela Blue de verdade (agente.js, ferramentas.js, campanhas.js,
   qualificacao.js), trocando só o modelo.

   - Modelo SIMULADO (padrão nos testes): segue o mesmo padrão do cliente falso dos testes do agente
     (objeto com beta.messages.create). A cada mensagem do cliente ele lê os sinais com as regras de
     extrairSinais e chama qualificar_lead, como a Blue faria; depois responde com a próxima pergunta.
   - Modelo REAL: o cliente da Anthropic (precisa de ANTHROPIC_API_KEY). Quem lê a conversa é o Claude.

   Em ambos, a nota e a classe saem do código (pontuarLead), nunca do modelo. */

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { criarAgente } from "../src/agente.js";
import { criarArmazenamento } from "../src/armazenamento.js";
import { UMBRELLA, campanhaPorId, detectarCampanha } from "../src/campanhas.js";
import { consolidarLeads, limparOrigem } from "../src/leads.js";
import { extrairSinais } from "../src/qualificacao.js";

export const PASTA_PERSONAS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "personas");

const textosDoCliente = (mensagens) =>
  mensagens
    .filter((m) => m.role === "user" && Array.isArray(m.content))
    .flatMap((m) => m.content.filter((b) => b.type === "text" && !b.text.startsWith("<contexto>")).map((b) => b.text));

/** Cliente falso que imita a Blue: qualifica a cada mensagem e faz a próxima pergunta. */
export function clienteSimulado() {
  let n = 0;
  const requisicoes = [];
  return {
    requisicoes,
    beta: {
      messages: {
        async create(params) {
          requisicoes.push(params);
          const ultima = params.messages.at(-1);
          const resultado = ultima.content.find?.((b) => b.type === "tool_result");
          if (resultado) {
            let r = {};
            try {
              r = JSON.parse(resultado.content);
            } catch {
              /* resultado de erro */
            }
            const texto = r.proxima_acao === "agendar_demo"
              ? "Que bom! Posso te mostrar uns horários para a demonstração?"
              : r.proxima_acao === "enviar_material_preco"
                ? "Tenho um resumo com os planos. Posso te mandar por aqui?"
                : r.perguntas_que_faltam?.[0] ?? "Entendi! Qualquer coisa, é só me chamar por aqui 💙";
            return { stop_reason: "end_turn", content: [{ type: "text", text: texto }] };
          }
          const contexto = params.messages[0].content.find((b) => b.text?.startsWith("<contexto>"))?.text ?? "";
          const campanha = campanhaPorId(contexto.match(/<campanha id="([^"]+)"/)?.[1]) ?? UMBRELLA;
          const sinais = extrairSinais(textosDoCliente(params.messages), { campanha });
          return { stop_reason: "tool_use", content: [{ type: "tool_use", id: `sim-${++n}`, name: "qualificar_lead", input: sinais }] };
        },
      },
    },
  };
}

/** Carrega as personas (um arquivo JSON por campanha, cada um com uma lista). */
export async function carregarPersonas(pasta = PASTA_PERSONAS) {
  const arquivos = (await readdir(pasta)).filter((a) => a.endsWith(".json")).sort();
  const lista = [];
  for (const a of arquivos) lista.push(...JSON.parse(await readFile(path.join(pasta, a), "utf8")));
  return lista;
}

/**
 * Roda a conversa de uma persona pela Blue e devolve o que foi detectado e classificado.
 * O canal e a detecção seguem o servidor: site usa as UTMs da página; WhatsApp usa o texto e o anúncio.
 */
export async function rodarPersona(persona, { cliente = clienteSimulado(), agora } = {}) {
  const pasta = await mkdtemp(path.join(tmpdir(), "nexor-persona-"));
  const avisos = [];
  const conversoes = [];
  let relogio = new Date("2026-11-10T10:00:00-03:00").getTime();
  const agente = criarAgente({
    cliente,
    armazenamento: criarArmazenamento(pasta),
    notificar: async (texto, dados) => avisos.push({ texto, dados }),
    agora: agora ?? (() => new Date((relogio += 20_000))),
    conversao: async (evento, lead) => conversoes.push({ evento, nota: lead.nota, classe: lead.classe }),
  });
  const whatsapp = persona.canal === "whatsapp";
  const telefone = whatsapp ? persona.telefone ?? "5534900000000" : undefined;
  const origem = whatsapp ? undefined : limparOrigem(persona.origem);
  const respostas = [];
  let deteccao;
  try {
    for (const texto of persona.mensagens) {
      const d = whatsapp ? detectarCampanha({ texto, referral: persona.referral }) : detectarCampanha({ origem, texto });
      deteccao ??= d;
      if (deteccao.via === "padrao" && d.via !== "padrao") deteccao = d;
      const r = await agente.responder({ idConversa: `${persona.canal}:${persona.id}`, canal: persona.canal, texto, telefone, campanha: d, origem, consentimento: true });
      respostas.push(r.resposta);
    }
    const lead = consolidarLeads(await criarArmazenamento(pasta).listarLeads()).find((l) => l.tipo === "conversa");
    return {
      persona: persona.id,
      tipo: persona.tipo,
      esperado: persona.esperado,
      campanha: deteccao?.id,
      via: deteccao?.via,
      nota: lead?.nota ?? null,
      classe: lead?.classe ?? "sem_qualificacao",
      descarte: lead?.descarte ?? null,
      motivos: lead?.motivos ?? [],
      produto: lead?.produto ?? null,
      produto_indicado: lead?.produto_indicado ?? null,
      proxima_acao: lead?.proxima_acao ?? null,
      avisos,
      conversoes,
      respostas,
    };
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

const CLASSES = ["quente", "morno", "frio"];

/** Matriz de acerto: classe esperada (linhas) x classe dada pela Blue (colunas), e acerto da campanha. */
export function matrizDeAcerto(resultados) {
  const colunas = [...CLASSES, "sem_qualificacao"];
  const matriz = Object.fromEntries(CLASSES.map((e) => [e, Object.fromEntries(colunas.map((c) => [c, 0]))]));
  let classeOk = 0;
  let campanhaOk = 0;
  const erros = [];
  for (const r of resultados) {
    matriz[r.esperado.classe][r.classe]++;
    const okClasse = r.classe === r.esperado.classe;
    const okCampanha = r.campanha === r.esperado.campanha;
    if (okClasse) classeOk++;
    if (okCampanha) campanhaOk++;
    if (!okClasse || !okCampanha) erros.push(r);
  }
  return { matriz, total: resultados.length, classeOk, campanhaOk, erros };
}

export function imprimirMatriz({ matriz, total, classeOk, campanhaOk, erros }, escrever = console.log) {
  const colunas = Object.keys(matriz.quente);
  const pad = (s, n) => String(s).padEnd(n);
  escrever(`${pad("esperado \\ classificado", 24)}${colunas.map((c) => pad(c, 18)).join("")}`);
  for (const [linha, valores] of Object.entries(matriz)) escrever(`${pad(linha, 24)}${colunas.map((c) => pad(valores[c], 18)).join("")}`);
  escrever("");
  escrever(`Classe certa:   ${classeOk}/${total} (${Math.round((classeOk / total) * 100)}%)`);
  escrever(`Campanha certa: ${campanhaOk}/${total} (${Math.round((campanhaOk / total) * 100)}%)`);
  for (const e of erros) {
    escrever(`  ✗ ${e.persona}: esperado ${e.esperado.campanha}/${e.esperado.classe}, veio ${e.campanha}/${e.classe} (nota ${e.nota ?? "-"})`);
  }
}
