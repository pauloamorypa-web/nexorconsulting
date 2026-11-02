/* Cadastros: empresa, estabelecimentos (com cerca de GPS e quiosque), departamentos, cargos, jornadas,
   feriados, usuários do painel, colaboradores (ficha completa, dependentes, documentos, convite do app). */

import { z } from "zod";
import { gerarHashSenha, gerarToken, sha256 } from "../seguranca.js";
import { feriadosNacionais } from "../ponto/calendario.js";
import { cnpjValido, cpf, centavos, data, email, empresaPublica, horario, op, senha, t, usuarioPublico, validar } from "./validacao.js";
import { falha, lerCorpo } from "./roteador.js";

const ADM = { papeis: ["admin"] };
const RH = { papeis: ["admin", "rh"] };
const TODOS = {};

const endereco = z.object({ tipo_logradouro: op(4), logradouro: op(120), numero: op(10), complemento: op(60), bairro: op(80), cep: op(9), cidade: op(80), cod_municipio: op(7), uf: op(2) }).partial();
const cnpjOpcional = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => !v || cnpjValido(v), "CNPJ inválido")
  .optional()
  .nullable();

const ESQ = {
  estabelecimento: z.object({ nome: t(120), cnpj: cnpjOpcional, endereco: endereco.optional(), lat: z.number().min(-90).max(90).nullable().optional(), lng: z.number().min(-180).max(180).nullable().optional(), raio_m: z.number().int().min(20).max(5000).optional(), exige_qr: z.boolean().optional(), exige_gps: z.boolean().optional(), ativo: z.boolean().optional() }),
  departamento: z.object({ nome: t(120), gestor_id: op(40) }),
  cargo: z.object({ nome: t(120), cbo: z.string().regex(/^\d{6}$/, "CBO tem 6 dígitos").optional().nullable().or(z.literal("")), salario_centavos: centavos.optional().nullable(), descricao: op(4000) }),
  jornada: z.object({
    nome: t(120),
    tipo: z.enum(["semanal", "escala"]),
    dias: z.record(z.string().regex(/^[0-6]$/), z.object({ entrada: horario, saida: horario, intervalo_min: z.number().int().min(0).max(300) }).nullable()).optional(),
    escala: z.object({ trabalha: z.number().int().min(1).max(14), folga: z.number().int().min(1).max(14), entrada: horario, saida: horario, intervalo_min: z.number().int().min(0).max(300), inicio: data }).partial().optional(),
    tolerancia_min: z.number().int().min(0).max(10).optional(),
    banco_horas: z.boolean().optional(),
    horas_semanais: z.number().min(1).max(60).optional(),
  }),
  feriado: z.object({ data, nome: t(120) }),
  usuario: z.object({ nome: t(120), email, senha, papel: z.enum(["admin", "rh", "gestor"]), departamento_id: op(40) }),
  colaborador: z.object({
    matricula: op(20),
    nome: t(150),
    nome_social: op(150),
    cpf,
    pis: op(14),
    rg: op(20),
    nascimento: data.optional().nullable(),
    sexo: z.enum(["M", "F"]).optional().nullable(),
    estado_civil: op(20),
    raca_cor: op(20),
    escolaridade: op(30),
    email: z.string().trim().toLowerCase().email().max(160).optional().nullable().or(z.literal("")),
    telefone: op(20),
    endereco: endereco.optional(),
    banco: z.object({ banco: op(60), agencia: op(10), conta: op(20), pix: op(120) }).partial().optional(),
    admissao: data,
    tipo_contrato: z.enum(["clt", "aprendiz", "estagio", "temporario", "intermitente", "determinado"]).optional(),
    categoria_esocial: z.string().regex(/^\d{3}$/).optional(),
    termino_contrato: data.optional().nullable(),
    cargo_id: op(40),
    departamento_id: op(40),
    estabelecimento_id: op(40),
    jornada_id: op(40),
    salario_centavos: centavos,
    insalubridade_pct: z.union([z.literal(0), z.literal(10), z.literal(20), z.literal(40)]).optional(),
    periculosidade: z.boolean().optional(),
    observacoes: op(4000),
  }),
  dependente: z.object({ nome: t(150), cpf: z.string().transform((v) => v.replace(/\D/g, "")).optional().nullable(), nascimento: data.optional().nullable(), parentesco: z.enum(["filho", "conjuge", "companheiro", "enteado", "pai", "mae", "outro"]), irrf: z.boolean().optional(), salario_familia: z.boolean().optional() }),
};

