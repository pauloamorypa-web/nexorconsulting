/* Banco do Nexor Elo (SQLite nativo do Node). Multi-inquilino: cada fornecedor e cada instalador é uma "conta".
   Instantes: milissegundos (UTC). Dia: AAAA-MM-DD (horário de Brasília). Dinheiro: centavos inteiros.
   Percentuais guardados em pontos-base (250 = 2,5%) quando aceitam fração. */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS plataforma (chave TEXT PRIMARY KEY, valor TEXT);
CREATE TABLE IF NOT EXISTS contas (
  id TEXT PRIMARY KEY, tipo TEXT NOT NULL CHECK (tipo IN ('fornecedor','instalador','nexor')),
  cnpj TEXT, razao_social TEXT NOT NULL, nome_fantasia TEXT, cnaes TEXT NOT NULL DEFAULT '[]', cidade TEXT, uf TEXT,
  telefone TEXT, email TEXT, status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('pendente','ativo','recusado','suspenso')),
  config TEXT NOT NULL DEFAULT '{}', aprovado_por TEXT, aprovado_em INTEGER, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS contas_cnpj ON contas (tipo, cnpj) WHERE cnpj IS NOT NULL;
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id) ON DELETE CASCADE, tipo TEXT NOT NULL,
  nome TEXT NOT NULL, email TEXT NOT NULL, senha_hash TEXT NOT NULL, papel TEXT NOT NULL, telefone TEXT,
  ativo INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email ON usuarios (tipo, email);
