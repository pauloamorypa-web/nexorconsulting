/* Configurações: conexão com o WhatsApp (API oficial da Meta), horários, equipe, respostas rápidas e auditoria. */

import { del, get, post, put } from "../api.js";
import { abas, acao, area, aviso, campo, confirmar, copiarTexto, dataHora, entrada, erro, h, icone, janela, limpar, seletor, telefone, vazio } from "../ui.js";

const ABAS = [
  ["whatsapp", "WhatsApp", "whatsapp"],
  ["horarios", "Horários e serviços", "relogio"],
  ["equipe", "Equipe", "contatos"],
  ["rapidas", "Respostas rápidas", "raio"],
  ["empresa", "Empresa", "config"],
  ["auditoria", "Histórico", "escudo"],
];
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const QUALIDADE = { GREEN: ["Alta", "ok"], YELLOW: ["Média", "alerta"], RED: ["Baixa", "perigo"], UNKNOWN: ["Em avaliação", "alerta"] };
let ctxApp;

export async function render(raiz, ctx, [aba = "whatsapp"]) {
  ctxApp = ctx;
  const topo = h("div");
  const corpo = h("div", { class: "aba-corpo" });
  const trocar = (id) => {
    history.replaceState(null, "", `#/config/${id}`);
    limpar(topo, abas(ABAS, id, trocar));
    limpar(corpo, h("div", { class: "carregando-bloco" }, h("span", { class: "girando" })));
    ({ whatsapp, horarios, equipe, rapidas, empresa, auditoria })[id](corpo).catch(erro);
  };
  raiz.append(h("div", { class: "pagina" }, h("header", { class: "pagina-topo" }, h("div", {}, h("h1", {}, "Configurações"))), topo, corpo));
  trocar(ABAS.some((a) => a[0] === aba) ? aba : "whatsapp");
}

/* ---------- WhatsApp ---------- */

