/* Semente da demonstração: Distribuidora Vale Verde (bebidas e mercearia, Uberlândia/MG).
   Tudo fictício e determinístico (mesmo gerador, mesma semente), com datas relativas a hoje. */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const EMPRESA = { nome: "Distribuidora Vale Verde", cidade: "Uberlândia/MG", cnpj: "" };
export const DONO = { numero: "5534999990001", nome: "Ricardo Moura", papel: "dono" };
export const SOCIA = { numero: "5534999990002", nome: "Fernanda Moura", papel: "socia" };

const FUSO = -3 * 3600_000; // Brasília
export const diaBR = (t) => new Date(t + FUSO).toISOString().slice(0, 10);
export const horaBR = (t) => new Date(t + FUSO).getUTCHours();
export const somarDias = (dia, n) => new Date(Date.parse(dia + "T12:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
export const diaDaSemana = (dia) => new Date(dia + "T12:00:00Z").getUTCDay(); // 0 = domingo

function gerador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cnpj(base8, filial = "0001") {
  const d = (base8 + filial).split("").map(Number);
  const dv = (nums, pesos) => {
    const r = nums.reduce((s, n, i) => s + n * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...d, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...d, d1, d2].join("");
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}
EMPRESA.cnpj = cnpj("41827360");

export const PRODUTOS = [
  { sku: "AGU500", nome: "Água Mineral 500ml (cx 12)", preco: 18.9, custo: 14.9, estoque: 38, minimo: 80, peso: 9 },
  { sku: "AGU15", nome: "Água Mineral 1,5L (fardo 6)", preco: 16.5, custo: 12.4, estoque: 146, minimo: 60, peso: 6 },
  { sku: "COLA2", nome: "Refrigerante Cola 2L (fardo 6)", preco: 47.4, custo: 38.1, estoque: 212, minimo: 90, peso: 8 },
  { sku: "GUA2", nome: "Guaraná 2L (fardo 6)", preco: 39.9, custo: 31.2, estoque: 54, minimo: 90, peso: 7 },
  { sku: "CERV350", nome: "Cerveja Pilsen lata 350ml (cx 12)", preco: 42.0, custo: 34.5, estoque: 320, minimo: 120, peso: 9 },
  { sku: "SUCUVA1", nome: "Suco de Uva Integral 1L (cx 6)", preco: 59.4, custo: 44.0, estoque: 61, minimo: 30, peso: 3 },
  { sku: "ENERG", nome: "Energético 250ml (cx 6)", preco: 41.7, custo: 30.9, estoque: 19, minimo: 40, peso: 3 },
  { sku: "TONICA", nome: "Água Tônica 350ml (cx 12)", preco: 35.8, custo: 27.0, estoque: 74, minimo: 30, peso: 2 },
  { sku: "CAFE500", nome: "Café Torrado 500g (fardo 10)", preco: 189.0, custo: 152.0, estoque: 33, minimo: 20, peso: 4 },
  { sku: "ACUC1", nome: "Açúcar Cristal 1kg (fardo 10)", preco: 46.9, custo: 38.0, estoque: 88, minimo: 40, peso: 4 },
  { sku: "OLEO900", nome: "Óleo de Soja 900ml (cx 20)", preco: 154.0, custo: 128.0, estoque: 27, minimo: 25, peso: 3 },
  { sku: "ARROZ5", nome: "Arroz Tipo 1 5kg (fardo 6)", preco: 162.0, custo: 136.0, estoque: 41, minimo: 20, peso: 3 },
];

const NOMES_CLIENTES = [
  ["Mercado Bom Preço", "Júlio"], ["Supermercado Avenida", "Camila"], ["Padaria Pão Dourado", "Rogério"], ["Bar do Zé", "Júlio"],
  ["Mercearia Dona Cida", "Camila"], ["Restaurante Sabor Mineiro", "Rogério"], ["Padaria Trigo de Ouro", "Júlio"], ["Lanchonete Ponto Certo", "Camila"],
  ["Empório Santa Luzia", "Rogério"], ["Mini Mercado Jardim", "Júlio"], ["Conveniência Posto Cerrado", "Camila"], ["Bar e Petiscaria Esquina", "Rogério"],
  ["Hortifruti Boa Safra", "Júlio"], ["Supermercado Família", "Camila"], ["Cantina da Nona", "Rogério"], ["Açougue e Mercearia Brasil", "Júlio"],
  ["Pizzaria Forno a Lenha", "Camila"], ["Mercado São Jorge", "Rogério"], ["Padaria Nova Aurora", "Júlio"], ["Distrito Bar", "Camila"],
  ["Sacolão Popular", "Rogério"], ["Restaurante Panela de Barro", "Júlio"],
];

export const VENDEDORES = ["Júlio", "Camila", "Rogério"];

/** Monta o banco da empresa fictícia em relação a "agora". */
export function montarEmpresa(agoraMs) {
  const r = gerador(20261110);
  const hoje = diaBR(agoraMs);
  const clientes = NOMES_CLIENTES.map(([nome, vendedor], i) => ({
    id: `C${String(i + 1).padStart(3, "0")}`,
    nome,
    vendedor,
    cnpj: cnpj(String(30_000_000 + i * 734_291).slice(0, 8)),
    telefone: `55349999${String(1100 + i * 7).padStart(4, "0")}`,
    email: `compras@${nome.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "").slice(0, 16)}.exemplo`,
    limite_credito: 5000 + Math.round(r() * 8) * 1000,
    peso: 1 + Math.round(r() * 5),
  }));
  clientes[1].limite_credito = 8000;

  const sorteio = (itens) => {
    const total = itens.reduce((s, x) => s + x.peso, 0);
    let x = r() * total;
    for (const it of itens) if ((x -= it.peso) <= 0) return it;
    return itens.at(-1);
  };

  const pedidos = [];
  let numero = 7000;
  const fracaoHoje = Math.max(0, Math.min(1, (horaBR(agoraMs) - 7) / 11));
  for (let d = 90; d >= 0; d--) {
    const dia = somarDias(hoje, -d);
    const sem = diaDaSemana(dia);
    if (sem === 0) continue; // domingo fechado
    let n = sem === 6 ? 7 + Math.floor(r() * 5) : 15 + Math.floor(r() * 9);
    if (d === 0) n = Math.round(n * fracaoHoje);
    for (let k = 0; k < n; k++) {
      const cli = sorteio(clientes);
      const itens = [];
      const qtdItens = 2 + Math.floor(r() * 4);
      for (let j = 0; j < qtdItens; j++) {
        const p = sorteio(PRODUTOS);
        if (itens.some((x) => x.sku === p.sku)) continue;
        const qtd = 2 + Math.floor(r() * (p.preco > 100 ? 4 : 14));
        itens.push({ sku: p.sku, qtd, preco: p.preco });
      }
      const total = Math.round(itens.reduce((s, x) => s + x.qtd * x.preco, 0) * 100) / 100;
      const hora = String(8 + Math.floor(r() * 10)).padStart(2, "0") + ":" + String(Math.floor(r() * 60)).padStart(2, "0");
      pedidos.push({ numero: ++numero, data: dia, hora, cliente_id: cli.id, vendedor: cli.vendedor, itens, total, origem: "vendedor" });
    }
  }

  // Títulos a receber: os pedidos dos últimos 28 dias estão em aberto (boleto 28 dias); os vencidos são estes.
  const titulos = [];
  let nt = 1040;
  for (const p of pedidos) {
    if (p.data < somarDias(hoje, -27)) continue;
    titulos.push({ id: `T${++nt}`, cliente_id: p.cliente_id, pedido: p.numero, valor: p.total, vencimento: somarDias(p.data, 28), situacao: "aberto" });
  }
  const atrasados = [
    ["C004", 2140.5, 12], ["C005", 860.0, 5], ["C006", 3480.0, 21], ["C007", 1275.9, 8], ["C007", 690.0, 38], ["C008", 540.0, 3], ["C009", 4120.0, 15],
  ];
  for (const [cid, valor, dias] of atrasados) {
    titulos.push({ id: `T${++nt}`, cliente_id: cid, pedido: null, valor, vencimento: somarDias(hoje, -dias), situacao: "aberto" });
  }
  for (const t of titulos) t.link = `https://boleto.exemplo/2via/${t.id}`;

  // Metas do mês (planilha "Metas 2026"): média diária dos últimos 60 dias × dias úteis do mês × fator
  const mes = hoje.slice(0, 7);
  const diasUteisMes = [];
  for (let d = 1; d <= 31; d++) {
    const dia = `${mes}-${String(d).padStart(2, "0")}`;
    if (somarDias(dia, 0) !== dia) break;
    if (diaDaSemana(dia) !== 0) diasUteisMes.push(dia);
  }
  const fatores = { Júlio: 0.95, Camila: 1.04, Rogério: 1.22 };
  const desde = somarDias(hoje, -60);
  const dias60 = new Set(pedidos.filter((p) => p.data >= desde && p.data < hoje).map((p) => p.data)).size || 1;
  const metas = VENDEDORES.map((v) => {
    const soma = pedidos.filter((p) => p.vendedor === v && p.data >= desde && p.data < hoje).reduce((s, p) => s + p.total, 0);
    return { vendedor: v, meta: Math.round(((soma / dias60) * diasUteisMes.length * fatores[v]) / 1000) * 1000 };
  });

  const emails = [
    { id: "E301", de: "comercial@fonteserraazul.exemplo", nome: "Fonte Serra Azul", assunto: "Reajuste de 4% na água mineral a partir de 01/12", recebido: `${hoje}T07:42`, lido: false, importante: true, resumo: "Fornecedor avisa reajuste de 4% na linha de água a partir do dia 1º e oferece manter o preço atual para pedidos fechados até sexta." },
    { id: "E302", de: "financeiro@supermercadofamilia.exemplo", nome: "Supermercado Família", assunto: "Pedido de 2ª via do boleto", recebido: `${hoje}T08:15`, lido: false, importante: false, resumo: "Pede a 2ª via do boleto do último pedido, que não chegou por e-mail." },
    { id: "E303", de: "contato@escritoriocontabilprisma.exemplo", nome: "Contábil Prisma", assunto: "Fechamento de outubro: faltam 3 notas de entrada", recebido: `${somarDias(hoje, -1)}T16:20`, lido: false, importante: true, resumo: "O contador pede 3 notas fiscais de entrada de outubro para fechar a apuração até quinta-feira." },
    { id: "E304", de: "eventos@associacaocomercial.exemplo", nome: "Associação Comercial", assunto: "Convite: café com empresários na quinta", recebido: `${somarDias(hoje, -1)}T10:05`, lido: true, importante: false, resumo: "Convite para café de negócios na quinta às 8h." },
    { id: "E305", de: "compras@emporiosantaluzia.exemplo", nome: "Empório Santa Luzia", assunto: "Re: boleto vencido", recebido: `${somarDias(hoje, -2)}T11:30`, lido: true, importante: false, resumo: "Diz que vai acertar o boleto vencido na semana que vem." },
  ];

  return {
    empresa: EMPRESA,
    produtos: PRODUTOS.map(({ peso, ...p }) => ({ ...p })),
    clientes: clientes.map(({ peso, ...c }) => c),
    pedidos,
    titulos,
    metas: { mes, dias_uteis: diasUteisMes.length, vendedores: metas },
    emails,
    pedidos_compra: [],
    enviados: [],
  };
}

export const PERFIL_DEMO = {
  nome: "Luna",
  empresa: EMPRESA.nome,
  tom: "próxima e direta, chama o dono pelo nome e vai direto aos números",
  instrucoes: ["Sempre me mande os valores em reais, arredondados", "Cobranças só com mensagem educada e o link do boleto"],
  memorias: ["Fornecedor de água: Fonte Serra Azul, (34) 99999-0450", "Vendedores: Júlio, Camila e Rogério"],
};

/** Pedidos que já estão esperando aprovação quando a demonstração abre. */
export const PENDENTES_DEMO = [
  {
    conector: "erp",
    metodo: "POST",
    caminho: "/pedidos-compra",
    corpo: { fornecedor: "Fonte Serra Azul", itens: [{ sku: "AGU500", qtd: 200 }] },
    resumo: "Pedido de compra à Fonte Serra Azul: 200 caixas de Água Mineral 500ml a R$ 14,90 = R$ 2.980,00. O estoque está em 38 cx, abaixo do mínimo (80), e o preço sobe 4% em dezembro.",
  },
  {
    conector: "erp",
    metodo: "PATCH",
    caminho: "/clientes/C002",
    corpo: { limite_credito: 15000 },
    resumo: "Aumentar o limite de crédito do Supermercado Avenida de R$ 8.000 para R$ 15.000 (pediu ontem pelo vendedor Camila; paga em dia há 14 meses).",
  },
  {
    conector: "email",
    metodo: "POST",
    caminho: "/enviar",
    corpo: { para: "clientes-ativos", assunto: "Tabela de preços de novembro", texto: "Segue a nova tabela de preços da Distribuidora Vale Verde." },
    resumo: "Enviar por e-mail a tabela de preços de novembro para os 22 clientes ativos (reajuste médio de 3,2% em refrigerantes).",
  },
];

/** Histórico de tarefas (auditoria) dos últimos 14 dias. */
function historico(agoraMs) {
  const util = (dias) => {
    const d = somarDias(diaBR(agoraMs), -dias);
    return diaDaSemana(d) === 0 ? somarDias(d, -1) : d; // domingo a distribuidora não abre
  };
  const h = (dias, hora, r) => ({ em: new Date(Date.parse(util(dias) + `T${hora}:00-03:00`)).toISOString(), dono: DONO.numero, ...r });
  return [
    h(14, "08:12", { evento: "executado", conector: "erp", metodo: "GET", caminho: "/vendas", resumo: "Consultar vendas da semana passada", status: 200 }),
    h(13, "17:40", { evento: "aprovado_executado", conector: "whatsapp", metodo: "POST", caminho: "/mensagens/lote", resumo: "Cobrança pelo WhatsApp para 4 clientes atrasados (R$ 9.870,00)", status: 200 }),
    h(12, "09:05", { evento: "aprovado_executado", conector: "erp", metodo: "POST", caminho: "/pedidos", resumo: "Pedido 7612 para o Mercado Bom Preço: 40 cx Água Mineral 500ml", status: 201 }),
    h(11, "14:22", { evento: "recusado", conector: "erp", metodo: "PATCH", caminho: "/clientes/C004", resumo: "Dar 12% de desconto fixo para o Bar do Zé" }),
    h(9, "10:31", { evento: "aprovado_executado", conector: "email", metodo: "POST", caminho: "/enviar", resumo: "E-mail com a 2ª via do boleto para a Padaria Pão Dourado", status: 200 }),
    h(8, "11:50", { evento: "aprovado_executado", conector: "erp", metodo: "POST", caminho: "/pedidos-compra", resumo: "Pedido de compra à Refrescos Cerrado: 120 fardos de Guaraná 2L (R$ 3.744,00)", status: 201 }),
    h(7, "08:03", { evento: "executado", conector: "planilha", metodo: "GET", caminho: "/metas", resumo: "Consultar as metas dos vendedores", status: 200 }),
    h(6, "16:15", { evento: "aprovado_executado", conector: "erp", metodo: "POST", caminho: "/pedidos", resumo: "Pedido 7789 para a Cantina da Nona: 15 fardos Refrigerante Cola 2L", status: 201 }),
    h(5, "09:44", { evento: "executado", conector: "email", metodo: "GET", caminho: "/caixa", resumo: "Ver e-mails importantes não lidos", status: 200 }),
    h(4, "18:02", { evento: "aprovado_executado", conector: "whatsapp", metodo: "POST", caminho: "/mensagens/lote", resumo: "Aviso de entrega de amanhã para 9 clientes da rota Norte", status: 200 }),
    h(2, "10:10", { evento: "aprovado_executado", conector: "erp", metodo: "PATCH", caminho: "/produtos/CAFE500", resumo: "Atualizar o preço do Café Torrado 500g para R$ 189,00", status: 200 }),
    h(1, "08:20", { evento: "executado", conector: "erp", metodo: "GET", caminho: "/produtos", resumo: "Consultar estoque de Água Mineral 500ml", status: 200 }),
  ];
}

/** Conversa de ontem que aparece no painel. */
export function conversaInicial(agoraMs) {
  const em = (hora) => new Date(Date.parse(somarDias(diaBR(agoraMs), -1) + `T${hora}:00-03:00`)).getTime();
  return [
    { de: "dono", canal: "whatsapp", texto: "Luna, quantas caixas de água 500ml temos?", em: em("08:19") },
    { de: "agente", canal: "whatsapp", texto: "Bom dia, Ricardo! Temos 38 caixas de Água Mineral 500ml.\n\nEstá abaixo do mínimo (80). Quer que eu prepare um pedido de compra para a Fonte Serra Azul?", em: em("08:20") },
    { de: "dono", canal: "whatsapp", texto: "Prepara 200 caixas, depois eu aprovo", em: em("08:24") },
    { de: "agente", canal: "whatsapp", texto: "Combinado. Deixei o pedido de compra esperando a sua aprovação.", em: em("08:24") },
  ];
}

/** Apaga (se pedido) e semeia a pasta de dados da demonstração. */
export function semear(pasta, agoraMs, { apagar = false } = {}) {
  if (apagar) rmSync(pasta, { recursive: true, force: true });
  mkdirSync(pasta, { recursive: true });
  writeFileSync(path.join(pasta, "empresa.json"), JSON.stringify(montarEmpresa(agoraMs)));
  writeFileSync(path.join(pasta, "perfil.json"), JSON.stringify(PERFIL_DEMO, null, 2));
  writeFileSync(path.join(pasta, "auditoria.jsonl"), historico(agoraMs).map((x) => JSON.stringify(x)).join("\n") + "\n");
}
