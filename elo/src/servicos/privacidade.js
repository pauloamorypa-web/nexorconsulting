/* Privacidade por desenho (LGPD): o que o FORNECEDOR pode ver de uma proposta.
   Regra única: o fornecedor vê o instalador, os itens DELE (quantidade e o preço que ele cobra), a cidade/UF da obra,
   o status e as datas. Nunca vê o cliente final (nome, documento, telefone, e-mail, endereço), nem os itens de outros
   fornecedores, nem o preço de venda do instalador ao cliente (segredo comercial do instalador).

   Toda rota do fornecedor que fala de proposta, reserva, pagamento ou repasse passa por estas funções.
   Elas montam o objeto campo a campo (lista branca): nada de "...proposta". */

export const instaladorParaFornecedor = (c) =>
  c ? { id: c.id, cnpj: c.cnpj, razao_social: c.razao_social, nome_fantasia: c.nome_fantasia, cidade: c.cidade, uf: c.uf } : null;

/** Item da proposta como o fornecedor vê (sem preço de venda ao cliente) */
const itemParaFornecedor = (i) => ({
  id: i.id,
  produto_id: i.produto_id,
  codigo: i.codigo,
  descricao: i.descricao,
  unidade: i.unidade,
  quantidade: i.quantidade,
  preco_unit_centavos: i.custo_unit_centavos,
  total_centavos: i.custo_unit_centavos * i.quantidade,
});

/**
 * @param {object} p proposta (linha do banco)
 * @param {object[]} itens todos os itens da proposta (filtra os do fornecedor aqui)
 * @param {object} instalador conta do instalador
 * @param {string} fornecedorId quem está olhando
 * @param {{ reservas?: object[], pagamento?: object|null }} extra
 */
export function propostaParaFornecedor(p, itens, instalador, fornecedorId, extra = {}) {
  const meus = itens.filter((i) => i.tipo === "fornecedor" && i.fornecedor_id === fornecedorId).map(itemParaFornecedor);
  const reservas = (extra.reservas ?? []).filter((r) => r.fornecedor_id === fornecedorId);
  return {
    id: p.id,
    numero: p.numero,
    status: p.status,
    instalador: instaladorParaFornecedor(instalador),
    obra: { cidade: p.obra_cidade ?? null, uf: p.obra_uf ?? null },
    itens: meus,
    total_itens_centavos: meus.reduce((s, i) => s + i.total_centavos, 0),
    reserva: {
      expira_em: p.reserva_expira_em ?? null,
      renovacoes: p.renovacoes ?? 0,
      status: reservas.length ? (reservas.some((r) => r.status === "ativa") ? "ativa" : reservas[0].status) : null,
    },
    enviada_em: p.enviada_em ?? null,
    vista_em: p.vista_em ?? null,
    aceita_em: p.aceita_em ?? null,
    paga_em: p.paga_em ?? null,
    expirada_em: p.expirada_em ?? null,
    pagamento: extra.pagamento ? { status: extra.pagamento.status, forma: extra.pagamento.forma, pago_em: extra.pagamento.pago_em ?? null } : null,
  };
}

/** Reserva (linha) como o fornecedor vê */
export const reservaParaFornecedor = (r, produto, proposta, instalador) => ({
  id: r.id,
  status: r.status,
  quantidade: r.quantidade,
  expira_em: r.expira_em,
  criado_em: r.criado_em,
  produto: produto ? { id: produto.id, codigo: produto.codigo, nome: produto.nome } : null,
  proposta: proposta ? { id: proposta.id, numero: proposta.numero, status: proposta.status, obra: { cidade: proposta.obra_cidade ?? null, uf: proposta.obra_uf ?? null } } : null,
  instalador: instaladorParaFornecedor(instalador),
});

/** Repasse como o fornecedor vê (só os dele) */
export const repasseParaFornecedor = (r, proposta, instalador) => ({
  id: r.id,
  valor_centavos: r.valor_centavos,
  via: r.via,
  status: r.status,
  criado_em: r.criado_em,
  atualizado_em: r.atualizado_em,
  proposta: proposta ? { id: proposta.id, numero: proposta.numero, status: proposta.status, obra: { cidade: proposta.obra_cidade ?? null, uf: proposta.obra_uf ?? null } } : null,
  instalador: instaladorParaFornecedor(instalador),
});
