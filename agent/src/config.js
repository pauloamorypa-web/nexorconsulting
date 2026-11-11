/* Configuração do agente Nexor Assist, lida das variáveis de ambiente (ver .env.example) */

const lista = (valor, padrao) =>
  (valor ?? padrao)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  porta: Number(process.env.PORT ?? 8787),

  // Claude
  modelo: process.env.NEXOR_MODEL ?? "claude-opus-5-5",
  // Atendimento é conversa curta: "low" responde rápido e gasta menos. Suba para "medium" se quiser respostas mais elaboradas.
  esforco: process.env.NEXOR_EFFORT ?? "low",
  maxTokens: Number(process.env.NEXOR_MAX_TOKENS ?? 16000),

  // Site que pode chamar /api/chat (CORS)
  origensPermitidas: lista(process.env.ALLOWED_ORIGINS, "https://nexorconsultingit.com.br,https://www.nexorconsultingit.com.br,https://pauloamorypa-web.github.io"),
  siteUrl: process.env.SITE_URL ?? "https://nexorconsultingit.com.br/",

  // Onde ficam leads e agendamentos
  pastaDados: process.env.DATA_DIR ?? "./data",
  // Envia cada lead e agendamento para uma planilha, CRM ou automação (n8n, Make, Zapier, Google Apps Script)
  webhookLeads: process.env.LEAD_WEBHOOK_URL ?? "",

  // Relatório de campanhas (GET /api/relatorio). Sem token, o relatório fica desligado.
  tokenRelatorio: process.env.REPORT_TOKEN ?? "",
  // Conversão offline vinda da Nexor Central (POST /api/conversao): teste ativado e contrato fechado.
  // Sem CONVERSAO_TOKEN, usa o REPORT_TOKEN (o mesmo valor vai em CONVERSAO_TOKEN da Central).
  tokenConversao: process.env.CONVERSAO_TOKEN || process.env.REPORT_TOKEN || "",

  // API de Conversões da Meta: devolve os leads (e os leads quentes) para a Meta otimizar os anúncios
  meta: {
    pixel: process.env.META_PIXEL_ID ?? "",
    token: process.env.META_CAPI_TOKEN ?? "",
    versaoGraph: process.env.META_GRAPH_VERSION ?? "v23.0",
    // Código de teste do Gerenciador de Eventos (aba "Testar eventos"). Apague depois de testar.
    codigoTeste: process.env.META_TEST_EVENT_CODE ?? "",
    // Conta do WhatsApp Business: necessária para eventos de conversas vindas de anúncio de clique para o WhatsApp
    wabaId: process.env.META_WABA_ID ?? "",
  },

  // Conversas do WhatsApp vindas de anúncio (clique para o WhatsApp) também viram eventos na Meta.
  // Desligado por padrão: ligue só depois de prever isso na política de privacidade (LGPD).
  metaWhatsapp: process.env.META_CAPI_WHATSAPP === "1",

  // Google Ads: o servidor não fala com a API do Google. Ele prepara as linhas de conversão offline
  // (com gclid) e manda para LEAD_WEBHOOK_URL, para importar por planilha, n8n ou Zapier.
  google: {
    conversaoLead: process.env.GOOGLE_CONVERSAO_LEAD ?? "Lead",
    conversaoQualificado: process.env.GOOGLE_CONVERSAO_QUALIFICADO ?? "LeadQualificado",
    conversaoDemo: process.env.GOOGLE_CONVERSAO_DEMO ?? "AgendouDemo",
    conversaoTeste: process.env.GOOGLE_CONVERSAO_TESTE ?? "TesteAtivado",
    conversaoContrato: process.env.GOOGLE_CONVERSAO_CONTRATO ?? "Contrato",
  },

  // Campanhas: a Blue pode citar o preço de entrada do produto (tabela comercial em validação)
  campanhaMostrarPreco: process.env.CAMPANHA_MOSTRAR_PRECO === "1",

  // WhatsApp Cloud API (Meta)
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? "",
    idNumero: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    tokenVerificacao: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    segredoApp: process.env.WHATSAPP_APP_SECRET ?? "",
    versaoGraph: process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0",
    // Número da equipe que recebe os avisos de lead, agendamento e transferência (só dígitos, com DDI)
    numeroEquipe: process.env.TEAM_WHATSAPP ?? "",
  },

  // Agenda do diagnóstico gratuito (horário de Brasília, UTC-3)
  agenda: {
    diasDaSemana: [1, 2, 3, 4, 5], // segunda a sexta
    horarios: lista(process.env.AGENDA_HORARIOS, "09:00,10:30,14:00,15:30,17:00"),
    diasAdiante: Number(process.env.AGENDA_DIAS_ADIANTE ?? 10),
    antecedenciaMinimaHoras: Number(process.env.AGENDA_ANTECEDENCIA_HORAS ?? 3),
    duracaoMinutos: Number(process.env.AGENDA_DURACAO_MIN ?? 30),
  },

  // Proteções
  limiteMensagens: { quantidade: 20, janelaMinutos: 10 },
  tamanhoMaximoMensagem: 2000,
  conversaExpiraHoras: 24,
  conversaMaxMensagens: 80,
  pausaAposTransferenciaHoras: 12,
};
