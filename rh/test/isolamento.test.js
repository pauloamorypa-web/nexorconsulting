/* Isolamento entre empresas no Nexor RH, rota por rota (ver test/isolamento-ajuda.js).
   - Sem sessão, toda rota fora de PUBLICAS responde 401.
   - Como a empresa B (painel e app do trabalhador), com IDs da empresa A, responde 403/404, não devolve dados
     da A e não altera nada da A.
   Falhas reais conhecidas ficam em PENDENTES (marcadas como todo) e estão em docs/seguranca/revisao-completa.md. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { montarAplicacao } from "../src/servidor.js";
import { abrirLeitura, chamarComoB, chave, cliente, esquema, idsDaEmpresa, nomesParametros, preencher, problemas, retrato, rotasDosFontes, rowidsBase } from "./isolamento-ajuda.js";

const CPF_A = "52998224725";
const CPF_B = "11144477735";
const MARCA = "MARCA-EMPRESA-A-7f3c";

/* Rotas montadas com texto variável (r.get(`/api/${caminho}`) e o prefixo da API de integração) */
const EXTRAS = [
  ...["departamentos", "cargos", "jornadas", "feriados"].flatMap((c) => [
    { metodo: "GET", caminho: `/api/${c}` },
    { metodo: "POST", caminho: `/api/${c}` },
    { metodo: "PUT", caminho: `/api/${c}/:id` },
    { metodo: "DELETE", caminho: `/api/${c}/:id` },
  ]),
  ...["/empresa", "/colaboradores", "/presenca", "/ausencias"].map((c) => ({ metodo: "GET", caminho: `/api/integracao/v1${c}` })),
];

/* Rotas sem sessão do painel nem do app, de propósito. Cada uma tem sua própria proteção, indicada ao lado. */
const PUBLICAS = {
  "GET /api/estado": "só diz se há conta criada e se o cadastro está aberto",
  "POST /api/cadastro": "fechado depois da primeira conta (ALLOW_SIGNUP) e com código de instalação",
  "POST /api/entrar": "login, com limite de tentativas",
  "POST /api/sair": "encerra a própria sessão",
  "GET /api/app/servidor": "o app confere se o endereço é um Nexor RH",
  "POST /api/app/ativar": "CPF + código de convite, com limite de tentativas",
  "GET /api/nexor/entrar": "link assinado pela Nexor Central (uso único)",
  "GET /api/quiosque/qr": "token do quiosque no cabeçalho x-quiosque",
  "POST /api/quiosque/ponto": "token do quiosque + CPF e PIN",
  "GET /api/publico/vagas/:empresa": "vagas abertas, públicas por natureza",
  "POST /api/publico/vagas/:empresa/:vaga": "candidatura pública",
  "POST /api/publico/recrutamento/:empresa/:fonte": "webhook com token da integração",
  "GET /api/integracao/v1/empresa": "chave de integração nxr_ (Bearer)",
  "GET /api/integracao/v1/colaboradores": "chave de integração nxr_ (Bearer)",
  "GET /api/integracao/v1/presenca": "chave de integração nxr_ (Bearer)",
  "GET /api/integracao/v1/ausencias": "chave de integração nxr_ (Bearer)",
};
/* Rotas que respondem 401 sem a credencial própria (não a sessão): conferidas no teste "sem sessão" também */
const PUBLICAS_COM_CREDENCIAL = ["GET /api/quiosque/qr", "POST /api/quiosque/ponto", "GET /api/integracao/v1/empresa", "GET /api/integracao/v1/colaboradores", "GET /api/integracao/v1/presenca", "GET /api/integracao/v1/ausencias"];

/* Falhas reais encontradas por este teste (todo). Ver docs/seguranca/revisao-completa.md. */
const SEM_404 = "R-B1: com ID de outra empresa responde 200 sem efeito ({ok:false}/{ok:true}) em vez de 404; nada da A muda";
const PENDENTES = {
  "DELETE /api/beneficios/:id": SEM_404,
  "DELETE /api/candidatos/:id": SEM_404,
  "DELETE /api/cargos/:id": SEM_404,
  "DELETE /api/comunicados/:id": SEM_404,
  "DELETE /api/departamentos/:id": SEM_404,
  "DELETE /api/dependentes/:id": SEM_404,
  "DELETE /api/estabelecimentos/:id": SEM_404,
  "DELETE /api/estabelecimentos/:id/quiosque": SEM_404,
  "DELETE /api/feriados/:id": SEM_404,
  "DELETE /api/jornadas/:id": SEM_404,
  "DELETE /api/lancamentos/:id": SEM_404,
  "DELETE /api/vagas/:id": SEM_404,
  "GET /api/comunicados/:id/leituras": "R-B2: não confere se o comunicado é da empresa; devolve a lista de leitura da própria B (sem dados da A)",
};

/* Parâmetros que não são ID */
const valorFixo = (n) => ({ competencia: "2026-01", ano: "2026", fonte: "csv" })[n];
const preferidos = (n) => ({ colaborador: ["colaboradores"], empresa: ["empresas"], vaga: ["vagas"] })[n] ?? [];

