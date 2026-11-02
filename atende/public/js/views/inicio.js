/* Início: guia de configuração, indicadores, gráficos e o que precisa de atenção agora. */

import { get } from "../api.js";
import { avatar, duracao, ETAPA_ROTULO, h, icone, limpar, numero, quandoRelativo, reais, telefone, vazio } from "../ui.js";

let raizAtual;
let ctxAtual;
let dias = 7;

export async function render(raiz, ctx) {
  raizAtual = raiz;
  ctxAtual = ctx;
  await desenhar();
}

export function aoEvento(tipo) {
  if (["alerta", "agendamento"].includes(tipo) && raizAtual?.isConnected) desenhar();
}

function passo(feito, titulo, texto, rota, botao) {
  return h(
    "li",
    { class: `passo ${feito ? "feito" : ""}` },
    h("span", { class: "passo-marca" }, feito ? icone("check", 14) : null),
    h("div", {}, h("strong", {}, titulo), h("p", {}, texto)),
    feito ? null : h("a", { class: "btn btn-pequeno", href: `#/${rota}` }, botao),
  );
}

function indicador(ic, rotulo, valor, detalhe, cor) {
  return h("div", { class: "indicador", style: cor ? { "--cor": cor } : null }, h("span", { class: "indicador-ic" }, icone(ic, 18)), h("small", {}, rotulo), h("strong", {}, valor), detalhe ? h("span", { class: "indicador-det" }, detalhe) : null);
}

/** Barras empilhadas por dia: IA x equipe, com rótulos de eixo */
function graficoDias(porDia, nDias) {
  const mapa = Object.fromEntries(porDia.map((d) => [d.dia, d]));
  const lista = [];
  for (let i = nDias - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000 - 3 * 3600_000).toISOString().slice(0, 10);
    lista.push({ dia: d, ia: mapa[d]?.ia ?? 0, humano: mapa[d]?.humano ?? 0, recebidas: mapa[d]?.recebidas ?? 0 });
  }
  const max = Math.max(1, ...lista.map((d) => d.ia + d.humano));
  const mostrarRotulo = (i) => nDias <= 14 || i % Math.ceil(nDias / 10) === 0;
  return h(
    "div",
    { class: "grafico-barras", role: "img", "aria-label": "Mensagens respondidas por dia, pela IA e pela equipe" },
    lista.map((d, i) =>
      h(
        "div",
        { class: "barra-col", title: `${d.dia.slice(8)}/${d.dia.slice(5, 7)}: ${d.ia} pela IA, ${d.humano} pela equipe, ${d.recebidas} recebidas` },
        h("div", { class: "barra-pilha" }, h("span", { class: "barra barra-humano", style: { height: `${(d.humano / max) * 100}%` } }), h("span", { class: "barra barra-ia", style: { height: `${(d.ia / max) * 100}%` } })),
        h("small", {}, mostrarRotulo(i) ? `${d.dia.slice(8)}/${d.dia.slice(5, 7)}` : ""),
      ),
    ),
  );
}

function mapaHoras(porHora) {
  const n = Object.fromEntries(porHora.map((x) => [x.hora, x.n]));
  const max = Math.max(1, ...Object.values(n));
  return h(
    "div",
    { class: "mapa-horas", role: "img", "aria-label": "Mensagens recebidas por hora do dia" },
    Array.from({ length: 24 }, (_, hr) => h("div", { class: "hora-celula", style: { "--int": (n[hr] ?? 0) / max }, title: `${hr}h: ${n[hr] ?? 0} mensagens` }, h("small", {}, hr % 3 === 0 ? `${hr}h` : ""))),
  );
}

function funil(dados) {
  const etapas = ctxAtual.eu.etapas.filter((e) => e !== "perdido");
  const mapa = Object.fromEntries(dados.map((d) => [d.etapa, d]));
  const max = Math.max(1, ...etapas.map((e) => mapa[e]?.n ?? 0));
  return h(
    "div",
    { class: "funil" },
    etapas.map((e) =>
      h(
        "a",
        { class: "funil-linha", href: `#/contatos?etapa=${e}` },
        h("span", { class: "funil-rotulo" }, ETAPA_ROTULO[e]),
        h("span", { class: "funil-barra" }, h("span", { style: { width: `${((mapa[e]?.n ?? 0) / max) * 100}%` } })),
        h("strong", {}, numero(mapa[e]?.n ?? 0)),
        h("small", {}, mapa[e]?.valor ? reais(mapa[e].valor) : ""),
      ),
    ),
  );
}

