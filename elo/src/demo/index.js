/* Modo Demonstração do Nexor Elo (DEMO=1). Sem DEMO=1 nada daqui é carregado e as rotas /demo e /api/demo respondem 404.
   Rotas: GET /demo (escolher o papel) · GET /demo/entrar?papel= · GET /api/demo · GET /api/demo/mensagens ·
          POST /api/demo/reiniciar · POST /api/demo/pagar {proposta_id?} (simula o Asaas avisando o pagamento) */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { gerarToken, sha256 } from "../seguranca.js";
import { COOKIES } from "../http/validacao.js";
import { json, lerCorpo } from "../http/roteador.js";
import { PAPEIS } from "./semear.js";

export const ORIGINAL = "elo-original.db";

/** Volta o banco em uso ao retrato tirado logo depois da semeadura (mesma conexão, sem reiniciar o servidor) */
export function restaurar(repo, pasta) {
  const arquivo = join(pasta, ORIGINAL);
  if (!existsSync(arquivo)) throw new Error("Retrato da demonstração não encontrado. Reinicie com npm run demo.");
  const db = repo.db;
  const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
  db.exec("PRAGMA foreign_keys = OFF");
  db.prepare("ATTACH DATABASE ? AS original").run(arquivo);
  try {
    db.exec("BEGIN");
    for (const t of tabelas) {
      db.exec(`DELETE FROM main."${t}"`);
      db.exec(`INSERT INTO main."${t}" SELECT * FROM original."${t}"`);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.exec("DETACH DATABASE original");
    db.exec("PRAGMA foreign_keys = ON");
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function paginaPapeis() {
  const itens = PAPEIS.map((p) => `<a class="p" href="${esc(p.url)}"><strong>${esc(p.nome)}</strong><span>${esc(p.descricao)}</span></a>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demonstração · Nexor Elo</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0b1220;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;padding:16px}main{max-width:560px;width:100%}h1{font-size:22px;margin:0 0 4px}p{color:#94a3b8;margin:0 0 18px}.p{display:block;background:#111a2e;border:1px solid #1f2a44;border-radius:14px;padding:14px 16px;margin:0 0 10px;color:inherit;text-decoration:none}.p:hover{border-color:#3b8dff}.p strong{display:block;font-size:16px}.p span{color:#94a3b8;font-size:14px}small{color:#64748b}</style></head>
<body><main><h1>Nexor Elo · Demonstração</h1><p>Distribuidora Vigia Forte e Instala Seg Araguari (fictícias). Escolha como quer entrar:</p>${itens}<small>Dados fictícios. Nada sai deste computador: Receita, Asaas, notas, WhatsApp e e-mail são simulados.</small></main></body></html>`;
}

export function criarRotasDemo({ cfg, repo, negocio, sim }) {
  const cookie = (nome, token) => [`${nome}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${86400}`].join("; ");
  return async function tratar(req, res, url) {
    const p = url.pathname;
    if (p !== "/demo" && !p.startsWith("/demo/") && !p.startsWith("/api/demo")) return false;
    if (req.method === "GET" && (p === "/demo" || p === "/demo/")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(paginaPapeis());
      return true;
    }
    if (req.method === "GET" && p === "/demo/entrar") {
      const def = PAPEIS.find((x) => x.papel === (url.searchParams.get("papel") ?? "fornecedor_dono"));
      if (!def) return json(res, 404, { erro: "papel desconhecido" }), true;
      if (def.tipo === "cliente") {
        const prop = repo.lista("propostas", "WHERE status IN ('enviada','vista') AND token_cripto IS NOT NULL ORDER BY enviada_em DESC LIMIT 1")[0];
        const token = negocio.tokenDe(prop);
        if (!token) return json(res, 409, { erro: "proposta da demonstração não encontrada" }), true;
        res.writeHead(302, { Location: `/p/${token}`, "Cache-Control": "no-store" });
        return res.end(), true;
      }
      const u = repo.usuarioPorEmail(def.tipo, def.email);
      if (!u) return json(res, 409, { erro: "usuário da demonstração não encontrado" }), true;
      const token = gerarToken();
      repo.criarSessao(sha256(token), u.id, def.tipo, 1);
      res.writeHead(302, { Location: def.destino, "Cache-Control": "no-store", "Set-Cookie": cookie(COOKIES[def.tipo], token) });
      return res.end(), true;
    }
    if (req.method === "GET" && p === "/api/demo") return json(res, 200, { demo: true, sistema: "elo", nome: "Nexor Elo", empresa: "Distribuidora Vigia Forte · Instala Seg Araguari", papeis: PAPEIS.map(({ email, destino, ...x }) => x), ia: "nao_se_aplica" }), true;
    if (req.method === "GET" && p === "/api/demo/mensagens") return json(res, 200, [...sim.mensagens].reverse().slice(0, 50)), true;
    if (req.method !== "POST") return json(res, 405, { erro: "método não permitido" }), true;
    if (req.headers["x-nexor"] !== "1") return json(res, 403, { erro: "requisição recusada" }), true;

    if (p === "/api/demo/reiniciar") {
      restaurar(repo, cfg.pastaDados);
      sim.mensagens.length = 0;
      return json(res, 200, { ok: true, voltar: "/demo" }), true;
    }
    if (p === "/api/demo/pagar") {
      // Simula o Asaas avisando que o cliente pagou a cobrança em aberto (a mais recente, ou a da proposta pedida)
      let d = {};
      try {
        d = JSON.parse((await lerCorpo(req, 4096)).toString("utf8") || "{}");
      } catch {}
      const pg = d.proposta_id
        ? repo.um("SELECT * FROM pagamentos WHERE proposta_id = ? AND status = 'pendente' ORDER BY criado_em DESC LIMIT 1", String(d.proposta_id))
        : repo.um("SELECT * FROM pagamentos WHERE status = 'pendente' ORDER BY criado_em DESC LIMIT 1");
      if (!pg) return json(res, 409, { erro: "Nenhuma cobrança em aberto. Aceite uma proposta e clique em pagar na página do cliente." }), true;
      const r = negocio.eventoAsaas({ event: "PAYMENT_RECEIVED", payment: { id: pg.asaas_id, value: pg.valor_centavos / 100, billingType: pg.forma } });
      sim.guardar({ canal: "asaas", para: pg.asaas_id, texto: `Pagamento recebido (${pg.forma}): R$ ${(pg.valor_centavos / 100).toFixed(2).replace(".", ",")} dividido pelo split` });
      return json(res, 200, { ok: true, resultado: r }), true;
    }
    return json(res, 404, { erro: "não encontrado" }), true;
  };
}
