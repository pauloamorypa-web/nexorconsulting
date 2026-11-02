/* Caixa de entrada: lista de conversas, chat em tempo real, copiloto de IA e ficha do cliente. */

import { enviarArquivo, get, post, put } from "../api.js";
import {
  acao,
  area,
  aviso,
  avatar,
  campo,
  confirmar,
  debounce,
  diaExtenso,
  entrada,
  erro,
  ETAPA_ROTULO,
  h,
  hora,
  icone,
  janela,
  limpar,
  quandoRelativo,
  reais,
  seletor,
  SENTIMENTO,
  telefone,
  textoWhatsApp,
  vazio,
} from "../ui.js";

const FILTROS = [
  ["abertas", "Abertas"],
  ["aguardando", "Aguardando você"],
  ["minhas", "Minhas"],
  ["ia", "Com a IA"],
  ["humano", "Com a equipe"],
  ["resolvidas", "Resolvidas"],
];

const ESTILOS = [
  ["corrigir", "Corrigir português"],
  ["amigavel", "Mais simpático"],
  ["profissional", "Mais profissional"],
  ["curto", "Mais curto"],
  ["persuasivo", "Mais persuasivo"],
  ["empatico", "Mais empático"],
];

const nomeDe = (c) => c?.contato_nome || c?.contato_nome_perfil || c?.nome || c?.nome_perfil || telefone(c?.contato_wa_id ?? c?.wa_id);

let estado;
let el;
let ctxApp;

export async function render(raiz, ctx, [idInicial]) {
  ctxApp = ctx;
  estado = { filtro: "abertas", busca: "", lista: [], id: idInicial ?? null, det: null, digitando: false, rapidas: [], modelos: [], usuarios: [], nota: false, contagem: {} };
  el = {
    lista: h("div", { class: "inbox-lista-itens", role: "list" }),
    filtros: h("div", { class: "inbox-filtros" }),
    chat: h("section", { class: "inbox-chat" }),
    ficha: h("aside", { class: "inbox-ficha" }),
  };
  const busca = entrada({ type: "search", placeholder: "Buscar nome, número ou mensagem", "aria-label": "Buscar conversas", oninput: debounce((e) => ((estado.busca = e.target.value), carregarLista()), 300) });
  raiz.append(
    h(
      "div",
      { class: `inbox ${estado.id ? "com-chat" : ""}` },
      h(
        "section",
        { class: "inbox-lista" },
        h("div", { class: "inbox-lista-topo" }, h("h1", {}, "Conversas"), h("button", { class: "btn btn-pequeno btn-primario", onclick: novaConversa, title: "Iniciar conversa com um modelo aprovado" }, icone("mais", 16), "Nova")),
        h("div", { class: "inbox-busca" }, icone("busca", 16), busca),
        el.filtros,
        el.lista,
      ),
      el.chat,
      el.ficha,
    ),
  );
  desenharFiltros();
  Promise.all([get("/respostas-rapidas"), get("/modelos"), get("/usuarios")])
    .then(([r, m, u]) => Object.assign(estado, { rapidas: r, modelos: m.filter((x) => x.status === "APPROVED"), usuarios: u.filter((x) => x.ativo) }))
    .catch(() => {});
  await carregarLista();
  if (estado.id) abrir(estado.id);
  else desenharChatVazio();
  return () => (estado = null);
}

/* ---------- Tempo real ---------- */

export function aoEvento(tipo, d) {
  if (!estado) return;
  if (tipo === "conversa") {
    const i = estado.lista.findIndex((c) => c.id === d.id);
    const pertence = filtroAceita(d);
    if (i >= 0 && pertence) estado.lista[i] = d;
    else if (i >= 0) estado.lista.splice(i, 1);
    else if (pertence && (!estado.busca || nomeDe(d).toLowerCase().includes(estado.busca.toLowerCase()))) estado.lista.unshift(d);
    estado.lista.sort((a, b) => (b.status === "aguardando") - (a.status === "aguardando") || b.ultima_msg_em - a.ultima_msg_em);
    desenharLista();
    if (estado.det?.conversa.id === d.id) {
      estado.det.conversa = d;
      desenharTopoChat();
      desenharFicha();
      desenharSugestao();
    }
    atualizarContagemFiltros();
  }
  if (tipo === "mensagem" && estado.det) {
    const det = estado.det;
    if (d.conversa_id !== det.conversa.id && !estado.det.mensagens.some((m) => m.conversa_id === d.conversa_id)) return;
    const i = det.mensagens.findIndex((m) => m.id === d.id);
    if (i >= 0) det.mensagens[i] = { ...det.mensagens[i], ...d };
    else det.mensagens.push(d);
    if (d.direcao === "entrada") {
      det.janela = { aberta: true, fecha_em: Date.now() + 24 * 3600_000 };
      post(`/conversas/${det.conversa.id}/lida`).catch(() => {});
      desenharCompositor();
    }
    desenharMensagens(i < 0);
  }
  if (tipo === "status" && estado.det) {
    const m = estado.det.mensagens.find((x) => x.id === d.id);
    if (m) {
      Object.assign(m, { status: d.status, erro: d.erro });
      desenharMensagens(false);
    }
  }
  if (tipo === "digitando" && estado.det?.conversa.id === d.conversa_id) {
    estado.digitando = d.ativo;
    desenharMensagens(true);
  }
  if (tipo === "sugestao" && estado.det?.conversa.id === d.conversa_id) {
    estado.det.conversa.analise = { ...(estado.det.conversa.analise ?? {}), sugestao: d };
    desenharSugestao();
  }
  if (tipo === "contato" && estado.det?.contato.id === d.id) {
    estado.det.contato = d;
    desenharFicha();
  }
}

