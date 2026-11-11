/* Nexor Elo · painel do FORNECEDOR. Rotas com hash; cada papel (dono, admin, comercial, financeiro) só vê o que pode.
   PRIVACIDADE: nenhuma tela daqui mostra o cliente final. A API já não devolve esses dados; as telas usam só
   instalador, itens, cidade/UF da obra e status. */

import { h } from "../comum/ui.js";
import { criarApi } from "../comum/api.js";
import { iniciarPainel } from "../comum/casca.js";
import { pode, PAPEL } from "./permissoes.js";
import { telaPainel } from "./telas/painel.js";
import { telaProdutos, telaTabelas } from "./telas/catalogo.js";
import { telaInstaladores } from "./telas/instaladores.js";
import { telaPropostas } from "./telas/propostas.js";
import { telaFinanceiro, telaNotas } from "./telas/financeiro.js";
import { telaConta, telaNotificacoes, telaAuditoria } from "./telas/conta.js";

const api = criarApi("fornecedor");

iniciarPainel({
  area: "fornecedor",
  nome: "Fornecedor",
  subtitulo: "Painel do fornecedor",
  api,
  perfil: (eu) => PAPEL[eu.usuario.papel] ?? eu.usuario.papel,
  login: {
    titulo: "Painel do fornecedor",
    texto: "Entre com o e-mail e a senha da sua equipe.",
    chamada: "Seu estoque nas propostas dos instaladores, com o pagamento já dividido.",
    destaques: [
      ["caixa", "Estoque reservado", "Cada proposta enviada separa os itens por um prazo que você define."],
      ["dinheiro", "Split no pagamento", "A parte dos produtos cai na sua conta Asaas quando o cliente paga."],
      ["escudo", "Crédito e bloqueio", "Limite por instalador e bloqueio automático por título vencido."],
    ],
    extra: h("p", { class: "pequeno suave centro" }, "Ainda não tem conta? ", h("a", { href: "/#cadastro" }, "Cadastre sua empresa")),
  },
  faixa: (eu) =>
    eu.conta.status === "pendente"
      ? h("div", { class: "faixa faixa-aviso", role: "status" }, h("strong", {}, "Cadastro em análise."), " A equipe Nexor está conferindo os dados. Você já pode montar o catálogo e as tabelas; os instaladores só veem a empresa depois da aprovação.")
      : null,
  menu: (eu) =>
    [
      { id: "painel", rotulo: "Painel", icone: "inicio" },
      { id: "propostas", rotulo: "Propostas e reservas", icone: "nota" },
      { id: "produtos", rotulo: "Produtos", icone: "caixa", grupo: "Catálogo" },
      { id: "tabelas", rotulo: "Tabelas de preço", icone: "etiqueta", grupo: "Catálogo" },
      { id: "instaladores", rotulo: "Instaladores", icone: "pessoas", grupo: "Rede" },
      pode(eu, "financeiro") && { id: "financeiro", rotulo: "Financeiro", icone: "dinheiro", grupo: "Financeiro" },
      pode(eu, "financeiro") && { id: "notas", rotulo: "Notas fiscais", icone: "recibo", grupo: "Financeiro" },
      { id: "notificacoes", rotulo: "Notificações", icone: "sino", grupo: "Conta", selo: (e) => e.nao_lidas },
      { id: "conta", rotulo: "Conta e equipe", icone: "config", grupo: "Conta" },
      pode(eu, "auditoria") && { id: "auditoria", rotulo: "Auditoria", icone: "escudo", grupo: "Conta" },
    ].filter(Boolean),
  telas: {
    painel: telaPainel,
    propostas: telaPropostas,
    produtos: telaProdutos,
    tabelas: telaTabelas,
    instaladores: telaInstaladores,
    financeiro: telaFinanceiro,
    notas: telaNotas,
    notificacoes: telaNotificacoes,
    conta: telaConta,
    auditoria: telaAuditoria,
  },
});
