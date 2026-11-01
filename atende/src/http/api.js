/* Rotas da API do painel. Todas exigem login, exceto as marcadas como públicas.
   Toda consulta usa a empresa do usuário logado: uma empresa nunca vê dados de outra. */

import { z } from "zod";
import { CONFIG_PADRAO, configCompleta, ETAPAS } from "../db.js";
import { criarCloudAPI, ErroMeta, trocarCodigoPorToken, variaveisDoModelo } from "../meta/cloud-api.js";
import { conferirSenha, gerarHashSenha, gerarToken, mascarar, sha256 } from "../seguranca.js";
import { formatarQuando, horariosLivres, instanteDe, situacaoHorario } from "../servicos/agenda.js";
import { janelaAberta } from "../servicos/atendimento.js";
import { tipoWhatsApp } from "../servicos/midia.js";
import { criarRoteador, falha, lerCorpo } from "./roteador.js";

const COOKIE = "nx_sessao";
const t = (max, min = 1) => z.string().trim().min(min).max(max);
const op = (max) => z.string().trim().max(max).optional();
const email = z.string().trim().toLowerCase().email().max(160);
const senha = z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(200);

function validar(esquema, dados) {
  const r = esquema.safeParse(dados ?? {});
  if (!r.success) falha(400, r.error.issues.map((i) => `${i.path.join(".") || "dados"}: ${i.message}`).join("; "));
  return r.data;
}

const canalPublico = (c) => ({
  id: c.id,
  phone_number_id: c.phone_number_id,
  waba_id: c.waba_id,
  numero: c.numero,
  nome_verificado: c.nome_verificado,
  qualidade: c.qualidade,
  status: c.status,
  ultimo_erro: c.ultimo_erro,
  token: "••••••••",
  tem_segredo_proprio: Boolean(c.segredo_app_cripto),
  criado_em: c.criado_em,
});

const ESQUEMA_CONFIG = z
  .object({
    agente: z
      .object({
        nome: t(40),
        modo: z.enum(["automatico", "copiloto", "desligado"]),
        tom: z.enum(["amigavel", "profissional", "descontraido", "tecnico"]),
        emojis: z.enum(["nenhum", "pouco", "moderado"]),
        sobre: op(8000),
        instrucoes: op(8000),
        objetivo: op(500),
        saudacao: op(1000),
        nao_fazer: op(3000),
        agrupar_segundos: z.number().min(0).max(30),
        transferir_quando: op(1000),
        assinatura: z.boolean(),
      })
      .partial(),
    horario: z.object({ ativo: z.boolean(), dias: z.record(z.string(), z.array(z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/)).max(4)), fora_do_horario: op(500) }).partial(),
    agenda: z
      .object({
        ativa: z.boolean(),
        servicos: z.array(z.object({ nome: t(80), duracao: z.number().int().min(5).max(600) })).min(1).max(30),
        intervalo_min: z.number().int().min(10).max(240),
        antecedencia_horas: z.number().min(0).max(240),
        dias_adiante: z.number().int().min(1).max(120),
        lembrete_horas: z.number().min(0).max(72),
        modelo_lembrete: z.object({ nome: op(120), idioma: op(10) }).optional(),
      })
      .partial(),
    followup: z.object({ ativo: z.boolean(), horas: z.number().min(1).max(23), maximo: z.number().int().min(0).max(3) }).partial(),
    pagamento: z.object({ pix: op(140), instrucoes: op(2000) }).partial(),
  })
  .partial();

/**
 * @param {object} d
 * @param {ReturnType<import('../db.js').abrirBanco>} d.repo
 */
