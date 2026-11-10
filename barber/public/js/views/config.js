/* Configurações: a barbearia controla tudo sozinha. Dados e regras, expediente e feriados, serviços, barbeiros,
   canais (WhatsApp, SMS, Google, Asaas), acessos da equipe, Nexor Central e auditoria. */

import { get, post, put } from "../api.js";
import { abas, acao, aviso, confirmar, copiarTexto, entrada, h, icone, janela, limpar, reais } from "../ui.js";
import { formulario, tabela, topo } from "../comum.js";
import { editorHorario, hojeISO } from "../base.js";
import { PAPEIS } from "../app.js";

export async function render(area, ctx) {
  let aba = new URLSearchParams(location.hash.split("?")[1] ?? "").get("aba") || "barbearia";
  const corpo = h("div", { class: "pilha" });
  const itens = [
    ["barbearia", "Barbearia", "predio"],
    ["horarios", "Expediente e feriados", "relogio"],
    ["servicos", "Serviços", "tesoura"],
    ["barbeiros", "Barbeiros", "contatos"],
    ["canais", "WhatsApp, SMS, Google e Asaas", "whatsapp"],
    ["equipe", "Acessos", "escudo"],
    ["nexor", "Nexor", "estrela"],
    ["auditoria", "Auditoria", "livro"],
  ].filter(([k]) => !(k === "canais" && ctx.oculto("config.canais")) || ctx.nexor);
  const trocar = (k) => ((aba = k), history.replaceState(null, "", `#/config?aba=${k}`), limpar(cab, abas(itens, aba, trocar)), carregar());
  const cab = h("div", {}, abas(itens, aba, trocar));
  limpar(area, h("div", { class: "pagina" }, topo("Configurações", "Tudo aqui pode ser mudado a qualquer momento, sem precisar da Nexor."), cab, corpo));

  const salvarBtn = (texto, fn) => {
    const b = h("button", { class: "btn btn-primario" }, texto);
    b.onclick = () => acao(b, fn);
    return h("div", { class: "barra-salvar" }, b);
  };
  const recarregar = async () => (await ctx.recarregarEu(), carregar());

  async function barbearia() {
    const c = ctx.eu.barbearia.config;
    const f = formulario(
      [
        { titulo: "Dados" },
        { nome: "nome", rotulo: "Nome da barbearia", obrigatorio: true, largura: 2 },
        { nome: "marca.slogan", rotulo: "Frase do app", placeholder: "Seu estilo, no seu horário" , largura: 2 },
        { nome: "marca.endereco", rotulo: "Endereço", largura: 2 },
        { nome: "marca.telefone", rotulo: "Telefone" },
        { nome: "marca.instagram", rotulo: "Instagram", placeholder: "@suabarbearia" },
        { nome: "marca.mapa", rotulo: "Link do Google Maps", largura: 2 },
        { nome: "marca.cor", rotulo: "Cor do app", tipo: "texto", placeholder: "#3b8dff" },
        { titulo: "Regras da agenda" },
        { nome: "regras.passo_min", rotulo: "Mostrar horários de quanto em quanto tempo", tipo: "select", opcoes: [5, 10, 15, 20, 30, 60].map((n) => [n, `${n} minutos`]) },
        { nome: "regras.antecedencia_min", rotulo: "Antecedência mínima para agendar (min)", tipo: "numero", min: 0 },
        { nome: "regras.janela_dias", rotulo: "Agenda aberta até quantos dias à frente", tipo: "numero", min: 1, max: 120 },
        { nome: "regras.cancelamento_horas", rotulo: "Cliente cancela/remarca sozinho até (horas antes)", tipo: "numero", min: 0, passo: 0.5 },
        { nome: "regras.lembrete_horas", rotulo: "Lembrete pelo WhatsApp (horas antes)", tipo: "numero", min: 0, passo: 0.5 },
        { nome: "regras.lista_espera", rotulo: "Lista de espera relâmpago ligada", tipo: "check" },
        { nome: "regras.comissao_clube", rotulo: "Comissão em serviço do clube", tipo: "select", opcoes: [["preco", "Sobre o preço do serviço"], ["nenhuma", "Sem comissão"]] },
        { titulo: "Retorno no tempo certo" },
        { nome: "retorno.ativo", rotulo: "Avisar o cliente quando passar do ciclo de corte dele", tipo: "check", largura: 2 },
        { nome: "retorno.margem_dias", rotulo: "Dias de folga antes de avisar", tipo: "numero", min: 0, max: 30 },
      ],
      { nome: ctx.eu.barbearia.nome, ...c },
    );
    return h("section", { class: "cartao" }, f.el, salvarBtn("Salvar", async () => {
      const d = f.ler();
      for (const k of ["passo_min", "antecedencia_min", "janela_dias", "cancelamento_horas", "lembrete_horas"]) if (d.regras?.[k] !== undefined) d.regras[k] = Number(d.regras[k]);
      if (d.marca && !d.marca.cor) delete d.marca.cor;
      await put("/config", d);
      aviso("Configurações salvas.");
      recarregar();
    }));
  }

  async function horarios() {
    const c = ctx.eu.barbearia.config;
    const ed = editorHorario(c.horario);
    const excecoes = { ...(c.excecoes ?? {}) };
    const listaEx = h("div");
    const desenharEx = () =>
      limpar(
        listaEx,
        Object.keys(excecoes).length
          ? h("ul", { class: "lista-simples" }, Object.entries(excecoes).sort().map(([d, t]) => h("li", { class: "linha-entre" }, h("span", {}, `${d.split("-").reverse().join("/")} · `, t.length ? t.map(([a, b]) => `${a}-${b}`).join(", ") : "fechado"), h("button", { class: "btn-icone", "aria-label": "Remover", onclick: () => (delete excecoes[d], desenharEx()) }, icone("x", 14)))))
          : h("p", { class: "suave pequeno" }, "Nenhum feriado ou horário especial."),
      );
    const dEx = entrada({ type: "date", min: hojeISO() });
    const tEx = entrada({ placeholder: "Vazio = fechado · ou 09:00-13:00" });
    desenharEx();
    return h(
      "div",
      { class: "pilha" },
      h("section", { class: "cartao" }, h("h3", {}, "Expediente da barbearia"), h("p", { class: "suave pequeno" }, "Cada barbeiro pode ter o próprio expediente em Folgas e horários."), ed.el),
      h(
        "section",
        { class: "cartao" },
        h("h3", {}, "Feriados e horários especiais"),
        listaEx,
        h("div", { class: "grade-2" }, dEx, tEx),
        h(
          "button",
          {
            class: "btn btn-fantasma",
            onclick: () => {
              if (!dEx.value) return aviso("Escolha o dia.", "erro");
              const v = tEx.value.trim();
              excecoes[dEx.value] = v ? v.split(",").map((x) => x.trim().split(/\s*[-–]\s*/)) : [];
              dEx.value = "";
              tEx.value = "";
              desenharEx();
            },
          },
          icone("mais", 16),
          "Adicionar dia",
        ),
      ),
      salvarBtn("Salvar expediente", async () => (await put("/config", { horario: ed.ler(), excecoes }), aviso("Expediente salvo."), recarregar())),
    );
  }

  async function servicos() {
    const lista = await get("/servicos");
    const editar = (s = null) => {
      const f = formulario(
        [
          { nome: "nome", rotulo: "Nome", obrigatorio: true },
          { nome: "categoria", rotulo: "Categoria", placeholder: "Cabelo, barba, combo…" },
          { nome: "duracao_min", rotulo: "Duração (minutos)", tipo: "numero", min: 5, obrigatorio: true, padrao: 30 },
          { nome: "preco_centavos", rotulo: "Preço (R$)", tipo: "reais", obrigatorio: true },
          { nome: "descricao", rotulo: "Descrição para o cliente", tipo: "area", largura: 2 },
          { nome: "ordem", rotulo: "Ordem no app", tipo: "numero", min: 0, padrao: 0 },
          { nome: "ativo", rotulo: "Ativo", tipo: "check", padrao: true },
        ],
        s ?? {},
      );
      const ok = h("button", { class: "btn btn-primario" }, "Salvar");
      const j = janela({ titulo: s ? s.nome : "Novo serviço", conteudo: f.el, acoes: [ok] });
      ok.onclick = () => acao(ok, async () => (s ? await put(`/servicos/${s.id}`, f.ler()) : await post("/servicos", f.ler()), aviso("Serviço salvo."), j.fechar(), carregar()));
    };
    return h("section", { class: "cartao" }, h("div", { class: "linha-entre" }, h("h3", {}, "Serviços"), h("button", { class: "btn btn-primario btn-pequeno", onclick: () => editar() }, icone("mais", 14), "Novo serviço")), tabela([{ titulo: "Serviço", valor: (s) => h("span", { class: s.ativo ? "" : "suave" }, s.nome) }, { titulo: "Categoria", valor: (s) => s.categoria ?? "—" }, { titulo: "Duração", valor: (s) => `${s.duracao_min} min` }, { titulo: "Preço", valor: (s) => reais(s.preco_centavos), classe: "direita" }], lista, { aoClicar: editar }));
  }

  async function barbeiros() {
    const [lista, servs] = await Promise.all([get("/barbeiros"), get("/servicos")]);
    const editar = (b = null) => {
      const f = formulario(
        [
          { nome: "nome", rotulo: "Nome no app", obrigatorio: true },
          { nome: "cor", rotulo: "Cor na agenda", placeholder: "#3b8dff" },
          { nome: "bio", rotulo: "Apresentação (aparece no app)", tipo: "area", largura: 2 },
          { nome: "comissao_servico", rotulo: "Comissão em serviços (%)", tipo: "numero", min: 0, max: 100, padrao: 40 },
          { nome: "comissao_produto", rotulo: "Comissão em produtos (%)", tipo: "numero", min: 0, max: 100, padrao: 10 },
          { nome: "ordem", rotulo: "Ordem no app", tipo: "numero", min: 0, padrao: 0 },
          { nome: "ativo", rotulo: "Atendendo", tipo: "check", padrao: true },
        ],
        b ?? {},
      );
      const marcados = new Set(b?.servicos ?? []);
      const caixas = servs.filter((s) => s.ativo).map((s) => ({ s, el: h("input", { type: "checkbox", checked: !marcados.size || marcados.has(s.id) }) }));
      const ok = h("button", { class: "btn btn-primario" }, "Salvar");
      const j = janela({ titulo: b ? b.nome : "Novo barbeiro", largura: 620, conteudo: h("div", { class: "pilha" }, f.el, h("h3", { class: "form-secao" }, "Serviços que faz"), h("div", { class: "grade-2" }, caixas.map(({ s, el }) => h("label", { class: "linha-check" }, el, h("span", {}, s.nome))))), acoes: [ok] });
      ok.onclick = () =>
        acao(ok, async () => {
          const d = f.ler();
          if (!d.cor) delete d.cor;
          const escolhidos = caixas.filter((c) => c.el.checked).map((c) => c.s.id);
          d.servicos = escolhidos.length === caixas.length ? [] : escolhidos;
          if (b) await put(`/barbeiros/${b.id}`, d);
          else await post("/barbeiros", d);
          aviso("Barbeiro salvo.");
          j.fechar();
          carregar();
        });
    };
    return h("section", { class: "cartao" }, h("div", { class: "linha-entre" }, h("h3", {}, "Barbeiros"), h("button", { class: "btn btn-primario btn-pequeno", onclick: () => editar() }, icone("mais", 14), "Novo barbeiro")), tabela([{ titulo: "Barbeiro", valor: (b) => h("span", {}, h("span", { class: "bolinha", style: { background: b.cor } }), " ", b.nome, b.ativo ? "" : " (inativo)") }, { titulo: "Serviços", valor: (b) => `${b.comissao_servico}%` }, { titulo: "Produtos", valor: (b) => `${b.comissao_produto}%` }, { titulo: "Faz", valor: (b) => (b.servicos?.length ? `${b.servicos.length} serviço(s)` : "todos") }], lista, { aoClicar: editar }), h("p", { class: "suave pequeno" }, "Para o barbeiro ver a própria agenda e as comissões no celular, crie um acesso para ele na aba Acessos."));
  }

  async function canais() {
    const c = (await get("/config")).config;
    const base = location.origin;
    const url = (t, v) => h("div", { class: "copiavel" }, h("small", { class: "campo-rotulo" }, t), h("div", { class: "linha-entre" }, h("code", {}, v), h("button", { class: "btn-icone", "aria-label": "Copiar", onclick: () => copiarTexto(v) }, icone("copiar", 15))));
    const f = formulario(
      [
        { titulo: "WhatsApp (API oficial da Meta)" },
        { nome: "whatsapp.id_numero", rotulo: "ID do número de telefone" },
        { nome: "whatsapp.token", rotulo: c.whatsapp.token ? "Token (já configurado; preencha só para trocar)" : "Token permanente", tipo: "senha" },
        { nome: "whatsapp.segredo", rotulo: c.whatsapp.segredo ? "Chave secreta do app (já configurada)" : "Chave secreta do app", tipo: "senha" },
        { nome: "whatsapp.modelos.codigo", rotulo: "Modelo do código de acesso (autenticação)", placeholder: "codigo_acesso" },
        { nome: "whatsapp.modelos.confirmacao", rotulo: "Modelo de confirmação", placeholder: "confirmacao_horario" },
        { nome: "whatsapp.modelos.lembrete", rotulo: "Modelo de lembrete", placeholder: "lembrete_horario" },
        { nome: "whatsapp.modelos.vaga", rotulo: "Modelo da vaga da lista de espera", placeholder: "vaga_aberta" },
        { nome: "whatsapp.modelos.retorno", rotulo: "Modelo do retorno", placeholder: "hora_do_corte" },
        { nome: "whatsapp.modelos.clube_atraso", rotulo: "Modelo de mensalidade em atraso", placeholder: "clube_atraso" },
        { titulo: "SMS (Twilio)" },
        { nome: "sms.sid", rotulo: "Account SID" },
        { nome: "sms.token", rotulo: c.sms.token ? "Auth token (já configurado)" : "Auth token", tipo: "senha" },
        { nome: "sms.de", rotulo: "Número remetente ou Messaging Service SID", placeholder: "+5511… ou MG…" },
        { nome: "sms.avisos", rotulo: "Usar SMS também para lembretes quando o WhatsApp falhar", tipo: "check", padrao: true },
        { titulo: "Entrar com Google" },
        { nome: "google.client_id", rotulo: "Client ID do Google (OAuth, tipo Aplicativo da Web)", largura: 2, placeholder: "…apps.googleusercontent.com", ajuda: `No Google Cloud, em Origens JavaScript autorizadas, coloque ${base}` },
        { titulo: "Clube: cobrança automática (Asaas)" },
        { nome: "asaas.chave", rotulo: c.asaas.chave ? "Chave da API (já configurada)" : "Chave da API do Asaas", tipo: "senha" },
        { nome: "asaas.ambiente", rotulo: "Ambiente", tipo: "select", opcoes: [["sandbox", "Teste (sandbox)"], ["producao", "Produção"]] },
      ],
      { ...c, whatsapp: { ...c.whatsapp, token: "", segredo: "" }, sms: { ...c.sms, token: "" }, asaas: { ...c.asaas, chave: "" } },
    );
    const teste = entrada({ placeholder: "Seu celular para teste", inputmode: "tel" });
    return h(
      "div",
      { class: "pilha" },
      h("section", { class: "cartao" }, f.el, salvarBtn("Salvar canais", async () => (await put("/canais", f.ler()), aviso("Canais salvos."), carregar()))),
      h("section", { class: "cartao pilha" }, h("h3", {}, "Endereços para colar nos painéis da Meta e do Asaas"), url("Webhook do WhatsApp (URL de retorno)", `${base}/webhook/whatsapp`), c.whatsapp.verificacao ? url("Token de verificação do webhook", c.whatsapp.verificacao) : h("p", { class: "suave pequeno" }, "Salve o WhatsApp para gerar o token de verificação."), url("Webhook do Asaas", `${base}/webhook/asaas`), c.asaas.token_webhook ? url("Token de autenticação do webhook do Asaas", c.asaas.token_webhook) : null, url("Link do app para divulgar (bio do Instagram, QR no balcão)", ctx.eu.link_app)),
      h("section", { class: "cartao" }, h("h3", {}, "Testar envio"), h("div", { class: "linha-entre" }, teste, h("div", { class: "item-acoes" }, ...["whatsapp", "sms"].map((canal) => h("button", { class: "btn btn-fantasma", onclick: (e) => acao(e.currentTarget, async () => (await post("/canais/testar", { canal, fone: teste.value }), aviso(`Mensagem de teste enviada por ${canal === "sms" ? "SMS" : "WhatsApp"}.`))) }, canal === "sms" ? "Testar SMS" : "Testar WhatsApp"))))),
      // Banca V-25: apagar a chave guardada (ex.: deixar o Asaas e voltar a receber a mensalidade no balcão)
      [["whatsapp", "WhatsApp", c.whatsapp.token || c.whatsapp.segredo], ["sms", "SMS", c.sms.token], ["asaas", "Asaas", c.asaas.chave]].some(([, , tem]) => tem)
        ? h(
            "section",
            { class: "cartao pilha" },
            h("h3", {}, "Remover credenciais"),
            h("p", { class: "suave pequeno" }, "Apaga a chave guardada do canal. Sem a chave do Asaas, a assinatura do clube volta a ser paga no balcão."),
            h(
              "div",
              { class: "item-acoes" },
              [["whatsapp", "WhatsApp", c.whatsapp.token || c.whatsapp.segredo], ["sms", "SMS", c.sms.token], ["asaas", "Asaas", c.asaas.chave]]
                .filter(([, , tem]) => tem)
                .map(([canal, nome]) =>
                  h("button", { class: "btn btn-perigo-fantasma", onclick: async (e) => {
                    const b = e.currentTarget;
                    if (!(await confirmar(`Remover a chave do ${nome}? O canal para de funcionar até você cadastrar outra.`, { botao: `Remover ${nome}`, perigo: true }))) return;
                    await acao(b, async () => (await put("/canais", { remover: [canal] }), aviso(`Chave do ${nome} removida.`), carregar()));
                  } }, `Remover ${nome}`),
                ),
            ),
          )
        : null,
    );
  }

  async function equipe() {
    const [lista, bs] = await Promise.all([get("/usuarios"), get("/barbeiros")]);
    const novo = () => {
      const f = formulario([
        { nome: "nome", rotulo: "Nome", obrigatorio: true },
        { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true },
        { nome: "senha", rotulo: "Senha inicial", tipo: "senha", obrigatorio: true },
        { nome: "papel", rotulo: "Perfil", tipo: "select", opcoes: [["barbeiro", "Barbeiro (a própria agenda e comissões)"], ["recepcao", "Recepção (agenda, clientes, caixa)"], ["admin", "Administrador (tudo)"]] },
        { nome: "barbeiro_id", rotulo: "É qual barbeiro?", tipo: "select", opcoes: [["", "—"], ...bs.map((b) => [b.id, b.nome])] },
      ]);
      const ok = h("button", { class: "btn btn-primario" }, "Criar acesso");
      const j = janela({ titulo: "Novo acesso", conteudo: f.el, acoes: [ok] });
      ok.onclick = () => acao(ok, async () => (await post("/usuarios", f.ler()), aviso("Acesso criado. Passe o e-mail e a senha para a pessoa."), j.fechar(), carregar()));
    };
    return h("section", { class: "cartao" }, h("div", { class: "linha-entre" }, h("h3", {}, "Acessos ao painel"), h("button", { class: "btn btn-primario btn-pequeno", onclick: novo }, icone("mais", 14), "Novo acesso")), tabela([{ titulo: "Nome", valor: (u) => u.nome }, { titulo: "E-mail", valor: (u) => u.email }, { titulo: "Perfil", valor: (u) => PAPEIS[u.papel] }, { titulo: "", valor: (u) => (u.papel === "dono" ? null : h("button", { class: "btn btn-pequeno btn-fantasma", onclick: (e) => acao(e.target, async () => (await put(`/usuarios/${u.id}`, { ativo: !u.ativo }), aviso(u.ativo ? "Acesso desativado." : "Acesso reativado."), carregar())) }, u.ativo ? "Desativar" : "Reativar")) }], lista));
  }

  async function nexor() {
    const lic = ctx.eu.licenca;
    const blocos = [];
    if (!lic.vinculado) {
      const cod = entrada({ placeholder: "NX-XXXX-XXXX" });
      blocos.push(h("section", { class: "cartao pilha" }, h("h3", {}, "Vincular à Nexor"), h("p", { class: "suave" }, "Digite o código do cliente que a Nexor passou. O sistema se liga na hora à Nexor Central (suporte, atualizações e contrato)."), h("div", { class: "linha-entre" }, cod, h("button", { class: "btn btn-primario", onclick: (e) => acao(e.currentTarget, async () => (await post("/nexor/vincular", { codigo: cod.value }), aviso("Vinculado à Nexor."), recarregar())) }, "Vincular"))));
    } else blocos.push(h("section", { class: "cartao" }, h("h3", {}, "Nexor Central"), h("p", {}, "Este sistema está vinculado à Nexor. Situação do contrato: ", h("strong", {}, lic.situacao), ".")));
    if (ctx.nexor) {
      const a = await get("/nexor/ajustes");
      const ocultos = new Set(a.ocultos);
      const grupo = (titulo, itens) => h("div", { class: "nexor-grupo" }, h("h3", {}, titulo), Object.entries(itens).map(([k, v]) => h("label", { class: "linha-check" }, h("input", { type: "checkbox", checked: ocultos.has(k), onchange: (e) => (e.target.checked ? ocultos.add(k) : ocultos.delete(k)) }), h("span", {}, v.rotulo))));
      blocos.push(h("section", { class: "cartao pilha" }, h("h3", {}, "Esconder do cliente (Suporte Nexor)"), grupo("Módulos", a.catalogo.modulos), grupo("Telas de configuração", a.catalogo.abas), salvarBtn("Salvar ajustes", async () => (await put("/nexor/ajustes", { ocultos: [...ocultos] }), aviso("Ajustes salvos."), recarregar())), h("button", { class: "btn btn-fantasma", onclick: (e) => acao(e.currentTarget, async () => (await post("/nexor/sincronizar"), aviso("Sincronizado com a Central."))) }, "Sincronizar agora")));
    }
    return h("div", { class: "pilha" }, blocos);
  }

  async function auditoria() {
    const [l, envios] = await Promise.all([get("/auditoria"), get("/envios")]);
    const quando = (ms) => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
    return h("div", { class: "pilha" }, h("section", { class: "cartao" }, h("h3", {}, "Mensagens enviadas"), tabela([{ titulo: "Quando", valor: (e) => quando(e.criado_em) }, { titulo: "Canal", valor: (e) => e.canal }, { titulo: "Motivo", valor: (e) => e.motivo }, { titulo: "Situação", valor: (e) => (e.status === "erro" ? h("span", { class: "perigo", title: e.erro ?? "" }, `erro: ${e.erro ?? ""}`) : "enviado") }], envios.slice(0, 50), { vazio: "Nenhuma mensagem ainda." })), h("section", { class: "cartao" }, h("h3", {}, "Quem fez o quê"), tabela([{ titulo: "Quando", valor: (x) => quando(x.criado_em) }, { titulo: "Quem", valor: (x) => x.autor }, { titulo: "Ação", valor: (x) => x.acao.replaceAll("_", " ") }], l)));
  }

  async function carregar() {
    limpar(corpo, h("div", { class: "carregando-bloco" }, h("span", { class: "girando" })));
    const fn = { barbearia, horarios, servicos, barbeiros, canais, equipe, nexor, auditoria }[aba] ?? barbearia;
    limpar(corpo, await fn());
  }
  await carregar();
}
