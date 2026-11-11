/* Servidor HTTP da Blue, a assistente de IA da Nexor.
   GET  /health             → verificação de saúde
   POST /api/chat           → chat do site  {sessao, mensagem, modo?, negocio?} → {resposta}
   POST /api/lead           → leads do site (pré-cadastro, teste grátis, formulários abandonados)
   GET  /api/relatorio      → leads por campanha, com análise por IA (?dias=7&analise=1, exige REPORT_TOKEN)
   GET  /webhook/whatsapp   → verificação do webhook pela Meta
   POST /webhook/whatsapp   → mensagens recebidas no WhatsApp */

import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { criarAgente } from "./agente.js";
import { criarArmazenamento } from "./armazenamento.js";
import { config } from "./config.js";
import { INSTRUCOES_DEMO } from "./conhecimento.js";
import { limparOrigem, rotuloOrigem, temperatura } from "./leads.js";
import { enviarParaMeta } from "./meta.js";
import { gerarRelatorio } from "./relatorio.js";
import { assinaturaValida, emBaloes, enviarTemplate, enviarTexto, extrairMensagens, marcarComoLida, pausaDigitando, whatsappConfigurado } from "./whatsapp.js";
import { qualificarLead } from "./vendas/qualificacao.js";
import { criarRascunhoComercial } from "./vendas/rascunho.js";
import { criarGoogleCalendar } from "./vendas/google-calendar.js";
import { criarAgendadorLembretes } from "./vendas/lembretes.js";
import { pedidoCancelarReuniao, pedidoOptOutWhatsApp } from "./vendas/consentimento.js";

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
  const maximo = Number.isFinite(quantidade) && quantidade > 0 ? Math.max(1, Math.floor(quantidade)) : 1;
  const janela = Number.isFinite(janelaMs) && janelaMs > 0 ? janelaMs : 60_000;
  const registros = new Map();
  return (chave) => {
    const t = agora();
    const lista = (registros.get(chave) ?? []).filter((x) => t - x < janela);
    if (lista.length >= maximo) {
      registros.set(chave, lista);
      return false;
    }
    lista.push(t);
    registros.set(chave, lista);
    if (registros.size > 20_000) registros.delete(registros.keys().next().value);
    return true;
  };
}

/* Cabeçalhos de IP só são confiáveis quando a borda prova que é autorizada. */
export const ipDoCliente = (req) => {
  const remoto = req.socket.remoteAddress || "desconhecido";
  if (!config.proxySecret || !tokenConfere(req.headers["x-nexor-proxy-secret"], config.proxySecret)) return remoto;
  return String(req.headers["true-client-ip"] ?? req.headers["cf-connecting-ip"] ?? "").trim() || remoto;
};

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
  console.info("[aviso] notificação comercial", { tipo: String(dados?.tipo ?? "evento").slice(0, 40) });
  const tarefas = [];
  if (config.webhookLeads) {
    tarefas.push(
      fetch(config.webhookLeads, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados), signal: AbortSignal.timeout(5000) }).then((r) => {
        if (!r.ok) throw new Error(`webhook ${r.status}`);
      }),
    );
  }
  if (whatsappConfigurado() && config.whatsapp.numeroEquipe) tarefas.push(enviarTexto(config.whatsapp.numeroEquipe, texto));
  for (const r of await Promise.allSettled(tarefas)) {
    if (r.status === "rejected") console.error("[aviso] falha ao notificar", { erro: r.reason?.name ?? "Error" });
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
  res.writeHead(status, { ...SEGURANCA, "Content-Type": "application/json; charset=utf-8", ...extra });
  res.end(JSON.stringify(corpo));
};

