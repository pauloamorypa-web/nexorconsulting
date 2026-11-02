/* App do trabalhador: ativação, ponto com biometria (WebAuthn), GPS e QR Code, espelho, pedidos, holerites,
   comunicados e documentos. Funciona como app instalado (PWA). */

import { api, definirAoDeslogar, get, post, put } from "/js/api.js";
import { acao, aviso, h, icone, janela, limpar, reais } from "/js/ui.js";

const raiz = document.getElementById("app");
const estado = { eu: null, aba: "inicio", qr: null };

/* ---------- Utilidades ---------- */
const b64 = {
  para: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  de: (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0)),
};
const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
const hhmm = (min) => (min ? `${min < 0 ? "-" : ""}${Math.floor(Math.abs(min) / 60)}h${String(Math.abs(min) % 60).padStart(2, "0")}` : "0h00");
const mesAtual = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const mesBR = (c) => maiuscula(new Date(`${c}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const nomeAparelho = () => {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? (/; ([^;)]+) Build/.exec(ua)?.[1] ?? "Android") : "Navegador";
};
const vibrar = (p) => navigator.vibrate?.(p);

// QR Code lido pela câmera do celular abre /app/?q=TOKEN
const q = new URLSearchParams(location.search).get("q");
if (q) {
  estado.qr = { token: q, lido: Date.now() };
  history.replaceState(null, "", "/app/");
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(() => {});

/* ---------- Ativação ---------- */
function telaAtivacao() {
  const cpf = h("input", { class: "entrada entrada-grande", inputmode: "numeric", autocomplete: "username", placeholder: "000.000.000-00", maxlength: 14, oninput: (e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 11); e.target.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); } });
  const codigo = h("input", { class: "entrada entrada-grande codigo", inputmode: "numeric", autocomplete: "one-time-code", placeholder: "••••••", maxlength: 6 });
  const botao = h("button", { class: "btn btn-primario btn-grande", type: "submit" }, "Entrar");
  limpar(
    raiz,
    h(
      "main",
      { class: "ativacao" },
      h("img", { src: "/img/logo-mark.webp", alt: "", width: 64, height: 64 }),
      h("h1", {}, "Meu Ponto"),
      h("p", { class: "suave" }, "Entre com seu CPF e o código de 6 números que o RH enviou."),
      h("form", { class: "pilha", onsubmit: (e) => (e.preventDefault(), acao(botao, async () => (await post("/app/ativar", { cpf: cpf.value, codigo: codigo.value }), iniciar()))) }, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "CPF"), cpf), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Código do RH"), codigo), botao),
      h("p", { class: "suave pequeno" }, "Depois de entrar, você fica conectado neste celular. Seus dados são protegidos pela LGPD."),
    ),
  );
  cpf.focus();
}

/* ---------- Biometria ---------- */
const temBiometria = async () => Boolean(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false)));

async function cadastrarBiometria() {
  const o = await post("/app/biometria/opcoes");
  const cred = await navigator.credentials.create({
    publicKey: { ...o, challenge: b64.de(o.challenge), user: { ...o.user, id: b64.de(o.user.id) }, excludeCredentials: o.excludeCredentials.map((c) => ({ ...c, id: b64.de(c.id) })) },
  });
  await post("/app/biometria", { id: cred.id, resposta: { clientDataJSON: b64.para(cred.response.clientDataJSON), attestationObject: b64.para(cred.response.attestationObject) }, aparelho: nomeAparelho() });
  aviso("Biometria ativada! Agora é só encostar o dedo ou olhar para o celular.");
}

async function confirmarBiometria(o) {
  const a = await navigator.credentials.get({ publicKey: { ...o, challenge: b64.de(o.challenge), allowCredentials: o.allowCredentials.map((c) => ({ ...c, id: b64.de(c.id) })) } });
  return { id: a.id, clientDataJSON: b64.para(a.response.clientDataJSON), authenticatorData: b64.para(a.response.authenticatorData), signature: b64.para(a.response.signature) };
}

/* ---------- Localização ---------- */
const localizar = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Este aparelho não informa a localização."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? "Permita o acesso à localização para registrar o ponto (Ajustes do navegador)." : "Não foi possível obter sua localização. Tente perto de uma janela.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 20000 },
    );
  });

/* ---------- Leitor de QR Code ---------- */
async function lerQr() {
  if (!("BarcodeDetector" in window)) {
    janela({ titulo: "Ler QR Code", conteudo: h("div", { class: "pilha" }, h("p", {}, "Abra a câmera do celular e aponte para o QR Code do quiosque. O app abre sozinho e registra o ponto."), h("p", { class: "suave" }, "Dica: no iPhone, use a Câmera ou o Leitor de Código na Central de Controle.")) });
    return null;
  }
  const video = h("video", { playsinline: true, muted: true, class: "qr-video" });
  let parar;
  const resultado = new Promise((resolve) => {
    const j = janela({ titulo: "Aponte para o QR Code", conteudo: h("div", { class: "qr-leitor" }, video, h("div", { class: "qr-mira" })), aoFechar: () => (parar?.(), resolve(null)) });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (stream) => {
        video.srcObject = stream;
        await video.play();
        const det = new BarcodeDetector({ formats: ["qr_code"] });
        let ativo = true;
        parar = () => ((ativo = false), stream.getTracks().forEach((t) => t.stop()));
        const ciclo = async () => {
          if (!ativo) return;
          const cods = await det.detect(video).catch(() => []);
          const txt = cods[0]?.rawValue;
          const token = txt && (new URL(txt, location.origin).searchParams.get("q") ?? null);
          if (token) {
            vibrar(40);
            parar();
            resolve(token);
            j.fechar();
          } else requestAnimationFrame(ciclo);
        };
        ciclo();
      })
      .catch(() => (aviso("Permita o uso da câmera para ler o QR Code.", "erro"), j.fechar()));
  });
  return resultado;
}

/* ---------- Registrar ponto ---------- */
async function baterPonto(botao, { qrToken } = {}) {
  botao.disabled = true;
  botao.classList.add("registrando");
  try {
    const prep = await post("/app/ponto/preparar");
    const corpo = { aparelho: nomeAparelho() };
    const token = qrToken ?? (estado.qr && Date.now() - estado.qr.lido < 50_000 ? estado.qr.token : null);
    if (token) corpo.qr = token;
    else if (prep.exige_qr) {
      const lido = await lerQr();
      if (!lido) return;
      corpo.qr = lido;
    }
    if (prep.exige_gps && !corpo.qr) Object.assign(corpo, await localizar());
    if (prep.biometria) corpo.biometria = await confirmarBiometria(prep.biometria).catch((e) => { throw new Error(e.name === "NotAllowedError" ? "Biometria cancelada. Toque de novo para registrar." : e.message); });
    const r = await post("/app/ponto", corpo);
    estado.qr = null;
    vibrar([60, 40, 60]);
    estado.eu.hoje = r.hoje;
    comprovante(r);
  } catch (e) {
    vibrar(200);
    aviso(e.message, "erro", 7000);
  } finally {
    botao.disabled = false;
    botao.classList.remove("registrando");
  }
}

function comprovante(r) {
  const c = r.comprovante;
  janela({
    titulo: "Ponto registrado",
    conteudo: h(
      "div",
      { class: "comprovante" },
      h("div", { class: "comprovante-ok" }, icone("check", 40)),
      h("strong", { class: "comprovante-hora" }, r.marcacao.hora),
      h("p", {}, r.hoje.marcacoes.at(-1)?.rotulo ?? "Marcação", r.marcacao.biometria ? " · com biometria" : "", r.marcacao.qr ? " · QR Code" : ""),
      h("dl", {}, [["Empregador", `${c.empregador} · CNPJ ${c.cnpj}`], ["Local", c.local], ["Trabalhador", `${c.trabalhador} · CPF ${c.cpf}`], ["Data e hora", c.data_hora], ["NSR", c.nsr], ["Registro REP-P (INPI)", c.registro_rep_p], ["Código de verificação", c.codigo.slice(0, 32) + "…"]].map(([t, v]) => [h("dt", {}, t), h("dd", {}, v)])),
      h("small", { class: "suave" }, "Comprovante de Registro de Ponto do Trabalhador (Portaria MTP 671/2021). Fica salvo em Espelho."),
    ),
    aoFechar: desenhar,
  });
}

/* ---------- Telas ---------- */
async function inicio(area) {
  const eu = (estado.eu = await get("/app/eu"));
  const relogio = h("div", { class: "relogio-grande" });
  const atualizar = () => (relogio.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" }));
  atualizar();
  const t = setInterval(() => (relogio.isConnected ? atualizar() : clearInterval(t)), 1000);
  const botao = h("button", { class: "botao-ponto", onclick: (e) => baterPonto(e.currentTarget) }, icone(eu.ponto.biometrias ? "digital" : "relogio", 54), h("span", {}, `Registrar ${eu.hoje.proxima.toLowerCase()}`));
  const podeBio = await temBiometria();
  limpar(
    area,
    h("div", { class: "topo-app" }, h("div", {}, h("small", { class: "suave" }, eu.empresa.nome), h("h1", {}, `Olá, ${eu.colaborador.primeiro_nome}!`)), eu.nao_lidos ? h("button", { class: "btn-icone selo-btn", "aria-label": "Comunicados", onclick: () => ir("mais") }, icone("sino"), h("span", { class: "selo" }, eu.nao_lidos)) : null),
    h("section", { class: "cartao centro cartao-ponto" }, h("small", { class: "suave" }, new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })), relogio, botao, estado.qr ? h("p", { class: "chip chip-ok" }, icone("qr", 12), " QR Code lido. Toque para registrar.") : null, h("div", { class: "tags centro-tags" }, eu.local?.exige_gps ? h("span", { class: "chip" }, icone("local", 12), " ", eu.local.nome) : null, eu.ponto.biometrias ? h("span", { class: "chip chip-ok" }, icone("digital", 12), " biometria ativa") : null), h("button", { class: "btn btn-fantasma btn-pequeno", onclick: async (e) => { const tok = await lerQr(); if (tok) baterPonto(botao, { qrToken: tok }); void e; } }, icone("qr", 16), "Ler QR Code do quiosque")),
    !eu.ponto.biometrias && podeBio ? h("section", { class: "cartao aviso-cartao" }, icone("digital", 22), h("div", {}, h("strong", {}, "Ative sua digital ou rosto"), h("p", {}, eu.ponto.exige_biometria ? "Sua empresa exige biometria para registrar o ponto." : "Mais segurança: só você consegue registrar o seu ponto."), h("button", { class: "btn btn-primario btn-pequeno", onclick: (e) => acao(e.currentTarget, async () => (await cadastrarBiometria(), desenhar())) }, "Ativar agora"))) : null,
    !podeBio && eu.ponto.exige_biometria ? h("section", { class: "cartao aviso-cartao" }, icone("alerta", 22), h("p", {}, "Este celular não tem leitor de digital/rosto disponível no navegador. Fale com o RH.")) : null,
    h("section", { class: "cartao" }, h("h2", {}, "Hoje"), eu.hoje.marcacoes.length ? h("ol", { class: "linha-tempo" }, eu.hoje.marcacoes.map((m) => h("li", {}, h("strong", {}, m.hora), h("span", {}, m.rotulo), h("span", { class: "tags" }, m.biometria ? icone("digital", 14) : null, m.qr ? icone("qr", 14) : null)))) : h("p", { class: "suave" }, "Nenhuma marcação ainda hoje.")),
    eu.jornada?.banco_horas ? h("section", { class: "cartao linha-entre" }, h("span", {}, "Banco de horas"), h("strong", { class: eu.saldo_banco < 0 ? "perigo" : "" }, hhmm(eu.saldo_banco))) : null,
  );
}

async function espelho(area, comp = mesAtual()) {
  const e = await get(`/app/espelho/${comp}`);
  const t = e.totais;
  const anterior = () => { const [a, m] = comp.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };
  const proximo = () => { const [a, m] = comp.split("-").map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; };
  limpar(
    area,
    h("div", { class: "topo-app" }, h("h1", {}, "Espelho de ponto")),
    h("div", { class: "seletor-mes" }, h("button", { class: "btn-icone", "aria-label": "Mês anterior", onclick: () => espelho(area, anterior()) }, icone("voltar")), h("strong", {}, mesBR(comp)), h("button", { class: "btn-icone girar", "aria-label": "Próximo mês", disabled: comp >= mesAtual(), onclick: () => espelho(area, proximo()) }, icone("voltar"))),
    h("div", { class: "mini-totais" }, [["Trabalhadas", hhmm(t.trabalhado)], ["Extras", hhmm(t.extra50 + t.extra100)], ["Noturno", hhmm(t.noturno_reduzido)], ["Faltas", String(t.faltas)], ["Atrasos", hhmm(t.atraso)]].map(([r, v]) => h("div", {}, h("small", {}, r), h("strong", {}, v)))),
    h(
      "section",
      { class: "cartao lista-dias" },
      e.dias.filter((d) => d.data <= hojeISO() && d.status !== "futuro" && d.status !== "fora_contrato").reverse().map((d) =>
        h("div", { class: `dia-app ${d.status}` }, h("div", { class: "dia-app-data" }, h("strong", {}, d.data.slice(8)), h("small", {}, DIAS[d.dia_semana])), h("div", { class: "horas-dia" }, d.marcacoes.length ? d.marcacoes.map((m) => h("span", { class: `hora-chip ${m.incluida ? "incluida" : ""}` }, m.hora)) : h("small", { class: "suave" }, { folga: "Folga", feriado: "Feriado", ferias: "Férias", afastado: "Afastado", falta: "Falta", abonado: "Abonado" }[d.status] ?? "—")), h("small", { class: "dia-app-total" }, d.trabalhado ? hhmm(d.trabalhado) : "")),
      ),
    ),
    comp < mesAtual() && !e.assinatura ? h("button", { class: "btn btn-primario btn-grande", onclick: (ev) => acao(ev.currentTarget, async () => { await post(`/app/espelho/${comp}/assinar`); aviso("Espelho assinado. Obrigado!"); espelho(area, comp); }) }, "Conferi e concordo · assinar espelho") : e.assinatura ? h("p", { class: "chip chip-ok centro" }, "✅ Você assinou este espelho") : null,
  );
}

async function pedidos(area) {
  const [ajustes, ferias, atestados] = await Promise.all([get("/app/ajustes"), get("/app/ferias"), get("/app/atestados")]);
  const ST = { pendente: "⏳ Em análise", aprovado: "✅ Aprovado", recusado: "❌ Recusado", solicitada: "⏳ Em análise", aprovada: "✅ Aprovada", recusada: "❌ Recusada", cancelada: "Cancelada" };
  const saldo = ferias.periodos.filter((p) => p.completo).reduce((s, p) => s + p.saldo, 0);
  limpar(
    area,
    h("div", { class: "topo-app" }, h("h1", {}, "Pedidos")),
    h("div", { class: "grade-acoes" }, h("button", { class: "acao-app", onclick: () => pedirAjuste(area) }, icone("relogio", 26), "Esqueci de bater"), h("button", { class: "acao-app", onclick: () => enviarAtestado(area) }, icone("saude", 26), "Enviar atestado"), h("button", { class: "acao-app", onclick: () => pedirFerias(area, ferias) }, icone("mala", 26), "Pedir férias")),
    h("section", { class: "cartao" }, h("div", { class: "linha-entre" }, h("h2", {}, "Férias"), h("span", { class: "chip" }, `${saldo} dias disponíveis`)), ferias.ferias.length ? h("ul", { class: "lista-itens" }, ferias.ferias.map((f) => h("li", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, `${dataBR(f.inicio)} · ${f.dias} dias`), h("small", { class: "suave" }, f.liquido ? `Valor ${reais(f.liquido)}, pago até ${dataBR(f.pagar_ate)}` : f.observacao ?? "")), h("small", {}, ST[f.status])))) : h("p", { class: "suave" }, ferias.periodos.length ? `Próximo período completo em ${dataBR(ferias.periodos.at(-1).fim)}.` : "Sem férias ainda.")),
    h("section", { class: "cartao" }, h("h2", {}, "Ajustes de ponto"), ajustes.length ? h("ul", { class: "lista-itens" }, ajustes.map((a) => h("li", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, `${dataBR(a.data)} ${a.horario ?? ""}`), h("small", { class: "suave" }, a.resposta ? `RH: ${a.resposta}` : a.motivo)), h("small", {}, ST[a.status])))) : h("p", { class: "suave" }, "Nenhum pedido.")),
    h("section", { class: "cartao" }, h("h2", {}, "Atestados"), atestados.length ? h("ul", { class: "lista-itens" }, atestados.map((a) => h("li", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, `${dataBR(a.inicio)} a ${dataBR(a.fim)}`), h("small", { class: "suave" }, a.observacao ?? "")), h("small", {}, ST[a.status])))) : h("p", { class: "suave" }, "Nenhum atestado enviado.")),
  );
}

const campo = (rot, el) => h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, rot), el);
const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

function pedirAjuste(area) {
  const tipo = h("select", { class: "entrada" }, h("option", { value: "inclusao" }, "Esqueci de registrar um horário"), h("option", { value: "abono" }, "Justificar ausência ou atraso"));
  const data = h("input", { class: "entrada", type: "date", value: hojeISO(), max: hojeISO() });
  const horario = h("input", { class: "entrada", type: "time" });
  const motivo = h("textarea", { class: "entrada", rows: 3, placeholder: "Ex.: o celular descarregou na saída" });
  janela({ titulo: "Pedido de ajuste", conteudo: h("div", { class: "pilha" }, campo("O que aconteceu?", tipo), campo("Dia", data), campo("Horário (se esqueceu de bater)", horario), campo("Explique ao RH", motivo)), acoes: [{ texto: "Enviar ao RH", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post("/app/ajustes", { tipo: tipo.value, data: data.value, horario: horario.value || undefined, motivo: motivo.value }), aviso("Pedido enviado. Você será avisado da resposta aqui."), fechar(), pedidos(area))) }] });
}

async function subirArquivo(arquivo) {
  const r = await fetch("/api/app/arquivos", { method: "POST", headers: { "x-nexor": "1", "Content-Type": arquivo.type, "x-nome": encodeURIComponent(arquivo.name) }, body: arquivo });
  const d = await r.json();
  if (!r.ok) throw new Error(d.erro);
  return d.id;
}

function enviarAtestado(area) {
  const foto = h("input", { class: "entrada", type: "file", accept: "image/*,application/pdf", capture: "environment" });
  const ini = h("input", { class: "entrada", type: "date", value: hojeISO() });
  const fim = h("input", { class: "entrada", type: "date", value: hojeISO() });
  const obs = h("input", { class: "entrada", placeholder: "Opcional" });
  janela({ titulo: "Enviar atestado", conteudo: h("div", { class: "pilha" }, campo("Foto do atestado", foto), campo("Primeiro dia", ini), campo("Último dia", fim), campo("Observação", obs), h("small", { class: "suave" }, "O CID é opcional e só o RH vê.")), acoes: [{ texto: "Enviar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { if (!foto.files[0]) throw new Error("Tire a foto do atestado."); const anexo = await subirArquivo(foto.files[0]); await post("/app/atestados", { inicio: ini.value, fim: fim.value, observacao: obs.value || undefined, anexo }); aviso("Atestado enviado ao RH."); fechar(); pedidos(area); }) }] });
}

function pedirFerias(area, ferias) {
  const saldo = ferias.periodos.filter((p) => p.completo).reduce((s, p) => s + p.saldo, 0);
  if (!saldo) return aviso("Você ainda não tem saldo de férias.", "erro");
  const ini = h("input", { class: "entrada", type: "date" });
  const dias = h("select", { class: "entrada" }, [30, 20, 15, 14, 10, 5].filter((d) => d <= saldo).map((d) => h("option", { value: d }, `${d} dias`)));
  const abono = h("select", { class: "entrada" }, [0, 5, 10].map((d) => h("option", { value: d }, d ? `Vender ${d} dias` : "Não vender")));
  const d13 = h("input", { type: "checkbox" });
  janela({ titulo: "Pedir férias", conteudo: h("div", { class: "pilha" }, h("p", { class: "suave" }, `Saldo: ${saldo} dias. Peça com 30 dias de antecedência.`), campo("Começar em", ini), campo("Quantos dias", dias), campo("Abono pecuniário", abono), h("label", { class: "linha-check" }, d13, h("span", {}, "Adiantar a 1ª parcela do 13º"))), acoes: [{ texto: "Enviar pedido", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post("/app/ferias", { inicio: ini.value, dias: Number(dias.value), abono_dias: Number(abono.value), adiantar_13: d13.checked }), aviso("Pedido de férias enviado."), fechar(), pedidos(area))) }] });
}

const TIPOS_FOLHA = { mensal: "Mensal", "13_1": "13º 1ª parcela", "13_2": "13º 2ª parcela" };
async function holerites(area) {
  const lista = await get("/app/holerites");
  limpar(
    area,
    h("div", { class: "topo-app" }, h("h1", {}, "Holerites")),
    lista.length ? h("section", { class: "cartao" }, h("ul", { class: "lista-itens" }, lista.map((x) => h("li", { class: "item-linha clicavel", onclick: () => abrirHolerite(x.id) }, icone("dinheiro", 22), h("div", { class: "item-texto" }, h("strong", {}, `${mesBR(x.competencia)} · ${TIPOS_FOLHA[x.tipo]}`), h("small", { class: "suave" }, x.data_pagamento ? `Pago em ${dataBR(x.data_pagamento)}` : "")), h("strong", {}, reais(x.liquido)), x.visualizado_em ? null : h("span", { class: "selo" }, "novo"))))) : h("div", { class: "vazio" }, h("h3", {}, "Nenhum holerite ainda"), h("p", {}, "Eles aparecem aqui quando o RH fecha a folha.")),
  );
}

async function abrirHolerite(id) {
  const x = await get(`/app/holerites/${id}`);
  janela({
    titulo: `${mesBR(x.competencia)} · ${TIPOS_FOLHA[x.tipo]}`,
    conteudo: h(
      "div",
      { class: "holerite-app" },
      h("p", { class: "suave pequeno" }, `${x.empresa.razao_social} · ${x.colaborador.nome} · mat. ${x.colaborador.matricula}`),
      h("ul", { class: "lista-itens" }, x.rubricas.map((r) => h("li", { class: "item-linha" }, h("div", { class: "item-texto" }, h("span", {}, r.nome), h("small", { class: "suave" }, r.ref)), h("strong", { class: r.tipo === "desconto" ? "perigo" : "" }, `${r.tipo === "desconto" ? "−" : ""}${reais(r.valor)}`)))),
      h("div", { class: "linha-entre total-holerite" }, h("span", {}, "Líquido a receber"), h("strong", {}, reais(x.liquido))),
      h("small", { class: "suave" }, `FGTS depositado no mês: ${reais(x.fgts)}`),
    ),
    acoes: [{ texto: "Salvar / imprimir", classe: "btn-primario", fn: () => window.print() }],
  });
}

async function mais(area) {
  const [coms, docs] = await Promise.all([get("/app/comunicados"), get("/app/documentos")]);
  const eu = estado.eu ?? (await get("/app/eu"));
  limpar(
    area,
    h("div", { class: "topo-app" }, h("h1", {}, "Mais")),
    h("section", { class: "cartao" }, h("h2", {}, "Comunicados"), coms.length ? h("ul", { class: "lista-itens" }, coms.map((c) => h("li", { class: "item-linha clicavel", onclick: async () => { janela({ titulo: c.titulo, conteudo: h("p", { class: "texto-longo" }, c.texto) }); if (!c.lido_em) await post(`/app/comunicados/${c.id}/lido`); } }, h("span", {}, c.fixado ? "📌" : c.lido_em ? "📄" : "🔵"), h("div", { class: "item-texto" }, h("strong", {}, c.titulo), h("small", { class: "suave" }, new Date(c.criado_em).toLocaleDateString("pt-BR")))))) : h("p", { class: "suave" }, "Nenhum comunicado.")),
    docs.length ? h("section", { class: "cartao" }, h("h2", {}, "Meus documentos"), h("ul", { class: "lista-itens" }, docs.map((d) => h("li", { class: "item-linha" }, icone("nota", 20), h("a", { href: `/api/app/arquivos/${d.arquivo}`, target: "_blank" }, d.nome))))) : null,
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "Minha conta"),
      h("p", {}, `${eu.colaborador.nome}`, h("br"), h("small", { class: "suave" }, `${eu.colaborador.cargo ?? ""} · matrícula ${eu.colaborador.matricula} · desde ${dataBR(eu.colaborador.admissao)}`)),
      h("div", { class: "pilha" }, h("button", { class: "btn btn-fantasma", onclick: (e) => acao(e.currentTarget, async () => (await cadastrarBiometria(), desenhar())) }, icone("digital", 16), eu.ponto.biometrias ? "Cadastrar outra biometria" : "Ativar digital ou rosto"), h("button", { class: "btn btn-fantasma", onclick: () => definirPin() }, icone("escudo", 16), eu.colaborador.tem_pin ? "Trocar PIN do quiosque" : "Criar PIN do quiosque"), h("button", { class: "btn btn-perigo-fantasma", onclick: async () => { await post("/app/sair"); location.reload(); } }, icone("sair", 16), "Sair deste celular")),
    ),
    h("p", { class: "suave pequeno centro" }, "Nexor RH · nexorconsultingit.com.br"),
  );
}

function definirPin() {
  const pin = h("input", { class: "entrada entrada-grande codigo", type: "password", inputmode: "numeric", maxlength: 6, placeholder: "4 a 6 números" });
  janela({ titulo: "PIN do quiosque", conteudo: h("div", { class: "pilha" }, h("p", {}, "Use o PIN para bater o ponto no tablet da empresa quando estiver sem o celular."), pin), acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await put("/app/pin", { pin: pin.value }), aviso("PIN salvo."), fechar())) }] });
}

/* ---------- Navegação ---------- */
const ABAS = [["inicio", "Ponto", "relogio", inicio], ["espelho", "Espelho", "agenda", espelho], ["pedidos", "Pedidos", "nota", pedidos], ["holerites", "Holerites", "dinheiro", holerites], ["mais", "Mais", "menu", mais]];
function ir(aba) {
  estado.aba = aba;
  desenhar();
}
async function desenhar() {
  const area = h("main", { class: "app-area" }, h("div", { class: "carregando-bloco" }, h("span", { class: "girando" })));
  limpar(raiz, area, h("nav", { class: "abas-app" }, ABAS.map(([id, nome, ic]) => h("button", { class: id === estado.aba ? "ativo" : "", onclick: () => ir(id) }, icone(ic, 22), h("span", {}, nome)))));
  try {
    await ABAS.find((a) => a[0] === estado.aba)[3](area);
  } catch (e) {
    limpar(area, h("div", { class: "vazio" }, h("h3", {}, "Sem conexão"), h("p", {}, e.message), h("button", { class: "btn", onclick: desenhar }, "Tentar de novo")));
  }
}

async function iniciar() {
  definirAoDeslogar(() => estado.eu && ((estado.eu = null), telaAtivacao()));
  try {
    estado.eu = await api("/app/eu");
  } catch (e) {
    if (e.status === 401) return telaAtivacao();
    return limpar(raiz, h("div", { class: "vazio" }, h("h3", {}, "Sem conexão com o servidor"), h("p", {}, e.message), h("button", { class: "btn", onclick: iniciar }, "Tentar de novo")));
  }
  await desenhar();
  // Veio do QR Code: sem biometria registra direto; com biometria o navegador exige um toque na tela
  if (estado.qr && !estado.eu.ponto.biometrias) document.querySelector(".botao-ponto")?.click();
}

document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && estado.aba === "inicio" && estado.eu && desenhar());
iniciar();
