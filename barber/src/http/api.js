/* API do painel da barbearia (cookie nx_barber).
   Papéis: dono e admin (tudo) · recepção (agenda, clientes, caixa, produtos, clube) ·
   barbeiro (a própria agenda, folgas, horário, comandas e comissões). */

import { z } from "zod";
import { HORARIO_PADRAO, OCUPA, REGRAS_PADRAO, expediente, ocupacao } from "../regras/agenda.js";
import { diasEntre, hojeBR, paraMs, somarDias } from "../regras/datas.js";
import { gerarHashSenha, gerarToken, hashSenha, iguais, precisaRefazerHash, senhaConfere, sha256 } from "../seguranca.js";
import { CATALOGO, chaveValida } from "../nexor/politica.js";
import { cicloNoDia } from "../regras/clube.js";
import { FORMAS } from "../servicos/nucleo.js";
import { normalizarFone } from "../servicos/canais.js";
import { criarRoteador, falha } from "./roteador.js";
import { COOKIE_PAINEL, centavos, clientePublico, configCanais, configPublica, cor, dia, email, hora, id, op, pct, senha, t, tabelaHorario, usuarioPublico, validar } from "./validacao.js";
import { rotasApp } from "./app.js";

const ADM = { papeis: ["dono", "admin"] };
const EQUIPE = { papeis: ["dono", "admin", "recepcao"] };
const SERVICOS_PADRAO = [
  { nome: "Corte", duracao_min: 40, preco_centavos: 5000, categoria: "Cabelo" },
  { nome: "Barba", duracao_min: 30, preco_centavos: 4000, categoria: "Barba" },
  { nome: "Corte + barba", duracao_min: 60, preco_centavos: 8000, categoria: "Combo" },
  { nome: "Sobrancelha", duracao_min: 15, preco_centavos: 1500, categoria: "Acabamento" },
];
const foneOpc = z
  .string()
  .trim()
  .max(30)
  .transform((v, c) => {
    if (!v) return null;
    const n = normalizarFone(v);
    if (!n) c.addIssue({ code: "custom", message: "celular com DDD (ex.: 34 99999-0000)" });
    return n || null;
  })
  .optional()
  .nullable();

