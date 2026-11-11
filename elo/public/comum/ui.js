/* Nexor Elo · peças de interface compartilhadas (derivadas do painel Nexor Barber).
   Criação segura de elementos (texto sempre como texto, sem innerHTML com dados), ícones, avisos, janelas,
   formulários declarativos, tabelas e formatação (dinheiro em centavos, datas no fuso de Brasília). */

/** Cria um elemento. Textos sempre entram como texto (sem risco de XSS). */
export function h(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") for (const [p, x] of Object.entries(v)) p.startsWith("--") ? el.style.setProperty(p, x) : (el.style[p] = x);
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
  caixa: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  etiqueta: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8M7.5 7.5h0",
  pessoas: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  pessoa: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  nota: "M14 3H5v18h14V8zM14 3v5h5M8 13h8M8 17h5",
  dinheiro: "M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 12h0M18 12h0",
  recibo: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h3",
  sino: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  config: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1",
  escudo: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10",
  predio: "M4 21V3h11v18M15 9h5v12M8 7h3M8 11h3M8 15h3M4 21h17",
  maleta: "M3 7h18v13H3zM9 7V4h6v3M3 12h18M12 12v2",
  grafico: "M3 3v18h18M7 15l4-4 3 3 6-6",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  cadeado: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  aberto: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2",
  carteira: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4 2 4M16 13.5h.01",
  check: "M20 6 9 17l-5-5",
  relogio: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
  alerta: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0M12 9v4M12 17h0",
  busca: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3",
  mais: "M12 5v14M5 12h14",
  x: "M18 6 6 18M6 6l12 12",
  lixo: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  editar: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  sair: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M3 6h18M3 12h18M3 18h18",
  upload: "M12 21V9M7 14l5-5 5 5M5 3h14",
  lua: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8",
  sol: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  local: "M12 22s7-7.1 7-12.5A7 7 0 0 0 5 9.5C5 14.9 12 22 12 22M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  ferramenta: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  olho: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  raio: "M13 2 3 14h9l-1 8 10-12h-9z",
  copiar: "M9 9h11v11H9zM5 15H4V4h11v1",
  cadastro: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6",
  seta: "M5 12h14M13 6l6 6-6 6",
};

export function icone(nome, tamanho = 18) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: tamanho, height: tamanho, fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(k, v);
  svg.classList.add("icone");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", CAMINHOS[nome] ?? CAMINHOS.mais);
  svg.append(p);
  return svg;
}

/* ---------- Avisos ---------- */

function caixaAvisos() {
  let c = document.getElementById("toasts");
  if (!c) {
    c = h("div", { id: "toasts", "aria-live": "polite" });
    document.body.append(c);
  }
  return c;
}

export function aviso(texto, tipo = "ok", ms = 4200) {
  const el = h("div", { class: `toast toast-${tipo}`, role: tipo === "erro" ? "alert" : "status" }, icone(tipo === "erro" ? "alerta" : tipo === "info" ? "sino" : "check", 16), h("span", {}, texto));
  caixaAvisos().append(el);
  setTimeout(() => el.classList.add("saindo"), ms);
  setTimeout(() => el.remove(), ms + 400);
}

export const erro = (e) => aviso(e?.message ?? String(e), "erro", 6500);

/** Executa a ação de um botão: desabilita enquanto envia (proteção contra clique duplo) e mostra o erro em português */
export async function acao(botao, fn) {
  if (botao?.disabled) return undefined;
  if (botao) {
    botao.disabled = true;
    botao.classList.add("carregando");
    botao.setAttribute("aria-busy", "true");
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
      botao.removeAttribute("aria-busy");
    }
  }
}

/* ---------- Janela (modal) ---------- */

