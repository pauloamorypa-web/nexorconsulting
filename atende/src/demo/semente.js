/* Roteiro de dados da demonstração: Clínica Sorriso (empresa fictícia).
   Determinístico (mesma demo toda vez) e "vivo": as datas são relativas ao momento em que a demo sobe.
   - hoje: conversas com a IA e com a equipe, fila de atendimento, agenda cheia
   - últimos ~75 dias: histórico de conversas resolvidas para os números do painel
   - contatos com etiquetas e funil, base de conhecimento, modelos aprovados e campanhas
   Todos os nomes, telefones (99999-xxxx), e-mails (@*.demo) e o CNPJ são inventados. */

import { gerarHashSenha } from "../seguranca.js";
import { formatarQuando, instanteDe, localBrasilia } from "../servicos/agenda.js";

export const SENHA_DEMO = "demo1234";
export const EMPRESA_ID = "demo-clinica-sorriso";
export const CANAL = { id: "demo-canal", phone_number_id: "100000000000001", waba_id: "200000000000001", numero: "+55 34 99999-0000" };

export const USUARIOS = [
  { id: "demo-u-dono", papel: "dono", nome: "Dra. Helena Prado", email: "helena@clinicasorriso.demo", descricao: "Dona da clínica: painel completo, métricas, campanhas, IA e configurações." },
  { id: "demo-u-admin", papel: "admin", nome: "Rafael Couto", email: "rafael@clinicasorriso.demo", descricao: "Gerente: tudo do dono, exceto remover o número do WhatsApp." },
  { id: "demo-u-atendente", papel: "atendente", nome: "Juliana Reis", email: "juliana@clinicasorriso.demo", descricao: "Recepção: fila de atendimento, conversas, agenda e contatos." },
  { id: "demo-u-atendente2", papel: "atendente", nome: "Bruno Matos", email: "bruno@clinicasorriso.demo", descricao: null },
];

