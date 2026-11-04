/* Comissões por barbeiro no período (o barbeiro vê só as dele). */

import { get } from "../api.js";
import { entrada, h, limpar, reais } from "../ui.js";
import { indicador, tabela, topo } from "../comum.js";
import { dataBR, hojeISO } from "../base.js";

export async function render(area, ctx) {
  let de = `${hojeISO().slice(0, 7)}-01`;
  let ate = hojeISO();
  const corpo = h("div", { class: "pilha" });
  limpar(area, h("div", { class: "pagina" }, topo(ctx.barbeiro ? "Minhas comissões" : "Comissões", "Calculadas em cada comanda fechada, com o percentual de serviço e de produto de cada barbeiro.", entrada({ type: "date", value: de, onchange: (e) => ((de = e.target.value), carregar()) }), entrada({ type: "date", value: ate, onchange: (e) => ((ate = e.target.value), carregar()) })), corpo));

  async function carregar() {
    const c = await get(`/comissoes?de=${de}&ate=${ate}`);
    const total = c.por_barbeiro.reduce((s, x) => s + x.total_centavos, 0);
    limpar(
      corpo,
      h("div", { class: "indicadores" }, indicador("dinheiro", "Total a pagar", reais(total)), indicador("tesoura", "Atendimentos", String(c.por_barbeiro.reduce((s, x) => s + x.atendimentos, 0)))),
      h(
        "section",
        { class: "cartao" },
        h("h3", {}, "Por barbeiro"),
        tabela(
          [
            { titulo: "Barbeiro", valor: (x) => x.nome },
            { titulo: "Atendimentos", valor: (x) => String(x.atendimentos) },
            { titulo: "Serviços", valor: (x) => reais(x.servicos_centavos) },
            { titulo: "Produtos", valor: (x) => reais(x.produtos_centavos) },
            { titulo: "Total", valor: (x) => h("strong", {}, reais(x.total_centavos)), classe: "direita" },
          ],
          c.por_barbeiro,
          { vazio: "Nenhuma comissão no período." },
        ),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h3", {}, "Lançamentos"),
        tabela(
          [
            { titulo: "Dia", valor: (l) => dataBR(l.dia) },
            { titulo: "Item", valor: (l) => l.descricao },
            { titulo: "Base", valor: (l) => reais(l.base_centavos) },
            { titulo: "%", valor: (l) => `${l.percentual}%` },
            { titulo: "Comissão", valor: (l) => reais(l.valor_centavos), classe: "direita" },
          ],
          c.linhas,
        ),
      ),
    );
  }
  await carregar();
}
