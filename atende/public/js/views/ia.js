/* Cérebro da IA: personalidade, base de conhecimento, catálogo, aprendizados e simulador. */

import { del, get, post, put } from "../api.js";
import { abas, acao, area, aviso, campo, chave, confirmar, entrada, erro, h, icone, janela, limpar, reais, seletor, textoWhatsApp, vazio } from "../ui.js";

const ABAS = [
  ["perfil", "Personalidade", "robo"],
  ["conhecimento", "Conhecimento", "livro"],
  ["catalogo", "Catálogo", "caixa"],
  ["aprendizados", "Aprendizados", "aprender"],
  ["simulador", "Simulador", "play"],
];

let ctxApp;
let raizAtual;

export async function render(raiz, ctx, [aba = "perfil"]) {
  ctxApp = ctx;
  raizAtual = raiz;
  const corpo = h("div", { class: "aba-corpo" });
  const trocar = (id) => {
    history.replaceState(null, "", `#/ia/${id}`);
    limpar(topoAbas, abas(ABAS, id, trocar));
    limpar(corpo, h("div", { class: "carregando-bloco" }, h("span", { class: "girando" })));
    ({ perfil, conhecimento, catalogo, aprendizados, simulador })[id](corpo).catch(erro);
  };
  const topoAbas = h("div");
  raiz.append(h("div", { class: "pagina" }, h("header", { class: "pagina-topo" }, h("div", {}, h("h1", {}, "Cérebro da IA"), h("p", { class: "suave" }, "Tudo o que a sua atendente virtual sabe e como ela se comporta."))), topoAbas, corpo));
  trocar(ABAS.some((a) => a[0] === aba) ? aba : "perfil");
}

const salvarConfig = (config) => put("/empresa", { config });
const podeEditar = () => ["dono", "admin"].includes(ctxApp.eu.usuario.papel);

/* ---------- Personalidade ---------- */

