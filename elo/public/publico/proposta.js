/* Página da proposta para o cliente final (/p/:token), sem login. Mostra a marca do instalador, os itens
   com fotos e o total (nunca o custo nem o fornecedor), aceite com nome e pagamento por Pix, boleto ou cartão.
   O token não vaza: a página e as imagens vão sem Referer e os links externos levam rel="noreferrer". */
import { aplicarTemaSalvo, aviso, botao, botaoConfirma, campo, chamar, dataCurta, dataHora, diaBR, entrada, foneBR, h, ic, iniciais, limpar, linkWhatsApp, reais, soDigitos, vigiarConexao } from "/app/nucleo.js";

aplicarTemaSalvo();
vigiarConexao();
const raiz = document.getElementById("pagina");
const token = location.pathname.split("/")[2] ?? "";
const API = `/api/publico/propostas/${encodeURIComponent(token)}`;
const FORMAS = { PIX: ["Pix", "pix", "Aprovação na hora"], BOLETO: ["Boleto", "codigo", "Compensa em até 2 dias úteis"], CREDIT_CARD: ["Cartão", "cartao", "Em até 12x"] };
let demo = false;
let vigia = null;

async function carregar() {
  let p;
  try {
    p = await chamar(API);
  } catch (e) {
    document.body.classList.remove("com-cta");
    limpar(raiz, h("div", { class: "tela-entrar" }, h("div", { class: "cartao" }, h("h1", {}, e.status === 404 ? "Proposta não encontrada" : "Não foi possível abrir a proposta"), h("p", { class: "suave" }, e.message), e.status !== 404 ? botao("Tentar de novo", carregar, "btn-cor btn-bloco") : null)));
    return;
  }
  desenhar(p);
}

