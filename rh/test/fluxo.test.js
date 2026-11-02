/* Fluxo completo: empresa → admissão → app do trabalhador → ponto (GPS, QR) → espelho → ajuste → folha →
   eSocial (assinatura e envio com webservice simulado) → rescisão. */
import assert from "node:assert/strict";
import { createVerify } from "node:crypto";
import { after, before, test } from "node:test";
import { certificadoTeste, CNPJ, CPF, CPF2, subir } from "./ajuda.js";

let s, rh, app;
let relogio = Date.parse("2026-10-05T07:58:00-03:00");
const em = (iso) => (relogio = Date.parse(iso));
const soap = [];
const fetchSoap = async ({ url, corpo }) => {
  soap.push({ url, corpo });
  if (url.includes("enviarloteeventos")) return `<s:Envelope><s:Body><EnviarLoteEventosResponse><retornoEnvioLoteEventos><status><cdResposta>201</cdResposta><descResposta>Lote recebido com sucesso.</descResposta></status><dadosRecepcaoLote><protocoloEnvio>1.2.202610.0000000000000000001</protocoloEnvio></dadosRecepcaoLote></retornoEnvioLoteEventos></EnviarLoteEventosResponse></s:Body></s:Envelope>`;
  const ids = [...soap.find((x) => x.url.includes("enviar")).corpo.matchAll(/<evento Id="([^"]+)"/g)].map((m) => m[1]);
  return `<retornoProcessamentoLoteEventos><status><cdResposta>201</cdResposta><descResposta>Lote processado com sucesso.</descResposta></status><retornoEventos>${ids.map((id, i) => `<evento Id="${id}"><retornoEvento><processamento><cdResposta>201</cdResposta><descResposta>Sucesso.</descResposta></processamento><recibo><nrRecibo>1.1.000000000000000000${i}</nrRecibo></recibo></retornoEvento></evento>`).join("")}</retornoEventos></retornoProcessamentoLoteEventos>`;
};

let colab, jornadaComercial, estab;

before(async () => {
  s = await subir({ agora: () => relogio, fetchSoap });
  rh = s.cliente();
  app = s.cliente();
});
after(() => s.fechar());

test("cadastro da empresa e configuração inicial", async () => {
  let r = await rh.post("/api/cadastro", { razao_social: "Empresa Teste Ltda", nome_fantasia: "Loja Teste", cnpj: "11.222.333/0001-81", nome: "Ana RH", email: "ana@teste.com", senha: "senha-forte-1" });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  r = await rh.get("/api/eu");
  assert.equal(r.dados.usuario.papel, "admin");
  assert.equal(r.dados.empresa.cnpj, CNPJ);
  const jornadas = (await rh.get("/api/jornadas")).dados;
  jornadaComercial = jornadas.find((j) => j.tipo === "semanal");
  estab = (await rh.get("/api/estabelecimentos")).dados[0];
  assert.ok(estab && !("qr_segredo" in estab));
  r = await rh.put(`/api/estabelecimentos/${estab.id}`, { lat: -23.5505, lng: -46.6333, raio_m: 150, exige_gps: true });
  assert.equal(r.status, 200);
  r = await rh.post("/api/cadastro", { razao_social: "X", cnpj: "11222333000181", nome: "X", email: "x@x.com", senha: "12345678" });
  assert.equal(r.status, 403, "segundo cadastro fechado por padrão");
});

