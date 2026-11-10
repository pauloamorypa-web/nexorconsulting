/* IA roteirizada do Modo Demonstração: imita a API do Claude (beta.messages.create) com respostas
   coerentes com os dados semeados da Clínica Sorriso. Usa as MESMAS ferramentas do agente real
   (buscar_conhecimento, ver_horarios, enviar_opcoes, agendar, atualizar_contato, transferir_para_humano,
   encerrar_atendimento), então o painel mostra o fluxo de verdade: agenda criada, CRM atualizado,
   transferência com resumo, análise da conversa. Sem internet e sem custo. */

import { localBrasilia } from "../servicos/agenda.js";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const sem = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const SERVICOS = [
  { nome: "Limpeza", chaves: ["limpeza", "profilaxia", "tartaro"] },
  { nome: "Clareamento", chaves: ["clarea", "branque", "dente amarel"] },
  { nome: "Manutenção ortodôntica", chaves: ["aparelho", "ortodon", "manutencao"] },
  { nome: "Restauração", chaves: ["restaura", "carie", "obturac"] },
  { nome: "Avaliação", chaves: ["avaliac", "consulta", "implante", "canal", "dentista"] },
];

export const PRECOS = {
  Limpeza: "A limpeza completa (remoção de tártaro, profilaxia e polimento) custa *R$ 180*, e a avaliação com o dentista é *gratuita*.",
  Clareamento: "O clareamento a laser no consultório sai *a partir de R$ 650* (em novembro com 15% de desconto: *R$ 552,50*), e o caseiro com moldeira, R$ 890. Antes, o dentista faz uma avaliação *gratuita* para indicar o melhor para você.",
  "Manutenção ortodôntica": "A manutenção do aparelho fixo custa *R$ 150* por mês, e o aparelho autoligado começa em R$ 2.400 (parcelado em até 12x).",
  Restauração: "A restauração em resina sai *a partir de R$ 220* por dente, dependendo do tamanho. O valor exato o dentista confirma na avaliação gratuita.",
  Avaliação: "A avaliação com o dentista é *gratuita* e leva uns 30 minutos. Implante começa em R$ 3.200 e canal em R$ 900, sempre confirmados na avaliação.",
};

const textosDe = (conteudo) => (typeof conteudo === "string" ? [conteudo] : (conteudo ?? []).filter((b) => b.type === "text").map((b) => b.text));
const ultimaUser = (msgs) => [...msgs].reverse().find((m) => m.role === "user");

/** Texto do cliente na última vez em que ele falou (sem o bloco <contexto>) */
function falaDoCliente(msgs) {
  const u = [...msgs].reverse().find((m) => m.role === "user" && !(Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result")));
  return textosDe(u?.content)
    .filter((t) => !t.startsWith("<contexto>") && t !== "[sem texto]")
    .join("\n");
}

function nomeDoCliente(msgs) {
  for (const m of msgs) for (const t of textosDe(m.content)) {
    const r = /cliente: ([^·\n]+?) ·/.exec(t);
    if (r && !/nome não informado/.test(r[1])) return r[1].trim().split(" ")[0];
  }
  return "";
}

/** O serviço de que a conversa trata (a menção mais recente vence) */
function servicoDaConversa(msgs, padrao = "Avaliação") {
  const tudo = msgs.flatMap((m) => textosDe(m.content).filter((t) => !t.startsWith("<contexto>")));
  for (const t of tudo.reverse()) {
    const s = sem(t);
    const achado = SERVICOS.find((x) => x.chaves.some((c) => s.includes(c)));
    if (achado) return achado.nome;
  }
  return padrao;
}

const rotuloHorario = (horario) => {
  const [data, hora] = horario.split("T");
  const { diaSemana } = localBrasilia(new Date(`${data}T${hora}:00-03:00`).getTime());
  return `${DIAS[diaSemana]} ${data.slice(8, 10)}/${data.slice(5, 7)} ${hora}`;
};

/** "qua 12/11 09:00" → "2026-11-12T09:00" */
function horarioEscolhido(texto, agora = Date.now()) {
  const r = /(\d{2})\/(\d{2})\D{1,8}(\d{2})[:h](\d{2})/.exec(texto);
  if (!r) return null;
  const [, dd, mm, hh, mi] = r;
  const hoje = localBrasilia(agora).iso;
  let ano = Number(hoje.slice(0, 4));
  if (Number(mm) < Number(hoje.slice(5, 7)) - 1) ano++;
  return `${ano}-${mm}-${dd}T${hh}:${mi}`;
}

const uso = { input_tokens: 1800, output_tokens: 120, cache_read_input_tokens: 1500 };
const texto = (t) => ({ id: "msg_demo", type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: t }], usage: uso });
let seq = 0;
const ferramentas = (...chamadas) => ({ id: "msg_demo", type: "message", role: "assistant", stop_reason: "tool_use", content: chamadas.map(([name, input]) => ({ type: "tool_use", id: `toolu_demo_${++seq}`, name, input })), usage: uso });

