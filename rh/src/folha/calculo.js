/* Cálculos da folha (valores em centavos): mensal, 13º salário, férias e rescisão.
   Cada rubrica traz o código interno e a natureza do eSocial (natRubr) usada no evento S-1010. */

import { diasEntre, somarDias } from "../ponto/calendario.js";
import { calcularInss, calcularIrrf } from "./tabelas.js";

export const RUBRICAS = {
  SAL: { nome: "Salário", tipo: "provento", natRubr: "1000" },
  SALMAT: { nome: "Salário-maternidade", tipo: "provento", natRubr: "4050" },
  HE50: { nome: "Horas extras 50%", tipo: "provento", natRubr: "1003" },
  HE100: { nome: "Horas extras 100%", tipo: "provento", natRubr: "1003" },
  DSR: { nome: "DSR sobre horas extras e adicional noturno", tipo: "provento", natRubr: "1002" },
  ADN: { nome: "Adicional noturno", tipo: "provento", natRubr: "1205" },
  INSAL: { nome: "Adicional de insalubridade", tipo: "provento", natRubr: "1202" },
  PERIC: { nome: "Adicional de periculosidade", tipo: "provento", natRubr: "1203" },
  SALFAM: { nome: "Salário-família", tipo: "provento", natRubr: "1409" },
  D13_1: { nome: "13º salário (1ª parcela)", tipo: "provento", natRubr: "5001" },
  D13: { nome: "13º salário", tipo: "provento", natRubr: "5001" },
  FER: { nome: "Férias", tipo: "provento", natRubr: "1020" },
  FER13: { nome: "1/3 constitucional de férias", tipo: "provento", natRubr: "1016" },
  ABONO: { nome: "Abono pecuniário", tipo: "provento", natRubr: "1024" },
  ABONO13: { nome: "1/3 sobre abono pecuniário", tipo: "provento", natRubr: "1024" },
  SALDO: { nome: "Saldo de salário", tipo: "provento", natRubr: "1000" },
  AVISO: { nome: "Aviso prévio indenizado", tipo: "provento", natRubr: "6001" },
  D13PROP: { nome: "13º salário proporcional", tipo: "provento", natRubr: "5001" },
  FERVENC: { nome: "Férias vencidas", tipo: "provento", natRubr: "6006" },
  FERPROP: { nome: "Férias proporcionais", tipo: "provento", natRubr: "6007" },
  FERRESC13: { nome: "1/3 de férias na rescisão", tipo: "provento", natRubr: "6007" },
  FALTAS: { nome: "Faltas", tipo: "desconto", natRubr: "9207" },
  ATRASOS: { nome: "Atrasos e saídas antecipadas", tipo: "desconto", natRubr: "9207" },
  INSS: { nome: "INSS", tipo: "desconto", natRubr: "9201" },
  IRRF: { nome: "IRRF", tipo: "desconto", natRubr: "9203" },
  VT: { nome: "Vale-transporte", tipo: "desconto", natRubr: "9216" },
  BEN: { nome: "Desconto de benefício", tipo: "desconto", natRubr: "9219" },
  ADIANT13: { nome: "Desconto da 1ª parcela do 13º", tipo: "desconto", natRubr: "5504" },
};

const r = (v) => Math.round(v);
const rub = (codigo, valor, ref, extra = {}) => ({ codigo, nome: extra.nome ?? RUBRICAS[codigo]?.nome ?? codigo, tipo: extra.tipo ?? RUBRICAS[codigo]?.tipo ?? "provento", ref: ref ?? "", valor: r(valor), inss: extra.inss ?? true, irrf: extra.irrf ?? true, fgts: extra.fgts ?? true });

