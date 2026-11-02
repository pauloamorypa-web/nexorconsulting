/* Eventos do eSocial, leiaute S-1.3 (Nota Técnica vigente em 2025/2026).
   Tabelas: S-1000 empregador, S-1005 estabelecimentos, S-1010 rubricas, S-1020 lotações.
   Não periódicos: S-2200 admissão, S-2205 alteração cadastral, S-2206 alteração contratual,
   S-2230 afastamento, S-2299 desligamento. Periódicos: S-1200 remuneração, S-1210 pagamentos, S-1299 fechamento.
   Antes da produção, valide em "Produção restrita" do eSocial: o retorno do governo aponta qualquer campo
   que o leiaute vigente exija de forma diferente. */

import { RUBRICAS } from "../folha/calculo.js";
import { el, elv, reais } from "./xml.js";

export const VERSAO_LEIAUTE = "v_S_01_03_00";
const ns = (evt) => `http://www.esocial.gov.br/schema/evt/${evt}/${VERSAO_LEIAUTE}`;

export const GRUPO = { "S-1000": 1, "S-1005": 1, "S-1010": 1, "S-1020": 1, "S-2200": 2, "S-2205": 2, "S-2206": 2, "S-2230": 2, "S-2299": 2, "S-1200": 3, "S-1210": 3, "S-1299": 3 };

export const MOTIVOS_AFASTAMENTO = {
  "01": "Acidente ou doença do trabalho",
  "03": "Acidente ou doença não relacionada ao trabalho",
  "17": "Licença-maternidade",
  "19": "Aborto não criminoso",
  "21": "Licença não remunerada",
  "24": "Licença-paternidade (casos que exigem informação)",
  "29": "Serviço militar",
};

export const CATEGORIAS = { "101": "Empregado (geral)", "103": "Aprendiz", "105": "Contrato por prazo determinado", "106": "Trabalhador temporário", "111": "Intermitente" };

const so = (v) => String(v ?? "").replace(/\D/g, "");
const raiz = (cnpj) => so(cnpj).slice(0, 8);

let seq = 0;
/** Id do evento: ID + tipo de inscrição + inscrição (14) + data e hora + sequencial (5) */
export function idEvento(cnpj, agora = Date.now()) {
  seq = (seq % 99999) + 1;
  const d = new Date(agora - 3 * 3600_000).toISOString().replace(/\D/g, "").slice(0, 14);
  return `ID1${raiz(cnpj).padEnd(14, "0")}${d}${String(seq).padStart(5, "0")}`;
}

const ideEvento = ({ ambiente, retificacao, recibo, periodo, indApuracao }) =>
  el(
    "ideEvento",
    retificacao !== undefined ? el("indRetif", retificacao ? "2" : "1") : "",
    retificacao ? el("nrRecibo", recibo) : "",
    indApuracao ? el("indApuracao", indApuracao) : "",
    periodo ? el("perApur", periodo) : "",
    el("tpAmb", String(ambiente)),
    el("procEmi", "1"),
    el("verProc", "NexorRH-1.0"),
  );
const ideEmpregador = (empresa) => el("ideEmpregador", el("tpInsc", "1"), el("nrInsc", raiz(empresa.cnpj)));
const envelope = (evt, id, ...conteudo) => el("eSocial", { xmlns: ns(evt) }, el(evt, { Id: id }, ...conteudo));

const endereco = (e = {}) =>
  el("endereco", el("brasil", el("tpLograd", e.tipo_logradouro), el("dscLograd", e.logradouro), el("nrLograd", e.numero || "S/N"), el("complemento", e.complemento), el("bairro", e.bairro), el("cep", so(e.cep)), el("codMunic", so(e.cod_municipio)), el("uf", e.uf)));

const RACA = { branca: "1", preta: "2", parda: "3", amarela: "4", indigena: "5", nao_informado: "6" };
const ESTCIV = { solteiro: "1", casado: "2", divorciado: "3", separado: "4", viuvo: "5", uniao_estavel: "2" };
const INSTR = { fundamental_incompleto: "03", fundamental: "05", medio_incompleto: "06", medio: "07", superior_incompleto: "08", superior: "09", pos: "10", mestrado: "11", doutorado: "12" };

