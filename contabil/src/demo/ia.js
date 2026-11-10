/* IA roteirizada do Modo Demonstração. Tem a mesma "cara" do cliente da Anthropic (beta.messages.create) e
   responde no mesmo formato JSON, então o sistema roda o caminho de verdade: leitura → conferência →
   pré-lançamentos → pendência cumprida; WhatsApp → contexto do cliente → resposta ou chamado para a equipe.
   - Leitura: os documentos da demonstração trazem os dados num comentário do PDF; para qualquer outro arquivo,
     a leitura é montada pelo nome do arquivo e pelo cadastro do cliente (coerente com a carteira semeada).
   - Assistente: entende os pedidos do roteiro (o que falta, guias, segunda via, honorário, prazos) a partir dos
     dados reais do cliente e passa para a equipe o que é opinião tributária, folha ou qualquer outra coisa. */

import { metaDoPdf } from "./simulador.js";

const sem = (t) =>
  String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const BASE_LEITURA = { tipo: "outro", emitente_nome: null, emitente_cnpj: null, destinatario_nome: null, destinatario_cnpj: null, numero: null, data_emissao: null, data_vencimento: null, valor_total: null, competencia: null, descricao: null, banco: null, movimentos: [], confianca: "alta", observacoes: null };

/** Leitura plausível para um arquivo qualquer, pelo nome e pelo cliente que enviou */
export function leituraPorNome(nome, cliente, hoje) {
  const n = sem(nome);
  const comp = /(?<!\d)(20\d{2})[-_.]?(0[1-9]|1[0-2])(?![-_.]?\d)/.exec(n);
  const mesAnt = (() => {
    const [a, m] = hoje.split("-").map(Number);
    const t = a * 12 + (m - 1) - 1;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  })();
  const competencia = comp ? `${comp[1]}-${comp[2]}` : mesAnt;
  const dia = (d) => `${competencia}-${String(d).padStart(2, "0")}`;
  const proprio = cliente ? { nome: cliente.razao_social, cnpj: cliente.cnpj } : { nome: null, cnpj: null };
  const FORNECEDOR = { nome: "Distribuidora Horizonte Ltda", cnpj: "28417465000168" };
  if (/extrato|ofx|banco|conta/.test(n))
    return {
      ...BASE_LEITURA,
      tipo: "extrato_bancario",
      destinatario_nome: proprio.nome,
      destinatario_cnpj: proprio.cnpj,
      competencia,
      banco: "Banco Exemplo · ag 0001 · cc 12345-6",
      descricao: `Extrato de ${competencia.slice(5)}/${competencia.slice(0, 4)}`,
      movimentos: [
        { data: dia(3), descricao: "PIX RECEBIDO CLIENTES", valor: 4820.5 },
        { data: dia(5), descricao: "PAGTO BOLETO DISTRIBUIDORA HORIZONTE", valor: -1890.4 },
        { data: dia(10), descricao: "TARIFA PACOTE SERVICOS", valor: -54.9 },
        { data: dia(18), descricao: "PIX RECEBIDO CLIENTES", valor: 3260 },
        { data: dia(20), descricao: "DAS SIMPLES NACIONAL", valor: -612.33 },
      ],
    };
  if (/boleto|fatura/.test(n)) return { ...BASE_LEITURA, tipo: "boleto", emitente_nome: FORNECEDOR.nome, emitente_cnpj: FORNECEDOR.cnpj, destinatario_nome: proprio.nome, destinatario_cnpj: proprio.cnpj, numero: "34191.79001", data_emissao: dia(2), data_vencimento: dia(12), valor_total: 1890.4, competencia, descricao: "Boleto de compra de mercadorias" };
  if (/recibo|comprovante|pagamento|pix/.test(n)) return { ...BASE_LEITURA, tipo: "comprovante_pagamento", emitente_nome: FORNECEDOR.nome, emitente_cnpj: FORNECEDOR.cnpj, destinatario_nome: proprio.nome, destinatario_cnpj: proprio.cnpj, data_emissao: dia(12), valor_total: 1890.4, competencia, banco: "Banco Exemplo", descricao: "Comprovante de pagamento de fornecedor" };
  if (/guia|das|darf/.test(n)) return { ...BASE_LEITURA, tipo: "guia_imposto", emitente_nome: "Receita Federal do Brasil", destinatario_nome: proprio.nome, destinatario_cnpj: proprio.cnpj, data_emissao: dia(15), data_vencimento: dia(20), valor_total: 612.33, competencia, descricao: "DAS do Simples Nacional" };
  if (/holerite|folha/.test(n)) return { ...BASE_LEITURA, tipo: "folha_pagamento", emitente_nome: proprio.nome, emitente_cnpj: proprio.cnpj, competencia, descricao: "Resumo da folha de pagamento", valor_total: 8450 };
  if (/venda|saida|emitida|faturamento/.test(n)) return { ...BASE_LEITURA, tipo: "nota_fiscal_saida", emitente_nome: proprio.nome, emitente_cnpj: proprio.cnpj, destinatario_nome: "Consumidor final", numero: "1532", data_emissao: dia(14), valor_total: 2350, competencia, descricao: "Venda de mercadorias" };
  if (/nota|nf|danfe|xml|compra|servico/.test(n)) return { ...BASE_LEITURA, tipo: "nota_fiscal_entrada", emitente_nome: FORNECEDOR.nome, emitente_cnpj: FORNECEDOR.cnpj, destinatario_nome: proprio.nome, destinatario_cnpj: proprio.cnpj, numero: "48213", data_emissao: dia(8), valor_total: 1890.4, competencia, descricao: "Compra de mercadorias para revenda" };
  if (/foto|img|whatsapp|imagem|scan/.test(n)) return { ...BASE_LEITURA, tipo: "recibo", emitente_nome: "Papelaria Central ME", emitente_cnpj: "41275983000150", destinatario_nome: proprio.nome, destinatario_cnpj: proprio.cnpj, data_emissao: dia(9), valor_total: 186.9, competencia, descricao: "Material de escritório", confianca: "media", observacoes: "Foto com parte do rodapé cortada; valor e data legíveis." };
  return { ...BASE_LEITURA, tipo: "outro", destinatario_nome: proprio.nome, destinatario_cnpj: proprio.cnpj, competencia, descricao: "Documento recebido do cliente", confianca: "media", observacoes: "Tipo de documento não identificado com certeza." };
}

