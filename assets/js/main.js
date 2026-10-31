/* Nexor Consulting — scripts do site */

// Número do WhatsApp da Nexor (DDI + DDD + número, só dígitos). Ex.: 5511999999999
const WHATSAPP_NUMBER = "5500000000000";

const whatsUrl = (msg) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

document.documentElement.classList.remove("no-js");
$("#year").textContent = new Date().getFullYear();

const linkWhats = (el, msg) => {
  el.href = whatsUrl(msg);
  el.target = "_blank";
  el.rel = "noopener";
};
$$("[data-whatsapp]").forEach((el) => linkWhats(el, el.dataset.whatsapp));

/* ================= Header, progresso, menu, cursor ================= */
const header = $(".site-header");
const progress = $(".scroll-progress");
const onScroll = () => {
  header.classList.toggle("scrolled", scrollY > 10);
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
};
onScroll();
addEventListener("scroll", onScroll, { passive: true });

const toggle = $(".nav-toggle");
const nav = $("#menu");
const setMenu = (open) => {
  nav.classList.toggle("open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
};
toggle.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
$$("a", nav).forEach((a) => a.addEventListener("click", () => setMenu(false)));

const glow = $(".cursor-glow");
if (matchMedia("(pointer: fine)").matches && !reduceMotion) {
  addEventListener("pointermove", (e) => {
    glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    glow.style.opacity = 1;
  }, { passive: true });
}

/* ================= Realce de sintaxe ================= */
const LANG_KEYWORDS = {
  ts: "import export from const let async await return new class interface type extends implements if else for of throw try catch function private public readonly static default as",
  py: "import from def async await return class if elif else for in with as try except raise None True False and or not lambda yield",
  sql: "WITH AS SELECT FROM WHERE GROUP BY ORDER JOIN LEFT ON AND OR SUM AVG COUNT OVER PARTITION ROWS BETWEEN PRECEDING CURRENT ROW DATE_TRUNC INTERVAL DESC ASC LIMIT CASE WHEN THEN ELSE END ROUND",
  go: "package import func return go chan select case for range if else defer var type struct err nil make context",
};

const highlight = (code, lang) => {
  const kw = new Set(LANG_KEYWORDS[lang].split(" "));
  const comment = lang === "py" ? "#[^\\n]*" : lang === "sql" ? "--[^\\n]*" : "\\/\\/[^\\n]*";
  const re = new RegExp(
    `(${comment})|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`[^\`]*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|(@?[A-Za-z_][\\w]*)(?=\\s*\\()|([A-Za-z_][\\w]*)`,
    "g"
  );
  let out = "";
  let last = 0;
  code.replace(re, (m, c, s, n, fn, id, i) => {
    out += esc(code.slice(last, i));
    last = i + m.length;
    if (c) out += `<span class="t-com">${esc(m)}</span>`;
    else if (s) out += `<span class="t-str">${esc(m)}</span>`;
    else if (n) out += `<span class="t-num">${m}</span>`;
    else if (fn) out += kw.has(fn) ? `<span class="t-kw">${fn}</span>` : `<span class="t-fn">${fn}</span>`;
    else if (kw.has(id) || (lang === "sql" && kw.has(id.toUpperCase()))) out += `<span class="t-kw">${id}</span>`;
    else if (/^[A-Z]/.test(id)) out += `<span class="t-type">${id}</span>`;
    else out += id;
    return m;
  });
  return out + esc(code.slice(last));
};

/* ================= Hero: código digitando ================= */
const HERO_CODE = `import { Agent, tools } from "@nexor/ai";
import { erp, whatsapp } from "./integrations";

// Agente que automatiza o atendimento de pedidos
export const pedidosAgent = new Agent({
  model: "llm-enterprise",
  memory: "rag://base-de-conhecimento",
  tools: [erp.consultarEstoque, erp.criarPedido],
});

whatsapp.on("mensagem", async (msg) => {
  const intent = await pedidosAgent.understand(msg.text);

  if (intent.type === "novo_pedido") {
    const pedido = await pedidosAgent.run(intent);
    await msg.reply(\`Pedido #\${pedido.id} confirmado ✓\`);
  }
});`;

const heroCode = $("#hero-code");
const heroLines = highlight(HERO_CODE, "ts").split("\n");
const lineHTML = (l, i) => `<span class="ln">${String(i + 1).padStart(2, " ")}</span>${l || " "}`;
if (reduceMotion) {
  heroCode.innerHTML = heroLines.map(lineHTML).join("\n");
} else {
  let li = 0;
  const typeLine = () => {
    heroCode.innerHTML = heroLines.slice(0, li + 1).map(lineHTML).join("\n") + '<span class="code-caret"></span>';
    li++;
    if (li < heroLines.length) setTimeout(typeLine, heroLines[li - 1].length ? 140 : 60);
    else setTimeout(() => { li = 0; typeLine(); }, 6000);
  };
  setTimeout(typeLine, 600);
}

/* ================= Hero: palavras rotativas ================= */
const WORDS = ["agentes de IA", "lojas virtuais", "ERPs e CRMs", "sites que vendem", "automações", "apps mobile"];
const typed = $("#typed");
if (!reduceMotion) {
  let w = 0;
  let ch = WORDS[0].length;
  let deleting = true;
  const tick = () => {
    const word = WORDS[w];
    ch += deleting ? -1 : 1;
    typed.textContent = word.slice(0, ch);
    if (!deleting && ch === word.length) { deleting = true; return setTimeout(tick, 2200); }
    if (deleting && ch === 0) { deleting = false; w = (w + 1) % WORDS.length; return setTimeout(tick, 300); }
    setTimeout(tick, deleting ? 35 : 70);
  };
  setTimeout(tick, 2600);
}

/* ================= Hero: rede neural em canvas ================= */
(() => {
  const canvas = $("#neural");
  const ctx = canvas.getContext("2d");
  let W, H, nodes, pulses, dpr, visible = true;
  const mouse = { x: -9999, y: -9999 };

  const init = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(90, (W * H) / 14000));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.6 + 0.8,
    }));
    pulses = [];
  };

  const LINK = 140;
  const frame = () => {
    if (!visible) return;
    ctx.clearRect(0, 0, W, H);
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
      const dx = mouse.x - n.x, dy = mouse.y - n.y, d = Math.hypot(dx, dy);
      if (d < 180) { n.x += dx * 0.004; n.y += dy * 0.004; }
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK) {
          ctx.strokeStyle = `rgba(47,139,255,${(1 - d / LINK) * 0.35})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          if (pulses.length < 18 && Math.random() < 0.0008) pulses.push({ a, b, t: 0 });
        }
      }
    }
    for (const n of nodes) {
      const near = Math.hypot(mouse.x - n.x, mouse.y - n.y) < 180;
      ctx.fillStyle = near ? "#7dd3fc" : "rgba(125,180,255,.85)";
      ctx.beginPath();
      ctx.arc(n.x, n.y, near ? n.r + 1 : n.r, 0, Math.PI * 2);
      ctx.fill();
    }
    pulses = pulses.filter((p) => (p.t += 0.02) < 1);
    for (const p of pulses) {
      const x = p.a.x + (p.b.x - p.a.x) * p.t, y = p.a.y + (p.b.y - p.a.y) * p.t;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
      g.addColorStop(0, "rgba(34,211,238,1)");
      g.addColorStop(1, "rgba(34,211,238,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  };

  init();
  if (reduceMotion) {
    for (const n of nodes) {
      ctx.fillStyle = "rgba(125,180,255,.6)";
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  requestAnimationFrame(frame);
  addEventListener("resize", init);
  canvas.parentElement.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.parentElement.addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) requestAnimationFrame(frame);
  }).observe(canvas);
})();

/* ================= Tilt 3D ================= */
const addTilt = (el, max = 8) => {
  if (reduceMotion || !matchMedia("(pointer: fine)").matches) return;
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${x * max}deg) rotateX(${-y * max}deg)`;
    el.style.setProperty("--mx", `${(x + 0.5) * 100}%`);
    el.style.setProperty("--my", `${(y + 0.5) * 100}%`);
  });
  el.addEventListener("pointerleave", () => { el.style.transform = ""; });
};
$$(".tilt").forEach((el) => addTilt(el, 6));
$$(".glow-card").forEach((el) => {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
});