const dadosTrabalhador = (c, dependentes) => [
  el("nmTrab", c.nome),
  el("sexo", c.sexo === "F" ? "F" : "M"),
  el("racaCor", RACA[c.raca_cor] ?? "6"),
  el("estCiv", ESTCIV[c.estado_civil]),
  el("grauInstr", INSTR[c.escolaridade] ?? "07"),
  el("nmSoc", c.nome_social),
];

const dependente = (d) =>
  el("dependente", el("tpDep", { filho: "03", conjuge: "01", companheiro: "02", enteado: "04", pai: "09", mae: "09", outro: "99" }[d.parentesco] ?? "99"), el("nmDep", d.nome), el("dtNascto", d.nascimento), el("cpfDep", so(d.cpf)), el("depIRRF", d.irrf ? "S" : "N"), el("depSF", d.salario_familia ? "S" : "N"), el("incTrab", "N"));

const horContratual = (jornada) =>
  el("horContratual", el("qtdHrsSem", String(jornada?.horas_semanais ?? 44)), el("tpJornada", jornada?.tipo === "escala" ? "3" : "2"), el("tmpParc", (jornada?.horas_semanais ?? 44) <= 30 ? "1" : "0"), el("horNoturno", "N"), el("dscJorn", descricaoJornada(jornada)));

export function descricaoJornada(j) {
  if (!j) return "Conforme contrato";
  if (j.tipo === "escala") return `Escala ${j.escala?.trabalha ?? 1}x${j.escala?.folga ?? 1}, das ${j.escala?.entrada} às ${j.escala?.saida}, intervalo de ${j.escala?.intervalo_min ?? 60} min`;
  const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return Object.entries(j.dias ?? {})
    .filter(([, d]) => d?.entrada)
    .map(([k, d]) => `${nomes[k]} ${d.entrada}-${d.saida} (${d.intervalo_min ?? 0} min)`)
    .join("; ").slice(0, 999);
}

const infoContrato = ({ colaborador: c, cargo, jornada, estabelecimento, empresa }) =>
  el(
    "infoContrato",
    el("nmCargo", cargo?.nome ?? "Não informado"),
    el("CBOCargo", so(cargo?.cbo)),
    el("codCateg", c.categoria_esocial ?? "101"),
    el("remuneracao", el("vrSalFx", reais(c.salario_centavos)), el("undSalFixo", "5"), el("dscSalVar", "")),
    el("duracao", el("tpContr", ["105", "106"].includes(c.categoria_esocial) ? "2" : "1"), ["105", "106"].includes(c.categoria_esocial) ? el("dtTerm", c.termino_contrato) : ""),
    el("localTrabalho", el("localTrabGeral", el("tpInsc", "1"), el("nrInsc", so(estabelecimento?.cnpj || empresa.cnpj)))),
    horContratual(jornada),
  );

/* ---------- Tabelas ---------- */

export function s1000({ empresa, ambiente, inicio }) {
  const c = empresa.config?.esocial ?? {};
  return envelope(
    "evtInfoEmpregador",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente }),
    ideEmpregador(empresa),
    el("infoEmpregador", el("inclusao", el("idePeriodo", el("iniValid", inicio)), el("infoCadastro", el("classTrib", c.class_trib ?? "99"), elv("indCoop", c.ind_coop ?? "0"), elv("indConstr", c.ind_constr ?? "0"), elv("indDesFolha", c.ind_des_folha ?? "0"), elv("indOptRegEletron", "1")))),
  );
}

export function s1005({ empresa, estabelecimento, ambiente, inicio }) {
  const c = empresa.config?.esocial ?? {};
  return envelope(
    "evtTabEstab",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente }),
    ideEmpregador(empresa),
    el("infoEstab", el("inclusao", el("ideEstab", el("tpInsc", "1"), el("nrInsc", so(estabelecimento.cnpj || empresa.cnpj)), el("iniValid", inicio)), el("dadosEstab", el("cnaePrep", so(c.cnae)), el("aliqGilrat", elv("aliqRat", c.rat ?? "1"), elv("fap", c.fap ?? "1.0000"))))),
  );
}

