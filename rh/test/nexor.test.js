/* Nexor RH ligado à Nexor Central de verdade (as duas no mesmo processo):
   licença assinada, régua de cobrança aplicada no sistema do cliente, ponto que continua no bloqueio,
   acesso do Suporte Nexor por link de uso único e itens escondidos pelo Suporte. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { lerConfig as configCentral } from "../../central/src/config.js";
import { montarCentral } from "../../central/src/servidor.js";
import { recusaPorLicenca } from "../src/nexor/politica.js";
import { CPF, criarCliente, subir } from "./ajuda.js";

const DIA = 86400_000;
let relogio = Date.parse("2026-11-04T12:00:00-03:00");
const agora = () => relogio;
let central, pastaCentral, rh, adm, sistema, cliente, colab;
const TOKEN = "nxs_" + "t".repeat(43);

before(async () => {
  pastaCentral = mkdtempSync(join(tmpdir(), "nexor-central-rh-"));
  central = montarCentral({ cfg: { ...configCentral({}), pastaDados: pastaCentral, chaveMestra: "x" }, caminhoBanco: ":memory:", agora });
  await new Promise((r) => central.servidor.listen(0, r));
  const urlCentral = `http://localhost:${central.servidor.address().port}`;
  cliente = central.repo.inserir("clientes", { razao_social: "Padaria Pão Dourado Ltda", cnpj: "11222333000181", valor_centavos: 49900, dia_vencimento: 10, inicio_cobranca: "2026-11-01", regras: {} });
  sistema = central.repo.inserir("sistemas", { cliente_id: cliente.id, produto: "rh", url: "https://rh.teste", token_hash: createHash("sha256").update(TOKEN).digest("hex"), prefixo: TOKEN.slice(0, 10) });
  await central.rotina();
  rh = await subir({ agora, cfg: { nexor: { central: urlCentral, instancia: sistema.id, token: TOKEN, chavePublica: central.assinador.chavePublica, intervaloMin: 5 } } });
  adm = rh.cliente();
  assert.equal((await adm.post("/api/cadastro", { aceite_termos: true, razao_social: "Padaria Pão Dourado Ltda", cnpj: "11.222.333/0001-81", nome: "Dona Rosa", email: "rosa@pao.com", senha: "senha-forte-1" })).status, 200);
  colab = (await adm.post("/api/colaboradores", { nome: "Carlos Lima", cpf: CPF, admissao: "2026-01-02", salario_centavos: 200000 })).dados;
});
after(() => {
  rh.fechar();
  central.fechar();
  rmSync(pastaCentral, { recursive: true, force: true });
});

const sincronizar = () => rh.app.central.sincronizar();
const eu = async (c = adm) => (await c.get("/api/eu")).dados;
async function avancar(dias) {
  relogio += dias * DIA;
  // a sessão do painel dura 14 dias: entra de novo para não depender disso
  adm = rh.cliente();
  assert.equal((await adm.post("/api/entrar", { email: "rosa@pao.com", senha: "senha-forte-1" })).status, 200);
}

test("política: o que cada situação permite", () => {
  const lic = (situacao, manter_ponto = true) => ({ situacao, mensagem: "m", manter_ponto });
  assert.equal(recusaPorLicenca(lic("aviso"), "POST", "/api/colaboradores"), null);
  assert.equal(recusaPorLicenca(lic("restrito"), "GET", "/api/colaboradores"), null);
  assert.ok(recusaPorLicenca(lic("restrito"), "POST", "/api/colaboradores"));
  assert.equal(recusaPorLicenca(lic("restrito"), "POST", "/api/app/ponto"), null);
  assert.ok(recusaPorLicenca(lic("bloqueado"), "GET", "/api/colaboradores"));
  assert.equal(recusaPorLicenca(lic("bloqueado"), "GET", "/api/ponto/afd"), null, "arquivo legal do ponto continua");
  assert.equal(recusaPorLicenca(lic("bloqueado"), "POST", "/api/app/ponto"), null, "o ponto continua por padrão");
  assert.ok(recusaPorLicenca(lic("bloqueado", false), "POST", "/api/app/ponto"));
  assert.ok(recusaPorLicenca(lic("bloqueado"), "GET", "/api/app/holerites"));
  assert.equal(recusaPorLicenca(lic("bloqueado"), "POST", "/api/entrar"), null);
});

test("em dia: sistema livre e a Central recebe a saúde (sem dados pessoais)", async () => {
  assert.equal((await sincronizar()).situacao, "ativo");
  assert.equal((await eu()).licenca.situacao, "ativo");
  const s = central.repo.obter("sistemas", sistema.id);
  assert.equal(s.saude.colaboradores, 1);
  assert.equal(s.saude.usuarios, 1);
  assert.equal(s.versao, "1.0.0");
  assert.ok(!JSON.stringify(s.saude).includes("Carlos"), "nenhum nome sai da instalação");
});

test("atraso: aviso, depois somente leitura, depois bloqueio; o pagamento libera sozinho", async () => {
  await avancar(7); // 11/11, fatura de 10/11 em aberto
  await sincronizar();
  let e = await eu();
  assert.equal(e.licenca.situacao, "aviso");
  assert.match(e.licenca.mensagem, /10\/11\/2026/);
  assert.equal((await adm.put(`/api/colaboradores/${colab.id}`, { telefone: "34999990000" })).status, 200, "no aviso tudo funciona");

  await avancar(10); // 21/11
  await sincronizar();
  assert.equal((await eu()).licenca.situacao, "restrito");
  const r = await adm.put(`/api/colaboradores/${colab.id}`, { telefone: "34999990001" });
  assert.equal(r.status, 423);
  assert.equal(r.dados.codigo, "licenca");
  assert.equal((await adm.get("/api/colaboradores")).status, 200, "consulta continua");

  await avancar(10); // 01/12
  await sincronizar();
  assert.equal((await eu()).licenca.situacao, "bloqueado");
  assert.equal((await adm.get("/api/colaboradores")).status, 423);
  assert.equal((await adm.get("/api/ponto/afd?de=2026-11-01&ate=2026-11-30")).status, 200, "AFD continua disponível para a fiscalização");

  assert.equal((await rh.cliente().get("/api/app/servidor")).status, 200, "o app do trabalhador continua respondendo (ponto mantido)");

  // pagou na Central → volta no próximo contato
  const f = central.repo.lista("faturas", "WHERE cliente_id = ? AND status = 'aberta' ORDER BY vencimento", cliente.id)[0];
  central.repo.atualizar("faturas", f.id, { status: "paga", pago_em: "2026-12-01", forma: "pix" });
  await sincronizar();
  assert.notEqual((await eu()).licenca.situacao, "bloqueado");
  assert.equal((await adm.get("/api/colaboradores")).status, 200);
});

test("licença forjada ou de outra instalação é ignorada", async () => {
  const antes = rh.app.central.estado().situacao;
  writeFileSync(join(rh.app.cfg.pastaDados, "nexor-licenca.json"), JSON.stringify({ token: Buffer.from(JSON.stringify({ tipo: "licenca", inst: sistema.id, situacao: "bloqueado", valido_ate: relogio + DIA })).toString("base64url") + ".assinaturafalsa" }));
  assert.equal(rh.app.central.estado().origem, "aguardando", "assinatura inválida não vale");
  await sincronizar();
  assert.equal(rh.app.central.estado().situacao, antes);
});

test("sem contato com a Central por mais de 15 dias: somente leitura, nunca bloqueio", async () => {
  await avancar(16);
  const st = rh.app.central.estado();
  assert.equal(st.origem, "vencida");
  assert.equal(st.situacao, "restrito");
  assert.match(st.mensagem, /Sem contato/);
  // a Central volta: a fatura de dezembro venceu e foi paga
  for (const f of central.repo.lista("faturas", "WHERE status = 'aberta'")) central.repo.atualizar("faturas", f.id, { status: "paga", pago_em: "2026-12-10" });
  await sincronizar();
  assert.equal(rh.app.central.estado().situacao, "ativo");
});

test("Suporte Nexor entra pelo link de uso único, não aparece para o cliente e fica na auditoria", async () => {
  const link = (extra = {}) => central.assinador.assinar({ v: 1, tipo: "acesso", inst: sistema.id, nome: "Paulo", email: "paulo@nexor.com", exp: relogio + 120_000, nonce: `n-${Math.random()}`, ...extra });
  const sup = criarCliente(rh.url);
  const t = link();
  const r = await fetch(`${rh.url}/api/nexor/entrar?t=${t}`, { redirect: "manual" });
  assert.equal(r.status, 302);
  const cookie = r.headers.getSetCookie()[0].split(";")[0];
  assert.equal((await fetch(`${rh.url}/api/nexor/entrar?t=${t}`, { redirect: "manual" })).status, 403, "uso único");
  assert.equal((await fetch(`${rh.url}/api/nexor/entrar?t=${link({ exp: relogio - 1 })}`, { redirect: "manual" })).status, 403, "vencido");
  assert.equal((await fetch(`${rh.url}/api/nexor/entrar?t=${link({ inst: "outra" })}`, { redirect: "manual" })).status, 403, "de outra instalação");

  const chamar = (metodo, caminho, corpo) => fetch(rh.url + caminho, { method: metodo, headers: { cookie, "x-nexor": "1", "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }).then(async (x) => ({ status: x.status, dados: await x.json() }));
  const meu = await chamar("GET", "/api/eu");
  assert.equal(meu.dados.usuario.nexor, true);
  assert.equal(meu.dados.usuario.papel, "admin");
  assert.match(meu.dados.usuario.nome, /Suporte Nexor · Paulo/);
  assert.ok(sup);

  const usuarios = (await adm.get("/api/usuarios")).dados;
  assert.ok(usuarios.every((u) => !u.nexor), "o cliente não vê o usuário de suporte");
  const nexorId = meu.dados.usuario.id;
  assert.equal((await adm.put(`/api/usuarios/${nexorId}`, { ativo: false })).status, 404, "nem consegue alterá-lo");
  assert.equal((await adm.get("/api/nexor/ajustes")).status, 403, "área do desenvolvedor é só do Suporte Nexor");
  assert.equal((await rh.cliente().post("/api/entrar", { email: `suporte-${meu.dados.empresa.id}@nexor.invalid`, senha: "!sem-senha" })).status, 401, "não entra por senha");
  const aud = (await adm.get("/api/auditoria")).dados;
  assert.ok((aud.itens ?? aud).some((a) => a.acao === "acesso_suporte_nexor"), "o acesso aparece na auditoria do cliente");

  // Esconde a folha e as integrações do cliente
  const aj = await chamar("GET", "/api/nexor/ajustes");
  assert.ok(aj.dados.catalogo.modulos["modulo.folha"]);
  assert.equal((await chamar("PUT", "/api/nexor/ajustes", { ocultos: ["inexistente"] })).status, 400);
  assert.equal((await chamar("PUT", "/api/nexor/ajustes", { ocultos: ["modulo.folha", "config.integracoes"] })).status, 200);
  assert.deepEqual((await eu()).ocultos, ["modulo.folha", "config.integracoes"]);
  assert.equal((await adm.get("/api/folhas")).status, 403);
  assert.equal((await adm.post("/api/integracoes", { nome: "x" })).status, 403);
  assert.equal((await chamar("GET", "/api/folhas")).status, 200, "o Suporte Nexor continua vendo tudo");
  await chamar("PUT", "/api/nexor/ajustes", { ocultos: ["modulo.folha", "config.integracoes", "campo.registro_inpi"] });
  assert.equal((await adm.put("/api/empresa", { config: { registro_inpi: "123" } })).status, 403, "campo escondido não muda nem pela API");
  assert.equal((await adm.put("/api/empresa", { nome_fantasia: "Pão Dourado" })).status, 200);
  assert.equal((await chamar("PUT", "/api/empresa", { config: { registro_inpi: "BR512026000001" } })).status, 200, "o Suporte Nexor altera");

  // Bloqueado não barra o Suporte Nexor
  central.repo.atualizar("clientes", cliente.id, { bloqueio_manual: "teste" });
  await sincronizar();
  assert.equal((await adm.get("/api/colaboradores")).status, 423);
  assert.equal((await chamar("GET", "/api/colaboradores")).status, 200);
  central.repo.atualizar("clientes", cliente.id, { bloqueio_manual: null });
  await sincronizar();
});

test("Suporte Nexor criado antes não conta como primeiro acesso", async () => {
  assert.equal((await rh.cliente().get("/api/estado")).dados.primeiroAcesso, false);
});
