/* Agenda: horários livres a partir do horário de funcionamento da empresa (horário de Brasília). */

const OFFSET = "-03:00";
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Data local (AAAA-MM-DD), dia da semana e minutos do dia em Brasília */
export function localBrasilia(instante) {
  const l = new Date(instante - 3 * 3600_000);
  return { iso: l.toISOString().slice(0, 10), diaSemana: l.getUTCDay(), minutos: l.getUTCHours() * 60 + l.getUTCMinutes() };
}

export const instanteDe = (dataIso, hhmm) => new Date(`${dataIso}T${hhmm}:00${OFFSET}`).getTime();

const paraMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const paraHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const formatarQuando = (instante) => {
  const { iso, diaSemana, minutos } = localBrasilia(instante);
  return `${DIAS[diaSemana]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)} às ${paraHHMM(minutos)}`;
};

/** Faixas "08:00-12:00" do dia → [[480, 720]] */
const faixas = (lista = []) =>
  lista
    .map((f) => String(f).split("-"))
    .filter((p) => p.length === 2 && /^\d{2}:\d{2}$/.test(p[0]) && /^\d{2}:\d{2}$/.test(p[1]))
    .map(([a, b]) => [paraMin(a), paraMin(b)]);

/** A empresa está aberta agora? Se não, quando abre. */
export function situacaoHorario(horario, agora) {
  if (!horario?.ativo) return { aberto: true, configurado: false };
  const { diaSemana, minutos } = localBrasilia(agora);
  if (faixas(horario.dias?.[diaSemana]).some(([a, b]) => minutos >= a && minutos < b)) return { aberto: true, configurado: true };
  for (let d = 0; d <= 7; d++) {
    const t = agora + d * 86400_000;
    const { iso, diaSemana: ds } = localBrasilia(t);
    for (const [a] of faixas(horario.dias?.[ds])) {
      const inicio = instanteDe(iso, paraHHMM(a));
      if (inicio > agora) return { aberto: false, configurado: true, abreEm: inicio, abreTexto: formatarQuando(inicio) };
    }
  }
  return { aberto: false, configurado: true };
}

/**
 * Horários livres para um serviço.
 * @param {object} p
 * @param {object} p.config configuração completa da empresa
 * @param {Array<{inicio:number, duracao_min:number, status:string}>} p.ocupados agendamentos existentes
 * @param {number} p.agora
 * @param {number} p.duracao duração do serviço em minutos
 * @param {string} [p.aPartirDe] data AAAA-MM-DD
 */
export function horariosLivres({ config, ocupados, agora, duracao, aPartirDe, limite = 12 }) {
  const { agenda, horario } = config;
  const passo = Math.max(10, agenda.intervalo_min || 30);
  const minimo = agora + (agenda.antecedencia_horas ?? 2) * 3600_000;
  const ini = aPartirDe ? Math.max(agora, instanteDe(aPartirDe, "00:00")) : agora;
  const ativos = ocupados.filter((o) => o.status === "confirmado");
  const livres = [];
  for (let d = 0; d <= (agenda.dias_adiante ?? 14) && livres.length < limite; d++) {
    const { iso, diaSemana } = localBrasilia(ini + d * 86400_000);
    for (const [a, b] of faixas(horario.dias?.[diaSemana])) {
      for (let m = a; m + duracao <= b; m += passo) {
        const inicio = instanteDe(iso, paraHHMM(m));
        const fim = inicio + duracao * 60_000;
        if (inicio < minimo) continue;
        const conflito = ativos.some((o) => inicio < o.inicio + o.duracao_min * 60_000 && o.inicio < fim);
        if (!conflito) livres.push({ horario: `${iso}T${paraHHMM(m)}`, texto: formatarQuando(inicio), inicio });
        if (livres.length >= limite) break;
      }
      if (livres.length >= limite) break;
    }
  }
  return livres;
}
