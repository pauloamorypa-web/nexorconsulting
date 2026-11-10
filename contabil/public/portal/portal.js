/* Portal do cliente do escritório: o que falta enviar, envio de documentos, guias, histórico e chamados. */

import { definirAoDeslogar, get, post, put } from "/js/api.js";
import { acao, aviso, dataHora, h, limpar, reais } from "/js/ui.js";
import { dataBR, mesBR } from "/js/comum.js";
import { areaEnvio, enviarArquivo, prazo, sit } from "/js/base.js";

const app = document.getElementById("app");
const estado = { eu: null };
const ROTAS = { inicio: "Início", enviar: "Enviar documentos", guias: "Guias e relatórios", historico: "Enviados", chamados: "Fale com o escritório", conta: "Minha conta" };

function cor(c) {
  if (/^#[0-9a-f]{6}$/i.test(c ?? "")) document.documentElement.style.setProperty("--azul", c);
}

async function telaEntrar(st) {
  cor(st.escritorio?.cor);
  const convite = location.hash.match(/^#\/convite\/([\w-]{20,})$/)?.[1];
  const email = h("input", { class: "entrada", type: "email", autocomplete: "username" });
  const senha = h("input", { class: "entrada", type: "password", autocomplete: convite ? "new-password" : "current-password" });
  const nome = st.escritorio?.nome ?? "Escritório";
  let topo = h("p", { class: "suave" }, "Entre com o e-mail e a senha cadastrados.");
  if (convite) {
    try {
      const c = await get(`/portal/convite/${convite}`);
      topo = h("p", {}, `Olá, ${c.nome.split(" ")[0]}! Crie sua senha para acessar o portal da ${c.empresa}.`);
      email.value = c.email;
      email.disabled = true;
    } catch (e) {
      topo = h("p", { class: "prazo-atrasado" }, e.message);
    }
  }
  const b = h("button", { class: "btn btn-primario btn-grande", type: "submit" }, convite ? "Criar senha e entrar" : "Entrar");
  limpar(
    app,
    h(
      "div",
      { class: "p-login" },
      h(
        "form",
        { class: "cartao", onsubmit: (e) => (e.preventDefault(), acao(b, async () => (convite ? await post(`/portal/convite/${convite}`, { senha: senha.value }) : await post("/portal/entrar", { email: email.value, senha: senha.value }), (location.hash = "#/inicio"), location.reload()))) },
        h("div", { class: "p-marca" }, nome.slice(0, 1).toUpperCase()),
        h("h1", { style: { margin: 0, fontSize: "22px" } }, `Portal · ${nome}`),
        topo,
        h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "E-mail"), email),
        h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, convite ? "Nova senha (mínimo 8 caracteres)" : "Senha"), senha),
        b,
        h("p", { class: "suave pequeno" }, convite ? "" : "Esqueceu a senha? Peça um novo convite ao escritório."),
      ),
    ),
  );
}

function casca() {
  const { escritorio, empresa, usuario } = estado.eu;
  return h(
    "div",
    {},
    h("header", { class: "p-topo" }, h("div", { class: "p-marca" }, escritorio.nome.slice(0, 1).toUpperCase()), h("div", {}, h("strong", {}, escritorio.nome), h("small", {}, `${empresa.nome} · ${usuario.nome}`)), h("button", { class: "btn btn-fantasma btn-pequeno p-sair", onclick: async () => (await post("/portal/sair"), location.reload()) }, "Sair")),
    h("nav", { class: "p-nav", "aria-label": "Portal" }, Object.entries(ROTAS).map(([id, t]) => h("a", { href: `#/${id}`, dataset: { rota: id } }, t))),
    h("main", { id: "conteudo", class: "p-conteudo" }),
  );
}

