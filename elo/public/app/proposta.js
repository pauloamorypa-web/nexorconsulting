/* Propostas: lista, montagem (o fluxo mais importante: rápido no celular), calculadora de precificação
   embutida, envio com reserva de estoque, compartilhamento do link e detalhe com status e divisão do pagamento. */
import { area, aviso, botao, botaoConfirma, campo, chip, chipProposta, copiar, dataCurta, dataHora, debounce, diaBR, entrada, entradaDinheiro, foneBR, h, hojeBR, ic, janela, limpar, linkWhatsApp, pct, reais, seletor, somarDias, STATUS_PROPOSTA, vazio } from "./nucleo.js";
import { get, guardarRascunho, ir, itemDeOferta, nomeEmpresa, post, put, rascunho } from "./estado.js";
import { formCliente } from "./telas.js";

const CONDICOES = "Pagamento à vista no Pix ou boleto, ou no cartão em até 12x.";
const GARANTIA = "12 meses nos equipamentos (garantia do fabricante) e 6 meses na instalação.";
const ROTULO_TIPO = { fornecedor: "Fornecedor", proprio: "Item próprio", servico: "Serviço" };

/* ---------- Lista ---------- */
export async function telaPropostas(el, _p, q) {
  const status = q.get("status") ?? "";
  const lista = await get(`/propostas${status ? `?status=${status}` : ""}`);
  const busca = entrada({ type: "search", placeholder: "Buscar por cliente ou título", "aria-label": "Buscar propostas" });
  const caixa = h("div", { class: "cartao" });
  const desenharLista = () => {
    const t = busca.value.trim().toLowerCase();
    const f = lista.filter((p) => !t || `${p.titulo} ${p.cliente ?? ""} ${p.numero}`.toLowerCase().includes(t));
    limpar(caixa, f.length ? f.map(linhaProposta) : vazio("proposta", "Nenhuma proposta aqui", status ? "Tente outro filtro." : "Monte a primeira em menos de 2 minutos.", h("a", { class: "btn btn-cor", href: "#/propostas/nova" }, ic("mais", 18), "Nova proposta")));
  };
  busca.addEventListener("input", desenharLista);
  const filtros = [["", "Todas"], ...Object.entries(STATUS_PROPOSTA).map(([k, [r]]) => [k, r])];
  limpar(
    el,
    h("div", { class: "secao" }, h("div", { class: "filtros", role: "group", "aria-label": "Filtrar por status" }, filtros.map(([k, r]) => h("button", { type: "button", class: "filtro", "aria-pressed": String(k === status), onclick: () => ir(`propostas${k ? `?status=${k}` : ""}`) }, r))), h("div", { class: "busca" }, ic("busca", 18), busca), caixa),
  );
  desenharLista();
}
function linhaProposta(p) {
  return h(
    "a",
    { class: "item cartao-link", href: `#/propostas/${p.id}` },
    h("div", { class: "miniatura", "aria-hidden": "true" }, h("strong", {}, `#${p.numero}`)),
    h("div", { class: "meio" }, h("strong", { class: "quebra" }, p.titulo), h("div", { class: "pequeno suave quebra" }, `${p.cliente ?? "Sem cliente"} · ${dataCurta(p.enviada_em ?? p.criado_em)}`)),
    h("div", { class: "direita" }, h("div", { class: "numero" }, h("strong", {}, reais(p.total_centavos))), chipProposta(p.status)),
  );
}

/* ---------- Montagem ---------- */
function prefsCalc() {
  try {
    return { regime: "simples", anexo: "III", aliquota_pct: 6, iss_pct: 3, taxa_meio_pct: 0, taxa_meio_fixa_centavos: 199, margem_pct: 20, ...JSON.parse(localStorage.getItem("nx-elo-calc") ?? "{}") };
  } catch {
    return { regime: "simples", anexo: "III", aliquota_pct: 6, iss_pct: 3, taxa_meio_pct: 0, taxa_meio_fixa_centavos: 199, margem_pct: 20 };
  }
}
function guardarPrefs(c) {
  try {
    const { mao_obra_centavos, deslocamento_centavos, ...resto } = c;
    localStorage.setItem("nx-elo-calc", JSON.stringify(resto));
  } catch {
    /* sem armazenamento */
  }
}
const novoEstado = () => ({ id: null, cliente_id: null, titulo: "", validade_dia: somarDias(hojeBR(), 15), condicoes: CONDICOES, garantia: GARANTIA, observacoes: "", desconto_centavos: 0, itens: [] });
function deServidor(p) {
  return {
    id: p.id, numero: p.numero, cliente_id: p.cliente_id, titulo: p.titulo, validade_dia: p.validade_dia, condicoes: p.condicoes ?? "", garantia: p.garantia ?? "", observacoes: p.observacoes ?? "", desconto_centavos: p.desconto_centavos ?? 0,
    itens: p.itens.map((i) => ({ tipo: i.tipo, produto_id: i.produto_id, fornecedor_id: i.fornecedor_id, fornecedor: i.fornecedor, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, foto_url: i.foto_url, quantidade: i.quantidade, custo_unit_centavos: i.custo_unit_centavos, preco_unit_centavos: i.preco_unit_centavos })),
  };
}
const paraApi = (i) =>
  i.tipo === "fornecedor"
    ? { tipo: "fornecedor", produto_id: i.produto_id, quantidade: i.quantidade, preco_unit_centavos: i.preco_unit_centavos, ...(i.descricao ? { descricao: i.descricao.slice(0, 200) } : {}) }
    : { tipo: i.tipo, descricao: (i.descricao || (i.tipo === "servico" ? "Serviço" : "Item")).slice(0, 200), quantidade: i.quantidade, preco_unit_centavos: i.preco_unit_centavos, custo_unit_centavos: i.custo_unit_centavos || 0, ...(i.unidade ? { unidade: i.unidade.slice(0, 10) } : {}) };

