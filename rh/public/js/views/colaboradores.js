/* Colaboradores: lista, admissão completa, ficha com contrato, dependentes, benefícios, documentos,
   app do trabalhador (convite, biometria, PIN) e histórico do eSocial. */

import { del, get, post, put } from "../api.js";
import { abas, acao, aviso, avatar, confirmar, copiarTexto, dataHora, debounce, h, icone, janela, limpar, reais } from "../ui.js";
import { botao, cpfBR, dataBR, enviar, formulario, hhmm, hojeISO, situacao, tabela, topo } from "../comum.js";

let cad = {};
async function carregarCadastros() {
  const [cargos, departamentos, jornadas, locais, beneficios] = await Promise.all([get("/cargos"), get("/departamentos"), get("/jornadas"), get("/estabelecimentos"), get("/beneficios")]);
  cad = { cargos, departamentos, jornadas, locais, beneficios };
}
const opc = (lista, vazio = "—") => [["", vazio], ...lista.map((x) => [x.id, x.nome])];

export async function render(raiz, ctx, [id, sub]) {
  await carregarCadastros();
  if (id === "novo") return formularioColaborador(raiz, ctx, null);
  if (id && sub === "editar") return formularioColaborador(raiz, ctx, await get(`/colaboradores/${id}`));
  if (id) return ficha(raiz, ctx, id);
  return lista(raiz, ctx);
}

/* ---------- Lista ---------- */

async function lista(raiz, ctx) {
  let status = "";
  let q = "";
  const corpo = h("div");
  const carregar = async () => {
    const itens = await get(`/colaboradores?${new URLSearchParams({ q, ...(status ? { status } : {}) })}`);
    limpar(
      corpo,
      tabela(
        [
          { titulo: "Colaborador", valor: (c) => h("div", { class: "celula-pessoa" }, avatar(c.nome, c.id, 34), h("div", {}, h("strong", {}, c.nome), h("small", { class: "suave" }, `Matrícula ${c.matricula} · ${cpfBR(c.cpf)}`))) },
          { titulo: "Cargo / departamento", valor: (c) => h("div", {}, c.cargo ?? "—", h("br"), h("small", { class: "suave" }, c.departamento ?? "")) },
          { titulo: "Admissão", valor: (c) => dataBR(c.admissao) },
          { titulo: "Salário", valor: (c) => (ctx.pode("admin", "rh") ? reais(c.salario_centavos) : "•••") },
          { titulo: "App de ponto", valor: (c) => (c.app_ativo ? h("span", { class: "chip chip-ok" }, icone("check", 12), c.biometrias ? " App + biometria" : " App ativo") : h("span", { class: "chip" }, "Não ativado")) },
          { titulo: "Situação", valor: (c) => situacao(c.status) },
        ],
        itens,
        { aoClicar: (c) => ctx.navegar(`colaboradores/${c.id}`), vazio: q ? "Ninguém encontrado com essa busca." : "Nenhum colaborador ainda. Comece pela admissão." },
      ),
    );
  };
  const busca = h("input", { class: "entrada", type: "search", placeholder: "Buscar por nome, CPF ou matrícula", oninput: debounce((e) => ((q = e.target.value), carregar()), 250) });
  const filtro = h("select", { class: "entrada", onchange: (e) => ((status = e.target.value), carregar()) }, [["", "Todos os ativos"], ["ativo", "Trabalhando"], ["ferias", "Em férias"], ["afastado", "Afastados"], ["desligado", "Desligados"]].map(([v, t]) => h("option", { value: v }, t)));
  limpar(raiz, h("div", { class: "pagina" }, topo("Colaboradores", "Ficha completa, contrato, documentos e acesso ao app de ponto.", ctx.pode("admin", "rh") ? h("a", { class: "btn btn-primario", href: "#/colaboradores/novo" }, icone("mais", 16), "Admitir") : null), h("section", { class: "cartao" }, h("div", { class: "filtros-linha" }, busca, filtro), corpo)));
  await carregar();
}

/* ---------- Admissão e edição ---------- */