/** Lê as linhas do contexto que o sistema monta para o assistente (contextoCliente) */
function lerContexto(txt) {
  const linha = (rot) => (txt.split("\n").find((l) => l.startsWith(rot)) ?? "").slice(rot.length).trim();
  return { cliente: linha("Cliente:"), faltando: linha("Documentos faltando:"), guias: linha("Guias e relatórios disponíveis:"), chamados: linha("Chamados:") || linha("Chamados abertos:") };
}

/** Resposta roteirizada do assistente do WhatsApp */
export function responderRoteiro(texto, contexto, { assinatura = "", honorario = null } = {}) {
  const t = sem(texto);
  const c = lerContexto(contexto);
  const primeiro = c.cliente || "tudo bem";
  const nada = (v) => !v || /^nenhum/.test(v);
  const assinar = (r) => (assinatura ? `${r}\n— ${assinatura}` : r);
  const r = (resposta, extra = {}) => ({ resposta: assinar(resposta), encaminhar_equipe: false, assunto: null, departamento: "geral", ...extra });
  const equipe = (resposta, assunto, departamento) => ({ resposta: assinar(resposta), encaminhar_equipe: true, assunto, departamento });

  if (/(posso|devo|vale a pena|compensa|pagar menos|reduzir imposto|mudar de regime|simples ou|lucro presumido|pro ?labore|distribui(r|cao) (de )?lucro|quanto (vou|vai) pagar|calcula)/.test(t))
    return equipe(`Ótima pergunta! Isso pede uma análise do contador com os números da ${primeiro}. Já passei para a equipe fiscal, que te responde ainda hoje. 👍`, `Dúvida tributária: ${String(texto).slice(0, 100)}`, "fiscal");
  if (/(funcionari|admiss|demiss|ferias|rescis|contrat(ar|ei) (um|uma)|decimo terceiro|holerite|folha)/.test(t))
    return equipe("Certo! Assuntos de folha ficam com o nosso Departamento Pessoal. Já encaminhei sua mensagem e a equipe te chama por aqui.", `Departamento pessoal: ${String(texto).slice(0, 100)}`, "dp");
  if (/(honorario|mensalidade|fatura do escritorio|boleto do escritorio|pagar o escritorio|meu pix)/.test(t)) {
    if (!honorario) return r("Seus honorários estão em dia com o escritório. Obrigado! 😊");
    return r(honorario);
  }
  if (/(segunda via|2a via|2 via|\bguias?\b|\bdas\b|\bdarf\b|boleto|imposto|vencimento|\bvence)/.test(t)) {
    if (nada(c.guias)) return r(`No momento não há guia nova para a ${primeiro}. Assim que o escritório gerar, aviso por aqui e ela fica no portal.`);
    return r(`Claro! Estão disponíveis no portal: ${c.guias}. É só abrir o portal e baixar; se preferir, peço para a equipe mandar o PDF aqui.`);
  }
  if (/(falta|faltando|pendente|pendencia|documento|enviar|mandar|extrato|nota)/.test(t)) {
    if (nada(c.faltando)) return r(`Boa notícia: a ${primeiro} não tem nenhum documento pendente. Tudo certo por aqui! ✅`);
    return r(`Para fecharmos o mês da ${primeiro}, ainda faltam: ${c.faltando}. Pode mandar a foto ou o PDF aqui mesmo que a gente já recebe.`);
  }
  if (/(chamado|andamento|protocolo|retorno|resposta)/.test(t)) return r(nada(c.chamados) ? "Não encontrei chamado em aberto. Se quiser, me conte o que precisa que eu abro um para a equipe." : `Seus chamados: ${c.chamados}. A equipe já está acompanhando.`);
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa)\b/.test(t) && t.length < 25) return r(`Olá! Aqui é o atendimento do escritório para a ${primeiro}. Posso te dizer o que falta enviar, mandar suas guias ou passar um recado para a equipe. Como posso ajudar?`);
  if (/(obrigad|valeu|agradeco|show|perfeito|otimo)/.test(t)) return r("Por nada! Qualquer coisa é só chamar por aqui. 😊");
  return equipe("Recebi sua mensagem! Vou passar para a equipe do escritório, que responde em breve.", String(texto).slice(0, 120), "geral");
}

