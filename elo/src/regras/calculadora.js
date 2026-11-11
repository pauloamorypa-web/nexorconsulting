/* Calculadora de precificação do instalador.
   Entrada: custos (produtos, mão de obra, deslocamento, outros), margem líquida desejada, regime tributário, ISS,
   taxa do meio de pagamento e taxa da plataforma. Saída: preço sugerido, impostos, taxas e lucro líquido real.

   Fórmula: preço P tal que  P − impostos(P) − taxa_meio(P) − taxa_plataforma(P) − custos = margem × P
            → P = (custos + taxa_meio_fixa) / (1 − alíquota − taxa_meio% − taxa_plataforma% − margem)

   Regimes (simplificados, para orientar o preço; não substituem o contador):
   - MEI: o DAS é fixo por mês, não incide por venda (impostos por venda = 0).
   - Simples Nacional: alíquota efetiva informada (do anexo: I comércio, III/IV/V serviços). O ISS já está dentro do DAS.
   - Lucro Presumido (simplificado): serviços PIS 0,65% + COFINS 3% + IRPJ 4,8% + CSLL 2,88% + ISS;
     revenda de mercadorias PIS 0,65% + COFINS 3% + IRPJ 1,2% + CSLL 1,08% (ICMS fora do cálculo).
     A parte de serviços do preço segue a proporção de serviços nos custos. */

const PRESUMIDO = {
  servico: [["PIS", 0.65], ["COFINS", 3], ["IRPJ (presunção 32%)", 4.8], ["CSLL (presunção 32%)", 2.88]],
  mercadoria: [["PIS", 0.65], ["COFINS", 3], ["IRPJ (presunção 8%)", 1.2], ["CSLL (presunção 12%)", 1.08]],
};

const arred = (v) => Math.round(v);
const pct2 = (v) => Math.round(v * 100) / 100;

/** Componentes de imposto em % sobre o preço */
function aliquotas({ regime, iss_pct = 0, parcelaServico }) {
  if (regime.tipo === "mei") return { itens: [], avisos: ["MEI: o DAS mensal é fixo e não incide sobre cada venda."] };
  if (regime.tipo === "simples") {
    const avisos = [`Simples Nacional (anexo ${regime.anexo ?? "informado"}): alíquota efetiva de ${pct2(regime.aliquota_pct)}% com ISS incluído no DAS.`];
    if (regime.anexo === "IV") avisos.push("Anexo IV: a CPP (INSS patronal) é paga fora do DAS, sobre a folha.");
    return { itens: [["Simples Nacional (DAS)", regime.aliquota_pct]], avisos };
  }
  const s = parcelaServico;
  const itens = PRESUMIDO.servico.map(([n, a], i) => [n, a * s + PRESUMIDO.mercadoria[i][1] * (1 - s)]);
  if (iss_pct) itens.push([`ISS (${pct2(iss_pct)}% sobre serviços)`, iss_pct * s]);
  return { itens, avisos: ["Lucro Presumido simplificado: ICMS da revenda e adicional de IRPJ não entram no cálculo."] };
}

/**
 * @param {{ custos: {produtos_centavos?:number, mao_obra_centavos?:number, deslocamento_centavos?:number, outros_centavos?:number},
 *           margem_pct:number, regime:{tipo:'mei'|'simples'|'presumido', anexo?:string, aliquota_pct?:number},
 *           iss_pct?:number, taxa_meio_pct?:number, taxa_meio_fixa_centavos?:number, taxa_plataforma_pct:number, preco_centavos?:number }} e
 */
export function calcularPreco(e) {
  const c = e.custos ?? {};
  const produtos = c.produtos_centavos ?? 0;
  const servicos = (c.mao_obra_centavos ?? 0) + (c.deslocamento_centavos ?? 0);
  const outros = c.outros_centavos ?? 0;
  const custos = produtos + servicos + outros;
  const parcelaServico = custos > 0 ? (servicos + outros) / custos : 1;
  const { itens, avisos } = aliquotas({ regime: e.regime, iss_pct: e.iss_pct ?? 0, parcelaServico });
  const aliquota = itens.reduce((s, [, a]) => s + a, 0) / 100;
  const meio = (e.taxa_meio_pct ?? 0) / 100;
  const fixa = e.taxa_meio_fixa_centavos ?? 0;
  const plataforma = (e.taxa_plataforma_pct ?? 0) / 100;
  const margem = (e.margem_pct ?? 0) / 100;

  let preco;
  if (e.preco_centavos !== undefined && e.preco_centavos !== null) preco = e.preco_centavos;
  else {
    const divisor = 1 - aliquota - meio - plataforma - margem;
    if (divisor <= 0.01) return { erro: "Margem, impostos e taxas somam 99% ou mais do preço: reduza a margem." };
    preco = Math.ceil((custos + fixa) / divisor);
  }
  const detalhamento = itens.map(([nome, a]) => ({ nome, aliquota_pct: pct2(a), centavos: arred((preco * a) / 100) }));
  const impostos = detalhamento.reduce((s, i) => s + i.centavos, 0);
  const taxaMeio = arred(preco * meio) + fixa;
  const taxaPlataforma = arred(preco * plataforma);
  const lucro = preco - impostos - taxaMeio - taxaPlataforma - custos;
  if (lucro < 0) avisos.push("Atenção: com este preço a venda dá prejuízo.");
  return {
    preco_sugerido_centavos: preco,
    custos_centavos: custos,
    custos: { produtos_centavos: produtos, servicos_centavos: servicos, outros_centavos: outros },
    impostos: { total_centavos: impostos, aliquota_efetiva_pct: preco ? pct2((impostos / preco) * 100) : 0, detalhamento },
    taxa_meio_centavos: taxaMeio,
    taxa_plataforma_centavos: taxaPlataforma,
    lucro_liquido_centavos: lucro,
    margem_real_pct: preco ? pct2((lucro / preco) * 100) : 0,
    markup: custos ? Math.round((preco / custos) * 1000) / 1000 : null,
    avisos,
  };
}
