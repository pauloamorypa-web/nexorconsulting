/* Adaptadores dos provedores externos. Todos recebem o fetch por injeção: em teste é uma rede falsa,
   na demonstração é o simulador local e em produção é o fetch do Node.
   - CNPJ: BrasilAPI (consulta pública), com cache no banco;
   - Asaas: cobranças com split (conta da plataforma) e assinaturas (conta do próprio instalador);
   - Focus NFe: NFS-e do instalador e NF-e do fornecedor;
   - Notificações: WhatsApp (API oficial da Meta) e e-mail (API HTTP compatível com Resend). */

import { ErroHttp } from "../http/roteador.js";
import { soDigitos } from "../regras/documentos.js";

const PRAZO_MS = 10_000;
const comPrazo = (fetchFn, url, init = {}) => fetchFn(url, { ...init, signal: AbortSignal.timeout(PRAZO_MS) });

/* ---------- CNPJ ---------- */
export function criarConsultaCnpj({ repo, fetchFn, cfg, agora }) {
  function normalizar(d) {
    const cnaes = [d.cnae_fiscal, ...(d.cnaes_secundarios ?? []).map((c) => c.codigo)].map((c) => soDigitos(c)).filter((c) => c && c !== "0");
    return {
      cnpj: soDigitos(d.cnpj),
      razao_social: d.razao_social ?? "",
      nome_fantasia: d.nome_fantasia || null,
      situacao: String(d.descricao_situacao_cadastral ?? "").toUpperCase(),
      cnaes: [...new Set(cnaes)],
      cnae_principal: soDigitos(d.cnae_fiscal),
      cnae_descricao: d.cnae_fiscal_descricao ?? null,
      cidade: d.municipio ?? null,
      uf: d.uf ?? null,
    };
  }
  return {
    async consultar(cnpj) {
      const c = soDigitos(cnpj);
      const guardado = repo.um("SELECT dados, consultado_em FROM cnpj_cache WHERE cnpj = ?", c);
      if (guardado && agora() - guardado.consultado_em < cfg.cnpj.cacheDias * 86400_000) return { ...JSON.parse(guardado.dados), cache: true };
      let r;
      try {
        r = await comPrazo(fetchFn, `${cfg.cnpj.url}/${c}`, { headers: { accept: "application/json" } });
      } catch {
        throw new ErroHttp(503, "Não foi possível consultar o CNPJ agora. Tente de novo em instantes.");
      }
      if (r.status === 404) throw new ErroHttp(400, "CNPJ não encontrado na Receita Federal.");
      if (!r.ok) throw new ErroHttp(503, "A consulta de CNPJ está indisponível no momento. Tente de novo em instantes.");
      const dados = normalizar(await r.json());
      repo.rodar("INSERT INTO cnpj_cache (cnpj, dados, consultado_em) VALUES (?,?,?) ON CONFLICT(cnpj) DO UPDATE SET dados = excluded.dados, consultado_em = excluded.consultado_em", c, JSON.stringify(dados), agora());
      return { ...dados, cache: false };
    },
  };
}

