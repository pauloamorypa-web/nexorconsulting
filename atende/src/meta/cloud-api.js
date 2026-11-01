/* Cliente da WhatsApp Cloud API (API oficial da Meta, Graph API).
   Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api */

const LIMITE_TEXTO = 4096;

/** Explicações em português para os erros mais comuns da Cloud API */
export const ERROS_META = {
  0: "Falha de autenticação. Gere um novo token.",
  3: "O app não tem permissão para esta ação (whatsapp_business_messaging / whatsapp_business_management).",
  10: "Permissão negada. Confira se o token tem acesso a esta conta do WhatsApp.",
  100: "Parâmetro inválido na requisição.",
  190: "Token de acesso inválido ou expirado. Gere um token permanente (usuário do sistema).",
  200: "Permissão negada para este recurso.",
  368: "A conta foi temporariamente bloqueada por violar políticas da Meta.",
  4: "Limite de chamadas do app atingido. Tente de novo em alguns minutos.",
  80007: "Limite de chamadas da conta do WhatsApp atingido.",
  130429: "Limite de envio por segundo atingido. O sistema vai tentar de novo.",
  131000: "Erro interno da Meta. Tente de novo.",
  131005: "Acesso negado. O token não tem permissão para este número.",
  131008: "Faltou um parâmetro obrigatório.",
  131009: "Valor de parâmetro inválido.",
  131016: "Serviço da Meta indisponível no momento.",
  131021: "O destinatário não pode ser o próprio número remetente.",
  131026: "Mensagem não entregue: o número pode não ter WhatsApp, estar com app antigo ou não ter aceitado os novos termos.",
  131031: "A conta do WhatsApp Business foi bloqueada.",
  131042: "Problema de pagamento na conta do WhatsApp Business. Confira a forma de pagamento no Gerenciador de Negócios.",
  131045: "Número não registrado corretamente na Cloud API.",
  131047: "Passaram mais de 24 horas desde a última mensagem do cliente. Use um modelo de mensagem aprovado.",
  131048: "Limite de envio atingido por denúncias de spam. A Meta reduziu temporariamente o envio.",
  131049: "A Meta optou por não entregar esta mensagem de marketing para manter um bom engajamento. Tente mais tarde.",
  131050: "O cliente pediu para não receber mensagens de marketing.",
  131051: "Tipo de mensagem não suportado.",
  131052: "Não foi possível baixar a mídia enviada pelo cliente.",
  131053: "Não foi possível enviar a mídia (formato ou tamanho não aceito).",
  131056: "Muitas mensagens para o mesmo cliente em pouco tempo. Aguarde um pouco.",
  131057: "A conta está em manutenção.",
  132000: "O número de variáveis não confere com o modelo aprovado.",
  132001: "O modelo não existe neste idioma ou ainda não foi aprovado.",
  132005: "O texto do modelo ficou longo demais com as variáveis.",
  132007: "O conteúdo do modelo viola as políticas da Meta.",
  132012: "Formato de variável incompatível com o modelo.",
  132015: "O modelo foi pausado por baixa qualidade.",
  132016: "O modelo foi desativado por baixa qualidade.",
  133000: "Falha ao cancelar o registro anterior do número.",
  133004: "Servidor temporariamente indisponível.",
  133005: "PIN de verificação em duas etapas incorreto.",
  133006: "O número precisa ser verificado antes do registro.",
  133010: "O número ainda não foi registrado na Cloud API. Use o botão Registrar número.",
  135000: "Erro genérico do usuário.",
};

