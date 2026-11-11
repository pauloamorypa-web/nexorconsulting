/* Telas de apoio do instalador: fornecedores e catálogo, comparador, kits, clientes, contratos, notas e títulos. */
import { aviso, botao, botaoConfirma, campo, chip, dataCurta, debounce, diaBR, entrada, entradaDinheiro, foneBR, h, hojeBR, ic, janela, limpar, reais, seletor, soDigitos, vazio } from "./nucleo.js";
import { adicionarAoRascunho, get, ir, itemDeOferta, post, put, del, rotaRascunho } from "./estado.js";
import { linhaOferta } from "./proposta.js";

const nomeF = (f) => f?.nome_fantasia || f?.razao_social || "";
const STATUS_VINCULO = { pendente: ["Aguardando o fornecedor", "alerta"], aprovado: ["Vínculo aprovado", "ok"], recusado: ["Recusado", "perigo"] };

/* ---------- Fornecedores ---------- */
export async function telaFornecedores(el) {
  const [fornecedores, vinculos] = await Promise.all([get("/fornecedores"), get("/vinculos")]);
  const porF = new Map(vinculos.map((v) => [v.fornecedor.id, v]));
  limpar(
    el,
    h("p", { class: "suave pequeno", style: { marginTop: "14px" } }, "Peça vínculo aos fornecedores do seu segmento. Eles aprovam pelo CNAE e definem sua tabela de preço e seu crédito."),
    h(
      "div",
      { class: "secao" },
      fornecedores.length
        ? fornecedores.map((f) => {
            const v = porF.get(f.id);
            const st = v ? STATUS_VINCULO[v.status] : null;
            const pedir = !v || v.status === "recusado"
              ? botao(v ? "Pedir de novo" : "Pedir vínculo", async () => {
                  await post("/vinculos", { fornecedor_id: f.id });
                  aviso(`Pedido enviado para ${nomeF(f)}.`);
                  ir("fornecedores");
                }, f.compativel ? "btn-cor" : "btn-fantasma", "link")
              : null;
            return h(
              "div",
              { class: "cartao" },
              h("div", { class: "linha" }, h("div", { class: "meio" }, h("strong", { class: "quebra" }, nomeF(f)), h("div", { class: "pequeno suave" }, `${f.cidade}/${f.uf} · reserva por ${f.prazo_reserva_dias} dia(s)`)), st ? chip(...st) : chip(f.compativel ? "CNAE compatível" : "CNAE não compatível", f.compativel ? "ok" : "perigo")),
              h("span", { class: "pequeno fraco" }, `CNAEs aceitos: ${f.cnaes_aceitos.join(", ")}`),
              v?.status === "recusado" && v.motivo ? h("span", { class: "pequeno perigo" }, `Motivo: ${v.motivo}`) : null,
              v?.status === "aprovado"
                ? h("div", { class: "grade3 pequeno" },
                    h("div", { class: "kpi" }, h("small", {}, "Tabela"), h("strong", { class: "pequeno" }, v.tabela ?? "Preço base")),
                    h("div", { class: "kpi" }, h("small", {}, "Crédito disponível"), h("strong", { class: "pequeno" }, reais(v.credito.disponivel_centavos))),
                    h("div", { class: "kpi" }, h("small", {}, "Em aberto"), h("strong", { class: "pequeno" }, reais(v.credito.em_aberto_centavos))))
                : null,
              v?.credito?.bloqueado ? h("div", { class: "aviso-faixa pequeno" }, ic("cadeado", 16), h("span", {}, `Bloqueado: ${v.credito.motivo ?? "fale com o fornecedor"}. Novas reservas ficam travadas.`)) : null,
              !f.compativel && !v ? h("span", { class: "pequeno alerta" }, "Nenhum CNAE do seu CNPJ está na lista deste fornecedor: o pedido será recusado.") : null,
              h("div", { class: "btns" }, pedir, v?.status === "aprovado" ? h("a", { class: "btn btn-fantasma", href: `#/fornecedores/${f.id}` }, ic("caixa", 18), "Ver catálogo") : null),
            );
          })
        : vazio("caixa", "Nenhum fornecedor ativo ainda", "Assim que a Nexor aprovar fornecedores, eles aparecem aqui."),
    ),
  );
}

