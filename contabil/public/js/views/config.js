/* Configurações do escritório: dados, equipe, WhatsApp e e-mail, régua, catálogo de obrigações, exportação,
   auditoria, vínculo com a Nexor e a área do Suporte Nexor. */

import { get, post, put } from "../api.js";
import { abas, acao, aviso, copiarTexto, dataHora, h, janela, limpar } from "../ui.js";
import { botao, cnpjBR, formulario, tabela, topo } from "../comum.js";
import { sit } from "../base.js";
import { PAPEIS } from "../app.js";

let ctxAtual;
let aba = "escritorio";
let raizAtual;
export async function render(raiz, ctx, [sub]) {
  ctxAtual = ctx;
  raizAtual = raiz;
  if (sub) aba = sub;
  await desenhar();
}
async function desenhar() {
  const itens = [["escritorio", "Escritório"], ["usuarios", "Equipe"], ["canais", "WhatsApp e e-mail"], ["regua", "Régua de cobrança"], ["obrigacoes", "Obrigações"], ["exportacao", "Exportação e contas"], ["auditoria", "Auditoria"], ctxAtual.nexor ? ["nexor", "Nexor · desenvolvedor", "escudo"] : null].filter(Boolean).filter(([id]) => !ctxAtual.oculto(`config.${id}`));
  if (!itens.some(([i]) => i === aba)) aba = itens[0][0];
  const corpo = h("div", { class: "aba-corpo" });
  limpar(raizAtual, h("div", { class: "pagina" }, topo("Configurações"), abas(itens, aba, (x) => ((aba = x), history.replaceState(null, "", `#/config/${x}`), desenhar())), corpo));
  limpar(corpo, await { escritorio, usuarios, canais, regua, obrigacoes, exportacao, auditoria, nexor }[aba]());
}
const cartaoForm = (titulo, f, salvar, extra) => h("form", { class: "cartao", onsubmit: (e) => (e.preventDefault(), acao(e.submitter, async () => (await salvar(f.ler()), aviso("Salvo."), await ctxAtual.recarregarEu()))) }, h("h2", {}, titulo), extra, f.el, h("div", { class: "barra-salvar" }, h("button", { class: "btn btn-primario", type: "submit" }, "Salvar")));

