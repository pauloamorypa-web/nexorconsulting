/* Pontuação de lead (0 a 100), explicável, para as campanhas.

   Quem lê a conversa é a Blue (o modelo): ela preenche os sinais na ferramenta qualificar_lead.
   Quem dá a nota é este código, sempre com as mesmas regras, e cada ponto vem com o motivo.

   Fit com o ICP (até 40)     segmento ou CNAE 15 · porte 10 · cargo de decisor 10 · região 5
   Intenção (até 30)          dor declarada 12 · urgência 10 · orçamento 8
   Engajamento (até 30)       perguntas respondidas 3 cada (até 9) · pediu demonstração 10 ·
                              pediu preço 4 · deixou WhatsApp 4 · deixou e-mail 3

   Classes: quente ≥ 70 (aviso imediato à equipe) · morno 40 a 69 (cadência) · frio < 40 (conteúdo).
   Filtros anti-curioso: concorrente (nota até 10), estudante (até 15), pessoa física sem empresa
   em produto B2B (até 25). Quem só quer preço e não tem fit nem filtro vira morno (nota 40) e
   recebe o material de preços: nunca é descartado de forma grosseira. */

import { CAMPANHAS, DECISORES, INFLUENCIADORES, UMBRELLA, norm } from "./campanhas.js";

export const LIMIARES = { quente: 70, morno: 40 };
export const classeDaNota = (nota) => (nota >= LIMIARES.quente ? "quente" : nota >= LIMIARES.morno ? "morno" : "frio");

/* Triângulo Mineiro e Alto Paranaíba: região de origem da Nexor, pesa mais. */
const TRIANGULO = [
  "uberlandia", "uberaba", "araguari", "ituiutaba", "patos de minas", "araxa", "monte carmelo", "frutal", "iturama", "prata",
  "tupaciguara", "sacramento", "conceicao das alagoas", "monte alegre de minas", "patrocinio", "campina verde", "capinopolis",
  "santa vitoria", "coromandel", "nova ponte", "indianopolis", "estrela do sul", "cascalho rico", "canapolis", "centralina",
  "arapora", "delta", "conquista", "perdizes", "ibia", "carmo do paranaiba", "sao gotardo", "triangulo mineiro", "triangulo",
];
const MINAS = [
  "belo horizonte", "contagem", "betim", "juiz de fora", "montes claros", "ipatinga", "divinopolis", "sete lagoas", "pocos de caldas",
  "varginha", "pouso alegre", "governador valadares", "teofilo otoni", "lavras", "barbacena", "itajuba", "passos", "paracatu",
  "unai", "joao monlevade", "ouro preto", "nova lima", "minas gerais", "mg",
];
const OUTRAS = [
  "sao paulo", "campinas", "ribeirao preto", "franca", "sao jose do rio preto", "rio de janeiro", "goiania", "anapolis", "itumbiara",
  "catalao", "rio verde", "caldas novas", "brasilia", "curitiba", "porto alegre", "florianopolis", "salvador", "recife", "fortaleza",
  "manaus", "belem", "campo grande", "cuiaba", "vitoria", "natal", "joao pessoa", "maceio", "aracaju", "teresina", "sao luis",
  "palmas", "porto velho", "boa vista", "macapa", "rio branco", "londrina", "maringa", "santos", "sorocaba", "barretos",
];
const UF_FORA_MG = /\b(sp|rj|go|df|pr|sc|rs|ba|pe|ce|am|pa|ms|mt|es|rn|pb|al|se|pi|ma|to|ro|rr|ap|ac)\b/;

const temPalavra = (texto, termo) => new RegExp(`(^|[^a-z])${termo.replace(/ /g, "\\s+")}([^a-z]|$)`).test(texto);

/** Classifica a região a partir da cidade e da UF informadas. */
export function regiao(cidade, uf) {
  const t = norm(`${cidade ?? ""} ${uf ?? ""}`).trim();
  if (!t) return null;
  const achada = (lista) => lista.find((c) => temPalavra(t, c));
  const tri = achada(TRIANGULO);
  if (tri) return { tipo: "triangulo", nome: cidade || tri };
  if (achada(MINAS) || /\bmg\b/.test(t)) return { tipo: "minas", nome: cidade || "MG" };
  return { tipo: "outra", nome: cidade || uf };
}

