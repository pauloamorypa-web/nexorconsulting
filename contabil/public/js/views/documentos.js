/* Documentos: caixa de entrada (portal, WhatsApp e equipe), leitura da IA, conferência e pré-lançamentos. */

import { del, get, post, put } from "../api.js";
import { acao, aviso, dataHora, h, janela, limpar, reais } from "../ui.js";
import { botao, dataBR, deCentavos, formulario, mesBR, paraCentavos, tabela, topo } from "../comum.js";
import { ORIGEM, areaEnvio, enviarArquivo, nomeCliente, sit } from "../base.js";

let ctxAtual;
let filtro = "novo";
export async function render(raiz, ctx, [id]) {
  ctxAtual = ctx;
  if (id) return detalhe(raiz, id);
  const clientes = await get("/clientes");
  const selCliente = h("select", { class: "entrada" }, h("option", { value: "" }, "Todos os clientes"), clientes.map((c) => h("option", { value: c.id }, nomeCliente(c))));
  const corpo = h("div");
  const filtros = [["novo", "A conferir"], ["alertas", "Com alertas"], ["sem_cliente", "Sem cliente"], ["conferido", "Conferidos"], ["rejeitado", "Rejeitados"], ["", "Todos"]];
  const chips = h("div", { class: "filtros" });
  const carregar = async () => {
    limpar(chips, filtros.map(([k, t]) => h("button", { class: `chip clicavel ${k === filtro ? "ativo" : ""}`, onclick: () => ((filtro = k), carregar()) }, t)), selCliente);
    const q = new URLSearchParams();
    if (filtro === "alertas") q.set("alertas", "1"), q.set("status", "novo");
    else if (filtro === "sem_cliente") q.set("sem_cliente", "1");
    else if (filtro) q.set("status", filtro);
    if (selCliente.value) q.set("cliente", selCliente.value);
    const lista = await get(`/documentos?${q}`);
    limpar(
      corpo,
      tabela(
        [
          { titulo: "Recebido", valor: (d) => dataHora(d.criado_em) },
          { titulo: "Cliente", valor: (d) => d.cliente ?? h("span", { class: "prazo-atrasado" }, "Sem cliente") },
          { titulo: "Arquivo", valor: (d) => h("div", {}, d.nome, d.alertas.length ? h("small", { style: { display: "block", color: "var(--amarelo)" } }, `${d.alertas.length} alerta(s)`) : null) },
          { titulo: "Origem", valor: (d) => ORIGEM[d.origem] },
          { titulo: "Tipo", valor: (d) => (d.tipo ? ctx.eu.catalogos.tipos[d.tipo] ?? d.tipo : "—") },
          { titulo: "Competência", valor: (d) => (d.competencia ? mesBR(d.competencia) : "—") },
          { titulo: "Leitura", valor: (d) => sit(d.leitura_status) },
          { titulo: "Situação", valor: (d) => sit(d.status) },
        ],
        lista,
        { aoClicar: (d) => ctx.navegar(`documentos/${d.id}`), vazio: filtro === "novo" ? "Nada para conferir. 🎉" : "Nenhum documento." },
      ),
    );
  };
  selCliente.addEventListener("change", carregar);
  raiz.append(h("div", { class: "pagina" }, topo("Documentos", "Tudo que os clientes enviaram pelo portal, pelo WhatsApp ou pela equipe", botao("Enviar documentos", () => enviar(clientes, carregar), "btn-primario", "upload")), h("section", { class: "cartao" }, chips, h("div", { style: { marginTop: "12px" } }, corpo))));
  await carregar();
  // Atualiza enquanto a IA lê
  const t = setInterval(() => document.visibilityState === "visible" && !document.querySelector(".modal-fundo") && carregar().catch(() => {}), 15_000);
  return () => clearInterval(t);
}

function enviar(clientes, depois) {
  const f = formulario([{ nome: "cliente", rotulo: "Cliente", tipo: "select", obrigatorio: true, opcoes: [["", "Escolha"], ...clientes.filter((c) => c.ativo).map((c) => [c.id, nomeCliente(c)])], largura: 2 }, { nome: "competencia", rotulo: "Competência (opcional)", tipo: "mes", largura: 2 }]);
  const status = h("div", { class: "pilha pequeno" });
  const { fechar } = janela({
    titulo: "Enviar documentos",
    conteudo: h(
      "div",
      { class: "pilha" },
      f.el,
      areaEnvio(async (arquivos) => {
        let d;
        try {
          d = f.ler();
        } catch (e) {
          return aviso(e.message, "erro");
        }
        for (const a of arquivos) {
          const linha = h("div", {}, `⏳ ${a.name}`);
          status.append(linha);
          try {
            await enviarArquivo(`/documentos?cliente=${d.cliente}${d.competencia ? `&competencia=${d.competencia}` : ""}`, a);
            linha.textContent = `✅ ${a.name}`;
          } catch (e) {
            linha.textContent = `❌ ${a.name}: ${e.message}`;
          }
        }
        depois();
      }),
      status,
    ),
    acoes: [{ texto: "Fechar", classe: "btn-fantasma", fn: () => fechar() }],
  });
}