function camposColaborador(c) {
  const editando = Boolean(c);
  return [
    { titulo: "Dados pessoais" },
    { nome: "nome", rotulo: "Nome completo", obrigatorio: true, largura: 2 },
    { nome: "nome_social", rotulo: "Nome social" },
    { nome: "cpf", rotulo: "CPF", obrigatorio: true, desativado: editando, placeholder: "000.000.000-00" },
    { nome: "pis", rotulo: "PIS/NIS" },
    { nome: "rg", rotulo: "RG" },
    { nome: "nascimento", rotulo: "Nascimento", tipo: "data" },
    { nome: "sexo", rotulo: "Sexo", tipo: "select", opcoes: [["", "—"], ["F", "Feminino"], ["M", "Masculino"]] },
    { nome: "estado_civil", rotulo: "Estado civil", tipo: "select", opcoes: [["", "—"], ["solteiro", "Solteiro(a)"], ["casado", "Casado(a)"], ["uniao_estavel", "União estável"], ["divorciado", "Divorciado(a)"], ["separado", "Separado(a)"], ["viuvo", "Viúvo(a)"]] },
    { nome: "raca_cor", rotulo: "Raça/cor (IBGE)", tipo: "select", opcoes: [["", "—"], ["branca", "Branca"], ["preta", "Preta"], ["parda", "Parda"], ["amarela", "Amarela"], ["indigena", "Indígena"], ["nao_informado", "Não informado"]] },
    { nome: "escolaridade", rotulo: "Escolaridade", tipo: "select", opcoes: [["", "—"], ["fundamental_incompleto", "Fundamental incompleto"], ["fundamental", "Fundamental completo"], ["medio_incompleto", "Médio incompleto"], ["medio", "Médio completo"], ["superior_incompleto", "Superior incompleto"], ["superior", "Superior completo"], ["pos", "Pós-graduação"], ["mestrado", "Mestrado"], ["doutorado", "Doutorado"]] },
    { nome: "email", rotulo: "E-mail", tipo: "email" },
    { nome: "telefone", rotulo: "Celular (WhatsApp)", tipo: "tel" },
    { titulo: "Endereço" },
    { nome: "endereco.cep", rotulo: "CEP" },
    { nome: "endereco.logradouro", rotulo: "Logradouro", largura: 2 },
    { nome: "endereco.numero", rotulo: "Número" },
    { nome: "endereco.complemento", rotulo: "Complemento" },
    { nome: "endereco.bairro", rotulo: "Bairro" },
    { nome: "endereco.cidade", rotulo: "Cidade" },
    { nome: "endereco.uf", rotulo: "UF" },
    { nome: "endereco.cod_municipio", rotulo: "Código IBGE do município", ajuda: "7 dígitos, exigido pelo eSocial." },
    { titulo: "Contrato" },
    { nome: "admissao", rotulo: "Data de admissão", tipo: "data", obrigatorio: true, desativado: editando, padrao: hojeISO() },
    { nome: "matricula", rotulo: "Matrícula", desativado: editando, ajuda: editando ? null : "Em branco = automática." },
    { nome: "tipo_contrato", rotulo: "Tipo de contrato", tipo: "select", opcoes: [["clt", "CLT por prazo indeterminado"], ["determinado", "CLT por prazo determinado / experiência"], ["aprendiz", "Aprendiz"], ["intermitente", "Intermitente"], ["temporario", "Temporário"], ["estagio", "Estágio (sem eSocial)"]] },
    { nome: "cargo_id", rotulo: "Cargo", tipo: "select", opcoes: opc(cad.cargos) },
    { nome: "departamento_id", rotulo: "Departamento", tipo: "select", opcoes: opc(cad.departamentos) },
    { nome: "estabelecimento_id", rotulo: "Local de trabalho", tipo: "select", opcoes: opc(cad.locais) },
    { nome: "jornada_id", rotulo: "Jornada", tipo: "select", opcoes: opc(cad.jornadas, "Sem controle de jornada") },
    { nome: "salario_centavos", rotulo: "Salário (R$)", tipo: "reais", obrigatorio: true },
    { nome: "insalubridade_pct", rotulo: "Insalubridade", tipo: "select", opcoes: [["0", "Não"], ["10", "Grau mínimo (10%)"], ["20", "Grau médio (20%)"], ["40", "Grau máximo (40%)"]] },
    { nome: "periculosidade", rotulo: "Periculosidade (30%)", tipo: "check" },
    { titulo: "Dados bancários" },
    { nome: "banco.banco", rotulo: "Banco" },
    { nome: "banco.agencia", rotulo: "Agência" },
    { nome: "banco.conta", rotulo: "Conta" },
    { nome: "banco.pix", rotulo: "Chave Pix" },
    { nome: "observacoes", rotulo: "Observações", tipo: "area", largura: 2 },
  ];
}

