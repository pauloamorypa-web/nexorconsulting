/* Integração com os outros sistemas Nexor da mesma empresa (ecossistema): Nexor Agente, Atende IA, Nexor One.
   O administrador cria uma chave no painel (Configurações → Integrações). Ela é mostrada uma única vez,
   guardada só como hash, tem permissão de leitura e pode ser revogada a qualquer momento.
   Uso: Authorization: Bearer nxr_...  em  /api/integracao/v1/... */

import { z } from "zod";
import { gerarToken, sha256 } from "../seguranca.js";
import { dataLocal, somarDias } from "../ponto/calendario.js";
import { falha } from "./roteador.js";
import { t, validar } from "./validacao.js";

const ADM = { papeis: ["admin"] };
const PUBLICO = { publico: true };

export function rotasIntegracao(deps) {
  const { r, repo, agora, auditar } = deps;

  /* ---------- Gestão das chaves (painel, só administrador) ---------- */
  const publica = (i) => ({ id: i.id, nome: i.nome, prefixo: i.prefixo, escopos: i.escopos, ativo: Boolean(i.ativo), criado_em: i.criado_em, usado_em: i.usado_em, criado_por: i.criado_por });
  r.get("/api/integracoes", ADM, ({ empresa }) => repo.listar("integracoes", empresa.id, {}, { ordem: "criado_em DESC" }).map(publica));
  r.post("/api/integracoes", ADM, async (ctx) => {
    const d = validar(z.object({ nome: t(80) }), await ctx.corpo());
    if (repo.listar("integracoes", ctx.empresa.id, { ativo: 1 }).length >= 20) falha(400, "Limite de 20 chaves ativas. Revogue alguma antes.");
    const token = `nxr_${gerarToken(32)}`;
    const i = repo.inserir("integracoes", { empresa_id: ctx.empresa.id, nome: d.nome, token_hash: sha256(token), prefixo: token.slice(0, 10), escopos: ["leitura"], criado_por: ctx.usuario.nome, criado_em: agora() });
    auditar(ctx, "integracao_criada", { nome: d.nome, prefixo: i.prefixo });
    return { ...publica(i), token }; // a chave completa só aparece agora
  });
  r.delete("/api/integracoes/:id", ADM, (ctx) => {
    const i = repo.obter("integracoes", ctx.empresa.id, ctx.params.id);
    if (!i) falha(404, "Chave não encontrada.");
    repo.atualizar("integracoes", ctx.empresa.id, i.id, { ativo: 0 });
    auditar(ctx, "integracao_revogada", { nome: i.nome, prefixo: i.prefixo });
    return { ok: true };
  });

  /* ---------- API para os outros sistemas ---------- */
  const autenticar = (req) => {
    const token = String(req.headers.authorization ?? "").match(/^Bearer\s+(nxr_[\w-]{20,200})$/)?.[1];
    if (!token) falha(401, "Chave de integração ausente.");
    const i = repo.um("SELECT * FROM integracoes WHERE token_hash = ? AND ativo = 1", sha256(token));
    if (!i) falha(401, "Chave de integração inválida ou revogada.");
    if (!i.usado_em || agora() - i.usado_em > 60_000) repo.rodar("UPDATE integracoes SET usado_em = ? WHERE id = ?", agora(), i.id);
    const empresa = repo.um("SELECT * FROM empresas WHERE id = ?", i.empresa_id);
    if (!empresa) falha(401, "Empresa não encontrada.");
    return repo.ler("empresas", empresa);
  };
  const rota = (caminho, fn) => r.get(`/api/integracao/v1${caminho}`, PUBLICO, (ctx) => fn({ ...ctx, empresa: autenticar(ctx.req) }));

  rota("/empresa", ({ empresa }) => ({ id: empresa.id, razao_social: empresa.razao_social, nome_fantasia: empresa.nome_fantasia, cnpj: empresa.cnpj }));

  // Dados mínimos (LGPD): sem CPF, salário, endereço ou documentos
  rota("/colaboradores", ({ empresa }) => {
    const cargos = new Map(repo.listar("cargos", empresa.id).map((c) => [c.id, c.nome]));
    const deps2 = new Map(repo.listar("departamentos", empresa.id).map((d) => [d.id, d.nome]));
    return repo
      .todos("SELECT * FROM colaboradores WHERE empresa_id = ? AND status != 'desligado' ORDER BY nome", empresa.id)
      .map((c) => repo.ler("colaboradores", c))
      .map((c) => ({ id: c.id, nome: c.nome, matricula: c.matricula, cargo: cargos.get(c.cargo_id) ?? null, departamento: deps2.get(c.departamento_id) ?? null, status: c.status, admissao: c.admissao }));
  });

  rota("/presenca", ({ empresa }) => {
    const p = deps.presencaHoje(empresa, null);
    return { data: p.data, feriado: p.feriado, resumo: p.resumo, lista: p.lista.map((x) => ({ id: x.id, nome: x.nome, matricula: x.matricula, situacao: x.situacao, marcacoes: x.marcacoes.map((m) => m.hora) })) };
  });

  rota("/ausencias", ({ empresa }) => {
    const hoje = dataLocal(agora());
    const ate = somarDias(hoje, 30);
    const nomes = new Map(repo.todos("SELECT id, nome FROM colaboradores WHERE empresa_id = ?", empresa.id).map((c) => [c.id, c.nome]));
    const ferias = repo
      .todos("SELECT colaborador_id, inicio, dias FROM ferias WHERE empresa_id = ? AND status = 'aprovada' AND inicio <= ? ORDER BY inicio", empresa.id, ate)
      .map((f) => ({ ...f, fim: somarDias(f.inicio, f.dias - 1) }))
      .filter((f) => f.fim >= hoje)
      .map((f) => ({ tipo: "ferias", colaborador: nomes.get(f.colaborador_id), inicio: f.inicio, fim: f.fim }));
    const afast = repo
      .todos("SELECT colaborador_id, inicio, fim FROM afastamentos WHERE empresa_id = ? AND status = 'aprovado' AND inicio <= ? AND (fim IS NULL OR fim >= ?) ORDER BY inicio", empresa.id, ate, hoje)
      .map((a) => ({ tipo: "afastamento", colaborador: nomes.get(a.colaborador_id), inicio: a.inicio, fim: a.fim }));
    return { de: hoje, ate, ausencias: [...ferias, ...afast] };
  });
}
