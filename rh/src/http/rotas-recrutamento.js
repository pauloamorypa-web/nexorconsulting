/* Integrações de recrutamento: divulgação (Google Vagas, feed XML para agregadores, links com origem para
   LinkedIn, Indeed, InfoJobs, Catho, Vagas.com…), entrada de candidatos por webhook, API da Gupy e planilha CSV,
   e as páginas públicas de cada vaga. */

import { z } from "zod";
import { gerarToken, iguais, sha256 } from "../seguranca.js";
import { feedXml, linkVaga, paginaVaga, sitemapVagas } from "../recrutamento/publicacao.js";
import { candidatosDoCsv, FONTES, gravarCandidato, mapear, MAPEAMENTOS } from "../recrutamento/importacao.js";
import { buscarGupy, GUPY_PADRAO } from "../recrutamento/gupy.js";
import { op, t, validar } from "./validacao.js";
import { falha } from "./roteador.js";

const RH = { papeis: ["admin", "rh"] };

/* Onde divulgar cada vaga: o link leva a origem, para saber de onde veio cada candidato */
export const CANAIS = [
  ["linkedin", "LinkedIn", (u, v) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`],
  ["whatsapp", "WhatsApp", (u, v) => `https://wa.me/?text=${encodeURIComponent(`Vaga: ${v.titulo}. Candidate-se: ${u}`)}`],
  ["facebook", "Facebook", (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`],
  ["indeed", "Indeed", null],
  ["infojobs", "InfoJobs", null],
  ["catho", "Catho", null],
  ["vagas", "Vagas.com", null],
  ["instagram", "Instagram", null],
];

/** Endereço da API externa: só https e nunca a rede interna (o servidor mandaria o token para lá e leria a resposta) */
export function enderecoExterno(texto) {
  let u;
  try {
    u = new URL(texto);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || !host.includes(".") && !host.includes(":")) return false;
  // IPs literais privados, de loopback, link-local (metadados da nuvem) e equivalentes IPv6
  if (/^(0|10|127)\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return false;
  if (host.includes(":") && (/^(::1?|fc|fd|fe80|::ffff:)/.test(host))) return false;
  return true;
}

export function rotasRecrutamento({ r, repo, cofre, agora, auditar, aviso, limitar, base, fetchFn = fetch }) {
  const cfgRec = (empresa) => empresa.config.recrutamento ?? {};
  const salvarCfg = (empresa, mudanca) => {
    const config = { ...empresa.config, recrutamento: { ...cfgRec(empresa), ...mudanca } };
    delete config.certificado_publico;
    repo.atualizar("empresas", null, empresa.id, { config });
  };

  function registrar(empresa_id, lista, origem, opcoes = {}) {
    const res = { recebidos: lista.length, criados: 0, atualizados: 0, ignorados: 0, vagas_criadas: 0 };
    repo.transacao(() => {
      for (const d of lista) {
        const g = gravarCandidato(repo, empresa_id, d, { origem, ...opcoes });
        if (g.erro) res.ignorados++;
        else {
          g.criado ? res.criados++ : res.atualizados++;
          if (g.vagaCriada) res.vagas_criadas++;
        }
      }
    });
    if (res.criados) aviso(empresa_id, "candidato", { vaga: `${res.criados} candidato(s) de ${FONTES[origem] ?? origem}` });
    return res;
  }

  /* ---------- Painel ---------- */

  r.get("/api/recrutamento/integracoes", RH, ({ empresa, req }) => {
    const b = base(req);
    const c = cfgRec(empresa);
    const vagas = repo.todos("SELECT * FROM vagas WHERE empresa_id = ? AND status = 'aberta' ORDER BY criada_em DESC", empresa.id);
    return {
      fontes: FONTES,
      feed: `${b}/vagas/feed/${empresa.id}.xml`,
      sitemap: `${b}/vagas/sitemap/${empresa.id}.xml`,
      pagina: `${b}/vagas/?e=${empresa.id}`,
      webhook: c.webhook_hash ? { ativo: true, criado_em: c.webhook_criado_em, exemplo: `${b}/api/publico/recrutamento/${empresa.id}/gupy` } : { ativo: false },
      gupy: c.gupy?.token ? { ativo: true, ultima_sincronizacao: c.gupy.ultima ?? null, resultado: c.gupy.resultado ?? null, base: c.gupy.base ?? GUPY_PADRAO.base } : { ativo: false, base: GUPY_PADRAO.base },
      por_origem: repo.todos("SELECT origem, COUNT(*) n, SUM(etapa = 'contratado') contratados FROM candidatos WHERE empresa_id = ? GROUP BY origem ORDER BY n DESC", empresa.id),
      divulgacao: vagas.map((v) => ({ id: v.id, titulo: v.titulo, links: CANAIS.map(([id, nome, compartilhar]) => ({ id, nome, link: linkVaga(b, v, id), compartilhar: compartilhar ? compartilhar(linkVaga(b, v, id), v) : null })) })),
    };
  });

  r.post("/api/recrutamento/webhook-token", RH, (ctx) => {
    const token = gerarToken(24);
    salvarCfg(ctx.empresa, { webhook_hash: sha256(token), webhook_criado_em: agora() });
    auditar(ctx, "webhook_recrutamento_gerado");
    const b = base(ctx.req);
    return { token, urls: Object.fromEntries(["gupy", "solides", "generico"].map((f) => [f, `${b}/api/publico/recrutamento/${ctx.empresa.id}/${f}?token=${token}`])) };
  });
  r.delete("/api/recrutamento/webhook-token", RH, (ctx) => (salvarCfg(ctx.empresa, { webhook_hash: null }), { ok: true }));

  r.put("/api/recrutamento/gupy", RH, async (ctx) => {
    const d = validar(z.object({ token: z.string().trim().min(10).max(2000).optional(), base: z.string().url().max(200).refine(enderecoExterno, "base: use um endereço https:// público da API").optional(), remover: z.boolean().optional() }), await ctx.corpo());
    if (d.remover) {
      salvarCfg(ctx.empresa, { gupy: null });
      return { ok: true };
    }
    const atual = cfgRec(ctx.empresa).gupy ?? {};
    salvarCfg(ctx.empresa, { gupy: { ...atual, ...(d.token ? { token: cofre.cifrar(d.token) } : {}), ...(d.base ? { base: d.base } : {}) } });
    auditar(ctx, "gupy_configurada");
    return { ok: true };
  });

  r.post("/api/recrutamento/gupy/sincronizar", RH, async (ctx) => {
    const g = cfgRec(ctx.empresa).gupy;
    if (!g?.token) falha(400, "Salve o token da API da Gupy primeiro.");
    const dados = await buscarGupy({ token: cofre.decifrar(g.token), config: g.base ? { base: g.base } : {}, fetchFn });
    const total = { vagas: dados.length, recebidos: 0, criados: 0, atualizados: 0 };
    for (const { vaga, candidatos } of dados) {
      let v = repo.um("SELECT * FROM vagas WHERE empresa_id = ? AND codigo_externo = ?", ctx.empresa.id, `gupy:${vaga.codigo}`);
      // Vagas da Gupy entram pausadas aqui: continuam publicadas na Gupy, sem duplicar na sua página
      if (!v) v = repo.inserir("vagas", { empresa_id: ctx.empresa.id, titulo: vaga.titulo.slice(0, 120), codigo_externo: `gupy:${vaga.codigo}`, local: vaga.cidade, estado: vaga.estado, descricao: vaga.descricao, status: "pausada" });
      const res = registrar(ctx.empresa.id, candidatos.map((c) => ({ ...c, vaga_codigo: undefined })), "gupy", { vagaPadrao: v.id });
      total.recebidos += res.recebidos;
      total.criados += res.criados;
      total.atualizados += res.atualizados;
    }
    salvarCfg(nucleoEmpresa(ctx.empresa.id), { gupy: { ...g, ultima: agora(), resultado: total } });
    auditar(ctx, "gupy_sincronizada", total);
    return total;
  });
  const nucleoEmpresa = (id) => {
    const e = repo.obter("empresas", null, id);
    return { ...e, config: e.config ?? {} };
  };

  r.post("/api/recrutamento/importar-csv", RH, async (ctx) => {
    const d = validar(z.object({ csv: z.string().min(5).max(5_000_000), origem: z.enum(Object.keys(FONTES)), vaga_id: op(40), simular: z.boolean().optional() }), await ctx.corpo());
    const { colunas, candidatos } = candidatosDoCsv(d.csv);
    if (!colunas.nome && !colunas.email) falha(400, "Não encontrei as colunas de nome ou e-mail. A primeira linha da planilha precisa ter os títulos (Nome, E-mail, Telefone…).");
    if (d.simular) return { colunas, total: candidatos.length, exemplo: candidatos.slice(0, 5) };
    if (d.vaga_id && !repo.obter("vagas", ctx.empresa.id, d.vaga_id)) falha(400, "Vaga inválida.");
    const res = registrar(ctx.empresa.id, candidatos, d.origem, { vagaPadrao: d.vaga_id });
    auditar(ctx, "candidatos_importados", { origem: d.origem, ...res });
    return { colunas, ...res };
  });

  /* ---------- Webhook público (Gupy, Solides, Zapier/Make, formulários…) ---------- */

  r.post("/api/publico/recrutamento/:empresa/:fonte", { publico: true, webhook: true }, async ({ params, query, req, corpo, ip }) => {
    limitar(`webhook-rec:${ip}`, 600, 3600_000);
    const emp = repo.obter("empresas", null, params.empresa);
    const token = query.get("token") ?? String(req.headers["x-nexor-token"] ?? req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!emp?.config?.recrutamento?.webhook_hash || !iguais(sha256(token), emp.config.recrutamento.webhook_hash)) falha(401, "token inválido");
    const fonte = params.fonte in MAPEAMENTOS ? params.fonte : "generico";
    const origem = fonte === "generico" ? (query.get("origem") in FONTES ? query.get("origem") : "outra") : fonte;
    const payload = await corpo();
    const itens = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.results) ? payload.results : [payload];
    if (itens.length > 500) falha(413, "no máximo 500 candidatos por envio");
    return registrar(emp.id, itens.map((p) => mapear(p, MAPEAMENTOS[fonte])), origem, { vagaPadrao: query.get("vaga") || undefined });
  });

  /* ---------- Páginas públicas (fora de /api) ---------- */

  function paginas(req, res, url) {
    const b = base(req);
    let m = /^\/vagas\/v\/([\w-]{8,64})\/?$/.exec(url.pathname);
    if (m) {
      const v = repo.obter("vagas", null, m[1]);
      if (!v) return false;
      const e = repo.obter("empresas", null, v.empresa_id);
      res.writeHead(v.status === "aberta" ? 200 : 410, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" });
      res.end(paginaVaga({ vaga: v, empresa: e, base: b, aberta: v.status === "aberta" }));
      return true;
    }
    m = /^\/vagas\/(feed|sitemap)\/([\w-]{8,64})\.xml$/.exec(url.pathname);
    if (m) {
      const e = repo.obter("empresas", null, m[2]);
      if (!e) return false;
      const vagas = repo.todos("SELECT * FROM vagas WHERE empresa_id = ? AND status = 'aberta' ORDER BY criada_em DESC", e.id);
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" });
      res.end(m[1] === "feed" ? feedXml({ empresa: e, vagas, base: b, agora: agora() }) : sitemapVagas({ vagas, base: b }));
      return true;
    }
    return false;
  }
  void t;
  return { paginas };
}
