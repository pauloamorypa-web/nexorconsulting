/* Ferramentas que o agente pode usar. Cada uma tem:
   - definição (nome, descrição, schema) enviada ao Claude
   - validação com zod (a entrada vem do modelo e é tratada como não confiável)
   - execução */

import { z } from "zod";
import { config } from "./config.js";

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
export function criarExecutor({ armazenamento, notificar, agora }) {
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
