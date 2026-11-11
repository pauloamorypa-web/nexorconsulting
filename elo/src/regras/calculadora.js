/* Calculadora de precificação do instalador.
   Entrada: custos (produtos, mão de obra, deslocamento, outros), margem líquida desejada, regime tributário, ISS,
   taxa do meio de pagamento e taxa da plataforma. Saída: preço sugerido, impostos, taxas e lucro líquido real.

   Fórmula: preço P tal que  P − impostos(P) − taxa_meio(P) − taxa_plataforma(P) − custos = margem × P
            → P = (custos + taxa_meio_fixa) / (1 − alíquota − taxa_meio% − taxa_plataforma% − margem)

   Regimes (simplificados, para orientar o preço; não substituem o contador):
   - MEI: o DAS é fixo por mês, não incide por venda (impostos por venda = 0).
   - Simples Nacional: alíquota efetiva calculada pela faixa do anexo a partir da receita bruta dos últimos 12 meses (RBT12),
     (RBT12 × alíquota nominal − parcela a deduzir) / RBT12 (LC 123/2006, anexos da LC 155/2016); ou informada à mão.
     O ISS já está dentro do DAS.
   - Lucro Presumido (simplificado): serviços PIS 0,65% + COFINS 3% + IRPJ 4,8% + CSLL 2,88% + ISS;
     revenda de mercadorias PIS 0,65% + COFINS 3% + IRPJ 1,2% + CSLL 1,08% (ICMS fora do cálculo).
     A parte de serviços do preço segue a proporção de serviços nos custos. */

const PRESUMIDO = {
  servico: [["PIS", 0.65], ["COFINS", 3], ["IRPJ (presunção 32%)", 4.8], ["CSLL (presunção 32%)", 2.88]],
  mercadoria: [["PIS", 0.65], ["COFINS", 3], ["IRPJ (presunção 8%)", 1.2], ["CSLL (presunção 12%)", 1.08]],
};

/** Faixas do Simples Nacional por anexo: [teto da RBT12 em reais, alíquota nominal %, parcela a deduzir em reais] */
export const FAIXAS_SIMPLES = {
  I: [[180_000, 4, 0], [360_000, 7.3, 5_940], [720_000, 9.5, 13_860], [1_800_000, 10.7, 22_500], [3_600_000, 14.3, 87_300], [4_800_000, 19, 378_000]],
  II: [[180_000, 4.5, 0], [360_000, 7.8, 5_940], [720_000, 10, 13_860], [1_800_000, 11.2, 22_500], [3_600_000, 14.7, 85_500], [4_800_000, 30, 720_000]],
  III: [[180_000, 6, 0], [360_000, 11.2, 9_360], [720_000, 13.5, 17_640], [1_800_000, 16, 35_640], [3_600_000, 21, 125_640], [4_800_000, 33, 648_000]],
  IV: [[180_000, 4.5, 0], [360_000, 9, 8_100], [720_000, 10.2, 12_420], [1_800_000, 14, 39_780], [3_600_000, 22, 183_780], [4_800_000, 33, 828_000]],
  V: [[180_000, 15.5, 0], [360_000, 18, 4_500], [720_000, 19.5, 9_900], [1_800_000, 20.5, 17_100], [3_600_000, 23, 62_100], [4_800_000, 30.5, 540_000]],
};

/**
 * Banca P-14: alíquota efetiva do Simples pela faixa do anexo. RBT12 em centavos.
 * Devolve { aliquota_pct, faixa, nominal_pct, deducao_centavos } ou { erro }.
 */
export function aliquotaEfetivaSimples(anexo, rbt12_centavos) {
  const faixas = FAIXAS_SIMPLES[anexo];
  if (!faixas) return { erro: "Escolha o anexo do Simples (I a V)." };
  const rbt12 = rbt12_centavos / 100;
  if (!(rbt12 > 0)) return { erro: "Informe a receita bruta dos últimos 12 meses (RBT12) maior que zero, ou a alíquota à mão." };
  const n = faixas.findIndex(([teto]) => rbt12 <= teto);
  if (n < 0) return { erro: "Receita dos últimos 12 meses acima de R$ 4.800.000,00: fora do Simples Nacional. Fale com o seu contador." };
  const [, nominal, deducao] = faixas[n];
  return { aliquota_pct: Math.round(((rbt12 * nominal) / 100 - deducao) / rbt12 * 1e6) / 1e4, faixa: n + 1, nominal_pct: nominal, deducao_centavos: deducao * 100 };
}

const arred = (v) => Math.round(v);
const pct2 = (v) => Math.round(v * 100) / 100;
const pctBr = (v) => String(pct2(v)).replace(".", ",");

/** Componentes de imposto em % sobre o preço */
function aliquotas({ regime, iss_pct = 0, parcelaServico }) {
  if (regime.tipo === "mei") return { itens: [], avisos: ["MEI: o DAS mensal é fixo e não incide sobre cada venda."] };
  if (regime.tipo === "simples") {
    const avisos = [`Simples Nacional (anexo ${regime.anexo ?? "informado"}${regime.faixa ? `, faixa ${regime.faixa}: nominal ${pctBr(regime.nominal_pct)}% pela receita dos últimos 12 meses` : ", alíquota informada"}): alíquota efetiva de ${pctBr(regime.aliquota_pct)}% com ISS incluído no DAS.`];
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
  // Simples com RBT12: a alíquota efetiva sai da faixa do anexo (a alíquota à mão continua valendo quando não há RBT12)
  if (e.regime?.tipo === "simples" && e.regime.rbt12_centavos !== undefined && e.regime.rbt12_centavos !== null) {
    const ef = aliquotaEfetivaSimples(e.regime.anexo, e.regime.rbt12_centavos);
    if (ef.erro) return { erro: ef.erro };
    e = { ...e, regime: { ...e.regime, aliquota_pct: ef.aliquota_pct, faixa: ef.faixa, nominal_pct: ef.nominal_pct } };
  } else if (e.regime?.tipo === "simples" && !(e.regime.aliquota_pct >= 0)) return { erro: "Informe a alíquota do Simples ou a receita dos últimos 12 meses (RBT12)." };
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
    impostos: { total_centavos: impostos, aliquota_efetiva_pct: preco ? pct2((impostos / preco) * 100) : 0, detalhamento, ...(e.regime?.faixa ? { simples: { anexo: e.regime.anexo, faixa: e.regime.faixa, nominal_pct: e.regime.nominal_pct, aliquota_pct: e.regime.aliquota_pct } } : {}) },
    taxa_meio_centavos: taxaMeio,
    taxa_plataforma_centavos: taxaPlataforma,
    lucro_liquido_centavos: lucro,
    margem_real_pct: preco ? pct2((lucro / preco) * 100) : 0,
    markup: custos ? Math.round((preco / custos) * 1000) / 1000 : null,
    avisos,
  };
}
