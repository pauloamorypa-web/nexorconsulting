/* Coração do atendimento: recebe os eventos da Meta, guarda tudo, decide quem responde (IA ou equipe),
   envia as mensagens e mantém o painel atualizado em tempo real. */

import { config as configGlobal } from "../config.js";
import { configCompleta, ETAPAS } from "../db.js";
import { FALHA } from "../ia/agente.js";
import { componentesDoModelo, criarCloudAPI, dividirTexto, ErroMeta, paraFormatoWhatsApp, textoDoModelo } from "../meta/cloud-api.js";
import { extrairEventos } from "../meta/webhook.js";
import { formatarQuando, situacaoHorario } from "./agenda.js";

export const JANELA_MS = 24 * 3600_000;
const SAIR = /^\s*(parar|pare|sair|stop|cancelar inscri[cç][aã]o|n[aã]o quero (mais )?receber( mensagens)?|descadastrar)\s*[.!]*\s*$/i;
const VOLTAR = /^\s*(voltar a receber|quero receber|reativar)\s*[.!]*\s*$/i;

export const janelaAberta = (contato, agora = Date.now()) => Boolean(contato?.ultima_entrada_em && agora - contato.ultima_entrada_em < JANELA_MS);

/**
 * @param {object} deps
 * @param {ReturnType<import('../db.js').abrirBanco>} deps.repo
 * @param {ReturnType<import('../seguranca.js').criarCofre>} deps.cofre
 * @param {ReturnType<import('../ia/agente.js').criarAgente>} deps.agente
 * @param {ReturnType<import('../ia/copiloto.js').criarCopiloto>} deps.copiloto
 * @param {ReturnType<import('./eventos.js').criarEventos>} deps.eventos
 * @param {ReturnType<import('./midia.js').criarMidia>} deps.midia
 */
