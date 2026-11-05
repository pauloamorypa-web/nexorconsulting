/* Banco da Nexor Central (SQLite nativo do Node). Guarda só dados comerciais e técnicos dos clientes:
   nenhum dado de colaborador dos sistemas sai da instalação do cliente para cá. */

import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE, senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('dono','financeiro','suporte')), totp TEXT,
  ativo INTEGER NOT NULL DEFAULT 1, ultimo_acesso INTEGER, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fase TEXT NOT NULL DEFAULT 'senha', totp_novo TEXT, expira_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY, razao_social TEXT NOT NULL, nome_fantasia TEXT, cnpj TEXT NOT NULL,
  contato_nome TEXT, email TEXT, telefone TEXT, cidade TEXT, plano TEXT,
  valor_centavos INTEGER NOT NULL DEFAULT 0, dia_vencimento INTEGER NOT NULL DEFAULT 10, inicio_cobranca TEXT,
  regras TEXT NOT NULL DEFAULT '{}', bloqueio_manual TEXT, liberado_ate TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','cancelado')),
  asaas_cliente_id TEXT, observacoes TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sistemas (
  id TEXT PRIMARY KEY, cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  produto TEXT NOT NULL CHECK (produto IN ('rh','atende','agente','one','contabil','barber')), nome TEXT, url TEXT,
  token_hash TEXT NOT NULL UNIQUE, prefixo TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1,
  ultimo_contato INTEGER, versao TEXT, saude TEXT NOT NULL DEFAULT '{}', ip TEXT, situacao TEXT, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS faturas (
  id TEXT PRIMARY KEY, cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  competencia TEXT, descricao TEXT NOT NULL, valor_centavos INTEGER NOT NULL, vencimento TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','cancelada')),
  pago_em TEXT, forma TEXT, externo_id TEXT, link TEXT, erro_cobranca TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS faturas_mensal ON faturas (cliente_id, competencia) WHERE competencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS faturas_status ON faturas (status, vencimento);
CREATE TABLE IF NOT EXISTS auditoria (id TEXT PRIMARY KEY, autor TEXT, acao TEXT NOT NULL, cliente_id TEXT, detalhe TEXT, criado_em INTEGER NOT NULL);
-- Vendedores e parceiros (tipo: chave de COMISSOES em planos.js); o portal do parceiro entra por link com token
CREATE TABLE IF NOT EXISTS parceiros (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL, empresa TEXT, documento TEXT, email TEXT, telefone TEXT, pix TEXT,
  percentuais TEXT NOT NULL DEFAULT '{}', portal_hash TEXT, ativo INTEGER NOT NULL DEFAULT 1, observacoes TEXT,
  criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
-- Comissões geradas quando a fatura é paga: prevista (carência) → a_pagar → paga, ou estornada
CREATE TABLE IF NOT EXISTS comissoes (
  id TEXT PRIMARY KEY, parceiro_id TEXT NOT NULL REFERENCES parceiros(id), fatura_id TEXT NOT NULL REFERENCES faturas(id),
  cliente_id TEXT NOT NULL, tipo TEXT NOT NULL, base_centavos INTEGER NOT NULL, pct REAL NOT NULL, valor_centavos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'prevista', liberar_em TEXT NOT NULL, pago_em TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS comissoes_unica ON comissoes (parceiro_id, fatura_id);
-- Indicações enviadas pelos parceiros no portal
CREATE TABLE IF NOT EXISTS indicacoes (
  id TEXT PRIMARY KEY, parceiro_id TEXT NOT NULL REFERENCES parceiros(id), empresa TEXT NOT NULL, contato TEXT, telefone TEXT, email TEXT,
  produto TEXT, observacao TEXT, status TEXT NOT NULL DEFAULT 'nova', cliente_id TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
`;

const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I: fácil de ditar e digitar
/** Código do cliente: NX-XXXX-XXXX (32^8 ≈ 1 trilhão de combinações) */
export const novoCodigo = () => {
  const c = [...randomBytes(8)].map((b) => LETRAS[b % 32]).join("");
  return `NX-${c.slice(0, 4)}-${c.slice(4)}`;
};
/** Normaliza o que a pessoa digitou: minúsculas, espaços e sem hífen viram NX-XXXX-XXXX */
export function normalizarCodigo(v) {
  const s = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^NX/, "");
  return /^[A-Z0-9]{8}$/.test(s) ? `NX-${s.slice(0, 4)}-${s.slice(4)}` : null;
}

const JSON_COLS = { clientes: ["regras"], sistemas: ["saude"], auditoria: ["detalhe"], parceiros: ["percentuais"] };
const BOOL_COLS = new Set(["ativo", "fundador"]);
const lerJson = (v, padrao) => {
  try {
    return v ? JSON.parse(v) : padrao;
  } catch {
    return padrao;
  }
};

export function abrirBanco(caminho, agora = () => Date.now()) {
  if (caminho !== ":memory:") mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(ESQUEMA);
  // Produto novo na lista (SQLite não altera CHECK): recria a tabela de sistemas mantendo os dados
  const sqlSistemas = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sistemas'").get()?.sql ?? "";
  if (!sqlSistemas.includes("'barber'")) {
    const criar = /CREATE TABLE IF NOT EXISTS sistemas \(([\s\S]*?)\n\);/.exec(ESQUEMA)[1];
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec(`BEGIN; CREATE TABLE sistemas_novo (${criar}); INSERT INTO sistemas_novo SELECT * FROM sistemas; DROP TABLE sistemas; ALTER TABLE sistemas_novo RENAME TO sistemas; COMMIT;`);
    db.exec("PRAGMA foreign_keys = ON");
  }
  // Código do cliente (NX-XXXX-XXXX): vincula qualquer sistema Nexor ao cliente na hora
  if (!db.prepare("PRAGMA table_info(clientes)").all().some((c) => c.name === "codigo")) db.exec("ALTER TABLE clientes ADD COLUMN codigo TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS clientes_codigo ON clientes (codigo)");
  for (const { id } of db.prepare("SELECT id FROM clientes WHERE codigo IS NULL").all()) db.prepare("UPDATE clientes SET codigo = ? WHERE id = ?").run(novoCodigo(), id);

  // Comercial: teste grátis, plano do catálogo, fundador, desconto e quem vendeu (colunas novas, sem CHECK)
  const NOVAS = {
    clientes: { fase: "TEXT NOT NULL DEFAULT 'contrato'", teste_ate: "TEXT", produto: "TEXT", plano_id: "TEXT", quantidade: "INTEGER", fundador: "INTEGER NOT NULL DEFAULT 0", desconto_pct: "REAL NOT NULL DEFAULT 0", desconto_ate: "TEXT", parceiro_id: "TEXT", vendedor_id: "TEXT", contratado_em: "TEXT" },
    faturas: { tipo: "TEXT NOT NULL DEFAULT 'mensalidade'" },
  };
  for (const [tabela, cols] of Object.entries(NOVAS)) {
    const tem = new Set(db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name));
    for (const [c, def] of Object.entries(cols)) if (!tem.has(c)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${c} ${def}`);
  }
  // Faturas avulsas antigas sem competência eram lançadas à mão: ficam como "avulsa"
  db.exec("UPDATE faturas SET tipo = 'avulsa' WHERE competencia IS NULL AND tipo = 'mensalidade' AND descricao NOT LIKE 'Mensalidade%'");

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
    for (const c of JSON_COLS[tabela] ?? []) if (c in o) o[c] = lerJson(o[c], {});
    for (const c of Object.keys(o)) if (BOOL_COLS.has(c)) o[c] = Boolean(o[c]);
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
      if (colunas[tabela].has("criado_em")) extra.criado_em = agora();
      if (colunas[tabela].has("atualizado_em")) extra.atualizado_em = agora();
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
    lista: (tabela, sql = "", ...p) => q(`SELECT * FROM ${tabela} ${sql}`).all(...p).map((r) => ler(tabela, r)),

    contarUsuarios: () => q("SELECT COUNT(*) n FROM usuarios").get().n,
    usuarioPorEmail: (email) => q("SELECT * FROM usuarios WHERE email = ? AND ativo = 1").get(String(email).toLowerCase()),
    criarSessao(token_hash, usuario_id, horas, fase = "senha") {
      q("DELETE FROM sessoes WHERE expira_em < ?").run(agora());
      q("INSERT INTO sessoes (token_hash, usuario_id, fase, expira_em) VALUES (?,?,?,?)").run(token_hash, usuario_id, fase, agora() + horas * 3600_000);
    },
    sessao: (token_hash) => q("SELECT * FROM sessoes WHERE token_hash = ? AND expira_em > ?").get(token_hash, agora()),
    auditar: (autor, acao, cliente_id = null, detalhe = null) => repo.inserir("auditoria", { autor, acao, cliente_id, detalhe }),
  };
  return repo;
}
