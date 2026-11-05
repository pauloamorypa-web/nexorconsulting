/* Portal do Parceiro Nexor: clientes indicados, comissões e envio de novas indicações.
   Entra pelo link enviado pela Nexor (…/parceiro/#t=nxp_…). O token fica só nesta aba (sessionStorage). */
import { h, limpar, reais, aviso, dataHora } from "/js/ui.js";
import { dataBR, tabela } from "/js/comum.js";

const app = document.getElementById("app");
const m = location.hash.match(/#t=(nxp_[\w-]+)/);
if (m) {
  try {
    sessionStorage.setItem("nx-parceiro", m[1]);
  } catch {
    /* sem armazenamento */
  }
  history.replaceState(null, "", location.pathname);
}
let token = m?.[1];
try {
  token ??= sessionStorage.getItem("nx-parceiro");
} catch {
  /* sem armazenamento */
}

const chamar = async (metodo, caminho, corpo) => {
  const r = await fetch(`/api/portal-parceiro${caminho}`, { method: metodo, headers: { Authorization: `Parceiro ${token}`, ...(corpo ? { "content-type": "application/json" } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro ?? `Erro ${r.status}`);
  return d;
};
const TIPO = { primeira: "1ª mensalidade", recorrente: "Mensalidade", implantacao: "Implantação", sob_medida: "Projeto" };
const ST = { prevista: "Em carência", a_pagar: "A receber", paga: "Recebida", estornada: "Estornada" };
const IND = { nova: "Nova", em_contato: "Em contato", teste: "Em teste", fechada: "Fechada", perdida: "Não fechou" };
const chip = (t, c = "") => h("span", { class: `chip ${c ? `chip-${c}` : ""}` }, t);

function erro(msg) {
  limpar(app, h("div", { class: "portal" }, h("div", { class: "vazio" }, h("h3", {}, "Não foi possível abrir o portal"), h("p", {}, msg), h("p", { class: "suave" }, "Peça um link novo para a equipe Nexor."))));
}

async function abrir() {
  if (!token) return erro("Abra o portal pelo link que a Nexor enviou para você.");
  let d;
  try {
    d = await chamar("GET", "");
  } catch (e) {
    return erro(e.message);
  }
  const r = d.parceiro.regra;
  const regra = [r.primeira ? `${r.primeira}% da 1ª mensalidade` : null, `${r.recorrente}% das mensalidades ${r.meses ? `por ${r.meses} meses` : "enquanto o cliente estiver ativo"}`, r.implantacao ? `${r.implantacao}% da implantação` : null].filter(Boolean).join(" · ");
  const campos = {
    empresa: h("input", { class: "entrada", required: true, maxlength: 150, placeholder: "Nome da empresa" }),
    contato: h("input", { class: "entrada", maxlength: 120, placeholder: "Com quem falar" }),
    telefone: h("input", { class: "entrada", type: "tel", maxlength: 30, placeholder: "WhatsApp" }),
    email: h("input", { class: "entrada", type: "email", maxlength: 160, placeholder: "E-mail" }),
    produto: h("select", { class: "entrada" }, h("option", { value: "" }, "Ainda não sei"), Object.entries(d.produtos).filter(([k]) => k !== "one").map(([k, v]) => h("option", { value: k }, v))),
    observacao: h("textarea", { class: "entrada", rows: 3, maxlength: 1000, placeholder: "O que a empresa precisa, melhor horário para contato…" }),
  };
  const rot = (t, el, largo) => h("label", { class: `campo ${largo ? "largo" : ""}` }, h("span", { class: "campo-rotulo" }, t), el);
  const botao = h("button", { class: "btn btn-primario", type: "submit" }, "Enviar indicação");
  const form = h("form", {
    class: "portal-form",
    onsubmit: async (e) => {
      e.preventDefault();
      botao.disabled = true;
      try {
        await chamar("POST", "/indicacoes", Object.fromEntries(Object.entries(campos).map(([k, el]) => [k, el.value.trim() || undefined])));
        aviso("Indicação enviada. A equipe Nexor vai entrar em contato.");
        abrir();
      } catch (er) {
        aviso(er.message, "erro");
        botao.disabled = false;
      }
    },
  }, rot("Empresa", campos.empresa), rot("Contato", campos.contato), rot("WhatsApp", campos.telefone), rot("E-mail", campos.email), rot("Produto", campos.produto), rot("Observação", campos.observacao, true), h("div", { class: "largo" }, botao));

  limpar(
    app,
    h(
      "div",
      { class: "portal" },
      h("header", { class: "portal-topo" }, h("img", { src: "/img/logo-mark.webp", alt: "" }), h("div", {}, h("h1", {}, "Portal do Parceiro Nexor"), h("small", {}, `${d.parceiro.nome} · ${d.parceiro.tipo_nome}`))),
      h("section", { class: "portal-heroi" }, h("h2", {}, "Obrigado por caminhar com a Nexor 💙"), h("p", {}, `A IA faz o trabalho pesado e o nosso time cuida de cada cliente que você indica. Sua regra: ${regra}.`)),
      h("div", { class: "portal-indicadores" }, h("div", {}, h("small", {}, "A receber"), h("b", {}, reais(d.totais.a_receber))), h("div", {}, h("small", {}, `Em carência (${d.regras.carencia_dias} dias)`), h("b", {}, reais(d.totais.carencia))), h("div", {}, h("small", {}, "Já recebido"), h("b", {}, reais(d.totais.recebido))), h("div", {}, h("small", {}, "Clientes ativos"), h("b", {}, String(d.totais.clientes_ativos)), h("small", {}, `${d.totais.em_teste} em teste grátis`))),
      h("section", { class: "cartao" }, h("h2", {}, "Indicar uma empresa"), form),
      h("section", { class: "cartao" }, h("h2", {}, "Seus clientes"), tabela([{ titulo: "Cliente", valor: (c) => h("div", {}, h("strong", {}, c.nome), c.fundador ? chip("Fundador", "ok") : null) }, { titulo: "Plano", valor: (c) => (c.fase === "teste" ? `Teste grátis até ${dataBR(c.teste_ate)}` : c.plano || "—") }, { titulo: "Situação", valor: (c) => (c.status !== "ativo" ? chip("Encerrado") : c.fase === "teste" ? chip("Em teste", "alerta") : chip("Ativo", "ok")) }, { titulo: "Desde", valor: (c) => (c.contratado_em ? dataBR(c.contratado_em) : "—") }], d.clientes, { vazio: "Seus clientes aparecem aqui assim que a Nexor vincular a indicação." })),
      h("section", { class: "cartao" }, h("h2", {}, "Comissões"), tabela([{ titulo: "Cliente", valor: (x) => x.cliente }, { titulo: "Sobre", valor: (x) => `${TIPO[x.tipo] ?? x.tipo} · ${x.pct}% de ${reais(x.base_centavos)}` }, { titulo: "Valor", valor: (x) => reais(x.valor_centavos), classe: "num" }, { titulo: "Situação", valor: (x) => chip(ST[x.status] ?? x.status, x.status === "a_pagar" ? "ok" : x.status === "estornada" ? "perigo" : x.status === "prevista" ? "alerta" : "") }, { titulo: "Quando", valor: (x) => (x.status === "paga" ? dataBR(x.pago_em) : x.status === "prevista" ? `libera em ${dataBR(x.liberar_em)}` : "—") }], d.comissoes, { vazio: "As comissões aparecem aqui quando os seus clientes pagam." }), h("p", { class: "suave pequeno" }, `A comissão é calculada sobre o valor recebido e fica disponível depois de ${d.regras.carencia_dias} dias. Cancelamento em até ${d.regras.estorno_cancelamento_dias} dias estorna a comissão da 1ª mensalidade e da implantação.`)),
      h("section", { class: "cartao" }, h("h2", {}, "Suas indicações"), tabela([{ titulo: "Quando", valor: (i) => dataHora(i.criado_em) }, { titulo: "Empresa", valor: (i) => i.empresa }, { titulo: "Produto", valor: (i) => d.produtos[i.produto] ?? "—" }, { titulo: "Situação", valor: (i) => IND[i.status] ?? i.status }], d.indicacoes, { vazio: "Nenhuma indicação ainda." })),
      h("p", { class: "suave pequeno", style: { textAlign: "center" } }, "Dúvidas? Fale com a equipe Nexor", d.contato?.email ? ` · ${d.contato.email}` : ""),
    ),
  );
}
abrir();