async function desenhar() {
  const [m, eu] = await Promise.all([get(`/metricas?dias=${dias}`), ctxAtual.recarregarEu()]);
  const ck = eu.checklist;
  const passos = [ck.whatsapp, ck.sobre, ck.conhecimento, ck.testado];
  const feitos = passos.filter(Boolean).length;
  const c = m.conversas;
  const taxaIA = c.resolvidas ? Math.round(((c.resolvidas_ia ?? 0) / c.resolvidas) * 100) : 0;
  const sent = (c.positivo ?? 0) + (c.neutro ?? 0) + (c.negativo ?? 0);
  const primeiroNome = eu.usuario.nome.split(" ")[0];
  const horaAgora = Number(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
  const saudacao = horaAgora < 12 ? "Bom dia" : horaAgora < 18 ? "Boa tarde" : "Boa noite";
  const modo = eu.empresa.config.agente.modo;

  limpar(
    raizAtual,
    h(
      "div",
      { class: "pagina" },
      h(
        "header",
        { class: "pagina-topo" },
        h("div", {}, h("h1", {}, `${saudacao}, ${primeiroNome}!`), h("p", { class: "suave" }, modo === "automatico" ? `A ${eu.empresa.config.agente.nome} está atendendo no automático.` : modo === "copiloto" ? `A ${eu.empresa.config.agente.nome} está no modo copiloto: ela sugere e a equipe aprova.` : "A IA está desligada.")),
        h(
          "div",
          { class: "segmentado" },
          [7, 30, 90].map((d) =>
            h(
              "button",
              {
                class: d === dias ? "ativo" : "",
                onclick: () => {
                  dias = d;
                  desenhar();
                },
              },
              `${d} dias`,
            ),
          ),
        ),
      ),
      feitos < passos.length
        ? h(
            "section",
            { class: "cartao guia" },
            h("div", { class: "guia-topo" }, h("div", {}, h("h2", {}, "Coloque sua IA para atender"), h("p", { class: "suave" }, `${feitos} de ${passos.length} passos concluídos`)), h("div", { class: "progresso" }, h("span", { style: { width: `${(feitos / passos.length) * 100}%` } }))),
            h(
              "ol",
              { class: "passos" },
              passo(ck.whatsapp, "Conectar o WhatsApp", "Ligue seu número pela API oficial da Meta.", "config/whatsapp", "Conectar"),
              passo(ck.sobre, "Contar sobre a empresa", "O que vocês fazem, como atendem, horários e regras.", "ia/perfil", "Preencher"),
              passo(ck.conhecimento, "Ensinar as perguntas frequentes", "Preços, prazos, políticas. Cole um texto e a IA organiza.", "ia/conhecimento", "Ensinar"),
              passo(ck.testado, "Testar no simulador", "Converse com a IA como se fosse um cliente.", "ia/simulador", "Testar"),
            ),
          )
        : null,
      h(
        "section",
        { class: "indicadores" },
        indicador("conversas", "Conversas", numero(c.total), `${numero(m.novosContatos)} contatos novos`),
        indicador("robo", "Respostas pela IA", `${m.automacao}%`, `${numero(m.mensagens.pela_ia)} mensagens`, "var(--azul)"),
        indicador("check", "Resolvidas pela IA", `${taxaIA}%`, `${numero(c.resolvidas_ia)} de ${numero(c.resolvidas)} resolvidas`, "var(--verde)"),
        indicador("relogio", "1ª resposta (média)", duracao(c.primeira_resposta_ms), "do cliente até a resposta"),
        indicador("raio", "Horas economizadas", numero(m.horas_economizadas), "estimativa: 3 min por resposta", "var(--violeta)"),
        indicador("agenda", "Agendamentos", numero(m.agendamentos), "feitos no período"),
      ),
      h(
        "div",
        { class: "grade-painel" },
        h(
          "section",
          { class: "cartao largo" },
          h("div", { class: "cartao-topo" }, h("h2", {}, "Mensagens respondidas"), h("div", { class: "legenda" }, h("span", { class: "leg-ia" }, "IA"), h("span", { class: "leg-humano" }, "Equipe"))),
          graficoDias(m.porDia, dias),
        ),
        h(
          "section",
          { class: "cartao" },
          h("div", { class: "cartao-topo" }, h("h2", {}, "Precisa de você"), h("a", { href: "#/conversas", class: "btn-link" }, "Ver todas")),
          m.atencao.length
            ? h(
                "div",
                { class: "lista-mini" },
                m.atencao.map((x) =>
                  h(
                    "a",
                    { class: "mini-conversa", href: `#/conversas/${x.id}` },
                    avatar(x.contato_nome || x.contato_nome_perfil, x.contato_id, 34),
                    h("div", {}, h("strong", {}, x.contato_nome || x.contato_nome_perfil || telefone(x.contato_wa_id)), h("small", {}, x.resumo ?? x.ultima_mensagem ?? "")),
                    h("time", {}, quandoRelativo(x.ultima_msg_em)),
                  ),
                ),
              )
            : vazio("check", "Tudo em dia", "Nenhum cliente esperando pela equipe."),
        ),
        h(
          "section",
          { class: "cartao" },
          h("div", { class: "cartao-topo" }, h("h2", {}, "🔥 Leads quentes"), h("a", { href: "#/contatos", class: "btn-link" }, "Funil")),
          m.quentes.length
            ? h(
                "div",
                { class: "lista-mini" },
                m.quentes.map((x) => h("div", { class: "mini-conversa" }, avatar(x.nome || x.nome_perfil, x.id, 34), h("div", {}, h("strong", {}, x.nome || x.nome_perfil || telefone(x.wa_id)), h("small", {}, ETAPA_ROTULO[x.etapa])), h("span", { class: "chip chip-fogo" }, x.pontuacao))),
              )
            : vazio("fogo", "Sem leads quentes ainda", "A IA calcula a temperatura de cada cliente conforme a conversa."),
        ),
        h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, "Funil de vendas")), funil(m.funil)),
        h(
          "section",
          { class: "cartao" },
          h("div", { class: "cartao-topo" }, h("h2", {}, "Como os clientes se sentem")),
          sent
            ? h(
                "div",
                { class: "sentimento" },
                [
                  ["positivo", "😊 Positivo", "var(--verde)"],
                  ["neutro", "😐 Neutro", "var(--cinza)"],
                  ["negativo", "😟 Negativo", "var(--vermelho)"],
                ].map(([k, r, cor]) => h("div", { class: "sent-linha" }, h("span", {}, r), h("span", { class: "sent-barra" }, h("span", { style: { width: `${((c[k] ?? 0) / sent) * 100}%`, background: cor } })), h("strong", {}, `${Math.round(((c[k] ?? 0) / sent) * 100)}%`))),
              )
            : h("p", { class: "suave" }, "Aparece depois das primeiras conversas analisadas."),
          m.intencoes.length ? [h("h3", { class: "sub" }, "Principais assuntos"), h("div", { class: "nuvem" }, m.intencoes.map((x) => h("span", { class: "chip" }, x.intencao, " · ", x.n)))] : null,
        ),
        h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, "Horários de pico")), mapaHoras(m.porHora), h("p", { class: "suave pequeno" }, "Mensagens recebidas por hora (horário de Brasília).")),
        h(
          "section",
          { class: "cartao" },
          h("div", { class: "cartao-topo" }, h("h2", {}, "Agenda de hoje"), h("a", { href: "#/agenda", class: "btn-link" }, "Agenda")),
          m.agenda_hoje.length ? h("div", { class: "lista-mini" }, m.agenda_hoje.map((a) => h("div", { class: "mini-item" }, h("strong", {}, a.quando), h("span", {}, a.servico, " · ", a.contato_nome || a.contato_nome_perfil || telefone(a.contato_wa_id))))) : h("p", { class: "suave" }, "Nada agendado para as próximas 24 horas."),
        ),
        m.conhecimentoTop.length
          ? h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, "O que a IA mais consulta")), h("div", { class: "lista-mini" }, m.conhecimentoTop.map((k) => h("div", { class: "mini-item" }, h("span", {}, k.titulo), h("strong", {}, numero(k.usos))))))
          : null,
      ),
    ),
  );
}