async function whatsapp(alvo) {
  const eu = await ctxApp.recarregarEu();
  const estado = await get("/estado");
  const recarregar = () => whatsapp(alvo);
  const urlWebhook = eu.webhook.url.startsWith("/") ? `${location.origin}${eu.webhook.url}` : eu.webhook.url;

  limpar(
    alvo,
    eu.canais.length
      ? h(
          "section",
          { class: "cartao" },
          h("h2", {}, "Números conectados"),
          eu.canais.map((c) => {
            const [q, tq] = QUALIDADE[c.qualidade] ?? ["—", "alerta"];
            return h(
              "div",
              { class: "canal" },
              h("span", { class: `canal-ic status-${c.status}` }, icone("whatsapp", 22)),
              h(
                "div",
                { class: "item-texto" },
                h("strong", {}, c.nome_verificado ?? "Número do WhatsApp", " · ", c.numero ?? c.phone_number_id),
                h("small", { class: "suave" }, `ID do número ${c.phone_number_id}${c.waba_id ? ` · conta ${c.waba_id}` : ""}`),
                h(
                  "div",
                  { class: "nuvem" },
                  h("span", { class: `chip chip-${c.status === "erro" ? "perigo" : c.status === "ativo" ? "ok" : "alerta"}` }, { ativo: "Recebendo mensagens", conectado: "Conectado · aguardando a 1ª mensagem", erro: "Com erro", pendente: "Pendente" }[c.status] ?? c.status),
                  h("span", { class: `chip chip-${tq}` }, `Qualidade ${q}`),
                ),
                c.ultimo_erro ? h("p", { class: "erro-texto" }, icone("alerta", 14), c.ultimo_erro) : null,
              ),
              h(
                "div",
                { class: "item-acoes coluna" },
                h("button", { class: "btn btn-pequeno", onclick: (e) => acao(e.currentTarget, async () => { const r = await post(`/canais/${c.id}/testar`); r.ok ? aviso(`Conexão ok: ${r.info.verified_name} · ${r.info.display_phone_number}`) : erro(new Error(r.erro)); recarregar(); }) }, "Testar"),
                h("button", { class: "btn btn-pequeno", onclick: () => perfil(c) }, "Perfil comercial"),
                h("button", { class: "btn btn-pequeno", onclick: () => registrar(c) }, "Registrar número"),
                eu.usuario.papel === "dono" ? h("button", { class: "btn btn-pequeno btn-perigo-fantasma", onclick: async () => (await confirmar("Desconectar este número? As conversas ficam guardadas.", { perigo: true, botao: "Desconectar" })) && del(`/canais/${c.id}`).then(recarregar, erro) }, "Desconectar") : null,
              ),
            );
          }),
        )
      : null,
    estado.cadastroIncorporado ? cadastroIncorporado(estado, recarregar) : null,
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, eu.canais.length ? "Conectar outro número" : "Conectar o WhatsApp pela API oficial da Meta"),
      h("p", { class: "suave" }, "Siga os passos. Leva uns 15 minutos e só precisa ser feito uma vez."),
      h(
        "ol",
        { class: "tutorial" },
        h("li", {}, h("strong", {}, "Crie o app na Meta. "), "Acesse ", h("a", { href: "https://developers.facebook.com/apps", target: "_blank", rel: "noopener" }, "developers.facebook.com/apps"), ", clique em Criar app → tipo Empresa, e adicione o produto WhatsApp."),
        h("li", {}, h("strong", {}, "Adicione o número. "), "Em WhatsApp → Configuração da API, adicione o número da empresa e confirme pelo código SMS. O número não pode estar ativo no app WhatsApp comum (use um número novo ou o modo de coexistência)."),
        h("li", {}, h("strong", {}, "Gere um token permanente. "), "No Gerenciador de Negócios → Usuários do sistema, crie um usuário Administrador, atribua o app e a conta do WhatsApp e gere um token com as permissões whatsapp_business_messaging e whatsapp_business_management."),
        h(
          "li",
          {},
          h("strong", {}, "Configure o webhook. "),
          "Em WhatsApp → Configuração → Webhook, cole os dados abaixo e assine o campo ",
          h("code", {}, "messages"),
          " (e também ",
          h("code", {}, "message_template_status_update"),
          ").",
          h("div", { class: "copiavel" }, h("small", {}, "URL de retorno"), h("code", {}, urlWebhook), h("button", { class: "btn-icone", "aria-label": "Copiar URL", onclick: () => copiarTexto(urlWebhook) }, icone("copiar", 16))),
          h("div", { class: "copiavel" }, h("small", {}, "Token de verificação"), h("code", {}, eu.webhook.token), h("button", { class: "btn-icone", "aria-label": "Copiar token", onclick: () => copiarTexto(eu.webhook.token) }, icone("copiar", 16))),
          eu.webhook.segredoGlobal ? null : h("p", { class: "erro-texto" }, icone("alerta", 14), "O servidor está sem META_APP_SECRET: informe o segredo do seu app no formulário abaixo para as mensagens serem aceitas."),
        ),
        h("li", {}, h("strong", {}, "Cole os dados aqui. "), "O ID do número e o ID da conta ficam em WhatsApp → Configuração da API."),
      ),
      formConexao(eu, recarregar),
    ),
  );
}

function formConexao(eu, depois) {
  const idNumero = entrada({ inputmode: "numeric", placeholder: "Ex.: 106540352242922" });
  const idConta = entrada({ inputmode: "numeric", placeholder: "Ex.: 102290129340398" });
  const token = entrada({ type: "password", placeholder: "EAAG...", autocomplete: "off" });
  const segredo = entrada({ type: "password", placeholder: eu.webhook.segredoGlobal ? "Opcional (já configurado no servidor)" : "Configurações do app → Básico → Chave secreta", autocomplete: "off" });
  const botao = h("button", { class: "btn btn-primario btn-grande" }, icone("link", 16), "Conectar e testar");
  botao.addEventListener("click", () =>
    acao(botao, async () => {
      const r = await post("/canais", { phone_number_id: idNumero.value.trim(), waba_id: idConta.value.trim(), token: token.value.trim(), segredo_app: segredo.value.trim() || undefined });
      for (const a of r.avisos) aviso(a, "info", 9000);
      aviso(`WhatsApp conectado: ${r.info.verified_name} · ${r.info.display_phone_number} 🎉`);
      await ctxApp.recarregarEu();
      depois();
    }),
  );
  return h("div", { class: "pilha form-conexao" }, h("div", { class: "grade-2" }, campo("ID do número de telefone", idNumero), campo("ID da conta do WhatsApp Business", idConta)), campo("Token de acesso permanente", token, "Fica guardado criptografado. Ninguém da equipe consegue ver depois."), campo("Chave secreta do app", segredo, "Usada para conferir que as mensagens vêm mesmo da Meta."), botao);
}