/** Último dia (AAAA-MM-DD) de uma competência AAAA-MM */
export const ultimoDiaMes = (competencia) => {
  const [a, m] = competencia.split("-").map(Number);
  return `${competencia}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

const idade = (nasc, em) => (nasc ? Math.floor(diasEntre(nasc, em) / 365.25) : 99);

function fechar(rubricas, { tabelas, dependentesIrrf = 0, competencia, aprendiz = false, exclusivoIrrf = false }) {
  const proventos = rubricas.filter((x) => x.tipo === "provento");
  const descontosIncidentes = rubricas.filter((x) => x.tipo === "desconto" && x.inss);
  const baseInss = Math.max(0, proventos.filter((x) => x.inss).reduce((s, x) => s + x.valor, 0) - descontosIncidentes.reduce((s, x) => s + x.valor, 0));
  const baseFgts = Math.max(0, proventos.filter((x) => x.fgts).reduce((s, x) => s + x.valor, 0) - rubricas.filter((x) => x.tipo === "desconto" && x.fgts).reduce((s, x) => s + x.valor, 0));
  const inss = calcularInss(baseInss, tabelas);
  if (inss > 0) rubricas.push(rub("INSS", inss, (baseInss / 100).toFixed(2).replace(".", ",")));
  const rendimentos = Math.max(0, proventos.filter((x) => x.irrf).reduce((s, x) => s + x.valor, 0) - rubricas.filter((x) => x.tipo === "desconto" && x.irrf && x.codigo !== "INSS" && x.codigo !== "IRRF").reduce((s, x) => s + x.valor, 0));
  const ir = calcularIrrf({ rendimentos, inss, dependentes: dependentesIrrf, competencia }, tabelas);
  if (ir.imposto > 0) rubricas.push(rub("IRRF", ir.imposto, (ir.base / 100).toFixed(2).replace(".", ",")));
  const bruto = proventos.reduce((s, x) => s + x.valor, 0);
  const descontos = rubricas.filter((x) => x.tipo === "desconto").reduce((s, x) => s + x.valor, 0);
  const fgts = r(baseFgts * (aprendiz ? tabelas.fgts_aprendiz : tabelas.fgts));
  return { rubricas, bruto, descontos, liquido: bruto - descontos, base_inss: baseInss, inss, base_irrf: ir.base, irrf: ir.imposto, base_fgts: baseFgts, fgts, irrf_simplificado: ir.simplificado, exclusivoIrrf };
}

/**
 * Folha mensal de um colaborador.
 * @param {object} p
 * @param {object} p.espelho resultado de calcularEspelho (horas extras, noturno, faltas, atrasos)
 */
export function calcularMensal({ colaborador, jornada, espelho, beneficios = [], lancamentos = [], dependentes = [], afastamentos = [], competencia, tabelas }) {
  const salario = colaborador.salario_centavos;
  const divisor = Math.round((jornada?.horas_semanais ?? 44) * 5) || 220;
  const valorHora = salario / divisor;
  const inicioMes = `${competencia}-01`;
  const ultimoDia = ultimoDiaMes(competencia);

  // Dias pagos: proporcional à admissão/desligamento no mês e ao afastamento a partir do 16º dia (pago pelo INSS)
  let diasPagos = 30;
  if (colaborador.admissao > inicioMes) diasPagos = Math.max(0, 30 - (diasEntre(inicioMes, colaborador.admissao)));
  const deslig = colaborador.desligamento?.data;
  if (deslig && deslig.slice(0, 7) === competencia) diasPagos = Math.min(diasPagos, Number(deslig.slice(8, 10)));
  let diasInss = 0;
  let diasMaternidade = 0;
  for (const a of afastamentos) {
    const ini = a.inicio < inicioMes ? inicioMes : a.inicio;
    const fim = !a.fim || a.fim > ultimoDia ? ultimoDia : a.fim;
    if (fim < ini) continue;
    const noMes = diasEntre(ini, fim) + 1;
    if (a.motivo === "17") diasMaternidade += noMes; // licença-maternidade: paga pela empresa e compensada
    else if (["01", "03"].includes(a.motivo)) {
      // Doença ou acidente: empresa paga os 15 primeiros dias
      const diaDoAfast = diasEntre(a.inicio, ini) + 1;
      const pagosPelaEmpresa = Math.max(0, Math.min(noMes, 15 - diaDoAfast + 1));
      diasInss += noMes - pagosPelaEmpresa;
    }
  }
  diasPagos = Math.max(0, diasPagos - diasInss - diasMaternidade);

  const rubricas = [];
  if (diasPagos > 0) rubricas.push(rub("SAL", (salario * diasPagos) / 30, `${diasPagos} dias`));
  if (diasMaternidade > 0) rubricas.push(rub("SALMAT", (salario * diasMaternidade) / 30, `${diasMaternidade} dias`));
  const t = espelho?.totais ?? {};
  const banco = espelho?.banco_horas;
  if (!banco && t.extra50) rubricas.push(rub("HE50", ((valorHora * 1.5) * t.extra50) / 60, hhmmRef(t.extra50)));
  if (!banco && t.extra100) rubricas.push(rub("HE100", ((valorHora * 2) * t.extra100) / 60, hhmmRef(t.extra100)));
  if (t.noturno_reduzido) rubricas.push(rub("ADN", (valorHora * tabelas.adicional_noturno * t.noturno_reduzido) / 60, hhmmRef(t.noturno_reduzido)));
  const variaveis = rubricas.filter((x) => ["HE50", "HE100", "ADN"].includes(x.codigo)).reduce((s, x) => s + x.valor, 0);
  if (variaveis > 0 && t.dias_uteis) rubricas.push(rub("DSR", (variaveis / t.dias_uteis) * t.domingos_feriados, `${t.domingos_feriados}/${t.dias_uteis}`));
  if (colaborador.insalubridade_pct > 0) rubricas.push(rub("INSAL", (tabelas.salario_minimo * colaborador.insalubridade_pct) / 100 * (diasPagos / 30), `${colaborador.insalubridade_pct}%`));
  if (colaborador.periculosidade) rubricas.push(rub("PERIC", salario * tabelas.periculosidade * (diasPagos / 30), "30%"));
  if (t.faltas) rubricas.push(rub("FALTAS", (salario / 30) * t.faltas, `${t.faltas} dias`));
  if (!banco && t.atraso) rubricas.push(rub("ATRASOS", (valorHora * t.atraso) / 60, hhmmRef(t.atraso)));

  for (const l of lancamentos) rubricas.push(rub(l.rubrica || "LANC", l.valor_centavos, "", { nome: l.descricao, tipo: l.tipo, inss: l.incide_inss, irrf: l.incide_irrf, fgts: l.incide_fgts }));

  // Salário-família: por filho até 14 anos, para remuneração até o limite
  const remuneracao = rubricas.filter((x) => x.tipo === "provento").reduce((s, x) => s + x.valor, 0);
  const filhos = dependentes.filter((d) => d.salario_familia && idade(d.nascimento, ultimoDia) < tabelas.salario_familia.idade_limite).length;
  if (filhos && remuneracao <= tabelas.salario_familia.ate_remuneracao) rubricas.push(rub("SALFAM", filhos * tabelas.salario_familia.valor, `${filhos} filho(s)`, { inss: false, irrf: false, fgts: false }));

  for (const b of beneficios) {
    const custo = b.valor_individual ?? b.valor_centavos;
    let desc = 0;
    if (b.tipo === "vt") desc = Math.min(custo, salario * tabelas.vt_percentual);
    else if (b.desconto_tipo === "percentual") desc = (custo * b.desconto_valor) / 100;
    else if (b.desconto_tipo === "fixo") desc = b.desconto_valor * 100;
    if (desc > 0) rubricas.push(rub(b.tipo === "vt" ? "VT" : "BEN", desc, b.nome, { nome: b.tipo === "vt" ? "Vale-transporte" : `Desconto ${b.nome}`, inss: false, irrf: false, fgts: false }));
  }
  return fechar(rubricas, { tabelas, dependentesIrrf: dependentes.filter((d) => d.irrf).length, competencia, aprendiz: colaborador.tipo_contrato === "aprendiz" });
}

const hhmmRef = (min) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`;

/** Avos (meses com 15 ou mais dias trabalhados) de um ano até uma data */
export function avos13(admissao, ano, ate = `${ano}-12-31`) {
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    const comp = `${ano}-${String(m).padStart(2, "0")}`;
    const ini = `${comp}-01`;
    if (ini > ate) break;
    const ultimo = ultimoDiaMes(comp);
    const de = admissao > ini ? admissao : ini;
    const a = ate < ultimo ? ate : ultimo;
    if (a >= de && diasEntre(de, a) + 1 >= 15) total++;
  }
  return total;
}