/* ================= Contadores ================= */
const counters = new IntersectionObserver((entries) => {
  entries.forEach(({ isIntersecting, target }) => {
    if (!isIntersecting) return;
    counters.unobserve(target);
    const end = +target.dataset.count, pre = target.dataset.prefix || "", suf = target.dataset.suffix || "";
    if (reduceMotion) return;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 1600);
      target.textContent = pre + Math.round(end * (1 - Math.pow(1 - k, 3))) + suf;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
});
$$("[data-count]").forEach((el) => counters.observe(el));

/* ================= Marquee de tecnologias ================= */
const TECH = ["TypeScript", "JavaScript", "Python", "C# / .NET", "Java", "Go", "PHP", "Kotlin", "Swift", "React", "Next.js", "Vue.js", "Angular", "Node.js", "NestJS", "FastAPI", "Django", "Laravel", "Flutter", "React Native", "PostgreSQL", "MySQL", "SQL Server", "MongoDB", "Redis", "GraphQL", "Docker", "Kubernetes", "AWS", "Azure", "Google Cloud", "LLMs", "LangChain", "RAG", "TensorFlow", "PyTorch", "OpenCV", "CI/CD"];
const track = $("#marquee");
const techHTML = TECH.map((t) => `<span>${t}</span>`).join('<i aria-hidden="true">◆</i>');
track.innerHTML = `<div>${techHTML}<i aria-hidden="true">◆</i></div><div aria-hidden="true">${techHTML}<i>◆</i></div>`;

/* ================= Abas por porte ================= */
const tabs = $$('#porte [role="tab"]');
const selectTab = (tab) => {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
    $("#" + t.getAttribute("aria-controls")).hidden = !on;
  });
};
tabs.forEach((t, i) => {
  t.addEventListener("click", () => selectTab(t));
  t.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    const n = tabs[(i + d + tabs.length) % tabs.length];
    n.focus();
    selectTab(n);
  });
});

