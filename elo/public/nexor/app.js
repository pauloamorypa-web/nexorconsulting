/* Nexor Elo · painel da OPERAÇÃO NEXOR: fornecedores e instaladores (aprovar, recusar, suspender, reativar),
   métricas agregadas da rede (sem dado de cliente), integrações da plataforma, operadores e auditoria. */

import { h, limpar, topo, tabela, abas, botao, janela, formulario, indicador, reais, numero, situacao, dataHora, cnpjBR, cidadeBonita, aviso, perguntar, entrada, campo, vazio, copiarTexto, quando, icone, acao } from "../comum/ui.js";
import { criarApi } from "../comum/api.js";
import { iniciarPainel } from "../comum/casca.js";
import { rotuloAcao, resumoDetalhe } from "../fornecedor/telas/conta.js";

const api = criarApi("nexor");

iniciarPainel({
  area: "nexor",
  nome: "Operação Nexor",
  subtitulo: "Operação Nexor",
  api,
  perfil: () => "Operador",
  login: {
    titulo: "Operação Nexor",
    texto: "Acesso restrito à equipe Nexor.",
    chamada: "A rede Elo inteira num lugar: cadastros, métricas e integrações.",
    destaques: [
      ["predio", "Aprovação de fornecedores", "Confira CNPJ, CNAEs e cidade antes de liberar para os instaladores."],
      ["grafico", "Métricas agregadas", "Propostas por status, valor pago e taxa da plataforma. Sem dados de cliente final."],
      ["link", "Integrações", "Asaas da plataforma, webhook, consulta de CNPJ e mensagens."],
    ],
  },
  antesDoLogin: async ({ telaLogin, iniciar }) => {
    let estado = { primeiro_acesso: false };
    try {
      estado = await api.get("/estado");
    } catch {
      /* sem estado: segue para o login */
    }
    if (!estado.primeiro_acesso) return telaLogin();
    primeiroAcesso(estado, iniciar);
  },
  menu: (eu) => [
    { id: "painel", rotulo: "Métricas", icone: "grafico" },
    { id: "fornecedores", rotulo: "Fornecedores", icone: "predio", selo: () => eu._pendentes },
    { id: "instaladores", rotulo: "Instaladores", icone: "ferramenta" },
    { id: "integracoes", rotulo: "Integrações", icone: "link" },
    { id: "operadores", rotulo: "Operadores", icone: "pessoas" },
    { id: "auditoria", rotulo: "Auditoria", icone: "escudo" },
  ],
  telas: { painel: telaMetricas, fornecedores: (c) => telaContas(c, "fornecedor"), instaladores: (c) => telaContas(c, "instalador"), integracoes: telaIntegracoes, operadores: telaOperadores, auditoria: telaAuditoria },
});

function primeiroAcesso(estado, iniciar) {
  const f = formulario([
    estado.exige_codigo ? { nome: "codigo_instalacao", rotulo: "Código de instalação", obrigatorio: true, largura: 2, ajuda: "Está no arquivo codigo-instalacao.txt da pasta de dados do servidor." } : null,
    { nome: "nome", rotulo: "Seu nome", obrigatorio: true, largura: 2 },
    { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largura: 2 },
    { nome: "senha", rotulo: "Senha", tipo: "senha", obrigatorio: true, largura: 2, autocomplete: "new-password", ajuda: "Pelo menos 8 caracteres." },
  ].filter(Boolean));
  const enviar = h("button", { type: "submit", class: "btn btn-primario btn-grande" }, "Criar o primeiro operador");
  const form = h("form", { class: "cartao pilha", style: { maxWidth: "520px", margin: "8vh auto" }, novalidate: true }, h("h1", {}, "Primeiro acesso da operação"), h("p", { class: "suave" }, "Ainda não há operador Nexor nesta instalação. Crie o primeiro acesso."), f.el, enviar);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    acao(enviar, async () => {
      await api.post("/primeiro-acesso", f.ler());
      aviso("Operador criado.");
      iniciar();
    });
  });
  limpar(document.getElementById("app"), h("main", { class: "pagina" }, form));
}

/* ---------- Métricas ---------- */

const ORDEM_STATUS = ["rascunho", "enviada", "vista", "aceita", "paga", "expirada", "cancelada"];