test("admissão gera o S-2200 e valida CPF", async () => {
  const cargo = (await rh.post("/api/cargos", { nome: "Vendedor", cbo: "521110" })).dados;
  let r = await rh.post("/api/colaboradores", { nome: "Bruno Lima", cpf: "123.456.789-00", admissao: "2026-09-01", salario_centavos: 300000 });
  assert.equal(r.status, 400, "CPF inválido");
  r = await rh.post("/api/colaboradores", { nome: "Bruno Lima", cpf: "529.982.247-25", nascimento: "1995-03-10", sexo: "M", admissao: "2026-09-01", salario_centavos: 300000, cargo_id: cargo.id, jornada_id: jornadaComercial.id, endereco: { logradouro: "Rua A", numero: "10", cep: "01001000", uf: "SP", cod_municipio: "3550308", bairro: "Centro" } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  colab = r.dados;
  assert.equal(colab.matricula, "00001");
  assert.equal(r.dados.evento_esocial.tipo, "S-2200");
  const ev = (await rh.get("/api/esocial/eventos")).dados.find((e) => e.tipo === "S-2200");
  assert.equal(ev.status, "gerado");
  const xml = (await rh.get(`/api/esocial/eventos/${ev.id}/xml`)).dados;
  assert.match(xml, /<evtAdmissao Id="ID111222333000000/);
  assert.match(xml, /<cpfTrab>52998224725<\/cpfTrab>/);
  assert.match(xml, /<vrSalFx>3000.00<\/vrSalFx>/);
  assert.match(xml, /<CBOCargo>521110<\/CBOCargo>/);
  r = await rh.post("/api/colaboradores", { nome: "Duplicado", cpf: CPF, admissao: "2026-09-01", salario_centavos: 1 });
  assert.equal(r.status, 409);
});

test("ativação do aplicativo com CPF e código", async () => {
  let r = await app.get("/api/app/eu");
  assert.equal(r.status, 401);
  const conv = (await rh.post(`/api/colaboradores/${colab.id}/convite`)).dados;
  assert.match(conv.codigo, /^\d{6}$/);
  assert.match(conv.mensagem, /código/);
  r = await app.post("/api/app/ativar", { cpf: CPF, codigo: "000000" });
  assert.equal(r.status, 401);
  r = await app.post("/api/app/ativar", { cpf: "529.982.247-25", codigo: conv.codigo });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  r = await app.get("/api/app/eu");
  assert.equal(r.dados.colaborador.primeiro_nome, "Bruno");
  assert.equal(r.dados.hoje.proxima, "Entrada");
  r = await app.post("/api/app/ativar", { cpf: CPF, codigo: conv.codigo });
  assert.equal(r.status, 401, "código é de uso único");
  // A sessão do app não abre o painel
  assert.equal((await app.get("/api/colaboradores")).status, 401);
});

test("ponto pelo app com cerca de GPS", async () => {
  let r = await app.post("/api/app/ponto", {});
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /localização/);
  r = await app.post("/api/app/ponto", { lat: -23.56, lng: -46.65, precisao: 10 });
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /Você está a \d+ m/);
  r = await app.post("/api/app/ponto", { lat: -23.5506, lng: -46.6334, precisao: 15 });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.marcacao.hora, "07:58");
  assert.equal(r.dados.marcacao.nsr, 1);
  assert.equal(r.dados.comprovante.nsr, "000000001");
  assert.equal(r.dados.hoje.proxima, "Saída para intervalo");
  relogio += 20_000;
  r = await app.post("/api/app/ponto", { lat: -23.5506, lng: -46.6334 });
  assert.equal(r.status, 409, "toque duplo");
  const bate = async (iso) => {
    em(iso);
    const x = await app.post("/api/app/ponto", { lat: -23.5506, lng: -46.6334 });
    assert.equal(x.status, 200, JSON.stringify(x.dados));
  };
  await bate("2026-10-05T12:00:00-03:00");
  await bate("2026-10-05T13:00:00-03:00");
  await bate("2026-10-05T17:50:00-03:00");
  // Terça: hora extra até 19:48
  await bate("2026-10-06T08:00:00-03:00");
  await bate("2026-10-06T12:00:00-03:00");
  await bate("2026-10-06T13:00:00-03:00");
  await bate("2026-10-06T19:48:00-03:00");
  // Quarta: esqueceu a saída do intervalo e a volta
  await bate("2026-10-07T08:00:00-03:00");
  await bate("2026-10-07T17:48:00-03:00");
});

