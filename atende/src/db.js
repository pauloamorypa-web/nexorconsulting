/* Banco de dados (SQLite nativo do Node). Todas as datas são milissegundos desde 1970 (UTC).
   Cada empresa só enxerga os próprios dados: toda consulta recebe empresa_id. */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  segmento TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  criada_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('dono','admin','atendente')),
  ativo INTEGER NOT NULL DEFAULT 1,
  online_em INTEGER,
  criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS canais (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL UNIQUE,
  waba_id TEXT,
  numero TEXT,
  nome_verificado TEXT,
  qualidade TEXT,
  token_cripto TEXT NOT NULL,
  segredo_app_cripto TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  ultimo_erro TEXT,
  criado_em INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contatos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL,
  nome TEXT,
  nome_perfil TEXT,
  email TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  campos TEXT NOT NULL DEFAULT '{}',
  etapa TEXT NOT NULL DEFAULT 'novo',
  valor_estimado INTEGER,
  pontuacao INTEGER NOT NULL DEFAULT 0,
  opt_out INTEGER NOT NULL DEFAULT 0,
  ultima_entrada_em INTEGER,
  criado_em INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL,
  UNIQUE (empresa_id, wa_id)
);

CREATE TABLE IF NOT EXISTS conversas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  contato_id TEXT NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
  canal_id TEXT REFERENCES canais(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','aguardando','resolvida')),
  modo TEXT NOT NULL DEFAULT 'ia' CHECK (modo IN ('ia','humano')),
  atribuida_a TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  prioridade TEXT NOT NULL DEFAULT 'normal',
  nao_lidas INTEGER NOT NULL DEFAULT 0,
  sentimento TEXT,
  intencao TEXT,
  resumo TEXT,
  analise TEXT,
  entradas_desde_analise INTEGER NOT NULL DEFAULT 0,
  followups INTEGER NOT NULL DEFAULT 0,
  primeira_resposta_ms INTEGER,
  resolvida_por TEXT,
  ultima_mensagem TEXT,
  ultima_msg_em INTEGER NOT NULL,
  criada_em INTEGER NOT NULL,
  resolvida_em INTEGER
);
CREATE INDEX IF NOT EXISTS conversas_lista ON conversas (empresa_id, status, ultima_msg_em DESC);
CREATE INDEX IF NOT EXISTS conversas_contato ON conversas (contato_id, criada_em DESC);

