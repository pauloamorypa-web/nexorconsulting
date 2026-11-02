/* Folha de pagamento: cálculo mensal e 13º, lançamentos variáveis, holerites, benefícios e rescisão. */

import { del, get, post, put } from "../api.js";
import { abas, acao, aviso, confirmar, dataHora, h, icone, janela, limpar, reais } from "../ui.js";
import { baixar, botao, competenciaAnterior, cpfBR, dataBR, formulario, hojeISO, indicador, mesBR, situacao, tabela, topo } from "../comum.js";

let raizAtual;
let ctxAtual;
let aba = "folhas";
const TIPOS = { mensal: "Mensal", "13_1": "13º · 1ª parcela", "13_2": "13º · 2ª parcela" };

export async function render(raiz, ctx, [sub, id]) {
  raizAtual = raiz;
  ctxAtual = ctx;
  if (sub === "rescisao") aba = "rescisao";
  await desenhar(sub === "rescisao" ? id : undefined);
}

async function desenhar(colabRescisao) {
  const corpo = h("div", { class: "aba-corpo" });
  limpar(raizAtual, h("div", { class: "pagina" }, topo("Folha de pagamento", "Cálculo com as tabelas vigentes de INSS, IRRF, FGTS e salário-família. Confira em Configurações → Tabelas."), abas([["folhas", "Folhas"], ["lancamentos", "Lançamentos do mês"], ["beneficios", "Benefícios"], ["rescisao", "Rescisão"]], aba, (x) => ((aba = x), desenhar())), corpo));
  limpar(corpo, await { folhas, lancamentos, beneficios, rescisao: () => rescisao(colabRescisao) }[aba]());
}

async function folhas() {
  const lista = await get("/folhas");
  const mes = h("input", { class: "entrada", type: "month", value: competenciaAnterior() });
  const tipo = h("select", { class: "entrada" }, Object.entries(TIPOS).map(([v, t]) => h("option", { value: v }, t)));
  return h(
    "div",
    { class: "pilha" },
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "Calcular folha"),
      h("p", { class: "suave" }, "Usa o espelho de ponto (extras, noturno, faltas, atrasos), benefícios, dependentes, afastamentos e os lançamentos do mês. Feche o ponto antes para travar os números."),
      h("div", { class: "filtros-linha" }, mes, tipo, botao("Calcular", (e) => acao(e.currentTarget, async () => { const f = await post("/folhas/calcular", { competencia: mes.value, tipo: tipo.value }); abrirFolha(f.id); }), "btn-primario", "raio")),
    ),
    h(
      "section",
      { class: "cartao" },
      tabela(
        [
          { titulo: "Competência", valor: (f) => h("strong", {}, mesBR(f.competencia)) },
          { titulo: "Tipo", valor: (f) => TIPOS[f.tipo] },
          { titulo: "Pessoas", valor: (f) => f.totais.colaboradores },
          { titulo: "Bruto", valor: (f) => reais(f.totais.bruto) },
          { titulo: "Líquido", valor: (f) => reais(f.totais.liquido) },
          { titulo: "FGTS", valor: (f) => reais(f.totais.fgts) },
          { titulo: "Situação", valor: (f) => situacao(f.status) },
        ],
        lista,
        { aoClicar: (f) => abrirFolha(f.id), vazio: "Nenhuma folha calculada ainda." },
      ),
    ),
  );
}

