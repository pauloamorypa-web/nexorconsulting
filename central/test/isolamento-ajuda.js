/* Ajuda do teste de isolamento entre empresas (test/isolamento.test.js).
   ESTE ARQUIVO É IGUAL em rh/, atende/, barber/, contabil/ e central/ (pasta test/): altere todos juntos.

   1. Lista as rotas lendo os fontes (src/**) — r.get("/api/..."), rota("GET", "/api/...") — mais as
      rotas montadas com texto variável que cada produto declara em `extras`. Cada rota listada é conferida
      no servidor de verdade: se o roteador não a reconhece (404/405 "não encontrado"), o teste falha, então
      a lista não fica desatualizada em silêncio.
   2. Sem sessão: toda rota fora da lista explícita de públicas responde 401.
   3. Empresa B com IDs da empresa A: rota com ID na URL responde 403 ou 404. Em qualquer rota, a resposta
      não pode trazer dados da A (marcadores) e os registros da A no banco não podem mudar.
      Uma resposta 400 (validação do corpo recusada antes de ler o ID) é aceita só porque o banco da A
      continua igual e nada da A volta na resposta; essas rotas aparecem no diagnóstico do teste. */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Rotas declaradas nos fontes: [{ metodo, caminho }] sem repetição */
export function rotasDosFontes(pastaSrc, extras = []) {
  const arquivos = [];
  const andar = (p) => {
    for (const n of readdirSync(p)) {
      const c = join(p, n);
      if (statSync(c).isDirectory()) andar(c);
      else if (n.endsWith(".js")) arquivos.push(c);
    }
  };
  andar(pastaSrc);
  const vistas = new Map();
  const add = (metodo, caminho) => vistas.set(`${metodo} ${caminho}`, { metodo, caminho });
  for (const a of arquivos) {
    const fonte = readFileSync(a, "utf8");
    for (const m of fonte.matchAll(/\b(?:r|roteador)\.(get|post|put|delete|patch)\(\s*"(\/[^"]*)"/g)) add(m[1].toUpperCase(), m[2]);
    for (const m of fonte.matchAll(/\brota\(\s*"(GET|POST|PUT|DELETE|PATCH)",\s*"(\/[^"]*)"/g)) add(m[1], m[2]);
  }
  for (const e of extras) add(e.metodo, e.caminho);
  return [...vistas.values()].sort((x, y) => `${x.caminho} ${x.metodo}`.localeCompare(`${y.caminho} ${y.metodo}`));
}

export const chave = (r) => `${r.metodo} ${r.caminho}`;
export const nomesParametros = (caminho) => [...caminho.matchAll(/:(\w+)/g)].map((m) => m[1]);

/** Preenche os parâmetros do caminho: fn(nome) → valor */
export const preencher = (caminho, fn) => caminho.replace(/:(\w+)/g, (_, n) => encodeURIComponent(String(fn(n))));

/** Cliente HTTP com cookies e cabeçalhos fixos (ex.: Authorization do app) */
export function cliente(url, fixos = {}) {
  const cookies = new Map();
  const extra = { ...fixos };
  async function chamar(metodo, caminho, corpo, cab = {}) {
    const r = await fetch(url + caminho, {
      method: metodo,
      redirect: "manual",
      headers: { "x-nexor": "1", ...(cookies.size ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...extra, ...cab },
      body: corpo === undefined || metodo === "GET" ? undefined : JSON.stringify(corpo),
    });
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(";");
      const i = par.indexOf("=");
      const k = par.slice(0, i);
      const v = par.slice(i + 1);
      if (v) cookies.set(k, v);
      else cookies.delete(k);
    }
    const tipo = r.headers.get("content-type") ?? "";
    const bruto = await r.text();
    let dados = bruto;
    if (tipo.includes("json")) {
      try {
        dados = JSON.parse(bruto);
      } catch {
        /* corpo vazio */
      }
    }
    return { status: r.status, dados, bruto };
  }
  return {
    chamar,
    get: (c, cab) => chamar("GET", c, undefined, cab),
    post: (c, b = {}, cab) => chamar("POST", c, b, cab),
    put: (c, b = {}, cab) => chamar("PUT", c, b, cab),
    del: (c, cab) => chamar("DELETE", c, undefined, cab),
    cabecalho: (k, v) => (extra[k] = v),
    cookies,
  };
}

/** Banco do produto, aberto só para leitura pelo teste */
export function abrirLeitura(caminho) {
  return new DatabaseSync(caminho, { readOnly: true });
}

/** Tabelas e colunas */
export function esquema(db) {
  const t = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    t[name] = db.prepare(`PRAGMA table_info("${name}")`).all().map((c) => c.name);
  }
  return t;
}

/**
 * Retrato dos dados da empresa A: linhas das tabelas com a coluna da empresa (= A) e, nas tabelas sem essa
 * coluna, as linhas que já existiam no retrato inicial (por rowid). Tabelas ignoradas: sessões e similares.
 */
export function retrato(db, { coluna, idA, ignorar = [], filtros = {}, linhasBase = null }) {
  const sch = esquema(db);
  const saida = {};
  for (const [tab, cols] of Object.entries(sch)) {
    if (ignorar.includes(tab)) continue;
    let linhas;
    // filtros[tabela]: condição SQL (com um "?" para o id da A) que acha as linhas da A numa tabela sem a coluna da empresa
    if (filtros[tab]) linhas = db.prepare(`SELECT rowid AS __r, * FROM "${tab}" WHERE ${filtros[tab]} ORDER BY rowid`).all(...Array((filtros[tab].match(/\?/g) ?? []).length).fill(idA));
    else if (cols.includes(coluna)) linhas = db.prepare(`SELECT rowid AS __r, * FROM "${tab}" WHERE "${coluna}" = ? ORDER BY rowid`).all(idA);
    else if (tab === "empresas" || tab === "barbearias") linhas = db.prepare(`SELECT rowid AS __r, * FROM "${tab}" WHERE id = ?`).all(idA);
    else {
      const base = linhasBase?.[tab];
      linhas = base ? db.prepare(`SELECT rowid AS __r, * FROM "${tab}" WHERE rowid IN (${base.map(() => "?").join(",") || "NULL"}) ORDER BY rowid`).all(...base) : db.prepare(`SELECT rowid AS __r, * FROM "${tab}" ORDER BY rowid`).all();
    }
    saida[tab] = createHash("sha256").update(JSON.stringify(linhas, (k, v) => (typeof v === "bigint" ? String(v) : v instanceof Uint8Array ? Buffer.from(v).toString("base64") : v))).digest("hex");
    if (!cols.includes(coluna) && !filtros[tab] && !linhasBase) saida[`__rowids_${tab}`] = linhas.map((l) => l.__r);
  }
  return saida;
}
export const rowidsBase = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith("__rowids_")).map(([k, v]) => [k.slice(9), v]));
export const diferencas = (antes, depois) => Object.keys(antes).filter((k) => !k.startsWith("__") && antes[k] !== depois[k]);

