/* Blue — a assistente de IA da Nexor no site.
   Com o servidor configurado (NEXOR_API_URL em config.js), a Blue conversa com IA.
   Sem servidor, faz um atendimento guiado: coleta nome, empresa, necessidade e WhatsApp e gera o lead. */

(() => {
  const SUGESTOES = ["Quero vender mais pelo WhatsApp", "Preciso de um sistema de gestão", "Quero um site novo", "Sou da área de TI"];
  const BOAS_VINDAS = "Oi! Eu sou a Blue, a assistente de IA da Nexor 💙 Me conta: o que você quer melhorar na sua empresa?";
  const CHAVE = "nexor-blue";
  const comIA = Boolean(NEXOR_API_URL);

  const estado = NX.ler(CHAVE, null, sessionStorage) ?? { mensagens: [{ de: "ia", texto: BOAS_VINDAS }], etapa: 0, dados: {} };
  const salvar = () => NX.guardar(CHAVE, estado, sessionStorage);

  const raiz = document.createElement("div");
  raiz.className = "nx-chat";
  raiz.innerHTML = `
    <button class="nx-chat-abrir" type="button" aria-expanded="false" aria-controls="nx-chat-painel">
      <span class="nx-chat-pulso" aria-hidden="true"></span>
      <img class="nx-blue-av" src="assets/img/blue-avatar.webp" alt="" width="28" height="28">
      <span class="nx-chat-rotulo">Fale com a Blue</span>
    </button>
    <section class="nx-chat-painel" id="nx-chat-painel" role="dialog" aria-label="Conversa com a Blue, assistente de IA da Nexor" hidden>
      <header>
        <img class="nx-chat-avatar" src="assets/img/blue-avatar.webp" alt="" width="38" height="38">
        <div><b>Blue</b><small><span class="nx-online"></span> assistente de IA da Nexor</small></div>
        <button class="nx-chat-fechar" type="button" aria-label="Fechar conversa">×</button>
      </header>
      <div class="nx-chat-msgs" aria-live="polite"></div>
      <div class="nx-chat-sugestoes"></div>
      <form class="nx-chat-form" data-form="blue">
        <label class="sr-only" for="nx-chat-campo">Sua mensagem</label>
        <textarea id="nx-chat-campo" rows="1" maxlength="2000" placeholder="Escreva sua mensagem…"></textarea>
        <button type="submit" aria-label="Enviar"><svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg></button>
      </form>
      <p class="nx-chat-aviso">Seus dados são usados só para a Nexor falar com você (LGPD). Prefere uma pessoa? WhatsApp (34) 99733-7499.</p>
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
  // Outros pontos do site podem abrir a Blue: <button data-abrir-blue>
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-abrir-blue]")) abrir(true);
  });

  /* ---------- Atendimento guiado (sem servidor) ---------- */
  const SOLUCAO_POR_TEMA = [
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
        return [(s ? `Ótimo! Para isso, a solução ideal é o ${s[1]}. ` : "Entendi! A Nexor tem uma solução para isso. ") + "Para eu te ajudar melhor, qual é o seu nome?"];
      }
      case 1:
        d.nome = texto.replace(/^(meu nome [eé]|sou o|sou a|eu sou)\s+/i, "").slice(0, 80);
        estado.etapa = 2;
        return [`Prazer, ${d.nome.split(" ")[0]}! Qual o nome da sua empresa e o ramo?`];
      case 2:
        d.empresa = texto.slice(0, 120);
        estado.etapa = 3;
        return ["Perfeito. Qual o seu WhatsApp com DDD? Assim um especialista te manda uma proposta e um diagnóstico gratuito."];
      case 3: {
        if (texto.replace(/\D/g, "").length < 10) return ["Parece que faltou algum número. Pode mandar o WhatsApp com DDD? Ex.: (34) 99999-9999"];
        d.telefone = texto;
        estado.etapa = 4;
        NX.enviarLead("blue", d, { formulario: "blue" });
        const resumo = `Olá! Conversei com a Blue no site. Sou ${d.nome}, da ${d.empresa}. Preciso de: ${d.mensagem}`;
        return [
          `Prontinho, ${d.nome.split(" ")[0]}! Já passei tudo para a equipe e um especialista vai te chamar no WhatsApp. Enquanto isso, você pode testar nossas soluções grátis por 12 horas aqui no site.`,
          { texto: "Se preferir, já pode chamar agora:", link: whatsUrl(resumo) },
        ];
      }
      default:
        return [{ texto: "Sua solicitação já está com a equipe. Quer adiantar a conversa?", link: whatsUrl(`Olá! Conversei com a Blue no site. Sou ${d.nome}, da ${d.empresa}.`) }];
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
        respostas = [(await r.json()).resposta];
      } catch {
        respostas = [{ texto: "Não consegui responder agora. Fale com a equipe pelo WhatsApp:", link: whatsUrl("Olá! Vim pelo site da Nexor.") }];
      }
    } else {
      await new Promise((r) => setTimeout(r, 650));
      respostas = guiado(texto);
    }
    digitando.remove();
    for (const r of respostas) {
      const m = typeof r === "string" ? { de: "ia", texto: r } : { de: "ia", ...r };
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
