/* Campanhas (disparos com modelos aprovados) e modelos de mensagem da Meta. */

import { del, get, post } from "../api.js";
import { abas, acao, area, aviso, campo, confirmar, dataHora, entrada, erro, ETAPA_ROTULO, h, icone, janela, limpar, numero, seletor, textoWhatsApp, vazio } from "../ui.js";

let ctxApp;
let aba = "campanhas";
let corpoAtual;

const STATUS_MODELO = { APPROVED: ["Aprovado", "ok"], PENDING: ["Em análise", "alerta"], REJECTED: ["Reprovado", "perigo"], PAUSED: ["Pausado", "alerta"], DISABLED: ["Desativado", "perigo"] };
const STATUS_CAMP = { rascunho: "Rascunho", agendada: "Agendada", enviando: "Enviando", concluida: "Concluída", cancelada: "Cancelada" };
const admin = () => ["dono", "admin"].includes(ctxApp.eu.usuario.papel);

export async function render(raiz, ctx, [abaInicial]) {
  ctxApp = ctx;
  if (abaInicial) aba = abaInicial;
  const topo = h("div");
  corpoAtual = h("div");
  const trocar = (id) => {
    aba = id;
    history.replaceState(null, "", `#/campanhas/${id}`);
    limpar(
      topo,
      abas(
        [
          ["campanhas", "Campanhas", "campanhas"],
          ["modelos", "Modelos de mensagem", "nota"],
        ],
        id,
        trocar,
      ),
    );
    (id === "modelos" ? modelos : campanhas)(corpoAtual).catch(erro);
  };
  raiz.append(h("div", { class: "pagina" }, h("header", { class: "pagina-topo" }, h("div", {}, h("h1", {}, "Campanhas"), h("p", { class: "suave" }, "Dispare mensagens aprovadas pela Meta. Quem responde é atendido na hora pela IA."))), topo, corpoAtual));
  trocar(aba);
}

export function aoEvento(tipo) {
  if (tipo === "campanha" && aba === "campanhas" && corpoAtual?.isConnected) campanhas(corpoAtual);
  if (tipo === "modelo" && aba === "modelos" && corpoAtual?.isConnected) modelos(corpoAtual);
}

/* ---------- Campanhas ---------- */

async function campanhas(alvo) {
  const lista = await get("/campanhas");
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  limpar(
    alvo,
    h(
      "section",
      { class: "cartao" },
      h("div", { class: "linha-entre" }, h("h2", {}, "Suas campanhas"), admin() ? h("button", { class: "btn btn-primario", onclick: () => novaCampanha(() => campanhas(alvo)) }, icone("mais", 16), "Nova campanha") : null),
      lista.length
        ? h(
            "div",
            { class: "lista-itens" },
            lista.map((c) =>
              h(
                "div",
                { class: "item-linha campanha" },
                h(
                  "div",
                  { class: "item-texto" },
                  h("strong", {}, c.nome),
                  h("small", { class: "suave" }, `Modelo ${c.modelo_nome} · ${STATUS_CAMP[c.status]}`, c.agendada_para && c.status === "agendada" ? ` para ${dataHora(c.agendada_para)}` : "", c.concluida_em ? ` · ${dataHora(c.concluida_em)}` : ""),
                  c.total
                    ? h(
                        "div",
                        { class: "funil-campanha" },
                        [
                          ["Público", c.total],
                          ["Enviadas", c.enviados],
                          ["Entregues", c.entregues, pct(c.entregues, c.enviados)],
                          ["Lidas", c.lidos, pct(c.lidos, c.entregues)],
                          ["Responderam", c.respondidos, pct(c.respondidos, c.entregues)],
                          ["Falhas", c.falhas],
                        ].map(([r, n, p]) => h("div", {}, h("small", {}, r), h("strong", {}, numero(n)), p ? h("span", { class: "suave pequeno" }, p) : null)),
                      )
                    : null,
                  c.status === "enviando" && c.total ? h("div", { class: "progresso" }, h("span", { style: { width: `${((c.enviados + c.falhas) / c.total) * 100}%` } })) : null,
                ),
                admin()
                  ? h(
                      "div",
                      { class: "item-acoes" },
                      c.status === "rascunho" ? h("button", { class: "btn btn-pequeno btn-primario", onclick: (e) => acao(e.currentTarget, async () => (await post(`/campanhas/${c.id}/iniciar`), campanhas(alvo))) }, "Iniciar") : null,
                      ["rascunho", "agendada", "enviando"].includes(c.status)
                        ? h("button", { class: "btn btn-pequeno btn-perigo-fantasma", onclick: async () => (await confirmar(`Cancelar a campanha "${c.nome}"?`, { perigo: true, botao: "Cancelar campanha" })) && post(`/campanhas/${c.id}/cancelar`).then(() => campanhas(alvo), erro) }, "Cancelar")
                        : null,
                    )
                  : null,
              ),
            ),
          )
        : vazio("campanhas", "Nenhuma campanha ainda", "Reative clientes, avise promoções ou lembre de um retorno. A IA atende quem responder."),
    ),
    h(
      "section",
      { class: "cartao dicas" },
      h("h2", {}, "Boas práticas"),
      h(
        "ul",
        {},
        h("li", {}, "Envie só para quem autorizou receber mensagens (LGPD e regras da Meta)."),
        h("li", {}, "Personalize com o nome do cliente e seja breve: campanhas genéricas viram denúncia e a Meta reduz seu limite de envio."),
        h("li", {}, "Quem responder \"parar\" sai automaticamente da lista."),
        h("li", {}, "A Meta cobra por mensagem de modelo entregue (marketing custa mais que utilidade)."),
      ),
    ),
  );
}