// Duplo clique num botão da janela: o 1º fecha e o 2º "cairia" na tela de baixo. Por 400 ms depois de fechar, cliques são ignorados.
let ignorarCliquesAte = 0;
document.addEventListener(
  "click",
  (e) => {
    if (Date.now() < ignorarCliquesAte) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
  true,
);

let idJanela = 0;
/**
 * Janela com foco preso dentro, Esc fecha e o foco volta para quem abriu.
 * acoes: [{ texto, classe, fn(evento, fechar, botao) }] — o botão fica desabilitado enquanto fn (async) roda.
 */
export function janela({ titulo, conteudo, acoes = [], largura = 560, aoFechar }) {
  const anterior = document.activeElement;
  const idTitulo = `janela-titulo-${++idJanela}`;
  const fundo = h("div", { class: "modal-fundo" });
  let fechada = false;
  const fechar = () => {
    if (fechada) return;
    fechada = true;
    ignorarCliquesAte = Date.now() + 400;
    fundo.remove();
    document.removeEventListener("keydown", tecla);
    aoFechar?.();
    if (anterior && document.contains(anterior)) anterior.focus?.();
  };
  const tecla = (e) => {
    if (e.key === "Escape") return fechar();
    if (e.key !== "Tab") return;
    const foco = [...caixa.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent !== null);
    if (!foco.length) return;
    const [primeiro, ultimo] = [foco[0], foco.at(-1)];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };
  document.addEventListener("keydown", tecla);
  const botoes = acoes.map((a) => {
    if (a instanceof Node) return a;
    const b = h("button", { type: "button", class: `btn ${a.classe ?? ""}` }, a.texto);
    b.addEventListener("click", (e) => acao(b, () => a.fn(e, fechar, b)));
    return b;
  });
  const caixa = h(
    "div",
    { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": idTitulo, style: { maxWidth: `${largura}px` } },
    h("header", { class: "modal-topo" }, h("h2", { id: idTitulo }, titulo), h("button", { type: "button", class: "btn-icone", "aria-label": "Fechar", onclick: fechar }, icone("x"))),
    h("div", { class: "modal-corpo" }, conteudo),
    botoes.length ? h("footer", { class: "modal-rodape" }, botoes) : null,
  );
  fundo.append(caixa);
  fundo.addEventListener("mousedown", (e) => e.target === fundo && fechar());
  document.body.append(fundo);
  (caixa.querySelector(".modal-corpo input:not([type=checkbox]):not([disabled]), .modal-corpo textarea, .modal-corpo select") ?? caixa.querySelector(".modal-topo button")).focus();
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
        { texto: botao, classe: perigo ? "btn-perigo" : "btn-primario", fn: (_, f) => ((ok = true), f()) },
      ],
    });
  });
}

/** Pergunta um texto opcional (motivo) e devolve null se cancelar */
export function perguntar(texto, { titulo = "Confirmar", botao = "Confirmar", rotulo = "Motivo (opcional)", perigo = false, valor = "" } = {}) {
  return new Promise((resolve) => {
    let r = null;
    const campoTexto = h("textarea", { class: "entrada", rows: 3, maxlength: 300 });
    campoTexto.value = valor;
    janela({
      titulo,
      largura: 480,
      conteudo: h("div", { class: "pilha" }, h("p", {}, texto), campo(rotulo, campoTexto)),
      aoFechar: () => resolve(r),
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, f) => f() },
        { texto: botao, classe: perigo ? "btn-perigo" : "btn-primario", fn: (_, f) => ((r = campoTexto.value.trim()), f()) },
      ],
    });
  });
}

/* ---------- Formulários ---------- */

let idCampo = 0;
export function campo(rotulo, entradaEl, ajuda) {
  const id = entradaEl.id || `campo-${++idCampo}`;
  entradaEl.id = id;
  const idAjuda = ajuda ? `${id}-ajuda` : null;
  if (idAjuda) entradaEl.setAttribute("aria-describedby", idAjuda);
  return h("div", { class: "campo" }, h("label", { class: "campo-rotulo", for: id }, rotulo), entradaEl, ajuda ? h("small", { class: "campo-ajuda", id: idAjuda }, ajuda) : null);
}
export const entrada = (atributos = {}) => h("input", { class: "entrada", ...atributos });
export function seletor(opcoes, valor, atributos = {}) {
  return h("select", { class: "entrada", ...atributos }, opcoes.map(([v, t]) => h("option", { value: v, selected: String(v) === String(valor ?? "") }, t)));
}

