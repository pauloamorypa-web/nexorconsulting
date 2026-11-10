/* Configuração do Nexor RH, lida das variáveis de ambiente (ver .env.example). */

import { configNexor } from "./nexor/central.js";

const numero = (v, padrao) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : padrao;
};

export function lerConfig(env = process.env) {
  // Modo Demonstração (DEMO=1): dados fictícios, só em 127.0.0.1, nenhuma chamada externa (ver src/demo/ e DEMO.md)
  const demo = env.DEMO === "1" || env.DEMO === "true";
  return {
    demo,
    demoPublico: demo && env.DEMO_PUBLICO === "1",
    demoReset: demo && env.DEMO_RESET === "1",
    demoIaReal: demo && env.DEMO_IA_REAL === "1" && Boolean(env.ANTHROPIC_API_KEY),
    porta: numero(env.PORT, 8791),
    urlPublica: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
    producao: env.NODE_ENV === "production",
    pastaDados: env.DATA_DIR ?? (demo ? "./data-demo" : "./data"),
    // Quantos proxies reversos (Render, nginx, balanceador) ficam na frente do servidor. O IP do cliente é lido do
    // X-Forwarded-For contando a partir da direita (o que o proxy acrescentou), nunca do começo (que o cliente forja).
    // 0 = sem proxy: usa o IP da conexão e ignora o cabeçalho.
    proxies: Math.max(0, Math.floor(numero(env.TRUST_PROXY, 1))),
    // Criptografa o certificado digital e outros segredos no banco. Obrigatória em produção.
    chaveMestra: env.MASTER_KEY || (demo ? "nexor-rh-demonstracao-chave-fixa-nao-use-em-producao" : ""),
    permitirCadastro: env.ALLOW_SIGNUP === "true",
    // Código pedido na criação da primeira conta (instalação nova). Em produção, se ficar vazio,
    // o servidor gera um e grava em DATA_DIR/codigo-instalacao.txt: só quem tem acesso ao servidor cria o administrador.
    codigoInstalacao: env.INSTALL_CODE ?? "",
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
    // Nexor Central: licença (situação do contrato), saúde da instalação, acesso de suporte e vinculação pelo código
    nexor: configNexor(env),
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
