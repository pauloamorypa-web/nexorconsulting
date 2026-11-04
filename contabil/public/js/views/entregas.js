/* Guias e relatórios: o escritório envia, o cliente recebe o aviso e baixa no portal. */

import { del, get, post } from "../api.js";
import { acao, aviso, confirmar, dataHora, h, janela, limpar, reais } from "../ui.js";
import { botao, competenciaAnterior, dataBR, formulario, mesBR, tabela, topo } from "../comum.js";
import { enviarArquivo, nomeCliente, sit } from "../base.js";

const TIPO = { guia: "Guia", relatorio: "Relatório", holerite: "Holerite", documento: "Documento" };

export async function render(raiz) {
  const clientes = await get("/clientes");
  const corpo = h("div");
  const carregar = async () => {
    const lista = await get("/entregas");
    limpar(corpo, tabela([{ titulo: "Enviado", valor: (e) => dataHora(e.criado_em) }, { titulo: "Cliente", valor: (e) => e.cliente }, { titulo: "Título", valor: (e) => e.titulo }, { titulo: "Tipo", valor: (e) => TIPO[e.tipo] }, { titulo: "Vencimento", valor: (e) => (e.vencimento ? dataBR(e.vencimento) : "—") }, { titulo: "Valor", valor: (e) => (e.valor_centavos ? reais(e.valor_centavos) : "—"), classe: "num" }, { titulo: "Situação", valor: (e) => sit(e.status) }, { titulo: "Aviso", valor: (e) => (e.avisado ? "Enviado" : "—") }, { titulo: "", valor: (e) => h("div", { class: "acoes-linha" }, botao("Avisar", (ev) => acao(ev.currentTarget, async () => (await post(`/entregas/${e.id}/avisar`), aviso("Cliente avisado."), carregar())), "btn-fantasma btn-pequeno"), botao("Excluir", (ev) => acao(ev.currentTarget, async () => (await confirmar("Excluir esta entrega? O cliente deixa de ver no portal.", { perigo: true })) && (await del(`/entregas/${e.id}`), carregar())), "btn-fantasma btn-pequeno")) }], lista, { vazio: "Nada enviado ainda." }));
  };
  const nova = () => {
    let arquivo = null;
    const escolhido = h("span", { class: "suave" }, "Nenhum arquivo escolhido");
    const input = h("input", { type: "file", accept: ".pdf,.jpg,.jpeg,.png,.xml,.csv,.xlsx", onchange: () => ((arquivo = input.files[0] ?? null), (escolhido.textContent = arquivo?.name ?? "Nenhum arquivo escolhido")) });
    const tarefas = h("select", { class: "entrada" }, h("option", { value: "" }, "—"));
    const f = formulario([{ nome: "cliente_id", rotulo: "Cliente", tipo: "select", obrigatorio: true, opcoes: [["", "Escolha"], ...clientes.filter((c) => c.ativo).map((c) => [c.id, nomeCliente(c)])], largura: 2 }, { nome: "titulo", rotulo: "Título", obrigatorio: true, largura: 2, placeholder: "Ex.: DAS 10/2026" }, { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: Object.entries(TIPO) }, { nome: "competencia", rotulo: "Competência", tipo: "mes", padrao: competenciaAnterior() }, { nome: "vencimento", rotulo: "Vencimento", tipo: "data" }, { nome: "valor_centavos", rotulo: "Valor (R$)", tipo: "reais" }, { nome: "avisar", rotulo: "Avisar o cliente por WhatsApp e e-mail", tipo: "check", padrao: true, largura: 2 }], { tipo: "guia" });
    f.entrada("cliente_id").addEventListener("change", async (e) => {
      const ts = e.target.value ? await get(`/tarefas?cliente=${e.target.value}&status=abertas`) : [];
      limpar(tarefas, h("option", { value: "" }, "—"), ts.map((t) => h("option", { value: t.id }, `${t.nome} · ${mesBR(t.competencia)}`)));
    });
    janela({
      titulo: "Enviar guia ou relatório",
      largura: 640,
      conteudo: h("div", { class: "pilha" }, h("label", { class: "btn btn-fantasma", style: { justifySelf: "start" } }, "Escolher arquivo", h("span", { hidden: true }, input)), escolhido, f.el, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Concluir a obrigação (opcional)"), tarefas)),
      acoes: [{ texto: "Enviar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { if (!arquivo) throw new Error("Escolha o arquivo."); const d = f.ler(); const a = await enviarArquivo("/arquivos", arquivo); const r = await post("/entregas", { ...d, arquivo_id: a.id, tarefa_id: tarefas.value || undefined }); fechar(); aviso(r.avisado ? "Enviado e cliente avisado." : "Enviado. O cliente vê no portal."); carregar(); }) }],
    });
  };
  raiz.append(h("div", { class: "pagina" }, topo("Guias e relatórios", "O cliente recebe o aviso e baixa no portal; você vê quando ele abriu e quando pagou.", botao("Enviar", nova, "btn-primario", "upload")), h("section", { class: "cartao" }, corpo)));
  await carregar();
}
