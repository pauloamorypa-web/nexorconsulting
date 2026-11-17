/* Pix "copia e cola" (BR Code, padrão EMV do Banco Central) com a chave do próprio cliente.
   Funciona com qualquer banco, sem contrato nem API: o dinheiro cai direto na conta da chave.
   O que este arquivo NÃO faz: confirmar o pagamento. Para baixa automática use a API Pix
   do banco (pix-api.js) ou o Asaas.
   Fonte comum: assets/bancos/. Copiado para cada produto por tools/bancos.sh. */

const campo = (id, valor) => {
  const v = String(valor);
  if (v.length > 99) throw new Error(`Campo ${id} do Pix passou de 99 caracteres`);
  return id + String(v.length).padStart(2, "0") + v;
};

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no fim do BR Code */
export function crc16(texto) {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/* Nome e cidade do recebedor: o padrão pede letras sem acento e limite de tamanho */
const limpar = (t, max) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max);

const soDigitos = (t) => String(t).replace(/\D/g, "");

function cpfValido(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
function cnpjValido(c) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((a, p, i) => a + Number(c[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

/** Confere e normaliza a chave Pix. Devolve { tipo, chave } ou lança erro com mensagem para o usuário. */
export function normalizarChave(entrada) {
  const t = String(entrada ?? "").trim();
  if (!t) throw new Error("Informe a chave Pix.");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return { tipo: "aleatoria", chave: t.toLowerCase() };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
    if (t.length > 77) throw new Error("E-mail longo demais para chave Pix.");
    return { tipo: "email", chave: t.toLowerCase() };
  }
  const d = soDigitos(t);
  const telefone = () => {
    const tel = d.startsWith("55") && d.length >= 12 ? d : "55" + d;
    if (!/^55\d{10,11}$/.test(tel)) throw new Error("Telefone inválido para chave Pix. Use DDD + número.");
    return { tipo: "telefone", chave: "+" + tel };
  };
  if (t.startsWith("+")) return telefone();
  /* 11 dígitos pode ser CPF ou celular: CPF válido vence; escrito como telefone, (34) 9..., vira telefone */
  if (d.length === 11 && cpfValido(d) && !/[()]/.test(t)) return { tipo: "cpf", chave: d };
  if (d.length === 14 && cnpjValido(d)) return { tipo: "cnpj", chave: d };
  if (d.length === 10 || d.length === 11 || (d.startsWith("55") && (d.length === 12 || d.length === 13))) return telefone();
  throw new Error("Chave Pix inválida. Use CPF, CNPJ, e-mail, telefone ou chave aleatória.");
}

/**
 * Monta o Pix copia e cola.
 * @param {object} p
 * @param {string} p.chave   chave Pix do recebedor (CPF, CNPJ, e-mail, telefone ou aleatória)
 * @param {string} p.nome    nome do recebedor (até 25 letras)
 * @param {string} p.cidade  cidade do recebedor (até 15 letras), ex.: "Araguari"
 * @param {number} [p.valor] em reais; sem valor, quem paga digita
 * @param {string} [p.txid]  identificador para conferir depois (até 25 letras e números)
 * @param {string} [p.descricao] texto curto que aparece para quem paga
 */
export function pixCopiaECola({ chave, nome, cidade, valor, txid, descricao }) {
  const { chave: k } = normalizarChave(chave);
  const nomeOk = limpar(nome, 25);
  const cidadeOk = limpar(cidade, 15);
  if (!nomeOk) throw new Error("Informe o nome de quem recebe.");
  if (!cidadeOk) throw new Error("Informe a cidade de quem recebe.");
  let conta = campo("00", "br.gov.bcb.pix") + campo("01", k);
  const desc = limpar(descricao, 40);
  if (desc && 4 + k.length + 22 + desc.length <= 99) conta += campo("02", desc);
  let txt = campo("00", "01") + campo("26", conta) + campo("52", "0000") + campo("53", "986");
  if (valor !== undefined && valor !== null && valor !== "") {
    const v = Number(valor);
    if (!Number.isFinite(v) || v <= 0) throw new Error("Valor do Pix inválido.");
    if (v > 9_999_999_999.99) throw new Error("Valor do Pix alto demais.");
    txt += campo("54", v.toFixed(2));
  }
  const id = String(txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  txt += campo("58", "BR") + campo("59", nomeOk) + campo("60", cidadeOk) + campo("62", campo("05", id)) + "6304";
  return txt + crc16(txt);
}

/** Lê um copia e cola e devolve os campos principais (útil em testes e para conferir antes de mostrar). */
export function lerCopiaECola(codigo) {
  const s = String(codigo ?? "").trim();
  if (s.length < 30 || crc16(s.slice(0, -4)) !== s.slice(-4).toUpperCase()) throw new Error("Pix copia e cola inválido.");
  const ler = (t) => {
    const out = {};
    for (let i = 0; i + 4 <= t.length; ) {
      const id = t.slice(i, i + 2);
      const n = Number(t.slice(i + 2, i + 4));
      out[id] = t.slice(i + 4, i + 4 + n);
      i += 4 + n;
    }
    return out;
  };
  const c = ler(s);
  const conta = ler(c["26"] ?? "");
  return { chave: conta["01"], descricao: conta["02"], valor: c["54"] ? Number(c["54"]) : undefined, nome: c["59"], cidade: c["60"], txid: ler(c["62"] ?? "")["05"] };
}
