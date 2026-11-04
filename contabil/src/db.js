/* Banco do Nexor Contábil (SQLite nativo do Node).
   Datas com hora: milissegundos (UTC). Datas de calendário: AAAA-MM-DD. Competência: AAAA-MM. Dinheiro: centavos.
   Toda consulta é filtrada pelo escritório (empresa_id); o portal, também pelo cliente. */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY, razao_social TEXT NOT NULL, nome_fantasia TEXT, cnpj TEXT NOT NULL, crc TEXT,
  config TEXT NOT NULL DEFAULT '{}', criada_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE, senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('dono','admin','equipe')), departamento TEXT NOT NULL DEFAULT 'geral',
  ativo INTEGER NOT NULL DEFAULT 1, nexor INTEGER NOT NULL DEFAULT 0, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes (token_hash TEXT PRIMARY KEY, usuario_id TEXT, portal_id TEXT, expira_em INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  razao_social TEXT NOT NULL, nome_fantasia TEXT, cnpj TEXT NOT NULL,
  regime TEXT NOT NULL CHECK (regime IN ('mei','simples','presumido','real')),
  municipio TEXT, uf TEXT, contato_nome TEXT, whatsapp TEXT, email TEXT,
  tem_funcionarios INTEGER NOT NULL DEFAULT 0, contribuinte_icms INTEGER NOT NULL DEFAULT 0, presta_servico INTEGER NOT NULL DEFAULT 1,
  responsavel_id TEXT, honorario_centavos INTEGER NOT NULL DEFAULT 0, cobrar INTEGER NOT NULL DEFAULT 1,
  ativo INTEGER NOT NULL DEFAULT 1, observacoes TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL,
  UNIQUE (empresa_id, cnpj)
);
CREATE TABLE IF NOT EXISTS portal_usuarios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, email TEXT NOT NULL, whatsapp TEXT, senha_hash TEXT, convite_hash TEXT, convite_expira INTEGER,
  ativo INTEGER NOT NULL DEFAULT 1, ultimo_acesso INTEGER, criado_em INTEGER NOT NULL, UNIQUE (empresa_id, email)
);

