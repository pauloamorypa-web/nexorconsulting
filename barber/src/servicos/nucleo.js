/* Regras de negócio do Nexor Barber, usadas pelo painel, pelo app do cliente, pelos webhooks e pela rotina.
   Tudo o que mexe em agenda, estoque ou dinheiro roda dentro de uma transação. */

import { createHmac, randomInt } from "node:crypto";
import { OCUPA, REGRAS_PADRAO, cabe, faz, horariosLivres } from "../regras/agenda.js";
import { assinaturaValida, cicloDe, cicloDeRetorno, cobertura } from "../regras/clube.js";
import { diasEntre, hojeBR, horaBR, paraMs, quando, somarDias } from "../regras/datas.js";
import { gerarToken, sha256 } from "../seguranca.js";
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
    if (!cliente?.fone || !cliente.aceita_mensagens) return { enviado: false };
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
    return { enviado: false };
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
    if (canal === "whatsapp") {
      if (!c.whatsapp.ativo) recusar(400, "O login pelo WhatsApp não está ativo nesta barbearia.");
      if (c.modelos.codigo) await c.whatsapp.codigo(fone, c.modelos.codigo, codigo);
      else await c.whatsapp.texto(fone, texto);
    } else {
      if (!c.sms.ativo) recusar(400, "O login por SMS não está ativo nesta barbearia.");
      await c.sms.enviar(fone, texto);
    }
    repo.rodar("DELETE FROM codigos WHERE destino = ? AND expira_em < ?", fone, agora());
    repo.inserir("codigos", { destino: fone, canal, hash: hashCodigo(fone, codigo), expira_em: agora() + 10 * 60_000 });
    registrar(b, null, canal, "codigo", "enviado");
    return { fone, canal };
  }

  /** Confere o código; certo, ele é apagado (uso único). Cinco erros invalidam o código. */
  function conferirCodigo(foneBruto, codigo) {
    const fone = normalizarFone(foneBruto);
    const c = fone ? repo.um("SELECT * FROM codigos WHERE destino = ? AND expira_em > ? ORDER BY criado_em DESC LIMIT 1", fone, agora()) : null;
    if (!c) recusar(400, "Código vencido. Peça um novo.");
    if (c.tentativas >= 5) recusar(429, "Código bloqueado depois de muitas tentativas. Peça um novo.");
    if (c.hash !== hashCodigo(fone, String(codigo ?? "").replace(/\D/g, ""))) {
      repo.rodar("UPDATE codigos SET tentativas = tentativas + 1 WHERE id = ?", c.id);
      recusar(400, "Código incorreto.");
    }
    repo.rodar("DELETE FROM codigos WHERE destino = ?", fone);
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

  function assinaturaAtual(clienteId) {
    return repo.lista("assinaturas", "WHERE cliente_id = ? AND status IN ('ativa','atrasada','pendente') ORDER BY criado_em DESC LIMIT 1", clienteId)[0] ?? null;
  }
  const usosNoCiclo = (a, servicoId) => (a?.ciclo_inicio ? repo.um("SELECT COUNT(*) n FROM usos WHERE assinatura_id = ? AND servico_id = ? AND ciclo_inicio = ?", a.id, servicoId, a.ciclo_inicio).n : 0);

  /** O clube cobre este serviço neste dia para o cliente? */
  function coberturaDoCliente(clienteId, servicoId, dia) {
    const a = assinaturaAtual(clienteId);
    if (!a) return { coberto: false, assinatura: null };
    const plano = repo.obter("planos", a.plano_id);
    return { ...cobertura(plano, a, servicoId, dia, usosNoCiclo(a, servicoId)), assinatura: a, plano };
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
    const cob = cobertura(plano, a, servicoId, dia, usosNoCiclo(a, servicoId));
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
      if (cob.coberto) repo.inserir("usos", { barbearia_id: b.id, assinatura_id: cob.assinatura.id, servico_id: servico.id, agendamento_id: novo.id, ciclo_inicio: cob.assinatura.ciclo_inicio });
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

  function reservar(ag, produtoId, quantidade) {
    return repo.transacao(() => {
      const p = repo.obter("produtos", produtoId);
      if (!p?.ativo || !p.vitrine) recusar(404, "Produto não encontrado.");
      if (disponivel(p) < quantidade) recusar(409, `${p.nome}: só ${Math.max(0, disponivel(p))} em estoque.`);
      return repo.inserir("reservas", { barbearia_id: ag.barbearia_id, cliente_id: ag.cliente_id, agendamento_id: ag.id, produto_id: p.id, quantidade });
    });
  }

  const disponivel = (p) => p.estoque - repo.um("SELECT COALESCE(SUM(quantidade),0) n FROM reservas WHERE produto_id = ? AND status = 'reservado'", p.id).n;

  /** Assinante no horário: o plano, a situação de hoje e, se saiu pelo clube, quantos usos ainda restam no ciclo */
  function assinanteDoHorario(a) {
    const id = identificarAssinante(a.cliente_id);
    if (!id.assinante) return null;
    const ass = a.assinatura_id ? repo.obter("assinaturas", a.assinatura_id) : null;
    let restante = null;
    if (ass) {
      const item = (repo.obter("planos", ass.plano_id)?.itens ?? []).find((i) => i.servico_id === a.servico_id);
      if (item?.quantidade > 0) restante = Math.max(0, item.quantidade - usosNoCiclo(ass, a.servico_id));
    }
    return { plano: id.plano, status: id.status, coberto: Boolean(a.assinatura_id), restante };
  }

  function detalhar(a) {
    const servico = repo.obter("servicos", a.servico_id);
    const barbeiro = repo.obter("barbeiros", a.barbeiro_id);
    const cliente = repo.obter("clientes", a.cliente_id);
    const reservas = repo.todos("SELECT r.id, r.quantidade, r.status, p.id produto_id, p.nome, p.preco_centavos FROM reservas r JOIN produtos p ON p.id = r.produto_id WHERE r.agendamento_id = ?", a.id);
    return { ...a, dia: hojeBR(a.inicio), hora: horaBR(a.inicio), servico: servico && { id: servico.id, nome: servico.nome, duracao_min: servico.duracao_min, preco_centavos: servico.preco_centavos }, barbeiro: barbeiro && { id: barbeiro.id, nome: barbeiro.nome, cor: barbeiro.cor }, cliente: cliente && { id: cliente.id, nome: cliente.nome, fone: cliente.fone }, reservas, clube: Boolean(a.assinatura_id), assinante: assinanteDoHorario(a) };
  }

  /** O cliente pode cancelar ou remarcar sozinho? (até X horas antes) */
  function podeMudar(a) {
    const b = exigirBarbearia();
    return a.status === "agendado" && a.inicio - agora() >= b.config.regras.cancelamento_horas * 3600_000;
  }

  function cancelar(a, { por, motivo = "cliente" } = {}) {
    if (!["agendado", "chegou"].includes(a.status)) recusar(409, "Este horário não pode mais ser cancelado.");
    const b = exigirBarbearia();
    repo.transacao(() => {
      repo.atualizar("agendamentos", a.id, { status: "cancelado", cancelado_por: motivo });
      repo.rodar("UPDATE reservas SET status = 'cancelado' WHERE agendamento_id = ? AND status = 'reservado'", a.id);
      repo.rodar("DELETE FROM usos WHERE agendamento_id = ?", a.id);
      repo.auditar(b.id, por, "agendamento_cancelado", { agendamento: a.id, motivo });
    });
    // A vaga aberta vai direto para a lista de espera (se o horário ainda não passou)
    if (a.inicio > agora()) oferecerVaga(a).catch((e) => console.error("[espera]", e.message));
    return detalhar(repo.obter("agendamentos", a.id));
  }

  /** Remarcar = novo horário com os mesmos dados; o antigo só é liberado se o novo couber */
  function remarcar(a, { dia, hora, barbeiroId, autor, encaixe = false }) {
    if (a.status !== "agendado") recusar(409, "Só horários marcados podem ser remarcados.");
    const b = exigirBarbearia();
    const servico = servicoAtivo(a.servico_id);
    const barbeiro = barbeiroAtivo(barbeiroId ?? a.barbeiro_id);
    return repo.transacao(() => {
      const r = cabe({ barbearia: b, barbeiro, servico, dia, hora, ocupados: ocupados(barbeiro.id, dia, a.id), agora: agora(), encaixe });
      if (!r.ok) recusar(409, r.motivo);
      repo.atualizar("agendamentos", a.id, { inicio: r.inicio, fim: r.fim, barbeiro_id: barbeiro.id, lembrete_em: null });
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
          linhas.push({ tipo: "servico", id: s.id, nome: s.nome, quantidade: qtd, unitario_centavos: s.preco_centavos, total_centavos: clube ? 0 : s.preco_centavos * qtd, clube, base_comissao: s.preco_centavos * qtd });
        } else {
          const p = repo.obter("produtos", it.id) ?? recusar(404, "Produto não encontrado.");
          const reservado = it.reserva_id ? qtd : 0;
          if (p.estoque < qtd || disponivel(p) + reservado < qtd) recusar(409, `${p.nome}: só ${Math.max(0, p.estoque)} em estoque.`);
          const desc = plano?.desconto_produtos ? Math.round((p.preco_centavos * qtd * plano.desconto_produtos) / 100) : 0;
          const total = p.preco_centavos * qtd - desc;
          linhas.push({ tipo: "produto", id: p.id, nome: p.nome, quantidade: qtd, unitario_centavos: p.preco_centavos, desconto_clube_centavos: desc, total_centavos: total, base_comissao: total, reserva_id: it.reserva_id ?? null });
        }
      }
      if (!linhas.length) recusar(400, "A comanda está vazia.");
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
  function concluir(a, { produtos = [], descontoCentavos = 0, forma, autor }) {
    if (["concluido", "cancelado", "faltou"].includes(a.status)) recusar(409, "Este atendimento já foi encerrado.");
    return repo.transacao(() => {
      const itens = [{ tipo: "servico", id: a.servico_id, quantidade: 1, clube: Boolean(a.assinatura_id) }];
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
  async function assinar({ cliente, planoId, cpf = null, autor, pagoAgora = null }) {
    const b = exigirBarbearia();
    const plano = repo.obter("planos", planoId);
    if (!plano?.ativo) recusar(404, "Plano não encontrado.");
    const atual = assinaturaAtual(cliente.id);
    if (atual && atual.status !== "pendente") recusar(409, "Este cliente já tem uma assinatura. Cancele a atual para trocar de plano.");
    if (atual) repo.atualizar("assinaturas", atual.id, { status: "cancelada", cancelada_em: agora() });
    let a = repo.inserir("assinaturas", { barbearia_id: b.id, cliente_id: cliente.id, plano_id: plano.id, status: "pendente", cpf });
    repo.auditar(b.id, autor, "assinatura_criada", { assinatura: a.id, plano: plano.nome });
    if (pagoAgora) return registrarPagamento(a, { forma: pagoAgora, autor });
    const { asaas } = canais(b);
    if (asaas.ativo) {
      if (!cpf) recusar(400, "Informe o CPF para gerar a cobrança.");
      try {
        const r = await asaas.assinar({ cliente, cpf, plano, assinaturaId: a.id, vencimento: hoje() });
        a = repo.atualizar("assinaturas", a.id, { asaas_cliente: r.cliente, asaas_assinatura: r.assinatura, link: r.pagamento?.link ?? null });
        if (r.pagamento) repo.inserir("cobrancas", { barbearia_id: b.id, assinatura_id: a.id, valor_centavos: r.pagamento.valor || plano.preco_centavos, vencimento: r.pagamento.vencimento ?? hoje(), externo_id: r.pagamento.id, link: r.pagamento.link });
      } catch (e) {
        repo.atualizar("assinaturas", a.id, { status: "cancelada", cancelada_em: agora() });
        recusar(502, `Não foi possível gerar a cobrança: ${e.message}`);
      }
    }
    return a;
  }

  /** Pagamento confirmado (balcão ou Asaas): ativa ou renova o ciclo */
  function registrarPagamento(a, { forma = "outro", autor, externoId = null, valor = null }) {
    const b = exigirBarbearia();
    return repo.transacao(() => {
      const plano = repo.obter("planos", a.plano_id);
      const atual = repo.obter("assinaturas", a.id);
      const inicio = atual.status === "ativa" && atual.ciclo_fim >= hoje() ? somarDias(atual.ciclo_fim, 1) : hoje();
      const ciclo = cicloDe(inicio);
      let cob = externoId ? repo.um("SELECT * FROM cobrancas WHERE externo_id = ?", externoId) : null;
      if (cob?.status === "paga") return atual; // webhook repetido
      if (cob) repo.rodar("UPDATE cobrancas SET status = 'paga', pago_em = ?, forma = ? WHERE id = ?", agora(), forma, cob.id);
      else repo.inserir("cobrancas", { barbearia_id: b.id, assinatura_id: a.id, valor_centavos: valor ?? plano.preco_centavos, vencimento: hoje(), status: "paga", forma, externo_id: externoId, pago_em: agora() });
      repo.auditar(b.id, autor, "assinatura_paga", { assinatura: a.id, forma, ciclo });
      return repo.atualizar("assinaturas", a.id, { status: "ativa", ...ciclo });
    });
  }

  async function cancelarAssinatura(a, { autor }) {
    if (a.status === "cancelada") recusar(409, "Assinatura já cancelada.");
    const b = exigirBarbearia();
    const { asaas } = canais(b);
    if (asaas.ativo && a.asaas_assinatura) await asaas.cancelar(a.asaas_assinatura).catch((e) => console.error("[asaas]", e.message));
    repo.auditar(b.id, autor, "assinatura_cancelada", { assinatura: a.id });
    return repo.atualizar("assinaturas", a.id, { status: "cancelada", cancelada_em: agora() });
  }

  /** Webhook do Asaas: paga, atrasada, cancelada ou nova cobrança da assinatura */
  function eventoAsaas(evento) {
    const acao = acaoAsaas(evento?.event);
    const p = evento?.payment;
    if (!acao || !p?.id) return { ignorado: true };
    const a = p.subscription ? repo.um("SELECT * FROM assinaturas WHERE asaas_assinatura = ?", p.subscription) : null;
    if (!a) return { ignorado: true };
    const b = exigirBarbearia();
    if (acao === "nova") {
      if (!repo.um("SELECT 1 FROM cobrancas WHERE externo_id = ?", p.id)) repo.inserir("cobrancas", { barbearia_id: b.id, assinatura_id: a.id, valor_centavos: Math.round(Number(p.value) * 100), vencimento: p.dueDate, externo_id: p.id, link: p.invoiceUrl ?? null });
      repo.atualizar("assinaturas", a.id, { link: p.invoiceUrl ?? a.link });
      return { ok: true };
    }
    if (acao === "paga") {
      registrarPagamento(repo.ler("assinaturas", a), { forma: String(p.billingType ?? "asaas").toLowerCase(), autor: "Asaas", externoId: p.id, valor: Math.round(Number(p.value) * 100) });
      return { ok: true };
    }
    if (acao === "atrasada" && a.status !== "cancelada") {
      repo.atualizar("assinaturas", a.id, { status: "atrasada", link: p.invoiceUrl ?? a.link });
      const cliente = repo.obter("clientes", a.cliente_id);
      notificar(cliente, "clube_atraso", { texto: `${cliente.nome.split(" ")[0]}, a mensalidade do seu clube na ${b.nome} está em aberto. Pague aqui para continuar usando: ${p.invoiceUrl ?? linkApp()}`, parametros: [cliente.nome.split(" ")[0], p.invoiceUrl ?? linkApp()] }).catch(() => {});
      return { ok: true };
    }
    if (acao === "cancelada") repo.rodar("UPDATE cobrancas SET status = 'cancelada' WHERE externo_id = ?", p.id);
    return { ok: true };
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
  async function rotina() {
    const b = barbearia();
    if (!b) return {};
    const r = b.config.regras;
    const t = agora();
    const res = { lembretes: 0, retornos: 0, ofertas_vencidas: 0, assinaturas_atrasadas: 0 };

    // Lembrete X horas antes
    const prox = repo.lista("agendamentos", "WHERE status = 'agendado' AND lembrete_em IS NULL AND inicio > ? AND inicio <= ?", t, t + r.lembrete_horas * 3600_000);
    for (const a of prox) {
      repo.atualizar("agendamentos", a.id, { lembrete_em: t });
      const d = detalhar(a);
      const c = repo.obter("clientes", a.cliente_id);
      const envio = await notificar(c, "lembrete", { texto: `⏰ ${c.nome.split(" ")[0]}, lembrete: ${d.servico.nome} com ${d.barbeiro.nome} hoje às ${d.hora}. Chegando, toque em "Estou chegando" no app: ${linkApp()}`, parametros: [c.nome.split(" ")[0], d.servico.nome, quando(a.inicio), d.barbeiro.nome] });
      if (envio.enviado) res.lembretes++;
    }

    // Ofertas da lista de espera que venceram voltam para a fila; dias passados expiram
    for (const e of repo.lista("espera", "WHERE status = 'oferecida'")) {
      if (e.oferta?.expira_em < t) {
        repo.atualizar("espera", e.id, { status: "aguardando", oferta: null });
        res.ofertas_vencidas++;
      }
    }
    repo.rodar("UPDATE espera SET status = 'expirada' WHERE status IN ('aguardando','oferecida') AND dia < ?", hojeBR(t));

    // Clube: ciclo vencido sem pagamento vira "atrasada" (3 dias de tolerância)
    for (const a of repo.lista("assinaturas", "WHERE status = 'ativa' AND ciclo_fim < ?", somarDias(hojeBR(t), -3))) {
      repo.atualizar("assinaturas", a.id, { status: "atrasada" });
      res.assinaturas_atrasadas++;
    }

    // Retorno no tempo certo: das 10h às 19h, quem passou do próprio ciclo e não tem horário marcado
    const hora = horaBR(t);
    if (b.config.retorno?.ativo !== false && hora >= "10:00" && hora <= "19:00") {
      const margem = Number(b.config.retorno?.margem_dias ?? 2);
      const candidatos = repo.lista("clientes", "WHERE ativo = 1 AND aceita_mensagens = 1 AND fone IS NOT NULL AND ciclo_dias IS NOT NULL AND ultima_visita IS NOT NULL AND retorno_avisado_em IS NULL");
      for (const c of candidatos.slice(0, 40)) {
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
    canais,
    segredo,
    notificar,
    enviarCodigo,
    conferirCodigo,
    livres,
    diasDisponiveis,
    ocupados,
    agendar,
    detalhar,
    podeMudar,
    cancelar,
    remarcar,
    vender,
    concluir,
    cancelarVenda,
    movimentarEstoque,
    disponivel,
    reservar,
    atualizarRetorno,
    assinaturaAtual,
    usosNoCiclo,
    coberturaDoCliente,
    identificarAssinante,
    assinar,
    registrarPagamento,
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
