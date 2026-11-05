/* Catálogo comercial da Nexor: planos e preços, teste grátis de 30 dias, programa de fundadores e comissões.
   É a fonte única desses valores: o painel da Central, a contratação, as faturas de implantação e as comissões
   leem daqui. A explicação para a equipe está em comercial/PLANOS-E-PRECOS.md (mantenha os dois iguais).
   Valores em centavos. Consumo de IA (Anthropic), mensagens pagas da Meta, SMS e nuvem são pagos direto pelo cliente. */

const R = (reais) => Math.round(reais * 100);

/** Planos por produto. por_unidade: preço por colaborador, máquina etc., com mínimo mensal. */
export const PLANOS = {
  rh: {
    unidade: "colaborador",
    planos: [
      { id: "rh-ponto", nome: "Ponto", por_unidade: R(9.9), minimo: R(149), implantacao: R(990), inclui: "Ponto pelo app (digital, rosto, QR Code e GPS), quiosque, espelho, banco de horas, AFD e AEJ" },
      { id: "rh-completo", nome: "RH Completo", por_unidade: R(19.9), minimo: R(299), implantacao: R(1990), inclui: "Tudo do Ponto + folha, férias, 13º, rescisão, holerite no app, eSocial e recrutamento" },
    ],
  },
  atende: {
    planos: [
      { id: "atende-essencial", nome: "Essencial", mensal: R(497), implantacao: R(1500), inclui: "1 número de WhatsApp, até 1.500 conversas por mês, agenda e funil" },
      { id: "atende-profissional", nome: "Profissional", mensal: R(997), implantacao: R(3000), inclui: "Até 4.000 conversas por mês, campanhas, Instagram e chat do site, 5 usuários" },
      { id: "atende-avancado", nome: "Avançado", mensal: R(1997), implantacao: R(5000), inclui: "Até 10.000 conversas por mês, integração com ERP e CRM, usuários ilimitados" },
    ],
  },
  contabil: {
    planos: [
      { id: "contabil-autonomo", nome: "Autônomo", mensal: R(397), implantacao: R(1500), inclui: "Até 40 empresas na carteira" },
      { id: "contabil-escritorio", nome: "Escritório", mensal: R(997), implantacao: R(3000), inclui: "Até 150 empresas na carteira" },
      { id: "contabil-profissional", nome: "Profissional", mensal: R(1997), implantacao: R(6000), inclui: "Até 400 empresas na carteira" },
    ],
  },
  barber: {
    planos: [
      { id: "barber-solo", nome: "Solo", mensal: R(89), implantacao: R(390), inclui: "1 barbeiro, app do cliente, agenda, produtos e caixa" },
      { id: "barber-barbearia", nome: "Barbearia", mensal: R(189), implantacao: R(690), inclui: "Até 5 barbeiros, clube de assinatura, comissões e lista de espera" },
      { id: "barber-premium", nome: "Premium", mensal: R(349), implantacao: R(1290), inclui: "Até 12 barbeiros, relatórios completos e suporte prioritário" },
    ],
  },
  agente: {
    planos: [
      { id: "agente-essencial", nome: "Essencial", mensal: R(497), implantacao: R(2500), inclui: "1 dono, até 2 sistemas conectados" },
      { id: "agente-profissional", nome: "Profissional", mensal: R(997), implantacao: R(5000), inclui: "Até 3 pessoas, até 5 sistemas conectados" },
      { id: "agente-empresarial", nome: "Empresarial", mensal: R(1997), implantacao: R(8000), inclui: "Equipe e sistemas sem limite, conectores sob medida" },
    ],
  },
  one: {
    planos: [{ id: "one-sob-consulta", nome: "Sob consulta", mensal: 0, implantacao: 0, inclui: "Montado por segmento, com proposta própria" }],
  },
};

/** Serviços e produtos por projeto (referência para propostas; não entram na contratação automática) */
export const PROJETOS = [
  { nome: "Nexor Service Desk", preco: "R$ 299/mês até 5 técnicos (+ R$ 49 por técnico)", implantacao: "R$ 990" },
  { nome: "Nexor Cofre", preco: "R$ 199/mês até 20 usuários (+ R$ 7 por usuário)", implantacao: "R$ 690" },
  { nome: "Nexor IT Platform", preco: "R$ 9,90 por máquina (mínimo R$ 299/mês)", implantacao: "R$ 1.490" },
  { nome: "Nexor Site Pro", preco: "R$ 149/mês (hospedagem, ajustes e segurança)", implantacao: "R$ 2.900 a R$ 6.900 por projeto" },
  { nome: "Nexor Commerce", preco: "a partir de R$ 497/mês", implantacao: "a partir de R$ 7.900" },
  { nome: "Nexor Gestão (ERP e CRM)", preco: "a partir de R$ 990/mês", implantacao: "a partir de R$ 14.900" },
  { nome: "Nexor Automação", preco: "R$ 297/mês por automação", implantacao: "a partir de R$ 3.500 por processo" },
  { nome: "Consultoria de LGPD", preco: "projeto fechado", implantacao: "a partir de R$ 3.900" },
];

