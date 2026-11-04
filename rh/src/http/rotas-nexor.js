/* Suporte Nexor dentro do sistema do cliente.
   - GET /api/nexor/entrar?t=…  link assinado pela Nexor Central (2 minutos, uso único): abre o painel como
     "Suporte Nexor", administrador sem senha, com as opções de desenvolvedor. Fica registrado na auditoria do cliente.
   - /api/nexor/ajustes          o que o cliente vê: módulos, abas e campos que o Suporte Nexor esconde.
   - /api/nexor/sincronizar      força o contato com a Central (situação do contrato). */

import { z } from "zod";
import { gerarToken, sha256 } from "../seguranca.js";
import { CATALOGO, chaveValida } from "../nexor/politica.js";
import { falha } from "./roteador.js";
import { COOKIE_PAINEL, validar } from "./validacao.js";

const HORAS_SESSAO = 8;

function pagina(res, status, titulo, texto) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
  res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;color:#0b1b33"><h1 style="font-size:20px">${titulo}</h1><p style="color:#4a5a73;line-height:1.5">${texto}</p><p><a href="/" style="color:#0066ff">Ir para o painel</a></p></body></html>`);
}

export function rotasNexor({ r, repo, cfg, central, agora, limitar }) {
  const NEXOR = { nexor: true };

  r.get("/api/nexor/entrar", { publico: true }, ({ query, res, ip }) => {
    limitar(`nexor:${ip}`, 20);
    const d = central.conferirAcesso(query.get("t"));
    if (!d) return pagina(res, 403, "Link de acesso inválido", "O link de suporte venceu, já foi usado ou não é desta instalação. Gere um novo na Nexor Central.");
    const empresa = repo.um("SELECT id FROM empresas ORDER BY criada_em LIMIT 1");
    if (!empresa) return pagina(res, 409, "Empresa ainda não criada", "O cliente ainda não criou a conta neste sistema. Use o código de instalação para criar o primeiro administrador.");
    const nome = `Suporte Nexor · ${String(d.nome ?? "equipe").slice(0, 60)}`;
    let u = repo.um("SELECT * FROM usuarios WHERE empresa_id = ? AND nexor = 1", empresa.id);
    if (u) repo.rodar("UPDATE usuarios SET nome = ?, ativo = 1 WHERE id = ?", nome, u.id);
    else u = repo.inserir("usuarios", { empresa_id: empresa.id, nome, email: `suporte-${empresa.id}@nexor.invalid`, senha_hash: "!sem-senha", papel: "admin", nexor: 1 });
    const token = gerarToken();
    repo.criarSessao(sha256(token), { usuario_id: u.id }, HORAS_SESSAO / 24);
    repo.auditar(empresa.id, nome, "acesso_suporte_nexor", { email: d.email ?? null, ip });
    res.writeHead(302, {
      Location: "/#/inicio",
      "Cache-Control": "no-store",
      "Set-Cookie": [`${COOKIE_PAINEL}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${HORAS_SESSAO * 3600}`, ...(cfg.producao ? ["Secure"] : [])].join("; "),
    });
    res.end();
  });

  r.get("/api/nexor/ajustes", NEXOR, ({ empresa }) => {
    const linha = repo.um("SELECT atualizado_por, atualizado_em FROM nexor_ajustes WHERE empresa_id = ?", empresa.id);
    return { catalogo: CATALOGO, ocultos: repo.ocultos(empresa.id), atualizado_por: linha?.atualizado_por ?? null, atualizado_em: linha?.atualizado_em ?? null, licenca: central.estado(), central: central.info() };
  });

  r.put("/api/nexor/ajustes", NEXOR, async (ctx) => {
    const d = validar(z.object({ ocultos: z.array(z.string().max(60)).max(60) }), await ctx.corpo());
    const invalidos = d.ocultos.filter((k) => !chaveValida(k));
    if (invalidos.length) falha(400, `Itens desconhecidos: ${invalidos.join(", ")}`);
    const ocultos = [...new Set(d.ocultos)];
    repo.rodar("INSERT INTO nexor_ajustes (empresa_id, ocultos, atualizado_por, atualizado_em) VALUES (?,?,?,?) ON CONFLICT (empresa_id) DO UPDATE SET ocultos = excluded.ocultos, atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em", ctx.empresa.id, JSON.stringify(ocultos), ctx.usuario.nome, agora());
    repo.auditar(ctx.empresa.id, ctx.usuario.nome, "ajustes_nexor", { ocultos });
    return { ocultos };
  });

  // O administrador do cliente (ou o técnico na implantação) vincula o sistema pelo código do cliente
  r.post("/api/nexor/vincular", { papeis: ["admin"] }, async (ctx) => {
    limitar(`vincular:${ctx.ip}`, 10);
    if (central.configurada) falha(409, "Este sistema já está vinculado à Nexor Central.");
    const d = validar(z.object({ codigo: z.string().trim().min(8).max(20) }), await ctx.corpo());
    const r2 = await central.vincular(d.codigo, { nome: ctx.empresa.nome_fantasia || ctx.empresa.razao_social });
    if (!r2.ok) falha(400, r2.erro);
    repo.auditar(ctx.empresa.id, ctx.usuario.nome, "vinculado_nexor_central", { cliente: r2.cliente });
    return r2;
  });

  r.post("/api/nexor/sincronizar", NEXOR, async () => ({ ...(await central.sincronizar()), licenca: central.estado(), central: central.info() }));
}