/** Cadastro incorporado da Meta (Embedded Signup): conecta o número com alguns cliques, sem copiar IDs */
function cadastroIncorporado(estado, depois) {
  const botao = h("button", { class: "btn btn-whats btn-grande" }, icone("whatsapp", 18), "Conectar com o Facebook");
  let dadosSessao = null;
  window.addEventListener("message", (e) => {
    if (!/facebook\.com$/.test(new URL(e.origin).hostname)) return;
    try {
      const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      if (d?.type === "WA_EMBEDDED_SIGNUP" && d.event === "FINISH") dadosSessao = d.data;
    } catch {
      /* outras mensagens */
    }
  });
  botao.addEventListener("click", () =>
    acao(botao, async () => {
      if (!window.FB) {
        await new Promise((ok, falha) => {
          const s = document.createElement("script");
          s.src = "https://connect.facebook.net/pt_BR/sdk.js";
          s.onload = ok;
          s.onerror = () => falha(new Error("Não foi possível carregar o SDK da Meta."));
          document.head.append(s);
        });
        window.FB.init({ appId: estado.idApp, autoLogAppEvents: true, xfbml: false, version: "v23.0" });
      }
      const codigo = await new Promise((ok, falha) =>
        window.FB.login((r) => (r.authResponse?.code ? ok(r.authResponse.code) : falha(new Error("Conexão cancelada."))), { config_id: estado.idConfiguracao, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "", sessionInfoVersion: "3" } }),
      );
      await new Promise((r) => setTimeout(r, 800));
      if (!dadosSessao?.phone_number_id) throw new Error("A Meta não informou o número escolhido. Tente de novo.");
      const r = await post("/canais/cadastro-incorporado", { codigo, phone_number_id: dadosSessao.phone_number_id, waba_id: dadosSessao.waba_id });
      aviso(`WhatsApp conectado: ${r.info.display_phone_number} 🎉`);
      depois();
    }),
  );
  return h("section", { class: "cartao destaque-ia" }, h("h2", {}, "Jeito mais rápido"), h("p", { class: "suave" }, "Entre com o Facebook da empresa, escolha ou crie a conta do WhatsApp Business e o número. Nós cuidamos do resto."), botao);
}

async function perfil(c) {
  const p = await get(`/canais/${c.id}/perfil`).catch((e) => (erro(e), null));
  if (!p) return;
  const f = { about: entrada({ value: p.about ?? "", maxlength: 139 }), description: area({ rows: 3, maxlength: 512 }, p.description ?? ""), address: entrada({ value: p.address ?? "" }), email: entrada({ type: "email", value: p.email ?? "" }), site: entrada({ type: "url", value: p.websites?.[0] ?? "" }) };
  janela({
    titulo: "Perfil comercial no WhatsApp",
    conteudo: h("div", { class: "pilha" }, p.profile_picture_url ? h("img", { src: p.profile_picture_url, alt: "Foto do perfil", class: "foto-perfil" }) : null, campo("Recado (aparece abaixo do nome)", f.about), campo("Descrição", f.description), campo("Endereço", f.address), h("div", { class: "grade-2" }, campo("E-mail", f.email), campo("Site", f.site))),
    acoes: [
      {
        texto: "Salvar na Meta",
        classe: "btn-primario",
        fn: (e, fechar) =>
          acao(e.currentTarget, async () => {
            await put(`/canais/${c.id}/perfil`, { about: f.about.value, description: f.description.value, address: f.address.value, email: f.email.value, websites: f.site.value ? [f.site.value] : undefined });
            fechar();
            aviso("Perfil atualizado no WhatsApp.");
          }),
      },
    ],
  });
}