async function abrirFolha(id) {
  const f = await get(`/folhas/${id}`);
  const t = f.totais;
  limpar(
    raizAtual,
    h(
      "div",
      { class: "pagina" },
      h("button", { class: "btn-link", onclick: () => desenhar() }, icone("voltar", 14), " Folhas"),
      topo(
        `Folha ${TIPOS[f.tipo].toLowerCase()} · ${mesBR(f.competencia)}`,
        `Calculada em ${dataHora(f.calculada_em)}${f.fechada_em ? ` · fechada em ${dataHora(f.fechada_em)}` : ""}`,
        f.status === "calculada" ? botao("Recalcular", (e) => acao(e.currentTarget, async () => { const n = await post("/folhas/calcular", { competencia: f.competencia, tipo: f.tipo }); abrirFolha(n.id); }), "btn-fantasma", "raio") : null,
        f.status === "calculada"
          ? botao("Fechar folha", (e) => acao(e.currentTarget, async () => { const d = prompt("Data do pagamento (AAAA-MM-DD):", `${f.competencia === hojeISO().slice(0, 7) ? hojeISO() : hojeISO().slice(0, 8) + "05"}`); if (!d) return; const r = await post(`/folhas/${f.id}/fechar`, { data_pagamento: d }); aviso(`Folha fechada. Holerites liberados no app e ${r.eventos_esocial} eventos no eSocial.`, "ok", 8000); abrirFolha(f.id); }), "btn-primario", "check")
          : ctxAtual.pode("admin") ? botao("Reabrir", (e) => acao(e.currentTarget, async () => (await confirmar("Reabrir a folha descarta os eventos do eSocial ainda não enviados.", { botao: "Reabrir" })) && (await post(`/folhas/${f.id}/reabrir`), abrirFolha(f.id))), "btn-fantasma") : null,
        botao("Pagamentos (CSV)", (e) => acao(e.currentTarget, () => baixar(`/folhas/${f.id}/pagamentos.csv`)), "btn-fantasma", "download"),
      ),
      h("div", { class: "indicadores" }, indicador("pessoa", "Colaboradores", t.colaboradores), indicador("dinheiro", "Total bruto", reais(t.bruto)), indicador("dinheiro", "Total líquido", reais(t.liquido), t.data_pagamento ? `pago em ${dataBR(t.data_pagamento)}` : ""), indicador("governo", "INSS descontado", reais(t.inss), `patronal estimado ${reais(t.inss_patronal_estimado)}`), indicador("governo", "IRRF retido", reais(t.irrf)), indicador("caixa", "FGTS do mês", reais(t.fgts), "recolher no FGTS Digital")),
      h(
        "section",
        { class: "cartao" },
        tabela(
          [
            { titulo: "Colaborador", valor: (i) => h("div", {}, h("strong", {}, i.nome), h("br"), h("small", { class: "suave" }, i.cargo ?? "")) },
            { titulo: "Bruto", valor: (i) => reais(i.bruto) },
            { titulo: "INSS", valor: (i) => reais(i.inss) },
            { titulo: "IRRF", valor: (i) => reais(i.irrf) },
            { titulo: "Outros descontos", valor: (i) => reais(i.descontos - i.inss - i.irrf) },
            { titulo: "Líquido", valor: (i) => h("strong", {}, reais(i.liquido)) },
            { titulo: "FGTS", valor: (i) => reais(i.fgts) },
            { titulo: "App", valor: (i) => (i.visualizado_em ? h("span", { class: "chip chip-ok", title: dataHora(i.visualizado_em) }, "visto") : "—") },
          ],
          f.itens,
          { aoClicar: (i) => holerite(f, i) },
        ),
      ),
    ),
  );
}

export function holerite(f, i, empresa) {
  const prov = i.rubricas.filter((r) => r.tipo === "provento");
  const desc = i.rubricas.filter((r) => r.tipo === "desconto");
  janela({
    titulo: `Holerite · ${i.nome}`,
    largura: 720,
    conteudo: h(
      "div",
      { class: "recibo holerite" },
      h("div", { class: "linha-entre" }, h("div", {}, h("strong", {}, empresa?.razao_social ?? ctxAtual?.eu.empresa.razao_social), h("br"), h("small", {}, "Demonstrativo de pagamento")), h("div", { class: "alinhar-fim" }, h("strong", {}, `${TIPOS[f.tipo]} · ${mesBR(f.competencia)}`), h("br"), h("small", {}, `${i.nome} · mat. ${i.matricula} · CPF ${cpfBR(i.cpf)}`))),
      tabela(
        [{ titulo: "Cód.", valor: (r) => r.codigo }, { titulo: "Descrição", valor: (r) => r.nome }, { titulo: "Ref.", valor: (r) => r.ref }, { titulo: "Proventos", valor: (r) => (r.tipo === "provento" ? reais(r.valor) : "") }, { titulo: "Descontos", valor: (r) => (r.tipo === "desconto" ? reais(r.valor) : "") }],
        [...prov, ...desc],
      ),
      h("div", { class: "holerite-totais" }, h("span", {}, `Proventos ${reais(i.bruto)}`), h("span", {}, `Descontos ${reais(i.descontos)}`), h("strong", {}, `Líquido ${reais(i.liquido)}`)),
      h("p", { class: "suave pequeno" }, `Base INSS ${reais(i.base_inss)} · Base IRRF ${reais(i.base_irrf)} · Base FGTS ${reais(i.base_fgts)} · FGTS do mês ${reais(i.fgts)}`),
    ),
    acoes: [{ texto: "Imprimir", classe: "btn-primario", fn: () => window.print() }],
  });
}

