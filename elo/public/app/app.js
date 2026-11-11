/* Nexor Elo · app do instalador (PWA). Papéis: dono (tudo) e técnico (só as OS dele).
   Telas por endereço (#/…): início, propostas (nova, detalhe, editar), fornecedores e catálogo, comparador,
   kits, clientes, OS, contratos, notas, títulos, notificações e conta/equipe. */
import { aplicarTemaSalvo, alternarTema, aviso, botao, campo, chamar, chip, chipProposta, cnpjBR, dataHora, diaDe, entrada, h, hojeBR, ic, limpar, reais, soDigitos, temaEscuro, vazio, vigiarConexao } from "./nucleo.js";
import { S, dono, get, ir, nomeEmpresa, post, put } from "./estado.js";
import { telaEditor, telaPropostas, telaProposta } from "./proposta.js";
import { linhaOs, telaOs, telaOsLista, telaOsNova } from "./os.js";
import { telaCatalogo, telaClientes, telaComparar, telaContratos, telaFornecedores, telaKits, telaNotas, telaTitulos } from "./telas.js";

aplicarTemaSalvo();
vigiarConexao();
const raiz = document.getElementById("app");

/* ---------- Rotas ---------- */
const ROTAS = [
  [/^(inicio)?$/, telaInicio, { titulo: "Início", nav: "inicio" }],
  [/^propostas$/, telaPropostas, { titulo: "Propostas", nav: "propostas", dono: true }],
  [/^propostas\/nova$/, (el) => telaEditor(el, null), { titulo: "Nova proposta", nav: "nova", dono: true }],
  [/^propostas\/([\w-]+)\/editar$/, (el, [id]) => telaEditor(el, id), { titulo: "Editar proposta", nav: "propostas", dono: true, voltar: true }],
  [/^propostas\/([\w-]+)$/, (el, [id], q) => telaProposta(el, id, q), { titulo: "Proposta", nav: "propostas", dono: true, voltar: "propostas" }],
  [/^fornecedores$/, telaFornecedores, { titulo: "Fornecedores", nav: "mais", dono: true }],
  [/^fornecedores\/([\w-]+)$/, (el, [id]) => telaCatalogo(el, id), { titulo: "Catálogo", nav: "mais", dono: true, voltar: "fornecedores" }],
  [/^comparar$/, telaComparar, { titulo: "Comparador", nav: "mais", dono: true }],
  [/^kits$/, telaKits, { titulo: "Kits", nav: "mais", dono: true }],
  [/^clientes$/, telaClientes, { titulo: "Clientes", nav: "mais", dono: true }],
  [/^os$/, telaOsLista, { titulo: "Ordens de serviço", nav: "os" }],
  [/^os\/nova$/, (el, _, q) => telaOsNova(el, q), { titulo: "Nova OS", nav: "os", dono: true, voltar: "os" }],
  [/^os\/([\w-]+)$/, (el, [id]) => telaOs(el, id), { titulo: "Ordem de serviço", nav: "os", voltar: "os" }],
  [/^contratos$/, telaContratos, { titulo: "Contratos recorrentes", nav: "mais", dono: true }],
  [/^notas$/, telaNotas, { titulo: "Notas fiscais", nav: "mais", dono: true }],
  [/^titulos$/, telaTitulos, { titulo: "Títulos com fornecedores", nav: "mais", dono: true }],
  [/^notificacoes$/, telaNotificacoes, { titulo: "Notificações", nav: "inicio", dono: true }],
  [/^conta$/, telaConta, { titulo: "Conta e equipe", nav: "mais" }],
  [/^mais$/, telaMais, { titulo: "Mais", nav: "mais" }],
];
function lerRota() {
  const bruto = location.hash.replace(/^#\/?/, "");
  const [caminho, busca = ""] = bruto.split("?");
  return { caminho: caminho.replace(/\/$/, ""), q: new URLSearchParams(busca) };
}

/* ---------- Casca: topo e navegação ---------- */
function topo(def) {
  const voltar = def.voltar
    ? h("button", { class: "btn-icone", type: "button", "aria-label": "Voltar", onclick: () => (history.length > 1 && typeof def.voltar !== "string" ? history.back() : ir(def.voltar === true ? "inicio" : def.voltar)) }, ic("voltar"))
    : h("a", { class: "marca", href: "#/inicio", "aria-label": "Nexor Elo, início" }, h("span", { class: "marca-sinal", "aria-hidden": "true" }, "E"));
  const sino = dono()
    ? h("a", { class: "btn-icone", href: "#/notificacoes", "aria-label": `Notificações${S.eu.nao_lidas ? `, ${S.eu.nao_lidas} não lidas` : ""}` }, ic("sino"), S.eu.nao_lidas ? h("span", { class: "contador", "aria-hidden": "true" }, S.eu.nao_lidas > 99 ? "99+" : S.eu.nao_lidas) : null)
    : null;
  const tema = h("button", { class: "btn-icone", type: "button", "aria-label": temaEscuro() ? "Usar tema claro" : "Usar tema escuro", onclick: (e) => (alternarTema(), limpar(e.currentTarget, ic(temaEscuro() ? "sol" : "lua")), e.currentTarget.setAttribute("aria-label", temaEscuro() ? "Usar tema claro" : "Usar tema escuro")) }, ic(temaEscuro() ? "sol" : "lua"));
  return h("header", { class: "topo" }, h("div", { class: "topo-in" }, voltar, h("h1", { id: "titulo-tela" }, def.titulo), sino, tema));
}
function nav(ativo) {
  const itens = dono()
    ? [["inicio", "Início", "inicio"], ["propostas", "Propostas", "proposta"], ["nova", "Nova", "mais", "propostas/nova"], ["os", "OS", "os"], ["mais", "Mais", "menu"]]
    : [["inicio", "Início", "inicio"], ["os", "Minhas OS", "os"], ["mais", "Conta", "conta", "conta"]];
  return h(
    "nav",
    { class: "nav", "aria-label": "Navegação principal" },
    h("div", { class: "nav-in" }, itens.map(([id, rotulo, icone, rota]) => h("a", { href: `#/${rota ?? id}`, class: id === "nova" ? "nova" : "", "aria-current": id === ativo ? "page" : null }, ic(icone, 22), rotulo))),
  );
}

let geracao = 0;
async function desenhar() {
  const minha = ++geracao;
  const { caminho, q } = lerRota();
  if (!S.eu) {
    try {
      S.eu = await chamar("/api/instalador/eu");
    } catch (e) {
      if (e.status !== 401) {
        limpar(raiz, h("div", { class: "tela-entrar" }, h("div", { class: "cartao" }, h("h1", {}, "Não foi possível abrir o app"), h("p", { class: "suave" }, e.message), botao("Tentar de novo", () => desenhar(), "btn-cor btn-bloco"))));
        return;
      }
    }
  }
  if (minha !== geracao) return;
  if (!S.eu) {
    document.body.classList.remove("com-nav");
    return caminho === "cadastro" ? telaCadastro() : telaEntrar();
  }
  if (caminho === "entrar" || caminho === "cadastro") return ir("inicio");
  let achou = null;
  for (const [re, fn, def] of ROTAS) {
    const m = re.exec(caminho);
    if (m) {
      achou = [fn, def, m.slice(1).filter((x) => x !== undefined && x !== "inicio")];
      break;
    }
  }
  if (!achou) return ir("inicio");
  let [fn, def, params] = achou;
  if (def.dono && !dono()) return ir("os");
  document.title = `${def.titulo} · Nexor Elo`;
  const principal = h("main", { class: "casca", id: "conteudo", tabindex: "-1" }, h("div", { class: "tela-carregando" }, h("span", { class: "girando", role: "status", "aria-label": "Carregando" })));
  document.body.classList.add("com-nav");
  limpar(raiz, topo(def), principal, nav(def.nav));
  try {
    await fn(principal, params, q);
  } catch (e) {
    if (minha !== geracao) return;
    if (e.status === 401) {
      S.eu = null;
      aviso("Sua sessão terminou. Entre de novo para continuar.", true);
      return desenhar();
    }
    limpar(principal, vazio("alerta", "Não foi possível carregar", e.message, botao("Tentar de novo", () => desenhar(), "btn-fantasma")));
  }
}
addEventListener("hashchange", () => {
  desenhar();
  scrollTo(0, 0);
});
/** Erro 401 vindo de uma ação: volta para o login sem perder o que estava em montagem */
addEventListener("unhandledrejection", (e) => {
  if (e.reason?.status === 401) {
    S.eu = null;
    desenhar();
  }
});

/* ---------- Entrar e cadastro ---------- */
function telaEntrar() {
  document.title = "Entrar · Nexor Elo";
  const email = entrada({ type: "email", autocomplete: "username", inputmode: "email", required: true });
  const senha = entrada({ type: "password", autocomplete: "current-password", required: true });
  const enviar = botao("Entrar", async () => {
    await chamar("/api/instalador/entrar", { metodo: "POST", corpo: { email: email.value.trim(), senha: senha.value } });
    S.eu = null;
    desenhar();
  }, "btn-cor btn-bloco");
  const form = h("form", { class: "pilha", onsubmit: (e) => (e.preventDefault(), enviar.click()) }, campo("E-mail", email), campo("Senha", senha), enviar);
  limpar(
    raiz,
    h(
      "main",
      { class: "tela-entrar" },
      h(
        "div",
        { class: "cartao" },
        h("div", { class: "linha-esq" }, h("span", { class: "marca-sinal", "aria-hidden": "true" }, "E"), h("strong", {}, "Nexor Elo")),
        h("h1", {}, "Entrar no app do instalador"),
        h("p", { class: "suave pequeno" }, "Monte a proposta com o estoque do fornecedor, envie ao cliente e receba já dividido."),
        form,
        h("p", { class: "pequeno suave" }, "Ainda não tem conta? ", h("a", { href: "#/cadastro" }, "Cadastre sua empresa pelo CNPJ")),
        S.demo ? h("p", { class: "pequeno aviso-faixa info" }, ic("alerta", 16), h("span", {}, "Demonstração: entre por ", h("a", { href: "/demo" }, "/demo"), " ou use a senha demo-elo-2026.")) : null,
      ),
    ),
  );
  email.focus();
}

/* CNAEs dos segmentos atendidos pelos fornecedores do Elo (segurança, elétrica, solar, refrigeração, telecom, hidráulica, automação) */
const SEGMENTOS = [["8020", "Monitoramento de sistemas de segurança"], ["4321", "Instalação elétrica"], ["4322", "Hidráulica, ventilação e refrigeração"], ["4329", "Outras instalações em construções"], ["6110", "Telecomunicações por fio"], ["6190", "Outras atividades de telecomunicações"], ["3321", "Instalação de máquinas e equipamentos"], ["4399", "Serviços especializados para construção"], ["3314", "Manutenção de máquinas e equipamentos"], ["9512", "Reparação de equipamentos de comunicação"]];
function telaCadastro() {
  document.title = "Cadastro · Nexor Elo";
  const cnpj = entrada({ inputmode: "numeric", autocomplete: "off", placeholder: "00.000.000/0000-00", maxlength: 18 });
  const resultado = h("div", { class: "pilha", "aria-live": "polite" });
  const resto = h("div", { class: "pilha", hidden: true });
  const nome = entrada({ autocomplete: "name" });
  const fantasia = entrada({ autocomplete: "organization" });
  const email = entrada({ type: "email", autocomplete: "email", inputmode: "email" });
  const fone = entrada({ type: "tel", autocomplete: "tel-national", inputmode: "tel" });
  const senha = entrada({ type: "password", autocomplete: "new-password", minlength: 10 });
  let consultado = null;
  const consultar = botao("Consultar CNPJ", async () => {
    const d = soDigitos(cnpj.value);
    if (d.length !== 14) throw new Error("Digite os 14 números do CNPJ.");
    const x = await chamar(`/api/publico/cnpj/${d}`);
    consultado = x;
    const compat = x.cnaes.filter((c) => SEGMENTOS.some(([p]) => String(c).startsWith(p)));
    fantasia.value = x.nome_fantasia ?? "";
    limpar(
      resultado,
      h(
        "div",
        { class: "cartao destaque" },
        h("div", { class: "linha" }, h("strong", { class: "quebra" }, x.razao_social), chip(x.situacao || "—", x.situacao === "ATIVA" ? "ok" : "perigo")),
        h("span", { class: "suave pequeno" }, `${cnpjBR(x.cnpj)} · ${x.cidade ?? ""}/${x.uf ?? ""}`),
        h("div", { class: "pequeno" }, h("strong", {}, "CNAE principal: "), `${x.cnaes[0] ?? "—"}${x.cnae_descricao ? ` · ${x.cnae_descricao}` : ""}`),
        x.cnaes.length > 1 ? h("div", { class: "pequeno suave" }, `Secundários: ${x.cnaes.slice(1).join(", ")}`) : null,
      ),
      x.situacao !== "ATIVA"
        ? h("div", { class: "aviso-faixa" }, ic("alerta"), h("span", {}, `Este CNPJ está com situação "${x.situacao || "desconhecida"}" na Receita. Só CNPJ ativo pode se cadastrar.`))
        : compat.length
          ? h("div", { class: "aviso-faixa ok" }, ic("check"), h("span", {}, `CNAE compatível: ${compat.map((c) => `${c} (${SEGMENTOS.find(([p]) => String(c).startsWith(p))[1]})`).join(", ")}.`))
          : h("div", { class: "aviso-faixa" }, ic("alerta"), h("span", {}, "Nenhum CNAE deste CNPJ é dos segmentos atendidos pelos fornecedores do Elo (segurança, elétrica, refrigeração, telecom, hidráulica, automação). Você pode se cadastrar, mas os fornecedores podem recusar o vínculo.")),
    );
    resto.hidden = x.situacao !== "ATIVA";
    if (!resto.hidden) nome.focus();
  }, "btn-fantasma btn-bloco", "busca");
  const criar = botao("Criar minha conta", async () => {
    if (!consultado) throw new Error("Consulte o CNPJ primeiro.");
    await chamar("/api/instalador/cadastro", { metodo: "POST", corpo: { cnpj: consultado.cnpj, nome: nome.value.trim(), email: email.value.trim(), senha: senha.value, ...(soDigitos(fone.value) ? { telefone: soDigitos(fone.value) } : {}), ...(fantasia.value.trim() ? { nome_fantasia: fantasia.value.trim() } : {}) } });
    S.eu = null;
    aviso("Conta criada. Agora peça vínculo aos fornecedores.");
    location.hash = "#/fornecedores";
  }, "btn-cor btn-bloco");
  resto.append(campo("Nome fantasia", fantasia), campo("Seu nome", nome), campo("E-mail", email), campo("Celular (WhatsApp)", fone), campo("Senha", senha, "Pelo menos 10 caracteres."), criar);
  limpar(
    raiz,
    h(
      "main",
      { class: "tela-entrar" },
      h(
        "div",
        { class: "cartao" },
        h("a", { href: "#/entrar", class: "pequeno" }, "← Voltar para entrar"),
        h("h1", {}, "Cadastre sua empresa"),
        h("p", { class: "suave pequeno" }, "Consultamos o CNPJ na Receita: razão social, cidade e CNAEs vêm de lá. O fornecedor aprova o vínculo pelo CNAE."),
        h("form", { class: "pilha", onsubmit: (e) => (e.preventDefault(), consultar.click()) }, campo("CNPJ", cnpj), consultar),
        resultado,
        resto,
      ),
    ),
  );
  cnpj.focus();
}

/* ---------- Início ---------- */
async function telaInicio(el) {
  if (!dono()) return inicioTecnico(el);
  const [p, oss, notifs, propostas] = await Promise.all([get("/painel"), get("/os"), get("/notificacoes"), get("/propostas")]);
  const hoje = hojeBR();
  const osHoje = oss.filter((o) => o.agendada_para && diaDe(o.agendada_para) === hoje && o.status !== "cancelada");
  const st = p.propostas ?? {};
  const vencendo = propostas.filter((x) => ["enviada", "vista", "aceita"].includes(x.status) && x.reserva_expira_em && x.reserva_expira_em <= Date.now() + 2 * 86400_000);
  const statusLista = ["rascunho", "enviada", "vista", "aceita", "paga", "expirada"];
  limpar(
    el,
    h("p", { class: "suave", style: { marginTop: "14px" } }, `Olá, ${S.eu.usuario.nome.split(" ")[0]} · ${nomeEmpresa()}`),
    !p.wallet ? h("div", { class: "aviso-faixa", style: { marginTop: "10px" } }, ic("alerta"), h("span", {}, "Cadastre o walletId da sua conta Asaas em ", h("a", { href: "#/conta" }, "Conta"), " para o cliente conseguir pagar e o split cair direto para você.")) : null,
    h(
      "div",
      { class: "secao" },
      h("div", { class: "cartao destaque" }, h("div", { class: "grade2" }, h("div", { class: "kpi" }, h("small", {}, "Vendido em 30 dias"), h("strong", {}, reais(p.vendido_30d_centavos))), h("div", { class: "kpi" }, h("small", {}, "Recebido em 30 dias"), h("strong", {}, reais(p.recebido_30d_centavos)))), h("a", { class: "btn btn-cor btn-bloco", href: "#/propostas/nova" }, ic("mais", 18), "Nova proposta")),
    ),
    h(
      "section",
      { class: "secao", "aria-labelledby": "s-prop" },
      h("h2", { id: "s-prop" }, "Propostas por status"),
      h("div", { class: "grade3" }, statusLista.map((s) => h("a", { class: "cartao cartao-link kpi", href: `#/propostas?status=${s}` }, h("small", {}, chipProposta(s)), h("strong", {}, String(st[s] ?? 0))))),
    ),
    h(
      "section",
      { class: "secao", "aria-labelledby": "s-os" },
      h("div", { class: "linha" }, h("h2", { id: "s-os", class: "rotulo-secao" }, `OS de hoje (${osHoje.length})`), h("a", { href: "#/os", class: "pequeno" }, `${p.os_abertas} abertas · ver todas`)),
      osHoje.length ? h("div", { class: "cartao" }, osHoje.map(linhaOs)) : h("div", { class: "cartao" }, h("p", { class: "suave pequeno" }, "Nenhuma OS agendada para hoje.")),
    ),
    h(
      "section",
      { class: "secao", "aria-labelledby": "s-res" },
      h("h2", { id: "s-res" }, "Reservas vencendo (até 2 dias)"),
      vencendo.length
        ? h("div", { class: "cartao" }, vencendo.map((x) => h("a", { class: "item cartao-link", href: `#/propostas/${x.id}` }, h("div", { class: "miniatura" }, ic("relogio")), h("div", { class: "meio" }, h("strong", { class: "quebra" }, `#${x.numero} · ${x.titulo}`), h("div", { class: "pequeno suave" }, `${x.cliente ?? "Sem cliente"} · vence ${dataHora(x.reserva_expira_em)}`)), chipProposta(x.status))))
        : h("div", { class: "cartao" }, h("p", { class: "suave pequeno" }, "Nenhuma reserva vencendo agora.")),
    ),
    h(
      "section",
      { class: "secao" },
      h("div", { class: "grade2" },
        h("a", { class: "cartao cartao-link kpi", href: "#/titulos" }, h("small", {}, "Títulos em aberto"), h("strong", {}, reais(p.titulos_abertos_centavos)), p.titulos_vencidos ? chip(`${p.titulos_vencidos} vencido(s)`, "perigo") : h("span", { class: "pequeno ok" }, "Nada vencido")),
        h("a", { class: "cartao cartao-link kpi", href: "#/contratos" }, h("small", {}, "Recorrente por mês"), h("strong", {}, reais(p.recorrente_mensal_centavos)), h("span", { class: "pequeno suave" }, `${p.contratos_ativos} contrato(s) ativo(s)`)),
      ),
    ),
    h(
      "section",
      { class: "secao", "aria-labelledby": "s-not" },
      h("div", { class: "linha" }, h("h2", { id: "s-not", class: "rotulo-secao" }, `Notificações${p.nao_lidas ? ` (${p.nao_lidas} novas)` : ""}`), h("a", { href: "#/notificacoes", class: "pequeno" }, "ver todas")),
      h("div", { class: "cartao" }, notifs.length ? notifs.slice(0, 5).map(linhaNotificacao) : h("p", { class: "suave pequeno" }, "Sem notificações.")),
    ),
  );
}
function linhaNotificacao(n) {
  return h("div", { class: "item" }, h("div", { class: "miniatura" }, ic(n.tipo?.startsWith("os") ? "os" : n.tipo?.startsWith("titulo") ? "titulo" : "sino")), h("div", { class: "meio" }, h("div", { class: `quebra ${n.lida ? "suave" : ""}` }, n.lida ? n.texto : h("strong", {}, n.texto)), h("small", { class: "fraco" }, dataHora(n.criado_em))));
}
async function inicioTecnico(el) {
  const [p, oss] = await Promise.all([get("/painel"), get("/os")]);
  const abertas = oss.filter((o) => !["concluida", "cancelada"].includes(o.status));
  limpar(
    el,
    h("p", { class: "suave", style: { marginTop: "14px" } }, `Olá, ${S.eu.usuario.nome.split(" ")[0]} · ${nomeEmpresa()}`),
    h("div", { class: "secao" }, h("div", { class: "cartao destaque" }, h("div", { class: "grade2" }, h("div", { class: "kpi" }, h("small", {}, "OS hoje"), h("strong", {}, String(p.os_hoje))), h("div", { class: "kpi" }, h("small", {}, "OS abertas"), h("strong", {}, String(p.os_abertas)))))),
    h("section", { class: "secao" }, h("h2", {}, "Minhas OS em aberto"), abertas.length ? h("div", { class: "cartao" }, abertas.map(linhaOs)) : h("div", { class: "cartao" }, vazio("check", "Tudo em dia", "Nenhuma OS aberta para você."))),
  );
}

/* ---------- Notificações ---------- */
async function telaNotificacoes(el) {
  const lista = await get("/notificacoes");
  const ler = botao("Marcar todas como lidas", async () => {
    await post("/notificacoes/lidas", {});
    S.eu.nao_lidas = 0;
    aviso("Notificações marcadas como lidas.");
    ir("notificacoes");
  }, "btn-fantasma btn-peq", "check");
  limpar(el, h("div", { class: "secao" }, h("div", { class: "linha" }, h("span", { class: "suave pequeno" }, `${lista.filter((n) => !n.lida).length} não lidas`), ler), h("div", { class: "cartao" }, lista.length ? lista.map(linhaNotificacao) : vazio("sino", "Sem notificações"))));
}

/* ---------- Mais ---------- */
function telaMais(el) {
  if (!dono()) return ir("conta");
  const itens = [
    ["fornecedores", "caixa", "Fornecedores", "Vínculos e catálogos"],
    ["comparar", "balanca", "Comparador", "Melhor preço e estoque"],
    ["kits", "kit", "Kits", "Modelos prontos"],
    ["clientes", "pessoas", "Clientes", "Só você vê"],
    ["contratos", "repetir", "Contratos", "Receita recorrente"],
    ["notas", "nota", "Notas fiscais", "NFS-e do serviço"],
    ["titulos", "titulo", "Títulos", "Compras a prazo"],
    ["conta", "conta", "Conta e equipe", "Asaas, NF e técnicos"],
  ];
  limpar(el, h("div", { class: "secao" }, h("nav", { class: "menu-grade", "aria-label": "Mais telas" }, itens.map(([r, i, t, s]) => h("a", { href: `#/${r}` }, ic(i, 22), t, h("small", {}, s))))));
}

/* ---------- Conta e equipe ---------- */
async function telaConta(el) {
  const c = S.eu.conta;
  const sair = botao("Sair", async () => {
    await chamar("/api/instalador/sair", { metodo: "POST", corpo: {} });
    S.eu = null;
    location.hash = "#/entrar";
  }, "btn-perigo", "sair");
  const atual = entrada({ type: "password", autocomplete: "current-password" });
  const nova = entrada({ type: "password", autocomplete: "new-password", minlength: 10 });
  const trocar = botao("Trocar senha", async () => {
    await chamar("/api/instalador/eu/senha", { metodo: "POST", corpo: { atual: atual.value, nova: nova.value } });
    atual.value = nova.value = "";
    aviso("Senha trocada. As outras sessões foram encerradas.");
  }, "btn-fantasma");
  const blocoUsuario = h("section", { class: "secao" }, h("h2", {}, "Seu acesso"), h("div", { class: "cartao" }, h("div", { class: "linha-esq" }, h("span", { class: "avatar", "aria-hidden": "true" }, S.eu.usuario.nome.slice(0, 1)), h("div", { class: "meio" }, h("strong", {}, S.eu.usuario.nome), h("div", { class: "pequeno suave quebra" }, `${S.eu.usuario.email} · ${S.eu.usuario.papel === "dono" ? "Dono" : "Técnico"}`))), h("details", { class: "dobra" }, h("summary", {}, "Trocar senha"), h("div", { class: "pilha", style: { marginTop: "10px" } }, campo("Senha atual", atual), campo("Nova senha", nova, "Pelo menos 10 caracteres."), trocar)), sair));
  if (!dono()) return limpar(el, h("p", { class: "suave", style: { marginTop: "14px" } }, nomeEmpresa()), blocoUsuario);

  const equipe = await get("/equipe");
  const f = {
    nome_fantasia: entrada({ value: c.nome_fantasia ?? "" }),
    telefone: entrada({ type: "tel", inputmode: "tel", value: c.telefone ?? "" }),
    email: entrada({ type: "email", value: c.email ?? "" }),
    wallet_id: entrada({ placeholder: c.config.wallet ? `Atual: ${c.config.wallet} (deixe em branco para manter)` : "walletId da sua conta Asaas", autocomplete: "off" }),
    asaas_chave: entrada({ type: "password", placeholder: c.config.asaas_chave ? "Chave cadastrada (deixe em branco para manter)" : "Chave de API do seu Asaas", autocomplete: "off" }),
    focus_token: entrada({ type: "password", placeholder: c.config.focus_token ? "Token cadastrado (deixe em branco para manter)" : "Token da Focus NFe", autocomplete: "off" }),
    inscricao_municipal: entrada({ value: c.config.inscricao_municipal ?? "" }),
    codigo_municipio: entrada({ inputmode: "numeric", value: c.config.codigo_municipio ?? "" }),
    item_lista_servico: entrada({ value: c.config.item_lista_servico ?? "" }),
    aliquota_iss_pct: entrada({ inputmode: "decimal", value: c.config.aliquota_iss_pct ?? "" }),
  };
  const webhook = h("div", { class: "pilha" });
  const salvar = botao("Salvar dados da empresa", async () => {
    const corpo = {};
    for (const [k, i] of Object.entries(f)) {
      const v = i.value.trim();
      if (["wallet_id", "asaas_chave", "focus_token"].includes(k) && !v) continue;
      if (k === "aliquota_iss_pct") {
        if (v) corpo[k] = Number(v.replace(",", "."));
        continue;
      }
      if (k === "telefone") {
        if (v) corpo[k] = soDigitos(v);
        continue;
      }
      if (v) corpo[k] = v;
    }
    const r = await put("/conta", corpo);
    S.eu.conta = r;
    aviso("Dados salvos.");
    for (const k of ["wallet_id", "asaas_chave", "focus_token"]) f[k].value = "";
    if (r.webhook_contratos) limpar(webhook, h("div", { class: "aviso-faixa info" }, ic("link"), h("div", { class: "quebra pequeno" }, h("strong", {}, "Webhook dos contratos (cole no seu Asaas): "), h("div", {}, r.webhook_contratos.url), h("div", {}, `Token: ${r.webhook_contratos.token}`))));
  }, "btn-cor");
  const novo = { nome: entrada({ autocomplete: "off" }), email: entrada({ type: "email", autocomplete: "off" }), telefone: entrada({ type: "tel", inputmode: "tel" }), senha: entrada({ type: "password", autocomplete: "new-password" }) };
  const addTec = botao("Adicionar técnico", async () => {
    await post("/equipe", { nome: novo.nome.value.trim(), email: novo.email.value.trim(), senha: novo.senha.value, papel: "tecnico", ...(soDigitos(novo.telefone.value) ? { telefone: soDigitos(novo.telefone.value) } : {}) });
    aviso("Técnico adicionado. Ele entra com o e-mail e a senha que você definiu.");
    ir("conta");
  }, "btn-cor", "mais");
  limpar(
    el,
    h("section", { class: "secao" }, h("h2", {}, "Empresa"), h("div", { class: "cartao" }, h("strong", { class: "quebra" }, c.razao_social), h("span", { class: "pequeno suave" }, `${cnpjBR(c.cnpj)} · ${c.cidade ?? ""}/${c.uf ?? ""}`), h("span", { class: "pequeno suave" }, `CNAEs: ${(c.cnaes ?? []).join(", ")}`), h("div", { class: "linha-esq" }, chip(c.config.wallet ? `Asaas wallet ${c.config.wallet}` : "Sem walletId", c.config.wallet ? "ok" : "alerta"), chip(c.config.asaas_chave ? "Asaas (contratos) ligado" : "Sem chave Asaas", c.config.asaas_chave ? "ok" : ""), chip(c.config.focus_token ? "Focus NFe ligado" : "NFS-e simulada", c.config.focus_token ? "ok" : "")))),
    h(
      "section",
      { class: "secao" },
      h("h2", {}, "Dados e integrações"),
      h(
        "div",
        { class: "cartao pilha" },
        h("div", { class: "grade2" }, campo("Nome fantasia (aparece na proposta)", f.nome_fantasia), campo("Telefone", f.telefone)),
        campo("E-mail", f.email),
        campo("walletId Asaas (recebe o split)", f.wallet_id, "Guardado cifrado. Sem ele o cliente não consegue pagar."),
        campo("Chave de API do seu Asaas (contratos recorrentes)", f.asaas_chave),
        campo("Token Focus NFe (NFS-e)", f.focus_token),
        h("div", { class: "grade2" }, campo("Inscrição municipal", f.inscricao_municipal), campo("Código do município (IBGE)", f.codigo_municipio), campo("Item da lista de serviço", f.item_lista_servico), campo("Alíquota do ISS (%)", f.aliquota_iss_pct)),
        salvar,
        webhook,
      ),
    ),
    h(
      "section",
      { class: "secao" },
      h("h2", {}, "Equipe"),
      h("div", { class: "cartao" }, equipe.map((u) => {
        const alternar = u.papel === "dono" ? null : botao(u.ativo ? "Desativar" : "Reativar", async () => {
          await put(`/equipe/${u.id}`, { ativo: !u.ativo });
          aviso(u.ativo ? "Acesso desativado." : "Acesso reativado.");
          ir("conta");
        }, u.ativo ? "btn-perigo btn-peq" : "btn-fantasma btn-peq");
        return h("div", { class: "item" }, h("span", { class: "avatar", "aria-hidden": "true" }, u.nome.slice(0, 1)), h("div", { class: "meio" }, h("strong", {}, u.nome), h("div", { class: "pequeno suave quebra" }, `${u.email} · ${u.papel === "dono" ? "Dono" : "Técnico"}${u.ativo ? "" : " · inativo"}`)), alternar);
      })),
      h("details", { class: "cartao dobra" }, h("summary", {}, ic("mais", 18), "Adicionar técnico"), h("div", { class: "pilha" }, campo("Nome", novo.nome), campo("E-mail", novo.email), campo("Celular", novo.telefone), campo("Senha inicial", novo.senha, "Pelo menos 10 caracteres."), addTec)),
    ),
    blocoUsuario,
  );
}

/* ---------- Partida ---------- */
(async () => {
  try {
    const r = await fetch("/api/demo", { cache: "no-store" });
    S.demo = r.ok;
  } catch {
    S.demo = false;
  }
  desenhar();
})();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(() => {});