function registrar(c) {
  const pin = entrada({ inputmode: "numeric", maxlength: 6, placeholder: "6 dígitos" });
  janela({
    titulo: "Registrar número na Cloud API",
    conteudo: h("div", { class: "pilha" }, h("p", { class: "suave" }, "Necessário uma vez, se a Meta informar que o número não está registrado. Escolha um PIN de 6 dígitos (vira a verificação em duas etapas do número)."), campo("PIN", pin)),
    acoes: [{ texto: "Registrar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post(`/canais/${c.id}/registrar`, { pin: pin.value }), fechar(), aviso("Número registrado."))) }],
  });
}

/* ---------- Horários e agenda ---------- */

async function horarios(alvo) {
  const eu = await ctxApp.recarregarEu();
  const { horario: hor, agenda } = eu.empresa.config;
  const ativo = h("input", { type: "checkbox", checked: hor.ativo });
  const linhas = DIAS.map((nome, i) => {
    const faixas = hor.dias?.[i] ?? [];
    const aberto = h("input", { type: "checkbox", checked: faixas.length > 0 });
    const [a1, b1] = (faixas[0] ?? "08:00-18:00").split("-");
    const [a2, b2] = (faixas[1] ?? "-").split("-");
    const ini = entrada({ type: "time", value: a1 });
    const fim = entrada({ type: "time", value: b1 });
    const ini2 = entrada({ type: "time", value: a2 || "" });
    const fim2 = entrada({ type: "time", value: b2 || "" });
    return { i, aberto, ini, fim, ini2, fim2, el: h("div", { class: "dia-linha" }, h("label", { class: "linha-check" }, aberto, nome), ini, h("span", {}, "às"), fim, h("span", { class: "suave" }, "e"), ini2, h("span", {}, "às"), fim2) };
  });
  const agAtiva = h("input", { type: "checkbox", checked: agenda.ativa });
  const servicos = area({ rows: 4, placeholder: "Um por linha: Nome do serviço | duração em minutos" }, agenda.servicos.map((s) => `${s.nome} | ${s.duracao}`).join("\n"));
  const intervalo = entrada({ type: "number", min: 10, max: 240, value: agenda.intervalo_min });
  const antecedencia = entrada({ type: "number", min: 0, max: 240, value: agenda.antecedencia_horas });
  const diasAdiante = entrada({ type: "number", min: 1, max: 120, value: agenda.dias_adiante });
  const lembrete = entrada({ type: "number", min: 0, max: 72, value: agenda.lembrete_horas });
  const modelos = (await get("/modelos").catch(() => [])).filter((m) => m.status === "APPROVED" && m.variaveis >= 3);
  const modeloLembrete = seletor([["", "Nenhum"], ...modelos.map((m) => [`${m.nome}|${m.idioma}`, m.nome])], agenda.modelo_lembrete?.nome ? `${agenda.modelo_lembrete.nome}|${agenda.modelo_lembrete.idioma}` : "");
  const botao = h("button", { class: "btn btn-primario" }, "Salvar");
  botao.addEventListener("click", () =>
    acao(botao, async () => {
      const dias = {};
      for (const l of linhas) dias[l.i] = l.aberto.checked ? [`${l.ini.value}-${l.fim.value}`, ...(l.ini2.value && l.fim2.value ? [`${l.ini2.value}-${l.fim2.value}`] : [])] : [];
      const lista = servicos.value
        .split("\n")
        .map((x) => x.split("|").map((y) => y.trim()))
        .filter(([n]) => n)
        .map(([nome, d]) => ({ nome, duracao: Math.max(5, Number(d) || 30) }));
      const [mn, mi] = modeloLembrete.value.split("|");
      await put("/empresa", {
        config: {
          horario: { ativo: ativo.checked, dias },
          agenda: { ativa: agAtiva.checked, servicos: lista.length ? lista : [{ nome: "Atendimento", duracao: 30 }], intervalo_min: Number(intervalo.value), antecedencia_horas: Number(antecedencia.value), dias_adiante: Number(diasAdiante.value), lembrete_horas: Number(lembrete.value), modelo_lembrete: mn ? { nome: mn, idioma: mi } : { nome: "", idioma: "" } },
        },
      });
      await ctxApp.recarregarEu();
      aviso("Horários salvos.");
    }),
  );
  limpar(
    alvo,
    h(
      "div",
      { class: "grade-form" },
      h("section", { class: "cartao" }, h("h2", {}, "Horário de atendimento da equipe"), h("label", { class: "linha-check" }, ativo, "Usar horário de atendimento"), h("p", { class: "suave pequeno" }, "A IA atende 24 h. O horário define quando a equipe está disponível (a IA avisa o cliente quando a equipe volta) e os horários livres da agenda."), h("div", { class: "dias" }, linhas.map((l) => l.el))),
      h(
        "section",
        { class: "cartao" },
        h("h2", {}, "Agendamento pela IA"),
        h("label", { class: "linha-check" }, agAtiva, "A IA pode marcar, remarcar e cancelar horários"),
        campo("Serviços", servicos, "Ex.: Avaliação | 30"),
        h("div", { class: "grade-2" }, campo("Intervalo entre horários (min)", intervalo), campo("Antecedência mínima (horas)", antecedencia)),
        h("div", { class: "grade-2" }, campo("Agenda aberta para os próximos (dias)", diasAdiante), campo("Lembrete antes (horas)", lembrete)),
        campo("Modelo para lembrete fora da janela de 24 h", modeloLembrete, "Opcional: um modelo aprovado com 3 variáveis (nome, serviço, data e hora)."),
      ),
    ),
    h("div", { class: "barra-salvar" }, botao),
  );
}

/* ---------- Equipe ---------- */

async function equipe(alvo) {
  const lista = await get("/usuarios");
  const recarregar = () => equipe(alvo);
  const nome = entrada({ placeholder: "Nome" });
  const email = entrada({ type: "email", placeholder: "e-mail" });
  const senha = entrada({ type: "password", placeholder: "Senha inicial (mín. 8)", autocomplete: "new-password" });
  const papel = seletor(
    [
      ["atendente", "Atendente: conversas e contatos"],
      ["admin", "Administrador: tudo, menos excluir a conta"],
    ],
    "atendente",
  );
  limpar(
    alvo,
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "Pessoas da equipe"),
      h(
        "div",
        { class: "lista-itens" },
        lista.map((u) =>
          h(
            "div",
            { class: `item-linha ${u.ativo ? "" : "inativo"}` },
            h("div", { class: "item-texto" }, h("strong", {}, u.nome, u.id === ctxApp.eu.usuario.id ? " (você)" : ""), h("small", { class: "suave" }, u.email, " · ", { dono: "Dono", admin: "Administrador", atendente: "Atendente" }[u.papel], u.online_em ? ` · visto ${dataHora(u.online_em)}` : "", u.ativo ? "" : " · desativado")),
            u.papel !== "dono" && u.id !== ctxApp.eu.usuario.id ? h("button", { class: "btn btn-pequeno", onclick: () => put(`/usuarios/${u.id}`, { ativo: !u.ativo }).then(recarregar, erro) }, u.ativo ? "Desativar" : "Reativar") : null,
          ),
        ),
      ),
    ),
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "Adicionar pessoa"),
      h("div", { class: "grade-2" }, nome, email),
      h("div", { class: "grade-2" }, senha, papel),
      h("button", { class: "btn btn-primario", onclick: (e) => acao(e.currentTarget, async () => (await post("/usuarios", { nome: nome.value, email: email.value, senha: senha.value, papel: papel.value }), aviso("Pessoa adicionada. Envie o e-mail e a senha para ela entrar."), recarregar())) }, "Adicionar"),
    ),
    minhaSenha(),
  );
}