function filtroAceita(c) {
  const f = estado.filtro;
  const aberta = c.status !== "resolvida";
  return (
    (f === "abertas" && aberta) ||
    (f === "aguardando" && c.status === "aguardando") ||
    (f === "minhas" && aberta && c.atribuida_a === ctxApp.eu.usuario.id) ||
    (f === "ia" && aberta && c.modo === "ia") ||
    (f === "humano" && aberta && c.modo === "humano") ||
    (f === "resolvidas" && !aberta)
  );
}

/* ---------- Lista ---------- */

async function atualizarContagemFiltros() {
  estado.contagem = await get("/conversas/contagem").catch(() => estado.contagem);
  ctxApp.atualizarContagem(estado.contagem);
  desenharFiltros();
}

function desenharFiltros() {
  const n = { abertas: estado.contagem.abertas, aguardando: estado.contagem.aguardando, minhas: estado.contagem.minhas, ia: estado.contagem.ia, humano: estado.contagem.humano };
  limpar(
    el.filtros,
    FILTROS.map(([id, rotulo]) =>
      h(
        "button",
        {
          class: `filtro ${estado.filtro === id ? "ativo" : ""} ${id === "aguardando" && n.aguardando ? "urgente" : ""}`,
          onclick: () => {
            estado.filtro = id;
            desenharFiltros();
            carregarLista();
          },
        },
        rotulo,
        n[id] ? h("span", { class: "filtro-n" }, n[id]) : null,
      ),
    ),
  );
}

async function carregarLista() {
  const q = new URLSearchParams({ filtro: estado.filtro });
  if (estado.busca) q.set("busca", estado.busca);
  try {
    estado.lista = await get(`/conversas?${q}`);
    desenharLista();
    atualizarContagemFiltros();
  } catch (e) {
    erro(e);
  }
}

function desenharLista() {
  if (!estado.lista.length) {
    return limpar(el.lista, vazio("conversas", estado.busca ? "Nada encontrado" : "Nenhuma conversa aqui", estado.filtro === "aguardando" ? "Quando a IA passar um atendimento para a equipe, ele aparece aqui." : "As conversas do WhatsApp aparecem aqui em tempo real."));
  }
  limpar(
    el.lista,
    estado.lista.map((c) => {
      const s = SENTIMENTO[c.sentimento];
      return h(
        "a",
        { class: `conversa-item ${c.id === estado.id ? "ativa" : ""} ${c.nao_lidas ? "nao-lida" : ""}`, href: `#/conversas/${c.id}`, role: "listitem", onclick: (e) => (e.preventDefault(), abrir(c.id)) },
        h("div", { class: "conversa-avatar" }, avatar(nomeDe(c), c.contato_id, 42), h("span", { class: `modo-ponto ${c.modo}`, title: c.modo === "ia" ? "IA atendendo" : "Equipe atendendo" }, icone(c.modo === "ia" ? "robo" : "pessoa", 11))),
        h(
          "div",
          { class: "conversa-texto" },
          h("div", { class: "conversa-linha" }, h("strong", {}, nomeDe(c)), h("time", {}, quandoRelativo(c.ultima_msg_em))),
          h("div", { class: "conversa-linha" }, h("span", { class: "conversa-previa" }, (c.ultima_mensagem ?? "").replace(/[*_~]([^*_~\n]+)[*_~]/g, "$1")), c.nao_lidas ? h("span", { class: "selo-n" }, c.nao_lidas) : null),
          h(
            "div",
            { class: "conversa-tags" },
            c.status === "aguardando" ? h("span", { class: "chip chip-alerta" }, "Aguardando") : null,
            c.prioridade === "alta" ? h("span", { class: "chip chip-perigo" }, "Prioridade") : null,
            c.contato_pontuacao >= 70 ? h("span", { class: "chip chip-fogo", title: `Temperatura ${c.contato_pontuacao}` }, "🔥 ", c.contato_pontuacao) : null,
            s ? h("span", { class: "chip", title: s[1] }, s[0]) : null,
            c.intencao ? h("span", { class: "chip" }, c.intencao) : null,
          ),
        ),
      );
    }),
  );
}

/* ---------- Chat ---------- */

