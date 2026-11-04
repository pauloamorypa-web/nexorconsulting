/* Núcleo do Nexor Contábil: arquivos criptografados, recebimento e leitura de documentos, pré-lançamentos,
   régua de cobrança de documentos, avisos de guias, WhatsApp do escritório e a rotina diária. */

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTAS_PADRAO, REGUA_PADRAO } from "../regras/catalogo.js";
import { dataBR, diasEntre, hojeBR, horaBR, nomeMes } from "../regras/datas.js";
import { gerarPendencias, gerarTarefas, semearEscritorio } from "../regras/geracao.js";
import { contextoCliente, responderCliente } from "../ia/assistente.js";
import { CUMPRE, MIMES_IA, competenciaDe, conferir, lerDocumento, sugerirLancamentos } from "../ia/leitura.js";
import { criarEmail, criarWhatsApp, mensagensDoWebhook, mesmoFone, normalizarFone } from "./canais.js";

/** Arquivos aceitos: documentos de escritório (o navegador e o WhatsApp mandam estes tipos) */
export const MIMES_ACEITOS = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "text/xml", "application/xml", "text/plain", "text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/x-ofx", "application/ofx", "application/octet-stream"]);
const EXT_OK = /\.(pdf|jpe?g|png|webp|gif|heic|xml|txt|csv|xls|xlsx|ofx)$/i;

export const CONFIG_PADRAO = {
  contas: CONTAS_PADRAO,
  regua: REGUA_PADRAO,
  whatsapp: { id_numero: "", template_cobranca: "", template_aviso: "", idioma: "pt_BR" },
  email: { remetente: "" },
  assistente: { ativo: true, assinatura: "" },
  exportacao: { separador: ";", data: "dd/mm/aaaa", decimal: ",", cabecalho: true, colunas: ["data", "debito", "credito", "valor", "historico", "documento"] },
  portal: { cor: "#0f766e", boas_vindas: "" },
};
export function configCompleta(c = {}) {
  const r = {};
  for (const [k, v] of Object.entries(CONFIG_PADRAO)) r[k] = typeof v === "object" && !Array.isArray(v) ? { ...v, ...(c[k] ?? {}) } : (c[k] ?? v);
  for (const k of Object.keys(c)) if (!(k in r)) r[k] = c[k];
  return r;
}