/** Desenvolvimento sob demanda */
export const SOB_DEMANDA = {
  hora_avulsa: R(190),
  pacotes: [
    { horas: 20, valor: R(3400) },
    { horas: 40, valor: R(6400) },
    { horas: 80, valor: R(12000) },
  ],
  hora_projeto: R(170),
  evolucao_mensal: { horas: 10, valor: R(1600) },
  pagamento_projeto: "40% na aprovação, 30% na homologação e 30% na entrega",
  garantia_dias: 90,
};

/** Desconto do pagamento anual: paga 10 mensalidades e usa 12 */
export const ANUAL = { meses_pagos: 10, meses_uso: 12 };

/** Teste grátis: 30 dias com funções limitadas; depois, só com o plano contratado.
    limites: contagens que o sistema já envia à Central (saúde), e o sistema recusa criar além delas.
    travados: módulos do catálogo de cada sistema (src/nexor/politica.js) indisponíveis no teste. */
export const TESTE = {
  dias: 30,
  dados_guardados_dias: 60,
  produtos: {
    rh: { limites: { colaboradores: 10 }, travados: ["modulo.esocial", "modulo.recrutamento"], resumo: "até 10 colaboradores, sem eSocial e recrutamento" },
    atende: { limites: { conversas_hoje: 30 }, travados: ["modulo.campanhas"], resumo: "até 30 conversas com a IA por dia, sem campanhas" },
    contabil: { limites: { carteira: 5, documentos_mes: 100 }, travados: [], resumo: "até 5 empresas na carteira e 100 documentos no mês" },
    barber: { limites: { barbeiros: 2, agendamentos_mes: 150 }, travados: ["modulo.relatorios"], resumo: "até 2 barbeiros e 150 agendamentos no mês, sem relatórios" },
    agente: { limites: { acoes_dia: 10 }, travados: [], resumo: "até 10 ações aprovadas por dia" },
    one: { limites: {}, travados: [], resumo: "sob consulta" },
  },
};

/** Programa de fundadores: os primeiros clientes de alguns produtos, com desconto em troca de feedback e depoimento */
export const FUNDADORES = {
  produtos: ["contabil", "barber", "agente"],
  vagas: 10,
  desconto_mensal: 40, // %
  meses: 12,
  desconto_implantacao: 50, // %
  preco_travado_meses: 24,
  contrapartidas: ["depoimento em vídeo ou texto", "estudo de caso com os números do sistema", "uma conversa de feedback por mês nos 3 primeiros meses", "contrato mínimo de 12 meses"],
};

/** Comissões. Base: o valor efetivamente recebido (com desconto), sem consumo de IA, Meta, SMS ou nuvem.
    primeira: % da 1ª mensalidade paga · recorrente: % das mensalidades seguintes por `meses` (0 = enquanto ativo)
    implantacao: % da fatura de implantação · sob_medida: % de projetos e horas. */
export const COMISSOES = {
  vendedor: { nome: "Vendedor interno (com fixo)", primeira: 50, recorrente: 5, meses: 12, implantacao: 5, sob_medida: 3 },
  representante: { nome: "Representante comercial (sem fixo)", primeira: 100, recorrente: 10, meses: 12, implantacao: 10, sob_medida: 5 },
  indicador: { nome: "Parceiro indicador", primeira: 0, recorrente: 10, meses: 0, implantacao: 5, sob_medida: 3, requisito: "indica e a Nexor vende" },
  revenda: { nome: "Parceiro revenda", primeira: 0, recorrente: 20, meses: 0, implantacao: 10, sob_medida: 5, requisito: "vende e faz o 1º atendimento; a partir de 5 clientes ativos" },
  estrategico: { nome: "Parceiro estratégico", primeira: 0, recorrente: 30, meses: 0, implantacao: 15, sob_medida: 5, requisito: "revende, faz suporte nível 1; a partir de 15 clientes ativos" },
};
/** Regras gerais das comissões */
export const REGRAS_COMISSAO = { carencia_dias: 30, estorno_cancelamento_dias: 90 };

export const TIPOS_PARCEIRO = Object.keys(COMISSOES);

export function planoPorId(id) {
  for (const [produto, p] of Object.entries(PLANOS)) {
    const plano = p.planos.find((x) => x.id === id);
    if (plano) return { produto, unidade: p.unidade ?? null, ...plano };
  }
  return null;
}

/** Mensalidade cheia do plano (para os planos por unidade, usa a quantidade com o mínimo) */
export function mensalidadeDe(plano, quantidade = 0) {
  if (plano.por_unidade) return Math.max(plano.minimo ?? 0, Math.round(plano.por_unidade * Math.max(0, quantidade)));
  return plano.mensal;
}

export const comDesconto = (centavos, pct) => Math.round(centavos * (1 - (pct || 0) / 100));
