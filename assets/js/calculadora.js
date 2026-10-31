/* Calculadora de retorno: o cliente escolhe o que quer automatizar e o tamanho da operação,
   ajusta se quiser, e vê a economia de 12 meses na hora. */

(() => {
  const raiz = document.getElementById("calc");
  if (!raiz) return;

  // Valores de partida de cada tarefa, para uma empresa média. O porte multiplica o volume.
  const TAREFAS = {
    atendimento: { nome: "Atendimento no WhatsApp", unidade: "mensagens respondidas", volume: 1500, minutos: 5, ia: 60 },
    agendamento: { nome: "Agendamentos", unidade: "agendamentos", volume: 600, minutos: 6, ia: 70 },
    documentos: { nome: "Notas e documentos", unidade: "documentos digitados", volume: 400, minutos: 8, ia: 80 },
    cobranca: { nome: "Cobrança e follow-up", unidade: "cobranças e follow-ups", volume: 500, minutos: 4, ia: 75 },
    relatorios: { nome: "Relatórios", unidade: "relatórios montados", volume: 40, minutos: 90, ia: 85 },
  };
  const PORTES = { pequena: 0.35, media: 1, grande: 3.5 };

  const estado = { tarefa: "atendimento", porte: "media", volume: 1500, minutos: 5, custo: 35, ia: 60 };
  const $ = (s) => raiz.querySelector(s);
  const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const num = (n, casas = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

  const campos = {
    volume: $("#calc-volume"),
    minutos: $("#calc-minutos"),
    custo: $("#calc-custo"),
    ia: $("#calc-ia"),
  };

  const aplicarPadrao = () => {
    const t = TAREFAS[estado.tarefa];
    estado.volume = Math.max(10, Math.round((t.volume * PORTES[estado.porte]) / 10) * 10);
    estado.minutos = t.minutos;
    estado.ia = t.ia;
    campos.volume.max = String(Math.max(20000, estado.volume * 2));
    for (const k of ["volume", "minutos", "ia"]) campos[k].value = String(estado[k]);
  };

  /* Animação dos números: vai do valor atual ao novo em 0,5 s */
  const animar = (el, para, formato) => {
    const de = Number(el.dataset.valor ?? 0);
    el.dataset.valor = String(para);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return (el.textContent = formato(para));
    const t0 = performance.now();
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / 500);
      el.textContent = formato(de + (para - de) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  };

  const calcular = () => {
    const horasMes = (estado.volume * estado.minutos) / 60;
    const horasLivres = horasMes * (estado.ia / 100);
    const economiaMes = horasLivres * estado.custo;
    return { horasMes, horasLivres, economiaMes, economiaAno: economiaMes * 12, pessoas: horasLivres / 176 };
  };

  const desenhar = () => {
    const t = TAREFAS[estado.tarefa];
    const r = calcular();
    $("#o-volume").textContent = `${num(estado.volume)} ${t.unidade}`;
    $("#o-minutos").textContent = `${estado.minutos} min cada`;
    $("#o-custo").textContent = `${brl(estado.custo)} por hora`;
    $("#o-ia").textContent = `${estado.ia}% feito pela IA`;
    animar($("#r-ano"), r.economiaAno, brl);
    animar($("#r-mes"), r.economiaMes, brl);
    animar($("#r-horas"), r.horasLivres, (v) => `${num(v)} h`);
    animar($("#r-pessoas"), r.pessoas, (v) => num(v, 1));
    $("#r-frase").textContent = `Com a IA fazendo ${estado.ia}% de "${t.nome.toLowerCase()}", sua equipe ganha ${num(r.horasLivres)} horas por mês para vender e atender melhor.`;

    // Gráfico: economia acumulada mês a mês
    const barras = $("#calc-barras");
    barras.innerHTML = Array.from({ length: 12 }, (_, i) => {
      const valor = r.economiaMes * (i + 1);
      const altura = ((i + 1) / 12) * 100;
      return `<div class="calc-bar" style="--h:${altura}%;--d:${i * 40}ms" title="Mês ${i + 1}: ${brl(valor)}"><i></i><small>${i + 1}</small></div>`;
    }).join("");
    $("#calc-barras-total").textContent = brl(r.economiaAno);
  };
  const interagiu = () => NX.registrar("usou-calculadora", 3);

  raiz.querySelectorAll("[data-tarefa]").forEach((b) =>
    b.addEventListener("click", () => {
      estado.tarefa = b.dataset.tarefa;
      raiz.querySelectorAll("[data-tarefa]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      aplicarPadrao();
      desenhar();
      interagiu();
    })
  );
  raiz.querySelectorAll("[data-porte]").forEach((b) =>
    b.addEventListener("click", () => {
      estado.porte = b.dataset.porte;
      raiz.querySelectorAll("[data-porte]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      aplicarPadrao();
      desenhar();
      interagiu();
    })
  );
  for (const [k, el] of Object.entries(campos)) {
    el.addEventListener("input", () => {
      estado[k] = Number(el.value);
      desenhar();
      interagiu();
    });
  }

  // Pedido do estudo detalhado: vira lead e abre o WhatsApp com o resumo
  const form = $("#calc-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const erro = form.querySelector(".form-error");
    if (!d.nome?.trim() || !NX.contatoValido(d)) {
      erro.textContent = "Informe seu nome e um WhatsApp válido.";
      return;
    }
    erro.textContent = "";
    form.dataset.enviado = "1";
    const t = TAREFAS[estado.tarefa];
    const r = calcular();
    const resumo = `${t.nome}: ${num(estado.volume)} ${t.unidade}/mês, ${estado.minutos} min cada, ${estado.ia}% pela IA. Economia estimada: ${brl(r.economiaAno)} por ano (${num(r.horasLivres)} h/mês).`;
    NX.enviarLead("calculadora", { ...d, mensagem: resumo }, { formulario: "calculadora" });
    form.innerHTML = `<p class="calc-ok">Recebemos, ${d.nome.split(" ")[0]}! A equipe vai te mandar o estudo completo no WhatsApp.</p><a class="btn btn-whats btn-block" target="_blank" rel="noopener" href="${whatsUrl(`Olá! Fiz a simulação no site da Nexor. ${resumo} Quero o estudo completo.`)}">Falar agora no WhatsApp</a>`;
  });

  aplicarPadrao();
  desenhar();
  NX.preencher(raiz);
})();
