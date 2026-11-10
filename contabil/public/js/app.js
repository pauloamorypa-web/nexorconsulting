/* Painel do Nexor Contábil: login, menu, rotas, faixa do contrato e acesso do Suporte Nexor. */

import { definirAoDeslogar, get, post } from "./api.js";
import { acao, aviso, avatar, h, icone, limpar } from "./ui.js";
import { formulario } from "./comum.js";

const ROTAS = {
  inicio: { titulo: "Início", icone: "inicio", carregar: () => import("./views/inicio.js") },
  clientes: { titulo: "Clientes", icone: "predio", carregar: () => import("./views/clientes.js") },
  documentos: { titulo: "Documentos", icone: "nota", carregar: () => import("./views/documentos.js"), selo: "documentos" },
  cobranca: { titulo: "Cobrança de documentos", icone: "sino", carregar: () => import("./views/cobranca.js"), modulo: "modulo.cobranca" },
  // Só no Modo Demonstração (DEMO=1): honorários com o Asaas simulado
  honorarios: { titulo: "Honorários", icone: "raio", carregar: () => import("./views/honorarios.js"), demo: true },
  obrigacoes: { titulo: "Obrigações e prazos", icone: "agenda", carregar: () => import("./views/obrigacoes.js"), modulo: "modulo.obrigacoes", selo: "tarefas" },
  lancamentos: { titulo: "Lançamentos", icone: "grafico", carregar: () => import("./views/lancamentos.js"), modulo: "modulo.leitura" },
  entregas: { titulo: "Guias e relatórios", icone: "upload", carregar: () => import("./views/entregas.js"), modulo: "modulo.portal" },
  chamados: { titulo: "Chamados", icone: "conversas", carregar: () => import("./views/chamados.js"), modulo: "modulo.portal", selo: "chamados" },
  config: { titulo: "Configurações", icone: "config", carregar: () => import("./views/config.js"), papeis: ["dono", "admin"] },
};
export const PAPEIS = { dono: "Dono", admin: "Administrador", equipe: "Equipe" };

const app = document.getElementById("app");
const estado = { eu: null, limpeza: null };
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
  pode: (...p) => p.includes(estado.eu.usuario.papel),
  oculto: (k) => !estado.eu.usuario.nexor && (estado.eu.ocultos ?? []).includes(k),
  get nexor() {
    return Boolean(estado.eu?.usuario?.nexor);
  },
};
const disponivel = (r) => (!r.papeis || r.papeis.includes(estado.eu.usuario.papel)) && !(r.modulo && ctx.oculto(r.modulo)) && !(r.demo && !estado.eu.demo);
const suspenso = () => estado.eu?.licenca?.situacao === "bloqueado" && !estado.eu.usuario.nexor;

async function recarregarEu() {
  estado.eu = await get("/eu");
  const c = estado.eu.contagem;
  for (const [id, r] of Object.entries(ROTAS)) {
    const el = document.querySelector(`[data-rota="${id}"] .selo`);
    if (!el || !r.selo) continue;
    const n = c[r.selo] ?? 0;
    el.textContent = n > 99 ? "99+" : String(n);
    el.hidden = !n;
  }
  return estado.eu;
}

async function renderizarRota() {
  const [nome, ...resto] = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
  const rota = ROTAS[nome] ? nome : "inicio";
  if (!disponivel(ROTAS[rota])) return navegar("inicio");
  document.querySelectorAll(".menu-item").forEach((el) => el.classList.toggle("ativo", el.dataset.rota === rota));
  document.body.classList.remove("menu-aberto");
  const area = document.getElementById("conteudo");
  estado.limpeza?.();
  estado.limpeza = null;
  limpar(area, h("div", { class: "carregando-bloco" }, h("span", { class: "girando" })));
  if (suspenso()) return limpar(area, telaSuspensa());
  try {
    const mod = await ROTAS[rota].carregar();
    limpar(area);
    estado.limpeza = (await mod.render(area, ctx, resto)) ?? null;
  } catch (e) {
    console.error(e);
    limpar(area, h("div", { class: "vazio" }, h("h3", {}, "Não foi possível abrir esta tela"), h("p", {}, e.message)));
  }
}

