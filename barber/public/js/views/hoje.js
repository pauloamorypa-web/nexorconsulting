/* Agenda do dia em linha do tempo: uma coluna por barbeiro, a linha do "agora", folgas, quem chegou e a fila de espera.
   Toque num espaço vazio para agendar naquele horário. */

import { del, get, put } from "../api.js";
import { acao, aviso, confirmar, entrada, h, icone, janela, limpar, reais } from "../ui.js";
import { indicador } from "../comum.js";
import { ORIGEM, comanda, dataLonga, fone, hojeISO, novoAgendamento, sit, somarDias } from "../base.js";

const PX = 1.6; // pixels por minuto
const minutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minDoDia = (ms) => {
  const d = new Date(ms - 3 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

export async function render(area, ctx) {
  let dia = new URLSearchParams(location.hash.split("?")[1] ?? "").get("dia") || hojeISO();
  const corpo = h("div");
  const seletorDia = entrada({ type: "date", value: dia, onchange: (e) => ir(e.target.value) });
  const ir = (d) => ((dia = d), (seletorDia.value = d), carregar());
  limpar(
    area,
    h(
      "div",
      { class: "pagina" },
      h(
        "header",
        { class: "pagina-topo" },
        h("div", {}, h("h1", { id: "titulo-dia" }, "Agenda"), h("p", { class: "suave", id: "sub-dia" })),
        h(
          "div",
          { class: "acoes-topo" },
          h("button", { class: "btn btn-fantasma btn-icone", "aria-label": "Dia anterior", onclick: () => ir(somarDias(dia, -1)) }, icone("voltar")),
          h("button", { class: "btn btn-fantasma", onclick: () => ir(hojeISO()) }, "Hoje"),
          seletorDia,
          h("button", { class: "btn btn-fantasma btn-icone", "aria-label": "Próximo dia", onclick: () => ir(somarDias(dia, 1)) }, h("span", { style: { transform: "rotate(180deg)", display: "inline-flex" } }, icone("voltar"))),
          h("button", { class: "btn btn-primario", onclick: () => novoAgendamento(ctx, { dia }, carregar) }, icone("mais", 16), "Agendar"),
        ),
      ),
      corpo,
    ),
  );

  async function acaoStatus(a, status, texto) {
    await put(`/agendamentos/${a.id}`, { status });
    aviso(texto);
    carregar();
  }
  function abrirHorario(a) {
    const btns = [];
    const b = (t, cls, fn) => {
      const el = h("button", { class: `btn ${cls}` }, t);
      el.onclick = () =>
        acao(el, async () => {
          j.fechar();
          await fn();
        });
      btns.push(el);
    };
    if (a.status === "agendado") {
      b("Chegou", "btn-fantasma", () => acaoStatus(a, "chegou", `${a.cliente.nome} chegou.`));
      b("Faltou", "btn-perigo-fantasma", () => acaoStatus(a, "faltou", "Falta registrada."));
      b("Remarcar", "btn-fantasma", () => remarcar(a));
      b("Cancelar", "btn-perigo-fantasma", async () => (await confirmar(`Cancelar o horário de ${a.cliente.nome}? A vaga vai direto para a lista de espera.`, { botao: "Cancelar horário", perigo: true })) && acaoStatus(a, "cancelado", "Horário cancelado."));
    }
    if (["agendado", "chegou"].includes(a.status)) b("Na cadeira", "btn-primario", () => acaoStatus(a, "em_atendimento", "Atendimento começou."));
    if (["chegou", "em_atendimento"].includes(a.status)) b("Fechar comanda", "btn-sucesso", () => comanda(ctx, a, carregar));
    const j = janela({
      titulo: `${a.hora} · ${a.cliente.nome}`,
      largura: 520,
      conteudo: h(
        "div",
        { class: "pilha" },
        h("div", { class: "linha-entre" }, sit(a.status), h("span", { class: "suave pequeno" }, ORIGEM[a.origem])),
        h("dl", { class: "dados-lidos" }, h("dt", {}, "Serviço"), h("dd", {}, `${a.servico.nome} · ${a.servico.duracao_min} min`), h("dt", {}, "Barbeiro"), h("dd", {}, a.barbeiro.nome), h("dt", {}, "Valor"), h("dd", {}, a.clube ? "Pelo clube" : reais(a.preco_centavos)), a.cliente.fone ? [h("dt", {}, "Celular"), h("dd", {}, h("a", { href: `https://wa.me/${a.cliente.fone}`, target: "_blank", rel: "noopener" }, fone(a.cliente.fone)))] : null, a.observacao ? [h("dt", {}, "Obs."), h("dd", {}, a.observacao)] : null, a.reservas.length ? [h("dt", {}, "Reservou"), h("dd", {}, a.reservas.map((r) => `${r.quantidade}× ${r.nome}`).join(", "))] : null),
      ),
      acoes: btns,
    });
  }
  async function remarcar(a) {
    const d = entrada({ type: "date", value: a.dia, min: hojeISO() });
    const horas = h("div", { class: "horas-grade" });
    let escolhida = null;
    const atualizar = async () => {
      const r = await get(`/horarios?servico=${a.servico.id}&barbeiro=${a.barbeiro.id}&dia=${d.value}&ignorar=${a.id}`);
      limpar(horas, r.horarios.length ? r.horarios.map((hh) => h("button", { type: "button", class: "hora-btn", onclick: (e) => ((escolhida = hh), horas.querySelectorAll(".hora-btn").forEach((x) => x.classList.toggle("ativa", x === e.currentTarget))) }, hh)) : h("p", { class: "suave" }, "Sem horários livres neste dia."));
    };
    d.addEventListener("change", atualizar);
    const ok = h("button", { class: "btn btn-primario" }, "Remarcar");
    const j = janela({ titulo: `Remarcar ${a.cliente.nome}`, conteudo: h("div", { class: "pilha" }, d, horas), acoes: [ok] });
    ok.onclick = () =>
      acao(ok, async () => {
        if (!escolhida) throw new Error("Escolha o horário.");
        await put(`/agendamentos/${a.id}`, { dia: d.value, hora: escolhida });
        aviso("Remarcado.");
        j.fechar();
        carregar();
      });
    atualizar();
  }

  async function carregar() {
    history.replaceState(null, "", `#/hoje?dia=${dia}`);
    const d = await get(`/hoje?dia=${dia}`);
    area.querySelector("#titulo-dia").textContent = dia === hojeISO() ? "Agenda de hoje" : "Agenda";
    area.querySelector("#sub-dia").textContent = dataLonga(dia);
    const turnos = d.barbeiros.flatMap((b) => b.expediente);
    const ini = Math.min(...turnos.map(([a]) => minutos(a)), ...d.agendamentos.map((a) => minDoDia(a.inicio)), 9 * 60);
    const fim = Math.max(...turnos.map(([, b]) => minutos(b)), ...d.agendamentos.map((a) => minDoDia(a.fim)), 19 * 60);
    const comeco = Math.floor(ini / 60) * 60;
    const final = Math.ceil(fim / 60) * 60;
    const altura = (final - comeco) * PX;
    const chegaram = d.agendamentos.filter((a) => a.status === "chegou");
    const agoraMin = dia === hojeISO() ? minDoDia(Date.now()) : null;

    const regua = h("div", { class: "linha-tempo-regua", style: { height: `${altura}px` } }, Array.from({ length: (final - comeco) / 60 + 1 }, (_, i) => h("span", { style: { top: `${i * 60 * PX}px` } }, hhmm(comeco + i * 60))));
    const colunas = d.barbeiros.map((b) => {
      const meus = d.agendamentos.filter((a) => a.barbeiro.id === b.id && a.status !== "cancelado");
      const fora = [];
      let cursor = comeco;
      for (const [a, z] of [...b.expediente].sort()) {
        if (minutos(a) > cursor) fora.push([cursor, minutos(a)]);
        cursor = Math.max(cursor, minutos(z));
      }
      if (cursor < final) fora.push([cursor, final]);
      const bloqueios = d.bloqueios.filter((x) => !x.barbeiro_id || x.barbeiro_id === b.id);
      const col = h(
        "div",
        {
          class: "linha-tempo-coluna",
          style: { height: `${altura}px` },
          onclick: (e) => {
            if (e.target !== col) return;
            const m = comeco + Math.floor((e.offsetY / PX) / 15) * 15;
            novoAgendamento(ctx, { dia, barbeiroId: b.id, hora: hhmm(m) }, carregar);
          },
        },
        fora.map(([a, z]) => h("div", { class: "lt-fora", style: { top: `${(a - comeco) * PX}px`, height: `${(z - a) * PX}px` } })),
        bloqueios.map((x) => {
          const a = Math.max(comeco, x.inicio < Date.parse(`${dia}T00:00:00-03:00`) ? comeco : minDoDia(x.inicio));
          const z = Math.min(final, x.fim > Date.parse(`${dia}T23:59:00-03:00`) ? final : minDoDia(x.fim));
          return h("div", { class: "lt-bloqueio", style: { top: `${(a - comeco) * PX}px`, height: `${Math.max(14, (z - a) * PX)}px` } }, h("small", {}, x.motivo || "Bloqueado"));
        }),
        meus.map((a) => {
          const top = (minDoDia(a.inicio) - comeco) * PX;
          const alt = Math.max(30, ((a.fim - a.inicio) / 60_000) * PX - 3);
          return h(
            "button",
            { class: `lt-card st-${a.status}`, style: { top: `${top}px`, height: `${alt}px`, "--cor": b.cor }, onclick: () => abrirHorario(a) },
            h("div", { class: "lt-card-linha" }, h("strong", {}, a.hora), h("span", {}, a.cliente.nome), a.clube ? icone("coroa", 13) : null, a.origem === "espera" ? icone("raio", 13) : null),
            alt > 40 ? h("small", {}, a.servico.nome, a.status !== "agendado" ? ` · ${sit(a.status).textContent}` : "") : null,
          );
        }),
        agoraMin !== null && agoraMin >= comeco && agoraMin <= final ? h("div", { class: "lt-agora", style: { top: `${(agoraMin - comeco) * PX}px` } }) : null,
      );
      return h("div", { class: "linha-tempo-barbeiro" }, h("header", {}, h("span", { class: "bolinha", style: { background: b.cor } }), h("strong", {}, b.nome), h("small", {}, `${meus.filter((a) => a.status !== "faltou").length} hoje`)), col);
    });

    const r = d.resumo;
    const espera = ctx.pode("dono", "admin", "recepcao") && !ctx.oculto("modulo.espera") ? await get("/espera").catch(() => []) : [];
    const doDia = espera.filter((e) => e.dia === dia);
    limpar(
      corpo,
      h("div", { class: "indicadores" }, indicador("calendario", "Agendados", String(r.agendados)), indicador("check", "Concluídos", String(r.concluidos)), indicador("alerta", "Faltas", String(r.faltas)), r.faturado_centavos !== null ? indicador("dinheiro", "Faturado no dia", reais(r.faturado_centavos)) : null, indicador("grafico", "Ocupação", `${r.ocupacao}%`)),
      chegaram.length ? h("section", { class: "cartao chegaram" }, h("h3", {}, icone("sino", 16), ` Chegaram (${chegaram.length})`), h("div", { class: "chegaram-lista" }, chegaram.map((a) => h("button", { class: "btn btn-fantasma", onclick: () => abrirHorario(a) }, h("strong", {}, a.cliente.nome), ` · ${a.hora} com ${a.barbeiro.nome}`)))) : null,
      d.barbeiros.length ? h("section", { class: "cartao linha-tempo" }, h("div", { class: "linha-tempo-grade" }, regua, colunas)) : h("div", { class: "vazio" }, h("h3", {}, "Nenhum barbeiro ativo"), h("p", {}, "Cadastre os barbeiros em Configurações.")),
      doDia.length
        ? h(
            "section",
            { class: "cartao" },
            h("h3", {}, icone("fila", 16), ` Lista de espera deste dia (${doDia.length})`),
            h("p", { class: "suave pequeno" }, "Quando um horário é cancelado, quem está aqui recebe a vaga na hora pelo WhatsApp."),
            h("ul", { class: "lista-simples" }, doDia.map((e) => h("li", { class: "linha-entre" }, h("span", {}, h("strong", {}, e.cliente), ` · ${e.servico} · entre ${e.de} e ${e.ate}`), h("span", {}, sit(e.status), h("button", { class: "btn-icone", "aria-label": "Tirar da fila", onclick: async () => (await del(`/espera/${e.id}`), carregar()) }, icone("x", 14)))))),
          )
        : null,
    );
    const grade = corpo.querySelector(".linha-tempo-grade");
    const alvo = corpo.querySelector(".lt-agora") ?? corpo.querySelector(".lt-card");
    if (grade && alvo) grade.scrollTop = Math.max(0, alvo.offsetTop - 120);
    ctx.recarregarEu().catch(() => {});
  }
  await carregar();
  const t = setInterval(() => document.visibilityState === "visible" && carregar().catch(() => {}), 60_000);
  return () => clearInterval(t);
}
