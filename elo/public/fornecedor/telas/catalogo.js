/* Catálogo: produtos (busca, cadastro, edição, estoque, visibilidade por tabela, importação CSV) e tabelas de preço. */

import { h, limpar, topo, tabela, formulario, janela, botao, confirmar, reais, numero, situacao, debounce, entrada, seletor, campo, aviso, vazio, paraCentavos, deCentavos, icone } from "../../comum/ui.js";
import { pode } from "../permissoes.js";

/* ---------- Produtos ---------- */

export async function telaProdutos({ eu, api }) {
  const podeEditar = pode(eu, "catalogo");
  let tabelas = await api.get("/tabelas");
  const estado = { busca: "", categoria: "", inativos: false };
  let lista = [];
  const corpo = h("div", { "aria-live": "polite" });
  const contagem = h("p", { class: "suave pequeno" });
  const catSel = seletor([["", "Todas as categorias"]], "", { "aria-label": "Categoria", class: "entrada curta" });

  async function carregar() {
    const q = new URLSearchParams({ busca: estado.busca, categoria: estado.categoria, ...(estado.inativos ? { inativos: "1" } : {}) });
    lista = await api.get(`/produtos?${q}`);
    if (!estado.busca && !estado.categoria) {
      const cats = [...new Set(lista.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
      limpar(catSel, h("option", { value: "" }, "Todas as categorias"), cats.map((c) => h("option", { value: c, selected: c === estado.categoria }, c)));
    }
    pintar();
  }

  function pintar() {
    contagem.textContent = `${numero(lista.length)} produto(s)`;
    limpar(
      corpo,
      tabela(
        [
          { titulo: "Produto", valor: (p) => h("div", {}, h("span", { class: "celula-forte" }, p.nome), h("span", { class: "celula-sub mono" }, [p.codigo, p.marca].filter(Boolean).join(" · "))) },
          { titulo: "Categoria", valor: (p) => p.categoria ?? "—" },
          { titulo: "Preço base", classe: "numero", valor: (p) => reais(p.preco_centavos) },
          { titulo: "Estoque", classe: "numero", valor: (p) => `${numero(p.estoque)} ${p.unidade ?? ""}` },
          { titulo: "Reservado", classe: "numero", valor: (p) => numero(p.reservado) },
          { titulo: "Disponível", classe: "numero", valor: (p) => h("strong", { class: p.disponivel <= 0 ? "perigo" : "" }, numero(p.disponivel)) },
          { titulo: "Visível para", valor: (p) => (p.visibilidade === "tabelas" ? h("span", { class: "chip chip-info" }, `${p.tabelas?.length ?? 0} tabela(s)`) : h("span", { class: "chip" }, "Todos")) },
          { titulo: "Situação", valor: (p) => (p.ativo ? situacao("ativo") : h("span", { class: "chip" }, "Inativo")) },
          podeEditar && {
            titulo: "Ações",
            classe: "acoes-celula",
            valor: (p) =>
              h(
                "div",
                { class: "acoes-linha" },
                botao("Editar", () => editar(p), "btn-pequeno", "editar", { "aria-label": `Editar ${p.nome}` }),
                botao("Estoque", () => ajustarEstoque(p), "btn-pequeno", "caixa", { "aria-label": `Ajustar estoque de ${p.nome}` }),
                p.ativo
                  ? botao("Desativar", () => desativar(p), "btn-pequeno btn-perigo-fantasma", null, { "aria-label": `Desativar ${p.nome}` })
                  : botao("Reativar", async () => (await api.put(`/produtos/${p.id}`, { ativo: true }), aviso("Produto reativado."), carregar()), "btn-pequeno", null, { "aria-label": `Reativar ${p.nome}` }),
              ),
          },
        ].filter(Boolean),
        lista,
        { vazio: estado.busca ? "Nenhum produto encontrado com essa busca." : "Nenhum produto cadastrado ainda.", rotulo: "Produtos" },
      ),
    );
  }

  async function desativar(p) {
    if (!(await confirmar(`Desativar "${p.nome}"? Ele some do catálogo dos instaladores. Dá para reativar depois.`, { botao: "Desativar", perigo: true }))) return;
    await api.del(`/produtos/${p.id}`);
    aviso("Produto desativado.");
    await carregar();
  }

  function formProduto(p = {}) {
    const f = formulario(
      [
        { nome: "codigo", rotulo: "Código (SKU)", obrigatorio: true, maxlength: 60, ajuda: "O instalador busca e compara por este código." },
        { nome: "nome", rotulo: "Nome", obrigatorio: true, maxlength: 200 },
        { nome: "marca", rotulo: "Marca", maxlength: 80 },
        { nome: "categoria", rotulo: "Categoria", maxlength: 80 },
        { nome: "preco_centavos", rotulo: "Preço base (R$)", tipo: "reais", obrigatorio: true, placeholder: "0,00", ajuda: "Vale para quem não tem tabela de preço." },
        { nome: "estoque", rotulo: "Estoque", tipo: "numero", min: 0, padrao: 0 },
        { nome: "unidade", rotulo: "Unidade", maxlength: 10, padrao: "un", placeholder: "un, m, rl, cx" },
        { nome: "prazo_dias", rotulo: "Prazo de entrega (dias)", tipo: "numero", min: 0, max: 120, padrao: 1 },
        { nome: "foto_url", rotulo: "Endereço da foto", largura: 2, placeholder: "https://...", ajuda: "Aparece na proposta que o cliente final recebe." },
        { nome: "visibilidade", rotulo: "Quem vê este produto", tipo: "select", largura: 2, opcoes: [["todos", "Todos os instaladores vinculados"], ["tabelas", "Só quem está nas tabelas escolhidas"]], padrao: "todos" },
      ],
      p,
    );
    const marcadas = new Set(p.tabelas ?? []);
    const ativas = tabelas.filter((t) => t.ativo);
    const caixas = ativas.map((t) => {
      const c = h("input", { type: "checkbox", value: t.id, checked: marcadas.has(t.id), id: `tb-${t.id}` });
      return { c, el: h("div", { class: "linha-check" }, c, h("label", { for: `tb-${t.id}` }, t.nome)) };
    });
    const blocoTabelas = h("fieldset", { class: "pilha", style: { border: "0", padding: "0", margin: "0" } }, h("legend", { class: "campo-rotulo" }, "Tabelas que veem o produto"), ativas.length ? h("div", { class: "checks" }, caixas.map((x) => x.el)) : h("p", { class: "suave pequeno" }, "Crie uma tabela de preço primeiro."));
    const vis = f.entrada("visibilidade");
    const ajustar = () => (blocoTabelas.hidden = vis.value !== "tabelas");
    vis.addEventListener("change", ajustar);
    ajustar();
    return {
      el: h("div", { class: "pilha" }, f.el, blocoTabelas),
      ler: () => {
        const d = f.ler();
        if (d.preco_centavos === null || d.preco_centavos === undefined) throw new Error("Preencha: Preço base (R$)");
        d.tabelas = d.visibilidade === "tabelas" ? caixas.filter((x) => x.c.checked).map((x) => x.c.value) : [];
        if (d.visibilidade === "tabelas" && !d.tabelas.length) throw new Error("Escolha pelo menos uma tabela ou deixe visível para todos.");
        if (!d.foto_url) d.foto_url = null;
        return d;
      },
    };
  }

  function novo() {
    const f = formProduto({});
    janela({
      titulo: "Novo produto",
      largura: 680,
      conteudo: f.el,
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, fechar) => fechar() },
        { texto: "Cadastrar", classe: "btn-primario", fn: async (_, fechar) => (await api.post("/produtos", f.ler()), fechar(), aviso("Produto cadastrado."), carregar()) },
      ],
    });
  }
  function editar(p) {
    const f = formProduto(p);
    janela({
      titulo: `Editar ${p.codigo}`,
      largura: 680,
      conteudo: h("div", { class: "pilha" }, p.reservado ? h("p", { class: "pequeno suave" }, `${p.reservado} unidade(s) reservada(s): o estoque não pode ficar abaixo disso.`) : null, f.el),
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, fechar) => fechar() },
        { texto: "Salvar", classe: "btn-primario", fn: async (_, fechar) => (await api.put(`/produtos/${p.id}`, f.ler()), fechar(), aviso("Produto salvo."), carregar()) },
      ],
    });
  }
  function ajustarEstoque(p) {
    const modo = seletor([["somar", "Entrada / saída (somar ou tirar)"], ["definir", "Contagem (definir o total)"]], "somar");
    const qtd = entrada({ type: "number", inputmode: "numeric", step: 1, placeholder: "Ex.: 10 ou -3" });
    const previa = h("p", { class: "pequeno", "aria-live": "polite" });
    const novoTotal = () => {
      const n = Number(qtd.value);
      if (qtd.value === "" || !Number.isInteger(n)) return null;
      return modo.value === "somar" ? p.estoque + n : n;
    };
    const atualizar = () => {
      const t = novoTotal();
      previa.textContent = t === null ? "" : t < p.reservado ? `Fica ${numero(t)}: abaixo do reservado (${numero(p.reservado)}).` : `Novo estoque: ${numero(t)} · disponível ${numero(t - p.reservado)}`;
      previa.className = `pequeno ${t !== null && t < p.reservado ? "perigo" : ""}`;
    };
    qtd.addEventListener("input", atualizar);
    modo.addEventListener("change", atualizar);
    janela({
      titulo: `Estoque · ${p.nome}`,
      largura: 460,
      conteudo: h(
        "div",
        { class: "pilha" },
        h("div", { class: "dados" }, h("div", { class: "dado" }, h("small", {}, "Estoque"), h("strong", {}, numero(p.estoque))), h("div", { class: "dado" }, h("small", {}, "Reservado"), h("strong", {}, numero(p.reservado))), h("div", { class: "dado" }, h("small", {}, "Disponível"), h("strong", {}, numero(p.disponivel)))),
        campo("Tipo de ajuste", modo),
        campo("Quantidade", qtd),
        previa,
      ),
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, fechar) => fechar() },
        {
          texto: "Salvar estoque",
          classe: "btn-primario",
          fn: async (_, fechar) => {
            const t = novoTotal();
            if (t === null) throw new Error("Digite uma quantidade inteira.");
            if (t < 0) throw new Error("O estoque não pode ficar negativo.");
            await api.put(`/produtos/${p.id}`, { estoque: t });
            fechar();
            aviso("Estoque atualizado.");
            await carregar();
          },
        },
      ],
    });
  }
  function importar() {
    const arquivo = h("input", { type: "file", accept: ".csv,text/csv,text/plain", class: "entrada" });
    const texto = h("textarea", { class: "entrada mono", rows: 8, placeholder: "codigo;nome;marca;categoria;preco;estoque;unidade;prazo_dias;foto_url\nCAM-01;Câmera bullet 1080p;Marca;CFTV;189,90;40;un;2;" });
    const resultado = h("div", { "aria-live": "polite" });
    arquivo.addEventListener("change", async () => {
      const a = arquivo.files?.[0];
      if (!a) return;
      if (a.size > 2 * 1024 * 1024) return aviso("O arquivo passa de 2 MB. Divida em partes menores.", "erro");
      texto.value = await a.text();
    });
    janela({
      titulo: "Importar produtos (CSV)",
      largura: 720,
      conteudo: h(
        "div",
        { class: "pilha" },
        h("p", { class: "pequeno" }, "Cabeçalho na primeira linha. Separador ", h("code", {}, ";"), " ou ", h("code", {}, ","), ". Preço como ", h("code", {}, "1.234,56"), " ou ", h("code", {}, "1234.56"), ". Produtos com o mesmo código são atualizados; os novos são criados."),
        h("p", { class: "pequeno mono" }, "codigo;nome;marca;categoria;preco;estoque;unidade;prazo_dias;foto_url"),
        campo("Arquivo", arquivo),
        campo("Ou cole o conteúdo", texto),
        resultado,
      ),
      acoes: [
        { texto: "Fechar", classe: "btn-fantasma", fn: (_, fechar) => fechar() },
        {
          texto: "Importar",
          classe: "btn-primario",
          fn: async () => {
            if (!texto.value.trim()) throw new Error("Escolha um arquivo ou cole o CSV.");
            const r = await api.post("/produtos/importar", { csv: texto.value });
            limpar(
              resultado,
              h("div", { class: r.erros?.length ? "cartao aviso-cartao" : "privacidade" }, icone(r.erros?.length ? "alerta" : "check"), h("div", {}, h("strong", {}, `${r.criados} criado(s), ${r.atualizados} atualizado(s)`), r.erros?.length ? h("ul", { class: "pequeno" }, r.erros.slice(0, 30).map((e) => h("li", {}, `Linha ${e.linha}: ${e.erro}`))) : null)),
            );
            aviso("Importação concluída.");
            await carregar();
          },
        },
      ],
    });
  }

  const busca = entrada({ type: "search", placeholder: "Buscar por nome ou código", "aria-label": "Buscar produtos" });
  busca.addEventListener("input", debounce(() => ((estado.busca = busca.value.trim()), carregar()), 300));
  catSel.addEventListener("change", () => ((estado.categoria = catSel.value), carregar()));
  const inativosId = "chk-inativos";
  const inativos = h("input", { type: "checkbox", id: inativosId, onchange: (e) => ((estado.inativos = e.target.checked), carregar()) });

  await carregar();
  return h(
    "div",
    { class: "pagina" },
    topo("Produtos", "O que os instaladores veem no catálogo, com o estoque disponível (estoque menos o reservado).", podeEditar ? botao("Importar CSV", importar, "", "upload") : null, podeEditar ? botao("Novo produto", novo, "btn-primario", "mais") : null),
    h("section", { class: "cartao pilha" }, h("div", { class: "filtros" }, busca, catSel, h("div", { class: "linha-check" }, inativos, h("label", { for: inativosId }, "Mostrar inativos"))), contagem, corpo),
  );
}

