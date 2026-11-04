/* Folgas, bloqueios e o expediente de cada barbeiro. O barbeiro cuida da própria agenda sozinho. */

import { del, get, post, put } from "../api.js";
import { acao, aviso, confirmar, entrada, h, icone, janela, limpar, seletor } from "../ui.js";
import { tabela, topo } from "../comum.js";
import { dataBR, editorHorario, hojeISO } from "../base.js";

export async function render(area, ctx) {
  const corpo = h("div", { class: "pilha" });
  limpar(area, h("div", { class: "pagina" }, topo("Folgas e horários", ctx.barbeiro ? "Bloqueie horários, marque folgas e ajuste o seu expediente. Os clientes só veem o que estiver livre." : "Folgas, bloqueios (da barbearia toda ou de um barbeiro) e o expediente de cada um.", h("button", { class: "btn btn-primario", onclick: () => novoBloqueio() }, icone("mais", 16), "Bloquear horário")), corpo));
  let barbeiros = [];

  function novoBloqueio() {
    const selB = seletor([...(ctx.barbeiro ? [] : [["", "Barbearia inteira (feriado, evento)"]]), ...barbeiros.filter((b) => b.ativo && (!ctx.barbeiro || b.id === ctx.eu.usuario.barbeiro_id)).map((b) => [b.id, b.nome])], ctx.barbeiro ? ctx.eu.usuario.barbeiro_id : "");
    const d1 = entrada({ type: "date", value: hojeISO(), min: hojeISO() });
    const d2 = entrada({ type: "date", value: hojeISO(), min: hojeISO() });
    const h1 = entrada({ type: "time", value: "08:00" });
    const h2 = entrada({ type: "time", value: "20:00" });
    const motivo = entrada({ placeholder: "Motivo (aparece só para a equipe)" });
    const ok = h("button", { class: "btn btn-primario" }, "Bloquear");
    const j = janela({ titulo: "Bloquear horário", conteudo: h("div", { class: "pilha" }, selB, h("div", { class: "grade-2" }, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "De"), d1, h1), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Até"), d2, h2)), motivo), acoes: [ok] });
    ok.onclick = () =>
      acao(ok, async () => {
        const r = await post("/bloqueios", { barbeiro_id: selB.value || null, dia: d1.value, de: h1.value, ate_dia: d2.value, ate: h2.value, motivo: motivo.value.trim() || null });
        aviso(r.clientes_no_periodo ? `Bloqueado. Atenção: ${r.clientes_no_periodo} cliente(s) já marcados nesse período. Remarque pela agenda.` : "Horário bloqueado.", r.clientes_no_periodo ? "info" : "ok", 7000);
        j.fechar();
        carregar();
      });
  }

  function horario(b) {
    const ed = editorHorario(b.horario ?? ctx.eu.barbearia.config.horario);
    const usarPadrao = h("input", { type: "checkbox", checked: !b.horario || !Object.keys(b.horario).length });
    const ok = h("button", { class: "btn btn-primario" }, "Salvar expediente");
    const j = janela({ titulo: `Expediente de ${b.nome}`, largura: 560, conteudo: h("div", { class: "pilha" }, h("label", { class: "linha-check" }, usarPadrao, h("span", {}, "Seguir o horário da barbearia")), ed.el), acoes: [ok] });
    ok.onclick = () => acao(ok, async () => (await put(`/barbeiros/${b.id}`, { horario: usarPadrao.checked ? null : ed.ler() }), aviso("Expediente salvo."), j.fechar(), carregar()));
  }

  async function carregar() {
    const [bl, bs] = await Promise.all([get(`/bloqueios?de=${hojeISO()}`), get("/barbeiros")]);
    barbeiros = bs;
    const nome = (id) => (id ? (barbeiros.find((b) => b.id === id)?.nome ?? "Barbeiro") : "Barbearia inteira");
    const fmt = (ms) => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const meus = barbeiros.filter((b) => b.ativo && (!ctx.barbeiro || b.id === ctx.eu.usuario.barbeiro_id));
    limpar(
      corpo,
      h(
        "section",
        { class: "cartao" },
        h("h3", {}, "Próximos bloqueios"),
        tabela(
          [
            { titulo: "Quem", valor: (x) => nome(x.barbeiro_id) },
            { titulo: "De", valor: (x) => fmt(x.inicio) },
            { titulo: "Até", valor: (x) => fmt(x.fim) },
            { titulo: "Motivo", valor: (x) => x.motivo ?? "—" },
            { titulo: "", valor: (x) => (!ctx.barbeiro || x.barbeiro_id === ctx.eu.usuario.barbeiro_id ? h("button", { class: "btn-icone", "aria-label": "Remover", onclick: async () => (await confirmar("Liberar este horário de novo?", { botao: "Liberar" })) && (await del(`/bloqueios/${x.id}`), aviso("Liberado."), carregar()) }, icone("lixo", 16)) : null) },
          ],
          bl,
          { vazio: "Nenhum bloqueio marcado." },
        ),
      ),
      h("section", { class: "cartao" }, h("h3", {}, "Expediente"), h("div", { class: "lista-simples" }, meus.map((b) => h("div", { class: "linha-entre" }, h("span", {}, h("span", { class: "bolinha", style: { background: b.cor } }), " ", h("strong", {}, b.nome), h("small", { class: "suave" }, b.horario && Object.keys(b.horario).length ? " · horário próprio" : " · horário da barbearia")), h("button", { class: "btn btn-fantasma btn-pequeno", onclick: () => horario(b) }, "Ajustar"))))),
      h("p", { class: "suave pequeno" }, `Hoje: ${dataBR(hojeISO())}. Feriados e horários especiais da barbearia inteira ficam em Configurações.`),
    );
  }
  await carregar();
}
