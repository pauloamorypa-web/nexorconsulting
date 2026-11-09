/* Limite de tentativas de login (LGPD art. 46, OWASP ASVS 2.2): por IP e por conta, 429 com Retry-After,
   e o login certo zera o contador da conta. Cada teste usa um IP próprio (X-Forwarded-For, TRUST_PROXY=1). */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { criarLimites } from "../src/http/limite.js";
import { subir } from "./ajuda.js";

let s;
const SENHA = "senha-forte-1";
before(async () => {
  s = await subir();
  const r = await s.cliente().post("/api/cadastro", { razao_social: "Empresa Teste Ltda", cnpj: "11.222.333/0001-81", nome: "Ana RH", email: "ana@teste.com", senha: SENHA });
  assert.equal(r.status, 200);
});
after(() => s.fechar());

async function entrar(email, senha, ip) {
  const r = await fetch(`${s.url}/api/entrar`, { method: "POST", headers: { "content-type": "application/json", "x-nexor": "1", "x-forwarded-for": ip }, body: JSON.stringify({ email, senha }) });
  return { status: r.status, espera: r.headers.get("retry-after"), dados: await r.json() };
}

test("5 senhas erradas: a 6ª tentativa recebe 429 com Retry-After, mesmo com a senha certa", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await entrar("ana@teste.com", "errada", "203.0.113.1")).status, 401);
  const r = await entrar("ana@teste.com", SENHA, "203.0.113.1");
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
  // 6 tentativas já feitas neste IP: outras contas seguem até 20
  for (let i = 6; i < 20; i++) assert.equal((await entrar(`outra${i}@teste.com`, "errada", ip)).status, 401, `tentativa ${i + 1}`);
  const r = await entrar("mais-uma@teste.com", "errada", ip);
  assert.equal(r.status, 429, "o IP travou");
  assert.ok(Number(r.espera) > 0);
  assert.equal((await entrar("mais-uma@teste.com", "errada", "203.0.113.22")).status, 401, "outro IP não é afetado");
});

test("login certo zera o contador da conta", async () => {
  // Servidor novo: a conta do primeiro teste continua travada por 15 minutos
  const s2 = await subir();
  try {
    assert.equal((await s2.cliente().post("/api/cadastro", { razao_social: "Outra Ltda", cnpj: "11.222.333/0001-81", nome: "Bia", email: "bia@teste.com", senha: SENHA })).status, 200);
    const entrar2 = (senha) => fetch(`${s2.url}/api/entrar`, { method: "POST", headers: { "content-type": "application/json", "x-nexor": "1", "x-forwarded-for": "203.0.113.3" }, body: JSON.stringify({ email: "bia@teste.com", senha }) }).then((r) => r.status);
    for (let i = 0; i < 4; i++) assert.equal(await entrar2("errada"), 401);
    assert.equal(await entrar2(SENHA), 200);
    for (let i = 0; i < 5; i++) assert.equal(await entrar2("errada"), 401, `falha ${i + 1} depois do acerto`);
    assert.equal(await entrar2("errada"), 429);
  } finally {
    s2.fechar();
  }
});

test("ativação do app: 5 códigos errados para o CPF invalidam o código", async () => {
  const s3 = await subir();
  try {
    const rh = s3.cliente();
    assert.equal((await rh.post("/api/cadastro", { razao_social: "Empresa App Ltda", cnpj: "11.222.333/0001-81", nome: "Ana", email: "app@teste.com", senha: SENHA })).status, 200);
    const col = await rh.post("/api/colaboradores", { nome: "João Silva", cpf: "529.982.247-25", admissao: "2026-01-05", salario_centavos: 250000 });
    assert.equal(col.status, 200, JSON.stringify(col.dados));
    const conv = await rh.post(`/api/colaboradores/${col.dados.id}/convite`, {});
    assert.equal(conv.status, 200, JSON.stringify(conv.dados));
    const codigo = conv.dados.codigo;
    const errado = codigo === "000000" ? "111111" : "000000";
    const ativar = (c) => s3.cliente().post("/api/app/ativar", { cpf: "529.982.247-25", codigo: c }, { "x-forwarded-for": "198.51.100.7" });
    for (let i = 0; i < 5; i++) assert.equal((await ativar(errado)).status, 401);
    const r = await ativar(codigo);
    assert.equal(r.status, 429);
    assert.ok(Number(r.cabecalhos.get("retry-after")) > 0);
    // O código foi invalidado: mesmo depois do bloqueio, o certo não vale mais (o RH gera outro)
    assert.equal(s3.app.repo.um("SELECT COUNT(*) n FROM convites_app WHERE colaborador_id = ?", col.dados.id).n, 0);
  } finally {
    s3.fechar();
  }
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
