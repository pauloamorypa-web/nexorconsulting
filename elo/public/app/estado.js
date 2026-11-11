/* Estado do app do instalador: sessão, chamadas à API do instalador e a proposta em montagem
   (guardada no aparelho para não perder o trabalho se o app fechar no meio). */
import { chamar } from "./nucleo.js";

export const S = { eu: null, demo: false };
const API = "/api/instalador";
export const get = (c) => chamar(API + c);
export const post = (c, corpo = {}) => chamar(API + c, { metodo: "POST", corpo });
export const put = (c, corpo = {}) => chamar(API + c, { metodo: "PUT", corpo });
export const del = (c) => chamar(API + c, { metodo: "DELETE" });

export const dono = () => S.eu?.usuario?.papel === "dono";
export const nomeEmpresa = () => S.eu?.conta?.nome_fantasia || S.eu?.conta?.razao_social || "";

export function ir(rota) {
  const alvo = `#/${rota.replace(/^#?\/?/, "")}`;
  if (location.hash === alvo) dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = alvo;
}

/* ---------- Proposta em montagem ---------- */
const CHAVE = "nx-elo-rascunho";
export function rascunho() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "null");
  } catch {
    return null;
  }
}
export function guardarRascunho(r) {
  try {
    if (r) localStorage.setItem(CHAVE, JSON.stringify(r));
    else localStorage.removeItem(CHAVE);
  } catch {
    /* sem armazenamento: segue só na memória */
  }
}
/** Transforma uma oferta do catálogo/comparador num item de proposta (preço de venda inicial com 40% sobre o custo) */
export function itemDeOferta(o, quantidade = 1) {
  const custo = o.preco_centavos ?? o.custo_unit_centavos ?? 0;
  return {
    tipo: "fornecedor",
    produto_id: o.produto_id ?? o.id,
    fornecedor_id: o.fornecedor_id,
    fornecedor: o.fornecedor ?? null,
    codigo: o.codigo,
    descricao: o.nome ?? o.descricao,
    unidade: o.unidade ?? "un",
    foto_url: o.foto_url ?? null,
    quantidade,
    custo_unit_centavos: custo,
    preco_unit_centavos: o.preco_venda_centavos ?? Math.round((custo * 1.4) / 10) * 10,
    disponivel: o.disponivel ?? null,
    prazo_dias: o.prazo_dias ?? null,
  };
}
/** Junta itens à proposta em montagem (a mesma oferta soma a quantidade) */
export function adicionarAoRascunho(itens) {
  const r = rascunho() ?? { itens: [] };
  for (const i of itens) {
    const igual = i.tipo === "fornecedor" && r.itens.find((x) => x.tipo === "fornecedor" && x.produto_id === i.produto_id);
    if (igual) igual.quantidade += i.quantidade;
    else r.itens.push(i);
  }
  guardarRascunho(r);
  return r;
}
/** Onde continuar a proposta em montagem (nova ou um rascunho já salvo) */
export function rotaRascunho() {
  const r = rascunho();
  return r?.id ? `propostas/${r.id}/editar` : "propostas/nova";
}
