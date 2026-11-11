/* Espelho da tabela de permissões do servidor (src/http/permissoes.js), só para esconder o que o papel não pode.
   Quem decide de verdade é o servidor: se algo escapar daqui, a API responde 403. */

const F = {
  configurar: ["dono", "admin"],
  wallet: ["dono"],
  equipe: ["dono", "admin"],
  catalogo: ["dono", "admin", "comercial"],
  vinculos: ["dono", "admin", "comercial"],
  credito: ["dono", "admin", "financeiro"],
  financeiro: ["dono", "admin", "financeiro"],
  ver: ["dono", "admin", "comercial", "financeiro"],
  auditoria: ["dono", "admin"],
};

export const pode = (eu, acao) => Boolean(eu?.usuario && F[acao]?.includes(eu.usuario.papel));
export const PAPEL = { dono: "Dono", admin: "Administrador", comercial: "Comercial", financeiro: "Financeiro" };
export const PAPEL_DESCRICAO = {
  admin: "Tudo, menos o walletId do split",
  comercial: "Catálogo, tabelas, aprovar instaladores, propostas e reservas",
  financeiro: "Crédito, bloqueio, títulos, repasses e notas fiscais",
};
