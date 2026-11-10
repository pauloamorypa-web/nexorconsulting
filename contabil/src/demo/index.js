/* Modo Demonstração do Nexor Contábil (DEMO=1). Ver DEMO.md.
   - Sem DEMO=1 nada disto é carregado e /demo/* e /api/demo* respondem 404.
   - Licença "Demonstração" sem falar com a Central (o arquivo compartilhado nexor/central.js não muda).
   - WhatsApp, e-mail e Asaas passam pelos simuladores; a IA é roteirizada (ou real com DEMO_IA_REAL=1).
   - Rotas: GET /demo/entrar?papel=, GET /api/demo, POST /api/demo/reiniciar, GET /api/demo/mensagens,
     POST /api/demo/receber {de, texto, arquivo?, nome?}, POST /api/demo/pagar/:id, honorários e a tela de
     pagamento fictícia do Asaas (/demo/pagamento/:id). */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { hojeBR } from "../regras/datas.js";
import { gerarHashSenha, gerarToken, sha256 } from "../seguranca.js";
import { normalizarFone, mesmoFone } from "../servicos/canais.js";
import { COOKIE_PAINEL, COOKIE_PORTAL } from "../http/validacao.js";
import { ErroHttp, json, lerCookies, lerCorpo } from "../http/roteador.js";
import { criarIaSimulada } from "./ia.js";
import { CARTEIRA, EMAILS, ID_NUMERO_DEMO, SENHA_DEMO, TABELA_HONORARIOS, semear } from "./semente.js";
import { criarSimulador, pdfDemo, travarRede } from "./simulador.js";

const MARCA = ".nexor-demo";

export const PAPEIS = [
  { papel: "dono", nome: "Marina Couto", descricao: "Contadora dona do escritório: vê tudo, configurações, equipe, honorários e auditoria.", url: "/demo/entrar?papel=dono", email: EMAILS.dono },
  { papel: "colaborador", nome: "Rafael Lima", descricao: "Colaborador do setor fiscal: confere documentos, cobra clientes e entrega obrigações (sem configurações).", url: "/demo/entrar?papel=colaborador", email: EMAILS.colaborador },
  { papel: "cliente", nome: "Juliana Prado", descricao: "Cliente no portal (Padaria Pão Dourado): envia documentos, baixa guias, paga o honorário e fala com o escritório.", url: "/demo/entrar?papel=cliente", email: EMAILS.cliente },
];

/** Antes de abrir o banco: DEMO_RESET apaga a pasta de dados (só se for uma pasta de demonstração) e a rede é travada */
export function prepararDemo(cfg) {
  const pasta = resolve(cfg.pastaDados);
  if (cfg.demoReset && existsSync(pasta)) {
    const itens = readdirSync(pasta);
    if (itens.length && !itens.includes(MARCA)) throw new Error(`DEMO_RESET recusado: ${pasta} não é uma pasta de demonstração (falta o arquivo ${MARCA}). Use DATA_DIR=./data-demo.`);
    rmSync(pasta, { recursive: true, force: true });
  }
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, MARCA), "Pasta de dados do Modo Demonstração do Nexor Contábil (dados fictícios).\n");
  return { destravar: travarRede({ iaReal: cfg.demoIaReal }) };
}

/** Licença de demonstração: tudo liberado, sem prazo, sem Central */
export function centralDemo() {
  const estado = { situacao: "ativo", mensagem: "Demonstração", link: null, manter_ponto: true, contato: null, plano: "demonstracao", teste_ate: null, limites: {}, travados: [], origem: "demonstracao" };
  const sem = async () => ({ ok: false, erro: "Modo Demonstração: a Central Nexor não é usada." });
  return {
    configurada: false,
    estado: () => ({ ...estado }),
    iniciar() {},
    parar() {},
    info: () => ({ configurada: false, central: null, instancia: null, cliente: "Demonstração", ultimo_contato: null, ultima_tentativa: null, erro: null }),
    sincronizar: sem,
    vincular: sem,
    conferirAcesso: () => null,
  };
}

