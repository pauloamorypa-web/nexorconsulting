/* Soluções da Nexor: dados, modelos (telas) de cada uma e o teste grátis correspondente. */

const SOLUCOES = [
  /* ---------- Negócios ---------- */
  {
    id: "atende",
    grupo: "negocio",
    nome: "Nexor Atende IA",
    resumo: "Atendimento e vendas 24h no WhatsApp com inteligência artificial.",
    selo: "Vende 24h",
    icone: "i-whatsapp",
    accent: "#25d366",
    accent2: "#22d3ee",
    recursos: ["Responde, qualifica e agenda sozinha, a qualquer hora", "Treinada com seus produtos, preços e regras", "Integrada ao seu CRM, ERP e agenda", "Passa para sua equipe quando precisa"],
    modelos: [
      {
        nome: "Painel de conversas",
        texto: "Tela real do sistema: todas as conversas num só lugar, com temperatura do lead, resumo e próxima ação calculados pela IA. Você assume quando quiser.",
        p: { type: "foto", url: "atendimento.suaempresa.com.br", img: "assets/img/atende/conversa.webp", alt: "Tela real do Nexor Atende IA: caixa de entrada com a IA atendendo e agendando" },
      },
      {
        nome: "Painel de resultados",
        texto: "Tela real do sistema: quanto a IA resolveu sozinha, tempo de resposta, horas economizadas, funil de vendas e leads quentes.",
        p: { type: "foto", url: "atendimento.suaempresa.com.br/inicio", img: "assets/img/atende/painel.webp", alt: "Tela real do Nexor Atende IA: painel com indicadores, gráfico e funil" },
      },
      { nome: "WhatsApp", texto: "Seu cliente pergunta, a IA responde e agenda na hora.", p: { type: "chat", d: { nome: "Auto Center Prime", avatar: "A" } } },
      {
        nome: "Chat no site",
        texto: "Quem visita seu site é atendido antes de ir embora.",
        p: { type: "chat", d: { nome: "Clínica Sorriso", avatar: "C", msgs: [["in", "Quanto custa clareamento?"], ["out", "Oi! O clareamento começa com uma avaliação gratuita 😊 Posso agendar para você?"], ["in", "Pode ser sábado de manhã"], ["out", "Tenho sábado às <b>9h</b> ou <b>10h30</b>. Qual prefere?"]] } },
      },
      {
        nome: "Instagram Direct",
        texto: "Comentou ou chamou no Direct? A resposta chega em segundos.",
        p: { type: "chat", accent: "#e1306c", accent2: "#f77737", d: { nome: "Bella Moda", avatar: "B", status: "Instagram · online", msgs: [["in", "Esse vestido tem no M?"], ["out", "Tem sim! 💖 No M temos azul e areia. Quer o link para comprar?"], ["in", "Quero o azul"], ["out", "Aqui está: <b>bellamoda.com/v-azul-m</b>. Frete grátis para sua região!"]] } },
      },
    ],
  },
  {
    id: "commerce",
    grupo: "negocio",
    nome: "Nexor Commerce",
    resumo: "Loja virtual que vende em todos os canais, com estoque unificado.",
    selo: "Todos os canais",
    icone: "i-store",
    accent: "#ff4d8d",
    accent2: "#8b5cf6",
    recursos: ["Checkout com Pix, cartão e boleto", "Vende também no Mercado Livre, Shopee e outros marketplaces", "Estoque único para todos os canais", "Recuperação de carrinho e recomendação com IA"],
    modelos: [
      { nome: "Loja de eletrônicos", texto: "Vitrine rápida, busca inteligente e ofertas em destaque.", p: { type: "store" } },
      {
        nome: "Loja de moda",
        texto: "Catálogo visual com tamanhos, cores e coleções.",
        p: { type: "store", accent: "#f59e0b", accent2: "#f43f5e", url: "bellamoda.com.br", d: { banner: "Coleção Verão · frete grátis", categorias: ["Novidades", "Vestidos", "Calçados", "Bolsas"], itens: [["Vestido Linho", "R$ 289"], ["Sandália Clara", "R$ 179"], ["Bolsa Palha", "R$ 199"], ["Óculos Sol", "R$ 149"]] } },
      },
      {
        nome: "Checkout com Pix",
        texto: "Pagamento em poucos cliques, com aprovação na hora.",
        p: { type: "pix", url: "bellamoda.com.br/checkout", accent: "#14b8a6", accent2: "#22d3ee" },
      },
      {
        nome: "Central de marketplaces",
        texto: "Pedidos de todos os canais e estoque sincronizado num só painel.",
        p: { type: "app", url: "vendas.sualoja.com.br", d: { titulo: "Pedidos por canal", selo: "estoque sincronizado", kpis: [["Hoje", "R$ 18,4 mil"], ["Pedidos", "126"], ["Ticket", "R$ 146"], ["Ruptura", "0"]], colunas: ["Pedido", "Canal", "Valor", "Status"], linhas: [["#8841", "Mercado Livre", "R$ 389", "Pago|ok"], ["#8840", "Loja própria", "R$ 1.249", "Pago|ok"], ["#8839", "Shopee", "R$ 89", "Separando|info"], ["#8838", "Amazon", "R$ 549", "Enviado|ok"]] } },
      },
    ],
  },
  {
    id: "gestao",
    grupo: "negocio",
    nome: "Nexor Gestão",
    resumo: "ERP e CRM sob medida para acabar com as planilhas e o retrabalho.",
    selo: "Fim das planilhas",
    icone: "i-layers",
    accent: "#22d3ee",
    accent2: "#0066ff",
    recursos: ["Financeiro, vendas, estoque e compras", "Emissão de NF-e e conciliação bancária", "Funil de vendas com IA que aponta os leads quentes", "Painéis em tempo real no computador e no celular"],
    modelos: [
      { nome: "Painel de gestão", texto: "Faturamento, contas e pedidos num só lugar.", p: { type: "dashboard" } },
      { nome: "CRM e funil de vendas", texto: "Cada oportunidade no lugar certo, com a IA indicando as mais quentes.", p: { type: "kanban", accent: "#8b5cf6", accent2: "#ec4899" } },
      {
        nome: "Estoque",
        texto: "Saldo, mínimo e reposição de cada produto, sem planilha.",
        p: { type: "app", url: "erp.suaempresa.com.br/estoque", d: { titulo: "Estoque", selo: "3 itens para repor", colunas: ["Produto", "Saldo", "Mínimo", "Situação"], linhas: [["Cabo HDMI 2m", "184", "50", "OK|ok"], ["Mouse sem fio", "22", "40", "Repor|warn"], ["Teclado ABNT2", "9", "30", "Crítico|bad"], ["Monitor 24\"", "61", "20", "OK|ok"], ["Headset USB", "35", "30", "Atenção|info"]] } },
      },
      { nome: "BI e indicadores", texto: "Receita, metas e previsão de vendas com IA.", p: { type: "dashboard", variant: "bi", accent: "#6366f1", accent2: "#22d3ee" } },
    ],
  },
  {
    id: "rh",
    grupo: "negocio",
    nome: "Nexor RH",
    resumo: "RH completo com ponto pelo celular (digital ou QR Code), folha e eSocial.",
    selo: "Ponto no bolso",
    icone: "i-users",
    accent: "#0066ff",
    accent2: "#22c55e",
    recursos: ["Ponto pelo app com digital ou rosto do celular, QR Code e cerca de GPS", "Espelho, horas extras, banco de horas e arquivos AFD/AEJ da Portaria 671", "Folha, férias, 13º e rescisão, com holerite no app do colaborador", "Eventos do eSocial gerados e assinados com o certificado da empresa"],
    modelos: [
      {
        nome: "App do colaborador",
        texto: "Tela real do sistema: o colaborador bate o ponto com a digital, recebe o comprovante na hora e vê o holerite no celular.",
        p: { type: "foto", url: "rh.suaempresa.com.br/app", img: "assets/img/rh/app.webp", alt: "Telas reais do app Nexor RH: botão de ponto com biometria, comprovante e holerite" },
      },
      {
        nome: "Painel do RH",
        texto: "Tela real do sistema: quem está trabalhando agora, atrasos, pedidos para aprovar, férias a vencer e aniversariantes.",
        p: { type: "foto", url: "rh.suaempresa.com.br", img: "assets/img/rh/painel.webp", alt: "Tela real do Nexor RH: painel com quem está trabalhando agora" },
      },
      {
        nome: "Espelho de ponto",
        texto: "Tela real do sistema: horas trabalhadas, extras, adicional noturno, atrasos e faltas calculados pela CLT.",
        p: { type: "foto", url: "rh.suaempresa.com.br/ponto", img: "assets/img/rh/espelho.webp", alt: "Tela real do Nexor RH: espelho de ponto do mês" },
      },
      {
        nome: "Quiosque com QR Code",
        texto: "Tela real do sistema: um tablet na entrada mostra um QR que muda a cada 30 segundos. Foto ou print não funcionam.",
        p: { type: "foto", url: "rh.suaempresa.com.br/quiosque", img: "assets/img/rh/quiosque.webp", alt: "Tela real do quiosque Nexor RH com QR Code rotativo" },
      },
      {
        nome: "Folha de pagamento",
        texto: "Tela real do sistema: folha calculada com INSS, IRRF, FGTS, extras e benefícios, pronta para fechar.",
        p: { type: "foto", url: "rh.suaempresa.com.br/folha", img: "assets/img/rh/folha.webp", alt: "Tela real do Nexor RH: folha de pagamento do mês" },
      },
      {
        nome: "eSocial",
        texto: "Tela real do sistema: admissões, afastamentos, desligamentos e folha viram eventos do eSocial sozinhos.",
        p: { type: "foto", url: "rh.suaempresa.com.br/esocial", img: "assets/img/rh/esocial.webp", alt: "Tela real do Nexor RH: fila de eventos do eSocial" },
      },
    ],
  },
  {
    id: "sitepro",
    grupo: "negocio",
    nome: "Nexor Site Pro",
    resumo: "Sites e landing pages rápidos, feitos para aparecer no Google e vender.",
    selo: "Mais clientes no Google",
    icone: "i-globe",
    accent: "#3b8dff",
    accent2: "#22d3ee",
    recursos: ["Design exclusivo, rápido e responsivo", "SEO para aparecer no Google", "Formulários e botões que levam ao WhatsApp", "Assistente de IA no próprio site"],
    modelos: [
      { nome: "Landing page", texto: "Uma página feita para transformar visita em contato.", p: { type: "landing" } },
      { nome: "Clínica", texto: "Agendamento online e especialidades em destaque.", p: { type: "landing", accent: "#14b8a6", accent2: "#22d3ee", url: "clinicavida.com.br", d: { tag: "Agende online", titulo: "Cuidado completo para sua saúde", cta: "Agendar consulta" } } },
      { nome: "Restaurante", texto: "Cardápio, pedidos pelo WhatsApp e reservas.", p: { type: "landing", accent: "#f97316", accent2: "#facc15", url: "cantinadonapia.com.br", d: { tag: "Delivery e reservas", titulo: "Massa fresca feita todos os dias", cta: "Ver cardápio" } } },
      { nome: "Portal imobiliário", texto: "Busca com mapa, filtros e páginas de imóvel.", p: { type: "listing", accent: "#fb923c", accent2: "#f43f5e" } },
    ],
  },
  {
    id: "automacao",
    grupo: "negocio",
    nome: "Nexor Automação",
    resumo: "Agentes de IA que fazem as tarefas repetitivas da sua equipe.",
    selo: "Menos trabalho manual",
    icone: "i-brain",
    accent: "#a78bfa",
    accent2: "#22d3ee",
    recursos: ["Leitura de notas, boletos e contratos com IA", "Relatórios e follow-ups automáticos", "Trilha de auditoria e LGPD", "Indicadores de economia desde o primeiro mês"],
    modelos: [
      { nome: "Notas fiscais", texto: "A nota chega por e-mail e já entra lançada no sistema.", p: { type: "flow", accent: "#f59e0b", accent2: "#ef4444" } },
      {
        nome: "Cobrança automática",
        texto: "Lembretes de pagamento no tempo certo, sem ninguém precisar lembrar.",
        p: { type: "flow", accent: "#22c55e", accent2: "#22d3ee", url: "cobranca.suaempresa.com.br", d: { titulo: "Régua de cobrança", etapas: [["📅", "Vence em 3 dias", "lembrete gentil"], ["💬", "WhatsApp enviado", "com link do Pix"], ["✅", "Pago", "baixa automática"], ["🔔", "Atrasou 2 dias", "novo lembrete"], ["👤", "Equipe avisada", "só os casos difíceis"]], saida: "{ \"recebido_no_prazo\": \"87%\", \"tempo_da_equipe\": \"-70%\" }" } },
      },
      {
        nome: "Relatório semanal",
        texto: "Toda segunda, um resumo com os números e os alertas da semana.",
        p: { type: "flow", accent: "#6366f1", accent2: "#a78bfa", url: "relatorios.suaempresa.com.br", d: { titulo: "Relatório da diretoria", etapas: [["⏰", "Segunda 07:00", "início automático"], ["📊", "Coleta de dados", "vendas, financeiro, estoque"], ["🧠", "Análise com IA", "destaques e riscos"], ["📄", "PDF e painel", "gerados"], ["📧", "Enviado", "para a diretoria"]], saida: "\"Margem subiu 3,2 pontos. 8 produtos podem faltar na próxima semana.\"" } },
      },
      {
        nome: "Qualificação de leads",
        texto: "Cada contato recebe uma nota e vai para o vendedor certo.",
        p: { type: "flow", accent: "#ec4899", accent2: "#8b5cf6", url: "crm.suaempresa.com.br", d: { titulo: "Novos leads", etapas: [["📥", "Lead do site", "Grupo Atlas"], ["🔎", "Enriquecimento", "logística · 120 pessoas"], ["⭐", "Nota da IA", "88 de 100"], ["🤝", "Vendedora Marina", "prioridade alta"], ["💬", "Follow-up", "agendado"]], saida: "{ \"lead\": \"Grupo Atlas\", \"nota\": 88, \"proximo_passo\": \"ligar hoje\" }" } },
      },
    ],
  },
  {
    id: "sobmedida",
    grupo: "negocio",
    nome: "Nexor Sob Medida",
    resumo: "Aplicativos, plataformas e sistemas feitos do zero para o seu negócio.",
    selo: "Do seu jeito",
    icone: "i-code",
    accent: "#14b8a6",
    accent2: "#2f8bff",
    recursos: ["Apps iOS e Android", "Plataformas SaaS e marketplaces", "Modernização de sistemas antigos", "Código-fonte e documentação são seus"],
    modelos: [
      { nome: "App de agendamento", texto: "Seu cliente marca, remarca e paga pelo celular.", p: { type: "phone" } },
      { nome: "App de delivery", texto: "Pedidos, pagamento e acompanhamento da entrega.", p: { type: "phone", accent: "#f97316", accent2: "#facc15", d: { saudacao: "Boa noite, Lucas 🍕", titulo: "Seu pedido", itens: [["Pizza grande", "Recebido · 19:42"], ["Saiu para entrega", "Previsão 20:15"], ["Refrigerante 2L", "Incluído"]], botao: "Acompanhar no mapa" } } },
      {
        nome: "Plataforma SaaS",
        texto: "Seu produto digital com assinaturas, usuários e painel.",
        p: { type: "app", accent: "#8b5cf6", accent2: "#22d3ee", url: "app.seuproduto.com", d: { titulo: "Assinantes", selo: "MRR R$ 84 mil", kpis: [["Ativos", "1.284"], ["Novos", "+86"], ["Cancel.", "1,9%"], ["NPS", "71"]], colunas: ["Cliente", "Plano", "Desde", "Status"], linhas: [["Grupo Atlas", "Business", "mar/26", "Ativo|ok"], ["Clínica Vida", "Pro", "jun/26", "Ativo|ok"], ["Loja Prisma", "Start", "set/26", "Teste|info"], ["TechNova", "Pro", "jan/26", "Atrasado|warn"]] } },
      },
      {
        nome: "Portal do cliente",
        texto: "Seus clientes acompanham pedidos, boletos e documentos sozinhos.",
        p: { type: "form", accent: "#0ea5e9", accent2: "#22d3ee", url: "portal.suaempresa.com.br", d: { titulo: "Olá, Grupo Atlas", selo: "2 boletos em aberto", campos: [["Pedido em andamento", "#4521 · Em produção|info"], ["Próxima entrega", "12/11"], ["Boleto", "R$ 4.280 · vence 15/11|warn"], ["Notas fiscais", "18 disponíveis"], ["Suporte", "1 chamado aberto", true]], botao: "Baixar 2ª via" } },
      },
    ],
  },

  /* ---------- TI ---------- */
  {
    id: "chamados",
    grupo: "ti",
    nome: "Nexor Service Desk",
    resumo: "Plataforma de chamados com SLA, filas por equipe e painel da gerência.",
    selo: "Plataforma de chamados",
    icone: "i-headset",
    accent: "#3b8dff",
    accent2: "#22d3ee",
    recursos: ["Abertura guiada que já direciona para o setor certo", "Prioridade pelo impacto, com prazo de 4 h a 72 h", "Filas por equipe, notas internas e anexos", "Painel da gerência, modo TV e exportação em planilha", "Perfis e permissões por equipe, LGPD e auditoria"],
    modelos: [
      {
        nome: "Fila de chamados",
        texto: "Cada equipe vê sua fila, assume o chamado e registra a solução.",
        p: { type: "app", url: "chamados.suaempresa.com.br", d: { titulo: "Fila · Infraestrutura", selo: "2 vencendo hoje", colunas: ["Chamado", "Solicitante", "Prioridade", "Prazo"], linhas: [["#1042 Impressora parada", "Financeiro", "Alta|warn", "6h"], ["#1041 Sem acesso ao ERP", "Vendas", "Crítica|bad", "2h"], ["#1039 Trocar teclado", "RH", "Baixa|info", "68h"], ["#1037 VPN lenta", "Diretoria", "Média|info", "20h"]] } },
      },
      {
        nome: "Abrir chamado",
        texto: "O colaborador escolhe o tipo e o impacto. O sistema define setor, prioridade e prazo.",
        p: { type: "form", url: "chamados.suaempresa.com.br/novo", d: { titulo: "Novo chamado", campos: [["Tipo de atendimento", "Manutenção de equipamento"], ["Setor", "Infraestrutura|info"], ["Quem é afetado?", "O setor inteiro"], ["Prioridade e prazo", "Alta · 8 horas|warn"], ["Descrição", "A impressora do financeiro não liga.", true]], nota: "Anexe até 5 arquivos", botao: "Abrir chamado" } },
      },
      {
        nome: "Painel da gerência",
        texto: "Chamados em aberto, prazos vencidos e desempenho de cada técnico.",
        p: { type: "app", url: "chamados.suaempresa.com.br/painel", d: { titulo: "Painel da gerência", selo: "outubro", kpis: [["Em aberto", "23"], ["Sem técnico", "4"], ["Vencidos", "2"], ["No prazo", "94%"]], colunas: ["Técnico", "Resolvidos", "Tempo médio", "No prazo"], linhas: [["Carlos", "48", "3h12", "97%|ok"], ["Juliana", "41", "2h48", "96%|ok"], ["Rafael", "36", "4h05", "88%|warn"]] } },
      },
      {
        nome: "Modo TV",
        texto: "Painel ao vivo na TV da equipe, por link e sem login.",
        p: { type: "tv", url: "chamados.suaempresa.com.br/tv", d: { titulo: "Central de chamados", numeros: [["em aberto", "23"], ["sem técnico", "4", "warn"], ["vencidos", "2", "bad"], ["resolvidos hoje", "31", "ok"]], linhas: ["#1042 Impressora parada → Carlos", "#1041 Sem acesso ao ERP → Juliana", "#1040 Novo notebook → resolvido"] } },
      },
    ],
  },
  {
    id: "cofre",
    grupo: "ti",
    nome: "Nexor Cofre",
    resumo: "Cofre de senhas da empresa, com permissões por equipe e auditoria.",
    selo: "Cofre de senhas",
    icone: "i-shield",
    accent: "#22c55e",
    accent2: "#14b8a6",
    recursos: ["Senhas guardadas com criptografia", "Pastas por equipe e permissões de quem vê e quem edita", "Gerador de senhas fortes", "Histórico de quem acessou cada senha", "Alertas de senhas fracas ou repetidas"],
    modelos: [
      {
        nome: "Senhas da equipe",
        texto: "Cada equipe vê só as pastas que pode acessar.",
        p: { type: "app", url: "cofre.suaempresa.com.br", d: { titulo: "Pasta · Infraestrutura", selo: "criptografado", colunas: ["Sistema", "Usuário", "Senha", "Força"], linhas: [["Firewall", "admin", "••••••••••", "Forte|ok"], ["Servidor de arquivos", "svc_backup", "••••••••", "Forte|ok"], ["Wi-Fi visitantes", "—", "••••••", "Fraca|bad"], ["Painel da nuvem", "ti@empresa", "••••••••••", "Forte|ok"]] } },
      },
      {
        nome: "Gerador de senhas",
        texto: "Senhas fortes em um clique, já salvas na pasta certa.",
        p: { type: "form", url: "cofre.suaempresa.com.br/nova", d: { titulo: "Nova credencial", campos: [["Sistema", "ERP · produção"], ["Pasta", "Sistemas|info"], ["Senha gerada", "q7#Vr!2mZp@9Lx4k"], ["Força", "Muito forte|ok"], ["Quem pode ver", "Equipe de Sistemas", true]], botao: "Salvar no cofre" } },
      },
      {
        nome: "Auditoria de acessos",
        texto: "Quem viu, copiou ou alterou cada senha, com data e hora.",
        p: { type: "app", url: "cofre.suaempresa.com.br/auditoria", d: { titulo: "Histórico de acessos", colunas: ["Quando", "Pessoa", "Ação", "Credencial"], linhas: [["hoje 14:02", "Carlos", "Copiou|info", "Firewall"], ["hoje 11:47", "Juliana", "Alterou|warn", "ERP produção"], ["ontem 18:10", "Rafael", "Visualizou|info", "Painel da nuvem"], ["ontem 09:03", "Ana", "Criou|ok", "Wi-Fi visitantes"]] } },
      },
      {
        nome: "Saúde das senhas",
        texto: "Veja quais senhas são fracas, repetidas ou antigas.",
        p: { type: "tv", url: "cofre.suaempresa.com.br/saude", accent: "#22c55e", d: { titulo: "Saúde do cofre", numeros: [["senhas", "214"], ["fortes", "92%", "ok"], ["fracas", "9", "warn"], ["repetidas", "3", "bad"]], linhas: ["Wi-Fi visitantes: senha fraca", "2 senhas sem troca há 1 ano"] } },
      },
    ],
  },
  {
    id: "ti",
    grupo: "ti",
    nome: "Nexor IT Platform",
    resumo: "Inventário, controle remoto e segurança de todos os computadores da empresa.",
    selo: "Gestão de TI completa",
    icone: "i-monitor",
    accent: "#f59e0b",
    accent2: "#ef4444",
    recursos: ["Inventário automático de hardware, programas e rede", "Status ligado e desligado em tempo real", "Alertas que viram chamado em um clique", "Instalação de programas e comandos em uma ou em todas as máquinas", "Acesso remoto, auditoria por 2 anos e LGPD"],
    modelos: [
      {
        nome: "Inventário de máquinas",
        texto: "Um agente leve coleta tudo sozinho, sem ninguém preencher planilha.",
        p: { type: "app", url: "ti.suaempresa.com.br/inventario", d: { titulo: "Computadores", selo: "86 de 92 ligados", colunas: ["Máquina", "Usuário", "Sistema", "Status"], linhas: [["FIN-PC01", "marina.souza", "Windows 11", "Ligado|ok"], ["VEN-NB07", "pedro.lima", "Windows 11", "Ligado|ok"], ["RH-PC03", "ana.costa", "Windows 10", "Desligado|info"], ["DIR-NB01", "joao.reis", "Windows 11", "Ligado|ok"], ["EST-PC02", "carlos.melo", "Windows 10", "Sem suporte|warn"]] } },
      },
      {
        nome: "Alertas",
        texto: "Problemas detectados automaticamente, que viram chamado em um clique.",
        p: { type: "app", url: "ti.suaempresa.com.br/alertas", d: { titulo: "Alertas", selo: "7 novos", colunas: ["Máquina", "Alerta", "Gravidade", "Ação"], linhas: [["FIN-PC01", "Disco 95% cheio", "Alta|bad", "Abrir chamado"], ["EST-PC02", "Sem antivírus", "Alta|bad", "Abrir chamado"], ["RH-PC03", "Windows não ativado", "Média|warn", "Abrir chamado"], ["VEN-NB07", "Programa proibido", "Média|warn", "Desinstalar"]] } },
      },
      {
        nome: "Instalar programas",
        texto: "Instale um programa ou rode um comando em uma máquina ou em todas, com pacote assinado.",
        p: { type: "form", url: "ti.suaempresa.com.br/instalar", d: { titulo: "Instalar programa", selo: "pacote assinado", campos: [["Programa", "Leitor de PDF · .msi"], ["Destino", "Todas as máquinas (92)"], ["Andamento", "64 de 92 concluídas|info"], ["Falhas", "0|ok"], ["Verificação", "Assinatura e SHA-256 conferidos em cada máquina", true]], botao: "Instalar agora" } },
      },
      {
        nome: "Rede da empresa",
        texto: "Todos os aparelhos encontrados na rede, com aviso de aparelho novo.",
        p: { type: "app", url: "ti.suaempresa.com.br/rede", d: { titulo: "Aparelhos na rede", selo: "1 novo hoje", colunas: ["Aparelho", "IP", "Tipo", "Situação"], linhas: [["Impressora Financeiro", "10.0.0.21", "Impressora", "Conhecido|ok"], ["Câmera Portaria", "10.0.0.45", "Câmera", "Conhecido|ok"], ["Desconhecido", "10.0.0.88", "Celular", "Novo|warn"], ["Switch Andar 2", "10.0.0.2", "Rede", "Conhecido|ok"]] } },
      },
    ],
  },
];

/* Completa cada modelo com as cores e o endereço da solução, para o renderizador das telas */
SOLUCOES.forEach((s) =>
  s.modelos.forEach((m, i) => {
    m.p = { id: `${s.id}-${i}`, accent: s.accent, accent2: s.accent2, url: s.id === "sitepro" ? "suaempresa.com.br" : `${s.id}.suaempresa.com.br`, ...m.p };
  })
);
