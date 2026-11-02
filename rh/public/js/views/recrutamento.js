/* Recrutamento: vagas, link público de candidatura e funil de candidatos (arrastar entre etapas). */

import { del, get, post, put } from "../api.js";
import { abas, acao, aviso, avatar, confirmar, copiarTexto, dataHora, h, icone, janela, limpar } from "../ui.js";
import { botao, dataBR, formulario, situacao, tabela, topo } from "../comum.js";

const ETAPAS = [["triagem", "Triagem"], ["entrevista", "Entrevista"], ["teste", "Teste / dinâmica"], ["proposta", "Proposta"], ["contratado", "Contratado"], ["reprovado", "Não seguiu"]];
let raizAtual;
let ctxAtual;
let aba = "funil";
let vagaFiltro = "";
const FONTES_NOME = { site: "Site", gupy: "Gupy", linkedin: "LinkedIn", indeed: "Indeed", infojobs: "InfoJobs", catho: "Catho", vagas: "Vagas.com", solides: "Solides", google: "Google", whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", indicacao: "Indicação", feed: "Agregadores", outra: "Outra" };

export async function render(raiz, ctx) {
  raizAtual = raiz;
  ctxAtual = ctx;
  await desenhar();
}

async function desenhar() {
  const [vagas, link] = await Promise.all([get("/vagas"), get("/vagas/link")]);
  const corpo = h("div", { class: "aba-corpo" });
  limpar(
    raizAtual,
    h(
      "div",
      { class: "pagina" },
      topo("Recrutamento", "Publique vagas, receba currículos pela sua página e acompanhe cada candidato.", botao("Copiar link da página de vagas", () => copiarTexto(link.link), "btn-fantasma", "link"), botao("Nova vaga", () => editarVaga(), "btn-primario", "mais")),
      abas([["funil", "Funil de candidatos"], ["vagas", `Vagas (${vagas.filter((v) => v.status === "aberta").length} abertas)`], ["integracoes", "Divulgação e integrações", "link"]], aba, (x) => ((aba = x), desenhar())),
      corpo,
    ),
  );
  limpar(corpo, aba === "vagas" ? listaVagas(vagas, link.link) : aba === "integracoes" ? await integracoes(vagas) : await funil(vagas));
}

function listaVagas(vagas, link) {
  return h(
    "section",
    { class: "cartao" },
    tabela(
      [
        { titulo: "Vaga", valor: (v) => h("strong", {}, v.titulo) },
        { titulo: "Modalidade", valor: (v) => v.modalidade ?? "—" },
        { titulo: "Local", valor: (v) => v.local ?? "—" },
        { titulo: "Candidatos", valor: (v) => v.candidatos },
        { titulo: "Situação", valor: (v) => situacao(v.status) },
        { titulo: "Origem", valor: (v) => (v.codigo_externo?.startsWith("gupy:") ? h("span", { class: "chip" }, "Gupy") : "Nexor RH") },
        { titulo: "", valor: (v) => h("div", { class: "tags" }, botao("Editar", (e) => (e.stopPropagation(), editarVaga(v)), "btn-pequeno btn-fantasma"), v.status === "aberta" ? botao("Divulgar", (e) => (e.stopPropagation(), divulgar(v)), "btn-pequeno btn-primario", "link") : null) },
      ],
      vagas,
      { aoClicar: (v) => ((vagaFiltro = v.id), (aba = "funil"), desenhar()), vazio: "Nenhuma vaga. Crie a primeira e divulgue o link." },
    ),
  );
}

function editarVaga(v) {
  const f = formulario([
    { nome: "titulo", rotulo: "Título da vaga", obrigatorio: true, largura: 2 },
    { nome: "modalidade", rotulo: "Modalidade", tipo: "select", opcoes: [["presencial", "Presencial"], ["hibrido", "Híbrido"], ["remoto", "Remoto"]] },
    { nome: "local", rotulo: "Cidade / bairro" },
    { nome: "estado", rotulo: "UF", placeholder: "MG" },
    { nome: "tipo_contrato", rotulo: "Tipo de contrato", tipo: "select", opcoes: [["clt", "Efetivo (CLT)"], ["meio_periodo", "Meio período"], ["temporario", "Temporário"], ["estagio", "Estágio"], ["aprendiz", "Jovem aprendiz"], ["pj", "PJ"]] },
    { nome: "salario", rotulo: "Faixa salarial (opcional)", placeholder: "R$ 2.500 a R$ 3.000", ajuda: "Com valor, o Google mostra o salário no anúncio." },
    { nome: "validade", rotulo: "Inscrições até", tipo: "data", ajuda: "Vazio = 60 dias." },
    { nome: "status", rotulo: "Situação", tipo: "select", opcoes: [["aberta", "Aberta"], ["pausada", "Pausada"], ["fechada", "Fechada"]] },
    { nome: "descricao", rotulo: "Descrição e atividades", tipo: "area", linhas: 5, largura: 2 },
    { nome: "requisitos", rotulo: "Requisitos", tipo: "area", largura: 2 },
  ], v ?? {});
  janela({
    titulo: v ? "Editar vaga" : "Nova vaga",
    largura: 640,
    conteudo: f.el,
    acoes: [v ? { texto: "Excluir", classe: "btn-perigo-fantasma", fn: (e, fechar) => acao(e.currentTarget, async () => (await confirmar("Excluir a vaga e todos os candidatos?", { perigo: true })) && (await del(`/vagas/${v.id}`), fechar(), desenhar())) } : null, { texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (v ? await put(`/vagas/${v.id}`, f.ler()) : await post("/vagas", f.ler()), fechar(), desenhar())) }].filter(Boolean),
  });
}

