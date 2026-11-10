/* Canais externos da barbearia: WhatsApp (API oficial da Meta), SMS (Twilio), login com Google e Asaas.
   Cada um usa as credenciais da própria barbearia, guardadas criptografadas na configuração. */

import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";

/** Celular brasileiro → só dígitos com 55 (5534999990000). Vazio se não parecer um celular. */
export function normalizarFone(v) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^55\d{10,11}$/.test(d) ? d : "";
}
/** Mesmo número? DDD + 8 últimos dígitos (o WhatsApp às vezes manda sem o 9) */
export function mesmoFone(a, b) {
  const x = normalizarFone(a);
  const y = normalizarFone(b);
  return Boolean(x && y && x.slice(2, 4) === y.slice(2, 4) && x.slice(-8) === y.slice(-8));
}

export function assinaturaMetaValida(corpo, assinatura, segredo) {
  if (!segredo || !assinatura?.startsWith("sha256=")) return false;
  const esperado = Buffer.from(createHmac("sha256", segredo).update(corpo).digest("hex"));
  const recebido = Buffer.from(assinatura.slice(7));
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

async function pedir(fetchFn, url, init, rotulo) {
  const r = await fetchFn(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d?.error?.message ?? d?.message ?? d?.errors?.map?.((e) => e.description).join("; ") ?? `${rotulo} respondeu ${r.status}`), { statusExterno: r.status });
  return d;
}

export function criarWhatsApp({ token, idNumero, versao = "v23.0", idioma = "pt_BR", fetchFn = fetch }) {
  const base = `https://graph.facebook.com/${versao}/${idNumero}/messages`;
  const enviar = (corpo) => pedir(fetchFn, base, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }) }, "WhatsApp");
  return {
    ativo: Boolean(token && idNumero),
    texto: (para, texto) => enviar({ to: normalizarFone(para), type: "text", text: { body: texto.slice(0, 4000), preview_url: true } }),
    /** Modelo aprovado pela Meta (obrigatório fora da janela de 24 h) com variáveis no corpo */
    modelo: (para, nome, parametros = []) =>
      enviar({ to: normalizarFone(para), type: "template", template: { name: nome, language: { code: idioma }, components: parametros.length ? [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: String(t).slice(0, 1000) })) }] : [] } }),
    /** Modelo de autenticação da Meta: código no corpo e no botão "copiar código" */
    codigo: (para, nome, codigo) =>
      enviar({ to: normalizarFone(para), type: "template", template: { name: nome, language: { code: idioma }, components: [{ type: "body", parameters: [{ type: "text", text: codigo }] }, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: codigo }] }] } }),
  };
}

/** SMS pela API do Twilio (conta da barbearia) */
export function criarSms({ sid, token, de, url = "https://api.twilio.com", fetchFn = fetch }) {
  return {
    ativo: Boolean(sid && token && de),
    async enviar(para, texto) {
      const corpo = new URLSearchParams({ To: `+${normalizarFone(para)}`, Body: texto.slice(0, 600), ...(de.startsWith("MG") ? { MessagingServiceSid: de } : { From: de }) });
      return pedir(fetchFn, `${url}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: corpo.toString() }, "SMS");
    },
  };
}

/**
 * Confere o token do botão "Entrar com Google" (Google Identity Services): assinatura RS256 com as chaves
 * públicas do Google, emissor, público (o Client ID da barbearia) e validade. Devolve { sub, email, nome } ou null.
 */
export function criarGoogle({ url, fetchFn = fetch, agora = () => Date.now() }) {
  let chaves = { lista: [], ate: 0 };
  async function certificados() {
    if (chaves.ate > agora()) return chaves.lista;
    const r = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error("Não foi possível falar com o Google.");
    const idade = Number(/max-age=(\d+)/.exec(r.headers.get("cache-control") ?? "")?.[1] ?? 3600);
    chaves = { lista: (await r.json()).keys ?? [], ate: agora() + Math.min(idade, 86400) * 1000 };
    return chaves.lista;
  }
  return {
    async conferir(credencial, clientId) {
      const partes = String(credencial ?? "").split(".");
      if (partes.length !== 3 || !clientId) return null;
      let cab;
      let dados;
      try {
        cab = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8"));
        dados = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
      } catch {
        return null;
      }
      if (cab.alg !== "RS256") return null;
      const jwk = (await certificados()).find((k) => k.kid === cab.kid);
      if (!jwk) return null;
      const ok = verify("RSA-SHA256", Buffer.from(`${partes[0]}.${partes[1]}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(partes[2], "base64url"));
      const s = agora() / 1000;
      if (!ok || dados.aud !== clientId || !["accounts.google.com", "https://accounts.google.com"].includes(dados.iss) || !(dados.exp > s) || !dados.sub) return null;
      return { sub: String(dados.sub), email: dados.email_verified ? String(dados.email ?? "").toLowerCase() : null, nome: dados.name ? String(dados.name).slice(0, 120) : null };
    },
  };
}

