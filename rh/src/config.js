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
  };
}

export const config = lerConfig();
