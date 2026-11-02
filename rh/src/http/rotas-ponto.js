/* Ponto eletrônico no painel: quem está trabalhando agora, marcações, espelho, ajustes (tratamento), banco de
   horas, fechamento do mês, arquivos de fiscalização (AFD e AEJ) e o quiosque com QR Code rotativo. */

import QRCode from "qrcode";
import { z } from "zod";
import { assinarArquivoCades } from "../esocial/assinatura.js";
import { conferirSenha, iguais, sha256 } from "../seguranca.js";
import { dataLocal, horaLocal, instante, minutos, somarDias } from "../ponto/calendario.js";
import { previstoNoDia } from "../ponto/espelho.js";
import { gerarAej, gerarAfd } from "../ponto/arquivos.js";
import { tokenQr } from "../ponto/presenca.js";
import { comprovante, conferirCadeia, registrarMarcacao } from "../ponto/registro.js";
import { competencia, cpf, data, horario, op, t, validar } from "./validacao.js";
import { falha } from "./roteador.js";

const RH = { papeis: ["admin", "rh"] };
const TODOS = {};

export function rotasPonto({ r, repo, nucleo, cfg, agora, filtroEquipe, exigirColaborador, auditar, aviso, base, limitar }) {
  const fimDaCompetencia = (comp) => somarDias(somarDias(`${comp}-28`, 4).slice(0, 7) + "-01", -1);
  const fechada = (empresa_id, dia) => Boolean(repo.um("SELECT 1 FROM fechamentos WHERE empresa_id = ? AND competencia = ?", empresa_id, dia.slice(0, 7)));

  /* ---------- Agora ---------- */

  r.get("/api/ponto/hoje", TODOS, ({ empresa, usuario }) => {
    const f = filtroEquipe(usuario);
    const hoje = dataLocal(agora());
    const feriado = nucleo.feriados(empresa.id, Number(hoje.slice(0, 4))).has(hoje);
    const colaboradores = repo.todos(`SELECT * FROM colaboradores WHERE empresa_id = ? AND status != 'desligado'${f.sql} ORDER BY nome`, empresa.id, ...f.params).map((c) => repo.ler("colaboradores", c));
    const jornadas = new Map(repo.listar("jornadas", empresa.id).map((j) => [j.id, j]));
    const desde = agora() - 20 * 3600_000;
    const marcas = repo.todos("SELECT colaborador_id, momento, origem, biometria, qr FROM marcacoes WHERE empresa_id = ? AND momento >= ? AND status = 'valida' ORDER BY momento", empresa.id, desde);
    const porColab = new Map();
    for (const m of marcas) porColab.set(m.colaborador_id, [...(porColab.get(m.colaborador_id) ?? []), m]);
    const agoraMin = minutos(horaLocal(agora()));
    const lista = colaboradores.map((c) => {
      const jornada = jornadas.get(c.jornada_id);
      const prev = c.status === "ativo" && !feriado ? previstoNoDia(jornada, hoje) : null;
      const ms = turnoAtual(porColab.get(c.id) ?? [], agora());
      let situacao = c.status === "ferias" ? "ferias" : c.status === "afastado" ? "afastado" : !prev ? "folga" : "aguardando";
      if (ms.length) {
        const ultima = ms.at(-1).momento;
        situacao = ms.length % 2 ? "trabalhando" : ms.length === 2 && agora() - ultima < ((prev ?? previstoNoDia(jornada, somarDias(hoje, -1)))?.intervalo_min ?? 60) * 60_000 + 30 * 60_000 ? "intervalo" : "saiu";
      } else if (prev && agoraMin > minutos(prev.entrada) + (jornada?.tolerancia_min ?? 5)) situacao = "atrasado";
      return { id: c.id, nome: c.nome, matricula: c.matricula, departamento_id: c.departamento_id, situacao, previsto: prev, marcacoes: ms.map((m) => ({ hora: horaLocal(m.momento), origem: m.origem, biometria: Boolean(m.biometria), qr: Boolean(m.qr) })) };
    });
    const conta = (s) => lista.filter((x) => x.situacao === s).length;
    return { data: hoje, feriado, resumo: { trabalhando: conta("trabalhando"), intervalo: conta("intervalo"), atrasados: conta("atrasado"), aguardando: conta("aguardando"), saiu: conta("saiu"), folga: conta("folga"), ferias: conta("ferias"), afastados: conta("afastado") }, lista };
  });

  r.get("/api/ponto/marcacoes", TODOS, ({ empresa, usuario, query }) => {
    const de = query.get("de") ?? dataLocal(agora());
    const ate = query.get("ate") ?? de;
    const f = filtroEquipe(usuario);
    const colab = query.get("colaborador");
    return repo
      .todos(
        `SELECT m.*, c.nome colaborador_nome, c.matricula, e.nome local FROM marcacoes m JOIN colaboradores c ON c.id = m.colaborador_id LEFT JOIN estabelecimentos e ON e.id = m.estabelecimento_id
         WHERE m.empresa_id = ? AND m.momento >= ? AND m.momento < ? ${colab ? "AND m.colaborador_id = ?" : ""}${f.sql.replace("departamento_id", "c.departamento_id")} ORDER BY m.momento DESC LIMIT 3000`,
        empresa.id,
        instante(de),
        instante(somarDias(ate, 1)),
        ...(colab ? [colab] : []),
        ...f.params,
      )
      .map((m) => ({ ...repo.ler("marcacoes", m), hora: horaLocal(m.momento), dia: dataLocal(m.momento) }));
  });

  /* ---------- Espelho ---------- */

  r.get("/api/ponto/espelho/:colaborador/:competencia", TODOS, (ctx) => {
    const comp = validar(competencia, ctx.params.competencia);
    const c = exigirColaborador(ctx, ctx.params.colaborador);
    return { colaborador: { id: c.id, nome: c.nome, matricula: c.matricula, cpf: c.cpf, admissao: c.admissao }, ...nucleo.espelhoDe(c, comp) };
  });

  /** Resumo do mês de todos (base para o fechamento) */
  r.get("/api/ponto/resumo/:competencia", TODOS, ({ empresa, usuario, params }) => {
    const comp = validar(competencia, params.competencia);
    const f = filtroEquipe(usuario);
    const fim = fimDaCompetencia(comp);
    const lista = repo
      .todos(`SELECT * FROM colaboradores WHERE empresa_id = ? AND admissao <= ? AND (status != 'desligado' OR json_extract(desligamento,'$.data') >= ?)${f.sql} ORDER BY nome`, empresa.id, fim, `${comp}-01`, ...f.params)
      .map((c) => repo.ler("colaboradores", c))
      .map((c) => {
        const e = nucleo.espelhoDe(c, comp);
        return { id: c.id, nome: c.nome, matricula: c.matricula, banco_horas: e.banco_horas, totais: e.totais, assinado: Boolean(e.assinatura), saldo_banco: e.saldo_banco };
      });
    return { competencia: comp, fechado: Boolean(repo.um("SELECT 1 FROM fechamentos WHERE empresa_id = ? AND competencia = ?", empresa.id, comp)), lista };
  });

  /* ---------- Ajustes (tratamento de ponto) ---------- */

  r.get("/api/ajustes", TODOS, ({ empresa, usuario, query }) => {
    const f = filtroEquipe(usuario);
    const status = query.get("status") || "pendente";
    return repo.todos(
      `SELECT a.*, c.nome colaborador_nome, c.matricula FROM ajustes a JOIN colaboradores c ON c.id = a.colaborador_id WHERE a.empresa_id = ? ${status === "todos" ? "" : "AND a.status = ?"}${f.sql.replace("departamento_id", "c.departamento_id")} ORDER BY a.criado_em DESC LIMIT 500`,
      empresa.id,
      ...(status === "todos" ? [] : [status]),
      ...f.params,
    );
  });

  /** O RH (ou gestor) lança um ajuste já aprovado: inclusão de marcação esquecida, desconsideração ou abono */
  r.post("/api/ajustes", TODOS, async (ctx) => {
    const d = validar(z.object({ colaborador_id: t(40), data, tipo: z.enum(["inclusao", "desconsiderar", "abono"]), horario: horario.optional(), marcacao_id: op(40), minutos: z.number().int().min(1).max(1440).optional(), motivo: t(500), anexo: op(40) }), await ctx.corpo());
    exigirColaborador(ctx, d.colaborador_id);
    if (fechada(ctx.empresa.id, d.data)) falha(409, "O ponto deste mês já foi fechado. Reabra para ajustar.");
    if (d.tipo === "inclusao" && !d.horario) falha(400, "Informe o horário da marcação.");
    if (d.tipo === "desconsiderar") {
      const m = d.marcacao_id && repo.obter("marcacoes", ctx.empresa.id, d.marcacao_id);
      if (!m || m.colaborador_id !== d.colaborador_id) falha(400, "Escolha a marcação a desconsiderar.");
    }
    const a = repo.inserir("ajustes", { ...d, empresa_id: ctx.empresa.id, status: "aprovado", analisado_por: ctx.usuario.nome, analisado_em: agora() });
    aplicarAjuste(ctx.empresa.id, a);
    auditar(ctx, "ajuste_lancado", { tipo: d.tipo, data: d.data });
    return a;
  });

  function aplicarAjuste(empresa_id, a) {
    if (a.tipo === "desconsiderar" && a.marcacao_id) repo.rodar("UPDATE marcacoes SET status = 'desconsiderada', motivo = ? WHERE id = ? AND empresa_id = ?", a.motivo, a.marcacao_id, empresa_id);
  }

  r.post("/api/ajustes/:id/decidir", TODOS, async (ctx) => {
    const d = validar(z.object({ aprovar: z.boolean(), resposta: op(500) }), await ctx.corpo());
    const a = repo.obter("ajustes", ctx.empresa.id, ctx.params.id);
    if (!a || a.status !== "pendente") falha(404, "Solicitação não encontrada ou já analisada.");
    exigirColaborador(ctx, a.colaborador_id);
    if (d.aprovar && fechada(ctx.empresa.id, a.data)) falha(409, "O ponto deste mês já foi fechado.");
    const novo = repo.atualizar("ajustes", ctx.empresa.id, a.id, { status: d.aprovar ? "aprovado" : "recusado", resposta: d.resposta, analisado_por: ctx.usuario.nome, analisado_em: agora() });
    if (d.aprovar) aplicarAjuste(ctx.empresa.id, novo);
    auditar(ctx, d.aprovar ? "ajuste_aprovado" : "ajuste_recusado", { data: a.data, tipo: a.tipo });
    aviso(ctx.empresa.id, "ajuste", { id: a.id });
    return novo;
  });

  /* ---------- Banco de horas ---------- */

  r.get("/api/banco-horas/:colaborador", TODOS, (ctx) => {
    const c = exigirColaborador(ctx, ctx.params.colaborador);
    return { saldo: repo.saldoBanco(c.id), lancamentos: repo.listar("banco_horas", ctx.empresa.id, { colaborador_id: c.id }, { ordem: "data DESC" }) };
  });
  r.post("/api/banco-horas/:colaborador", RH, async (ctx) => {
    const c = exigirColaborador(ctx, ctx.params.colaborador);
    const d = validar(z.object({ data, minutos: z.number().int().min(-20000).max(20000).refine((v) => v !== 0), descricao: t(200) }), await ctx.corpo());
    auditar(ctx, "banco_horas_lancamento", { nome: c.nome, minutos: d.minutos });
    return repo.inserir("banco_horas", { ...d, empresa_id: ctx.empresa.id, colaborador_id: c.id, origem: "manual" });
  });

  /* ---------- Fechamento do mês ---------- */

  r.post("/api/ponto/fechar/:competencia", RH, (ctx) => {
    const comp = validar(competencia, ctx.params.competencia);
    if (repo.um("SELECT 1 FROM fechamentos WHERE empresa_id = ? AND competencia = ?", ctx.empresa.id, comp)) falha(409, "Este mês já está fechado.");
    const fim = fimDaCompetencia(comp);
    const colaboradores = repo.todos("SELECT * FROM colaboradores WHERE empresa_id = ? AND admissao <= ? AND (status != 'desligado' OR json_extract(desligamento,'$.data') >= ?)", ctx.empresa.id, fim, `${comp}-01`).map((c) => repo.ler("colaboradores", c));
    let pendencias = 0;
    repo.transacao(() => {
      for (const c of colaboradores) {
        const e = nucleo.espelhoDe(c, comp);
        pendencias += e.totais.pendencias;
        if (!e.banco_horas) continue;
        // Jornada com banco de horas: extras entram como crédito, atrasos como débito
        const credito = e.totais.extra50 + e.totais.extra100;
        if (credito) repo.inserir("banco_horas", { empresa_id: ctx.empresa.id, colaborador_id: c.id, data: fim, minutos: credito, origem: "fechamento", descricao: `Horas extras de ${comp}` });
        if (e.totais.atraso) repo.inserir("banco_horas", { empresa_id: ctx.empresa.id, colaborador_id: c.id, data: fim, minutos: -e.totais.atraso, origem: "fechamento", descricao: `Atrasos e saídas antecipadas de ${comp}` });
      }
      repo.inserir("fechamentos", { empresa_id: ctx.empresa.id, competencia: comp, fechado_por: ctx.usuario.nome, fechado_em: agora() });
    });
    auditar(ctx, "ponto_fechado", { competencia: comp });
    return { ok: true, colaboradores: colaboradores.length, pendencias };
  });
  r.delete("/api/ponto/fechar/:competencia", { papeis: ["admin"] }, (ctx) => {
    const comp = validar(competencia, ctx.params.competencia);
    repo.transacao(() => {
      repo.rodar("DELETE FROM fechamentos WHERE empresa_id = ? AND competencia = ?", ctx.empresa.id, comp);
      repo.rodar("DELETE FROM banco_horas WHERE empresa_id = ? AND origem = 'fechamento' AND data = ?", ctx.empresa.id, fimDaCompetencia(comp));
    });
    auditar(ctx, "ponto_reaberto", { competencia: comp });
    return { ok: true };
  });

  /* ---------- Fiscalização: AFD, AEJ e integridade ---------- */

  const periodo = (query) => {
    const de = validar(data, query.get("de"));
    const ate = validar(data, query.get("ate"));
    if (ate < de) falha(400, "Período inválido.");
    return { de, ate };
  };
  const afdTexto = (empresa, de, ate) =>
    gerarAfd({ empresa, marcacoes: repo.marcacoesEmpresaEntre(empresa.id, instante(de), instante(somarDias(ate, 1))), de, ate, registroInpi: empresa.config.registro_inpi, desenvolvedorCnpj: cfg.sistema.desenvolvedorCnpj, agora: agora() });
  const nomeArquivo = (empresa, tipo, de, ate) => `${tipo}_${empresa.cnpj}_${de.replace(/-/g, "")}_${ate.replace(/-/g, "")}`;

  r.get("/api/ponto/afd", RH, (ctx) => {
    const { de, ate } = periodo(ctx.query);
    auditar(ctx, "afd_gerado", { de, ate });
    baixar(ctx.res, `${nomeArquivo(ctx.empresa, "AFD", de, ate)}.txt`, afdTexto(ctx.empresa, de, ate), "text/plain; charset=utf-8");
  });
  r.get("/api/ponto/afd-assinatura", RH, (ctx) => {
    const { de, ate } = periodo(ctx.query);
    const cert = nucleo.certificado(ctx.empresa);
    if (!cert) falha(400, "Envie o certificado digital A1 em Configurações → eSocial para assinar o AFD.");
    baixar(ctx.res, `${nomeArquivo(ctx.empresa, "AFD", de, ate)}.txt.p7s`, assinarArquivoCades(afdTexto(ctx.empresa, de, ate), cert), "application/pkcs7-signature");
  });
  r.get("/api/ponto/aej", RH, (ctx) => {
    const comp = validar(competencia, ctx.query.get("competencia"));
    const de = `${comp}-01`;
    const ate = fimDaCompetencia(comp);
    const colaboradores = repo.todos("SELECT * FROM colaboradores WHERE empresa_id = ? AND admissao <= ? ORDER BY nome", ctx.empresa.id, ate).map((c) => repo.ler("colaboradores", c));
    const espelhos = new Map(colaboradores.map((c) => [c.id, nucleo.espelhoDe(c, comp)]));
    const marcacoesPorColab = new Map(colaboradores.map((c) => [c.id, repo.marcacoesEntre(c.id, instante(de), instante(somarDias(ate, 1))).filter((m) => m.status === "valida")]));
    const txt = gerarAej({ empresa: ctx.empresa, colaboradores, jornadas: repo.listar("jornadas", ctx.empresa.id), espelhos, marcacoesPorColab, de, ate, registroInpi: ctx.empresa.config.registro_inpi, sistema: cfg.sistema });
    auditar(ctx, "aej_gerado", { competencia: comp });
    baixar(ctx.res, `${nomeArquivo(ctx.empresa, "AEJ", de, ate)}.txt`, txt, "text/plain; charset=utf-8");
  });
  r.get("/api/ponto/integridade", RH, ({ empresa }) => conferirCadeia(repo, empresa.id));

  /* ---------- Quiosque (tablet na entrada da empresa) ---------- */

  function quiosque(req) {
    const [id, token] = String(req.headers["x-quiosque"] ?? "").split(".");
    const e = id && repo.obter("estabelecimentos", null, id);
    if (!e?.quiosque_hash || !e.ativo || !iguais(sha256(token ?? ""), e.quiosque_hash)) falha(401, "Quiosque não autorizado. Gere um novo link no painel.");
    return e;
  }

  r.get("/api/quiosque/qr", { publico: true }, async ({ req }) => {
    const e = quiosque(req);
    const emp = nucleo.empresa(e.empresa_id);
    const token = tokenQr(e.id, e.qr_segredo, agora(), cfg.qrSegundos);
    const url = `${base(req)}/app/?q=${encodeURIComponent(token)}`;
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b1220", light: "#ffffff" } });
    const janela = Math.floor(agora() / (cfg.qrSegundos * 1000));
    return { svg, url, local: e.nome, empresa: emp.nome_fantasia || emp.razao_social, segundos: cfg.qrSegundos, troca_em: (janela + 1) * cfg.qrSegundos * 1000, agora: agora(), pin: emp.config.ponto.permitir_quiosque_pin };
  });

  /** Ponto no próprio quiosque com CPF + PIN (para quem está sem celular) */
  r.post("/api/quiosque/ponto", { publico: true }, async ({ req, corpo, ip }) => {
    const e = quiosque(req);
    const emp = nucleo.empresa(e.empresa_id);
    if (!emp.config.ponto.permitir_quiosque_pin) falha(403, "Ponto por PIN desativado. Use o aplicativo.");
    const d = validar(z.object({ cpf, pin: z.string().regex(/^\d{4,6}$/) }), await corpo());
    limitar(`pin:${d.cpf}`, 5);
    limitar(`pin-ip:${ip}`, 60);
    const c = repo.ler("colaboradores", repo.um("SELECT * FROM colaboradores WHERE empresa_id = ? AND cpf = ? AND status != 'desligado'", emp.id, d.cpf));
    if (!c?.pin_hash || !conferirSenha(d.pin, c.pin_hash)) falha(401, "CPF ou PIN incorretos.");
    const m = registrarMarcacao(repo, { empresa_id: emp.id, colaborador: c, origem: "quiosque", coletor: "02", estabelecimento_id: e.id, ip, aparelho: "Quiosque " + e.nome, agora: agora() });
    aviso(emp.id, "marcacao", { colaborador_id: c.id });
    return { nome: c.nome.split(" ")[0], hora: horaLocal(m.momento), comprovante: comprovante({ empresa: emp, estabelecimento: e, colaborador: c, marcacao: m, registroInpi: emp.config.registro_inpi }) };
  });
}

/** Marcações do turno atual: a sequência mais recente com intervalos menores que 5 h (cobre turnos que viram a
    noite). Um turno já encerrado (número par de marcações) há mais de 4 h não conta como o de agora. */
export function turnoAtual(marcacoes, agora) {
  const turno = [];
  for (let i = marcacoes.length - 1; i >= 0; i--) {
    if (turno.length && turno[0].momento - marcacoes[i].momento >= 5 * 3600_000) break;
    turno.unshift(marcacoes[i]);
  }
  if (turno.length && turno.length % 2 === 0 && agora - turno.at(-1).momento > 4 * 3600_000) return [];
  return turno;
}

export function baixar(res, nome, conteudo, tipo) {
  const corpo = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, "utf8");
  res.writeHead(200, { "Content-Type": tipo, "Content-Length": corpo.length, "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "no-store" });
  res.end(corpo);
}