/** Asaas da barbearia: cliente, assinatura mensal (Pix, boleto ou cartão no mesmo link) e cancelamento */
export function criarAsaas({ chave, url, fetchFn = fetch }) {
  const chamar = (metodo, caminho, corpo) => pedir(fetchFn, `${url}${caminho}`, { method: metodo, headers: { "Content-Type": "application/json", access_token: chave, "User-Agent": "nexor-barber" }, body: corpo ? JSON.stringify(corpo) : undefined }, "Asaas");
  return {
    ativo: Boolean(chave),
    /* Passos separados: quem chama guarda cada id assim que ele existe (se um passo seguinte falhar, dá para desfazer) */
    async criarCliente({ cliente, cpf }) {
      const c = await chamar("POST", "/customers", { name: cliente.nome, cpfCnpj: cpf, email: cliente.email || undefined, mobilePhone: cliente.fone ? cliente.fone.slice(2) : undefined, externalReference: cliente.id });
      return c.id;
    },
    async criarAssinatura({ clienteAsaas, plano, assinaturaId, vencimento }) {
      const s = await chamar("POST", "/subscriptions", { customer: clienteAsaas, billingType: "UNDEFINED", value: plano.preco_centavos / 100, nextDueDate: vencimento, cycle: "MONTHLY", description: `Clube ${plano.nome}`, externalReference: assinaturaId });
      return s.id;
    },
    async primeiroPagamento(assinaturaAsaas) {
      const pagamentos = await chamar("GET", `/subscriptions/${encodeURIComponent(assinaturaAsaas)}/payments`);
      const p = pagamentos.data?.[0] ?? null;
      return p ? { id: p.id, link: p.invoiceUrl ?? null, vencimento: p.dueDate, valor: Math.round(Number(p.value) * 100) } : null;
    },
    cancelar: (id) => chamar("DELETE", `/subscriptions/${encodeURIComponent(id)}`),
    /** Baixa manual de uma cobrança paga no balcão (o Asaas para de cobrar o cliente) */
    receberEmDinheiro: (id, { data, valorCentavos }) => chamar("POST", `/payments/${encodeURIComponent(id)}/receiveInCash`, { paymentDate: data, value: valorCentavos / 100, notifyCustomer: false }),
  };
}

/** Evento do webhook do Asaas → o que fazer com a cobrança */
export function acaoAsaas(evento) {
  if (["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED_IN_CASH"].includes(evento)) return "paga";
  if (evento === "PAYMENT_OVERDUE") return "atrasada";
  // Estorno e contestação do cartão: o dinheiro volta para o cliente, então o clube sai
  if (["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"].includes(evento)) return "estornada";
  if (evento === "PAYMENT_DELETED") return "cancelada";
  if (evento === "PAYMENT_CREATED") return "nova";
  return null;
}
