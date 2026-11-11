/* Servidor HTTP da Blue, a assistente de IA da Nexor.
   GET  /health             → verificação de saúde
   POST /api/chat           → chat do site  {sessao, mensagem, modo?, negocio?} → {resposta}
   POST /api/lead           → leads do site (pré-cadastro, teste grátis, formulários abandonados)
   GET  /api/relatorio      → leads por campanha, com análise por IA (?dias=7&analise=1&cadencia=1, exige REPORT_TOKEN)
   POST /api/conversao      → Nexor Central avisa teste ativado / contrato fechado (exige CONVERSAO_TOKEN ou REPORT_TOKEN)
   POST /api/contato        → equipe registra o primeiro contato com um lead {lead|conversa|telefone} (exige REPORT_TOKEN)
   GET  /webhook/whatsapp   → verificação do webhook pela Meta
   POST /webhook/whatsapp   → mensagens recebidas no WhatsApp */

import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { criarAgente } from "./agente.js";
import { criarArmazenamento } from "./armazenamento.js";
import { detectarCampanha } from "./campanhas.js";
import { config } from "./config.js";
import { lerConversao, processarConversaoOffline } from "./conversao.js";
import { INSTRUCOES_DEMO } from "./conhecimento.js";
import { limparOrigem, rotuloOrigem, temperatura } from "./leads.js";
import { conversaoGoogle, enviarEventosMeta, enviarParaMeta, eventoConversao } from "./meta.js";
import { gerarRelatorio } from "./relatorio.js";
import { assinaturaValida, emBaloes, enviarTexto, extrairMensagens, marcarComoLida, pausaDigitando, whatsappConfigurado } from "./whatsapp.js";

const LIMITE_CORPO = 256 * 1024;
const SESSAO_VALIDA = /^[A-Za-z0-9_-]{8,64}$/;
const TIPOS_LEAD = new Set(["parcial", "teste", "diagnostico", "calculadora", "saida", "interesse", "blue"]);
const ID_VALIDO = /^[A-Za-z0-9-]{8,64}$/;
const LEAD_FORTE = 8; // pontuação de engajamento a partir da qual um lead parcial avisa a equipe

/* Limites contra abuso: sem eles, um robô poderia trocar de sessão a cada mensagem,
   gastar os créditos de IA e encher a base de leads falsos. */
const LIMITES = {
  chatPorIp: { quantidade: 30, janelaMs: 10 * 60_000 },
  leadPorIp: { quantidade: 12, janelaMs: 10 * 60_000 },
  chatGlobalPorHora: Number(process.env.CHAT_LIMITE_HORA ?? 600), // teto de custo: respostas de IA por hora, somando todos
};

export function criarLimitador({ quantidade, janelaMs }, agora = Date.now) {
  const registros = new Map();
  return (chave) => {
    const t = agora();
    const lista = (registros.get(chave) ?? []).filter((x) => t - x < janelaMs);
    if (lista.length >= quantidade) {
      registros.set(chave, lista);
      return false;
    }
    lista.push(t);
    registros.set(chave, lista);
    if (registros.size > 20_000) registros.delete(registros.keys().next().value);
    return true;
  };
}

/* IP real do visitante. O Render fica atrás da Cloudflare, que grava o IP verdadeiro em
   True-Client-IP / CF-Connecting-IP (e sobrescreve o que o visitante mandar). O X-Forwarded-For
   só é usado como reserva, porque o Render repassa o valor enviado pelo próprio visitante. */
export const ipDoCliente = (req) =>
  String(req.headers["true-client-ip"] ?? req.headers["cf-connecting-ip"] ?? "").trim() ||
  String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() ||
  req.socket.remoteAddress ||
  "desconhecido";

const SEGURANCA = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

const limpar = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

async function notificarEquipe(texto, dados) {
  console.log(`[aviso] ${texto.replace(/\n/g, " | ")}`);
  const tarefas = [];
  if (config.webhookLeads) {
    tarefas.push(
      fetch(config.webhookLeads, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) }).then((r) => {
        if (!r.ok) throw new Error(`webhook ${r.status}`);
      }),
    );
  }
  if (whatsappConfigurado() && config.whatsapp.numeroEquipe) tarefas.push(enviarTexto(config.whatsapp.numeroEquipe, texto));
  for (const r of await Promise.allSettled(tarefas)) {
    if (r.status === "rejected") console.error("[aviso] falha ao notificar:", r.reason?.message ?? r.reason);
  }
}