/** IDs da empresa A em todas as tabelas (para tentar cada um nas rotas com :id) */
export function idsDaEmpresa(db, { coluna, idA }) {
  const ids = new Map(); // id → tabela
  for (const [tab, cols] of Object.entries(esquema(db))) {
    if (!cols.includes("id")) continue;
    let linhas = [];
    if (cols.includes(coluna)) linhas = db.prepare(`SELECT id FROM "${tab}" WHERE "${coluna}" = ?`).all(idA);
    else if (tab === "empresas" || tab === "barbearias") linhas = [{ id: idA }];
    for (const l of linhas) if (l.id !== null && l.id !== undefined) ids.set(String(l.id), tab);
  }
  return ids;
}

/** A resposta traz algum dado da empresa A? */
export const vazou = (bruto, marcadores) => marcadores.filter((m) => m && String(bruto).includes(m));

/**
 * Chama uma rota como a empresa B usando IDs da empresa A e diz o que aconteceu.
 * @param {object} o
 * @param {{metodo:string, caminho:string}} o.rota
 * @param {(nome:string)=>string|undefined} o.valorFixo valor de parâmetros que não são ID (competência, ano...); undefined = é ID
 * @param {Map<string,string>} o.idsA id → tabela, da empresa A
 * @param {(nome:string)=>string[]} [o.preferidos] tabelas mais prováveis para um parâmetro (são tentadas primeiro)
 * @param {object} o.cli cliente HTTP da sessão B adequada à rota
 * @param {()=>object} o.retratoAgora retrato atual dos dados da A
 * @param {object} o.retratoBase retrato de referência (atualizado pelo chamador depois de uma falha)
 * @param {string[]} o.marcadores textos que só existem nos dados da A
 * @param {string[]} o.chavesEstrangeiras nomes de colunas *_id para montar corpo e consulta com IDs da A
 */