function desenharChatVazio() {
  limpar(el.chat, vazio("whatsapp", "Selecione uma conversa", "A IA está atendendo seus clientes. Abra uma conversa para acompanhar, assumir ou ensinar a IA."));
  limpar(el.ficha);
  document.querySelector(".inbox")?.classList.remove("com-chat");
}

async function abrir(id) {
  estado.id = id;
  estado.digitando = false;
  history.replaceState(null, "", `#/conversas/${id}`);
  document.querySelector(".inbox")?.classList.add("com-chat");
  desenharLista();
  limpar(el.chat, h("div", { class: "carregando-bloco" }, h("span", { class: "girando" })));
  try {
    estado.det = await get(`/conversas/${id}`);
  } catch (e) {
    erro(e);
    return desenharChatVazio();
  }
  if (estado.det.conversa.nao_lidas) post(`/conversas/${id}/lida`).catch(() => {});
  el.topo = h("header", { class: "chat-topo" });
  el.msgs = h("div", { class: "chat-mensagens", "aria-live": "polite" });
  el.sugestao = h("div", { class: "chat-sugestao" });
  el.compositor = h("div", { class: "chat-compositor" });
  limpar(el.chat, el.topo, el.msgs, el.sugestao, el.compositor);
  desenharTopoChat();
  desenharMensagens(true);
  desenharSugestao();
  desenharCompositor();
  desenharFicha();
}

function desenharTopoChat() {
  const { conversa: c, contato } = estado.det;
  const ia = c.modo === "ia";
  const resolvida = c.status === "resolvida";
  limpar(
    el.topo,
    h("button", { class: "btn-icone so-movel", "aria-label": "Voltar", onclick: () => ((estado.id = null), desenharChatVazio(), history.replaceState(null, "", "#/conversas"), desenharLista()) }, icone("voltar")),
    avatar(nomeDe(contato), contato.id, 38),
    h("div", { class: "chat-quem" }, h("strong", {}, nomeDe(contato)), h("small", {}, telefone(contato.wa_id), estado.det.janela.aberta ? null : h("span", { class: "janela-fechada" }, " · janela de 24 h fechada"))),
    h(
      "div",
      { class: "chat-acoes" },
      resolvida
        ? h("button", { class: "btn btn-pequeno", onclick: (e) => acao(e.currentTarget, async () => abrir((await post(`/conversas/${c.id}/reabrir`)).id)) }, "Reabrir")
        : h(
            "button",
            {
              class: `btn btn-pequeno ${ia ? "btn-ia" : "btn-humano"}`,
              title: ia ? "A IA está respondendo. Clique para assumir." : "Você está atendendo. Clique para devolver à IA.",
              onclick: (e) => acao(e.currentTarget, async () => (estado.det.conversa = { ...c, ...(await post(`/conversas/${c.id}/modo`, { modo: ia ? "humano" : "ia" })) })).then(desenharTopoChat),
            },
            icone(ia ? "robo" : "pessoa", 16),
            ia ? "IA atendendo · Assumir" : "Você atendendo · Devolver à IA",
          ),
      !resolvida
        ? h(
            "button",
            {
              class: "btn btn-pequeno btn-sucesso",
              onclick: (e) =>
                acao(e.currentTarget, async () => {
                  await post(`/conversas/${c.id}/resolver`);
                  aviso("Atendimento encerrado. A IA vai analisar e resumir a conversa.");
                }),
            },
            icone("check", 16),
            "Resolver",
          )
        : null,
      h("button", { class: "btn-icone so-tablet", "aria-label": "Ficha do cliente", onclick: () => document.querySelector(".inbox").classList.toggle("ficha-aberta") }, icone("pessoa")),
    ),
  );
}

const TICKS = { pendente: ["relogio", "Enviando"], enviada: ["check", "Enviada"], entregue: ["checks", "Entregue"], lida: ["checks", "Lida"], falhou: ["alerta", "Falhou"] };

function conteudoMidia(m) {
  const md = m.conteudo?.midia;
  const src = md?.arquivo ? `/api/midia/${md.arquivo}` : md?.link;
  if (!src) return md ? h("div", { class: "midia-indisponivel" }, icone("alerta", 14), md.erro ? "Mídia não baixada" : `[${m.tipo}]`) : null;
  if (m.tipo === "image" || m.tipo === "sticker") return h("a", { href: src, target: "_blank", rel: "noopener" }, h("img", { src, alt: m.texto || "imagem", loading: "lazy", class: m.tipo === "sticker" ? "figurinha" : "foto" }));
  if (m.tipo === "audio") return h("audio", { src, controls: true, preload: "none" });
  if (m.tipo === "video") return h("video", { src, controls: true, preload: "metadata", class: "foto" });
  return h("a", { class: "documento", href: src, target: "_blank", rel: "noopener" }, icone("nota", 20), h("span", {}, md.nome ?? "Documento"));
}