/* Conversões das conversas qualificadas (Lead, LeadQualificado, AgendouDemo).
   Meta: só com consentimento de medição (site) ou, no WhatsApp, com anúncio de origem e META_CAPI_WHATSAPP=1.
   Google: linha de conversão offline (com gclid) para LEAD_WEBHOOK_URL. */
export async function registrarConversao(evento, lead, { enviarMeta = enviarEventosMeta, fetchFn = fetch } = {}) {
  if (!lead.consentimento_medicao) return { meta: false, google: false };
  const quando = new Date();
  const doWhatsapp = lead.canal === "whatsapp";
  const meta = doWhatsapp && !(config.metaWhatsapp && lead.origem?.ctwa_clid) ? false : await enviarMeta([eventoConversao(evento, lead, quando)]);
  let google = false;
  const linha = conversaoGoogle(evento, lead, quando);
  if (linha && config.webhookLeads) {
    try {
      const r = await fetchFn(config.webhookLeads, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "conversao_google", evento, lead: lead.id, campanha: lead.campanha, google: linha }) });
      google = r.ok;
    } catch (err) {
      console.error("[google] falha ao enviar conversão ao webhook:", err.message ?? err);
    }
  }
  return { meta, google };
}

const lerCorpo = (req) =>
  new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    req.on("data", (p) => {
      tamanho += p.length;
      if (tamanho > LIMITE_CORPO) {
        reject(Object.assign(new Error("corpo grande demais"), { status: 413 }));
        req.destroy();
      } else partes.push(p);
    });
    req.on("end", () => resolve(Buffer.concat(partes)));
    req.on("error", reject);
  });

const json = (res, status, corpo, extra = {}) => {
  res.writeHead(status, { ...SEGURANCA, "Content-Type": "application/json; charset=utf-8", ...extra });
  res.end(JSON.stringify(corpo));
};

