/* Datas no horário de Brasília (UTC−3, sem horário de verão desde 2019) e feriados nacionais. */

export const OFFSET_MS = 3 * 3600_000;

/** Data local AAAA-MM-DD de um instante */
export const dataLocal = (ms) => new Date(ms - OFFSET_MS).toISOString().slice(0, 10);
/** Hora local HH:MM de um instante */
export const horaLocal = (ms) => new Date(ms - OFFSET_MS).toISOString().slice(11, 16);
/** Instante de uma data + hora local */
export const instante = (data, hhmm = "00:00") => new Date(`${data}T${hhmm}:00-03:00`).getTime();
/** Dia da semana (0 = domingo) de uma data AAAA-MM-DD */
export const diaSemana = (data) => new Date(`${data}T12:00:00Z`).getUTCDay();
export const somarDias = (data, n) => new Date(Date.parse(`${data}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);
export const minutos = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
export const hhmm = (min) => {
  const s = min < 0 ? "-" : "";
  const a = Math.abs(Math.round(min));
  return `${s}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};

/** Dias de uma competência AAAA-MM */
export function diasDaCompetencia(competencia) {
  const [a, m] = competencia.split("-").map(Number);
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return Array.from({ length: total }, (_, i) => `${competencia}-${String(i + 1).padStart(2, "0")}`);
}

/** Domingo de Páscoa (algoritmo de Meeus/Butcher) */
export function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Feriados nacionais (Lei 662/1949, 6.802/1980, 14.759/2023) + Sexta-feira Santa */
export function feriadosNacionais(ano) {
  const fixos = [
    ["01-01", "Confraternização Universal"],
    ["04-21", "Tiradentes"],
    ["05-01", "Dia do Trabalho"],
    ["09-07", "Independência do Brasil"],
    ["10-12", "Nossa Senhora Aparecida"],
    ["11-02", "Finados"],
    ["11-15", "Proclamação da República"],
    ["11-20", "Dia Nacional de Zumbi e da Consciência Negra"],
    ["12-25", "Natal"],
  ];
  const lista = fixos.map(([d, nome]) => ({ data: `${ano}-${d}`, nome }));
  lista.push({ data: somarDias(pascoa(ano), -2), nome: "Sexta-feira Santa" });
  return lista.sort((x, y) => x.data.localeCompare(y.data));
}