function minhaSenha() {
  const atual = entrada({ type: "password", placeholder: "Senha atual", autocomplete: "current-password" });
  const nova = entrada({ type: "password", placeholder: "Nova senha", autocomplete: "new-password" });
  return h("section", { class: "cartao" }, h("h2", {}, "Minha senha"), h("div", { class: "grade-2" }, atual, nova), h("button", { class: "btn", onclick: (e) => acao(e.currentTarget, async () => (await put(`/usuarios/${ctxApp.eu.usuario.id}`, { senha: nova.value, senha_atual: atual.value }), (atual.value = nova.value = ""), aviso("Senha alterada."))) }, "Alterar senha"));
}

/* ---------- Respostas rápidas ---------- */

async function rapidas(alvo) {
  const lista = await get("/respostas-rapidas");
  const recarregar = () => rapidas(alvo);
  const atalho = entrada({ placeholder: "atalho (ex.: pix)" });
  const texto = area({ rows: 3, placeholder: "Texto. Use {nome} para o primeiro nome do cliente." });
  limpar(
    alvo,
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "Respostas rápidas"),
      h("p", { class: "suave" }, "Na conversa, digite / e o atalho para inserir o texto."),
      lista.length
        ? h("div", { class: "lista-itens" }, lista.map((r) => h("div", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, `/${r.atalho}`), h("p", {}, r.texto)), h("button", { class: "btn-icone", "aria-label": "Excluir", onclick: () => del(`/respostas-rapidas/${r.id}`).then(recarregar, erro) }, icone("lixo")))))
        : vazio("raio", "Nenhuma resposta rápida", "Crie atalhos para mensagens que a equipe repete muito."),
    ),
    h("section", { class: "cartao" }, h("h2", {}, "Nova resposta rápida"), campo("Atalho", atalho), campo("Texto", texto), h("button", { class: "btn btn-primario", onclick: (e) => acao(e.currentTarget, async () => (await post("/respostas-rapidas", { atalho: atalho.value, texto: texto.value }), recarregar())) }, "Salvar")),
  );
}

