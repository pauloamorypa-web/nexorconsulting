/* Peças de interface: criação segura de elementos (sem innerHTML com dados), ícones, avisos,
   janelas, formatação de datas, dinheiro e texto do WhatsApp. */

/** Cria um elemento. Textos sempre entram como texto (sem risco de XSS). */
export function h(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "hidden") el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  anexar(el, filhos);
  return el;
}

function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

export const limpar = (el, ...filhos) => {
  el.replaceChildren();
  anexar(el, filhos);
  return el;
};

/* ---------- Ícones (SVG em linha, traço) ---------- */

const CAMINHOS = {
  inicio: "M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10",
  conversas: "M4 5h16v11H8l-4 4zM8 9h8M8 12h5",
  contatos: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  ia: "M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  agenda: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  campanhas: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  config: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1",
  enviar: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  clipe: "M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5",
  magica: "M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5",
  robo: "M12 8V4H8M4 12h16v8H4zM2 14h2M20 14h2M9 16v0M15 16v0",
  pessoa: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  check: "M20 6 9 17l-5-5",
  checks: "M18 7 9.5 15.5 6 12M22 7l-8.5 8.5-1-1",
  relogio: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
  alerta: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0M12 9v4M12 17h0",
  busca: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3",
  mais: "M12 5v14M5 12h14",
  x: "M18 6 6 18M6 6l12 12",
  lixo: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  editar: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  sair: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  whatsapp: "M3 21l1.7-5A9 9 0 1 1 8 19.3zM9 8.5c0 3.5 3 6.5 6.5 6.5l1.5-1.5-2-1-1 1a5 5 0 0 1-3-3l1-1-1-2z",
  raio: "M13 2 3 14h9l-1 8 10-12h-9z",
  cerebro: "M9.5 2A2.5 2.5 0 0 0 7 4.5v.2A3 3 0 0 0 4.5 8a3 3 0 0 0 .6 4.6A3 3 0 0 0 7 18a2.5 2.5 0 0 0 5 0V4.5A2.5 2.5 0 0 0 9.5 2M14.5 2A2.5 2.5 0 0 1 17 4.5v.2A3 3 0 0 1 19.5 8a3 3 0 0 1-.6 4.6A3 3 0 0 1 17 18a2.5 2.5 0 0 1-5 0",
  livro: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM20 17v4H6.5a2.5 2.5 0 0 1 0-5",
  caixa: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  escudo: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10",
  grafico: "M3 3v18h18M7 15l4-4 3 3 6-6",
  fogo: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.2 1-3 .3 1.4 1.2 2.5 2.5 2.5",
  menu: "M3 6h18M3 12h18M3 18h18",
  voltar: "M15 18l-6-6 6-6",
  copiar: "M9 9h11v11H9zM5 15H4V4h11v1",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  upload: "M12 21V9M7 14l5-5 5 5M5 3h14",
  play: "M6 4l14 8-14 8z",
  nota: "M14 3H5v18h14V8zM14 3v5h5M8 13h8M8 17h5",
  estrela: "M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z",
  lua: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8",
  sol: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  aprender: "M22 10 12 5 2 10l10 5zM6 12v5c3 2 9 2 12 0v-5",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  digital: "M12 11v3a8 8 0 0 1-1.5 4.7M8.5 13.5A3.5 3.5 0 0 1 12 7.5a3.5 3.5 0 0 1 3.5 3.5v2a12 12 0 0 1-.9 4.5M5.3 16.5A12 12 0 0 0 5 14v-3a7 7 0 0 1 11.4-5.4M19 11v2.5a16 16 0 0 1-.6 4.5M8.7 20.5A8 8 0 0 0 9.5 17M12 2.5a8.5 8.5 0 0 1 3 .6",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM6 6h1v1H6zM17 6h1v1h-1zM6 17h1v1H6zM14 14h3v3h-3zM20 14v3M14 20h3M20 20h1",
  dinheiro: "M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 12h0M18 12h0",
  mala: "M3 8h18v12H3zM8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 13h18",
  predio: "M4 21V3h11v18M15 9h5v12M8 7h3M8 11h3M8 15h3M4 21h17",
  local: "M12 22s7-7.1 7-12.5A7 7 0 0 0 5 9.5C5 14.9 12 22 12 22M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  maleta: "M3 7h18v13H3zM9 7V4h6v3M3 12h18M12 12v2",
  saude: "M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7zM12 9v6M9 12h6",
  governo: "M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10 12 3l10 7z",
  sino: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
};

