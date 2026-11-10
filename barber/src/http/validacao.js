/* Validação dos dados recebidos (zod) e versões públicas dos registros (sem segredos). */

import { z } from "zod";
import { falha } from "./roteador.js";

export const COOKIE_PAINEL = "nx_barber";
export const COOKIE_CLIENTE = "nx_barber_cliente";

export const t = (max, min = 1) => z.string().trim().min(min).max(max);
export const op = (max) => z.string().trim().max(max).optional().nullable();
export const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD");
export const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "hora no formato HH:MM");
export const email = z.string().trim().toLowerCase().email().max(160);
export const senha = z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(200);
export const centavos = z.number().int().min(0).max(100_000_000);
export const pct = z.number().int().min(0).max(100);
export const id = z.string().trim().min(1).max(60);
export const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "cor no formato #RRGGBB");
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

export function validar(esquema, dados) {
  const r = esquema.safeParse(dados ?? {});
  if (!r.success) falha(400, r.error.issues.map((i) => `${i.path.join(".") || "dados"}: ${i.message}`).join("; "));
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