CREATE TABLE IF NOT EXISTS esperados (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'outro', dia_limite INTEGER NOT NULL DEFAULT 5, departamento TEXT NOT NULL DEFAULT 'contabil',
  ativo INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pendencias (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  esperado_id TEXT REFERENCES esperados(id) ON DELETE SET NULL, competencia TEXT NOT NULL, nome TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'outro',
  prazo TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','recebido','dispensado')),
  documento_id TEXT, recebido_em INTEGER, cobrancas INTEGER NOT NULL DEFAULT 0, ultima_cobranca INTEGER, criado_em INTEGER NOT NULL,
  UNIQUE (esperado_id, competencia)
);
CREATE INDEX IF NOT EXISTS pendencias_cliente ON pendencias (cliente_id, competencia, status);

CREATE TABLE IF NOT EXISTS arquivos (id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL, mime TEXT, tamanho INTEGER NOT NULL, hash TEXT NOT NULL, criado_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS documentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT REFERENCES clientes(id) ON DELETE CASCADE, arquivo_id TEXT NOT NULL,
  nome TEXT NOT NULL, mime TEXT, tamanho INTEGER NOT NULL DEFAULT 0, hash TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('portal','whatsapp','equipe')), enviado_por TEXT,
  competencia TEXT, tipo TEXT, leitura_status TEXT NOT NULL DEFAULT 'pendente' CHECK (leitura_status IN ('pendente','lendo','lido','erro','sem_ia')),
  leitura TEXT, alertas TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','conferido','rejeitado')),
  pendencia_id TEXT, conferido_por TEXT, conferido_em INTEGER, motivo TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS documentos_cliente ON documentos (empresa_id, cliente_id, criado_em);
CREATE INDEX IF NOT EXISTS documentos_status ON documentos (empresa_id, status);
CREATE TABLE IF NOT EXISTS lancamentos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  documento_id TEXT REFERENCES documentos(id) ON DELETE CASCADE, competencia TEXT NOT NULL, data TEXT NOT NULL,
  debito TEXT NOT NULL, credito TEXT NOT NULL, valor_centavos INTEGER NOT NULL, historico TEXT NOT NULL, chave TEXT,
  conciliado_com TEXT, status TEXT NOT NULL DEFAULT 'sugerido' CHECK (status IN ('sugerido','aprovado','exportado')),
  exportado_em INTEGER, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lancamentos_cliente ON lancamentos (empresa_id, cliente_id, competencia, status);
-- Aprende com as correções do contador: quem emite (CNPJ) ou o texto do extrato → contas
CREATE TABLE IF NOT EXISTS aprendizado (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT NOT NULL, chave TEXT NOT NULL, debito TEXT NOT NULL, credito TEXT NOT NULL,
  vezes INTEGER NOT NULL DEFAULT 1, atualizado_em INTEGER NOT NULL, UNIQUE (cliente_id, chave)
);

CREATE TABLE IF NOT EXISTS obrigacoes (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, codigo TEXT NOT NULL, nome TEXT NOT NULL, departamento TEXT NOT NULL DEFAULT 'fiscal',
  regimes TEXT NOT NULL DEFAULT '[]', condicao TEXT, periodicidade TEXT NOT NULL DEFAULT 'mensal' CHECK (periodicidade IN ('mensal','trimestral','anual')),
  regra TEXT NOT NULL DEFAULT '{}', antecedencia INTEGER NOT NULL DEFAULT 3, ativo INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL,
  UNIQUE (empresa_id, codigo)
);
CREATE TABLE IF NOT EXISTS tarefas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  obrigacao_id TEXT REFERENCES obrigacoes(id) ON DELETE SET NULL, competencia TEXT NOT NULL, nome TEXT NOT NULL, departamento TEXT NOT NULL,
  responsavel_id TEXT, prazo_legal TEXT NOT NULL, prazo_interno TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'a_fazer' CHECK (status IN ('a_fazer','em_andamento','concluida','dispensada')),
  concluida_em INTEGER, concluida_por TEXT, minutos INTEGER, observacao TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL,
  UNIQUE (obrigacao_id, cliente_id, competencia)
);
CREATE INDEX IF NOT EXISTS tarefas_prazo ON tarefas (empresa_id, status, prazo_interno);