async function perfil(alvo) {
  const eu = await ctxApp.recarregarEu();
  const a = eu.empresa.config.agente;
  const f = {
    nome: entrada({ value: a.nome, maxlength: 40 }),
    modo: seletor(
      [
        ["automatico", "Automático: a IA responde sozinha"],
        ["copiloto", "Copiloto: a IA sugere e a equipe aprova"],
        ["desligado", "Desligado: só a equipe responde"],
      ],
      a.modo,
    ),
    tom: seletor(
      [
        ["amigavel", "Amigável e próximo"],
        ["profissional", "Profissional e cordial"],
        ["descontraido", "Descontraído"],
        ["tecnico", "Técnico e didático"],
      ],
      a.tom,
    ),
    emojis: seletor(
      [
        ["nenhum", "Sem emojis"],
        ["pouco", "Poucos emojis"],
        ["moderado", "Emojis com naturalidade"],
      ],
      a.emojis,
    ),
    objetivo: entrada({ value: a.objetivo ?? "", maxlength: 500 }),
    sobre: area({ rows: 7, maxlength: 8000, placeholder: "Ex.: Somos uma clínica odontológica em Uberlândia desde 2010. Atendemos particular e os convênios X e Y. Endereço: ... Estacionamento gratuito. Formas de pagamento: Pix, cartão em até 10x..." }, a.sobre),
    instrucoes: area({ rows: 5, maxlength: 8000, placeholder: "Ex.: Sempre pergunte o nome do cliente. Para orçamento de implante, peça uma foto da radiografia. Ofereça a avaliação gratuita." }, a.instrucoes),
    nao_fazer: area({ rows: 3, maxlength: 3000, placeholder: "Ex.: Não dê diagnóstico. Não prometa prazo de entrega para fora de MG." }, a.nao_fazer),
    saudacao: area({ rows: 2, maxlength: 1000, placeholder: "Ex.: Olá! Eu sou a Lia, da Clínica Sorriso 😊 Como posso te ajudar?" }, a.saudacao),
    transferir: area({ rows: 2, maxlength: 1000 }, a.transferir_quando),
    agrupar: entrada({ type: "number", min: 0, max: 30, value: a.agrupar_segundos }),
    assinatura: h("input", { type: "checkbox", checked: a.assinatura }),
  };
  const pag = eu.empresa.config.pagamento;
  const pix = entrada({ value: pag.pix ?? "", maxlength: 140, placeholder: "CNPJ, e-mail, telefone ou chave aleatória" });
  const pagInst = area({ rows: 2, maxlength: 2000, placeholder: "Ex.: Após o Pix, peça o comprovante. Parcelamos em até 6x no cartão." }, pag.instrucoes);
  const fu = eu.empresa.config.followup;
  const fuAtivo = h("input", { type: "checkbox", checked: fu.ativo });
  const fuHoras = entrada({ type: "number", min: 1, max: 23, value: fu.horas });

  const botao = h("button", { class: "btn btn-primario", disabled: !podeEditar() }, "Salvar alterações");
  botao.addEventListener("click", () =>
    acao(botao, async () => {
      await salvarConfig({
        agente: {
          nome: f.nome.value.trim() || "Lia",
          modo: f.modo.value,
          tom: f.tom.value,
          emojis: f.emojis.value,
          objetivo: f.objetivo.value,
          sobre: f.sobre.value,
          instrucoes: f.instrucoes.value,
          nao_fazer: f.nao_fazer.value,
          saudacao: f.saudacao.value,
          transferir_quando: f.transferir.value,
          agrupar_segundos: Number(f.agrupar.value) || 0,
          assinatura: f.assinatura.checked,
        },
        pagamento: { pix: pix.value, instrucoes: pagInst.value },
        followup: { ativo: fuAtivo.checked, horas: Number(fuHoras.value) || 3 },
      });
      await ctxApp.recarregarEu();
      aviso("Configurações salvas. A IA já está usando as novas instruções.");
    }),
  );

  limpar(
    alvo,
    h(
      "div",
      { class: "grade-form" },
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Identidade"),
        h("div", { class: "grade-2" }, campo("Nome da atendente", f.nome), campo("Como a IA trabalha", f.modo)),
        h("div", { class: "grade-2" }, campo("Tom de voz", f.tom), campo("Emojis", f.emojis)),
        campo("Objetivo principal", f.objetivo, "Ex.: agendar avaliações, vender pelo WhatsApp, tirar dúvidas e reduzir ligações."),
        campo("Saudação da primeira mensagem", f.saudacao, "Opcional. A IA adapta ao que o cliente escreveu."),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Sobre a empresa"),
        campo("O que a IA precisa saber", f.sobre, "Quanto mais detalhes, melhores as respostas. Para listas grandes (preços, perguntas frequentes), use a aba Conhecimento."),
        campo("Instruções de atendimento", f.instrucoes),
        campo("A IA nunca deve", f.nao_fazer),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Passar para a equipe"),
        campo("Transferir para uma pessoa quando", f.transferir),
        h("label", { class: "linha-check" }, f.assinatura, "Mostrar o nome de quem da equipe está respondendo (ex.: *Paula:*)"),
      ),
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Inteligência extra"),
        campo("Agrupar mensagens seguidas (segundos)", f.agrupar, "Clientes costumam mandar várias mensagens curtas. A IA espera este tempo e responde tudo de uma vez, como uma pessoa."),
        h("label", { class: "linha-check" }, fuAtivo, "Retomar conversas paradas automaticamente"),
        campo("Depois de quantas horas sem resposta", fuHoras, "A IA manda uma mensagem gentil e personalizada (no máximo uma vez, dentro da janela de 24 h da Meta)."),
        h("h3", { class: "sub" }, "Pagamento"),
        campo("Chave Pix", pix),
        campo("Instruções de pagamento", pagInst),
      ),
    ),
    h("div", { class: "barra-salvar" }, h("a", { class: "btn btn-fantasma", href: "#/ia/simulador" }, icone("play", 16), "Testar no simulador"), botao),
  );
}

/* ---------- Conhecimento ---------- */