/* ================= Vitrine ================= */
const showcase = $("#showcase");
showcase.innerHTML = PROJECTS.map(
  (p) => `
  <article class="project reveal" data-cats="${p.cats.join(" ")}" style="--a:${p.accent};--a2:${p.accent2}">
    <button class="project-btn" data-id="${p.id}" aria-label="Ver detalhes: ${p.name} — ${p.title}">
      <div class="project-preview">${renderMock(p)}</div>
      <div class="project-info">
        <span class="project-label">${p.label}</span>
        <h3>${p.name} <small>${p.title}</small></h3>
        <p>${p.desc}</p>
        <div class="project-stack">${p.stack.slice(0, 4).map((s) => `<span>${s}</span>`).join("")}</div>
        <span class="project-more">Explorar modelo <svg class="ic"><use href="#i-arrow"/></svg></span>
      </div>
    </button>
  </article>`
).join("");
$$(".project-preview").forEach((el) => addTilt(el, 5));

$$(".filters .chip").forEach((chip) =>
  chip.addEventListener("click", () => {
    $$(".filters .chip").forEach((c) => {
      c.classList.toggle("active", c === chip);
      c.setAttribute("aria-pressed", c === chip);
    });
    const f = chip.dataset.filter;
    $$(".project").forEach((el) => {
      const show = f === "all" || el.dataset.cats.split(" ").includes(f);
      el.classList.toggle("hide", !show);
    });
  })
);