/** Indica o produto pela dor, pelo segmento e pelo que a pessoa contou (campanha guarda-chuva). */
export function indicarProduto(sinais) {
  const seg = norm(`${sinais.segmento ?? ""} ${sinais.perfil ?? ""}`);
  const tudo = norm(`${seg} ${sinais.dor ?? ""} ${sinais.ferramenta_atual ?? ""} ${sinais.produto_interesse ?? ""}`);
  let melhor = null;
  for (const c of CAMPANHAS) {
    if (c.umbrella) continue;
    let pontos = 0;
    if (c.icp.segmentos && seg && c.icp.segmentos.test(seg)) pontos += 3;
    if (sinais.cnae && Array.isArray(c.icp.cnae) && c.icp.cnae.some((p) => String(sinais.cnae).replace(/\D/g, "").startsWith(p))) pontos += 3;
    if (c.gatilhos.forte.test(tudo)) pontos += 3;
    if (c.palavras.test(tudo)) pontos += 2;
    if (c.dores.test(tudo)) pontos += 1;
    if (pontos >= 2 && (!melhor || pontos > melhor.pontos)) melhor = { c, pontos };
  }
  return melhor?.c ?? null;
}

/* Unidades equivalentes: "10 colaboradores" serve para quem mede em funcionários ou pessoas. */
const PESSOAS = ["colaboradores", "funcionarios", "pessoas", "empregados"];
const raiz = (u) => norm(u).split(" ")[0];
function faixaDoPorte(faixas, unidade) {
  if (!unidade) return faixas[0];
  const u = raiz(unidade);
  return faixas.find((f) => raiz(f.unidade) === u || (PESSOAS.includes(u) && PESSOAS.includes(raiz(f.unidade)))) ?? null;
}

/* "barbeiros" → "barbeiro", "mensagens por dia" → "mensagem por dia" */
const singular = (unidade) => String(unidade).replace(/^(\S+)/, (p) => p.replace(/ores$/, "or").replace(/ns$/, "m").replace(/s$/, ""));

const motivo = (lista, pontos, texto) => {
  lista.push(pontos ? `${pontos > 0 ? "+" : ""}${pontos} ${texto}` : texto);
  return pontos;
};

/** Perguntas da campanha que já têm resposta nos sinais. */
export function perguntasRespondidas(sinais, campanha) {
  return campanha.perguntas.filter((p) => {
    const v = sinais[p.sinal];
    return v !== undefined && v !== null && v !== "" && v !== "nao_informado";
  }).length;
}

/**
 * Pontua o lead. A campanha diz o ICP; na campanha guarda-chuva, vale o ICP do produto indicado.
 * @returns {{nota: number, classe: string, motivos: string[], descarte: string|null, componentes: object,
 *   campanha: string, produto: string, produto_indicado: string|null, proxima_acao: string}}
 */
