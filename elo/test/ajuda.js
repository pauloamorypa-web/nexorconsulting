/* Utilitários dos testes: servidor em porta livre, relógio controlado, cliente HTTP com cookies, rede falsa
   (BrasilAPI, Asaas, Focus NFe, WhatsApp, e-mail) e um cenário pronto (Nexor, fornecedores, instalador, vínculo, catálogo). */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerConfig } from "../src/config.js";
import { gerarCnpj, gerarCpf } from "../src/regras/documentos.js";
import { montarAplicacao } from "../src/servidor.js";

export const SENHA = "senha-de-teste-1";
export const CNPJ_INST = gerarCnpj("27182818");
export const CNPJ_INST2 = gerarCnpj("14142135");
export const CNPJ_SEM_CNAE = gerarCnpj("99887766");
export const CNPJ_BAIXADO = gerarCnpj("55443322");

export function rede() {
  const asaas = [];
  const mensagens = [];
  const focus = [];
  let consultasCnpj = 0;
  let n = 0;
  const receita = new Map([
    [CNPJ_INST, { razao_social: "Instala Seg Teste Ltda", nome_fantasia: "Instala Seg", cnae_fiscal: 8020001, cnaes_secundarios: [{ codigo: 4321500 }], municipio: "ARAGUARI", uf: "MG", descricao_situacao_cadastral: "ATIVA" }],
    [CNPJ_INST2, { razao_social: "Eletro Teste Ltda", nome_fantasia: null, cnae_fiscal: 4321500, cnaes_secundarios: [], municipio: "UBERLANDIA", uf: "MG", descricao_situacao_cadastral: "ATIVA" }],
    [CNPJ_SEM_CNAE, { razao_social: "Padaria Teste Ltda", cnae_fiscal: 1091102, cnaes_secundarios: [], municipio: "ARAGUARI", uf: "MG", descricao_situacao_cadastral: "ATIVA" }],
    [CNPJ_BAIXADO, { razao_social: "Baixada Ltda", cnae_fiscal: 8020001, cnaes_secundarios: [], municipio: "ARAGUARI", uf: "MG", descricao_situacao_cadastral: "BAIXADA" }],
  ]);
  const resp = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url);
    const corpo = typeof init.body === "string" && init.body ? JSON.parse(init.body) : null;
    if (u.hostname === "brasilapi.com.br") {
      consultasCnpj++;
      const c = u.pathname.split("/").at(-1);
      return receita.has(c) ? resp(200, { cnpj: c, ...receita.get(c) }) : resp(404, { message: "CNPJ não encontrado" });
    }
    if (u.hostname.includes("asaas.com")) {
      asaas.push({ metodo: init.method, caminho: u.pathname, corpo, chave: init.headers?.access_token });
      if (u.pathname.endsWith("/customers")) return resp(200, { id: `cus_${++n}` });
      if (u.pathname.endsWith("/payments")) return resp(200, { id: `pay_${++n}`, invoiceUrl: `https://asaas.teste/i/${n}`, ...(corpo?.installmentCount > 1 ? { installment: `ins_${n}` } : {}) });
      if (u.pathname.endsWith("/subscriptions")) return resp(200, { id: `sub_${++n}` });
      return resp(200, { deleted: true });
    }
    if (u.hostname.includes("focusnfe")) {
      focus.push({ caminho: u.pathname + u.search, corpo });
      return resp(201, { status: "processando_autorizacao" });
    }
    if (u.hostname === "graph.facebook.com" || u.hostname === "api.resend.com") {
      mensagens.push({ host: u.hostname, corpo });
      return resp(200, { ok: true });
    }
    return resp(404, { erro: "não simulado" });
  };
  return { fetchFn, asaas, mensagens, focus, receita, consultas: () => consultasCnpj };
}

/** Relógio controlado: começa numa terça, 10/11/2026 às 08:00 de Brasília */
export function relogio(inicio = Date.parse("2026-11-10T08:00:00-03:00")) {
  let t = inicio;
  const f = () => t;
  f.avancar = (ms) => (t += ms);
  f.dias = (d) => (t += d * 86400_000);
  return f;
}

