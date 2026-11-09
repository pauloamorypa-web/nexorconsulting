/* Limite de tentativas de login (LGPD art. 46, OWASP ASVS 2.2): por IP e por conta, 429 com Retry-After,
   e o login certo zera o contador da conta. Cada teste usa um IP próprio (True-Client-IP, como a Cloudflare grava). */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { criarLimites } from "../src/http/limite.js";
import { iniciarApp } from "./ajuda.js";

const SENHA = "senha-forte-123";
let t;
before(async () => {
  t = await iniciarApp();
  assert.equal((await t.chamar("POST", "/api/cadastro", { empresa: "Loja", nome: "Paula", email: "paula@teste.com", senha: SENHA })).status, 200);
  await t.chamar("POST", "/api/usuarios", { nome: "Beto", email: "beto@teste.com", senha: SENHA, papel: "admin" });
  t.sair();
});
after(() => t.fechar());

async function entrar(email, senha, ip) {
  const r = await fetch(`${t.base}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json", "x-nexor": "1", "true-client-ip": ip }, body: JSON.stringify({ email, senha }) });
  return { status: r.status, espera: r.headers.get("retry-after"), dados: await r.json() };
}

test("5 senhas erradas: a 6ª tentativa recebe 429 com Retry-After, mesmo com a senha certa", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await entrar("paula@teste.com", "errada", "203.0.113.1")).status, 401);
  const r = await entrar("paula@teste.com", SENHA, "203.0.113.1");
  assert.equal(r.status, 429);
  assert.ok(Number(r.espera) > 0 && Number(r.espera) <= 900, `Retry-After: ${r.espera}`);
  assert.match(r.dados.erro, /Muitas tentativas/);
  // Conta que não existe recebe a mesma resposta: o limite não revela quais e-mails têm cadastro
  for (let i = 0; i < 5; i++) assert.equal((await entrar("ninguem@teste.com", "errada", "203.0.113.11")).status, 401);
  const n = await entrar("ninguem@teste.com", "errada", "203.0.113.11");
  assert.equal(n.status, 429);
  assert.equal(n.dados.erro, r.dados.erro);
});

test("outra conta no mesmo IP continua liberada até o limite por IP (20)", async () => {
  const ip = "203.0.113.2";
  for (let i = 0; i < 5; i++) assert.equal((await entrar("alvo@teste.com", "errada", ip)).status, 401);
  assert.equal((await entrar("alvo@teste.com", "errada", ip)).status, 429, "a conta travou");
  for (let i = 6; i < 20; i++) assert.equal((await entrar(`outra${i}@teste.com`, "errada", ip)).status, 401, `tentativa ${i + 1}`);
  const r = await entrar("mais-uma@teste.com", "errada", ip);
  assert.equal(r.status, 429, "o IP travou");
  assert.ok(Number(r.espera) > 0);
  assert.equal((await entrar("mais-uma@teste.com", "errada", "203.0.113.22")).status, 401, "outro IP não é afetado");
});

test("login certo zera o contador da conta", async () => {
  const ip = "203.0.113.3";
  for (let i = 0; i < 4; i++) assert.equal((await entrar("beto@teste.com", "errada", ip)).status, 401);
  assert.equal((await entrar("beto@teste.com", SENHA, ip)).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await entrar("beto@teste.com", "errada", ip)).status, 401, `falha ${i + 1} depois do acerto`);
  assert.equal((await entrar("beto@teste.com", "errada", ip)).status, 429);
});

test("módulo: Retry-After conta até a tentativa sair da janela, e a limpeza apaga o que venceu", () => {
  let agora = 0;
  const l = criarLimites({ agora: () => agora });
  try {
    for (let i = 0; i < 3; i++) {
      l.contar("k", 3, 60_000);
      agora += 10_000;
    }
    assert.throws(() => l.contar("k", 3, 60_000), (e) => e.status === 429 && e.cabecalhos["Retry-After"] === "30");
    agora = 60_000;
    assert.doesNotThrow(() => l.contar("k", 3, 60_000), "a primeira saiu da janela");
    agora = 10 * 60_000;
    l.limpar();
    assert.equal(l.tamanho, 0);
  } finally {
    l.parar();
  }
});
