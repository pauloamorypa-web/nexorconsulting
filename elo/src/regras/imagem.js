/* Leitura mínima de PNG (sem dependências) para conferir a assinatura do cliente: quantos pixels têm tinta e o tamanho do
   traço. Banca U-05: um toque só no quadro gerava uma "assinatura" de um ponto. O app já exige um traço mínimo; aqui o
   servidor recusa a imagem quase em branco. Só analisa o PNG que o quadro do app gera (8 bits, RGB/RGBA/cinza, sem
   entrelaçamento); qualquer outro formato passa sem análise (não bloqueia o que não sabe ler). */

import { deflateSync, inflateSync } from "node:zlib";

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PIXELS = 8_000_000;

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Tinta de um PNG: { analisada: true, largura, altura, pixels (com tinta), caixa: { largura, altura } } ou { analisada: false }.
 * "Tinta" = pixel opaco (alfa ≥ 128) e escuro (luminância < 160).
 */
export function tintaPng(buf) {
  try {
    if (!buf.subarray(0, 8).equals(ASSINATURA_PNG)) return { analisada: false };
    let pos = 8;
    let largura = 0;
    let altura = 0;
    let profundidade = 0;
    let cor = 0;
    let entrelacado = 0;
    const idat = [];
    while (pos + 8 <= buf.length) {
      const tam = buf.readUInt32BE(pos);
      const tipo = buf.toString("latin1", pos + 4, pos + 8);
      const dados = buf.subarray(pos + 8, pos + 8 + tam);
      if (tipo === "IHDR") {
        largura = dados.readUInt32BE(0);
        altura = dados.readUInt32BE(4);
        profundidade = dados[8];
        cor = dados[9];
        entrelacado = dados[12];
      } else if (tipo === "IDAT") idat.push(dados);
      else if (tipo === "IEND") break;
      pos += 12 + tam;
    }
    const canais = { 0: 1, 2: 3, 4: 2, 6: 4 }[cor];
    if (!canais || profundidade !== 8 || entrelacado || !largura || !altura || largura * altura > MAX_PIXELS) return { analisada: false };
    const linha = largura * canais;
    const cru = inflateSync(Buffer.concat(idat), { maxOutputLength: (linha + 1) * altura });
    if (cru.length < (linha + 1) * altura) return { analisada: false };
    const atual = Buffer.alloc(linha);
    let anterior = Buffer.alloc(linha);
    let pixels = 0;
    let x0 = largura;
    let y0 = altura;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < altura; y++) {
      const ini = y * (linha + 1);
      const filtro = cru[ini];
      for (let i = 0; i < linha; i++) {
        const v = cru[ini + 1 + i];
        const a = i >= canais ? atual[i - canais] : 0;
        const b = anterior[i];
        const c = i >= canais ? anterior[i - canais] : 0;
        atual[i] = (v + (filtro === 1 ? a : filtro === 2 ? b : filtro === 3 ? (a + b) >> 1 : filtro === 4 ? paeth(a, b, c) : 0)) & 0xff;
      }
      for (let x = 0; x < largura; x++) {
        const p = x * canais;
        const lum = canais >= 3 ? (atual[p] * 299 + atual[p + 1] * 587 + atual[p + 2] * 114) / 1000 : atual[p];
        const alfa = canais === 4 ? atual[p + 3] : canais === 2 ? atual[p + 1] : 255;
        if (alfa >= 128 && lum < 160) {
          pixels++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      anterior = Buffer.from(atual);
    }
    return { analisada: true, largura, altura, pixels, caixa: pixels ? { largura: x1 - x0 + 1, altura: y1 - y0 + 1 } : { largura: 0, altura: 0 } };
  } catch {
    return { analisada: false };
  }
}

/** A assinatura tem traço de verdade? (não é um ponto nem um quadro em branco) */
export function assinaturaTemTraco(t) {
  if (!t.analisada) return true;
  return t.pixels >= 60 && Math.max(t.caixa.largura, t.caixa.altura) >= 30;
}

/* ---------- Geração (testes e demonstração) ---------- */
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function bloco(tipo, dados) {
  const t = Buffer.from(tipo, "latin1");
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}

/** PNG cinza 8 bits, fundo branco; `tinta(x, y)` diz quais pixels são escuros. Devolve o data URL. */
export function gerarPng(largura, altura, tinta) {
  const cru = Buffer.alloc((largura + 1) * altura, 255);
  for (let y = 0; y < altura; y++) {
    cru[y * (largura + 1)] = 0;
    for (let x = 0; x < largura; x++) if (tinta(x, y)) cru[y * (largura + 1) + 1 + x] = 20;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const png = Buffer.concat([ASSINATURA_PNG, bloco("IHDR", ihdr), bloco("IDAT", deflateSync(cru)), bloco("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Uma "assinatura" de exemplo: onda de 3 px de espessura atravessando o quadro */
export const assinaturaExemplo = (largura = 300, altura = 100) => gerarPng(largura, altura, (x, y) => x > 20 && x < largura - 20 && Math.abs(y - (altura / 2 + Math.sin(x / 12) * altura * 0.25)) < 1.6);