export function criarNucleo({ repo, cofre, cfg, clienteIA, fetchFn = fetch, agora = () => Date.now(), licenca = () => ({ situacao: "ativo" }) }) {
  const pastaArquivos = join(cfg.pastaDados, "arquivos");
  mkdirSync(pastaArquivos, { recursive: true });
  let fila = Promise.resolve();
  const hoje = () => hojeBR(agora());
  const bloqueado = () => licenca().situacao === "bloqueado";

  const empresa = (id) => {
    const e = repo.obter("empresas", null, id);
    return e ? { ...e, config: configCompleta(e.config) } : null;
  };
  const nomeEscritorio = (e) => e.nome_fantasia || e.razao_social;
  const segredo = (v) => {
    try {
      return v ? cofre.decifrar(v) : "";
    } catch {
      return "";
    }
  };
  const whatsDe = (e) => criarWhatsApp({ token: segredo(e.config.whatsapp.token_cripto), idNumero: e.config.whatsapp.id_numero, versao: cfg.meta.versaoGraph, fetchFn });
  const emailDe = (e) => criarEmail({ chave: segredo(e.config.email.chave_cripto), remetente: e.config.email.remetente, url: cfg.email.url, fetchFn });
  const registrarEnvio = (empresa_id, cliente_id, canal, destino, motivo, status, erro = null) => repo.inserir("envios", { empresa_id, cliente_id, canal, destino, motivo, status, erro: erro ? String(erro).slice(0, 300) : null });
  const linkPortal = () => (cfg.urlPublica ? `${cfg.urlPublica}/portal/` : "o portal do escritório");

  /* ---------- Arquivos (criptografados com a MASTER_KEY) ---------- */
  async function salvarArquivo(empresa_id, { nome, mime, dados }) {
    const hash = createHash("sha256").update(dados).digest("hex");
    const a = repo.inserir("arquivos", { id: randomUUID(), empresa_id, nome: String(nome || "arquivo").slice(0, 160), mime: mime || "application/octet-stream", tamanho: dados.length, hash });
    await writeFile(join(pastaArquivos, a.id), cofre.cifrar(dados.toString("base64")));
    return a;
  }
  async function lerArquivo(empresa_id, id) {
    const a = repo.obter("arquivos", empresa_id, id);
    if (!a) return null;
    const c = await readFile(join(pastaArquivos, a.id), "utf8").catch(() => null);
    return c ? { ...a, dados: Buffer.from(cofre.decifrar(c), "base64") } : null;
  }
  async function removerArquivo(empresa_id, id) {
    if (repo.remover("arquivos", empresa_id, id)) await unlink(join(pastaArquivos, id)).catch(() => {});
  }

  /** Confere tipo e tamanho do arquivo recebido */
  function validarArquivo({ nome, mime, dados }) {
    if (!dados?.length) throw Object.assign(new Error("Arquivo vazio."), { status: 400 });
    if (dados.length > cfg.limites.tamanhoArquivo) throw Object.assign(new Error(`Arquivo maior que ${Math.round(cfg.limites.tamanhoArquivo / 1048576)} MB.`), { status: 413 });
    const m = String(mime ?? "").split(";")[0].trim().toLowerCase();
    if (!MIMES_ACEITOS.has(m) && !EXT_OK.test(nome ?? "")) throw Object.assign(new Error("Tipo de arquivo não aceito. Envie PDF, foto, XML, OFX, CSV ou planilha."), { status: 415 });
    // Confere a assinatura dos tipos que a IA lê (um .exe renomeado para .pdf não passa)
    const ini = dados.subarray(0, 12);
    const assin = { "application/pdf": () => ini.subarray(0, 4).toString() === "%PDF", "image/jpeg": () => ini[0] === 0xff && ini[1] === 0xd8, "image/png": () => ini.subarray(1, 4).toString() === "PNG", "image/webp": () => ini.subarray(8, 12).toString() === "WEBP", "image/gif": () => ini.subarray(0, 3).toString() === "GIF" };
    if (assin[m] && !assin[m]()) throw Object.assign(new Error("O conteúdo do arquivo não corresponde ao tipo informado."), { status: 415 });
    return m || "application/octet-stream";
  }

  /* ---------- Documentos ---------- */
  async function receberDocumento({ empresa_id, cliente_id = null, dados, mime, nome, origem, enviado_por, competencia = null, pendencia_id = null }) {
    const tipoMime = validarArquivo({ nome, mime, dados });
    const a = await salvarArquivo(empresa_id, { nome, mime: tipoMime, dados });
    const igual = cliente_id ? repo.um("SELECT nome, criado_em FROM documentos WHERE empresa_id = ? AND cliente_id = ? AND hash = ? LIMIT 1", empresa_id, cliente_id, a.hash) : null;
    const lerComIA = Boolean(clienteIA) && MIMES_IA.has(tipoMime) && Boolean(cliente_id);
    const d = repo.inserir("documentos", {
      empresa_id,
      cliente_id,
      arquivo_id: a.id,
      nome: a.nome,
      mime: tipoMime,
      tamanho: a.tamanho,
      hash: a.hash,
      origem,
      enviado_por,
      competencia,
      leitura_status: lerComIA ? "pendente" : "sem_ia",
      alertas: igual ? [`Arquivo idêntico ao documento "${igual.nome}" já recebido.`] : [],
    });
    if (pendencia_id) marcarPendencia(empresa_id, pendencia_id, d.id, cliente_id);
    repo.auditar(empresa_id, enviado_por ?? origem, "documento_recebido", { documento: d.id, cliente: cliente_id, origem });
    if (lerComIA) enfileirarLeitura(empresa_id, d.id);
    return repo.obter("documentos", empresa_id, d.id);
  }

  function marcarPendencia(empresa_id, pendencia_id, documento_id, cliente_id) {
    const p = repo.obter("pendencias", empresa_id, pendencia_id);
    if (!p || p.cliente_id !== cliente_id || p.status === "dispensado") return false;
    repo.atualizar("pendencias", empresa_id, p.id, { status: "recebido", documento_id, recebido_em: agora() });
    repo.atualizar("documentos", empresa_id, documento_id, { pendencia_id: p.id, competencia: repo.obter("documentos", empresa_id, documento_id)?.competencia ?? p.competencia });
    return true;
  }

  function limiteLeituraOk(empresa_id) {
    const hora = Math.floor(agora() / 3600_000);
    const u = repo.um("SELECT leituras FROM uso_ia WHERE empresa_id = ? AND hora = ?", empresa_id, hora);
    return (u?.leituras ?? 0) < cfg.ia.leiturasPorHora;
  }
  function registrarUso(empresa_id, uso, leitura = true) {
    const hora = Math.floor(agora() / 3600_000);
    repo.rodar("INSERT INTO uso_ia (empresa_id, hora, leituras, tokens_entrada, tokens_saida) VALUES (?,?,?,?,?) ON CONFLICT (empresa_id, hora) DO UPDATE SET leituras = leituras + excluded.leituras, tokens_entrada = tokens_entrada + excluded.tokens_entrada, tokens_saida = tokens_saida + excluded.tokens_saida", empresa_id, hora, leitura ? 1 : 0, uso?.input_tokens ?? 0, uso?.output_tokens ?? 0);
  }

  function enfileirarLeitura(empresa_id, documento_id) {
    fila = fila.then(() => lerAgora(empresa_id, documento_id)).catch((e) => console.error("[leitura]", e.message));
    return fila;
  }

  /** Lê o documento com a IA, confere, sugere lançamentos e cumpre a pendência correspondente */
  async function lerAgora(empresa_id, documento_id) {
    const doc = repo.obter("documentos", empresa_id, documento_id);
    if (!doc || !doc.cliente_id || !clienteIA) return;
    if (bloqueado()) return repo.atualizar("documentos", empresa_id, doc.id, { leitura_status: "pendente" });
    if (!limiteLeituraOk(empresa_id)) return repo.atualizar("documentos", empresa_id, doc.id, { leitura_status: "erro", alertas: [...doc.alertas, "Limite de leituras por hora atingido: clique em Ler de novo mais tarde."] });
    const cliente = repo.obter("clientes", empresa_id, doc.cliente_id);
    const arq = await lerArquivo(empresa_id, doc.arquivo_id);
    if (!arq) return repo.atualizar("documentos", empresa_id, doc.id, { leitura_status: "erro", alertas: ["Arquivo não encontrado no servidor."] });
    repo.atualizar("documentos", empresa_id, doc.id, { leitura_status: "lendo" });
    let r;
    try {
      r = await lerDocumento(clienteIA, { dados: arq.dados, mime: doc.mime, nome: doc.nome }, { modelo: cfg.ia.modelo, esforco: cfg.ia.esforco });
    } catch (e) {
      console.error(`[leitura] documento ${doc.id}:`, e.status ?? "", e.message);
      return repo.atualizar("documentos", empresa_id, doc.id, { leitura_status: "erro", alertas: [...doc.alertas.filter((a) => a.startsWith("Arquivo idêntico")), e.codigo === "recusa" ? e.message : "Não foi possível ler este documento agora. Clique em Ler de novo."] });
    }
    registrarUso(empresa_id, r.uso);
    const l = r.leitura;
    const duplicado = l.numero && l.emitente_cnpj && l.valor_total !== null ? repo.todos("SELECT id, nome, criado_em, leitura FROM documentos WHERE empresa_id = ? AND cliente_id = ? AND id != ? AND leitura_status = 'lido'", empresa_id, cliente.id, doc.id).find((o) => {
      const x = JSON.parse(o.leitura ?? "{}");
      return x.numero === l.numero && x.emitente_cnpj === l.emitente_cnpj && x.valor_total === l.valor_total;
    }) : null;
    const alertas = [...doc.alertas.filter((a) => a.startsWith("Arquivo idêntico")), ...conferir(l, cliente, { duplicado })];
    const competencia = doc.competencia ?? competenciaDe(l);
    repo.atualizar("documentos", empresa_id, doc.id, { leitura_status: "lido", leitura: l, tipo: l.tipo, competencia, alertas });
    // Cumpre a pendência do mês, se ainda não estava ligada a uma
    if (!doc.pendencia_id && competencia) {
      const p = repo.lista("pendencias", "WHERE empresa_id = ? AND cliente_id = ? AND competencia = ? AND status = 'pendente' ORDER BY prazo", empresa_id, cliente.id, competencia).find((x) => (CUMPRE[x.tipo] ?? []).includes(l.tipo));
      if (p) marcarPendencia(empresa_id, p.id, doc.id, cliente.id);
    }
    gerarLancamentos(empresa_id, cliente, repo.obter("documentos", empresa_id, doc.id));
  }

  function gerarLancamentos(empresa_id, cliente, doc) {
    if (!doc.leitura) return [];
    const e = empresa(empresa_id);
    repo.rodar("DELETE FROM lancamentos WHERE documento_id = ? AND status = 'sugerido'", doc.id);
    const aprendido = (chave) => {
      const a = repo.um("SELECT debito, credito FROM aprendizado WHERE cliente_id = ? AND chave = ?", cliente.id, chave);
      return a ? { debito: a.debito, credito: a.credito } : null;
    };
    const sug = sugerirLancamentos(doc.leitura, cliente, e.config.contas, aprendido);
    const criados = sug.map((s) => repo.inserir("lancamentos", { empresa_id, cliente_id: cliente.id, documento_id: doc.id, competencia: doc.competencia ?? s.data.slice(0, 7), ...s }));
    conciliar(empresa_id, cliente.id, doc.competencia);
    return criados;
  }

  /** Conciliação sugerida: movimento do extrato com documento de mesmo valor em até 5 dias */
  function conciliar(empresa_id, cliente_id, competencia) {
    if (!competencia) return;
    const todos = repo.todos("SELECT l.*, d.tipo tipo_doc FROM lancamentos l JOIN documentos d ON d.id = l.documento_id WHERE l.empresa_id = ? AND l.cliente_id = ? AND l.competencia = ?", empresa_id, cliente_id, competencia);
    const extrato = todos.filter((l) => l.tipo_doc === "extrato_bancario" && !l.conciliado_com);
    const outros = todos.filter((l) => l.tipo_doc !== "extrato_bancario");
    const usados = new Set(todos.filter((l) => l.conciliado_com).map((l) => l.conciliado_com));
    for (const m of extrato) {
      const par = outros.find((o) => !usados.has(o.documento_id) && o.valor_centavos === m.valor_centavos && Math.abs(diasEntre(o.data, m.data)) <= 5);
      if (par) {
        repo.rodar("UPDATE lancamentos SET conciliado_com = ? WHERE id = ?", par.documento_id, m.id);
        usados.add(par.documento_id);
      }
    }
  }

  /** O contador corrigiu as contas: aprende para os próximos documentos do mesmo emitente ou histórico */
  function aprender(empresa_id, cliente_id, chave, debito, credito) {
    if (!chave) return;
    repo.rodar("INSERT INTO aprendizado (id, empresa_id, cliente_id, chave, debito, credito, vezes, atualizado_em) VALUES (?,?,?,?,?,?,1,?) ON CONFLICT (cliente_id, chave) DO UPDATE SET debito = excluded.debito, credito = excluded.credito, vezes = vezes + 1, atualizado_em = excluded.atualizado_em", randomUUID(), empresa_id, cliente_id, chave, debito, credito, agora());
  }

  /** Arquivo de importação para o sistema contábil, no layout configurado pelo escritório */
  function exportar(empresa_id, lancamentos) {
    const x = empresa(empresa_id).config.exportacao;
    const sep = x.separador === "tab" ? "\t" : x.separador || ";";
    const limpa = (v) => String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(new RegExp(`\\${sep}`, "g"), " ").trim();
    const data = (d) => (x.data === "aaaa-mm-dd" ? d : x.data === "ddmmaaaa" ? `${d.slice(8, 10)}${d.slice(5, 7)}${d.slice(0, 4)}` : `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`);
    const valor = (c) => (c / 100).toFixed(2).replace(".", x.decimal === "." ? "." : ",");
    const COL = { data: (l) => data(l.data), debito: (l) => l.debito, credito: (l) => l.credito, valor: (l) => valor(l.valor_centavos), historico: (l) => l.historico, documento: (l) => l.documento_nome ?? "", cnpj_cliente: (l) => l.cliente_cnpj ?? "", competencia: (l) => l.competencia };
    const cols = (x.colunas ?? []).filter((c) => COL[c]);
    const linhas = lancamentos.map((l) => cols.map((c) => limpa(COL[c](l))).join(sep));
    return (x.cabecalho ? [cols.join(sep), ...linhas] : linhas).join("\r\n") + "\r\n";
  }

  /* ---------- Envio pelo WhatsApp e e-mail ---------- */
  function janelaAberta(empresa_id, fone) {
    const ultima = repo.todos("SELECT wa_id, criado_em FROM mensagens WHERE empresa_id = ? AND direcao = 'entrada' AND criado_em > ? ORDER BY criado_em DESC LIMIT 200", empresa_id, agora() - 24 * 3600_000);
    return ultima.some((m) => mesmoFone(m.wa_id, fone));
  }
  async function enviarWhats(e, cliente, motivo, { texto, modelo }) {
    const w = whatsDe(e);
    if (!w.ativo || !cliente.whatsapp) return { ok: false, motivo: "sem WhatsApp" };
    try {
      if (janelaAberta(e.id, cliente.whatsapp)) await w.texto(cliente.whatsapp, texto);
      else if (modelo?.nome) await w.modelo(cliente.whatsapp, modelo.nome, e.config.whatsapp.idioma || "pt_BR", modelo.parametros);
      else {
        registrarEnvio(e.id, cliente.id, "whatsapp", cliente.whatsapp, motivo, "pulado", "Fora da janela de 24 h e sem modelo aprovado configurado");
        return { ok: false, motivo: "sem modelo" };
      }
      repo.inserir("mensagens", { empresa_id: e.id, cliente_id: cliente.id, wa_id: normalizarFone(cliente.whatsapp), direcao: "saida", tipo: "texto", texto });
      registrarEnvio(e.id, cliente.id, "whatsapp", cliente.whatsapp, motivo, "enviado");
      return { ok: true };
    } catch (err) {
      registrarEnvio(e.id, cliente.id, "whatsapp", cliente.whatsapp, motivo, "erro", err.message);
      return { ok: false, motivo: err.message };
    }
  }
  async function enviarEmail(e, cliente, motivo, { assunto, texto }) {
    const m = emailDe(e);
    if (!m.ativo || !cliente.email) return { ok: false, motivo: "sem e-mail" };
    try {
      await m.enviar({ para: cliente.email, assunto, texto });
      registrarEnvio(e.id, cliente.id, "email", cliente.email, motivo, "enviado");
      return { ok: true };
    } catch (err) {
      registrarEnvio(e.id, cliente.id, "email", cliente.email, motivo, "erro", err.message);
      return { ok: false, motivo: err.message };
    }
  }

  /** Mensagem de cobrança dos documentos que faltam (uma só, com a lista) */
  function textoCobranca(e, cliente, pend) {
    const quem = cliente.contato_nome?.split(" ")[0] || cliente.nome_fantasia || cliente.razao_social;
    const lista = pend.map((p) => `• ${p.nome} (${nomeMes(p.competencia)}) até ${dataBR(p.prazo)}`).join("\n");
    return {
      texto: `Olá, ${quem}! Aqui é do ${nomeEscritorio(e)}. Para fecharmos o mês, ainda faltam:\n${lista}\n\nÉ só responder aqui com a foto ou o PDF, ou enviar pelo portal: ${linkPortal()}`,
      parametros: [quem, nomeEscritorio(e), pend.map((p) => `${p.nome} (${nomeMes(p.competencia)}) até ${dataBR(p.prazo)}`).join("; "), linkPortal()],
    };
  }

  /** Cobra os documentos de um cliente. forcar = botão "Cobrar agora" (ignora a régua) */
  async function cobrarCliente(empresa_id, cliente_id, { forcar = false } = {}) {
    if (bloqueado()) return { enviado: false, motivo: "contrato suspenso" };
    const e = empresa(empresa_id);
    const cliente = repo.obter("clientes", empresa_id, cliente_id);
    if (!cliente?.ativo || (!cliente.cobrar && !forcar)) return { enviado: false, motivo: "cobrança desligada" };
    const r = e.config.regua;
    const h = hoje();
    const pend = repo.lista("pendencias", "WHERE empresa_id = ? AND cliente_id = ? AND status = 'pendente' ORDER BY prazo", empresa_id, cliente_id);
    if (!pend.length) return { enviado: false, motivo: "nada pendente" };
    const devidas = forcar
      ? pend
      : pend.filter((p) => {
          if (p.cobrancas >= r.maximo) return false;
          if (p.cobrancas === 0) return diasEntre(p.prazo, h) <= r.antes;
          return diasEntre(h, hojeBR(p.ultima_cobranca)) >= r.a_cada;
        });
    if (!devidas.length) return { enviado: false, motivo: "fora da régua" };
    const msg = textoCobranca(e, cliente, pend);
    const canais = r.canais ?? ["whatsapp", "email"];
    const resultados = [];
    if (canais.includes("whatsapp")) resultados.push(await enviarWhats(e, cliente, "cobranca", { texto: msg.texto, modelo: e.config.whatsapp.template_cobranca ? { nome: e.config.whatsapp.template_cobranca, parametros: msg.parametros } : null }));
    if (canais.includes("email")) resultados.push(await enviarEmail(e, cliente, "cobranca", { assunto: `${nomeEscritorio(e)}: documentos pendentes`, texto: msg.texto }));
    const ok = resultados.some((x) => x.ok);
    if (ok) for (const p of pend) repo.rodar("UPDATE pendencias SET cobrancas = cobrancas + ?, ultima_cobranca = ? WHERE id = ?", devidas.some((d) => d.id === p.id) ? 1 : 0, agora(), p.id);
    return { enviado: ok, motivo: ok ? null : resultados.map((x) => x.motivo).join("; "), itens: pend.length };
  }

  /** Avisa o cliente de uma guia ou relatório novo */
  async function avisarEntrega(empresa_id, entrega_id) {
    if (bloqueado()) return { ok: false };
    const e = empresa(empresa_id);
    const en = repo.obter("entregas", empresa_id, entrega_id);
    const cliente = en && repo.obter("clientes", empresa_id, en.cliente_id);
    if (!en || !cliente) return { ok: false };
    const quem = cliente.contato_nome?.split(" ")[0] || cliente.nome_fantasia || cliente.razao_social;
    const detalhe = `${en.titulo}${en.vencimento ? `, vencimento ${dataBR(en.vencimento)}` : ""}${en.valor_centavos ? `, R$ ${(en.valor_centavos / 100).toFixed(2).replace(".", ",")}` : ""}`;
    const texto = `Olá, ${quem}! O ${nomeEscritorio(e)} disponibilizou: ${detalhe}. Baixe no portal: ${linkPortal()}`;
    const r1 = await enviarWhats(e, cliente, "aviso_entrega", { texto, modelo: e.config.whatsapp.template_aviso ? { nome: e.config.whatsapp.template_aviso, parametros: [quem, nomeEscritorio(e), detalhe, linkPortal()] } : null });
    const r2 = await enviarEmail(e, cliente, "aviso_entrega", { assunto: `${nomeEscritorio(e)}: ${en.titulo}`, texto });
    if (r1.ok || r2.ok) repo.atualizar("entregas", empresa_id, en.id, { avisado: true });
    return { ok: r1.ok || r2.ok };
  }

  /* ---------- WhatsApp recebido ---------- */
  function clientePorFone(empresa_id, fone) {
    const achados = new Map();
    for (const c of repo.todos("SELECT id, whatsapp FROM clientes WHERE empresa_id = ? AND ativo = 1 AND whatsapp IS NOT NULL AND whatsapp != ''", empresa_id)) if (mesmoFone(c.whatsapp, fone)) achados.set(c.id, c);
    for (const p of repo.todos("SELECT cliente_id, whatsapp FROM portal_usuarios WHERE empresa_id = ? AND ativo = 1 AND whatsapp IS NOT NULL AND whatsapp != ''", empresa_id)) if (mesmoFone(p.whatsapp, fone)) achados.set(p.cliente_id, p);
    const ids = [...achados.keys()];
    return { cliente: ids.length === 1 ? repo.obter("clientes", empresa_id, ids[0]) : null, varios: ids.length > 1 };
  }
  const avisosDesconhecido = new Map();

  async function processarWebhook(empresa_id, payload) {
    const e = empresa(empresa_id);
    const w = whatsDe(e);
    for (const m of mensagensDoWebhook(payload)) {
      if (m.numero && e.config.whatsapp.id_numero && m.numero !== e.config.whatsapp.id_numero) continue;
      if (repo.um("SELECT 1 FROM mensagens WHERE wamid = ?", m.id)) continue; // a Meta reenvia
      const { cliente, varios } = clientePorFone(empresa_id, m.de);
      let documento = null;
      try {
        if (m.midia && w.ativo) {
          const baixado = await w.baixarMidia(m.midia.id);
          const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[baixado.mime.split(";")[0]] ?? "bin";
          documento = await receberDocumento({ empresa_id, cliente_id: cliente?.id ?? null, dados: baixado.dados, mime: baixado.mime.split(";")[0], nome: m.midia.nome ?? `whatsapp-${new Date(agora()).toISOString().slice(0, 10)}.${ext}`, origem: "whatsapp", enviado_por: m.nome ?? m.de });
        }
      } catch (err) {
        console.error("[whatsapp] arquivo:", err.message);
      }
      repo.inserir("mensagens", { empresa_id, cliente_id: cliente?.id ?? null, wa_id: m.de, direcao: "entrada", tipo: m.midia ? "arquivo" : m.tipo, texto: m.texto, documento_id: documento?.id ?? null, wamid: m.id });
      if (bloqueado() || !w.ativo) continue;
      const responder = async (texto) => {
        try {
          await w.texto(m.de, texto);
          repo.inserir("mensagens", { empresa_id, cliente_id: cliente?.id ?? null, wa_id: m.de, direcao: "saida", tipo: "texto", texto });
        } catch (err) {
          console.error("[whatsapp] resposta:", err.message);
        }
      };
      if (!cliente) {
        const ultimo = avisosDesconhecido.get(m.de) ?? 0;
        if (agora() - ultimo > 86400_000) {
          avisosDesconhecido.set(m.de, agora());
          await responder(varios ? `Recebi${documento ? " seu arquivo" : " sua mensagem"}! Como este número está ligado a mais de uma empresa, a equipe do ${nomeEscritorio(e)} vai direcionar para a empresa certa.` : `Olá! Este é o atendimento do ${nomeEscritorio(e)}. Não encontrei este número no cadastro: a equipe vai entrar em contato.`);
        }
        continue;
      }
      if (documento) {
        await responder(`Recebi ${documento.nome.startsWith("whatsapp-") ? "seu arquivo" : `"${documento.nome}"`} ✅ Já está com a equipe do ${nomeEscritorio(e)}.`);
        continue;
      }
      if (!m.texto) continue;
      await atenderTexto(e, cliente, m, responder);
    }
  }

  async function atenderTexto(e, cliente, m, responder) {
    const abrirChamado = (assunto, departamento = "geral") => {
      const aberto = repo.lista("chamados", "WHERE empresa_id = ? AND cliente_id = ? AND origem = 'whatsapp' AND status != 'resolvido' ORDER BY criado_em DESC LIMIT 1", e.id, cliente.id)[0];
      const msg = { de: "cliente", nome: m.nome ?? cliente.contato_nome ?? "Cliente", texto: m.texto.slice(0, 2000), em: agora() };
      if (aberto) repo.atualizar("chamados", e.id, aberto.id, { mensagens: [...aberto.mensagens, msg], status: "aberto" });
      else repo.inserir("chamados", { empresa_id: e.id, cliente_id: cliente.id, assunto: (assunto ?? m.texto).slice(0, 140), departamento, origem: "whatsapp", mensagens: [msg] });
    };
    if (!clienteIA || !e.config.assistente.ativo) {
      abrirChamado(null);
      return responder(`Recebi sua mensagem! A equipe do ${nomeEscritorio(e)} responde em breve.`);
    }
    const historico = repo.todos("SELECT direcao, tipo, texto FROM mensagens WHERE empresa_id = ? AND cliente_id = ? AND wamid IS NOT ? ORDER BY criado_em DESC LIMIT 12", e.id, cliente.id, m.id).reverse();
    const contexto = contextoCliente({
      cliente,
      pendencias: repo.lista("pendencias", "WHERE empresa_id = ? AND cliente_id = ? AND status = 'pendente' ORDER BY prazo", e.id, cliente.id),
      entregas: repo.lista("entregas", "WHERE empresa_id = ? AND cliente_id = ? ORDER BY criado_em DESC LIMIT 8", e.id, cliente.id),
      chamados: repo.lista("chamados", "WHERE empresa_id = ? AND cliente_id = ? AND status != 'resolvido' ORDER BY criado_em DESC LIMIT 5", e.id, cliente.id),
    });
    let r;
    try {
      r = await responderCliente(clienteIA, { escritorio: nomeEscritorio(e), assinatura: e.config.assistente.assinatura, contexto, historico, texto: m.texto.slice(0, 2000) }, { modelo: cfg.ia.modelo, esforco: cfg.ia.esforco });
      registrarUso(e.id, r.uso, false);
    } catch (err) {
      console.error("[assistente]", err.message);
      abrirChamado(null);
      return responder(`Recebi sua mensagem! A equipe do ${nomeEscritorio(e)} responde em breve.`);
    }
    if (r.encaminhar_equipe) abrirChamado(r.assunto, r.departamento);
    await responder(r.resposta);
  }

  /* ---------- Rotina diária ---------- */
  async function rotina({ forcar = false } = {}) {
    const resultado = [];
    for (const e of repo.lista("empresas")) {
      const ec = { ...e, config: configCompleta(e.config) };
      const h = hoje();
      if (!forcar && (ec.config.ultima_rotina === h || horaBR(agora()) < cfg.horaRotina)) continue;
      if (bloqueado()) continue;
      semearEscritorio(repo, e.id); // obrigações novas do catálogo chegam aos escritórios antigos
      const pend = gerarPendencias(repo, e.id, h);
      const tarefas = gerarTarefas(repo, e.id, h);
      let cobrados = 0;
      if (ec.config.regua.ativa) for (const c of repo.todos("SELECT DISTINCT cliente_id FROM pendencias WHERE empresa_id = ? AND status = 'pendente'", e.id)) if ((await cobrarCliente(e.id, c.cliente_id)).enviado) cobrados++;
      repo.atualizar("empresas", null, e.id, { config: { ...e.config, ultima_rotina: h } });
      resultado.push({ empresa: e.id, pendencias: pend, tarefas, cobrados });
    }
    return resultado;
  }

  /** Resposta da equipe a um chamado que veio do WhatsApp */
  async function responderWhatsApp(empresa_id, cliente_id, texto) {
    const e = empresa(empresa_id);
    const cliente = repo.obter("clientes", empresa_id, cliente_id);
    if (!cliente) return { ok: false };
    const ultima = repo.um("SELECT wa_id FROM mensagens WHERE empresa_id = ? AND cliente_id = ? AND direcao = 'entrada' ORDER BY criado_em DESC LIMIT 1", empresa_id, cliente_id);
    return enviarWhats(e, { ...cliente, whatsapp: ultima?.wa_id ?? cliente.whatsapp }, "chamado", { texto, modelo: null });
  }

  async function testarCanal(empresa_id, canal, destino) {
    const e = empresa(empresa_id);
    try {
      if (canal === "whatsapp") {
        const w = whatsDe(e);
        if (!w.ativo) return { ok: false, erro: "Preencha o token e o ID do número do WhatsApp." };
        if (e.config.whatsapp.template_cobranca) await w.modelo(destino, e.config.whatsapp.template_cobranca, e.config.whatsapp.idioma || "pt_BR", ["Teste", nomeEscritorio(e), "teste de envio", linkPortal()]);
        else await w.texto(destino, `Teste do ${nomeEscritorio(e)} pelo Nexor Contábil ✅`);
      } else {
        const m = emailDe(e);
        if (!m.ativo) return { ok: false, erro: "Preencha a chave e o remetente do e-mail." };
        await m.enviar({ para: destino, assunto: `Teste do ${nomeEscritorio(e)}`, texto: "Teste de envio do Nexor Contábil. Se chegou, o e-mail está configurado." });
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  }

  return {
    temIA: Boolean(clienteIA),
    responderWhatsApp,
    testarCanal,
    empresa,
    configCompleta,
    salvarArquivo,
    lerArquivo,
    removerArquivo,
    validarArquivo,
    receberDocumento,
    marcarPendencia,
    enfileirarLeitura,
    gerarLancamentos,
    aprender,
    exportar,
    cobrarCliente,
    avisarEntrega,
    processarWebhook,
    rotina,
    segredo,
    /** Espera as leituras na fila (testes e desligamento) */
    ocioso: () => fila,
  };
}