function bolha(m, msgs) {
  if (m.direcao === "nota") {
    const sistema = m.autor === "sistema";
    return h("div", { class: `nota ${sistema ? "nota-sistema" : ""}` }, h("span", { class: "nota-autor" }, sistema ? "Sistema" : `Nota interna · ${m.conteudo?.autor_nome ?? ""}`), h("div", {}, textoWhatsApp(m.texto)), h("time", {}, hora(m.criada_em)));
  }
  if (m.tipo === "reaction") return null;
  const saida = m.direcao === "saida";
  const reacoes = msgs.filter((r) => r.tipo === "reaction" && r.conteudo?.alvo && r.conteudo.alvo === m.wamid && r.texto);
  const rotulo = { ia: "IA", humano: estado.usuarios.find((u) => u.id === m.autor_id)?.nome ?? "Equipe", campanha: "Campanha", sistema: "Automático" }[m.autor];
  const tick = TICKS[m.status];
  const md = conteudoMidia(m);
  const conteudo = m.conteudo ?? {};
  return h(
    "div",
    { class: `bolha-linha ${saida ? "msg-saida" : "msg-entrada"} autor-${m.autor}`, dataset: { id: m.id } },
    h(
      "div",
      { class: "bolha" },
      saida ? h("span", { class: "bolha-autor" }, icone(m.autor === "ia" ? "robo" : m.autor === "campanha" ? "campanhas" : "pessoa", 12), rotulo) : null,
      m.tipo === "template" ? h("span", { class: "bolha-modelo" }, "Modelo · ", conteudo.nome) : null,
      conteudo.encaminhada ? h("span", { class: "bolha-modelo" }, "Encaminhada") : null,
      md,
      m.tipo === "location" && conteudo.local ? h("a", { href: `https://maps.google.com/?q=${conteudo.local.latitude},${conteudo.local.longitude}`, target: "_blank", rel: "noopener", class: "documento" }, "📍 ", conteudo.local.nome ?? "Abrir localização") : null,
      m.texto && !(m.tipo === "location") ? h("div", { class: "bolha-texto" }, textoWhatsApp(m.texto)) : null,
      conteudo.opcoes ? h("div", { class: "bolha-opcoes" }, conteudo.opcoes.map((o) => h("span", {}, o))) : null,
      h("div", { class: "bolha-meta" }, h("time", { title: new Date(m.criada_em).toLocaleString("pt-BR") }, hora(m.criada_em)), saida && tick ? h("span", { class: `tick tick-${m.status}`, title: m.erro ?? tick[1] }, icone(tick[0], 14)) : null),
      m.status === "falhou" && m.erro ? h("div", { class: "bolha-erro" }, icone("alerta", 13), m.erro) : null,
      reacoes.length ? h("div", { class: "bolha-reacoes" }, reacoes.map((r) => r.texto)) : null,
    ),
    m.autor === "ia" && m.tipo === "text" ? h("button", { class: "btn-ensinar", title: "Ensinar a IA: corrigir esta resposta", onclick: () => ensinar(m) }, icone("aprender", 14), "Ensinar") : null,
  );
}

function desenharMensagens(rolar) {
  if (!el.msgs) return;
  const perto = el.msgs.scrollHeight - el.msgs.scrollTop - el.msgs.clientHeight < 160;
  const msgs = estado.det.mensagens;
  const blocos = [];
  let dia = "";
  for (const m of msgs) {
    const d = diaExtenso(m.criada_em);
    if (d !== dia) {
      dia = d;
      blocos.push(h("div", { class: "separador-dia" }, h("span", {}, d)));
    }
    const b = bolha(m, msgs);
    if (b) blocos.push(b);
  }
  if (!msgs.length) blocos.push(vazio("conversas", "Sem mensagens ainda", "Envie um modelo para iniciar a conversa."));
  if (estado.digitando) blocos.push(h("div", { class: "bolha-linha msg-saida autor-ia" }, h("div", { class: "bolha digitando" }, h("span", { class: "bolha-autor" }, icone("robo", 12), "IA escrevendo"), h("span", { class: "pontinhos" }, h("i"), h("i"), h("i")))));
  limpar(el.msgs, blocos);
  if (rolar || perto) el.msgs.scrollTop = el.msgs.scrollHeight;
}

function desenharSugestao() {
  if (!el.sugestao) return;
  const s = estado.det.conversa.analise?.sugestao;
  if (!s || (!s.texto && !s.opcoes)) return limpar(el.sugestao);
  const txt = area({ rows: 3, "aria-label": "Sugestão da IA" }, s.texto ?? "");
  limpar(
    el.sugestao,
    h(
      "div",
      { class: "sugestao-caixa" },
      h("div", { class: "sugestao-topo" }, icone("magica", 16), h("strong", {}, "A IA sugere esta resposta"), s.transferencia ? h("span", { class: "chip chip-alerta" }, "Sugere transferir: ", s.transferencia.motivo) : null),
      txt,
      s.opcoes ? h("div", { class: "bolha-opcoes" }, (s.opcoes.botoes ?? s.opcoes.secoes?.[0]?.linhas ?? []).map((o) => h("span", {}, o.titulo))) : null,
      h(
        "div",
        { class: "sugestao-acoes" },
        h(
          "button",
          { class: "btn btn-primario btn-pequeno", onclick: (e) => acao(e.currentTarget, async () => (await post(`/conversas/${estado.det.conversa.id}/aprovar-sugestao`, { texto: txt.value }), aviso(txt.value.trim() !== (s.texto ?? "").trim() ? "Enviado. A IA aprendeu com a sua edição." : "Enviado."))) },
          icone("enviar", 15),
          "Aprovar e enviar",
        ),
        h("small", { class: "suave" }, "Se você editar, a IA aprende com a correção."),
      ),
    ),
  );
}

