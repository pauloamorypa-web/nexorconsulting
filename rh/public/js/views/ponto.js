/* Ponto: o dia em tempo real, marcações, espelho com ajustes, pedidos do app, fechamento do mês e
   arquivos de fiscalização (AFD, AEJ) com verificação de integridade. */

import { get, post } from "../api.js";
import { abas, acao, aviso, avatar, confirmar, dataHora, h, icone, janela, limpar } from "../ui.js";
import { baixar, botao, competenciaAnterior, competenciaAtual, dataBR, DIAS, formulario, hhmm, hojeISO, indicador, mesBR, situacao, tabela, topo } from "../comum.js";

let raizAtual;
let ctxAtual;
let aba = "hoje";
let estadoEspelho = { colaborador: "", competencia: competenciaAtual() };

export async function render(raiz, ctx, [sub]) {
  raizAtual = raiz;
  ctxAtual = ctx;
  if (sub) aba = sub;
  await desenhar();
}
export function aoEvento(tipo) {
  if (["marcacao", "solicitacao"].includes(tipo) && raizAtual?.isConnected && ["hoje", "ajustes"].includes(aba)) desenhar();
}

const selos = (m) => [m.biometria ? h("span", { class: "chip chip-ok", title: "Confirmado com digital ou rosto" }, icone("digital", 12), " biometria") : null, m.qr ? h("span", { class: "chip chip-info", title: "QR Code do quiosque" }, icone("qr", 12), " QR") : null, m.origem === "quiosque" ? h("span", { class: "chip" }, "PIN no quiosque") : null, m.distancia_m !== null && m.distancia_m !== undefined ? h("span", { class: "chip", title: "Distância do local" }, icone("local", 12), ` ${Math.round(m.distancia_m)} m`) : null];

async function desenhar() {
  const corpo = h("div", { class: "aba-corpo" }, h("div", { class: "carregando-bloco" }, h("span", { class: "girando" })));
  const rh = ctxAtual.pode("admin", "rh");
  const itens = [["hoje", "Hoje", "relogio"], ["marcacoes", "Marcações", "nota"], ["espelho", "Espelho de ponto", "agenda"], ["ajustes", "Pedidos de ajuste", "sino"], rh ? ["fechamento", "Fechamento e fiscalização", "escudo"] : null].filter(Boolean);
  limpar(raizAtual, h("div", { class: "pagina" }, topo("Ponto eletrônico", "REP-P (Portaria MTP 671/2021): cada marcação tem NSR, hash encadeado e comprovante."), abas(itens, aba, (x) => ((aba = x), desenhar())), corpo));
  limpar(corpo, await { hoje, marcacoes, espelho, ajustes, fechamento }[aba]());
}

async function hoje() {
  const d = await get("/ponto/hoje");
  const r = d.resumo;
  return h(
    "div",
    { class: "pilha" },
    h("div", { class: "indicadores" }, indicador("relogio", "Trabalhando", r.trabalhando, "", "var(--verde)"), indicador("agenda", "Em intervalo", r.intervalo), indicador("alerta", "Atrasados", r.atrasados, "", r.atrasados ? "var(--vermelho)" : null), indicador("pessoa", "Ainda no horário", r.aguardando), indicador("sair", "Já saíram", r.saiu), indicador("mala", "Folga, férias, afastados", r.folga + r.ferias + r.afastados)),
    h(
      "section",
      { class: "cartao" },
      tabela(
        [
          { titulo: "Colaborador", valor: (x) => h("div", { class: "celula-pessoa" }, avatar(x.nome, x.id, 30), h("strong", {}, x.nome)) },
          { titulo: "Previsto", valor: (x) => (x.previsto ? `${x.previsto.entrada} – ${x.previsto.saida}` : "—") },
          { titulo: "Marcações de hoje", valor: (x) => (x.marcacoes.length ? h("div", { class: "horas-dia" }, x.marcacoes.map((m) => h("span", { class: `hora-chip ${m.biometria ? "bio" : ""}`, title: [m.biometria && "biometria", m.qr && "QR Code", m.origem].filter(Boolean).join(" · ") }, m.hora))) : "—") },
          { titulo: "Situação", valor: (x) => situacao(x.situacao) },
        ],
        d.lista,
        { aoClicar: (x) => ((estadoEspelho.colaborador = x.id), (aba = "espelho"), desenhar()), vazio: "Sem colaboradores." },
      ),
    ),
  );
}

