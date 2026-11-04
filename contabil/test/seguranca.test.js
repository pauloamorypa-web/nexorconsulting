/* Segurança: portal isolado por empresa, CSRF, tipos de arquivo, perfis, código de instalação, webhook assinado,
   arquivos criptografados no disco e cabeçalhos. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { CNPJ_ESCRITORIO, CNPJ_MERCADO, CNPJ_PADARIA, PDF, msgWhats, subir } from "./ajuda.js";

let s, eq, cliA, cliB, portalA, entregaB, docB;

before(async () => {
  s = await subir();
  eq = s.cliente();
  await eq.post("/api/cadastro", { razao_social: "Contábil Exemplo Ltda", cnpj: CNPJ_ESCRITORIO, nome: "Marta", email: "marta@contabil.com", senha: "senha-forte-1" });
  cliA = (await eq.post("/api/clientes", { razao_social: "Padaria A", cnpj: CNPJ_PADARIA, regime: "simples" })).dados;
  cliB = (await eq.post("/api/clientes", { razao_social: "Mercado B", cnpj: CNPJ_MERCADO, regime: "presumido" })).dados;
  const conv = await eq.post(`/api/clientes/${cliA.id}/portal`, { nome: "Ana", email: "ana@a.com" });
  portalA = s.cliente();
  await portalA.post(`/api/portal/convite/${conv.dados.link.split("/convite/")[1]}`, { senha: "senha-da-ana" });
  const arq = await eq.enviar("/api/arquivos", PDF, "application/pdf", "guia-b.pdf");
  entregaB = (await eq.post("/api/entregas", { cliente_id: cliB.id, arquivo_id: arq.dados.id, titulo: "Guia B", tipo: "guia", avisar: false })).dados;
  docB = (await eq.enviar(`/api/documentos?cliente=${cliB.id}`, PDF, "application/pdf", "doc-b.pdf")).dados;
  await s.app.ocioso();
});
after(() => s.fechar());

test("portal: um cliente nunca vê os dados de outro", async () => {
  assert.equal((await portalA.get(`/api/portal/entregas/${entregaB.id}/arquivo`)).status, 404);
  assert.equal((await portalA.post(`/api/portal/entregas/${entregaB.id}/paga`)).status, 404);
  assert.equal((await portalA.get("/api/portal/entregas")).dados.length, 0);
  const pendB = (await eq.get(`/api/pendencias?cliente=${cliB.id}`)).dados[0];
  assert.equal((await portalA.enviar(`/api/portal/documentos?pendencia=${pendB.id}`, PDF, "application/pdf", "x.pdf")).status, 404, "não cumpre pendência de outra empresa");
  assert.ok((await portalA.get("/api/portal/documentos")).dados.every((d) => d.id !== docB.id));
  assert.equal((await portalA.get("/api/clientes")).status, 401, "sessão do portal não abre o painel");
  assert.equal((await eq.get("/api/portal/eu")).status, 401, "sessão do painel não abre o portal");
});

test("pedido sem o cabeçalho do sistema é recusado (CSRF)", async () => {
  const r = await fetch(`${s.url}/api/portal/chamados`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assunto: "x", texto: "y" }) });
  assert.equal(r.status, 403);
});

test("arquivo disfarçado e tipo proibido são recusados; arquivos ficam criptografados no disco", async () => {
  const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100)]);
  assert.equal((await portalA.enviar("/api/portal/documentos", exe, "application/pdf", "nota.pdf")).status, 415, "um executável com nome .pdf não passa");
  assert.equal((await portalA.enviar("/api/portal/documentos", exe, "application/x-msdownload", "virus.exe")).status, 415);
  assert.equal((await portalA.enviar("/api/portal/documentos", Buffer.alloc(0), "application/pdf", "vazio.pdf")).status, 400);
  const pasta = join(s.app.cfg.pastaDados, "arquivos");
  for (const f of readdirSync(pasta)) assert.ok(!readFileSync(join(pasta, f), "utf8").includes("%PDF"), "conteúdo cifrado");
});

test("perfil equipe não mexe nas configurações nem na equipe", async () => {
  await eq.post("/api/usuarios", { nome: "João", email: "joao@contabil.com", senha: "senha-forte-2", papel: "equipe", departamento: "fiscal" });
  const joao = s.cliente();
  assert.equal((await joao.post("/api/entrar", { email: "joao@contabil.com", senha: "senha-forte-2" })).status, 200);
  assert.equal((await joao.get("/api/clientes")).status, 200);
  assert.equal((await joao.put("/api/canais", { email: { chave: "x" } })).status, 403);
  assert.equal((await joao.post("/api/usuarios", { nome: "X", email: "x@x.com", senha: "senha-forte-3", papel: "admin", departamento: "geral" })).status, 403);
  assert.equal((await joao.get("/api/auditoria")).status, 403);
  assert.equal((await eq.put(`/api/usuarios/${(await eq.get("/api/eu")).dados.usuario.id}`, { ativo: false })).status, 400, "o dono não se desativa");
});

test("login: senha errada, limite de tentativas e sessão encerrada ao trocar a senha", async () => {
  const c = s.cliente();
  for (let i = 0; i < 8; i++) await c.post("/api/entrar", { email: "ninguem@x.com", senha: "errada" });
  assert.equal((await c.post("/api/entrar", { email: "ninguem@x.com", senha: "errada" })).status, 429);
  const p2 = s.cliente();
  assert.equal((await p2.post("/api/portal/entrar", { email: "ana@a.com", senha: "senha-da-ana" })).status, 200);
  assert.equal((await portalA.put("/api/portal/senha", { atual: "senha-da-ana", nova: "nova-senha-ana" })).status, 200);
  assert.equal((await p2.get("/api/portal/eu")).status, 401, "a outra sessão caiu");
  assert.equal((await portalA.get("/api/portal/eu")).status, 200);
});

test("webhook do WhatsApp só aceita assinatura da Meta", async () => {
  const corpo = JSON.stringify(msgWhats("5534999990001", { texto: "oi" }));
  const r = await fetch(`${s.url}/webhook/whatsapp`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body: corpo });
  assert.equal(r.status, 401);
  assert.equal((await fetch(`${s.url}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`)).status, 403);
});

test("cabeçalhos de segurança", async () => {
  const r = await fetch(`${s.url}/`);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.match(r.headers.get("content-security-policy"), /script-src 'self'/);
  const arq = await fetch(`${s.url}/api/documentos/${docB.id}/arquivo`, { headers: { cookie: "" } });
  assert.equal(arq.status, 401);
});

test("instalação em produção exige o código de instalação para criar o primeiro usuário", async () => {
  const p = await subir({ cfg: { producao: true, urlPublica: "https://contabil.teste", codigoInstalacao: "ABCD2345" } });
  try {
    const c = p.cliente();
    const dados = { razao_social: "X Ltda", cnpj: CNPJ_ESCRITORIO, nome: "X", email: "x@x.com", senha: "senha-forte-1" };
    assert.equal((await c.post("/api/cadastro", dados)).status, 403);
    assert.equal((await c.post("/api/cadastro", { ...dados, codigo_instalacao: "ABCD2345" })).status, 200);
    assert.equal((await s.cliente().post("/api/cadastro", dados)).status, 403, "e só o primeiro");
  } finally {
    p.fechar();
  }
  await assert.rejects(subir({ cfg: { producao: true, urlPublica: "http://inseguro" } }), /https/, "produção sem HTTPS não sobe");
});