CREATE TABLE IF NOT EXISTS mensagens (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  conversa_id TEXT NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  wamid TEXT UNIQUE,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada','saida','nota')),
  autor TEXT NOT NULL CHECK (autor IN ('cliente','ia','humano','sistema','campanha')),
  autor_id TEXT,
  tipo TEXT NOT NULL,
  texto TEXT,
  conteudo TEXT NOT NULL DEFAULT '{}',
  status TEXT,
  erro TEXT,
  responde_a TEXT,
  criada_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mensagens_conversa ON mensagens (conversa_id, criada_em);

CREATE TABLE IF NOT EXISTS conhecimento (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'faq',
  ativo INTEGER NOT NULL DEFAULT 1,
  usos INTEGER NOT NULL DEFAULT 0,
  atualizado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS produtos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco_centavos INTEGER,
  estoque INTEGER,
  sku TEXT,
  categoria TEXT,
  imagem_url TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  atualizado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  contato_id TEXT REFERENCES contatos(id) ON DELETE SET NULL,
  inicio INTEGER NOT NULL,
  duracao_min INTEGER NOT NULL,
  servico TEXT NOT NULL,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado','cancelado','concluido','faltou')),
  lembrete_enviado INTEGER NOT NULL DEFAULT 0,
  criado_por TEXT NOT NULL DEFAULT 'ia',
  criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agendamentos_inicio ON agendamentos (empresa_id, inicio);

CREATE TABLE IF NOT EXISTS respostas_rapidas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  atalho TEXT NOT NULL,
  texto TEXT NOT NULL,
  UNIQUE (empresa_id, atalho)
);

CREATE TABLE IF NOT EXISTS aprendizados (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  situacao TEXT NOT NULL,
  resposta_ideal TEXT NOT NULL,
  origem TEXT,
  criado_por TEXT,
  criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS modelos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  canal_id TEXT NOT NULL REFERENCES canais(id) ON DELETE CASCADE,
  meta_id TEXT,
  nome TEXT NOT NULL,
  idioma TEXT NOT NULL,
  categoria TEXT,
  status TEXT,
  componentes TEXT NOT NULL DEFAULT '[]',
  atualizado_em INTEGER NOT NULL,
  UNIQUE (canal_id, nome, idioma)
);

CREATE TABLE IF NOT EXISTS campanhas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  canal_id TEXT NOT NULL REFERENCES canais(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  modelo_nome TEXT NOT NULL,
  idioma TEXT NOT NULL,
  variaveis TEXT NOT NULL DEFAULT '[]',
  filtro TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','agendada','enviando','concluida','cancelada')),
  agendada_para INTEGER,
  total INTEGER NOT NULL DEFAULT 0,
  enviados INTEGER NOT NULL DEFAULT 0,
  entregues INTEGER NOT NULL DEFAULT 0,
  lidos INTEGER NOT NULL DEFAULT 0,
  respondidos INTEGER NOT NULL DEFAULT 0,
  falhas INTEGER NOT NULL DEFAULT 0,
  criada_em INTEGER NOT NULL,
  concluida_em INTEGER
);

CREATE TABLE IF NOT EXISTS campanha_envios (
  id TEXT PRIMARY KEY,
  campanha_id TEXT NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  contato_id TEXT NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
  wamid TEXT,
  status TEXT NOT NULL DEFAULT 'fila',
  erro TEXT,
  UNIQUE (campanha_id, contato_id)
);
CREATE INDEX IF NOT EXISTS envios_wamid ON campanha_envios (wamid);

CREATE TABLE IF NOT EXISTS auditoria (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  usuario_id TEXT,
  acao TEXT NOT NULL,
  detalhe TEXT,
  criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS uso_ia (
  empresa_id TEXT NOT NULL,
  dia TEXT NOT NULL,
  chamadas INTEGER NOT NULL DEFAULT 0,
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_saida INTEGER NOT NULL DEFAULT 0,
  tokens_cache INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (empresa_id, dia)
);
`;

const json = (v, padrao) => {
  if (v === null || v === undefined || v === "") return padrao;
  try {
    return JSON.parse(v);
  } catch {
    return padrao;
  }
};

/* Converte linhas do banco em objetos com os campos JSON já lidos */
const ler = {
  empresa: (r) => r && { ...r, config: json(r.config, {}) },
  contato: (r) => r && { ...r, tags: json(r.tags, []), campos: json(r.campos, {}), opt_out: Boolean(r.opt_out) },
  conversa: (r) => r && { ...r, analise: json(r.analise, null) },
  mensagem: (r) => r && { ...r, conteudo: json(r.conteudo, {}) },
  modelo: (r) => r && { ...r, componentes: json(r.componentes, []) },
  campanha: (r) => r && { ...r, variaveis: json(r.variaveis, []), filtro: json(r.filtro, {}) },
  usuario: (r) => r && (({ senha_hash, ...resto }) => ({ ...resto, ativo: Boolean(resto.ativo) }))(r),
};

export const ETAPAS = ["novo", "qualificado", "proposta", "negociacao", "cliente", "perdido"];

/** Configuração padrão do agente de cada empresa. O painel edita esse objeto. */
export const CONFIG_PADRAO = {
  agente: {
    nome: "Lia",
    modo: "automatico", // automatico | copiloto | desligado
    tom: "amigavel", // amigavel | profissional | descontraido | tecnico
    emojis: "pouco", // nenhum | pouco | moderado
    sobre: "",
    instrucoes: "",
    objetivo: "atender, tirar dúvidas e converter interessados em clientes",
    saudacao: "",
    nao_fazer: "",
    agrupar_segundos: 4,
    transferir_quando: "o cliente pedir para falar com uma pessoa, fizer uma reclamação séria, pedir reembolso ou negociar condições especiais",
    assinatura: false,
  },
  horario: {
    ativo: false,
    // 0 = domingo ... 6 = sábado; [] = fechado
    dias: { 0: [], 1: ["08:00-18:00"], 2: ["08:00-18:00"], 3: ["08:00-18:00"], 4: ["08:00-18:00"], 5: ["08:00-18:00"], 6: ["08:00-12:00"] },
    fora_do_horario: "A IA continua atendendo; transferências ficam para o próximo horário de atendimento.",
  },
  agenda: {
    ativa: false,
    servicos: [{ nome: "Atendimento", duracao: 30 }],
    intervalo_min: 30,
    antecedencia_horas: 2,
    dias_adiante: 14,
    lembrete_horas: 24,
  },
  followup: {
    ativo: true,
    horas: 3,
    maximo: 1,
  },
  pagamento: {
    pix: "",
    instrucoes: "",
  },
};

const mesclar = (base, extra) => {
  if (typeof base !== "object" || base === null || Array.isArray(base)) return extra ?? base;
  const r = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) {
    r[k] = typeof v === "object" && v !== null && !Array.isArray(v) && typeof base[k] === "object" && !Array.isArray(base[k]) ? mesclar(base[k], v) : v;
  }
  return r;
};
export const configCompleta = (cfg) => mesclar(CONFIG_PADRAO, cfg ?? {});

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
  const um = (sql, ...p) => q(sql).get(...p);
  const todos = (sql, ...p) => q(sql).all(...p);
  const rodar = (sql, ...p) => q(sql).run(...p);
  const transacao = (fn) => {
    db.exec("BEGIN");
    try {
      const r = fn();
      db.exec("COMMIT");
      return r;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const agora = () => Date.now();

  const repo = {
    db,
    transacao,
    fechar: () => db.close(),

    /* ---------- Empresas e usuários ---------- */
    contarUsuarios: () => um("SELECT COUNT(*) n FROM usuarios").n,

    criarEmpresa({ nome, segmento, config = {} }) {
      const id = randomUUID();
      rodar("INSERT INTO empresas (id, nome, segmento, config, criada_em) VALUES (?,?,?,?,?)", id, nome, segmento ?? null, JSON.stringify(config), agora());
      return repo.empresa(id);
    },
    empresa: (id) => ler.empresa(um("SELECT * FROM empresas WHERE id = ?", id)),
    empresas: () => todos("SELECT * FROM empresas").map(ler.empresa),
    atualizarEmpresa(id, { nome, segmento, config }) {
      const e = repo.empresa(id);
      if (!e) return null;
      rodar(
        "UPDATE empresas SET nome = ?, segmento = ?, config = ? WHERE id = ?",
        nome ?? e.nome,
        segmento ?? e.segmento,
        JSON.stringify(config ? mesclar(e.config, config) : e.config),
        id,
      );
      return repo.empresa(id);
    },

    criarUsuario({ empresa_id, nome, email, senha_hash, papel }) {
      const id = randomUUID();
      rodar(
        "INSERT INTO usuarios (id, empresa_id, nome, email, senha_hash, papel, criado_em) VALUES (?,?,?,?,?,?,?)",
        id,
        empresa_id,
        nome,
        email.toLowerCase(),
        senha_hash,
        papel,
        agora(),
      );
      return repo.usuario(id);
    },
    usuario: (id) => ler.usuario(um("SELECT * FROM usuarios WHERE id = ?", id)),
    usuarioComSenha: (email) => um("SELECT * FROM usuarios WHERE email = ? AND ativo = 1", String(email).toLowerCase()),
    usuarios: (empresa_id) => todos("SELECT * FROM usuarios WHERE empresa_id = ? ORDER BY criado_em", empresa_id).map(ler.usuario),
    atualizarUsuario(empresa_id, id, campos) {
      const u = um("SELECT * FROM usuarios WHERE id = ? AND empresa_id = ?", id, empresa_id);
      if (!u) return null;
      rodar(
        "UPDATE usuarios SET nome = ?, papel = ?, ativo = ?, senha_hash = ? WHERE id = ?",
        campos.nome ?? u.nome,
        campos.papel ?? u.papel,
        campos.ativo === undefined ? u.ativo : campos.ativo ? 1 : 0,
        campos.senha_hash ?? u.senha_hash,
        id,
      );
      if (campos.ativo === false) rodar("DELETE FROM sessoes WHERE usuario_id = ?", id);
      return repo.usuario(id);
    },
    marcarOnline: (id) => rodar("UPDATE usuarios SET online_em = ? WHERE id = ?", agora(), id),

    criarSessao(token_hash, usuario_id, dias) {
      rodar("DELETE FROM sessoes WHERE expira_em < ?", agora());
      rodar("INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?,?,?)", token_hash, usuario_id, agora() + dias * 86400_000);
    },
    sessao(token_hash) {
      const r = um(
        "SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expira_em > ? AND u.ativo = 1",
        token_hash,
        agora(),
      );
      return ler.usuario(r);
    },
    encerrarSessao: (token_hash) => rodar("DELETE FROM sessoes WHERE token_hash = ?", token_hash),

    /* ---------- Canais (números do WhatsApp) ---------- */
    salvarCanal({ empresa_id, phone_number_id, waba_id, token_cripto, segredo_app_cripto, numero, nome_verificado, qualidade, status }) {
      const existente = um("SELECT * FROM canais WHERE phone_number_id = ?", phone_number_id);
      if (existente && existente.empresa_id !== empresa_id) throw Object.assign(new Error("Este número já está conectado a outra empresa."), { status: 409 });
      if (existente) {
        rodar(
          `UPDATE canais SET waba_id = ?, token_cripto = ?, segredo_app_cripto = ?, numero = ?, nome_verificado = ?, qualidade = ?, status = ?, ultimo_erro = NULL, atualizado_em = ? WHERE id = ?`,
          waba_id ?? existente.waba_id,
          token_cripto || existente.token_cripto,
          segredo_app_cripto ?? existente.segredo_app_cripto,
          numero ?? existente.numero,
          nome_verificado ?? existente.nome_verificado,
          qualidade ?? existente.qualidade,
          status ?? existente.status,
          agora(),
          existente.id,
        );
        return repo.canal(existente.id);
      }
      const id = randomUUID();
      rodar(
        `INSERT INTO canais (id, empresa_id, phone_number_id, waba_id, token_cripto, segredo_app_cripto, numero, nome_verificado, qualidade, status, criado_em, atualizado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        empresa_id,
        phone_number_id,
        waba_id ?? null,
        token_cripto,
        segredo_app_cripto ?? null,
        numero ?? null,
        nome_verificado ?? null,
        qualidade ?? null,
        status ?? "pendente",
        agora(),
        agora(),
      );
      return repo.canal(id);
    },
    canal: (id) => um("SELECT * FROM canais WHERE id = ?", id),
    canalPorNumero: (phone_number_id) => um("SELECT * FROM canais WHERE phone_number_id = ?", phone_number_id),
    canais: (empresa_id) => todos("SELECT * FROM canais WHERE empresa_id = ? ORDER BY criado_em", empresa_id),
    atualizarStatusCanal: (id, status, ultimo_erro = null, extra = {}) =>
      rodar(
        "UPDATE canais SET status = ?, ultimo_erro = ?, qualidade = COALESCE(?, qualidade), numero = COALESCE(?, numero), nome_verificado = COALESCE(?, nome_verificado), atualizado_em = ? WHERE id = ?",
        status,
        ultimo_erro,
        extra.qualidade ?? null,
        extra.numero ?? null,
        extra.nome_verificado ?? null,
        agora(),
        id,
      ),
    removerCanal: (empresa_id, id) => rodar("DELETE FROM canais WHERE id = ? AND empresa_id = ?", id, empresa_id).changes > 0,

    /* ---------- Contatos (CRM) ---------- */
    contatoPorWa: (empresa_id, wa_id) => ler.contato(um("SELECT * FROM contatos WHERE empresa_id = ? AND wa_id = ?", empresa_id, wa_id)),
    contato: (empresa_id, id) => ler.contato(um("SELECT * FROM contatos WHERE empresa_id = ? AND id = ?", empresa_id, id)),
    obterOuCriarContato(empresa_id, wa_id, nome_perfil) {
      let c = repo.contatoPorWa(empresa_id, wa_id);
      if (!c) {
        const id = randomUUID();
        rodar(
          "INSERT INTO contatos (id, empresa_id, wa_id, nome_perfil, criado_em, atualizado_em) VALUES (?,?,?,?,?,?)",
          id,
          empresa_id,
          wa_id,
          nome_perfil ?? null,
          agora(),
          agora(),
        );
        return { contato: repo.contato(empresa_id, id), novo: true };
      }
      if (nome_perfil && nome_perfil !== c.nome_perfil) {
        rodar("UPDATE contatos SET nome_perfil = ? WHERE id = ?", nome_perfil, c.id);
        c = { ...c, nome_perfil };
      }
      return { contato: c, novo: false };
    },
    atualizarContato(empresa_id, id, campos) {
      const c = repo.contato(empresa_id, id);
      if (!c) return null;
      const tags = campos.tags ?? c.tags;
      rodar(
        `UPDATE contatos SET nome = ?, email = ?, tags = ?, campos = ?, etapa = ?, valor_estimado = ?, pontuacao = ?, opt_out = ?, atualizado_em = ? WHERE id = ?`,
        campos.nome !== undefined ? campos.nome : c.nome,
        campos.email !== undefined ? campos.email : c.email,
        JSON.stringify([...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 30)),
        JSON.stringify(campos.campos ? { ...c.campos, ...campos.campos } : c.campos),
        campos.etapa && ETAPAS.includes(campos.etapa) ? campos.etapa : c.etapa,
        campos.valor_estimado !== undefined ? campos.valor_estimado : c.valor_estimado,
        campos.pontuacao !== undefined ? Math.max(0, Math.min(100, Math.round(campos.pontuacao))) : c.pontuacao,
        campos.opt_out !== undefined ? (campos.opt_out ? 1 : 0) : c.opt_out ? 1 : 0,
        agora(),
        id,
      );
      return repo.contato(empresa_id, id);
    },
    registrarEntradaContato: (id, quando) => rodar("UPDATE contatos SET ultima_entrada_em = ?, atualizado_em = ? WHERE id = ?", quando, agora(), id),
    removerContato: (empresa_id, id) => rodar("DELETE FROM contatos WHERE empresa_id = ? AND id = ?", empresa_id, id).changes > 0,
    contatos(empresa_id, { busca, tag, etapa, limite = 100, deslocamento = 0 } = {}) {
      const cond = ["empresa_id = ?"];
      const p = [empresa_id];
      if (busca) {
        cond.push("(nome LIKE ? OR nome_perfil LIKE ? OR wa_id LIKE ? OR email LIKE ?)");
        const b = `%${busca}%`;
        p.push(b, b, b, b);
      }
      if (tag) {
        cond.push("EXISTS (SELECT 1 FROM json_each(contatos.tags) WHERE value = ?)");
        p.push(String(tag).toLowerCase());
      }
      if (etapa) {
        cond.push("etapa = ?");
        p.push(etapa);
      }
      const where = cond.join(" AND ");
      const total = um(`SELECT COUNT(*) n FROM contatos WHERE ${where}`, ...p).n;
      const itens = todos(`SELECT * FROM contatos WHERE ${where} ORDER BY atualizado_em DESC LIMIT ? OFFSET ?`, ...p, limite, deslocamento).map(ler.contato);
      return { total, itens };
    },
    /** Contatos para campanhas: respeita quem pediu para não receber */
    contatosParaCampanha(empresa_id, { tags = [], etapas = [] } = {}) {
      const cond = ["empresa_id = ?", "opt_out = 0"];
      const p = [empresa_id];
      if (tags.length) {
        cond.push(`EXISTS (SELECT 1 FROM json_each(contatos.tags) WHERE value IN (${tags.map(() => "?").join(",")}))`);
        p.push(...tags.map((t) => t.toLowerCase()));
      }
      if (etapas.length) {
        cond.push(`etapa IN (${etapas.map(() => "?").join(",")})`);
        p.push(...etapas);
      }
      return todos(`SELECT * FROM contatos WHERE ${cond.join(" AND ")}`, ...p).map(ler.contato);
    },
    tags: (empresa_id) =>
      todos(
        "SELECT value tag, COUNT(*) n FROM contatos, json_each(contatos.tags) WHERE empresa_id = ? GROUP BY value ORDER BY n DESC LIMIT 100",
        empresa_id,
      ),
    funil: (empresa_id) =>
      todos("SELECT etapa, COUNT(*) n, COALESCE(SUM(valor_estimado),0) valor FROM contatos WHERE empresa_id = ? GROUP BY etapa", empresa_id),

    /* ---------- Conversas ---------- */
    conversa: (empresa_id, id) => ler.conversa(um("SELECT * FROM conversas WHERE empresa_id = ? AND id = ?", empresa_id, id)),
    conversaAtiva: (empresa_id, contato_id) =>
      ler.conversa(um("SELECT * FROM conversas WHERE empresa_id = ? AND contato_id = ? AND status != 'resolvida' ORDER BY criada_em DESC LIMIT 1", empresa_id, contato_id)),
    criarConversa({ empresa_id, contato_id, canal_id, modo = "ia" }) {
      const id = randomUUID();
      const t = agora();
      rodar(
        "INSERT INTO conversas (id, empresa_id, contato_id, canal_id, modo, ultima_msg_em, criada_em) VALUES (?,?,?,?,?,?,?)",
        id,
        empresa_id,
        contato_id,
        canal_id ?? null,
        modo,
        t,
        t,
      );
      return repo.conversa(empresa_id, id);
    },
    atualizarConversa(empresa_id, id, campos) {
      const permitidos = [
        "status",
        "modo",
        "atribuida_a",
        "prioridade",
        "nao_lidas",
        "sentimento",
        "intencao",
        "resumo",
        "analise",
        "entradas_desde_analise",
        "followups",
        "primeira_resposta_ms",
        "resolvida_por",
        "resolvida_em",
        "canal_id",
      ];
      const sets = [];
      const p = [];
      for (const k of permitidos) {
        if (campos[k] === undefined) continue;
        sets.push(`${k} = ?`);
        p.push(k === "analise" ? JSON.stringify(campos[k]) : campos[k]);
      }
      if (!sets.length) return repo.conversa(empresa_id, id);
      rodar(`UPDATE conversas SET ${sets.join(", ")} WHERE id = ? AND empresa_id = ?`, ...p, id, empresa_id);
      return repo.conversa(empresa_id, id);
    },
    conversas(empresa_id, { filtro = "abertas", usuario_id, busca, limite = 60, antes, id } = {}) {
      const cond = ["v.empresa_id = ?"];
      const p = [empresa_id];
      if (id) {
        cond.push("v.id = ?");
        p.push(id);
      }
      if (filtro === "abertas") cond.push("v.status != 'resolvida'");
      if (filtro === "ia") cond.push("v.status != 'resolvida' AND v.modo = 'ia'");
      if (filtro === "humano") cond.push("v.status != 'resolvida' AND v.modo = 'humano'");
      if (filtro === "aguardando") cond.push("v.status = 'aguardando'");
      if (filtro === "minhas") {
        cond.push("v.status != 'resolvida' AND v.atribuida_a = ?");
        p.push(usuario_id);
      }
      if (filtro === "resolvidas") cond.push("v.status = 'resolvida'");
      if (busca) {
        cond.push("(c.nome LIKE ? OR c.nome_perfil LIKE ? OR c.wa_id LIKE ? OR v.ultima_mensagem LIKE ?)");
        const b = `%${busca}%`;
        p.push(b, b, b, b);
      }
      if (antes) {
        cond.push("v.ultima_msg_em < ?");
        p.push(Number(antes));
      }
      return todos(
        `SELECT v.*, c.nome contato_nome, c.nome_perfil contato_nome_perfil, c.wa_id contato_wa_id, c.etapa contato_etapa, c.pontuacao contato_pontuacao, c.tags contato_tags, c.ultima_entrada_em contato_ultima_entrada_em
         FROM conversas v JOIN contatos c ON c.id = v.contato_id WHERE ${cond.join(" AND ")}
         ORDER BY CASE v.status WHEN 'aguardando' THEN 0 ELSE 1 END, v.ultima_msg_em DESC LIMIT ?`,
        ...p,
        limite,
      ).map((r) => ({ ...ler.conversa(r), contato_tags: json(r.contato_tags, []) }));
    },
    conversaDetalhada: (empresa_id, id) => repo.conversas(empresa_id, { filtro: "todas", id, limite: 1 })[0] ?? null,
    conversasDoContato: (empresa_id, contato_id) =>
      todos("SELECT id, status, resumo, criada_em, resolvida_em FROM conversas WHERE empresa_id = ? AND contato_id = ? ORDER BY criada_em DESC LIMIT 20", empresa_id, contato_id),
    contagemConversas: (empresa_id, usuario_id) =>
      um(
        `SELECT
          SUM(status != 'resolvida') abertas,
          SUM(status != 'resolvida' AND modo = 'ia') ia,
          SUM(status != 'resolvida' AND modo = 'humano') humano,
          SUM(status = 'aguardando') aguardando,
          SUM(status != 'resolvida' AND atribuida_a = ?) minhas,
          SUM(status != 'resolvida' AND nao_lidas > 0) nao_lidas
         FROM conversas WHERE empresa_id = ?`,
        usuario_id ?? "",
        empresa_id,
      ),

    /* ---------- Mensagens ---------- */
    salvarMensagem(m) {
      const id = m.id ?? randomUUID();
      const t = m.criada_em ?? agora();
      rodar(
        `INSERT INTO mensagens (id, empresa_id, conversa_id, wamid, direcao, autor, autor_id, tipo, texto, conteudo, status, erro, responde_a, criada_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        m.empresa_id,
        m.conversa_id,
        m.wamid ?? null,
        m.direcao,
        m.autor,
        m.autor_id ?? null,
        m.tipo,
        m.texto ?? null,
        JSON.stringify(m.conteudo ?? {}),
        m.status ?? null,
        m.erro ?? null,
        m.responde_a ?? null,
        t,
      );
      if (m.direcao !== "nota") {
        const resumo = (m.texto || `[${m.tipo}]`).slice(0, 160);
        rodar(
          `UPDATE conversas SET ultima_mensagem = ?, ultima_msg_em = ?, nao_lidas = nao_lidas + ?, entradas_desde_analise = entradas_desde_analise + ? WHERE id = ?`,
          resumo,
          t,
          m.direcao === "entrada" ? 1 : 0,
          m.direcao === "entrada" ? 1 : 0,
          m.conversa_id,
        );
      }
      return repo.mensagem(id);
    },
    mensagem: (id) => ler.mensagem(um("SELECT * FROM mensagens WHERE id = ?", id)),
    mensagemPorWamid: (wamid) => ler.mensagem(um("SELECT * FROM mensagens WHERE wamid = ?", wamid)),
    existeWamid: (wamid) => Boolean(um("SELECT 1 x FROM mensagens WHERE wamid = ?", wamid)),
    definirWamid: (id, wamid, status = "enviada") => rodar("UPDATE mensagens SET wamid = ?, status = ?, erro = NULL WHERE id = ?", wamid, status, id),
    atualizarStatusMensagem(wamid, status, erro = null) {
      const ordem = { pendente: 0, enviada: 1, entregue: 2, lida: 3, falhou: 4 };
      const m = repo.mensagemPorWamid(wamid);
      if (!m) return null;
      // Status chegam fora de ordem: nunca volta de "lida" para "entregue"
      if (status !== "falhou" && (ordem[m.status] ?? 0) >= ordem[status]) return m;
      rodar("UPDATE mensagens SET status = ?, erro = ? WHERE id = ?", status, erro, m.id);
      return { ...m, status, erro };
    },
    falhaMensagem: (id, erro) => rodar("UPDATE mensagens SET status = 'falhou', erro = ? WHERE id = ?", erro, id),
    mensagens: (conversa_id, { limite = 200 } = {}) =>
      todos("SELECT * FROM (SELECT * FROM mensagens WHERE conversa_id = ? ORDER BY criada_em DESC LIMIT ?) ORDER BY criada_em", conversa_id, limite).map(ler.mensagem),
    historicoDoContato: (empresa_id, contato_id, limite) =>
      todos(
        `SELECT * FROM (SELECT m.* FROM mensagens m JOIN conversas v ON v.id = m.conversa_id
          WHERE v.empresa_id = ? AND v.contato_id = ? AND m.direcao != 'nota' ORDER BY m.criada_em DESC LIMIT ?) ORDER BY criada_em`,
        empresa_id,
        contato_id,
        limite,
      ).map(ler.mensagem),
    marcarLidas: (empresa_id, conversa_id) => rodar("UPDATE conversas SET nao_lidas = 0 WHERE id = ? AND empresa_id = ?", conversa_id, empresa_id),

    /* ---------- Base de conhecimento ---------- */
    conhecimento: (empresa_id, apenasAtivos = false) =>
      todos(`SELECT * FROM conhecimento WHERE empresa_id = ? ${apenasAtivos ? "AND ativo = 1" : ""} ORDER BY atualizado_em DESC`, empresa_id),
    salvarConhecimento(empresa_id, { id, titulo, conteudo, tipo = "faq", ativo = true }) {
      if (id && um("SELECT 1 x FROM conhecimento WHERE id = ? AND empresa_id = ?", id, empresa_id)) {
        rodar("UPDATE conhecimento SET titulo = ?, conteudo = ?, tipo = ?, ativo = ?, atualizado_em = ? WHERE id = ?", titulo, conteudo, tipo, ativo ? 1 : 0, agora(), id);
        return um("SELECT * FROM conhecimento WHERE id = ?", id);
      }
      const novo = randomUUID();
      rodar("INSERT INTO conhecimento (id, empresa_id, titulo, conteudo, tipo, ativo, atualizado_em) VALUES (?,?,?,?,?,?,?)", novo, empresa_id, titulo, conteudo, tipo, ativo ? 1 : 0, agora());
      return um("SELECT * FROM conhecimento WHERE id = ?", novo);
    },
    removerConhecimento: (empresa_id, id) => rodar("DELETE FROM conhecimento WHERE id = ? AND empresa_id = ?", id, empresa_id).changes > 0,
    contarUsoConhecimento: (ids) => {
      for (const id of ids) rodar("UPDATE conhecimento SET usos = usos + 1 WHERE id = ?", id);
    },

    /* ---------- Catálogo ---------- */
    produtos: (empresa_id, apenasAtivos = false) =>
      todos(`SELECT * FROM produtos WHERE empresa_id = ? ${apenasAtivos ? "AND ativo = 1" : ""} ORDER BY nome`, empresa_id),
    salvarProduto(empresa_id, p) {
      const valores = [p.nome, p.descricao ?? null, p.preco_centavos ?? null, p.estoque ?? null, p.sku ?? null, p.categoria ?? null, p.imagem_url ?? null, p.ativo === false ? 0 : 1, agora()];
      if (p.id && um("SELECT 1 x FROM produtos WHERE id = ? AND empresa_id = ?", p.id, empresa_id)) {
        rodar("UPDATE produtos SET nome=?, descricao=?, preco_centavos=?, estoque=?, sku=?, categoria=?, imagem_url=?, ativo=?, atualizado_em=? WHERE id = ?", ...valores, p.id);
        return um("SELECT * FROM produtos WHERE id = ?", p.id);
      }
      const id = randomUUID();
      rodar("INSERT INTO produtos (id, empresa_id, nome, descricao, preco_centavos, estoque, sku, categoria, imagem_url, ativo, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)", id, empresa_id, ...valores);
      return um("SELECT * FROM produtos WHERE id = ?", id);
    },
    removerProduto: (empresa_id, id) => rodar("DELETE FROM produtos WHERE id = ? AND empresa_id = ?", id, empresa_id).changes > 0,

    /* ---------- Agenda ---------- */
    agendamentosEntre: (empresa_id, de, ate) =>
      todos(
        `SELECT a.*, c.nome contato_nome, c.nome_perfil contato_nome_perfil, c.wa_id contato_wa_id FROM agendamentos a LEFT JOIN contatos c ON c.id = a.contato_id
         WHERE a.empresa_id = ? AND a.inicio >= ? AND a.inicio < ? ORDER BY a.inicio`,
        empresa_id,
        de,
        ate,
      ),
    agendamentosDoContato: (empresa_id, contato_id) =>
      todos("SELECT * FROM agendamentos WHERE empresa_id = ? AND contato_id = ? AND status = 'confirmado' AND inicio > ? ORDER BY inicio", empresa_id, contato_id, agora()),
    agendamento: (empresa_id, id) => um("SELECT * FROM agendamentos WHERE empresa_id = ? AND id = ?", empresa_id, id),
    criarAgendamento(a) {
      const id = randomUUID();
      rodar(
        "INSERT INTO agendamentos (id, empresa_id, contato_id, inicio, duracao_min, servico, observacoes, criado_por, criado_em) VALUES (?,?,?,?,?,?,?,?,?)",
        id,
        a.empresa_id,
        a.contato_id ?? null,
        a.inicio,
        a.duracao_min,
        a.servico,
        a.observacoes ?? null,
        a.criado_por ?? "ia",
        agora(),
      );
      return repo.agendamento(a.empresa_id, id);
    },
    atualizarAgendamento: (empresa_id, id, status) => rodar("UPDATE agendamentos SET status = ? WHERE id = ? AND empresa_id = ?", status, id, empresa_id).changes > 0,
    agendamentosParaLembrete: (ate) =>
      todos("SELECT * FROM agendamentos WHERE status = 'confirmado' AND lembrete_enviado = 0 AND inicio > ? AND inicio <= ?", agora(), ate),
    marcarLembrete: (id) => rodar("UPDATE agendamentos SET lembrete_enviado = 1 WHERE id = ?", id),

    /* ---------- Respostas rápidas ---------- */
    respostasRapidas: (empresa_id) => todos("SELECT * FROM respostas_rapidas WHERE empresa_id = ? ORDER BY atalho", empresa_id),
    salvarRespostaRapida(empresa_id, { atalho, texto }) {
      const a = String(atalho).replace(/^\//, "").toLowerCase();
      rodar(
        "INSERT INTO respostas_rapidas (id, empresa_id, atalho, texto) VALUES (?,?,?,?) ON CONFLICT (empresa_id, atalho) DO UPDATE SET texto = excluded.texto",
        randomUUID(),
        empresa_id,
        a,
        texto,
      );
      return um("SELECT * FROM respostas_rapidas WHERE empresa_id = ? AND atalho = ?", empresa_id, a);
    },
    removerRespostaRapida: (empresa_id, id) => rodar("DELETE FROM respostas_rapidas WHERE id = ? AND empresa_id = ?", id, empresa_id).changes > 0,

    /* ---------- Aprendizados (correções da equipe) ---------- */
    aprendizados: (empresa_id, limite = 200) => todos("SELECT * FROM aprendizados WHERE empresa_id = ? ORDER BY criado_em DESC LIMIT ?", empresa_id, limite),
    salvarAprendizado(empresa_id, { situacao, resposta_ideal, origem, criado_por }) {
      const id = randomUUID();
      rodar("INSERT INTO aprendizados (id, empresa_id, situacao, resposta_ideal, origem, criado_por, criado_em) VALUES (?,?,?,?,?,?,?)", id, empresa_id, situacao, resposta_ideal, origem ?? null, criado_por ?? null, agora());
      return um("SELECT * FROM aprendizados WHERE id = ?", id);
    },
    removerAprendizado: (empresa_id, id) => rodar("DELETE FROM aprendizados WHERE id = ? AND empresa_id = ?", id, empresa_id).changes > 0,

    /* ---------- Modelos de mensagem (templates) ---------- */
    modelos: (empresa_id) => todos("SELECT * FROM modelos WHERE empresa_id = ? ORDER BY nome", empresa_id).map(ler.modelo),
    modelo: (empresa_id, nome, idioma) => ler.modelo(um("SELECT * FROM modelos WHERE empresa_id = ? AND nome = ? AND idioma = ?", empresa_id, nome, idioma)),
    sincronizarModelos(empresa_id, canal_id, lista) {
      transacao(() => {
        rodar("DELETE FROM modelos WHERE canal_id = ?", canal_id);
        for (const t of lista) {
          rodar(
            "INSERT INTO modelos (id, empresa_id, canal_id, meta_id, nome, idioma, categoria, status, componentes, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?)",
            randomUUID(),
            empresa_id,
            canal_id,
            t.id ?? null,
            t.name,
            t.language,
            t.category ?? null,
            t.status ?? null,
            JSON.stringify(t.components ?? []),
            agora(),
          );
        }
      });
    },
    atualizarStatusModelo: (meta_id, status) => rodar("UPDATE modelos SET status = ?, atualizado_em = ? WHERE meta_id = ?", status, agora(), meta_id),

    /* ---------- Campanhas ---------- */
    campanhas: (empresa_id) => todos("SELECT * FROM campanhas WHERE empresa_id = ? ORDER BY criada_em DESC", empresa_id).map(ler.campanha),
    campanha: (empresa_id, id) => ler.campanha(um("SELECT * FROM campanhas WHERE empresa_id = ? AND id = ?", empresa_id, id)),
    criarCampanha(c) {
      const id = randomUUID();
      rodar(
        "INSERT INTO campanhas (id, empresa_id, canal_id, nome, modelo_nome, idioma, variaveis, filtro, status, agendada_para, criada_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        id,
        c.empresa_id,
        c.canal_id,
        c.nome,
        c.modelo_nome,
        c.idioma,
        JSON.stringify(c.variaveis ?? []),
        JSON.stringify(c.filtro ?? {}),
        c.status ?? "rascunho",
        c.agendada_para ?? null,
        agora(),
      );
      return repo.campanha(c.empresa_id, id);
    },
    statusCampanha: (id, status, extra = {}) =>
      rodar("UPDATE campanhas SET status = ?, total = COALESCE(?, total), concluida_em = COALESCE(?, concluida_em) WHERE id = ?", status, extra.total ?? null, extra.concluida_em ?? null, id),
    campanhasProntas: () => todos("SELECT * FROM campanhas WHERE status = 'agendada' AND (agendada_para IS NULL OR agendada_para <= ?)", agora()).map(ler.campanha),
    campanhasEnviando: () => todos("SELECT * FROM campanhas WHERE status = 'enviando'").map(ler.campanha),
    adicionarEnvios(campanha_id, contato_ids) {
      transacao(() => {
        for (const cid of contato_ids) rodar("INSERT OR IGNORE INTO campanha_envios (id, campanha_id, contato_id) VALUES (?,?,?)", randomUUID(), campanha_id, cid);
      });
    },
    proximosEnvios: (campanha_id, limite) =>
      todos("SELECT * FROM campanha_envios WHERE campanha_id = ? AND status = 'fila' LIMIT ?", campanha_id, limite),
    marcarEnvio(id, status, { wamid, erro } = {}) {
      rodar("UPDATE campanha_envios SET status = ?, wamid = COALESCE(?, wamid), erro = ? WHERE id = ?", status, wamid ?? null, erro ?? null, id);
    },
    envioPorWamid: (wamid) => um("SELECT * FROM campanha_envios WHERE wamid = ?", wamid),
    recontarCampanha(id) {
      const r = um(
        `SELECT COUNT(*) total,
          SUM(status IN ('enviado','entregue','lido','respondido')) enviados,
          SUM(status IN ('entregue','lido','respondido')) entregues,
          SUM(status IN ('lido','respondido')) lidos,
          SUM(status = 'respondido') respondidos,
          SUM(status = 'falhou') falhas,
          SUM(status = 'fila') fila
         FROM campanha_envios WHERE campanha_id = ?`,
        id,
      );
      rodar(
        "UPDATE campanhas SET total = ?, enviados = ?, entregues = ?, lidos = ?, respondidos = ?, falhas = ? WHERE id = ?",
        r.total,
        r.enviados ?? 0,
        r.entregues ?? 0,
        r.lidos ?? 0,
        r.respondidos ?? 0,
        r.falhas ?? 0,
        id,
      );
      return r;
    },
    envioRecenteDoContato: (contato_id, desde) =>
      um(
        `SELECT e.* FROM campanha_envios e JOIN campanhas c ON c.id = e.campanha_id
         WHERE e.contato_id = ? AND e.status IN ('enviado','entregue','lido') AND c.criada_em > ? ORDER BY c.criada_em DESC LIMIT 1`,
        contato_id,
        desde,
      ),

    /* ---------- Follow-up automático ---------- */
    conversasParaFollowup: (limiteTempo) =>
      todos(
        `SELECT v.* FROM conversas v WHERE v.status = 'aberta' AND v.modo = 'ia' AND v.ultima_msg_em < ?
          AND (SELECT autor FROM mensagens m WHERE m.conversa_id = v.id AND m.direcao != 'nota' ORDER BY m.criada_em DESC LIMIT 1) = 'ia'`,
        limiteTempo,
      ).map(ler.conversa),

    /* ---------- Auditoria e uso ---------- */
    auditar: (empresa_id, usuario_id, acao, detalhe) =>
      rodar("INSERT INTO auditoria (id, empresa_id, usuario_id, acao, detalhe, criado_em) VALUES (?,?,?,?,?,?)", randomUUID(), empresa_id, usuario_id ?? null, acao, detalhe ? JSON.stringify(detalhe) : null, agora()),
    auditoriaRecente: (empresa_id, limite = 100) =>
      todos("SELECT a.*, u.nome usuario_nome FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE a.empresa_id = ? ORDER BY a.criado_em DESC LIMIT ?", empresa_id, limite),
    registrarUsoIA(empresa_id, uso) {
      const dia = new Date().toISOString().slice(0, 10);
      rodar(
        `INSERT INTO uso_ia (empresa_id, dia, chamadas, tokens_entrada, tokens_saida, tokens_cache) VALUES (?,?,1,?,?,?)
         ON CONFLICT (empresa_id, dia) DO UPDATE SET chamadas = chamadas + 1, tokens_entrada = tokens_entrada + excluded.tokens_entrada,
         tokens_saida = tokens_saida + excluded.tokens_saida, tokens_cache = tokens_cache + excluded.tokens_cache`,
        empresa_id,
        dia,
        uso?.input_tokens ?? 0,
        uso?.output_tokens ?? 0,
        uso?.cache_read_input_tokens ?? 0,
      );
    },
    usoIA: (empresa_id, desdeDia) => todos("SELECT * FROM uso_ia WHERE empresa_id = ? AND dia >= ? ORDER BY dia", empresa_id, desdeDia),

    /* ---------- Métricas ---------- */
    metricas(empresa_id, desde) {
      const conv = um(
        `SELECT COUNT(*) total,
          SUM(status = 'resolvida') resolvidas,
          SUM(resolvida_por = 'ia') resolvidas_ia,
          SUM(modo = 'humano') com_humano,
          AVG(primeira_resposta_ms) primeira_resposta_ms,
          SUM(sentimento = 'positivo') positivo, SUM(sentimento = 'neutro') neutro, SUM(sentimento = 'negativo') negativo
         FROM conversas WHERE empresa_id = ? AND criada_em >= ?`,
        empresa_id,
        desde,
      );
      const msgs = um(
        `SELECT SUM(direcao = 'entrada') recebidas, SUM(autor = 'ia') pela_ia, SUM(autor = 'humano') por_humanos, SUM(autor = 'campanha') de_campanha
         FROM mensagens WHERE empresa_id = ? AND criada_em >= ?`,
        empresa_id,
        desde,
      );
      const porDia = todos(
        `SELECT strftime('%Y-%m-%d', criada_em / 1000, 'unixepoch', '-3 hours') dia, SUM(direcao = 'entrada') recebidas, SUM(autor = 'ia') ia, SUM(autor = 'humano') humano
         FROM mensagens WHERE empresa_id = ? AND criada_em >= ? GROUP BY dia ORDER BY dia`,
        empresa_id,
        desde,
      );
      const porHora = todos(
        `SELECT CAST(strftime('%H', criada_em / 1000, 'unixepoch', '-3 hours') AS INTEGER) hora, COUNT(*) n
         FROM mensagens WHERE empresa_id = ? AND criada_em >= ? AND direcao = 'entrada' GROUP BY hora`,
        empresa_id,
        desde,
      );
      const intencoes = todos(
        "SELECT intencao, COUNT(*) n FROM conversas WHERE empresa_id = ? AND criada_em >= ? AND intencao IS NOT NULL GROUP BY intencao ORDER BY n DESC LIMIT 8",
        empresa_id,
        desde,
      );
      const novosContatos = um("SELECT COUNT(*) n FROM contatos WHERE empresa_id = ? AND criado_em >= ?", empresa_id, desde).n;
      const quentes = todos(
        "SELECT id, nome, nome_perfil, wa_id, pontuacao, etapa FROM contatos WHERE empresa_id = ? AND pontuacao >= 70 AND etapa NOT IN ('cliente','perdido') ORDER BY pontuacao DESC, atualizado_em DESC LIMIT 8",
        empresa_id,
      );
      const agendamentos = um("SELECT COUNT(*) n FROM agendamentos WHERE empresa_id = ? AND criado_em >= ? AND status != 'cancelado'", empresa_id, desde).n;
      const conhecimentoTop = todos("SELECT titulo, usos FROM conhecimento WHERE empresa_id = ? AND usos > 0 ORDER BY usos DESC LIMIT 5", empresa_id);
      return { conversas: conv, mensagens: msgs, porDia, porHora, intencoes, novosContatos, quentes, agendamentos, conhecimentoTop, funil: repo.funil(empresa_id) };
    },
  };
  return repo;
}
