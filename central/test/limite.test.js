/* Limite de tentativas (LGPD art. 46, OWASP ASVS 2.2) no login e no 2FA da Central: por IP e por conta,
   429 com Retry-After, e o acerto zera o contador. Cada teste usa um IP próprio (X-Forwarded-For, TRUST_PROXY=1). */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { criarLimites } from "../src/http/limite.js";
import { codigoTotp } from "../src/seguranca.js";
import { montarCentral } from "../src/servidor.js";

const SENHA = "senha-muito-forte";
let relogio = Date.parse("2026-11-04T12:00:00-03:00");
const agora = () => relogio;
let s, url, pasta, segredo;

/** Cliente com cookies próprios, sempre do mesmo IP */
function cliente(ip) {
  const cookies = new Map();
  return async (caminho, corpo, metodo = "POST") => {
    const r = await fetch(url + caminho, { method: metodo, headers: { "x-nexor": "1", "x-forwarded-for": ip, cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(corpo ? { "content-type": "application/json" } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
    for (const c of r.headers.getSetCookie()) {
      const [k, v] = c.split(";")[0].split("=");
      if (v) cookies.set(k, v);
      else cookies.delete(k);
    }
    return { status: r.status, espera: r.headers.get("retry-after"), dados: await r.json() };
  };
}

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "nexor-central-limite-"));
  const cfg = { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste", urlPublica: "https://central.teste", codigoInstalacao: "ABCD2345" };
  s = montarCentral({ cfg, caminhoBanco: ":memory:", agora });
  await new Promise((r) => s.servidor.listen(0, r));
  url = `http://localhost:${s.servidor.address().port}`;
  const c = cliente("192.0.2.1");
  assert.equal((await c("/api/cadastro", { nome: "Paulo", email: "paulo@nexor.com", senha: SENHA, codigo_instalacao: "ABCD2345" })).status, 200);
  segredo = (await c("/api/totp/novo", undefined, "GET")).dados.segredo;
  assert.equal((await c("/api/totp", { codigo: codigoTotp(segredo, agora()) })).status, 200);
});
after(() => {
  s.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

const entrar = (email, senha, ip) => cliente(ip)("/api/entrar", { email, senha });

test("5 senhas erradas: a 6ª tentativa recebe 429 com Retry-After, mesmo com a senha certa", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await entrar("paulo@nexor.com", "errada", "203.0.113.1")).status, 401);
  const r = await entrar("paulo@nexor.com", SENHA, "203.0.113.1");
  assert.equal(r.status, 429);
  assert.ok(Number(r.espera) > 0 && Number(r.espera) <= 900, `Retry-After: ${r.espera}`);
  assert.match(r.dados.erro, /Muitas tentativas/);
  // Conta que não existe recebe a mesma resposta: o limite não revela quais e-mails têm cadastro
  for (let i = 0; i < 5; i++) assert.equal((await entrar("ninguem@nexor.com", "errada", "203.0.113.11")).status, 401);
  const n = await entrar("ninguem@nexor.com", "errada", "203.0.113.11");
  assert.equal(n.status, 429);
  assert.equal(n.dados.erro, r.dados.erro);
});

test("outra conta no mesmo IP continua liberada até o limite por IP (20)", async () => {
  const ip = "203.0.113.2";
  for (let i = 0; i < 5; i++) assert.equal((await entrar("alvo@nexor.com", "errada", ip)).status, 401);
  assert.equal((await entrar("alvo@nexor.com", "errada", ip)).status, 429, "a conta travou");
  for (let i = 6; i < 20; i++) assert.equal((await entrar(`outra${i}@nexor.com`, "errada", ip)).status, 401, `tentativa ${i + 1}`);
  const r = await entrar("mais-uma@nexor.com", "errada", ip);
  assert.equal(r.status, 429, "o IP travou");
  assert.ok(Number(r.espera) > 0);
  assert.equal((await entrar("mais-uma@nexor.com", "errada", "203.0.113.22")).status, 401, "outro IP não é afetado");
});

test("depois da janela a conta libera, e o login certo zera o contador", async () => {
  relogio += 16 * 60_000;
  const ip = "203.0.113.3";
  for (let i = 0; i < 4; i++) assert.equal((await entrar("paulo@nexor.com", "errada", ip)).status, 401);
  assert.equal((await entrar("paulo@nexor.com", SENHA, ip)).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await entrar("paulo@nexor.com", "errada", ip)).status, 401, `falha ${i + 1} depois do acerto`);
  assert.equal((await entrar("paulo@nexor.com", "errada", ip)).status, 429);
});

test("2FA: 5 códigos errados encerram a etapa da senha e travam o 2FA da conta com Retry-After", async () => {
  relogio += 16 * 60_000;
  const c = cliente("203.0.113.4");
  assert.equal((await c("/api/entrar", { email: "paulo@nexor.com", senha: SENHA })).status, 200);
  const certo = codigoTotp(segredo, agora());
  const errado = certo === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await c("/api/totp", { codigo: errado })).status, 401);
  assert.match((await c("/api/totp", { codigo: certo })).dados.erro, /Entre com e-mail e senha/, "a sessão da etapa da senha acabou");
  assert.equal((await c("/api/entrar", { email: "paulo@nexor.com", senha: SENHA })).status, 200);
  const r = await c("/api/totp", { codigo: certo });
  assert.equal(r.status, 429, "o 2FA da conta continua travado");
  assert.ok(Number(r.espera) > 0 && Number(r.espera) <= 900);
  relogio += 16 * 60_000;
  assert.equal((await c("/api/entrar", { email: "paulo@nexor.com", senha: SENHA })).status, 200);
  assert.equal((await c("/api/totp", { codigo: codigoTotp(segredo, agora()) })).status, 200, "depois da janela entra");
});

test("módulo: Retry-After conta até a tentativa sair da janela, e a limpeza apaga o que venceu", () => {
  let t = 0;
  const l = criarLimites({ agora: () => t });
  try {
    for (let i = 0; i < 3; i++) {
      l.contar("k", 3, 60_000);
      t += 10_000;
    }
    assert.throws(() => l.contar("k", 3, 60_000), (e) => e.status === 429 && e.cabecalhos["Retry-After"] === "30");
    t = 60_000;
    assert.doesNotThrow(() => l.contar("k", 3, 60_000), "a primeira saiu da janela");
    t = 10 * 60_000;
    l.limpar();
    assert.equal(l.tamanho, 0);
  } finally {
    l.parar();
  }
});
