/* Testes de unidade: tabelas da folha, espelho, presença, XML do eSocial e biometria (WebAuthn) com um
   autenticador simulado (chave ES256 como a do chip de segurança do celular). */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { after, before, test } from "node:test";
import { calcularInss, calcularIrrf, TABELAS_PADRAO } from "../src/folha/tabelas.js";
import { avos13, calcular13, calcularFerias, calcularRescisao, periodosFerias } from "../src/folha/calculo.js";
import { calcularEspelho, minutosNoturnos } from "../src/ponto/espelho.js";
import { conferirGps, conferirQr, distanciaMetros, tokenQr } from "../src/ponto/presenca.js";
import { feriadosNacionais, instante, pascoa } from "../src/ponto/calendario.js";
import { cpfValido, cnpjValido } from "../src/http/validacao.js";
import { el } from "../src/esocial/xml.js";
import { consultarLote } from "../src/esocial/cliente.js";
import { CPF, subir } from "./ajuda.js";
import { turnoAtual } from "../src/http/rotas-ponto.js";

const T = TABELAS_PADRAO;

test("INSS progressivo 2025", () => {
  assert.equal(calcularInss(151800, T), 11385);
  assert.equal(calcularInss(300000, T), Math.round(151800 * 0.075 + (279388 - 151800) * 0.09 + (300000 - 279388) * 0.12));
  assert.equal(calcularInss(2000000, T), calcularInss(815741, T), "teto");
});

test("IRRF: simplificado, faixas e redução da Lei 15.270 a partir de 2026", () => {
  const antes = calcularIrrf({ rendimentos: 450000, inss: 40000, competencia: "2025-12" }, T);
  assert.ok(antes.imposto > 0);
  const depois = calcularIrrf({ rendimentos: 450000, inss: 40000, competencia: "2026-01" }, T);
  assert.equal(depois.imposto, 0, "até R$ 5.000 fica isento em 2026");
  const meio = calcularIrrf({ rendimentos: 600000, inss: 60000, competencia: "2026-03" }, T);
  const cheio = calcularIrrf({ rendimentos: 600000, inss: 60000, competencia: "2025-03" }, T);
  assert.ok(meio.imposto > 0 && meio.imposto < cheio.imposto, "redução parcial entre 5 mil e 7.350");
  assert.equal(calcularIrrf({ rendimentos: 200000, inss: 15000 }, T).imposto, 0);
});

test("13º, férias e rescisão", () => {
  assert.equal(avos13("2026-03-17", 2026), 10, "17 a 31 de março = 15 dias, conta");
  assert.equal(avos13("2026-03-18", 2026), 9, "14 dias não contam");
  
  const c = { salario_centavos: 360000, admissao: "2025-01-01", tipo_contrato: "clt" };
  const p1 = calcular13({ colaborador: c, ano: 2026, parcela: 1, tabelas: T });
  assert.equal(p1.bruto, 180000);
  assert.equal(p1.inss, 0);
  const p2 = calcular13({ colaborador: c, ano: 2026, parcela: 2, primeiraParcelaPaga: 180000, tabelas: T });
  assert.ok(p2.inss > 0);
  assert.equal(p2.liquido, 360000 - 180000 - p2.inss - p2.irrf);
  const f = calcularFerias({ colaborador: c, dias: 30, competencia: "2026-07", tabelas: T });
  assert.equal(f.rubricas.find((r) => r.codigo === "FER13").valor, 120000);
  const per = periodosFerias("2025-01-01", [], "2026-06-01");
  assert.equal(per[0].completo, true);
  assert.equal(per[0].saldo, 30);
  assert.equal(per[0].limite_concessivo, "2026-12-31");
  const r = calcularRescisao({ colaborador: c, data: "2026-06-15", tipo: "pedido_demissao", tabelas: T });
  assert.equal(r.dias_aviso, 0);
  assert.equal(r.multa_fgts, 0);
  assert.ok(r.rubricas.some((x) => x.codigo === "FERVENC"));
  const j = calcularRescisao({ colaborador: c, data: "2026-06-15", tipo: "justa_causa", tabelas: T });
  assert.ok(!j.rubricas.some((x) => x.codigo === "D13PROP" || x.codigo === "FERPROP"));
  const a = calcularRescisao({ colaborador: c, data: "2026-06-15", tipo: "acordo", tabelas: T });
  assert.equal(a.dias_aviso, 17, "metade de 33 dias");
});

test("calendário: Páscoa e feriados nacionais", () => {
  assert.equal(pascoa(2026), "2026-04-05");
  const f = feriadosNacionais(2026).map((x) => x.data);
  assert.ok(f.includes("2026-04-03") && f.includes("2026-11-20"));
});