export function pontuarLead(sinais = {}, campanha = UMBRELLA) {
  const motivos = [];
  let indicado = null;
  let icpCampanha = campanha;
  if (campanha.umbrella) {
    indicado = indicarProduto(sinais);
    if (indicado) icpCampanha = indicado;
  }
  const icp = icpCampanha.icp;
  const seg = norm(`${sinais.segmento ?? ""} ${sinais.perfil ?? ""}`).trim();
  const cnae = String(sinais.cnae ?? "").replace(/\D/g, "");

  /* ---------- Fit com o ICP ---------- */
  let fit = 0;
  let semFit = false;
  const cnaeBate = cnae.length >= 4 && (icp.cnae === "*" || icp.cnae.some((p) => cnae.startsWith(p)));
  if (cnaeBate) fit += motivo(motivos, 15, `CNAE ${sinais.cnae} no ICP de ${icpCampanha.produto}`);
  else if (seg && (!icp.segmentos || icp.segmentos.test(seg))) fit += motivo(motivos, 15, `segmento no ICP: ${sinais.segmento ?? sinais.perfil}`);
  else if (seg) {
    fit += motivo(motivos, 5, `segmento fora do foco de ${icpCampanha.produto}: ${sinais.segmento ?? sinais.perfil}`);
    semFit = true;
    if (!campanha.umbrella) indicado = indicarProduto(sinais);
  } else if (sinais.empresa || sinais.tem_empresa) fit += motivo(motivos, 5, "tem empresa, segmento não informado");
  else semFit = true;

  const n = Number(sinais.porte_numero);
  if (Number.isFinite(n) && n > 0) {
    const faixa = faixaDoPorte(icp.porte, sinais.porte_unidade);
    if (!faixa) fit += motivo(motivos, 4, `porte informado: ${n} ${n === 1 ? singular(sinais.porte_unidade) : sinais.porte_unidade}`);
    else {
      const desc = `${n} ${n === 1 ? singular(faixa.unidade) : faixa.unidade}`;
      if (n >= faixa.ideal) fit += motivo(motivos, 10, `porte ideal: ${desc}`);
      else if (n >= faixa.minimo) fit += motivo(motivos, 6, `porte dentro do ICP: ${desc}`);
      else {
        motivo(motivos, 0, `porte abaixo do mínimo: ${desc} (mínimo ${faixa.minimo})`);
        semFit = true;
      }
    }
  } else if (sinais.porte === "medio" || sinais.porte === "grande") fit += motivo(motivos, 8, `porte ${sinais.porte}`);
  else if (sinais.porte === "pequeno") fit += motivo(motivos, 4, "porte pequeno");

  const cargo = norm(sinais.cargo);
  if (cargo) {
    if (DECISORES.test(cargo) || icp.decisoresExtra?.test(cargo)) fit += motivo(motivos, 10, `decisor: ${sinais.cargo}`);
    else if (INFLUENCIADORES.test(cargo)) fit += motivo(motivos, 4, `influenciador: ${sinais.cargo}`);
    else fit += motivo(motivos, 2, `cargo: ${sinais.cargo}`);
  }

  const r = regiao(sinais.cidade, sinais.uf);
  if (r?.tipo === "triangulo") fit += motivo(motivos, 5, `região: ${r.nome} (Triângulo Mineiro)`);
  else if (r?.tipo === "minas") fit += motivo(motivos, 3, `região: ${r.nome} (Minas Gerais)`);
  else if (r) fit += motivo(motivos, 1, `região: ${r.nome}`);

  /* ---------- Dor, urgência e orçamento ---------- */
  let intencao = 0;
  if (String(sinais.dor ?? "").trim().length >= 3) intencao += motivo(motivos, 12, "dor declarada");
  if (sinais.urgencia === "alta") intencao += motivo(motivos, 10, "urgência alta");
  else if (sinais.urgencia === "media") intencao += motivo(motivos, 5, "urgência média");
  else if (sinais.urgencia === "baixa") motivo(motivos, 0, "urgência baixa");
  if (sinais.orcamento === "sim") intencao += motivo(motivos, 8, "tem orçamento");
  else if (sinais.orcamento === "nao") motivo(motivos, 0, "sem orçamento no momento");

  /* ---------- Engajamento ---------- */
  let engajamento = 0;
  const respondidas = Math.max(perguntasRespondidas(sinais, campanha), Math.min(campanha.perguntas.length, Number(sinais.perguntas_respondidas) || 0));
  if (respondidas) engajamento += motivo(motivos, Math.min(9, respondidas * 3), `respondeu ${respondidas} de ${campanha.perguntas.length} perguntas`);
  if (sinais.pediu_demo) engajamento += motivo(motivos, 10, "pediu demonstração ou teste");
  if (sinais.pediu_preco) engajamento += motivo(motivos, 4, "pediu preço");
  if (sinais.telefone) engajamento += motivo(motivos, 4, "deixou WhatsApp");
  if (sinais.email) engajamento += motivo(motivos, 3, "deixou e-mail");
  engajamento = Math.min(30, engajamento);

  let nota = Math.max(0, Math.min(100, fit + intencao + engajamento));

  /* ---------- Filtros anti-curioso ---------- */
  let descarte = null;
  const limitar = (codigo, teto, texto) => {
    descarte = codigo;
    if (nota > teto) nota = teto;
    motivos.push(`filtro: ${texto} (nota limitada a ${teto})`);
  };
  if (sinais.concorrente) limitar("concorrente", 10, "concorrente");
  else if (sinais.estudante) limitar("estudante", 15, "estudante");
  else if (sinais.pessoa_fisica && !sinais.empresa && !sinais.tem_empresa && !(icp.autonomoOk && (sinais.cargo || sinais.perfil))) limitar("pessoa_fisica", 25, "pessoa física sem empresa em produto B2B");

  let proxima_acao;
  if (!descarte && sinais.pediu_preco && nota < LIMIARES.morno) {
    nota = LIMIARES.morno;
    motivos.push("regra: quem pede preço não é descartado; vira morno com o material de preços (nota 40)");
    proxima_acao = "enviar_material_preco";
  }
  const classe = classeDaNota(nota);
  if (!descarte && classe === "frio") descarte = semFit ? "fora_do_icp" : "pouca_informacao";

  if (!proxima_acao) {
    proxima_acao =
      descarte === "concorrente" ? "encerrar_cordialmente"
      : descarte === "estudante" ? "conteudo_educativo"
      : descarte === "pessoa_fisica" ? "explicar_produto_para_empresas"
      : classe === "quente" ? "agendar_demo"
      : classe === "morno" ? (sinais.pediu_preco ? "enviar_material_preco" : "cadencia")
      : "conteudo";
  }

  return {
    nota,
    classe,
    motivos,
    descarte,
    componentes: { fit, intencao, engajamento },
    campanha: campanha.id,
    produto: indicado && (campanha.umbrella || semFit) ? indicado.produto : campanha.produto,
    produto_indicado: indicado?.produto ?? null,
    proxima_acao,
  };
}