export function criarApi({ repo, nucleo, cofre, cfg, central, agora = () => Date.now(), google }) {
  const r = criarRoteador();
  const tentativas = new Map();
  const HASH_FALSO = gerarHashSenha(gerarToken());
  const hoje = () => hojeBR(agora());

  function limitar(chave, maximo = cfg.limites.tentativasLogin, janela = 15 * 60_000) {
    const t0 = agora();
    const l = (tentativas.get(chave) ?? []).filter((x) => t0 - x < janela);
    if (l.length >= maximo) falha(429, "Muitas tentativas. Aguarde alguns minutos.");
    l.push(t0);
    tentativas.set(chave, l);
    if (tentativas.size > 20_000) tentativas.delete(tentativas.keys().next().value);
  }
  function cookie(res, nome, token, dias) {
    const a = [`${nome}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.round(dias * 86400)}`];
    if (cfg.producao) a.push("Secure");
    const atual = res.getHeader("Set-Cookie");
    res.setHeader("Set-Cookie", [...(Array.isArray(atual) ? atual : atual ? [atual] : []), a.join("; ")]);
  }
  function iniciarSessao(res, usuario_id, dias = cfg.sessaoDias) {
    const token = gerarToken();
    repo.criarSessao(sha256(token), { usuario_id }, dias);
    cookie(res, COOKIE_PAINEL, token, dias);
  }
  function sessaoPainel(cookies) {
    const s = cookies[COOKIE_PAINEL] ? repo.sessao(sha256(cookies[COOKIE_PAINEL])) : null;
    if (!s?.usuario_id) return null;
    const u = repo.obter("usuarios", s.usuario_id);
    return u?.ativo ? u : null;
  }
  const auditar = (ctx, acao, detalhe) => repo.auditar(ctx.barbearia.id, ctx.usuario?.nome ?? "sistema", acao, detalhe);
  const exigir = (tabela, idReg, rotulo) => repo.obter(tabela, idReg) ?? falha(404, `${rotulo} não encontrado.`);
  const ehBarbeiro = (u) => u.papel === "barbeiro";
  /** Barbeiro só mexe no que é dele */
  function doBarbeiro(ctx, barbeiroId) {
    if (ehBarbeiro(ctx.usuario) && barbeiroId !== ctx.usuario.barbeiro_id) falha(403, "Você só pode mexer na sua própria agenda.");
  }

  /* ---------- Conta e login ---------- */
  const exigeCodigo = () => repo.contarUsuarios() === 0 && Boolean(cfg.codigoInstalacao);
  r.get("/api/estado", { publico: true }, ({ cookies }) => ({ primeiroAcesso: repo.contarUsuarios() === 0, exigeCodigo: exigeCodigo(), logado: Boolean(sessaoPainel(cookies)) }));

  r.post("/api/cadastro", { publico: true }, async ({ corpo, res, ip }) => {
    if (repo.contarUsuarios() > 0) falha(403, "Esta barbearia já foi criada. Peça um acesso ao dono.");
    limitar(`cadastro:${ip}`);
    const b = await corpo();
    if (exigeCodigo() && !iguais(String(b?.codigo_instalacao ?? "").trim(), cfg.codigoInstalacao)) falha(403, "Código de instalação incorreto. Ele está no arquivo codigo-instalacao.txt do servidor ou com a Nexor.");
    const d = validar(z.object({ barbearia: t(100), nome: t(120), email, senha, tambem_corta: z.boolean().optional() }), b);
    const senhaHash = await hashSenha(d.senha);
    const u = repo.transacao(() => {
      const bb = repo.inserir("barbearias", { nome: d.barbearia, config: { horario: HORARIO_PADRAO, regras: REGRAS_PADRAO, retorno: { ativo: true, margem_dias: 2 }, marca: { cor: "#3b8dff" } } });
      SERVICOS_PADRAO.forEach((s, i) => repo.inserir("servicos", { barbearia_id: bb.id, ...s, ordem: i }));
      const barbeiro = d.tambem_corta !== false ? repo.inserir("barbeiros", { barbearia_id: bb.id, nome: d.nome.split(" ")[0], ordem: 0 }) : null;
      return repo.inserir("usuarios", { barbearia_id: bb.id, nome: d.nome, email: d.email, senha_hash: senhaHash, papel: "dono", barbeiro_id: barbeiro?.id ?? null });
    });
    repo.auditar(u.barbearia_id, u.nome, "conta_criada");
    iniciarSessao(res, u.id);
    return { ok: true };
  });

  r.post("/api/entrar", { publico: true }, async ({ corpo, res, ip }) => {
    const d = validar(z.object({ email, senha: z.string().min(1).max(200) }), await corpo());
    limitar(`login:${ip}`);
    limitar(`login:${d.email}`);
    const u = repo.usuarioPorEmail(d.email);
    const ok = await senhaConfere(d.senha, u?.senha_hash ?? HASH_FALSO);
    if (!u || !ok) falha(401, "E-mail ou senha incorretos.");
    if (precisaRefazerHash(u.senha_hash)) repo.rodar("UPDATE usuarios SET senha_hash = ? WHERE id = ?", await hashSenha(d.senha), u.id);
    iniciarSessao(res, u.id);
    repo.auditar(u.barbearia_id, u.nome, "login");
    return { ok: true };
  });
  r.post("/api/sair", { publico: true }, ({ cookies, res }) => {
    if (cookies[COOKIE_PAINEL]) repo.encerrarSessao(sha256(cookies[COOKIE_PAINEL]));
    res.setHeader("Set-Cookie", `${COOKIE_PAINEL}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  r.get("/api/eu", ({ usuario, barbearia }) => {
    const lic = central.estado();
    const n = (sql, ...p) => repo.um(sql, ...p).n;
    return {
      usuario: usuarioPublico(usuario),
      barbearia: { id: barbearia.id, nome: barbearia.nome, config: configPublica(barbearia.config) },
      licenca: { situacao: lic.situacao, mensagem: lic.mensagem, link: lic.link, contato: lic.contato, vinculado: central.configurada },
      ocultos: repo.ocultos(barbearia.id),
      formas: FORMAS,
      link_app: nucleo.linkApp(),
      contagem: {
        chegaram: n("SELECT COUNT(*) n FROM agendamentos WHERE status = 'chegou' AND inicio >= ? AND inicio < ?", paraMs(hoje()), paraMs(hoje()) + 86400_000),
        estoque_baixo: n("SELECT COUNT(*) n FROM produtos WHERE ativo = 1 AND estoque <= estoque_minimo"),
        clube_atraso: n("SELECT COUNT(*) n FROM assinaturas WHERE status = 'atrasada'"),
        espera: n("SELECT COUNT(*) n FROM espera WHERE status IN ('aguardando','oferecida') AND dia >= ?", hoje()),
      },
    };
  });

  /* ---------- Agenda ---------- */
  const listarDia = (d, barbeiroId) => {
    const ini = paraMs(d);
    const ags = repo.lista("agendamentos", `WHERE inicio >= ? AND inicio < ? ${barbeiroId ? "AND barbeiro_id = ?" : ""} ORDER BY inicio`, ini, ini + 86400_000, ...(barbeiroId ? [barbeiroId] : []));
    return ags.map(nucleo.detalhar);
  };

  r.get("/api/hoje", ({ query, usuario, barbearia }) => {
    const d = validar(dia.optional(), query.get("dia") || undefined) ?? hoje();
    const filtro = ehBarbeiro(usuario) ? usuario.barbeiro_id : query.get("barbeiro") || null;
    const barbeiros = repo.lista("barbeiros", "WHERE ativo = 1 ORDER BY ordem, nome").filter((x) => !filtro || x.id === filtro);
    const ags = listarDia(d, filtro);
    const ini = paraMs(d);
    const bloqueios = repo.lista("bloqueios", "WHERE inicio < ? AND fim > ? ORDER BY inicio", ini + 86400_000, ini);
    const vendas = repo.lista("vendas", "WHERE dia = ? AND status = 'paga'", d);
    return {
      dia: d,
      barbeiros: barbeiros.map((b) => ({ id: b.id, nome: b.nome, cor: b.cor, expediente: expediente(barbearia, b, d) })),
      agendamentos: ags,
      bloqueios,
      resumo: {
        agendados: ags.filter((a) => OCUPA.has(a.status)).length,
        concluidos: ags.filter((a) => a.status === "concluido").length,
        faltas: ags.filter((a) => a.status === "faltou").length,
        faturado_centavos: ehBarbeiro(usuario) ? null : vendas.reduce((s, v) => s + v.total_centavos, 0),
        ocupacao: Math.round(ocupacao(barbearia, barbeiros, d, ags) * 100),
      },
    };
  });

  r.get("/api/agendamentos", ({ query, usuario }) => {
    const de = validar(dia, query.get("de") || hoje());
    const ate = validar(dia, query.get("ate") || somarDias(de, 6));
    const filtro = ehBarbeiro(usuario) ? usuario.barbeiro_id : query.get("barbeiro") || null;
    return repo.lista("agendamentos", `WHERE inicio >= ? AND inicio < ? ${filtro ? "AND barbeiro_id = ?" : ""} ORDER BY inicio`, paraMs(de), paraMs(ate) + 86400_000, ...(filtro ? [filtro] : [])).map(nucleo.detalhar);
  });

  r.get("/api/horarios", ({ query }) => {
    const d = validar(z.object({ servico: id, barbeiro: id.optional(), dia, ignorar: id.optional() }), Object.fromEntries(query));
    return nucleo.livres({ servicoId: d.servico, barbeiroId: d.barbeiro ?? null, dia: d.dia, ignorar: d.ignorar ?? null });
  });

  function clienteDoCorpo(ctx, d) {
    if (d.cliente_id) return exigir("clientes", d.cliente_id, "Cliente");
    if (!d.cliente?.nome) falha(400, "Escolha o cliente ou digite o nome de um cliente novo.");
    const fone = d.cliente.fone ?? null;
    const existente = fone ? repo.lista("clientes", "WHERE fone = ?", fone)[0] : null;
    if (existente) return existente;
    auditar(ctx, "cliente_criado", { nome: d.cliente.nome });
    return repo.inserir("clientes", { barbearia_id: ctx.barbearia.id, nome: d.cliente.nome, fone });
  }

  r.post("/api/agendamentos", async (ctx) => {
    const d = validar(z.object({ cliente_id: id.optional(), cliente: z.object({ nome: t(120), fone: foneOpc }).optional(), servico_id: id, barbeiro_id: id.optional().nullable(), dia, hora, encaixe: z.boolean().optional(), observacao: op(500) }), await ctx.corpo());
    const barbeiroId = ehBarbeiro(ctx.usuario) ? ctx.usuario.barbeiro_id : (d.barbeiro_id ?? null);
    const cliente = clienteDoCorpo(ctx, d);
    return nucleo.agendar({ cliente, servicoId: d.servico_id, barbeiroId, dia: d.dia, hora: d.hora, origem: "painel", autor: ctx.usuario.nome, encaixe: Boolean(d.encaixe), observacao: d.observacao ?? null });
  });

  // Lê o corpo antes do registro: com rede lenta, o agendamento lido antes do await já pode ter mudado (V-01)
  r.put("/api/agendamentos/:id", async (ctx) => {
    const d = validar(z.object({ status: z.enum(["agendado", "chegou", "em_atendimento", "faltou", "cancelado"]).optional(), dia: dia.optional(), hora: hora.optional(), barbeiro_id: id.optional(), encaixe: z.boolean().optional(), observacao: op(500) }), await ctx.corpo());
    const a = exigir("agendamentos", ctx.params.id, "Agendamento");
    doBarbeiro(ctx, a.barbeiro_id);
    if (d.dia && d.hora) {
      if (d.barbeiro_id) doBarbeiro(ctx, d.barbeiro_id);
      return nucleo.remarcar(a, { dia: d.dia, hora: d.hora, barbeiroId: d.barbeiro_id, autor: ctx.usuario.nome, encaixe: Boolean(d.encaixe) });
    }
    if (d.status === "cancelado") return nucleo.cancelar(a, { por: ctx.usuario.nome, motivo: "barbearia" });
    if (d.status) nucleo.mudarStatus(a.id, d.status, { autor: ctx.usuario.nome });
    if (d.observacao !== undefined) repo.atualizar("agendamentos", a.id, { observacao: d.observacao });
    return nucleo.detalhar(repo.obter("agendamentos", a.id));
  });

  const ESQ_PRODUTOS = z.array(z.object({ id, quantidade: z.number().int().min(1).max(100) })).max(30);
  r.post("/api/agendamentos/:id/concluir", async (ctx) => {
    const d = validar(z.object({ produtos: ESQ_PRODUTOS.optional(), desconto_centavos: centavos.optional(), forma: z.enum(Object.keys(FORMAS)) }), await ctx.corpo());
    const a = exigir("agendamentos", ctx.params.id, "Agendamento");
    doBarbeiro(ctx, a.barbeiro_id);
    const r2 = nucleo.concluir(a, { produtos: d.produtos ?? [], descontoCentavos: d.desconto_centavos ?? 0, forma: d.forma, autor: ctx.usuario.nome });
    return r2;
  });

  /* ---------- Folgas e bloqueios ---------- */
  r.get("/api/bloqueios", ({ query, usuario }) => {
    const de = validar(dia, query.get("de") || hoje());
    const filtro = ehBarbeiro(usuario) ? usuario.barbeiro_id : null;
    return repo.lista("bloqueios", `WHERE fim > ? ${filtro ? "AND (barbeiro_id = ? OR barbeiro_id IS NULL)" : ""} ORDER BY inicio LIMIT 200`, paraMs(de), ...(filtro ? [filtro] : []));
  });
  r.post("/api/bloqueios", async (ctx) => {
    const d = validar(z.object({ barbeiro_id: id.optional().nullable(), dia, de: hora, ate: hora, ate_dia: dia.optional(), motivo: op(120) }), await ctx.corpo());
    const barbeiroId = ehBarbeiro(ctx.usuario) ? ctx.usuario.barbeiro_id : (d.barbeiro_id ?? null);
    const inicio = paraMs(d.dia, d.de);
    const fim = paraMs(d.ate_dia ?? d.dia, d.ate);
    if (fim <= inicio) falha(400, "O fim precisa ser depois do início.");
    if (fim - inicio > 60 * 86400_000) falha(400, "Bloqueie no máximo 60 dias de uma vez.");
    const conflitos = repo.todos(`SELECT COUNT(*) n FROM agendamentos WHERE status IN ('agendado','chegou') AND inicio < ? AND fim > ? ${barbeiroId ? "AND barbeiro_id = ?" : ""}`, fim, inicio, ...(barbeiroId ? [barbeiroId] : []))[0].n;
    auditar(ctx, "bloqueio_criado", { barbeiro: barbeiroId, inicio, fim });
    return { bloqueio: repo.inserir("bloqueios", { barbearia_id: ctx.barbearia.id, barbeiro_id: barbeiroId, inicio, fim, motivo: d.motivo ?? null, criado_por: ctx.usuario.nome }), clientes_no_periodo: conflitos };
  });
  r.delete("/api/bloqueios/:id", (ctx) => {
    const b = exigir("bloqueios", ctx.params.id, "Bloqueio");
    if (ehBarbeiro(ctx.usuario) && b.barbeiro_id !== ctx.usuario.barbeiro_id) falha(403, "Você só pode remover as suas folgas.");
    repo.remover("bloqueios", b.id);
    auditar(ctx, "bloqueio_removido", { bloqueio: b.id });
    return { ok: true };
  });

  /* ---------- Clientes ---------- */
  r.get("/api/clientes", ({ query }) => {
    const busca = String(query.get("busca") ?? "").trim().toLowerCase().slice(0, 60);
    const filtro = query.get("filtro");
    let lista = repo.lista("clientes", "WHERE ativo = 1 ORDER BY nome LIMIT 2000");
    if (busca) {
      const dig = busca.replace(/\D/g, "");
      lista = lista.filter((c) => c.nome.toLowerCase().includes(busca) || (dig.length >= 4 && c.fone?.includes(dig)) || c.email?.includes(busca));
    }
    const assinantes = new Set(repo.todos("SELECT cliente_id FROM assinaturas WHERE status = 'ativa'").map((x) => x.cliente_id));
    const h = hoje();
    const comRisco = (c) => Boolean(c.ciclo_dias && c.ultima_visita && diasEntre(c.ultima_visita, h) > c.ciclo_dias + 7);
    if (filtro === "assinantes") lista = lista.filter((c) => assinantes.has(c.id));
    if (filtro === "sumidos") lista = lista.filter(comRisco);
    if (filtro === "aniversario") lista = lista.filter((c) => c.nascimento?.slice(5, 7) === h.slice(5, 7));
    return lista.slice(0, 300).map((c) => ({ ...clientePublico(c), assinante: assinantes.has(c.id), sumido: comRisco(c), dias_desde: c.ultima_visita ? diasEntre(c.ultima_visita, h) : null }));
  });
  const ESQ_CLIENTE = z.object({ nome: t(120), fone: foneOpc, email: email.optional().nullable().or(z.literal("").transform(() => null)), nascimento: dia.optional().nullable().or(z.literal("").transform(() => null)), observacoes: op(1000), aceita_mensagens: z.boolean().optional() });
  r.post("/api/clientes", EQUIPE, async (ctx) => {
    const d = validar(ESQ_CLIENTE, await ctx.corpo());
    if (d.fone && repo.um("SELECT 1 FROM clientes WHERE fone = ?", d.fone)) falha(409, "Já existe um cliente com este celular.");
    auditar(ctx, "cliente_criado", { nome: d.nome });
    return clientePublico(repo.inserir("clientes", { ...d, barbearia_id: ctx.barbearia.id }));
  });
  r.get("/api/clientes/:id", (ctx) => {
    const c = exigir("clientes", ctx.params.id, "Cliente");
    const historico = repo.lista("agendamentos", "WHERE cliente_id = ? ORDER BY inicio DESC LIMIT 30", c.id).map(nucleo.detalhar);
    const a = nucleo.assinaturaAtual(c.id);
    const vendas = ehBarbeiro(ctx.usuario) ? [] : repo.lista("vendas", "WHERE cliente_id = ? AND status = 'paga' ORDER BY criado_em DESC LIMIT 20", c.id);
    return { cliente: clientePublico(c), historico, assinatura: a ? { ...a, plano: repo.obter("planos", a.plano_id) } : null, vendas, gasto_total_centavos: ehBarbeiro(ctx.usuario) ? null : repo.um("SELECT COALESCE(SUM(total_centavos),0) n FROM vendas WHERE cliente_id = ? AND status = 'paga'", c.id).n };
  });
  r.put("/api/clientes/:id", EQUIPE, async (ctx) => {
    const c = exigir("clientes", ctx.params.id, "Cliente");
    const d = validar(ESQ_CLIENTE.partial().extend({ ativo: z.boolean().optional() }), await ctx.corpo());
    if (d.fone && repo.um("SELECT 1 FROM clientes WHERE fone = ? AND id <> ?", d.fone, c.id)) falha(409, "Já existe um cliente com este celular.");
    auditar(ctx, "cliente_alterado", { cliente: c.id });
    return clientePublico(repo.atualizar("clientes", c.id, d));
  });

  /* ---------- Serviços e barbeiros ---------- */
  r.get("/api/servicos", () => repo.lista("servicos", "ORDER BY ativo DESC, ordem, nome"));
  const ESQ_SERVICO = z.object({ nome: t(80), descricao: op(300), categoria: op(40), duracao_min: z.number().int().min(5).max(480), preco_centavos: centavos, ordem: z.number().int().min(0).max(999).optional(), ativo: z.boolean().optional() });
  r.post("/api/servicos", ADM, async (ctx) => {
    const d = validar(ESQ_SERVICO, await ctx.corpo());
    auditar(ctx, "servico_criado", { nome: d.nome });
    return repo.inserir("servicos", { ...d, barbearia_id: ctx.barbearia.id });
  });
  r.put("/api/servicos/:id", ADM, async (ctx) => {
    const s = exigir("servicos", ctx.params.id, "Serviço");
    const d = validar(ESQ_SERVICO.partial(), await ctx.corpo());
    auditar(ctx, "servico_alterado", { servico: s.id });
    return repo.atualizar("servicos", s.id, d);
  });

  r.get("/api/barbeiros", ({ usuario }) => repo.lista("barbeiros", "ORDER BY ativo DESC, ordem, nome").map((b) => (ehBarbeiro(usuario) && b.id !== usuario.barbeiro_id ? { id: b.id, nome: b.nome, cor: b.cor, ativo: b.ativo } : b)));
  const ESQ_BARBEIRO = z.object({ nome: t(60), bio: op(300), cor: cor.optional(), comissao_servico: pct.optional(), comissao_produto: pct.optional(), horario: tabelaHorario.nullable().optional(), servicos: z.array(id).max(100).optional(), ordem: z.number().int().min(0).max(999).optional(), ativo: z.boolean().optional() });
  r.post("/api/barbeiros", ADM, async (ctx) => {
    const d = validar(ESQ_BARBEIRO, await ctx.corpo());
    auditar(ctx, "barbeiro_criado", { nome: d.nome });
    return repo.inserir("barbeiros", { ...d, barbearia_id: ctx.barbearia.id });
  });
  r.put("/api/barbeiros/:id", async (ctx) => {
    const b = exigir("barbeiros", ctx.params.id, "Barbeiro");
    doBarbeiro(ctx, b.id);
    let d = validar(ESQ_BARBEIRO.partial(), await ctx.corpo());
    // O barbeiro ajusta a própria apresentação, horário e serviços; comissão e status são do dono
    if (!["dono", "admin"].includes(ctx.usuario.papel)) d = { bio: d.bio, cor: d.cor, horario: d.horario, servicos: d.servicos };
    auditar(ctx, "barbeiro_alterado", { barbeiro: b.id });
    return repo.atualizar("barbeiros", b.id, d);
  });

  /* ---------- Clube de assinatura ---------- */
  r.get("/api/planos", () => repo.lista("planos", "ORDER BY ativo DESC, preco_centavos").map((p) => ({ ...p, assinantes: repo.um("SELECT COUNT(*) n FROM assinaturas WHERE plano_id = ? AND status IN ('ativa','atrasada')", p.id).n })));
  const ESQ_PLANO = z.object({ nome: t(60), descricao: op(400), preco_centavos: centavos.refine((v) => v > 0, "informe o valor"), itens: z.array(z.object({ servico_id: id, quantidade: z.number().int().min(0).max(60) })).min(1, "inclua pelo menos um serviço").max(20), dias_semana: z.array(z.number().int().min(0).max(6)).max(7).optional(), desconto_produtos: pct.optional(), ativo: z.boolean().optional() });
  r.post("/api/planos", ADM, async (ctx) => {
    const d = validar(ESQ_PLANO, await ctx.corpo());
    for (const i of d.itens) exigir("servicos", i.servico_id, "Serviço");
    auditar(ctx, "plano_criado", { nome: d.nome });
    return repo.inserir("planos", { ...d, barbearia_id: ctx.barbearia.id });
  });
  r.put("/api/planos/:id", ADM, async (ctx) => {
    const p = exigir("planos", ctx.params.id, "Plano");
    const d = validar(ESQ_PLANO.partial(), await ctx.corpo());
    auditar(ctx, "plano_alterado", { plano: p.id });
    return repo.atualizar("planos", p.id, d);
  });

  r.get("/api/assinaturas", EQUIPE, ({ query }) => {
    const status = query.get("status");
    const lista = repo.lista("assinaturas", status ? "WHERE status = ? ORDER BY atualizado_em DESC" : "WHERE status <> 'cancelada' ORDER BY atualizado_em DESC", ...(status ? [status] : []));
    const ativas = repo.todos("SELECT p.preco_centavos FROM assinaturas a JOIN planos p ON p.id = a.plano_id WHERE a.status = 'ativa'");
    return {
      lista: lista.map((a) => ({ ...a, cliente: clientePublico(repo.obter("clientes", a.cliente_id)), plano: repo.obter("planos", a.plano_id), usos: repo.um("SELECT COUNT(*) n FROM usos WHERE assinatura_id = ? AND ciclo_inicio = ?", a.id, cicloNoDia(a, hoje())?.ciclo_inicio ?? "").n })),
      resumo: { ativas: ativas.length, receita_mensal_centavos: ativas.reduce((s, x) => s + x.preco_centavos, 0), atrasadas: repo.um("SELECT COUNT(*) n FROM assinaturas WHERE status = 'atrasada'").n, pendentes: repo.um("SELECT COUNT(*) n FROM assinaturas WHERE status = 'pendente'").n },
    };
  });
  r.post("/api/assinaturas", EQUIPE, async (ctx) => {
    const d = validar(z.object({ cliente_id: id, plano_id: id, pago_agora: z.enum(Object.keys(FORMAS)).optional().nullable(), cpf: z.string().max(20).optional().nullable() }), await ctx.corpo());
    const cliente = exigir("clientes", d.cliente_id, "Cliente");
    return nucleo.assinar({ cliente, planoId: d.plano_id, cpf: d.cpf?.replace(/\D/g, "") || null, autor: ctx.usuario.nome, pagoAgora: d.pago_agora ?? null });
  });
  r.post("/api/assinaturas/:id/pagamento", EQUIPE, async (ctx) => {
    const d = validar(z.object({ forma: z.enum(Object.keys(FORMAS)), chave: z.string().regex(/^[\w-]{16,64}$/).optional() }), await ctx.corpo());
    const a = exigir("assinaturas", ctx.params.id, "Assinatura");
    return nucleo.pagamentoManual(a, { forma: d.forma, autor: ctx.usuario.nome, chave: d.chave ?? null });
  });
  r.post("/api/assinaturas/:id/cancelar", EQUIPE, async (ctx) => nucleo.cancelarAssinatura(exigir("assinaturas", ctx.params.id, "Assinatura"), { autor: ctx.usuario.nome }));

  /* ---------- Produtos, estoque e vendas ---------- */
  r.get("/api/produtos", () => repo.lista("produtos", "ORDER BY ativo DESC, nome").map((p) => ({ ...p, disponivel: nucleo.disponivel(p), baixo: p.estoque <= p.estoque_minimo })));
  const ESQ_PRODUTO = z.object({ nome: t(100), descricao: op(400), categoria: op(40), codigo: op(40), preco_centavos: centavos, custo_centavos: centavos.optional(), estoque_minimo: z.number().int().min(0).max(100000).optional(), vitrine: z.boolean().optional(), ativo: z.boolean().optional() });
  r.post("/api/produtos", EQUIPE, async (ctx) => {
    const d = validar(ESQ_PRODUTO.extend({ estoque: z.number().int().min(0).max(100000).optional() }), await ctx.corpo());
    const { estoque = 0, ...resto } = d;
    if (d.vitrine !== false && !(d.preco_centavos > 0)) falha(400, "Informe o preço para mostrar o produto na vitrine do app (ou tire da vitrine).");
    const p = repo.inserir("produtos", { ...resto, barbearia_id: ctx.barbearia.id });
    auditar(ctx, "produto_criado", { nome: d.nome });
    return estoque ? nucleo.movimentarEstoque(p, { tipo: "entrada", quantidade: estoque, motivo: "estoque inicial", autor: ctx.usuario.nome }) : p;
  });
  r.put("/api/produtos/:id", EQUIPE, async (ctx) => {
    const p = exigir("produtos", ctx.params.id, "Produto");
    const d = validar(ESQ_PRODUTO.partial(), await ctx.corpo());
    if ((d.vitrine ?? p.vitrine) && !((d.preco_centavos ?? p.preco_centavos) > 0)) falha(400, "Informe o preço para mostrar o produto na vitrine do app (ou tire da vitrine).");
    auditar(ctx, "produto_alterado", { produto: p.id });
    return repo.atualizar("produtos", p.id, d);
  });
  r.post("/api/produtos/:id/estoque", EQUIPE, async (ctx) => {
    const p = exigir("produtos", ctx.params.id, "Produto");
    const d = validar(z.object({ tipo: z.enum(["entrada", "ajuste"]), quantidade: z.number().int().min(-100000).max(100000).refine((v) => v !== 0, "quantidade diferente de zero"), motivo: op(120) }), await ctx.corpo());
    auditar(ctx, "estoque", { produto: p.id, ...d });
    return nucleo.movimentarEstoque(p, { ...d, motivo: d.motivo ?? d.tipo, autor: ctx.usuario.nome });
  });
  r.get("/api/produtos/:id/movimentos", EQUIPE, (ctx) => repo.lista("estoque_mov", "WHERE produto_id = ? ORDER BY criado_em DESC, rowid DESC LIMIT 100", exigir("produtos", ctx.params.id, "Produto").id));

  r.get("/api/vendas", ({ query, usuario }) => {
    const d = validar(dia, query.get("dia") || hoje());
    const filtro = ehBarbeiro(usuario) ? usuario.barbeiro_id : null;
    return repo.lista("vendas", `WHERE dia = ? ${filtro ? "AND barbeiro_id = ?" : ""} ORDER BY criado_em DESC`, d, ...(filtro ? [filtro] : [])).map((v) => ({ ...v, cliente: v.cliente_id ? repo.obter("clientes", v.cliente_id)?.nome : null, barbeiro: v.barbeiro_id ? repo.obter("barbeiros", v.barbeiro_id)?.nome : null }));
  });
  r.post("/api/vendas", async (ctx) => {
    const d = validar(z.object({ cliente_id: id.optional().nullable(), barbeiro_id: id.optional().nullable(), itens: z.array(z.object({ tipo: z.enum(["servico", "produto"]), id, quantidade: z.number().int().min(1).max(100) })).min(1).max(40), desconto_centavos: centavos.optional(), forma: z.enum(Object.keys(FORMAS)) }), await ctx.corpo());
    const barbeiroId = ehBarbeiro(ctx.usuario) ? ctx.usuario.barbeiro_id : (d.barbeiro_id ?? null);
    if (d.cliente_id) exigir("clientes", d.cliente_id, "Cliente");
    return nucleo.vender({ clienteId: d.cliente_id ?? null, barbeiroId, itens: d.itens, descontoCentavos: d.desconto_centavos ?? 0, forma: d.forma, autor: ctx.usuario.nome });
  });
  r.post("/api/vendas/:id/cancelar", EQUIPE, (ctx) => nucleo.cancelarVenda(exigir("vendas", ctx.params.id, "Venda"), { autor: ctx.usuario.nome }));

  r.get("/api/caixa", EQUIPE, ({ query }) => {
    const d = validar(dia, query.get("dia") || hoje());
    const vendas = repo.lista("vendas", "WHERE dia = ? AND status = 'paga'", d);
    const porForma = {};
    for (const v of vendas) porForma[v.forma] = (porForma[v.forma] ?? 0) + v.total_centavos;
    const servicos = vendas.flatMap((v) => v.itens).filter((i) => i.tipo === "servico").reduce((s, i) => s + i.total_centavos, 0);
    const produtos = vendas.flatMap((v) => v.itens).filter((i) => i.tipo === "produto").reduce((s, i) => s + i.total_centavos, 0);
    const clube = repo.um("SELECT COALESCE(SUM(valor_centavos),0) n FROM cobrancas WHERE status = 'paga' AND pago_em >= ? AND pago_em < ?", paraMs(d), paraMs(d) + 86400_000).n;
    return { dia: d, total_centavos: vendas.reduce((s, v) => s + v.total_centavos, 0), descontos_centavos: vendas.reduce((s, v) => s + v.desconto_centavos, 0), por_forma: porForma, servicos_centavos: servicos, produtos_centavos: produtos, clube_recebido_centavos: clube, vendas: vendas.length };
  });

  r.get("/api/comissoes", ({ query, usuario }) => {
    const de = validar(dia, query.get("de") || `${hoje().slice(0, 7)}-01`);
    const ate = validar(dia, query.get("ate") || hoje());
    const filtro = ehBarbeiro(usuario) ? usuario.barbeiro_id : query.get("barbeiro") || null;
    const linhas = repo.lista("comissoes", `WHERE dia >= ? AND dia <= ? ${filtro ? "AND barbeiro_id = ?" : ""} ORDER BY criado_em DESC`, de, ate, ...(filtro ? [filtro] : []));
    const por = {};
    for (const l of linhas) {
      const p = (por[l.barbeiro_id] ??= { barbeiro_id: l.barbeiro_id, nome: repo.obter("barbeiros", l.barbeiro_id)?.nome, servicos_centavos: 0, produtos_centavos: 0, total_centavos: 0, atendimentos: 0 });
      p[l.tipo === "servico" ? "servicos_centavos" : "produtos_centavos"] += l.valor_centavos;
      p.total_centavos += l.valor_centavos;
      if (l.tipo === "servico") p.atendimentos++;
    }
    return { de, ate, por_barbeiro: Object.values(por), linhas: linhas.slice(0, 300) };
  });

  r.get("/api/espera", EQUIPE, () => repo.lista("espera", "WHERE dia >= ? AND status IN ('aguardando','oferecida') ORDER BY dia, criado_em", hoje()).map((e) => ({ ...e, oferta_hash: undefined, cliente: repo.obter("clientes", e.cliente_id)?.nome, servico: repo.obter("servicos", e.servico_id)?.nome })));
  r.delete("/api/espera/:id", EQUIPE, (ctx) => {
    repo.atualizar("espera", exigir("espera", ctx.params.id, "Pedido").id, { status: "cancelada", oferta_hash: null });
    return { ok: true };
  });

  /* ---------- Relatórios ---------- */
  r.get("/api/relatorios", ADM, ({ query, barbearia }) => {
    const de = validar(dia, query.get("de") || `${hoje().slice(0, 7)}-01`);
    const ate = validar(dia, query.get("ate") || hoje());
    const vendas = repo.lista("vendas", "WHERE dia >= ? AND dia <= ? AND status = 'paga'", de, ate);
    const ags = repo.lista("agendamentos", "WHERE inicio >= ? AND inicio < ?", paraMs(de), paraMs(ate) + 86400_000);
    const itens = vendas.flatMap((v) => v.itens);
    const soma = (l) => l.reduce((s, i) => s + i.total_centavos, 0);
    const ranking = (tipo) => {
      const m = {};
      for (const i of itens.filter((x) => x.tipo === tipo)) {
        const e = (m[i.id] ??= { nome: i.nome, quantidade: 0, total_centavos: 0 });
        e.quantidade += i.quantidade;
        e.total_centavos += i.total_centavos;
      }
      return Object.values(m).sort((a, b) => b.quantidade - a.quantidade).slice(0, 8);
    };
    const barbeiros = repo.lista("barbeiros", "WHERE ativo = 1");
    const porBarbeiro = barbeiros.map((b) => {
      const meus = ags.filter((a) => a.barbeiro_id === b.id);
      return { id: b.id, nome: b.nome, cor: b.cor, atendimentos: meus.filter((a) => a.status === "concluido").length, faltas: meus.filter((a) => a.status === "faltou").length, faturado_centavos: vendas.filter((v) => v.barbeiro_id === b.id).reduce((s, v) => s + v.total_centavos, 0) };
    });
    const dias = [];
    for (let d = de; d <= ate && dias.length < 92; d = somarDias(d, 1)) dias.push({ dia: d, total_centavos: vendas.filter((v) => v.dia === d).reduce((s, v) => s + v.total_centavos, 0), ocupacao: Math.round(ocupacao(barbearia, barbeiros, d, ags.filter((a) => hojeBR(a.inicio) === d)) * 100) });
    const concluidos = ags.filter((a) => a.status === "concluido").length;
    const ativas = repo.todos("SELECT p.preco_centavos FROM assinaturas a JOIN planos p ON p.id = a.plano_id WHERE a.status = 'ativa'");
    const h = hoje();
    const clientes = repo.lista("clientes", "WHERE ativo = 1");
    return {
      de,
      ate,
      faturamento_centavos: vendas.reduce((s, v) => s + v.total_centavos, 0),
      servicos_centavos: soma(itens.filter((i) => i.tipo === "servico")),
      produtos_centavos: soma(itens.filter((i) => i.tipo === "produto")),
      clube_recebido_centavos: repo.um("SELECT COALESCE(SUM(valor_centavos),0) n FROM cobrancas WHERE status = 'paga' AND pago_em >= ? AND pago_em < ?", paraMs(de), paraMs(ate) + 86400_000).n,
      atendimentos: concluidos,
      ticket_medio_centavos: vendas.length ? Math.round(vendas.reduce((s, v) => s + v.total_centavos, 0) / vendas.length) : 0,
      faltas: ags.filter((a) => a.status === "faltou").length,
      cancelados: ags.filter((a) => a.status === "cancelado").length,
      pelo_app: ags.filter((a) => a.origem !== "painel" && a.status !== "cancelado").length,
      pela_espera: ags.filter((a) => a.origem === "espera").length,
      clube: { ativas: ativas.length, receita_mensal_centavos: ativas.reduce((s, x) => s + x.preco_centavos, 0) },
      clientes: { total: clientes.length, novos: clientes.filter((c) => hojeBR(c.criado_em) >= de && hojeBR(c.criado_em) <= ate).length, sumidos: clientes.filter((c) => c.ciclo_dias && c.ultima_visita && diasEntre(c.ultima_visita, h) > c.ciclo_dias + 7).length },
      por_dia: dias,
      por_barbeiro: porBarbeiro,
      top_servicos: ranking("servico"),
      top_produtos: ranking("produto"),
    };
  });

  /* ---------- Configurações da barbearia ---------- */
  const regras = z.object({ passo_min: z.number().int().refine((v) => [5, 10, 15, 20, 30, 60].includes(v), "5, 10, 15, 20, 30 ou 60"), antecedencia_min: z.number().int().min(0).max(2880), janela_dias: z.number().int().min(1).max(120), cancelamento_horas: z.number().min(0).max(72), lembrete_horas: z.number().min(0).max(48), tolerancia_min: z.number().int().min(0).max(120), lista_espera: z.boolean(), comissao_clube: z.enum(["preco", "nenhuma"]) }).partial();
  r.get("/api/config", ({ barbearia }) => ({ nome: barbearia.nome, config: configPublica(barbearia.config) }));
  r.put("/api/config", ADM, async (ctx) => {
    const d = validar(
      z.object({
        nome: t(100).optional(),
        horario: tabelaHorario.optional(),
        excecoes: z.record(dia, z.array(z.tuple([hora, hora])).max(4)).optional(),
        regras: regras.optional(),
        retorno: z.object({ ativo: z.boolean(), margem_dias: z.number().int().min(0).max(30) }).partial().optional(),
        marca: z.object({ cor: cor, slogan: op(120), endereco: op(200), telefone: op(30), instagram: op(60), mapa: z.string().url().max(300).optional().nullable().or(z.literal("")) }).partial().optional(),
      }),
      await ctx.corpo(),
    );
    const c = ctx.barbearia.config;
    const config = { ...c, ...(d.horario ? { horario: d.horario } : {}), ...(d.excecoes ? { excecoes: Object.fromEntries(Object.entries(d.excecoes).filter(([k]) => k >= somarDias(hoje(), -1))) } : {}), regras: { ...c.regras, ...(d.regras ?? {}) }, retorno: { ...c.retorno, ...(d.retorno ?? {}) }, marca: { ...c.marca, ...(d.marca ?? {}) } };
    auditar(ctx, "config_alterada", { campos: Object.keys(d) });
    const b = repo.atualizar("barbearias", ctx.barbearia.id, { nome: d.nome ?? ctx.barbearia.nome, config });
    return { nome: b.nome, config: configPublica(b.config) };
  });

  /** Canais: WhatsApp, SMS, Google e Asaas. Campos secretos vazios mantêm o valor atual. */
  const canaisAdm = (b) => configCanais(b.config, nucleo.tokenWebhookAsaas(b));
  r.get("/api/canais", ADM, ({ barbearia }) => canaisAdm(barbearia));
  r.put("/api/canais", ADM, async (ctx) => {
    const sec = z.string().trim().max(500).optional().nullable();
    const d = validar(
      z.object({
        whatsapp: z.object({ id_numero: op(40), token: sec, segredo: sec, verificacao: op(80), idioma: op(10), modelos: z.object({ codigo: op(80), confirmacao: op(80), lembrete: op(80), vaga: op(80), retorno: op(80), clube_atraso: op(80) }).partial().optional() }).partial().optional(),
        sms: z.object({ sid: op(60), token: sec, de: op(40), avisos: z.boolean().optional() }).partial().optional(),
        google: z.object({ client_id: z.string().trim().max(200).regex(/^$|\.apps\.googleusercontent\.com$/, "Client ID termina em .apps.googleusercontent.com").optional().nullable() }).partial().optional(),
        asaas: z.object({ chave: sec, ambiente: z.enum(["sandbox", "producao"]).optional(), novo_token_webhook: z.boolean().optional() }).partial().optional(),
      }),
      await ctx.corpo(),
    );
    const c = ctx.barbearia.config;
    const novoSegredo = (v, antigo) => (v === undefined || v === null || v === "" || v === "true" || v === "false" ? antigo : cofre.cifrar(v));
    const w = { ...c.whatsapp };
    if (d.whatsapp) {
      const { token, segredo, modelos, ...resto } = d.whatsapp;
      Object.assign(w, resto, { token_cripto: novoSegredo(token, w.token_cripto), segredo_cripto: novoSegredo(segredo, w.segredo_cripto), modelos: { ...w.modelos, ...(modelos ?? {}) } });
      if (!w.verificacao) w.verificacao = gerarToken(16);
    }
    const s = { ...c.sms };
    if (d.sms) {
      const { token, ...resto } = d.sms;
      Object.assign(s, resto, { token_cripto: novoSegredo(token, s.token_cripto) });
    }
    const a = { ...c.asaas };
    if (d.asaas) {
      // O token do webhook só é gerado aqui no servidor (24 bytes aleatórios) e fica cifrado
      const { chave, novo_token_webhook, ...resto } = d.asaas;
      Object.assign(a, resto, { chave_cripto: novoSegredo(chave, a.chave_cripto), token_webhook_cripto: novo_token_webhook || !nucleo.tokenWebhookAsaas(ctx.barbearia) ? nucleo.novoTokenWebhook() : a.token_webhook_cripto });
      delete a.token_webhook;
      if (novo_token_webhook) auditar(ctx, "token_webhook_asaas_trocado", {});
    }
    const config = { ...c, whatsapp: w, sms: s, google: { ...c.google, ...(d.google ?? {}) }, asaas: a };
    auditar(ctx, "canais_alterados", { canais: Object.keys(d) });
    const b = repo.atualizar("barbearias", ctx.barbearia.id, { config });
    return canaisAdm(b);
  });
  r.post("/api/canais/testar", ADM, async (ctx) => {
    const d = validar(z.object({ canal: z.enum(["whatsapp", "sms"]), fone: z.string().max(30) }), await ctx.corpo());
    const fone = normalizarFone(d.fone) || falha(400, "Celular com DDD.");
    const c = nucleo.canais();
    try {
      if (d.canal === "whatsapp") {
        if (!c.whatsapp.ativo) falha(400, "Preencha o ID do número e o token do WhatsApp.");
        await c.whatsapp.texto(fone, `Teste do Nexor Barber: o WhatsApp da ${ctx.barbearia.nome} está funcionando ✅`);
      } else {
        if (!c.sms.ativo) falha(400, "Preencha a conta, o token e o remetente do SMS.");
        await c.sms.enviar(fone, `Teste do Nexor Barber: o SMS da ${ctx.barbearia.nome} está funcionando.`);
      }
    } catch (e) {
      if (e.status) throw e;
      falha(502, `Falhou: ${e.message}`);
    }
    return { ok: true };
  });
  r.post("/api/rotina", ADM, async () => ({ resultado: await nucleo.rotina() }));

  /* ---------- Equipe ---------- */
  r.get("/api/usuarios", ADM, () => repo.lista("usuarios", "WHERE nexor = 0 ORDER BY nome").map(usuarioPublico));
  r.post("/api/usuarios", ADM, async (ctx) => {
    const d = validar(z.object({ nome: t(120), email, senha, papel: z.enum(["admin", "recepcao", "barbeiro"]), barbeiro_id: id.optional().nullable() }), await ctx.corpo());
    if (repo.um("SELECT 1 FROM usuarios WHERE email = ?", d.email)) falha(409, "Já existe um acesso com este e-mail.");
    if (d.papel === "barbeiro" && !d.barbeiro_id) falha(400, "Escolha qual barbeiro é este acesso.");
    if (d.barbeiro_id) exigir("barbeiros", d.barbeiro_id, "Barbeiro");
    const { senha: s, ...resto } = d;
    auditar(ctx, "usuario_criado", { email: d.email, papel: d.papel });
    return usuarioPublico(repo.inserir("usuarios", { ...resto, barbearia_id: ctx.barbearia.id, senha_hash: await hashSenha(s) }));
  });
  r.put("/api/usuarios/:id", ADM, async (ctx) => {
    const u = repo.obter("usuarios", ctx.params.id);
    if (!u || u.nexor) falha(404, "Acesso não encontrado.");
    const d = validar(z.object({ nome: op(120), papel: z.enum(["admin", "recepcao", "barbeiro"]).optional(), barbeiro_id: id.optional().nullable(), ativo: z.boolean().optional(), senha: senha.optional() }), await ctx.corpo());
    // Só o próprio dono mexe na conta do dono (um admin não troca a senha nem o e-mail dele)
    if (u.papel === "dono" && u.id !== ctx.usuario.id) falha(403, "Só o dono pode alterar a própria conta.");
    if (u.papel === "dono" && (d.papel || d.ativo === false)) falha(400, "O dono da conta não pode ser alterado.");
    if (u.id === ctx.usuario.id && (d.papel || d.ativo === false)) falha(400, "Você não pode mudar o próprio perfil.");
    const papelFinal = d.papel ?? u.papel;
    const vinculo = d.barbeiro_id !== undefined ? d.barbeiro_id : u.barbeiro_id;
    if (papelFinal === "barbeiro" && !vinculo) falha(400, "Escolha qual barbeiro é este acesso.");
    if (d.barbeiro_id) exigir("barbeiros", d.barbeiro_id, "Barbeiro");
    if (u.id === ctx.usuario.id && d.senha) falha(400, "Para trocar a sua senha, use \"Trocar minha senha\" (pede a senha atual).");
    const novoHash = d.senha ? await hashSenha(d.senha) : undefined;
    const novo = repo.atualizar("usuarios", u.id, { ...d, senha: undefined, senha_hash: novoHash });
    if (d.ativo === false || d.senha) repo.rodar("DELETE FROM sessoes WHERE usuario_id = ?", u.id);
    auditar(ctx, "usuario_alterado", { email: u.email });
    return usuarioPublico(novo);
  });
  /** Troca da própria senha: pede a senha atual e encerra as outras sessões */
  r.put("/api/eu/senha", async (ctx) => {
    const d = validar(z.object({ atual: z.string().min(1).max(200), nova: senha }), await ctx.corpo());
    limitar(`senha:${ctx.usuario.id}`);
    const u = repo.obter("usuarios", ctx.usuario.id);
    if (!(await senhaConfere(d.atual, u.senha_hash))) falha(400, "A senha atual não confere.");
    repo.rodar("UPDATE usuarios SET senha_hash = ? WHERE id = ?", await hashSenha(d.nova), u.id);
    repo.rodar("DELETE FROM sessoes WHERE usuario_id = ? AND token_hash <> ?", u.id, sha256(ctx.cookies[COOKIE_PAINEL] ?? ""));
    auditar(ctx, "senha_trocada", { email: u.email });
    return { ok: true };
  });
  r.get("/api/auditoria", ADM, () => repo.lista("auditoria", "ORDER BY criado_em DESC LIMIT 300"));
  r.get("/api/envios", ADM, () => repo.lista("envios", "ORDER BY criado_em DESC LIMIT 200"));

  /* ---------- Suporte Nexor ---------- */
  r.get("/api/nexor/entrar", { publico: true }, ({ query, res, ip }) => {
    limitar(`nexor:${ip}`, 20);
    const d = central.conferirAcesso(query.get("t"));
    const pagina = (status, titulo, texto) => {
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
      res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px"><h1 style="font-size:20px">${titulo}</h1><p style="color:#4a5a73;line-height:1.5">${texto}</p><p><a href="/">Ir para o painel</a></p></body></html>`);
    };
    if (!d) return pagina(403, "Link de acesso inválido", "O link de suporte venceu, já foi usado ou não é desta instalação. Gere um novo na Nexor Central.");
    const b = repo.barbearia();
    if (!b) return pagina(409, "Barbearia ainda não criada", "O cliente ainda não criou a conta neste sistema. Use o código de instalação.");
    const nome = `Suporte Nexor · ${String(d.nome ?? "equipe").slice(0, 60)}`;
    let u = repo.um("SELECT * FROM usuarios WHERE nexor = 1");
    if (u) repo.rodar("UPDATE usuarios SET nome = ?, ativo = 1 WHERE id = ?", nome, u.id);
    else u = repo.inserir("usuarios", { barbearia_id: b.id, nome, email: `suporte-${b.id}@nexor.invalid`, senha_hash: "!sem-senha", papel: "admin", nexor: true });
    const token = gerarToken();
    repo.criarSessao(sha256(token), { usuario_id: u.id }, 8 / 24);
    repo.auditar(b.id, nome, "acesso_suporte_nexor", { email: d.email ?? null, ip });
    res.writeHead(302, { Location: "/#hoje", "Cache-Control": "no-store", "Set-Cookie": [`${COOKIE_PAINEL}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${8 * 3600}`, ...(cfg.producao ? ["Secure"] : [])].join("; ") });
    res.end();
  });
  r.get("/api/nexor/ajustes", { nexor: true }, ({ barbearia }) => {
    const a = repo.um("SELECT atualizado_por, atualizado_em FROM nexor_ajustes WHERE barbearia_id = ?", barbearia.id);
    return { catalogo: CATALOGO, ocultos: repo.ocultos(barbearia.id), atualizado_por: a?.atualizado_por ?? null, atualizado_em: a?.atualizado_em ?? null, licenca: central.estado(), central: central.info() };
  });
  r.put("/api/nexor/ajustes", { nexor: true }, async (ctx) => {
    const d = validar(z.object({ ocultos: z.array(z.string().max(60)).max(60) }), await ctx.corpo());
    const invalidos = d.ocultos.filter((k) => !chaveValida(k));
    if (invalidos.length) falha(400, `Itens desconhecidos: ${invalidos.join(", ")}`);
    const ocultos = [...new Set(d.ocultos)];
    repo.rodar("INSERT INTO nexor_ajustes (barbearia_id, ocultos, atualizado_por, atualizado_em) VALUES (?,?,?,?) ON CONFLICT (barbearia_id) DO UPDATE SET ocultos = excluded.ocultos, atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em", ctx.barbearia.id, JSON.stringify(ocultos), ctx.usuario.nome, agora());
    auditar(ctx, "ajustes_nexor", { ocultos });
    return { ocultos };
  });
  r.post("/api/nexor/sincronizar", { nexor: true }, async () => ({ ...(await central.sincronizar()), licenca: central.estado(), central: central.info() }));
  r.post("/api/nexor/vincular", ADM, async (ctx) => {
    limitar(`vincular:${ctx.ip}`, 10);
    if (central.configurada) falha(409, "Este sistema já está vinculado à Nexor Central.");
    const d = validar(z.object({ codigo: z.string().trim().min(8).max(20) }), await ctx.corpo());
    const res = await central.vincular(d.codigo, { nome: ctx.barbearia.nome });
    if (!res.ok) falha(400, res.erro);
    auditar(ctx, "vinculado_nexor_central", { cliente: res.cliente });
    return res;
  });

  const app = rotasApp({ r, repo, nucleo, cfg, agora, limitar, cookie, google });
  return { roteador: r, sessaoPainel, sessaoCliente: app.sessaoCliente };
}
