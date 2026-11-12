/* 2FA por aplicativo (TOTP, RFC 6238: HMAC-SHA1, 6 dígitos, passo de 30 s) feito com node:crypto.
   Aceita o passo atual e os vizinhos (relógio do celular adiantado ou atrasado) e devolve qual passo conferiu,
   para o servidor recusar o mesmo código usado duas vezes. */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(buf) {
  let bits = 0;
  let valor = 0;
  let s = "";
  for (const b of buf) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      s += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) s += ALFABETO[(valor << (5 - bits)) & 31];
  return s;
}

export function deBase32(texto) {
  let bits = 0;
  let valor = 0;
  const saida = [];
  for (const c of String(texto).toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    valor = (valor << 5) | ALFABETO.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      saida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(saida);
}

export const gerarSegredoTotp = () => base32(randomBytes(20));

/** Código do passo `passo` (inteiro = segundos / 30) */
export function codigoDoPasso(segredo, passo) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(passo));
  const h = createHmac("sha1", deBase32(segredo)).update(msg).digest();
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export const codigoTotp = (segredo, agoraMs = Date.now()) => codigoDoPasso(segredo, Math.floor(agoraMs / 30_000));

/** Confere o código; devolve o passo que conferiu (número) ou null. `janela` = passos aceitos para cada lado. */
export function conferirTotp(segredo, codigo, agoraMs = Date.now(), janela = 1) {
  const digitado = Buffer.from(String(codigo ?? "").replace(/\D/g, "").padStart(6, "0").slice(0, 6));
  if (String(codigo ?? "").replace(/\D/g, "").length !== 6) return null;
  const atual = Math.floor(agoraMs / 30_000);
  let achou = null;
  for (let d = -janela; d <= janela; d++) if (timingSafeEqual(digitado, Buffer.from(codigoDoPasso(segredo, atual + d)))) achou = atual + d;
  return achou;
}

/** Endereço otpauth:// para o QR code do aplicativo (Google Authenticator, Authy, Microsoft Authenticator) */
export const enderecoTotp = (segredo, conta, emissor = "Nexor Guardião") => `otpauth://totp/${encodeURIComponent(`${emissor}:${conta}`)}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=30`;
