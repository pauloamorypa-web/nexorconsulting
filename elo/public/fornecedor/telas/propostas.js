/* Propostas e reservas que envolvem os itens do fornecedor.
   PRIVACIDADE (LGPD): a API devolve só instalador, itens deste fornecedor, cidade/UF da obra e status.
   Esta tela não tem (e não deve ter) campo nenhum do cliente final. */

import { h, limpar, topo, abas, tabela, botao, reais, numero, situacao, dataHora, cidadeBonita, icone, aviso, confirmar, vazio } from "../../comum/ui.js";
import { pode } from "../permissoes.js";
import { quandoVence } from "./painel.js";

const STATUS_PROPOSTA = [
  ["", "Todas"],
  ["enviada", "Enviadas"],
  ["vista", "Vistas"],
  ["aceita", "Aceitas"],
  ["paga", "Pagas"],
  ["expirada", "Expiradas"],
  ["cancelada", "Canceladas"],
];
const STATUS_RESERVA = [
  ["ativa", "Ativas"],
  ["baixada", "Baixadas"],
  ["expirada", "Expiradas"],
  ["liberada", "Liberadas"],
  ["", "Todas"],
];

const nomeInst = (i) => i?.nome_fantasia || i?.razao_social || "—";
const obra = (o) => (o?.cidade ? `${cidadeBonita(o.cidade)}/${o.uf ?? ""}` : "—");

const avisoPrivacidade = () => h("p", { class: "privacidade" }, icone("escudo", 16), h("span", {}, "Privacidade do cliente (LGPD): você vê o instalador, os seus itens, a cidade da obra e o andamento. Nome, documento, telefone e endereço do cliente final ficam só com o instalador."));

export async function telaPropostas(ctx) {
  if (ctx.params[0]) return detalhe(ctx);
  const { api, query } = ctx;
  let aba = query.get("aba") === "reservas" ? "reservas" : "propostas";
  let stProposta = query.get("status") ?? "";
  let stReserva = "ativa";
  const barra = h("div");
  const filtros = h("div", { class: "filtros", role: "group", "aria-label": "Filtrar por situação" });
  const corpo = h("div", { "aria-live": "polite" });

  async function pintar() {
    limpar(barra, abas([["propostas", "Propostas"], ["reservas", "Reservas de estoque"]], aba, (id) => ((aba = id), pintar())));
    const opcoes = aba === "propostas" ? STATUS_PROPOSTA : STATUS_RESERVA;
    const atual = aba === "propostas" ? stProposta : stReserva;
    limpar(
      filtros,
      opcoes.map(([v, t]) =>
        h("button", { type: "button", class: `btn-chip ${v === atual ? "ativo" : ""}`, "aria-pressed": String(v === atual), onclick: () => (aba === "propostas" ? (stProposta = v) : (stReserva = v), pintar()) }, t),
      ),
    );
    limpar(corpo, h("div", { class: "carregando-bloco" }, h("div", { class: "girando" })));
    if (aba === "propostas") {
      const lista = await api.get(`/propostas${stProposta ? `?status=${stProposta}` : ""}`);
      limpar(
        corpo,
        tabela(
          [
            { titulo: "Proposta", valor: (p) => h("a", { href: `#/propostas/${p.id}`, class: "celula-forte" }, `#${p.numero}`) },
            { titulo: "Instalador", valor: (p) => nomeInst(p.instalador) },
            { titulo: "Obra", valor: (p) => obra(p.obra) },
            { titulo: "Seus itens", classe: "numero", valor: (p) => h("div", {}, h("span", { class: "celula-forte" }, reais(p.total_itens_centavos)), h("span", { class: "celula-sub" }, `${numero(p.itens?.length)} item(ns)`)) },
            { titulo: "Situação", valor: (p) => situacao(p.status) },
            { titulo: "Enviada", valor: (p) => dataHora(p.enviada_em) },
            { titulo: "Reserva", valor: (p) => (p.reserva?.status === "ativa" ? h("span", {}, quandoVence(p.reserva.expira_em)) : p.reserva?.status ? situacao(p.reserva.status) : "—") },
            { titulo: "", classe: "acoes-celula", valor: (p) => h("a", { class: "btn btn-pequeno", href: `#/propostas/${p.id}`, "aria-label": `Ver a proposta ${p.numero}` }, "Ver") },
          ],
          lista,
          { vazio: "Nenhuma proposta nesta situação.", rotulo: "Propostas" },
        ),
      );
    } else {
      const lista = await api.get(`/reservas${stReserva ? `?status=${stReserva}` : ""}`);
      limpar(
        corpo,
        tabela(
          [
            { titulo: "Produto", valor: (r) => h("div", {}, h("span", { class: "celula-forte" }, r.produto?.nome ?? "—"), h("span", { class: "celula-sub mono" }, r.produto?.codigo ?? "")) },
            { titulo: "Qtd.", classe: "numero", valor: (r) => numero(r.quantidade) },
            { titulo: "Proposta", valor: (r) => (r.proposta ? h("a", { href: `#/propostas/${r.proposta.id}` }, `#${r.proposta.numero}`, " ", situacao(r.proposta.status)) : "—") },
            { titulo: "Instalador", valor: (r) => nomeInst(r.instalador) },
            { titulo: "Obra", valor: (r) => obra(r.proposta?.obra) },
            { titulo: "Situação", valor: (r) => situacao(r.status) },
            { titulo: "Vence", valor: (r) => (r.status === "ativa" ? h("span", { title: dataHora(r.expira_em) }, quandoVence(r.expira_em)) : dataHora(r.expira_em)) },
          ],
          lista,
          { vazio: "Nenhuma reserva nesta situação.", rotulo: "Reservas de estoque" },
        ),
      );
    }
  }

  await pintar();
  return h(
    "div",
    { class: "pagina" },
    topo("Propostas e reservas", "Propostas dos instaladores com os seus itens e o estoque separado para elas."),
    avisoPrivacidade(),
    h("section", { class: "cartao pilha" }, barra, filtros, corpo),
  );
}