const modal = $("#project-modal");
const openProject = (id) => {
  const p = PROJECTS.find((x) => x.id === id);
  if (!p) return;
  modal.style.setProperty("--a", p.accent);
  modal.style.setProperty("--a2", p.accent2);
  $("#pm-preview").innerHTML = renderMock(p);
  $("#pm-cat").textContent = `// ${p.label}`;
  $("#pm-title").textContent = `${p.name} — ${p.title}`;
  $("#pm-desc").textContent = p.desc;
  $("#pm-features").innerHTML = p.features.map((f) => `<li><svg class="ic"><use href="#i-check"/></svg>${f}</li>`).join("");
  $("#pm-stack").innerHTML = p.stack.map((s) => `<span>${s}</span>`).join("");
  linkWhats($("#pm-cta"), `Olá! Vi o modelo "${p.name} — ${p.title}" no site da Nexor e quero um projeto como este.`);
  modal.showModal();
};
showcase.addEventListener("click", (e) => {
  const btn = e.target.closest(".project-btn");
  if (btn) openProject(btn.dataset.id);
});
$$("[data-open]").forEach((b) => b.addEventListener("click", () => openProject(b.dataset.open)));
modal.addEventListener("click", (e) => {
  if (e.target === modal || e.target.closest(".modal-close")) modal.close();
});

/* ================= Integrações ================= */
const INTEGRATIONS = [
  ["Atendimento", ["WhatsApp Business API", "Instagram Direct", "Chat no site", "E-mail", "Telefonia / URA"]],
  ["Vendas & marketplaces", ["Mercado Livre", "Shopee", "Amazon", "Magalu", "Nuvemshop", "VTEX", "Shopify", "WooCommerce"]],
  ["Pagamentos", ["Pix", "Mercado Pago", "PagSeguro", "Stripe", "Asaas", "Boleto bancário"]],
  ["Gestão & ERP", ["TOTVS", "SAP", "Omie", "Bling", "Tiny", "Conta Azul", "NF-e / NFS-e"]],
  ["CRM & marketing", ["RD Station", "HubSpot", "Salesforce", "Pipedrive", "Meta Ads", "Google Ads"]],
  ["Dados, nuvem & IA", ["AWS", "Azure", "Google Cloud", "Power BI", "Google Workspace", "Microsoft 365", "LLMs (Claude, GPT, Gemini)"]],
];
$("#int-groups").innerHTML = INTEGRATIONS.map(
  ([g, items]) => `<div class="int-group"><h3>${g}</h3><div>${items.map((i) => `<span>${i}</span>`).join("")}</div></div>`
).join("");

/* ================= Calculadora de retorno ================= */
const roiForm = $("#roi-form");
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const nf = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const updateRoi = () => {
  const v = Object.fromEntries([...new FormData(roiForm)].map(([k, x]) => [k, +x]));
  $("#o-vol").textContent = nf(v.vol);
  $("#o-min").textContent = `${v.min} min`;
  $("#o-cost").textContent = brl(v.cost);
  $("#o-pct").textContent = `${v.pct}%`;
  const hours = (v.vol * v.min) / 60 * (v.pct / 100);
  const month = hours * v.cost;
  const fte = hours / 176;
  $("#r-hours").textContent = `${nf(hours)} h`;
  $("#r-month").textContent = brl(month);
  $("#r-year").textContent = brl(month * 12);
  $("#r-fte").textContent = `${fte.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${fte >= 2 ? "pessoas" : "pessoa"}`;
  $("#r-bar").style.setProperty("--w", `${100 - v.pct}%`);
  $("#r-left").textContent = `${100 - v.pct}%`;
  linkWhats($("#roi-cta"), `Olá! Usei a calculadora do site da Nexor: ${nf(v.vol)} atendimentos/mês, ${v.min} min cada. A estimativa foi de ${brl(month * 12)} por ano. Quero um diagnóstico gratuito.`);
};
roiForm.addEventListener("input", updateRoi);
updateRoi();

