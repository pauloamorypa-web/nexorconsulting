/* Configuração do Nexor Barber, lida das variáveis de ambiente (ver .env.exemplo).
   O que a barbearia muda sozinha (horários, serviços, planos, WhatsApp, SMS, Google, Asaas) fica no painel. */

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
    // Quantos proxies confiáveis ficam na frente (Cloudflare Tunnel, Caddy). 0 = ignora o X-Forwarded-For.
    // Padrão 0: com a porta exposta direto, o cabeçalho seria falsificável e furaria os limites por IP.
    proxies: Math.max(0, Math.floor(numero(env.TRUST_PROXY, 0))),
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
    // De quanto em quanto tempo a rotina roda (lembretes, lista de espera, retorno, assinaturas)
    rotinaMin: numero(env.ROTINA_MINUTOS, 5),
    nexor: configNexor(env),
    sistema: { nome: "Nexor Barber", versao: "1.0.0" },
  };
}

export const config = lerConfig();
