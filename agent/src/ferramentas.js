/* Ferramentas que o agente pode usar. Cada uma tem:
   - definição (nome, descrição, schema) enviada ao Claude
   - validação com zod (a entrada vem do modelo e é tratada como não confiável)
   - execução */

import { createHash } from "node:crypto";
import { z } from "zod";
import { UMBRELLA } from "./campanhas.js";
import { config } from "./config.js";
import { pontuarLead } from "./qualificacao.js";

const OFFSET_BRASILIA = "-03:00";
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/* ---------- Agenda ---------- */

// Data (AAAA-MM-DD) e dia da semana em Brasília para um instante
const dataBrasilia = (instante) => {
  const local = new Date(instante.getTime() - 3 * 3600_000);
  return { iso: local.toISOString().slice(0, 10), diaSemana: local.getUTCDay() };
};

export const formatarHorario = (horario) => {
  const d = new Date(`${horario}:00${OFFSET_BRASILIA}`);
  const { iso, diaSemana } = dataBrasilia(d);
  return `${DIAS[diaSemana]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)} às ${horario.slice(11, 16)}`;
};

export function horariosLivres(agora, ocupados, agenda = config.agenda) {
  const limite = agora.getTime() + agenda.antecedenciaMinimaHoras * 3600_000;
  const livres = [];
  for (let d = 0; d <= agenda.diasAdiante; d++) {
    const { iso, diaSemana } = dataBrasilia(new Date(agora.getTime() + d * 86400_000));
    if (!agenda.diasDaSemana.includes(diaSemana)) continue;
    for (const hora of agenda.horarios) {
      const horario = `${iso}T${hora}`;
      const instante = new Date(`${horario}:00${OFFSET_BRASILIA}`).getTime();
      if (instante >= limite && !ocupados.has(horario)) livres.push(horario);
    }
  }
  return livres;
}

/* ---------- Retorno estimado ---------- */

export function calcularRetorno({ atendimentos_mes, minutos_por_atendimento, custo_hora, percentual_ia }) {
  const horasMes = (atendimentos_mes * minutos_por_atendimento) / 60;
  const horasLiberadas = horasMes * (percentual_ia / 100);
  const economiaMes = horasLiberadas * custo_hora;
  return {
    horas_gastas_por_mes: Math.round(horasMes),
    horas_liberadas_por_mes: Math.round(horasLiberadas),
    economia_por_mes_reais: Math.round(economiaMes),
    economia_por_ano_reais: Math.round(economiaMes * 12),
    equivalente_pessoas_tempo_integral: Math.round((horasLiberadas / 176) * 10) / 10,
    observacao: "Estimativa ilustrativa calculada com os números informados. O valor real é definido no diagnóstico.",
  };
}

/* ---------- Schemas ---------- */

const texto = (max) => z.string().trim().min(1).max(max);
const opcional = (max) => z.string().trim().max(max).optional();

const esquemas = {
  registrar_lead: z.object({
    nome: texto(120),
    necessidade: texto(1000),
    empresa: opcional(160),
    segmento: opcional(120),
    porte: z.enum(["pequeno", "medio", "grande", "nao_informado"]).optional(),
    telefone: opcional(40),
    email: opcional(160),
    solucao_indicada: opcional(120),
    urgencia: z.enum(["baixa", "media", "alta"]).optional(),
  }),
  ver_horarios_diagnostico: z.object({}),
  agendar_diagnostico: z.object({
    horario: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    nome: texto(120),
    contato: texto(160),
    empresa: opcional(160),
    assunto: texto(500),
  }),
  estimar_retorno: z.object({
    atendimentos_mes: z.number().positive().max(10_000_000),
    minutos_por_atendimento: z.number().positive().max(600),
    custo_hora: z.number().positive().max(10_000),
    percentual_ia: z.number().min(1).max(100),
  }),
  transferir_para_humano: z.object({
    motivo: texto(300),
    resumo: texto(1500),
  }),
  qualificar_lead: z.object({
    nome: opcional(120),
    empresa: opcional(160),
    tem_empresa: z.boolean().optional(),
    segmento: opcional(120),
    perfil: opcional(60),
    cnae: opcional(20),
    porte_numero: z.number().min(0).max(10_000_000).optional(),
    porte_unidade: opcional(60),
    porte: z.enum(["pequeno", "medio", "grande", "nao_informado"]).optional(),
    cargo: opcional(80),
    cidade: opcional(80),
    uf: opcional(2),
    dor: opcional(500),
    ferramenta_atual: opcional(160),
    urgencia: z.enum(["alta", "media", "baixa", "nao_informado"]).optional(),
    orcamento: z.enum(["sim", "nao", "nao_informado"]).optional(),
    pediu_preco: z.boolean().optional(),
    apenas_preco: z.boolean().optional(),
    pediu_demo: z.boolean().optional(),
    perguntas_respondidas: z.number().int().min(0).max(10).optional(),
    telefone: opcional(40),
    email: opcional(160),
    aceita_contato: z.boolean().optional(),
    pessoa_fisica: z.boolean().optional(),
    estudante: z.boolean().optional(),
    concorrente: z.boolean().optional(),
  }),
};

