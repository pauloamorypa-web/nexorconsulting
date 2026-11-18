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

  function mostrar(id, foco = false) {
    const c = CENAS[id];
    if (!c) return;
    limpar();
    abas.forEach((a) => {
      const ativo = a.dataset.cena === id;
      a.setAttribute("aria-selected", ativo);
      a.tabIndex = ativo ? 0 : -1;
      if (ativo && foco) a.focus();
    });
    titulo.textContent = c.tela;
    nome.textContent = c.nome;
    resumo.textContent = c.resumo;
    testar.dataset.testar = c.produto;
    saiba.href = c.link;
    saiba.textContent = `Conhecer o ${c.nome}`;
    feed.innerHTML = "";
    c.eventos.forEach((ev, i) => {
      const li = linha(ev);
      if (calmo) { li.classList.add("visivel"); feed.append(li); return; }
      timers.push(setTimeout(() => { feed.append(li); requestAnimationFrame(() => li.classList.add("visivel")); }, 350 + i * 900));
    });
  }

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
  mostrar(porCampanha[utm] || abas[0].dataset.cena);
})();
