/* Teste grátis de 30 dias: pré-cadastro (vira lead para a Nexor ativar o teste no ambiente do cliente) e as
   demonstrações interativas de cada solução, que abrem na hora.
   As demonstrações rodam no navegador do visitante e guardam os dados só nele. */

const Teste = (() => {
  const DIAS = 30;
  const modalCadastro = document.getElementById("teste-modal");
  const area = document.getElementById("teste-area");
  const corpo = area.querySelector(".ta-corpo");
  let relogio;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const solucao = (id) => SOLUCOES.find((s) => s.id === id);
  const perfil = () => NX.ler("nx-teste-perfil", null);
  const testes = () => NX.ler("nx-testes-30d", {}); // chave nova: os testes antigos eram de 12 horas
  const estado = (id, padrao) => NX.ler(`nx-demo-${id}`, padrao);
  const salvar = (id, valor) => NX.guardar(`nx-demo-${id}`, valor);

  const aviso = (texto) => {
    const t = document.createElement("div");
    t.className = "ta-toast";
    t.textContent = texto;
    area.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  };

  /* ---------- Pré-cadastro ---------- */
  function abrir(id) {
    NX.registrar(`teste-${id}`, 4);
    if (perfil()) return iniciar(id);
    const s = solucao(id);
    modalCadastro.querySelector("[data-teste-nome]").textContent = s.nome;
    modalCadastro.dataset.atual = id;
    modalCadastro.querySelector(".form-error").textContent = "";
    NX.preencher(modalCadastro);
    modalCadastro.showModal();
  }

  modalCadastro.addEventListener("click", (e) => {
    if (e.target === modalCadastro || e.target.closest("[data-fechar]")) modalCadastro.close();
  });
  modalCadastro.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const d = Object.fromEntries(new FormData(form));
    const erro = form.querySelector(".form-error");
    if (!d.nome?.trim() || !d.empresa?.trim() || !NX.contatoValido({ telefone: d.telefone })) {
      erro.textContent = "Preencha nome, empresa e um WhatsApp válido.";
      return;
    }
    if (!d.lgpd) {
      erro.textContent = "Para liberar o teste, autorize o contato da Nexor.";
      return;
    }
    delete d.lgpd;
    form.dataset.enviado = "1";
    NX.guardar("nx-teste-perfil", d);
    modalCadastro.close();
    iniciar(modalCadastro.dataset.atual, true);
  });

  /* ---------- Área de teste ---------- */
  function iniciar(id, primeiraVez = false) {
    const s = solucao(id);
    const t = testes();
    const agora = Date.now();
    if (!t[id]) {
      t[id] = agora + DIAS * 86400_000;
      NX.guardar("nx-testes-30d", t);
      NX.enviarLead("teste", perfil(), { solucao: s.nome, formulario: primeiraVez ? "pre-cadastro" : "novo-teste" });
    }
    area.style.setProperty("--a", s.accent);
    area.style.setProperty("--a2", s.accent2);
    area.querySelector(".ta-nome").textContent = s.nome;
    area.querySelector(".ta-ola").textContent = `Olá, ${perfil().nome.split(" ")[0]}`;
    area.dataset.atual = id;
    area.querySelector(".ta-whats").href = whatsUrl(`Olá! Estou testando o ${s.nome} no site da Nexor e quero falar com um especialista.`);

    clearInterval(relogio);
    const tick = () => {
      const resta = t[id] - Date.now();
      if (resta <= 0) {
        clearInterval(relogio);
        area.querySelector(".ta-tempo").textContent = "teste encerrado";
        return expirado(s);
      }
      const d = Math.floor(resta / 86400_000);
      const h = Math.floor((resta % 86400_000) / 3600_000);
      area.querySelector(".ta-tempo").textContent = d >= 1 ? `${d} ${d === 1 ? "dia" : "dias"} restantes` : `${h}h ${String(Math.floor((resta % 3600_000) / 60_000)).padStart(2, "0")}min restantes`;
    };
    if (t[id] <= agora) expirado(s);
    else {
      corpo.innerHTML = "";
      DEMOS[id](corpo);
      tick();
      relogio = setInterval(tick, 30_000);
    }
    if (!area.open) area.showModal();
  }

  function expirado(s) {
    corpo.innerHTML = `<div class="ta-fim"><h3>Seus 30 dias de teste do ${esc(s.nome)} terminaram</h3><p class="muted">Para continuar, escolha um plano: o nosso time implanta com você, com os seus dados e integrações, e acompanha os resultados de perto.</p><div class="ta-fim-acoes"><button class="btn btn-primary" type="button" data-implantar>Quero contratar</button><a class="btn btn-whats" target="_blank" rel="noopener" href="${whatsUrl(`Olá! Meu teste do ${s.nome} terminou e quero conversar sobre a implantação.`)}">Falar no WhatsApp</a></div></div>`;
  }

  area.addEventListener("click", (e) => {
    if (e.target.closest("[data-fechar-area]")) {
      clearInterval(relogio);
      area.close();
    }
    if (e.target.closest("[data-implantar]")) {
      const s = solucao(area.dataset.atual);
      const fim = e.target.closest(".ta-fim");
      NX.enviarLead("interesse", perfil(), { solucao: s.nome, formulario: fim ? "quero-contratar" : "teste-30-dias-com-dados" });
      aviso(fim ? "Recebemos! Um especialista vai te chamar no WhatsApp para montar o seu plano." : "Recebemos! O time Nexor vai te chamar no WhatsApp para ativar os 30 dias com os dados da sua empresa.");
    }
  });

  /* ---------- Componentes ---------- */
  const abas = (raiz, nomes, desenhar) => {
    raiz.innerHTML = `<div class="ta-abas" role="tablist">${nomes.map((n, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-aba="${i}">${n}</button>`).join("")}</div><div class="ta-painel"></div>`;
    const painel = raiz.querySelector(".ta-painel");
    const ir = (i) => {
      raiz.querySelectorAll("[data-aba]").forEach((b) => b.setAttribute("aria-selected", String(Number(b.dataset.aba) === i)));
      desenhar(i, painel);
    };
    raiz.querySelector(".ta-abas").addEventListener("click", (e) => {
      const b = e.target.closest("[data-aba]");
      if (b) ir(Number(b.dataset.aba));
    });
    ir(0);
    return ir;
  };
  const chip = (texto, tom) => `<em class="ta-chip ${tom}">${esc(texto)}</em>`;
  const tabela = (colunas, linhas, vazio = "Nada por aqui ainda.") =>
    linhas.length
      ? `<div class="ta-tabela"><table><thead><tr>${colunas.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      : `<p class="muted ta-vazio">${vazio}</p>`;
  const kpis = (itens) => `<div class="ta-kpis">${itens.map(([l, v, tom]) => `<div class="${tom ?? ""}"><small>${l}</small><b>${v}</b></div>`).join("")}</div>`;
  const dataCurta = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  /* ---------- Telas reais do Nexor Atende IA (capturas do sistema com dados de demonstração) ---------- */
  const TELAS_ATENDE = [
    ["conversa", "Conversas em tempo real", "A IA atende, agenda e você acompanha tudo. Ao lado, a inteligência da conversa: temperatura do lead, sentimento, resumo e a próxima ação recomendada."],
    ["painel", "Painel de resultados", "Quantas conversas a IA resolveu, tempo de resposta, horas economizadas, funil de vendas e quem precisa de você agora."],
    ["transferencia", "Passa para a equipe na hora certa", "Negociação ou cliente pedindo uma pessoa? A IA transfere com o resumo pronto e avisa a equipe."],
    ["simulador", "Simulador da IA", "Teste antes de colocar no ar e veja nos bastidores o que a IA faz: consulta a base, vê horários, atualiza o CRM."],
    ["ensinar", "A IA aprende com você", "Corrija uma resposta uma vez e a IA passa a responder do seu jeito em todas as conversas."],
    ["funil", "CRM e funil automáticos", "A IA preenche o cadastro e avança cada cliente no funil conforme a conversa. Arraste para ajustar."],
    ["agenda", "Agenda pelo WhatsApp", "Horários marcados pela IA respeitando o expediente e a duração de cada serviço, com lembrete automático."],
    ["campanhas", "Campanhas com modelos aprovados", "Dispare pela API oficial da Meta e acompanhe entregas, leituras e respostas. Quem responde é atendido pela IA."],
    ["celular", "Também no celular", "Acompanhe e responda de qualquer lugar."],
  ];

  /* ---------- Telas reais do Nexor RH (capturas com a empresa fictícia Padaria Pão Dourado) ---------- */
  const TELAS_RH = [
    ["app", "App do colaborador", "Bate o ponto com a digital ou o rosto do celular, recebe o comprovante na hora e vê o holerite. Funciona como app instalado, sem loja."],
    ["painel", "Painel do RH", "Quem está trabalhando agora, atrasos, pedidos para aprovar, férias a vencer, fim de experiência e aniversariantes."],
    ["ponto", "Ponto do dia em tempo real", "Cada batida aparece na hora, com selo de biometria e QR Code. Entende turnos que viram a noite."],
    ["espelho", "Espelho de ponto", "Horas trabalhadas, extras 50% e 100%, adicional noturno, atrasos e faltas, com a tolerância da CLT."],
    ["quiosque", "Quiosque com QR Code", "Tablet na entrada com QR que muda a cada 30 segundos. Quem está sem celular bate com CPF e PIN."],
    ["ferias", "Férias sem multa", "Períodos aquisitivos e prazos de concessão: o sistema avisa antes de a férias vencer e ter que ser paga em dobro."],
    ["folha", "Folha de pagamento", "INSS, IRRF (com a isenção de 2026), FGTS, extras, DSR, faltas e benefícios calculados a partir do ponto."],
    ["holerite", "Holerite", "Demonstrativo completo, liberado no app do colaborador quando a folha é fechada."],
    ["esocial", "eSocial integrado", "Admissão, alterações, afastamentos, desligamento e folha viram eventos assinados com o certificado da empresa."],
    ["recrutamento", "Recrutamento", "Página de vagas com envio de currículo e funil de candidatos de arrastar e soltar."],
  ];

  /* ---------- Telas reais do Nexor Barber (Barbearia Navalha, fictícia) ---------- */
  const TELAS_BARBER = [
    ["app-agendar", "App do cliente", "O de sempre em um toque, o que o clube cobre em cada serviço e os horários livres do barbeiro."],
    ["app-loja", "Produto junto com o corte", "Na confirmação o cliente reserva o produto e paga na comanda. Assinante vê o desconto do clube."],
    ["app-entrar", "Entrar sem senha", "Google, código pelo WhatsApp ou por SMS. O app sugere o barbeiro de sempre."],
    ["agenda", "Agenda do dia", "Linha do tempo por barbeiro, com a linha do agora, folgas, encaixes e quem chegou."],
    ["comanda", "Atendimento", "Chegou, na cadeira, faltou, remarcar ou cancelar em um toque."],
    ["clientes", "Clientes", "Quem é do clube, quem sumiu do próprio ciclo de corte e os aniversariantes."],
    ["clube", "Clube de assinatura", "Planos, assinantes, uso do ciclo, receita recorrente e mensalidades em atraso."],
    ["produtos", "Produtos e estoque", "Preço, margem, estoque mínimo e o que aparece na vitrine do app."],
    ["caixa", "Caixa do dia", "Vendas por forma de pagamento, serviços, produtos e mensalidades do clube."],
    ["comissoes", "Comissões", "Calculadas em cada comanda fechada, com o percentual de serviço e de produto de cada barbeiro."],
    ["relatorios", "Relatórios", "Faturamento, atendimentos, faltas, agendamentos pelo app e mais vendidos."],
  ];

  /* ---------- Telas reais do Nexor Contábil (Lima Contabilidade e clientes fictícios) ---------- */
  const TELAS_CONTABIL = [
    ["leitura", "Leitura com IA", "A IA lê a nota, confere CNPJ, duplicidade e competência e prepara o pré-lançamento para o contador conferir."],
    ["inicio", "Painel do escritório", "Documentos a conferir, quanto do mês já chegou, obrigações da semana e quem está atrasando."],
    ["documentos", "Documentos recebidos", "Tudo que chegou pelo portal, pelo WhatsApp ou pela equipe, com alertas da conferência."],
    ["lancamentos", "Lançamentos", "Nota e extrato viram lançamentos com débito, crédito e histórico, prontos para exportar."],
    ["cobranca", "Cobrança de documentos", "O que cada cliente ainda deve mandar no mês, com a régua de lembretes rodando sozinha."],
    ["obrigacoes", "Obrigações e prazos", "Tarefas por cliente e competência, com prazo interno antes do vencimento legal."],
    ["portal", "Portal do cliente", "O cliente vê o que falta, envia documentos, recebe guias e abre chamados, com a marca do escritório."],
    ["celular", "Portal no celular", "O cliente resolve tudo pelo celular."],
  ];

  function galeriaAtende(raiz) {
    galeria(raiz, { telas: TELAS_ATENDE, pasta: "atende", titulo: "3. Por dentro do Nexor Atende IA: telas reais do sistema", selo: "Sistema real · API oficial da Meta", dica: "Capturas do painel do Nexor Atende IA com dados de demonstração (Clínica Sorriso é uma empresa fictícia). Na versão contratada, é a sua empresa aqui.", vertical: ["celular"], nome: "Nexor Atende IA" });
  }

  function galeria(raiz, { telas: TELAS, pasta, titulo, selo, dica, vertical = [], nome }) {
    const sec = document.createElement("section");
    sec.className = "ta-card ta-galeria";
    sec.innerHTML = `
      <div class="ta-galeria-topo">
        <h4>${esc(titulo)}</h4>
        <span class="ta-galeria-selo">${esc(selo)}</span>
      </div>
      <div class="ta-galeria-palco">
        <button class="ta-galeria-seta" type="button" data-passo="-1" aria-label="Tela anterior">‹</button>
        <figure>
          <button class="ta-galeria-ampliar" type="button" aria-label="Ampliar tela"><img alt="" width="1600" height="1000" decoding="async"></button>
          <figcaption><b></b><span></span></figcaption>
        </figure>
        <button class="ta-galeria-seta" type="button" data-passo="1" aria-label="Próxima tela">›</button>
      </div>
      <div class="ta-galeria-miniaturas" role="tablist" aria-label="Telas do sistema">
        ${TELAS.map(([id, titulo], i) => `<button type="button" role="tab" data-i="${i}" aria-label="${esc(titulo)}"><img src="assets/img/${pasta}/${id}.webp" alt="" loading="lazy" decoding="async"><small>${esc(titulo)}</small></button>`).join("")}
      </div>
      <p class="muted ta-dica">${esc(dica)}</p>`;
    raiz.appendChild(sec);

    let atual = 0;
    const img = sec.querySelector("figure img");
    const mostrar = (i) => {
      atual = (i + TELAS.length) % TELAS.length;
      const [id, titulo, texto] = TELAS[atual];
      img.src = `assets/img/${pasta}/${id}.webp`;
      img.alt = `Tela do ${nome}: ${titulo}`;
      img.classList.toggle("vertical", vertical.includes(id));
      sec.querySelector("figcaption b").textContent = titulo;
      sec.querySelector("figcaption span").textContent = texto;
      sec.querySelectorAll(".ta-galeria-miniaturas button").forEach((b, j) => b.setAttribute("aria-selected", String(j === atual)));
      sec.querySelector(`.ta-galeria-miniaturas [data-i="${atual}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    };
    sec.addEventListener("click", (e) => {
      const passo = e.target.closest("[data-passo]");
      const mini = e.target.closest("[data-i]");
      if (passo) mostrar(atual + Number(passo.dataset.passo));
      if (mini) mostrar(Number(mini.dataset.i));
      if (e.target.closest(".ta-galeria-ampliar")) ampliar();
    });

    function ampliar() {
      const v = document.createElement("div");
      v.className = "ta-zoom";
      v.setAttribute("role", "dialog");
      v.setAttribute("aria-label", "Tela ampliada");
      v.innerHTML = `<button class="ta-zoom-fechar" type="button" aria-label="Fechar">×</button><button class="ta-galeria-seta" type="button" data-z="-1" aria-label="Tela anterior">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="ta-galeria-seta" type="button" data-z="1" aria-label="Próxima tela">›</button>`;
      const zimg = v.querySelector("img");
      const pintar = () => {
        zimg.src = img.src;
        zimg.alt = img.alt;
        v.querySelector("figcaption").textContent = TELAS[atual][1];
      };
      const fechar = () => {
        v.remove();
        area.removeEventListener("cancel", impedir);
        document.removeEventListener("keydown", tecla, true);
      };
      const impedir = (e) => {
        e.preventDefault();
        fechar();
      };
      const tecla = (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          mostrar(atual + (e.key === "ArrowRight" ? 1 : -1));
          pintar();
        }
      };
      v.addEventListener("click", (e) => {
        const z = e.target.closest("[data-z]");
        if (z) {
          mostrar(atual + Number(z.dataset.z));
          pintar();
        } else if (e.target === v || e.target.closest(".ta-zoom-fechar")) fechar();
      });
      area.addEventListener("cancel", impedir);
      document.addEventListener("keydown", tecla, true);
      pintar();
      area.appendChild(v);
      v.querySelector(".ta-zoom-fechar").focus();
    }
    mostrar(0);
  }

  /* ---------- Demonstrações ---------- */
  const DEMOS = {
    /* Nexor RH: bata o ponto num celular simulado, veja o espelho calcular e simule um holerite */
    rh(raiz) {
      const ROTULOS = ["Entrada", "Saída para intervalo", "Volta do intervalo", "Saída"];
      const HORARIOS = [[8, 2], [12, 4], [13, 1], [17, 53]];
      const st = estado("rh", { marcas: [], nsr: 4817 });
      const pad = (n) => String(n).padStart(2, "0");
      const hora = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      const dur = (m) => `${Math.floor(m / 60)}h${pad(Math.round(m % 60))}`;
      const empresa = NX.ler("nx-teste-perfil", {}).empresa || "Sua Empresa";
      const nome = (NX.ler("nx-teste-perfil", {}).nome || "Você").split(" ")[0];

      /* Tabelas 2025 (INSS, salário-família) e IRRF com a redução de 2026 (Lei 15.270/2025), em reais */
      const inss = (b) => { let t = 0, ant = 0; for (const [ate, al] of [[1518, 0.075], [2793.88, 0.09], [4190.83, 0.12], [8157.41, 0.14]]) { if (b > ant) t += (Math.min(b, ate) - ant) * al; ant = ate; } return Math.round(t * 100) / 100; };
      const irrf = (rend, inssV, deps) => {
        const base = Math.max(0, rend - Math.max(inssV + deps * 189.59, 607.2));
        const f = [[2428.8, 0, 0], [2826.65, 0.075, 182.16], [3751.05, 0.15, 394.16], [4664.68, 0.225, 675.49], [Infinity, 0.275, 908.73]].find(([ate]) => base <= ate);
        let imp = Math.max(0, base * f[1] - f[2]);
        imp = Math.max(0, imp - (rend <= 5000 ? 312.89 : rend <= 7350 ? Math.max(0, 978.62 - 0.133145 * rend) : 0));
        return imp < 10 ? 0 : Math.round(imp * 100) / 100;
      };

      raiz.innerHTML = `
        <div class="ta-dois">
          <div class="ta-card ta-rh-cel">
            <h4>1. Bata o ponto como o seu colaborador</h4>
            <div class="ta-rh-tela">
              <small class="muted">${esc(empresa)}</small>
              <b class="ta-rh-ola">Olá, ${esc(nome)}!</b>
              <div class="ta-rh-relogio" data-relogio></div>
              <button type="button" class="ta-rh-botao" data-bater><span class="ta-rh-dedo">☝︎</span><span data-rotulo></span></button>
              <div class="ta-rh-selos"><em class="ta-chip ok">digital ativa</em><em class="ta-chip">📍 dentro da empresa</em></div>
              <ol class="ta-rh-marcas" data-marcas></ol>
            </div>
            <p class="muted ta-dica">Na demonstração cada toque simula o próximo horário do dia. No sistema real, o celular confere a digital ou o rosto e o GPS antes de registrar.</p>
          </div>
          <div class="ta-card ta-rh-painel"><h4>2. Veja o que o RH recebe na hora</h4><div data-abas></div></div>
        </div>`;

      const desenharCel = () => {
        const prox = ROTULOS[st.marcas.length];
        raiz.querySelector("[data-rotulo]").textContent = prox ? `Registrar ${prox.toLowerCase()}` : "Dia completo ✓";
        raiz.querySelector("[data-bater]").disabled = !prox;
        raiz.querySelector("[data-marcas]").innerHTML = st.marcas.map((m, i) => `<li><b>${hora(m.min)}</b> ${ROTULOS[i]} <small>NSR ${m.nsr}</small></li>`).join("") || `<li class="muted">Nenhuma marcação ainda.</li>`;
      };
      const relogio = raiz.querySelector("[data-relogio]");
      const tique = () => { if (!relogio.isConnected) return clearInterval(t); relogio.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
      const t = setInterval(tique, 1000);
      tique();

      const ir = abas(raiz.querySelector("[data-abas]"), ["Espelho do dia", "Comprovante", "Simular holerite"], (aba, p) => {
        if (aba === 0) {
          const ms = st.marcas.map((m) => m.min);
          let trab = 0;
          for (let i = 0; i + 1 < ms.length; i += 2) trab += ms[i + 1] - ms[i];
          const previsto = 528;
          const saldo = ms.length === 4 ? trab - previsto : 0;
          const extra = saldo > 5 ? saldo : 0;
          const atraso = ms.length && ms[0] > 8 * 60 + 5 ? ms[0] - 8 * 60 : 0;
          p.innerHTML = kpis([["Trabalhadas", dur(trab)], ["Previstas", "8h48"], ["Horas extras", dur(extra), extra ? "warn" : ""], ["Atraso", dur(atraso), atraso ? "bad" : "ok"]]) +
            tabela(["Colaborador", "Marcações", "Situação"], [
              [`<b>${esc(nome)}</b> (você)`, st.marcas.map((m) => `<code>${hora(m.min)}</code>`).join(" ") || "—", ms.length === 0 ? chip("Ainda não chegou", "") : ms.length % 2 ? chip("Trabalhando", "ok") : ms.length === 2 ? chip("Em intervalo", "info") : chip("Saiu", "")],
              ["Ana Lima", "<code>07:58</code> <code>12:01</code>", chip("Em intervalo", "info")],
              ["Bruno Costa", "<code>08:21</code>", chip("Trabalhando · 16 min de atraso", "warn")],
              ["Carla Dias", "—", chip("Férias", "")],
            ]) + `<p class="muted ta-dica">Tolerância de 5 minutos por marcação (CLT art. 58 §1º). Bata as 4 marcações e veja as horas extras aparecerem.</p>`;
        } else if (aba === 1) {
          const m = st.marcas.at(-1);
          p.innerHTML = m
            ? `<div class="ta-rh-comp"><div class="ta-rh-ok">✓</div><b>${hora(m.min)}</b><p>${ROTULOS[st.marcas.length - 1]} · com biometria</p>
               <dl><dt>Empregador</dt><dd>${esc(empresa)}</dd><dt>Trabalhador</dt><dd>${esc(nome)}</dd><dt>NSR</dt><dd>${String(m.nsr).padStart(9, "0")}</dd><dt>Código</dt><dd><code>${m.hash}</code></dd></dl>
               <small class="muted">Comprovante de Registro de Ponto do Trabalhador (Portaria MTP 671/2021). Cada marcação recebe um número sequencial e um código encadeado à anterior: ninguém altera sem deixar rastro.</small></div>`
            : `<p class="muted ta-vazio">Bata o ponto no celular ao lado para gerar o comprovante.</p>`;
        } else {
          p.innerHTML = `<form class="ta-form ta-rh-sim">
              <label>Salário (R$)<input name="sal" type="number" min="1518" step="0.01" value="3000"></label>
              <label>Horas extras 50% no mês<input name="he" type="number" min="0" max="80" step="0.5" value="6"></label>
              <label>Dependentes<input name="dep" type="number" min="0" max="10" value="1"></label>
              <label class="ta-check"><input name="vt" type="checkbox" checked> Vale-transporte (6%)</label>
            </form><div data-holerite></div>`;
          const form = p.querySelector("form");
          const calc = () => {
            const d = Object.fromEntries(new FormData(form));
            const sal = Math.max(0, Number(d.sal) || 0);
            const he = ((sal / 220) * 1.5 * (Number(d.he) || 0));
            const dsr = he / 25 * 5;
            const bruto = sal + he + dsr;
            const i = inss(bruto);
            const ir = irrf(bruto, i, Number(d.dep) || 0);
            const vt = d.vt ? sal * 0.06 : 0;
            const liq = bruto - i - ir - vt;
            const linha = (n, v, neg) => `<li><span>${n}</span><b class="${neg ? "neg" : ""}">${neg ? "−" : ""}${brl(v)}</b></li>`;
            p.querySelector("[data-holerite]").innerHTML = `<ul class="ta-rh-hol">${linha("Salário", sal)}${he ? linha("Horas extras 50%", he) : ""}${dsr ? linha("DSR sobre extras", dsr) : ""}${linha("INSS", i, true)}${ir ? linha("IRRF", ir, true) : `<li><span>IRRF</span><b>isento</b></li>`}${vt ? linha("Vale-transporte", vt, true) : ""}<li class="total"><span>Líquido</span><b>${brl(liq)}</b></li></ul>
              <p class="muted ta-dica">FGTS do mês (pago pela empresa): ${brl(bruto * 0.08)}. Estimativa com INSS de 2025 e a nova isenção do IR de 2026. No sistema, as tabelas são atualizadas a cada ano.</p>`;
          };
          form.addEventListener("input", calc);
          calc();
        }
      });

      raiz.querySelector("[data-bater]").addEventListener("click", async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        b.classList.add("lendo");
        raiz.querySelector("[data-rotulo]").textContent = "Confirmando digital…";
        await new Promise((r) => setTimeout(r, 900));
        b.classList.remove("lendo");
        const [hh, mm] = HORARIOS[st.marcas.length];
        const min = hh * 60 + mm + Math.round(Math.random() * 6) - 2;
        const bytes = crypto.getRandomValues(new Uint8Array(8));
        st.nsr++;
        st.marcas.push({ min, nsr: st.nsr, hash: [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("") + "…" });
        salvar("rh", st);
        aviso(`Ponto registrado às ${hora(min)} ✓`);
        desenharCel();
        ir(1);
      });
      const recomecar = document.createElement("button");
      recomecar.type = "button";
      recomecar.className = "btn btn-sm btn-ghost";
      recomecar.textContent = "Recomeçar o dia";
      recomecar.addEventListener("click", () => { st.marcas = []; salvar("rh", st); desenharCel(); ir(0); });
      raiz.querySelector(".ta-rh-cel").appendChild(recomecar);
      desenharCel();

      galeria(raiz, { telas: TELAS_RH, pasta: "rh", titulo: "3. Por dentro do Nexor RH: telas reais do sistema", selo: "Sistema real · eSocial · Portaria 671", dica: "Capturas do Nexor RH com dados de demonstração (Padaria Pão Dourado é uma empresa fictícia). Na versão contratada, é a sua empresa aqui.", nome: "Nexor RH" });
    },

    /* Nexor Atende IA: o visitante descreve a empresa e conversa com o atendente virtual dela */
    atende(raiz) {
      const exemplos = {
        "Pizzaria": "Pizzaria aberta de terça a domingo, das 18h às 23h30.\nPizza grande R$ 59,90, média R$ 45,90. Borda recheada + R$ 8.\nEntrega grátis até 5 km, taxa de R$ 7 acima disso. Tempo médio 40 minutos.\nPagamento: Pix, cartão ou dinheiro.",
        "Clínica": "Clínica odontológica, segunda a sexta das 8h às 19h e sábado das 8h às 12h.\nAvaliação gratuita. Limpeza R$ 180. Clareamento a partir de R$ 650.\nAtendemos os convênios OdontoPrev e Amil Dental.\nEndereço: Av. Rondon Pacheco, 1500.",
        "Loja de roupas": "Loja de moda feminina com loja física e online.\nTamanhos do PP ao GG. Trocas em até 30 dias.\nFrete grátis acima de R$ 299. Envio em 1 dia útil.\nPix com 5% de desconto. Parcelamos em até 6x sem juros.",
        "Oficina": "Oficina mecânica, segunda a sexta das 8h às 18h, sábado até 12h.\nRevisão completa a partir de R$ 290. Troca de óleo a partir de R$ 159.\nAlinhamento e balanceamento R$ 120.\nOrçamento gratuito e garantia de 90 dias nos serviços.",
      };
      const st = estado("atende", { nome: NX.ler("nx-teste-perfil", {}).empresa ?? "Minha Empresa", segmento: "Pizzaria", info: exemplos.Pizzaria, msgs: [] });
      const sessaoDemo = `${NX.sessao}-demo`.slice(0, 64);

      raiz.innerHTML = `
        <div class="ta-dois">
          <form class="ta-card ta-form" data-config>
            <h4>1. Conte sobre a sua empresa</h4>
            <label>Nome da empresa<input name="nome" value="${esc(st.nome)}" maxlength="80"></label>
            <label>Ramo<select name="segmento">${Object.keys(exemplos).concat("Outro").map((k) => `<option ${k === st.segmento ? "selected" : ""}>${k}</option>`).join("")}</select></label>
            <label>O que o atendente precisa saber<textarea name="info" rows="8" maxlength="1500">${esc(st.info)}</textarea></label>
            <p class="muted ta-dica">Horários, preços, formas de pagamento, endereço. Quanto mais detalhe, melhor a resposta.</p>
          </form>
          <div class="ta-card ta-celular">
            <h4>2. Converse como se fosse seu cliente</h4>
            <div class="ta-chat">
              <div class="ta-chat-topo"><span class="ta-av">${esc(st.nome[0] ?? "E")}</span><div><b data-nome>${esc(st.nome)}</b><small>● atendente virtual</small></div></div>
              <div class="ta-msgs" aria-live="polite"></div>
              <div class="ta-sugs">${["Qual o horário de vocês?", "Quanto custa?", "Quero fazer um pedido", "Vocês aceitam Pix?"].map((s) => `<button type="button">${s}</button>`).join("")}</div>
              <form class="ta-envio"><input aria-label="Mensagem" placeholder="Escreva como um cliente…" maxlength="500"><button class="btn btn-sm btn-primary" type="submit">Enviar</button></form>
            </div>
            <p class="muted ta-dica">${NEXOR_API_URL ? "Respostas geradas por IA com as informações ao lado. As mensagens vão para o provedor de IA: use dados de exemplo, não dados reais de clientes." : "Prévia do atendimento. Na versão contratada, a IA responde qualquer pergunta com base nas suas informações."}</p>
          </div>
        </div>`;

      galeriaAtende(raiz);

      const msgs = raiz.querySelector(".ta-msgs");
      const config = raiz.querySelector("[data-config]");
      const balao = (de, texto) => {
        const p = document.createElement("p");
        p.className = de;
        p.textContent = texto;
        msgs.appendChild(p);
        msgs.scrollTop = msgs.scrollHeight;
        return p;
      };
      st.msgs.forEach(([de, t]) => balao(de, t));
      if (!st.msgs.length) balao("out", `Olá! Bem-vindo(a) à ${st.nome}. Como posso ajudar?`);

      config.addEventListener("input", (e) => {
        Object.assign(st, Object.fromEntries(new FormData(config)));
        if (e.target.name === "segmento" && exemplos[st.segmento]) config.info.value = st.info = exemplos[st.segmento];
        raiz.querySelector("[data-nome]").textContent = st.nome;
        raiz.querySelector(".ta-av").textContent = st.nome[0] ?? "E";
        salvar("atende", st);
      });

      const local = (texto) => {
        const q = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const linhas = st.info.split("\n").map((l) => l.trim()).filter(Boolean);
        const normal = (l) => l.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const achar = (...palavras) => linhas.find((l) => palavras.some((p) => normal(l).includes(p)));
        if (/^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(q)) return `Olá! Aqui é o atendimento da ${st.nome} 😊 Como posso ajudar?`;
        if (/(horario|abre|aberto|funciona|fecha)/.test(q)) return achar("h ", "às", "segunda", "terça", "aberta", "aberto") ?? "Vou confirmar o horário com a equipe e já te retorno!";
        if (/(preco|valor|quanto|custa|r\$)/.test(q)) return achar("r$") ? `${achar("r$")} Posso ajudar com mais alguma coisa?` : "Vou confirmar os valores com a equipe e já te passo!";
        if (/(pix|cartao|pagamento|pagar|parcel)/.test(q)) return achar("pix", "cartão", "pagamento", "parcel") ?? "Aceitamos as principais formas de pagamento. Quer que eu confirme alguma específica?";
        if (/(pedido|comprar|quero|encomend)/.test(q)) return "Perfeito! Me diz o que você deseja e o endereço que eu já registro o pedido. (Na versão real, aqui eu já envio o link do Pix e aviso a equipe.)";
        if (/(agend|marcar|horario disponivel|consulta|visita)/.test(q)) return "Claro! Tenho horários amanhã às 9h, 14h ou 16h30. Qual fica melhor? (simulação de agenda)";
        if (/(entrega|frete|envio|delivery)/.test(q)) return achar("entrega", "frete", "envio") ?? "Fazemos entrega sim! Me passa seu bairro que eu confirmo o prazo.";
        if (/(endereco|onde fica|localiza)/.test(q)) return achar("endereço", "av.", "rua") ?? "Vou te mandar a localização certinha!";
        const palavras = q.split(/\W+/).filter((w) => w.length > 3);
        const parecida = linhas.find((l) => palavras.some((w) => normal(l).includes(w)));
        return parecida ? `${parecida} Posso ajudar em mais algo?` : "Boa pergunta! Vou confirmar com a equipe e já te retorno. Posso anotar seu nome e WhatsApp?";
      };

      const enviar = async (texto) => {
        texto = texto.trim();
        if (!texto) return;
        balao("in", texto);
        st.msgs.push(["in", texto]);
        const digitando = balao("out ta-digitando", "digitando…");
        let resposta;
        if (NEXOR_API_URL) {
          try {
            const r = await fetch(`${NEXOR_API_URL.replace(/\/$/, "")}/api/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessao: sessaoDemo, mensagem: texto, modo: "demo", negocio: { nome: st.nome, segmento: st.segmento, info: st.info } }),
            });
            resposta = (await r.json()).resposta;
          } catch {
            resposta = local(texto);
          }
        } else {
          await new Promise((r) => setTimeout(r, 700));
          resposta = local(texto);
        }
        digitando.remove();
        balao("out", resposta);
        st.msgs.push(["out", resposta]);
        st.msgs = st.msgs.slice(-30);
        salvar("atende", st);
      };
      raiz.querySelector(".ta-envio").addEventListener("submit", (e) => {
        e.preventDefault();
        const campo = e.target.querySelector("input");
        enviar(campo.value);
        campo.value = "";
      });
      raiz.querySelector(".ta-sugs").addEventListener("click", (e) => e.target.matches("button") && enviar(e.target.textContent));
    },

    /* Nexor Barber: o cliente agenda pelo app (com clube e produto), a barbearia atende e fecha a comanda */
    barber(raiz) {
      const SERVICOS = [["Corte", 50, 40], ["Barba", 40, 30], ["Corte + barba", 80, 60], ["Sobrancelha", 15, 15]];
      const CLUBE = ["Corte", "Barba"];
      const BARBEIROS = ["Bruno", "Diego", "Rafael"];
      const st = estado("barber", {
        clube: true,
        produtos: [{ n: "Pomada Matte", p: 45, est: 12, res: 1 }, { n: "Óleo de barba", p: 38, est: 4, res: 0 }, { n: "Shampoo de barba", p: 32, est: 9, res: 0 }],
        agenda: [
          { id: 1, h: "09:00", cli: "Lucas Almeida", s: "Corte", b: "Bruno", prod: [], status: "concluido", clube: true },
          { id: 2, h: "09:30", cli: "Pedro Santos", s: "Barba", b: "Diego", prod: [], status: "na cadeira", clube: false },
          { id: 3, h: "10:00", cli: "João Lima", s: "Corte + barba", b: "Rafael", prod: [[0, 1]], status: "agendado", clube: false },
        ],
        caixa: [{ cli: "Lucas Almeida", total: 0, b: "Bruno", com: 0 }],
        seq: 4,
      });
      const preco = (s) => SERVICOS.find((x) => x[0] === s)[1];
      const cobre = (s) => st.clube && CLUBE.includes(s);
      const livres = () => {
        const todos = [];
        for (let m = 9 * 60; m <= 18 * 60; m += 30) todos.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
        return todos.filter((h) => !st.agenda.some((a) => a.h === h && a.status !== "cancelado"));
      };
      const totalDe = (a) => (a.clube && CLUBE.includes(a.s) ? 0 : preco(a.s)) + a.prod.reduce((t, [i, q]) => t + st.produtos[i].p * q * (a.clube ? 0.9 : 1), 0);
      let rascunho = { s: "Corte", b: "Bruno", h: "", prod: {} };

      const ir = abas(raiz, ["App do cliente", "Agenda da barbearia", "Estoque e caixa"], (aba, p) => {
        if (aba === 0) {
          const hs = livres();
          if (!hs.includes(rascunho.h)) rascunho.h = hs[0] ?? "";
          p.innerHTML = `<div class="ta-dois">
            <div class="ta-card ta-form">
              <h4>O app do seu cliente</h4>
              <label class="ta-opcao"><input type="checkbox" data-clube ${st.clube ? "checked" : ""}> Sou assinante do Clube (corte ilimitado e 2 barbas)</label>
              <div class="ta-destaque"><small>⚡ O DE SEMPRE, EM UM TOQUE</small><b>Corte com Bruno · ${esc(hs[0] ?? "sem horário")}</b>
                <button class="btn btn-sm btn-primary" type="button" data-sempre ${hs.length ? "" : "disabled"}>Agendar o de sempre</button></div>
              <label>Serviço<select data-c="s">${SERVICOS.map(([n, v]) => `<option ${n === rascunho.s ? "selected" : ""} value="${n}">${n} · ${cobre(n) ? "incluído no clube" : brl(v)}</option>`).join("")}</select></label>
              <label>Barbeiro<select data-c="b">${BARBEIROS.map((n) => `<option ${n === rascunho.b ? "selected" : ""} value="${n}">${n}${n === "Bruno" ? " · seu barbeiro" : ""}</option>`).join("")}</select></label>
              <label>Horário de hoje<select data-c="h">${hs.map((h) => `<option ${h === rascunho.h ? "selected" : ""}>${h}</option>`).join("")}</select></label>
            </div>
            <div class="ta-card ta-form">
              <h4>Quer separar algum produto?</h4>
              <p class="muted ta-dica">Fica reservado e você paga junto com o corte.${st.clube ? " Assinante tem 10% de desconto." : ""}</p>
              ${st.produtos.map((x, i) => { const disp = x.est - x.res; return `<label class="ta-opcao">${esc(x.n)} · ${brl(x.p * (st.clube ? 0.9 : 1))} <small class="muted">(${disp} disponíveis)</small><input type="number" min="0" max="${disp}" value="${rascunho.prod[i] ?? 0}" data-prod="${i}" style="width:70px"></label>`; }).join("")}
              <p class="ta-previsao" data-resumo></p>
              <button class="btn btn-primary" type="button" data-confirmar ${hs.length ? "" : "disabled"}>Confirmar agendamento</button>
            </div></div>`;
          const resumo = () => {
            const a = { s: rascunho.s, clube: st.clube, prod: Object.entries(rascunho.prod).filter(([, q]) => q > 0).map(([i, q]) => [Number(i), q]) };
            p.querySelector("[data-resumo]").textContent = `${rascunho.s} com ${rascunho.b} às ${rascunho.h || "—"} · ${cobre(rascunho.s) ? "serviço pelo clube" : brl(preco(rascunho.s))}${a.prod.length ? ` · total com produtos ${brl(totalDe(a))}` : ""}`;
          };
          resumo();
          p.oninput = (e) => {
            if (e.target.dataset.c) rascunho[e.target.dataset.c] = e.target.value;
            if (e.target.dataset.prod !== undefined) rascunho.prod[e.target.dataset.prod] = Math.max(0, Math.min(Number(e.target.max), Number(e.target.value) || 0));
            if (e.target.matches("[data-clube]")) {
              st.clube = e.target.checked;
              salvar("barber", st);
              return ir(0);
            }
            if (e.target.dataset.c === "s") return ir(0);
            resumo();
          };
        } else if (aba === 1) {
          const lista = st.agenda.slice().sort((a, b) => a.h.localeCompare(b.h));
          p.innerHTML = tabela(["Hora", "Cliente", "Serviço", "Barbeiro", "Produtos", "Total", "Ação"], lista.map((a) => {
            const prod = a.prod.map(([i, q]) => `${q}× ${esc(st.produtos[i].n)}`).join(", ") || "—";
            const acao = a.status === "concluido" ? chip("Comanda fechada", "ok") : a.status === "cancelado" ? chip("Cancelado", "bad") : a.status === "na cadeira" ? `<button class="btn btn-sm btn-primary" type="button" data-fechar="${a.id}">Fechar comanda</button>` : `<button class="btn btn-sm btn-ghost" type="button" data-chegou="${a.id}">Chegou</button> <button class="btn btn-sm btn-ghost" type="button" data-cancelar="${a.id}">Cancelar</button>`;
            return [a.h, `${esc(a.cli)}${a.clube ? " " + chip("clube", "ok") : ""}${a.espera ? " " + chip("vaga relâmpago", "info") : ""}`, a.s, a.b, prod, a.clube && CLUBE.includes(a.s) && !a.prod.length ? "pelo clube" : brl(totalDe(a)), acao];
          })) + `<p class="muted ta-dica">Cancele um horário para ver a vaga relâmpago: o sistema oferece a vaga para até 3 pessoas da lista de espera no WhatsApp e quem confirmar primeiro leva.</p>`;
        } else {
          const fat = st.caixa.reduce((t, c) => t + c.total, 0);
          const com = st.caixa.reduce((t, c) => t + c.com, 0);
          p.innerHTML = kpis([["Faturado hoje", brl(fat)], ["Comissões", brl(com)], ["Atendimentos", st.caixa.length, "ok"], ["Clube", st.clube ? "1 assinante" : "0 assinantes"]]) +
            tabela(["Produto", "Preço", "Estoque", "Reservado no app", "Disponível"], st.produtos.map((x) => [esc(x.n), brl(x.p), x.est, x.res, x.est - x.res <= 3 ? chip(`${x.est - x.res} · estoque baixo`, "warn") : x.est - x.res])) +
            `<p class="muted ta-dica">Comissão de exemplo: 40% no serviço e 10% no produto. Na versão contratada, cada barbeiro tem o próprio percentual e login para ver a agenda e as comissões.</p>`;
        }
      });

      const agendar = (s, b, h) => {
        const prod = Object.entries(rascunho.prod).filter(([, q]) => q > 0).map(([i, q]) => [Number(i), q]);
        prod.forEach(([i, q]) => (st.produtos[i].res += q));
        st.agenda.push({ id: st.seq++, h, cli: "Você (cliente do app)", s, b, prod, status: "agendado", clube: st.clube });
        rascunho = { s: "Corte", b: "Bruno", h: "", prod: {} };
        salvar("barber", st);
        aviso(`Agendado: ${s} com ${b} às ${h}. Lembrete no WhatsApp antes do horário.`);
        ir(1);
      };
      raiz.addEventListener("click", (e) => {
        const t = e.target;
        if (t.closest("[data-sempre]")) return agendar("Corte", "Bruno", livres()[0]);
        if (t.closest("[data-confirmar]")) return rascunho.h && agendar(rascunho.s, rascunho.b, rascunho.h);
        const id = Number(t.closest("[data-chegou],[data-fechar],[data-cancelar]")?.dataset.chegou ?? t.closest("[data-fechar]")?.dataset.fechar ?? t.closest("[data-cancelar]")?.dataset.cancelar);
        const a = st.agenda.find((x) => x.id === id);
        if (!a) return;
        if (t.closest("[data-chegou]")) a.status = "na cadeira";
        else if (t.closest("[data-fechar]")) {
          a.status = "concluido";
          a.prod.forEach(([i, q]) => ((st.produtos[i].est -= q), (st.produtos[i].res -= q)));
          const serv = a.clube && CLUBE.includes(a.s) ? 0 : preco(a.s);
          const prodV = totalDe(a) - serv;
          st.caixa.push({ cli: a.cli, total: totalDe(a), b: a.b, com: serv * 0.4 + prodV * 0.1 });
          aviso(`Comanda fechada: ${brl(totalDe(a))}. Estoque baixado e comissão de ${a.b} calculada.`);
        } else {
          a.status = "cancelado";
          a.prod.forEach(([i, q]) => (st.produtos[i].res -= q));
          aviso("Vaga relâmpago enviada no WhatsApp para 3 pessoas da lista de espera…");
          setTimeout(() => {
            st.agenda.push({ id: st.seq++, h: a.h, cli: "Carlos Ribeiro", s: "Corte", b: a.b, prod: [], status: "agendado", clube: false, espera: true });
            salvar("barber", st);
            aviso(`Carlos Ribeiro confirmou primeiro e ficou com as ${a.h}.`);
            if (area.querySelector('[data-aba="1"][aria-selected="true"]')) ir(1);
          }, 2200);
        }
        salvar("barber", st);
        ir(1);
      });
      galeria(raiz, { telas: TELAS_BARBER, pasta: "barber", titulo: "Por dentro do Nexor Barber: telas reais do sistema", selo: "Sistema real · painel e app do cliente", dica: "Capturas do painel e do app com dados de demonstração (Barbearia Navalha é uma barbearia fictícia). Na versão contratada, é a sua barbearia aqui, com a sua marca.", nome: "Nexor Barber" });
    },

    /* Nexor Contábil: documentos chegando pelo WhatsApp, lidos pela IA, conferidos e cobrados */
    contabil(raiz) {
      const AMOSTRAS = [
        { arq: "nf-4510.pdf", cli: "Pão Dourado", tipo: "Nota fiscal de compra", emit: "Distribuidora Boa Massa", valor: 8430, deb: "Despesas a classificar", cred: "Fornecedores a pagar", alerta: "" },
        { arq: "extrato-outubro.pdf", cli: "Pão Dourado", tipo: "Extrato bancário", emit: "Sicoob · 3 movimentos", valor: 9290.4, deb: "Bancos conta movimento", cred: "Entradas a classificar", alerta: "" },
        { arq: "nota-de-outra-empresa.pdf", cli: "Mercado Bom Preço", tipo: "Nota fiscal de compra", emit: "Atacadão Exemplo", valor: 310, deb: "Despesas a classificar", cred: "Fornecedores a pagar", alerta: "O CNPJ do destinatário não é deste cliente" },
        { arq: "nf-4510.pdf", cli: "Pão Dourado", tipo: "Nota fiscal de compra", emit: "Distribuidora Boa Massa", valor: 8430, deb: "Despesas a classificar", cred: "Fornecedores a pagar", alerta: "Documento repetido: já recebido neste mês" },
      ];
      const CONTAS = ["Despesas a classificar", "Matéria-prima", "Mercadorias para revenda", "Material de uso e consumo", "Bancos conta movimento", "Entradas a classificar"];
      const st = estado("contabil", {
        docs: [],
        aprendeu: {},
        pend: [
          { cli: "Pão Dourado", doc: "Variáveis da folha", prazo: "25/10 · atrasado", ok: false, cob: 1 },
          { cli: "Pão Dourado", doc: "Comprovantes de despesas", prazo: "05/11", ok: false, cob: 0 },
          { cli: "Base Forte", doc: "Extrato bancário do mês", prazo: "05/11", ok: false, cob: 0 },
          { cli: "Clínica Sorriso", doc: "Relatório de faturamento", prazo: "03/11 · atrasado", ok: false, cob: 2 },
        ],
        obr: [
          { o: "ISS municipal", cli: "Clínica Sorriso", interno: "06/11", legal: "10/11", feito: false },
          { o: "DCTFWeb", cli: "Pão Dourado", interno: "10/11", legal: "13/11", feito: false },
          { o: "eSocial: fechamento da folha", cli: "Mercado Bom Preço", interno: "10/11", legal: "13/11", feito: false },
          { o: "EFD-Reinf", cli: "Base Forte", interno: "10/11", legal: "13/11", feito: false },
          { o: "DARF da folha (INSS e IRRF)", cli: "Pão Dourado", interno: "16/11", legal: "19/11", feito: false },
        ],
        n: 0,
      });
      const ir = abas(raiz, ["Documentos chegando", "Cobrança de documentos", "Obrigações e prazos"], (aba, p) => {
        if (aba === 0) {
          const prox = AMOSTRAS[st.n % AMOSTRAS.length];
          p.innerHTML = `<div class="ta-card"><h4>Simule o cliente mandando um documento pelo WhatsApp</h4>
            <p class="muted ta-dica">Próximo: <b>${esc(prox.arq)}</b> de ${esc(prox.cli)}. A IA lê, confere e prepara o pré-lançamento. O contador sempre confere antes de exportar.</p>
            <button class="btn btn-primary" type="button" data-receber>Receber documento</button></div>` +
            tabela(["Arquivo", "Cliente", "Leitura da IA", "Pré-lançamento", "Situação"], st.docs.slice().reverse().map((d, k) => {
              const i = st.docs.length - 1 - k;
              if (d.lendo) return [esc(d.arq), esc(d.cli), chip("lendo com IA…", "info"), "—", "—"];
              const leitura = `${esc(d.tipo)} · ${esc(d.emit)} · ${brl(d.valor)}${d.alerta ? `<br>${chip(d.alerta, "warn")}` : ""}${d.aprendido ? `<br>${chip("conta aprendida com você", "ok")}` : ""}`;
              const lanc = d.status === "rejeitado" ? "—" : `D: <select data-conta="${i}" ${d.status === "conferido" ? "disabled" : ""}>${CONTAS.map((c) => `<option ${c === d.deb ? "selected" : ""}>${c}</option>`).join("")}</select><br><small class="muted">C: ${esc(d.cred)}</small>`;
              const acao = d.status === "conferido" ? chip("Conferido", "ok") : d.status === "rejeitado" ? chip("Rejeitado", "bad") : `<button class="btn btn-sm btn-primary" type="button" data-conferir="${i}">Conferido</button> <button class="btn btn-sm btn-ghost" type="button" data-rejeitar="${i}">Rejeitar</button>`;
              return [esc(d.arq), esc(d.cli), leitura, lanc, acao];
            }), "Nenhum documento recebido ainda. Clique em Receber documento.") +
            `<p class="muted ta-dica">Troque a conta de débito de uma nota e confira: na próxima nota do mesmo fornecedor, a IA já sugere a conta que você escolheu.</p>`;
        } else if (aba === 1) {
          p.innerHTML = tabela(["Cliente", "Documento", "Prazo", "Lembretes enviados", "Ação"], st.pend.map((x, i) => [esc(x.cli), esc(x.doc), x.prazo.includes("atrasado") && !x.ok ? chip(x.prazo, "bad") : x.prazo, x.cob, x.ok ? chip("Recebido", "ok") : `<button class="btn btn-sm btn-primary" type="button" data-cobrar="${i}">Cobrar agora</button> <button class="btn btn-sm btn-ghost" type="button" data-recebido="${i}">Recebido</button>`])) +
            `<div class="ta-card" data-previa-cobranca hidden><h4>Mensagem enviada no WhatsApp do escritório</h4><div class="ta-chat" style="height:auto"><div class="ta-msgs"><p class="out" data-texto></p></div></div></div>
            <p class="muted ta-dica">Na versão contratada a régua roda sozinha: lembra antes do prazo e depois a cada poucos dias, por WhatsApp e e-mail, até o documento chegar.</p>`;
        } else {
          const abertas = st.obr.filter((o) => !o.feito).length;
          p.innerHTML = kpis([["Em aberto", abertas, abertas ? "warn" : "ok"], ["Concluídas", st.obr.length - abertas, "ok"], ["Vencem esta semana", st.obr.filter((o) => !o.feito && o.legal <= "13/11").length], ["Atrasadas", 0, "ok"]]) +
            tabela(["Prazo interno", "Obrigação", "Cliente", "Vencimento legal", "Ação"], st.obr.map((o, i) => [o.interno, esc(o.o), esc(o.cli), o.legal, o.feito ? chip("Concluída", "ok") : `<button class="btn btn-sm btn-primary" type="button" data-concluir="${i}">Concluir</button>`])) +
            `<p class="muted ta-dica">As tarefas de cada competência são geradas sozinhas pelo regime de cada cliente, com feriados e dias úteis. O escritório confere o catálogo de prazos no início do ano.</p>`;
        }
      });
      raiz.addEventListener("change", (e) => {
        const s = e.target.closest("[data-conta]");
        if (!s) return;
        const d = st.docs[Number(s.dataset.conta)];
        d.deb = s.value;
        st.aprendeu[d.emit] = s.value;
        salvar("contabil", st);
        aviso(`Anotado: notas de ${d.emit} vão sugerir ${s.value}.`);
      });
      raiz.addEventListener("click", (e) => {
        const t = e.target;
        if (t.closest("[data-receber]")) {
          const a = { ...AMOSTRAS[st.n++ % AMOSTRAS.length], status: "a conferir", lendo: true };
          if (st.aprendeu[a.emit]) (a.deb = st.aprendeu[a.emit]), (a.aprendido = true);
          st.docs.push(a);
          salvar("contabil", st);
          ir(0);
          setTimeout(() => {
            a.lendo = false;
            salvar("contabil", st);
            if (area.querySelector('[data-aba="0"][aria-selected="true"]')) ir(0);
          }, 1300);
          return;
        }
        const conf = t.closest("[data-conferir]"), rej = t.closest("[data-rejeitar]");
        if (conf || rej) {
          st.docs[Number((conf ?? rej).dataset[conf ? "conferir" : "rejeitar"])].status = conf ? "conferido" : "rejeitado";
          salvar("contabil", st);
          aviso(conf ? "Conferido. O lançamento entra na próxima exportação para o sistema contábil." : "Rejeitado. Não gera lançamento.");
          return ir(0);
        }
        const cob = t.closest("[data-cobrar]"), rec = t.closest("[data-recebido]");
        if (cob || rec) {
          const x = st.pend[Number((cob ?? rec).dataset[cob ? "cobrar" : "recebido"])];
          if (cob) x.cob++;
          else x.ok = true;
          salvar("contabil", st);
          ir(1);
          if (cob) {
            const box = raiz.querySelector("[data-previa-cobranca]");
            box.hidden = false;
            box.querySelector("[data-texto]").textContent = `Olá! Aqui é o escritório Lima Contabilidade. Para fecharmos o mês da ${x.cli}, ainda falta: ${x.doc} (prazo ${x.prazo.replace(" · atrasado", "")}). Pode enviar por aqui mesmo, é só mandar a foto ou o PDF. Obrigado!`;
          }
          return;
        }
        const c = t.closest("[data-concluir]");
        if (c) {
          st.obr[Number(c.dataset.concluir)].feito = true;
          salvar("contabil", st);
          aviso("Concluída. Guia entregue no portal do cliente e aviso enviado.");
          ir(2);
        }
      });
      galeria(raiz, { telas: TELAS_CONTABIL, pasta: "contabil", titulo: "Por dentro do Nexor Contábil: telas reais do sistema", selo: "Sistema real · painel e portal do cliente", dica: "Capturas do sistema com dados de demonstração (Lima Contabilidade e os clientes são fictícios). Na versão contratada, é o seu escritório aqui, com a sua marca.", vertical: ["celular"], nome: "Nexor Contábil" });
    },

    /* Nexor Agente: converse com a sua IA, peça uma ação e aprove (simulação no navegador) */
    agente(raiz) {
      const JEITOS = { direto: "Direto ao ponto", formal: "Formal", leve: "Descontraído" };
      const st = estado("agente", { nome: "Luna", jeito: "leve", trato: "", memorias: ["O fornecedor de água é a Distribuidora Fonte Clara"], estoque: { "água 500 ml": 312, "refrigerante 2 L": 85, "suco 1 L": 40 }, pedidos: [{ n: 1201, cli: "Padaria Pão Dourado", item: "água 500 ml", q: 20, st: "Em separação" }], msgs: [], audit: [], outro: false, pendente: null, seq: 1202 });
      raiz.innerHTML = `
        <div class="ta-dois">
          <div class="ta-card ta-form" data-perfil>
            <h4>1. A sua IA, do seu jeito</h4>
            <label>Nome do agente<input name="nome" value="${esc(st.nome)}" maxlength="20"></label>
            <label>Jeito de falar<select name="jeito">${Object.entries(JEITOS).map(([k, v]) => `<option value="${k}" ${k === st.jeito ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label class="ta-opcao"><input type="checkbox" name="outro" ${st.outro ? "checked" : ""}> Testar como outro número (não autorizado)</label>
            <p class="muted ta-dica">Na versão contratada, isso também se ensina pelo próprio WhatsApp: "a partir de agora me chame de chefe".</p>
            <h4>Memórias</h4><ul class="ta-lista" data-memorias></ul>
          </div>
          <div class="ta-card ta-celular">
            <h4>2. Peça pelo WhatsApp</h4>
            <div class="ta-chat">
              <div class="ta-chat-topo"><span class="ta-av" data-av></span><div><b data-nome></b><small>● sua IA pessoal</small></div></div>
              <div class="ta-msgs" aria-live="polite"></div>
              <div class="ta-sugs">${["Quantas caixas de água temos?", "Cria um pedido de 40 caixas de água para o Mercado Bom Preço", "Quais pedidos estão em aberto?", "Me chame de chefe", "Lembre: a reunião com o contador é dia 10"].map((s) => `<button type="button">${s}</button>`).join("")}</div>
              <form class="ta-envio"><input aria-label="Mensagem" placeholder="Peça algo para a sua IA…" maxlength="300"><button class="btn btn-sm btn-primary" type="submit">Enviar</button></form>
            </div>
            <p class="muted ta-dica">Simulação no seu navegador, com um estoque e pedidos de exemplo. Na versão contratada, a IA entende qualquer pedido e consulta os sistemas reais da sua empresa.</p>
          </div>
        </div>
        <section class="ta-card"><h4>3. Auditoria: tudo que foi pedido, aprovado e executado</h4><div data-audit></div></section>`;
      const msgs = raiz.querySelector(".ta-msgs");
      const perfilForm = raiz.querySelector("[data-perfil]");
      const pintarPerfil = () => {
        raiz.querySelector("[data-nome]").textContent = `${st.nome} · Nexor Agente`;
        raiz.querySelector("[data-av]").textContent = st.nome[0] ?? "L";
        raiz.querySelector("[data-memorias]").innerHTML = st.memorias.map((m) => `<li>${esc(m)}</li>`).join("") || "<li class=\"muted\">Nenhuma ainda.</li>";
        raiz.querySelector("[data-audit]").innerHTML = tabela(["Quando", "Quem", "Pedido", "Resultado"], st.audit.slice().reverse().map((a) => [dataCurta(a.t), a.quem, esc(a.pedido), chip(a.res, a.tom)]), "Nada registrado ainda. Peça um pedido e aprove ou recuse.");
      };
      const balao = (de, texto, botoes) => {
        const p = document.createElement("p");
        p.className = de === "eu" ? "in" : "out";
        p.textContent = texto;
        if (botoes) {
          const b = document.createElement("span");
          b.className = "ta-aprovar";
          b.innerHTML = `<button class="btn btn-sm btn-primary" type="button" data-aprovar>Aprovar</button><button class="btn btn-sm btn-ghost" type="button" data-recusar>Recusar</button>`;
          p.appendChild(b);
        }
        msgs.appendChild(p);
        msgs.scrollTop = msgs.scrollHeight;
      };
      const fala = (t) => {
        const c = st.trato ? `, ${st.trato}` : "";
        if (st.jeito === "formal") return t.replace(/^Pronto!?/, "Concluído.").replace("{c}", c);
        if (st.jeito === "direto") return t.replace(/ ?😊|✅|👍/g, "").replace("{c}", c);
        return t.replace("{c}", c);
      };
      const auditar = (pedido, res, tom) => st.audit.push({ t: Date.now(), quem: st.outro ? "(34) 98888-0000" : "Você (dono)", pedido, res, tom });
      const responder = (texto) => {
        const q = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (st.outro) {
          auditar(texto, "Recusado: número não autorizado", "bad");
          return "Desculpe, só as pessoas autorizadas pela empresa podem me dar ordens. Nada foi alterado.";
        }
        const item = Object.keys(st.estoque).find((k) => q.includes(k.split(" ")[0].normalize("NFD").replace(/[̀-ͯ]/g, ""))) ?? "água 500 ml";
        let m;
        if ((m = q.match(/me chame de ([\wáéíóúãõç ]{2,20})/))) {
          st.trato = texto.slice(texto.toLowerCase().indexOf("me chame de") + 12).trim().replace(/[.!]+$/, "");
          return fala(`Combinado{c}. A partir de agora vou te chamar assim.`);
        }
        if ((m = q.match(/^(lembre|lembra|anote|guarde)[:,]?\s*(.+)/))) {
          const mem = texto.replace(/^\s*\S+[:,]?\s*/, "");
          st.memorias.push(mem.charAt(0).toUpperCase() + mem.slice(1));
          auditar(texto, "Memória guardada", "info");
          return fala("Anotado nas minhas memórias{c} ✅");
        }
        if (/(cria|criar|faz|fazer|lanca|lancar).*(pedido)/.test(q)) {
          const qtd = Number(q.match(/(\d+)/)?.[1] ?? 10);
          const cli = (texto.match(/para (o |a )?(.+)$/i)?.[2] ?? "Cliente").replace(/[.!?]+$/, "");
          st.pendente = { cli, item, q: qtd };
          auditar(texto, "Aguardando aprovação", "warn");
          return { texto: fala(`🔐 Confirma{c}? Criar pedido de ${qtd} caixas de ${item} para ${cli} no ERP. Estoque atual: ${st.estoque[item]}. O pedido expira em 30 minutos.`), botoes: true };
        }
        if (/(pedido|pedidos).*(aberto|andamento|pendente)|em aberto/.test(q)) {
          const ab = st.pedidos.filter((p) => p.st !== "Entregue");
          return fala(ab.length ? `Pedidos em aberto{c}:\n${ab.map((p) => `#${p.n} · ${p.q}× ${p.item} · ${p.cli} · ${p.st}`).join("\n")}` : "Nenhum pedido em aberto{c}.");
        }
        if (/(quant|estoque|tem|temos|saldo)/.test(q)) {
          auditar(texto, "Consulta ao estoque", "info");
          return fala(`Temos ${st.estoque[item]} caixas de ${item} no estoque central{c}.`);
        }
        if (/(fornecedor|contato)/.test(q)) return fala(st.memorias.find((x) => /fornecedor/i.test(x)) ?? "Ainda não sei. Quer que eu anote?");
        return fala("Na simulação eu entendo estoque, pedidos, memórias e o jeito de falar{c}. Na versão contratada, entendo qualquer pedido e uso os sistemas da sua empresa.");
      };
      const enviar = async (texto) => {
        texto = texto.trim();
        if (!texto) return;
        balao("eu", texto);
        await new Promise((r) => setTimeout(r, 600));
        const r = responder(texto);
        typeof r === "string" ? balao("ia", r) : balao("ia", r.texto, r.botoes);
        st.msgs = [];
        salvar("agente", st);
        pintarPerfil();
      };
      if (!st.msgs.length) balao("ia", fala(`Oi! Eu sou a ${st.nome}, sua IA pessoal. Posso consultar o estoque, criar pedidos com a sua aprovação e guardar o que você me ensinar.`));
      pintarPerfil();
      perfilForm.addEventListener("input", (e) => {
        if (e.target.name === "nome") st.nome = e.target.value.trim() || "Luna";
        if (e.target.name === "jeito") st.jeito = e.target.value;
        if (e.target.name === "outro") st.outro = e.target.checked;
        salvar("agente", st);
        pintarPerfil();
      });
      raiz.querySelector(".ta-envio").addEventListener("submit", (e) => {
        e.preventDefault();
        const campo = e.target.querySelector("input");
        enviar(campo.value);
        campo.value = "";
      });
      raiz.querySelector(".ta-sugs").addEventListener("click", (e) => e.target.matches("button") && enviar(e.target.textContent));
      msgs.addEventListener("click", (e) => {
        const ap = e.target.closest("[data-aprovar]"), rc = e.target.closest("[data-recusar]");
        if (!ap && !rc) return;
        e.target.closest(".ta-aprovar").remove();
        const p = st.pendente;
        if (!p) return balao("ia", "Esse pedido já expirou ou foi usado.");
        st.pendente = null;
        if (ap) {
          st.estoque[p.item] = Math.max(0, st.estoque[p.item] - p.q);
          st.pedidos.push({ n: st.seq++, cli: p.cli, item: p.item, q: p.q, st: "Em separação" });
          auditar(`Pedido de ${p.q}× ${p.item} para ${p.cli}`, `Aprovado e criado: #${st.seq - 1}`, "ok");
          balao("ia", fala(`Pronto! Pedido #${st.seq - 1} criado no ERP{c}. Estoque de ${p.item}: ${st.estoque[p.item]}.`));
        } else {
          auditar(`Pedido de ${p.q}× ${p.item} para ${p.cli}`, "Recusado pelo dono", "bad");
          balao("ia", fala("Tudo bem{c}, não criei nada."));
        }
        salvar("agente", st);
        pintarPerfil();
      });
    },

    /* Nexor Commerce: loja, carrinho, Pix e marketplaces */
    commerce(raiz) {
      const st = estado("commerce", {
        produtos: [
          { n: "Camiseta Básica", p: 79.9 },
          { n: "Tênis Casual", p: 249.9 },
          { n: "Boné Aba Curva", p: 59.9 },
          { n: "Mochila Urbana", p: 189.9 },
        ],
        carrinho: [],
        pedidos: [],
        canais: { "Mercado Livre": false, Shopee: false, Amazon: false, Magalu: false },
      });
      const loja = NX.ler("nx-teste-perfil", {}).empresa ?? "Minha Loja";
      const total = () => st.carrinho.reduce((s, i) => s + st.produtos[i].p, 0);
      const ir = abas(raiz, ["Loja", `Pedidos`, "Marketplaces", "Produtos"], (aba, p) => {
        if (aba === 0) {
          p.innerHTML = `<div class="ta-dois larga">
            <div class="ta-card"><div class="ta-loja-topo"><b>${esc(loja)}</b><span class="muted">loja.${esc(loja.toLowerCase().replace(/[^a-z0-9]+/g, ""))}.com.br</span></div>
              <div class="ta-produtos">${st.produtos.map((x, i) => `<div class="ta-prod"><div class="ta-img" style="--h:${i * 50}deg"></div><b>${esc(x.n)}</b><span>${brl(x.p)}</span><button class="btn btn-sm btn-ghost" type="button" data-add="${i}">Adicionar</button></div>`).join("")}</div></div>
            <div class="ta-card ta-carrinho"><h4>Carrinho (${st.carrinho.length})</h4>
              ${st.carrinho.length ? st.carrinho.map((i, k) => `<div class="ta-linha"><span>${esc(st.produtos[i].n)}</span><b>${brl(st.produtos[i].p)}</b><button type="button" class="ta-x" data-rem="${k}" aria-label="Remover">×</button></div>`).join("") : '<p class="muted">Adicione produtos para testar a compra.</p>'}
              <div class="ta-linha tot"><span>Total</span><b>${brl(total())}</b></div>
              <button class="btn btn-primary btn-block" type="button" data-pix ${st.carrinho.length ? "" : "disabled"}>Pagar com Pix</button>
              <div class="ta-pix" hidden><div class="ta-qr">${Array.from({ length: 121 }, (_, i) => `<i class="${(i * 13 + (i % 7)) % 3 ? "" : "on"}"></i>`).join("")}</div><p class="muted">Pix de ${brl(total())}</p><button class="btn btn-whats btn-block" type="button" data-pagar>Simular pagamento aprovado</button></div>
            </div></div>`;
        } else if (aba === 1) {
          p.innerHTML = kpis([["Pedidos", st.pedidos.length], ["Faturado", brl(st.pedidos.reduce((s, x) => s + x.v, 0))], ["Ticket médio", brl(st.pedidos.length ? st.pedidos.reduce((s, x) => s + x.v, 0) / st.pedidos.length : 0)]]) + tabela(["Pedido", "Quando", "Canal", "Valor", "Status"], st.pedidos.slice().reverse().map((x) => [`#${x.id}`, dataCurta(x.t), esc(x.c), brl(x.v), chip("Pago", "ok")]), "Faça uma compra na aba Loja para ver o pedido chegar aqui.");
        } else if (aba === 2) {
          p.innerHTML = `<div class="ta-card"><h4>Venda nos marketplaces com o mesmo estoque</h4><p class="muted">Ative um canal e veja seus ${st.produtos.length} produtos serem publicados.</p><div class="ta-canais">${Object.entries(st.canais).map(([n, on]) => `<label class="ta-canal"><input type="checkbox" data-canal="${n}" ${on ? "checked" : ""}><span><b>${n}</b><small data-status="${n}">${on ? `${st.produtos.length} produtos publicados · estoque sincronizado` : "desligado"}</small></span></label>`).join("")}</div></div>`;
        } else {
          p.innerHTML = `<div class="ta-card"><h4>Cadastrar produto</h4><form class="ta-inline" data-novo><input name="n" placeholder="Nome do produto" required maxlength="40"><input name="p" type="number" step="0.01" min="1" placeholder="Preço" required><button class="btn btn-sm btn-primary">Cadastrar</button></form></div>` + tabela(["Produto", "Preço"], st.produtos.map((x) => [esc(x.n), brl(x.p)]));
        }
      });
      raiz.addEventListener("click", (e) => {
        const add = e.target.closest("[data-add]");
        const rem = e.target.closest("[data-rem]");
        if (add) {
          st.carrinho.push(Number(add.dataset.add));
          salvar("commerce", st);
          ir(0);
        } else if (rem) {
          st.carrinho.splice(Number(rem.dataset.rem), 1);
          salvar("commerce", st);
          ir(0);
        } else if (e.target.closest("[data-pix]")) {
          raiz.querySelector(".ta-pix").hidden = false;
          e.target.closest("[data-pix]").hidden = true;
        } else if (e.target.closest("[data-pagar]")) {
          const canais = ["Loja própria", ...Object.keys(st.canais).filter((c) => st.canais[c])];
          st.pedidos.push({ id: 1000 + st.pedidos.length + 1, t: Date.now(), v: total(), c: canais[st.pedidos.length % canais.length] });
          st.carrinho = [];
          salvar("commerce", st);
          aviso("Pagamento aprovado! O pedido já está na aba Pedidos.");
          ir(0);
        }
      });
      raiz.addEventListener("change", (e) => {
        const n = e.target.dataset.canal;
        if (!n) return;
        st.canais[n] = e.target.checked;
        salvar("commerce", st);
        const status = raiz.querySelector(`[data-status="${n}"]`);
        status.textContent = e.target.checked ? "sincronizando…" : "desligado";
        if (e.target.checked) setTimeout(() => (status.textContent = `${st.produtos.length} produtos publicados · estoque sincronizado`), 1200);
      });
      raiz.addEventListener("submit", (e) => {
        if (!e.target.matches("[data-novo]")) return;
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        st.produtos.push({ n: d.n, p: Number(d.p) });
        salvar("commerce", st);
        ir(3);
      });
    },

    /* Nexor Gestão: vendas, despesas e painel */
    gestao(raiz) {
      const dia = 86400_000;
      const hoje = new Date().setHours(12, 0, 0, 0);
      const st = estado("gestao", {
        vendas: [[6, "Mercado Bom Preço", 1280], [5, "Clínica Vida", 860], [4, "Grupo Atlas", 2150], [3, "Loja Prisma", 540], [2, "TechNova", 1720], [1, "Rede Sol", 990], [0, "Inova Log", 1430]].map(([d, c, v]) => ({ t: hoje - d * dia, c, v })),
        despesas: [{ t: hoje - 5 * dia, c: "Aluguel", v: 2200 }, { t: hoje - 2 * dia, c: "Internet", v: 189 }, { t: hoje - 1 * dia, c: "Fornecedor", v: 1350 }],
      });
      const soma = (l) => l.reduce((s, x) => s + x.v, 0);
      const ir = abas(raiz, ["Painel", "Lançar venda ou despesa", "Movimentações"], (aba, p) => {
        if (aba === 0) {
          const fat = soma(st.vendas);
          const desp = soma(st.despesas);
          const dias = Array.from({ length: 7 }, (_, i) => {
            const t = hoje - (6 - i) * dia;
            return { rotulo: new Date(t).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), v: soma(st.vendas.filter((x) => new Date(x.t).toDateString() === new Date(t).toDateString())) };
          });
          const max = Math.max(1, ...dias.map((d) => d.v));
          p.innerHTML = kpis([["Faturamento", brl(fat)], ["Despesas", brl(desp)], ["Lucro", brl(fat - desp), fat - desp >= 0 ? "ok" : "bad"], ["Ticket médio", brl(st.vendas.length ? fat / st.vendas.length : 0)]]) +
            `<div class="ta-card"><h4>Vendas dos últimos 7 dias</h4><div class="ta-grafico">${dias.map((d) => `<div title="${brl(d.v)}"><i style="--h:${(d.v / max) * 100}%"></i><b>${d.v ? (d.v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : "0"}</b><small>${d.rotulo}</small></div>`).join("")}</div></div>`;
        } else if (aba === 1) {
          p.innerHTML = `<div class="ta-dois">
            <form class="ta-card ta-form" data-tipo="vendas"><h4>Nova venda</h4><label>Cliente<input name="c" required maxlength="50" placeholder="Ex.: Padaria Central"></label><label>Valor (R$)<input name="v" type="number" step="0.01" min="1" required></label><button class="btn btn-primary">Lançar venda</button></form>
            <form class="ta-card ta-form" data-tipo="despesas"><h4>Nova despesa</h4><label>Descrição<input name="c" required maxlength="50" placeholder="Ex.: Energia"></label><label>Valor (R$)<input name="v" type="number" step="0.01" min="1" required></label><button class="btn btn-ghost">Lançar despesa</button></form>
          </div><p class="muted ta-dica">Lance uma venda e veja o painel atualizar na hora.</p>`;
        } else {
          const mov = [...st.vendas.map((x) => ({ ...x, tipo: "Venda" })), ...st.despesas.map((x) => ({ ...x, tipo: "Despesa" }))].sort((a, b) => b.t - a.t);
          p.innerHTML = tabela(["Data", "Tipo", "Descrição", "Valor"], mov.map((x) => [dataCurta(x.t), chip(x.tipo, x.tipo === "Venda" ? "ok" : "warn"), esc(x.c), brl(x.v)]));
        }
      });
      raiz.addEventListener("submit", (e) => {
        const tipo = e.target.dataset.tipo;
        if (!tipo) return;
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        st[tipo].push({ t: Date.now(), c: d.c, v: Number(d.v) });
        salvar("gestao", st);
        aviso(tipo === "vendas" ? "Venda lançada. Veja o painel!" : "Despesa lançada.");
        ir(0);
      });
    },

    /* Nexor Site Pro: monte o site e veja a prévia ao vivo */
    sitepro(raiz) {
      const p0 = NX.ler("nx-teste-perfil", {});
      const st = estado("sitepro", { nome: p0.empresa ?? "Minha Empresa", slogan: "Qualidade e atendimento que fazem a diferença", cor: "#2f8bff", servicos: "Atendimento personalizado\nEntrega rápida\nGarantia de satisfação", whats: p0.telefone ?? "" });
      const cores = ["#2f8bff", "#14b8a6", "#8b5cf6", "#f97316", "#e11d48", "#16a34a"];
      raiz.innerHTML = `<div class="ta-dois larga">
        <form class="ta-card ta-form" data-site>
          <h4>Monte o seu site</h4>
          <label>Nome da empresa<input name="nome" value="${esc(st.nome)}" maxlength="40"></label>
          <label>Frase principal<input name="slogan" value="${esc(st.slogan)}" maxlength="90"></label>
          <fieldset class="ta-cores"><legend>Cor da marca</legend>${cores.map((c) => `<label><input type="radio" name="cor" value="${c}" ${c === st.cor ? "checked" : ""}><span style="background:${c}"></span></label>`).join("")}</fieldset>
          <label>Serviços (um por linha)<textarea name="servicos" rows="4" maxlength="300">${esc(st.servicos)}</textarea></label>
          <label>WhatsApp<input name="whats" value="${esc(st.whats)}" maxlength="20"></label>
        </form>
        <div class="ta-card"><div class="ta-dispositivos"><button type="button" aria-pressed="true" data-disp="pc">Computador</button><button type="button" aria-pressed="false" data-disp="cel">Celular</button></div><div class="ta-previa" data-previa></div></div>
      </div>`;
      const previa = raiz.querySelector("[data-previa]");
      const desenhar = () => {
        const servicos = st.servicos.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6);
        previa.style.setProperty("--c", st.cor);
        previa.innerHTML = `<div class="sp-nav"><b>${esc(st.nome)}</b><span>Início</span><span>Serviços</span><span>Contato</span></div>
          <div class="sp-hero"><small>Bem-vindo(a)</small><h5>${esc(st.slogan)}</h5><span class="sp-btn">Chamar no WhatsApp</span></div>
          <div class="sp-servs">${servicos.map((s) => `<div><i></i><b>${esc(s)}</b></div>`).join("")}</div>
          <div class="sp-rodape">${esc(st.nome)} · ${esc(st.whats || "(00) 00000-0000")}</div>`;
      };
      raiz.querySelector("[data-site]").addEventListener("input", (e) => {
        Object.assign(st, Object.fromEntries(new FormData(e.currentTarget)));
        salvar("sitepro", st);
        desenhar();
      });
      raiz.querySelector(".ta-dispositivos").addEventListener("click", (e) => {
        const b = e.target.closest("[data-disp]");
        if (!b) return;
        raiz.querySelectorAll("[data-disp]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        previa.classList.toggle("cel", b.dataset.disp === "cel");
      });
      desenhar();
    },

    /* Nexor Automação: a IA lê um documento e lança os dados */
    automacao(raiz) {
      const AMOSTRAS = {
        "Nota fiscal": "NOTA FISCAL ELETRÔNICA Nº 4521\nFornecedor: Alfa Distribuidora Ltda\nCNPJ: 12.345.678/0001-90\nEmissão: 28/10/2026\nValor total: R$ 4.280,50\nVencimento: 15/11/2026",
        "Boleto": "BOLETO BANCÁRIO\nBeneficiário: Energia Forte S/A\nCNPJ: 98.765.432/0001-10\nValor do documento: R$ 1.932,17\nVencimento: 10/11/2026\nNosso número: 000789456",
        "Contrato": "CONTRATO DE PRESTAÇÃO DE SERVIÇOS Nº 2026-118\nContratante: Grupo Atlas Logística\nCNPJ: 45.678.912/0001-33\nValor mensal: R$ 12.500,00\nInício: 01/11/2026\nVigência: 12 meses",
      };
      const st = estado("automacao", { lancados: [] });
      raiz.innerHTML = `<div class="ta-dois larga">
        <div class="ta-card ta-form"><h4>1. Escolha ou cole um documento</h4><div class="ta-chips">${Object.keys(AMOSTRAS).map((k, i) => `<button type="button" aria-pressed="${i === 0}" data-amostra="${k}">${k}</button>`).join("")}</div>
          <textarea rows="9" data-doc aria-label="Texto do documento">${AMOSTRAS["Nota fiscal"]}</textarea>
          <button class="btn btn-primary" type="button" data-rodar>Processar com IA</button></div>
        <div class="ta-card"><h4>2. Acompanhe a automação</h4><ol class="ta-etapas">${["Documento recebido", "Leitura do texto (OCR)", "IA identifica os campos", "Validação de CNPJ e valores", "Lançado no sistema"].map((e) => `<li>${e}</li>`).join("")}</ol><div data-resultado></div></div>
      </div><div class="ta-card"><h4>Lançados no sistema</h4><div data-lancados></div></div>`;
      const lista = () => (raiz.querySelector("[data-lancados]").innerHTML = tabela(["Quando", "Tipo", "Empresa", "CNPJ", "Valor", "Vencimento"], st.lancados.slice().reverse().map((x) => [dataCurta(x.t), esc(x.tipo), esc(x.empresa), esc(x.cnpj), esc(x.valor), esc(x.data)]), "Processe um documento para ver o lançamento automático."));
      lista();
      const doc = raiz.querySelector("[data-doc]");
      let tipo = "Nota fiscal";
      raiz.querySelector(".ta-chips").addEventListener("click", (e) => {
        const b = e.target.closest("[data-amostra]");
        if (!b) return;
        tipo = b.dataset.amostra;
        raiz.querySelectorAll("[data-amostra]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        doc.value = AMOSTRAS[tipo];
      });
      raiz.querySelector("[data-rodar]").addEventListener("click", async (e) => {
        const botao = e.currentTarget;
        botao.disabled = true;
        const etapas = [...raiz.querySelectorAll(".ta-etapas li")];
        etapas.forEach((li) => (li.className = ""));
        raiz.querySelector("[data-resultado]").innerHTML = "";
        for (const li of etapas) {
          li.className = "ativa";
          await new Promise((r) => setTimeout(r, 550));
          li.className = "feita";
        }
        const t = doc.value;
        const linha = (...rotulos) => {
          for (const r of rotulos) {
            const m = t.match(new RegExp(`${r}\\s*:?\\s*(.+)`, "i"));
            if (m) return m[1].trim();
          }
          return "não encontrado";
        };
        const x = {
          t: Date.now(),
          tipo,
          empresa: linha("Fornecedor", "Beneficiário", "Contratante", "Cliente", "Empresa"),
          cnpj: (t.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) ?? ["não encontrado"])[0],
          valor: (t.match(/R\$\s?[\d.]+,\d{2}/) ?? ["não encontrado"])[0],
          data: linha("Vencimento", "Início", "Data"),
        };
        st.lancados.push(x);
        salvar("automacao", st);
        raiz.querySelector("[data-resultado]").innerHTML = `<div class="ta-extrato">${[["Empresa", x.empresa], ["CNPJ", x.cnpj], ["Valor", x.valor], ["Data", x.data]].map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join("")}</div>`;
        lista();
        botao.disabled = false;
      });
    },

    /* Nexor Sob Medida: app de agendamento */
    sobmedida(raiz) {
      const st = estado("sobmedida", { agenda: [] });
      const servicos = [["Corte", 50], ["Barba", 35], ["Corte + barba", 75], ["Hidratação", 60]];
      // Próximos 5 dias de funcionamento (sem domingo)
      const dias = Array.from({ length: 8 }, (_, i) => new Date(Date.now() + (i + 1) * 86400_000))
        .filter((d) => d.getDay() !== 0)
        .slice(0, 5)
        .map((d) => d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", ""));
      const horas = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"];
      const esc2 = { servico: 0, dia: 0, hora: null };
      const desenhar = () => {
        const ocupado = (h) => st.agenda.some((a) => a.dia === dias[esc2.dia] && a.hora === h);
        raiz.innerHTML = `<div class="ta-dois">
          <div class="ta-card ta-app"><div class="ta-app-tela"><small>Olá! 👋</small><h5>Agende seu horário</h5>
            <p class="ta-rotulo">Serviço</p><div class="ta-chips">${servicos.map(([n, v], i) => `<button type="button" aria-pressed="${i === esc2.servico}" data-serv="${i}">${n} · ${brl(v)}</button>`).join("")}</div>
            <p class="ta-rotulo">Dia</p><div class="ta-chips">${dias.map((d, i) => `<button type="button" aria-pressed="${i === esc2.dia}" data-dia="${i}">${d}</button>`).join("")}</div>
            <p class="ta-rotulo">Horário</p><div class="ta-chips">${horas.map((h) => `<button type="button" aria-pressed="${h === esc2.hora}" data-hora="${h}" ${ocupado(h) ? "disabled" : ""}>${h}</button>`).join("")}</div>
            <form data-agendar class="ta-inline"><input name="nome" placeholder="Seu nome" required maxlength="40"><button class="btn btn-sm btn-primary" ${esc2.hora ? "" : "disabled"}>Confirmar</button></form>
          </div></div>
          <div class="ta-card"><h4>Agenda do estabelecimento</h4>${tabela(["Dia", "Hora", "Cliente", "Serviço", ""], st.agenda.map((a, i) => [esc(a.dia), a.hora, esc(a.nome), esc(a.servico), `<button type="button" class="ta-x" data-cancelar="${i}" aria-label="Cancelar">×</button>`]), "Faça um agendamento no app para ver aqui.")}</div>
        </div>`;
      };
      raiz.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.serv) esc2.servico = Number(b.dataset.serv);
        else if (b.dataset.dia) (esc2.dia = Number(b.dataset.dia)), (esc2.hora = null);
        else if (b.dataset.hora) esc2.hora = b.dataset.hora;
        else if (b.dataset.cancelar) st.agenda.splice(Number(b.dataset.cancelar), 1), salvar("sobmedida", st);
        else return;
        desenhar();
      });
      raiz.addEventListener("submit", (e) => {
        if (!e.target.matches("[data-agendar]")) return;
        e.preventDefault();
        st.agenda.push({ dia: dias[esc2.dia], hora: esc2.hora, nome: new FormData(e.target).get("nome"), servico: servicos[esc2.servico][0] });
        salvar("sobmedida", st);
        aviso(`Agendado para ${dias[esc2.dia]} às ${esc2.hora}. O cliente recebe a confirmação no WhatsApp.`);
        esc2.hora = null;
        desenhar();
      });
      desenhar();
    },

    /* Nexor Service Desk: abrir, assumir e resolver chamados */
    chamados(raiz) {
      const TIPOS = { "Acessos e permissões": "Sistemas", "Melhoria em sistema": "Sistemas", "Manutenção de equipamento": "Infraestrutura", "Requisição de serviço": "Infraestrutura", "Incidente / suporte": "Infraestrutura" };
      const IMPACTO = { "Só eu": ["Baixa", 72, "info"], "Algumas pessoas": ["Média", 24, "info"], "O setor ou clientes": ["Alta", 8, "warn"], "A empresa toda": ["Crítica", 4, "bad"] };
      const h = 3600_000;
      const st = estado("chamados", {
        seq: 1043,
        lista: [
          { id: 1042, titulo: "Impressora do financeiro parada", tipo: "Manutenção de equipamento", impacto: "O setor ou clientes", t: Date.now() - 2 * h, tecnico: "Carlos", status: "Em atendimento" },
          { id: 1041, titulo: "Sem acesso ao ERP", tipo: "Acessos e permissões", impacto: "A empresa toda", t: Date.now() - 1 * h, tecnico: "", status: "Aberto" },
          { id: 1039, titulo: "Trocar teclado", tipo: "Requisição de serviço", impacto: "Só eu", t: Date.now() - 5 * h, tecnico: "", status: "Aberto" },
        ],
      });
      const prazo = (c) => {
        const resta = c.t + IMPACTO[c.impacto][1] * h - Date.now();
        return c.status === "Resolvido" ? chip("no prazo", "ok") : resta < 0 ? chip("vencido", "bad") : `${Math.ceil(resta / h)}h`;
      };
      const ir = abas(raiz, ["Fila", "Abrir chamado", "Painel"], (aba, p) => {
        if (aba === 0) {
          p.innerHTML = tabela(["Chamado", "Setor", "Prioridade", "Prazo", "Técnico", "Ação"], st.lista.slice().sort((a, b) => b.id - a.id).map((c) => {
            const [pri, , tom] = IMPACTO[c.impacto];
            const acao = c.status === "Resolvido" ? chip("Resolvido", "ok") : c.tecnico ? `<button class="btn btn-sm btn-ghost" type="button" data-resolver="${c.id}">Resolver</button>` : `<button class="btn btn-sm btn-primary" type="button" data-assumir="${c.id}">Assumir</button>`;
            return [`#${c.id} ${esc(c.titulo)}`, TIPOS[c.tipo], chip(pri, tom), prazo(c), esc(c.tecnico || "—"), acao];
          }));
        } else if (aba === 1) {
          p.innerHTML = `<form class="ta-card ta-form" data-abrir><h4>Novo chamado</h4>
            <label>Tipo de atendimento<select name="tipo">${Object.keys(TIPOS).map((t) => `<option>${t}</option>`).join("")}</select></label>
            <label>Quem é afetado?<select name="impacto">${Object.keys(IMPACTO).map((t) => `<option>${t}</option>`).join("")}</select></label>
            <p class="ta-previsao" data-previsao></p>
            <label>Título<input name="titulo" required maxlength="60" placeholder="Ex.: Computador não liga"></label>
            <label>Descrição<textarea name="desc" rows="3" maxlength="400"></textarea></label>
            <button class="btn btn-primary">Abrir chamado</button></form>`;
          const form = p.querySelector("form");
          const prev = () => {
            const [pri, horas] = IMPACTO[form.impacto.value];
            p.querySelector("[data-previsao]").textContent = `Vai para ${TIPOS[form.tipo.value]} · prioridade ${pri} · prazo de ${horas} horas`;
          };
          form.addEventListener("change", prev);
          prev();
        } else {
          const abertos = st.lista.filter((c) => c.status !== "Resolvido");
          const vencidos = abertos.filter((c) => c.t + IMPACTO[c.impacto][1] * h < Date.now());
          p.innerHTML = kpis([["Em aberto", abertos.length], ["Sem técnico", abertos.filter((c) => !c.tecnico).length, "warn"], ["Vencidos", vencidos.length, vencidos.length ? "bad" : "ok"], ["Resolvidos", st.lista.length - abertos.length, "ok"]]) + `<p class="muted ta-dica">Na versão completa: desempenho por técnico, gráficos, modo TV e exportação em planilha.</p>`;
        }
      });
      raiz.addEventListener("click", (e) => {
        const a = e.target.closest("[data-assumir]");
        const r = e.target.closest("[data-resolver]");
        if (a) st.lista.find((c) => c.id === Number(a.dataset.assumir)).tecnico = "Você";
        else if (r) st.lista.find((c) => c.id === Number(r.dataset.resolver)).status = "Resolvido";
        else return;
        salvar("chamados", st);
        ir(0);
      });
      raiz.addEventListener("submit", (e) => {
        if (!e.target.matches("[data-abrir]")) return;
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        st.lista.push({ id: st.seq++, titulo: d.titulo, tipo: d.tipo, impacto: d.impacto, t: Date.now(), tecnico: "", status: "Aberto" });
        salvar("chamados", st);
        aviso(`Chamado #${st.seq - 1} aberto e enviado para ${TIPOS[d.tipo]}.`);
        ir(0);
      });
    },

    /* Nexor Cofre: senhas da equipe com auditoria */
    cofre(raiz) {
      const st = estado("cofre", {
        itens: [
          { sistema: "Firewall", usuario: "admin", senha: "Fw!8kQ2#zLp9Vx", pasta: "Infraestrutura" },
          { sistema: "Wi-Fi visitantes", usuario: "—", senha: "visita123", pasta: "Infraestrutura" },
          { sistema: "ERP produção", usuario: "svc_erp", senha: "Er#4mZ!q7Tn2Wd", pasta: "Sistemas" },
          { sistema: "Painel da nuvem", usuario: "ti@empresa", senha: "visita123", pasta: "Sistemas" },
        ],
        log: [],
      });
      const forca = (s) => {
        let p = 0;
        if (s.length >= 12) p++;
        if (/[A-Z]/.test(s) && /[a-z]/.test(s)) p++;
        if (/\d/.test(s)) p++;
        if (/[^A-Za-z0-9]/.test(s)) p++;
        return p >= 4 ? ["Forte", "ok"] : p >= 2 ? ["Média", "warn"] : ["Fraca", "bad"];
      };
      const gerar = (n = 16) => {
        const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
        const v = new Uint32Array(n);
        crypto.getRandomValues(v);
        return Array.from(v, (x) => c[x % c.length]).join("");
      };
      const registrarLog = (acao, item) => {
        st.log.push({ t: Date.now(), acao, item });
        st.log = st.log.slice(-50);
        salvar("cofre", st);
      };
      const ir = abas(raiz, ["Senhas", "Nova senha", "Auditoria", "Saúde do cofre"], (aba, p) => {
        if (aba === 0) {
          p.innerHTML = tabela(["Sistema", "Pasta", "Usuário", "Senha", "Força", ""], st.itens.map((x, i) => {
            const [f, tom] = forca(x.senha);
            return [esc(x.sistema), esc(x.pasta), esc(x.usuario), `<code data-senha="${i}">••••••••••</code>`, chip(f, tom), `<button type="button" class="btn btn-sm btn-ghost" data-ver="${i}">Ver</button> <button type="button" class="btn btn-sm btn-ghost" data-copiar="${i}">Copiar</button>`];
          }));
        } else if (aba === 1) {
          p.innerHTML = `<form class="ta-card ta-form" data-nova><h4>Nova credencial</h4>
            <label>Sistema<input name="sistema" required maxlength="40" placeholder="Ex.: Servidor de arquivos"></label>
            <label>Usuário<input name="usuario" maxlength="40"></label>
            <label>Senha<span class="ta-inline"><input name="senha" required maxlength="64" value="${gerar()}"><button type="button" class="btn btn-sm btn-ghost" data-gerar>Gerar outra</button></span></label>
            <p data-forca class="ta-previsao"></p>
            <label>Pasta (quem pode ver)<select name="pasta"><option>Infraestrutura</option><option>Sistemas</option><option>Financeiro</option><option>Diretoria</option></select></label>
            <button class="btn btn-primary">Salvar no cofre</button></form>`;
          const f = p.querySelector("form");
          const mostrar = () => (p.querySelector("[data-forca]").textContent = `Força da senha: ${forca(f.senha.value)[0]}`);
          f.senha.addEventListener("input", mostrar);
          mostrar();
        } else if (aba === 2) {
          p.innerHTML = tabela(["Quando", "Pessoa", "Ação", "Credencial"], st.log.slice().reverse().map((l) => [dataCurta(l.t), "Você", chip(l.acao, l.acao === "Criou" ? "ok" : "info"), esc(l.item)]), "Veja ou copie uma senha para registrar um acesso.");
        } else {
          const contagem = st.itens.reduce((m, x) => ((m[x.senha] = (m[x.senha] ?? 0) + 1), m), {});
          p.innerHTML = kpis([["Senhas", st.itens.length], ["Fortes", st.itens.filter((x) => forca(x.senha)[0] === "Forte").length, "ok"], ["Fracas", st.itens.filter((x) => forca(x.senha)[0] === "Fraca").length, "bad"], ["Repetidas", st.itens.filter((x) => contagem[x.senha] > 1).length, "warn"]]) + `<p class="muted ta-dica">O cofre avisa quando uma senha é fraca ou usada em mais de um sistema.</p>`;
        }
      });
      raiz.addEventListener("click", async (e) => {
        const ver = e.target.closest("[data-ver]");
        const cop = e.target.closest("[data-copiar]");
        if (e.target.closest("[data-gerar]")) {
          const campo = raiz.querySelector("[name=senha]");
          campo.value = gerar();
          campo.dispatchEvent(new Event("input"));
        } else if (ver) {
          const x = st.itens[Number(ver.dataset.ver)];
          const code = raiz.querySelector(`[data-senha="${ver.dataset.ver}"]`);
          const aberta = code.textContent !== "••••••••••";
          code.textContent = aberta ? "••••••••••" : x.senha;
          if (!aberta) registrarLog("Visualizou", x.sistema);
        } else if (cop) {
          const x = st.itens[Number(cop.dataset.copiar)];
          try {
            await navigator.clipboard.writeText(x.senha);
            aviso("Senha copiada. O acesso ficou registrado na auditoria.");
          } catch {
            aviso("Não foi possível copiar neste navegador.");
          }
          registrarLog("Copiou", x.sistema);
        }
      });
      raiz.addEventListener("submit", (e) => {
        if (!e.target.matches("[data-nova]")) return;
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        st.itens.push(d);
        registrarLog("Criou", d.sistema);
        aviso("Credencial salva no cofre.");
        ir(0);
      });
    },

    /* Nexor IT Platform: inventário, alertas, instalação e comandos */
    ti(raiz) {
      const st = estado("ti", {
        maquinas: [
          ["FIN-PC01", "marina.souza", "Windows 11", true, 95, true],
          ["FIN-PC02", "paulo.alves", "Windows 11", true, 61, true],
          ["VEN-NB07", "pedro.lima", "Windows 11", true, 44, true],
          ["VEN-NB08", "lara.dias", "Windows 11", false, 52, true],
          ["RH-PC03", "ana.costa", "Windows 10", true, 70, true],
          ["DIR-NB01", "joao.reis", "Windows 11", true, 38, true],
          ["EST-PC02", "carlos.melo", "Windows 10", true, 81, false],
          ["TI-PC01", "suporte", "Windows 11", true, 55, true],
        ].map(([nome, usuario, so, ligado, disco, antivirus]) => ({ nome, usuario, so, ligado, disco, antivirus, programas: ["Navegador", "Pacote Office", "Leitor de PDF"] })),
        chamados: 0,
        log: [],
      });
      const registrarLog = (acao) => {
        st.log.push({ t: Date.now(), acao });
        st.log = st.log.slice(-60);
        salvar("ti", st);
      };
      const alertas = () =>
        st.maquinas.flatMap((m) => [
          ...(m.disco >= 90 ? [[m.nome, `Disco ${m.disco}% cheio`, "Alta", "bad"]] : []),
          ...(!m.antivirus ? [[m.nome, "Sem antivírus", "Alta", "bad"]] : []),
          ...(m.so === "Windows 10" ? [[m.nome, "Sistema sem suporte", "Média", "warn"]] : []),
        ]);
      const PROGRAMAS = ["Cliente VPN", "Antivírus corporativo", "Leitor de PDF (atualização)", "Agente de backup"];
      const ir = abas(raiz, ["Inventário", "Alertas", "Instalar programa", "Comando remoto", "Auditoria"], (aba, p) => {
        if (aba === 0) {
          const on = st.maquinas.filter((m) => m.ligado).length;
          p.innerHTML = kpis([["Computadores", st.maquinas.length], ["Ligados agora", on, "ok"], ["Alertas", alertas().length, alertas().length ? "warn" : "ok"], ["Chamados abertos", st.chamados]]) +
            tabela(["Máquina", "Usuário", "Sistema", "Disco", "Status", ""], st.maquinas.map((m, i) => [esc(m.nome), esc(m.usuario), esc(m.so), `${m.disco}%`, m.ligado ? chip("Ligado", "ok") : chip("Desligado", "info"), m.ligado ? `<button type="button" class="btn btn-sm btn-ghost" data-reiniciar="${i}">Reiniciar</button>` : ""]));
        } else if (aba === 1) {
          p.innerHTML = tabela(["Máquina", "Alerta", "Gravidade", ""], alertas().map(([n, a, g, tom]) => [esc(n), esc(a), chip(g, tom), `<button type="button" class="btn btn-sm btn-primary" data-chamado="${esc(n)}|${esc(a)}">Abrir chamado</button>`]), "Nenhum alerta. Tudo em ordem!");
        } else if (aba === 2) {
          p.innerHTML = `<div class="ta-card ta-form"><h4>Instalar em várias máquinas de uma vez</h4>
            <label>Programa<select data-prog>${PROGRAMAS.map((x) => `<option>${x}</option>`).join("")}</select></label>
            <label>Destino<select data-dest><option value="todas">Todas as máquinas ligadas</option>${st.maquinas.filter((m) => m.ligado).map((m) => `<option>${m.nome}</option>`).join("")}</select></label>
            <p class="muted ta-dica">O pacote é assinado e cada máquina confere a assinatura antes de instalar.</p>
            <button class="btn btn-primary" type="button" data-instalar>Instalar agora</button><div class="ta-progresso" data-progresso></div></div>`;
        } else if (aba === 3) {
          p.innerHTML = `<div class="ta-card ta-form"><h4>Rodar um comando</h4>
            <label>Comando<select data-cmd><option value="ipconfig /flushdns">Limpar cache de DNS</option><option value="gpupdate /force">Atualizar políticas</option><option value="shutdown /r /t 60">Reiniciar em 60 segundos</option></select></label>
            <label>Destino<select data-cmd-dest><option value="todas">Todas as máquinas ligadas</option>${st.maquinas.filter((m) => m.ligado).map((m) => `<option>${m.nome}</option>`).join("")}</select></label>
            <button class="btn btn-primary" type="button" data-rodar-cmd>Executar</button><pre class="ta-terminal" data-saida></pre></div>`;
        } else {
          p.innerHTML = tabela(["Quando", "Quem", "Ação"], st.log.slice().reverse().map((l) => [dataCurta(l.t), "Você", esc(l.acao)]), "As ações que você fizer aparecem aqui, com data e hora.");
        }
      });
      raiz.addEventListener("click", async (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.reiniciar) {
          const m = st.maquinas[Number(b.dataset.reiniciar)];
          registrarLog(`Reiniciou ${m.nome} (usuário avisado, 60 s)`);
          aviso(`${m.nome}: o usuário foi avisado e a máquina reinicia em 60 segundos.`);
        } else if (b.dataset.chamado) {
          const [n, a] = b.dataset.chamado.split("|");
          st.chamados++;
          registrarLog(`Abriu chamado para ${n}: ${a}`);
          aviso(`Chamado aberto para ${n}: ${a}.`);
          ir(1);
        } else if (b.dataset.instalar !== undefined) {
          const prog = raiz.querySelector("[data-prog]").value;
          const dest = raiz.querySelector("[data-dest]").value;
          const alvo = st.maquinas.filter((m) => m.ligado && (dest === "todas" || m.nome === dest));
          const caixa = raiz.querySelector("[data-progresso]");
          b.disabled = true;
          caixa.innerHTML = alvo.map((m) => `<div><span>${esc(m.nome)}</span><i><b style="width:0"></b></i><small>aguardando</small></div>`).join("");
          for (const [k, m] of alvo.entries()) {
            const linha = caixa.children[k];
            linha.querySelector("small").textContent = "instalando…";
            linha.querySelector("b").style.width = "100%";
            await new Promise((r) => setTimeout(r, 450));
            linha.querySelector("small").textContent = "concluído ✓";
            if (!m.programas.includes(prog)) m.programas.push(prog);
            if (prog === "Antivírus corporativo") m.antivirus = true;
          }
          registrarLog(`Instalou ${prog} em ${alvo.length} máquina(s)`);
          b.disabled = false;
        } else if (b.dataset.rodarCmd !== undefined) {
          const cmd = raiz.querySelector("[data-cmd]").value;
          const dest = raiz.querySelector("[data-cmd-dest]").value;
          const alvo = st.maquinas.filter((m) => m.ligado && (dest === "todas" || m.nome === dest));
          const saida = raiz.querySelector("[data-saida]");
          saida.textContent = `> ${cmd}\n`;
          for (const m of alvo) {
            await new Promise((r) => setTimeout(r, 250));
            saida.textContent += `[${m.nome}] concluído com sucesso\n`;
          }
          registrarLog(`Executou "${cmd}" em ${alvo.length} máquina(s)`);
        }
      });
    },
  };

  return { abrir };
})();

/* Link direto para um teste: /#testar-atende, /#testar-gestao... (usado pelas páginas de serviço e anúncios) */
(() => {
  const abrirDoLink = () => {
    const m = location.hash.match(/^#testar-(\w+)$/);
    if (m && SOLUCOES.some((s) => s.id === m[1])) {
      history.replaceState(null, "", location.pathname + location.search);
      Teste.abrir(m[1]);
    }
  };
  abrirDoLink();
  addEventListener("hashchange", abrirDoLink);
})();
