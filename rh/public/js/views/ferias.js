/* Férias (painel de vencimentos, programação, pedidos do app) e afastamentos/atestados. */

import { get, post, put } from "../api.js";
import { abas, acao, aviso, h, janela, limpar, reais } from "../ui.js";
import { botao, dataBR, enviar, formulario, situacao, tabela, topo } from "../comum.js";

let raizAtual;
let ctxAtual;
let aba = "painel";

export async function render(raiz, ctx, [sub, id]) {
  raizAtual = raiz;
  ctxAtual = ctx;
  await desenhar();
  if (sub === "programar" && id) programar(id);
  if (sub === "afastar" && id) afastar(id);
}
export function aoEvento(tipo) {
  if (tipo === "solicitacao" && raizAtual?.isConnected) desenhar();
}

async function desenhar() {
  const eu = ctxAtual.eu;
  const corpo = h("div", { class: "aba-corpo" });
  const rh = ctxAtual.pode("admin", "rh");
  limpar(
    raizAtual,
    h(
      "div",
      { class: "pagina" },
      topo("Férias e ausências", "Controle de períodos aquisitivos, pedidos do app, atestados e afastamentos.", rh ? botao("Programar férias", () => programar(), "btn-primario", "mala") : null, rh ? botao("Lançar afastamento", () => afastar(), "btn-fantasma", "saude") : null),
      abas([["painel", "Vencimentos"], ["pedidos", `Pedidos de férias${eu.contagem.ferias ? ` (${eu.contagem.ferias})` : ""}`], ["ferias", "Férias programadas"], ["atestados", `Atestados${eu.contagem.afastamentos ? ` (${eu.contagem.afastamentos})` : ""}`], ["afastamentos", "Afastamentos"]], aba, (x) => ((aba = x), desenhar())),
      corpo,
    ),
  );
  limpar(corpo, await { painel, pedidos, ferias, atestados, afastamentos }[aba]());
}

async function painel() {
  const lista = await get("/ferias/painel");
  return h(
    "section",
    { class: "cartao" },
    h("p", { class: "suave" }, "Férias não concedidas até o fim do período concessivo são pagas em dobro (CLT art. 137). Ordenado pelo prazo mais curto."),
    tabela(
      [
        { titulo: "Colaborador", valor: (c) => c.nome },
        { titulo: "Admissão", valor: (c) => dataBR(c.admissao) },
        { titulo: "Dias vencidos", valor: (c) => c.dias_vencidos || "—" },
        { titulo: "Conceder até", valor: (c) => (c.limite ? dataBR(c.limite) : "—") },
        { titulo: "Prazo", valor: (c) => (c.dias_ate_limite === null ? h("span", { class: "suave" }, "em aquisição") : h("span", { class: `chip ${c.dias_ate_limite < 0 ? "chip-perigo" : c.dias_ate_limite < 60 ? "chip-alerta" : "chip-ok"}` }, c.dias_ate_limite < 0 ? "vencido" : `${c.dias_ate_limite} dias`)) },
        { titulo: "Período atual", valor: (c) => { const p = c.periodos.at(-1); return p ? `${p.avos}/12 avos` : "—"; } },
        { titulo: "", valor: (c) => (ctxAtual.pode("admin", "rh") && c.dias_vencidos ? botao("Programar", (e) => (e.stopPropagation(), programar(c.id)), "btn-pequeno") : null) },
      ],
      lista,
    ),
  );
}

const colunasFerias = (acoes) => [
  { titulo: "Colaborador", valor: (f) => f.colaborador_nome },
  { titulo: "Início", valor: (f) => dataBR(f.inicio) },
  { titulo: "Dias", valor: (f) => `${f.dias}${f.abono_dias ? ` + ${f.abono_dias} vendidos` : ""}` },
  { titulo: "Período aquisitivo", valor: (f) => `${dataBR(f.aquisitivo_inicio)} a ${dataBR(f.aquisitivo_fim)}` },
  { titulo: "Líquido", valor: (f) => (f.valores?.liquido ? reais(f.valores.liquido) : "—") },
  { titulo: "Pagar até", valor: (f) => (f.valores?.pagar_ate ? dataBR(f.valores.pagar_ate) : "—") },
  { titulo: "Situação", valor: (f) => situacao(f.status) },
  ...(acoes ? [{ titulo: "", valor: acoes }] : []),
];

