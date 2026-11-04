/* Início: o dia do escritório num relance. */

import { get } from "../api.js";
import { h } from "../ui.js";
import { botao, dataBR, indicador, mesBR, tabela, topo } from "../comum.js";
import { prazo } from "../base.js";

export async function render(raiz, ctx) {
  const p = await get("/painel");
  const pct = p.pendencias.total ? Math.round((p.pendencias.recebidas / p.pendencias.total) * 100) : 0;
  const nome = ctx.eu.usuario.nome.split(" ")[0];
  raiz.append(
    h(
      "div",
      { class: "pagina" },
      topo(`Olá, ${nome}!`, `Hoje, ${dataBR(p.hoje)}${p.competencia ? ` · fechando ${mesBR(p.competencia)}` : ""}`),
      h(
        "div",
        { class: "indicadores" },
        indicador("nota", "Documentos a conferir", String(p.documentos.a_conferir), `${p.documentos.recebidos_mes} recebidos este mês${p.documentos.sem_cliente ? ` · ${p.documentos.sem_cliente} sem cliente` : ""}`, p.documentos.a_conferir ? "var(--amarelo)" : undefined),
        indicador("sino", "Documentos do mês recebidos", `${pct}%`, `${p.pendencias.recebidas} de ${p.pendencias.total} · ${p.pendencias.atrasadas} atrasados`, pct >= 80 ? "var(--verde)" : undefined),
        indicador("agenda", "Obrigações", `${p.tarefas.hoje} para hoje`, `${p.tarefas.atrasadas} atrasadas · ${p.tarefas.semana} na semana`, p.tarefas.atrasadas ? "var(--vermelho)" : undefined),
        indicador("conversas", "Chamados abertos", String(p.chamados), `${p.clientes} clientes ativos na carteira`),
      ),
      h(
        "div",
        { class: "grade-form" },
        h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, "Próximas obrigações"), botao("Ver todas", () => ctx.navegar("obrigacoes"), "btn-fantasma btn-pequeno")), tabela([{ titulo: "Prazo interno", valor: (t) => prazo(t.prazo_interno) }, { titulo: "Obrigação", valor: (t) => t.nome }, { titulo: "Cliente", valor: (t) => t.cliente }, { titulo: "Vence", valor: (t) => dataBR(t.prazo_legal) }], p.proximas, { aoClicar: () => ctx.navegar("obrigacoes"), vazio: "Nenhuma obrigação em aberto." })),
        h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, "Clientes com mais documentos atrasados"), botao("Cobrança", () => ctx.navegar("cobranca"), "btn-fantasma btn-pequeno")), tabela([{ titulo: "Cliente", valor: (c) => c.cliente }, { titulo: "Faltando", valor: (c) => String(c.faltando), classe: "num" }, { titulo: "Desde", valor: (c) => dataBR(c.desde) }], p.piores, { aoClicar: (c) => ctx.navegar(`clientes/${c.id}`), vazio: "Ninguém com documento atrasado." })),
      ),
    ),
  );
}
