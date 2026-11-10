/* API do app do cliente (cookie nx_barber_cliente): entrar com Google, WhatsApp ou SMS, agendar em poucos toques,
   "o de sempre", lista de espera, clube de assinatura, vitrine de produtos e "estou chegando". */

import { z } from "zod";
import { deSempre, proximosDias } from "../regras/clube.js";
import { diasEntre, hojeBR, paraMs, somarDias } from "../regras/datas.js";
import { gerarToken, sha256 } from "../seguranca.js";
import { falha } from "./roteador.js";
import { COOKIE_CLIENTE, barbeiroPublico, clientePublico, cpf, dia, email, hora, id, nascimento, op, t, validar } from "./validacao.js";

const APP = { cliente: true };

export function rotasApp({ r, repo, nucleo, cfg, agora, limitar, cookie, google }) {
  const hoje = () => hojeBR(agora());

  function sessaoCliente(cookies) {
    const s = cookies[COOKIE_CLIENTE] ? repo.sessao(sha256(cookies[COOKIE_CLIENTE])) : null;
    if (!s?.cliente_id) return null;
    const c = repo.obter("clientes", s.cliente_id);
    return c?.ativo ? c : null;
  }
  function iniciar(res, cliente) {
    const token = gerarToken();
    repo.criarSessao(sha256(token), { cliente_id: cliente.id }, cfg.sessaoClienteDias);
    cookie(res, COOKIE_CLIENTE, token, cliente ? cfg.sessaoClienteDias : 0);
  }
  const meu = (ctx, tabela, idReg, rotulo) => {
    const x = repo.obter(tabela, idReg);
    if (!x || x.cliente_id !== ctx.cliente.id) falha(404, `${rotulo} não encontrado.`);
    return x;
  };

  /** Vitrine da barbearia: o que o app precisa antes do login (serviços, barbeiros, planos, formas de entrar) */
  r.get("/api/app/info", { publico: true }, () => {
    const b = nucleo.exigirBarbearia();
    const c = nucleo.canais(b);
    const m = b.config.marca ?? {};
    return {
      nome: b.nome,
      marca: { cor: m.cor ?? "#3b8dff", slogan: m.slogan ?? null, endereco: m.endereco ?? null, telefone: m.telefone ?? null, instagram: m.instagram ?? null, mapa: m.mapa || null },
      entrar: { google: b.config.google?.client_id || null, whatsapp: c.whatsapp.ativo, sms: c.sms.ativo },
      // Por onde saem confirmação e lembrete, e se a mensalidade do clube é cobrada online (Asaas) ou no balcão
      avisos: { whatsapp: c.whatsapp.ativo, sms: c.sms.ativo && (b.config.sms?.avisos ?? true) },
      cobranca_online: c.asaas.ativo,
      regras: { cancelamento_horas: b.config.regras.cancelamento_horas, janela_dias: b.config.regras.janela_dias, lista_espera: b.config.regras.lista_espera !== false && !repo.ocultos(b.id).includes("modulo.espera") },
      servicos: repo.lista("servicos", "WHERE ativo = 1 ORDER BY ordem, nome").map((s) => ({ id: s.id, nome: s.nome, descricao: s.descricao, categoria: s.categoria, duracao_min: s.duracao_min, preco_centavos: s.preco_centavos })),
      barbeiros: repo.lista("barbeiros", "WHERE ativo = 1 ORDER BY ordem, nome").map(barbeiroPublico),
      planos: repo.ocultos(b.id).includes("modulo.clube") ? [] : repo.lista("planos", "WHERE ativo = 1 ORDER BY preco_centavos").map((p) => ({ id: p.id, nome: p.nome, descricao: p.descricao, preco_centavos: p.preco_centavos, itens: p.itens, dias_semana: p.dias_semana, desconto_produtos: p.desconto_produtos })),
      vitrine: repo.ocultos(b.id).includes("modulo.produtos") ? [] : repo.lista("produtos", "WHERE ativo = 1 AND vitrine = 1 AND preco_centavos > 0 ORDER BY nome").map((p) => ({ id: p.id, nome: p.nome, descricao: p.descricao, categoria: p.categoria, preco_centavos: p.preco_centavos, disponivel: Math.max(0, nucleo.disponivel(p)) })),
    };
  });

  /* ---------- Entrar ---------- */
  r.post("/api/app/codigo", { publico: true }, async ({ corpo, ip }) => {
    const d = validar(z.object({ fone: z.string().max(30), canal: z.enum(["whatsapp", "sms"]) }), await corpo());
    limitar(`codigo:${ip}`, 10, 3600_000);
    try {
      const r2 = await nucleo.enviarCodigo(d.fone, d.canal);
      return { ok: true, fone: `•••• ${r2.fone.slice(-4)}`, canal: r2.canal };
    } catch (e) {
      if (e.status) throw e;
      // Sugere o outro canal só se ele estiver ativo nesta barbearia (V-37)
      const c = nucleo.canais();
      const outro = d.canal === "whatsapp" ? c.sms.ativo && "por SMS" : c.whatsapp.ativo && "pelo WhatsApp";
      falha(502, `${d.canal === "whatsapp" ? "Não conseguimos mandar o código pelo WhatsApp agora." : "Não conseguimos mandar o SMS agora."} ${outro ? `Tente ${outro}.` : "Tente de novo em alguns minutos."}`);
    }
  });

  r.post("/api/app/verificar", { publico: true }, async ({ corpo, res, ip }) => {
    const d = validar(z.object({ fone: z.string().max(30), codigo: z.string().max(10) }), await corpo());
    limitar(`verificar:${ip}`, 20);
    const fone = nucleo.conferirCodigo(d.fone, d.codigo);
    const b = nucleo.exigirBarbearia();
    let c = repo.lista("clientes", "WHERE fone = ?", fone)[0];
    const novo = !c;
    if (!c) c = repo.inserir("clientes", { barbearia_id: b.id, nome: "Cliente", fone });
    iniciar(res, c);
    return { ok: true, novo: novo || c.nome === "Cliente" };
  });

  r.post("/api/app/google", { publico: true }, async ({ corpo, res, ip }) => {
    limitar(`google:${ip}`, 20);
    const d = validar(z.object({ credencial: z.string().min(20).max(5000) }), await corpo());
    const b = nucleo.exigirBarbearia();
    const clientId = b.config.google?.client_id;
    if (!clientId) falha(400, "O login com Google não está ativo nesta barbearia.");
    let g;
    try {
      g = await google.conferir(d.credencial, clientId);
    } catch {
      falha(502, "Não foi possível falar com o Google agora. Tente pelo WhatsApp.");
    }
    if (!g) falha(401, "Login do Google inválido ou vencido. Tente de novo.");
    // Só pela conta Google (o e-mail digitado pela equipe não liga contas); quem já era cliente une pelo celular
    let c = repo.lista("clientes", "WHERE google_sub = ?", g.sub)[0];
    if (!c) c = repo.inserir("clientes", { barbearia_id: b.id, nome: g.nome ?? "Cliente", email: g.email, google_sub: g.sub });
    iniciar(res, c);
    return { ok: true, novo: !c.fone, precisa_celular: !c.fone };
  });

  r.post("/api/app/sair", { publico: true }, ({ cookies, res }) => {
    if (cookies[COOKIE_CLIENTE]) repo.encerrarSessao(sha256(cookies[COOKIE_CLIENTE]));
    res.setHeader("Set-Cookie", `${COOKIE_CLIENTE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  /* ---------- Minha conta ---------- */
  function sugestao(cliente) {
    const hist = repo.lista("agendamentos", "WHERE cliente_id = ? AND status = 'concluido' ORDER BY inicio DESC LIMIT 10", cliente.id);
    const s = deSempre(hist);
    if (!s) return null;
    const servico = repo.obter("servicos", s.servico_id);
    const barbeiro = repo.obter("barbeiros", s.barbeiro_id);
    if (!servico?.ativo || !barbeiro?.ativo) return null;
    // Próximo horário livre perto do horário de sempre, no dia da semana de sempre (ou no próximo dia com vaga)
    // Começa a procurar perto da data em que o cliente costuma voltar (nunca antes de hoje)
    const previsto = cliente.ultima_visita ? somarDias(cliente.ultima_visita, Math.max(1, (cliente.ciclo_dias ?? 7) - 3)) : hoje();
    const inicio = previsto > hoje() ? previsto : hoje();
    for (const d of [...proximosDias(inicio, s.dia_semana, 3), ...proximosDias(inicio, null, 10)]) {
      const livres = nucleo.livres({ servicoId: servico.id, barbeiroId: barbeiro.id, dia: d }).horarios;
      if (!livres.length) continue;
      const alvo = paraMs(d, s.hora);
      const melhor = livres.map((h) => [h, Math.abs(paraMs(d, h) - alvo)]).sort((a, b) => a[1] - b[1])[0][0];
      return { servico: { id: servico.id, nome: servico.nome, duracao_min: servico.duracao_min, preco_centavos: servico.preco_centavos }, barbeiro: barbeiroPublico(barbeiro), dia: d, hora: melhor, hora_de_sempre: s.hora, dia_semana: s.dia_semana };
    }
    return { servico: { id: servico.id, nome: servico.nome, duracao_min: servico.duracao_min, preco_centavos: servico.preco_centavos }, barbeiro: barbeiroPublico(barbeiro), dia: null, hora: null, hora_de_sempre: s.hora, dia_semana: s.dia_semana };
  }

  function clube(cliente) {
    const a = nucleo.assinaturaAtual(cliente.id);
    if (!a) return null;
    const plano = repo.obter("planos", a.plano_id);
    const usos = (plano.itens ?? []).map((i) => ({ servico_id: i.servico_id, nome: repo.obter("servicos", i.servico_id)?.nome, quantidade: i.quantidade, usados: nucleo.usosNoCiclo(a, i.servico_id) }));
    return { id: a.id, status: a.status, ciclo_inicio: a.ciclo_inicio, ciclo_fim: a.ciclo_fim, pago_ate: a.pago_ate ?? a.ciclo_fim, link: a.status !== "ativa" ? a.link : null, plano: { id: plano.id, nome: plano.nome, preco_centavos: plano.preco_centavos, dias_semana: plano.dias_semana, desconto_produtos: plano.desconto_produtos }, usos };
  }

  r.get("/api/app/eu", APP, ({ cliente }) => {
    const proximos = repo.lista("agendamentos", "WHERE cliente_id = ? AND status IN ('agendado','chegou','em_atendimento') AND fim > ? ORDER BY inicio", cliente.id, agora()).map((a) => ({ ...nucleo.detalhar(a), pode_mudar: nucleo.podeMudar(a) }));
    const historico = repo.lista("agendamentos", "WHERE cliente_id = ? AND status IN ('concluido','cancelado','faltou') ORDER BY inicio DESC LIMIT 12", cliente.id).map(nucleo.detalhar);
    const espera = repo.lista("espera", "WHERE cliente_id = ? AND status IN ('aguardando','oferecida') AND dia >= ? ORDER BY dia", cliente.id, hoje()).map((e) => ({ id: e.id, dia: e.dia, de: e.de, ate: e.ate, status: e.status, servico: repo.obter("servicos", e.servico_id)?.nome }));
    return {
      cliente: clientePublico(cliente),
      precisa_nome: cliente.nome === "Cliente",
      precisa_celular: !cliente.fone,
      de_sempre: proximos.length ? null : sugestao(cliente),
      proximos,
      historico,
      espera,
      clube: clube(cliente),
      retorno: cliente.ultima_visita ? { ultima_visita: cliente.ultima_visita, dias: diasEntre(cliente.ultima_visita, hoje()), ciclo_dias: cliente.ciclo_dias } : null,
    };
  });

  r.put("/api/app/eu", APP, async (ctx) => {
    const d = validar(z.object({ nome: t(120).refine((v) => v.toLowerCase() !== "cliente", "digite o seu nome").optional(), email: email.optional().nullable().or(z.literal("").transform(() => null)), nascimento: nascimento.optional().nullable().or(z.literal("").transform(() => null)), aceita_mensagens: z.boolean().optional(), preferencias: op(300) }), await ctx.corpo());
    return clientePublico(repo.atualizar("clientes", ctx.cliente.id, d));
  });

  /** Quem entrou com Google confirma o celular com um código (para lembretes e para não duplicar cadastro) */
  r.post("/api/app/celular", APP, async (ctx) => {
    const d = validar(z.object({ fone: z.string().max(30), codigo: z.string().max(10) }), await ctx.corpo());
    limitar(`celular:${ctx.ip}`, 20);
    const fone = nucleo.conferirCodigo(d.fone, d.codigo);
    const outro = repo.lista("clientes", "WHERE fone = ? AND id <> ?", fone, ctx.cliente.id)[0];
    if (outro) {
      // Já era cliente pelo celular: junta as duas contas na antiga (o histórico fica todo junto)
      repo.transacao(() => {
        for (const tabela of ["agendamentos", "assinaturas", "espera", "reservas", "vendas"]) repo.rodar(`UPDATE ${tabela} SET cliente_id = ? WHERE cliente_id = ?`, outro.id, ctx.cliente.id);
        repo.rodar("UPDATE sessoes SET cliente_id = ? WHERE cliente_id = ?", outro.id, ctx.cliente.id);
        const { google_sub, email: em, nome } = ctx.cliente;
        repo.rodar("UPDATE clientes SET ativo = 0, google_sub = NULL, fone = NULL WHERE id = ?", ctx.cliente.id);
        repo.atualizar("clientes", outro.id, { google_sub, email: outro.email ?? em, nome: outro.nome === "Cliente" ? nome : outro.nome });
      });
      return { ok: true, unificado: true };
    }
    repo.atualizar("clientes", ctx.cliente.id, { fone });
    return { ok: true };
  });

  /* ---------- Agendar ---------- */
  r.get("/api/app/dias", APP, ({ query }) => {
    const d = validar(z.object({ servico: id, barbeiro: id.optional() }), Object.fromEntries(query));
    return nucleo.diasDisponiveis({ servicoId: d.servico, barbeiroId: d.barbeiro ?? null, dias: 21 });
  });
  r.get("/api/app/horarios", APP, ({ query, cliente }) => {
    const d = validar(z.object({ servico: id, barbeiro: id.optional(), dia }), Object.fromEntries(query));
    const res = nucleo.livres({ servicoId: d.servico, barbeiroId: d.barbeiro ?? null, dia: d.dia });
    return { dia: res.dia, horarios: res.horarios, clube: nucleo.identificarAssinante(cliente.id, d.servico, d.dia) };
  });
  /** O app pergunta antes de mostrar os serviços: o que o clube do cliente cobre em cada um */
  r.get("/api/app/clube/servicos", APP, ({ cliente, query }) => {
    const d = validar(z.object({ dia: dia.optional() }), Object.fromEntries(query));
    const base = nucleo.identificarAssinante(cliente.id);
    if (!base.assinante) return { assinante: false, servicos: {} };
    const servicos = Object.fromEntries(repo.lista("servicos", "WHERE ativo = 1").map((s) => [s.id, nucleo.identificarAssinante(cliente.id, s.id, d.dia ?? hojeBR(agora()))]).map(([k, v]) => [k, { coberto: v.coberto, restante: v.restante, motivo: v.motivo }]));
    return { ...base, servicos };
  });

  r.post("/api/app/agendar", APP, async (ctx) => {
    const d = validar(z.object({ servico_id: id, barbeiro_id: id.optional().nullable(), dia, hora, observacao: op(300), reservas: z.array(z.object({ produto_id: id, quantidade: z.number().int().min(1).max(5) })).max(5).optional() }), await ctx.corpo());
    // O mesmo cliente confirmando o mesmo horário de novo (outra aba, toque repetido): devolve o que já está marcado
    const jaMarcado = repo.um(`SELECT id FROM agendamentos WHERE cliente_id = ? AND servico_id = ? AND inicio = ? AND status IN ('agendado','chegou') ${d.barbeiro_id ? "AND barbeiro_id = ?" : ""} LIMIT 1`, ctx.cliente.id, d.servico_id, paraMs(d.dia, d.hora), ...(d.barbeiro_id ? [d.barbeiro_id] : []));
    if (jaMarcado) return { ...nucleo.detalhar(repo.obter("agendamentos", jaMarcado.id)), ja_marcado: true };
    limitar(`agendar:${ctx.cliente.id}`, 12, 3600_000);
    const futuros = repo.um("SELECT COUNT(*) n FROM agendamentos WHERE cliente_id = ? AND status = 'agendado' AND inicio > ?", ctx.cliente.id, agora()).n;
    if (futuros >= 3) falha(409, "Você já tem 3 horários marcados. Para mais, fale com a barbearia.");
    if (!ctx.cliente.fone) falha(400, "Confirme o seu celular para receber a confirmação e o lembrete.");
    if (d.reservas?.length && repo.ocultos(nucleo.exigirBarbearia().id).includes("modulo.produtos")) falha(400, "A reserva de produtos não está disponível.");
    return nucleo.agendar({ cliente: ctx.cliente, servicoId: d.servico_id, barbeiroId: d.barbeiro_id ?? null, dia: d.dia, hora: d.hora, origem: "app", autor: ctx.cliente.nome, observacao: d.observacao ?? null, reservas: d.reservas ?? [] });
  });
  r.post("/api/app/agendamentos/:id/cancelar", APP, (ctx) => {
    const a = meu(ctx, "agendamentos", ctx.params.id, "Agendamento");
    if (!nucleo.podeMudar(a)) falha(409, `Cancelamento pelo app só até ${nucleo.exigirBarbearia().config.regras.cancelamento_horas} h antes. Fale com a barbearia.`);
    return nucleo.cancelar(a, { por: ctx.cliente.nome, motivo: "cliente" });
  });
  r.post("/api/app/agendamentos/:id/remarcar", APP, async (ctx) => {
    const a = meu(ctx, "agendamentos", ctx.params.id, "Agendamento");
    if (!nucleo.podeMudar(a)) falha(409, `Remarcação pelo app só até ${nucleo.exigirBarbearia().config.regras.cancelamento_horas} h antes. Fale com a barbearia.`);
    const d = validar(z.object({ dia, hora, barbeiro_id: id.optional() }), await ctx.corpo());
    return nucleo.remarcar(a, { dia: d.dia, hora: d.hora, barbeiroId: d.barbeiro_id, autor: ctx.cliente.nome });
  });
  /** Reserva produtos da loja para retirar no horário já marcado */
  r.post("/api/app/agendamentos/:id/reservas", APP, async (ctx) => {
    const a = meu(ctx, "agendamentos", ctx.params.id, "Agendamento");
    if (a.status !== "agendado") falha(409, "Este horário não aceita mais reservas.");
    if (repo.ocultos(nucleo.exigirBarbearia().id).includes("modulo.produtos")) falha(400, "A reserva de produtos não está disponível.");
    const d = validar(z.object({ produto_id: id, quantidade: z.number().int().min(1).max(5) }), await ctx.corpo());
    nucleo.reservar(a, d.produto_id, d.quantidade);
    return nucleo.detalhar(repo.obter("agendamentos", a.id));
  });
  r.put("/api/app/reservas/:id", APP, async (ctx) => {
    const d = validar(z.object({ quantidade: z.number().int().min(1).max(5) }), await ctx.corpo());
    const x = meu(ctx, "reservas", ctx.params.id, "Reserva");
    return nucleo.mudarReserva(x, d.quantidade);
  });
  r.delete("/api/app/reservas/:id", APP, (ctx) => {
    const x = meu(ctx, "reservas", ctx.params.id, "Reserva");
    if (x.status !== "reservado") falha(409, "Esta reserva já foi retirada.");
    repo.rodar("UPDATE reservas SET status = 'cancelado' WHERE id = ?", x.id);
    return { ok: true };
  });

  /** "Estou chegando": avisa o painel da barbearia */
  r.post("/api/app/agendamentos/:id/cheguei", APP, (ctx) => {
    const a = meu(ctx, "agendamentos", ctx.params.id, "Agendamento");
    if (a.status !== "agendado") falha(409, "Este horário não está mais aguardando.");
    if (a.inicio - agora() > 2 * 3600_000) falha(409, "Faltam mais de 2 horas para o seu horário.");
    repo.atualizar("agendamentos", a.id, { status: "chegou", chegou_em: agora() });
    return nucleo.detalhar(repo.obter("agendamentos", a.id));
  });
  r.get("/api/app/agendamentos/:id/ics", APP, (ctx) => {
    const a = meu(ctx, "agendamentos", ctx.params.id, "Agendamento");
    ctx.res.writeHead(200, { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="horario-barbearia.ics"`, "Cache-Control": "no-store" });
    ctx.res.end(nucleo.ics(a));
  });

  /* ---------- Lista de espera ---------- */
  r.post("/api/app/espera", APP, async (ctx) => {
    const d = validar(z.object({ servico_id: id, barbeiro_id: id.optional().nullable(), dia, de: hora, ate: hora }), await ctx.corpo());
    if (nucleo.exigirBarbearia().config.regras.lista_espera === false) falha(400, "A lista de espera não está ativa.");
    if (!ctx.cliente.fone) falha(400, "Confirme o seu celular para receber o aviso da vaga.");
    const e = nucleo.entrarNaEspera({ cliente: ctx.cliente, servicoId: d.servico_id, barbeiroId: d.barbeiro_id ?? null, dia: d.dia, de: d.de, ate: d.ate });
    return { id: e.id, dia: e.dia, de: e.de, ate: e.ate, status: e.status };
  });
  r.delete("/api/app/espera/:id", APP, (ctx) => {
    const e = meu(ctx, "espera", ctx.params.id, "Pedido");
    repo.atualizar("espera", e.id, { status: "cancelada", oferta_hash: null });
    return { ok: true };
  });
  r.get("/api/app/vaga/:token", APP, (ctx) => {
    const e = nucleo.vagaPorToken(ctx.params.token);
    if (e.cliente_id !== ctx.cliente.id) falha(403, "Esta oferta foi enviada para outra pessoa.");
    const vencida = e.status !== "oferecida" || e.oferta?.expira_em < agora();
    return { dia: e.dia, hora: e.oferta?.hora ?? null, servico: repo.obter("servicos", e.servico_id)?.nome, barbeiro: e.oferta ? repo.obter("barbeiros", e.oferta.barbeiro_id)?.nome : null, vencida, expira_em: e.oferta?.expira_em ?? null };
  });
  r.post("/api/app/vaga/:token", APP, (ctx) => nucleo.aceitarVaga(ctx.params.token, ctx.cliente));

  /* ---------- Clube ---------- */
  r.post("/api/app/assinar", APP, async (ctx) => {
    const b = nucleo.exigirBarbearia();
    const asaas = nucleo.canais(b).asaas.ativo;
    const d = validar(z.object({ plano_id: id, cpf: asaas ? cpf : cpf.optional().nullable() }), await ctx.corpo());
    if (!ctx.cliente.fone) falha(400, "Confirme o seu celular antes de assinar.");
    const a = await nucleo.assinar({ cliente: ctx.cliente, planoId: d.plano_id, cpf: d.cpf ?? null, autor: ctx.cliente.nome });
    return { id: a.id, status: a.status, link: a.link, pagar_no_balcao: !asaas };
  });
  r.post("/api/app/assinatura/cancelar", APP, async (ctx) => {
    const a = nucleo.assinaturaAtual(ctx.cliente.id) ?? falha(404, "Você não tem assinatura.");
    return { status: (await nucleo.cancelarAssinatura(a, { autor: ctx.cliente.nome })).status };
  });

  return { sessaoCliente };
}
