/* Configuração do Nexor Atende IA, lida das variáveis de ambiente (ver .env.example). */

import { configNexor } from "./nexor/central.js";

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
  // Modo Demonstração (DEMO=1): dados fictícios, sem nenhuma chamada externa, só em 127.0.0.1 (ver DEMO.md)
  const demo = env.DEMO === "1";
  return {
    demo,
    demoPublico: demo && env.DEMO_PUBLICO === "1",
    demoReset: demo && env.DEMO_RESET === "1",
    // IA real só se pedida e com chave da Anthropic no ambiente
    demoIaReal: demo && env.DEMO_IA_REAL === "1" && Boolean(env.ANTHROPIC_API_KEY),
    porta: numero(env.PORT, 8790),
    // Endereço público do servidor (usado para montar a URL do webhook mostrada no painel)
    urlPublica: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
    producao: env.NODE_ENV === "production",

    pastaDados: env.DATA_DIR ?? (demo ? "./data-demo" : "./data"),
    // Chave usada para criptografar os tokens da Meta no banco. Em produção é obrigatória.
    // Na demonstração, sem MASTER_KEY, usa uma chave fixa (só protege tokens fictícios)
    chaveMestra: env.MASTER_KEY || (demo ? "nexor-demonstracao-chave-fixa-nao-usar-em-producao" : ""),
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
      iaPorUsuario: numero(env.LIMITE_IA_USUARIO, 40), // pedidos à IA do painel a cada 10 min, por usuário
      iaPorEmpresaHora: numero(env.LIMITE_IA_EMPRESA_HORA, 400), // pedidos à IA do painel por hora, somando a empresa
      arquivosPorUsuario: numero(env.LIMITE_ARQUIVOS_USUARIO, 60), // arquivos enviados a cada 10 min, por usuário
      arquivosPorEmpresaHora: numero(env.LIMITE_ARQUIVOS_EMPRESA_HORA, 600),
    },

    sessaoDias: numero(env.SESSION_DAYS, 14),
    // Nexor Central: licença (situação do contrato), saúde e acesso de suporte
    nexor: configNexor(env),
    fuso: "America/Sao_Paulo",
  };
}

export const config = lerConfig();
