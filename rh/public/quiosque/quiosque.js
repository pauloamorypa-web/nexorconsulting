/* Quiosque: tablet ou TV na entrada mostrando o QR Code que muda a cada 30 s. O colaborador aponta a câmera
   do celular, o app de ponto abre e registra com a prova de que ele estava ali. Quem estiver sem celular
   pode bater com CPF + PIN (se a empresa permitir). */

const raiz = document.getElementById("q");
const chave = location.hash.slice(1) || (() => { try { return localStorage.getItem("nx-quiosque") ?? ""; } catch { return ""; } })();
if (location.hash.length > 1) {
  try { localStorage.setItem("nx-quiosque", chave); } catch { /* sem armazenamento */ }
  history.replaceState(null, "", "/quiosque/");
}
const el = (tag, attrs = {}, ...filhos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k.startsWith("on") ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v);
  e.append(...filhos.flat().filter((f) => f !== null && f !== undefined));
  return e;
};
const chamar = async (caminho, opcoes = {}) => {
  const r = await fetch(`/api${caminho}`, { ...opcoes, headers: { "x-quiosque": chave, "x-nexor": "1", "Content-Type": "application/json", ...(opcoes.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.erro ?? `Erro ${r.status}`), { status: r.status });
  return d;
};

let dados = null;
let deslocamento = 0;
const img = el("img", { alt: "QR Code para registrar o ponto" });
const barra = el("i");
const relogio = el("div", { class: "relogio" });
const data = el("div", { class: "data" });
const local = el("div", { class: "local" });
const botaoPin = el("button", { class: "btn pin", onclick: () => abrirPin() }, "Sem celular? Bater com CPF e PIN");

function montar() {
  raiz.replaceChildren(
    el("section", {}, el("div", { class: "marca" }, el("img", { src: "/img/logo-mark.webp", alt: "" }), el("span", {}, dados?.empresa ?? "")), el("h1", {}, "Registre seu ponto"), relogio, data, el("ol", { class: "passos" }, el("li", {}, el("b", {}, "1"), "Abra a câmera do celular"), el("li", {}, el("b", {}, "2"), "Aponte para o QR Code"), el("li", {}, el("b", {}, "3"), "Confirme com sua digital")), dados?.pin ? botaoPin : null),
    el("section", {}, el("div", { class: "qr-caixa" }, img, el("div", { class: "barra" }, barra)), local),
  );
}

async function atualizarQr() {
  try {
    dados = await chamar("/quiosque/qr");
    deslocamento = dados.agora - Date.now();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dados.svg)}`;
    local.textContent = dados.local;
    if (!raiz.querySelector(".qr-caixa")) montar();
    const falta = Math.max(1000, dados.troca_em - (Date.now() + deslocamento));
    setTimeout(atualizarQr, falta + 150);
  } catch (e) {
    if (e.status === 401) return raiz.replaceChildren(el("p", { class: "aviso" }, "Este quiosque não está autorizado. No painel do RH, vá em Configurações → Locais e quiosque e gere o link."));
    raiz.replaceChildren(el("p", { class: "aviso" }, "Sem conexão. Tentando de novo…"));
    setTimeout(atualizarQr, 5000);
  }
}

function tique() {
  const agora = new Date(Date.now() + deslocamento);
  relogio.textContent = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" });
  const txt = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
  data.textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
  if (dados) barra.style.transform = `scaleX(${Math.max(0, Math.min(1, (dados.troca_em - agora.getTime()) / (dados.segundos * 1000)))})`;
}

function abrirPin() {
  let fase = "cpf";
  let cpf = "";
  const entrada = el("input", { inputmode: "numeric", readonly: "true", placeholder: "Digite seu CPF" });
  const msg = el("p", { class: "erro" });
  const titulo = el("strong", {}, "CPF");
  const fechar = () => modal.remove();
  let tempo = setTimeout(fechar, 45_000);
  const tecla = (t) => {
    clearTimeout(tempo);
    tempo = setTimeout(fechar, 45_000);
    if (t === "⌫") entrada.value = entrada.value.slice(0, -1);
    else if (t === "OK") return avancar();
    else if (entrada.value.length < (fase === "cpf" ? 11 : 6)) entrada.value += t;
  };
  const avancar = async () => {
    if (fase === "cpf") {
      if (entrada.value.length !== 11) return (msg.textContent = "O CPF tem 11 números.");
      cpf = entrada.value;
      fase = "pin";
      titulo.textContent = "PIN";
      entrada.value = "";
      entrada.type = "password";
      entrada.placeholder = "Seu PIN";
      msg.textContent = "";
      return;
    }
    try {
      const r = await chamar("/quiosque/ponto", { method: "POST", body: JSON.stringify({ cpf, pin: entrada.value }) });
      caixa.replaceChildren(el("p", { class: "ok" }, `✔ ${r.hora}`), el("p", { style: "text-align:center;font-size:20px" }, `Ponto registrado, ${r.nome}!`), el("p", { style: "text-align:center;color:#a7b4ca" }, `NSR ${r.comprovante.nsr} · o comprovante fica no app`));
      setTimeout(fechar, 3500);
    } catch (e) {
      msg.textContent = e.message;
      entrada.value = "";
    }
  };
  const caixa = el("div", { class: "caixa" }, titulo, entrada, msg, el("div", { class: "teclado" }, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].map((t) => el("button", { onclick: () => tecla(t) }, t))), el("button", { class: "btn", onclick: fechar }, "Cancelar"));
  const modal = el("div", { class: "modal", onclick: (e) => e.target === modal && fechar() }, caixa);
  document.body.append(modal);
}

if (!chave) raiz.replaceChildren(el("p", { class: "aviso" }, "Abra o link do quiosque gerado no painel do RH (Configurações → Locais e quiosque)."));
else {
  atualizarQr();
  setInterval(tique, 250);
  // Mantém a tela ligada quando o navegador permite
  navigator.wakeLock?.request?.("screen").catch(() => {});
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && navigator.wakeLock?.request?.("screen").catch(() => {}));
}
