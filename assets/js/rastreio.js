/* Rastreio de campanhas
   - Guarda de onde o visitante veio (utm_*, gclid, fbclid) e envia junto com cada lead.
   - Liga Meta Pixel, Google Analytics 4 e Google Ads quando configurados em RASTREIO (config.js),
     só depois do consentimento (LGPD).
   - Eventos: Lead (com temperatura), Contact (clique no WhatsApp), ViewContent (abriu uma solução). */

const NXT = (() => {
  const ler = (k, padrao) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? padrao;
    } catch {
      return padrao;
    }
  };
  const guardar = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* sem armazenamento */
    }
  };

  /* ---------- Origem do visitante ---------- */
  const CHAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "gbraid", "wbraid", "fbclid"];
  const params = new URLSearchParams(location.search);
  const agora = {};
  CHAVES.forEach((k) => params.get(k) && (agora[k] = params.get(k).slice(0, 200)));
  if (!agora.utm_source && document.referrer && !document.referrer.includes(location.hostname)) {
    try {
      agora.referencia = new URL(document.referrer).hostname;
    } catch {
      /* referrer inválido */
    }
  }
  const temAlgo = Object.keys(agora).length > 0;
  if (temAlgo) {
    agora.entrada = location.pathname + location.search.slice(0, 300);
    agora.quando = new Date().toISOString();
    if (!ler("nx-origem-primeira", null)) guardar("nx-origem-primeira", agora);
    guardar("nx-origem", agora);
  }
  if (agora.fbclid) guardar("nx-fbc", `fb.1.${Date.now()}.${agora.fbclid}`);

  const cookie = (nome) => document.cookie.split("; ").find((c) => c.startsWith(nome + "="))?.split("=")[1];

  /** Dados de origem que vão junto com o lead */
  const origem = () => {
    const o = { ...ler("nx-origem", {}) };
    const primeira = ler("nx-origem-primeira", null);
    if (primeira && primeira.quando !== o.quando) o.primeira = primeira;
    const fbc = cookie("_fbc") || ler("nx-fbc", "");
    const fbp = cookie("_fbp");
    if (fbc) o.fbc = fbc;
    if (fbp) o.fbp = fbp;
    o.pagina = location.href.split("#")[0].slice(0, 300);
    return o;
  };

  /* ---------- Consentimento ---------- */
  const configurado = typeof RASTREIO !== "undefined" && Object.values(RASTREIO).some(Boolean);
  let consentido = ler("nx-consentimento", null);
  const fila = [];
  let ligado = false;

  const carregar = (src) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.append(s);
  };

  const ligar = () => {
    if (ligado || !configurado) return;
    ligado = true;
    if (RASTREIO.metaPixel) {
      /* Código padrão da Meta, reescrito */
      const fbq = (window.fbq = function () {
        fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
      });
      if (!window._fbq) window._fbq = fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = "2.0";
      fbq.queue = [];
      carregar("https://connect.facebook.net/en_US/fbevents.js");
      fbq("init", RASTREIO.metaPixel);
      fbq("track", "PageView");
    }
    const gid = RASTREIO.ga4 || RASTREIO.googleAds;
    if (gid) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        dataLayer.push(arguments);
      };
      gtag("consent", "default", { ad_storage: "granted", analytics_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" });
      gtag("js", new Date());
      if (RASTREIO.ga4) gtag("config", RASTREIO.ga4);
      if (RASTREIO.googleAds) gtag("config", RASTREIO.googleAds, { allow_enhanced_conversions: true });
      carregar(`https://www.googletagmanager.com/gtag/js?id=${gid}`);
    }
    fila.splice(0).forEach((f) => f());
  };

  const banner = () => {
    const b = document.createElement("div");
    b.className = "nx-consent";
    b.setAttribute("role", "dialog");
    b.setAttribute("aria-label", "Cookies");
    b.innerHTML = `<p>Usamos cookies para medir nossos anúncios e melhorar sua experiência. <a href="privacidade.html">Saiba mais</a></p>
      <div><button type="button" class="btn btn-sm btn-ghost" data-consent="nao">Recusar</button><button type="button" class="btn btn-sm btn-primary" data-consent="sim">Aceitar</button></div>`;
    b.addEventListener("click", (e) => {
      const r = e.target.closest("[data-consent]");
      if (!r) return;
      consentido = r.dataset.consent === "sim";
      guardar("nx-consentimento", consentido);
      b.remove();
      if (consentido) ligar();
    });
    document.body.append(b);
  };

  if (configurado) {
    if (consentido === true) ligar();
    else if (consentido === null) document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", banner) : banner();
  }

  const quandoLigado = (f) => (ligado ? f() : consentido !== false && configurado && fila.push(f));

  /* ---------- Eventos ---------- */
  const VALOR = { quente: 300, morno: 80, frio: 15 };

  /** Lead enviado. id = mesmo id que vai para o servidor (evita contar duas vezes na Meta). */
  const lead = ({ id, tipo, temperatura, dados = {} }) =>
    quandoLigado(() => {
      const valor = VALOR[temperatura] ?? 15;
      if (window.fbq) {
        fbq("track", "Lead", { content_name: tipo, value: valor, currency: "BRL", lead_temperatura: temperatura }, { eventID: id });
        if (temperatura === "quente") fbq("trackCustom", "LeadQuente", { content_name: tipo, value: valor, currency: "BRL" }, { eventID: `${id}-q` });
      }
      if (window.gtag) {
        const tel = dados.telefone ? "+55" + dados.telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "") : undefined;
        if (RASTREIO.googleAds) gtag("set", "user_data", { ...(dados.email && { email: dados.email }), ...(tel && { phone_number: tel }) });
        gtag("event", "generate_lead", { lead_tipo: tipo, lead_temperatura: temperatura, value: valor, currency: "BRL" });
        if (RASTREIO.googleAdsLead) gtag("event", "conversion", { send_to: RASTREIO.googleAdsLead, value: valor, currency: "BRL", transaction_id: id });
        if (temperatura === "quente" && RASTREIO.googleAdsQuente)
          gtag("event", "conversion", { send_to: RASTREIO.googleAdsQuente, value: valor, currency: "BRL", transaction_id: `${id}-q` });
      }
    });

  const evento = (nome, dados = {}) =>
    quandoLigado(() => {
      if (window.fbq) fbq("track", nome, dados);
      if (window.gtag) gtag("event", nome === "Contact" ? "contact" : nome === "ViewContent" ? "view_item" : nome, dados);
    });

  // Cliques no WhatsApp
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.('a[href*="wa.me"]');
    if (a) evento("Contact", { content_name: a.textContent.trim().slice(0, 60) || "whatsapp" });
  });

  return { origem, lead, evento };
})();
