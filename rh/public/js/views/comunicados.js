/* Comunicados internos: publicados no app do trabalhador, com confirmação de leitura. */

import { del, get, post, put } from "../api.js";
import { acao, confirmar, dataHora, h, icone, janela, limpar } from "../ui.js";
import { botao, formulario, topo } from "../comum.js";

let raizAtual;
let ctxAtual;

export async function render(raiz, ctx) {
  raizAtual = raiz;
  ctxAtual = ctx;
  await desenhar();
}

async function desenhar() {
  const lista = await get("/comunicados");
  const rh = ctxAtual.pode("admin", "rh");
  limpar(
    raizAtual,
    h(
      "div",
      { class: "pagina" },
      topo("Comunicados", "Avisos que aparecem no app de cada colaborador, com confirmação de leitura.", rh ? botao("Novo comunicado", () => editar(), "btn-primario", "mais") : null),
      lista.length
        ? lista.map((c) =>
            h(
              "article",
              { class: "cartao comunicado" },
              h("div", { class: "cartao-topo" }, h("h2", {}, c.fixado ? "📌 " : "", c.titulo), h("div", { class: "tags" }, h("button", { class: "chip clicavel", onclick: () => leituras(c) }, icone("checks", 12), ` ${c.leituras} de ${c.total} leram`), rh ? botao("Editar", () => editar(c), "btn-pequeno btn-fantasma") : null)),
              h("p", { class: "texto-longo" }, c.texto),
              h("small", { class: "suave" }, `${c.autor ?? ""} · ${dataHora(c.criado_em)}`),
            ),
          )
        : h("div", { class: "vazio" }, h("h3", {}, "Nenhum comunicado"), h("p", {}, "Avise sobre feriados, mudanças de horário, campanhas, aniversariantes…")),
    ),
  );
}

function editar(c) {
  const f = formulario([{ nome: "titulo", rotulo: "Título", obrigatorio: true, largura: 2 }, { nome: "texto", rotulo: "Mensagem", tipo: "area", linhas: 7, obrigatorio: true, largura: 2 }, { nome: "fixado", rotulo: "Fixar no topo", tipo: "check" }], c ?? {});
  janela({
    titulo: c ? "Editar comunicado" : "Novo comunicado",
    largura: 620,
    conteudo: f.el,
    acoes: [c ? { texto: "Excluir", classe: "btn-perigo-fantasma", fn: (e, fechar) => acao(e.currentTarget, async () => (await confirmar("Excluir este comunicado?", { perigo: true })) && (await del(`/comunicados/${c.id}`), fechar(), desenhar())) } : null, { texto: c ? "Salvar" : "Publicar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (c ? await put(`/comunicados/${c.id}`, f.ler()) : await post("/comunicados", f.ler()), fechar(), desenhar())) }].filter(Boolean),
  });
}

async function leituras(c) {
  if (!ctxAtual.pode("admin", "rh")) return;
  const l = await get(`/comunicados/${c.id}/leituras`);
  janela({ titulo: `Leituras · ${c.titulo}`, conteudo: h("ul", { class: "lista-simples" }, l.map((x) => h("li", {}, x.lido_em ? `✅ ${x.nome} · ${dataHora(x.lido_em)}` : `⏳ ${x.nome}`))) });
}
