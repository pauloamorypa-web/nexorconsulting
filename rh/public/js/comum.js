/* Peças comuns do painel do RH: formulários declarativos, datas, horas, situação e tabelas. */

import { h, icone } from "./ui.js";

/** "AAAA-MM-DD" → "dd/mm/aaaa" */
export const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
export const mesBR = (c) => {
  const [a, m] = String(c).split("-");
  return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m) - 1]}/${a}`;
};
export const hhmm = (min) => {
  if (!min) return "—";
  const s = min < 0 ? "-" : "";
  const a = Math.abs(Math.round(min));
  return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`;
};
export const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
export const competenciaAtual = () => hojeISO().slice(0, 7);
export const competenciaAnterior = () => {
  const [a, m] = competenciaAtual().split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
export const cpfBR = (c) => (c && c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c ?? "");
export const cnpjBR = (c) => (c && c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c ?? "");
export const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const SITUACOES = {
  ativo: ["Ativo", "ok"],
  ferias: ["Em férias", "info"],
  afastado: ["Afastado", "alerta"],
  desligado: ["Desligado", ""],
  trabalhando: ["Trabalhando", "ok"],
  intervalo: ["Em intervalo", "info"],
  atrasado: ["Atrasado", "perigo"],
  aguardando: ["Ainda não chegou", ""],
  saiu: ["Saiu", ""],
  folga: ["Folga", ""],
  pendente: ["Pendente", "alerta"],
  aprovado: ["Aprovado", "ok"],
  aprovada: ["Aprovada", "ok"],
  recusado: ["Recusado", "perigo"],
  recusada: ["Recusada", "perigo"],
  solicitada: ["Aguardando análise", "alerta"],
  cancelada: ["Cancelada", ""],
  gerado: ["Gerado (falta assinar)", "alerta"],
  assinado: ["Assinado, pronto para enviar", "info"],
  enviado: ["Enviado, aguardando retorno", "info"],
  processado: ["Aceito pelo eSocial", "ok"],
  erro: ["Recusado pelo eSocial", "perigo"],
  calculada: ["Calculada", "alerta"],
  fechada: ["Fechada", "ok"],
  aberta: ["Aberta", "ok"],
  pausada: ["Pausada", "alerta"],
};
export function situacao(chave, texto) {
  const [rotulo, cor] = SITUACOES[chave] ?? [chave, ""];
  return h("span", { class: `chip ${cor ? `chip-${cor}` : ""}` }, texto ?? rotulo);
}

/** Converte "1.234,56" em centavos */
export const paraCentavos = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const deCentavos = (c) => (c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(".", ","));

/**
 * Formulário declarativo.
 * campos: [{ nome, rotulo, tipo: texto|numero|data|hora|mes|select|check|reais|area|email|tel|senha, opcoes, ajuda, obrigatorio, largura: 1|2, placeholder }]
 * Nomes com ponto ("endereco.cep") viram objetos aninhados.
 */
export function formulario(campos, valores = {}) {
  const pegar = (obj, caminho) => caminho.split(".").reduce((o, k) => o?.[k], obj);
  const entradas = new Map();
  const grade = h(
    "div",
    { class: "form-grade" },
    campos.map((c) => {
      if (c.titulo) return h("h3", { class: "form-secao" }, c.titulo);
      const v = pegar(valores, c.nome);
      let el;
      const base = { class: "entrada", name: c.nome, required: c.obrigatorio, placeholder: c.placeholder ?? "", disabled: c.desativado };
      if (c.tipo === "select") el = h("select", base, (c.opcoes ?? []).map(([val, txt]) => h("option", { value: val, selected: String(val) === String(v ?? c.padrao ?? "") }, txt)));
      else if (c.tipo === "area") {
        el = h("textarea", { ...base, rows: c.linhas ?? 3 });
        el.value = v ?? "";
      } else if (c.tipo === "check") el = h("input", { type: "checkbox", name: c.nome, checked: Boolean(v ?? c.padrao) });
      else
        el = h("input", {
          ...base,
          type: { numero: "number", data: "date", hora: "time", mes: "month", email: "email", tel: "tel", senha: "password", reais: "text" }[c.tipo] ?? "text",
          inputmode: c.tipo === "reais" ? "decimal" : undefined,
          step: c.passo,
          min: c.min,
          max: c.max,
          value: c.tipo === "reais" ? deCentavos(v) : v ?? c.padrao ?? "",
        });
      entradas.set(c.nome, { el, c });
      if (c.tipo === "check") return h("label", { class: `linha-check ${c.largura === 2 ? "largo" : ""}` }, el, h("span", {}, c.rotulo), c.ajuda ? h("small", { class: "campo-ajuda" }, c.ajuda) : null);
      return h("label", { class: `campo ${c.largura === 2 ? "largo" : ""}` }, h("span", { class: "campo-rotulo" }, c.rotulo, c.obrigatorio ? " *" : ""), el, c.ajuda ? h("small", { class: "campo-ajuda" }, c.ajuda) : null);
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
        else if (c.tipo === "reais") v = el.value.trim() === "" ? (c.obrigatorio ? 0 : null) : paraCentavos(el.value);
        else if (c.tipo === "numero") v = el.value === "" ? null : Number(el.value);
        else v = el.value.trim() === "" ? null : el.value.trim();
        if (c.obrigatorio && (v === null || v === "")) {
          el.focus();
          throw new Error(`Preencha: ${c.rotulo}`);
        }
        const partes = nome.split(".");
        let alvo = r;
        for (const p of partes.slice(0, -1)) alvo = alvo[p] ??= {};
        if (v !== null || c.enviarNulo) alvo[partes.at(-1)] = v;
      }
      return r;
    },
  };
}

/** Tabela simples: colunas [{ titulo, valor: (linha) => conteúdo, classe }] */
export function tabela(colunas, linhas, { aoClicar, vazio: textoVazio = "Nada por aqui ainda." } = {}) {
  if (!linhas.length) return h("p", { class: "suave centro", style: { padding: "24px 0" } }, textoVazio);
  return h(
    "div",
    { class: "tabela-rolagem" },
    h(
      "table",
      { class: "tabela" },
      h("thead", {}, h("tr", {}, colunas.map((c) => h("th", { class: c.classe ?? "" }, c.titulo)))),
      h(
        "tbody",
        {},
        linhas.map((l) => h("tr", { class: aoClicar ? "clicavel" : "", onclick: aoClicar ? () => aoClicar(l) : null }, colunas.map((c) => h("td", { class: c.classe ?? "" }, c.valor(l))))),
      ),
    ),
  );
}

export function topo(titulo, subtitulo, ...acoes) {
  return h("header", { class: "pagina-topo" }, h("div", {}, h("h1", {}, titulo), subtitulo ? h("p", { class: "suave" }, subtitulo) : null), acoes.length ? h("div", { class: "acoes-topo" }, acoes) : null);
}

export function indicador(ic, rotulo, valor, detalhe, cor) {
  return h("div", { class: "indicador", style: cor ? { "--cor": cor } : null }, h("span", { class: "indicador-ic" }, icone(ic, 18)), h("small", {}, rotulo), h("strong", {}, valor), detalhe ? h("span", { class: "indicador-det" }, detalhe) : null);
}

export const botao = (texto, fn, classe = "", ic) => h("button", { class: `btn ${classe}`, type: "button", onclick: fn }, ic ? icone(ic, 16) : null, texto);

/** Baixa um arquivo da API (com cookie de sessão) */
export async function baixar(caminho) {
  const r = await fetch(`/api${caminho}`, { credentials: "same-origin" });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.erro ?? `Erro ${r.status}`);
  }
  const nome = /filename\*?=(?:UTF-8'')?"?([^";]+)/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "arquivo";
  const url = URL.createObjectURL(await r.blob());
  const a = h("a", { href: url, download: decodeURIComponent(nome) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Envia um arquivo e devolve { id, nome } */
export async function enviar(caminho, arquivo) {
  const r = await fetch(`/api${caminho}`, { method: "POST", credentials: "same-origin", headers: { "x-nexor": "1", "Content-Type": arquivo.type || "application/octet-stream", "x-nome": encodeURIComponent(arquivo.name) }, body: arquivo });
  const d = await r.json();
  if (!r.ok) throw new Error(d.erro ?? `Erro ${r.status}`);
  return d;
}