/* ================= Laboratório de IA ================= */
const PROCESSES = [
  {
    name: "Atendimento ao cliente",
    icon: "i-users",
    steps: ["Mensagem no WhatsApp", "IA entende a intenção", "Consulta o sistema", "Responde e agenda", "Registra no CRM"],
    logs: [
      ["in", "mensagem recebida · canal=whatsapp · cliente=#8841"],
      ["ai", 'intenção detectada: "agendar_servico" (confiança 0.97)'],
      ["api", "GET /agenda/disponibilidade?data=amanha → 3 horários"],
      ["ai", "resposta gerada e enviada ao cliente"],
      ["ok", "CRM atualizado · oportunidade criada"],
    ],
    metrics: [["Atendimento", "24/7"], ["Resposta", "segundos"], ["Fila", "zero"]],
  },
  {
    name: "Notas fiscais e boletos",
    icon: "i-layers",
    steps: ["E-mail com anexo", "OCR lê o documento", "IA extrai os dados", "Valida regras fiscais", "Lança no ERP"],
    logs: [
      ["in", "novo e-mail · anexo=nota_4521.pdf (2 páginas)"],
      ["ai", "OCR concluído · 1.842 tokens extraídos"],
      ["ai", 'campos: fornecedor="Alfa Ltda" valor=4280.50 venc=15/11'],
      ["api", "validação CNPJ e impostos → ok"],
      ["ok", "título lançado em contas a pagar · auditoria registrada"],
    ],
    metrics: [["Digitação manual", "eliminada"], ["Erros", "validados"], ["Auditoria", "100%"]],
  },
  {
    name: "Qualificação de leads",
    icon: "i-chart",
    steps: ["Lead chega do site", "Enriquecimento de dados", "Score com IA", "Distribui ao vendedor", "Follow-up automático"],
    logs: [
      ["in", "lead recebido · origem=landing-page · empresa=Grupo Atlas"],
      ["api", "enriquecimento: segmento=logística · 120 funcionários"],
      ["ai", "lead score = 88/100 · perfil ideal de cliente"],
      ["api", "atribuído a vendedor=marina · prioridade=alta"],
      ["ok", "sequência de follow-up agendada (e-mail + WhatsApp)"],
    ],
    metrics: [["Leads quentes", "priorizados"], ["Follow-up", "automático"], ["Vendedor", "focado"]],
  },
  {
    name: "Relatórios gerenciais",
    icon: "i-brain",
    steps: ["Coleta de dados", "Consolidação", "Análise com IA", "Gera relatório", "Envia à diretoria"],
    logs: [
      ["in", "agendamento semanal disparado · seg 07:00"],
      ["api", "dados coletados: vendas, financeiro, estoque"],
      ["ai", "insights: margem ↑ 3,2pp · 8 itens com ruptura prevista"],
      ["api", "relatório executivo gerado (PDF + dashboard)"],
      ["ok", "enviado para diretoria@empresa.com.br"],
    ],
    metrics: [["Relatório", "automático"], ["Insights", "com IA"], ["Horas poupadas", "toda semana"]],
  },
];

const procsEl = $("#ai-procs");
const pipeEl = $("#pipeline");
const termEl = $("#term");
const metricsEl = $("#ai-metrics");
let currentProc = 0;
let runToken = 0;

procsEl.innerHTML = PROCESSES.map(
  (p, i) => `<button role="tab" aria-selected="${i === 0}" data-i="${i}"><svg class="ic"><use href="#${p.icon}"/></svg><span>${p.name}</span></button>`
).join("");

const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
const stamp = () => new Date().toLocaleTimeString("pt-BR");

