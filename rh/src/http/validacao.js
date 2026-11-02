/* Validação dos dados recebidos (zod), CPF/CNPJ e versões públicas dos registros. */

import { z } from "zod";
import { falha } from "./roteador.js";

export const COOKIE_PAINEL = "nx_rh";
export const COOKIE_APP = "nx_app";

/* ---------- Validação ---------- */
export const t = (max, min = 1) => z.string().trim().min(min).max(max);
export const op = (max) => z.string().trim().max(max).optional().nullable();
export const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD");
export const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competência no formato AAAA-MM");
export const horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horário no formato hh:mm");
export const cpf = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine(cpfValido, "CPF inválido");
export const email = z.string().trim().toLowerCase().email().max(160);
export const senha = z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(200);
export const centavos = z.number().int().min(0).max(1_000_000_000);

export function validar(esquema, dados) {
  const r = esquema.safeParse(dados ?? {});
  if (!r.success) falha(400, r.error.issues.map((i) => `${i.path.join(".") || "dados"}: ${i.message}`).join("; "));
  return r.data;
}

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

export function cnpjValido(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((a, p, i) => a + Number(d[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Empresa sem segredos (certificado) para mandar ao navegador */
export function empresaPublica(e) {
  const { certificado, ...config } = e.config ?? {};
  return { ...e, config: { ...config, certificado: certificado ? { titular: certificado.titular, valido_ate: certificado.valido_ate, enviado_em: certificado.enviado_em } : null } };
}

export const usuarioPublico = ({ senha_hash, ...u }) => ({ ...u, ativo: Boolean(u.ativo) });

