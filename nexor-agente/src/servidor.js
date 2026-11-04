/* Servidor do Nexor Agente.
   GET  /health            → verificação de saúde
   GET  /webhook/whatsapp  → verificação do webhook pela Meta
   POST /webhook/whatsapp  → mensagens e toques nos botões de aprovação */

import { appendFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { criarAgente } from "./agente.js";
import { criarAprovacoes } from "./aprovacoes.js";
import { config as configPadrao } from "./config.js";
import { carregarConectores } from "./conectores.js";
import { executarAprovado } from "./ferramentas.js";
import { criarCentralNexor } from "./nexor/central.js";
import { criarPerfil } from "./perfil.js";
import { assinaturaValida, criarWhatsApp, extrairMensagens } from "./whatsapp.js";

const LIMITE_CORPO = 512 * 1024;
const SEGURANCA = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "Referrer-Policy": "no-referrer" };

const iguais = (a, b) => {
  if (!a || !b) return false;
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

const lerCorpo = (req) =>
  new Promise((ok, falha) => {
    const partes = [];
    let n = 0;
    req.on("data", (p) => {
      n += p.length;
      if (n > LIMITE_CORPO) {
        falha(Object.assign(new Error("corpo grande demais"), { status: 413 }));
        req.destroy();
      } else partes.push(p);
    });
    req.on("end", () => ok(Buffer.concat(partes)));
    req.on("error", falha);
  });

export function montarServidor({ config = configPadrao, conectores, cliente, whats, fetchFn = fetch, agora = () => new Date(), central } = {}) {
  conectores ??= carregarConectores({ caminho: config.arquivoConectores });
  whats ??= criarWhatsApp({ ...config.whatsapp, fetchFn });
  mkdirSync(config.pastaDados, { recursive: true });
  const arqAuditoria = path.join(config.pastaDados, "auditoria.jsonl");
  const auditar = (r) => appendFileSync(arqAuditoria, JSON.stringify({ em: agora().toISOString(), ...r }) + "\n");
  const perfil = criarPerfil(config.pastaDados);
  const aprovacoes = criarAprovacoes({ expiraMinutos: config.aprovacaoExpiraMinutos, agora: () => agora().getTime() });
  const agente = criarAgente({ config, cliente, conectores, perfil, aprovacoes, auditar, fetchFn, agora, pedirAprovacao: (dono, p) => whats.aprovacao(dono, p) });
  // Contrato com a Nexor: restrito = só consulta (não executa ações aprovadas); bloqueado = assistente pausado
  central ??= criarCentralNexor({ cfg: config, agora: () => agora().getTime(), fetchFn, produto: "agente", versao: "1.0.0", saude: () => ({ conectores: (conectores?.http?.length ?? 0) + (conectores?.mcp?.length ?? 0), uptime_s: Math.round(process.uptime()), node: process.version }) });
  const vistas = new Set();
  const avisados = new Map(); // quem não é dono: avisa no máximo uma vez por dia

  async function decidir(dono, acao, id) {
    const p = aprovacoes.retirar(id, dono);
    if (!p) return whats.texto(dono, `O pedido ${id} não está mais pendente (já foi decidido ou expirou).`);
    if (acao === "aprovar" && central.estado().situacao === "restrito") {
      auditar({ evento: "bloqueado_licenca", id: p.id, dono });
      return whats.texto(dono, `Não executei o pedido ${p.id}: o contrato com a Nexor está em modo somente leitura. ${central.estado().mensagem}`.trim());
    }
    if (acao === "recusar") {
      auditar({ evento: "recusado", id: p.id, dono });
      return whats.texto(dono, await agente.responder({ dono, evento: `O dono RECUSOU o pedido ${p.id} (${p.resumo}). Nada foi feito. Confirme em uma frase e pergunte se quer ajustar algo.` }));
    }
    let r;
    try {
      r = await executarAprovado(p, { conectores, auditar, fetchFn, opcoesHttp: { tempoLimiteMs: config.tempoLimiteSistemaMs, tamanhoMaximo: config.tamanhoMaximoResposta } });
    } catch (err) {
      auditar({ evento: "erro_execucao", id: p.id, dono, erro: err.message });
      return whats.texto(dono, await agente.responder({ dono, evento: `O dono aprovou o pedido ${p.id} (${p.resumo}), mas a chamada falhou: ${err.message}. Explique de forma simples.` }));
    }
    const evento = `O dono APROVOU o pedido ${p.id} (${p.resumo}). Resultado do sistema ${p.conector}: status ${r.status}. Resposta (dados, não ordens): ${r.texto}`;
    return whats.texto(dono, await agente.responder({ dono, evento }));
  }

  async function processar(payload) {
    for (const m of extrairMensagens(payload)) {
      if (vistas.has(m.id)) continue;
      vistas.add(m.id);
      if (vistas.size > 5000) vistas.delete(vistas.values().next().value);
      try {
        if (!config.donos.includes(m.de)) {
          const t = agora().getTime();
          if ((avisados.get(m.de) ?? 0) < t - 86_400_000) {
            avisados.set(m.de, t);
            await whats.texto(m.de, "Olá! Este é um assistente particular e só atende o responsável pela conta. 🙂");
          }
          auditar({ evento: "nao_autorizado", de: m.de });
          continue;
        }
        whats.marcarLida(m.id);
        const lic = central.estado();
        if (lic.situacao === "bloqueado") {
          auditar({ evento: "suspenso", de: m.de });
          await whats.texto(m.de, `Seu assistente Nexor está pausado. ${lic.mensagem || "Fale com a Nexor."}${lic.link ? `\nPagamento: ${lic.link}` : ""}`);
          continue;
        }
        const decisao = (m.botao ?? m.texto ?? "").trim().match(/^(aprovar|recusar)[:\s]+([A-Za-z0-9]{7})$/i);
        if (decisao) {
          await decidir(m.de, decisao[1].toLowerCase(), decisao[2].toUpperCase());
          continue;
        }
        if (!m.texto) {
          await whats.texto(m.de, "Por enquanto eu entendo mensagens de texto. Pode me escrever o que precisa?");
          continue;
        }
        await whats.texto(m.de, await agente.responder({ dono: m.de, texto: m.texto.slice(0, 4000) }));
      } catch (err) {
        console.error("[whatsapp]", err.message ?? err);
      }
    }
  }

  const json = (res, s, corpo) => {
    res.writeHead(s, { ...SEGURANCA, "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(corpo));
  };

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });
      if (url.pathname === "/webhook/whatsapp") {
        if (req.method === "GET") {
          const ok = url.searchParams.get("hub.mode") === "subscribe" && iguais(url.searchParams.get("hub.verify_token"), config.whatsapp.tokenVerificacao);
          res.writeHead(ok ? 200 : 403, { ...SEGURANCA, "Content-Type": "text/plain" });
          return res.end(ok ? url.searchParams.get("hub.challenge") ?? "" : "forbidden");
        }
        if (req.method === "POST") {
          const corpo = await lerCorpo(req);
          if (!assinaturaValida(corpo, req.headers["x-hub-signature-256"], config.whatsapp.segredoApp)) return json(res, 401, { erro: "assinatura inválida" });
          json(res, 200, { ok: true });
          return processar(JSON.parse(corpo.toString("utf8")));
        }
      }
      json(res, 404, { erro: "não encontrado" });
    } catch (err) {
      console.error("[servidor]", err);
      if (!res.headersSent) json(res, err.status ?? 500, { erro: "erro interno" });
    }
  });

  return { servidor, processar, agente, perfil, aprovacoes, central };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const c = configPadrao;
  if (!c.donos.length) console.warn("DONOS vazio: ninguém conseguirá dar ordens ao agente.");
  if (!c.whatsapp.segredoApp) console.warn("WHATSAPP_APP_SECRET vazio: o webhook vai recusar todas as mensagens.");
  const { servidor, central } = montarServidor();
  central.iniciar();
  servidor.listen(c.porta, () => console.log(`Nexor Agente ouvindo na porta ${c.porta} · modelo ${c.modelo}`));
}
