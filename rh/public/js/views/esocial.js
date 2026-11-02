/* eSocial: fila de eventos gerados pelo RH, assinatura com o certificado A1, envio em lotes e retorno do governo. */

import { del, get, post } from "../api.js";
import { acao, aviso, confirmar, dataHora, h, icone, janela, limpar } from "../ui.js";
import { baixar, botao, dataBR, indicador, situacao, tabela, topo } from "../comum.js";

let raizAtual;
let ctxAtual;
let filtro = "";

export async function render(raiz, ctx) {
  raizAtual = raiz;
  ctxAtual = ctx;
  await desenhar();
}

const NOMES = { "S-1000": "Empregador", "S-1005": "Estabelecimento", "S-1010": "Rubrica", "S-1020": "Lotação", "S-2200": "Admissão", "S-2205": "Alteração cadastral", "S-2206": "Alteração contratual", "S-2230": "Afastamento", "S-2299": "Desligamento", "S-1200": "Remuneração", "S-1210": "Pagamento", "S-1299": "Fechamento" };

async function desenhar() {
  const [r, eventos, lotes] = await Promise.all([get("/esocial/resumo"), get(`/esocial/eventos${filtro ? `?status=${filtro}` : ""}`), get("/esocial/lotes")]);
  const p = r.por_status;
  const prontos = (p.assinado ?? 0) + (p.erro ?? 0) + (p.gerado ?? 0);
  limpar(
    raizAtual,
    h(
      "div",
      { class: "pagina" },
      topo(
        "eSocial",
        `Leiaute S-1.3 · ambiente: ${r.ambiente === 1 ? "PRODUÇÃO" : "produção restrita (testes)"}`,
        r.tabelas_enviadas ? null : botao("Gerar eventos de tabela (S-1000, S-1005, S-1010, S-1020)", (e) => acao(e.currentTarget, async () => { const x = await post("/esocial/tabelas"); aviso(`${x.gerados} eventos de tabela gerados.`); desenhar(); }), "btn-fantasma", "caixa"),
        botao("Consultar retorno", (e) => acao(e.currentTarget, async () => { const x = await post("/esocial/consultar"); aviso(x.lotes.length ? x.lotes.map((l) => `Lote: ${l.status}${l.aceitos !== undefined ? ` (${l.aceitos}/${l.eventos} aceitos)` : ""}`).join(" · ") : "Nenhum lote aguardando retorno."); desenhar(); }), "btn-fantasma", "busca"),
        botao(`Enviar ${prontos} evento(s)`, (e) => acao(e.currentTarget, async () => { if (!(await confirmar(`Assinar e transmitir ${prontos} evento(s) para o eSocial (${r.ambiente === 1 ? "PRODUÇÃO" : "produção restrita"})?`, { botao: "Enviar" }))) return; const x = await post("/esocial/enviar", {}); aviso(x.lotes.map((l) => `Lote do grupo ${l.grupo}: ${l.ok ? "recebido" : "recusado"} (${l.mensagem ?? ""})`).join(" · "), x.lotes.every((l) => l.ok) ? "ok" : "erro", 9000); desenhar(); }), "btn-primario", "enviar"),
      ),
      !r.certificado ? h("section", { class: "cartao aviso-cartao" }, icone("alerta", 18), h("div", {}, h("strong", {}, "Falta o certificado digital A1"), h("p", {}, "Os eventos ficam gerados e você pode baixar o XML, mas para assinar e enviar é preciso o certificado e-CNPJ A1 (.pfx)."), h("a", { class: "btn btn-pequeno", href: "#/config/esocial" }, "Enviar certificado"))) : r.certificado.vence_em_dias < 30 ? h("section", { class: "cartao aviso-cartao" }, icone("alerta", 18), h("p", {}, `O certificado ${r.certificado.titular} vence em ${r.certificado.vence_em_dias} dias.`)) : null,
      h("div", { class: "indicadores" }, indicador("nota", "Gerados", p.gerado ?? 0, "aguardam assinatura"), indicador("escudo", "Assinados", p.assinado ?? 0, "prontos para enviar"), indicador("enviar", "Enviados", p.enviado ?? 0, "aguardando retorno"), indicador("check", "Aceitos", p.processado ?? 0, "com recibo", "var(--verde)"), indicador("alerta", "Recusados", p.erro ?? 0, "corrija e reenvie", p.erro ? "var(--vermelho)" : null)),
      h(
        "section",
        { class: "cartao" },
        h("div", { class: "cartao-topo" }, h("h2", {}, "Eventos"), h("select", { class: "entrada entrada-pequena", onchange: (e) => ((filtro = e.target.value), desenhar()) }, [["", "Todos"], ["gerado", "Gerados"], ["assinado", "Assinados"], ["enviado", "Enviados"], ["processado", "Aceitos"], ["erro", "Recusados"]].map(([v, t]) => h("option", { value: v, selected: v === filtro }, t)))),
        tabela(
          [
            { titulo: "Evento", valor: (e) => h("div", {}, h("strong", {}, `${e.tipo} · ${NOMES[e.tipo] ?? ""}`), h("br"), h("small", { class: "suave" }, e.descricao)) },
            { titulo: "Gerado", valor: (e) => dataHora(e.criado_em) },
            { titulo: "Situação", valor: (e) => situacao(e.status) },
            { titulo: "Recibo", valor: (e) => e.recibo ?? "—", classe: "mono" },
            { titulo: "Retorno", valor: (e) => (e.ocorrencias?.length ? h("button", { class: "chip chip-perigo clicavel", onclick: () => ocorrencias(e) }, `${e.ocorrencias.length} ocorrência(s)`) : "—") },
            { titulo: "", valor: (e) => h("div", { class: "tags" }, h("button", { class: "btn-icone", title: "Baixar XML", "aria-label": "Baixar XML", onclick: () => acao(null, () => baixar(`/esocial/eventos/${e.id}/xml`)) }, icone("download", 16)), ["gerado", "assinado", "erro"].includes(e.status) ? h("button", { class: "btn-icone", title: "Descartar", "aria-label": "Descartar", onclick: async () => (await confirmar(`Descartar ${e.tipo} (${e.descricao})?`, { perigo: true, botao: "Descartar" })) && (await del(`/esocial/eventos/${e.id}`), desenhar()) }, icone("lixo", 16)) : null) },
          ],
          eventos,
          { vazio: "Nenhum evento. Eles nascem sozinhos quando você admite, altera, afasta, desliga ou fecha a folha." },
        ),
      ),
      lotes.length
        ? h("section", { class: "cartao" }, h("h2", {}, "Lotes transmitidos"), tabela([{ titulo: "Enviado", valor: (l) => dataHora(l.enviado_em) }, { titulo: "Ambiente", valor: (l) => (l.ambiente === 1 ? "Produção" : "Restrita") }, { titulo: "Protocolo", valor: (l) => l.protocolo ?? "—", classe: "mono" }, { titulo: "Situação", valor: (l) => l.status }, { titulo: "Resposta", valor: (l) => l.resposta?.descricao ?? "—" }], lotes))
        : null,
      h("p", { class: "suave pequeno" }, "Ordem de envio respeitada automaticamente: tabelas (grupo 1) → não periódicos (grupo 2) → periódicos (grupo 3), até 50 eventos por lote. Antes de usar em produção, transmita em produção restrita e confira o retorno do governo."),
    ),
  );
}

function ocorrencias(e) {
  janela({ titulo: `Retorno do eSocial · ${e.tipo}`, conteudo: h("ul", { class: "lista-simples" }, e.ocorrencias.map((o) => h("li", {}, h("strong", {}, o.codigo ?? ""), " ", o.descricao, o.localizacao ? h("small", { class: "suave" }, ` (${o.localizacao})`) : null))) });
}