async function conhecimento(alvo) {
  const itens = await get("/conhecimento");
  const busca = entrada({ type: "search", placeholder: "Teste: digite uma pergunta de cliente e veja o que a IA encontra" });
  const resultado = h("div", { class: "teste-busca" });
  busca.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" || !busca.value.trim()) return;
    const r = await post("/conhecimento/testar", { consulta: busca.value }).catch(erro);
    limpar(resultado, r?.length ? r.map((x) => h("div", { class: "achado" }, h("strong", {}, x.titulo), h("p", {}, x.trecho.slice(0, 280)), h("small", {}, `relevância ${x.relevancia}`))) : h("p", { class: "suave" }, "Nada encontrado. Adicione esse assunto na base para a IA saber responder."));
  });
  const recarregar = () => conhecimento(alvo);

  limpar(
    alvo,
    h(
      "section",
      { class: "cartao destaque-ia" },
      h("div", { class: "linha-entre" }, h("div", {}, h("h2", {}, icone("magica", 18), "Ensine tudo de uma vez"), h("p", { class: "suave" }, "Cole o texto do seu site, cardápio, tabela de preços ou manual. A IA organiza em perguntas e respostas para você revisar.")), h("button", { class: "btn btn-primario", disabled: !podeEditar(), onclick: () => importarComIA(recarregar) }, "Colar texto")),
    ),
    h("section", { class: "cartao" }, h("h2", {}, "Testar a busca"), busca, resultado),
    h(
      "section",
      { class: "cartao" },
      h("div", { class: "linha-entre" }, h("h2", {}, `Base de conhecimento (${itens.length})`), h("button", { class: "btn", disabled: !podeEditar(), onclick: () => editarConhecimento(null, recarregar) }, icone("mais", 16), "Novo item")),
      itens.length
        ? h(
            "div",
            { class: "lista-itens" },
            itens.map((x) =>
              h(
                "div",
                { class: `item-linha ${x.ativo ? "" : "inativo"}` },
                h("div", { class: "item-texto" }, h("strong", {}, x.titulo), h("p", {}, x.conteudo.slice(0, 200), x.conteudo.length > 200 ? "…" : ""), h("small", { class: "suave" }, { faq: "Pergunta frequente", politica: "Política", servico: "Serviço", documento: "Documento" }[x.tipo], x.usos ? ` · consultado ${x.usos}x` : "", x.ativo ? "" : " · desativado")),
                podeEditar()
                  ? h(
                      "div",
                      { class: "item-acoes" },
                      h("button", { class: "btn-icone", "aria-label": "Editar", onclick: () => editarConhecimento(x, recarregar) }, icone("editar")),
                      h("button", { class: "btn-icone", "aria-label": "Excluir", onclick: async () => (await confirmar(`Excluir "${x.titulo}"?`, { perigo: true, botao: "Excluir" })) && del(`/conhecimento/${x.id}`).then(recarregar, erro) }, icone("lixo")),
                    )
                  : null,
              ),
            ),
          )
        : vazio("livro", "A base está vazia", "Adicione perguntas frequentes, políticas de troca, prazos, preços... A IA só responde o que está aqui ou nas instruções."),
    ),
  );
}

function editarConhecimento(x, depois) {
  const titulo = entrada({ value: x?.titulo ?? "", placeholder: "Ex.: Qual o prazo de entrega?" });
  const conteudo = area({ rows: 8, placeholder: "Ex.: Entregamos em Uberlândia em até 24 h. Para outras cidades de MG, de 2 a 5 dias úteis..." }, x?.conteudo ?? "");
  const tipo = seletor(
    [
      ["faq", "Pergunta frequente"],
      ["politica", "Política"],
      ["servico", "Serviço"],
      ["documento", "Documento"],
    ],
    x?.tipo ?? "faq",
  );
  const ativo = h("input", { type: "checkbox", checked: x?.ativo ?? true });
  janela({
    titulo: x ? "Editar conhecimento" : "Novo conhecimento",
    largura: 680,
    conteudo: h("div", { class: "pilha" }, campo("Título ou pergunta", titulo), campo("Resposta / conteúdo", conteudo), h("div", { class: "grade-2" }, campo("Tipo", tipo), h("label", { class: "linha-check" }, ativo, "Ativo"))),
    acoes: [
      {
        texto: "Salvar",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            const d = { titulo: titulo.value, conteudo: conteudo.value, tipo: tipo.value, ativo: ativo.checked };
            if (x) await put(`/conhecimento/${x.id}`, d);
            else await post("/conhecimento", d);
            fechar();
            depois();
          }),
      },
    ],
  });
}

function importarComIA(depois) {
  const texto = area({ rows: 12, placeholder: "Cole aqui o texto (até 60 mil caracteres)…" });
  const arquivo = h("input", { type: "file", accept: ".txt,.md,.csv,text/plain", onchange: async (e) => (texto.value = await e.target.files[0].text()) });
  janela({
    titulo: "Ensinar com um texto",
    largura: 760,
    conteudo: h("div", { class: "pilha" }, h("p", { class: "suave" }, "A IA lê o texto e cria itens organizados. Nada é inventado: ela usa só o que está escrito."), texto, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Ou carregue um arquivo de texto"), arquivo)),
    acoes: [
      {
        texto: "Organizar com IA",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            const r = await post("/conhecimento/organizar", { texto: texto.value });
            fechar();
            revisar(r.itens, depois);
          }),
      },
    ],
  });
}

