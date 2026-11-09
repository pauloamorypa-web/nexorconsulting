/* Configuração do Nexor Barber, lida das variáveis de ambiente (ver .env.exemplo).
   O que a barbearia muda sozinha (horários, serviços, planos, WhatsApp, SMS, Google, Asaas) fica no painel. */

import { lerPrazos } from "./lgpd/motor.js";
import { PRAZOS_PADRAO } from "./lgpd/mapa.js";
import { configNexor } from "./nexor/central.js";

const numero = (v, padrao) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : padrao;
};

export function lerConfig(env = process.env) {
  return {
    porta: numero(env.PORT, 8795),
    urlPublica: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
    producao: env.NODE_ENV === "production",
    pastaDados: env.DATA_DIR ?? "./data",
    proxies: Math.max(0, Math.floor(numero(env.TRUST_PROXY, 1))),
    // Criptografa os tokens do WhatsApp, SMS e Asaas guardados no banco. Obrigatória em produção.
    chaveMestra: env.MASTER_KEY ?? "",
    codigoInstalacao: env.INSTALL_CODE ?? "",
    sessaoDias: numero(env.SESSION_DAYS, 7),
    sessaoClienteDias: numero(env.CLIENT_SESSION_DAYS, 90),
    meta: { versaoGraph: env.META_GRAPH_VERSION ?? "v23.0" },
    sms: { url: (env.SMS_API_URL ?? "https://api.twilio.com").replace(/\/$/, "") },
    asaas: { producao: "https://api.asaas.com/v3", sandbox: "https://api-sandbox.asaas.com/v3" },
    google: { certificados: env.GOOGLE_CERTS_URL ?? "https://www.googleapis.com/oauth2/v3/certs" },
    limites: { tentativasLogin: 8, codigosPorHora: 5 },
    // Termos de Uso e Política de Privacidade: mudou a versão, todo usuário do painel aceita de novo
    termos: { versao: env.TERMOS_VERSAO || "2026-11-09", url: env.TERMOS_URL || "https://nexorconsultingit.com.br/privacidade.html" },
    // LGPD: prazos de guarda por tipo de dado (meses); o expurgo roda uma vez por dia dentro da rotina
    lgpd: { prazos: lerPrazos(PRAZOS_PADRAO, env.LGPD_PRAZOS) },
    // De quanto em quanto tempo a rotina roda (lembretes, lista de espera, retorno, assinaturas)
    rotinaMin: numero(env.ROTINA_MINUTOS, 5),
    nexor: configNexor(env),
    sistema: { nome: "Nexor Barber", versao: "1.0.0" },
  };
}

export const config = lerConfig();
