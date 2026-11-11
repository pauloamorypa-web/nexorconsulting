/* Ordens de serviço: lista, abertura (da proposta paga ou avulsa), status, checklist, fotos pela câmera
   (reduzidas no aparelho para caber no limite da API), números de série com garantia, assinatura do cliente
   com o dedo e o link público de acompanhamento. */
import { aviso, botao, botaoConfirma, campo, chipOs, copiar, dataHora, diaBR, entrada, h, hojeBR, ic, limpar, linkWhatsApp, PASSOS_OS, seletor, STATUS_OS, vazio } from "./nucleo.js";
import { S, dono, get, ir, nomeEmpresa, post, put } from "./estado.js";

const LIMITE_FOTO = 560 * 1024; // a API aceita até 600 KB por foto
const LIMITE_ASSINATURA = 190 * 1024; // e até 200 KB na assinatura
const PROXIMO = { agendada: ["a_caminho", "Estou a caminho"], a_caminho: ["em_execucao", "Iniciar execução"], em_execucao: ["concluida", "Concluir OS"] };

export function linhaOs(o) {
  return h(
    "a",
    { class: "item cartao-link", href: `#/os/${o.id}` },
    h("div", { class: "miniatura" }, ic("os")),
    h("div", { class: "meio" }, h("strong", { class: "quebra" }, `OS #${o.numero} · ${o.titulo}`), h("div", { class: "pequeno suave quebra" }, [o.agendada_para ? dataHora(o.agendada_para) : "Sem data", o.cliente?.nome, o.tecnico?.nome].filter(Boolean).join(" · "))),
    chipOs(o.status),
  );
}

export async function telaOsLista(el, _p, q) {
  const status = q.get("status") ?? "";
  const lista = await get(`/os${status ? `?status=${status}` : ""}`);
  const filtros = [["", "Todas"], ...Object.entries(STATUS_OS).map(([k, [r]]) => [k, r])];
  limpar(
    el,
    h(
      "div",
      { class: "secao" },
      h("div", { class: "linha" }, h("div", { class: "filtros meio", role: "group", "aria-label": "Filtrar por status" }, filtros.map(([k, r]) => h("button", { type: "button", class: "filtro", "aria-pressed": String(k === status), onclick: () => ir(`os${k ? `?status=${k}` : ""}`) }, r))), dono() ? h("a", { class: "btn btn-cor btn-peq", href: "#/os/nova" }, ic("mais", 16), "Nova OS") : null),
      h("div", { class: "cartao" }, lista.length ? lista.map(linhaOs) : vazio("os", "Nenhuma OS aqui", dono() ? "Abra uma OS a partir de uma proposta paga." : "Quando o dono atribuir uma OS a você, ela aparece aqui.")),
    ),
  );
}

export async function telaOsNova(el, q) {
  const [pagas, clientes, equipe, oss] = await Promise.all([get("/propostas?status=paga"), get("/clientes"), get("/equipe"), get("/os")]);
  const comOs = new Set(oss.map((o) => o.proposta_id).filter(Boolean));
  const prop = seletor([["", "Serviço avulso (sem proposta)"], ...pagas.map((p) => [p.id, `#${p.numero} · ${p.titulo} · ${p.cliente ?? ""}${comOs.has(p.id) ? " (já tem OS)" : ""}`])], q.get("proposta") ?? "");
  const cli = seletor([["", "Escolha o cliente"], ...clientes.map((c) => [c.id, c.nome])], "");
  const campoCli = campo("Cliente", cli);
  const tec = seletor([["", "Sem técnico (eu mesmo)"], ...equipe.filter((u) => u.ativo && u.papel === "tecnico").map((u) => [u.id, u.nome])], equipe.find((u) => u.papel === "tecnico" && u.ativo)?.id ?? "");
  const titulo = entrada({ maxlength: 160, placeholder: "Ex.: Manutenção do portão" });
  const campoTitulo = campo("Título", titulo);
  const dia = entrada({ type: "date", value: hojeBR() });
  const horaEl = entrada({ type: "time", value: "08:00" });
  const vis = () => (campoCli.hidden = campoTitulo.hidden = Boolean(prop.value));
  prop.addEventListener("change", vis);
  vis();
  const criar = botao("Abrir OS", async () => {
    const corpo = { agendada_dia: dia.value || undefined, agendada_hora: horaEl.value || undefined, tecnico_id: tec.value || null };
    if (prop.value) corpo.proposta_id = prop.value;
    else {
      if (!cli.value) throw new Error("Escolha o cliente da OS.");
      corpo.cliente_id = cli.value;
      if (titulo.value.trim()) corpo.titulo = titulo.value.trim();
    }
    for (const k of Object.keys(corpo)) if (corpo[k] === undefined) delete corpo[k];
    const o = await post("/os", corpo);
    aviso(`OS #${o.numero} aberta${o.tecnico ? ` para ${o.tecnico.nome}` : ""}.`);
    ir(`os/${o.id}`);
  }, "btn-cor btn-bloco", "check");
  limpar(el, h("div", { class: "secao" }, h("div", { class: "cartao pilha" }, campo("A partir da proposta paga", prop, "Da proposta, o checklist e os números de série já vêm preenchidos."), campoCli, campoTitulo, campo("Técnico", tec), h("div", { class: "grade2" }, campo("Dia", dia), campo("Hora", horaEl)), criar)));
}

