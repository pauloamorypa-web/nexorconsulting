/* Nexor Consulting — vitrine de projetos (dados + mockups renderizados em HTML/CSS) */

const PROJECTS = [
  {
    id: "chatbot",
    name: "Atende IA",
    title: "Atendente de IA 24/7",
    cats: ["ia"],
    label: "Inteligência Artificial",
    accent: "#25d366",
    accent2: "#22d3ee",
    type: "chat",
    url: "WhatsApp · Site · Instagram",
    desc: "Agente de IA treinado com o conhecimento da sua empresa que atende, tira dúvidas, agenda, emite segunda via e transfere para humanos quando necessário.",
    features: ["Atendimento e vendas 24/7 no WhatsApp (API oficial), site e Instagram", "Base de conhecimento própria (RAG) com seus produtos e políticas", "Agenda, consulta estoque, gera pedidos e links de Pix", "Transferência inteligente para atendentes com histórico", "Painel de conversas, conversão e tempo de resposta"],
    stack: ["Python", "LLMs (Claude / GPT)", "LangChain", "Vector DB", "WhatsApp Cloud API", "FastAPI"],
  },
  {
    id: "nexshop",
    name: "NexShop",
    title: "E-commerce de alta performance",
    cats: ["ecommerce", "sites"],
    label: "E-commerce",
    accent: "#ff4d8d",
    accent2: "#8b5cf6",
    type: "store",
    url: "loja.suamarca.com.br",
    desc: "Loja virtual completa com vitrine inteligente, checkout em uma página, recomendação de produtos por IA e painel de gestão de pedidos.",
    features: ["Checkout transparente com Pix, cartão e boleto", "Integração com Mercado Livre, Shopee, Amazon e Magalu", "Estoque unificado entre loja e marketplaces", "Antifraude e recuperação de carrinho abandonado", "Recomendação de produtos com IA", "Integração com ERP e emissão de NF-e"],
    stack: ["Next.js", "TypeScript", "Node.js", "PostgreSQL", "Stripe / Mercado Pago", "Vercel"],
  },
  {
    id: "erp",
    name: "NexERP",
    title: "ERP de gestão empresarial",
    cats: ["sistemas"],
    label: "Sistema empresarial",
    accent: "#22d3ee",
    accent2: "#0066ff",
    type: "dashboard",
    variant: "erp",
    url: "erp.suaempresa.com.br",
    desc: "Sistema de gestão integrado: financeiro, vendas, estoque, compras, fiscal e RH em uma única plataforma web, multiempresa e com permissões granulares.",
    features: ["Financeiro, contas a pagar e receber", "Estoque, compras e ordens de serviço", "Emissão de NF-e e integrações bancárias", "Multiempresa e controle de permissões", "Relatórios e auditoria completos"],
    stack: [".NET / C#", "React", "SQL Server", "Redis", "Azure", "Docker"],
  },
  {
    id: "crm",
    name: "NexCRM",
    title: "CRM com funil de vendas e IA",
    cats: ["sistemas", "ia"],
    label: "Sistema + IA",
    accent: "#8b5cf6",
    accent2: "#ec4899",
    type: "kanban",
    url: "crm.suaempresa.com.br",
    desc: "CRM visual com funil kanban, automação de follow-up e lead scoring por IA que indica quais oportunidades têm mais chance de fechar.",
    features: ["Funil kanban arrasta-e-solta", "Lead scoring com IA", "Follow-up automático por e-mail e WhatsApp", "Metas, comissões e previsões de venda", "Integração com site, Meta Ads e Google Ads"],
    stack: ["Vue.js", "TypeScript", "NestJS", "PostgreSQL", "Python (ML)", "AWS"],
  },
  {
    id: "docs",
    name: "DocFlow AI",
    title: "Automação de documentos com IA",
    cats: ["ia", "sistemas"],
    label: "Automação com IA",
    accent: "#f59e0b",
    accent2: "#ef4444",
    type: "flow",
    url: "automacao.suaempresa.com.br",
    desc: "Pipeline que recebe notas fiscais, contratos e boletos por e-mail, extrai os dados com OCR + IA, valida regras e lança automaticamente no ERP.",
    features: ["Leitura de PDFs, imagens e XML", "Extração de dados com OCR + LLM", "Validação de regras e alertas de divergência", "Lançamento automático no ERP", "Trilha de auditoria completa"],
    stack: ["Python", "OCR", "LLMs", "Celery", "PostgreSQL", "Docker"],
  },
  {
    id: "landing",
    name: "Launch",
    title: "Landing page de alta conversão",
    cats: ["sites"],
    label: "Site institucional",
    accent: "#2f8bff",
    accent2: "#22d3ee",
    type: "landing",
    url: "suaempresa.com.br",
    desc: "Site institucional e landing pages otimizadas para SEO e conversão, com animações, formulários integrados ao CRM e testes A/B.",
    features: ["Design exclusivo e responsivo", "Nota alta no Google Lighthouse", "Formulários integrados ao CRM e WhatsApp", "Blog e gestão de conteúdo (CMS)", "Analytics e pixels de conversão"],
    stack: ["Next.js", "React", "Tailwind CSS", "Headless CMS", "Vercel"],
  },
  {
    id: "bi",
    name: "Insight",
    title: "BI & analytics em tempo real",
    cats: ["sistemas", "ia"],
    label: "Business Intelligence",
    accent: "#6366f1",
    accent2: "#22d3ee",
    type: "dashboard",
    variant: "bi",
    url: "bi.suaempresa.com.br",
    desc: "Dashboards executivos que unificam dados de vendas, financeiro e operação, com previsões por IA e perguntas em linguagem natural.",
    features: ["Indicadores em tempo real", "Previsão de vendas com machine learning", "Pergunte aos dados em português", "Alertas automáticos de anomalias", "Acesso por perfil e exportação"],
    stack: ["Python", "dbt", "BigQuery", "React", "D3.js", "LLMs"],
  },
  {
    id: "agenda",
    name: "Agendei",
    title: "App de agendamento",
    cats: ["apps"],
    label: "Aplicativo mobile",
    accent: "#14b8a6",
    accent2: "#2f8bff",
    type: "phone",
    url: "iOS · Android",
    desc: "Aplicativo para clínicas, salões e prestadores de serviço: agenda online, lembretes automáticos, pagamentos e programa de fidelidade.",
    features: ["Agenda online com confirmação automática", "Lembretes por push e WhatsApp", "Pagamento antecipado e pacotes", "Programa de fidelidade", "Painel web para a equipe"],
    stack: ["React Native", "TypeScript", "Firebase", "Node.js", "Stripe"],
  },
  {
    id: "imob",
    name: "Habitar",
    title: "Portal imobiliário",
    cats: ["sites", "sistemas"],
    label: "Portal + sistema",
    accent: "#fb923c",
    accent2: "#f43f5e",
    type: "listing",
    url: "habitar.com.br",
    desc: "Portal de imóveis com busca avançada, mapa interativo, tour virtual e CRM para corretores com distribuição automática de leads.",
    features: ["Busca com filtros avançados e mapa", "Páginas de imóvel com galeria e tour 360°", "Descrições geradas por IA", "CRM para corretores e distribuição de leads", "Integração com portais parceiros"],
    stack: ["Next.js", "Go", "PostgreSQL + PostGIS", "Mapbox", "AWS"],
  },
];