/* ---------- Compositor ---------- */

function desenharCompositor() {
  const { janela: jan, conversa } = estado.det;
  if (!jan.aberta) {
    return limpar(
      el.compositor,
      h(
        "div",
        { class: "janela-aviso" },
        icone("relogio", 18),
        h("div", {}, h("strong", {}, "Janela de 24 horas fechada"), h("p", {}, "Pelas regras da Meta, para falar com este cliente agora é preciso um modelo de mensagem aprovado. Quando ele responder, a conversa livre volta.")),
        h("button", { class: "btn btn-primario", onclick: () => escolherModelo(conversa.id) }, "Enviar modelo"),
      ),
    );
  }
  const texto = area({ rows: 1, class: "entrada compositor-texto", placeholder: estado.nota ? "Nota interna (só a equipe vê)…" : "Escreva uma mensagem · / para respostas rápidas", "aria-label": "Mensagem" });
  const menuRapidas = h("div", { class: "rapidas", hidden: true });
  const ajustar = () => {
    texto.style.height = "auto";
    texto.style.height = `${Math.min(texto.scrollHeight, 180)}px`;
  };
  const enviar = async (botao) => {
    const v = texto.value.trim();
    if (!v) return;
    await acao(botao, async () => {
      if (estado.nota) await post(`/conversas/${conversa.id}/notas`, { texto: v });
      else {
        try {
          await post(`/conversas/${conversa.id}/mensagens`, { texto: v });
        } catch (e) {
          if (e.codigo === "janela_fechada") {
            estado.det.janela.aberta = false;
            desenharCompositor();
          }
          throw e;
        }
      }
      texto.value = "";
      ajustar();
    });
  };
  const mostrarRapidas = () => {
    const m = texto.value.match(/^\/([\w-]*)$/);
    const lista = m ? estado.rapidas.filter((r) => r.atalho.startsWith(m[1].toLowerCase())) : [];
    menuRapidas.hidden = !lista.length;
    limpar(
      menuRapidas,
      lista.slice(0, 8).map((r) =>
        h(
          "button",
          {
            class: "rapida",
            onclick: () => {
              texto.value = r.texto.replace(/\{nome\}/g, (estado.det.contato.nome || estado.det.contato.nome_perfil || "").split(" ")[0]);
              menuRapidas.hidden = true;
              ajustar();
              texto.focus();
            },
          },
          h("strong", {}, `/${r.atalho}`),
          h("span", {}, r.texto.slice(0, 80)),
        ),
      ),
    );
  };
  texto.addEventListener("input", () => (ajustar(), mostrarRapidas()));
  const botaoEnviar = h("button", { class: "btn btn-primario btn-enviar", "aria-label": "Enviar", onclick: (e) => enviar(e.currentTarget) }, icone("enviar", 18));
  texto.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!menuRapidas.hidden) menuRapidas.querySelector("button")?.click();
      else enviar(botaoEnviar);
    }
  });
  const arquivo = h("input", { type: "file", hidden: true, accept: "image/jpeg,image/png,application/pdf,audio/*,video/mp4,.doc,.docx,.xls,.xlsx,.txt,.csv", onchange: (e) => enviarAnexo(e.target.files[0], texto) });
  const menuIA = h("div", { class: "menu-flutuante", hidden: true });
  limpar(
    menuIA,
    h("button", { onclick: () => ((menuIA.hidden = true), sugerir(texto, ajustar)) }, icone("magica", 15), "Escrever resposta com IA"),
    h("button", { onclick: () => ((menuIA.hidden = true), sugerirComOrientacao(texto, ajustar)) }, icone("editar", 15), "Escrever com uma orientação…"),
    h("hr"),
    ESTILOS.map(([id, rotulo]) => h("button", { onclick: () => ((menuIA.hidden = true), reescrever(texto, id, ajustar)) }, rotulo)),
  );
  limpar(
    el.compositor,
    menuRapidas,
    h(
      "div",
      { class: `compositor ${estado.nota ? "modo-nota" : ""}` },
      h(
        "div",
        { class: "compositor-ferramentas" },
        h("button", { class: `btn-chip ${estado.nota ? "" : "ativo"}`, onclick: () => ((estado.nota = false), desenharCompositor()) }, "Responder"),
        h("button", { class: `btn-chip ${estado.nota ? "ativo" : ""}`, onclick: () => ((estado.nota = true), desenharCompositor()) }, "Nota interna"),
        h("span", { class: "espaco" }),
        h("div", { class: "ancora" }, h("button", { class: "btn-chip btn-chip-ia", onclick: () => (menuIA.hidden = !menuIA.hidden) }, icone("magica", 14), "IA"), menuIA),
        estado.modelos.length ? h("button", { class: "btn-chip", onclick: () => escolherModelo(conversa.id), title: "Enviar modelo aprovado" }, icone("nota", 14), "Modelo") : null,
      ),
      h("div", { class: "compositor-linha" }, h("button", { class: "btn-icone", "aria-label": "Anexar arquivo", title: "Anexar foto, PDF, áudio…", onclick: () => arquivo.click(), disabled: estado.nota }, icone("clipe")), arquivo, texto, botaoEnviar),
    ),
  );
  texto.focus({ preventScroll: true });
}