function desenhar(p) {
  document.title = `Proposta #${p.numero} · ${p.empresa.nome}`;
  const produtos = p.itens.filter((i) => i.tipo === "produto");
  const servicos = p.itens.filter((i) => i.tipo === "servico");
  const pago = p.status === "paga" || p.pagamento?.status === "pago";
  const encerrada = ["expirada", "cancelada"].includes(p.status);
  const reservaAte = p.reserva_expira_em && p.reserva_expira_em > Date.now() ? p.reserva_expira_em : null;
  const parcela12 = Math.ceil(p.total_centavos / 12);
  const contato = p.empresa.telefone ? h("div", { class: "btns" }, h("a", { class: "btn btn-whats btn-peq", href: linkWhatsApp(p.empresa.telefone, `Olá! Tenho uma dúvida sobre a proposta #${p.numero} (${p.titulo}).`), target: "_blank", rel: "noopener noreferrer" }, ic("whatsapp", 16), "Tirar dúvida no WhatsApp"), h("a", { class: "btn btn-fantasma btn-peq", href: `tel:${soDigitos(p.empresa.telefone)}` }, ic("telefone", 16), foneBR(p.empresa.telefone))) : null;

  const linhaProduto = (i) => h("div", { class: "produto" }, h("div", { class: "foto" }, i.foto_url ? h("img", { src: i.foto_url, alt: i.descricao, loading: "lazy", referrerpolicy: "no-referrer" }) : ic(i.tipo === "servico" ? "ferramenta" : "caixa", 28)), h("div", { class: "pilha", style: { gap: "2px" } }, h("strong", { class: "quebra" }, i.descricao), h("div", { class: "linha" }, h("span", { class: "pequeno suave numero" }, `${i.quantidade} ${i.unidade ?? "un"} × ${reais(i.preco_unit_centavos)}`), h("strong", { class: "numero" }, reais(i.total_centavos)))));

  limpar(
    raiz,
    h(
      "header",
      { class: "hero" },
      h("div", { class: "empresa" }, h("span", { class: "avatar", "aria-hidden": "true" }, iniciais(p.empresa.nome)), h("div", {}, h("strong", {}, p.empresa.nome), h("small", { class: "suave", style: { display: "block" } }, [p.empresa.cidade && `${p.empresa.cidade}/${p.empresa.uf}`, p.empresa.cnpj && `CNPJ ${p.empresa.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}`].filter(Boolean).join(" · ")))),
      h("div", { class: "pilha", style: { gap: "4px" } }, h("small", {}, `Proposta #${p.numero}${p.cliente?.nome ? ` para ${p.cliente.nome}` : ""}`), h("h1", {}, p.titulo)),
      h("div", {}, h("div", { class: "valor" }, reais(p.total_centavos)), !pago && p.formas.includes("CREDIT_CARD") ? h("small", {}, `à vista no Pix ou em até 12x de ${reais(parcela12)} no cartão`) : null),
      h("div", { class: "selos" },
        pago ? h("span", { class: "selo" }, ic("check", 14), "Pago") : reservaAte ? h("span", { class: "selo" }, ic("cadeado", 14), `Material reservado até ${dataCurta(reservaAte)}`) : null,
        p.garantia ? h("span", { class: "selo" }, ic("escudo", 14), "Com garantia") : null,
        h("span", { class: "selo" }, ic("cadeado", 14), "Pagamento seguro"),
        p.validade_dia ? h("span", { class: "selo" }, ic("relogio", 14), `Válida até ${diaBR(p.validade_dia)}`) : null),
    ),
    pago ? blocoPago(p) : null,
    encerrada ? h("div", { class: "secao" }, h("div", { class: "aviso-faixa" }, ic("alerta"), h("span", {}, p.status === "cancelada" ? "Esta proposta foi cancelada pelo instalador. Fale com ele para uma nova." : "O prazo desta proposta terminou e a reserva do material venceu. Fale com o instalador para renovar."))) : null,
    produtos.length ? h("section", { class: "secao", "aria-labelledby": "t-prod" }, h("h2", { id: "t-prod" }, "O que vai ser instalado"), h("div", { class: "cartao" }, produtos.map(linhaProduto))) : null,
    servicos.length ? h("section", { class: "secao", "aria-labelledby": "t-serv" }, h("h2", { id: "t-serv" }, "Serviços"), h("div", { class: "cartao" }, servicos.map(linhaProduto))) : null,
    h("section", { class: "secao" }, h("div", { class: "cartao" }, h("dl", { class: "tabela-calc" }, h("dt", {}, "Subtotal"), h("dd", {}, reais(p.subtotal_centavos)), p.desconto_centavos ? [h("dt", { class: "ok" }, "Desconto"), h("dd", { class: "ok" }, `− ${reais(p.desconto_centavos)}`)] : null, h("dt", { class: "forte" }, "Total"), h("dd", { class: "forte", style: { fontSize: "19px" } }, reais(p.total_centavos))))),
    p.garantia || p.condicoes || p.observacoes
      ? h("section", { class: "secao", "aria-labelledby": "t-cond" }, h("h2", { id: "t-cond" }, "Garantia e condições"), h("div", { class: "cartao pilha" },
          p.garantia ? h("div", { class: "linha-esq", style: { alignItems: "flex-start", flexWrap: "nowrap" } }, h("span", { class: "ok" }, ic("escudo")), h("div", {}, h("strong", {}, "Garantia"), h("p", { class: "suave" }, p.garantia))) : null,
          p.condicoes ? h("div", { class: "linha-esq", style: { alignItems: "flex-start", flexWrap: "nowrap" } }, h("span", { class: "fraco" }, ic("cartao")), h("div", {}, h("strong", {}, "Pagamento"), h("p", { class: "suave" }, p.condicoes))) : null,
          p.observacoes ? h("div", { class: "linha-esq", style: { alignItems: "flex-start", flexWrap: "nowrap" } }, h("span", { class: "fraco" }, ic("nota")), h("div", {}, h("strong", {}, "Observações"), h("p", { class: "suave" }, p.observacoes))) : null))
      : null,
    !pago && !encerrada ? h("section", { class: "secao", id: "acao", "aria-labelledby": "t-acao" }, h("h2", { id: "t-acao" }, p.pode_pagar || p.aceite ? "Pagamento" : "Aprovar a proposta"), blocoAcao(p)) : null,
    h("section", { class: "secao" }, h("div", { class: "cartao" }, h("strong", {}, `Dúvidas? Fale com ${p.empresa.nome}`), contato ?? h("span", { class: "suave pequeno" }, "Responda a mensagem em que recebeu este link."))),
    h("footer", { class: "rodape-publico" }, h("span", {}, `Proposta de ${p.empresa.nome}${p.enviada_em ? ` · enviada em ${dataCurta(p.enviada_em)}` : ""}`), h("span", {}, "Pagamento processado pelo Asaas · Nexor Elo")),
  );
  ctaFixo(p, pago, encerrada);
  // Esperando o pagamento: confere sozinho até cair
  clearInterval(vigia);
  if (!pago && p.pagamento?.status === "pendente") vigia = setInterval(atualizarEmSilencio, 8000);
}