async function detalhe({ api, eu, params }) {
  const p = await api.get(`/propostas/${encodeURIComponent(params[0])}`);
  const marcos = [
    ["Enviada", p.enviada_em],
    ["Vista pelo cliente", p.vista_em],
    ["Aceita", p.aceita_em],
    ["Paga", p.paga_em],
    p.expirada_em ? ["Reserva expirou", p.expirada_em] : null,
  ].filter(Boolean);
  const notaArea = h("div");
  if (p.status === "paga" && pode(eu, "financeiro")) {
    const b = botao("Emitir NF-e para o instalador", async () => {
      if (!(await confirmar(`Emitir a NF-e dos seus itens da proposta #${p.numero} para ${nomeInst(p.instalador)}? Se já existir, o sistema devolve a mesma nota.`, { botao: "Emitir NF-e" }))) return;
      const n = await api.post(`/propostas/${p.id}/nfe`);
      aviso(n.simulada ? "NF-e simulada gerada (sem token da Focus NFe)." : "NF-e enviada ao provedor.");
      limpar(notaArea, h("p", { class: "pequeno" }, "Nota: ", situacao(n.status), n.numero ? ` nº ${n.numero}` : "", " · ", h("a", { href: "#/notas" }, "ver em Notas fiscais")));
    }, "btn-primario", "recibo");
    notaArea.append(b);
  }
  return h(
    "div",
    { class: "pagina" },
    h("a", { href: "#/propostas", class: "btn-link", style: { margin: "0", justifySelf: "start" } }, "← Voltar para as propostas"),
    topo(`Proposta #${p.numero}`, `${nomeInst(p.instalador)} · obra em ${obra(p.obra)}`, situacao(p.status)),
    avisoPrivacidade(),
    h(
      "div",
      { class: "grade-painel" },
      h(
        "section",
        { class: "cartao largo pilha", "aria-labelledby": "t-itens" },
        h("h2", { id: "t-itens" }, "Seus itens nesta proposta"),
        tabela(
          [
            { titulo: "Item", valor: (i) => h("div", {}, h("span", { class: "celula-forte" }, i.descricao), h("span", { class: "celula-sub mono" }, i.codigo ?? "")) },
            { titulo: "Qtd.", classe: "numero", valor: (i) => `${numero(i.quantidade)} ${i.unidade ?? ""}` },
            { titulo: "Preço unit.", classe: "numero", valor: (i) => reais(i.preco_unit_centavos) },
            { titulo: "Total", classe: "numero", valor: (i) => h("strong", {}, reais(i.total_centavos)) },
          ],
          p.itens ?? [],
          { rotulo: "Itens do fornecedor" },
        ),
        h("div", { class: "linha-entre" }, h("span", { class: "suave pequeno" }, "Preço que você cobra do instalador (tabela dele). O preço de venda ao cliente não é mostrado."), h("strong", {}, `Total: ${reais(p.total_itens_centavos)}`)),
        notaArea,
      ),
      h(
        "section",
        { class: "cartao pilha", "aria-labelledby": "t-and" },
        h("h2", { id: "t-and" }, "Andamento"),
        h("ol", { class: "linha-tempo" }, marcos.map(([t, ms]) => h("li", { class: ms ? "feito" : "" }, h("span", { style: { flex: "1" } }, t), h("small", { class: "suave" }, ms ? dataHora(ms) : "—")))),
        h("h3", {}, "Reserva de estoque"),
        p.reserva
          ? h("div", { class: "dados" }, dado("Situação", situacao(p.reserva.status)), dado("Vence", p.reserva.status === "ativa" ? quandoVence(p.reserva.expira_em) : dataHora(p.reserva.expira_em)), dado("Renovações", numero(p.reserva.renovacoes)))
          : h("p", { class: "suave pequeno" }, "Sem reserva."),
        h("h3", {}, "Pagamento"),
        p.pagamento ? h("div", { class: "dados" }, dado("Situação", situacao(p.pagamento.status === "pendente" ? "aberto" : p.pagamento.status, p.pagamento.status === "pendente" ? "Aguardando" : undefined)), dado("Forma", { PIX: "Pix", BOLETO: "Boleto", CREDIT_CARD: "Cartão" }[p.pagamento.forma] ?? p.pagamento.forma ?? "—"), dado("Pago em", dataHora(p.pagamento.pago_em))) : h("p", { class: "suave pequeno" }, "O cliente ainda não gerou a cobrança."),
      ),
      h(
        "section",
        { class: "cartao pilha", "aria-labelledby": "t-inst" },
        h("h2", { id: "t-inst" }, "Instalador"),
        h("div", { class: "dados" }, dado("Empresa", p.instalador?.razao_social ?? "—"), dado("Nome fantasia", p.instalador?.nome_fantasia ?? "—"), dado("Cidade", obra(p.instalador)), dado("Obra", obra(p.obra))),
        h("a", { class: "btn btn-pequeno", href: "#/instaladores", style: { justifySelf: "start" } }, "Ver vínculo e score"),
      ),
    ),
  );
}

const dado = (rotulo, valor) => h("div", { class: "dado" }, h("small", {}, rotulo), h("strong", {}, valor));
export { vazio };
