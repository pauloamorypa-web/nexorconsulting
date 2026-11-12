/* Configuração do Nexor Guardião, lida das variáveis de ambiente (ver .env.example).
   Hospedado pela Nexor (multi-inquilino): várias revendas e contas na mesma instalação. */

const numero = (v, padrao) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : padrao;
};

export function lerConfig(env = process.env) {
  const demo = env.DEMO === "1";
  const producao = env.NODE_ENV === "production";
  const cfg = {
    porta: numero(env.PORT, 8798),
    urlPublica: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
    producao,
    pastaDados: env.DATA_DIR ?? "./data",
    // Proxies confiáveis na frente (Cloudflare Tunnel, Caddy). 0 = ignora o X-Forwarded-For (padrão seguro).
    proxies: Math.max(0, Math.floor(numero(env.TRUST_PROXY, 0))),
    // Só vale com TRUST_PROXY > 0: cabeçalho em que o proxy informa o país do visitante (Cloudflare: cf-ipcountry)
    cabecalhoPais: (env.COUNTRY_HEADER ?? "cf-ipcountry").toLowerCase(),
    // Chave-mestra do envelope (fora do banco). Obrigatória em produção. A anterior só é usada pelo script de troca.
    chaveMestra: env.GUARDIAO_MASTER_KEY ?? "",
    codigoInstalacao: env.INSTALL_CODE ?? "",
    sessaoDias: numero(env.SESSION_DAYS, 7),
    limites: { tentativasLogin: 8, tokensPublicos: 40, pareamento: 10, trechosPorMinuto: numero(env.PONTE_TRECHOS_MINUTO, 600) },
    armazenamento: {
      driver: env.STORAGE_DRIVER === "s3" ? "s3" : "disco",
      s3: { endpoint: env.S3_ENDPOINT ?? "", regiao: env.S3_REGION ?? "us-east-1", bucket: env.S3_BUCKET ?? "", chaveAcesso: env.S3_ACCESS_KEY ?? "", chaveSecreta: env.S3_SECRET_KEY ?? "", prefixo: env.S3_PREFIX ?? "" },
    },
    trecho: { maxBytes: numero(env.TRECHO_MAX_MB, 64) * 1024 * 1024, minSegundos: 1, maxSegundos: 120, folgaFuturoMs: 5 * 60_000 },
    pareamentoMin: 15,
    // Reduzir o plano: o excedente só é apagado depois deste aviso (horas), e só se o gestor confirmou
    reducaoAvisoHoras: numero(env.REDUCAO_AVISO_HORAS, 24),
    // Inadimplência: bloqueia ver; a conta só pode ser encerrada (apagada) depois da carência
    carenciaDias: numero(env.CARENCIA_DIAS, 30),
    suporte: { maxHoras: 72, padraoHoras: 4 },
    compartilhamento: { minHoras: 1, maxHoras: 30 * 24, sessaoHoras: 2 },
    exportacao: { maxHoras: numero(env.EXPORTACAO_MAX_HORAS, 6), ffmpeg: env.FFMPEG_PATH ?? "ffmpeg", laudosInclusos: 5 },
    saude: { ponteForaMin: numero(env.PONTE_FORA_MINUTOS, 5), atrasoFilaS: numero(env.ATRASO_FILA_SEGUNDOS, 600), tudoCaiuJanelaMin: 3, visualizacaoOciosaMin: 5 },
    // Alertas: POST JSON { canal: "email"|"whatsapp", para, texto } no webhook (sem configurar, fica "sem_canal")
    alertas: { webhookUrl: env.ALERTAS_WEBHOOK_URL ?? "", webhookToken: env.ALERTAS_WEBHOOK_TOKEN ?? "" },
    // Nexor Central avisa a situação de cobrança (em dia / inadimplente) com este token
    centralToken: env.CENTRAL_TOKEN ?? "",
    rotinaMin: numero(env.ROTINA_MINUTOS, 5),
    cadeiaHoras: numero(env.CADEIA_HORAS, 24),
    sistema: { nome: "Nexor Guardião", versao: "1.0.0" },
    demo,
    demoPublico: demo && env.DEMO_PUBLICO === "1",
    demoReiniciar: demo && env.DEMO_RESET === "1",
    demoAoVivo: demo && env.DEMO_AO_VIVO !== "0",
  };
  if (!demo) return cfg;
  return {
    ...cfg,
    producao: false,
    pastaDados: env.DATA_DIR ?? "./data-demo",
    chaveMestra: env.GUARDIAO_MASTER_KEY || "chave-mestra-da-demonstracao-nexor-guardiao",
    codigoInstalacao: "",
    urlPublica: cfg.urlPublica || `http://localhost:${cfg.porta}`,
    armazenamento: { ...cfg.armazenamento, driver: "disco" },
    alertas: { webhookUrl: "http://alertas.demo/webhook", webhookToken: "demo" },
    centralToken: "",
    rotinaMin: 2,
  };
}

export const config = lerConfig();
