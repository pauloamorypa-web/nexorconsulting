/* Senhas, sessões, criptografia de segredos e comparação segura. */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const N = 16384;

export function gerarHashSenha(senha) {
  const sal = randomBytes(16);
  const hash = scryptSync(senha, sal, 64, { N, r: 8, p: 1 });
  return `scrypt$${N}$${sal.toString("base64")}$${hash.toString("base64")}`;
}

export function conferirSenha(senha, guardado) {
  const [alg, n, sal, hash] = String(guardado ?? "").split("$");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const calculado = scryptSync(senha, Buffer.from(sal, "base64"), esperado.length, { N: Number(n), r: 8, p: 1 });
  return timingSafeEqual(esperado, calculado);
}

export const gerarToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (v) => createHash("sha256").update(v).digest("hex");

export function iguais(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const hmacHex = (segredo, dados) => createHmac("sha256", segredo).update(dados).digest("hex");

/**
 * Cofre de segredos com AES-256-GCM. Os tokens da Meta ficam criptografados no banco.
 * Sem MASTER_KEY (desenvolvimento), uma chave é gerada e salva em <pasta>/.chave.
 */
export function criarCofre({ chaveMestra, pastaDados, producao }) {
  let chave;
  if (chaveMestra) {
    chave = createHash("sha256").update(chaveMestra).digest();
  } else {
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

/** Mostra só o final de um segredo: "••••a1b2" */
export const mascarar = (s) => (s ? `••••${String(s).slice(-4)}` : "");