const tokenConfere = (recebido, esperado) => {
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function criarServidor({ agente, agenteDemo = agente, armazenamento, notificar = notificarEquipe, enviarMeta = enviarParaMeta, clienteRelatorio, fetchConversao = fetch }) {
  const ultimosParciais = new Map(); // sessão → último lead parcial, para não repetir
  const vistas = new Set(); // ids de mensagens do WhatsApp já processadas (a Meta pode reenviar)
  const limiteChat = criarLimitador(LIMITES.chatPorIp);
  const limiteLead = criarLimitador(LIMITES.leadPorIp);
  const limiteRelatorio = criarLimitador({ quantidade: 20, janelaMs: 15 * 60_000 });
  const limiteConversao = criarLimitador({ quantidade: 300, janelaMs: 15 * 60_000 });
  const conversoesEmCurso = new Set(); // ids em processamento: duas entregas iguais ao mesmo tempo não enviam duas vezes
  const limiteGlobal = criarLimitador({ quantidade: LIMITES.chatGlobalPorHora, janelaMs: 60 * 60_000 });

  const cabecalhosCors = (origem) =>
    origem && config.origensPermitidas.includes(origem)
      ? { "Access-Control-Allow-Origin": origem, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" }
      : {};

  async function chatDoSite(req, res) {
    const cors = cabecalhosCors(req.headers.origin);
    if (req.headers.origin && !cors["Access-Control-Allow-Origin"]) return json(res, 403, { erro: "origem não permitida" });
    if (!limiteChat(ipDoCliente(req)) || !limiteGlobal("chat")) {
      return json(res, 429, { erro: "muitas mensagens", resposta: "Recebi muitas mensagens seguidas. Aguarde alguns minutos ou fale com a equipe no WhatsApp (34) 99733-7499." }, { ...cors, "Retry-After": "300" });
    }
    let dados;
    try {
      dados = JSON.parse((await lerCorpo(req)).toString("utf8"));
    } catch (err) {
      return json(res, err.status ?? 400, { erro: "JSON inválido" }, cors);
    }
    const sessao = String(dados?.sessao ?? "");
    const mensagem = String(dados?.mensagem ?? "").trim();
    if (!SESSAO_VALIDA.test(sessao)) return json(res, 400, { erro: "sessão inválida" }, cors);
    if (!mensagem) return json(res, 400, { erro: "mensagem vazia" }, cors);
    if (mensagem.length > config.tamanhoMaximoMensagem) return json(res, 400, { erro: "mensagem longa demais" }, cors);

    if (dados.modo === "demo") {
      const n = dados.negocio ?? {};
      const empresa = `<empresa>\nNome: ${limpar(n.nome, 80) ?? "Empresa do visitante"}\nRamo: ${limpar(n.segmento, 80) ?? "não informado"}\nInformações: ${limpar(n.info, 1500) ?? "não informado"}\n</empresa>`;
      const r = await agenteDemo.responder({ idConversa: `demo:${sessao}`, canal: "site", texto: mensagem, contexto: empresa });
      return json(res, 200, { resposta: r.resposta ?? "", transferido: false }, cors);
    }
    const pagina = limpar(dados.contexto, 300);
    const origem = limparOrigem(dados.origem);
    const { resposta, transferido } = await agente.responder({
      idConversa: `site:${sessao}`,
      canal: "site",
      texto: mensagem,
      contexto: pagina ? `no site, o visitante: ${pagina}` : undefined,
      campanha: detectarCampanha({ origem, texto: mensagem }),
      origem,
      consentimento: dados.consentimento === true,
    });
    json(res, 200, { resposta: resposta ?? "Sua conversa foi passada para a equipe. Para continuar agora, chame no WhatsApp (34) 99733-7499.", transferido }, cors);
  }

  async function leadDoSite(req, res) {
    const cors = cabecalhosCors(req.headers.origin);
    if (req.headers.origin && !cors["Access-Control-Allow-Origin"]) return json(res, 403, { erro: "origem não permitida" });
    if (!limiteLead(ipDoCliente(req))) return json(res, 429, { erro: "muitas tentativas" }, { ...cors, "Retry-After": "600" });
    let d;
    try {
      d = JSON.parse((await lerCorpo(req)).toString("utf8"));
    } catch (err) {
      return json(res, err.status ?? 400, { erro: "JSON inválido" }, cors);
    }
    const sessao = String(d?.sessao ?? "");
    if (!SESSAO_VALIDA.test(sessao) || !TIPOS_LEAD.has(d?.tipo)) return json(res, 400, { erro: "dados inválidos" }, cors);
    const c = d.dados ?? {};
    const pontuacao = Math.max(0, Math.min(100, Number(d.pontuacao) || 0));
    const lead = {
      id: ID_VALIDO.test(String(d.id ?? "")) ? String(d.id) : randomUUID(),
      tipo: d.tipo,
      temperatura: temperatura(d.tipo, pontuacao),
      sessao,
      solucao: limpar(d.solucao, 80),
      nome: limpar(c.nome, 120),
      empresa: limpar(c.empresa, 160),
      telefone: limpar(c.telefone, 40),
      email: limpar(c.email, 160),
      segmento: limpar(c.segmento, 120),
      porte: limpar(c.porte, 40),
      mensagem: limpar(c.mensagem, 1500),
      formulario: limpar(d.formulario, 60),
      pontuacao,
      interesses: Array.isArray(d.interesses) ? d.interesses.slice(0, 20).map((x) => limpar(String(x), 60)) : [],
      origem: limparOrigem(d.origem),
      canal: "site",
      // Consentimento de medição de anúncios dado no aviso de cookies (LGPD): sem ele, nada vai para a Meta
      consentimento_medicao: d.consentimento === true,
      registrado_em: new Date().toISOString(),
    };
    if (!lead.telefone && !lead.email) return json(res, 400, { erro: "informe WhatsApp ou e-mail" }, cors);
    lead.campanha = detectarCampanha({ origem: lead.origem, texto: lead.solucao ?? "" }).id;

    if (lead.tipo === "parcial") {
      const chave = `${lead.telefone}|${lead.email}|${lead.nome}|${lead.pontuacao >= LEAD_FORTE}`;
      if (ultimosParciais.get(sessao) === chave) return json(res, 200, { ok: true }, cors);
      ultimosParciais.set(sessao, chave);
      if (ultimosParciais.size > 5000) ultimosParciais.delete(ultimosParciais.keys().next().value);
    }
    await armazenamento.salvarLead(lead);
    const ip = ipDoCliente(req);
    if (lead.consentimento_medicao) enviarMeta(lead, { ip, navegador: limpar(req.headers["user-agent"], 400) }).catch(() => {});

    const forte = lead.tipo !== "parcial" || lead.pontuacao >= LEAD_FORTE;
    if (forte) {
      const titulo = {
        parcial: "🟧 Lead quente que não finalizou o cadastro",
        teste: "🟦 Novo teste grátis",
        diagnostico: "🟩 Pedido de diagnóstico",
        calculadora: "🟦 Lead da calculadora de retorno",
        saida: "🟧 Lead capturado antes de sair do site",
        interesse: "🟩 Quer implantar após o teste",
        blue: "🟦 Lead coletado pela Blue",
      }[lead.tipo];
      await notificar(
        `${titulo}${lead.solucao ? ` · ${lead.solucao}` : ""}\n${lead.nome ?? "Sem nome"}${lead.empresa ? ` · ${lead.empresa}` : ""}\n` +
          `${{ quente: "🔥 Quente", morno: "🌤️ Morno", frio: "❄️ Frio" }[lead.temperatura]} · origem: ${rotuloOrigem(lead.origem)}\n` +
          `Contato: ${lead.telefone ?? lead.email}\nEngajamento: ${lead.pontuacao} pontos${lead.interesses.length ? ` · viu: ${lead.interesses.join(", ")}` : ""}` +
          `${lead.mensagem ? `\nMensagem: ${lead.mensagem}` : ""}`,
        { ...lead },
      );
    }
    json(res, 200, { ok: true }, cors);
  }

  async function processarWhatsApp(payload) {
    for (const m of extrairMensagens(payload)) {
      if (vistas.has(m.id)) continue;
      vistas.add(m.id);
      if (vistas.size > 5000) vistas.delete(vistas.values().next().value);
      marcarComoLida(m.id);
      try {
        if (!m.texto) {
          await enviarTexto(m.de, "Por enquanto consigo ler só mensagens de texto. Pode me contar por escrito como posso ajudar? 🙂");
          continue;
        }
        const texto = m.texto.slice(0, config.tamanhoMaximoMensagem);
        const origem = m.referral
          ? { utm_source: "meta", utm_medium: "anuncio-whatsapp", ...(m.referral.source_id && { anuncio: m.referral.source_id }), ...(m.referral.ctwa_clid && { ctwa_clid: m.referral.ctwa_clid }) }
          : undefined;
        const { resposta } = await agente.responder({
          idConversa: `wa:${m.de}`,
          canal: "whatsapp",
          texto: m.nome ? `${texto}\n\n(nome no perfil do WhatsApp: ${m.nome})` : texto,
          telefone: m.de,
          campanha: detectarCampanha({ texto, referral: m.referral }),
          origem,
          // No WhatsApp, medição só para quem chegou por anúncio e com a opção ligada (ver META_CAPI_WHATSAPP)
          consentimento: Boolean(config.metaWhatsapp && m.referral?.ctwa_clid),
        });
        // Resposta em balões, com uma pausa de "digitando" entre eles, como uma pessoa
        const baloes = emBaloes(resposta);
        for (const [i, balao] of baloes.entries()) {
          if (i > 0) await new Promise((r) => setTimeout(r, pausaDigitando(balao)));
          await enviarTexto(m.de, balao);
        }
      } catch (err) {
        console.error(`[whatsapp] falha ao responder ${m.de}:`, err.message ?? err);
      }
    }
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });

      if (url.pathname === "/api/chat") {
        if (req.method === "OPTIONS") {
          res.writeHead(204, { ...SEGURANCA, ...cabecalhosCors(req.headers.origin), "Access-Control-Max-Age": "600" });
          return res.end();
        }
        if (req.method === "POST") return await chatDoSite(req, res);
      }

      if (url.pathname === "/api/lead") {
        if (req.method === "OPTIONS") {
          res.writeHead(204, { ...SEGURANCA, ...cabecalhosCors(req.headers.origin), "Access-Control-Max-Age": "600" });
          return res.end();
        }
        if (req.method === "POST") return await leadDoSite(req, res);
      }

      if (req.method === "POST" && url.pathname === "/api/conversao") {
        const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
        if (!limiteConversao(ipDoCliente(req))) return json(res, 429, { erro: "muitas tentativas" }, { "Retry-After": "900" });
        if (!tokenConfere(token, config.tokenConversao)) return json(res, 401, { erro: "não autorizado" });
        let d;
        try {
          d = JSON.parse((await lerCorpo(req)).toString("utf8"));
        } catch (err) {
          return json(res, err.status ?? 400, { erro: "JSON inválido" });
        }
        const conv = lerConversao(d);
        if (!conv) return json(res, 400, { erro: "informe id e evento (teste_ativado ou contrato_fechado)" });
        const chave = `${conv.id}:${conv.evento}`;
        if (conversoesEmCurso.has(chave)) return json(res, 409, { erro: "em processamento" }, { "Retry-After": "60" });
        conversoesEmCurso.add(chave);
        try {
          const r = await processarConversaoOffline(conv, { armazenamento, fetchFn: fetchConversao });
          if (!r.ok) return json(res, 502, { erro: r.erro });
          return json(res, 200, { ok: true, duplicado: Boolean(r.duplicado), lead_encontrado: Boolean(r.registro.lead), campanha: r.registro.campanha, enviado: r.registro.enviado, motivo: r.registro.motivo });
        } finally {
          conversoesEmCurso.delete(chave);
        }
      }

      if (req.method === "POST" && url.pathname === "/api/contato") {
        const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
        if (!limiteRelatorio(ipDoCliente(req))) return json(res, 429, { erro: "muitas tentativas" }, { "Retry-After": "900" });
        if (!tokenConfere(token, config.tokenRelatorio)) return json(res, 401, { erro: "não autorizado" });
        let d;
        try {
          d = JSON.parse((await lerCorpo(req)).toString("utf8"));
        } catch (err) {
          return json(res, err.status ?? 400, { erro: "JSON inválido" });
        }
        const ref = { lead: limpar(d?.lead, 80), conversa: limpar(d?.conversa, 120), telefone: limpar(d?.telefone, 40)?.replace(/\D/g, "") };
        if (!ref.lead && !ref.conversa && !ref.telefone) return json(res, 400, { erro: "informe lead, conversa ou telefone" });
        const quando = d?.quando && !Number.isNaN(Date.parse(d.quando)) ? new Date(d.quando).toISOString() : new Date().toISOString();
        await armazenamento.salvarLead({ tipo: "contato_equipe", ...Object.fromEntries(Object.entries(ref).filter(([, v]) => v)), contato_em: quando, registrado_em: new Date().toISOString() });
        return json(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/api/relatorio") {
        const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
        if (!limiteRelatorio(ipDoCliente(req))) return json(res, 429, { erro: "muitas tentativas" }, { "Retry-After": "900" });
        if (!tokenConfere(token, config.tokenRelatorio)) return json(res, 401, { erro: "não autorizado" });
        const dias = Math.max(1, Math.min(90, Number(url.searchParams.get("dias")) || 7));
        const relatorio = await gerarRelatorio({
          armazenamento,
          dias,
          analise: url.searchParams.get("analise") === "1",
          investimento: limpar(url.searchParams.get("investimento") ?? undefined, 500),
          cadencia: url.searchParams.get("cadencia") === "1",
          cliente: clienteRelatorio,
        });
        return json(res, 200, relatorio);
      }

      if (url.pathname === "/webhook/whatsapp") {
        if (req.method === "GET") {
          const ok = url.searchParams.get("hub.mode") === "subscribe" && tokenConfere(url.searchParams.get("hub.verify_token") ?? "", config.whatsapp.tokenVerificacao);
          res.writeHead(ok ? 200 : 403, { ...SEGURANCA, "Content-Type": "text/plain" });
          return res.end(ok ? url.searchParams.get("hub.challenge") ?? "" : "forbidden");
        }
        if (req.method === "POST") {
          const corpo = await lerCorpo(req);
          if (!assinaturaValida(corpo, req.headers["x-hub-signature-256"], config.whatsapp.segredoApp)) {
            return json(res, 401, { erro: "assinatura inválida" });
          }
          // Responde 200 na hora; a Meta reenvia se demorar
          json(res, 200, { ok: true });
          return processarWhatsApp(JSON.parse(corpo.toString("utf8")));
        }
      }

      json(res, 404, { erro: "não encontrado" });
    } catch (err) {
      console.error("[servidor]", err);
      if (!res.headersSent) json(res, err.status ?? 500, { erro: "erro interno" });
    }
  });
}

/* Inicia o servidor quando executado diretamente: node src/servidor.js */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const armazenamento = criarArmazenamento(config.pastaDados);
  const agente = criarAgente({ armazenamento, notificar: notificarEquipe, conversao: (evento, lead) => registrarConversao(evento, lead) });
  const agenteDemo = criarAgente({ armazenamento, instrucoes: INSTRUCOES_DEMO, comFerramentas: false });
  criarServidor({ agente, agenteDemo, armazenamento }).listen(config.porta, () => {
    console.log(`Blue (Nexor) ouvindo na porta ${config.porta} · modelo ${config.modelo}`);
    if (!whatsappConfigurado()) console.log("WhatsApp não configurado: só o chat do site está ativo.");
    if (whatsappConfigurado() && !config.whatsapp.segredoApp) console.warn("WHATSAPP_APP_SECRET vazio: o webhook vai recusar todas as mensagens.");
  });
}
