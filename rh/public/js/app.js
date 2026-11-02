/* Painel do Nexor RH: login, menu, rotas e avisos em tempo real. */

import { conectarEventos, definirAoDeslogar, get, post } from "./api.js";
import { aviso, avatar, h, icone, limpar } from "./ui.js";

const ROTAS = {
  inicio: { titulo: "Início", icone: "inicio", carregar: () => import("./views/inicio.js") },
  colaboradores: { titulo: "Colaboradores", icone: "contatos", carregar: () => import("./views/colaboradores.js") },
  ponto: { titulo: "Ponto", icone: "relogio", carregar: () => import("./views/ponto.js"), selo: "ajustes" },
  ferias: { titulo: "Férias e ausências", icone: "mala", carregar: () => import("./views/ferias.js"), selo: ["ferias", "afastamentos"] },
  folha: { titulo: "Folha de pagamento", icone: "dinheiro", carregar: () => import("./views/folha.js"), papeis: ["admin", "rh"] },
  recrutamento: { titulo: "Recrutamento", icone: "maleta", carregar: () => import("./views/recrutamento.js"), papeis: ["admin", "rh"], selo: "candidatos" },
  comunicados: { titulo: "Comunicados", icone: "campanhas", carregar: () => import("./views/comunicados.js") },
  esocial: { titulo: "eSocial", icone: "governo", carregar: () => import("./views/esocial.js"), papeis: ["admin", "rh"], selo: "esocial" },
  config: { titulo: "Configurações", icone: "config", carregar: () => import("./views/config.js"), papeis: ["admin", "rh"] },
};
export const PAPEIS = { admin: "Administrador", rh: "RH", gestor: "Gestor" };

const app = document.getElementById("app");
const estado = { eu: null, viewAtual: null, limpeza: null };

try {
  const t = localStorage.getItem("nx-tema");
  if (t) document.documentElement.dataset.theme = t;
} catch {
  /* sem armazenamento */
}
function alternarTema() {
  const escuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = escuro ? "light" : "dark";
  try {
    localStorage.setItem("nx-tema", document.documentElement.dataset.theme);
  } catch {
    /* sem armazenamento */
  }
}

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
  pode: (...papeis) => papeis.includes(estado.eu.usuario.papel),
};

async function recarregarEu() {
  estado.eu = await get("/eu");
  atualizarSelos();
  return estado.eu;
}

function atualizarSelos() {
  const c = estado.eu?.contagem ?? {};
  for (const [id, r] of Object.entries(ROTAS)) {
    const el = document.querySelector(`[data-rota="${id}"] .selo`);
    if (!el) continue;
    const n = [r.selo].flat().reduce((s, k) => s + (c[k] ?? 0), 0);
    el.textContent = n > 99 ? "99+" : String(n);
    el.hidden = !n;
  }
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
    limpar(area);
    estado.limpeza = (await mod.render(area, ctx, resto)) ?? null;
  } catch (e) {
    console.error(e);
    limpar(area, h("div", { class: "vazio" }, h("h3", {}, "Não foi possível abrir esta tela"), h("p", {}, e.message)));
  }
}

function layout() {
  const { usuario, empresa } = estado.eu;
  const nomeEmpresa = empresa.nome_fantasia || empresa.razao_social;
  const itens = Object.entries(ROTAS).filter(([, r]) => !r.papeis || r.papeis.includes(usuario.papel));
  return h(
    "div",
    { class: "casca" },
    h(
      "aside",
      { class: "lateral" },
      h("a", { class: "marca", href: "#/inicio" }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 32, height: 32 }), h("span", {}, h("strong", {}, "Nexor"), " RH")),
      h("nav", { class: "menu", "aria-label": "Menu principal" }, itens.map(([id, r]) => h("a", { class: "menu-item", href: `#/${id}`, dataset: { rota: id } }, icone(r.icone, 19), h("span", {}, r.titulo), r.selo ? h("span", { class: "selo", hidden: true }) : null))),
      h(
        "div",
        { class: "lateral-rodape" },
        h("div", { class: "empresa-atual" }, avatar(nomeEmpresa, empresa.id, 32), h("div", {}, h("strong", {}, nomeEmpresa), h("small", {}, usuario.nome, " · ", PAPEIS[usuario.papel]))),
        h(
          "div",
          { class: "lateral-acoes" },
          h("button", { class: "btn-icone", title: "Alternar tema claro/escuro", "aria-label": "Alternar tema", onclick: alternarTema }, icone("lua")),
          h("button", { class: "btn-icone", title: "Sair", "aria-label": "Sair", onclick: async () => (await post("/sair"), location.reload()) }, icone("sair")),
          h("span", { class: "conexao", title: "Tempo real conectado" }),
        ),
      ),
    ),
    h(
      "div",
      { class: "principal" },
      h("header", { class: "topo-movel" }, h("button", { class: "btn-icone", "aria-label": "Abrir menu", onclick: () => document.body.classList.toggle("menu-aberto") }, icone("menu")), h("img", { src: "/img/logo-mark.webp", alt: "", width: 26, height: 26 }), h("strong", {}, "Nexor RH")),
      h("main", { id: "conteudo", class: "conteudo" }),
    ),
    h("div", { class: "veu", onclick: () => document.body.classList.remove("menu-aberto") }),
  );
}

function tempoReal() {
  let agendado;
  const recontar = () => {
    clearTimeout(agendado);
    agendado = setTimeout(() => recarregarEu().catch(() => {}), 500);
  };
  const repassar = (tipo) => (d) => estado.viewAtual?.aoEvento?.(tipo, d);
  conectarEventos({
    conexao: (ok) => document.querySelector(".conexao")?.classList.toggle("off", !ok),
    marcacao: repassar("marcacao"),
    solicitacao: (d) => {
      aviso(`📩 ${d.nome} enviou ${{ ajuste: "um pedido de ajuste de ponto", ferias: "um pedido de férias", atestado: "um atestado" }[d.tipo]}.`, "info", 7000);
      recontar();
      repassar("solicitacao")(d);
    },
    candidato: (d) => {
      aviso(`🧑‍💼 Nova candidatura para ${d.vaga}.`, "info");
      recontar();
    },
    ajuste: recontar,
    ferias: recontar,
  });
}

async function iniciar() {
  definirAoDeslogar(() => estado.eu && location.reload());
  const st = await get("/estado").catch(() => ({ logado: false }));
  if (!st.logado) {
    const { renderLogin } = await import("./views/login.js");
    return renderLogin(app, st, () => location.reload());
  }
  await recarregarEu();
  limpar(app, layout());
  atualizarSelos();
  tempoReal();
  window.addEventListener("hashchange", renderizarRota);
  if (!location.hash) location.hash = "#/inicio";
  renderizarRota();
}

iniciar().catch((e) => {
  console.error(e);
  limpar(app, h("div", { class: "vazio" }, h("h3", {}, "Não foi possível carregar o painel"), h("p", {}, e.message)));
});
