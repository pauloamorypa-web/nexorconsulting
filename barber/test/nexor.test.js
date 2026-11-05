/* Nexor Barber ligado à Nexor Central de verdade: vinculação pelo código, licença (restrito e bloqueado),
   Suporte Nexor e módulos escondidos. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { lerConfig as configCentral } from "../../central/src/config.js";
import { novoCodigo } from "../../central/src/db.js";
import { montarCentral } from "../../central/src/servidor.js";
import { barbeariaPronta, clienteApp, relogio, subir } from "./ajuda.js";

let central, pasta, s, b, cliCentral, lucas;
before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "central-barber-"));
  central = montarCentral({ cfg: { ...configCentral({}), pastaDados: pasta, chaveMestra: "x" }, caminhoBanco: ":memory:" });
  await new Promise((r) => central.servidor.listen(0, r));
  cliCentral = central.repo.inserir("clientes", { razao_social: "Barbearia Navalha Ltda", cnpj: "11222333000181", regras: {}, codigo: novoCodigo() });
  // Relógio real: a licença da Central é assinada com a hora atual
  s = await subir({ agora: relogio(Date.now()), cfg: { nexor: { central: `http://localhost:${central.servidor.address().port}`, codigo: "" } } });
  b = await barbeariaPronta(s);
  lucas = await clienteApp(s);
});
after(() => {
  s.fechar();
  central.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

test("vincula pelo código do cliente e aparece na Central com a saúde", async () => {
  const r = await b.dono.post("/api/nexor/vincular", { codigo: cliCentral.codigo });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const sis = central.repo.lista("sistemas", "WHERE cliente_id = ?", cliCentral.id)[0];
  assert.equal(sis.produto, "barber");
  assert.equal(sis.saude.barbeiros, 2);
  assert.equal(sis.saude.clientes, 1);
  assert.equal((await b.dono.get("/api/eu")).dados.licenca.vinculado, true);
});

test("restrito: painel só consulta, o app do cliente continua agendando", async () => {
  const venc = new Date(Date.now() - 12 * 86400_000).toISOString().slice(0, 10);
  central.repo.inserir("faturas", { cliente_id: cliCentral.id, descricao: "Mensalidade", valor_centavos: 19900, vencimento: venc });
  await s.app.central.sincronizar();
  assert.equal(s.app.central.estado().situacao, "restrito");
  assert.equal((await b.dono.get("/api/clientes")).status, 200);
  assert.equal((await b.dono.post("/api/clientes", { nome: "Novo" })).status, 423);
  const dias = (await lucas.get(`/api/app/dias?servico=${b.corte.id}`)).dados;
  const dia = dias.find((d) => d.livres > 0).dia;
  const h = (await lucas.get(`/api/app/horarios?servico=${b.corte.id}&dia=${dia}`)).dados.horarios[0];
  assert.equal((await lucas.post("/api/app/agendar", { servico_id: b.corte.id, dia, hora: h })).status, 200);
  for (const f of central.repo.lista("faturas", "WHERE status = 'aberta'")) central.repo.atualizar("faturas", f.id, { status: "paga", pago_em: venc });
  await s.app.central.sincronizar();
});

test("bloqueado: painel e agendamento online suspensos, rotina pausada", async () => {
  central.repo.atualizar("clientes", cliCentral.id, { bloqueio_manual: "teste" });
  await s.app.central.sincronizar();
  assert.equal((await b.dono.get("/api/clientes")).status, 423);
  const r = await lucas.get(`/api/app/dias?servico=${b.corte.id}`);
  assert.equal(r.status, 423);
  assert.match(r.dados.erro, /Fale com a barbearia/, "o cliente da barbearia não vê a cobrança da Nexor");
  assert.equal(r.dados.link, null);
  assert.equal((await lucas.get("/api/app/eu")).status, 200, "o app abre e mostra o aviso");
  assert.deepEqual(await s.app.rotina(), {});
  central.repo.atualizar("clientes", cliCentral.id, { bloqueio_manual: null });
  await s.app.central.sincronizar();
  assert.equal((await b.dono.get("/api/clientes")).status, 200);
});

test("Suporte Nexor entra, esconde o clube e não aparece na equipe", async () => {
  const sis = central.repo.lista("sistemas", "WHERE cliente_id = ?", cliCentral.id)[0];
  const t = central.assinador.assinar({ v: 1, tipo: "acesso", inst: sis.id, nome: "Paulo", email: "p@nexor.com", exp: Date.now() + 120_000, nonce: "n1" });
  const r = await fetch(`${s.url}/api/nexor/entrar?t=${t}`, { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.equal((await fetch(`${s.url}/api/nexor/entrar?t=${t}`, { redirect: "manual" })).status, 403, "link de uso único");
  const cookie = r.headers.getSetCookie()[0].split(";")[0];
  const sup = (m, c, corpo) => fetch(s.url + c, { method: m, headers: { cookie, "x-nexor": "1", "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  assert.equal((await sup("PUT", "/api/nexor/ajustes", { ocultos: ["modulo.clube", "config.canais"] })).status, 200);
  assert.equal((await b.dono.get("/api/planos")).status, 403);
  assert.equal((await lucas.get("/api/app/info")).dados.planos.length, 0, "o app não mostra o clube");
  assert.equal((await b.dono.put("/api/canais", { sms: { de: "+1" } })).status, 403);
  assert.equal((await sup("GET", "/api/planos")).status, 200);
  assert.ok((await b.dono.get("/api/usuarios")).dados.every((u) => !u.nexor));
  assert.equal((await sup("PUT", "/api/nexor/ajustes", { ocultos: [] })).status, 200);
});

test("teste grátis: limites e módulos travados pela licença, bloqueio no fim e tudo liberado ao contratar", async () => {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const daqui = (d) => new Date(Date.now() - 3 * 3600_000 + d * 86400_000).toISOString().slice(0, 10);
  central.repo.atualizar("clientes", cliCentral.id, { fase: "teste", produto: "barber", teste_ate: daqui(10) });
  await s.app.central.sincronizar();
  const lic = s.app.central.estado();
  assert.equal(lic.plano, "teste");
  assert.equal(lic.situacao, "aviso", "faixa com os dias que faltam");
  assert.match(lic.mensagem, /Teste grátis até/);
  // 2 barbeiros já cadastrados: o limite do teste é 2
  const novo = await b.dono.post("/api/barbeiros", { nome: "Carlos" });
  assert.equal(novo.status, 402);
  assert.match(novo.dados.erro, /limite é de 2 barbeiros/);
  const rel = await b.dono.get(`/api/relatorios?de=${hoje}&ate=${hoje}`);
  assert.equal(rel.status, 402);
  assert.match(rel.dados.erro, /Relatórios não faz parte do teste grátis/);
  assert.equal((await b.dono.get("/api/clientes")).status, 200, "o resto funciona");
  const dias = (await lucas.get(`/api/app/dias?servico=${b.corte.id}`)).dados;
  assert.ok(dias.some((d) => d.livres > 0), "o app agenda dentro do limite do mês");

  central.repo.atualizar("clientes", cliCentral.id, { teste_ate: daqui(-1) });
  await s.app.central.sincronizar();
  assert.equal(s.app.central.estado().situacao, "bloqueado");
  assert.equal((await b.dono.get("/api/clientes")).status, 423, "terminou o teste: só pago");

  central.repo.atualizar("clientes", cliCentral.id, { fase: "contrato", teste_ate: null, contratado_em: hoje });
  await s.app.central.sincronizar();
  assert.equal(s.app.central.estado().plano, "contratado");
  assert.equal((await b.dono.get(`/api/relatorios?de=${hoje}&ate=${hoje}`)).status, 200);
  assert.equal((await b.dono.post("/api/barbeiros", { nome: "Carlos" })).status, 200);
});