async function enviarAnexo(arquivo, texto) {
  if (!arquivo) return;
  const id = estado.det.conversa.id;
  aviso(`Enviando ${arquivo.name}…`, "info", 2500);
  await acao(null, async () => {
    const up = await enviarArquivo(arquivo);
    await post(`/conversas/${id}/mensagens`, { arquivo: up.arquivo, mime: up.mime, nome: arquivo.name, legenda: texto.value.trim() || undefined });
    texto.value = "";
  });
}

async function sugerir(texto, ajustar, orientacao) {
  texto.disabled = true;
  const antes = texto.placeholder;
  texto.placeholder = "A IA está escrevendo uma sugestão…";
  try {
    const r = await post(`/conversas/${estado.det.conversa.id}/sugerir`, { orientacao });
    texto.value = r.texto;
    ajustar();
  } catch (e) {
    erro(e);
  } finally {
    texto.disabled = false;
    texto.placeholder = antes;
    texto.focus();
  }
}

function sugerirComOrientacao(texto, ajustar) {
  const o = area({ rows: 3, placeholder: "Ex.: ofereça 10% de desconto à vista e pergunte o endereço de entrega" });
  janela({
    titulo: "Escrever resposta com IA",
    conteudo: campo("O que a resposta deve dizer?", o),
    acoes: [{ texto: "Escrever", classe: "btn-primario", fn: (_, f) => (f(), sugerir(texto, ajustar, o.value.trim() || undefined)) }],
  });
}

async function reescrever(texto, estilo, ajustar) {
  if (!texto.value.trim()) return aviso("Escreva algo primeiro para a IA reescrever.", "info");
  texto.disabled = true;
  try {
    texto.value = (await post("/ia/reescrever", { texto: texto.value, estilo })).texto;
    ajustar();
  } catch (e) {
    erro(e);
  } finally {
    texto.disabled = false;
    texto.focus();
  }
}

function ensinar(m) {
  const msgs = estado.det.mensagens;
  const anteriores = msgs.filter((x) => x.direcao === "entrada" && x.criada_em <= m.criada_em).slice(-2);
  const situacao = area({ rows: 2 }, anteriores.map((x) => x.texto).filter(Boolean).join(" / "));
  const ideal = area({ rows: 5 }, m.texto);
  janela({
    titulo: "Ensinar a IA",
    conteudo: h(
      "div",
      { class: "pilha" },
      h("p", { class: "suave" }, "Mostre como a resposta deveria ser. A IA passa a seguir este exemplo em situações parecidas, em todas as conversas."),
      h("div", { class: "citacao" }, h("small", {}, "A IA respondeu:"), h("p", {}, m.texto)),
      campo("Situação (o que o cliente perguntou)", situacao),
      campo("Resposta ideal", ideal),
    ),
    acoes: [
      {
        texto: "Salvar aprendizado",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            await post(`/mensagens/${m.id}/corrigir`, { resposta_ideal: ideal.value, situacao: situacao.value });
            fechar();
            aviso("Pronto! A IA aprendeu com esta correção. 🎓");
          }),
      },
    ],
  });
}

function formModelo(modelo, contato) {
  const corpoTexto = modelo.componentes.find((c) => c.type === "BODY")?.text ?? "";
  const vars = Array.from({ length: modelo.variaveis }, (_, i) => entrada({ placeholder: `Variável {{${i + 1}}}`, value: i === 0 ? (contato?.nome || contato?.nome_perfil || "").split(" ")[0] : "" }));
  const previa = h("div", { class: "previa-whats" });
  const atualizar = () => limpar(previa, textoWhatsApp(corpoTexto.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[n - 1]?.value || `{{${n}}}`)));
  vars.forEach((v) => v.addEventListener("input", atualizar));
  atualizar();
  return { vars, bloco: h("div", { class: "pilha" }, vars.map((v, i) => campo(`{{${i + 1}}}`, v)), h("small", { class: "suave" }, "Prévia"), previa) };
}