test("espelho: hora noturna reduzida, domingo a 100% e escala 12x36", () => {
  assert.equal(minutosNoturnos(instante("2026-10-05", "22:00"), instante("2026-10-06", "05:00")), 420);
  const j = { tipo: "escala", escala: { trabalha: 1, folga: 1, entrada: "19:00", saida: "07:00", intervalo_min: 60, inicio: "2026-10-01" }, tolerancia_min: 5 };
  const m = (d, h) => ({ momento: instante(d, h), status: "valida", origem: "app" });
  const e = calcularEspelho({ competencia: "2026-10", colaborador: { id: "x" }, jornada: j, marcacoes: [m("2026-10-01", "19:00"), m("2026-10-02", "07:00"), m("2026-10-04", "16:00"), m("2026-10-04", "18:00")], hoje: "2026-10-05" });
  const d1 = e.dias.find((d) => d.data === "2026-10-01");
  assert.equal(d1.trabalhado, 720);
  assert.equal(d1.noturno, 420);
  assert.equal(d1.noturno_reduzido, 480);
  assert.equal(d1.extra50, 60, "jornada prevista de 11h (12h - 1h de intervalo)");
  assert.equal(e.dias.find((d) => d.data === "2026-10-02").status, "folga");
  assert.equal(e.dias.find((d) => d.data === "2026-10-03").falta, true);
  const dom = e.dias.find((d) => d.data === "2026-10-04");
  assert.equal(dom.status, "folga");
  assert.equal(dom.extra100, 120, "domingo de folga trabalhado vale 100%");
});

test("presença: QR rotativo e cerca de GPS", () => {
  const t0 = 1_800_000_000_000;
  const tk = tokenQr("est1", "segredo", t0, 30);
  assert.equal(conferirQr(tk, () => "segredo", t0 + 25_000, 30).ok, true);
  assert.equal(conferirQr(tk, () => "segredo", t0 + 65_000, 30).ok, false);
  assert.equal(conferirQr(tk, () => "outro", t0, 30).ok, false);
  assert.equal(conferirQr(tk.slice(0, -2) + "xx", () => "segredo", t0, 30).ok, false);
  assert.ok(Math.abs(distanciaMetros(-23.5505, -46.6333, -23.5605, -46.6333) - 1112) < 5);
  const est = [{ id: "a", nome: "Loja", lat: -23.5505, lng: -46.6333, raio_m: 100, ativo: true }];
  assert.equal(conferirGps(est, -23.5509, -46.6333, 10).ok, true);
  assert.equal(conferirGps(est, -23.553, -46.6333, 10).ok, false);
});

test("turno atual: madrugada já encerrada e dia em andamento", () => {
  const m = (iso) => ({ momento: Date.parse(iso) });
  const noite = [m("2026-10-29T22:01:00-03:00"), m("2026-10-30T01:33:00-03:00"), m("2026-10-30T02:29:00-03:00"), m("2026-10-30T06:04:00-03:00")];
  assert.equal(turnoAtual(noite, Date.parse("2026-10-30T10:40:00-03:00")).length, 0, "saiu às 6h: às 10h40 não está trabalhando");
  assert.equal(turnoAtual(noite.slice(0, 2), Date.parse("2026-10-30T01:50:00-03:00")).length, 2, "entrou ontem às 22h e está no intervalo");
  assert.equal(turnoAtual(noite.slice(0, 3), Date.parse("2026-10-30T03:00:00-03:00")).length, 3, "virando a noite");
  const ontem = [m("2026-10-29T08:00:00-03:00"), m("2026-10-29T12:00:00-03:00"), m("2026-10-29T13:00:00-03:00"), m("2026-10-29T17:48:00-03:00")];
  assert.equal(turnoAtual([...ontem, m("2026-10-30T08:00:00-03:00")], Date.parse("2026-10-30T10:40:00-03:00")).length, 1, "só a entrada de hoje");
});

test("validação de CPF e CNPJ", () => {
  assert.ok(cpfValido("529.982.247-25"));
  assert.ok(!cpfValido("111.111.111-11"));
  assert.ok(cnpjValido("11.222.333/0001-81"));
  assert.ok(!cnpjValido("11.222.333/0001-82"));
});

test("XML canônico: escapa texto, ordena atributos e omite vazios", () => {
  assert.equal(el("a", { z: "1", Id: "x", xmlns: "urn:n" }, el("b", "R&D <1>"), el("c", ""), el("d", null)), '<a xmlns="urn:n" Id="x" z="1"><b>R&amp;D &lt;1&gt;</b></a>');
});

