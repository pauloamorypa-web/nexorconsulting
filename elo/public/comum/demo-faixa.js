/* Faixa do Modo Demonstração do Nexor Elo (página de entrada, painel do fornecedor e operação Nexor).
   Fora da demonstração, /api/demo responde 404 e nada aparece. Sem script em linha (CSP script-src 'self'). */
(async () => {
  let demo;
  try {
    const r = await fetch("/api/demo", { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) return;
    demo = await r.json();
  } catch {
    return;
  }
  if (!demo?.demo) return;
  const post = async (url, corpo) => {
    const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "x-nexor": "1", "content-type": "application/json" }, body: JSON.stringify(corpo ?? {}) });
    return r.json().catch(() => ({ erro: `Erro ${r.status}` }));
  };
  const el = (tag, attrs = {}, texto) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (texto !== undefined) e.textContent = texto;
    return e;
  };
  const estilo = document.createElement("style");
  estilo.textContent = `
    .nx-demo{position:sticky;top:0;z-index:300;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:7px 12px;background:#f59e0b;color:#1c1917;font:600 13px/1.3 system-ui,sans-serif}
    .nx-demo b{font-weight:800}.nx-demo .nx-esp{flex:1}
    .nx-demo button,.nx-demo a{font:inherit;font-weight:700;border:0;border-radius:999px;padding:5px 11px;background:#1c1917;color:#fef3c7;cursor:pointer;text-decoration:none}
    .nx-demo button:focus-visible,.nx-demo a:focus-visible{outline:2px solid #1c1917;outline-offset:2px}
    .nx-demo button.nx-leve{background:rgba(28,25,23,.14);color:#1c1917}
    .nx-demo button:disabled{opacity:.6;cursor:wait}
    .nx-demo .nx-mais{display:none}
    @media (max-width:700px){.nx-demo .nx-op{display:none}.nx-demo .nx-mais{display:inline-block}.nx-demo.aberta .nx-op{display:inline-block}.nx-demo .nx-esp{display:none}.nx-demo .nx-emp{display:none}}
    .nx-demo-msgs{position:fixed;right:12px;bottom:12px;z-index:301;width:min(380px,calc(100vw - 24px));max-height:60vh;overflow:auto;background:#0f172a;color:#e2e8f0;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);font:13px/1.4 system-ui,sans-serif}
    .nx-demo-msgs header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #1e293b;font-weight:700;position:sticky;top:0;background:#0f172a}
    .nx-demo-msgs header button{background:none;border:0;color:#cbd5e1;font-size:20px;cursor:pointer;line-height:1;padding:2px 6px}
    .nx-demo-msgs ol{list-style:none;margin:0;padding:8px 12px 12px}.nx-demo-msgs li{padding:7px 0;border-bottom:1px solid #1e293b;overflow-wrap:anywhere}
    .nx-demo-msgs small{color:#94a3b8;display:block}`;
  document.head.append(estilo);

  const fornecedor = location.pathname.startsWith("/fornecedor");
  const faixa = el("div", { class: "nx-demo", role: "region", "aria-label": "Modo Demonstração" });
  const rotulo = el("span");
  rotulo.append(el("b", {}, "Demonstração"), document.createTextNode(" · dados fictícios"));
  const emp = el("span", { class: "nx-emp" }, demo.empresa ? ` · ${demo.empresa}` : "");
  rotulo.append(emp);
  const botao = (texto, a, classe = "nx-op nx-leve") => el("button", { type: "button", class: classe, "data-a": a }, texto);
  const mais = botao("Opções", "mais", "nx-mais nx-leve");
  mais.setAttribute("aria-expanded", "false");
  const trocar = el("a", { class: "nx-op", href: "/demo" }, "Trocar de perfil");
  faixa.append(rotulo, el("span", { class: "nx-esp" }), mais, botao("Mensagens enviadas", "msgs"));
  if (fornecedor) faixa.append(botao("Simular pagamento", "pagar"));
  faixa.append(trocar, botao("Reiniciar demonstração", "reiniciar", "nx-op"));
  document.body.prepend(faixa);
  // A casca dos painéis desconta a altura da faixa (sem rolagem extra da página)
  const medir = () => document.documentElement.style.setProperty("--faixa-demo", `${faixa.offsetHeight}px`);
  medir();
  new ResizeObserver(medir).observe(faixa);

  const nomeCanal = { whatsapp: "WhatsApp", email: "E-mail", asaas: "Asaas", sms: "SMS", focus: "Focus NFe" };
  async function mensagens() {
    document.querySelector(".nx-demo-msgs")?.remove();
    let lista = [];
    try {
      lista = await fetch("/api/demo/mensagens", { cache: "no-store" }).then((r) => r.json());
    } catch {
      lista = [];
    }
    const caixa = el("section", { class: "nx-demo-msgs", role: "dialog", "aria-label": "Mensagens enviadas (simuladas)" });
    const cab = el("header", {}, "O que o sistema enviou (simulado)");
    const fechar = el("button", { type: "button", "aria-label": "Fechar" }, "×");
    cab.append(fechar);
    const ol = el("ol");
    if (!lista.length) ol.append(el("li", {}, "Nada enviado ainda. Envie uma proposta pelo app do instalador ou simule um pagamento."));
    for (const m of lista) {
      const li = el("li");
      const quando = m.em ? new Date(m.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
      li.append(el("small", {}, [nomeCanal[m.canal] ?? m.canal, m.para, quando].filter(Boolean).join(" · ")), el("span", {}, m.texto ?? m.assunto ?? ""));
      ol.append(li);
    }
    caixa.append(cab, ol);
    fechar.onclick = () => caixa.remove();
    caixa.addEventListener("keydown", (e) => e.key === "Escape" && caixa.remove());
    document.body.append(caixa);
    fechar.focus();
  }
  faixa.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-a]");
    const a = b?.dataset.a;
    if (!a || b.disabled) return;
    if (a === "mais") return b.setAttribute("aria-expanded", String(faixa.classList.toggle("aberta")));
    if (a === "msgs") return mensagens();
    b.disabled = true;
    try {
      if (a === "reiniciar") {
        if (!confirm("Voltar a demonstração ao estado original? Tudo o que foi feito agora será desfeito.")) return;
        const r = await post("/api/demo/reiniciar");
        if (r.ok) return location.assign("/demo");
        alert(r.erro ?? "Não foi possível reiniciar.");
      }
      if (a === "pagar") {
        const r = await post("/api/demo/pagar");
        alert(r.ok ? "Pagamento confirmado pelo Asaas (simulado). A proposta virou paga, o estoque saiu e o repasse do split apareceu em Financeiro." : r.erro);
        if (r.ok) location.reload();
      }
    } finally {
      b.disabled = false;
    }
  });
})();
