/* Simulador da demonstração: responde como os provedores responderiam, sem sair do computador.
   - graph.facebook.com (WhatsApp Cloud API): registra a mensagem e devolve um wamid fictício.
   - erp-demo, planilha-demo, email-demo, whatsapp-demo: os sistemas fictícios da Distribuidora Vale Verde.
   Qualquer outro host é recusado. */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { diaBR, diaDaSemana, somarDias } from "./semente.js";

export const CONECTORES_DEMO = {
  http: [
    {
      nome: "erp",
      descricao: "ERP da Distribuidora Vale Verde: vendas, pedidos, estoque, clientes e contas a receber",
      base: "http://erp-demo/api",
      caminhos_permitidos: ["/vendas", "/produtos", "/pedidos", "/pedidos-compra", "/clientes", "/contas-receber"],
      leitura: "livre",
      escrita: "aprovar",
      guia: "GET /vendas?periodo=ontem|hoje|semana|mes (ou data=AAAA-MM-DD) resume as vendas; GET /produtos?busca=&estoque_baixo=true; GET /clientes?busca=; GET /contas-receber?vencidas=true lista atrasados com telefone e link do boleto; POST /pedidos {cliente_id, itens:[{sku, qtd}]}; POST /pedidos-compra {fornecedor, itens:[{sku, qtd}]}; PATCH /clientes/{id} {limite_credito}",
    },
    {
      nome: "planilha",
      descricao: "Planilha de metas de vendas por vendedor (Google Planilhas)",
      base: "http://planilha-demo/v1",
      caminhos_permitidos: ["/metas"],
      leitura: "livre",
      escrita: "aprovar",
      guia: "GET /metas devolve meta, realizado e projeção do mês por vendedor",
    },
    {
      nome: "email",
      descricao: "E-mail da empresa (caixa de entrada e envio)",
      base: "http://email-demo/v1",
      caminhos_permitidos: ["/caixa", "/enviar"],
      leitura: "livre",
      escrita: "aprovar",
      guia: "GET /caixa?nao_lidos=true; POST /enviar {para, assunto, texto}",
    },
    {
      nome: "whatsapp",
      descricao: "WhatsApp Business da empresa para falar com os clientes",
      base: "http://whatsapp-demo/v1",
      caminhos_permitidos: ["/mensagens"],
      leitura: "livre",
      escrita: "aprovar",
      guia: "POST /mensagens {para, texto} envia uma mensagem; POST /mensagens/lote {mensagens:[{para, nome, texto, titulo}]} envia várias",
    },
  ],
  mcp: [],
};

const r2 = (n) => Math.round(n * 100) / 100;
const resposta = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const semAcento = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const casa = (texto, busca) => {
  const palavras = semAcento(busca).split(/\s+/).filter((p) => p.length > 1 && !["de", "da", "do", "o", "a", "cx", "caixas", "caixa"].includes(p));
  const t = semAcento(texto);
  return palavras.length > 0 && palavras.every((p) => t.includes(p.replace(/s$/, "")));
};

