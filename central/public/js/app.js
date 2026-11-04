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
      indicador("predio", "Clientes ativos", String(p.clientes.total), `${s.ativo} em dia · ${s.aviso + s.restrito} em atraso · ${s.bloqueado} ${s.bloqueado === 1 ? "bloqueado" : "bloqueados"}`),
      indicador("dinheiro", "Receita mensal (MRR)", reais(p.financeiro.mrr), `Recebido este mês: ${reais(p.financeiro.recebido_mes)}`, "var(--verde)"),
      indicador("alerta", "Vencido em aberto", reais(p.financeiro.vencido), `A vencer: ${reais(p.financeiro.a_vencer)}`, p.financeiro.vencido ? "var(--vermelho)" : undefined),
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
          { titulo: "Cliente", valor: (c) => h("div", {}, h("strong", {}, nomeCliente(c)), h("small", { class: "suave", style: { display: "block" } }, cnpjBR(c.cnpj), c.cidade ? ` · ${c.cidade}` : "")) },
          { titulo: "Situação", valor: (c) => (c.status === "cancelado" ? chip({ x: ["Cancelado", ""] }, "x") : chip(SIT, c.situacao, c.atraso ? ` · ${c.atraso}d` : "")) },
          { titulo: "Sistemas", valor: (c) => (c.sistemas.length ? c.sistemas.map((s) => h("span", { class: "chip", title: s.online ? "No ar" : "Sem contato" }, h("span", { class: `ponto-sit sit-${s.online ? "ativo" : "offline"}` }), s.produto)) : h("span", { class: "suave" }, "—")) },
          { titulo: "Mensalidade", valor: (c) => reais(c.valor_centavos), classe: "num" },
          { titulo: "Vence dia", valor: (c) => String(c.dia_vencimento), classe: "num" },
        ],
        lista.filter((c) => filtro === "todos" || (filtro === "atraso" ? ["aviso", "restrito", "bloqueado"].includes(c.situacao) && c.status === "ativo" : c.status === filtro)),
        { aoClicar: (c) => navegar(`clientes/${c.id}`), vazio: "Nenhum cliente aqui. Cadastre o primeiro." },
      ),
    );
  const filtros = h(
    "div",
    { class: "filtros" },
    [["todos", "Todos"], ["ativo", "Ativos"], ["atraso", "Em atraso"], ["cancelado", "Cancelados"]].map(([k, t]) =>
      h("button", { class: `chip clicavel ${k === filtro ? "ativo" : ""}`, onclick: (e) => ((filtro = k), e.currentTarget.parentElement.querySelectorAll(".chip").forEach((x) => x.classList.remove("ativo")), e.currentTarget.classList.add("ativo"), desenhar()) }, t),
    ),
  );
  desenhar();
  return h("div", { class: "pagina" }, topo("Clientes", `${lista.length} cadastrados`, pode("dono", "financeiro") ? botao("Novo cliente", () => editarCliente(), "btn-primario", "mais") : null), h("section", { class: "cartao" }, filtros, h("div", { style: { marginTop: "12px" } }, corpo)));
}

function editarCliente(c) {
  const f = formulario(
    [
      { titulo: "Empresa" },
      { nome: "razao_social", rotulo: "Razão social", obrigatorio: true, largura: 2 },
      { nome: "nome_fantasia", rotulo: "Nome fantasia" },
      { nome: "cnpj", rotulo: "CNPJ", obrigatorio: true },
      { nome: "cidade", rotulo: "Cidade" },
      { nome: "contato_nome", rotulo: "Responsável" },
      { nome: "email", rotulo: "E-mail financeiro", tipo: "email" },
      { nome: "telefone", rotulo: "WhatsApp", tipo: "tel" },
      { titulo: "Contrato" },
      { nome: "plano", rotulo: "Plano", placeholder: "Ex.: RH + Ponto até 50 colaboradores" },
      { nome: "valor_centavos", rotulo: "Mensalidade (R$)", tipo: "reais", obrigatorio: true },
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
    c ? { ...c, cnpj: cnpjBR(c.cnpj) } : { regras: { aviso: 1, restrito: 10, bloqueio: 20, antecedencia: 10, manter_ponto: true } },
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
      h("div", { class: "cartao-topo" }, h("h2", {}, h("span", { class: "ponto-sit" }), "Situação: ", chip(SIT, c.status === "cancelado" ? "bloqueado" : c.situacao)), c.liberado_ate ? h("span", { class: "chip chip-ok" }, `Liberado até ${dataBR(c.liberado_ate)}`) : null),
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
        c.sistemas.length ? h("div", { class: "lista-sistemas" }, c.sistemas.map((s) => cartaoSistema(s, sup))) : h("p", { class: "suave" }, "Nenhum sistema cadastrado. Cadastre o sistema e copie as 4 linhas para o .env da instalação do cliente."),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Contrato"),
        h("div", { class: "saude", style: { fontSize: "14px", display: "grid", gap: "6px" } }, h("span", {}, "Plano: ", h("strong", {}, c.plano || "—")), h("span", {}, "Mensalidade: ", h("strong", {}, reais(c.valor_centavos)), ` · vence dia ${c.dia_vencimento}`), h("span", {}, "Responsável: ", c.contato_nome || "—", c.telefone ? ` · ${c.telefone}` : "", c.email ? ` · ${c.email}` : ""), h("span", {}, "Cobrança automática (Asaas): ", estado.eu.asaas ? "ativa" : "desligada (cobrança manual)")),
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
const ACOES = { conta_criada: "Conta criada", login: "Entrou na Central", cliente_criado: "Cliente cadastrado", cliente_alterado: "Cliente alterado", bloqueio_manual: "Bloqueou o cliente", desbloqueio: "Liberou o cliente", contrato_cancelado: "Encerrou o contrato", contrato_reativado: "Reativou o contrato", fatura_criada: "Fatura avulsa criada", faturas_geradas: "Gerou mensalidades", fatura_paga: "Registrou pagamento", fatura_reaberta: "Reabriu fatura", fatura_cancelada: "Cancelou fatura", fatura_alterada: "Alterou fatura", sistema_criado: "Cadastrou sistema", sistema_alterado: "Alterou sistema", sistema_token_trocado: "Trocou a credencial do sistema", acesso_suporte: "Entrou no sistema do cliente (suporte)", situacao_aplicada: "Situação aplicada no sistema", usuario_criado: "Usuário criado", usuario_alterado: "Usuário alterado", webhook_paga: "Asaas: pagamento confirmado", webhook_aberta: "Asaas: pagamento estornado", webhook_cancelada: "Asaas: cobrança removida" };
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