function formularioColaborador(raiz, ctx, c) {
  const f = formulario(camposColaborador(c), c ? { ...c, insalubridade_pct: String(c.insalubridade_pct ?? 0) } : { tipo_contrato: "clt", jornada_id: cad.jornadas[0]?.id, estabelecimento_id: cad.locais[0]?.id });
  const salvar = h("button", { class: "btn btn-primario btn-grande", type: "submit" }, c ? "Salvar alterações" : "Admitir colaborador");
  limpar(
    raiz,
    h(
      "div",
      { class: "pagina" },
      topo(c ? `Editar ${c.nome}` : "Admissão", c ? "Mudanças de salário, cargo ou jornada geram o S-2206; dados pessoais, o S-2205." : "A admissão gera o evento S-2200 do eSocial automaticamente.", h("a", { class: "btn btn-fantasma", href: c ? `#/colaboradores/${c.id}` : "#/colaboradores" }, "Cancelar")),
      h(
        "form",
        {
          class: "cartao",
          onsubmit: (e) => {
            e.preventDefault();
            acao(salvar, async () => {
              const d = f.ler();
              d.insalubridade_pct = Number(d.insalubridade_pct ?? 0);
              const r = c ? await put(`/colaboradores/${c.id}`, d) : await post("/colaboradores", d);
              const evs = r.evento_esocial ? [r.evento_esocial] : (r.eventos_esocial ?? []);
              aviso(c ? "Alterações salvas." : `${r.nome} admitido(a)!` + (evs.length ? ` Evento ${evs.map((x) => x.tipo).join(", ")} pronto no eSocial.` : ""));
              ctx.navegar(`colaboradores/${r.id}`);
            });
          },
        },
        f.el,
        h("div", { class: "barra-salvar" }, salvar),
      ),
    ),
  );
}

/* ---------- Ficha ---------- */

