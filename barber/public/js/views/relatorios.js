/* Relatórios do dono: faturamento, ticket médio, ocupação por dia, desempenho por barbeiro, clube e clientes. */

import { get } from "../api.js";
import { entrada, h, limpar, reais } from "../ui.js";
import { indicador, tabela, topo } from "../comum.js";
import { dataBR, hojeISO } from "../base.js";

export async function render(area) {
  let de = `${hojeISO().slice(0, 7)}-01`;
  let ate = hojeISO();
  const corpo = h("div", { class: "pilha" });
  limpar(area, h("div", { class: "pagina" }, topo("Relatórios", "O desempenho da barbearia no período escolhido.", entrada({ type: "date", value: de, onchange: (e) => ((de = e.target.value), carregar()) }), entrada({ type: "date", value: ate, onchange: (e) => ((ate = e.target.value), carregar()) })), corpo));

  async function carregar() {
    const r = await get(`/relatorios?de=${de}&ate=${ate}`);
    const max = Math.max(1, ...r.por_dia.map((d) => d.total_centavos));
    limpar(
      corpo,
      h(
        "div",
        { class: "indicadores" },
        indicador("dinheiro", "Faturamento", reais(r.faturamento_centavos), `serviços ${reais(r.servicos_centavos)} · produtos ${reais(r.produtos_centavos)}`),
        indicador("tesoura", "Atendimentos", String(r.atendimentos), `ticket médio ${reais(r.ticket_medio_centavos)}`),
        indicador("coroa", "Clube", `${r.clube.ativas} assinantes`, `${reais(r.clube.receita_mensal_centavos)}/mês · recebido ${reais(r.clube_recebido_centavos)}`),
        indicador("celular", "Agendados pelo app", String(r.pelo_app), `${r.pela_espera} pela lista de espera`),
        indicador("alerta", "Faltas e cancelamentos", `${r.faltas} · ${r.cancelados}`),
        indicador("contatos", "Clientes", String(r.clientes.total), `${r.clientes.novos} novos · ${r.clientes.sumidos} sumidos`),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h3", {}, "Faturamento e ocupação por dia"),
        h(
          "div",
          { class: "grafico-dias", role: "img", "aria-label": "Faturamento por dia" },
          r.por_dia.map((d) => h("div", { class: "grafico-dia", title: `${dataBR(d.dia)}: ${reais(d.total_centavos)} · ocupação ${d.ocupacao}%` }, h("i", { style: { height: `${Math.max(2, (d.total_centavos / max) * 100)}%` } }), h("small", {}, d.dia.slice(8)))),
        ),
      ),
      h(
        "div",
        { class: "grade-2" },
        h(
          "section",
          { class: "cartao" },
          h("h3", {}, "Por barbeiro"),
          tabela(
            [
              { titulo: "Barbeiro", valor: (b) => b.nome },
              { titulo: "Atend.", valor: (b) => String(b.atendimentos) },
              { titulo: "Faltas", valor: (b) => String(b.faltas) },
              { titulo: "Faturado", valor: (b) => reais(b.faturado_centavos), classe: "direita" },
            ],
            r.por_barbeiro,
          ),
        ),
        h(
          "section",
          { class: "cartao" },
          h("h3", {}, "Mais vendidos"),
          tabela([{ titulo: "Serviço", valor: (s) => s.nome }, { titulo: "Qtd", valor: (s) => String(s.quantidade) }, { titulo: "Total", valor: (s) => reais(s.total_centavos), classe: "direita" }], r.top_servicos, { vazio: "Sem serviços no período." }),
          r.top_produtos.length ? tabela([{ titulo: "Produto", valor: (s) => s.nome }, { titulo: "Qtd", valor: (s) => String(s.quantidade) }, { titulo: "Total", valor: (s) => reais(s.total_centavos), classe: "direita" }], r.top_produtos) : null,
        ),
      ),
    );
  }
  await carregar();
}
