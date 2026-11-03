/* Conectores: como o agente alcança os sistemas da empresa.

   - HTTP: qualquer sistema com API (ERP, CRM, e-commerce, planilhas, o próprio Nexor RH ou Atende).
     As credenciais ficam no servidor (variáveis de ambiente) e NUNCA vão para a IA.
     Leitura (GET) pode ser livre; escrita (POST, PUT, PATCH, DELETE) pede aprovação do dono por padrão.
   - MCP: servidores MCP remotos (Google, Notion, HubSpot e centenas de outros). Executados pela
     Anthropic sem passar pelo nosso servidor, então NÃO dá para pedir aprovação por chamada:
     use só ferramentas de leitura ou uma lista fechada (campo "ferramentas").

   Formato do arquivo conectores.json: ver conectores.exemplo.json. */

import { readFileSync } from "node:fs";

const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const NOME = /^[a-z0-9_-]{2,40}$/;

/** Troca ${VAR} pelo valor da variável de ambiente (as credenciais nunca ficam no arquivo). */
const comSegredos = (texto, env) =>
  String(texto).replace(/\$\{([A-Z0-9_]+)\}/g, (_, v) => {
    if (env[v] === undefined) throw new Error(`variável de ambiente ${v} não definida`);
    return env[v];
  });

export function carregarConectores({ caminho, conteudo, env = process.env } = {}) {
  let bruto = { http: [], mcp: [] };
  if (conteudo) bruto = conteudo;
  else {
    try {
      bruto = JSON.parse(readFileSync(caminho, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") throw new Error(`conectores.json inválido: ${err.message}`);
    }
  }
  const http = (bruto.http ?? []).map((c) => {
    if (!NOME.test(c.nome ?? "")) throw new Error(`conector com nome inválido: ${c.nome}`);
    const base = new URL(c.base);
    if (base.protocol !== "https:" && !(env.NODE_ENV !== "production" && base.hostname === "localhost")) {
      throw new Error(`conector ${c.nome}: a base precisa ser https`);
    }
    return {
      tipo: "http",
      nome: c.nome,
      descricao: String(c.descricao ?? ""),
      base: base.href.replace(/\/$/, ""),
      cabecalhos: Object.fromEntries(Object.entries(c.cabecalhos ?? {}).map(([k, v]) => [k, comSegredos(v, env)])),
      caminhos: (c.caminhos_permitidos ?? ["/"]).map(String),
      escrita: ["aprovar", "livre", "bloqueada"].includes(c.escrita) ? c.escrita : "aprovar",
      leitura: c.leitura === "aprovar" ? "aprovar" : "livre",
      guia: String(c.guia ?? ""), // explicação da API para a IA (endpoints, campos), sem segredos
    };
  });
  const mcp = (bruto.mcp ?? []).map((c) => {
    if (!NOME.test(c.nome ?? "")) throw new Error(`servidor MCP com nome inválido: ${c.nome}`);
    if (new URL(c.url).protocol !== "https:") throw new Error(`servidor MCP ${c.nome}: a URL precisa ser https`);
    return {
      tipo: "mcp",
      nome: c.nome,
      descricao: String(c.descricao ?? ""),
      url: c.url,
      token: c.token ? comSegredos(c.token, env) : undefined,
      ferramentas: Array.isArray(c.ferramentas) ? c.ferramentas.map(String) : null,
    };
  });
  return { http, mcp };
}

/** Resumo dos sistemas para a IA (sem URLs completas, cabeçalhos nem segredos). */
export function descreverSistemas({ http, mcp }) {
  const linhas = [];
  for (const c of http) {
    linhas.push(
      `• ${c.nome} (API): ${c.descricao}. Caminhos permitidos: ${c.caminhos.join(", ")}. Leitura: ${c.leitura === "livre" ? "livre" : "pede aprovação"}. Escrita: ${{ aprovar: "pede aprovação do dono", livre: "livre", bloqueada: "bloqueada" }[c.escrita]}.${c.guia ? `\n  Guia da API: ${c.guia}` : ""}`,
    );
  }
  for (const c of mcp) linhas.push(`• ${c.nome} (MCP): ${c.descricao}. Use as ferramentas desse servidor diretamente.`);
  return linhas.length ? linhas.join("\n") : "Nenhum sistema conectado ainda.";
}

/** Monta e confere a URL. Bloqueia fuga da base (../, outro domínio) e caminhos fora da lista. */
export function montarUrl(conector, caminho, consulta) {
  const p = String(caminho ?? "");
  if (!p.startsWith("/") || p.includes("..") || p.includes("\\") || /[\r\n]/.test(p) || p.startsWith("//")) {
    throw new Error("caminho inválido");
  }
  if (!conector.caminhos.some((permitido) => permitido === "/" || p === permitido || p.startsWith(permitido.replace(/\/$/, "") + "/") || p.startsWith(permitido + "?"))) {
    throw new Error(`caminho fora da lista permitida do conector ${conector.nome}`);
  }
  const base = new URL(conector.base + "/");
  const url = new URL(conector.base + p);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname.replace(/\/$/, ""))) throw new Error("caminho inválido");
  for (const [k, v] of Object.entries(consulta ?? {})) url.searchParams.set(k, String(v));
  return url;
}

export const precisaAprovacao = (conector, metodo) => {
  if (metodo === "GET") return conector.leitura === "aprovar";
  if (conector.escrita === "bloqueada") return null; // null = proibido
  return conector.escrita === "aprovar";
};

/** Executa a chamada HTTP no sistema e devolve um texto curto para a IA. */
export async function chamarHttp(conector, { metodo, caminho, consulta, corpo }, { fetchFn = fetch, tempoLimiteMs = 20_000, tamanhoMaximo = 20_000 } = {}) {
  if (!METODOS.includes(metodo)) throw new Error("método não permitido");
  const url = montarUrl(conector, caminho, consulta);
  const r = await fetchFn(url, {
    method: metodo,
    headers: { Accept: "application/json", ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}), ...conector.cabecalhos },
    body: corpo !== undefined && metodo !== "GET" ? JSON.stringify(corpo) : undefined,
    redirect: "error", // não segue redirecionamento para fora da base
    signal: AbortSignal.timeout(tempoLimiteMs),
  });
  let texto = await r.text();
  if (texto.length > tamanhoMaximo) texto = texto.slice(0, tamanhoMaximo) + "\n[resposta cortada: peça um filtro ou uma página menor]";
  return { status: r.status, ok: r.ok, texto };
}

export { METODOS };