async function marcacoes() {
  const de = h("input", { class: "entrada", type: "date", value: hojeISO() });
  const ate = h("input", { class: "entrada", type: "date", value: hojeISO() });
  const area = h("div");
  const carregar = async () => {
    const lista = await get(`/ponto/marcacoes?de=${de.value}&ate=${ate.value}`);
    limpar(
      area,
      tabela(
        [
          { titulo: "NSR", valor: (m) => String(m.nsr).padStart(9, "0"), classe: "mono" },
          { titulo: "Data e hora", valor: (m) => `${dataBR(m.dia)} ${m.hora}` },
          { titulo: "Colaborador", valor: (m) => m.colaborador_nome },
          { titulo: "Local", valor: (m) => m.local ?? "—" },
          { titulo: "Como", valor: (m) => h("div", { class: "tags" }, m.origem.startsWith("app") ? h("span", { class: "chip" }, "app") : null, selos(m)) },
          { titulo: "Situação", valor: (m) => (m.status === "valida" ? situacao("aprovado", "Válida") : h("span", { class: "chip chip-perigo", title: m.motivo }, "Desconsiderada")) },
        ],
        lista,
        { vazio: "Nenhuma marcação no período." },
      ),
    );
  };
  de.onchange = ate.onchange = carregar;
  await carregar();
  return h("section", { class: "cartao" }, h("div", { class: "filtros-linha" }, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "De"), de), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Até"), ate), h("p", { class: "suave pequeno" }, "As marcações nunca são apagadas: correções viram ajustes que preservam o registro original.")), area);
}

async function espelho() {
  const colabs = await get("/colaboradores");
  if (!colabs.length) return h("p", { class: "suave" }, "Cadastre colaboradores primeiro.");
  if (!estadoEspelho.colaborador) estadoEspelho.colaborador = colabs[0].id;
  const sel = h("select", { class: "entrada" }, colabs.map((c) => h("option", { value: c.id, selected: c.id === estadoEspelho.colaborador }, c.nome)));
  const mes = h("input", { class: "entrada", type: "month", value: estadoEspelho.competencia });
  const area = h("div");
  const carregar = async () => {
    estadoEspelho = { colaborador: sel.value, competencia: mes.value };
    const e = await get(`/ponto/espelho/${sel.value}/${mes.value}`);
    const t = e.totais;
    limpar(
      area,
      h("div", { class: "indicadores" }, indicador("relogio", "Trabalhadas", hhmm(t.trabalhado), `previstas ${hhmm(t.previsto)}`), indicador("raio", "Extras 50%", hhmm(t.extra50), e.banco_horas ? "vai para o banco de horas" : ""), indicador("raio", "Extras 100%", hhmm(t.extra100), "domingos e feriados"), indicador("lua", "Adicional noturno", hhmm(t.noturno_reduzido), "hora reduzida (52m30s)"), indicador("alerta", "Faltas e atrasos", `${t.faltas} faltas`, `atrasos ${hhmm(t.atraso)}`, t.faltas ? "var(--vermelho)" : null), indicador("caixa", "Banco de horas", hhmm(e.saldo_banco) === "—" ? "0h00" : hhmm(e.saldo_banco))),
      h("div", { class: "linha-entre" }, h("p", { class: "suave" }, e.jornada ? `Jornada: ${e.jornada.nome} · tolerância ${e.jornada.tolerancia_min} min por marcação (máx. 10 min/dia, CLT art. 58 §1º)` : "Sem jornada definida."), h("div", { class: "tags" }, e.fechado ? h("span", { class: "chip chip-ok" }, "Mês fechado") : null, e.assinatura ? h("span", { class: "chip chip-ok" }, `Assinado pelo colaborador em ${dataHora(e.assinatura.assinado_em)}`) : h("span", { class: "chip" }, "Ainda não assinado"), botao("Imprimir", () => window.print(), "btn-fantasma btn-pequeno"), e.fechado ? null : botao("Lançar ajuste", () => lancarAjuste(e, carregar), "btn-primario btn-pequeno", "mais"))),
      tabela(
        [
          { titulo: "Dia", valor: (d) => h("span", { class: d.dia_semana === 0 || d.status === "feriado" ? "perigo" : "" }, `${DIAS[d.dia_semana]} ${d.data.slice(8)}`) },
          { titulo: "Previsto", valor: (d) => (d.prev ? `${d.prev.entrada}–${d.prev.saida}` : "—") },
          { titulo: "Marcações", valor: (d) => h("div", { class: "horas-dia" }, d.marcacoes.map((m) => h("span", { class: `hora-chip ${m.incluida ? "incluida" : ""} ${m.biometria ? "bio" : ""}`, title: m.incluida ? "Incluída por ajuste" : m.nsr ? `NSR ${m.nsr}` : "" }, m.hora))) },
          { titulo: "Trabalhado", valor: (d) => hhmm(d.trabalhado) },
          { titulo: "Extra", valor: (d) => hhmm(d.extra50 + d.extra100) },
          { titulo: "Noturno", valor: (d) => hhmm(d.noturno_reduzido) },
          { titulo: "Atraso", valor: (d) => hhmm(d.atraso) },
          { titulo: "Ocorrência", valor: (d) => ({ falta: situacao("recusado", "Falta"), incompleto: h("span", { class: "chip chip-alerta" }, "Marcação ímpar"), abonado: situacao("aprovado", "Abonado"), ferias: situacao("ferias"), afastado: situacao("afastado"), feriado: h("span", { class: "chip" }, "Feriado"), folga: h("span", { class: "suave" }, "Folga"), futuro: "", fora_contrato: h("span", { class: "suave" }, "—") })[d.status] ?? (d.pendencia ? h("span", { class: "chip chip-alerta" }, d.pendencia) : "") },
        ],
        e.dias,
      ),
    );
  };
  sel.onchange = mes.onchange = carregar;
  await carregar();
  return h("section", { class: "cartao espelho" }, h("div", { class: "filtros-linha" }, sel, mes), area);
}

