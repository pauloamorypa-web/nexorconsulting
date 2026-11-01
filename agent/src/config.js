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

  // API de Conversões da Meta: devolve os leads (e os leads quentes) para a Meta otimizar os anúncios
  meta: {
    pixel: process.env.META_PIXEL_ID ?? "",
    token: process.env.META_CAPI_TOKEN ?? "",
    versaoGraph: process.env.META_GRAPH_VERSION ?? "v23.0",
    // Código de teste do Gerenciador de Eventos (aba "Testar eventos"). Apague depois de testar.
    codigoTeste: process.env.META_TEST_EVENT_CODE ?? "",
  },

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
