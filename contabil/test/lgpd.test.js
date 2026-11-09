/* LGPD no Contábil: aceite de termos, exportação e exclusão de cliente (fiscal bloqueado) e de contato do portal,
   isolamento entre escritórios e expurgo por prazo. */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { CNPJ_ESCRITORIO, PDF, subir } from "./ajuda.js";

let s;
let eq;
let emp;
before(async () => {
  s = await subir();
  eq = s.cliente();
  assert.equal((await eq.post("/api/cadastro", { razao_social: "Contábil Exemplo Ltda", cnpj: CNPJ_ESCRITORIO, nome: "Marta Lima", email: "marta@contabil.com", senha: "senha-forte-1" })).status, 400, "sem aceite");
  assert.equal((await eq.post("/api/cadastro", { aceite_termos: true, razao_social: "Contábil Exemplo Ltda", cnpj: CNPJ_ESCRITORIO, nome: "Marta Lima", email: "marta@contabil.com", senha: "senha-forte-1" })).status, 200);
  emp = (await eq.get("/api/eu")).dados.empresa?.id ?? s.app.repo.um("SELECT id FROM empresas").id;
});
after(() => s.fechar());
const repo = () => s.app.repo;

async function clienteComDocumentos(cnpj) {
  const c = (await eq.post("/api/clientes", { razao_social: "Padaria Pão Dourado Ltda", cnpj, regime: "simples", contato_nome: "Rosa Martins", whatsapp: "(34) 99999-0001", email: "rosa@pao.com.br" })).dados;
  const arq = await s.app.nucleo.salvarArquivo(emp, { nome: "nota.pdf", mime: "application/pdf", dados: PDF });
  repo().inserir("documentos", { empresa_id: emp, cliente_id: c.id, arquivo_id: arq.id, nome: "nota.pdf", tamanho: PDF.length, hash: arq.hash, origem: "equipe" });
  repo().inserir("mensagens", { empresa_id: emp, cliente_id: c.id, wa_id: "5534999990001", direcao: "entrada", tipo: "text", texto: "segue a nota" });
  const p = (await eq.post(`/api/clientes/${c.id}/portal`, { nome: "Rosa Martins", email: "rosa@pao.com.br", whatsapp: "34999990001" })).dados.usuario;
  return { c, arq, p };
}

test("termos: aceite gravado no cadastro com IP; nova versão bloqueia o painel até aceitar", async () => {
  assert.equal((await eq.get("/api/eu")).dados.termos.pendente, false);
  const aceites = (await eq.get("/api/lgpd/aceites")).dados;
  assert.equal(aceites[0].origem, "cadastro");
  assert.ok(aceites[0].ip);
  const antiga = s.app.cfg.termos.versao;
  s.app.cfg.termos.versao = "2099-01-01";
  try {
    assert.equal((await eq.get("/api/clientes")).status, 428);
    assert.equal((await eq.post("/api/termos/aceite", { aceito: true, versao: "2099-01-01" })).status, 200);
    assert.equal((await eq.get("/api/clientes")).status, 200);
  } finally {
    s.app.cfg.termos.versao = antiga;
  }
});

test("exportar e excluir cliente: documentos fiscais bloqueados; contato anonimizado; portal e WhatsApp apagados", async () => {
  const { c, arq } = await clienteComDocumentos("45.723.174/0001-10");
  const exp = await eq.post(`/api/lgpd/titulares/cliente/${c.id}/exportar`);
  assert.equal(exp.status, 200);
  assert.equal(exp.dados.dados.cadastro[0].contato_nome, "Rosa Martins");
  assert.equal(exp.dados.dados.documentos.length, 1);
  assert.equal(exp.dados.dados.mensagens_whatsapp.length, 1);
  assert.equal(exp.dados.dados.contatos_do_portal.length, 1);
  assert.equal(Buffer.from(exp.dados.arquivos.find((x) => x.id === arq.id).base64, "base64").toString(), PDF.toString());
  assert.ok(!JSON.stringify(exp.dados).includes("senha_hash"));

  assert.equal((await eq.post(`/api/lgpd/titulares/cliente/${c.id}/excluir`, { confirmar: true })).status, 409, "cliente ativo");
  await eq.put(`/api/clientes/${c.id}`, { ativo: false });
  const r = await eq.post(`/api/lgpd/titulares/cliente/${c.id}/excluir`, { confirmar: true });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.bloqueados.find((b) => b.parte === "documentos").categoria, "fiscal");
  const depois = repo().um("SELECT * FROM clientes WHERE id = ?", c.id);
  assert.equal(depois.contato_nome, null);
  assert.equal(depois.email, null);
  assert.equal(depois.cnpj, "45723174000110", "CNPJ fica para os registros fiscais");
  assert.ok(depois.lgpd_bloqueado_ate);
  assert.equal(repo().um("SELECT COUNT(*) n FROM documentos WHERE cliente_id = ?", c.id).n, 1, "documento fiscal fica");
  assert.equal(repo().um("SELECT COUNT(*) n FROM portal_usuarios WHERE cliente_id = ?", c.id).n, 0);
  assert.equal(repo().um("SELECT COUNT(*) n FROM mensagens WHERE cliente_id = ?", c.id).n, 0);
  const pedidos = (await eq.get("/api/lgpd/pedidos")).dados;
  assert.deepEqual(pedidos.slice(0, 2).map((p) => p.tipo), ["exclusao", "exportacao"]);
  assert.equal(pedidos[0].autor, "Marta Lima");
});

