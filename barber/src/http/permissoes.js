/* Permissões por papel do painel, numa tabela só (V-45). As rotas e o servidor consultam esta tabela
   em vez de espalhar "if (papel === ...)" pelo código.

   - administrar: configurações, relatórios, acessos, serviços, planos e canais;
   - equipe: clientes (cadastro), caixa, produtos, clube e lista de espera;
   - so_o_proprio: só a própria agenda, folgas, vendas, comissões e clientes (exige barbeiro vinculado);
   - ver_faturamento: totais em dinheiro da agenda e gasto do cliente;
   - campos_barbeiro: o que pode mudar no cadastro do barbeiro (null = tudo);
   - desconto_teto: chave da configuração (regras) com o teto de desconto em %, ou null (sem teto). */

export const PERMISSOES = {
  dono: { administrar: true, equipe: true, so_o_proprio: false, ver_faturamento: true, campos_barbeiro: null, desconto_teto: null },
  admin: { administrar: true, equipe: true, so_o_proprio: false, ver_faturamento: true, campos_barbeiro: null, desconto_teto: null },
  recepcao: { administrar: false, equipe: true, so_o_proprio: false, ver_faturamento: true, campos_barbeiro: null, desconto_teto: "desconto_teto_recepcao" },
  barbeiro: { administrar: false, equipe: false, so_o_proprio: true, ver_faturamento: false, campos_barbeiro: ["bio", "cor", "horario", "servicos"], desconto_teto: "desconto_teto_barbeiro" },
};

const SEM_PERMISSAO = { administrar: false, equipe: false, so_o_proprio: true, ver_faturamento: false, campos_barbeiro: [], desconto_teto: null };
export const permissoes = (u) => PERMISSOES[u?.papel] ?? SEM_PERMISSAO;

/** O usuário pode? (ex.: pode(u, "administrar")) */
export const pode = (u, acao) => Boolean(permissoes(u)[acao]);

/** Papéis que têm a permissão (para as opções { papeis } das rotas) */
export const papeisCom = (acao) => Object.keys(PERMISSOES).filter((p) => PERMISSOES[p][acao]);

/** Barbeiro ao qual o usuário está restrito (só o próprio), ou null quando vê todos */
export const proprio = (u) => (permissoes(u).so_o_proprio ? (u.barbeiro_id ?? null) : null);

/** Perfil restrito ao próprio barbeiro, mas sem barbeiro vinculado: não pode ver nada além de quem é */
export const semVinculo = (u) => permissoes(u).so_o_proprio && !u.barbeiro_id;

/** Mesmo barbeiro (ou perfil que vê todos)? */
export const alcanca = (u, barbeiroId) => !permissoes(u).so_o_proprio || barbeiroId === u.barbeiro_id;

/** Teto de desconto em %, lido da configuração; null = sem teto */
export function tetoDesconto(u, regras = {}, padrao = {}) {
  const chave = permissoes(u).desconto_teto;
  return chave ? (regras[chave] ?? padrao[chave] ?? null) : null;
}

/** Só os campos do barbeiro que o perfil pode mudar */
export function camposBarbeiro(u, d) {
  const c = permissoes(u).campos_barbeiro;
  return c ? Object.fromEntries(c.map((k) => [k, d[k]])) : d;
}
