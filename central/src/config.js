/* Configuração da Nexor Central, lida das variáveis de ambiente (ver .env.exemplo). */

const numero = (v, padrao) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : padrao;
};

export function lerConfig(env = process.env) {
  return {
    porta: numero(env.PORT, 8800),
    urlPublica: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
    producao: env.NODE_ENV === "production",
    pastaDados: env.DATA_DIR ?? "./data",
    proxies: Math.max(0, Math.floor(numero(env.TRUST_PROXY, 1))),
    // Criptografa os segredos do 2FA no banco. Obrigatória em produção.
    chaveMestra: env.MASTER_KEY ?? "",
    // Chave privada Ed25519 que assina licenças e acessos (PEM). Vazia: gerada em DATA_DIR/chave-licenca.pem
    chavePrivada: (env.LICENSE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    codigoInstalacao: env.INSTALL_CODE ?? "",
    sessaoHoras: numero(env.SESSION_HOURS, 12),
    // Por quanto tempo uma licença vale sem novo contato com a Central (dias). Depois, o sistema do cliente
    // passa a "restrito" (somente leitura), nunca a bloqueado por falta de contato.
    licencaDias: numero(env.LICENSE_DAYS, 15),
    // Validade do link de acesso de suporte (segundos)
    acessoSegundos: numero(env.ACCESS_SECONDS, 120),
    asaas: {
      url: (env.ASAAS_URL ?? "https://api.asaas.com/v3").replace(/\/$/, ""),
      chave: env.ASAAS_API_KEY ?? "",
      webhookToken: env.ASAAS_WEBHOOK_TOKEN ?? "",
    },
    // Regras padrão de cobrança (cada cliente pode ter as suas)
    regrasPadrao: {
      aviso: numero(env.RULE_WARN_DAYS, 1),
      restrito: numero(env.RULE_RESTRICT_DAYS, 10),
      bloqueio: numero(env.RULE_BLOCK_DAYS, 20),
      antecedencia: numero(env.RULE_INVOICE_DAYS, 10),
      manter_ponto: true,
    },
    // Conversão offline: teste ativado e contrato fechado vão para a Blue (POST /api/conversao), que devolve ao Meta e ao Google.
    // Padrão: CONVERSAO_URL=https://<blue>/api/conversao e CONVERSAO_TOKEN = o REPORT_TOKEN da Blue. Vazio: desligado.
    conversao: { url: env.CONVERSAO_URL ?? "", token: env.CONVERSAO_TOKEN ?? "" },
    contato: { whatsapp: env.SUPPORT_WHATSAPP ?? "", email: env.SUPPORT_EMAIL ?? "contato@nexorconsultingit.com.br" },
    limites: { tentativasLogin: 8 },
  };
}

export const config = lerConfig();
