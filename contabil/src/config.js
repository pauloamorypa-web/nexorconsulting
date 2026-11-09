/* Configuração do Nexor Contábil, lida das variáveis de ambiente (ver .env.exemplo). */

import { configNexor } from "./nexor/central.js";

const numero = (v, padrao) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : padrao;
};

export function lerConfig(env = process.env) {
  return {
    porta: numero(env.PORT, 8793),
    urlPublica: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
    producao: env.NODE_ENV === "production",
    pastaDados: env.DATA_DIR ?? "./data",
    proxies: Math.max(0, Math.floor(numero(env.TRUST_PROXY, 1))),
    // Criptografa os arquivos dos clientes, tokens do WhatsApp e chave de e-mail. Obrigatória em produção.
    chaveMestra: env.MASTER_KEY ?? "",
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
      tentativasLogin: 8, // demais rotas públicas por IP (cadastro, convite, suporte, vincular) a cada 15 min
      // Login do painel e do portal (src/http/limite.js): por IP conta toda tentativa, por conta só as falhas
      login: { porIp: numero(env.LIMITE_LOGIN_IP, 20), porConta: numero(env.LIMITE_LOGIN_CONTA, 5), janelaMs: 15 * 60_000 },
    },
    // Hora (Brasília) em que a rotina diária cobra documentos e gera tarefas
    horaRotina: numero(env.ROTINA_HORA, 9),
    nexor: configNexor(env),
    sistema: { nome: "Nexor Contábil", versao: "1.0.0" },
  };
}

export const config = lerConfig();