async function ficha(raiz, ctx, id, abaInicial = "resumo") {
  const c = await get(`/colaboradores/${id}`);
  const rh = ctx.pode("admin", "rh");
  let aba = abaInicial;
  const corpo = h("div");
  const nomeDe = (lista, x) => lista.find((i) => i.id === x)?.nome ?? "—";
  const linha = (rot, val) => h("div", { class: "dado" }, h("small", {}, rot), h("strong", {}, val || "—"));

  const conteudos = {
    resumo: () =>
      h(
        "div",
        { class: "grade-form" },
        h("section", { class: "cartao" }, h("h2", {}, "Pessoal"), h("div", { class: "dados" }, linha("CPF", cpfBR(c.cpf)), linha("PIS", c.pis), linha("Nascimento", dataBR(c.nascimento)), linha("E-mail", c.email), linha("Celular", c.telefone), linha("Endereço", [c.endereco?.logradouro, c.endereco?.numero, c.endereco?.bairro, c.endereco?.cidade, c.endereco?.uf].filter(Boolean).join(", ")))),
        h(
          "section",
          { class: "cartao" },
          h("h2", {}, "Contrato"),
          h("div", { class: "dados" }, linha("Admissão", dataBR(c.admissao)), linha("Cargo", nomeDe(cad.cargos, c.cargo_id)), linha("Departamento", nomeDe(cad.departamentos, c.departamento_id)), linha("Local", nomeDe(cad.locais, c.estabelecimento_id)), linha("Jornada", nomeDe(cad.jornadas, c.jornada_id)), rh ? linha("Salário", reais(c.salario_centavos)) : null, linha("Categoria eSocial", c.categoria_esocial), linha("Banco de horas", hhmm(c.saldo_banco) || "0h00")),
        ),
        c.desligamento ? h("section", { class: "cartao" }, h("h2", {}, "Desligamento"), h("div", { class: "dados" }, linha("Data", dataBR(c.desligamento.data)), linha("Motivo", c.desligamento.valores?.tipo_nome), linha("Líquido estimado", reais(c.desligamento.valores?.liquido)), linha("Pagar até", dataBR(c.desligamento.pagar_ate)))) : null,
      ),
    app: () => {
      const convidar = botao("Gerar código de acesso", (e) =>
        acao(e.currentTarget, async () => {
          const r = await post(`/colaboradores/${c.id}/convite`);
          const wa = c.telefone ? `https://wa.me/55${c.telefone.replace(/\D/g, "").replace(/^55/, "")}?text=${encodeURIComponent(r.mensagem)}` : null;
          janela({
            titulo: "Convite do app de ponto",
            conteudo: h("div", { class: "pilha" }, h("p", {}, "Envie para o colaborador:"), h("div", { class: "codigo-grande" }, r.codigo), h("p", { class: "suave" }, r.mensagem)),
            acoes: [{ texto: "Copiar mensagem", classe: "btn-fantasma", fn: () => copiarTexto(r.mensagem) }, wa ? h("a", { class: "btn btn-whats", href: wa, target: "_blank", rel: "noopener" }, "Enviar no WhatsApp") : null].filter(Boolean),
          });
        }),
      "btn-primario", "link");
      return h(
        "div",
        { class: "grade-form" },
        h(
          "section",
          { class: "cartao" },
          h("h2", {}, "App de ponto"),
          h("p", {}, c.app_ativo ? "✅ O colaborador está com o app ativo no celular." : "O colaborador ainda não ativou o app."),
          h("p", { class: "suave" }, "O código vale 7 dias e só pode ser usado uma vez. Ao trocar de celular, gere um novo."),
          rh ? h("div", { class: "linha-entre" }, convidar, c.app_ativo || c.credenciais.length ? botao("Desconectar celular", (e) => acao(e.currentTarget, async () => (await confirmar("Desconectar o app e apagar as biometrias cadastradas?", { perigo: true, botao: "Desconectar" })) && (await del(`/colaboradores/${c.id}/app`), ficha(raiz, ctx, id, "app"))), "btn-perigo-fantasma") : null) : null,
        ),
        h(
          "section",
          { class: "cartao" },
          h("h2", {}, "Biometria e PIN"),
          c.credenciais.length ? h("ul", { class: "lista-simples" }, c.credenciais.map((k) => h("li", {}, `${k.aparelho ?? "Celular"} · cadastrada em ${dataHora(k.criada_em)}${k.usada_em ? ` · último uso ${dataHora(k.usada_em)}` : ""}`))) : h("p", { class: "suave" }, "Nenhuma biometria cadastrada. O colaborador cadastra a digital ou o rosto pelo próprio app."),
          h("p", {}, c.tem_pin ? "🔢 PIN do quiosque definido." : "Sem PIN do quiosque."),
          rh && c.tem_pin ? botao("Apagar PIN", (e) => acao(e.currentTarget, async () => (await del(`/colaboradores/${c.id}/pin`), ficha(raiz, ctx, id, "app"))), "btn-fantasma") : null,
        ),
      );
    },
    dependentes: () =>
      h(
        "section",
        { class: "cartao" },
        h("div", { class: "cartao-topo" }, h("h2", {}, "Dependentes"), rh ? botao("Adicionar", () => novoDependente(c, () => ficha(raiz, ctx, id, "dependentes")), "btn-pequeno", "mais") : null),
        tabela(
          [
            { titulo: "Nome", valor: (d) => d.nome },
            { titulo: "Parentesco", valor: (d) => d.parentesco },
            { titulo: "Nascimento", valor: (d) => dataBR(d.nascimento) },
            { titulo: "IRRF", valor: (d) => (d.irrf ? "Sim" : "Não") },
            { titulo: "Salário-família", valor: (d) => (d.salario_familia ? "Sim" : "Não") },
            { titulo: "", valor: (d) => (rh ? h("button", { class: "btn-icone", "aria-label": "Remover", onclick: async () => (await del(`/dependentes/${d.id}`), ficha(raiz, ctx, id, "dependentes")) }, icone("lixo", 16)) : null) },
          ],
          c.dependentes,
          { vazio: "Sem dependentes." },
        ),
      ),
    beneficios: () => {
      const marcados = new Map(c.beneficios.map((b) => [b.id, b.valor_individual]));
      const caixas = cad.beneficios.map((b) => ({ b, el: h("input", { type: "checkbox", checked: marcados.has(b.id), disabled: !rh }) }));
      return h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Benefícios"),
        cad.beneficios.length ? h("div", { class: "pilha" }, caixas.map(({ b, el }) => h("label", { class: "linha-check" }, el, h("span", {}, `${b.nome} · ${reais(b.valor_centavos)}`)))) : h("p", { class: "suave" }, "Cadastre os benefícios em Folha → Benefícios."),
        rh && cad.beneficios.length ? h("div", { class: "barra-salvar" }, botao("Salvar benefícios", (e) => acao(e.currentTarget, async () => (await put(`/colaboradores/${c.id}/beneficios`, { itens: caixas.filter((x) => x.el.checked).map((x) => ({ beneficio_id: x.b.id })) }), aviso("Benefícios salvos."))), "btn-primario")) : null,
      );
    },
    documentos: () =>
      h(
        "section",
        { class: "cartao" },
        h("div", { class: "cartao-topo" }, h("h2", {}, "Documentos"), rh ? botao("Enviar documento", () => novoDocumento(c, () => ficha(raiz, ctx, id, "documentos")), "btn-pequeno", "upload") : null),
        tabela(
          [
            { titulo: "Documento", valor: (d) => h("a", { href: `/api/arquivos/${d.arquivo}`, target: "_blank" }, d.nome) },
            { titulo: "Tipo", valor: (d) => d.tipo },
            { titulo: "Validade", valor: (d) => (d.validade ? h("span", { class: `chip ${d.validade < hojeISO() ? "chip-perigo" : ""}` }, dataBR(d.validade)) : "—") },
            { titulo: "Enviado", valor: (d) => `${dataHora(d.criado_em)} · ${d.enviado_por ?? ""}` },
            { titulo: "", valor: (d) => (rh ? h("button", { class: "btn-icone", "aria-label": "Excluir", onclick: async () => (await confirmar(`Excluir ${d.nome}?`, { perigo: true })) && (await del(`/documentos/${d.id}`), ficha(raiz, ctx, id, "documentos")) }, icone("lixo", 16)) : null) },
          ],
          c.documentos,
          { vazio: "Nenhum documento. Envie contrato, ASO, RG, CNH, certificados…" },
        ),
      ),
    historico: () =>
      h(
        "div",
        { class: "grade-form" },
        h("section", { class: "cartao" }, h("h2", {}, "Férias"), tabela([{ titulo: "Início", valor: (f) => dataBR(f.inicio) }, { titulo: "Dias", valor: (f) => f.dias + (f.abono_dias ? ` + ${f.abono_dias} vendidos` : "") }, { titulo: "Situação", valor: (f) => situacao(f.status) }], c.ferias, { vazio: "Sem férias registradas." })),
        h("section", { class: "cartao" }, h("h2", {}, "Afastamentos"), tabela([{ titulo: "Período", valor: (a) => `${dataBR(a.inicio)} a ${a.fim ? dataBR(a.fim) : "em aberto"}` }, { titulo: "Motivo", valor: (a) => a.motivo }, { titulo: "Situação", valor: (a) => situacao(a.status) }], c.afastamentos, { vazio: "Sem afastamentos." })),
        h("section", { class: "cartao" }, h("h2", {}, "eSocial"), tabela([{ titulo: "Evento", valor: (e) => h("div", {}, h("strong", {}, e.tipo), " ", e.descricao) }, { titulo: "Situação", valor: (e) => situacao(e.status) }, { titulo: "Recibo", valor: (e) => e.recibo ?? "—" }], c.esocial, { vazio: "Nenhum evento." })),
      ),
  };
  const desenharAba = () => limpar(corpo, abas([["resumo", "Resumo"], ["app", "App e biometria"], ["dependentes", "Dependentes"], ["beneficios", "Benefícios"], ["documentos", "Documentos"], ["historico", "Histórico"]], aba, (x) => ((aba = x), desenharAba())), h("div", { class: "aba-corpo" }, conteudos[aba]()));

  limpar(
    raiz,
    h(
      "div",
      { class: "pagina" },
      h("a", { class: "btn-link", href: "#/colaboradores" }, icone("voltar", 14), " Colaboradores"),
      h(
        "header",
        { class: "perfil-cabeca cartao" },
        avatar(c.nome, c.id, 64),
        h("div", { class: "item-texto" }, h("h1", {}, c.nome), h("p", { class: "suave" }, `Matrícula ${c.matricula} · ${nomeDe(cad.cargos, c.cargo_id)} · desde ${dataBR(c.admissao)}`), situacao(c.status)),
        rh && c.status !== "desligado"
          ? h("div", { class: "acoes-topo" }, h("a", { class: "btn btn-fantasma", href: `#/colaboradores/${c.id}/editar` }, icone("editar", 16), "Editar"), h("a", { class: "btn btn-fantasma", href: `#/ferias/programar/${c.id}` }, icone("mala", 16), "Férias"), h("a", { class: "btn btn-fantasma", href: `#/ferias/afastar/${c.id}` }, icone("saude", 16), "Afastamento"), h("a", { class: "btn btn-perigo-fantasma", href: `#/folha/rescisao/${c.id}` }, "Desligar"))
          : null,
      ),
      corpo,
    ),
  );
  desenharAba();
}

