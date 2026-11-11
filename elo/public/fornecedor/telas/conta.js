/* Conta (dados, CNAEs aceitos, prazos, walletId só do dono, equipe e senha), notificações e auditoria. */

import { h, limpar, topo, tabela, botao, janela, formulario, situacao, dataHora, cnpjBR, fone, aviso, confirmar, vazio, campo, entrada, seletor, quando, icone } from "../../comum/ui.js";
import { pode, PAPEL, PAPEL_DESCRICAO } from "../permissoes.js";

export async function telaConta(ctx) {
  const { api, eu } = ctx;
  const [conta, equipe] = await Promise.all([api.get("/conta"), api.get("/equipe")]);
  const podeConfigurar = pode(eu, "configurar");
  const podeEquipe = pode(eu, "equipe");

  /* Dados da empresa */
  const f = formulario(
    [
      { nome: "nome_fantasia", rotulo: "Nome fantasia", maxlength: 120, desativado: !podeConfigurar },
      { nome: "telefone", rotulo: "Telefone", tipo: "tel", desativado: !podeConfigurar },
      { nome: "email", rotulo: "E-mail da empresa", tipo: "email", desativado: !podeConfigurar },
      { nome: "cidade", rotulo: "Cidade", maxlength: 80, desativado: !podeConfigurar },
      { nome: "uf", rotulo: "UF", maxlength: 2, desativado: !podeConfigurar },
      { titulo: "Regras da rede" },
      { nome: "prazo_reserva_dias", rotulo: "Prazo da reserva de estoque (dias)", tipo: "numero", min: 1, max: 30, desativado: !podeConfigurar, ajuda: "Quanto tempo o estoque fica separado depois que o instalador envia a proposta (1 a 30)." },
      { nome: "prazo_titulo_dias", rotulo: "Prazo dos títulos (dias)", tipo: "numero", min: 1, max: 120, desativado: !podeConfigurar, ajuda: "Vencimento dos títulos criados quando a venda não passa pelo split." },
      { nome: "cnaes", rotulo: "CNAEs aceitos dos instaladores", largura: 2, desativado: !podeConfigurar, ajuda: "Separe por vírgula. 4 dígitos aceitam o grupo inteiro (ex.: 8020 = segurança eletrônica; 4321 = instalações elétricas)." },
      { titulo: "Nota fiscal" },
      { nome: "focus_token", rotulo: conta.config?.focus_token ? "Token da Focus NFe (configurado; digite para trocar)" : "Token da Focus NFe", tipo: "senha", largura: 2, desativado: !podeConfigurar, autocomplete: "off", ajuda: "Fica cifrado. Sem token, as NF-e são simuladas (fora de produção)." },
    ],
    { ...conta, prazo_reserva_dias: conta.config?.prazo_reserva_dias, prazo_titulo_dias: conta.config?.prazo_titulo_dias, cnaes: (conta.cnaes ?? []).join(", "), telefone: fone(conta.telefone) },
  );
  const salvarDados = podeConfigurar
    ? botao("Salvar dados", async () => {
        const d = f.ler();
        const corpo = {};
        for (const k of ["nome_fantasia", "email", "cidade"]) if (d[k]) corpo[k] = d[k];
        if (d.telefone) corpo.telefone = d.telefone;
        if (d.uf) corpo.uf = d.uf.toUpperCase();
        if (d.prazo_reserva_dias) corpo.prazo_reserva_dias = d.prazo_reserva_dias;
        if (d.prazo_titulo_dias) corpo.prazo_titulo_dias = d.prazo_titulo_dias;
        if (d.cnaes) corpo.cnaes = d.cnaes.split(/[,;\s]+/).map((c) => c.replace(/\D/g, "")).filter(Boolean);
        if (d.focus_token) corpo.focus_token = d.focus_token;
        await api.put("/conta", corpo);
        f.entrada("focus_token").value = "";
        aviso("Dados da conta salvos.");
        await ctx.atualizarEu();
      }, "btn-primario")
    : null;

  /* walletId (só o dono) */
  let cartaoWallet = null;
  if (pode(eu, "wallet")) {
    const atual = h("strong", { class: "mono" }, conta.config?.wallet ?? "não configurado");
    const novo = entrada({ autocomplete: "off", placeholder: "walletId da sua conta Asaas", spellcheck: "false" });
    cartaoWallet = h(
      "section",
      { class: "cartao pilha", "aria-labelledby": "t-wallet" },
      h("h2", { id: "t-wallet" }, icone("carteira"), "Conta do split (walletId)"),
      h("p", { class: "pequeno suave" }, "Para onde vai a parte dos produtos quando o cliente final paga. Só o dono vê e troca. Fica cifrado e registrado na auditoria. Sem walletId, a sua parte vira título a receber do instalador."),
      h("p", {}, "Atual: ", atual),
      campo("Novo walletId", novo),
      h(
        "div",
        { class: "acoes-topo" },
        botao("Salvar walletId", async () => {
          if (!novo.value.trim()) throw new Error("Digite o walletId.");
          const c = await api.put("/conta/wallet", { wallet_id: novo.value.trim() });
          atual.textContent = c.config?.wallet ?? "não configurado";
          novo.value = "";
          aviso("WalletId salvo. Os próximos pagamentos já usam a nova conta.");
        }, "btn-primario"),
        conta.config?.wallet
          ? botao("Remover", async () => {
              if (!(await confirmar("Remover o walletId? As próximas vendas não terão split para você: a sua parte vira título a receber do instalador.", { botao: "Remover", perigo: true }))) return;
              const c = await api.put("/conta/wallet", { wallet_id: null });
              atual.textContent = c.config?.wallet ?? "não configurado";
              aviso("WalletId removido.");
            }, "btn-perigo-fantasma")
          : null,
      ),
    );
  }

  /* Equipe */
  const equipeEl = h("div");
  const pintarEquipe = (lista) =>
    limpar(
      equipeEl,
      tabela(
        [
          { titulo: "Nome", valor: (u) => h("div", {}, h("span", { class: "celula-forte" }, u.nome), h("span", { class: "celula-sub" }, u.email)) },
          { titulo: "Perfil", valor: (u) => PAPEL[u.papel] ?? u.papel },
          { titulo: "Situação", valor: (u) => (u.ativo ? situacao("ativo") : h("span", { class: "chip" }, "Desativado")) },
          podeEquipe && { titulo: "", classe: "acoes-celula", valor: (u) => (u.papel === "dono" ? h("span", { class: "suave pequeno" }, "dono da conta") : botao("Editar", () => editarUsuario(u), "btn-pequeno", "editar", { "aria-label": `Editar ${u.nome}` })) },
        ].filter(Boolean),
        lista,
        { rotulo: "Equipe" },
      ),
    );
  const papeis = Object.entries(PAPEL_DESCRICAO).map(([p, d]) => [p, `${PAPEL[p]} · ${d}`]);
  const recarregarEquipe = async () => pintarEquipe(await api.get("/equipe"));
  function novoUsuario() {
    const fu = formulario([
      { nome: "nome", rotulo: "Nome", obrigatorio: true },
      { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true },
      { nome: "papel", rotulo: "Perfil", tipo: "select", opcoes: papeis, padrao: "comercial", largura: 2 },
      { nome: "telefone", rotulo: "Celular", tipo: "tel" },
      { nome: "senha", rotulo: "Senha inicial", tipo: "senha", obrigatorio: true, autocomplete: "new-password", ajuda: "Pelo menos 8 caracteres. A pessoa troca depois." },
    ]);
    janela({
      titulo: "Novo acesso",
      largura: 620,
      conteudo: fu.el,
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, fechar) => fechar() },
        { texto: "Criar acesso", classe: "btn-primario", fn: async (_, fechar) => (await api.post("/equipe", fu.ler()), fechar(), aviso("Acesso criado."), recarregarEquipe()) },
      ],
    });
  }
  function editarUsuario(u) {
    const fu = formulario(
      [
        { nome: "nome", rotulo: "Nome", obrigatorio: true },
        { nome: "telefone", rotulo: "Celular", tipo: "tel" },
        { nome: "papel", rotulo: "Perfil", tipo: "select", opcoes: papeis, largura: 2 },
        { nome: "ativo", rotulo: "Acesso ativo", tipo: "check", largura: 2, ajuda: "Mudar o perfil ou desativar encerra a sessão da pessoa." },
      ],
      { ...u, telefone: fone(u.telefone) },
    );
    janela({
      titulo: `Editar ${u.nome}`,
      largura: 600,
      conteudo: fu.el,
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, fechar) => fechar() },
        {
          texto: "Salvar",
          classe: "btn-primario",
          fn: async (_, fechar) => {
            const d = fu.ler();
            if (!d.telefone) delete d.telefone;
            await api.put(`/equipe/${u.id}`, d);
            fechar();
            aviso("Acesso atualizado.");
            recarregarEquipe();
          },
        },
      ],
    });
  }
  pintarEquipe(equipe);

  /* Minha senha */
  const atualS = entrada({ type: "password", autocomplete: "current-password" });
  const novaS = entrada({ type: "password", autocomplete: "new-password" });

  return h(
    "div",
    { class: "pagina" },
    topo("Conta e equipe", `${conta.razao_social} · CNPJ ${cnpjBR(conta.cnpj)}`, situacao(conta.status)),
    h(
      "div",
      { class: "grade-form" },
      h("section", { class: "cartao", "aria-labelledby": "t-dados" }, h("h2", { id: "t-dados" }, "Dados e regras"), podeConfigurar ? null : h("p", { class: "pequeno suave" }, "Só o dono e o administrador alteram estes dados."), f.el, salvarDados ? h("div", { class: "acoes-topo" }, salvarDados) : null),
      h(
        "div",
        { class: "pilha" },
        cartaoWallet,
        h("section", { class: "cartao pilha", "aria-labelledby": "t-equipe" }, h("div", { class: "cartao-topo" }, h("h2", { id: "t-equipe" }, "Equipe"), podeEquipe ? botao("Novo acesso", novoUsuario, "btn-pequeno btn-primario", "mais") : null), equipeEl),
        h(
          "section",
          { class: "cartao pilha", "aria-labelledby": "t-senha" },
          h("h2", { id: "t-senha" }, "Minha senha"),
          campo("Senha atual", atualS),
          campo("Nova senha", novaS, "Pelo menos 8 caracteres. As suas outras sessões são encerradas."),
          h(
            "div",
            {},
            botao("Trocar senha", async () => {
              if (!atualS.value || !novaS.value) throw new Error("Preencha a senha atual e a nova.");
              await api.post("/eu/senha", { atual: atualS.value, nova: novaS.value });
              atualS.value = novaS.value = "";
              aviso("Senha trocada.");
            }),
          ),
        ),
      ),
    ),
  );
}

