/* Validação dos dados recebidos (zod) e versões públicas dos registros (sem segredos). */

import { z } from "zod";
import { falha } from "./roteador.js";

export const COOKIE_PAINEL = "nx_barber";
export const COOKIE_CLIENTE = "nx_barber_cliente";

export const t = (max, min = 1) => z.string().trim().min(min).max(max);
export const op = (max) => z.string().trim().max(max).optional().nullable();
/** A data existe no calendário? (2026-02-31 não existe; o Date a jogaria em silêncio para 03/03) */
export const dataExiste = (v) => {
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export const dia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD")
  .refine(dataExiste, "esta data não existe no calendário");
/** Data de nascimento: existe e já passou (hoje no horário de Brasília) */
export const nascimento = dia.refine((v) => v < new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10), "precisa ser uma data no passado");
export const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use o formato HH:MM");
export const email = z.string().trim().toLowerCase().email().max(160);
export const senha = z.string().min(8, "precisa ter pelo menos 8 caracteres").max(200);
export const centavos = z.number().int().min(0).max(100_000_000);
export const pct = z.number().int().min(0).max(100);
export const id = z.string().trim().min(1).max(60);
export const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "use o formato #RRGGBB");
export const turnos = z.array(z.tuple([hora, hora]).refine(([a, b]) => a < b, "o fim do turno precisa ser depois do início")).max(4);
export const tabelaHorario = z.record(z.enum(["0", "1", "2", "3", "4", "5", "6"]), turnos);
export const cpf = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine(cpfValido, "CPF inválido");

export function cpfValido(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Nomes dos campos como a equipe e o cliente os conhecem (no lugar do nome técnico) */
const ROTULOS = {
  nome: "Nome", email: "E-mail", senha: "Senha", fone: "Celular", celular: "Celular", codigo: "Código", codigo_instalacao: "Código de instalação",
  barbearia: "Nome da barbearia", dia: "Data", ate_dia: "Data final", de: "Início", ate: "Fim", hora: "Horário", nascimento: "Data de nascimento",
  observacao: "Observação", observacoes: "Observações", motivo: "Motivo", descricao: "Descrição", categoria: "Categoria", bio: "Apresentação", cor: "Cor",
  preco_centavos: "Preço", custo_centavos: "Custo", desconto_centavos: "Desconto", valor_centavos: "Valor", duracao_min: "Duração", estoque: "Estoque",
  estoque_minimo: "Estoque mínimo", quantidade: "Quantidade", itens: "Itens", produtos: "Produtos", forma: "Forma de pagamento", cpf: "CPF",
  status: "Situação", papel: "Perfil", comissao_servico: "Comissão de serviço", comissao_produto: "Comissão de produto", desconto_produtos: "Desconto em produtos",
  dias_semana: "Dias da semana", horario: "Horário de funcionamento", excecoes: "Dias especiais", servico: "Serviço", servico_id: "Serviço",
  barbeiro: "Barbeiro", barbeiro_id: "Barbeiro", cliente: "Cliente", cliente_id: "Cliente", plano_id: "Plano", produto_id: "Produto", ordem: "Ordem",
  slogan: "Frase da marca", endereco: "Endereço", telefone: "Telefone", instagram: "Instagram", mapa: "Link do mapa", client_id: "Client ID do Google",
  id_numero: "ID do número", token: "Token", segredo: "Chave secreta", verificacao: "Token de verificação", sid: "Conta (SID)", chave: "Chave da API",
  token_webhook: "Token do webhook", ambiente: "Ambiente", tipo: "Tipo", canal: "Canal", passo_min: "Intervalo da agenda", antecedencia_min: "Antecedência mínima",
  janela_dias: "Janela de agendamento", cancelamento_horas: "Prazo para cancelar", lembrete_horas: "Lembrete", tolerancia_min: "Tolerância de atraso",
  atual: "Senha atual", nova: "Nova senha", senha_atual: "Senha atual", nova_senha: "Nova senha",
  margem_dias: "Margem do retorno", ocultos: "Itens ocultos", pago_agora: "Forma de pagamento", remover: "Remover",
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
export const clientePublico = ({ google_sub, ...c }) => ({ ...c, google: Boolean(google_sub) });
export const barbeiroPublico = (b) => ({ id: b.id, nome: b.nome, bio: b.bio, cor: b.cor, servicos: b.servicos });

/** Configuração da barbearia sem os segredos (tokens viram só "configurado: sim/não"). Vale para toda a equipe. */
export function configPublica(config) {
  const { whatsapp = {}, sms = {}, asaas = {}, ...resto } = config;
  const { token_cripto, segredo_cripto, verificacao, ...w } = whatsapp;
  const { token_cripto: st, ...s } = sms;
  const { chave_cripto, token_webhook, token_webhook_cripto, ...a } = asaas;
  return { ...resto, whatsapp: { ...w, token: Boolean(token_cripto), segredo: Boolean(segredo_cripto), verificacao: Boolean(verificacao) }, sms: { ...s, token: Boolean(st) }, asaas: { ...a, chave: Boolean(chave_cripto), token_webhook: Boolean(token_webhook_cripto || token_webhook) } };
}

/**
 * Aba Canais (só dono e admin): a configuração pública mais os dois valores que precisam ser colados
 * nos painéis da Meta e do Asaas (verificação do webhook do WhatsApp e token do webhook do Asaas).
 */
export function configCanais(config, tokenWebhookAsaas) {
  const p = configPublica(config);
  return { ...p, whatsapp: { ...p.whatsapp, verificacao: config.whatsapp?.verificacao || null }, asaas: { ...p.asaas, token_webhook: tokenWebhookAsaas || null } };
}