export async function telaCatalogo(el, fornecedorId) {
  const vinculos = await get("/vinculos");
  const v = vinculos.find((x) => x.fornecedor.id === fornecedorId);
  if (v) document.getElementById("titulo-tela").textContent = `Catálogo · ${nomeF(v.fornecedor)}`;
  const busca = entrada({ type: "search", placeholder: "Buscar por nome, código ou marca", "aria-label": "Buscar no catálogo" });
  const res = h("div", { class: "cartao", "aria-live": "polite" });
  const carregar = debounce(async () => {
    try {
      const lista = await get(`/fornecedores/${fornecedorId}/catalogo?busca=${encodeURIComponent(busca.value.trim())}`);
      limpar(res, lista.length ? lista.map((o) => linhaOferta(o, null, (q) => adicionarAoRascunho([itemDeOferta(o, q)]))) : vazio("busca", "Nada encontrado"));
    } catch (e) {
      limpar(res, h("p", { class: "perigo" }, e.message));
    }
  }, 250);
  busca.addEventListener("input", carregar);
  limpar(
    el,
    h("div", { class: "secao" },
      v ? h("p", { class: "suave pequeno" }, `Preços da sua tabela (${v.tabela ?? "preço base"}). "Adicionar" leva o item para a proposta em montagem.`) : null,
      h("div", { class: "busca" }, ic("busca", 18), busca),
      res,
      h("a", { class: "btn btn-cor btn-bloco", href: `#/${rotaRascunho()}` }, ic("proposta", 18), "Ir para a proposta em montagem")),
  );
  carregar();
}