export function criarSimulador({ pasta, agora = () => Date.now() }) {
  const arquivo = path.join(pasta, "empresa.json");
  let banco = JSON.parse(readFileSync(arquivo, "utf8"));
  const mensagens = [];
  const salvar = () => writeFileSync(arquivo, JSON.stringify(banco));
  const registrar = (m) => {
    const reg = { id: `wamid.DEMO${String(mensagens.length + 1).padStart(5, "0")}`, em: new Date(agora()).toISOString(), ...m };
    mensagens.push(reg);
    if (mensagens.length > 500) mensagens.shift();
    return reg;
  };
  const cliente = (id) => banco.clientes.find((c) => c.id === id);
  const produto = (sku) => banco.produtos.find((p) => p.sku === sku);

  function resumoVendas(de, ate, rotulo) {
    const lista = banco.pedidos.filter((p) => p.data >= de && p.data <= ate);
    const total = r2(lista.reduce((s, p) => s + p.total, 0));
    const porProduto = new Map();
    const porCliente = new Map();
    for (const p of lista) {
      porCliente.set(p.cliente_id, (porCliente.get(p.cliente_id) ?? 0) + p.total);
      for (const i of p.itens) {
        const a = porProduto.get(i.sku) ?? { qtd: 0, total: 0 };
        porProduto.set(i.sku, { qtd: a.qtd + i.qtd, total: a.total + i.qtd * i.preco });
      }
    }
    return {
      periodo: rotulo,
      de,
      ate,
      pedidos: lista.length,
      total,
      ticket_medio: lista.length ? r2(total / lista.length) : 0,
      top_produtos: [...porProduto].sort((a, b) => b[1].total - a[1].total).slice(0, 3).map(([sku, v]) => ({ sku, nome: produto(sku)?.nome, qtd: v.qtd, total: r2(v.total) })),
      top_clientes: [...porCliente].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, v]) => ({ id, nome: cliente(id)?.nome, total: r2(v) })),
    };
  }

  function erp(metodo, rota, q, corpo) {
    const hoje = diaBR(agora());
    if (metodo === "GET" && rota === "/vendas") {
      const periodo = q.get("data") ? "data" : q.get("periodo") || "ontem";
      let de, ate, comparar;
      if (periodo === "data") de = ate = q.get("data");
      else if (periodo === "hoje") de = ate = hoje;
      else if (periodo === "semana") (de = somarDias(hoje, -6)), (ate = hoje), (comparar = [somarDias(hoje, -13), somarDias(hoje, -7)]);
      else if (periodo === "mes") (de = hoje.slice(0, 8) + "01"), (ate = hoje);
      else (de = ate = somarDias(hoje, -1)), (comparar = [somarDias(hoje, -8), somarDias(hoje, -8)]);
      const r = resumoVendas(de, ate, periodo);
      if (comparar) {
        const c = resumoVendas(comparar[0], comparar[1], "comparacao");
        r.comparacao = { de: c.de, ate: c.ate, total: c.total, variacao_pct: c.total ? Math.round(((r.total - c.total) / c.total) * 1000) / 10 : null };
      }
      if (!r.pedidos && de === ate) {
        let d = somarDias(de, -1);
        while (!banco.pedidos.some((p) => p.data === d) && d > somarDias(de, -10)) d = somarDias(d, -1);
        r.observacao = diaDaSemana(de) === 0 ? "domingo: a distribuidora não abre" : "sem pedidos neste dia";
        r.ultimo_dia_com_venda = resumoVendas(d, d, "data");
      }
      return resposta(200, r);
    }
    if (metodo === "GET" && rota === "/produtos") {
      let lista = banco.produtos;
      if (q.get("sku")) lista = lista.filter((p) => p.sku === q.get("sku").toUpperCase());
      if (q.get("busca")) lista = lista.filter((p) => casa(p.nome, q.get("busca")) || p.sku === q.get("busca").toUpperCase());
      if (q.get("estoque_baixo") === "true") lista = lista.filter((p) => p.estoque < p.minimo);
      return resposta(200, { produtos: lista.map(({ custo, ...p }) => p) });
    }
    if (metodo === "PATCH" && rota.startsWith("/produtos/")) {
      const p = produto(rota.split("/")[2]);
      if (!p) return resposta(404, { erro: "produto não encontrado" });
      if (Number.isFinite(Number(corpo?.preco))) p.preco = Number(corpo.preco);
      salvar();
      return resposta(200, { ok: true, produto: p });
    }
    if (metodo === "GET" && rota === "/clientes") {
      const b = q.get("busca");
      const lista = b ? banco.clientes.filter((c) => casa(c.nome, b)) : banco.clientes;
      return resposta(200, { clientes: lista.map(({ id, nome, telefone, vendedor, limite_credito }) => ({ id, nome, telefone, vendedor, limite_credito })) });
    }
    if (metodo === "PATCH" && rota.startsWith("/clientes/")) {
      const c = cliente(rota.split("/")[2]);
      if (!c) return resposta(404, { erro: "cliente não encontrado" });
      const antes = c.limite_credito;
      if (Number.isFinite(Number(corpo?.limite_credito))) c.limite_credito = Number(corpo.limite_credito);
      salvar();
      return resposta(200, { ok: true, cliente: c.nome, limite_anterior: antes, limite_credito: c.limite_credito });
    }
    if (metodo === "GET" && rota === "/contas-receber") {
      let lista = banco.titulos.filter((t) => t.situacao === "aberto");
      if (q.get("vencidas") === "true") lista = lista.filter((t) => t.vencimento < hoje);
      if (q.get("cliente_id")) lista = lista.filter((t) => t.cliente_id === q.get("cliente_id"));
      const titulos = lista.map((t) => {
        const c = cliente(t.cliente_id);
        const dias = Math.round((Date.parse(hoje) - Date.parse(t.vencimento)) / 86400_000);
        return { titulo: t.id, cliente_id: c.id, cliente: c.nome, telefone: c.telefone, valor: t.valor, vencimento: t.vencimento, dias_atraso: Math.max(0, dias), link_boleto: t.link, cobranca_enviada_em: t.cobranca_enviada_em ?? null };
      }).sort((a, b) => b.dias_atraso - a.dias_atraso);
      return resposta(200, { titulos, total: r2(titulos.reduce((s, t) => s + t.valor, 0)), clientes: new Set(titulos.map((t) => t.cliente_id)).size });
    }
    if (metodo === "POST" && rota === "/pedidos") {
      const c = cliente(corpo?.cliente_id);
      if (!c) return resposta(422, { erro: "cliente_id inválido" });
      const itens = [];
      for (const i of corpo?.itens ?? []) {
        const p = produto(String(i.sku ?? "").toUpperCase());
        const qtd = Math.trunc(Number(i.qtd));
        if (!p || !(qtd > 0)) return resposta(422, { erro: `item inválido: ${i.sku}` });
        if (qtd > p.estoque) return resposta(409, { erro: `estoque insuficiente de ${p.nome}: ${p.estoque} disponíveis` });
        itens.push({ sku: p.sku, qtd, preco: p.preco });
      }
      if (!itens.length) return resposta(422, { erro: "pedido sem itens" });
      for (const i of itens) produto(i.sku).estoque -= i.qtd;
      const numero = Math.max(...banco.pedidos.map((p) => p.numero)) + 1;
      const total = r2(itens.reduce((s, i) => s + i.qtd * i.preco, 0));
      const agoraBR = new Date(agora() - 3 * 3600_000).toISOString();
      banco.pedidos.push({ numero, data: hoje, hora: agoraBR.slice(11, 16), cliente_id: c.id, vendedor: c.vendedor, itens, total, origem: "agente" });
      banco.titulos.push({ id: `T${1000 + banco.titulos.length + 100}`, cliente_id: c.id, pedido: numero, valor: total, vencimento: somarDias(hoje, 28), situacao: "aberto", link: `https://boleto.exemplo/2via/P${numero}` });
      salvar();
      let entrega = somarDias(hoje, 1);
      if (diaDaSemana(entrega) === 0) entrega = somarDias(entrega, 1);
      return resposta(201, { numero, cliente: c.nome, total, itens: itens.map((i) => ({ ...i, nome: produto(i.sku).nome })), previsao_entrega: entrega });
    }
    if (metodo === "POST" && rota === "/pedidos-compra") {
      const itens = (corpo?.itens ?? []).map((i) => {
        const p = produto(String(i.sku ?? "").toUpperCase());
        return p ? { sku: p.sku, nome: p.nome, qtd: Math.trunc(Number(i.qtd)) || 0, custo: p.custo } : null;
      }).filter((i) => i && i.qtd > 0);
      if (!itens.length) return resposta(422, { erro: "pedido de compra sem itens válidos" });
      const numero = `OC-${String(318 + banco.pedidos_compra.length)}`;
      const total = r2(itens.reduce((s, i) => s + i.qtd * i.custo, 0));
      banco.pedidos_compra.push({ numero, fornecedor: corpo.fornecedor ?? "Fornecedor", itens, total, data: hoje });
      salvar();
      return resposta(201, { numero, fornecedor: corpo.fornecedor ?? "Fornecedor", itens, total, previsao_chegada: somarDias(hoje, 3) });
    }
    return resposta(404, { erro: "rota não encontrada no ERP" });
  }

  function planilha(metodo, rota) {
    if (metodo !== "GET" || rota !== "/metas") return resposta(404, { erro: "aba não encontrada" });
    const hoje = diaBR(agora());
    const mes = banco.metas.mes;
    let passados = 0;
    for (let d = mes + "-01"; d < hoje && d.startsWith(mes); d = somarDias(d, 1)) if (diaDaSemana(d) !== 0) passados++;
    const fracao = Math.max(passados, 1) / banco.metas.dias_uteis;
    const linhas = banco.metas.vendedores.map(({ vendedor, meta }) => {
      const realizado = r2(banco.pedidos.filter((p) => p.vendedor === vendedor && p.data.startsWith(mes)).reduce((s, p) => s + p.total, 0));
      return { vendedor, meta, realizado, percentual: Math.round((realizado / meta) * 1000) / 10, projecao: Math.round(realizado / fracao) };
    });
    const meta = linhas.reduce((s, l) => s + l.meta, 0);
    const realizado = r2(linhas.reduce((s, l) => s + l.realizado, 0));
    return resposta(200, { planilha: "Metas 2026", mes, dias_uteis: banco.metas.dias_uteis, dias_uteis_passados: passados, vendedores: linhas, total: { meta, realizado, percentual: Math.round((realizado / meta) * 1000) / 10, projecao: linhas.reduce((s, l) => s + l.projecao, 0) } });
  }

  function email(metodo, rota, q, corpo) {
    if (metodo === "GET" && rota === "/caixa") {
      const lista = q.get("nao_lidos") === "true" ? banco.emails.filter((e) => !e.lido) : banco.emails;
      return resposta(200, { emails: lista });
    }
    if (metodo === "POST" && rota === "/enviar") {
      const destinos = corpo?.para === "clientes-ativos" ? banco.clientes.map((c) => ({ email: c.email, nome: c.nome })) : [{ email: String(corpo?.para ?? ""), nome: "" }];
      for (const d of destinos) registrar({ canal: "email", para: d.email, nome: d.nome, texto: `${corpo?.assunto ?? "(sem assunto)"}\n\n${corpo?.texto ?? ""}`, origem: "empresa" });
      return resposta(200, { enviados: destinos.length, assunto: corpo?.assunto ?? "" });
    }
    return resposta(404, { erro: "rota não encontrada no e-mail" });
  }

  function whatsappEmpresa(metodo, rota, _q, corpo) {
    if (metodo !== "POST") return resposta(404, { erro: "rota não encontrada" });
    const lista = rota === "/mensagens/lote" ? corpo?.mensagens ?? [] : rota === "/mensagens" ? [corpo] : null;
    if (!lista) return resposta(404, { erro: "rota não encontrada" });
    const ids = [];
    for (const m of lista) {
      if (!m?.para || !m?.texto) continue;
      ids.push(registrar({ canal: "whatsapp", para: String(m.para), nome: m.nome ?? "", texto: String(m.texto), origem: "empresa" }).id);
      for (const id of [m.titulo, ...(Array.isArray(m.titulos) ? m.titulos : [])]) {
        const t = id && banco.titulos.find((x) => x.id === id);
        if (t) t.cobranca_enviada_em = new Date(agora()).toISOString();
      }
    }
    salvar();
    return resposta(200, { enviadas: ids.length, ids });
  }

  function graph(metodo, rota, corpo) {
    if (metodo !== "POST" || !/\/messages$/.test(rota)) return resposta(400, { error: { message: "Unsupported request" } });
    if (corpo?.status === "read") return resposta(200, { success: true });
    const texto = corpo?.type === "interactive" ? corpo.interactive?.body?.text : corpo?.text?.body;
    const botoes = corpo?.type === "interactive" ? corpo.interactive?.action?.buttons?.map((b) => b.reply?.title) : undefined;
    const reg = registrar({ canal: "whatsapp", para: String(corpo?.to ?? ""), texto: String(texto ?? ""), botoes, origem: "agente" });
    return resposta(200, { messaging_product: "whatsapp", contacts: [{ input: corpo?.to, wa_id: corpo?.to }], messages: [{ id: reg.id }] });
  }

  async function fetchSimulado(entrada, opcoes = {}) {
    const url = new URL(String(entrada instanceof Request ? entrada.url : entrada));
    const metodo = String(opcoes.method ?? "GET").toUpperCase();
    let corpo;
    try {
      corpo = opcoes.body ? JSON.parse(String(opcoes.body)) : undefined;
    } catch {
      corpo = undefined;
    }
    const prefixo = { "erp-demo": "/api", "planilha-demo": "/v1", "email-demo": "/v1", "whatsapp-demo": "/v1" }[url.hostname];
    const rota = prefixo ? url.pathname.slice(prefixo.length) || "/" : url.pathname;
    switch (url.hostname) {
      case "graph.facebook.com":
        return graph(metodo, rota, corpo);
      case "erp-demo":
        return erp(metodo, rota, url.searchParams, corpo);
      case "planilha-demo":
        return planilha(metodo, rota);
      case "email-demo":
        return email(metodo, rota, url.searchParams, corpo);
      case "whatsapp-demo":
        return whatsappEmpresa(metodo, rota, url.searchParams, corpo);
      default:
        throw new Error(`Demonstração: chamada para ${url.hostname} bloqueada (fora do simulador)`);
    }
  }

  return {
    fetch: fetchSimulado,
    mensagens: (n = 50) => mensagens.slice(-n).reverse(),
    recarregar() {
      banco = JSON.parse(readFileSync(arquivo, "utf8"));
      mensagens.length = 0;
    },
    banco: () => banco,
  };
}