/**
 * Cliente de IA simulado. buscarCliente(nomeArquivo) → cliente do documento que está sendo lido;
 * honorario(nomeCliente) → frase sobre o honorário do cliente (ou null).
 */
export function criarIaSimulada({ buscarCliente = () => null, honorario = () => null, hoje = () => new Date().toISOString().slice(0, 10) } = {}) {
  const uso = { input_tokens: 1200, output_tokens: 180 };
  const responder = (obj) => ({ id: `msg_demo_${Date.now()}`, type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], usage: uso });
  const ia = {
    simulada: true,
    /** ms de "IA pensando" (deixa a demonstração natural); 0 durante a semeadura */
    atraso: undefined,
    beta: {
      messages: {
        async create(p) {
          const espera = ia.atraso ?? 350;
          if (espera) await new Promise((ok) => setTimeout(ok, espera));
          if (p.output_config?.format?.schema?.required?.includes("resposta")) {
            const sistema = (p.system ?? []).map((b) => b.text).join("\n");
            const contexto = sistema.split("Dados atuais do cliente:\n")[1] ?? "";
            const assinatura = /Assine como: ([^\n]+?)\.(\n|$)/.exec(sistema)?.[1] ?? "";
            const ultima = p.messages.at(-1)?.content ?? "";
            const texto = String(typeof ultima === "string" ? ultima : "").split("\n").at(-1);
            return responder(responderRoteiro(texto, contexto, { assinatura, honorario: honorario(lerContexto(contexto).cliente) }));
          }
          const blocos = p.messages?.[0]?.content ?? [];
          const dados = Buffer.from(blocos.find((b) => b.source)?.source?.data ?? "", "base64");
          const nome = /Arquivo: (.+?)\. Extraia/.exec(blocos.find((b) => b.type === "text")?.text ?? "")?.[1] ?? "arquivo";
          const meta = metaDoPdf(dados);
          if (meta) return responder({ ...BASE_LEITURA, ...meta });
          return responder(leituraPorNome(nome, buscarCliente(nome), hoje()));
        },
      },
    },
  };
  return ia;
}