test("espelho de ponto calcula horas, extras e faltas", async () => {
  em("2026-10-09T10:00:00-03:00");
  const e = (await rh.get(`/api/ponto/espelho/${colab.id}/2026-10`)).dados;
  const dia = (d) => e.dias.find((x) => x.data === d);
  assert.equal(dia("2026-10-05").trabalhado, 532);
  assert.equal(dia("2026-10-05").extra50, 0, "4 minutos dentro da tolerância");
  assert.equal(dia("2026-10-06").extra50, 120);
  assert.equal(dia("2026-10-07").trabalhado, 588);
  assert.equal(dia("2026-10-08").falta, true);
  assert.equal(dia("2026-10-10").status, "folga", "sábado");
  assert.equal(dia("2026-10-13").status, "futuro");
  assert.equal(dia("2026-10-04").status, "folga");
  assert.equal(dia("2026-10-12").status, "feriado", "Nossa Senhora Aparecida");
  assert.ok(e.totais.faltas >= 2, "1 e 2 de outubro (qui/sex) e 8 de outubro");
});

test("ajuste solicitado no app e aprovado pelo RH", async () => {
  let r = await app.post("/api/app/ajustes", { data: "2026-10-08", tipo: "abono", motivo: "Consulta médica" });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const pend = (await rh.get("/api/ajustes")).dados;
  assert.equal(pend.length, 1);
  assert.equal((await rh.get("/api/eu")).dados.contagem.ajustes, 1);
  r = await rh.post(`/api/ajustes/${pend[0].id}/decidir`, { aprovar: true, resposta: "Ok, atestado entregue" });
  assert.equal(r.status, 200);
  const e = (await app.get("/api/app/espelho/2026-10")).dados;
  assert.equal(e.dias.find((x) => x.data === "2026-10-08").status, "abonado");
});

test("quiosque com QR Code rotativo", async () => {
  let r = await rh.post(`/api/estabelecimentos/${estab.id}/quiosque`);
  const [idTok] = r.dados.link.split("#").slice(1);
  r = await s.cliente().get("/api/quiosque/qr", { "x-quiosque": "errado.token" });
  assert.equal(r.status, 401);
  r = await s.cliente().get("/api/quiosque/qr", { "x-quiosque": idTok });
  assert.equal(r.status, 200);
  assert.match(r.dados.svg, /<svg/);
  const token = decodeURIComponent(r.dados.url.split("q=")[1]);
  await rh.put(`/api/estabelecimentos/${estab.id}`, { exige_qr: true });
  r = await app.post("/api/app/ponto", { lat: -23.5506, lng: -46.6334 });
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /QR Code/);
  r = await app.post("/api/app/ponto", { qr: token });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.marcacao.qr, true);
  relogio += 120_000;
  r = await app.post("/api/app/ponto", { qr: token });
  assert.equal(r.status, 400, "QR antigo não vale");
  assert.match(r.dados.erro, /expirado/);
  // PIN no quiosque
  assert.equal((await app.put("/api/app/pin", { pin: "1234" })).status, 400, "PIN óbvio");
  assert.equal((await app.put("/api/app/pin", { pin: "4826" })).status, 200);
  const q = s.cliente();
  r = await q.post("/api/quiosque/ponto", { cpf: CPF, pin: "0000" }, { "x-quiosque": idTok });
  assert.equal(r.status, 401);
  r = await q.post("/api/quiosque/ponto", { cpf: CPF, pin: "4826" }, { "x-quiosque": idTok });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.nome, "Bruno");
  await rh.put(`/api/estabelecimentos/${estab.id}`, { exige_qr: false });
});

test("AFD, AEJ e cadeia de integridade", async () => {
  let r = await rh.get("/api/ponto/afd?de=2026-10-01&ate=2026-10-31");
  assert.equal(r.status, 200);
  const linhas = r.dados.trim().split("\r\n");
  assert.equal(linhas[0].slice(9, 10), "1");
  assert.ok(linhas.slice(1, -1).every((l) => l[9] === "7"));
  assert.equal(linhas.length, 2 + 12);
  assert.match(linhas[1], /^0000000017/);
  assert.match(linhas.at(-1), /^999999999/);
  r = await rh.get("/api/ponto/integridade");
  assert.deepEqual(r.dados, { ok: true, total: 12 });
  s.app.repo.rodar("UPDATE marcacoes SET momento = momento + 60000 WHERE nsr = 3");
  r = await rh.get("/api/ponto/integridade");
  assert.equal(r.dados.ok, false);
  assert.equal(r.dados.nsr, 3);
  s.app.repo.rodar("UPDATE marcacoes SET momento = momento - 60000 WHERE nsr = 3");
  r = await rh.get("/api/ponto/aej?competencia=2026-10");
  assert.match(r.dados, /^01\|1\|11222333000181/);
  assert.match(r.dados, /\r\n99\|/);
});

