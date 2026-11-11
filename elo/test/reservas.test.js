/* Reservas: bloqueio por inadimplência e manual, crédito para fornecedor sem wallet, expiração na rotina,
   renovação única e concorrência pelo último item. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { cenario, enviarProposta, subir } from "./ajuda.js";

const itemA = (c, q = 1) => [{ tipo: "fornecedor", produto_id: c.pa["CAM-1"].id, quantidade: q, preco_unit_centavos: 30000 }];

test("Bloqueio: título vencido bloqueia novas reservas (automático); bloqueio manual também; baixa libera", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    // Título vence amanhã: ainda pode reservar
    const t = await c.fa.c.ok.post("/api/fornecedor/titulos", { instalador_id: c.instId, descricao: "Compra a prazo NF 10", valor_centavos: 50000, vencimento: "2026-11-11" });
    assert.equal((await enviarProposta(c, itemA(c))).r.status, 200);
    // Dois dias depois o título está vencido
    s.agora.dias(2);
    const r = await enviarProposta(c, itemA(c));
    assert.equal(r.r.status, 409);
    assert.equal(r.r.dados.codigo, "bloqueado");
    assert.match(r.r.dados.erro, /título vencido/);
    assert.equal(r.p.status, "rascunho");
    const prod = (await c.fa.c.ok.get("/api/fornecedor/produtos")).find((p) => p.codigo === "CAM-1");
    assert.equal(prod.reservado, 1, "a proposta recusada não reservou nada");
    // A rotina avisa as duas partes uma vez
    assert.equal((await s.app.rotina()).titulos_vencidos, 1);
    assert.equal((await s.app.rotina()).titulos_vencidos, 0);
    assert.ok((await c.inst.ok.get("/api/instalador/notificacoes")).some((n) => n.tipo === "titulo_vencido"));
    const vinc = (await c.fa.c.ok.get("/api/fornecedor/vinculos")).find((v) => v.id === c.va.id);
    assert.equal(vinc.credito.bloqueio_inadimplencia, true);
    assert.equal((await c.fa.c.ok.get("/api/fornecedor/titulos?vencidos=1")).length, 1);
    // Outro fornecedor não é afetado
    assert.equal((await enviarProposta(c, [{ tipo: "fornecedor", produto_id: c.pb["CAM-1"].id, quantidade: 1, preco_unit_centavos: 30000 }])).r.status, 200);
    // Baixa (paga com atraso) libera e conta no score como fora do prazo
    const b = await c.fa.c.ok.post(`/api/fornecedor/titulos/${t.id}/baixar`);
    assert.equal(b.pago_no_prazo, false);
    assert.equal((await c.inst.post(`/api/instalador/propostas/${r.p.id}/enviar`, {})).status, 200);
    const sc = await c.fa.c.ok.get(`/api/fornecedor/instaladores/${c.instId}/score`);
    assert.equal(sc.pagamentos.pontualidade_pct, 0);
    // Bloqueio manual
    await c.fa.c.ok.post(`/api/fornecedor/vinculos/${c.va.id}/bloquear`, { motivo: "Cadastro em revisão" });
    const m = await enviarProposta(c, itemA(c));
    assert.equal(m.r.status, 409);
    assert.match(m.r.dados.erro, /Cadastro em revisão/);
    await c.fa.c.ok.post(`/api/fornecedor/vinculos/${c.va.id}/desbloquear`);
    assert.equal((await c.inst.post(`/api/instalador/propostas/${m.p.id}/enviar`, {})).status, 200);
  } finally {
    s.fechar();
  }
});

test("Crédito: fornecedor sem walletId exige limite disponível para a parte dele", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    await c.fb.c.ok.put(`/api/fornecedor/vinculos/${c.vb.id}/credito`, { limite_credito_centavos: 20000 });
    const itemB = (q) => [{ tipo: "fornecedor", produto_id: c.pb["CAM-1"].id, quantidade: q, preco_unit_centavos: 25000 }];
    const r = await enviarProposta(c, itemB(2));
    assert.equal(r.r.status, 409);
    assert.equal(r.r.dados.codigo, "credito");
    assert.equal((await enviarProposta(c, itemB(1))).r.status, 200);
  } finally {
    s.fechar();
  }
});

test("Expiração: a rotina vence a reserva no prazo do fornecedor, libera o estoque e avisa; renova só uma vez", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const { p, r } = await enviarProposta(c, itemA(c, 3));
    assert.equal(r.dados.reserva_expira_em, s.agora() + 5 * 86400_000, "prazo de 5 dias do fornecedor");
    s.agora.dias(4.5);
    assert.equal((await s.app.rotina()).avisos_vencendo, 1);
    s.agora.dias(1);
    assert.equal((await s.app.rotina()).expiradas, 1);
    const exp = await c.inst.ok.get(`/api/instalador/propostas/${p.id}`);
    assert.equal(exp.status, "expirada");
    assert.ok(exp.reservas.every((x) => x.status === "expirada"));
    assert.equal((await c.fa.c.ok.get("/api/fornecedor/produtos")).find((x) => x.codigo === "CAM-1").reservado, 0);
    assert.ok((await c.fa.c.ok.get("/api/fornecedor/notificacoes")).some((n) => n.tipo === "reserva_expirada"));
    // O cliente não consegue aceitar uma proposta expirada
    const tk = r.dados.link.split("/").at(-1);
    assert.equal((await s.cliente().post(`/api/publico/propostas/${tk}/aceitar`, { nome: "Cliente", concordo: true })).status, 409);
    // Renovar: reserva de novo e volta a "enviada"
    const ren = await c.inst.ok.post(`/api/instalador/propostas/${p.id}/renovar`);
    assert.equal(ren.status, "enviada");
    assert.equal(ren.renovacoes, 1);
    assert.equal((await c.fa.c.ok.get("/api/fornecedor/produtos")).find((x) => x.codigo === "CAM-1").reservado, 3);
    const outra = await c.inst.post(`/api/instalador/propostas/${p.id}/renovar`);
    assert.equal(outra.status, 409, "só uma renovação");
    // Reabrir para editar libera a reserva e invalida o link
    const re = await c.inst.ok.post(`/api/instalador/propostas/${p.id}/reabrir`);
    assert.equal(re.status, "rascunho");
    assert.equal(re.link, null);
    assert.equal((await s.cliente().get(`/api/publico/propostas/${tk}`)).status, 404);
    assert.equal((await c.fa.c.ok.get("/api/fornecedor/produtos")).find((x) => x.codigo === "CAM-1").reservado, 0);
  } finally {
    s.fechar();
  }
});

test("Concorrência: duas propostas disputando o último item, só uma reserva", async () => {
  const s = await subir();
  try {
    const c = await cenario(s, { estoqueCam: 1 });
    const criar = () => c.inst.ok.post("/api/instalador/propostas", { cliente_id: c.cliente.id, titulo: "Disputa", itens: itemA(c, 1) });
    const [p1, p2] = await Promise.all([criar(), criar()]);
    const rs = await Promise.all([p1, p2].map((p) => c.inst.post(`/api/instalador/propostas/${p.id}/enviar`, {})));
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
    assert.equal(rs.find((r) => r.status === 409).dados.codigo, "estoque");
    const prod = (await c.fa.c.ok.get("/api/fornecedor/produtos")).find((x) => x.codigo === "CAM-1");
    assert.deepEqual([prod.estoque, prod.reservado, prod.disponivel], [1, 1, 0]);
    assert.equal(s.app.repo.um("SELECT COUNT(*) n FROM reservas WHERE status = 'ativa'").n, 1);
    // Mesmo o fornecedor não consegue baixar o estoque abaixo do reservado
    assert.equal((await c.fa.c.put(`/api/fornecedor/produtos/${c.pa["CAM-1"].id}`, { estoque: 0 })).status, 409);
    // Rajada de 6 envios ao mesmo tempo com 3 em estoque: exatamente 3 reservas
    await c.fa.c.ok.put(`/api/fornecedor/produtos/${c.pa["CAM-1"].id}`, { estoque: 4 });
    const ps = await Promise.all(Array.from({ length: 6 }, criar));
    const r6 = await Promise.all(ps.map((p) => c.inst.post(`/api/instalador/propostas/${p.id}/enviar`, {})));
    assert.equal(r6.filter((r) => r.status === 200).length, 3);
    assert.equal(s.app.repo.um("SELECT reservado FROM produtos WHERE id = ?", c.pa["CAM-1"].id).reservado, 4);
  } finally {
    s.fechar();
  }
});