const INCID = {
  provento: { cp: "11", irrf: "11", fgts: "11" },
  desconto: { cp: "00", irrf: "00", fgts: "00" },
  INSS: { cp: "31", irrf: "31", fgts: "00" },
  IRRF: { cp: "00", irrf: "31", fgts: "00" },
  D13: { cp: "12", irrf: "12", fgts: "12" },
  D13_1: { cp: "00", irrf: "00", fgts: "12" },
  FER: { cp: "11", irrf: "13", fgts: "11" },
  FER13: { cp: "11", irrf: "13", fgts: "11" },
  ABONO: { cp: "00", irrf: "9", fgts: "00" },
  ABONO13: { cp: "00", irrf: "9", fgts: "00" },
  SALFAM: { cp: "51", irrf: "9", fgts: "00" },
  AVISO: { cp: "11", irrf: "9", fgts: "11" },
  FERVENC: { cp: "00", irrf: "9", fgts: "00" },
  FERPROP: { cp: "00", irrf: "9", fgts: "00" },
  FERRESC13: { cp: "00", irrf: "9", fgts: "00" },
};

export function s1010({ empresa, ambiente, inicio, codigo, rubrica }) {
  const inc = INCID[codigo] ?? INCID[rubrica.tipo];
  return envelope(
    "evtTabRubrica",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente }),
    ideEmpregador(empresa),
    el(
      "infoRubrica",
      el(
        "inclusao",
        el("ideRubrica", el("codRubr", codigo), el("ideTabRubr", "NEXOR"), el("iniValid", inicio)),
        el("dadosRubrica", el("dscRubr", rubrica.nome), el("natRubr", rubrica.natRubr), el("tpRubr", rubrica.tipo === "provento" ? "1" : "2"), el("codIncCP", inc.cp), el("codIncIRRF", inc.irrf), el("codIncFGTS", inc.fgts)),
      ),
    ),
  );
}

export const todasRubricas = () => Object.entries(RUBRICAS);

export function s1020({ empresa, ambiente, inicio }) {
  const c = empresa.config?.esocial ?? {};
  return envelope(
    "evtTabLotacao",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente }),
    ideEmpregador(empresa),
    el("infoLotacao", el("inclusao", el("ideLotacao", el("codLotacao", "GERAL"), el("iniValid", inicio)), el("dadosLotacao", el("tpLotacao", "01"), el("fpasLotacao", el("fpas", c.fpas ?? "515"), el("codTercs", c.cod_tercs ?? "0115"))))),
  );
}

/* ---------- Não periódicos ---------- */

export function s2200({ empresa, colaborador: c, cargo, jornada, estabelecimento, dependentes = [], ambiente }) {
  return envelope(
    "evtAdmissao",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente, retificacao: false }),
    ideEmpregador(empresa),
    el(
      "trabalhador",
      el("cpfTrab", so(c.cpf)),
      ...dadosTrabalhador(c),
      el("nascimento", el("dtNascto", c.nascimento), el("paisNascto", "105"), el("paisNac", "105")),
      endereco(c.endereco),
      dependentes.map(dependente),
      el("contato", el("fonePrinc", so(c.telefone)), el("emailPrinc", c.email)),
    ),
    el(
      "vinculo",
      el("matricula", c.matricula),
      el("tpRegTrab", "1"),
      el("tpRegPrev", "1"),
      el("cadIni", "N"),
      el("infoRegimeTrab", el("infoCeletista", el("dtAdm", c.admissao), el("tpAdmissao", "1"), el("indAdmissao", "1"), el("tpRegJor", "1"), el("natAtividade", "1"))),
      infoContrato({ colaborador: c, cargo, jornada, estabelecimento, empresa }),
    ),
  );
}

export function s2205({ empresa, colaborador: c, dependentes = [], ambiente, data }) {
  return envelope(
    "evtAltCadastral",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente, retificacao: false }),
    ideEmpregador(empresa),
    el("ideTrabalhador", el("cpfTrab", so(c.cpf))),
    el("alteracao", el("dtAlteracao", data), el("dadosTrabalhador", ...dadosTrabalhador(c), el("paisNac", "105"), endereco(c.endereco), dependentes.map(dependente), el("contato", el("fonePrinc", so(c.telefone)), el("emailPrinc", c.email)))),
  );
}

export function s2206({ empresa, colaborador: c, cargo, jornada, estabelecimento, ambiente, data }) {
  return envelope(
    "evtAltContratual",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente, retificacao: false }),
    ideEmpregador(empresa),
    el("ideVinculo", el("cpfTrab", so(c.cpf)), el("matricula", c.matricula)),
    el("altContratual", el("dtAlteracao", data), el("vinculo", el("tpRegPrev", "1")), el("infoRegimeTrab", el("infoCeletista", el("tpRegJor", "1"), el("natAtividade", "1"))), infoContrato({ colaborador: c, cargo, jornada, estabelecimento, empresa })),
  );
}

