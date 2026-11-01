import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { contaPronta, mensagemRecebida, statusRecebido, texto } from "./ajuda.js";

describe("tarefas automáticas", async () => {
  const t = await contaPronta();
  after(() => t.fechar());
  const { repo, agendador } = t.app;

  test("campanha: envia o modelo personalizado, conta entregas e respostas, e a IA atende quem responde", async () => {
    const empresa = repo.empresas()[0];
    for (const [wa, nome] of [["5534900000001", "Maria Clara"], ["5534900000002", "João"]]) {
      const { contato } = repo.obterOuCriarContato(empresa.id, wa);
      repo.atualizarContato(empresa.id, contato.id, { nome, tags: ["vip"] });
    }
    const { contato: fora } = repo.obterOuCriarContato(empresa.id, "5534900000003");
    repo.atualizarContato(empresa.id, fora.id, { tags: ["vip"], opt_out: true });

    const r = await t.chamar("POST", "/api/campanhas", { nome: "VIP", modelo_nome: "boas_vindas", idioma: "pt_BR", variaveis: ["{primeiro_nome}"], filtro: { tags: ["vip"] }, enviar_agora: true });
    assert.equal(r.status, 200);
    const antes = t.meta.enviados.length;
    await agendador.ciclo();
    const enviados = t.meta.enviados.slice(antes);
    assert.equal(enviados.length, 2); // quem pediu para sair não recebe
    assert.deepEqual(enviados.map((e) => e.template.components[0].parameters[0].text).sort(), ["João", "Maria"]);

    let c = (await t.chamar("GET", "/api/campanhas")).dados[0];
    assert.equal(c.status, "concluida");
    assert.equal(c.enviados, 2);

    // João lê; Maria responde (responder conta como lida também)
    const wamid = repo.db.prepare("SELECT e.wamid FROM campanha_envios e JOIN contatos c ON c.id = e.contato_id WHERE c.wa_id = ?").get("5534900000002").wamid;
    await t.webhook(statusRecebido(wamid, "read"));
    t.claude.fila.push(texto("Que bom que gostou, Maria!"));
    await t.webhook(mensagemRecebida("Quero saber mais!", { de: "5534900000001", nome: "Maria Clara" }));
    c = (await t.chamar("GET", "/api/campanhas")).dados[0];
    assert.equal(c.lidos, 2);
    assert.equal(c.respondidos, 1);
    assert.equal(t.meta.enviados.at(-1).text.body, "Que bom que gostou, Maria!");
    // A IA viu a mensagem da campanha no histórico
    const msgs = t.claude.chamadas.at(-1).messages;
    assert.match(JSON.stringify(msgs[0]), /início da conversa/);
    assert.match(JSON.stringify(msgs), /temos novidades/);
  });

  test("follow-up: retoma uma conversa parada uma única vez", async () => {
    t.claude.fila.push(texto("Qual tamanho você usa?"));
    await t.webhook(mensagemRecebida("quero uma camisa", { de: "5534900000009", nome: "Rui" }));
    const empresa = repo.empresas()[0];
    const conversa = repo.conversas(empresa.id, { filtro: "abertas" }).find((c) => c.contato_wa_id === "5534900000009");
    // Simula 4 horas sem resposta do cliente (ainda dentro da janela de 24 h)
    const quatroHoras = 4 * 3600_000;
    repo.db.prepare("UPDATE conversas SET ultima_msg_em = ultima_msg_em - ? WHERE id = ?").run(quatroHoras, conversa.id);
    repo.db.prepare("UPDATE mensagens SET criada_em = criada_em - ? WHERE conversa_id = ?").run(quatroHoras, conversa.id);
    repo.db.prepare("UPDATE contatos SET ultima_entrada_em = ultima_entrada_em - ? WHERE wa_id = ?").run(quatroHoras, "5534900000009");

    t.claude.fila.push(texto("Oi Rui, ainda posso te ajudar com a camisa? 😊"));
    await agendador.ciclo();
    assert.equal(t.meta.enviados.at(-1).text.body, "Oi Rui, ainda posso te ajudar com a camisa? 😊");
    assert.match(JSON.stringify(t.claude.chamadas.at(-1).messages.at(-1)), /não respondeu/);
    assert.equal(repo.conversa(empresa.id, conversa.id).followups, 1);

    const n = t.meta.enviados.length;
    repo.db.prepare("UPDATE conversas SET ultima_msg_em = ultima_msg_em - ? WHERE id = ?").run(quatroHoras, conversa.id);
    await agendador.ciclo();
    assert.equal(t.meta.enviados.length, n); // máximo de 1 follow-up
  });
});
