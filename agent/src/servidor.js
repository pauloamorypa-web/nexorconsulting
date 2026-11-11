/* Servidor HTTP da Blue, a assistente de IA da Nexor.
   GET  /health             → verificação de saúde
   POST /api/chat           → chat do site  {sessao, mensagem, modo?, negocio?} → {resposta}
   POST /api/lead           → leads do site (pré-cadastro, teste grátis, formulários abandonados)
   GET  /api/relatorio      → leads por campanha, com análise por IA (?dias=7&analise=1, exige REPORT_TOKEN)
   GET  /webhook/whatsapp   → verificação do webhook pela Meta
   POST /webhook/whatsapp   → mensagens recebidas no WhatsApp */

import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";
import { criarAgente } from "./agente.js";
import { criarArmazenamento } from "./armazenamento.js";
import { config } from "./config.js";
import { INSTRUCOES_DEMO } from "./conhecimento.js";
import { limparOrigem, rotuloOrigem, temperatura } from "./leads.js";
import { enviarParaMeta, registroConsentimento } from "./meta.js";
import { criarOrcamento } from "./orcamento.js";
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

/* IP real do visitante.
   Os cabeçalhos CF-Connecting-IP, True-Client-IP e X-Forwarded-For podem ser escritos por qualquer um.
   Só valem quando a conexão vem de um proxy confiável configurado (TRUSTED_PROXIES) ou quando o
   servidor só é alcançável por um túnel (TRUST_PROXY_TUNNEL=1). Fora disso, vale o IP da conexão. */
const semPrefixoV4 = (ip) => String(ip ?? "").replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");
const ipv4ParaNumero = (ip) => ip.split(".").reduce((n, p) => n * 256 + Number(p), 0);

/** true se o ip está na lista (IPs exatos ou faixas IPv4 em CIDR, ex.: 10.0.0.0/8). */
export function ipNaLista(ip, lista) {
  const alvo = semPrefixoV4(ip);
  if (!isIP(alvo)) return false;
  return lista.some((item) => {
    const [base, bits] = item.split("/");
    if (bits === undefined) return semPrefixoV4(base) === alvo;
    const b = Number(bits);
    if (isIP(base) !== 4 || isIP(alvo) !== 4 || !(b >= 0 && b <= 32)) return false;
    const mascara = b === 0 ? 0 : (0xffffffff << (32 - b)) >>> 0;
    return ((ipv4ParaNumero(alvo) & mascara) >>> 0) === ((ipv4ParaNumero(base) & mascara) >>> 0);
  });
}

let avisoProxy = false;
export function ipDoCliente(req, proxy = config.proxy) {
  const conexao = semPrefixoV4(req.socket?.remoteAddress) || "desconhecido";
  const confiavel = proxy.tunel || ipNaLista(conexao, proxy.confiaveis);
  const h = req.headers ?? {};
  if (!confiavel) {
    if (!avisoProxy && (h["x-forwarded-for"] || h["cf-connecting-ip"] || h["true-client-ip"])) {
      avisoProxy = true;
      console.warn(`[ip] cabeçalhos de proxy ignorados (conexão de ${conexao}). Se esse IP é do seu proxy, inclua em TRUSTED_PROXIES.`);
    }
    return conexao;
  }
  for (const nome of ["cf-connecting-ip", "true-client-ip"]) {
    const v = semPrefixoV4(String(h[nome] ?? "").trim());
    if (isIP(v)) return v;
  }
  // X-Forwarded-For: da direita para a esquerda, o primeiro endereço que não é um proxy confiável
  const cadeia = String(h["x-forwarded-for"] ?? "").split(",").map((x) => semPrefixoV4(x.trim())).filter((x) => isIP(x));
  for (let i = cadeia.length - 1; i >= 0; i--) if (!ipNaLista(cadeia[i], proxy.confiaveis) || i === 0) return cadeia[i];
  return conexao;
}

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

export function criarServidor({ agente, agenteDemo = agente, armazenamento, notificar = notificarEquipe, enviarMeta = enviarParaMeta, clienteRelatorio }) {
  const ultimosParciais = new Map(); // sessão → último lead parcial, para não repetir
  const vistas = new Set(); // ids de mensagens do WhatsApp já processadas (a Meta pode reenviar)
  const limiteChat = criarLimitador(LIMITES.chatPorIp);
  const limiteLead = criarLimitador(LIMITES.leadPorIp);
  const limiteRelatorio = criarLimitador({ quantidade: 20, janelaMs: 15 * 60_000 });
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
      // Escolha feita no aviso de cookies, guardada junto com o lead (LGPD arts. 7º I e 8º):
      // sem medicao: true, nada vai para a Meta
      consentimento: registroConsentimento(d.consentimento),
      // Receber novidades: opt-in separado, desmarcado por padrão no site
      aceita_novidades: d.novidades === true,
      registrado_em: new Date().toISOString(),
    };
    lead.consentimento_medicao = lead.consentimento.medicao;
    if (!lead.telefone && !lead.email) return json(res, 400, { erro: "informe WhatsApp ou e-mail" }, cors);

    if (lead.tipo === "parcial") {
      const chave = `${lead.telefone}|${lead.email}|${lead.nome}|${lead.pontuacao >= LEAD_FORTE}`;
      if (ultimosParciais.get(sessao) === chave) return json(res, 200, { ok: true }, cors);
      ultimosParciais.set(sessao, chave);
      if (ultimosParciais.size > 5000) ultimosParciais.delete(ultimosParciais.keys().next().value);
    }
    await armazenamento.salvarLead(lead);
    const ip = ipDoCliente(req);
    if (lead.consentimento.medicao) enviarMeta(lead, { ip, navegador: limpar(req.headers["user-agent"], 400) }).catch(() => {});

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
        const nome = m.nome ? `\n\n(nome no perfil do WhatsApp: ${String(m.nome).slice(0, 60)})` : "";
        const texto = m.texto.slice(0, config.tamanhoMaximoMensagem - nome.length);
        const { resposta } = await agente.responder({
          idConversa: `wa:${m.de}`,
          canal: "whatsapp",
          texto: texto + nome,
          telefone: m.de,
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
  const orcamento = criarOrcamento(); // um teto diário só, somando a Blue e o teste do Atende IA
  const agente = criarAgente({ armazenamento, notificar: notificarEquipe, orcamento });
  const agenteDemo = criarAgente({ armazenamento, instrucoes: INSTRUCOES_DEMO, comFerramentas: false, orcamento });
  criarServidor({ agente, agenteDemo, armazenamento }).listen(config.porta, () => {
    console.log(`Blue (Nexor) ouvindo na porta ${config.porta} · modelo ${config.modelo}`);
    if (!whatsappConfigurado()) console.log("WhatsApp não configurado: só o chat do site está ativo.");
    if (whatsappConfigurado() && !config.whatsapp.segredoApp) console.warn("WHATSAPP_APP_SECRET vazio: o webhook vai recusar todas as mensagens.");
  });
}