async function previa(d) {
  const r = await fetch(`/api/documentos/${d.id}/arquivo`, { credentials: "same-origin" });
  if (!r.ok) return h("p", { class: "suave" }, "Não foi possível abrir o arquivo.");
  const url = URL.createObjectURL(await r.blob());
  if (d.mime === "application/pdf") return h("iframe", { class: "doc-previa", src: url, title: d.nome });
  if (d.mime?.startsWith("image/")) return h("img", { class: "doc-previa-img", src: url, alt: d.nome });
  return h("p", { class: "suave" }, "Pré-visualização indisponível para este tipo. ", h("a", { href: url, download: d.nome }, "Baixar o arquivo"));
}

async function detalhe(raiz, id) {
  const d = await get(`/documentos/${id}`);
  const clientes = await get("/clientes");
  const recarregar = () => detalhe(limpar(raiz), id);
  const l = d.leitura;
  const linha = (r, v) => (v === null || v === undefined || v === "" ? null : [h("dt", {}, r), h("dd", {}, v)]);
  const contas = Object.values(ctxAtual.eu.escritorio.config.contas ?? {});
  const lista = h("datalist", { id: "contas" }, contas.map((c) => h("option", { value: c })));
  const salvarLanc = (lc, campo, valor) => acao(null, async () => (await put(`/lancamentos/${lc.id}`, { [campo]: valor }), campo === "debito" || campo === "credito" ? aviso("Conta salva. O sistema vai sugerir esta conta nos próximos documentos deste emitente.", "info") : null));
  const editavel = (lc, campo, tipo = "text") => h("input", { class: "entrada", type: tipo, list: campo === "debito" || campo === "credito" ? "contas" : undefined, value: campo === "valor_centavos" ? deCentavos(lc.valor_centavos) : lc[campo], disabled: lc.status === "exportado", onchange: (e) => salvarLanc(lc, campo, campo === "valor_centavos" ? paraCentavos(e.target.value) : e.target.value) });
  const novoLanc = () => {
    const f = formulario([{ nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true }, { nome: "valor_centavos", rotulo: "Valor (R$)", tipo: "reais", obrigatorio: true }, { nome: "debito", rotulo: "Débito", obrigatorio: true, largura: 2 }, { nome: "credito", rotulo: "Crédito", obrigatorio: true, largura: 2 }, { nome: "historico", rotulo: "Histórico", obrigatorio: true, largura: 2 }], { data: l?.data_emissao ?? "" });
    janela({ titulo: "Novo lançamento", conteudo: f.el, acoes: [{ texto: "Adicionar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post("/lancamentos", { ...f.ler(), documento_id: d.id }), fechar(), recarregar())) }] });
  };
  const rejeitar = () => {
    const motivo = h("input", { class: "entrada", placeholder: "Ex.: extrato cortado, falta a página 2" });
    janela({ titulo: "Rejeitar documento", conteudo: h("div", { class: "pilha" }, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Motivo (o cliente vê no portal)"), motivo), h("p", { class: "suave pequeno" }, "A pendência ligada a este documento volta para a cobrança.")), acoes: [{ texto: "Rejeitar", classe: "btn-perigo", fn: (e, fechar) => acao(e.currentTarget, async () => (await post(`/documentos/${d.id}/rejeitar`, { motivo: motivo.value }), fechar(), recarregar())) }] });
  };
  const selCliente = h("select", { class: "entrada", onchange: (e) => acao(null, async () => (await put(`/documentos/${d.id}`, { cliente_id: e.target.value }), aviso("Cliente definido. A IA vai ler o documento."), recarregar())) }, h("option", { value: "" }, "Escolha o cliente"), clientes.map((c) => h("option", { value: c.id, selected: c.id === d.cliente_id }, nomeCliente(c))));
  const selPend = h("select", { class: "entrada", onchange: (e) => e.target.value && acao(null, async () => (await put(`/documentos/${d.id}`, { pendencia_id: e.target.value }), aviso("Pendência cumprida."), recarregar())) }, h("option", { value: "" }, d.pendencia_id ? "Pendência ligada" : "Cumprir uma pendência…"), d.pendencias.map((p) => h("option", { value: p.id, selected: p.id === d.pendencia_id }, `${p.nome} · ${mesBR(p.competencia)}`)));
  const comp = h("input", { class: "entrada", type: "month", value: d.competencia ?? "", onchange: (e) => acao(null, async () => (await put(`/documentos/${d.id}`, { competencia: e.target.value }), aviso("Competência salva."))) });
  const total = d.lancamentos.reduce((s, x) => s + x.valor_centavos, 0);
  limpar(
    raiz,
    h(
      "div",
      { class: "pagina" },
      h("a", { href: "#/documentos", class: "btn-link", style: { justifySelf: "start" } }, "← Documentos"),
      topo(
        d.nome,
        `${d.cliente ?? "Sem cliente"} · ${ORIGEM[d.origem]}${d.enviado_por ? ` (${d.enviado_por})` : ""} · ${dataHora(d.criado_em)}`,
        d.status === "novo" ? botao("Rejeitar", rejeitar, "btn-perigo-fantasma") : null,
        d.cliente_id && ctxAtual.eu.ia ? botao("Ler de novo", (e) => acao(e.currentTarget, async () => (await post(`/documentos/${d.id}/ler`), aviso("Na fila da IA."), setTimeout(recarregar, 2500))), "btn-fantasma", "ia") : null,
        d.status === "novo" ? botao("Conferido", (e) => acao(e.currentTarget, async () => (await post(`/documentos/${d.id}/conferir`), aviso("Documento conferido. Lançamentos aprovados para exportar."), recarregar())), "btn-primario", "check") : sit(d.status),
      ),
      h(
        "div",
        { class: "doc-grade" },
        h("section", { class: "cartao" }, await previa(d)),
        h(
          "div",
          { class: "pilha" },
          h("section", { class: "cartao pilha" }, h("h2", {}, "Classificação"), h("div", { class: "filtros" }, selCliente, comp), d.cliente_id ? selPend : null, d.motivo ? h("p", { class: "prazo-atrasado" }, `Rejeitado: ${d.motivo}`) : null),
          d.alertas.length ? h("section", { class: "cartao pilha" }, h("h2", {}, "Confira"), h("ul", { class: "alerta-lista" }, d.alertas.map((a) => h("li", {}, a)))) : null,
          h(
            "section",
            { class: "cartao pilha" },
            h("div", { class: "cartao-topo" }, h("h2", {}, "Leitura da IA"), sit(d.leitura_status)),
            l
              ? h("dl", { class: "dados-lidos" }, linha("Tipo", ctxAtual.eu.catalogos.tipos[l.tipo]), linha("Emitente", [l.emitente_nome, l.emitente_cnpj].filter(Boolean).join(" · ")), linha("Destinatário", [l.destinatario_nome, l.destinatario_cnpj].filter(Boolean).join(" · ")), linha("Número", l.numero), linha("Emissão", dataBR(l.data_emissao)), linha("Vencimento", l.data_vencimento ? dataBR(l.data_vencimento) : null), linha("Valor", l.valor_total !== null ? reais(Math.round(l.valor_total * 100)) : null), linha("Banco", l.banco), linha("Movimentos", l.movimentos.length ? String(l.movimentos.length) : null), linha("Descrição", l.descricao), linha("Confiança", l.confianca))
              : h("p", { class: "suave" }, d.leitura_status === "sem_ia" ? (d.cliente_id ? "Este tipo de arquivo não é lido pela IA. Confira e lance manualmente." : "Escolha o cliente para a IA ler o documento.") : d.leitura_status === "erro" ? "A leitura falhou. Clique em Ler de novo." : "A IA está lendo este documento…"),
          ),
        ),
      ),
      h(
        "section",
        { class: "cartao" },
        lista,
        h("div", { class: "cartao-topo" }, h("h2", {}, `Pré-lançamentos (${d.lancamentos.length}) · ${reais(total)}`), d.cliente_id ? botao("Adicionar", novoLanc, "btn-fantasma btn-pequeno", "mais") : null),
        d.lancamentos.length
          ? h(
              "div",
              { class: "tabela-rolagem" },
              h(
                "table",
                { class: "tabela lanc-tabela" },
                h("thead", {}, h("tr", {}, ["Data", "Débito", "Crédito", "Valor", "Histórico", "Situação", ""].map((x) => h("th", {}, x)))),
                h(
                  "tbody",
                  {},
                  d.lancamentos.map((lc) =>
                    h("tr", {}, h("td", {}, editavel(lc, "data", "date")), h("td", {}, editavel(lc, "debito")), h("td", {}, editavel(lc, "credito")), h("td", {}, editavel(lc, "valor_centavos")), h("td", {}, editavel(lc, "historico"), lc.conciliado_com ? h("div", { class: "lanc-conc" }, "✓ conciliado com documento") : null), h("td", {}, sit(lc.status)), h("td", {}, lc.status !== "exportado" ? botao("Excluir", (e) => acao(e.currentTarget, async () => (await del(`/lancamentos/${lc.id}`), recarregar())), "btn-fantasma btn-pequeno") : null)),
                  ),
                ),
              ),
            )
          : h("p", { class: "suave" }, "Nenhum lançamento sugerido para este documento."),
        h("p", { class: "suave pequeno" }, "As contas sugeridas vêm do plano configurado em Configurações → Exportação e contas. Ao trocar uma conta, o sistema aprende para os próximos documentos do mesmo emitente ou histórico."),
      ),
    ),
  );
}