/* ---------- Definições enviadas ao Claude ---------- */

export const DEFINICOES = [
  {
    name: "registrar_lead",
    description:
      "Registra um potencial cliente no CRM da Nexor e avisa a equipe comercial. Use assim que souber o nome e a necessidade da pessoa e ela demonstrar interesse. Pode ser chamada de novo para completar dados.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome da pessoa" },
        necessidade: { type: "string", description: "O que a empresa precisa resolver, nas palavras do cliente" },
        empresa: { type: "string" },
        segmento: { type: "string", description: "Ramo da empresa, ex.: clínica, loja de roupas, distribuidora" },
        porte: { type: "string", enum: ["pequeno", "medio", "grande", "nao_informado"] },
        telefone: { type: "string", description: "WhatsApp ou telefone, se o cliente informou" },
        email: { type: "string" },
        solucao_indicada: { type: "string", description: "Solução da Nexor que mais se encaixa, ex.: Nexor Atende IA" },
        urgencia: { type: "string", enum: ["baixa", "media", "alta"] },
      },
      required: ["nome", "necessidade"],
      additionalProperties: false,
    },
  },
  {
    name: "ver_horarios_diagnostico",
    description:
      "Lista os próximos horários livres para o diagnóstico gratuito (horário de Brasília). Use antes de propor horários ao cliente.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "agendar_diagnostico",
    description:
      "Agenda o diagnóstico gratuito em um horário livre e avisa a equipe. Só use depois que o cliente escolheu o horário e você tem nome, contato e assunto.",
    input_schema: {
      type: "object",
      properties: {
        horario: { type: "string", description: "Horário exatamente como veio de ver_horarios_diagnostico, ex.: 2026-11-04T10:30" },
        nome: { type: "string" },
        contato: { type: "string", description: "WhatsApp ou e-mail para enviar o link da reunião" },
        empresa: { type: "string" },
        assunto: { type: "string", description: "Resumo do que será tratado no diagnóstico" },
      },
      required: ["horario", "nome", "contato", "assunto"],
      additionalProperties: false,
    },
  },
  {
    name: "estimar_retorno",
    description:
      "Calcula quantas horas e quanto dinheiro por mês a empresa pode economizar automatizando atendimentos ou tarefas repetitivas com IA. Use com números informados pelo cliente; se faltar algum, pergunte ou use uma suposição explícita.",
    input_schema: {
      type: "object",
      properties: {
        atendimentos_mes: { type: "number", description: "Atendimentos ou tarefas por mês" },
        minutos_por_atendimento: { type: "number", description: "Minutos gastos em cada um" },
        custo_hora: { type: "number", description: "Custo por hora da equipe, em reais" },
        percentual_ia: { type: "number", description: "Porcentagem que a IA pode assumir, de 1 a 100 (use 60 se o cliente não souber)" },
      },
      required: ["atendimentos_mes", "minutos_por_atendimento", "custo_hora", "percentual_ia"],
      additionalProperties: false,
    },
  },
  {
    name: "qualificar_lead",
    description:
      "Registra o que você já sabe sobre a pessoa para a nota do lead (0 a 100). Chame sempre que descobrir algo novo (segmento, porte, cargo, cidade, dor, urgência, orçamento, pedido de preço ou demonstração, contato). Envie só o que a pessoa disse; não invente nem chute. Os dados se somam entre as chamadas. O resultado diz a classe (quente, morno, frio) e o próximo passo. Nunca conte a nota nem a classe para o cliente.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        empresa: { type: "string", description: "Nome da empresa, se a pessoa disse" },
        tem_empresa: { type: "boolean", description: "true se a pessoa tem empresa, MEI ou atua como profissional autônomo" },
        segmento: { type: "string", description: "Ramo, nas palavras da pessoa: barbearia, clínica, escritório de contabilidade, distribuidor de material elétrico..." },
        perfil: { type: "string", description: "No Nexor Elo: fornecedor ou instalador" },
        cnae: { type: "string", description: "CNAE, só se a pessoa informou" },
        porte_numero: { type: "number", description: "Número que mede o porte, na unidade da campanha (colaboradores, barbeiros, empresas na carteira, instaladores, orçamentos por mês, computadores, mensagens por dia)" },
        porte_unidade: { type: "string", description: "Unidade do porte_numero, ex.: barbeiros" },
        porte: { type: "string", enum: ["pequeno", "medio", "grande", "nao_informado"] },
        cargo: { type: "string", description: "Cargo ou papel: dono, sócio, gerente de TI, analista, contador titular..." },
        cidade: { type: "string" },
        uf: { type: "string", description: "Sigla do estado, ex.: MG" },
        dor: { type: "string", description: "O problema que a pessoa quer resolver, em uma frase" },
        ferramenta_atual: { type: "string", description: "O que usa hoje: caderno, planilha, outro sistema" },
        urgencia: { type: "string", enum: ["alta", "media", "baixa", "nao_informado"], description: "alta = quer começar agora ou neste mês" },
        orcamento: { type: "string", enum: ["sim", "nao", "nao_informado"], description: "sim = disse que tem verba ou que o valor cabe" },
        pediu_preco: { type: "boolean" },
        apenas_preco: { type: "boolean", description: "true se a pessoa só quer saber o preço e não quer conversar" },
        pediu_demo: { type: "boolean", description: "Pediu teste, demonstração ou diagnóstico" },
        perguntas_respondidas: { type: "integer", description: "Quantas perguntas de qualificação da campanha a pessoa já respondeu" },
        telefone: { type: "string" },
        email: { type: "string" },
        aceita_contato: { type: "boolean", description: "true se a pessoa aceitou receber material ou contato da equipe (opt-in)" },
        pessoa_fisica: { type: "boolean", description: "true se é para uso pessoal, sem empresa" },
        estudante: { type: "boolean", description: "true se é estudante ou pesquisa acadêmica" },
        concorrente: { type: "boolean", description: "true se trabalha numa empresa que vende produto parecido" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "transferir_para_humano",
    description:
      "Passa o atendimento para uma pessoa da equipe Nexor e envia a ela um resumo. Use quando o cliente pedir, para clientes atuais com problemas, reclamações, negociação ou assuntos que você não resolve.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string" },
        resumo: { type: "string", description: "Resumo da conversa para a pessoa que vai continuar" },
      },
      required: ["motivo", "resumo"],
      additionalProperties: false,
    },
  },
];

