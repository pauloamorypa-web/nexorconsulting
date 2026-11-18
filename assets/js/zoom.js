/* Ampliar telas de produto com efeito tecnológico.
   Vale para qualquer tela de sistema do site (/assets/img/<produto>/...), inclusive as que
   aparecem dentro das janelas de prévia. Clique ou Enter abre; Esc fecha; setas passam as telas
   do mesmo grupo. Usa <dialog> para ficar acima de outras janelas abertas. */
(() => {
  const PASTAS = /(^|\/)assets\/img\/(atende|rh|barber|contabil|agente|elo|servicedesk|em-breve|ti|cofre|chamados)\//;
  const ehTela = (img) => img instanceof HTMLImageElement && PASTAS.test(img.getAttribute("src") || "") && !img.closest(".prod-thumbs, .zoom");
  const calmo = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const dlg = document.createElement("dialog");
  dlg.className = "zoom";
  dlg.setAttribute("aria-label", "Tela ampliada");
  dlg.innerHTML = `
    <div class="zoom-quadro">
      <span class="zoom-canto zc1"></span><span class="zoom-canto zc2"></span><span class="zoom-canto zc3"></span><span class="zoom-canto zc4"></span>
      <img class="zoom-img" alt="">
      <span class="zoom-varre" aria-hidden="true"></span>
    </div>
    <div class="zoom-barra">
      <p class="zoom-leg"></p>
      <span class="zoom-pos"></span>
      <button type="button" class="zoom-ant" aria-label="Tela anterior">‹</button>
      <button type="button" class="zoom-prox" aria-label="Próxima tela">›</button>
      <button type="button" class="zoom-fechar" aria-label="Fechar">×</button>
    </div>`;
  document.body.append(dlg);
  const zImg = dlg.querySelector(".zoom-img");
  const leg = dlg.querySelector(".zoom-leg");
  const pos = dlg.querySelector(".zoom-pos");
  const quadro = dlg.querySelector(".zoom-quadro");
  let grupo = [];
  let i = 0;
  let origem = null;

  // Grupo = telas do mesmo bloco (galeria do produto, seção ou janela de prévia)
  const grupoDe = (img) => {
    const bloco = img.closest(".prod-galeria, .sm-galeria, figure, section, dialog") || document;
    const imgs = [...bloco.querySelectorAll("img")].filter(ehTela);
    const galeria = img.closest(".prod-galeria");
    if (galeria) { // na galeria, as miniaturas também entram no passa-passa
      const urls = [...galeria.querySelectorAll("[data-tela]")].map((b) => ({ src: b.dataset.tela, alt: b.getAttribute("aria-label").replace("Ver tela: ", "") }));
      return { itens: urls, inicio: Math.max(0, urls.findIndex((u) => img.src.endsWith(u.src))) };
    }
    return { itens: imgs.map((x) => ({ src: x.currentSrc || x.src, alt: x.alt })), inicio: Math.max(0, imgs.indexOf(img)) };
  };

  function mostrar(n, varrer = true) {
    i = (n + grupo.length) % grupo.length;
    const it = grupo[i];
    zImg.src = it.src;
    zImg.alt = it.alt || "Tela do sistema";
    leg.textContent = it.alt || "";
    pos.textContent = grupo.length > 1 ? `${i + 1} de ${grupo.length}` : "";
    dlg.classList.toggle("unica", grupo.length < 2);
    if (varrer && !calmo()) { quadro.classList.remove("varrendo"); void quadro.offsetWidth; quadro.classList.add("varrendo"); }
  }

  function abrir(img) {
    const g = grupoDe(img);
    grupo = g.itens.length ? g.itens : [{ src: img.src, alt: img.alt }];
    origem = img;
    mostrar(g.inicio);
    dlg.showModal();
    if (!calmo()) { // a tela cresce a partir de onde estava
      const r = img.getBoundingClientRect();
      const q = quadro.getBoundingClientRect();
      const s = Math.min(r.width / q.width, r.height / q.height) || 0.3;
      quadro.animate([
        { transform: `translate(${r.left + r.width / 2 - (q.left + q.width / 2)}px, ${r.top + r.height / 2 - (q.top + q.height / 2)}px) scale(${s})`, opacity: 0.4 },
        { transform: "none", opacity: 1 },
      ], { duration: 300, easing: "cubic-bezier(.16,1,.3,1)" });
    }
    dlg.querySelector(".zoom-fechar").focus();
  }

  function fechar() {
    if (!dlg.open) return;
    if (calmo()) return dlg.close();
    const a = quadro.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], { duration: 150, easing: "cubic-bezier(.7,0,.84,1)" });
    a.onfinish = () => { dlg.close(); origem?.focus?.(); };
  }

  // Deixa as telas clicáveis e acessíveis pelo teclado
  const preparar = (raiz = document) => [...(raiz.tagName === "IMG" ? [raiz] : []), ...raiz.querySelectorAll("img")].forEach((img) => {
    if (!ehTela(img) || img.dataset.zoomPronto) return;
    img.dataset.zoomPronto = "1";
    img.classList.add("zoomavel");
    if (!img.closest("button, a")) { img.tabIndex = 0; img.setAttribute("role", "button"); img.setAttribute("aria-label", `Ampliar: ${img.alt || "tela do sistema"}`); }
  });
  preparar();
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && preparar(n)))).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", (e) => {
    const img = e.target.closest("img.zoomavel");
    if (!img || dlg.contains(img)) return;
    // foto de cartão que abre a prévia (em breve) continua abrindo a prévia
    if (img.closest("[data-breve]")) return;
    e.preventDefault();
    e.stopPropagation();
    abrir(img);
  }, true);
  document.addEventListener("keydown", (e) => {
    if (dlg.open) {
      if (e.key === "ArrowRight") { e.preventDefault(); mostrar(i + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); mostrar(i - 1); }
      return;
    }
    const img = document.activeElement;
    if ((e.key === "Enter" || e.key === " ") && img?.classList?.contains("zoomavel")) { e.preventDefault(); abrir(img); }
  });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); fechar(); });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest(".zoom-fechar")) fechar();
    else if (e.target.closest(".zoom-prox")) mostrar(i + 1);
    else if (e.target.closest(".zoom-ant")) mostrar(i - 1);
  });
  // deslizar o dedo no celular passa as telas
  let x0 = null;
  quadro.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  quadro.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) mostrar(i + (dx < 0 ? 1 : -1));
    x0 = null;
  });
})();
