/* Clube de assinatura: o que o plano cobre, ciclo mensal e o "horário de sempre" do cliente. */

import { diaSemana, diasEntre, horaBR, hojeBR, somarDias, somarMeses } from "./datas.js";

/** Ciclo que começa num dia: vale até a véspera do mesmo dia do mês seguinte */
export const cicloDe = (inicio) => ({ ciclo_inicio: inicio, ciclo_fim: somarDias(somarMeses(inicio, 1), -1) });

/** Último dia já pago (assinaturas de antes da coluna pago_ate: o fim do ciclo) */
export const pagoAte = (a) => a?.pago_ate ?? a?.ciclo_fim ?? null;

/**
 * A assinatura dá direito a usar o clube neste dia? Vale pelo período pago (pago_ate), não só pelo ciclo atual:
 * quem paga a renovação antes do fim do ciclo continua coberto no resto do mês já pago.
 */
export const assinaturaValida = (a, dia) => Boolean(a && a.status === "ativa" && a.ciclo_inicio && dia <= pagoAte(a));

/** Ciclo mensal que contém o dia, contando a partir do ciclo guardado (para frente) */
export function cicloNoDia(a, dia) {
  if (!a?.ciclo_inicio) return null;
  let c = { ciclo_inicio: a.ciclo_inicio, ciclo_fim: a.ciclo_fim };
  for (let i = 0; c.ciclo_fim < dia && i < 240; i++) c = cicloDe(somarDias(c.ciclo_fim, 1));
  return c;
}

/**
 * O plano cobre este serviço neste dia?
 * usos: quantas vezes o serviço já foi usado no ciclo atual.
 */
export function cobertura(plano, assinatura, servicoId, dia, usos) {
  if (!assinaturaValida(assinatura, dia)) return { coberto: false, motivo: assinatura?.status === "atrasada" ? "Assinatura com pagamento em atraso." : null };
  const item = (plano.itens ?? []).find((i) => i.servico_id === servicoId);
  if (!item) return { coberto: false, motivo: null };
  if (plano.dias_semana?.length && !plano.dias_semana.includes(diaSemana(dia))) return { coberto: false, motivo: "Seu plano não cobre este dia da semana." };
  if (item.quantidade > 0 && usos >= item.quantidade) return { coberto: false, motivo: `Você já usou os ${item.quantidade} deste serviço no ciclo.` };
  return { coberto: true, restante: item.quantidade > 0 ? item.quantidade - usos - 1 : null };
}

/**
 * Ciclo de retorno do cliente: média dos intervalos entre as últimas visitas (mínimo 2 visitas).
 * Fica entre 7 e 90 dias. Sem histórico suficiente: null.
 */
export function cicloDeRetorno(diasDasVisitas) {
  const d = [...new Set(diasDasVisitas)].sort().slice(-6);
  if (d.length < 2) return null;
  const intervalos = d.slice(1).map((x, i) => diasEntre(d[i], x)).filter((n) => n > 0);
  if (!intervalos.length) return null;
  return Math.max(7, Math.min(90, Math.round(intervalos.reduce((s, n) => s + n, 0) / intervalos.length)));
}

/**
 * "O de sempre": o último barbeiro e serviço do cliente, mais o dia da semana e a hora mais frequentes.
 * historico: agendamentos concluídos (mais recentes primeiro) com barbeiro_id, servico_id, inicio.
 */
export function deSempre(historico) {
  if (!historico.length) return null;
  const ultimo = historico[0];
  const conta = new Map();
  for (const a of historico.slice(0, 10)) {
    const chave = `${diaSemana(hojeBR(a.inicio))}|${horaBR(a.inicio)}`;
    conta.set(chave, (conta.get(chave) ?? 0) + 1);
  }
  const [chave] = [...conta].sort((a, b) => b[1] - a[1])[0];
  const [dia, hora] = chave.split("|");
  return { barbeiro_id: ultimo.barbeiro_id, servico_id: ultimo.servico_id, dia_semana: Number(dia), hora };
}

/** Próximos dias (a partir de amanhã, ou hoje) que caem no dia da semana preferido */
export function proximosDias(hoje, diaPreferido, quantos = 3, janela = 30) {
  const r = [];
  for (let i = 0; i <= janela && r.length < quantos; i++) {
    const d = somarDias(hoje, i);
    if (diaPreferido === null || diaSemana(d) === diaPreferido) r.push(d);
  }
  return r;
}
