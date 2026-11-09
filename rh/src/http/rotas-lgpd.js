/* LGPD no painel: aceite dos termos, exportação e exclusão de dados de um titular (só administrador),
   histórico dos pedidos, prazos de guarda e rotina diária de expurgo. Tudo filtrado pela empresa da sessão. */

import { z } from "zod";
import { criarLgpd } from "../lgpd/motor.js";
import { regrasRh, titularesRh } from "../lgpd/mapa.js";
import { criarTermos } from "../lgpd/termos.js";
import { falha } from "./roteador.js";
import { validar } from "./validacao.js";

const ADM = { papeis: ["admin"] };

export function rotasLgpd({ r, repo, nucleo, cfg, agora }) {
  const termos = criarTermos({ repo, termos: cfg.termos, agora });
  const lgpd = criarLgpd({
    repo,
    tabelaEmpresas: "empresas",
    titulares: titularesRh(),
    regras: regrasRh(repo),
    prazos: cfg.lgpd.prazos,
    agora,
    auditar: (empresa_id, autor, acao, detalhe) => repo.auditar(empresa_id, autor, acao, detalhe),
    arquivos: {
      async ler(id, empresa_id) {
        const a = await nucleo.lerArquivo(id);
        return a && a.empresa_id === empresa_id ? a : null;
      },
      remover: (id) => nucleo.removerArquivo(id),
    },
  });
  termos.proteger(r, { falha });

  /* ---------- Termos ---------- */
  r.get("/api/termos", ({ usuario }) => termos.situacao(usuario));
  r.post("/api/termos/aceite", async ({ usuario, corpo, ip, req }) => {
    const d = validar(z.object({ versao: z.string().max(40).optional(), aceito: z.literal(true, { message: "marque que leu e aceita os termos" }) }), await corpo());
    if (d.versao && d.versao !== termos.versao()) falha(409, "Os termos mudaram enquanto a tela estava aberta. Recarregue a página.");
    termos.aceitar(usuario, { ip, agente: req.headers["user-agent"] });
    repo.auditar(usuario.empresa_id, usuario.nome, "termos_aceitos", { versao: termos.versao() });
    return termos.situacao(usuario);
  });
  r.get("/api/lgpd/aceites", ADM, ({ empresa }) => termos.historico(empresa.id));

  /* ---------- Titulares (arts. 18 e 19) ---------- */
  const tipo = (t) => (lgpd.titulares[t] ? t : falha(400, "Tipo de titular inválido."));
  r.post("/api/lgpd/titulares/:tipo/:id/exportar", ADM, async ({ params, empresa, usuario, ip, res }) => {
    const dados = await lgpd.exportar(tipo(params.tipo), empresa.id, params.id, { autor: usuario.nome, ip });
    if (!dados) falha(404, "Titular não encontrado.");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="dados-${params.tipo}-${params.id.slice(0, 8)}.json"` });
    res.end(JSON.stringify(dados, null, 2));
  });
  r.post("/api/lgpd/titulares/:tipo/:id/excluir", ADM, async ({ params, empresa, usuario, ip, corpo }) => {
    validar(z.object({ confirmar: z.literal(true, { message: "confirme a exclusão" }) }), await corpo());
    const r2 = await lgpd.excluir(tipo(params.tipo), empresa.id, params.id, { autor: usuario.nome, ip }).catch((e) => falha(e.status ?? 500, e.message));
    return r2 ?? falha(404, "Titular não encontrado.");
  });
  r.get("/api/lgpd/pedidos", ADM, ({ empresa }) => lgpd.pedidos(empresa.id));
  r.get("/api/lgpd/bloqueios", ADM, ({ empresa }) => lgpd.bloqueios(empresa.id));

  /* ---------- Prazos de guarda e expurgo (arts. 15 e 16) ---------- */
  r.get("/api/lgpd/prazos", ADM, () => lgpd.prazos);
  r.get("/api/lgpd/expurgo", ADM, ({ empresa }) => lgpd.expurgos(empresa.id));
  r.post("/api/lgpd/expurgo", ADM, async ({ empresa }) => (await lgpd.expurgar({ forcar: true, empresa_id: empresa.id }))[0]);

  // Rotina diária (confere de hora em hora; cada empresa roda uma vez por dia). Para junto com o banco.
  if (cfg.lgpd.rotina) {
    const rodar = () => lgpd.expurgar().catch((e) => console.error("[lgpd]", e.message));
    const primeira = setTimeout(rodar, 60_000);
    const relogio = setInterval(rodar, 3600_000);
    primeira.unref?.();
    relogio.unref?.();
    const fechar = repo.fechar;
    repo.fechar = () => {
      clearTimeout(primeira);
      clearInterval(relogio);
      return fechar();
    };
  }
  return { lgpd, termos };
}