const runProcess = async (i) => {
  const token = ++runToken;
  const p = PROCESSES[i];
  currentProc = i;
  $$("button", procsEl).forEach((b, k) => b.setAttribute("aria-selected", k === i));
  pipeEl.innerHTML = p.steps.map((s, k) => `<div class="pipe-step"><span>${k + 1}</span><b>${s}</b></div>`).join("");
  metricsEl.innerHTML = p.metrics.map(([l, v]) => `<div><small>${l}</small><b>${v}</b></div>`).join("");
  termEl.innerHTML = `<span class="t-dim">$ nexor-agent run "${p.name.toLowerCase()}"</span>\n`;
  const steps = $$(".pipe-step", pipeEl);
  for (let k = 0; k < p.logs.length; k++) {
    if (token !== runToken) return;
    steps[k].classList.add("active");
    await wait(550);
    if (token !== runToken) return;
    const [lvl, msg] = p.logs[k];
    termEl.innerHTML += `<span class="t-dim">[${stamp()}]</span> <span class="lvl lvl-${lvl}">${lvl.toUpperCase().padEnd(3)}</span> ${esc(msg)}\n`;
    termEl.scrollTop = termEl.scrollHeight;
    steps[k].classList.remove("active");
    steps[k].classList.add("done");
    await wait(250);
  }
  if (token === runToken) termEl.innerHTML += `<span class="lvl-ok">✓ processo concluído sem intervenção humana</span>\n`;
};

procsEl.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) runProcess(+b.dataset.i);
});
$("#ai-run").addEventListener("click", () => runProcess(currentProc));
let aiStarted = false;
new IntersectionObserver(([e], obs) => {
  if (e.isIntersecting && !aiStarted) { aiStarted = true; runProcess(0); obs.disconnect(); }
}, { threshold: 0.3 }).observe($(".ai-lab"));

/* ================= Exemplos de código ================= */
const SNIPPETS = [
  {
    tab: "TypeScript", file: "pedidos.controller.ts", lang: "ts",
    code: `import { z } from "zod";
import { Controller, Post, Body } from "@nestjs/common";

const PedidoSchema = z.object({
  clienteId: z.string().uuid(),
  itens: z.array(z.object({ sku: z.string(), qtd: z.number().min(1) })),
});

@Controller("pedidos")
export class PedidosController {
  constructor(private readonly service: PedidosService) {}

  @Post()
  async criar(@Body() body: unknown) {
    const dados = PedidoSchema.parse(body);
    const pedido = await this.service.criar(dados);
    await this.service.notificar(pedido); // WhatsApp + e-mail
    return { id: pedido.id, status: "confirmado" };
  }
}`,
  },
  {
    tab: "Python · IA", file: "extrator_notas.py", lang: "py",
    code: `from pydantic import BaseModel
from nexor.ai import LLM, ocr

class NotaFiscal(BaseModel):
    fornecedor: str
    cnpj: str
    valor_total: float
    vencimento: str

llm = LLM(model="enterprise", temperature=0)

async def processar(arquivo: bytes) -> NotaFiscal:
    texto = await ocr.extrair(arquivo)
    # A IA devolve dados estruturados e validados
    nota = await llm.extract(texto, schema=NotaFiscal)
    if nota.valor_total > 50_000:
        await alertar_financeiro(nota)
    return nota`,
  },
  {
    tab: "SQL", file: "previsao_vendas.sql", lang: "sql",
    code: `-- Receita mensal com média móvel de 3 meses
WITH mensal AS (
  SELECT DATE_TRUNC('month', criado_em) AS mes,
         SUM(valor_total) AS receita
  FROM pedidos
  WHERE status = 'pago'
  GROUP BY 1
)
SELECT mes,
       receita,
       ROUND(AVG(receita) OVER (
         ORDER BY mes ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
       ), 2) AS media_movel
FROM mensal
ORDER BY mes DESC
LIMIT 12;`,
  },
  {
    tab: "Go", file: "worker.go", lang: "go",
    code: `package worker

// Processa milhares de eventos em paralelo
func Run(ctx context.Context, jobs <-chan Job) {
    for i := 0; i < 16; i++ {
        go func() {
            for job := range jobs {
                select {
                case <-ctx.Done():
                    return
                default:
                    if err := job.Execute(ctx); err != nil {
                        log.Error("falha", "job", job.ID, "err", err)
                    }
                }
            }
        }()
    }
}`,
  },
];