async function lancamentos() {
  const mes = h("input", { class: "entrada", type: "month", value: competenciaAnterior() });
  const area = h("div");
  const colabs = await get("/colaboradores");
  const carregar = async () => {
    const lista = await get(`/lancamentos/${mes.value}`);
    limpar(
      area,
      tabela(
        [
          { titulo: "Colaborador", valor: (l) => l.colaborador_nome },
          { titulo: "Descrição", valor: (l) => l.descricao },
          { titulo: "Tipo", valor: (l) => (l.tipo === "provento" ? h("span", { class: "chip chip-ok" }, "provento") : h("span", { class: "chip chip-perigo" }, "desconto")) },
          { titulo: "Valor", valor: (l) => reais(l.valor_centavos) },
          { titulo: "Incide", valor: (l) => [l.incide_inss && "INSS", l.incide_irrf && "IRRF", l.incide_fgts && "FGTS"].filter(Boolean).join(", ") || "nada" },
          { titulo: "", valor: (l) => h("button", { class: "btn-icone", "aria-label": "Excluir", onclick: async () => (await del(`/lancamentos/${l.id}`), carregar()) }, icone("lixo", 16)) },
        ],
        lista,
        { vazio: "Sem lançamentos neste mês. Use para comissões, bônus, adiantamentos, empréstimos…" },
      ),
    );
  };
  mes.onchange = carregar;
  await carregar();
  const novo = () => {
    const f = formulario([
      { nome: "colaborador_id", rotulo: "Colaborador", tipo: "select", opcoes: colabs.map((c) => [c.id, c.nome]), largura: 2 },
      { nome: "descricao", rotulo: "Descrição", obrigatorio: true, placeholder: "Comissão de vendas" },
      { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: [["provento", "Provento (soma)"], ["desconto", "Desconto"]] },
      { nome: "valor_centavos", rotulo: "Valor (R$)", tipo: "reais", obrigatorio: true },
      { nome: "incide_inss", rotulo: "Incide INSS", tipo: "check", padrao: true },
      { nome: "incide_irrf", rotulo: "Incide IRRF", tipo: "check", padrao: true },
      { nome: "incide_fgts", rotulo: "Incide FGTS", tipo: "check", padrao: true },
    ]);
    janela({ titulo: `Lançamento de ${mesBR(mes.value)}`, conteudo: f.el, acoes: [{ texto: "Lançar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post("/lancamentos", { ...f.ler(), competencia: mes.value }), fechar(), carregar())) }] });
  };
  return h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, mes, botao("Novo lançamento", novo, "btn-primario btn-pequeno", "mais")), area);
}

async function beneficios() {
  const lista = await get("/beneficios");
  const TB = { vt: "Vale-transporte", vr: "Vale-refeição", va: "Vale-alimentação", saude: "Plano de saúde", odonto: "Plano odontológico", seguro: "Seguro de vida", outro: "Outro" };
  const editar = (b) => {
    const f = formulario([
      { nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 },
      { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: Object.entries(TB) },
      { nome: "valor_centavos", rotulo: "Valor mensal por pessoa (R$)", tipo: "reais", obrigatorio: true },
      { nome: "desconto_tipo", rotulo: "Desconto do colaborador", tipo: "select", opcoes: [["nenhum", "Sem desconto"], ["percentual", "% do valor"], ["fixo", "Valor fixo (R$)"]], ajuda: "Vale-transporte: sempre 6% do salário, limitado ao valor." },
      { nome: "desconto_valor", rotulo: "% ou valor do desconto", tipo: "numero", passo: "0.01" },
      { nome: "ativo", rotulo: "Ativo", tipo: "check", padrao: true },
    ], b ?? {});
    janela({ titulo: b ? "Editar benefício" : "Novo benefício", conteudo: f.el, acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { const d = f.ler(); d.desconto_valor = d.desconto_valor ?? 0; b ? await put(`/beneficios/${b.id}`, d) : await post("/beneficios", d); fechar(); desenhar(); }) }] });
  };
  return h(
    "section",
    { class: "cartao" },
    h("div", { class: "cartao-topo" }, h("h2", {}, "Benefícios"), botao("Novo benefício", () => editar(), "btn-primario btn-pequeno", "mais")),
    tabela([{ titulo: "Benefício", valor: (b) => b.nome }, { titulo: "Tipo", valor: (b) => TB[b.tipo] }, { titulo: "Valor", valor: (b) => reais(b.valor_centavos) }, { titulo: "Desconto", valor: (b) => (b.tipo === "vt" ? "6% do salário" : b.desconto_tipo === "nenhum" ? "—" : b.desconto_tipo === "percentual" ? `${b.desconto_valor}%` : reais(b.desconto_valor * 100)) }, { titulo: "Participantes", valor: (b) => b.participantes }, { titulo: "Situação", valor: (b) => (b.ativo ? situacao("ativo") : h("span", { class: "chip" }, "inativo")) }], lista, { aoClicar: editar, vazio: "Cadastre VT, VR, plano de saúde… Depois marque na ficha de cada colaborador." }),
  );
}