/** 13º salário: 1ª parcela (sem descontos, até 30/11) ou 2ª parcela (com INSS e IRRF, até 20/12) */
export function calcular13({ colaborador, ano, parcela, mediaVariaveis = 0, primeiraParcelaPaga = 0, dependentes = [], tabelas }) {
  const avos = avos13(colaborador.admissao, ano);
  const total = ((colaborador.salario_centavos + mediaVariaveis) * avos) / 12;
  if (parcela === 1) {
    const rubricas = [rub("D13_1", total / 2, `${avos}/12`, { inss: false, irrf: false })];
    const bruto = rubricas[0].valor;
    return { rubricas, bruto, descontos: 0, liquido: bruto, base_inss: 0, inss: 0, base_irrf: 0, irrf: 0, base_fgts: bruto, fgts: r(bruto * tabelas.fgts), avos };
  }
  const rubricas = [rub("D13", total, `${avos}/12`)];
  if (primeiraParcelaPaga) rubricas.push(rub("ADIANT13", primeiraParcelaPaga, "", { inss: false, irrf: false, fgts: false }));
  const res = fechar(rubricas, { tabelas, dependentesIrrf: dependentes.filter((d) => d.irrf).length, competencia: `${ano}-12`, exclusivoIrrf: true });
  // A 1ª parcela já recolheu FGTS: na 2ª, o FGTS incide só sobre a diferença
  res.base_fgts = Math.max(0, res.base_fgts - primeiraParcelaPaga);
  res.fgts = r(res.base_fgts * tabelas.fgts);
  return { ...res, avos };
}

