/* Validação dos dados recebidos (zod, mensagens em português com o nome do campo) e esquemas comuns. Padrão do Nexor Elo. */

import { z } from "zod";
import { falha } from "./roteador.js";

export const COOKIE = "nx_gd";
export const COOKIE_LINK = "nx_gd_link";
export const RETENCOES = [7, 15, 30, 60, 90, 120];
export const QUALIDADES = ["economica", "padrao", "alta"];
export const MODOS = ["continuo", "movimento"];

export const t = (max, min = 1) => z.string().trim().min(min).max(max);
export const op = (max) => z.string().trim().max(max).optional().nullable();
export const dataExiste = (v) => {
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD").refine(dataExiste, "esta data não existe no calendário");
export const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use o formato AAAA-MM");
export const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use o formato HH:MM");
export const email = z.string().trim().toLowerCase().email().max(160);
export const senha = z.string().min(10, "precisa ter pelo menos 10 caracteres").max(200);
export const centavos = z.number().int().min(0).max(1_000_000_000);
export const id = z.string().trim().min(1).max(60);
export const instante = z.number().int().min(946684800000).max(4102444800000);
export const retencao = z.number().int().refine((v) => RETENCOES.includes(v), "escolha 7, 15, 30, 60, 90 ou 120 dias");
export const qualidade = z.enum(QUALIDADES);
export const modo = z.enum(MODOS);
const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");
export const telefone = z.string().trim().max(30).transform(soDigitos).refine((v) => !v || (v.length >= 10 && v.length <= 13), "telefone com DDD (ex.: 34 99999-0000)");
export const cnpj = z.string().transform(soDigitos).refine((v) => v.length === 14, "CNPJ com 14 dígitos");
/** IPv4 ou faixa CIDR IPv4 (ex.: 200.150.10.0/24) */
export const faixaIp = z.string().trim().regex(/^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[12]\d|3[0-2]))?$/, "use um IP (200.150.10.5) ou faixa (200.150.10.0/24)").refine((v) => v.split("/")[0].split(".").every((n) => Number(n) <= 255), "IP inválido");
export const pais = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "use a sigla do país (ex.: BR)");

const ROTULOS = {
  nome: "Nome", email: "E-mail", senha: "Senha", telefone: "Telefone", cnpj: "CNPJ", razao_social: "Razão social", motivo: "Motivo", codigo: "Código",
  retencao_dias: "Plano (dias de gravação)", qualidade: "Qualidade", modo: "Modo de gravação", local_id: "Local", camera_id: "Câmera", ponte_id: "Ponte",
  inicio: "Início", fim: "Fim", validade_horas: "Validade", max_visualizacoes: "Limite de visualizações", horas: "Duração do acesso", rtsp_url: "Endereço RTSP",
  centavos_mes: "Preço mensal", ips_permitidos: "IPs permitidos", paises_permitidos: "Países permitidos", horario: "Horário permitido", perfil: "Perfil",
  atual: "Senha atual", nova: "Nova senha", codigo_instalacao: "Código de instalação", cameras: "Câmeras", conta_id: "Conta", dia: "Dia", mes: "Mês",
  segundos_trecho: "Duração do trecho", cidade: "Cidade", endereco: "Endereço", marca: "Marca", confirmar: "Confirmação", situacao: "Situação",
};
const rotulo = (caminho) => {
  const chave = [...caminho].reverse().find((p) => typeof p === "string");
  if (!chave) return "Dados";
  return ROTULOS[chave] ?? chave.charAt(0).toUpperCase() + chave.slice(1).replaceAll("_", " ");
};
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const ehDinheiro = (i) => String([...(i.path ?? [])].reverse().find((p) => typeof p === "string") ?? "").startsWith("centavos");
const emReais = (c) => (Number(c) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function mensagemPt(i) {
  if (i.code === "too_big" && i.origin === "number" && ehDinheiro(i)) return `pode ser no máximo ${emReais(i.maximum)}`;
  if (i.code === "too_small" && i.origin === "number" && ehDinheiro(i)) return `precisa ser no mínimo ${emReais(i.minimum)}`;
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
      return { email: "e-mail inválido (ex.: nome@email.com)", url: "endereço inválido" }[i.format] ?? "formato inválido";
    case "invalid_value":
      return "opção inválida";
    case "unrecognized_keys":
      return "campo não reconhecido";
    default:
      return "valor inválido";
  }
}

export function validar(esquema, dados) {
  const r = esquema.safeParse(dados ?? {}, { error: mensagemPt });
  const frase = (i) => {
    const rt = rotulo(i.path);
    return i.message.startsWith(`${rt} `) ? i.message : `${rt}: ${i.message}`;
  };
  if (!r.success) falha(400, r.error.issues.map(frase).join("; "));
  return r.data;
}

/** Paginação das listas sem mudar o formato (continua um array): ?limite= e ?pagina=; cabeçalhos X-Pagina, X-Limite, X-Proxima-Pagina */
export function paginar(ctx, { padrao = 200, maximo = 500 } = {}) {
  const n = (k) => Math.floor(Number(ctx.query.get(k)));
  const limite = Math.min(maximo, Math.max(1, n("limite") || padrao));
  const pagina = Math.min(100_000, Math.max(1, n("pagina") || 1));
  return {
    limite,
    pagina,
    sql: [limite + 1, (pagina - 1) * limite],
    cortar(lista) {
      const mais = lista.length > limite;
      ctx.res.setHeader("X-Pagina", String(pagina));
      ctx.res.setHeader("X-Limite", String(limite));
      if (mais) ctx.res.setHeader("X-Proxima-Pagina", String(pagina + 1));
      return mais ? lista.slice(0, limite) : lista;
    },
  };
}

export const usuarioPublico = ({ senha_hash, totp_cripto, totp_pendente_cripto, totp_ultimo_passo, ...u }) => ({ ...u, totp_ativo: Boolean(totp_cripto) });

/** O IP está na lista (IPs ou faixas CIDR IPv4)? Lista vazia = sem restrição. */
export function ipPermitido(ip, lista) {
  if (!lista?.length) return true;
  const limpo = String(ip ?? "").replace(/^::ffff:/, "");
  const n = (v) => v.split(".").reduce((a, p) => (a << 8) + Number(p), 0) >>> 0;
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(limpo)) return false;
  return lista.some((f) => {
    const [base, bits = "32"] = f.split("/");
    const mascara = Number(bits) === 0 ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0;
    return (n(limpo) & mascara) >>> 0 === (n(base) & mascara) >>> 0;
  });
}
