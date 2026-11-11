/* Correções da Banca de Testes no Nexor Elo (P-01 a P-04, P-07, H-01): dinheiro nunca entra duas vezes e estorno desfaz. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { cenario, enviarProposta, subir, webhookPago } from "./ajuda.js";

const itemA = (c, q = 1) => [{ tipo: "fornecedor", produto_id: c.pa["CAM-1"].id, quantidade: q, preco_unit_centavos: 30000 }];
const estoqueCam = async (c) => (await c.fa.c.ok.get("/api/fornecedor/produtos")).find((x) => x.codigo === "CAM-1");

async function aceita(s, c) {
  const { p, token } = await enviarProposta(c, itemA(c));
  const pub = s.cliente();
  await pub.ok.post(`/api/publico/propostas/${token}/aceitar`, { nome: "Zuleika", concordo: true });
  return { p, token, pub };
}
const pagamentos = (s, p) => s.app.repo.todos("SELECT * FROM pagamentos WHERE proposta_id = ? ORDER BY criado_em", p.id);

test("Banca P-01/H-01: trocar a forma de pagamento cancela a cobrança anterior no Asaas; pagar a antiga não baixa o estoque de novo", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const { p, token, pub } = await aceita(s, c);
    await pub.ok.post(`/api/publico/propostas/${token}/pagar`, { forma: "PIX" });
    await pub.ok.post(`/api/publico/propostas/${token}/pagar`, { forma: "BOLETO" });
    const [pix, boleto] = pagamentos(s, p);
    assert.equal(pix.status, "cancelado");
    assert.equal(pix.cancelar_asaas, 0, "já cancelada no Asaas");
    assert.ok(s.rede.asaas.some((x) => x.metodo === "DELETE" && x.caminho.endsWith(`/payments/${pix.asaas_id}`)), "DELETE da cobrança antiga no Asaas");
    // O cliente paga as duas (a antiga ainda estava aberta no banco do cliente): só a válida baixa o estoque
    await webhookPago(s, boleto.asaas_id);
    const depois = await estoqueCam(c);
    const r = await webhookPago(s, pix.asaas_id);
    assert.equal(r.dados.indevido, true);
    assert.deepEqual(await estoqueCam(c), depois, "estoque não baixa duas vezes");
    assert.equal(s.app.repo.um("SELECT COUNT(*) n FROM repasses WHERE proposta_id = ? AND status = 'recebido'", p.id).n, 3, "repasses (fornecedor, plataforma, instalador) só da cobrança válida");
    assert.ok(s.app.repo.um("SELECT 1 FROM auditoria WHERE acao = 'pagamento_indevido'"));
  } finally {
    s.fechar();
  }
});

test("Banca P-01: cancelar a proposta cancela a cobrança no Asaas; pagamento dela depois não vira 'paga'", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const { p, token, pub } = await aceita(s, c);
    await pub.ok.post(`/api/publico/propostas/${token}/pagar`, { forma: "PIX" });
    await c.inst.ok.post(`/api/instalador/propostas/${p.id}/cancelar`, {});
    await new Promise((ok) => setTimeout(ok, 50));
    const [pg] = pagamentos(s, p);
    assert.ok(s.rede.asaas.some((x) => x.metodo === "DELETE" && x.caminho.endsWith(`/payments/${pg.asaas_id}`)));
    const antes = await estoqueCam(c);
    assert.equal((await webhookPago(s, pg.asaas_id)).dados.indevido, true);
    assert.equal((await c.inst.ok.get(`/api/instalador/propostas/${p.id}`)).status, "cancelada");
    assert.deepEqual(await estoqueCam(c), antes);
  } finally {
    s.fechar();
  }
});

test("Banca P-02: dois cliques em 'pagar' ao mesmo tempo geram uma cobrança só", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const { p, token, pub } = await aceita(s, c);
    // Asaas lento: os dois cliques chegam enquanto a primeira cobrança ainda está sendo criada
    s.rede.atraso = 150;
    const r = await Promise.all([pub.post(`/api/publico/propostas/${token}/pagar`, { forma: "PIX" }), pub.post(`/api/publico/propostas/${token}/pagar`, { forma: "PIX" })]);
    s.rede.atraso = 0;
    assert.ok(r.some((x) => x.status === 200), "um clique gera a cobrança");
    assert.ok(r.every((x) => [200, 409].includes(x.status)));
    assert.equal(s.rede.asaas.filter((x) => x.metodo === "POST" && x.caminho.endsWith("/payments")).length, 1, "uma cobrança no Asaas");
    assert.equal(pagamentos(s, p).filter((x) => x.status === "pendente").length, 1);
  } finally {
    s.fechar();
  }
});

test("Banca P-03: estorno ou chargeback desfaz repasses e o título sem wallet (não bloqueia o instalador)", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    // Item do fornecedor B (sem wallet): vira título a receber quando o cliente paga
    const { p, token } = await enviarProposta(c, [{ tipo: "fornecedor", produto_id: c.pb["CAM-1"].id, quantidade: 1, preco_unit_centavos: 30000 }]);
    const pub = s.cliente();
    await pub.ok.post(`/api/publico/propostas/${token}/aceitar`, { nome: "Zuleika", concordo: true });
    await pub.ok.post(`/api/publico/propostas/${token}/pagar`, { forma: "PIX" });
    const [pg] = pagamentos(s, p);
    await webhookPago(s, pg.asaas_id);
    assert.equal(s.app.repo.um("SELECT status FROM titulos WHERE proposta_id = ?", p.id).status, "aberto");
    const r = await webhookPago(s, pg.asaas_id, "PAYMENT_CHARGEBACK_REQUESTED");
    assert.equal(r.dados.estornado, true);
    assert.equal(s.app.repo.um("SELECT status FROM titulos WHERE proposta_id = ?", p.id).status, "cancelado");
    assert.equal(s.app.repo.um("SELECT COUNT(*) n FROM repasses WHERE proposta_id = ? AND status <> 'cancelado'", p.id).n, 0);
    assert.equal((await c.inst.ok.get(`/api/instalador/propostas/${p.id}`)).status, "cancelada");
    assert.equal((await webhookPago(s, pg.asaas_id, "PAYMENT_REFUNDED")).dados.ignorado, "nada a estornar", "idempotente");
  } finally {
    s.fechar();
  }
});

test("Banca P-07: boleto vencido no Asaas libera a proposta (pode reabrir)", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const { p, token, pub } = await aceita(s, c);
    await pub.ok.post(`/api/publico/propostas/${token}/pagar`, { forma: "BOLETO" });
    const [pg] = pagamentos(s, p);
    assert.equal((await c.inst.post(`/api/instalador/propostas/${p.id}/cancelar`, {})).status, 200);
    void pg;
  } finally {
    s.fechar();
  }
  const s2 = await subir();
  try {
    const c = await cenario(s2);
    const { p, token, pub } = await aceita(s2, c);
    await pub.ok.post(`/api/publico/propostas/${token}/pagar`, { forma: "BOLETO" });
    const [pg] = pagamentos(s2, p);
    assert.equal((await webhookPago(s2, pg.asaas_id, "PAYMENT_OVERDUE")).dados.cancelado, true);
    assert.equal(pagamentos(s2, p)[0].status, "cancelado");
  } finally {
    s2.fechar();
  }
});

test("Banca P-04: a tarifa do Asaas sai da parte do instalador e os splits fixos nunca passam do líquido (cartão parcelado)", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const { token, pub } = await aceita(s, c);
    await pub.ok.post(`/api/publico/propostas/${token}/pagar`, { forma: "CREDIT_CARD", parcelas: 6 });
    const cob = s.rede.asaas.filter((x) => x.metodo === "POST" && x.caminho.endsWith("/payments")).at(-1);
    const total = Math.round(cob.corpo.totalValue * 100);
    const splits = cob.corpo.split.reduce((a, x) => a + Math.round(x.totalFixedValue * 100), 0);
    const tarifa = s.app.negocio.tarifaAsaas(total, "CREDIT_CARD", 6);
    assert.ok(tarifa > 0);
    assert.ok(splits + tarifa <= total, "splits + tarifa cabem no total");
  } finally {
    s.fechar();
  }
});

test("Banca U-02: o mesmo rascunho enviado de duas abas (mesma chave) vira uma proposta só", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const corpo = { cliente_id: c.cliente.id, titulo: "CFTV duas abas", itens: itemA(c), chave: "rascunho-abc-1234567890" };
    const [a, b] = await Promise.all([c.inst.ok.post("/api/instalador/propostas", corpo), c.inst.ok.post("/api/instalador/propostas", corpo)]);
    assert.equal(a.id, b.id);
    assert.equal(s.app.repo.um("SELECT COUNT(*) n FROM propostas WHERE chave = ?", corpo.chave).n, 1);
  } finally {
    s.fechar();
  }
});

test("Banca U-06/U-07/U-08: CSV entende '1.000', recusa '1,5' em português e limites de dinheiro aparecem em reais", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const csv = "codigo;nome;preco;estoque\nCSV-1;Cabo;10,00;1.000\nCSV-2;Conector;2,00;1,5\nCSV-3;Fonte;abc;5";
    const r = await c.fa.c.ok.post("/api/fornecedor/produtos/importar", { csv });
    const p1 = (await c.fa.c.ok.get("/api/fornecedor/produtos")).find((x) => x.codigo === "CSV-1");
    assert.equal(p1.estoque, 1000, '"1.000" = mil unidades');
    assert.equal(r.erros.length, 2);
    assert.match(r.erros[0].erro, /^Estoque: "1,5" não é uma quantidade inteira/);
    assert.match(r.erros[1].erro, /^Preço: "abc"/);
    assert.ok(r.erros.every((e) => !/Invalid|expected|received/.test(e.erro)), "nada em inglês");
    const calc = await c.inst.post("/api/instalador/calculadora", { custos: { mao_obra_centavos: 2_000_000_000 }, regime: "mei" });
    assert.equal(calc.status, 400);
    assert.match(calc.dados.erro, /Mão de obra: pode ser no máximo R\$\s?10\.000\.000,00/);
  } finally {
    s.fechar();
  }
});

test("Banca P-06: renovar a reserva respeita o bloqueio por título vencido", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const { p } = await enviarProposta(c, itemA(c));
    await c.fa.c.ok.post("/api/fornecedor/titulos", { instalador_id: c.instId, descricao: "Compra a prazo", valor_centavos: 10000, vencimento: "2026-11-01" });
    const r = await c.inst.post(`/api/instalador/propostas/${p.id}/renovar`, {});
    assert.equal(r.status, 409);
    assert.match(r.dados.erro, /bloqueou novas reservas/);
  } finally {
    s.fechar();
  }
});

test("Regra: proposta com serviço sem custo não é enviada (a margem precisa do custo da mão de obra)", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const servico = (custo) => ({ tipo: "servico", descricao: "Instalação", quantidade: 1, ...(custo !== undefined ? { custo_unit_centavos: custo } : {}), preco_unit_centavos: 40000 });
    const sem = await enviarProposta(c, [...itemA(c), servico()]);
    assert.equal(sem.r.status, 400);
    assert.equal(sem.r.dados.codigo, "custo_servico");
    assert.match(sem.r.dados.erro, /Informe o seu custo no serviço "Instalação"/);
    const zero = await enviarProposta(c, [...itemA(c), servico(0)]);
    assert.equal(zero.r.status, 400, "custo zero também não vale");
    const com = await enviarProposta(c, [...itemA(c), servico(15000)]);
    assert.equal(com.r.status, 200);
  } finally {
    s.fechar();
  }
});