function telaSuspensa() {
  const l = estado.eu.licenca;
  return h(
    "div",
    { class: "pagina" },
    h(
      "section",
      { class: "cartao suspenso" },
      h("div", { class: "suspenso-icone" }, icone("alerta", 28)),
      h("h1", {}, "Sistema suspenso"),
      h("p", {}, l.mensagem || "O acesso está suspenso. Fale com a Nexor."),
      h(
        "div",
        { class: "suspenso-acoes" },
        l.link ? h("a", { class: "btn btn-primario", href: l.link, target: "_blank", rel: "noopener" }, "Pagar agora") : null,
        l.contato?.whatsapp ? h("a", { class: "btn btn-fantasma", href: `https://wa.me/${String(l.contato.whatsapp).replace(/\D/g, "")}`, target: "_blank", rel: "noopener" }, icone("whatsapp", 16), "Falar com a Nexor") : null,
        h("a", { class: "btn btn-fantasma", href: `mailto:${l.contato?.email || "contato@nexorconsultingit.com.br"}` }, icone("enviar", 16), "Enviar e-mail"),
      ),
      h("p", { class: "suave pequeno" }, "Os documentos e os dados dos seus clientes continuam guardados. O que chegar pelo WhatsApp fica salvo e é tratado assim que o sistema voltar, sozinho, em até 5 minutos depois do pagamento."),
    ),
  );
}
function faixa() {
  const { licenca, usuario } = estado.eu;
  const sit = licenca?.situacao;
  if (usuario.nexor) return h("div", { class: "faixa faixa-nexor" }, icone("escudo", 16), h("span", {}, "Você está no sistema do cliente como ", h("strong", {}, "Suporte Nexor"), sit && sit !== "ativo" ? ` · contrato: ${sit}` : "", ". Cada ação fica na auditoria do escritório."));
  if (sit === "aviso" || sit === "restrito") return h("div", { class: `faixa faixa-${sit}` }, icone("alerta", 16), h("span", {}, licenca.mensagem), licenca.link ? h("a", { href: licenca.link, target: "_blank", rel: "noopener" }, "Pagar agora") : null);
  if (!estado.eu.ia && ctx.pode("dono", "admin")) return h("div", { class: "faixa faixa-aviso" }, icone("alerta", 16), h("span", {}, "A leitura com IA está desligada neste servidor (falta a chave ANTHROPIC_API_KEY). Os documentos são recebidos normalmente."));
  return null;
}

function layout() {
  const { usuario, escritorio } = estado.eu;
  const nome = escritorio.nome_fantasia || escritorio.razao_social;
  const itens = suspenso() ? [] : Object.entries(ROTAS).filter(([, r]) => disponivel(r));
  return h(
    "div",
    { class: "casca" },
    h(
      "aside",
      { class: "lateral" },
      h("a", { class: "marca", href: "#/inicio" }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 32, height: 32 }), h("span", {}, h("strong", {}, "Nexor"), " Contábil")),
      h("nav", { class: "menu", "aria-label": "Menu principal" }, itens.map(([id, r]) => h("a", { class: "menu-item", href: `#/${id}`, dataset: { rota: id } }, icone(r.icone, 19), h("span", {}, r.titulo), r.selo ? h("span", { class: "selo", hidden: true }) : null))),
      h(
        "div",
        { class: "lateral-rodape" },
        h("div", { class: "empresa-atual" }, avatar(nome, escritorio.id, 32), h("div", {}, h("strong", {}, nome), h("small", {}, usuario.nexor ? usuario.nome : [usuario.nome, " · ", PAPEIS[usuario.papel]]))),
        h(
          "div",
          { class: "lateral-acoes" },
          h("button", { class: "btn-icone", title: "Alternar tema", "aria-label": "Alternar tema", onclick: alternarTema }, icone("lua")),
          h("button", { class: "btn-icone", title: "Sair", "aria-label": "Sair", onclick: async () => (await post("/sair"), location.reload()) }, icone("sair")),
        ),
      ),
    ),
    h(
      "div",
      { class: "principal" },
      h("header", { class: "topo-movel" }, h("button", { class: "btn-icone", "aria-label": "Abrir menu", onclick: () => document.body.classList.toggle("menu-aberto") }, icone("menu")), h("img", { src: "/img/logo-mark.webp", alt: "", width: 26, height: 26 }), h("strong", {}, "Nexor Contábil")),
      faixa(),
      h("main", { id: "conteudo", class: "conteudo" }),
    ),
    h("div", { class: "veu", onclick: () => document.body.classList.remove("menu-aberto") }),
  );
}