const tabBar = $("#code-tab-bar");
tabBar.innerHTML = SNIPPETS.map((s, i) => `<button role="tab" aria-selected="${i === 0}" data-i="${i}">${s.tab}</button>`).join("");
const showSnippet = (i) => {
  const s = SNIPPETS[i];
  $$("button", tabBar).forEach((b, k) => b.setAttribute("aria-selected", k === i));
  $("#code-file").textContent = s.file;
  $("#code-view").innerHTML = highlight(s.code, s.lang).split("\n").map(lineHTML).join("\n");
};
tabBar.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) showSnippet(+b.dataset.i);
});
showSnippet(0);

const LANGS = [["TypeScript", 95], ["Python", 92], ["C# / .NET", 85], ["Go", 78], ["SQL", 94], ["Java / Kotlin", 75]];
$("#langs").innerHTML = LANGS.map(
  ([n, v]) => `<div class="lang"><span>${n}</span><div class="meter"><i style="--w:${v}%"></i></div></div>`
).join("");

/* ================= Configurador de projeto ================= */
const builder = $("#builder");
const briefingEl = $("#briefing");
const cxLabel = $("#cx-label");
const cxBar = $("#cx-bar");
const TIPO_PESO = { "Site / Landing page": 1, "E-commerce": 2, "Sistema empresarial": 3, "Automação com IA": 2.5, "Aplicativo mobile": 2.5, "Software sob medida": 3 };
const PORTE_PESO = { "Pequeno porte": 0, "Médio porte": 1, "Grande porte": 2.5 };

const readBuilder = () => {
  const fd = new FormData(builder);
  return {
    tipo: fd.get("tipo"),
    porte: fd.get("porte"),
    recursos: fd.getAll("recursos"),
    prazo: fd.get("prazo"),
    nome: (fd.get("nome") || "").trim(),
    empresa: (fd.get("empresa") || "").trim(),
    telefone: (fd.get("telefone") || "").trim(),
    mensagem: (fd.get("mensagem") || "").trim(),
  };
};

const updateBriefing = () => {
  const d = readBuilder();
  const json = {
    projeto: d.tipo,
    porte: d.porte,
    recursos: d.recursos,
    prazo: d.prazo,
    cliente: d.empresa || d.nome || "—",
  };
  briefingEl.innerHTML = highlight(JSON.stringify(json, null, 2), "ts");
  const score = TIPO_PESO[d.tipo] + PORTE_PESO[d.porte] + d.recursos.length * 0.45;
  const [label, pct] = score < 2.2 ? ["Baixa", 25] : score < 3.8 ? ["Média", 50] : score < 5.5 ? ["Alta", 75] : ["Enterprise", 100];
  cxLabel.textContent = label;
  cxBar.style.setProperty("--w", pct + "%");
};
builder.addEventListener("input", updateBriefing);
builder.addEventListener("change", updateBriefing);
updateBriefing();

builder.addEventListener("submit", (e) => {
  e.preventDefault();
  const d = readBuilder();
  const err = $("#form-error");
  if (!d.nome || !d.telefone) {
    err.textContent = "Preencha seu nome e WhatsApp para enviarmos a proposta.";
    $(d.nome ? '[name="telefone"]' : '[name="nome"]', builder).focus();
    return;
  }
  err.textContent = "";
  const msg = [
    "Olá! Montei meu projeto no site da Nexor:",
    `• Projeto: ${d.tipo}`,
    `• Porte: ${d.porte}`,
    d.recursos.length && `• Recursos: ${d.recursos.join(", ")}`,
    `• Prazo: ${d.prazo}`,
    `• Nome: ${d.nome}`,
    d.empresa && `• Empresa: ${d.empresa}`,
    `• WhatsApp: ${d.telefone}`,
    d.mensagem && `• Ideia: ${d.mensagem}`,
  ].filter(Boolean).join("\n");
  window.open(whatsUrl(msg), "_blank", "noopener");
});

/* ================= Animação de entrada ================= */
if ("IntersectionObserver" in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  $$(".reveal").forEach((el) => io.observe(el));
} else {
  $$(".reveal").forEach((el) => el.classList.add("visible"));
}