/* ---------- Execução ---------- */

/**
 * @param {object} deps
 * @param {ReturnType<import('./armazenamento.js').criarArmazenamento>} deps.armazenamento
 * @param {(texto: string, dados: object) => Promise<void>} deps.notificar
 * @param {() => Date} deps.agora
 */
/* Orientação devolvida à Blue para cada próximo passo da qualificação. */
const ORIENTACAO = {
  agendar_demo: "Lead quente: a equipe já foi avisada. Ofereça a demonstração ou o diagnóstico agora (use ver_horarios_diagnostico).",
  enviar_material_preco: "A pessoa quer preço. Seja gentil: ofereça o material de preços da campanha e pergunte se pode enviar por aqui ou por e-mail. Se ela topar, marque aceita_contato. Não insista em perguntas.",
  cadencia: "Lead morno. Continue a conversa com a próxima pergunta de qualificação que falta, uma por vez. Antes de encerrar, pergunte se pode mandar um resumo por aqui ou por e-mail (opt-in).",
  conteudo: "Ainda há pouca informação. Faça a próxima pergunta de qualificação, de forma leve.",
  conteudo_educativo: "É estudante. Ajude com cordialidade, indique o conteúdo do site e não ofereça demonstração comercial.",
  encerrar_cordialmente: "Parece ser alguém do mesmo mercado. Seja educada, não passe detalhes internos nem preços e encerre com cordialidade.",
  explicar_produto_para_empresas: "É pessoa física sem empresa. Explique com gentileza que a solução é para empresas e, se fizer sentido, indique o conteúdo do site. Sem grosseria.",
};

const idDaConversa = (idConversa) => `conv-${createHash("sha256").update(idConversa).digest("hex").slice(0, 20)}`;
const semVazios = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== "nao_informado"));
const DESCARTES_SEM_EVENTO = new Set(["concorrente", "estudante", "pessoa_fisica"]);