/* ---------- Intenções do cliente ---------- */

const INTENCOES = [
  ["despedida", /\b(obrigad|valeu|agradec|ate mais|ate logo|tchau)/],
  ["urgencia", /\b(dor|dores|doendo|doi|doia)\b|inchad|inchou|sangr|quebr|urgen|emergen/],
  ["humano", /\b(atendente|humano|pessoa|alguem da|reclama|absurdo|demora|gerente|doutora|dra\b|dr\b)/],
  ["agendar", /\b(agend|marca|horario|vaga|disponivel|amanha|semana que vem|encaixe)/],
  ["preco", /\b(quanto|preco|valor|custa|custo|orcamento|tabela|promoc)/],
  ["convenio", /\b(convenio|odontoprev|amil|plano)/],
  ["pagamento", /\b(pix|cartao|parcel|pagamento|boleto|dinheiro)/],
  ["endereco", /\b(endereco|onde fica|localizac|estacionamento|como chego)/],
  ["funcionamento", /\b(abre|abrem|fecha|funciona|aberto|sabado|domingo|feriado)/],
  ["saudacao", /^\s*(oi+|ola|bom dia|boa tarde|boa noite|e ai|opa)[\s!.,]*$/],
];
export const intencaoDe = (t) => INTENCOES.find(([, re]) => re.test(sem(t)))?.[0] ?? (/\b(limpeza|clarea|aparelho|implante|canal|restaura)/.test(sem(t)) ? "preco" : "outro");

/* ---------- Agente ---------- */

