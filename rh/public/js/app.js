/* Painel do Nexor RH: login, menu, rotas e avisos em tempo real. */

import { conectarEventos, definirAoDeslogar, get, post } from "./api.js";
import { aviso, avatar, h, icone, limpar } from "./ui.js";

const ROTAS = {
  inicio: { titulo: "Início", icone: "inicio", carregar: () => import("./views/inicio.js") },
  colaboradores: { titulo: "Colaboradores", icone: "contatos", carregar: () => import("./views/colaboradores.js") },
  ponto: { titulo: "Ponto", icone: "relogio", carregar: () => import("./views/ponto.js"), selo: "ajustes" },
  ferias: { titulo: "Férias e ausências", icone: "mala", carregar: () => import("./views/ferias.js"), selo: ["ferias", "afastamentos"], modulo: "modulo.ferias" },
  folha: { titulo: "Folha de pagamento", icone: "dinheiro", carregar: () => import("./views/folha.js"), papeis: ["admin", "rh"], modulo: "modulo.folha" },
  recrutamento: { titulo: "Recrutamento", icone: "maleta", carregar: () => import("./views/recrutamento.js"), papeis: ["admin", "rh"], selo: "candidatos", modulo: "modulo.recrutamento" },
  comunicados: { titulo: "Comunicados", icone: "campanhas", carregar: () => import("./views/comunicados.js"), modulo: "modulo.comunicados" },
  esocial: { titulo: "eSocial", icone: "governo", carregar: () => import("./views/esocial.js"), papeis: ["admin", "rh"], selo: "esocial", modulo: "modulo.esocial" },
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
  /** O Suporte Nexor vê tudo; o cliente não vê o que o Suporte escondeu */
  oculto: (chave) => !estado.eu.usuario.nexor && (estado.eu.ocultos ?? []).includes(chave),
  get nexor() {
    return Boolean(estado.eu?.usuario?.nexor);
  },
};

/** A rota está disponível para quem está logado? */
const disponivel = (r) => (!r.papeis || r.papeis.includes(estado.eu.usuario.papel)) && !(r.modulo && ctx.oculto(r.modulo));
const suspenso = () => estado.eu?.licenca?.situacao === "bloqueado" && !estado.eu.usuario.nexor;

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
  if (!disponivel(def)) return navegar("inicio");
  document.querySelectorAll(".menu-item").forEach((el) => el.classList.toggle("ativo", el.dataset.rota === rota));
  document.body.classList.remove("menu-aberto");
  const area = document.getElementById("conteudo");
  estado.limpeza?.();
  estado.limpeza = null;
  limpar(area, h("div", { class: "carregando-bloco" }, h("span", { class: "girando" })));
  if (suspenso()) return limpar(area, telaSuspensa());
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

/** Sistema suspenso pela Nexor: a tela explica, mostra o link de pagamento e deixa baixar os arquivos legais do ponto */
function telaSuspensa() {
  const { licenca } = estado.eu;
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const mes = hoje.slice(0, 7);
  const baixar = async (caminho, nome) => {
    const r = await fetch(`/api${caminho}`, { headers: { "x-nexor": "1" } });
    if (!r.ok) return aviso((await r.json().catch(() => ({}))).erro ?? "Não foi possível baixar.", "erro");
    const a = h("a", { href: URL.createObjectURL(await r.blob()), download: nome });
    a.click();
  };
  return h(
    "div",
    { class: "pagina" },
    h(
      "section",
      { class: "cartao suspenso" },
      h("div", { class: "suspenso-icone" }, icone("alerta", 28)),
      h("h1", {}, "Sistema suspenso"),
      h("p", {}, licenca.mensagem || "O acesso ao painel está suspenso. Fale com a Nexor."),
      h(
        "div",
        { class: "suspenso-acoes" },
        licenca.link ? h("a", { class: "btn btn-primario", href: licenca.link, target: "_blank", rel: "noopener" }, icone("dinheiro", 16), "Pagar agora") : null,
        licenca.contato?.whatsapp ? h("a", { class: "btn btn-fantasma", href: `https://wa.me/${String(licenca.contato.whatsapp).replace(/\D/g, "")}`, target: "_blank", rel: "noopener" }, icone("whatsapp", 16), "Falar com a Nexor") : null,
        h("a", { class: "btn btn-fantasma", href: `mailto:${licenca.contato?.email || "contato@nexorconsultingit.com.br"}` }, icone("enviar", 16), "Enviar e-mail"),
      ),
      h("p", { class: "suave pequeno" }, "Depois do pagamento confirmado, o sistema volta sozinho em até 5 minutos. Os dados continuam guardados e o registro de ponto dos colaboradores continua funcionando."),
      h("h3", {}, "Arquivos legais do ponto (Portaria 671)"),
      h(
        "div",
        { class: "suspenso-acoes" },
        h("button", { class: "btn btn-fantasma btn-pequeno", onclick: () => baixar(`/ponto/afd?de=${mes}-01&ate=${hoje}`, `AFD-${mes}.txt`) }, icone("download", 16), "AFD do mês"),
        h("button", { class: "btn btn-fantasma btn-pequeno", onclick: () => baixar(`/ponto/aej?competencia=${mes}`, `AEJ-${mes}.txt`) }, icone("download", 16), "AEJ do mês"),
      ),
    ),
  );
}

/** Faixa no topo: aviso de fatura, modo somente leitura ou acesso de suporte */
function faixa() {
  const { licenca, usuario } = estado.eu;
  const sit = licenca?.situacao;
  if (usuario.nexor) return h("div", { class: "faixa faixa-nexor" }, icone("escudo", 16), h("span", {}, "Você está no sistema do cliente como ", h("strong", {}, "Suporte Nexor"), sit && sit !== "ativo" ? ` · contrato: ${sit}` : "", ". Cada ação fica na auditoria do cliente."));
  if (sit === "aviso" || sit === "restrito") return h("div", { class: `faixa faixa-${sit}` }, icone("alerta", 16), h("span", {}, licenca.mensagem), licenca.link ? h("a", { href: licenca.link, target: "_blank", rel: "noopener" }, "Pagar agora") : null);
  return null;
}

function layout() {
  const { usuario, empresa } = estado.eu;
  const nomeEmpresa = empresa.nome_fantasia || empresa.razao_social;
  const itens = suspenso() ? [] : Object.entries(ROTAS).filter(([, r]) => disponivel(r));
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
        h("div", { class: "empresa-atual" }, avatar(nomeEmpresa, empresa.id, 32), h("div", {}, h("strong", {}, nomeEmpresa), h("small", {}, usuario.nexor ? usuario.nome : [usuario.nome, " · ", PAPEIS[usuario.papel]]))),
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
      faixa(),
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
