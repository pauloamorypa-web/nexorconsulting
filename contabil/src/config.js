/* Configuração do Nexor Contábil, lida das variáveis de ambiente (ver .env.exemplo). */

import { configNexor } from "./nexor/central.js";

const numero = (v, padrao) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : padrao;
};

// Chave fixa só para o Modo Demonstração (dados fictícios): nunca vale fora de DEMO=1
const CHAVE_DEMO = "nexor-contabil-demonstracao-dados-ficticios";

export function lerConfig(env = process.env) {
  const demo = env.DEMO === "1";
  return {
    porta: numero(env.PORT, 8793),
    urlPublica: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
    producao: env.NODE_ENV === "production",
    pastaDados: env.DATA_DIR ?? (demo ? "./data-demo" : "./data"),
    proxies: Math.max(0, Math.floor(numero(env.TRUST_PROXY, 1))),
    // Criptografa os arquivos dos clientes, tokens do WhatsApp e chave de e-mail. Obrigatória em produção.
    chaveMestra: env.MASTER_KEY || (demo ? CHAVE_DEMO : ""),
    // Código pedido na criação da primeira conta (em produção, gerado em DATA_DIR/codigo-instalacao.txt)
    codigoInstalacao: env.INSTALL_CODE ?? "",
    sessaoDias: numero(env.SESSION_DAYS, 7),
    sessaoPortalDias: numero(env.PORTAL_SESSION_DAYS, 30),
    ia: {
      modelo: env.NEXOR_MODEL ?? "claude-opus-5-5",
      esforco: env.NEXOR_EFFORT ?? "low",
      // Leituras de documento por hora (protege os créditos de IA do escritório)
      leiturasPorHora: numero(env.LIMITE_LEITURAS_HORA, 300),
    },
    meta: { versaoGraph: env.META_GRAPH_VERSION ?? "v23.0" },
    email: { url: (env.EMAIL_API_URL ?? "https://api.resend.com/emails").replace(/\/$/, "") },
    limites: {
      tamanhoArquivo: numero(env.MAX_UPLOAD_MB, 20) * 1024 * 1024,
      tentativasLogin: 8,
    },
    // Hora (Brasília) em que a rotina diária cobra documentos e gera tarefas
    horaRotina: numero(env.ROTINA_HORA, 9),
    nexor: configNexor(env),
    sistema: { nome: "Nexor Contábil", versao: "1.0.0" },
    // Modo Demonstração (ver DEMO.md): dados fictícios, nenhuma chamada externa, só em 127.0.0.1
    demo,
    demoPublico: demo && env.DEMO_PUBLICO === "1",
    demoReset: demo && env.DEMO_RESET === "1",
    demoIaReal: demo && env.DEMO_IA_REAL === "1" && Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    demoPagamentoSegundos: numero(env.DEMO_PAGAMENTO_SEGUNDOS, 8),
  };
}

export const config = lerConfig();
