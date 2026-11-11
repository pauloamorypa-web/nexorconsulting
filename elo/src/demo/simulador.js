/* Modo Demonstração: provedores simulados (BrasilAPI, Asaas, Focus NFe, WhatsApp, e-mail) e trava de rede.
   Nada sai da máquina: as mensagens "enviadas" ficam em memória para o vendedor mostrar na apresentação. */

import { soDigitos } from "../regras/documentos.js";

const LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Troca o fetch global por uma trava que recusa qualquer host fora desta máquina (cinto e suspensório) */
export function travarRede(permitidos = []) {
  const original = globalThis.fetch;
  if (original.__travaDemo) return original;
  const libera = new Set(permitidos);
  const trava = async (url, init) => {
    const u = new URL(typeof url === "string" ? url : (url.url ?? String(url)));
    if (!LOCAIS.has(u.hostname) && !libera.has(u.hostname)) throw new Error(`Modo Demonstração: conexão externa bloqueada (${u.hostname}).`);
    return original(url, init);
  };
  trava.__travaDemo = true;
  trava.original = original;
  globalThis.fetch = trava;
  return trava;
}

/** Empresas fictícias que a "Receita" simulada conhece. Qualquer outro CNPJ válido vira uma instaladora genérica de Araguari/MG. */
export const CNPJS_DEMO = new Map();

export function criarSimulador({ agora = () => Date.now() } = {}) {
  const mensagens = [];
  let n = 0;
  const lote = agora().toString(36);
  const guardar = (m) => {
    mensagens.push({ id: ++n, em: agora(), ...m });
    if (mensagens.length > 200) mensagens.shift();
  };
  const resp = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });
  const reais = (v) => `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;

  async function fetchFn(url, init = {}) {
    const u = new URL(url);
    const corpo = typeof init.body === "string" && init.body ? JSON.parse(init.body) : null;
    if (u.hostname === "brasilapi.com.br") {
      const cnpj = soDigitos(u.pathname.split("/").at(-1));
      const d = CNPJS_DEMO.get(cnpj) ?? { razao_social: `Instaladora Demonstração ${cnpj.slice(0, 4)} Ltda`, nome_fantasia: "Instaladora Demonstração", cnae_fiscal: 4321500, cnae_fiscal_descricao: "Instalação e manutenção elétrica", cnaes_secundarios: [{ codigo: 8020001, descricao: "Atividades de monitoramento de sistemas de segurança eletrônico" }], municipio: "ARAGUARI", uf: "MG", descricao_situacao_cadastral: "ATIVA" };
      return resp(200, { cnpj, ...d });
    }
    if (u.hostname === "graph.facebook.com") {
      guardar({ canal: "whatsapp", para: corpo?.to, texto: corpo?.text?.body ?? "" });
      return resp(200, { messages: [{ id: `wamid.demo.${n}` }] });
    }
    if (u.hostname === "api.resend.com") {
      guardar({ canal: "email", para: corpo?.to?.[0], texto: corpo?.text ?? "" });
      return resp(200, { id: `email_demo_${n}` });
    }
    if (u.hostname.endsWith("asaas.com")) {
      const metodo = init.method ?? "GET";
      if (u.pathname.endsWith("/customers")) return resp(200, { id: `cus_demo_${lote}_${++n}` });
      if (u.pathname.endsWith("/payments") && metodo === "POST") {
        const id = `pay_demo_${lote}_${++n}`;
        const parcelado = corpo?.installmentCount > 1;
        const split = (corpo?.split ?? []).map((s) => `${reais(s.fixedValue ?? s.totalFixedValue)} → wallet ••••${String(s.walletId).slice(-4)}`).join(" · ");
        guardar({ canal: "asaas", para: corpo?.customer, texto: `Cobrança ${corpo?.billingType} de ${reais(corpo?.value ?? corpo?.totalValue)} criada com split: ${split || "sem split"}` });
        return resp(200, { id, ...(parcelado ? { installment: `ins_demo_${lote}_${n}` } : {}), invoiceUrl: `http://localhost/asaas-demo/${id}`, status: "PENDING" });
      }
      if (u.pathname.endsWith("/subscriptions") && metodo === "POST") {
        const id = `sub_demo_${lote}_${++n}`;
        guardar({ canal: "asaas", para: corpo?.customer, texto: `Assinatura mensal de ${reais(corpo?.value)} criada (${id})` });
        return resp(200, { id });
      }
      if (metodo === "DELETE") return resp(200, { deleted: true });
      return resp(200, {});
    }
    if (u.hostname.endsWith("focusnfe.com.br")) return resp(201, { status: "autorizado", numero: String(++n).padStart(6, "0") });
    throw new Error(`Modo Demonstração: provedor não simulado (${u.hostname}).`);
  }

  return { fetchFn, mensagens, guardar };
}
