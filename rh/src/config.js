/* Configuração do Nexor RH, lida das variáveis de ambiente (ver .env.example). */

const numero = (v, padrao) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : padrao;
};

export function lerConfig(env = process.env) {
  return {
    porta: numero(env.PORT, 8791),
    urlPublica: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
    producao: env.NODE_ENV === "production",
    pastaDados: env.DATA_DIR ?? "./data",
    // Quantos proxies reversos (Render, nginx, balanceador) ficam na frente do servidor. O IP do cliente é lido do
    // X-Forwarded-For contando a partir da direita (o que o proxy acrescentou), nunca do começo (que o cliente forja).
    // 0 = sem proxy: usa o IP da conexão e ignora o cabeçalho.
    proxies: Math.max(0, Math.floor(numero(env.TRUST_PROXY, 1))),
    // Criptografa o certificado digital e outros segredos no banco. Obrigatória em produção.
    chaveMestra: env.MASTER_KEY ?? "",
    permitirCadastro: env.ALLOW_SIGNUP === "true",
    sessaoDias: numero(env.SESSION_DAYS, 14),
    // Sessão do aplicativo do trabalhador (renovada a cada uso)
    sessaoAppDias: numero(env.APP_SESSION_DAYS, 90),
    // Validade de cada QR Code do quiosque (segundos). O anterior ainda vale por mais um período.
    qrSegundos: numero(env.QR_SECONDS, 30),
    // Identificação do sistema nos arquivos oficiais (AFD, eSocial)
    sistema: {
      nome: "Nexor RH",
      versao: "1.0.0",
      desenvolvedorCnpj: (env.DEVELOPER_CNPJ ?? "").replace(/\D/g, ""),
    },
    limites: { tamanhoArquivo: 10 * 1024 * 1024, tentativasLogin: 8 },
    // App nativo nas lojas (página /baixar e links que abrem o app a partir do QR Code)
    apps: {
      id: env.APP_ID ?? "br.com.nexorconsultingit.ponto",
      appStore: env.APP_STORE_URL ?? "",
      googlePlay: env.PLAY_STORE_URL ?? "",
      apk: env.APK_URL ?? "",
      appleTeamId: env.APPLE_TEAM_ID ?? "",
      androidSha256: (env.ANDROID_SHA256 ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean),
    },
  };
}

export const config = lerConfig();
