/* Chamados: pedidos dos clientes pelo portal e pelo WhatsApp (os que a IA passou para a equipe). */

import { get, post, put } from "../api.js";
import { acao, dataHora, h, janela, limpar } from "../ui.js";
import { botao, tabela, topo } from "../comum.js";
import { sit } from "../base.js";

export async function render(raiz, ctx) {
  const st = h("select", { class: "entrada" }, [["aberto", "Abertos"], ["respondido", "Respondidos"], ["resolvido", "Resolvidos"], ["", "Todos"]].map(([v, t]) => h("option", { value: v }, t)));
  const corpo = h("div");
  const carregar = async () => {
    const lista = await get(`/chamados${st.value ? `?status=${st.value}` : ""}`);
    limpar(corpo, tabela([{ titulo: "Atualizado", valor: (c) => dataHora(c.atualizado_em) }, { titulo: "Cliente", valor: (c) => c.cliente }, { titulo: "Assunto", valor: (c) => c.assunto }, { titulo: "Origem", valor: (c) => (c.origem === "whatsapp" ? "WhatsApp" : "Portal") }, { titulo: "Departamento", valor: (c) => ctx.eu.catalogos.departamentos[c.departamento] }, { titulo: "Situação", valor: (c) => sit(c.status) }], lista, { aoClicar: abrir, vazio: "Nenhum chamado aqui." }));
  };
  const abrir = (c) => {
    const texto = h("textarea", { class: "entrada", rows: 4, placeholder: c.origem === "whatsapp" ? "A resposta vai para o WhatsApp do cliente" : "A resposta aparece no portal do cliente" });
    const dep = h("select", { class: "entrada", onchange: (e) => acao(null, async () => await put(`/chamados/${c.id}`, { departamento: e.target.value })) }, Object.entries(ctx.eu.catalogos.departamentos).map(([v, t]) => h("option", { value: v, selected: v === c.departamento }, t)));
    const responder = (resolver) => (e, fechar) => acao(e.currentTarget, async () => (await post(`/chamados/${c.id}/responder`, { texto: texto.value, resolver }), fechar(), carregar(), ctx.recarregarEu()));
    janela({
      titulo: c.assunto,
      largura: 640,
      conteudo: h("div", { class: "pilha" }, h("div", { class: "filtros" }, h("strong", {}, c.cliente), dep), h("div", { class: "conversa" }, c.mensagens.map((m) => h("div", { class: `balao ${m.de === "escritorio" ? "escritorio" : ""}` }, m.texto, h("small", {}, `${m.nome} · ${dataHora(m.em)}`)))), texto),
      acoes: [c.status !== "resolvido" ? { texto: "Resolver sem responder", classe: "btn-fantasma", fn: (e, fechar) => acao(e.currentTarget, async () => (await put(`/chamados/${c.id}`, { status: "resolvido" }), fechar(), carregar(), ctx.recarregarEu())) } : null, { texto: "Responder e resolver", classe: "btn-fantasma", fn: responder(true) }, { texto: "Responder", classe: "btn-primario", fn: responder(false) }].filter(Boolean),
    });
  };
  st.addEventListener("change", carregar);
  raiz.append(h("div", { class: "pagina" }, topo("Chamados", "Pedidos do portal e do WhatsApp que precisam de alguém do escritório"), h("section", { class: "cartao" }, h("div", { class: "filtros", style: { marginBottom: "12px" } }, st), corpo)));
  await carregar();
  void botao;
}
