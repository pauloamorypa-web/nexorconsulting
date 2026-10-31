/* Nexor Consulting — vitrine de projetos (dados + mockups renderizados em HTML/CSS) */

const PROJECTS = [
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
    features: ["Checkout transparente com Pix, cartão e boleto", "Recomendação de produtos com IA", "Cálculo de frete e rastreio automático", "Painel de pedidos, estoque e cupons", "Integração com marketplaces e ERP"],
    stack: ["Next.js", "TypeScript", "Node.js", "PostgreSQL", "Stripe / Mercado Pago", "Vercel"],
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
    id: "chatbot",
    name: "Nexor Assist",
    title: "Atendente de IA 24/7",
    cats: ["ia"],
    label: "Inteligência Artificial",
    accent: "#25d366",
    accent2: "#22d3ee",
    type: "chat",
    url: "WhatsApp · Site · Instagram",
    desc: "Agente de IA treinado com o conhecimento da sua empresa que atende, tira dúvidas, agenda, emite segunda via e transfere para humanos quando necessário.",
    features: ["Atendimento 24/7 no WhatsApp, site e Instagram", "Base de conhecimento própria (RAG)", "Agendamentos e consultas ao seu sistema", "Transferência inteligente para atendentes", "Painel de conversas e métricas"],
    stack: ["Python", "LLMs (Claude / GPT)", "LangChain", "Vector DB", "WhatsApp Cloud API", "FastAPI"],
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
          <small class="mk-tag">Nova era digital</small>
          <strong>Cresça com uma presença digital imbatível</strong>
          <p class="mk-lines"><i></i><i style="width:70%"></i></p>
          <em class="mk-btn">Começar agora</em>
        </div>
        <div class="mk-orb"><span></span></div>
      </div>
      <div class="mk-cards3"><div><i></i><b></b><p></p></div><div><i></i><b></b><p></p></div><div><i></i><b></b><p></p></div></div>`);
  },

  store(p) {
    const items = [
      ["Tênis Runner X", "R$ 389"],
      ["Fone Pulse Pro", "R$ 549"],
      ["Smartwatch Neo", "R$ 899"],
      ["Mochila Urban", "R$ 249"],
    ];
    return Mock.browser(p, `
      <div class="mk-nav"><b class="mk-logo"></b><div class="mk-search">Buscar produtos…</div><em class="mk-cart">🛒<sup>3</sup></em></div>
      <div class="mk-pills"><span class="on">Destaques</span><span>Calçados</span><span>Eletrônicos</span><span>Acessórios</span></div>
      <div class="mk-banner"><strong>Black Week · até 40% OFF</strong><em class="mk-btn">Aproveitar</em></div>
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
    const kpis = bi
      ? [["Receita", "R$ 2,4 mi", "+18%"], ["Ticket médio", "R$ 312", "+6%"], ["Conversão", "4,8%", "+0,9"], ["Previsão IA", "R$ 2,9 mi", "↗"]]
      : [["Faturamento", "R$ 486 mil", "+12%"], ["A receber", "R$ 128 mil", "32 títulos"], ["Estoque", "1.284 itens", "8 críticos"], ["Pedidos", "342", "+24 hoje"]];
    const rows = bi
      ? [["Sudeste", "R$ 1,1 mi", 82], ["Sul", "R$ 640 mil", 64], ["Nordeste", "R$ 420 mil", 48]]
      : [["NF-e 4521 · Cliente Alfa", "Paga", 100], ["Pedido 8842 · Beta Ltda", "Em separação", 60], ["OS 1203 · Gama S/A", "Aberta", 25]];
    return Mock.browser(p, `
      <div class="mk-app">
        <aside class="mk-side"><b class="mk-logo"></b><i class="on"></i><i></i><i></i><i></i><i></i></aside>
        <div class="mk-main">
          <div class="mk-top"><strong>${bi ? "Visão executiva" : "Painel de gestão"}</strong>${bi ? '<span class="mk-ask">✦ Pergunte aos dados…</span>' : '<span class="mk-ask">Out/2026</span>'}</div>
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
    const cols = [
      ["Novos leads", [["Clínica Vida", "R$ 8 mil", 72], ["Loja Prisma", "R$ 3 mil", 41]]],
      ["Qualificados", [["Grupo Atlas", "R$ 45 mil", 88], ["TechNova", "R$ 12 mil", 65]]],
      ["Proposta", [["Rede Sol", "R$ 120 mil", 93]]],
      ["Fechado", [["Inova Log", "R$ 32 mil", 100]]],
    ];
    return Mock.browser(p, `
      <div class="mk-top pad"><strong>Funil de vendas</strong><span class="mk-ask">✦ IA: 3 leads quentes hoje</span></div>
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
        <div class="mk-chat-head"><span class="mk-avatar">✦</span><div><b>Nexor Assist</b><small>● online agora</small></div></div>
        <div class="mk-msgs">
          <p class="in">Oi! Vocês têm horário amanhã para revisão do carro?</p>
          <p class="out">Olá! 😊 Tenho horários amanhã às <b>09:30</b>, <b>14:00</b> e <b>16:30</b>. Qual prefere?</p>
          <p class="in">14h, por favor. Placa ABC1D23.</p>
          <p class="out">Pronto! ✅ Agendado para amanhã às 14:00 — revisão do veículo ABC1D23. Enviei a confirmação por e-mail.</p>
          <p class="typing"><i></i><i></i><i></i></p>
        </div>
        <div class="mk-input"><span>Digite uma mensagem…</span><em>➤</em></div>
      </div>
    </div>`;
  },

  flow(p) {
    const nodes = [
      ["📥", "E-mail recebido", "nota_4521.pdf"],
      ["🔍", "OCR + IA", "extraindo campos"],
      ["✔️", "Validação", "CNPJ · valores · impostos"],
      ["🗄️", "Lançamento ERP", "contas a pagar"],
      ["🔔", "Notificação", "financeiro avisado"],
    ];
    return Mock.browser(p, `
      <div class="mk-top pad"><strong>Pipeline: notas fiscais</strong><span class="mk-ask live">● executando</span></div>
      <div class="mk-flow">${nodes
        .map(
          ([i, t, s], k) => `<div class="mk-node" style="--d:${k * 0.6}s"><span>${i}</span><div><b>${t}</b><small>${s}</small></div></div>${
            k < nodes.length - 1 ? '<div class="mk-link"><i></i></div>' : ""
          }`
        )
        .join("")}</div>
      <div class="mk-extract"><code>{ "fornecedor": "Alfa Ltda", "valor": 4280.50, "vencimento": "15/11", "confianca": 0.98 }</code></div>`);
  },

  phone(p) {
    const days = ["S", "T", "Q", "Q", "S", "S", "D"];
    return `<div class="mk mk-phonewrap" style="--a:${p.accent};--a2:${p.accent2}">
      <div class="mk-phone">
        <div class="mk-notch"></div>
        <div class="mk-app-head"><small>Olá, Ana 👋</small><b>Seus agendamentos</b></div>
        <div class="mk-days">${days.map((d, i) => `<span class="${i === 2 ? "on" : ""}"><small>${d}</small>${12 + i}</span>`).join("")}</div>
        <div class="mk-appts">
          <div><i></i><b>Limpeza de pele</b><small>09:00 · Dra. Carla</small></div>
          <div class="on"><i></i><b>Massagem relaxante</b><small>14:30 · Studio 2</small></div>
          <div><i></i><b>Manicure</b><small>17:00 · Bia</small></div>
        </div>
        <em class="mk-btn wide">+ Novo agendamento</em>
        <div class="mk-tabbar"><i class="on"></i><i></i><i></i><i></i></div>
      </div>
    </div>`;
  },
};

const renderMock = (p) => Mock[p.type](p);
