/* Clientes do escritório: carteira, cadastro, documentos esperados, pendências, portal e envios. */

import { del, get, post, put } from "../api.js";
import { abas, acao, aviso, confirmar, copiarTexto, dataHora, h, janela, limpar, reais } from "../ui.js";
import { botao, cnpjBR, competenciaAnterior, dataBR, formulario, mesBR, tabela, topo } from "../comum.js";
import { TIPOS_ESPERADO, nomeCliente, prazo, sit } from "../base.js";
import { botoesTitular } from "../lgpd.js";

let ctxAtual;
export async function render(raiz, ctx, [id, aba]) {
  ctxAtual = ctx;
  if (id) return detalhe(raiz, id, aba ?? "dados");
  const busca = h("input", { class: "entrada", type: "search", placeholder: "Buscar por nome ou CNPJ", style: { maxWidth: "320px" } });
  const corpo = h("div");
  const carregar = async () => {
    const lista = await get(`/clientes?q=${encodeURIComponent(busca.value)}`);
    limpar(
      corpo,
      tabela(
        [
          { titulo: "Cliente", valor: (c) => h("div", {}, h("strong", {}, nomeCliente(c)), h("small", { class: "suave", style: { display: "block" } }, cnpjBR(c.cnpj), " · ", ctx.eu.catalogos.regimes[c.regime])) },
          { titulo: "Documentos faltando", valor: (c) => (c.pendentes ? h("span", {}, String(c.pendentes), c.atrasadas ? h("span", { class: "prazo-atrasado" }, ` (${c.atrasadas} atrasados)`) : null) : "—"), classe: "num" },
          { titulo: "A conferir", valor: (c) => (c.a_conferir ? String(c.a_conferir) : "—"), classe: "num" },
          { titulo: "Obrigações atrasadas", valor: (c) => (c.tarefas_atrasadas ? h("span", { class: "prazo-atrasado" }, String(c.tarefas_atrasadas)) : "—"), classe: "num" },
          { titulo: "Situação", valor: (c) => (c.ativo ? sit("ativo", "Ativo") : sit("dispensado", "Inativo")) },
        ],
        lista,
        { aoClicar: (c) => ctx.navegar(`clientes/${c.id}`), vazio: "Nenhum cliente ainda. Cadastre o primeiro." },
      ),
    );
  };
  let t;
  busca.addEventListener("input", () => (clearTimeout(t), (t = setTimeout(carregar, 250))));
  raiz.append(h("div", { class: "pagina" }, topo("Clientes", "A carteira do escritório", botao("Novo cliente", () => editar(), "btn-primario", "mais")), h("section", { class: "cartao" }, h("div", { class: "filtros", style: { marginBottom: "12px" } }, busca), corpo)));
  await carregar();
}

async function editar(c) {
  const usuarios = await get("/usuarios");
  const f = formulario(
    [
      { titulo: "Empresa" },
      { nome: "razao_social", rotulo: "Razão social", obrigatorio: true, largura: 2 },
      { nome: "nome_fantasia", rotulo: "Nome fantasia" },
      { nome: "cnpj", rotulo: "CNPJ (ou CPF)", obrigatorio: true },
      { nome: "regime", rotulo: "Regime", tipo: "select", opcoes: Object.entries(ctxAtual.eu.catalogos.regimes), obrigatorio: true },
      { nome: "municipio", rotulo: "Município" },
      { nome: "uf", rotulo: "UF" },
      { nome: "responsavel_id", rotulo: "Responsável no escritório", tipo: "select", opcoes: [["", "—"], ...usuarios.map((u) => [u.id, u.nome])] },
      { nome: "tem_funcionarios", rotulo: "Tem funcionários (FGTS, eSocial, folha)", tipo: "check", largura: 2 },
      { nome: "contribuinte_icms", rotulo: "Contribuinte de ICMS (comércio/indústria)", tipo: "check", largura: 2 },
      { nome: "presta_servico", rotulo: "Presta serviços (ISS)", tipo: "check", padrao: true, largura: 2 },
      { titulo: "Contato e cobrança" },
      { nome: "contato_nome", rotulo: "Nome do contato" },
      { nome: "whatsapp", rotulo: "WhatsApp", tipo: "tel", placeholder: "(34) 99999-0000" },
      { nome: "email", rotulo: "E-mail", tipo: "email" },
      { nome: "honorario_centavos", rotulo: "Honorário mensal (R$)", tipo: "reais" },
      { nome: "cobrar", rotulo: "Cobrar documentos automaticamente (régua)", tipo: "check", padrao: true, largura: 2 },
      ...(c ? [{ nome: "ativo", rotulo: "Cliente ativo", tipo: "check", largura: 2 }] : []),
      { nome: "observacoes", rotulo: "Observações", tipo: "area", largura: 2 },
    ],
    c ? { ...c, cnpj: cnpjBR(c.cnpj) } : { cobrar: true, presta_servico: true, regime: "simples" },
  );
  janela({
    titulo: c ? `Editar ${nomeCliente(c)}` : "Novo cliente",
    largura: 720,
    conteudo: h("div", { class: "pilha" }, f.el, c ? null : h("p", { class: "suave pequeno" }, "Ao salvar, o sistema cria a lista de documentos esperados do regime, as pendências do mês e as obrigações. Tudo pode ser ajustado depois.")),
    acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { const d = f.ler(); if (!d.responsavel_id) d.responsavel_id = null; const r = c ? await put(`/clientes/${c.id}`, d) : await post("/clientes", d); fechar(); aviso("Cliente salvo."); ctxAtual.navegar(`clientes/${r.id}`); }) }],
  });
}

