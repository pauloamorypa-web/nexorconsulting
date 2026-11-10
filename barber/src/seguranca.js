/* Senhas, sessões, criptografia de segredos e comparação segura. */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";

// scrypt com N = 2^17 (recomendação OWASP). Senhas antigas (N menor) são refeitas no próximo login.
const N = 131072;
const opcoes = (n) => ({ N: n, r: 8, p: 1, maxmem: 256 * n * 8 + 1024 * 1024 });

export function gerarHashSenha(senha) {
  const sal = randomBytes(16);
  const hash = scryptSync(senha, sal, 64, opcoes(N));
  return `scrypt$${N}$${sal.toString("base64")}$${hash.toString("base64")}`;
}

export function conferirSenha(senha, guardado) {
  const [alg, n, sal, hash] = String(guardado ?? "").split("$");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const custo = Number(n);
  if (!Number.isInteger(custo) || custo < 1024 || custo > 1048576 || (custo & (custo - 1)) !== 0) return false;
  const calculado = scryptSync(senha, Buffer.from(sal, "base64"), esperado.length, opcoes(custo));
  return timingSafeEqual(esperado, calculado);
}

/*
 * Versões assíncronas (V-10): o scrypt roda no pool de threads e o servidor continua respondendo durante o login.
 * Reteste T-03: o custo continua N = 2^17 (OWASP). Cálculos simultâneos acompanham o servidor
 * (availableParallelism, entre 2 e 4; cada um usa ~128 MB). Quem espera mais que o prazo da fila (ou encontra a
 * fila cheia) recebe 429 com Retry-After e uma mensagem em português, em vez de um 503 genérico.
 */
const FILA = { simultaneos: Math.min(4, Math.max(2, availableParallelism())), prazoMs: 4_000, maxFila: 64, tentarEmS: 5 };
/** Só para os testes: ajusta a fila (simultâneos, prazo e tamanho) */
export const configurarFilaSenhas = (o) => Object.assign(FILA, o);
export const filaSenhas = () => ({ ...FILA });
const MSG_OCUPADO = "Muitas tentativas de entrar agora. Tente de novo em alguns segundos.";
const ocupado = () => Object.assign(new Error(MSG_OCUPADO), { status: 429, retryAfter: FILA.tentarEmS });
let emCalculo = 0;
const espera = [];
function proximo() {
  while (espera.length && emCalculo < FILA.simultaneos) espera.shift().iniciar();
}
function scryptNaFila(senha, sal, tamanho, opc) {
  if (espera.length >= FILA.maxFila) return Promise.reject(ocupado());
  return new Promise((ok, falhou) => {
    const item = {
      iniciar() {
        clearTimeout(item.prazo);
        emCalculo += 1;
        scrypt(senha, sal, tamanho, opc, (err, chave) => {
          emCalculo -= 1;
          proximo();
          if (err) falhou(err);
          else ok(chave);
        });
      },
    };
    if (emCalculo < FILA.simultaneos) return item.iniciar();
    // Prazo de espera na fila: quem não começou a tempo sai com 429
    item.prazo = setTimeout(() => {
      const i = espera.indexOf(item);
      if (i >= 0) espera.splice(i, 1);
      falhou(ocupado());
    }, FILA.prazoMs);
    espera.push(item);
  });
}

export async function hashSenha(senha) {
  const sal = randomBytes(16);
  const hash = await scryptNaFila(senha, sal, 64, opcoes(N));
  return `scrypt$${N}$${sal.toString("base64")}$${hash.toString("base64")}`;
}

export async function senhaConfere(senha, guardado) {
  const [alg, n, sal, hash] = String(guardado ?? "").split("$");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const custo = Number(n);
  if (!Number.isInteger(custo) || custo < 1024 || custo > 1048576 || (custo & (custo - 1)) !== 0) return false;
  const calculado = await scryptNaFila(senha, Buffer.from(sal, "base64"), esperado.length, opcoes(custo));
  return timingSafeEqual(esperado, calculado);
}

/** A senha foi guardada com proteção mais fraca que a atual? (refazer o hash depois do login) */
export const precisaRefazerHash = (guardado) => Number(String(guardado ?? "").split("$")[1]) < N;

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
