/* Contatos (CRM) e funil de vendas em quadro (kanban), com importação e exportação. */

import { get, post, put } from "../api.js";
import { abas, acao, area, aviso, avatar, campo, debounce, entrada, erro, ETAPA_ROTULO, h, icone, janela, limpar, numero, quandoRelativo, reais, seletor, telefone, vazio } from "../ui.js";

let ctxApp;
const estado = { visao: "lista", busca: "", tag: "", etapa: "", pagina: 0 };

export async function render(raiz, ctx) {
  ctxApp = ctx;
  const q = new URLSearchParams(location.hash.split("?")[1] ?? "");
  if (q.get("etapa")) estado.etapa = q.get("etapa");
  const corpo = h("div");
  const topo = h("div");
  const desenharTopo = () =>
    limpar(
      topo,
      abas(
        [
          ["lista", "Lista", "contatos"],
          ["funil", "Funil", "grafico"],
        ],
        estado.visao,
        (v) => {
          estado.visao = v;
          desenharTopo();
          carregar(corpo);
        },
      ),
    );
  desenharTopo();
  raiz.append(
    h(
      "div",
      { class: "pagina" },
      h(
        "header",
        { class: "pagina-topo" },
        h("div", {}, h("h1", {}, "Contatos e funil"), h("p", { class: "suave" }, "A IA preenche o CRM sozinha durante as conversas.")),
        h(
          "div",
          { class: "acoes-topo" },
          h("a", { class: "btn btn-fantasma", href: "/api/contatos/exportar", download: "contatos.csv" }, icone("download", 16), "Exportar"),
          ["dono", "admin"].includes(ctx.eu.usuario.papel) ? h("button", { class: "btn", onclick: () => importar(() => carregar(corpo)) }, icone("upload", 16), "Importar CSV") : null,
        ),
      ),
      topo,
      corpo,
    ),
  );
  await carregar(corpo);
}

async function carregar(corpo) {
  if (estado.visao === "funil") return funil(corpo);
  const tags = await get("/tags").catch(() => []);
  const busca = entrada({ type: "search", placeholder: "Buscar por nome, número ou e-mail", value: estado.busca, oninput: debounce((e) => ((estado.busca = e.target.value), (estado.pagina = 0), tabela()), 300) });
  const filtroTag = seletor([["", "Todas as etiquetas"], ...tags.map((t) => [t.tag, `${t.tag} (${t.n})`])], estado.tag, { onchange: (e) => ((estado.tag = e.target.value), (estado.pagina = 0), tabela()) });
  const filtroEtapa = seletor([["", "Todas as etapas"], ...ctxApp.eu.etapas.map((e) => [e, ETAPA_ROTULO[e]])], estado.etapa, { onchange: (e) => ((estado.etapa = e.target.value), (estado.pagina = 0), tabela()) });
  const area2 = h("div");
  limpar(corpo, h("section", { class: "cartao" }, h("div", { class: "filtros-linha" }, busca, filtroTag, filtroEtapa), area2));

  async function tabela() {
    const q = new URLSearchParams({ pagina: estado.pagina });
    if (estado.busca) q.set("busca", estado.busca);
    if (estado.tag) q.set("tag", estado.tag);
    if (estado.etapa) q.set("etapa", estado.etapa);
    const { total, itens } = await get(`/contatos?${q}`).catch((e) => (erro(e), { total: 0, itens: [] }));
    if (!itens.length) return limpar(area2, vazio("contatos", "Nenhum contato", "Os contatos chegam sozinhos pelo WhatsApp, ou importe uma planilha."));
    limpar(
      area2,
      h(
        "div",
        { class: "tabela-rolagem" },
        h(
          "table",
          { class: "tabela" },
          h("thead", {}, h("tr", {}, ["Cliente", "Etapa", "Temperatura", "Etiquetas", "Valor", "Último contato"].map((t) => h("th", {}, t)))),
          h(
            "tbody",
            {},
            itens.map((c) =>
              h(
                "tr",
                { class: "clicavel", onclick: () => detalhes(c.id, tabela) },
                h("td", {}, h("div", { class: "celula-pessoa" }, avatar(c.nome || c.nome_perfil, c.id, 32), h("div", {}, h("strong", {}, c.nome || c.nome_perfil || "Sem nome"), h("small", {}, telefone(c.wa_id))))),
                h("td", {}, h("span", { class: `chip etapa-${c.etapa}` }, ETAPA_ROTULO[c.etapa])),
                h("td", {}, h("div", { class: "mini-termometro", title: `${c.pontuacao}/100` }, h("span", { style: { width: `${c.pontuacao}%` } })), h("small", {}, c.pontuacao)),
                h("td", {}, c.tags.slice(0, 3).map((t) => h("span", { class: "tag" }, t)), c.opt_out ? h("span", { class: "chip chip-perigo" }, "sem campanhas") : null),
                h("td", {}, c.valor_estimado ? reais(c.valor_estimado) : "—"),
                h("td", {}, quandoRelativo(c.ultima_entrada_em) || "—"),
              ),
            ),
          ),
        ),
      ),
      h(
        "div",
        { class: "paginacao" },
        h("small", { class: "suave" }, `${numero(total)} contatos`),
        h("button", { class: "btn btn-pequeno", disabled: estado.pagina === 0, onclick: () => (estado.pagina--, tabela()) }, "Anterior"),
        h("button", { class: "btn btn-pequeno", disabled: (estado.pagina + 1) * 50 >= total, onclick: () => (estado.pagina++, tabela()) }, "Próxima"),
      ),
    );
  }
  await tabela();
}

