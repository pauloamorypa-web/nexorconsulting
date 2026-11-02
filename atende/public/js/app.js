/* Painel do Nexor Atende IA: login, menu, rotas e tempo real. */

import { conectarEventos, definirAoDeslogar, get, post } from "./api.js";
import { aviso, avatar, h, icone, limpar } from "./ui.js";

const ROTAS = {
  inicio: { titulo: "Início", icone: "inicio", carregar: () => import("./views/inicio.js") },
  conversas: { titulo: "Conversas", icone: "conversas", carregar: () => import("./views/conversas.js") },
  contatos: { titulo: "Contatos e funil", icone: "contatos", carregar: () => import("./views/contatos.js") },
  ia: { titulo: "Cérebro da IA", icone: "cerebro", carregar: () => import("./views/ia.js") },
  agenda: { titulo: "Agenda", icone: "agenda", carregar: () => import("./views/agenda.js") },
  campanhas: { titulo: "Campanhas", icone: "campanhas", carregar: () => import("./views/campanhas.js") },
  config: { titulo: "Configurações", icone: "config", carregar: () => import("./views/config.js"), papeis: ["dono", "admin"] },
};

const app = document.getElementById("app");
const estado = { eu: null, viewAtual: null, limpeza: null, desconectar: null, contagem: {} };

/* ---------- Tema ---------- */
const temaSalvo = (() => {
  try {
    return localStorage.getItem("nx-tema");
  } catch {
    return null;
  }
})();
if (temaSalvo) document.documentElement.dataset.theme = temaSalvo;
function alternarTema() {
  const escuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = escuro ? "light" : "dark";
  try {
    localStorage.setItem("nx-tema", document.documentElement.dataset.theme);
  } catch {
    /* sem armazenamento */
  }
}

/* ---------- Notificações ---------- */
function notificar(titulo, corpo, rota) {
  if (document.visibilityState === "visible") return;
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {
    /* sem áudio */
  }
  if ("Notification" in window && Notification.permission === "granted") {
    const n = new Notification(titulo, { body: corpo, icon: "/img/favicon.png", tag: rota });
    n.onclick = () => {
      window.focus();
      navegar(rota);
    };
  }
}

/* ---------- Rotas ---------- */
export function navegar(rota) {
  if (location.hash !== `#/${rota}`) location.hash = `#/${rota}`;
  else renderizarRota();
}

const ctx = {
  get eu() {
    return estado.eu;
  },
  navegar,
  recarregarEu,
  atualizarContagem,
};

async function recarregarEu() {
  estado.eu = await get("/eu");
  atualizarContagem(estado.eu.contagem);
  return estado.eu;
}

function atualizarContagem(c) {
  if (!c) return;
  estado.contagem = c;
  const pendentes = (c.aguardando ?? 0) + (c.nao_lidas ?? 0);
  const selo = document.querySelector('[data-rota="conversas"] .selo');
  if (selo) {
    selo.textContent = pendentes > 99 ? "99+" : String(pendentes);
    selo.hidden = !pendentes;
  }
  document.title = pendentes ? `(${pendentes}) Nexor Atende IA` : "Nexor Atende IA";
}

async function renderizarRota() {
  const [nome, ...resto] = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
  const rota = ROTAS[nome] ? nome : "inicio";
  const def = ROTAS[rota];
  if (def.papeis && !def.papeis.includes(estado.eu.usuario.papel)) return navegar("inicio");
  document.querySelectorAll(".menu-item").forEach((el) => el.classList.toggle("ativo", el.dataset.rota === rota));
  document.body.classList.remove("menu-aberto");
  const area = document.getElementById("conteudo");
  estado.limpeza?.();
  estado.limpeza = null;
  limpar(area, h("div", { class: "carregando-bloco" }, h("span", { class: "girando" })));
  try {
    const mod = await def.carregar();
    estado.viewAtual = mod;
    area.dataset.rota = rota;
    limpar(area);
    estado.limpeza = (await mod.render(area, ctx, resto)) ?? null;
  } catch (e) {
    console.error(e);
    limpar(area, h("div", { class: "vazio" }, h("h3", {}, "Não foi possível abrir esta tela"), h("p", {}, e.message)));
  }
}

