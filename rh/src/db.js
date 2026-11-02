/* Banco de dados do Nexor RH (SQLite nativo do Node).
   Datas com hora: milissegundos desde 1970 (UTC). Datas de calendário: texto AAAA-MM-DD.
   Valores em dinheiro: centavos (inteiro). Toda consulta é filtrada pela empresa. */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY, razao_social TEXT NOT NULL, nome_fantasia TEXT, cnpj TEXT NOT NULL,
  endereco TEXT NOT NULL DEFAULT '{}', config TEXT NOT NULL DEFAULT '{}', nsr INTEGER NOT NULL DEFAULT 0,
  ultimo_hash TEXT, criada_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE, senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('admin','rh','gestor')), departamento_id TEXT,
  ativo INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes (token_hash TEXT PRIMARY KEY, usuario_id TEXT, colaborador_id TEXT, expira_em INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS estabelecimentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, cnpj TEXT, endereco TEXT NOT NULL DEFAULT '{}', lat REAL, lng REAL, raio_m INTEGER NOT NULL DEFAULT 150,
  qr_segredo TEXT NOT NULL, quiosque_hash TEXT, exige_qr INTEGER NOT NULL DEFAULT 0, exige_gps INTEGER NOT NULL DEFAULT 1,
  ativo INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS departamentos (id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL, gestor_id TEXT, criado_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cargos (id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL, cbo TEXT, salario_centavos INTEGER, descricao TEXT, criado_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS jornadas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'semanal',
  dias TEXT NOT NULL DEFAULT '{}', escala TEXT NOT NULL DEFAULT '{}', tolerancia_min INTEGER NOT NULL DEFAULT 5,
  banco_horas INTEGER NOT NULL DEFAULT 0, horas_semanais REAL NOT NULL DEFAULT 44, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS colaboradores (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  matricula TEXT NOT NULL, nome TEXT NOT NULL, nome_social TEXT, cpf TEXT NOT NULL, pis TEXT, rg TEXT,
  nascimento TEXT, sexo TEXT, estado_civil TEXT, raca_cor TEXT, escolaridade TEXT, nacionalidade TEXT DEFAULT 'brasileira',
  email TEXT, telefone TEXT, endereco TEXT NOT NULL DEFAULT '{}', banco TEXT NOT NULL DEFAULT '{}',
  admissao TEXT NOT NULL, tipo_contrato TEXT NOT NULL DEFAULT 'clt', categoria_esocial TEXT NOT NULL DEFAULT '101',
  cargo_id TEXT, departamento_id TEXT, estabelecimento_id TEXT, jornada_id TEXT, gestor_id TEXT,
  salario_centavos INTEGER NOT NULL DEFAULT 0, insalubridade_pct REAL NOT NULL DEFAULT 0, periculosidade INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','afastado','ferias','desligado')),
  desligamento TEXT, foto TEXT, observacoes TEXT, pin_hash TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL,
  UNIQUE (empresa_id, cpf), UNIQUE (empresa_id, matricula)
);
CREATE TABLE IF NOT EXISTS dependentes (
  id TEXT PRIMARY KEY, colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE, empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL, cpf TEXT, nascimento TEXT, parentesco TEXT NOT NULL, irrf INTEGER NOT NULL DEFAULT 1, salario_familia INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS documentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT REFERENCES colaboradores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, nome TEXT NOT NULL, arquivo TEXT NOT NULL, mime TEXT, validade TEXT, enviado_por TEXT, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS convites_app (codigo_hash TEXT PRIMARY KEY, colaborador_id TEXT NOT NULL, expira_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS credenciais (
  id TEXT PRIMARY KEY, colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  chave TEXT NOT NULL, alg INTEGER NOT NULL, contador INTEGER NOT NULL DEFAULT 0, aparelho TEXT, criada_em INTEGER NOT NULL, usada_em INTEGER
);
CREATE TABLE IF NOT EXISTS marcacoes (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  nsr INTEGER NOT NULL, momento INTEGER NOT NULL, origem TEXT NOT NULL, coletor TEXT NOT NULL DEFAULT '01',
  lat REAL, lng REAL, precisao REAL, distancia_m REAL, estabelecimento_id TEXT,
  biometria INTEGER NOT NULL DEFAULT 0, qr INTEGER NOT NULL DEFAULT 0, online INTEGER NOT NULL DEFAULT 1,
  ip TEXT, aparelho TEXT, hash TEXT NOT NULL, hash_anterior TEXT, status TEXT NOT NULL DEFAULT 'valida',
  motivo TEXT, criado_em INTEGER NOT NULL, UNIQUE (empresa_id, nsr)
);
CREATE INDEX IF NOT EXISTS marcacoes_colab ON marcacoes (colaborador_id, momento);
CREATE TABLE IF NOT EXISTS ajustes (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data TEXT NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('inclusao','desconsiderar','abono')), horario TEXT, marcacao_id TEXT,
  minutos INTEGER, motivo TEXT NOT NULL, anexo TEXT, status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','recusado')),
  resposta TEXT, analisado_por TEXT, analisado_em INTEGER, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS banco_horas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data TEXT NOT NULL, minutos INTEGER NOT NULL, origem TEXT NOT NULL, descricao TEXT, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fechamentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, competencia TEXT NOT NULL, fechado_por TEXT, fechado_em INTEGER NOT NULL, UNIQUE (empresa_id, competencia)
);
CREATE TABLE IF NOT EXISTS espelho_assinaturas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL, competencia TEXT NOT NULL,
  hash TEXT NOT NULL, ip TEXT, assinado_em INTEGER NOT NULL, UNIQUE (colaborador_id, competencia)
);
CREATE TABLE IF NOT EXISTS feriados (id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, data TEXT NOT NULL, nome TEXT NOT NULL, UNIQUE (empresa_id, data));
CREATE TABLE IF NOT EXISTS ferias (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  aquisitivo_inicio TEXT NOT NULL, aquisitivo_fim TEXT NOT NULL, inicio TEXT NOT NULL, dias INTEGER NOT NULL, abono_dias INTEGER NOT NULL DEFAULT 0,
  adiantar_13 INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'solicitada' CHECK (status IN ('solicitada','aprovada','recusada','cancelada')),
  observacao TEXT, valores TEXT, solicitado_por TEXT, analisado_por TEXT, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS afastamentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL, inicio TEXT NOT NULL, fim TEXT, cid TEXT, medico TEXT, observacao TEXT, anexo TEXT,
  status TEXT NOT NULL DEFAULT 'aprovado' CHECK (status IN ('pendente','aprovado','recusado')), enviado_por TEXT, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS beneficios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL, tipo TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL DEFAULT 0, desconto_tipo TEXT NOT NULL DEFAULT 'nenhum', desconto_valor REAL NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS colaborador_beneficios (
  colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE, beneficio_id TEXT NOT NULL REFERENCES beneficios(id) ON DELETE CASCADE,
  valor_centavos INTEGER, PRIMARY KEY (colaborador_id, beneficio_id)
);
CREATE TABLE IF NOT EXISTS lancamentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL, rubrica TEXT NOT NULL, descricao TEXT NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('provento','desconto')),
  valor_centavos INTEGER NOT NULL, incide_inss INTEGER NOT NULL DEFAULT 1, incide_irrf INTEGER NOT NULL DEFAULT 1, incide_fgts INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS folhas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, competencia TEXT NOT NULL, tipo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'calculada' CHECK (status IN ('calculada','fechada')), totais TEXT NOT NULL DEFAULT '{}',
  calculada_em INTEGER NOT NULL, fechada_em INTEGER, UNIQUE (empresa_id, competencia, tipo)
);
CREATE TABLE IF NOT EXISTS folha_itens (
  id TEXT PRIMARY KEY, folha_id TEXT NOT NULL REFERENCES folhas(id) ON DELETE CASCADE, empresa_id TEXT NOT NULL, colaborador_id TEXT NOT NULL,
  rubricas TEXT NOT NULL, bruto INTEGER NOT NULL, descontos INTEGER NOT NULL, liquido INTEGER NOT NULL,
  base_inss INTEGER NOT NULL, inss INTEGER NOT NULL, base_irrf INTEGER NOT NULL, irrf INTEGER NOT NULL, base_fgts INTEGER NOT NULL, fgts INTEGER NOT NULL,
  visualizado_em INTEGER
);
CREATE TABLE IF NOT EXISTS vagas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, titulo TEXT NOT NULL, departamento_id TEXT, cargo_id TEXT, descricao TEXT, requisitos TEXT,
  salario TEXT, modalidade TEXT, local TEXT, status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','pausada','fechada')), criada_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS candidatos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, vaga_id TEXT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, email TEXT, telefone TEXT, cidade TEXT, linkedin TEXT, curriculo TEXT, mensagem TEXT,
  etapa TEXT NOT NULL DEFAULT 'triagem', nota INTEGER, observacoes TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS comunicados (id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, titulo TEXT NOT NULL, texto TEXT NOT NULL, fixado INTEGER NOT NULL DEFAULT 0, autor TEXT, criado_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS comunicado_leituras (comunicado_id TEXT NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE, colaborador_id TEXT NOT NULL, lido_em INTEGER NOT NULL, PRIMARY KEY (comunicado_id, colaborador_id));
CREATE TABLE IF NOT EXISTS esocial_eventos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, tipo TEXT NOT NULL, descricao TEXT, referencia TEXT, id_evento TEXT NOT NULL UNIQUE,
  xml TEXT NOT NULL, xml_assinado TEXT, status TEXT NOT NULL DEFAULT 'gerado' CHECK (status IN ('gerado','assinado','enviado','processado','erro')),
  lote_id TEXT, recibo TEXT, ocorrencias TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS esocial_lotes (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, ambiente INTEGER NOT NULL, protocolo TEXT, status TEXT NOT NULL,
  resposta TEXT, enviado_em INTEGER NOT NULL, consultado_em INTEGER
);
CREATE TABLE IF NOT EXISTS arquivos (id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL, mime TEXT, tamanho INTEGER NOT NULL, enviado_por TEXT, colaborador_id TEXT, publico INTEGER NOT NULL DEFAULT 0, criado_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auditoria (id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, autor TEXT, acao TEXT NOT NULL, detalhe TEXT, criado_em INTEGER NOT NULL);
`;

/* Colunas JSON de cada tabela (lidas e gravadas como objeto) */
const JSON_COLS = {
  empresas: ["endereco", "config"],
  estabelecimentos: ["endereco"],
  jornadas: ["dias", "escala"],
  colaboradores: ["endereco", "banco", "desligamento"],
  ferias: ["valores"],
  folhas: ["totais"],
  folha_itens: ["rubricas"],
  esocial_eventos: ["ocorrencias", "referencia"],
  esocial_lotes: ["resposta"],
  auditoria: ["detalhe"],
};
const BOOL_COLS = new Set(["ativo", "exige_qr", "exige_gps", "banco_horas", "periculosidade", "irrf", "salario_familia", "biometria", "qr", "online", "adiantar_13", "incide_inss", "incide_irrf", "incide_fgts", "fixado", "publico"]);

const lerJson = (v, padrao) => {
  if (v === null || v === undefined || v === "") return padrao;
  try {
    return JSON.parse(v);
  } catch {
    return padrao;
  }
};

export function abrirBanco(caminho) {
  if (caminho !== ":memory:") mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(ESQUEMA);

  const cache = new Map();
  const q = (sql) => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = db.prepare(sql)));
    return s;
  };
  const colunas = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
    colunas[name] = new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name));
  }
  const agora = () => Date.now();

  const ler = (tabela, r) => {
    if (!r) return r ?? null;
    const o = { ...r };
    for (const c of JSON_COLS[tabela] ?? []) if (c in o) o[c] = lerJson(o[c], c === "rubricas" || c === "ocorrencias" ? [] : c === "desligamento" ? null : {});
    for (const c of Object.keys(o)) if (BOOL_COLS.has(c) && o[c] !== null && (c !== "irrf" || tabela === "dependentes")) o[c] = Boolean(o[c]);
    return o;
  };
  const gravar = (tabela, campos) => {
    const cols = colunas[tabela];
    const r = {};
    for (const [k, v] of Object.entries(campos)) {
      if (!cols.has(k) || v === undefined) continue;
      r[k] = (JSON_COLS[tabela] ?? []).includes(k) && v !== null ? JSON.stringify(v) : typeof v === "boolean" ? (v ? 1 : 0) : v;
    }
    return r;
  };

  const repo = {
    db,
    fechar: () => db.close(),
    transacao(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    um: (sql, ...p) => q(sql).get(...p),
    todos: (sql, ...p) => q(sql).all(...p),
    rodar: (sql, ...p) => q(sql).run(...p),

    /* ---------- CRUD genérico (colunas validadas pelo esquema) ---------- */
    inserir(tabela, campos) {
      const r = gravar(tabela, { id: randomUUID(), ...(colunas[tabela].has("criado_em") ? { criado_em: agora() } : {}), ...(colunas[tabela].has("criada_em") ? { criada_em: agora() } : {}), ...(colunas[tabela].has("atualizado_em") ? { atualizado_em: agora() } : {}), ...campos });
      const ks = Object.keys(r);
      q(`INSERT INTO ${tabela} (${ks.join(",")}) VALUES (${ks.map(() => "?").join(",")})`).run(...Object.values(r));
      return r.id ? repo.obter(tabela, r.empresa_id ?? null, r.id) : null;
    },
    obter(tabela, empresa_id, id) {
      const comEmpresa = empresa_id && colunas[tabela].has("empresa_id");
      return ler(tabela, comEmpresa ? q(`SELECT * FROM ${tabela} WHERE id = ? AND empresa_id = ?`).get(id, empresa_id) : q(`SELECT * FROM ${tabela} WHERE id = ?`).get(id));
    },
    atualizar(tabela, empresa_id, id, campos) {
      const r = gravar(tabela, { ...campos, ...(colunas[tabela].has("atualizado_em") ? { atualizado_em: agora() } : {}) });
      delete r.id;
      delete r.empresa_id;
      const ks = Object.keys(r);
      if (ks.length) {
        const where = empresa_id && colunas[tabela].has("empresa_id") ? "id = ? AND empresa_id = ?" : "id = ?";
        q(`UPDATE ${tabela} SET ${ks.map((k) => `${k} = ?`).join(", ")} WHERE ${where}`).run(...Object.values(r), id, ...(where.includes("empresa_id") ? [empresa_id] : []));
      }
      return repo.obter(tabela, empresa_id, id);
    },
    remover(tabela, empresa_id, id) {
      return q(`DELETE FROM ${tabela} WHERE id = ? AND empresa_id = ?`).run(id, empresa_id).changes > 0;
    },
    /** Lista com filtros de igualdade, ordenação validada */
    listar(tabela, empresa_id, filtros = {}, { ordem = "criado_em DESC", limite = 1000 } = {}) {
      const cols = colunas[tabela];
      const cond = ["empresa_id = ?"];
      const p = [empresa_id];
      for (const [k, v] of Object.entries(filtros)) {
        if (!cols.has(k) || v === undefined || v === null || v === "") continue;
        cond.push(`${k} = ?`);
        p.push(typeof v === "boolean" ? (v ? 1 : 0) : v);
      }
      const [campoOrdem, dir] = ordem.split(" ");
      const ord = cols.has(campoOrdem) ? `${campoOrdem} ${dir === "ASC" ? "ASC" : "DESC"}` : "rowid DESC";
      return q(`SELECT * FROM ${tabela} WHERE ${cond.join(" AND ")} ORDER BY ${ord} LIMIT ?`).all(...p, limite).map((r) => ler(tabela, r));
    },
    ler,

    /* ---------- Específicos ---------- */
    contarUsuarios: () => q("SELECT COUNT(*) n FROM usuarios").get().n,
    usuarioPorEmail: (email) => q("SELECT * FROM usuarios WHERE email = ? AND ativo = 1").get(String(email).toLowerCase()),
    colaboradorPorCpf: (cpf) => ler("colaboradores", q("SELECT * FROM colaboradores WHERE cpf = ? AND status != 'desligado' ORDER BY criado_em DESC LIMIT 1").get(cpf)),

    criarSessao(token_hash, { usuario_id = null, colaborador_id = null }, dias) {
      q("DELETE FROM sessoes WHERE expira_em < ?").run(agora());
      q("INSERT INTO sessoes (token_hash, usuario_id, colaborador_id, expira_em) VALUES (?,?,?,?)").run(token_hash, usuario_id, colaborador_id, agora() + dias * 86400_000);
    },
    sessao: (token_hash) => q("SELECT * FROM sessoes WHERE token_hash = ? AND expira_em > ?").get(token_hash, agora()),
    renovarSessao: (token_hash, dias) => q("UPDATE sessoes SET expira_em = ? WHERE token_hash = ?").run(agora() + dias * 86400_000, token_hash),
    encerrarSessao: (token_hash) => q("DELETE FROM sessoes WHERE token_hash = ?").run(token_hash),

    /** Próximo NSR (número sequencial de registro) da empresa e o hash anterior, numa transação */
    proximoNsr(empresa_id) {
      q("UPDATE empresas SET nsr = nsr + 1 WHERE id = ?").run(empresa_id);
      return q("SELECT nsr, ultimo_hash FROM empresas WHERE id = ?").get(empresa_id);
    },
    gravarUltimoHash: (empresa_id, hash) => q("UPDATE empresas SET ultimo_hash = ? WHERE id = ?").run(hash, empresa_id),

    marcacoesEntre: (colaborador_id, de, ate) =>
      q("SELECT * FROM marcacoes WHERE colaborador_id = ? AND momento >= ? AND momento < ? ORDER BY momento").all(colaborador_id, de, ate).map((r) => ler("marcacoes", r)),
    marcacoesEmpresaEntre: (empresa_id, de, ate) =>
      q("SELECT m.*, c.nome colaborador_nome, c.cpf colaborador_cpf FROM marcacoes m JOIN colaboradores c ON c.id = m.colaborador_id WHERE m.empresa_id = ? AND m.momento >= ? AND m.momento < ? ORDER BY m.nsr").all(empresa_id, de, ate).map((r) => ler("marcacoes", r)),
    ultimasMarcacoes: (empresa_id, limite = 50) =>
      q("SELECT m.*, c.nome colaborador_nome FROM marcacoes m JOIN colaboradores c ON c.id = m.colaborador_id WHERE m.empresa_id = ? ORDER BY m.momento DESC LIMIT ?").all(empresa_id, limite).map((r) => ler("marcacoes", r)),
    saldoBanco: (colaborador_id) => q("SELECT COALESCE(SUM(minutos),0) s FROM banco_horas WHERE colaborador_id = ?").get(colaborador_id).s,
    beneficiosDoColaborador: (colaborador_id) =>
      q("SELECT b.*, cb.valor_centavos valor_individual FROM colaborador_beneficios cb JOIN beneficios b ON b.id = cb.beneficio_id WHERE cb.colaborador_id = ? AND b.ativo = 1").all(colaborador_id).map((r) => ler("beneficios", r)),
    definirBeneficios(colaborador_id, itens) {
      repo.transacao(() => {
        q("DELETE FROM colaborador_beneficios WHERE colaborador_id = ?").run(colaborador_id);
        for (const i of itens) q("INSERT INTO colaborador_beneficios (colaborador_id, beneficio_id, valor_centavos) VALUES (?,?,?)").run(colaborador_id, i.beneficio_id, i.valor_centavos ?? null);
      });
    },
    afastamentosNoPeriodo: (colaborador_id, de, ate) =>
      q("SELECT * FROM afastamentos WHERE colaborador_id = ? AND status = 'aprovado' AND inicio <= ? AND (fim IS NULL OR fim >= ?)").all(colaborador_id, ate, de),
    feriasNoPeriodo: (colaborador_id, de, ate) =>
      q("SELECT * FROM ferias WHERE colaborador_id = ? AND status = 'aprovada' AND inicio <= ? AND date(inicio, '+' || (dias - 1) || ' days') >= ?").all(colaborador_id, ate, de).map((r) => ler("ferias", r)),
    auditar: (empresa_id, autor, acao, detalhe) => repo.inserir("auditoria", { empresa_id, autor, acao, detalhe }),
  };
  return repo;
}
