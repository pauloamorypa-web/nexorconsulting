/* Configuração do Nexor Atende IA, lida das variáveis de ambiente (ver .env.example). */

const lista = (valor, padrao = "") =>
  String(valor ?? padrao)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const numero = (valor, padrao) => {
  const n = Number(valor);
  return Number.isFinite(n) && valor !== "" && valor !== undefined ? n : padrao;
};

export function lerConfig(env = process.env) {
  return {
    porta: numero(env.PORT, 8790),
    // Endereço público do servidor (usado para montar a URL do webhook mostrada no painel)
    urlPublica: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
    producao: env.NODE_ENV === "production",

    pastaDados: env.DATA_DIR ?? "./data",
    // Chave usada para criptografar os tokens da Meta no banco. Em produção é obrigatória.
    chaveMestra: env.MASTER_KEY ?? "",
    // Permite que novas empresas criem conta pelo painel (modo SaaS). Sem isso, só o primeiro acesso cria a conta.
    permitirCadastro: env.ALLOW_SIGNUP === "true",

    ia: {
      modelo: env.NEXOR_MODEL ?? "claude-opus-5-5",
      // Atendimento é conversa curta: "low" responde rápido; o copiloto e a análise usam o esforço indicado em cada um.
      esforco: env.NEXOR_EFFORT ?? "low",
      esforcoCopiloto: env.NEXOR_COPILOT_EFFORT ?? "low",
      maxTokens: numero(env.NEXOR_MAX_TOKENS, 16000),
      maxIteracoes: 8,
      // Quantas mensagens recentes da conversa vão para a IA a cada resposta
      historico: numero(env.NEXOR_HISTORY, 40),
      // Análise automática (sentimento, intenção, temperatura do lead) a cada N mensagens do cliente
      analisarACada: numero(env.NEXOR_ANALYZE_EVERY, 3),
    },

    meta: {
      versaoGraph: env.META_GRAPH_VERSION ?? "v23.0",
      // Segredo do app da Meta (Configurações do app → Básico). Confere a assinatura de cada webhook.
      segredoApp: env.META_APP_SECRET ?? "",
      // Texto que a Meta envia na verificação do webhook (você escolhe e coloca igual no painel da Meta)
      tokenVerificacao: env.META_VERIFY_TOKEN ?? "",
      // Para o cadastro incorporado (Embedded Signup): ID do app e da configuração do Login do Facebook
      idApp: env.META_APP_ID ?? "",
      idConfiguracao: env.META_CONFIG_ID ?? "",
    },

    origensPermitidas: lista(env.ALLOWED_ORIGINS),

    limites: {
      tamanhoCorpo: 25 * 1024 * 1024, // uploads de mídia
      tamanhoMensagem: 4000,
      mensagensPorJanela: 25,
      janelaMinutos: 10,
      tentativasLogin: 8,
    },

    sessaoDias: numero(env.SESSION_DAYS, 14),
    fuso: "America/Sao_Paulo",
  };
}

export const config = lerConfig();