function revisar(itens, depois) {
  const marcados = itens.map(() => h("input", { type: "checkbox", checked: true }));
  janela({
    titulo: `A IA organizou ${itens.length} itens`,
    largura: 760,
    conteudo: h("div", { class: "lista-itens" }, itens.map((x, i) => h("label", { class: "item-linha selecionavel" }, marcados[i], h("div", { class: "item-texto" }, h("strong", {}, x.titulo), h("p", {}, x.conteudo))))),
    acoes: [
      {
        texto: "Adicionar selecionados",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            const sel = itens.filter((_, i) => marcados[i].checked);
            await post("/conhecimento", { itens: sel.map((x) => ({ ...x, tipo: "faq" })) });
            fechar();
            aviso(`${sel.length} itens adicionados à base.`);
            depois();
          }),
      },
    ],
  });
}

/* ---------- Catálogo ---------- */

async function catalogo(alvo) {
  const itens = await get("/produtos");
  const recarregar = () => catalogo(alvo);
  limpar(
    alvo,
    h(
      "section",
      { class: "cartao" },
      h("div", { class: "linha-entre" }, h("div", {}, h("h2", {}, `Catálogo (${itens.length})`), h("p", { class: "suave" }, "A IA consulta preço e estoque e envia a foto do produto na conversa.")), h("button", { class: "btn btn-primario", disabled: !podeEditar(), onclick: () => editarProduto(null, recarregar) }, icone("mais", 16), "Novo produto")),
      itens.length
        ? h(
            "div",
            { class: "grade-produtos" },
            itens.map((p) =>
              h(
                "button",
                { class: `produto ${p.ativo ? "" : "inativo"}`, onclick: () => podeEditar() && editarProduto(p, recarregar) },
                p.imagem_url ? h("img", { src: p.imagem_url, alt: "", loading: "lazy" }) : h("div", { class: "produto-sem-foto" }, icone("caixa", 28)),
                h("strong", {}, p.nome),
                h("span", { class: "produto-preco" }, p.preco_centavos === null ? "Sob consulta" : reais(p.preco_centavos)),
                h("small", { class: "suave" }, p.estoque === null ? "Estoque não controlado" : p.estoque > 0 ? `${p.estoque} em estoque` : "Esgotado", p.categoria ? ` · ${p.categoria}` : ""),
              ),
            ),
          )
        : vazio("caixa", "Nenhum produto", "Cadastre produtos ou serviços com preço para a IA vender pelo WhatsApp."),
    ),
  );
}

function editarProduto(p, depois) {
  const f = {
    nome: entrada({ value: p?.nome ?? "" }),
    descricao: area({ rows: 3 }, p?.descricao ?? ""),
    preco: entrada({ type: "number", min: 0, step: "0.01", value: p?.preco_centavos != null ? p.preco_centavos / 100 : "", placeholder: "Vazio = sob consulta" }),
    estoque: entrada({ type: "number", min: 0, step: 1, value: p?.estoque ?? "", placeholder: "Vazio = não controla" }),
    categoria: entrada({ value: p?.categoria ?? "" }),
    sku: entrada({ value: p?.sku ?? "" }),
    imagem: entrada({ type: "url", value: p?.imagem_url ?? "", placeholder: "https://..." }),
    ativo: h("input", { type: "checkbox", checked: p?.ativo ?? true }),
  };
  janela({
    titulo: p ? "Editar produto" : "Novo produto",
    largura: 640,
    conteudo: h(
      "div",
      { class: "pilha" },
      campo("Nome", f.nome),
      campo("Descrição", f.descricao),
      h("div", { class: "grade-2" }, campo("Preço (R$)", f.preco), campo("Estoque", f.estoque)),
      h("div", { class: "grade-2" }, campo("Categoria", f.categoria), campo("Código (SKU)", f.sku)),
      campo("Link da foto", f.imagem, "Endereço público https da imagem (JPG ou PNG)."),
      h("label", { class: "linha-check" }, f.ativo, "Disponível para a IA oferecer"),
    ),
    acoes: [
      p ? { texto: "Excluir", classe: "btn-perigo-fantasma", fn: async (_, fechar) => (await confirmar(`Excluir ${p.nome}?`, { perigo: true, botao: "Excluir" })) && del(`/produtos/${p.id}`).then(() => (fechar(), depois()), erro) } : null,
      {
        texto: "Salvar",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            const d = {
              nome: f.nome.value,
              descricao: f.descricao.value || undefined,
              preco: f.preco.value === "" ? null : Number(f.preco.value),
              estoque: f.estoque.value === "" ? null : Number(f.estoque.value),
              categoria: f.categoria.value || undefined,
              sku: f.sku.value || undefined,
              imagem_url: f.imagem.value,
              ativo: f.ativo.checked,
            };
            if (p) await put(`/produtos/${p.id}`, d);
            else await post("/produtos", d);
            fechar();
            depois();
          }),
      },
    ].filter(Boolean),
  });
}