/**
 * Converte "1.234,56" (ou "45,90", "12.50", "R$ 10") em centavos. Texto inválido devolve null.
 */
export const paraCentavos = (v) => {
  const t = String(v ?? "").replace(/R\$|\s/g, "");
  let n = null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t) || /^\d+(,\d{1,2})?$/.test(t)) n = Number(t.replace(/\./g, "").replace(",", "."));
  else if (/^\d+\.\d{1,2}$/.test(t)) n = Number(t);
  return n !== null && Number.isFinite(n) ? Math.round(n * 100) : null;
};
export const deCentavos = (c) => (c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(".", ","));

/**
 * Formulário declarativo.
 * campos: [{ nome, rotulo, tipo: texto|numero|data|select|check|reais|area|email|tel|senha, opcoes, ajuda, obrigatorio, largura: 2, placeholder, min, max, passo, desativado }]
 */
export function formulario(campos, valores = {}) {
  const entradas = new Map();
  const grade = h(
    "div",
    { class: "form-grade" },
    campos.map((c) => {
      if (c.titulo) return h("h3", { class: "form-secao" }, c.titulo);
      const v = valores?.[c.nome];
      const id = `campo-${++idCampo}`;
      const idAjuda = c.ajuda ? `${id}-ajuda` : undefined;
      const base = { id, class: "entrada", name: c.nome, required: c.obrigatorio, placeholder: c.placeholder ?? "", disabled: c.desativado, "aria-describedby": idAjuda, autocomplete: c.autocomplete };
      let el;
      if (c.tipo === "select") el = h("select", base, (c.opcoes ?? []).map(([val, txt]) => h("option", { value: val, selected: String(val) === String(v ?? c.padrao ?? "") }, txt)));
      else if (c.tipo === "area") {
        el = h("textarea", { ...base, rows: c.linhas ?? 3 });
        el.value = v ?? "";
      } else if (c.tipo === "check") el = h("input", { id, type: "checkbox", name: c.nome, checked: Boolean(v ?? c.padrao), disabled: c.desativado, "aria-describedby": idAjuda });
      else
        el = h("input", {
          ...base,
          type: { numero: "number", data: "date", email: "email", tel: "tel", senha: "password", reais: "text" }[c.tipo] ?? "text",
          inputmode: c.tipo === "reais" ? "decimal" : c.tipo === "numero" ? "numeric" : c.inputmode,
          step: c.passo,
          min: c.min,
          max: c.max,
          maxlength: c.maxlength,
          value: c.tipo === "reais" ? deCentavos(v) : v ?? c.padrao ?? "",
        });
      entradas.set(c.nome, { el, c });
      const ajuda = c.ajuda ? h("small", { class: "campo-ajuda", id: idAjuda }, c.ajuda) : null;
      if (c.tipo === "check") return h("div", { class: `linha-check ${c.largura === 2 ? "largo" : ""}` }, el, h("label", { for: id }, c.rotulo), ajuda);
      return h("div", { class: `campo ${c.largura === 2 ? "largo" : ""}` }, h("label", { class: "campo-rotulo", for: id }, c.rotulo, c.obrigatorio ? h("span", { "aria-hidden": "true" }, " *") : null), el, ajuda);
    }),
  );
  return {
    el: grade,
    entrada: (nome) => entradas.get(nome)?.el,
    ler() {
      const r = {};
      for (const [nome, { el, c }] of entradas) {
        if (c.desativado) continue;
        let v;
        if (c.tipo === "check") v = el.checked;
        else if (c.tipo === "reais") {
          v = el.value.trim() === "" ? null : paraCentavos(el.value);
          if (el.value.trim() !== "" && v === null) {
            el.focus();
            throw new Error(`${c.rotulo}: valor inválido. Use o formato 45,90.`);
          }
        } else if (c.tipo === "numero") v = el.value === "" ? null : Number(el.value);
        else v = el.value.trim() === "" ? null : el.value.trim();
        if (c.obrigatorio && (v === null || v === "")) {
          el.focus();
          throw new Error(`Preencha: ${c.rotulo}`);
        }
        if (v !== null || c.enviarNulo) r[nome] = v;
      }
      return r;
    },
  };
}