async function atualizarEmSilencio() {
  try {
    const p = await chamar(API);
    if (p.status === "paga" || p.pagamento?.status === "pago") {
      clearInterval(vigia);
      desenhar(p);
      aviso("Pagamento confirmado. Obrigado!");
    }
  } catch {
    /* tenta de novo no próximo ciclo */
  }
}

function blocoPago(p) {
  return h("section", { class: "secao" }, h("div", { class: "cartao sucesso", role: "status" }, h("div", { class: "check" }, ic("check", 38)), h("h2", {}, "Pagamento confirmado"), h("p", { class: "suave" }, `Recebemos o pagamento${p.pagamento?.pago_em ? ` em ${dataHora(p.pagamento.pago_em)}` : ""}. ${p.empresa.nome} vai combinar a data da instalação com você.`), p.aceite ? h("small", { class: "fraco" }, `Aceite de ${p.aceite.nome} em ${dataHora(p.aceite.em)}`) : null));
}

function ctaFixo(p, pago, encerrada) {
  document.querySelector(".cta")?.remove();
  document.body.classList.remove("com-cta");
  if (pago || encerrada) return;
  const ir = (rotulo) => h("a", { class: "btn btn-cor btn-bloco", href: "#acao", onclick: (e) => (e.preventDefault(), document.getElementById("acao")?.scrollIntoView({ behavior: "smooth", block: "start" }), setTimeout(() => document.querySelector("#acao input, #acao button")?.focus({ preventScroll: true }), 400)) }, rotulo);
  const conteudo = p.pode_aceitar ? ir("Aceitar proposta") : p.pagamento?.link ? h("a", { class: "btn btn-cor btn-bloco", href: p.pagamento.link, target: "_blank", rel: "noopener noreferrer" }, ic("cartao", 18), "Continuar o pagamento") : p.pode_pagar ? ir(`Pagar ${reais(p.total_centavos)}`) : null;
  if (!conteudo) return;
  document.body.classList.add("com-cta");
  document.body.append(h("div", { class: "cta", role: "region", "aria-label": "Ação principal" }, h("div", { class: "cta-in" }, h("div", { class: "linha" }, h("span", { class: "suave pequeno" }, "Total"), h("strong", { class: "numero" }, reais(p.total_centavos))), conteudo)));
}