CREATE TABLE IF NOT EXISTS sessoes (token_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, tipo TEXT NOT NULL, expira_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cnpj_cache (cnpj TEXT PRIMARY KEY, dados TEXT NOT NULL, consultado_em INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS tabelas (
  id TEXT PRIMARY KEY, fornecedor_id TEXT NOT NULL REFERENCES contas(id), nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('desconto','lista')), desconto_bps INTEGER NOT NULL DEFAULT 0, precos TEXT NOT NULL DEFAULT '{}',
  ativo INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vinculos (
  id TEXT PRIMARY KEY, fornecedor_id TEXT NOT NULL REFERENCES contas(id), instalador_id TEXT NOT NULL REFERENCES contas(id),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','recusado')),
  cnaes_compativeis TEXT NOT NULL DEFAULT '[]', tabela_id TEXT REFERENCES tabelas(id), limite_credito_centavos INTEGER NOT NULL DEFAULT 0,
  bloqueado INTEGER NOT NULL DEFAULT 0, motivo TEXT, decidido_por TEXT, decidido_em INTEGER, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL,
  UNIQUE (fornecedor_id, instalador_id)
);
CREATE TABLE IF NOT EXISTS produtos (
  id TEXT PRIMARY KEY, fornecedor_id TEXT NOT NULL REFERENCES contas(id), codigo TEXT NOT NULL, nome TEXT NOT NULL, marca TEXT, categoria TEXT,
  foto_url TEXT, preco_centavos INTEGER NOT NULL, estoque INTEGER NOT NULL DEFAULT 0, reservado INTEGER NOT NULL DEFAULT 0,
  unidade TEXT NOT NULL DEFAULT 'un', prazo_dias INTEGER NOT NULL DEFAULT 1, visibilidade TEXT NOT NULL DEFAULT 'todos' CHECK (visibilidade IN ('todos','tabelas')),
  tabelas TEXT NOT NULL DEFAULT '[]', ativo INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL,
  CHECK (estoque >= 0 AND reservado >= 0 AND reservado <= estoque),
  UNIQUE (fornecedor_id, codigo)
);
CREATE TABLE IF NOT EXISTS kits (
  id TEXT PRIMARY KEY, instalador_id TEXT NOT NULL REFERENCES contas(id), nome TEXT NOT NULL, segmento TEXT, descricao TEXT,
  itens TEXT NOT NULL DEFAULT '[]', criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY, instalador_id TEXT NOT NULL REFERENCES contas(id), nome TEXT NOT NULL, documento TEXT, telefone TEXT, email TEXT,
  endereco TEXT NOT NULL DEFAULT '{}', criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS propostas (
  id TEXT PRIMARY KEY, instalador_id TEXT NOT NULL REFERENCES contas(id), numero INTEGER NOT NULL, cliente_id TEXT REFERENCES clientes(id),
  titulo TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviada','vista','aceita','paga','expirada','cancelada')),
  validade_dia TEXT, condicoes TEXT, garantia TEXT, observacoes TEXT, desconto_centavos INTEGER NOT NULL DEFAULT 0,
  subtotal_centavos INTEGER NOT NULL DEFAULT 0, total_centavos INTEGER NOT NULL DEFAULT 0, custo_fornecedores_centavos INTEGER NOT NULL DEFAULT 0,
  taxa_plataforma_centavos INTEGER NOT NULL DEFAULT 0, obra_cidade TEXT, obra_uf TEXT, token_hash TEXT UNIQUE, token_cripto TEXT,
  enviada_em INTEGER, vista_em INTEGER, aceita_em INTEGER, aceite TEXT, paga_em INTEGER, expirada_em INTEGER, cancelada_em INTEGER,
  reserva_expira_em INTEGER, renovacoes INTEGER NOT NULL DEFAULT 0, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL,
  UNIQUE (instalador_id, numero)
);
CREATE TABLE IF NOT EXISTS proposta_itens (
  id TEXT PRIMARY KEY, proposta_id TEXT NOT NULL REFERENCES propostas(id) ON DELETE CASCADE, ordem INTEGER NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL CHECK (tipo IN ('fornecedor','proprio','servico')), fornecedor_id TEXT, produto_id TEXT, codigo TEXT, descricao TEXT NOT NULL,
  unidade TEXT, foto_url TEXT, quantidade INTEGER NOT NULL, custo_unit_centavos INTEGER NOT NULL DEFAULT 0, preco_unit_centavos INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS itens_proposta ON proposta_itens (proposta_id);
CREATE INDEX IF NOT EXISTS itens_fornecedor ON proposta_itens (fornecedor_id);
CREATE TABLE IF NOT EXISTS reservas (
  id TEXT PRIMARY KEY, proposta_id TEXT NOT NULL REFERENCES propostas(id), item_id TEXT NOT NULL, fornecedor_id TEXT NOT NULL, produto_id TEXT NOT NULL,
  quantidade INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','baixada','expirada','liberada')),
  expira_em INTEGER NOT NULL, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reservas_status ON reservas (status, expira_em);
CREATE TABLE IF NOT EXISTS pagamentos (
  id TEXT PRIMARY KEY, proposta_id TEXT NOT NULL REFERENCES propostas(id), asaas_id TEXT UNIQUE, forma TEXT NOT NULL, parcelas INTEGER NOT NULL DEFAULT 1,
  valor_centavos INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  link TEXT, split TEXT NOT NULL DEFAULT '[]', pago_em INTEGER, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS repasses (
  id TEXT PRIMARY KEY, pagamento_id TEXT NOT NULL REFERENCES pagamentos(id), proposta_id TEXT NOT NULL, destino TEXT NOT NULL CHECK (destino IN ('fornecedor','instalador','nexor')),
  conta_id TEXT, valor_centavos INTEGER NOT NULL, via TEXT NOT NULL CHECK (via IN ('split','titulo','retido')),
  status TEXT NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto','recebido','cancelado')), criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS titulos (
  id TEXT PRIMARY KEY, fornecedor_id TEXT NOT NULL REFERENCES contas(id), instalador_id TEXT NOT NULL REFERENCES contas(id), proposta_id TEXT,
  descricao TEXT NOT NULL, valor_centavos INTEGER NOT NULL, vencimento TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','pago','cancelado')), origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','sem_wallet')),
  pago_em INTEGER, pago_no_prazo INTEGER, vencido_avisado INTEGER NOT NULL DEFAULT 0, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS titulos_vinculo ON titulos (fornecedor_id, instalador_id, status, vencimento);
CREATE TABLE IF NOT EXISTS notificacoes (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL, tipo TEXT NOT NULL, texto TEXT NOT NULL, ref TEXT, lida INTEGER NOT NULL DEFAULT 0, criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notificacoes_conta ON notificacoes (conta_id, criado_em);
CREATE TABLE IF NOT EXISTS envios (
  id TEXT PRIMARY KEY, conta_id TEXT, canal TEXT NOT NULL, para TEXT, texto TEXT NOT NULL, status TEXT NOT NULL, erro TEXT, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ordens (
  id TEXT PRIMARY KEY, instalador_id TEXT NOT NULL REFERENCES contas(id), numero INTEGER NOT NULL, proposta_id TEXT, cliente_id TEXT REFERENCES clientes(id),
  tecnico_id TEXT, titulo TEXT NOT NULL, descricao TEXT, agendada_para INTEGER,
  status TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada','a_caminho','em_execucao','concluida','cancelada')),
  checklist TEXT NOT NULL DEFAULT '[]', series TEXT NOT NULL DEFAULT '[]', assinatura_arquivo TEXT, assinado_por TEXT, assinado_em INTEGER,
  token_hash TEXT UNIQUE, token_cripto TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL,
  UNIQUE (instalador_id, numero)
);
CREATE TABLE IF NOT EXISTS os_historico (id TEXT PRIMARY KEY, os_id TEXT NOT NULL REFERENCES ordens(id) ON DELETE CASCADE, status TEXT NOT NULL, autor TEXT, nota TEXT, criado_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS os_fotos (id TEXT PRIMARY KEY, os_id TEXT NOT NULL REFERENCES ordens(id) ON DELETE CASCADE, arquivo TEXT NOT NULL, tipo TEXT NOT NULL, tamanho INTEGER NOT NULL, legenda TEXT, criado_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS contratos (
  id TEXT PRIMARY KEY, instalador_id TEXT NOT NULL REFERENCES contas(id), cliente_id TEXT NOT NULL REFERENCES clientes(id), descricao TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL, dia_vencimento INTEGER NOT NULL, inicio TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','cancelado')), asaas_cliente TEXT, asaas_assinatura TEXT UNIQUE,
  cancelado_em INTEGER, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contrato_cobrancas (
  id TEXT PRIMARY KEY, contrato_id TEXT NOT NULL REFERENCES contratos(id), asaas_id TEXT UNIQUE, valor_centavos INTEGER NOT NULL, vencimento TEXT,
  status TEXT NOT NULL DEFAULT 'pendente', pago_em INTEGER, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notas (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL, proposta_id TEXT, tipo TEXT NOT NULL CHECK (tipo IN ('nfse','nfe')), ref TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL, numero TEXT, url TEXT, simulada INTEGER NOT NULL DEFAULT 0, resposta TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auditoria (id TEXT PRIMARY KEY, conta_id TEXT, autor TEXT, acao TEXT NOT NULL, detalhe TEXT, ip TEXT, criado_em INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auditoria_conta ON auditoria (conta_id, criado_em);
`;

const JSON_COLS = {
  contas: ["cnaes", "config"],
  vinculos: ["cnaes_compativeis"],
  tabelas: ["precos"],
  produtos: ["tabelas"],
  kits: ["itens"],
  clientes: ["endereco"],
  propostas: ["aceite"],
  pagamentos: ["split"],
  ordens: ["checklist", "series"],
  notas: ["resposta"],
  auditoria: ["detalhe"],
};
const LISTAS = new Set(["cnaes", "cnaes_compativeis", "tabelas", "itens", "split", "checklist", "series"]);
const BOOL_COLS = new Set(["ativo", "bloqueado", "lida", "simulada", "vencido_avisado", "pago_no_prazo"]);

const lerJson = (v, padrao) => {
  if (v === null || v === undefined) return padrao;
  try {
    return JSON.parse(v);
  } catch {
    return padrao;
  }
};

/** Migrações idempotentes: o esquema usa IF NOT EXISTS; colunas novas entram por aqui sem quebrar bancos antigos */
function migrar(db) {
  const temColuna = (tabela, coluna) => db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna);
  const coluna = (tabela, nome, definicao) => {
    if (!temColuna(tabela, nome)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${nome} ${definicao}`);
  };
  db.exec(ESQUEMA);
  // Exemplo de evolução futura (mantém a chamada idempotente): coluna("produtos", "ncm", "TEXT");
  coluna("contas", "aprovado_em", "INTEGER");
  // Banca P-01/P-03: cobrança substituída precisa ser cancelada no Asaas; estorno/chargeback e pagamento indevido
  coluna("pagamentos", "cancelar_asaas", "INTEGER NOT NULL DEFAULT 0");
  coluna("pagamentos", "estornado_em", "INTEGER");
  coluna("pagamentos", "indevido", "INTEGER NOT NULL DEFAULT 0");
  // Banca U-02: chave do rascunho (duas abas do mesmo rascunho não criam duas propostas)
  coluna("propostas", "chave", "TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS propostas_chave ON propostas (instalador_id, chave) WHERE chave IS NOT NULL");
  db.prepare("INSERT OR IGNORE INTO plataforma (chave, valor) VALUES ('versao_esquema', '1')").run();
}

export function abrirBanco(caminho, agora = () => Date.now()) {
  if (caminho !== ":memory:") mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrar(db);
  const cache = new Map();
  const q = (sql) => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = db.prepare(sql)));
    return s;
  };
  const colunas = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) colunas[name] = new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name));

  const ler = (tabela, r) => {
    if (!r) return null;
    const o = { ...r };
    for (const c of JSON_COLS[tabela] ?? []) if (c in o) o[c] = lerJson(o[c], LISTAS.has(c) ? [] : c === "aceite" || c === "resposta" || c === "detalhe" ? null : {});
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

  let emTransacao = false;
  const repo = {
    db,
    fechar: () => db.close(),
    /** Transação exclusiva (BEGIN IMMEDIATE): reservas de estoque e baixas acontecem inteiras ou não acontecem */
    transacao(fn) {
      if (emTransacao) return fn();
      db.exec("BEGIN IMMEDIATE");
      emTransacao = true;
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      } finally {
        emTransacao = false;
      }
    },
    um: (sql, ...p) => q(sql).get(...p),
    todos: (sql, ...p) => q(sql).all(...p),
    rodar: (sql, ...p) => q(sql).run(...p),
    ler,
    inserir(tabela, campos) {
      const extra = {};
      for (const c of ["criado_em", "atualizado_em"]) if (colunas[tabela].has(c)) extra[c] = agora();
      const r = gravar(tabela, { id: randomUUID(), ...extra, ...campos });
      const ks = Object.keys(r);
      q(`INSERT INTO ${tabela} (${ks.join(",")}) VALUES (${ks.map(() => "?").join(",")})`).run(...Object.values(r));
      return repo.obter(tabela, r.id);
    },
    obter: (tabela, id) => ler(tabela, q(`SELECT * FROM ${tabela} WHERE id = ?`).get(id)),
    atualizar(tabela, id, campos) {
      const r = gravar(tabela, { ...campos, ...(colunas[tabela].has("atualizado_em") ? { atualizado_em: agora() } : {}) });
      delete r.id;
      const ks = Object.keys(r);
      if (ks.length) q(`UPDATE ${tabela} SET ${ks.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...Object.values(r), id);
      return repo.obter(tabela, id);
    },
    remover: (tabela, id) => q(`DELETE FROM ${tabela} WHERE id = ?`).run(id).changes > 0,
    lista: (tabela, sql = "", ...p) => q(`SELECT * FROM ${tabela} ${sql}`).all(...p).map((r) => ler(tabela, r)),

    plataforma: (chave) => q("SELECT valor FROM plataforma WHERE chave = ?").get(chave)?.valor ?? null,
    definirPlataforma: (chave, valor) => q("INSERT INTO plataforma (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(chave, valor),
    usuarioPorEmail: (tipo, email) => q("SELECT * FROM usuarios WHERE tipo = ? AND email = ? AND ativo = 1").get(tipo, String(email).toLowerCase()),
    contarUsuarios: (tipo) => q("SELECT COUNT(*) n FROM usuarios WHERE tipo = ?").get(tipo).n,
    criarSessao(token_hash, usuario_id, tipo, dias) {
      q("DELETE FROM sessoes WHERE expira_em < ?").run(agora());
      q("INSERT INTO sessoes (token_hash, usuario_id, tipo, expira_em) VALUES (?,?,?,?)").run(token_hash, usuario_id, tipo, agora() + dias * 86400_000);
    },
    sessao: (token_hash, tipo) => q("SELECT * FROM sessoes WHERE token_hash = ? AND tipo = ? AND expira_em > ?").get(token_hash, tipo, agora()),
    encerrarSessao: (token_hash) => q("DELETE FROM sessoes WHERE token_hash = ?").run(token_hash),
    encerrarSessoesDo: (usuario_id) => q("DELETE FROM sessoes WHERE usuario_id = ?").run(usuario_id),
    auditar: (conta_id, autor, acao, detalhe = null, ip = null) => repo.inserir("auditoria", { conta_id, autor, acao, detalhe, ip }),
    proximoNumero: (tabela, instalador_id) => (q(`SELECT MAX(numero) n FROM ${tabela} WHERE instalador_id = ?`).get(instalador_id).n ?? 0) + 1,
  };
  return repo;
}
