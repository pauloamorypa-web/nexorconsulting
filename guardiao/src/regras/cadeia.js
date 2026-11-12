/* Cadeias de hashes: trechos (uma cadeia por câmera) e auditoria (uma por conta e uma da operação).
   Cada elo guarda o hash do elo anterior; mexer, cortar ou remover qualquer elo quebra a conta dos seguintes. */

import { createHash } from "node:crypto";

export const GENESE = "0".repeat(64);
const h = (texto) => createHash("sha256").update(texto).digest("hex");

/** Hash do elo de um trecho: amarra posição, câmera, horários, tamanho e o SHA-256 do arquivo cifrado ao elo anterior */
export const hashTrecho = (t) => h(["trecho/v1", t.hash_anterior, t.camera_id, t.seq, t.inicio, t.fim, t.tamanho, t.sha256].join("|"));

/** Hash de um registro de auditoria */
export const hashAuditoria = (a) => h(["auditoria/v1", a.hash_anterior, a.cadeia, a.criado_em, a.ator_id ?? "", a.ator_nome ?? "", a.ator_perfil ?? "", a.acao, JSON.stringify(a.detalhe ?? null), a.ip ?? ""].join("|"));

/**
 * Confere a cadeia de uma câmera a partir das linhas (em ordem de seq). Devolve { integra, total, problemas: [{ seq, tipo }] }.
 * Tipos: "sequencia" (falta um elo: remoção), "elo" (hash anterior não bate: troca ou corte), "hash" (conteúdo do elo alterado),
 * "topo" (o último elo não é o que a câmera registra: remoção no final).
 */
export function conferirCadeia(trechos, camera) {
  const problemas = [];
  let anterior = GENESE;
  let esperado = 1;
  for (const t of trechos) {
    if (t.seq !== esperado) problemas.push({ seq: esperado, tipo: "sequencia" });
    else if (t.hash_anterior !== anterior) problemas.push({ seq: t.seq, tipo: "elo" });
    if (hashTrecho(t) !== t.hash_cadeia) problemas.push({ seq: t.seq, tipo: "hash" });
    anterior = t.hash_cadeia;
    esperado = t.seq + 1;
    if (problemas.length >= 50) break;
  }
  if (camera && problemas.length < 50 && (camera.cadeia_seq !== esperado - 1 || (camera.cadeia_topo ?? GENESE) !== anterior)) problemas.push({ seq: camera.cadeia_seq, tipo: "topo" });
  return { integra: problemas.length === 0, total: trechos.length, problemas };
}

export function conferirAuditoria(linhas) {
  let anterior = GENESE;
  for (const a of linhas) {
    if (a.hash_anterior !== anterior || hashAuditoria(a) !== a.hash) return { integra: false, total: linhas.length, quebra_em: a.id };
    anterior = a.hash;
  }
  return { integra: true, total: linhas.length };
}