/* ---------- Asaas ---------- */
export function criarAsaas({ fetchFn, url, chave }) {
  async function chamar(metodo, caminho, corpo) {
    if (!chave) throw new ErroHttp(503, "Pagamento online ainda não configurado.");
    let r;
    try {
      r = await comPrazo(fetchFn, url + caminho, { method: metodo, headers: { "content-type": "application/json", access_token: chave, "user-agent": "nexor-elo" }, body: corpo ? JSON.stringify(corpo) : undefined });
    } catch {
      throw new ErroHttp(502, "O Asaas não respondeu. Tente de novo em instantes.");
    }
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErroHttp(502, `O Asaas recusou: ${dados?.errors?.[0]?.description ?? `erro ${r.status}`}`);
    return dados;
  }
  const reais = (c) => Math.round(c) / 100;
  return {
    criarCliente: ({ nome, documento, email, telefone, referencia }) => chamar("POST", "/customers", { name: nome, cpfCnpj: soDigitos(documento), email: email || undefined, mobilePhone: telefone || undefined, externalReference: referencia, notificationDisabled: true }),
    /** Cobrança com split: `split` = [{ walletId, centavos }] (valor fixo de cada recebedor) */
    criarCobranca({ cliente, forma, valor_centavos, vencimento, descricao, referencia, split, parcelas = 1 }) {
      const corpo = { customer: cliente, billingType: forma, dueDate: vencimento, description: descricao, externalReference: referencia };
      if (forma === "CREDIT_CARD" && parcelas > 1) {
        Object.assign(corpo, { installmentCount: parcelas, totalValue: reais(valor_centavos), split: split.map((s) => ({ walletId: s.walletId, totalFixedValue: reais(s.centavos) })) });
      } else Object.assign(corpo, { value: reais(valor_centavos), split: split.map((s) => ({ walletId: s.walletId, fixedValue: reais(s.centavos) })) });
      return chamar("POST", "/payments", corpo);
    },
    criarAssinatura: ({ cliente, valor_centavos, proximo_vencimento, descricao, referencia }) => chamar("POST", "/subscriptions", { customer: cliente, billingType: "UNDEFINED", value: reais(valor_centavos), nextDueDate: proximo_vencimento, cycle: "MONTHLY", description: descricao, externalReference: referencia }),
    cancelarAssinatura: (id) => chamar("DELETE", `/subscriptions/${encodeURIComponent(id)}`),
    /** Cancela a cobrança no Asaas (parcelado: o parcelamento inteiro) */
    cancelarCobranca: (id, { parcelado = false } = {}) => chamar("DELETE", `${parcelado ? "/installments" : "/payments"}/${encodeURIComponent(id)}`),
  };
}

/* ---------- Focus NFe ---------- */
export function criarFiscal({ fetchFn, cfg, agora }) {
  return {
    /** tipo "nfse" ou "nfe". Sem token: simulada fora de produção; em produção, recusa. */
    async emitir({ token, tipo, ref, dados }) {
      if (!token) {
        if (!cfg.fiscal.simularSemToken) throw new ErroHttp(409, "Configure o token da Focus NFe para emitir notas.");
        return { simulada: true, status: "autorizado", numero: String(agora()).slice(-6), url: `${cfg.urlPublica || ""}/nota-simulada/${ref}`, dados };
      }
      let r;
      try {
        r = await comPrazo(fetchFn, `${cfg.fiscal.url}/v2/${tipo}?ref=${encodeURIComponent(ref)}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}` }, body: JSON.stringify(dados) });
      } catch {
        throw new ErroHttp(502, "A Focus NFe não respondeu. Tente de novo em instantes.");
      }
      const resp = await r.json().catch(() => ({}));
      if (!r.ok) throw new ErroHttp(502, `A Focus NFe recusou: ${resp?.mensagem ?? resp?.erros?.[0]?.mensagem ?? `erro ${r.status}`}`);
      return { simulada: false, status: resp.status ?? "processando_autorizacao", numero: resp.numero ?? null, url: resp.url ?? resp.caminho_xml_nota_fiscal ?? null, dados: resp };
    },
  };
}

/* ---------- Notificações (WhatsApp e e-mail) ---------- */
export function criarNotificador({ repo, fetchFn, cfg }) {
  async function whatsapp(para, texto) {
    const w = cfg.whatsapp;
    if (!w.token || !w.idNumero) return "sem_canal";
    const r = await comPrazo(fetchFn, `https://graph.facebook.com/${w.versaoGraph}/${w.idNumero}/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${w.token}` }, body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto } }) });
    if (!r.ok) throw new Error(`WhatsApp respondeu ${r.status}`);
    return "enviado";
  }
  async function email(para, texto, assunto) {
    const e = cfg.email;
    if (!e.chave) return "sem_canal";
    const r = await comPrazo(fetchFn, e.url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${e.chave}` }, body: JSON.stringify({ from: e.de, to: [para], subject: assunto, text: texto }) });
    if (!r.ok) throw new Error(`E-mail respondeu ${r.status}`);
    return "enviado";
  }
  return {
    async enviar({ conta_id = null, canal, para, texto, assunto = "Nexor Elo" }) {
      if (!para) return null;
      let status;
      let erro = null;
      try {
        status = canal === "whatsapp" ? await whatsapp(soDigitos(para).replace(/^(?!55)/, "55"), texto) : await email(para, texto, assunto);
      } catch (e) {
        status = "erro";
        erro = String(e.message).slice(0, 300);
      }
      return repo.inserir("envios", { conta_id, canal, para, texto, status, erro });
    },
  };
}
