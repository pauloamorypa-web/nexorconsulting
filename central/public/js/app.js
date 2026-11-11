/* Painel da Nexor Central: visão geral, clientes, faturas, sistemas instalados, equipe e auditoria. */

import { definirAoDeslogar, get, post, put } from "./api.js";
import { acao, aviso, confirmar, copiarTexto, dataHora, h, icone, janela, limpar, quandoRelativo, reais } from "./ui.js";
import { botao, cnpjBR, dataBR, formulario, indicador, tabela, topo } from "./comum.js";

const app = document.getElementById("app");
const estado = { eu: null };
const SIT = { ativo: ["Em dia", "ok"], aviso: ["Aviso de atraso", "alerta"], restrito: ["Somente leitura", "perigo"], bloqueado: ["Bloqueado", "perigo"] };
const FAT = { aberta: ["Em aberto", "alerta"], paga: ["Paga", "ok"], cancelada: ["Cancelada", ""] };
const PAPEIS = { dono: "Dono", financeiro: "Financeiro", suporte: "Suporte" };
const chip = (mapa, k, extra) => {
  const [t, c] = mapa[k] ?? [k, ""];
  return h("span", { class: `chip ${c ? `chip-${c}` : ""}` }, t, extra ?? "");
};
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const TIPOS_PARC = { vendedor: "Vendedor interno", representante: "Representante", indicador: "Parceiro indicador", revenda: "Parceiro revenda", estrategico: "Parceiro estratégico" };
const COM = { prevista: ["Em carência", "alerta"], a_pagar: ["A pagar", "ok"], paga: ["Paga", ""], estornada: ["Estornada", "perigo"] };
/** Situação do cliente, com o teste grátis no lugar do "aviso de atraso" */
const chipCliente = (c) => {
  if (c.status === "cancelado") return chip({ x: ["Cancelado", ""] }, "x");
  if (c.fase === "teste") return c.teste_ate && c.teste_ate >= hoje() ? chip({ t: ["Teste grátis", "alerta"] }, "t", ` até ${dataBR(c.teste_ate)}`) : chip({ t: ["Teste encerrado", "perigo"] }, "t");
  return chip(SIT, c.situacao, c.atraso ? ` · ${c.atraso}d` : "");
};
let catalogo = null;
const pegarCatalogo = async () => (catalogo ??= await get("/catalogo"));
const planosOpcoes = (cat) => Object.entries(cat.planos).flatMap(([prod, g]) => g.planos.filter((p) => p.mensal || p.por_unidade).map((p) => [p.id, `${cat.produtos[prod]} · ${p.nome} · ${p.por_unidade ? (p.franquia ? `${reais(p.minimo)} até ${p.franquia} + ${reais(p.por_unidade)}/${g.unidade}` : `${reais(p.por_unidade)}/${g.unidade} (mín. ${reais(p.minimo)})`) : `${reais(p.mensal)}/mês`}`]));
const acharPlano = (cat, id) => {
  for (const [prod, g] of Object.entries(cat.planos)) {
    const p = g.planos.find((x) => x.id === id);
    if (p) return { ...p, produto: prod, unidade: g.unidade };
  }
  return null;
};
const pode = (...p) => p.includes(estado.eu.usuario.papel);
const nomeCliente = (c) => c.nome_fantasia || c.razao_social;

try {
  const t = localStorage.getItem("nx-tema");
  if (t) document.documentElement.dataset.theme = t;
} catch {
  /* sem armazenamento */
}

/* ---------- Rotas ---------- */
const ROTAS = {
  inicio: { titulo: "Visão geral", icone: "grafico", render: inicio },
  clientes: { titulo: "Clientes", icone: "predio", render: clientes },
  faturas: { titulo: "Faturas", icone: "dinheiro", render: faturas },
  sistemas: { titulo: "Sistemas", icone: "caixa", render: sistemas },
  comercial: { titulo: "Planos e preços", icone: "dinheiro", render: comercial },
  parceiros: { titulo: "Parceiros e comissões", icone: "pessoa", render: parceiros },
  equipe: { titulo: "Equipe Nexor", icone: "pessoa", render: equipe, papeis: ["dono"] },
  auditoria: { titulo: "Auditoria", icone: "nota", render: auditoria },
};
const navegar = (r) => (location.hash = `#/${r}`);
async function renderizar() {
  const [nome, ...resto] = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
  const rota = ROTAS[nome] && (!ROTAS[nome].papeis || pode(...ROTAS[nome].papeis)) ? nome : "inicio";
  document.querySelectorAll(".menu-item").forEach((el) => el.classList.toggle("ativo", el.dataset.rota === rota));
  document.body.classList.remove("menu-aberto");
  const area = document.getElementById("conteudo");
  limpar(area, h("div", { class: "carregando-bloco" }, h("span", { class: "girando" })));
  try {
    limpar(area, await ROTAS[rota].render(...resto));
  } catch (e) {
    console.error(e);
    limpar(area, h("div", { class: "vazio" }, h("h3", {}, "Não foi possível abrir esta tela"), h("p", {}, e.message)));
  }
}
const recarregar = () => renderizar();

function layout() {
  const u = estado.eu.usuario;
  const itens = Object.entries(ROTAS).filter(([, r]) => !r.papeis || pode(...r.papeis));
  return h(
    "div",
    { class: "casca" },
    h(
      "aside",
      { class: "lateral" },
      h("a", { class: "marca", href: "#/inicio" }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 32, height: 32 }), h("span", {}, h("strong", {}, "Nexor"), " Central")),
      h("nav", { class: "menu", "aria-label": "Menu principal" }, itens.map(([id, r]) => h("a", { class: "menu-item", href: `#/${id}`, dataset: { rota: id } }, icone(r.icone, 19), h("span", {}, r.titulo)))),
      h(
        "div",
        { class: "lateral-rodape" },
        h("div", { class: "empresa-atual" }, h("div", {}, h("strong", {}, u.nome), h("small", {}, PAPEIS[u.papel], " · 2FA ativo"))),
        h(
          "div",
          { class: "lateral-acoes" },
          h("button", { class: "btn-icone", title: "Trocar senha", "aria-label": "Trocar senha", onclick: trocarSenha }, icone("escudo")),
          h("button", { class: "btn-icone", title: "Alternar tema", "aria-label": "Alternar tema", onclick: alternarTema }, icone("lua")),
          h("button", { class: "btn-icone", title: "Sair", "aria-label": "Sair", onclick: async () => (await post("/sair"), location.reload()) }, icone("sair")),
        ),
      ),
    ),
    h(
      "div",
      { class: "principal" },
      h("header", { class: "topo-movel" }, h("button", { class: "btn-icone", "aria-label": "Abrir menu", onclick: () => document.body.classList.toggle("menu-aberto") }, icone("menu")), h("img", { src: "/img/logo-mark.webp", alt: "", width: 26, height: 26 }), h("strong", {}, "Nexor Central")),
      h("main", { id: "conteudo", class: "conteudo" }),
    ),
    h("div", { class: "veu", onclick: () => document.body.classList.remove("menu-aberto") }),
  );
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

