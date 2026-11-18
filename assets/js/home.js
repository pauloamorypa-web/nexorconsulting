/* Home da Nexor: simulador "escolha o seu negócio".
   Cada cena mostra o produto trabalhando naquele tipo de empresa, com dados fictícios.
   O botão de teste abre o teste do produto certo (data-testar, tratado em main.js). */
(() => {
  const raiz = document.querySelector("[data-simulador]");
  if (!raiz) return;

  const CENAS = {
    barbearia: {
      produto: "barber", nome: "Nexor Barber", tela: "Barbearia · hoje",
      resumo: "O cliente agenda sozinho pelo app com a marca da sua barbearia. Lembrete, lista de espera, clube de assinatura, comissão e caixa fechando sozinhos.",
      link: "/solucoes/sistema-para-barbearia/",
      eventos: [
        ["app", "Lucas agendou corte e barba", "Sábado, 10:30 · com o Rafael"],
        ["zap", "Lembrete enviado no WhatsApp", "Lucas confirmou o horário"],
        ["fila", "15:00 cancelou", "João, da lista de espera, ficou com o horário"],
        ["clube", "Novo assinante no clube", "Cabelo e barba ilimitados"],
        ["ok", "Dia fechado", "Caixa e comissões calculados"],
      ],
    },
    clinica: {
      produto: "atende", nome: "Nexor Atende IA", tela: "WhatsApp da clínica · 23:47",
      resumo: "A IA responde o WhatsApp 24 horas com as regras da sua clínica, agenda, confirma e passa para a recepção com o resumo pronto quando precisa de gente.",
      link: "/solucoes/chatbot-whatsapp-com-ia/",
      eventos: [
        ["cliente", "Oi! Tem horário amanhã para limpeza de pele?", "23:47"],
        ["ia", "Tenho às 9h ou às 14h30. Quer que eu reserve para você?", "IA · 23:47"],
        ["cliente", "14h30, por favor", "23:48"],
        ["ia", "Reservado! Te mando um lembrete amanhã de manhã.", "IA · 23:48"],
        ["ok", "Agendado e registrado", "A recepção vê tudo de manhã"],
      ],
    },
    equipe: {
      produto: "rh", nome: "Nexor RH e Ponto", tela: "Ponto da equipe · hoje",
      resumo: "A equipe bate o ponto pelo celular com rosto, digital, QR Code ou GPS, dentro da Portaria 671. Espelho, banco de horas, folha e holerite saem prontos.",
      link: "/solucoes/sistema-de-ponto-eletronico/",
      eventos: [
        ["ponto", "Ana bateu o ponto às 07:58", "Reconhecimento de rosto · na loja"],
        ["ponto", "Carlos bateu o ponto às 08:02", "QR Code · depósito"],
        ["clube", "Banco de horas atualizado", "Ninguém precisou digitar nada"],
        ["app", "Espelho do mês pronto", "Com AFD e AEJ para a fiscalização"],
        ["ok", "Holerite entregue no app", "Para toda a equipe"],
      ],
    },
    contabil: {
      produto: "contabil", nome: "Nexor Contábil", tela: "Escritório contábil · hoje",
      resumo: "Cobra os documentos dos clientes pelo WhatsApp, lê notas e extratos com IA e entrega os lançamentos prontos para o contador conferir.",
      link: "/solucoes/sistema-para-escritorio-de-contabilidade/",
      eventos: [
        ["zap", "Cobrança de documentos enviada", "Para os clientes com pendência"],
        ["app", "Nota fiscal lida pela IA", "Padaria Bom Grão · enviada pelo WhatsApp"],
        ["clube", "Extrato conciliado", "Lançamentos sugeridos para conferir"],
        ["ok", "Lançamentos exportados", "Prontos para o seu sistema contábil"],
      ],
    },
    loja: {
      produto: "elo", nome: "Nexor Elo", tela: "Loja de material elétrico · hoje",
      resumo: "O orçamento do instalador já sai com o estoque da sua loja, o cliente aprova e paga por um link, e o dinheiro cai dividido na hora.",
      link: "/solucoes/rede-fornecedores-instaladores/",
      eventos: [
        ["app", "Instalador montou um orçamento", "Kit de câmeras com o seu estoque reservado"],
        ["cliente", "Cliente final aprovou", "Pagamento por Pix no link"],
        ["clube", "Pagamento dividido", "Produtos para a loja, serviço para o instalador"],
        ["ok", "Venda concluída", "Sem fiado e sem cobrança"],
      ],
    },
    dono: {
      produto: "agente", nome: "Nexor Agente", tela: "Seu WhatsApp · 07:12",
      resumo: "Uma IA no seu WhatsApp que consulta o seu sistema de gestão: vendas, estoque, cobranças e metas. E só age com a sua aprovação.",
      link: "/solucoes/agente-de-ia-no-whatsapp/",
      eventos: [
        ["cliente", "Como foram as vendas ontem?", "07:12"],
        ["ia", "18 pedidos, acima da média da semana. Dois clientes estão com boleto vencido.", "Agente · 07:12"],
        ["cliente", "Manda o lembrete para eles", "07:13"],
        ["ia", "Preparei as duas mensagens. Posso enviar?", "Agente · 07:13"],
        ["ok", "Você aprovou e o lembrete saiu", "Tudo registrado no sistema"],
      ],
    },
  };

  const abas = [...raiz.querySelectorAll("[data-cena]")];
  const feed = raiz.querySelector("[data-feed]");
  const titulo = raiz.querySelector("[data-tela]");
  const nome = raiz.querySelector("[data-produto-nome]");
  const resumo = raiz.querySelector("[data-produto-resumo]");
  const testar = raiz.querySelector("[data-produto-testar]");
  const saiba = raiz.querySelector("[data-produto-link]");
  const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let timers = [];

  const limpar = () => { timers.forEach(clearTimeout); timers = []; };
  const linha = ([tipo, texto, meta]) => {
    const li = document.createElement("li");
    li.className = `ev ev-${tipo}`;
    li.innerHTML = `<span class="ev-texto"></span><span class="ev-meta"></span>`;
    li.querySelector(".ev-texto").textContent = texto;
    li.querySelector(".ev-meta").textContent = meta;
    return li;
  };

  const sec = raiz.closest(".sim");
  const ordem = abas.map((a) => a.dataset.cena);
  let atual = ordem[0];
  let auto = !calmo;
  let proxima;

  function mostrar(id, foco = false) {
    const c = CENAS[id];
    if (!c) return;
    limpar();
    clearTimeout(proxima);
    atual = id;
    abas.forEach((a) => {
      const ativo = a.dataset.cena === id;
      a.setAttribute("aria-selected", ativo);
      a.tabIndex = ativo ? 0 : -1;
      const prog = a.querySelector(".sim-prog");
      if (prog) { prog.style.animation = "none"; void prog.offsetWidth; prog.style.animation = ""; }
      if (ativo && foco) a.focus();
    });
    titulo.textContent = c.tela;
    nome.textContent = c.nome;
    resumo.textContent = c.resumo;
    testar.dataset.testar = c.produto;
    saiba.href = c.link;
    saiba.textContent = `Conhecer o ${c.nome}`;
    feed.innerHTML = "";
    if (calmo) { c.eventos.forEach((ev) => { const li = linha(ev); li.classList.add("visivel"); feed.append(li); }); return; }
    let t = 300;
    c.eventos.forEach((ev) => {
      if (ev[0] === "ia") { // a IA "digita" antes de responder
        const dig = document.createElement("li");
        dig.className = "ev ev-digitando";
        dig.setAttribute("aria-hidden", "true");
        dig.innerHTML = "<i></i><i></i><i></i>";
        timers.push(setTimeout(() => { feed.append(dig); requestAnimationFrame(() => dig.classList.add("visivel")); }, t));
        t += 900;
        timers.push(setTimeout(() => dig.remove(), t));
      }
      const li = linha(ev);
      timers.push(setTimeout(() => { feed.append(li); requestAnimationFrame(() => li.classList.add("visivel")); }, t));
      t += 850;
    });
    const duracao = t + 2600;
    sec.style.setProperty("--cena-ms", `${duracao}ms`);
    sec.dataset.auto = auto ? "1" : "0";
    if (auto) proxima = setTimeout(() => mostrar(ordem[(ordem.indexOf(id) + 1) % ordem.length]), duracao);
  }
  // A troca automática para quando a pessoa interage com o simulador
  const parar = () => { if (!auto) return; auto = false; clearTimeout(proxima); sec.dataset.auto = "0"; };
  raiz.addEventListener("pointerdown", parar);
  raiz.addEventListener("keydown", parar);
  // Fora da tela, não gasta: pausa e retoma
  new IntersectionObserver(([e]) => {
    if (!auto) return;
    if (!e.isIntersecting) { limpar(); clearTimeout(proxima); }
    else mostrar(atual);
  }, { threshold: 0.2 }).observe(sec);

  raiz.addEventListener("click", (e) => {
    const aba = e.target.closest("[data-cena]");
    if (aba) mostrar(aba.dataset.cena);
  });
  raiz.addEventListener("keydown", (e) => {
    const i = abas.indexOf(document.activeElement);
    if (i < 0 || !["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;
    e.preventDefault();
    const passo = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
    mostrar(abas[(i + passo + abas.length) % abas.length].dataset.cena, true);
  });

  // Quem chega por campanha já vê o próprio negócio (utm_campaign=barber, rh-ponto, atende...)
  const utm = new URLSearchParams(location.search).get("utm_campaign") || "";
  const porCampanha = { barber: "barbearia", "rh-ponto": "equipe", rh: "equipe", atende: "clinica", contabil: "contabil", elo: "loja", agente: "dono" };
  if (porCampanha[utm]) auto = false;
  mostrar(porCampanha[utm] || ordem[0]);
})();

/* Faixa "a IA trabalhando": duplica a lista para o trilho não ter emenda */
(() => {
  const trilho = document.querySelector("[data-agora]");
  if (!trilho) return;
  const copia = trilho.querySelector("ul").cloneNode(true);
  copia.setAttribute("aria-hidden", "true");
  trilho.append(copia);
})();

/* Ecossistema: os sistemas conversam entre si */
(() => {
  const mapa = document.querySelector("[data-eco]");
  if (!mapa) return;
  const LIGACOES = [
    ["atende", "agente", "O cliente que chegou pelo WhatsApp aparece nas vendas que o dono consulta no Agente."],
    ["rh", "contabil", "Ponto e folha fechados no RH chegam prontos para o escritório de contabilidade."],
    ["barber", "agente", "O faturamento do dia na barbearia chega no WhatsApp do dono."],
    ["elo", "contabil", "As vendas e repasses do Elo seguem para a contabilidade sem digitar de novo."],
    ["atende", "rh", "O Atende IA responde dúvidas da equipe sobre ponto, férias e holerite."],
  ];
  const TEXTO = {
    blue: ["Blue, a IA da Nexor", "Ela conversa com os clientes, entende o que cada sistema sabe e chama uma pessoa da equipe quando precisa."],
    atende: ["Nexor Atende IA", "Atende e vende no WhatsApp 24 horas. Cada conversa vira contato, com nota de interesse."],
    agente: ["Nexor Agente", "O dono pergunta pelo WhatsApp e recebe vendas, estoque e cobranças de todos os sistemas."],
    rh: ["Nexor RH e Ponto", "Ponto pelo celular, folha e eSocial. Os dados seguem prontos para a contabilidade."],
    contabil: ["Nexor Contábil", "Recebe o que vem do RH e do Elo e lê o resto com IA."],
    barber: ["Nexor Barber", "Agenda, clube e caixa da barbearia, com o resumo do dia no WhatsApp do dono."],
    elo: ["Nexor Elo", "Orçamento do instalador com o estoque da loja e pagamento dividido na hora."],
  };
  const grupo = mapa.querySelector(".eco-linhas");
  const pos = (id) => {
    const b = mapa.querySelector(`[data-no="${id}"]`);
    const cs = getComputedStyle(b);
    return [parseFloat(cs.getPropertyValue("--x")) * 5.2, parseFloat(cs.getPropertyValue("--y")) * 4.4];
  };
  const NS = "http://www.w3.org/2000/svg";
  const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desenhar = (a, b, texto, central) => {
    const [x1, y1] = pos(a), [x2, y2] = pos(b);
    const cx = (x1 + x2) / 2 + (central ? 0 : (y2 - y1) * 0.18), cy = (y1 + y2) / 2 - (central ? 0 : (x2 - x1) * 0.18);
    const g = document.createElementNS(NS, "g");
    g.dataset.a = a; g.dataset.b = b; if (texto) g.dataset.texto = texto;
    const path = document.createElementNS(NS, "path");
    const d = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
    path.setAttribute("d", d);
    g.append(path);
    if (!calmo) { // um pacote de dados correndo pela ligação
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("r", central ? "2.5" : "3.5");
      const anim = document.createElementNS(NS, "animateMotion");
      anim.setAttribute("dur", `${central ? 3 : 4 + Math.random() * 2}s`);
      anim.setAttribute("repeatCount", "indefinite");
      anim.setAttribute("path", d);
      anim.setAttribute("begin", `${Math.random() * 2}s`);
      dot.append(anim);
      g.append(dot);
    }
    grupo.append(g);
  };
  ["atende", "agente", "rh", "contabil", "barber", "elo"].forEach((id) => desenhar("blue", id, "", true));
  LIGACOES.forEach(([a, b, t]) => desenhar(a, b, t, false));

  const titulo = document.querySelector("[data-eco-titulo]");
  const texto = document.querySelector("[data-eco-texto]");
  const focar = (id) => {
    mapa.dataset.foco = id;
    mapa.querySelectorAll(".eco-no").forEach((n) => n.classList.toggle("ativo", n.dataset.no === id));
    const ligadas = [...grupo.children].filter((g) => g.dataset.a === id || g.dataset.b === id);
    [...grupo.children].forEach((g) => g.classList.toggle("ativo", ligadas.includes(g)));
    const [t, d] = TEXTO[id];
    const fluxos = ligadas.map((g) => g.dataset.texto).filter(Boolean);
    titulo.textContent = t;
    texto.textContent = fluxos.length ? `${d} ${fluxos[0]}` : d;
  };
  mapa.addEventListener("pointerover", (e) => { const n = e.target.closest(".eco-no"); if (n) focar(n.dataset.no); });
  mapa.addEventListener("focusin", (e) => { const n = e.target.closest(".eco-no"); if (n) focar(n.dataset.no); });
  mapa.addEventListener("click", (e) => { const n = e.target.closest(".eco-no"); if (n) focar(n.dataset.no); });
})();

/* Banca de testes: os cinco agentes rodam quando a seção aparece */
(() => {
  const lista = document.querySelector("[data-banca]");
  if (!lista) return;
  const itens = [...lista.children];
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { itens.forEach((li) => li.classList.add("ok")); return; }
  let rodou = false;
  new IntersectionObserver(([e], obs) => {
    if (!e.isIntersecting || rodou) return;
    rodou = true; obs.disconnect();
    itens.forEach((li, i) => {
      setTimeout(() => li.classList.add("rodando"), i * 900);
      setTimeout(() => { li.classList.remove("rodando"); li.classList.add("ok"); }, i * 900 + 800);
    });
  }, { threshold: 0.4 }).observe(lista);
})();


/* Produtos: miniaturas trocam a tela grande (telas reais dos sistemas) */
document.addEventListener("click", (e) => {
  const b = e.target.closest(".prod-thumbs [data-tela]");
  if (!b) return;
  const gal = b.closest(".prod-galeria");
  const img = gal.querySelector(".prod-img");
  gal.querySelectorAll("[data-tela]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  const trocar = () => { img.src = b.dataset.tela; img.alt = b.getAttribute("aria-label").replace("Ver tela: ", "Tela: "); img.classList.remove("trocando"); };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return trocar();
  img.classList.add("trocando");
  setTimeout(trocar, 200);
});