async function rescisao(colaboradorId) {
  const [colabs, tipos] = await Promise.all([get("/colaboradores"), get("/rescisao/tipos")]);
  const f = formulario([
    { nome: "colaborador_id", rotulo: "Colaborador", tipo: "select", opcoes: colabs.map((c) => [c.id, c.nome]), largura: 2 },
    { nome: "tipo", rotulo: "Motivo", tipo: "select", opcoes: Object.entries(tipos).map(([k, v]) => [k, v.nome]), largura: 2 },
    { nome: "data", rotulo: "Último dia trabalhado", tipo: "data", obrigatorio: true, padrao: hojeISO() },
    { nome: "aviso", rotulo: "Aviso prévio", tipo: "select", opcoes: [["indenizado", "Indenizado"], ["trabalhado", "Trabalhado"], ["dispensado", "Dispensado"]] },
    { nome: "saldo_fgts_centavos", rotulo: "Saldo do FGTS (R$, opcional)", tipo: "reais", ajuda: "Do extrato do FGTS Digital/Caixa. Vazio = estimativa pelos meses." },
    { nome: "observacao", rotulo: "Observação", largura: 2 },
  ], { colaborador_id: colaboradorId });
  const resultado = h("div");
  const simular = async () => {
    const r = await post("/rescisao/simular", f.ler());
    limpar(
      resultado,
      h(
        "div",
        { class: "pilha recibo" },
        h("h3", {}, `${r.tipo_nome}`),
        h("p", {}, `Aviso: ${r.dias_aviso} dias${r.dias_aviso ? ` (projeção até ${dataBR(r.projecao)})` : ""} · pagar até ${dataBR(r.pagar_ate)} (CLT art. 477) · seguro-desemprego: ${r.seguro_desemprego ? "sim" : "não"} · saque do FGTS: ${r.saque_fgts}`),
        tabela([{ titulo: "Verba", valor: (x) => x.nome }, { titulo: "Ref.", valor: (x) => x.ref }, { titulo: "Proventos", valor: (x) => (x.tipo === "provento" ? reais(x.valor) : "") }, { titulo: "Descontos", valor: (x) => (x.tipo === "desconto" ? reais(x.valor) : "") }], r.rubricas),
        h("div", { class: "holerite-totais" }, h("span", {}, `Bruto ${reais(r.bruto)}`), h("span", {}, `Descontos ${reais(r.descontos)}`), h("strong", {}, `Líquido ${reais(r.liquido)}`)),
        h("p", {}, `FGTS: saldo ${reais(r.saldo_fgts_estimado)} + depósito rescisório ${reais(r.fgts)} · multa ${reais(r.multa_fgts)} (recolher pelo FGTS Digital).`),
        h("p", { class: "suave pequeno" }, "Estimativa para conferência. Médias de variáveis, convenção coletiva e descontos específicos devem ser revisados antes de pagar."),
        botao("Efetivar desligamento", (e) => acao(e.currentTarget, async () => { if (!(await confirmar("Confirmar o desligamento? O app do colaborador será desconectado e o S-2299 será gerado.", { perigo: true, botao: "Desligar" }))) return; const x = await post("/rescisao/efetivar", f.ler()); aviso(`Desligamento registrado.${x.evento_esocial ? " Evento S-2299 pronto no eSocial." : ""}`); ctxAtual.navegar(`colaboradores/${f.ler().colaborador_id}`); }), "btn-perigo"),
      ),
    );
  };
  return h("div", { class: "grade-form" }, h("section", { class: "cartao" }, h("h2", {}, "Simular rescisão"), f.el, h("div", { class: "barra-salvar" }, botao("Calcular", (e) => acao(e.currentTarget, simular), "btn-primario", "raio"))), h("section", { class: "cartao" }, resultado));
}
