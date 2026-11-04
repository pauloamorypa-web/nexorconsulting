/* Clube de assinatura: planos (serviços incluídos, limite por ciclo, dias da semana, desconto em produtos),
   assinantes, pagamento no balcão e receita recorrente. */

import { get, post, put } from "../api.js";
import { acao, aviso, confirmar, h, icone, janela, limpar, reais, seletor } from "../ui.js";
import { formulario, indicador, tabela, topo } from "../comum.js";
import { DIAS_CURTOS, dataBR, escolherCliente, sit } from "../base.js";

export async function render(area, ctx) {
  const corpo = h("div", { class: "pilha" });
  const adm = ctx.pode("dono", "admin");
  limpar(area, h("div", { class: "pagina" }, topo("Clube de assinatura", "Receita todo mês e cliente fiel. O app mostra os planos e o cliente assina sozinho.", adm ? h("button", { class: "btn btn-fantasma", onclick: () => editarPlano() }, icone("mais", 16), "Novo plano") : null, h("button", { class: "btn btn-primario", onclick: () => novaAssinatura() }, icone("coroa", 16), "Assinar para um cliente")), corpo));
  let servicos = [];
  let planos = [];

  function editarPlano(p = null) {
    const itens = new Map((p?.itens ?? []).map((i) => [i.servico_id, i.quantidade]));
    const linhasItens = servicos.filter((s) => s.ativo).map((s) => {
      const marcado = h("input", { type: "checkbox", checked: itens.has(s.id) });
      const qtd = h("input", { class: "entrada entrada-pequena", type: "number", min: 0, max: 60, value: itens.get(s.id) ?? 0 });
      return { s, marcado, qtd, el: h("label", { class: "plano-item" }, marcado, h("span", {}, s.nome), qtd, h("small", { class: "suave" }, "por ciclo (0 = ilimitado)")) };
    });
    const dias = new Set(p?.dias_semana ?? []);
    const caixasDias = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, el: h("input", { type: "checkbox", checked: dias.has(d) }) }));
    const f = formulario(
      [
        { nome: "nome", rotulo: "Nome do plano", obrigatorio: true, placeholder: "Clube Navalha" },
        { nome: "preco_centavos", rotulo: "Mensalidade (R$)", tipo: "reais", obrigatorio: true },
        { nome: "descricao", rotulo: "Descrição para o cliente", tipo: "area", largura: 2 },
        { nome: "desconto_produtos", rotulo: "Desconto em produtos (%)", tipo: "numero", min: 0, max: 100, padrao: 0 },
        { nome: "ativo", rotulo: "Plano à venda", tipo: "check", padrao: true },
      ],
      p ?? {},
    );
    const ok = h("button", { class: "btn btn-primario" }, "Salvar plano");
    const j = janela({
      titulo: p ? `Plano ${p.nome}` : "Novo plano",
      largura: 640,
      conteudo: h("div", { class: "pilha" }, f.el, h("h3", { class: "form-secao" }, "Serviços incluídos"), h("div", { class: "pilha" }, linhasItens.map((l) => l.el)), h("h3", { class: "form-secao" }, "Dias em que vale (nenhum marcado = todos)"), h("div", { class: "dias-semana" }, caixasDias.map(({ d, el }) => h("label", { class: "linha-check" }, el, h("span", {}, DIAS_CURTOS[d]))))),
      acoes: [ok],
    });
    ok.onclick = () =>
      acao(ok, async () => {
        const d = { ...f.ler(), itens: linhasItens.filter((l) => l.marcado.checked).map((l) => ({ servico_id: l.s.id, quantidade: Number(l.qtd.value) || 0 })), dias_semana: caixasDias.filter((c) => c.el.checked).map((c) => c.d) };
        if (p) await put(`/planos/${p.id}`, d);
        else await post("/planos", d);
        aviso("Plano salvo.");
        j.fechar();
        carregar();
      });
  }

  function novaAssinatura() {
    const cli = escolherCliente();
    const selP = seletor(planos.filter((p) => p.ativo).map((p) => [p.id, `${p.nome} · ${reais(p.preco_centavos)}/mês`]), "");
    const forma = seletor([["", "Gerar cobrança (Asaas) / pagar depois"], ...Object.entries(ctx.eu.formas).filter(([k]) => k !== "clube")], "pix");
    const ok = h("button", { class: "btn btn-primario" }, "Assinar");
    const j = janela({ titulo: "Nova assinatura", conteudo: h("div", { class: "pilha" }, cli.el, selP, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Primeiro pagamento"), forma)), acoes: [ok] });
    ok.onclick = () =>
      acao(ok, async () => {
        const c = cli.valor();
        if (!c?.cliente_id) throw new Error("Escolha um cliente já cadastrado.");
        await post("/assinaturas", { cliente_id: c.cliente_id, plano_id: selP.value, pago_agora: forma.value || null });
        aviso("Assinatura criada.");
        j.fechar();
        carregar();
      });
  }

  async function pagar(a) {
    const forma = seletor(Object.entries(ctx.eu.formas).filter(([k]) => k !== "clube"), "pix");
    const ok = h("button", { class: "btn btn-sucesso" }, "Registrar pagamento");
    const j = janela({ titulo: `Mensalidade de ${a.cliente.nome}`, conteudo: h("div", { class: "pilha" }, h("p", {}, `${a.plano.nome} · ${reais(a.plano.preco_centavos)}. O ciclo novo começa ${a.status === "ativa" && a.ciclo_fim ? `depois de ${dataBR(a.ciclo_fim)}` : "hoje"}.`), forma), acoes: [ok] });
    ok.onclick = () => acao(ok, async () => (await post(`/assinaturas/${a.id}/pagamento`, { forma: forma.value }), aviso("Pagamento registrado."), j.fechar(), carregar()));
  }

  async function carregar() {
    [servicos, planos] = await Promise.all([get("/servicos"), get("/planos")]);
    const a = await get("/assinaturas");
    const nomeServ = (id) => servicos.find((s) => s.id === id)?.nome ?? "serviço";
    limpar(
      corpo,
      h("div", { class: "indicadores" }, indicador("coroa", "Assinantes ativos", String(a.resumo.ativas)), indicador("dinheiro", "Receita recorrente", `${reais(a.resumo.receita_mensal_centavos)}/mês`), indicador("alerta", "Em atraso", String(a.resumo.atrasadas)), indicador("relogio", "Aguardando 1º pagamento", String(a.resumo.pendentes))),
      h(
        "div",
        { class: "grade-planos" },
        planos.length
          ? planos.map((p) =>
              h(
                "article",
                { class: `cartao plano ${p.ativo ? "" : "inativo"}` },
                h("div", { class: "linha-entre" }, h("h3", {}, p.nome), p.ativo ? null : h("span", { class: "chip" }, "fora de venda")),
                h("strong", { class: "plano-preco" }, reais(p.preco_centavos), h("small", {}, "/mês")),
                h("ul", { class: "lista-simples" }, p.itens.map((i) => h("li", {}, icone("check", 14), ` ${nomeServ(i.servico_id)} ${i.quantidade ? `· ${i.quantidade}× por ciclo` : "ilimitado"}`)), p.dias_semana.length ? h("li", {}, icone("calendario", 14), ` Vale: ${p.dias_semana.map((d) => DIAS_CURTOS[d]).join(", ")}`) : null, p.desconto_produtos ? h("li", {}, icone("sacola", 14), ` ${p.desconto_produtos}% em produtos`) : null),
                h("div", { class: "linha-entre" }, h("small", { class: "suave" }, `${p.assinantes} assinante(s)`), adm ? h("button", { class: "btn btn-fantasma btn-pequeno", onclick: () => editarPlano(p) }, "Editar") : null),
              ),
            )
          : h("div", { class: "vazio" }, h("h3", {}, "Nenhum plano ainda"), h("p", {}, "Crie o primeiro plano: por exemplo, cortes ilimitados de terça a quinta."), adm ? h("button", { class: "btn btn-primario", onclick: () => editarPlano() }, "Criar plano") : null),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h3", {}, "Assinantes"),
        tabela(
          [
            { titulo: "Cliente", valor: (x) => x.cliente.nome },
            { titulo: "Plano", valor: (x) => x.plano.nome },
            { titulo: "Situação", valor: (x) => sit(x.status) },
            { titulo: "Ciclo", valor: (x) => (x.ciclo_inicio ? `${dataBR(x.ciclo_inicio)} a ${dataBR(x.ciclo_fim)}` : "—") },
            { titulo: "Usos no ciclo", valor: (x) => String(x.usos) },
            {
              titulo: "",
              valor: (x) =>
                h(
                  "div",
                  { class: "item-acoes" },
                  h("button", { class: "btn btn-pequeno btn-fantasma", onclick: (e) => (e.stopPropagation(), pagar(x)) }, "Pagamento"),
                  h("button", { class: "btn btn-pequeno btn-perigo-fantasma", onclick: async (e) => (e.stopPropagation(), (await confirmar(`Cancelar a assinatura de ${x.cliente.nome}?`, { botao: "Cancelar assinatura", perigo: true })) && (await acao(null, async () => (await post(`/assinaturas/${x.id}/cancelar`), aviso("Assinatura cancelada."), carregar())))) }, "Cancelar"),
                ),
            },
          ],
          a.lista,
          { vazio: "Ninguém assinou ainda." },
        ),
      ),
    );
  }
  await carregar();
}