/* ---------- Notificações ---------- */

const destino = (n) => {
  if (n.tipo.startsWith("proposta_") && n.ref) return `#/propostas/${n.ref}`;
  if (n.tipo.startsWith("reserva_")) return "#/propostas?aba=reservas";
  if (n.tipo.startsWith("vinculo_")) return "#/instaladores";
  if (n.tipo.startsWith("titulo_")) return "#/financeiro?aba=titulos";
  return null;
};
const ICONE_NOTIF = { proposta: "nota", reserva: "caixa", vinculo: "pessoas", titulo: "relogio", conta: "check" };

export async function telaNotificacoes(ctx) {
  const { api } = ctx;
  let lista = await api.get("/notificacoes");
  const corpo = h("div", { class: "lista-itens" });
  const pintar = () =>
    limpar(
      corpo,
      lista.length
        ? lista.map((n) => {
            const href = destino(n);
            const texto = h("div", { class: "item-texto" }, h("p", { style: { color: "var(--texto)", fontWeight: n.lida ? "400" : "600" } }, n.texto), h("small", { class: "suave" }, quando(n.criado_em), n.lida ? "" : " · não lida"));
            return h(
              "div",
              { class: `item-linha ${n.lida ? "inativo" : ""}` },
              h("span", { class: "indicador-ic", style: { margin: "0" } }, icone(ICONE_NOTIF[n.tipo.split("_")[0]] ?? "sino", 16)),
              texto,
              h(
                "div",
                { class: "item-acoes" },
                href ? h("a", { class: "btn btn-pequeno", href, onclick: () => !n.lida && api.post("/notificacoes/lidas", { ids: [n.id] }).catch(() => null) }, "Abrir") : null,
                !n.lida ? botao("Marcar lida", async () => (await api.post("/notificacoes/lidas", { ids: [n.id] }), (n.lida = true), pintar(), ctx.atualizarEu()), "btn-pequeno btn-fantasma", null, { "aria-label": "Marcar como lida" }) : null,
              ),
            );
          })
        : vazio("sino", "Nenhuma notificação", "Avisos de proposta vista, aceita, paga, reserva vencendo e título vencido aparecem aqui."),
    );
  pintar();
  const naoLidas = lista.filter((n) => !n.lida).length;
  return h(
    "div",
    { class: "pagina" },
    topo(
      "Notificações",
      naoLidas ? `${naoLidas} não lida(s)` : "Tudo lido",
      naoLidas
        ? botao("Marcar todas como lidas", async () => {
            await api.post("/notificacoes/lidas", {});
            lista = lista.map((n) => ({ ...n, lida: true }));
            pintar();
            await ctx.atualizarEu();
            aviso("Notificações marcadas como lidas.");
          })
        : null,
    ),
    h("section", { class: "cartao" }, corpo),
  );
}