async function escritorio() {
  const e = await get("/escritorio");
  const c = e.config;
  const f = formulario([{ nome: "razao_social", rotulo: "Razão social", obrigatorio: true, largura: 2 }, { nome: "nome_fantasia", rotulo: "Nome do escritório (aparece para os clientes)", largura: 2 }, { nome: "cnpj", rotulo: "CNPJ" }, { nome: "crc", rotulo: "CRC" }], { ...e, cnpj: cnpjBR(e.cnpj) });
  const a = formulario([{ nome: "ativo", rotulo: "A IA responde os clientes no WhatsApp (documentos faltando, guias, chamados)", tipo: "check", largura: 2 }, { nome: "assinatura", rotulo: "Assinatura das mensagens", placeholder: "Ex.: Equipe Contábil Exemplo", largura: 2 }], c.assistente);
  const p = formulario([{ nome: "cor", rotulo: "Cor do portal", placeholder: "#0f766e" }, { nome: "boas_vindas", rotulo: "Mensagem de boas-vindas no portal", tipo: "area", largura: 2 }], c.portal);
  return h(
    "div",
    { class: "grade-form" },
    cartaoForm("Dados do escritório", f, (d) => put("/escritorio", d)),
    cartaoForm("Assistente do WhatsApp", a, (d) => put("/escritorio", { assistente: d }), h("p", { class: "suave pequeno" }, "Assuntos de interpretação, valores ou decisão viram chamado para a equipe. A IA nunca dá opinião tributária.")),
    cartaoForm("Portal do cliente", p, (d) => put("/escritorio", { portal: d }), h("p", { class: "suave pequeno" }, ["Endereço do portal para os clientes: ", h("code", {}, `${location.origin}/portal/`)])),
    vincular(),
  );
}
function vincular() {
  if (ctxAtual.eu.licenca?.vinculado || !ctxAtual.pode("dono", "admin")) return null;
  const codigo = h("input", { class: "entrada", placeholder: "NX-XXXX-XXXX", maxlength: 20, autocomplete: "off", style: { textTransform: "uppercase", letterSpacing: ".06em" } });
  return h("form", { class: "cartao", onsubmit: (ev) => (ev.preventDefault(), acao(ev.submitter, async () => { const r = await post("/nexor/vincular", { codigo: codigo.value }); aviso(`Sistema vinculado à Nexor (${r.cliente}).`); await ctxAtual.recarregarEu(); desenhar(); })) }, h("h2", {}, "Vincular à Nexor"), h("p", { class: "suave pequeno" }, "Digite o código do cliente informado pela Nexor. O sistema passa a receber suporte, licença e monitoramento."), h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Código do cliente"), codigo), h("div", { class: "barra-salvar" }, h("button", { class: "btn btn-primario", type: "submit" }, "Vincular")));
}

async function usuarios() {
  const lista = await get("/usuarios");
  const deps = Object.entries(ctxAtual.eu.catalogos.departamentos);
  const editar = (u) => {
    const f = formulario([{ nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 }, ...(u ? [] : [{ nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largura: 2 }]), { nome: "papel", rotulo: "Perfil", tipo: "select", opcoes: [["equipe", "Equipe: o dia a dia"], ["admin", "Administrador: tudo, inclusive configurações"]], desativado: u?.papel === "dono" }, { nome: "departamento", rotulo: "Departamento", tipo: "select", opcoes: deps }, { nome: "senha", rotulo: u ? "Nova senha (opcional)" : "Senha", tipo: "senha", obrigatorio: !u, largura: 2 }, ...(u && u.papel !== "dono" ? [{ nome: "ativo", rotulo: "Ativo", tipo: "check" }] : [])], u ?? { papel: "equipe", departamento: "contabil" });
    janela({ titulo: u ? `Editar ${u.nome}` : "Nova pessoa na equipe", conteudo: f.el, acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (u ? await put(`/usuarios/${u.id}`, f.ler()) : await post("/usuarios", f.ler()), fechar(), desenhar())) }] });
  };
  return h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, "Equipe"), botao("Adicionar", () => editar(), "btn-primario btn-pequeno", "mais")), tabela([{ titulo: "Nome", valor: (u) => u.nome }, { titulo: "E-mail", valor: (u) => u.email }, { titulo: "Perfil", valor: (u) => PAPEIS[u.papel] }, { titulo: "Departamento", valor: (u) => ctxAtual.eu.catalogos.departamentos[u.departamento] }, { titulo: "Situação", valor: (u) => (u.ativo ? "Ativo" : "Desativado") }], lista, { aoClicar: editar }));
}