function login(st) {
  const cadastro = st.primeiroAcesso;
  const f = cadastro
    ? formulario([
        { nome: "razao_social", rotulo: "Razão social do escritório", obrigatorio: true, largura: 2 },
        { nome: "nome_fantasia", rotulo: "Nome do escritório", largura: 2 },
        { nome: "cnpj", rotulo: "CNPJ", obrigatorio: true, largura: 2 },
        { nome: "nome", rotulo: "Seu nome", obrigatorio: true, largura: 2 },
        { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largura: 2 },
        { nome: "senha", rotulo: "Senha", tipo: "senha", obrigatorio: true, largura: 2, ajuda: "Mínimo de 8 caracteres." },
        ...(st.exigeCodigo ? [{ nome: "codigo_instalacao", rotulo: "Código de instalação", obrigatorio: true, largura: 2, ajuda: "Fornecido pela Nexor na implantação." }] : []),
      ])
    : formulario([
        { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largura: 2 },
        { nome: "senha", rotulo: "Senha", tipo: "senha", obrigatorio: true, largura: 2 },
      ]);
  const b = h("button", { class: "btn btn-primario btn-grande", type: "submit" }, cadastro ? "Criar a conta do escritório" : "Entrar");
  const form = h("form", { class: "login-form", onsubmit: (e) => (e.preventDefault(), acao(b, async () => (await post(cadastro ? "/cadastro" : "/entrar", f.ler()), location.reload()))) }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 48, height: 48, class: "login-logo" }), h("h1", {}, cadastro ? "Vamos cadastrar o escritório" : "Entrar no Nexor Contábil"), h("p", { class: "suave" }, cadastro ? "Depois você convida a equipe e cadastra a carteira." : "Acesso da equipe do escritório."), f.el, b, h("p", { class: "suave pequeno centro" }, "É cliente do escritório? ", h("a", { href: "/portal/" }, "Abra o portal")));
  limpar(
    app,
    h(
      "div",
      { class: "login" },
      h(
        "section",
        { class: "login-vitrine" },
        h("div", { class: "login-marca" }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 36, height: 36 }), h("span", {}, h("strong", {}, "Nexor"), " Contábil")),
        h("h2", {}, "O escritório no piloto automático. ", h("span", { class: "gradiente" }, "O contador no papel de consultor.")),
        h(
          "ul",
          { class: "login-destaques" },
          [
            ["sino", "Cobrança de documentos sem ninguém cobrar", "A lista do que falta vai sozinha pelo WhatsApp e e-mail, no prazo de cada cliente."],
            ["nota", "A IA lê, confere e prepara o lançamento", "Notas, extratos e recibos lidos, com alerta de CNPJ, duplicidade e conciliação sugerida."],
            ["agenda", "Obrigações e prazos de toda a carteira", "DAS, FGTS, eSocial, EFD e o que mais o escritório cadastrar, por cliente e departamento."],
            ["predio", "Portal e WhatsApp com a marca do escritório", "O cliente envia, baixa guias e abre chamados num só lugar."],
          ].map(([ic, t, d]) => h("li", {}, h("span", { class: "login-ic" }, icone(ic, 20)), h("div", {}, h("strong", {}, t), h("p", {}, d)))),
        ),
        h("small", { class: "login-rodape" }, "Nexor Consulting · nexorconsultingit.com.br"),
      ),
      h("section", { class: "login-painel" }, form),
    ),
  );
  form.querySelector("input")?.focus();
}

async function iniciar() {
  definirAoDeslogar(() => estado.eu && location.reload());
  const st = await get("/estado").catch(() => ({ logado: false }));
  if (!st.logado) return login(st);
  await recarregarEu();
  limpar(app, layout());
  await recarregarEu();
  window.addEventListener("hashchange", renderizarRota);
  if (!location.hash) location.hash = "#/inicio";
  renderizarRota();
}
iniciar().catch((e) => {
  console.error(e);
  limpar(app, h("div", { class: "vazio" }, h("h3", {}, "Não foi possível carregar o painel"), h("p", {}, e.message)));
});
export { aviso };
