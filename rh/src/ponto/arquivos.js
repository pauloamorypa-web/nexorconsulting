/* Arquivos de fiscalização do ponto eletrônico (Portaria MTP nº 671/2021):
   - AFD (Arquivo Fonte de Dados, Anexo I): todas as marcações do REP-P com NSR e hash encadeado.
   - AEJ (Arquivo Eletrônico de Jornada, Anexo II): jornadas contratuais, marcações tratadas, ausências e banco de horas.
   Antes de usar numa fiscalização, confira os leiautes com a versão vigente dos anexos da Portaria e
   assine o AFD com o certificado ICP-Brasil da empresa (assinatura CAdES destacada, arquivo .p7s). */

import { dataHoraOficial, conteudoRegistro } from "./registro.js";

const txt = (v, n) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, n).padEnd(n, " ");
const num = (v, n) => String(v ?? "").replace(/\D/g, "").slice(-n).padStart(n, "0");

/** Gera o AFD de um período */
export function gerarAfd({ empresa, marcacoes, de, ate, registroInpi, desenvolvedorCnpj, agora = Date.now() }) {
  const linhas = [];
  const cnpj = num(empresa.cnpj, 14);
  linhas.push(
    "000000000" + "1" + "1" + cnpj + num("", 14) + txt(empresa.razao_social, 150) + txt(registroInpi, 17) + de + ate + dataHoraOficial(agora) + "003" + "1" + num(desenvolvedorCnpj, 14) + txt("", 30),
  );
  for (const m of marcacoes) {
    linhas.push(conteudoRegistro({ ...m, online: m.online !== false && m.online !== 0 }, m.colaborador_cpf) + m.hash);
  }
  const qtd7 = marcacoes.length;
  linhas.push("999999999" + num(0, 9) + num(0, 9) + num(0, 9) + num(0, 9) + num(0, 9) + num(qtd7, 9) + "9");
  return linhas.join("\r\n") + "\r\n";
}

/** Gera o AEJ (campos separados por "|") */
export function gerarAej({ empresa, colaboradores, jornadas, espelhos, marcacoesPorColab, de, ate, registroInpi, sistema }) {
  const r = [];
  const cont = {};
  const add = (tipo, campos) => {
    cont[tipo] = (cont[tipo] ?? 0) + 1;
    r.push([tipo, ...campos].join("|"));
  };
  add("01", ["1", num(empresa.cnpj, 14), "", "", empresa.razao_social, de, ate, "001"]);
  add("02", ["1", "3", registroInpi || ""]); // 3 = REP-P
  const vinc = new Map(colaboradores.map((c, i) => [c.id, String(i + 1)]));
  for (const c of colaboradores) add("03", [vinc.get(c.id), c.cpf, c.nome]);
  for (const j of jornadas) {
    const d = Object.values(j.dias ?? {}).find((x) => x?.entrada) ?? j.escala ?? {};
    add("04", [j.id.slice(0, 8), String(Math.round((j.horas_semanais ?? 44) * 60 / 6)), d.entrada ?? "", d.saida ?? "", "", ""]);
  }
  for (const c of colaboradores) {
    let seq = 0;
    for (const m of marcacoesPorColab.get(c.id) ?? []) {
      seq++;
      add("05", [vinc.get(c.id), dataHoraOficial(m.momento), "1", seq % 2 ? "E" : "S", String(Math.ceil(seq / 2)), m.origem === "ajuste" ? "I" : "O", (c.jornada_id ?? "").slice(0, 8), m.motivo ?? ""]);
    }
    add("06", [vinc.get(c.id), c.matricula]);
    const esp = espelhos.get(c.id);
    for (const d of esp?.dias ?? []) {
      if (d.falta) add("07", [vinc.get(c.id), "1", d.data, String(d.previsto), ""]);
      if (d.atraso) add("07", [vinc.get(c.id), "1", d.data, String(d.atraso), ""]);
      if (esp.banco_horas && d.extra50 + d.extra100) add("07", [vinc.get(c.id), "2", d.data, String(d.extra50 + d.extra100), "1"]);
    }
  }
  add("08", [sistema.nome, sistema.versao, "1", num(sistema.desenvolvedorCnpj, 14), "Nexor Consulting", "contato@nexorconsultingit.com.br"]);
  r.push(["99", ...["01", "02", "03", "04", "05", "06", "07", "08"].map((t) => String(cont[t] ?? 0))].join("|"));
  return r.join("\r\n") + "\r\n";
}
