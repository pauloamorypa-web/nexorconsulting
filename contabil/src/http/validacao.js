/* Validação dos dados recebidos (zod) e versões públicas dos registros (sem segredos). */

import { z } from "zod";
import { cnpjValido } from "../ia/leitura.js";
import { falha } from "./roteador.js";

export const COOKIE_PAINEL = "nx_contabil";
export const COOKIE_PORTAL = "nx_portal";

export const t = (max, min = 1) => z.string().trim().min(min).max(max);
export const op = (max) => z.string().trim().max(max).optional().nullable();
export const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD");
export const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competência no formato AAAA-MM");
export const email = z.string().trim().toLowerCase().email().max(160);
export const senha = z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(200);
export const documentoFiscal = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine(cnpjValido, "CNPJ ou CPF inválido");
export const centavos = z.number().int().min(0).max(10_000_000_000);
export const fone = z
  .string()
  .trim()
  .max(30)
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "WhatsApp com DDD (ex.: 34 99999-0000)")
  .optional()
  .nullable();

export function validar(esquema, dados) {
  const r = esquema.safeParse(dados ?? {});
  if (!r.success) falha(400, r.error.issues.map((i) => `${i.path.join(".") || "dados"}: ${i.message}`).join("; "));
  return r.data;
}

export const usuarioPublico = ({ senha_hash, ...u }) => ({ ...u, ativo: Boolean(u.ativo), nexor: Boolean(u.nexor) });
export const portalPublico = ({ senha_hash, convite_hash, ...p }) => ({ ...p, ativo: Boolean(p.ativo), convite_pendente: !senha_hash });

/** Configuração do escritório sem os segredos (tokens viram só "configurado: sim/não") */
export function escritorioPublico(e) {
  const { whatsapp = {}, email: em = {}, ...resto } = e.config;
  const { token_cripto, segredo_cripto, ...w } = whatsapp;
  const { chave_cripto, ...m } = em;
  return { ...e, config: { ...resto, whatsapp: { ...w, token: Boolean(token_cripto), segredo: Boolean(segredo_cripto) }, email: { ...m, chave: Boolean(chave_cripto) } } };
}

export function nomeArquivo(req, padrao) {
  try {
    return decodeURIComponent(String(req.headers["x-nome"] ?? padrao)).replace(/[\\/\0]/g, "_").slice(0, 160) || padrao;
  } catch {
    return padrao;
  }
}

/** Entrega um arquivo guardado: PDF e imagem abrem no navegador, o resto baixa; sempre em sandbox */
export function enviarArquivo(res, a, { baixar = false } = {}) {
  const seguro = !baixar && /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(a.mime ?? "");
  res.writeHead(200, {
    "Content-Type": seguro ? a.mime : "application/octet-stream",
    "Content-Length": a.dados.length,
    "Content-Disposition": `${seguro ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
  });
  res.end(a.dados);
}
