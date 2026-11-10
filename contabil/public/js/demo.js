/* Faixa do Modo Demonstração. O servidor só inclui este arquivo com DEMO=1; mesmo assim ele confere
   GET /api/demo e não mostra nada se a resposta não for de demonstração (404 em produção). */

const ESTILO = `
:root { --demo-h: 40px; }
body.nx-demo { padding-top: var(--demo-h); }
body.nx-demo .casca { height: calc(100vh - var(--demo-h)); height: calc(100dvh - var(--demo-h)); }
body.nx-demo .login, body.nx-demo .p-login { min-height: calc(100vh - var(--demo-h)); }
body.nx-demo .p-topo { top: var(--demo-h); }
@media (max-width: 900px) { body.nx-demo .lateral { top: var(--demo-h); } }
.demo-faixa { position: fixed; inset: 0 0 auto 0; height: var(--demo-h); z-index: 200; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: #b45309; color: #fff; font: 600 13.5px/1.2 Inter, system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.18); }
.demo-faixa .demo-selo { background: rgba(255,255,255,.22); border-radius: 99px; padding: 3px 10px; white-space: nowrap; }
.demo-faixa nav { display: flex; gap: 4px; margin-left: auto; }
.demo-faixa nav a { color: #fff; text-decoration: none; padding: 5px 9px; border-radius: 7px; font-weight: 500; white-space: nowrap; }
.demo-faixa nav a:hover, .demo-faixa nav a.atual { background: rgba(255,255,255,.2); }
.demo-faixa button { background: #fff; color: #92400e; border: 0; border-radius: 8px; padding: 6px 12px; font: inherit; cursor: pointer; white-space: nowrap; }
.demo-faixa button:disabled { opacity: .7; cursor: progress; }
.demo-faixa .demo-ia { font-weight: 400; opacity: .9; white-space: nowrap; }
@media (max-width: 760px) { .demo-faixa nav, .demo-faixa .demo-ia { display: none; } .demo-faixa button { margin-left: auto; } }
`;

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...filhos);
  return e;
}

async function iniciar() {
  let d;
  try {
    const r = await fetch("/api/demo", { credentials: "same-origin" });
    if (!r.ok) return;
    d = await r.json();
  } catch {
    return;
  }
  if (!d?.demo) return;
  document.head.append(el("style", {}, ESTILO));
  const papelVolta = d.atual ?? (location.pathname.startsWith("/portal") ? "cliente" : "dono");
  const botao = el(
    "button",
    {
      type: "button",
      title: "Apaga o que foi feito e volta aos dados originais",
      onclick: async () => {
        if (!confirm("Reiniciar a demonstração? Tudo o que foi feito agora volta aos dados originais.")) return;
        botao.disabled = true;
        botao.textContent = "Reiniciando…";
        try {
          const r = await fetch("/api/demo/reiniciar", { method: "POST", credentials: "same-origin", headers: { "x-nexor": "1" } });
          if (!r.ok) throw new Error(`Erro ${r.status}`);
          location.replace(`/demo/entrar?papel=${encodeURIComponent(papelVolta)}`);
        } catch (e) {
          botao.disabled = false;
          botao.textContent = "Reiniciar demonstração";
          alert(`Não foi possível reiniciar: ${e.message}`);
        }
      },
    },
    "Reiniciar demonstração",
  );
  const rotulos = { dono: "Contador dono", colaborador: "Colaborador", cliente: "Cliente (portal)" };
  const faixa = el(
    "div",
    { class: "demo-faixa", role: "region", "aria-label": "Modo Demonstração" },
    el("span", { class: "demo-selo" }, "Demonstração · dados fictícios"),
    el("span", { class: "demo-ia" }, d.ia === "real" ? "IA real" : "IA simulada · sem internet"),
    el("nav", { "aria-label": "Entrar como" }, ...d.papeis.map((p) => el("a", { href: p.url, title: p.descricao, class: p.papel === d.atual ? "atual" : "" }, rotulos[p.papel] ?? p.nome))),
    botao,
  );
  document.body.prepend(faixa);
  document.body.classList.add("nx-demo");
}

iniciar();