/* ---------- Auditoria ---------- */

const ACOES = {
  conta_criada: "Conta criada", conta_alterada: "Dados da conta alterados", wallet_alterado: "WalletId alterado", acesso_criado: "Acesso criado", acesso_alterado: "Acesso alterado",
  vinculo_aprovado: "Vínculo aprovado", vinculo_recusado: "Vínculo recusado", vinculo_tabela: "Tabela do vínculo trocada", limite_credito: "Limite de crédito alterado", vinculo_bloqueado: "Instalador bloqueado", vinculo_desbloqueado: "Instalador desbloqueado",
  titulo_criado: "Título lançado", titulo_baixado: "Baixa de título", titulo_cancelado: "Título cancelado", nfe_emitida: "NF-e emitida", nexor_aprovar: "Aprovado pela Nexor", nexor_recusar: "Recusado pela Nexor", nexor_suspender: "Suspenso pela Nexor", nexor_reativar: "Reativado pela Nexor",
  senha_trocada: "Senha trocada", entrou: "Entrou",
};
export const rotuloAcao = (a) => ACOES[a] ?? String(a ?? "").replaceAll("_", " ");
export function resumoDetalhe(d) {
  if (!d || typeof d !== "object") return "";
  return Object.entries(d)
    .filter(([k, v]) => v !== null && v !== undefined && !/(^|_)id$/.test(k))
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${/centavos$/.test(k) && typeof v === "number" ? (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(" · ");
}

export async function telaAuditoria({ api }) {
  const lista = await api.get("/auditoria");
  const filtro = entrada({ type: "search", placeholder: "Filtrar por ação ou autor", "aria-label": "Filtrar auditoria" });
  const corpo = h("div");
  const pintar = () => {
    const q = filtro.value.trim().toLowerCase();
    const l = q ? lista.filter((x) => `${rotuloAcao(x.acao)} ${x.autor} ${x.acao}`.toLowerCase().includes(q)) : lista;
    limpar(
      corpo,
      tabela(
        [
          { titulo: "Quando", valor: (x) => dataHora(x.criado_em) },
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
  return h("div", { class: "pagina" }, topo("Auditoria", "Quem fez o quê na conta: acessos, walletId, crédito, bloqueios, títulos e notas."), h("section", { class: "cartao pilha" }, h("div", { class: "filtros" }, filtro), corpo));
}

export { seletor };