export function criarApi({ repo, cofre, atendimento, copiloto, conhecimento, eventos, midia, cfg, fetchFn = fetch, agora = () => Date.now() }) {
  const r = criarRoteador();
  const tentativas = new Map();

  /* ---------- Sessão ---------- */

  function iniciarSessao(res, usuario) {
    const token = gerarToken();
    repo.criarSessao(sha256(token), usuario.id, cfg.sessaoDias);
    const atributos = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${cfg.sessaoDias * 86400}`];
    if (cfg.producao) atributos.push("Secure");
    res.setHeader("Set-Cookie", atributos.join("; "));
  }

  function limitarLogin(chave) {
    const t0 = agora();
    const lista = (tentativas.get(chave) ?? []).filter((x) => t0 - x < 15 * 60_000);
    if (lista.length >= cfg.limites.tentativasLogin) falha(429, "Muitas tentativas. Aguarde alguns minutos.");
    lista.push(t0);
    tentativas.set(chave, lista);
    if (tentativas.size > 10_000) tentativas.delete(tentativas.keys().next().value);
  }

  const sessaoDe = (cookies) => (cookies[COOKIE] ? repo.sessao(sha256(cookies[COOKIE])) : null);

  /* ---------- Público ---------- */

  r.get("/api/estado", { publico: true }, ({ cookies }) => {
    const u = sessaoDe(cookies);
    return { primeiroAcesso: repo.contarUsuarios() === 0, cadastroAberto: cfg.permitirCadastro, logado: Boolean(u), cadastroIncorporado: Boolean(cfg.meta.idApp && cfg.meta.idConfiguracao), idApp: cfg.meta.idApp || null, idConfiguracao: cfg.meta.idConfiguracao || null };
  });

  r.post("/api/cadastro", { publico: true }, async ({ corpo, res, ip }) => {
    if (repo.contarUsuarios() > 0 && !cfg.permitirCadastro) falha(403, "O cadastro de novas empresas está fechado. Peça um convite ao administrador.");
    limitarLogin(`cadastro:${ip}`);
    const d = validar(z.object({ empresa: t(120), segmento: op(120), nome: t(120), email, senha }), await corpo());
    if (repo.usuarioComSenha(d.email)) falha(409, "Já existe uma conta com este e-mail.");
    const { usuario, empresa } = repo.transacao(() => {
      const empresa = repo.criarEmpresa({ nome: d.empresa, segmento: d.segmento, config: {} });
      const usuario = repo.criarUsuario({ empresa_id: empresa.id, nome: d.nome, email: d.email, senha_hash: gerarHashSenha(d.senha), papel: "dono" });
      return { usuario, empresa };
    });
    repo.auditar(empresa.id, usuario.id, "conta_criada");
    iniciarSessao(res, usuario);
    return { ok: true };
  });

  r.post("/api/entrar", { publico: true }, async ({ corpo, res, ip }) => {
    const d = validar(z.object({ email, senha: z.string().min(1).max(200) }), await corpo());
    limitarLogin(`login:${ip}`);
    limitarLogin(`login:${d.email}`);
    const u = repo.usuarioComSenha(d.email);
    if (!u || !conferirSenha(d.senha, u.senha_hash)) falha(401, "E-mail ou senha incorretos.");
    tentativas.delete(`login:${d.email}`);
    iniciarSessao(res, u);
    repo.auditar(u.empresa_id, u.id, "login");
    return { ok: true };
  });

  r.post("/api/sair", { publico: true }, ({ cookies, res }) => {
    if (cookies[COOKIE]) repo.encerrarSessao(sha256(cookies[COOKIE]));
    res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  /* ---------- Conta e empresa ---------- */

  r.get("/api/eu", ({ usuario, empresa }) => {
    repo.marcarOnline(usuario.id);
    const canais = repo.canais(empresa.id).map(canalPublico);
    const conhecimentoTotal = repo.conhecimento(empresa.id).length;
    const cfgE = empresa.config;
    return {
      usuario,
      empresa,
      padrao: CONFIG_PADRAO,
      canais,
      contagem: repo.contagemConversas(empresa.id, usuario.id),
      horario: situacaoHorario(cfgE.horario, agora()),
      webhook: ["dono", "admin"].includes(usuario.papel) ? { url: `${cfg.urlPublica || ""}/webhook/whatsapp`, token: cfg.meta.tokenVerificacao, segredoGlobal: Boolean(cfg.meta.segredoApp) } : null,
      checklist: {
        whatsapp: canais.some((c) => c.status === "ativo" || c.status === "conectado"),
        sobre: Boolean(cfgE.agente.sobre?.trim()),
        conhecimento: conhecimentoTotal > 0,
        testado: Boolean(cfgE.testado),
        equipe: repo.usuarios(empresa.id).length > 1,
      },
      etapas: ETAPAS,
    };
  });

  r.put("/api/empresa", { papeis: ["dono", "admin"] }, async ({ corpo, empresa, usuario }) => {
    const d = validar(z.object({ nome: op(120), segmento: op(120), config: ESQUEMA_CONFIG.optional(), testado: z.boolean().optional() }), await corpo());
    const config = { ...(d.config ?? {}), ...(d.testado ? { testado: true } : {}) };
    const e = repo.atualizarEmpresa(empresa.id, { nome: d.nome || undefined, segmento: d.segmento, config });
    repo.auditar(empresa.id, usuario.id, "configuracao_alterada", { campos: Object.keys(d.config ?? {}) });
    return { ...e, config: configCompleta(e.config) };
  });

  /* ---------- WhatsApp (canais) ---------- */

  async function conectarCanal(empresa, usuario, { phone_number_id, waba_id, token, segredo_app }) {
    const api = criarCloudAPI({ token, idNumero: phone_number_id, idConta: waba_id, versao: cfg.meta.versaoGraph, fetchFn });
    let info;
    try {
      info = await api.infoNumero();
    } catch (err) {
      falha(400, `Não consegui acessar o número na Meta: ${err.message}`);
    }
    const avisos = [];
    if (waba_id) {
      try {
        await api.assinarWebhook();
      } catch (err) {
        avisos.push(`Não foi possível assinar o webhook automaticamente: ${err.message}`);
      }
    } else avisos.push("Sem o ID da conta do WhatsApp Business, os modelos de mensagem e campanhas não ficam disponíveis.");
    const canal = repo.salvarCanal({
      empresa_id: empresa.id,
      phone_number_id,
      waba_id,
      token_cripto: cofre.cifrar(token),
      segredo_app_cripto: segredo_app ? cofre.cifrar(segredo_app) : undefined,
      numero: info.display_phone_number,
      nome_verificado: info.verified_name,
      qualidade: info.quality_rating,
      status: "conectado",
    });
    if (waba_id) {
      try {
        repo.sincronizarModelos(empresa.id, canal.id, await api.modelos());
      } catch (err) {
        avisos.push(`Modelos não sincronizados: ${err.message}`);
      }
    }
    if (info.code_verification_status && info.code_verification_status !== "VERIFIED") avisos.push("O número ainda não foi verificado na Meta.");
    repo.auditar(empresa.id, usuario.id, "whatsapp_conectado", { numero: info.display_phone_number });
    return { canal: canalPublico(repo.canal(canal.id)), info, avisos };
  }

  r.get("/api/canais", ({ empresa }) => repo.canais(empresa.id).map(canalPublico));

  r.post("/api/canais", { papeis: ["dono", "admin"] }, async ({ corpo, empresa, usuario }) => {
    const d = validar(
      z.object({ phone_number_id: z.string().trim().regex(/^\d{5,25}$/, "ID do número inválido"), waba_id: z.string().trim().regex(/^\d{5,25}$/, "ID da conta inválido").optional().or(z.literal("")), token: t(1000, 20), segredo_app: op(200) }),
      await corpo(),
    );
    return conectarCanal(empresa, usuario, { ...d, waba_id: d.waba_id || undefined });
  });

  r.post("/api/canais/cadastro-incorporado", { papeis: ["dono", "admin"] }, async ({ corpo, empresa, usuario }) => {
    if (!cfg.meta.idApp || !cfg.meta.segredoApp) falha(400, "Cadastro incorporado não configurado no servidor (META_APP_ID e META_APP_SECRET).");
    const d = validar(z.object({ codigo: t(2000), phone_number_id: z.string().regex(/^\d{5,25}$/), waba_id: z.string().regex(/^\d{5,25}$/) }), await corpo());
    const token = await trocarCodigoPorToken({ idApp: cfg.meta.idApp, segredoApp: cfg.meta.segredoApp, codigo: d.codigo, versao: cfg.meta.versaoGraph, fetchFn }).catch((e) => falha(400, e.message));
    return conectarCanal(empresa, usuario, { phone_number_id: d.phone_number_id, waba_id: d.waba_id, token });
  });

  const meuCanal = (empresa, id) => {
    const c = repo.canal(id);
    if (!c || c.empresa_id !== empresa.id) falha(404, "Número não encontrado.");
    return c;
  };

  r.post("/api/canais/:id/testar", { papeis: ["dono", "admin"] }, async ({ params, empresa }) => {
    const c = meuCanal(empresa, params.id);
    try {
      const info = await atendimento.apiDoCanal(c).infoNumero();
      repo.atualizarStatusCanal(c.id, c.status === "erro" ? "conectado" : c.status, null, { qualidade: info.quality_rating, numero: info.display_phone_number, nome_verificado: info.verified_name });
      return { ok: true, info };
    } catch (err) {
      repo.atualizarStatusCanal(c.id, "erro", err.message);
      return { ok: false, erro: err.message };
    }
  });

  r.post("/api/canais/:id/registrar", { papeis: ["dono", "admin"] }, async ({ params, empresa, corpo }) => {
    const c = meuCanal(empresa, params.id);
    const d = validar(z.object({ pin: z.string().regex(/^\d{6}$/, "O PIN tem 6 dígitos") }), await corpo());
    await atendimento.apiDoCanal(c).registrarNumero(d.pin).catch((e) => falha(400, e.message));
    return { ok: true };
  });

  r.get("/api/canais/:id/perfil", async ({ params, empresa }) => atendimento.apiDoCanal(meuCanal(empresa, params.id)).perfil().catch((e) => falha(400, e.message)));

  r.put("/api/canais/:id/perfil", { papeis: ["dono", "admin"] }, async ({ params, empresa, corpo }) => {
    const d = validar(z.object({ about: op(139), address: op(256), description: op(512), email: z.string().email().max(128).optional().or(z.literal("")), websites: z.array(z.string().url()).max(2).optional(), vertical: op(40) }), await corpo());
    await atendimento.apiDoCanal(meuCanal(empresa, params.id)).atualizarPerfil(d).catch((e) => falha(400, e.message));
    return { ok: true };
  });

  r.delete("/api/canais/:id", { papeis: ["dono"] }, ({ params, empresa, usuario }) => {
    meuCanal(empresa, params.id);
    repo.removerCanal(empresa.id, params.id);
    repo.auditar(empresa.id, usuario.id, "whatsapp_removido", { id: params.id });
    return { ok: true };
  });

  /* ---------- Conversas ---------- */

  r.get("/api/conversas", ({ query, empresa, usuario }) =>
    repo.conversas(empresa.id, { filtro: query.get("filtro") ?? "abertas", busca: query.get("busca")?.slice(0, 80) || undefined, antes: query.get("antes") || undefined, usuario_id: usuario.id, limite: 60 }),
  );

  r.get("/api/conversas/contagem", ({ empresa, usuario }) => repo.contagemConversas(empresa.id, usuario.id));

  const minhaConversa = (empresa, id) => repo.conversa(empresa.id, id) ?? falha(404, "Conversa não encontrada.");

  r.get("/api/conversas/:id", ({ params, empresa }) => {
    const c = minhaConversa(empresa, params.id);
    const contato = repo.contato(empresa.id, c.contato_id);
    return {
      conversa: repo.conversaDetalhada(empresa.id, c.id),
      contato,
      mensagens: repo.historicoDoContato(empresa.id, contato.id, 300).concat(repo.mensagens(c.id, { limite: 300 }).filter((m) => m.direcao === "nota")).sort((a, b) => a.criada_em - b.criada_em),
      janela: { aberta: janelaAberta(contato, agora()), fecha_em: contato.ultima_entrada_em ? contato.ultima_entrada_em + 24 * 3600_000 : null },
      agendamentos: repo.agendamentosDoContato(empresa.id, contato.id).map((a) => ({ ...a, quando: formatarQuando(a.inicio) })),
      anteriores: repo.conversasDoContato(empresa.id, contato.id).filter((x) => x.id !== c.id),
    };
  });

  r.post("/api/conversas/:id/lida", ({ params, empresa }) => {
    minhaConversa(empresa, params.id);
    repo.marcarLidas(empresa.id, params.id);
    atendimento.emitirConversa(empresa.id, params.id);
    return { ok: true };
  });

  r.post("/api/conversas/:id/mensagens", async ({ params, empresa, usuario, corpo }) => {
    minhaConversa(empresa, params.id);
    const d = validar(
      z.union([
        z.object({ texto: t(cfg.limites.tamanhoMensagem), responder_a: op(200) }),
        z.object({ modelo: z.object({ nome: t(512), idioma: t(15), variaveis: z.array(z.string().max(1024)).max(20).default([]) }) }),
        z.object({ arquivo: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/), mime: t(120), nome: op(240), legenda: op(1024) }),
        z.object({ opcoes: z.object({ texto: t(1024), botoes: z.array(z.object({ titulo: t(20) })).min(1).max(3) }) }),
      ]),
      await corpo(),
    );
    try {
      if (d.texto) return await atendimento.enviarDaEquipe({ empresa_id: empresa.id, conversa_id: params.id, usuario, tipo: "texto", dados: { texto: d.texto }, responderA: d.responder_a });
      if (d.modelo) return await atendimento.enviarDaEquipe({ empresa_id: empresa.id, conversa_id: params.id, usuario, tipo: "modelo", dados: d.modelo });
      if (d.opcoes) return await atendimento.enviarDaEquipe({ empresa_id: empresa.id, conversa_id: params.id, usuario, tipo: "botoes", dados: { texto: d.opcoes.texto, botoes: d.opcoes.botoes.map((b, i) => ({ id: `op${i + 1}`, titulo: b.titulo })) } });
      if (!d.arquivo.startsWith(`${empresa.id}/`)) falha(403, "Arquivo de outra empresa.");
      return await atendimento.enviarDaEquipe({ empresa_id: empresa.id, conversa_id: params.id, usuario, tipo: "midia", dados: { arquivo: d.arquivo, mime: d.mime, nome: d.nome, legenda: d.legenda, tipo: tipoWhatsApp(d.mime) } });
    } catch (err) {
      if (err instanceof ErroMeta) falha(502, err.message, { codigo: err.codigo });
      throw err;
    }
  });

  r.post("/api/midia", async ({ req, empresa }) => {
    const tipo = String(req.headers["content-type"] ?? "").split(";")[0];
    if (!tipo || tipo.startsWith("multipart/")) falha(400, "Envie o arquivo direto no corpo, com o Content-Type do arquivo.");
    const dados = await lerCorpo(req, cfg.limites.tamanhoCorpo);
    if (!dados.length) falha(400, "Arquivo vazio.");
    const limites = { image: 5, audio: 16, video: 16, sticker: 0.5, document: 100 };
    const t = tipoWhatsApp(tipo);
    if (dados.length > limites[t] * 1024 * 1024) falha(413, `Arquivo grande demais para o WhatsApp (máximo ${limites[t]} MB para ${t}).`);
    const arquivo = await midia.salvar(empresa.id, dados, tipo);
    return { arquivo, mime: tipo, tipo: t, tamanho: dados.length };
  });

  r.get("/api/midia/:empresa/:arquivo", async ({ params, empresa, res }) => {
    if (params.empresa !== empresa.id) falha(404, "Arquivo não encontrado.");
    const arquivo = `${params.empresa}/${params.arquivo}`;
    const dados = await midia.ler(arquivo).catch(() => falha(404, "Arquivo não encontrado."));
    res.writeHead(200, { "Content-Type": midia.tipoDe(arquivo), "Cache-Control": "private, max-age=86400", "Content-Length": dados.length, "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" });
    res.end(dados);
    return undefined;
  });

  r.post("/api/conversas/:id/notas", async ({ params, empresa, usuario, corpo }) => {
    minhaConversa(empresa, params.id);
    const d = validar(z.object({ texto: t(4000) }), await corpo());
    const m = repo.salvarMensagem({ empresa_id: empresa.id, conversa_id: params.id, direcao: "nota", autor: "humano", autor_id: usuario.id, tipo: "nota", texto: d.texto, conteudo: { autor_nome: usuario.nome } });
    eventos.emitir(empresa.id, "mensagem", m);
    return m;
  });

  r.post("/api/conversas/:id/modo", async ({ params, empresa, usuario, corpo }) => {
    minhaConversa(empresa, params.id);
    const d = validar(z.object({ modo: z.enum(["ia", "humano"]) }), await corpo());
    return atendimento.mudarModo(empresa.id, params.id, { modo: d.modo, usuario });
  });

  r.post("/api/conversas/:id/atribuir", async ({ params, empresa, corpo }) => {
    minhaConversa(empresa, params.id);
    const d = validar(z.object({ usuario_id: z.string().nullable() }), await corpo());
    if (d.usuario_id && !repo.usuarios(empresa.id).some((u) => u.id === d.usuario_id && u.ativo)) falha(400, "Pessoa não encontrada na equipe.");
    const c = repo.atualizarConversa(empresa.id, params.id, { atribuida_a: d.usuario_id, ...(d.usuario_id ? { modo: "humano" } : {}) });
    const pessoa = d.usuario_id ? repo.usuario(d.usuario_id) : null;
    atendimento.nota(empresa.id, params.id, pessoa ? `👤 Conversa atribuída a ${pessoa.nome}.` : "👤 Conversa sem responsável.");
    atendimento.emitirConversa(empresa.id, params.id);
    if (pessoa) eventos.emitir(empresa.id, "alerta", { tipo: "atribuicao", conversa_id: params.id, para: pessoa.id, motivo: `Conversa atribuída a ${pessoa.nome}` });
    return c;
  });

  r.post("/api/conversas/:id/prioridade", async ({ params, empresa, corpo }) => {
    minhaConversa(empresa, params.id);
    const d = validar(z.object({ prioridade: z.enum(["normal", "alta"]) }), await corpo());
    const c = repo.atualizarConversa(empresa.id, params.id, d);
    atendimento.emitirConversa(empresa.id, params.id);
    return c;
  });

  r.post("/api/conversas/:id/resolver", ({ params, empresa, usuario }) => {
    minhaConversa(empresa, params.id);
    return atendimento.resolver(empresa.id, params.id, usuario);
  });

  r.post("/api/conversas/:id/reabrir", ({ params, empresa, usuario }) => {
    const c = minhaConversa(empresa, params.id);
    const ativa = repo.conversaAtiva(empresa.id, c.contato_id);
    if (ativa && ativa.id !== c.id) return ativa;
    repo.atualizarConversa(empresa.id, c.id, { status: "aberta", modo: "humano", atribuida_a: usuario.id, resolvida_em: null });
    atendimento.nota(empresa.id, c.id, `↩️ ${usuario.nome} reabriu o atendimento.`);
    atendimento.emitirConversa(empresa.id, c.id);
    return repo.conversa(empresa.id, c.id);
  });

  r.post("/api/conversas/:id/sugerir", async ({ params, empresa, corpo }) => {
    const c = minhaConversa(empresa, params.id);
    const d = validar(z.object({ orientacao: op(500) }), await corpo());
    const contato = repo.contato(empresa.id, c.contato_id);
    return { texto: await copiloto.sugerirResposta({ empresa, contato, historico: repo.historicoDoContato(empresa.id, contato.id, 60), orientacao: d.orientacao }) };
  });

  r.post("/api/conversas/:id/analisar", async ({ params, empresa }) => {
    minhaConversa(empresa, params.id);
    return (await atendimento.analisar(empresa.id, params.id)) ?? falha(400, "Ainda não há mensagens do cliente para analisar.");
  });

  r.post("/api/conversas/:id/aprovar-sugestao", async ({ params, empresa, usuario, corpo }) => {
    const c = minhaConversa(empresa, params.id);
    const d = validar(z.object({ texto: op(cfg.limites.tamanhoMensagem) }), await corpo());
    const s = c.analise?.sugestao;
    if (!s) falha(404, "Não há sugestão pendente.");
    const contato = repo.contato(empresa.id, c.contato_id);
    const base = { empresa_id: empresa.id, conversa: c, contato, autor: "ia", autor_id: usuario.id };
    for (const m of s.midias ?? []) await atendimento.enviar({ ...base, tipo: "midia", dados: { tipo: "image", link: m.link, legenda: m.legenda } });
    const texto = d.texto ?? s.texto;
    if (texto) await atendimento.enviar({ ...base, tipo: "texto", dados: { texto } });
    if (s.opcoes) await atendimento.enviar({ ...base, tipo: s.opcoes.tipo, dados: s.opcoes });
    if (d.texto && s.texto && d.texto.trim() !== s.texto.trim()) {
      const ultima = repo.mensagens(c.id).filter((m) => m.direcao === "entrada").at(-1);
      repo.salvarAprendizado(empresa.id, { situacao: ultima?.texto ?? "mensagem do cliente", resposta_ideal: d.texto, origem: "copiloto", criado_por: usuario.id });
    }
    repo.atualizarConversa(empresa.id, c.id, { analise: { ...c.analise, sugestao: null } });
    atendimento.emitirConversa(empresa.id, c.id);
    return { ok: true };
  });

  r.post("/api/conversas/:id/reagir", async ({ params, empresa, corpo }) => {
    const c = minhaConversa(empresa, params.id);
    const d = validar(z.object({ wamid: t(200), emoji: z.string().max(8) }), await corpo());
    const contato = repo.contato(empresa.id, c.contato_id);
    const canal = repo.canal(c.canal_id) ?? repo.canais(empresa.id)[0];
    if (!canal) falha(409, "Nenhum número conectado.");
    await atendimento.apiDoCanal(canal).enviarReacao(contato.wa_id, d.wamid, d.emoji).catch((e) => falha(502, e.message));
    return { ok: true };
  });

  r.post("/api/conversas/nova", async ({ empresa, usuario, corpo }) => {
    const d = validar(
      z.object({ wa_id: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().min(10).max(15)), nome: op(120), modelo: z.object({ nome: t(512), idioma: t(15), variaveis: z.array(z.string().max(1024)).max(20).default([]) }).optional() }),
      await corpo(),
    );
    try {
      return await atendimento.iniciarConversa({ empresa_id: empresa.id, wa_id: d.wa_id, nome: d.nome, usuario, modelo: d.modelo });
    } catch (err) {
      if (err instanceof ErroMeta) falha(502, err.message);
      throw err;
    }
  });

  r.post("/api/ia/reescrever", async ({ empresa, corpo }) => {
    const d = validar(z.object({ texto: t(4000), estilo: z.enum(["corrigir", "amigavel", "profissional", "curto", "persuasivo", "empatico"]) }), await corpo());
    return { texto: await copiloto.reescrever({ empresa, ...d }) };
  });

  /** "Ensinar a IA": a equipe corrige uma resposta e a correção vira exemplo aprovado */
  r.post("/api/mensagens/:id/corrigir", async ({ params, empresa, usuario, corpo }) => {
    const m = repo.mensagem(params.id);
    if (!m || m.empresa_id !== empresa.id || m.autor !== "ia") falha(404, "Mensagem da IA não encontrada.");
    const d = validar(z.object({ resposta_ideal: t(2000), situacao: op(1000) }), await corpo());
    const anteriores = repo.mensagens(m.conversa_id, { limite: 300 }).filter((x) => x.criada_em <= m.criada_em && x.direcao === "entrada").slice(-2);
    const a = repo.salvarAprendizado(empresa.id, { situacao: d.situacao || anteriores.map((x) => x.texto).filter(Boolean).join(" / ") || "pergunta do cliente", resposta_ideal: d.resposta_ideal, origem: `mensagem:${m.id}`, criado_por: usuario.id });
    repo.auditar(empresa.id, usuario.id, "ia_corrigida", { mensagem: m.id });
    return a;
  });

  /* ---------- Contatos ---------- */

  r.get("/api/contatos", ({ empresa, query }) => {
    const pagina = Math.max(0, Number(query.get("pagina")) || 0);
    return repo.contatos(empresa.id, { busca: query.get("busca")?.slice(0, 80) || undefined, tag: query.get("tag") || undefined, etapa: query.get("etapa") || undefined, limite: 50, deslocamento: pagina * 50 });
  });
  r.get("/api/tags", ({ empresa }) => repo.tags(empresa.id));
  r.get("/api/funil", ({ empresa }) => repo.funil(empresa.id));

  r.get("/api/contatos/exportar", ({ empresa, res }) => {
    const { itens } = repo.contatos(empresa.id, { limite: 100_000 });
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [["nome", "whatsapp", "email", "etapa", "etiquetas", "pontuacao", "valor_estimado", "nao_receber"].join(",")];
    for (const c of itens) linhas.push([c.nome || c.nome_perfil, c.wa_id, c.email, c.etapa, c.tags.join("|"), c.pontuacao, c.valor_estimado ? c.valor_estimado / 100 : "", c.opt_out ? "sim" : ""].map(esc).join(","));
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="contatos.csv"' });
    res.end("﻿" + linhas.join("\n"));
    return undefined;
  });

  r.post("/api/contatos/importar", { papeis: ["dono", "admin"] }, async ({ empresa, corpo, usuario }) => {
    const d = validar(z.object({ csv: z.string().max(5_000_000), etiqueta: op(40) }), await corpo());
    const linhas = d.csv.split(/\r?\n/).filter((l) => l.trim());
    const sep = (linhas[0].match(/;/g) ?? []).length > (linhas[0].match(/,/g) ?? []).length ? ";" : ",";
    const dividir = (l) => [...l.matchAll(new RegExp(`(?:^|${sep})("(?:[^"]|"")*"|[^${sep}]*)`, "g"))].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"').trim());
    const cab = dividir(linhas[0]).map((c) => c.toLowerCase());
    const col = (nomes) => cab.findIndex((c) => nomes.some((n) => c.includes(n)));
    const iTel = col(["whats", "telefone", "celular", "fone", "phone", "numero"]);
    const iNome = col(["nome", "name"]);
    const iEmail = col(["email", "e-mail"]);
    if (iTel < 0) falha(400, "Não encontrei a coluna de telefone/WhatsApp no CSV.");
    let importados = 0;
    let ignorados = 0;
    repo.transacao(() => {
      for (const l of linhas.slice(1)) {
        const v = dividir(l);
        let tel = (v[iTel] ?? "").replace(/\D/g, "");
        if (tel.length === 10 || tel.length === 11) tel = `55${tel}`;
        if (tel.length < 12 || tel.length > 15) {
          ignorados++;
          continue;
        }
        const { contato } = repo.obterOuCriarContato(empresa.id, tel);
        repo.atualizarContato(empresa.id, contato.id, {
          nome: contato.nome || (iNome >= 0 ? v[iNome] || null : null),
          email: contato.email || (iEmail >= 0 && /@/.test(v[iEmail] ?? "") ? v[iEmail] : null),
          tags: d.etiqueta ? [...contato.tags, d.etiqueta] : contato.tags,
        });
        importados++;
      }
    });
    repo.auditar(empresa.id, usuario.id, "contatos_importados", { importados });
    return { importados, ignorados };
  });

  const meuContato = (empresa, id) => repo.contato(empresa.id, id) ?? falha(404, "Contato não encontrado.");

  r.get("/api/contatos/:id", ({ params, empresa }) => {
    const c = meuContato(empresa, params.id);
    return { contato: c, conversas: repo.conversasDoContato(empresa.id, c.id), agendamentos: repo.agendamentosDoContato(empresa.id, c.id).map((a) => ({ ...a, quando: formatarQuando(a.inicio) })) };
  });

  r.put("/api/contatos/:id", async ({ params, empresa, corpo }) => {
    meuContato(empresa, params.id);
    const d = validar(
      z.object({
        nome: z.string().trim().max(120).nullable().optional(),
        email: z.string().trim().email().max(160).nullable().optional().or(z.literal("").transform(() => null)),
        tags: z.array(z.string().trim().max(40)).max(30).optional(),
        etapa: z.enum(ETAPAS).optional(),
        valor_estimado: z.number().min(0).nullable().optional(),
        campos: z.record(z.string().max(40), z.string().max(500)).optional(),
        opt_out: z.boolean().optional(),
      }),
      await corpo(),
    );
    const c = repo.atualizarContato(empresa.id, params.id, { ...d, valor_estimado: d.valor_estimado === undefined ? undefined : d.valor_estimado === null ? null : Math.round(d.valor_estimado * 100) });
    eventos.emitir(empresa.id, "contato", c);
    return c;
  });

  r.delete("/api/contatos/:id", { papeis: ["dono", "admin"] }, ({ params, empresa, usuario }) => {
    meuContato(empresa, params.id);
    repo.removerContato(empresa.id, params.id);
    repo.auditar(empresa.id, usuario.id, "contato_removido", { id: params.id });
    return { ok: true };
  });

  /* ---------- Base de conhecimento ---------- */

  const esquemaConhecimento = z.object({ titulo: t(200), conteudo: t(50_000), tipo: z.enum(["faq", "politica", "servico", "documento"]).default("faq"), ativo: z.boolean().default(true) });

  r.get("/api/conhecimento", ({ empresa }) => repo.conhecimento(empresa.id));
  r.post("/api/conhecimento", { papeis: ["dono", "admin"] }, async ({ empresa, corpo }) => {
    const d = await corpo();
    const itens = Array.isArray(d?.itens) ? d.itens.slice(0, 100).map((x) => validar(esquemaConhecimento, x)) : [validar(esquemaConhecimento, d)];
    const salvos = itens.map((x) => repo.salvarConhecimento(empresa.id, x));
    conhecimento.invalidar(empresa.id);
    return Array.isArray(d?.itens) ? salvos : salvos[0];
  });
  r.put("/api/conhecimento/:id", { papeis: ["dono", "admin"] }, async ({ params, empresa, corpo }) => {
    const d = validar(esquemaConhecimento, await corpo());
    const x = repo.salvarConhecimento(empresa.id, { ...d, id: params.id });
    conhecimento.invalidar(empresa.id);
    return x;
  });
  r.delete("/api/conhecimento/:id", { papeis: ["dono", "admin"] }, ({ params, empresa }) => {
    repo.removerConhecimento(empresa.id, params.id) || falha(404, "Item não encontrado.");
    conhecimento.invalidar(empresa.id);
    return { ok: true };
  });
  r.post("/api/conhecimento/testar", async ({ empresa, corpo }) => {
    const d = validar(z.object({ consulta: t(300) }), await corpo());
    return conhecimento.indice(empresa.id).buscar(d.consulta, 5);
  });
  r.post("/api/conhecimento/organizar", { papeis: ["dono", "admin"] }, async ({ empresa, corpo }) => {
    const d = validar(z.object({ texto: t(60_000, 20) }), await corpo());
    return copiloto.organizarConhecimento({ empresa, texto: d.texto });
  });

  /* ---------- Catálogo ---------- */

  const esquemaProduto = z.object({
    nome: t(160),
    descricao: op(3000),
    preco: z.number().min(0).max(10_000_000).nullable().optional(),
    estoque: z.number().int().min(0).nullable().optional(),
    sku: op(80),
    categoria: op(80),
    imagem_url: z.string().url().startsWith("https://", "Use um link https").max(1000).optional().or(z.literal("")),
    ativo: z.boolean().default(true),
  });
  const paraProduto = (d) => ({ ...d, preco_centavos: d.preco === null || d.preco === undefined ? null : Math.round(d.preco * 100), imagem_url: d.imagem_url || null });

  r.get("/api/produtos", ({ empresa }) => repo.produtos(empresa.id));
  r.post("/api/produtos", { papeis: ["dono", "admin"] }, async ({ empresa, corpo }) => repo.salvarProduto(empresa.id, paraProduto(validar(esquemaProduto, await corpo()))));
  r.put("/api/produtos/:id", { papeis: ["dono", "admin"] }, async ({ params, empresa, corpo }) => repo.salvarProduto(empresa.id, { ...paraProduto(validar(esquemaProduto, await corpo())), id: params.id }));
  r.delete("/api/produtos/:id", { papeis: ["dono", "admin"] }, ({ params, empresa }) => ({ ok: repo.removerProduto(empresa.id, params.id) || falha(404, "Produto não encontrado.") }));

  /* ---------- Aprendizados, respostas rápidas ---------- */

  r.get("/api/aprendizados", ({ empresa }) => repo.aprendizados(empresa.id));
  r.post("/api/aprendizados", { papeis: ["dono", "admin"] }, async ({ empresa, usuario, corpo }) => repo.salvarAprendizado(empresa.id, { ...validar(z.object({ situacao: t(1000), resposta_ideal: t(2000) }), await corpo()), origem: "manual", criado_por: usuario.id }));
  r.delete("/api/aprendizados/:id", { papeis: ["dono", "admin"] }, ({ params, empresa }) => ({ ok: repo.removerAprendizado(empresa.id, params.id) || falha(404, "Não encontrado.") }));

  r.get("/api/respostas-rapidas", ({ empresa }) => repo.respostasRapidas(empresa.id));
  r.post("/api/respostas-rapidas", async ({ empresa, corpo }) => repo.salvarRespostaRapida(empresa.id, validar(z.object({ atalho: z.string().trim().regex(/^\/?[\w-]{1,30}$/, "Use letras, números e hífen"), texto: t(4000) }), await corpo())));
  r.delete("/api/respostas-rapidas/:id", ({ params, empresa }) => ({ ok: repo.removerRespostaRapida(empresa.id, params.id) }));

  /* ---------- Agenda ---------- */

  r.get("/api/agenda", ({ empresa, query }) => {
    const de = Number(query.get("de")) || agora() - 86400_000;
    const ate = Number(query.get("ate")) || de + 30 * 86400_000;
    return repo.agendamentosEntre(empresa.id, de, ate).map((a) => ({ ...a, quando: formatarQuando(a.inicio) }));
  });
  r.get("/api/agenda/livres", ({ empresa, query }) => {
    const servico = empresa.config.agenda.servicos.find((s) => s.nome === query.get("servico")) ?? empresa.config.agenda.servicos[0];
    const ocupados = repo.agendamentosEntre(empresa.id, agora() - 86400_000, agora() + 130 * 86400_000);
    return horariosLivres({ config: empresa.config, ocupados, agora: agora(), duracao: servico.duracao, aPartirDe: query.get("data") || undefined, limite: 40 });
  });
  r.post("/api/agenda", async ({ empresa, usuario, corpo }) => {
    const d = validar(z.object({ horario: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), servico: t(80), duracao: z.number().int().min(5).max(600).optional(), contato_id: op(64), observacoes: op(500) }), await corpo());
    if (d.contato_id) meuContato(empresa, d.contato_id);
    const [data, hora] = d.horario.split("T");
    const s = empresa.config.agenda.servicos.find((x) => x.nome === d.servico);
    const a = repo.criarAgendamento({ empresa_id: empresa.id, contato_id: d.contato_id, inicio: instanteDe(data, hora), duracao_min: d.duracao ?? s?.duracao ?? 30, servico: d.servico, observacoes: d.observacoes, criado_por: usuario.id });
    eventos.emitir(empresa.id, "agendamento", a);
    return { ...a, quando: formatarQuando(a.inicio) };
  });
  r.put("/api/agenda/:id", async ({ params, empresa, corpo }) => {
    const d = validar(z.object({ status: z.enum(["confirmado", "cancelado", "concluido", "faltou"]) }), await corpo());
    repo.atualizarAgendamento(empresa.id, params.id, d.status) || falha(404, "Agendamento não encontrado.");
    return { ok: true };
  });

  /* ---------- Modelos de mensagem (templates) ---------- */

  const canalComConta = (empresa, id) => {
    const c = id ? meuCanal(empresa, id) : repo.canais(empresa.id).find((x) => x.waba_id);
    if (!c?.waba_id) falha(409, "Conecte um número com o ID da conta do WhatsApp Business para usar modelos.");
    return c;
  };

  r.get("/api/modelos", ({ empresa }) => repo.modelos(empresa.id).map((m) => ({ ...m, variaveis: variaveisDoModelo(m) })));
  r.post("/api/modelos/sincronizar", async ({ empresa, query }) => {
    const c = canalComConta(empresa, query.get("canal"));
    repo.sincronizarModelos(empresa.id, c.id, await atendimento.apiDoCanal(c).modelos().catch((e) => falha(502, e.message)));
    return repo.modelos(empresa.id).map((m) => ({ ...m, variaveis: variaveisDoModelo(m) }));
  });
  r.post("/api/modelos", { papeis: ["dono", "admin"] }, async ({ empresa, corpo, usuario }) => {
    const d = validar(
      z.object({
        nome: z.string().regex(/^[a-z0-9_]{1,512}$/, "Use só letras minúsculas, números e _"),
        idioma: z.string().default("pt_BR"),
        categoria: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
        cabecalho: op(60),
        corpo: t(1024),
        rodape: op(60),
        exemplos: z.array(z.string().max(200)).max(20).default([]),
        botoes: z.array(z.object({ tipo: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]), texto: t(25), url: op(2000), telefone: op(20) })).max(10).default([]),
        canal_id: op(64),
      }),
      await corpo(),
    );
    const n = variaveisDoModelo({ componentes: [{ type: "BODY", text: d.corpo }] });
    if (n && d.exemplos.length < n) falha(400, `Informe um exemplo para cada uma das ${n} variáveis.`);
    const componentes = [
      ...(d.cabecalho ? [{ type: "HEADER", format: "TEXT", text: d.cabecalho }] : []),
      { type: "BODY", text: d.corpo, ...(n ? { example: { body_text: [d.exemplos.slice(0, n)] } } : {}) },
      ...(d.rodape ? [{ type: "FOOTER", text: d.rodape }] : []),
      ...(d.botoes.length
        ? [{ type: "BUTTONS", buttons: d.botoes.map((b) => (b.tipo === "URL" ? { type: "URL", text: b.texto, url: b.url } : b.tipo === "PHONE_NUMBER" ? { type: "PHONE_NUMBER", text: b.texto, phone_number: b.telefone } : { type: "QUICK_REPLY", text: b.texto })) }]
        : []),
    ];
    const c = canalComConta(empresa, d.canal_id);
    const api = atendimento.apiDoCanal(c);
    const r2 = await api.criarModelo({ nome: d.nome, idioma: d.idioma, categoria: d.categoria, componentes }).catch((e) => falha(400, e.message));
    repo.sincronizarModelos(empresa.id, c.id, await api.modelos().catch(() => []));
    repo.auditar(empresa.id, usuario.id, "modelo_criado", { nome: d.nome });
    return { ok: true, id: r2.id, status: r2.status };
  });
  r.delete("/api/modelos/:nome", { papeis: ["dono", "admin"] }, async ({ params, empresa }) => {
    const c = canalComConta(empresa);
    await atendimento.apiDoCanal(c).removerModelo(params.nome).catch((e) => falha(400, e.message));
    repo.sincronizarModelos(empresa.id, c.id, await atendimento.apiDoCanal(c).modelos().catch(() => []));
    return { ok: true };
  });
  r.post("/api/modelos/sugerir", async ({ empresa, corpo }) => {
    const d = validar(z.object({ objetivo: t(500), categoria: z.enum(["MARKETING", "UTILITY"]) }), await corpo());
    return copiloto.sugerirModelo({ empresa, ...d });
  });

  /* ---------- Campanhas ---------- */

  const esquemaFiltro = z.object({ tags: z.array(z.string().max(40)).max(20).default([]), etapas: z.array(z.enum(ETAPAS)).max(6).default([]), contatos: z.array(z.string()).max(10_000).optional(), cabecalho_midia: z.string().url().optional() });

  r.get("/api/campanhas", ({ empresa }) => repo.campanhas(empresa.id));
  r.post("/api/campanhas/publico", async ({ empresa, corpo }) => {
    const f = validar(esquemaFiltro, await corpo());
    const lista = repo.contatosParaCampanha(empresa.id, f);
    return { total: lista.length, amostra: lista.slice(0, 5).map((c) => ({ nome: c.nome || c.nome_perfil, wa_id: c.wa_id })) };
  });
  r.post("/api/campanhas", { papeis: ["dono", "admin"] }, async ({ empresa, usuario, corpo }) => {
    const d = validar(
      z.object({ nome: t(120), modelo_nome: t(512), idioma: t(15), variaveis: z.array(z.string().max(1024)).max(20).default([]), filtro: esquemaFiltro, agendada_para: z.number().int().optional(), enviar_agora: z.boolean().default(false) }),
      await corpo(),
    );
    const modelo = repo.modelo(empresa.id, d.modelo_nome, d.idioma) ?? falha(400, "Modelo não encontrado. Sincronize os modelos.");
    if (modelo.status !== "APPROVED") falha(400, "Este modelo ainda não foi aprovado pela Meta.");
    if (d.variaveis.length < variaveisDoModelo(modelo)) falha(400, `O modelo tem ${variaveisDoModelo(modelo)} variáveis. Preencha todas.`);
    const c = repo.criarCampanha({ ...d, empresa_id: empresa.id, canal_id: modelo.canal_id, status: d.enviar_agora || d.agendada_para ? "agendada" : "rascunho", agendada_para: d.enviar_agora ? null : d.agendada_para });
    repo.auditar(empresa.id, usuario.id, "campanha_criada", { id: c.id, nome: c.nome });
    return c;
  });
  r.post("/api/campanhas/:id/iniciar", { papeis: ["dono", "admin"] }, ({ params, empresa }) => {
    const c = repo.campanha(empresa.id, params.id) ?? falha(404, "Campanha não encontrada.");
    if (c.status !== "rascunho") falha(409, "A campanha já foi iniciada.");
    repo.statusCampanha(c.id, "agendada");
    return repo.campanha(empresa.id, c.id);
  });
  r.post("/api/campanhas/:id/cancelar", { papeis: ["dono", "admin"] }, ({ params, empresa }) => {
    const c = repo.campanha(empresa.id, params.id) ?? falha(404, "Campanha não encontrada.");
    if (["concluida", "cancelada"].includes(c.status)) falha(409, "A campanha já terminou.");
    repo.statusCampanha(c.id, "cancelada", { concluida_em: agora() });
    return repo.campanha(empresa.id, c.id);
  });

  /* ---------- Playground ---------- */

  r.post("/api/playground", async ({ empresa, corpo }) => {
    const d = validar(
      z.object({
        mensagens: z.array(z.object({ autor: z.enum(["cliente", "ia"]), texto: z.string().max(4000), opcoes: z.array(z.string()).optional(), tipo: z.string().optional() })).min(1).max(60),
        contato: z.object({ nome: op(120) }).optional(),
      }),
      await corpo(),
    );
    if (d.mensagens.at(-1).autor !== "cliente") falha(400, "A última mensagem precisa ser do cliente.");
    return atendimento.simular({ empresa_id: empresa.id, mensagens: d.mensagens, contato: d.contato });
  });

  /* ---------- Métricas ---------- */

  r.get("/api/metricas", ({ empresa, query }) => {
    const dias = Math.max(1, Math.min(90, Number(query.get("dias")) || 7));
    const desde = agora() - dias * 86400_000;
    const m = repo.metricas(empresa.id, desde);
    const uso = repo.usoIA(empresa.id, new Date(desde).toISOString().slice(0, 10));
    const totalIA = m.mensagens.pela_ia ?? 0;
    const totalHumano = m.mensagens.por_humanos ?? 0;
    return {
      dias,
      ...m,
      automacao: totalIA + totalHumano ? Math.round((totalIA / (totalIA + totalHumano)) * 100) : 0,
      // Estimativa: 3 minutos de uma pessoa por mensagem respondida pela IA
      horas_economizadas: Math.round((totalIA * 3) / 60),
      uso_ia: uso,
      agenda_hoje: repo.agendamentosEntre(empresa.id, agora(), agora() + 86400_000).filter((a) => a.status === "confirmado").map((a) => ({ ...a, quando: formatarQuando(a.inicio) })),
      atencao: repo.conversas(empresa.id, { filtro: "aguardando", limite: 10 }),
    };
  });

  /* ---------- Equipe e auditoria ---------- */

  r.get("/api/usuarios", ({ empresa }) => repo.usuarios(empresa.id));
  r.post("/api/usuarios", { papeis: ["dono", "admin"] }, async ({ empresa, usuario, corpo }) => {
    const d = validar(z.object({ nome: t(120), email, senha, papel: z.enum(["admin", "atendente"]) }), await corpo());
    if (repo.usuarioComSenha(d.email)) falha(409, "Já existe uma conta com este e-mail.");
    const u = repo.criarUsuario({ empresa_id: empresa.id, nome: d.nome, email: d.email, senha_hash: gerarHashSenha(d.senha), papel: d.papel });
    repo.auditar(empresa.id, usuario.id, "usuario_criado", { email: d.email, papel: d.papel });
    return u;
  });
  r.put("/api/usuarios/:id", async ({ params, empresa, usuario, corpo }) => {
    const proprio = params.id === usuario.id;
    if (!proprio && !["dono", "admin"].includes(usuario.papel)) falha(403, "Sem permissão.");
    const d = validar(z.object({ nome: op(120), papel: z.enum(["admin", "atendente"]).optional(), ativo: z.boolean().optional(), senha: senha.optional(), senha_atual: z.string().max(200).optional() }), await corpo());
    const alvo = repo.usuarios(empresa.id).find((u) => u.id === params.id) ?? falha(404, "Pessoa não encontrada.");
    if (alvo.papel === "dono" && (d.papel || d.ativo === false)) falha(400, "O dono da conta não pode ser alterado.");
    if (proprio && (d.papel || d.ativo === false)) falha(400, "Você não pode mudar o próprio papel.");
    if (proprio && d.senha && !conferirSenha(d.senha_atual ?? "", repo.usuarioComSenha(usuario.email)?.senha_hash)) falha(400, "Senha atual incorreta.");
    return repo.atualizarUsuario(empresa.id, params.id, { nome: d.nome, papel: d.papel, ativo: d.ativo, senha_hash: d.senha ? gerarHashSenha(d.senha) : undefined });
  });
  r.get("/api/auditoria", { papeis: ["dono", "admin"] }, ({ empresa }) => repo.auditoriaRecente(empresa.id).map((a) => ({ ...a, detalhe: a.detalhe ? JSON.parse(a.detalhe) : null })));

  /* ---------- Tempo real ---------- */

  r.get("/api/eventos", ({ req, res, empresa }) => {
    eventos.inscrever(empresa.id, req, res);
    return undefined;
  });

  return { roteador: r, sessaoDe, mascarar };
}
