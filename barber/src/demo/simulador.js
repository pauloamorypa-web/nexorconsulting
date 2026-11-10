/* Modo Demonstração: provedores simulados (WhatsApp da Meta, SMS do Twilio, Asaas, Google) e trava de rede.
   Nada sai da máquina: as mensagens "enviadas" ficam em memória para o vendedor mostrar na apresentação. */

const LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Troca o fetch global por uma trava: com o Modo Demonstração ligado, qualquer host que não seja a própria máquina
 * é recusado (o simulador já atende os provedores; a trava é o cinto de segurança contra um caminho esquecido).
 */
export function travarRede(permitidos = []) {
  const original = globalThis.fetch;
  if (original.__travaDemo) return original;
  const libera = new Set(permitidos);
  const trava = async (url, init) => {
    const u = new URL(typeof url === "string" ? url : url.url ?? String(url));
    if (!LOCAIS.has(u.hostname) && !libera.has(u.hostname)) throw new Error(`Modo Demonstração: conexão externa bloqueada (${u.hostname}).`);
    return original(url, init);
  };
  trava.__travaDemo = true;
  trava.original = original;
  globalThis.fetch = trava;
  return trava;
}

/** Simulador dos provedores. `mensagens` guarda as últimas 200 saídas (WhatsApp, SMS, cobranças). */
export function criarSimulador({ agora = () => Date.now() } = {}) {
  const mensagens = [];
  let n = 0;
  let assinaturas = 0;
  const subs = new Map();
  // Prefixo por processo: a semeadura e o servidor da demonstração não repetem ids do Asaas simulado
  const lote = agora().toString(36);
  const guardar = (m) => {
    mensagens.push({ id: ++n, em: agora(), ...m });
    if (mensagens.length > 200) mensagens.shift();
  };
  const resp = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });

  async function fetchFn(url, init = {}) {
    const u = new URL(url);
    const corpo = init.body && typeof init.body === "string" ? init.body : "";
    if (u.hostname === "graph.facebook.com") {
      const b = corpo ? JSON.parse(corpo) : {};
      const texto = b.text?.body ?? (b.template ? `[modelo ${b.template.name}] ${(b.template.components ?? []).flatMap((c) => c.parameters ?? []).map((p) => p.text).join(" · ")}` : "");
      guardar({ canal: "whatsapp", para: b.to, texto });
      return resp(200, { messages: [{ id: `wamid.demo.${n}` }] });
    }
    if (u.hostname === "api.twilio.com") {
      const b = Object.fromEntries(new URLSearchParams(corpo));
      guardar({ canal: "sms", para: b.To, texto: b.Body });
      return resp(201, { sid: `SMdemo${n}` });
    }
    if (u.hostname.endsWith("asaas.com")) {
      const b = corpo ? JSON.parse(corpo) : null;
      const metodo = init.method ?? "GET";
      if (u.pathname.endsWith("/customers")) return resp(200, { id: `cus_demo_${lote}_${++n}` });
      if (u.pathname.endsWith("/subscriptions") && metodo === "POST") {
        const id = `sub_demo_${lote}_${++assinaturas}`;
        subs.set(id, { valor: Number(b?.value ?? 0), vencimento: b?.nextDueDate ?? null });
        guardar({ canal: "asaas", para: b?.customer, texto: `Assinatura criada no Asaas (${id}): R$ ${Number(b?.value ?? 0).toFixed(2).replace(".", ",")} por mês` });
        return resp(200, { id });
      }
      const pag = /\/subscriptions\/(sub_demo_[\w]+)\/payments$/.exec(u.pathname);
      if (pag) {
        const pid = `pay_${pag[1]}_1`;
        const s = subs.get(pag[1]) ?? { valor: 0, vencimento: null };
        return resp(200, { data: [{ id: pid, invoiceUrl: `https://www.asaas.com/i/${pid}`, dueDate: s.vencimento, value: s.valor }] });
      }
      if (/\/payments\/[^/]+\/receiveInCash$/.test(u.pathname)) return resp(200, { id: u.pathname.split("/").at(-2), status: "RECEIVED_IN_CASH" });
      if (metodo === "DELETE") return resp(200, { deleted: true });
      return resp(200, {});
    }
    // Login com Google fica desligado na demonstração (sem client id); as chaves públicas respondem vazias
    if (u.hostname === "www.googleapis.com") return resp(200, { keys: [] });
    throw new Error(`Modo Demonstração: provedor não simulado (${u.hostname}).`);
  }

  return { fetchFn, mensagens, guardar, assinatura: (id) => subs.get(id) };
}