export function icone(nome, tamanho = 18) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", tamanho);
  svg.setAttribute("height", tamanho);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icone");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", CAMINHOS[nome] ?? CAMINHOS.mais);
  svg.append(p);
  return svg;
}

/* ---------- Avisos ---------- */

export function aviso(texto, tipo = "ok", ms = 4200) {
  const el = h("div", { class: `toast toast-${tipo}`, role: tipo === "erro" ? "alert" : "status" }, icone(tipo === "erro" ? "alerta" : tipo === "info" ? "sino" : "check", 16), h("span", {}, texto));
  document.getElementById("toasts").append(el);
  setTimeout(() => el.classList.add("saindo"), ms);
  setTimeout(() => el.remove(), ms + 400);
}

export const erro = (e) => aviso(e?.message ?? String(e), "erro", 6500);

/** Executa uma ação de botão com estado de carregamento e aviso de erro */
export async function acao(botao, fn) {
  if (botao) {
    botao.disabled = true;
    botao.classList.add("carregando");
  }
  try {
    return await fn();
  } catch (e) {
    erro(e);
    return undefined;
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.classList.remove("carregando");
    }
  }
}

/* ---------- Janela (modal) ---------- */

export function janela({ titulo, conteudo, acoes = [], largura = 560, aoFechar }) {
  const fundo = h("div", { class: "modal-fundo" });
  const fechar = () => {
    fundo.remove();
    document.removeEventListener("keydown", tecla);
    aoFechar?.();
  };
  const tecla = (e) => e.key === "Escape" && fechar();
  document.addEventListener("keydown", tecla);
  const caixa = h(
    "div",
    { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": titulo, style: { maxWidth: `${largura}px` } },
    h("header", { class: "modal-topo" }, h("h2", {}, titulo), h("button", { class: "btn-icone", "aria-label": "Fechar", onclick: fechar }, icone("x"))),
    h("div", { class: "modal-corpo" }, conteudo),
    acoes.length ? h("footer", { class: "modal-rodape" }, acoes.map((a) => (a instanceof Node ? a : h("button", { class: `btn ${a.classe ?? ""}`, onclick: (e) => a.fn(e, fechar) }, a.texto)))) : null,
  );
  fundo.append(caixa);
  fundo.addEventListener("mousedown", (e) => e.target === fundo && fechar());
  document.body.append(fundo);
  caixa.querySelector("input, textarea, select")?.focus();
  return { fechar, caixa };
}

export function confirmar(texto, { titulo = "Confirmar", botao = "Confirmar", perigo = false } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    janela({
      titulo,
      conteudo: h("p", {}, texto),
      largura: 440,
      aoFechar: () => resolve(ok),
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, f) => f() },
        {
          texto: botao,
          classe: perigo ? "btn-perigo" : "btn-primario",
          fn: (_, f) => {
            ok = true;
            f();
          },
        },
      ],
    });
  });
}

/* ---------- Formulários ---------- */

export function campo(rotulo, entrada, ajuda) {
  return h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, rotulo), entrada, ajuda ? h("small", { class: "campo-ajuda" }, ajuda) : null);
}

export const entrada = (atributos = {}) => h("input", { class: "entrada", ...atributos });
export const area = (atributos = {}, valor = "") => {
  const t = h("textarea", { class: "entrada", rows: 4, ...atributos });
  t.value = valor ?? "";
  return t;
};
export function seletor(opcoes, valor, atributos = {}) {
  const s = h("select", { class: "entrada", ...atributos }, opcoes.map(([v, t]) => h("option", { value: v, selected: String(v) === String(valor) }, t)));
  return s;
}
export function chave(ligada, aoMudar, rotulo) {
  const i = h("input", { type: "checkbox", checked: ligada, onchange: (e) => aoMudar(e.target.checked) });
  return h("label", { class: "chave" }, i, h("span", { class: "chave-trilho" }), rotulo ? h("span", {}, rotulo) : null);
}

/* ---------- Formatação ---------- */

