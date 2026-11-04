/* Obrigações e prazos: as tarefas de toda a carteira, por prazo interno, departamento e responsável. */

import { get, post, put } from "../api.js";
import { acao, aviso, h, janela, limpar } from "../ui.js";
import { botao, competenciaAnterior, dataBR, formulario, hojeISO, mesBR, tabela, topo } from "../comum.js";
import { nomeCliente, prazo, sit } from "../base.js";

export async function render(raiz, ctx) {
  const [usuarios, clientes] = await Promise.all([get("/usuarios"), get("/clientes")]);
  const st = h("select", { class: "entrada" }, [["abertas", "Em aberto"], ["concluida", "Concluídas"], ["dispensada", "Dispensadas"], ["", "Todas"]].map(([v, t]) => h("option", { value: v }, t)));
  const dep = h("select", { class: "entrada" }, h("option", { value: "" }, "Todos os departamentos"), Object.entries(ctx.eu.catalogos.departamentos).map(([v, t]) => h("option", { value: v, selected: ctx.eu.usuario.departamento === v && v !== "geral" }, t)));
  const periodo = h("select", { class: "entrada" }, [["", "Qualquer prazo"], ["hoje", "Até hoje"], ["semana", "Próximos 7 dias"], ["mes", "Este mês"]].map(([v, t]) => h("option", { value: v }, t)));
  const minhas = h("label", { class: "linha-check" }, h("input", { type: "checkbox" }), h("span", {}, "Só as minhas"));
  const corpo = h("div");
  const ate = () => {
    const d = new Date(Date.now() - 3 * 3600_000);
    if (periodo.value === "hoje") return hojeISO();
    if (periodo.value === "semana") return new Date(d.getTime() + 7 * 86400_000).toISOString().slice(0, 10);
    if (periodo.value === "mes") return `${hojeISO().slice(0, 7)}-31`;
    return "";
  };
  const carregar = async () => {
    const q = new URLSearchParams();
    if (st.value) q.set("status", st.value);
    if (dep.value) q.set("departamento", dep.value);
    if (ate()) q.set("ate", ate());
    if (minhas.querySelector("input").checked) q.set("minhas", "1");
    const lista = await get(`/tarefas?${q}`);
    limpar(
      corpo,
      tabela(
        [
          { titulo: "Prazo interno", valor: (t) => prazo(t.prazo_interno, !["concluida", "dispensada"].includes(t.status)) },
          { titulo: "Obrigação", valor: (t) => h("div", {}, h("strong", {}, t.nome), h("small", { class: "suave", style: { display: "block" } }, `${mesBR(t.competencia)} · vence ${dataBR(t.prazo_legal)}`)) },
          { titulo: "Cliente", valor: (t) => h("a", { href: `#/clientes/${t.cliente_id}/tarefas` }, t.cliente) },
          { titulo: "Departamento", valor: (t) => ctx.eu.catalogos.departamentos[t.departamento] },
          { titulo: "Responsável", valor: (t) => t.responsavel ?? "—" },
          { titulo: "Situação", valor: (t) => sit(t.status) },
          { titulo: "", valor: (t) => acoes(t) },
        ],
        lista,
        { vazio: "Nenhuma obrigação neste filtro." },
      ),
    );
  };
  const acoes = (t) =>
    h(
      "div",
      { class: "acoes-linha" },
      t.status === "a_fazer" ? botao("Iniciar", (e) => acao(e.currentTarget, async () => (await put(`/tarefas/${t.id}`, { status: "em_andamento" }), carregar())), "btn-fantasma btn-pequeno") : null,
      ["a_fazer", "em_andamento"].includes(t.status) ? botao("Concluir", () => concluir(t), "btn-primario btn-pequeno", "check") : null,
      botao("…", () => editar(t), "btn-fantasma btn-pequeno"),
    );
  const concluir = (t) => {
    const min = h("input", { class: "entrada", type: "number", min: 0, placeholder: "Ex.: 20" });
    janela({ titulo: `Concluir: ${t.nome}`, conteudo: h("div", { class: "pilha" }, h("p", {}, `${t.cliente} · ${mesBR(t.competencia)}`), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Tempo gasto (minutos, opcional)"), min), h("p", { class: "suave pequeno" }, "O tempo ajuda a medir quanto cada cliente custa para o escritório.")), acoes: [{ texto: "Concluir", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await put(`/tarefas/${t.id}`, { status: "concluida", minutos: min.value ? Number(min.value) : null }), fechar(), aviso("Obrigação concluída."), carregar())) }] });
  };
  const editar = (t) => {
    const f = formulario([{ nome: "responsavel_id", rotulo: "Responsável", tipo: "select", opcoes: [["", "—"], ...usuarios.map((u) => [u.id, u.nome])], largura: 2 }, { nome: "prazo_interno", rotulo: "Prazo interno", tipo: "data" }, { nome: "status", rotulo: "Situação", tipo: "select", opcoes: [["a_fazer", "A fazer"], ["em_andamento", "Em andamento"], ["concluida", "Concluída"], ["dispensada", "Dispensada (não se aplica)"]] }, { nome: "observacao", rotulo: "Observação", tipo: "area", largura: 2 }], t);
    janela({ titulo: t.nome, conteudo: h("div", { class: "pilha" }, h("p", { class: "suave" }, `${t.cliente} · ${mesBR(t.competencia)} · vencimento legal ${dataBR(t.prazo_legal)}`), f.el), acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { const d = f.ler(); if (!d.responsavel_id) d.responsavel_id = null; await put(`/tarefas/${t.id}`, d); fechar(); carregar(); }) }] });
  };
  const nova = () => {
    const f = formulario([{ nome: "cliente_id", rotulo: "Cliente", tipo: "select", obrigatorio: true, opcoes: [["", "Escolha"], ...clientes.filter((c) => c.ativo).map((c) => [c.id, nomeCliente(c)])], largura: 2 }, { nome: "nome", rotulo: "Tarefa", obrigatorio: true, largura: 2, placeholder: "Ex.: Alteração contratual" }, { nome: "departamento", rotulo: "Departamento", tipo: "select", opcoes: Object.entries(ctx.eu.catalogos.departamentos) }, { nome: "competencia", rotulo: "Competência", tipo: "mes", obrigatorio: true, padrao: competenciaAnterior() }, { nome: "prazo_legal", rotulo: "Prazo", tipo: "data", obrigatorio: true }, { nome: "responsavel_id", rotulo: "Responsável", tipo: "select", opcoes: [["", "—"], ...usuarios.map((u) => [u.id, u.nome])] }], { departamento: "geral" });
    janela({ titulo: "Nova tarefa", largura: 620, conteudo: f.el, acoes: [{ texto: "Criar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { const d = f.ler(); if (!d.responsavel_id) delete d.responsavel_id; await post("/tarefas", d); fechar(); carregar(); }) }] });
  };
  for (const el of [st, dep, periodo, minhas]) el.addEventListener("change", carregar);
  raiz.append(h("div", { class: "pagina" }, topo("Obrigações e prazos", "Prazos padrão conforme o catálogo do escritório (Configurações → Obrigações). Confira a legislação vigente e os prazos estaduais e municipais.", botao("Nova tarefa", nova, "btn-primario", "mais")), h("section", { class: "cartao" }, h("div", { class: "filtros", style: { marginBottom: "12px" } }, st, dep, periodo, minhas), corpo)));
  await carregar();
}
