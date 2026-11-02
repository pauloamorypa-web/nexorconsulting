/* Ferramentas do atendente virtual. Cada uma tem a definição enviada ao Claude, a validação com zod
   (a entrada vem do modelo e é tratada como não confiável) e a execução. */

import { z } from "zod";
import { ETAPAS } from "../db.js";
import { formatarQuando, horariosLivres, instanteDe } from "../servicos/agenda.js";

const texto = (max) => z.string().trim().min(1).max(max);
const opcional = (max) => z.string().trim().max(max).optional();
const reais = (centavos) => (centavos === null || centavos === undefined ? null : (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

const ESQUEMAS = {
  buscar_conhecimento: z.object({ consulta: texto(300) }),
  consultar_produtos: z.object({ busca: opcional(120), categoria: opcional(80), preco_maximo: z.number().positive().optional() }),
  atualizar_contato: z.object({
    nome: opcional(120),
    email: z.string().trim().email().max(160).optional(),
    etapa: z.enum(ETAPAS).optional(),
    interesse: opcional(300),
    valor_estimado: z.number().min(0).max(100_000_000).optional(),
    etiquetas: z.array(texto(40)).max(10).optional(),
    dados: z.array(z.object({ campo: texto(40), valor: texto(300) })).max(10).optional(),
    nao_receber_campanhas: z.boolean().optional(),
  }),
  enviar_opcoes: z.object({
    texto: texto(1000),
    opcoes: z.array(z.object({ titulo: texto(24), descricao: opcional(72) })).min(1).max(10),
    rotulo_botao: opcional(20),
  }),
  enviar_imagem_produto: z.object({ produto_id: texto(64), legenda: opcional(500) }),
  ver_horarios: z.object({ servico: opcional(80), a_partir_de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  agendar: z.object({ horario: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), servico: texto(80), observacoes: opcional(500) }),
  meus_agendamentos: z.object({}),
  cancelar_agendamento: z.object({ id: texto(64), motivo: opcional(300) }),
  transferir_para_humano: z.object({ motivo: texto(300), resumo: texto(1500), prioridade: z.enum(["normal", "alta"]).optional() }),
  encerrar_atendimento: z.object({ resumo: texto(800) }),
};

const DEFINICOES = {
  buscar_conhecimento: {
    description:
      "Busca na base de conhecimento da empresa (perguntas frequentes, políticas, serviços, preços, prazos, endereço). Use antes de responder qualquer dúvida sobre a empresa. Faça a consulta com palavras-chave, ex.: 'prazo de entrega interior'.",
    input_schema: { type: "object", properties: { consulta: { type: "string" } }, required: ["consulta"], additionalProperties: false },
  },
  consultar_produtos: {
    description: "Consulta o catálogo: nome, descrição, preço, estoque e se tem foto. Sem parâmetros, lista os produtos em destaque.",
    input_schema: {
      type: "object",
      properties: { busca: { type: "string", description: "Palavras do produto" }, categoria: { type: "string" }, preco_maximo: { type: "number", description: "Em reais" } },
      additionalProperties: false,
    },
  },
  atualizar_contato: {
    description:
      "Atualiza o cadastro do cliente no CRM. Use sempre que descobrir algo útil: nome, e-mail, interesse, etapa do funil (novo, qualificado = tem interesse real e perfil, proposta = recebeu preço/orçamento, negociacao, cliente = comprou, perdido = desistiu), valor estimado do negócio em reais e etiquetas.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        email: { type: "string" },
        etapa: { type: "string", enum: ETAPAS },
        interesse: { type: "string", description: "O que o cliente quer, em poucas palavras" },
        valor_estimado: { type: "number", description: "Valor estimado do negócio em reais" },
        etiquetas: { type: "array", items: { type: "string" }, description: "Ex.: 'atacado', 'urgente', 'indicacao'" },
        dados: {
          type: "array",
          description: "Outros dados do cliente, ex.: cidade, CPF/CNPJ informado, tamanho, modelo do carro",
          items: { type: "object", properties: { campo: { type: "string" }, valor: { type: "string" } }, required: ["campo", "valor"], additionalProperties: false },
        },
        nao_receber_campanhas: { type: "boolean", description: "true se o cliente pediu para não receber mensagens promocionais" },
      },
      additionalProperties: false,
    },
  },
  enviar_opcoes: {
    description:
      "Envia ao cliente uma mensagem com opções clicáveis (até 3 viram botões; de 4 a 10 viram uma lista). O texto vai junto com as opções, então use esta ferramenta EM VEZ de escrever a resposta; depois dela, não repita o conteúdo.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Mensagem que acompanha as opções" },
        opcoes: {
          type: "array",
          items: { type: "object", properties: { titulo: { type: "string", description: "Até 20 caracteres para botões, 24 para lista" }, descricao: { type: "string" } }, required: ["titulo"], additionalProperties: false },
        },
        rotulo_botao: { type: "string", description: "Texto do botão que abre a lista, ex.: 'Ver opções'" },
      },
      required: ["texto", "opcoes"],
      additionalProperties: false,
    },
  },
  enviar_imagem_produto: {
    description: "Envia a foto de um produto do catálogo (use o id que veio de consultar_produtos e só para produtos com foto).",
    input_schema: { type: "object", properties: { produto_id: { type: "string" }, legenda: { type: "string" } }, required: ["produto_id"], additionalProperties: false },
  },
  ver_horarios: {
    description: "Lista os próximos horários livres na agenda (horário de Brasília) para um serviço.",
    input_schema: {
      type: "object",
      properties: { servico: { type: "string", description: "Nome do serviço, como está na lista de serviços" }, a_partir_de: { type: "string", description: "Data AAAA-MM-DD, se o cliente pediu um dia" } },
      additionalProperties: false,
    },
  },
  agendar: {
    description: "Agenda um horário para o cliente. Só use depois que o cliente confirmou o horário. Use o horário exatamente como veio de ver_horarios.",
    input_schema: {
      type: "object",
      properties: { horario: { type: "string", description: "Ex.: 2026-11-04T10:30" }, servico: { type: "string" }, observacoes: { type: "string" } },
      required: ["horario", "servico"],
      additionalProperties: false,
    },
  },
  meus_agendamentos: {
    description: "Lista os agendamentos futuros do cliente (para confirmar, remarcar ou cancelar).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  cancelar_agendamento: {
    description: "Cancela um agendamento do cliente, depois que ele confirmou. Para remarcar: cancele e agende o novo horário.",
    input_schema: { type: "object", properties: { id: { type: "string" }, motivo: { type: "string" } }, required: ["id"], additionalProperties: false },
  },
  transferir_para_humano: {
    description: "Passa o atendimento para a equipe humana e envia um resumo. Depois disso você para de responder nesta conversa.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string" },
        resumo: { type: "string", description: "O que o cliente quer e o que já foi feito, para a pessoa continuar sem repetir perguntas" },
        prioridade: { type: "string", enum: ["normal", "alta"] },
      },
      required: ["motivo", "resumo"],
      additionalProperties: false,
    },
  },
  encerrar_atendimento: {
    description: "Marca o atendimento como resolvido quando o cliente teve o que precisava e se despediu.",
    input_schema: { type: "object", properties: { resumo: { type: "string" } }, required: ["resumo"], additionalProperties: false },
  },
};

