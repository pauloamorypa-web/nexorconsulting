/* Blue — a assistente de IA da Nexor no site.
   Com o servidor configurado (NEXOR_API_URL em config.js), a Blue conversa com IA.
   Sem servidor, faz um atendimento guiado: coleta nome, empresa, necessidade e WhatsApp e gera o lead. */

(() => {
  const SUGESTOES = ["Quero vender mais pelo WhatsApp", "Preciso de um sistema de gestão", "Quero um site novo", "Sou da área de TI"];
  const BOAS_VINDAS = "Oi! Que bom te ver por aqui 💙 Eu sou a Blue, a assistente de IA da Nexor. Me conta: o que anda tomando mais tempo aí na sua empresa?";
  const CHAVE = "nexor-blue";
  const comIA = Boolean(NEXOR_API_URL);

  const estado = NX.ler(CHAVE, null, sessionStorage) ?? { mensagens: [{ de: "ia", texto: BOAS_VINDAS }], etapa: 0, dados: {} };
  const salvar = () => NX.guardar(CHAVE, estado, sessionStorage);

  const raiz = document.createElement("div");
  raiz.className = "nx-chat";
  raiz.innerHTML = `
    <button class="nx-chat-abrir" type="button" aria-expanded="false" aria-controls="nx-chat-painel">
      <span class="nx-chat-pulso" aria-hidden="true"></span>
      <img class="nx-blue-av" src="/assets/img/blue-avatar.webp" alt="" width="28" height="28">
      <span class="nx-chat-rotulo">Fale com a Blue</span>
    </button>
    <section class="nx-chat-painel" id="nx-chat-painel" role="dialog" aria-label="Conversa com a Blue, assistente de IA da Nexor" hidden>
      <header>
        <img class="nx-chat-avatar" src="/assets/img/blue-avatar.webp" alt="" width="38" height="38">
        <div><b>Blue</b><small><span class="nx-online"></span> assistente de IA da Nexor</small></div>
        <button class="nx-chat-voz" type="button" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Falar por voz</button>
        <button class="nx-chat-fechar" type="button" aria-label="Fechar conversa">×</button>
      </header>
      <div class="nx-chat-msgs" aria-live="polite"></div>
      <div class="nx-chat-sugestoes"></div>
      <form class="nx-chat-form" data-form="blue">
        <label class="sr-only" for="nx-chat-campo">Sua mensagem</label>
        <textarea id="nx-chat-campo" rows="1" maxlength="2000" placeholder="Escreva sua mensagem…"></textarea>
        <button type="submit" aria-label="Enviar"><svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg></button>
      </form>
      <p class="nx-chat-aviso">A conversa é respondida por inteligência artificial e usada só para a Nexor atender você. Não envie dados sensíveis (saúde, documentos, senhas). <a href="/privacidade.html" target="_blank" rel="noopener">Privacidade</a> · Prefere uma pessoa? WhatsApp (34) 99733-7499.</p>
    </section>`;
  document.body.appendChild(raiz);

  const botao = raiz.querySelector(".nx-chat-abrir");
  const painel = raiz.querySelector(".nx-chat-painel");
  const lista = raiz.querySelector(".nx-chat-msgs");
  const sugestoes = raiz.querySelector(".nx-chat-sugestoes");
  const form = raiz.querySelector(".nx-chat-form");
  const campo = raiz.querySelector("textarea");
  let enviando = false;

  const desenharMensagem = ({ de, texto, link }) => {
    const p = document.createElement("p");
    p.className = `nx-msg nx-${de}`;
    p.textContent = texto;
    if (link) {
      const a = document.createElement("a");
      a.className = "btn btn-sm btn-whats nx-msg-link";
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Continuar no WhatsApp";
      p.append(document.createElement("br"), a);
    }
    lista.appendChild(p);
    lista.scrollTop = lista.scrollHeight;
  };

  const opcoes = (itens) => {
    sugestoes.innerHTML = "";
    for (const s of itens) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s;
      b.addEventListener("click", () => enviar(s));
      sugestoes.appendChild(b);
    }
  };

  estado.mensagens.forEach(desenharMensagem);
  if (estado.mensagens.length === 1) opcoes(SUGESTOES);

  const abrir = (aberto) => {
    painel.hidden = !aberto;
    botao.setAttribute("aria-expanded", String(aberto));
    raiz.classList.toggle("aberto", aberto);
    if (aberto) {
      NX.registrar("abriu-blue", 3);
      lista.scrollTop = lista.scrollHeight;
      campo.focus();
    } else botao.focus();
  };
  botao.addEventListener("click", () => abrir(painel.hidden));
  raiz.querySelector(".nx-chat-fechar").addEventListener("click", () => abrir(false));
  painel.addEventListener("keydown", (e) => e.key === "Escape" && abrir(false));
  /* Conversa por voz com a voz da Blue (agente de voz do ElevenLabs, configurado em BLUE_VOZ_AGENTE) */
  const vozId = typeof BLUE_VOZ_AGENTE !== "undefined" ? BLUE_VOZ_AGENTE : "";
  if (vozId) {
    const bVoz = raiz.querySelector(".nx-chat-voz");
    bVoz.hidden = false;
    bVoz.addEventListener("click", () => {
      NX.registrar("blue-voz", 4);
      abrir(false);
      raiz.hidden = true; // o widget de voz ocupa o mesmo canto da tela
      if (!document.querySelector("elevenlabs-convai")) {
        const el = document.createElement("elevenlabs-convai");
        el.setAttribute("agent-id", vozId);
        document.body.appendChild(el);
        const sc = document.createElement("script");
        sc.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
        sc.async = true;
        document.body.appendChild(sc);
      }
    });
  }

  // Outros pontos do site podem abrir a Blue: <button data-abrir-blue>
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-abrir-blue]")) abrir(true);
  });

  /* ---------- Atendimento guiado (sem servidor) ---------- */
  const SOLUCAO_POR_TEMA = [
    [/barbe|sal[aã]o|corte de cabelo|agendamento/i, "Nexor Barber, agenda com app do cliente, clube de assinatura e produtos para barbearias"],
    [/cont[aá]b|contador|escrit[oó]rio cont/i, "Nexor Contábil, que cobra, recebe e lê os documentos dos clientes do escritório com IA"],
    [/agente|assistente pessoal|ia pessoal|executa|aprova/i, "Nexor Agente, sua IA pessoal no WhatsApp que consulta e age nos sistemas da empresa com a sua aprovação"],
    [/\brh\b|ponto|funcion[aá]rio|colaborador|folha|f[eé]rias|esocial|holerite|biometria|recursos humanos/i, "Nexor RH, ponto pelo celular com digital ou QR Code, folha e eSocial"],
    [/whats|atend|venda|vender|instagram|cliente/i, "Nexor Atende IA, que atende e vende no WhatsApp 24h"],
    [/loja|e-?commerce|marketplace|mercado livre|shopee/i, "Nexor Commerce, loja virtual integrada aos marketplaces"],
    [/sistema|gest|erp|crm|planilha|estoque|financeiro/i, "Nexor Gestão, ERP e CRM sob medida"],
    [/site|google|landing|p[aá]gina/i, "Nexor Site Pro, site feito para aparecer no Google e vender"],
    [/\bti\b|chamad|senha|invent|computador|rede|suporte/i, "soluções de TI da Nexor: Service Desk, Cofre de Senhas e IT Platform"],
    [/automa|nota|boleto|documento|relat|cobran/i, "Nexor Automação, agentes de IA que fazem tarefas repetitivas"],
    [/app|aplicativo|plataforma|sob medida/i, "Nexor Sob Medida, apps e plataformas feitos do zero"],
  ];

  const guiado = (texto) => {
    const d = estado.dados;
    switch (estado.etapa) {
      case 0: {
        d.mensagem = texto;
        const s = SOLUCAO_POR_TEMA.find(([re]) => re.test(texto));
        estado.etapa = 1;
        return [
          s ? `Entendi! Isso é bem comum, e dá pra resolver com o ${s[1]}.` : "Entendi! Esse tipo de situação a gente resolve bastante por aqui.",
          "Antes de eu te mostrar como funcionaria no seu caso: como posso te chamar?",
        ];
      }
      case 1:
        d.nome = texto.replace(/^(meu nome [eé]|sou o|sou a|eu sou)\s+/i, "").slice(0, 80);
        estado.etapa = 2;
        return [`Prazer, ${d.nome.split(" ")[0]}! 😊 E a sua empresa, como se chama e trabalha com o quê?`];
      case 2:
        d.empresa = texto.slice(0, 120);
        estado.etapa = 3;
        return ["Boa! Me passa seu WhatsApp com DDD? Assim alguém do time te chama pra entender melhor e te mostrar um diagnóstico gratuito, sem compromisso."];
      case 3: {
        if (texto.replace(/\D/g, "").length < 10) return ["Acho que faltou algum número 😅 Pode mandar com o DDD? Tipo (34) 99999-9999"];
        d.telefone = texto;
        estado.etapa = 4;
        NX.enviarLead("blue", d, { formulario: "blue" });
        const resumo = `Olá! Conversei com a Blue no site. Sou ${d.nome}, da ${d.empresa}. Preciso de: ${d.mensagem}`;
        return [
          `Prontinho, ${d.nome.split(" ")[0]}! Já contei tudo pro time, e logo alguém te chama no WhatsApp.`,
          "Enquanto isso, se der vontade, dá pra testar nossas soluções grátis por 12 horas aqui no site 😉",
          { texto: "Ou, se preferir, já chama a gente agora:", link: whatsUrl(resumo) },
        ];
      }
      default:
        return [{ texto: "Já tá tudo com o time, viu? Se quiser adiantar a conversa, é só chamar:", link: whatsUrl(`Olá! Conversei com a Blue no site. Sou ${d.nome}, da ${d.empresa}.`) }];
    }
  };

  /* ---------- Conversa ---------- */
  async function enviar(texto) {
    texto = texto.trim();
    if (!texto || enviando) return;
    enviando = true;
    campo.value = "";
    campo.style.height = "";
    sugestoes.innerHTML = "";
    const minha = { de: "eu", texto };
    estado.mensagens.push(minha);
    desenharMensagem(minha);

    const digitando = document.createElement("p");
    digitando.className = "nx-msg nx-ia nx-digitando";
    digitando.innerHTML = "<i></i><i></i><i></i>";
    digitando.setAttribute("aria-label", "A Blue está digitando");
    lista.appendChild(digitando);
    lista.scrollTop = lista.scrollHeight;

    let respostas;
    if (comIA) {
      try {
        const r = await fetch(`${NEXOR_API_URL.replace(/\/$/, "")}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessao: NX.sessao, mensagem: texto, contexto: `viu ${NX.interesses().slice(0, 8).join(", ") || "a página inicial"}` }),
        });
        if (!r.ok) throw new Error(String(r.status));
        // Cada bloco separado por linha em branco vira um balão, como no WhatsApp
        respostas = String((await r.json()).resposta ?? "").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
      } catch {
        respostas = [{ texto: "Ops, minha conexão falhou aqui 😕 Mas o time tá no WhatsApp e responde rapidinho:", link: whatsUrl("Olá! Vim pelo site da Nexor.") }];
      }
    } else {
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 500));
      respostas = guiado(texto);
    }
    // Balões um de cada vez, com uma pausa de "digitando" proporcional ao tamanho, como uma pessoa
    const calma = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [i, r] of respostas.entries()) {
      const m = typeof r === "string" ? { de: "ia", texto: r } : { de: "ia", ...r };
      if (i > 0 && !calma) {
        lista.appendChild(digitando);
        lista.scrollTop = lista.scrollHeight;
        await new Promise((ok) => setTimeout(ok, Math.min(2200, Math.max(700, String(m.texto ?? "").length * 18))));
      }
      digitando.remove();
      estado.mensagens.push(m);
      desenharMensagem(m);
    }
    if (!comIA && estado.etapa === 0) opcoes(SUGESTOES);
    salvar();
    enviando = false;
    campo.focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    enviar(campo.value);
  });
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar(campo.value);
    }
  });
  campo.addEventListener("input", () => {
    campo.style.height = "";
    campo.style.height = Math.min(campo.scrollHeight, 120) + "px";
  });
})();