async function novaCampanha(depois) {
  const lista = (await get("/modelos")).filter((m) => m.status === "APPROVED");
  if (!lista.length) return aviso("Você precisa de um modelo aprovado pela Meta. Crie na aba Modelos de mensagem.", "info", 7000);
  const tags = await get("/tags");
  const nome = entrada({ placeholder: "Ex.: Promoção Black Friday" });
  const modelo = seletor(lista.map((m, i) => [i, `${m.nome} (${m.idioma}) · ${m.categoria === "MARKETING" ? "marketing" : "utilidade"}`]), 0);
  const varsArea = h("div", { class: "pilha" });
  const previa = h("div", { class: "previa-whats" });
  let vars = [];
  const etiquetas = tags.map((t) => [t.tag, h("input", { type: "checkbox" })]);
  const etapas = ctxApp.eu.etapas.map((e) => [e, h("input", { type: "checkbox" })]);
  const publico = h("strong", {}, "…");
  const quando = seletor(
    [
      ["agora", "Enviar agora"],
      ["agendar", "Agendar"],
      ["rascunho", "Salvar como rascunho"],
    ],
    "agora",
  );
  const dataHoraEntrada = entrada({ type: "datetime-local", hidden: true });
  const cabecalho = entrada({ type: "url", placeholder: "https://... (se o modelo tiver imagem no cabeçalho)" });

  const filtro = () => ({ tags: etiquetas.filter(([, c]) => c.checked).map(([t]) => t), etapas: etapas.filter(([, c]) => c.checked).map(([e]) => e) });
  const contar = async () => {
    const r = await post("/campanhas/publico", filtro()).catch(() => ({ total: 0 }));
    publico.textContent = `${numero(r.total)} contatos`;
  };
  const montarVars = () => {
    const m = lista[modelo.value];
    vars = Array.from({ length: m.variaveis }, (_, i) => entrada({ value: i === 0 ? "{primeiro_nome}" : "", placeholder: `Valor de {{${i + 1}}}` }));
    const corpo = m.componentes.find((c) => c.type === "BODY")?.text ?? "";
    const atualizar = () => limpar(previa, textoWhatsApp(corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => (vars[n - 1]?.value || `{{${n}}}`).replace("{primeiro_nome}", "Maria").replace("{nome}", "Maria Silva"))));
    vars.forEach((v) => v.addEventListener("input", atualizar));
    atualizar();
    limpar(varsArea, vars.length ? vars.map((v, i) => campo(`Variável {{${i + 1}}}`, v)) : null, vars.length ? h("small", { class: "suave" }, "Use {primeiro_nome}, {nome}, {telefone}, {email} ou {campo:cidade} para personalizar.") : null);
  };
  modelo.addEventListener("change", montarVars);
  quando.addEventListener("change", () => (dataHoraEntrada.hidden = quando.value !== "agendar"));
  [...etiquetas, ...etapas].forEach(([, c]) => c.addEventListener("change", contar));
  montarVars();
  contar();

  janela({
    titulo: "Nova campanha",
    largura: 760,
    conteudo: h(
      "div",
      { class: "grade-2 topo" },
      h(
        "div",
        { class: "pilha" },
        campo("Nome da campanha", nome),
        campo("Modelo aprovado", modelo),
        varsArea,
        campo("Imagem do cabeçalho", cabecalho),
        h("div", {}, h("span", { class: "campo-rotulo" }, "Público"), h("p", { class: "suave pequeno" }, "Sem filtros = todos os contatos que aceitam campanhas."), tags.length ? h("div", { class: "nuvem" }, etiquetas.map(([t, c]) => h("label", { class: "chip clicavel" }, c, t))) : null, h("div", { class: "nuvem" }, etapas.map(([e, c]) => h("label", { class: "chip clicavel" }, c, ETAPA_ROTULO[e]))), h("p", {}, "Vai para: ", publico)),
        campo("Quando", quando),
        dataHoraEntrada,
      ),
      h("div", {}, h("span", { class: "campo-rotulo" }, "Prévia"), h("div", { class: "celular-previa" }, previa)),
    ),
    acoes: [
      {
        texto: "Criar campanha",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            const m = lista[modelo.value];
            const agendada = quando.value === "agendar" && dataHoraEntrada.value ? new Date(`${dataHoraEntrada.value}:00-03:00`).getTime() : undefined;
            if (quando.value === "agendar" && !agendada) throw new Error("Escolha a data e a hora.");
            if (quando.value === "agora" && !(await confirmar(`Enviar agora para ${publico.textContent}?`, { botao: "Enviar" }))) return;
            await post("/campanhas", {
              nome: nome.value || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
              modelo_nome: m.nome,
              idioma: m.idioma,
              variaveis: vars.map((v) => v.value),
              filtro: { ...filtro(), ...(cabecalho.value ? { cabecalho_midia: cabecalho.value } : {}) },
              enviar_agora: quando.value === "agora",
              agendada_para: agendada,
            });
            fechar();
            aviso(quando.value === "agora" ? "Campanha iniciada! Acompanhe os números aqui." : "Campanha salva.");
            depois();
          }),
      },
    ],
  });
}

