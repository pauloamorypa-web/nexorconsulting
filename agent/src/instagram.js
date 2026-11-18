/* Canal Instagram da Blue (Instagram API com login do Instagram, graph.instagram.com).
   - Direct: responde 24 horas pela mesma IA do WhatsApp e do site.
   - Comentários: quando alguém comenta uma palavra-chave (TESTE, PONTO, BARBER...), responde em público
     com uma frase curta e chama no Direct com uma mensagem privada (resposta privada ao comentário).
     Perguntas nos comentários também ganham resposta no Direct.
   Assinatura do webhook: X-Hub-Signature-256 com o segredo do app (mesma regra do WhatsApp).
   Segredos só em variável de ambiente: INSTAGRAM_TOKEN, INSTAGRAM_APP_SECRET, INSTAGRAM_VERIFY_TOKEN. */

import { config } from "./config.js";

const LIMITE_DM = 1000; // o Direct aceita até 1000 caracteres por mensagem

export const instagramConfigurado = () => Boolean(config.instagram.token && config.instagram.idConta);

/** Contexto de vendas do canal: foco em Araguari (MG) e região. */
export const CONTEXTO_INSTAGRAM =
  "Canal: Direct do Instagram da Nexor (@nexorconsultingit). Foco comercial em Araguari (MG) e região (Uberlândia e Triângulo Mineiro). " +
  "Pergunte cedo a cidade e o ramo da empresa. Para empresas de Araguari, ofereça visita presencial ou diagnóstico gratuito com o time local, além do teste de 30 dias. " +
  "Mensagens curtas, no máximo 3 frases por balão, tom de conversa de Instagram. " +
  "Filtre antes de vender: descubra se é empresa (e não pessoa física, estudante ou concorrente), o ramo e o porte, e confira se o produto combina com o tipo de cliente " +
  "(Barber para barbearias; RH e Ponto para empresas com equipe; Atende IA para quem atende muito no WhatsApp, como clínicas, imobiliárias e lojas; Contábil para escritórios de contabilidade; Elo para lojas de material elétrico, segurança e solar). " +
  "Use qualificar_lead a cada informação nova. Curioso ou fora do perfil: responda com gentileza em uma frase e encerre, sem insistir. " +
  "Nunca informe valores, faixas ou descontos: preço é sempre com um atendente no WhatsApp (34) 99733-7499. Lead com perfil e interesse: peça o WhatsApp e use transferir_para_humano com o resumo, para a equipe abrir a oportunidade.";

/* Palavras-chave dos posts (ver marketing/instagram/PLANO.md). A resposta pública varia para não parecer robô repetido. */
export const PALAVRAS = [
  { chave: "teste", produto: "teste grátis de 30 dias", publico: ["Te chamei no Direct com o link do teste 💙", "Mandei no seu Direct, dá uma olhada 💙", "Te enviei no Direct! 🎁"] },
  { chave: "ponto", produto: "Nexor RH e Ponto (ponto pelo celular, Portaria 671, folha e eSocial)", publico: ["Te mandei no Direct como fica o ponto na sua empresa 👊", "Chamei você no Direct! 👊", "Olha o Direct 😉"] },
  { chave: "barber", produto: "Nexor Barber (app de agenda, clube de assinatura e comissões para barbearia)", publico: ["Te mandei no Direct o teste da sua barbearia ✂️", "Chamei no Direct! ✂️", "Olha o Direct, barbeiro 😉"] },
  { chave: "ia", produto: "Nexor Atende IA (atendimento e vendas 24h no WhatsApp com IA)", publico: ["Te mandei no Direct a demonstração da IA 🤖", "Chamei você no Direct! 🤖", "Olha o Direct 😉"] },
  { chave: "contabil", produto: "Nexor Contábil (cobrança de documentos e leitura de notas com IA para escritórios)", publico: ["Te chamei no Direct, contador! 🧾", "Mandei no seu Direct 🧾", "Olha o Direct 😉"] },
  { chave: "fundador", produto: "programa de fundadores (condição especial de lançamento, 10 vagas por produto; detalhes com um atendente no WhatsApp)", publico: ["Te mandei as condições de fundador no Direct 🔥", "Chamei no Direct! 🔥", "Olha o Direct 😉"] },
  { chave: "elo", produto: "Nexor Elo (rede de fornecedores e instaladores)", publico: ["Te mandei no Direct como funciona o Elo 🔌", "Chamei no Direct! 🔌", "Olha o Direct 😉"] },
  { chave: "diagnostico", produto: "diagnóstico gratuito com o time da Nexor", publico: ["Te chamei no Direct para marcar o diagnóstico 🔎", "Mandei no seu Direct 🔎", "Olha o Direct 😉"] },
  { chave: "blue", produto: "uma assistente de IA como a Blue para a empresa (Nexor Atende IA)", publico: ["A Blue te chamou no Direct 💙", "Te mandei no Direct! 💙", "Olha o Direct 😉"] },
  { chave: "lgpd", produto: "consultoria de LGPD", publico: ["Te mandei no Direct o diagnóstico de LGPD ✅", "Chamei no Direct! ✅", "Olha o Direct 😉"] },
];

const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Acha a palavra-chave num comentário curto ("TESTE", "quero teste", "Ponto!"). Comentários longos não contam. */
export function palavraChave(texto) {
  const t = normalizar(texto).replace(/[^a-z0-9\s]/g, " ").trim();
  if (!t || t.split(/\s+/).length > 4) return null;
  const tokens = new Set(t.split(/\s+/));
  return PALAVRAS.find((p) => tokens.has(p.chave)) ?? null;
}