/* ---------- Imagens ---------- */
function carregarImagem(arquivo) {
  return new Promise((ok, falhou) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => (URL.revokeObjectURL(url), ok(img));
    img.onerror = () => (URL.revokeObjectURL(url), falhou(new Error("Não foi possível ler esta imagem. Tente tirar a foto de novo.")));
    img.src = url;
  });
}
const tamanhoBase64 = (dataUrl) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
/** Reduz a foto no aparelho (lado maior até 1600 px, JPEG) até ficar abaixo do limite da API */
export async function reduzirFoto(arquivo) {
  const img = await carregarImagem(arquivo);
  let lado = 1600;
  let qualidade = 0.82;
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * escala));
    c.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const dados = c.toDataURL("image/jpeg", qualidade);
    if (tamanhoBase64(dados) <= LIMITE_FOTO) return dados;
    if (qualidade > 0.6) qualidade -= 0.1;
    else lado = Math.round(lado * 0.8);
  }
  throw new Error("A foto ficou grande demais mesmo reduzida. Tente outra.");
}

/** Quadro de assinatura com o dedo (ou mouse), em alta resolução e sem rolar a página enquanto assina */
function quadroAssinatura() {
  const canvas = h("canvas", { class: "assinatura", role: "img", "aria-label": "Área para o cliente assinar com o dedo" });
  let g;
  // Banca U-05: um toque só não é assinatura. Mede o comprimento do traço (px) e os pontos desenhados.
  const TRACO_MINIMO_PX = 80;
  const PONTOS_MINIMOS = 8;
  let comprimento = 0;
  let pontos = 0;
  let ultimo = null;
  let desenhando = false;
  const preparar = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.lineWidth = 2.4;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#0d1526";
    g.fillStyle = "#fff";
    g.fillRect(0, 0, r.width, r.height);
    comprimento = 0;
    pontos = 0;
    ultimo = null;
  };
  const ponto = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (!g) preparar();
    desenhando = true;
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = ponto(e);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 0.1, y + 0.1);
    g.stroke();
    ultimo = [x, y];
    pontos += 1;
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!desenhando) return;
    const [x, y] = ponto(e);
    g.lineTo(x, y);
    g.stroke();
    if (ultimo) comprimento += Math.hypot(x - ultimo[0], y - ultimo[1]);
    ultimo = [x, y];
    pontos += 1;
    e.preventDefault();
  });
  const parar = () => (desenhando = false);
  canvas.addEventListener("pointerup", parar);
  canvas.addEventListener("pointercancel", parar);
  requestAnimationFrame(preparar);
  return {
    canvas,
    limpar: preparar,
    vazio: () => pontos === 0,
    curta: () => comprimento < TRACO_MINIMO_PX || pontos < PONTOS_MINIMOS,
    imagem: () => {
      let d = canvas.toDataURL("image/png");
      if (tamanhoBase64(d) > LIMITE_ASSINATURA) d = canvas.toDataURL("image/jpeg", 0.7);
      return d;
    },
  };
}

