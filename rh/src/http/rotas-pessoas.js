/* Painel inicial, recrutamento (vagas, página pública de candidatura e funil) e comunicados internos. */

import { z } from "zod";
import { dataLocal, diasEntre, somarDias } from "../ponto/calendario.js";
import { periodosFerias } from "../folha/calculo.js";
import { op, t, validar } from "./validacao.js";
import { falha } from "./roteador.js";

const RH = { papeis: ["admin", "rh"] };
const TODOS = {};
export const ETAPAS = ["triagem", "entrevista", "teste", "proposta", "contratado", "reprovado"];

export function rotasPessoas({ r, repo, nucleo, agora, filtroEquipe, auditar, aviso, limitar, base }) {
  const hoje = () => dataLocal(agora());

  /* ---------- Painel inicial ---------- */

  r.get("/api/painel", TODOS, ({ empresa, usuario }) => {
    const f = filtroEquipe(usuario);
    const ativos = repo.todos(`SELECT * FROM colaboradores WHERE empresa_id = ? AND status != 'desligado'${f.sql}`, empresa.id, ...f.params).map((c) => repo.ler("colaboradores", c));
    const d = hoje();
    const mmdd = d.slice(5);
    const fimMes = somarDias(somarDias(`${d.slice(0, 7)}-28`, 4).slice(0, 7) + "-01", -1);
    const aniversariantes = ativos.filter((c) => c.nascimento && c.nascimento.slice(5, 7) === d.slice(5, 7)).map((c) => ({ id: c.id, nome: c.nome, dia: c.nascimento.slice(8), hoje: c.nascimento.slice(5) === mmdd })).sort((a, b) => a.dia.localeCompare(b.dia));
    const tempoCasa = ativos.filter((c) => c.admissao.slice(5) === mmdd && c.admissao < d).map((c) => ({ id: c.id, nome: c.nome, anos: Number(d.slice(0, 4)) - Number(c.admissao.slice(0, 4)) }));
    const feriasAlerta = ativos
      .map((c) => {
        const vencidos = periodosFerias(c.admissao, repo.listar("ferias", empresa.id, { colaborador_id: c.id }), d).filter((p) => p.completo && p.saldo > 0);
        return vencidos.length ? { id: c.id, nome: c.nome, limite: vencidos[0].limite_concessivo, dias: diasEntre(d, vencidos[0].limite_concessivo), saldo: vencidos.reduce((s, p) => s + p.saldo, 0) } : null;
      })
      .filter((x) => x && x.dias <= 90)
      .sort((a, b) => a.dias - b.dias);
    const documentosVencendo = repo.todos("SELECT d.*, c.nome colaborador_nome FROM documentos d JOIN colaboradores c ON c.id = d.colaborador_id WHERE d.empresa_id = ? AND d.validade IS NOT NULL AND d.validade <= ? AND c.status != 'desligado' ORDER BY d.validade LIMIT 20", empresa.id, somarDias(d, 30));
    const experiencia = ativos.filter((c) => [45, 90].some((n) => { const fim = somarDias(c.admissao, n - 1); return fim >= d && diasEntre(d, fim) <= 10; })).map((c) => ({ id: c.id, nome: c.nome, admissao: c.admissao, vence: diasEntre(c.admissao, d) < 45 ? somarDias(c.admissao, 44) : somarDias(c.admissao, 89) }));
    const ano = d.slice(0, 4);
    const desligadosAno = repo.um("SELECT COUNT(*) n FROM colaboradores WHERE empresa_id = ? AND status = 'desligado' AND json_extract(desligamento,'$.data') LIKE ?", empresa.id, `${ano}-%`).n;
    const admitidosAno = repo.um("SELECT COUNT(*) n FROM colaboradores WHERE empresa_id = ? AND admissao LIKE ?", empresa.id, `${ano}-%`).n;
    const porDepartamento = repo.todos(`SELECT COALESCE(d.nome, 'Sem departamento') nome, COUNT(*) n, SUM(c.salario_centavos) folha FROM colaboradores c LEFT JOIN departamentos d ON d.id = c.departamento_id WHERE c.empresa_id = ? AND c.status != 'desligado'${f.sql.replace("departamento_id", "c.departamento_id")} GROUP BY 1 ORDER BY n DESC`, empresa.id, ...f.params);
    const semApp = ativos.filter((c) => !repo.um("SELECT 1 FROM sessoes WHERE colaborador_id = ? AND expira_em > ?", c.id, agora())).length;
    return {
      ativos: ativos.length,
      por_status: { ativo: ativos.filter((c) => c.status === "ativo").length, ferias: ativos.filter((c) => c.status === "ferias").length, afastado: ativos.filter((c) => c.status === "afastado").length },
      folha_salarial: ativos.reduce((s, c) => s + c.salario_centavos, 0),
      admitidos_ano: admitidosAno,
      desligados_ano: desligadosAno,
      turnover_ano: ativos.length ? Math.round(((admitidosAno + desligadosAno) / 2 / ativos.length) * 1000) / 10 : 0,
      aniversariantes,
      tempo_casa: tempoCasa,
      ferias_alerta: feriasAlerta,
      documentos_vencendo: documentosVencendo,
      experiencia,
      por_departamento: porDepartamento,
      sem_app: semApp,
      fim_mes: fimMes,
      integridade_ponto: repo.um("SELECT COUNT(*) n FROM marcacoes WHERE empresa_id = ?", empresa.id).n,
    };
  });

  /* ---------- Vagas e candidatos ---------- */

  const esqVaga = z.object({ titulo: t(120), departamento_id: op(40), cargo_id: op(40), descricao: op(8000), requisitos: op(4000), salario: op(60), modalidade: z.enum(["presencial", "hibrido", "remoto"]).optional(), local: op(120), status: z.enum(["aberta", "pausada", "fechada"]).optional() });
  r.get("/api/vagas", RH, ({ empresa }) => repo.todos("SELECT v.*, (SELECT COUNT(*) FROM candidatos c WHERE c.vaga_id = v.id) candidatos FROM vagas v WHERE v.empresa_id = ? ORDER BY v.status, v.criada_em DESC", empresa.id));
  r.post("/api/vagas", RH, async (ctx) => repo.inserir("vagas", { ...validar(esqVaga, await ctx.corpo()), empresa_id: ctx.empresa.id }));
  r.put("/api/vagas/:id", RH, async (ctx) => repo.atualizar("vagas", ctx.empresa.id, ctx.params.id, validar(esqVaga.partial(), await ctx.corpo())) ?? falha(404, "Vaga não encontrada."));
  r.delete("/api/vagas/:id", RH, ({ empresa, params }) => ({ ok: repo.remover("vagas", empresa.id, params.id) }));
  r.get("/api/vagas/link", RH, ({ empresa, req }) => ({ link: `${base(req)}/vagas/?e=${empresa.id}` }));

  r.get("/api/candidatos", RH, ({ empresa, query }) => {
    const vaga = query.get("vaga");
    return repo.todos(`SELECT c.*, v.titulo vaga FROM candidatos c JOIN vagas v ON v.id = c.vaga_id WHERE c.empresa_id = ? ${vaga ? "AND c.vaga_id = ?" : ""} ORDER BY c.atualizado_em DESC LIMIT 2000`, empresa.id, ...(vaga ? [vaga] : []));
  });
  r.post("/api/candidatos", RH, async (ctx) => {
    const d = validar(z.object({ vaga_id: t(40), nome: t(150), email: op(160), telefone: op(20), cidade: op(80), linkedin: op(200), mensagem: op(4000) }), await ctx.corpo());
    if (!repo.obter("vagas", ctx.empresa.id, d.vaga_id)) falha(400, "Vaga inválida.");
    return repo.inserir("candidatos", { ...d, empresa_id: ctx.empresa.id });
  });
  r.put("/api/candidatos/:id", RH, async (ctx) => {
    const d = validar(z.object({ etapa: z.enum(ETAPAS).optional(), nota: z.number().int().min(0).max(5).optional().nullable(), observacoes: op(8000) }), await ctx.corpo());
    const c = repo.atualizar("candidatos", ctx.empresa.id, ctx.params.id, d);
    if (!c) falha(404, "Candidato não encontrado.");
    if (d.etapa) auditar(ctx, "candidato_etapa", { nome: c.nome, etapa: d.etapa });
    return c;
  });
  r.delete("/api/candidatos/:id", RH, async ({ empresa, params }) => {
    const c = repo.obter("candidatos", empresa.id, params.id);
    if (c?.curriculo) await nucleo.removerArquivo(c.curriculo);
    return { ok: repo.remover("candidatos", empresa.id, params.id) };
  });

  /* Página pública de vagas */
  r.get("/api/publico/vagas/:empresa", { publico: true }, ({ params }) => {
    const e = repo.obter("empresas", null, params.empresa);
    if (!e) falha(404, "Empresa não encontrada.");
    return { empresa: e.nome_fantasia || e.razao_social, vagas: repo.todos("SELECT id, titulo, descricao, requisitos, salario, modalidade, local, criada_em FROM vagas WHERE empresa_id = ? AND status = 'aberta' ORDER BY criada_em DESC", e.id) };
  });
  r.post("/api/publico/vagas/:empresa/:vaga", { publico: true }, async ({ params, corpo, ip }) => {
    limitar(`candidatura:${ip}`, 10, 3600_000);
    const v = repo.obter("vagas", params.empresa, params.vaga);
    if (!v || v.status !== "aberta") falha(404, "Esta vaga não está mais aberta.");
    const d = validar(
      z.object({
        nome: t(150),
        email: z.string().trim().toLowerCase().email().max(160),
        telefone: t(20, 8),
        cidade: op(80),
        linkedin: op(200),
        mensagem: op(4000),
        consentimento: z.literal(true, { message: "É preciso aceitar o uso dos dados para a seleção (LGPD)." }),
        curriculo: z.object({ nome: t(160), tipo: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"]), base64: z.string().max(7_000_000) }).optional(),
      }),
      await corpo(),
    );
    let curriculo = null;
    if (d.curriculo) curriculo = (await nucleo.salvarArquivo({ empresa_id: v.empresa_id, nome: d.curriculo.nome, mime: d.curriculo.tipo, dados: Buffer.from(d.curriculo.base64, "base64"), enviado_por: d.nome })).id;
    const c = repo.inserir("candidatos", { empresa_id: v.empresa_id, vaga_id: v.id, nome: d.nome, email: d.email, telefone: d.telefone, cidade: d.cidade, linkedin: d.linkedin, mensagem: d.mensagem, curriculo });
    aviso(v.empresa_id, "candidato", { id: c.id, vaga: v.titulo });
    return { ok: true };
  });

  /* ---------- Comunicados ---------- */

  r.get("/api/comunicados", TODOS, ({ empresa }) => {
    const total = repo.um("SELECT COUNT(*) n FROM colaboradores WHERE empresa_id = ? AND status != 'desligado'", empresa.id).n;
    return repo.todos("SELECT c.*, (SELECT COUNT(*) FROM comunicado_leituras l WHERE l.comunicado_id = c.id) leituras FROM comunicados c WHERE c.empresa_id = ? ORDER BY c.fixado DESC, c.criado_em DESC LIMIT 200", empresa.id).map((c) => ({ ...repo.ler("comunicados", c), total }));
  });
  r.post("/api/comunicados", RH, async (ctx) => {
    const d = validar(z.object({ titulo: t(150), texto: t(10000), fixado: z.boolean().optional() }), await ctx.corpo());
    const c = repo.inserir("comunicados", { ...d, empresa_id: ctx.empresa.id, autor: ctx.usuario.nome });
    aviso(ctx.empresa.id, "comunicado", { id: c.id });
    return c;
  });
  r.put("/api/comunicados/:id", RH, async (ctx) => repo.atualizar("comunicados", ctx.empresa.id, ctx.params.id, validar(z.object({ titulo: t(150), texto: t(10000), fixado: z.boolean() }).partial(), await ctx.corpo())) ?? falha(404, "Comunicado não encontrado."));
  r.delete("/api/comunicados/:id", RH, ({ empresa, params }) => ({ ok: repo.remover("comunicados", empresa.id, params.id) }));
  r.get("/api/comunicados/:id/leituras", RH, ({ empresa, params }) => repo.todos("SELECT c.id, c.nome, l.lido_em FROM colaboradores c LEFT JOIN comunicado_leituras l ON l.colaborador_id = c.id AND l.comunicado_id = ? WHERE c.empresa_id = ? AND c.status != 'desligado' ORDER BY l.lido_em IS NULL, c.nome", params.id, empresa.id));
}