export class ErroMeta extends Error {
  constructor(status, corpo) {
    const e = corpo?.error ?? {};
    const codigo = e.code ?? status;
    super(ERROS_META[e.error_subcode] ?? ERROS_META[codigo] ?? e.error_user_msg ?? e.message ?? `Erro ${status} na API da Meta`);
    this.name = "ErroMeta";
    this.status = status;
    this.codigo = codigo;
    this.subcodigo = e.error_subcode;
    this.detalhe = e.error_data?.details ?? e.message;
    this.fbtrace = e.fbtrace_id;
  }
  get temporario() {
    return this.status >= 500 || [4, 80007, 130429, 131000, 131016, 133004].includes(this.codigo);
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Divide textos longos em partes que cabem numa mensagem, quebrando em parágrafos quando possível. */
export function dividirTexto(texto, limite = LIMITE_TEXTO) {
  const partes = [];
  let resto = String(texto ?? "").trim();
  while (resto.length > limite) {
    let corte = resto.lastIndexOf("\n", limite);
    if (corte < limite / 2) corte = resto.lastIndexOf(" ", limite);
    if (corte < limite / 2) corte = limite;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

/** Converte o markdown do modelo para a formatação do WhatsApp (*negrito*, _itálico_, ~riscado~). */
export function paraFormatoWhatsApp(texto) {
  return String(texto ?? "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/~~(.+?)~~/g, "~$1~")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

const corta = (t, n) => String(t ?? "").slice(0, n);

/**
 * @param {object} opcoes
 * @param {string} opcoes.token token de acesso (usuário do sistema)
 * @param {string} opcoes.idNumero phone_number_id
 * @param {string} [opcoes.idConta] WABA id (contas do WhatsApp Business)
 * @param {string} [opcoes.versao]
 * @param {typeof fetch} [opcoes.fetchFn]
 */
export function criarCloudAPI({ token, idNumero, idConta, versao = "v23.0", fetchFn = fetch, tentativas = 3 }) {
  const base = `https://graph.facebook.com/${versao}`;

  async function chamar(metodo, caminho, { corpo, form, consulta } = {}) {
    const url = new URL(`${base}/${caminho}`);
    for (const [k, v] of Object.entries(consulta ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    for (let i = 0; ; i++) {
      const headers = { Authorization: `Bearer ${token}` };
      let body;
      if (form) body = form;
      else if (corpo !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(corpo);
      }
      let resposta;
      try {
        resposta = await fetchFn(url, { method: metodo, headers, body });
      } catch (err) {
        if (i + 1 < tentativas) {
          await esperar(400 * 2 ** i);
          continue;
        }
        throw Object.assign(new Error(`Sem conexão com a Meta: ${err.message}`), { temporario: true });
      }
      const texto = await resposta.text();
      let dados;
      try {
        dados = texto ? JSON.parse(texto) : {};
      } catch {
        dados = { bruto: texto };
      }
      if (resposta.ok) return dados;
      const erro = new ErroMeta(resposta.status, dados);
      if (erro.temporario && i + 1 < tentativas) {
        await esperar(Number(resposta.headers.get?.("retry-after")) * 1000 || 500 * 2 ** i);
        continue;
      }
      throw erro;
    }
  }

  const enviar = (para, conteudo, { responderA } = {}) =>
    chamar("POST", `${idNumero}/messages`, {
      corpo: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: para,
        ...(responderA ? { context: { message_id: responderA } } : {}),
        ...conteudo,
      },
    }).then((r) => ({ wamid: r.messages?.[0]?.id, status: r.messages?.[0]?.message_status, wa_id: r.contacts?.[0]?.wa_id }));

  const midia = (tipo, { id, link, legenda, nomeArquivo }) => ({
    type: tipo,
    [tipo]: {
      ...(id ? { id } : { link }),
      ...(legenda && tipo !== "audio" && tipo !== "sticker" ? { caption: corta(legenda, 1024) } : {}),
      ...(nomeArquivo && tipo === "document" ? { filename: corta(nomeArquivo, 240) } : {}),
    },
  });

  return {
    chamar,

    /* ---------- Envio ---------- */
    enviarTexto: (para, texto, op) => enviar(para, { type: "text", text: { body: corta(texto, LIMITE_TEXTO), preview_url: /https?:\/\//.test(texto) } }, op),
    enviarImagem: (para, m, op) => enviar(para, midia("image", m), op),
    enviarDocumento: (para, m, op) => enviar(para, midia("document", m), op),
    enviarAudio: (para, m, op) => enviar(para, midia("audio", m), op),
    enviarVideo: (para, m, op) => enviar(para, midia("video", m), op),
    enviarSticker: (para, m, op) => enviar(para, midia("sticker", m), op),
    enviarLocalizacao: (para, { latitude, longitude, nome, endereco }, op) =>
      enviar(para, { type: "location", location: { latitude, longitude, name: nome, address: endereco } }, op),
    enviarReacao: (para, wamid, emoji) => enviar(para, { type: "reaction", reaction: { message_id: wamid, emoji } }),

    /** Até 3 botões de resposta rápida */
    enviarBotoes: (para, { texto, botoes, cabecalho, rodape }, op) =>
      enviar(
        para,
        {
          type: "interactive",
          interactive: {
            type: "button",
            ...(cabecalho ? { header: { type: "text", text: corta(cabecalho, 60) } } : {}),
            body: { text: corta(texto, 1024) },
            ...(rodape ? { footer: { text: corta(rodape, 60) } } : {}),
            action: {
              buttons: botoes.slice(0, 3).map((b, i) => ({ type: "reply", reply: { id: corta(b.id ?? `op${i + 1}`, 256), title: corta(b.titulo, 20) } })),
            },
          },
        },
        op,
      ),

    /** Lista com até 10 opções no total */
    enviarLista: (para, { texto, botao, secoes, cabecalho, rodape }, op) =>
      enviar(
        para,
        {
          type: "interactive",
          interactive: {
            type: "list",
            ...(cabecalho ? { header: { type: "text", text: corta(cabecalho, 60) } } : {}),
            body: { text: corta(texto, 4096) },
            ...(rodape ? { footer: { text: corta(rodape, 60) } } : {}),
            action: {
              button: corta(botao, 20),
              sections: secoes.map((s) => ({
                title: corta(s.titulo, 24),
                rows: s.linhas.map((l, i) => ({ id: corta(l.id ?? `${s.titulo}-${i}`, 200), title: corta(l.titulo, 24), ...(l.descricao ? { description: corta(l.descricao, 72) } : {}) })),
              })),
            },
          },
        },
        op,
      ),

    /** Botão que abre um link (CTA URL) */
    enviarLink: (para, { texto, rotulo, url, rodape }, op) =>
      enviar(
        para,
        {
          type: "interactive",
          interactive: {
            type: "cta_url",
            body: { text: corta(texto, 1024) },
            ...(rodape ? { footer: { text: corta(rodape, 60) } } : {}),
            action: { name: "cta_url", parameters: { display_text: corta(rotulo, 20), url } },
          },
        },
        op,
      ),

    /** Pede a localização do cliente */
    pedirLocalizacao: (para, texto) =>
      enviar(para, { type: "interactive", interactive: { type: "location_request_message", body: { text: corta(texto, 1024) }, action: { name: "send_location" } } }),

    /** Modelo aprovado (obrigatório fora da janela de 24 h) */
    enviarModelo: (para, { nome, idioma, componentes = [] }, op) =>
      enviar(para, { type: "template", template: { name: nome, language: { code: idioma }, ...(componentes.length ? { components: componentes } : {}) } }, op),

    /** Marca como lida e, opcionalmente, mostra "digitando..." (some sozinho em até 25 s ou quando a resposta chega) */
    marcarComoLida: (wamid, { digitando = false } = {}) =>
      chamar("POST", `${idNumero}/messages`, {
        corpo: { messaging_product: "whatsapp", status: "read", message_id: wamid, ...(digitando ? { typing_indicator: { type: "text" } } : {}) },
      }).catch(() => null),

    /* ---------- Mídia ---------- */
    async baixarMidia(idMidia) {
      const info = await chamar("GET", idMidia);
      const r = await fetchFn(info.url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Falha ao baixar mídia: HTTP ${r.status}`);
      return { dados: Buffer.from(await r.arrayBuffer()), tipo: info.mime_type, tamanho: info.file_size, sha256: info.sha256 };
    },
    async enviarArquivo(dados, tipoMime, nome = "arquivo") {
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("type", tipoMime);
      form.append("file", new Blob([dados], { type: tipoMime }), nome);
      const r = await chamar("POST", `${idNumero}/media`, { form });
      return r.id;
    },

    /* ---------- Número e perfil ---------- */
    infoNumero: () =>
      chamar("GET", idNumero, {
        consulta: { fields: "display_phone_number,verified_name,quality_rating,code_verification_status,name_status,messaging_limit_tier,throughput,platform_type,status" },
      }),
    registrarNumero: (pin) => chamar("POST", `${idNumero}/register`, { corpo: { messaging_product: "whatsapp", pin } }),
    perfil: () =>
      chamar("GET", `${idNumero}/whatsapp_business_profile`, { consulta: { fields: "about,address,description,email,profile_picture_url,websites,vertical" } }).then(
        (r) => r.data?.[0] ?? {},
      ),
    atualizarPerfil: (p) => chamar("POST", `${idNumero}/whatsapp_business_profile`, { corpo: { messaging_product: "whatsapp", ...p } }),

    /* ---------- Conta (WABA) ---------- */
    assinarWebhook: () => chamar("POST", `${idConta}/subscribed_apps`),
    numerosDaConta: () => chamar("GET", `${idConta}/phone_numbers`, { consulta: { fields: "id,display_phone_number,verified_name,quality_rating" } }).then((r) => r.data ?? []),
    async modelos() {
      const todos = [];
      let depois;
      for (let pagina = 0; pagina < 20; pagina++) {
        const r = await chamar("GET", `${idConta}/message_templates`, {
          consulta: { fields: "id,name,language,status,category,components,rejected_reason,quality_score", limit: 100, after: depois },
        });
        todos.push(...(r.data ?? []));
        depois = r.paging?.cursors?.after;
        if (!r.paging?.next || !depois) break;
      }
      return todos;
    },
    criarModelo: ({ nome, idioma, categoria, componentes }) =>
      chamar("POST", `${idConta}/message_templates`, { corpo: { name: nome, language: idioma, category: categoria, components: componentes } }),
    removerModelo: (nome) => chamar("DELETE", `${idConta}/message_templates`, { consulta: { name: nome } }),
  };
}

/** Cadastro incorporado (Embedded Signup): troca o código do Login do Facebook por um token de acesso. */
export async function trocarCodigoPorToken({ idApp, segredoApp, codigo, versao = "v23.0", fetchFn = fetch }) {
  const url = new URL(`https://graph.facebook.com/${versao}/oauth/access_token`);
  url.searchParams.set("client_id", idApp);
  url.searchParams.set("client_secret", segredoApp);
  url.searchParams.set("code", codigo);
  const r = await fetchFn(url);
  const dados = await r.json();
  if (!r.ok) throw new ErroMeta(r.status, dados);
  return dados.access_token;
}

/** Monta os componentes de um modelo a partir de uma lista de textos para {{1}}, {{2}}... do corpo */
export function componentesDoModelo(modelo, valores = [], { cabecalhoMidia } = {}) {
  const comps = [];
  const cab = modelo?.componentes?.find?.((c) => c.type === "HEADER");
  if (cab && ["IMAGE", "VIDEO", "DOCUMENT"].includes(cab.format) && cabecalhoMidia) {
    const t = cab.format.toLowerCase();
    comps.push({ type: "header", parameters: [{ type: t, [t]: { link: cabecalhoMidia } }] });
  }
  if (valores.length) comps.push({ type: "body", parameters: valores.map((v) => ({ type: "text", text: corta(v || "-", 1024) })) });
  return comps;
}

/** Quantas variáveis {{n}} o corpo do modelo tem */
export function variaveisDoModelo(modelo) {
  const corpo = modelo?.componentes?.find?.((c) => c.type === "BODY")?.text ?? "";
  const nums = [...corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

/** Texto do modelo com as variáveis preenchidas (para mostrar no histórico) */
export function textoDoModelo(modelo, valores = []) {
  const corpo = modelo?.componentes?.find?.((c) => c.type === "BODY")?.text ?? `[modelo ${modelo?.nome ?? ""}]`;
  return corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] ?? `{{${n}}}`);
}