function escolherModelo(conversaId) {
  if (!estado.modelos.length) return aviso("Nenhum modelo aprovado. Crie um em Campanhas → Modelos.", "info");
  const sel = seletor(estado.modelos.map((m, i) => [i, `${m.nome} (${m.idioma})`]), 0);
  const area2 = h("div");
  let form;
  const montar = () => {
    form = formModelo(estado.modelos[sel.value], estado.det?.contato);
    limpar(area2, form.bloco);
  };
  sel.addEventListener("change", montar);
  montar();
  janela({
    titulo: "Enviar modelo aprovado",
    conteudo: h("div", { class: "pilha" }, campo("Modelo", sel), area2),
    acoes: [
      {
        texto: "Enviar",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            const m = estado.modelos[sel.value];
            await post(`/conversas/${conversaId}/mensagens`, { modelo: { nome: m.nome, idioma: m.idioma, variaveis: form.vars.map((v) => v.value) } });
            fechar();
            aviso("Modelo enviado.");
          }),
      },
    ],
  });
}

function novaConversa() {
  const numero = entrada({ type: "tel", placeholder: "Ex.: 34 99999-0000", inputmode: "tel" });
  const nome = entrada({ placeholder: "Opcional" });
  if (!estado.modelos.length) return aviso("Para iniciar uma conversa é preciso um modelo aprovado pela Meta. Crie em Campanhas → Modelos.", "info", 7000);
  const sel = seletor(estado.modelos.map((m, i) => [i, `${m.nome} (${m.idioma})`]), 0);
  const area2 = h("div");
  let form;
  const montar = () => {
    form = formModelo(estado.modelos[sel.value], { nome: nome.value });
    limpar(area2, form.bloco);
  };
  sel.addEventListener("change", montar);
  montar();
  janela({
    titulo: "Nova conversa",
    conteudo: h("div", { class: "pilha" }, campo("WhatsApp do cliente", numero, "Com DDD. O DDI 55 é adicionado se faltar."), campo("Nome", nome), campo("Modelo", sel), area2),
    acoes: [
      {
        texto: "Enviar e abrir conversa",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            let n = numero.value.replace(/\D/g, "");
            if (n.length === 10 || n.length === 11) n = `55${n}`;
            const m = estado.modelos[sel.value];
            const c = await post("/conversas/nova", { wa_id: n, nome: nome.value || undefined, modelo: { nome: m.nome, idioma: m.idioma, variaveis: form.vars.map((v) => v.value) } });
            fechar();
            await carregarLista();
            abrir(c.id);
          }),
      },
    ],
  });
}

/* ---------- Ficha do cliente ---------- */