async function funil(vagas) {
  const cands = await get(`/candidatos${vagaFiltro ? `?vaga=${vagaFiltro}` : ""}`);
  const filtro = h("select", { class: "entrada", onchange: (e) => ((vagaFiltro = e.target.value), desenhar()) }, h("option", { value: "" }, "Todas as vagas"), vagas.map((v) => h("option", { value: v.id, selected: v.id === vagaFiltro }, v.titulo)));
  const mover = async (id, etapa) => {
    await put(`/candidatos/${id}`, { etapa });
    desenhar();
  };
  return h(
    "div",
    { class: "pilha" },
    h("div", { class: "linha-entre" }, filtro, botao("Adicionar candidato", () => novoCandidato(vagas), "btn-fantasma btn-pequeno", "mais")),
    h(
      "div",
      { class: "kanban" },
      ETAPAS.map(([id, nome]) => {
        const lista = cands.filter((c) => c.etapa === id);
        return h(
          "section",
          { class: "kanban-coluna", ondragover: (e) => e.preventDefault(), ondrop: (e) => (e.preventDefault(), mover(e.dataTransfer.getData("text/plain"), id)) },
          h("header", {}, h("strong", {}, nome), h("span", { class: "chip" }, lista.length)),
          h(
            "div",
            { class: "kanban-cartoes" },
            lista.map((c) =>
              h(
                "article",
                { class: "kanban-cartao", draggable: "true", ondragstart: (e) => e.dataTransfer.setData("text/plain", c.id), onclick: () => abrirCandidato(c) },
                h("div", { class: "celula-pessoa" }, avatar(c.nome, c.id, 28), h("div", {}, h("strong", {}, c.nome), h("br"), h("small", { class: "suave" }, c.vaga))),
                h("div", { class: "tags" }, h("span", { class: "chip" }, FONTES_NOME[c.origem] ?? c.origem ?? "site"), c.nota ? h("small", {}, "★".repeat(c.nota)) : null),
              ),
            ),
          ),
        );
      }),
    ),
  );
}