/* ---------- Comparador ---------- */
export async function telaComparar(el) {
  const termo = entrada({ type: "search", placeholder: "Código ou nome (ex.: CAM-BL-1080)", "aria-label": "Item para comparar", autocomplete: "off" });
  const qtd = entrada({ type: "number", min: "1", value: "1", inputmode: "numeric", "aria-label": "Quantidade" });
  const ofertas = h("div", { "aria-live": "polite" });
  const lista = [];
  const caixaLista = h("div", { class: "pilha" });
  const combinacao = h("div", { class: "pilha", "aria-live": "polite" });
  const buscar = botao("Comparar", async () => {
    const t = termo.value.trim();
    const q = Math.max(1, Number(qtd.value) || 1);
    const parece = /^[A-Z0-9][A-Z0-9.\-]{2,}$/i.test(t) && /\d/.test(t) && !/\s/.test(t);
    let r = parece ? await get(`/comparar?codigo=${encodeURIComponent(t.toUpperCase())}&quantidade=${q}`) : [];
    if (!r.length) r = await get(`/comparar?termo=${encodeURIComponent(t)}&quantidade=${q}`);
    limpar(
      ofertas,
      r.length
        ? h("div", { class: "cartao" },
            h("div", { class: "linha" }, h("strong", {}, `${r.length} oferta(s) para ${q} un.`), h("button", { type: "button", class: "btn btn-fantasma btn-peq", onclick: () => {
              lista.push({ pedido: parece ? { codigo: t.toUpperCase(), quantidade: q } : { termo: t, quantidade: q }, rotulo: t });
              desenharLista();
              aviso("Item incluído na lista.");
            } }, ic("mais", 16), "Pôr na lista")),
            r.map((o) => h("div", { class: "item" },
              h("div", { class: "meio" }, h("strong", { class: "quebra" }, o.fornecedor), h("div", { class: "pequeno suave quebra" }, `${o.nome} · ${o.codigo}`), h("div", { class: "linha-esq pequeno" }, chip(`${o.disponivel} em estoque`, o.atende_quantidade ? "ok" : "perigo"), chip(`${o.prazo_dias} dia(s)`), o.melhor ? chip("melhor preço", "info") : null)),
              h("div", { class: "direita" }, h("div", { class: "numero" }, h("strong", {}, reais(o.preco_centavos)), h("small", { class: "fraco" }, "/un")), h("div", { class: "numero pequeno suave" }, `total ${reais(o.total_centavos)}`), h("button", { type: "button", class: "btn btn-cor btn-peq", onclick: () => (adicionarAoRascunho([itemDeOferta(o, q)]), aviso("Adicionado à proposta em montagem.")) }, "Usar")))))
        : vazio("busca", "Nenhum fornecedor vinculado tem este item", "Confira o código ou peça vínculo a outros fornecedores."),
    );
  }, "btn-cor", "balanca");
  const form = h("form", { class: "cartao", onsubmit: (e) => (e.preventDefault(), buscar.click()) }, h("div", { class: "controles", style: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 84px", gap: "8px" } }, campo("Item", termo), campo("Qtd.", qtd)), buscar);
  function desenharLista() {
    limpar(caixaLista, lista.length
      ? [h("div", { class: "cartao" }, lista.map((l, n) => h("div", { class: "item" }, h("div", { class: "meio" }, h("strong", {}, l.rotulo), h("div", { class: "pequeno suave" }, `${l.pedido.quantidade} un.`)), h("button", { type: "button", class: "btn-icone", "aria-label": `Tirar ${l.rotulo} da lista`, onclick: () => (lista.splice(n, 1), desenharLista()) }, ic("x", 18))))),
        botao("Montar a melhor combinação", montar, "btn-cor btn-bloco", "estrela")]
      : h("p", { class: "suave pequeno" }, "Compare um item e toque em \"Pôr na lista\". Com a lista pronta, o Elo monta a combinação mais barata, dividindo entre fornecedores se compensar."));
  }
  async function montar() {
    const r = await post("/comparar", { itens: lista.map((l) => l.pedido) });
    const porF = new Map();
    for (const l of r.itens) if (l.melhor) porF.set(l.melhor.fornecedor, (porF.get(l.melhor.fornecedor) ?? 0) + l.melhor.total_centavos);
    limpar(
      combinacao,
      h("div", { class: "cartao destaque" },
        h("div", { class: "linha" }, h("div", { class: "kpi" }, h("small", {}, "Melhor combinação"), h("strong", { class: "grande" }, reais(r.total_centavos))), chip(`${r.fornecedores.length} fornecedor(es)`, "info")),
        r.itens.map((l) => h("div", { class: "item" }, h("div", { class: "meio" }, h("strong", { class: "quebra" }, l.melhor?.nome ?? (l.pedido.codigo || l.pedido.termo)), h("div", { class: "pequeno suave" }, l.melhor ? `${l.melhor.fornecedor} · ${l.pedido.quantidade} × ${reais(l.melhor.preco_centavos)}` : "Sem estoque suficiente em nenhum fornecedor")), h("strong", { class: "numero" }, l.melhor ? reais(l.melhor.total_centavos) : "—"))),
        [...porF].map(([f, v]) => h("div", { class: "linha pequeno" }, h("span", {}, `Split para ${f}`), h("strong", { class: "numero" }, reais(v)))),
        r.faltando.length ? h("div", { class: "aviso-faixa pequeno" }, ic("alerta", 16), h("span", {}, `Faltando: ${r.faltando.map((f) => f.codigo || f.termo).join(", ")}`)) : null,
        h("button", { type: "button", class: "btn btn-cor btn-bloco", onclick: () => {
          adicionarAoRascunho(r.itens.filter((l) => l.melhor).map((l) => itemDeOferta(l.melhor, l.pedido.quantidade)));
          aviso("Combinação levada para a proposta.");
          ir(rotaRascunho());
        } }, ic("proposta", 18), "Criar proposta com esta combinação")),
    );
  }
  limpar(el, h("div", { class: "secao" }, h("p", { class: "suave pequeno" }, "Preço da SUA tabela em cada fornecedor vinculado, estoque disponível agora e prazo de entrega."), form, ofertas), h("section", { class: "secao" }, h("h2", {}, "Lista para combinar"), caixaLista, combinacao));
  desenharLista();
  termo.focus();
}

/* ---------- Kits ---------- */
export async function telaKits(el) {
  const kits = await get("/kits");
  const nome = entrada({ maxlength: 120, placeholder: "Ex.: Interfone + fechadura" });
  const desc = entrada({ maxlength: 300 });
  const seg = seletor([["seguranca", "Segurança eletrônica"], ["eletrica", "Elétrica"], ["solar", "Energia solar"], ["refrigeracao", "Refrigeração"], ["telecom", "Telecom/redes"], ["hidraulica", "Hidráulica"], ["automacao", "Automação"]], "seguranca");
  const linhas = h("div", { class: "pilha" });
  const novaLinha = () => linhas.append(h("div", { class: "controles", style: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 84px", gap: "8px" } }, entrada({ placeholder: "Código ou termo (ex.: DVR-4C, sensor)", "aria-label": "Código ou termo", "data-k": "t" }), entrada({ type: "number", min: "1", value: "1", "aria-label": "Quantidade", "data-k": "q" })));
  novaLinha();
  novaLinha();
  const criar = botao("Salvar kit", async () => {
    const itens = [...linhas.children].map((l) => {
      const t = l.querySelector('[data-k="t"]').value.trim();
      const q = Math.max(1, Number(l.querySelector('[data-k="q"]').value) || 1);
      return t ? (/\d/.test(t) && !/\s/.test(t) ? { codigo: t.toUpperCase(), quantidade: q } : { termo: t, quantidade: q }) : null;
    }).filter(Boolean);
    await post("/kits", { nome: nome.value.trim(), segmento: seg.value, ...(desc.value.trim() ? { descricao: desc.value.trim() } : {}), itens });
    aviso("Kit salvo.");
    ir("kits");
  }, "btn-cor", "check");
  const usar = (k) => botao("Usar em proposta", async () => {
    const r = await post(`/kits/${encodeURIComponent(k.id)}/aplicar`, {});
    const vinculos = await get("/vinculos");
    const nomes = new Map(vinculos.map((v) => [v.fornecedor.id, nomeF(v.fornecedor)]));
    adicionarAoRascunho(r.itens.map((i) => itemDeOferta({ ...i, id: i.produto_id, nome: i.descricao, preco_centavos: i.custo_unit_centavos, fornecedor: nomes.get(i.fornecedor_id) }, i.quantidade)));
    if (r.faltando.length) aviso(`Sem oferta para: ${r.faltando.map((f) => f.termo ?? f.codigo).join(", ")}.`, true);
    ir(rotaRascunho());
  }, "btn-cor btn-peq", "proposta");
  limpar(
    el,
    h("div", { class: "secao" }, kits.map((k) => h("div", { class: "cartao" },
      h("div", { class: "linha" }, h("strong", {}, k.nome), k.modelo ? chip("modelo Nexor", "info") : chip("seu kit")),
      k.descricao ? h("span", { class: "pequeno suave" }, k.descricao) : null,
      h("span", { class: "pequeno fraco quebra" }, k.itens.map((i) => `${i.quantidade}× ${i.codigo ?? i.termo}`).join(" · ")),
      h("div", { class: "btns" }, usar(k), k.modelo ? null : botaoConfirma("Excluir", "Toque de novo para excluir", async () => {
        await del(`/kits/${k.id}`);
        aviso("Kit excluído.");
        ir("kits");
      }, "btn-perigo btn-peq", "lixo"))))),
    h("details", { class: "cartao dobra secao" }, h("summary", {}, ic("mais", 18), "Criar kit próprio"), h("div", { class: "pilha" }, campo("Nome", nome), h("div", { class: "grade2" }, campo("Segmento", seg), campo("Descrição", desc)), h("div", { class: "rotulo-secao" }, "Itens (o Elo procura em cada fornecedor vinculado)"), linhas, h("button", { type: "button", class: "btn btn-fantasma btn-peq", onclick: novaLinha }, ic("mais", 16), "Mais um item"), criar)),
  );
}

/* ---------- Clientes ---------- */
export function formCliente(c, aoSalvar) {
  const e = c?.endereco ?? {};
  const f = {
    nome: entrada({ value: c?.nome ?? "", autocomplete: "name", maxlength: 160 }),
    telefone: entrada({ type: "tel", inputmode: "tel", value: c?.telefone ? foneBR(c.telefone) : "", autocomplete: "tel-national" }),
    documento: entrada({ inputmode: "numeric", value: c?.documento ?? "", placeholder: "Só números" }),
    email: entrada({ type: "email", value: c?.email ?? "", autocomplete: "email" }),
    logradouro: entrada({ value: e.logradouro ?? "", autocomplete: "address-line1" }),
    numero: entrada({ value: e.numero ?? "" }),
    bairro: entrada({ value: e.bairro ?? "" }),
    cidade: entrada({ value: e.cidade ?? "", autocomplete: "address-level2" }),
    uf: entrada({ value: e.uf ?? "", maxlength: 2, autocomplete: "address-level1" }),
    cep: entrada({ value: e.cep ?? "", inputmode: "numeric", autocomplete: "postal-code" }),
  };
  const salvar = botao(c ? "Salvar cliente" : "Cadastrar cliente", async () => {
    const endereco = Object.fromEntries(["logradouro", "numero", "bairro", "cidade", "uf", "cep"].map((k) => [k, f[k].value.trim() || undefined]).filter(([, v]) => v));
    if (endereco.uf) endereco.uf = endereco.uf.toUpperCase();
    const corpo = { nome: f.nome.value.trim(), ...(soDigitos(f.telefone.value) ? { telefone: soDigitos(f.telefone.value) } : {}), ...(soDigitos(f.documento.value) ? { documento: soDigitos(f.documento.value) } : {}), ...(f.email.value.trim() ? { email: f.email.value.trim() } : {}), ...(Object.keys(endereco).length ? { endereco } : {}) };
    const r = c ? await put(`/clientes/${c.id}`, corpo) : await post("/clientes", corpo);
    aviso(c ? "Cliente salvo." : "Cliente cadastrado.");
    aoSalvar(r);
  }, "btn-cor btn-bloco", "check");
  setTimeout(() => f.nome.focus(), 50);
  return h("form", { class: "pilha", onsubmit: (ev) => (ev.preventDefault(), salvar.click()) },
    h("p", { class: "pequeno suave" }, ic("escudo", 14), " Estes dados ficam só com você. O fornecedor vê apenas a cidade/UF da obra."),
    campo("Nome", f.nome), h("div", { class: "grade2" }, campo("Celular (WhatsApp)", f.telefone), campo("CPF ou CNPJ", f.documento, "Necessário para boleto e contratos.")), campo("E-mail", f.email),
    h("div", { class: "grade2" }, campo("Rua", f.logradouro), campo("Número", f.numero), campo("Bairro", f.bairro), campo("CEP", f.cep), campo("Cidade", f.cidade), campo("UF", f.uf)), salvar);
}
export async function telaClientes(el) {
  const busca = entrada({ type: "search", placeholder: "Nome, documento ou telefone", "aria-label": "Buscar cliente" });
  const res = h("div", { class: "cartao" });
  const carregar = debounce(async () => {
    const lista = await get(`/clientes?busca=${encodeURIComponent(busca.value.trim())}`);
    limpar(res, lista.length ? lista.map((c) => h("button", { type: "button", class: "item cartao-link", style: { width: "100%", background: "none", border: 0, borderTop: "1px solid var(--linha)", textAlign: "left" }, onclick: () => janela(c.nome, (fechar) => formCliente(c, () => (fechar(), carregar()))) }, h("span", { class: "avatar", "aria-hidden": "true" }, c.nome.slice(0, 1)), h("div", { class: "meio" }, h("strong", { class: "quebra" }, c.nome), h("div", { class: "pequeno suave quebra" }, [foneBR(c.telefone), c.endereco?.bairro, c.endereco?.cidade].filter(Boolean).join(" · "))), ic("seta", 18))) : vazio("pessoas", "Nenhum cliente", "Cadastre o primeiro."));
  }, 250);
  busca.addEventListener("input", carregar);
  limpar(el, h("div", { class: "secao" }, h("div", { class: "linha" }, h("div", { class: "busca meio" }, ic("busca", 18), busca), h("button", { type: "button", class: "btn btn-cor", onclick: () => janela("Novo cliente", (fechar) => formCliente(null, () => (fechar(), carregar()))) }, ic("mais", 18), "Novo")), res));
  carregar();
}

/* ---------- Contratos recorrentes ---------- */
export async function telaContratos(el) {
  const [contratos, clientes] = await Promise.all([get("/contratos"), get("/clientes")]);
  const cli = seletor([["", "Escolha o cliente"], ...clientes.map((c) => [c.id, `${c.nome}${c.documento ? "" : " (sem CPF/CNPJ)"}`])], "");
  const desc = entrada({ value: "Monitoramento e manutenção preventiva mensal", maxlength: 200 });
  let valor = 9990;
  const valorEl = entradaDinheiro(valor, (c) => (valor = c));
  const dia = entrada({ type: "number", min: "1", max: "28", value: "10", inputmode: "numeric" });
  const criar = botaoConfirma("Criar contrato", "Toque de novo para criar a assinatura", async () => {
    if (!cli.value) throw new Error("Escolha o cliente.");
    await post("/contratos", { cliente_id: cli.value, descricao: desc.value.trim(), valor_centavos: valor, dia_vencimento: Math.max(1, Math.min(28, Number(dia.value) || 10)) });
    aviso("Contrato criado: a cobrança mensal sai pelo seu Asaas.");
    ir("contratos");
  }, "btn-cor", "repetir");
  const ativos = contratos.filter((c) => c.status === "ativo");
  limpar(
    el,
    h("div", { class: "secao" }, h("div", { class: "cartao destaque" }, h("div", { class: "grade2" }, h("div", { class: "kpi" }, h("small", {}, "Receita recorrente por mês"), h("strong", {}, reais(ativos.reduce((s, c) => s + c.valor_centavos, 0)))), h("div", { class: "kpi" }, h("small", {}, "Contratos ativos"), h("strong", {}, String(ativos.length)))))),
    h("section", { class: "secao" }, h("h2", {}, "Contratos"), contratos.length ? contratos.map((c) => h("div", { class: "cartao" },
      h("div", { class: "linha" }, h("div", { class: "meio" }, h("strong", { class: "quebra" }, c.cliente), h("div", { class: "pequeno suave quebra" }, `${c.descricao} · todo dia ${c.dia_vencimento}`)), h("div", { class: "direita" }, h("strong", { class: "numero" }, reais(c.valor_centavos)), chip(c.status, c.status === "ativo" ? "ok" : "perigo"))),
      c.cobrancas?.length ? h("div", { class: "pequeno" }, c.cobrancas.slice(0, 4).map((x) => h("div", { class: "linha" }, h("span", {}, diaBR(x.vencimento)), chip(x.status === "pago" || x.status === "recebida" ? "paga" : x.status, x.pago_em ? "ok" : "")))) : null,
      c.status === "ativo" ? botaoConfirma("Cancelar contrato", "Toque de novo para cancelar", async () => {
        await post(`/contratos/${c.id}/cancelar`, {});
        aviso("Contrato cancelado.");
        ir("contratos");
      }, "btn-perigo btn-peq", "x") : null)) : h("div", { class: "cartao" }, vazio("repetir", "Nenhum contrato", "Monitoramento e manutenção mensal geram receita todo mês."))),
    h("details", { class: "cartao dobra secao" }, h("summary", {}, ic("mais", 18), "Novo contrato mensal"), h("div", { class: "pilha" }, campo("Cliente", cli), campo("Descrição", desc), h("div", { class: "grade2" }, campo("Valor mensal", valorEl), campo("Dia do vencimento", dia)), h("small", { class: "fraco" }, "Cobrado pela SUA conta Asaas (sem split). Cadastre a chave em Conta."), criar)),
  );
}

/* ---------- Notas fiscais (NFS-e) ---------- */
export async function telaNotas(el) {
  const pagas = await get("/propostas?status=paga");
  const detalhes = await Promise.all(pagas.slice(0, 30).map((p) => get(`/propostas/${p.id}`)));
  limpar(
    el,
    h("p", { class: "suave pequeno", style: { marginTop: "14px" } }, "A NFS-e do seu serviço sai das propostas pagas, com o cliente e os serviços já preenchidos. Os produtos têm NF-e do fornecedor para você."),
    h("div", { class: "secao" }, detalhes.length ? h("div", { class: "cartao" }, detalhes.map((p) => {
      const nota = p.notas.find((n) => n.tipo === "nfse");
      const temServico = p.itens.some((i) => i.tipo === "servico");
      const servicos = p.itens.filter((i) => i.tipo === "servico").reduce((s, i) => s + i.quantidade * i.preco_unit_centavos, 0);
      return h("div", { class: "item" },
        h("div", { class: "miniatura" }, ic("nota")),
        h("div", { class: "meio" }, h("strong", { class: "quebra" }, `#${p.numero} · ${p.titulo}`), h("div", { class: "pequeno suave quebra" }, `${p.cliente?.nome ?? ""} · serviços ${reais(servicos)} · paga ${dataCurta(p.paga_em)}`)),
        nota ? h("div", { class: "direita" }, chip(nota.simulada ? "emitida (simulada)" : nota.status, "ok"), nota.numero ? h("div", { class: "pequeno fraco" }, `nº ${nota.numero}`) : null, nota.url ? h("a", { href: nota.url, target: "_blank", rel: "noopener noreferrer", class: "pequeno" }, "abrir") : null)
          : temServico ? botaoConfirma("Emitir", "Toque de novo", async () => {
              const n = await post(`/propostas/${p.id}/nfse`, {});
              aviso(n.simulada ? "NFS-e emitida (simulada, sem token Focus)." : "NFS-e enviada.");
              ir("notas");
            }, "btn-cor btn-peq", "nota") : chip("sem serviço"));
    })) : h("div", { class: "cartao" }, vazio("nota", "Nenhuma proposta paga ainda"))),
  );
}

/* ---------- Títulos com fornecedores ---------- */
export async function telaTitulos(el) {
  const lista = await get("/titulos");
  const hoje = hojeBR();
  const abertos = lista.filter((t) => t.status === "aberto");
  limpar(
    el,
    h("div", { class: "secao" }, h("div", { class: "cartao destaque" }, h("div", { class: "grade2" }, h("div", { class: "kpi" }, h("small", {}, "Em aberto"), h("strong", {}, reais(abertos.reduce((s, t) => s + t.valor_centavos, 0)))), h("div", { class: "kpi" }, h("small", {}, "Vencidos"), h("strong", { class: abertos.some((t) => t.vencido) ? "perigo" : "ok" }, String(abertos.filter((t) => t.vencido).length)))), h("small", { class: "suave" }, "Título vencido bloqueia novas reservas com aquele fornecedor até ser pago."))),
    h("section", { class: "secao" }, h("div", { class: "cartao" }, lista.length ? lista.map((t) => h("div", { class: "item" },
      h("div", { class: "miniatura" }, ic("titulo")),
      h("div", { class: "meio" }, h("strong", { class: "quebra" }, t.fornecedor), h("div", { class: "pequeno suave quebra" }, `${t.descricao} · vence ${diaBR(t.vencimento)}`)),
      h("div", { class: "direita" }, h("strong", { class: "numero" }, reais(t.valor_centavos)), chip(t.status === "aberto" ? (t.vencido ? "vencido" : t.vencimento === hoje ? "vence hoje" : "aberto") : t.status, t.status === "pago" ? "ok" : t.vencido ? "perigo" : t.status === "cancelado" ? "" : "alerta")))) : vazio("titulo", "Nenhum título"))),
  );
}

