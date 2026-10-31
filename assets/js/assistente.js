/* Nexor Assist — chat com o agente de IA no site.
   Depois de publicar o servidor do agente (pasta agent/), coloque o endereço dele aqui.
   Enquanto estiver vazio, o botão do chat não aparece. */
const NEXOR_AGENT_URL = "";

(() => {
  if (!NEXOR_AGENT_URL) return;

  const SUGESTOES = ["Quero automatizar meu WhatsApp", "Preciso de um sistema de gestão", "Quero agendar um diagnóstico"];
  const BOAS_VINDAS = "Olá! Sou o Nexor Assist, o assistente de IA da Nexor 👋 Me conta: o que você quer resolver na sua empresa?";
  const CHAVE = "nexor-assist";

  const lerEstado = () => {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE)) ?? null;
    } catch {
      return null;
    }
  };
  const salvarEstado = (estado) => {
    try {
      sessionStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch {
      /* armazenamento indisponível: o chat funciona sem ele */
    }
  };

  const novaSessao = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^A-Za-z0-9-]/g, "");
  const estado = lerEstado() ?? { sessao: novaSessao(), mensagens: [{ de: "ia", texto: BOAS_VINDAS }] };

  const raiz = document.createElement("div");
  raiz.className = "nx-chat";
  raiz.innerHTML = `
    <button class="nx-chat-abrir" type="button" aria-expanded="false" aria-controls="nx-chat-painel">
      <span class="nx-chat-pulso" aria-hidden="true"></span>
      <svg class="ic" aria-hidden="true"><use href="#i-brain"/></svg>
      <span class="nx-chat-rotulo">Fale com a IA</span>
    </button>
    <section class="nx-chat-painel" id="nx-chat-painel" role="dialog" aria-label="Chat com o Nexor Assist" hidden>
      <header>
        <span class="nx-chat-avatar" aria-hidden="true">✦</span>
        <div><b>Nexor Assist</b><small><span class="nx-online"></span> IA da Nexor · responde na hora</small></div>
        <button class="nx-chat-fechar" type="button" aria-label="Fechar chat">×</button>
      </header>
      <div class="nx-chat-msgs" aria-live="polite"></div>
      <div class="nx-chat-sugestoes"></div>
      <form class="nx-chat-form">
        <label class="sr-only" for="nx-chat-campo">Sua mensagem</label>
        <textarea id="nx-chat-campo" rows="1" maxlength="2000" placeholder="Escreva sua mensagem…"></textarea>
        <button type="submit" aria-label="Enviar"><svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg></button>
      </form>
      <p class="nx-chat-aviso">Assistente de IA. Para falar com uma pessoa: WhatsApp (34) 99733-7499.</p>
    </section>`;
  document.body.appendChild(raiz);

  const botao = raiz.querySelector(".nx-chat-abrir");
  const painel = raiz.querySelector(".nx-chat-painel");
  const lista = raiz.querySelector(".nx-chat-msgs");
  const sugestoes = raiz.querySelector(".nx-chat-sugestoes");
  const form = raiz.querySelector(".nx-chat-form");
  const campo = raiz.querySelector("textarea");
  let enviando = false;

  const desenharMensagem = ({ de, texto }) => {
    const p = document.createElement("p");
    p.className = `nx-msg nx-${de}`;
    p.textContent = texto;
    lista.appendChild(p);
    lista.scrollTop = lista.scrollHeight;
  };

  const desenharSugestoes = () => {
    sugestoes.innerHTML = "";
    if (estado.mensagens.length > 1) return;
    for (const s of SUGESTOES) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s;
      b.addEventListener("click", () => enviar(s));
      sugestoes.appendChild(b);
    }
  };

  estado.mensagens.forEach(desenharMensagem);
  desenharSugestoes();

  const abrir = (aberto) => {
    painel.hidden = !aberto;
    botao.setAttribute("aria-expanded", String(aberto));
    raiz.classList.toggle("aberto", aberto);
    if (aberto) {
      lista.scrollTop = lista.scrollHeight;
      campo.focus();
    } else botao.focus();
  };
  botao.addEventListener("click", () => abrir(painel.hidden));
  raiz.querySelector(".nx-chat-fechar").addEventListener("click", () => abrir(false));
  painel.addEventListener("keydown", (e) => e.key === "Escape" && abrir(false));

  async function enviar(texto) {
    texto = texto.trim();
    if (!texto || enviando) return;
    enviando = true;
    campo.value = "";
    campo.style.height = "";
    const minha = { de: "eu", texto };
    estado.mensagens.push(minha);
    desenharMensagem(minha);
    desenharSugestoes();
    salvarEstado(estado);

    const digitando = document.createElement("p");
    digitando.className = "nx-msg nx-ia nx-digitando";
    digitando.innerHTML = "<i></i><i></i><i></i>";
    digitando.setAttribute("aria-label", "Nexor Assist está digitando");
    lista.appendChild(digitando);
    lista.scrollTop = lista.scrollHeight;

    let resposta;
    try {
      const r = await fetch(`${NEXOR_AGENT_URL.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessao: estado.sessao, mensagem: texto }),
      });
      if (!r.ok) throw new Error(String(r.status));
      resposta = (await r.json()).resposta;
    } catch {
      resposta = "Não consegui responder agora. Tente de novo em instantes ou fale com a equipe no WhatsApp (34) 99733-7499.";
    }
    digitando.remove();
    const dela = { de: "ia", texto: resposta };
    estado.mensagens.push(dela);
    desenharMensagem(dela);
    salvarEstado(estado);
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
