/* Modo Demonstração do Nexor RH (só com DEMO=1). Contrato comum dos sistemas Nexor:
   - escuta só em 127.0.0.1 (a menos que DEMO_PUBLICO=1);
   - nenhuma chamada externa: eSocial, Gupy e Nexor Central respondem por simuladores locais, e o fetch global
     ganha uma trava que recusa qualquer host fora do localhost;
   - licença "Demonstração" (todos os módulos, sem prazo), sem tocar em src/nexor/central.js;
   - dados fictícios semeados (src/demo/semente.js), rotas /demo/entrar, /api/demo, /api/demo/reiniciar, /api/demo/mensagens;
   - faixa "Demonstração · dados fictícios" injetada nas páginas. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gerarToken, sha256 } from "../seguranca.js";
import { COOKIE_APP, COOKIE_PAINEL } from "../http/validacao.js";
import { json, lerCookies } from "../http/roteador.js";
import { CODIGO_APP_DEMO, SENHA_DEMO, TOKEN_QUIOSQUE_DEMO, USUARIOS_DEMO, limparBanco, semear } from "./semente.js";

const COOKIE_PAPEL = "nx_demo_papel";
const FAIXA_JS = readFileSync(fileURLToPath(new URL("./faixa.js", import.meta.url)), "utf8");

export const PAPEIS = [
  { papel: "admin", nome: USUARIOS_DEMO.admin.nome, descricao: "Administradora do RH: painel completo (ponto, folha, eSocial, recrutamento, configurações).", url: "/#/inicio" },
  { papel: "rh", nome: USUARIOS_DEMO.rh.nome, descricao: "Analista de RH: aprova pendências do ponto, fecha a folha e envia o eSocial.", url: "/#/ponto" },
  { papel: "gestor", nome: USUARIOS_DEMO.gestor.nome, descricao: "Gerente da loja: vê só a equipe de Atendimento, aprova ajustes e férias da equipe.", url: "/#/ponto" },
  { papel: "colaborador", nome: "Ana Beatriz Lima", descricao: "Atendente: app Meu Ponto no navegador (bater ponto, espelho, pedidos, holerites).", url: "/app/" },
  { papel: "quiosque", nome: "Quiosque da Loja Paulista", descricao: "Tablet da entrada: QR Code que muda a cada 30 segundos e ponto por PIN.", url: "/quiosque/" },
];

const LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Trava do fetch global: só localhost (e api.anthropic.com com DEMO_IA_REAL=1 e chave). Devolve a função que desfaz. */
export function instalarTrava({ iaReal = false } = {}) {
  const original = globalThis.fetch;
  if (original?.travaDemo) return () => {};
  const trava = (entrada, opcoes) => {
    const alvo = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    if (LOCAIS.has(alvo.hostname) || (iaReal && alvo.hostname === "api.anthropic.com")) return original(entrada, opcoes);
    return Promise.reject(new Error(`Modo demonstração: chamada externa bloqueada (${alvo.hostname}).`));
  };
  trava.travaDemo = true;
  globalThis.fetch = trava;
  return () => {
    if (globalThis.fetch === trava) globalThis.fetch = original;
  };
}

