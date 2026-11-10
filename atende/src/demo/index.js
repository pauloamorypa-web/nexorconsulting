/* Modo Demonstração do Nexor Atende IA (só com DEMO=1). Ver DEMO.md.
   - Simuladores no lugar da Meta (WhatsApp), da Anthropic (IA roteirizada) e da Nexor Central
   - Licença "Demonstração": tudo liberado, sem bloqueio e sem prazo (sem tocar em src/nexor/central.js)
   - Rotas /demo/* e /api/demo/*: entrar por papel, reiniciar, mensagens simuladas e cliente chegando
   - Faixa "Demonstração · dados fictícios" injetada no painel */

import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COOKIE } from "../http/api.js";
import { json, lerCookies, lerCorpo } from "../http/roteador.js";
import { gerarHashSenha, gerarToken, sha256 } from "../seguranca.js";
import { criarIASimulada } from "./ia.js";
import { CANAL, EMPRESA_ID, SENHA_DEMO, USUARIOS, semear } from "./semente.js";
import { criarSimuladorMeta } from "./simulador-meta.js";

const PUBLICO_DEMO = resolve(fileURLToPath(new URL("./publico", import.meta.url)));
const ARQUIVOS = { "/demo/faixa.js": ["faixa.js", "text/javascript; charset=utf-8"], "/demo/faixa.css": ["faixa.css", "text/css; charset=utf-8"] };
const PAPEIS = ["dono", "admin", "atendente"];
const NUMERO_PADRAO = "5534999997001"; // cliente novo que "chega" na demonstração
const NOME_PADRAO = "Mariana Alves";

/** Apaga a pasta de dados da demo (DEMO_RESET=1). Recusa caminhos que não sejam claramente de demonstração. */
export function apagarDadosDemo(pasta) {
  const alvo = resolve(pasta);
  if (!/demo/i.test(alvo) || alvo === resolve("/")) throw new Error(`DEMO_RESET recusado: a pasta de dados "${alvo}" não parece ser de demonstração (o nome precisa conter "demo").`);
  rmSync(alvo, { recursive: true, force: true });
}

/** Central de mentira: licença "Demonstração", sem rede */
function centralDemo() {
  const estado = () => ({ situacao: "ativo", mensagem: "Licença de demonstração: todos os módulos liberados, sem bloqueio e sem prazo.", link: null, manter_ponto: true, contato: null, plano: "demonstracao", teste_ate: null, limites: {}, travados: [], origem: "demo" });
  const recusa = async () => ({ ok: false, erro: "Modo demonstração: sem contato com a Nexor Central." });
  return {
    configurada: true,
    estado,
    sincronizar: recusa,
    vincular: recusa,
    conferirAcesso: () => null,
    info: () => ({ configurada: true, central: "Demonstração (sem Central)", instancia: "demonstracao", cliente: "Clínica Sorriso (fictícia)", ultimo_contato: null, ultima_tentativa: null, erro: null }),
    iniciar() {},
    parar() {},
  };
}

/**
 * Peças do modo demo que precisam existir antes da aplicação (simuladores e central).
 * Depois de montar a aplicação, chame ligar() com o repo e o atendimento.
 */