/** Tabela: colunas [{ titulo, valor: (linha) => conteúdo, classe }]. No celular vira fichas com o rótulo de cada coluna. */
export function tabela(colunas, linhas, { vazio: textoVazio = "Nada por aqui ainda.", rotulo } = {}) {
  if (!linhas.length) return h("p", { class: "suave centro", style: { padding: "24px 0" } }, textoVazio);
  return h(
    "div",
    { class: "tabela-rolagem" },
    h(
      "table",
      { class: "tabela responsiva", "aria-label": rotulo },
      h("thead", {}, h("tr", {}, colunas.map((c) => h("th", { scope: "col", class: c.classe ?? "" }, c.titulo)))),
      h("tbody", {}, linhas.map((l) => h("tr", {}, colunas.map((c) => h("td", { class: c.classe ?? "", "data-rotulo": c.titulo }, c.valor(l)))))),
    ),
  );
}

export function topo(titulo, subtitulo, ...acoes) {
  return h("header", { class: "pagina-topo" }, h("div", {}, h("h1", {}, titulo), subtitulo ? h("p", { class: "suave" }, subtitulo) : null), acoes.flat().filter(Boolean).length ? h("div", { class: "acoes-topo" }, acoes) : null);
}

export function indicador(ic, rotulo, valor, detalhe, cor, extra = {}) {
  return h(extra.href ? "a" : "div", { class: `indicador ${extra.classe ?? ""}`, href: extra.href, style: cor ? { "--cor": cor, textDecoration: "none", color: "inherit" } : { textDecoration: "none", color: "inherit" } }, h("span", { class: "indicador-ic" }, icone(ic, 18)), h("small", {}, rotulo), h("strong", {}, valor), detalhe ? h("span", { class: "indicador-det" }, detalhe) : null);
}

export const botao = (texto, fn, classe = "", ic, extra = {}) => {
  const b = h("button", { class: `btn ${classe}`, type: "button", ...extra }, ic ? icone(ic, 16) : null, texto);
  if (fn) b.addEventListener("click", (e) => acao(b, () => fn(e, b)));
  return b;
};

export function vazio(iconeNome, titulo, texto, botaoEl) {
  return h("div", { class: "vazio" }, h("div", { class: "vazio-icone" }, icone(iconeNome, 28)), h("h3", {}, titulo), texto ? h("p", {}, texto) : null, botaoEl ?? null);
}

export function abas(itens, ativa, aoMudar) {
  return h(
    "div",
    { class: "abas", role: "tablist" },
    itens.map(([id, rotulo, n]) => h("button", { type: "button", class: `aba ${id === ativa ? "ativa" : ""}`, role: "tab", "aria-selected": id === ativa ? "true" : "false", onclick: () => aoMudar(id) }, rotulo, n ? h("span", { class: "chip" }, n) : null)),
  );
}

export const carregandoBloco = () => h("div", { class: "carregando-bloco", role: "status", "aria-label": "Carregando" }, h("div", { class: "girando" }));

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function copiarTexto(texto) {
  navigator.clipboard?.writeText(texto).then(
    () => aviso("Copiado!"),
    () => aviso("Não foi possível copiar.", "erro"),
  );
}

/* ---------- Formatação ---------- */

