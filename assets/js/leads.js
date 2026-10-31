/* Captura de leads do site:
   - pontuação de engajamento (tempo no site, seções vistas, ferramentas usadas)
   - leads de formulários (incluindo os que a pessoa começou a preencher e não enviou)
   - aviso antes de sair do site
   Tudo é enviado para o servidor da Blue (/api/lead). Sem servidor, fica numa fila no navegador. */

const NX = (() => {
  const guardar = (chave, valor, armazenamento = localStorage) => {
    try {
      armazenamento.setItem(chave, JSON.stringify(valor));
    } catch {
      /* navegador sem armazenamento: segue sem guardar */
    }
  };
  const ler = (chave, padrao, armazenamento = localStorage) => {
    try {
      return JSON.parse(armazenamento.getItem(chave)) ?? padrao;
    } catch {
      return padrao;
    }
  };

  const sessao =
    ler("nx-sessao", null, sessionStorage) ??
    (() => {
      const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^A-Za-z0-9-]/g, "");
      guardar("nx-sessao", id, sessionStorage);
      return id;
    })();

  /* ---------- Engajamento ---------- */
  const eng = ler("nx-engajamento", { pontos: 0, eventos: [] }, sessionStorage);
  const registrar = (evento, pontos = 1) => {
    if (eng.eventos.includes(evento)) return;
    eng.eventos.push(evento);
    eng.pontos += pontos;
    guardar("nx-engajamento", eng, sessionStorage);
  };
  const interesses = () => eng.eventos.filter((e) => !e.startsWith("tempo-"));

  // Tempo no site: 1 ponto a cada 30 s, até 6
  let segundos = 0;
  setInterval(() => {
    if (document.hidden) return;
    segundos += 5;
    if (segundos % 30 === 0 && segundos <= 180) registrar(`tempo-${segundos}`, 1);
  }, 5000);

  /* ---------- Envio ---------- */
  const fila = ler("nx-fila-leads", []);
  const enviarAgora = async (lead) => {
    if (!NEXOR_API_URL) return false;
    try {
      const r = await fetch(`${NEXOR_API_URL.replace(/\/$/, "")}/api/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
        keepalive: true,
      });
      return r.ok || r.status === 400; // 400 = dados recusados: não adianta reenviar
    } catch {
      return false;
    }
  };
  const esvaziarFila = async () => {
    while (fila.length) {
      if (!(await enviarAgora(fila[0]))) break;
      fila.shift();
      guardar("nx-fila-leads", fila);
    }
  };

  /** Envia um lead. tipo: parcial | teste | diagnostico | calculadora | saida | interesse | blue */
  async function enviarLead(tipo, dados, extra = {}) {
    const lead = { sessao, tipo, dados, pontuacao: eng.pontos, interesses: interesses(), ...extra };
    if (tipo !== "parcial") {
      guardar("nx-lead", { ...ler("nx-lead", {}), ...dados });
      registrar("lead-enviado", 5);
    }
    if (!(await enviarAgora(lead))) {
      fila.push(lead);
      guardar("nx-fila-leads", fila.slice(-50));
    }
  }
  esvaziarFila();

  /* ---------- Formulários abandonados ---------- */
  const contatoValido = (d) => (d.telefone && d.telefone.replace(/\D/g, "").length >= 10) || (d.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email));
  const dadosDoForm = (form) => {
    const d = {};
    form.querySelectorAll("[data-lead]").forEach((el) => {
      if (el.value.trim()) d[el.dataset.lead] = el.value.trim();
    });
    return d;
  };
  const temporizadores = new WeakMap();
  document.addEventListener("focusout", (e) => {
    const form = e.target.closest?.("form[data-form]");
    if (!form || form.dataset.enviado || !e.target.matches("[data-lead]")) return;
    clearTimeout(temporizadores.get(form));
    temporizadores.set(
      form,
      setTimeout(() => {
        const d = dadosDoForm(form);
        if (contatoValido(d) && !form.dataset.enviado) enviarLead("parcial", d, { formulario: form.dataset.form });
      }, 1200)
    );
  });
  document.addEventListener("submit", (e) => {
    if (e.target.matches?.("form[data-form]")) clearTimeout(temporizadores.get(e.target));
  });

  // Preenche formulários com o que a pessoa já informou antes
  const preencher = (raiz = document) => {
    const conhecido = ler("nx-lead", {});
    raiz.querySelectorAll("[data-lead]").forEach((el) => {
      if (!el.value && conhecido[el.dataset.lead]) el.value = conhecido[el.dataset.lead];
    });
  };

  /* ---------- Seções vistas ---------- */
  const pesos = { servicos: 2, ti: 2, roi: 2, vitrine: 1, ia: 1, orcamento: 2, faq: 1 };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entradas) => entradas.forEach((en) => en.isIntersecting && registrar(`secao-${en.target.id}`, pesos[en.target.id] ?? 1)),
      { threshold: 0.35 }
    );
    Object.keys(pesos).forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  return { sessao, registrar, enviarLead, preencher, pontos: () => eng.pontos, interesses, ler, guardar, contatoValido };
})();

/* ---------- Aviso antes de sair ---------- */
(() => {
  const modal = document.getElementById("saida-modal");
  if (!modal) return;
  const inicio = Date.now();
  let mostrado = NX.ler("nx-saida-vista", false, sessionStorage);

  const mostrar = () => {
    if (mostrado || NX.ler("nx-lead", null) || document.querySelector("dialog[open]") || Date.now() - inicio < 15000) return;
    mostrado = true;
    NX.guardar("nx-saida-vista", true, sessionStorage);
    NX.preencher(modal);
    modal.showModal();
    NX.registrar("viu-oferta-saida", 0);
  };

  // Computador: o mouse sai pela parte de cima da janela
  document.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget && e.clientY <= 0) mostrar();
  });
  // Celular: depois de 50 s, ao rolar rápido para cima (gesto comum antes de sair)
  let ultimoY = scrollY;
  let ultimoT = Date.now();
  addEventListener(
    "scroll",
    () => {
      const agora = Date.now();
      const v = (ultimoY - scrollY) / Math.max(1, agora - ultimoT);
      if (matchMedia("(pointer: coarse)").matches && agora - inicio > 50000 && v > 2.5 && scrollY > 600) mostrar();
      ultimoY = scrollY;
      ultimoT = agora;
    },
    { passive: true }
  );

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-fechar]")) modal.close();
  });
  modal.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const d = Object.fromEntries(new FormData(form));
    const erro = form.querySelector(".form-error");
    if (!d.nome?.trim() || !NX.contatoValido(d)) {
      erro.textContent = "Informe seu nome e um WhatsApp válido.";
      return;
    }
    form.dataset.enviado = "1";
    NX.enviarLead("saida", d, { formulario: "saida" });
    modal.querySelector(".saida-conteudo").innerHTML = `<h3>Pronto, ${d.nome.split(" ")[0]}!</h3><p class="muted">Nossa equipe vai te chamar no WhatsApp com o estudo de retorno para a sua empresa.</p><button class="btn btn-primary btn-block" type="button" data-fechar>Continuar no site</button>`;
  });
})();
