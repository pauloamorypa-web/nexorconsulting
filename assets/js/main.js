/* Nexor Consulting — scripts do site */

// Número do WhatsApp da Nexor (DDI + DDD + número, só dígitos). Ex.: 5511999999999
const WHATSAPP_NUMBER = "5500000000000";

const whatsUrl = (msg) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

const brl = (n) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

document.documentElement.classList.remove("no-js");
document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- Links de WhatsApp ---------- */
document.querySelectorAll("[data-whatsapp]").forEach((el) => {
  el.href = whatsUrl(el.dataset.whatsapp);
  el.target = "_blank";
  el.rel = "noopener";
});

/* ---------- Header e menu mobile ---------- */
const header = document.querySelector(".site-header");
const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("menu");

const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 10);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

const setMenu = (open) => {
  nav.classList.toggle("open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
};
toggle.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));

/* ---------- Animação de entrada ---------- */
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
}

/* ---------- Comparativo de planos ---------- */
// "y" = incluso, "n" = não incluso, "y:Texto" = incluso com detalhe, demais = texto
const PLAN_ROWS = [
  ["Perfil", "Microempresa", "Pequena empresa", "Média empresa", "Grande empresa"],
  ["Dispositivos", "Até 5", "Até 15", "Até 50", "50+"],
  ["Suporte remoto", "y:Horário comercial", "y:Ilimitado", "y:Ilimitado", "y:24/7 prioritário"],
  ["Suporte presencial", "n", "y:1x/mês", "y:2x/mês", "y:Sob demanda"],
  ["Monitoramento", "Básico", "Intermediário", "Avançado", "24/7 completo"],
  ["Zabbix + Grafana", "n", "y", "y", "y:Avançado"],
  ["Gestão de rede", "Básica", "y", "y:Avançada", "y:Completa"],
  ["Gestão de servidores", "n", "n", "y", "y:Completa"],
  ["Backup", "Orientação", "Automatizado", "Gerenciado", "Gerenciado + testes"],
  ["Segurança", "Básica", "Básica+", "Intermediária", "Avançada"],
  ["Relatórios", "n", "y:Mensal", "y:Detalhado", "y:Executivo"],
  ["SLA / Prioridade", "Baixa", "Média", "Alta", "Crítica"],
  ["Documentação", "n", "Parcial", "y", "y:Completa"],
  ["Planejamento de TI", "n", "n", "y:Básico", "y:Estratégico"],
  ["Investimento mensal", "R$ 149 – 299", "R$ 399 – 799", "R$ 1.200 – 2.500", "R$ 3.000 – 10.000+"],
];
const PLAN_CLASSES = ["c-start", "c-core", "c-business", "c-enterprise"];
const icon = (id, cls) => `<svg class="ic ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

const cell = (v) => {
  if (v === "n") return `${icon("i-x", "no")}<span class="sr-only">Não incluso</span>`;
  if (v === "y") return `${icon("i-check", "yes")}<span class="sr-only">Incluso</span>`;
  if (v.startsWith("y:")) return `${icon("i-check", "yes")}${v.slice(2)}`;
  return v;
};

document.querySelector("#plans-table tbody").innerHTML = PLAN_ROWS.map(
  ([label, ...vals]) =>
    `<tr><th scope="row">${label}</th>${vals
      .map((v, i) => `<td class="${PLAN_CLASSES[i]}">${cell(v)}</td>`)
      .join("")}</tr>`
).join("");

/* ---------- Simulador ---------- */
const SERVICES = [
  { name: "Firewall Gerenciado", price: 497, unit: "por unidade" },
  { name: "Monitoramento de Ameaças", price: 297, unit: "por ambiente" },
  { name: "Antivírus Corporativo", price: 25, unit: "por dispositivo" },
  { name: "Backup Gerenciado", price: 299, unit: "por ambiente" },
  { name: "Suporte Remoto", price: 49, unit: "por usuário" },
  { name: "Monitoramento de Máquinas", price: 20, unit: "por máquina" },
  { name: "Gestão de Rede", price: 297, unit: "por rede" },
  { name: "Wi-Fi Corporativo", price: 197, unit: "por ambiente" },
  { name: "Servidor Monitorado", price: 297, unit: "por servidor" },
  { name: "Monitoramento de Câmeras", price: 197, unit: "por ambiente" },
  { name: "Controle de Acesso", price: 147, unit: "por ponto" },
  { name: "Backup em Nuvem", price: 199, unit: "por ambiente" },
  { name: "Gestão de Cloud", price: 297, unit: "por ambiente" },
  { name: "E-mail Corporativo", price: 25, unit: "por conta" },
];

const selected = new Map(); // nome -> quantidade
const simList = document.getElementById("sim-list");
const simTotal = document.getElementById("sim-total");
const simItems = document.getElementById("sim-items");
const simPdf = document.getElementById("sim-pdf");
const simWhats = document.getElementById("sim-whats");

simList.innerHTML = SERVICES.map(
  (s, i) => `
  <div class="sim-item" data-i="${i}">
    <div>
      <h3>${s.name}</h3>
      <p>${brl(s.price)} <span>${s.unit}</span></p>
    </div>
    <div class="sim-controls">
      <input type="number" min="1" max="999" value="1" aria-label="Quantidade de ${s.name}" hidden>
      <button type="button" class="sim-toggle" aria-pressed="false">Adicionar</button>
    </div>
  </div>`
).join("");

const totalOf = () =>
  [...selected].reduce((acc, [name, qty]) => acc + SERVICES.find((s) => s.name === name).price * qty, 0);

const lines = () =>
  [...selected].map(([name, qty]) => {
    const s = SERVICES.find((x) => x.name === name);
    return { name, qty, subtotal: s.price * qty };
  });

const renderSummary = () => {
  const items = lines();
  simTotal.textContent = brl(totalOf());
  simItems.innerHTML = items.length
    ? items.map((l) => `<li><span>${l.name} × ${l.qty}</span><span>${brl(l.subtotal)}</span></li>`).join("")
    : `<li class="empty">Nenhum serviço selecionado.</li>`;
  simPdf.disabled = !items.length;

  const msg = items.length
    ? `Olá! Simulei uma solução no site da Nexor:\n${items
        .map((l) => `• ${l.name} (x${l.qty}): ${brl(l.subtotal)}`)
        .join("\n")}\nTotal mensal estimado: ${brl(totalOf())}\nGostaria de receber uma proposta.`
    : "Olá! Gostaria de montar uma solução com a Nexor.";
  simWhats.href = whatsUrl(msg);
  simWhats.target = "_blank";
  simWhats.rel = "noopener";
};

simList.addEventListener("click", (e) => {
  const btn = e.target.closest(".sim-toggle");
  if (!btn) return;
  const item = btn.closest(".sim-item");
  const s = SERVICES[item.dataset.i];
  const input = item.querySelector("input");
  const on = !selected.has(s.name);
  if (on) selected.set(s.name, Math.max(1, parseInt(input.value, 10) || 1));
  else selected.delete(s.name);
  item.classList.toggle("active", on);
  input.hidden = !on;
  btn.textContent = on ? "Remover" : "Adicionar";
  btn.setAttribute("aria-pressed", String(on));
  renderSummary();
});

simList.addEventListener("input", (e) => {
  if (e.target.type !== "number") return;
  const s = SERVICES[e.target.closest(".sim-item").dataset.i];
  if (selected.has(s.name)) selected.set(s.name, Math.max(1, parseInt(e.target.value, 10) || 1));
  renderSummary();
});

renderSummary();

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = reject;
    document.head.appendChild(el);
  });

simPdf.addEventListener("click", async () => {
  const label = simPdf.textContent;
  simPdf.disabled = true;
  simPdf.textContent = "Gerando PDF…";
  try {
    if (!window.jspdf) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();

    doc.setFillColor(5, 11, 22);
    doc.rect(0, 0, W, 34, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("NEXOR CONSULTING", 14, 17);
    doc.setFontSize(9);
    doc.setTextColor(47, 139, 255);
    doc.text("TECNOLOGIA  •  SEGURANÇA  •  PERFORMANCE", 14, 25);

    doc.setTextColor(13, 27, 42);
    doc.setFontSize(15);
    doc.text("Proposta Comercial", 14, 48);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 120, 135);
    doc.text(`Emitida em ${new Date().toLocaleDateString("pt-BR")}`, 14, 54);

    let y = 66;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(13, 27, 42);
    doc.text("Serviço", 14, y);
    doc.text("Qtd", 130, y, { align: "right" });
    doc.text("Subtotal", W - 14, y, { align: "right" });
    doc.setDrawColor(0, 102, 255);
    doc.line(14, y + 3, W - 14, y + 3);
    y += 11;

    doc.setFont("helvetica", "normal");
    lines().forEach((l) => {
      doc.text(l.name, 14, y);
      doc.text(String(l.qty), 130, y, { align: "right" });
      doc.text(brl(l.subtotal), W - 14, y, { align: "right" });
      y += 8;
      if (y > 270) { doc.addPage(); y = 20; }
    });

    doc.setDrawColor(220, 225, 232);
    doc.line(14, y - 3, W - 14, y - 3);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0, 102, 255);
    doc.text("Total mensal", 14, y);
    doc.text(brl(totalOf()), W - 14, y, { align: "right" });

    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 120, 135);
    doc.text(
      doc.splitTextToSize(
        "A Nexor Consulting garante estabilidade, segurança e continuidade para sua empresa. " +
          "Valores de referência, sujeitos a confirmação após o diagnóstico gratuito do seu ambiente.",
        W - 28
      ),
      14,
      y
    );

    doc.save("Proposta_Nexor.pdf");
  } catch {
    alert("Não foi possível gerar o PDF agora. Envie sua simulação pelo WhatsApp.");
  } finally {
    simPdf.textContent = label;
    simPdf.disabled = !selected.size;
  }
});

/* ---------- Galeria ---------- */
const lightbox = document.getElementById("lightbox");
const lightboxImg = lightbox.querySelector("img");
document.querySelectorAll(".gallery-item").forEach((btn) =>
  btn.addEventListener("click", () => {
    lightboxImg.src = btn.dataset.full;
    lightboxImg.alt = btn.querySelector("img").alt;
    lightbox.showModal();
  })
);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox || e.target.closest(".lightbox-close")) lightbox.close();
});

/* ---------- Formulário de contato ---------- */
const form = document.getElementById("contact-form");
const formError = document.getElementById("form-error");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form));
  if (!d.nome.trim() || !d.telefone.trim()) {
    formError.textContent = "Preencha seu nome e telefone para continuarmos.";
    return;
  }
  formError.textContent = "";
  const msg = [
    "Olá! Gostaria de solicitar um diagnóstico gratuito.",
    `Nome: ${d.nome.trim()}`,
    d.empresa.trim() && `Empresa: ${d.empresa.trim()}`,
    `Telefone: ${d.telefone.trim()}`,
    `Dispositivos: ${d.dispositivos}`,
    d.mensagem.trim() && `Mensagem: ${d.mensagem.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");
  window.open(whatsUrl(msg), "_blank", "noopener");
});
