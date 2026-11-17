/* Remessa CNAB 240 (padrão FEBRABAN) para pagamento de salários e fornecedores por crédito em conta,
   TED ou Pix. A empresa sobe o arquivo no internet banking PJ e o banco paga todo mundo de uma vez.

   IMPORTANTE: cada banco publica pequenas variações do padrão (convênio, versão do layout,
   campos "reservados ao banco"). Os ajustes conhecidos ficam em AJUSTES. O Itaú usa layout
   próprio (SISPAG) e não está aqui. Antes do primeiro uso real, gere um arquivo de teste e peça
   ao gerente para validar no ambiente de homologação do banco.
   Fonte comum: assets/bancos/. Copiado para cada produto por tools/bancos.sh. */
import { banco } from "./lista.js";

/* versão do layout de arquivo e de lote por banco (padrão FEBRABAN 10.x: 089 e 046) */
export const AJUSTES = {
  "001": { arquivo: "089", lote: "046", nome: "BANCO DO BRASIL S.A." },
  "104": { arquivo: "080", lote: "041", nome: "CAIXA ECONOMICA FEDERAL" },
  "237": { arquivo: "089", lote: "045", nome: "BANCO BRADESCO S.A." },
  "033": { arquivo: "060", lote: "031", nome: "BANCO SANTANDER" },
  "756": { arquivo: "089", lote: "045", nome: "SICOOB" },
  "748": { arquivo: "082", lote: "042", nome: "SICREDI" },
  "077": { arquivo: "089", lote: "046", nome: "BANCO INTER" },
};
export const BANCOS_CNAB = Object.keys(AJUSTES);

/* forma de lançamento (posição 12-13 do lote) e câmara (18-20 do segmento A) */
const FORMAS = {
  conta: { forma: "01", camara: "000" }, // crédito em conta no mesmo banco
  ted: { forma: "41", camara: "018" }, // TED para outro banco
  pix: { forma: "45", camara: "009" }, // Pix por dados bancários
};
const SERVICO = { salario: "30", fornecedor: "20" };

const sem = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .,/\-&]/g, " ").toUpperCase();
const A = (t, n) => sem(t).slice(0, n).padEnd(n, " "); // texto: à esquerda, com espaços
const N = (t, n) => {
  const d = String(t ?? "").replace(/\D/g, "");
  if (d.length > n) throw new Error(`Número com dígitos demais (${d.length} > ${n}): ${t}`);
  return d.padStart(n, "0"); // número: à direita, com zeros
};
const V = (reais, n) => N(Math.round(Number(reais) * 100), n); // valor com 2 casas, sem vírgula
const data8 = (d) => {
  const x = d instanceof Date ? d : new Date(`${d}T12:00:00`);
  if (Number.isNaN(x.getTime())) throw new Error(`Data inválida: ${d}`);
  return String(x.getDate()).padStart(2, "0") + String(x.getMonth() + 1).padStart(2, "0") + x.getFullYear();
};
const B = (n) => " ".repeat(n);

function separarConta(conta) {
  const t = String(conta ?? "").trim();
  const m = /^([\d.]+)-?([\dxX])$/.exec(t.replace(/\s/g, ""));
  if (!m) throw new Error(`Conta inválida: "${conta}". Use número-dígito, ex.: 12345-6`);
  return { numero: m[1].replace(/\D/g, ""), dv: m[2].toUpperCase() };
}
function separarAgencia(ag) {
  const t = String(ag ?? "").replace(/\s/g, "");
  const m = /^(\d{1,5})-?([\dxX])?$/.exec(t);
  if (!m) throw new Error(`Agência inválida: "${ag}"`);
  return { numero: m[1], dv: (m[2] ?? "").toUpperCase() };
}

function linha(partes, onde) {
  const l = partes.join("");
  if (l.length !== 240) throw new Error(`Erro interno no CNAB (${onde}): linha com ${l.length} posições`);
  return l;
}

/**
 * Gera o arquivo de remessa.
 * @param {object} p
 * @param {object} p.empresa  { cnpj, nome, banco, agencia, conta, convenio, endereco?, numero?, cidade?, cep?, uf? }
 * @param {Array}  p.pagamentos [{ nome, cpf, banco, agencia, conta, valor, seuNumero? }]
 * @param {string} p.data     data do pagamento (AAAA-MM-DD)
 * @param {"salario"|"fornecedor"} [p.servico]
 * @param {number} [p.sequencia] número do arquivo no dia/mês (NSA), de 1 em diante
 * @param {Date}   [p.agora]
 * @returns {{ texto: string, nomeArquivo: string, total: number, quantidade: number }}
 */
