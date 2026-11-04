/* Lançamentos: o que a IA preparou e o contador aprovou, por cliente e competência, pronto para importar. */

import { get } from "../api.js";
import { acao, aviso, h, limpar, reais } from "../ui.js";
import { botao, competenciaAnterior, dataBR, tabela, topo } from "../comum.js";
import { nomeCliente, sit } from "../base.js";

export async function render(raiz, ctx) {
  const clientes = await get("/clientes");
  const selC = h("select", { class: "entrada" }, h("option", { value: "" }, "Escolha o cliente"), clientes.map((c) => h("option", { value: c.id }, nomeCliente(c))));
  const comp = h("input", { class: "entrada", type: "month", value: competenciaAnterior() });
  const incluir = h("label", { class: "linha-check" }, h("input", { type: "checkbox" }), h("span", {}, "Incluir os já exportados"));
  const corpo = h("div");
  const resumo = h("div", { class: "filtros" });
  const carregar = async () => {
    if (!selC.value) return limpar(corpo, h("p", { class: "suave centro" }, "Escolha um cliente e a competência."));
    const lista = await get(`/lancamentos?cliente=${selC.value}&competencia=${comp.value}`);
    const conta = (s) => lista.filter((l) => l.status === s).length;
    limpar(resumo, sit("sugerido", `${conta("sugerido")} a conferir`), sit("aprovado", `${conta("aprovado")} aprovados`), sit("exportado", `${conta("exportado")} exportados`));
    limpar(corpo, tabela([{ titulo: "Data", valor: (l) => dataBR(l.data) }, { titulo: "Débito", valor: (l) => l.debito }, { titulo: "Crédito", valor: (l) => l.credito }, { titulo: "Valor", valor: (l) => reais(l.valor_centavos), classe: "num" }, { titulo: "Histórico", valor: (l) => l.historico }, { titulo: "Documento", valor: (l) => (l.documento_id ? h("a", { href: `#/documentos/${l.documento_id}` }, l.documento_nome) : "—") }, { titulo: "Situação", valor: (l) => sit(l.status) }], lista, { vazio: "Nenhum lançamento nesta competência." }));
  };
  const exportar = (e) =>
    acao(e.currentTarget, async () => {
      if (!selC.value) throw new Error("Escolha o cliente.");
      const r = await fetch(`/api/lancamentos/exportar?cliente=${selC.value}&competencia=${comp.value}${incluir.querySelector("input").checked ? "&incluir_exportados=1" : ""}`, { credentials: "same-origin" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro ?? "Falha ao exportar.");
      const nome = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "lancamentos.csv";
      const a = h("a", { href: URL.createObjectURL(await r.blob()), download: nome });
      document.body.append(a);
      a.click();
      a.remove();
      aviso("Arquivo gerado. Importe no sistema contábil.");
      carregar();
    });
  for (const el of [selC, comp]) el.addEventListener("change", carregar);
  raiz.append(h("div", { class: "pagina" }, topo("Lançamentos", "Só os documentos conferidos entram na exportação. Layout e contas em Configurações → Exportação e contas.", botao("Exportar para o sistema contábil", exportar, "btn-primario", "download")), h("section", { class: "cartao" }, h("div", { class: "filtros", style: { marginBottom: "12px" } }, selC, comp, incluir, resumo), corpo)));
  await carregar();
}
