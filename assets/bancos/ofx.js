/* Leitura de extrato OFX, o arquivo que o internet banking de quase todos os bancos exporta
   (BB, Caixa, Itaú, Bradesco, Santander, Sicoob, Sicredi, Inter e outros).
   Aceita OFX 1.x (SGML, sem fechar as tags) e OFX 2.x (XML). Sem dependências.
   Fonte comum: assets/bancos/. Copiado para cada produto por tools/bancos.sh. */
import { banco } from "./lista.js";

const LIMITE = 5 * 1024 * 1024; // 5 MB: extrato de anos cabe com folga

/** Converte o arquivo (Buffer ou texto) em texto, respeitando o CHARSET do cabeçalho (1252 = latin1). */
export function textoDoOfx(arquivo) {
  if (typeof arquivo === "string") return arquivo;
  if (!Buffer.isBuffer(arquivo)) throw new Error("Arquivo OFX inválido.");
  if (arquivo.length > LIMITE) throw new Error("Arquivo OFX grande demais (máximo 5 MB).");
  const cabeca = arquivo.subarray(0, 600).toString("latin1");
  const utf8 = /ENCODING\s*:\s*UTF-?8|encoding="utf-?8"/i.test(cabeca) && !/CHARSET\s*:\s*(1252|ISO-?8859)/i.test(cabeca);
  return arquivo.toString(utf8 ? "utf8" : "latin1");
}

/* valor de uma tag, com ou sem fechamento: <TRNAMT>-10,50 ou <TRNAMT>-10.50</TRNAMT> */
const tag = (bloco, nome) => {
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i").exec(bloco);
  return m ? m[1].trim() : undefined;
};

/* "-1.234,56" (vírgula decimal, que alguns bancos usam) ou "-1234.56" */
export function numeroOfx(t) {
  if (t === undefined) return NaN;
  let s = String(t).replace(/\s/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  return Number(s);
}

/* 20261114120000[-3:BRT] → "2026-11-14" */
export function dataOfx(t) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(t ?? ""));
  if (!m) return undefined;
  const [, a, me, d] = m;
  if (Number(me) < 1 || Number(me) > 12 || Number(d) < 1 || Number(d) > 31) return undefined;
  return `${a}-${me}-${d}`;
}

/**
 * Lê o extrato. Devolve:
 * { banco: {codigo, nome} | undefined, agencia, conta, moeda, inicio, fim,
 *   saldo: { valor, data } | undefined, movimentos: [{ id, data, valor, tipo, descricao, documento }] }
 * valor é em reais (positivo = entrada, negativo = saída). id é o FITID do banco (não repete).
 */
export function lerOfx(arquivo) {
  const txt = textoDoOfx(arquivo);
  if (!/<OFX>/i.test(txt)) throw new Error("Este arquivo não parece um extrato OFX.");
  const codigo = tag(txt, "BANKID");
  const b = banco(codigo);
  const movimentos = [];
  const vistos = new Set();
  for (const m of txt.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)) {
    const bloco = m[1];
    const valor = numeroOfx(tag(bloco, "TRNAMT"));
    const data = dataOfx(tag(bloco, "DTPOSTED"));
    if (!Number.isFinite(valor) || !data) continue;
    let id = tag(bloco, "FITID") || `${data}|${valor}|${tag(bloco, "MEMO") ?? ""}`;
    while (vistos.has(id)) id += "+"; // alguns bancos repetem FITID no mesmo arquivo
    vistos.add(id);
    const descricao = [tag(bloco, "NAME"), tag(bloco, "MEMO")].filter(Boolean).join(" · ").replace(/\s+/g, " ").slice(0, 200);
    movimentos.push({ id, data, valor: Math.round(valor * 100) / 100, tipo: (tag(bloco, "TRNTYPE") ?? (valor < 0 ? "DEBIT" : "CREDIT")).toUpperCase(), descricao, documento: tag(bloco, "CHECKNUM") || tag(bloco, "REFNUM") || undefined });
  }
  const bal = /<LEDGERBAL>([\s\S]*?)(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i.exec(txt);
  const saldoValor = bal ? numeroOfx(tag(bal[1], "BALAMT")) : NaN;
  return {
    banco: b ? { codigo: b.codigo, nome: b.nome } : codigo ? { codigo, nome: `Banco ${codigo}` } : undefined,
    agencia: tag(txt, "BRANCHID") || undefined,
    conta: tag(txt, "ACCTID") || undefined,
    moeda: tag(txt, "CURDEF") || "BRL",
    inicio: dataOfx(tag(txt, "DTSTART")),
    fim: dataOfx(tag(txt, "DTEND")),
    saldo: Number.isFinite(saldoValor) ? { valor: Math.round(saldoValor * 100) / 100, data: dataOfx(tag(bal[1], "DTASOF")) } : undefined,
    movimentos,
  };
}
