/* Isolamento entre empresas no Atende IA, rota por rota (ver test/isolamento-ajuda.js).
   - Sem sessão, toda rota fora de PUBLICAS responde 401.
   - Como a empresa B, com IDs da empresa A, responde 403/404, não devolve dados da A e não altera nada da A.
   Falhas reais conhecidas ficam em PENDENTES (todo) e estão em docs/seguranca/revisao-completa.md. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { lerConfig } from "../src/config.js";
import { montarAplicacao } from "../src/servidor.js";
import { claudeFalso, mensagemRecebida, metaFalsa, SEGREDO } from "./ajuda.js";
import { abrirLeitura, chamarComoB, chave, cliente, esquema, idsDaEmpresa, preencher, problemas, retrato, rotasDosFontes, rowidsBase } from "./isolamento-ajuda.js";

const MARCA = "MARCA-EMPRESA-A-7f3c";
const FONE_A = "5534911117777";

/* Rotas sem sessão, de propósito, e a proteção de cada uma */
const PUBLICAS = {
  "GET /api/estado": "só diz se há conta e se o cadastro está aberto",
  "POST /api/cadastro": "fechado depois da primeira conta (ALLOW_SIGNUP)",
  "POST /api/entrar": "login, com limite de tentativas",
  "POST /api/sair": "encerra a própria sessão",
  "GET /api/nexor/entrar": "link assinado pela Nexor Central (uso único)",
};

const SEM_404 = "R-B1: com ID de outra empresa responde 200 sem efeito em vez de 404; nada da A muda";
const PENDENTES = {
  "DELETE /api/respostas-rapidas/:id": SEM_404,
};

const valorFixo = (n) => ({ nome: "modelo_inexistente" })[n];
const preferidos = (n) => ({ empresa: ["empresas"] })[n] ?? [];
const rotas = rotasDosFontes(new URL("../src", import.meta.url).pathname);

let s, url, db, painelB, idsA, base, marcadores, chavesEstrangeiras, opRetrato;
const ok = async (p, msg) => {
  const r = await p;
  assert.ok(r.status < 300, `${msg}: ${r.status} ${JSON.stringify(r.dados)}`);
  return r.dados;
};