export function s2230({ empresa, colaborador: c, afastamento: a, ambiente }) {
  return envelope(
    "evtAfastTemp",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente, retificacao: false }),
    ideEmpregador(empresa),
    el("ideVinculo", el("cpfTrab", so(c.cpf)), el("matricula", c.matricula)),
    el("infoAfastamento", el("iniAfastamento", el("dtIniAfast", a.inicio), el("codMotAfast", a.motivo)), a.fim ? el("fimAfastamento", el("dtTermAfast", a.fim)) : ""),
  );
}

const detalhe = (rubricas) =>
  rubricas
    .filter((r) => r.valor > 0)
    .map((r) => el("detVerbas", el("codRubr", r.codigo), el("ideTabRubr", "NEXOR"), el("vrRubr", reais(r.valor)), el("indApurIR", "0")));

export function s2299({ empresa, colaborador: c, rescisao, data, estabelecimento, ambiente }) {
  return envelope(
    "evtDeslig",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente, retificacao: false }),
    ideEmpregador(empresa),
    el("ideVinculo", el("cpfTrab", so(c.cpf)), el("matricula", c.matricula)),
    el(
      "infoDeslig",
      el("mtvDeslig", rescisao.motivo_esocial),
      el("dtDeslig", data),
      el("indPagtoAPI", rescisao.dias_aviso ? "S" : "N"),
      rescisao.dias_aviso ? el("dtProjFimAPI", rescisao.projecao) : "",
      elv("pensAlim", "0"),
      el("verbasResc", el("dmDev", el("ideDmDev", `R${data.replace(/-/g, "")}`), el("infoPerApur", el("ideEstabLot", el("tpInsc", "1"), el("nrInsc", so(estabelecimento?.cnpj || empresa.cnpj)), el("codLotacao", "GERAL"), detalhe(rescisao.rubricas))))),
    ),
  );
}

/* ---------- Periódicos ---------- */

export function s1200({ empresa, colaborador: c, item, competencia, estabelecimento, ambiente, indApuracao = "1" }) {
  return envelope(
    "evtRemun",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente, retificacao: false, indApuracao, periodo: indApuracao === "2" ? competencia.slice(0, 4) : competencia }),
    ideEmpregador(empresa),
    el("ideTrabalhador", el("cpfTrab", so(c.cpf))),
    el(
      "dmDev",
      el("ideDmDev", `F${competencia.replace("-", "")}${indApuracao}`),
      el("codCateg", c.categoria_esocial ?? "101"),
      el(
        "infoPerApur",
        el(
          "ideEstabLot",
          el("tpInsc", "1"),
          el("nrInsc", so(estabelecimento?.cnpj || empresa.cnpj)),
          el("codLotacao", "GERAL"),
          el("remunPerApur", el("matricula", c.matricula), item.rubricas.filter((r) => r.valor > 0).map((r) => el("itensRemun", el("codRubr", r.codigo), el("ideTabRubr", "NEXOR"), el("vrRubr", reais(r.valor)), el("indApurIR", "0")))),
        ),
      ),
    ),
  );
}

export function s1210({ empresa, colaborador: c, item, competencia, dataPagamento, ambiente }) {
  return envelope(
    "evtPgtos",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente, retificacao: false, periodo: competencia }),
    ideEmpregador(empresa),
    el("ideBenef", el("cpfBenef", so(c.cpf)), el("infoPgto", el("dtPgto", dataPagamento), el("tpPgto", "1"), el("perRef", competencia), el("ideDmDev", `F${competencia.replace("-", "")}1`), el("vrLiq", reais(item.liquido)))),
  );
}

export function s1299({ empresa, competencia, ambiente, indApuracao = "1" }) {
  return envelope(
    "evtFechaEvPer",
    idEvento(empresa.cnpj),
    ideEvento({ ambiente, indApuracao, periodo: indApuracao === "2" ? competencia.slice(0, 4) : competencia }),
    ideEmpregador(empresa),
    el("infoFech", el("evtRemun", "S"), el("evtComProd", "N"), el("evtContratAvNP", "N"), el("evtInfoComplPer", "N")),
  );
}