CREATE TABLE IF NOT EXISTS entregas (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE, arquivo_id TEXT NOT NULL,
  titulo TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'guia' CHECK (tipo IN ('guia','relatorio','holerite','documento')), competencia TEXT,
  vencimento TEXT, valor_centavos INTEGER, status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel','visualizada','paga')),
  tarefa_id TEXT, enviado_por TEXT, visualizado_em INTEGER, pago_em INTEGER, avisado INTEGER NOT NULL DEFAULT 0, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chamados (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  assunto TEXT NOT NULL, departamento TEXT NOT NULL DEFAULT 'geral', origem TEXT NOT NULL DEFAULT 'portal',
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','respondido','resolvido')),
  mensagens TEXT NOT NULL DEFAULT '[]', criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mensagens (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT, wa_id TEXT NOT NULL, direcao TEXT NOT NULL CHECK (direcao IN ('entrada','saida')),
  tipo TEXT NOT NULL, texto TEXT, documento_id TEXT, wamid TEXT UNIQUE, criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mensagens_wa ON mensagens (empresa_id, wa_id, criado_em);
CREATE TABLE IF NOT EXISTS envios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT, canal TEXT NOT NULL, destino TEXT, motivo TEXT NOT NULL,
  status TEXT NOT NULL, erro TEXT, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS uso_ia (empresa_id TEXT NOT NULL, hora INTEGER NOT NULL, leituras INTEGER NOT NULL DEFAULT 0, tokens_entrada INTEGER NOT NULL DEFAULT 0, tokens_saida INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (empresa_id, hora));
CREATE TABLE IF NOT EXISTS nexor_ajustes (empresa_id TEXT PRIMARY KEY, ocultos TEXT NOT NULL DEFAULT '[]', atualizado_por TEXT, atualizado_em INTEGER);
CREATE TABLE IF NOT EXISTS auditoria (id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, autor TEXT, acao TEXT NOT NULL, detalhe TEXT, criado_em INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auditoria_empresa ON auditoria (empresa_id, criado_em);
`;

const JSON_COLS = { empresas: ["config"], documentos: ["leitura", "alertas"], obrigacoes: ["regimes", "regra", "condicao"], chamados: ["mensagens"], auditoria: ["detalhe"] };
const BOOL_COLS = new Set(["ativo", "nexor", "tem_funcionarios", "contribuinte_icms", "presta_servico", "cobrar", "avisado"]);
const lerJson = (v, padrao) => {
  if (v === null || v === undefined || v === "") return padrao;
  try {
    return JSON.parse(v);
  } catch {
    return padrao;
  }
};

export function abrirBanco(caminho, agora = () => Date.now()) {
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
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) colunas[name] = new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name));

  const padraoJson = (tabela, c) => (["alertas", "regimes", "mensagens"].includes(c) ? [] : c === "leitura" || c === "condicao" ? null : {});
  const ler = (tabela, r) => {
    if (!r) return null;
    const o = { ...r };
    for (const c of JSON_COLS[tabela] ?? []) if (c in o) o[c] = lerJson(o[c], padraoJson(tabela, c));
    for (const c of Object.keys(o)) if (BOOL_COLS.has(c) && o[c] !== null) o[c] = Boolean(o[c]);
    return o;
  };
  const gravar = (tabela, campos) => {
    const r = {};
    for (const [k, v] of Object.entries(campos)) {
      if (!colunas[tabela].has(k) || v === undefined) continue;
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
    ler,
    inserir(tabela, campos) {
      const extra = {};
      for (const c of ["criado_em", "criada_em", "atualizado_em"]) if (colunas[tabela].has(c)) extra[c] = agora();
      const r = gravar(tabela, { id: randomUUID(), ...extra, ...campos });
      const ks = Object.keys(r);
      q(`INSERT INTO ${tabela} (${ks.join(",")}) VALUES (${ks.map(() => "?").join(",")})`).run(...Object.values(r));
      return repo.obter(tabela, r.empresa_id ?? null, r.id);
    },
    /** Insere ignorando duplicados (UNIQUE): devolve o registro novo ou null */
    inserirSeNovo(tabela, campos) {
      try {
        return repo.inserir(tabela, campos);
      } catch (e) {
        if (String(e.message).includes("UNIQUE")) return null;
        throw e;
      }
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
    remover: (tabela, empresa_id, id) => q(`DELETE FROM ${tabela} WHERE id = ? AND empresa_id = ?`).run(id, empresa_id).changes > 0,
    /** SELECT com o resto da consulta (WHERE/ORDER) e leitura das colunas JSON */
    lista: (tabela, sql = "", ...p) => q(`SELECT * FROM ${tabela} ${sql}`).all(...p).map((r) => ler(tabela, r)),

    contarUsuarios: () => q("SELECT COUNT(*) n FROM usuarios WHERE nexor = 0").get().n,
    usuarioPorEmail: (email) => q("SELECT * FROM usuarios WHERE email = ? AND ativo = 1 AND nexor = 0").get(String(email).toLowerCase()),
    criarSessao(token_hash, { usuario_id = null, portal_id = null }, dias) {
      q("DELETE FROM sessoes WHERE expira_em < ?").run(agora());
      q("INSERT INTO sessoes (token_hash, usuario_id, portal_id, expira_em) VALUES (?,?,?,?)").run(token_hash, usuario_id, portal_id, agora() + dias * 86400_000);
    },
    sessao: (token_hash) => q("SELECT * FROM sessoes WHERE token_hash = ? AND expira_em > ?").get(token_hash, agora()),
    encerrarSessao: (token_hash) => q("DELETE FROM sessoes WHERE token_hash = ?").run(token_hash),
    ocultos(empresa_id) {
      return lerJson(q("SELECT ocultos FROM nexor_ajustes WHERE empresa_id = ?").get(empresa_id)?.ocultos, []);
    },
    auditar: (empresa_id, autor, acao, detalhe = null) => repo.inserir("auditoria", { empresa_id, autor, acao, detalhe }),
  };
  return repo;
}
