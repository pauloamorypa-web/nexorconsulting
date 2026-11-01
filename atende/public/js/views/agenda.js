/* Agenda: horários marcados pela IA e pela equipe, por dia, com configuração dos serviços. */

import { get, post, put } from "../api.js";
import { acao, avatar, campo, entrada, erro, h, icone, janela, limpar, seletor, telefone, vazio } from "../ui.js";

const STATUS = { confirmado: "Confirmado", cancelado: "Cancelado", concluido: "Concluído", faltou: "Faltou" };
let ctxApp;
let corpoAtual;

export async function render(raiz, ctx) {
  ctxApp = ctx;
  const corpo = h("div");
  corpoAtual = corpo;
  raiz.append(
    h(
      "div",
      { class: "pagina" },
      h(
        "header",
        { class: "pagina-topo" },
        h("div", {}, h("h1", {}, "Agenda"), h("p", { class: "suave" }, "A IA mostra os horários livres e agenda direto na conversa.")),
        h("div", { class: "acoes-topo" }, ["dono", "admin"].includes(ctx.eu.usuario.papel) ? h("a", { class: "btn btn-fantasma", href: "#/config/horarios" }, icone("config", 16), "Horários e serviços") : null, h("button", { class: "btn btn-primario", onclick: () => novo(() => desenhar(corpo)) }, icone("mais", 16), "Agendar")),
      ),
      corpo,
    ),
  );
  await desenhar(corpo);
}

export function aoEvento(tipo) {
  if (tipo === "agendamento" && corpoAtual?.isConnected) desenhar(corpoAtual);
}

async function desenhar(corpo) {
  const cfg = ctxApp.eu.empresa.config.agenda;
  const itens = await get(`/agenda?de=${Date.now() - 86400_000}&ate=${Date.now() + 45 * 86400_000}`);
  const porDia = new Map();
  for (const a of itens) {
    const dia = new Date(a.inicio).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long" });
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(a);
  }
  limpar(
    corpo,
    cfg.ativa ? null : h("section", { class: "cartao aviso-cartao" }, icone("alerta", 18), h("div", {}, h("strong", {}, "O agendamento pela IA está desligado."), h("p", {}, "Ligue em Configurações → Horários e serviços para a IA marcar horários sozinha.")), h("a", { class: "btn btn-pequeno", href: "#/config/horarios" }, "Ligar")),
    itens.length
      ? [...porDia.entries()].map(([dia, lista]) =>
          h(
            "section",
            { class: "cartao" },
            h("h2", { class: "dia-titulo" }, dia),
            h(
              "div",
              { class: "lista-itens" },
              lista.map((a) =>
                h(
                  "div",
                  { class: `item-linha agenda-item status-${a.status}` },
                  h("div", { class: "agenda-hora" }, h("strong", {}, a.quando.split(" às ")[1]), h("small", {}, `${a.duracao_min} min`)),
                  avatar(a.contato_nome || a.contato_nome_perfil || "?", a.contato_id ?? a.id, 36),
                  h("div", { class: "item-texto" }, h("strong", {}, a.servico), h("p", {}, a.contato_nome || a.contato_nome_perfil || "Sem cliente", a.contato_wa_id ? ` · ${telefone(a.contato_wa_id)}` : ""), a.observacoes ? h("small", { class: "suave" }, a.observacoes) : null, h("small", { class: "suave" }, a.criado_por === "ia" ? "🤖 agendado pela IA" : "👤 agendado pela equipe")),
                  seletor(Object.entries(STATUS), a.status, { class: "entrada entrada-pequena", "aria-label": "Situação", onchange: (e) => put(`/agenda/${a.id}`, { status: e.target.value }).then(() => desenhar(corpo), erro) }),
                ),
              ),
            ),
          ),
        )
      : h("section", { class: "cartao" }, vazio("agenda", "Nenhum agendamento", "Os horários marcados pela IA ou pela equipe aparecem aqui.")),
  );
}

async function novo(depois) {
  const servicos = ctxApp.eu.empresa.config.agenda.servicos;
  const servico = seletor(servicos.map((s) => [s.nome, `${s.nome} (${s.duracao} min)`]), servicos[0]?.nome);
  const data = entrada({ type: "date", value: new Date().toISOString().slice(0, 10) });
  const horarios = h("div", { class: "nuvem" });
  const busca = entrada({ type: "search", placeholder: "Buscar cliente pelo nome ou número" });
  const resultados = h("div", { class: "lista-mini" });
  const obs = entrada({ placeholder: "Opcional" });
  let escolhido = null;
  let contato = null;

  const carregarHorarios = async () => {
    const livres = await get(`/agenda/livres?servico=${encodeURIComponent(servico.value)}&data=${data.value}`).catch(() => []);
    escolhido = null;
    limpar(
      horarios,
      livres.length
        ? livres.slice(0, 24).map((l) => {
            const b = h("button", { class: "chip clicavel", type: "button", onclick: () => ((escolhido = l.horario), horarios.querySelectorAll("button").forEach((x) => x.classList.remove("ativo")), b.classList.add("ativo")) }, l.texto);
            return b;
          })
        : h("small", { class: "suave" }, "Sem horários livres a partir desta data."),
    );
  };
  busca.addEventListener("input", async () => {
    if (busca.value.length < 2) return limpar(resultados);
    const { itens } = await get(`/contatos?busca=${encodeURIComponent(busca.value)}`);
    limpar(
      resultados,
      itens.slice(0, 5).map((c) =>
        h(
          "button",
          { class: "mini-conversa", type: "button", onclick: () => ((contato = c), (busca.value = c.nome || c.nome_perfil || c.wa_id), limpar(resultados)) },
          avatar(c.nome || c.nome_perfil, c.id, 28),
          h("div", {}, h("strong", {}, c.nome || c.nome_perfil || "Sem nome"), h("small", {}, telefone(c.wa_id))),
        ),
      ),
    );
  });
  servico.addEventListener("change", carregarHorarios);
  data.addEventListener("change", carregarHorarios);
  carregarHorarios();
  janela({
    titulo: "Novo agendamento",
    largura: 620,
    conteudo: h("div", { class: "pilha" }, h("div", { class: "grade-2" }, campo("Serviço", servico), campo("A partir de", data)), h("div", {}, h("span", { class: "campo-rotulo" }, "Horário"), horarios), campo("Cliente", busca), resultados, campo("Observações", obs)),
    acoes: [
      {
        texto: "Agendar",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            if (!escolhido) throw new Error("Escolha um horário.");
            await post("/agenda", { horario: escolhido, servico: servico.value, contato_id: contato?.id, observacoes: obs.value || undefined });
            fechar();
            depois();
          }),
      },
    ],
  });
}