export async function telaEditor(el, id) {
  let E = rascunho();
  if (id) {
    if (E?.id !== id) {
      const p = await get(`/propostas/${id}`);
      if (p.status !== "rascunho") {
        aviso("Esta proposta já foi enviada. Reabra para editar.", true);
        return ir(`propostas/${id}`);
      }
      E = deServidor(p);
    }
  } else if (E?.id) E = null;
  E = { ...novoEstado(), ...(E ?? {}) };
  // A chave nasce com o rascunho e fica salva no aparelho: outra aba que abrir o mesmo rascunho usa a mesma chave
  if (!E.id && !E.chave) E.chave = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`).replace(/[^\w-]/g, "");
  E.calc = { ...prefsCalc(), mao_obra_centavos: 0, deslocamento_centavos: 0, ...(E.calc ?? {}) };
  const guardar = () => guardarRascunho(E);
  guardar();

  const [clientes, vinculos] = await Promise.all([get("/clientes"), get("/vinculos")]);
  const nomesF = new Map(vinculos.map((v) => [v.fornecedor.id, v.fornecedor.nome_fantasia || v.fornecedor.razao_social]));
  const aprovados = vinculos.filter((v) => v.status === "aprovado");
  document.getElementById("titulo-tela").textContent = E.numero ? `Proposta #${E.numero} · rascunho` : "Nova proposta";

  /* Cliente */
  const selCliente = seletor([["", "Escolha o cliente"], ...clientes.map((c) => [c.id, c.nome])], E.cliente_id, { "aria-label": "Cliente" });
  const infoCliente = h("small", { class: "ajuda" });
  const mostrarCliente = () => {
    const c = clientes.find((x) => x.id === selCliente.value);
    infoCliente.textContent = c ? [foneBR(c.telefone), c.endereco?.bairro, c.endereco?.cidade].filter(Boolean).join(" · ") || "Sem telefone" : "Os dados do cliente ficam só com você: o fornecedor nunca vê.";
  };
  selCliente.addEventListener("change", () => {
    E.cliente_id = selCliente.value || null;
    mostrarCliente();
    guardar();
  });
  mostrarCliente();
  const novoCli = h("button", { type: "button", class: "btn btn-fantasma btn-peq", onclick: () => janela("Novo cliente", (fechar) => formCliente(null, (c) => {
    clientes.push(c);
    selCliente.append(h("option", { value: c.id }, c.nome));
    selCliente.value = c.id;
    E.cliente_id = c.id;
    mostrarCliente();
    guardar();
    fechar();
  })) }, ic("mais", 16), "Novo cliente");

  const titulo = entrada({ value: E.titulo, placeholder: "Ex.: CFTV com 4 câmeras", maxlength: 160 });
  titulo.addEventListener("input", () => ((E.titulo = titulo.value), guardar()));

  /* Itens */
  const listaItens = h("div", { class: "pilha" });
  const resumo = h("div", { class: "pilha" });
  function linhaItem(i) {
    const rodape = h("small", { class: "fraco numero quebra" });
    const totalLinha = h("strong", { class: "numero" });
    const aviso_ = h("div");
    const atualizarLinha = () => {
      const margem = i.preco_unit_centavos ? Math.round(((i.preco_unit_centavos - (i.custo_unit_centavos || 0)) / i.preco_unit_centavos) * 1000) / 10 : 0;
      rodape.textContent = `Custo ${reais(i.custo_unit_centavos || 0)}/un · margem bruta ${pct(margem)}`;
      totalLinha.textContent = reais(i.quantidade * i.preco_unit_centavos);
      limpar(aviso_, i.tipo === "fornecedor" && i.disponivel != null && i.disponivel < i.quantidade ? h("div", { class: "aviso-faixa pequeno" }, ic("alerta", 16), h("span", {}, `O fornecedor tem só ${i.disponivel} disponível. Ao enviar, a reserva falha.`)) : null);
    };
    const qtdInput = h("input", { type: "number", inputmode: "numeric", min: "1", value: String(i.quantidade), "aria-label": `Quantidade de ${i.descricao || "item"}` });
    const mudarQtd = (n) => {
      i.quantidade = Math.max(1, Math.min(100000, Math.floor(n) || 1));
      qtdInput.value = String(i.quantidade);
      atualizarLinha();
      mudou();
    };
    qtdInput.addEventListener("change", () => mudarQtd(Number(qtdInput.value)));
    const preco = entradaDinheiro(i.preco_unit_centavos, (c) => ((i.preco_unit_centavos = c), atualizarLinha(), mudou()), { "aria-label": `Preço de venda por unidade de ${i.descricao || "item"}` });
    i._preco = preco;
    const remover = h("button", { type: "button", class: "btn-icone", "aria-label": `Remover ${i.descricao || "item"}`, onclick: () => {
      E.itens.splice(E.itens.indexOf(i), 1);
      desenharItens();
      mudou();
    } }, ic("lixo", 18));
    const descricao = i.tipo === "fornecedor"
      ? h("div", { class: "meio" }, h("strong", { class: "quebra" }, i.descricao), h("div", { class: "linha-esq pequeno" }, chip(i.fornecedor || nomesF.get(i.fornecedor_id) || "Fornecedor", "info"), h("span", { class: "fraco" }, [i.codigo, i.disponivel != null ? `${i.disponivel} disp.` : null, i.prazo_dias ? `${i.prazo_dias} dia(s)` : null].filter(Boolean).join(" · "))))
      : h("div", { class: "meio pilha", style: { gap: "6px" } }, chip(ROTULO_TIPO[i.tipo]), (() => {
        const d = entrada({ value: i.descricao ?? "", placeholder: i.tipo === "servico" ? "Ex.: Instalação e configuração" : "Ex.: Suporte de parede", "aria-label": "Descrição do item", maxlength: 200 });
        d.addEventListener("input", () => ((i.descricao = d.value), guardar()));
        i._desc = d;
        return d;
      })());
    // Serviço sem custo fica marcado: o envio é recusado até o instalador informar (mão de obra, deslocamento)
    const faltaCusto = i.tipo === "servico" ? h("small", { class: "falta-custo", role: "status", hidden: i.custo_unit_centavos > 0 }, "Informe quanto este serviço custa para você.") : null;
    const custoProprio = i.tipo !== "fornecedor" ? campo(i.tipo === "servico" ? "Seu custo (obrigatório)" : "Custo unitário", entradaDinheiro(i.custo_unit_centavos || 0, (c) => ((i.custo_unit_centavos = c), faltaCusto && (faltaCusto.hidden = c > 0), atualizarLinha(), mudou())), faltaCusto) : null;
    atualizarLinha();
    return h(
      "div",
      { class: "linha-item" },
      h("div", { class: "topo-item" }, i.tipo === "fornecedor" ? h("div", { class: "miniatura" }, i.foto_url ? h("img", { src: i.foto_url, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : ic("caixa")) : null, descricao, remover),
      h("div", { class: "controles" },
        h("div", { class: "campo" }, h("label", {}, "Qtd."), h("div", { class: "qtd" }, h("button", { type: "button", "aria-label": "Diminuir", onclick: () => mudarQtd(i.quantidade - 1) }, "−"), qtdInput, h("button", { type: "button", "aria-label": "Aumentar", onclick: () => mudarQtd(i.quantidade + 1) }, "+"))),
        campo("Preço de venda (un.)", preco)),
      custoProprio,
      h("div", { class: "linha" }, rodape, totalLinha),
      aviso_,
    );
  }
  function desenharItens() {
    limpar(listaItens, E.itens.length ? E.itens.map(linhaItem) : h("div", { class: "cartao" }, vazio("caixa", "Nenhum item ainda", "Adicione do catálogo dos fornecedores, de um kit pronto, um item próprio ou o serviço.")));
  }
  const addLivre = (tipo) => {
    const i = { tipo, descricao: "", quantidade: 1, unidade: tipo === "servico" ? "sv" : "un", custo_unit_centavos: 0, preco_unit_centavos: 0 };
    E.itens.push(i);
    desenharItens();
    mudou();
    i._desc?.focus();
  };
  const botoesAdd = h(
    "div",
    { class: "grade2" },
    h("button", { type: "button", class: "btn btn-fantasma", onclick: () => janelaCatalogo(aprovados, nomesF, (novos) => (adicionar(novos), desenharItens(), mudou())) }, ic("caixa", 18), "Do catálogo"),
    h("button", { type: "button", class: "btn btn-fantasma", onclick: () => janelaKits(nomesF, (novos) => (adicionar(novos), desenharItens(), mudou())) }, ic("kit", 18), "De um kit"),
    h("button", { type: "button", class: "btn btn-fantasma", onclick: () => addLivre("proprio") }, ic("mais", 18), "Item próprio"),
    h("button", { type: "button", class: "btn btn-fantasma", onclick: () => addLivre("servico") }, ic("ferramenta", 18), "Serviço"),
  );
  function adicionar(novos) {
    for (const n of novos) {
      const igual = n.tipo === "fornecedor" && E.itens.find((x) => x.tipo === "fornecedor" && x.produto_id === n.produto_id);
      if (igual) igual.quantidade += n.quantidade;
      else E.itens.push(n);
    }
  }

  /* Desconto, validade, condições */
  const desconto = entradaDinheiro(E.desconto_centavos, (c) => ((E.desconto_centavos = c), mudou()));
  const validade = entrada({ type: "date", value: E.validade_dia ?? "", min: hojeBR() });
  validade.addEventListener("change", () => ((E.validade_dia = validade.value || null), guardar()));
  const condicoes = area({ maxlength: 2000 }, E.condicoes);
  const garantia = area({ maxlength: 2000 }, E.garantia);
  const obs = area({ maxlength: 2000, placeholder: "Ex.: prazo de instalação de 3 dias úteis após o pagamento" }, E.observacoes);
  condicoes.addEventListener("input", () => ((E.condicoes = condicoes.value), guardar()));
  garantia.addEventListener("input", () => ((E.garantia = garantia.value), guardar()));
  obs.addEventListener("input", () => ((E.observacoes = obs.value), guardar()));

  /* Calculadora */
  const C = E.calc;
  const regime = seletor([["mei", "MEI"], ["simples", "Simples"], ["presumido", "Presumido"]], C.regime);
  const anexo = seletor([["I", "I · comércio"], ["II", "II · indústria"], ["III", "III · serviços"], ["IV", "IV"], ["V", "V"]], C.anexo);
  // Banca P-14: alíquota efetiva pela faixa (receita dos últimos 12 meses) ou informada à mão
  const modoAliq = seletor([["manual", "Informar a alíquota"], ["rbt12", "Calcular pela receita de 12 meses"]], C.simples_modo ?? "manual");
  const rbt12 = entradaDinheiro(C.rbt12_centavos ?? 0, (c) => ((C.rbt12_centavos = c), recalc()));
  const aliq = entrada({ inputmode: "decimal", value: String(C.aliquota_pct).replace(".", ",") });
  const iss = entrada({ inputmode: "decimal", value: String(C.iss_pct).replace(".", ",") });
  const taxaPct = entrada({ inputmode: "decimal", value: String(C.taxa_meio_pct).replace(".", ",") });
  const taxaFixa = entradaDinheiro(C.taxa_meio_fixa_centavos, (c) => ((C.taxa_meio_fixa_centavos = c), recalc()));
  const margem = entrada({ inputmode: "decimal", value: String(C.margem_pct).replace(".", ",") });
  const maoObra = entradaDinheiro(C.mao_obra_centavos, (c) => ((C.mao_obra_centavos = c), recalc()));
  const desloc = entradaDinheiro(C.deslocamento_centavos, (c) => ((C.deslocamento_centavos = c), recalc()));
  const num = (i) => Number(String(i.value).replace(",", ".")) || 0;
  const campoAnexo = campo("Anexo", anexo);
  const campoAliq = campo("Alíquota efetiva (%)", aliq, "Veja no seu último DAS.");
  const campoModo = campo("Alíquota do Simples", modoAliq);
  const campoRbt = campo("Receita bruta dos últimos 12 meses", rbt12, "RBT12: a alíquota efetiva sai da faixa do anexo.");
  const campoIss = campo("ISS (%)", iss);
  const visRegime = () => {
    const simples = regime.value === "simples";
    campoAnexo.hidden = campoModo.hidden = !simples;
    campoAliq.hidden = !simples || modoAliq.value === "rbt12";
    campoRbt.hidden = !simples || modoAliq.value !== "rbt12";
    campoIss.hidden = regime.value !== "presumido";
  };
  modoAliq.addEventListener("change", () => ((C.simples_modo = modoAliq.value), visRegime(), recalc()));
  for (const [i, k] of [[aliq, "aliquota_pct"], [iss, "iss_pct"], [taxaPct, "taxa_meio_pct"], [margem, "margem_pct"]]) i.addEventListener("input", () => ((C[k] = num(i)), recalc()));
  regime.addEventListener("change", () => ((C.regime = regime.value), visRegime(), recalc()));
  anexo.addEventListener("change", () => ((C.anexo = anexo.value), recalc()));
  visRegime();
  const saidaCalc = h("div", { class: "pilha", "aria-live": "polite" });

  const totais = () => {
    const subtotal = E.itens.reduce((s, i) => s + i.quantidade * i.preco_unit_centavos, 0);
    const custoProd = E.itens.filter((i) => i.tipo !== "servico").reduce((s, i) => s + i.quantidade * (i.custo_unit_centavos || 0), 0);
    const custoServ = E.itens.filter((i) => i.tipo === "servico").reduce((s, i) => s + i.quantidade * (i.custo_unit_centavos || 0), 0);
    return { subtotal, total: Math.max(0, subtotal - (E.desconto_centavos || 0)), custoProd, custoServ };
  };
  let ultimoSugerido = null;
  let ultimoCustos = null;
  const recalc = debounce(async () => {
    guardarPrefs(C);
    guardar();
    const t = totais();
    if (!E.itens.length) return limpar(saidaCalc, h("p", { class: "suave pequeno" }, "Adicione itens para ver impostos, taxas e o lucro líquido."));
    const base = {
      custos: { produtos_centavos: t.custoProd, mao_obra_centavos: t.custoServ + (C.mao_obra_centavos || 0), deslocamento_centavos: C.deslocamento_centavos || 0 },
      margem_pct: Math.min(90, Math.max(0, C.margem_pct || 0)),
      regime: C.regime === "simples" ? { tipo: "simples", anexo: C.anexo, ...(C.simples_modo === "rbt12" && C.rbt12_centavos > 0 ? { rbt12_centavos: C.rbt12_centavos } : { aliquota_pct: Math.min(33, C.aliquota_pct || 0) }) } : { tipo: C.regime },
      ...(C.regime === "presumido" ? { iss_pct: Math.min(5, C.iss_pct || 0) } : {}),
      taxa_meio_pct: Math.min(20, C.taxa_meio_pct || 0),
      taxa_meio_fixa_centavos: C.taxa_meio_fixa_centavos || 0,
    };
    try {
      const [sug, real] = await Promise.all([post("/calculadora", base), t.total ? post("/calculadora", { ...base, preco_centavos: t.total }) : null]);
      ultimoSugerido = sug.preco_sugerido_centavos;
      ultimoCustos = sug.custos_centavos;
      const r = real ?? sug;
      const linha = (rot, v, cls = "") => [h("dt", { class: cls }, rot), h("dd", { class: cls }, v)];
      limpar(
        saidaCalc,
        h(
          "dl",
          { class: "tabela-calc" },
          linha(real ? "Preço da proposta" : "Preço sugerido", reais(r.preco_sugerido_centavos), "forte"),
          linha("− Custos (produtos, mão de obra, deslocamento)", reais(r.custos_centavos)),
          linha(`− Impostos (${pct(r.impostos.aliquota_efetiva_pct)})`, reais(r.impostos.total_centavos)),
          r.impostos.detalhamento.length > 1 ? r.impostos.detalhamento.flatMap((d) => linha(`   ${d.nome}`, reais(d.centavos), "fraco pequeno")) : null,
          linha("− Taxa do pagamento", reais(r.taxa_meio_centavos)),
          linha(`− Taxa da plataforma (${pct(r.taxa_plataforma_pct ?? sug.taxa_plataforma_pct)})`, reais(r.taxa_plataforma_centavos)),
          linha("= Lucro líquido", h("span", { class: r.lucro_liquido_centavos < 0 ? "perigo" : "ok" }, `${reais(r.lucro_liquido_centavos)} (${pct(r.margem_real_pct)})`), "forte"),
        ),
        h(
          "div",
          { class: "cartao destaque", style: { boxShadow: "none" } },
          h("div", { class: "linha" }, h("div", { class: "kpi" }, h("small", {}, `Preço que cobre os custos com ${pct(base.margem_pct)} de lucro líquido`), h("strong", {}, reais(sug.preco_sugerido_centavos))), sug.markup ? chip(`markup ${String(sug.markup).replace(".", ",")}×`) : null),
          h("small", { class: "fraco" }, "Aplicar põe o mesmo markup em todos os itens. Todo serviço precisa do seu custo (mão de obra, deslocamento) para a margem fechar."),
          h("button", { type: "button", class: "btn btn-cor btn-peq", onclick: aplicarSugerido }, ic("check", 16), "Aplicar margem sugerida"),
        ),
        [...new Set([...(sug.avisos ?? []), ...(real?.avisos ?? [])])].map((a) => h("div", { class: `aviso-faixa pequeno ${a.startsWith("Atenção") ? "" : "info"}` }, ic("alerta", 16), h("span", {}, a))),
      );
    } catch (e) {
      limpar(saidaCalc, h("div", { class: "aviso-faixa pequeno" }, ic("alerta", 16), h("span", {}, e.message)));
    }
  }, 350);
  /** Aplica a margem sugerida: todos os itens têm custo (serviço sem custo não pode ser enviado), então cada um recebe o
      mesmo markup e o total bate com o preço sugerido. Custos extras da calculadora entram no primeiro serviço. */
  function aplicarSugerido() {
    if (!ultimoSugerido || !ultimoCustos || !E.itens.length) return;
    const semCusto = E.itens.filter((i) => i.tipo === "servico" && !(i.custo_unit_centavos > 0));
    if (semCusto.length) return aviso(`Informe primeiro o seu custo ${semCusto.length === 1 ? "no serviço" : "nos serviços"} ${semCusto.map((i) => `"${i.descricao || "serviço"}"`).join(", ")}.`, true);
    const comCusto = E.itens.filter((i) => (i.custo_unit_centavos || 0) > 0);
    if (!comCusto.length) return aviso("Informe o custo de algum item primeiro.", true);
    const custoItens = comCusto.reduce((s, i) => s + i.custo_unit_centavos * i.quantidade, 0);
    const extra = ultimoCustos - custoItens;
    const servico = E.itens.find((i) => i.tipo === "servico" && !(i.custo_unit_centavos > 0));
    const k = servico || extra <= 0 ? ultimoSugerido / ultimoCustos : ultimoSugerido / custoItens;
    for (const i of comCusto) i.preco_unit_centavos = Math.ceil(i.custo_unit_centavos * k);
    if (servico && extra > 0) servico.preco_unit_centavos += Math.ceil((extra * k) / servico.quantidade);
    desenharItens();
    mudou();
    aviso("Margem sugerida aplicada a todos os itens.");
  }

  /* Barra de total + salvar/enviar */
  const totalEl = h("strong", { class: "numero", style: { fontSize: "21px" } });
  const lucroEl = h("small", { class: "suave numero" });
  function mudou() {
    const t = totais();
    totalEl.textContent = reais(t.total);
    const bruto = t.total - t.custoProd - t.custoServ;
    lucroEl.textContent = `${E.itens.length} ${E.itens.length === 1 ? "item" : "itens"} · margem ${reais(bruto)}`;
    limpar(resumo, h("dl", { class: "tabela-calc" }, h("dt", {}, "Subtotal"), h("dd", {}, reais(t.subtotal)), h("dt", {}, "Desconto"), h("dd", {}, `− ${reais(E.desconto_centavos || 0)}`), h("dt", { class: "forte" }, "Total para o cliente"), h("dd", { class: "forte" }, reais(t.total))));
    guardar();
    recalc();
  }
  /* Banca U-03: com rede lenta, "Salvar" e logo depois "Enviar" disparavam dois salvamentos ao mesmo tempo. A chave do rascunho
     já impede a proposta duplicada, mas o segundo POST recebia a proposta antiga e as edições feitas no meio se perdiam.
     Agora os salvamentos entram numa fila: o próximo espera o anterior terminar e, com o id já conhecido, grava por PUT
     o estado mais recente. O envio sempre parte do que acabou de ser salvo. */
  let filaSalvar = Promise.resolve();
  function salvar() {
    const vez = filaSalvar.then(salvarAgora, salvarAgora);
    filaSalvar = vez.catch(() => {});
    return vez;
  }
  async function salvarAgora() {
    if (!E.titulo.trim()) {
      titulo.focus();
      throw new Error("Dê um título para a proposta (o cliente vê).");
    }
    // Chave do rascunho (banca U-02): a mesma proposta enviada de duas abas ou reenviada com rede lenta não duplica
    if (!E.id && !E.chave) E.chave = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`).replace(/[^\w-]/g, "");
    const corpo = { ...(E.id ? {} : { chave: E.chave }), cliente_id: E.cliente_id || null, titulo: E.titulo.trim(), validade_dia: E.validade_dia || null, condicoes: E.condicoes || undefined, garantia: E.garantia || undefined, observacoes: E.observacoes || undefined, desconto_centavos: E.desconto_centavos || 0, itens: E.itens.map(paraApi) };
    for (const k of Object.keys(corpo)) if (corpo[k] === undefined) delete corpo[k];
    const p = E.id ? await put(`/propostas/${E.id}`, corpo) : await post("/propostas", corpo);
    E.id = p.id;
    E.numero = p.numero;
    guardar();
    document.getElementById("titulo-tela").textContent = `Proposta #${p.numero} · rascunho`;
    return p;
  }
  const avisar = h("input", { type: "checkbox", checked: true });
  const btSalvar = botao("Salvar", async () => {
    await salvar();
    aviso("Rascunho salvo.");
  }, "btn-fantasma", "check");
  const btEnviar = botaoConfirma("Enviar", "Confirmar envio", async () => {
    if (!E.cliente_id) throw new Error("Escolha o cliente antes de enviar.");
    const semCusto = E.itens.filter((i) => i.tipo === "servico" && !(i.custo_unit_centavos > 0));
    if (semCusto.length) throw new Error(`Informe o seu custo ${semCusto.length === 1 ? "no serviço" : "nos serviços"} ${semCusto.map((i) => `"${i.descricao || "serviço"}"`).join(", ")} (mão de obra, deslocamento, material de consumo) para calcular a margem.`);
    if (!E.itens.length) throw new Error("Adicione pelo menos um item.");
    const p = await salvar();
    const enviada = await post(`/propostas/${p.id}/enviar`, { avisar_cliente: avisar.checked });
    guardarRascunho(null);
    aviso(`Proposta #${enviada.numero} enviada. Estoque reservado até ${dataHora(enviada.reserva_expira_em)}.`);
    ir(`propostas/${enviada.id}?enviada=1`);
  }, "btn-cor", "enviar");
  const descartar = botaoConfirma("Descartar", "Toque de novo para descartar", async () => {
    guardarRascunho(null);
    ir(E.id ? `propostas/${E.id}` : "propostas");
  }, "btn-perigo btn-peq", "lixo");

  limpar(
    el,
    h(
      "div",
      { class: "grade-larga" },
      h(
        "div",
        {},
        h("section", { class: "secao", "aria-labelledby": "e-cli" }, h("h2", { id: "e-cli" }, "Cliente e título"), h("div", { class: "cartao" }, campo("Cliente", selCliente), infoCliente, novoCli, campo("Título da proposta", titulo))),
        h("section", { class: "secao", "aria-labelledby": "e-itens" }, h("h2", { id: "e-itens" }, "Itens"), listaItens, botoesAdd),
        h("section", { class: "secao", "aria-labelledby": "e-cond" }, h("h2", { id: "e-cond" }, "Validade, condições e garantia"), h("div", { class: "cartao" }, h("div", { class: "grade2" }, campo("Válida até", validade), campo("Desconto (R$)", desconto)), campo("Condições de pagamento", condicoes), campo("Garantia", garantia), campo("Observações", obs))),
      ),
      h(
        "div",
        {},
        h(
          "section",
          { class: "secao", "aria-labelledby": "e-calc" },
          h("h2", { id: "e-calc" }, "Calculadora de precificação"),
          h(
            "details",
            { class: "cartao dobra", open: matchMedia("(min-width: 900px)").matches },
            h("summary", {}, ic("calculadora", 18), "Impostos, taxas e lucro líquido"),
            h("div", { class: "pilha", style: { marginTop: "10px" } },
              h("div", { class: "grade2" }, campo("Regime", regime), campoAnexo, campoModo, campoAliq, campoRbt, campoIss, campo("Margem líquida desejada (%)", margem), campo("Taxa do pagamento (%)", taxaPct), campo("Taxa fixa por cobrança", taxaFixa), campo("Custo da sua mão de obra", maoObra), campo("Deslocamento", desloc)),
              saidaCalc),
          ),
          resumo,
        ),
      ),
    ),
    h("section", { class: "secao", "aria-labelledby": "e-env" }, h("h2", { id: "e-env" }, "Envio"), h("div", { class: "cartao" }, h("label", { class: "marcar" }, avisar, h("span", {}, "Mandar o link ao cliente por WhatsApp/e-mail ao enviar")), h("small", { class: "fraco" }, "Ao enviar, o estoque dos fornecedores fica reservado pelo prazo deles e o cliente recebe um link para aceitar e pagar."), h("div", { class: "linha" }, h("span", {}), descartar))),
    h("div", { class: "barra-total", role: "region", "aria-label": "Total e envio" }, h("div", { class: "kpi meio" }, h("small", {}, "Total para o cliente"), totalEl, lucroEl), h("div", { class: "barra-botoes" }, btSalvar, btEnviar)),
  );
  desenharItens();
  mudou();
}

/* Catálogo dentro da proposta: busca em todos os fornecedores (comparador) ou num só (catálogo dele) */
function janelaCatalogo(aprovados, nomesF, aoAdicionar) {
  janela("Adicionar do catálogo", () => {
    const busca = entrada({ type: "search", placeholder: "Nome ou código (ex.: câmera, DVR-4C)", "aria-label": "Buscar produto", autocomplete: "off" });
    const forn = seletor([["", "Todos os fornecedores"], ...aprovados.map((v) => [v.fornecedor.id, v.fornecedor.nome_fantasia || v.fornecedor.razao_social])], "", { "aria-label": "Fornecedor" });
    const res = h("div", { "aria-live": "polite" });
    let pedido = 0;
    const procurar = debounce(async () => {
      const t = busca.value.trim();
      const n = ++pedido;
      if (!forn.value && t.length < 2) return limpar(res, h("p", { class: "suave pequeno" }, aprovados.length ? "Digite pelo menos 2 letras para comparar em todos os fornecedores, ou escolha um fornecedor para ver o catálogo dele." : "Você ainda não tem fornecedor com vínculo aprovado. Peça vínculo em Fornecedores."));
      limpar(res, h("div", { class: "tela-carregando", style: { minHeight: "80px" } }, h("span", { class: "girando" })));
      try {
        const lista = forn.value ? await get(`/fornecedores/${forn.value}/catalogo?busca=${encodeURIComponent(t)}`) : await get(`/comparar?termo=${encodeURIComponent(t)}&quantidade=1`);
        if (n !== pedido) return;
        limpar(res, lista.length ? lista.map((o) => linhaOferta(o, nomesF, (q) => aoAdicionar([itemDeOferta(o, q)]))) : vazio("busca", "Nada encontrado", "Tente outro nome ou código."));
      } catch (e) {
        limpar(res, h("p", { class: "perigo pequeno" }, e.message));
      }
    }, 300);
    busca.addEventListener("input", procurar);
    forn.addEventListener("change", procurar);
    procurar();
    setTimeout(() => busca.focus(), 50);
    return [h("div", { class: "grade2" }, h("div", { class: "busca" }, ic("busca", 18), busca), forn), res];
  }, { largo: true });
}
export function linhaOferta(o, nomesF, aoAdicionar) {
  const mais = h("button", { type: "button", class: "btn btn-cor btn-peq", "aria-label": `Adicionar ${o.nome} de ${o.fornecedor ?? nomesF?.get(o.fornecedor_id) ?? "fornecedor"}` }, ic("mais", 16), "Adicionar");
  mais.addEventListener("click", () => {
    aoAdicionar(1);
    aviso(`${o.nome} adicionado.`);
    mais.lastChild.textContent = "Mais 1";
  });
  return h(
    "div",
    { class: "item" },
    h("div", { class: "miniatura" }, o.foto_url ? h("img", { src: o.foto_url, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : ic("caixa")),
    h("div", { class: "meio" }, h("strong", { class: "quebra" }, o.nome), h("div", { class: "pequeno suave quebra" }, [o.fornecedor ?? nomesF?.get(o.fornecedor_id), o.codigo, o.marca].filter(Boolean).join(" · ")), h("div", { class: "linha-esq pequeno" }, h("strong", { class: "numero" }, reais(o.preco_centavos)), o.preco_base_centavos > o.preco_centavos ? h("s", { class: "fraco numero" }, reais(o.preco_base_centavos)) : null, chip(`${o.disponivel} disp.`, o.disponivel > 0 ? "ok" : "perigo"), chip(`${o.prazo_dias} dia(s)`), o.melhor ? chip("melhor", "info") : null)),
    mais,
  );
}
function janelaKits(nomesF, aoAdicionar) {
  janela("Usar um kit", (fechar) => {
    const lista = h("div", {}, h("div", { class: "tela-carregando", style: { minHeight: "80px" } }, h("span", { class: "girando" })));
    get("/kits").then(
      (kits) =>
        limpar(
          lista,
          kits.map((k) => {
            const vezes = h("input", { type: "number", min: "1", max: "100", value: "1", class: "entrada", style: { width: "76px" }, "aria-label": `Quantas vezes o kit ${k.nome}` });
            const usar = botao("Aplicar", async () => {
              const r = await post(`/kits/${encodeURIComponent(k.id)}/aplicar`, { multiplicar: Math.max(1, Math.min(100, Number(vezes.value) || 1)) });
              aoAdicionar(r.itens.map((i) => itemDeOferta({ ...i, id: i.produto_id, nome: i.descricao, preco_centavos: i.custo_unit_centavos, fornecedor: nomesF.get(i.fornecedor_id) }, i.quantidade)));
              if (r.faltando.length) aviso(`Sem oferta nos seus fornecedores para: ${r.faltando.map((f) => f.termo ?? f.codigo).join(", ")}.`, true);
              else aviso(`Kit "${k.nome}" aplicado: ${r.itens.length} itens.`);
              fechar();
            }, "btn-cor btn-peq");
            return h("div", { class: "item" }, h("div", { class: "miniatura" }, ic("kit")), h("div", { class: "meio" }, h("strong", {}, k.nome), h("div", { class: "pequeno suave quebra" }, k.descricao || k.itens.map((i) => `${i.quantidade}× ${i.termo ?? i.codigo}`).join(", ")), k.modelo ? chip("modelo", "info") : chip("seu kit")), vezes, usar);
          }),
        ),
      (e) => limpar(lista, h("p", { class: "perigo" }, e.message)),
    );
    return lista;
  });
}

/* ---------- Detalhe ---------- */
export async function telaProposta(el, id, q) {
  const p = await get(`/propostas/${id}`);
  document.getElementById("titulo-tela").textContent = `Proposta #${p.numero}`;
  const cli = p.cliente;
  const ativa = ["enviada", "vista", "aceita"].includes(p.status);
  const recarregar = () => ir(`propostas/${p.id}`);
  const ac = (rota, msg) => async () => {
    const r = await post(`/propostas/${p.id}/${rota}`, {});
    aviso(msg);
    ir(`propostas/${r.id}`);
  };

  const acoes = [];
  if (p.status === "rascunho") {
    acoes.push(botao("Editar", async () => {
      guardarRascunho(deServidor(p));
      ir(`propostas/${p.id}/editar`);
    }, "btn-cor", "editar"));
  }
  if ((ativa || p.status === "expirada") && p.renovacoes < 1) acoes.push(botaoConfirma(p.status === "expirada" ? "Reservar de novo" : "Renovar reserva", "Toque de novo para renovar", ac("renovar", "Reserva renovada."), "btn-fantasma", "relogio"));
  if (ativa || p.status === "expirada") acoes.push(botaoConfirma("Reabrir para editar", "Toque de novo: libera a reserva", ac("reabrir", "Proposta voltou para rascunho. O link anterior deixou de valer."), "btn-fantasma", "editar"));
  if (p.status === "paga") {
    acoes.push(h("a", { class: "btn btn-cor", href: `#/os/nova?proposta=${p.id}` }, ic("os", 18), "Criar OS"));
    if (p.itens.some((i) => i.tipo === "servico") && !p.notas.some((n) => n.tipo === "nfse")) acoes.push(botaoConfirma("Emitir NFS-e", "Toque de novo para emitir", async () => {
      const n = await post(`/propostas/${p.id}/nfse`, {});
      aviso(n.simulada ? "NFS-e emitida (simulada, sem token Focus)." : "NFS-e enviada à prefeitura.");
      recarregar();
    }, "btn-fantasma", "nota"));
  }
  acoes.push(botao("Duplicar", ac("duplicar", "Cópia criada em rascunho."), "btn-fantasma", "duplicar"));
  if (!["paga", "cancelada"].includes(p.status)) acoes.push(botaoConfirma("Cancelar", "Toque de novo para cancelar", ac("cancelar", "Proposta cancelada e reservas liberadas."), "btn-perigo", "x"));

  const textoZap = `Olá${cli ? `, ${cli.nome.split(" ")[0]}` : ""}! Segue a proposta "${p.titulo}" da ${nomeEmpresa()}: ${p.link}`;
  const compartilhar = p.link && ativa
    ? h(
        "section",
        { class: "secao" },
        h("h2", {}, "Link para o cliente"),
        h(
          "div",
          { class: "cartao destaque" },
          q?.get("enviada") ? h("div", { class: "aviso-faixa ok" }, ic("check"), h("span", {}, `Proposta enviada. O estoque está reservado até ${dataHora(p.reserva_expira_em)}.`)) : null,
          h("code", { class: "quebra pequeno suave", id: "link-proposta" }, p.link),
          h("div", { class: "btns" },
            h("a", { class: "btn btn-whats", href: linkWhatsApp(cli?.telefone, textoZap), target: "_blank", rel: "noopener noreferrer" }, ic("whatsapp", 18), "WhatsApp"),
            h("button", { type: "button", class: "btn btn-fantasma", onclick: () => copiar(p.link) }, ic("copiar", 18), "Copiar link"),
            navigator.share ? h("button", { type: "button", class: "btn btn-fantasma", onclick: () => navigator.share({ title: p.titulo, text: textoZap, url: p.link }).catch(() => {}) }, ic("link", 18), "Compartilhar") : null),
        ),
      )
    : null;

  const passos = [["Criada", p.criado_em], ["Enviada", p.enviada_em], ["Vista pelo cliente", p.vista_em], ["Aceita", p.aceita_em, p.aceite ? `por ${p.aceite.nome}` : null], ["Paga", p.paga_em]];
  const ultimo = passos.reduce((n, x, i) => (x[1] ? i : n), 0);
  const tempo = h("ol", { class: "tempo" }, passos.map(([r, ms, extra], i) => h("li", { class: ms ? (i === ultimo && p.status !== "paga" ? "atual" : "feito") : "" }, h("span", { class: "ponto" }, ms ? ic("check", 14) : null), h("div", {}, h("strong", {}, r), h("span", { class: "pequeno suave" }, ms ? [dataHora(ms), extra].filter(Boolean).join(" · ") : "—")))));

  const pg = p.pagamentos?.[0];
  const destinoNome = (x) => (x.destino === "instalador" ? "Você (serviço e margem)" : x.destino === "nexor" ? "Nexor (taxa da plataforma)" : x.conta ?? "Fornecedor");
  const VIA = { split: "split direto", titulo: "título a pagar ao fornecedor", retido: "retido na cobrança" };
  const split = p.repasses?.length
    ? p.repasses.map((x) => h("div", { class: "item" }, h("div", { class: "meio" }, h("strong", {}, destinoNome(x)), h("div", { class: "pequeno suave" }, VIA[x.via] ?? x.via)), h("div", { class: "direita" }, h("strong", { class: "numero" }, reais(x.valor_centavos)), chip(x.status === "recebido" ? "recebido" : "previsto", x.status === "recebido" ? "ok" : ""))))
    : (pg?.split ?? []).map((x) => h("div", { class: "item" }, h("div", { class: "meio" }, h("strong", {}, x.destino === "instalador" ? "Você" : x.destino === "nexor" ? "Nexor (taxa)" : "Fornecedor"), h("div", { class: "pequeno suave" }, VIA[x.via] ?? x.via)), h("strong", { class: "numero" }, reais(x.centavos))));

  const custos = p.itens.reduce((s, i) => s + i.custo_unit_centavos * i.quantidade, 0);
  limpar(
    el,
    h(
      "div",
      { class: "grade-larga" },
      h(
        "div",
        {},
        h(
          "div",
          { class: "secao" },
          h(
            "div",
            { class: "cartao" },
            h("div", { class: "linha" }, h("h2", { class: "quebra meio" }, p.titulo), chipProposta(p.status)),
            h("span", { class: "suave pequeno quebra" }, cli ? `${cli.nome}${cli.telefone ? ` · ${foneBR(cli.telefone)}` : ""}` : "Sem cliente"),
            h("div", { class: "linha" }, h("div", { class: "kpi" }, h("small", {}, "Total"), h("strong", { class: "grande" }, reais(p.total_centavos))), h("div", { class: "kpi direita" }, h("small", {}, "Margem estimada"), h("strong", { class: p.margem_estimada_centavos < 0 ? "perigo" : "ok" }, reais(p.margem_estimada_centavos)))),
            p.reserva_expira_em && (ativa || p.status === "expirada") ? h("div", { class: `aviso-faixa pequeno ${p.reserva_expira_em > Date.now() ? "info" : ""}` }, ic("relogio", 16), h("span", {}, `${p.reserva_expira_em > Date.now() ? "Estoque reservado até" : "A reserva venceu em"} ${dataHora(p.reserva_expira_em)} · renovações ${p.renovacoes}/1`)) : null,
            h("div", { class: "btns" }, acoes),
          ),
        ),
        compartilhar,
        h("section", { class: "secao" }, h("h2", {}, "Itens"), h("div", { class: "cartao" }, p.itens.map((i) => h("div", { class: "item" }, h("div", { class: "miniatura" }, ic(i.tipo === "servico" ? "ferramenta" : "caixa")), h("div", { class: "meio" }, h("strong", { class: "quebra" }, i.descricao), h("div", { class: "pequeno suave quebra" }, [i.fornecedor ?? ROTULO_TIPO[i.tipo], i.codigo, `${i.quantidade} × ${reais(i.preco_unit_centavos)}`, `custo ${reais(i.custo_unit_centavos)}`].filter(Boolean).join(" · "))), h("strong", { class: "numero" }, reais(i.quantidade * i.preco_unit_centavos)))),
          h("dl", { class: "tabela-calc" }, h("dt", {}, "Subtotal"), h("dd", {}, reais(p.subtotal_centavos)), h("dt", {}, "Desconto"), h("dd", {}, `− ${reais(p.desconto_centavos)}`), h("dt", { class: "forte" }, "Total"), h("dd", { class: "forte" }, reais(p.total_centavos)), h("dt", {}, "Custo dos itens"), h("dd", {}, reais(custos)), h("dt", {}, "Taxa da plataforma"), h("dd", {}, reais(p.taxa_plataforma_centavos))))),
        h("section", { class: "secao" }, h("h2", {}, "Condições"), h("div", { class: "cartao pequeno" }, h("div", {}, h("strong", {}, "Validade: "), diaBR(p.validade_dia)), p.condicoes ? h("div", {}, h("strong", {}, "Pagamento: "), p.condicoes) : null, p.garantia ? h("div", {}, h("strong", {}, "Garantia: "), p.garantia) : null, p.observacoes ? h("div", {}, h("strong", {}, "Observações: "), p.observacoes) : null)),
      ),
      h(
        "div",
        {},
        h("section", { class: "secao" }, h("h2", {}, "Andamento"), h("div", { class: "cartao" }, tempo)),
        h("section", { class: "secao" }, h("h2", {}, "Pagamento e divisão"), h("div", { class: "cartao" }, pg ? h("div", { class: "linha" }, h("span", {}, `${{ PIX: "Pix", BOLETO: "Boleto", CREDIT_CARD: "Cartão" }[pg.forma] ?? pg.forma}${pg.parcelas > 1 ? ` em ${pg.parcelas}x` : ""} · ${reais(pg.valor_centavos)}`), chip(pg.status === "pago" ? `pago ${dataCurta(pg.pago_em)}` : pg.status, pg.status === "pago" ? "ok" : "alerta")) : h("p", { class: "suave pequeno" }, "O cliente ainda não gerou a cobrança."), split.length ? h("div", {}, h("div", { class: "rotulo-secao", style: { marginTop: "6px" } }, "Divisão do pagamento (split)"), split) : null)),
        p.reservas?.length ? h("section", { class: "secao" }, h("h2", {}, "Reservas de estoque"), h("div", { class: "cartao pequeno" }, ...Object.entries(p.reservas.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + r.quantidade), m), {})).map(([s, n]) => h("div", { class: "linha" }, h("span", {}, { ativa: "Reservadas", baixada: "Baixadas (saíram no pagamento)", expirada: "Expiradas", liberada: "Liberadas" }[s] ?? s), h("strong", { class: "numero" }, `${n} un.`))))) : null,
        p.notas?.length ? h("section", { class: "secao" }, h("h2", {}, "Notas fiscais"), h("div", { class: "cartao" }, p.notas.map((n) => h("div", { class: "linha pequeno" }, h("span", {}, `${n.tipo.toUpperCase()} ${n.numero ?? ""}${n.simulada ? " (simulada)" : ""}`), chip(n.status, n.status === "autorizado" ? "ok" : ""))))) : null,
      ),
    ),
  );
}