test("folha mensal, holerite no app e eventos periódicos", async () => {
  em("2026-11-03T10:00:00-03:00");
  let r = await rh.post("/api/beneficios", { nome: "Vale-transporte", tipo: "vt", valor_centavos: 22000 });
  await rh.put(`/api/colaboradores/${colab.id}/beneficios`, { itens: [{ beneficio_id: r.dados.id }] });
  await rh.post("/api/colaboradores/" + colab.id + "/dependentes", { nome: "Filho Lima", parentesco: "filho", nascimento: "2020-01-01", irrf: true, salario_familia: true });
  await rh.post("/api/lancamentos", { colaborador_id: colab.id, competencia: "2026-10", descricao: "Comissão", tipo: "provento", valor_centavos: 50000 });
  r = await rh.post("/api/folhas/calcular", { competencia: "2026-10" });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const item = r.dados.itens[0];
  const rub = (c) => item.rubricas.find((x) => x.codigo === c);
  assert.equal(rub("SAL").valor, 300000);
  assert.ok(rub("HE50").valor > 0);
  assert.ok(rub("FALTAS").valor > 0);
  assert.equal(rub("VT").valor, 18000, "6% de 3.000");
  assert.ok(rub("INSS").valor > 0);
  assert.equal(item.liquido, item.bruto - item.descontos);
  assert.equal(item.fgts, Math.round(item.base_fgts * 0.08));
  assert.equal((await app.get("/api/app/holerites")).dados.length, 0, "só aparece depois de fechar");
  r = await rh.post(`/api/folhas/${r.dados.id}/fechar`, { data_pagamento: "2026-11-05" });
  assert.equal(r.status, 200);
  assert.equal(r.dados.eventos_esocial, 3);
  const hs = (await app.get("/api/app/holerites")).dados;
  assert.equal(hs.length, 1);
  const h = (await app.get(`/api/app/holerites/${hs[0].id}`)).dados;
  assert.equal(h.liquido, item.liquido);
  assert.equal(typeof h.irrf, "number", "IRRF do holerite é valor, não booleano");
  assert.equal(h.irrf, item.irrf);
  r = await app.post("/api/app/espelho/2026-10/assinar");
  assert.equal(r.status, 200);
  assert.equal((await app.post("/api/app/espelho/2026-10/assinar")).status, 409);
});