test("consulta de lote lê recibos e ocorrências", async () => {
  const resp = await consultarLote({ ambiente: 2, protocolo: "1", fetchSoap: async () => `<status><cdResposta>201</cdResposta></status><retornoEventos><evento Id="ID1"><retornoEvento><processamento><cdResposta>201</cdResposta></processamento><recibo><nrRecibo>1.2.3</nrRecibo></recibo></retornoEvento></evento><evento Id="ID2"><retornoEvento><processamento><cdResposta>401</cdResposta><descResposta>Erro</descResposta><ocorrencias><ocorrencia><codigo>1234</codigo><descricao>Campo inválido</descricao><tipo>1</tipo><localizacao>/eSocial/x</localizacao></ocorrencia></ocorrencias></processamento></retornoEvento></evento></retornoEventos>` });
  assert.equal(resp.processado, true);
  assert.deepEqual(resp.eventos.map((e) => [e.id, e.ok, e.recibo]), [["ID1", true, "1.2.3"], ["ID2", false, null]]);
  assert.equal(resp.eventos[1].ocorrencias[0].descricao, "Campo inválido");
});

/* ---------- Biometria ponta a ponta ---------- */

function cbor(v) {
  const cab = (tipo, n) => (n < 24 ? Buffer.from([(tipo << 5) | n]) : n < 256 ? Buffer.from([(tipo << 5) | 24, n]) : Buffer.from([(tipo << 5) | 25, n >> 8, n & 255]));
  if (Buffer.isBuffer(v)) return Buffer.concat([cab(2, v.length), v]);
  if (typeof v === "string") return Buffer.concat([cab(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (typeof v === "number") return v >= 0 ? cab(0, v) : cab(1, -1 - v);
  if (v instanceof Map) return Buffer.concat([cab(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error("tipo");
}
const sha = (b) => createHash("sha256").update(b).digest();

let s;
before(async () => (s = await subir()));
after(() => s.fechar());

test("biometria: cadastro WebAuthn e ponto confirmado pela digital", async () => {
  const rh = s.cliente();
  await rh.post("/api/cadastro", { razao_social: "Bio Ltda", cnpj: "11222333000181", nome: "Ana", email: "ana@bio.com", senha: "senha-forte-1" });
  await rh.put("/api/empresa", { config: { ponto: { exige_biometria: true } } });
  const c = (await rh.post("/api/colaboradores", { nome: "Caio Bio", cpf: CPF, admissao: "2026-01-02", salario_centavos: 200000 })).dados;
  const { codigo } = (await rh.post(`/api/colaboradores/${c.id}/convite`)).dados;
  const app = s.cliente();
  await app.post("/api/app/ativar", { cpf: CPF, codigo });

  let r = await app.post("/api/app/ponto", {});
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /Cadastre sua biometria/);

  const origem = s.url;
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const credId = randomBytes(32);
  const opcoes = (await app.post("/api/app/biometria/opcoes")).dados;
  assert.equal(opcoes.rp.id, "localhost");
  assert.equal(opcoes.authenticatorSelection.userVerification, "required");
  const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]));
  const authCad = Buffer.concat([sha("localhost"), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), Buffer.from([0, 32]), credId, cose]);
  const clientCad = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: opcoes.challenge, origin: origem }));
  r = await app.post("/api/app/biometria", { id: credId.toString("base64url"), resposta: { clientDataJSON: clientCad.toString("base64url"), attestationObject: cbor(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authCad]])).toString("base64url") }, aparelho: "Teste" });
  assert.equal(r.status, 200, JSON.stringify(r.dados));

  const confirmar = async (contador, chave = privateKey) => {
    const prep = (await app.post("/api/app/ponto/preparar")).dados;
    assert.equal(prep.biometria.allowCredentials[0].id, credId.toString("base64url"));
    const authData = Buffer.concat([sha("localhost"), Buffer.from([0x05]), Buffer.from([0, 0, 0, contador])]);
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: prep.biometria.challenge, origin: origem }));
    const assinatura = sign("sha256", Buffer.concat([authData, sha(clientData)]), chave);
    return app.post("/api/app/ponto", { biometria: { id: credId.toString("base64url"), clientDataJSON: clientData.toString("base64url"), authenticatorData: authData.toString("base64url"), signature: assinatura.toString("base64url") } });
  };
  const falsa = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
  r = await confirmar(1, falsa);
  assert.equal(r.status, 401, "outra chave não passa");
  r = await confirmar(1);
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.marcacao.biometria, true);
  const marc = s.app.repo.um("SELECT biometria FROM marcacoes");
  assert.equal(marc.biometria, 1);
});