const rotas = rotasDosFontes(new URL("../src", import.meta.url).pathname, EXTRAS);
const ehApp = (r) => r.caminho.startsWith("/api/app/");

let s, url, db, painelA, painelB, appB, idsA, base, marcadores, chavesEstrangeiras, opRetrato;

async function entrarPainel(cli, email) {
  assert.equal((await cli.post("/api/entrar", { email, senha: "senha-forte-1" })).status, 200);
}
async function ativarApp(painel, colab, cpf) {
  const { codigo } = (await painel.post(`/api/colaboradores/${colab.id}/convite`)).dados;
  const app = cliente(url);
  assert.equal((await app.post("/api/app/ativar", { cpf, codigo })).status, 200);
  return app;
}
const ok = async (p, msg) => {
  const r = await p;
  assert.ok(r.status < 300, `${msg}: ${r.status} ${JSON.stringify(r.dados)}`);
  return r.dados;
};

before(async () => {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-rh-iso-"));
  const caminhoBanco = join(pasta, "rh.db");
  const app = montarAplicacao({ cfg: { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste-chave-mestra", permitirCadastro: true }, caminhoBanco });
  await new Promise((r) => app.servidor.listen(0, r));
  url = `http://localhost:${app.servidor.address().port}`;
  s = { app, fechar: () => (app.fechar(), rmSync(pasta, { recursive: true, force: true })) };

  painelA = cliente(url);
  painelB = cliente(url);
  await ok(painelA.post("/api/cadastro", { razao_social: `Empresa A ${MARCA}`, cnpj: "11.222.333/0001-81", nome: `Ana ${MARCA}`, email: "ana@a.com", senha: "senha-forte-1" }), "cadastro A");
  await ok(painelB.post("/api/cadastro", { razao_social: "Empresa B Ltda", cnpj: "45.723.174/0001-10", nome: "Beto B", email: "beto@b.com", senha: "senha-forte-1" }), "cadastro B");

  // Dados da empresa A em todos os cadastros que a API permite criar
  const colabA = await ok(painelA.post("/api/colaboradores", { nome: `Alice ${MARCA}`, cpf: CPF_A, admissao: "2024-01-02", salario_centavos: 300000 }), "colaborador A");
  const colabB = await ok(painelB.post("/api/colaboradores", { nome: "Bia Borges", cpf: CPF_B, admissao: "2024-01-02", salario_centavos: 200000 }), "colaborador B");
  await ok(painelA.post(`/api/colaboradores/${colabA.id}/dependentes`, { nome: `Dependente ${MARCA}`, nascimento: "2015-05-05", parentesco: "filho", irrf: true }), "dependente");
  await ok(painelA.post("/api/departamentos", { nome: `Depto ${MARCA}` }), "departamento");
  await ok(painelA.post("/api/cargos", { nome: `Cargo ${MARCA}` }), "cargo");
  await ok(painelA.post("/api/feriados", { data: "2026-03-10", nome: `Feriado ${MARCA}` }), "feriado");
  await ok(painelA.post("/api/beneficios", { nome: `VR ${MARCA}`, tipo: "vr", valor_centavos: 50000 }), "benefício");
  await ok(painelA.post("/api/lancamentos", { colaborador_id: colabA.id, competencia: "2026-01", descricao: `Bônus ${MARCA}`, tipo: "provento", valor_centavos: 10000 }), "lançamento");
  const vaga = await ok(painelA.post("/api/vagas", { titulo: `Vaga ${MARCA}`, descricao: "Descrição", status: "aberta" }), "vaga");
  await ok(painelA.post("/api/candidatos", { vaga_id: vaga.id, nome: `Candidato ${MARCA}`, email: "cand@a.com" }), "candidato");
  await ok(painelA.post("/api/comunicados", { titulo: `Aviso ${MARCA}`, texto: "Texto" }), "comunicado");
  const envio = await fetch(`${url}/api/arquivos?colaborador=${colabA.id}`, { method: "POST", headers: { "x-nexor": "1", cookie: [...painelA.cookies].map(([k, v]) => `${k}=${v}`).join("; "), "content-type": "application/pdf", "x-nome": "doc.pdf" }, body: Buffer.from(`%PDF-1.4 ${MARCA}`) });
  const arq = await envio.json();
  assert.equal(envio.status, 200, JSON.stringify(arq));
  await ok(painelA.post(`/api/colaboradores/${colabA.id}/documentos`, { tipo: "contrato", nome: `Contrato ${MARCA}`, arquivo: arq.id, compartilhar: true }), "documento");
  await ok(painelA.post("/api/afastamentos", { colaborador_id: colabA.id, motivo: "atestado", inicio: "2026-01-05", fim: "2026-01-06" }), "afastamento");
  await ok(painelA.post("/api/integracoes", { nome: `Integração ${MARCA}` }), "integração");
  await ok(painelA.post("/api/folhas/calcular", { competencia: "2026-01" }), "folha");
  const estabs = await ok(painelA.get("/api/estabelecimentos"), "locais");
  await ok(painelA.post(`/api/estabelecimentos/${estabs[0].id}/quiosque`), "quiosque");
  // App do trabalhador da A: ponto e pedido de ajuste (gera marcação, ajuste e arquivos ligados ao colaborador)
  const appA = await ativarApp(painelA, colabA, CPF_A);
  await appA.post("/api/app/ponto", {});
  await appA.post("/api/app/ajustes", { data: "2026-01-05", tipo: "abono", motivo: `Motivo ${MARCA}` });
  appB = await ativarApp(painelB, colabB, CPF_B);

  db = abrirLeitura(caminhoBanco);
  const empresaA = db.prepare("SELECT id FROM empresas WHERE razao_social LIKE ?").get(`%${MARCA}%`).id;
  idsA = idsDaEmpresa(db, { coluna: "empresa_id", idA: empresaA });
  const sch = esquema(db);
  chavesEstrangeiras = [...new Set(Object.values(sch).flat().filter((c) => c.endsWith("_id") && c !== "empresa_id"))];
  const deColab = "colaborador_id IN (SELECT id FROM colaboradores WHERE empresa_id = ?)";
  opRetrato = {
    coluna: "empresa_id",
    idA: empresaA,
    ignorar: ["sessoes"],
    filtros: { credenciais: deColab, convites_app: deColab, colaborador_beneficios: deColab, comunicado_leituras: deColab, folha_itens: "folha_id IN (SELECT id FROM folhas WHERE empresa_id = ?)" },
  };
  base = retrato(db, opRetrato);
  opRetrato.linhasBase = rowidsBase(base);
  base = retrato(db, opRetrato);
  marcadores = [MARCA, CPF_A, "11222333000181"];
});
after(() => {
  db?.close();
  s?.fechar();
});

test("a lista de rotas foi lida dos fontes", () => {
  assert.ok(rotas.length > 150, `só ${rotas.length} rotas encontradas: a leitura dos fontes quebrou?`);
  for (const k of Object.keys(PUBLICAS)) assert.ok(rotas.some((r) => chave(r) === k), `rota pública listada que não existe mais: ${k}`);
});

describe("sem sessão: 401 (exceto as públicas)", () => {
  for (const r of rotas) {
    const k = chave(r);
    const publica = k in PUBLICAS && !PUBLICAS_COM_CREDENCIAL.includes(k);
    test(k, { todo: PENDENTES[`anonimo ${k}`] }, async () => {
      const caminho = preencher(r.caminho, (n) => valorFixo(n) ?? "id-qualquer-123");
      const resp = await cliente(url).chamar(r.metodo, caminho, r.metodo === "GET" ? undefined : {});
      assert.ok(!(resp.status === 404 && /não encontrado/.test(resp.bruto) && resp.bruto.length < 40) && resp.status !== 405, `${k} não está registrada no servidor (${resp.status}). Atualize EXTRAS ou a leitura dos fontes.`);
      if (!publica) assert.equal(resp.status, 401, `${k} sem sessão respondeu ${resp.status}: ${resp.bruto.slice(0, 200)}`);
    });
  }
});

describe("empresa B com IDs da empresa A: 403/404, sem vazar nem alterar", () => {
  for (const r of rotas) {
    const k = chave(r);
    if (k in PUBLICAS) continue;
    test(k, { todo: PENDENTES[k] }, async () => {
      let cli = ehApp(r) ? appB : painelB;
      const rodar = () => chamarComoB({ rota: r, valorFixo, idsA, preferidos, cli, retratoAgora: () => retrato(db, opRetrato), retratoBase: base, marcadores, chavesEstrangeiras });
      let res = await rodar();
      // A própria rota pode encerrar a sessão de B (ex.: trocar senha, desligar): entra de novo e repete
      if (res.resultados.some((x) => x.status === 401)) {
        if (ehApp(r)) {
          const colabB = db.prepare("SELECT id FROM colaboradores WHERE cpf = ?").get(CPF_B);
          appB = await ativarApp(painelB, colabB, CPF_B);
        } else {
          painelB = cliente(url);
          await entrarPainel(painelB, "beto@b.com");
        }
        cli = ehApp(r) ? appB : painelB;
        res = await rodar();
      }
      const p = problemas(res);
      if (p.length) base = retrato(db, opRetrato); // não culpa a próxima rota
      assert.deepEqual(p, [], `${k}:\n${p.join("\n")}`);
      assert.ok(!res.resultados.some((x) => x.status === 401), `${k}: a sessão de B foi recusada (${res.resultados[0]?.resposta})`);
    });
  }
});

test("parâmetros de ID usados no teste existem na empresa A", () => {
  const tabelas = new Set(idsA.values());
  for (const t of ["colaboradores", "dependentes", "vagas", "candidatos", "comunicados", "folhas", "afastamentos", "integracoes", "estabelecimentos", "marcacoes"]) assert.ok(tabelas.has(t), `a empresa A não tem ${t}: o preparo do teste falhou`);
  assert.ok(rotas.filter((r) => nomesParametros(r.caminho).length).length > 50);
});