before(async () => {
  const pasta = mkdtempSync(join(tmpdir(), "atende-iso-"));
  const caminhoBanco = join(pasta, "atende.db");
  const c0 = lerConfig({ DATA_DIR: pasta, META_APP_SECRET: SEGREDO, META_VERIFY_TOKEN: "verifica" });
  const cfg = { ...c0, ia: { ...c0.ia, analisarACada: 999 }, permitirCadastro: true };
  const app = montarAplicacao({ cfg, caminhoBanco, clienteIA: claudeFalso([]), fetchFn: metaFalsa().fetchFn, atrasoAgrupamento: 0 });
  await new Promise((r) => app.servidor.listen(0, r));
  url = `http://127.0.0.1:${app.servidor.address().port}`;
  s = { app, fechar: () => (app.fechar(), rmSync(pasta, { recursive: true, force: true })) };

  const painelA = cliente(url);
  painelB = cliente(url);
  await ok(painelA.post("/api/cadastro", { empresa: `Loja A ${MARCA}`, nome: `Ana ${MARCA}`, email: "ana@a.com", senha: "senha-forte-aaa1" }), "cadastro A");
  await ok(painelB.post("/api/cadastro", { empresa: "Loja B", nome: "Beto B", email: "beto@b.com", senha: "senha-forte-bbb1" }), "cadastro B");
  await ok(painelA.post("/api/canais", { phone_number_id: "111111", waba_id: "900001", token: "EAAtokenfalsoAAAAAAAAAAAA" }), "canal A");
  await ok(painelB.post("/api/canais", { phone_number_id: "222222", waba_id: "900002", token: "EAAtokenfalsoBBBBBBBBBBBB" }), "canal B");
  // Conversa da A pelo webhook (contato, conversa e mensagens)
  const corpo = JSON.stringify(mensagemRecebida(`Olá ${MARCA}`, { numero: "111111", de: FONE_A, nome: `Cliente ${MARCA}` }));
  const w = await fetch(`${url}/webhook/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", SEGREDO).update(corpo).digest("hex") }, body: corpo });
  assert.equal(w.status, 200);
  await new Promise((r) => setTimeout(r, 30));
  await app.atendimento.ocioso();
  await ok(painelA.post("/api/conhecimento", { titulo: `FAQ ${MARCA}`, conteudo: "Conteúdo" }), "conhecimento");
  await ok(painelA.post("/api/produtos", { nome: `Produto ${MARCA}`, preco: 10 }), "produto");
  await ok(painelA.post("/api/aprendizados", { situacao: `Situação ${MARCA}`, resposta_ideal: "Resposta" }), "aprendizado");
  await ok(painelA.post("/api/respostas-rapidas", { atalho: "/oi", texto: `Oi ${MARCA}` }), "resposta rápida");
  await ok(painelA.post("/api/usuarios", { nome: `Atendente ${MARCA}`, email: "at@a.com", senha: "senha-forte-ccc1", papel: "atendente" }), "usuário");
  const contato = db0(caminhoBanco).prepare("SELECT id FROM contatos WHERE wa_id = ?").get(FONE_A);
  await ok(painelA.post("/api/agenda", { horario: "2030-01-10T10:00", servico: `Corte ${MARCA}`, contato_id: contato.id }), "agendamento");

  db = abrirLeitura(caminhoBanco);
  const empresaA = db.prepare("SELECT id FROM empresas WHERE nome LIKE ?").get(`%${MARCA}%`).id;
  idsA = idsDaEmpresa(db, { coluna: "empresa_id", idA: empresaA });
  chavesEstrangeiras = [...new Set(Object.values(esquema(db)).flat().filter((c) => c.endsWith("_id") && c !== "empresa_id"))];
  opRetrato = { coluna: "empresa_id", idA: empresaA, ignorar: ["sessoes", "uso_ia"], filtros: { mensagens: "conversa_id IN (SELECT id FROM conversas WHERE empresa_id = ?)", campanha_envios: "campanha_id IN (SELECT id FROM campanhas WHERE empresa_id = ?)" } };
  base = retrato(db, opRetrato);
  opRetrato.linhasBase = rowidsBase(base);
  base = retrato(db, opRetrato);
  marcadores = [MARCA, FONE_A, "EAAtokenfalsoAAAA"];
});
after(() => {
  db?.close();
  s?.fechar();
});
function db0(caminho) {
  const d = abrirLeitura(caminho);
  after(() => d.close());
  return d;
}

test("a lista de rotas foi lida dos fontes", () => {
  assert.ok(rotas.length > 70, `só ${rotas.length} rotas encontradas`);
  for (const k of Object.keys(PUBLICAS)) assert.ok(rotas.some((r) => chave(r) === k), `rota pública listada que não existe mais: ${k}`);
});

describe("sem sessão: 401 (exceto as públicas)", () => {
  for (const r of rotas) {
    const k = chave(r);
    test(k, { todo: PENDENTES[`anonimo ${k}`] }, async () => {
      const resp = await cliente(url).chamar(r.metodo, preencher(r.caminho, (n) => valorFixo(n) ?? "id-qualquer-123"), r.metodo === "GET" ? undefined : {});
      assert.ok(resp.status !== 405 && !(resp.status === 404 && /"não encontrado"/.test(resp.bruto)), `${k} não está registrada no servidor (${resp.status})`);
      if (!(k in PUBLICAS)) assert.equal(resp.status, 401, `${k} sem sessão respondeu ${resp.status}: ${resp.bruto.slice(0, 200)}`);
    });
  }
});

describe("empresa B com IDs da empresa A: 403/404, sem vazar nem alterar", () => {
  for (const r of rotas) {
    const k = chave(r);
    if (k in PUBLICAS || k === "GET /api/eventos") continue; // eventos (SSE) fica aberto; coberto no teste sem sessão
    test(k, { todo: PENDENTES[k] }, async () => {
      const rodar = () => chamarComoB({ rota: r, valorFixo, idsA, preferidos, cli: painelB, retratoAgora: () => retrato(db, opRetrato), retratoBase: base, marcadores, chavesEstrangeiras });
      let res = await rodar();
      if (res.resultados.some((x) => x.status === 401)) {
        painelB = cliente(url);
        assert.equal((await painelB.post("/api/entrar", { email: "beto@b.com", senha: "senha-forte-bbb1" })).status, 200);
        res = await rodar();
      }
      const p = problemas(res);
      if (p.length) base = retrato(db, opRetrato);
      assert.deepEqual(p, [], `${k}:\n${p.join("\n")}`);
    });
  }
});

test("o preparo criou dados da A nas tabelas principais", () => {
  const tabelas = new Set(idsA.values());
  for (const t of ["contatos", "conversas", "conhecimento", "produtos", "agendamentos", "usuarios", "canais"]) assert.ok(tabelas.has(t), `a empresa A não tem ${t}`);
});