/* ---------- Aprendizados ---------- */

async function aprendizados(alvo) {
  const itens = await get("/aprendizados");
  const recarregar = () => aprendizados(alvo);
  const situacao = area({ rows: 2, placeholder: "Ex.: Cliente pergunta se aceita cartão de crédito" });
  const resposta = area({ rows: 3, placeholder: "Ex.: Aceitamos sim! Parcelamos em até 10x sem juros nos cartões Visa e Master 💳" });
  limpar(
    alvo,
    h(
      "section",
      { class: "cartao destaque-ia" },
      h("h2", {}, icone("aprender", 18), "A IA aprende com a sua equipe"),
      h("p", { class: "suave" }, "Toda vez que alguém clica em Ensinar numa resposta da IA, ou edita uma sugestão do copiloto, o exemplo aparece aqui. A IA segue esses exemplos em todas as conversas."),
      podeEditar()
        ? h(
            "div",
            { class: "grade-2 alinhar-fim" },
            campo("Quando o cliente…", situacao),
            campo("A IA deve responder…", resposta),
            h("button", { class: "btn btn-primario", onclick: (e) => acao(e.currentTarget, async () => (await post("/aprendizados", { situacao: situacao.value, resposta_ideal: resposta.value }), recarregar())) }, "Adicionar exemplo"),
          )
        : null,
    ),
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, `Exemplos aprovados (${itens.length})`),
      itens.length
        ? h(
            "div",
            { class: "lista-itens" },
            itens.map((x) =>
              h(
                "div",
                { class: "item-linha" },
                h("div", { class: "item-texto" }, h("small", { class: "suave" }, "Quando: ", x.situacao), h("p", {}, x.resposta_ideal), h("small", { class: "suave" }, new Date(x.criado_em).toLocaleDateString("pt-BR"), x.origem === "copiloto" ? " · edição no copiloto" : x.origem?.startsWith("mensagem") ? " · correção numa conversa" : "")),
                podeEditar() ? h("button", { class: "btn-icone", "aria-label": "Excluir", onclick: () => del(`/aprendizados/${x.id}`).then(recarregar, erro) }, icone("lixo")) : null,
              ),
            ),
          )
        : vazio("aprender", "Nenhum exemplo ainda", "Os exemplos aparecem quando a equipe corrige a IA nas conversas."),
    ),
  );
}

/* ---------- Simulador ---------- */

