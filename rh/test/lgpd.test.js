/* LGPD: aceite de termos, exportação e exclusão de titular (com bloqueio do que a lei manda guardar),
   isolamento entre empresas e expurgo por prazo. */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { lerPrazos, mascarar, somarMeses } from "../src/lgpd/motor.js";
import { PRAZOS_PADRAO } from "../src/lgpd/mapa.js";
import { CPF, CPF2, subir } from "./ajuda.js";

let s;
let a; // admin da empresa A
let b; // admin da empresa B
let empA;
before(async () => {
  s = await subir({ cfg: { permitirCadastro: true } });
  a = s.cliente();
  b = s.cliente();
  assert.equal((await a.post("/api/cadastro", { razao_social: "Empresa A Ltda", cnpj: "11.222.333/0001-81", nome: "Ana A", email: "ana@a.com", senha: "senha-forte-1" })).status, 400, "sem aceite dos termos");
  assert.equal((await a.post("/api/cadastro", { aceite_termos: true, razao_social: "Empresa A Ltda", cnpj: "11.222.333/0001-81", nome: "Ana A", email: "ana@a.com", senha: "senha-forte-1" })).status, 200);
  assert.equal((await b.post("/api/cadastro", { aceite_termos: true, razao_social: "Empresa B Ltda", cnpj: "45.723.174/0001-10", nome: "Beto B", email: "beto@b.com", senha: "senha-forte-1" })).status, 200);
  empA = (await a.get("/api/eu")).dados.empresa.id;
});
after(() => s.fechar());

const repo = () => s.app.repo;
let nsr = 0;

async function colaboradorComDados(cliente, empresa_id, cpf) {
  const c = (await cliente.post("/api/colaboradores", { nome: "Maria da Silva", cpf, email: "maria@pessoal.com", telefone: "34999990000", admissao: "2025-01-06", salario_centavos: 300000 })).dados;
  const arq = await s.app.nucleo.salvarArquivo({ empresa_id, nome: "contrato.pdf", mime: "application/pdf", dados: Buffer.from("%PDF contrato"), colaborador_id: c.id });
  repo().inserir("documentos", { empresa_id, colaborador_id: c.id, tipo: "contrato", nome: "Contrato", arquivo: arq.id });
  repo().inserir("marcacoes", { empresa_id, colaborador_id: c.id, nsr: ++nsr, momento: Date.parse("2026-10-01T11:00:00Z"), origem: "app", hash: "h1" });
  repo().inserir("credenciais", { colaborador_id: c.id, chave: "chave-publica", alg: -7 });
  return { c, arq };
}

test("termos: o cadastro grava o aceite com versão, data e IP; nova versão pede o aceite de novo", async () => {
  let eu = (await a.get("/api/eu")).dados;
  assert.equal(eu.termos.pendente, false);
  assert.equal(eu.termos.versao, s.app.cfg.termos.versao);
  const aceites = (await a.get("/api/lgpd/aceites")).dados;
  assert.equal(aceites.length, 1);
  assert.equal(aceites[0].origem, "cadastro");
  assert.ok(aceites[0].ip, "guarda o IP");
  assert.ok(aceites[0].aceito_em > 0);

  const antiga = s.app.cfg.termos.versao;
  s.app.cfg.termos.versao = "2099-01-01";
  try {
    eu = (await a.get("/api/eu")).dados;
    assert.equal(eu.termos.pendente, true, "mudou a versão: aceite pendente");
    assert.equal((await a.get("/api/colaboradores")).status, 428, "o painel espera o aceite");
    assert.equal((await a.post("/api/termos/aceite", { aceito: true, versao: "1999-01-01" })).status, 409, "versão velha da tela");
    assert.equal((await a.post("/api/termos/aceite", {})).status, 400);
    assert.equal((await a.post("/api/termos/aceite", { aceito: true, versao: "2099-01-01" })).status, 200);
    assert.equal((await a.get("/api/colaboradores")).status, 200);
    assert.deepEqual((await a.get("/api/lgpd/aceites")).dados.map((x) => x.versao).sort(), [antiga, "2099-01-01"].sort());
  } finally {
    s.app.cfg.termos.versao = antiga;
  }
});