async function canais() {
  const e = await get("/escritorio");
  const w = e.config.whatsapp;
  const m = e.config.email;
  const fw = formulario([{ nome: "id_numero", rotulo: "ID do número de telefone (Meta)", placeholder: "Ex.: 123456789012345" }, { nome: "token", rotulo: w.token ? "Token de acesso (deixe vazio para manter)" : "Token de acesso permanente", tipo: "senha" }, { nome: "segredo_app", rotulo: w.segredo ? "Segredo do app (deixe vazio para manter)" : "Segredo do app (confere o webhook)", tipo: "senha" }, { nome: "template_cobranca", rotulo: "Modelo aprovado: cobrança de documentos", placeholder: "Ex.: cobranca_documentos", ajuda: "4 variáveis: {{1}} nome, {{2}} escritório, {{3}} lista, {{4}} link do portal." }, { nome: "template_aviso", rotulo: "Modelo aprovado: aviso de guia", placeholder: "Ex.: aviso_guia", ajuda: "4 variáveis: {{1}} nome, {{2}} escritório, {{3}} guia, {{4}} link." }, { nome: "idioma", rotulo: "Idioma dos modelos", placeholder: "pt_BR" }], { ...w, token: "", segredo: "" }); // segredos nunca voltam ao navegador
  const fm = formulario([{ nome: "remetente", rotulo: "Remetente", placeholder: "Contábil Exemplo <nao-responda@seudominio.com.br>", largura: 2 }, { nome: "chave", rotulo: m.chave ? "Chave da API do Resend (deixe vazio para manter)" : "Chave da API do Resend", tipo: "senha", largura: 2 }], { ...m, chave: "" });
  const destino = h("input", { class: "entrada", placeholder: "WhatsApp (5534999990000) ou e-mail para teste" });
  const webhook = `${location.origin}/webhook/whatsapp`;
  return h(
    "div",
    { class: "grade-form" },
    cartaoForm("WhatsApp do escritório (API oficial da Meta)", fw, (d) => put("/canais", { whatsapp: d }), h("div", { class: "pilha pequeno" }, h("span", {}, "Situação: ", w.token && w.id_numero ? sit("recebido", "Configurado") : sit("pendente", "Falta configurar")), h("span", {}, "URL do webhook: ", h("code", {}, webhook), " ", h("button", { type: "button", class: "btn-link", onclick: () => copiarTexto(webhook) }, "copiar")), w.verificacao ? h("span", {}, "Token de verificação: ", h("code", {}, w.verificacao), " ", h("button", { type: "button", class: "btn-link", onclick: () => copiarTexto(w.verificacao) }, "copiar")) : h("span", { class: "suave" }, "O token de verificação aparece depois de salvar."), h("span", { class: "suave" }, "Fora da janela de 24 h desde a última mensagem do cliente, a Meta só entrega modelos aprovados: cadastre os dois modelos no Gerenciador do WhatsApp."))),
    cartaoForm("E-mail (Resend)", fm, (d) => put("/canais", { email: d }), h("p", { class: "suave pequeno" }, "Crie a conta em resend.com, verifique o domínio do escritório e gere a chave.")),
    h("section", { class: "cartao pilha" }, h("h2", {}, "Testar envio"), destino, h("div", { class: "acoes-linha" }, botao("Testar WhatsApp", (ev) => acao(ev.currentTarget, async () => (await post("/canais/testar", { canal: "whatsapp", destino: destino.value }), aviso("Mensagem de teste enviada."))), "btn-fantasma"), botao("Testar e-mail", (ev) => acao(ev.currentTarget, async () => (await post("/canais/testar", { canal: "email", destino: destino.value }), aviso("E-mail de teste enviado."))), "btn-fantasma"))),
  );
}

async function regua() {
  const r = ctxAtual.eu.escritorio.config.regua;
  const f = formulario([{ nome: "ativa", rotulo: "Cobrar automaticamente todos os dias às 9h", tipo: "check", largura: 2 }, { nome: "antes", rotulo: "Primeiro lembrete (dias antes do prazo)", tipo: "numero", min: 0, max: 15 }, { nome: "a_cada", rotulo: "Depois, repetir a cada (dias)", tipo: "numero", min: 1, max: 30 }, { nome: "maximo", rotulo: "Máximo de lembretes por documento", tipo: "numero", min: 1, max: 15 }, { nome: "whatsapp", rotulo: "Por WhatsApp", tipo: "check" }, { nome: "email", rotulo: "Por e-mail", tipo: "check" }], { ...r, whatsapp: r.canais.includes("whatsapp"), email: r.canais.includes("email") });
  return h("div", { class: "grade-form" }, cartaoForm("Régua de cobrança de documentos", f, ({ whatsapp, email, ...d }) => put("/regua", { ...d, canais: [whatsapp ? "whatsapp" : null, email ? "email" : null].filter(Boolean) }), h("p", { class: "suave pequeno" }, "Cada cliente recebe uma mensagem só, com a lista de tudo que falta. Clientes com a régua desligada no cadastro não recebem.")), h("section", { class: "cartao pilha" }, h("h2", {}, "Rodar agora"), h("p", { class: "suave pequeno" }, "Gera as pendências e obrigações do mês e envia as cobranças devidas hoje (a rotina já roda sozinha uma vez por dia)."), botao("Rodar a rotina agora", (ev) => acao(ev.currentTarget, async () => { const x = (await post("/rotina")).resultado[0]; aviso(x ? `${x.pendencias} pendência(s), ${x.tarefas} obrigação(ões) e ${x.cobrados} cobrança(s).` : "Nada a fazer."); }), "btn-fantasma")));
}

