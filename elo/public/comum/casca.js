/* Nexor Elo · casca dos painéis (fornecedor e operação Nexor): login, menu lateral, topo no celular,
   rotas com hash (#/produtos), tema claro/escuro e avisos. Cada painel só descreve o menu e as telas. */

import { h, icone, limpar, acao, aviso, campo, entrada, carregandoBloco, vazio, selo, avatar } from "./ui.js";

const temaAtual = () => document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
export function alternarTema() {
  const novo = temaAtual() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = novo;
  try {
    localStorage.setItem("nx-elo-tema", novo);
  } catch {
    /* sem armazenamento: vale só nesta aba */
  }
  return novo;
}
export function botaoTema(classe = "btn-icone") {
  const b = h("button", { type: "button", class: `${classe} tema-btn` });
  const pintar = () => {
    const escuro = temaAtual() === "dark";
    limpar(b, icone(escuro ? "sol" : "lua"));
    b.setAttribute("aria-label", escuro ? "Usar tema claro" : "Usar tema escuro");
    b.title = b.getAttribute("aria-label");
  };
  b.addEventListener("click", () => (alternarTema(), pintar()));
  pintar();
  return b;
}

/** Lê a rota do hash: "#/vinculos/abc" → { rota: "vinculos", params: ["abc"] } */
export function lerRota() {
  const partes = location.hash.replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean).map(decodeURIComponent);
  const q = new URLSearchParams(location.hash.split("?")[1] ?? "");
  return { rota: partes[0] ?? "", params: partes.slice(1), query: q };
}
export const irPara = (rota) => (location.hash = `#/${rota}`);

/**
 * Inicia um painel.
 * cfg: { area, nome, subtitulo, api, menu(eu) → [{ id, rotulo, icone, grupo?, selo? }], telas: { id: (ctx) => Node | Promise<Node> },
 *        login: { titulo, texto, destaques: [[icone, titulo, texto]], rodape }, faixa(eu) → Node|null, perfil(eu) → texto }
 */