async function rota() {
  const nome = location.hash.replace(/^#\/?/, "").split("/")[0];
  const r = ROTAS[nome] ? nome : "inicio";
  document.querySelectorAll(".p-nav a").forEach((a) => a.classList.toggle("ativo", a.dataset.rota === r));
  const area = document.getElementById("conteudo");
  limpar(area, h("div", { class: "carregando-bloco" }, h("span", { class: "girando" })));
  try {
    limpar(area, ...[await { inicio, enviar, guias, historico, chamados, conta }[r]()].flat());
  } catch (e) {
    limpar(area, h("section", { class: "cartao" }, h("p", {}, e.message)));
  }
}

async function inicio() {
  const pend = (await get("/portal/pendencias")).filter((p) => p.status === "pendente");
  const guias = (await get("/portal/entregas")).filter((g) => g.tipo === "guia" && g.status !== "paga");
  const boas = estado.eu.escritorio.boas_vindas;
  const enviarPara = (p) => {
    const input = h("input", { type: "file", multiple: true, hidden: true, accept: ".pdf,.jpg,.jpeg,.png,.webp,.xml,.ofx,.csv,.xls,.xlsx", onchange: () => acao(null, async () => { for (const a of input.files) await enviarArquivo(`/portal/documentos?pendencia=${p.id}`, a); aviso("Recebido! Obrigado."); rota(); }) });
    return h("button", { class: "btn btn-primario btn-pequeno", onclick: () => input.click() }, "Enviar", input);
  };
  return [
    boas ? h("section", { class: "cartao" }, h("p", { style: { margin: 0 } }, boas)) : null,
    h("section", { class: "cartao" }, h("h2", {}, pend.length ? (pend.length === 1 ? "Falta 1 documento" : `Faltam ${pend.length} documentos`) : "Tudo enviado ✅"), pend.length ? pend.map((p) => h("div", { class: "p-item" }, h("div", {}, h("strong", {}, p.nome), h("small", {}, mesBR(p.competencia), " · até ", prazo(p.prazo))), enviarPara(p))) : h("p", { class: "suave" }, "Nada pendente por enquanto. Quando o escritório precisar de algo, aparece aqui.")),
    guias.length ? h("section", { class: "cartao" }, h("h2", {}, "Guias para pagar"), guias.map(itemGuia)) : null,
    estado.eu.demo ? await honorariosDemo() : null,
  ];
}

/** Só no Modo Demonstração: honorários do escritório com Pix pelo Asaas simulado (baixa automática) */
let esperaPagamento = null;
async function honorariosDemo() {
  const lista = await get("/demo/portal/honorarios");
  const abertos = lista.filter((x) => x.status !== "pago");
  clearTimeout(esperaPagamento);
  if (abertos.some((x) => x.asaas_id)) esperaPagamento = setTimeout(() => location.hash.startsWith("#/inicio") && rota(), 3000);
  const ultimoPago = lista.find((x) => x.status === "pago");
  return h(
    "section",
    { class: "cartao" },
    h("h2", {}, "Honorários do escritório"),
    abertos.length
      ? abertos.map((x) =>
          h(
            "div",
            { class: "p-item" },
            h("div", {}, h("strong", {}, `Honorários ${mesBR(x.competencia)}`), h("small", {}, `vence ${dataBR(x.vencimento)} · ${reais(x.valor_centavos)}`)),
            sit(x.situacao === "atrasado" ? "erro" : "disponivel", x.situacao === "atrasado" ? "Atrasado" : "A vencer"),
            x.asaas_id
              ? h("a", { class: "btn btn-primario btn-pequeno", href: x.link, target: "_blank", rel: "noopener" }, "Abrir Pix")
              : h("button", { class: "btn btn-primario btn-pequeno", onclick: (e) => acao(e.currentTarget, async () => (await post(`/demo/portal/honorarios/${x.id}/pagar`), aviso("Pix gerado! Abra o link para pagar."), rota())) }, "Pagar com Pix"),
          ),
        )
      : h("p", { class: "suave" }, ultimoPago ? `Tudo em dia ✅ Último pagamento: ${mesBR(ultimoPago.competencia)} (${ultimoPago.forma ?? "pago"}).` : "Tudo em dia ✅"),
  );
}

function itemGuia(g) {
  return h(
    "div",
    { class: "p-item" },
    h("div", {}, h("strong", {}, g.titulo), h("small", {}, [g.vencimento ? `vence ${dataBR(g.vencimento)}` : null, g.valor_centavos ? reais(g.valor_centavos) : null].filter(Boolean).join(" · ") || "—")),
    sit(g.status),
    h("button", { class: "btn btn-fantasma btn-pequeno", onclick: () => abrirArquivo(g) }, "Baixar"),
    g.tipo === "guia" && g.status !== "paga" ? h("button", { class: "btn btn-fantasma btn-pequeno", onclick: (e) => acao(e.currentTarget, async () => (await post(`/portal/entregas/${g.id}/paga`), aviso("Marcada como paga."), rota())) }, "Já paguei") : null,
  );
}
async function abrirArquivo(g) {
  const r = await fetch(`/api/portal/entregas/${g.id}/arquivo`, { credentials: "same-origin" });
  if (!r.ok) return aviso("Não foi possível baixar.", "erro");
  const nome = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? g.titulo);
  const a = h("a", { href: URL.createObjectURL(await r.blob()), download: nome });
  document.body.append(a);
  a.click();
  a.remove();
}

