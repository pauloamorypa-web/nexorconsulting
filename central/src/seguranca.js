/* Senhas, tokens, 2FA (TOTP), cofre de segredos e assinatura Ed25519 das licenças e dos acessos. */

import { createCipheriv, createDecipheriv, createHash, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, scryptSync, sign, timingSafeEqual, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const N = 131072;
const opcoes = (n) => ({ N: n, r: 8, p: 1, maxmem: 256 * n * 8 + 1024 * 1024 });

export function gerarHashSenha(senha) {
  const sal = randomBytes(16);
  return `scrypt$${N}$${sal.toString("base64")}$${scryptSync(senha, sal, 64, opcoes(N)).toString("base64")}`;
}

export function conferirSenha(senha, guardado) {
  const [alg, n, sal, hash] = String(guardado ?? "").split("$");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const custo = Number(n);
  if (!Number.isInteger(custo) || custo < 1024 || custo > 1048576 || (custo & (custo - 1)) !== 0) return false;
  const esperado = Buffer.from(hash, "base64");
  return timingSafeEqual(esperado, scryptSync(senha, Buffer.from(sal, "base64"), esperado.length, opcoes(custo)));
}

export const gerarToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (v) => createHash("sha256").update(v).digest("hex");

export function iguais(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ---------- 2FA: TOTP (RFC 6238), compatível com Google Authenticator, Authy e Microsoft Authenticator ---------- */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(buf) {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const b of buf) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      saida += B32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += B32[(valor << (5 - bits)) & 31];
  return saida;
}
function deBase32(texto) {
  let bits = 0;
  let valor = 0;
  const saida = [];
  for (const c of texto.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      saida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(saida);
}
export const novoSegredoTotp = () => base32(randomBytes(20));

export function codigoTotp(segredo, momento = Date.now(), passo = 30) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(momento / 1000 / passo)));
  const hmac = createHmac("sha1", deBase32(segredo)).update(contador).digest();
  const o = hmac[hmac.length - 1] & 15;
  return String((hmac.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Confere o código aceitando 1 passo antes ou depois (relógio do celular adiantado ou atrasado) */
export function conferirTotp(segredo, codigo, momento = Date.now()) {
  const c = String(codigo ?? "").replace(/\D/g, "");
  if (c.length !== 6 || !segredo) return false;
  return [-1, 0, 1].some((d) => iguais(codigoTotp(segredo, momento + d * 30_000), c));
}

/* ---------- Cofre (AES-256-GCM) ---------- */

export function criarCofre({ chaveMestra, pastaDados, producao }) {
  let chave;
  if (chaveMestra) chave = createHash("sha256").update(chaveMestra).digest();
  else {
    if (producao) throw new Error("MASTER_KEY é obrigatória em produção (use um texto aleatório longo).");
    mkdirSync(pastaDados, { recursive: true });
    const arquivo = join(pastaDados, ".chave");
    if (!existsSync(arquivo)) writeFileSync(arquivo, randomBytes(32).toString("base64"), { mode: 0o600 });
    chave = Buffer.from(readFileSync(arquivo, "utf8"), "base64");
  }
  return {
    cifrar(texto) {
      if (!texto) return "";
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", chave, iv);
      const dados = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
      return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${dados.toString("base64")}`;
    },
    decifrar(guardado) {
      if (!guardado) return "";
      const [v, iv, tag, dados] = guardado.split(".");
      if (v !== "v1") throw new Error("formato de segredo desconhecido");
      const d = createDecipheriv("aes-256-gcm", chave, Buffer.from(iv, "base64"));
      d.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([d.update(Buffer.from(dados, "base64")), d.final()]).toString("utf8");
    },
  };
}

/* ---------- Assinatura Ed25519 ---------- */

/** Chave que assina as licenças. Guardada em DATA_DIR/chave-licenca.pem (ou LICENSE_PRIVATE_KEY). Perdê-la obriga a
    trocar a chave pública em todas as instalações: faça backup dela junto com o banco. */
export function criarAssinador({ chavePrivada, pastaDados }) {
  let privada;
  if (chavePrivada) privada = createPrivateKey(chavePrivada);
  else {
    mkdirSync(pastaDados, { recursive: true });
    const arquivo = join(pastaDados, "chave-licenca.pem");
    if (!existsSync(arquivo)) {
      const { privateKey } = generateKeyPairSync("ed25519");
      writeFileSync(arquivo, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    }
    privada = createPrivateKey(readFileSync(arquivo, "utf8"));
  }
  const publica = createPublicKey(privada);
  const publicaB64 = publica.export({ type: "spki", format: "der" }).toString("base64");
  return {
    chavePublica: publicaB64,
    /** "payload.assinatura", ambos em base64url. A assinatura cobre o texto do payload. */
    assinar(dados) {
      const p = Buffer.from(JSON.stringify(dados)).toString("base64url");
      return `${p}.${sign(null, Buffer.from(p), privada).toString("base64url")}`;
    },
    conferir: (token) => conferirAssinado(token, publicaB64),
  };
}

/** Confere um token assinado com a chave pública (base64 SPKI). Devolve o conteúdo ou null. */
export function conferirAssinado(token, chavePublicaB64) {
  const [p, s] = String(token ?? "").split(".");
  if (!p || !s) return null;
  try {
    const chave = createPublicKey({ key: Buffer.from(chavePublicaB64, "base64"), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(p), chave, Buffer.from(s, "base64url"))) return null;
    return JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
