/* Integrações de recrutamento: página da vaga com JobPosting, feed XML, origem dos candidatos,
   webhook (Gupy/Solides/genérico), API da Gupy (simulada) e importação de planilha. */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { candidatosDoCsv, etapaDoFunil, mapear, MAPEAMENTOS } from "../src/recrutamento/importacao.js";
import { faixaSalarial, jobPosting } from "../src/recrutamento/publicacao.js";
import { subir } from "./ajuda.js";

const chamadasGupy = [];
const fetchFn = async (url, opcoes) => {
  chamadasGupy.push({ url, auth: opcoes.headers.Authorization });
  const u = new URL(url);
  const json = (d, status = 200) => ({ ok: status < 400, status, json: async () => d });
  if (opcoes.headers.Authorization !== "Bearer token-gupy-valido-123") return json({}, 401);
  if (u.pathname === "/api/v1/jobs") return json({ results: [{ id: 9001, name: "Vendedor Externo", addressCity: "Uberlândia", addressState: "MG", description: "<p>Vender <b>muito</b></p>" }], totalPages: 1 });
  if (u.pathname === "/api/v1/jobs/9001/applications") return json({ results: [{ id: 501, candidate: { name: "Lia Souza", email: "lia@x.com", mobileNumber: "34999990000", linkedinProfileUrl: "https://linkedin.com/in/lia" }, currentStep: { name: "Entrevista com gestor" } }, { id: 502, candidate: { name: "Rui Prado", email: "rui@x.com" }, currentStep: { name: "Triagem" } }], totalPages: 1 });
  return json({}, 404);
};

let s, rh, empresaId, vaga;
before(async () => {
  s = await subir({ fetchFn });
  rh = s.cliente();
  await rh.post("/api/cadastro", { razao_social: "Recruta Ltda", nome_fantasia: "Recruta", cnpj: "11222333000181", nome: "Ana", email: "ana@r.com", senha: "senha-forte-1" });
  vaga = (await rh.post("/api/vagas", { titulo: "Atendente", descricao: "Atender clientes", requisitos: "Ensino médio", salario: "R$ 2.100 a R$ 2.400", local: "Uberlândia", estado: "MG", tipo_contrato: "clt" })).dados;
  empresaId = (await rh.get("/api/eu")).dados.empresa.id;
});
after(() => s.fechar());

test("faixa salarial e JobPosting", () => {
  assert.deepEqual(faixaSalarial("R$ 2.100 a R$ 2.400 + VT"), { min: 2100, max: 2400 });
  assert.equal(faixaSalarial("A combinar"), null);
  const j = jobPosting({ vaga: { id: "v1", titulo: "Dev", descricao: "Código", criada_em: Date.parse("2026-10-01"), modalidade: "remoto", salario: "R$ 8.000" }, empresa: { razao_social: "X" }, base: "https://rh.x.com" });
  assert.equal(j["@type"], "JobPosting");
  assert.equal(j.jobLocationType, "TELECOMMUTE");
  assert.equal(j.baseSalary.value.value, 8000);
  assert.equal(j.validThrough, "2026-11-30T23:59:59-03:00");
});

test("página da vaga tem JobPosting e prévia de link", async () => {
  const r = await fetch(`${s.url}/vagas/v/${vaga.id}`);
  const html = await r.text();
  assert.equal(r.status, 200);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
  assert.equal(ld.title, "Atendente");
  assert.equal(ld.employmentType, "FULL_TIME");
  assert.equal(ld.jobLocation.address.addressRegion, "MG");
  assert.deepEqual([ld.baseSalary.value.minValue, ld.baseSalary.value.maxValue], [2100, 2400]);
  assert.match(html, /og:title" content="Vaga: Atendente/);
  await rh.put(`/api/vagas/${vaga.id}`, { status: "fechada" });
  const fechada = await fetch(`${s.url}/vagas/v/${vaga.id}`);
  assert.equal(fechada.status, 410);
  assert.doesNotMatch(await fechada.text(), /JobPosting/);
  await rh.put(`/api/vagas/${vaga.id}`, { status: "aberta" });
});

test("feed XML e sitemap", async () => {
  const xml = await (await fetch(`${s.url}/vagas/feed/${empresaId}.xml`)).text();
  assert.match(xml, /^<\?xml/);
  assert.match(xml, /<title><!\[CDATA\[Atendente\]\]><\/title>/);
  assert.match(xml, /origem=feed/);
  assert.match(xml, /<state><!\[CDATA\[MG\]\]><\/state>/);
  const sm = await (await fetch(`${s.url}/vagas/sitemap/${empresaId}.xml`)).text();
  assert.match(sm, new RegExp(`/vagas/v/${vaga.id}`));
});

test("candidatura pelo link com origem", async () => {
  const r = await s.cliente().post(`/api/publico/vagas/${empresaId}/${vaga.id}`, { nome: "Gil", email: "gil@x.com", telefone: "11988887777", consentimento: true, origem: "linkedin" });
  assert.equal(r.status, 200);
  const i = (await rh.get("/api/recrutamento/integracoes")).dados;
  assert.deepEqual(i.por_origem.map((o) => [o.origem, o.n]), [["linkedin", 1]]);
  assert.ok(i.divulgacao[0].links.find((l) => l.id === "linkedin").compartilhar.startsWith("https://www.linkedin.com/sharing/share-offsite/?url="));
});

