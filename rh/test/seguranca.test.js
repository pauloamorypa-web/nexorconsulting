/* Segurança: isolamento entre empresas, credenciais do app, uploads, links de candidatos, endereço da Gupy,
   sessões depois da troca de senha, IP atrás de proxy e cabeçalhos de segurança. */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ipCliente } from "../src/servidor.js";
import { enderecoExterno } from "../src/http/rotas-recrutamento.js";
import { CPF, CPF2, subir } from "./ajuda.js";

let s, rhA, rhB, colabA, colabB;

before(async () => {
  s = await subir({ cfg: { permitirCadastro: true } });
  rhA = s.cliente();
  rhB = s.cliente();
  assert.equal((await rhA.post("/api/cadastro", { razao_social: "Empresa A Ltda", cnpj: "11.222.333/0001-81", nome: "Ana A", email: "ana@a.com", senha: "senha-forte-1" })).status, 200);
  assert.equal((await rhB.post("/api/cadastro", { razao_social: "Empresa B Ltda", cnpj: "45.723.174/0001-10", nome: "Beto B", email: "beto@b.com", senha: "senha-forte-1" })).status, 200);
  colabA = (await rhA.post("/api/colaboradores", { nome: "Alice Alves", cpf: CPF, admissao: "2026-01-02", salario_centavos: 200000 })).dados;
  colabB = (await rhB.post("/api/colaboradores", { nome: "Bia Borges", cpf: CPF2, admissao: "2026-01-02", salario_centavos: 200000 })).dados;
});
after(() => s.fechar());

async function ativar(rh, colab, cpf) {
  const { codigo } = (await rh.post(`/api/colaboradores/${colab.id}/convite`)).dados;
  const app = s.cliente();
  assert.equal((await app.post("/api/app/ativar", { cpf, codigo })).status, 200);
  return app;
}

test("IP do cliente vem da direita do X-Forwarded-For", () => {
  const req = (xff) => ({ headers: xff ? { "x-forwarded-for": xff } : {}, socket: { remoteAddress: "10.0.0.9" } });
  assert.equal(ipCliente(req("1.1.1.1, 203.0.113.7"), 1), "203.0.113.7", "a entrada forjada pelo cliente é ignorada");
  assert.equal(ipCliente(req("1.1.1.1, 203.0.113.7, 10.1.1.1"), 2), "203.0.113.7");
  assert.equal(ipCliente(req("1.1.1.1"), 0), "10.0.0.9", "sem proxy, o cabeçalho não vale");
  assert.equal(ipCliente(req(), 1), "10.0.0.9");
});

test("cabeçalhos de segurança na API e nas páginas", async () => {
  for (const caminho of ["/api/estado", "/", "/vagas/feed/inexistente-1234.xml"]) {
    const r = await fetch(s.url + caminho);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", caminho);
    assert.match(r.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/, caminho);
  }
});

test("app: credencial de outro colaborador não pode ser sobrescrita", async () => {
  const appA = await ativar(rhA, colabA, CPF);
  const appB = await ativar(rhB, colabB, CPF2);
  const chave = { kty: "EC", crv: "P-256", ...(await crypto.subtle.exportKey("jwk", (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])).publicKey)) };
  const corpo = { id: "aparelho-da-alice-01", chave: { kty: chave.kty, crv: chave.crv, x: chave.x, y: chave.y }, hardware: true };
  assert.equal((await appA.post("/api/app/aparelho", corpo)).status, 200);
  assert.equal((await appB.post("/api/app/aparelho", corpo)).status, 409);
  assert.equal((await appA.get("/api/app/eu")).dados.ponto.aparelhos, 1, "a credencial da Alice continua dela");
  assert.equal((await appA.post("/api/app/aparelho", corpo)).status, 200, "o próprio dono pode recadastrar");
});

test("upload do RH não aceita colaborador de outra empresa", async () => {
  const r = await rhA.post(`/api/arquivos?colaborador=${colabB.id}`, Buffer.from("%PDF-1.4 x"), { "content-type": "application/pdf", "x-nome": "doc.pdf" });
  assert.equal(r.status, 404);
  const ok = await rhA.post(`/api/arquivos?colaborador=${colabA.id}`, Buffer.from("%PDF-1.4 x"), { "content-type": "application/pdf", "x-nome": "%E0%A4%A" });
  assert.equal(ok.status, 200, "nome malformado não derruba o envio");
  assert.equal(ok.dados.nome, "arquivo");
});

test("candidatura pública: link do LinkedIn só http(s); currículo sem colaborador é só do RH", async () => {
  const vaga = (await rhA.post("/api/vagas", { titulo: "Vendedor" })).dados;
  const empresaId = vaga.empresa_id;
  const base = { nome: "Caio", email: "caio@x.com", telefone: "11988887777", consentimento: true };
  let r = await s.cliente().post(`/api/publico/vagas/${empresaId}/${vaga.id}`, { ...base, linkedin: "javascript:alert(document.cookie)" });
  assert.equal(r.status, 400);
  r = await s.cliente().post(`/api/publico/vagas/${empresaId}/${vaga.id}`, { ...base, linkedin: "linkedin.com/in/caio", curriculo: { nome: "cv.pdf", tipo: "application/pdf", base64: Buffer.from("%PDF-1.4 cv").toString("base64") } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const cand = (await rhA.get("/api/candidatos")).dados.find((c) => c.nome === "Caio");
  assert.equal(cand.linkedin, "https://linkedin.com/in/caio", "sem esquema vira https://");
  assert.equal((await rhA.get(`/api/arquivos/${cand.curriculo}`)).status, 200);
  const deps = (await rhA.get("/api/departamentos")).dados;
  await rhA.post("/api/usuarios", { nome: "Gil Gestor", email: "gil@a.com", senha: "senha-gestor", papel: "gestor", departamento_id: deps[0].id });
  const g = s.cliente();
  assert.equal((await g.post("/api/entrar", { email: "gil@a.com", senha: "senha-gestor" })).status, 200);
  assert.equal((await g.get(`/api/arquivos/${cand.curriculo}`)).status, 404, "gestor não abre currículos");
});

test("Gupy: endereço da API precisa ser https público", async () => {
  for (const base of ["http://api.gupy.io/api/v1", "https://127.0.0.1/api", "https://169.254.169.254/latest", "https://localhost:8080", "https://[::1]/"]) {
    assert.equal((await rhA.put("/api/recrutamento/gupy", { token: "token-gupy-valido-123", base })).status, 400, base);
  }
  assert.equal(enderecoExterno("https://api.gupy.io/api/v1"), true);
  assert.equal((await rhA.put("/api/recrutamento/gupy", { token: "token-gupy-valido-123", base: "https://api.gupy.io/api/v1" })).status, 200);
});

test("trocar a senha encerra as outras sessões", async () => {
  const outra = s.cliente();
  assert.equal((await outra.post("/api/entrar", { email: "beto@b.com", senha: "senha-forte-1" })).status, 200);
  assert.equal((await outra.get("/api/eu")).status, 200);
  assert.equal((await rhB.put("/api/eu", { senha: "senha-nova-123", senha_atual: "senha-forte-1" })).status, 200);
  assert.equal((await outra.get("/api/eu")).status, 401, "a sessão antiga caiu");
  assert.equal((await rhB.get("/api/eu")).status, 200, "a sessão de quem trocou continua");
});