async function obrigacoes() {
  const lista = await get("/obrigacoes");
  const cat = ctxAtual.eu.catalogos;
  const regraTexto = (o) => {
    const r = o.regra;
    const quando = r.tipo === "ultimo_dia_util" ? "último dia útil" : r.tipo === "dia_util" ? `${r.dia}º dia útil` : `dia ${r.dia}${r.ajuste === "posterga" ? " (posterga)" : r.ajuste === "antecipa" ? " (antecipa)" : ""}`;
    return o.periodicidade === "anual" ? `${quando} de ${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][(r.mes_fixo ?? 12) - 1]} do ano seguinte` : `${quando}, ${r.mes ?? 1} mês(es) depois`;
  };
  const editar = (o) => {
    const v = o ? { ...o, ...o.regra, ...Object.fromEntries(Object.keys(cat.regimes).map((k) => [`r_${k}`, o.regimes.includes(k)])), c_func: o.condicao?.tem_funcionarios, c_icms: o.condicao?.contribuinte_icms, c_serv: o.condicao?.presta_servico } : { periodicidade: "mensal", tipo: "dia", dia: 20, mes: 1, ajuste: "antecipa", antecedencia: 3, departamento: "fiscal", ativo: true };
    const f = formulario([{ nome: "nome", rotulo: "Obrigação", obrigatorio: true, largura: 2 }, { nome: "departamento", rotulo: "Departamento", tipo: "select", opcoes: Object.entries(cat.departamentos) }, { nome: "periodicidade", rotulo: "Periodicidade", tipo: "select", opcoes: [["mensal", "Mensal"], ["trimestral", "Trimestral"], ["anual", "Anual"]] }, { titulo: "Regimes" }, ...Object.entries(cat.regimes).map(([k, t]) => ({ nome: `r_${k}`, rotulo: t, tipo: "check" })), { titulo: "Só para quem…" }, { nome: "c_func", rotulo: "tem funcionários", tipo: "check" }, { nome: "c_icms", rotulo: "é contribuinte de ICMS", tipo: "check" }, { nome: "c_serv", rotulo: "presta serviços", tipo: "check" }, { titulo: "Vencimento" }, { nome: "tipo", rotulo: "Regra", tipo: "select", opcoes: [["dia", "Dia fixo"], ["dia_util", "N-ésimo dia útil"], ["ultimo_dia_util", "Último dia útil"]] }, { nome: "dia", rotulo: "Dia", tipo: "numero", min: 1, max: 31 }, { nome: "mes", rotulo: "Meses depois da competência", tipo: "numero", min: 0, max: 12 }, { nome: "mes_fixo", rotulo: "Mês (anuais)", tipo: "numero", min: 1, max: 12 }, { nome: "ajuste", rotulo: "Dia não útil", tipo: "select", opcoes: [["antecipa", "Antecipa"], ["posterga", "Posterga"], ["nenhum", "Mantém"]] }, { nome: "antecedencia", rotulo: "Prazo interno (dias antes)", tipo: "numero", min: 0, max: 60 }, { nome: "ativo", rotulo: "Ativa", tipo: "check" }], v);
    janela({
      titulo: o ? o.nome : "Nova obrigação",
      largura: 680,
      conteudo: h("div", { class: "pilha" }, f.el, h("p", { class: "suave pequeno" }, "Mudar o prazo recalcula as tarefas em aberto desta obrigação.")),
      acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { const d = f.ler(); const condicao = Object.fromEntries([["tem_funcionarios", d.c_func], ["contribuinte_icms", d.c_icms], ["presta_servico", d.c_serv]].filter(([, x]) => x).map(([k]) => [k, true])); const corpo = { nome: d.nome, departamento: d.departamento, periodicidade: d.periodicidade, regimes: Object.keys(cat.regimes).filter((k) => d[`r_${k}`]), condicao: Object.keys(condicao).length ? condicao : null, regra: { tipo: d.tipo, dia: d.dia ?? undefined, mes: d.mes ?? undefined, mes_fixo: d.mes_fixo ?? undefined, ajuste: d.ajuste }, antecedencia: d.antecedencia ?? 0, ativo: d.ativo }; o ? await put(`/obrigacoes/${o.id}`, corpo) : await post("/obrigacoes", corpo); fechar(); desenhar(); }) }],
    });
  };
  return h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, "Catálogo de obrigações"), botao("Nova obrigação", () => editar(), "btn-primario btn-pequeno", "mais")), h("p", { class: "suave pequeno" }, "Prazos padrão federais, editáveis. Confira no início de cada ano e ajuste os prazos estaduais (EFD ICMS) e municipais (ISS) da sua região."), tabela([{ titulo: "Obrigação", valor: (o) => o.nome }, { titulo: "Departamento", valor: (o) => cat.departamentos[o.departamento] }, { titulo: "Regimes", valor: (o) => o.regimes.map((r) => cat.regimes[r]).join(", ") }, { titulo: "Vencimento", valor: regraTexto }, { titulo: "Prazo interno", valor: (o) => `${o.antecedencia} dia(s) antes` }, { titulo: "", valor: (o) => (o.ativo ? "" : sit("dispensado", "Inativa")) }], lista, { aoClicar: editar }));
}

