/* Produtos e estoque: cadastro, entrada e ajuste, histórico, vitrine do app e venda rápida no balcão. */

import { get, post, put } from "../api.js";
import { acao, aviso, entrada, h, icone, janela, limpar, reais, seletor } from "../ui.js";
import { formulario, indicador, paraCentavos, tabela, topo } from "../comum.js";
import { escolherCliente } from "../base.js";

export async function render(area, ctx) {
  const corpo = h("div", { class: "pilha" });
  limpar(area, h("div", { class: "pagina" }, topo("Produtos e estoque", "O que tem vitrine aparece no app: o cliente reserva e paga na comanda.", h("button", { class: "btn btn-fantasma", onclick: () => venda() }, icone("dinheiro", 16), "Venda no balcão"), h("button", { class: "btn btn-primario", onclick: () => editar() }, icone("mais", 16), "Novo produto")), corpo));
  let produtos = [];

  function editar(p = null) {
    const f = formulario(
      [
        { nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 },
        { nome: "categoria", rotulo: "Categoria", placeholder: "Pomadas, óleos, shampoo…" },
        { nome: "codigo", rotulo: "Código / SKU" },
        { nome: "preco_centavos", rotulo: "Preço de venda (R$)", tipo: "reais", obrigatorio: true },
        { nome: "custo_centavos", rotulo: "Custo (R$)", tipo: "reais" },
        ...(p ? [] : [{ nome: "estoque", rotulo: "Estoque inicial", tipo: "numero", min: 0, padrao: 0 }]),
        { nome: "estoque_minimo", rotulo: "Avisar quando chegar a", tipo: "numero", min: 0, padrao: 2 },
        { nome: "descricao", rotulo: "Descrição (aparece no app)", tipo: "area", largura: 2 },
        { nome: "vitrine", rotulo: "Mostrar no app do cliente", tipo: "check", padrao: true },
        { nome: "ativo", rotulo: "Ativo", tipo: "check", padrao: true },
      ],
      p ?? {},
    );
    const ok = h("button", { class: "btn btn-primario" }, "Salvar");
    const j = janela({ titulo: p ? p.nome : "Novo produto", conteudo: f.el, acoes: [ok] });
    ok.onclick = () => acao(ok, async () => (p ? await put(`/produtos/${p.id}`, f.ler()) : await post("/produtos", f.ler()), aviso("Produto salvo."), j.fechar(), carregar()));
  }

  async function estoque(p) {
    const tipo = seletor([["entrada", "Entrada (chegou mercadoria)"], ["ajuste", "Ajuste (perda, uso interno, contagem)"]], "entrada");
    const qtd = entrada({ type: "number", value: 1 });
    const motivo = entrada({ placeholder: "Motivo (opcional)" });
    const mov = await get(`/produtos/${p.id}/movimentos`);
    const ok = h("button", { class: "btn btn-primario" }, "Lançar");
    const j = janela({
      titulo: `Estoque · ${p.nome}`,
      largura: 620,
      conteudo: h("div", { class: "pilha" }, h("p", {}, `Em estoque: `, h("strong", {}, String(p.estoque)), p.estoque !== p.disponivel ? ` (${p.estoque - p.disponivel} reservado no app)` : ""), h("div", { class: "grade-2" }, tipo, qtd), motivo, h("small", { class: "campo-ajuda" }, "No ajuste, use número negativo para tirar do estoque."), h("h3", {}, "Movimentos"), tabela([{ titulo: "Quando", valor: (m) => new Date(m.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) }, { titulo: "Tipo", valor: (m) => m.tipo }, { titulo: "Qtd", valor: (m) => (m.quantidade > 0 ? `+${m.quantidade}` : String(m.quantidade)) }, { titulo: "Saldo", valor: (m) => String(m.saldo) }, { titulo: "Por", valor: (m) => m.autor ?? "" }], mov)),
      acoes: [ok],
    });
    ok.onclick = () => acao(ok, async () => (await post(`/produtos/${p.id}/estoque`, { tipo: tipo.value, quantidade: Number(qtd.value), motivo: motivo.value.trim() || null }), aviso("Estoque atualizado."), j.fechar(), carregar()));
  }

  async function venda() {
    const [servicos, barbeiros] = await Promise.all([get("/servicos"), get("/barbeiros")]);
    const cli = escolherCliente();
    const itens = [];
    const lista = h("div", { class: "comanda-itens" });
    const totalEl = h("strong", { class: "comanda-total" });
    const desconto = entrada({ placeholder: "0,00", inputmode: "decimal" });
    const selB = seletor([["", "Sem barbeiro (sem comissão)"], ...barbeiros.filter((b) => b.ativo).map((b) => [b.id, b.nome])], "");
    const forma = seletor(Object.entries(ctx.eu.formas).filter(([k]) => k !== "clube"), "pix");
    const opcoes = [...produtos.filter((p) => p.ativo && p.disponivel > 0).map((p) => [`produto:${p.id}`, `${p.nome} · ${reais(p.preco_centavos)}`, p]), ...servicos.filter((s) => s.ativo).map((s) => [`servico:${s.id}`, `${s.nome} · ${reais(s.preco_centavos)}`, s])];
    const add = seletor([["", "Adicionar item…"], ...opcoes.map(([v, t]) => [v, t])], "", {
      onchange: (e) => {
        const o = opcoes.find(([v]) => v === e.target.value);
        if (o) {
          const [tipo, id] = o[0].split(":");
          const ja = itens.find((i) => i.id === id);
          if (ja) ja.quantidade++;
          else itens.push({ tipo, id, nome: o[2].nome, preco_centavos: o[2].preco_centavos, quantidade: 1 });
        }
        e.target.value = "";
        render();
      },
    });
    const render = () => {
      limpar(lista, itens.length ? itens.map((i, n) => h("div", { class: "comanda-linha" }, h("span", {}, `${i.quantidade}× ${i.nome}`), h("span", {}, reais(i.preco_centavos * i.quantidade)), h("button", { class: "btn-icone", "aria-label": "Tirar", onclick: () => (itens.splice(n, 1), render()) }, icone("x", 14)))) : h("p", { class: "suave pequeno" }, "Adicione produtos ou serviços."));
      totalEl.textContent = reais(Math.max(0, itens.reduce((s, i) => s + i.preco_centavos * i.quantidade, 0) - paraCentavos(desconto.value)));
    };
    desconto.addEventListener("input", render);
    const ok = h("button", { class: "btn btn-sucesso" }, "Registrar venda");
    const j = janela({ titulo: "Venda no balcão", largura: 600, conteudo: h("div", { class: "pilha" }, add, lista, h("div", { class: "grade-2" }, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Desconto (R$)"), desconto), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Total"), totalEl)), h("div", { class: "grade-2" }, forma, selB), h("details", {}, h("summary", {}, "Cliente (opcional; assinante ganha o desconto do clube)"), cli.el)), acoes: [ok] });
    ok.onclick = () =>
      acao(ok, async () => {
        if (!itens.length) throw new Error("Adicione pelo menos um item.");
        const c = cli.valor();
        const v = await post("/vendas", { cliente_id: c?.cliente_id ?? null, barbeiro_id: selB.value || null, itens: itens.map(({ tipo, id, quantidade }) => ({ tipo, id, quantidade })), desconto_centavos: paraCentavos(desconto.value), forma: forma.value });
        aviso(`Venda registrada: ${reais(v.total_centavos)}.`);
        j.fechar();
        carregar();
      });
    render();
  }

  async function carregar() {
    produtos = await get("/produtos");
    const ativos = produtos.filter((p) => p.ativo);
    const baixo = ativos.filter((p) => p.baixo);
    limpar(
      corpo,
      h("div", { class: "indicadores" }, indicador("sacola", "Produtos ativos", String(ativos.length)), indicador("alerta", "Estoque baixo", String(baixo.length)), indicador("dinheiro", "Estoque a preço de custo", reais(ativos.reduce((s, p) => s + p.custo_centavos * Math.max(0, p.estoque), 0)))),
      h(
        "section",
        { class: "cartao" },
        tabela(
          [
            { titulo: "Produto", valor: (p) => h("div", { class: "celula-pessoa" }, h("strong", {}, p.nome), p.vitrine ? h("span", { class: "chip chip-info" }, "no app") : null, p.ativo ? null : h("span", { class: "chip" }, "inativo")) },
            { titulo: "Preço", valor: (p) => reais(p.preco_centavos) },
            { titulo: "Margem", valor: (p) => (p.custo_centavos ? `${Math.round(((p.preco_centavos - p.custo_centavos) / p.preco_centavos) * 100)}%` : "—") },
            { titulo: "Estoque", valor: (p) => h("span", { class: p.baixo ? "perigo" : "" }, String(p.estoque), p.estoque !== p.disponivel ? ` (${p.estoque - p.disponivel} reserv.)` : "") },
            { titulo: "", valor: (p) => h("div", { class: "item-acoes" }, h("button", { class: "btn btn-pequeno btn-fantasma", onclick: (e) => (e.stopPropagation(), estoque(p)) }, "Estoque"), h("button", { class: "btn btn-pequeno btn-fantasma", onclick: (e) => (e.stopPropagation(), editar(p)) }, "Editar")) },
          ],
          produtos,
          { vazio: "Nenhum produto cadastrado. Cadastre pomadas, óleos e o que a barbearia vende." },
        ),
      ),
    );
  }
  await carregar();
}
