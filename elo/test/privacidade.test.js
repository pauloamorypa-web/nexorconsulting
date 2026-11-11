/* Privacidade (LGPD): nenhuma rota do fornecedor devolve dado do cliente final do instalador.
   O teste percorre TODAS as rotas GET do fornecedor (lidas do roteador, então rota nova entra sozinha na varredura),
   com todos os perfis, em todos os status da proposta, e procura nome, documento, telefone, e-mail e endereço. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { propostaParaFornecedor } from "../src/servicos/privacidade.js";
import { CLIENTE_FINAL, SENHA, cenario, enviarProposta, subir, webhookPago } from "./ajuda.js";

const PROIBIDOS = [CLIENTE_FINAL.nome, "Zuleika", "Amarantes", CLIENTE_FINAL.documento, CLIENTE_FINAL.telefone, "99999-7777", CLIENTE_FINAL.email, "cliente.teste", CLIENTE_FINAL.endereco.logradouro, "38440"];

function varrer(texto, onde) {
  for (const p of PROIBIDOS) assert.ok(!texto.includes(p), `${onde} vazou "${p}"`);
}

test("Privacidade: projeção única do fornecedor (lista branca)", () => {
  const p = { id: "p1", numero: 7, status: "paga", obra_cidade: "Araguari", obra_uf: "MG", cliente_id: "c1", cliente: CLIENTE_FINAL, aceite: { nome: CLIENTE_FINAL.nome, documento: CLIENTE_FINAL.documento }, total_centavos: 999, observacoes: `ligar para ${CLIENTE_FINAL.telefone}`, token_cripto: "x" };
  const itens = [
    { id: "i1", tipo: "fornecedor", fornecedor_id: "fA", produto_id: "x", codigo: "C", descricao: "Câmera", quantidade: 2, custo_unit_centavos: 100, preco_unit_centavos: 300 },
    { id: "i2", tipo: "fornecedor", fornecedor_id: "fB", produto_id: "y", codigo: "D", descricao: "Outro", quantidade: 1, custo_unit_centavos: 50, preco_unit_centavos: 80 },
    { id: "i3", tipo: "servico", descricao: "Instalação", quantidade: 1, custo_unit_centavos: 0, preco_unit_centavos: 500 },
  ];
  const v = propostaParaFornecedor(p, itens, { id: "inst", razao_social: "Instaladora", cnpj: "1", cidade: "Araguari", uf: "MG", telefone: "x", config: { wallet_cripto: "s" } }, "fA");
  varrer(JSON.stringify(v), "projeção");
  assert.equal(v.itens.length, 1, "só os itens deste fornecedor");
  assert.equal(v.itens[0].preco_unit_centavos, 100, "preço do fornecedor, não o de venda");
  assert.ok(!JSON.stringify(v).includes("300") && !JSON.stringify(v).includes("999"), "sem preço de venda nem total da proposta");
  assert.deepEqual(Object.keys(v.instalador).sort(), ["cidade", "cnpj", "id", "nome_fantasia", "razao_social", "uf"]);
});

test("Privacidade: todas as rotas GET do fornecedor, em todos os perfis e status, sem dados do cliente final", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const pa = c.pa;
    // Observações e condições com dados do cliente também não podem vazar
    const item = (q) => [{ tipo: "fornecedor", produto_id: pa["CAM-1"].id, quantidade: q, preco_unit_centavos: 30000 }, { tipo: "servico", descricao: "Instalação", quantidade: 1, preco_unit_centavos: 20000 }];
    const extra = { observacoes: `Falar com ${CLIENTE_FINAL.nome} no ${CLIENTE_FINAL.telefone}`, condicoes: `Endereço: ${CLIENTE_FINAL.endereco.logradouro}` };
    const enviada = await enviarProposta(c, item(1), extra);
    const vista = await enviarProposta(c, item(1), extra);
    await s.cliente().ok.get(`/api/publico/propostas/${vista.token}`);
    const paga = await enviarProposta(c, item(2), extra);
    const pub = s.cliente();
    await pub.ok.post(`/api/publico/propostas/${paga.token}/aceitar`, { nome: CLIENTE_FINAL.nome, documento: CLIENTE_FINAL.documento, concordo: true });
    await pub.ok.post(`/api/publico/propostas/${paga.token}/pagar`, { forma: "BOLETO" });
    await webhookPago(s, s.app.repo.um("SELECT asaas_id FROM pagamentos WHERE proposta_id = ?", paga.p.id).asaas_id);
    await c.fa.c.ok.post("/api/fornecedor/titulos", { instalador_id: c.instId, descricao: "Compra a prazo", valor_centavos: 1000, vencimento: "2026-12-01" });
    await c.fa.c.ok.post(`/api/fornecedor/propostas/${paga.p.id}/nfe`);
    await s.app.rotina();
    await s.app.ocioso();

    // Os outros perfis da equipe do fornecedor
    const perfis = { dono: c.fa.c };
    for (const papel of ["admin", "comercial", "financeiro"]) {
      await c.fa.c.ok.post("/api/fornecedor/equipe", { nome: papel, email: `${papel}@a.teste`, senha: SENHA, papel });
      perfis[papel] = s.cliente();
      await perfis[papel].ok.post("/api/fornecedor/entrar", { email: `${papel}@a.teste`, senha: SENHA });
    }
    const ids = { id: [enviada.p.id, vista.p.id, paga.p.id, c.va.id, c.instId, c.pa["CAM-1"].id] };
    const rotas = s.app.api.roteador.listar().filter((r) => r.metodo === "GET" && r.opcoes.conta === "fornecedor");
    assert.ok(rotas.length >= 15, `rotas GET do fornecedor encontradas: ${rotas.length}`);
    let respostas = 0;
    for (const [papel, cli] of Object.entries(perfis))
      for (const r of rotas) {
        const caminhos = r.caminho.includes(":id") ? ids.id.map((x) => r.caminho.replace(":id", x)) : [r.caminho];
        for (const cam of caminhos) {
          for (const q of ["", "?status=paga", "?status=ativa"]) {
            const res = await cli.get(cam + q);
            if (res.status === 200) respostas++;
            varrer(JSON.stringify(res.dados), `${papel} GET ${cam}${q}`);
          }
        }
      }
    assert.ok(respostas > 60, `respostas 200 varridas: ${respostas}`);
    // Propostas vistas pelo fornecedor: estão lá, com cidade/UF e status, mas sem o cliente
    const lista = await c.fa.c.ok.get("/api/fornecedor/propostas");
    assert.deepEqual(lista.map((p) => p.status).sort(), ["enviada", "paga", "vista"]);
    assert.equal(lista[0].obra.cidade, "Araguari");
    assert.equal(lista[0].obra.uf, "MG");
    // E as mensagens enviadas ao fornecedor (WhatsApp/e-mail) também não citam o cliente
    const envios = s.app.repo.lista("envios", "WHERE conta_id = ?", c.fa.id);
    assert.ok(envios.length > 0);
    varrer(JSON.stringify(envios), "envios ao fornecedor");
    // A NF-e do fornecedor vai para o instalador, sem o cliente final
    varrer(JSON.stringify(s.app.repo.lista("notas", "WHERE conta_id = ?", c.fa.id)), "nota do fornecedor");
    // Sanidade: o instalador vê o cliente dele
    assert.ok(JSON.stringify(await c.inst.ok.get(`/api/instalador/propostas/${paga.p.id}`)).includes(CLIENTE_FINAL.documento));
  } finally {
    s.fechar();
  }
});
