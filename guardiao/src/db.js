/* Banco do Nexor Guardião (SQLite nativo do Node). Multi-inquilino: revendas → contas → locais → câmeras → trechos.
   Instantes: milissegundos (UTC). Dia: AAAA-MM-DD (horário de Brasília). Dinheiro: centavos inteiros.
   Só metadados ficam aqui; o vídeo (sempre cifrado) fica no armazenamento. Chaves só entram embrulhadas. */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { GENESE, hashAuditoria } from "./regras/cadeia.js";
import { COMERCIAL, ORIGEM_TABELA, RETENCOES, linhasIniciais } from "./regras/precos.js";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS plataforma (chave TEXT PRIMARY KEY, valor TEXT);
CREATE TABLE IF NOT EXISTS revendas (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, cnpj TEXT, marca TEXT NOT NULL DEFAULT '{}', desconto_bps INTEGER,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','suspensa')), criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contas (
  id TEXT PRIMARY KEY, revenda_id TEXT REFERENCES revendas(id), nome TEXT NOT NULL, cnpj TEXT, cidade TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','bloqueada','encerrada')),
  bloqueada_em INTEGER, bloqueio_motivo TEXT, encerrada_em INTEGER,
  kek_embrulhada TEXT, config TEXT NOT NULL DEFAULT '{}', criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, perfil TEXT NOT NULL CHECK (perfil IN ('nexor','revenda','gestor','operador')),
  conta_id TEXT REFERENCES contas(id), revenda_id TEXT REFERENCES revendas(id),
  nome TEXT NOT NULL, email TEXT NOT NULL, senha_hash TEXT NOT NULL, telefone TEXT, ativo INTEGER NOT NULL DEFAULT 1,
  pode_exportar INTEGER NOT NULL DEFAULT 0, horario TEXT,
  totp_cripto TEXT, totp_pendente_cripto TEXT, totp_ultimo_passo INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email ON usuarios (email);
CREATE TABLE IF NOT EXISTS codigos_recuperacao (id TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, hash TEXT NOT NULL, usado_em INTEGER, criado_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, nivel TEXT NOT NULL DEFAULT 'completa' CHECK (nivel IN ('pre2fa','configurar2fa','completa')),
  ip TEXT, criado_em INTEGER NOT NULL, expira_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS locais (id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), nome TEXT NOT NULL, endereco TEXT, cidade TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pontes (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), local_id TEXT REFERENCES locais(id), nome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','ativa','revogada')),
  codigo_hash TEXT, codigo_expira_em INTEGER, credencial_hash TEXT, versao TEXT, visto_em INTEGER, ip TEXT,
  fila_atraso_s INTEGER NOT NULL DEFAULT 0, fila_trechos INTEGER NOT NULL DEFAULT 0, fila_bytes INTEGER NOT NULL DEFAULT 0,
  pareada_em INTEGER, revogada_em INTEGER, criado_por TEXT, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), local_id TEXT NOT NULL REFERENCES locais(id), ponte_id TEXT REFERENCES pontes(id),
  nome TEXT NOT NULL, marca TEXT, canal INTEGER, rtsp_cripto TEXT,
  retencao_dias INTEGER NOT NULL CHECK (retencao_dias IN (${RETENCOES.join(",")})), retencao_anterior_dias INTEGER, reducao_efetiva_em INTEGER,
  qualidade TEXT NOT NULL DEFAULT 'padrao' CHECK (qualidade IN ('economica','padrao','alta')),
  modo TEXT NOT NULL DEFAULT 'continuo' CHECK (modo IN ('continuo','movimento')),
  segundos_trecho INTEGER NOT NULL DEFAULT 30, formato TEXT NOT NULL DEFAULT 'mp4' CHECK (formato IN ('mp4','ts')), ativa INTEGER NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'desconhecido' CHECK (estado IN ('desconhecido','ok','sem_sinal','preta','tampada')), estado_em INTEGER, disco_dvr TEXT,
  ultimo_trecho_em INTEGER, bitrate_kbps INTEGER,
  chave_publica TEXT NOT NULL, chave_privada_embrulhada TEXT,
  cadeia_seq INTEGER NOT NULL DEFAULT 0, cadeia_topo TEXT, cadeia_verificada_em INTEGER, cadeia_integra INTEGER,
  criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trechos (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), camera_id TEXT NOT NULL REFERENCES cameras(id), seq INTEGER NOT NULL,
  inicio INTEGER NOT NULL, fim INTEGER NOT NULL, tamanho INTEGER NOT NULL, tamanho_claro INTEGER NOT NULL, sha256 TEXT NOT NULL,
  hash_anterior TEXT NOT NULL, hash_cadeia TEXT NOT NULL, dek_selada TEXT, tem_movimento INTEGER NOT NULL DEFAULT 0,
  formato TEXT NOT NULL DEFAULT 'mp4', inicio_midia INTEGER NOT NULL DEFAULT 0, chave_arquivo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'guardado' CHECK (status IN ('guardado','expirado')), recebido_em INTEGER NOT NULL, expirado_em INTEGER, motivo_expiracao TEXT,
  UNIQUE (camera_id, inicio), UNIQUE (camera_id, seq)
);
CREATE TABLE IF NOT EXISTS envios_pendentes (
  id TEXT PRIMARY KEY, ponte_id TEXT NOT NULL, camera_id TEXT NOT NULL, inicio INTEGER NOT NULL, dados TEXT NOT NULL, chave_arquivo TEXT NOT NULL,
  expira_em INTEGER NOT NULL, criado_em INTEGER NOT NULL, UNIQUE (camera_id, inicio)
);
CREATE TABLE IF NOT EXISTS permissoes (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, camera_id TEXT NOT NULL REFERENCES cameras(id),
  ao_vivo INTEGER NOT NULL DEFAULT 1, gravacoes INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (usuario_id, camera_id)
);
CREATE TABLE IF NOT EXISTS preservacoes (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), camera_id TEXT NOT NULL REFERENCES cameras(id), inicio INTEGER NOT NULL, fim INTEGER NOT NULL,
  motivo TEXT NOT NULL, criado_por TEXT NOT NULL, criado_por_nome TEXT, liberado_em INTEGER, liberado_por TEXT, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exportacoes (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), camera_id TEXT NOT NULL REFERENCES cameras(id), inicio INTEGER NOT NULL, fim INTEGER NOT NULL,
  motivo TEXT, formato TEXT, nome_arquivo TEXT, status TEXT NOT NULL DEFAULT 'processando' CHECK (status IN ('processando','pronta','falhou')), erro TEXT,
  tamanho INTEGER, tamanho_claro INTEGER, sha256_claro TEXT, chave_arquivo TEXT, dek_embrulhada TEXT, trechos INTEGER NOT NULL DEFAULT 0,
  criado_por TEXT NOT NULL, criado_por_nome TEXT, ip TEXT, baixada INTEGER NOT NULL DEFAULT 0, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS laudos (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), exportacao_id TEXT REFERENCES exportacoes(id), camera_id TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE, dados TEXT NOT NULL, hash TEXT NOT NULL, emitido_por TEXT NOT NULL, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS compartilhamentos (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), camera_id TEXT NOT NULL REFERENCES cameras(id), inicio INTEGER NOT NULL, fim INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, token_cripto TEXT, destinatario TEXT, senha_hash TEXT, max_visualizacoes INTEGER, visualizacoes INTEGER NOT NULL DEFAULT 0,
  expira_em INTEGER NOT NULL, revogado_em INTEGER, revogado_por TEXT, criado_por TEXT NOT NULL, criado_por_nome TEXT, ultimo_acesso_em INTEGER, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes_link (token_hash TEXT PRIMARY KEY, compartilhamento_id TEXT NOT NULL, ip TEXT, expira_em INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS acessos_suporte (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), solicitante_id TEXT NOT NULL, solicitante_nome TEXT, solicitante_perfil TEXT NOT NULL,
  motivo TEXT NOT NULL, horas INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','negado','revogado')),
  decidido_por TEXT, decidido_por_nome TEXT, decidido_em INTEGER, expira_em INTEGER, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT, cadeia TEXT NOT NULL, conta_id TEXT, revenda_id TEXT, ator_id TEXT, ator_nome TEXT, ator_perfil TEXT,
  acao TEXT NOT NULL, detalhe TEXT, ip TEXT, criado_em INTEGER NOT NULL, hash_anterior TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS visualizacoes (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL, camera_id TEXT NOT NULL, ator_id TEXT NOT NULL, ator_nome TEXT, ator_perfil TEXT, tipo TEXT NOT NULL,
  origem TEXT, de INTEGER, ate INTEGER, trechos INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, ip TEXT,
  aberta_em INTEGER NOT NULL, ultima_em INTEGER NOT NULL, encerrada_em INTEGER
);
CREATE TABLE IF NOT EXISTS alertas (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), local_id TEXT, camera_id TEXT, ponte_id TEXT, tipo TEXT NOT NULL, alvo TEXT NOT NULL,
  gravidade TEXT NOT NULL DEFAULT 'media', mensagem TEXT NOT NULL, detalhe TEXT, notificado TEXT, aberto_em INTEGER NOT NULL, resolvido_em INTEGER, visto_por TEXT
);
CREATE TABLE IF NOT EXISTS planos (retencao_dias INTEGER PRIMARY KEY, nome TEXT NOT NULL, preservacao_horas INTEGER NOT NULL, ativo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS precos (
  id TEXT PRIMARY KEY, revenda_id TEXT REFERENCES revendas(id), retencao_dias INTEGER NOT NULL, qualidade TEXT NOT NULL, modo TEXT NOT NULL,
  centavos_mes INTEGER NOT NULL, origem TEXT, atualizado_por TEXT, atualizado_em INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS precos_combinacao ON precos (COALESCE(revenda_id, ''), retencao_dias, qualidade, modo);
CREATE TABLE IF NOT EXISTS consumo (
  conta_id TEXT NOT NULL, camera_id TEXT NOT NULL, dia TEXT NOT NULL, trechos INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0,
  segundos INTEGER NOT NULL DEFAULT 0, bytes_vistos INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (camera_id, dia)
);
CREATE TABLE IF NOT EXISTS relatorios (id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), mes TEXT NOT NULL, dados TEXT NOT NULL, criado_em INTEGER NOT NULL, UNIQUE (conta_id, mes));
CREATE TABLE IF NOT EXISTS pedidos_titular (
  id TEXT PRIMARY KEY, conta_id TEXT NOT NULL REFERENCES contas(id), nome TEXT NOT NULL, contato TEXT, tipo TEXT NOT NULL, descricao TEXT NOT NULL,
  camera_id TEXT, inicio INTEGER, fim INTEGER, status TEXT NOT NULL DEFAULT 'aberto', resposta TEXT, criado_por TEXT, respondido_em INTEGER, criado_em INTEGER NOT NULL
);
`;

/* Índices desde o início (no SQLite a chave estrangeira não cria índice) */
const INDICES = `
CREATE INDEX IF NOT EXISTS contas_revenda ON contas (revenda_id, status);
CREATE INDEX IF NOT EXISTS usuarios_conta ON usuarios (conta_id);
CREATE INDEX IF NOT EXISTS usuarios_revenda ON usuarios (revenda_id);
CREATE INDEX IF NOT EXISTS codigos_usuario ON codigos_recuperacao (usuario_id);
CREATE INDEX IF NOT EXISTS sessoes_usuario ON sessoes (usuario_id);
CREATE INDEX IF NOT EXISTS sessoes_expira ON sessoes (expira_em);
CREATE INDEX IF NOT EXISTS locais_conta ON locais (conta_id);
CREATE INDEX IF NOT EXISTS pontes_conta ON pontes (conta_id, status);
CREATE INDEX IF NOT EXISTS pontes_codigo ON pontes (codigo_hash);
CREATE INDEX IF NOT EXISTS cameras_conta ON cameras (conta_id, local_id);
CREATE INDEX IF NOT EXISTS cameras_ponte ON cameras (ponte_id);
CREATE INDEX IF NOT EXISTS trechos_camera_inicio ON trechos (camera_id, inicio);
CREATE INDEX IF NOT EXISTS trechos_camera_status_fim ON trechos (camera_id, status, fim);
CREATE INDEX IF NOT EXISTS trechos_conta_status ON trechos (conta_id, status);
CREATE INDEX IF NOT EXISTS envios_expira ON envios_pendentes (expira_em);
CREATE INDEX IF NOT EXISTS permissoes_camera ON permissoes (camera_id);
CREATE INDEX IF NOT EXISTS preservacoes_camera ON preservacoes (camera_id, liberado_em, inicio, fim);
CREATE INDEX IF NOT EXISTS preservacoes_conta ON preservacoes (conta_id, criado_em);
CREATE INDEX IF NOT EXISTS exportacoes_conta ON exportacoes (conta_id, criado_em);
CREATE INDEX IF NOT EXISTS laudos_conta ON laudos (conta_id, criado_em);
CREATE INDEX IF NOT EXISTS laudos_exportacao ON laudos (exportacao_id);
CREATE INDEX IF NOT EXISTS compartilhamentos_conta ON compartilhamentos (conta_id, criado_em);
CREATE INDEX IF NOT EXISTS sessoes_link_expira ON sessoes_link (expira_em);
CREATE INDEX IF NOT EXISTS acessos_conta ON acessos_suporte (conta_id, status, expira_em);
CREATE INDEX IF NOT EXISTS acessos_solicitante ON acessos_suporte (solicitante_id, status);
CREATE INDEX IF NOT EXISTS auditoria_cadeia ON auditoria (cadeia, id);
CREATE INDEX IF NOT EXISTS auditoria_conta ON auditoria (conta_id, criado_em);
CREATE INDEX IF NOT EXISTS visualizacoes_abertas ON visualizacoes (ator_id, camera_id, tipo, encerrada_em);
CREATE INDEX IF NOT EXISTS visualizacoes_conta ON visualizacoes (conta_id, aberta_em);
CREATE INDEX IF NOT EXISTS alertas_conta ON alertas (conta_id, resolvido_em, aberto_em);
CREATE INDEX IF NOT EXISTS alertas_alvo ON alertas (tipo, alvo, resolvido_em);
CREATE INDEX IF NOT EXISTS consumo_conta ON consumo (conta_id, dia);
CREATE INDEX IF NOT EXISTS pedidos_conta ON pedidos_titular (conta_id, criado_em);
`;

const JSON_COLS = {
  revendas: ["marca"], contas: ["config"], usuarios: ["horario"], envios_pendentes: ["dados"], laudos: ["dados"], auditoria: ["detalhe"], alertas: ["detalhe"], relatorios: ["dados"],
};
const BOOL_COLS = new Set(["ativo", "ativa", "pode_exportar", "tem_movimento", "ao_vivo", "gravacoes", "baixada"]);
const lerJson = (v, padrao) => {
  if (v === null || v === undefined || v === "") return padrao;
  try {
    return JSON.parse(v);
  } catch {
    return padrao;
  }
};

function migrar(db, agora) {
  db.exec(ESQUEMA);
  db.exec(INDICES);
  db.prepare("INSERT OR IGNORE INTO plataforma (chave, valor) VALUES ('versao_esquema', '1')").run();
  // Planos e tabela de preços iniciais (só na primeira subida; depois a operação Nexor edita)
  if (!db.prepare("SELECT 1 FROM planos LIMIT 1").get()) {
    for (const d of RETENCOES) db.prepare("INSERT INTO planos (retencao_dias, nome, preservacao_horas) VALUES (?,?,?)").run(d, `${d} dias`, COMERCIAL.preservacao_horas_por_camera);
    for (const l of linhasIniciais()) db.prepare("INSERT INTO precos (id, revenda_id, retencao_dias, qualidade, modo, centavos_mes, origem, atualizado_em) VALUES (?,NULL,?,?,?,?,?,?)").run(randomUUID(), l.retencao_dias, l.qualidade, l.modo, l.centavos_mes, ORIGEM_TABELA, agora());
  }
}

export function abrirBanco(caminho, agora = () => Date.now()) {
  if (caminho !== ":memory:") mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrar(db, agora);
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
    for (const c of JSON_COLS[tabela] ?? []) if (c in o) o[c] = lerJson(o[c], c === "detalhe" || c === "horario" ? null : {});
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
    usuarioPorEmail: (email) => ler("usuarios", q("SELECT * FROM usuarios WHERE email = ? AND ativo = 1").get(String(email).toLowerCase())),
    contarUsuarios: (perfil) => q("SELECT COUNT(*) n FROM usuarios WHERE perfil = ?").get(perfil).n,
    criarSessao(token_hash, usuario_id, nivel, dias, ip = null) {
      q("DELETE FROM sessoes WHERE expira_em < ?").run(agora());
      q("INSERT INTO sessoes (token_hash, usuario_id, nivel, ip, criado_em, expira_em) VALUES (?,?,?,?,?,?)").run(token_hash, usuario_id, nivel, ip, agora(), agora() + dias * 86400_000);
    },
    sessao: (token_hash) => q("SELECT * FROM sessoes WHERE token_hash = ? AND expira_em > ?").get(token_hash, agora()),
    encerrarSessao: (token_hash) => q("DELETE FROM sessoes WHERE token_hash = ?").run(token_hash),
    encerrarSessoesDo: (usuario_id) => q("DELETE FROM sessoes WHERE usuario_id = ?").run(usuario_id),

    /**
     * Auditoria em cadeia de hashes: uma cadeia por conta e a cadeia "operacao" (ações da Nexor e das revendas fora de uma conta).
     * Só existe INSERT: nenhuma rota altera ou apaga um registro, e qualquer mexida direta no banco quebra a cadeia.
     */
    auditar({ conta_id = null, revenda_id = null, ator = null, acao, detalhe = null, ip = null }) {
      return repo.transacao(() => {
        const cadeia = conta_id ?? "operacao";
        const a = {
          cadeia, conta_id, revenda_id, ator_id: ator?.id ?? null, ator_nome: ator?.nome ?? "sistema", ator_perfil: ator?.perfil ?? "sistema", acao, detalhe, ip, criado_em: agora(),
          hash_anterior: q("SELECT hash FROM auditoria WHERE cadeia = ? ORDER BY id DESC LIMIT 1").get(cadeia)?.hash ?? GENESE,
        };
        a.hash = hashAuditoria(a);
        q("INSERT INTO auditoria (cadeia, conta_id, revenda_id, ator_id, ator_nome, ator_perfil, acao, detalhe, ip, criado_em, hash_anterior, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(a.cadeia, a.conta_id, a.revenda_id, a.ator_id, a.ator_nome, a.ator_perfil, a.acao, detalhe === null ? null : JSON.stringify(detalhe), a.ip, a.criado_em, a.hash_anterior, a.hash);
        return a;
      });
    },
  };
  return repo;
}
