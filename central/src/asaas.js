/* Cobrança automática pelo Asaas (Pix, boleto e cartão no mesmo link).
   Com ASAAS_API_KEY, cada fatura nova vira uma cobrança no Asaas; o webhook confirma o pagamento
   e o sistema do cliente é desbloqueado sozinho na próxima sincronização (até 5 minutos). */

export function criarAsaas({ cfg, fetchFn = fetch }) {
  const ativo = Boolean(cfg.asaas.chave);
  async function chamar(metodo, caminho, corpo) {
    const r = await fetchFn(`${cfg.asaas.url}${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", access_token: cfg.asaas.chave, "User-Agent": "nexor-central" },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados?.errors?.map((e) => e.description).join("; ") || `Asaas respondeu ${r.status}`);
    return dados;
  }
  return {
    ativo,
    /** Cria (se preciso) o cliente e a cobrança. Devolve { cliente_id, id, link }. */
    async cobrar(cliente, fatura) {
      let clienteId = cliente.asaas_cliente_id;
      if (!clienteId) {
        const c = await chamar("POST", "/customers", { name: cliente.razao_social, cpfCnpj: cliente.cnpj, email: cliente.email || undefined, mobilePhone: cliente.telefone?.replace(/\D/g, "") || undefined, externalReference: cliente.id, notificationDisabled: false });
        clienteId = c.id;
      }
      const p = await chamar("POST", "/payments", { customer: clienteId, billingType: "UNDEFINED", value: fatura.valor_centavos / 100, dueDate: fatura.vencimento, description: fatura.descricao, externalReference: fatura.id });
      return { cliente_id: clienteId, id: p.id, link: p.invoiceUrl ?? null };
    },
    async cancelar(externoId) {
      if (ativo && externoId) await chamar("DELETE", `/payments/${encodeURIComponent(externoId)}`);
    },
  };
}

/** Evento do webhook → o que fazer com a fatura */
export function acaoDoEvento(evento) {
  if (["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED_IN_CASH"].includes(evento)) return "paga";
  if (["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_RESTORED", "PAYMENT_REPROVED_BY_RISK_ANALYSIS"].includes(evento)) return "aberta";
  if (evento === "PAYMENT_DELETED") return "cancelada";
  return null;
}