function responderAgente(params, agora) {
  const msgs = params.messages;
  const nome = nomeDoCliente(msgs);
  const oi = nome ? `, ${nome}` : "";
  const ultima = ultimaUser(msgs);
  const resultados = Array.isArray(ultima?.content) ? ultima.content.filter((b) => b.type === "tool_result") : [];
  const temFerramenta = (n) => (params.tools ?? []).some((t) => t.name === n);

  // Continuação do ciclo de ferramentas: decide o próximo passo pelo que acabou de ser executado
  if (resultados.length) {
    const anterior = msgs.at(-2);
    const usadas = (anterior?.content ?? []).filter((b) => b.type === "tool_use");
    const resultadoDe = (n) => {
      const u = usadas.find((b) => b.name === n);
      const r = u && resultados.find((x) => x.tool_use_id === u.id);
      if (!r) return null;
      try {
        return JSON.parse(r.content);
      } catch {
        return r.content;
      }
    };
    const nomes = usadas.map((b) => b.name);

    if (nomes.includes("buscar_conhecimento")) {
      const s = servicoDaConversa(msgs);
      const cliente = sem(falaDoCliente(msgs));
      if (/convenio|odontoprev|amil|plano/.test(cliente)) return texto(`Atendemos sim${oi}! 😊 Aceitamos *OdontoPrev* e *Amil Dental*. É só trazer a carteirinha e um documento com foto. Se quiser, já vejo um horário para a avaliação.`);
      return ferramentas(
        ["enviar_opcoes", { texto: `${PRECOS[s] ?? PRECOS.Avaliação}\n\nParcelamos em até 10x sem juros no cartão e o Pix tem 5% de desconto. Quer que eu veja um horário para você?`, opcoes: [{ titulo: "Ver horários" }, { titulo: "Tirar outra dúvida" }] }],
        ["atualizar_contato", { interesse: s, etiquetas: [sem(s).split(" ")[0]], etapa: "qualificado" }],
      );
    }
    if (nomes.includes("ver_horarios")) {
      const r = resultadoDe("ver_horarios");
      const livres = (r?.horarios ?? []).slice(0, 3);
      if (!livres.length) return ferramentas(["transferir_para_humano", { motivo: "sem horários livres na agenda", resumo: `Cliente quer agendar ${r?.servico ?? "atendimento"}, mas não há horário livre no período.`, prioridade: "normal" }]);
      return ferramentas(["enviar_opcoes", { texto: `Tenho estes horários para *${r.servico}* (${r.duracao_minutos} min). Qual fica melhor para você?`, opcoes: livres.map((l) => ({ titulo: rotuloHorario(l.horario) })) }]);
    }
    if (nomes.includes("agendar")) {
      const r = resultadoDe("agendar");
      if (r?.ok) return texto(`Prontinho${oi}! ✅ Sua *${r.servico}* ficou agendada para *${r.quando}*.\n\n📍 Av. Rondon Pacheco, 1500 · chegue uns 10 minutinhos antes. Na véspera eu te mando um lembrete por aqui.`);
      const s = servicoDaConversa(msgs);
      return ferramentas(["ver_horarios", { servico: s }]);
    }
    if (nomes.includes("transferir_para_humano")) {
      const motivo = usadas.find((b) => b.name === "transferir_para_humano")?.input?.motivo ?? "";
      const r = resultadoDe("transferir_para_humano");
      const fora = typeof r?.equipe === "string" && r.equipe.startsWith("fora do horário") ? ` A equipe ${r.equipe.replace("fora do horário; ", "")}, e sua mensagem já fica na frente da fila.` : " Em instantes alguém da recepção continua com você por aqui.";
      if (/urg|dor/.test(sem(motivo))) return texto(`Sinto muito pela dor${oi} 😟 Dor com inchaço precisa ser vista logo. Já marquei seu caso como *urgência* e chamei a nossa equipe para um encaixe.${fora}`);
      if (/parcel|negoci|desconto|orcamento/.test(sem(motivo))) return texto(`Entendi${oi}! Condições especiais de pagamento são com a nossa equipe financeira. Já passei seu caso com o resumo da conversa.${fora}`);
      return texto(`Claro${oi}! Já chamei uma pessoa da nossa equipe e passei o resumo da conversa, assim você não precisa repetir nada.${fora}`);
    }
    if (nomes.includes("encerrar_atendimento")) return texto(`Por nada${oi}! Qualquer coisa é só chamar por aqui. Tenha um ótimo dia! 😊`);
    // enviar_opcoes / atualizar_contato: as opções já levam o texto
    return texto("");
  }

  const fala = falaDoCliente(msgs);
  const escolhido = horarioEscolhido(fala, agora);
  if (escolhido && temFerramenta("agendar")) {
    const s = servicoDaConversa(msgs);
    return ferramentas(["agendar", { horario: escolhido, servico: s }], ["atualizar_contato", { etapa: s === "Avaliação" ? "qualificado" : "cliente", etiquetas: [sem(s).split(" ")[0]] }]);
  }
  const intencao = intencaoDe(fala);
  const s = servicoDaConversa(msgs);
  switch (intencao) {
    case "despedida":
      return ferramentas(["encerrar_atendimento", { resumo: `Atendimento concluído pela IA (${s.toLowerCase()}).` }]);
    case "urgencia":
      return ferramentas(["transferir_para_humano", { motivo: "dor ou urgência odontológica", resumo: `${nome || "Cliente"} relata: "${fala.slice(0, 160)}". Precisa de encaixe de urgência hoje.`, prioridade: "alta" }], ["atualizar_contato", { etiquetas: ["urgencia"] }]);
    case "humano":
      return ferramentas(["transferir_para_humano", { motivo: "cliente pediu para falar com uma pessoa", resumo: `${nome || "Cliente"} pediu atendimento humano. Última mensagem: "${fala.slice(0, 160)}".`, prioridade: "normal" }]);
    case "agendar":
      return temFerramenta("ver_horarios") ? ferramentas(["ver_horarios", { servico: s }]) : texto(`Vou pedir para a recepção confirmar um horário com você${oi}!`);
    case "preco":
      return ferramentas(["buscar_conhecimento", { consulta: `preço ${s.toLowerCase()}` }]);
    case "convenio":
      return ferramentas(["buscar_conhecimento", { consulta: "convênios aceitos" }]);
    case "pagamento":
      return /parcel/.test(sem(fala)) && /implante|orcamento|mais vezes|desconto/.test(sem(fala))
        ? ferramentas(["transferir_para_humano", { motivo: "negociação de parcelamento", resumo: `${nome || "Cliente"} quer condições especiais de parcelamento: "${fala.slice(0, 160)}".`, prioridade: "normal" }])
        : texto(`Aceitamos Pix (com 5% de desconto), cartão de débito e crédito em até 10x sem juros${oi}. A chave Pix é o CNPJ da clínica e eu te envio na hora do pagamento. 😊`);
    case "endereco":
      return texto(`Ficamos na *Av. Rondon Pacheco, 1500*, em Uberlândia${oi}, com estacionamento conveniado ao lado. 📍 Quer que eu já veja um horário para você?`);
    case "funcionamento":
      return texto(`Atendemos de *segunda a sexta, das 8h às 19h*, e aos *sábados, das 8h às 12h*${oi}. Domingos e feriados ficamos fechados. Quer que eu veja um horário?`);
    case "saudacao":
      return texto(`Olá${oi}! 😊 Eu sou a Lia, assistente virtual da Clínica Sorriso. Posso te passar valores, agendar sua consulta ou tirar dúvidas sobre tratamentos e convênios. Como posso te ajudar?`);
    default:
      return texto(`Obrigada pela mensagem${oi}! Posso te ajudar com valores, agendamento, convênios ou dúvidas sobre os tratamentos. Se preferir falar com uma pessoa da equipe, é só me pedir. 😊`);
  }
}

