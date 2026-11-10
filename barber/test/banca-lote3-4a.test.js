/* Regressões da Banca de Testes (2026-11), lotes 3 e 4, parte A: itens de servidor.
   Cada teste falhava antes da correção do item indicado. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { lerConfig } from "../src/config.js";
import { abrirBanco } from "../src/db.js";
import { ipCliente } from "../src/servidor.js";
import { barbeariaPronta, clienteApp, subir } from "./ajuda.js";

const DONO = { email: "dono@navalha.test", senha: "senha-forte-1" };

test("V-15: busca e filtros de clientes alcançam a base inteira (além dos 2.000 primeiros)", async () => {
  const s = await subir();
  try {
    const { dono } = await barbeariaPronta(s);
    const repo = s.app.repo;
    const b = repo.barbearia();
    repo.transacao(() => {
      for (let i = 0; i < 2100; i++) repo.inserir("clientes", { barbearia_id: b.id, nome: `Cliente ${String(i).padStart(4, "0")}`, fone: `5534990${String(i).padStart(6, "0")}` });
      repo.inserir("clientes", { barbearia_id: b.id, nome: "Zuleica Souza", fone: "5534981112222", email: "zu@exemplo.test", nascimento: "1990-11-20" });
      repo.inserir("clientes", { barbearia_id: b.id, nome: "ÁLVARO Ícaro", ultima_visita: "2026-08-01", ciclo_dias: 20 });
    });
    const nomes = async (q) => (await dono.get(`/api/clientes?${q}`)).dados.map((c) => c.nome);
    assert.deepEqual(await nomes("busca=zuleica"), ["Zuleica Souza"], "acha quem passou do 2.000º");
    assert.deepEqual(await nomes("busca=81112222"), ["Zuleica Souza"], "acha pelo celular");
    assert.deepEqual(await nomes("busca=ZU%40EXEMPLO"), ["Zuleica Souza"], "acha pelo e-mail");
    assert.deepEqual(await nomes("busca=%C3%A1lvaro"), ["ÁLVARO Ícaro"], "minúsculas com acento");
    assert.deepEqual(await nomes("busca=50%25"), [], "% digitado não vira curinga");
    assert.ok((await nomes("filtro=aniversario")).includes("Zuleica Souza"));
    const sumidos = (await dono.get("/api/clientes?filtro=sumidos")).dados;
    assert.deepEqual(sumidos.map((c) => c.nome), ["ÁLVARO Ícaro"]);
    assert.equal(sumidos[0].sumido, true);
    assert.equal((await dono.get("/api/clientes")).dados.length, 300, "uma página por vez");
    const p8 = (await dono.get("/api/clientes?pagina=8")).dados;
    assert.ok(p8.length > 0 && p8.length < 300, "última página com o resto");
  } finally {
    s.fechar();
  }
});

test("V-16: limite de login conta só os erros, zera no acerto e é por e-mail + IP", async () => {
  const s = await subir({ cfg: { proxies: 1 } });
  try {
    await barbeariaPronta(s);
    const de = (ip) => ({ "x-forwarded-for": ip });
    const c = s.cliente();
    // Mesmo Wi-Fi: 10 logins certos seguidos não trancam a equipe
    for (let i = 0; i < 10; i++) assert.equal((await c.post("/api/entrar", DONO, de("10.0.0.1"))).status, 200, `login certo ${i + 1}`);
    // Um terceiro erra 8 vezes de outro lugar: ele fica trancado, o dono não
    for (let i = 0; i < 8; i++) assert.equal((await c.post("/api/entrar", { ...DONO, senha: "errada-123" }, de("203.0.113.9"))).status, 401);
    assert.equal((await c.post("/api/entrar", DONO, de("203.0.113.9"))).status, 429, "o atacante continua bloqueado");
    assert.equal((await c.post("/api/entrar", DONO, de("10.0.0.1"))).status, 200, "o dono entra do Wi-Fi da barbearia");
    // Errou 7, acertou: o contador zera
    for (let i = 0; i < 7; i++) await c.post("/api/entrar", { ...DONO, senha: "errada-123" }, de("10.0.0.2"));
    assert.equal((await c.post("/api/entrar", DONO, de("10.0.0.2"))).status, 200);
    assert.equal((await c.post("/api/entrar", { ...DONO, senha: "errada-123" }, de("10.0.0.2"))).status, 401, "não é 429: zerou depois do acerto");
  } finally {
    s.fechar();
  }
});

test("V-24: índices novos (idempotentes), faixa de datas limitada e lista detalhada igual à individual", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "barber-idx-"));
  try {
    const arquivo = join(pasta, "barber.db");
    abrirBanco(arquivo).fechar();
    const repo = abrirBanco(arquivo); // banco que já existe: abre de novo sem erro
    const nomes = repo.todos("SELECT name FROM sqlite_master WHERE type = 'index'").map((x) => x.name);
    for (const i of ["assinaturas_asaas", "agendamentos_status", "reservas_agendamento", "reservas_produto", "usos_ciclo"]) assert.ok(nomes.includes(i), `índice ${i}`);
    const plano = repo.todos("EXPLAIN QUERY PLAN SELECT * FROM assinaturas WHERE asaas_assinatura = ?", "sub_1").map((x) => x.detail).join(" ");
    assert.match(plano, /assinaturas_asaas/);
    repo.fechar();
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }

  const s = await subir();
  try {
    const { dono, corte, rafael } = await barbeariaPronta(s);
    const lucas = await clienteApp(s);
    await lucas.post("/api/app/agendar", { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-11", hora: "09:00" });
    await dono.post("/api/agendamentos", { cliente: { nome: "Walk-in" }, servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-11", hora: "10:00" });
    assert.equal((await dono.get("/api/agendamentos?de=2026-01-01&ate=2026-12-31")).status, 400, "um ano inteiro é recusado");
    assert.equal((await dono.get("/api/agendamentos?de=2026-11-20&ate=2026-11-10")).status, 400);
    const lista = await dono.get("/api/agendamentos?de=2026-11-01&ate=2026-12-01");
    assert.equal(lista.status, 200);
    assert.equal(lista.dados.length, 2);
    for (const a of lista.dados) assert.deepEqual(a, s.app.nucleo.detalhar(s.app.repo.obter("agendamentos", a.id)));
    const assin = await dono.get("/api/assinaturas?pagina=2");
    assert.equal(assin.status, 200);
    assert.deepEqual(assin.dados.lista, []);
  } finally {
    s.fechar();
  }
});

test("V-25: o painel remove a chave do Asaas, do WhatsApp e do SMS", async () => {
  const s = await subir();
  try {
    const { dono } = await barbeariaPronta(s);
    await dono.put("/api/canais", { asaas: { chave: "chave-asaas-1", ambiente: "sandbox" } });
    let c = (await dono.get("/api/config")).dados.config;
    assert.equal(c.asaas.chave, true);
    assert.equal(c.whatsapp.token, true);
    const r = await dono.put("/api/canais", { remover: ["asaas", "whatsapp"] });
    assert.equal(r.status, 200);
    c = (await dono.get("/api/config")).dados.config;
    assert.equal(c.asaas.chave, false, "Asaas removido");
    assert.equal(c.whatsapp.token, false, "token do WhatsApp removido");
    assert.equal(c.whatsapp.segredo, false);
    assert.equal(c.sms.token, true, "o SMS continua");
    assert.equal(s.app.nucleo.canais().asaas.ativo, false, "volta para pagar no balcão");
    assert.equal((await dono.put("/api/canais", { remover: ["fax"] })).status, 400);
  } finally {
    s.fechar();
  }
});

test("V-27: erros de validação em português e com o nome do campo que a pessoa conhece", async () => {
  const s = await subir();
  try {
    const { dono } = await barbeariaPronta(s);
    const r = await s.cliente().post("/api/entrar", { email: "nao-e-email", senha: "" });
    assert.equal(r.status, 400);
    assert.match(r.dados.erro, /^E-mail: /);
    assert.match(r.dados.erro, /Senha: não pode ficar em branco/);
    assert.doesNotMatch(r.dados.erro, /Invalid|Too small|expected|email:|senha:/);
    const p = await dono.post("/api/produtos", { nome: "", preco_centavos: "dez" });
    assert.match(p.dados.erro, /Nome: não pode ficar em branco/);
    assert.match(p.dados.erro, /Preço: precisa ser um número/);
    assert.doesNotMatch(p.dados.erro, /preco_centavos/);
    const sem = await dono.post("/api/servicos", { duracao_min: 30, preco_centavos: 100 });
    assert.match(sem.dados.erro, /Nome: preenchimento obrigatório/);
  } finally {
    s.fechar();
  }
});

test("V-31: data inexistente e nascimento no futuro recusados; URL e cookie malformados dão 400/401, não 500", async () => {
  const s = await subir();
  try {
    const { dono, corte, rafael } = await barbeariaPronta(s);
    const a = await dono.post("/api/agendamentos", { cliente: { nome: "Walk-in" }, servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-02-31", hora: "10:00", encaixe: true });
    assert.equal(a.status, 400);
    assert.match(a.dados.erro, /Data: esta data não existe/);
    assert.equal((await dono.get("/api/hoje?dia=2026-13-01")).status, 400);
    const n = await dono.post("/api/clientes", { nome: "Futuro", nascimento: "2099-01-01" });
    assert.equal(n.status, 400);
    assert.match(n.dados.erro, /Data de nascimento: precisa ser uma data no passado/);
    assert.equal((await dono.post("/api/clientes", { nome: "Ok", nascimento: "1990-05-10" })).status, 200);
    const lucas = await clienteApp(s);
    assert.equal((await lucas.put("/api/app/eu", { nascimento: "2030-01-01" })).status, 400, "no app também");

    assert.equal((await dono.get("/api/clientes/%E0%A4%A")).status, 400, "decode de URL malformado");
    const r = await fetch(`${s.url}/api/eu`, { headers: { cookie: "nx_barber=%E0%A4%A" } });
    assert.equal(r.status, 401, "cookie malformado vira sessão vazia");
  } finally {
    s.fechar();
  }
});

test("V-33: TRUST_PROXY tem padrão 0 e o X-Forwarded-For só vale quando ligado", () => {
  assert.equal(lerConfig({}).proxies, 0);
  assert.equal(lerConfig({ TRUST_PROXY: "1" }).proxies, 1);
  const req = { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "1.2.3.4" } };
  assert.equal(ipCliente(req), "127.0.0.1", "padrão ignora o cabeçalho");
  assert.equal(ipCliente(req, 1), "1.2.3.4");
});

test("V-35: GET /api/hoje sem ?dia= usa o dia de hoje", async () => {
  const s = await subir();
  try {
    const { dono } = await barbeariaPronta(s);
    const r = await dono.get("/api/hoje");
    assert.equal(r.status, 200);
    assert.equal(r.dados.dia, "2026-11-10");
  } finally {
    s.fechar();
  }
});

test("V-36: corpo acima de 256 KB recebe 413 (e não conexão fechada sem resposta)", async () => {
  const s = await subir();
  try {
    const grande = JSON.stringify({ email: "a@b.test", senha: "x".repeat(300 * 1024) });
    const enviar = (comTamanho) =>
      new Promise((ok, erro) => {
        const u = new URL(`${s.url}/api/entrar`);
        const req = request({ hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { "x-nexor": "1", "content-type": "application/json", ...(comTamanho ? { "content-length": Buffer.byteLength(grande) } : { "transfer-encoding": "chunked" }) } }, (res) => {
          let t = "";
          res.on("data", (p) => (t += p));
          res.on("end", () => ok({ status: res.statusCode, corpo: JSON.parse(t) }));
        });
        req.on("error", erro);
        req.end(grande);
      });
    for (const comTamanho of [true, false]) {
      const r = await enviar(comTamanho);
      assert.equal(r.status, 413, comTamanho ? "com Content-Length" : "em partes (chunked)");
      assert.match(r.corpo.erro, /grande demais/);
    }
  } finally {
    s.fechar();
  }
});

test("V-44: o código de acesso é comparado em tempo constante (iguais) e continua funcionando", async () => {
  const fonte = readFileSync(new URL("../src/servicos/nucleo.js", import.meta.url), "utf8");
  assert.doesNotMatch(fonte, /c\.hash !== hashCodigo/);
  assert.match(fonte, /iguais\(c\.hash, hashCodigo\(/);
  const s = await subir();
  try {
    await barbeariaPronta(s);
    const c = s.cliente();
    await c.post("/api/app/codigo", { fone: "34999990009", canal: "whatsapp" });
    assert.equal((await c.post("/api/app/verificar", { fone: "34999990009", codigo: "000000" === s.rede.ultimoCodigo() ? "111111" : "000000" })).status, 400);
    assert.equal((await c.post("/api/app/verificar", { fone: "34999990009", codigo: s.rede.ultimoCodigo() })).status, 200);
  } finally {
    s.fechar();
  }
});

test("V-38: o mesmo cliente confirmando o mesmo horário de novo (outra aba) recebe o horário que já tem", async () => {
  const s = await subir();
  try {
    const { corte, rafael } = await barbeariaPronta(s);
    const aba1 = await clienteApp(s);
    const pedido = { servico_id: corte.id, barbeiro_id: rafael.id, dia: "2026-11-11", hora: "09:00" };
    const a = await aba1.post("/api/app/agendar", pedido);
    assert.equal(a.status, 200);
    const b = await aba1.post("/api/app/agendar", pedido);
    assert.equal(b.status, 200, "não é 'acabou de ser ocupado'");
    assert.equal(b.dados.ja_marcado, true);
    assert.equal(b.dados.id, a.dados.id);
    const outro = await clienteApp(s, "34999990002", "Outro Cliente");
    assert.equal((await outro.post("/api/app/agendar", pedido)).status, 409, "para outro cliente o horário continua ocupado");
    assert.equal(s.app.repo.um("SELECT COUNT(*) n FROM agendamentos WHERE status = 'agendado'").n, 1);
  } finally {
    s.fechar();
  }
});

test("V-42: o app sabe por onde saem os avisos e se a mensalidade é cobrada online", async () => {
  const s = await subir();
  try {
    const { dono } = await barbeariaPronta(s);
    let info = (await s.cliente().get("/api/app/info")).dados;
    assert.deepEqual(info.avisos, { whatsapp: true, sms: true });
    assert.equal(info.cobranca_online, false, "sem Asaas: pagamento no balcão, sem CPF");
    await dono.put("/api/canais", { remover: ["whatsapp"], asaas: { chave: "chave-asaas-1" } });
    info = (await s.cliente().get("/api/app/info")).dados;
    assert.deepEqual(info.avisos, { whatsapp: false, sms: true }, "só SMS");
    assert.equal(info.cobranca_online, true);
  } finally {
    s.fechar();
  }
});
