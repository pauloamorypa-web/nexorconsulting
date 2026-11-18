import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import { config } from "../src/config.js";
import { criarProcessadorInstagram, extrairEventos, palavraChave, pareceInteresse } from "../src/instagram.js";
import { criarServidor } from "../src/servidor.js";

const CONTA = "17840000000000001";
const dm = (de, texto, mid = `m${Math.random()}`) => ({ object: "instagram", entry: [{ id: CONTA, messaging: [{ sender: { id: de }, recipient: { id: CONTA }, message: { mid, text: texto } }] }] });
const comentario = (de, texto, id = `c${Math.random()}`) => ({ object: "instagram", entry: [{ id: CONTA, changes: [{ field: "comments", value: { id, text: texto, from: { id: de, username: "cliente" }, media: { id: "post1" } } }] }] });

function falsos() {
  const chamadas = [];
  const api = {
    enviarDM: async (para, texto) => chamadas.push({ tipo: "dm", para, texto }),
    respostaPrivada: async (id, texto) => chamadas.push({ tipo: "privada", id, texto }),
    responderComentario: async (id, texto) => chamadas.push({ tipo: "publica", id, texto }),
  };
  const recebidas = [];
  const agente = { responder: async (m) => (recebidas.push(m), { resposta: `resposta para: ${m.texto}` }) };
  return { chamadas, recebidas, processar: criarProcessadorInstagram({ agente, api, sortear: () => 0, log: { error() {} } }) };
}

test("palavra-chave só em comentário curto, sem acento e sem caixa", () => {
  assert.equal(palavraChave("TESTE")?.chave, "teste");
  assert.equal(palavraChave("quero o Contábil!")?.chave, "contabil");
  assert.equal(palavraChave("Ponto")?.chave, "ponto");
  assert.equal(palavraChave("eu fiz um teste ontem e achei a interface bem bonita"), null);
  assert.equal(palavraChave("parabéns pelo trabalho"), null);
  assert.ok(pareceInteresse("Quanto custa?"));
  assert.ok(!pareceInteresse("top demais"));
});

test("extrai Direct e comentário e ignora eco, conta própria e mensagem apagada", () => {
  const payload = {
    entry: [{
      id: CONTA,
      messaging: [
        { sender: { id: "u1" }, message: { mid: "a", text: "oi" } },
        { sender: { id: CONTA }, message: { mid: "b", text: "eco", is_echo: true } },
        { sender: { id: "u2" }, message: { mid: "c", is_deleted: true } },
      ],
      changes: [
        { field: "comments", value: { id: "k1", text: "TESTE", from: { id: "u3" }, media: { id: "p" } } },
        { field: "comments", value: { id: "k2", text: "obrigado!", from: { id: CONTA }, media: { id: "p" } } },
      ],
    }],
  };
  const ev = extrairEventos(payload);
  assert.deepEqual(ev.map((e) => `${e.tipo}:${e.de}`), ["dm:u1", "comentario:u3"]);
});

test("Direct responde pela IA com foco em Araguari", async () => {
  const f = falsos();
  await f.processar(dm("u1", "Vocês atendem em Araguari?"));
  assert.equal(f.chamadas[0].tipo, "dm");
  assert.equal(f.chamadas[0].para, "u1");
  assert.equal(f.recebidas[0].idConversa, "ig:u1");
  assert.equal(f.recebidas[0].canal, "instagram");
  assert.match(f.recebidas[0].contexto, /Araguari/);
});

test("comentário com palavra-chave: resposta pública curta e Direct privado", async () => {
  const f = falsos();
  await f.processar(comentario("u9", "PONTO", "k10"));
  assert.deepEqual(f.chamadas.map((c) => c.tipo), ["publica", "privada"]);
  assert.equal(f.chamadas[0].id, "k10");
  assert.match(f.chamadas[0].texto, /Direct/);
  assert.match(f.recebidas[0].contexto, /RH e Ponto/);
});

test("comentário com pergunta vai só para o Direct; elogio não gera resposta", async () => {
  const f = falsos();
  await f.processar(comentario("u5", "Como funciona para clínica?"));
  await f.processar(comentario("u6", "top demais 👏"));
  assert.deepEqual(f.chamadas.map((c) => c.tipo), ["privada"]);
});

test("não responde duas vezes ao mesmo evento reenviado pela Meta", async () => {
  const f = falsos();
  const p = dm("u1", "oi", "mid-fixo");
  await f.processar(p);
  await f.processar(p);
  assert.equal(f.chamadas.length, 1);
});

test("falha da API não derruba o processamento dos próximos eventos", async () => {
  const chamadas = [];
  let primeira = true;
  const api = {
    enviarDM: async (para) => { if (primeira) { primeira = false; throw new Error("fora da janela"); } chamadas.push(para); },
    respostaPrivada: async () => {}, responderComentario: async () => {},
  };
  const processar = criarProcessadorInstagram({ agente: { responder: async () => ({ resposta: "ok" }) }, api, log: { error() {} } });
  await processar({ entry: [{ id: CONTA, messaging: [{ sender: { id: "a" }, message: { mid: "1", text: "oi" } }, { sender: { id: "b" }, message: { mid: "2", text: "oi" } }] }] });
  assert.deepEqual(chamadas, ["b"]);
});

/* Webhook pelo servidor */
let base, servidor;
const enviadas = [];
before(async () => {
  config.instagram.tokenVerificacao = "ig-verifica";
  config.instagram.segredoApp = "ig-segredo";
  const agente = { responder: async (m) => ({ resposta: `eco: ${m.texto}` }) };
  const apiInstagram = { enviarDM: async (para, texto) => enviadas.push({ para, texto }), respostaPrivada: async () => {}, responderComentario: async () => {} };
  servidor = criarServidor({ agente, armazenamento: { salvarLead: async () => {}, listarLeads: async () => [] }, notificar: async () => {}, enviarMeta: async () => {}, apiInstagram });
  await new Promise((r) => servidor.listen(0, r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test("webhook do Instagram: verificação, assinatura e resposta", async () => {
  assert.equal(await (await fetch(`${base}/webhook/instagram?hub.mode=subscribe&hub.verify_token=ig-verifica&hub.challenge=7`)).text(), "7");
  assert.equal((await fetch(`${base}/webhook/instagram?hub.mode=subscribe&hub.verify_token=x&hub.challenge=7`)).status, 403);
  assert.equal((await fetch(`${base}/webhook/instagram`, { method: "POST", headers: { "X-Hub-Signature-256": "sha256=00" }, body: "{}" })).status, 401);
  const corpo = JSON.stringify(dm("u77", "oi", "mid-servidor"));
  const assinatura = "sha256=" + createHmac("sha256", "ig-segredo").update(corpo).digest("hex");
  const r = await fetch(`${base}/webhook/instagram`, { method: "POST", headers: { "X-Hub-Signature-256": assinatura, "Content-Type": "application/json" }, body: corpo });
  assert.equal(r.status, 200);
  await new Promise((res) => setTimeout(res, 50));
  assert.deepEqual(enviadas.at(-1), { para: "u77", texto: "eco: oi" });
});