/* ---------- Leitura de sinais por regras (modelo simulado e conferência) ----------
   Na conversa real quem extrai é o modelo. Este extrator faz o mesmo papel com regras simples:
   alimenta o modelo simulado dos testes e serve de reserva. */

const NUM = "(\\d{1,6}(?:[.,]\\d{3})*)";
const PORTE_RE = [
  { unidade: "mensagens por dia", re: new RegExp(`${NUM}\\s*(?:mensagens|msgs?|atendimentos|conversas|contatos|clientes)\\s*(?:por|ao|/|num|no)\\s*dia`) },
  { unidade: "mensagens por dia", re: new RegExp(`${NUM}\\s*(?:mensagens|msgs?|atendimentos|conversas|contatos)\\s*(?:por|ao|/|no)\\s*mes`), fator: 1 / 30 },
  { unidade: "colaboradores", re: new RegExp(`${NUM}\\s*(?:colaboradores|funcionarios|empregados|pessoas|clt)`) },
  { unidade: "funcionários", re: new RegExp(`${NUM}\\s*(?:colaboradores|funcionarios|empregados|pessoas)`) },
  { unidade: "empresas na carteira", re: new RegExp(`${NUM}\\s*(?:empresas|clientes)(?:\\s*na carteira|\\s*ativ[oa]s|\\s*atendid[oa]s)?`) },
  { unidade: "barbeiros", re: new RegExp(`${NUM}\\s*(?:barbeiros|cadeiras|profissionais)`) },
  { unidade: "instaladores", re: new RegExp(`${NUM}\\s*instaladores`) },
  { unidade: "orçamentos por mês", re: new RegExp(`${NUM}\\s*(?:orcamentos|propostas|servicos|instalacoes|obras)\\s*(?:por|ao|/|no)\\s*mes`) },
  { unidade: "computadores", re: new RegExp(`${NUM}\\s*(?:computadores|maquinas|estacoes|notebooks|pcs|desktops|equipamentos)`) },
  { unidade: "técnicos", re: new RegExp(`${NUM}\\s*tecnicos`) },
];
const PALAVRAS_NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, doze: 12, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cem: 100 };
const numeroDe = (s) => Number(String(s).replace(/[.,](?=\d{3}\b)/g, ""));