export function remessaPagamentos({ empresa, pagamentos, data, servico = "salario", sequencia = 1, agora = new Date() }) {
  const cod = N(empresa?.banco, 3);
  const aj = AJUSTES[cod];
  if (!aj) throw new Error(`Banco ${cod} ainda não tem layout CNAB 240 de pagamento aqui. Bancos prontos: ${BANCOS_CNAB.map((c) => banco(c)?.curto ?? c).join(", ")}.`);
  if (!SERVICO[servico]) throw new Error("Serviço deve ser salario ou fornecedor.");
  if (!Array.isArray(pagamentos) || !pagamentos.length) throw new Error("Nenhum pagamento na remessa.");
  const ag = separarAgencia(empresa.agencia);
  const ct = separarConta(empresa.conta);
  const cnpj = N(empresa.cnpj, 14);
  const empresaCampos = [N(2, 1), cnpj, A(empresa.convenio ?? "", 20), N(ag.numero, 5), A(ag.dv, 1), N(ct.numero, 12), A(ct.dv, 1), B(1), A(empresa.nome, 30)];

  /* separa em lotes pela forma: mesmo banco = crédito em conta; outro banco = Pix (ou TED se pedido) */
  const grupos = new Map();
  for (const [i, p] of pagamentos.entries()) {
    const v = Number(p.valor);
    if (!Number.isFinite(v) || v <= 0) throw new Error(`Valor inválido no pagamento ${i + 1} (${p.nome ?? "sem nome"}).`);
    const bFav = N(p.banco, 3);
    const forma = bFav === cod ? "conta" : p.forma === "ted" ? "ted" : "pix";
    if (!grupos.has(forma)) grupos.set(forma, []);
    grupos.get(forma).push({ ...p, bFav, v });
  }

  const linhas = [];
  linhas.push(linha([cod, "0000", "0", B(9), ...empresaCampos, A(aj.nome, 30), B(10), "1", data8(agora), String(agora.getHours()).padStart(2, "0") + String(agora.getMinutes()).padStart(2, "0") + String(agora.getSeconds()).padStart(2, "0"), N(sequencia, 6), aj.arquivo, "01600", B(20), B(20), B(29)], "header do arquivo"));

  let nLote = 0;
  let total = 0;
  for (const [forma, itens] of grupos) {
    nLote++;
    const lote = N(nLote, 4);
    const f = FORMAS[forma];
    linhas.push(linha([cod, lote, "1", "C", SERVICO[servico], f.forma, aj.lote, B(1), ...empresaCampos, B(40), A(empresa.endereco ?? "", 30), N(empresa.numero ?? 0, 5), B(15), A(empresa.cidade ?? "", 20), N(String(empresa.cep ?? "").replace(/\D/g, "").slice(0, 5), 5), N(String(empresa.cep ?? "").replace(/\D/g, "").slice(5, 8), 3), A(empresa.uf ?? "", 2), "01", B(6), B(10)], "header do lote"));
    let seq = 0;
    let soma = 0;
    for (const p of itens) {
      const agF = separarAgencia(p.agencia);
      const ctF = separarConta(p.conta);
      const cpf = String(p.cpf ?? "").replace(/\D/g, "");
      if (cpf.length !== 11 && cpf.length !== 14) throw new Error(`CPF ou CNPJ inválido de ${p.nome ?? "favorecido"}.`);
      seq++;
      linhas.push(linha([cod, lote, "3", N(seq, 5), "A", "0", "00", f.camara, p.bFav, N(agF.numero, 5), A(agF.dv, 1), N(ctF.numero, 12), A(ctF.dv, 1), B(1), A(p.nome, 30), A(p.seuNumero ?? `PG${seq}`, 20), data8(data), "BRL", N(0, 15), V(p.v, 15), B(20), N(0, 8), N(0, 15), B(40), B(2), servico === "salario" && forma === "ted" ? "00004" : B(5), B(2), B(3), "0", B(10)], "segmento A"));
      seq++;
      linhas.push(linha([cod, lote, "3", N(seq, 5), "B", B(3), cpf.length === 11 ? "1" : "2", N(cpf, 14), B(30), N(0, 5), B(15), B(15), B(20), N(0, 5), N(0, 3), B(2), data8(data), V(p.v, 15), N(0, 15), N(0, 15), N(0, 15), N(0, 15), B(15), "0", B(6), B(8)], "segmento B"));
      soma += Math.round(p.v * 100);
    }
    linhas.push(linha([cod, lote, "5", B(9), N(seq + 2, 6), N(soma, 18), N(0, 18), N(0, 6), B(165), B(10)], "trailer do lote"));
    total += soma;
  }
  linhas.push(linha([cod, "9999", "9", B(9), N(nLote, 6), N(linhas.length + 1, 6), N(0, 6), B(205)], "trailer do arquivo"));

  const d = data8(data);
  return {
    texto: linhas.join("\r\n") + "\r\n",
    nomeArquivo: `PAG${cod}_${d.slice(4)}${d.slice(2, 4)}${d.slice(0, 2)}_${N(sequencia, 3)}.REM`,
    total: total / 100,
    quantidade: pagamentos.length,
  };
}