async function telaMetricas(ctx) {
  const [m, notificacoes] = await Promise.all([api.get("/metricas"), api.get("/notificacoes")]);
  ctx.eu._pendentes = m.fornecedores?.pendentes ?? 0;
  const props = m.propostas ?? {};
  const total = Object.values(props).reduce((s, n) => s + n, 0);
  const max = Math.max(1, ...Object.values(props));
  return h(
    "div",
    { class: "pagina" },
    topo("Métricas da rede", "Números agregados de todos os fornecedores e instaladores. Nenhum dado de cliente final."),
    h(
      "section",
      { class: "indicadores", "aria-label": "Indicadores da rede" },
      indicador("predio", "Fornecedores ativos", numero(m.fornecedores?.ativos), `${numero(m.fornecedores?.pendentes)} aguardando aprovação`, "var(--azul)", { href: "#/fornecedores", classe: m.fornecedores?.pendentes ? "alerta" : "" }),
      indicador("ferramenta", "Instaladores ativos", numero(m.instaladores), `${numero(m.vinculos_aprovados)} vínculos aprovados`, "var(--violeta)", { href: "#/instaladores" }),
      indicador("nota", "Propostas", numero(total), `${numero(props.paga)} pagas`, "var(--ciano)"),
      indicador("dinheiro", "Total pago pelos clientes", reais(m.pago_total_centavos), "pela plataforma", "var(--verde)"),
      indicador("carteira", "Taxa da plataforma", reais(m.taxa_plataforma_centavos), "retida no split", "var(--verde)"),
      indicador("relogio", "OS abertas", numero(m.ordens_abertas), "nos instaladores", "var(--amarelo)"),
    ),
    h(
      "div",
      { class: "grade-painel" },
      h(
        "section",
        { class: "cartao largo", "aria-labelledby": "t-st" },
        h("h2", { id: "t-st" }, "Propostas por situação"),
        h("div", { class: "funil" }, ORDEM_STATUS.filter((s) => props[s] !== undefined).map((s) => h("div", { class: "funil-linha" }, situacao(s), h("span", { class: "funil-barra", "aria-hidden": "true" }, h("span", { style: { width: `${Math.round((props[s] / max) * 100)}%` } })), h("strong", { class: "numero" }, numero(props[s])), h("small", {}, total ? `${Math.round((props[s] / total) * 100)}%` : "")))),
      ),
      h(
        "section",
        { class: "cartao", "aria-labelledby": "t-not" },
        h("h2", { id: "t-not" }, "Avisos da operação"),
        notificacoes.length ? h("div", { class: "lista-mini" }, notificacoes.slice(0, 8).map((n) => h("a", { class: "mini-item", href: n.tipo === "fornecedor_novo" ? "#/fornecedores" : "#/painel" }, h("span", {}, n.texto), h("small", {}, quando(n.criado_em))))) : vazio("sino", "Nenhum aviso"),
      ),
    ),
  );
}

/* ---------- Fornecedores e instaladores ---------- */

