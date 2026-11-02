/* Montagem de XML já na forma canônica (C14N 1.0): sem espaços entre tags, sem declaração, atributos em ordem
   alfabética, elementos vazios escritos por extenso. Assim o texto gerado é exatamente o que a assinatura
   digital (XMLDSig) usa para calcular o resumo. Campos vazios são omitidos (o eSocial recusa tags vazias). */

const escTexto = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");

const vazio = (v) => v === undefined || v === null || v === "" || v === false;

/**
 * el("nome", valor) → <nome>valor</nome> (omitido se vazio)
 * el("nome", { attr: v }, filho1, filho2...) → elemento com atributos e filhos (omitido se não tiver filhos)
 */
export function el(nome, ...resto) {
  let attrs = {};
  if (resto.length && resto[0] && typeof resto[0] === "object" && !Array.isArray(resto[0])) attrs = resto.shift();
  const filhos = resto.flat(Infinity).filter((f) => !vazio(f));
  if (!filhos.length) return "";
  // Atributo xmlns primeiro, depois os demais em ordem alfabética (regra da forma canônica)
  const chaves = Object.keys(attrs).filter((k) => !vazio(attrs[k])).sort((a, b) => (a === "xmlns" ? -1 : b === "xmlns" ? 1 : a.localeCompare(b)));
  const a = chaves.map((k) => ` ${k}="${escAttr(attrs[k])}"`).join("");
  const corpo = filhos.map((f) => (typeof f === "string" && f.startsWith("<") ? f : escTexto(f))).join("");
  return `<${nome}${a}>${corpo}</${nome}>`;
}

/** Folha (texto) que sempre aparece, mesmo com valor zero */
export const elv = (nome, valor) => (valor === undefined || valor === null || valor === "" ? "" : `<${nome}>${escTexto(valor)}</${nome}>`);

/** Valor em reais com 2 casas e ponto decimal */
export const reais = (centavos) => (centavos / 100).toFixed(2);

/** Lê o texto de uma tag em um XML de resposta (primeira ocorrência, ignora prefixos) */
export function tag(xml, nome) {
  const m = new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`).exec(xml ?? "");
  return m ? m[1].trim() : null;
}

/** Todas as ocorrências de uma tag */
export function tags(xml, nome) {
  const re = new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, "g");
  return [...String(xml ?? "").matchAll(re)].map((m) => m[1]);
}

/** Atributo de uma tag */
export function atributo(xml, nome, attr) {
  const m = new RegExp(`<(?:\\w+:)?${nome}\\s[^>]*${attr}="([^"]*)"`).exec(xml ?? "");
  return m ? m[1] : null;
}