/* ---------- Copiloto (análise, sugestão, reescrita, modelos) ---------- */

function analisar(transcricao) {
  const t = sem(transcricao);
  const ultimaCliente = sem(transcricao.split("\n").filter((l) => l.startsWith("Cliente:")).at(-1) ?? "");
  const dor = /dor|inchad|inchou|sangr|urgenc/.test(t);
  const reclamacao = /reclama|absurdo|demora|pessimo/.test(t);
  const agendou = /agendad|agendamento|prontinho/.test(t);
  const negocia = /parcel|desconto|negoci/.test(t);
  const s = SERVICOS.find((x) => x.chaves.some((c) => t.includes(c)))?.nome ?? "Avaliação";
  const intencao = dor ? "urgência" : reclamacao ? "reclamação" : negocia ? "negociação" : agendou ? "agendamento" : /convenio|amil|odontoprev/.test(t) ? "convênio" : /quanto|preco|valor|custa/.test(t) ? "orçamento" : "dúvida";
  const temperatura = agendou ? 92 : negocia ? 80 : /clarea/.test(t) ? 78 : dor ? 70 : reclamacao ? 30 : 55;
  return {
    sentimento: reclamacao ? "negativo" : dor ? "negativo" : agendou || /obrigad|otimo|que bom/.test(t) ? "positivo" : "neutro",
    intencao,
    urgencia: dor ? "alta" : reclamacao || negocia ? "media" : "baixa",
    temperatura_lead: temperatura,
    etapa_sugerida: agendou ? "cliente" : negocia ? "negociacao" : /quanto|preco|valor|custa/.test(t) ? "proposta" : "qualificado",
    resumo: dor
      ? "Cliente com dor e possível inchaço. A IA transferiu como urgência para encaixe ainda hoje."
      : agendou
        ? `Cliente pediu informações sobre ${s.toLowerCase()} e agendou pelo WhatsApp com a IA.`
        : negocia
          ? "Cliente já fez avaliação e quer negociar o parcelamento do orçamento. Caso com a equipe financeira."
          : `Cliente interessado em ${s.toLowerCase()}. Recebeu valores e opções de horário da IA.`,
    proxima_acao: dor
      ? "Ligar agora e oferecer encaixe de urgência no primeiro horário livre."
      : agendou
        ? "Nada a fazer: o lembrete automático sai na véspera."
        : negocia
          ? "Oferecer parcelamento em 12x no cartão ou entrada + boleto e fechar hoje."
          : /^cliente: .*(vou ver|depois|pensar)/.test(ultimaCliente)
            ? "Follow-up amanhã oferecendo a avaliação gratuita."
            : "Oferecer a avaliação gratuita e um horário ainda esta semana.",
    precisa_humano: dor || reclamacao,
    motivo_alerta: dor ? "Paciente com dor: priorizar encaixe" : reclamacao ? "Cliente insatisfeito" : "",
    objecoes: negocia ? ["preço", "parcelamento"] : /marido|esposa|pensar/.test(t) ? ["decisão compartilhada"] : [],
  };
}

