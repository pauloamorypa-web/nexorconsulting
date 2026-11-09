/* Painel do Nexor Barber: login, menu por papel, rotas, faixa do contrato e acesso do Suporte Nexor. */

import { definirAoDeslogar, get, post } from "./api.js";
import { acao, aviso, avatar, h, icone, limpar } from "./ui.js";
import { formulario } from "./comum.js";
import { caixaAceite, telaTermos } from "./lgpd.js";

const TODOS = ["dono", "admin", "recepcao", "barbeiro"];
const EQUIPE = ["dono", "admin", "recepcao"];
const ADM = ["dono", "admin"];
const ROTAS = {
  hoje: { titulo: "Agenda", icone: "calendario", carregar: () => import("./views/hoje.js"), papeis: TODOS, selo: "chegaram" },
  clientes: { titulo: "Clientes", icone: "contatos", carregar: () => import("./views/clientes.js"), papeis: TODOS },
  clube: { titulo: "Clube de assinatura", icone: "coroa", carregar: () => import("./views/clube.js"), papeis: EQUIPE, modulo: "modulo.clube", selo: "clube_atraso" },
  produtos: { titulo: "Produtos e estoque", icone: "sacola", carregar: () => import("./views/produtos.js"), papeis: EQUIPE, modulo: "modulo.produtos", selo: "estoque_baixo" },
  caixa: { titulo: "Caixa e vendas", icone: "dinheiro", carregar: () => import("./views/caixa.js"), papeis: EQUIPE },
  comissoes: { titulo: "Comissões", icone: "grafico", carregar: () => import("./views/comissoes.js"), papeis: TODOS },
  folgas: { titulo: "Folgas e horários", icone: "relogio", carregar: () => import("./views/folgas.js"), papeis: TODOS },
  relatorios: { titulo: "Relatórios", icone: "raio", carregar: () => import("./views/relatorios.js"), papeis: ADM, modulo: "modulo.relatorios" },
  config: { titulo: "Configurações", icone: "config", carregar: () => import("./views/config.js"), papeis: ADM },
};
export const PAPEIS = { dono: "Dono", admin: "Administrador", recepcao: "Recepção", barbeiro: "Barbeiro" };

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
  get barbeiro() {
    return estado.eu.usuario.papel === "barbeiro";
  },
  oculto: (k) => !estado.eu.usuario.nexor && (estado.eu.ocultos ?? []).includes(k),
  get nexor() {
    return Boolean(estado.eu?.usuario?.nexor);
  },
};
const disponivel = (r) => r.papeis.includes(estado.eu.usuario.papel) && !(r.modulo && ctx.oculto(r.modulo));
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
  const rota = ROTAS[nome] ? nome : "hoje";
  if (!disponivel(ROTAS[rota])) return navegar("hoje");
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
      ),
      h("p", { class: "suave pequeno" }, "A agenda, os clientes e as vendas continuam guardados. O sistema volta sozinho em até 5 minutos depois do pagamento."),
    ),
  );
}
function faixa() {
  const { licenca, usuario } = estado.eu;
  const sit = licenca?.situacao;
  if (usuario.nexor) return h("div", { class: "faixa faixa-nexor" }, icone("escudo", 16), h("span", {}, "Você está no sistema do cliente como ", h("strong", {}, "Suporte Nexor"), sit && sit !== "ativo" ? ` · contrato: ${sit}` : "", ". Cada ação fica na auditoria da barbearia."));
  if (sit === "aviso" || sit === "restrito") return h("div", { class: `faixa faixa-${sit}` }, icone("alerta", 16), h("span", {}, licenca.mensagem), licenca.link ? h("a", { href: licenca.link, target: "_blank", rel: "noopener" }, "Pagar agora") : null);
  return null;
}