/** Recibo de férias: dias de gozo + 1/3, abono pecuniário (isento) e descontos */
export function calcularFerias({ colaborador, dias, abono_dias = 0, mediaVariaveis = 0, dependentes = [], competencia, tabelas }) {
  const base = colaborador.salario_centavos + mediaVariaveis;
  const valorDias = (base / 30) * dias;
  const rubricas = [rub("FER", valorDias, `${dias} dias`), rub("FER13", valorDias / 3, "1/3")];
  if (abono_dias > 0) {
    const ab = (base / 30) * abono_dias;
    rubricas.push(rub("ABONO", ab, `${abono_dias} dias`, { inss: false, irrf: false, fgts: false }), rub("ABONO13", ab / 3, "1/3", { inss: false, irrf: false, fgts: false }));
  }
  return fechar(rubricas, { tabelas, dependentesIrrf: dependentes.filter((d) => d.irrf).length, competencia });
}

/** Períodos aquisitivos de férias e saldo de dias */
export function periodosFerias(admissao, ferias, hoje) {
  const periodos = [];
  let ini = admissao;
  while (ini <= hoje) {
    const fim = somarDias(somarDias(ini, 365), -1);
    const completo = fim <= hoje;
    const gozados = ferias.filter((f) => f.aquisitivo_inicio === ini && ["aprovada", "solicitada"].includes(f.status)).reduce((s, f) => s + f.dias + (f.abono_dias ?? 0), 0);
    const avos = completo ? 12 : Math.min(12, Math.floor((diasEntre(ini, hoje) + 1) / 30.4));
    periodos.push({ inicio: ini, fim, completo, avos, direito: completo ? 30 : Math.round((30 * avos) / 12), gozados, saldo: Math.max(0, (completo ? 30 : Math.round((30 * avos) / 12)) - gozados), limite_concessivo: somarDias(fim, 365) });
    ini = somarDias(fim, 1);
  }
  return periodos;
}