/* ---------- Empresa ---------- */

async function empresa(alvo) {
  const eu = await ctxApp.recarregarEu();
  const nome = entrada({ value: eu.empresa.nome });
  const segmento = entrada({ value: eu.empresa.segmento ?? "" });
  limpar(
    alvo,
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "Dados da empresa"),
      h("div", { class: "grade-2" }, campo("Nome", nome), campo("Ramo de atuação", segmento)),
      h("button", { class: "btn btn-primario", onclick: (e) => acao(e.currentTarget, async () => (await put("/empresa", { nome: nome.value, segmento: segmento.value }), await ctxApp.recarregarEu(), aviso("Dados salvos."))) }, "Salvar"),
    ),
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "Privacidade e LGPD"),
      h(
        "ul",
        { class: "lista-simples" },
        h("li", {}, "Os tokens da Meta ficam criptografados (AES-256-GCM)."),
        h("li", {}, "As conversas ficam no seu servidor. A IA (Claude, da Anthropic) recebe só o trecho necessário para responder."),
        h("li", {}, "Clientes que pedem para sair deixam de receber campanhas automaticamente."),
        h("li", {}, "Você pode exportar ou excluir os dados de um contato a qualquer momento (Contatos)."),
      ),
    ),
  );
}

async function auditoria(alvo) {
  const lista = await get("/auditoria");
  const ACOES = { login: "Entrou no painel", conta_criada: "Criou a conta", configuracao_alterada: "Alterou configurações", whatsapp_conectado: "Conectou o WhatsApp", whatsapp_removido: "Desconectou um número", usuario_criado: "Adicionou uma pessoa", contato_removido: "Excluiu um contato", contatos_importados: "Importou contatos", modelo_criado: "Criou um modelo", campanha_criada: "Criou uma campanha", ia_corrigida: "Ensinou a IA" };
  limpar(
    alvo,
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "Histórico de ações"),
      lista.length
        ? h("table", { class: "tabela" }, h("tbody", {}, lista.map((a) => h("tr", {}, h("td", {}, dataHora(a.criado_em)), h("td", {}, a.usuario_nome ?? "Sistema"), h("td", {}, ACOES[a.acao] ?? a.acao, a.detalhe?.numero ? ` ${telefone(a.detalhe.numero)}` : a.detalhe?.nome ? ` · ${a.detalhe.nome}` : "")))))
        : vazio("escudo", "Sem registros", ""),
    ),
  );
}
