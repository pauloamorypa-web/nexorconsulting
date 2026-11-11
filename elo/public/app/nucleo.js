/* Nexor Elo · peças comuns do app do instalador (e das páginas públicas):
   criação segura de elementos (texto sempre como texto, sem innerHTML com dados), ícones, avisos,
   chamada à API com CSRF (x-nexor: 1) e mensagem de "Sem conexão com a internet", botões à prova
   de toque duplo, janelas (dialog), formatação de dinheiro e datas no horário de Brasília. */

import { confirmarNoBotao } from "./confirmar.js";

/* ---------- Elementos ---------- */
export function h(tag, at = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(at ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") for (const [p, x] of Object.entries(v)) p.startsWith("--") ? el.style.setProperty(p, x) : (el.style[p] = x);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "value") el.value = v;
    else if (["checked", "disabled", "selected", "hidden", "required", "multiple"].includes(k)) el[k] = Boolean(v);
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

/* ---------- Ícones (SVG em linha) ---------- */
const CAM = {
  inicio: "M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10",
  proposta: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
  mais: "M12 5v14M5 12h14",
  os: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  menu: "M3 6h18M3 12h18M3 18h18",
  caixa: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  balanca: "M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0zM19 7l-3 7a4 4 0 0 0 6 0zM8 21h8",
  kit: "M4 7h16v13H4zM9 7V4h6v3M4 12h16",
  pessoas: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  repetir: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  nota: "M14 3H5v18h14V8zM14 3v5h5M8 13h8M8 17h5",
  titulo: "M3 6h18v12H3zM3 10h18M7 15h3",
  conta: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  sino: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  lua: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8",
  sol: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  voltar: "M15 18l-6-6 6-6",
  seta: "M9 18l6-6-6-6",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  busca: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3",
  lixo: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  copiar: "M9 9h11v11H9zM5 15H4V4h11v1",
  whatsapp: "M3 21l1.7-5A9 9 0 1 1 8 19.3zM9 8.5c0 3.5 3 6.5 6.5 6.5l1.5-1.5-2-1-1 1a5 5 0 0 1-3-3l1-1-1-2z",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  caneta: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  relogio: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
  alerta: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0M12 9v4M12 17h0",
  escudo: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10",
  calculadora: "M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM8 6h8M8 11h1M12 11h1M16 11h0M8 15h1M12 15h1M16 15v3M8 19h5",
  enviar: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  sair: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  editar: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  duplicar: "M8 8h12v12H8zM4 16V4h12",
  cadeado: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  ferramenta: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  local: "M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  pix: "M12 2l4 4-4 4-4-4zM6 8l4 4-4 4-4-4zM18 8l4 4-4 4-4-4zM12 14l4 4-4 4-4-4z",
  cartao: "M2 6h20v12H2zM2 10h20M6 15h4",
  codigo: "M3 5v14M6 5v14M10 5v14M13 5v14M17 5v14M21 5v14",
  estrela: "M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z",
  telefone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z",
};
export function ic(nome, t = 20) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: t, height: t, fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) s.setAttribute(k, v);
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", CAM[nome] ?? CAM.mais);
  s.append(p);
  return s;
}

/* ---------- Avisos ---------- */
export function aviso(texto, erro = false) {
  let caixa = document.getElementById("toasts");
  if (!caixa) {
    caixa = h("div", { id: "toasts", "aria-live": "polite" });
    document.body.append(caixa);
  }
  const t = h("div", { class: `toast ${erro ? "erro" : ""}`, role: erro ? "alert" : "status" }, erro ? ic("alerta", 18) : ic("check", 18), h("span", {}, texto));
  caixa.append(t);
  setTimeout(() => t.remove(), erro ? 6500 : 3600);
}

/** Faixa fixa de "Sem conexão com a internet" enquanto o aparelho estiver off-line */
export function vigiarConexao() {
  const faixa = h("div", { class: "sem-rede", role: "status", hidden: navigator.onLine }, ic("alerta", 16), "Sem conexão com a internet. O que você fizer agora não será salvo.");
  document.body.prepend(faixa);
  addEventListener("offline", () => (faixa.hidden = false));
  addEventListener("online", () => (faixa.hidden = true));
}

