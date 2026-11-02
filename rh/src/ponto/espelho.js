/* Espelho de ponto: transforma as marcações do mês em horas trabalhadas, extras, adicional noturno,
   atrasos e faltas, de acordo com a jornada do colaborador (CLT art. 58 §1º: tolerância de até 5 minutos
   por marcação, limitada a 10 minutos diários; hora noturna reduzida de 52min30s entre 22h e 5h). */

import { dataLocal, diasDaCompetencia, diasEntre, diaSemana, horaLocal, instante, minutos, somarDias } from "./calendario.js";

const NOITE_INICIO = 22 * 60;
const NOITE_FIM = 5 * 60;

/** O que a jornada prevê para uma data: null = folga */
export function previstoNoDia(jornada, data) {
  if (!jornada) return null;
  if (jornada.tipo === "escala") {
    const e = jornada.escala ?? {};
    const ciclo = (e.trabalha ?? 1) + (e.folga ?? 1);
    const pos = ((diasEntre(e.inicio ?? data, data) % ciclo) + ciclo) % ciclo;
    if (pos >= (e.trabalha ?? 1)) return null;
    return { entrada: e.entrada, saida: e.saida, intervalo_min: e.intervalo_min ?? 60 };
  }
  const d = jornada.dias?.[diaSemana(data)];
  return d?.entrada && d?.saida ? d : null;
}

export function minutosPrevistos(p) {
  if (!p) return 0;
  let fim = minutos(p.saida);
  const ini = minutos(p.entrada);
  if (fim <= ini) fim += 24 * 60; // jornada que passa da meia-noite
  return Math.max(0, fim - ini - (p.intervalo_min ?? 0));
}

/** Minutos noturnos (22h às 5h) entre dois instantes */
export function minutosNoturnos(de, ate) {
  let total = 0;
  for (let t = de; t < ate; t += 60_000) {
    const m = minutos(horaLocal(t));
    if (m >= NOITE_INICIO || m < NOITE_FIM) total++;
  }
  return total;
}

/**
 * Calcula o espelho de um colaborador numa competência (AAAA-MM).
 * @param {object} p
 * @param {object} p.colaborador
 * @param {object|null} p.jornada
 * @param {Array} p.marcacoes marcações válidas do período (com folga de um dia antes e depois)
 * @param {Array} p.ajustes ajustes aprovados (inclusões e abonos)
 * @param {Set<string>} p.feriados datas AAAA-MM-DD
 * @param {Array} p.ferias férias aprovadas
 * @param {Array} p.afastamentos afastamentos aprovados
 */
export function calcularEspelho({ competencia, colaborador, jornada, marcacoes, ajustes = [], feriados = new Set(), ferias = [], afastamentos = [], hoje = dataLocal(Date.now()) }) {
  const tolerancia = Math.min(jornada?.tolerancia_min ?? 5, 10);
  const incluidas = ajustes
    .filter((a) => a.tipo === "inclusao" && a.status === "aprovado" && a.horario)
    .map((a) => ({ momento: instante(a.data, a.horario), origem: "ajuste", incluida: true, data_ajuste: a.data }));
  const todas = [...marcacoes.filter((m) => m.status === "valida").map((m) => ({ ...m, incluida: false })), ...incluidas].sort((a, b) => a.momento - b.momento);
  const usadas = new Set();

  const emFerias = (d) => ferias.some((f) => d >= f.inicio && d <= somarDias(f.inicio, f.dias - 1));
  const afastado = (d) => afastamentos.find((a) => d >= a.inicio && (!a.fim || d <= a.fim));

  const dias = diasDaCompetencia(competencia).map((data) => {
    const prev = previstoNoDia(jornada, data);
    const previsto = minutosPrevistos(prev);
    const feriado = feriados.has(data);
    // Janela do dia: começa 4 h antes da entrada prevista (ou à meia-noite) e dura 24 h
    const inicioJanela = prev ? instante(data, prev.entrada) - 4 * 3600_000 : instante(data);
    const fimJanela = inicioJanela + 24 * 3600_000;
    const doDia = todas.filter((m, i) => !usadas.has(i) && m.momento >= inicioJanela && m.momento < fimJanela && (usadas.add(i), true));

    let trabalhado = 0;
    let noturno = 0;
    for (let i = 0; i + 1 < doDia.length; i += 2) {
      trabalhado += Math.round((doDia[i + 1].momento - doDia[i].momento) / 60_000);
      noturno += minutosNoturnos(doDia[i].momento, doDia[i + 1].momento);
    }
    const impar = doDia.length % 2 === 1;
    const abonos = ajustes.filter((a) => a.tipo === "abono" && a.status === "aprovado" && a.data === data);
    const abonoMin = abonos.reduce((s, a) => s + (a.minutos ?? previsto), 0);

    const dia = {
      data,
      dia_semana: diaSemana(data),
      previsto,
      prev,
      marcacoes: doDia.map((m) => ({ id: m.id ?? null, hora: horaLocal(m.momento), origem: m.origem, incluida: m.incluida, biometria: Boolean(m.biometria), qr: Boolean(m.qr), nsr: m.nsr ?? null })),
      trabalhado,
      extra50: 0,
      extra100: 0,
      noturno,
      noturno_reduzido: Math.round((noturno * 60) / 52.5),
      atraso: 0,
      falta: false,
      abono: abonoMin,
      status: "normal",
      pendencia: impar ? "Número ímpar de marcações" : null,
    };

    const af = afastado(data);
    if (af) return { ...dia, status: "afastado", obs: af.motivo };
    if (emFerias(data)) return { ...dia, status: "ferias" };
    if (data > hoje) return { ...dia, status: prev && !feriado ? "futuro" : feriado ? "feriado" : "folga" };

    if (!prev || feriado) {
      // Trabalho em folga: domingo e feriado a 100%, demais folgas a 50%
      if (trabalhado > 0) {
        if (feriado || dia.dia_semana === 0) dia.extra100 = trabalhado;
        else dia.extra50 = trabalhado;
      }
      return { ...dia, status: feriado ? "feriado" : "folga" };
    }
    if (doDia.length === 0) {
      if (abonoMin >= previsto) return { ...dia, status: "abonado" };
      return { ...dia, status: "falta", falta: true, atraso: 0 };
    }
    const saldo = trabalhado + abonoMin - previsto;
    if (saldo > tolerancia) dia.extra50 = saldo;
    else if (saldo < -tolerancia) dia.atraso = -saldo;
    if (impar) dia.status = "incompleto";
    return dia;
  });

  const soma = (k) => dias.reduce((s, d) => s + (typeof d[k] === "number" ? d[k] : 0), 0);
  const totais = {
    previsto: dias.filter((d) => !["afastado", "ferias", "feriado", "folga"].includes(d.status)).reduce((s, d) => s + d.previsto, 0),
    trabalhado: soma("trabalhado"),
    extra50: soma("extra50"),
    extra100: soma("extra100"),
    noturno: soma("noturno"),
    noturno_reduzido: soma("noturno_reduzido"),
    atraso: soma("atraso"),
    abono: soma("abono"),
    faltas: dias.filter((d) => d.falta).length,
    pendencias: dias.filter((d) => d.pendencia).length,
    dias_trabalhados: dias.filter((d) => d.trabalhado > 0).length,
    domingos_feriados: dias.filter((d) => d.dia_semana === 0 || d.status === "feriado").length,
    dias_uteis: dias.filter((d) => d.dia_semana !== 0 && d.status !== "feriado").length,
  };
  return { competencia, colaborador_id: colaborador.id, banco_horas: Boolean(jornada?.banco_horas), dias, totais };
}