/** Peças da demonstração criadas antes do núcleo: simulador de rede e IA roteirizada */
export function pecasDemo({ cfg, agora, clienteIA }) {
  const ref = { aoPagar: async () => {}, repo: null };
  const simulador = criarSimulador({ agora, segundosPagamento: cfg.demoPagamentoSegundos, aoPagar: (c) => ref.aoPagar(c) });
  const hoje = () => hojeBR(agora());
  const ia = criarIaSimulada({
    hoje,
    buscarCliente: (nome) => (ref.repo ? ref.repo.um("SELECT c.* FROM documentos d JOIN clientes c ON c.id = d.cliente_id WHERE d.nome = ? AND d.leitura_status = 'lendo' ORDER BY d.criado_em DESC LIMIT 1", nome) : null),
    honorario: (nomeCliente) => ref.honorario?.(nomeCliente) ?? null,
  });
  return { ref, simulador, clienteIA: cfg.demoIaReal && clienteIA ? clienteIA : ia, iaSimulada: ia };
}

const reais = (c) => `R$ ${(c / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const dataBR = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Rotas e rotinas da demonstração, depois do núcleo e da API */
export function criarDemo({ repo, nucleo, cofre, cfg, api, agora, pecas }) {
  const { simulador, ref } = pecas;
  ref.repo = repo;
  let senhaHash = null;
  const hoje = () => hojeBR(agora());
  const escritorio = () => {
    const e = repo.um("SELECT id FROM empresas ORDER BY criada_em LIMIT 1");
    return e ? nucleo.empresa(e.id) : null;
  };

  async function semearSeVazio() {
    repo.db.exec(TABELA_HONORARIOS);
    if (repo.um("SELECT COUNT(*) n FROM empresas").n > 0) return false;
    senhaHash ??= gerarHashSenha(SENHA_DEMO);
    pecas.iaSimulada.atraso = 0;
    try {
      await semear({ repo, nucleo, cofre, agora, senhaHash });
    } finally {
      pecas.iaSimulada.atraso = undefined;
    }
    return true;
  }

  async function reiniciar() {
    await nucleo.ocioso();
    simulador.limpar();
    const tabelas = repo.todos("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((t) => t.name);
    repo.db.exec("PRAGMA foreign_keys = OFF");
    try {
      repo.transacao(() => {
        for (const t of tabelas) repo.db.exec(`DELETE FROM "${t}"`);
      });
    } finally {
      repo.db.exec("PRAGMA foreign_keys = ON");
    }
    const pasta = join(cfg.pastaDados, "arquivos");
    rmSync(pasta, { recursive: true, force: true });
    mkdirSync(pasta, { recursive: true });
    await semearSeVazio();
  }

  /* ---------- Honorários ---------- */
  const situacao = (x) => (x.status === "pago" ? "pago" : x.vencimento < hoje() ? "atrasado" : "a_vencer");
  const comCliente = "SELECT h.*, COALESCE(c.nome_fantasia, c.razao_social) cliente, c.whatsapp, c.contato_nome FROM demo_honorarios h JOIN clientes c ON c.id = h.cliente_id";
  const honorarioPorId = (id) => repo.um(`${comCliente} WHERE h.id = ? OR h.asaas_id = ?`, id, id);
  const publico = (x) => ({ ...x, situacao: situacao(x) });

  ref.honorario = (nomeCliente) => {
    const lista = repo.todos(`${comCliente} WHERE COALESCE(c.nome_fantasia, c.razao_social) = ? ORDER BY h.vencimento DESC`, nomeCliente).map(publico);
    const aberto = lista.filter((x) => x.situacao !== "pago");
    if (!aberto.length) return lista[0] ? `Seus honorários estão em dia: o último (${reais(lista[0].valor_centavos)}) foi pago${lista[0].forma ? ` via ${lista[0].forma}` : ""}. Obrigado! 😊` : null;
    const x = aberto.at(-1);
    return `O honorário de ${x.competencia.slice(5)}/${x.competencia.slice(0, 4)} (${reais(x.valor_centavos)}) ${x.situacao === "atrasado" ? `venceu em ${dataBR(x.vencimento)}` : `vence em ${dataBR(x.vencimento)}`}. Posso gerar o Pix agora: é só pagar pelo portal (na tela inicial) que a baixa é automática.`;
  };

  async function enviarWhatsDemo(cliente_id, texto, motivo) {
    const e = escritorio();
    const c = repo.obter("clientes", e.id, cliente_id);
    if (!c?.whatsapp) return;
    await simulador.fetchFn(`https://graph.facebook.com/${cfg.meta.versaoGraph}/${ID_NUMERO_DEMO}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", to: normalizarFone(c.whatsapp), type: "text", text: { body: texto } }) });
    repo.inserir("mensagens", { empresa_id: e.id, cliente_id: c.id, wa_id: normalizarFone(c.whatsapp), direcao: "saida", tipo: "texto", texto });
    repo.inserir("envios", { empresa_id: e.id, cliente_id: c.id, canal: "whatsapp", destino: c.whatsapp, motivo, status: "enviado" });
  }

  /** Cria (ou reaproveita) a cobrança no Asaas simulado */
  async function cobrar(x, autor = "sistema") {
    if (x.status === "pago") throw new ErroHttp(409, "Este honorário já está pago.");
    if (x.asaas_id && simulador.cobrancas.has(x.asaas_id)) return honorarioPorId(x.id);
    const r = await simulador.fetchFn("https://api.asaas.com/v3/payments", { method: "POST", body: JSON.stringify({ customer: `cus_demo_${x.cliente_id.slice(0, 8)}`, billingType: "UNDEFINED", value: x.valor_centavos / 100, dueDate: x.vencimento < hoje() ? hoje() : x.vencimento, description: `Honorários contábeis ${x.competencia.slice(5)}/${x.competencia.slice(0, 4)} · ${x.cliente}`, externalReference: x.id }) });
    const c = await r.json();
    repo.rodar("UPDATE demo_honorarios SET asaas_id = ?, link = ? WHERE id = ?", c.id, c.invoiceUrl, x.id);
    repo.auditar(escritorio().id, autor, "honorario_cobrado", { honorario: x.id, asaas: c.id });
    const quem = x.contato_nome?.split(" ")[0] ?? "";
    await enviarWhatsDemo(x.cliente_id, `Olá, ${quem}! Segue o link para pagar os honorários de ${x.competencia.slice(5)}/${x.competencia.slice(0, 4)} (${reais(x.valor_centavos)}) por Pix ou boleto: ${cfg.urlPublica || `http://127.0.0.1:${cfg.porta}`}${c.invoiceUrl}`, "honorario");
    return honorarioPorId(x.id);
  }

  // Webhook do Asaas (simulado): pagamento recebido → baixa automática + agradecimento no WhatsApp
  ref.aoPagar = async (c) => {
    const x = honorarioPorId(c.id) ?? (c.externalReference ? honorarioPorId(c.externalReference) : null);
    if (!x || x.status === "pago") return;
    repo.rodar("UPDATE demo_honorarios SET status = 'pago', pago_em = ?, forma = ? WHERE id = ?", agora(), c.billingType === "BOLETO" ? "Boleto · Asaas" : "Pix · Asaas", x.id);
    repo.auditar(escritorio().id, "Asaas", "honorario_pago", { honorario: x.id, asaas: c.id, valor: x.valor_centavos });
    await enviarWhatsDemo(x.cliente_id, `Recebemos o pagamento dos honorários de ${x.competencia.slice(5)}/${x.competencia.slice(0, 4)} (${reais(x.valor_centavos)}). Obrigado! ✅\n— Equipe Escritório Exemplo`, "honorario_pago");
  };

  async function pagar(id, forma) {
    let x = honorarioPorId(id);
    if (!x) throw new ErroHttp(404, "Cobrança não encontrada.");
    if (x.status === "pago") return publico(x);
    if (!x.asaas_id || !simulador.cobrancas.has(x.asaas_id)) x = await cobrar(x);
    await simulador.pagar(x.asaas_id, forma);
    return publico(honorarioPorId(x.id));
  }

  /* ---------- Cliente manda mensagem ou arquivo pelo WhatsApp ---------- */
  async function receber(b) {
    const e = escritorio();
    const de = normalizarFone(b.de || CARTEIRA[0].whatsapp);
    if (!/^\d{12,13}$/.test(de)) throw new ErroHttp(400, "Informe o WhatsApp de quem manda, com DDD (ex.: 34999990001).");
    const texto = typeof b.texto === "string" ? b.texto.slice(0, 2000) : "";
    const temArquivo = Boolean(b.arquivo || b.nome || b.base64);
    if (!texto && !temArquivo) throw new ErroHttp(400, "Mande um texto ou um arquivo (arquivo: \"extrato\", \"nota\", \"boleto\", \"recibo\"...).");
    const desde = agora();
    const id = `wamid.demo.entrada.${randomUUID()}`;
    let midia = null;
    if (temArquivo) {
      const tipo = typeof b.arquivo === "string" ? b.arquivo.replace(/[^\w-]/g, "").slice(0, 30) : "documento";
      const nome = String(b.nome || `${tipo || "documento"}-whatsapp.pdf`).replace(/[\\/\0]/g, "_").slice(0, 120);
      const mime = b.base64 ? String(b.mime || "application/pdf") : "application/pdf";
      const dados = b.base64 ? Buffer.from(String(b.base64), "base64") : pdfDemo(nome);
      const midiaId = `midia-demo-${randomUUID()}`;
      simulador.midias.set(midiaId, { dados, mime });
      midia = { id: midiaId, mime_type: mime, filename: nome, ...(texto ? { caption: texto } : {}) };
    }
    const cad = repo.todos("SELECT nome_fantasia, razao_social, contato_nome, whatsapp FROM clientes WHERE empresa_id = ? AND ativo = 1", e.id).find((c) => mesmoFone(c.whatsapp, de));
    const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: e.config.whatsapp.id_numero }, contacts: [{ wa_id: de, profile: { name: b.nome_contato || cad?.contato_nome || "Cliente" } }], messages: [{ id, from: de, timestamp: String(Math.floor(desde / 1000)), type: midia ? "document" : "text", ...(midia ? { document: midia } : { text: { body: texto } }) }] } }] }] };
    await nucleo.processarWebhook(e.id, payload);
    await nucleo.ocioso();
    const entrada = repo.um("SELECT * FROM mensagens WHERE wamid = ?", id);
    const respostas = repo.todos("SELECT texto, criado_em FROM mensagens WHERE empresa_id = ? AND wa_id = ? AND direcao = 'saida' AND criado_em >= ? ORDER BY criado_em", e.id, de, desde).map((m) => m.texto);
    const doc = entrada?.documento_id ? repo.obter("documentos", e.id, entrada.documento_id) : null;
    const pend = doc?.pendencia_id ? repo.obter("pendencias", e.id, doc.pendencia_id) : null;
    const chamado = entrada?.cliente_id ? repo.lista("chamados", "WHERE empresa_id = ? AND cliente_id = ? AND origem = 'whatsapp' AND atualizado_em >= ? ORDER BY atualizado_em DESC LIMIT 1", e.id, entrada.cliente_id, desde)[0] : null;
    return {
      ok: true,
      de,
      cliente: cad ? cad.nome_fantasia || cad.razao_social : null,
      respostas,
      documento: doc ? { id: doc.id, nome: doc.nome, leitura_status: doc.leitura_status, tipo: doc.tipo, competencia: doc.competencia, alertas: doc.alertas, leitura: doc.leitura, pendencia_cumprida: pend ? `${pend.nome} (${pend.competencia})` : null } : null,
      chamado: chamado ? { id: chamado.id, assunto: chamado.assunto, departamento: chamado.departamento, status: chamado.status } : null,
    };
  }

  /* ---------- Sessões ---------- */
  function entrar(res, papel) {
    const p = PAPEIS.find((x) => x.papel === papel);
    if (!p) return false;
    const token = gerarToken();
    const segura = cfg.producao ? "; Secure" : "";
    if (papel === "cliente") {
      const u = repo.um("SELECT id FROM portal_usuarios WHERE email = ?", p.email);
      if (!u) return false;
      repo.criarSessao(sha256(token), { portal_id: u.id }, cfg.sessaoPortalDias);
      res.writeHead(302, { Location: "/portal/#/inicio", "Cache-Control": "no-store", "Set-Cookie": `${COOKIE_PORTAL}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${cfg.sessaoPortalDias * 86400}${segura}` });
    } else {
      const u = repo.um("SELECT id, empresa_id, nome FROM usuarios WHERE email = ?", p.email);
      if (!u) return false;
      repo.criarSessao(sha256(token), { usuario_id: u.id }, cfg.sessaoDias);
      repo.auditar(u.empresa_id, u.nome, "login_demonstracao");
      res.writeHead(302, { Location: "/#/inicio", "Cache-Control": "no-store", "Set-Cookie": `${COOKIE_PAINEL}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${cfg.sessaoDias * 86400}${segura}` });
    }
    res.end();
    return true;
  }
  function papelAtual(cookies) {
    const u = api.sessaoPainel(cookies);
    if (u) return PAPEIS.find((p) => p.email === u.email)?.papel ?? null;
    const p = api.sessaoPortal(cookies);
    return p ? "cliente" : null;
  }

  /* ---------- Tela de pagamento fictícia (como a fatura do Asaas) ---------- */
  function paginaPagamento(res, x, pago) {
    const corpo = pago || x?.status === "pago"
      ? `<div class="ok">✓</div><h1>Pagamento confirmado</h1><p>O escritório já recebeu a baixa automática. Pode fechar esta janela.</p>`
      : x
        ? `<p class="suave">Escritório Exemplo Contabilidade · cobrança ${esc(x.asaas_id ?? "")}</p><h1>${esc(reais(x.valor_centavos))}</h1><p>Honorários contábeis ${esc(x.competencia.slice(5))}/${esc(x.competencia.slice(0, 4))} · ${esc(x.cliente)}</p><div class="qr" aria-hidden="true"></div><p class="suave">Pix copia e cola (fictício): 00020126580014BR.GOV.BCB.PIX0136demo-nexor-${esc(x.id)}</p><form method="post"><button type="submit">Simular pagamento com Pix</button></form><p class="suave">Ou espere alguns segundos: a demonstração confirma o pagamento sozinha.</p>`
        : `<h1>Cobrança não encontrada</h1><p>Reinicie a demonstração e gere a cobrança de novo.</p>`;
    res.writeHead(x ? 200 : 404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" });
    res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagamento · demonstração</title><style>body{font-family:system-ui,sans-serif;background:#f1f5f9;margin:0;color:#0f172a}.faixa{background:#b45309;color:#fff;text-align:center;padding:8px 16px;font-size:14px;font-weight:600}main{max-width:420px;margin:6vh auto;background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 10px 30px #0f172a1a;text-align:center}h1{margin:.3em 0}.suave{color:#64748b;font-size:13px;word-break:break-all}.qr{width:160px;height:160px;margin:16px auto;background:repeating-conic-gradient(#0f172a 0 25%,#fff 0 50%) 0 0/20px 20px;border:8px solid #fff;outline:1px solid #e2e8f0}button{background:#0f766e;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:16px;font-weight:600;cursor:pointer;width:100%}.ok{font-size:48px;color:#15803d}</style><div class="faixa">Demonstração · dados fictícios · nenhum valor é cobrado</div><main>${corpo}</main></html>`);
  }

  /* ---------- Roteamento ---------- */
  const ehCsrfOk = (req) => req.headers["x-nexor"] === "1" || String(req.headers["content-type"] ?? "").startsWith("application/json");
  async function corpoJson(req) {
    const b = await lerCorpo(req, 4 * 1024 * 1024);
    try {
      return b.length ? JSON.parse(b.toString("utf8")) : {};
    } catch {
      throw new ErroHttp(400, "JSON inválido.");
    }
  }

  /** Trata /demo/* e /api/demo*. Devolve false se o caminho não é da demonstração. */
  async function tratar(req, res, url) {
    const caminho = url.pathname;
    if (!(caminho === "/demo" || caminho.startsWith("/demo/") || caminho === "/api/demo" || caminho.startsWith("/api/demo/"))) return false;
    const cookies = lerCookies(req.headers.cookie);
    const metodo = req.method;
    if (caminho === "/demo/entrar" && metodo === "GET") {
      if (entrar(res, url.searchParams.get("papel") ?? "dono")) return true;
      return json(res, 404, { erro: "Papel desconhecido.", papeis: PAPEIS.map((p) => p.papel) }), true;
    }
    const pg = /^\/demo\/pagamento\/([\w-]+)$/.exec(caminho);
    if (pg) {
      if (metodo === "POST") {
        await pagar(pg[1], "PIX").catch(() => null);
        return paginaPagamento(res, honorarioPorId(pg[1]), true), true;
      }
      return paginaPagamento(res, honorarioPorId(pg[1]), false), true;
    }
    if (metodo !== "GET" && caminho.startsWith("/api/") && !ehCsrfOk(req)) return json(res, 403, { erro: "requisição recusada" }), true;
    if (caminho === "/api/demo" && metodo === "GET") {
      const e = escritorio();
      return json(res, 200, { demo: true, sistema: cfg.sistema.nome, nome: cfg.sistema.nome, empresa: e ? e.nome_fantasia || e.razao_social : "Escritório Exemplo Contabilidade", papeis: PAPEIS.map(({ email, ...p }) => p), ia: cfg.demoIaReal ? "real" : "simulada", atual: papelAtual(cookies), pagamento_segundos: cfg.demoPagamentoSegundos }), true;
    }
    if (caminho === "/api/demo/reiniciar" && metodo === "POST") {
      // Quem reiniciou continua logado (o mesmo papel, nos dados novos); as outras sessões caem
      const painel = api.sessaoPainel(cookies);
      const papel = painel ? PAPEIS.find((p) => p.email === painel.email) : null;
      const portal = api.sessaoPortal(cookies);
      await reiniciar();
      if (papel && cookies[COOKIE_PAINEL]) {
        const u = repo.um("SELECT id FROM usuarios WHERE email = ?", papel.email);
        if (u) repo.criarSessao(sha256(cookies[COOKIE_PAINEL]), { usuario_id: u.id }, cfg.sessaoDias);
      }
      if (portal && cookies[COOKIE_PORTAL]) {
        const u = repo.um("SELECT id FROM portal_usuarios WHERE email = ?", portal.email);
        if (u) repo.criarSessao(sha256(cookies[COOKIE_PORTAL]), { portal_id: u.id }, cfg.sessaoPortalDias);
      }
      return json(res, 200, { ok: true }), true;
    }
    if (caminho === "/api/demo/mensagens" && metodo === "GET") return json(res, 200, simulador.log.slice(0, 50)), true;
    if (caminho === "/api/demo/receber" && metodo === "POST") return json(res, 200, await receber(await corpoJson(req))), true;
    const pagarId = /^\/api\/demo\/pagar\/([\w-]+)$/.exec(caminho);
    if (pagarId && metodo === "POST") return json(res, 200, await pagar(pagarId[1], (await corpoJson(req)).forma === "BOLETO" ? "BOLETO" : "PIX")), true;

    // Honorários no painel (dono e equipe) e no portal (só os do próprio cliente)
    if (caminho === "/api/demo/honorarios" && metodo === "GET") {
      const u = api.sessaoPainel(cookies);
      if (!u) return json(res, 401, { erro: "Faça login para continuar." }), true;
      const lista = repo.todos(`${comCliente} WHERE h.empresa_id = ? ORDER BY h.vencimento DESC, cliente`, u.empresa_id).map(publico);
      const mes = hoje().slice(0, 7);
      const soma = (f) => lista.filter(f).reduce((a, x) => a + x.valor_centavos, 0);
      return json(res, 200, { lista, resumo: { recebido_mes: soma((x) => x.status === "pago" && hojeBR(x.pago_em) >= `${mes}-01`), a_vencer: soma((x) => x.situacao === "a_vencer"), atrasado: soma((x) => x.situacao === "atrasado"), atrasados: lista.filter((x) => x.situacao === "atrasado").length }, segundos: cfg.demoPagamentoSegundos }), true;
    }
    const cob = /^\/api\/demo\/honorarios\/([\w-]+)\/cobrar$/.exec(caminho);
    if (cob && metodo === "POST") {
      const u = api.sessaoPainel(cookies);
      if (!u) return json(res, 401, { erro: "Faça login para continuar." }), true;
      const x = honorarioPorId(cob[1]);
      if (!x || x.empresa_id !== u.empresa_id) return json(res, 404, { erro: "Honorário não encontrado." }), true;
      return json(res, 200, publico(await cobrar(x, u.nome))), true;
    }
    if (caminho === "/api/demo/portal/honorarios" && metodo === "GET") {
      const p = api.sessaoPortal(cookies);
      if (!p) return json(res, 401, { erro: "Entre no portal para continuar." }), true;
      return json(res, 200, repo.todos(`${comCliente} WHERE h.cliente_id = ? ORDER BY h.vencimento DESC`, p.cliente_id).map(publico)), true;
    }
    const pp = /^\/api\/demo\/portal\/honorarios\/([\w-]+)\/pagar$/.exec(caminho);
    if (pp && metodo === "POST") {
      const p = api.sessaoPortal(cookies);
      if (!p) return json(res, 401, { erro: "Entre no portal para continuar." }), true;
      const x = honorarioPorId(pp[1]);
      if (!x || x.cliente_id !== p.cliente_id) return json(res, 404, { erro: "Honorário não encontrado." }), true;
      return json(res, 200, publico(await cobrar(x, p.nome))), true;
    }
    return json(res, 404, { erro: "não encontrado" }), true;
  }

  return { tratar, semearSeVazio, reiniciar, simulador, receber, pagar };
}