async function telaContas(ctx, tipo) {
  const ehF = tipo === "fornecedor";
  let aba = ctx.query.get("status") ?? (ehF ? "pendente" : "ativo");
  let contas = [];
  const barra = h("div");
  const corpo = h("div", { "aria-live": "polite" });
  const busca = entrada({ type: "search", placeholder: "Buscar por nome, CNPJ ou cidade", "aria-label": "Buscar" });

  async function carregar() {
    contas = await api.get(`/${tipo}es`);
    if (ehF) ctx.eu._pendentes = contas.filter((c) => c.status === "pendente").length;
    if (ehF && aba === "pendente" && !ctx.eu._pendentes && !ctx.query.get("status")) aba = "ativo";
    pintar();
  }
  function pintar() {
    const n = (s) => contas.filter((c) => c.status === s).length;
    const opcoes = ehF ? [["pendente", "Pendentes"], ["ativo", "Ativos"], ["suspenso", "Suspensos"], ["recusado", "Recusados"], ["", "Todos"]] : [["ativo", "Ativos"], ["pendente", "Pendentes"], ["suspenso", "Suspensos"], ["", "Todos"]];
    limpar(barra, abas(opcoes.map(([v, t]) => [v, t, v ? n(v) : contas.length]), aba, (id) => ((aba = id), pintar())));
    const q = busca.value.trim().toLowerCase();
    const lista = contas.filter((c) => (!aba || c.status === aba) && (!q || `${c.razao_social} ${c.nome_fantasia ?? ""} ${c.cnpj} ${c.cidade}`.toLowerCase().includes(q)));
    limpar(
      corpo,
      tabela(
        [
          { titulo: ehF ? "Fornecedor" : "Instalador", valor: (c) => h("div", {}, h("span", { class: "celula-forte" }, c.nome_fantasia || c.razao_social), h("span", { class: "celula-sub" }, `${c.razao_social} · ${cnpjBR(c.cnpj)}`)) },
          { titulo: "Cidade", valor: (c) => `${cidadeBonita(c.cidade)}/${c.uf ?? ""}` },
          { titulo: ehF ? "CNAEs aceitos" : "CNAEs", valor: (c) => h("span", { class: "mono" }, (c.cnaes ?? []).join(", ") || "—") },
          ehF && { titulo: "Split", valor: (c) => (c.config?.wallet ? h("span", { class: "chip chip-ok" }, "walletId ok") : h("span", { class: "chip chip-alerta" }, "sem walletId")) },
          { titulo: "Acessos", classe: "numero", valor: (c) => numero(c.usuarios) },
          { titulo: "Situação", valor: (c) => h("div", {}, situacao(c.status), c.aprovado_por && c.status === "ativo" ? h("span", { class: "celula-sub" }, `por ${c.aprovado_por}`) : null) },
          { titulo: "Cadastro", valor: (c) => dataHora(c.criado_em) },
          { titulo: "Ações", classe: "acoes-celula", valor: (c) => h("div", { class: "acoes-linha" }, acoesConta(c)) },
        ].filter(Boolean),
        lista,
        { vazio: aba === "pendente" ? `Nenhum ${tipo} aguardando aprovação.` : "Nada nesta situação.", rotulo: ehF ? "Fornecedores" : "Instaladores" },
      ),
    );
  }
  function acoesConta(c) {
    const nome = c.nome_fantasia || c.razao_social;
    const mudar = (acaoNome, rotulo, classe, pergunta, perigo = false) =>
      botao(rotulo, async () => {
        const motivo = await perguntar(pergunta, { titulo: `${rotulo}: ${nome}`, botao: rotulo, perigo });
        if (motivo === null) return;
        await api.post(`/${tipo}es/${c.id}/${acaoNome}`, motivo ? { motivo } : {});
        aviso(`${nome}: ${{ aprovar: "aprovado", recusar: "recusado", suspender: "suspenso", reativar: "reativado" }[acaoNome]}.`);
        await carregar();
        ctx.atualizarEu?.();
      }, `btn-pequeno ${classe}`, null, { "aria-label": `${rotulo} ${nome}` });
    const b = [];
    if (ehF && ["pendente", "recusado"].includes(c.status)) b.push(mudar("aprovar", "Aprovar", "btn-sucesso", "Aprovar o fornecedor? Os instaladores com CNAE compatível passam a vê-lo e podem pedir vínculo."));
    if (ehF && c.status === "pendente") b.push(mudar("recusar", "Recusar", "btn-perigo-fantasma", "Recusar o cadastro? A empresa não consegue mais entrar.", true));
    if (["ativo", "pendente"].includes(c.status)) b.push(mudar("suspender", "Suspender", "btn-perigo-fantasma", "Suspender a conta? Todas as sessões da equipe são encerradas e ninguém consegue entrar até a reativação.", true));
    if (c.status === "suspenso") b.push(mudar("reativar", "Reativar", "", "Reativar a conta?"));
    b.push(h("a", { class: "btn btn-pequeno btn-fantasma", href: `#/auditoria?conta=${c.id}`, "aria-label": `Auditoria de ${nome}` }, "Auditoria"));
    return b;
  }
  busca.addEventListener("input", pintar);
  await carregar();
  return h(
    "div",
    { class: "pagina" },
    topo(ehF ? "Fornecedores" : "Instaladores", ehF ? "Confira CNPJ, cidade e CNAEs aceitos antes de aprovar. Fornecedor aprovado aparece para os instaladores." : "Instaladores entram com CNPJ validado na Receita. A Nexor pode suspender e reativar."),
    h("section", { class: "cartao pilha" }, barra, h("div", { class: "filtros" }, busca), corpo),
  );
}

