/* LGPD: direitos do titular (arts. 18 e 19), bloqueio por obrigação legal e expurgo por prazo de guarda (arts. 15 e 16).
   A Nexor é operadora; a empresa cliente é a controladora e decide os pedidos. Este motor é igual nos quatro produtos:
   cada produto descreve os seus titulares (que tabelas guardam dados da pessoa e o que fazer com cada uma) e as regras
   de expurgo. Toda consulta é filtrada pela empresa (:emp); o id do titular (:id) só é aceito depois de conferido nela.

   Tratamentos de cada parte dos dados:
   - apagar      → DELETE (e os arquivos ligados, depois do commit)
   - anonimizar  → UPDATE com os campos trocados por valores neutros
   - reter       → nada é alterado: a parte fica bloqueada (registro em lgpd_bloqueios) até o fim do prazo legal
   - exportar    → só entra na exportação (ex.: dados que já somem em cascata) */

import { randomUUID } from "node:crypto";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS lgpd_pedidos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('exportacao','exclusao','expurgo')),
  titular_tipo TEXT, titular_id TEXT, referencia TEXT, autor TEXT, ip TEXT, resumo TEXT NOT NULL DEFAULT '{}', criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lgpd_pedidos_empresa ON lgpd_pedidos (empresa_id, criado_em);
CREATE TABLE IF NOT EXISTS lgpd_bloqueios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, titular_tipo TEXT NOT NULL, titular_id TEXT NOT NULL, parte TEXT NOT NULL,
  quantidade INTEGER NOT NULL, categoria TEXT NOT NULL, motivo TEXT, guardar_ate TEXT NOT NULL, pedido_id TEXT, criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lgpd_bloqueios_empresa ON lgpd_bloqueios (empresa_id, guardar_ate);
