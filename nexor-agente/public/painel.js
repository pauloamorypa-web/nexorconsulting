/* Painel do Nexor Agente: conversa, aprovações e histórico. Sem dependências externas. */
(() => {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, texto) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  };
  const hora = (t) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dia = (t) => {
    const d = new Date(t);
    const hoje = new Date();
    const ontem = new Date(Date.now() - 86400000);
    if (d.toDateString() === hoje.toDateString()) return "Hoje";
    if (d.toDateString() === ontem.toDateString()) return "Ontem";
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  };
  const quando = (t) => `${dia(t)}, ${hora(t)}`;
  const ACAO = { GET: "consultar", POST: "criar", PUT: "alterar", PATCH: "alterar", DELETE: "apagar" };

  let demo = null;
  let estado = null;
  let ocupado = false;
  let assinatura = "";
  let assinaturaEnviadas = "";

  async function api(caminho, corpo) {
    const r = await fetch(caminho, corpo === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(dados.erro || `erro ${r.status}`), { status: r.status });
    return dados;
  }

  // ---------- entrada ----------
  async function mostrarEntrada(senha) {
    $("#painel").hidden = true;
    $("#entrada").hidden = false;
    $("#form-entrar").hidden = !senha;
    const papeis = $("#papeis");
    papeis.hidden = !demo;
    papeis.replaceChildren();
    if (demo) {
      papeis.append(el("p", null, "Escolha com quem entrar na demonstração:"));
      for (const p of demo.papeis) {
        const a = el("a");
        a.href = p.url;
        a.append(el("strong", null, p.nome), el("small", null, p.descricao));
        papeis.append(a);
      }
    }
  }

  $("#form-entrar").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("#erro-entrar").textContent = "";
    try {
      await api("/api/entrar", { senha: $("#senha").value });
      iniciar();
    } catch (e) {
      $("#erro-entrar").textContent = e.message;
    }
  });
  $("#sair").addEventListener("click", async () => {
    await api("/api/sair", {}).catch(() => {});
    location.href = "/";
  });

  // ---------- conversa ----------
  function balao(m, pendentes) {
    if (m.tipo === "aprovacao") {
      const li = el("li", "msg agente aprovacao");
      li.append(el("strong", null, `🔐 Pedido ${m.id} · precisa da sua aprovação`), document.createTextNode(m.texto));
      if (pendentes.has(m.id)) li.append(botoes(m.id));
      else li.append(el("span", "meta", `${hora(m.em)} · já decidido`));
      return li;
    }
    const li = el("li", `msg ${m.de === "dono" ? "dono" : "agente"}`, m.texto);
    li.append(el("span", "meta", `${hora(m.em)} · ${m.canal === "painel" ? "painel" : "WhatsApp"}`));
    return li;
  }

  function botoes(id) {
    const d = el("div", "acoes");
    const sim = el("button", "aprovar", "✅ Aprovar");
    const nao = el("button", "recusar", "✖️ Recusar");
    sim.type = nao.type = "button";
    sim.dataset.aprovar = id;
    nao.dataset.recusar = id;
    sim.addEventListener("click", () => decidir(id, "aprovar"));
    nao.addEventListener("click", () => decidir(id, "recusar"));
    d.append(sim, nao);
    return d;
  }

  function desenharConversa(forcar) {
    const lista = $("#mensagens");
    const pend = new Set(estado.pendentes.map((p) => p.id));
    const ass = JSON.stringify([estado.conversa.length, estado.conversa.at(-1)?.em, [...pend], ocupado]);
    if (!forcar && ass === assinatura) return;
    assinatura = ass;
    const perto = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
    lista.replaceChildren();
    let ultimoDia = "";
    if (!estado.conversa.length) lista.append(el("li", "dia", "Comece pedindo algo ao agente 👇"));
    for (const m of estado.conversa) {
      const d = dia(m.em);
      if (d !== ultimoDia) lista.append(el("li", "dia", (ultimoDia = d)));
      lista.append(balao(m, pend));
    }
    if (ocupado) lista.append(el("li", "digitando", `${estado.agente.nome} está digitando…`));
    if (perto || forcar) lista.scrollTop = lista.scrollHeight;
  }

  function desenharPendentes() {
    const ul = $("#pendentes");
    ul.replaceChildren();
    $("#n-pend").textContent = String(estado.pendentes.length);
    if (!estado.pendentes.length) ul.append(el("li", "vazio", "Nada esperando aprovação. 👍"));
    for (const p of estado.pendentes) {
      const li = el("li", "pendente");
      li.dataset.id = p.id;
      li.append(el("p", null, p.resumo), el("small", null, `${p.id} · ${p.conector} · ${ACAO[p.metodo] ?? p.metodo} · ${quando(p.criadoEm)}`), botoes(p.id));
      ul.append(li);
    }
  }

  function desenharHistorico() {
    const ul = $("#historico");
    ul.replaceChildren();
    if (!estado.historico.length) ul.append(el("li", "vazio", "Nenhuma tarefa ainda."));
    const icone = { executado: "🔎", aprovado_executado: "✅", recusado: "✖️", erro_execucao: "⚠️", bloqueado: "⛔", bloqueado_licenca: "⛔" };
    const rotulo = { executado: "consulta", aprovado_executado: "aprovado e executado", recusado: "recusado", erro_execucao: "falhou", bloqueado: "bloqueado", bloqueado_licenca: "bloqueado pela licença" };
    for (const h of estado.historico) {
      const li = el("li");
      const corpo = el("div");
      corpo.append(el("div", null, h.resumo || `${h.metodo} ${h.conector}${h.caminho}`), el("small", null, `${quando(h.em)} · ${h.conector ?? ""} · ${rotulo[h.evento] ?? h.evento}`));
      li.append(el("span", "icone", icone[h.evento] ?? "•"), corpo);
      ul.append(li);
    }
  }

  async function atualizar(forcar = false) {
    try {
      estado = await api("/api/painel");
    } catch (e) {
      if (e.status === 401) return location.reload();
      return;
    }
    $("#nome-agente").textContent = estado.agente.nome;
    $("#avatar").textContent = estado.agente.nome.slice(0, 1).toUpperCase();
    $("#empresa").textContent = estado.agente.empresa || "Painel do dono";
    $("#usuario").textContent = estado.usuario.nome;
    $("#texto").placeholder = `Peça algo à ${estado.agente.nome}…`;
    desenharConversa(forcar);
    desenharPendentes();
    desenharHistorico();
    if (demo) atualizarEnviadas();
  }

  async function atualizarEnviadas() {
    const { mensagens } = await api("/api/demo/mensagens").catch(() => ({ mensagens: [] }));
    const ass = JSON.stringify(mensagens.map((m) => m.id));
    if (ass === assinaturaEnviadas) return;
    assinaturaEnviadas = ass;
    const ul = $("#enviadas");
    ul.replaceChildren();
    if (!mensagens.length) ul.append(el("li", "vazio", "Nenhuma mensagem enviada ainda."));
    for (const m of mensagens) {
      const li = el("li", m.canal === "email" ? "email" : "");
      const quem = m.origem === "agente" ? `para o dono (+${m.para})` : `${m.nome || m.para} (${m.canal === "email" ? m.para : "+" + m.para})`;
      li.append(el("small", null, `${m.canal === "email" ? "✉️ E-mail" : "💬 WhatsApp"} · ${quem} · ${hora(m.em)}`), document.createElement("br"), document.createTextNode(m.texto + (m.botoes ? `\n[${m.botoes.join("] [")}]` : "")));
      ul.append(li);
    }
  }

  async function enviar(texto) {
    texto = texto.trim();
    if (!texto || ocupado) return;
    ocupado = true;
    $("#enviar").disabled = true;
    estado.conversa.push({ de: "dono", canal: "painel", texto, em: Date.now() });
    desenharConversa(true);
    try {
      await api("/api/chat", { texto });
    } catch (e) {
      estado.conversa.push({ de: "agente", canal: "painel", texto: `⚠️ ${e.message}`, em: Date.now() });
    }
    ocupado = false;
    $("#enviar").disabled = false;
    await atualizar(true);
    $("#texto").focus();
  }

  async function decidir(id, acao) {
    if (ocupado) return;
    ocupado = true;
    document.querySelectorAll(`[data-aprovar="${id}"], [data-recusar="${id}"]`).forEach((b) => (b.disabled = true));
    desenharConversa(true);
    try {
      await api(`/api/aprovacoes/${id}`, { acao });
    } catch (e) {
      alert(e.message);
    }
    ocupado = false;
    await atualizar(true);
  }

  $("#form-chat").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = $("#texto").value;
    $("#texto").value = "";
    enviar(t);
  });
  $("#sugestoes").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (b) enviar(b.textContent);
  });
  $("#form-receber").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const texto = $("#texto-whats").value.trim();
    if (!texto || ocupado) return;
    $("#texto-whats").value = "";
    ocupado = true;
    estado.conversa.push({ de: "dono", canal: "whatsapp", texto, em: Date.now() });
    desenharConversa(true);
    await api("/api/demo/receber", { texto }).catch(() => {});
    ocupado = false;
    await atualizar(true);
  });

  async function iniciar() {
    demo = await (window.nexorDemo ?? Promise.resolve(null));
    const sessao = await api("/api/sessao").catch(() => ({ logado: false, senha: !demo }));
    if (!sessao.logado) return mostrarEntrada(sessao.senha);
    $("#entrada").hidden = true;
    $("#painel").hidden = false;
    $("#sair").hidden = Boolean(demo);
    $("#bloco-whats").hidden = !demo;
    $("#usuario").textContent = sessao.nome;
    await atualizar(true);
    setInterval(() => !ocupado && atualizar(), 2500);
  }

  iniciar();
})();
