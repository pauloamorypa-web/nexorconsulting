"""Gera as páginas de serviço em /solucoes/<slug>/index.html (SEO).
Uso: python3 tools/paginas.py  (rode na raiz do repositório e publique os arquivos gerados)."""
import html, json, os

DOM = "https://nexorconsultingit.com.br"
WA = "5534997337499"

P = [
 dict(slug="chatbot-whatsapp-com-ia", id="atende", nome="Nexor Atende IA", icone="i-whatsapp",
  title="Chatbot para WhatsApp com IA: atendimento 24h | Nexor",
  desc="Chatbot com inteligência artificial para WhatsApp que responde, vende e agenda 24h, integrado ao seu sistema. Teste grátis por 12 horas, sem cartão.",
  h1="Chatbot para WhatsApp com <em>inteligência artificial</em>",
  sub="Seu WhatsApp respondendo clientes na hora, de dia e de noite: tira dúvidas, envia preços, agenda e fecha pedidos. Quando precisa, passa para a sua equipe com o histórico completo.",
  dores=["Cliente que pergunta à noite e compra do concorrente antes de você responder", "Equipe presa respondendo as mesmas perguntas o dia todo", "Contatos esquecidos, sem retorno e sem registro no CRM"],
  recursos=["Responde, qualifica e agenda sozinha, a qualquer hora", "Treinada com seus produtos, preços, horários e regras", "Integrada ao seu CRM, ERP, agenda e estoque", "Usa a API oficial do WhatsApp (Meta)", "Passa para uma pessoa quando o assunto pede", "Painel com todas as conversas e indicadores"],
  publico=["Lojas e e-commerce", "Clínicas e consultórios", "Oficinas e autocenters", "Imobiliárias", "Restaurantes e delivery", "Prestadores de serviço"],
  faq=[("O chatbot entende áudio e mensagens escritas de qualquer jeito?", "Ele entende mensagens escritas do jeito que o cliente fala, com erros de digitação e gírias, porque usa inteligência artificial e não um menu de opções. O suporte a áudio pode ser incluído no projeto."),
       ("Preciso trocar meu número de WhatsApp?", "Não necessariamente. Usamos a API oficial do WhatsApp da Meta e avaliamos com você se vale usar o número atual ou um número dedicado ao atendimento automático."),
       ("E se o cliente quiser falar com uma pessoa?", "A IA transfere a conversa para a sua equipe com todo o histórico, para ninguém precisar repetir nada.")]),
 dict(slug="sistema-erp", id="gestao", nome="Nexor Gestão", icone="i-layers",
  title="Sistema ERP e CRM sob medida para empresas | Nexor",
  desc="Sistema ERP e CRM sob medida: financeiro, vendas, estoque, NF-e e funil de vendas com IA em um só lugar. Para pequenas, médias e grandes empresas. Teste grátis.",
  h1="Sistema <em>ERP e CRM</em> feito para o jeito que sua empresa trabalha",
  sub="Financeiro, vendas, estoque, compras e NF-e num sistema só, com painéis em tempo real. Chega de planilha espalhada e retrabalho.",
  dores=["Informações espalhadas em planilhas que ninguém confia", "Retrabalho para lançar a mesma venda em vários lugares", "Decisões tomadas sem saber o faturamento e o estoque reais"],
  recursos=["Financeiro, contas a pagar e a receber", "Vendas, pedidos, estoque e compras", "Emissão de NF-e e conciliação bancária", "CRM com funil de vendas e IA que aponta os leads quentes", "Painéis no computador e no celular", "Integração com marketplaces, bancos e o sistema que você já usa"],
  publico=["Comércio e distribuidoras", "Indústrias", "Empresas de serviço", "Redes e franquias", "Empresas que cresceram além das planilhas", "Quem quer trocar um ERP engessado"],
  faq=[("ERP sob medida não é muito mais caro que um pronto?", "Começamos pelo que dá mais retorno e entregamos por módulos, então o investimento acompanha o resultado. E você não paga por funções que não usa nem adapta a empresa ao sistema."),
       ("Consigo migrar os dados do meu sistema atual?", "Sim. Fazemos a migração de cadastros, histórico e saldos do sistema ou das planilhas que você usa hoje."),
       ("Funciona para empresa pequena?", "Sim. O Nexor Gestão atende empresas de pequeno, médio e grande porte, com o escopo do tamanho da sua necessidade.")]),
 dict(slug="software-sob-medida", id="sobmedida", nome="Nexor Sob Medida", icone="i-code",
  title="Desenvolvimento de software sob medida | Nexor",
  desc="Empresa de desenvolvimento de software sob medida: sistemas web, aplicativos, plataformas SaaS e modernização de sistemas. O código fica com você. Fale com a Nexor.",
  h1="Desenvolvimento de <em>software sob medida</em> para o seu negócio",
  sub="Sistemas web, aplicativos e plataformas feitos do zero para o seu processo, com entregas por etapas e o código-fonte entregue para a sua empresa.",
  dores=["Sistemas prontos que obrigam a empresa a mudar o próprio processo", "Sistema antigo, lento e que ninguém mais consegue manter", "Ideia de produto digital parada por falta de um time técnico"],
  recursos=["Aplicativos iOS e Android", "Sistemas web e portais", "Plataformas SaaS e marketplaces", "Modernização de sistemas antigos", "Integrações com APIs e sistemas do mercado", "Código-fonte e documentação são seus"],
  publico=["Empresas com processos próprios", "Startups e novos produtos digitais", "Indústrias e operações complexas", "Empresas com sistema legado", "Equipes de TI que precisam de reforço", "Grandes empresas com demandas específicas"],
  faq=[("Quanto custa desenvolver um software sob medida?", "Depende do escopo e das integrações. Começamos com um diagnóstico gratuito e apresentamos uma proposta por etapas, com prazos e entregas claras."),
       ("Em quanto tempo fica pronto?", "Trabalhamos em ciclos curtos, com versões funcionais desde as primeiras entregas. O prazo total depende do tamanho do projeto."),
       ("O código fica com a minha empresa?", "Sim. O código-fonte e a documentação são entregues para você, sem aprisionamento tecnológico.")]),
 dict(slug="criacao-de-sites", id="sitepro", nome="Nexor Site Pro", icone="i-globe",
  title="Criação de sites profissionais que vendem | Nexor",
  desc="Criação de sites e landing pages rápidos, responsivos e otimizados para o Google, com botões para o WhatsApp e assistente de IA. Para empresas que querem mais clientes.",
  h1="Criação de <em>sites profissionais</em> feitos para gerar clientes",
  sub="Sites e landing pages rápidos, bonitos no celular e preparados para aparecer no Google. Cada página pensada para transformar visita em contato no WhatsApp.",
  dores=["Site bonito que não traz nenhum cliente", "Página lenta e quebrada no celular", "Empresa que não aparece quando alguém procura no Google"],
  recursos=["Design exclusivo e responsivo", "Otimização para o Google (SEO)", "Botões e formulários que levam ao WhatsApp", "Assistente de IA no próprio site", "Medição de visitas e de contatos", "Hospedagem, domínio e e-mail configurados"],
  publico=["Prestadores de serviço", "Clínicas e escritórios", "Restaurantes", "Imobiliárias", "Indústrias e distribuidoras", "Lançamentos e campanhas"],
  faq=[("O site vai aparecer no Google?", "O site já sai com a estrutura técnica para o Google: velocidade, versão para celular, títulos, descrições, dados estruturados e sitemap. A posição também depende de concorrência e conteúdo, e orientamos você no Perfil da Empresa no Google."),
       ("Consigo editar o conteúdo depois?", "Sim. Combinamos no projeto como você prefere atualizar textos, fotos e preços."),
       ("Vocês cuidam de domínio e e-mail?", "Sim. Configuramos domínio, certificado de segurança (HTTPS) e e-mail com o nome da sua empresa.")]),
 dict(slug="loja-virtual", id="commerce", nome="Nexor Commerce", icone="i-store",
  title="Loja virtual integrada a marketplaces | Nexor",
  desc="Loja virtual com Pix, cartão e boleto, integrada ao Mercado Livre, Shopee e outros marketplaces, com estoque unificado. Teste grátis por 12 horas.",
  h1="Loja virtual que vende em <em>todos os canais</em>",
  sub="Sua loja própria com Pix, cartão e boleto, conectada aos marketplaces. Vendeu em um canal, o estoque atualiza em todos.",
  dores=["Estoque diferente em cada canal e venda de produto que acabou", "Horas cadastrando o mesmo produto em vários marketplaces", "Carrinhos abandonados que ninguém tenta recuperar"],
  recursos=["Checkout com Pix, cartão e boleto", "Integração com Mercado Livre, Shopee e outros marketplaces", "Estoque único para todos os canais", "Recuperação de carrinho e recomendações com IA", "Painel de pedidos por canal", "Integração com ERP, frete e nota fiscal"],
  publico=["Lojas físicas que querem vender online", "Quem já vende em marketplace", "Moda e acessórios", "Eletrônicos", "Casa e decoração", "Indústrias que vendem direto ao consumidor"],
  faq=[("Posso continuar vendendo nos marketplaces?", "Sim. A ideia é justamente vender na loja própria e nos marketplaces ao mesmo tempo, com estoque e pedidos num lugar só."),
       ("A loja aceita Pix?", "Sim, com Pix, cartão de crédito e boleto."),
       ("Consigo testar antes?", "Sim. Você pode testar o Nexor Commerce grátis por 12 horas no nosso site.")]),
 dict(slug="automacao-de-processos-com-ia", id="automacao", nome="Nexor Automação", icone="i-bolt",
  title="Automação de processos com IA para empresas | Nexor",
  desc="Automação de processos com inteligência artificial: leitura de notas, boletos e contratos, relatórios e follow-ups automáticos. Calcule quanto sua empresa economiza.",
  h1="Automação de processos com <em>inteligência artificial</em>",
  sub="Agentes de IA que fazem as tarefas repetitivas da sua equipe: leem documentos, lançam dados, cobram, geram relatórios e avisam quando algo precisa de atenção.",
  dores=["Equipe digitando nota, boleto e contrato o dia inteiro", "Relatório que leva horas para ficar pronto toda semana", "Follow-ups e cobranças que dependem de alguém lembrar"],
  recursos=["Leitura de notas fiscais, boletos e contratos com IA", "Lançamento automático no seu sistema", "Relatórios e follow-ups automáticos", "Integração com e-mail, WhatsApp, ERP e planilhas", "Trilha de auditoria e LGPD", "Indicadores de economia desde o primeiro mês"],
  publico=["Financeiro e contabilidade", "Departamento de compras", "Logística", "Jurídico", "Atendimento e vendas", "RH e departamento pessoal"],
  faq=[("Quais tarefas dá para automatizar?", "Tarefas repetitivas com regras claras: ler e lançar documentos, conferir dados, gerar relatórios, enviar lembretes e cobranças, triar e-mails e leads. No diagnóstico gratuito apontamos as de maior retorno."),
       ("A IA erra?", "Por isso desenhamos cada automação com conferências e aprovação humana nos pontos críticos, e com registro de tudo o que foi feito."),
       ("Como sei se vale a pena?", "Use a calculadora de retorno no nosso site: em 30 segundos você vê a economia estimada por mês e por ano.")]),
 dict(slug="sistema-de-chamados", id="chamados", nome="Nexor Service Desk", icone="i-headset",
  title="Sistema de chamados e service desk para TI | Nexor",
  desc="Sistema de chamados (service desk / help desk) com SLA, filas por equipe, painel da gerência e LGPD. Teste grátis por 12 horas, sem cartão.",
  h1="Sistema de <em>chamados</em> com prazo, dono e histórico",
  sub="Service desk para a sua TI e outros setores: abertura guiada, prioridade por impacto, SLA e painel da gerência para ninguém ficar sem resposta.",
  dores=["Pedidos chegando por WhatsApp, e-mail e corredor, sem controle", "Chamado urgente esperando atrás de pedido simples", "Gerência sem saber quanto tempo a equipe leva para resolver"],
  recursos=["Abertura guiada que já direciona para o setor certo", "Prioridade pelo impacto, com prazos de 4 h a 72 h", "Filas por equipe, notas internas e anexos", "Painel da gerência, modo TV e exportação em planilha", "Perfis e permissões por equipe", "LGPD e auditoria"],
  publico=["Equipes de TI internas", "Prestadores de serviço de TI", "Facilities e manutenção", "RH e departamento pessoal", "Escolas e faculdades", "Redes com várias unidades"],
  faq=[("Serve só para a TI?", "Não. O Nexor Service Desk pode atender TI, manutenção, RH, financeiro e qualquer setor que receba pedidos internos."),
       ("Tem controle de SLA?", "Sim. Cada chamado recebe prioridade pelo impacto e um prazo, com alertas antes de vencer."),
       ("Integra com o inventário de máquinas?", "Sim. Com a Nexor IT Platform, um alerta de máquina vira chamado em um clique.")]),
 dict(slug="cofre-de-senhas", id="cofre", nome="Nexor Cofre", icone="i-shield",
  title="Cofre de senhas corporativo com auditoria | Nexor",
  desc="Cofre de senhas para empresas: criptografia, pastas por equipe, permissões, gerador de senhas fortes e histórico de acessos para a LGPD. Teste grátis.",
  h1="Cofre de <em>senhas corporativo</em> com controle de acesso",
  sub="Senhas da empresa guardadas com criptografia, com permissões por equipe e o registro de quem acessou cada uma. Sem senha em planilha ou papel.",
  dores=["Senhas em planilhas, papéis e grupos de mensagem", "Ex-funcionário que ainda sabe senhas importantes", "Nenhum registro de quem usou qual acesso"],
  recursos=["Senhas guardadas com criptografia", "Pastas por equipe e permissões de quem vê e quem edita", "Gerador de senhas fortes", "Histórico de quem acessou cada senha", "Alertas de senhas fracas ou repetidas", "Apoio à adequação à LGPD"],
  publico=["Equipes de TI", "Agências e escritórios", "Contabilidades", "Clínicas", "Empresas com vários sistemas e acessos", "Empresas em adequação à LGPD"],
  faq=[("As senhas ficam seguras?", "As senhas são guardadas com criptografia e cada pessoa só vê o que a permissão dela libera. Todo acesso fica registrado."),
       ("Quando alguém sai da empresa, o que acontece?", "Você remove o acesso da pessoa e vê quais senhas ela usou, para trocar só as necessárias."),
       ("Ajuda na LGPD?", "Sim. Controle de acesso e trilha de auditoria são parte importante das medidas de segurança que a LGPD pede.")]),
 dict(slug="inventario-de-ti", id="ti", nome="Nexor IT Platform", icone="i-monitor",
  title="Inventário de TI e gestão de computadores | Nexor",
  desc="Inventário automático de computadores, programas e rede, alertas, instalação remota de programas, acesso remoto e auditoria. Teste grátis por 12 horas.",
  h1="Inventário de TI e <em>gestão de computadores</em> num só painel",
  sub="Veja cada máquina da empresa, receba alertas, instale programas de longe e mantenha a auditoria em dia, sem visitar mesa por mesa.",
  dores=["Ninguém sabe ao certo quantas máquinas e licenças a empresa tem", "Técnico indo de mesa em mesa para instalar um programa", "Aparelho desconhecido na rede sem ninguém perceber"],
  recursos=["Inventário automático de hardware, programas e rede", "Status ligado e desligado em tempo real", "Alertas que viram chamado em um clique", "Instalação de programas e comandos em uma ou em todas as máquinas", "Acesso remoto", "Auditoria por 2 anos e LGPD"],
  publico=["Equipes de TI internas", "Empresas de suporte de TI", "Escritórios com muitas estações", "Indústrias", "Escolas", "Empresas com várias unidades"],
  faq=[("Precisa instalar algo nas máquinas?", "Sim, um agente leve em cada computador, que envia o inventário e permite instalar programas e executar comandos com segurança."),
       ("Consigo instalar um programa em todas as máquinas de uma vez?", "Sim. Você escolhe uma máquina, um grupo ou todas e acompanha o resultado no painel."),
       ("Por quanto tempo a auditoria fica guardada?", "O histórico de ações fica registrado por 2 anos.")]),
]