test("eSocial: certificado, assinatura XMLDSig e envio em lotes", async () => {
  const pfx = certificadoTeste("senha123");
  let r = await rh.post("/api/esocial/certificado", pfx, { "content-type": "application/x-pkcs12", "x-senha": "errada" });
  assert.equal(r.status, 400);
  r = await rh.post("/api/esocial/certificado", pfx, { "content-type": "application/x-pkcs12", "x-senha": "senha123" });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.match(r.dados.titular, /EMPRESA TESTE/);
  const emp = (await rh.get("/api/empresa")).dados;
  assert.ok(!JSON.stringify(emp).includes("v1."), "o certificado não vai para o navegador");
  r = await rh.post("/api/esocial/tabelas");
  assert.ok(r.dados.gerados > 20);
  const ev = (await rh.get("/api/esocial/eventos?tipo=S-1000")).dados[0];
  assert.equal(ev.status, "assinado");
  const xml = (await rh.get(`/api/esocial/eventos/${ev.id}/xml`)).dados;
  const signedInfo = /<SignedInfo>[\s\S]*<\/SignedInfo>/.exec(xml)[0].replace("<SignedInfo>", '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">');
  const valor = /<SignatureValue>([^<]+)/.exec(xml)[1];
  const cert = /<X509Certificate>([^<]+)/.exec(xml)[1];
  const pem = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----`;
  assert.ok(createVerify("RSA-SHA256").update(signedInfo).verify(pem, valor, "base64"), "assinatura confere");
  r = await rh.post("/api/esocial/assinar");
  assert.equal(r.status, 200);
  r = await rh.post("/api/esocial/enviar", {});
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.ambiente, 2);
  assert.deepEqual(r.dados.lotes.map((l) => l.grupo), [1, 2, 3]);
  assert.ok(soap[0].url.includes("producaorestrita"));
  assert.match(soap[0].corpo, /<envioLoteEventos grupo="1">/);
  assert.ok(r.dados.lotes.every((l) => l.ok));
  soap.length = 0;
  r = await rh.post("/api/esocial/enviar", {});
  assert.equal(r.status, 400, "nada mais a enviar");
  // Simula a consulta com recibos (um lote por vez para o simulador)
  const lotes = (await rh.get("/api/esocial/lotes")).dados;
  assert.equal(lotes.length, 3);
});

test("rescisão gera o S-2299 e desconecta o app", async () => {
  let r = await rh.post("/api/rescisao/simular", { colaborador_id: colab.id, data: "2026-11-10", tipo: "sem_justa_causa", aviso: "indenizado" });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.dias_aviso, 30);
  assert.equal(r.dados.seguro_desemprego, true);
  assert.ok(r.dados.rubricas.some((x) => x.codigo === "D13PROP"));
  r = await rh.post("/api/rescisao/efetivar", { colaborador_id: colab.id, data: "2026-11-10", tipo: "sem_justa_causa", aviso: "indenizado" });
  assert.equal(r.status, 200);
  assert.equal(r.dados.evento_esocial.tipo, "S-2299");
  assert.equal((await app.get("/api/app/eu")).status, 401);
});

test("vagas públicas e candidatura", async () => {
  const v = (await rh.post("/api/vagas", { titulo: "Atendente", descricao: "Atendimento ao cliente" })).dados;
  const link = (await rh.get("/api/vagas/link")).dados.link;
  const empresaId = link.split("e=")[1];
  const pub = s.cliente();
  let r = await pub.get(`/api/publico/vagas/${empresaId}`);
  assert.equal(r.dados.vagas.length, 1);
  r = await pub.post(`/api/publico/vagas/${empresaId}/${v.id}`, { nome: "Carla", email: "carla@x.com", telefone: "11999999999" });
  assert.equal(r.status, 400, "precisa do consentimento LGPD");
  r = await pub.post(`/api/publico/vagas/${empresaId}/${v.id}`, { nome: "Carla", email: "carla@x.com", telefone: "11999999999", consentimento: true, curriculo: { nome: "cv.pdf", tipo: "application/pdf", base64: Buffer.from("%PDF-1.4 teste").toString("base64") } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const cands = (await rh.get("/api/candidatos")).dados;
  assert.equal(cands[0].nome, "Carla");
  r = await rh.get(`/api/arquivos/${cands[0].curriculo}`);
  assert.equal(r.dados, "%PDF-1.4 teste");
});

test("perfil gestor só vê a própria equipe", async () => {
  const deps = (await rh.get("/api/departamentos")).dados;
  const u = (await rh.post("/api/usuarios", { nome: "Gil Gestor", email: "gil@teste.com", senha: "senha-gestor", papel: "gestor", departamento_id: deps[0].id })).dados;
  const outro = (await rh.post("/api/colaboradores", { nome: "Dora Silva", cpf: CPF2, admissao: "2026-01-05", salario_centavos: 250000, departamento_id: deps[0].id })).dados;
  await rh.post("/api/colaboradores", { nome: "Eva Costa", cpf: "39053344705", admissao: "2026-01-05", salario_centavos: 250000, departamento_id: deps[1].id });
  const g = s.cliente();
  assert.equal((await g.post("/api/entrar", { email: "gil@teste.com", senha: "senha-gestor" })).status, 200);
  const lista = (await g.get("/api/colaboradores")).dados;
  assert.deepEqual(lista.map((c) => c.nome), ["Dora Silva"]);
  assert.equal((await g.post("/api/folhas/calcular", { competencia: "2026-10" })).status, 403);
  assert.equal((await g.get(`/api/colaboradores/${outro.id}`)).status, 200);
  assert.ok(u.id);
});
