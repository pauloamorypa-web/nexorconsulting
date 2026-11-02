/* Menu do celular nas páginas de serviço (fica num arquivo para a política de segurança barrar scripts embutidos) */
(() => {
  const t = document.querySelector(".nav-toggle"), n = document.getElementById("menu");
  if (!t || !n) return;
  t.addEventListener("click", () => { const o = !n.classList.contains("open"); n.classList.toggle("open", o); t.setAttribute("aria-expanded", String(o)); });
})();
