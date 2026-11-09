/* Rastreio de campanhas
   - Guarda de onde o visitante veio (utm_*, gclid, fbclid) e envia junto com cada lead.
   - Mostra o aviso de cookies (Aceitar / Recusar / Preferências) e guarda a escolha.
   - Liga Meta Pixel, Google Analytics 4 e Google Ads quando configurados em RASTREIO (config.js),
     só depois do Aceitar (LGPD). Antes disso nenhum script de terceiros é carregado.
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

  /* ---------- Consentimento (LGPD art. 7º I e 8º; Guia de cookies da ANPD) ----------
     Guardado em localStorage "nx-consentimento": { versao, medicao, em }.
     medicao = Meta Pixel, Google Analytics e Google Ads, e o envio do lead à Meta pelo servidor.
     Nada disso roda, nem é carregado, antes de a pessoa clicar em Aceitar. */
  const VERSAO_CONSENTIMENTO = 2;
  const lerEscolha = () => {
    const v = ler("nx-consentimento", null);
    if (typeof v === "boolean") return { versao: 1, medicao: v, em: null }; // escolha antiga (só sim/não)
    return v && typeof v.medicao === "boolean" ? v : null;
  };
  let escolha = lerEscolha();
  const medicaoAceita = () => escolha?.medicao === true;

  /* ---------- Origem do visitante ---------- */
  const CHAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "gbraid", "wbraid", "fbclid"];
  const CLIQUES = ["gclid", "gbraid", "wbraid", "fbclid"]; // identificadores de anúncio: só com consentimento
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
  // Sem consentimento, os identificadores de clique ficam só na memória desta página
  const cliquesPendentes = {};
  if (!medicaoAceita()) for (const k of CLIQUES) if (agora[k]) (cliquesPendentes[k] = agora[k]), delete agora[k];
  /** Endereço sem os identificadores de clique, quando a pessoa não aceitou a medição. */
  const semCliques = (url) => {
    const u = new URL(url, location.href);
    if (!medicaoAceita()) CLIQUES.forEach((k) => u.searchParams.delete(k));
    return u;
  };
  const guardarOrigem = (o) => {
    if (!Object.keys(o).length) return;
    const e = semCliques(location.href);
    o.entrada = (e.pathname + e.search).slice(0, 300);
    o.quando = new Date().toISOString();
    if (!ler("nx-origem-primeira", null)) guardar("nx-origem-primeira", o);
    guardar("nx-origem", o);
  };
  guardarOrigem({ ...agora });
  const fbclid = agora.fbclid || cliquesPendentes.fbclid;
  const fbclidPendente = fbclid ? `fb.1.${Date.now()}.${fbclid}` : null;

  const cookie = (nome) => document.cookie.split("; ").find((c) => c.startsWith(nome + "="))?.split("=")[1];

  /** Dados de origem que vão junto com o lead */
  const origem = () => {
    const o = { ...ler("nx-origem", {}) };
    const primeira = ler("nx-origem-primeira", null);
    if (primeira && primeira.quando !== o.quando) o.primeira = { ...primeira };
    if (medicaoAceita()) {
      const fbc = cookie("_fbc") || ler("nx-fbc", "");
      const fbp = cookie("_fbp");
      if (fbc) o.fbc = fbc;
      if (fbp) o.fbp = fbp;
    } else {
      for (const k of CLIQUES) delete o[k];
      if (o.primeira) for (const k of CLIQUES) delete o.primeira[k];
    }
    o.pagina = String(semCliques(location.href)).split("#")[0].slice(0, 300);
    return o;
  };

  /* ---------- Ferramentas de medição (só depois do Aceitar) ---------- */
  const configurado = typeof RASTREIO !== "undefined" && Object.values(RASTREIO).some(Boolean);
  const fila = [];
  let ligado = false;

  const carregar = (src) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.append(s);
  };

  const ligar = () => {
    if (ligado || !medicaoAceita()) return;
    if (Object.keys(cliquesPendentes).length) guardarOrigem({ ...ler("nx-origem", {}), ...cliquesPendentes });
    if (fbclidPendente) guardar("nx-fbc", fbclidPendente);
    if (!configurado) return;
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

  /** Apaga os cookies e identificadores de medição (quem recusa depois de ter aceitado). */
  const apagarMedicao = () => {
    try {
      localStorage.removeItem("nx-fbc");
    } catch {
      /* sem armazenamento */
    }
    const partes = location.hostname.split(".");
    const dominios = ["", `; domain=${location.hostname}`, `; domain=.${location.hostname}`];
    for (let i = 1; i < partes.length - 1; i++) dominios.push(`; domain=.${partes.slice(i).join(".")}`);
    for (const c of document.cookie.split("; ").map((x) => x.split("=")[0]).filter((n) => /^(_fbp|_fbc|_ga|_gid|_gcl|_gat)/.test(n)))
      for (const d of dominios) document.cookie = `${c}=; Max-Age=0; path=/${d}`;
  };

  const decidir = (medicao) => {
    const antes = medicaoAceita();
    escolha = { versao: VERSAO_CONSENTIMENTO, medicao, em: new Date().toISOString() };
    guardar("nx-consentimento", escolha);
    document.querySelector(".nx-consent")?.remove();
    if (medicao) ligar();
    else if (antes) {
      apagarMedicao();
      location.reload(); // descarrega o Pixel e o Google que já estavam rodando
    }
  };

  /* ---------- Banner ---------- */
  const politica = "/privacidade.html#cookies";
  const banner = ({ preferencias = false } = {}) => {
    document.querySelector(".nx-consent")?.remove();
    const b = document.createElement("div");
    b.className = "nx-consent";
    b.setAttribute("role", "dialog");
    b.setAttribute("aria-live", "polite");
    b.setAttribute("aria-label", "Preferências de cookies");
    b.innerHTML = `<p><b>Cookies e medição de anúncios.</b> Usamos só o necessário para o site funcionar. Com o seu aceite, também usamos ferramentas da Meta e do Google para medir nossos anúncios. Você pode mudar de ideia quando quiser, no rodapé. <a href="${politica}">Saiba mais</a></p>
      <div class="nx-consent-pref" ${preferencias ? "" : "hidden"}>
        <label class="nx-consent-op"><input type="checkbox" checked disabled> <span><b>Necessários</b> (sempre ligados): guardam esta escolha, a fila de pedidos e a sessão do chat, só no seu navegador.</span></label>
        <label class="nx-consent-op"><input type="checkbox" data-consent-medicao ${medicaoAceita() ? "checked" : ""}> <span><b>Medição de anúncios</b> (opcional): Meta Pixel, Google Analytics e Google Ads, e o envio do seu pedido à Meta para medir a campanha.</span></label>
        <button type="button" class="btn btn-sm nx-consent-btn" data-consent="salvar">Salvar escolha</button>
      </div>
      <div class="nx-consent-acoes">
        <button type="button" class="btn btn-sm nx-consent-btn" data-consent="nao">Recusar</button>
        <button type="button" class="btn btn-sm nx-consent-btn" data-consent="sim">Aceitar</button>
      </div>
      <button type="button" class="link-btn nx-consent-link" data-consent="pref" ${preferencias ? "hidden" : ""}>Preferências</button>`;
    b.addEventListener("click", (e) => {
      const r = e.target.closest("[data-consent]");
      if (!r) return;
      const acao = r.dataset.consent;
      if (acao === "pref") {
        b.querySelector(".nx-consent-pref").hidden = false;
        r.hidden = true;
        b.querySelector("[data-consent-medicao]").focus();
        return;
      }
      decidir(acao === "sim" ? true : acao === "nao" ? false : b.querySelector("[data-consent-medicao]").checked);
    });
    document.body.append(b);
  };

  /** Rever a escolha (link fixo "Preferências de cookies" no rodapé). */
  const preferencias = () => banner({ preferencias: true });
  document.addEventListener("click", (e) => {
    if (e.target.closest?.("[data-cookies]")) {
      e.preventDefault();
      preferencias();
    }
  });

  if (medicaoAceita()) ligar();
  else if (escolha === null) document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => banner()) : banner();

  const quandoLigado = (f) => (ligado ? f() : medicaoAceita() && configurado && fila.push(f));

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

  /** Registro da escolha que vai junto com o lead (o servidor só envia à Meta com medicao: true). */
  const registroConsentimento = () => (escolha ? { medicao: escolha.medicao, versao: escolha.versao, em: escolha.em } : { medicao: false, versao: VERSAO_CONSENTIMENTO, em: null });

  return { origem, lead, evento, preferencias, consentimento: medicaoAceita, registroConsentimento };
})();
