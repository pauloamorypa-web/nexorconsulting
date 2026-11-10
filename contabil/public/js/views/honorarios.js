/* Honorários do escritório (só no Modo Demonstração): em dia, atrasados e pagos, com cobrança pelo Asaas
   simulado. O pagamento "cai" sozinho alguns segundos depois e a baixa aparece aqui ao vivo. */

import { get, post } from "../api.js";
import { acao, aviso, dataHora, h, limpar, reais } from "../ui.js";
import { botao, dataBR, indicador, mesBR, tabela, topo } from "../comum.js";

const SIT = { pago: ["Pago", "ok"], atrasado: ["Atrasado", "perigo"], a_vencer: ["Em dia · a vencer", "info"] };
const chip = (s) => h("span", { class: `chip chip-${SIT[s][1]}` }, SIT[s][0]);

export async function render(raiz, ctx) {
  const resumo = h("div", { class: "indicadores" });
  const corpo = h("div");
  const filtro = h("select", { class: "entrada" }, [["", "Todos"], ["atrasado", "Atrasados"], ["a_vencer", "A vencer"], ["pago", "Pagos"]].map(([v, t]) => h("option", { value: v }, t)));
  let timer = null;
  let aguardando = new Set();

  const carregar = async () => {
    const d = await get("/demo/honorarios");
    const r = d.resumo;
    limpar(resumo, indicador("check", "Recebido no mês", reais(r.recebido_mes), "Pix, boleto e Asaas", "var(--verde)"), indicador("relogio", "A vencer", reais(r.a_vencer), "dentro do prazo"), indicador("alerta", "Em atraso", reais(r.atrasado), `${r.atrasados} cobrança(s)`, r.atrasados ? "var(--vermelho)" : undefined));
    for (const x of d.lista) if (aguardando.has(x.id) && x.status === "pago") (aguardando.delete(x.id), aviso(`Pagamento recebido: ${x.cliente} · ${reais(x.valor_centavos)}. Baixa automática feita ✅`));
    const lista = d.lista.filter((x) => !filtro.value || x.situacao === filtro.value);
    limpar(
      corpo,
      h(
        "section",
        { class: "cartao" },
        tabela(
          [
            { titulo: "Cliente", valor: (x) => x.cliente },
            { titulo: "Mês", valor: (x) => mesBR(x.competencia) },
            { titulo: "Vencimento", valor: (x) => dataBR(x.vencimento) },
            { titulo: "Valor", valor: (x) => reais(x.valor_centavos), classe: "num" },
            { titulo: "Situação", valor: (x) => chip(x.situacao) },
            { titulo: "Pagamento", valor: (x) => (x.status === "pago" ? `${x.forma ?? ""}${x.pago_em ? ` · ${dataHora(x.pago_em)}` : ""}` : x.asaas_id ? h("a", { href: x.link, target: "_blank", rel: "noopener" }, "Link de pagamento (Asaas)") : "—") },
            {
              titulo: "",
              valor: (x) =>
                x.status === "pago"
                  ? null
                  : h(
                      "div",
                      { class: "acoes-linha" },
                      botao(x.asaas_id ? "Reenviar cobrança" : "Cobrar pelo Asaas", (e) => acao(e.currentTarget, async () => { await post(`/demo/honorarios/${x.id}/cobrar`); aguardando.add(x.id); aviso(`Cobrança enviada pelo WhatsApp. O Pix "cai" em ~${d.segundos}s e a baixa é automática.`); carregar(); }), "btn-primario btn-pequeno"),
                      botao("Simular pagamento", (e) => acao(e.currentTarget, async () => { aguardando.add(x.id); await post(`/demo/pagar/${x.id}`); carregar(); }), "btn-fantasma btn-pequeno"),
                    ),
            },
          ],
          lista,
          { vazio: "Nenhum honorário neste filtro." },
        ),
      ),
    );
  };
  filtro.addEventListener("change", carregar);
  raiz.append(h("div", { class: "pagina" }, topo("Honorários", "Mensalidades do escritório com cobrança integrada ao Asaas (simulado na demonstração): link de Pix ou boleto pelo WhatsApp e baixa automática quando o cliente paga."), resumo, h("section", { class: "cartao" }, h("div", { class: "filtros" }, filtro)), corpo));
  await carregar();
  timer = setInterval(() => carregar().catch(() => {}), 3000);
  return () => clearInterval(timer);
}
