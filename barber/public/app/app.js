/* App do cliente Nexor Barber.
   Entrar com Google, WhatsApp ou SMS · "o de sempre" em um toque · agendar em 4 passos · lista de espera ·
   clube de assinatura · loja com reserva · "estou chegando" · vaga relâmpago (#vaga-…). */

/* ---------- Utilidades ---------- */
function h(tag, at = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(at ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "class") el.className = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  const por = (f) => {
    if (f === null || f === undefined || f === false) return;
    if (Array.isArray(f)) return f.forEach(por);
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  };
  filhos.forEach(por);
  return el;
}
const limpar = (el, ...f) => (el.replaceChildren(), f.flat(9).forEach((x) => x != null && x !== false && el.append(x instanceof Node ? x : document.createTextNode(String(x)))), el);
const reais = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIAS_C = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const dsem = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const somar = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
function nomeDia(d) {
  if (d === hojeISO()) return "hoje";
  if (d === somar(hojeISO(), 1)) return "amanhã";
  return `${DIAS[dsem(d)]}, ${d.slice(8)}/${d.slice(5, 7)}`;
}
const iniciais = (n) => n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
const CAM = {
  inicio: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  mais: "M12 5v14M5 12h14",
  coroa: "M3 18h18M4 18 3 7l5 4 4-6 4 6 5-4-1 11",
  sacola: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  pessoa: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  check: "M20 6 9 17l-5-5",
  voltar: "M15 18l-6-6 6-6",
  raio: "M13 2 3 14h9l-1 8 10-12h-9z",
  calendario: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  local: "M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  whatsapp: "M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3zM8.5 9.5c.5 2 2 3.6 4 4.5l1.3-1.2 2.2 1-.5 1.7c-3.7.3-7.8-3.7-7.6-7.5l1.7-.5 1 2.2z",
  celular: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  sair: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  tesoura: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12",
};
function ic(nome, t = 20) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: t, height: t, fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", CAM[nome] ?? CAM.mais);
  s.append(p);
  return s;
}
function aviso(texto, erro = false) {
  const t = h("div", { class: `toast ${erro ? "erro" : ""}`, role: erro ? "alert" : "status" }, texto);
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), erro ? 6000 : 3600);
}
async function api(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`/api/app${caminho}`, { method: metodo, credentials: "same-origin", headers: { "x-nexor": "1", ...(corpo !== undefined ? { "content-type": "application/json" } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  const d = (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : await r.text();
  if (!r.ok) {
    const e = new Error(d?.erro ?? `Erro ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return d;
}
const post = (c, corpo = {}) => api(c, { metodo: "POST", corpo });
async function acao(botao, fn) {
  botao.disabled = true;
  botao.classList.add("carregando");
  try {
    return await fn();
  } catch (e) {
    aviso(e.message, true);
  } finally {
    botao.disabled = false;
    botao.classList.remove("carregando");
  }
}
const botao = (texto, fn, cls = "btn-cor btn-bloco", icone) => {
  const b = h("button", { class: `btn ${cls}`, type: "button" }, icone ? ic(icone, 18) : null, texto);
  b.onclick = () => acao(b, () => fn(b));
  return b;
};

/* ---------- Estado ---------- */
const app = document.getElementById("app");
const S = { info: null, eu: null, fluxo: null };
const rota = () => location.hash.replace(/^#\/?/, "") || "inicio";
const ir = (r) => (location.hash === `#${r}` ? desenhar() : (location.hash = r));
async function recarregarEu() {
  try {
    S.eu = await api("/eu");
  } catch (e) {
    if (e.status !== 401) throw e;
    S.eu = null;
  }
}

/* ---------- Entrar ---------- */
function telaEntrar(aoEntrar, titulo = "Entre para agendar") {
  const caixa = h("div", { class: "entrar" });
  const e = S.info.entrar;
  let canal = null;
  let fone = "";
  function inicio() {
    const gsi = h("div", { class: "gsi" });
    limpar(
      caixa,
      h("h2", {}, titulo),
      e.google || e.whatsapp || e.sms ? h("p", { class: "suave pequeno" }, "Sem senha. Leva 10 segundos.") : null,
      e.google ? gsi : null,
      e.google && (e.whatsapp || e.sms) ? h("div", { class: "ou" }, "ou receba um código") : null,
      e.whatsapp ? botao("Entrar pelo WhatsApp", () => pedirFone("whatsapp"), "btn-whats btn-bloco", "whatsapp") : null,
      e.sms ? botao("Entrar por SMS", () => pedirFone("sms"), "btn-fantasma btn-bloco", "celular") : null,
      !e.google && !e.whatsapp && !e.sms ? h("p", { class: "suave" }, "O agendamento online ainda está sendo configurado. Fale com a barbearia.") : null,
    );
    if (e.google) google(gsi);
  }
  function google(alvo) {
    const iniciar = () => {
      window.google.accounts.id.initialize({
        client_id: e.google,
        callback: async ({ credential }) => {
          try {
            const r = await post("/google", { credencial: credential });
            await recarregarEu();
            if (r.precisa_celular) return confirmarCelular(aoEntrar);
            aoEntrar();
          } catch (err) {
            aviso(err.message, true);
          }
        },
      });
      window.google.accounts.id.renderButton(alvo, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: Math.min(360, alvo.clientWidth || 320), locale: "pt-BR" });
    };
    if (window.google?.accounts?.id) return iniciar();
    const s = h("script", { src: "https://accounts.google.com/gsi/client", async: true });
    s.onload = iniciar;
    s.onerror = () => limpar(alvo, h("p", { class: "suave pequeno" }, "Login com Google indisponível agora."));
    document.head.append(s);
  }
  function pedirFone(c) {
    canal = c;
    const inp = h("input", { class: "entrada", type: "tel", inputmode: "tel", autocomplete: "tel-national", placeholder: "(34) 99999-0000", value: fone });
    limpar(caixa, h("button", { class: "voltar", onclick: inicio }, ic("voltar", 16), "Voltar"), h("h2", {}, "Qual é o seu celular?"), h("p", { class: "suave pequeno" }, c === "whatsapp" ? "Vamos mandar um código pelo WhatsApp." : "Vamos mandar um código por SMS."), inp, botao("Receber código", async () => {
      fone = inp.value;
      await post("/codigo", { fone, canal });
      pedirCodigo();
    }));
    inp.focus();
  }
  function pedirCodigo() {
    const inp = h("input", { class: "entrada codigo", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 6, placeholder: "······" });
    const conferir = async () => {
      const r = await post("/verificar", { fone, codigo: inp.value });
      await recarregarEu();
      if (r.novo) return pedirNome();
      aoEntrar();
    };
    const b = botao("Entrar", conferir);
    inp.addEventListener("input", () => inp.value.replace(/\D/g, "").length === 6 && b.click());
    limpar(caixa, h("button", { class: "voltar", onclick: () => pedirFone(canal) }, ic("voltar", 16), "Trocar número"), h("h2", {}, "Digite o código"), h("p", { class: "suave pequeno" }, `Enviado ${canal === "whatsapp" ? "pelo WhatsApp" : "por SMS"} para ${fone}.`), inp, b, h("button", { class: "btn btn-fantasma btn-peq", onclick: (ev) => acao(ev.currentTarget, async () => (await post("/codigo", { fone, canal }), aviso("Código reenviado."))) }, "Reenviar código"));
    inp.focus();
  }
  function pedirNome() {
    const inp = h("input", { class: "entrada", autocomplete: "name", placeholder: "Seu nome" });
    limpar(caixa, h("h2", {}, "Como podemos te chamar?"), inp, botao("Continuar", async () => {
      await api("/eu", { metodo: "PUT", corpo: { nome: inp.value.trim() } });
      await recarregarEu();
      aoEntrar();
    }));
    inp.focus();
  }
  inicio();
  return h("section", { class: "cartao" }, caixa);
}

/** Quem entrou com Google confirma o celular (lembretes e o mesmo histórico de antes) */
function confirmarCelular(depois) {
  const caixa = h("div", { class: "entrar" });
  let fone = "";
  const passo1 = () => {
    const inp = h("input", { class: "entrada", type: "tel", inputmode: "tel", placeholder: "(34) 99999-0000" });
    const e = S.info.entrar;
    limpar(caixa, h("h2", {}, "Confirme seu celular"), h("p", { class: "suave pequeno" }, "Para receber a confirmação e o lembrete do horário. Se você já era cliente, juntamos seu histórico."), inp, e.whatsapp ? botao("Código pelo WhatsApp", async () => ((fone = inp.value), await post("/codigo", { fone, canal: "whatsapp" }), passo2()), "btn-whats btn-bloco", "whatsapp") : null, e.sms ? botao("Código por SMS", async () => ((fone = inp.value), await post("/codigo", { fone, canal: "sms" }), passo2()), "btn-fantasma btn-bloco", "celular") : null);
  };
  const passo2 = () => {
    const inp = h("input", { class: "entrada codigo", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 6 });
    limpar(caixa, h("h2", {}, "Digite o código"), inp, botao("Confirmar", async () => {
      const r = await post("/celular", { fone, codigo: inp.value });
      if (r.unificado) aviso("Pronto! Juntamos com o seu cadastro da barbearia.");
      await recarregarEu();
      depois();
    }));
    inp.focus();
  };
  passo1();
  limpar(app, h("div", { class: "casca" }, cabecalho(), h("div", { class: "secao" }, h("section", { class: "cartao" }, caixa))));
}

/* ---------- Peças ---------- */
function cabecalho() {
  const m = S.info.marca;
  return h("header", { class: "topo" }, h("div", {}, h("h1", {}, S.info.nome), m.slogan ? h("small", {}, m.slogan) : null), S.eu ? h("button", { class: "btn btn-fantasma btn-peq", "aria-label": "Meu perfil", onclick: () => ir("perfil") }, h("span", { class: "avatar", style: { width: "28px", height: "28px", fontSize: "12px", background: "var(--cor)" } }, iniciais(S.eu.cliente.nome))) : null);
}
function nav(ativa) {
  const itens = [
    ["inicio", "Início", "inicio"],
    ["clube", "Clube", "coroa"],
    ["agendar", "Agendar", "mais"],
    ["loja", "Loja", "sacola"],
    ["perfil", "Perfil", "pessoa"],
  ].filter(([k]) => !(k === "clube" && !S.info.planos.length) && !(k === "loja" && !S.info.vitrine.length));
  return h("nav", { class: "nav", "aria-label": "Navegação" }, h("div", { class: "nav-in", style: { gridTemplateColumns: `repeat(${itens.length}, 1fr)` } }, itens.map(([k, t, i]) => h("a", { href: `#${k}`, class: `${k === ativa ? "ativo" : ""} ${k === "agendar" ? "agendar" : ""}` }, ic(i, 22), t))));
}
const barbeiroDe = (id) => S.info.barbeiros.find((b) => b.id === id);
const servicoDe = (id) => S.info.servicos.find((s) => s.id === id);
const avatarBarbeiro = (b) => h("span", { class: "avatar", style: { background: b?.cor ?? "var(--sup2)" } }, b ? iniciais(b.nome) : ic("raio", 18));

function ticket(a) {
  const ms = a.inicio - Date.now();
  const falta = ms < 3600_000 ? `em ${Math.max(0, Math.round(ms / 60_000))} min` : ms < 86400_000 ? `em ${Math.round(ms / 3600_000)} h` : nomeDia(a.dia);
  return h(
    "section",
    { class: "cartao destaque ticket" },
    h("div", { class: "linha" }, h("span", { class: "rotulo" }, a.status === "chegou" ? "Avisamos que você chegou" : "Seu próximo horário"), h("span", { class: "contagem" }, falta)),
    h("div", { class: "quando" }, `${nomeDia(a.dia)} às ${a.hora}`),
    h("div", { class: "linha-esq suave" }, avatarBarbeiro(barbeiroDe(a.barbeiro.id) ?? a.barbeiro), h("span", {}, `${a.servico.nome} com ${a.barbeiro.nome}`), a.clube ? h("span", { class: "chip chip-ok" }, ic("coroa", 13), "clube") : h("span", { class: "chip" }, reais(a.preco_centavos))),
    a.reservas.filter((r) => r.status === "reservado").length ? h("small", { class: "suave" }, `Reservado para retirar: ${a.reservas.filter((r) => r.status === "reservado").map((r) => `${r.quantidade}× ${r.nome}`).join(", ")}`) : null,
    h(
      "div",
      { class: "btns" },
      a.status === "agendado" && ms < 2 * 3600_000 ? botao("Estou chegando", async () => (await post(`/agendamentos/${a.id}/cheguei`), aviso("A barbearia já sabe que você está chegando."), await recarregarEu(), desenhar()), "btn-cor", "local") : null,
      h("a", { class: "btn btn-fantasma", href: `/api/app/agendamentos/${a.id}/ics` }, ic("calendario", 18), "Pôr na agenda"),
      a.pode_mudar ? botao("Remarcar", () => remarcar(a), "btn-fantasma") : null,
      a.pode_mudar
        ? botao(
            "Cancelar",
            async (b) => {
              if (b.dataset.certeza !== "1") {
                b.dataset.certeza = "1";
                b.lastChild.textContent = "Toque de novo para cancelar";
                return;
              }
              await post(`/agendamentos/${a.id}/cancelar`);
              aviso("Horário cancelado.");
              await recarregarEu();
              desenhar();
            },
            "btn-perigo",
          )
        : null,
    ),
    !a.pode_mudar && a.status === "agendado" ? h("small", { class: "suave" }, `Para cancelar ou remarcar a menos de ${S.info.regras.cancelamento_horas} h, fale com a barbearia.`) : null,
  );
}

/* ---------- Telas ---------- */
function inicio(area) {
  if (!S.eu) {
    limpar(
      area,
      h("section", { class: "cartao destaque" }, h("span", { class: "rotulo" }, "Agende em segundos"), h("div", { class: "grande" }, "Seu horário, sem ligar e sem esperar resposta."), h("p", { class: "suave" }, "Escolha o serviço, o barbeiro e o horário livre. Lembrete no WhatsApp antes de cada corte.")),
      h("div", { class: "secao" }, telaEntrar(() => desenhar())),
      h("div", { class: "secao" }, h("h2", {}, "Serviços"), h("div", { class: "opcoes" }, S.info.servicos.map((s) => h("div", { class: "opcao" }, ic("tesoura", 20), h("div", { class: "meio" }, h("strong", {}, s.nome), h("small", {}, `${s.duracao_min} min`)), h("span", { class: "preco" }, reais(s.preco_centavos)))))),
      info(),
    );
    return;
  }
  const e = S.eu;
  const primeiro = e.cliente.nome.split(" ")[0];
  const sempre = e.de_sempre;
  limpar(
    area,
    h("p", { class: "ola" }, `Olá, ${primeiro}!`),
    e.retorno && !e.proximos.length && e.retorno.ciclo_dias && e.retorno.dias >= e.retorno.ciclo_dias ? h("p", { class: "suave" }, `Faz ${e.retorno.dias} dias do seu último corte. Você costuma voltar a cada ${e.retorno.ciclo_dias}.`) : null,
    e.proximos.map(ticket),
    sempre && sempre.dia
      ? h(
          "section",
          { class: "cartao destaque" },
          h("span", { class: "rotulo" }, ic("raio", 14), " O de sempre, em um toque"),
          h("div", { class: "grande" }, `${nomeDia(sempre.dia)} às ${sempre.hora}`),
          h("div", { class: "linha-esq suave" }, avatarBarbeiro(barbeiroDe(sempre.barbeiro.id)), h("span", {}, `${sempre.servico.nome} com ${sempre.barbeiro.nome}`)),
          botao("Agendar o de sempre", async () => {
            const a = await post("/agendar", { servico_id: sempre.servico.id, barbeiro_id: sempre.barbeiro.id, dia: sempre.dia, hora: sempre.hora });
            sucesso(a);
          }),
          h("button", { class: "btn btn-fantasma", onclick: () => ((S.fluxo = { servico: sempre.servico.id, barbeiro: sempre.barbeiro.id, passo: 3 }), ir("agendar")) }, "Outro dia ou horário"),
        )
      : null,
    !e.proximos.length && !sempre ? h("section", { class: "cartao destaque" }, h("span", { class: "rotulo" }, "Primeira vez por aqui?"), h("div", { class: "grande" }, "Escolha seu horário"), botao("Agendar agora", () => ((S.fluxo = null), ir("agendar")))) : e.proximos.length ? h("button", { class: "btn btn-fantasma btn-bloco", onclick: () => ((S.fluxo = null), ir("agendar")) }, ic("mais", 18), "Marcar outro horário") : null,
    e.espera.length ? h("div", { class: "secao" }, h("h2", {}, "Lista de espera"), e.espera.map((x) => h("section", { class: "cartao" }, h("div", { class: "linha" }, h("strong", {}, `${x.servico} · ${nomeDia(x.dia)}`), h("span", { class: "chip chip-alerta" }, "na fila")), h("small", { class: "suave" }, `Entre ${x.de} e ${x.ate}. Se abrir uma vaga, avisamos pelo WhatsApp na hora.`), botao("Sair da fila", async () => (await api(`/espera/${x.id}`, { metodo: "DELETE" }), await recarregarEu(), desenhar()), "btn-fantasma btn-peq")))) : null,
    e.clube ? cartaoClube(e.clube) : S.info.planos.length ? h("section", { class: "cartao" }, h("div", { class: "linha" }, h("strong", {}, ic("coroa", 16), " Clube de assinatura"), h("span", { class: "chip chip-cor" }, `a partir de ${reais(Math.min(...S.info.planos.map((p) => p.preco_centavos)))}/mês`)), h("small", { class: "suave" }, "Corte quando quiser, pagando um valor fixo por mês."), h("button", { class: "btn btn-fantasma btn-peq", onclick: () => ir("clube") }, "Conhecer os planos")) : null,
    info(),
  );
}

function info() {
  const m = S.info.marca;
  if (!m.endereco && !m.telefone && !m.instagram) return null;
  return h("div", { class: "secao" }, h("h2", {}, "A barbearia"), h("section", { class: "cartao" }, m.endereco ? h("div", { class: "linha-esq" }, ic("local", 18), m.mapa ? h("a", { href: m.mapa, target: "_blank", rel: "noopener" }, m.endereco) : h("span", {}, m.endereco)) : null, m.telefone ? h("div", { class: "linha-esq" }, ic("celular", 18), h("a", { href: `tel:${m.telefone.replace(/\D/g, "")}` }, m.telefone)) : null, m.instagram ? h("div", { class: "linha-esq suave" }, "Instagram: ", h("a", { href: `https://instagram.com/${m.instagram.replace(/^@/, "")}`, target: "_blank", rel: "noopener" }, m.instagram)) : null));
}

function cartaoClube(c) {
  return h(
    "section",
    { class: "cartao destaque" },
    h("div", { class: "linha" }, h("span", { class: "rotulo" }, ic("coroa", 14), ` Clube ${c.plano.nome}`), h("span", { class: `chip ${c.status === "ativa" ? "chip-ok" : "chip-alerta"}` }, { ativa: "ativo", pendente: "aguardando pagamento", atrasada: "pagamento em atraso" }[c.status] ?? c.status)),
    c.ciclo_fim ? h("small", { class: "suave" }, `Ciclo até ${c.ciclo_fim.slice(8)}/${c.ciclo_fim.slice(5, 7)}`) : null,
    c.usos.map((u) => h("div", { class: "uso" }, h("div", { class: "linha" }, h("span", {}, u.nome), h("small", { class: "suave" }, u.quantidade ? `${u.usados} de ${u.quantidade}` : `${u.usados} · ilimitado`)), h("div", { class: "trilho" }, h("i", { style: { width: u.quantidade ? `${Math.min(100, (u.usados / u.quantidade) * 100)}%` : "100%" } })))),
    c.link ? h("a", { class: "btn btn-cor btn-bloco", href: c.link, target: "_blank", rel: "noopener" }, "Pagar mensalidade") : null,
    c.status === "pendente" && !c.link ? h("small", { class: "suave" }, "Pague a primeira mensalidade na barbearia para ativar.") : null,
  );
}

/* ----- Agendar em 4 passos ----- */
async function agendar(area) {
  if (!S.eu) return limpar(area, telaEntrar(() => desenhar()));
  if (S.eu.precisa_celular) return confirmarCelular(() => desenhar());
  const f = (S.fluxo ??= { passo: 1, reservas: {} });
  f.reservas ??= {};
  const ultimo = S.eu.historico.find((x) => x.status === "concluido");
  const passos = h("div", { class: "passos" }, [1, 2, 3, 4].map((n) => h("i", { class: n <= f.passo ? "feito" : "" })));
  const voltar = f.passo > 1 ? h("button", { class: "voltar", onclick: () => ((f.passo -= 1), desenhar()) }, ic("voltar", 16), "Voltar") : null;
  const corpo = h("div", { class: "pilha" });
  limpar(area, passos, voltar, corpo);
  // Remarcação: no último passo troca o horário em vez de criar outro
  if (f.remarcar && f.passo === 4) {
    limpar(corpo, h("h2", {}, "Confirmar remarcação"), h("section", { class: "cartao" }, h("p", {}, `Novo horário: ${nomeDia(f.dia)} às ${f.hora}.`)), botao("Remarcar", async () => {
      const a = await post(`/agendamentos/${f.remarcar}/remarcar`, { dia: f.dia, hora: f.hora, ...(f.barbeiro ? { barbeiro_id: f.barbeiro } : {}) });
      S.fluxo = null;
      sucesso(a);
    }));
    return;
  }

  if (f.passo === 1) {
    limpar(corpo, h("h2", {}, "Qual serviço?"), h("div", { class: "opcoes" }, S.info.servicos.map((s) => h("button", { class: `opcao ${f.servico === s.id ? "ativa" : ""}`, onclick: () => ((f.servico = s.id), (f.passo = 2), desenhar()) }, ic("tesoura", 20), h("div", { class: "meio" }, h("strong", {}, s.nome), h("small", {}, [`${s.duracao_min} min`, s.descricao ? ` · ${s.descricao}` : ""])), h("span", { class: "preco" }, S.eu.clube?.status === "ativa" && S.eu.clube.usos.some((u) => u.servico_id === s.id) ? h("span", { class: "chip chip-ok" }, "clube") : reais(s.preco_centavos))))));
  } else if (f.passo === 2) {
    const quem = S.info.barbeiros.filter((b) => !b.servicos?.length || b.servicos.includes(f.servico));
    const ordem = ultimo ? [...quem].sort((a, b) => (b.id === ultimo.barbeiro.id) - (a.id === ultimo.barbeiro.id)) : quem;
    limpar(
      corpo,
      h("h2", {}, "Com quem?"),
      h(
        "div",
        { class: "opcoes" },
        ordem.map((b) => h("button", { class: `opcao ${f.barbeiro === b.id ? "ativa" : ""}`, onclick: () => ((f.barbeiro = b.id), (f.passo = 3), (f.dia = null), desenhar()) }, avatarBarbeiro(b), h("div", { class: "meio" }, h("strong", {}, b.nome), b.bio ? h("small", {}, b.bio) : null), ultimo?.barbeiro.id === b.id ? h("span", { class: "chip chip-cor" }, "seu barbeiro") : null)),
        quem.length > 1 ? h("button", { class: `opcao ${f.barbeiro === null ? "ativa" : ""}`, onclick: () => ((f.barbeiro = null), (f.passo = 3), (f.dia = null), desenhar()) }, avatarBarbeiro(null), h("div", { class: "meio" }, h("strong", {}, "Quem estiver livre"), h("small", {}, "Mais horários para escolher"))) : null,
      ),
    );
  } else if (f.passo === 3) {
    const q = new URLSearchParams({ servico: f.servico, ...(f.barbeiro ? { barbeiro: f.barbeiro } : {}) });
    limpar(corpo, h("h2", {}, "Quando?"), h("div", { class: "girando" }));
    const dias = await api(`/dias?${q}`);
    f.dia ??= dias.find((d) => d.livres > 0)?.dia ?? dias[0]?.dia;
    const faixa = h("div", { class: "dias" }, dias.map((d) => h("button", { class: `dia ${d.dia === f.dia ? "ativo" : ""} ${d.livres ? "" : "lotado"}`, onclick: () => ((f.dia = d.dia), (f.hora = null), desenhar()) }, h("small", {}, d.dia === hojeISO() ? "hoje" : DIAS_C[dsem(d.dia)]), h("strong", {}, d.dia.slice(8)), h("small", {}, MESES[Number(d.dia.slice(5, 7)) - 1]), h("i"))));
    const horas = await api(`/horarios?${q}&dia=${f.dia}`);
    const grupos = [
      ["Manhã", horas.horarios.filter((x) => x < "12:00")],
      ["Tarde", horas.horarios.filter((x) => x >= "12:00" && x < "18:00")],
      ["Noite", horas.horarios.filter((x) => x >= "18:00")],
    ].filter(([, l]) => l.length);
    limpar(
      corpo,
      h("h2", {}, "Quando?"),
      faixa,
      horas.clube.coberto ? h("span", { class: "chip chip-ok" }, ic("coroa", 13), "Este dia está coberto pelo seu clube") : horas.clube.motivo ? h("small", { class: "suave" }, horas.clube.motivo) : null,
      grupos.length
        ? grupos.map(([t, l]) => [h("div", { class: "periodo" }, t), h("div", { class: "horas" }, l.map((x) => h("button", { class: `hora ${x === f.hora ? "ativa" : ""}`, onclick: () => ((f.hora = x), (f.clube = horas.clube.coberto), (f.passo = 4), desenhar()) }, x)))])
        : h(
            "section",
            { class: "cartao" },
            h("strong", {}, "Sem horários livres neste dia"),
            S.info.regras.lista_espera ? [h("p", { class: "suave pequeno" }, "Entre na lista de espera: se alguém cancelar, você recebe a vaga na hora pelo WhatsApp."), espera(f)] : h("p", { class: "suave pequeno" }, "Escolha outro dia."),
          ),
    );
    corpo.querySelector(".dia.ativo")?.scrollIntoView({ inline: "center", block: "nearest" });
  } else {
    const s = servicoDe(f.servico);
    const b = f.barbeiro ? barbeiroDe(f.barbeiro) : null;
    const obs = h("input", { class: "entrada", placeholder: "Alguma observação? (opcional)", maxlength: 300 });
    const loja = S.info.vitrine.filter((p) => p.disponivel > 0);
    const totalProdutos = () => Object.entries(f.reservas).reduce((t, [id, q]) => t + (S.info.vitrine.find((p) => p.id === id)?.preco_centavos ?? 0) * q, 0);
    const totalEl = h("strong");
    const atualizarTotal = () => (totalEl.textContent = reais((f.clube ? 0 : s.preco_centavos) + totalProdutos()));
    limpar(
      corpo,
      h("h2", {}, "Confirme"),
      h("section", { class: "cartao" }, h("dl", { class: "resumo" }, h("dt", {}, "Serviço"), h("dd", {}, s.nome), h("dt", {}, "Barbeiro"), h("dd", {}, b ? b.nome : "Quem estiver livre"), h("dt", {}, "Quando"), h("dd", {}, `${nomeDia(f.dia)} às ${f.hora}`), h("dt", {}, "Valor"), h("dd", {}, f.clube ? h("span", { class: "chip chip-ok" }, "pelo clube") : reais(s.preco_centavos)))),
      loja.length
        ? h(
            "section",
            { class: "cartao" },
            h("strong", {}, ic("sacola", 16), " Quer separar algum produto?"),
            h("small", { class: "suave" }, "Fica reservado e você paga junto com o corte."),
            loja.map((p) => {
              const n = h("span", {}, String(f.reservas[p.id] ?? 0));
              const mudar = (d) => {
                const v = Math.max(0, Math.min(p.disponivel, 5, (f.reservas[p.id] ?? 0) + d));
                if (v) f.reservas[p.id] = v;
                else delete f.reservas[p.id];
                n.textContent = String(v);
                atualizarTotal();
              };
              return h("div", { class: "produto-linha" }, h("div", {}, h("div", {}, p.nome), h("small", { class: "suave" }, reais(p.preco_centavos))), h("div", { class: "qtd" }, h("button", { type: "button", "aria-label": "Menos", onclick: () => mudar(-1) }, "−"), n, h("button", { type: "button", "aria-label": "Mais", onclick: () => mudar(1) }, "+")));
            }),
          )
        : null,
      obs,
      h("div", { class: "linha" }, h("span", { class: "suave" }, "Total"), totalEl),
      botao("Confirmar agendamento", async () => {
        const a = await post("/agendar", { servico_id: f.servico, barbeiro_id: f.barbeiro, dia: f.dia, hora: f.hora, observacao: obs.value.trim() || null, reservas: Object.entries(f.reservas).map(([produto_id, quantidade]) => ({ produto_id, quantidade })) });
        S.fluxo = null;
        sucesso(a);
      }),
      h("small", { class: "suave" }, `Você pode cancelar ou remarcar pelo app até ${S.info.regras.cancelamento_horas} h antes.`),
    );
    atualizarTotal();
  }
}

function espera(f) {
  const de = h("input", { class: "entrada", type: "time", value: "09:00" });
  const ate = h("input", { class: "entrada", type: "time", value: "20:00" });
  return h("div", { class: "pilha" }, h("div", { class: "btns" }, h("label", { class: "campo" }, "A partir de", de), h("label", { class: "campo" }, "Até", ate)), botao("Entrar na lista de espera", async () => {
    await post("/espera", { servico_id: f.servico, barbeiro_id: f.barbeiro, dia: f.dia, de: de.value, ate: ate.value });
    aviso("Você está na fila. Avisamos pelo WhatsApp se abrir vaga.");
    S.fluxo = null;
    await recarregarEu();
    ir("inicio");
  }, "btn-fantasma btn-bloco", "raio"));
}

async function remarcar(a) {
  S.fluxo = { servico: a.servico.id, barbeiro: a.barbeiro.id, passo: 3, remarcar: a.id };
  ir("agendar");
}

function sucesso(a) {
  recarregarEu().catch(() => {});
  limpar(
    app,
    h(
      "div",
      { class: "casca" },
      cabecalho(),
      h(
        "div",
        { class: "sucesso" },
        h("div", { class: "check" }, ic("check", 40)),
        h("h2", {}, "Horário marcado!"),
        h("p", { class: "suave" }, `${a.servico.nome} com ${a.barbeiro.nome}, ${nomeDia(a.dia)} às ${a.hora}.`),
        a.clube ? h("span", { class: "chip chip-ok" }, ic("coroa", 13), "pelo clube") : null,
        h("p", { class: "suave pequeno" }, "Você recebe a confirmação e um lembrete no WhatsApp."),
        h("a", { class: "btn btn-fantasma btn-bloco", href: `/api/app/agendamentos/${a.id}/ics` }, ic("calendario", 18), "Pôr na agenda do celular"),
        h("button", { class: "btn btn-cor btn-bloco", onclick: () => ir("inicio") }, "Pronto"),
      ),
    ),
  );
}

/* ----- Clube ----- */
function clube(area) {
  const meu = S.eu?.clube;
  const nome = (id) => servicoDe(id)?.nome ?? "Serviço";
  limpar(
    area,
    h("h2", { class: "ola" }, "Clube de assinatura"),
    h("p", { class: "suave" }, "Um valor fixo por mês e você corta sem pensar no preço."),
    meu ? cartaoClube(meu) : null,
    S.info.planos.map((p) =>
      h(
        "section",
        { class: `cartao ${meu?.plano.id === p.id ? "destaque" : ""}` },
        h("div", { class: "linha" }, h("h3", {}, p.nome), h("strong", {}, `${reais(p.preco_centavos)}/mês`)),
        p.descricao ? h("p", { class: "suave pequeno" }, p.descricao) : null,
        h("div", { class: "pilha", style: { gap: "4px" } }, p.itens.map((i) => h("div", { class: "linha-esq" }, ic("check", 16), `${nome(i.servico_id)} ${i.quantidade ? `· ${i.quantidade}× por mês` : "ilimitado"}`)), p.dias_semana.length ? h("div", { class: "linha-esq suave" }, ic("calendario", 16), `Vale ${p.dias_semana.map((d) => DIAS_C[d]).join(", ")}`) : null, p.desconto_produtos ? h("div", { class: "linha-esq" }, ic("sacola", 16), `${p.desconto_produtos}% de desconto nos produtos`) : null),
        !meu ? botao("Assinar este plano", () => assinar(p), "btn-cor btn-bloco", "coroa") : null,
      ),
    ),
    meu && meu.status !== "cancelada"
      ? botao(
          "Cancelar assinatura",
          async (b) => {
            if (b.dataset.certeza !== "1") return ((b.dataset.certeza = "1"), (b.lastChild.textContent = "Toque de novo para confirmar"));
            await post("/assinatura/cancelar");
            aviso("Assinatura cancelada.");
            await recarregarEu();
            desenhar();
          },
          "btn-perigo btn-bloco",
        )
      : null,
  );
}
function assinar(p) {
  if (!S.eu) return ir("perfil");
  const area = h("div", { class: "pilha" });
  const cpf = h("input", { class: "entrada", inputmode: "numeric", placeholder: "CPF (para a cobrança)" });
  limpar(area, h("button", { class: "voltar", onclick: () => desenhar() }, ic("voltar", 16), "Voltar"), h("h2", {}, `Assinar ${p.nome}`), h("p", { class: "suave" }, `${reais(p.preco_centavos)} por mês. Pague por Pix, boleto ou cartão.`), cpf, botao("Continuar para o pagamento", async () => {
    const r = await post("/assinar", { plano_id: p.id, cpf: cpf.value || null });
    await recarregarEu();
    if (r.link) location.href = r.link;
    else {
      aviso(r.pagar_no_balcao ? "Assinatura criada! Pague a primeira mensalidade na barbearia para ativar." : "Assinatura criada.");
      desenhar();
    }
  }));
  limpar(document.getElementById("tela"), area);
}

/* ----- Loja ----- */
function loja(area) {
  const proximo = S.eu?.proximos.find((a) => a.status === "agendado");
  const desconto = S.eu?.clube?.status === "ativa" ? S.eu.clube.plano.desconto_produtos : 0;
  limpar(
    area,
    h("h2", { class: "ola" }, "Loja da barbearia"),
    h("p", { class: "suave" }, proximo ? `Reserve e retire no seu horário de ${nomeDia(proximo.dia)} às ${proximo.hora}.` : "Reserve ao agendar e pague junto com o corte."),
    desconto ? h("span", { class: "chip chip-ok" }, ic("coroa", 13), `${desconto}% de desconto do clube no balcão`) : null,
    h(
      "div",
      { class: "vitrine" },
      S.info.vitrine.map((p) =>
        h(
          "section",
          { class: "cartao" },
          h("strong", {}, p.nome),
          p.descricao ? h("small", { class: "suave" }, p.descricao) : null,
          h("span", {}, reais(p.preco_centavos)),
          p.disponivel ? (proximo ? botao("Reservar", async () => (await post(`/agendamentos/${proximo.id}/reservas`, { produto_id: p.id, quantidade: 1 }), aviso(`${p.nome} reservado para o seu horário.`), await carregarInfo(), await recarregarEu(), desenhar()), "btn-fantasma btn-peq") : null) : h("small", { class: "suave" }, "Esgotado"),
        ),
      ),
    ),
    !proximo && S.eu ? h("button", { class: "btn btn-cor btn-bloco", onclick: () => ((S.fluxo = null), ir("agendar")) }, "Agendar e reservar") : null,
  );
}

/* ----- Perfil ----- */
function perfil(area) {
  if (!S.eu) return limpar(area, telaEntrar(() => desenhar(), "Entre na sua conta"));
  const c = S.eu.cliente;
  const nome = h("input", { class: "entrada", value: c.nome });
  const email = h("input", { class: "entrada", type: "email", value: c.email ?? "", placeholder: "E-mail (opcional)" });
  const nasc = h("input", { class: "entrada", type: "date", value: c.nascimento ?? "" });
  const msgs = h("input", { type: "checkbox", checked: c.aceita_mensagens });
  limpar(
    area,
    h("h2", { class: "ola" }, "Seu perfil"),
    h("section", { class: "cartao" }, h("label", { class: "campo" }, "Nome", nome), h("label", { class: "campo" }, "E-mail", email), h("label", { class: "campo" }, "Aniversário (tem surpresa?)", nasc), h("label", { class: "linha-esq" }, msgs, h("span", {}, "Receber lembretes e avisos de vaga no WhatsApp")), h("small", { class: "suave" }, c.fone ? `Celular: ${c.fone.slice(2, 4)} ${c.fone.slice(4, -4)}-${c.fone.slice(-4)}` : "Celular ainda não confirmado."), botao("Salvar", async () => (await api("/eu", { metodo: "PUT", corpo: { nome: nome.value.trim(), email: email.value.trim(), nascimento: nasc.value, aceita_mensagens: msgs.checked } }), aviso("Perfil salvo."), await recarregarEu()))),
    !c.fone ? h("button", { class: "btn btn-fantasma btn-bloco", onclick: () => confirmarCelular(() => desenhar()) }, ic("celular", 18), "Confirmar celular") : null,
    S.eu.historico.length ? h("div", { class: "secao" }, h("h2", {}, "Seus últimos horários"), S.eu.historico.map((a) => h("section", { class: "cartao" }, h("div", { class: "linha" }, h("strong", {}, `${a.dia.slice(8)}/${a.dia.slice(5, 7)} · ${a.servico.nome}`), h("span", { class: "chip" }, { concluido: "atendido", cancelado: "cancelado", faltou: "faltou" }[a.status])), h("small", { class: "suave" }, `com ${a.barbeiro.nome}`), a.status === "concluido" ? h("button", { class: "btn btn-fantasma btn-peq", onclick: () => ((S.fluxo = { servico: a.servico.id, barbeiro: a.barbeiro.id, passo: 3 }), ir("agendar")) }, "Repetir") : null))) : null,
    h("div", { class: "secao" }, botao("Sair", async () => (await post("/sair"), (S.eu = null), ir("inicio")), "btn-fantasma btn-bloco", "sair")),
  );
}

/* ----- Vaga relâmpago (link do WhatsApp) ----- */
async function vaga(area, token) {
  if (!S.eu) return limpar(area, h("section", { class: "cartao destaque" }, h("span", { class: "rotulo" }, ic("raio", 14), " Abriu uma vaga"), h("p", {}, "Entre com o mesmo celular em que recebeu o aviso.")), h("div", { class: "secao" }, telaEntrar(() => desenhar())));
  let v;
  try {
    v = await api(`/vaga/${token}`);
  } catch (e) {
    return limpar(area, h("div", { class: "vazio" }, h("h2", {}, "Oferta não encontrada"), h("p", {}, e.message), h("a", { class: "btn btn-cor", href: "#inicio" }, "Ir para o início")));
  }
  const min = v.expira_em ? Math.max(0, Math.round((v.expira_em - Date.now()) / 60_000)) : 0;
  limpar(
    area,
    h(
      "section",
      { class: "cartao destaque" },
      h("span", { class: "rotulo" }, ic("raio", 14), " Vaga relâmpago"),
      v.vencida || !v.hora ? [h("div", { class: "grande" }, "Esta vaga já foi preenchida"), h("p", { class: "suave" }, "Você continua na lista de espera e avisamos se abrir outra."), h("a", { class: "btn btn-fantasma", href: "#inicio" }, "Voltar")] : [h("div", { class: "grande" }, `${nomeDia(v.dia)} às ${v.hora}`), h("p", { class: "suave" }, `${v.servico} com ${v.barbeiro}. Quem confirmar primeiro leva.`), h("small", { class: "suave" }, `A oferta vale por mais ${min} min.`), botao("Quero esta vaga", async () => sucesso(await post(`/vaga/${token}`)))],
    ),
  );
}

/* ---------- Roteamento ---------- */
async function carregarInfo() {
  S.info = await api("/info");
  document.documentElement.style.setProperty("--cor", S.info.marca.cor || "#3b8dff");
  document.title = `${S.info.nome} · agendar`;
}
async function desenhar() {
  const r = rota();
  const area = h("main", { id: "tela", class: "pilha" });
  const ativa = r.startsWith("vaga-") ? "inicio" : r;
  limpar(app, h("div", { class: "casca" }, cabecalho(), area), nav(ativa));
  scrollTo(0, 0);
  try {
    if (r.startsWith("vaga-")) await vaga(area, r.slice(5));
    else if (r === "agendar") await agendar(area);
    else if (r === "clube") clube(area);
    else if (r === "loja") loja(area);
    else if (r === "perfil") perfil(area);
    else inicio(area);
  } catch (e) {
    limpar(area, h("div", { class: "vazio" }, h("h2", {}, "Algo deu errado"), h("p", {}, e.message), h("button", { class: "btn btn-cor", onclick: () => location.reload() }, "Tentar de novo")));
  }
}


(async () => {
  try {
    await carregarInfo();
  } catch (e) {
    limpar(app, h("div", { class: "casca vazio" }, h("h2", {}, "Agendamento indisponível"), h("p", {}, e.message)));
    return;
  }
  await recarregarEu();
  window.addEventListener("hashchange", desenhar);
  desenhar();
  // Atualiza a contagem do próximo horário
  setInterval(() => document.visibilityState === "visible" && rota() === "inicio" && S.eu?.proximos.length && desenhar(), 60_000);
})();
