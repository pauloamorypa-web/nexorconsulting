/* eSocial: certificado digital A1, fila de eventos (gerados automaticamente pelo RH), assinatura, envio em lotes
   ao webservice oficial e consulta do processamento com os recibos. */

import { z } from "zod";
import { consultarLote, enviarLote, montarLote } from "../esocial/cliente.js";
import { GRUPO } from "../esocial/eventos.js";
import { lerCorpo, falha } from "./roteador.js";
import { t, validar } from "./validacao.js";
import { baixar } from "./rotas-ponto.js";

const RH = { papeis: ["admin", "rh"] };
const ADM = { papeis: ["admin"] };

export function rotasEsocial({ r, repo, nucleo, cfg, agora, auditar, fetchSoap }) {
  /** Certificado A1: corpo binário (.pfx) com a senha no cabeçalho x-senha */
  r.post("/api/esocial/certificado", ADM, async (ctx) => {
    const pfx = await lerCorpo(ctx.req, 200 * 1024);
    if (!pfx.length) falha(400, "Envie o arquivo .pfx do certificado.");
    const info = nucleo.guardarCertificado(ctx.empresa, pfx, decodeURIComponent(String(ctx.req.headers["x-senha"] ?? "")));
    auditar(ctx, "certificado_enviado", { titular: info.titular });
    return info;
  });
  r.delete("/api/esocial/certificado", ADM, (ctx) => {
    const { certificado, ...config } = ctx.empresa.config;
    repo.atualizar("empresas", null, ctx.empresa.id, { config });
    auditar(ctx, "certificado_removido");
    return { ok: true };
  });

  r.get("/api/esocial/eventos", RH, ({ empresa, query }) => {
    const status = query.get("status");
    const tipo = query.get("tipo");
    return repo.todos(
      `SELECT id, tipo, descricao, referencia, id_evento, status, lote_id, recibo, ocorrencias, criado_em, atualizado_em FROM esocial_eventos WHERE empresa_id = ? ${status ? "AND status = ?" : ""} ${tipo ? "AND tipo = ?" : ""} ORDER BY criado_em DESC LIMIT 1000`,
      empresa.id,
      ...(status ? [status] : []),
      ...(tipo ? [tipo] : []),
    ).map((e) => repo.ler("esocial_eventos", e));
  });
  r.get("/api/esocial/eventos/:id/xml", RH, ({ empresa, params, res }) => {
    const e = repo.obter("esocial_eventos", empresa.id, params.id);
    if (!e) falha(404, "Evento não encontrado.");
    baixar(res, `${e.tipo}_${e.id_evento}.xml`, `<?xml version="1.0" encoding="UTF-8"?>${e.xml_assinado ?? e.xml}`, "application/xml; charset=utf-8");
  });
  r.delete("/api/esocial/eventos/:id", RH, (ctx) => {
    const e = repo.obter("esocial_eventos", ctx.empresa.id, ctx.params.id);
    if (!e) falha(404, "Evento não encontrado.");
    if (["enviado", "processado"].includes(e.status)) falha(409, "Evento já enviado: para corrigir, gere uma retificação ou exclusão (S-3000) no eSocial.");
    auditar(ctx, "evento_descartado", { tipo: e.tipo, descricao: e.descricao });
    return { ok: repo.remover("esocial_eventos", ctx.empresa.id, e.id) };
  });

  r.post("/api/esocial/tabelas", RH, (ctx) => {
    const criados = nucleo.esocial.tabelasIniciais(ctx.empresa);
    auditar(ctx, "esocial_tabelas_geradas", { eventos: criados.length });
    return { gerados: criados.length };
  });
  r.post("/api/esocial/assinar", RH, (ctx) => ({ assinados: nucleo.esocial.assinarPendentes(ctx.empresa) }));

  /** Envia os eventos assinados em lotes de até 50, respeitando a ordem dos grupos (tabelas → não periódicos → periódicos) */
  r.post("/api/esocial/enviar", RH, async (ctx) => {
    const d = validar(z.object({ ids: z.array(t(40)).max(500).optional() }), await ctx.corpo());
    const cert = nucleo.certificado(ctx.empresa);
    if (!cert) falha(400, "Envie o certificado digital A1 em Configurações → eSocial.");
    nucleo.esocial.assinarPendentes(ctx.empresa);
    let eventos = repo.todos("SELECT * FROM esocial_eventos WHERE empresa_id = ? AND status IN ('assinado','erro') ORDER BY criado_em", ctx.empresa.id);
    if (d.ids?.length) eventos = eventos.filter((e) => d.ids.includes(e.id));
    if (!eventos.length) falha(400, "Não há eventos assinados para enviar.");
    const ambiente = Number(ctx.empresa.config.esocial.ambiente) || 2;
    const grupos = [1, 2, 3].map((g) => eventos.filter((e) => GRUPO[e.tipo] === g)).filter((l) => l.length);
    const resultado = [];
    for (const lista of grupos) {
      for (let i = 0; i < lista.length; i += 50) {
        const parte = lista.slice(i, i + 50);
        const grupo = GRUPO[parte[0].tipo];
        const lote = montarLote({ empresa: ctx.empresa, transmissorCnpj: ctx.empresa.config.transmissor_cnpj, grupo, eventos: parte });
        const resp = await enviarLote({ ambiente, lote, cert, fetchSoap });
        const l = repo.inserir("esocial_lotes", { empresa_id: ctx.empresa.id, ambiente, protocolo: resp.protocolo, status: resp.ok ? "enviado" : "erro", resposta: { codigo: resp.codigo, descricao: resp.descricao, ocorrencias: resp.ocorrencias }, enviado_em: agora() });
        for (const e of parte) repo.atualizar("esocial_eventos", ctx.empresa.id, e.id, { status: resp.ok ? "enviado" : "erro", lote_id: l.id, ocorrencias: resp.ok ? [] : resp.ocorrencias.length ? resp.ocorrencias : [{ codigo: resp.codigo, descricao: resp.descricao }] });
        resultado.push({ lote: l.id, grupo, eventos: parte.length, ok: resp.ok, protocolo: resp.protocolo, mensagem: resp.descricao });
        if (!resp.ok) break;
      }
    }
    auditar(ctx, "esocial_enviado", { lotes: resultado.length, ambiente });
    return { ambiente, lotes: resultado };
  });

  r.get("/api/esocial/lotes", RH, ({ empresa }) => repo.listar("esocial_lotes", empresa.id, {}, { ordem: "enviado_em DESC", limite: 200 }));

  /** Consulta o resultado dos lotes enviados e grava os recibos */
  r.post("/api/esocial/consultar", RH, async (ctx) => {
    const cert = nucleo.certificado(ctx.empresa);
    if (!cert) falha(400, "Certificado digital não configurado.");
    const lotes = repo.todos("SELECT * FROM esocial_lotes WHERE empresa_id = ? AND status IN ('enviado','processando') AND protocolo IS NOT NULL ORDER BY enviado_em LIMIT 20", ctx.empresa.id);
    const resumo = [];
    for (const l of lotes) {
      const resp = await consultarLote({ ambiente: l.ambiente, protocolo: l.protocolo, cert, fetchSoap });
      if (resp.emProcessamento) {
        repo.atualizar("esocial_lotes", ctx.empresa.id, l.id, { status: "processando", consultado_em: agora() });
        resumo.push({ lote: l.id, status: "processando" });
        continue;
      }
      repo.atualizar("esocial_lotes", ctx.empresa.id, l.id, { status: resp.processado ? "processado" : "erro", consultado_em: agora(), resposta: { codigo: resp.codigo, descricao: resp.descricao } });
      for (const ev of resp.eventos) {
        const e = repo.um("SELECT id FROM esocial_eventos WHERE empresa_id = ? AND id_evento = ?", ctx.empresa.id, ev.id);
        if (e) repo.atualizar("esocial_eventos", ctx.empresa.id, e.id, { status: ev.ok ? "processado" : "erro", recibo: ev.recibo, ocorrencias: ev.ocorrencias });
      }
      resumo.push({ lote: l.id, status: resp.processado ? "processado" : "erro", eventos: resp.eventos.length, aceitos: resp.eventos.filter((e) => e.ok).length });
    }
    return { lotes: resumo };
  });

  r.get("/api/esocial/resumo", RH, ({ empresa }) => {
    const por = repo.todos("SELECT status, COUNT(*) n FROM esocial_eventos WHERE empresa_id = ? GROUP BY status", empresa.id);
    const c = empresa.config.certificado;
    return {
      por_status: Object.fromEntries(por.map((p) => [p.status, p.n])),
      ambiente: Number(empresa.config.esocial.ambiente) || 2,
      ativo: empresa.config.esocial.ativo !== false,
      certificado: c ? { titular: c.titular, valido_ate: c.valido_ate, vence_em_dias: Math.floor((c.valido_ate - agora()) / 86400_000) } : null,
      tabelas_enviadas: Boolean(repo.um("SELECT 1 FROM esocial_eventos WHERE empresa_id = ? AND tipo = 'S-1000'", empresa.id)),
    };
  });
}
