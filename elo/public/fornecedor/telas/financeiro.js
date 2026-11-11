/* Financeiro (repasses do split e títulos a prazo) e notas fiscais (NF-e do fornecedor para o instalador). */

import { h, limpar, topo, abas, tabela, botao, janela, formulario, reais, numero, situacao, dataHora, dataBR, cidadeBonita, indicador, aviso, confirmar, hojeISO, somarDias, seletor, vazio } from "../../comum/ui.js";

const nomeInst = (i) => i?.nome_fantasia || i?.razao_social || "—";
const VIA = { split: "Split (direto na sua conta)", titulo: "Título a prazo", retido: "Retido" };

export async function telaFinanceiro({ api, eu, query }) {
  let aba = query.get("aba") === "titulos" ? "titulos" : "repasses";
  let filtroTitulo = query.get("aba") === "titulos" ? "vencidos" : "aberto";
  const resumoEl = h("section", { class: "indicadores", "aria-label": "Resumo financeiro" });
  const barra = h("div");
  const filtros = h("div", { class: "filtros", role: "group", "aria-label": "Filtrar títulos" });
  const acoesTitulo = h("div");
  const corpo = h("div", { "aria-live": "polite" });
  let vinculos = null;

  async function resumo() {
    const [rep, vencidos] = await Promise.all([api.get("/repasses"), api.get("/titulos?vencidos=1")]);
    limpar(
      resumoEl,
      indicador("dinheiro", "Recebido via split", reais(rep.resumo.recebido_split_centavos), "caiu direto na sua conta Asaas", "var(--verde)"),
      indicador("relogio", "Split previsto", reais(rep.resumo.previsto_split_centavos), "propostas aceitas aguardando pagamento", "var(--azul)"),
      indicador("recibo", "A receber em títulos", reais(rep.resumo.a_receber_titulos_centavos), "compras a prazo e vendas sem split", "var(--amarelo)"),
      indicador("alerta", "Títulos vencidos", numero(vencidos.length), reais(vencidos.reduce((s, t) => s + t.valor_centavos, 0)), vencidos.length ? "var(--vermelho)" : "var(--texto-2)", { classe: vencidos.length ? "alerta" : "" }),
    );
    return rep;
  }

  async function pintar(rep) {
    limpar(barra, abas([["repasses", "Repasses"], ["titulos", "Títulos"]], aba, (id) => ((aba = id), pintar())));
    limpar(filtros);
    limpar(acoesTitulo);
    limpar(corpo, h("div", { class: "carregando-bloco" }, h("div", { class: "girando" })));
    if (aba === "repasses") {
      const r = rep ?? (await api.get("/repasses"));
      limpar(
        corpo,
        tabela(
          [
            { titulo: "Proposta", valor: (x) => (x.proposta ? h("a", { href: `#/propostas/${x.proposta.id}` }, `#${x.proposta.numero}`) : "—") },
            { titulo: "Instalador", valor: (x) => nomeInst(x.instalador) },
            { titulo: "Obra", valor: (x) => (x.proposta?.obra ? `${cidadeBonita(x.proposta.obra.cidade)}/${x.proposta.obra.uf}` : "—") },
            { titulo: "Via", valor: (x) => VIA[x.via] ?? x.via },
            { titulo: "Situação", valor: (x) => situacao(x.status) },
            { titulo: "Valor", classe: "numero", valor: (x) => h("strong", {}, reais(x.valor_centavos)) },
            { titulo: "Atualizado", valor: (x) => dataHora(x.atualizado_em ?? x.criado_em) },
          ],
          r.repasses,
          { vazio: "Nenhum repasse ainda. Eles aparecem quando o cliente final paga uma proposta com os seus itens.", rotulo: "Repasses" },
        ),
      );
      return;
    }
    const opcoes = [
      ["aberto", "Em aberto"],
      ["vencidos", "Vencidos"],
      ["pago", "Pagos"],
      ["cancelado", "Cancelados"],
      ["", "Todos"],
    ];
    limpar(filtros, opcoes.map(([v, t]) => h("button", { type: "button", class: `btn-chip ${v === filtroTitulo ? "ativo" : ""}`, "aria-pressed": String(v === filtroTitulo), onclick: () => ((filtroTitulo = v), pintar()) }, t)));
    limpar(acoesTitulo, botao("Lançar título", lancar, "btn-primario", "mais"));
    const q = filtroTitulo === "vencidos" ? "?vencidos=1" : filtroTitulo ? `?status=${filtroTitulo}` : "";
    const lista = await api.get(`/titulos${q}`);
    limpar(
      corpo,
      tabela(
        [
          { titulo: "Instalador", valor: (t) => nomeInst(t.instalador) },
          { titulo: "Descrição", valor: (t) => h("div", {}, h("span", {}, t.descricao), h("span", { class: "celula-sub" }, t.origem === "sem_wallet" ? `Venda sem split${t.proposta ? ` · proposta #${t.proposta.numero}` : ""}` : "Lançado manualmente")) },
          { titulo: "Vencimento", valor: (t) => h("span", { class: t.vencido ? "perigo" : "" }, dataBR(t.vencimento)) },
          { titulo: "Situação", valor: (t) => (t.vencido ? situacao("vencido") : situacao(t.status)) },
          { titulo: "Valor", classe: "numero", valor: (t) => h("strong", {}, reais(t.valor_centavos)) },
          { titulo: "Pago em", valor: (t) => (t.pago_em ? h("span", {}, dataHora(t.pago_em), t.pago_no_prazo === false ? h("span", { class: "celula-sub perigo" }, "com atraso") : null) : "—") },
          {
            titulo: "Ações",
            classe: "acoes-celula",
            valor: (t) =>
              t.status === "aberto"
                ? h(
                    "div",
                    { class: "acoes-linha" },
                    botao("Dar baixa", async () => {
                      if (!(await confirmar(`Confirmar o recebimento de ${reais(t.valor_centavos)} de ${nomeInst(t.instalador)}?${t.vencido ? " O título está vencido: o pagamento conta como atrasado no score." : ""}`, { botao: "Dar baixa" }))) return;
                      await api.post(`/titulos/${t.id}/baixar`);
                      aviso("Baixa registrada. Se era o último vencido, o instalador é desbloqueado automaticamente.");
                      atualizar();
                    }, "btn-pequeno btn-sucesso", "check", { "aria-label": `Dar baixa no título de ${nomeInst(t.instalador)}` }),
                    botao("Cancelar", async () => {
                      if (!(await confirmar("Cancelar este título? Ele deixa de contar como dívida do instalador.", { botao: "Cancelar título", perigo: true }))) return;
                      await api.post(`/titulos/${t.id}/cancelar`);
                      aviso("Título cancelado.");
                      atualizar();
                    }, "btn-pequeno btn-perigo-fantasma", null, { "aria-label": `Cancelar o título de ${nomeInst(t.instalador)}` }),
                  )
                : "",
          },
        ],
        lista,
        { vazio: filtroTitulo === "vencidos" ? "Nenhum título vencido." : "Nenhum título nesta situação.", rotulo: "Títulos" },
      ),
    );
  }

  async function lancar() {
    vinculos ??= (await api.get("/vinculos?status=aprovado")).filter((v) => v.status === "aprovado");
    if (!vinculos.length) throw new Error("Nenhum instalador aprovado ainda.");
    const prazo = eu.conta.config?.prazo_titulo_dias ?? 7;
    const inst = seletor(vinculos.map((v) => [v.instalador.id, nomeInst(v.instalador)]), vinculos[0].instalador.id, { id: "titulo-inst" });
    const f = formulario(
      [
        { nome: "descricao", rotulo: "Descrição", obrigatorio: true, largura: 2, maxlength: 200, placeholder: "Ex.: Compra a prazo NF 1234" },
        { nome: "valor_centavos", rotulo: "Valor (R$)", tipo: "reais", obrigatorio: true },
        { nome: "vencimento", rotulo: "Vencimento", tipo: "data", obrigatorio: true, padrao: somarDias(hojeISO(), prazo) },
      ],
      {},
    );
    janela({
      titulo: "Lançar título a receber",
      largura: 560,
      conteudo: h("div", { class: "pilha" }, h("div", { class: "campo" }, h("label", { class: "campo-rotulo", for: "titulo-inst" }, "Instalador"), inst), f.el, h("p", { class: "pequeno suave" }, "Para compras a prazo fora do split. Título vencido bloqueia novas reservas do instalador automaticamente.")),
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, fechar) => fechar() },
        {
          texto: "Lançar título",
          classe: "btn-primario",
          fn: async (_, fechar) => {
            const d = f.ler();
            if (!d.valor_centavos) throw new Error("O valor precisa ser maior que zero.");
            await api.post("/titulos", { instalador_id: inst.value, ...d });
            fechar();
            aviso("Título lançado. O instalador foi avisado.");
            filtroTitulo = "aberto";
            atualizar();
          },
        },
      ],
    });
  }

  async function atualizar() {
    await resumo();
    await pintar();
  }

  const rep = await resumo();
  await pintar(rep);
  return h(
    "div",
    { class: "pagina" },
    topo("Financeiro", "O que já caiu pelo split, o que está previsto e os títulos a receber dos instaladores."),
    resumoEl,
    h("section", { class: "cartao pilha" }, barra, h("div", { class: "linha-entre" }, filtros, acoesTitulo), corpo),
  );
}

