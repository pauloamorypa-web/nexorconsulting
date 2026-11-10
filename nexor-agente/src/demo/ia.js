/* IA roteirizada da demonstração: imita o Claude (mesmo formato de requisição e resposta da API),
   usando as ferramentas de verdade (chamar_sistema, ajustar_perfil, guardar) e montando as respostas
   a partir dos dados que os sistemas simulados devolvem. Nada sai do computador. */

const semAcento = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const brl = (n) => Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const diaCurto = (d) => `${SEMANA[new Date(d + "T12:00:00Z").getUTCDay()]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dataCurta = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const curto = (nome) => String(nome ?? "").replace(/\s*\(.*\)$/, "");

const fala = (texto) => ({ stop_reason: "end_turn", content: [{ type: "text", text: texto }] });
let seq = 0;
const usa = (etapa, chamadas, texto) => ({
  stop_reason: "tool_use",
  content: [...(texto ? [{ type: "text", text: texto }] : []), ...chamadas.map(([name, input]) => ({ type: "tool_use", id: `toolu_demo_${etapa}_${++seq}`, name, input }))],
});
const sistema = (conector, metodo, caminho, resumo, extra = {}) => ["chamar_sistema", { conector, metodo, caminho, resumo, ...extra }];

const MENU = "Posso te ajudar com:\n• vendas (\"quanto vendemos ontem?\")\n• cobranças (\"manda a cobrança para os clientes atrasados\")\n• estoque, metas dos vendedores e e-mails\n• pedidos (\"cria um pedido de 40 caixas de água para o Mercado Bom Preço\")";

function lerResultado(bloco) {
  const etapa = String(bloco.tool_use_id).split("_")[2];
  let dados = bloco.content;
  try {
    const o = JSON.parse(bloco.content);
    dados = o;
    if (typeof o.resposta === "string") {
      try {
        dados = JSON.parse(o.resposta);
      } catch {
        dados = o.resposta;
      }
    }
  } catch {
    /* texto simples */
  }
  return { etapa, dados, erro: Boolean(bloco.is_error), texto: typeof bloco.content === "string" ? bloco.content : "" };
}

const idAprovacao = (t) => String(t).match(/Pedido (A[0-9A-F]{6})/)?.[1];

/** Último texto escrito pelo dono (ignora resultados de ferramenta e eventos do sistema). */
function textoDoDono(req) {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i];
    if (m.role !== "user" || !Array.isArray(m.content) || m.content[0]?.type === "tool_result") continue;
    const t = m.content.filter((b) => b.type === "text").at(-1)?.text ?? "";
    if (!t.startsWith("<evento_do_sistema>")) return t;
  }
  return "";
}

/** Última resposta em texto do agente nesta conversa (para entender um "sim"). */
function ultimaFala(req) {
  for (let i = req.messages.length - 2; i >= 0; i--) {
    const m = req.messages[i];
    if (m.role === "assistant") {
      const t = (m.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      if (t && !(m.content ?? []).some((b) => b.type === "tool_use")) return t;
    }
  }
  return "";
}

const nomeDoAgente = (req) => JSON.stringify(req.system ?? "").match(/Seu nome: ([^\\\n]+)/)?.[1] ?? "Luna";
const empresaDoDono = (req) => {
  const e = JSON.stringify(req.system ?? "").match(/Empresa do dono: ([^\\\n]+)/)?.[1];
  return e && !e.startsWith("(") ? e : "nossa empresa";
};

// ---------- respostas a partir dos dados ----------

function textoVendas(d) {
  if (!d || typeof d !== "object") return "Não consegui ler as vendas agora. Pode tentar de novo?";
  if (!d.pedidos && d.ultimo_dia_com_venda) {
    const u = d.ultimo_dia_com_venda;
    return `${d.periodo === "ontem" ? "Ontem" : diaCurto(d.de)} não teve venda (${d.observacao}).\n\nNo último dia com movimento (${diaCurto(u.de)}) vendemos ${brl(u.total)} em ${u.pedidos} pedidos.`;
  }
  const rotulo = { ontem: `Ontem (${diaCurto(d.de)})`, hoje: "Hoje, até agora,", semana: "Nos últimos 7 dias", mes: `Em ${MESES[Number(d.de.slice(5, 7)) - 1]}, até agora,`, data: `Em ${diaCurto(d.de)}` }[d.periodo] ?? "No período";
  const linhas = [`${rotulo} vendemos ${brl(d.total)} em ${d.pedidos} pedidos. Ticket médio de ${brl(d.ticket_medio)}.`];
  const c = d.comparacao;
  if (c && c.variacao_pct != null) {
    const ref = d.periodo === "ontem" ? `na ${SEMANA[new Date(c.de + "T12:00:00Z").getUTCDay()]} anterior (${brl(c.total)})` : `nos 7 dias anteriores (${brl(c.total)})`;
    linhas[0] += ` ${c.variacao_pct >= 0 ? "📈" : "📉"} ${Math.abs(c.variacao_pct).toLocaleString("pt-BR")}% ${c.variacao_pct >= 0 ? "a mais" : "a menos"} que ${ref}.`;
  }
  if (d.top_produtos?.length) linhas.push("Mais vendidos:\n" + d.top_produtos.map((p) => `• ${curto(p.nome)}: ${p.qtd} un · ${brl(p.total)}`).join("\n"));
  if (d.top_clientes?.length) linhas.push(`Maior cliente: ${d.top_clientes[0].nome} (${brl(d.top_clientes[0].total)}).`);
  return linhas.join("\n\n");
}

function porCliente(titulos) {
  const m = new Map();
  for (const t of titulos) {
    const c = m.get(t.cliente_id) ?? { cliente_id: t.cliente_id, cliente: t.cliente, telefone: t.telefone, titulos: [] };
    c.titulos.push(t);
    m.set(t.cliente_id, c);
  }
  return [...m.values()].map((c) => ({ ...c, total: c.titulos.reduce((s, t) => s + t.valor, 0), dias: Math.max(...c.titulos.map((t) => t.dias_atraso)) }));
}

const listaAtrasados = (grupos) => grupos.map((g) => `• ${g.cliente}: ${brl(g.total)} (${g.dias} dia${g.dias === 1 ? "" : "s"}${g.titulos.length > 1 ? `, ${g.titulos.length} boletos` : ""})`).join("\n");

function mensagemCobranca(g, agente, empresa) {
  const boletos = g.titulos.map((t) => `• ${brl(t.valor)}, venceu em ${dataCurta(t.vencimento)}: ${t.link_boleto}`).join("\n");
  return `Olá, pessoal do ${g.cliente}! Aqui é a ${agente}, da ${empresa}. 😊\n\nConsta em aberto:\n${boletos}\n\nSe já pagou, pode desconsiderar. Qualquer dúvida, é só responder esta mensagem. Obrigada!`;
}

function textoMetas(d) {
  if (!d?.vendedores) return "Não consegui abrir a planilha de metas agora.";
  const mes = MESES[Number(d.mes.slice(5, 7)) - 1];
  const linhas = d.vendedores.map((v) => {
    const ok = v.projecao >= v.meta;
    return `• ${v.vendedor}: ${brl(v.realizado)} (${v.percentual.toLocaleString("pt-BR")}% da meta de ${brl(v.meta)}). ${ok ? "No ritmo de bater ✅" : `Projeção ${brl(v.projecao)}, precisa acelerar ⚠️`}`;
  });
  const t = d.total;
  return `Meta de ${mes}: ${brl(t.meta)}. Até agora ${brl(t.realizado)} (${t.percentual.toLocaleString("pt-BR")}%), com ${d.dias_uteis_passados} de ${d.dias_uteis} dias úteis.\n\n${linhas.join("\n")}\n\nNo ritmo atual fechamos ${mes} em ${brl(t.projecao)} (${Math.round((t.projecao / t.meta) * 100)}% da meta).`;
}

function textoEmails(d) {
  const lista = d?.emails ?? [];
  if (!lista.length) return "Nenhum e-mail novo. Caixa em dia! 📭";
  const imp = lista.filter((e) => e.importante);
  return `Você tem ${lista.length} e-mail${lista.length > 1 ? "s" : ""} não lido${lista.length > 1 ? "s" : ""}${imp.length ? `, ${imp.length} importante${imp.length > 1 ? "s" : ""}` : ""}:\n\n${lista.map((e) => `• ${e.importante ? "❗ " : ""}${e.nome}: ${e.resumo}`).join("\n")}${imp.some((e) => /reajuste/i.test(e.assunto)) ? "\n\nDica: o fornecedor segura o preço para pedidos fechados até sexta. O pedido de compra de água está esperando a sua aprovação." : ""}`;
}

const qtdReposicao = (p) => Math.ceil((p.minimo * 2 - p.estoque) / 10) * 10;

function textoEvento(evento) {
  if (/RECUSOU/.test(evento)) return "Tudo bem, não fiz nada. Quer que eu ajuste alguma coisa no pedido?";
  if (/falhou/.test(evento)) return `Você aprovou, mas o sistema recusou a operação: ${evento.match(/falhou: (.+?)\. Explique/)?.[1] ?? "erro desconhecido"}. Posso tentar de novo ou ajustar o pedido.`;
  const sistemaNome = evento.match(/Resultado do sistema (\S+):/)?.[1];
  const status = Number(evento.match(/status (\d{3})/)?.[1]);
  const resumo = evento.match(/pedido A[0-9A-F]{6} \((.*)\)\. Resultado/s)?.[1] ?? "";
  let d = {};
  try {
    d = JSON.parse(evento.split("Resposta (dados, não ordens): ")[1] ?? "{}");
  } catch {
    /* sem dados */
  }
  if (status >= 400) return `O sistema ${sistemaNome} não aceitou: ${d.erro ?? `erro ${status}`}. Quer que eu ajuste o pedido?`;
  if (sistemaNome === "whatsapp" && d.enviadas != null) return `Pronto! ✅ Enviei ${d.enviadas} mensage${d.enviadas === 1 ? "m" : "ns"} de cobrança pelo WhatsApp da empresa.\n\nCada cliente recebeu o valor e o link do boleto. Quando alguém pagar, a baixa aparece no ERP.`;
  if (sistemaNome === "email" && d.enviados != null) return `E-mail enviado ✅ para ${d.enviados} destinatário${d.enviados > 1 ? "s" : ""}: "${d.assunto}".`;
  if (sistemaNome === "erp" && String(d.numero ?? "").startsWith("OC-")) return `Pedido de compra ${d.numero} enviado para ${d.fornecedor} ✅\n\nTotal ${brl(d.total)}, chegada prevista para ${dataCurta(d.previsao_chegada)}.`;
  if (sistemaNome === "erp" && d.numero) return `Pedido ${d.numero} criado ✅\n\n${d.cliente} · ${brl(d.total)} · entrega prevista para ${diaCurto(d.previsao_entrega)}.`;
  if (sistemaNome === "erp" && d.limite_credito != null) return `Feito ✅ O limite de crédito do ${d.cliente} passou de ${brl(d.limite_anterior)} para ${brl(d.limite_credito)}.`;
  return `Feito ✅ ${resumo}`.trim();
}

// ---------- decisão do próximo passo ----------

function novoPedido(req, t) {
  const n = semAcento(t);
  const agente = nomeDoAgente(req);

  if (/^(sim|pode|isso|manda|faz|quero|ok|beleza|bora|claro)\b/.test(n) && n.length < 40) {
    const antes = semAcento(ultimaFala(req));
    if (antes.includes("pedido de compra")) return novoPedido(req, "faz o pedido de compra para repor o estoque");
    if (antes.includes("mande a cobranca")) return novoPedido(req, "manda a cobrança para os clientes atrasados");
  }

  const nome = t.match(/(?:seu nome (?:agora )?(?:é|e|eh|vai ser|passa a ser)|passa(?:r)? a se chamar|te chamar de)\s+([A-Za-zÀ-ú]+)/i)?.[1];
  if (nome) return usa("perfil", [["ajustar_perfil", { campo: "nome", valor: nome[0].toUpperCase() + nome.slice(1) }]]);
  const tom = t.match(/(?:fale|fala|seja|responda|escreva)\s+(?:comigo\s+)?(?:de um jeito\s+)?((?:mais|menos)\s+.+)/i)?.[1];
  if (tom) return usa("perfil", [["ajustar_perfil", { campo: "tom", valor: tom.replace(/[.!]+$/, "") }]]);
  const lembrar = t.match(/(?:lembr[ae](?:-se)?|anota|guarda)(?:\s+(?:que|de|isso|a[ií]))?[:,]?\s+(.{4,})/i)?.[1];
  if (lembrar) return usa("guardar", [["guardar", { tipo: "memorias", texto: lembrar.replace(/[.!]+$/, "") }]]);
  const regra = t.match(/^(?:a partir de agora,?\s*)?((?:sempre|nunca)\s+.{4,})/i)?.[1];
  if (regra) return usa("guardar", [["guardar", { tipo: "instrucoes", texto: regra.replace(/[.!]+$/, "") }]]);

  if (/cobr|atrasad|inadimpl|devendo|vencid/.test(n)) {
    const enviar = /mand|envi|disper|disparar|cobra |cobrar|cobre|faz a cobranca|faca a cobranca|manda/.test(n);
    return usa(enviar ? "cobconsulta" : "cobver", [sistema("erp", "GET", "/contas-receber", "Consultar títulos vencidos", { consulta: { vencidas: "true" } })]);
  }
  if (/pedido de compra|repor|reposicao|comprar do fornecedor/.test(n)) return usa("repor", [sistema("erp", "GET", "/produtos", "Consultar produtos abaixo do estoque mínimo", { consulta: { estoque_baixo: "true" } })]);
  const ped = n.match(/pedido\s+(?:de\s+)?(\d+)\s*(?:caixas?|cx|fardos?|unidades?|un)?\s*(?:de\s+)?(.+?)\s+(?:para|pro|pra)\s+(?:o\s+|a\s+)?(.+?)[.!?]*$/);
  if (ped) {
    return usa(`pedido-${ped[1]}`, [
      sistema("erp", "GET", "/produtos", `Procurar o produto "${ped[2]}"`, { consulta: { busca: ped[2] } }),
      sistema("erp", "GET", "/clientes", `Procurar o cliente "${ped[3]}"`, { consulta: { busca: ped[3] } }),
    ]);
  }
  if (/estoque|acabando|faltando|em falta/.test(n)) {
    const busca = n.match(/(?:estoque|quantas?|quantos?)\s+(?:de\s+)?(?:caixas?\s+de\s+)?([a-z0-9 ]{3,}?)(?:\s+temos|\s+tem|\?|$)/)?.[1];
    if (busca && !/baixo|minimo|acabando|falta/.test(busca)) return usa("estoque", [sistema("erp", "GET", "/produtos", `Consultar estoque de ${busca}`, { consulta: { busca } })]);
    return usa("estbaixo", [sistema("erp", "GET", "/produtos", "Consultar produtos abaixo do estoque mínimo", { consulta: { estoque_baixo: "true" } })]);
  }
  if (/vend|faturam|faturou|faturamos/.test(n)) {
    const periodo = /hoje/.test(n) ? "hoje" : /semana/.test(n) ? "semana" : /\bmes\b/.test(n) ? "mes" : "ontem";
    return usa("vendas", [sistema("erp", "GET", "/vendas", `Consultar vendas (${periodo})`, { consulta: { periodo } })]);
  }
  if (/meta|vendedor|comiss/.test(n)) return usa("metas", [sistema("planilha", "GET", "/metas", "Consultar as metas dos vendedores")]);
  if (/e-?mail|caixa de entrada|inbox/.test(n)) return usa("emails", [sistema("email", "GET", "/caixa", "Ver e-mails não lidos", { consulta: { nao_lidos: "true" } })]);
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa|hey)\b/.test(n)) return fala(`Oi! Aqui é a ${agente}, da ${empresaDoDono(req)}. 😊\n\n${MENU}`);
  if (/obrigad|valeu|show|perfeito|otimo/.test(n)) return fala("Por nada! Qualquer coisa, é só chamar. 🙌");
  if (/o que (voce )?(sabe|pode|consegue)|ajuda|como funciona|quem e voce/.test(n)) return fala(`Sou a ${agente}, sua assistente. Eu consulto os sistemas da empresa e, para qualquer alteração, peço a sua aprovação antes. 🔐\n\n${MENU}`);
  return fala(`Ainda não consigo fazer isso com os sistemas conectados aqui. 🙂\n\n${MENU}\n\nSe precisar de outro sistema, a Nexor conecta para você.`);
}

function continuar(req, resultados) {
  const r = resultados[0];
  const agente = nomeDoAgente(req);
  const empresa = empresaDoDono(req);
  if (r.erro) return fala(`Não consegui concluir: ${r.texto.replace(/^Não foi possível: /, "")}`);
  const etapa = r.etapa;

  if (etapa === "perfil") return fala(/nome/.test(r.texto) ? `Pronto, agora pode me chamar de ${r.texto.split(": ")[1]}! 😊` : `Combinado! A partir de agora vou falar ${r.texto.split(": ")[1]}.`);
  if (etapa === "guardar") return fala(/instrucoes/.test(r.texto) ? "Anotado como regra permanente. ✍️ Vou seguir sempre." : "Guardado! ✍️ Quando precisar, é só me perguntar.");
  if (etapa === "vendas") return fala(textoVendas(r.dados));
  if (etapa === "metas") return fala(textoMetas(r.dados));
  if (etapa === "emails") return fala(textoEmails(r.dados));

  if (etapa === "cobver" || etapa === "cobconsulta") {
    const titulos = r.dados?.titulos ?? [];
    if (!titulos.length) return fala("Boa notícia: nenhum cliente com boleto vencido hoje. 🎉");
    const grupos = porCliente(titulos);
    const cab = `Encontrei ${grupos.length} clientes com ${titulos.length} boletos vencidos, ${brl(r.dados.total)} no total:\n\n${listaAtrasados(grupos)}`;
    if (etapa === "cobver") return fala(`${cab}\n\nQuer que eu mande a cobrança pelo WhatsApp?`);
    const mensagens = grupos.map((g) => ({ para: g.telefone, nome: g.cliente, texto: mensagemCobranca(g, agente, empresa), titulos: g.titulos.map((t) => t.titulo) }));
    return usa("cobenvio", [sistema("whatsapp", "POST", "/mensagens/lote", `Enviar cobrança pelo WhatsApp para ${grupos.length} clientes atrasados (${titulos.length} boletos, ${brl(r.dados.total)}). Cada um recebe o valor, o vencimento e o link do boleto.`, { corpo: { mensagens } })], cab);
  }
  if (etapa === "cobenvio") {
    const prev = req.messages.at(-2)?.content?.find((b) => b.type === "text")?.text ?? "";
    return fala(`${prev}\n\nPreparei uma mensagem educada para cada um, com o valor e o link do boleto. É só aprovar o pedido ${idAprovacao(r.texto)} que eu disparo pelo WhatsApp. 🔐`);
  }

  if (etapa === "estoque") {
    const ps = r.dados?.produtos ?? [];
    if (!ps.length) return fala("Não achei esse produto no ERP. Pode me dizer o nome de outro jeito?");
    return fala(ps.map((p) => `• ${p.nome}: ${p.estoque} em estoque${p.estoque < p.minimo ? ` ⚠️ abaixo do mínimo (${p.minimo})` : ""}`).join("\n") + (ps.some((p) => p.estoque < p.minimo) ? "\n\nQuer que eu prepare um pedido de compra para repor?" : ""));
  }
  if (etapa === "estbaixo") {
    const ps = r.dados?.produtos ?? [];
    if (!ps.length) return fala("Todos os produtos estão acima do estoque mínimo. 👍");
    return fala(`${ps.length} produtos estão abaixo do mínimo:\n\n${ps.map((p) => `• ${curto(p.nome)}: ${p.estoque} (mínimo ${p.minimo})`).join("\n")}\n\nQuer que eu prepare um pedido de compra para repor?`);
  }
  if (etapa === "repor") {
    const ps = r.dados?.produtos ?? [];
    if (!ps.length) return fala("Nada para repor: tudo acima do estoque mínimo. 👍");
    const itens = ps.map((p) => ({ sku: p.sku, qtd: qtdReposicao(p) }));
    const lista = ps.map((p) => `• ${qtdReposicao(p)} × ${p.nome}`).join("\n");
    return usa("reporenvio", [sistema("erp", "POST", "/pedidos-compra", `Pedido de compra ao Atacado Cerrado Bebidas para repor ${ps.length} produtos abaixo do mínimo:\n${lista}`, { corpo: { fornecedor: "Atacado Cerrado Bebidas", itens } })], `Para voltar ao dobro do mínimo, a compra fica assim:\n\n${lista}`);
  }
  if (etapa === "reporenvio") {
    const prev = req.messages.at(-2)?.content?.find((b) => b.type === "text")?.text ?? "";
    return fala(`${prev}\n\nMandei o pedido de compra ${idAprovacao(r.texto)} para você aprovar. 🔐`);
  }

  if (etapa.startsWith("pedido-")) {
    const qtd = Number(etapa.split("-")[1]);
    const prod = resultados.find((x) => Array.isArray(x.dados?.produtos))?.dados.produtos[0];
    const cli = resultados.find((x) => Array.isArray(x.dados?.clientes))?.dados.clientes[0];
    if (!prod) return fala("Não achei esse produto no ERP. Qual é o nome dele (ou o código)?");
    if (!cli) return fala("Não achei esse cliente no ERP. Pode me passar o nome como está no cadastro?");
    if (qtd > prod.estoque) return fala(`Só temos ${prod.estoque} de ${prod.nome} em estoque, menos que as ${qtd} pedidas.\n\nSe quiser, me peça com uma quantidade menor, por exemplo: "cria um pedido de ${prod.estoque} ${curto(prod.nome)} para o ${cli.nome}".`);
    const total = qtd * prod.preco;
    return usa("pedidoenvio", [sistema("erp", "POST", "/pedidos", `Criar pedido para ${cli.nome}: ${qtd} × ${prod.nome} a ${brl(prod.preco)} = ${brl(total)}.`, { corpo: { cliente_id: cli.id, itens: [{ sku: prod.sku, qtd }] } })], `Montei o pedido: ${qtd} × ${prod.nome} para o ${cli.nome}, total ${brl(total)} (temos ${prod.estoque} em estoque).`);
  }
  if (etapa === "pedidoenvio") {
    const prev = req.messages.at(-2)?.content?.find((b) => b.type === "text")?.text ?? "";
    return fala(`${prev}\n\nMandei o pedido ${idAprovacao(r.texto)} para você aprovar. 🔐`);
  }
  return fala("Pronto.");
}

export function criarIaRoteirizada({ atrasoMs = 0 } = {}) {
  const espera = () => (atrasoMs > 0 ? new Promise((ok) => setTimeout(ok, atrasoMs)) : null);
  const create = async (req) => {
    await espera();
    const ultima = req.messages.at(-1);
    const blocos = Array.isArray(ultima?.content) ? ultima.content : [];
    if (blocos[0]?.type === "tool_result") return continuar(req, blocos.map(lerResultado));
    const t = blocos.filter((b) => b.type === "text").at(-1)?.text ?? "";
    if (t.startsWith("<evento_do_sistema>")) return fala(textoEvento(t.replace(/<\/?evento_do_sistema>/g, "")));
    return novoPedido(req, t);
  };
  return { beta: { messages: { create } } };
}