async function exportacao() {
  const c = ctxAtual.eu.escritorio.config;
  const x = c.exportacao;
  const COLS = { data: "Data", debito: "Débito", credito: "Crédito", valor: "Valor", historico: "Histórico", documento: "Documento", cnpj_cliente: "CNPJ do cliente", competencia: "Competência" };
  const ordem = h("input", { class: "entrada", value: x.colunas.join(", ") });
  const f = formulario([{ nome: "separador", rotulo: "Separador", tipo: "select", opcoes: [[";", "Ponto e vírgula (;)"], [",", "Vírgula (,)"], ["|", "Barra (|)"], ["tab", "Tabulação"]] }, { nome: "data", rotulo: "Formato da data", tipo: "select", opcoes: [["dd/mm/aaaa", "dd/mm/aaaa"], ["aaaa-mm-dd", "aaaa-mm-dd"], ["ddmmaaaa", "ddmmaaaa"]] }, { nome: "decimal", rotulo: "Decimal do valor", tipo: "select", opcoes: [[",", "Vírgula (1234,56)"], [".", "Ponto (1234.56)"]] }, { nome: "cabecalho", rotulo: "Primeira linha com os nomes das colunas", tipo: "check" }], x);
  const ct = formulario(Object.entries({ bancos: "Bancos", fornecedores: "Fornecedores", clientes: "Clientes", receita: "Receita", despesa: "Despesas a classificar", entradas: "Entradas do extrato", saidas: "Saídas do extrato", impostos: "Impostos" }).map(([k, t]) => ({ nome: k, rotulo: t, obrigatorio: true })), c.contas);
  return h(
    "div",
    { class: "grade-form" },
    h("form", { class: "cartao", onsubmit: (e) => (e.preventDefault(), acao(e.submitter, async () => (await put("/exportacao", { exportacao: { ...f.ler(), colunas: ordem.value.split(",").map((s) => s.trim()).filter(Boolean) } }), aviso("Layout salvo."), ctxAtual.recarregarEu()))) }, h("h2", {}, "Layout do arquivo de importação"), h("p", { class: "suave pequeno" }, "Monte o arquivo na ordem que o leiaute de importação do seu sistema contábil (Domínio, Alterdata, Questor, Fortes…) pede. Faça um teste de importação com um cliente antes de usar na carteira."), f.el, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Colunas, na ordem"), ordem, h("small", { class: "campo-ajuda" }, `Disponíveis: ${Object.keys(COLS).join(", ")}`)), h("div", { class: "barra-salvar" }, h("button", { class: "btn btn-primario", type: "submit" }, "Salvar"))),
    h("form", { class: "cartao", onsubmit: (e) => (e.preventDefault(), acao(e.submitter, async () => (await put("/exportacao", { contas: ct.ler() }), aviso("Contas salvas."), ctxAtual.recarregarEu()))) }, h("h2", {}, "Contas padrão das sugestões"), h("p", { class: "suave pequeno" }, "Use o código ou o nome das contas do plano do escritório. As correções feitas nos documentos são aprendidas por cliente."), ct.el, h("div", { class: "barra-salvar" }, h("button", { class: "btn btn-primario", type: "submit" }, "Salvar"))),
  );
}

async function auditoria() {
  const lista = await get("/auditoria");
  return h("section", { class: "cartao" }, tabela([{ titulo: "Quando", valor: (a) => dataHora(a.criado_em) }, { titulo: "Quem", valor: (a) => a.autor }, { titulo: "Ação", valor: (a) => a.acao.replace(/_/g, " ") }, { titulo: "Detalhe", valor: (a) => (a.detalhe ? JSON.stringify(a.detalhe).slice(0, 120) : "") }], lista));
}

async function nexor() {
  const d = await get("/nexor/ajustes");
  const marcados = new Set(d.ocultos);
  const grupo = (titulo, itens) => h("div", { class: "nexor-grupo" }, h("h3", {}, titulo), Object.entries(itens).map(([k, item]) => h("label", { class: "linha-check" }, h("input", { type: "checkbox", checked: marcados.has(k), onchange: (e) => (e.target.checked ? marcados.add(k) : marcados.delete(k)) }), h("span", {}, item.rotulo))));
  const c = d.central;
  const rot = { ativo: ["Ativo", "ok"], aviso: ["Aviso de fatura", "alerta"], restrito: ["Somente leitura", "perigo"], bloqueado: ["Bloqueado", "perigo"] }[d.licenca.situacao] ?? [d.licenca.situacao, ""];
  return h(
    "div",
    { class: "grade-form" },
    h("section", { class: "cartao" }, h("h2", {}, "O que o escritório vê"), h("p", { class: "suave pequeno" }, "Marque o que fica escondido da equipe do escritório. Você continua vendo tudo."), grupo("Módulos", d.catalogo.modulos), grupo("Abas de configuração", d.catalogo.abas), h("div", { class: "barra-salvar" }, h("button", { class: "btn btn-primario", type: "button", onclick: (e) => acao(e.currentTarget, async () => (await put("/nexor/ajustes", { ocultos: [...marcados] }), aviso("Ajustes salvos."), ctxAtual.recarregarEu())) }, "Salvar"))),
    h("section", { class: "cartao" }, h("h2", {}, "Contrato e Nexor Central"), h("p", {}, "Situação: ", h("span", { class: `chip chip-${rot[1]}` }, rot[0])), d.licenca.mensagem ? h("p", { class: "suave" }, d.licenca.mensagem) : null, h("p", { class: "suave pequeno" }, c.configurada ? `Central: ${c.central} · último contato: ${c.ultimo_contato ? dataHora(c.ultimo_contato) : "nenhum"}` : "Não vinculado à Nexor Central."), c.erro ? h("p", { class: "pequeno", style: { color: "var(--vermelho)" } }, `Último erro: ${c.erro}`) : null, c.configurada ? h("div", { class: "barra-salvar" }, h("button", { class: "btn btn-fantasma", type: "button", onclick: (e) => acao(e.currentTarget, async () => { const r = await post("/nexor/sincronizar"); aviso(r.ok ? `Sincronizado: ${r.situacao}.` : `Falhou: ${r.erro}`, r.ok ? "ok" : "erro"); await ctxAtual.recarregarEu(); desenhar(); }) }, "Sincronizar agora")) : null),
  );
}