/* ---------- Modelos ---------- */

async function modelos(alvo) {
  const lista = await get("/modelos");
  limpar(
    alvo,
    h(
      "section",
      { class: "cartao" },
      h(
        "div",
        { class: "linha-entre" },
        h("div", {}, h("h2", {}, "Modelos de mensagem"), h("p", { class: "suave" }, "Obrigatórios para falar com clientes depois de 24 horas sem resposta e para campanhas. A Meta analisa cada modelo.")),
        h(
          "div",
          { class: "acoes-topo" },
          h("button", { class: "btn", onclick: (e) => acao(e.currentTarget, async () => (await post("/modelos/sincronizar"), modelos(alvo), aviso("Modelos atualizados com a Meta."))) }, "Sincronizar"),
          admin() ? h("button", { class: "btn btn-primario", onclick: () => novoModelo(() => modelos(alvo)) }, icone("mais", 16), "Novo modelo") : null,
        ),
      ),
      lista.length
        ? h(
            "div",
            { class: "grade-modelos" },
            lista.map((m) => {
              const [rotulo, tipo] = STATUS_MODELO[m.status] ?? [m.status, "alerta"];
              const corpo = m.componentes.find((c) => c.type === "BODY")?.text ?? "";
              return h(
                "article",
                { class: "modelo" },
                h("div", { class: "linha-entre" }, h("strong", {}, m.nome), h("span", { class: `chip chip-${tipo}` }, rotulo)),
                h("small", { class: "suave" }, `${m.idioma} · ${{ MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação" }[m.categoria] ?? m.categoria}`),
                h("div", { class: "previa-whats" }, textoWhatsApp(corpo)),
                admin() ? h("button", { class: "btn-link perigo pequeno", onclick: async () => (await confirmar(`Excluir o modelo ${m.nome} na Meta?`, { perigo: true, botao: "Excluir" })) && del(`/modelos/${encodeURIComponent(m.nome)}`).then(() => modelos(alvo), erro) }, "Excluir") : null,
              );
            }),
          )
        : vazio("nota", "Nenhum modelo", "Crie seu primeiro modelo, ou clique em Sincronizar se você já tem modelos no Gerenciador do WhatsApp."),
    ),
  );
}

