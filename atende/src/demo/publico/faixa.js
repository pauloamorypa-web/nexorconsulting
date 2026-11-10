/* Faixa do Modo Demonstração: "Demonstração · dados fictícios", troca de papel, simulador de cliente
   chegando pelo WhatsApp e "Reiniciar demonstração". Lê GET /api/demo; se responder 404, não mostra nada. */

const el = (tag, attrs = {}, ...filhos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined) e.append(f);
  return e;
};
const post = (caminho, corpo) => fetch(caminho, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-nexor": "1" }, body: JSON.stringify(corpo ?? {}) }).then((r) => r.json());

async function iniciar() {
  let info;
  try {
    const r = await fetch("/api/demo", { credentials: "same-origin" });
    if (!r.ok) return;
    info = await r.json();
  } catch {
    return;
  }
  if (!info?.demo) return;
  document.body.classList.add("modo-demo");

  const ROTULO = { dono: "Dono", admin: "Admin", atendente: "Atendente" };
  const papeis = el("div", { class: "demo-papeis" }, el("span", {}, "Entrar como:"), info.papeis.map((p) => el("a", { href: p.url, title: `${p.nome} · ${p.descricao}`, "aria-current": p.papel === info.papel_atual ? "true" : null }, ROTULO[p.papel] ?? p.papel)));
  const painel = criarPainel(info);
  const faixa = el(
    "div",
    { class: "demo-faixa", role: "region", "aria-label": "Modo demonstração" },
    el("span", { class: "demo-ponto", "aria-hidden": "true" }),
    el("strong", {}, "Demonstração · dados fictícios"),
    el("span", { class: "demo-texto-longo" }, `Clínica Sorriso · IA ${info.ia}`),
    papeis,
    info.papel_atual ? el("button", { type: "button", class: "demo-simular", onclick: () => painel.alternar() }, "💬 Cliente chegando") : null,
    el(
      "button",
      {
        type: "button",
        class: "demo-reiniciar",
        onclick: async (e) => {
          if (!confirm("Reiniciar a demonstração? Todos os dados voltam ao estado original.")) return;
          e.currentTarget.disabled = true;
          await post("/api/demo/reiniciar");
          location.href = info.papel_atual ? `/demo/entrar?papel=${info.papel_atual}` : "/";
        },
      },
      "Reiniciar demonstração",
    ),
  );
  document.body.prepend(faixa);
  if (painel.no) document.body.append(painel.no);
}

/** Painel para o vendedor fazer o papel do cliente no WhatsApp */
function criarPainel(info) {
  if (!info.papel_atual) return { alternar() {} };
  let numero = info.cliente_padrao.de;
  let relogio;
  const opcoes = el("div", { class: "demo-chips demo-opcoes" });
  const blocoOpcoes = el("div", { hidden: true }, el("p", {}, "A IA enviou botões. Toque como o cliente:"), opcoes);
  const texto = el("input", { type: "text", placeholder: "Digite como o cliente…", maxlength: "500", "aria-label": "Mensagem do cliente" });
  const de = el("input", { type: "text", value: `${info.cliente_padrao.nome}`, "aria-label": "Quem envia (nome de contato ou número)", title: "Nome de um contato da demo (ex.: Fernanda) ou um número" });
  const status = el("small", {}, `Chega como mensagem de WhatsApp de ${info.cliente_padrao.nome} (55 34 99999-7001).`);

  async function enviar(t) {
    if (!t.trim()) return;
    const quem = de.value.trim();
    const r = await post("/api/demo/receber", { de: !quem || quem === info.cliente_padrao.nome ? info.cliente_padrao.de : quem, texto: t });
    if (r?.ok) {
      numero = r.de;
      status.textContent = `✓ Enviado por ${r.nome}. Veja a IA responder no painel.`;
      texto.value = "";
      if (r.conversa_id && !location.hash.startsWith(`#/conversas/${r.conversa_id}`)) location.hash = `#/conversas/${r.conversa_id}`;
      vigiar();
    } else status.textContent = r?.erro ?? "Não foi possível enviar.";
  }

  async function atualizarOpcoes() {
    try {
      const lista = await fetch(`/api/demo/mensagens?para=${numero}`, { credentials: "same-origin" }).then((r) => r.json());
      const ultima = lista[0];
      opcoes.replaceChildren(...(ultima?.opcoes ?? []).map((o) => el("button", { type: "button", onclick: () => enviar(o) }, o)));
      blocoOpcoes.hidden = !ultima?.opcoes?.length;
    } catch {
      /* sem rede local */
    }
  }
  function vigiar() {
    clearInterval(relogio);
    let n = 0;
    relogio = setInterval(() => (++n > 12 ? clearInterval(relogio) : atualizarOpcoes()), 1000);
  }

  const no = el(
    "div",
    { class: "demo-painel", hidden: true, role: "dialog", "aria-label": "Simular cliente" },
    el("h3", {}, "💬 Simular cliente no WhatsApp"),
    el("p", {}, "A mensagem entra pelo mesmo caminho do webhook da Meta e a IA responde ao vivo."),
    el("div", { class: "demo-chips" }, info.roteiro.map((t) => el("button", { type: "button", onclick: () => enviar(t) }, t))),
    blocoOpcoes,
    el("form", { class: "demo-linha", onsubmit: (e) => (e.preventDefault(), enviar(texto.value)) }, texto, el("button", { class: "demo-enviar", type: "submit" }, "Enviar")),
    el("div", { class: "demo-linha" }, el("small", { style: "align-self:center" }, "De:"), de),
    status,
  );
  return {
    no,
    alternar() {
      no.hidden = !no.hidden;
      if (!no.hidden) {
        atualizarOpcoes();
        texto.focus();
      }
    },
  };
}

iniciar();