test("webhook: exige token, mapeia Gupy e não duplica", async () => {
  const ext = s.cliente();
  const enviar = (url, corpo) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }).then(async (r) => ({ status: r.status, dados: await r.json() }));
  let r = await enviar(`${s.url}/api/publico/recrutamento/${empresaId}/gupy?token=errado`, {});
  assert.equal(r.status, 401);
  const { urls } = (await rh.post("/api/recrutamento/webhook-token")).dados;
  const evento = { event: "application.created", data: { id: 777, job: { id: "g-55", name: "Estoquista" }, candidate: { name: "Bia Lopes", email: "bia@x.com", mobileNumber: "34988887777" }, currentStep: { name: "Inscritos" } } };
  r = await enviar(urls.gupy, evento);
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.deepEqual([r.dados.criados, r.dados.vagas_criadas], [1, 1]);
  r = await enviar(urls.gupy, { ...evento, data: { ...evento.data, currentStep: { name: "Entrevista" } } });
  assert.deepEqual([r.dados.criados, r.dados.atualizados], [0, 1]);
  const bia = (await rh.get("/api/candidatos")).dados.find((c) => c.nome === "Bia Lopes");
  assert.equal(bia.etapa, "entrevista");
  assert.equal(bia.origem, "gupy");
  assert.equal(bia.vaga, "Estoquista");
  r = await enviar(urls.generico.replace("?token", "?origem=catho&token"), [{ nome: "Caio", email: "caio@x.com", vaga: vaga.id }]);
  assert.equal(r.dados.criados, 1);
  assert.ok(!JSON.stringify((await rh.get("/api/empresa")).dados).includes("webhook_hash"));
  void ext;
});

test("API da Gupy: sincroniza vagas e candidaturas", async () => {
  let r = await rh.post("/api/recrutamento/gupy/sincronizar");
  assert.equal(r.status, 400);
  await rh.put("/api/recrutamento/gupy", { token: "token-errado-xxxx" });
  r = await rh.post("/api/recrutamento/gupy/sincronizar");
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /recusou o token/);
  await rh.put("/api/recrutamento/gupy", { token: "token-gupy-valido-123" });
  r = await rh.post("/api/recrutamento/gupy/sincronizar");
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.deepEqual(r.dados, { vagas: 1, recebidos: 2, criados: 2, atualizados: 0 });
  r = await rh.post("/api/recrutamento/gupy/sincronizar");
  assert.equal(r.dados.criados, 0, "segunda sincronização não duplica");
  const vagas = (await rh.get("/api/vagas")).dados;
  const v = vagas.find((x) => x.titulo === "Vendedor Externo");
  assert.equal(v.status, "pausada");
  assert.equal(v.candidatos, 2);
  const lia = (await rh.get("/api/candidatos")).dados.find((c) => c.nome === "Lia Souza");
  assert.equal(lia.etapa, "entrevista");
  assert.equal(lia.linkedin, "https://linkedin.com/in/lia");
  assert.ok(chamadasGupy.every((c) => c.url.startsWith("https://api.gupy.io/api/v1/")));
  assert.ok(!JSON.stringify((await rh.get("/api/empresa")).dados).includes("token-gupy"));
});

test("planilha CSV de outras plataformas", async () => {
  const csv = "﻿Nome completo;E-mail;Celular;Cidade;Vaga\nDora Lima;dora@x.com;(34) 99999-1111;Uberlândia;Atendente\n\"Eli, o Rápido\";eli@x.com;;;Atendente\n;;;;\n";
  assert.deepEqual(candidatosDoCsv(csv).candidatos.map((c) => c.nome), ["Dora Lima", "Eli, o Rápido"]);
  let r = await rh.post("/api/recrutamento/importar-csv", { csv, origem: "infojobs", simular: true });
  assert.equal(r.dados.total, 2);
  assert.equal(r.dados.colunas.email, "E-mail");
  r = await rh.post("/api/recrutamento/importar-csv", { csv, origem: "infojobs" });
  assert.deepEqual([r.dados.criados, r.dados.vagas_criadas], [2, 0]);
  r = await rh.post("/api/recrutamento/importar-csv", { csv: "x;y\n1;2", origem: "catho" });
  assert.equal(r.status, 400);
});

test("mapeamento e etapas", () => {
  assert.deepEqual(mapear({ candidato: { nome: "A", email: "a@x" }, vaga: { id: 3 } }, MAPEAMENTOS.solides), { nome: "A", email: "a@x", vaga_codigo: "3" });
  assert.equal(etapaDoFunil("Entrevista técnica"), "entrevista");
  assert.equal(etapaDoFunil("Reprovado na triagem"), "reprovado");
  assert.equal(etapaDoFunil("Contratado"), "contratado");
  assert.equal(etapaDoFunil("Inscrito"), null);
});

test("página de download e arquivos de App Links / Universal Links", async () => {
  const html = await (await fetch(`${s.url}/baixar`)).text();
  assert.match(html, /Meu Ponto/);
  assert.match(html, /versão web do app/);
  assert.equal((await fetch(`${s.url}/.well-known/assetlinks.json`)).status, 404, "sem SHA-256 configurado");
  s.app.cfg.apps.androidSha256 = ["AA:BB"];
  s.app.cfg.apps.appleTeamId = "ABCDE12345";
  const al = await (await fetch(`${s.url}/.well-known/assetlinks.json`)).json();
  assert.equal(al[0].target.package_name, "br.com.nexorconsultingit.ponto");
  const aasa = await (await fetch(`${s.url}/.well-known/apple-app-site-association`)).json();
  assert.deepEqual(aasa.applinks.details[0].appIDs, ["ABCDE12345.br.com.nexorconsultingit.ponto"]);
});
