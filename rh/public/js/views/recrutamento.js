/* Recrutamento: vagas, link público de candidatura e funil de candidatos (arrastar entre etapas). */

import { del, get, post, put } from "../api.js";
import { abas, acao, aviso, avatar, confirmar, copiarTexto, dataHora, h, icone, janela, limpar } from "../ui.js";
import { botao, formulario, situacao, tabela, topo } from "../comum.js";

const ETAPAS = [["triagem", "Triagem"], ["entrevista", "Entrevista"], ["teste", "Teste / dinâmica"], ["proposta", "Proposta"], ["contratado", "Contratado"], ["reprovado", "Não seguiu"]];
let raizAtual;
let ctxAtual;
let aba = "funil";
let vagaFiltro = "";

export async function render(raiz, ctx) {
  raizAtual = raiz;
  ctxAtual = ctx;
  await desenhar();
}

async function desenhar() {
  const [vagas, link] = await Promise.all([get("/vagas"), get("/vagas/link")]);
  const corpo = h("div", { class: "aba-corpo" });
  limpar(
    raizAtual,
    h(
      "div",
      { class: "pagina" },
      topo("Recrutamento", "Publique vagas, receba currículos pela sua página e acompanhe cada candidato.", botao("Copiar link da página de vagas", () => copiarTexto(link.link), "btn-fantasma", "link"), botao("Nova vaga", () => editarVaga(), "btn-primario", "mais")),
      abas([["funil", "Funil de candidatos"], ["vagas", `Vagas (${vagas.filter((v) => v.status === "aberta").length} abertas)`]], aba, (x) => ((aba = x), desenhar())),
      corpo,
    ),
  );
  limpar(corpo, aba === "vagas" ? listaVagas(vagas, link.link) : await funil(vagas));
}

function listaVagas(vagas, link) {
  return h(
    "section",
    { class: "cartao" },
    tabela(
      [
        { titulo: "Vaga", valor: (v) => h("strong", {}, v.titulo) },
        { titulo: "Modalidade", valor: (v) => v.modalidade ?? "—" },
        { titulo: "Local", valor: (v) => v.local ?? "—" },
        { titulo: "Candidatos", valor: (v) => v.candidatos },
        { titulo: "Situação", valor: (v) => situacao(v.status) },
        { titulo: "", valor: (v) => h("div", { class: "tags" }, botao("Editar", (e) => (e.stopPropagation(), editarVaga(v)), "btn-pequeno btn-fantasma"), botao("Link", (e) => (e.stopPropagation(), copiarTexto(`${link}#${v.id}`)), "btn-pequeno btn-fantasma")) },
      ],
      vagas,
      { aoClicar: (v) => ((vagaFiltro = v.id), (aba = "funil"), desenhar()), vazio: "Nenhuma vaga. Crie a primeira e divulgue o link." },
    ),
  );
}

function editarVaga(v) {
  const f = formulario([
    { nome: "titulo", rotulo: "Título da vaga", obrigatorio: true, largura: 2 },
    { nome: "modalidade", rotulo: "Modalidade", tipo: "select", opcoes: [["presencial", "Presencial"], ["hibrido", "Híbrido"], ["remoto", "Remoto"]] },
    { nome: "local", rotulo: "Cidade / bairro" },
    { nome: "salario", rotulo: "Faixa salarial (opcional)", placeholder: "R$ 2.500 + benefícios" },
    { nome: "status", rotulo: "Situação", tipo: "select", opcoes: [["aberta", "Aberta"], ["pausada", "Pausada"], ["fechada", "Fechada"]] },
    { nome: "descricao", rotulo: "Descrição e atividades", tipo: "area", linhas: 5, largura: 2 },
    { nome: "requisitos", rotulo: "Requisitos", tipo: "area", largura: 2 },
  ], v ?? {});
  janela({
    titulo: v ? "Editar vaga" : "Nova vaga",
    largura: 640,
    conteudo: f.el,
    acoes: [v ? { texto: "Excluir", classe: "btn-perigo-fantasma", fn: (e, fechar) => acao(e.currentTarget, async () => (await confirmar("Excluir a vaga e todos os candidatos?", { perigo: true })) && (await del(`/vagas/${v.id}`), fechar(), desenhar())) } : null, { texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (v ? await put(`/vagas/${v.id}`, f.ler()) : await post("/vagas", f.ler()), fechar(), desenhar())) }].filter(Boolean),
  });
}