/* ---------- Login com 2FA ---------- */
function login(st) {
  const tela = (titulo, texto, conteudo) =>
    limpar(
      app,
      h(
        "div",
        { class: "login" },
        h(
          "section",
          { class: "login-vitrine" },
          h("div", { class: "login-marca" }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 36, height: 36 }), h("span", {}, h("strong", {}, "Nexor"), " Central")),
          h("h2", {}, "Todos os clientes, cobranças e sistemas da Nexor ", h("span", { class: "gradiente" }, "num só painel.")),
          h("ul", { class: "login-destaques" }, [
            ["dinheiro", "Cobrança com régua automática", "Aviso, somente leitura e suspensão no prazo de cada contrato. Pagou, o sistema volta sozinho."],
            ["caixa", "Saúde de cada instalação", "Versão, último contato e backup de todos os sistemas instalados nos clientes."],
            ["escudo", "Acesso de suporte seguro", "Entrada no sistema do cliente por link assinado, de uso único e registrado dos dois lados."],
          ].map(([ic, t, d]) => h("li", {}, h("span", { class: "login-ic" }, icone(ic, 20)), h("div", {}, h("strong", {}, t), h("p", {}, d))))),
          h("small", { class: "login-rodape" }, "Uso exclusivo da equipe Nexor Consulting"),
        ),
        h("section", { class: "login-painel" }, h("div", { class: "login-form" }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 48, height: 48, class: "login-logo" }), h("h1", {}, titulo), h("p", { class: "suave" }, texto), conteudo)),
      ),
    );
  const formSenha = (cadastro) => {
    const f = formulario([
      ...(cadastro ? [{ nome: "nome", rotulo: "Seu nome", obrigatorio: true, largura: 2 }] : []),
      { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largura: 2 },
      { nome: "senha", rotulo: "Senha", tipo: "senha", obrigatorio: true, largura: 2, ajuda: cadastro ? "Mínimo de 10 caracteres." : undefined },
      ...(cadastro && st.exigeCodigo ? [{ nome: "codigo_instalacao", rotulo: "Código de instalação", obrigatorio: true, largura: 2, ajuda: "Está no arquivo codigo-instalacao.txt do servidor da Central." }] : []),
    ]);
    const b = h("button", { class: "btn btn-primario btn-grande", type: "submit" }, cadastro ? "Criar conta" : "Continuar");
    const form = h("form", { class: "pilha", onsubmit: (e) => (e.preventDefault(), acao(b, async () => etapa2((await post(cadastro ? "/cadastro" : "/entrar", f.ler())).proximo))) }, f.el, b);
    tela(cadastro ? "Primeiro acesso" : "Entrar na Nexor Central", cadastro ? "Crie a conta do dono. Em seguida você ativa a verificação em duas etapas." : "Acesso da equipe Nexor.", form);
    form.querySelector("input")?.focus();
  };
  async function etapa2(proximo) {
    const codigo = h("input", { class: "entrada", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 7, placeholder: "000000", style: { textAlign: "center", fontSize: "22px", letterSpacing: ".3em" } });
    const b = h("button", { class: "btn btn-primario btn-grande", type: "submit" }, "Confirmar");
    let topoTotp = null;
    if (proximo === "configurar") {
      const t = await get("/totp/novo");
      topoTotp = h("div", { class: "totp" }, h("img", { src: t.qr, alt: "QR Code do autenticador" }), h("small", { class: "suave" }, "Sem câmera? Digite a chave no aplicativo:"), h("code", {}, t.segredo));
    }
    const form = h("form", { class: "pilha", onsubmit: (e) => (e.preventDefault(), acao(b, async () => (await post("/totp", { codigo: codigo.value }), location.reload()))) }, topoTotp, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Código de 6 dígitos"), codigo), b);
    tela(proximo === "configurar" ? "Ative a verificação em duas etapas" : "Código do autenticador", proximo === "configurar" ? "Escaneie com o Google Authenticator, Microsoft Authenticator ou Authy e digite o código que aparecer." : "Abra o aplicativo autenticador no celular.", form);
    codigo.focus();
  }
  if (st.fase === "senha") return formSenha(false);
  formSenha(st.primeiroAcesso);
}

/* ---------- Visão geral ---------- */
async function inicio() {
  const p = await get("/painel");
  const s = p.clientes.porSituacao;
  return h(
    "div",
    { class: "pagina" },
    topo("Visão geral", `Hoje, ${dataBR(hoje())}`, botao("Novo cliente", () => editarCliente(), "btn-primario", "mais")),
    h(
      "div",
      { class: "indicadores" },
      indicador("predio", "Clientes ativos", String(p.clientes.total), `${p.clientes.em_teste} em teste grátis · ${p.clientes.fundadores} fundador(es) · ${s.bloqueado} ${s.bloqueado === 1 ? "bloqueado" : "bloqueados"}`),
      indicador("dinheiro", "Receita mensal (MRR)", reais(p.financeiro.mrr), `Recebido este mês: ${reais(p.financeiro.recebido_mes)}`, "var(--verde)"),
      indicador("alerta", "Vencido em aberto", reais(p.financeiro.vencido), `A vencer: ${reais(p.financeiro.a_vencer)} · comissões a pagar: ${reais(p.financeiro.comissoes_a_pagar)}`, p.financeiro.vencido ? "var(--vermelho)" : undefined),
      indicador("caixa", "Sistemas no ar", `${p.sistemas.online}/${p.sistemas.total}`, Object.entries(p.sistemas.porProduto).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(" · ") || "nenhum instalado", p.sistemas.online < p.sistemas.total ? "var(--amarelo)" : "var(--verde)"),
    ),
    h(
      "div",
      { class: "grade-2" },
      h(
        "section",
        { class: "cartao" },
        h("div", { class: "cartao-topo" }, h("h2", {}, "Precisa de atenção"), h("span", { class: "chip" }, String(p.alertas.length))),
        p.alertas.length ? h("ul", { class: "alertas" }, p.alertas.map((a) => h("li", { class: `sit-${a.tipo}`, onclick: () => navegar(`clientes/${a.cliente_id}`) }, h("span", { class: "ponto-sit" }), h("span", {}, a.texto)))) : h("p", { class: "suave" }, "Tudo em ordem: clientes em dia e sistemas no ar."),
      ),
      h(
        "section",
        { class: "cartao" },
        h("div", { class: "cartao-topo" }, h("h2", {}, "Próximos vencimentos"), botao("Ver faturas", () => navegar("faturas"), "btn-fantasma btn-pequeno")),
        tabela([{ titulo: "Cliente", valor: (f) => f.cliente }, { titulo: "Vencimento", valor: (f) => dataBR(f.vencimento) }, { titulo: "Valor", valor: (f) => reais(f.valor_centavos), classe: "num" }], p.proximas, { aoClicar: (f) => navegar(`clientes/${f.cliente_id}`), vazio: "Nenhuma fatura a vencer." }),
      ),
    ),
  );
}

/* ---------- Clientes ---------- */
async function clientes(id) {
  if (id) return detalheCliente(id);
  const lista = await get("/clientes");
  let filtro = "todos";
  const corpo = h("div");
  const desenhar = () =>
    limpar(
      corpo,
      tabela(
        [
          { titulo: "Cliente", valor: (c) => h("div", {}, h("strong", {}, nomeCliente(c)), h("small", { class: "suave", style: { display: "block" } }, cnpjBR(c.cnpj), c.cidade ? ` · ${c.cidade}` : "", c.codigo ? ` · ${c.codigo}` : "")) },
          { titulo: "Situação", valor: (c) => h("span", {}, chipCliente(c), c.fundador ? h("span", { class: "chip chip-ok" }, "Fundador") : null) },
          { titulo: "Sistemas", valor: (c) => (c.sistemas.length ? c.sistemas.map((s) => h("span", { class: "chip", title: s.online ? "No ar" : "Sem contato" }, h("span", { class: `ponto-sit sit-${s.online ? "ativo" : "offline"}` }), s.produto)) : h("span", { class: "suave" }, "—")) },
          { titulo: "Mensalidade", valor: (c) => reais(c.valor_centavos), classe: "num" },
          { titulo: "Vence dia", valor: (c) => String(c.dia_vencimento), classe: "num" },
        ],
        lista.filter((c) => filtro === "todos" || (filtro === "teste" ? c.fase === "teste" : filtro === "atraso" ? c.fase !== "teste" && ["aviso", "restrito", "bloqueado"].includes(c.situacao) && c.status === "ativo" : c.status === filtro)),
        { aoClicar: (c) => navegar(`clientes/${c.id}`), vazio: "Nenhum cliente aqui. Cadastre o primeiro." },
      ),
    );
  const filtros = h(
    "div",
    { class: "filtros" },
    [["todos", "Todos"], ["ativo", "Ativos"], ["teste", "Em teste"], ["atraso", "Em atraso"], ["cancelado", "Cancelados"]].map(([k, t]) =>
      h("button", { class: `chip clicavel ${k === filtro ? "ativo" : ""}`, onclick: (e) => ((filtro = k), e.currentTarget.parentElement.querySelectorAll(".chip").forEach((x) => x.classList.remove("ativo")), e.currentTarget.classList.add("ativo"), desenhar()) }, t),
    ),
  );
  desenhar();
  return h("div", { class: "pagina" }, topo("Clientes", `${lista.length} cadastrados`, pode("dono", "financeiro") ? botao("Novo cliente", () => editarCliente(), "btn-primario", "mais") : null), h("section", { class: "cartao" }, filtros, h("div", { style: { marginTop: "12px" } }, corpo)));
}