/** Comentário que parece pergunta ou interesse de compra, mesmo sem palavra-chave. */
export const pareceInteresse = (texto) => /\?|quanto|preco|valor|como funciona|tem para|serve para|quero|interess|orcamento|contato|whats/.test(normalizar(texto));

/** Extrai mensagens do Direct e comentários de um payload de webhook do Instagram. */
export function extrairEventos(payload, idConta = config.instagram.idConta) {
  const eventos = [];
  for (const entrada of payload?.entry ?? []) {
    const conta = String(entrada.id ?? idConta ?? "");
    for (const m of entrada.messaging ?? []) {
      const msg = m.message;
      if (!msg || msg.is_echo || msg.is_deleted) continue;
      const de = String(m.sender?.id ?? "");
      if (!de || de === conta) continue;
      eventos.push({ tipo: "dm", id: String(msg.mid ?? ""), de, texto: typeof msg.text === "string" ? msg.text : undefined, anexo: Boolean(msg.attachments?.length) });
    }
    for (const mudanca of entrada.changes ?? []) {
      if (mudanca.field !== "comments" && mudanca.field !== "live_comments") continue;
      const v = mudanca.value ?? {};
      const autor = String(v.from?.id ?? "");
      if (!v.id || !autor || autor === conta) continue; // ignora os próprios comentários da Nexor
      eventos.push({ tipo: "comentario", id: String(v.id), de: autor, usuario: v.from?.username, texto: String(v.text ?? ""), post: String(v.media?.id ?? "") });
    }
  }
  return eventos;
}

/* Chamadas à API; `requisitar` é injetável nos testes. */
export function criarApiInstagram({ requisitar = fetch } = {}) {
  const base = () => `https://graph.instagram.com/${config.instagram.versaoGraph}`;
  const chamar = async (caminho, corpo) => {
    const r = await requisitar(`${base()}${caminho}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.instagram.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) throw new Error(`Instagram ${r.status}: ${String(await r.text()).slice(0, 300)}`);
    return r.json().catch(() => ({}));
  };
  return {
    /** Mensagem no Direct (só dentro da janela de 24 h da última mensagem da pessoa). */
    async enviarDM(destinatario, texto) {
      for (let resto = String(texto); resto; ) {
        let corte = resto.length <= LIMITE_DM ? resto.length : resto.lastIndexOf(" ", LIMITE_DM);
        if (corte < LIMITE_DM / 2) corte = Math.min(LIMITE_DM, resto.length);
        await chamar("/me/messages", { recipient: { id: destinatario }, message: { text: resto.slice(0, corte).trim() } });
        resto = resto.slice(corte).trim();
      }
    },
    /** Resposta privada a um comentário: abre a conversa no Direct (uma por comentário, até 7 dias depois). */
    respostaPrivada: (idComentario, texto) => chamar("/me/messages", { recipient: { comment_id: idComentario }, message: { text: String(texto).slice(0, LIMITE_DM) } }),
    /** Resposta pública embaixo do comentário. */
    responderComentario: (idComentario, texto) => chamar(`/${idComentario}/replies`, { message: String(texto).slice(0, 300) }),
  };
}

/** Processa um webhook do Instagram com o agente da Blue. */
export function criarProcessadorInstagram({ agente, api = criarApiInstagram(), sortear = Math.random, log = console } = {}) {
  const vistos = new Set();
  const marcar = (id) => {
    if (!id || vistos.has(id)) return false;
    vistos.add(id);
    if (vistos.size > 5000) vistos.delete(vistos.values().next().value);
    return true;
  };
  const responderComIA = async (de, texto, extra) => {
    const { resposta } = await agente.responder({
      idConversa: `ig:${de}`,
      canal: "instagram",
      texto: String(texto).slice(0, config.tamanhoMaximoMensagem),
      contexto: extra ? `${CONTEXTO_INSTAGRAM}\n${extra}` : CONTEXTO_INSTAGRAM,
      origem: { utm_source: "instagram", utm_medium: "direct" },
    });
    return resposta;
  };

  return async function processar(payload) {
    for (const e of extrairEventos(payload)) {
      if (!marcar(e.id || `${e.tipo}:${e.de}:${e.texto}`)) continue;
      try {
        if (e.tipo === "dm") {
          if (!e.texto) {
            await api.enviarDM(e.de, e.anexo ? "Recebi! Por aqui eu leio só texto. Me conta por escrito o que você precisa? 🙂" : "Oi! Como posso ajudar? 🙂");
            continue;
          }
          await api.enviarDM(e.de, await responderComIA(e.de, e.texto));
          continue;
        }
        // comentário
        const p = palavraChave(e.texto);
        if (p) {
          await api.responderComentario(e.id, p.publico[Math.floor(sortear() * p.publico.length)]);
          const abertura = await responderComIA(e.de, `(comentou "${e.texto}" num post do Instagram)`,
            `A pessoa comentou a palavra-chave "${p.chave.toUpperCase()}" num post. Interesse: ${p.produto}. Abra a conversa no Direct em 2 ou 3 frases: agradeça, entregue o que ela pediu e faça uma pergunta (cidade e ramo da empresa).`);
          await api.respostaPrivada(e.id, abertura);
        } else if (pareceInteresse(e.texto)) {
          const abertura = await responderComIA(e.de, `(comentou num post do Instagram: "${e.texto}")`,
            "A pessoa comentou num post. Responda a dúvida no Direct em até 3 frases e faça uma pergunta para continuar.");
          await api.respostaPrivada(e.id, abertura);
        }
      } catch (err) {
        log.error?.(`[instagram] falha ao responder ${e.tipo} ${e.de}:`, err.message ?? err);
      }
    }
  };
}
