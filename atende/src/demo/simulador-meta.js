/* Simulador da WhatsApp Cloud API (graph.facebook.com) para o Modo Demonstração.
   Responde como a Meta responderia, registra cada mensagem "enviada" e, alguns segundos depois,
   devolve os status de entregue e lida pelo mesmo caminho do webhook real (os tiques mudam ao vivo). */

const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

/** Texto legível de um corpo de envio da Cloud API */
function resumoDoEnvio(c) {
  switch (c.type) {
    case "text":
      return c.text?.body ?? "";
    case "interactive":
      return [c.interactive?.body?.text, ...(c.interactive?.action?.buttons ?? []).map((b) => `[${b.reply?.title}]`), ...(c.interactive?.action?.sections ?? []).flatMap((s) => s.rows.map((r) => `[${r.title}]`))].filter(Boolean).join(" ");
    case "template":
      return `[modelo ${c.template?.name}] ${(c.template?.components ?? []).flatMap((x) => x.parameters ?? []).map((p) => p.text ?? "").filter(Boolean).join(" · ")}`.trim();
    case "reaction":
      return `[reação ${c.reaction?.emoji ?? ""}]`;
    default:
      return `[${c.type}] ${c[c.type]?.caption ?? ""}`.trim();
  }
}

/**
 * @param {object} p
 * @param {(registro: object) => void} p.registrar guarda a mensagem simulada (GET /api/demo/mensagens)
 * @param {(payload: object) => void} [p.aoWebhook] entrega um payload como se a Meta tivesse chamado o webhook
 * @param {() => Array} [p.modelos] modelos de mensagem atuais (para a sincronização)
 */
export function criarSimuladorMeta({ registrar, aoWebhook = () => {}, modelos = () => [], atrasoStatus = [900, 2600] }) {
  let n = 0;
  const timers = new Set();
  const depois = (ms, fn) => {
    const t = setTimeout(() => {
      timers.delete(t);
      try {
        fn();
      } catch (e) {
        console.error("[demo] simulador:", e.message);
      }
    }, ms);
    t.unref?.();
    timers.add(t);
  };
  const resposta = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json" } });
  const statusWebhook = (idNumero, wamid, status, para) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "demo-waba", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: idNumero }, statuses: [{ id: wamid, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: para }] } }] }],
  });

  async function fetchFn(entrada, init = {}) {
    const url = new URL(String(entrada instanceof Request ? entrada.url : entrada));
    if (url.hostname !== "graph.facebook.com") throw new Error(`Simulador da Meta: host inesperado ${url.hostname}`);
    const metodo = (init.method ?? "GET").toUpperCase();
    const partes = url.pathname.split("/").filter(Boolean).slice(1); // sem a versão (v23.0)
    let corpo;
    if (typeof init.body === "string") {
      try {
        corpo = JSON.parse(init.body);
      } catch {
        corpo = undefined;
      }
    }
    const [id, recurso] = partes;

    if (partes[0] === "oauth" && partes[1] === "access_token") return resposta(200, { access_token: "EAADEMO" + "x".repeat(24), token_type: "bearer" });
    if (partes[0] === "demo-midia") return new Response(PNG_1x1, { status: 200, headers: { "Content-Type": "image/png" } });

    if (recurso === "messages" && metodo === "POST") {
      if (corpo?.status === "read") return resposta(200, { success: true });
      const wamid = `wamid.DEMO${String(++n).padStart(6, "0")}`;
      const acao = corpo?.interactive?.action ?? {};
      const opcoes = [...(acao.buttons ?? []).map((b) => b.reply?.title), ...(acao.sections ?? []).flatMap((s) => s.rows.map((r) => r.title))].filter(Boolean);
      registrar({ canal: "whatsapp", de: id, para: corpo?.to, tipo: corpo?.type, texto: resumoDoEnvio(corpo ?? {}), ...(opcoes.length ? { opcoes } : {}), wamid, quando: Date.now() });
      // Como na vida real: entregue e, logo depois, lida
      depois(atrasoStatus[0], () => aoWebhook(statusWebhook(id, wamid, "delivered", corpo?.to)));
      depois(atrasoStatus[1], () => aoWebhook(statusWebhook(id, wamid, "read", corpo?.to)));
      return resposta(200, { messaging_product: "whatsapp", contacts: [{ input: corpo?.to, wa_id: corpo?.to }], messages: [{ id: wamid }] });
    }
    if (recurso === "media" && metodo === "POST") return resposta(200, { id: `demo-midia-${++n}` });
    if (recurso === "message_templates") {
      if (metodo === "GET") return resposta(200, { data: modelos(), paging: {} });
      if (metodo === "POST") return resposta(200, { id: `demo-modelo-${++n}`, status: "APPROVED", category: corpo?.category ?? "MARKETING" });
      return resposta(200, { success: true });
    }
    if (recurso === "subscribed_apps" || recurso === "register") return resposta(200, { success: true });
    if (recurso === "whatsapp_business_profile") {
      if (metodo === "POST") return resposta(200, { success: true });
      return resposta(200, { data: [{ about: "Clínica odontológica · seg a sex 8h–19h, sáb 8h–12h", address: "Av. Rondon Pacheco, 1500 · Uberlândia/MG", description: "Avaliação gratuita, limpeza, clareamento, ortodontia e implantes.", email: "contato@clinicasorriso.demo", vertical: "HEALTH", websites: [] }] });
    }
    if (recurso === "phone_numbers") return resposta(200, { data: [{ id: "100000000000001", display_phone_number: "+55 34 99999-0000", verified_name: "Clínica Sorriso", quality_rating: "GREEN" }] });
    if (id && !recurso && metodo === "GET") {
      if (id.startsWith("demo-midia") || id.startsWith("midia")) return resposta(200, { url: `https://graph.facebook.com/v23.0/demo-midia/${id}`, mime_type: "image/png", file_size: PNG_1x1.length, sha256: "demo" });
      return resposta(200, { id, display_phone_number: "+55 34 99999-0000", verified_name: "Clínica Sorriso", quality_rating: "GREEN", code_verification_status: "VERIFIED", name_status: "APPROVED", messaging_limit_tier: "TIER_1K", throughput: { level: "STANDARD" }, platform_type: "CLOUD_API", status: "CONNECTED" });
    }
    return resposta(404, { error: { code: 100, message: "Recurso não simulado no modo demonstração" } });
  }

  return {
    fetchFn,
    parar() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
