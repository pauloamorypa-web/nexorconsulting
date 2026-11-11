/* Permissões por papel, numa tabela só. As rotas usam { conta, pode: "acao" } e o servidor confere aqui.

   Fornecedor:
   - dono: tudo, inclusive o walletId (para onde vai o dinheiro do split);
   - admin: tudo menos o walletId;
   - comercial: catálogo, tabelas de preço, aprovar/recusar vínculos, propostas e reservas;
   - financeiro: crédito, bloqueio, títulos, pagamentos, repasses e notas fiscais.
   Instalador:
   - dono: tudo;
   - tecnico: só as ordens de serviço atribuídas a ele.
   Nexor: operador (aprova fornecedores, métricas agregadas, integrações da plataforma). */

export const PAPEIS = {
  fornecedor: ["dono", "admin", "comercial", "financeiro"],
  instalador: ["dono", "tecnico"],
  nexor: ["operador"],
};

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
const I = {
  configurar: ["dono"],
  equipe: ["dono"],
  comercial: ["dono"],
  os: ["dono", "tecnico"],
  ver: ["dono", "tecnico"],
  auditoria: ["dono"],
};
const N = { operar: ["operador"] };

export const PERMISSOES = { fornecedor: F, instalador: I, nexor: N };

/** Papéis da conta que podem a ação (para as opções das rotas) */
export const papeisCom = (tipo, acao) => PERMISSOES[tipo]?.[acao] ?? [];
export const pode = (u, acao) => Boolean(u && papeisCom(u.tipo, acao).includes(u.papel));