const SEGMENTOS = [
  "barbearia", "salao", "clinica odontologica", "clinica", "consultorio", "odontologia", "estetica", "loja de roupas", "loja", "e-commerce", "ecommerce",
  "imobiliaria", "escola", "academia", "restaurante", "pizzaria", "hamburgueria", "delivery", "pet shop", "otica", "farmacia", "supermercado",
  "industria", "fabrica", "metalurgica", "construtora", "transportadora", "logistica", "distribuidora", "atacado", "agro", "fazenda", "hotel",
  "escritorio de contabilidade", "contabilidade", "escritorio contabil", "seguranca eletronica", "energia solar", "material eletrico",
  "climatizacao", "refrigeracao", "telecom", "provedor de internet", "hospital", "laboratorio", "oficina", "concessionaria", "advocacia",
  "escritorio de advocacia", "cooperativa", "frigorifico", "padaria", "msp", "software house", "barbeiro", "contador", "contadora",
  "cftv", "alarme", "eletricista", "imobiliaria", "rede de supermercado",
];
/* Segmento citado no singular ou no plural ("supermercados", "clínicas") */
const citaSegmento = (texto, termo) => new RegExp(`(^|[^a-z])${termo.replace(/ /g, "\\s+")}(s|es)?([^a-z]|$)`).test(texto);
const NEGOCIOS = "barbearia|loja|empresa|clinica|escritorio|distribuidora|restaurante|academia|consultorio|industria|fabrica|revenda|pizzaria|padaria|oficina|transportadora|imobiliaria|escola|hamburgueria|farmacia|otica|construtora|agencia";

/**
 * Extrai sinais de qualificação das mensagens do cliente.
 * @param {string[]} textos mensagens do cliente, em ordem
 * @param {{campanha?: object, telefone?: string}} [opcoes]
 */
/* Trecho do texto original (com acentos) na posição achada no texto normalizado */
const noOriginal = (bruto, normalizado, inicio, achado) => (normalizado.length === bruto.length ? bruto.slice(inicio, inicio + achado.length) : achado);

