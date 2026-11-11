/* Validação dos dados recebidos (zod, mensagens em português com o nome do campo) e esquemas comuns. */

import { z } from "zod";
import { falha } from "./roteador.js";
import { cnpjValido, documentoValido, normalizarCnae, soDigitos } from "../regras/documentos.js";

export const COOKIES = { fornecedor: "nx_elo_f", instalador: "nx_elo_i", nexor: "nx_elo_n" };

export const t = (max, min = 1) => z.string().trim().min(min).max(max);
export const op = (max) => z.string().trim().max(max).optional().nullable();
export const dataExiste = (v) => {
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD").refine(dataExiste, "esta data não existe no calendário");
export const email = z.string().trim().toLowerCase().email().max(160);
export const senha = z.string().min(8, "precisa ter pelo menos 8 caracteres").max(200);
export const centavos = z.number().int().min(0).max(1_000_000_000);
export const qtd = z.number().int().min(1).max(1_000_000);
/** Percentual com até 2 casas (6.54 = 6,54%) */
export const pct = z.number().min(0).max(100);
export const id = z.string().trim().min(1).max(60);
export const uf = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "use a sigla do estado (ex.: MG)");
export const cnpj = z.string().transform(soDigitos).refine(cnpjValido, "CNPJ inválido");
export const documento = z.string().transform(soDigitos).refine(documentoValido, "CPF ou CNPJ inválido");
export const telefone = z.string().trim().max(30).transform(soDigitos).refine((v) => !v || (v.length >= 10 && v.length <= 13), "telefone com DDD (ex.: 34 99999-0000)");
export const cnaes = z.array(z.string().transform(normalizarCnae).refine((v) => v.length >= 4 && v.length <= 7, "CNAE com 4 a 7 dígitos")).min(1).max(60);
export const url = z.string().trim().max(500).url().refine((v) => /^https?:\/\//.test(v), "endereço inválido (comece com https://)");
export const endereco = z.object({ logradouro: op(160), numero: op(20), complemento: op(80), bairro: op(80), cidade: op(80), uf: uf.optional().nullable(), cep: op(10) }).partial();

/** Nomes dos campos como a equipe e o cliente os conhecem (no lugar do nome técnico) */
const ROTULOS = {
  nome: "Nome", email: "E-mail", senha: "Senha", telefone: "Telefone", cnpj: "CNPJ", cpf: "CPF", documento: "CPF/CNPJ", razao_social: "Razão social",
  nome_fantasia: "Nome fantasia", cnaes: "CNAEs", cidade: "Cidade", uf: "UF", prazo_reserva_dias: "Prazo de reserva", prazo_titulo_dias: "Prazo do título",
  wallet_id: "WalletId do Asaas", codigo: "Código", marca: "Marca", categoria: "Categoria", foto_url: "Foto", preco_centavos: "Preço", estoque: "Estoque",
  unidade: "Unidade", prazo_dias: "Prazo de entrega", visibilidade: "Visibilidade", tabelas: "Tabelas", tabela_id: "Tabela de preço",
  limite_credito_centavos: "Limite de crédito", motivo: "Motivo", desconto_pct: "Desconto", precos: "Preços", tipo: "Tipo", papel: "Perfil",
  quantidade: "Quantidade", descricao: "Descrição", itens: "Itens", custo_unit_centavos: "Custo", preco_unit_centavos: "Preço de venda", produto_id: "Produto",
  cliente_id: "Cliente", titulo: "Título", validade_dia: "Validade", condicoes: "Condições", garantia: "Garantia", desconto_centavos: "Desconto",
  observacoes: "Observações", margem_pct: "Margem", regime: "Regime", anexo: "Anexo", aliquota_pct: "Alíquota", iss_pct: "ISS", taxa_meio_pct: "Taxa do meio de pagamento",
  forma: "Forma de pagamento", parcelas: "Parcelas", valor_centavos: "Valor", vencimento: "Vencimento", tecnico_id: "Técnico", agendada_para: "Data agendada",
  checklist: "Checklist", series: "Números de série", serie: "Número de série", imagem: "Imagem", legenda: "Legenda", status: "Situação", nota: "Nota",
  dia_vencimento: "Dia do vencimento", inicio: "Início", endereco: "Endereço", logradouro: "Logradouro", numero: "Número", bairro: "Bairro", cep: "CEP",
  complemento: "Complemento", csv: "Arquivo CSV", fornecedor_id: "Fornecedor", segmento: "Segmento", termo: "Busca", atual: "Senha atual", nova: "Nova senha",
  codigo_instalacao: "Código de instalação", focus_token: "Token da Focus NFe", asaas_chave: "Chave do Asaas", garantia_meses: "Garantia (meses)",
};
const rotulo = (caminho) => {
  const chave = [...caminho].reverse().find((p) => typeof p === "string");
  if (!chave) return "Dados";
  return ROTULOS[chave] ?? chave.charAt(0).toUpperCase() + chave.slice(1).replaceAll("_", " ");
};
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
/** Mensagens em português para os erros padrão do zod (as mensagens escritas nos esquemas têm prioridade) */
function mensagemPt(i) {
  switch (i.code) {
    case "invalid_type":
      if (i.input === undefined || i.input === null) return "preenchimento obrigatório";
      return { number: "precisa ser um número", string: "precisa ser um texto", boolean: "precisa ser sim ou não", array: "precisa ser uma lista", object: "formato inválido" }[i.expected] ?? "valor inválido";
    case "too_small":
      if (i.origin === "string") return Number(i.minimum) <= 1 ? "não pode ficar em branco" : `precisa ter pelo menos ${plural(Number(i.minimum), "caractere", "caracteres")}`;
      if (i.origin === "array" || i.origin === "set") return `escolha pelo menos ${plural(Number(i.minimum), "item", "itens")}`;
      return `precisa ser no mínimo ${i.minimum}`;
    case "too_big":
      if (i.origin === "string") return `pode ter no máximo ${plural(Number(i.maximum), "caractere", "caracteres")}`;
      if (i.origin === "array" || i.origin === "set") return `no máximo ${plural(Number(i.maximum), "item", "itens")}`;
      return `pode ser no máximo ${i.maximum}`;
    case "invalid_format":
      return { email: "e-mail inválido (ex.: nome@email.com)", url: "endereço inválido (comece com https://)" }[i.format] ?? "formato inválido";
    case "invalid_value":
      return "opção inválida";
    case "not_multiple_of":
      return "valor inválido";
    case "unrecognized_keys":
      return "campo não reconhecido";
    default:
      return "valor inválido";
  }
}

export function validar(esquema, dados) {
  const r = esquema.safeParse(dados ?? {}, { error: mensagemPt });
  // Reteste U-05: não repete o nome do campo quando a mensagem já o traz ("CPF inválido", não "CPF: CPF inválido")
  const frase = (i) => {
    const r = rotulo(i.path);
    return i.message.startsWith(`${r} `) ? i.message : `${r}: ${i.message}`;
  };
  if (!r.success) falha(400, r.error.issues.map(frase).join("; "));
  return r.data;
}


export const usuarioPublico = ({ senha_hash, ...u }) => u;