async function pedidos() {
  const lista = await get("/ferias?status=solicitada");
  return h(
    "section",
    { class: "cartao" },
    tabela(
      colunasFerias((f) =>
        h(
          "div",
          { class: "tags" },
          botao("Aprovar", (e) => acao(e.currentTarget, async () => (await post(`/ferias/${f.id}/decidir`, { aprovar: true }), aviso("Férias aprovadas. O recibo foi calculado."), ctxAtual.recarregarEu(), desenhar())), "btn-sucesso btn-pequeno"),
          botao("Recusar", (e) => acao(e.currentTarget, async () => { const m = prompt("Motivo (o colaborador verá):"); if (m === null) return; await post(`/ferias/${f.id}/decidir`, { aprovar: false, observacao: m }); ctxAtual.recarregarEu(); desenhar(); }), "btn-fantasma btn-pequeno"),
        ),
      ),
      lista,
      { vazio: "Nenhum pedido de férias aguardando." },
    ),
  );
}

async function ferias() {
  const lista = (await get("/ferias")).filter((f) => f.status !== "solicitada");
  return h(
    "section",
    { class: "cartao" },
    tabela(
      colunasFerias((f) => (f.status === "aprovada" ? h("div", { class: "tags" }, botao("Recibo", () => recibo(f), "btn-pequeno btn-fantasma"), ctxAtual.pode("admin", "rh") ? botao("Cancelar", (e) => acao(e.currentTarget, async () => (await post(`/ferias/${f.id}/cancelar`), desenhar())), "btn-pequeno btn-perigo-fantasma") : null) : null)),
      lista,
      { vazio: "Nenhuma férias programada." },
    ),
  );
}

function recibo(f) {
  const v = f.valores;
  janela({
    titulo: `Recibo de férias · ${f.colaborador_nome}`,
    largura: 620,
    conteudo: h(
      "div",
      { class: "pilha recibo" },
      h("p", {}, `Gozo de ${dataBR(f.inicio)}, ${f.dias} dias${f.abono_dias ? `, ${f.abono_dias} dias de abono pecuniário` : ""}. Pagamento até ${dataBR(v.pagar_ate)} (CLT art. 145).`),
      tabela([{ titulo: "Rubrica", valor: (r) => r.nome }, { titulo: "Ref.", valor: (r) => r.ref }, { titulo: "Proventos", valor: (r) => (r.tipo === "provento" ? reais(r.valor) : "") }, { titulo: "Descontos", valor: (r) => (r.tipo === "desconto" ? reais(r.valor) : "") }], v.rubricas),
      h("p", {}, h("strong", {}, `Líquido: ${reais(v.liquido)}`)),
    ),
    acoes: [{ texto: "Imprimir", classe: "btn-primario", fn: () => window.print() }],
  });
}

