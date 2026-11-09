/* Configuração do Nexor Contábil, lida das variáveis de ambiente (ver .env.exemplo). */

import { lerPrazos } from "./lgpd/motor.js";
import { PRAZOS_PADRAO } from "./lgpd/mapa.js";
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
      tentativasLogin: 8,
    },
    // Termos de Uso e Política de Privacidade: mudou a versão, todo usuário do painel aceita de novo
    termos: { versao: env.TERMOS_VERSAO ?? "2026-11-09", url: env.TERMOS_URL ?? "https://nexorconsultingit.com.br/privacidade.html" },
    // LGPD: prazos de guarda por tipo de dado (meses); o expurgo roda uma vez por dia dentro da rotina
    lgpd: { prazos: lerPrazos(PRAZOS_PADRAO, env.LGPD_PRAZOS) },
    // Hora (Brasília) em que a rotina diária cobra documentos e gera tarefas
    horaRotina: numero(env.ROTINA_HORA, 9),
    nexor: configNexor(env),
    sistema: { nome: "Nexor Contábil", versao: "1.0.0" },
  };
}

export const config = lerConfig();