async function detalhe(raiz, id, aba) {
  const c = await get(`/clientes/${id}`);
  const corpo = h("div", { class: "aba-corpo" });
  const ir = (x) => (history.replaceState(null, "", `#/clientes/${id}/${x}`), detalhe(limpar(raiz), id, x));
  const itens = [["dados", "Dados"], ["esperados", "Documentos esperados"], ["pendencias", "Pendências"], ["documentos", "Documentos"], ["tarefas", "Obrigações"], ["portal", "Portal do cliente"], ["envios", "Mensagens enviadas"]];
  limpar(
    raiz,
    h(
      "div",
      { class: "pagina" },
      h("a", { href: "#/clientes", class: "btn-link", style: { justifySelf: "start" } }, "← Clientes"),
      topo(nomeCliente(c), `${c.razao_social} · ${cnpjBR(c.cnpj)} · ${ctxAtual.eu.catalogos.regimes[c.regime]}`, botao("Editar", () => editar(c), "btn-fantasma", "editar"), botao("Cobrar agora", (e) => acao(e.currentTarget, async () => { const r = await post(`/cobrar/${c.id}`); aviso(`Cobrança enviada (${r.itens} documento(s)).`); }), "btn-fantasma", "sino")),
      abas(itens, aba, ir),
      corpo,
    ),
  );
  const telas = { dados, esperados, pendencias, documentos, tarefas, portal, envios };
  limpar(corpo, await (telas[aba] ?? dados)(c, () => ir(aba)));
}

function dados(c, recarregar) {
  const linha = (r, v) => [h("dt", {}, r), h("dd", {}, v || "—")];
  // LGPD (arts. 18 e 19): só dono e administrador exportam ou excluem os dados do cliente
  const lgpd = ctxAtual.pode("dono", "admin") ? h("div", { class: "pilha" }, h("h3", {}, "Dados pessoais (LGPD)"), h("p", { class: "suave pequeno" }, "A exclusão apaga portal, WhatsApp e chamados e anonimiza o contato. Documentos fiscais, guias, obrigações e lançamentos ficam bloqueados até o fim do prazo legal."), botoesTitular("cliente", c.id, c.contato_nome || nomeCliente(c), { aoExcluir: recarregar, aviso: c.ativo ? `${nomeCliente(c)} ainda está ativo: desative o cliente (Editar) antes de pedir a exclusão. Continuar mesmo assim?` : undefined })) : null;
  return h("section", { class: "cartao" }, lgpd, h("dl", { class: "dados-lidos" }, linha("Contato", c.contato_nome), linha("WhatsApp", c.whatsapp), linha("E-mail", c.email), linha("Município", [c.municipio, c.uf].filter(Boolean).join("/")), linha("Funcionários", c.tem_funcionarios ? "Sim" : "Não"), linha("ICMS", c.contribuinte_icms ? "Contribuinte" : "Não"), linha("Serviços (ISS)", c.presta_servico ? "Sim" : "Não"), linha("Honorário", c.honorario_centavos ? reais(c.honorario_centavos) : ""), linha("Régua de cobrança", c.cobrar ? "Ligada" : "Desligada"), linha("Observações", c.observacoes)));
}