export function criarModoDemo({ cfg, agora = () => Date.now(), atrasoIA } = {}) {
  const enviadas = []; // mensagens "enviadas" pelos simuladores (WhatsApp)
  let pecas = null; // { repo, atendimento, cofre }
  const registrar = (m) => {
    enviadas.push(m);
    if (enviadas.length > 500) enviadas.splice(0, enviadas.length - 500);
  };
  const meta = criarSimuladorMeta({
    registrar,
    aoWebhook: (payload) => pecas?.atendimento.processarWebhook(payload).catch(() => {}),
    modelos: () =>
      (pecas?.repo.modelos(EMPRESA_ID) ?? []).map((m) => ({ id: m.meta_id, name: m.nome, language: m.idioma, status: m.status, category: m.categoria, components: m.componentes })),
  });
  const ia = cfg.demoIaReal ? "real" : "simulada";
  let hashSenha;
  const senha = () => (hashSenha ??= gerarHashSenha(SENHA_DEMO));

  function semearAgora() {
    const r = semear(pecas.repo, { agora: agora(), hashSenha: senha(), cofre: pecas.cofre });
    enviadas.length = 0;
    return r;
  }

  const papelInfo = (papel) => {
    const u = USUARIOS.find((x) => x.papel === papel);
    return { papel, nome: u.nome, descricao: u.descricao, url: `/demo/entrar?papel=${papel}` };
  };

  function entrar(res, papel) {
    const u = USUARIOS.find((x) => x.papel === papel);
    const token = gerarToken();
    pecas.repo.criarSessao(sha256(token), u.id, 1);
    pecas.repo.auditar(EMPRESA_ID, u.id, "login");
    const destino = papel === "atendente" ? "/#/conversas" : "/#/inicio";
    res.writeHead(302, { Location: destino, "Cache-Control": "no-store", "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400` });
    res.end();
  }

  /** Cliente mandando mensagem: monta o payload exatamente como a Meta e passa pelo mesmo caminho do webhook */
  async function receber({ de, texto, nome }) {
    const { repo, atendimento } = pecas;
    let wa = String(de ?? "").replace(/\D/g, "");
    let perfil = nome;
    if (!wa && de) {
      // "de" pode ser o nome de um contato da demo (ex.: "Fernanda")
      const achado = repo.contatos(EMPRESA_ID, { busca: String(de), limite: 1 }).itens[0];
      if (achado) [wa, perfil] = [achado.wa_id, perfil ?? achado.nome];
    }
    if (!wa) [wa, perfil] = [NUMERO_PADRAO, perfil ?? NOME_PADRAO];
    else if (wa.length <= 4) wa = `553499999${wa.padStart(4, "0")}`;
    else if (wa.length < 12) wa = `55${wa}`;
    perfil ??= repo.contatoPorWa(EMPRESA_ID, wa)?.nome ?? (wa === NUMERO_PADRAO ? NOME_PADRAO : "Cliente");
    const t = String(texto ?? "").trim().slice(0, 4000);
    if (!t) return null;
    // Se o texto é uma das opções que a IA acabou de mandar, chega como clique no botão
    const ultimaOpcao = [...enviadas].reverse().find((m) => m.para === wa && m.opcoes);
    const i = ultimaOpcao?.opcoes.findIndex((o) => o.toLowerCase() === t.toLowerCase()) ?? -1;
    const mensagem =
      i >= 0
        ? { type: "interactive", interactive: { type: ultimaOpcao.opcoes.length <= 3 ? "button_reply" : "list_reply", [ultimaOpcao.opcoes.length <= 3 ? "button_reply" : "list_reply"]: { id: `op${i + 1}`, title: ultimaOpcao.opcoes[i] } } }
        : { type: "text", text: { body: t } };
    const wamid = `wamid.DEMOIN${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await atendimento.processarWebhook({
      object: "whatsapp_business_account",
      entry: [{ id: CANAL.waba_id, changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "553499990000", phone_number_id: CANAL.phone_number_id }, contacts: [{ wa_id: wa, profile: { name: perfil } }], messages: [{ from: wa, id: wamid, timestamp: String(Math.floor(agora() / 1000)), ...mensagem }] } }] }],
    });
    const contato = repo.contatoPorWa(EMPRESA_ID, wa);
    return { ok: true, de: wa, nome: perfil, conversa_id: contato ? (repo.conversaAtiva(EMPRESA_ID, contato.id)?.id ?? null) : null, wamid };
  }

  const ROTEIRO = [
    "Oi, quanto custa uma limpeza?",
    "Ver horários",
    "Quero agendar uma avaliação",
    "Vocês atendem Amil Dental?",
    "Estou com muita dor no dente e inchou",
    "Quero falar com uma pessoa",
    "Obrigada!",
  ];

  /** Trata /demo/* e /api/demo/*. Devolve true se respondeu. */
  async function tratar(req, res, url) {
    const p = url.pathname;
    const cookies = lerCookies(req.headers.cookie);
    const logado = () => (cookies[COOKIE] ? pecas.repo.sessao(sha256(cookies[COOKIE])) : null);

    if (req.method === "GET" && ARQUIVOS[p]) {
      const [arquivo, tipo] = ARQUIVOS[p];
      res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
      res.end(readFileSync(resolve(PUBLICO_DEMO, arquivo)));
      return true;
    }
    if (req.method === "GET" && (p === "/demo" || p === "/demo/")) {
      res.writeHead(302, { Location: "/demo/entrar?papel=dono", "Cache-Control": "no-store" });
      res.end();
      return true;
    }
    if (req.method === "GET" && p === "/demo/entrar") {
      const papel = url.searchParams.get("papel") ?? "dono";
      if (!PAPEIS.includes(papel)) return json(res, 400, { erro: `Papel inválido. Use: ${PAPEIS.join(", ")}.`, papeis: PAPEIS.map(papelInfo) }), true;
      entrar(res, papel);
      return true;
    }
    if (req.method === "GET" && p === "/api/demo") {
      const u = logado();
      json(res, 200, { demo: true, sistema: "atende", nome: "Nexor Atende IA", empresa: "Clínica Sorriso", papeis: PAPEIS.map(papelInfo), ia, papel_atual: u?.papel ?? null, roteiro: ROTEIRO, cliente_padrao: { de: NUMERO_PADRAO, nome: NOME_PADRAO } });
      return true;
    }
    if (req.method === "GET" && p === "/api/demo/mensagens") {
      const para = (url.searchParams.get("para") ?? "").replace(/\D/g, "");
      const lista = (para ? enviadas.filter((m) => m.para === para) : enviadas).slice(-50).reverse();
      json(res, 200, lista);
      return true;
    }
    if (p.startsWith("/api/demo/")) {
      if (req.method !== "POST") return json(res, 405, { erro: "método não permitido" }), true;
      // Mesma proteção contra CSRF do resto da API
      if (req.headers["x-nexor"] !== "1") return json(res, 403, { erro: "requisição recusada" }), true;
      if (p === "/api/demo/reiniciar") {
        pecas.atendimento.parar();
        meta.parar();
        semearAgora();
        json(res, 200, { ok: true });
        return true;
      }
      if (p === "/api/demo/receber") {
        const b = await lerCorpo(req, 64 * 1024);
        let corpo;
        try {
          corpo = b.length ? JSON.parse(b.toString("utf8")) : {};
        } catch {
          return json(res, 400, { erro: "JSON inválido." }), true;
        }
        const r = await receber(corpo);
        if (!r) return json(res, 400, { erro: "Informe o texto da mensagem: { de, texto }." }), true;
        json(res, 200, r);
        return true;
      }
    }
    json(res, 404, { erro: "não encontrado" });
    return true;
  }

  /** index.html da demo: sem fontes externas (funciona sem internet) e com a faixa */
  const html = (texto) =>
    texto
      .replace(/\s*<link rel="preconnect"[^>]*>/g, "")
      .replace(/\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/g, "")
      .replace("</head>", '    <link rel="stylesheet" href="/demo/faixa.css" />\n  </head>')
      .replace("</body>", '    <script type="module" src="/demo/faixa.js"></script>\n  </body>');

  return {
    ia,
    fetchFn: meta.fetchFn,
    clienteIA: cfg.demoIaReal ? null : criarIASimulada({ agora, atrasoMs: atrasoIA ?? 700 }),
    central: centralDemo(),
    enviadas,
    html,
    tratar,
    receber,
    /** Liga o modo demo à aplicação montada: semeia se o banco estiver vazio */
    ligar({ repo, atendimento, cofre }) {
      pecas = { repo, atendimento, cofre };
      if (!repo.empresa(EMPRESA_ID)) semearAgora();
    },
    reiniciar: () => semearAgora(),
    parar: () => meta.parar(),
  };
}
