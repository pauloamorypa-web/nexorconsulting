/* Configuração do Nexor Elo, lida das variáveis de ambiente (ver .env.exemplo).
   O Elo é hospedado pela Nexor (multi-inquilino): vários fornecedores e instaladores na mesma instalação.
   O que cada conta configura sozinha (walletId, token da Focus NFe, chave do Asaas do instalador) fica cifrado no banco. */

const numero = (v, padrao) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : padrao;
};

export function lerConfig(env = process.env) {
  const demo = env.DEMO === "1";
  const producao = env.NODE_ENV === "production";
  const cfg = {
    porta: numero(env.PORT, 8796),
    urlPublica: (env.PUBLIC_URL ?? "").replace(/\/$/, ""),
    producao,
    pastaDados: env.DATA_DIR ?? "./data",
    // Proxies confiáveis na frente (Cloudflare Tunnel, Caddy). 0 = ignora o X-Forwarded-For (padrão seguro).
    proxies: Math.max(0, Math.floor(numero(env.TRUST_PROXY, 0))),
    // Cifra walletIds, tokens e chaves guardados no banco (AES-256-GCM). Obrigatória em produção.
    chaveMestra: env.MASTER_KEY ?? "",
    // Código para criar o primeiro operador Nexor (em produção, gerado em <DATA_DIR>/codigo-instalacao.txt)
    codigoInstalacao: env.INSTALL_CODE ?? "",
    sessaoDias: numero(env.SESSION_DAYS, 7),
    limites: { tentativasLogin: 8, tokensPublicos: 40 },
    // Taxa da plataforma (Nexor) sobre o valor da proposta paga, em pontos-base (250 = 2,5%). Sai no split.
    taxaPlataformaBps: Math.max(0, Math.floor(numero(env.TAXA_PLATAFORMA_BPS, 250))),
    asaas: {
      url: env.ASAAS_AMBIENTE === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3",
      // Chave da conta Asaas da plataforma (cria as cobranças com split). Também pode ser salva cifrada pelo operador Nexor.
      chave: env.ASAAS_API_KEY ?? "",
      walletNexor: env.NEXOR_WALLET_ID ?? "",
      vencimentoDias: 3,
    },
    cnpj: { url: (env.CNPJ_API_URL ?? "https://brasilapi.com.br/api/cnpj/v1").replace(/\/$/, ""), cacheDias: numero(env.CNPJ_CACHE_DIAS, 30) },
    fiscal: { url: env.FOCUS_AMBIENTE === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br" },
    whatsapp: { versaoGraph: env.META_GRAPH_VERSION ?? "v23.0", idNumero: env.WHATSAPP_PHONE_ID ?? "", token: env.WHATSAPP_TOKEN ?? "" },
    email: { url: env.EMAIL_API_URL ?? "https://api.resend.com/emails", chave: env.EMAIL_API_KEY ?? "", de: env.EMAIL_DE ?? "Nexor Elo <elo@nexorconsulting.com.br>" },
    uploads: { fotoMaxBytes: numero(env.FOTO_MAX_KB, 600) * 1024, assinaturaMaxBytes: 200 * 1024, fotosPorOs: 30 },
    rotinaMin: numero(env.ROTINA_MINUTOS, 5),
    sistema: { nome: "Nexor Elo", versao: "1.0.0" },
    demo,
    demoPublico: demo && env.DEMO_PUBLICO === "1",
    demoReiniciar: demo && env.DEMO_RESET === "1",
  };
  // Fora de produção (desenvolvimento, testes), a nota fiscal é simulada quando não há token configurado
  cfg.fiscal.simularSemToken = !producao;
  if (!demo) return cfg;
  return {
    ...cfg,
    producao: false,
    pastaDados: env.DATA_DIR ?? "./data-demo",
    chaveMestra: env.MASTER_KEY || "chave-mestra-da-demonstracao-nexor-elo",
    codigoInstalacao: "",
    urlPublica: cfg.urlPublica || `http://localhost:${cfg.porta}`,
    asaas: { ...cfg.asaas, chave: "demo-asaas-plataforma", walletNexor: "wallet-demo-nexor" },
    whatsapp: { ...cfg.whatsapp, idNumero: "demo", token: "demo" },
    email: { ...cfg.email, chave: "demo" },
    fiscal: { ...cfg.fiscal, simularSemToken: true },
    rotinaMin: 2,
  };
}

export const config = lerConfig();
