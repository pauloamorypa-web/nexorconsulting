/* Simuladores do Modo Demonstração: respondem como a Meta (WhatsApp), o Resend (e-mail) e o Asaas (cobrança)
   responderiam, sem sair do computador. Tudo o que "sairia" fica registrado em memória (GET /api/demo/mensagens).
   Também a trava de rede: com DEMO=1, globalThis.fetch só fala com localhost (e, com DEMO_IA_REAL=1, com a Anthropic). */

import { randomUUID } from "node:crypto";

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Hosts que o processo pode alcançar em demo */
export function hostPermitido(host, { iaReal = false } = {}) {
  const h = String(host ?? "").toLowerCase();
  return LOCAL.has(h) || (iaReal && h === "api.anthropic.com");
}

/** Troca globalThis.fetch por uma trava que recusa qualquer host externo. Devolve a função que desfaz. */
export function travarRede({ iaReal = false } = {}) {
  const original = globalThis.fetch;
  if (original?.nexorTrava) return () => {};
  const trava = async (entrada, init) => {
    const alvo = typeof entrada === "string" || entrada instanceof URL ? String(entrada) : entrada?.url;
    let host;
    try {
      host = new URL(alvo).hostname;
    } catch {
      throw new Error(`Modo Demonstração: endereço recusado (${alvo})`);
    }
    if (!hostPermitido(host, { iaReal })) throw new Error(`Modo Demonstração: chamada externa bloqueada para ${host}`);
    return original(entrada, init);
  };
  trava.nexorTrava = true;
  globalThis.fetch = trava;
  return () => {
    if (globalThis.fetch === trava) globalThis.fetch = original;
  };
}

