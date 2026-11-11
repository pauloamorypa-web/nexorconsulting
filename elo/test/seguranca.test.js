/* Segurança: CSRF, sessões separadas por tipo de conta, permissões por papel, isolamento entre inquilinos,
   limite de tentativas, 413, cabeçalhos, segredos cifrados e TRUST_PROXY. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { lerConfig } from "../src/config.js";
import { ipCliente } from "../src/servidor.js";
import { SENHA, cenario, criarCliente, enviarProposta, subir } from "./ajuda.js";

test("CSRF: sem o cabeçalho x-nexor: 1 toda escrita é recusada (inclusive na página pública)", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const cookie = [...c.inst.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const sem = (caminho, corpo = {}) => fetch(s.url + caminho, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(corpo) });
    assert.equal((await sem("/api/instalador/clientes", { nome: "X" })).status, 403);
    assert.equal((await sem("/api/instalador/entrar", { email: "diego@inst.teste", senha: SENHA })).status, 403);
    assert.equal((await fetch(s.url + "/api/instalador/clientes", { method: "POST", headers: { cookie, "x-nexor": "0" }, body: "{}" })).status, 403);
    const { token } = await enviarProposta(c, [{ tipo: "servico", descricao: "Serviço", quantidade: 1, custo_unit_centavos: 4000, preco_unit_centavos: 10000 }]);
    assert.equal((await sem(`/api/publico/propostas/${token}/aceitar`, { nome: "Fulano", concordo: true })).status, 403);
    // GET não altera nada e não precisa do cabeçalho
    assert.equal((await fetch(s.url + "/api/instalador/eu", { headers: { cookie } })).status, 200);
  } finally {
    s.fechar();
  }
});

test("Permissões por papel e sessões separadas por tipo de conta", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const entrar = async (tipo, papel, dono) => {
      await dono.ok.post(`/api/${tipo}/equipe`, { nome: papel, email: `${papel}@${tipo}.teste`, senha: SENHA, papel });
      const x = s.cliente();
      await x.ok.post(`/api/${tipo}/entrar`, { email: `${papel}@${tipo}.teste`, senha: SENHA });
      return x;
    };
    const comercial = await entrar("fornecedor", "comercial", c.fa.c);
    const financeiro = await entrar("fornecedor", "financeiro", c.fa.c);
    const admin = await entrar("fornecedor", "admin", c.fa.c);
    const tecnico = await entrar("instalador", "tecnico", c.inst);
    const produto = { codigo: "NOVO-1", nome: "Novo", preco_centavos: 100 };
    // Comercial: catálogo e vínculos sim; dinheiro não
    assert.equal((await comercial.post("/api/fornecedor/produtos", produto)).status, 200);
    assert.equal((await comercial.get("/api/fornecedor/repasses")).status, 403);
    assert.equal((await comercial.get("/api/fornecedor/titulos")).status, 403);
    assert.equal((await comercial.put(`/api/fornecedor/vinculos/${c.va.id}/credito`, { limite_credito_centavos: 1 })).status, 403);
    assert.equal((await comercial.post(`/api/fornecedor/vinculos/${c.va.id}/bloquear`, {})).status, 403);
    assert.equal((await comercial.put("/api/fornecedor/conta/wallet", { wallet_id: "wallet-desvio-001" })).status, 403);
    assert.equal((await comercial.post("/api/fornecedor/equipe", { nome: "x", email: "x@y.teste", senha: SENHA, papel: "admin" })).status, 403);
    // Financeiro: crédito, títulos e repasses sim; catálogo não
    assert.equal((await financeiro.post("/api/fornecedor/produtos", { ...produto, codigo: "NOVO-2" })).status, 403);
    assert.equal((await financeiro.get("/api/fornecedor/repasses")).status, 200);
    assert.equal((await financeiro.put(`/api/fornecedor/vinculos/${c.va.id}/credito`, { limite_credito_centavos: 1000 })).status, 200);
    assert.equal((await financeiro.post(`/api/fornecedor/vinculos/${c.va.id}/aprovar`, {})).status, 403);
    // Admin: quase tudo, mas o walletId é só do dono
    assert.equal((await admin.put("/api/fornecedor/conta/wallet", { wallet_id: "wallet-desvio-001" })).status, 403);
    assert.equal((await admin.get("/api/fornecedor/auditoria")).status, 200);
    assert.equal((await c.fa.c.put("/api/fornecedor/conta/wallet", { wallet_id: "wallet-nova-0001" })).status, 200);
    // Painel do fornecedor sem números financeiros para o comercial
    assert.equal((await comercial.ok.get("/api/fornecedor/painel")).financeiro, null);
    // Técnico: só OS (e só as dele)
    for (const rota of ["/api/instalador/propostas", "/api/instalador/clientes", "/api/instalador/fornecedores", "/api/instalador/contratos", "/api/instalador/auditoria"]) assert.equal((await tecnico.get(rota)).status, 403, rota);
    assert.equal((await tecnico.post("/api/instalador/calculadora", {})).status, 403);
    assert.equal((await tecnico.ok.get("/api/instalador/os")).length, 0);
    const os = await c.inst.ok.post("/api/instalador/os", { cliente_id: c.cliente.id, titulo: "Avulsa" });
    assert.equal((await tecnico.get(`/api/instalador/os/${os.id}`)).status, 404, "OS de outro técnico");
    // Sessões separadas: o cookie de uma área não abre a outra
    assert.equal((await c.inst.get("/api/fornecedor/eu")).status, 401);
    assert.equal((await c.fa.c.get("/api/instalador/eu")).status, 401);
    assert.equal((await c.fa.c.get("/api/nexor/metricas")).status, 401);
    const falsoCookie = criarCliente(s.url);
    falsoCookie.cookies.set("nx_elo_f", [...c.inst.cookies.values()][0]);
    assert.equal((await falsoCookie.get("/api/fornecedor/eu")).status, 401, "token de instalador no cookie do fornecedor");
    // Desativar um acesso derruba a sessão
    const lista = await c.fa.c.ok.get("/api/fornecedor/equipe");
    await c.fa.c.ok.put(`/api/fornecedor/equipe/${lista.find((u) => u.papel === "comercial").id}`, { ativo: false });
    assert.equal((await comercial.get("/api/fornecedor/eu")).status, 401);
    // Conta suspensa pela Nexor perde o acesso
    await c.nexor.ok.post(`/api/nexor/fornecedores/${c.fb.id}/suspender`, { motivo: "teste" });
    assert.equal((await c.fb.c.get("/api/fornecedor/eu")).status, 401);
    assert.equal((await s.cliente().post("/api/fornecedor/entrar", { email: "dono@b.teste", senha: SENHA })).status, 403);
  } finally {
    s.fechar();
  }
});

test("Isolamento entre inquilinos: um fornecedor não enxerga nem altera o que é de outro", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    assert.equal((await c.fb.c.put(`/api/fornecedor/produtos/${c.pa["CAM-1"].id}`, { preco_centavos: 1 })).status, 404);
    assert.equal((await c.fb.c.post(`/api/fornecedor/vinculos/${c.va.id}/bloquear`, {})).status, 404);
    assert.equal((await c.fb.c.post("/api/fornecedor/tabelas", { nome: "x", tipo: "lista", precos: { [c.pa["CAM-1"].id]: 1 } })).status, 404);
    const { p } = await enviarProposta(c, [{ tipo: "fornecedor", produto_id: c.pa["CAM-1"].id, quantidade: 1, preco_unit_centavos: 30000 }]);
    assert.equal((await c.fb.c.get(`/api/fornecedor/propostas/${p.id}`)).status, 404, "proposta sem itens dele");
    assert.equal((await c.fb.c.get("/api/fornecedor/propostas")).dados.length, 0);
    // Outro instalador não vê a proposta nem o cliente
    const outro = s.cliente();
    const { CNPJ_INST2 } = await import("./ajuda.js");
    await outro.ok.post("/api/instalador/cadastro", { cnpj: CNPJ_INST2, nome: "Outro", email: "outro@i.teste", senha: SENHA });
    assert.equal((await outro.get(`/api/instalador/propostas/${p.id}`)).status, 404);
    assert.equal((await outro.get(`/api/instalador/clientes/${c.cliente.id}`)).status, 404);
    assert.equal((await outro.post("/api/instalador/propostas", { titulo: "x", cliente_id: c.cliente.id })).status, 404);
  } finally {
    s.fechar();
  }
});

test("Login: limite só de erros, 413, cabeçalhos, segredos cifrados, TRUST_PROXY=0 e webhook", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const x = s.cliente();
    for (let i = 0; i < 8; i++) assert.equal((await x.post("/api/instalador/entrar", { email: "diego@inst.teste", senha: "errada-123" })).status, 401);
    assert.equal((await x.post("/api/instalador/entrar", { email: "diego@inst.teste", senha: SENHA })).status, 429);
    // Corpo grande demais
    const r = await c.inst.post("/api/instalador/clientes", { nome: "x".repeat(300 * 1024) });
    assert.equal(r.status, 413);
    // Cabeçalhos de segurança
    const h = await fetch(`${s.url}/`);
    assert.match(h.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(h.headers.get("x-content-type-options"), "nosniff");
    const login = await s.cliente().post("/api/fornecedor/entrar", { email: "dono@a.teste", senha: SENHA }, { "x-forwarded-for": "9.9.9.9" });
    assert.match(login.cabecalhos.get("set-cookie"), /HttpOnly; SameSite=Lax/);
    // walletId e tokens ficam cifrados no banco
    const bruto = JSON.stringify(s.app.repo.todos("SELECT config FROM contas"));
    assert.ok(!bruto.includes("wallet-fornecedor-a") && !bruto.includes("wallet-instalador"));
    assert.ok(bruto.includes("v1."));
    assert.ok(!JSON.stringify(s.app.repo.todos("SELECT * FROM plataforma")).includes(s.app.tokenWebhookAsaas()));
    // Sem proxy confiável, o X-Forwarded-For é ignorado
    assert.equal(lerConfig({}).proxies, 0);
    assert.equal(ipCliente({ socket: { remoteAddress: "1.2.3.4" }, headers: { "x-forwarded-for": "9.9.9.9" } }, 0), "1.2.3.4");
    assert.equal(ipCliente({ socket: { remoteAddress: "1.2.3.4" }, headers: { "x-forwarded-for": "9.9.9.9" } }, 1), "9.9.9.9");
    // Webhook sem token
    assert.equal((await fetch(`${s.url}/webhook/asaas`, { method: "POST", body: "{}" })).status, 401);
    // Token público inválido conta como tentativa (anti-varredura)
    for (let i = 0; i < 40; i++) await fetch(`${s.url}/api/publico/propostas/${"a".repeat(32)}`);
    assert.equal((await fetch(`${s.url}/api/publico/propostas/${"a".repeat(32)}`)).status, 429);
    // Produção exige MASTER_KEY e PUBLIC_URL https
    const { montarAplicacao } = await import("../src/servidor.js");
    assert.throws(() => montarAplicacao({ cfg: { ...lerConfig({ NODE_ENV: "production" }), urlPublica: "http://x" }, caminhoBanco: ":memory:" }), /https/);
    assert.throws(() => montarAplicacao({ cfg: { ...lerConfig({ NODE_ENV: "production", PUBLIC_URL: "https://elo.teste" }), pastaDados: s.pasta }, caminhoBanco: ":memory:" }), /MASTER_KEY/);
    void c;
  } finally {
    s.fechar();
  }
});