/* ---------- Mockups ---------- */
const Mock = {
  browser(p, inner) {
    return `<div class="mk mk-browser" style="--a:${p.accent};--a2:${p.accent2}">
      <div class="mk-bar"><i></i><i></i><i></i><span>🔒 ${p.url}</span></div>
      <div class="mk-screen">${inner}</div>
    </div>`;
  },

  landing(p) {
    return Mock.browser(p, `
      <div class="mk-nav"><b class="mk-logo"></b><span></span><span></span><span></span><em>Contato</em></div>
      <div class="mk-hero">
        <div>
          <small class="mk-tag">${p.d?.tag ?? "Nova era digital"}</small>
          <strong>${p.d?.titulo ?? "Cresça com uma presença digital imbatível"}</strong>
          <p class="mk-lines"><i></i><i style="width:70%"></i></p>
          <em class="mk-btn">${p.d?.cta ?? "Começar agora"}</em>
        </div>
        <div class="mk-orb"><span></span></div>
      </div>
      <div class="mk-cards3"><div><i></i><b></b><p></p></div><div><i></i><b></b><p></p></div><div><i></i><b></b><p></p></div></div>`);
  },

  store(p) {
    const items = p.d?.itens ?? [
      ["Tênis Runner X", "R$ 389"],
      ["Fone Pulse Pro", "R$ 549"],
      ["Smartwatch Neo", "R$ 899"],
      ["Mochila Urban", "R$ 249"],
    ];
    const pills = p.d?.categorias ?? ["Destaques", "Calçados", "Eletrônicos", "Acessórios"];
    return Mock.browser(p, `
      <div class="mk-nav"><b class="mk-logo"></b><div class="mk-search">Buscar produtos…</div><em class="mk-cart">🛒<sup>3</sup></em></div>
      <div class="mk-pills">${pills.map((c, i) => `<span class="${i ? "" : "on"}">${c}</span>`).join("")}</div>
      <div class="mk-banner"><strong>${p.d?.banner ?? "Black Week · até 40% OFF"}</strong><em class="mk-btn">Aproveitar</em></div>
      <div class="mk-products">${items
        .map(
          ([n, v], i) => `<div class="mk-prod"><div class="mk-img" style="--h:${i * 40}deg"></div><b>${n}</b><span>${v}</span></div>`
        )
        .join("")}</div>`);
  },

  listing(p) {
    const items = [
      ["Apto 3 quartos · Centro", "R$ 680 mil"],
      ["Casa com piscina", "R$ 1,2 mi"],
      ["Studio mobiliado", "R$ 2.900/mês"],
    ];
    return Mock.browser(p, `
      <div class="mk-nav"><b class="mk-logo"></b><span></span><span></span><em>Anunciar</em></div>
      <div class="mk-filterbar"><span>📍 São Paulo, SP</span><span>Comprar</span><span>3+ quartos</span><em class="mk-btn">Buscar</em></div>
      <div class="mk-listing">
        <div class="mk-list">${items
          .map(
            ([n, v], i) => `<div class="mk-home"><div class="mk-img" style="--h:${i * 55}deg"></div><div><b>${n}</b><span>${v}</span></div></div>`
          )
          .join("")}</div>
        <div class="mk-map"><i style="top:30%;left:40%"></i><i style="top:60%;left:65%"></i><i style="top:45%;left:20%"></i><i class="big" style="top:20%;left:70%"></i></div>
      </div>`);
  },

  dashboard(p) {
    const bi = p.variant === "bi";
    const kpis = p.d?.kpis ?? (bi
      ? [["Receita", "R$ 2,4 mi", "+18%"], ["Ticket médio", "R$ 312", "+6%"], ["Conversão", "4,8%", "+0,9"], ["Previsão IA", "R$ 2,9 mi", "↗"]]
      : [["Faturamento", "R$ 486 mil", "+12%"], ["A receber", "R$ 128 mil", "32 títulos"], ["Estoque", "1.284 itens", "8 críticos"], ["Pedidos", "342", "+24 hoje"]]);
    const rows = p.d?.linhas ?? (bi
      ? [["Sudeste", "R$ 1,1 mi", 82], ["Sul", "R$ 640 mil", 64], ["Nordeste", "R$ 420 mil", 48]]
      : [["NF-e 4521 · Cliente Alfa", "Paga", 100], ["Pedido 8842 · Beta Ltda", "Em separação", 60], ["OS 1203 · Gama S/A", "Aberta", 25]]);
    return Mock.browser(p, `
      <div class="mk-app">
        <aside class="mk-side"><b class="mk-logo"></b><i class="on"></i><i></i><i></i><i></i><i></i></aside>
        <div class="mk-main">
          <div class="mk-top"><strong>${p.d?.titulo ?? (bi ? "Visão executiva" : "Painel de gestão")}</strong>${bi ? '<span class="mk-ask">✦ Pergunte aos dados…</span>' : '<span class="mk-ask">Out/2026</span>'}</div>
          <div class="mk-kpis">${kpis.map(([l, v, d]) => `<div><small>${l}</small><b>${v}</b><em>${d}</em></div>`).join("")}</div>
          <div class="mk-charts">
            <div class="mk-chart">
              <svg viewBox="0 0 200 70" preserveAspectRatio="none">
                <defs><linearGradient id="g-${p.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.accent}" stop-opacity=".5"/><stop offset="1" stop-color="${p.accent}" stop-opacity="0"/></linearGradient></defs>
                <path d="M0,55 C20,50 30,40 50,42 S80,25 100,30 S140,12 160,18 S190,6 200,8 L200,70 L0,70Z" fill="url(#g-${p.id})"/>
                <path class="mk-line" d="M0,55 C20,50 30,40 50,42 S80,25 100,30 S140,12 160,18 S190,6 200,8" fill="none" stroke="${p.accent}" stroke-width="2"/>
                ${bi ? '<path d="M160,18 S190,4 200,2" fill="none" stroke="' + p.accent2 + '" stroke-width="2" stroke-dasharray="4 3"/>' : ""}
              </svg>
            </div>
            <div class="mk-bars">${[45, 70, 55, 85, 65, 95].map((h) => `<i style="--h:${h}%"></i>`).join("")}</div>
          </div>
          <div class="mk-table">${rows
            .map(([a, b, c]) => `<div><span>${a}</span><em>${b}</em><i style="--w:${c}%"></i></div>`)
            .join("")}</div>
        </div>
      </div>`);
  },

  kanban(p) {
    const cols = p.d?.colunas ?? [
      ["Novos leads", [["Clínica Vida", "R$ 8 mil", 72], ["Loja Prisma", "R$ 3 mil", 41]]],
      ["Qualificados", [["Grupo Atlas", "R$ 45 mil", 88], ["TechNova", "R$ 12 mil", 65]]],
      ["Proposta", [["Rede Sol", "R$ 120 mil", 93]]],
      ["Fechado", [["Inova Log", "R$ 32 mil", 100]]],
    ];
    return Mock.browser(p, `
      <div class="mk-top pad"><strong>${p.d?.titulo ?? "Funil de vendas"}</strong><span class="mk-ask">${p.d?.selo ?? "✦ IA: 3 leads quentes hoje"}</span></div>
      <div class="mk-kanban">${cols
        .map(
          ([t, cards]) => `<div class="mk-col"><small>${t}</small>${cards
            .map(
              ([n, v, s]) => `<div class="mk-deal"><b>${n}</b><span>${v}</span><em class="${s > 80 ? "hot" : ""}">IA ${s}</em></div>`
            )
            .join("")}</div>`
        )
        .join("")}</div>`);
  },

  chat(p) {
    return `<div class="mk mk-chatwrap" style="--a:${p.accent};--a2:${p.accent2}">
      <div class="mk-chat">
        <div class="mk-chat-head"><span class="mk-avatar">${p.d?.avatar ?? "✦"}</span><div><b>${p.d?.nome ?? "Atendente virtual"}</b><small>● ${p.d?.status ?? "online agora"}</small></div></div>
        <div class="mk-msgs">
          ${(p.d?.msgs ?? [
            ["in", "Oi! Vocês têm horário amanhã para revisão do carro?"],
            ["out", "Olá! 😊 Tenho horários amanhã às <b>09:30</b>, <b>14:00</b> e <b>16:30</b>. Qual prefere?"],
            ["in", "14h, por favor. Placa ABC1D23."],
            ["out", "Pronto! ✅ Agendado para amanhã às 14:00 — revisão do veículo ABC1D23. Enviei a confirmação por e-mail."],
          ]).map(([d, t]) => `<p class="${d}">${t}</p>`).join("")}
          <p class="typing"><i></i><i></i><i></i></p>
        </div>
        <div class="mk-input"><span>Digite uma mensagem…</span><em>➤</em></div>
      </div>
    </div>`;
  },

  flow(p) {
    const nodes = p.d?.etapas ?? [
      ["📥", "E-mail recebido", "nota_4521.pdf"],
      ["🔍", "OCR + IA", "extraindo campos"],
      ["✔️", "Validação", "CNPJ · valores · impostos"],
      ["🗄️", "Lançamento ERP", "contas a pagar"],
      ["🔔", "Notificação", "financeiro avisado"],
    ];
    return Mock.browser(p, `
      <div class="mk-top pad"><strong>${p.d?.titulo ?? "Pipeline: notas fiscais"}</strong><span class="mk-ask live">● executando</span></div>
      <div class="mk-flow">${nodes
        .map(
          ([i, t, s], k) => `<div class="mk-node" style="--d:${k * 0.6}s"><span>${i}</span><div><b>${t}</b><small>${s}</small></div></div>${
            k < nodes.length - 1 ? '<div class="mk-link"><i></i></div>' : ""
          }`
        )
        .join("")}</div>
      <div class="mk-extract"><code>${p.d?.saida ?? '{ "fornecedor": "Alfa Ltda", "valor": 4280.50, "vencimento": "15/11", "confianca": 0.98 }'}</code></div>`);
  },

  phone(p) {
    const days = ["S", "T", "Q", "Q", "S", "S", "D"];
    return `<div class="mk mk-phonewrap" style="--a:${p.accent};--a2:${p.accent2}">
      <div class="mk-phone">
        <div class="mk-notch"></div>
        <div class="mk-app-head"><small>${p.d?.saudacao ?? "Olá, Ana 👋"}</small><b>${p.d?.titulo ?? "Seus agendamentos"}</b></div>
        <div class="mk-days">${days.map((d, i) => `<span class="${i === 2 ? "on" : ""}"><small>${d}</small>${12 + i}</span>`).join("")}</div>
        <div class="mk-appts">
          ${(p.d?.itens ?? [["Limpeza de pele", "09:00 · Dra. Carla"], ["Massagem relaxante", "14:30 · Studio 2"], ["Manicure", "17:00 · Bia"]])
            .map(([t, s], i) => `<div class="${i === 1 ? "on" : ""}"><i></i><b>${t}</b><small>${s}</small></div>`).join("")}
        </div>
        <em class="mk-btn wide">${p.d?.botao ?? "+ Novo agendamento"}</em>
        <div class="mk-tabbar"><i class="on"></i><i></i><i></i><i></i></div>
      </div>
    </div>`;
  },
};