async function programar(colaboradorId) {
  const colabs = await get("/colaboradores");
  const f = formulario([
    { nome: "colaborador_id", rotulo: "Colaborador", tipo: "select", opcoes: colabs.map((c) => [c.id, c.nome]), largura: 2 },
    { nome: "inicio", rotulo: "Início do gozo", tipo: "data", obrigatorio: true, ajuda: "Não pode começar nos 2 dias antes de feriado ou do descanso semanal." },
    { nome: "dias", rotulo: "Dias de gozo", tipo: "numero", min: 5, max: 30, padrao: 30, obrigatorio: true, ajuda: "Pode dividir em até 3 períodos (um com 14+ dias)." },
    { nome: "abono_dias", rotulo: "Dias vendidos (abono)", tipo: "numero", min: 0, max: 10, padrao: 0 },
    { nome: "adiantar_13", rotulo: "Adiantar a 1ª parcela do 13º", tipo: "check" },
    { nome: "observacao", rotulo: "Observação", largura: 2 },
  ], { colaborador_id: colaboradorId });
  janela({
    titulo: "Programar férias",
    conteudo: f.el,
    acoes: [{ texto: "Programar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { const r = await post("/ferias", f.ler()); aviso(`Férias programadas. Líquido estimado ${reais(r.valores.liquido)}, pagar até ${dataBR(r.valores.pagar_ate)}.`, "ok", 8000); fechar(); aba = "ferias"; desenhar(); }) }],
  });
}

async function atestados() {
  const lista = await get("/afastamentos?status=pendente");
  return h(
    "section",
    { class: "cartao" },
    h("h2", {}, "Atestados enviados pelo app"),
    tabela(
      [
        { titulo: "Colaborador", valor: (a) => a.colaborador_nome },
        { titulo: "Período", valor: (a) => `${dataBR(a.inicio)} a ${dataBR(a.fim)}` },
        { titulo: "CID / médico", valor: (a) => [a.cid, a.medico].filter(Boolean).join(" · ") || "—" },
        { titulo: "Atestado", valor: (a) => (a.anexo ? h("a", { href: `/api/arquivos/${a.anexo}`, target: "_blank" }, "📎 Ver") : "—") },
        {
          titulo: "",
          valor: (a) =>
            h(
              "div",
              { class: "tags" },
              botao("Aceitar", (e) => acao(e.currentTarget, async () => (await post(`/afastamentos/${a.id}/decidir`, { aprovar: true }), aviso("Atestado aceito: as faltas foram abonadas."), ctxAtual.recarregarEu(), desenhar())), "btn-sucesso btn-pequeno"),
              botao("Recusar", (e) => acao(e.currentTarget, async () => { const m = prompt("Motivo:"); if (m === null) return; await post(`/afastamentos/${a.id}/decidir`, { aprovar: false, observacao: m }); ctxAtual.recarregarEu(); desenhar(); }), "btn-fantasma btn-pequeno"),
            ),
        },
      ],
      lista,
      { vazio: "Nenhum atestado aguardando." },
    ),
  );
}

async function afastamentos() {
  const [lista, motivos] = await Promise.all([get("/afastamentos"), get("/afastamentos/motivos")]);
  return h(
    "section",
    { class: "cartao" },
    tabela(
      [
        { titulo: "Colaborador", valor: (a) => a.colaborador_nome },
        { titulo: "Motivo", valor: (a) => motivos[a.motivo] ?? a.motivo },
        { titulo: "Início", valor: (a) => dataBR(a.inicio) },
        { titulo: "Retorno", valor: (a) => (a.fim ? dataBR(a.fim) : h("span", { class: "chip chip-alerta" }, "em aberto")) },
        { titulo: "Situação", valor: (a) => situacao(a.status) },
        { titulo: "", valor: (a) => (!a.fim && ctxAtual.pode("admin", "rh") ? botao("Registrar retorno", (e) => acao(e.currentTarget, async () => { const fim = prompt("Último dia de afastamento (AAAA-MM-DD):"); if (!fim) return; await put(`/afastamentos/${a.id}/retorno`, { fim }); desenhar(); }), "btn-pequeno") : null) },
      ],
      lista.filter((a) => a.status !== "pendente"),
      { vazio: "Nenhum afastamento." },
    ),
  );
}

async function afastar(colaboradorId) {
  const [colabs, motivos] = await Promise.all([get("/colaboradores"), get("/afastamentos/motivos")]);
  const arquivo = h("input", { type: "file", class: "entrada", accept: "image/*,.pdf" });
  const f = formulario([
    { nome: "colaborador_id", rotulo: "Colaborador", tipo: "select", opcoes: colabs.map((c) => [c.id, c.nome]), largura: 2 },
    { nome: "motivo", rotulo: "Motivo", tipo: "select", largura: 2, opcoes: [["atestado", "Atestado médico (até 15 dias, abona as faltas)"], ...Object.entries(motivos).map(([k, v]) => [k, `${k} · ${v}`])] },
    { nome: "inicio", rotulo: "Início", tipo: "data", obrigatorio: true },
    { nome: "fim", rotulo: "Último dia (vazio = em aberto)", tipo: "data" },
    { nome: "cid", rotulo: "CID (opcional)" },
    { nome: "medico", rotulo: "Médico / CRM" },
    { nome: "observacao", rotulo: "Observação", largura: 2 },
  ], { colaborador_id: colaboradorId });
  janela({
    titulo: "Lançar afastamento",
    conteudo: h("div", { class: "pilha" }, f.el, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Atestado (foto ou PDF)"), arquivo), h("p", { class: "suave pequeno" }, "Afastamentos acima de 15 dias, acidente de trabalho e licença-maternidade geram o S-2230 do eSocial.")),
    acoes: [
      {
        texto: "Lançar",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            const d = f.ler();
            if (arquivo.files[0]) d.anexo = (await enviar(`/arquivos?colaborador=${d.colaborador_id}`, arquivo.files[0])).id;
            const r = await post("/afastamentos", d);
            aviso(r.evento_esocial ? `Afastamento lançado. Evento ${r.evento_esocial.tipo} pronto no eSocial.` : "Afastamento lançado.");
            fechar();
            aba = "afastamentos";
            desenhar();
          }),
      },
    ],
  });
}
