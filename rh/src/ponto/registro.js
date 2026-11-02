/* Registro de marcações (REP-P, Portaria MTP nº 671/2021): cada marcação recebe um NSR (número sequencial de
   registro) único na empresa e um hash SHA-256 encadeado ao anterior. Marcações nunca são apagadas nem
   alteradas: correções viram ajustes (inclusões ou desconsiderações) que preservam o registro original. */

import { createHash } from "node:crypto";

const sha256 = (t) => createHash("sha256").update(t).digest("hex");

/** Data e hora no formato dos arquivos oficiais: AAAA-MM-ddThh:mm:00-0300 */
export function dataHoraOficial(ms) {
  const l = new Date(ms - 3 * 3600_000).toISOString();
  return `${l.slice(0, 16)}:00-0300`;
}

/** Conteúdo do registro tipo 7 (sem o hash), base do hash encadeado */
export const conteudoRegistro = (m, cpf) =>
  `${String(m.nsr).padStart(9, "0")}7${dataHoraOficial(m.momento)}${cpf.padStart(12, "0")}${dataHoraOficial(m.criado_em)}${m.coletor}${m.online ? "0" : "1"}`;

export const hashRegistro = (conteudo, hashAnterior) => sha256(conteudo + (hashAnterior ?? ""));

export class ErroMarcacao extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

/**
 * Grava uma marcação. Recusa batidas repetidas em menos de 1 minuto (toque duplo).
 * @returns a marcação gravada
 */
export function registrarMarcacao(repo, { empresa_id, colaborador, origem, coletor = "01", lat, lng, precisao, distancia_m, estabelecimento_id, biometria = false, qr = false, online = true, ip, aparelho, agora = Date.now() }) {
  if (colaborador.status === "desligado") throw new ErroMarcacao("Colaborador desligado não pode registrar ponto.", 403);
  const ultima = repo.um("SELECT momento FROM marcacoes WHERE colaborador_id = ? ORDER BY momento DESC LIMIT 1", colaborador.id);
  if (ultima && agora - ultima.momento < 60_000) throw new ErroMarcacao("Ponto já registrado há menos de 1 minuto.", 409);
  return repo.transacao(() => {
    const { nsr, ultimo_hash } = repo.proximoNsr(empresa_id);
    const base = { nsr, momento: agora, criado_em: agora, coletor, online };
    const hash = hashRegistro(conteudoRegistro(base, colaborador.cpf), ultimo_hash);
    const m = repo.inserir("marcacoes", {
      empresa_id,
      colaborador_id: colaborador.id,
      nsr,
      momento: agora,
      criado_em: agora,
      origem,
      coletor,
      lat,
      lng,
      precisao,
      distancia_m,
      estabelecimento_id,
      biometria,
      qr,
      online,
      ip,
      aparelho,
      hash,
      hash_anterior: ultimo_hash ?? null,
    });
    repo.gravarUltimoHash(empresa_id, hash);
    return m;
  });
}

/** Confere a cadeia de hashes da empresa: devolve o primeiro NSR adulterado, se houver */
export function conferirCadeia(repo, empresa_id) {
  const lista = repo.todos("SELECT m.*, c.cpf FROM marcacoes m JOIN colaboradores c ON c.id = m.colaborador_id WHERE m.empresa_id = ? ORDER BY m.nsr", empresa_id);
  let anterior = null;
  for (const m of lista) {
    const esperado = hashRegistro(conteudoRegistro({ ...m, online: Boolean(m.online) }, m.cpf), anterior);
    if (esperado !== m.hash || (m.hash_anterior ?? null) !== anterior) return { ok: false, nsr: m.nsr, total: lista.length };
    anterior = m.hash;
  }
  return { ok: true, total: lista.length };
}

/** Comprovante de registro de ponto do trabalhador (Portaria 671) */
export function comprovante({ empresa, estabelecimento, colaborador, marcacao, registroInpi }) {
  return {
    titulo: "Comprovante de Registro de Ponto do Trabalhador",
    empregador: empresa.razao_social,
    cnpj: empresa.cnpj,
    local: estabelecimento?.nome ?? "Registro remoto",
    trabalhador: colaborador.nome,
    cpf: colaborador.cpf,
    data_hora: dataHoraOficial(marcacao.momento),
    nsr: String(marcacao.nsr).padStart(9, "0"),
    registro_rep_p: registroInpi || "não informado",
    codigo: marcacao.hash,
  };
}