/* ---------- Integrações ---------- */

async function telaIntegracoes() {
  const i = await api.get("/integracoes");
  const linhaCopiar = (rotulo, valor) => h("div", { class: "copiavel" }, h("small", {}, rotulo), h("code", {}, valor ?? "—"), valor ? h("button", { type: "button", class: "btn-icone", "aria-label": `Copiar ${rotulo}`, onclick: () => copiarTexto(valor) }, icone("copiar", 16)) : h("span"));
  const tokenEl = h("div", {}, linhaCopiar("Token do webhook", i.asaas?.token_webhook));
  const f = formulario([
    { nome: "asaas_chave", rotulo: i.asaas?.configurada ? "Chave da API do Asaas (configurada; digite para trocar)" : "Chave da API do Asaas", tipo: "senha", largura: 2, autocomplete: "off", ajuda: "Conta Asaas da plataforma, que gera as cobranças com split. Fica cifrada." },
    { nome: "wallet_nexor", rotulo: `WalletId da Nexor${i.asaas?.wallet_nexor ? ` (atual ${i.asaas.wallet_nexor})` : ""}`, largura: 2, autocomplete: "off" },
  ]);
  const estado = (ok) => (ok ? h("span", { class: "chip chip-ok" }, "Configurado") : h("span", { class: "chip chip-alerta" }, "Não configurado"));
  return h(
    "div",
    { class: "pagina" },
    topo("Integrações", "Serviços externos da plataforma. Segredos ficam cifrados; esta tela mostra só o final ou se existe. Cada abertura fica na auditoria."),
    h(
      "div",
      { class: "grade-form" },
      h(
        "section",
        { class: "cartao", "aria-labelledby": "t-asaas" },
        h("div", { class: "cartao-topo" }, h("h2", { id: "t-asaas" }, icone("dinheiro"), "Asaas (pagamentos e split)"), estado(i.asaas?.configurada)),
        h("div", { class: "pilha" }, linhaCopiar("Endereço da API", i.asaas?.url), linhaCopiar("URL do webhook", i.asaas?.webhook), tokenEl, h("p", { class: "pequeno suave" }, `Taxa da plataforma: ${(Number(i.taxa_plataforma_bps ?? 0) / 100).toLocaleString("pt-BR")}% por venda liquidada.`)),
        f.el,
        h(
          "div",
          { class: "acoes-topo" },
          botao("Salvar", async () => {
            const d = f.ler();
            if (!d.asaas_chave && !d.wallet_nexor) throw new Error("Digite a chave ou o walletId para salvar.");
            await api.put("/integracoes", d);
            f.entrada("asaas_chave").value = "";
            aviso("Integração salva.");
          }, "btn-primario"),
          botao("Gerar novo token do webhook", async () => {
            const r = await api.put("/integracoes", { gerar_token_webhook: true });
            limpar(tokenEl, linhaCopiar("Token do webhook", r.token_webhook));
            aviso("Novo token gerado. Cole no painel do Asaas, em Webhooks.", "info", 6500);
          }),
        ),
      ),
      h(
        "section",
        { class: "cartao", "aria-labelledby": "t-outros" },
        h("h2", { id: "t-outros" }, "Outros serviços"),
        h(
          "div",
          { class: "lista-itens" },
          h("div", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, "Consulta de CNPJ"), h("p", {}, `${i.cnpj?.url ?? "—"} · cache de ${i.cnpj?.cache_dias ?? "—"} dias`)), estado(Boolean(i.cnpj?.url))),
          h("div", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, "WhatsApp"), h("p", {}, "Avisos de proposta vista, aceita, paga e títulos vencidos.")), estado(i.whatsapp)),
          h("div", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, "E-mail"), h("p", {}, "Link da proposta ao cliente e avisos da equipe.")), estado(i.email)),
        ),
      ),
    ),
  );
}

/* ---------- Operadores ---------- */

