/* Geração automática: tarefas de obrigações por cliente e competência, e pendências de documentos do mês.
   Tudo é idempotente (índices únicos): rodar de novo não duplica nada. */

import { DOCUMENTOS_PADRAO, OBRIGACOES_PADRAO } from "./catalogo.js";
import { ajustar, competenciaAnterior, enesimoDiaUtil, somarDias, somarMeses, ultimoDia, ultimoDiaUtil } from "./datas.js";

const dia2 = (n) => String(n).padStart(2, "0");

/** A obrigação se aplica a esta competência? (trimestrais só em mar/jun/set/dez; anuais só em dezembro) */
export function aplicaNaCompetencia(o, competencia) {
  const mes = Number(competencia.slice(5, 7));
  if (o.periodicidade === "trimestral") return mes % 3 === 0;
  if (o.periodicidade === "anual") return mes === 12;
  return true;
}

/** Vencimento legal da obrigação para a competência */
export function prazoLegal(o, competencia) {
  const r = o.regra ?? {};
  const alvo = o.periodicidade === "anual" ? `${Number(competencia.slice(0, 4)) + 1}-${dia2(r.mes_fixo ?? 12)}` : somarMeses(competencia, r.mes ?? 1);
  if (r.tipo === "ultimo_dia_util") return ultimoDiaUtil(alvo);
  if (r.tipo === "dia_util") return enesimoDiaUtil(alvo, Math.max(1, r.dia ?? 1));
  const d = Math.min(Math.max(1, r.dia ?? 20), ultimoDia(alvo));
  return ajustar(`${alvo}-${dia2(d)}`, r.ajuste ?? "antecipa");
}
export const prazoInterno = (prazo, antecedencia) => ajustar(somarDias(prazo, -Math.max(0, antecedencia ?? 0)), "antecipa");

export function obrigacaoServe(o, cliente) {
  if (!o.ativo || !o.regimes.includes(cliente.regime)) return false;
  for (const [k, v] of Object.entries(o.condicao ?? {})) if (Boolean(cliente[k]) !== Boolean(v)) return false;
  return true;
}

/** Copia os catálogos padrão para um escritório novo */
export function semearEscritorio(repo, empresa_id) {
  for (const o of OBRIGACOES_PADRAO) repo.inserirSeNovo("obrigacoes", { empresa_id, codigo: o.codigo, nome: o.nome, departamento: o.departamento, regimes: o.regimes, condicao: o.condicao ?? null, periodicidade: o.periodicidade, regra: o.regra, antecedencia: o.antecedencia ?? 3 });
}

/** Documentos esperados padrão de um cliente novo (conforme regime e funcionários) */
export function semearEsperados(repo, cliente) {
  const lista = [...(DOCUMENTOS_PADRAO[cliente.regime] ?? []), ...(cliente.tem_funcionarios ? DOCUMENTOS_PADRAO.funcionarios : [])];
  for (const d of lista) repo.inserir("esperados", { empresa_id: cliente.empresa_id, cliente_id: cliente.id, nome: d.nome, tipo: d.tipo, dia_limite: d.dia_limite, departamento: d.departamento });
}

/**
 * Cria as tarefas que faltam. Sem competência, usa a do mês anterior (e as anuais do ano anterior) e só cria
 * tarefas ainda no prazo (cliente novo não começa com obrigação vencida). Com competência, cria todas.
 */
export function gerarTarefas(repo, empresa_id, hoje, { competencia, cliente_id } = {}) {
  const obrigs = repo.lista("obrigacoes", "WHERE empresa_id = ? AND ativo = 1", empresa_id);
  const clientes = repo.lista("clientes", `WHERE empresa_id = ? AND ativo = 1${cliente_id ? " AND id = ?" : ""}`, empresa_id, ...(cliente_id ? [cliente_id] : []));
  const comps = competencia ? [competencia] : [competenciaAnterior(hoje), `${Number(hoje.slice(0, 4)) - 1}-12`];
  let criadas = 0;
  for (const c of clientes)
    for (const o of obrigs) {
      if (!obrigacaoServe(o, c)) continue;
      for (const comp of new Set(comps)) {
        if (!aplicaNaCompetencia(o, comp)) continue;
        if (o.periodicidade !== "anual" && !competencia && comp !== competenciaAnterior(hoje)) continue;
        const legal = prazoLegal(o, comp);
        if (!competencia && legal < hoje) continue;
        const t = repo.inserirSeNovo("tarefas", { empresa_id, cliente_id: c.id, obrigacao_id: o.id, competencia: comp, nome: o.nome, departamento: o.departamento, responsavel_id: c.responsavel_id ?? null, prazo_legal: legal, prazo_interno: prazoInterno(legal, o.antecedencia) });
        if (t) criadas++;
      }
    }
  return criadas;
}

/** Cria as pendências de documentos do mês (competência anterior; variáveis de folha: mês atual) */
export function gerarPendencias(repo, empresa_id, hoje, { competencia, cliente_id } = {}) {
  const esperados = repo.todos(`SELECT e.* FROM esperados e JOIN clientes c ON c.id = e.cliente_id WHERE e.empresa_id = ? AND e.ativo = 1 AND c.ativo = 1${cliente_id ? " AND c.id = ?" : ""}`, empresa_id, ...(cliente_id ? [cliente_id] : []));
  let criadas = 0;
  for (const e of esperados) {
    const mesAtual = e.tipo === "folha";
    const comp = competencia ?? (mesAtual ? hoje.slice(0, 7) : competenciaAnterior(hoje));
    const mesPrazo = mesAtual ? comp : somarMeses(comp, 1);
    const prazo = `${mesPrazo}-${dia2(Math.min(Math.max(1, e.dia_limite), ultimoDia(mesPrazo)))}`;
    const p = repo.inserirSeNovo("pendencias", { empresa_id, cliente_id: e.cliente_id, esperado_id: e.id, competencia: comp, nome: e.nome, tipo: e.tipo, prazo });
    if (p) criadas++;
  }
  return criadas;
}