function novoModelo(depois) {
  const objetivo = entrada({ placeholder: "Ex.: lembrar clientes que não voltam há 60 dias, com 10% de desconto" });
  const categoria = seletor(
    [
      ["MARKETING", "Marketing (promoções, novidades, reativação)"],
      ["UTILITY", "Utilidade (confirmações, lembretes, atualizações de pedido)"],
    ],
    "MARKETING",
  );
  const nome = entrada({ placeholder: "ex.: promocao_retorno", pattern: "[a-z0-9_]+" });
  const cabecalho = entrada({ maxlength: 60, placeholder: "Opcional" });
  const corpo = area({ rows: 6, maxlength: 1024, placeholder: "Olá {{1}}! Sentimos sua falta..." });
  const rodape = entrada({ maxlength: 60, placeholder: "Opcional. Ex.: Responda PARAR para sair" });
  const exemplos = entrada({ placeholder: "Exemplos das variáveis, separados por |  Ex.: Maria|10%" });
  const botoes = entrada({ placeholder: "Botões de resposta rápida, separados por |  Ex.: Quero aproveitar|Agora não" });
  const previa = h("div", { class: "previa-whats" });
  const atualizar = () => {
    const ex = exemplos.value.split("|");
    limpar(previa, cabecalho.value ? h("strong", {}, cabecalho.value, h("br")) : null, textoWhatsApp(corpo.value.replace(/\{\{(\d+)\}\}/g, (_, n) => ex[n - 1]?.trim() || `{{${n}}}`)), rodape.value ? h("small", { class: "suave" }, h("br"), rodape.value) : null);
  };
  [cabecalho, corpo, rodape, exemplos].forEach((x) => x.addEventListener("input", atualizar));
  const sugerir = h("button", {
    class: "btn btn-chip-ia",
    type: "button",
    onclick: (e) =>
      acao(e.currentTarget, async () => {
        if (!objetivo.value.trim()) throw new Error("Descreva o objetivo do modelo.");
        const r = await post("/modelos/sugerir", { objetivo: objetivo.value, categoria: categoria.value });
        nome.value = r.nome.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 60);
        corpo.value = r.corpo;
        rodape.value = r.rodape ?? "";
        exemplos.value = r.exemplos.join("|");
        atualizar();
      }),
  });
  sugerir.append(icone("magica", 15), "Escrever com IA");
  janela({
    titulo: "Novo modelo de mensagem",
    largura: 820,
    conteudo: h(
      "div",
      { class: "grade-2 topo" },
      h(
        "div",
        { class: "pilha" },
        h("div", { class: "destaque-ia pilha cartao-interno" }, campo("O que você quer comunicar?", objetivo), h("div", { class: "linha-entre" }, categoria, sugerir)),
        campo("Nome (só letras minúsculas, números e _)", nome),
        campo("Cabeçalho", cabecalho),
        campo("Texto", corpo, "Use {{1}}, {{2}}... para dados do cliente. Não comece nem termine com variável."),
        campo("Exemplos das variáveis", exemplos, "A Meta exige um exemplo para cada variável."),
        campo("Rodapé", rodape),
        campo("Botões", botoes),
      ),
      h("div", {}, h("span", { class: "campo-rotulo" }, "Prévia"), h("div", { class: "celular-previa" }, previa), h("p", { class: "suave pequeno" }, "A análise da Meta costuma levar de alguns minutos a 24 horas. Você recebe um aviso aqui quando sair.")),
    ),
    acoes: [
      {
        texto: "Enviar para aprovação",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            await post("/modelos", {
              nome: nome.value.trim(),
              idioma: "pt_BR",
              categoria: categoria.value,
              cabecalho: cabecalho.value || undefined,
              corpo: corpo.value,
              rodape: rodape.value || undefined,
              exemplos: exemplos.value ? exemplos.value.split("|").map((x) => x.trim()) : [],
              botoes: botoes.value
                ? botoes.value
                    .split("|")
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((t) => ({ tipo: "QUICK_REPLY", texto: t }))
                : [],
            });
            fechar();
            aviso("Modelo enviado para a Meta. Você será avisado quando for aprovado.");
            depois();
          }),
      },
    ],
  });
}