export async function telaNotas({ api }) {
  const [notas, pagas] = await Promise.all([api.get("/notas"), api.get("/propostas?status=paga")]);
  const comNota = new Set(notas.map((n) => n.proposta_id));
  const semNota = pagas.filter((p) => !comNota.has(p.id));
  const listaEl = h("div");
  const pendentesEl = h("div");

  const pintarNotas = (lista) =>
    limpar(
      listaEl,
      tabela(
        [
          { titulo: "Proposta", valor: (n) => h("a", { href: `#/propostas/${n.proposta_id}` }, `#${pagas.find((p) => p.id === n.proposta_id)?.numero ?? "—"}`) },
          { titulo: "Tipo", valor: () => "NF-e (venda ao instalador)" },
          { titulo: "Número", valor: (n) => n.numero ?? "—" },
          { titulo: "Situação", valor: (n) => h("div", {}, situacao(n.status), n.simulada ? h("span", { class: "chip chip-info" }, "simulada") : null) },
          { titulo: "Emitida", valor: (n) => dataHora(n.criado_em) },
          { titulo: "Arquivo", valor: (n) => (n.url && /^https?:\/\//.test(n.url) ? h("a", { href: n.url, target: "_blank", rel: "noopener noreferrer" }, "Abrir") : "—") },
        ],
        lista,
        { vazio: "Nenhuma nota emitida ainda.", rotulo: "Notas fiscais" },
      ),
    );

  const pintarPendentes = () =>
    limpar(
      pendentesEl,
      semNota.length
        ? tabela(
            [
              { titulo: "Proposta", valor: (p) => h("a", { href: `#/propostas/${p.id}` }, `#${p.numero}`) },
              { titulo: "Instalador", valor: (p) => nomeInst(p.instalador) },
              { titulo: "Seus itens", classe: "numero", valor: (p) => reais(p.total_itens_centavos) },
              { titulo: "Paga em", valor: (p) => dataHora(p.paga_em) },
              {
                titulo: "",
                classe: "acoes-celula",
                valor: (p) =>
                  botao("Emitir NF-e", async () => {
                    const n = await api.post(`/propostas/${p.id}/nfe`);
                    aviso(n.simulada ? "NF-e simulada gerada (sem token da Focus NFe)." : "NF-e enviada ao provedor.");
                    notas.unshift(n);
                    semNota.splice(semNota.indexOf(p), 1);
                    pintarNotas(notas);
                    pintarPendentes();
                  }, "btn-pequeno btn-primario", "recibo", { "aria-label": `Emitir NF-e da proposta ${p.numero}` }),
              },
            ],
            semNota,
            { rotulo: "Propostas pagas sem nota" },
          )
        : vazio("check", "Tudo em dia", "Todas as propostas pagas já têm NF-e."),
    );

  pintarNotas(notas);
  pintarPendentes();
  return h(
    "div",
    { class: "pagina" },
    topo("Notas fiscais", "NF-e do fornecedor para o instalador (quem compra de você é ele). Os dados saem da proposta paga."),
    h("section", { class: "cartao pilha", "aria-labelledby": "t-pend" }, h("h2", { id: "t-pend" }, "Propostas pagas sem NF-e"), pendentesEl),
    h("section", { class: "cartao pilha", "aria-labelledby": "t-notas" }, h("h2", { id: "t-notas" }, "Notas emitidas"), listaEl),
  );
}