function desenharFicha() {
  if (!estado.det) return;
  const { contato: ct, conversa: cv, agendamentos, anteriores } = estado.det;
  const a = cv.analise;
  const salvar = debounce(async (dados) => {
    try {
      estado.det.contato = await put(`/contatos/${ct.id}`, dados);
    } catch (e) {
      erro(e);
    }
  }, 500);
  const nome = entrada({ value: ct.nome ?? "", placeholder: ct.nome_perfil ?? "Nome", oninput: (e) => salvar({ nome: e.target.value || null }) });
  const email = entrada({ type: "email", value: ct.email ?? "", placeholder: "e-mail", onchange: (e) => salvar({ email: e.target.value }) });
  const etapa = seletor(ctxApp.eu.etapas.map((x) => [x, ETAPA_ROTULO[x]]), ct.etapa, { onchange: (e) => salvar({ etapa: e.target.value }) });
  const valor = entrada({ type: "number", min: 0, step: "0.01", value: ct.valor_estimado ? ct.valor_estimado / 100 : "", placeholder: "R$", onchange: (e) => salvar({ valor_estimado: e.target.value ? Number(e.target.value) : null }) });
  const tagEntrada = entrada({
    placeholder: "+ etiqueta",
    class: "entrada entrada-tag",
    onkeydown: (e) => {
      if (e.key === "Enter" && e.target.value.trim()) {
        e.preventDefault();
        const tags = [...ct.tags, e.target.value.trim().toLowerCase()];
        put(`/contatos/${ct.id}`, { tags }).then((c) => ((estado.det.contato = c), desenharFicha()), erro);
      }
    },
  });
  const responsavel = seletor([["", "Sem responsável"], ...estado.usuarios.map((u) => [u.id, u.nome])], cv.atribuida_a ?? "", {
    onchange: (e) => post(`/conversas/${cv.id}/atribuir`, { usuario_id: e.target.value || null }).catch(erro),
  });
  const temperatura = ct.pontuacao ?? 0;

  limpar(
    el.ficha,
    h("button", { class: "btn-icone so-tablet fechar-ficha", "aria-label": "Fechar ficha", onclick: () => document.querySelector(".inbox")?.classList.remove("ficha-aberta") }, icone("x")),
    h(
      "div",
      { class: "ficha-cabeca" },
      avatar(nomeDe(ct), ct.id, 64),
      h("strong", {}, nomeDe(ct)),
      h("small", {}, telefone(ct.wa_id)),
      ct.opt_out ? h("span", { class: "chip chip-perigo" }, "Não recebe campanhas") : null,
    ),
    h(
      "section",
      { class: "ficha-bloco ficha-ia" },
      h("h3", {}, icone("cerebro", 16), "Inteligência da conversa", h("button", { class: "btn-link", onclick: (e) => acao(e.currentTarget, async () => ((estado.det.conversa.analise = await post(`/conversas/${cv.id}/analisar`)), desenharFicha())) }, a?.analisada_em ? "Atualizar" : "Analisar")),
      a?.resumo
        ? [
            h(
              "div",
              { class: "termometro", title: `Chance de fechar: ${temperatura}/100` },
              h("div", { class: "termometro-rotulo" }, h("span", {}, "Temperatura do lead"), h("strong", {}, temperatura >= 70 ? "🔥 " : temperatura >= 40 ? "🌤️ " : "❄️ ", temperatura)),
              h("div", { class: "termometro-barra" }, h("span", { style: { width: `${temperatura}%` } })),
            ),
            h("div", { class: "ia-linhas" }, a.sentimento ? h("span", { class: "chip" }, SENTIMENTO[a.sentimento]?.join(" ")) : null, a.intencao ? h("span", { class: "chip" }, a.intencao) : null, a.urgencia ? h("span", { class: `chip ${a.urgencia === "alta" ? "chip-perigo" : ""}` }, `Urgência ${a.urgencia}`) : null),
            h("p", { class: "ia-resumo" }, a.resumo),
            a.proxima_acao ? h("div", { class: "ia-acao" }, icone("raio", 14), h("span", {}, h("strong", {}, "Próxima ação: "), a.proxima_acao)) : null,
            a.objecoes?.length ? h("div", { class: "ia-objecoes" }, h("small", {}, "Objeções"), a.objecoes.map((o) => h("span", { class: "chip" }, o))) : null,
            a.precisa_humano ? h("div", { class: "ia-alerta" }, icone("alerta", 14), a.motivo_alerta || "Recomenda atenção humana") : null,
          ]
        : h("p", { class: "suave pequeno" }, "A IA analisa sentimento, intenção e temperatura do lead automaticamente a cada poucas mensagens."),
    ),
    h(
      "section",
      { class: "ficha-bloco" },
      h("h3", {}, icone("pessoa", 16), "Cliente"),
      campo("Nome", nome),
      campo("E-mail", email),
      h("div", { class: "grade-2" }, campo("Etapa do funil", etapa), campo("Valor estimado", valor)),
      h(
        "div",
        { class: "tags" },
        ct.tags.map((t) =>
          h(
            "span",
            { class: "tag" },
            t,
            h("button", { "aria-label": `Remover ${t}`, onclick: () => put(`/contatos/${ct.id}`, { tags: ct.tags.filter((x) => x !== t) }).then((c) => ((estado.det.contato = c), desenharFicha()), erro) }, "×"),
          ),
        ),
        tagEntrada,
      ),
      Object.keys(ct.campos ?? {}).length ? h("dl", { class: "campos-crm" }, Object.entries(ct.campos).map(([k, v]) => [h("dt", {}, k.replace(/_/g, " ")), h("dd", {}, String(v))])) : null,
    ),
    h("section", { class: "ficha-bloco" }, h("h3", {}, icone("contatos", 16), "Responsável"), responsavel, cv.status !== "resolvida" ? h("label", { class: "linha-check" }, h("input", { type: "checkbox", checked: cv.prioridade === "alta", onchange: (e) => post(`/conversas/${cv.id}/prioridade`, { prioridade: e.target.checked ? "alta" : "normal" }).catch(erro) }), "Prioridade alta") : null),
    agendamentos.length ? h("section", { class: "ficha-bloco" }, h("h3", {}, icone("agenda", 16), "Agendamentos"), agendamentos.map((x) => h("div", { class: "mini-item" }, h("strong", {}, x.servico), h("small", {}, x.quando)))) : null,
    anteriores.length
      ? h(
          "section",
          { class: "ficha-bloco" },
          h("h3", {}, icone("relogio", 16), "Atendimentos anteriores"),
          anteriores.slice(0, 5).map((x) => h("div", { class: "mini-item" }, h("small", {}, new Date(x.criada_em).toLocaleDateString("pt-BR")), h("span", {}, x.resumo ?? "Sem resumo"))),
        )
      : null,
    ct.valor_estimado ? h("p", { class: "suave pequeno centro" }, "Negócio estimado em ", reais(ct.valor_estimado)) : null,
    h(
      "button",
      {
        class: "btn-link perigo pequeno",
        onclick: async () => {
          if (await confirmar(ct.opt_out ? "Voltar a enviar campanhas para este cliente?" : "Parar de enviar campanhas para este cliente?")) estado.det.contato = await put(`/contatos/${ct.id}`, { opt_out: !ct.opt_out }).catch(erro);
          desenharFicha();
        },
      },
      ct.opt_out ? "Reativar campanhas" : "Não enviar campanhas",
    ),
  );
}