CREATE TABLE IF NOT EXISTS lgpd_expurgos (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, dia TEXT NOT NULL, resultado TEXT NOT NULL DEFAULT '{}', criado_em INTEGER NOT NULL, UNIQUE (empresa_id, dia)
);
`;

/** Campos que nunca saem na exportação (segredos, não dados da pessoa) */
const SEGREDO = /(senha|_hash|_cripto|token|segredo)/i;

/** Dia de calendário em Brasília (UTC-3) */
export const diaBR = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);

/** AAAA-MM-DD + n meses (n pode ser negativo) */
export function somarMeses(dia, n) {
  const [a, m, d] = dia.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/** "Maria da Silva" → "Ma*** da S****": identifica o pedido na auditoria sem guardar o nome inteiro */
export const mascarar = (nome) =>
  String(nome ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => (p.length <= 3 ? p : p.slice(0, 2) + "*".repeat(Math.min(p.length - 2, 6))))
    .join(" ") || "(sem nome)";

const lerJson = (v) => {
  if (typeof v !== "string" || !/^[[{]/.test(v)) return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};
const limparLinha = (linha) => Object.fromEntries(Object.entries(linha).filter(([k]) => !SEGREDO.test(k)).map(([k, v]) => [k, lerJson(v)]));

/**
 * @param {object} d
 * @param {{ db: import('node:sqlite').DatabaseSync, transacao: Function }} d.repo
 * @param {string} d.tabelaEmpresas tabela das empresas clientes (controladoras)
 * @param {Record<string, object>} d.titulares descrição de cada tipo de titular
 * @param {Array<object>} d.regras regras do expurgo automático
 * @param {Record<string, {rotulo: string, meses: number, acao: string, base_legal?: string}>} d.prazos
 * @param {{ ler: (id: string, empresa_id: string) => Promise<{nome: string, mime?: string, dados: Buffer}|null>, remover: (id: string) => Promise<void> }} [d.arquivos]
 * @param {(empresa_id: string, autor: string, acao: string, detalhe: object) => void} d.auditar
 */
export function criarLgpd({ repo, tabelaEmpresas, titulares, regras = [], prazos, arquivos, auditar, agora = () => Date.now() }) {
  const db = repo.db;
  db.exec(ESQUEMA);
  // Coluna que marca o registro do titular como bloqueado (dados guardados só por obrigação legal)
  for (const t of Object.values(titulares)) {
    if (!db.prepare(`PRAGMA table_info(${t.tabela})`).all().some((c) => c.name === "lgpd_bloqueado_ate")) db.exec(`ALTER TABLE ${t.tabela} ADD COLUMN lgpd_bloqueado_ate TEXT`);
  }

  /** Executa SQL com :id (titular) e :emp (empresa), passando só os parâmetros usados */
  const params = (sql, id, emp) => ({ ...(sql.includes(":id") ? { id } : {}), ...(sql.includes(":emp") ? { emp } : {}) });
  const todos = (sql, id, emp) => db.prepare(sql).all(params(sql, id, emp));
  const rodar = (sql, id, emp, extra = []) => {
    // Campos do UPDATE vão por posição; :id e :emp por nome
    const st = db.prepare(sql);
    return extra.length ? st.run(params(sql, id, emp), ...extra) : st.run(params(sql, id, emp));
  };

  function definicao(tipo) {
    const t = titulares[tipo];
    if (!t) throw Object.assign(new Error("Tipo de titular inválido."), { status: 400 });
    return t;
  }
  function buscar(tipo, empresa_id, id) {
    const t = definicao(tipo);
    return db.prepare(`SELECT * FROM ${t.tabela} WHERE id = ? AND ${t.tenant ?? "empresa_id"} = ?`).get(id, empresa_id) ?? null;
  }
  const registrarPedido = (p) => {
    const id = randomUUID();
    db.prepare("INSERT INTO lgpd_pedidos (id, empresa_id, tipo, titular_tipo, titular_id, referencia, autor, ip, resumo, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, p.empresa_id, p.tipo, p.titular_tipo ?? null, p.titular_id ?? null, p.referencia ?? null, p.autor ?? null, p.ip ?? null, JSON.stringify(p.resumo ?? {}), agora());
    return id;
  };

  /* ---------- Exportação (art. 18, II e V) ---------- */
  async function exportar(tipo, empresa_id, id, { autor, ip } = {}) {
    const t = definicao(tipo);
    const reg = buscar(tipo, empresa_id, id);
    if (!reg) return null;
    const dados = {};
    const idsArquivos = new Set();
    for (const p of t.partes) {
      const linhas = todos(`SELECT * FROM ${p.tabela} WHERE ${p.onde}`, id, empresa_id);
      dados[p.nome] = linhas.map(limparLinha);
      for (const l of linhas) for (const a of p.arquivos?.(l) ?? []) if (a) idsArquivos.add(a);
    }
    const anexos = [];
    for (const a of idsArquivos) {
      const arq = await arquivos?.ler(a, empresa_id).catch(() => null);
      anexos.push(arq ? { id: a, nome: arq.nome, mime: arq.mime ?? null, tamanho: arq.dados.length, base64: arq.dados.toString("base64") } : { id: a, indisponivel: true });
    }
    const nome = t.nome(reg);
    const resumo = { partes: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, v.length])), arquivos: anexos.length };
    registrarPedido({ empresa_id, tipo: "exportacao", titular_tipo: tipo, titular_id: id, referencia: mascarar(nome), autor, ip, resumo });
    auditar(empresa_id, autor ?? "sistema", "lgpd_exportacao", { titular_tipo: tipo, titular_id: id, referencia: mascarar(nome), ...resumo });
    return {
      formato: "nexor-lgpd-exportacao/1",
      gerado_em: new Date(agora()).toISOString(),
      aviso: "Dados pessoais do titular guardados por esta empresa (controladora) no sistema operado pela Nexor Consulting (operadora), conforme o art. 18 da LGPD.",
      titular: { tipo, rotulo: t.rotulo, id, nome },
      dados,
      arquivos: anexos,
    };
  }

  /* ---------- Exclusão (art. 18, VI) com bloqueio do que a lei manda guardar (art. 16, I) ---------- */
  async function excluir(tipo, empresa_id, id, { autor, ip, origem = "pedido" } = {}) {
    const t = definicao(tipo);
    const reg = buscar(tipo, empresa_id, id);
    if (!reg) return null;
    const recusa = t.podeExcluir?.(reg, { empresa_id });
    if (recusa) throw Object.assign(new Error(recusa), { status: 409 });
    const nome = t.nome(reg);
    const hoje = diaBR(agora());
    const base = t.baseRetencao?.(reg) || hoje;
    const resumo = { apagados: {}, anonimizados: {}, bloqueados: [] };
    const remover = new Set();
    const pedido_id = repo.transacao(() => {
      const pid = randomUUID();
      let bloqueadoAte = null;
      for (const p of t.partes) {
        if (p.tratamento === "exportar") continue;
        const linhas = todos(`SELECT * FROM ${p.tabela} WHERE ${p.onde}`, id, empresa_id);
        if (!linhas.length) continue;
        if (p.tratamento === "apagar") {
          for (const l of linhas) for (const a of p.arquivos?.(l) ?? []) if (a) remover.add(a);
          resumo.apagados[p.nome] = rodar(`DELETE FROM ${p.tabela} WHERE ${p.onde}`, id, empresa_id).changes;
        } else if (p.tratamento === "anonimizar") {
          for (const l of linhas) for (const a of p.arquivosRemovidos?.(l) ?? []) if (a) remover.add(a);
          const cols = Object.keys(p.campos);
          rodar(`UPDATE ${p.tabela} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE ${p.onde}`, id, empresa_id, cols.map((c) => p.campos[c]));
          resumo.anonimizados[p.nome] = linhas.length;
        } else if (p.tratamento === "reter") {
          const prazo = prazos[p.categoria];
          const ate = somarMeses(base, prazo?.meses ?? 60);
          db.prepare("INSERT INTO lgpd_bloqueios (id, empresa_id, titular_tipo, titular_id, parte, quantidade, categoria, motivo, guardar_ate, pedido_id, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), empresa_id, tipo, id, p.nome, linhas.length, p.categoria, p.motivo ?? prazo?.base_legal ?? null, ate, pid, agora());
          resumo.bloqueados.push({ parte: p.nome, quantidade: linhas.length, categoria: p.categoria, guardar_ate: ate });
          if (!bloqueadoAte || ate > bloqueadoAte) bloqueadoAte = ate;
        }
      }
      // O registro principal continua existindo quando algo ficou retido: marca até quando
      if (bloqueadoAte && db.prepare(`SELECT 1 FROM ${t.tabela} WHERE id = ?`).get(id)) db.prepare(`UPDATE ${t.tabela} SET lgpd_bloqueado_ate = ? WHERE id = ?`).run(bloqueadoAte, id);
      db.prepare("INSERT INTO lgpd_pedidos (id, empresa_id, tipo, titular_tipo, titular_id, referencia, autor, ip, resumo, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)").run(pid, empresa_id, origem === "rotina" ? "expurgo" : "exclusao", tipo, id, mascarar(nome), autor ?? null, ip ?? null, JSON.stringify(resumo), agora());
      return pid;
    });
    for (const a of remover) await arquivos?.remover(a).catch(() => {});
    if (origem !== "rotina") auditar(empresa_id, autor ?? "sistema", "lgpd_exclusao", { titular_tipo: tipo, titular_id: id, referencia: mascarar(nome), pedido: pedido_id, ...resumo });
    return { ok: true, pedido: pedido_id, ...resumo };
  }

  /* ---------- Expurgo por prazo (arts. 15 e 16) ---------- */
  /** Roda uma vez por dia por empresa (forcar = rodar de novo hoje). Devolve o que tratou por categoria. */
  async function expurgar({ forcar = false, empresa_id: soEsta } = {}) {
    const hoje = diaBR(agora());
    const empresas = soEsta ? [soEsta] : db.prepare(`SELECT id FROM ${tabelaEmpresas}`).all().map((e) => e.id);
    const saida = [];
    for (const emp of empresas) {
      if (!forcar && db.prepare("SELECT 1 FROM lgpd_expurgos WHERE empresa_id = ? AND dia = ?").get(emp, hoje)) continue;
      const resultado = {};
      for (const regra of regras) {
        const prazo = prazos[regra.categoria];
        if (!prazo || prazo.acao === "bloquear" || !(prazo.meses > 0)) continue;
        const corteDia = somarMeses(hoje, -prazo.meses);
        const corteMs = Date.parse(`${corteDia}T03:00:00Z`);
        let n = 0;
        if (regra.titular) {
          for (const id of regra.selecionar(emp, corteMs, corteDia)) {
            const r = await excluir(regra.titular, emp, id, { autor: "rotina de expurgo", origem: "rotina" }).catch(() => null);
            if (r) n++;
          }
        } else n = await regra.tratar(emp, corteMs, corteDia);
        resultado[regra.categoria] = n;
      }
      // Dados trabalhistas e fiscais: nunca apaga sozinho; só conta os bloqueios com prazo vencido para revisão humana
      resultado.bloqueios_vencidos_para_revisao = db.prepare("SELECT COUNT(*) n FROM lgpd_bloqueios WHERE empresa_id = ? AND guardar_ate < ?").get(emp, hoje).n;
      const total = Object.entries(resultado).filter(([k]) => k !== "bloqueios_vencidos_para_revisao").reduce((s, [, v]) => s + v, 0);
      db.prepare("INSERT INTO lgpd_expurgos (id, empresa_id, dia, resultado, criado_em) VALUES (?,?,?,?,?) ON CONFLICT (empresa_id, dia) DO UPDATE SET resultado = excluded.resultado, criado_em = excluded.criado_em").run(randomUUID(), emp, hoje, JSON.stringify(resultado), agora());
      registrarPedido({ empresa_id: emp, tipo: "expurgo", autor: "rotina de expurgo", resumo: { dia: hoje, total, ...resultado } });
      auditar(emp, "rotina de expurgo", "lgpd_expurgo", { dia: hoje, total, ...resultado });
      saida.push({ empresa_id: emp, dia: hoje, total, resultado });
    }
    return saida;
  }

  const lerLinha = (l) => ({ ...l, resumo: lerJson(l.resumo), resultado: lerJson(l.resultado) });
  return {
    titulares,
    prazos,
    buscar,
    exportar,
    excluir,
    expurgar,
    pedidos: (empresa_id, limite = 200) => db.prepare("SELECT * FROM lgpd_pedidos WHERE empresa_id = ? ORDER BY criado_em DESC, rowid DESC LIMIT ?").all(empresa_id, limite).map(lerLinha),
    bloqueios: (empresa_id) => db.prepare("SELECT * FROM lgpd_bloqueios WHERE empresa_id = ? ORDER BY guardar_ate").all(empresa_id),
    expurgos: (empresa_id, limite = 30) => db.prepare("SELECT * FROM lgpd_expurgos WHERE empresa_id = ? ORDER BY dia DESC LIMIT ?").all(empresa_id, limite).map(lerLinha),
  };
}

/** Lê LGPD_PRAZOS (JSON {"categoria": meses}) por cima dos padrões do produto. Categorias "bloquear" nunca viram apagar. */
export function lerPrazos(padrao, texto) {
  const prazos = structuredClone(padrao);
  if (!texto) return prazos;
  let extra;
  try {
    extra = JSON.parse(texto);
  } catch {
    throw new Error("LGPD_PRAZOS precisa ser um JSON, ex.: {\"candidato_nao_contratado\": 6}");
  }
  for (const [k, v] of Object.entries(extra ?? {})) {
    const meses = Number(typeof v === "object" ? v?.meses : v);
    if (prazos[k] && Number.isFinite(meses) && meses >= 1 && meses <= 600) prazos[k].meses = Math.round(meses);
  }
  return prazos;
}
