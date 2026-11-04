/* Motor de horários: quais horários um barbeiro tem livres para um serviço num dia.
   Funções puras (sem banco), usadas pelo app do cliente, pelo painel e pela lista de espera. */

import { diaSemana, hhmm, minutos, paraMs } from "./datas.js";

/** Expediente padrão: terça a sábado, 9h às 19h, com almoço; segunda e domingo fechado */
export const HORARIO_PADRAO = {
  0: [],
  1: [],
  2: [["09:00", "12:00"], ["13:00", "19:00"]],
  3: [["09:00", "12:00"], ["13:00", "19:00"]],
  4: [["09:00", "12:00"], ["13:00", "19:00"]],
  5: [["09:00", "12:00"], ["13:00", "20:00"]],
  6: [["08:00", "12:00"], ["13:00", "17:00"]],
};

export const REGRAS_PADRAO = {
  passo_min: 15, // de quanto em quanto tempo o cliente vê horários
  antecedencia_min: 30, // agendar com pelo menos X minutos de antecedência
  janela_dias: 30, // até quantos dias à frente
  cancelamento_horas: 2, // o cliente cancela ou remarca sozinho até X horas antes
  lembrete_horas: 3, // lembrete antes do horário
  tolerancia_min: 15, // depois disso, o painel sugere marcar falta
};

/** Status que ocupam a agenda */
export const OCUPA = new Set(["agendado", "chegou", "em_atendimento", "concluido"]);

/** Expediente do barbeiro naquele dia: o dele, se tiver, senão o da barbearia */
export function expediente(barbearia, barbeiro, dia) {
  const tabela = barbeiro?.horario && Object.keys(barbeiro.horario).length ? barbeiro.horario : (barbearia.config.horario ?? HORARIO_PADRAO);
  const excecao = barbearia.config.excecoes?.[dia]; // feriado ou horário especial: [] fecha o dia
  return excecao ?? tabela[diaSemana(dia)] ?? [];
}

export const faz = (barbeiro, servicoId) => !barbeiro.servicos?.length || barbeiro.servicos.includes(servicoId);
const sobrepoe = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

/**
 * Horários livres ("HH:MM") de um barbeiro para um serviço num dia.
 * ocupados: [{inicio, fim}] em ms (agendamentos que ocupam + bloqueios do barbeiro ou da barbearia).
 */
export function horariosLivres({ barbearia, barbeiro, servico, dia, ocupados, agora }) {
  if (!barbeiro.ativo || !servico.ativo || !faz(barbeiro, servico.id)) return [];
  const r = { ...REGRAS_PADRAO, ...barbearia.config.regras };
  const limite = agora + r.antecedencia_min * 60_000;
  if (paraMs(dia, "23:59") > agora + (r.janela_dias + 1) * 86400_000) return [];
  const livres = [];
  for (const [de, ate] of expediente(barbearia, barbeiro, dia)) {
    const fimTurno = minutos(ate);
    for (let m = minutos(de); m + servico.duracao_min <= fimTurno; m += r.passo_min) {
      const ini = paraMs(dia, hhmm(m));
      const fim = ini + servico.duracao_min * 60_000;
      if (ini < limite) continue;
      if (ocupados.some((o) => sobrepoe(ini, fim, o.inicio, o.fim))) continue;
      livres.push(hhmm(m));
    }
  }
  return livres;
}

/** O horário pedido cabe? (confere de novo dentro da transação antes de gravar) */
export function cabe({ barbearia, barbeiro, servico, dia, hora, ocupados, agora, encaixe = false }) {
  const ini = paraMs(dia, hora);
  const fim = ini + servico.duracao_min * 60_000;
  if (ocupados.some((o) => sobrepoe(ini, fim, o.inicio, o.fim))) return { ok: false, motivo: "Esse horário acabou de ser ocupado. Escolha outro." };
  if (encaixe) return { ok: true, inicio: ini, fim };
  if (!horariosLivres({ barbearia, barbeiro, servico, dia, ocupados, agora }).includes(hora)) return { ok: false, motivo: "Horário fora do expediente ou da antecedência mínima." };
  return { ok: true, inicio: ini, fim };
}

/** Taxa de ocupação de um dia: minutos agendados / minutos de expediente */
export function ocupacao(barbearia, barbeiros, dia, agendamentos) {
  let total = 0;
  for (const b of barbeiros.filter((x) => x.ativo)) for (const [de, ate] of expediente(barbearia, b, dia)) total += minutos(ate) - minutos(de);
  const usado = agendamentos.filter((a) => OCUPA.has(a.status)).reduce((s, a) => s + (a.fim - a.inicio) / 60_000, 0);
  return total ? Math.min(1, usado / total) : 0;
}
