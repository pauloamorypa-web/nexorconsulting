/* LGPD no painel: aceite dos termos, exportação e exclusão dos dados de um cliente (só dono e administrador),
   histórico dos pedidos, prazos de guarda e expurgo (rodado pela rotina). Tudo filtrado pela barbearia da sessão. */

import { z } from "zod";
import { criarLgpd } from "../lgpd/motor.js";
import { regrasBarber, titularesBarber } from "../lgpd/mapa.js";
import { criarTermos } from "../lgpd/termos.js";
import { falha } from "./roteador.js";
import { validar } from "./validacao.js";

const ADM = { papeis: ["dono", "admin"] };

export function rotasLgpd({ r, repo, cfg, agora }) {
  const termos = criarTermos({ repo, termos: cfg.termos, tenant: "barbearia_id", agora });
  const lgpd = criarLgpd({
    repo,
    tabelaEmpresas: "barbearias",
    titulares: titularesBarber(repo),
    regras: regrasBarber(repo),
    prazos: cfg.lgpd.prazos,
    agora,
    auditar: (barbearia_id, autor, acao, detalhe) => repo.auditar(barbearia_id, autor, acao, detalhe),
  });
  termos.proteger(r, { falha });
  // A rotina (nucleo.rotina) chama a cada ciclo; cada barbearia roda uma vez por dia
  repo.expurgoLgpd = () => lgpd.expurgar();

  /* ---------- Termos ---------- */
  r.get("/api/termos", ({ usuario }) => termos.situacao(usuario));
  r.post("/api/termos/aceite", async ({ usuario, corpo, ip, req }) => {
    const d = validar(z.object({ versao: z.string().max(40).optional(), aceito: z.literal(true, { message: "marque que leu e aceita os termos" }) }), await corpo());
    if (d.versao && d.versao !== termos.versao()) falha(409, "Os termos mudaram enquanto a tela estava aberta. Recarregue a página.");
    termos.aceitar(usuario, { ip, agente: req.headers["user-agent"] });
    repo.auditar(usuario.barbearia_id, usuario.nome, "termos_aceitos", { versao: termos.versao() });
    return termos.situacao(usuario);
  });
  r.get("/api/lgpd/aceites", ADM, ({ barbearia }) => termos.historico(barbearia.id));

  /* ---------- Titulares (arts. 18 e 19) ---------- */
  const tipo = (t) => (lgpd.titulares[t] ? t : falha(400, "Tipo de titular inválido."));
  r.post("/api/lgpd/titulares/:tipo/:id/exportar", ADM, async ({ params, barbearia, usuario, ip, res }) => {
    const dados = await lgpd.exportar(tipo(params.tipo), barbearia.id, params.id, { autor: usuario.nome, ip });
    if (!dados) falha(404, "Titular não encontrado.");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="dados-${params.tipo}-${params.id.slice(0, 8)}.json"` });
    res.end(JSON.stringify(dados, null, 2));
  });
  r.post("/api/lgpd/titulares/:tipo/:id/excluir", ADM, async ({ params, barbearia, usuario, ip, corpo }) => {
    validar(z.object({ confirmar: z.literal(true, { message: "confirme a exclusão" }) }), await corpo());
    const feito = await lgpd.excluir(tipo(params.tipo), barbearia.id, params.id, { autor: usuario.nome, ip }).catch((e) => falha(e.status ?? 500, e.message));
    return feito ?? falha(404, "Titular não encontrado.");
  });
  r.get("/api/lgpd/pedidos", ADM, ({ barbearia }) => lgpd.pedidos(barbearia.id));
  r.get("/api/lgpd/bloqueios", ADM, ({ barbearia }) => lgpd.bloqueios(barbearia.id));

  /* ---------- Prazos de guarda e expurgo (arts. 15 e 16) ---------- */
  r.get("/api/lgpd/prazos", ADM, () => lgpd.prazos);
  r.get("/api/lgpd/expurgo", ADM, ({ barbearia }) => lgpd.expurgos(barbearia.id));
  r.post("/api/lgpd/expurgo", ADM, async ({ barbearia }) => (await lgpd.expurgar({ forcar: true, empresa_id: barbearia.id }))[0]);
  return { lgpd, termos };
}
