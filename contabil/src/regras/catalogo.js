/* Catálogos padrão do escritório: obrigações e documentos esperados por regime.
   IMPORTANTE: são prazos e listas PADRÃO, editáveis em Configurações. A legislação muda (e estados e municípios
   têm prazos próprios): o escritório confere o catálogo no início de cada ano e ajusta o que for diferente.

   Regra de prazo (campo "regra"):
   - mes: quantos meses depois da competência vence (1 = mês seguinte)
   - tipo: "dia" (dia fixo), "dia_util" (n-ésimo dia útil) ou "ultimo_dia_util"
   - dia: o dia ou o n-ésimo dia útil
   - ajuste: "antecipa" ou "posterga" quando o dia fixo cai em dia não útil
   - mes_fixo: nas anuais, o mês do vencimento no ano seguinte ao da competência */

export const DEPARTAMENTOS = { fiscal: "Fiscal", contabil: "Contábil", dp: "Departamento pessoal", societario: "Societário", geral: "Geral" };
export const REGIMES = { mei: "MEI", simples: "Simples Nacional", presumido: "Lucro Presumido", real: "Lucro Real" };

const M = (mes, dia, ajuste = "antecipa") => ({ mes, tipo: "dia", dia, ajuste });
export const OBRIGACOES_PADRAO = [
  { codigo: "DAS_MEI", nome: "DAS-MEI", departamento: "fiscal", regimes: ["mei"], periodicidade: "mensal", regra: M(1, 20, "posterga") },
  { codigo: "DASN_SIMEI", nome: "DASN-SIMEI (declaração anual do MEI)", departamento: "fiscal", regimes: ["mei"], periodicidade: "anual", regra: { mes_fixo: 5, tipo: "dia", dia: 31, ajuste: "antecipa" }, antecedencia: 15 },
  { codigo: "DAS", nome: "DAS (Simples Nacional)", departamento: "fiscal", regimes: ["simples"], periodicidade: "mensal", regra: M(1, 20, "posterga") },
  { codigo: "PGDAS", nome: "PGDAS-D (apuração do Simples)", departamento: "fiscal", regimes: ["simples"], periodicidade: "mensal", regra: M(1, 20, "posterga") },
  { codigo: "DEFIS", nome: "DEFIS (declaração anual do Simples)", departamento: "contabil", regimes: ["simples"], periodicidade: "anual", regra: { mes_fixo: 3, tipo: "dia", dia: 31, ajuste: "antecipa" }, antecedencia: 15 },
  { codigo: "PIS_COFINS", nome: "PIS e COFINS (DARF)", departamento: "fiscal", regimes: ["presumido", "real"], periodicidade: "mensal", regra: M(1, 25, "antecipa") },
  { codigo: "IRPJ_CSLL", nome: "IRPJ e CSLL trimestrais", departamento: "contabil", regimes: ["presumido", "real"], periodicidade: "trimestral", regra: { mes: 1, tipo: "ultimo_dia_util" } },
  { codigo: "EFD_CONTRIB", nome: "EFD-Contribuições", departamento: "fiscal", regimes: ["presumido", "real"], periodicidade: "mensal", regra: { mes: 2, tipo: "dia_util", dia: 10 } },
  { codigo: "EFD_ICMS", nome: "EFD ICMS/IPI (SPED Fiscal)", departamento: "fiscal", regimes: ["presumido", "real"], condicao: { contribuinte_icms: true }, periodicidade: "mensal", regra: M(1, 20, "antecipa") },
  { codigo: "ISS", nome: "ISS municipal", departamento: "fiscal", regimes: ["presumido", "real"], condicao: { presta_servico: true }, periodicidade: "mensal", regra: M(1, 10, "antecipa") },
  { codigo: "ESOCIAL", nome: "eSocial: fechamento da folha", departamento: "dp", regimes: ["mei", "simples", "presumido", "real"], condicao: { tem_funcionarios: true }, periodicidade: "mensal", regra: M(1, 15, "antecipa") },
  { codigo: "FGTS", nome: "FGTS Digital", departamento: "dp", regimes: ["mei", "simples", "presumido", "real"], condicao: { tem_funcionarios: true }, periodicidade: "mensal", regra: M(1, 20, "antecipa") },
  { codigo: "DCTFWEB", nome: "DCTFWeb", departamento: "dp", regimes: ["simples", "presumido", "real"], condicao: { tem_funcionarios: true }, periodicidade: "mensal", regra: M(1, 15, "antecipa") },
  { codigo: "DARF_FOLHA", nome: "DARF da folha (INSS e IRRF)", departamento: "dp", regimes: ["simples", "presumido", "real"], condicao: { tem_funcionarios: true }, periodicidade: "mensal", regra: M(1, 20, "antecipa") },
  { codigo: "REINF", nome: "EFD-Reinf", departamento: "fiscal", regimes: ["presumido", "real"], periodicidade: "mensal", regra: M(1, 15, "antecipa") },
  { codigo: "ECD", nome: "ECD (escrituração contábil digital)", departamento: "contabil", regimes: ["presumido", "real"], periodicidade: "anual", regra: { mes_fixo: 6, tipo: "ultimo_dia_util" }, antecedencia: 20 },
  { codigo: "ECF", nome: "ECF (escrituração contábil fiscal)", departamento: "contabil", regimes: ["presumido", "real"], periodicidade: "anual", regra: { mes_fixo: 7, tipo: "ultimo_dia_util" }, antecedencia: 20 },
  { codigo: "FECHAMENTO", nome: "Fechamento contábil do mês", departamento: "contabil", regimes: ["simples", "presumido", "real"], periodicidade: "mensal", regra: M(1, 25, "antecipa") },
];

