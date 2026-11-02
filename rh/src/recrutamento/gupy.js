/* Conector da API da Gupy: traz as vagas publicadas e as candidaturas para o funil do Nexor RH.
   Endereço e formato configuráveis. Confira os caminhos com a documentação da API da sua conta Gupy
   (Configurações → Integrações → API): o padrão usado aqui é GET {base}/jobs e GET {base}/jobs/{id}/applications,
   com o token no cabeçalho "Authorization: Bearer". */

import { MAPEAMENTOS, mapear } from "./importacao.js";

export const GUPY_PADRAO = { base: "https://api.gupy.io/api/v1", vagas: "/jobs?status=published&perPage=100&page={pagina}", candidaturas: "/jobs/{vaga}/applications?perPage=100&page={pagina}" };

const lista = (r) => (Array.isArray(r) ? r : (r?.results ?? r?.data ?? r?.items ?? []));

async function obter(fetchFn, url, token) {
  // Sem seguir redirecionamentos: o token não pode ser levado para outro endereço
  const r = await fetchFn(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, redirect: "error" });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error("A Gupy recusou o token. Gere um novo token de API na Gupy e salve de novo."), { status: 400 });
  if (!r.ok) throw Object.assign(new Error(`A Gupy respondeu HTTP ${r.status} em ${new URL(url).pathname}. Confira o endereço da API nas integrações.`), { status: 502 });
  return r.json();
}

async function paginado(fetchFn, montar, token, limite = 20) {
  const itens = [];
  for (let pagina = 1; pagina <= limite; pagina++) {
    const r = await obter(fetchFn, montar(pagina), token);
    const l = lista(r);
    itens.push(...l);
    const total = r?.totalPages ?? r?.total_pages;
    if (!l.length || (total && pagina >= total) || l.length < 100) break;
  }
  return itens;
}

/**
 * Busca vagas e candidaturas.
 * @returns {Promise<Array<{ vaga: {codigo, titulo, cidade, estado, descricao}, candidatos: object[] }>>}
 */
export async function buscarGupy({ token, config = {}, fetchFn = fetch }) {
  const c = { ...GUPY_PADRAO, ...config };
  const base = c.base.replace(/\/$/, "");
  const vagas = await paginado(fetchFn, (p) => base + c.vagas.replace("{pagina}", p), token);
  const r = [];
  for (const v of vagas) {
    const id = v.id ?? v.jobId;
    if (id === undefined) continue;
    const cands = await paginado(fetchFn, (p) => base + c.candidaturas.replace("{vaga}", encodeURIComponent(id)).replace("{pagina}", p), token);
    r.push({
      vaga: { codigo: String(id), titulo: v.name ?? v.title ?? `Vaga ${id}`, cidade: v.addressCity ?? v.city ?? null, estado: v.addressState ?? v.state ?? null, descricao: typeof v.description === "string" ? v.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000) : null },
      candidatos: cands.map((a) => ({ ...mapear(a, MAPEAMENTOS.gupy), vaga_codigo: String(id) })),
    });
  }
  return r;
}
