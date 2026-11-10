/* Peças comuns do painel do Nexor Barber: situação do horário, novo agendamento, comanda e editor de expediente. */

import { get, post } from "./api.js";
import { acao, aviso, campo, debounce, entrada, h, icone, janela, limpar, reais, seletor } from "./ui.js";
import { descontoCentavos, paraCentavos } from "./comum.js";

export const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
export const somarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const diaSemana = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
export const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
export const dataLonga = (d) => `${DIAS[diaSemana(d)]}, ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const fone = (f) => (f ? `(${f.slice(2, 4)}) ${f.slice(4, -4)}-${f.slice(-4)}` : "");

const STATUS = {
  agendado: ["Agendado", "info"],
  chegou: ["Chegou", "alerta"],
  em_atendimento: ["Na cadeira", "ok"],
  concluido: ["Concluído", "ok"],
  cancelado: ["Cancelado", ""],
  faltou: ["Faltou", "perigo"],
  ativa: ["Ativa", "ok"],
  pendente: ["Aguardando pagamento", "alerta"],
  atrasada: ["Em atraso", "perigo"],
  cancelada: ["Cancelada", ""],
  aguardando: ["Na fila", "info"],
  oferecida: ["Vaga oferecida", "alerta"],
  paga: ["Paga", "ok"],
};
export function sit(chave, texto) {
  const [r, cor] = STATUS[chave] ?? [chave, ""];
  return h("span", { class: `chip ${cor ? `chip-${cor}` : ""}` }, texto ?? r);
}
export const ORIGEM = { app: "App", painel: "Balcão", espera: "Lista de espera" };

/** Busca de cliente com opção de cadastrar na hora (nome + celular) */
export function escolherCliente(aoEscolher) {
  const lista = h("div", { class: "busca-resultados" });
  const novoNome = entrada({ placeholder: "Nome" });
  const novoFone = entrada({ placeholder: "Celular com DDD (opcional)", inputmode: "tel" });
  let escolhido = null;
  const marcar = (c) => {
    escolhido = c;
    limpar(lista, h("div", { class: "cliente-escolhido" }, icone("check", 16), h("strong", {}, c.nome), c.fone ? h("small", {}, fone(c.fone)) : null, c.assinante ? h("span", { class: "chip chip-ok" }, "clube") : null));
    aoEscolher?.(c);
  };
  const buscar = debounce(async (t) => {
    if (t.length < 2) return limpar(lista);
    const r = await get(`/clientes?busca=${encodeURIComponent(t)}`);
    limpar(lista, r.slice(0, 6).map((c) => h("button", { type: "button", class: "busca-item", onclick: () => marcar(c) }, h("strong", {}, c.nome), h("small", {}, [c.fone ? fone(c.fone) : "sem celular", c.assinante ? " · clube" : ""]))), r.length ? null : h("p", { class: "suave pequeno" }, "Nenhum cliente. Cadastre abaixo."));
  });
  const busca = entrada({ placeholder: "Buscar por nome ou celular", oninput: (e) => buscar(e.target.value.trim()) });
  return {
    el: h("div", { class: "pilha" }, busca, lista, h("details", { class: "novo-cliente" }, h("summary", {}, "Cliente novo"), h("div", { class: "grade-2" }, novoNome, novoFone))),
    valor: () => (escolhido ? { cliente_id: escolhido.id } : novoNome.value.trim() ? { cliente: { nome: novoNome.value.trim(), fone: novoFone.value.trim() || null } } : null),
    definir: marcar,
  };
}

/** Novo agendamento pelo balcão: cliente, serviço, barbeiro, dia e horário (com encaixe) */
export async function novoAgendamento(ctx, { dia = hojeISO(), barbeiroId = null, hora = null, cliente = null } = {}, aoSalvar) {
  const [servicos, barbeiros] = await Promise.all([get("/servicos"), get("/barbeiros")]);
  const ativosS = servicos.filter((s) => s.ativo);
  const ativosB = barbeiros.filter((b) => b.ativo);
  const cli = escolherCliente();
  if (cli && cliente) cli.definir(cliente);
  const selS = seletor(ativosS.map((s) => [s.id, `${s.nome} · ${s.duracao_min} min · ${reais(s.preco_centavos)}`]), ativosS[0]?.id);
  const meu = ctx.barbeiro ? ctx.eu.usuario.barbeiro_id : barbeiroId;
  const selB = seletor([["", "Quem estiver livre"], ...ativosB.map((b) => [b.id, b.nome])], meu ?? "", { disabled: ctx.barbeiro });
  const selD = entrada({ type: "date", value: dia, min: hojeISO() });
  const horas = h("div", { class: "horas-grade" });
  const encaixe = h("input", { type: "checkbox" });
  const horaLivre = entrada({ type: "time", value: hora ?? "", hidden: true });
  const obs = entrada({ placeholder: "Observação (opcional)" });
  let horaEscolhida = hora;
  async function atualizar() {
    if (encaixe.checked) {
      horaLivre.hidden = false;
      return limpar(horas, h("p", { class: "suave pequeno" }, "Encaixe: escolha qualquer horário. Nunca fica por cima de outro cliente."));
    }
    horaLivre.hidden = true;
    limpar(horas, h("span", { class: "girando" }));
    const q = new URLSearchParams({ servico: selS.value, dia: selD.value, ...(selB.value ? { barbeiro: selB.value } : {}) });
    const r = await get(`/horarios?${q}`);
    if (!r.horarios.includes(horaEscolhida)) horaEscolhida = null;
    limpar(horas, r.horarios.length ? r.horarios.map((hh) => h("button", { type: "button", class: `hora-btn ${hh === horaEscolhida ? "ativa" : ""}`, onclick: (e) => ((horaEscolhida = hh), horas.querySelectorAll(".hora-btn").forEach((b) => b.classList.toggle("ativa", b === e.currentTarget))) }, hh)) : h("p", { class: "suave pequeno" }, "Sem horários livres neste dia. Use o encaixe ou outro dia."));
  }
  for (const el of [selS, selB, selD]) el.addEventListener("change", atualizar);
  encaixe.addEventListener("change", atualizar);
  const salvar = h("button", { class: "btn btn-primario" }, "Agendar");
  const j = janela({
    titulo: "Novo agendamento",
    largura: 640,
    conteudo: h("div", { class: "pilha" }, campo("Cliente", cli.el), h("div", { class: "grade-2" }, campo("Serviço", selS), campo("Barbeiro", selB)), campo("Dia", selD), horas, h("label", { class: "linha-check" }, encaixe, h("span", {}, "Encaixe fora do expediente"), horaLivre), obs),
    acoes: [salvar],
  });
  salvar.onclick = () =>
    acao(salvar, async () => {
      const c = cli.valor();
      if (!c) throw new Error("Escolha o cliente ou digite o nome de um cliente novo.");
      const horaFinal = encaixe.checked ? horaLivre.value : horaEscolhida;
      if (!horaFinal) throw new Error("Escolha o horário.");
      const a = await post("/agendamentos", { ...c, servico_id: selS.value, barbeiro_id: selB.value || null, dia: selD.value, hora: horaFinal, encaixe: encaixe.checked, observacao: obs.value.trim() || null });
      aviso(`Agendado: ${a.cliente.nome} às ${a.hora} com ${a.barbeiro.nome}.`);
      j.fechar();
      aoSalvar?.(a);
    });
  atualizar();
}

/** Lê o desconto da comanda: em reais ("5,00", "1.234,56") ou em % do subtotal ("10%"). Nunca negativo nem maior que a conta. */
export function lerDesconto(texto, subtotal) {
  const t = String(texto ?? "").trim().replace(/^R\$\s*/i, "");
  if (!t) return { centavos: 0 };
  if (t.startsWith("-")) return { erro: "O desconto não pode ser negativo." };
  const pct = /^(\d{1,3}(?:[.,]\d{1,2})?)\s*%$/.exec(t);
  if (pct) {
    const p = Number(pct[1].replace(",", "."));
    if (p > 100) return { erro: "O desconto não pode passar de 100%." };
    return { centavos: Math.round((subtotal * p) / 100), pct: p };
  }
  if (!/^(\d{1,3}(\.\d{3})+|\d+)([.,]\d{1,2})?$/.test(t)) return { erro: "Desconto inválido. Use números, por exemplo 5,00 ou 10%." };
  const centavos = Math.round(Number(t.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) * 100);
  if (centavos > subtotal) return { erro: `O desconto é maior que o total da comanda (${reais(subtotal)}).` };
  return { centavos };
}

/** Comanda: fecha o atendimento com o serviço, produtos reservados e extras, desconto e forma de pagamento */
export async function comanda(ctx, ag, aoSalvar) {
  const produtos = ctx.oculto("modulo.produtos") ? [] : (await get("/produtos").catch(() => [])).filter((p) => p.ativo && p.estoque > 0);
  const extras = [];
  const lista = h("div", { class: "comanda-itens" });
  const totalEl = h("strong", { class: "comanda-total" });
  const desconto = entrada({ placeholder: "0,00 ou 10%", inputmode: "decimal", class: "entrada entrada-pequena", "aria-describedby": "comanda-desconto-aviso" });
  const avisoDesconto = h("small", { class: "campo-erro", id: "comanda-desconto-aviso", role: "alert" });
  let subtotalAtual = 0;
  const formas = Object.entries(ctx.eu.formas).filter(([k]) => k !== "clube");
  // Reteste U-01: nenhuma forma vem marcada; a recepção escolhe e a escolhida aparece destacada
  let forma = null;
  const botoesForma = h("div", { class: "segmentado", role: "group", "aria-label": "Forma de pagamento" }, formas.map(([k, t]) => h("button", { type: "button", "aria-pressed": "false", onclick: (e) => ((forma = k), botoesForma.querySelectorAll("button").forEach((b) => (b.classList.toggle("ativo", b === e.currentTarget), b.setAttribute("aria-pressed", String(b === e.currentTarget))))) }, t)));
  const linha = (nome, valor, extra) => h("div", { class: "comanda-linha" }, h("span", {}, nome), h("span", {}, valor), extra ?? null);
  function render() {
    const servico = ag.clube ? 0 : ag.servico.preco_centavos;
    const reservados = ag.reservas.filter((r) => r.status === "reservado").reduce((s, r) => s + r.preco_centavos * r.quantidade, 0);
    const ext = extras.reduce((s, e) => s + e.preco_centavos * e.quantidade, 0);
    subtotalAtual = servico + reservados + ext;
    const d = lerDesconto(desconto.value, subtotalAtual);
    const desc = d.erro ? 0 : d.centavos;
    avisoDesconto.textContent = d.erro ?? (d.pct ? `${d.pct}% = ${reais(d.centavos)}` : "");
    avisoDesconto.className = d.erro ? "campo-erro" : "campo-ajuda";
    fechar.disabled = Boolean(d.erro);
    desconto.setAttribute("aria-invalid", d.erro ? "true" : "false");
    limpar(
      lista,
      linha(ag.servico.nome, ag.clube ? h("span", { class: "chip chip-ok" }, "pelo clube") : reais(servico)),
      ag.reservas.filter((r) => r.status === "reservado").map((r) => linha(`${r.quantidade}× ${r.nome} (reservado no app)`, reais(r.preco_centavos * r.quantidade))),
      extras.map((e, i) => linha(`${e.quantidade}× ${e.nome}`, reais(e.preco_centavos * e.quantidade), h("button", { class: "btn-icone", type: "button", "aria-label": "Tirar", onclick: () => (extras.splice(i, 1), render()) }, icone("x", 14)))),
    );
    totalEl.textContent = reais(Math.max(0, servico + reservados + ext - desc));
  }
  const selP = seletor([["", "Adicionar produto…"], ...produtos.map((p) => [p.id, `${p.nome} · ${reais(p.preco_centavos)} · ${p.disponivel} disp.`])], "", {
    onchange: (e) => {
      const p = produtos.find((x) => x.id === e.target.value);
      if (p) {
        const ja = extras.find((x) => x.id === p.id);
        if (ja) ja.quantidade++;
        else extras.push({ id: p.id, nome: p.nome, preco_centavos: p.preco_centavos, quantidade: 1 });
      }
      e.target.value = "";
      render();
    },
  });
  desconto.addEventListener("input", render);
  // "10%" vira o valor em reais ao sair do campo (o que vai para o servidor é sempre em reais)
  desconto.addEventListener("blur", () => {
    const d = lerDesconto(desconto.value, subtotalAtual);
    if (!d.erro && d.pct) desconto.value = (d.centavos / 100).toFixed(2).replace(".", ",");
    render();
  });
  const fechar = h("button", { class: "btn btn-sucesso" }, icone("check", 16), "Fechar comanda");
  const j = janela({
    titulo: `Comanda · ${ag.cliente.nome}`,
    largura: 560,
    conteudo: h("div", { class: "pilha" }, h("p", { class: "suave" }, `${ag.servico.nome} com ${ag.barbeiro.nome} · ${ag.hora}`), lista, produtos.length ? selP : null, h("div", { class: "grade-2" }, campo("Desconto (R$ ou %)", h("div", { class: "pilha", style: { gap: "4px" } }, desconto, avisoDesconto)), campo("Total", totalEl)), campo("Forma de pagamento", botoesForma), ag.clube ? h("p", { class: "suave pequeno" }, "O serviço já está coberto pelo clube. Se a comanda tiver só o serviço, ela fecha com valor zero.") : null),
    acoes: [fechar],
  });
  fechar.onclick = () =>
    acao(fechar, async () => {
      // Comanda de valor zero (só o serviço do clube) não precisa de forma de pagamento
      if (!forma && subtotalAtual > 0) throw new Error("Escolha a forma de pagamento.");
      const r = await post(`/agendamentos/${ag.id}/concluir`, { forma: forma ?? "pix", desconto_centavos: descontoCentavos(desconto.value), produtos: extras.map((e) => ({ id: e.id, quantidade: e.quantidade })) });
      aviso(`Comanda fechada: ${reais(r.venda.total_centavos)}.`);
      j.fechar();
      aoSalvar?.(r);
    });
  render();
}

/** Editor de expediente semanal: turnos por dia ("09:00–12:00, 13:00–19:00") */
export function editorHorario(tabela) {
  const linhas = [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const turnos = (tabela?.[d] ?? []).map(([a, b]) => `${a}-${b}`).join(", ");
    const e = entrada({ value: turnos, placeholder: "Fechado" });
    return { d, e, el: h("label", { class: "horario-linha" }, h("strong", {}, DIAS[d]), e) };
  });
  return {
    el: h("div", { class: "horario-editor" }, linhas.map((l) => l.el), h("small", { class: "campo-ajuda" }, "Turnos separados por vírgula, no formato 09:00-12:00. Vazio = fechado.")),
    ler() {
      const r = {};
      for (const { d, e } of linhas) {
        const v = e.value.trim();
        r[d] = v
          ? v.split(",").map((t) => {
              const m = /^\s*(\d{1,2}):(\d{2})\s*[-–a]\s*(\d{1,2}):(\d{2})\s*$/.exec(t);
              if (!m) throw new Error(`${DIAS[d]}: use o formato 09:00-12:00`);
              return [`${m[1].padStart(2, "0")}:${m[2]}`, `${m[3].padStart(2, "0")}:${m[4]}`];
            })
          : [];
      }
      return r;
    },
  };
}