/* ---------- Detalhe da OS ---------- */
export async function telaOs(el, id) {
  const o = await get(`/os/${id}`);
  document.getElementById("titulo-tela").textContent = `OS #${o.numero}`;
  const recarregar = () => ir(`os/${o.id}`);
  const encerrada = ["concluida", "cancelada"].includes(o.status);

  /* Status */
  const prox = PROXIMO[o.status];
  const nota = entrada({ placeholder: "Nota para o histórico (opcional)", maxlength: 500, "aria-label": "Nota para o histórico" });
  const mudar = (status, rotulo, confirmar) => {
    const fn = async () => {
      await post(`/os/${o.id}/status`, { status, ...(nota.value.trim() ? { nota: nota.value.trim() } : {}) });
      aviso(`OS: ${STATUS_OS[status][0].toLowerCase()}.`);
      recarregar();
    };
    return confirmar ? botaoConfirma(rotulo, "Toque de novo para confirmar", fn, status === "cancelada" ? "btn-perigo" : "btn-ok", status === "cancelada" ? "x" : "check") : botao(rotulo, fn, "btn-cor", "seta");
  };
  const passoAtual = PASSOS_OS.indexOf(o.status);
  const tempo = h("ol", { class: "tempo" }, PASSOS_OS.map((s, i) => {
    const ev = o.historico.find((x) => x.status === s);
    return h("li", { class: o.status === "cancelada" ? (ev ? "feito" : "") : i < passoAtual || (i === passoAtual && s === "concluida") ? "feito" : i === passoAtual ? "atual" : "" }, h("span", { class: "ponto" }, ev ? ic("check", 14) : null), h("div", {}, h("strong", {}, STATUS_OS[s][0]), h("span", { class: "pequeno suave" }, ev ? `${dataHora(ev.em)}${ev.autor ? ` · ${ev.autor}` : ""}${ev.nota ? ` · ${ev.nota}` : ""}` : "—")));
  }));

  /* Checklist */
  const lista = o.checklist.map((c) => ({ ...c }));
  const textoCheck = h("span", {});
  const tentarCheck = h("button", { type: "button", class: "btn btn-fantasma btn-peq", hidden: true, onclick: () => salvarCheck() }, "Tentar de novo");
  const estadoCheck = h("small", { class: "fraco", "aria-live": "polite" }, textoCheck, " ", tentarCheck);
  const caixaCheck = h("div", {});
  /* Banca U-04: uma gravação por vez, sempre com a lista inteira mais recente. "salvo" só aparece depois que o servidor
     confirmou exatamente o que está na tela; se algo mudou enquanto a gravação ia, manda de novo. Sem rede, a tela mostra
     "Não salvo" (fica até dar certo) e a próxima marcação ou o botão tentam de novo. */
  let versaoCheck = 0;
  let confirmadaCheck = 0;
  let gravandoCheck = false;
  const contagem = () => `${lista.filter((c) => c.feito).length} de ${lista.length} feitos`;
  const salvarCheck = async (mudou = true) => {
    if (mudou) versaoCheck++;
    tentarCheck.hidden = true;
    estadoCheck.classList.remove("perigo");
    textoCheck.textContent = `${contagem()} · salvando…`;
    if (gravandoCheck) return;
    gravandoCheck = true;
    try {
      while (confirmadaCheck < versaoCheck) {
        const versao = versaoCheck;
        await put(`/os/${o.id}/checklist`, { checklist: lista.map((c) => ({ item: c.item, feito: c.feito })) });
        confirmadaCheck = versao;
      }
      textoCheck.textContent = `${contagem()} · salvo`;
    } catch (e) {
      textoCheck.textContent = `${contagem()} · Não salvo`;
      estadoCheck.classList.add("perigo");
      tentarCheck.hidden = false;
      aviso(`Checklist não foi salvo: ${e.message}`, true);
    } finally {
      gravandoCheck = false;
    }
  };
  const desenharCheck = () => limpar(caixaCheck, lista.map((c) => h("label", { class: "marcar" }, h("input", { type: "checkbox", checked: c.feito, disabled: encerrada, onchange: (e) => ((c.feito = e.target.checked), salvarCheck()) }), h("span", { class: c.feito ? "suave" : "" }, c.item))));
  desenharCheck();
  textoCheck.textContent = contagem();
  const novoItem = entrada({ placeholder: "Novo item do checklist", maxlength: 200, "aria-label": "Novo item do checklist" });
  const addItem = h("button", { type: "button", class: "btn btn-fantasma btn-peq", onclick: () => {
    if (!novoItem.value.trim()) return;
    lista.push({ item: novoItem.value.trim(), feito: false });
    novoItem.value = "";
    desenharCheck();
    salvarCheck();
  } }, ic("mais", 16), "Incluir");

  /* Fotos */
  const legenda = entrada({ placeholder: "Legenda da próxima foto (opcional)", maxlength: 200, "aria-label": "Legenda da foto" });
  const arquivo = h("input", { type: "file", accept: "image/*", capture: "environment", class: "so-leitor", id: `foto-${o.id}`, "aria-label": "Tirar ou escolher foto" });
  const btFoto = h("label", { class: "btn btn-cor", for: `foto-${o.id}`, role: "button", tabindex: "0" }, ic("camera", 18), "Tirar foto");
  btFoto.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), arquivo.click()));
  const estadoFoto = h("small", { class: "fraco", "aria-live": "polite" });
  arquivo.addEventListener("change", async () => {
    const f = arquivo.files?.[0];
    if (!f) return;
    btFoto.classList.add("carregando");
    arquivo.disabled = true;
    try {
      estadoFoto.textContent = "Reduzindo a foto…";
      const dados = await reduzirFoto(f);
      estadoFoto.textContent = `Enviando (${Math.round(tamanhoBase64(dados) / 1024)} KB)…`;
      await post(`/os/${o.id}/fotos`, { imagem: dados, ...(legenda.value.trim() ? { legenda: legenda.value.trim() } : {}) });
      aviso("Foto enviada.");
      recarregar();
    } catch (e) {
      estadoFoto.textContent = "";
      aviso(e.message, true);
    } finally {
      btFoto.classList.remove("carregando");
      arquivo.disabled = false;
      arquivo.value = "";
    }
  });
  const fotos = o.fotos.length ? h("div", { class: "fotos" }, o.fotos.map((f) => h("figure", {}, h("img", { src: `/api/instalador/os/${o.id}/fotos/${f.id}`, alt: f.legenda || `Foto da OS ${o.numero}`, loading: "lazy" }), f.legenda ? h("figcaption", {}, f.legenda) : null))) : h("p", { class: "suave pequeno" }, "Nenhuma foto ainda. Registre antes e depois do serviço.");

  /* Números de série */
  const series = o.series.map((s) => ({ ...s }));
  const caixaSeries = h("div", { class: "pilha" });
  const desenharSeries = () => limpar(caixaSeries, series.length ? series.map((s, n) => {
    const serie = entrada({ value: s.serie ?? "", placeholder: "Nº de série", maxlength: 80, "aria-label": `Número de série de ${s.produto} (${n + 1})`, autocapitalize: "characters" });
    serie.addEventListener("input", () => (s.serie = serie.value.trim() || null));
    const meses = entrada({ type: "number", min: "0", max: "120", value: String(s.garantia_meses ?? 12), inputmode: "numeric", "aria-label": `Meses de garantia de ${s.produto}`, style: { width: "80px" } });
    meses.addEventListener("input", () => (s.garantia_meses = Math.max(0, Math.min(120, Number(meses.value) || 0))));
    return h("div", { class: "linha-item" }, h("div", { class: "linha" }, h("strong", { class: "quebra meio pequeno" }, s.produto), s.codigo ? h("span", { class: "pequeno fraco" }, s.codigo) : null), h("div", { style: { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "8px", alignItems: "end" } }, serie, h("div", { class: "campo" }, h("label", { class: "pequeno" }, "Garantia (meses)"), meses)), s.garantia_ate ? h("small", { class: "ok" }, `Garantia até ${diaBR(s.garantia_ate)}`) : null);
  }) : h("p", { class: "suave pequeno" }, "Sem equipamentos com série nesta OS."));
  desenharSeries();
  const novoProduto = entrada({ placeholder: "Equipamento (ex.: Central de alarme)", maxlength: 200, "aria-label": "Equipamento" });
  const addSerie = h("button", { type: "button", class: "btn btn-fantasma btn-peq", onclick: () => {
    if (!novoProduto.value.trim()) return;
    series.push({ produto: novoProduto.value.trim(), serie: null, garantia_meses: 12 });
    novoProduto.value = "";
    desenharSeries();
  } }, ic("mais", 16), "Incluir equipamento");
  const salvarSeries = botao("Salvar séries e garantia", async () => {
    await put(`/os/${o.id}/series`, { series: series.map(({ garantia_ate, ...s }) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null && v !== undefined && v !== ""))) });
    aviso("Números de série salvos. A garantia conta a partir de hoje.");
    recarregar();
  }, "btn-cor", "check");

  /* Assinatura */
  let blocoAssinatura;
  if (o.assinado) {
    blocoAssinatura = h("div", { class: "pilha" }, h("img", { class: "assinatura-img", src: `/api/instalador/os/${o.id}/assinatura?v=${o.assinado_em ?? ""}`, alt: `Assinatura de ${o.assinado_por ?? "cliente"}` }), h("small", { class: "ok" }, `Assinado por ${o.assinado_por} em ${dataHora(o.assinado_em)}`));
  } else {
    const q = quadroAssinatura();
    const nome = entrada({ value: o.cliente?.nome ?? "", maxlength: 160, autocomplete: "off" });
    const salvarAss = botao("Salvar assinatura", async () => {
      if (q.vazio()) throw new Error("Peça para o cliente assinar no quadro.");
      if (q.curta()) throw new Error("A assinatura ficou curta demais (parece um toque só). Toque em Limpar e peça para o cliente assinar por inteiro.");
      if (nome.value.trim().length < 2) throw new Error("Informe o nome de quem assinou.");
      await post(`/os/${o.id}/assinatura`, { imagem: q.imagem(), nome: nome.value.trim() });
      aviso("Assinatura registrada.");
      recarregar();
    }, "btn-cor", "caneta");
    blocoAssinatura = h("div", { class: "pilha" }, h("p", { class: "pequeno suave" }, "Entregue o celular ao cliente para assinar com o dedo."), q.canvas, h("div", { class: "linha" }, h("button", { type: "button", class: "btn btn-fantasma btn-peq", onclick: q.limpar }, ic("x", 16), "Limpar"), h("span", {})), campo("Nome de quem assina", nome), salvarAss);
  }

  /* Link público */
  const textoZap = `Olá${o.cliente ? `, ${o.cliente.nome.split(" ")[0]}` : ""}! Acompanhe sua ordem de serviço com a ${nomeEmpresa()}: ${o.link}`;
  const link = o.link
    ? h("div", { class: "cartao" }, h("strong", {}, "Acompanhamento do cliente"), h("code", { class: "quebra pequeno suave" }, o.link), h("div", { class: "btns" }, h("a", { class: "btn btn-whats btn-peq", href: linkWhatsApp(o.cliente?.telefone, textoZap), target: "_blank", rel: "noopener noreferrer" }, ic("whatsapp", 16), "WhatsApp"), h("button", { type: "button", class: "btn btn-fantasma btn-peq", onclick: () => copiar(o.link) }, ic("copiar", 16), "Copiar link")))
    : null;

  limpar(
    el,
    h(
      "div",
      { class: "grade-larga" },
      h(
        "div",
        {},
        h("div", { class: "secao" }, h("div", { class: "cartao" },
          h("div", { class: "linha" }, h("h2", { class: "quebra meio" }, o.titulo), chipOs(o.status)),
          h("span", { class: "suave pequeno quebra" }, [o.cliente?.nome, o.cliente?.endereco?.logradouro ? `${o.cliente.endereco.logradouro}, ${o.cliente.endereco.numero ?? ""} · ${o.cliente.endereco.bairro ?? ""}` : null].filter(Boolean).join(" · ")),
          h("span", { class: "pequeno" }, ic("relogio", 14), ` ${o.agendada_para ? dataHora(o.agendada_para) : "Sem data marcada"} · técnico: ${o.tecnico?.nome ?? "—"}`),
          o.cliente?.telefone ? h("a", { class: "pequeno", href: `tel:${o.cliente.telefone}` }, ic("telefone", 14), " Ligar para o cliente") : null,
          !encerrada ? h("div", { class: "pilha" }, nota, h("div", { class: "btns" }, prox ? mudar(prox[0], prox[1], prox[0] === "concluida") : null, S.eu.usuario.papel === "dono" ? mudar("cancelada", "Cancelar OS", true) : null)) : null,
        )),
        h("section", { class: "secao" }, h("div", { class: "linha" }, h("h2", { class: "rotulo-secao" }, "Checklist"), estadoCheck), h("div", { class: "cartao" }, caixaCheck, !encerrada ? h("div", { class: "linha" }, h("div", { class: "meio" }, novoItem), addItem) : null)),
        h("section", { class: "secao" }, h("h2", {}, "Fotos"), h("div", { class: "cartao" }, fotos, !encerrada ? h("div", { class: "pilha" }, legenda, arquivo, btFoto, estadoFoto) : null)),
        h("section", { class: "secao" }, h("h2", {}, "Números de série e garantia"), h("div", { class: "cartao" }, caixaSeries, h("div", { class: "linha" }, h("div", { class: "meio" }, novoProduto), addSerie), salvarSeries)),
      ),
      h(
        "div",
        {},
        h("section", { class: "secao" }, h("h2", {}, "Assinatura do cliente"), h("div", { class: "cartao" }, blocoAssinatura)),
        h("section", { class: "secao" }, h("h2", {}, "Linha do tempo"), h("div", { class: "cartao" }, tempo)),
        link ? h("section", { class: "secao" }, link) : null,
      ),
    ),
  );
}