function esperados(c, recarregar) {
  const editarE = (e) => {
    const f = formulario([{ nome: "nome", rotulo: "Documento", obrigatorio: true, largura: 2, placeholder: "Ex.: Extrato do Sicoob" }, { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: Object.entries(TIPOS_ESPERADO) }, { nome: "dia_limite", rotulo: "Prazo (dia do mês)", tipo: "numero", min: 1, max: 31, padrao: 5 }, { nome: "departamento", rotulo: "Departamento", tipo: "select", opcoes: Object.entries(ctxAtual.eu.catalogos.departamentos) }, ...(e ? [{ nome: "ativo", rotulo: "Ativo", tipo: "check" }] : [])], e ?? { tipo: "outro", departamento: "contabil" });
    janela({ titulo: e ? "Editar documento esperado" : "Novo documento esperado", conteudo: h("div", { class: "pilha" }, f.el, h("p", { class: "suave pequeno" }, "O prazo vale para o mês seguinte à competência (variáveis de folha: o próprio mês).")), acoes: [e ? { texto: "Excluir", classe: "btn-perigo-fantasma", fn: (ev, fechar) => acao(ev.currentTarget, async () => (await confirmar("Excluir este documento esperado?", { perigo: true })) && (await del(`/esperados/${e.id}`), fechar(), recarregar())) } : null, { texto: "Salvar", classe: "btn-primario", fn: (ev, fechar) => acao(ev.currentTarget, async () => (e ? await put(`/esperados/${e.id}`, f.ler()) : await post(`/clientes/${c.id}/esperados`, f.ler()), fechar(), recarregar())) }].filter(Boolean) });
  };
  const comp = h("input", { class: "entrada", type: "month", value: competenciaAnterior() });
  return h(
    "div",
    { class: "pilha" },
    h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, "Todo mês, o cliente envia"), botao("Adicionar", () => editarE(), "btn-primario btn-pequeno", "mais")), tabela([{ titulo: "Documento", valor: (e) => e.nome }, { titulo: "Tipo", valor: (e) => TIPOS_ESPERADO[e.tipo] }, { titulo: "Prazo", valor: (e) => `dia ${e.dia_limite}` }, { titulo: "Departamento", valor: (e) => ctxAtual.eu.catalogos.departamentos[e.departamento] }, { titulo: "", valor: (e) => (e.ativo ? "" : sit("dispensado", "Inativo")) }], c.esperados, { aoClicar: editarE })),
    h("section", { class: "cartao" }, h("h2", {}, "Gerar uma competência"), h("p", { class: "suave pequeno" }, "Cria as pendências e as obrigações de um mês específico (sem duplicar o que já existe)."), h("div", { class: "filtros" }, comp, botao("Gerar", (e) => acao(e.currentTarget, async () => { const r = await post(`/clientes/${c.id}/gerar`, { competencia: comp.value }); aviso(`${r.pendencias} pendência(s) e ${r.tarefas} obrigação(ões) criadas.`); }), "btn-fantasma"))),
  );
}

async function pendencias(c, recarregar) {
  const lista = await get(`/pendencias?cliente=${c.id}`);
  return h("section", { class: "cartao" }, tabela([{ titulo: "Documento", valor: (p) => p.nome }, { titulo: "Competência", valor: (p) => mesBR(p.competencia) }, { titulo: "Prazo", valor: (p) => prazo(p.prazo, p.status === "pendente") }, { titulo: "Situação", valor: (p) => sit(p.status) }, { titulo: "Cobranças", valor: (p) => String(p.cobrancas), classe: "num" }, { titulo: "", valor: (p) => acoesPendencia(p, recarregar) }], lista, { vazio: "Nenhuma pendência." }));
}
export function acoesPendencia(p, recarregar) {
  return h(
    "div",
    { class: "acoes-linha" },
    p.status === "pendente" ? botao("Recebido", (e) => acao(e.currentTarget, async () => (await post(`/pendencias/${p.id}/receber`), recarregar())), "btn-fantasma btn-pequeno") : null,
    p.status === "pendente" ? botao("Dispensar", (e) => acao(e.currentTarget, async () => (await post(`/pendencias/${p.id}/dispensar`), recarregar())), "btn-fantasma btn-pequeno") : null,
    p.status !== "pendente" ? botao("Reabrir", (e) => acao(e.currentTarget, async () => (await post(`/pendencias/${p.id}/reabrir`), recarregar())), "btn-fantasma btn-pequeno") : null,
  );
}

async function documentos(c) {
  const lista = await get(`/documentos?cliente=${c.id}`);
  return h("section", { class: "cartao" }, tabela([{ titulo: "Recebido", valor: (d) => dataHora(d.criado_em) }, { titulo: "Arquivo", valor: (d) => d.nome }, { titulo: "Competência", valor: (d) => (d.competencia ? mesBR(d.competencia) : "—") }, { titulo: "Leitura", valor: (d) => sit(d.leitura_status) }, { titulo: "Situação", valor: (d) => sit(d.status) }], lista, { aoClicar: (d) => ctxAtual.navegar(`documentos/${d.id}`), vazio: "Nenhum documento recebido." }));
}

