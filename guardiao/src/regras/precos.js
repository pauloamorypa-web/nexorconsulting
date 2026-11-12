/* Planos, preços e estimativas. Dinheiro sempre em centavos inteiros.
   Tabela de 11/2026 (estudo de mercado em comercial/GUARDIAO-MERCADO.md), editável pela operação Nexor em /api/gerencial/precos. */

export const RETENCOES = [7, 15, 30, 60, 90, 120];
export const ORIGEM_TABELA = "tabela de 11/2026, editável pela operação Nexor";

/** Preço por câmera por mês, em centavos: [modo][qualidade] = valores para 7 / 15 / 30 / 60 / 90 / 120 dias */
export const TABELA_INICIAL = {
  continuo: { economica: [1190, 1790, 2990, 4990, 7490, 9990], padrao: [1990, 3690, 6490, 12990, 18990, 24990], alta: [3490, 6490, 12990, 24990, 36990, 48990] },
  movimento: { economica: [790, 1090, 1790, 2990, 4490, 5990], padrao: [1190, 2190, 3890, 7790, 11490, 14990], alta: [2090, 3890, 7790, 14990, 21990, 28990] },
};

/** A qualidade é uma FAIXA DE BITRATE (o custo é o bitrate, não a resolução no papel) */
export const FAIXAS_KBPS = { economica: 512, padrao: 2000, alta: 4000 };
/** Trecho acima deste bitrate é recusado (2× o teto da Alta: "sob consulta") */
export const BITRATE_MAXIMO_KBPS = 8000;
/** Bitrate típico usado no estimador (kbps) */
export const BITRATE_TIPICO_KBPS = { economica: 384, padrao: 1200, alta: 2500 };
export const ATIVIDADE_MOVIMENTO = 0.25;

export const COMERCIAL = {
  minimo_conta_centavos: 9900,
  minimo_revenda_centavos: 29900,
  implantacao_remota_centavos: 35000,
  implantacao_local_centavos: 60000,
  mini_pc_venda_centavos: 249000,
  mini_pc_comodato_centavos_mes: 9900,
  mini_pc_comodato_meses: 24,
  laudos_inclusos_mes: 5,
  laudo_assistido_centavos: 14900,
  preservacao_horas_por_camera: 24,
};

/** Desconto por volume (venda direta), em pontos-base, pela quantidade de câmeras ativas da conta */
export const descontoVolumeBps = (cameras) => (cameras >= 1000 ? 2000 : cameras >= 200 ? 1500 : cameras >= 50 ? 1000 : cameras >= 10 ? 500 : 0);
/** Desconto da revenda sobre a tabela, pela quantidade de câmeras ativas de todos os clientes dela (não soma com o de volume) */
export const descontoRevendaBps = (cameras) => (cameras >= 1000 ? 4000 : cameras >= 200 ? 3500 : 3000);
/** Aplica desconto em pontos-base arredondando o centavo a favor do cliente */
export const comDesconto = (centavos, bps) => centavos - Math.ceil((centavos * bps) / 10_000);

/** Em que faixa cai um bitrate medido: "economica" | "padrao" | "alta" | "acima" */
export const faixaDoBitrate = (kbps) => (kbps <= FAIXAS_KBPS.economica ? "economica" : kbps <= FAIXAS_KBPS.padrao ? "padrao" : kbps <= FAIXAS_KBPS.alta ? "alta" : "acima");
const ORDEM = ["economica", "padrao", "alta", "acima"];
export const acimaDaFaixa = (kbps, contratada) => ORDEM.indexOf(faixaDoBitrate(kbps)) > ORDEM.indexOf(contratada);

/** Linhas iniciais da tabela de preços (36 combinações) */
export function linhasIniciais() {
  const linhas = [];
  for (const [modo, porQualidade] of Object.entries(TABELA_INICIAL)) for (const [qualidade, valores] of Object.entries(porQualidade)) valores.forEach((centavos_mes, i) => linhas.push({ retencao_dias: RETENCOES[i], qualidade, modo, centavos_mes }));
  return linhas;
}

/**
 * Estimador de banda, armazenamento e custo antes de contratar. `cameras`: [{ retencao_dias, qualidade, modo, quantidade? }].
 * `preco(c)` devolve os centavos por mês daquela combinação.
 */
export function estimar(cameras, preco) {
  let kbps = 0;
  let gb = 0;
  let bruto = 0;
  let total = 0;
  const itens = cameras.map((c) => {
    const n = c.quantidade ?? 1;
    const taxa = BITRATE_TIPICO_KBPS[c.qualidade];
    const atividade = c.modo === "movimento" ? ATIVIDADE_MOVIMENTO : 1;
    const gbCamera = (taxa * 1000 * 86400 * c.retencao_dias * atividade) / 8 / 1e9;
    const unit = preco(c);
    kbps += taxa * n;
    gb += gbCamera * n;
    bruto += unit * n;
    total += n;
    return { ...c, quantidade: n, banda_kbps: taxa, armazenamento_gb: Math.round(gbCamera * 10) / 10, centavos_mes: unit, subtotal_centavos: unit * n };
  });
  const bps = descontoVolumeBps(total);
  const liquido = comDesconto(bruto, bps);
  return {
    itens, cameras: total, banda_envio_kbps: kbps, banda_recomendada_kbps: Math.ceil(kbps * 1.3), armazenamento_gb: Math.round(gb * 10) / 10,
    bruto_centavos: bruto, desconto_volume_bps: bps, mensal_centavos: Math.max(liquido, total ? COMERCIAL.minimo_conta_centavos : 0), minimo_aplicado: total > 0 && liquido < COMERCIAL.minimo_conta_centavos,
    observacao: "Estimativa com bitrate típico de cada faixa; a ponte mede o bitrate real na implantação.",
  };
}