async function simulador(alvo) {
  const msgs = [];
  const lista = h("div", { class: "sim-mensagens" });
  const detalhes = h("div", { class: "sim-detalhes" });
  const texto = entrada({ placeholder: "Escreva como se fosse um cliente…", "aria-label": "Mensagem do cliente" });
  const enviar = h("button", { class: "btn btn-primario", "aria-label": "Enviar" }, icone("enviar", 18));

  const desenhar = (pensando) => {
    limpar(
      lista,
      msgs.length ? null : h("div", { class: "sim-dica" }, h("strong", {}, "Teste antes de colocar no ar"), h("p", {}, "Converse como um cliente faria. Nada é enviado no WhatsApp nem gravado."), h("div", { class: "nuvem" }, ["Oi, quanto custa?", "Vocês abrem sábado?", "Quero marcar um horário", "Quero falar com uma pessoa"].map((s) => h("button", { class: "chip clicavel", onclick: () => ((texto.value = s), enviar.click()) }, s)))),
      msgs.map((m) =>
        h(
          "div",
          { class: `bolha-linha ${m.autor === "cliente" ? "msg-entrada" : "msg-saida autor-ia"}` },
          h("div", { class: "bolha" }, m.autor === "ia" ? h("span", { class: "bolha-autor" }, icone("robo", 12), ctxApp.eu.empresa.config.agente.nome) : null, m.midias?.map((x) => h("img", { src: x.link, class: "foto", alt: x.legenda ?? "" })), m.texto ? h("div", { class: "bolha-texto" }, textoWhatsApp(m.texto)) : null, m.opcoes ? h("div", { class: "bolha-opcoes" }, m.opcoes.map((o) => h("button", { class: "clicavel", onclick: () => ((texto.value = o), enviar.click()) }, o))) : null),
        ),
      ),
      pensando ? h("div", { class: "bolha-linha msg-saida autor-ia" }, h("div", { class: "bolha digitando" }, h("span", { class: "pontinhos" }, h("i"), h("i"), h("i")))) : null,
    );
    lista.scrollTop = lista.scrollHeight;
  };

  enviar.addEventListener("click", () => {
    const v = texto.value.trim();
    if (!v) return;
    msgs.push({ autor: "cliente", texto: v });
    texto.value = "";
    desenhar(true);
    acao(enviar, async () => {
      const r = await post("/playground", { mensagens: msgs.map((m) => ({ autor: m.autor, texto: m.texto || (m.opcoes ? "[opções]" : "[mídia]"), opcoes: m.opcoes })) });
      const opcoes = r.opcoes ? (r.opcoes.botoes ?? r.opcoes.secoes.flatMap((s) => s.linhas)).map((o) => o.titulo) : null;
      if (r.midias?.length || r.texto) msgs.push({ autor: "ia", texto: r.texto, midias: r.midias });
      if (r.opcoes) msgs.push({ autor: "ia", texto: r.opcoes.texto, opcoes });
      if (!r.texto && !r.opcoes && !r.midias?.length) msgs.push({ autor: "ia", texto: "(sem resposta)" });
      limpar(
        detalhes,
        h("h3", {}, "O que a IA fez"),
        r.ferramentas.length ? h("div", { class: "nuvem" }, r.ferramentas.map((f) => h("span", { class: "chip" }, NOMES_FERRAMENTAS[f] ?? f))) : h("p", { class: "suave pequeno" }, "Respondeu sem usar ferramentas."),
        r.transferencia ? h("div", { class: "ia-alerta" }, icone("pessoa", 14), "Transferiria para a equipe: ", r.transferencia.motivo) : null,
        r.encerrar ? h("div", { class: "ia-acao" }, icone("check", 14), "Encerraria o atendimento") : null,
        r.contato?.nome || r.contato?.etapa !== "novo" ? h("dl", { class: "campos-crm" }, h("dt", {}, "Nome"), h("dd", {}, r.contato.nome ?? "—"), h("dt", {}, "Etapa"), h("dd", {}, r.contato.etapa), Object.entries(r.contato.campos ?? {}).map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])) : null,
      );
      if (!ctxApp.eu.empresa.config.testado && podeEditar()) put("/empresa", { testado: true }).catch(() => {});
    }).finally(() => desenhar(false));
  });
  texto.addEventListener("keydown", (e) => e.key === "Enter" && enviar.click());

  limpar(
    alvo,
    h(
      "div",
      { class: "simulador" },
      h(
        "section",
        { class: "sim-celular" },
        h("header", { class: "sim-topo" }, icone("whatsapp", 18), h("strong", {}, ctxApp.eu.empresa.nome), h("button", { class: "btn-link", onclick: () => ((msgs.length = 0), limpar(detalhes), desenhar()) }, "Recomeçar")),
        lista,
        h("div", { class: "sim-compositor" }, texto, enviar),
      ),
      h("aside", { class: "cartao sim-lateral" }, h("h2", {}, "Bastidores"), h("p", { class: "suave pequeno" }, "Veja as ações que a IA tomaria: consultar a base, atualizar o CRM, ver horários, transferir..."), detalhes),
    ),
  );
  desenhar();
  texto.focus();
}

const NOMES_FERRAMENTAS = {
  buscar_conhecimento: "📚 Consultou a base",
  consultar_produtos: "🛍️ Consultou o catálogo",
  enviar_imagem_produto: "🖼️ Enviou foto",
  atualizar_contato: "📇 Atualizou o CRM",
  enviar_opcoes: "🔘 Enviou botões",
  ver_horarios: "📅 Viu horários",
  agendar: "✅ Agendou",
  meus_agendamentos: "📋 Viu agendamentos",
  cancelar_agendamento: "❌ Cancelou agendamento",
  transferir_para_humano: "🙋 Transferiu",
  encerrar_atendimento: "🏁 Encerrou",
};
