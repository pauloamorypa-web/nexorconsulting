/* Datas no horário de Brasília (sem horário de verão desde 2019: UTC-3 fixo).
   Instantes: milissegundos UTC. Dia: AAAA-MM-DD. Hora do dia: HH:MM. */

const FUSO = "-03:00";
const DESLOCAMENTO = 3 * 3600_000;

export const hojeBR = (ms = Date.now()) => new Date(ms - DESLOCAMENTO).toISOString().slice(0, 10);
export const horaBR = (ms) => new Date(ms - DESLOCAMENTO).toISOString().slice(11, 16);
export const paraMs = (dia, hora = "00:00") => Date.parse(`${dia}T${hora}:00${FUSO}`);
export const diaSemana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay();
export const somarDias = (dia, n) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);
export const minutos = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const competencia = (ms) => hojeBR(ms).slice(0, 7);

/** Soma meses mantendo o dia (31/01 + 1 mês = 28/02 ou 29/02) */
export function somarMeses(dia, n) {
  const [a, m, d] = dia.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

export const NOMES_DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const dataCurta = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
export const quando = (ms) => `${NOMES_DIAS[diaSemana(hojeBR(ms))]}, ${dataCurta(hojeBR(ms))} às ${horaBR(ms)}`;
