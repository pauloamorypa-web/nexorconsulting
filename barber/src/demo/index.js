/* Modo Demonstração do Nexor Barber (DEMO=1). Sem DEMO=1 nada daqui é carregado e as rotas /demo respondem 404.
   Rotas: GET /demo (escolher o papel) · GET /demo/entrar?papel= · GET /api/demo · GET /api/demo/mensagens ·
          POST /api/demo/reiniciar · POST /api/demo/pagar · POST /api/demo/receber {de, texto} */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { gerarToken, sha256 } from "../seguranca.js";
import { COOKIE_CLIENTE, COOKIE_PAINEL } from "../http/validacao.js";
import { json, lerCorpo } from "../http/roteador.js";
import { CLIENTE_APP_FONE, PAPEIS, assinarMeta } from "./semear.js";

export const ORIGINAL = "barber-original.db";

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

function paginaPapeis() {
  const itens = PAPEIS.map((p) => `<a class="p" href="${p.url}"><strong>${p.nome}</strong><span>${p.descricao}</span></a>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demonstração · Nexor Barber</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0b1220;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;padding:16px}main{max-width:520px;width:100%}h1{font-size:22px;margin:0 0 4px}p{color:#94a3b8;margin:0 0 18px}.p{display:block;background:#111a2e;border:1px solid #1f2a44;border-radius:14px;padding:14px 16px;margin:0 0 10px;color:inherit;text-decoration:none}.p:hover{border-color:#3b8dff}.p strong{display:block;font-size:16px}.p span{color:#94a3b8;font-size:14px}small{color:#64748b}</style></head>
<body><main><h1>Nexor Barber · Demonstração</h1><p>Barbearia Navalha (fictícia). Escolha como quer entrar:</p>${itens}<small>Dados fictícios. Nada sai deste computador: WhatsApp, SMS e Asaas são simulados.</small></main></body></html>`;
}

/**
 * Rotas da demonstração. Devolve true quando tratou a requisição.
 * `ctx`: { cfg, repo, nucleo, sim, porta: () => number }
 */
export function criarRotasDemo({ cfg, repo, nucleo, sim, porta }) {
  const cookie = (nome, token, dias) => [`${nome}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${dias * 86400}`].join("; ");
  const sessao = (dados) => {
    const token = gerarToken();
    repo.criarSessao(sha256(token), dados, 1);
    return token;
  };
  const csrf = (req) => req.headers["x-nexor"] === "1";

  return async function tratar(req, res, url) {
    const p = url.pathname;
    if (p !== "/demo" && p !== "/demo/" && !p.startsWith("/demo/") && !p.startsWith("/api/demo")) return false;
    if (req.method === "GET" && (p === "/demo" || p === "/demo/")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(paginaPapeis());
      return true;
    }
    if (req.method === "GET" && p === "/demo/entrar") {
      const papel = url.searchParams.get("papel") ?? "dono";
      const def = PAPEIS.find((x) => x.papel === papel);
      if (!def) return json(res, 404, { erro: "papel desconhecido" }), true;
      if (papel === "cliente") {
        const c = repo.um("SELECT * FROM clientes WHERE fone LIKE ?", `%${CLIENTE_APP_FONE.slice(-8)}`);
        if (!c) return json(res, 409, { erro: "cliente da demonstração não encontrado" }), true;
        res.writeHead(302, { Location: "/app/#inicio", "Cache-Control": "no-store", "Set-Cookie": cookie(COOKIE_CLIENTE, sessao({ cliente_id: c.id }), 1) });
        return res.end(), true;
      }
      const u = repo.usuarioPorEmail(def.email);
      if (!u) return json(res, 409, { erro: "usuário da demonstração não encontrado" }), true;
      res.writeHead(302, { Location: "/#/hoje", "Cache-Control": "no-store", "Set-Cookie": cookie(COOKIE_PAINEL, sessao({ usuario_id: u.id }), 1) });
      return res.end(), true;
    }
    if (req.method === "GET" && p === "/api/demo") return json(res, 200, { demo: true, sistema: "barber", nome: "Nexor Barber", empresa: "Barbearia Navalha", papeis: PAPEIS.map(({ email, ...x }) => x), ia: "nao_se_aplica" }), true;
    if (req.method === "GET" && p === "/api/demo/mensagens") return json(res, 200, [...sim.mensagens].reverse().slice(0, 50)), true;
    if (req.method !== "POST") return json(res, 405, { erro: "método não permitido" }), true;
    if (!csrf(req)) return json(res, 403, { erro: "requisição recusada" }), true;

    if (p === "/api/demo/reiniciar") {
      restaurar(repo, cfg.pastaDados);
      sim.mensagens.length = 0;
      return json(res, 200, { ok: true, voltar: "/demo" }), true;
    }
    if (p === "/api/demo/pagar") {
      // Simula o Asaas avisando que o cliente pagou a cobrança em aberto mais recente do clube
      const c = repo.um("SELECT c.*, a.asaas_assinatura FROM cobrancas c JOIN assinaturas a ON a.id = c.assinatura_id WHERE c.status = 'aberta' AND c.externo_id IS NOT NULL AND a.asaas_assinatura IS NOT NULL ORDER BY c.criado_em DESC LIMIT 1");
      if (!c) return json(res, 409, { erro: "Nenhuma cobrança do Asaas em aberto. Assine o clube pelo app para gerar uma." }), true;
      const r = nucleo.eventoAsaas({ event: "PAYMENT_RECEIVED", payment: { id: c.externo_id, subscription: c.asaas_assinatura, value: c.valor_centavos / 100, billingType: "PIX", dueDate: c.vencimento, invoiceUrl: c.link } });
      sim.guardar({ canal: "asaas", para: c.asaas_assinatura, texto: `Pagamento recebido pelo Pix: R$ ${(c.valor_centavos / 100).toFixed(2).replace(".", ",")}` });
      return json(res, 200, { ok: true, resultado: r }), true;
    }
    if (p === "/api/demo/receber") {
      // Simula uma mensagem de cliente chegando pelo WhatsApp: passa pelo webhook real (com a assinatura da Meta)
      let d = {};
      try {
        d = JSON.parse((await lerCorpo(req, 16 * 1024)).toString("utf8") || "{}");
      } catch {}
      const de = String(d.de ?? "5534999990077").replace(/\D/g, "").slice(0, 15);
      const texto = String(d.texto ?? "Oi, queria marcar um corte").slice(0, 500);
      const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: de, type: "text", text: { body: texto } }] } }] }] });
      sim.guardar({ canal: "whatsapp_recebido", para: de, texto });
      await fetch(`http://127.0.0.1:${porta()}/webhook/whatsapp`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": assinarMeta(corpo) }, body: corpo });
      return json(res, 200, { ok: true }), true;
    }
    return json(res, 404, { erro: "não encontrado" }), true;
  };
}