/* ---------- API ---------- */
export const MSG_SEM_REDE = "Sem conexão com a internet. Confira a conexão e tente de novo.";
export async function chamar(caminho, { metodo = "GET", corpo } = {}) {
  let r;
  try {
    r = await fetch(caminho, {
      method: metodo,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "x-nexor": "1", ...(corpo !== undefined ? { "content-type": "application/json" } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    const e = new Error(MSG_SEM_REDE);
    e.status = 0;
    throw e;
  }
  const json = (r.headers.get("content-type") ?? "").includes("json");
  const d = json ? await r.json().catch(() => ({})) : await r.text();
  if (!r.ok) {
    const msg = d?.erro ?? (r.status === 429 ? "Muitas tentativas agora. Aguarde alguns minutos e tente de novo." : r.status >= 500 ? "O servidor não respondeu como esperado. Tente de novo em instantes." : `Erro ${r.status}`);
    const e = new Error(msg);
    e.status = r.status;
    e.codigo = d?.codigo;
    throw e;
  }
  return d;
}

/* ---------- Botões à prova de toque duplo ---------- */
/** Roda fn com o botão desabilitado (um envio por vez); erros viram aviso */
export async function acao(botao, fn, aoErro) {
  if (botao.disabled) return;
  botao.disabled = true;
  botao.classList.add("carregando");
  botao.setAttribute("aria-busy", "true");
  try {
    return await fn();
  } catch (e) {
    if (aoErro?.(e)) return;
    aviso(e.message, true);
  } finally {
    botao.disabled = false;
    botao.classList.remove("carregando");
    botao.removeAttribute("aria-busy");
  }
}
export function botao(texto, fn, cls = "btn-cor", icone, extra = {}) {
  const b = h("button", { class: `btn ${cls}`, type: "button", ...extra }, icone ? ic(icone, 18) : null, texto);
  b.addEventListener("click", () => acao(b, () => fn(b)));
  return b;
}
/** Ação sensível: primeiro toque arma ("Toque de novo para…"), o segundo, depois de uma pausa, confirma */
export function botaoConfirma(texto, textoConfirmar, fn, cls = "btn-cor", icone, extra = {}) {
  const b = h("button", { class: `btn ${cls}`, type: "button", ...extra }, icone ? ic(icone, 18) : null, texto);
  b.addEventListener("click", () => {
    if (b.disabled) return;
    if (!confirmarNoBotao(b, textoConfirmar)) {
      b.classList.toggle("armado", Boolean(b.dataset.armadoEm));
      return;
    }
    delete b.dataset.armadoEm;
    delete b.dataset.ultimoToque;
    b.classList.remove("armado");
    if (b.dataset.textoOriginal) b.lastChild.textContent = b.dataset.textoOriginal;
    acao(b, () => fn(b));
  });
  return b;
}

/* ---------- Formulários ---------- */
let seq = 0;
export function campo(rotulo, entradaEl, ajuda) {
  const idEl = entradaEl.id || `c${++seq}`;
  entradaEl.id = idEl;
  const idAjuda = ajuda ? `${idEl}-ajuda` : null;
  if (idAjuda) entradaEl.setAttribute("aria-describedby", idAjuda);
  return h("div", { class: "campo" }, h("label", { for: idEl }, rotulo), entradaEl, ajuda ? h("small", { id: idAjuda, class: "ajuda" }, ajuda) : null);
}
export const entrada = (at = {}) => h("input", { class: "entrada", ...at });
export function area(at = {}, valor = "") {
  const t = h("textarea", { class: "entrada", rows: 3, ...at });
  t.value = valor ?? "";
  return t;
}
export function seletor(opcoes, valor, at = {}) {
  return h("select", { class: "entrada", ...at }, opcoes.map(([v, t]) => h("option", { value: v, selected: String(v) === String(valor ?? "") }, t)));
}
/** Campo de dinheiro: aceita "1.234,56", "1234,56" ou "1234.56" */
export function paraCentavos(v) {
  let s = String(v ?? "").replace(/R\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
export const emReaisCampo = (c) => (c === null || c === undefined ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export function entradaDinheiro(centavos, aoMudar, at = {}) {
  const i = h("input", { class: "entrada dinheiro", inputmode: "decimal", autocomplete: "off", value: emReaisCampo(centavos), ...at });
  i.addEventListener("input", () => {
    const c = paraCentavos(i.value);
    i.setAttribute("aria-invalid", c === null && i.value.trim() ? "true" : "false");
    if (c !== null) aoMudar(c);
  });
  i.addEventListener("blur", () => {
    const c = paraCentavos(i.value);
    if (c !== null) i.value = emReaisCampo(c);
  });
  return i;
}

/* ---------- Janela (dialog acessível) ---------- */
export function janela(titulo, conteudo, { largo = false } = {}) {
  const fechar = () => d.close();
  const corpo = h("div", { class: "janela-corpo" });
  const idT = `j${++seq}`;
  const d = h(
    "dialog",
    { class: `janela ${largo ? "larga" : ""}`, "aria-labelledby": idT },
    h("header", { class: "janela-topo" }, h("h2", { id: idT }, titulo), h("button", { class: "btn-icone", type: "button", "aria-label": "Fechar", onclick: fechar }, ic("x"))),
    corpo,
  );
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", (e) => {
    if (e.target === d) fechar();
  });
  document.body.append(d);
  limpar(corpo, typeof conteudo === "function" ? conteudo(fechar) : conteudo);
  d.showModal();
  return { fechar, corpo, el: d };
}

/* ---------- Formatação ---------- */
const BR = { timeZone: "America/Sao_Paulo" };
export const reais = (c) => (c === null || c === undefined ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const dataHora = (ms) => (ms ? new Date(ms).toLocaleString("pt-BR", { ...BR, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
export const dataCurta = (ms) => (ms ? new Date(ms).toLocaleDateString("pt-BR", { ...BR, day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
export const hora = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { ...BR, hour: "2-digit", minute: "2-digit" });
export const diaBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
export const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
export const somarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const diaDe = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);
export const iniciais = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
export const pct = (v) => `${Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
export const soDigitos = (s) => String(s ?? "").replace(/\D/g, "");
export function foneBR(s) {
  const d = soDigitos(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s ?? "";
}
export function cnpjBR(s) {
  const d = soDigitos(s);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : (s ?? "");
}
export function debounce(fn, ms = 300) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
export const chip = (texto, tipo = "") => h("span", { class: `chip ${tipo ? `chip-${tipo}` : ""}` }, texto);
export const vazio = (icone, titulo, texto, acaoEl) => h("div", { class: "vazio" }, h("div", { class: "vazio-icone" }, ic(icone, 26)), h("strong", {}, titulo), texto ? h("p", {}, texto) : null, acaoEl ?? null);

/** Copia para a área de transferência (com plano B para navegadores sem permissão) */
export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const t = h("textarea", { style: { position: "fixed", opacity: "0" } });
    t.value = texto;
    document.body.append(t);
    t.select();
    document.execCommand?.("copy");
    t.remove();
  }
  aviso("Link copiado.");
}

/** Link do WhatsApp (abre fora do app; rel=noreferrer para não levar o endereço da página) */
export function linkWhatsApp(fone, texto) {
  const d = soDigitos(fone);
  const num = d ? (d.startsWith("55") ? d : `55${d}`) : "";
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}

/* ---------- Status ---------- */
export const STATUS_PROPOSTA = {
  rascunho: ["Rascunho", ""],
  enviada: ["Enviada", "info"],
  vista: ["Vista", "info"],
  aceita: ["Aceita", "alerta"],
  paga: ["Paga", "ok"],
  expirada: ["Expirada", "perigo"],
  cancelada: ["Cancelada", "perigo"],
};
export const chipProposta = (s) => chip(...(STATUS_PROPOSTA[s] ?? [s, ""]));
export const STATUS_OS = { agendada: ["Agendada", "info"], a_caminho: ["A caminho", "alerta"], em_execucao: ["Em execução", "alerta"], concluida: ["Concluída", "ok"], cancelada: ["Cancelada", "perigo"] };
export const chipOs = (s) => chip(...(STATUS_OS[s] ?? [s, ""]));
export const PASSOS_OS = ["agendada", "a_caminho", "em_execucao", "concluida"];

/* ---------- Tema claro/escuro ---------- */
export function aplicarTemaSalvo() {
  try {
    const t = localStorage.getItem("nx-elo-tema");
    if (t) document.documentElement.dataset.theme = t;
  } catch {
    /* sem armazenamento */
  }
}
export function temaEscuro() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}
export function alternarTema() {
  document.documentElement.dataset.theme = temaEscuro() ? "light" : "dark";
  try {
    localStorage.setItem("nx-elo-tema", document.documentElement.dataset.theme);
  } catch {
    /* sem armazenamento */
  }
}