function layout() {
  const { usuario, barbearia } = estado.eu;
  const itens = suspenso() ? [] : Object.entries(ROTAS).filter(([, r]) => disponivel(r));
  return h(
    "div",
    { class: "casca" },
    h(
      "aside",
      { class: "lateral" },
      h("a", { class: "marca", href: "#/hoje" }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 32, height: 32 }), h("span", {}, h("strong", {}, "Nexor"), " Barber")),
      h("nav", { class: "menu", "aria-label": "Menu principal" }, itens.map(([id, r]) => h("a", { class: "menu-item", href: `#/${id}`, dataset: { rota: id } }, icone(r.icone, 19), h("span", {}, r.titulo), r.selo ? h("span", { class: "selo", hidden: true }) : null))),
      h(
        "div",
        { class: "lateral-rodape" },
        h("a", { class: "btn btn-fantasma btn-pequeno link-app", href: estado.eu.link_app, target: "_blank", rel: "noopener" }, icone("celular", 15), "Abrir o app do cliente"),
        h("div", { class: "empresa-atual" }, avatar(barbearia.nome, barbearia.id, 32), h("div", {}, h("strong", {}, barbearia.nome), h("small", {}, usuario.nexor ? usuario.nome : [usuario.nome, " · ", PAPEIS[usuario.papel]]))),
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
      h("header", { class: "topo-movel" }, h("button", { class: "btn-icone", "aria-label": "Abrir menu", onclick: () => document.body.classList.toggle("menu-aberto") }, icone("menu")), h("img", { src: "/img/logo-mark.webp", alt: "", width: 26, height: 26 }), h("strong", {}, barbearia.nome)),
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
        { nome: "barbearia", rotulo: "Nome da barbearia", obrigatorio: true, largura: 2 },
        { nome: "nome", rotulo: "Seu nome", obrigatorio: true, largura: 2 },
        { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largura: 2 },
        { nome: "senha", rotulo: "Senha", tipo: "senha", obrigatorio: true, largura: 2, ajuda: "Mínimo de 8 caracteres." },
        { nome: "tambem_corta", rotulo: "Eu também atendo clientes (entro na agenda como barbeiro)", tipo: "check", padrao: true, largura: 2 },
        ...(st.exigeCodigo ? [{ nome: "codigo_instalacao", rotulo: "Código de instalação", obrigatorio: true, largura: 2, ajuda: "Fornecido pela Nexor na implantação." }] : []),
      ])
    : formulario([
        { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largura: 2 },
        { nome: "senha", rotulo: "Senha", tipo: "senha", obrigatorio: true, largura: 2 },
      ]);
  // Cadastro: aceite dos termos, desmarcado por padrão (gravado com versão, data e IP)
  const aceite = cadastro ? caixaAceite() : null;
  const b = h("button", { class: "btn btn-primario btn-grande", type: "submit" }, cadastro ? "Criar a barbearia" : "Entrar");
  const form = h(
    "form",
    { class: "login-form", onsubmit: (e) => (e.preventDefault(), acao(b, async () => (await post(cadastro ? "/cadastro" : "/entrar", cadastro ? { ...f.ler(), aceite_termos: aceite.marcado() } : f.ler()), location.reload()))) },
    h("img", { src: "/img/logo-mark.webp", alt: "", width: 48, height: 48, class: "login-logo" }),
    h("h1", {}, cadastro ? "Vamos abrir a sua barbearia" : "Entrar no Nexor Barber"),
    h("p", { class: "suave" }, cadastro ? "Já criamos 4 serviços de exemplo e o expediente padrão. Você muda tudo depois." : "Acesso do dono, da recepção e dos barbeiros."),
    f.el,
    aceite?.el,
    b,
    h("p", { class: "suave pequeno centro" }, "É cliente da barbearia? ", h("a", { href: "/app/" }, "Agende pelo app")),
  );
  limpar(
    app,
    h(
      "div",
      { class: "login" },
      h(
        "section",
        { class: "login-vitrine" },
        h("div", { class: "login-marca" }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 36, height: 36 }), h("span", {}, h("strong", {}, "Nexor"), " Barber")),
        h("h2", {}, "A cadeira cheia ", h("span", { class: "gradiente" }, "sem ninguém no telefone.")),
        h(
          "ul",
          { class: "login-destaques" },
          [
            ["celular", "Agendamento em um toque", "O cliente entra com Google, WhatsApp ou SMS e o app já sugere o barbeiro e o horário de sempre."],
            ["raio", "Vaga cancelada vira cliente atendido", "A lista de espera recebe a vaga na hora pelo WhatsApp. Quem confirmar primeiro leva."],
            ["coroa", "Clube de assinatura com cobrança automática", "Planos com serviços incluídos, limite por mês, dias da semana e desconto em produtos."],
            ["sacola", "Produtos, comanda e comissões", "Estoque, reserva pelo app, venda na comanda e comissão de cada barbeiro calculada sozinha."],
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
  // LGPD: versão nova dos termos (ou usuário convidado no primeiro acesso) → aceite antes do painel
  if (estado.eu.termos?.pendente) return limpar(app, telaTermos(estado.eu.termos, () => location.reload()));
  limpar(app, layout());
  await recarregarEu();
  window.addEventListener("hashchange", renderizarRota);
  if (!location.hash) location.hash = "#/hoje";
  renderizarRota();
  // A recepção vê na hora quem tocou em "Estou chegando"
  setInterval(() => document.visibilityState === "visible" && recarregarEu().catch(() => {}), 60_000);
}
iniciar().catch((e) => {
  console.error(e);
  limpar(app, h("div", { class: "vazio" }, h("h3", {}, "Não foi possível carregar o painel"), h("p", {}, e.message)));
});
export { aviso };
