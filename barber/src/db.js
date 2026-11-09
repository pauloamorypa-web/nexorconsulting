/* Banco do Nexor Barber (SQLite nativo do Node). Uma instalação = uma barbearia.
   Instantes: milissegundos (UTC). Dia: AAAA-MM-DD. Dinheiro: centavos. Percentuais: inteiros (40 = 40%). */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS barbearias (id TEXT PRIMARY KEY, nome TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', criada_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE, senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('dono','admin','recepcao','barbeiro')), barbeiro_id TEXT,
  ativo INTEGER NOT NULL DEFAULT 1, nexor INTEGER NOT NULL DEFAULT 0, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes (token_hash TEXT PRIMARY KEY, usuario_id TEXT, cliente_id TEXT, expira_em INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS barbeiros (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, nome TEXT NOT NULL, bio TEXT, cor TEXT NOT NULL DEFAULT '#3b8dff',
  comissao_servico INTEGER NOT NULL DEFAULT 40, comissao_produto INTEGER NOT NULL DEFAULT 10,
  horario TEXT, servicos TEXT NOT NULL DEFAULT '[]', ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS servicos (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, nome TEXT NOT NULL, descricao TEXT, categoria TEXT,
  duracao_min INTEGER NOT NULL, preco_centavos INTEGER NOT NULL, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, nome TEXT NOT NULL, fone TEXT, email TEXT, google_sub TEXT,
  nascimento TEXT, observacoes TEXT, preferencias TEXT, aceita_mensagens INTEGER NOT NULL DEFAULT 1,
  ultima_visita TEXT, ciclo_dias INTEGER, retorno_avisado_em INTEGER, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS clientes_fone ON clientes (barbearia_id, fone) WHERE fone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clientes_google ON clientes (barbearia_id, google_sub) WHERE google_sub IS NOT NULL;
CREATE TABLE IF NOT EXISTS codigos (id TEXT PRIMARY KEY, destino TEXT NOT NULL, canal TEXT NOT NULL, hash TEXT NOT NULL, expira_em INTEGER NOT NULL, tentativas INTEGER NOT NULL DEFAULT 0, criado_em INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS codigos_destino ON codigos (destino, criado_em);

CREATE TABLE IF NOT EXISTS agendamentos (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id),
  barbeiro_id TEXT NOT NULL REFERENCES barbeiros(id), servico_id TEXT NOT NULL REFERENCES servicos(id),
  inicio INTEGER NOT NULL, fim INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado','chegou','em_atendimento','concluido','cancelado','faltou')),
  origem TEXT NOT NULL DEFAULT 'app' CHECK (origem IN ('app','painel','espera')),
  preco_centavos INTEGER NOT NULL, assinatura_id TEXT, observacao TEXT,
  lembrete_em INTEGER, chegou_em INTEGER, cancelado_por TEXT, venda_id TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agendamentos_barbeiro ON agendamentos (barbeiro_id, inicio);
CREATE INDEX IF NOT EXISTS agendamentos_cliente ON agendamentos (cliente_id, inicio);
CREATE TABLE IF NOT EXISTS bloqueios (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, barbeiro_id TEXT, inicio INTEGER NOT NULL, fim INTEGER NOT NULL,
  motivo TEXT, criado_por TEXT, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS espera (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  servico_id TEXT NOT NULL, barbeiro_id TEXT, dia TEXT NOT NULL, de TEXT NOT NULL, ate TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','oferecida','atendida','expirada','cancelada')),
  oferta TEXT, oferta_hash TEXT, oferecida_em INTEGER, criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS planos (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, nome TEXT NOT NULL, descricao TEXT, preco_centavos INTEGER NOT NULL,
  itens TEXT NOT NULL DEFAULT '[]', dias_semana TEXT NOT NULL DEFAULT '[]', desconto_produtos INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assinaturas (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id), plano_id TEXT NOT NULL REFERENCES planos(id),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','ativa','atrasada','cancelada')),
  ciclo_inicio TEXT, ciclo_fim TEXT, cpf TEXT, asaas_cliente TEXT, asaas_assinatura TEXT, link TEXT,
  cancelada_em INTEGER, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assinaturas_cliente ON assinaturas (cliente_id, status);
CREATE TABLE IF NOT EXISTS cobrancas (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, assinatura_id TEXT NOT NULL REFERENCES assinaturas(id) ON DELETE CASCADE,
  valor_centavos INTEGER NOT NULL, vencimento TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','cancelada')),
  forma TEXT, externo_id TEXT UNIQUE, link TEXT, pago_em INTEGER, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usos (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, assinatura_id TEXT NOT NULL, servico_id TEXT NOT NULL, agendamento_id TEXT UNIQUE,
  ciclo_inicio TEXT NOT NULL, criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS produtos (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, nome TEXT NOT NULL, descricao TEXT, categoria TEXT, codigo TEXT,
  preco_centavos INTEGER NOT NULL, custo_centavos INTEGER NOT NULL DEFAULT 0, estoque INTEGER NOT NULL DEFAULT 0, estoque_minimo INTEGER NOT NULL DEFAULT 0,
  vitrine INTEGER NOT NULL DEFAULT 1, ativo INTEGER NOT NULL DEFAULT 1, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS estoque_mov (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, produto_id TEXT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','venda','ajuste','estorno')), quantidade INTEGER NOT NULL, saldo INTEGER NOT NULL,
  motivo TEXT, autor TEXT, venda_id TEXT, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reservas (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, cliente_id TEXT NOT NULL, agendamento_id TEXT REFERENCES agendamentos(id) ON DELETE CASCADE,
  produto_id TEXT NOT NULL REFERENCES produtos(id), quantidade INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'reservado' CHECK (status IN ('reservado','vendido','cancelado')), criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vendas (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, cliente_id TEXT, barbeiro_id TEXT, agendamento_id TEXT,
  itens TEXT NOT NULL DEFAULT '[]', subtotal_centavos INTEGER NOT NULL, desconto_centavos INTEGER NOT NULL DEFAULT 0, total_centavos INTEGER NOT NULL,
  forma TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'paga' CHECK (status IN ('paga','cancelada')), dia TEXT NOT NULL,
  autor TEXT, cancelada_por TEXT, criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vendas_dia ON vendas (barbearia_id, dia);
CREATE TABLE IF NOT EXISTS comissoes (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, barbeiro_id TEXT NOT NULL, venda_id TEXT NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('servico','produto')), descricao TEXT, base_centavos INTEGER NOT NULL, percentual INTEGER NOT NULL,
  valor_centavos INTEGER NOT NULL, dia TEXT NOT NULL, criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comissoes_barbeiro ON comissoes (barbeiro_id, dia);
CREATE TABLE IF NOT EXISTS envios (
  id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, cliente_id TEXT, canal TEXT NOT NULL, motivo TEXT NOT NULL, status TEXT NOT NULL, erro TEXT, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS nexor_ajustes (barbearia_id TEXT PRIMARY KEY, ocultos TEXT NOT NULL DEFAULT '[]', atualizado_por TEXT, atualizado_em INTEGER);
CREATE TABLE IF NOT EXISTS auditoria (id TEXT PRIMARY KEY, barbearia_id TEXT NOT NULL, autor TEXT, acao TEXT NOT NULL, detalhe TEXT, criado_em INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auditoria_barbearia ON auditoria (barbearia_id, criado_em);
`;

const JSON_COLS = { barbearias: ["config"], barbeiros: ["horario", "servicos"], clientes: ["preferencias"], planos: ["itens", "dias_semana"], vendas: ["itens"], espera: ["oferta"], auditoria: ["detalhe"] };
const BOOL_COLS = new Set(["ativo", "nexor", "aceita_mensagens", "vitrine", "marketing_optin"]);
const LISTAS = new Set(["servicos", "itens", "dias_semana"]);
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
  // Opt-in de marketing (LGPD art. 8º): consentimento para mensagens promocionais (retorno), com data e origem.
  // Desmarcado por padrão, inclusive para clientes que já existiam. Lembrete de horário marcado não é marketing.
  const colsCliente = new Set(db.prepare("PRAGMA table_info(clientes)").all().map((c) => c.name));
  for (const [c, def] of [["marketing_optin", "INTEGER NOT NULL DEFAULT 0"], ["marketing_optin_em", "INTEGER"], ["marketing_optin_origem", "TEXT"]]) if (!colsCliente.has(c)) db.exec(`ALTER TABLE clientes ADD COLUMN ${c} ${def}`);
  const colunas = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) colunas[name] = new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name));

  const ler = (tabela, r) => {
    if (!r) return null;
    const o = { ...r };
    for (const c of JSON_COLS[tabela] ?? []) if (c in o) o[c] = lerJson(o[c], LISTAS.has(c) ? [] : c === "horario" || c === "oferta" ? null : {});
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
      for (const c of ["criado_em", "criada_em", "atualizado_em"]) if (colunas[tabela].has(c)) extra[c] = agora();
      const r = gravar(tabela, { id: randomUUID(), ...extra, ...campos });
      const ks = Object.keys(r);
      q(`INSERT INTO ${tabela} (${ks.join(",")}) VALUES (${ks.map(() => "?").join(",")})`).run(...Object.values(r));
      return repo.obter(tabela, r.id);
    },
    obter: (tabela, id) => ler(tabela, q(`SELECT * FROM ${tabela} WHERE id = ?`).get(id)),
    atualizar(tabela, id, campos) {
      const r = gravar(tabela, { ...campos, ...(colunas[tabela].has("atualizado_em") ? { atualizado_em: agora() } : {}) });
      delete r.id;
      delete r.barbearia_id;
      const ks = Object.keys(r);
      if (ks.length) q(`UPDATE ${tabela} SET ${ks.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...Object.values(r), id);
      return repo.obter(tabela, id);
    },
    remover: (tabela, id) => q(`DELETE FROM ${tabela} WHERE id = ?`).run(id).changes > 0,
    /** SELECT com o resto da consulta (WHERE/ORDER) e leitura das colunas JSON */
    lista: (tabela, sql = "", ...p) => q(`SELECT * FROM ${tabela} ${sql}`).all(...p).map((r) => ler(tabela, r)),

    barbearia: () => ler("barbearias", q("SELECT * FROM barbearias ORDER BY criada_em LIMIT 1").get()),
    contarUsuarios: () => q("SELECT COUNT(*) n FROM usuarios WHERE nexor = 0").get().n,
    usuarioPorEmail: (email) => q("SELECT * FROM usuarios WHERE email = ? AND ativo = 1 AND nexor = 0").get(String(email).toLowerCase()),
    criarSessao(token_hash, { usuario_id = null, cliente_id = null }, dias) {
      q("DELETE FROM sessoes WHERE expira_em < ?").run(agora());
      q("INSERT INTO sessoes (token_hash, usuario_id, cliente_id, expira_em) VALUES (?,?,?,?)").run(token_hash, usuario_id, cliente_id, agora() + dias * 86400_000);
    },
    sessao: (token_hash) => q("SELECT * FROM sessoes WHERE token_hash = ? AND expira_em > ?").get(token_hash, agora()),
    encerrarSessao: (token_hash) => q("DELETE FROM sessoes WHERE token_hash = ?").run(token_hash),
    ocultos: (barbearia_id) => lerJson(q("SELECT ocultos FROM nexor_ajustes WHERE barbearia_id = ?").get(barbearia_id)?.ocultos, []),
    auditar: (barbearia_id, autor, acao, detalhe = null) => repo.inserir("auditoria", { barbearia_id, autor, acao, detalhe }),
  };
  return repo;
}