/** Simuladores locais dos serviços externos, com registro do que "saiu" */
export function criarSimuladores({ agora = () => Date.now() } = {}) {
  const registro = [];
  const anotar = (canal, destino, resumo) => {
    registro.unshift({ em: agora(), canal, destino, resumo });
    registro.length = Math.min(registro.length, 200);
  };
  const lotes = new Map();
  let seq = 0;

  /** Webservice do eSocial (produção restrita): recebe o lote e devolve todos os eventos aceitos com recibo */
  async function fetchSoap({ url, corpo }) {
    if (url.includes("enviarloteeventos")) {
      const ids = [...corpo.matchAll(/<evento Id="([^"]+)"/g)].map((m) => m[1]);
      const protocolo = `1.2.${new Date(agora()).toISOString().slice(0, 7).replace("-", "")}.${String(++seq + 1000).padStart(19, "0")}`;
      lotes.set(protocolo, ids);
      anotar("esocial", "webservices.producaorestrita.esocial.gov.br", `Lote com ${ids.length} evento(s) recebido · protocolo ${protocolo}`);
      return `<s:Envelope><s:Body><EnviarLoteEventosResponse><retornoEnvioLoteEventos><status><cdResposta>201</cdResposta><descResposta>Lote recebido com sucesso. (simulado)</descResposta></status><dadosRecepcaoLote><protocoloEnvio>${protocolo}</protocoloEnvio></dadosRecepcaoLote></retornoEnvioLoteEventos></EnviarLoteEventosResponse></s:Body></s:Envelope>`;
    }
    const protocolo = /<protocoloEnvio>([^<]+)</.exec(corpo)?.[1];
    const ids = lotes.get(protocolo) ?? [];
    anotar("esocial", "webservices.producaorestrita.esocial.gov.br", `Consulta do lote ${protocolo}: ${ids.length} evento(s) processado(s)`);
    return `<retornoProcessamentoLoteEventos><status><cdResposta>201</cdResposta><descResposta>Lote processado com sucesso. (simulado)</descResposta></status><retornoEventos>${ids
      .map((id) => `<evento Id="${id}"><retornoEvento><processamento><cdResposta>201</cdResposta><descResposta>Sucesso.</descResposta></processamento><recibo><nrRecibo>1.1.${String(agora()).slice(-10)}${String(++seq).padStart(9, "0")}</nrRecibo></recibo></retornoEvento></evento>`)
      .join("")}</retornoEventos></retornoProcessamentoLoteEventos>`;
  }

  /** fetch dos serviços HTTP (Gupy e qualquer outro): responde como o provedor, sem sair da máquina */
  async function fetchFn(entrada, opcoes = {}) {
    const url = new URL(typeof entrada === "string" ? entrada : entrada.url ?? String(entrada));
    if (LOCAIS.has(url.hostname)) return fetch(entrada, opcoes);
    const resposta = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json" } });
    if (/\/jobs\/[^/]+\/applications/.test(url.pathname)) {
      const vaga = decodeURIComponent(url.pathname.split("/jobs/")[1].split("/")[0]);
      const pagina = Number(url.searchParams.get("page") ?? 1);
      const nomes = vaga === "9001" ? ["Aline Barbosa", "Caio Mendes", "Fernanda Torres"] : ["Gustavo Ramos", "Helena Cardoso"];
      anotar("gupy", url.hostname, `Candidaturas da vaga ${vaga} (página ${pagina})`);
      return resposta({ results: pagina > 1 ? [] : nomes.map((nome, i) => ({ id: `${vaga}-${i + 1}`, jobId: vaga, candidate: { name: nome, email: `${nome.split(" ")[0].toLowerCase()}@email.example`, mobileNumber: `1199999${String(7001 + i * 13 + Number(vaga) % 100)}`, addressCity: "São Paulo" }, currentStep: { name: "Triagem" } })), totalPages: 1 });
    }
    if (/\/jobs\/?$/.test(url.pathname)) {
      anotar("gupy", url.hostname, "Vagas publicadas");
      return resposta({ results: Number(url.searchParams.get("page") ?? 1) > 1 ? [] : [{ id: 9001, name: "Padeiro(a) noturno · Gupy", addressCity: "São Paulo", addressState: "SP", description: "<p>Produção de pães franceses e especiais.</p>" }, { id: 9002, name: "Repositor(a) · Gupy", addressCity: "São Paulo", addressState: "SP", description: "<p>Reposição e organização da loja.</p>" }], totalPages: 1 });
    }
    anotar("http", url.hostname, `${opcoes.method ?? "GET"} ${url.pathname} (simulado)`);
    return resposta({ ok: true, simulado: true });
  }

  return { fetchSoap, fetchFn, mensagens: () => registro.slice(0, 50), anotar, limpar: () => (registro.length = 0) };
}

/** Licença da demonstração: no lugar da Nexor Central (nenhum contato com a Central) */
export function criarCentralDemo({ agora = () => Date.now() } = {}) {
  const ESTADO = { situacao: "ativo", mensagem: "Demonstração: todos os módulos liberados, sem prazo.", link: null, manter_ponto: true, contato: null, plano: "demonstracao", teste_ate: null, limites: {}, travados: [], origem: "demonstracao" };
  return {
    configurada: true,
    estado: () => ({ ...ESTADO }),
    sincronizar: async () => ({ ok: true, situacao: "ativo" }),
    vincular: async () => ({ ok: false, erro: "Modo demonstração: o sistema não se vincula à Nexor Central." }),
    conferirAcesso: () => null,
    info: () => ({ configurada: true, central: "Demonstração (sem Nexor Central)", instancia: "demonstracao", cliente: "Padaria Pão Dourado (demonstração)", ultimo_contato: agora(), ultima_tentativa: agora(), erro: null }),
    iniciar() {},
    parar() {},
  };
}

/** Injeta a faixa e tira as fontes externas (Google Fonts) das páginas HTML */
export function ajustarHtml(html) {
  return String(html)
    .replace(/[ \t]*<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*\n?/g, "")
    .replace("</head>", `    <script src="/demo/faixa.js" defer></script>\n  </head>`);
}

/** Passa toda resposta HTML por ajustarHtml (páginas estáticas e as páginas de vagas geradas no servidor) */
export function prepararResposta(res) {
  const end = res.end.bind(res);
  res.end = (corpo, ...resto) => {
    const tipo = String(res.getHeader("Content-Type") ?? "");
    const csp = String(res.getHeader("Content-Security-Policy") ?? "");
    if (corpo && tipo.startsWith("text/html") && /script-src 'self'/.test(csp) && !res.getHeader("Content-Length")) corpo = ajustarHtml(Buffer.isBuffer(corpo) ? corpo.toString("utf8") : corpo);
    return end(corpo, ...resto);
  };
}

