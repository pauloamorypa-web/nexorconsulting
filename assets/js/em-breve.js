/* Em breve: prévias dos próximos produtos da Nexor (apresentação, ainda sem teste grátis). */

const EM_BREVE = [
  {
    id: "cobra", nome: "Nexor Cobra IA", cor: "#22c55e", cor2: "#22d3ee", icone: "i-chart",
    resumo: "Cobrança inteligente no WhatsApp: lembra, envia o Pix e negocia sozinha.",
    recursos: ["Lembretes antes e no vencimento, com Pix copia e cola", "Negocia parcelas e descontos dentro das suas regras", "Baixa automática quando o cliente paga", "Equipe entra só nos casos difíceis, com o histórico"],
    telas: [["Cobranças", "A IA conversa com quem atrasou, fecha o acordo e manda o Pix na hora."], ["Régua de cobrança", "Cada etapa roda sozinha, e a IA mostra o que mais funciona."]],
  },
  {
    id: "agenda", nome: "Nexor Agenda IA", cor: "#06b6d4", cor2: "#8b5cf6", icone: "i-clock",
    resumo: "Agenda que confirma, remarca e preenche horários vagos sozinha.",
    recursos: ["Confirmação na véspera com botões no WhatsApp", "Remarca sem ligação e oferece a vaga à lista de espera", "Pesquisa de satisfação e convite para avaliar no Google", "Feita para clínicas, salões, oficinas e pet shops"],
    telas: [["Agenda do dia", "Horários confirmados pela IA e desistências preenchidas pela lista de espera."], ["Avaliações", "Depois do atendimento, a IA pergunta como foi e transforma elogios em avaliações."]],
  },
  {
    id: "voz", nome: "Nexor Voz IA", cor: "#f97316", cor2: "#f59e0b", icone: "i-headset",
    resumo: "A mesma IA do WhatsApp atendendo o telefone da sua empresa.",
    recursos: ["Atende todas as ligações, inclusive fora do horário", "Agenda, informa preços e status com a mesma base do WhatsApp", "Cada ligação vira um resumo com o próximo passo", "Transfere para a equipe quando precisa"],
    telas: [["Ao vivo", "Ligação em andamento com transcrição em tempo real."], ["Histórico", "Todas as ligações resumidas, com os casos que precisam de atenção."]],
  },
  {
    id: "vendedor", nome: "Nexor Vendedor IA", cor: "#ec4899", cor2: "#f97316", icone: "i-rocket",
    resumo: "Reativa clientes parados com ofertas personalizadas, uma conversa por vez.",
    recursos: ["Encontra quem parou de comprar no seu histórico", "Cria uma oferta pensada para cada grupo de clientes", "Conduz a conversa até a venda pelo WhatsApp", "Mostra quanto foi vendido com cada oferta"],
    telas: [["Reativação", "Grupos encontrados pela IA e a conversa que termina em venda."], ["Resultados", "Receita gerada, funil e as ofertas que mais venderam."]],
  },
  {
    id: "pedidos", nome: "Nexor Pedidos IA", cor: "#ef4444", cor2: "#f59e0b", icone: "i-store",
    resumo: "Pedidos e delivery pelo WhatsApp, sem comissão de aplicativo.",
    recursos: ["O cliente pede conversando e a IA monta o pedido pelo cardápio", "Calcula entrega, envia o Pix e confirma o pagamento", "Tela da cozinha e acompanhamento da entrega", "Para pizzarias, lanchonetes, restaurantes e mercados"],
    telas: [["Cozinha", "Pedidos pagos no Pix chegam direto na tela da cozinha."], ["Vendas", "Faturamento da semana e quanto você deixou de pagar em comissões."]],
  },
  {
    id: "documentos", nome: "Nexor Documentos IA", cor: "#6366f1", cor2: "#06b6d4", icone: "i-layers",
    resumo: "Lê notas, boletos e comprovantes enviados pelo WhatsApp e lança no sistema.",
    recursos: ["Lê fotos e PDFs de notas fiscais, boletos e comprovantes", "Confere valores, CNPJ e duplicidades", "Sugere categoria e conta contábil", "Ideal para contabilidades, imobiliárias e clínicas"],
    telas: [["Revisão", "O cliente manda a foto e a IA extrai e confere cada campo."], ["Caixa de entrada", "Tudo que chega por WhatsApp e e-mail, lido e organizado."]],
  },
  {
    id: "gestor", nome: "Nexor Gestor IA", cor: "#3b8dff", cor2: "#8b5cf6", icone: "i-brain",
    resumo: "Converse com a sua empresa: vendas, estoque e financeiro respondidos na hora.",
    recursos: ["Pergunte em português e receba a resposta com gráfico", "Conecta ERP, CRM, financeiro e atendimento", "Resumo toda segunda no WhatsApp da diretoria", "Alertas de estoque, atrasos e quedas de venda"],
    telas: [["Perguntar", "Perguntas do dia a dia respondidas com os dados da empresa."], ["Resumo semanal", "O que mudou na semana, por que e o que fazer."]],
  },
  {
    id: "parceiros", nome: "Nexor Parceiros", cor: "#14b8a6", cor2: "#3b8dff", icone: "i-users",
    resumo: "Revenda as soluções de IA da Nexor com a sua marca.",
    recursos: ["Painel com a sua marca, domínio e cores", "Você define os preços e fatura direto para o cliente", "Materiais de venda e suporte técnico da Nexor", "Para agências, consultores e empresas de TI"],
    telas: [["Painel do parceiro", "Clientes, receita recorrente e oportunidades de venda."], ["Sua marca", "Seus clientes veem o seu nome. A tecnologia é da Nexor."]],
  },
];