function abrirCandidato(c) {
  const nota = h("select", { class: "entrada" }, [0, 1, 2, 3, 4, 5].map((n) => h("option", { value: n, selected: (c.nota ?? 0) === n }, n ? "★".repeat(n) : "Sem nota")));
  const obs = h("textarea", { class: "entrada", rows: 4 });
  obs.value = c.observacoes ?? "";
  const etapa = h("select", { class: "entrada" }, ETAPAS.map(([v, t]) => h("option", { value: v, selected: v === c.etapa }, t)));
  janela({
    titulo: c.nome,
    conteudo: h(
      "div",
      { class: "pilha" },
      h("p", {}, `${c.vaga} · enviado em ${dataHora(c.criado_em)}`),
      h("p", {}, [c.email, c.telefone, c.cidade].filter(Boolean).join(" · ")),
      c.linkedin ? h("a", { href: c.linkedin, target: "_blank", rel: "noopener" }, "LinkedIn") : null,
      h("p", { class: "suave" }, `Origem: ${FONTES_NOME[c.origem] ?? c.origem}`),
      c.curriculo ? h("a", { class: "btn btn-fantasma", href: `/api/arquivos/${c.curriculo}`, target: "_blank" }, icone("nota", 16), "Abrir currículo") : null,
      c.curriculo_url ? h("a", { class: "btn btn-fantasma", href: c.curriculo_url, target: "_blank", rel: "noopener noreferrer" }, icone("nota", 16), "Currículo na plataforma de origem") : null,
      c.mensagem ? h("blockquote", { class: "citacao" }, c.mensagem) : null,
      h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Etapa"), etapa),
      h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Avaliação"), nota),
      h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Anotações da entrevista"), obs),
    ),
    acoes: [
      { texto: "Excluir (LGPD)", classe: "btn-perigo-fantasma", fn: (e, fechar) => acao(e.currentTarget, async () => (await confirmar("Excluir o candidato e o currículo?", { perigo: true })) && (await del(`/candidatos/${c.id}`), fechar(), desenhar())) },
      c.telefone ? h("a", { class: "btn btn-whats", href: `https://wa.me/55${c.telefone.replace(/\D/g, "").replace(/^55/, "")}`, target: "_blank", rel: "noopener" }, "WhatsApp") : null,
      { texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => { await put(`/candidatos/${c.id}`, { etapa: etapa.value, nota: Number(nota.value) || null, observacoes: obs.value }); if (etapa.value === "contratado") aviso("Candidato contratado! Faça a admissão em Colaboradores.", "info", 7000); fechar(); desenhar(); }) },
    ].filter(Boolean),
  });
}

