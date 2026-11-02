/* Tabelas legais da folha. Os valores mudam todo ano: a empresa pode editar em Configurações → Tabelas.
   Padrões abaixo: INSS e salário-família de 2025 (Portaria Interministerial MPS/MF nº 6/2025), IRRF a partir de
   maio/2025 (MP 1.294/2025) e a redução do IR para rendas até R$ 5.000 a partir de 2026 (Lei 15.270/2025).
   Confira os valores vigentes antes de fechar a folha. */

export const TABELAS_PADRAO = {
  vigencia: "2025",
  salario_minimo: 151800,
  inss: [
    { ate: 151800, aliquota: 0.075 },
    { ate: 279388, aliquota: 0.09 },
    { ate: 419083, aliquota: 0.12 },
    { ate: 815741, aliquota: 0.14 },
  ],
  irrf: [
    { ate: 242880, aliquota: 0, deducao: 0 },
    { ate: 282665, aliquota: 0.075, deducao: 18216 },
    { ate: 375105, aliquota: 0.15, deducao: 39416 },
    { ate: 466468, aliquota: 0.225, deducao: 67549 },
    { ate: null, aliquota: 0.275, deducao: 90873 },
  ],
  irrf_dependente: 18959,
  irrf_desconto_simplificado: 60720,
  // Lei 15.270/2025: redução mensal do imposto para rendimentos tributáveis até R$ 7.350 (a partir de jan/2026)
  irrf_reducao: { desde: "2026-01", isento_ate: 500000, reducao_maxima: 31289, limite: 735000, constante: 97862, fator: 0.133145 },
  salario_familia: { ate_remuneracao: 190604, valor: 6500, idade_limite: 14 },
  fgts: 0.08,
  fgts_aprendiz: 0.02,
  vt_percentual: 0.06,
  adicional_noturno: 0.2,
  periculosidade: 0.3,
};

/** Mescla as tabelas da empresa com os padrões */
export const tabelasDaEmpresa = (empresa) => ({ ...TABELAS_PADRAO, ...(empresa?.config?.tabelas ?? {}) });

const arred = (v) => Math.round(v);

/** INSS progressivo (em centavos) */
export function calcularInss(base, tabelas) {
  let restante = base;
  let anterior = 0;
  let total = 0;
  for (const f of tabelas.inss) {
    if (restante <= 0) break;
    const faixa = Math.min(base, f.ate) - anterior;
    if (faixa > 0) total += faixa * f.aliquota;
    anterior = f.ate;
    if (base <= f.ate) break;
  }
  return arred(total);
}

/** IRRF mensal (em centavos), escolhendo o mais vantajoso entre deduções legais e desconto simplificado */
export function calcularIrrf({ rendimentos, inss, dependentes = 0, pensao = 0, competencia }, tabelas) {
  const deducoesLegais = inss + dependentes * tabelas.irrf_dependente + pensao;
  const deducao = Math.max(deducoesLegais, tabelas.irrf_desconto_simplificado);
  const base = Math.max(0, rendimentos - deducao);
  const faixa = tabelas.irrf.find((f) => f.ate === null || base <= f.ate);
  let imposto = Math.max(0, base * faixa.aliquota - faixa.deducao);
  const r = tabelas.irrf_reducao;
  if (r && competencia && competencia >= r.desde) {
    let reducao = 0;
    if (rendimentos <= r.isento_ate) reducao = r.reducao_maxima;
    else if (rendimentos <= r.limite) reducao = Math.max(0, r.constante - r.fator * rendimentos);
    imposto = Math.max(0, imposto - reducao);
  }
  imposto = arred(imposto);
  // A Receita dispensa a retenção abaixo de R$ 10,00
  return { base: arred(base), imposto: imposto < 1000 ? 0 : imposto, deducao: arred(deducao), simplificado: deducao > deducoesLegais };
}
