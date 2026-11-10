/* Rotina periódica: lembretes, ofertas vencidas, reservas esquecidas, assinaturas e retorno no tempo certo.
   Parte do núcleo (criarNucleo em ../nucleo.js): recebe o espaço comum nx e acrescenta as suas funções nele. */

import { faz } from "../../regras/agenda.js";
import { diasEntre, hojeBR, horaBR, quando, somarDias } from "../../regras/datas.js";

export function criarRotina(nx) {
  const { repo, agora } = nx;
  const barbearia = (...a) => nx.barbearia(...a);
  const cancelarNoAsaas = (...a) => nx.cancelarNoAsaas(...a);
  const detalhar = (...a) => nx.detalhar(...a);
  const hoje = (...a) => nx.hoje(...a);
  const liberarReservas = (...a) => nx.liberarReservas(...a);
  const linkApp = (...a) => nx.linkApp(...a);
  const notificar = (...a) => nx.notificar(...a);
  const virarCiclo = (...a) => nx.virarCiclo(...a);

  /* ---------- Rotina: lembretes, retorno, fila e assinaturas ---------- */
  /** Roda fn em até n itens ao mesmo tempo */
  async function emParalelo(lista, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => {
      while (i < lista.length) await fn(lista[i++]);
    }));
  }
  /** "hoje às 10:00", "amanhã às 10:00" ou "quinta, 12/11 às 10:00" */
  const quandoRelativo = (ms) => {
    const d = hojeBR(ms);
    if (d === hoje()) return `hoje às ${horaBR(ms)}`;
    if (d === somarDias(hoje(), 1)) return `amanhã às ${horaBR(ms)}`;
    return quando(ms);
  };
  /* Reteste T-02 e T-06: a falha espera 2, 10 e depois 30 min para tentar de novo (rotinas seguidas não gastam
     tentativas) e só desiste quando o horário passa. A rodada de lembretes tem um prazo total (15 s): o que não
     começar dentro dele fica para a próxima rodada, sem contar tentativa. */
  const ESPERAS_LEMBRETE_MIN = [2, 10, 30];
  const PRAZO_LEMBRETES_MS = nx.cfg.prazoLembretesMs ?? 15_000;
  const ENVIOS_SIMULTANEOS = 6;

  /** Trava: duas rotinas ao mesmo tempo (relógio + botão do painel) não mandam mensagens em dobro */
  let rotinaRodando = false;
  async function rotina() {
    if (rotinaRodando) return { ocupada: true };
    rotinaRodando = true;
    try {
      return await rotinaUmaVez();
    } finally {
      rotinaRodando = false;
    }
  }

  async function rotinaUmaVez() {
    const b = barbearia();
    if (!b) return {};
    const r = b.config.regras;
    const t = agora();
    const res = { lembretes: 0, retornos: 0, ofertas_vencidas: 0, assinaturas_atrasadas: 0, cancelamentos_asaas: 0, reservas_liberadas: 0 };

    // Reservas de horários que ninguém fechou: voltam para a vitrine 12 h depois do fim (V-20)
    for (const a of repo.todos("SELECT DISTINCT g.id FROM agendamentos g JOIN reservas r ON r.agendamento_id = g.id WHERE r.status = 'reservado' AND g.status <> 'concluido' AND g.fim < ?", t - 12 * 3600_000)) if (liberarReservas(a.id)) res.reservas_liberadas++;

    // Clube: cancelamentos que não chegaram ao Asaas (ou assinatura cancelada que voltou a ser cobrada)
    for (const a of repo.lista("assinaturas", "WHERE cancelamento_pendente = 1 AND status = 'cancelada' LIMIT 20")) if (await cancelarNoAsaas(a)) res.cancelamentos_asaas++;

    // Lembrete X horas antes. Marca antes de enviar (nunca manda em dobro); se o canal falhar, volta para a fila
    // com hora marcada para a próxima tentativa. Envio em paralelo, até 6 de cada vez, dentro do prazo da rodada.
    const prox = repo.lista("agendamentos", "WHERE status = 'agendado' AND lembrete_em IS NULL AND (lembrete_proxima_em IS NULL OR lembrete_proxima_em <= ?) AND inicio > ? AND inicio <= ? ORDER BY inicio", t, t, t + r.lembrete_horas * 3600_000);
    for (const a of prox) repo.atualizar("agendamentos", a.id, { lembrete_em: t });
    const comeco = performance.now();
    await emParalelo(prox, ENVIOS_SIMULTANEOS, async (a) => {
      if (performance.now() - comeco > PRAZO_LEMBRETES_MS) {
        repo.atualizar("agendamentos", a.id, { lembrete_em: null }); // não coube na rodada: volta sem gastar tentativa
        res.lembretes_adiados = (res.lembretes_adiados ?? 0) + 1;
        return;
      }
      const d = detalhar(a);
      const c = repo.obter("clientes", a.cliente_id);
      const envio = await notificar(c, "lembrete", { texto: `⏰ ${c.nome.split(" ")[0]}, lembrete: ${d.servico.nome} com ${d.barbeiro.nome} ${quandoRelativo(a.inicio)}. Chegando, toque em "Estou chegando" no app: ${linkApp()}`, parametros: [c.nome.split(" ")[0], d.servico.nome, quando(a.inicio), d.barbeiro.nome] });
      if (envio.enviado) res.lembretes++;
      else if (envio.falhou) {
        const tentativas = (a.lembrete_tentativas ?? 0) + 1;
        const espera = ESPERAS_LEMBRETE_MIN[Math.min(tentativas, ESPERAS_LEMBRETE_MIN.length) - 1] * 60_000;
        repo.atualizar("agendamentos", a.id, { lembrete_tentativas: tentativas, lembrete_em: null, lembrete_proxima_em: t + espera });
      }
    });

    // Ofertas da lista de espera que venceram voltam para a fila; dias passados expiram
    for (const e of repo.lista("espera", "WHERE status = 'oferecida'")) {
      if (e.oferta?.expira_em < t) {
        repo.atualizar("espera", e.id, { status: "aguardando", oferta: null });
        res.ofertas_vencidas++;
      }
    }
    repo.rodar("UPDATE espera SET status = 'expirada' WHERE status IN ('aguardando','oferecida') AND dia < ?", hojeBR(t));

    // Clube: período pago vencido vira "atrasada" (3 dias de tolerância); período seguinte já pago vira o ciclo
    for (const a of repo.lista("assinaturas", "WHERE status = 'ativa' AND COALESCE(pago_ate, ciclo_fim) < ?", somarDias(hojeBR(t), -3))) {
      repo.atualizar("assinaturas", a.id, { status: "atrasada" });
      res.assinaturas_atrasadas++;
    }
    for (const a of repo.lista("assinaturas", "WHERE status = 'ativa' AND ciclo_fim < ? AND pago_ate >= ?", hojeBR(t), hojeBR(t))) virarCiclo(a);

    // Retorno no tempo certo: das 10h às 19h, quem passou do próprio ciclo e não tem horário marcado
    const hora = horaBR(t);
    if (b.config.retorno?.ativo !== false && hora >= "10:00" && hora <= "19:00") {
      const margem = Number(b.config.retorno?.margem_dias ?? 2);
      // Filtra no SQL quem já passou do ciclo e não tem horário marcado; o limite de 40 vem depois do filtro (V-11)
      const candidatos = repo.lista(
        "clientes",
        "WHERE ativo = 1 AND aceita_mensagens = 1 AND fone IS NOT NULL AND ciclo_dias IS NOT NULL AND ultima_visita IS NOT NULL AND retorno_avisado_em IS NULL AND julianday(?) - julianday(ultima_visita) >= ciclo_dias + ? AND NOT EXISTS (SELECT 1 FROM agendamentos g WHERE g.cliente_id = clientes.id AND g.status = 'agendado' AND g.inicio > ?) ORDER BY ultima_visita LIMIT 40",
        hojeBR(t),
        margem,
        t,
      );
      for (const c of candidatos) {
        const passaram = diasEntre(c.ultima_visita, hojeBR(t));
        if (passaram < c.ciclo_dias + margem) continue;
        if (repo.um("SELECT 1 FROM agendamentos WHERE cliente_id = ? AND status = 'agendado' AND inicio > ?", c.id, t)) continue;
        repo.atualizar("clientes", c.id, { retorno_avisado_em: t });
        const envio = await notificar(c, "retorno", { texto: `💈 ${c.nome.split(" ")[0]}, já faz ${passaram} dias do seu último corte na ${b.nome}. Seu horário de sempre está a um toque: ${linkApp()}`, parametros: [c.nome.split(" ")[0], String(passaram), linkApp()] });
        if (envio.enviado) res.retornos++;
      }
    }
    return res;
  }

  Object.assign(nx, { emParalelo, quandoRelativo, rotina, rotinaUmaVez });
}