async function funil(corpo) {
  const colunas = await Promise.all(ctxApp.eu.etapas.map(async (e) => [e, await get(`/contatos?etapa=${e}`)]));
  let arrastando = null;
  limpar(
    corpo,
    h(
      "div",
      { class: "kanban" },
      colunas.map(([etapa, { total, itens }]) =>
        h(
          "section",
          {
            class: `kanban-coluna etapa-${etapa}`,
            ondragover: (e) => (e.preventDefault(), e.currentTarget.classList.add("sobre")),
            ondragleave: (e) => e.currentTarget.classList.remove("sobre"),
            ondrop: async (e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("sobre");
              if (!arrastando || arrastando.etapa === etapa) return;
              await put(`/contatos/${arrastando.id}`, { etapa }).catch(erro);
              funil(corpo);
            },
          },
          h("header", {}, h("strong", {}, ETAPA_ROTULO[etapa]), h("span", { class: "filtro-n" }, total), h("small", {}, reais(itens.reduce((s, c) => s + (c.valor_estimado ?? 0), 0)))),
          h(
            "div",
            { class: "kanban-cartoes" },
            itens.map((c) =>
              h(
                "article",
                { class: "kanban-cartao", draggable: "true", ondragstart: () => (arrastando = c), onclick: () => detalhes(c.id, () => funil(corpo)) },
                h("div", { class: "celula-pessoa" }, avatar(c.nome || c.nome_perfil, c.id, 28), h("strong", {}, c.nome || c.nome_perfil || telefone(c.wa_id))),
                c.campos?.interesse ? h("p", {}, c.campos.interesse) : null,
                h("div", { class: "linha-entre" }, h("small", {}, c.valor_estimado ? reais(c.valor_estimado) : ""), c.pontuacao ? h("span", { class: `chip ${c.pontuacao >= 70 ? "chip-fogo" : ""}` }, c.pontuacao >= 70 ? "🔥 " : "", c.pontuacao) : null),
              ),
            ),
            total > itens.length ? h("small", { class: "suave centro" }, `+${total - itens.length} contatos`) : null,
          ),
        ),
      ),
    ),
    h("p", { class: "suave pequeno" }, "Arraste os cartões entre as colunas. A IA avança os clientes no funil automaticamente conforme a conversa."),
  );
}

