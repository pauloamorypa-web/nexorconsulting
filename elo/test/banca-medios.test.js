/* Itens médios (e baixos rápidos) do veredito da Banca no Nexor Elo: P-05, P-08, P-10, P-12, P-13, U-05, P-14 e P-15.
   Cada teste falha no código de antes da correção e passa depois. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { abrirBanco } from "../src/db.js";
import { assinaturaExemplo, gerarPng } from "../src/regras/imagem.js";
import { calcularPreco } from "../src/regras/calculadora.js";
import { cenario, enviarProposta, subir, webhookPago } from "./ajuda.js";

const itemA = (c, q = 1) => ({ tipo: "fornecedor", produto_id: c.pa["CAM-1"].id, quantidade: q, preco_unit_centavos: 30000 });
const itemB = (c, q = 1) => ({ tipo: "fornecedor", produto_id: c.pb["CAM-1"].id, quantidade: q, preco_unit_centavos: 30000 });
const cobrancasAsaas = (s) => s.rede.asaas.filter((x) => x.metodo === "POST" && x.caminho.endsWith("/payments"));

async function aceitarEPagar(s, token, forma = "PIX") {
  const pub = s.cliente();
  await pub.ok.post(`/api/publico/propostas/${token}/aceitar`, { nome: "Zuleika", concordo: true });
  return { pub, pagar: () => pub.post(`/api/publico/propostas/${token}/pagar`, { forma }) };
}

test("Banca P-05: o crédito do fornecedor sem walletId desconta as reservas ativas (não só os títulos)", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    // Fornecedor B não tem walletId: limite de R$ 300,00; cada câmera dele custa R$ 170,00 ao instalador
    await c.fb.c.ok.put(`/api/fornecedor/vinculos/${c.vb.id}/credito`, { limite_credito_centavos: 30000 });
    const p1 = await enviarProposta(c, [itemB(c)]);
    assert.equal(p1.r.status, 200);
    const v = (await c.inst.ok.get("/api/instalador/vinculos")).find((x) => x.fornecedor.id === c.fb.id);
    assert.equal(v.credito.comprometido_centavos, 17000, "a reserva ativa compromete o crédito");
    assert.equal(v.credito.disponivel_centavos, 13000);
    // Segunda proposta: o título ainda não existe (só nasce no pagamento), mas o limite já está tomado pela primeira
    const p2 = await enviarProposta(c, [itemB(c)]);
    assert.equal(p2.r.status, 409);
    assert.equal(p2.r.dados.codigo, "credito");
    // Aceita com cobrança aberta continua comprometendo; cancelar a primeira libera o crédito
    const { pagar } = await aceitarEPagar(s, p1.token);
    assert.equal((await pagar()).status, 200);
    assert.equal((await c.inst.post(`/api/instalador/propostas/${p2.p.id}/enviar`, {})).status, 409);
    await c.inst.ok.post(`/api/instalador/propostas/${p1.p.id}/cancelar`, {});
    assert.equal((await c.inst.post(`/api/instalador/propostas/${p2.p.id}/enviar`, {})).status, 200);
    // Fornecedor com walletId (A) recebe pelo split: as reservas não consomem o limite dele
    const va = (await c.inst.ok.get("/api/instalador/vinculos")).find((x) => x.fornecedor.id === c.fa.id);
    assert.equal(va.credito.comprometido_centavos, 0);
  } finally {
    s.fechar();
  }
});

test("Banca P-08: a NFS-e leva a parte do desconto que cabe aos serviços (rateio que fecha no centavo)", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    await c.inst.ok.put("/api/instalador/conta", { focus_token: "token-focus-instalador", aliquota_iss_pct: 3 });
    const servico = { tipo: "servico", descricao: "Instalação", quantidade: 1, custo_unit_centavos: 50000, preco_unit_centavos: 100000 };
    // R$ 2.000 de produtos + R$ 1.000 de serviço − R$ 300 de desconto: o serviço fica com 1/3 do desconto (R$ 100)
    const { p, token } = await enviarProposta(c, [{ ...itemA(c), preco_unit_centavos: 200000 }, servico], { desconto_centavos: 30000 });
    const { pagar } = await aceitarEPagar(s, token);
    await pagar();
    const pg = s.app.repo.um("SELECT asaas_id FROM pagamentos WHERE proposta_id = ?", p.id);
    await webhookPago(s, pg.asaas_id);
    await c.inst.ok.post(`/api/instalador/propostas/${p.id}/nfse`, {});
    const nfse = s.rede.focus.find((x) => x.caminho.startsWith("/v2/nfse"));
    assert.equal(nfse.corpo.servico.valor_servicos, 1000);
    assert.equal(nfse.corpo.servico.desconto_incondicionado, 100);
    assert.equal(nfse.corpo.servico.base_calculo, 900);
    assert.match(nfse.corpo.servico.discriminacao, /Desconto de R\$ 100,00/);
    // Rateio: a soma dos líquidos é sempre subtotal − desconto, sem item negativo
    const itens = [{ preco_unit_centavos: 333, quantidade: 1 }, { preco_unit_centavos: 333, quantidade: 1 }, { preco_unit_centavos: 334, quantidade: 1 }];
    const r = s.app.negocio.ratearDesconto(itens, 100);
    assert.equal(r.reduce((a, i) => a + i.liquido_centavos, 0), 900);
    assert.ok(r.every((i) => i.liquido_centavos >= 0 && i.desconto_rateado_centavos >= 33 && i.desconto_rateado_centavos <= 34));
  } finally {
    s.fechar();
  }
});

test("Banca P-10: walletId que não decifra não vira 'sem wallet': recusa a cobrança, registra e avisa o operador Nexor", async () => {
  const s = await subir();
  const erros = [];
  const original = console.error;
  console.error = (...a) => erros.push(a.join(" "));
  try {
    const c = await cenario(s);
    const { p, token } = await enviarProposta(c, [itemA(c)]);
    // Chave mestra trocada / dado corrompido: o walletId do fornecedor A está cadastrado mas não decifra
    const fa = s.app.repo.obter("contas", c.fa.id);
    s.app.repo.atualizar("contas", fa.id, { config: { ...fa.config, wallet_cripto: "v1:corrompido:nao-decifra" } });
    const { pagar } = await aceitarEPagar(s, token);
    const r = await pagar();
    assert.equal(r.status, 503);
    assert.equal(r.dados.codigo, "wallet_ilegivel");
    assert.match(r.dados.erro, /conta de recebimento de um dos fornecedores está com problema\. A Nexor já foi avisada/);
    assert.equal(cobrancasAsaas(s).length, 0, "nenhuma cobrança no Asaas");
    assert.equal(s.app.repo.um("SELECT COUNT(*) n FROM pagamentos WHERE proposta_id = ?", p.id).n, 0);
    assert.ok(erros.some((e) => /\[wallet\]/.test(e)), "registra no log");
    assert.ok(s.app.repo.um("SELECT 1 FROM auditoria WHERE conta_id = ? AND acao = 'wallet_ilegivel'", fa.id));
    const nexorId = s.app.repo.um("SELECT id FROM contas WHERE tipo = 'nexor'").id;
    assert.equal((await pagar()).status, 503);
    assert.equal(s.app.repo.um("SELECT COUNT(*) n FROM notificacoes WHERE conta_id = ? AND tipo = 'wallet_ilegivel'", nexorId).n, 1, "operador avisado uma vez (não a cada tentativa)");
    assert.equal((await c.fa.c.ok.get("/api/fornecedor/conta")).config.wallet_ilegivel, true);
  } finally {
    console.error = original;
    s.fechar();
  }
});

test("Banca P-12: índices nas colunas mais filtradas, com migração idempotente", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-elo-idx-"));
  try {
    const caminho = join(pasta, "elo.db");
    abrirBanco(caminho).fechar();
    const repo = abrirBanco(caminho); // segunda abertura: a migração roda de novo sem erro
    const plano = (sql, ...p) => repo.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...p).map((x) => x.detail).join(" | ");
    const consultas = [
      "SELECT * FROM reservas WHERE proposta_id = 'x' AND status = 'ativa'",
      "SELECT * FROM reservas WHERE fornecedor_id = 'x' AND status = 'ativa'",
      "SELECT * FROM pagamentos WHERE proposta_id = 'x' AND status = 'pendente'",
      "SELECT * FROM repasses WHERE pagamento_id = 'x'",
      "SELECT * FROM repasses WHERE proposta_id = 'x'",
      "SELECT * FROM repasses WHERE conta_id = 'x' AND destino = 'fornecedor'",
      "SELECT * FROM propostas WHERE status IN ('enviada','vista','aceita') AND reserva_expira_em <= 1",
      "SELECT * FROM titulos WHERE status = 'aberto' AND vencimento < '2026-01-01' AND vencido_avisado = 0",
      "SELECT * FROM titulos WHERE instalador_id = 'x'",
      "SELECT * FROM vinculos WHERE instalador_id = 'x' AND status = 'aprovado'",
      "SELECT * FROM clientes WHERE instalador_id = 'x'",
      "SELECT * FROM os_fotos WHERE os_id = 'x'",
      "SELECT * FROM os_historico WHERE os_id = 'x'",
      "SELECT * FROM contrato_cobrancas WHERE contrato_id = 'x'",
      "SELECT * FROM notas WHERE conta_id = 'x'",
      "SELECT * FROM envios WHERE conta_id = 'x'",
      "SELECT * FROM sessoes WHERE usuario_id = 'x'",
    ];
    for (const sql of consultas) assert.match(plano(sql), /USING (COVERING )?INDEX/, `sem índice: ${sql} → ${plano(sql)}`);
    repo.fechar();
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("Banca P-13: sem N+1 nas listas do fornecedor, paginação compatível e /comparar sem item vazio", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const repo = s.app.repo;
    // Conta as consultas feitas por uma requisição
    let n = 0;
    for (const k of ["um", "todos", "lista", "obter", "porIds", "agrupar"]) {
      const f = repo[k];
      repo[k] = (...a) => (n++, f(...a));
    }
    const consultas = async (cli, caminho) => {
      n = 0;
      const r = await cli.get(caminho);
      assert.equal(r.status, 200, JSON.stringify(r.dados));
      return { n, r };
    };
    // Vínculos: 1 instalador vs. 11 (10 a mais, gravados direto no banco) → o número de consultas não cresce
    const umVinculo = (await consultas(c.fa.c, "/api/fornecedor/vinculos")).n;
    for (let i = 0; i < 10; i++) {
      const inst = repo.inserir("contas", { tipo: "instalador", razao_social: `Instalador ${i} Ltda`, cnaes: ["8020001"], cidade: "Araguari", uf: "MG" });
      repo.inserir("vinculos", { fornecedor_id: c.fa.id, instalador_id: inst.id, status: "aprovado", limite_credito_centavos: 1000 });
    }
    const onze = await consultas(c.fa.c, "/api/fornecedor/vinculos");
    assert.equal(onze.r.dados.length, 11);
    assert.equal(onze.n, umVinculo, `vínculos: ${umVinculo} consultas com 1, ${onze.n} com 11`);
    // Propostas: 1 vs. 4
    await enviarProposta(c, [itemA(c)]);
    const umaProposta = (await consultas(c.fa.c, "/api/fornecedor/propostas")).n;
    for (let i = 0; i < 3; i++) await enviarProposta(c, [itemA(c)]);
    const quatro = await consultas(c.fa.c, "/api/fornecedor/propostas");
    assert.equal(quatro.r.dados.length, 4);
    assert.equal(quatro.n, umaProposta, `propostas: ${umaProposta} consultas com 1, ${quatro.n} com 4`);
    const reservas = await consultas(c.fa.c, "/api/fornecedor/reservas");
    assert.equal(reservas.r.dados.length, 4);
    assert.equal(reservas.n, (await consultas(c.fa.c, "/api/fornecedor/reservas?limite=1")).n, "reservas: consultas não dependem da quantidade");

    // Paginação: a resposta continua um array; os cabeçalhos dizem se há próxima página
    for (const [i, venc] of ["2026-12-01", "2026-12-02", "2026-12-03"].entries()) await c.fa.c.ok.post("/api/fornecedor/titulos", { instalador_id: c.instId, descricao: `Compra ${i + 1}`, valor_centavos: 1000, vencimento: venc });
    const p1 = await c.fa.c.get("/api/fornecedor/titulos?limite=2");
    assert.ok(Array.isArray(p1.dados));
    assert.deepEqual(p1.dados.map((x) => x.descricao), ["Compra 1", "Compra 2"]);
    assert.equal(p1.cabecalhos.get("x-proxima-pagina"), "2");
    const p2 = await c.fa.c.get("/api/fornecedor/titulos?limite=2&pagina=2");
    assert.deepEqual(p2.dados.map((x) => x.descricao), ["Compra 3"]);
    assert.equal(p2.cabecalhos.get("x-proxima-pagina"), null);
    assert.equal((await c.fa.c.get("/api/fornecedor/titulos")).dados.length, 3, "sem parâmetros: tudo (até o padrão)");
    assert.equal((await c.inst.get("/api/instalador/titulos?limite=1")).dados.length, 1);

    // /comparar com item vazio montava o catálogo inteiro de cada fornecedor
    const vazio = await c.inst.post("/api/instalador/comparar", { itens: [{ quantidade: 1 }] });
    assert.equal(vazio.status, 400);
    assert.match(vazio.dados.erro, /código ou pelo menos 2 letras/);

    // Catálogo: 501 produtos invisíveis (só para uma tabela) antes do visível não escondem o visível
    const outra = await c.fb.c.ok.post("/api/fornecedor/tabelas", { nome: "Especial", tipo: "desconto", desconto_pct: 5 });
    repo.transacao(() => {
      for (let i = 0; i < 501; i++) repo.inserir("produtos", { fornecedor_id: c.fb.id, codigo: `OCULTO-${i}`, nome: `Oculto ${i}`, categoria: "AAA", preco_centavos: 100, estoque: 1, visibilidade: "tabelas", tabelas: [outra.id] });
    });
    const cat = await c.inst.ok.get(`/api/instalador/fornecedores/${c.fb.id}/catalogo`);
    assert.deepEqual(cat.map((x) => x.codigo), ["CAM-1"]);
  } finally {
    s.fechar();
  }
});

test("Banca U-05: o servidor recusa assinatura quase em branco (um toque) e aceita um traço de verdade", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const { p, token } = await enviarProposta(c, [itemA(c)]);
    const { pagar } = await aceitarEPagar(s, token);
    await pagar();
    await webhookPago(s, s.app.repo.um("SELECT asaas_id FROM pagamentos WHERE proposta_id = ?", p.id).asaas_id);
    const os = await c.inst.ok.post("/api/instalador/os", { proposta_id: p.id });
    // Um toque: um ponto de ~5 px num quadro de 600×200
    const toque = gerarPng(600, 200, (x, y) => Math.hypot(x - 300, y - 100) < 2.5);
    const r = await c.inst.post(`/api/instalador/os/${os.id}/assinatura`, { imagem: toque, nome: "Zé da Silva" });
    assert.equal(r.status, 400);
    assert.equal(r.dados.codigo, "assinatura_vazia");
    assert.match(r.dados.erro, /quase em branco/);
    const branco = gerarPng(600, 200, () => false);
    assert.equal((await c.inst.post(`/api/instalador/os/${os.id}/assinatura`, { imagem: branco, nome: "Zé da Silva" })).status, 400);
    const ok = await c.inst.post(`/api/instalador/os/${os.id}/assinatura`, { imagem: assinaturaExemplo(), nome: "Zé da Silva" });
    assert.equal(ok.status, 200);
    assert.equal(ok.dados.assinado, true);
  } finally {
    s.fechar();
  }
});

test("Banca P-15: corrida ao editar estoque (reserva entra enquanto o corpo chega) responde 409 com mensagem, não 500", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const prod = c.pa["CAM-1"];
    const corpo = JSON.stringify({ estoque: 1 });
    const cookie = [...c.fa.c.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const u = new URL(`${s.url}/api/fornecedor/produtos/${prod.id}`);
    // O fornecedor manda o cabeçalho do PUT; o corpo demora (rede lenta) e, nesse meio tempo, uma reserva de 3 entra
    const resposta = new Promise((ok, falhou) => {
      const req = request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "PUT", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(corpo), "x-nexor": "1", cookie } }, (res) => {
        let b = "";
        res.on("data", (x) => (b += x));
        res.on("end", () => ok({ status: res.statusCode, dados: JSON.parse(b) }));
      });
      req.on("error", falhou);
      req.flushHeaders();
      setTimeout(async () => {
        try {
          const env = await enviarProposta(c, [itemA(c, 3)]);
          assert.equal(env.r.status, 200);
          req.end(corpo);
        } catch (e) {
          falhou(e);
        }
      }, 80);
    });
    const r = await resposta;
    assert.equal(r.status, 409, JSON.stringify(r.dados));
    assert.match(r.dados.erro, /O estoque não pode ficar abaixo do reservado \(3\)/);
    const depois = (await c.fa.c.ok.get("/api/fornecedor/produtos")).find((x) => x.id === prod.id);
    assert.equal(depois.estoque, 10);
    assert.equal(depois.reservado, 3);
  } finally {
    s.fechar();
  }
});

test("Banca P-14: alíquota efetiva do Simples pela faixa e anexo (RBT12), mantendo a alíquota à mão", async () => {
  const custos = { produtos_centavos: 100000, mao_obra_centavos: 50000 };
  // Anexo III, RBT12 de R$ 300.000 (faixa 2: 11,2% − R$ 9.360) → (300.000 × 11,2% − 9.360) / 300.000 = 8,08%
  const r = calcularPreco({ custos, margem_pct: 20, regime: { tipo: "simples", anexo: "III", rbt12_centavos: 30_000_000 }, taxa_plataforma_pct: 2.5 });
  assert.equal(r.impostos.detalhamento[0].aliquota_pct, 8.08);
  assert.deepEqual(r.impostos.simples, { anexo: "III", faixa: 2, nominal_pct: 11.2, aliquota_pct: 8.08 });
  assert.ok(r.avisos.some((a) => /faixa 2/.test(a)));
  // Faixa 1: a efetiva é a própria nominal
  assert.equal(calcularPreco({ custos, margem_pct: 20, regime: { tipo: "simples", anexo: "I", rbt12_centavos: 15_000_000 }, taxa_plataforma_pct: 0 }).impostos.detalhamento[0].aliquota_pct, 4);
  // Acima de R$ 4,8 milhões: fora do Simples
  assert.match(calcularPreco({ custos, margem_pct: 20, regime: { tipo: "simples", anexo: "III", rbt12_centavos: 500_000_000 }, taxa_plataforma_pct: 0 }).erro, /fora do Simples/);
  const s = await subir();
  try {
    const c = await cenario(s);
    const api = await c.inst.ok.post("/api/instalador/calculadora", { custos, margem_pct: 20, regime: { tipo: "simples", anexo: "V", rbt12_centavos: 100_000_000 } });
    // Anexo V, R$ 1.000.000 (faixa 4: 20,5% − 17.100) → 18,79%
    assert.equal(api.impostos.detalhamento[0].aliquota_pct, 18.79);
    const manual = await c.inst.ok.post("/api/instalador/calculadora", { custos, margem_pct: 20, regime: { tipo: "simples", anexo: "III", aliquota_pct: 6 } });
    assert.equal(manual.impostos.detalhamento[0].aliquota_pct, 6, "a alíquota à mão continua valendo");
    const nada = await c.inst.post("/api/instalador/calculadora", { custos, margem_pct: 20, regime: { tipo: "simples", anexo: "III" } });
    assert.equal(nada.status, 400);
  } finally {
    s.fechar();
  }
});
