/* Faixa do Modo Demonstração (servida em /demo/faixa.js só com DEMO=1).
   Lê GET /api/demo: se responder 404 (fora da demonstração), não mostra nada. */
(() => {
  if (window.__faixaDemo) return;
  window.__faixaDemo = true;
  const ALTURA = 38;
  const css = `
  .nx-demo-faixa { position: fixed; top: 0; left: 0; right: 0; height: ${ALTURA}px; z-index: 1000; display: flex; align-items: center; gap: 10px; padding: 0 12px;
    background: #f59e0b; color: #1f1300; font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; box-shadow: 0 1px 0 rgba(0,0,0,.15); }
  .nx-demo-faixa .nx-demo-titulo { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nx-demo-faixa .nx-demo-acoes { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .nx-demo-faixa select, .nx-demo-faixa button { font: inherit; font-size: 12.5px; border-radius: 7px; border: 1px solid rgba(31,19,0,.35); background: rgba(255,255,255,.85); color: #1f1300; padding: 4px 8px; cursor: pointer; }
  .nx-demo-faixa button:hover, .nx-demo-faixa select:hover { background: #fff; }
  html.nx-demo body { padding-top: ${ALTURA}px; }
  html.nx-demo .casca { height: calc(100dvh - ${ALTURA}px); }
  html.nx-demo .lateral { top: ${ALTURA}px; }
  html.nx-demo .login, html.nx-demo .carregando-tela { min-height: calc(100vh - ${ALTURA}px); height: auto; }
  @media (max-width: 560px) { .nx-demo-faixa .nx-demo-extra { display: none; } }`;

  const papelAtual = () => (document.cookie.match(/(?:^|;\s*)nx_demo_papel=([^;]+)/) ?? [])[1] ?? "";

  async function montar() {
    let info;
    try {
      const r = await fetch("/api/demo", { headers: { "x-nexor": "1" } });
      if (!r.ok) return;
      info = await r.json();
    } catch {
      return;
    }
    if (!info?.demo) return;
    const estilo = document.createElement("style");
    estilo.textContent = css;
    document.head.appendChild(estilo);
    document.documentElement.classList.add("nx-demo");

    const faixa = document.createElement("div");
    faixa.className = "nx-demo-faixa";
    faixa.setAttribute("role", "status");
    const titulo = document.createElement("span");
    titulo.className = "nx-demo-titulo";
    titulo.textContent = "Demonstração · dados fictícios";
    const acoes = document.createElement("div");
    acoes.className = "nx-demo-acoes";

    const seletor = document.createElement("select");
    seletor.className = "nx-demo-extra";
    seletor.setAttribute("aria-label", "Ver o sistema como");
    const atual = papelAtual();
    const vazio = new Option("Ver como…", "");
    seletor.add(vazio);
    for (const p of info.papeis ?? []) {
      const o = new Option(`${p.nome} (${p.papel})`, p.url);
      if (p.papel === atual) o.selected = true;
      seletor.add(o);
    }
    seletor.addEventListener("change", () => seletor.value && (location.href = seletor.value));

    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = "Reiniciar demonstração";
    botao.addEventListener("click", async () => {
      if (!confirm("Voltar todos os dados da demonstração ao estado original? O que foi feito agora será apagado.")) return;
      botao.disabled = true;
      botao.textContent = "Reiniciando…";
      try {
        const r = await fetch("/api/demo/reiniciar", { method: "POST", headers: { "x-nexor": "1" } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        location.reload();
      } catch (e) {
        botao.disabled = false;
        botao.textContent = "Reiniciar demonstração";
        alert(`Não foi possível reiniciar: ${e.message}`);
      }
    });

    acoes.append(seletor, botao);
    faixa.append(titulo, acoes);
    document.body.prepend(faixa);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
