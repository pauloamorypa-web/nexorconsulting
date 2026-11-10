/* Regras de negócio do Nexor Barber, usadas pelo painel, pelo app do cliente, pelos webhooks e pela rotina.
   Tudo o que mexe em agenda, estoque ou dinheiro roda dentro de uma transação. */

import { createHmac, randomInt } from "node:crypto";
import { z } from "zod";
import { OCUPA, REGRAS_PADRAO, cabe, faz, horariosLivres } from "../regras/agenda.js";
import { assinaturaValida, cicloDe, cicloDeRetorno, cicloNoDia, cobertura, pagoAte } from "../regras/clube.js";
import { diasEntre, hojeBR, horaBR, paraMs, quando, somarDias, somarMeses } from "../regras/datas.js";
import { gerarToken, iguais, sha256 } from "../seguranca.js";
import { acaoAsaas, criarAsaas, criarSms, criarWhatsApp, normalizarFone } from "./canais.js";

export class ErroRegra extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}
const recusar = (status, mensagem) => {
  throw new ErroRegra(status, mensagem);
};

export const FORMAS = { dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", credito: "Crédito", clube: "Clube (assinatura)", outro: "Outro" };
const reais = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function criarNucleo({ repo, cofre, cfg, fetchFn = fetch, agora = () => Date.now() }) {
  const hoje = () => hojeBR(agora());
  const segredo = (c) => {
    try {
      return cofre.decifrar(c);
    } catch {
      return "";
    }
  };
  const barbearia = () => {
    const b = repo.barbearia();
    if (!b) return null;
    b.config = { ...b.config, regras: { ...REGRAS_PADRAO, ...(b.config.regras ?? {}) } };
    return b;
  };
  const exigirBarbearia = () => barbearia() ?? recusar(409, "A barbearia ainda não foi criada.");

  /* ---------- Token do webhook do Asaas: gerado no servidor, guardado cifrado ---------- */
  const TOKEN_WEBHOOK_MIN = 24;
  const novoTokenWebhook = () => cofre.cifrar(gerarToken(24));
  /** Token em claro (para conferir o webhook e mostrar na aba Canais). Vazio se não houver ou for curto demais. */
  function tokenWebhookAsaas(b = barbearia()) {
    const a = b?.config.asaas ?? {};
    const t = a.token_webhook_cripto ? segredo(a.token_webhook_cripto) : "";
    return t.length >= TOKEN_WEBHOOK_MIN ? t : "";
  }
  /**
   * Migração de bancos antigos (idempotente): o token do webhook do Asaas saía em texto puro na configuração.
   * Tokens com 24+ caracteres são cifrados e continuam valendo; curtos (ou "true"/"false") são trocados por um novo.
   */
  function migrarConfig() {
    const b = repo.barbearia();
    const a = b?.config.asaas;
    if (!a || !("token_webhook" in a)) return false;
    const { token_webhook: antigo, ...resto } = a;
    const valido = typeof antigo === "string" && antigo.length >= TOKEN_WEBHOOK_MIN && antigo !== "true" && antigo !== "false";
    const asaas = { ...resto, token_webhook_cripto: resto.token_webhook_cripto || (valido ? cofre.cifrar(antigo) : antigo ? novoTokenWebhook() : undefined) };
    if (!asaas.token_webhook_cripto) delete asaas.token_webhook_cripto;
    repo.atualizar("barbearias", b.id, { config: { ...b.config, asaas } });
    if (antigo && !valido) repo.auditar(b.id, "sistema", "token_webhook_asaas_trocado", { motivo: "token antigo curto demais; cole o novo no painel do Asaas" });
    return true;
  }
  const linkApp = (caminho = "") => `${cfg.urlPublica || ""}/app/${caminho}`;

  function canais(b = exigirBarbearia()) {
    const w = b.config.whatsapp ?? {};
    const s = b.config.sms ?? {};
    const a = b.config.asaas ?? {};
    return {
      whatsapp: criarWhatsApp({ token: segredo(w.token_cripto), idNumero: w.id_numero, versao: cfg.meta.versaoGraph, idioma: w.idioma || "pt_BR", fetchFn }),
      sms: criarSms({ sid: s.sid, token: segredo(s.token_cripto), de: s.de, url: cfg.sms.url, fetchFn }),
      asaas: criarAsaas({ chave: segredo(a.chave_cripto), url: a.ambiente === "producao" ? cfg.asaas.producao : cfg.asaas.sandbox, fetchFn }),
      modelos: w.modelos ?? {},
    };
  }

  /* ---------- Mensagens ---------- */
  const registrar = (b, cliente_id, canal, motivo, status, erro = null) => repo.inserir("envios", { barbearia_id: b.id, cliente_id, canal, motivo, status, erro: erro ? String(erro).slice(0, 300) : null });

  /** Manda pelo WhatsApp (modelo aprovado, se houver) e, se não der, por SMS. Nunca derruba a operação. */
  async function notificar(cliente, motivo, { texto, parametros = [] }) {
    const b = exigirBarbearia();
    if (!cliente?.fone || !cliente.aceita_mensagens) return { enviado: false, pulado: true };
    const c = canais(b);
    if (c.whatsapp.ativo) {
      try {
        if (c.modelos[motivo]) await c.whatsapp.modelo(cliente.fone, c.modelos[motivo], parametros);
        else await c.whatsapp.texto(cliente.fone, texto);
        registrar(b, cliente.id, "whatsapp", motivo, "enviado");
        return { enviado: true, canal: "whatsapp" };
      } catch (e) {
        registrar(b, cliente.id, "whatsapp", motivo, "erro", e.message);
      }
    }
    if (c.sms.ativo && (b.config.sms?.avisos ?? true)) {
      try {
        await c.sms.enviar(cliente.fone, texto);
        registrar(b, cliente.id, "sms", motivo, "enviado");
        return { enviado: true, canal: "sms" };
      } catch (e) {
        registrar(b, cliente.id, "sms", motivo, "erro", e.message);
      }
    }
    // falhou: algum canal estava ativo e não conseguiu (vale tentar de novo); sem canal ativo, não há o que tentar
    return { enviado: false, falhou: c.whatsapp.ativo || (c.sms.ativo && (b.config.sms?.avisos ?? true)) };
  }

  /* ---------- Código de acesso (WhatsApp ou SMS) ---------- */
  const chaveCodigos = sha256(`codigos:${cfg.chaveMestra || cfg.pastaDados}`);
  const hashCodigo = (destino, codigo) => createHmac("sha256", chaveCodigos).update(`${destino}:${codigo}`).digest("hex");

  async function enviarCodigo(foneBruto, canal) {
    const b = exigirBarbearia();
    const fone = normalizarFone(foneBruto);
    if (!fone) recusar(400, "Digite o celular com DDD.");
    const recentes = repo.um("SELECT COUNT(*) n FROM codigos WHERE destino = ? AND criado_em > ?", fone, agora() - 3600_000).n;
    if (recentes >= cfg.limites.codigosPorHora) recusar(429, "Muitos códigos pedidos para este número. Tente de novo em uma hora.");
    const c = canais(b);
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const texto = `${codigo} é o seu código para entrar na ${b.nome}. Ele vale por 10 minutos.`;
    if (canal === "whatsapp" && !c.whatsapp.ativo) recusar(400, "O login pelo WhatsApp não está ativo nesta barbearia.");
    if (canal !== "whatsapp" && !c.sms.ativo) recusar(400, "O login por SMS não está ativo nesta barbearia.");
    // Grava o código antes de enviar: a contagem do limite por hora já vale para pedidos simultâneos (V-23).
    // Códigos usados, vencidos ou que não saíram ficam com expira_em = 0 e continuam contando por uma hora.
    repo.rodar("DELETE FROM codigos WHERE destino = ? AND criado_em < ?", fone, agora() - 3600_000);
    const reg = repo.inserir("codigos", { destino: fone, canal, hash: hashCodigo(fone, codigo), expira_em: agora() + 10 * 60_000 });
    try {
      if (canal === "whatsapp") {
        if (c.modelos.codigo) await c.whatsapp.codigo(fone, c.modelos.codigo, codigo);
        else await c.whatsapp.texto(fone, texto);
      } else await c.sms.enviar(fone, texto);
    } catch (e) {
      // O detalhe técnico fica no registro de envios; quem chama mostra uma mensagem simples (V-37)
      repo.rodar("UPDATE codigos SET expira_em = 0 WHERE id = ?", reg.id);
      registrar(b, null, canal, "codigo", "erro", e.message);
      throw e;
    }
    registrar(b, null, canal, "codigo", "enviado");
    return { fone, canal };
  }

  /** Confere o código; certo, ele é apagado (uso único). Cinco erros invalidam o código. */
  function conferirCodigo(foneBruto, codigo) {
    const fone = normalizarFone(foneBruto);
    const c = fone ? repo.um("SELECT * FROM codigos WHERE destino = ? AND expira_em > ? ORDER BY criado_em DESC LIMIT 1", fone, agora()) : null;
    if (!c) recusar(400, "Código vencido. Peça um novo.");
    if (c.tentativas >= 5) recusar(429, "Código bloqueado depois de muitas tentativas. Peça um novo.");
    if (!iguais(c.hash, hashCodigo(fone, String(codigo ?? "").replace(/\D/g, "")))) {
      repo.rodar("UPDATE codigos SET tentativas = tentativas + 1 WHERE id = ?", c.id);
      recusar(400, "Código incorreto.");
    }
    // Uso único: invalida os códigos do número, mas mantém os registros para o limite por hora
    repo.rodar("UPDATE codigos SET expira_em = 0 WHERE destino = ?", fone);
    return fone;
  }

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

  /* ---------- Comanda: fechar o atendimento ou vender no balcão ---------- */
  const comissaoDe = (barbeiro, tipo) => (barbeiro ? (tipo === "servico" ? barbeiro.comissao_servico : barbeiro.comissao_produto) : 0);

  /**
   * Registra uma venda: serviços, produtos, desconto, forma de pagamento, baixa no estoque e comissões.
   * itens: [{ tipo: 'servico'|'produto', id, quantidade }]
   */
  function vender({ clienteId = null, barbeiroId = null, agendamento = null, itens, descontoCentavos = 0, forma, autor }) {
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
  function concluir(ag, { produtos = [], descontoCentavos = 0, forma, autor }) {
    return repo.transacao(() => {
      // Confere o status dentro da transação, no registro atual (dois "fechar comanda" ao mesmo tempo: só um passa)
      let a = repo.obter("agendamentos", ag.id) ?? recusar(404, "Agendamento não encontrado.");
      if (["concluido", "cancelado", "faltou"].includes(a.status) || a.venda_id) recusar(409, "Este atendimento já foi encerrado.");
      a = recalcularCobertura(a.id); // a assinatura pode ter sido cancelada ou atrasado desde o agendamento
      // Cobra o preço confirmado ao cliente no agendamento, não o preço atual do serviço (V-30)
      const itens = [{ tipo: "servico", id: a.servico_id, quantidade: 1, clube: Boolean(a.assinatura_id), preco_confirmado: a.preco_centavos }];
      for (const r of repo.todos("SELECT * FROM reservas WHERE agendamento_id = ? AND status = 'reservado'", a.id)) itens.push({ tipo: "produto", id: r.produto_id, quantidade: r.quantidade, reserva_id: r.id });
      for (const p of produtos) itens.push({ tipo: "produto", id: p.id, quantidade: p.quantidade });
      const venda = vender({ clienteId: a.cliente_id, barbeiroId: a.barbeiro_id, agendamento: a, itens, descontoCentavos, forma, autor });
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
      repo.rodar("DELETE FROM comissoes WHERE venda_id = ?", venda.id);
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

  /* ---------- Lista de espera relâmpago ---------- */
  function entrarNaEspera({ cliente, servicoId, barbeiroId = null, dia, de, ate }) {
    const b = exigirBarbearia();
    servicoAtivo(servicoId);
    if (barbeiroId) barbeiroAtivo(barbeiroId);
    if (dia < hoje()) recusar(400, "Escolha um dia a partir de hoje.");
    if (de >= ate) recusar(400, "O horário final precisa ser depois do inicial.");
    const ja = repo.um("SELECT 1 FROM espera WHERE cliente_id = ? AND dia = ? AND status IN ('aguardando','oferecida')", cliente.id, dia);
    if (ja) recusar(409, "Você já está na lista de espera deste dia.");
    return repo.inserir("espera", { barbearia_id: b.id, cliente_id: cliente.id, servico_id: servicoId, barbeiro_id: barbeiroId, dia, de, ate });
  }

  /** Uma vaga abriu: oferece para até 3 pessoas da fila daquele dia. Quem confirmar primeiro leva. */
  async function oferecerVaga(vaga) {
    const b = exigirBarbearia();
    if (b.config.regras.lista_espera === false) return 0;
    const dia = hojeBR(vaga.inicio);
    const fila = repo.lista("espera", "WHERE dia = ? AND status = 'aguardando' ORDER BY criado_em", dia);
    let ofertas = 0;
    for (const e of fila) {
      if (ofertas >= 3) break;
      if (e.barbeiro_id && e.barbeiro_id !== vaga.barbeiro_id) continue;
      const servico = repo.obter("servicos", e.servico_id);
      const barbeiro = repo.obter("barbeiros", vaga.barbeiro_id);
      if (!servico?.ativo || !barbeiro?.ativo || !faz(barbeiro, servico.id)) continue;
      const hora = horaBR(vaga.inicio);
      if (hora < e.de || hora > e.ate) continue;
      const livresAgora = horariosLivres({ barbearia: b, barbeiro, servico, dia, ocupados: ocupados(barbeiro.id, dia), agora: agora() });
      if (!livresAgora.includes(hora)) continue;
      const token = gerarToken(18);
      repo.atualizar("espera", e.id, { status: "oferecida", oferta: { barbeiro_id: barbeiro.id, hora, expira_em: agora() + 30 * 60_000 }, oferta_hash: sha256(token), oferecida_em: agora() });
      const cliente = repo.obter("clientes", e.cliente_id);
      const quandoTxt = quando(paraMs(dia, hora));
      await notificar(cliente, "vaga", { texto: `⚡ ${cliente.nome.split(" ")[0]}, abriu um horário na ${b.nome}: ${servico.nome} com ${barbeiro.nome}, ${quandoTxt}. Quem confirmar primeiro leva: ${linkApp(`#vaga-${token}`)}`, parametros: [cliente.nome.split(" ")[0], quandoTxt, linkApp(`#vaga-${token}`)] });
      ofertas++;
    }
    return ofertas;
  }

  function vagaPorToken(token) {
    const e = repo.lista("espera", "WHERE oferta_hash = ?", sha256(String(token ?? "")))[0];
    if (!e) recusar(404, "Oferta não encontrada.");
    return e;
  }

  function aceitarVaga(token, cliente) {
    const e = vagaPorToken(token);
    if (e.cliente_id !== cliente.id) recusar(403, "Esta oferta foi enviada para outra pessoa.");
    if (e.status !== "oferecida" || !e.oferta || e.oferta.expira_em < agora()) recusar(410, "Esta oferta venceu ou alguém confirmou antes. Você continua na lista de espera.");
    try {
      const ag = agendar({ cliente, servicoId: e.servico_id, barbeiroId: e.oferta.barbeiro_id, dia: e.dia, hora: e.oferta.hora, origem: "espera", autor: cliente.nome });
      repo.atualizar("espera", e.id, { status: "atendida", oferta_hash: null });
      // Quem recebeu a mesma vaga e não confirmou volta para a fila
      repo.rodar("UPDATE espera SET status = 'aguardando', oferta = NULL WHERE dia = ? AND status = 'oferecida' AND id <> ? AND json_extract(oferta, '$.hora') = ? AND json_extract(oferta, '$.barbeiro_id') = ?", e.dia, e.id, e.oferta.hora, e.oferta.barbeiro_id);
      return ag;
    } catch (err) {
      if (err.status === 409) {
        repo.atualizar("espera", e.id, { status: "aguardando", oferta: null, oferta_hash: null });
        recusar(409, "Alguém confirmou antes. Você continua na lista de espera.");
      }
      throw err;
    }
  }

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
  const MAX_TENTATIVAS_LEMBRETE = 3;

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
    // e é tentado de novo na próxima rodada, até 3 vezes. Envio em paralelo, até 4 de cada vez.
    const prox = repo.lista("agendamentos", "WHERE status = 'agendado' AND lembrete_em IS NULL AND lembrete_tentativas < ? AND inicio > ? AND inicio <= ?", MAX_TENTATIVAS_LEMBRETE, t, t + r.lembrete_horas * 3600_000);
    for (const a of prox) repo.atualizar("agendamentos", a.id, { lembrete_em: t });
    await emParalelo(prox, 4, async (a) => {
      const d = detalhar(a);
      const c = repo.obter("clientes", a.cliente_id);
      const envio = await notificar(c, "lembrete", { texto: `⏰ ${c.nome.split(" ")[0]}, lembrete: ${d.servico.nome} com ${d.barbeiro.nome} ${quandoRelativo(a.inicio)}. Chegando, toque em "Estou chegando" no app: ${linkApp()}`, parametros: [c.nome.split(" ")[0], d.servico.nome, quando(a.inicio), d.barbeiro.nome] });
      if (envio.enviado) res.lembretes++;
      else if (envio.falhou) {
        const tentativas = (a.lembrete_tentativas ?? 0) + 1;
        repo.atualizar("agendamentos", a.id, { lembrete_tentativas: tentativas, lembrete_em: tentativas < MAX_TENTATIVAS_LEMBRETE ? null : t });
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

  /** Evento para a agenda do celular (.ics) */
  function ics(a) {
    const b = exigirBarbearia();
    const d = detalhar(a);
    const fmt = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const esc = (s) => String(s ?? "").replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nexor Barber//PT-BR", "BEGIN:VEVENT", `UID:${a.id}@nexor-barber`, `DTSTAMP:${fmt(agora())}`, `DTSTART:${fmt(a.inicio)}`, `DTEND:${fmt(a.fim)}`, `SUMMARY:${esc(`${d.servico.nome} · ${b.nome}`)}`, `DESCRIPTION:${esc(`Com ${d.barbeiro.nome}. Remarcar: ${linkApp()}`)}`, `LOCATION:${esc(b.config.marca?.endereco ?? "")}`, "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Seu horário", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }

  return {
    barbearia,
    exigirBarbearia,
    tokenWebhookAsaas,
    novoTokenWebhook,
    migrarConfig,
    canais,
    segredo,
    notificar,
    registrarEnvio: (cliente_id, canal, motivo, status, erro) => registrar(exigirBarbearia(), cliente_id, canal, motivo, status, erro),
    enviarCodigo,
    conferirCodigo,
    livres,
    diasDisponiveis,
    ocupados,
    agendar,
    detalhar,
    detalharVarios,
    podeMudar,
    cancelar,
    remarcar,
    mudarStatus,
    recalcularCobertura,
    vender,
    concluir,
    cancelarVenda,
    movimentarEstoque,
    disponivel,
    reservar,
    mudarReserva,
    liberarReservas,
    atualizarRetorno,
    assinaturaAtual,
    usosNoCiclo,
    coberturaDoCliente,
    identificarAssinante,
    assinar,
    registrarPagamento,
    pagamentoManual,
    cancelarAssinatura,
    eventoAsaas,
    entrarNaEspera,
    oferecerVaga,
    vagaPorToken,
    aceitarVaga,
    rotina,
    ics,
    linkApp,
  };
}
