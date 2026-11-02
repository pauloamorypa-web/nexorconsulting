/* Férias, afastamentos (atestados), benefícios, lançamentos variáveis, folha mensal, 13º salário e rescisão. */

import { z } from "zod";
import { calcularFerias, calcularRescisao, periodosFerias, TIPOS_RESCISAO } from "../folha/calculo.js";
import { TABELAS_PADRAO, tabelasDaEmpresa } from "../folha/tabelas.js";
import { MOTIVOS_AFASTAMENTO } from "../esocial/eventos.js";
import { dataLocal, diasEntre, somarDias } from "../ponto/calendario.js";
import { centavos, competencia, data, op, t, validar } from "./validacao.js";
import { falha } from "./roteador.js";

const RH = { papeis: ["admin", "rh"] };
const TODOS = {};

export function rotasFolha({ r, repo, nucleo, agora, filtroEquipe, exigirColaborador, auditar, aviso }) {
  const hoje = () => dataLocal(agora());
  const dependentesDe = (empresa_id, id) => repo.listar("dependentes", empresa_id, { colaborador_id: id });
  const comEquipe = (usuario, alias = "c") => {
    const f = filtroEquipe(usuario);
    return { sql: f.sql.replace("departamento_id", `${alias}.departamento_id`), params: f.params };
  };

  /* ---------- Férias ---------- */

  r.get("/api/ferias", TODOS, ({ empresa, usuario, query }) => {
    const f = comEquipe(usuario);
    const status = query.get("status");
    return repo.todos(`SELECT fe.*, c.nome colaborador_nome, c.matricula FROM ferias fe JOIN colaboradores c ON c.id = fe.colaborador_id WHERE fe.empresa_id = ? ${status ? "AND fe.status = ?" : ""}${f.sql} ORDER BY fe.inicio DESC LIMIT 1000`, empresa.id, ...(status ? [status] : []), ...f.params).map((x) => repo.ler("ferias", x));
  });

  /** Situação de férias de todos: períodos vencidos, a vencer e limite para conceder (evita pagar em dobro) */
  r.get("/api/ferias/painel", TODOS, ({ empresa, usuario }) => {
    const f = filtroEquipe(usuario);
    const lista = repo.todos(`SELECT * FROM colaboradores WHERE empresa_id = ? AND status != 'desligado'${f.sql} ORDER BY nome`, empresa.id, ...f.params).map((c) => {
      const periodos = periodosFerias(c.admissao, repo.listar("ferias", empresa.id, { colaborador_id: c.id }), hoje());
      const vencidos = periodos.filter((p) => p.completo && p.saldo > 0);
      const proximo = vencidos[0];
      return { id: c.id, nome: c.nome, admissao: c.admissao, periodos, dias_vencidos: vencidos.reduce((s, p) => s + p.saldo, 0), limite: proximo?.limite_concessivo ?? null, dias_ate_limite: proximo ? diasEntre(hoje(), proximo.limite_concessivo) : null };
    });
    return lista.sort((a, b) => (a.dias_ate_limite ?? 9e9) - (b.dias_ate_limite ?? 9e9));
  });

  const esqFerias = z.object({ colaborador_id: t(40), inicio: data, dias: z.number().int().min(5).max(30), abono_dias: z.number().int().min(0).max(10).optional(), adiantar_13: z.boolean().optional(), observacao: op(500), aquisitivo_inicio: data.optional() });

  function validarFerias(empresa_id, c, d) {
    const periodos = periodosFerias(c.admissao, repo.listar("ferias", empresa_id, { colaborador_id: c.id }), d.inicio);
    const periodo = d.aquisitivo_inicio ? periodos.find((p) => p.inicio === d.aquisitivo_inicio) : periodos.find((p) => p.completo && p.saldo > 0);
    if (!periodo) falha(400, "O colaborador ainda não completou um período aquisitivo com saldo de férias.");
    if (d.dias + (d.abono_dias ?? 0) > periodo.saldo) falha(400, `Saldo do período: ${periodo.saldo} dias.`);
    if ((d.abono_dias ?? 0) > Math.floor(periodo.direito / 3)) falha(400, "O abono pecuniário é de no máximo 1/3 das férias.");
    // CLT art. 134 §3º: não pode começar nos 2 dias que antecedem feriado ou descanso semanal
    const dsr = new Date(`${d.inicio}T12:00:00Z`).getUTCDay();
    const fer = nucleo.feriados(empresa_id, Number(d.inicio.slice(0, 4)));
    if ([5, 6, 0].includes(dsr) || fer.has(somarDias(d.inicio, 1)) || fer.has(somarDias(d.inicio, 2))) falha(400, "Pela CLT (art. 134 §3º), as férias não podem começar nos dois dias antes de feriado ou do descanso semanal.");
    return periodo;
  }

  r.post("/api/ferias", RH, async (ctx) => {
    const d = validar(esqFerias, await ctx.corpo());
    const c = exigirColaborador(ctx, d.colaborador_id);
    const p = validarFerias(ctx.empresa.id, c, d);
    const valores = calcularFerias({ colaborador: c, dias: d.dias, abono_dias: d.abono_dias ?? 0, mediaVariaveis: nucleo.mediaVariaveis(c.id, Number(d.inicio.slice(0, 4))), dependentes: dependentesDe(ctx.empresa.id, c.id), competencia: d.inicio.slice(0, 7), tabelas: tabelasDaEmpresa(ctx.empresa) });
    auditar(ctx, "ferias_programadas", { nome: c.nome, inicio: d.inicio });
    return repo.inserir("ferias", { ...d, empresa_id: ctx.empresa.id, aquisitivo_inicio: p.inicio, aquisitivo_fim: p.fim, status: "aprovada", valores: { ...valores, pagar_ate: somarDias(d.inicio, -2) }, solicitado_por: ctx.usuario.nome, analisado_por: ctx.usuario.nome });
  });

  r.post("/api/ferias/:id/decidir", TODOS, async (ctx) => {
    const d = validar(z.object({ aprovar: z.boolean(), observacao: op(500) }), await ctx.corpo());
    const fe = repo.obter("ferias", ctx.empresa.id, ctx.params.id);
    if (!fe || fe.status !== "solicitada") falha(404, "Solicitação não encontrada.");
    const c = exigirColaborador(ctx, fe.colaborador_id);
    let valores = fe.valores;
    if (d.aprovar) {
      validarFerias(ctx.empresa.id, c, { ...fe, aquisitivo_inicio: fe.aquisitivo_inicio });
      valores = { ...calcularFerias({ colaborador: c, dias: fe.dias, abono_dias: fe.abono_dias, mediaVariaveis: nucleo.mediaVariaveis(c.id, Number(fe.inicio.slice(0, 4))), dependentes: dependentesDe(ctx.empresa.id, c.id), competencia: fe.inicio.slice(0, 7), tabelas: tabelasDaEmpresa(ctx.empresa) }), pagar_ate: somarDias(fe.inicio, -2) };
    }
    auditar(ctx, d.aprovar ? "ferias_aprovadas" : "ferias_recusadas", { nome: c.nome });
    aviso(ctx.empresa.id, "ferias", { id: fe.id });
    return repo.atualizar("ferias", ctx.empresa.id, fe.id, { status: d.aprovar ? "aprovada" : "recusada", observacao: d.observacao ?? fe.observacao, analisado_por: ctx.usuario.nome, valores });
  });
  r.post("/api/ferias/:id/cancelar", RH, (ctx) => {
    const fe = repo.obter("ferias", ctx.empresa.id, ctx.params.id);
    if (!fe) falha(404, "Férias não encontradas.");
    if (fe.inicio <= hoje()) falha(409, "Férias já iniciadas não podem ser canceladas.");
    return repo.atualizar("ferias", ctx.empresa.id, fe.id, { status: "cancelada" });
  });

  /* ---------- Afastamentos e atestados ---------- */

  r.get("/api/afastamentos", TODOS, ({ empresa, usuario, query }) => {
    const f = comEquipe(usuario);
    const status = query.get("status");
    return repo.todos(`SELECT a.*, c.nome colaborador_nome, c.matricula FROM afastamentos a JOIN colaboradores c ON c.id = a.colaborador_id WHERE a.empresa_id = ? ${status ? "AND a.status = ?" : ""}${f.sql} ORDER BY a.inicio DESC LIMIT 1000`, empresa.id, ...(status ? [status] : []), ...f.params);
  });
  r.get("/api/afastamentos/motivos", TODOS, () => MOTIVOS_AFASTAMENTO);

  function aoAprovarAfastamento(ctx, c, a) {
    if (a.inicio <= hoje() && (!a.fim || a.fim >= hoje())) repo.atualizar("colaboradores", ctx.empresa.id, c.id, { status: "afastado" });
    return nucleo.esocial.afastamento(ctx.empresa, c, a);
  }

  r.post("/api/afastamentos", RH, async (ctx) => {
    const d = validar(z.object({ colaborador_id: t(40), motivo: z.enum(Object.keys(MOTIVOS_AFASTAMENTO)).or(z.literal("atestado")), inicio: data, fim: data.optional().nullable(), cid: op(10), medico: op(120), observacao: op(500), anexo: op(40) }), await ctx.corpo());
    if (d.fim && d.fim < d.inicio) falha(400, "A data final é antes da inicial.");
    const c = exigirColaborador(ctx, d.colaborador_id);
    // "atestado" curto (até 15 dias) de doença comum: abona as faltas e não vai ao eSocial
    const motivo = d.motivo === "atestado" ? "03" : d.motivo;
    const a = repo.inserir("afastamentos", { ...d, motivo, empresa_id: ctx.empresa.id, status: "aprovado", enviado_por: ctx.usuario.nome });
    const ev = aoAprovarAfastamento(ctx, c, a);
    auditar(ctx, "afastamento_lancado", { nome: c.nome, motivo });
    return { ...a, evento_esocial: ev ? { id: ev.id, tipo: ev.tipo } : null };
  });
  r.post("/api/afastamentos/:id/decidir", TODOS, async (ctx) => {
    const d = validar(z.object({ aprovar: z.boolean(), observacao: op(500) }), await ctx.corpo());
    const a = repo.obter("afastamentos", ctx.empresa.id, ctx.params.id);
    if (!a || a.status !== "pendente") falha(404, "Atestado não encontrado ou já analisado.");
    const c = exigirColaborador(ctx, a.colaborador_id);
    const novo = repo.atualizar("afastamentos", ctx.empresa.id, a.id, { status: d.aprovar ? "aprovado" : "recusado", observacao: d.observacao ?? a.observacao });
    if (d.aprovar) aoAprovarAfastamento(ctx, c, novo);
    auditar(ctx, d.aprovar ? "atestado_aceito" : "atestado_recusado", { nome: c.nome });
    return novo;
  });
  r.put("/api/afastamentos/:id/retorno", RH, async (ctx) => {
    const d = validar(z.object({ fim: data }), await ctx.corpo());
    const a = repo.obter("afastamentos", ctx.empresa.id, ctx.params.id);
    if (!a) falha(404, "Afastamento não encontrado.");
    const novo = repo.atualizar("afastamentos", ctx.empresa.id, a.id, { fim: d.fim });
    const c = repo.obter("colaboradores", ctx.empresa.id, a.colaborador_id);
    if (c.status === "afastado" && d.fim < hoje()) repo.atualizar("colaboradores", ctx.empresa.id, c.id, { status: "ativo" });
    nucleo.esocial.afastamento(ctx.empresa, c, novo);
    return novo;
  });

  /* ---------- Benefícios ---------- */

  const esqBeneficio = z.object({ nome: t(120), tipo: z.enum(["vt", "vr", "va", "saude", "odonto", "seguro", "outro"]), valor_centavos: centavos, desconto_tipo: z.enum(["nenhum", "percentual", "fixo"]).optional(), desconto_valor: z.number().min(0).max(100000).optional(), ativo: z.boolean().optional() });
  r.get("/api/beneficios", TODOS, ({ empresa }) =>
    repo.todos("SELECT b.*, (SELECT COUNT(*) FROM colaborador_beneficios cb WHERE cb.beneficio_id = b.id) participantes FROM beneficios b WHERE b.empresa_id = ? ORDER BY nome", empresa.id).map((b) => repo.ler("beneficios", b)),
  );
  r.post("/api/beneficios", RH, async (ctx) => repo.inserir("beneficios", { ...validar(esqBeneficio, await ctx.corpo()), empresa_id: ctx.empresa.id }));
  r.put("/api/beneficios/:id", RH, async (ctx) => repo.atualizar("beneficios", ctx.empresa.id, ctx.params.id, validar(esqBeneficio.partial(), await ctx.corpo())) ?? falha(404, "Benefício não encontrado."));
  r.delete("/api/beneficios/:id", RH, ({ empresa, params }) => ({ ok: repo.remover("beneficios", empresa.id, params.id) }));

  /* ---------- Lançamentos variáveis (comissões, bônus, descontos) ---------- */

  r.get("/api/lancamentos/:competencia", RH, ({ empresa, params }) => repo.todos("SELECT l.*, c.nome colaborador_nome FROM lancamentos l JOIN colaboradores c ON c.id = l.colaborador_id WHERE l.empresa_id = ? AND l.competencia = ? ORDER BY c.nome", empresa.id, validar(competencia, params.competencia)));
  r.post("/api/lancamentos", RH, async (ctx) => {
    const d = validar(z.object({ colaborador_id: t(40), competencia, rubrica: z.string().trim().max(12).optional(), descricao: t(120), tipo: z.enum(["provento", "desconto"]), valor_centavos: centavos.refine((v) => v > 0), incide_inss: z.boolean().optional(), incide_irrf: z.boolean().optional(), incide_fgts: z.boolean().optional() }), await ctx.corpo());
    exigirColaborador(ctx, d.colaborador_id);
    return repo.inserir("lancamentos", { ...d, rubrica: d.rubrica || (d.tipo === "provento" ? "OUTPROV" : "OUTDESC"), empresa_id: ctx.empresa.id });
  });
  r.delete("/api/lancamentos/:id", RH, ({ empresa, params }) => ({ ok: repo.remover("lancamentos", empresa.id, params.id) }));

  /* ---------- Folha ---------- */

  r.get("/api/folhas", RH, ({ empresa }) => repo.listar("folhas", empresa.id, {}, { ordem: "competencia DESC" }));
  r.get("/api/folhas/:id", RH, ({ empresa, params }) => {
    const f = repo.obter("folhas", empresa.id, params.id);
    if (!f) falha(404, "Folha não encontrada.");
    return { ...f, itens: nucleo.itensDaFolha(f.id, empresa.id) };
  });
  r.post("/api/folhas/calcular", RH, async (ctx) => {
    const d = validar(z.object({ competencia, tipo: z.enum(["mensal", "13_1", "13_2"]).optional() }), await ctx.corpo());
    const f = nucleo.calcularFolha(ctx.empresa, d.competencia, d.tipo ?? "mensal");
    auditar(ctx, "folha_calculada", { competencia: d.competencia, tipo: d.tipo ?? "mensal" });
    return { ...f, itens: nucleo.itensDaFolha(f.id, ctx.empresa.id) };
  });
  /** Fecha a folha: libera os holerites no aplicativo e gera S-1200, S-1210 e S-1299 */
  r.post("/api/folhas/:id/fechar", RH, async (ctx) => {
    const d = validar(z.object({ data_pagamento: data }), await ctx.corpo());
    const f = repo.obter("folhas", ctx.empresa.id, ctx.params.id);
    if (!f) falha(404, "Folha não encontrada.");
    if (f.status === "fechada") falha(409, "Folha já fechada.");
    const novo = repo.atualizar("folhas", ctx.empresa.id, f.id, { status: "fechada", fechada_em: agora(), totais: { ...f.totais, data_pagamento: d.data_pagamento } });
    const eventos = nucleo.esocial.folha(ctx.empresa, novo, d.data_pagamento);
    auditar(ctx, "folha_fechada", { competencia: f.competencia, tipo: f.tipo });
    return { ...novo, eventos_esocial: eventos.length };
  });
  r.post("/api/folhas/:id/reabrir", { papeis: ["admin"] }, (ctx) => {
    const f = repo.obter("folhas", ctx.empresa.id, ctx.params.id);
    if (!f) falha(404, "Folha não encontrada.");
    const enviados = repo.um("SELECT COUNT(*) n FROM esocial_eventos WHERE empresa_id = ? AND json_extract(referencia,'$.folha_id') = ? AND status IN ('enviado','processado')", ctx.empresa.id, f.id).n;
    if (enviados) falha(409, "Já há eventos desta folha enviados ao eSocial. Faça a retificação pelo eSocial.");
    repo.rodar("DELETE FROM esocial_eventos WHERE empresa_id = ? AND json_extract(referencia,'$.folha_id') = ?", ctx.empresa.id, f.id);
    auditar(ctx, "folha_reaberta", { competencia: f.competencia });
    return repo.atualizar("folhas", ctx.empresa.id, f.id, { status: "calculada", fechada_em: null });
  });
  r.get("/api/folhas/:id/holerite/:colaborador", TODOS, (ctx) => {
    const f = repo.obter("folhas", ctx.empresa.id, ctx.params.id);
    const c = exigirColaborador(ctx, ctx.params.colaborador);
    const item = f && nucleo.itensDaFolha(f.id, ctx.empresa.id).find((i) => i.colaborador_id === c.id);
    if (!item) falha(404, "Holerite não encontrado.");
    return { folha: f, item, empresa: { razao_social: ctx.empresa.razao_social, cnpj: ctx.empresa.cnpj } };
  });
  /** Exportação para o banco (CSV simples com dados de pagamento) */
  r.get("/api/folhas/:id/pagamentos.csv", RH, (ctx) => {
    const f = repo.obter("folhas", ctx.empresa.id, ctx.params.id);
    if (!f) falha(404, "Folha não encontrada.");
    const linhas = [["matricula", "nome", "cpf", "banco", "agencia", "conta", "pix", "liquido"].join(";")];
    for (const i of nucleo.itensDaFolha(f.id, ctx.empresa.id)) {
      const c = repo.obter("colaboradores", ctx.empresa.id, i.colaborador_id);
      linhas.push([c.matricula, c.nome, c.cpf, c.banco?.banco ?? "", c.banco?.agencia ?? "", c.banco?.conta ?? "", c.banco?.pix ?? "", (i.liquido / 100).toFixed(2).replace(".", ",")].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    }
    ctx.res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pagamentos_${f.competencia}_${f.tipo}.csv"` });
    ctx.res.end("﻿" + linhas.join("\r\n"));
  });

  r.get("/api/tabelas", RH, ({ empresa }) => ({ vigentes: tabelasDaEmpresa(empresa), padrao: TABELAS_PADRAO, personalizadas: Boolean(empresa.config.tabelas) }));

  /* ---------- Rescisão ---------- */

  r.get("/api/rescisao/tipos", RH, () => TIPOS_RESCISAO);

  const esqRescisao = z.object({ colaborador_id: t(40), data, tipo: z.enum(Object.keys(TIPOS_RESCISAO)), aviso: z.enum(["indenizado", "trabalhado", "dispensado"]).optional(), saldo_fgts_centavos: centavos.optional().nullable(), observacao: op(1000) });
  const simular = (ctx, d) => {
    const c = exigirColaborador(ctx, d.colaborador_id);
    if (c.status === "desligado") falha(409, "Colaborador já desligado.");
    if (d.data < c.admissao) falha(400, "Data antes da admissão.");
    return { c, res: calcularRescisao({ colaborador: c, data: d.data, tipo: d.tipo, aviso: d.aviso, ferias: repo.listar("ferias", ctx.empresa.id, { colaborador_id: c.id }), saldoFgts: d.saldo_fgts_centavos ?? undefined, dependentes: dependentesDe(ctx.empresa.id, c.id), tabelas: tabelasDaEmpresa(ctx.empresa) }) };
  };
  r.post("/api/rescisao/simular", RH, async (ctx) => {
    const d = validar(esqRescisao, await ctx.corpo());
    const { res } = simular(ctx, d);
    return { ...res, pagar_ate: somarDias(d.data, 10) };
  });
  r.post("/api/rescisao/efetivar", RH, async (ctx) => {
    const d = validar(esqRescisao, await ctx.corpo());
    const { c, res } = simular(ctx, d);
    const desligamento = { data: d.data, tipo: d.tipo, aviso: d.aviso ?? "indenizado", observacao: d.observacao, valores: res, pagar_ate: somarDias(d.data, 10), registrado_por: ctx.usuario.nome };
    const novo = repo.atualizar("colaboradores", ctx.empresa.id, c.id, { status: "desligado", desligamento });
    repo.rodar("DELETE FROM sessoes WHERE colaborador_id = ?", c.id);
    const ev = novo.categoria_esocial !== "901" ? nucleo.esocial.desligamento(ctx.empresa, novo, res, d.data) : null;
    auditar(ctx, "colaborador_desligado", { nome: c.nome, tipo: d.tipo });
    return { ok: true, desligamento, evento_esocial: ev ? { id: ev.id, tipo: ev.tipo } : null };
  });
}
