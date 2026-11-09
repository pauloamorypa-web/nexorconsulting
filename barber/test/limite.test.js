/* Limite de tentativas (LGPD art. 46, OWASP ASVS 2.2): login do painel e código do app por IP e por conta,
   429 com Retry-After, e o acerto zera o contador. Cada teste usa um IP próprio (X-Forwarded-For, TRUST_PROXY=1). */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { criarLimites } from "../src/http/limite.js";
import { barbeariaPronta, subir } from "./ajuda.js";

const SENHA = "senha-forte-1";
let s;
before(async () => {
  s = await subir();
  await barbeariaPronta(s);
});
after(() => s.fechar());

async function chamar(caminho, corpo, ip) {
  const r = await fetch(`${s.url}${caminho}`, { method: "POST", headers: { "content-type": "application/json", "x-nexor": "1", "x-forwarded-for": ip }, body: JSON.stringify(corpo) });
  return { status: r.status, espera: r.headers.get("retry-after"), dados: await r.json() };
}
const entrar = (email, senha, ip) => chamar("/api/entrar", { email, senha }, ip);

test("5 senhas erradas: a 6ª tentativa recebe 429 com Retry-After, mesmo com a senha certa", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await entrar("dono@navalha.test", "errada", "203.0.113.1")).status, 401);
  const r = await entrar("dono@navalha.test", SENHA, "203.0.113.1");
  assert.equal(r.status, 429);
  assert.ok(Number(r.espera) > 0 && Number(r.espera) <= 900, `Retry-After: ${r.espera}`);
  assert.match(r.dados.erro, /Muitas tentativas/);
  // Conta que não existe recebe a mesma resposta: o limite não revela quais e-mails têm cadastro
  for (let i = 0; i < 5; i++) assert.equal((await entrar("ninguem@navalha.test", "errada", "203.0.113.11")).status, 401);
  const n = await entrar("ninguem@navalha.test", "errada", "203.0.113.11");
  assert.equal(n.status, 429);
  assert.equal(n.dados.erro, r.dados.erro);
});

test("outra conta no mesmo IP continua liberada até o limite por IP (20)", async () => {
  const ip = "203.0.113.2";
  for (let i = 0; i < 5; i++) assert.equal((await entrar("alvo@navalha.test", "errada", ip)).status, 401);
  assert.equal((await entrar("alvo@navalha.test", "errada", ip)).status, 429, "a conta travou");
  for (let i = 6; i < 20; i++) assert.equal((await entrar(`outra${i}@navalha.test`, "errada", ip)).status, 401, `tentativa ${i + 1}`);
  const r = await entrar("mais-uma@navalha.test", "errada", ip);
  assert.equal(r.status, 429, "o IP travou");
  assert.ok(Number(r.espera) > 0);
  assert.equal((await entrar("mais-uma@navalha.test", "errada", "203.0.113.22")).status, 401, "outro IP não é afetado");
});

test("login certo zera o contador da conta", async () => {
  const s2 = await subir();
  try {
    await barbeariaPronta(s2);
    const entrar2 = (senha) => fetch(`${s2.url}/api/entrar`, { method: "POST", headers: { "content-type": "application/json", "x-nexor": "1", "x-forwarded-for": "203.0.113.3" }, body: JSON.stringify({ email: "dono@navalha.test", senha }) }).then((r) => r.status);
    for (let i = 0; i < 4; i++) assert.equal(await entrar2("errada"), 401);
    assert.equal(await entrar2(SENHA), 200);
    for (let i = 0; i < 5; i++) assert.equal(await entrar2("errada"), 401, `falha ${i + 1} depois do acerto`);
    assert.equal(await entrar2("errada"), 429);
  } finally {
    s2.fechar();
  }
});

test("código do app: 5 erros cancelam o código e travam o celular com Retry-After; outro celular segue", async () => {
  const ip = "198.51.100.4";
  assert.equal((await chamar("/api/app/codigo", { fone: "34 98888-1111", canal: "sms" }, ip)).status, 200);
  const certo = s.rede.ultimoCodigo();
  const errado = certo === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await chamar("/api/app/verificar", { fone: "34988881111", codigo: errado }, ip)).status, 400);
  assert.equal(s.app.repo.um("SELECT COUNT(*) n FROM codigos WHERE destino = ?", "+5534988881111").n, 0, "código cancelado no 5º erro");
  const r = await chamar("/api/app/verificar", { fone: "(34) 98888-1111", codigo: certo }, ip);
  assert.equal(r.status, 429, "o mesmo celular, escrito de outro jeito, continua travado");
  assert.ok(Number(r.espera) > 0 && Number(r.espera) <= 900);
  // Outro celular no mesmo IP: liberado, e o acerto entra
  assert.equal((await chamar("/api/app/codigo", { fone: "34988882222", canal: "sms" }, ip)).status, 200);
  const certo2 = s.rede.ultimoCodigo();
  assert.equal((await chamar("/api/app/verificar", { fone: "34988882222", codigo: certo2 === "000000" ? "111111" : "000000" }, ip)).status, 400);
  assert.equal((await chamar("/api/app/verificar", { fone: "34988882222", codigo: certo2 }, ip)).status, 200);
});

test("código do app: no máximo 5 códigos por hora para o mesmo celular, com Retry-After", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await chamar("/api/app/codigo", { fone: "34988883333", canal: "sms" }, `198.51.100.${10 + i}`)).status, 200);
  const r = await chamar("/api/app/codigo", { fone: "34988883333", canal: "sms" }, "198.51.100.20");
  assert.equal(r.status, 429, "trocar de IP não ajuda");
  assert.ok(Number(r.espera) > 0 && Number(r.espera) <= 3600);
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
