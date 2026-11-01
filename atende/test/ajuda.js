/* Utilitários dos testes: app com banco temporário, Claude falso e API da Meta falsa. */

import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerConfig } from "../src/config.js";
import { montarAplicacao } from "../src/servidor.js";

export const SEGREDO = "segredo-do-app";

/** Claude falso: cada chamada consome a próxima resposta da fila (objeto ou função que recebe os parâmetros) */
export function claudeFalso(respostas = []) {
  const chamadas = [];
  return {
    chamadas,
    fila: respostas,
    beta: {
      messages: {
        create: async (params) => {
          chamadas.push(structuredClone(params));
          const proxima = respostas.shift();
          if (!proxima) return texto("Resposta padrão do teste.");
          return typeof proxima === "function" ? proxima(params) : proxima;
        },
      },
    },
  };
}

export const texto = (t) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }], usage: { input_tokens: 10, output_tokens: 5 } });
export const ferramenta = (name, input, id = `tu_${name}`) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }], usage: { input_tokens: 10, output_tokens: 5 } });

/** API da Meta falsa: registra as chamadas e responde como a Graph API */
export function metaFalsa() {
  const enviados = [];
  let n = 0;
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url);
    const corpo = init.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const responder = (status, dados) => ({ ok: status < 400, status, headers: new Headers(), text: async () => JSON.stringify(dados), json: async () => dados, arrayBuffer: async () => new ArrayBuffer(0) });
    if (u.pathname.endsWith("/messages") && corpo?.status === "read") return responder(200, { success: true });
    if (u.pathname.endsWith("/messages")) {
      enviados.push(corpo);
      if (corpo.to === "5511000000000") return responder(400, { error: { code: 131047, message: "Re-engagement message" } });
      return responder(200, { messaging_product: "whatsapp", contacts: [{ wa_id: corpo.to }], messages: [{ id: `wamid.saida${++n}` }] });
    }
    if (u.pathname.endsWith("/message_templates")) return responder(200, { data: [{ id: "t1", name: "boas_vindas", language: "pt_BR", status: "APPROVED", category: "MARKETING", components: [{ type: "BODY", text: "Olá {{1}}, temos novidades!" }] }] });
    if (u.pathname.endsWith("/subscribed_apps")) return responder(200, { success: true });
    if (/\/\d+$/.test(u.pathname)) return responder(200, { display_phone_number: "+55 34 99999-0000", verified_name: "Loja Teste", quality_rating: "GREEN", code_verification_status: "VERIFIED" });
    return responder(404, { error: { code: 100, message: "não simulado" } });
  };
  return { fetchFn, enviados };
}

export async function iniciarApp({ respostas = [], extraCfg = {} } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), "atende-"));
  const base0 = lerConfig({ DATA_DIR: pasta, META_APP_SECRET: SEGREDO, META_VERIFY_TOKEN: "verifica" });
  // A análise automática fica desligada nos testes para não consumir as respostas falsas do Claude
  const cfg = { ...base0, ia: { ...base0.ia, analisarACada: 999 }, ...extraCfg };
  const claude = claudeFalso(respostas);
  const meta = metaFalsa();
  const app = montarAplicacao({ cfg, caminhoBanco: ":memory:", clienteIA: claude, fetchFn: meta.fetchFn, atrasoAgrupamento: 0 });
  await new Promise((r) => app.servidor.listen(0, r));
  const base = `http://127.0.0.1:${app.servidor.address().port}`;
  let cookie = "";
  const chamar = async (metodo, caminho, corpo, cabecalhos = {}) => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json", "x-nexor": "1", ...(cookie ? { cookie } : {}), ...cabecalhos },
      body: corpo === undefined ? undefined : typeof corpo === "string" || corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, dados: tipo.includes("json") ? await r.json() : await r.text() };
  };
  const webhook = async (payload, segredo = SEGREDO) => {
    const corpo = JSON.stringify(payload);
    const assinatura = "sha256=" + createHmac("sha256", segredo).update(corpo).digest("hex");
    const r = await fetch(`${base}/webhook/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": assinatura }, body: corpo });
    await new Promise((res) => setTimeout(res, 20));
    await app.atendimento.ocioso();
    return r.status;
  };
  return { app, base, chamar, webhook, claude, meta, sair: () => (cookie = ""), fechar: () => app.fechar() };
}

export const mensagemRecebida = (texto, { de = "5534988887777", id = `wamid.in${Math.random()}`, nome = "Ana Souza", numero = "123456789", tipo = "text", extra } = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "553499990000", phone_number_id: numero },
            contacts: [{ wa_id: de, profile: { name: nome } }],
            messages: [{ from: de, id, timestamp: String(Math.floor(Date.now() / 1000)), type: tipo, ...(tipo === "text" ? { text: { body: texto } } : extra) }],
          },
        },
      ],
    },
  ],
});

export const statusRecebido = (wamid, status, numero = "123456789") => ({
  object: "whatsapp_business_account",
  entry: [{ id: "waba1", changes: [{ field: "messages", value: { metadata: { phone_number_id: numero }, statuses: [{ id: wamid, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "5534988887777" }] } }] }],
});

/** Cria conta, conecta o número e devolve o contexto pronto */
export async function contaPronta(opcoes) {
  const t = await iniciarApp(opcoes);
  const c = await t.chamar("POST", "/api/cadastro", { empresa: "Loja Teste", segmento: "moda", nome: "Paula Dona", email: "paula@teste.com", senha: "senha-forte-123" });
  if (c.status !== 200) throw new Error(JSON.stringify(c));
  const canal = await t.chamar("POST", "/api/canais", { phone_number_id: "123456789", waba_id: "987654321", token: "EAAtokenfalso1234567890" });
  if (canal.status !== 200) throw new Error(JSON.stringify(canal));
  return t;
}