/** Ferramentas disponíveis para uma empresa (só as que fazem sentido para a configuração dela) */
export function ferramentasDaEmpresa({ config, temCatalogo, temConhecimento }) {
  const nomes = [
    ...(temConhecimento ? ["buscar_conhecimento"] : []),
    ...(temCatalogo ? ["consultar_produtos", "enviar_imagem_produto"] : []),
    "atualizar_contato",
    "enviar_opcoes",
    ...(config.agenda?.ativa ? ["ver_horarios", "agendar", "meus_agendamentos", "cancelar_agendamento"] : []),
    "transferir_para_humano",
    "encerrar_atendimento",
  ];
  return nomes.map((name) => ({ name, ...DEFINICOES[name] }));
}

/**
 * Executa uma chamada de ferramenta.
 * @param {object} ctx
 * @param {ReturnType<import('../db.js').abrirBanco>} ctx.repo
 * @param {object} ctx.empresa empresa com config completa
 * @param {object} ctx.contato
 * @param {object} ctx.conversa
 * @param {{indice: (id: string) => ReturnType<import('./conhecimento.js').criarIndice>}} ctx.conhecimento
 * @param {number} ctx.agora
 * @param {boolean} [ctx.simulacao] true no Playground: nada é gravado
 * @param {object} ctx.saida acumula o que a resposta precisa enviar (opções, imagens, transferência)
 */