async function telaOperadores({ eu }) {
  const f = formulario([
    { nome: "nome", rotulo: "Nome", obrigatorio: true },
    { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true },
    { nome: "senha", rotulo: "Senha inicial", tipo: "senha", obrigatorio: true, autocomplete: "new-password", ajuda: "Pelo menos 8 caracteres." },
  ]);
  const criados = h("ul", { class: "lista-simples" });
  return h(
    "div",
    { class: "pagina" },
    topo("Operadores", "Quem acessa a operação Nexor. Todo operador vê os cadastros e as integrações."),
    h(
      "div",
      { class: "grade-form" },
      h(
        "section",
        { class: "cartao", "aria-labelledby": "t-op" },
        h("h2", { id: "t-op" }, "Novo operador"),
        f.el,
        h(
          "div",
          {},
          botao("Criar acesso", async () => {
            const u = await api.post("/operadores", f.ler());
            for (const n of ["nome", "email", "senha"]) f.entrada(n).value = "";
            criados.append(h("li", {}, `${u.nome} (${u.email})`));
            aviso("Operador criado.");
          }, "btn-primario", "mais"),
        ),
        criados,
      ),
      h("section", { class: "cartao pilha", "aria-labelledby": "t-voce" }, h("h2", { id: "t-voce" }, "Você"), h("p", {}, h("strong", {}, eu.usuario.nome), h("br"), h("span", { class: "suave" }, eu.usuario.email)), trocarSenha()),
    ),
  );
}
function trocarSenha() {
  const atual = entrada({ type: "password", autocomplete: "current-password" });
  const nova = entrada({ type: "password", autocomplete: "new-password" });
  return h(
    "div",
    { class: "pilha" },
    campo("Senha atual", atual),
    campo("Nova senha", nova, "Pelo menos 8 caracteres."),
    h(
      "div",
      {},
      botao("Trocar senha", async () => {
        if (!atual.value || !nova.value) throw new Error("Preencha a senha atual e a nova.");
        await api.post("/eu/senha", { atual: atual.value, nova: nova.value });
        atual.value = nova.value = "";
        aviso("Senha trocada.");
      }),
    ),
  );
}

/* ---------- Auditoria ---------- */

async function telaAuditoria({ query }) {
  const contaId = query.get("conta") ?? "";
  const [lista, fornecedores, instaladores] = await Promise.all([api.get(`/auditoria${contaId ? `?conta_id=${encodeURIComponent(contaId)}` : ""}`), api.get("/fornecedores"), api.get("/instaladores")]);
  const nomes = new Map([...fornecedores, ...instaladores].map((c) => [c.id, c.nome_fantasia || c.razao_social]));
  const filtro = entrada({ type: "search", placeholder: "Filtrar por ação ou autor", "aria-label": "Filtrar auditoria" });
  const corpo = h("div");
  const pintar = () => {
    const q = filtro.value.trim().toLowerCase();
    const l = q ? lista.filter((x) => `${rotuloAcao(x.acao)} ${x.acao} ${x.autor} ${nomes.get(x.conta_id) ?? ""}`.toLowerCase().includes(q)) : lista;
    limpar(
      corpo,
      tabela(
        [
          { titulo: "Quando", valor: (x) => dataHora(x.criado_em) },
          { titulo: "Conta", valor: (x) => nomes.get(x.conta_id) ?? "Operação Nexor" },
          { titulo: "Ação", valor: (x) => h("span", { class: "celula-forte" }, rotuloAcao(x.acao)) },
          { titulo: "Autor", valor: (x) => x.autor ?? "—" },
          { titulo: "Detalhe", valor: (x) => h("span", { class: "pequeno" }, resumoDetalhe(x.detalhe) || "—") },
          { titulo: "IP", valor: (x) => h("span", { class: "mono" }, x.ip ?? "—") },
        ],
        l,
        { vazio: "Nenhum registro.", rotulo: "Auditoria" },
      ),
    );
  };
  filtro.addEventListener("input", pintar);
  pintar();
  return h(
    "div",
    { class: "pagina" },
    topo("Auditoria", contaId ? `Registros de ${nomes.get(contaId) ?? "uma conta"} (últimos 300)` : "Últimos 300 registros de toda a plataforma.", contaId ? h("a", { class: "btn", href: "#/auditoria" }, "Ver todas as contas") : null),
    h("section", { class: "cartao pilha" }, h("div", { class: "filtros" }, filtro), corpo),
  );
}

export { janela, numero };