export async function chamarComoB({ rota, valorFixo, idsA, preferidos = () => [], cli, retratoAgora, retratoBase, marcadores, chavesEstrangeiras }) {
  const params = nomesParametros(rota.caminho);
  const deId = params.filter((p) => valorFixo(p) === undefined);
  // Um ID por tabela (primeiro os das tabelas preferidas do parâmetro); rotas sem ID na URL são chamadas uma vez
  const porTabela = new Map();
  for (const [id, tab] of idsA) if (!porTabela.has(tab)) porTabela.set(tab, id);
  const pref = deId.flatMap((p) => preferidos(p)).filter((t) => porTabela.has(t));
  const tentativas = deId.length ? [...new Set([...pref.map((t) => porTabela.get(t)), ...porTabela.values()])] : [null];
  const resultados = [];
  for (const idA of tentativas) {
    const caminho = preencher(rota.caminho, (n) => valorFixo(n) ?? idA);
    const alvoId = idA ?? [...porTabela.values()][0];
    const corpo = Object.fromEntries(chavesEstrangeiras.map((k) => [k, alvoId]));
    corpo.id = alvoId;
    const consulta = rota.metodo === "GET" ? "?" + new URLSearchParams(Object.fromEntries(chavesEstrangeiras.map((k) => [k.replace(/_id$/, ""), alvoId]))).toString() : "";
    const r = await cli.chamar(rota.metodo, caminho + consulta, rota.metodo === "GET" ? undefined : corpo);
    const depois = retratoAgora();
    resultados.push({ idA, tabela: idA ? idsA.get(idA) : null, caminho, status: r.status, vazou: vazou(r.bruto, marcadores), mudou: diferencas(retratoBase, depois), resposta: String(r.bruto).slice(0, 200) });
    if (resultados.at(-1).mudou.length) break; // já achou: o chamador refaz o retrato
  }
  return { comId: deId.length > 0, resultados };
}

/** Avalia o resultado: devolve a lista de problemas (vazia = isolado) */
export function problemas({ comId, resultados }) {
  const lista = [];
  for (const x of resultados) {
    const onde = `${x.caminho}${x.tabela ? ` (id de ${x.tabela})` : ""} → ${x.status}`;
    if (x.mudou.length) lista.push(`${onde}: alterou dados da empresa A (${x.mudou.join(", ")})`);
    if (x.vazou.length) lista.push(`${onde}: devolveu dados da empresa A (${x.vazou.join(", ")}): ${x.resposta}`);
    if (comId && ![403, 404].includes(x.status) && !(x.status === 400 && !x.mudou.length && !x.vazou.length)) lista.push(`${onde}: esperado 403 ou 404 com ID de outra empresa: ${x.resposta}`);
  }
  return lista;
}