/** Peças do modo demonstração montadas sobre o banco e o núcleo do servidor */
export function criarDemo({ repo, nucleo, cfg, agora = () => Date.now(), simuladores }) {
  const papelValido = (p) => PAPEIS.some((x) => x.papel === p);

  function semearSeVazio() {
    if (repo.um("SELECT COUNT(*) n FROM empresas").n > 0) return false;
    semear({ repo, nucleo, agora });
    return true;
  }
  function reiniciar() {
    limparBanco(repo);
    simuladores.limpar();
    semear({ repo, nucleo, agora });
  }

  function cookie(nome, valor, dias, httpOnly = true) {
    return [`${nome}=${valor}`, "Path=/", ...(httpOnly ? ["HttpOnly"] : []), "SameSite=Lax", `Max-Age=${Math.round(dias * 86400)}`].join("; ");
  }
  /** Abre a sessão do papel e devolve os cabeçalhos Set-Cookie */
  function sessao(papel) {
    const token = gerarToken();
    const cookies = [cookie(COOKIE_PAPEL, papel, 30, false)];
    if (papel === "quiosque") return cookies;
    if (papel === "colaborador") {
      const c = repo.um("SELECT id FROM colaboradores WHERE nome = ?", PAPEIS.find((x) => x.papel === "colaborador").nome);
      if (!c) return null;
      repo.criarSessao(sha256(token), { colaborador_id: c.id }, cfg.sessaoAppDias);
      cookies.push(cookie(COOKIE_APP, token, cfg.sessaoAppDias));
    } else {
      const u = repo.usuarioPorEmail(USUARIOS_DEMO[papel].email);
      if (!u) return null;
      repo.criarSessao(sha256(token), { usuario_id: u.id }, cfg.sessaoDias);
      repo.auditar(u.empresa_id, u.nome, "login", { demonstracao: true });
      cookies.push(cookie(COOKIE_PAINEL, token, cfg.sessaoDias));
    }
    return cookies;
  }

  const info = () => ({
    demo: true,
    sistema: "Nexor RH",
    papeis: PAPEIS.map((p) => ({ ...p, url: `/demo/entrar?papel=${p.papel}`, destino: p.url })),
    ia: cfg.demoIaReal ? "real" : "simulada",
    logins: { painel: Object.fromEntries(Object.entries(USUARIOS_DEMO).map(([k, u]) => [k, u.email])), senha: SENHA_DEMO, app_novato: { colaborador: "Henrique Alves", codigo: CODIGO_APP_DEMO } },
  });

  /** Trata as rotas de demonstração. Devolve true se respondeu. */
  async function tratar(req, res, url) {
    const p = url.pathname;
    if (req.method === "GET" && p === "/demo/faixa.js") {
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(FAIXA_JS);
      return true;
    }
    if (req.method === "GET" && (p === "/demo/entrar" || p === "/demo/entrar/")) {
      const papel = url.searchParams.get("papel") ?? "admin";
      if (!papelValido(papel)) {
        json(res, 400, { erro: `Papel desconhecido. Use: ${PAPEIS.map((x) => x.papel).join(", ")}.` });
        return true;
      }
      const cookies = sessao(papel);
      if (!cookies) {
        json(res, 409, { erro: "Dados da demonstração ausentes. Reinicie a demonstração." });
        return true;
      }
      let destino = PAPEIS.find((x) => x.papel === papel).url;
      if (papel === "quiosque") {
        const loja = repo.um("SELECT id FROM estabelecimentos WHERE nome = 'Loja Paulista'");
        if (loja) destino = `/quiosque/#${loja.id}.${TOKEN_QUIOSQUE_DEMO}`;
      }
      res.writeHead(302, { Location: destino, "Set-Cookie": cookies, "Cache-Control": "no-store" });
      res.end();
      return true;
    }
    if (p === "/api/demo" && req.method === "GET") {
      json(res, 200, info());
      return true;
    }
    if (p === "/api/demo/mensagens" && req.method === "GET") {
      json(res, 200, simuladores.mensagens());
      return true;
    }
    if (p === "/api/demo/reiniciar") {
      if (req.method !== "POST") {
        json(res, 405, { erro: "método não permitido" });
        return true;
      }
      if (req.headers["x-nexor"] !== "1") {
        json(res, 403, { erro: "requisição recusada" });
        return true;
      }
      reiniciar();
      // Continua logado no mesmo papel depois de reiniciar
      const papel = lerCookies(req.headers.cookie)[COOKIE_PAPEL];
      const cookies = papelValido(papel) ? sessao(papel) : null;
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(cookies ? { "Set-Cookie": cookies } : {}) });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }
    if (p.startsWith("/api/demo/") || p === "/demo" || p.startsWith("/demo/")) {
      json(res, 404, { erro: "não encontrado" });
      return true;
    }
    return false;
  }

  return { tratar, semearSeVazio, reiniciar, info };
}