export function criarCliente(url) {
  const cookies = new Map();
  async function chamar(metodo, caminho, corpo, extra = {}) {
    const r = await fetch(url + caminho, {
      method: metodo,
      headers: { "x-nexor": "1", cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...extra },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    for (const c of r.headers.getSetCookie()) {
      const [k, v] = c.split(";")[0].split("=");
      if (v) cookies.set(k, v);
      else cookies.delete(k);
    }
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, dados: tipo.includes("json") ? await r.json() : await r.text(), cabecalhos: r.headers };
  }
  const ok = async (p) => {
    const r = await p;
    if (r.status !== 200) throw new Error(`esperava 200, veio ${r.status}: ${JSON.stringify(r.dados)}`);
    return r.dados;
  };
  return {
    cookies,
    get: (c) => chamar("GET", c),
    post: (c, b = {}, extra) => chamar("POST", c, b, extra),
    put: (c, b = {}) => chamar("PUT", c, b),
    del: (c) => chamar("DELETE", c),
    ok: { get: (c) => ok(chamar("GET", c)), post: (c, b = {}) => ok(chamar("POST", c, b)), put: (c, b = {}) => ok(chamar("PUT", c, b)) },
  };
}

export async function subir({ agora = relogio(), cfg: extra = {} } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-elo-"));
  const r = rede();
  const cfg = { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste-chave-mestra", urlPublica: "https://elo.teste", codigoInstalacao: "CODIGO-TESTE", ...extra };
  cfg.asaas = { ...cfg.asaas, chave: "chave-asaas-plataforma", walletNexor: "wallet-nexor", ...(extra.asaas ?? {}) };
  const app = montarAplicacao({ cfg, caminhoBanco: ":memory:", agora, fetchFn: r.fetchFn });
  await new Promise((ok) => app.servidor.listen(0, ok));
  const url = `http://localhost:${app.servidor.address().port}`;
  return {
    app, url, agora, rede: r, pasta,
    cliente: () => criarCliente(url),
    fechar() {
      app.fechar();
      rmSync(pasta, { recursive: true, force: true });
    },
  };
}

/** Webhook do Asaas da plataforma (token correto) */
export async function webhookPago(s, asaasId, evento = "PAYMENT_RECEIVED") {
  const r = await fetch(`${s.url}/webhook/asaas`, { method: "POST", headers: { "content-type": "application/json", "asaas-access-token": s.app.tokenWebhookAsaas() }, body: JSON.stringify({ event: evento, payment: { id: asaasId } }) });
  return { status: r.status, dados: await r.json() };
}

/**
 * Cenário: operador Nexor, fornecedor A (com walletId) e B (sem walletId), instalador vinculado aos dois,
 * catálogo e um cliente final. Devolve os clientes HTTP logados e os ids.
 */
export async function cenario(s, { walletB = false, estoqueCam = 10 } = {}) {
  const nexor = s.cliente();
  await nexor.ok.post("/api/nexor/primeiro-acesso", { codigo_instalacao: "CODIGO-TESTE", nome: "Operadora Nexor", email: "ops@nexor.teste", senha: SENHA });
  async function fornecedor(raiz, nome, email, wallet) {
    const c = s.cliente();
    const r = await c.ok.post("/api/fornecedor/cadastro", { cnpj: gerarCnpj(raiz), razao_social: nome, cnaes: ["8020", "4321500"], cidade: "Araguari", uf: "MG", prazo_reserva_dias: 5, nome: `Dono ${nome}`, email, senha: SENHA });
    await nexor.ok.post(`/api/nexor/fornecedores/${r.conta.id}/aprovar`, {});
    if (wallet) await c.ok.put("/api/fornecedor/conta/wallet", { wallet_id: wallet });
    return { c, id: r.conta.id };
  }
  const fa = await fornecedor("31415926", "Distribuidora A Ltda", "dono@a.teste", "wallet-fornecedor-a");
  const fb = await fornecedor("16180339", "Distribuidora B Ltda", "dono@b.teste", walletB ? "wallet-fornecedor-b" : null);
  const ouro = await fa.c.ok.post("/api/fornecedor/tabelas", { nome: "Ouro", tipo: "desconto", desconto_pct: 10 });
  const pa = {};
  for (const [codigo, nome, preco, estoque] of [["CAM-1", "Câmera bullet 1080p", 20000, estoqueCam], ["DVR-4", "DVR 4 canais", 40000, 5], ["HD-1", "HD 1 TB", 30000, 5]]) pa[codigo] = await fa.c.ok.post("/api/fornecedor/produtos", { codigo, nome, categoria: "CFTV", preco_centavos: preco, estoque, prazo_dias: 1 });
  const pb = { "CAM-1": await fb.c.ok.post("/api/fornecedor/produtos", { codigo: "CAM-1", nome: "Câmera bullet 1080p", categoria: "CFTV", preco_centavos: 17000, estoque: 10, prazo_dias: 3 }) };

  const inst = s.cliente();
  const ri = await inst.ok.post("/api/instalador/cadastro", { cnpj: CNPJ_INST, nome: "Diego Instalador", email: "diego@inst.teste", senha: SENHA, telefone: "34999990001" });
  await inst.ok.put("/api/instalador/conta", { wallet_id: "wallet-instalador" });
  const va = await inst.ok.post("/api/instalador/vinculos", { fornecedor_id: fa.id });
  await fa.c.ok.post(`/api/fornecedor/vinculos/${va.id}/aprovar`, { tabela_id: ouro.id, limite_credito_centavos: 500000 });
  const vb = await inst.ok.post("/api/instalador/vinculos", { fornecedor_id: fb.id });
  await fb.c.ok.post(`/api/fornecedor/vinculos/${vb.id}/aprovar`, { limite_credito_centavos: 500000 });
  const cliente = await inst.ok.post("/api/instalador/clientes", CLIENTE_FINAL);
  return { nexor, fa, fb, pa, pb, ouro, inst, instId: ri.conta.id, va, vb, cliente };
}

export const CLIENTE_FINAL = { nome: "Zuleika Prudêncio Amarantes", documento: gerarCpf("123456789"), telefone: "34999997777", email: "zuleika.amarantes@cliente.teste", endereco: { logradouro: "Rua das Acácias", numero: "123", bairro: "Centro", cidade: "Araguari", uf: "MG", cep: "38440-000" } };

/** Cria e envia uma proposta com os itens dados; devolve { proposta, token } */
export async function enviarProposta(c, itens, extra = {}) {
  const p = await c.inst.ok.post("/api/instalador/propostas", { cliente_id: c.cliente.id, titulo: "CFTV teste", itens, ...extra });
  const r = await c.inst.post(`/api/instalador/propostas/${p.id}/enviar`, {});
  return { p, r, token: r.status === 200 ? r.dados.link.split("/").at(-1) : null };
}