async function tarefas(c) {
  const lista = await get(`/tarefas?cliente=${c.id}`);
  return h("section", { class: "cartao" }, tabela([{ titulo: "Obrigação", valor: (t) => t.nome }, { titulo: "Competência", valor: (t) => mesBR(t.competencia) }, { titulo: "Prazo interno", valor: (t) => prazo(t.prazo_interno, !["concluida", "dispensada"].includes(t.status)) }, { titulo: "Vencimento", valor: (t) => dataBR(t.prazo_legal) }, { titulo: "Responsável", valor: (t) => t.responsavel ?? "—" }, { titulo: "Situação", valor: (t) => sit(t.status) }], lista, { aoClicar: () => ctxAtual.navegar("obrigacoes"), vazio: "Nenhuma obrigação." }));
}

function portal(c, recarregar) {
  const mostrarLink = (r) => janela({ titulo: "Convite do portal", conteudo: h("div", { class: "pilha" }, h("p", {}, "Envie este link ao cliente. Ele cria a senha e já entra. O link vale 7 dias e funciona uma vez."), h("div", { class: "copiavel" }, h("code", {}, r.link))), acoes: [{ texto: "Copiar link", classe: "btn-primario", fn: () => copiarTexto(r.link) }, c.whatsapp ? { texto: "Abrir no WhatsApp", classe: "btn-fantasma", fn: () => window.open(`https://wa.me/${c.whatsapp.replace(/\D/g, "").replace(/^(?!55)/, "55")}?text=${encodeURIComponent(`Olá! Este é o seu acesso ao portal do escritório: ${r.link}`)}`, "_blank", "noopener") } : null].filter(Boolean) });
  const novo = () => {
    const f = formulario([{ nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 }, { nome: "email", rotulo: "E-mail (login)", tipo: "email", obrigatorio: true, largura: 2 }, { nome: "whatsapp", rotulo: "WhatsApp", tipo: "tel", largura: 2, ajuda: "Os arquivos que essa pessoa mandar pelo WhatsApp caem direto nesta empresa." }], { nome: c.contato_nome, email: c.email, whatsapp: c.whatsapp });
    janela({ titulo: "Dar acesso ao portal", conteudo: f.el, acoes: [{ texto: "Criar convite", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { const r = await post(`/clientes/${c.id}/portal`, f.ler()); fechar(); mostrarLink(r); recarregar(); }) }] });
  };
  return h(
    "section",
    { class: "cartao" },
    h("div", { class: "cartao-topo" }, h("h2", {}, "Quem acessa o portal"), botao("Dar acesso", novo, "btn-primario btn-pequeno", "mais")),
    tabela(
      [
        { titulo: "Nome", valor: (p) => p.nome },
        { titulo: "E-mail", valor: (p) => p.email },
        { titulo: "WhatsApp", valor: (p) => p.whatsapp ?? "—" },
        { titulo: "Situação", valor: (p) => (!p.ativo ? sit("dispensado", "Bloqueado") : p.convite_pendente ? sit("pendente", "Convite enviado") : sit("recebido", "Ativo")) },
        { titulo: "Último acesso", valor: (p) => (p.ultimo_acesso ? dataHora(p.ultimo_acesso) : "—") },
        { titulo: "", valor: (p) => h("div", { class: "acoes-linha" }, botao("Novo convite", (e) => acao(e.currentTarget, async () => mostrarLink(await post(`/portal-usuarios/${p.id}/convite`))), "btn-fantasma btn-pequeno"), botao(p.ativo ? "Bloquear" : "Liberar", (e) => acao(e.currentTarget, async () => (await put(`/portal-usuarios/${p.id}`, { ativo: !p.ativo }), recarregar())), "btn-fantasma btn-pequeno"), ctxAtual.pode("dono", "admin") ? botoesTitular("contato", p.id, p.nome, { aoExcluir: recarregar }) : null) },
      ],
      c.portal,
      { vazio: "Ninguém desta empresa tem acesso ainda." },
    ),
  );
}

function envios(c) {
  return h("section", { class: "cartao" }, tabela([{ titulo: "Quando", valor: (e) => dataHora(e.criado_em) }, { titulo: "Canal", valor: (e) => (e.canal === "whatsapp" ? "WhatsApp" : "E-mail") }, { titulo: "Motivo", valor: (e) => ({ cobranca: "Cobrança de documentos", aviso_entrega: "Aviso de guia", chamado: "Resposta de chamado" })[e.motivo] ?? e.motivo }, { titulo: "Situação", valor: (e) => (e.status === "enviado" ? sit("recebido", "Enviado") : e.status === "pulado" ? sit("dispensado", "Não enviado") : sit("rejeitado", "Erro")) }, { titulo: "Detalhe", valor: (e) => e.erro ?? "" }], c.envios, { vazio: "Nenhuma mensagem enviada ainda." }));
}