const tokenConfere = (recebido, esperado) => {
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function criarServidor({ agente, agenteDemo = agente, armazenamento, calendario, notificar = notificarEquipe, enviarMeta = enviarParaMeta, clienteRelatorio, clienteVendas, enviarTextoWhatsApp = enviarTexto, marcarLidaWhatsApp = marcarComoLida }) {
  const ultimosParciais = new Map(); // sessão → último lead parcial, para não repetir
  const vistas = new Set(); // ids de mensagens do WhatsApp já processadas (a Meta pode reenviar)
  const limiteChat = criarLimitador(LIMITES.chatPorIp);
  const limiteLead = criarLimitador(LIMITES.leadPorIp);
  const limiteRelatorio = criarLimitador({ quantidade: 20, janelaMs: 15 * 60_000 });
  const limiteVendas = criarLimitador({ quantidade: 60, janelaMs: 5 * 60_000 });
  const limiteRascunhoIp = criarLimitador({ quantidade: 10, janelaMs: 60_000 });
  const limiteRascunhoGlobal = criarLimitador({ quantidade: 100, janelaMs: 60 * 60_000 });
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

  async function qualificarLeadComercial(req, res) {
    if (!config.vendas.habilitado || config.vendas.token.length < 32) return json(res, 404, { erro: "não encontrado" });
    const recebido = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!tokenConfere(recebido, config.vendas.token)) return json(res, 401, { erro: "não autorizado" });
    if (!limiteVendas(ipDoCliente(req))) return json(res, 429, { erro: "muitas tentativas" }, { "Retry-After": "300" });

    let dados;
    try {
      dados = JSON.parse((await lerCorpo(req)).toString("utf8"));
    } catch (err) {
      return json(res, err.status ?? 400, { erro: "JSON inválido" });
    }

    let resultado;
    try {
      resultado = qualificarLead(dados);
    } catch (err) {
      if (err?.name === "ZodError") return json(res, 400, { erro: "dados inválidos", campos: err.issues.map((i) => i.path.join(".")) });
      throw err;
    }

    const lead = {
      id: randomUUID(),
      tipo: "vendas_qualificacao",
      ...resultado.lead,
      score: resultado.score,
      temperatura: resultado.temperatura,
      produto_recomendado: resultado.produto_recomendado,
      confianca_recomendacao: resultado.confianca_recomendacao,
      proxima_acao: resultado.proxima_acao,
      contato_permitido: resultado.contato_permitido,
      envio_automatico_habilitado: false,
      registrado_em: new Date().toISOString(),
    };
    await armazenamento.salvarLead(lead);

    if (resultado.score >= 40) {
      const contato = lead.contato.whatsapp ?? lead.contato.email ?? "sem contato";
      await notificar(
        `🟦 Lead comercial ${resultado.temperatura} (${resultado.score}/100)\n${lead.nome} · ${lead.empresa}\n` +
          `Solução: ${resultado.produto_recomendado ?? "a confirmar"}\nPróxima ação: ${resultado.proxima_acao}\nContato: ${contato}\n` +
          `Origem: ${lead.canal_origem}${lead.fonte_url ? ` · ${lead.fonte_url}` : ""}`,
        { tipo: "vendas_qualificacao", ...lead },
      );
    }
    return json(res, 201, { ok: true, qualificacao: resultado });
  }

  async function rascunhoComercial(req, res) {
    if (!config.vendas.habilitado || config.vendas.token.length < 32) return json(res, 404, { erro: "não encontrado" });
    const recebido = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!tokenConfere(recebido, config.vendas.token)) return json(res, 401, { erro: "não autorizado" });
    const ip = ipDoCliente(req);
    if (!limiteRascunhoIp(ip) || !limiteRascunhoGlobal("all")) return json(res, 429, { erro: "limite de geração atingido" }, { "Retry-After": "60" });
    let dados;
    try {
      dados = JSON.parse((await lerCorpo(req)).toString("utf8"));
    } catch (err) {
      return json(res, err.status ?? 400, { erro: "JSON inválido" });
    }
    try {
      const rascunho = await criarRascunhoComercial(dados, { cliente: clienteVendas });
      return json(res, 200, rascunho);
    } catch (err) {
      if (err?.name === "ZodError") return json(res, 400, { erro: "dados inválidos", campos: err.issues.map((i) => i.path.join(".")) });
      if (err?.status === 403) return json(res, 403, { erro: err.message });
      throw err;
    }
  }

  async function processarWhatsApp(payload) {
    for (const m of extrairMensagens(payload)) {
      try {
        const cancelarReuniao = pedidoCancelarReuniao(m.texto);
        const optOut = !cancelarReuniao && pedidoOptOutWhatsApp(m.texto);
        if (!m.id || vistas.has(m.id)) continue;
        const cancelados = cancelarReuniao ? await armazenamento.cancelarAgendamentos(m.de, new Date().toISOString()) : [];
        // Revoke first so a crash/restart before event-dedupe persistence cannot lose an opt-out.
        if (optOut) {
          await armazenamento.revogarLembretes(m.de, new Date().toISOString());
        }
        if (typeof armazenamento.reivindicarEventoWhatsApp === "function" && !(await armazenamento.reivindicarEventoWhatsApp(m.id))) continue;
        vistas.add(m.id);
        if (vistas.size > 5000) vistas.delete(vistas.values().next().value);
        marcarLidaWhatsApp(m.id);
        if (cancelarReuniao) {
          let falhaAgenda = false;
          for (const item of cancelados) {
            if (!item.calendar_event_id || !calendario?.configurado()) continue;
            try { await calendario.cancelarReuniao(item.calendar_event_id); } catch { falhaAgenda = true; }
          }
          await notificar("Cancelamento de reunião solicitado pelo cliente", { tipo: "cancelamento_reuniao", telefone: m.de, quantidade: cancelados.length });
          const resposta = !cancelados.length
            ? "Não encontrei uma reunião ativa vinculada a este número. Pedi à equipe que confira e te retorne."
            : falhaAgenda
              ? "Registrei o pedido de cancelamento e a equipe vai confirmar a atualização na agenda."
              : "Pronto, cancelei a reunião e os lembretes associados. Se quiser remarcar, é só me chamar.";
          await enviarTextoWhatsApp(m.de, resposta);
          continue;
        }
        if (optOut) {
          await enviarTextoWhatsApp(m.de, "Tudo certo. Cancelei os lembretes de reunião pelo WhatsApp. Você ainda pode falar com a Nexor por aqui quando quiser.");
          continue;
        }
        if (!m.texto) {
          await enviarTextoWhatsApp(m.de, "Por enquanto consigo ler só mensagens de texto. Pode me contar por escrito como posso ajudar? 🙂");
          continue;
        }
        const texto = m.texto.slice(0, config.tamanhoMaximoMensagem);
        const { resposta } = await agente.responder({
          idConversa: `wa:${m.de}`,
          canal: "whatsapp",
          texto: m.nome ? `${texto}\n\n(nome no perfil do WhatsApp: ${m.nome})` : texto,
          telefone: m.de,
        });
        // Resposta em balões, com uma pausa de "digitando" entre eles, como uma pessoa
        const baloes = emBaloes(resposta);
        for (const [i, balao] of baloes.entries()) {
          if (i > 0) await new Promise((r) => setTimeout(r, pausaDigitando(balao)));
          await enviarTextoWhatsApp(m.de, balao);
        }
      } catch (err) {
        console.error("[whatsapp] falha ao responder mensagem", { erro: err?.name ?? "Error" });
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

      if (req.method === "POST" && url.pathname === "/api/vendas/qualificar") {
        return await qualificarLeadComercial(req, res);
      }
      if (req.method === "POST" && url.pathname === "/api/vendas/rascunho") {
        return await rascunhoComercial(req, res);
      }

      if (req.method === "GET" && url.pathname === "/api/relatorio") {
        const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
        if (!limiteRelatorio(ipDoCliente(req))) return json(res, 429, { erro: "muitas tentativas" }, { "Retry-After": "900" });
        if (!tokenConfere(token, config.tokenRelatorio)) return json(res, 401, { erro: "não autorizado" });
        const dias = Math.max(1, Math.min(90, Number(url.searchParams.get("dias")) || 7));
        const relatorio = await gerarRelatorio({
          armazenamento,
          dias,
          analise: url.searchParams.get("analise") === "1",
          investimento: limpar(url.searchParams.get("investimento") ?? undefined, 500),
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
      console.error("[servidor] erro", { nome: err?.name ?? "Error", codigo: err?.code ?? "INTERNAL" });
      if (!res.headersSent) json(res, err.status ?? 500, { erro: "erro interno" });
    }
  });
}

/* Inicia o servidor quando executado diretamente: node src/servidor.js */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const armazenamento = criarArmazenamento(config.pastaDados);
  const calendario = criarGoogleCalendar();
  const agente = criarAgente({ armazenamento, notificar: notificarEquipe, calendario });
  const agenteDemo = criarAgente({ armazenamento, instrucoes: INSTRUCOES_DEMO, comFerramentas: false });
  const lembretes = criarAgendadorLembretes({
    armazenamento,
    configuracao: config.whatsapp,
    enviar: enviarTemplate,
    log: (mensagem, detalhe) => console.warn(`[vendas] ${mensagem}`, detalhe),
  });
  if (whatsappConfigurado() && config.whatsapp.templateLembrete24h && config.whatsapp.templateLembrete30m) lembretes.iniciar();
  criarServidor({ agente, agenteDemo, armazenamento, calendario, notificar: notificarEquipe }).listen(config.porta, () => {
    console.log(`Blue (Nexor) ouvindo na porta ${config.porta} · modelo ${config.modelo}`);
    if (!whatsappConfigurado()) console.log("WhatsApp não configurado: só o chat do site está ativo.");
    if (whatsappConfigurado() && !config.whatsapp.segredoApp) console.warn("WHATSAPP_APP_SECRET vazio: o webhook vai recusar todas as mensagens.");
    if (config.googleCalendar.required && !calendario.configurado()) console.warn("Google Calendar obrigatório sem credenciais: agendamentos permanecerão bloqueados.");
    if (whatsappConfigurado() && (!config.whatsapp.templateLembrete24h || !config.whatsapp.templateLembrete30m)) console.warn("Templates de lembrete WhatsApp ausentes: lembretes outbound desativados.");
  });
}