async function funil(vagas) {
  const cands = await get(`/candidatos${vagaFiltro ? `?vaga=${vagaFiltro}` : ""}`);
  const filtro = h("select", { class: "entrada", onchange: (e) => ((vagaFiltro = e.target.value), desenhar()) }, h("option", { value: "" }, "Todas as vagas"), vagas.map((v) => h("option", { value: v.id, selected: v.id === vagaFiltro }, v.titulo)));
  const mover = async (id, etapa) => {
    await put(`/candidatos/${id}`, { etapa });
    desenhar();
  };
  return h(
    "div",
    { class: "pilha" },
    h("div", { class: "linha-entre" }, filtro, botao("Adicionar candidato", () => novoCandidato(vagas), "btn-fantasma btn-pequeno", "mais")),
    h(
      "div",
      { class: "kanban" },
      ETAPAS.map(([id, nome]) => {
        const lista = cands.filter((c) => c.etapa === id);
        return h(
          "section",
          { class: "kanban-coluna", ondragover: (e) => e.preventDefault(), ondrop: (e) => (e.preventDefault(), mover(e.dataTransfer.getData("text/plain"), id)) },
          h("header", {}, h("strong", {}, nome), h("span", { class: "chip" }, lista.length)),
          h(
            "div",
            { class: "kanban-cartoes" },
            lista.map((c) =>
              h(
                "article",
                { class: "kanban-cartao", draggable: "true", ondragstart: (e) => e.dataTransfer.setData("text/plain", c.id), onclick: () => abrirCandidato(c) },
                h("div", { class: "celula-pessoa" }, avatar(c.nome, c.id, 28), h("div", {}, h("strong", {}, c.nome), h("br"), h("small", { class: "suave" }, c.vaga))),
                c.nota ? h("small", {}, "★".repeat(c.nota)) : null,
              ),
            ),
          ),
        );
      }),
    ),
  );
}

function abrirCandidato(c) {
  const nota = h("select", { class: "entrada" }, [0, 1, 2, 3, 4, 5].map((n) => h("option", { value: n, selected: (c.nota ?? 0) === n }, n ? "★".repeat(n) : "Sem nota")));
  const obs = h("textarea", { class: "entrada", rows: 4 });
  obs.value = c.observacoes ?? "";
  const etapa = h("select", { class: "entrada" }, ETAPAS.map(([v, t]) => h("option", { value: v, selected: v === c.etapa }, t)));
  janela({
    titulo: c.nome,
    conteudo: h(
      "div",
      { class: "pilha" },
      h("p", {}, `${c.vaga} · enviado em ${dataHora(c.criado_em)}`),
      h("p", {}, [c.email, c.telefone, c.cidade].filter(Boolean).join(" · ")),
      c.linkedin ? h("a", { href: c.linkedin, target: "_blank", rel: "noopener" }, "LinkedIn") : null,
      c.curriculo ? h("a", { class: "btn btn-fantasma", href: `/api/arquivos/${c.curriculo}`, target: "_blank" }, icone("nota", 16), "Abrir currículo") : null,
      c.mensagem ? h("blockquote", { class: "citacao" }, c.mensagem) : null,
      h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Etapa"), etapa),
      h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Avaliação"), nota),
      h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Anotações da entrevista"), obs),
    ),
    acoes: [
      { texto: "Excluir (LGPD)", classe: "btn-perigo-fantasma", fn: (e, fechar) => acao(e.currentTarget, async () => (await confirmar("Excluir o candidato e o currículo?", { perigo: true })) && (await del(`/candidatos/${c.id}`), fechar(), desenhar())) },
      c.telefone ? h("a", { class: "btn btn-whats", href: `https://wa.me/55${c.telefone.replace(/\D/g, "").replace(/^55/, "")}`, target: "_blank", rel: "noopener" }, "WhatsApp") : null,
      { texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { await put(`/candidatos/${c.id}`, { etapa: etapa.value, nota: Number(nota.value) || null, observacoes: obs.value }); if (etapa.value === "contratado") aviso("Candidato contratado! Faça a admissão em Colaboradores.", "info", 7000); fechar(); desenhar(); }) },
    ].filter(Boolean),
  });
}

function novoCandidato(vagas) {
  if (!vagas.length) return aviso("Crie uma vaga primeiro.", "erro");
  const f = formulario([{ nome: "vaga_id", rotulo: "Vaga", tipo: "select", opcoes: vagas.map((v) => [v.id, v.titulo]), largura: 2 }, { nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 }, { nome: "email", rotulo: "E-mail", tipo: "email" }, { nome: "telefone", rotulo: "Telefone", tipo: "tel" }, { nome: "cidade", rotulo: "Cidade" }, { nome: "linkedin", rotulo: "LinkedIn" }, { nome: "mensagem", rotulo: "Observações", tipo: "area", largura: 2 }], { vaga_id: vagaFiltro });
  janela({ titulo: "Adicionar candidato", conteudo: f.el, acoes: [{ texto: "Adicionar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post("/candidatos", f.ler()), fechar(), desenhar())) }] });
}
