/* Faixa "Demonstração · dados fictícios": só aparece quando o servidor está em DEMO=1
   (GET /api/demo responde 200; 404 = produção, não mostra nada). */
window.nexorDemo = fetch("/api/demo", { credentials: "same-origin" })
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null)
  .then((info) => {
    if (!info?.demo) return null;
    const faixa = document.createElement("div");
    faixa.className = "faixa-demo";
    faixa.setAttribute("role", "status");
    const txt = document.createElement("span");
    txt.textContent = `Demonstração · dados fictícios · IA ${info.ia}`;
    const bt = document.createElement("button");
    bt.type = "button";
    bt.id = "demo-reiniciar";
    bt.textContent = "Reiniciar demonstração";
    bt.addEventListener("click", async () => {
      if (!confirm("Reiniciar a demonstração? Os dados voltam ao estado original.")) return;
      bt.disabled = true;
      await fetch("/api/demo/reiniciar", { method: "POST", credentials: "same-origin" }).catch(() => {});
      location.reload();
    });
    faixa.append(txt, bt);
    const montar = () => document.body.prepend(faixa);
    if (document.body) montar();
    else document.addEventListener("DOMContentLoaded", montar);
    return info;
  });