function sugerir(textoUser) {
  const ultima = [...textoUser.matchAll(/^Cliente: (.*)$/gm)].at(-1)?.[1] ?? "";
  const orientacao = /Orientação da equipe para esta resposta: (.*)/.exec(textoUser)?.[1];
  const nome = /\nCliente: ([^\n·]+)$/m.exec(textoUser)?.[1]?.trim().split(" ")[0] ?? "";
  const i = intencaoDe(ultima);
  const oi = nome ? `Oi, ${nome}! ` : "Oi! ";
  if (orientacao) return `${oi}${orientacao.charAt(0).toUpperCase()}${orientacao.slice(1)}. Qualquer dúvida estou por aqui 😊`;
  if (i === "urgencia") return `${oi}Aqui é da recepção da Clínica Sorriso. Consigo te encaixar hoje às [horário] com o Dr. [nome]. Pode vir? Se a dor piorar antes, me avise.`;
  if (i === "pagamento" || /parcel/.test(sem(ultima))) return `${oi}Conseguimos parcelar o seu tratamento em até 12x sem juros no cartão, ou entrada de [valor] + boletos. Qual opção fica melhor para você?`;
  if (i === "agendar") return `${oi}Tenho horário na [dia] às [hora]. Posso confirmar para você?`;
  return `${oi}Obrigada pela paciência! Já verifiquei aqui e [resposta]. Posso te ajudar em mais alguma coisa?`;
}

function reescrever(sistema, textoUser) {
  const original = /<texto>\n?([\s\S]*?)\n?<\/texto>/.exec(textoUser)?.[1]?.trim() ?? textoUser;
  let t = original.replace(/\s+/g, " ").replace(/\bvc\b/gi, "você").replace(/\bpq\b/gi, "porque").replace(/\btb\b/gi, "também").replace(/\bq\b/gi, "que");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += ".";
  if (/caloroso|simpático/.test(sistema)) return `${t} 😊`;
  if (/empático/.test(sistema)) return `Entendo como você se sente e quero te ajudar. ${t}`;
  if (/persuasivo/.test(sistema)) return `${t} Assim você garante o seu sorriso ainda este mês, com condições especiais.`;
  if (/curto/.test(sistema)) return t.split(/(?<=[.!?])\s/)[0];
  return t;
}

/** Cliente falso da Anthropic (mesma interface usada pelo agente e pelo copiloto) */
export function criarIASimulada({ agora = () => Date.now(), atrasoMs = 900 } = {}) {
  const esperar = () => (atrasoMs ? new Promise((r) => setTimeout(r, atrasoMs)) : Promise.resolve());
  async function create(params) {
    await esperar(); // a "digitação" aparece no painel
    const formato = params.output_config?.format?.schema;
    const sistema = typeof params.system === "string" ? params.system : textosDe(params.system).join("\n");
    const textoUser = textosDe(params.messages?.[0]?.content).join("\n");
    if (formato?.properties?.sentimento) return texto(JSON.stringify(analisar(textoUser)));
    if (formato?.properties?.corpo) {
      const objetivo = /Objetivo do modelo: (.*)/.exec(textoUser)?.[1] ?? "novidades";
      return texto(JSON.stringify({ nome: "novidade_clinica", corpo: `Olá, {{1}}! Aqui é a Clínica Sorriso 😊 ${objetivo.charAt(0).toUpperCase()}${objetivo.slice(1)}. Quer que a gente reserve um horário para você?`, rodape: "Clínica Sorriso · Responda SAIR para não receber", exemplos: ["Ana"] }));
    }
    if (formato?.properties?.itens) {
      const linhas = (/<texto>\n?([\s\S]*?)\n?<\/texto>/.exec(textoUser)?.[1] ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
      return texto(JSON.stringify({ itens: linhas.slice(0, 12).map((l) => ({ titulo: l.split(/[.:]/)[0].slice(0, 60), conteudo: l })) }));
    }
    if (params.tools?.length) return responderAgente(params, agora());
    if (/reescreve/.test(sistema)) return texto(reescrever(sistema, textoUser));
    return texto(sugerir(textoUser));
  }
  return { simulada: true, beta: { messages: { create } }, messages: { create } };
}
