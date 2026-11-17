/* Isolamento no Nexor Barber, rota por rota (ver test/isolamento-ajuda.js).
   Cada instalação atende UMA barbearia (o cadastro fecha depois da primeira conta), então a separação que
   importa é entre os clientes do app: o cliente B, com IDs do cliente A (agendamentos, espera, reservas,
   assinatura), recebe 403/404, não vê dados do A e não altera nada do A.
   - Sem sessão, toda rota fora de PUBLICAS responde 401.
   Falhas reais conhecidas ficam em PENDENTES (todo) e estão em docs/seguranca/revisao-completa.md. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { montarAplicacao } from "../src/servidor.js";
import { GOOGLE_CLIENT, rede, relogio } from "./ajuda.js";
import { abrirLeitura, chamarComoB, chave, cliente, esquema, idsDaEmpresa, preencher, problemas, retrato, rotasDosFontes, rowidsBase } from "./isolamento-ajuda.js";

const MARCA = "MARCA-CLIENTE-A-7f3c";
const FONE_A = "34999990001";
const FONE_B = "34999990002";

const PUBLICAS = {
  "GET /api/estado": "só diz se a barbearia já foi criada",
  "POST /api/cadastro": "só a primeira conta da instalação",
  "POST /api/entrar": "login, com limite de tentativas",
  "POST /api/sair": "encerra a própria sessão",
  "GET /api/nexor/entrar": "link assinado pela Nexor Central (uso único)",
  "GET /api/app/info": "nome, serviços e formas de entrar no app (públicos)",
  "POST /api/app/codigo": "envia código ao celular, com limite por número e por IP",
  "POST /api/app/verificar": "confere o código, com limite de erros",
  "POST /api/app/google": "token do Google assinado (conferido com as chaves do Google)",
  "POST /api/app/sair": "encerra a própria sessão do app",
};

const PENDENTES = {};

const valorFixo = () => undefined;
const rotas = rotasDosFontes(new URL("../src", import.meta.url).pathname);
const ehApp = (r) => r.caminho.startsWith("/api/app/");

let s, url, rd, db, appB, idsA, base, marcadores, chavesEstrangeiras, opRetrato;
const ok = async (p, msg) => {
  const r = await p;
  assert.ok(r.status < 300, `${msg}: ${r.status} ${JSON.stringify(r.dados)}`);
  return r.dados;
};
async function entrarApp(fone, nome) {
  const c = cliente(url);
  await ok(c.post("/api/app/codigo", { fone, canal: "whatsapp" }), "código");
  await ok(c.post("/api/app/verificar", { fone, codigo: rd.ultimoCodigo() }), "verificar");
  await ok(c.put("/api/app/eu", { nome }), "nome");
  return c;
}

before(async () => {
  const pasta = mkdtempSync(join(tmpdir(), "barber-iso-"));
  const caminhoBanco = join(pasta, "barber.db");
  rd = rede();
  const app = montarAplicacao({ cfg: { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste-chave-mestra", urlPublica: "https://agenda.teste" }, caminhoBanco, agora: relogio(), fetchFn: rd.fetchFn });
  await new Promise((r) => app.servidor.listen(0, r));
  url = `http://localhost:${app.servidor.address().port}`;
  s = { app, fechar: () => (app.fechar(), rmSync(pasta, { recursive: true, force: true })) };

  const dono = cliente(url);
  await ok(dono.post("/api/cadastro", { barbearia: "Barbearia Navalha", nome: "Rafael Dono", email: "dono@navalha.test", senha: "senha-forte-1", tambem_corta: true }), "cadastro");
  await ok(dono.put("/api/canais", { whatsapp: { id_numero: "999", token: "tk-meta", segredo: "seg-meta" }, sms: { sid: "AC1", token: "tk-sms", de: "+15550001" }, google: { client_id: GOOGLE_CLIENT } }), "canais");
  const servicos = await ok(dono.get("/api/servicos"), "serviços");
  const barbeiros = await ok(dono.get("/api/barbeiros"), "barbeiros");
  const corte = servicos.find((x) => x.nome === "Corte");
  const barba = servicos.find((x) => x.nome === "Barba");
  const produto = await ok(dono.post("/api/produtos", { nome: "Pomada", preco_centavos: 4500, estoque: 5, estoque_minimo: 1 }), "produto");
  const plano = await ok(dono.post("/api/planos", { nome: "Clube", preco_centavos: 8990, itens: [{ servico_id: barba.id, quantidade: 2 }] }), "plano");

  // Cliente A: agendamento com reserva de produto, lista de espera e assinatura do clube
  const appA = await entrarApp(FONE_A, `Lucas ${MARCA}`);
  const ag = await ok(appA.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: barbeiros[0].id, dia: "2026-11-10", hora: "10:00", reservas: [{ produto_id: produto.id, quantidade: 1 }] }), "agendamento A");
  void ag;
  await ok(appA.post("/api/app/espera", { servico_id: corte.id, dia: "2026-11-11", de: "17:00", ate: "19:00" }), "espera A");
  await appA.post("/api/app/assinar", { plano_id: plano.id });
  appB = await entrarApp(FONE_B, "Bruno B");

  db = abrirLeitura(caminhoBanco);
  const clienteA = db.prepare("SELECT id FROM clientes WHERE nome LIKE ?").get(`%${MARCA}%`).id;
  idsA = idsDaEmpresa(db, { coluna: "cliente_id", idA: clienteA });
  idsA.delete(clienteA); // (a função trata "barbearias" como tabela da empresa; aqui a coluna é a do cliente)
  idsA.set(clienteA, "clientes");
  for (const [id, tab] of [...idsA]) if (tab === "barbearias") idsA.delete(id);
  chavesEstrangeiras = [...new Set(Object.values(esquema(db)).flat().filter((c) => c.endsWith("_id") && !["barbearia_id", "servico_id", "barbeiro_id", "produto_id", "plano_id"].includes(c)))];
  opRetrato = {
    coluna: "cliente_id",
    idA: clienteA,
    ignorar: ["sessoes", "codigos", "envios", "auditoria", "barbearias", "servicos", "barbeiros", "produtos", "planos", "usuarios", "estoque_mov", "nexor_ajustes", "bloqueios"],
    filtros: { clientes: "id = ?", reservas: "agendamento_id IN (SELECT id FROM agendamentos WHERE cliente_id = ?)", usos: "assinatura_id IN (SELECT id FROM assinaturas WHERE cliente_id = ?)", cobrancas: "assinatura_id IN (SELECT id FROM assinaturas WHERE cliente_id = ?)" },
  };
  // Tabelas sem cliente_id e sem filtro acima entram pelo rowid (linhas que já existiam)
  for (const [tab, cols] of Object.entries(esquema(db))) if (!cols.includes("cliente_id") && !opRetrato.filtros[tab] && !opRetrato.ignorar.includes(tab)) opRetrato.ignorar.push(tab);
  base = retrato(db, opRetrato);
  opRetrato.linhasBase = rowidsBase(base);
  base = retrato(db, opRetrato);
  marcadores = [MARCA, `55${FONE_A}`];
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

describe("cliente B do app com IDs do cliente A: 403/404, sem vazar nem alterar", () => {
  for (const r of rotas.filter(ehApp)) {
    const k = chave(r);
    if (k in PUBLICAS) continue;
    test(k, { todo: PENDENTES[k] }, async () => {
      const rodar = () => chamarComoB({ rota: r, valorFixo, idsA, cli: appB, retratoAgora: () => retrato(db, opRetrato), retratoBase: base, marcadores, chavesEstrangeiras });
      let res = await rodar();
      if (res.resultados.some((x) => x.status === 401)) {
        appB = await entrarApp(FONE_B, "Bruno B");
        res = await rodar();
      }
      const p = problemas(res);
      if (p.length) base = retrato(db, opRetrato);
      assert.deepEqual(p, [], `${k}:\n${p.join("\n")}`);
    });
  }
});

test("o preparo criou dados do cliente A", () => {
  const tabelas = new Set(idsA.values());
  for (const t of ["agendamentos", "espera", "clientes"]) assert.ok(tabelas.has(t), `o cliente A não tem ${t}`);
});
