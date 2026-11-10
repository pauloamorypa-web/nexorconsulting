/* Agenda: horários livres, agendar, remarcar, cancelar, status, detalhes do horário e .ics.
   Parte do núcleo (criarNucleo em ../nucleo.js): recebe o espaço comum nx e acrescenta as suas funções nele. */

import { OCUPA, cabe, faz, horariosLivres } from "../../regras/agenda.js";
import { cicloNoDia } from "../../regras/clube.js";
import { hojeBR, horaBR, paraMs, quando, somarDias } from "../../regras/datas.js";
import { recusar } from "./comum.js";

export function criarAgenda(nx) {
  const { repo, agora } = nx;
  const coberturaDoCliente = (...a) => nx.coberturaDoCliente(...a);
  const exigirBarbearia = (...a) => nx.exigirBarbearia(...a);
  const hoje = (...a) => nx.hoje(...a);
  const identificarAssinante = (...a) => nx.identificarAssinante(...a);
  const liberarReservas = (...a) => nx.liberarReservas(...a);
  const linkApp = (...a) => nx.linkApp(...a);
  const notificar = (...a) => nx.notificar(...a);
  const oferecerVaga = (...a) => nx.oferecerVaga(...a);
  const reservar = (...a) => nx.reservar(...a);
  const usosNoCiclo = (...a) => nx.usosNoCiclo(...a);

  /* ---------- Agenda ---------- */
  const servicoAtivo = (id) => {
    const s = repo.obter("servicos", id);
    return s?.ativo ? s : recusar(404, "Serviço não encontrado.");
  };
  const barbeiroAtivo = (id) => {
    const x = repo.obter("barbeiros", id);
    return x?.ativo ? x : recusar(404, "Barbeiro não encontrado.");
  };

  /** Agendamentos que ocupam e bloqueios (do barbeiro ou da barbearia inteira) num dia */
  function ocupados(barbeiroId, dia, ignorar = null) {
    const ini = paraMs(dia);
    const fim = ini + 86400_000;
    const ags = repo
      .todos("SELECT id, inicio, fim, status FROM agendamentos WHERE barbeiro_id = ? AND inicio < ? AND fim > ?", barbeiroId, fim, ini)
      .filter((a) => OCUPA.has(a.status) && a.id !== ignorar);
    const blq = repo.todos("SELECT inicio, fim FROM bloqueios WHERE (barbeiro_id = ? OR barbeiro_id IS NULL) AND inicio < ? AND fim > ?", barbeiroId, fim, ini);
    return [...ags, ...blq];
  }

  const barbeirosAtivos = () => repo.lista("barbeiros", "WHERE ativo = 1 ORDER BY ordem, nome");

  /** Horários livres. Sem barbeiro: todos os horários em que pelo menos um barbeiro atende. */
  function livres({ servicoId, barbeiroId = null, dia, ignorar = null }) {
    const b = exigirBarbearia();
    const servico = servicoAtivo(servicoId);
    const lista = barbeiroId ? [barbeiroAtivo(barbeiroId)] : barbeirosAtivos().filter((x) => faz(x, servico.id));
    const por = {};
    for (const x of lista) por[x.id] = horariosLivres({ barbearia: b, barbeiro: x, servico, dia, ocupados: ocupados(x.id, dia, ignorar), agora: agora() });
    const todos = [...new Set(Object.values(por).flat())].sort();
    return { dia, horarios: todos, por_barbeiro: por };
  }

  /** Quantos horários livres em cada um dos próximos dias (a faixa de dias do app) */
  function diasDisponiveis({ servicoId, barbeiroId = null, dias = 14 }) {
    const b = exigirBarbearia();
    const n = Math.min(dias, b.config.regras.janela_dias + 1);
    return Array.from({ length: n }, (_, i) => {
      const dia = somarDias(hoje(), i);
      return { dia, livres: livres({ servicoId, barbeiroId, dia }).horarios.length };
    });
  }

  /**
   * Cria um agendamento. Sem barbeiro escolhido, fica com quem estiver livre e com menos atendimentos no dia.
   * encaixe: a equipe pode agendar fora do expediente (nunca por cima de outro cliente).
   */
  function agendar({ cliente, servicoId, barbeiroId = null, dia, hora, origem = "app", autor, encaixe = false, observacao = null, reservas = [] }) {
    const b = exigirBarbearia();
    const servico = servicoAtivo(servicoId);
    if (encaixe && dia < hoje()) recusar(400, "Encaixe só para hoje ou datas futuras.");
    const ag = repo.transacao(() => {
      let candidatos = barbeiroId ? [barbeiroAtivo(barbeiroId)] : barbeirosAtivos().filter((x) => faz(x, servico.id));
      if (!barbeiroId) {
        const carga = (id) => repo.um("SELECT COUNT(*) n FROM agendamentos WHERE barbeiro_id = ? AND inicio >= ? AND inicio < ? AND status <> 'cancelado'", id, paraMs(dia), paraMs(dia) + 86400_000).n;
        candidatos = candidatos.map((x) => [x, carga(x.id)]).sort((p, q) => p[1] - q[1]).map((p) => p[0]);
      }
      let escolha = null;
      let motivo = "Esse horário não está mais livre. Escolha outro.";
      for (const x of candidatos) {
        if (!faz(x, servico.id)) {
          motivo = `${x.nome} não faz ${servico.nome}.`;
          continue;
        }
        const r = cabe({ barbearia: b, barbeiro: x, servico, dia, hora, ocupados: ocupados(x.id, dia), agora: agora(), encaixe });
        if (r.ok) {
          escolha = { barbeiro: x, ...r };
          break;
        }
        motivo = r.motivo;
      }
      if (!escolha) recusar(409, motivo);
      const conflito = repo.um("SELECT 1 FROM agendamentos WHERE cliente_id = ? AND status IN ('agendado','chegou','em_atendimento') AND inicio < ? AND fim > ?", cliente.id, escolha.fim, escolha.inicio);
      if (conflito) recusar(409, "Você já tem um horário marcado nesse momento.");
      const cob = coberturaDoCliente(cliente.id, servico.id, dia);
      const novo = repo.inserir("agendamentos", {
        barbearia_id: b.id,
        cliente_id: cliente.id,
        barbeiro_id: escolha.barbeiro.id,
        servico_id: servico.id,
        inicio: escolha.inicio,
        fim: escolha.fim,
        origem,
        preco_centavos: cob.coberto ? 0 : servico.preco_centavos,
        assinatura_id: cob.coberto ? cob.assinatura.id : null,
        observacao,
      });
      if (cob.coberto) repo.inserir("usos", { barbearia_id: b.id, assinatura_id: cob.assinatura.id, servico_id: servico.id, agendamento_id: novo.id, ciclo_inicio: cicloNoDia(cob.assinatura, dia).ciclo_inicio });
      for (const r of reservas) reservar(novo, r.produto_id, r.quantidade);
      repo.auditar(b.id, autor ?? cliente.nome, "agendamento_criado", { agendamento: novo.id, origem, encaixe });
      return novo;
    });
    const detalhe = detalhar(ag);
    const clubeTxt = detalhe.assinante?.coberto ? `\n👑 Incluído no seu ${detalhe.assinante.plano.nome}${detalhe.assinante.restante !== null ? ` (restam ${detalhe.assinante.restante} no ciclo)` : ""}.` : "";
    notificar(cliente, "confirmacao", {
      texto: `✂️ ${cliente.nome.split(" ")[0]}, seu horário na ${b.nome} está confirmado: ${detalhe.servico.nome} com ${detalhe.barbeiro.nome}, ${quando(ag.inicio)}.${clubeTxt}\nPara remarcar ou cancelar: ${linkApp()}`,
      parametros: [cliente.nome.split(" ")[0], detalhe.servico.nome, quando(ag.inicio), detalhe.barbeiro.nome],
    }).catch(() => {});
    return detalhe;
  }



  /** Memória de uma chamada: cada serviço, barbeiro, cliente, plano e assinante é lido uma vez só (evita N+1 nas listas) */
  function memoria() {
    const m = new Map();
    return (chave, fn) => {
      if (!m.has(chave)) m.set(chave, fn());
      return m.get(chave);
    };
  }

  /** Assinante no horário: o plano, a situação de hoje e, se saiu pelo clube, quantos usos ainda restam no ciclo */
  function assinanteDoHorario(a, m = memoria()) {
    const id = m(`assinante:${a.cliente_id}`, () => identificarAssinante(a.cliente_id));
    if (!id.assinante) return null;
    const ass = a.assinatura_id ? m(`assinatura:${a.assinatura_id}`, () => repo.obter("assinaturas", a.assinatura_id)) : null;
    let restante = null;
    if (ass) {
      const item = (m(`plano:${ass.plano_id}`, () => repo.obter("planos", ass.plano_id))?.itens ?? []).find((i) => i.servico_id === a.servico_id);
      if (item?.quantidade > 0) restante = Math.max(0, item.quantidade - m(`usos:${ass.id}:${a.servico_id}:${hojeBR(a.inicio)}`, () => usosNoCiclo(ass, a.servico_id, hojeBR(a.inicio))));
    }
    return { plano: id.plano, status: id.status, coberto: Boolean(a.assinatura_id), restante };
  }

  const SQL_RESERVAS = "SELECT r.agendamento_id, r.id, r.quantidade, r.status, p.id produto_id, p.nome, p.preco_centavos FROM reservas r JOIN produtos p ON p.id = r.produto_id";
  function detalharCom(a, m, reservasPorAg = null) {
    const servico = m(`servico:${a.servico_id}`, () => repo.obter("servicos", a.servico_id));
    const barbeiro = m(`barbeiro:${a.barbeiro_id}`, () => repo.obter("barbeiros", a.barbeiro_id));
    const cliente = m(`cliente:${a.cliente_id}`, () => repo.obter("clientes", a.cliente_id));
    const reservas = (reservasPorAg ? (reservasPorAg.get(a.id) ?? []) : repo.todos(`${SQL_RESERVAS} WHERE r.agendamento_id = ?`, a.id)).map(({ agendamento_id, ...r }) => r);
    return { ...a, dia: hojeBR(a.inicio), hora: horaBR(a.inicio), servico: servico && { id: servico.id, nome: servico.nome, duracao_min: servico.duracao_min, preco_centavos: servico.preco_centavos }, barbeiro: barbeiro && { id: barbeiro.id, nome: barbeiro.nome, cor: barbeiro.cor }, cliente: cliente && { id: cliente.id, nome: cliente.nome, fone: cliente.fone }, reservas, clube: Boolean(a.assinatura_id), assinante: assinanteDoHorario(a, m) };
  }
  const detalhar = (a) => detalharCom(a, memoria());
  /** Vários horários de uma vez: cadastros lidos uma vez e as reservas numa consulta só por faixa */
  function detalharVarios(ags) {
    if (!ags.length) return [];
    const m = memoria();
    const reservasPorAg = new Map();
    const ids = new Set(ags.map((a) => a.id));
    const ini = Math.min(...ags.map((a) => a.inicio));
    const fim = Math.max(...ags.map((a) => a.inicio));
    for (const r of repo.todos(`${SQL_RESERVAS} JOIN agendamentos ag ON ag.id = r.agendamento_id WHERE ag.inicio >= ? AND ag.inicio <= ?`, ini, fim)) {
      if (!ids.has(r.agendamento_id)) continue;
      if (!reservasPorAg.has(r.agendamento_id)) reservasPorAg.set(r.agendamento_id, []);
      reservasPorAg.get(r.agendamento_id).push(r);
    }
    return ags.map((a) => detalharCom(a, m, reservasPorAg));
  }

  /**
   * Recalcula se o horário sai pelo clube (dentro de uma transação): no remarcar, ao voltar de "faltou" e ao fechar a
   * comanda. Tira o uso do próprio horário, confere de novo a assinatura, o plano e a cota do ciclo do dia do horário.
   */
  function recalcularCobertura(id) {
    const a = repo.obter("agendamentos", id);
    const servico = repo.obter("servicos", a.servico_id);
    repo.rodar("DELETE FROM usos WHERE agendamento_id = ?", a.id);
    const dia = hojeBR(a.inicio);
    const cob = coberturaDoCliente(a.cliente_id, a.servico_id, dia);
    if (cob.coberto) repo.inserir("usos", { barbearia_id: a.barbearia_id, assinatura_id: cob.assinatura.id, servico_id: a.servico_id, agendamento_id: a.id, ciclo_inicio: cicloNoDia(cob.assinatura, dia).ciclo_inicio });
    // Deixou de sair pelo clube: volta o preço do serviço; continua fora do clube: mantém o preço confirmado
    const preco = cob.coberto ? 0 : a.assinatura_id ? servico.preco_centavos : a.preco_centavos;
    return repo.atualizar("agendamentos", a.id, { preco_centavos: preco, assinatura_id: cob.coberto ? cob.assinatura.id : null });
  }

  /** Mudanças de status que a equipe pode fazer pelo painel (cancelar tem a própria função; concluir é a comanda) */
  const TRANSICOES = { agendado: ["chegou", "em_atendimento", "faltou"], chegou: ["agendado", "em_atendimento", "faltou"], em_atendimento: ["agendado", "chegou", "faltou"], faltou: ["agendado", "chegou", "em_atendimento"], concluido: [], cancelado: [] };
  const ROTULO_STATUS = { agendado: "agendado", chegou: "chegou", em_atendimento: "em atendimento", faltou: "faltou", concluido: "concluído", cancelado: "cancelado" };
  function mudarStatus(id, status, { autor }) {
    const b = exigirBarbearia();
    return repo.transacao(() => {
      const a = repo.obter("agendamentos", id) ?? recusar(404, "Agendamento não encontrado.");
      if (a.status === status) return a;
      if (["concluido", "cancelado"].includes(a.status)) recusar(409, "Este atendimento já foi encerrado.");
      if (!TRANSICOES[a.status]?.includes(status)) recusar(409, `Não dá para mudar de "${ROTULO_STATUS[a.status]}" para "${ROTULO_STATUS[status]}".`);
      if (status === "faltou") {
        repo.rodar("DELETE FROM usos WHERE agendamento_id = ?", a.id);
        liberarReservas(a.id);
      }
      if (a.status === "faltou") {
        // Volta a ocupar a agenda: o horário pode ter sido dado a outro cliente
        const ocupado = repo.um("SELECT 1 FROM agendamentos WHERE barbeiro_id = ? AND id <> ? AND status IN ('agendado','chegou','em_atendimento','concluido') AND inicio < ? AND fim > ?", a.barbeiro_id, a.id, a.fim, a.inicio);
        if (ocupado) recusar(409, "Esse horário já foi ocupado por outro cliente.");
      }
      repo.atualizar("agendamentos", a.id, { status, chegou_em: status === "chegou" ? agora() : a.chegou_em });
      if (a.status === "faltou") recalcularCobertura(a.id);
      repo.auditar(b.id, autor, "agendamento_status", { agendamento: a.id, de: a.status, status });
      return repo.obter("agendamentos", a.id);
    });
  }

  /** O cliente pode cancelar ou remarcar sozinho? (até X horas antes) */
  function podeMudar(a) {
    const b = exigirBarbearia();
    return a.status === "agendado" && a.inicio - agora() >= b.config.regras.cancelamento_horas * 3600_000;
  }

  function cancelar(ag, { por, motivo = "cliente" } = {}) {
    const b = exigirBarbearia();
    const a = repo.transacao(() => {
      const a = repo.obter("agendamentos", ag.id) ?? recusar(404, "Agendamento não encontrado.");
      if (!["agendado", "chegou"].includes(a.status)) recusar(409, "Este horário não pode mais ser cancelado.");
      repo.atualizar("agendamentos", a.id, { status: "cancelado", cancelado_por: motivo });
      liberarReservas(a.id);
      repo.rodar("DELETE FROM usos WHERE agendamento_id = ?", a.id);
      repo.auditar(b.id, por, "agendamento_cancelado", { agendamento: a.id, motivo });
      return a;
    });
    // A vaga aberta vai direto para a lista de espera (se o horário ainda não passou)
    if (a.inicio > agora()) oferecerVaga(a).catch((e) => console.error("[espera]", e.message));
    return detalhar(repo.obter("agendamentos", a.id));
  }

  /** Remarcar = novo horário com os mesmos dados; o antigo só é liberado se o novo couber */
  function remarcar(a, { dia, hora, barbeiroId, autor, encaixe = false }) {
    if (a.status !== "agendado") recusar(409, "Só horários marcados podem ser remarcados.");
    if (encaixe && dia < hoje()) recusar(400, "Encaixe só para hoje ou datas futuras.");
    const b = exigirBarbearia();
    const servico = servicoAtivo(a.servico_id);
    const barbeiro = barbeiroAtivo(barbeiroId ?? a.barbeiro_id);
    return repo.transacao(() => {
      const r = cabe({ barbearia: b, barbeiro, servico, dia, hora, ocupados: ocupados(barbeiro.id, dia, a.id), agora: agora(), encaixe });
      if (!r.ok) recusar(409, r.motivo);
      const conflito = repo.um("SELECT 1 FROM agendamentos WHERE cliente_id = ? AND id <> ? AND status IN ('agendado','chegou','em_atendimento') AND inicio < ? AND fim > ?", a.cliente_id, a.id, r.fim, r.inicio);
      if (conflito) recusar(409, "O cliente já tem um horário marcado nesse momento.");
      repo.atualizar("agendamentos", a.id, { inicio: r.inicio, fim: r.fim, barbeiro_id: barbeiro.id, lembrete_em: null, lembrete_tentativas: 0 });
      recalcularCobertura(a.id);
      repo.auditar(b.id, autor, "agendamento_remarcado", { agendamento: a.id, de: a.inicio, para: r.inicio });
      if (a.inicio > agora()) setImmediate(() => oferecerVaga(a).catch(() => {}));
      return detalhar(repo.obter("agendamentos", a.id));
    });
  }

  /** Evento para a agenda do celular (.ics) */
  function ics(a) {
    const b = exigirBarbearia();
    const d = detalhar(a);
    const fmt = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const esc = (s) => String(s ?? "").replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nexor Barber//PT-BR", "BEGIN:VEVENT", `UID:${a.id}@nexor-barber`, `DTSTAMP:${fmt(agora())}`, `DTSTART:${fmt(a.inicio)}`, `DTEND:${fmt(a.fim)}`, `SUMMARY:${esc(`${d.servico.nome} · ${b.nome}`)}`, `DESCRIPTION:${esc(`Com ${d.barbeiro.nome}. Remarcar: ${linkApp()}`)}`, `LOCATION:${esc(b.config.marca?.endereco ?? "")}`, "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Seu horário", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }

  Object.assign(nx, { servicoAtivo, barbeiroAtivo, ocupados, barbeirosAtivos, livres, diasDisponiveis, agendar, memoria, assinanteDoHorario, detalharCom, detalhar, detalharVarios, recalcularCobertura, mudarStatus, podeMudar, cancelar, remarcar, ics });
}
