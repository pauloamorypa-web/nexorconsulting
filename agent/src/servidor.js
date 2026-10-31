/* Servidor HTTP da Blue, a assistente de IA da Nexor.
   GET  /health             → verificação de saúde
   POST /api/chat           → chat do site  {sessao, mensagem, modo?, negocio?} → {resposta}
   POST /api/lead           → leads do site (pré-cadastro, teste grátis, formulários abandonados)
   GET  /webhook/whatsapp   → verificação do webhook pela Meta
   POST /webhook/whatsapp   → mensagens recebidas no WhatsApp */

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { criarAgente } from "./agente.js";
import { criarArmazenamento } from "./armazenamento.js";
import { config } from "./config.js";
import { INSTRUCOES_DEMO } from "./conhecimento.js";
import { assinaturaValida, enviarTexto, extrairMensagens, marcarComoLida, whatsappConfigurado } from "./whatsapp.js";

const LIMITE_CORPO = 256 * 1024;
const SESSAO_VALIDA = /^[A-Za-z0-9_-]{8,64}$/;
const TIPOS_LEAD = new Set(["parcial", "teste", "diagnostico", "calculadora", "saida", "interesse", "blue"]);
const LEAD_FORTE = 8; // pontuação de engajamento a partir da qual um lead parcial avisa a equipe

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
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extra });
  res.end(JSON.stringify(corpo));
};

export function criarServidor({ agente, agenteDemo = agente, armazenamento, notificar = notificarEquipe }) {
  const ultimosParciais = new Map(); // sessão → último lead parcial, para não repetir
  const vistas = new Set(); // ids de mensagens do WhatsApp já processadas (a Meta pode reenviar)

  const cabecalhosCors = (origem) =>
    origem && config.origensPermitidas.includes(origem)
      ? { "Access-Control-Allow-Origin": origem, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" }
      : {};

  async function chatDoSite(req, res) {
    const cors = cabecalhosCors(req.headers.origin);
    if (req.headers.origin && !cors["Access-Control-Allow-Origin"]) return json(res, 403, { erro: "origem não permitida" });
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
    const { resposta, transferido } = await agente.responder({
      idConversa: `site:${sessao}`,
      canal: "site",
      texto: mensagem,
      contexto: pagina ? `no site, o visitante: ${pagina}` : undefined,
    });
    json(res, 200, { resposta: resposta ?? "Sua conversa foi passada para a equipe. Para continuar agora, chame no WhatsApp (34) 99733-7499.", transferido }, cors);
  }

  async function leadDoSite(req, res) {
    const cors = cabecalhosCors(req.headers.origin);
    if (req.headers.origin && !cors["Access-Control-Allow-Origin"]) return json(res, 403, { erro: "origem não permitida" });
    let d;
    try {
      d = JSON.parse((await lerCorpo(req)).toString("utf8"));
    } catch (err) {
      return json(res, err.status ?? 400, { erro: "JSON inválido" }, cors);
    }
    const sessao = String(d?.sessao ?? "");
    if (!SESSAO_VALIDA.test(sessao) || !TIPOS_LEAD.has(d?.tipo)) return json(res, 400, { erro: "dados inválidos" }, cors);
    const c = d.dados ?? {};
    const lead = {
      tipo: d.tipo,
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
      pontuacao: Math.max(0, Math.min(100, Number(d.pontuacao) || 0)),
      interesses: Array.isArray(d.interesses) ? d.interesses.slice(0, 20).map((x) => limpar(String(x), 60)) : [],
      canal: "site",
      registrado_em: new Date().toISOString(),
    };
    if (!lead.telefone && !lead.email) return json(res, 400, { erro: "informe WhatsApp ou e-mail" }, cors);

    if (lead.tipo === "parcial") {
      const chave = `${lead.telefone}|${lead.email}|${lead.nome}|${lead.pontuacao >= LEAD_FORTE}`;
      if (ultimosParciais.get(sessao) === chave) return json(res, 200, { ok: true }, cors);
      ultimosParciais.set(sessao, chave);
      if (ultimosParciais.size > 5000) ultimosParciais.delete(ultimosParciais.keys().next().value);
    }
    await armazenamento.salvarLead(lead);

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
        const { resposta } = await agente.responder({
          idConversa: `wa:${m.de}`,
          canal: "whatsapp",
          texto: m.nome ? `${texto}\n\n(nome no perfil do WhatsApp: ${m.nome})` : texto,
          telefone: m.de,
        });
        if (resposta) await enviarTexto(m.de, resposta);
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
          res.writeHead(204, cabecalhosCors(req.headers.origin));
          return res.end();
        }
        if (req.method === "POST") return await chatDoSite(req, res);
      }

      if (url.pathname === "/api/lead") {
        if (req.method === "OPTIONS") {
          res.writeHead(204, cabecalhosCors(req.headers.origin));
          return res.end();
        }
        if (req.method === "POST") return await leadDoSite(req, res);
      }

      if (url.pathname === "/webhook/whatsapp") {
        if (req.method === "GET") {
          const ok = url.searchParams.get("hub.mode") === "subscribe" && config.whatsapp.tokenVerificacao && url.searchParams.get("hub.verify_token") === config.whatsapp.tokenVerificacao;
          res.writeHead(ok ? 200 : 403, { "Content-Type": "text/plain" });
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
  const agente = criarAgente({ armazenamento, notificar: notificarEquipe });
  const agenteDemo = criarAgente({ armazenamento, instrucoes: INSTRUCOES_DEMO, comFerramentas: false });
  criarServidor({ agente, agenteDemo, armazenamento }).listen(config.porta, () => {
    console.log(`Blue (Nexor) ouvindo na porta ${config.porta} · modelo ${config.modelo}`);
    if (!whatsappConfigurado()) console.log("WhatsApp não configurado: só o chat do site está ativo.");
    if (whatsappConfigurado() && !config.whatsapp.segredoApp) console.warn("WHATSAPP_APP_SECRET vazio: o webhook vai recusar todas as mensagens.");
  });
}