const fusoBR = { timeZone: "America/Sao_Paulo" };
export const hora = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { ...fusoBR, hour: "2-digit", minute: "2-digit" });
export const dataCurta = (ms) => new Date(ms).toLocaleDateString("pt-BR", { ...fusoBR, day: "2-digit", month: "2-digit" });
export const dataHora = (ms) => new Date(ms).toLocaleString("pt-BR", { ...fusoBR, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const diaExtenso = (ms) => new Date(ms).toLocaleDateString("pt-BR", { ...fusoBR, weekday: "long", day: "2-digit", month: "long" });

export function quandoRelativo(ms) {
  if (!ms) return "";
  const d = Date.now() - ms;
  if (d < 60_000) return "agora";
  if (d < 3600_000) return `${Math.floor(d / 60_000)} min`;
  const hoje = new Date().toLocaleDateString("pt-BR", fusoBR);
  if (new Date(ms).toLocaleDateString("pt-BR", fusoBR) === hoje) return hora(ms);
  if (d < 6 * 86400_000) return new Date(ms).toLocaleDateString("pt-BR", { ...fusoBR, weekday: "short" }).replace(".", "");
  return dataCurta(ms);
}

export const reais = (centavos) => (centavos === null || centavos === undefined ? "—" : (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const numero = (n) => Number(n ?? 0).toLocaleString("pt-BR");
export const telefone = (wa) => {
  const d = String(wa ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return `+55 (${d.slice(2, 4)}) ${d.slice(4, d.length - 4)}-${d.slice(-4)}`;
  return d ? `+${d}` : "";
};
export const duracao = (ms) => {
  if (ms === null || ms === undefined) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1).replace(".", ",")} h`;
};

export const iniciais = (nome) =>
  String(nome || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

const CORES_AVATAR = ["#0066ff", "#7c3aed", "#0891b2", "#059669", "#d97706", "#db2777", "#4f46e5", "#0d9488"];
export function avatar(nome, chaveCor = nome, tamanho = 40) {
  let n = 0;
  for (const c of String(chaveCor ?? "")) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return h("span", { class: "avatar", style: { background: CORES_AVATAR[n % CORES_AVATAR.length], width: `${tamanho}px`, height: `${tamanho}px`, fontSize: `${Math.round(tamanho * 0.38)}px` }, "aria-hidden": "true" }, iniciais(nome));
}

/** Texto com a formatação do WhatsApp (*negrito*, _itálico_, ~riscado~, ```mono```) e links, sem innerHTML */
export function textoWhatsApp(texto) {
  const frag = document.createDocumentFragment();
  const regex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```|https?:\/\/[^\s<]+)/g;
  let ultimo = 0;
  for (const m of String(texto ?? "").matchAll(regex)) {
    if (m.index > ultimo) frag.append(document.createTextNode(texto.slice(ultimo, m.index)));
    const t = m[0];
    if (t.startsWith("http")) frag.append(h("a", { href: t, target: "_blank", rel: "noopener noreferrer" }, t));
    else if (t.startsWith("```")) frag.append(h("code", {}, t.slice(3, -3)));
    else frag.append(h({ "*": "strong", _: "em", "~": "s" }[t[0]], {}, t.slice(1, -1)));
    ultimo = m.index + t.length;
  }
  if (ultimo < String(texto ?? "").length) frag.append(document.createTextNode(texto.slice(ultimo)));
  return frag;
}

export function vazio(iconeNome, titulo, texto, botao) {
  return h("div", { class: "vazio" }, h("div", { class: "vazio-icone" }, icone(iconeNome, 28)), h("h3", {}, titulo), texto ? h("p", {}, texto) : null, botao ?? null);
}

export const ETAPA_ROTULO = { novo: "Novo", qualificado: "Qualificado", proposta: "Proposta", negociacao: "Negociação", cliente: "Cliente", perdido: "Perdido" };
export const SENTIMENTO = { positivo: ["😊", "Positivo"], neutro: ["😐", "Neutro"], negativo: ["😟", "Negativo"] };

export function copiarTexto(texto) {
  navigator.clipboard?.writeText(texto).then(
    () => aviso("Copiado!"),
    () => aviso("Não foi possível copiar.", "erro"),
  );
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/** Abas simples */
export function abas(itens, ativa, aoMudar) {
  return h(
    "div",
    { class: "abas", role: "tablist" },
    itens.map(([id, rotulo, ic]) => h("button", { class: `aba ${id === ativa ? "ativa" : ""}`, role: "tab", "aria-selected": id === ativa ? "true" : "false", onclick: () => aoMudar(id) }, ic ? icone(ic, 16) : null, rotulo)),
  );
}