/* ---------- Telas genéricas (sistemas de gestão, TI, checkout) ---------- */
const mkChip = (t) => {
  const [txt, tom] = String(t).split("|");
  return tom ? `<em class="mk-chip ${tom}">${txt}</em>` : txt;
};

Object.assign(Mock, {
  /* Sistema com menu lateral, indicadores opcionais e tabela. Células "texto|tom" viram etiqueta (ok, warn, bad, info). */
  app(p) {
    const d = p.d;
    return Mock.browser(p, `
      <div class="mk-app">
        <aside class="mk-side"><b class="mk-logo"></b><i class="on"></i><i></i><i></i><i></i><i></i></aside>
        <div class="mk-main">
          <div class="mk-top"><strong>${d.titulo}</strong>${d.selo ? `<span class="mk-ask">${d.selo}</span>` : ""}</div>
          ${d.kpis ? `<div class="mk-kpis">${d.kpis.map(([l, v, e]) => `<div><small>${l}</small><b>${v}</b>${e ? `<em>${e}</em>` : ""}</div>`).join("")}</div>` : ""}
          <div class="mk-grid" style="--cols:${d.colunas.length}">
            ${d.colunas.map((c) => `<span class="h">${c}</span>`).join("")}
            ${d.linhas.map((l) => l.map((c) => `<span>${mkChip(c)}</span>`).join("")).join("")}
          </div>
        </div>
      </div>`);
  },

  /* Formulário de sistema (abrir chamado, gerador de senha etc.) */
  form(p) {
    const d = p.d;
    return Mock.browser(p, `
      <div class="mk-top pad"><strong>${d.titulo}</strong>${d.selo ? `<span class="mk-ask">${d.selo}</span>` : ""}</div>
      <div class="mk-form">
        ${d.campos.map(([l, v, cheio]) => `<label class="${cheio ? "full" : ""}"><small>${l}</small><span>${mkChip(v)}</span></label>`).join("")}
      </div>
      <div class="mk-form-foot">${d.nota ? `<small>${d.nota}</small>` : "<span></span>"}<em class="mk-btn">${d.botao}</em></div>`);
  },

  /* Painel de TV com números grandes */
  tv(p) {
    const d = p.d;
    return Mock.browser(p, `
      <div class="mk-top pad"><strong>${d.titulo}</strong><span class="mk-ask live">● ao vivo</span></div>
      <div class="mk-tv">${d.numeros.map(([l, v, tom]) => `<div class="${tom ?? ""}"><b>${v}</b><small>${l}</small></div>`).join("")}</div>
      <div class="mk-ticker">${d.linhas.map((l) => `<span>${l}</span>`).join("")}</div>`);
  },

  /* Checkout com Pix */
  pix(p) {
    const d = p.d ?? {};
    const qr = Array.from({ length: 81 }, (_, i) => `<i class="${(i * 7 + (i % 5) * 3) % 3 ? "" : "on"}"></i>`).join("");
    return Mock.browser(p, `
      <div class="mk-checkout">
        <div class="mk-resumo"><small>Resumo do pedido</small>
          ${(d.itens ?? [["Vestido Linho", "R$ 289"], ["Sandália Clara", "R$ 179"]]).map(([n, v]) => `<div><span>${n}</span><b>${v}</b></div>`).join("")}
          <div class="tot"><span>Total</span><b>${d.total ?? "R$ 468,00"}</b></div>
        </div>
        <div class="mk-pixbox"><small>Pague com Pix</small><div class="mk-qr">${qr}</div><em class="mk-btn">Copiar código Pix</em><small class="ok">● aprovação na hora</small></div>
      </div>`);
  },

  /* Caixa de entrada com várias conversas (WhatsApp, Instagram, site) */
  inbox(p) {
    const d = p.d;
    return Mock.browser(p, `
      <div class="mk-inbox">
        <div class="mk-convs">${d.conversas.map(([n, c, t, on], i) => `<div class="${i === 0 ? "on" : ""}"><b>${n}</b><small>${c} · ${t}</small>${on ? `<em class="mk-chip ${on}">${on === "ok" ? "IA" : "humano"}</em>` : ""}</div>`).join("")}</div>
        <div class="mk-thread">
          <div class="mk-top"><strong>${d.conversas[0][0]}</strong><span class="mk-ask">IA atendendo</span></div>
          ${d.msgs.map(([dir, t]) => `<p class="${dir}">${t}</p>`).join("")}
        </div>
      </div>`);
  },
});

const renderMock = (p) => Mock[p.type](p);