/* ---------- Layout ---------- */
function layout() {
  const { usuario, empresa } = estado.eu;
  const itens = Object.entries(ROTAS).filter(([, r]) => !r.papeis || r.papeis.includes(usuario.papel));
  const conexao = h("span", { class: "conexao", title: "Tempo real conectado" });
  return h(
    "div",
    { class: "casca" },
    h(
      "aside",
      { class: "lateral" },
      h("a", { class: "marca", href: "#/inicio" }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 32, height: 32 }), h("span", {}, h("strong", {}, "Nexor"), " Atende IA")),
      h(
        "nav",
        { class: "menu", "aria-label": "Menu principal" },
        itens.map(([id, r]) => h("a", { class: "menu-item", href: `#/${id}`, dataset: { rota: id } }, icone(r.icone, 19), h("span", {}, r.titulo), id === "conversas" ? h("span", { class: "selo", hidden: true }) : null)),
      ),
      h(
        "div",
        { class: "lateral-rodape" },
        h("div", { class: "empresa-atual" }, avatar(empresa.nome, empresa.id, 32), h("div", {}, h("strong", {}, empresa.nome), h("small", {}, usuario.nome, " · ", { dono: "Dono", admin: "Administrador", atendente: "Atendente" }[usuario.papel]))),
        h(
          "div",
          { class: "lateral-acoes" },
          h("button", { class: "btn-icone", title: "Alternar tema claro/escuro", "aria-label": "Alternar tema", onclick: alternarTema }, icone("lua")),
          "Notification" in window && Notification.permission === "default"
            ? h("button", { class: "btn-icone", title: "Ativar notificações", "aria-label": "Ativar notificações", onclick: (e) => Notification.requestPermission().then(() => e.currentTarget?.remove?.()) }, icone("sino"))
            : null,
          h(
            "button",
            {
              class: "btn-icone",
              title: "Sair",
              "aria-label": "Sair",
              onclick: async () => {
                await post("/sair");
                location.reload();
              },
            },
            icone("sair"),
          ),
          conexao,
        ),
      ),
    ),
    h(
      "div",
      { class: "principal" },
      h("header", { class: "topo-movel" }, h("button", { class: "btn-icone", "aria-label": "Abrir menu", onclick: () => document.body.classList.toggle("menu-aberto") }, icone("menu")), h("img", { src: "/img/logo-mark.webp", alt: "", width: 26, height: 26 }), h("strong", {}, "Nexor Atende IA")),
      h("main", { id: "conteudo", class: "conteudo" }),
    ),
    h("div", { class: "veu", onclick: () => document.body.classList.remove("menu-aberto") }),
  );
}

function iniciarTempoReal() {
  estado.desconectar?.();
  const repassar = (tipo) => (dados) => estado.viewAtual?.aoEvento?.(tipo, dados);
  const contar = async () => atualizarContagem(await get("/conversas/contagem").catch(() => null));
  let agendado;
  const contarDepois = () => {
    clearTimeout(agendado);
    agendado = setTimeout(contar, 400);
  };
  estado.desconectar = conectarEventos({
    conexao: (ok) => document.querySelector(".conexao")?.classList.toggle("off", !ok),
    mensagem: (m) => {
      repassar("mensagem")(m);
      if (m.direcao === "entrada") contarDepois();
    },
    conversa: (c) => {
      repassar("conversa")(c);
      contarDepois();
    },
    status: repassar("status"),
    digitando: repassar("digitando"),
    sugestao: repassar("sugestao"),
    contato: repassar("contato"),
    agendamento: (a) => {
      repassar("agendamento")(a);
      aviso(`📅 Novo agendamento: ${a.servico}`, "info");
    },
    campanha: repassar("campanha"),
    modelo: (m) => {
      repassar("modelo")(m);
      aviso(`Modelo "${m.nome}": ${m.situacao === "APPROVED" ? "aprovado ✅" : m.situacao === "REJECTED" ? "reprovado ❌" : m.situacao}`, "info", 8000);
    },
    alerta: (a) => {
      repassar("alerta")(a);
      if (a.tipo === "transferencia") {
        aviso(`🙋 ${a.contato} precisa de uma pessoa: ${a.motivo}`, "info", 9000);
        notificar("Cliente aguardando atendimento", `${a.contato}: ${a.motivo}`, `conversas/${a.conversa_id}`);
      } else if (a.tipo === "atencao") {
        aviso(`⚠️ Atenção em ${a.contato}: ${a.motivo}`, "info", 9000);
        notificar("Atenção recomendada pela IA", `${a.contato}: ${a.motivo}`, `conversas/${a.conversa_id}`);
      } else if (a.tipo === "mensagem") notificar(`Nova mensagem de ${a.contato}`, a.motivo, `conversas/${a.conversa_id}`);
      else if (a.tipo === "atribuicao" && a.para === estado.eu.usuario.id) {
        aviso("👤 Uma conversa foi atribuída a você.", "info");
        notificar("Conversa atribuída a você", a.motivo, `conversas/${a.conversa_id}`);
      }
    },
  });
}

/* ---------- Início ---------- */
async function iniciar() {
  definirAoDeslogar(() => {
    if (estado.eu) location.reload();
  });
  const st = await get("/estado").catch(() => ({ logado: false }));
  if (!st.logado) {
    const { renderLogin } = await import("./views/login.js");
    return renderLogin(app, st, () => location.reload());
  }
  await recarregarEu();
  limpar(app, layout());
  atualizarContagem(estado.eu.contagem);
  iniciarTempoReal();
  window.addEventListener("hashchange", renderizarRota);
  if (!location.hash) location.hash = estado.eu.checklist.whatsapp ? "#/conversas" : "#/inicio";
  renderizarRota();
}

iniciar().catch((e) => {
  console.error(e);
  limpar(app, h("div", { class: "vazio" }, h("h3", {}, "Não foi possível carregar o painel"), h("p", {}, e.message)));
});