const CATEGORIA_POR_CONTRATO = { clt: "101", aprendiz: "103", determinado: "105", temporario: "106", intermitente: "111", estagio: "901" };

export function rotasCadastros({ r, repo, nucleo, cfg, agora, exigirColaborador, filtroEquipe, auditar, base }) {
  /* ---------- Empresa ---------- */

  r.get("/api/empresa", TODOS, ({ empresa }) => empresaPublica(empresa));

  r.put("/api/empresa", ADM, async (ctx) => {
    const d = validar(
      z.object({
        razao_social: t(150).optional(),
        nome_fantasia: op(150),
        cnpj: cnpjOpcional,
        endereco: endereco.optional(),
        config: z
          .object({
            ponto: z.object({ exige_biometria: z.boolean(), permitir_quiosque_pin: z.boolean(), lembrar_marcacao: z.boolean() }).partial().optional(),
            esocial: z.object({ ativo: z.boolean(), ambiente: z.union([z.literal(1), z.literal(2)]), class_trib: op(2), cnae: op(7), fpas: op(3), cod_tercs: op(4), rat: op(1), fap: op(6), inicio_validade: op(7) }).partial().optional(),
            registro_inpi: op(17),
            transmissor_cnpj: op(18),
            tabelas: z.record(z.string(), z.unknown()).optional().nullable(),
          })
          .partial()
          .optional(),
      }),
      await ctx.corpo(),
    );
    const atual = ctx.empresa.config;
    const config = d.config
      ? { ...atual, ...d.config, ponto: { ...atual.ponto, ...(d.config.ponto ?? {}) }, esocial: { ...atual.esocial, ...(d.config.esocial ?? {}) }, tabelas: d.config.tabelas === null ? undefined : d.config.tabelas ?? atual.tabelas }
      : undefined;
    const e = repo.atualizar("empresas", null, ctx.empresa.id, { razao_social: d.razao_social, nome_fantasia: d.nome_fantasia, cnpj: d.cnpj || undefined, endereco: d.endereco, config });
    auditar(ctx, "empresa_alterada");
    return empresaPublica({ ...e, config: nucleo.empresa(e.id).config });
  });

  r.get("/api/auditoria", ADM, ({ empresa }) => repo.listar("auditoria", empresa.id, {}, { limite: 300 }));

  /* ---------- Estabelecimentos ---------- */

  const estabPublico = ({ qr_segredo, quiosque_hash, ...e }) => ({ ...e, quiosque_ativo: Boolean(quiosque_hash) });

  r.get("/api/estabelecimentos", TODOS, ({ empresa }) => repo.listar("estabelecimentos", empresa.id, {}, { ordem: "nome ASC" }).map(estabPublico));
  r.post("/api/estabelecimentos", ADM, async (ctx) => {
    const d = validar(ESQ.estabelecimento, await ctx.corpo());
    return estabPublico(repo.inserir("estabelecimentos", { ...d, empresa_id: ctx.empresa.id, qr_segredo: gerarToken(32) }));
  });
  r.put("/api/estabelecimentos/:id", ADM, async (ctx) => {
    const d = validar(ESQ.estabelecimento.partial(), await ctx.corpo());
    const e = repo.atualizar("estabelecimentos", ctx.empresa.id, ctx.params.id, d);
    if (!e) falha(404, "Local não encontrado.");
    return estabPublico(e);
  });
  r.delete("/api/estabelecimentos/:id", ADM, ({ empresa, params }) => {
    if (repo.um("SELECT 1 FROM colaboradores WHERE estabelecimento_id = ? AND status != 'desligado'", params.id)) falha(409, "Há colaboradores neste local. Desative-o em vez de excluir.");
    return { ok: repo.remover("estabelecimentos", empresa.id, params.id) };
  });
  /** Gera o link do quiosque (o anterior para de funcionar) */
  r.post("/api/estabelecimentos/:id/quiosque", ADM, (ctx) => {
    const e = repo.obter("estabelecimentos", ctx.empresa.id, ctx.params.id);
    if (!e) falha(404, "Local não encontrado.");
    const token = gerarToken(24);
    repo.atualizar("estabelecimentos", ctx.empresa.id, e.id, { quiosque_hash: sha256(token) });
    auditar(ctx, "quiosque_gerado", { estabelecimento: e.nome });
    return { link: `${base(ctx.req)}/quiosque/#${e.id}.${token}` };
  });
  r.delete("/api/estabelecimentos/:id/quiosque", ADM, (ctx) => {
    repo.atualizar("estabelecimentos", ctx.empresa.id, ctx.params.id, { quiosque_hash: null });
    return { ok: true };
  });

  /* ---------- Departamentos, cargos, jornadas, feriados ---------- */

  const crud = (caminho, tabela, esquema, ordem = "nome ASC", leitura = TODOS) => {
    r.get(`/api/${caminho}`, leitura, ({ empresa }) => repo.listar(tabela, empresa.id, {}, { ordem }));
    r.post(`/api/${caminho}`, RH, async (ctx) => repo.inserir(tabela, { ...validar(esquema, await ctx.corpo()), empresa_id: ctx.empresa.id }));
    r.put(`/api/${caminho}/:id`, RH, async (ctx) => repo.atualizar(tabela, ctx.empresa.id, ctx.params.id, validar(esquema.partial(), await ctx.corpo())) ?? falha(404, "Não encontrado."));
    r.delete(`/api/${caminho}/:id`, RH, ({ empresa, params }) => {
      const coluna = { departamentos: "departamento_id", cargos: "cargo_id", jornadas: "jornada_id" }[tabela];
      if (coluna && repo.um(`SELECT 1 FROM colaboradores WHERE ${coluna} = ? AND status != 'desligado'`, params.id)) falha(409, "Há colaboradores ativos usando este cadastro.");
      return { ok: repo.remover(tabela, empresa.id, params.id) };
    });
  };
  crud("departamentos", "departamentos", ESQ.departamento);
  crud("cargos", "cargos", ESQ.cargo);
  crud("jornadas", "jornadas", ESQ.jornada);
  crud("feriados", "feriados", ESQ.feriado, "data ASC");

  r.get("/api/feriados/nacionais/:ano", TODOS, ({ params }) => feriadosNacionais(Number(params.ano)));

  /* ---------- Usuários do painel ---------- */

  r.get("/api/usuarios", ADM, ({ empresa }) => repo.listar("usuarios", empresa.id, {}, { ordem: "nome ASC" }).map(usuarioPublico));
  r.post("/api/usuarios", ADM, async (ctx) => {
    const d = validar(ESQ.usuario, await ctx.corpo());
    if (repo.usuarioPorEmail(d.email)) falha(409, "Já existe um usuário com este e-mail.");
    const { senha: s, ...resto } = d;
    auditar(ctx, "usuario_criado", { email: d.email, papel: d.papel });
    return usuarioPublico(repo.inserir("usuarios", { ...resto, empresa_id: ctx.empresa.id, senha_hash: gerarHashSenha(s) }));
  });
  r.put("/api/usuarios/:id", ADM, async (ctx) => {
    const d = validar(z.object({ nome: op(120), papel: z.enum(["admin", "rh", "gestor"]).optional(), departamento_id: op(40), ativo: z.boolean().optional(), senha: senha.optional() }), await ctx.corpo());
    if (ctx.params.id === ctx.usuario.id && (d.papel || d.ativo === false)) falha(400, "Você não pode mudar o próprio perfil.");
    const u = repo.atualizar("usuarios", ctx.empresa.id, ctx.params.id, { ...d, senha: undefined, senha_hash: d.senha ? gerarHashSenha(d.senha) : undefined });
    if (!u) falha(404, "Usuário não encontrado.");
    if (d.ativo === false) repo.rodar("DELETE FROM sessoes WHERE usuario_id = ?", u.id);
    return usuarioPublico(u);
  });

  /* ---------- Colaboradores ---------- */

  r.get("/api/colaboradores", TODOS, ({ empresa, usuario, query }) => {
    const f = filtroEquipe(usuario);
    const status = query.get("status");
    const busca = `%${(query.get("q") ?? "").trim().toLowerCase()}%`;
    const lista = repo.todos(
      `SELECT c.*, cg.nome cargo, d.nome departamento, e.nome estabelecimento,
        (SELECT MAX(momento) FROM marcacoes m WHERE m.colaborador_id = c.id) ultima_marcacao,
        (SELECT COUNT(*) FROM credenciais k WHERE k.colaborador_id = c.id) biometrias,
        (SELECT COUNT(*) FROM sessoes s WHERE s.colaborador_id = c.id AND s.expira_em > ?) app_ativo
       FROM colaboradores c LEFT JOIN cargos cg ON cg.id = c.cargo_id LEFT JOIN departamentos d ON d.id = c.departamento_id LEFT JOIN estabelecimentos e ON e.id = c.estabelecimento_id
       WHERE c.empresa_id = ? ${status ? "AND c.status = ?" : "AND c.status != 'desligado'"} AND (lower(c.nome) LIKE ? OR c.cpf LIKE ? OR c.matricula LIKE ?)${f.sql.replace("departamento_id", "c.departamento_id")}
       ORDER BY c.nome LIMIT 2000`,
      agora(),
      empresa.id,
      ...(status ? [status] : []),
      busca,
      busca.replace(/\D/g, "") ? `%${busca.replace(/\D/g, "")}%` : busca,
      busca,
      ...f.params,
    );
    return lista.map((c) => {
      const { pin_hash, ...resto } = repo.ler("colaboradores", c);
      return { ...resto, tem_pin: Boolean(pin_hash), app_ativo: Boolean(c.app_ativo) };
    });
  });

  const fichaCompleta = (empresa_id, c) => {
    const { pin_hash, ...resto } = c;
    return {
      ...resto,
      tem_pin: Boolean(pin_hash),
      dependentes: repo.listar("dependentes", empresa_id, { colaborador_id: c.id }, { ordem: "nome ASC" }),
      documentos: repo.listar("documentos", empresa_id, { colaborador_id: c.id }),
      beneficios: repo.beneficiosDoColaborador(c.id),
      credenciais: repo.todos("SELECT id, aparelho, criada_em, usada_em FROM credenciais WHERE colaborador_id = ?", c.id),
      app_ativo: Boolean(repo.um("SELECT 1 FROM sessoes WHERE colaborador_id = ? AND expira_em > ?", c.id, agora())),
      saldo_banco: repo.saldoBanco(c.id),
      ferias: repo.listar("ferias", empresa_id, { colaborador_id: c.id }),
      afastamentos: repo.listar("afastamentos", empresa_id, { colaborador_id: c.id }),
      esocial: repo.todos("SELECT id, tipo, descricao, status, recibo, criado_em FROM esocial_eventos WHERE empresa_id = ? AND json_extract(referencia, '$.colaborador_id') = ? ORDER BY criado_em DESC", empresa_id, c.id),
    };
  };

  r.get("/api/colaboradores/:id", TODOS, (ctx) => fichaCompleta(ctx.empresa.id, exigirColaborador(ctx, ctx.params.id)));

  r.post("/api/colaboradores", RH, async (ctx) => {
    const d = validar(ESQ.colaborador, await ctx.corpo());
    if (repo.um("SELECT 1 FROM colaboradores WHERE empresa_id = ? AND cpf = ? AND status != 'desligado'", ctx.empresa.id, d.cpf)) falha(409, "Já existe um colaborador ativo com este CPF.");
    const matricula = d.matricula || String((repo.um("SELECT COUNT(*) n FROM colaboradores WHERE empresa_id = ?", ctx.empresa.id).n ?? 0) + 1).padStart(5, "0");
    if (repo.um("SELECT 1 FROM colaboradores WHERE empresa_id = ? AND matricula = ?", ctx.empresa.id, matricula)) falha(409, "Matrícula já usada.");
    const estab = d.estabelecimento_id ?? repo.um("SELECT id FROM estabelecimentos WHERE empresa_id = ? AND ativo = 1 ORDER BY criado_em LIMIT 1", ctx.empresa.id)?.id;
    const c = repo.inserir("colaboradores", { ...d, matricula, empresa_id: ctx.empresa.id, estabelecimento_id: estab, categoria_esocial: d.categoria_esocial ?? CATEGORIA_POR_CONTRATO[d.tipo_contrato ?? "clt"] });
    const evento = c.categoria_esocial !== "901" ? nucleo.esocial.admissao(ctx.empresa, c) : null;
    auditar(ctx, "colaborador_admitido", { nome: c.nome });
    return { ...fichaCompleta(ctx.empresa.id, c), evento_esocial: evento ? { id: evento.id, tipo: evento.tipo } : null };
  });

  r.put("/api/colaboradores/:id", RH, async (ctx) => {
    const antes = exigirColaborador(ctx, ctx.params.id);
    if (antes.status === "desligado") falha(409, "Colaborador desligado não pode ser alterado.");
    const d = validar(ESQ.colaborador.partial(), await ctx.corpo());
    if (d.tipo_contrato && !d.categoria_esocial) d.categoria_esocial = CATEGORIA_POR_CONTRATO[d.tipo_contrato];
    const depois = repo.atualizar("colaboradores", ctx.empresa.id, antes.id, d);
    const eventos = antes.categoria_esocial !== "901" ? nucleo.esocial.alteracao(ctx.empresa, antes, depois) : [];
    auditar(ctx, "colaborador_alterado", { nome: depois.nome, campos: Object.keys(d) });
    return { ...fichaCompleta(ctx.empresa.id, depois), eventos_esocial: eventos.map((e) => ({ id: e.id, tipo: e.tipo })) };
  });

  /** Benefícios do colaborador */
  r.put("/api/colaboradores/:id/beneficios", RH, async (ctx) => {
    const c = exigirColaborador(ctx, ctx.params.id);
    const d = validar(z.object({ itens: z.array(z.object({ beneficio_id: t(40), valor_centavos: centavos.optional().nullable() })).max(50) }), await ctx.corpo());
    for (const i of d.itens) if (!repo.obter("beneficios", ctx.empresa.id, i.beneficio_id)) falha(400, "Benefício inválido.");
    repo.definirBeneficios(c.id, d.itens);
    return repo.beneficiosDoColaborador(c.id);
  });

  /* Dependentes */
  r.post("/api/colaboradores/:id/dependentes", RH, async (ctx) => {
    const c = exigirColaborador(ctx, ctx.params.id);
    return repo.inserir("dependentes", { ...validar(ESQ.dependente, await ctx.corpo()), colaborador_id: c.id, empresa_id: ctx.empresa.id });
  });
  r.delete("/api/dependentes/:id", RH, ({ empresa, params }) => ({ ok: repo.remover("dependentes", empresa.id, params.id) }));

  /* Convite do aplicativo: código de 6 dígitos válido por 7 dias */
  r.post("/api/colaboradores/:id/convite", RH, (ctx) => {
    const c = exigirColaborador(ctx, ctx.params.id);
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    repo.rodar("DELETE FROM convites_app WHERE colaborador_id = ?", c.id);
    repo.rodar("INSERT INTO convites_app (codigo_hash, colaborador_id, expira_em) VALUES (?,?,?)", sha256(`${c.id}:${codigo}`), c.id, agora() + 7 * 86400_000);
    auditar(ctx, "convite_app", { nome: c.nome });
    const link = `${base(ctx.req)}/app/`;
    return { codigo, link, mensagem: `Olá, ${c.nome.split(" ")[0]}! Baixe o app de ponto da ${ctx.empresa.nome_fantasia || ctx.empresa.razao_social}: abra ${link} no celular, toque em "Adicionar à tela inicial" e entre com seu CPF e o código ${codigo}. O código vale por 7 dias.` };
  });
  /** Desconecta o celular do colaborador e apaga as biometrias (troca de aparelho) */
  r.delete("/api/colaboradores/:id/app", RH, (ctx) => {
    const c = exigirColaborador(ctx, ctx.params.id);
    repo.rodar("DELETE FROM sessoes WHERE colaborador_id = ?", c.id);
    repo.rodar("DELETE FROM credenciais WHERE colaborador_id = ?", c.id);
    auditar(ctx, "app_desconectado", { nome: c.nome });
    return { ok: true };
  });
  r.delete("/api/colaboradores/:id/pin", RH, (ctx) => {
    const c = exigirColaborador(ctx, ctx.params.id);
    repo.atualizar("colaboradores", ctx.empresa.id, c.id, { pin_hash: null });
    return { ok: true };
  });

  /* ---------- Arquivos e documentos ---------- */

  r.post("/api/arquivos", RH, async (ctx) => {
    const dados = await lerCorpo(ctx.req, cfg.limites.tamanhoArquivo);
    if (!dados.length) falha(400, "Arquivo vazio.");
    const a = await nucleo.salvarArquivo({ empresa_id: ctx.empresa.id, nome: decodeURIComponent(ctx.req.headers["x-nome"] ?? "arquivo"), mime: ctx.req.headers["content-type"], dados, enviado_por: ctx.usuario.nome, colaborador_id: ctx.query.get("colaborador") || null });
    return { id: a.id, nome: a.nome, tamanho: a.tamanho };
  });
  r.get("/api/arquivos/:id", TODOS, async (ctx) => {
    const a = await nucleo.lerArquivo(ctx.params.id);
    if (!a || a.empresa_id !== ctx.empresa.id) falha(404, "Arquivo não encontrado.");
    if (a.colaborador_id) exigirColaborador(ctx, a.colaborador_id);
    enviarArquivo(ctx.res, a);
  });

  r.post("/api/colaboradores/:id/documentos", RH, async (ctx) => {
    const c = exigirColaborador(ctx, ctx.params.id);
    const d = validar(z.object({ tipo: t(40), nome: t(160), arquivo: t(40), validade: data.optional().nullable(), compartilhar: z.boolean().optional() }), await ctx.corpo());
    const a = repo.obter("arquivos", ctx.empresa.id, d.arquivo);
    if (!a) falha(400, "Envie o arquivo antes.");
    repo.atualizar("arquivos", ctx.empresa.id, a.id, { colaborador_id: c.id, publico: Boolean(d.compartilhar) });
    return repo.inserir("documentos", { empresa_id: ctx.empresa.id, colaborador_id: c.id, tipo: d.tipo, nome: d.nome, arquivo: a.id, mime: a.mime, validade: d.validade, enviado_por: ctx.usuario.nome });
  });
  r.delete("/api/documentos/:id", RH, async ({ empresa, params }) => {
    const doc = repo.obter("documentos", empresa.id, params.id);
    if (!doc) falha(404, "Documento não encontrado.");
    repo.remover("documentos", empresa.id, doc.id);
    await nucleo.removerArquivo(doc.arquivo);
    return { ok: true };
  });
}

export function enviarArquivo(res, a) {
  const seguro = /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(a.mime ?? "");
  res.writeHead(200, {
    "Content-Type": seguro ? a.mime : "application/octet-stream",
    "Content-Length": a.dados.length,
    "Content-Disposition": `${seguro ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
  });
  res.end(a.dados);
}