function blocoAcao(p) {
  if (p.pode_aceitar) {
    const nome = entrada({ value: p.cliente?.nome ?? "", autocomplete: "name", maxlength: 160, required: true });
    const doc = entrada({ inputmode: "numeric", autocomplete: "off", placeholder: "Opcional" });
    const concordo = h("input", { type: "checkbox", id: "concordo" });
    const aceitar = botaoConfirma("Aceitar proposta", "Toque de novo para confirmar o aceite", async () => {
      if (nome.value.trim().length < 3) throw new Error("Digite seu nome completo.");
      if (!concordo.checked) throw new Error("Marque que leu e concorda com a proposta.");
      const r = await chamar(`${API}/aceitar`, { metodo: "POST", corpo: { nome: nome.value.trim(), ...(soDigitos(doc.value) ? { documento: soDigitos(doc.value) } : {}), concordo: true } });
      aviso("Proposta aceita! Agora escolha como pagar.");
      desenhar(r);
      document.getElementById("acao")?.scrollIntoView({ block: "start" });
    }, "btn-cor btn-bloco", "check");
    return h("form", { class: "cartao pilha", onsubmit: (e) => (e.preventDefault(), aceitar.click()) },
      h("p", { class: "suave pequeno" }, "Ao aceitar, registramos seu nome, a data e o endereço de internet do aceite."),
      campo("Seu nome completo", nome), campo("CPF ou CNPJ", doc, "Opcional agora; pedimos no boleto e no cartão."),
      h("label", { class: "marcar", for: "concordo" }, concordo, h("span", {}, "Li e concordo com os itens, o valor, a garantia e as condições desta proposta.")),
      aceitar);
  }
  if (p.pagamento?.status === "pendente" && p.pagamento.link) {
    return h("div", { class: "cartao pilha" },
      h("div", { class: "aviso-faixa info" }, ic("relogio"), h("span", {}, `Cobrança gerada (${FORMAS[p.pagamento.forma]?.[0] ?? p.pagamento.forma}${p.pagamento.parcelas > 1 ? ` em ${p.pagamento.parcelas}x` : ""}). Assim que o pagamento cair, esta página atualiza sozinha.`)),
      h("a", { class: "btn btn-cor btn-bloco", href: p.pagamento.link, target: "_blank", rel: "noopener noreferrer" }, ic("cartao", 18), "Abrir o pagamento"),
      demo ? botaoDemoPagar() : null);
  }
  if (!p.pode_pagar) return h("div", { class: "aviso-faixa" }, ic("alerta"), h("span", {}, p.aceite ? "A reserva do material venceu antes do pagamento. Fale com o instalador para renovar." : "Esta proposta ainda não pode ser paga."));
  let forma = "PIX";
  const parcelas = h("select", { class: "entrada", "aria-label": "Parcelas" }, Array.from({ length: 12 }, (_, i) => h("option", { value: String(i + 1) }, i ? `${i + 1}x de ${reais(Math.ceil(p.total_centavos / (i + 1)))}` : `1x de ${reais(p.total_centavos)}`)));
  const campoParc = campo("Parcelas", parcelas);
  campoParc.hidden = true;
  const precisaDoc = !p.cliente?.documento;
  const doc = entrada({ inputmode: "numeric", autocomplete: "off", placeholder: "Só números" });
  const email = entrada({ type: "email", autocomplete: "email", placeholder: "Para receber o comprovante" });
  const pagar = botao(`Pagar com Pix · ${reais(p.total_centavos)}`, async () => {
    if (precisaDoc && forma !== "PIX" && soDigitos(doc.value).length < 11) throw new Error("Informe seu CPF ou CNPJ para o boleto ou o cartão.");
    const corpo = { forma, ...(forma === "CREDIT_CARD" ? { parcelas: Number(parcelas.value) } : {}), ...(soDigitos(doc.value) ? { documento: soDigitos(doc.value) } : {}), ...(email.value.trim() ? { email: email.value.trim() } : {}) };
    const r = await chamar(`${API}/pagar`, { metodo: "POST", corpo });
    aviso("Cobrança gerada. Abra o link para pagar.");
    carregar();
    if (r.link) setTimeout(() => document.querySelector("#acao a.btn-cor")?.focus(), 300);
  }, "btn-cor btn-bloco", "cadeado");
  const escolher = (f) => {
    forma = f;
    campoParc.hidden = f !== "CREDIT_CARD";
    pagar.lastChild.textContent = `Pagar com ${FORMAS[f][0]} · ${reais(p.total_centavos)}`;
  };
  return h("div", { class: "cartao pilha" },
    p.aceite ? h("div", { class: "aviso-faixa ok pequeno" }, ic("check", 16), h("span", {}, `Proposta aceita por ${p.aceite.nome} em ${dataHora(p.aceite.em)}.`)) : null,
    h("fieldset", { style: { border: 0, padding: 0, margin: 0 } }, h("legend", { class: "rotulo-secao", style: { marginBottom: "8px" } }, "Como você quer pagar?"),
      h("div", { class: "formas" }, p.formas.map((f) => h("label", { class: "forma" }, h("input", { type: "radio", name: "forma", value: f, checked: f === forma, onchange: () => escolher(f) }), ic(FORMAS[f]?.[1] ?? "cartao", 22), FORMAS[f]?.[0] ?? f, h("small", {}, FORMAS[f]?.[2] ?? ""))))),
    campoParc,
    precisaDoc ? campo("CPF ou CNPJ de quem paga", doc, "Obrigatório no boleto e no cartão.") : null,
    campo("E-mail (opcional)", email),
    pagar,
    h("small", { class: "fraco" }, ic("cadeado", 12), " Você paga numa página segura do Asaas. O valor já é dividido automaticamente entre quem fornece e quem instala."));
}

function botaoDemoPagar() {
  return botao("Simular pagamento do cliente (demonstração)", async () => {
    const r = await chamar("/api/demo/pagar", { metodo: "POST", corpo: { token } });
    if (!r.ok) throw new Error(r.erro ?? "Não foi possível simular.");
    await atualizarEmSilencio();
  }, "btn-fantasma btn-bloco", "check");
}

addEventListener("nx-demo-pago", () => atualizarEmSilencio());
(async () => {
  try {
    demo = (await fetch("/api/demo", { cache: "no-store" })).ok;
  } catch {
    demo = false;
  }
  carregar();
})();