test("termos: usuário convidado aceita no primeiro login", async () => {
  await a.post("/api/usuarios", { nome: "Rita RH", email: "rita@a.com", senha: "senha-da-rita", papel: "rh" });
  const rita = s.cliente();
  assert.equal((await rita.post("/api/entrar", { email: "rita@a.com", senha: "senha-da-rita" })).status, 200);
  assert.equal((await rita.get("/api/eu")).dados.termos.pendente, true);
  assert.equal((await rita.get("/api/colaboradores")).status, 428);
  assert.equal((await rita.post("/api/termos/aceite", { aceito: true })).status, 200);
  assert.equal((await rita.get("/api/colaboradores")).status, 200);
  // Exportar e excluir são só do administrador
  const { c } = await colaboradorComDados(a, empA, "39053344705");
  assert.equal((await rita.post(`/api/lgpd/titulares/colaborador/${c.id}/exportar`)).status, 403);
  assert.equal((await rita.post(`/api/lgpd/titulares/colaborador/${c.id}/excluir`, { confirmar: true })).status, 403);
});

test("exportar colaborador: JSON com todos os dados e os arquivos, sem segredos, e registro do pedido", async () => {
  const { c, arq } = await colaboradorComDados(a, empA, CPF);
  const r = await a.post(`/api/lgpd/titulares/colaborador/${c.id}/exportar`);
  assert.equal(r.status, 200);
  assert.match(r.cabecalhos.get("content-disposition"), /attachment; filename="dados-colaborador-/);
  const d = r.dados;
  assert.equal(d.titular.nome, "Maria da Silva");
  assert.equal(d.dados.cadastro[0].cpf, CPF);
  assert.equal(d.dados.marcacoes_de_ponto.length, 1);
  assert.equal(d.dados.documentos.length, 1);
  const anexo = d.arquivos.find((x) => x.id === arq.id);
  assert.equal(Buffer.from(anexo.base64, "base64").toString(), "%PDF contrato");
  assert.ok(!JSON.stringify(d).includes("pin_hash"), "segredos não saem");
  const pedidos = (await a.get("/api/lgpd/pedidos")).dados;
  assert.equal(pedidos[0].tipo, "exportacao");
  assert.equal(pedidos[0].autor, "Ana A");
  assert.equal(pedidos[0].referencia, "Ma*** da Si***");
  assert.ok((await a.get("/api/auditoria")).dados.some((x) => x.acao === "lgpd_exportacao"));
});

test("excluir colaborador: recusa com contrato ativo; depois do desligamento bloqueia o trabalhista e apaga o resto", async () => {
  const { c } = await colaboradorComDados(a, empA, CPF2);
  assert.equal((await a.post(`/api/lgpd/titulares/colaborador/${c.id}/excluir`, { confirmar: true })).status, 409, "contrato ativo");
  repo().atualizar("colaboradores", empA, c.id, { status: "desligado", desligamento: { data: "2026-10-31", tipo: "sem_justa_causa" } });
  assert.equal((await a.post(`/api/lgpd/titulares/colaborador/${c.id}/excluir`, {})).status, 400, "precisa confirmar");
  const r = await a.post(`/api/lgpd/titulares/colaborador/${c.id}/excluir`, { confirmar: true });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const ponto = r.dados.bloqueados.find((x) => x.parte === "marcacoes_de_ponto");
  assert.equal(ponto.guardar_ate, "2031-10-31", "5 anos a partir do desligamento");
  assert.equal(r.dados.apagados.biometria_e_aparelhos, 1);
  const depois = repo().um("SELECT * FROM colaboradores WHERE id = ?", c.id);
  assert.equal(depois.email, null);
  assert.equal(depois.telefone, null);
  assert.equal(depois.cpf, CPF2, "CPF fica: exigido pela folha e pelo eSocial");
  assert.equal(depois.lgpd_bloqueado_ate, "2031-10-31", "marcado com o maior prazo entre as partes retidas");
  assert.equal(repo().um("SELECT COUNT(*) n FROM marcacoes WHERE colaborador_id = ?", c.id).n, 1, "ponto não é apagado");
  assert.equal(repo().um("SELECT COUNT(*) n FROM credenciais WHERE colaborador_id = ?", c.id).n, 0);
  assert.ok((await a.get("/api/lgpd/bloqueios")).dados.some((x) => x.titular_id === c.id && x.categoria === "ponto"));
  assert.equal((await a.get("/api/lgpd/pedidos")).dados[0].tipo, "exclusao");
  assert.ok((await a.get("/api/auditoria")).dados.some((x) => x.acao === "lgpd_exclusao" && x.autor === "Ana A"));
});

test("empresa B não exporta nem apaga dados da empresa A", async () => {
  const { c } = await colaboradorComDados(a, empA, "71428793860");
  repo().atualizar("colaboradores", empA, c.id, { status: "desligado" });
  assert.equal((await b.post(`/api/lgpd/titulares/colaborador/${c.id}/exportar`)).status, 404);
  assert.equal((await b.post(`/api/lgpd/titulares/colaborador/${c.id}/excluir`, { confirmar: true })).status, 404);
  assert.equal(repo().um("SELECT email FROM colaboradores WHERE id = ?", c.id).email, "maria@pessoal.com", "nada mudou");
  const vaga = (await a.post("/api/vagas", { titulo: "Caixa" })).dados;
  const cand = repo().inserir("candidatos", { empresa_id: empA, vaga_id: vaga.id, nome: "Caio" });
  assert.equal((await b.post(`/api/lgpd/titulares/candidato/${cand.id}/exportar`)).status, 404);
  assert.equal((await b.post(`/api/lgpd/titulares/candidato/${cand.id}/excluir`, { confirmar: true })).status, 404);
  assert.ok(repo().obter("candidatos", empA, cand.id));
  assert.ok(!(await b.get("/api/lgpd/pedidos")).dados.some((p) => p.titular_id === c.id), "o pedido recusado não aparece para B");
  assert.equal((await a.post(`/api/lgpd/titulares/inexistente/${cand.id}/exportar`)).status, 400);
});

test("excluir candidato apaga a candidatura e o currículo", async () => {
  const vaga = (await a.post("/api/vagas", { titulo: "Vendedor" })).dados;
  const cv = await s.app.nucleo.salvarArquivo({ empresa_id: empA, nome: "cv.pdf", mime: "application/pdf", dados: Buffer.from("%PDF cv") });
  const cand = repo().inserir("candidatos", { empresa_id: empA, vaga_id: vaga.id, nome: "Carla Souza", email: "carla@x.com", curriculo: cv.id });
  const exp = (await a.post(`/api/lgpd/titulares/candidato/${cand.id}/exportar`)).dados;
  assert.equal(Buffer.from(exp.arquivos[0].base64, "base64").toString(), "%PDF cv");
  assert.equal((await a.post(`/api/lgpd/titulares/candidato/${cand.id}/excluir`, { confirmar: true })).status, 200);
  assert.equal(repo().obter("candidatos", empA, cand.id), null);
  assert.equal((await a.get(`/api/arquivos/${cv.id}`)).status, 404, "currículo removido");
});

test("expurgo: candidato não contratado há mais de 12 meses sai; recente e contratado ficam; trabalhista só bloqueio", async () => {
  const vaga = (await a.post("/api/vagas", { titulo: "Estoquista" })).dados;
  const velho = repo().inserir("candidatos", { empresa_id: empA, vaga_id: vaga.id, nome: "Velho" });
  const contratado = repo().inserir("candidatos", { empresa_id: empA, vaga_id: vaga.id, nome: "Contratado", etapa: "contratado" });
  const novo = repo().inserir("candidatos", { empresa_id: empA, vaga_id: vaga.id, nome: "Novo" });
  const antigo = Date.now() - 400 * 86400_000;
  repo().rodar("UPDATE candidatos SET atualizado_em = ? WHERE id IN (?, ?)", antigo, velho.id, contratado.id);
  const r = (await a.post("/api/lgpd/expurgo")).dados;
  assert.equal(r.resultado.candidato_nao_contratado, 1);
  assert.equal(repo().obter("candidatos", empA, velho.id), null);
  assert.ok(repo().obter("candidatos", empA, contratado.id));
  assert.ok(repo().obter("candidatos", empA, novo.id));
  assert.equal((await a.get("/api/lgpd/expurgo")).dados[0].resultado.candidato_nao_contratado, 1);
  const prazos = (await a.get("/api/lgpd/prazos")).dados;
  assert.equal(prazos.ponto.acao, "bloquear");
  assert.equal(prazos.candidato_nao_contratado.meses, 12);
  // A rotina diária não repete no mesmo dia
  assert.equal((await s.app.repo.um("SELECT COUNT(*) n FROM lgpd_expurgos WHERE empresa_id = ?", empA)).n, 1);
});

test("prazos e utilidades", () => {
  assert.equal(somarMeses("2026-01-31", 1), "2026-02-28");
  assert.equal(somarMeses("2026-10-31", 60), "2031-10-31");
  assert.equal(somarMeses("2026-03-15", -12), "2025-03-15");
  assert.equal(mascarar("Ana"), "Ana");
  const p = lerPrazos(PRAZOS_PADRAO, '{"candidato_nao_contratado": 6, "ponto": 0, "inventado": 3}');
  assert.equal(p.candidato_nao_contratado.meses, 6);
  assert.equal(p.ponto.meses, 60, "valor inválido é ignorado");
  assert.equal(p.inventado, undefined);
  assert.throws(() => lerPrazos(PRAZOS_PADRAO, "{x"));
});