/** CNPJ com dígitos verificadores válidos, a partir de 12 dígitos inventados */
export function cnpjValido(base12) {
  const d = base12.split("").map(Number);
  const dv = (nums, pesos) => {
    const r = nums.reduce((s, n, i) => s + n * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...d, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...d, d1, d2].join("");
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}
const CNPJ = cnpjValido("472915830001");

/** Gerador pseudoaleatório com semente fixa (mulberry32) */
function aleatorio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONFIG = {
  testado: true,
  agente: {
    nome: "Lia",
    modo: "automatico",
    tom: "amigavel",
    emojis: "pouco",
    sobre:
      "A Clínica Sorriso é uma clínica odontológica em Uberlândia/MG. Atendemos de segunda a sexta, das 8h às 19h, e aos sábados, das 8h às 12h. Avaliação gratuita, limpeza, clareamento, restaurações, ortodontia e implantes. Endereço: Av. Rondon Pacheco, 1500.",
    instrucoes: "Ofereça sempre a avaliação gratuita. Dor ou inchaço é urgência: transfira com prioridade alta.",
    objetivo: "tirar dúvidas, agendar consultas e converter interessados em pacientes",
    saudacao: "Olá! Eu sou a Lia, da Clínica Sorriso 😊 Como posso te ajudar?",
    nao_fazer: "Não dê diagnóstico nem receite medicamentos.",
    agrupar_segundos: 1,
    transferir_quando: "o cliente pedir para falar com uma pessoa, relatar dor forte, fizer uma reclamação, pedir reembolso ou negociar condições especiais de pagamento",
    assinatura: true,
  },
  horario: {
    ativo: true,
    dias: { 0: [], 1: ["08:00-19:00"], 2: ["08:00-19:00"], 3: ["08:00-19:00"], 4: ["08:00-19:00"], 5: ["08:00-19:00"], 6: ["08:00-12:00"] },
    fora_do_horario: "A IA continua atendendo; transferências ficam para o próximo horário de atendimento.",
  },
  agenda: {
    ativa: true,
    servicos: [
      { nome: "Avaliação", duracao: 30 },
      { nome: "Limpeza", duracao: 60 },
      { nome: "Clareamento", duracao: 60 },
      { nome: "Restauração", duracao: 60 },
      { nome: "Manutenção ortodôntica", duracao: 30 },
    ],
    intervalo_min: 30,
    antecedencia_horas: 2,
    dias_adiante: 14,
    lembrete_horas: 24,
  },
  followup: { ativo: true, horas: 3, maximo: 1 },
  pagamento: { pix: CNPJ, instrucoes: "Pix com 5% de desconto. Cartão em até 10x sem juros." },
};

const CONHECIMENTO = [
  ["Preços dos tratamentos", "Avaliação: gratuita. Limpeza (profilaxia completa): R$ 180. Clareamento a laser: a partir de R$ 650 (novembro com 15% de desconto: R$ 552,50). Clareamento caseiro com moldeira: R$ 890. Restauração em resina: a partir de R$ 220. Canal: a partir de R$ 900. Implante: a partir de R$ 3.200. Manutenção de aparelho: R$ 150 por mês.", 214],
  ["Horário e endereço", "Segunda a sexta, das 8h às 19h. Sábado, das 8h às 12h. Domingos e feriados fechado. Av. Rondon Pacheco, 1500, Uberlândia/MG, com estacionamento conveniado ao lado.", 131],
  ["Convênios", "Atendemos OdontoPrev e Amil Dental. Trazer carteirinha e documento com foto. A cobertura de cada procedimento depende do plano: a recepção confere antes.", 88],
  ["Formas de pagamento", "Pix com 5% de desconto, cartão de débito e crédito em até 10x sem juros. Tratamentos acima de R$ 2.000 podem ser parcelados em até 12x. Condições especiais: falar com a equipe financeira.", 76],
  ["Urgência e dor", "Dor forte, inchaço ou sangramento: encaixe no mesmo dia. A IA transfere como prioridade alta para a recepção.", 41],
  ["Cuidados após a limpeza", "Evitar alimentos com corante (café, vinho, açaí) por 24 horas. Sensibilidade leve é normal por 1 a 2 dias.", 23],
  ["Clareamento: como funciona", "Sessão no consultório de cerca de 1 hora; resultado já na primeira sessão. O caseiro usa moldeira por 2 a 3 semanas. A avaliação gratuita define o melhor tipo.", 57],
];

const NOMES = [
  "Ana Beatriz Moura", "Carlos Henrique Duarte", "Fernanda Lima", "Roberto Almeida", "Patrícia Gomes", "Marcos Vinícius Tavares", "Luana Ribeiro", "Sônia Martins",
  "Diego Fonseca", "Gabriel Nunes", "Tatiane Rocha", "Pedro Augusto Silva", "Camila Freitas", "Eduardo Barros", "Juliana Pacheco", "Renata Carvalho",
  "Thiago Mendes", "Larissa Cunha", "André Luiz Costa", "Vanessa Teixeira", "Ricardo Moreira", "Aline Batista", "Felipe Araújo", "Beatriz Campos",
  "Gustavo Rezende", "Mariana Lopes", "Leonardo Pires", "Daniela Correia", "Rodrigo Viana", "Priscila Machado", "Mateus Cardoso", "Isabela Ramos",
  "Vinícius Prado", "Letícia Monteiro", "Fábio Andrade", "Natália Borges", "Lucas Ferreira", "Cristina Vasconcelos", "Henrique Sales", "Bruna Rangel",
  "Paulo Sérgio Lemos", "Débora Antunes", "Rafael Siqueira", "Elaine Quintino", "Murilo Bastos", "Tânia Figueiredo", "Otávio Brandão", "Simone Aguiar",
  "Caio Medeiros", "Jéssica Paiva", "Alexandre Nogueira", "Kelly Fontes", "Samuel Coelho", "Raquel Dantas", "Igor Valente", "Lívia Peixoto",
  "Márcio Toledo", "Carolina Bueno", "Wesley Gusmão", "Adriana Lacerda", "Hugo Sampaio", "Viviane Leal", "Danilo Esteves", "Flávia Moura",
];

/** Cenários do histórico: [intenção, sentimento, quem resolveu, etiquetas, falas] */
const CENARIOS = [
  ["orçamento", "positivo", "ia", ["limpeza"], [["cliente", "Oi, quanto custa a limpeza?"], ["ia", "Oi! 😊 A limpeza completa custa R$ 180 e a avaliação com o dentista é gratuita. Quer que eu veja um horário?"], ["cliente", "Quero sim"], ["ia", "Tenho quinta às 9h ou às 14h. Qual prefere?"], ["cliente", "14h"], ["ia", "Prontinho! ✅ Sua limpeza ficou agendada para quinta às 14h."]], 5],
  ["clareamento", "positivo", "ia", ["clareamento"], [["cliente", "Boa tarde, vocês fazem clareamento?"], ["ia", "Fazemos sim! ✨ O clareamento a laser sai a partir de R$ 650 e a avaliação é gratuita. Quer agendar?"], ["cliente", "Parcela?"], ["ia", "Em até 10x sem juros no cartão, e o Pix tem 5% de desconto."], ["cliente", "Vou pensar, obrigada"], ["ia", "Imagina! Fico à disposição 😊"]], 4],
  ["convênio", "neutro", "ia", ["convenio-odontoprev"], [["cliente", "Aceitam OdontoPrev?"], ["ia", "Aceitamos sim! Atendemos OdontoPrev e Amil Dental. É só trazer a carteirinha."], ["cliente", "Ótimo, obrigado"], ["ia", "Por nada! Qualquer coisa é só chamar 😊"]], 3],
  ["horário", "neutro", "ia", [], [["cliente", "Vocês abrem sábado?"], ["ia", "Abrimos sim! Sábado das 8h às 12h e de segunda a sexta das 8h às 19h."], ["cliente", "Valeu"], ["ia", "Por nada! 😊"]], 3],
  ["urgência", "negativo", "humano", ["urgencia"], [["cliente", "Estou com muita dor no dente, tem como ser hoje?"], ["ia", "Sinto muito pela dor 😟 Já chamei a equipe para um encaixe de urgência."], ["humano", "Oi! Aqui é da recepção. Consigo te encaixar hoje às 16h30, pode vir?"], ["cliente", "Posso sim, obrigado!"], ["humano", "Combinado, te esperamos!"]], 2],
  ["agendamento", "positivo", "ia", ["retorno"], [["cliente", "Preciso remarcar minha consulta de amanhã"], ["ia", "Sem problema! Tenho sexta às 10h ou segunda às 15h. Qual fica melhor?"], ["cliente", "Segunda 15h"], ["ia", "Remarcado para segunda às 15h ✅"]], 3],
  ["negociação", "neutro", "humano", ["implante"], [["cliente", "O orçamento do implante deu R$ 3.200, consigo parcelar em 12x?"], ["ia", "Condições especiais são com a equipe financeira. Já passei seu caso!"], ["humano", "Oi! Conseguimos sim: 12x de R$ 266,67 no cartão. Posso confirmar?"], ["cliente", "Pode confirmar"], ["humano", "Confirmado! Vou te mandar o contrato por aqui."]], 2],
  ["confirmação", "positivo", "ia", [], [["campanha", "Olá! Lembrando da sua consulta amanhã na Clínica Sorriso. Confirma? Responda SIM ou REMARCAR."], ["cliente", "Sim, confirmo"], ["ia", "Perfeito! Te esperamos amanhã 😊"]], 4],
  ["ortodontia", "positivo", "ia", ["ortodontia"], [["cliente", "Quanto fica o aparelho?"], ["ia", "O aparelho autoligado começa em R$ 2.400 (até 12x) e a manutenção é R$ 150 por mês. A avaliação é gratuita!"], ["cliente", "Quero marcar a avaliação"], ["ia", "Agendado para terça às 11h ✅"]], 3],
  ["reclamação", "negativo", "humano", ["vip"], [["cliente", "Esperei 40 minutos ontem para ser atendida, isso é um absurdo"], ["ia", "Sinto muito pela espera. Já chamei a gerência para falar com você."], ["humano", "Oi, aqui é o Rafael, gerente. Peço desculpas pela espera. Vou te dar prioridade no próximo retorno e um desconto de 10%."], ["cliente", "Obrigada pela atenção"]], 1],
];

const ETIQUETAS_EXTRA = ["limpeza", "clareamento", "ortodontia", "implante", "convenio-amil", "convenio-odontoprev", "indicacao", "retorno", "vip", "instagram"];

export function semear(repo, { agora = Date.now(), hashSenha, cofre } = {}) {
  const db = repo.db;
  const rand = aleatorio(20261110);
  const hoje = localBrasilia(agora).iso;
  const inicioHoje = instanteDe(hoje, "00:00");
  const MIN = 60_000;
  const DIA = 86400_000;
  const senha = hashSenha ?? gerarHashSenha(SENHA_DEMO);
  const ins = (tabela, linha) => {
    const ks = Object.keys(linha);
    db.prepare(`INSERT INTO ${tabela} (${ks.join(",")}) VALUES (${ks.map(() => "?").join(",")})`).run(...ks.map((k) => (linha[k] !== null && typeof linha[k] === "object" ? JSON.stringify(linha[k]) : (linha[k] ?? null))));
  };
  let nMsg = 0;
  let nConv = 0;
  const idMsg = () => `demo-m-${String(++nMsg).padStart(5, "0")}`;

  repo.transacao(() => {
    // Limpa tudo (mesma ordem das dependências)
    for (const t of ["sessoes", "campanha_envios", "campanhas", "modelos", "mensagens", "conversas", "agendamentos", "contatos", "conhecimento", "produtos", "respostas_rapidas", "aprendizados", "canais", "usuarios", "auditoria", "uso_ia", "nexor_ajustes", "empresas"]) db.exec(`DELETE FROM ${t}`);

    ins("empresas", { id: EMPRESA_ID, nome: "Clínica Sorriso", segmento: "Clínica odontológica", config: CONFIG, criada_em: agora - 120 * DIA });
    for (const [i, u] of USUARIOS.entries()) ins("usuarios", { id: u.id, empresa_id: EMPRESA_ID, nome: u.nome, email: u.email, senha_hash: senha, papel: u.papel, ativo: 1, online_em: agora - i * 7 * MIN, criado_em: agora - (120 - i * 10) * DIA, nexor: 0 });
    ins("canais", { id: CANAL.id, empresa_id: EMPRESA_ID, phone_number_id: CANAL.phone_number_id, waba_id: CANAL.waba_id, numero: CANAL.numero, nome_verificado: "Clínica Sorriso", qualidade: "GREEN", token_cripto: cofre ? cofre.cifrar("EAADEMO-token-ficticio-da-demonstracao") : "demo", segredo_app_cripto: null, status: "ativo", criado_em: agora - 120 * DIA, atualizado_em: agora - 120 * DIA });

    for (const [i, [titulo, conteudo, usos]] of CONHECIMENTO.entries()) ins("conhecimento", { id: `demo-k-${i + 1}`, empresa_id: EMPRESA_ID, titulo, conteudo, tipo: "faq", ativo: 1, usos, atualizado_em: agora - (30 - i) * DIA });
    for (const [i, [atalho, texto]] of [
      ["endereco", "📍 Av. Rondon Pacheco, 1500 · Uberlândia/MG. Estacionamento conveniado ao lado."],
      ["pix", `Nossa chave Pix é o CNPJ ${CNPJ} (Clínica Sorriso). Pix tem 5% de desconto!`],
      ["convenios", "Atendemos OdontoPrev e Amil Dental. Traga a carteirinha e um documento com foto."],
      ["confirmar", "Sua consulta está confirmada! Chegue 10 minutinhos antes 😊"],
    ].entries())
      ins("respostas_rapidas", { id: `demo-r-${i + 1}`, empresa_id: EMPRESA_ID, atalho, texto });
    ins("aprendizados", { id: "demo-a-1", empresa_id: EMPRESA_ID, situacao: "Cliente pergunta se a avaliação é paga", resposta_ideal: "A avaliação é gratuita e leva uns 30 minutos. Quer que eu veja um horário para você?", origem: "correcao", criado_por: "demo-u-dono", criado_em: agora - 20 * DIA });
    ins("aprendizados", { id: "demo-a-2", empresa_id: EMPRESA_ID, situacao: "Cliente com dor ou inchaço", resposta_ideal: "Acolha, diga que é prioridade e transfira com prioridade alta para encaixe no mesmo dia.", origem: "manual", criado_por: "demo-u-admin", criado_em: agora - 12 * DIA });

    /* ---------- Contatos ---------- */
    const contatos = NOMES.map((nome, i) => {
      const etapa = i < 11 ? null : ["novo", "qualificado", "qualificado", "proposta", "negociacao", "cliente", "cliente", "cliente", "perdido"][Math.floor(rand() * 9)];
      const tags = [...new Set([ETIQUETAS_EXTRA[Math.floor(rand() * ETIQUETAS_EXTRA.length)], ...(rand() < 0.45 ? [ETIQUETAS_EXTRA[Math.floor(rand() * ETIQUETAS_EXTRA.length)]] : [])])];
      return {
        id: `demo-c-${String(i + 1).padStart(2, "0")}`,
        empresa_id: EMPRESA_ID,
        wa_id: `553499999${String(1001 + i * 37).padStart(4, "0").slice(-4)}`,
        nome,
        nome_perfil: nome.split(" ")[0],
        email: rand() < 0.5 ? `${nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${i + 1}@email.demo` : null,
        tags,
        campos: rand() < 0.4 ? { cidade: "Uberlândia" } : {},
        etapa: etapa ?? "novo",
        valor_estimado: null,
        pontuacao: Math.floor(20 + rand() * 60),
        opt_out: i === 40 ? 1 : 0,
        ultima_entrada_em: null,
        criado_em: agora - Math.floor(5 + rand() * 85) * DIA,
        atualizado_em: agora - Math.floor(rand() * 20) * DIA,
      };
    });
    const valores = { proposta: 65000, negociacao: 320000, cliente: 18000, qualificado: 18000 };
    for (const c of contatos) c.valor_estimado = valores[c.etapa] ?? null;
    // Alguns contatos novos nesta semana
    for (const i of [44, 51, 57, 60, 62]) contatos[i].criado_em = agora - (1 + (i % 5)) * DIA;
    const contatoDe = (i) => contatos[i];
    // Entram já (as conversas dependem deles); os campos finais são gravados no fim do roteiro
    for (const c of contatos) ins("contatos", c);

    /* ---------- Histórico (conversas resolvidas) ---------- */
    const pesos = CENARIOS.flatMap((c, i) => Array(c[5]).fill(i));
    const ultimaEntrada = new Map();
    for (let d = 75; d >= 1; d--) {
      const diaIso = localBrasilia(agora - d * DIA).iso;
      const ds = new Date(`${diaIso}T12:00:00-03:00`).getUTCDay();
      if (ds === 0 && rand() < 0.7) continue;
      const n = ds === 6 ? 2 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 5) + (d < 30 ? 2 : 0);
      for (let k = 0; k < n; k++) {
        const cen = CENARIOS[pesos[Math.floor(rand() * pesos.length)]];
        const [intencao, sentimento, resolvidaPor, tagsCen, falas] = cen;
        const ci = 11 + Math.floor(rand() * (contatos.length - 11));
        const contato = contatoDe(ci);
        const hora = ds === 6 ? 8 + rand() * 4 : 7.5 + rand() * 13;
        let t = instanteDe(diaIso, "00:00") + Math.floor(hora * 60) * MIN;
        if (t < contato.criado_em) contato.criado_em = t - DIA;
        const conv = `demo-v-h${String(++nConv).padStart(4, "0")}`;
        const criada = t;
        const msgs = [];
        let primeira = null;
        for (const [autor, texto] of falas) {
          const atraso = autor === "cliente" ? (1 + rand() * 4) * MIN : autor === "ia" ? (3 + rand() * 6) * 1000 : (2 + rand() * 6) * MIN;
          t += Math.floor(atraso);
          if (autor !== "cliente" && primeira === null && msgs.some((m) => m.autor === "cliente")) primeira = t - msgs.find((m) => m.autor === "cliente").criada_em;
          msgs.push({ autor, texto, criada_em: t });
        }
        const usuarioHumano = intencao === "reclamação" ? "demo-u-admin" : rand() < 0.6 ? "demo-u-atendente" : "demo-u-atendente2";
        ins("conversas", {
          id: conv, empresa_id: EMPRESA_ID, contato_id: contato.id, canal_id: CANAL.id, status: "resolvida", modo: resolvidaPor === "ia" ? "ia" : "humano", atribuida_a: resolvidaPor === "ia" ? null : usuarioHumano,
          prioridade: intencao === "urgência" ? "alta" : "normal", nao_lidas: 0, sentimento, intencao, resumo: `Atendimento de ${intencao} concluído.`, analise: null, entradas_desde_analise: 0, followups: 0,
          primeira_resposta_ms: primeira ?? 4000, resolvida_por: resolvidaPor, ultima_mensagem: msgs.at(-1).texto.slice(0, 160), ultima_msg_em: msgs.at(-1).criada_em, criada_em: criada, resolvida_em: msgs.at(-1).criada_em + 2 * MIN,
        });
        for (const m of msgs) {
          ins("mensagens", { id: idMsg(), empresa_id: EMPRESA_ID, conversa_id: conv, wamid: `wamid.DEMOH${nMsg}`, direcao: m.autor === "cliente" ? "entrada" : "saida", autor: m.autor, autor_id: m.autor === "humano" ? usuarioHumano : null, tipo: m.autor === "campanha" ? "template" : "text", texto: m.texto, conteudo: {}, status: m.autor === "cliente" ? null : "lida", erro: null, responde_a: null, criada_em: m.criada_em });
          if (m.autor === "cliente") ultimaEntrada.set(contato.id, m.criada_em);
        }
        for (const tg of tagsCen) if (!contato.tags.includes(tg)) contato.tags.push(tg);
        // Uso da IA (para o gráfico de consumo)
        const chamadas = msgs.filter((m) => m.autor === "ia").length * 2;
        db.prepare(
          `INSERT INTO uso_ia (empresa_id, dia, chamadas, tokens_entrada, tokens_saida, tokens_cache) VALUES (?,?,?,?,?,?)
           ON CONFLICT (empresa_id, dia) DO UPDATE SET chamadas = chamadas + excluded.chamadas, tokens_entrada = tokens_entrada + excluded.tokens_entrada, tokens_saida = tokens_saida + excluded.tokens_saida, tokens_cache = tokens_cache + excluded.tokens_cache`,
        ).run(EMPRESA_ID, new Date(criada).toISOString().slice(0, 10), chamadas, chamadas * 2100, chamadas * 140, chamadas * 1700);
      }
    }

    /* ---------- Hoje: conversas ao vivo ---------- */
    const atras = (min) => agora - min * MIN;
    const amanha = localBrasilia(agora + DIA).iso;
    const quando = (iso, hhmm) => formatarQuando(instanteDe(iso, hhmm));
    const ab = (iso) => `${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(`${iso}T12:00:00-03:00`).getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    const sabado = (() => {
      for (let d = 1; d <= 7; d++) {
        const l = localBrasilia(agora + d * DIA);
        if (l.diaSemana === 6) return l.iso;
      }
      return amanha;
    })();
    const transf = (motivo, resumo, prioridade = "normal") => ({ nota: `🙋 Transferido para a equipe: ${motivo}\n${resumo}`, conteudo: { transferencia: { motivo, resumo, prioridade } } });
    const HOJE = [
      {
        c: 1, status: "resolvida", modo: "ia", resolvida_por: "ia", intencao: "agendamento", sentimento: "positivo", pontuacao: 92, etapa: "cliente", tags: ["limpeza"],
        analise: { urgencia: "baixa", temperatura_lead: 92, etapa_sugerida: "cliente", resumo: "Carlos pediu o preço da limpeza e agendou pelo WhatsApp com a IA para amanhã às 09:00.", proxima_acao: "Nada a fazer: o lembrete automático sai na véspera.", precisa_humano: false, motivo_alerta: "", objecoes: [] },
        falas: [
          [190, "cliente", "Bom dia! Quanto custa uma limpeza?"],
          [190, "ia", "Bom dia, Carlos! 😊 Eu sou a Lia, assistente virtual da Clínica Sorriso. A limpeza completa (remoção de tártaro, profilaxia e polimento) custa *R$ 180*, e a avaliação com o dentista é *gratuita*. Quer que eu veja um horário para você?"],
          [187, "cliente", "Quero sim, amanhã de manhã tem?"],
          [187, "ia", "Tenho estes horários para *Limpeza* (60 min). Qual fica melhor para você?", { tipo: "interactive", conteudo: { opcoes: [`${ab(amanha)} 09:00`, `${ab(amanha)} 10:30`, `${ab(amanha)} 11:00`] } }],
          [185, "cliente", `${ab(amanha)} 09:00`, { tipo: "resposta", conteudo: { resposta: { id: "op1", titulo: `${ab(amanha)} 09:00` } } }],
          [185, "ia", `Prontinho, Carlos! ✅ Sua *Limpeza* ficou agendada para *${quando(amanha, "09:00")}*.\n\n📍 Av. Rondon Pacheco, 1500 · chegue uns 10 minutinhos antes. Na véspera eu te mando um lembrete por aqui.`],
          [185, "nota", `📅 Agendado pela IA: Limpeza em ${quando(amanha, "09:00")}`],
          [183, "cliente", "Obrigado!"],
          [183, "ia", "Por nada, Carlos! Até amanhã 😊"],
        ],
      },
      {
        c: 2, status: "aberta", modo: "ia", intencao: "clareamento", sentimento: "positivo", pontuacao: 82, etapa: "proposta", tags: ["clareamento", "instagram"], valor: 65000,
        analise: { urgencia: "baixa", temperatura_lead: 82, etapa_sugerida: "proposta", resumo: "Fernanda quer clareamento, recebeu valores e parcelamento. Vai decidir com o marido.", proxima_acao: "Follow-up amanhã oferecendo a avaliação gratuita.", precisa_humano: false, motivo_alerta: "", objecoes: ["decisão compartilhada", "preço"] },
        falas: [
          [95, "cliente", "Oi, vocês fazem clareamento? Quanto fica?"],
          [95, "ia", "Oi, Fernanda! Fazemos sim ✨ O clareamento a laser no consultório sai *a partir de R$ 650* (em novembro com 15% de desconto: *R$ 552,50*), e o caseiro com moldeira, R$ 890. Antes, o dentista faz uma avaliação *gratuita* para indicar o melhor para você."],
          [80, "cliente", "Parcela no cartão?"],
          [80, "ia", "Parcelamos em até *10x sem juros* no cartão, e no Pix tem 5% de desconto. Quer agendar a avaliação gratuita?"],
          [62, "cliente", "Vou ver com meu marido e te falo"],
          [62, "ia", "Claro, Fernanda! Fico à disposição 😊 O desconto de novembro vale até o dia 30."],
        ],
      },
      {
        c: 3, status: "aguardando", modo: "humano", prioridade: "alta", intencao: "urgência", sentimento: "negativo", pontuacao: 70, etapa: "qualificado", tags: ["urgencia"], nao_lidas: 1,
        analise: { urgencia: "alta", temperatura_lead: 70, etapa_sugerida: "qualificado", resumo: "Roberto está com dor forte no dente do fundo desde ontem, com leve inchaço. A IA transferiu como urgência.", proxima_acao: "Ligar agora e oferecer encaixe de urgência no primeiro horário livre.", precisa_humano: true, motivo_alerta: "Paciente com dor: priorizar encaixe", objecoes: [] },
        falas: [
          [14, "cliente", "Boa tarde, estou com muita dor no dente do fundo desde ontem, inchou um pouco"],
          [14, "ia", "Sinto muito pela dor, Roberto 😟 Dor com inchaço precisa ser vista logo. Já marquei seu caso como *urgência* e chamei a nossa equipe para um encaixe. Em instantes alguém da recepção continua com você por aqui."],
          [14, "nota", ...Object.values(transf("dor ou urgência odontológica", "Roberto relata dor forte no dente posterior desde ontem e leve inchaço. Precisa de encaixe de urgência hoje.", "alta"))],
          [9, "cliente", "Tem como ser ainda hoje? Não tô aguentando"],
        ],
      },
      {
        c: 4, status: "aguardando", modo: "humano", intencao: "negociação", sentimento: "neutro", pontuacao: 80, etapa: "negociacao", tags: ["implante"], valor: 320000, nao_lidas: 1,
        analise: { urgencia: "media", temperatura_lead: 80, etapa_sugerida: "negociacao", resumo: "Patrícia fez avaliação para implante (R$ 3.200) e quer parcelar em mais vezes. Caso com a equipe financeira.", proxima_acao: "Oferecer 12x sem juros no cartão ou entrada + boletos e fechar hoje.", precisa_humano: false, motivo_alerta: "", objecoes: ["preço", "parcelamento"] },
        falas: [
          [48, "cliente", "Olá, fiz avaliação semana passada para implante. O orçamento deu R$ 3.200, consigo parcelar em mais vezes?"],
          [48, "ia", "Oi, Patrícia! Que bom ter você de volta 😊 Condições especiais de pagamento são com a nossa equipe financeira. Já passei seu caso com o resumo da conversa. Em instantes alguém da recepção continua com você por aqui."],
          [48, "nota", ...Object.values(transf("negociação de parcelamento", "Patrícia quer parcelar o implante (orçamento R$ 3.200) em mais vezes do que o padrão."))],
          [30, "cliente", "Ok, aguardo"],
        ],
      },
      {
        c: 5, status: "aberta", modo: "humano", atribuida_a: "demo-u-atendente", intencao: "convênio", sentimento: "positivo", pontuacao: 75, etapa: "qualificado", tags: ["convenio-amil"], nao_lidas: 1,
        analise: { urgencia: "baixa", temperatura_lead: 75, etapa_sugerida: "qualificado", resumo: "Marcos tem Amil 200 e quer tratar canal. Juliana confirmou a cobertura; ele pediu sexta à tarde.", proxima_acao: "Confirmar sexta à tarde na agenda e enviar a confirmação.", precisa_humano: false, motivo_alerta: "", objecoes: [] },
        falas: [
          [70, "cliente", "Vocês atendem Amil Dental?"],
          [70, "ia", "Atendemos sim, Marcos! 😊 Aceitamos *OdontoPrev* e *Amil Dental*. É só trazer a carteirinha e um documento com foto."],
          [66, "cliente", "Meu plano é o Amil 200, cobre canal?"],
          [66, "ia", "A cobertura depende do seu plano, então vou pedir para a recepção conferir para você. Em instantes alguém da equipe continua por aqui."],
          [66, "nota", ...Object.values(transf("conferir cobertura do convênio", "Marcos tem Amil 200 e quer saber se cobre tratamento de canal."))],
          [52, "nota", "🙋 Juliana Reis assumiu a conversa."],
          [40, "humano", "*Juliana:*\nOi, Marcos! Aqui é a Juliana, da recepção. Conferi: o Amil 200 cobre tratamento de canal, e a sua carência já foi cumprida. Quer agendar a avaliação?"],
          [35, "cliente", "Que ótimo! Pode ser sexta à tarde?"],
        ],
      },
      {
        c: 6, status: "aberta", modo: "ia", intencao: "clareamento", sentimento: "positivo", pontuacao: 85, etapa: "proposta", tags: ["clareamento"], valor: 55250, campanha: true,
        analise: { urgencia: "baixa", temperatura_lead: 85, etapa_sugerida: "proposta", resumo: "Luana respondeu à campanha de clareamento e pediu horários de sábado.", proxima_acao: "Aguardar a escolha do horário (a IA já enviou as opções).", precisa_humano: false, motivo_alerta: "", objecoes: [] },
        falas: [
          [6 * 1440 + 600, "campanha", "Oi, Luana! Novembro é o mês do sorriso na Clínica Sorriso 😁 Clareamento a laser com 15% de desconto até 30/11. Quer saber mais?", { tipo: "template", conteudo: { nome: "clareamento_novembro", idioma: "pt_BR", variaveis: ["Luana"] } }],
          [25, "cliente", "Oi! Vi a promoção do clareamento, ainda está valendo?"],
          [25, "ia", "Está valendo sim, Luana! 🎉 Até 30/11 o clareamento a laser sai de R$ 650 por *R$ 552,50*, em até 10x sem juros. A avaliação antes é gratuita."],
          [22, "cliente", "Ah que bom, me manda os horários de sábado"],
          [22, "ia", "Tenho estes horários para *Clareamento* (60 min) no sábado. Qual fica melhor para você?", { tipo: "interactive", conteudo: { opcoes: [`${ab(sabado)} 08:00`, `${ab(sabado)} 09:30`, `${ab(sabado)} 10:30`] } }],
        ],
      },
      {
        c: 7, status: "resolvida", modo: "ia", resolvida_por: "ia", intencao: "confirmação", sentimento: "positivo", pontuacao: 60, etapa: "cliente", tags: ["ortodontia"],
        falas: [
          [20 * 60, "campanha", `Olá, Sônia! Lembrete da Clínica Sorriso: sua Manutenção ortodôntica é ${quando(hoje, "15:00")}. Responda SIM para confirmar ou REMARCAR.`, { tipo: "template", conteudo: { nome: "lembrete_consulta", idioma: "pt_BR", variaveis: ["Sônia", quando(hoje, "15:00")] } }],
          [150, "cliente", "Sim, confirmo"],
          [150, "ia", "Perfeito, Sônia! Sua manutenção está confirmada. Te esperamos 😊"],
        ],
      },
      {
        c: 8, status: "resolvida", modo: "humano", resolvida_por: "humano", atribuida_a: "demo-u-atendente", intencao: "agendamento", sentimento: "positivo", pontuacao: 55, etapa: "cliente", tags: ["retorno"],
        falas: [
          [130, "cliente", "Bom dia, preciso remarcar a restauração de hoje, surgiu um imprevisto no trabalho"],
          [130, "ia", "Sem problema, Diego! Vou pedir para a recepção remarcar com você."],
          [125, "nota", "🙋 Juliana Reis assumiu a conversa."],
          [118, "humano", `*Juliana:*\nOi, Diego! Remarquei sua restauração para ${quando(amanha, "16:00")}. Tudo certo?`],
          [110, "cliente", "Perfeito, obrigado Juliana!"],
          [108, "nota", "✅ Juliana Reis encerrou o atendimento."],
        ],
      },
      {
        c: 9, status: "aberta", modo: "ia", intencao: "horário", sentimento: "neutro", pontuacao: 45, etapa: "novo", tags: ["instagram"],
        falas: [
          [5, "cliente", "Vocês abrem sábado?"],
          [5, "ia", "Abrimos sim, Gabriel! Atendemos de *segunda a sexta, das 8h às 19h*, e aos *sábados, das 8h às 12h*. Quer que eu veja um horário?"],
        ],
      },
      {
        c: 10, status: "aguardando", modo: "humano", intencao: "orçamento", sentimento: "neutro", pontuacao: 65, etapa: "proposta", tags: ["ortodontia", "vip"], valor: 240000, nao_lidas: 1,
        falas: [
          [21, "cliente", "Quero falar com a Dra. Helena sobre o orçamento do aparelho da minha filha"],
          [21, "ia", "Claro, Tatiane! Já chamei uma pessoa da nossa equipe e passei o resumo da conversa, assim você não precisa repetir nada. Em instantes alguém da recepção continua com você por aqui."],
          [21, "nota", ...Object.values(transf("cliente pediu para falar com uma pessoa", "Tatiane quer conversar com a Dra. Helena sobre o orçamento do aparelho da filha."))],
        ],
      },
    ];

    for (const cv of HOJE) {
      const contato = contatoDe(cv.c);
      const conv = `demo-v-hoje-${String(cv.c).padStart(2, "0")}`;
      Object.assign(contato, { etapa: cv.etapa, pontuacao: cv.pontuacao, tags: [...new Set([...cv.tags, ...contato.tags.slice(0, 1)])], valor_estimado: cv.valor ?? valores[cv.etapa] ?? null, criado_em: Math.min(contato.criado_em, atras(cv.falas[0][0] + 60)) });
      const falas = cv.falas.map(([min, autor, texto, extra]) => ({ criada_em: atras(min) + (autor === "ia" ? 5000 : 0), autor, texto, extra }));
      let ultimo = 0;
      for (const f of falas) f.criada_em = ultimo = Math.max(f.criada_em, ultimo + 1000);
      const visiveis = falas.filter((f) => f.autor !== "nota");
      const primeiraEntrada = falas.find((f) => f.autor === "cliente");
      const primeiraSaida = falas.find((f) => f.criada_em > (primeiraEntrada?.criada_em ?? 0) && ["ia", "humano"].includes(f.autor));
      ins("conversas", {
        id: conv, empresa_id: EMPRESA_ID, contato_id: contato.id, canal_id: CANAL.id, status: cv.status, modo: cv.modo, atribuida_a: cv.atribuida_a ?? null, prioridade: cv.prioridade ?? "normal", nao_lidas: cv.nao_lidas ?? 0,
        sentimento: cv.sentimento, intencao: cv.intencao, resumo: cv.analise?.resumo ?? null, analise: cv.analise ? { sentimento: cv.sentimento, intencao: cv.intencao, ...cv.analise, analisada_em: visiveis.at(-1).criada_em } : null,
        entradas_desde_analise: 0, followups: 0, primeira_resposta_ms: primeiraSaida && primeiraEntrada ? primeiraSaida.criada_em - primeiraEntrada.criada_em : null, resolvida_por: cv.resolvida_por ?? null,
        ultima_mensagem: visiveis.at(-1).texto.slice(0, 160), ultima_msg_em: visiveis.at(-1).criada_em, criada_em: falas[0].criada_em, resolvida_em: cv.status === "resolvida" ? falas.at(-1).criada_em + MIN : null,
      });
      for (const f of falas) {
        const nota = f.autor === "nota";
        ins("mensagens", {
          id: idMsg(), empresa_id: EMPRESA_ID, conversa_id: conv, wamid: nota ? null : `wamid.DEMOT${nMsg}`, direcao: nota ? "nota" : f.autor === "cliente" ? "entrada" : "saida", autor: nota ? "sistema" : f.autor,
          autor_id: f.autor === "humano" ? (cv.atribuida_a ?? "demo-u-atendente") : null, tipo: nota ? "nota" : (f.extra?.tipo ?? "text"), texto: f.texto, conteudo: (nota ? f.extra : f.extra?.conteudo) ?? {},
          status: nota || f.autor === "cliente" ? null : "lida", erro: null, responde_a: null, criada_em: f.criada_em,
        });
        if (f.autor === "cliente") ultimaEntrada.set(contato.id, f.criada_em);
      }
    }

    const fim = db.prepare("UPDATE contatos SET tags = ?, etapa = ?, pontuacao = ?, valor_estimado = ?, criado_em = ?, ultima_entrada_em = ? WHERE id = ?");
    for (const c of contatos) fim.run(JSON.stringify(c.tags), c.etapa, c.pontuacao, c.valor_estimado, c.criado_em, ultimaEntrada.get(c.id) ?? null, c.id);

    /* ---------- Agenda ---------- */
    let nAg = 0;
    const agendar = (iso, hhmm, duracao, servico, ci, criado_por = "ia", status) => {
      const inicio = instanteDe(iso, hhmm);
      ins("agendamentos", { id: `demo-ag-${String(++nAg).padStart(3, "0")}`, empresa_id: EMPRESA_ID, contato_id: contatoDe(ci).id, inicio, duracao_min: duracao, servico, observacoes: null, status: status ?? (inicio + duracao * MIN < agora ? "concluido" : "confirmado"), lembrete_enviado: inicio - DIA < agora ? 1 : 0, criado_por, criado_em: Math.min(agora - 2 * MIN, inicio - 2 * DIA) });
    };
    const diaUtil = (iso) => new Date(`${iso}T12:00:00-03:00`).getUTCDay() !== 0;
    if (diaUtil(hoje)) {
      agendar(hoje, "08:00", 30, "Avaliação", 11, "ia");
      agendar(hoje, "09:00", 60, "Limpeza", 12, "humano");
      agendar(hoje, "10:00", 60, "Clareamento", 13, "ia");
      agendar(hoje, "11:00", 30, "Avaliação", 14, "ia", instanteDe(hoje, "11:30") < agora ? "faltou" : undefined);
      agendar(hoje, "14:00", 60, "Restauração", 15, "humano");
      agendar(hoje, "15:00", 30, "Manutenção ortodôntica", 7, "humano");
      agendar(hoje, "16:00", 60, "Limpeza", 16, "ia");
      agendar(hoje, "17:30", 30, "Avaliação", 17, "ia");
    }
    agendar(amanha, "09:00", 60, "Limpeza", 1, "ia");
    agendar(amanha, "10:30", 30, "Avaliação", 18, "ia");
    agendar(amanha, "14:00", 60, "Clareamento", 19, "ia");
    agendar(amanha, "16:00", 60, "Restauração", 8, "humano");
    // Histórico de agendamentos (métrica "agendados pela IA")
    for (let d = 2; d <= 60; d += 1) {
      const iso = localBrasilia(agora - d * DIA).iso;
      if (!diaUtil(iso)) continue;
      const qtd = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < qtd; k++) {
        const servico = CONFIG.agenda.servicos[Math.floor(rand() * 5)];
        agendar(iso, `${String(8 + Math.floor(rand() * 10)).padStart(2, "0")}:${rand() < 0.5 ? "00" : "30"}`, servico.duracao, servico.nome, 11 + Math.floor(rand() * 50), rand() < 0.7 ? "ia" : "humano", rand() < 0.08 ? "faltou" : "concluido");
      }
    }

    /* ---------- Modelos e campanhas ---------- */
    const MODELOS = [
      ["clareamento_novembro", "MARKETING", "Oi, {{1}}! Novembro é o mês do sorriso na Clínica Sorriso 😁 Clareamento a laser com 15% de desconto até 30/11. Quer saber mais?"],
      ["lembrete_consulta", "UTILITY", "Olá, {{1}}! Lembrete da Clínica Sorriso: sua consulta é {{2}}. Responda SIM para confirmar ou REMARCAR."],
      ["retorno_semestral", "MARKETING", "Oi, {{1}}! Já faz 6 meses da sua última limpeza. Que tal agendar o seu retorno? A avaliação é gratuita 😊"],
    ];
    for (const [i, [nome, categoria, corpo]] of MODELOS.entries())
      ins("modelos", { id: `demo-t-${i + 1}`, empresa_id: EMPRESA_ID, canal_id: CANAL.id, meta_id: `demo-meta-t${i + 1}`, nome, idioma: "pt_BR", categoria, status: "APPROVED", componentes: [{ type: "BODY", text: corpo, ...(corpo.includes("{{2}}") ? { example: { body_text: [["Ana", "amanhã às 15:00"]] } } : { example: { body_text: [["Ana"]] } }) }, { type: "FOOTER", text: "Responda SAIR para não receber" }], atualizado_em: agora - 40 * DIA });

    const camp = "demo-camp-clareamento";
    ins("campanhas", { id: camp, empresa_id: EMPRESA_ID, canal_id: CANAL.id, nome: "Clareamento de Novembro", modelo_nome: "clareamento_novembro", idioma: "pt_BR", variaveis: ["{primeiro_nome}"], filtro: { tags: [], etapas: ["novo", "qualificado", "proposta", "cliente"] }, status: "concluida", agendada_para: atras(6 * 1440 + 600), criada_em: atras(7 * 1440), concluida_em: atras(6 * 1440 + 590) });
    const publico = contatos.filter((c) => !c.opt_out).slice(5, 53);
    for (const [i, c] of publico.entries()) {
      const status = c.id === contatoDe(6).id ? "respondido" : i % 24 === 23 ? "falhou" : i % 4 === 0 ? "respondido" : i % 6 === 1 ? "entregue" : "lido";
      ins("campanha_envios", { id: `demo-e-${String(i + 1).padStart(3, "0")}`, campanha_id: camp, contato_id: c.id, wamid: `wamid.DEMOC${i + 1}`, status, erro: status === "falhou" ? "131026: número sem WhatsApp" : null });
    }
    if (!publico.some((c) => c.id === contatoDe(6).id)) ins("campanha_envios", { id: "demo-e-luana", campanha_id: camp, contato_id: contatoDe(6).id, wamid: "wamid.DEMOCL", status: "respondido", erro: null });
    repo.recontarCampanha(camp);
    ins("campanhas", { id: "demo-camp-retorno", empresa_id: EMPRESA_ID, canal_id: CANAL.id, nome: "Retorno semestral · dezembro", modelo_nome: "retorno_semestral", idioma: "pt_BR", variaveis: ["{primeiro_nome}"], filtro: { tags: ["limpeza"], etapas: [] }, status: "rascunho", agendada_para: null, criada_em: atras(90), concluida_em: null });

    /* ---------- Histórico de ações ---------- */
    for (const [i, [u, acao, det, min]] of [
      ["demo-u-dono", "conta_criada", null, 120 * 1440],
      ["demo-u-dono", "whatsapp_conectado", { numero: CANAL.numero }, 120 * 1440 - 30],
      ["demo-u-dono", "usuario_criado", { email: "juliana@clinicasorriso.demo", papel: "atendente" }, 100 * 1440],
      ["demo-u-admin", "modelo_criado", { nome: "clareamento_novembro" }, 40 * 1440],
      ["demo-u-dono", "campanha_criada", { nome: "Clareamento de Novembro" }, 7 * 1440],
      ["demo-u-dono", "ia_corrigida", { situacao: "avaliação é paga?" }, 20 * 1440],
      ["demo-u-atendente", "login", null, 240],
    ].entries())
      ins("auditoria", { id: `demo-au-${i + 1}`, empresa_id: EMPRESA_ID, usuario_id: u, acao, detalhe: det ? JSON.stringify(det) : null, criado_em: atras(min) });
  });

  return { empresa_id: EMPRESA_ID, contatos: NOMES.length, conversas: nConv + 10, mensagens: nMsg };
}
