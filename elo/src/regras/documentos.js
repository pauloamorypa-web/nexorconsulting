/* Documentos (CPF, CNPJ, CNAE), dinheiro em texto e CSV simples. */

export const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

export function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cnpjValido(v) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((a, p, i) => a + Number(d[i]) * p, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export const documentoValido = (v) => {
  const d = soDigitos(v);
  return d.length === 11 ? cpfValido(d) : cnpjValido(d);
};

/** CNPJ com dígitos verificadores válidos a partir de uma raiz de 8 dígitos (fictício, para testes e demonstração) */
export function gerarCnpj(raiz) {
  const d = `${String(raiz).padStart(8, "0").slice(0, 8)}0001`.split("").map(Number);
  const dv = (nums) => {
    const pesos = nums.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((s, p, i) => s + nums[i] * p, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join("");
}

/** CPF fictício válido a partir de 9 dígitos */
export function gerarCpf(base) {
  const d = String(base).padStart(9, "0").slice(0, 9).split("").map(Number);
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i);
    const r = (s * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

/** CNAE só com números (4 a 7 dígitos). "43.21-5-00" → "4321500" */
export const normalizarCnae = (v) => soDigitos(v);

/**
 * CNAEs do instalador que o fornecedor aceita. O fornecedor pode aceitar a subclasse inteira ("4321500")
 * ou um grupo/classe pelo começo do código ("4321" aceita 4321500 e 4321501...).
 */
export function cnaesCompativeis(doInstalador = [], aceitos = []) {
  return doInstalador.filter((c) => aceitos.some((a) => a && String(c).startsWith(String(a))));
}

/** "1.234,56", "1234,56", "1234.56", "R$ 12" → centavos inteiros (null se não for número) */
export function reaisParaCentavos(v) {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  let s = String(v ?? "").replace(/R\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** CSV simples (separador ; ou , detectado no cabeçalho; aspas duplas opcionais) */
export function lerCsv(texto) {
  const linhas = String(texto ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return { cabecalho: [], linhas: [] };
  const sep = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const partir = (l) => {
    const r = [];
    let atual = "";
    let aspas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') {
        if (aspas && l[i + 1] === '"') (atual += '"'), i++;
        else aspas = !aspas;
      } else if (ch === sep && !aspas) r.push(atual.trim()), (atual = "");
      else atual += ch;
    }
    r.push(atual.trim());
    return r;
  };
  const cabecalho = partir(linhas[0]).map((c) => c.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, "_"));
  return { cabecalho, linhas: linhas.slice(1).map((l) => Object.fromEntries(partir(l).map((v, i) => [cabecalho[i], v]))) };
}

/** Mostra só o final de um documento: "•••.•••.•••-09" vira "•••••••••09" */
export const mascararDoc = (v) => (v ? `${"•".repeat(Math.max(0, String(v).length - 2))}${String(v).slice(-2)}` : null);