/** PDF mínimo com os dados da "leitura" embutidos num comentário (a IA simulada lê dali) */
export function pdfDemo(titulo, meta = null) {
  const linhas = ["%PDF-1.4", `% ${String(titulo).replace(/[\r\n]/g, " ")}`];
  if (meta) linhas.push(`%NEXOR-DEMO ${Buffer.from(JSON.stringify(meta)).toString("base64")}`);
  linhas.push("1 0 obj<< /Type /Catalog >>endobj", "trailer<< /Root 1 0 R >>", "%%EOF");
  return Buffer.from(linhas.join("\n"));
}
export function metaDoPdf(dados) {
  const m = /%NEXOR-DEMO ([A-Za-z0-9+/=]+)/.exec(dados.toString("latin1"));
  if (!m) return null;
  try {
    return JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * fetch dos provedores, simulado. aoPagar(cobranca) é chamado quando o Asaas "confirma" um pagamento.
 * midias: id da mídia do WhatsApp → { dados, mime } (o que o cliente "mandou" pelo POST /api/demo/receber).
 */
export function criarSimulador({ agora = () => Date.now(), segundosPagamento = 8, aoPagar = async () => {} } = {}) {
  const log = [];
  const midias = new Map();
  const cobrancas = new Map();
  const timers = new Set();
  let n = 0;
  const resp = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });
  const registrar = (item) => {
    log.unshift({ id: randomUUID(), em: agora(), ...item });
    if (log.length > 200) log.length = 200;
  };

  function confirmar(id, forma = "PIX") {
    const c = cobrancas.get(id);
    if (!c || c.status === "RECEIVED") return null;
    c.status = "RECEIVED";
    c.paymentDate = new Date(agora()).toISOString().slice(0, 10);
    c.billingType = forma;
    registrar({ canal: "asaas", destino: c.customer, texto: `Pagamento confirmado (${forma}) de R$ ${c.value.toFixed(2).replace(".", ",")}: ${c.description}`, evento: "PAYMENT_RECEIVED" });
    return aoPagar({ ...c, evento: "PAYMENT_RECEIVED" });
  }

  async function fetchFn(entrada, init = {}) {
    const u = new URL(typeof entrada === "string" || entrada instanceof URL ? String(entrada) : entrada.url);
    let corpo = null;
    try {
      corpo = init.body ? JSON.parse(init.body) : null;
    } catch {
      corpo = null;
    }
    // WhatsApp (Meta)
    if (u.hostname === "graph.facebook.com") {
      if (u.pathname.endsWith("/messages")) {
        const texto = corpo?.type === "template" ? `[modelo ${corpo.template?.name}] ${(corpo.template?.components?.[0]?.parameters ?? []).map((p) => p.text).join(" · ")}` : (corpo?.text?.body ?? "");
        registrar({ canal: "whatsapp", destino: corpo?.to ?? "", texto });
        return resp(200, { messaging_product: "whatsapp", contacts: [{ input: corpo?.to, wa_id: corpo?.to }], messages: [{ id: `wamid.demo.${++n}` }] });
      }
      const id = decodeURIComponent(u.pathname.split("/").pop());
      const m = midias.get(id);
      if (!m) return resp(404, { error: { message: "Mídia não encontrada (demonstração)" } });
      return resp(200, { url: `https://lookaside.fbsbx.com/demo/${encodeURIComponent(id)}`, mime_type: m.mime, id });
    }
    if (u.hostname === "lookaside.fbsbx.com") {
      const m = midias.get(decodeURIComponent(u.pathname.split("/").pop()));
      return m ? new Response(m.dados, { status: 200, headers: { "content-type": m.mime } }) : resp(404, {});
    }
    // E-mail (Resend)
    if (u.hostname === "api.resend.com") {
      registrar({ canal: "email", destino: (corpo?.to ?? []).join(", "), assunto: corpo?.subject ?? "", texto: corpo?.text ?? "" });
      return resp(200, { id: `email-demo-${++n}` });
    }
    // Asaas
    if (u.hostname === "api.asaas.com" || u.hostname === "sandbox.asaas.com") {
      if (u.pathname.endsWith("/payments") && (init.method ?? "GET") === "POST") {
        const id = `pay_demo${String(++n).padStart(6, "0")}`;
        const c = { object: "payment", id, customer: corpo?.customer ?? "", value: Number(corpo?.value ?? 0), dueDate: corpo?.dueDate, description: corpo?.description ?? "", externalReference: corpo?.externalReference ?? null, billingType: corpo?.billingType ?? "UNDEFINED", status: "PENDING", invoiceUrl: `/demo/pagamento/${id}`, bankSlipUrl: `/demo/pagamento/${id}` };
        cobrancas.set(id, c);
        registrar({ canal: "asaas", destino: c.customer, texto: `Cobrança criada: R$ ${c.value.toFixed(2).replace(".", ",")} · ${c.description}`, evento: "PAYMENT_CREATED" });
        // "Baixa sozinha": o cliente paga o Pix alguns segundos depois e o Asaas avisa pelo webhook
        if (segundosPagamento > 0) {
          const t = setTimeout(() => {
            timers.delete(t);
            Promise.resolve(confirmar(id)).catch((e) => console.error("[demo asaas]", e.message));
          }, segundosPagamento * 1000);
          t.unref?.();
          timers.add(t);
        }
        return resp(200, c);
      }
      const id = u.pathname.split("/").pop();
      return cobrancas.has(id) ? resp(200, cobrancas.get(id)) : resp(404, { errors: [{ description: "Cobrança não encontrada" }] });
    }
    throw new Error(`Modo Demonstração: ${u.hostname} não tem simulador e a chamada foi bloqueada.`);
  }

  return {
    fetchFn,
    log,
    midias,
    cobrancas,
    registrar,
    /** Simula o cliente pagando agora (botão na tela de pagamento ou POST /api/demo/pagar/:id) */
    pagar: (id, forma) => confirmar(id, forma),
    limpar() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      log.length = 0;
      midias.clear();
      cobrancas.clear();
    },
  };
}