export async function executarFerramenta(bloco, ctx) {
  const esquema = ESQUEMAS[bloco.name];
  const resultado = (conteudo, erro = false) => ({
    type: "tool_result",
    tool_use_id: bloco.id,
    content: typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo),
    ...(erro ? { is_error: true } : {}),
  });
  if (!esquema) return resultado(`Ferramenta desconhecida: ${bloco.name}`, true);
  const v = esquema.safeParse(bloco.input ?? {});
  if (!v.success) return resultado(`Entrada inválida: ${v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, true);
  ctx.saida.ferramentas.push(bloco.name);
  try {
    return resultado(await ACOES[bloco.name](v.data, ctx));
  } catch (err) {
    console.error(`[ferramenta] ${bloco.name}:`, err);
    return resultado(`Falha ao executar: ${err.message}`, true);
  }
}

const ACOES = {
  buscar_conhecimento({ consulta }, { conhecimento, empresa, repo, simulacao }) {
    const achados = conhecimento.indice(empresa.id).buscar(consulta, 5);
    if (!simulacao && achados.length) repo.contarUsoConhecimento([...new Set(achados.map((a) => a.id))]);
    return achados.length
      ? { resultados: achados.map(({ titulo, trecho }) => ({ titulo, trecho })) }
      : { resultados: [], aviso: "Nada encontrado. Tente outras palavras ou diga que vai confirmar com a equipe." };
  },

  consultar_produtos({ busca, categoria, preco_maximo }, { repo, empresa }) {
    const nb = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const palavras = nb(busca).split(/\s+/).filter((p) => p.length > 1);
    let itens = repo.produtos(empresa.id, true);
    if (categoria) itens = itens.filter((p) => nb(p.categoria).includes(nb(categoria)));
    if (preco_maximo) itens = itens.filter((p) => p.preco_centavos === null || p.preco_centavos <= preco_maximo * 100);
    if (palavras.length) {
      itens = itens
        .map((p) => ({ p, n: palavras.filter((w) => nb(`${p.nome} ${p.descricao} ${p.categoria} ${p.sku}`).includes(w)).length }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .map((x) => x.p);
    }
    return {
      total: itens.length,
      produtos: itens.slice(0, 12).map((p) => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao?.slice(0, 300),
        preco: reais(p.preco_centavos) ?? "sob consulta",
        estoque: p.estoque === null ? "não controlado" : p.estoque > 0 ? `${p.estoque} disponíveis` : "esgotado",
        categoria: p.categoria,
        tem_foto: Boolean(p.imagem_url),
      })),
    };
  },

  atualizar_contato(d, ctx) {
    const { repo, empresa, simulacao } = ctx;
    const campos = {};
    for (const { campo, valor } of d.dados ?? []) campos[campo.toLowerCase().replace(/\s+/g, "_")] = valor;
    if (d.interesse) campos.interesse = d.interesse;
    const novo = {
      ...(d.nome ? { nome: d.nome } : {}),
      ...(d.email ? { email: d.email } : {}),
      ...(d.etapa ? { etapa: d.etapa } : {}),
      ...(d.valor_estimado !== undefined ? { valor_estimado: Math.round(d.valor_estimado * 100) } : {}),
      ...(d.etiquetas ? { tags: [...(ctx.contato.tags ?? []), ...d.etiquetas] } : {}),
      ...(Object.keys(campos).length ? { campos } : {}),
      ...(d.nao_receber_campanhas !== undefined ? { opt_out: d.nao_receber_campanhas } : {}),
    };
    if (simulacao) {
      ctx.contato = { ...ctx.contato, ...novo, campos: { ...ctx.contato.campos, ...campos } };
    } else {
      ctx.contato = repo.atualizarContato(empresa.id, ctx.contato.id, novo) ?? ctx.contato;
      ctx.saida.contatoAtualizado = true;
    }
    return { ok: true, cadastro: { nome: ctx.contato.nome, email: ctx.contato.email, etapa: ctx.contato.etapa, etiquetas: ctx.contato.tags } };
  },

  enviar_opcoes({ texto, opcoes, rotulo_botao }, { saida }) {
    if (saida.opcoes) return "Você já enviou opções nesta resposta. Aguarde a escolha do cliente.";
    const botoes = opcoes.length <= 3 && opcoes.every((o) => o.titulo.length <= 20 && !o.descricao);
    saida.opcoes = botoes
      ? { tipo: "botoes", texto, botoes: opcoes.map((o, i) => ({ id: `op${i + 1}`, titulo: o.titulo })) }
      : { tipo: "lista", texto, botao: rotulo_botao || "Ver opções", secoes: [{ titulo: "Opções", linhas: opcoes.map((o, i) => ({ id: `op${i + 1}`, titulo: o.titulo, descricao: o.descricao })) }] };
    return { ok: true, enviado_como: botoes ? "botões" : "lista", instrucao: "As opções serão enviadas com o texto. Não escreva mais nada nesta resposta." };
  },

  enviar_imagem_produto({ produto_id, legenda }, { repo, empresa, saida }) {
    const p = repo.produtos(empresa.id, true).find((x) => x.id === produto_id);
    if (!p) return "Produto não encontrado. Use o id de consultar_produtos.";
    if (!p.imagem_url) return "Este produto não tem foto cadastrada.";
    if (saida.midias.length >= 5) return "Limite de 5 fotos por resposta.";
    saida.midias.push({ tipo: "image", link: p.imagem_url, legenda: legenda ?? `${p.nome}${p.preco_centavos !== null ? ` · ${reais(p.preco_centavos)}` : ""}` });
    return { ok: true, instrucao: "A foto será enviada antes da sua resposta." };
  },

  ver_horarios({ servico, a_partir_de }, { repo, empresa, agora }) {
    const s = acharServico(empresa.config, servico);
    const ocupados = repo.agendamentosEntre(empresa.id, agora - 86400_000, agora + 60 * 86400_000);
    const livres = horariosLivres({ config: empresa.config, ocupados, agora, duracao: s.duracao, aPartirDe: a_partir_de, limite: 10 });
    return {
      servico: s.nome,
      duracao_minutos: s.duracao,
      servicos_disponiveis: empresa.config.agenda.servicos.map((x) => x.nome),
      horarios: livres.map((l) => ({ horario: l.horario, quando: l.texto })),
      ...(livres.length ? {} : { aviso: "Sem horários livres no período. Ofereça transferir para a equipe." }),
    };
  },

  agendar({ horario, servico, observacoes }, ctx) {
    const { repo, empresa, agora, simulacao, saida } = ctx;
    const s = acharServico(empresa.config, servico);
    const [data, hora] = horario.split("T");
    const inicio = instanteDe(data, hora);
    const ocupados = repo.agendamentosEntre(empresa.id, inicio - 86400_000, inicio + 86400_000);
    const livre = horariosLivres({ config: empresa.config, ocupados, agora, duracao: s.duracao, aPartirDe: data, limite: 200 }).some((l) => l.inicio === inicio);
    if (!livre) return "Este horário não está mais livre. Use ver_horarios e ofereça outras opções.";
    if (simulacao) return { ok: true, simulado: true, quando: formatarQuando(inicio), servico: s.nome };
    const a = repo.criarAgendamento({ empresa_id: empresa.id, contato_id: ctx.contato.id, inicio, duracao_min: s.duracao, servico: s.nome, observacoes });
    saida.eventos.push({ tipo: "agendamento", agendamento: a });
    return { ok: true, id: a.id, quando: formatarQuando(inicio), servico: s.nome };
  },

  meus_agendamentos(_, { repo, empresa, contato, simulacao }) {
    if (simulacao) return { agendamentos: [] };
    return { agendamentos: repo.agendamentosDoContato(empresa.id, contato.id).map((a) => ({ id: a.id, servico: a.servico, quando: formatarQuando(a.inicio) })) };
  },

  cancelar_agendamento({ id, motivo }, { repo, empresa, contato, simulacao, saida }) {
    if (simulacao) return { ok: true, simulado: true };
    const a = repo.agendamento(empresa.id, id);
    if (!a || a.contato_id !== contato.id || a.status !== "confirmado") return "Agendamento não encontrado para este cliente.";
    repo.atualizarAgendamento(empresa.id, id, "cancelado");
    saida.eventos.push({ tipo: "cancelamento", agendamento: a, motivo });
    return { ok: true, cancelado: `${a.servico} em ${formatarQuando(a.inicio)}` };
  },

  transferir_para_humano({ motivo, resumo, prioridade = "normal" }, { saida, horario }) {
    saida.transferencia = { motivo, resumo, prioridade };
    return {
      ok: true,
      equipe: horario?.configurado && !horario.aberto ? `fora do horário; volta ${horario.abreTexto ?? "no próximo horário de atendimento"}` : "avisada agora",
      instrucao: "Avise o cliente que uma pessoa da equipe vai continuar o atendimento.",
    };
  },

  encerrar_atendimento({ resumo }, { saida }) {
    saida.encerrar = { resumo };
    return { ok: true };
  },
};

function acharServico(config, nome) {
  const lista = config.agenda?.servicos?.length ? config.agenda.servicos : [{ nome: "Atendimento", duracao: 30 }];
  const n = String(nome ?? "").toLowerCase();
  return lista.find((s) => s.nome.toLowerCase() === n) ?? lista.find((s) => n && s.nome.toLowerCase().includes(n)) ?? lista[0];
}
