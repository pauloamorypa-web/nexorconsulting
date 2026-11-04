/* Caixa do dia: total por forma de pagamento, serviços × produtos, mensalidades do clube e vendas (com cancelamento). */

import { get, post } from "../api.js";
import { acao, aviso, confirmar, entrada, h, limpar, reais } from "../ui.js";
import { indicador, tabela, topo } from "../comum.js";
import { dataLonga, hojeISO, sit } from "../base.js";

export async function render(area, ctx) {
  let dia = hojeISO();
  const corpo = h("div", { class: "pilha" });
  limpar(area, h("div", { class: "pagina" }, topo("Caixa e vendas", "Tudo o que entrou no dia, separado por forma de pagamento.", entrada({ type: "date", value: dia, onchange: (e) => ((dia = e.target.value), carregar()) })), corpo));

  async function carregar() {
    const [c, vendas] = await Promise.all([get(`/caixa?dia=${dia}`), get(`/vendas?dia=${dia}`)]);
    const formas = ctx.eu.formas;
    limpar(
      corpo,
      h("p", { class: "suave" }, dataLonga(dia)),
      h("div", { class: "indicadores" }, indicador("dinheiro", "Total do dia", reais(c.total_centavos), `${c.vendas} venda(s)`), indicador("tesoura", "Serviços", reais(c.servicos_centavos)), indicador("sacola", "Produtos", reais(c.produtos_centavos)), indicador("coroa", "Mensalidades do clube", reais(c.clube_recebido_centavos)), c.descontos_centavos ? indicador("alerta", "Descontos dados", reais(c.descontos_centavos)) : null),
      h("section", { class: "cartao" }, h("h3", {}, "Por forma de pagamento"), Object.keys(c.por_forma).length ? h("div", { class: "barras-h" }, Object.entries(c.por_forma).map(([k, v]) => h("div", { class: "barra-h" }, h("span", {}, formas[k] ?? k), h("div", { class: "barra-h-trilho" }, h("i", { style: { width: `${c.total_centavos ? Math.max(2, (v / c.total_centavos) * 100) : 0}%` } })), h("strong", {}, reais(v))))) : h("p", { class: "suave" }, "Nenhuma venda neste dia.")),
      h(
        "section",
        { class: "cartao" },
        h("h3", {}, "Vendas"),
        tabela(
          [
            { titulo: "Hora", valor: (v) => new Date(v.criado_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) },
            { titulo: "Cliente", valor: (v) => v.cliente ?? "Balcão" },
            { titulo: "Itens", valor: (v) => v.itens.map((i) => `${i.quantidade}× ${i.nome}${i.clube ? " (clube)" : ""}`).join(", ") },
            { titulo: "Barbeiro", valor: (v) => v.barbeiro ?? "—" },
            { titulo: "Forma", valor: (v) => formas[v.forma] ?? v.forma },
            { titulo: "Total", valor: (v) => (v.status === "cancelada" ? sit("cancelada") : reais(v.total_centavos)), classe: "direita" },
            {
              titulo: "",
              valor: (v) =>
                v.status === "paga"
                  ? h("button", { class: "btn btn-pequeno btn-perigo-fantasma", onclick: async (e) => (await confirmar("Cancelar esta venda? O estoque volta e a comissão sai.", { botao: "Cancelar venda", perigo: true })) && acao(e.target, async () => (await post(`/vendas/${v.id}/cancelar`), aviso("Venda cancelada."), carregar())) }, "Cancelar")
                  : null,
            },
          ],
          vendas,
          { vazio: "Nenhuma venda neste dia." },
        ),
      ),
    );
  }
  await carregar();
}
