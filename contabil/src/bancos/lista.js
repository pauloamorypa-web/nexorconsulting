/* Bancos que os sistemas Nexor reconhecem (código de compensação COMPE).
   Fonte comum: assets/bancos/. Copiado para cada produto por tools/bancos.sh. Não edite as cópias. */

export const BANCOS = [
  { codigo: "001", nome: "Banco do Brasil", curto: "BB" },
  { codigo: "104", nome: "Caixa Econômica Federal", curto: "Caixa" },
  { codigo: "341", nome: "Itaú Unibanco", curto: "Itaú" },
  { codigo: "237", nome: "Bradesco", curto: "Bradesco" },
  { codigo: "033", nome: "Santander", curto: "Santander" },
  { codigo: "756", nome: "Sicoob", curto: "Sicoob" },
  { codigo: "748", nome: "Sicredi", curto: "Sicredi" },
  { codigo: "133", nome: "Cresol", curto: "Cresol" },
  { codigo: "389", nome: "Banco Mercantil do Brasil", curto: "Mercantil" },
  { codigo: "077", nome: "Banco Inter", curto: "Inter" },
  { codigo: "260", nome: "Nubank", curto: "Nubank" },
  { codigo: "336", nome: "C6 Bank", curto: "C6" },
  { codigo: "323", nome: "Mercado Pago", curto: "Mercado Pago" },
  { codigo: "290", nome: "PagBank", curto: "PagBank" },
  { codigo: "403", nome: "Cora", curto: "Cora" },
  { codigo: "197", nome: "Stone", curto: "Stone" },
  { codigo: "461", nome: "Asaas", curto: "Asaas" },
  { codigo: "422", nome: "Banco Safra", curto: "Safra" },
];

const PORCODIGO = new Map(BANCOS.map((b) => [b.codigo, b]));

/** Acha o banco pelo código (aceita "1", "001", 1). Devolve undefined se não conhece. */
export function banco(codigo) {
  if (codigo === undefined || codigo === null || codigo === "") return undefined;
  return PORCODIGO.get(String(codigo).replace(/\D/g, "").padStart(3, "0").slice(-3));
}