def esc(s): return html.escape(s, quote=True)

def wa(msg):
    from urllib.parse import quote
    return f"https://wa.me/{WA}?text={quote(msg)}"

def pagina(p):
    url = f"{DOM}/solucoes/{p['slug']}/"
    titulo_txt = html.unescape(p["h1"].replace("<em>", "").replace("</em>", ""))
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Service", "name": p["nome"], "serviceType": titulo_txt, "description": p["desc"], "url": url,
         "provider": {"@type": "Organization", "@id": f"{DOM}/#empresa", "name": "Nexor Consulting", "url": f"{DOM}/"},
         "areaServed": {"@type": "Country", "name": "Brasil"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Início", "item": f"{DOM}/"},
            {"@type": "ListItem", "position": 2, "name": "Soluções", "item": f"{DOM}/#servicos"},
            {"@type": "ListItem", "position": 3, "name": p["nome"], "item": url}]},
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faq"]]}]}
    msg = f"Olá! Vi a página do {p['nome']} no site da Nexor e quero saber mais."
    outras = "".join(f'<a href="/solucoes/{o["slug"]}/"><svg class="ic"><use href="#{o["icone"]}"/></svg>{esc(o["nome"])}</a>' for o in P if o is not p)
    return f'''<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(p["title"])}</title>
  <meta name="description" content="{esc(p["desc"])}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{url}">
  <meta name="theme-color" content="#03070f">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="Nexor Consulting">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{esc(p["title"])}">
  <meta property="og:description" content="{esc(p["desc"])}">
  <meta property="og:image" content="{DOM}/assets/img/brand-wallpaper.webp">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/png" href="/assets/img/favicon.png">
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Michroma&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/style.css">
  <link rel="stylesheet" href="/assets/css/solucao.css">
  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body class="pg-solucao" style="--a:{SOL_ACCENT.get(p["id"], "#3b8dff")}">
{SVG}
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="Nexor Consulting, início">
      <img src="/assets/img/logo-mark.webp" alt="" width="40" height="45">
      <span class="brand-text"><span class="brand-name">NE<span class="x">X</span>OR</span><span class="brand-sub">CONSULTING</span></span>
    </a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="menu" aria-label="Abrir menu"><span></span><span></span><span></span></button>
    <nav class="nav" id="menu" aria-label="Principal">
      <a href="/#servicos">Soluções</a>
      <a href="/#ti">Para TI</a>
      <a href="/#roi">Calcule seu retorno</a>
      <a href="/#faq">FAQ</a>
      <a class="btn btn-sm btn-primary" href="/#testar-{p["id"]}">Testar grátis</a>
    </nav>
  </div>
</header>

<main id="conteudo">
  <section class="sp-hero">
    <div class="container">
      <nav class="sp-trilha" aria-label="Você está em"><a href="/">Início</a> / <a href="/#servicos">Soluções</a> / <span>{esc(p["nome"])}</span></nav>
      <p class="sp-selo"><svg class="ic"><use href="#{p["icone"]}"/></svg>{esc(p["nome"])}</p>
      <h1>{p["h1"]}</h1>
      <p class="sp-sub">{esc(p["sub"])}</p>
      <div class="sp-ctas">
        <a class="btn btn-lg btn-primary" href="/#testar-{p["id"]}">Testar grátis por 12h <svg class="ic"><use href="#i-arrow"/></svg></a>
        <a class="btn btn-lg btn-ghost" href="{wa(msg)}" target="_blank" rel="noopener"><svg class="ic"><use href="#i-whatsapp"/></svg>Falar no WhatsApp</a>
      </div>
      <p class="sp-nota">Sem cartão de crédito · Integra com a maioria dos sistemas do mercado</p>
    </div>
  </section>

  <section class="sp-bloco">
    <div class="container sp-duas">
      <div>
        <h2>Isso acontece na sua empresa?</h2>
        <ul class="sp-dores">{"".join(f"<li>{esc(d)}</li>" for d in p["dores"])}</ul>
      </div>
      <div class="sp-card">
        <h2>O que o {esc(p["nome"])} faz</h2>
        <ul class="sp-check">{"".join(f"<li>{esc(r)}</li>" for r in p["recursos"])}</ul>
      </div>
    </div>
  </section>

  <section class="sp-bloco">
    <div class="container">
      <h2>Como funciona</h2>
      <ol class="sp-passos">
        <li><b>Teste grátis</b><span>Use a demonstração por 12 horas, com a cara da sua empresa.</span></li>
        <li><b>Diagnóstico</b><span>Entendemos seu processo e estimamos o retorno, sem custo.</span></li>
        <li><b>Implantação</b><span>Configuramos com seus dados e integramos aos seus sistemas.</span></li>
        <li><b>Acompanhamento</b><span>Suporte, ajustes e indicadores para você ver o resultado.</span></li>
      </ol>
    </div>
  </section>

  <section class="sp-bloco">
    <div class="container">
      <h2>Para quem é</h2>
      <div class="sp-chips">{"".join(f"<span>{esc(x)}</span>" for x in p["publico"])}</div>
    </div>
  </section>

  <section class="sp-bloco">
    <div class="container sp-faq">
      <h2>Perguntas frequentes</h2>
      {"".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in p["faq"])}
    </div>
  </section>

  <section class="sp-final">
    <div class="container">
      <h2>Veja funcionando na sua empresa</h2>
      <p>Teste o {esc(p["nome"])} grátis por 12 horas ou fale com um especialista.</p>
      <div class="sp-ctas">
        <a class="btn btn-lg btn-primary" href="/#testar-{p["id"]}">Começar teste grátis</a>
        <a class="btn btn-lg btn-whats" href="{wa(msg)}" target="_blank" rel="noopener"><svg class="ic"><use href="#i-whatsapp"/></svg>(34) 99733-7499</a>
      </div>
    </div>
  </section>

  <section class="sp-bloco">
    <div class="container">
      <h2>Outras soluções da Nexor</h2>
      <div class="sp-outras">{outras}</div>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="container footer-bottom">
    <p>© 2026 Nexor Consulting · Tecnologia • Segurança • Performance</p>
    <p><a href="/">Início</a> · <a href="https://www.instagram.com/nexorconsultingit/" target="_blank" rel="noopener">Instagram</a> · <a href="/privacidade.html">Privacidade</a></p>
  </div>
</footer>

<script src="/assets/js/config.js"></script>
<script src="/assets/js/rastreio.js"></script>
<script src="/assets/js/solucoes.js"></script>
<script src="/assets/js/leads.js"></script>
<script src="/assets/js/assistente.js"></script>
<script>
  (() => {{
    const t = document.querySelector(".nav-toggle"), n = document.getElementById("menu");
    t.addEventListener("click", () => {{ const o = !n.classList.contains("open"); n.classList.toggle("open", o); t.setAttribute("aria-expanded", String(o)); }});
  }})();
</script>
</body>
</html>
'''

if __name__ == "__main__":
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    idx = open(os.path.join(raiz, "index.html"), encoding="utf-8").read()
    a = idx.index('<svg width="0" height="0"'); b = idx.index("</svg>", idx.index("</defs>")) + 6
    SVG = idx[a:b]
    import re
    sol = open(os.path.join(raiz, "assets/js/solucoes.js"), encoding="utf-8").read()
    SOL_ACCENT = dict(re.findall(r'id: "(\w+)",[\s\S]*?accent: "(#[0-9a-fA-F]{6})"', sol))
    for p in P:
        d = os.path.join(raiz, "solucoes", p["slug"]); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(pagina(p))
    # sitemap
    urls = [f"{DOM}/"] + [f"{DOM}/solucoes/{p['slug']}/" for p in P] + [f"{DOM}/privacidade.html"]
    pri = {f"{DOM}/": "1.0", f"{DOM}/privacidade.html": "0.3"}
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(
        f'  <url><loc>{u}</loc><lastmod>2026-11-01</lastmod><priority>{pri.get(u, "0.8")}</priority></url>\n' for u in urls) + "</urlset>\n"
    open(os.path.join(raiz, "sitemap.xml"), "w").write(sm)
    print(len(P), "páginas")
