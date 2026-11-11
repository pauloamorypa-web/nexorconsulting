/* Aplica o tema salvo (claro/escuro) antes de desenhar a página, sem piscar. Sem escolha salva, segue o sistema. */
(() => {
  try {
    const t = localStorage.getItem("nx-elo-tema");
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch {
    /* navegação privada: segue o sistema */
  }
})();