function enviar() {
  const comp = h("input", { class: "entrada", type: "month" });
  const status = h("div", { class: "pilha pequeno" });
  return h(
    "section",
    { class: "cartao pilha" },
    h("h2", {}, "Enviar documentos"),
    h("p", { class: "suave" }, "Notas, extratos, recibos, comprovantes ou fotos legíveis. Pode mandar vários de uma vez."),
    h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Mês a que se referem (opcional)"), comp),
    areaEnvio(async (arquivos) => {
      for (const a of arquivos) {
        const linha = h("div", {}, `⏳ ${a.name}`);
        status.append(linha);
        try {
          await enviarArquivo(`/portal/documentos${comp.value ? `?competencia=${comp.value}` : ""}`, a);
          linha.textContent = `✅ ${a.name}`;
        } catch (e) {
          linha.textContent = `❌ ${a.name}: ${e.message}`;
        }
      }
    }, "Toque aqui para escolher os arquivos (ou arraste)"),
    status,
  );
}

async function guias() {
  const lista = await get("/portal/entregas");
  return h("section", { class: "cartao" }, h("h2", {}, "Guias e relatórios"), lista.length ? lista.map(itemGuia) : h("p", { class: "suave" }, "Nada por aqui ainda."));
}

async function historico() {
  const lista = await get("/portal/documentos");
  return h("section", { class: "cartao" }, h("h2", {}, "Documentos enviados"), lista.length ? lista.map((d) => h("div", { class: "p-item" }, h("div", {}, h("strong", {}, d.nome), h("small", {}, `${dataHora(d.criado_em)}${d.competencia ? ` · ${mesBR(d.competencia)}` : ""}${d.motivo ? ` · ${d.motivo}` : ""}`)), d.status === "rejeitado" ? sit("rejeitado", "Reenviar") : d.status === "conferido" ? sit("conferido") : sit("recebido", "Recebido"))) : h("p", { class: "suave" }, "Você ainda não enviou documentos pelo portal."));
}

async function chamados() {
  const lista = await get("/portal/chamados");
  const assunto = h("input", { class: "entrada", maxlength: 140, placeholder: "Ex.: Admissão de funcionário" });
  const texto = h("textarea", { class: "entrada", rows: 4 });
  const b = h("button", { class: "btn btn-primario", type: "submit" }, "Enviar");
  return [
    h("form", { class: "cartao pilha", onsubmit: (e) => (e.preventDefault(), acao(b, async () => (await post("/portal/chamados", { assunto: assunto.value, texto: texto.value }), aviso("Enviado ao escritório."), rota()))) }, h("h2", {}, "Novo pedido ao escritório"), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Assunto"), assunto), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Mensagem"), texto), b),
    ...lista.map((c) => {
      const resp = h("textarea", { class: "entrada", rows: 2, placeholder: "Responder…" });
      return h("section", { class: "cartao pilha" }, h("div", { class: "cartao-topo" }, h("h2", {}, c.assunto), sit(c.status)), h("div", { class: "conversa" }, c.mensagens.map((m) => h("div", { class: `balao ${m.de === "escritorio" ? "escritorio" : ""}` }, m.texto, h("small", {}, `${m.nome} · ${dataHora(m.em)}`)))), c.status !== "resolvido" ? [resp, h("button", { class: "btn btn-fantasma", style: { justifySelf: "start" }, onclick: (e) => acao(e.currentTarget, async () => (await post(`/portal/chamados/${c.id}/mensagem`, { texto: resp.value }), rota())) }, "Enviar resposta")] : null);
    }),
  ];
}

function conta() {
  const atual = h("input", { class: "entrada", type: "password", autocomplete: "current-password" });
  const nova = h("input", { class: "entrada", type: "password", autocomplete: "new-password" });
  const b = h("button", { class: "btn btn-primario", type: "submit" }, "Trocar senha");
  return h("form", { class: "cartao pilha", onsubmit: (e) => (e.preventDefault(), acao(b, async () => (await put("/portal/senha", { atual: atual.value, nova: nova.value }), aviso("Senha trocada."), (atual.value = nova.value = "")))) }, h("h2", {}, "Minha conta"), h("p", {}, `${estado.eu.usuario.nome} · ${estado.eu.usuario.email}`), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Senha atual"), atual), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Nova senha"), nova), b);
}

async function iniciar() {
  definirAoDeslogar(() => estado.eu && location.reload());
  const st = await get("/portal/estado").catch(() => ({ logado: false }));
  if (!st.logado || location.hash.startsWith("#/convite/")) return telaEntrar(st);
  estado.eu = await get("/portal/eu");
  cor(estado.eu.escritorio.cor);
  document.title = `Portal · ${estado.eu.escritorio.nome}`;
  limpar(app, casca());
  window.addEventListener("hashchange", rota);
  if (!location.hash) location.hash = "#/inicio";
  rota();
}
iniciar().catch((e) => limpar(app, h("div", { class: "p-login" }, h("section", { class: "cartao" }, h("h2", {}, "Portal indisponível"), h("p", {}, e.message)))));