export function extrairSinais(textos, { campanha = UMBRELLA, telefone } = {}) {
  const bruto = textos.join("\n");
  const semAcentoBruto = norm(bruto);
  let t = semAcentoBruto;
  for (const [p, v] of Object.entries(PALAVRAS_NUM)) t = t.replace(new RegExp(`\\b${p}\\b(?=\\s+(?:barbeiros|colaboradores|funcionarios|pessoas|instaladores|tecnicos|empresas|computadores|maquinas|orcamentos|propostas|cadeiras))`, "g"), String(v));
  const s = {};

  // Filtros
  if (/\b(sou|somos) (estudante|universitari|aluno|aluna)|\b(meu|minha|um|uma) (tcc|monografia|trabalho (da|de) (faculdade|escola))|\bpra faculdade\b|\bpara a faculdade\b|\btrabalho academico\b|\bpesquisa (da|pra|para a) faculdade\b/.test(t)) s.estudante = true;
  if (/\b(sou|somos) concorrente|\btrabalho (numa|em uma|na) (empresa|software house) (de|que (faz|vende|desenvolve))|\b(desenvolvo|desenvolvemos|vendemos|revendemos) (um |uma )?(sistema|software|app|aplicativo|chatbot|bot|plataforma)|\bsou revendedor de (sistema|software)|\b(tenho|temos) uma software house\b|\bquero ver como voces fazem\b|\bconcorrente de voces\b|\b(somos|sou de) uma software house\b|\b(agencia|empresa|software house) que (vende|desenvolve|faz) (chatbot|bot|sistema|software|app|aplicativo)/.test(t)) s.concorrente = true;
  if (/\bnao tenho (empresa|cnpj|negocio)|\b(pra|para) (uso )?(pessoal|mim mesm[oa]|minha casa|casa)\b|\bpessoa fisica\b|\buso pessoal\b|\b(na|pra|para a) minha casa\b|\bcomputador de casa\b|\buso domestico\b|\bminha vida\b|\bsou cliente (de|da) (uma )?barbearia\b|\bso quero cortar\b/.test(t)) s.pessoa_fisica = true;

  // Empresa e segmento
  const emp = bruto.match(/(?:empresa|barbearia|escrit[óo]rio|loja|cl[íi]nica|distribuidora)\s+(?:se chama|chamada|é a|e a)\s+([A-ZÀ-Ú0-9][\wÀ-ú&.' -]{1,40}?)(?=[,.!?\n]|$)/i) ?? bruto.match(/\b(?:sou|falo) da ([A-ZÀ-Ú][\wÀ-ú&.' -]{1,40}?)(?=[,.!?\n]|$)/);
  if (emp) s.empresa = emp[1].trim();
  const seg = SEGMENTOS.filter((x) => citaSegmento(t, x)).sort((a, b) => b.length - a.length)[0];
  if (seg) s.segmento = seg;
  const cnae = t.match(/cnae\s*(?:e|eh|é|:)?\s*(\d{4}-?\d(?:\/?\d{2})?)/);
  if (cnae) s.cnae = cnae[1];
  if ((/\bmei\b|\bcnpj\b|\bminha empresa\b|\bnossa empresa\b|\bsomos uma\b|\b(numa|em uma|de uma|na) (empresa|rede)\b/.test(t) || new RegExp(`\\b(tenho|temos) (uma|um) (${NEGOCIOS})`).test(t)) && !s.pessoa_fisica) s.tem_empresa = true;

  // Perfil do Elo
  if (/\b(sou|somos) (um |uma )?(fornecedor|distribuidor|distribuidora|loja|revenda|atacadista)|\btenho uma (loja|distribuidora|revenda)/.test(t)) s.perfil = "fornecedor";
  else if (/\b(sou|somos) (um |uma )?(instalador|instaladora|tecnico|eletricista|integrador)/.test(t)) s.perfil = "instalador";

  // Porte
  for (const p of PORTE_RE) {
    const m = t.match(p.re);
    if (!m) continue;
    const quer = campanha.icp.porte.map((x) => norm(x.unidade));
    if (s.porte_numero && !quer.includes(norm(p.unidade))) continue;
    if (s.porte_numero && quer.includes(norm(s.porte_unidade))) continue;
    s.porte_numero = Math.round(numeroDe(m[1]) * (p.fator ?? 1));
    s.porte_unidade = p.unidade;
  }
  if (!s.porte_numero && /\b(trabalho sozinh|so eu|sou so eu|eu sozinh)/.test(t)) {
    s.porte_numero = 1;
    s.porte_unidade = campanha.icp.porte[0].unidade;
  }

  // Cargo
  const cargo = semAcentoBruto.match(/\b(?:sou|eu sou|como)\s+(?:o |a )?((?:dono|dona|socio|socia|proprietari[oa]|diretor[a]?|gerente|gestor[a]?|coordenador[a]?|responsavel|ceo|fundador[a]?|administrador[a]?|contador[a]?|instalador[a]?|analista|assistente|estagiari[oa]|recepcionista|tecnico|auxiliar|funcionari[oa])(?: (?:de|da|do) (?:ti|rh|dp|comercial|administrativo|financeiro|operacoes|marketing))?)\b/);
  if (cargo) s.cargo = noOriginal(bruto, semAcentoBruto, cargo.index + cargo[0].lastIndexOf(cargo[1]), cargo[1]);
  else if (new RegExp(`\\b(tenho|temos) (uma|um) (${NEGOCIOS})`).test(t)) s.cargo = "dono";

  // Região
  // Só com preposição antes ("sou de Araguari", "em Uberaba"): vários nomes de cidade também são palavras comuns.
  // A busca é no texto sem acentos, mas a cidade sai escrita como a pessoa escreveu.
  const semAcento = semAcentoBruto;
  for (const c of [...TRIANGULO, ...MINAS.filter((x) => x !== "mg" && x !== "minas gerais"), ...OUTRAS]) {
    const m = new RegExp(`\\b(?:de|em|aqui|pra|para)\\s+(${c.replace(/ /g, "\\s+")})(?:[^a-z]|$)`).exec(semAcento);
    if (m) {
      const inicio = m.index + m[0].indexOf(m[1]);
      s.cidade = noOriginal(bruto, semAcento, inicio, m[1]);
      break;
    }
  }
  const uf = t.match(/(?:-|\/|,)\s*(mg|sp|rj|go|df|pr|sc|rs|ba|pe|ce|ms|mt|es)\b/);
  if (uf) s.uf = uf[1].toUpperCase();
  else if (!s.cidade && /\bminas gerais\b/.test(t)) s.uf = "MG";
  else if (!s.cidade && UF_FORA_MG.test(t) && /\b(sou|somos|estou|ficamos|fica) (de|em)\b/.test(t)) s.uf = t.match(UF_FORA_MG)[1].toUpperCase();

  // Dor
  const dorCampanha = campanha.umbrella ? (indicarProduto({ segmento: s.segmento, dor: t })?.dores ?? campanha.dores) : campanha.dores;
  const frases = bruto.split(/(?<=[.!?\n])\s*/).map((f) => f.trim()).filter(Boolean);
  const dorFrase = frases.find((f) => dorCampanha.test(norm(f)) || UMBRELLA.dores.test(norm(f)));
  if (dorFrase) s.dor = dorFrase.slice(0, 200);

  // Ferramenta atual
  const ferr = t.match(/\b(caderno|planilha|excel|papel|relogio de ponto|glpi|whatsapp|agenda de papel|trinks|booksy|dominio|alterdata|questor|omie|bling|tiny|totvs|sankhya|conta azul|nenhum sistema|nao usamos nada|so no whats)\b/);
  if (ferr) s.ferramenta_atual = ferr[1];

  // Urgência
  if (/\burgente|\bpra ontem|\bo quanto antes|\bessa semana|\besta semana|\b(neste|este|esse) mes|\bate o fim do mes|\bimediat|\bainda (esse|este) mes|\bjá quero|\bja quero|\bquero comecar (ja|agora|logo)|\bproxima semana|\bcomecar (logo|agora)/.test(t)) s.urgencia = "alta";
  else if (/\bproximo mes|\bproximos meses|\b(esse|este) ano|\bate o fim do ano|\bdaqui (a )?(um|1|dois|2) mes/.test(t)) s.urgencia = "media";
  else if (/\bsem pressa|\bnao tenho pressa|\bestou pesquisando|\bso pesquisando|\bso olhando|\bano que vem|\bfuturamente|\bmais pra frente|\bum dia\b/.test(t)) s.urgencia = "baixa";

  // Orçamento
  if (/\b(tenho|temos|ja tenho|ja temos) (verba|orcamento)|\borcamento (aprovado|reservado|separado)|\baprov\w* o orcamento|\bverba aprovada|\bcabe no (meu |nosso )?orcamento|\bposso investir|\bpodemos investir/.test(t)) s.orcamento = "sim";
  else if (/\bsem (verba|orcamento|dinheiro)|\bnao tenho (verba|orcamento|dinheiro)|\bso se for (gratis|de graca)|\bnao posso pagar/.test(t)) s.orcamento = "nao";

  // Engajamento
  if (/\bquanto custa|\bqual (e |eh )?o (valor|preco)|\bpreco|\bvalores\b|\btabela de precos|\bmensalidade|\bquanto (fica|sai|e)\b/.test(t)) s.pediu_preco = true;
  if (/\bso (quero|queria) (saber )?(o )?(preco|valor)|\bso o (preco|valor)|\bme passa so o (preco|valor)|\bso preco\b/.test(t)) {
    s.pediu_preco = true;
    s.apenas_preco = true;
  }
  if (/\bdemonstracao|\bdemo\b|\bteste gratis|\bquero (o )?teste|\bquero testar|\bpode ativar|\b(quero|queria|gostaria de|podemos|vamos|posso|pode) (agendar|marcar)|\bmarcar (uma )?(reuniao|conversa|apresentacao)|\bapresentacao|\bdiagnostico/.test(t)) s.pediu_demo = true;
  const email = bruto.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) s.email = email[0].toLowerCase();
  const tel = bruto.match(/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/);
  if (tel) s.telefone = tel[0];
  else if (telefone) s.telefone = telefone;
  if (/\bpode (me )?mandar|\bpode enviar|\bpode me chamar|\bpode sim\b|\bmanda (sim|por aqui|no e-?mail|o material)|\baceito receber/.test(t)) s.aceita_contato = true;

  s.perguntas_respondidas = perguntasRespondidas(s, campanha);
  return s;
}
