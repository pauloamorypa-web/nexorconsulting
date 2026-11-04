/* Utilitários dos testes: servidor em porta livre, cliente HTTP com cookies, IA falsa e APIs falsas
   (WhatsApp da Meta e e-mail). */
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerConfig } from "../src/config.js";
import { montarAplicacao } from "../src/servidor.js";

export const CNPJ_ESCRITORIO = "11222333000181";
export const CNPJ_PADARIA = "45723174000110";
export const CNPJ_MERCADO = "19131243000197";
export const CNPJ_FORNECEDOR = "60701190000104";
export const SEGREDO_META = "segredo-meta";
export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

/** IA falsa: leituras saem de leituras[] (ou da função), o assistente de respostas[] */
export function iaFalsa({ leituras = [], respostas = [] } = {}) {
  const chamadas = [];
  return {
    chamadas,
    leituras,
    respostas,
    beta: {
      messages: {
        create: async (p) => {
          chamadas.push(p);
          const assistente = p.output_config?.format?.schema?.required?.includes("resposta");
          const fila = assistente ? respostas : leituras;
          let prox = fila.shift();
          if (typeof prox === "function") prox = prox(p);
          if (prox instanceof Error) throw prox;
          if (!prox) prox = assistente ? { resposta: "Certo! Já verifiquei por aqui.", encaminhar_equipe: false, assunto: null, departamento: "geral" } : leitura({ tipo: "outro", confianca: "baixa" });
          return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(prox) }], usage: { input_tokens: 100, output_tokens: 50 } };
        },
      },
    },
  };
}
export const leitura = (x = {}) => ({ tipo: "outro", emitente_nome: null, emitente_cnpj: null, destinatario_nome: null, destinatario_cnpj: null, numero: null, data_emissao: null, data_vencimento: null, valor_total: null, competencia: null, descricao: null, banco: null, movimentos: [], confianca: "alta", observacoes: null, ...x });

/** Meta e e-mail falsos; a Central passa direto (testes de licença) */
export function rede() {
  const whatsapp = [];
  const emails = [];
  let n = 0;
  const resp = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname.startsWith("/api/v1/")) return fetch(url, init);
    const corpo = init.body ? JSON.parse(init.body) : null;
    if (u.hostname === "graph.facebook.com" && u.pathname.endsWith("/messages")) {
      whatsapp.push(corpo);
      return resp(200, { messages: [{ id: `wamid.saida${++n}` }] });
    }
    if (u.hostname === "graph.facebook.com" && /\/midia-/.test(u.pathname)) return resp(200, { url: "https://lookaside.fbsbx.com/arquivo", mime_type: "application/pdf" });
    if (u.hostname === "lookaside.fbsbx.com") return new Response(PDF, { status: 200, headers: { "content-type": "application/pdf" } });
    if (u.hostname === "api.resend.com") {
      emails.push(corpo);
      return resp(200, { id: `email${++n}` });
    }
    return resp(404, { erro: "não simulado" });
  };
  return { fetchFn, whatsapp, emails };
}

export async function subir({ agora, ia = iaFalsa(), cfg: extra = {} } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-contabil-"));
  const r = rede();
  const cfg = { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste-chave-mestra", urlPublica: "https://contabil.teste", ...extra };
  const app = montarAplicacao({ cfg, caminhoBanco: ":memory:", agora, clienteIA: ia, fetchFn: r.fetchFn });
  await new Promise((ok) => app.servidor.listen(0, ok));
  const url = `http://localhost:${app.servidor.address().port}`;
  return {
    app,
    url,
    ia,
    rede: r,
    cliente: () => criarCliente(url),
    async webhook(payload) {
      const corpo = JSON.stringify(payload);
      const assinatura = "sha256=" + createHmac("sha256", SEGREDO_META).update(corpo).digest("hex");
      const res = await fetch(`${url}/webhook/whatsapp`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": assinatura }, body: corpo });
      await new Promise((ok) => setTimeout(ok, 10));
      await app.ocioso();
      return res.status;
    },
    fechar() {
      app.fechar();
      rmSync(pasta, { recursive: true, force: true });
    },
  };
}

export function criarCliente(url) {
  const cookies = new Map();
  async function chamar(metodo, caminho, corpo, extra = {}) {
    const bruto = Buffer.isBuffer(corpo);
    const r = await fetch(url + caminho, {
      method: metodo,
      headers: { "x-nexor": "1", cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(corpo !== undefined && !bruto ? { "content-type": "application/json" } : {}), ...extra },
      body: corpo === undefined ? undefined : bruto ? corpo : JSON.stringify(corpo),
    });
    for (const c of r.headers.getSetCookie()) {
      const [k, v] = c.split(";")[0].split("=");
      if (v) cookies.set(k, v);
      else cookies.delete(k);
    }
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, dados: tipo.includes("json") ? await r.json() : await r.text(), cabecalhos: r.headers };
  }
  return {
    get: (c) => chamar("GET", c),
    post: (c, b = {}, extra) => chamar("POST", c, b, extra),
    put: (c, b = {}) => chamar("PUT", c, b),
    del: (c) => chamar("DELETE", c),
    enviar: (c, dados, tipo, nome) => chamar("POST", c, dados, { "content-type": tipo, "x-nome": encodeURIComponent(nome) }),
  };
}

export const msgWhats = (de, { texto, midia, id = `wamid.${Math.random()}` } = {}) => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ value: { metadata: { phone_number_id: "1234567890" }, contacts: [{ wa_id: de, profile: { name: "Rosa" } }], messages: [{ id, from: de, type: midia ? "document" : "text", ...(midia ? { document: { id: "midia-1", mime_type: "application/pdf", filename: midia } } : { text: { body: texto } }) }] } }] }],
});