async function editarCliente(c) {
  const [cat, parcs] = await Promise.all([pegarCatalogo(), get("/parceiros")]);
  const opcoesParc = (tipos) => [["", "—"], ...parcs.filter((p) => p.ativo && tipos.includes(p.tipo)).map((p) => [p.id, `${p.nome} · ${TIPOS_PARC[p.tipo]}`])];
  const f = formulario(
    [
      ...(c ? [] : [{ titulo: "Teste grátis" }, { nome: "teste_produto", rotulo: `Começar no teste grátis de ${cat.teste.dias} dias (opcional)`, tipo: "select", opcoes: [["", "Não: já contratado (preencha o contrato abaixo)"], ...Object.keys(cat.teste.produtos).filter((k) => k !== "one").map((k) => [k, `${cat.produtos[k]} · ${cat.teste.produtos[k].resumo}`])], largura: 2 }]),
      { titulo: "Quem vendeu" },
      { nome: "vendedor_id", rotulo: "Vendedor ou representante", tipo: "select", opcoes: opcoesParc(["vendedor", "representante"]), enviarNulo: true },
      { nome: "parceiro_id", rotulo: "Parceiro", tipo: "select", opcoes: opcoesParc(["indicador", "revenda", "estrategico"]), enviarNulo: true },
      { titulo: "Empresa" },
      { nome: "razao_social", rotulo: "Razão social", obrigatorio: true, largura: 2 },
      { nome: "nome_fantasia", rotulo: "Nome fantasia" },
      { nome: "cnpj", rotulo: "CNPJ", obrigatorio: true },
      { nome: "cidade", rotulo: "Cidade" },
      { nome: "contato_nome", rotulo: "Responsável" },
      { nome: "email", rotulo: "E-mail financeiro", tipo: "email" },
      { nome: "telefone", rotulo: "WhatsApp", tipo: "tel" },
      { titulo: "Contrato" },
      { nome: "plano", rotulo: "Plano", placeholder: "Use \"Contratar plano\" no cliente para puxar do catálogo" },
      { nome: "valor_centavos", rotulo: "Mensalidade cheia (R$)", tipo: "reais", obrigatorio: true },
      { nome: "dia_vencimento", rotulo: "Dia do vencimento", tipo: "numero", min: 1, max: 31, padrao: 10 },
      { nome: "inicio_cobranca", rotulo: "Cobrar a partir de", tipo: "data", padrao: hoje() },
      { titulo: "Régua de cobrança (dias depois do vencimento)" },
      { nome: "regras.aviso", rotulo: "Aviso no sistema", tipo: "numero", min: 0, max: 60, padrao: 1 },
      { nome: "regras.restrito", rotulo: "Somente leitura", tipo: "numero", min: 1, max: 90, padrao: 10 },
      { nome: "regras.bloqueio", rotulo: "Bloqueio total", tipo: "numero", min: 1, max: 120, padrao: 20 },
      { nome: "regras.antecedencia", rotulo: "Emitir a fatura (dias antes)", tipo: "numero", min: 0, max: 30, padrao: 10 },
      { nome: "regras.manter_ponto", rotulo: "Manter o registro de ponto funcionando mesmo bloqueado (recomendado)", tipo: "check", padrao: true, largura: 2 },
      { nome: "observacoes", rotulo: "Observações", tipo: "area", largura: 2 },
    ],
    c ? { ...c, cnpj: cnpjBR(c.cnpj), vendedor_id: c.vendedor_id ?? "", parceiro_id: c.parceiro_id ?? "" } : { regras: { aviso: 1, restrito: 10, bloqueio: 20, antecedencia: 10, manter_ponto: true } },
  );
  janela({
    titulo: c ? `Editar ${nomeCliente(c)}` : "Novo cliente",
    largura: 720,
    conteudo: f.el,
    acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { const r = c ? await put(`/clientes/${c.id}`, f.ler()) : await post("/clientes", f.ler()); fechar(); aviso("Cliente salvo."); navegar(`clientes/${r.id}`); recarregar(); }) }],
  });
}

async function detalheCliente(id) {
  const c = await get(`/clientes/${id}`);
  const fin = pode("dono", "financeiro");
  const sup = pode("dono", "suporte");
  const r = c.regras;
  const acoesSituacao = [
    fin && !c.bloqueio_manual ? botao("Bloquear agora", () => bloquear(c), "btn-perigo-fantasma btn-pequeno", "x") : null,
    fin && (c.bloqueio_manual || c.situacao !== "ativo") ? botao(c.bloqueio_manual ? "Desbloquear" : "Liberar até…", () => liberar(c), "btn-fantasma btn-pequeno", "check") : null,
    fin && c.status === "ativo" ? botao(c.fase === "teste" ? "Contratar plano" : "Trocar plano", () => contratar(c), "btn-primario btn-pequeno", "dinheiro") : null,
    fin && c.status === "ativo" && !c.contratado_em ? botao(c.fase === "teste" ? "Prorrogar teste" : "Iniciar teste grátis", () => testeGratis(c), "btn-fantasma btn-pequeno", "raio") : null,
    fin ? botao("Editar", () => editarCliente(c), "btn-fantasma btn-pequeno", "editar") : null,
    pode("dono") ? botao(c.status === "cancelado" ? "Reativar contrato" : "Encerrar contrato", () => cancelar(c), "btn-fantasma btn-pequeno") : null,
  ];
  return h(
    "div",
    { class: "pagina" },
    h("a", { href: "#/clientes", class: "btn-link", style: { justifySelf: "start" } }, "← Clientes"),
    topo(nomeCliente(c), `${c.razao_social} · ${cnpjBR(c.cnpj)}${c.cidade ? ` · ${c.cidade}` : ""}`, ...acoesSituacao),
    h(
      "section",
      { class: `cartao sit-${c.situacao}` },
      h("div", { class: "cartao-topo" }, h("h2", {}, h("span", { class: "ponto-sit" }), "Situação: ", chipCliente(c)), c.liberado_ate ? h("span", { class: "chip chip-ok" }, `Liberado até ${dataBR(c.liberado_ate)}`) : null),
      h("p", {}, c.mensagem || "Em dia. O sistema do cliente funciona normalmente."),
      h("p", { class: "suave pequeno" }, `Régua: aviso com ${r.aviso} dia(s) de atraso, somente leitura com ${r.restrito}, bloqueio com ${r.bloqueio}. Ponto ${r.manter_ponto ? "continua" : "para"} no bloqueio. A mudança chega aos sistemas em até 5 minutos.`),
    ),
    h(
      "div",
      { class: "grade-2" },
      h(
        "section",
        { class: "cartao" },
        h("div", { class: "cartao-topo" }, h("h2", {}, "Sistemas instalados"), sup ? botao("Novo sistema", () => novoSistema(c), "btn-primario btn-pequeno", "mais") : null),
        h(
          "div",
          { class: "codigo-cliente" },
          h("div", {}, h("small", { class: "suave" }, "Código do cliente"), h("strong", { class: "codigo" }, c.codigo ?? "—")),
          h("div", { class: "acoes-linha" }, botao("Copiar", () => copiarTexto(c.codigo), "btn-fantasma btn-pequeno", "copiar"), pode("dono", "financeiro", "suporte") ? botao("Gerar outro", async () => (await confirmar("Gerar um código novo? O atual deixa de vincular sistemas novos (os já vinculados continuam funcionando).", { botao: "Gerar novo" })) && (await post(`/clientes/${c.id}/codigo`), recarregar()), "btn-fantasma btn-pequeno") : null),
          h("p", { class: "suave pequeno" }, "Na instalação, digite este código no sistema (Configurações → Nexor) ou coloque em NEXOR_CODIGO no .env. O sistema aparece aqui na hora, já com licença e acesso de suporte."),
        ),
        c.sistemas.length ? h("div", { class: "lista-sistemas" }, c.sistemas.map((s) => cartaoSistema(s, sup))) : h("p", { class: "suave" }, "Nenhum sistema vinculado ainda. Use o código acima na instalação (ou \"Novo sistema\" para gerar as credenciais manualmente)."),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Contrato"),
        h("div", { class: "saude", style: { fontSize: "14px", display: "grid", gap: "6px" } }, h("span", {}, "Plano: ", h("strong", {}, c.fase === "teste" ? `Teste grátis de ${estado.eu.produtos[c.produto] ?? "—"}` : c.plano || "—"), c.fundador ? h("span", { class: "chip chip-ok" }, "Fundador") : null), h("span", {}, "Mensalidade: ", h("strong", {}, reais(c.valor_centavos)), c.desconto_pct > 0 ? ` · ${c.desconto_pct}% de desconto${c.desconto_ate ? ` até ${c.desconto_ate.slice(5)}/${c.desconto_ate.slice(0, 4)}` : ""}` : "", ` · vence dia ${c.dia_vencimento}`), c.regras?.preco_travado_ate ? h("span", {}, `Preço travado (sem reajuste) até ${c.regras.preco_travado_ate.slice(5)}/${c.regras.preco_travado_ate.slice(0, 4)}`) : null, c.contratado_em ? h("span", {}, `Contratado em ${dataBR(c.contratado_em)}`) : null, h("span", {}, "Responsável: ", c.contato_nome || "—", c.telefone ? ` · ${c.telefone}` : "", c.email ? ` · ${c.email}` : ""), h("span", {}, "Cobrança automática (Asaas): ", estado.eu.asaas ? "ativa" : "desligada (cobrança manual)")),
        c.observacoes ? h("p", { class: "suave pequeno", style: { whiteSpace: "pre-wrap" } }, c.observacoes) : null,
      ),
    ),
    h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, "Faturas"), fin ? botao("Fatura avulsa", () => novaFatura(c), "btn-fantasma btn-pequeno", "mais") : null), tabelaFaturas(c.faturas, fin)),
    h("section", { class: "cartao" }, h("h2", {}, "Histórico"), tabela([{ titulo: "Quando", valor: (a) => dataHora(a.criado_em) }, { titulo: "Quem", valor: (a) => a.autor }, { titulo: "O quê", valor: (a) => ACOES[a.acao] ?? a.acao }], c.historico, { vazio: "Sem registros." })),
  );
}

