/* Faixa do Modo Demonstração (painel e app do cliente). Fora da demonstração, /api/demo responde 404 e nada aparece. */
(async () => {
  let demo;
  try {
    const r = await fetch("/api/demo", { cache: "no-store" });
    if (!r.ok) return;
    demo = await r.json();
  } catch {
    return;
  }
  if (!demo?.demo) return;
  const post = (url, corpo) => fetch(url, { method: "POST", headers: { "x-nexor": "1", "content-type": "application/json" }, body: JSON.stringify(corpo ?? {}) }).then((r) => r.json());
  const estilo = document.createElement("style");
  estilo.textContent = `
    .nx-demo{position:sticky;top:0;z-index:300;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:7px 12px;background:#f59e0b;color:#1c1917;font:600 13px/1.3 system-ui,sans-serif}
    .nx-demo b{font-weight:800}.nx-demo .nx-esp{flex:1}
    .nx-demo button,.nx-demo a{font:inherit;font-weight:700;border:0;border-radius:999px;padding:5px 11px;background:#1c1917;color:#fef3c7;cursor:pointer;text-decoration:none}
    .nx-demo button.nx-leve{background:rgba(28,25,23,.12);color:#1c1917}
    .nx-demo .nx-mais{display:none}
    @media (max-width:700px){.nx-demo .nx-op{display:none}.nx-demo .nx-mais{display:inline-block}.nx-demo.aberta .nx-op{display:inline-block}.nx-demo .nx-esp{display:none}}
    .nx-demo-msgs{position:fixed;right:12px;bottom:12px;z-index:301;width:min(360px,calc(100vw - 24px));max-height:60vh;overflow:auto;background:#0f172a;color:#e2e8f0;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);font:13px/1.4 system-ui,sans-serif}
    .nx-demo-msgs header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #1e293b;font-weight:700}
    .nx-demo-msgs header button{background:none;border:0;color:#94a3b8;font-size:18px;cursor:pointer}
    .nx-demo-msgs ol{list-style:none;margin:0;padding:8px 12px 12px}.nx-demo-msgs li{padding:7px 0;border-bottom:1px solid #1e293b}
    .nx-demo-msgs small{color:#94a3b8;display:block}`;
  document.head.append(estilo);
  const faixa = document.createElement("div");
  faixa.className = "nx-demo";
  faixa.setAttribute("role", "region");
  faixa.setAttribute("aria-label", "Modo Demonstração");
  const app = location.pathname.startsWith("/app");
  faixa.innerHTML = `<span><b>Demonstração</b> · dados fictícios · ${demo.empresa ?? ""}</span><span class="nx-esp"></span>
    <button type="button" class="nx-mais nx-leve" data-a="mais" aria-expanded="false">Opções</button>
    <button type="button" class="nx-op nx-leve" data-a="msgs">Mensagens enviadas</button>
    ${app ? "" : '<button type="button" class="nx-op nx-leve" data-a="pagar">Simular pagamento do clube</button><button type="button" class="nx-op nx-leve" data-a="zap">Simular mensagem no WhatsApp</button>'}
    <a class="nx-op" href="/demo">Trocar de perfil</a><button type="button" class="nx-op" data-a="reiniciar">Reiniciar demonstração</button>`;
  document.body.prepend(faixa);

  const nomeCanal = { whatsapp: "WhatsApp enviado", sms: "SMS enviado", asaas: "Asaas", whatsapp_recebido: "WhatsApp recebido" };
  async function mensagens() {
    document.querySelector(".nx-demo-msgs")?.remove();
    const lista = await fetch("/api/demo/mensagens", { cache: "no-store" }).then((r) => r.json());
    const caixa = document.createElement("section");
    caixa.className = "nx-demo-msgs";
    caixa.innerHTML = `<header>O que o sistema enviou (simulado)<button type="button" aria-label="Fechar">×</button></header><ol></ol>`;
    const ol = caixa.querySelector("ol");
    if (!lista.length) ol.innerHTML = "<li>Nada enviado ainda. Agende pelo app ou simule uma mensagem.</li>";
    for (const m of lista) {
      const li = document.createElement("li");
      const quando = new Date(m.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      li.innerHTML = `<small></small><span></span>`;
      li.querySelector("small").textContent = `${nomeCanal[m.canal] ?? m.canal} · ${m.para ?? ""} · ${quando}`;
      li.querySelector("span").textContent = m.texto ?? "";
      ol.append(li);
    }
    caixa.querySelector("header button").onclick = () => caixa.remove();
    document.body.append(caixa);
  }
  faixa.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (!a) return;
    if (a === "mais") return e.target.setAttribute("aria-expanded", String(faixa.classList.toggle("aberta")));
    if (a === "msgs") return mensagens();
    if (a === "reiniciar") {
      if (!confirm("Voltar a demonstração ao estado original? Tudo o que foi feito agora será desfeito.")) return;
      await post("/api/demo/reiniciar");
      return location.assign("/demo");
    }
    if (a === "pagar") {
      const r = await post("/api/demo/pagar");
      alert(r.ok ? "Pagamento confirmado pelo Asaas (simulado). O clube do cliente foi ativado automaticamente." : r.erro);
      return location.reload();
    }
    if (a === "zap") {
      const texto = prompt("Mensagem do cliente no WhatsApp:", "Oi! Tem horário pra corte hoje à tarde?");
      if (!texto) return;
      await post("/api/demo/receber", { de: `5534999${String(Date.now()).slice(-6)}`, texto });
      setTimeout(mensagens, 900);
    }
  });
})();
