/* Instaladores (vínculos): pedidos para aprovar ou recusar, tabela de preço, limite de crédito, bloqueio e score. */

import { h, limpar, topo, abas, tabela, janela, botao, reais, numero, situacao, seletor, campo, entrada, aviso, perguntar, anelScore, cnpjBR, cidadeBonita, dataHora, paraCentavos, deCentavos, vazio, carregandoBloco } from "../../comum/ui.js";
import { pode } from "../permissoes.js";

export async function telaInstaladores({ eu, api, query }) {
  const podeVinculos = pode(eu, "vinculos");
  const podeCredito = pode(eu, "credito");
  let aba = query.get("aba") ?? "";
  let vinculos = [];
  let tabelas = [];
  const corpo = h("div");
  const barraAbas = h("div");

  async function carregar() {
    [vinculos, tabelas] = await Promise.all([api.get("/vinculos"), api.get("/tabelas")]);
    if (!aba) aba = vinculos.some((v) => v.status === "pendente") ? "pendente" : "aprovado";
    pintar();
  }
  const nomeInst = (v) => v.instalador?.nome_fantasia || v.instalador?.razao_social;

  function pintar() {
    const n = (st) => vinculos.filter((v) => v.status === st).length;
    const bloqueados = vinculos.filter((v) => v.status === "aprovado" && v.credito?.bloqueado).length;
    limpar(
      barraAbas,
      abas(
        [
          ["pendente", "Pedidos", n("pendente")],
          ["aprovado", "Aprovados", n("aprovado")],
          ["bloqueado", "Bloqueados", bloqueados],
          ["recusado", "Recusados", n("recusado")],
        ],
        aba,
        (id) => ((aba = id), pintar()),
      ),
    );
    const lista = aba === "bloqueado" ? vinculos.filter((v) => v.status === "aprovado" && v.credito?.bloqueado) : vinculos.filter((v) => v.status === aba);
    if (!lista.length) {
      const textos = { pendente: ["Nenhum pedido de vínculo", "Quando um instalador com CNAE compatível pedir para comprar de você, o pedido aparece aqui."], aprovado: ["Nenhum instalador aprovado", null], bloqueado: ["Nenhum instalador bloqueado", "Instaladores com título vencido são bloqueados automaticamente para novas reservas."], recusado: ["Nenhum vínculo recusado", null] };
      return limpar(corpo, vazio("pessoas", ...textos[aba]));
    }
    limpar(
      corpo,
      tabela(
        [
          { titulo: "Instalador", valor: (v) => h("div", {}, h("span", { class: "celula-forte" }, nomeInst(v)), h("span", { class: "celula-sub" }, `${cnpjBR(v.instalador?.cnpj)} · ${cidadeBonita(v.instalador?.cidade)}/${v.instalador?.uf ?? ""}`)) },
          { titulo: "CNAEs compatíveis", valor: (v) => h("span", { class: "mono" }, (v.cnaes_compativeis ?? []).join(", ") || "—") },
          { titulo: "Score", valor: (v) => h("button", { type: "button", class: "btn-icone", style: { width: "auto", height: "auto" }, "aria-label": `Ver o score de ${nomeInst(v)}: ${v.score}`, onclick: () => verScore(v) }, anelScore(v.score)) },
          aba !== "pendente" && aba !== "recusado" && { titulo: "Tabela", valor: (v) => v.tabela?.nome ?? h("span", { class: "suave" }, "Preço base") },
          aba !== "pendente" && aba !== "recusado" && {
            titulo: "Crédito",
            valor: (v) => h("div", {}, h("span", { class: "celula-forte" }, `${reais(v.credito?.disponivel_centavos)} disponível`), h("span", { class: "celula-sub" }, `limite ${reais(v.credito?.limite_centavos)} · em aberto ${reais(v.credito?.em_aberto_centavos)}`)),
          },
          {
            titulo: "Situação",
            valor: (v) =>
              h(
                "div",
                { class: "pilha", style: { gap: "4px", justifyItems: "end" } },
                h("div", {}, situacao(v.status), v.credito?.bloqueado ? situacao("bloqueado") : null),
                v.credito?.bloqueio_inadimplencia ? h("span", { class: "celula-sub perigo" }, `${v.credito.vencidos} título(s) vencido(s) · ${reais(v.credito.vencidos_centavos)}`) : null,
                v.credito?.bloqueio_manual && v.credito?.motivo ? h("span", { class: "celula-sub" }, v.credito.motivo) : null,
                v.status === "pendente" ? h("span", { class: "celula-sub" }, `pedido em ${dataHora(v.criado_em)}`) : null,
                v.status === "recusado" && v.motivo ? h("span", { class: "celula-sub" }, v.motivo) : null,
              ),
          },
          (podeVinculos || podeCredito) && { titulo: "Ações", classe: "acoes-celula", valor: acoes },
        ].filter(Boolean),
        lista,
        { rotulo: "Instaladores vinculados" },
      ),
    );
  }

  function acoes(v) {
    const nome = nomeInst(v);
    const b = [];
    if (v.status !== "aprovado" && podeVinculos) b.push(botao("Aprovar", () => aprovar(v), "btn-pequeno btn-sucesso", "check", { "aria-label": `Aprovar ${nome}` }));
    if (v.status === "pendente" && podeVinculos)
      b.push(
        botao("Recusar", async () => {
          const motivo = await perguntar(`Recusar o vínculo com ${nome}? O instalador recebe o aviso.`, { titulo: "Recusar vínculo", botao: "Recusar", perigo: true });
          if (motivo === null) return;
          await api.post(`/vinculos/${v.id}/recusar`, motivo ? { motivo } : {});
          aviso("Vínculo recusado.");
          carregar();
        }, "btn-pequeno btn-perigo-fantasma", null, { "aria-label": `Recusar ${nome}` }),
      );
    if (v.status === "aprovado") {
      if (podeVinculos) b.push(botao("Tabela", () => trocarTabela(v), "btn-pequeno", "etiqueta", { "aria-label": `Tabela de preço de ${nome}` }));
      if (podeCredito) {
        b.push(botao("Limite", () => definirLimite(v), "btn-pequeno", "carteira", { "aria-label": `Limite de crédito de ${nome}` }));
        if (v.credito?.bloqueio_manual)
          b.push(
            botao("Desbloquear", async () => {
              const r = await api.post(`/vinculos/${v.id}/desbloquear`);
              aviso(r.credito?.bloqueio_inadimplencia ? "Bloqueio manual retirado, mas o título vencido continua bloqueando. Dê baixa em Financeiro." : "Instalador desbloqueado.", r.credito?.bloqueio_inadimplencia ? "info" : "ok", 6500);
              carregar();
            }, "btn-pequeno", "aberto", { "aria-label": `Desbloquear ${nome}` }),
          );
        else
          b.push(
            botao("Bloquear", async () => {
              const motivo = await perguntar(`Bloquear novas reservas de ${nome}? As propostas já enviadas continuam valendo.`, { titulo: "Bloquear instalador", botao: "Bloquear", perigo: true });
              if (motivo === null) return;
              await api.post(`/vinculos/${v.id}/bloquear`, motivo ? { motivo } : {});
              aviso("Instalador bloqueado para novas reservas.");
              carregar();
            }, "btn-pequeno btn-perigo-fantasma", "cadeado", { "aria-label": `Bloquear ${nome}` }),
          );
      }
    }
    return h("div", { class: "acoes-linha" }, b);
  }

  const opcoesTabela = () => [["", "Preço base (sem tabela)"], ...tabelas.filter((t) => t.ativo).map((t) => [t.id, t.tipo === "desconto" ? `${t.nome} (−${String(t.desconto_pct).replace(".", ",")}%)` : t.nome])];

  function aprovar(v) {
    const tb = seletor(opcoesTabela(), "");
    const limite = entrada({ inputmode: "decimal", placeholder: "0,00" });
    janela({
      titulo: `Aprovar ${nomeInst(v)}`,
      largura: 500,
      conteudo: h(
        "div",
        { class: "pilha" },
        h("p", { class: "pequeno" }, "CNAEs compatíveis: ", h("strong", { class: "mono" }, (v.cnaes_compativeis ?? []).join(", ") || "nenhum"), ` · score ${v.score}`),
        campo("Tabela de preço", tb),
        podeCredito ? campo("Limite de crédito (R$)", limite, "Compra a prazo além do split. Deixe em branco para não dar crédito.") : h("p", { class: "pequeno suave" }, "O limite de crédito é definido pelo financeiro."),
      ),
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, fechar) => fechar() },
        {
          texto: "Aprovar vínculo",
          classe: "btn-sucesso",
          fn: async (_, fechar) => {
            const corpoV = { tabela_id: tb.value || null };
            if (podeCredito && limite.value.trim()) {
              const c = paraCentavos(limite.value);
              if (c === null) throw new Error("Limite de crédito inválido. Use o formato 1.500,00.");
              corpoV.limite_credito_centavos = c;
            }
            await api.post(`/vinculos/${v.id}/aprovar`, corpoV);
            fechar();
            aviso("Vínculo aprovado. O catálogo já está liberado para o instalador.");
            aba = "aprovado";
            carregar();
          },
        },
      ],
    });
  }
  function trocarTabela(v) {
    const tb = seletor(opcoesTabela(), v.tabela?.id ?? "");
    janela({
      titulo: `Tabela de ${nomeInst(v)}`,
      largura: 460,
      conteudo: campo("Tabela de preço", tb, "Vale para as próximas propostas. As já enviadas mantêm o preço."),
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, fechar) => fechar() },
        { texto: "Salvar", classe: "btn-primario", fn: async (_, fechar) => (await api.put(`/vinculos/${v.id}/tabela`, { tabela_id: tb.value || null }), fechar(), aviso("Tabela atualizada."), carregar()) },
      ],
    });
  }
  function definirLimite(v) {
    const limite = entrada({ inputmode: "decimal", value: deCentavos(v.credito?.limite_centavos ?? 0) });
    janela({
      titulo: `Limite de crédito · ${nomeInst(v)}`,
      largura: 460,
      conteudo: h("div", { class: "pilha" }, h("p", { class: "pequeno suave" }, `Em aberto agora: ${reais(v.credito?.em_aberto_centavos)}.`), campo("Limite (R$)", limite, "Usado quando a compra não é liquidada pelo split (títulos a prazo).")),
      acoes: [
        { texto: "Cancelar", classe: "btn-fantasma", fn: (_, fechar) => fechar() },
        {
          texto: "Salvar limite",
          classe: "btn-primario",
          fn: async (_, fechar) => {
            const c = paraCentavos(limite.value || "0");
            if (c === null) throw new Error("Limite inválido. Use o formato 1.500,00.");
            await api.put(`/vinculos/${v.id}/credito`, { limite_credito_centavos: c });
            fechar();
            aviso("Limite de crédito salvo.");
            carregar();
          },
        },
      ],
    });
  }
  async function verScore(v) {
    const conteudo = h("div", {}, carregandoBloco());
    janela({ titulo: `Score · ${nomeInst(v)}`, largura: 520, conteudo });
    try {
      const s = await api.get(`/instaladores/${v.instalador.id}/score`);
      limpar(
        conteudo,
        h(
          "div",
          { class: "pilha" },
          h("div", { class: "linha-entre", style: { justifyContent: "flex-start", gap: "18px" } }, anelScore(s.score, true), h("p", { class: "suave pequeno", style: { flex: "1", minWidth: "180px" } }, "De 0 a 100: conversão das propostas, pagamentos em dia e volume dos últimos 90 dias. Use para decidir crédito e tabela.")),
          h("h3", {}, "Conversão"),
          h("div", { class: "dados" }, dado("Propostas enviadas", numero(s.conversao?.enviadas)), dado("Pagas", numero(s.conversao?.pagas)), dado("Taxa", `${numero(s.conversao?.taxa_pct)}%`), dado("Com você", `${numero(s.conversao?.com_voce?.pagas)} de ${numero(s.conversao?.com_voce?.enviadas)}`)),
          h("h3", {}, "Pagamentos"),
          h("div", { class: "dados" }, dado("Títulos pagos", numero(s.pagamentos?.titulos_pagos)), dado("Em dia", numero(s.pagamentos?.em_dia)), dado("Vencidos em aberto", numero(s.pagamentos?.vencidos_abertos)), dado("Pontualidade", `${numero(s.pagamentos?.pontualidade_pct)}%`)),
          h("h3", {}, "Volume em 90 dias"),
          h("div", { class: "dados" }, dado("Valor", reais(s.volume_90d?.centavos)), dado("Propostas pagas", numero(s.volume_90d?.propostas_pagas))),
        ),
      );
    } catch (e) {
      limpar(conteudo, h("p", { class: "perigo" }, e.message));
    }
  }

  await carregar();
  return h(
    "div",
    { class: "pagina" },
    topo("Instaladores", "Quem compra de você pela rede: aprovação, tabela de preço, crédito e bloqueio."),
    h("section", { class: "cartao pilha" }, barraAbas, corpo),
  );
}

const dado = (rotulo, valor) => h("div", { class: "dado" }, h("small", {}, rotulo), h("strong", {}, valor));