function lancarAjuste(e, depois) {
  const marcas = e.dias.flatMap((d) => d.marcacoes.filter((m) => m.nsr).map((m) => [d.data, m]));
  const f = formulario([
    { nome: "tipo", rotulo: "Tipo de ajuste", tipo: "select", opcoes: [["inclusao", "Incluir marcação esquecida"], ["abono", "Abonar (atestado, declaração)"], ["desconsiderar", "Desconsiderar marcação"]] },
    { nome: "data", rotulo: "Dia", tipo: "data", obrigatorio: true, padrao: hojeISO() },
    { nome: "horario", rotulo: "Horário (inclusão)", tipo: "hora" },
    { nome: "minutos", rotulo: "Minutos abonados (vazio = dia todo)", tipo: "numero", min: 1 },
    { nome: "motivo", rotulo: "Motivo", obrigatorio: true, largura: 2, ajuda: "Fica registrado no espelho e no AEJ." },
  ]);
  const selMarca = h("select", { class: "entrada" }, h("option", { value: "" }, "—"), marcas.map(([d, m]) => h("option", { value: m.id }, `${dataBR(d)} ${m.hora} (NSR ${m.nsr})`)));
  janela({
    titulo: "Lançar ajuste de ponto",
    conteudo: h("div", { class: "pilha" }, f.el, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Marcação a desconsiderar"), selMarca)),
    acoes: [
      {
        texto: "Lançar",
        classe: "btn-primario",
        fn: (ev, fechar) =>
          acao(ev.currentTarget, async () => {
            const d = f.ler();
            if (d.tipo === "desconsiderar") d.marcacao_id = selMarca.value || undefined;
            await post("/ajustes", { ...d, colaborador_id: e.colaborador_id });
            aviso("Ajuste lançado.");
            fechar();
            depois();
          }),
      },
    ],
  });
}

async function ajustes() {
  const lista = await get("/ajustes?status=pendente");
  const tipos = { inclusao: "Esqueci de bater", abono: "Abono", desconsiderar: "Desconsiderar" };
  return h(
    "section",
    { class: "cartao" },
    h("h2", {}, "Pedidos enviados pelo app"),
    tabela(
      [
        { titulo: "Colaborador", valor: (a) => a.colaborador_nome },
        { titulo: "Dia", valor: (a) => dataBR(a.data) },
        { titulo: "Pedido", valor: (a) => `${tipos[a.tipo]}${a.horario ? ` às ${a.horario}` : ""}` },
        { titulo: "Motivo", valor: (a) => h("div", {}, a.motivo, a.anexo ? h("div", {}, h("a", { href: `/api/arquivos/${a.anexo}`, target: "_blank" }, "📎 anexo")) : null) },
        { titulo: "Enviado", valor: (a) => dataHora(a.criado_em) },
        {
          titulo: "",
          valor: (a) =>
            h(
              "div",
              { class: "tags" },
              botao("Aprovar", (e) => acao(e.currentTarget, async () => (await post(`/ajustes/${a.id}/decidir`, { aprovar: true }), aviso("Aprovado."), desenhar())), "btn-sucesso btn-pequeno"),
              botao("Recusar", (e) => acao(e.currentTarget, async () => { const motivo = prompt("Motivo da recusa (o colaborador verá):"); if (motivo === null) return; await post(`/ajustes/${a.id}/decidir`, { aprovar: false, resposta: motivo }); desenhar(); }), "btn-fantasma btn-pequeno"),
            ),
        },
      ],
      lista,
      { vazio: "Nenhum pedido pendente. 🎉" },
    ),
  );
}

async function fechamento() {
  const mes = h("input", { class: "entrada", type: "month", value: competenciaAnterior() });
  const area = h("div");
  const carregar = async () => {
    const r = await get(`/ponto/resumo/${mes.value}`);
    limpar(
      area,
      h(
        "div",
        { class: "pilha" },
        h(
          "div",
          { class: "linha-entre" },
          h("p", {}, r.fechado ? `✅ O ponto de ${mesBR(r.competencia)} está fechado: ajustes bloqueados e banco de horas lançado.` : `Confira as pendências e feche ${mesBR(r.competencia)} para calcular a folha.`),
          r.fechado
            ? ctxAtual.pode("admin") ? botao("Reabrir mês", (e) => acao(e.currentTarget, async () => (await confirmar("Reabrir o mês desfaz os lançamentos do banco de horas do fechamento.", { botao: "Reabrir" })) && (await ctxAtual_api("DELETE", `/ponto/fechar/${r.competencia}`), carregar())), "btn-fantasma") : null
            : botao("Fechar o mês", (e) => acao(e.currentTarget, async () => { const pend = r.lista.reduce((s, x) => s + x.totais.pendencias, 0); if (!(await confirmar(pend ? `Há ${pend} dia(s) com marcação ímpar. Fechar mesmo assim?` : `Fechar o ponto de ${mesBR(r.competencia)}?`, { botao: "Fechar" }))) return; const x = await post(`/ponto/fechar/${r.competencia}`); aviso(`Mês fechado para ${x.colaboradores} colaboradores.`); carregar(); }), "btn-primario"),
        ),
        tabela(
          [
            { titulo: "Colaborador", valor: (x) => x.nome },
            { titulo: "Trabalhadas", valor: (x) => hhmm(x.totais.trabalhado) },
            { titulo: "Extras", valor: (x) => hhmm(x.totais.extra50 + x.totais.extra100) },
            { titulo: "Noturno", valor: (x) => hhmm(x.totais.noturno_reduzido) },
            { titulo: "Faltas", valor: (x) => x.totais.faltas || "—" },
            { titulo: "Atrasos", valor: (x) => hhmm(x.totais.atraso) },
            { titulo: "Pendências", valor: (x) => (x.totais.pendencias ? h("span", { class: "chip chip-alerta" }, x.totais.pendencias) : "—") },
            { titulo: "Banco", valor: (x) => (x.banco_horas ? hhmm(x.saldo_banco) || "0h00" : "—") },
            { titulo: "Assinou", valor: (x) => (x.assinado ? "✅" : "—") },
          ],
          r.lista,
          { aoClicar: (x) => ((estadoEspelho = { colaborador: x.id, competencia: r.competencia }), (aba = "espelho"), desenhar()) },
        ),
      ),
    );
  };
  mes.onchange = carregar;
  await carregar();

  const de = h("input", { class: "entrada", type: "date", value: `${competenciaAnterior()}-01` });
  const ate = h("input", { class: "entrada", type: "date", value: hojeISO() });
  const integ = h("p", { class: "suave" }, "Confere se alguma marcação foi alterada no banco de dados.");
  return h(
    "div",
    { class: "pilha" },
    h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, "Fechamento do mês"), mes), area),
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "Fiscalização (Portaria 671)"),
      h("p", { class: "suave" }, "AFD: todas as marcações com NSR e hash. AEJ: jornadas, marcações tratadas, ausências e banco de horas. Entregue ao auditor-fiscal quando solicitado."),
      h("div", { class: "filtros-linha" }, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "De"), de), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Até"), ate)),
      h(
        "div",
        { class: "tags" },
        botao("Baixar AFD", (e) => acao(e.currentTarget, () => baixar(`/ponto/afd?de=${de.value}&ate=${ate.value}`)), "btn-primario", "download"),
        botao("Assinatura do AFD (.p7s)", (e) => acao(e.currentTarget, () => baixar(`/ponto/afd-assinatura?de=${de.value}&ate=${ate.value}`)), "btn-fantasma", "escudo"),
        botao("Baixar AEJ do mês", (e) => acao(e.currentTarget, () => baixar(`/ponto/aej?competencia=${mes.value}`)), "btn-fantasma", "download"),
        botao("Verificar integridade", (e) => acao(e.currentTarget, async () => { const r = await get("/ponto/integridade"); limpar(integ, r.ok ? `✅ ${r.total} marcações conferidas: cadeia de hash íntegra.` : `⚠️ Adulteração detectada a partir do NSR ${r.nsr}.`); }), "btn-fantasma", "check"),
      ),
      integ,
    ),
  );
}

async function ctxAtual_api(metodo, caminho) {
  const { api } = await import("../api.js");
  return api(caminho, { metodo });
}