function novoDependente(c, depois) {
  const f = formulario([
    { nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 },
    { nome: "parentesco", rotulo: "Parentesco", tipo: "select", opcoes: [["filho", "Filho(a)"], ["conjuge", "Cônjuge"], ["companheiro", "Companheiro(a)"], ["enteado", "Enteado(a)"], ["pai", "Pai"], ["mae", "Mãe"], ["outro", "Outro"]] },
    { nome: "nascimento", rotulo: "Nascimento", tipo: "data" },
    { nome: "cpf", rotulo: "CPF" },
    { nome: "irrf", rotulo: "Dependente para o IRRF", tipo: "check", padrao: true },
    { nome: "salario_familia", rotulo: "Recebe salário-família (filho até 14 anos)", tipo: "check" },
  ]);
  janela({ titulo: `Dependente de ${c.nome}`, conteudo: f.el, acoes: [{ texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post(`/colaboradores/${c.id}/dependentes`, f.ler()), fechar(), depois())) }] });
}

function novoDocumento(c, depois) {
  const arquivo = h("input", { type: "file", class: "entrada", accept: ".pdf,image/*,.doc,.docx" });
  const f = formulario([
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: [["contrato", "Contrato de trabalho"], ["aso", "ASO (exame ocupacional)"], ["rg", "RG / CNH"], ["comprovante", "Comprovante de residência"], ["certificado", "Certificado / treinamento (NR)"], ["advertencia", "Advertência"], ["outro", "Outro"]] },
    { nome: "nome", rotulo: "Nome do documento", obrigatorio: true },
    { nome: "validade", rotulo: "Validade", tipo: "data", ajuda: "Avisamos 30 dias antes de vencer." },
    { nome: "compartilhar", rotulo: "Mostrar para o colaborador no app", tipo: "check" },
  ]);
  janela({
    titulo: `Documento de ${c.nome}`,
    conteudo: h("div", { class: "pilha" }, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Arquivo *"), arquivo), f.el),
    acoes: [
      {
        texto: "Enviar",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            const a = arquivo.files[0];
            if (!a) throw new Error("Escolha o arquivo.");
            const d = f.ler();
            const up = await enviar(`/arquivos?colaborador=${c.id}`, a);
            await post(`/colaboradores/${c.id}/documentos`, { ...d, arquivo: up.id });
            fechar();
            depois();
          }),
      },
    ],
  });
}
