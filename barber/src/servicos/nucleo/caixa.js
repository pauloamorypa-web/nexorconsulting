/* Caixa e estoque: reservas da loja, vendas, comanda, cancelamento de venda, estoque e retorno do cliente.
   Parte do núcleo (criarNucleo em ../nucleo.js): recebe o espaço comum nx e acrescenta as suas funções nele. */

import { assinaturaValida, cicloDeRetorno } from "../../regras/clube.js";
import { hojeBR } from "../../regras/datas.js";
import { recusar, FORMAS } from "./comum.js";

export function criarCaixa(nx) {
  const { repo } = nx;
  const assinaturaAtual = (...a) => nx.assinaturaAtual(...a);
  const detalhar = (...a) => nx.detalhar(...a);
  const exigirBarbearia = (...a) => nx.exigirBarbearia(...a);
  const hoje = (...a) => nx.hoje(...a);
  const recalcularCobertura = (...a) => nx.recalcularCobertura(...a);

  /* Tetos de reserva pela loja do app (V-22): por produto no horário, por horário e por cliente */
  const RESERVA_MAX = { produto: 5, horario: 10, cliente: 15 };

  /** Reserva para retirar no horário. O mesmo produto no mesmo horário soma na mesma reserva. */
  function reservar(ag, produtoId, quantidade) {
    return repo.transacao(() => {
      const p = repo.obter("produtos", produtoId);
      if (!p?.ativo || !p.vitrine || !(p.preco_centavos > 0)) recusar(404, "Produto não encontrado.");
      const ja = repo.um("SELECT * FROM reservas WHERE agendamento_id = ? AND produto_id = ? AND status = 'reservado' ORDER BY criado_em LIMIT 1", ag.id, p.id);
      const total = (ja?.quantidade ?? 0) + quantidade;
      if (total > RESERVA_MAX.produto) recusar(409, `Você pode reservar até ${RESERVA_MAX.produto} unidades de ${p.nome} por horário.`);
      const noHorario = repo.um("SELECT COALESCE(SUM(quantidade),0) n FROM reservas WHERE agendamento_id = ? AND status = 'reservado'", ag.id).n;
      if (noHorario + quantidade > RESERVA_MAX.horario) recusar(409, `Você pode reservar até ${RESERVA_MAX.horario} itens por horário.`);
      const doCliente = repo.um("SELECT COALESCE(SUM(quantidade),0) n FROM reservas WHERE cliente_id = ? AND status = 'reservado'", ag.cliente_id).n;
      if (doCliente + quantidade > RESERVA_MAX.cliente) recusar(409, `Você já tem ${doCliente} itens reservados. Retire os que já reservou antes de reservar mais.`);
      if (disponivel(p) < quantidade) recusar(409, `${p.nome}: só ${Math.max(0, disponivel(p))} em estoque.`);
      if (ja) return repo.atualizar("reservas", ja.id, { quantidade: total });
      return repo.inserir("reservas", { barbearia_id: ag.barbearia_id, cliente_id: ag.cliente_id, agendamento_id: ag.id, produto_id: p.id, quantidade });
    });
  }

  /** Muda a quantidade de uma reserva (o botão − e + do app) */
  function mudarReserva(reserva, quantidade) {
    return repo.transacao(() => {
      const x = repo.obter("reservas", reserva.id);
      if (x?.status !== "reservado") recusar(409, "Esta reserva já foi retirada.");
      const delta = quantidade - x.quantidade;
      if (delta <= 0) return repo.atualizar("reservas", x.id, { quantidade });
      const ag = repo.obter("agendamentos", x.agendamento_id);
      return reservar(ag, x.produto_id, delta);
    });
  }

  /** Devolve à vitrine o que estava reservado para o horário (cancelou, faltou ou ninguém fechou) */
  const liberarReservas = (agId) => repo.rodar("UPDATE reservas SET status = 'cancelado' WHERE agendamento_id = ? AND status = 'reservado'", agId).changes;

  const disponivel = (p) => p.estoque - repo.um("SELECT COALESCE(SUM(quantidade),0) n FROM reservas WHERE produto_id = ? AND status = 'reservado'", p.id).n;

  /* ---------- Comanda: fechar o atendimento ou vender no balcão ---------- */
  const comissaoDe = (barbeiro, tipo) => (barbeiro ? (tipo === "servico" ? barbeiro.comissao_servico : barbeiro.comissao_produto) : 0);

  /**
   * Registra uma venda: serviços, produtos, desconto, forma de pagamento, baixa no estoque e comissões.
   * itens: [{ tipo: 'servico'|'produto', id, quantidade }]
   */
  function vender({ clienteId = null, barbeiroId = null, agendamento = null, itens, descontoCentavos = 0, forma, autor, descontoMaxPct = null }) {
    const b = exigirBarbearia();
    if (!FORMAS[forma]) recusar(400, "Forma de pagamento inválida.");
    return repo.transacao(() => {
      const barbeiro = barbeiroId ? repo.obter("barbeiros", barbeiroId) : null;
      const assinatura = clienteId ? assinaturaAtual(clienteId) : null;
      const plano = assinaturaValida(assinatura, hoje()) ? repo.obter("planos", assinatura.plano_id) : null;
      const linhas = [];
      for (const it of itens) {
        const qtd = Math.max(1, Math.floor(it.quantidade ?? 1));
        if (it.tipo === "servico") {
          const s = repo.obter("servicos", it.id) ?? recusar(404, "Serviço não encontrado.");
          const clube = Boolean(it.clube);
          const unitario = !clube && Number.isInteger(it.preco_confirmado) ? it.preco_confirmado : s.preco_centavos;
          linhas.push({ tipo: "servico", id: s.id, nome: s.nome, quantidade: qtd, unitario_centavos: unitario, total_centavos: clube ? 0 : unitario * qtd, clube, base_comissao: unitario * qtd });
        } else {
          const p = repo.obter("produtos", it.id) ?? recusar(404, "Produto não encontrado.");
          const desc = plano?.desconto_produtos ? Math.round((p.preco_centavos * qtd * plano.desconto_produtos) / 100) : 0;
          const total = p.preco_centavos * qtd - desc;
          linhas.push({ tipo: "produto", id: p.id, nome: p.nome, quantidade: qtd, unitario_centavos: p.preco_centavos, desconto_clube_centavos: desc, total_centavos: total, base_comissao: total, reserva_id: it.reserva_id ?? null });
        }
      }
      if (!linhas.length) recusar(400, "A comanda está vazia.");
      // Estoque conferido pelo total de cada produto na venda (o mesmo produto em duas linhas soma) (V-21)
      const porProduto = new Map();
      for (const l of linhas.filter((x) => x.tipo === "produto")) {
        const t = porProduto.get(l.id) ?? { qtd: 0, reservado: 0 };
        t.qtd += l.quantidade;
        if (l.reserva_id) t.reservado += l.quantidade;
        porProduto.set(l.id, t);
      }
      for (const [pid, t] of porProduto) {
        const p = repo.obter("produtos", pid);
        if (p.estoque < t.qtd || disponivel(p) + t.reservado < t.qtd) recusar(409, `${p.nome}: só ${Math.max(0, Math.min(p.estoque, disponivel(p) + t.reservado))} em estoque.`);
      }
      const subtotal = linhas.reduce((s, l) => s + l.total_centavos, 0);
      const desconto = Math.min(Math.max(0, descontoCentavos), subtotal);
      // Teto de desconto do perfil de quem lança (V-32); dono e admin não têm teto
      if (descontoMaxPct !== null && desconto > Math.floor((subtotal * descontoMaxPct) / 100)) recusar(403, `Seu perfil pode dar até ${descontoMaxPct}% de desconto. Peça ao dono para lançar um desconto maior.`);
      const total = subtotal - desconto;
      const formaFinal = total === 0 && linhas.some((l) => l.clube) ? "clube" : forma;
      const venda = repo.inserir("vendas", { barbearia_id: b.id, cliente_id: clienteId, barbeiro_id: barbeiro?.id ?? null, agendamento_id: agendamento?.id ?? null, itens: linhas, subtotal_centavos: subtotal, desconto_centavos: desconto, total_centavos: total, forma: formaFinal, dia: hoje(), autor });
      // Desconto manual dividido proporcionalmente na base das comissões
      const fator = subtotal ? total / subtotal : 1;
      for (const l of linhas) {
        if (l.tipo === "produto") {
          const p = repo.obter("produtos", l.id);
          const saldo = p.estoque - l.quantidade;
          repo.atualizar("produtos", p.id, { estoque: saldo });
          repo.inserir("estoque_mov", { barbearia_id: b.id, produto_id: p.id, tipo: "venda", quantidade: -l.quantidade, saldo, motivo: "venda", autor, venda_id: venda.id });
          if (l.reserva_id) repo.rodar("UPDATE reservas SET status = 'vendido' WHERE id = ?", l.reserva_id);
        }
        const pct = comissaoDe(barbeiro, l.tipo);
        const clubeSemComissao = l.clube && b.config.regras.comissao_clube === "nenhuma";
        if (barbeiro && pct > 0 && !clubeSemComissao) {
          const base = Math.round(l.base_comissao * (l.clube ? 1 : fator));
          repo.inserir("comissoes", { barbearia_id: b.id, barbeiro_id: barbeiro.id, venda_id: venda.id, tipo: l.tipo, descricao: l.nome, base_centavos: base, percentual: pct, valor_centavos: Math.round((base * pct) / 100), dia: hoje() });
        }
      }
      repo.auditar(b.id, autor, "venda", { venda: venda.id, total });
      return venda;
    });
  }

  /** Fecha o atendimento: serviço (pelo clube ou não) + produtos reservados e extras */
  function concluir(ag, { produtos = [], descontoCentavos = 0, forma, autor, descontoMaxPct = null }) {
    return repo.transacao(() => {
      // Confere o status dentro da transação, no registro atual (dois "fechar comanda" ao mesmo tempo: só um passa)
      let a = repo.obter("agendamentos", ag.id) ?? recusar(404, "Agendamento não encontrado.");
      if (["concluido", "cancelado", "faltou"].includes(a.status) || a.venda_id) recusar(409, "Este atendimento já foi encerrado.");
      a = recalcularCobertura(a.id); // a assinatura pode ter sido cancelada ou atrasado desde o agendamento
      // Cobra o preço confirmado ao cliente no agendamento, não o preço atual do serviço (V-30)
      const itens = [{ tipo: "servico", id: a.servico_id, quantidade: 1, clube: Boolean(a.assinatura_id), preco_confirmado: a.preco_centavos }];
      for (const r of repo.todos("SELECT * FROM reservas WHERE agendamento_id = ? AND status = 'reservado'", a.id)) itens.push({ tipo: "produto", id: r.produto_id, quantidade: r.quantidade, reserva_id: r.id });
      for (const p of produtos) itens.push({ tipo: "produto", id: p.id, quantidade: p.quantidade });
      const venda = vender({ clienteId: a.cliente_id, barbeiroId: a.barbeiro_id, agendamento: a, itens, descontoCentavos, forma, autor, descontoMaxPct });
      repo.atualizar("agendamentos", a.id, { status: "concluido", venda_id: venda.id });
      atualizarRetorno(a.cliente_id);
      return { venda, agendamento: detalhar(repo.obter("agendamentos", a.id)) };
    });
  }

  function cancelarVenda(venda, { autor }) {
    if (venda.status === "cancelada") recusar(409, "Venda já cancelada.");
    const b = exigirBarbearia();
    return repo.transacao(() => {
      for (const l of venda.itens.filter((x) => x.tipo === "produto")) {
        const p = repo.obter("produtos", l.id);
        if (!p) continue;
        const saldo = p.estoque + l.quantidade;
        repo.atualizar("produtos", p.id, { estoque: saldo });
        repo.inserir("estoque_mov", { barbearia_id: b.id, produto_id: p.id, tipo: "estorno", quantidade: l.quantidade, saldo, motivo: "venda cancelada", autor, venda_id: venda.id });
      }
      // Trava de período (V-45): comissão de mês já fechado não é apagada; entra um estorno no mês atual
      if (venda.dia.slice(0, 7) < hoje().slice(0, 7)) {
        for (const c of repo.todos("SELECT * FROM comissoes WHERE venda_id = ? AND estorno_de IS NULL AND id NOT IN (SELECT estorno_de FROM comissoes WHERE estorno_de IS NOT NULL)", venda.id))
          repo.inserir("comissoes", { barbearia_id: c.barbearia_id, barbeiro_id: c.barbeiro_id, venda_id: c.venda_id, tipo: c.tipo, descricao: `Estorno: ${c.descricao ?? ""} (venda de ${venda.dia.split("-").reverse().join("/")})`, base_centavos: -c.base_centavos, percentual: c.percentual, valor_centavos: -c.valor_centavos, dia: hoje(), estorno_de: c.id });
      } else repo.rodar("DELETE FROM comissoes WHERE venda_id = ?", venda.id);
      if (venda.agendamento_id) repo.rodar("UPDATE agendamentos SET status = 'em_atendimento', venda_id = NULL WHERE id = ?", venda.agendamento_id);
      repo.auditar(b.id, autor, "venda_cancelada", { venda: venda.id });
      return repo.atualizar("vendas", venda.id, { status: "cancelada", cancelada_por: autor });
    });
  }

  function movimentarEstoque(produto, { tipo, quantidade, motivo, autor }) {
    const b = exigirBarbearia();
    return repo.transacao(() => {
      const p = repo.obter("produtos", produto.id);
      const delta = tipo === "entrada" ? Math.abs(quantidade) : quantidade;
      const saldo = p.estoque + delta;
      if (saldo < 0) recusar(400, "O estoque não pode ficar negativo.");
      repo.atualizar("produtos", p.id, { estoque: saldo });
      repo.inserir("estoque_mov", { barbearia_id: b.id, produto_id: p.id, tipo, quantidade: delta, saldo, motivo, autor });
      return repo.obter("produtos", p.id);
    });
  }

  /** Última visita e ciclo de retorno do cliente, a partir dos atendimentos concluídos */
  function atualizarRetorno(clienteId) {
    const dias = repo.todos("SELECT inicio FROM agendamentos WHERE cliente_id = ? AND status = 'concluido' ORDER BY inicio DESC LIMIT 7", clienteId).map((a) => hojeBR(a.inicio));
    if (!dias.length) return;
    repo.atualizar("clientes", clienteId, { ultima_visita: dias[0], ciclo_dias: cicloDeRetorno(dias), retorno_avisado_em: null });
  }

  Object.assign(nx, { reservar, mudarReserva, liberarReservas, disponivel, comissaoDe, vender, concluir, cancelarVenda, movimentarEstoque, atualizarRetorno });
}
