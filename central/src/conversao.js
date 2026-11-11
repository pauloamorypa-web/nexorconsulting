/* Conversão offline: avisa a Blue (ou outro webhook) quando um cliente ativa o teste de 30 dias e quando vira contrato,
   para a Blue devolver o evento ao Meta (API de Conversões) e ao Google (conversão offline) com a campanha de origem.

   - Fila no banco (tabela conversoes, em db.js), com novas tentativas e espera crescente quando o destino está fora.
   - Idempotência: um evento por cliente e tipo (UNIQUE cliente_id + evento). Reprocessar não duplica.
   - LGPD: só sai o e-mail e o telefone em hash SHA-256 (o mesmo formato que o Meta pede), os valores e o produto.
     Nome, CNPJ, razão social e o id interno do cliente não saem da Central. */

import { createHash } from "node:crypto";
import { PLANOS, comDesconto } from "./planos.js";

export const EVENTOS = ["teste_ativado", "contrato_fechado"];
const MAX_TENTATIVAS = 10;

const sha = (v) => createHash("sha256").update(v).digest("hex");
/** E-mail normalizado (minúsculas, sem espaços) em SHA-256. */
export const hashEmail = (v) => {
  const e = String(v ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? sha(e) : undefined;
};
/** Telefone só com dígitos e DDI 55 (quando vier sem) em SHA-256. Igual ao agent/src/meta.js. */
export const hashTelefone = (v) => {
  const t = String(v ?? "").replace(/\D/g, "");
  return t.length >= 10 ? sha(t.length <= 11 ? `55${t}` : t) : undefined;
};

const reais = (centavos) => Math.round(Number(centavos) || 0) / 100;
/** Mensalidade de referência do produto no teste: a menor mensalidade (ou mínimo) do catálogo. */
export function valorReferencia(produto) {
  const valores = (PLANOS[produto]?.planos ?? []).map((p) => p.mensal ?? p.minimo ?? 0).filter((v) => v > 0);
  return valores.length ? Math.min(...valores) : 0;
}
/** Mensalidade efetiva do cliente (com o desconto vigente). */
export const mensalidadeEfetiva = (c) => (c.desconto_pct > 0 ? comDesconto(c.valor_centavos, c.desconto_pct) : c.valor_centavos);

export function criarConversao({ repo, cfg, fetchFn = fetch, agora = () => Date.now() }) {
  const ativo = Boolean(cfg.conversao?.url && cfg.conversao?.token);
  let emCurso = null;

  /** Põe o evento na fila (uma vez por cliente e tipo) e tenta enviar em seguida. Devolve true se entrou agora. */
  function registrar(cliente, evento, { mensal_centavos = 0, implantacao_centavos = 0 } = {}) {
    if (!ativo || !EVENTOS.includes(evento) || !cliente) return false;
    if (repo.um("SELECT 1 FROM conversoes WHERE cliente_id = ? AND evento = ?", cliente.id, evento)) return false;
    const mensal = reais(mensal_centavos);
    const implantacao = reais(implantacao_centavos);
    const dados = {
      evento,
      quando: new Date(agora()).toISOString(),
      produto: cliente.produto ?? null,
      plano: evento === "contrato_fechado" ? cliente.plano_id ?? null : null,
      mensalidade: mensal,
      implantacao,
      // Valor do evento: no teste, a mensalidade de referência; no contrato, 1ª mensalidade + implantação
      valor: Math.round((mensal + implantacao) * 100) / 100,
      moeda: "BRL",
      em: hashEmail(cliente.email),
      ph: hashTelefone(cliente.telefone),
    };
    try {
      repo.inserir("conversoes", { cliente_id: cliente.id, evento, dados: JSON.stringify(dados), proxima_em: agora() });
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) return false;
      throw e;
    }
    processar().catch((e) => console.error("[conversao]", e.message ?? e));
    return true;
  }

  async function enviar(item) {
    const corpo = { id: item.id, ...JSON.parse(item.dados) };
    try {
      const r = await fetchFn(cfg.conversao.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.conversao.token}`, "User-Agent": "nexor-central" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`destino respondeu ${r.status}`);
      repo.atualizar("conversoes", item.id, { status: "enviada", enviado_em: agora(), erro: null, tentativas: item.tentativas + 1 });
      return true;
    } catch (e) {
      const tentativas = item.tentativas + 1;
      // Espera crescente: 1, 2, 4, 8... minutos, no máximo 6 horas. Depois de 10 tentativas, fica como "falhou".
      const espera = Math.min(6 * 3600_000, 60_000 * 2 ** (tentativas - 1));
      repo.atualizar("conversoes", item.id, { status: tentativas >= MAX_TENTATIVAS ? "falhou" : "pendente", tentativas, proxima_em: agora() + espera, erro: String(e.message ?? e).slice(0, 300) });
      return false;
    }
  }

  /** Envia o que está pendente e no horário. Chamadas simultâneas esperam a mesma rodada (não envia duas vezes). */
  function processar() {
    if (!ativo) return Promise.resolve({ enviadas: 0, falhas: 0 });
    emCurso ??= (async () => {
      let enviadas = 0;
      let falhas = 0;
      for (const item of repo.todos("SELECT * FROM conversoes WHERE status = 'pendente' AND proxima_em <= ? ORDER BY criado_em LIMIT 50", agora())) {
        if (await enviar(item)) enviadas++;
        else falhas++;
      }
      return { enviadas, falhas };
    })().finally(() => (emCurso = null));
    return emCurso;
  }

  /** Volta um evento que falhou para a fila (botão "tentar de novo" ou depois de corrigir a URL/token). */
  const reenviar = (id) => repo.rodar("UPDATE conversoes SET status = 'pendente', tentativas = 0, proxima_em = ?, atualizado_em = ? WHERE id = ? AND status = 'falhou'", agora(), agora(), id).changes > 0;

  const listar = () =>
    repo.todos("SELECT x.id, x.cliente_id, x.evento, x.status, x.tentativas, x.erro, x.enviado_em, x.criado_em, COALESCE(c.nome_fantasia, c.razao_social) cliente FROM conversoes x LEFT JOIN clientes c ON c.id = x.cliente_id ORDER BY x.criado_em DESC LIMIT 200");

  return { ativo, registrar, processar, reenviar, listar };
}
