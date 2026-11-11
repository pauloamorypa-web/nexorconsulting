/* Painel: indicadores do dia (reservas, propostas por status, split, títulos vencidos, instaladores bloqueados). */

import { h, topo, indicador, reais, numero, situacao, quando, cidadeBonita, vazio } from "../../comum/ui.js";
import { pode } from "../permissoes.js";

export async function telaPainel({ eu, api }) {
  const [p, vinculos, reservas, propostas] = await Promise.all([api.get("/painel"), api.get("/vinculos"), api.get("/reservas?status=ativa"), api.get("/propostas")]);
  const bloqueados = vinculos.filter((v) => v.status === "aprovado" && v.credito?.bloqueado);
  const pp = p.propostas ?? {};
  const enviadasTotal = (pp.enviada ?? 0) + (pp.vista ?? 0) + (pp.aceita ?? 0) + (pp.paga ?? 0) + (pp.expirada ?? 0);

  const funil = [
    ["enviada", "Enviadas", enviadasTotal],
    ["vista", "Vistas pelo cliente", (pp.vista ?? 0) + (pp.aceita ?? 0) + (pp.paga ?? 0)],
    ["aceita", "Aceitas", (pp.aceita ?? 0) + (pp.paga ?? 0)],
    ["paga", "Pagas", pp.paga ?? 0],
  ];
  const max = Math.max(1, ...funil.map((f) => f[2]));

  const vencendo = [...reservas].sort((a, b) => a.expira_em - b.expira_em).slice(0, 6);
  const ultimas = propostas.slice(0, 6);
  const nome = eu.usuario.nome.split(" ")[0];

  return h(
    "div",
    { class: "pagina" },
    topo(`Olá, ${nome}`, `${p.conta?.nome ?? ""} · resumo da sua rede de instaladores`),
    h(
      "section",
      { class: "indicadores", "aria-label": "Indicadores" },
      indicador("caixa", "Reservas ativas", numero(p.reservas_ativas), `${numero(p.itens_reservados)} itens separados`, "var(--azul)", { href: "#/propostas?aba=reservas" }),
      indicador("nota", "Propostas em aberto", numero((pp.enviada ?? 0) + (pp.vista ?? 0) + (pp.aceita ?? 0)), `${numero(pp.enviada)} enviadas · ${numero(pp.vista)} vistas · ${numero(pp.aceita)} aceitas`, "var(--violeta)", { href: "#/propostas" }),
      indicador("check", "Propostas pagas", numero(pp.paga), pp.expirada ? `${numero(pp.expirada)} expiraram` : "nenhuma expirada", "var(--verde)", { href: "#/propostas?status=paga" }),
      p.financeiro ? indicador("dinheiro", "Recebido via split (30 dias)", reais(p.financeiro.recebido_split_30d_centavos), "caiu direto na sua conta", "var(--verde)", { href: "#/financeiro" }) : null,
      p.financeiro ? indicador("relogio", "A receber em títulos", reais(p.financeiro.a_receber_titulos_centavos), `${numero(p.financeiro.titulos_vencidos)} vencido(s)`, p.financeiro.titulos_vencidos ? "var(--vermelho)" : "var(--amarelo)", { href: "#/financeiro?aba=titulos", classe: p.financeiro.titulos_vencidos ? "alerta" : "" }) : null,
      indicador("cadeado", "Instaladores bloqueados", numero(bloqueados.length), `${numero(p.instaladores)} vinculados · ${numero(p.vinculos_pendentes)} pedido(s)`, bloqueados.length ? "var(--vermelho)" : "var(--texto-2)", { href: "#/instaladores", classe: bloqueados.length ? "alerta" : "" }),
      p.estoque_baixo ? indicador("alerta", "Estoque baixo", numero(p.estoque_baixo), "produtos para repor", "var(--amarelo)", { href: "#/produtos" }) : null,
    ),
    p.vinculos_pendentes && pode(eu, "vinculos")
      ? h("div", { class: "cartao aviso-cartao" }, h("div", {}, h("strong", {}, `${p.vinculos_pendentes} instalador(es) pediram vínculo`), h("p", { class: "suave pequeno" }, "Confira o CNAE e o score antes de aprovar e escolha a tabela de preço.")), h("a", { class: "btn btn-primario", href: "#/instaladores" }, "Ver pedidos"))
      : null,
    h(
      "div",
      { class: "grade-painel" },
      h(
        "section",
        { class: "cartao", "aria-labelledby": "t-funil" },
        h("h2", { id: "t-funil" }, "Funil das propostas"),
        h(
          "div",
          { class: "funil" },
          funil.map(([st, rotulo, n]) => h("a", { class: "funil-linha", href: `#/propostas?status=${st}` }, h("span", {}, rotulo), h("span", { class: "funil-barra", "aria-hidden": "true" }, h("span", { style: { width: `${Math.round((n / max) * 100)}%` } })), h("strong", { class: "numero" }, numero(n)), h("small", {}, enviadasTotal ? `${Math.round((n / Math.max(1, enviadasTotal)) * 100)}%` : ""))),
        ),
        h("p", { class: "suave pequeno", style: { marginTop: "10px" } }, "Contagem das propostas que têm itens seus."),
      ),
      h(
        "section",
        { class: "cartao", "aria-labelledby": "t-res" },
        h("h2", { id: "t-res" }, "Reservas que vencem primeiro"),
        vencendo.length
          ? h("div", { class: "lista-mini" }, vencendo.map((r) => h("a", { class: "mini-item", href: "#/propostas?aba=reservas" }, h("span", {}, `${r.quantidade}× ${r.produto?.nome ?? r.produto?.codigo}`, h("small", { class: "celula-sub" }, `#${r.proposta?.numero} · ${r.instalador?.nome_fantasia ?? r.instalador?.razao_social}`)), h("small", {}, quandoVence(r.expira_em)))))
          : vazio("caixa", "Nenhuma reserva ativa", "Quando um instalador enviar uma proposta com os seus itens, o estoque aparece aqui."),
      ),
      h(
        "section",
        { class: "cartao", "aria-labelledby": "t-ult" },
        h("h2", { id: "t-ult" }, "Últimas propostas"),
        ultimas.length
          ? h("div", { class: "lista-mini" }, ultimas.map((x) => h("a", { class: "mini-item", href: `#/propostas/${x.id}` }, h("span", {}, `#${x.numero} · ${x.instalador?.nome_fantasia ?? x.instalador?.razao_social}`, h("small", { class: "celula-sub" }, `${cidadeBonita(x.obra?.cidade)}/${x.obra?.uf ?? ""} · ${reais(x.total_itens_centavos)}`)), situacao(x.status))))
          : vazio("nota", "Nenhuma proposta ainda"),
      ),
    ),
  );
}

export function quandoVence(ms) {
  const d = ms - Date.now();
  if (d <= 0) return "vencida";
  const horas = Math.round(d / 3600_000);
  if (horas < 24) return `vence em ${horas} h`;
  return `vence em ${Math.round(horas / 24)} dia(s)`;
}
export { quando };
