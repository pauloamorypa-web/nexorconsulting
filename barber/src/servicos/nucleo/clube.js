/* Clube de assinatura: cobertura, ciclos, assinar, pagamentos (balcão e Asaas), cancelamento, estorno e webhook.
   Parte do núcleo (criarNucleo em ../nucleo.js): recebe o espaço comum nx e acrescenta as suas funções nele. */

import { z } from "zod";
import { faz } from "../../regras/agenda.js";
import { cicloDe, cicloNoDia, cobertura, pagoAte } from "../../regras/clube.js";
import { quando, somarDias, somarMeses } from "../../regras/datas.js";
import { acaoAsaas } from "../canais.js";
import { recusar } from "./comum.js";

export function criarClube(nx) {
  const { repo, agora } = nx;
  const canais = (...a) => nx.canais(...a);
  const exigirBarbearia = (...a) => nx.exigirBarbearia(...a);
  const hoje = (...a) => nx.hoje(...a);
  const linkApp = (...a) => nx.linkApp(...a);
  const notificar = (...a) => nx.notificar(...a);

  /** O ciclo guardado passou e o período seguinte já está pago: avança para o ciclo de hoje (a contagem de usos recomeça) */
  function virarCiclo(a) {
    if (!a?.ciclo_fim || a.ciclo_fim >= hoje() || !(pagoAte(a) >= hoje())) return a;
    return repo.atualizar("assinaturas", a.id, cicloNoDia(a, hoje()));
  }
  function assinaturaAtual(clienteId) {
    return virarCiclo(repo.lista("assinaturas", "WHERE cliente_id = ? AND status IN ('ativa','atrasada','pendente') ORDER BY criado_em DESC LIMIT 1", clienteId)[0] ?? null);
  }
  /** Usos do serviço no ciclo que contém o dia (padrão: hoje) */
  const usosNoCiclo = (a, servicoId, dia = hoje()) => {
    const c = cicloNoDia(a, dia);
    return c ? repo.um("SELECT COUNT(*) n FROM usos WHERE assinatura_id = ? AND servico_id = ? AND ciclo_inicio = ?", a.id, servicoId, c.ciclo_inicio).n : 0;
  };

  /** O clube cobre este serviço neste dia para o cliente? */
  function coberturaDoCliente(clienteId, servicoId, dia) {
    const a = assinaturaAtual(clienteId);
    if (!a) return { coberto: false, assinatura: null };
    const plano = repo.obter("planos", a.plano_id);
    return { ...cobertura(plano, a, servicoId, dia, usosNoCiclo(a, servicoId, dia)), assinatura: a, plano };
  }

  /**
   * Identifica o cliente como assinante para um serviço num dia: plano, situação, se o horário sai pelo clube,
   * quantos usos restam e, quando não cobre, o motivo e o link para pagar a mensalidade.
   */
  function identificarAssinante(clienteId, servicoId = null, dia = hoje()) {
    const a = assinaturaAtual(clienteId);
    if (!a) return { assinante: false };
    const plano = repo.obter("planos", a.plano_id);
    const r = { assinante: true, status: a.status, plano: { id: plano.id, nome: plano.nome, desconto_produtos: plano.desconto_produtos }, ciclo_fim: a.ciclo_fim, coberto: false, restante: null, motivo: null, link: a.status !== "ativa" ? a.link : null };
    if (!servicoId) return r;
    const cob = cobertura(plano, a, servicoId, dia, usosNoCiclo(a, servicoId, dia));
    const noPlano = (plano.itens ?? []).some((i) => i.servico_id === servicoId);
    if (cob.coberto) return { ...r, coberto: true, restante: cob.restante ?? null };
    if (a.status === "pendente") return { ...r, motivo: "Sua assinatura ainda aguarda o primeiro pagamento." };
    return { ...r, motivo: cob.motivo ?? (noPlano ? null : "Este serviço não faz parte do seu plano.") };
  }


  /* ---------- Clube de assinatura ---------- */
  /** Trava por cliente: dois "assinar" ao mesmo tempo não criam duas assinaturas (nem duas cobranças no Asaas) */
  const assinando = new Set();
  async function assinar(dados) {
    const id = dados.cliente.id;
    if (assinando.has(id)) recusar(409, "Já estamos gerando esta assinatura. Aguarde um instante.");
    assinando.add(id);
    try {
      return await assinarTravado(dados);
    } finally {
      assinando.delete(id);
    }
  }

  async function assinarTravado({ cliente, planoId, cpf = null, autor, pagoAgora = null }) {
    const b = exigirBarbearia();
    const plano = repo.obter("planos", planoId);
    if (!plano?.ativo) recusar(404, "Plano não encontrado.");
    const { asaas } = canais(b);
    const atual = assinaturaAtual(cliente.id);
    if (atual && atual.status !== "pendente") recusar(409, "Este cliente já tem uma assinatura. Cancele a atual para trocar de plano.");
    if (atual && atual.plano_id === plano.id) {
      // A mesma assinatura pendente (com o mesmo link de pagamento), em vez de criar outra
      if (pagoAgora) return registrarPagamento(atual, { forma: pagoAgora, autor });
      if (!asaas.ativo || atual.asaas_assinatura) return atual;
    }
    if (asaas.ativo && !pagoAgora && !cpf) recusar(400, "Informe o CPF para gerar a cobrança.");
    if (atual) {
      // Trocou de plano antes de pagar: a cobrança anterior para no Asaas antes de nascer a nova
      if (atual.asaas_assinatura && asaas.ativo) {
        try {
          await asaas.cancelar(atual.asaas_assinatura);
        } catch (e) {
          console.error("[asaas] cancelar pendente", e.message);
          recusar(502, "Não foi possível cancelar a cobrança anterior no Asaas. Tente de novo em instantes.");
        }
      }
      repo.atualizar("assinaturas", atual.id, { status: "cancelada", cancelada_em: agora() });
      repo.auditar(b.id, autor, "assinatura_substituida", { assinatura: atual.id });
    }
    let a = repo.inserir("assinaturas", { barbearia_id: b.id, cliente_id: cliente.id, plano_id: plano.id, status: "pendente", cpf });
    repo.auditar(b.id, autor, "assinatura_criada", { assinatura: a.id, plano: plano.nome });
    if (pagoAgora) return registrarPagamento(a, { forma: pagoAgora, autor });
    if (asaas.ativo) {
      try {
        const clienteAsaas = await asaas.criarCliente({ cliente, cpf });
        a = repo.atualizar("assinaturas", a.id, { asaas_cliente: clienteAsaas });
        const assinaturaAsaas = await asaas.criarAssinatura({ clienteAsaas, plano, assinaturaId: a.id, vencimento: hoje() });
        a = repo.atualizar("assinaturas", a.id, { asaas_assinatura: assinaturaAsaas });
        const p = await asaas.primeiroPagamento(assinaturaAsaas);
        a = repo.atualizar("assinaturas", a.id, { link: p?.link ?? null });
        if (p && !repo.um("SELECT 1 FROM cobrancas WHERE externo_id = ?", p.id)) repo.inserir("cobrancas", { barbearia_id: b.id, assinatura_id: a.id, valor_centavos: p.valor || plano.preco_centavos, vencimento: p.vencimento ?? hoje(), externo_id: p.id, link: p.link });
      } catch (e) {
        // Se a assinatura já nasceu no Asaas, ela é cancelada lá também (senão o cliente seria cobrado sem registro aqui)
        repo.atualizar("assinaturas", a.id, { status: "cancelada", cancelada_em: agora() });
        await cancelarNoAsaas(repo.obter("assinaturas", a.id));
        console.error("[asaas] gerar cobrança", e.message);
        recusar(502, "Não foi possível gerar a cobrança agora. Tente de novo em alguns minutos ou fale com a barbearia.");
      }
    }
    return a;
  }

  /**
   * Período que um pagamento novo cobre: o mês seguinte ao último já pago (adiantado ou atrasado dentro do mês);
   * sem período anterior, ou com mais de um mês sem pagar, começa hoje.
   */
  function proximoPeriodo(atual) {
    const pa = pagoAte(atual);
    if (atual.ciclo_inicio && pa && ["ativa", "atrasada"].includes(atual.status)) {
      const prox = cicloDe(somarDias(pa, 1));
      if (prox.ciclo_fim >= hoje()) return prox;
    }
    return cicloDe(hoje());
  }

  /** Pagamento confirmado (balcão ou Asaas): ativa ou renova. O ciclo atual só muda quando o período pago começa. */
  function registrarPagamento(a, { forma = "outro", autor, externoId = null, valor = null }) {
    const b = exigirBarbearia();
    return repo.transacao(() => {
      const plano = repo.obter("planos", a.plano_id);
      const atual = repo.obter("assinaturas", a.id);
      const ciclo = proximoPeriodo(atual);
      const vigente = ciclo.ciclo_inicio <= hoje() ? ciclo : cicloNoDia(atual, hoje());
      let cob = externoId ? repo.um("SELECT * FROM cobrancas WHERE externo_id = ?", externoId) : null;
      // Já processado (pago antes, mesmo que estornado depois): webhook repetido não renova de novo
      if (cob?.pago_em) return atual;
      if (cob) repo.rodar("UPDATE cobrancas SET status = 'paga', pago_em = ?, forma = ?, registrado_por = ?, ciclo_inicio = ?, ciclo_fim = ? WHERE id = ?", agora(), forma, autor ?? null, ciclo.ciclo_inicio, ciclo.ciclo_fim, cob.id);
      else repo.inserir("cobrancas", { barbearia_id: b.id, assinatura_id: a.id, valor_centavos: valor ?? plano.preco_centavos, vencimento: hoje(), status: "paga", forma, externo_id: externoId, pago_em: agora(), registrado_por: autor ?? null, ...ciclo });
      repo.auditar(b.id, autor, "assinatura_paga", { assinatura: a.id, forma, ciclo });
      return repo.atualizar("assinaturas", a.id, { status: "ativa", ...vigente, pago_ate: ciclo.ciclo_fim });
    });
  }

  /**
   * Pagamento registrado pela equipe no balcão. Protegido contra envio duplo:
   * - chave de idempotência do painel (o mesmo pedido reenviado devolve o resultado sem registrar de novo);
   * - sem chave, recusa um 2º pagamento manual da mesma assinatura em poucos minutos;
   * - com Asaas, dá baixa na cobrança aberta lá (receiveInCash) em vez de criar outra aqui.
   */
  const emPagamento = new Set();
  const JANELA_PAGAMENTO = 5 * 60_000;
  async function pagamentoManual(a, { forma, autor, chave = null }) {
    const b = exigirBarbearia();
    const externoChave = chave ? `manual:${chave}` : null;
    if (externoChave && repo.um("SELECT 1 FROM cobrancas WHERE externo_id = ? AND pago_em IS NOT NULL", externoChave)) return repo.obter("assinaturas", a.id);
    if (emPagamento.has(a.id)) recusar(409, "Este pagamento já está sendo registrado.");
    const atual = repo.obter("assinaturas", a.id);
    if (atual.status === "cancelada") recusar(409, "Assinatura cancelada.");
    const recente = repo.um("SELECT 1 FROM cobrancas WHERE assinatura_id = ? AND pago_em > ? AND registrado_por IS NOT NULL AND registrado_por <> 'Asaas'", a.id, agora() - JANELA_PAGAMENTO);
    if (recente) recusar(409, "Já foi registrado um pagamento desta assinatura há poucos minutos. Confira a lista antes de registrar de novo.");
    const { asaas } = canais(b);
    const aberta = atual.asaas_assinatura ? repo.um("SELECT * FROM cobrancas WHERE assinatura_id = ? AND status = 'aberta' AND pago_em IS NULL AND externo_id IS NOT NULL AND externo_id NOT LIKE 'manual:%' ORDER BY vencimento LIMIT 1", a.id) : null;
    emPagamento.add(a.id);
    try {
      if (aberta && asaas.ativo) {
        try {
          await asaas.receberEmDinheiro(aberta.externo_id, { data: hoje(), valorCentavos: aberta.valor_centavos });
        } catch (e) {
          console.error("[asaas] baixa manual", e.message);
          recusar(502, "Não foi possível dar baixa na cobrança do Asaas agora. Nada foi registrado; tente de novo em instantes.");
        }
        return registrarPagamento(atual, { forma, autor, externoId: aberta.externo_id, valor: aberta.valor_centavos });
      }
      return registrarPagamento(atual, { forma, autor, externoId: externoChave });
    } finally {
      emPagamento.delete(a.id);
    }
  }

  /**
   * Cancela a assinatura no Asaas. Se não der (Asaas fora ou chave removida), marca cancelamento_pendente e a
   * rotina tenta de novo; o cliente nunca fica sendo cobrado lá sem ninguém saber. 404 = já não existe lá.
   */
  async function cancelarNoAsaas(a) {
    if (!a.asaas_assinatura) return true;
    const b = exigirBarbearia();
    const { asaas } = canais(b);
    try {
      if (!asaas.ativo) throw new Error("Asaas desligado nesta barbearia");
      await asaas.cancelar(a.asaas_assinatura);
    } catch (e) {
      if (e.statusExterno !== 404) {
        console.error("[asaas] cancelar assinatura", a.asaas_assinatura, e.message);
        if (!repo.obter("assinaturas", a.id).cancelamento_pendente) repo.auditar(b.id, "sistema", "cancelamento_asaas_pendente", { assinatura: a.id, erro: String(e.message).slice(0, 200) });
        repo.atualizar("assinaturas", a.id, { cancelamento_pendente: 1 });
        return false;
      }
    }
    repo.atualizar("assinaturas", a.id, { cancelamento_pendente: 0 });
    return true;
  }

  async function cancelarAssinatura(a, { autor }) {
    if (a.status === "cancelada") recusar(409, "Assinatura já cancelada.");
    const b = exigirBarbearia();
    repo.atualizar("assinaturas", a.id, { status: "cancelada", cancelada_em: agora() });
    repo.auditar(b.id, autor, "assinatura_cancelada", { assinatura: a.id });
    await cancelarNoAsaas(a);
    return repo.obter("assinaturas", a.id);
  }

  /** Formato mínimo de um evento de cobrança do Asaas (o resto do payload é ignorado) */
  const valorAsaas = z.union([z.number(), z.string().regex(/^\d+(\.\d+)?$/).transform(Number)]).pipe(z.number().positive().max(1_000_000));
  const ESQ_PAGAMENTO_ASAAS = z.object({
    id: z.string().min(1).max(100),
    subscription: z.string().max(100).optional().nullable(),
    value: valorAsaas.optional().nullable(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    invoiceUrl: z.string().max(500).optional().nullable(),
    billingType: z.string().max(40).optional().nullable(),
  });
  const ignorar = (motivo, evento) => {
    console.warn("[asaas] webhook ignorado:", motivo, String(evento?.event ?? "").slice(0, 60), String(evento?.payment?.id ?? "").slice(0, 60));
    return { ignorado: true, motivo };
  };

  /** Webhook do Asaas: paga, atrasada, estornada, cancelada ou nova cobrança da assinatura */
  function eventoAsaas(evento) {
    const acao = acaoAsaas(evento?.event);
    if (!acao || !evento?.payment) return { ignorado: true };
    // Evento malformado responde 200 com "ignorado" (um 500 repetido faz o Asaas pausar a fila de webhooks)
    const lido = ESQ_PAGAMENTO_ASAAS.safeParse(evento.payment);
    if (!lido.success) return ignorar("evento malformado", evento);
    const p = lido.data;
    const a = p.subscription ? repo.um("SELECT * FROM assinaturas WHERE asaas_assinatura = ?", p.subscription) : null;
    if (!a) return { ignorado: true };
    const b = exigirBarbearia();
    const valor = p.value ? Math.round(p.value * 100) : null;
    if (acao === "nova") {
      if (!valor || !p.dueDate) return ignorar("cobrança sem valor ou vencimento", evento);
      if (!repo.um("SELECT 1 FROM cobrancas WHERE externo_id = ?", p.id)) repo.inserir("cobrancas", { barbearia_id: b.id, assinatura_id: a.id, valor_centavos: valor, vencimento: p.dueDate, externo_id: p.id, link: p.invoiceUrl ?? null });
      repo.atualizar("assinaturas", a.id, { link: p.invoiceUrl ?? a.link });
      return { ok: true };
    }
    if (acao === "paga" && a.status === "cancelada") return pagamentoDeCancelada(a, { ...p, value: p.value ?? null });
    if (acao === "paga") {
      registrarPagamento(repo.ler("assinaturas", a), { forma: String(p.billingType ?? "asaas").toLowerCase(), autor: "Asaas", externoId: p.id, valor });
      return { ok: true };
    }
    if (acao === "atrasada" && a.status !== "cancelada") {
      // Fora de ordem: a cobrança já foi paga, ou o período pago ainda cobre hoje (V-18)
      if (repo.um("SELECT 1 FROM cobrancas WHERE externo_id = ? AND pago_em IS NOT NULL", p.id)) return { ignorado: true, motivo: "cobrança já paga" };
      if (a.status === "ativa" && pagoAte(a) && pagoAte(a) >= hoje()) return { ignorado: true, motivo: "período pago cobre hoje" };
      repo.atualizar("assinaturas", a.id, { status: "atrasada", link: p.invoiceUrl ?? a.link });
      const cliente = repo.obter("clientes", a.cliente_id);
      notificar(cliente, "clube_atraso", { texto: `${cliente.nome.split(" ")[0]}, a mensalidade do seu clube na ${b.nome} está em aberto. Pague aqui para continuar usando: ${p.invoiceUrl ?? linkApp()}`, parametros: [cliente.nome.split(" ")[0], p.invoiceUrl ?? linkApp()] }).catch(() => {});
      return { ok: true };
    }
    if (acao === "estornada") return estornar(a, p.id);
    // Cobrança apagada no Asaas antes de ser paga
    if (acao === "cancelada") repo.rodar("UPDATE cobrancas SET status = 'cancelada' WHERE externo_id = ? AND pago_em IS NULL", p.id);
    return { ok: true };
  }

  /**
   * Pagamento de uma assinatura já cancelada aqui: o dinheiro entrou, então a cobrança fica registrada como paga,
   * mas a assinatura não volta a valer. A equipe vê na auditoria (para devolver ou reativar com o cliente) e a
   * rotina tenta cancelar de novo no Asaas, que ainda está cobrando.
   */
  function pagamentoDeCancelada(a, p) {
    const b = exigirBarbearia();
    return repo.transacao(() => {
      const cob = repo.um("SELECT * FROM cobrancas WHERE externo_id = ?", p.id);
      if (cob?.pago_em) return { ok: true };
      const valor = Math.round(Number(p.value) * 100) || repo.obter("planos", a.plano_id)?.preco_centavos || 0;
      const forma = String(p.billingType ?? "asaas").toLowerCase();
      if (cob) repo.rodar("UPDATE cobrancas SET status = 'paga', pago_em = ?, forma = ?, registrado_por = 'Asaas' WHERE id = ?", agora(), forma, cob.id);
      else repo.inserir("cobrancas", { barbearia_id: b.id, assinatura_id: a.id, valor_centavos: valor, vencimento: p.dueDate ?? hoje(), status: "paga", forma, externo_id: p.id, pago_em: agora(), registrado_por: "Asaas" });
      repo.atualizar("assinaturas", a.id, { cancelamento_pendente: 1 });
      repo.auditar(b.id, "Asaas", "pagamento_assinatura_cancelada", { assinatura: a.id, cliente: a.cliente_id, cobranca: p.id, valor_centavos: valor });
      console.warn("[asaas] pagamento recebido de assinatura cancelada", a.id, p.id);
      return { ok: true, assinatura_cancelada: true };
    });
  }

  /**
   * Estorno ou chargeback de uma cobrança: ela deixa de contar como recebida e o período que ela pagou sai da
   * assinatura. A assinatura volta para o último período pago que sobrou; sem nenhum que cubra hoje, fica "atrasada".
   */
  function estornar(a, externoId) {
    const b = exigirBarbearia();
    return repo.transacao(() => {
      const cob = repo.um("SELECT * FROM cobrancas WHERE externo_id = ?", externoId);
      if (!cob) return { ignorado: true };
      if (cob.estornada_em) return { ok: true }; // repetido
      repo.rodar("UPDATE cobrancas SET status = 'cancelada', estornada_em = ? WHERE id = ?", agora(), cob.id);
      if (!cob.pago_em) return { ok: true };
      const atual = repo.obter("assinaturas", a.id);
      repo.auditar(b.id, "Asaas", "assinatura_estornada", { assinatura: a.id, cobranca: externoId });
      if (atual.status === "cancelada") return { ok: true };
      // Tira do período pago o mês que a cobrança estornada pagou (cobrança antiga, sem período gravado: o último mês)
      const pa = pagoAte(atual);
      let novoPagoAte = pa;
      if (pa && cob.ciclo_fim === pa) novoPagoAte = somarDias(cob.ciclo_inicio, -1);
      else if (pa) novoPagoAte = somarDias(somarMeses(somarDias(pa, 1), -1), -1);
      repo.atualizar("assinaturas", a.id, { pago_ate: novoPagoAte, status: novoPagoAte && novoPagoAte >= hoje() ? "ativa" : "atrasada" });
      return { ok: true, estornada: true };
    });
  }

  Object.assign(nx, { virarCiclo, assinaturaAtual, usosNoCiclo, coberturaDoCliente, identificarAssinante, assinar, assinarTravado, proximoPeriodo, registrarPagamento, pagamentoManual, cancelarNoAsaas, cancelarAssinatura, ignorar, eventoAsaas, pagamentoDeCancelada, estornar });
}
