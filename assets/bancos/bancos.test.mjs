/* Testes do módulo de bancos. Rodar: node --test assets/bancos/ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { crc16, pixCopiaECola, lerCopiaECola, normalizarChave } from "./pix.js";
import { lerOfx, numeroOfx, dataOfx, textoDoOfx } from "./ofx.js";
import { remessaPagamentos } from "./cnab240.js";
import { clientePix, novoTxid } from "./pix-api.js";
import { banco } from "./lista.js";

test("CRC16 do padrão (vetor conhecido 123456789 = 29B1)", () => {
  assert.equal(crc16("123456789"), "29B1");
});

test("chaves Pix: CPF, CNPJ, e-mail, telefone e aleatória", () => {
  assert.deepEqual(normalizarChave("529.982.247-25"), { tipo: "cpf", chave: "52998224725" });
  assert.deepEqual(normalizarChave("11.222.333/0001-81"), { tipo: "cnpj", chave: "11222333000181" });
  assert.equal(normalizarChave("Contato@Empresa.com.br").chave, "contato@empresa.com.br");
  assert.deepEqual(normalizarChave("(34) 99733-7499"), { tipo: "telefone", chave: "+5534997337499" });
  assert.deepEqual(normalizarChave("+55 34 99733-7499"), { tipo: "telefone", chave: "+5534997337499" });
  assert.equal(normalizarChave("123e4567-e89b-12d3-a456-426614174000").tipo, "aleatoria");
  assert.throws(() => normalizarChave("123"), /inválida/);
  assert.throws(() => normalizarChave(""), /Informe/);
});

test("Pix copia e cola: ida e volta, CRC certo, nome sem acento", () => {
  const c = pixCopiaECola({ chave: "52998224725", nome: "Barbearia São João", cidade: "Araguari", valor: 70, txid: "AG-123", descricao: "Corte + barba" });
  assert.match(c, /^000201/);
  assert.match(c, /br\.gov\.bcb\.pix/);
  assert.equal(crc16(c.slice(0, -4)), c.slice(-4));
  const l = lerCopiaECola(c);
  assert.equal(l.chave, "52998224725");
  assert.equal(l.valor, 70);
  assert.equal(l.nome, "BARBEARIA SAO JOAO");
  assert.equal(l.cidade, "ARAGUARI");
  assert.equal(l.txid, "AG123");
  const sem = lerCopiaECola(pixCopiaECola({ chave: "52998224725", nome: "X", cidade: "Y" }));
  assert.equal(sem.valor, undefined);
  assert.equal(sem.txid, "***");
  assert.throws(() => lerCopiaECola(c.slice(0, -1) + "0"), /inválido/);
  assert.throws(() => pixCopiaECola({ chave: "52998224725", nome: "X", cidade: "Y", valor: -1 }), /Valor/);
});

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0756<BRANCHID>3070<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261101<DTEND>20261114
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261103120000[-3:BRT]<TRNAMT>1.284,50<FITID>A1<MEMO>PIX RECEBIDO PADARIA
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105<TRNAMT>-89.90<FITID>A2<NAME>TARIFA<MEMO>Pacote de serviços
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105<TRNAMT>-10<FITID>A2<MEMO>repetido
</BANKTRANLIST><LEDGERBAL><BALAMT>5432,10<DTASOF>20261114</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("OFX SGML: banco, conta, movimentos, vírgula decimal, FITID repetido e saldo", () => {
  const r = lerOfx(Buffer.from(OFX_SGML, "latin1"));
  assert.equal(r.banco.nome, "Sicoob");
  assert.equal(r.conta, "12345-6");
  assert.equal(r.inicio, "2026-11-01");
  assert.equal(r.movimentos.length, 3);
  assert.equal(r.movimentos[0].valor, 1284.5);
  assert.equal(r.movimentos[0].data, "2026-11-03");
  assert.equal(r.movimentos[1].valor, -89.9);
  assert.equal(r.movimentos[1].descricao, "TARIFA · Pacote de serviços");
  assert.notEqual(r.movimentos[1].id, r.movimentos[2].id);
  assert.deepEqual(r.saldo, { valor: 5432.1, data: "2026-11-14" });
});

test("OFX XML (2.x) e erros", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><OFX><BANKACCTFROM><BANKID>001</BANKID><ACCTID>999</ACCTID></BANKACCTFROM><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261110</DTPOSTED><TRNAMT>50.00</TRNAMT><FITID>X</FITID><MEMO>Depósito João</MEMO></STMTTRN></BANKTRANLIST></OFX>`;
  const r = lerOfx(Buffer.from(xml, "utf8"));
  assert.equal(r.banco.nome, "Banco do Brasil");
  assert.equal(r.movimentos[0].descricao, "Depósito João");
  assert.throws(() => lerOfx("não é ofx"), /OFX/);
  assert.equal(numeroOfx("-1.234,56"), -1234.56);
  assert.equal(numeroOfx("1234.56"), 1234.56);
  assert.equal(dataOfx("20261399"), undefined);
  assert.throws(() => textoDoOfx(Buffer.alloc(6 * 1024 * 1024)), /grande/);
});

test("lista de bancos aceita código com ou sem zeros", () => {
  assert.equal(banco("1").curto, "BB");
  assert.equal(banco(756).curto, "Sicoob");
  assert.equal(banco("999"), undefined);
});

const EMPRESA = { cnpj: "11.222.333/0001-81", nome: "Padaria Trigo Ltda", banco: "756", agencia: "3070", conta: "12345-6", convenio: "123456", cidade: "Araguari", cep: "38440-000", uf: "MG" };

test("CNAB 240: todas as linhas com 240 posições, lotes por forma e totais certos", () => {
  const r = remessaPagamentos({
    empresa: EMPRESA,
    data: "2026-11-30",
    agora: new Date("2026-11-28T10:20:30"),
    pagamentos: [
      { nome: "Ana Souza", cpf: "529.982.247-25", banco: "756", agencia: "3070", conta: "555-1", valor: 2500 },
      { nome: "João Pereira", cpf: "529.982.247-25", banco: "001", agencia: "1234-5", conta: "98765-X", valor: 1980.35 },
    ],
  });
  const ls = r.texto.split("\r\n").filter(Boolean);
  for (const l of ls) assert.equal(l.length, 240);
  assert.equal(ls[0].slice(7, 8), "0");
  assert.equal(ls.at(-1).slice(3, 8), "99999");
  assert.equal(ls.filter((l) => l[7] === "1").length, 2, "dois lotes: conta no mesmo banco e Pix para outro banco");
  assert.equal(ls[1].slice(9, 11), "30", "serviço 30 = salários");
  assert.equal(ls[1].slice(11, 13), "01", "mesmo banco = crédito em conta");
  assert.equal(r.total, 4480.35);
  assert.equal(r.quantidade, 2);
  const segA = ls.filter((l) => l[13] === "A");
  assert.equal(segA[1].slice(119, 134), "000000000198035");
  assert.equal(segA[1].slice(43, 73).trim(), "JOAO PEREIRA");
  assert.equal(Number(ls.at(-1).slice(23, 29)), ls.length);
  assert.match(r.nomeArquivo, /^PAG756_20261130_001\.REM$/);
});

test("CNAB 240: erros claros", () => {
  assert.throws(() => remessaPagamentos({ empresa: { ...EMPRESA, banco: "341" }, data: "2026-11-30", pagamentos: [{}] }), /ainda não tem layout/);
  assert.throws(() => remessaPagamentos({ empresa: EMPRESA, data: "2026-11-30", pagamentos: [] }), /Nenhum/);
  assert.throws(() => remessaPagamentos({ empresa: EMPRESA, data: "2026-11-30", pagamentos: [{ nome: "X", cpf: "1", banco: "756", agencia: "1", conta: "1-1", valor: 10 }] }), /CPF/);
  assert.throws(() => remessaPagamentos({ empresa: EMPRESA, data: "2026-11-30", pagamentos: [{ nome: "X", cpf: "52998224725", banco: "756", agencia: "1", conta: "1-1", valor: 0 }] }), /Valor/);
});

test("API Pix: token com mTLS, cobrança, consulta, token reaproveitado e erro sem segredo", async () => {
  const chamadas = [];
  const requisitar = async (r) => {
    chamadas.push(r);
    assert.ok(r.cert && r.key, "sempre com certificado");
    if (r.url.includes("token")) return { status: 200, json: { access_token: "tk", expires_in: 300 } };
    if (r.metodo === "PUT") return { status: 201, json: { txid: r.url.split("/cob/")[1].split("?")[0], status: "ATIVA", pixCopiaECola: "000201..." } };
    if (r.url.includes("/cob/ERRO")) return { status: 400, json: { detail: "Cobrança não encontrada" } };
    return { status: 200, json: { txid: "x", status: "CONCLUIDA", pix: [{ valor: "10.00" }] } };
  };
  const c = clientePix({ banco: "756", clientId: "id", clientSecret: "segredo-forte", cert: "C", key: "K" }, { requisitar });
  const txid = novoTxid();
  assert.match(txid, /^[A-Za-z0-9]{26,35}$/);
  const cob = await c.criarCobranca({ txid, valor: 70, chave: "52998224725" });
  assert.equal(cob.status, "ATIVA");
  const st = await c.consultarCobranca(txid);
  assert.equal(st.pago, true);
  assert.equal(chamadas.filter((x) => x.url.includes("token")).length, 1, "token reaproveitado");
  assert.match(chamadas[0].cabecalhos.authorization, /^Basic /);
  await assert.rejects(() => c.consultarCobranca("ERRO"), (e) => /HTTP 400: Cobrança não encontrada/.test(e.message) && !/segredo|tk/.test(e.message));
  await assert.rejects(() => c.criarCobranca({ txid: "curto", valor: 1, chave: "k" }), /txid/);
  assert.throws(() => clientePix({ banco: "104", clientId: "a", clientSecret: "b", cert: "c", key: "d" }), /portal/);
  assert.throws(() => clientePix({ banco: "756", clientId: "a", clientSecret: "b" }), /certificado/);
});