/** Documentos que o escritório espera de cada cliente todo mês, conforme o regime */
export const DOCUMENTOS_PADRAO = {
  mei: [
    { nome: "Notas fiscais emitidas no mês", tipo: "notas_saida", dia_limite: 5, departamento: "fiscal" },
    { nome: "Extrato bancário do mês", tipo: "extrato", dia_limite: 5, departamento: "contabil" },
  ],
  simples: [
    { nome: "Extrato bancário do mês (todas as contas)", tipo: "extrato", dia_limite: 5, departamento: "contabil" },
    { nome: "Notas fiscais de compras e serviços tomados", tipo: "notas_entrada", dia_limite: 5, departamento: "fiscal" },
    { nome: "Comprovantes de despesas e pagamentos", tipo: "comprovantes", dia_limite: 5, departamento: "contabil" },
  ],
  presumido: [
    { nome: "Extrato bancário do mês (todas as contas)", tipo: "extrato", dia_limite: 5, departamento: "contabil" },
    { nome: "Notas fiscais de compras e serviços tomados", tipo: "notas_entrada", dia_limite: 5, departamento: "fiscal" },
    { nome: "Comprovantes de despesas e pagamentos", tipo: "comprovantes", dia_limite: 5, departamento: "contabil" },
    { nome: "Relatório de vendas ou faturamento", tipo: "faturamento", dia_limite: 3, departamento: "fiscal" },
  ],
  real: [
    { nome: "Extrato bancário do mês (todas as contas)", tipo: "extrato", dia_limite: 5, departamento: "contabil" },
    { nome: "Notas fiscais de compras e serviços tomados", tipo: "notas_entrada", dia_limite: 5, departamento: "fiscal" },
    { nome: "Comprovantes de despesas e pagamentos", tipo: "comprovantes", dia_limite: 5, departamento: "contabil" },
    { nome: "Relatório de vendas ou faturamento", tipo: "faturamento", dia_limite: 3, departamento: "fiscal" },
    { nome: "Inventário ou posição de estoque", tipo: "estoque", dia_limite: 5, departamento: "contabil" },
  ],
  funcionarios: [{ nome: "Variáveis da folha (horas extras, faltas, admissões, demissões)", tipo: "folha", dia_limite: 25, departamento: "dp", mes_atual: true }],
};

/** Contas padrão das sugestões de lançamento (o contador troca pelo plano de contas do escritório) */
export const CONTAS_PADRAO = {
  bancos: "Bancos conta movimento",
  fornecedores: "Fornecedores a pagar",
  clientes: "Clientes a receber",
  receita: "Receita de vendas e serviços",
  despesa: "Despesas a classificar",
  entradas: "Entradas a classificar",
  saidas: "Saídas a classificar",
  impostos: "Impostos a recolher",
};

/** Prazos padrão da régua de cobrança de documentos */
export const REGUA_PADRAO = { ativa: true, antes: 2, a_cada: 3, maximo: 4, canais: ["whatsapp", "email"] };
