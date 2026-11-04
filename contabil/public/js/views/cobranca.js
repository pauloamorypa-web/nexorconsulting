/* Cobrança de documentos: o que falta de cada cliente, a régua e o botão "cobrar agora". */

import { get, post } from "../api.js";
import { acao, aviso, h, limpar } from "../ui.js";
import { botao, competenciaAnterior, mesBR, tabela, topo } from "../comum.js";
import { prazo, sit } from "../base.js";
import { acoesPendencia } from "./clientes.js";

export async function render(raiz, ctx) {
  const comp = h("input", { class: "entrada", type: "month", value: competenciaAnterior() });
  const sel = h("select", { class: "entrada" }, [["pendente", "Faltando"], ["", "Todos"], ["recebido", "Recebidos"], ["dispensado", "Dispensados"]].map(([v, t]) => h("option", { value: v }, t)));
  const so = h("label", { class: "linha-check" }, h("input", { type: "checkbox" }), h("span", {}, "Só atrasados"));
  const corpo = h("div");
  const carregar = async () => {
    const q = new URLSearchParams();
    if (so.querySelector("input").checked) q.set("atrasadas", "1");
    else {
      if (comp.value) q.set("competencia", comp.value);
      if (sel.value) q.set("status", sel.value);
    }
    const lista = await get(`/pendencias?${q}`);
    // Agrupa por cliente
    const porCliente = new Map();
    for (const p of lista) porCliente.set(p.cliente_id, [...(porCliente.get(p.cliente_id) ?? []), p]);
    limpar(
      corpo,
      porCliente.size
        ? [...porCliente.values()].map((ps) =>
            h(
              "section",
              { class: "cartao" },
              h("div", { class: "cartao-topo" }, h("h2", {}, h("a", { href: `#/clientes/${ps[0].cliente_id}/pendencias` }, ps[0].cliente)), h("div", { class: "acoes-linha" }, h("small", { class: "suave" }, [ps[0].whatsapp ? "WhatsApp" : null, ps[0].email ? "e-mail" : null].filter(Boolean).join(" · ") || "sem contato cadastrado"), ps.some((p) => p.status === "pendente") ? botao("Cobrar agora", (e) => acao(e.currentTarget, async () => { const r = await post(`/cobrar/${ps[0].cliente_id}`); aviso(`Cobrança enviada (${r.itens} documento(s)).`); carregar(); }), "btn-primario btn-pequeno", "sino") : null)),
              tabela([{ titulo: "Documento", valor: (p) => p.nome }, { titulo: "Competência", valor: (p) => mesBR(p.competencia) }, { titulo: "Prazo", valor: (p) => prazo(p.prazo, p.status === "pendente") }, { titulo: "Situação", valor: (p) => sit(p.status) }, { titulo: "Cobranças", valor: (p) => String(p.cobrancas), classe: "num" }, { titulo: "", valor: (p) => acoesPendencia(p, carregar) }], ps),
            ),
          )
        : h("section", { class: "cartao" }, h("p", { class: "suave centro" }, "Nada por aqui. 🎉")),
    );
  };
  for (const el of [comp, sel, so]) el.addEventListener("change", carregar);
  const r = ctx.eu.escritorio.config.regua;
  raiz.append(
    h(
      "div",
      { class: "pagina" },
      topo("Cobrança de documentos", r.ativa ? `Régua ligada: lembra ${r.antes} dia(s) antes do prazo e depois a cada ${r.a_cada} dia(s), até ${r.maximo} vezes, por ${r.canais.map((c) => (c === "whatsapp" ? "WhatsApp" : "e-mail")).join(" e ")}.` : "Régua desligada: as cobranças só saem pelo botão Cobrar agora."),
      h("section", { class: "cartao" }, h("div", { class: "filtros" }, comp, sel, so)),
      corpo,
    ),
  );
  await carregar();
}