async function detalhes(id, depois) {
  const { contato: c, conversas, agendamentos } = await get(`/contatos/${id}`);
  const nome = entrada({ value: c.nome ?? "", placeholder: c.nome_perfil ?? "" });
  const email = entrada({ type: "email", value: c.email ?? "" });
  const etapa = seletor(ctxApp.eu.etapas.map((e) => [e, ETAPA_ROTULO[e]]), c.etapa);
  const valor = entrada({ type: "number", min: 0, step: "0.01", value: c.valor_estimado ? c.valor_estimado / 100 : "" });
  const tags = entrada({ value: c.tags.join(", "), placeholder: "separadas por vírgula" });
  const optOut = h("input", { type: "checkbox", checked: c.opt_out });
  janela({
    titulo: c.nome || c.nome_perfil || telefone(c.wa_id),
    largura: 640,
    conteudo: h(
      "div",
      { class: "pilha" },
      h("div", { class: "celula-pessoa" }, avatar(c.nome || c.nome_perfil, c.id, 48), h("div", {}, h("strong", {}, telefone(c.wa_id)), h("small", { class: "suave" }, `Temperatura ${c.pontuacao}/100`))),
      h("div", { class: "grade-2" }, campo("Nome", nome), campo("E-mail", email)),
      h("div", { class: "grade-2" }, campo("Etapa", etapa), campo("Valor estimado (R$)", valor)),
      campo("Etiquetas", tags),
      Object.keys(c.campos).length ? h("dl", { class: "campos-crm" }, Object.entries(c.campos).map(([k, v]) => [h("dt", {}, k.replace(/_/g, " ")), h("dd", {}, v)])) : null,
      h("label", { class: "linha-check" }, optOut, "Não enviar campanhas"),
      agendamentos.length ? [h("h3", { class: "sub" }, "Agendamentos"), agendamentos.map((a) => h("div", { class: "mini-item" }, h("strong", {}, a.servico), h("small", {}, a.quando)))] : null,
      conversas.length ? [h("h3", { class: "sub" }, "Atendimentos"), conversas.map((x) => h("a", { class: "mini-item", href: `#/conversas/${x.id}` }, h("small", {}, new Date(x.criada_em).toLocaleDateString("pt-BR"), " · ", x.status), h("span", {}, x.resumo ?? "Abrir conversa")))] : null,
    ),
    acoes: [
      {
        texto: "Salvar",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            await put(`/contatos/${c.id}`, {
              nome: nome.value || null,
              email: email.value,
              etapa: etapa.value,
              valor_estimado: valor.value ? Number(valor.value) : null,
              tags: tags.value.split(",").map((t) => t.trim()).filter(Boolean),
              opt_out: optOut.checked,
            });
            fechar();
            depois?.();
          }),
      },
    ],
  });
}

function importar(depois) {
  const texto = area({ rows: 8, placeholder: "nome,whatsapp,email\nMaria Silva,34999990000,maria@email.com" });
  const arquivo = h("input", { type: "file", accept: ".csv,text/csv", onchange: async (e) => (texto.value = await e.target.files[0].text()) });
  const etiqueta = entrada({ placeholder: "Ex.: importados-novembro" });
  janela({
    titulo: "Importar contatos",
    largura: 640,
    conteudo: h(
      "div",
      { class: "pilha" },
      h("p", { class: "suave" }, "Use uma planilha CSV com uma coluna de telefone/WhatsApp (nome e e-mail são opcionais). Números sem DDI recebem o 55 do Brasil."),
      h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Arquivo CSV"), arquivo),
      texto,
      campo("Etiqueta para todos (opcional)", etiqueta, "Útil para mandar uma campanha só para este grupo."),
      h("small", { class: "suave" }, "Importante: só envie campanhas para quem autorizou receber mensagens da sua empresa (LGPD e regras da Meta)."),
    ),
    acoes: [
      {
        texto: "Importar",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            const r = await post("/contatos/importar", { csv: texto.value, etiqueta: etiqueta.value || undefined });
            fechar();
            aviso(`${r.importados} contatos importados${r.ignorados ? `, ${r.ignorados} linhas ignoradas (número inválido)` : ""}.`);
            depois();
          }),
      },
    ],
  });
}