(() => {
  const grade = document.querySelector("[data-em-breve]");
  const modal = document.getElementById("breve-modal");
  if (!grade || !modal) return;
  const img = (id, t) => `assets/img/em-breve/${id}-${t}.webp`;

  grade.innerHTML = EM_BREVE.map(
    (p) => `
    <article class="breve glow-card reveal" style="--a:${p.cor};--a2:${p.cor2}">
      <button class="breve-foto" type="button" data-breve="${p.id}" aria-label="Ver prévia do ${p.nome}">
        <img src="${img(p.id, 0)}" alt="Prévia do ${p.nome}" width="1600" height="1000" loading="lazy" decoding="async">
        <span class="breve-selo">Em breve</span>
      </button>
      <div class="breve-info">
        <h3><svg class="ic"><use href="#${p.icone}"/></svg> ${p.nome}</h3>
        <p>${p.resumo}</p>
        <button class="btn btn-sm btn-ghost" type="button" data-breve="${p.id}">Ver prévia</button>
      </div>
    </article>`,
  ).join("");

  // Os cartões entram depois do main.js, então ganham a própria animação de entrada
  const cartoes = grade.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver((itens) => itens.forEach((it) => it.isIntersecting && (it.target.classList.add("visible"), io.unobserve(it.target))), { threshold: 0.12 });
    cartoes.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 70}ms`;
      io.observe(el);
    });
  } else cartoes.forEach((el) => el.classList.add("visible"));

  const abas = modal.querySelector(".sm-abas");
  const tela = modal.querySelector(".sm-tela");
  const legenda = modal.querySelector(".sm-legenda");
  let atual;

  const mostrar = (i) => {
    abas.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
    const [nome, texto] = atual.telas[i];
    tela.innerHTML = `<img class="breve-tela" src="${img(atual.id, i)}" alt="${atual.nome}: ${nome} (prévia)" width="1600" height="1000">`;
    legenda.textContent = texto;
  };

  const abrir = (id) => {
    atual = EM_BREVE.find((p) => p.id === id);
    if (!atual) return;
    window.NX?.registrar?.(`breve-${id}`, 2);
    modal.style.setProperty("--a", atual.cor);
    modal.style.setProperty("--a2", atual.cor2);
    modal.querySelector("#bm-titulo").textContent = atual.nome;
    modal.querySelector("#bm-resumo").textContent = atual.resumo;
    modal.querySelector("#bm-recursos").innerHTML = atual.recursos.map((r) => `<li><svg class="ic"><use href="#i-check"/></svg>${r}</li>`).join("");
    modal.querySelector("#bm-avisar").href = whatsUrl(`Olá! Quero ser avisado no lançamento do ${atual.nome} e garantir a condição especial para os primeiros clientes.`);
    modal.querySelector("#bm-whats").href = whatsUrl(`Olá! Vi a prévia do ${atual.nome} no site da Nexor e quero saber mais.`);
    abas.innerHTML = atual.telas.map(([n], i) => `<button type="button" role="tab" data-tela="${i}">${n}</button>`).join("");
    mostrar(0);
    modal.showModal();
  };

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-breve]");
    if (b) abrir(b.dataset.breve);
  });
  abas.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tela]");
    if (b) mostrar(Number(b.dataset.tela));
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest(".modal-close") || e.target.closest("[data-abrir-blue]")) modal.close();
  });

  // Link direto: /#em-breve-cobra abre a prévia do produto
  const m = location.hash.match(/^#em-breve-([a-z]+)$/);
  if (m) {
    document.getElementById("em-breve")?.scrollIntoView();
    abrir(m[1]);
  }
})();
