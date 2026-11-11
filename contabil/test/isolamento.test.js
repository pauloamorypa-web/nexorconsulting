/* Isolamento no Nexor Contábil, rota por rota (ver test/isolamento-ajuda.js).
   Cada instalação atende UM escritório (o cadastro fecha depois da primeira conta). A separação que importa
   é entre as empresas clientes no portal: o usuário do portal da empresa B, com IDs da empresa A (entregas,
   documentos, pendências, chamados), recebe 403/404, não vê dados da A e não altera nada da A.
   - Sem sessão, toda rota fora de PUBLICAS responde 401.
   Falhas reais conhecidas ficam em PENDENTES (todo) e estão em docs/seguranca/revisao-completa.md. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { montarAplicacao } from "../src/servidor.js";
import { CNPJ_ESCRITORIO, CNPJ_MERCADO, CNPJ_PADARIA, PDF, iaFalsa, rede } from "./ajuda.js";
import { abrirLeitura, chamarComoB, chave, cliente, esquema, idsDaEmpresa, preencher, problemas, retrato, rotasDosFontes, rowidsBase } from "./isolamento-ajuda.js";

const MARCA = "MARCA-CLIENTE-A-7f3c";

const PUBLICAS = {
  "GET /api/estado": "só diz se o escritório já foi criado",
  "POST /api/cadastro": "só a primeira conta da instalação, com código de instalação",
  "POST /api/entrar": "login, com limite de tentativas",
  "POST /api/sair": "encerra a própria sessão",
  "GET /api/nexor/entrar": "link assinado pela Nexor Central (uso único)",
  "GET /api/portal/estado": "nome do escritório para a tela de entrada do portal",
  "GET /api/portal/convite/:token": "token do convite (aleatório, com validade)",
  "POST /api/portal/convite/:token": "token do convite: cria a senha do portal",
  "POST /api/portal/entrar": "login do portal, com limite de tentativas",
  "POST /api/portal/sair": "encerra a própria sessão do portal",
};

const PENDENTES = {};

const valorFixo = (n) => ({ cliente: undefined })[n];
const rotas = rotasDosFontes(new URL("../src", import.meta.url).pathname);
const ehPortal = (r) => r.caminho.startsWith("/api/portal/");

let s, url, db, portalB, idsA, base, marcadores, chavesEstrangeiras, opRetrato;
const ok = async (p, msg) => {
  const r = await p;
  assert.ok(r.status < 300, `${msg}: ${r.status} ${JSON.stringify(r.dados)}`);
  return r.dados;
};
async function enviar(cli, caminho, dados, tipo, nome) {
  const r = await fetch(url + caminho, { method: "POST", headers: { "x-nexor": "1", cookie: [...cli.cookies].map(([k, v]) => `${k}=${v}`).join("; "), "content-type": tipo, "x-nome": encodeURIComponent(nome) }, body: dados });
  const d = await r.json();
  assert.ok(r.status < 300, `${caminho}: ${r.status} ${JSON.stringify(d)}`);
  return d;
}
async function portalDe(eq, cli, email, senha) {
  const conv = await ok(eq.post(`/api/clientes/${cli.id}/portal`, { nome: `Usuário ${email}`, email }), "convite do portal");
  const p = cliente(url);
  await ok(p.post(`/api/portal/convite/${conv.link.split("/convite/")[1]}`, { senha }), "aceitar convite");
  return p;
}

before(async () => {
  const pasta = mkdtempSync(join(tmpdir(), "contabil-iso-"));
  const caminhoBanco = join(pasta, "contabil.db");
  const app = montarAplicacao({ cfg: { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste-chave-mestra", urlPublica: "https://contabil.teste" }, caminhoBanco, clienteIA: iaFalsa(), fetchFn: rede().fetchFn });
  await new Promise((r) => app.servidor.listen(0, r));
  url = `http://localhost:${app.servidor.address().port}`;
  s = { app, fechar: () => (app.fechar(), rmSync(pasta, { recursive: true, force: true })) };

  const eq = cliente(url);
  await ok(eq.post("/api/cadastro", { razao_social: "Contábil Exemplo Ltda", cnpj: CNPJ_ESCRITORIO, nome: "Marta", email: "marta@contabil.com", senha: "senha-forte-1" }), "cadastro");
  const cliA = await ok(eq.post("/api/clientes", { razao_social: `Padaria ${MARCA}`, cnpj: CNPJ_PADARIA, regime: "simples" }), "cliente A");
  const cliB = await ok(eq.post("/api/clientes", { razao_social: "Mercado B", cnpj: CNPJ_MERCADO, regime: "presumido" }), "cliente B");
  await eq.post(`/api/clientes/${cliA.id}/gerar`, {});
  const arq = await enviar(eq, "/api/arquivos", PDF, "application/pdf", `guia-${MARCA}.pdf`);
  await ok(eq.post("/api/entregas", { cliente_id: cliA.id, arquivo_id: arq.id, titulo: `Guia ${MARCA}`, tipo: "guia", avisar: false }), "entrega A");
  await enviar(eq, `/api/documentos?cliente=${cliA.id}`, PDF, "application/pdf", `doc-${MARCA}.pdf`);
  const portalA = await portalDe(eq, cliA, "ana@a.com", "senha-da-ana-1");
  await ok(portalA.post("/api/portal/chamados", { assunto: `Dúvida ${MARCA}`, texto: "Texto" }), "chamado A");
  await enviar(portalA, "/api/portal/documentos", PDF, "application/pdf", `nota-${MARCA}.pdf`);
  portalB = await portalDe(eq, cliB, "beto@b.com", "senha-do-beto-1");
  await app.ocioso?.();

  db = abrirLeitura(caminhoBanco);
  const clienteA = cliA.id;
  idsA = idsDaEmpresa(db, { coluna: "cliente_id", idA: clienteA });
  idsA.set(clienteA, "clientes");
  chavesEstrangeiras = [...new Set(Object.values(esquema(db)).flat().filter((c) => c.endsWith("_id") && c !== "empresa_id"))];
  opRetrato = { coluna: "cliente_id", idA: clienteA, ignorar: ["sessoes", "envios", "uso_ia", "auditoria", "nexor_ajustes", "aprendizado"], filtros: { clientes: "id = ?" } };
  for (const [tab, cols] of Object.entries(esquema(db))) if (!cols.includes("cliente_id") && !opRetrato.filtros[tab] && !opRetrato.ignorar.includes(tab)) opRetrato.ignorar.push(tab);
  base = retrato(db, opRetrato);
  opRetrato.linhasBase = rowidsBase(base);
  base = retrato(db, opRetrato);
  marcadores = [MARCA, CNPJ_PADARIA];
});
after(() => {
  db?.close();
  s?.fechar();
});

test("a lista de rotas foi lida dos fontes", () => {
  assert.ok(rotas.length > 70, `só ${rotas.length} rotas encontradas`);
  for (const k of Object.keys(PUBLICAS)) assert.ok(rotas.some((r) => chave(r) === k), `rota pública listada que não existe mais: ${k}`);
});

describe("sem sessão: 401 (exceto as públicas)", () => {
  for (const r of rotas) {
    const k = chave(r);
    test(k, { todo: PENDENTES[`anonimo ${k}`] }, async () => {
      const resp = await cliente(url).chamar(r.metodo, preencher(r.caminho, () => "id-qualquer-123"), r.metodo === "GET" ? undefined : {});
      assert.ok(resp.status !== 405 && !(resp.status === 404 && /"não encontrado"/.test(resp.bruto)), `${k} não está registrada no servidor (${resp.status})`);
      if (!(k in PUBLICAS)) assert.equal(resp.status, 401, `${k} sem sessão respondeu ${resp.status}: ${resp.bruto.slice(0, 200)}`);
    });
  }
});

describe("portal da empresa B com IDs da empresa A: 403/404, sem vazar nem alterar", () => {
  for (const r of rotas.filter(ehPortal)) {
    const k = chave(r);
    if (k in PUBLICAS) continue;
    test(k, { todo: PENDENTES[k] }, async () => {
      const rodar = () => chamarComoB({ rota: r, valorFixo, idsA, cli: portalB, retratoAgora: () => retrato(db, opRetrato), retratoBase: base, marcadores, chavesEstrangeiras });
      let res = await rodar();
      if (res.resultados.some((x) => x.status === 401)) {
        portalB = cliente(url);
        await ok(portalB.post("/api/portal/entrar", { email: "beto@b.com", senha: "senha-do-beto-1" }), "login portal B");
        res = await rodar();
      }
      const p = problemas(res);
      if (p.length) base = retrato(db, opRetrato);
      assert.deepEqual(p, [], `${k}:\n${p.join("\n")}`);
    });
  }
});

test("o preparo criou dados da empresa A", () => {
  const tabelas = new Set(idsA.values());
  for (const t of ["entregas", "documentos", "chamados", "pendencias", "portal_usuarios"]) assert.ok(tabelas.has(t), `a empresa A não tem ${t}`);
});