/**
 * @param {object} deps
 * @param {ReturnType<import('./armazenamento.js').criarArmazenamento>} deps.armazenamento
 * @param {(texto: string, dados: object) => Promise<void>} deps.notificar
 * @param {() => Date} deps.agora
 * @param {(evento: string, lead: object) => Promise<unknown>} [deps.conversao] eventos Lead, LeadQualificado e AgendouDemo
 */
export function criarExecutor({ armazenamento, notificar, agora, conversao = async () => {} }) {
  /** @type {Map<string, {sinais: object, lead: object, eventos: Set<string>}>} */
  const qualificacoes = new Map();

  const emitir = (evento, lead, q) => {
    if (q.eventos.has(evento)) return;
    q.eventos.add(evento);
    Promise.resolve(conversao(evento, lead)).catch((err) => console.error(`[conversao ${evento}]`, err?.message ?? err));
  };

  const acoes = {
    async registrar_lead(dados, ctx) {
      const lead = {
        ...dados,
        telefone: dados.telefone ?? ctx.telefone,
        canal: ctx.canal,
        conversa: ctx.idConversa,
        registrado_em: agora().toISOString(),
      };
      await armazenamento.salvarLead(lead);
      await notificar(
        `🟦 Novo lead (${ctx.canal})\n${lead.nome}${lead.empresa ? ` · ${lead.empresa}` : ""}\n` +
          `Necessidade: ${lead.necessidade}\nContato: ${lead.telefone ?? lead.email ?? "não informado"}`,
        { tipo: "lead", ...lead },
      );
      return { ok: true, mensagem: "Lead registrado e equipe avisada." };
    },

    async ver_horarios_diagnostico() {
      const ocupados = new Set(
        (await armazenamento.listarAgendamentos()).filter((a) => a.status !== "cancelado").map((a) => a.horario),
      );
      const livres = horariosLivres(agora(), ocupados).slice(0, 8);
      if (!livres.length) return { horarios: [], mensagem: "Sem horários livres nos próximos dias. Ofereça transferir para a equipe." };
      return {
        fuso: "horário de Brasília",
        duracao_minutos: config.agenda.duracaoMinutos,
        horarios: livres.map((h) => ({ horario: h, descricao: formatarHorario(h) })),
      };
    },

    async agendar_diagnostico(dados, ctx) {
      // Confere se o horário existe na agenda; a ocupação é conferida na reserva
      if (!horariosLivres(agora(), new Set()).includes(dados.horario)) {
        return { ok: false, mensagem: "Horário fora da agenda disponível. Consulte ver_horarios_diagnostico de novo." };
      }
      const agendamento = {
        ...dados,
        canal: ctx.canal,
        conversa: ctx.idConversa,
        status: "agendado",
        criado_em: agora().toISOString(),
      };
      if (!(await armazenamento.reservar(agendamento))) {
        return { ok: false, mensagem: "Esse horário acabou de ser ocupado. Ofereça outro horário." };
      }
      const quando = formatarHorario(dados.horario);
      const q = qualificacoes.get(ctx.idConversa);
      if (q) {
        q.lead = { ...q.lead, agendou_demo: true, demo_em: dados.horario, registrado_em: agora().toISOString() };
        await armazenamento.salvarLead(q.lead);
        emitir("AgendouDemo", q.lead, q);
      }
      await notificar(
        `🟩 Diagnóstico agendado: ${quando}\n${dados.nome}${dados.empresa ? ` · ${dados.empresa}` : ""}\n` +
          `Contato: ${dados.contato}\nAssunto: ${dados.assunto}\nEnviar o link da reunião ao cliente.`,
        { tipo: "agendamento", ...agendamento },
      );
      return { ok: true, quando, mensagem: "Agendado. A equipe envia o link da reunião pelo contato informado." };
    },

    async estimar_retorno(dados) {
      return calcularRetorno(dados);
    },

    async qualificar_lead(dados, ctx) {
      const campanha = ctx.campanha ?? UMBRELLA;
      const anterior = qualificacoes.get(ctx.idConversa) ?? { sinais: {}, lead: null, eventos: new Set() };
      const sinais = { ...anterior.sinais, ...semVazios(dados) };
      if (!sinais.telefone && ctx.telefone) sinais.telefone = ctx.telefone;
      const r = pontuarLead(sinais, campanha);
      const lead = {
        id: idDaConversa(ctx.idConversa),
        tipo: "conversa",
        conversa: ctx.idConversa,
        canal: ctx.canal,
        campanha: campanha.id,
        campanha_via: ctx.campanhaVia,
        produto: r.produto,
        produto_indicado: r.produto_indicado,
        nome: sinais.nome,
        empresa: sinais.empresa,
        telefone: sinais.telefone,
        email: sinais.email,
        nota: r.nota,
        classe: r.classe,
        temperatura: r.classe,
        motivos: r.motivos,
        componentes: r.componentes,
        descarte: r.descarte,
        proxima_acao: r.proxima_acao,
        aceita_contato: sinais.aceita_contato === true,
        sinais,
        origem: ctx.origem ?? {},
        consentimento_medicao: ctx.consentimento === true,
        agendou_demo: anterior.lead?.agendou_demo,
        inicio_em: ctx.inicioEm,
        primeira_resposta_em: ctx.primeiraRespostaEm,
        quente_em: anterior.lead?.quente_em ?? (r.classe === "quente" ? agora().toISOString() : undefined),
        qualificado_em: anterior.lead?.qualificado_em ?? agora().toISOString(),
        registrado_em: agora().toISOString(),
      };
      const q = { sinais, lead, eventos: anterior.eventos };
      qualificacoes.set(ctx.idConversa, q);
      if (qualificacoes.size > 20_000) qualificacoes.delete(qualificacoes.keys().next().value);
      await armazenamento.salvarLead(lead);

      if ((lead.telefone || lead.email) && !DESCARTES_SEM_EVENTO.has(r.descarte)) emitir("Lead", lead, q);
      if (r.classe === "quente" && !anterior.eventos.has("LeadQualificado")) {
        emitir("LeadQualificado", lead, q);
        await notificar(
          `🔥 Lead quente · ${lead.produto} · nota ${r.nota}/100\n${lead.nome ?? "Sem nome"}${lead.empresa ? ` · ${lead.empresa}` : ""}${sinais.cargo ? ` (${sinais.cargo})` : ""}\n` +
            `Campanha: ${campanha.nome}${ctx.campanhaVia ? ` (via ${ctx.campanhaVia})` : ""}\n` +
            `Contato: ${lead.telefone ?? lead.email ?? "não informado"} · canal: ${ctx.canal}\n` +
            `Por quê: ${r.motivos.join("; ")}\n` +
            `Próximo passo: chamar agora. A Blue está oferecendo horários de demonstração.`,
          { tipo: "lead_quente", ...lead },
        );
      }
      return {
        ok: true,
        classe: r.classe,
        proxima_acao: r.proxima_acao,
        produto_indicado: r.produto_indicado,
        orientacao: ORIENTACAO[r.proxima_acao],
        perguntas_que_faltam: campanha.perguntas.filter((p) => sinais[p.sinal] === undefined).map((p) => p.texto),
      };
    },

    async transferir_para_humano(dados, ctx) {
      ctx.transferir();
      await notificar(
        `🟨 Atendimento para a equipe (${ctx.canal})\nCliente: ${ctx.telefone ?? ctx.idConversa}\n` +
          `Motivo: ${dados.motivo}\nResumo: ${dados.resumo}`,
        { tipo: "transferencia", conversa: ctx.idConversa, telefone: ctx.telefone, ...dados },
      );
      return { ok: true, mensagem: "Equipe avisada. Diga ao cliente que uma pessoa vai continuar o atendimento em breve." };
    },
  };

  /** Executa uma chamada de ferramenta e devolve o bloco tool_result. */
  return async function executar(bloco, ctx) {
    const esquema = esquemas[bloco.name];
    if (!esquema) {
      return { type: "tool_result", tool_use_id: bloco.id, is_error: true, content: `Ferramenta desconhecida: ${bloco.name}` };
    }
    const entrada = esquema.safeParse(bloco.input);
    if (!entrada.success) {
      return {
        type: "tool_result",
        tool_use_id: bloco.id,
        is_error: true,
        content: `Dados inválidos: ${entrada.error.issues.map((i) => `${i.path.join(".") || "entrada"}: ${i.message}`).join("; ")}`,
      };
    }
    try {
      const resultado = await acoes[bloco.name](entrada.data, ctx);
      return { type: "tool_result", tool_use_id: bloco.id, content: JSON.stringify(resultado) };
    } catch (err) {
      console.error(`[ferramenta ${bloco.name}]`, err);
      return { type: "tool_result", tool_use_id: bloco.id, is_error: true, content: "Falha interna ao executar. Peça desculpas e ofereça o contato humano." };
    }
  };
}