test("excluir contato do portal apaga o acesso e as sessões", async () => {
  const { p, c } = await clienteComDocumentos("19.131.243/0001-97");
  const r = await eq.post(`/api/lgpd/titulares/contato/${p.id}/excluir`, { confirmar: true });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.apagados.cadastro, 1);
  assert.equal(repo().um("SELECT COUNT(*) n FROM portal_usuarios WHERE id = ?", p.id).n, 0);
  assert.ok(repo().um("SELECT 1 FROM clientes WHERE id = ?", c.id), "o cliente continua");
});

test("escritório B não exporta nem apaga dados do escritório A; perfil equipe não acessa", async () => {
  const outro = repo().inserir("empresas", { razao_social: "Outro Escritório", cnpj: "60701190000104", config: {} });
  const deOutro = repo().inserir("clientes", { empresa_id: outro.id, razao_social: "Mercado Z", cnpj: "11444777000161", regime: "mei", contato_nome: "Zé", ativo: false });
  assert.equal((await eq.post(`/api/lgpd/titulares/cliente/${deOutro.id}/exportar`)).status, 404);
  assert.equal((await eq.post(`/api/lgpd/titulares/cliente/${deOutro.id}/excluir`, { confirmar: true })).status, 404);
  assert.equal(repo().um("SELECT contato_nome FROM clientes WHERE id = ?", deOutro.id).contato_nome, "Zé");
  await eq.post("/api/usuarios", { nome: "João", email: "joao@contabil.com", senha: "senha-forte-2", papel: "equipe", departamento: "fiscal" });
  const joao = s.cliente();
  await joao.post("/api/entrar", { email: "joao@contabil.com", senha: "senha-forte-2" });
  await joao.post("/api/termos/aceite", { aceito: true });
  const meu = repo().um("SELECT id FROM clientes WHERE empresa_id = ? LIMIT 1", emp);
  assert.equal((await joao.post(`/api/lgpd/titulares/cliente/${meu.id}/exportar`)).status, 403);
  assert.equal((await joao.post(`/api/lgpd/titulares/cliente/${meu.id}/excluir`, { confirmar: true })).status, 403);
});

test("expurgo: WhatsApp e chamados resolvidos com mais de 24 meses saem; fiscal nunca é apagado", async () => {
  const { c } = await clienteComDocumentos("60.701.190/0001-04");
  const velho = Date.now() - 26 * 31 * 86400_000;
  repo().inserir("mensagens", { empresa_id: emp, cliente_id: c.id, wa_id: "5534999990001", direcao: "entrada", tipo: "text", texto: "antiga" });
  repo().rodar("UPDATE mensagens SET criado_em = ? WHERE texto = 'antiga'", velho);
  repo().inserir("chamados", { empresa_id: emp, cliente_id: c.id, assunto: "Dúvida antiga", status: "resolvido" });
  repo().rodar("UPDATE chamados SET atualizado_em = ? WHERE assunto = 'Dúvida antiga'", velho);
  repo().rodar("UPDATE documentos SET criado_em = ? WHERE cliente_id = ?", velho, c.id);
  const r = (await eq.post("/api/lgpd/expurgo")).dados;
  assert.equal(r.resultado.conversa_atendimento, 1);
  assert.equal(r.resultado.chamado_resolvido, 1);
  assert.equal(repo().um("SELECT COUNT(*) n FROM mensagens WHERE texto = 'antiga'").n, 0);
  assert.equal(repo().um("SELECT COUNT(*) n FROM mensagens WHERE texto = 'segue a nota' AND cliente_id = ?", c.id).n, 1);
  assert.equal(repo().um("SELECT COUNT(*) n FROM documentos WHERE cliente_id = ?", c.id).n, 1, "documento fiscal velho não é apagado");
  const prazos = (await eq.get("/api/lgpd/prazos")).dados;
  assert.equal(prazos.fiscal.acao, "bloquear");
  assert.equal(prazos.escrituracao_contabil.meses, 120);
  // A rotina diária também chama o expurgo
  await s.app.nucleo.rotina({ forcar: true });
  assert.ok((await eq.get("/api/lgpd/expurgo")).dados.length >= 1);
});
