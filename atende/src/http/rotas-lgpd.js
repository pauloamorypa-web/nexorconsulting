/* LGPD no painel: aceite dos termos, exportação e exclusão dos dados de um contato (só dono e administrador),
   histórico dos pedidos, prazos de guarda e expurgo (rodado pelo agendador). Tudo filtrado pela empresa da sessão. */

import { z } from "zod";
import { criarLgpd } from "../lgpd/motor.js";
import { regrasAtende, titularesAtende } from "../lgpd/mapa.js";
import { criarTermos } from "../lgpd/termos.js";
import { falha } from "./roteador.js";

const ADM = { papeis: ["dono", "admin"] };

export function rotasLgpd({ r, repo, midia, cfg, agora, validar }) {
  const termos = criarTermos({ repo, termos: cfg.termos, agora });
  const lgpd = criarLgpd({
    repo,
    tabelaEmpresas: "empresas",
    titulares: titularesAtende(),
    regras: regrasAtende(repo, midia),
    prazos: cfg.lgpd.prazos,
    agora,
    auditar: (empresa_id, autor, acao, detalhe, autor_id) => repo.auditar(empresa_id, autor_id ?? null, acao, { ...detalhe, autor }),
    arquivos: {
      async ler(arquivo, empresa_id) {
        // Mídias ficam em <empresa>/<arquivo>: nunca lê a pasta de outra empresa
        if (!String(arquivo).startsWith(`${empresa_id}/`)) return null;
        const dados = await midia.ler(arquivo);
        return { nome: arquivo.split("/").pop(), mime: midia.tipoDe(arquivo), dados };
      },
      remover: (arquivo) => midia.remover(arquivo),
    },
  });
  termos.proteger(r, { falha });
  // O agendador chama uma vez por hora; cada empresa roda uma vez por dia
  repo.expurgoLgpd = () => lgpd.expurgar();

  /* ---------- Termos ---------- */
  r.get("/api/termos", ({ usuario }) => termos.situacao(usuario));
  r.post("/api/termos/aceite", async ({ usuario, corpo, ip, req }) => {
    const d = validar(z.object({ versao: z.string().max(40).optional(), aceito: z.literal(true, { message: "marque que leu e aceita os termos" }) }), await corpo());
    if (d.versao && d.versao !== termos.versao()) falha(409, "Os termos mudaram enquanto a tela estava aberta. Recarregue a página.");
    termos.aceitar(usuario, { ip, agente: req.headers["user-agent"] });
    repo.auditar(usuario.empresa_id, usuario.id, "termos_aceitos", { versao: termos.versao() });
    return termos.situacao(usuario);
  });
  r.get("/api/lgpd/aceites", ADM, ({ empresa }) => termos.historico(empresa.id));

  /* ---------- Titulares (arts. 18 e 19) ---------- */
  const tipo = (t) => (lgpd.titulares[t] ? t : falha(400, "Tipo de titular inválido."));
  r.post("/api/lgpd/titulares/:tipo/:id/exportar", ADM, async ({ params, empresa, usuario, ip, res }) => {
    const dados = await lgpd.exportar(tipo(params.tipo), empresa.id, params.id, { autor: usuario.nome, autor_id: usuario.id, ip });
    if (!dados) falha(404, "Titular não encontrado.");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="dados-${params.tipo}-${params.id.slice(0, 8)}.json"` });
    res.end(JSON.stringify(dados, null, 2));
  });
  r.post("/api/lgpd/titulares/:tipo/:id/excluir", ADM, async ({ params, empresa, usuario, ip, corpo }) => {
    validar(z.object({ confirmar: z.literal(true, { message: "confirme a exclusão" }) }), await corpo());
    const feito = await lgpd.excluir(tipo(params.tipo), empresa.id, params.id, { autor: usuario.nome, autor_id: usuario.id, ip }).catch((e) => falha(e.status ?? 500, e.message));
    return feito ?? falha(404, "Titular não encontrado.");
  });
  r.get("/api/lgpd/pedidos", ADM, ({ empresa }) => lgpd.pedidos(empresa.id));
  r.get("/api/lgpd/bloqueios", ADM, ({ empresa }) => lgpd.bloqueios(empresa.id));

  /* ---------- Prazos de guarda e expurgo (arts. 15 e 16) ---------- */
  r.get("/api/lgpd/prazos", ADM, () => lgpd.prazos);
  r.get("/api/lgpd/expurgo", ADM, ({ empresa }) => lgpd.expurgos(empresa.id));
  r.post("/api/lgpd/expurgo", ADM, async ({ empresa }) => (await lgpd.expurgar({ forcar: true, empresa_id: empresa.id }))[0]);
  return { lgpd, termos };
}
