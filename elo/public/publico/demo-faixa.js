/* Faixa do Modo Demonstração (app do instalador e páginas do cliente). Fora da demonstração, GET /api/demo
   responde 404 e nada aparece. Sem innerHTML com dados: tudo entra como texto. */
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
    try {
      const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "x-nexor": "1", "content-type": "application/json" }, body: JSON.stringify(corpo ?? {}) });
      return await r.json();
    } catch {
      return { erro: "Sem conexão com a internet." };
    }
  };
  const el = (tag, at = {}, ...filhos) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(at)) k === "class" ? (e.className = v) : e.setAttribute(k, v);
    for (const f of filhos) if (f != null) e.append(f);
    return e;
  };
  const estilo = document.createElement("style");
  estilo.textContent = `
    .nx-demo{position:sticky;top:0;z-index:300;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:7px 12px;background:#f59e0b;color:#1c1917;font:600 13px/1.3 system-ui,sans-serif}
    .nx-demo b{font-weight:800}.nx-demo .nx-esp{flex:1}
    .nx-demo button,.nx-demo a{font:inherit;font-weight:700;border:0;border-radius:999px;padding:6px 11px;background:#1c1917;color:#fef3c7;cursor:pointer;text-decoration:none;min-height:32px}
    .nx-demo .nx-leve{background:rgba(28,25,23,.12);color:#1c1917}
    .nx-demo .nx-mais{display:none}
    .nx-demo .nx-armado{background:#b91c1c;color:#fff}
    @media (max-width:760px){.nx-demo .nx-op{display:none}.nx-demo .nx-mais{display:inline-block}.nx-demo.aberta .nx-op{display:inline-block}}
    .nx-demo-msgs{position:fixed;right:12px;bottom:12px;z-index:301;width:min(380px,calc(100vw - 24px));max-height:60vh;overflow:auto;background:#0f172a;color:#e2e8f0;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);font:13px/1.4 system-ui,sans-serif}
    .nx-demo-msgs header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #1e293b;font-weight:700;position:sticky;top:0;background:#0f172a}
    .nx-demo-msgs header button{background:none;border:0;color:#cbd5e1;font-size:20px;cursor:pointer;min-width:32px;min-height:32px}
    .nx-demo-msgs ol{list-style:none;margin:0;padding:8px 12px 12px}.nx-demo-msgs li{padding:7px 0;border-bottom:1px solid #1e293b;overflow-wrap:anywhere}
    .nx-demo-msgs small{color:#94a3b8;display:block}
    .nx-demo-aviso{position:fixed;left:50%;transform:translateX(-50%);top:56px;z-index:302;background:#0f172a;color:#f8fafc;padding:10px 14px;border-radius:12px;font:600 13.5px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:calc(100vw - 32px)}`;
  document.head.append(estilo);

  const publico = /^\/(p|os)\//.test(location.pathname);
  const faixa = el("div", { class: "nx-demo", role: "region", "aria-label": "Modo Demonstração" });
  const texto = el("span", {}, el("b", {}, "Demonstração"), " · dados fictícios");
  const mais = el("button", { type: "button", class: "nx-mais nx-leve", "data-a": "mais", "aria-expanded": "false" }, "Opções");
  const msgs = el("button", { type: "button", class: "nx-op nx-leve", "data-a": "msgs" }, "Mensagens enviadas");
  const pagar = el("button", { type: "button", class: "nx-op nx-leve", "data-a": "pagar" }, "Simular pagamento do cliente");
  const trocar = el("a", { class: "nx-op", href: "/demo" }, "Trocar de perfil");
  const reiniciar = el("button", { type: "button", class: "nx-op", "data-a": "reiniciar" }, "Reiniciar");
  faixa.append(texto, el("span", { class: "nx-esp" }), mais, msgs, pagar, trocar, reiniciar);
  document.body.prepend(faixa);

  function avisar(t) {
    document.querySelector(".nx-demo-aviso")?.remove();
    const a = el("div", { class: "nx-demo-aviso", role: "status" }, t);
    document.body.append(a);
    setTimeout(() => a.remove(), 4000);
  }
  const NOME = { whatsapp: "WhatsApp", email: "E-mail", asaas: "Asaas", sms: "SMS" };
  async function mensagens() {
    document.querySelector(".nx-demo-msgs")?.remove();
    let lista = [];
    try {
      lista = await (await fetch("/api/demo/mensagens", { cache: "no-store" })).json();
    } catch {
      return avisar("Sem conexão com a internet.");
    }
    const fechar = el("button", { type: "button", "aria-label": "Fechar" }, "×");
    const ol = el("ol");
    const caixa = el("section", { class: "nx-demo-msgs", role: "dialog", "aria-label": "Mensagens enviadas (simuladas)" }, el("header", {}, "O que o sistema enviou (simulado)", fechar), ol);
    if (!lista.length) ol.append(el("li", {}, "Nada enviado ainda. Envie uma proposta pelo app."));
    for (const m of lista) {
      const quando = m.em ? new Date(m.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
      ol.append(el("li", {}, el("small", {}, `${NOME[m.canal] ?? m.canal} · ${m.para ?? ""} · ${quando}`), el("span", {}, m.texto ?? "")));
    }
    fechar.onclick = () => caixa.remove();
    document.body.append(caixa);
    fechar.focus();
  }
  let armado = 0;
  faixa.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-a]");
    const a = b?.dataset.a;
    if (!a) return;
    if (a === "mais") return mais.setAttribute("aria-expanded", String(faixa.classList.toggle("aberta")));
    if (a === "msgs") return mensagens();
    if (a === "reiniciar") {
      // Dois toques com pausa (o mesmo gesto não confirma)
      const agora = Date.now();
      if (!armado || agora - armado > 8000) {
        armado = agora;
        b.textContent = "Toque de novo para reiniciar";
        b.classList.add("nx-armado");
        setTimeout(() => {
          if (Date.now() - armado >= 8000) {
            armado = 0;
            b.textContent = "Reiniciar";
            b.classList.remove("nx-armado");
          }
        }, 8100);
        return;
      }
      if (agora - armado < 800) return;
      b.disabled = true;
      await post("/api/demo/reiniciar");
      return location.assign("/demo");
    }
    if (a === "pagar") {
      if (b.disabled) return;
      b.disabled = true;
      const r = await post("/api/demo/pagar");
      b.disabled = false;
      if (r.ok) {
        avisar("Pagamento confirmado pelo Asaas (simulado): a proposta está paga e o split foi feito.");
        dispatchEvent(new CustomEvent("nx-demo-pago"));
        setTimeout(() => (publico ? location.reload() : dispatchEvent(new HashChangeEvent("hashchange"))), 1200);
      } else avisar(r.erro ?? "Não foi possível simular o pagamento.");
    }
  });
})();