export function criarAtendimento({ repo, cofre, agente, copiloto, eventos, midia, fetchFn = fetch, agora = () => Date.now(), ia = configGlobal.ia, versaoGraph = configGlobal.meta.versaoGraph, atrasoAgrupamento }) {
  const apis = new Map();
  const timers = new Map();
  const filas = new Map();

  /* ---------- Utilitários ---------- */

  const empresaCompleta = (id) => {
    const e = repo.empresa(id);
    return e && { ...e, config: configCompleta(e.config) };
  };

  function apiDoCanal(canal) {
    const chave = `${canal.id}:${canal.atualizado_em}`;
    let api = apis.get(chave);
    if (!api) {
      api = criarCloudAPI({ token: cofre.decifrar(canal.token_cripto), idNumero: canal.phone_number_id, idConta: canal.waba_id, versao: versaoGraph, fetchFn });
      for (const k of apis.keys()) if (k.startsWith(`${canal.id}:`)) apis.delete(k);
      apis.set(chave, api);
    }
    return api;
  }

  const canalDaConversa = (empresa_id, conversa) => {
    const c = conversa.canal_id ? repo.canal(conversa.canal_id) : null;
    return c && c.empresa_id === empresa_id ? c : repo.canais(empresa_id).find((x) => x.status === "ativo") ?? repo.canais(empresa_id)[0];
  };

  const emitirConversa = (empresa_id, conversa_id) => {
    const c = repo.conversaDetalhada(empresa_id, conversa_id);
    if (c) eventos.emitir(empresa_id, "conversa", c);
  };

  const nota = (empresa_id, conversa_id, texto, extra = {}) => {
    const m = repo.salvarMensagem({ empresa_id, conversa_id, direcao: "nota", autor: "sistema", tipo: "nota", texto, conteudo: extra });
    eventos.emitir(empresa_id, "mensagem", m);
    return m;
  };

  function enfileirar(conversa_id, tarefa) {
    const anterior = filas.get(conversa_id) ?? Promise.resolve();
    const atual = anterior.then(tarefa, tarefa).catch((err) => console.error(`[atendimento] ${conversa_id}:`, err));
    filas.set(conversa_id, atual);
    atual.finally(() => filas.get(conversa_id) === atual && filas.delete(conversa_id));
    return atual;
  }

  /* ---------- Envio ---------- */

  /**
   * Envia e grava uma mensagem.
   * @param {object} p
   * @param {"texto"|"midia"|"botoes"|"lista"|"modelo"|"link"} p.tipo
   */
  async function enviar({ empresa_id, conversa, contato, autor, autor_id, tipo, dados, responderA }) {
    const canal = canalDaConversa(empresa_id, conversa);
    if (!canal) throw Object.assign(new Error("Nenhum número de WhatsApp conectado. Conecte em Configurações → WhatsApp."), { status: 409 });
    const api = apiDoCanal(canal);
    let registro;
    let chamada;
    const op = { responderA };
    if (tipo === "texto") {
      registro = { tipo: "text", texto: dados.texto };
      chamada = () => api.enviarTexto(contato.wa_id, dados.texto, op);
    } else if (tipo === "midia") {
      registro = { tipo: dados.tipo, texto: dados.legenda ?? "", conteudo: { midia: { arquivo: dados.arquivo, tipo: dados.mime, nome: dados.nome, link: dados.link } } };
      chamada = async () => {
        const id = dados.arquivo ? await api.enviarArquivo(await midia.ler(dados.arquivo), dados.mime, dados.nome) : undefined;
        const m = { id, link: id ? undefined : dados.link, legenda: dados.legenda, nomeArquivo: dados.nome };
        return { image: api.enviarImagem, video: api.enviarVideo, audio: api.enviarAudio, sticker: api.enviarSticker, document: api.enviarDocumento }[dados.tipo](contato.wa_id, m, op);
      };
    } else if (tipo === "botoes") {
      registro = { tipo: "interactive", texto: dados.texto, conteudo: { opcoes: dados.botoes.map((b) => b.titulo) } };
      chamada = () => api.enviarBotoes(contato.wa_id, dados, op);
    } else if (tipo === "lista") {
      registro = { tipo: "interactive", texto: dados.texto, conteudo: { opcoes: dados.secoes.flatMap((s) => s.linhas.map((l) => l.titulo)) } };
      chamada = () => api.enviarLista(contato.wa_id, dados, op);
    } else if (tipo === "link") {
      registro = { tipo: "interactive", texto: `${dados.texto}\n${dados.url}`, conteudo: { link: dados.url } };
      chamada = () => api.enviarLink(contato.wa_id, dados, op);
    } else if (tipo === "modelo") {
      const modelo = repo.modelo(empresa_id, dados.nome, dados.idioma);
      registro = { tipo: "template", texto: textoDoModelo(modelo, dados.variaveis), conteudo: { nome: dados.nome, idioma: dados.idioma, variaveis: dados.variaveis } };
      chamada = () => api.enviarModelo(contato.wa_id, { nome: dados.nome, idioma: dados.idioma, componentes: componentesDoModelo(modelo, dados.variaveis, { cabecalhoMidia: dados.cabecalhoMidia }) }, op);
    } else throw new Error(`tipo de envio desconhecido: ${tipo}`);

    const m = repo.salvarMensagem({ empresa_id, conversa_id: conversa.id, direcao: "saida", autor, autor_id, status: "pendente", responde_a: responderA, ...registro });
    eventos.emitir(empresa_id, "mensagem", m);
    try {
      const r = await chamada();
      repo.definirWamid(m.id, r.wamid);
      const final = { ...m, wamid: r.wamid, status: "enviada" };
      eventos.emitir(empresa_id, "mensagem", final);
      return final;
    } catch (err) {
      const erro = err instanceof ErroMeta ? `${err.message}${err.detalhe && err.detalhe !== err.message ? ` (${err.detalhe})` : ""}` : err.message;
      repo.falhaMensagem(m.id, erro);
      eventos.emitir(empresa_id, "mensagem", { ...m, status: "falhou", erro });
      if (err instanceof ErroMeta && [190, 0].includes(err.codigo)) repo.atualizarStatusCanal(canal.id, "erro", err.message);
      throw Object.assign(err, { mensagem_id: m.id });
    }
  }

  /** Envia o resultado do agente: fotos, texto, opções */
  async function enviarRespostaDaIA({ empresa, conversa, contato, r, responderA }) {
    const base = { empresa_id: empresa.id, conversa, contato, autor: "ia" };
    for (const m of r.midias) await enviar({ ...base, tipo: "midia", dados: { tipo: "image", link: m.link, legenda: m.legenda } });
    const texto = paraFormatoWhatsApp(r.texto);
    if (texto) {
      // Respostas longas vão em mensagens separadas por parágrafo duplo, como uma pessoa escreveria
      const blocos = texto.length > 600 ? texto.split(/\n\s*\n/).flatMap((b) => dividirTexto(b)) : dividirTexto(texto);
      for (const [i, b] of blocos.entries()) await enviar({ ...base, tipo: "texto", dados: { texto: b }, responderA: i === 0 ? responderA : undefined });
    }
    if (r.opcoes) await enviar({ ...base, tipo: r.opcoes.tipo, dados: { ...r.opcoes, texto: paraFormatoWhatsApp(r.opcoes.texto) } });
  }

  /* ---------- Resposta automática ---------- */

  function agendarResposta(empresa, conversa_id, segundos = empresa.config.agente.agrupar_segundos) {
    clearTimeout(timers.get(conversa_id));
    const ms = atrasoAgrupamento ?? Math.max(0, Math.min(30, Number(segundos) || 0)) * 1000;
    const t = setTimeout(() => {
      timers.delete(conversa_id);
      enfileirar(conversa_id, () => responderConversa(empresa.id, conversa_id));
    }, ms);
    t.unref?.();
    timers.set(conversa_id, t);
  }

  async function responderConversa(empresa_id, conversa_id, { notaFinal, followup = false } = {}) {
    const empresa = empresaCompleta(empresa_id);
    let conversa = repo.conversa(empresa_id, conversa_id);
    if (!empresa || !conversa || conversa.modo !== "ia" || conversa.status === "resolvida") return null;
    const modo = empresa.config.agente.modo;
    if (modo === "desligado") return null;
    let contato = repo.contato(empresa_id, conversa.contato_id);
    if (!janelaAberta(contato, agora())) return null;

    const historico = repo.historicoDoContato(empresa_id, contato.id, ia.historico);
    const ultimaEntrada = [...historico].reverse().find((m) => m.direcao === "entrada");
    if (!followup && historico.at(-1)?.direcao !== "entrada") return null; // já respondida

    const canal = canalDaConversa(empresa_id, conversa);
    if (canal && ultimaEntrada?.wamid && !followup) apiDoCanal(canal).marcarComoLida(ultimaEntrada.wamid, { digitando: true });
    eventos.emitir(empresa_id, "digitando", { conversa_id, ativo: true });

    const horario = situacaoHorario(empresa.config.horario, agora());
    const agendamentos = repo.agendamentosDoContato(empresa_id, contato.id).map((a) => ({ ...a, texto: formatarQuando(a.inicio) }));
    let r;
    try {
      r = await agente.responder({ empresa, contato, conversa, historico, horario, notaFinal, agendamentos, simulacao: false });
    } catch (err) {
      console.error(`[ia] falha na conversa ${conversa_id}:`, err?.status ?? "", err?.message ?? err);
      eventos.emitir(empresa_id, "digitando", { conversa_id, ativo: false });
      if (followup) return null;
      r = { texto: FALHA, midias: [], opcoes: null, transferencia: { motivo: "falha técnica da IA", resumo: "A IA não conseguiu responder. Continue o atendimento.", prioridade: "alta" }, encerrar: null, eventos: [], ferramentas: [] };
    }
    eventos.emitir(empresa_id, "digitando", { conversa_id, ativo: false });
    contato = r.contato ?? contato;

    // Copiloto: a IA prepara a resposta e a equipe aprova
    if (modo === "copiloto" && !followup) {
      const sugestao = { texto: r.texto, opcoes: r.opcoes, midias: r.midias, transferencia: r.transferencia };
      repo.atualizarConversa(empresa_id, conversa_id, { analise: { ...(conversa.analise ?? {}), sugestao } });
      eventos.emitir(empresa_id, "sugestao", { conversa_id, ...sugestao });
      return r;
    }

    // Se a equipe assumiu enquanto a IA pensava, não envia
    conversa = repo.conversa(empresa_id, conversa_id);
    if (conversa.modo !== "ia") return null;

    // Se o cliente mandou várias mensagens seguidas, a resposta cita a última para ficar claro a que ela responde
    const ultimaSaidaEm = historico.findLast((x) => x.direcao === "saida")?.criada_em ?? 0;
    const pendentes = historico.filter((m) => m.direcao === "entrada" && m.criada_em > ultimaSaidaEm).length;
    try {
      await enviarRespostaDaIA({ empresa, conversa, contato, r, responderA: pendentes > 2 && !followup ? ultimaEntrada?.wamid : undefined });
    } catch (err) {
      console.error(`[ia] falha ao enviar na conversa ${conversa_id}:`, err.message);
      nota(empresa_id, conversa_id, `⚠️ A resposta da IA não foi entregue: ${err.message}`);
    }

    const campos = {};
    if (conversa.primeira_resposta_ms === null && ultimaEntrada) campos.primeira_resposta_ms = Math.max(0, agora() - (historico.find((m) => m.direcao === "entrada" && m.conversa_id === conversa_id)?.criada_em ?? ultimaEntrada.criada_em));
    if (followup) campos.followups = conversa.followups + 1;
    for (const ev of r.eventos) {
      if (ev.tipo === "agendamento") {
        nota(empresa_id, conversa_id, `📅 Agendado pela IA: ${ev.agendamento.servico} em ${formatarQuando(ev.agendamento.inicio)}`);
        eventos.emitir(empresa_id, "agendamento", ev.agendamento);
      }
      if (ev.tipo === "cancelamento") nota(empresa_id, conversa_id, `❌ Cancelado pela IA: ${ev.agendamento.servico} em ${formatarQuando(ev.agendamento.inicio)}${ev.motivo ? ` · ${ev.motivo}` : ""}`);
    }
    if (r.transferencia) {
      Object.assign(campos, { modo: "humano", status: "aguardando", prioridade: r.transferencia.prioridade ?? "normal", resumo: r.transferencia.resumo });
      nota(empresa_id, conversa_id, `🙋 Transferido para a equipe: ${r.transferencia.motivo}\n${r.transferencia.resumo}`, { transferencia: r.transferencia });
      eventos.emitir(empresa_id, "alerta", { tipo: "transferencia", conversa_id, contato: contato.nome || contato.nome_perfil || contato.wa_id, motivo: r.transferencia.motivo, prioridade: r.transferencia.prioridade ?? "normal" });
    } else if (r.encerrar) {
      Object.assign(campos, { status: "resolvida", resolvida_por: "ia", resolvida_em: agora(), resumo: r.encerrar.resumo });
    }
    repo.atualizarConversa(empresa_id, conversa_id, campos);
    if (r.contatoAtualizado) eventos.emitir(empresa_id, "contato", repo.contato(empresa_id, contato.id));
    emitirConversa(empresa_id, conversa_id);

    const atual = repo.conversa(empresa_id, conversa_id);
    if (atual.entradas_desde_analise >= ia.analisarACada || campos.status === "resolvida" || r.transferencia) analisar(empresa_id, conversa_id).catch((e) => console.error("[analise]", e.message));
    return r;
  }

  /* ---------- Análise inteligente ---------- */

  async function analisar(empresa_id, conversa_id) {
    const empresa = empresaCompleta(empresa_id);
    const conversa = repo.conversa(empresa_id, conversa_id);
    if (!conversa) return null;
    const contato = repo.contato(empresa_id, conversa.contato_id);
    const historico = repo.mensagens(conversa_id, { limite: 120 });
    if (!historico.some((m) => m.direcao === "entrada")) return null;
    repo.atualizarConversa(empresa_id, conversa_id, { entradas_desde_analise: 0 });
    const a = await copiloto.analisar({ empresa, contato, historico });
    const analise = { ...a, sugestao: conversa.analise?.sugestao, analisada_em: agora() };
    repo.atualizarConversa(empresa_id, conversa_id, { sentimento: a.sentimento, intencao: a.intencao.toLowerCase().slice(0, 60), resumo: a.resumo, analise, prioridade: a.urgencia === "alta" || a.precisa_humano ? "alta" : conversa.prioridade });
    // A etapa do funil só avança automaticamente (nunca volta), e "perdido" fica para a equipe decidir
    const avancar = ETAPAS.indexOf(a.etapa_sugerida) > ETAPAS.indexOf(contato.etapa) && !["perdido"].includes(a.etapa_sugerida) && contato.etapa !== "perdido";
    repo.atualizarContato(empresa_id, contato.id, { pontuacao: a.temperatura_lead, ...(avancar ? { etapa: a.etapa_sugerida } : {}) });
    if (a.precisa_humano && conversa.modo === "ia" && conversa.status !== "resolvida") {
      eventos.emitir(empresa_id, "alerta", { tipo: "atencao", conversa_id, contato: contato.nome || contato.nome_perfil || contato.wa_id, motivo: a.motivo_alerta || "A IA recomenda atenção humana" });
    }
    emitirConversa(empresa_id, conversa_id);
    eventos.emitir(empresa_id, "contato", repo.contato(empresa_id, contato.id));
    return analise;
  }

  /* ---------- Recebimento (webhook) ---------- */

  async function receberMensagem(ev) {
    const canal = repo.canalPorNumero(ev.idNumero);
    if (!canal) return console.warn(`[webhook] número ${ev.idNumero} não está conectado a nenhuma empresa`);
    if (repo.existeWamid(ev.wamid)) return; // a Meta pode reenviar o mesmo evento
    const empresa = empresaCompleta(canal.empresa_id);
    if (canal.status !== "ativo") repo.atualizarStatusCanal(canal.id, "ativo");

    const { contato, novo } = repo.obterOuCriarContato(empresa.id, ev.de, ev.nome);
    repo.registrarEntradaContato(contato.id, ev.quando);
    let conversa = repo.conversaAtiva(empresa.id, contato.id);
    if (!conversa) conversa = repo.criarConversa({ empresa_id: empresa.id, contato_id: contato.id, canal_id: canal.id, modo: empresa.config.agente.modo === "desligado" ? "humano" : "ia" });
    else if (conversa.canal_id !== canal.id) repo.atualizarConversa(empresa.id, conversa.id, { canal_id: canal.id });

    const conteudo = {};
    if (ev.midia) conteudo.midia = { ...ev.midia };
    if (ev.local) conteudo.local = ev.local;
    if (ev.contatos) conteudo.contatos = ev.contatos;
    if (ev.resposta) conteudo.resposta = ev.resposta;
    if (ev.pedido) conteudo.pedido = ev.pedido;
    if (ev.formulario) conteudo.formulario = ev.formulario;
    if (ev.encaminhada) conteudo.encaminhada = true;
    conteudo.enviada_em = ev.quando; // horário do celular do cliente; a ordem usa o horário de chegada

    // Mídias: baixa na hora (a URL da Meta expira) antes de chamar a IA
    if (ev.midia?.id) {
      try {
        const { dados, tipo } = await apiDoCanal(canal).baixarMidia(ev.midia.id);
        conteudo.midia.arquivo = await midia.salvar(empresa.id, dados, tipo ?? ev.midia.tipo);
        conteudo.midia.tipo = tipo ?? ev.midia.tipo;
        conteudo.midia.tamanho = dados.length;
      } catch (err) {
        console.error("[midia] falha ao baixar:", err.message);
        conteudo.midia.erro = err.message;
      }
    }

    if (ev.tipo === "reaction") {
      const alvo = repo.mensagemPorWamid(ev.reacao?.wamid);
      const m = repo.salvarMensagem({ empresa_id: empresa.id, conversa_id: alvo?.conversa_id ?? conversa.id, wamid: ev.wamid, direcao: "entrada", autor: "cliente", tipo: "reaction", texto: ev.reacao?.emoji ?? "", conteudo: { alvo: ev.reacao?.wamid } });
      eventos.emitir(empresa.id, "mensagem", m);
      return;
    }

    const m = repo.salvarMensagem({ empresa_id: empresa.id, conversa_id: conversa.id, wamid: ev.wamid, direcao: "entrada", autor: "cliente", tipo: ev.tipo, texto: ev.texto, conteudo, responde_a: ev.responde_a, criada_em: agora() });
    eventos.emitir(empresa.id, "mensagem", m);
    if (novo) eventos.emitir(empresa.id, "contato", repo.contato(empresa.id, contato.id));

    // Resposta a campanha
    const envio = repo.envioRecenteDoContato(contato.id, agora() - 7 * 86400_000);
    if (envio) {
      repo.marcarEnvio(envio.id, "respondido");
      repo.recontarCampanha(envio.campanha_id);
    }

    // Descadastro de campanhas sem depender da IA
    if (ev.tipo === "text" && SAIR.test(ev.texto)) {
      repo.atualizarContato(empresa.id, contato.id, { opt_out: true });
      nota(empresa.id, conversa.id, "🔕 O cliente pediu para não receber campanhas.");
      await enviar({ empresa_id: empresa.id, conversa, contato, autor: "sistema", tipo: "texto", dados: { texto: "Pronto, você não vai mais receber nossas mensagens promocionais. Se quiser voltar a receber, é só escrever *voltar a receber*. Para qualquer dúvida, estamos por aqui." } }).catch(() => {});
      emitirConversa(empresa.id, conversa.id);
      return;
    }
    if (ev.tipo === "text" && VOLTAR.test(ev.texto) && contato.opt_out) {
      repo.atualizarContato(empresa.id, contato.id, { opt_out: false });
      nota(empresa.id, conversa.id, "🔔 O cliente voltou a aceitar campanhas.");
    }

    emitirConversa(empresa.id, conversa.id);
    const atual = repo.conversa(empresa.id, conversa.id);
    if (atual.modo === "ia" && empresa.config.agente.modo !== "desligado" && ev.tipo !== "nao_suportado") agendarResposta(empresa, conversa.id);
    else if (atual.modo === "humano") eventos.emitir(empresa.id, "alerta", { tipo: "mensagem", conversa_id: conversa.id, contato: contato.nome || contato.nome_perfil || contato.wa_id, motivo: (ev.texto || `[${ev.tipo}]`).slice(0, 120) });
  }

  function receberStatus(ev) {
    const m = repo.atualizarStatusMensagem(ev.wamid, ev.status, ev.erro ? `${ev.erro.codigo}: ${ERRO(ev.erro)}` : null);
    if (m) eventos.emitir(m.empresa_id, "status", { id: m.id, conversa_id: m.conversa_id, wamid: ev.wamid, status: m.status, erro: m.erro });
    const envio = repo.envioPorWamid(ev.wamid);
    if (envio && envio.status !== "respondido") {
      const mapa = { enviada: "enviado", entregue: "entregue", lida: "lido", falhou: "falhou" };
      const ordem = ["fila", "enviado", "entregue", "lido", "respondido"];
      const novo = mapa[ev.status];
      if (novo === "falhou" || ordem.indexOf(novo) > ordem.indexOf(envio.status)) {
        repo.marcarEnvio(envio.id, novo, { erro: ev.erro ? ERRO(ev.erro) : null });
        repo.recontarCampanha(envio.campanha_id);
      }
    }
  }

  const ERRO = (e) => (e.codigo && new ErroMeta(400, { error: { code: e.codigo, message: e.detalhe ?? e.titulo } }).message) || e.titulo;

  async function processarWebhook(payload) {
    for (const ev of extrairEventos(payload)) {
      try {
        if (ev.evento === "mensagem") await receberMensagem(ev);
        else if (ev.evento === "status") receberStatus(ev);
        else if (ev.evento === "modelo") {
          repo.atualizarStatusModelo(ev.idModelo, ev.situacao);
          const canal = repo.canalPorNumero(ev.idNumero);
          if (canal) eventos.emitir(canal.empresa_id, "modelo", ev);
        } else if (ev.evento === "erro") console.error("[webhook] erro da Meta:", ev);
      } catch (err) {
        console.error("[webhook] falha ao processar evento:", ev.evento, err);
      }
    }
  }

  /* ---------- Ações da equipe ---------- */

  async function enviarDaEquipe({ empresa_id, conversa_id, usuario, tipo, dados, responderA }) {
    const conversa = repo.conversa(empresa_id, conversa_id);
    if (!conversa) throw Object.assign(new Error("Conversa não encontrada."), { status: 404 });
    const contato = repo.contato(empresa_id, conversa.contato_id);
    if (tipo !== "modelo" && !janelaAberta(contato, agora())) {
      throw Object.assign(new Error("A janela de 24 horas fechou. Para falar com este cliente, envie um modelo de mensagem aprovado."), { status: 409, codigo: "janela_fechada" });
    }
    clearTimeout(timers.get(conversa_id));
    // Quem responde assume a conversa: a IA para de responder até ser devolvida
    if (conversa.modo === "ia" || conversa.status !== "aberta" || !conversa.atribuida_a) {
      repo.atualizarConversa(empresa_id, conversa_id, { modo: "humano", status: "aberta", atribuida_a: conversa.atribuida_a ?? usuario.id });
    }
    const assinatura = empresaCompleta(empresa_id).config.agente.assinatura;
    const d = tipo === "texto" && assinatura ? { ...dados, texto: `*${usuario.nome.split(" ")[0]}:*\n${dados.texto}` } : dados;
    const m = await enviar({ empresa_id, conversa: repo.conversa(empresa_id, conversa_id), contato, autor: "humano", autor_id: usuario.id, tipo, dados: d, responderA });
    if (conversa.primeira_resposta_ms === null) repo.atualizarConversa(empresa_id, conversa_id, { primeira_resposta_ms: Math.max(0, agora() - conversa.criada_em) });
    repo.marcarLidas(empresa_id, conversa_id);
    emitirConversa(empresa_id, conversa_id);
    return m;
  }

  function mudarModo(empresa_id, conversa_id, { modo, usuario }) {
    const c = repo.conversa(empresa_id, conversa_id);
    if (!c) return null;
    const novo = repo.atualizarConversa(empresa_id, conversa_id, modo === "ia" ? { modo: "ia", status: "aberta", atribuida_a: null } : { modo: "humano", status: "aberta", atribuida_a: usuario.id });
    nota(empresa_id, conversa_id, modo === "ia" ? `🤖 ${usuario.nome} devolveu a conversa para a IA.` : `🙋 ${usuario.nome} assumiu a conversa.`);
    emitirConversa(empresa_id, conversa_id);
    // Se o cliente está esperando resposta, a IA responde ao receber a conversa de volta
    if (modo === "ia") {
      const ultima = repo.mensagens(conversa_id, { limite: 5 }).filter((m) => m.direcao !== "nota").at(-1);
      if (ultima?.direcao === "entrada") agendarResposta(empresaCompleta(empresa_id), conversa_id, 1);
    }
    return novo;
  }

  function resolver(empresa_id, conversa_id, usuario) {
    clearTimeout(timers.get(conversa_id));
    const c = repo.atualizarConversa(empresa_id, conversa_id, { status: "resolvida", resolvida_por: usuario ? "humano" : "ia", resolvida_em: agora(), nao_lidas: 0 });
    if (usuario) nota(empresa_id, conversa_id, `✅ ${usuario.nome} encerrou o atendimento.`);
    emitirConversa(empresa_id, conversa_id);
    analisar(empresa_id, conversa_id).catch(() => {});
    return c;
  }

  /** Inicia conversa com um contato (fora da janela, só com modelo) */
  async function iniciarConversa({ empresa_id, wa_id, nome, usuario, modelo }) {
    const { contato } = repo.obterOuCriarContato(empresa_id, wa_id.replace(/\D/g, ""), undefined);
    if (nome && !contato.nome) repo.atualizarContato(empresa_id, contato.id, { nome });
    let conversa = repo.conversaAtiva(empresa_id, contato.id) ?? repo.criarConversa({ empresa_id, contato_id: contato.id, canal_id: repo.canais(empresa_id)[0]?.id, modo: "humano" });
    if (modelo) await enviarDaEquipe({ empresa_id, conversa_id: conversa.id, usuario, tipo: "modelo", dados: modelo });
    return repo.conversa(empresa_id, conversa.id);
  }

  /** Playground: conversa de teste com a IA, sem WhatsApp e sem gravar nada */
  async function simular({ empresa_id, mensagens, contato: dadosContato }) {
    const empresa = empresaCompleta(empresa_id);
    const contato = { id: "simulacao", wa_id: "5500000000000", nome: dadosContato?.nome ?? null, nome_perfil: "Cliente de teste", email: null, etapa: "novo", tags: [], campos: {}, ...dadosContato };
    const t0 = agora() - mensagens.length * 1000;
    const historico = mensagens.map((m, i) => ({
      direcao: m.autor === "cliente" ? "entrada" : "saida",
      autor: m.autor === "cliente" ? "cliente" : "ia",
      tipo: m.tipo ?? "text",
      texto: m.texto,
      conteudo: m.opcoes ? { opcoes: m.opcoes } : {},
      criada_em: t0 + i * 1000,
    }));
    const r = await agente.responder({ empresa, contato, conversa: { id: "simulacao" }, historico, horario: situacaoHorario(empresa.config.horario, agora()), simulacao: true });
    return { texto: paraFormatoWhatsApp(r.texto), opcoes: r.opcoes, midias: r.midias, transferencia: r.transferencia, encerrar: r.encerrar, ferramentas: r.ferramentas, contato: r.contato };
  }

  return {
    apiDoCanal,
    processarWebhook,
    responderConversa,
    agendarResposta,
    enviar,
    enviarDaEquipe,
    mudarModo,
    resolver,
    analisar,
    iniciarConversa,
    simular,
    nota,
    emitirConversa,
    empresaCompleta,
    /** Espera as respostas pendentes (usado nos testes e ao desligar) */
    async ocioso() {
      while (timers.size || filas.size) {
        await new Promise((r) => setTimeout(r, 5));
        await Promise.all([...filas.values()]);
      }
    },
    parar() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
