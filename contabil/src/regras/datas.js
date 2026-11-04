/* Datas do escritório: hoje em Brasília, competências, dias úteis e feriados nacionais.
   Feriados considerados: os nacionais fixos (Lei 662/1949, 6.802/1980, 14.759/2023) e a Sexta-feira Santa.
   Carnaval e Corpus Christi são ponto facultativo e não entram: um prazo "posterga" nunca passa da data certa. */

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" });

export const hojeBR = (ms = Date.now()) => fmt.format(new Date(ms));
export const horaBR = (ms = Date.now()) => Number(fmtHora.format(new Date(ms)));
const utc = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const somarDias = (d, n) => iso(utc(d) + n * 86400_000);
export const diasEntre = (a, b) => Math.round((utc(a) - utc(b)) / 86400_000);
export const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

export function somarMeses(competencia, n) {
  const [a, m] = competencia.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export const competenciaAnterior = (hoje) => somarMeses(hoje.slice(0, 7), -1);
export const ultimoDia = (competencia) => {
  const [a, m] = competencia.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};
export const nomeMes = (c) => `${["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) */
function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
const cacheFeriados = new Map();
export function feriadosNacionais(ano) {
  if (!cacheFeriados.has(ano)) {
    const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((d) => `${ano}-${d}`);
    cacheFeriados.set(ano, new Set([...fixos, somarDias(pascoa(ano), -2)]));
  }
  return cacheFeriados.get(ano);
}
export function diaUtil(d, extras = new Set()) {
  const semana = new Date(utc(d)).getUTCDay();
  return semana !== 0 && semana !== 6 && !feriadosNacionais(Number(d.slice(0, 4))).has(d) && !extras.has(d);
}
/** Ajusta um vencimento que caiu em dia não útil: antecipa (dia útil anterior) ou posterga (próximo) */
export function ajustar(d, modo, extras) {
  if (modo === "nenhum") return d;
  let x = d;
  for (let i = 0; i < 15 && !diaUtil(x, extras); i++) x = somarDias(x, modo === "antecipa" ? -1 : 1);
  return x;
}
/** N-ésimo dia útil do mês */
export function enesimoDiaUtil(competencia, n, extras) {
  let x = `${competencia}-01`;
  let conta = diaUtil(x, extras) ? 1 : 0;
  while (conta < n) {
    x = somarDias(x, 1);
    if (diaUtil(x, extras)) conta++;
  }
  return x;
}
export function ultimoDiaUtil(competencia, extras) {
  return ajustar(`${competencia}-${String(ultimoDia(competencia)).padStart(2, "0")}`, "antecipa", extras);
}