export function iniciarPainel(cfg) {
  const raiz = document.getElementById("app");
  const { api } = cfg;
  let eu = null;
  let menuItens = [];
  let geracao = 0;

  api.definirAoDeslogar(() => {
    if (eu) aviso("Sua sessão terminou. Entre de novo.", "info");
    eu = null;
    telaLogin();
  });

  async function carregarEu() {
    try {
      eu = await api.get("/eu");
    } catch (e) {
      eu = null;
      if (e.status !== 401) throw e;
    }
    return eu;
  }

  /* ---------- Login ---------- */
  function telaLogin(mensagem) {
    document.title = `Entrar · ${cfg.nome} · Nexor Elo`;
    const email = entrada({ type: "email", autocomplete: "username", required: true, inputmode: "email" });
    const senha = entrada({ type: "password", autocomplete: "current-password", required: true });
    const erroEl = h("p", { class: "perigo pequeno", role: "alert", hidden: !mensagem }, mensagem ?? "");
    const enviar = h("button", { type: "submit", class: "btn btn-primario btn-grande" }, "Entrar");
    const form = h(
      "form",
      { class: "login-form", novalidate: true },
      h("img", { src: "/comum/img/logo-mark.webp", alt: "", width: 48, height: 48, class: "login-logo" }),
      h("h1", {}, cfg.login.titulo),
      h("p", { class: "suave" }, cfg.login.texto),
      campo("E-mail", email),
      campo("Senha", senha),
      erroEl,
      enviar,
      cfg.login.extra ?? null,
      h("a", { class: "btn-link", href: "/" }, "Voltar para o início"),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      erroEl.hidden = true;
      if (!email.value.trim() || !senha.value) {
        erroEl.textContent = "Preencha o e-mail e a senha.";
        erroEl.hidden = false;
        return;
      }
      acao(enviar, async () => {
        try {
          await api.post("/entrar", { email: email.value.trim(), senha: senha.value });
        } catch (err) {
          erroEl.textContent = err.status === 401 ? "E-mail ou senha incorretos." : err.message;
          erroEl.hidden = false;
          senha.select();
          return;
        }
        await iniciar();
      });
    });
    limpar(
      raiz,
      h(
        "main",
        { class: "login" },
        h(
          "section",
          { class: "login-vitrine", "aria-label": "Sobre o Nexor Elo" },
          h("div", { class: "login-marca" }, h("img", { src: "/comum/img/logo-mark.webp", alt: "", width: 32, height: 32 }), "Nexor Elo"),
          h("h2", {}, cfg.login.chamada),
          h("ul", { class: "login-destaques" }, cfg.login.destaques.map(([ic, t, d]) => h("li", {}, h("span", { class: "login-ic" }, icone(ic, 20)), h("div", {}, h("strong", {}, t), h("p", {}, d))))),
          h("small", { class: "login-rodape" }, "Nexor Consulting · dados protegidos pela LGPD"),
        ),
        h("section", { class: "login-painel" }, form),
      ),
    );
    email.focus();
  }

  /* ---------- Casca ---------- */
  let elMenu, elConteudo, elFaixa, casca;
  function montarCasca() {
    elMenu = h("nav", { class: "menu", "aria-label": "Menu principal" });
    elConteudo = h("main", { class: "conteudo", id: "conteudo", tabindex: "-1" });
    elFaixa = h("div", { class: "faixas" });
    const fecharMenu = () => {
      casca.classList.remove("menu-aberto");
      botaoMenu.setAttribute("aria-expanded", "false");
    };
    const botaoMenu = h("button", { type: "button", class: "btn-icone", "aria-label": "Abrir o menu", "aria-expanded": "false", "aria-controls": "lateral" }, icone("menu"));
    botaoMenu.addEventListener("click", () => {
      const aberto = casca.classList.toggle("menu-aberto");
      botaoMenu.setAttribute("aria-expanded", String(aberto));
      if (aberto) elMenu.querySelector("a")?.focus();
    });
    const sair = h("button", { type: "button", class: "btn-icone", "aria-label": "Sair", title: "Sair" }, icone("sair"));
    sair.addEventListener("click", () =>
      acao(sair, async () => {
        await api.post("/sair").catch(() => null);
        eu = null;
        location.hash = "";
        telaLogin();
      }),
    );
    const nomeConta = eu.conta.nome_fantasia || eu.conta.razao_social;
    casca = h(
      "div",
      { class: "casca" },
      h(
        "aside",
        { class: "lateral", id: "lateral" },
        h("a", { class: "marca", href: "#/" }, h("img", { src: "/comum/img/logo-mark.webp", alt: "", width: 30, height: 30 }), h("span", {}, "Nexor Elo", h("small", {}, cfg.subtitulo))),
        elMenu,
        h(
          "div",
          { class: "lateral-rodape" },
          h("div", { class: "empresa-atual" }, avatar(eu.usuario.nome, 34), h("div", { style: { minWidth: "0" } }, h("strong", {}, eu.usuario.nome), h("small", {}, `${cfg.perfil?.(eu) ?? eu.usuario.papel} · ${nomeConta}`))),
          h("div", { class: "lateral-acoes" }, botaoTema(), sair),
        ),
      ),
      h("div", { class: "veu", onclick: fecharMenu }),
      h(
        "div",
        { class: "principal" },
        h("header", { class: "topo-movel" }, botaoMenu, h("img", { src: "/comum/img/logo-mark.webp", alt: "", width: 26, height: 26 }), h("strong", {}, "Nexor Elo"), h("span", { class: "espaco" }), botaoTema()),
        elFaixa,
        elConteudo,
      ),
    );
    casca.addEventListener("keydown", (e) => e.key === "Escape" && casca.classList.contains("menu-aberto") && (fecharMenu(), botaoMenu.focus()));
    elMenu.addEventListener("click", (e) => e.target.closest("a") && fecharMenu());
    limpar(raiz, h("a", { class: "pular", href: "#conteudo", onclick: (e) => (e.preventDefault(), elConteudo.focus()) }, "Pular para o conteúdo"), casca);
  }

  function pintarMenu(rotaAtual) {
    menuItens = cfg.menu(eu);
    const itens = [];
    let grupo = null;
    for (const m of menuItens) {
      if (m.grupo && m.grupo !== grupo) {
        grupo = m.grupo;
        itens.push(h("div", { class: "menu-grupo", "aria-hidden": "true" }, grupo));
      }
      itens.push(h("a", { class: `menu-item ${m.id === rotaAtual ? "ativo" : ""}`, href: `#/${m.id}`, "aria-current": m.id === rotaAtual ? "page" : null }, icone(m.icone), m.rotulo, selo(m.selo?.(eu))));
    }
    limpar(elMenu, itens);
    limpar(elFaixa, cfg.faixa?.(eu) ?? null);
  }

  async function navegar() {
    if (!eu) return;
    const minha = ++geracao;
    let { rota, params, query } = lerRota();
    if (!rota || !cfg.menu(eu).some((m) => m.id === rota)) {
      const existe = rota && cfg.telas[rota];
      if (rota && existe && !cfg.menu(eu).some((m) => m.id === rota)) {
        pintarMenu("");
        limpar(elConteudo, h("div", { class: "pagina" }, h("h1", { tabindex: "-1" }, "Acesso restrito"), h("div", { class: "cartao sem-permissao" }, vazio("cadeado", "Seu perfil não acessa esta tela", "Peça ao dono da conta para mudar o seu perfil se precisar."))));
        document.title = `Acesso restrito · ${cfg.nome} · Nexor Elo`;
        elConteudo.querySelector("h1").focus({ preventScroll: true });
        return;
      }
      rota = cfg.menu(eu)[0].id;
      history.replaceState(null, "", `#/${rota}`);
    }
    pintarMenu(rota);
    const item = menuItens.find((m) => m.id === rota);
    document.title = `${item?.rotulo ?? ""} · ${cfg.nome} · Nexor Elo`;
    limpar(elConteudo, carregandoBloco());
    const ctx = {
      eu,
      api,
      params,
      query,
      recarregar: () => navegar(),
      atualizarEu: async () => {
        await carregarEu();
        if (eu) pintarMenu(lerRota().rota);
      },
    };
    try {
      const tela = await cfg.telas[rota](ctx);
      if (minha !== geracao) return;
      limpar(elConteudo, tela);
    } catch (e) {
      if (minha !== geracao || e.status === 401) return;
      limpar(elConteudo, h("div", { class: "pagina" }, h("div", { class: "cartao" }, vazio("alerta", e.status === 403 ? "Seu perfil não acessa esta tela" : "Não foi possível abrir esta tela", e.message, h("button", { type: "button", class: "btn", onclick: () => navegar() }, "Tentar de novo")))));
    }
    elConteudo.scrollTop = 0;
    const h1 = elConteudo.querySelector("h1");
    if (h1) {
      h1.setAttribute("tabindex", "-1");
      h1.focus({ preventScroll: true });
    }
  }

  async function iniciar() {
    limpar(raiz, h("div", { class: "carregando-tela", role: "status" }, h("img", { src: "/comum/img/logo-mark.webp", alt: "", width: 56, height: 56 }), h("span", {}, "Carregando o Nexor Elo…")));
    try {
      await carregarEu();
    } catch (e) {
      return limpar(raiz, h("main", { class: "pagina" }, h("div", { class: "cartao" }, vazio("alerta", "Não foi possível falar com o servidor", e.message, h("button", { type: "button", class: "btn", onclick: () => iniciar() }, "Tentar de novo")))));
    }
    if (!eu) return cfg.antesDoLogin ? cfg.antesDoLogin({ telaLogin, iniciar }) : telaLogin();
    montarCasca();
    await navegar();
  }

  addEventListener("hashchange", () => {
    navegar();
  });
  iniciar();
  return { navegar };
}