function cartaoSistema(s, sup) {
  const sd = s.saude ?? {};
  return h(
    "div",
    { class: `sistema sit-${s.online ? "ativo" : "offline"}` },
    h("div", { class: "sistema-topo" }, h("span", { class: "ponto-sit" }), h("strong", {}, s.nome || s.produto_nome), s.situacao ? chip(SIT, s.situacao) : null, !s.ativo ? h("span", { class: "chip" }, "Desativado") : null),
    h("div", { class: "saude" }, h("span", {}, s.url ? h("a", { href: s.url, target: "_blank", rel: "noopener" }, s.url.replace(/^https?:\/\//, "")) : "sem endereço"), h("span", {}, s.ultimo_contato ? `contato ${quandoRelativo(s.ultimo_contato)}` : "nunca conectou"), s.versao ? h("span", {}, `v${s.versao}`) : null),
    Object.keys(sd).length ? h("div", { class: "saude" }, sd.colaboradores !== undefined ? h("span", {}, `${sd.colaboradores} colaboradores`) : null, sd.usuarios !== undefined ? h("span", {}, `${sd.usuarios} usuários`) : null, sd.marcacoes_hoje !== undefined ? h("span", {}, `${sd.marcacoes_hoje} marcações hoje`) : null, sd.conversas_hoje !== undefined ? h("span", {}, `${sd.conversas_hoje} conversas hoje`) : null, sd.conectores !== undefined ? h("span", {}, `${sd.conectores} sistemas conectados`) : null, sd.banco_mb !== undefined ? h("span", {}, `banco ${sd.banco_mb} MB`) : null, s.produto === "rh" ? h("span", { style: { color: sd.backup_ultimo && Date.now() - sd.backup_ultimo < 36 * 3600_000 ? "var(--verde)" : "var(--vermelho)" } }, sd.backup_ultimo ? `backup ${quandoRelativo(sd.backup_ultimo)}` : "sem backup") : null) : null,
    sup
      ? h(
          "div",
          { class: "acoes-linha" },
          s.acesso && s.url && s.ativo ? botao("Entrar como Suporte Nexor", (e) => acao(e.currentTarget, async () => window.open((await post(`/sistemas/${s.id}/acesso`)).url, "_blank", "noopener")), "btn-primario btn-pequeno", "escudo") : null,
          botao("Editar", () => editarSistema(s), "btn-fantasma btn-pequeno", "editar"),
          botao("Nova credencial", async () => (await confirmar("A credencial atual deixa de funcionar e a instalação precisa receber o .env novo. Continuar?", { botao: "Gerar nova" })) && mostrarCredenciais(await post(`/sistemas/${s.id}/token`)), "btn-fantasma btn-pequeno", "link"),
        )
      : null,
  );
}

function mostrarCredenciais(r) {
  janela({
    titulo: "Credenciais da instalação",
    largura: 680,
    conteudo: h("div", { class: "pilha" }, h("p", {}, "Cole estas linhas no arquivo ", h("code", {}, ".env"), " da instalação do cliente e rode ", h("code", {}, "sudo ./atualizar.sh"), "."), h("pre", { class: "env" }, r.env), h("p", { class: "suave pequeno" }, "O token só aparece agora. Não envie por WhatsApp nem e-mail: cole direto no servidor.")),
    acoes: [{ texto: "Copiar", classe: "btn-primario", fn: () => copiarTexto(r.env) }],
  });
}
function novoSistema(c) {
  const f = formulario([{ nome: "produto", rotulo: "Produto", tipo: "select", opcoes: Object.entries(estado.eu.produtos), largura: 2 }, { nome: "nome", rotulo: "Nome (opcional)", largura: 2, placeholder: "Ex.: RH da matriz" }, { nome: "url", rotulo: "Endereço do sistema", largura: 2, placeholder: "https://rh.cliente.com.br" }]);
  janela({ titulo: `Novo sistema · ${nomeCliente(c)}`, conteudo: f.el, acoes: [{ texto: "Criar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { const r = await post(`/clientes/${c.id}/sistemas`, f.ler()); fechar(); recarregar(); mostrarCredenciais(r); }) }] });
}
function editarSistema(s) {
  const f = formulario([{ nome: "nome", rotulo: "Nome", largura: 2 }, { nome: "url", rotulo: "Endereço do sistema", largura: 2, placeholder: "https://rh.cliente.com.br" }, { nome: "ativo", rotulo: "Instalação ativa (desativada recebe licença de bloqueio)", tipo: "check", largura: 2 }], s);
  janela({ titulo: "Editar sistema", conteudo: f.el, acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await put(`/sistemas/${s.id}`, f.ler()), fechar(), recarregar())) }] });
}

function bloquear(c) {
  const motivo = h("input", { class: "entrada", placeholder: "Ex.: contrato em renegociação" });
  janela({ titulo: `Bloquear ${nomeCliente(c)}`, conteudo: h("div", { class: "pilha" }, h("p", {}, "O painel do cliente fica suspenso em até 5 minutos. Os dados continuam guardados e os arquivos legais do ponto continuam disponíveis."), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Motivo (aparece para o cliente)"), motivo)), acoes: [{ texto: "Bloquear", classe: "btn-perigo", fn: (e, fechar) => acao(e.currentTarget, async () => (await post(`/clientes/${c.id}/bloquear`, { motivo: motivo.value }), fechar(), aviso("Bloqueio aplicado."), recarregar())) }] });
}
function liberar(c) {
  const ate = h("input", { class: "entrada", type: "date", min: hoje() });
  const motivo = h("input", { class: "entrada", placeholder: "Ex.: promessa de pagamento dia 15" });
  janela({ titulo: `Liberar ${nomeCliente(c)}`, conteudo: h("div", { class: "pilha" }, h("p", {}, "Tira o bloqueio manual. Com uma data, o sistema também fica liberado até ela mesmo com fatura em atraso; depois a régua volta a valer."), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Liberar até (opcional)"), ate), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Motivo"), motivo)), acoes: [{ texto: "Liberar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post(`/clientes/${c.id}/desbloquear`, { ate: ate.value || undefined, motivo: motivo.value }), fechar(), aviso("Cliente liberado."), recarregar())) }] });
}
async function cancelar(c) {
  const reativar = c.status === "cancelado";
  if (!(await confirmar(reativar ? "Reativar o contrato? As mensalidades voltam a ser geradas." : "Encerrar o contrato? O sistema do cliente fica bloqueado e as mensalidades param.", { perigo: !reativar, botao: reativar ? "Reativar" : "Encerrar" }))) return;
  await post(`/clientes/${c.id}/cancelar`, { reativar });
  recarregar();
}


/* ---------- Teste grátis e contratação ---------- */
async function testeGratis(c) {
  const cat = await pegarCatalogo();
  const f = formulario([
    { nome: "produto", rotulo: "Produto", tipo: "select", opcoes: Object.keys(cat.teste.produtos).filter((k) => k !== "one").map((k) => [k, `${cat.produtos[k]} · ${cat.teste.produtos[k].resumo}`]), largura: 2, padrao: c.produto ?? "" },
    { nome: "dias", rotulo: c.fase === "teste" ? "Prorrogar por (dias)" : "Dias de teste", tipo: "numero", min: 1, max: 30, padrao: c.fase === "teste" ? 7 : cat.teste.dias },
  ]);
  janela({
    titulo: c.fase === "teste" ? "Prorrogar teste grátis" : "Iniciar teste grátis",
    conteudo: h("div", { class: "pilha" }, h("p", {}, `No teste, o sistema funciona com as limitações do produto e mostra a faixa com os dias que faltam. No fim, fica bloqueado até a contratação, com os dados guardados por ${cat.teste.dados_guardados_dias} dias.`), f.el),
    acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post(`/clientes/${c.id}/teste`, f.ler()), fechar(), aviso("Teste grátis atualizado. Chega ao sistema em até 5 minutos."), recarregar())) }],
  });
}

async function contratar(c) {
  const [cat, parcs] = await Promise.all([pegarCatalogo(), get("/parceiros")]);
  const opcoesParc = (tipos) => [["", "—"], ...parcs.filter((p) => p.ativo && tipos.includes(p.tipo)).map((p) => [p.id, `${p.nome} · ${TIPOS_PARC[p.tipo]}`])];
  const f = formulario([
    { nome: "plano_id", rotulo: "Plano", tipo: "select", opcoes: planosOpcoes(cat), largura: 2, padrao: c.plano_id ?? "" },
    { nome: "quantidade", rotulo: "Quantidade (colaboradores, máquinas…)", tipo: "numero", min: 1, max: 100000, padrao: c.quantidade ?? "" },
    { nome: "dia_vencimento", rotulo: "Dia do vencimento", tipo: "numero", min: 1, max: 31, padrao: c.dia_vencimento ?? 10 },
    { nome: "fundador", rotulo: `Programa de fundadores (${cat.fundadores.desconto_mensal}% por ${cat.fundadores.meses} meses, ${cat.fundadores.desconto_implantacao}% na implantação, preço travado por ${cat.fundadores.preco_travado_meses} meses)`, tipo: "check", largura: 2, padrao: c.fundador },
    { nome: "desconto_pct", rotulo: "Desconto negociado (%, sem fundador)", tipo: "numero", min: 0, max: 50, padrao: 0 },
    { nome: "desconto_meses", rotulo: "Por quantos meses", tipo: "numero", min: 1, max: 24, padrao: 3 },
    { nome: "cobrar_implantacao", rotulo: "Gerar a fatura de implantação agora", tipo: "check", largura: 2, padrao: true },
    { nome: "vendedor_id", rotulo: "Vendedor ou representante", tipo: "select", opcoes: opcoesParc(["vendedor", "representante"]), padrao: c.vendedor_id ?? "" },
    { nome: "parceiro_id", rotulo: "Parceiro", tipo: "select", opcoes: opcoesParc(["indicador", "revenda", "estrategico"]), padrao: c.parceiro_id ?? "" },
  ]);
  const previa = h("p", { class: "previa-plano" });
  const atualizar = () => {
    const d = f.ler();
    const p = acharPlano(cat, d.plano_id);
    if (!p) return limpar(previa, "Escolha o plano.");
    const q = Number(d.quantidade) || 0;
    const mensal = p.por_unidade ? (p.franquia ? p.minimo + Math.round(p.por_unidade * Math.max(0, q - p.franquia)) : Math.max(p.minimo, Math.round(p.por_unidade * q))) : p.mensal;
    const fund = d.fundador && cat.fundadores.produtos.includes(p.produto);
    const vagas = cat.fundadores.vagas - (cat.fundadores.usadas[p.produto] ?? 0);
    const desc = fund ? cat.fundadores.desconto_mensal : Number(d.desconto_pct) || 0;
    const impl = Math.round(p.implantacao * (fund ? 1 - cat.fundadores.desconto_implantacao / 100 : 1));
    limpar(
      previa,
      h("strong", {}, `${reais(Math.round(mensal * (1 - desc / 100)))}/mês`),
      desc ? ` (cheia ${reais(mensal)}, ${desc}% por ${fund ? cat.fundadores.meses : d.desconto_meses || 1} meses)` : "",
      ` · implantação ${reais(impl)}`,
      d.fundador && !cat.fundadores.produtos.includes(p.produto) ? h("small", { style: { display: "block", color: "var(--vermelho)" } }, `Fundadores só para: ${cat.fundadores.produtos.map((x) => cat.produtos[x]).join(", ")}.`) : null,
      fund ? h("small", { style: { display: "block" } }, `Vagas de fundador do ${cat.produtos[p.produto]}: ${vagas} de ${cat.fundadores.vagas}.`) : null,
      h("small", { class: "suave", style: { display: "block" } }, p.inclui),
    );
  };
  f.el.addEventListener("input", atualizar);
  f.el.addEventListener("change", atualizar);
  atualizar();
  janela({
    titulo: `Contratar plano · ${nomeCliente(c)}`,
    largura: 720,
    conteudo: h("div", { class: "pilha" }, f.el, previa, h("p", { class: "suave pequeno" }, "Encerra o teste grátis, libera todas as funções do plano no sistema em até 5 minutos e começa a gerar as mensalidades. Consumo de IA, Meta, SMS e nuvem é pago direto pelo cliente.")),
    acoes: [{ texto: "Contratar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { const d = f.ler(); const p = acharPlano(cat, d.plano_id); if (!p?.por_unidade) delete d.quantidade; if (d.fundador) delete d.desconto_pct, delete d.desconto_meses; else if (!Number(d.desconto_pct)) delete d.desconto_pct, delete d.desconto_meses; await post(`/clientes/${c.id}/contratar`, d); catalogo = null; fechar(); aviso("Plano contratado."); recarregar(); }) }],
  });
}

/* ---------- Planos e preços ---------- */
async function comercial() {
  const cat = await (catalogo = null, pegarCatalogo());
  const fd = cat.fundadores;
  const lin = (t, ...v) => h("tr", {}, h("td", {}, t), ...v.map((x) => h("td", { class: "num" }, x)));
  return h(
    "div",
    { class: "pagina" },
    topo("Planos e preços", "Tabela oficial da Nexor. Para mudar valores, edite central/src/planos.js e comercial/PLANOS-E-PRECOS.md."),
    h("div", { class: "grade-planos" }, Object.entries(cat.planos).filter(([k]) => k !== "one").map(([prod, g]) =>
      h("section", { class: "cartao" }, h("h2", {}, cat.produtos[prod]), tabela([{ titulo: "Plano", valor: (p) => h("div", {}, h("strong", {}, p.nome), h("small", { class: "suave", style: { display: "block" } }, p.inclui)) }, { titulo: "Mensalidade", valor: (p) => (p.por_unidade ? (p.franquia ? `${reais(p.minimo)} até ${p.franquia} · + ${reais(p.por_unidade)}/${g.unidade}` : `${reais(p.por_unidade)}/${g.unidade} · mín. ${reais(p.minimo)}`) : reais(p.mensal)), classe: "num" }, { titulo: "Implantação", valor: (p) => reais(p.implantacao), classe: "num" }], g.planos), h("p", { class: "suave pequeno" }, `Teste grátis: ${cat.teste.produtos[prod]?.resumo ?? "—"}.`)),
    )),
    h("div", { class: "grade-2" },
      h("section", { class: "cartao" }, h("h2", {}, "Programa de fundadores"), h("p", {}, `${fd.desconto_mensal}% na mensalidade por ${fd.meses} meses, ${fd.desconto_implantacao}% na implantação e preço travado por ${fd.preco_travado_meses} meses. ${fd.vagas} vagas por produto.`), tabela([{ titulo: "Produto", valor: (p) => cat.produtos[p] }, { titulo: "Vagas usadas", valor: (p) => `${fd.usadas[p] ?? 0} de ${fd.vagas}`, classe: "num" }], fd.produtos), h("p", { class: "suave pequeno" }, `Contrapartidas: ${fd.contrapartidas.join("; ")}.`)),
      h("section", { class: "cartao" }, h("h2", {}, "Outros produtos e projetos"), tabela([{ titulo: "Produto", valor: (p) => p.nome }, { titulo: "Mensalidade", valor: (p) => p.preco }, { titulo: "Implantação", valor: (p) => p.implantacao }], cat.projetos)),
    ),
    h("div", { class: "grade-2" },
      h("section", { class: "cartao" }, h("h2", {}, "Desenvolvimento sob demanda"), h("table", { class: "tabela" }, h("tbody", {}, lin("Hora avulsa", reais(cat.sob_demanda.hora_avulsa)), ...cat.sob_demanda.pacotes.map((p) => lin(`Pacote de ${p.horas} horas`, `${reais(p.valor)} (${reais(Math.round(p.valor / p.horas))}/h)`)), lin("Projeto fechado (hora)", reais(cat.sob_demanda.hora_projeto)), lin(`Evolução mensal (${cat.sob_demanda.evolucao_mensal.horas} h)`, reais(cat.sob_demanda.evolucao_mensal.valor)))), h("p", { class: "suave pequeno" }, `Projetos: ${cat.sob_demanda.pagamento_projeto}. Garantia de ${cat.sob_demanda.garantia_dias} dias. Pagamento anual dos planos: paga ${cat.anual.meses_pagos} e usa ${cat.anual.meses_uso} meses.`)),
      h("section", { class: "cartao" }, h("h2", {}, "Comissões"), tabela([{ titulo: "Tipo", valor: (k) => h("div", {}, h("strong", {}, cat.comissoes[k].nome), cat.comissoes[k].requisito ? h("small", { class: "suave", style: { display: "block" } }, cat.comissoes[k].requisito) : null) }, { titulo: "1ª mensalidade", valor: (k) => `${cat.comissoes[k].primeira}%`, classe: "num" }, { titulo: "Recorrente", valor: (k) => `${cat.comissoes[k].recorrente}% ${cat.comissoes[k].meses ? `por ${cat.comissoes[k].meses} meses` : "enquanto ativo"}`, classe: "num" }, { titulo: "Implantação", valor: (k) => `${cat.comissoes[k].implantacao}%`, classe: "num" }, { titulo: "Sob medida", valor: (k) => `${cat.comissoes[k].sob_medida}%`, classe: "num" }], Object.keys(cat.comissoes)), h("p", { class: "suave pequeno" }, `Sobre o valor recebido. Carência de ${cat.regras_comissao.carencia_dias} dias; cancelamento em até ${cat.regras_comissao.estorno_cancelamento_dias} dias estorna a comissão da 1ª mensalidade e da implantação.`)),
    ),
  );
}

/* ---------- Parceiros e comissões ---------- */
async function parceiros() {
  const [lista, cs, inds, cat] = await Promise.all([get("/parceiros"), get("/comissoes"), get("/indicacoes"), pegarCatalogo()]);
  const fin = pode("dono", "financeiro");
  const editar = (p) => {
    const f = formulario([
      { nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 },
      { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: Object.entries(cat.comissoes).map(([k, v]) => [k, `${v.nome} · ${v.primeira ? `${v.primeira}% da 1ª + ` : ""}${v.recorrente}% recorrente`]), largura: 2 },
      { nome: "empresa", rotulo: "Empresa" },
      { nome: "documento", rotulo: "CPF ou CNPJ" },
      { nome: "email", rotulo: "E-mail", tipo: "email" },
      { nome: "telefone", rotulo: "WhatsApp", tipo: "tel" },
      { nome: "pix", rotulo: "Chave Pix para as comissões", largura: 2 },
      { titulo: "Percentuais próprios (vazio = os do tipo)" },
      { nome: "percentuais.primeira", rotulo: "1ª mensalidade (%)", tipo: "numero", min: 0, max: 100 },
      { nome: "percentuais.recorrente", rotulo: "Recorrente (%)", tipo: "numero", min: 0, max: 100 },
      { nome: "percentuais.meses", rotulo: "Meses de recorrência (0 = enquanto ativo)", tipo: "numero", min: 0, max: 120 },
      { nome: "percentuais.implantacao", rotulo: "Implantação (%)", tipo: "numero", min: 0, max: 100 },
      ...(p ? [{ nome: "ativo", rotulo: "Ativo", tipo: "check" }] : []),
      { nome: "observacoes", rotulo: "Observações", tipo: "area", largura: 2 },
    ], p ? { ...p, percentuais: p.percentuais ?? {} } : { tipo: "indicador" });
    janela({ titulo: p ? `Editar ${p.nome}` : "Novo vendedor ou parceiro", largura: 700, conteudo: f.el, acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (p ? await put(`/parceiros/${p.id}`, f.ler()) : await post("/parceiros", f.ler()), fechar(), recarregar())) }] });
  };
  const portal = async (p) => {
    if (p.portal && !(await confirmar("Gerar um link novo? O link atual do parceiro para de funcionar.", { botao: "Gerar novo" }))) return;
    const { link } = await post(`/parceiros/${p.id}/portal`);
    janela({ titulo: `Portal de ${p.nome}`, conteudo: h("div", { class: "pilha" }, h("p", {}, "Envie este link só para o parceiro. Com ele, ele acompanha os clientes, as comissões e envia indicações."), h("pre", { class: "env" }, link)), acoes: [{ texto: "Copiar", classe: "btn-primario", fn: () => copiarTexto(link) }] });
    recarregar();
  };
  const IND = { nova: "Nova", em_contato: "Em contato", teste: "Em teste", fechada: "Fechada", perdida: "Perdida" };
  return h(
    "div",
    { class: "pagina" },
    topo("Parceiros e comissões", `${lista.filter((p) => p.ativo).length} ativos`, fin ? botao("Novo vendedor ou parceiro", () => editar(), "btn-primario", "mais") : null),
    h("section", { class: "cartao" }, tabela([{ titulo: "Nome", valor: (p) => h("div", {}, h("strong", {}, p.nome), h("small", { class: "suave", style: { display: "block" } }, TIPOS_PARC[p.tipo], p.ativo ? "" : " · desativado")) }, { titulo: "Regra", valor: (p) => `${p.regra.primeira ? `${p.regra.primeira}% 1ª · ` : ""}${p.regra.recorrente}% rec. · ${p.regra.implantacao}% impl.` }, { titulo: "Clientes ativos", valor: (p) => String(p.clientes_ativos), classe: "num" }, { titulo: "A receber", valor: (p) => reais(p.comissao_aberta), classe: "num" }, { titulo: "Já pago", valor: (p) => reais(p.comissao_paga), classe: "num" }, { titulo: "", valor: (p) => (fin ? h("div", { class: "acoes-linha" }, botao("Editar", () => editar(p), "btn-fantasma btn-pequeno", "editar"), botao(p.portal ? "Novo link do portal" : "Link do portal", () => portal(p), "btn-fantasma btn-pequeno", "link")) : null) }], lista, { vazio: "Nenhum vendedor ou parceiro ainda." })),
    h("section", { class: "cartao" }, h("h2", {}, "Comissões"), tabela([{ titulo: "Quem", valor: (x) => x.parceiro }, { titulo: "Cliente", valor: (x) => h("a", { href: `#/clientes/${x.cliente_id}` }, x.cliente) }, { titulo: "Sobre", valor: (x) => h("div", {}, x.fatura, h("small", { class: "suave", style: { display: "block" } }, `${x.tipo} · ${x.pct}% de ${reais(x.base_centavos)}`)) }, { titulo: "Valor", valor: (x) => reais(x.valor_centavos), classe: "num" }, { titulo: "Situação", valor: (x) => chip(COM, x.status, x.status === "prevista" ? ` até ${dataBR(x.liberar_em)}` : x.status === "paga" && x.pago_em ? ` · ${dataBR(x.pago_em)}` : "") }, { titulo: "", valor: (x) => (fin && x.status === "a_pagar" ? botao("Paguei", async (e) => acao(e.currentTarget, async () => (await post(`/comissoes/${x.id}/pagar`, {}), recarregar())), "btn-fantasma btn-pequeno", "check") : null) }], cs, { vazio: "As comissões aparecem aqui quando as faturas dos clientes de cada parceiro são pagas." })),
    h("section", { class: "cartao" }, h("h2", {}, "Indicações dos parceiros"), tabela([{ titulo: "Quando", valor: (i) => dataHora(i.criado_em) }, { titulo: "Parceiro", valor: (i) => i.parceiro }, { titulo: "Empresa", valor: (i) => h("div", {}, h("strong", {}, i.empresa), h("small", { class: "suave", style: { display: "block" } }, [i.contato, i.telefone, i.email].filter(Boolean).join(" · "))) }, { titulo: "Produto", valor: (i) => estado.eu.produtos[i.produto] ?? "—" }, { titulo: "Situação", valor: (i) => (fin ? h("select", { class: "entrada entrada-pequena", onchange: (e) => put(`/indicacoes/${i.id}`, { status: e.target.value }).then(() => aviso("Indicação atualizada.")) }, Object.entries(IND).map(([k, t]) => h("option", { value: k, selected: k === i.status }, t))) : IND[i.status]) }], inds, { vazio: "Nenhuma indicação ainda." }), h("p", { class: "suave pequeno" }, "Ao fechar, cadastre o cliente e escolha o parceiro em \"Quem vendeu\": as comissões passam a ser geradas sozinhas.")),
  );
}

/* ---------- Faturas ---------- */
function tabelaFaturas(lista, fin, comCliente = false) {
  return tabela(
    [
      ...(comCliente ? [{ titulo: "Cliente", valor: (f) => h("a", { href: `#/clientes/${f.cliente_id}` }, f.cliente) }] : []),
      { titulo: "Descrição", valor: (f) => h("div", {}, f.descricao, f.erro_cobranca ? h("small", { style: { display: "block", color: "var(--vermelho)" } }, `Asaas: ${f.erro_cobranca}`) : null) },
      { titulo: "Vencimento", valor: (f) => dataBR(f.vencimento) },
      { titulo: "Valor", valor: (f) => reais(f.valor_centavos), classe: "num" },
      { titulo: "Situação", valor: (f) => (f.status === "aberta" && f.vencimento < hoje() ? chip({ v: ["Vencida", "perigo"] }, "v") : chip(FAT, f.status, f.status === "paga" && f.pago_em ? ` · ${dataBR(f.pago_em)}` : "")) },
      {
        titulo: "",
        valor: (f) =>
          h(
            "div",
            { class: "acoes-linha" },
            f.link ? h("a", { class: "btn btn-fantasma btn-pequeno", href: f.link, target: "_blank", rel: "noopener" }, "Link") : null,
            fin && f.status === "aberta" ? botao("Recebida", () => pagar(f), "btn-fantasma btn-pequeno", "check") : null,
            fin && f.status === "aberta" ? botao("Cancelar", async () => (await confirmar("Cancelar esta fatura?", { perigo: true })) && (await post(`/faturas/${f.id}/cancelar`), recarregar()), "btn-fantasma btn-pequeno") : null,
            fin && f.status === "paga" ? botao("Reabrir", async () => (await confirmar("Reabrir a fatura (pagamento estornado)?")) && (await post(`/faturas/${f.id}/reabrir`), recarregar()), "btn-fantasma btn-pequeno") : null,
          ),
      },
    ],
    lista,
    { vazio: "Nenhuma fatura." },
  );
}
function pagar(f) {
  const data = h("input", { class: "entrada", type: "date", value: hoje(), max: hoje() });
  const forma = h("select", { class: "entrada" }, ["pix", "boleto", "cartao", "transferencia", "dinheiro"].map((x) => h("option", { value: x }, x)));
  janela({ titulo: "Registrar pagamento", conteudo: h("div", { class: "pilha" }, h("p", {}, `${f.descricao} · ${reais(f.valor_centavos)}`), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Data"), data), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Forma"), forma), h("p", { class: "suave pequeno" }, "Se o cliente estiver bloqueado por esta fatura, o sistema volta em até 5 minutos.")), acoes: [{ texto: "Confirmar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post(`/faturas/${f.id}/pagar`, { data: data.value, forma: forma.value }), fechar(), aviso("Pagamento registrado."), recarregar())) }] });
}
function novaFatura(c) {
  const f = formulario([{ nome: "descricao", rotulo: "Descrição", obrigatorio: true, largura: 2, placeholder: "Ex.: Implantação e treinamento" }, { nome: "valor_centavos", rotulo: "Valor (R$)", tipo: "reais", obrigatorio: true }, { nome: "vencimento", rotulo: "Vencimento", tipo: "data", obrigatorio: true }, { nome: "link", rotulo: "Link de pagamento (opcional)", largura: 2, placeholder: "https://…" }]);
  janela({ titulo: `Fatura avulsa · ${nomeCliente(c)}`, conteudo: f.el, acoes: [{ texto: "Criar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post("/faturas", { ...f.ler(), cliente_id: c.id }), fechar(), recarregar())) }] });
}
async function faturas() {
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const status = params.get("status") ?? "";
  const lista = await get(`/faturas${status ? `?status=${status}` : ""}`);
  const fin = pode("dono", "financeiro");
  const filtros = h("div", { class: "filtros" }, [["", "Todas"], ["vencida", "Vencidas"], ["aberta", "Em aberto"], ["paga", "Pagas"], ["cancelada", "Canceladas"]].map(([k, t]) => h("a", { class: `chip clicavel ${k === status ? "ativo" : ""}`, href: `#/faturas${k ? `?status=${k}` : ""}` }, t)));
  const total = lista.reduce((s, f) => s + (f.status !== "cancelada" ? f.valor_centavos : 0), 0);
  return h("div", { class: "pagina" }, topo("Faturas", `${lista.length} faturas · ${reais(total)}`, fin ? botao("Gerar mensalidades agora", (e) => acao(e.currentTarget, async () => (aviso(`${(await post("/faturas/gerar")).criadas} fatura(s) criada(s).`), recarregar())), "btn-fantasma", "raio") : null), h("section", { class: "cartao" }, filtros, h("div", { style: { marginTop: "12px" } }, tabelaFaturas(lista, fin, true))));
}

/* ---------- Sistemas ---------- */
async function sistemas() {
  const lista = await get("/sistemas");
  const sup = pode("dono", "suporte");
  const { chave } = await get("/chave-publica");
  return h(
    "div",
    { class: "pagina" },
    topo("Sistemas instalados", `${lista.filter((s) => s.online).length} de ${lista.length} no ar agora`),
    h("section", { class: "cartao" }, tabela([{ titulo: "Cliente", valor: (s) => h("a", { href: `#/clientes/${s.cliente_id}` }, s.cliente) }, { titulo: "Sistema", valor: (s) => h("span", {}, h("span", { class: `ponto-sit sit-${s.online ? "ativo" : "offline"}` }), s.nome || s.produto_nome) }, { titulo: "Situação", valor: (s) => (s.situacao ? chip(SIT, s.situacao) : "—") }, { titulo: "Versão", valor: (s) => s.versao ?? "—" }, { titulo: "Último contato", valor: (s) => (s.ultimo_contato ? quandoRelativo(s.ultimo_contato) : "nunca") }, { titulo: "Backup", valor: (s) => (s.saude?.backup_ultimo ? quandoRelativo(s.saude.backup_ultimo) : "—") }, { titulo: "", valor: (s) => (sup && s.acesso && s.url && s.ativo ? botao("Entrar", (e) => acao(e.currentTarget, async () => window.open((await post(`/sistemas/${s.id}/acesso`)).url, "_blank", "noopener")), "btn-fantasma btn-pequeno", "escudo") : null) }], lista, { vazio: "Nenhum sistema cadastrado. Abra um cliente e cadastre o sistema dele." })),
    h("section", { class: "cartao" }, h("h2", {}, "Chave pública das licenças"), h("p", { class: "suave pequeno" }, "Já vai junto nas credenciais de cada sistema (NEXOR_CHAVE_PUBLICA). Ela só confere assinaturas: pode ficar nos servidores dos clientes sem risco."), h("pre", { class: "env" }, chave)),
  );
}

/* ---------- Equipe ---------- */
async function equipe() {
  const lista = await get("/usuarios");
  const editar = (u) => {
    const f = formulario([{ nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 }, ...(u ? [] : [{ nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largura: 2 }]), { nome: "papel", rotulo: "Perfil", tipo: "select", opcoes: [["suporte", "Suporte: sistemas e acesso aos clientes"], ["financeiro", "Financeiro: clientes e faturas"], ["dono", "Dono: tudo"]], largura: 2 }, { nome: "senha", rotulo: u ? "Nova senha (opcional)" : "Senha provisória", tipo: "senha", obrigatorio: !u, largura: 2, ajuda: "Mínimo de 10 caracteres. No primeiro login a pessoa ativa o 2FA." }, ...(u ? [{ nome: "ativo", rotulo: "Ativo", tipo: "check" }, { nome: "zerar_2fa", rotulo: "Zerar o 2FA (celular perdido)", tipo: "check" }] : [])], u ?? { papel: "suporte" });
    janela({ titulo: u ? `Editar ${u.nome}` : "Novo usuário", conteudo: f.el, acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (u ? await put(`/usuarios/${u.id}`, f.ler()) : await post("/usuarios", f.ler()), fechar(), recarregar())) }] });
  };
  return h("div", { class: "pagina" }, topo("Equipe Nexor", "Quem acessa a Central. Todos entram com senha e código do autenticador.", botao("Novo usuário", () => editar(), "btn-primario", "mais")), h("section", { class: "cartao" }, tabela([{ titulo: "Nome", valor: (u) => u.nome }, { titulo: "E-mail", valor: (u) => u.email }, { titulo: "Perfil", valor: (u) => PAPEIS[u.papel] }, { titulo: "2FA", valor: (u) => (u.totp ? chip({ s: ["Ativo", "ok"] }, "s") : chip({ n: ["Pendente", "alerta"] }, "n")) }, { titulo: "Último acesso", valor: (u) => (u.ultimo_acesso ? quandoRelativo(u.ultimo_acesso) : "—") }, { titulo: "Situação", valor: (u) => (u.ativo ? "Ativo" : "Desativado") }], lista, { aoClicar: editar })));
}

/* ---------- Auditoria ---------- */
const ACOES_COM = { teste_iniciado: "Iniciou o teste grátis", teste_prorrogado: "Prorrogou o teste grátis", plano_contratado: "Contratou plano", parceiro_criado: "Cadastrou vendedor/parceiro", parceiro_alterado: "Alterou vendedor/parceiro", portal_parceiro_link: "Gerou link do portal do parceiro", comissao_paga: "Pagou comissão", indicacao_alterada: "Atualizou indicação", indicacao_recebida: "Indicação recebida no portal" };
const ACOES = { ...ACOES_COM, conta_criada: "Conta criada", login: "Entrou na Central", cliente_criado: "Cliente cadastrado", cliente_alterado: "Cliente alterado", bloqueio_manual: "Bloqueou o cliente", desbloqueio: "Liberou o cliente", contrato_cancelado: "Encerrou o contrato", contrato_reativado: "Reativou o contrato", fatura_criada: "Fatura avulsa criada", faturas_geradas: "Gerou mensalidades", fatura_paga: "Registrou pagamento", fatura_reaberta: "Reabriu fatura", fatura_cancelada: "Cancelou fatura", fatura_alterada: "Alterou fatura", sistema_criado: "Cadastrou sistema", sistema_alterado: "Alterou sistema", sistema_token_trocado: "Trocou a credencial do sistema", sistema_vinculado: "Sistema vinculado pelo código", vinculacao_recusada: "Tentativa de vinculação com código errado", codigo_trocado: "Gerou novo código do cliente", acesso_suporte: "Entrou no sistema do cliente (suporte)", situacao_aplicada: "Situação aplicada no sistema", usuario_criado: "Usuário criado", usuario_alterado: "Usuário alterado", webhook_paga: "Asaas: pagamento confirmado", webhook_aberta: "Asaas: pagamento estornado", webhook_cancelada: "Asaas: cobrança removida" };
async function auditoria() {
  const lista = await get("/auditoria");
  const det = (a) => {
    const d = a.detalhe;
    if (!d) return "";
    if (a.acao === "situacao_aplicada") return `${d.de ?? "—"} → ${d.para}`;
    if (d.motivo) return d.motivo;
    if (d.forma) return d.forma;
    return "";
  };
  return h("div", { class: "pagina" }, topo("Auditoria", "Tudo o que a equipe e os sistemas fizeram na Central (últimos 200 registros)."), h("section", { class: "cartao" }, tabela([{ titulo: "Quando", valor: (a) => dataHora(a.criado_em) }, { titulo: "Quem", valor: (a) => a.autor }, { titulo: "O quê", valor: (a) => ACOES[a.acao] ?? a.acao }, { titulo: "Cliente", valor: (a) => (a.cliente ? h("a", { href: `#/clientes/${a.cliente_id}` }, a.cliente) : "—") }, { titulo: "Detalhe", valor: det }], lista)));
}

function trocarSenha() {
  const f = formulario([{ nome: "atual", rotulo: "Senha atual", tipo: "senha", obrigatorio: true, largura: 2 }, { nome: "nova", rotulo: "Senha nova", tipo: "senha", obrigatorio: true, largura: 2, ajuda: "Mínimo de 10 caracteres." }]);
  janela({ titulo: "Trocar senha", conteudo: f.el, acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await put("/eu/senha", f.ler()), fechar(), aviso("Senha trocada. As outras sessões foram encerradas."))) }] });
}

/* ---------- Início ---------- */
async function iniciar() {
  definirAoDeslogar(() => estado.eu && location.reload());
  const st = await get("/estado").catch(() => ({}));
  if (st.fase !== "ok") return login(st);
  estado.eu = await get("/eu");
  limpar(app, layout());
  window.addEventListener("hashchange", renderizar);
  if (!location.hash) location.hash = "#/inicio";
  renderizar();
}
iniciar().catch((e) => {
  console.error(e);
  limpar(app, h("div", { class: "vazio" }, h("h3", {}, "Não foi possível carregar a Central"), h("p", {}, e.message)));
});
