/* Configuração do Nexor Agente, lida das variáveis de ambiente (ver .env.example). */

import { configNexor } from "./nexor/central.js";

const lista = (v) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const numero = (v, padrao) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : padrao);

export function lerConfig(env = process.env) {
  return {
    porta: numero(env.PORT, 8790),
    pastaDados: env.DATA_DIR ?? "./dados",
    arquivoConectores: env.CONECTORES ?? "./conectores.json",

    // Claude
    modelo: env.NEXOR_MODEL ?? "claude-opus-5-5",
    esforco: env.NEXOR_EFFORT ?? "medium",
    maxTokens: numero(env.NEXOR_MAX_TOKENS, 16000),

    // Quem pode dar ordens ao agente: só estes números (DDI + DDD + número, só dígitos).
    // Qualquer outra pessoa que escrever recebe uma recusa educada e nada é executado.
    donos: lista(env.DONOS).map((n) => n.replace(/\D/g, "")),

    whatsapp: {
      token: env.WHATSAPP_TOKEN ?? "",
      idNumero: env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      tokenVerificacao: env.WHATSAPP_VERIFY_TOKEN ?? "",
      segredoApp: env.WHATSAPP_APP_SECRET ?? "",
      versaoGraph: env.WHATSAPP_GRAPH_VERSION ?? "v21.0",
    },

    // Proteções
    aprovacaoExpiraMinutos: numero(env.APROVACAO_EXPIRA_MIN, 30),
    limiteMensagens: { quantidade: numero(env.LIMITE_MENSAGENS, 40), janelaMinutos: 10 },
    conversaExpiraHoras: 12,
    conversaMaxMensagens: 120,
    tempoLimiteSistemaMs: 20_000,
    tamanhoMaximoResposta: 20_000,

    // Painel web (chat e aprovações no navegador). Só liga com uma senha definida.
    painelSenha: env.PAINEL_SENHA ?? "",

    // Nexor Central: licença (situação do contrato) e saúde da instalação
    nexor: configNexor(env),
  };
}

export const config = lerConfig();