function novoCandidato(vagas) {
  if (!vagas.length) return aviso("Crie uma vaga primeiro.", "erro");
  const f = formulario([{ nome: "vaga_id", rotulo: "Vaga", tipo: "select", opcoes: vagas.map((v) => [v.id, v.titulo]), largura: 2 }, { nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 }, { nome: "email", rotulo: "E-mail", tipo: "email" }, { nome: "telefone", rotulo: "Telefone", tipo: "tel" }, { nome: "cidade", rotulo: "Cidade" }, { nome: "linkedin", rotulo: "LinkedIn" }, { nome: "mensagem", rotulo: "Observações", tipo: "area", largura: 2 }], { vaga_id: vagaFiltro });
  janela({ titulo: "Adicionar candidato", conteudo: f.el, acoes: [{ texto: "Adicionar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post("/candidatos", f.ler()), fechar(), desenhar())) }] });
}

/* ---------- Divulgação e integrações ---------- */

async function divulgar(v) {
  const i = await get("/recrutamento/integracoes");
  const d = i.divulgacao.find((x) => x.id === v.id);
  if (!d) return aviso("Abra a vaga para divulgar.", "erro");
  janela({
    titulo: `Divulgar: ${v.titulo}`,
    largura: 640,
    conteudo: h(
      "div",
      { class: "pilha" },
      h("p", { class: "suave" }, "Cada canal tem um link próprio: assim você sabe de onde veio cada candidato. Nas plataformas pagas (Indeed, InfoJobs, Catho, Vagas.com), cole o link no campo de candidatura externa ou na descrição do anúncio."),
      h(
        "ul",
        { class: "lista-itens" },
        d.links.map((l) =>
          h("li", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, l.nome), h("small", { class: "suave mono" }, l.link)), h("div", { class: "tags" }, l.compartilhar ? h("a", { class: "btn btn-pequeno btn-primario", href: l.compartilhar, target: "_blank", rel: "noopener" }, "Publicar") : null, botao("Copiar link", () => copiarTexto(l.link), "btn-pequeno btn-fantasma"))),
        ),
      ),
    ),
  });
}

async function integracoes(vagas) {
  const i = await get("/recrutamento/integracoes");
  const total = i.por_origem.reduce((s, o) => s + o.n, 0);
  const csvArquivo = h("input", { type: "file", class: "entrada", accept: ".csv,text/csv" });
  const csvOrigem = h("select", { class: "entrada" }, Object.entries(i.fontes).filter(([k]) => k !== "site").map(([k, n]) => h("option", { value: k }, n)));
  const csvVaga = h("select", { class: "entrada" }, h("option", { value: "" }, "Pela coluna \"Vaga\" da planilha"), vagas.map((v) => h("option", { value: v.id }, v.titulo)));
  const csvRes = h("div");
  const gupyToken = h("input", { class: "entrada", type: "password", autocomplete: "off", placeholder: i.gupy.ativo ? "•••••••• (salvo)" : "Cole o token da API da Gupy" });
  const gupyBase = h("input", { class: "entrada", value: i.gupy.base });

  const importar = async (simular, botaoEl) =>
    acao(botaoEl, async () => {
      const a = csvArquivo.files[0];
      if (!a) throw new Error("Escolha a planilha (.csv).");
      const texto = await a.text();
      const r = await post("/recrutamento/importar-csv", { csv: texto, origem: csvOrigem.value, vaga_id: csvVaga.value || undefined, simular });
      limpar(csvRes, simular
        ? h("div", { class: "pilha" }, h("p", {}, `${r.total} candidato(s) encontrados. Colunas reconhecidas: ${Object.entries(r.colunas).map(([k, c]) => `${k} ← "${c}"`).join(", ")}`), tabela([{ titulo: "Nome", valor: (c) => c.nome ?? "—" }, { titulo: "E-mail", valor: (c) => c.email ?? "—" }, { titulo: "Telefone", valor: (c) => c.telefone ?? "—" }, { titulo: "Vaga", valor: (c) => c.vaga_titulo ?? "—" }], r.exemplo))
        : h("p", { class: "chip chip-ok" }, `✅ ${r.criados} novos, ${r.atualizados} atualizados${r.vagas_criadas ? `, ${r.vagas_criadas} vaga(s) criada(s) pausadas` : ""}${r.ignorados ? `, ${r.ignorados} linhas sem nome/e-mail` : ""}.`));
    });

  return h(
    "div",
    { class: "pilha" },
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "De onde vêm os candidatos"),
      total
        ? h("div", { class: "barras-h" }, i.por_origem.map((o) => h("div", { class: "barra-h" }, h("span", {}, i.fontes[o.origem] ?? o.origem), h("div", { class: "barra-h-trilho" }, h("i", { style: { width: `${(o.n / i.por_origem[0].n) * 100}%` } })), h("strong", {}, `${o.n}${o.contratados ? ` · ${o.contratados} contratado(s)` : ""}`))))
        : h("p", { class: "suave" }, "Ainda sem candidatos. Divulgue as vagas pelos links abaixo."),
    ),
    h(
      "div",
      { class: "grade-form" },
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Google Vagas e agregadores (grátis)"),
        h("p", {}, "Cada vaga aberta tem uma página própria com os dados no padrão do Google (schema.org/JobPosting). Assim ela pode aparecer na busca de empregos do Google, com salário e local."),
        h("p", {}, h("strong", {}, "Feed XML de vagas: "), "cadastre este endereço uma vez nos sites que aceitam feed (Indeed, Jooble, Talent.com, Careerjet, Adzuna…). Vaga aberta entra, vaga fechada sai, sozinho."),
        h("div", { class: "copiavel" }, h("code", {}, i.feed)),
        h("div", { class: "tags" }, botao("Copiar feed", () => copiarTexto(i.feed), "btn-pequeno btn-fantasma", "copiar"), botao("Copiar sitemap", () => copiarTexto(i.sitemap), "btn-pequeno btn-fantasma", "copiar"), h("a", { class: "btn btn-pequeno btn-fantasma", href: i.pagina, target: "_blank" }, "Ver página de vagas")),
        h("p", { class: "suave pequeno" }, "Envie o sitemap no Google Search Console do seu domínio para as vagas serem encontradas mais rápido. Cada agregador decide se aceita o feed e pode pedir cadastro como empresa."),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Divulgar em LinkedIn, Indeed, InfoJobs, Catho, Vagas.com"),
        h("p", {}, "Cada vaga tem links próprios por canal. No LinkedIn, WhatsApp e Facebook você publica com um clique. Nas plataformas de anúncio, use o link como \"candidatura externa\": o candidato cai direto no seu funil, marcado com a origem."),
        vagas.filter((v) => v.status === "aberta").length
          ? h("ul", { class: "lista-itens" }, vagas.filter((v) => v.status === "aberta").map((v) => h("li", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, v.titulo)), botao("Divulgar", () => divulgar(v), "btn-pequeno btn-primario", "link"))))
          : h("p", { class: "suave" }, "Nenhuma vaga aberta."),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Gupy (API)"),
        h("p", {}, "Traz as vagas publicadas na Gupy e todas as candidaturas, com a etapa de cada um. As vagas entram pausadas aqui (continuam publicadas só na Gupy) e os candidatos vão para o funil. Rodar de novo atualiza sem duplicar."),
        h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Token da API (gerado na Gupy, em Configurações → Integrações)"), gupyToken),
        h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Endereço da API"), gupyBase),
        i.gupy.ultima_sincronizacao ? h("p", { class: "suave" }, `Última sincronização: ${new Date(i.gupy.ultima_sincronizacao).toLocaleString("pt-BR")} · ${i.gupy.resultado?.vagas ?? 0} vagas · ${i.gupy.resultado?.criados ?? 0} novos candidatos`) : null,
        h(
          "div",
          { class: "tags" },
          botao("Salvar", (e) => acao(e.currentTarget, async () => (await put("/recrutamento/gupy", { token: gupyToken.value || undefined, base: gupyBase.value || undefined }), aviso("Integração com a Gupy salva."), desenhar())), "btn-pequeno btn-fantasma"),
          i.gupy.ativo ? botao("Sincronizar agora", (e) => acao(e.currentTarget, async () => { const r = await post("/recrutamento/gupy/sincronizar"); aviso(`Gupy: ${r.vagas} vagas, ${r.criados} candidatos novos, ${r.atualizados} atualizados.`, "ok", 7000); desenhar(); }), "btn-pequeno btn-primario", "raio") : null,
          i.gupy.ativo ? botao("Desconectar", (e) => acao(e.currentTarget, async () => (await put("/recrutamento/gupy", { remover: true }), desenhar())), "btn-pequeno btn-perigo-fantasma") : null,
        ),
        h("p", { class: "suave pequeno" }, "O acesso à API é liberado pela Gupy conforme o plano contratado. O conector usa o formato padrão da API; se a sua conta usar outro endereço, ajuste acima."),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Webhook: candidatos em tempo real"),
        h("p", {}, "Para plataformas que avisam a cada nova candidatura (Gupy, Solides, formulários, Zapier, Make, Pipefy…). Cada envio vira candidato no funil na hora, sem duplicar."),
        i.webhook.ativo ? h("p", { class: "chip chip-ok" }, `✅ Webhook ativo desde ${dataBR(new Date(i.webhook.criado_em).toISOString().slice(0, 10))}`) : null,
        botao(i.webhook.ativo ? "Gerar novo endereço (desativa o atual)" : "Gerar endereço do webhook", (e) =>
          acao(e.currentTarget, async () => {
            const r = await post("/recrutamento/webhook-token");
            janela({ titulo: "Endereços do webhook", largura: 680, conteudo: h("div", { class: "pilha" }, h("p", {}, "Cole o endereço da sua plataforma no cadastro de webhooks dela (evento de nova candidatura e mudança de etapa). Guarde: ele só aparece agora."), Object.entries(r.urls).map(([f, u]) => h("div", { class: "pilha" }, h("strong", {}, { gupy: "Gupy", solides: "Solides", generico: "Outras plataformas (JSON com nome, email, telefone, vaga)" }[f]), h("div", { class: "copiavel" }, h("code", {}, u)), botao("Copiar", () => copiarTexto(u), "btn-pequeno btn-fantasma")))) });
            desenhar();
          }), "btn-pequeno btn-primario"),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Importar planilha"),
        h("p", {}, "Exporte os candidatos da Catho, InfoJobs, Vagas.com, LinkedIn Recruiter, Indeed ou Gupy em CSV e traga para o funil. As colunas (Nome, E-mail, Telefone, Cidade, Vaga…) são reconhecidas sozinhas."),
        h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Planilha (.csv)"), csvArquivo),
        h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "De qual plataforma"), csvOrigem),
        h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Para qual vaga"), csvVaga),
        h("div", { class: "tags" }, botao("Conferir antes", (e) => importar(true, e.currentTarget), "btn-pequeno btn-fantasma"), botao("Importar", (e) => importar(false, e.currentTarget), "btn-pequeno btn-primario", "upload")),
        csvRes,
        h("p", { class: "suave pequeno" }, "No Excel: Arquivo → Salvar como → CSV UTF-8."),
      ),
    ),
  );
}