export const TIPOS_RESCISAO = {
  sem_justa_causa: { nome: "Dispensa sem justa causa", aviso: true, multa: 0.4, ferias_prop: true, d13: true, eSocial: "02" },
  pedido_demissao: { nome: "Pedido de demissão", aviso: false, multa: 0, ferias_prop: true, d13: true, eSocial: "07" },
  justa_causa: { nome: "Dispensa por justa causa", aviso: false, multa: 0, ferias_prop: false, d13: false, eSocial: "01" },
  acordo: { nome: "Acordo entre as partes (art. 484-A)", aviso: "metade", multa: 0.2, ferias_prop: true, d13: true, eSocial: "33" },
  termino_contrato: { nome: "Término de contrato por prazo determinado", aviso: false, multa: 0, ferias_prop: true, d13: true, eSocial: "06" },
};

/** Estimativa de rescisão (TRCT). O saldo de FGTS real vem do extrato da Caixa / FGTS Digital. */
export function calcularRescisao({ colaborador, data, tipo, aviso = "indenizado", ferias = [], saldoFgts, dependentes = [], tabelas }) {
  const t = TIPOS_RESCISAO[tipo];
  if (!t) throw new Error("Tipo de rescisão inválido");
  const salario = colaborador.salario_centavos;
  const anos = Math.floor(diasEntre(colaborador.admissao, data) / 365);
  const diasAvisoTotal = Math.min(90, 30 + 3 * anos);
  const diasAviso = t.aviso === true && aviso === "indenizado" ? diasAvisoTotal : t.aviso === "metade" && aviso === "indenizado" ? Math.round(diasAvisoTotal / 2) : 0;
  const projecao = somarDias(data, diasAviso);
  const rubricas = [];
  const saldoDias = Number(data.slice(8, 10));
  rubricas.push(rub("SALDO", (salario / 30) * saldoDias, `${saldoDias} dias`));
  if (diasAviso) rubricas.push(rub("AVISO", (salario / 30) * diasAviso, `${diasAviso} dias`, { irrf: false }));
  if (t.d13) {
    const avos = avos13(colaborador.admissao, Number(projecao.slice(0, 4)), projecao);
    if (avos) rubricas.push(rub("D13PROP", (salario * avos) / 12, `${avos}/12`));
  }
  const periodos = periodosFerias(colaborador.admissao, ferias, projecao);
  const vencidas = periodos.filter((p) => p.completo).reduce((s, p) => s + p.saldo, 0);
  const propAvos = t.ferias_prop ? periodos.filter((p) => !p.completo).reduce((s, p) => s + p.avos, 0) : 0;
  if (vencidas) rubricas.push(rub("FERVENC", (salario / 30) * vencidas, `${vencidas} dias`, { inss: false, irrf: false, fgts: false }));
  if (propAvos) rubricas.push(rub("FERPROP", (salario * propAvos) / 12, `${propAvos}/12`, { inss: false, irrf: false, fgts: false }));
  const feriasTotal = rubricas.filter((x) => ["FERVENC", "FERPROP"].includes(x.codigo)).reduce((s, x) => s + x.valor, 0);
  if (feriasTotal) rubricas.push(rub("FERRESC13", feriasTotal / 3, "1/3", { inss: false, irrf: false, fgts: false }));
  const res = fechar(rubricas, { tabelas, dependentesIrrf: dependentes.filter((d) => d.irrf).length, competencia: data.slice(0, 7) });
  const meses = Math.max(1, Math.round(diasEntre(colaborador.admissao, data) / 30.4));
  const fgtsEstimado = saldoFgts ?? r(salario * tabelas.fgts * meses);
  const multa = r((fgtsEstimado + res.fgts) * t.multa);
  return { ...res, tipo, tipo_nome: t.nome, motivo_esocial: t.eSocial, dias_aviso: diasAviso, projecao, saldo_fgts_estimado: fgtsEstimado, multa_fgts: multa, saque_fgts: t.multa === 0.4 ? "integral" : t.multa === 0.2 ? "80%" : "não", seguro_desemprego: tipo === "sem_justa_causa" };
}
