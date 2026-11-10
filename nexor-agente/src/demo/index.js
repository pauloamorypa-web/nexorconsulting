/* Modo Demonstração do Nexor Agente (contrato comum Nexor). Só existe com DEMO=1.
   - Escuta só em 127.0.0.1 (a menos que DEMO_PUBLICO=1).
   - Toda saída de rede passa pelo simulador local; globalThis.fetch fica travado para hosts externos
     (exceção: DEMO_IA_REAL=1 + ANTHROPIC_API_KEY libera só api.anthropic.com).
   - Licença "Demonstração" sem falar com a Central (o desvio é aqui, não em src/nexor/central.js).
   - Dados fictícios da Distribuidora Vale Verde em DATA_DIR (padrão ./data-demo). */

import { existsSync } from "node:fs";
import path from "node:path";
import { lerConfig } from "../config.js";
import { carregarConectores } from "../conectores.js";
import { criarIaRoteirizada } from "./ia.js";
import { CONECTORES_DEMO, criarSimulador } from "./simulador.js";
import { DONO, EMPRESA, PENDENTES_DEMO, SOCIA, conversaInicial, semear } from "./semente.js";

export const demoLigado = (env = process.env) => env.DEMO === "1";

const LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Troca globalThis.fetch por uma trava: só localhost (e api.anthropic.com com IA real). */
export function instalarTravaDeRede({ permitirAnthropic = false } = {}) {
  const original = globalThis.fetch;
  if (original?.travaDemo) return original;
  const trava = async (entrada, opcoes) => {
    const url = new URL(String(entrada instanceof Request ? entrada.url : entrada));
    if (LOCAIS.has(url.hostname) || (permitirAnthropic && url.hostname === "api.anthropic.com")) return original(entrada, opcoes);
    throw new Error(`Demonstração: saída de rede bloqueada para ${url.hostname}`);
  };
  trava.travaDemo = true;
  globalThis.fetch = trava;
  return trava;
}

export const PAPEIS = [
  { papel: "dono", nome: DONO.nome, numero: DONO.numero, descricao: "Dono da Distribuidora Vale Verde: conversa com a Luna, aprova e recusa as ações" },
  { papel: "socia", nome: SOCIA.nome, numero: SOCIA.numero, descricao: "Sócia: também dá ordens à Luna, com as aprovações dela separadas" },
];

const LICENCA_DEMO = { situacao: "ativo", plano: "demonstracao", rotulo: "Demonstração", mensagem: "Demonstração: todos os módulos liberados, sem prazo.", link: null, limites: {}, travados: [], origem: "demonstracao" };

export function criarDemo(env = process.env, { agora = () => new Date() } = {}) {
  const pasta = path.resolve(env.DATA_DIR ?? "./data-demo");
  const iaReal = env.DEMO_IA_REAL === "1" && Boolean(env.ANTHROPIC_API_KEY);
  const config = {
    ...lerConfig({ ...env, DONOS: `${DONO.numero},${SOCIA.numero}`, DATA_DIR: pasta, PORT: env.PORT ?? "8792", APROVACAO_EXPIRA_MIN: env.APROVACAO_EXPIRA_MIN ?? "720", WHATSAPP_TOKEN: "demo-token", WHATSAPP_PHONE_NUMBER_ID: "100000000000001", WHATSAPP_VERIFY_TOKEN: "demo-verificacao", WHATSAPP_APP_SECRET: "demo-segredo-fixo" }),
    pastaDados: pasta,
    nexor: {},
    demo: true,
  };
  config.host = env.DEMO_PUBLICO === "1" ? undefined : "127.0.0.1";

  if (env.DEMO_RESET === "1" || !existsSync(path.join(pasta, "empresa.json"))) semear(pasta, agora().getTime(), { apagar: env.DEMO_RESET === "1" });
  const trava = instalarTravaDeRede({ permitirAnthropic: iaReal });
  const sim = criarSimulador({ pasta, agora: () => agora().getTime() });
  const conectores = carregarConectores({ conteudo: CONECTORES_DEMO, env: { NODE_ENV: "development" } });
  const central = { estado: () => ({ ...LICENCA_DEMO }), iniciar() {}, parar() {}, sincronizar: async () => ({ ok: true, demo: true }) };
  const cliente = iaReal ? undefined : criarIaRoteirizada({ atrasoMs: Number(env.DEMO_ATRASO_MS ?? 350) });

  let app;
  function preparar() {
    for (const p of PENDENTES_DEMO) app.aprovacoes.criar({ dono: DONO.numero, ...p });
    app.linha.definir(DONO.numero, conversaInicial(agora().getTime()));
  }

  function reiniciar() {
    semear(pasta, agora().getTime(), { apagar: false });
    sim.recarregar();
    app.perfil.recarregar();
    app.aprovacoes.limpar();
    for (const p of PAPEIS) {
      app.agente.esquecerConversa(p.numero);
      app.linha.definir(p.numero, []);
    }
    preparar();
  }

  /** Rotas de demonstração. Devolve true se tratou a requisição. */
  async function tratar(req, res, url, h) {
    if (req.method === "GET" && url.pathname === "/api/demo") {
      h.json(res, 200, { demo: true, sistema: "Nexor Agente", nome: "Nexor Agente", empresa: EMPRESA.nome, papeis: PAPEIS.map(({ papel, nome, descricao }) => ({ papel, nome, descricao, url: `/demo/entrar?papel=${papel}` })), ia: iaReal ? "real" : "simulada" });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/demo/entrar") {
      const p = PAPEIS.find((x) => x.papel === (url.searchParams.get("papel") ?? "dono"));
      if (!p) {
        h.json(res, 404, { erro: "papel desconhecido", papeis: PAPEIS.map((x) => x.papel) });
        return true;
      }
      h.entrar(res, p.numero, p.nome);
      res.writeHead(302, { Location: "/" });
      res.end();
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/demo/reiniciar") {
      reiniciar();
      h.json(res, 200, { ok: true });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/demo/mensagens") {
      h.json(res, 200, { mensagens: sim.mensagens(50) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/demo/receber") {
      const corpo = await h.lerJson(req);
      const de = String(corpo.de ?? DONO.numero).replace(/\D/g, "") || DONO.numero;
      const texto = String(corpo.texto ?? "").trim();
      if (!texto) {
        h.json(res, 400, { erro: "texto vazio" });
        return true;
      }
      const id = `wamid.ENTRADA${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const decisao = texto.match(/^(aprovar|recusar)[:\s]+([A-Za-z0-9]{7})$/i);
      const msg = decisao ? { id, from: de, type: "interactive", interactive: { type: "button_reply", button_reply: { id: `${decisao[1].toLowerCase()}:${decisao[2].toUpperCase()}` } } } : { id, from: de, type: "text", text: { body: texto } };
      const antes = sim.mensagens(500).length;
      await app.processar({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { messages: [msg] } }] }] });
      const novas = sim.mensagens(500).slice(0, Math.max(0, sim.mensagens(500).length - antes)).reverse();
      h.json(res, 200, { ok: true, respostas: novas.filter((m) => m.para === de).map((m) => m.texto) });
      return true;
    }
    return false;
  }

  return {
    config,
    conectores,
    cliente,
    central,
    fetchFn: sim.fetch,
    simulador: sim,
    trava,
    iaReal,
    tratar,
    ligar(a) {
      app = a;
      preparar();
    },
    reiniciar: () => reiniciar(),
  };
}