const fusoBR = { timeZone: "America/Sao_Paulo" };
export const reais = (centavos) => (centavos === null || centavos === undefined ? "—" : (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const numero = (n) => Number(n ?? 0).toLocaleString("pt-BR");
export const dataHora = (ms) => (ms ? new Date(ms).toLocaleString("pt-BR", { ...fusoBR, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const dataCurta = (ms) => (ms ? new Date(ms).toLocaleDateString("pt-BR", { ...fusoBR, day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
/** "AAAA-MM-DD" → "dd/mm/aaaa" */
export const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
export const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
export const somarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const cnpjBR = (c) => (c && c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c ?? "");
export const fone = (f) => {
  const d = String(f ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
};
/** Cidade em maiúsculas (vinda da Receita) → "Uberlândia" fica "Uberlandia" capitalizado */
export const cidadeBonita = (c) => String(c ?? "").toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\s(De|Da|Do|Dos|Das)\s/g, (m) => m.toLowerCase());
export function quando(ms) {
  if (!ms) return "";
  const d = Date.now() - ms;
  if (d < 60_000 && d > -60_000) return "agora";
  if (d > 0 && d < 3600_000) return `há ${Math.floor(d / 60_000)} min`;
  if (d > 0 && d < 86400_000) return `há ${Math.floor(d / 3600_000)} h`;
  return dataHora(ms);
}
export const iniciais = (nome) =>
  String(nome || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
const CORES_AVATAR = ["#0066ff", "#7c3aed", "#0e7490", "#047857", "#b45309", "#be185d", "#4f46e5", "#0f766e"];
export function avatar(nome, tamanho = 36) {
  let n = 0;
  for (const c of String(nome ?? "")) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return h("span", { class: "avatar", style: { background: CORES_AVATAR[n % CORES_AVATAR.length], width: `${tamanho}px`, height: `${tamanho}px`, fontSize: `${Math.round(tamanho * 0.38)}px` }, "aria-hidden": "true" }, iniciais(nome));
}

/* ---------- Situações (chips) ---------- */

const SITUACOES = {
  // contas e vínculos
  ativo: ["Ativo", "ok"], pendente: ["Pendente", "alerta"], recusado: ["Recusado", "perigo"], suspenso: ["Suspenso", "perigo"], aprovado: ["Aprovado", "ok"], bloqueado: ["Bloqueado", "perigo"],
  // propostas
  rascunho: ["Rascunho", ""], enviada: ["Enviada", "info"], vista: ["Vista", "info"], aceita: ["Aceita", "alerta"], paga: ["Paga", "ok"], expirada: ["Expirada", ""], cancelada: ["Cancelada", ""],
  // reservas
  ativa: ["Ativa", "info"], baixada: ["Baixada (saiu)", "ok"], liberada: ["Liberada", ""],
  // títulos e repasses
  aberto: ["Em aberto", "alerta"], pago: ["Pago", "ok"], cancelado: ["Cancelado", ""], vencido: ["Vencido", "perigo"], previsto: ["Previsto", "info"], recebido: ["Recebido", "ok"],
  // notas
  autorizada: ["Autorizada", "ok"], processando: ["Processando", "info"], erro: ["Erro", "perigo"], simulada: ["Simulada", "info"],
};
export function situacao(chave, texto) {
  const [rotulo, cor] = SITUACOES[chave] ?? [chave ?? "—", ""];
  return h("span", { class: `chip ${cor ? `chip-${cor}` : ""}` }, texto ?? rotulo);
}

export function selo(n) {
  return n ? h("span", { class: "selo", "aria-label": `${n} não lidas` }, n > 99 ? "99+" : String(n)) : null;
}

/** Score de 0 a 100 num anel */
export function anelScore(v, grande = false) {
  const cor = v >= 70 ? "var(--verde)" : v >= 45 ? "var(--amarelo)" : "var(--vermelho)";
  return h("span", { class: `score ${grande ? "score-grande" : ""}`, style: { "--v": String(v ?? 0), "--cor": cor }, role: "img", "aria-label": `Score ${v ?? 0} de 100` }, h("span", { "aria-hidden": "true" }, String(v ?? 0)));
}