/* ---------- Tabelas de preço ---------- */

export async function telaTabelas({ eu, api }) {
  const podeEditar = pode(eu, "catalogo");
  const corpo = h("div");
  let tabelas = [];
  async function carregar() {
    tabelas = await api.get("/tabelas");
    limpar(
      corpo,
      tabelas.length
        ? tabela(
            [
              { titulo: "Tabela", valor: (t) => h("span", { class: "celula-forte" }, t.nome) },
              { titulo: "Tipo", valor: (t) => (t.tipo === "desconto" ? `Desconto de ${String(t.desconto_pct).replace(".", ",")}% sobre o preço base` : `Lista com ${Object.keys(t.precos ?? {}).length} preço(s) próprio(s)`) },
              { titulo: "Instaladores", classe: "numero", valor: (t) => numero(t.vinculos) },
              { titulo: "Situação", valor: (t) => (t.ativo ? situacao("ativo", "Ativa") : h("span", { class: "chip" }, "Desativada")) },
              podeEditar && {
                titulo: "Ações",
                classe: "acoes-celula",
                valor: (t) =>
                  h(
                    "div",
                    { class: "acoes-linha" },
                    botao("Editar", () => abrir(t), "btn-pequeno", "editar", { "aria-label": `Editar ${t.nome}` }),
                    t.ativo
                      ? botao("Desativar", async () => {
                          if (!(await confirmar(`Desativar "${t.nome}"? Os ${t.vinculos} instalador(es) dela passam a pagar o preço base.`, { botao: "Desativar", perigo: true }))) return;
                          await api.del(`/tabelas/${t.id}`);
                          aviso("Tabela desativada.");
                          carregar();
                        }, "btn-pequeno btn-perigo-fantasma")
                      : botao("Reativar", async () => (await api.put(`/tabelas/${t.id}`, { ativo: true }), aviso("Tabela reativada."), carregar()), "btn-pequeno"),
                  ),
              },
            ].filter(Boolean),
            tabelas,
            { rotulo: "Tabelas de preço" },
          )
        : vazio("etiqueta", "Nenhuma tabela de preço", "Sem tabela, o instalador paga o preço base. Crie tabelas com desconto ou com preços próprios e escolha uma para cada instalador."),
    );
  }

  async function abrir(t = null) {
    const produtos = await api.get("/produtos");
    const f = formulario(
      [
        { nome: "nome", rotulo: "Nome da tabela", obrigatorio: true, maxlength: 80, placeholder: "Ex.: Instalador Ouro" },
        { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: [["desconto", "Desconto sobre o preço base"], ["lista", "Lista com preço por produto"]], padrao: "desconto" },
        { nome: "desconto_pct", rotulo: "Desconto (%)", tipo: "numero", min: 0, max: 100, passo: "0.01", ajuda: "Ex.: 12 = 12% abaixo do preço base." },
      ],
      t ?? { tipo: "desconto", desconto_pct: 0 },
    );
    const precos = { ...(t?.precos ?? {}) };
    const entradasPreco = new Map();
    const filtro = entrada({ type: "search", placeholder: "Filtrar produtos", "aria-label": "Filtrar produtos da lista" });
    const linhas = produtos.map((p) => {
      const e = entrada({ inputmode: "decimal", placeholder: deCentavos(p.preco_centavos), value: precos[p.id] !== undefined ? deCentavos(precos[p.id]) : "", "aria-label": `Preço de ${p.nome} nesta tabela` });
      entradasPreco.set(p.id, e);
      return { p, tr: h("tr", {}, h("td", { "data-rotulo": "Produto" }, h("span", { class: "celula-forte" }, p.nome), h("span", { class: "celula-sub mono" }, p.codigo)), h("td", { class: "numero", "data-rotulo": "Preço base" }, reais(p.preco_centavos)), h("td", { "data-rotulo": "Preço na tabela" }, e)) };
    });
    filtro.addEventListener("input", () => {
      const q = filtro.value.trim().toLowerCase();
      for (const { p, tr } of linhas) tr.hidden = q && !`${p.nome} ${p.codigo}`.toLowerCase().includes(q);
    });
    const blocoLista = h(
      "div",
      { class: "pilha" },
      h("p", { class: "pequeno suave" }, "Deixe em branco para usar o preço base."),
      filtro,
      h("div", { class: "tabela-precos" }, h("table", { class: "tabela responsiva", "aria-label": "Preços da tabela" }, h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Produto"), h("th", { scope: "col", class: "numero" }, "Preço base"), h("th", { scope: "col" }, "Preço na tabela"))), h("tbody", {}, linhas.map((l) => l.tr)))),
    );
    const tipo = f.entrada("tipo");
    const descCampo = f.entrada("desconto_pct").closest(".campo");
    const ajustar = () => {
      blocoLista.hidden = tipo.value !== "lista";
      descCampo.hidden = tipo.value !== "desconto";
    };
    tipo.addEventListener("change", ajustar);
    ajustar();
    janela({
      titulo: t ? `Editar ${t.nome}` : "Nova tabela de preço",
      largura: 760,
      conteudo: h("div", { class: "pilha" }, f.el, blocoLista),
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, fechar) => fechar() },
        {
          texto: t ? "Salvar" : "Criar tabela",
          classe: "btn-primario",
          fn: async (_, fechar) => {
            const d = f.ler();
            const corpoTb = { nome: d.nome, tipo: d.tipo };
            if (d.tipo === "desconto") corpoTb.desconto_pct = d.desconto_pct ?? 0;
            else {
              const lista = {};
              for (const [pid, e] of entradasPreco) {
                if (!e.value.trim()) continue;
                const c = paraCentavos(e.value);
                if (c === null) {
                  e.focus();
                  throw new Error("Preço inválido na lista. Use o formato 45,90.");
                }
                lista[pid] = c;
              }
              corpoTb.precos = lista;
            }
            if (t) await api.put(`/tabelas/${t.id}`, corpoTb);
            else await api.post("/tabelas", corpoTb);
            fechar();
            aviso(t ? "Tabela salva." : "Tabela criada.");
            carregar();
          },
        },
      ],
    });
  }

  await carregar();
  return h(
    "div",
    { class: "pagina" },
    topo("Tabelas de preço", "Cada instalador vinculado compra pela tabela escolhida para ele (ou pelo preço base).", podeEditar ? botao("Nova tabela", () => abrir(), "btn-primario", "mais") : null),
    h("section", { class: "cartao" }, corpo),
  );
}
