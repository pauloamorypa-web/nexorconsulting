/* Configurações: empresa, locais (cerca de GPS e quiosque), jornadas, cargos, departamentos, feriados,
   usuários, eSocial (certificado A1) e tabelas da folha. */

import { api, del, get, post, put } from "../api.js";
import { abas, acao, aviso, confirmar, copiarTexto, dataHora, h, icone, janela, limpar, reais } from "../ui.js";
import { botao, cnpjBR, dataBR, DIAS, formulario, situacao, tabela, topo } from "../comum.js";
import { PAPEIS } from "../app.js";

let raizAtual;
let ctxAtual;
let aba = "empresa";

export async function render(raiz, ctx, [sub]) {
  raizAtual = raiz;
  ctxAtual = ctx;
  if (sub) aba = sub;
  await desenhar();
}

async function desenhar() {
  const adm = ctxAtual.pode("admin");
  const itens = [["empresa", "Empresa"], ["locais", "Locais e quiosque"], ["jornadas", "Jornadas"], ["cargos", "Cargos"], ["departamentos", "Departamentos"], ["feriados", "Feriados"], adm ? ["usuarios", "Usuários"] : null, adm ? ["esocial", "eSocial"] : null, ["tabelas", "Tabelas da folha"], adm ? ["auditoria", "Auditoria"] : null].filter(Boolean);
  if (!itens.some(([i]) => i === aba)) aba = "empresa";
  const corpo = h("div", { class: "aba-corpo" });
  limpar(raizAtual, h("div", { class: "pagina" }, topo("Configurações"), abas(itens, aba, (x) => ((aba = x), history.replaceState(null, "", `#/config/${x}`), desenhar())), corpo));
  limpar(corpo, await { empresa, locais, jornadas, cargos, departamentos, feriados, usuarios, esocial, tabelas, auditoria }[aba]());
}

async function empresa() {
  const e = await get("/empresa");
  const f = formulario([{ nome: "razao_social", rotulo: "Razão social", obrigatorio: true, largura: 2 }, { nome: "nome_fantasia", rotulo: "Nome fantasia" }, { nome: "cnpj", rotulo: "CNPJ" }, { nome: "endereco.logradouro", rotulo: "Endereço", largura: 2 }, { nome: "endereco.cidade", rotulo: "Cidade" }, { nome: "endereco.uf", rotulo: "UF" }], { ...e, cnpj: cnpjBR(e.cnpj) });
  const p = formulario([
    { nome: "exige_biometria", rotulo: "Exigir biometria (digital ou rosto) em toda marcação pelo app", tipo: "check", largura: 2 },
    { nome: "permitir_quiosque_pin", rotulo: "Permitir ponto no quiosque com CPF + PIN (quem está sem celular)", tipo: "check", largura: 2 },
  ], e.config.ponto);
  const inpi = formulario([{ nome: "registro_inpi", rotulo: "Registro do REP-P no INPI", ajuda: "Exigido pela Portaria 671 para o REP-P. Aparece no comprovante, no AFD e no AEJ." }], e.config);
  return h(
    "div",
    { class: "grade-form" },
    h("form", { class: "cartao", onsubmit: (ev) => (ev.preventDefault(), acao(ev.submitter, async () => (await put("/empresa", f.ler()), aviso("Empresa salva."), ctxAtual.recarregarEu()))) }, h("h2", {}, "Dados da empresa"), f.el, h("div", { class: "barra-salvar" }, h("button", { class: "btn btn-primario", type: "submit" }, "Salvar"))),
    h("form", { class: "cartao", onsubmit: (ev) => (ev.preventDefault(), acao(ev.submitter, async () => (await put("/empresa", { config: { ponto: p.ler(), ...inpi.ler() } }), aviso("Regras do ponto salvas.")))) }, h("h2", {}, "Regras do ponto"), p.el, inpi.el, h("p", { class: "suave pequeno" }, "GPS e QR Code obrigatórios são definidos por local, na aba Locais e quiosque."), h("div", { class: "barra-salvar" }, h("button", { class: "btn btn-primario", type: "submit" }, "Salvar"))),
  );
}

async function locais() {
  const lista = await get("/estabelecimentos");
  const editar = (l) => {
    const f = formulario([
      { nome: "nome", rotulo: "Nome do local", obrigatorio: true, largura: 2 },
      { nome: "cnpj", rotulo: "CNPJ (filial)", ajuda: "Vazio = mesmo da empresa." },
      { nome: "raio_m", rotulo: "Raio da cerca (metros)", tipo: "numero", min: 20, max: 5000, padrao: 150 },
      { nome: "lat", rotulo: "Latitude", tipo: "numero", passo: "any" },
      { nome: "lng", rotulo: "Longitude", tipo: "numero", passo: "any" },
      { nome: "exige_gps", rotulo: "Exigir estar dentro da cerca para bater o ponto", tipo: "check", padrao: true, largura: 2 },
      { nome: "exige_qr", rotulo: "Exigir o QR Code do quiosque (presença física garantida)", tipo: "check", largura: 2 },
      { nome: "ativo", rotulo: "Ativo", tipo: "check", padrao: true },
    ], l ?? {});
    const colar = h("input", { class: "entrada", placeholder: "Cole aqui as coordenadas do Google Maps (ex.: -23.5505, -46.6333)", oninput: (e) => { const m = /(-?\d+[.,]\d+)\s*[,; ]\s*(-?\d+[.,]\d+)/.exec(e.target.value); if (m) { f.entrada("lat").value = m[1].replace(",", "."); f.entrada("lng").value = m[2].replace(",", "."); } } });
    const aqui = botao("Usar minha localização atual", (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      navigator.geolocation.getCurrentPosition((p) => { f.entrada("lat").value = p.coords.latitude.toFixed(6); f.entrada("lng").value = p.coords.longitude.toFixed(6); b.disabled = false; aviso(`Localização capturada (precisão ${Math.round(p.coords.accuracy)} m).`); }, (er) => { b.disabled = false; aviso(er.message, "erro"); }, { enableHighAccuracy: true, timeout: 15000 });
    }, "btn-fantasma btn-pequeno", "local");
    janela({
      titulo: l ? `Editar ${l.nome}` : "Novo local de trabalho",
      largura: 620,
      conteudo: h("div", { class: "pilha" }, f.el, h("div", { class: "pilha" }, h("span", { class: "campo-rotulo" }, "Localização no mapa"), colar, aqui, h("small", { class: "suave" }, "No Google Maps, clique com o botão direito no local e copie as coordenadas."))),
      acoes: [l ? { texto: "Excluir", classe: "btn-perigo-fantasma", fn: (e, fechar) => acao(e.currentTarget, async () => (await confirmar(`Excluir ${l.nome}?`, { perigo: true })) && (await del(`/estabelecimentos/${l.id}`), fechar(), desenhar())) } : null, { texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (l ? await put(`/estabelecimentos/${l.id}`, f.ler()) : await post("/estabelecimentos", f.ler()), fechar(), desenhar())) }].filter(Boolean),
    });
  };
  const quiosque = async (l) => {
    if (l.quiosque_ativo && !(await confirmar("Gerar um novo link desativa o tablet que está usando o link atual. Continuar?", { botao: "Gerar novo link" }))) return;
    const r = await post(`/estabelecimentos/${l.id}/quiosque`);
    janela({ titulo: `Quiosque · ${l.nome}`, conteudo: h("div", { class: "pilha" }, h("p", {}, "Abra este link no tablet ou TV da entrada (tela cheia). O QR Code muda a cada 30 segundos: foto ou print não funcionam depois."), h("div", { class: "copiavel" }, h("code", {}, r.link)), h("p", { class: "suave" }, "O link é secreto: guarde-o só no aparelho do quiosque. Este link só aparece agora.")), acoes: [{ texto: "Copiar link", classe: "btn-primario", fn: () => copiarTexto(r.link) }] });
    desenhar();
  };
  return h(
    "section",
    { class: "cartao" },
    h("div", { class: "cartao-topo" }, h("h2", {}, "Locais de trabalho"), botao("Novo local", () => editar(), "btn-primario btn-pequeno", "mais")),
    tabela(
      [
        { titulo: "Local", valor: (l) => h("div", {}, h("strong", {}, l.nome), h("br"), h("small", { class: "suave" }, l.cnpj ? cnpjBR(l.cnpj) : "")) },
        { titulo: "Cerca de GPS", valor: (l) => (l.lat !== null ? `${l.exige_gps ? "Ativa" : "Desligada"} · ${l.raio_m} m` : h("span", { class: "chip chip-alerta" }, "Sem localização")) },
        { titulo: "QR obrigatório", valor: (l) => (l.exige_qr ? "Sim" : "Não") },
        { titulo: "Quiosque", valor: (l) => (l.quiosque_ativo ? h("span", { class: "chip chip-ok" }, "ativo") : "—") },
        { titulo: "", valor: (l) => h("div", { class: "tags" }, botao(l.quiosque_ativo ? "Novo link do quiosque" : "Ativar quiosque", (e) => (e.stopPropagation(), quiosque(l)), "btn-pequeno btn-fantasma", "qr"), l.quiosque_ativo ? botao("Desativar", async (e) => (e.stopPropagation(), await del(`/estabelecimentos/${l.id}/quiosque`), desenhar()), "btn-pequeno btn-perigo-fantasma") : null) },
      ],
      lista,
      { aoClicar: editar },
    ),
  );
}

async function jornadas() {
  const lista = await get("/jornadas");
  const editar = (j) => {
    const tipo = h("select", { class: "entrada" }, h("option", { value: "semanal", selected: j?.tipo !== "escala" }, "Semanal (dias fixos)"), h("option", { value: "escala", selected: j?.tipo === "escala" }, "Escala (12x36, 6x1, 5x2…)"));
    const geral = formulario([{ nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 }, { nome: "horas_semanais", rotulo: "Horas semanais (contrato)", tipo: "numero", passo: "0.5", padrao: 44 }, { nome: "tolerancia_min", rotulo: "Tolerância por marcação (min)", tipo: "numero", min: 0, max: 10, padrao: 5 }, { nome: "banco_horas", rotulo: "Banco de horas (extras viram crédito em vez de pagamento)", tipo: "check", largura: 2 }], j ?? {});
    const linhas = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const v = j?.dias?.[d];
      const ent = h("input", { class: "entrada", type: "time", value: v?.entrada ?? (d > 0 && d < 6 ? "08:00" : "") });
      const sai = h("input", { class: "entrada", type: "time", value: v?.saida ?? (d > 0 && d < 6 ? "17:48" : "") });
      const int = h("input", { class: "entrada", type: "number", min: 0, max: 300, value: v?.intervalo_min ?? 60 });
      return { d, ent, sai, int, el: h("div", { class: "jornada-dia" }, h("strong", {}, DIAS[d]), ent, sai, int) };
    });
    const semanal = h("div", { class: "pilha" }, h("div", { class: "jornada-dia cab" }, h("span"), h("small", {}, "Entrada"), h("small", {}, "Saída"), h("small", {}, "Intervalo (min)")), linhas.map((l) => l.el), h("small", { class: "suave" }, "Deixe entrada e saída vazias nos dias de folga."));
    const esc = formulario([{ nome: "trabalha", rotulo: "Dias trabalhados", tipo: "numero", min: 1, padrao: 1 }, { nome: "folga", rotulo: "Dias de folga", tipo: "numero", min: 1, padrao: 1 }, { nome: "entrada", rotulo: "Entrada", tipo: "hora", padrao: "07:00" }, { nome: "saida", rotulo: "Saída", tipo: "hora", padrao: "19:00" }, { nome: "intervalo_min", rotulo: "Intervalo (min)", tipo: "numero", padrao: 60 }, { nome: "inicio", rotulo: "Primeiro dia trabalhado da escala", tipo: "data" }], j?.escala ?? {});
    const area = h("div");
    const trocar = () => limpar(area, tipo.value === "escala" ? esc.el : semanal);
    tipo.onchange = trocar;
    trocar();
    janela({
      titulo: j ? `Editar ${j.nome}` : "Nova jornada",
      largura: 640,
      conteudo: h("div", { class: "pilha" }, geral.el, h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Tipo"), tipo), area),
      acoes: [
        j ? { texto: "Excluir", classe: "btn-perigo-fantasma", fn: (e, fechar) => acao(e.currentTarget, async () => (await confirmar(`Excluir ${j.nome}?`, { perigo: true })) && (await del(`/jornadas/${j.id}`), fechar(), desenhar())) } : null,
        {
          texto: "Salvar",
          classe: "btn-primario",
          fn: (e, fechar) =>
            acao(e.currentTarget, async () => {
              const d = { ...geral.ler(), tipo: tipo.value };
              if (tipo.value === "semanal") d.dias = Object.fromEntries(linhas.map((l) => [l.d, l.ent.value && l.sai.value ? { entrada: l.ent.value, saida: l.sai.value, intervalo_min: Number(l.int.value) || 0 } : null]));
              else d.escala = esc.ler();
              j ? await put(`/jornadas/${j.id}`, d) : await post("/jornadas", d);
              fechar();
              desenhar();
            }),
        },
      ].filter(Boolean),
    });
  };
  const resumo = (j) => (j.tipo === "escala" ? `${j.escala.trabalha}x${j.escala.folga} · ${j.escala.entrada}–${j.escala.saida}` : Object.entries(j.dias).filter(([, d]) => d?.entrada).map(([k, d]) => `${DIAS[k]} ${d.entrada}–${d.saida}`).join(" · "));
  return h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, "Jornadas de trabalho"), botao("Nova jornada", () => editar(), "btn-primario btn-pequeno", "mais")), tabela([{ titulo: "Jornada", valor: (j) => h("strong", {}, j.nome) }, { titulo: "Horários", valor: resumo }, { titulo: "Semanal", valor: (j) => `${j.horas_semanais}h` }, { titulo: "Tolerância", valor: (j) => `${j.tolerancia_min} min` }, { titulo: "Banco de horas", valor: (j) => (j.banco_horas ? "Sim" : "Não") }], lista, { aoClicar: editar }));
}

function crudSimples(caminho, titulo, campos, colunas) {
  return async () => {
    const lista = await get(`/${caminho}`);
    const editar = (x) => {
      const f = formulario(campos, x ?? {});
      janela({ titulo: x ? `Editar` : `Novo: ${titulo.toLowerCase()}`, conteudo: f.el, acoes: [x ? { texto: "Excluir", classe: "btn-perigo-fantasma", fn: (e, fechar) => acao(e.currentTarget, async () => (await confirmar("Excluir?", { perigo: true })) && (await del(`/${caminho}/${x.id}`), fechar(), desenhar())) } : null, { texto: "Salvar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (x ? await put(`/${caminho}/${x.id}`, f.ler()) : await post(`/${caminho}`, f.ler()), fechar(), desenhar())) }].filter(Boolean) });
    };
    return h("section", { class: "cartao" }, h("div", { class: "cartao-topo" }, h("h2", {}, titulo), botao("Adicionar", () => editar(), "btn-primario btn-pequeno", "mais")), tabela(colunas, lista, { aoClicar: editar }));
  };
}

const cargos = crudSimples("cargos", "Cargos", [{ nome: "nome", rotulo: "Cargo", obrigatorio: true, largura: 2 }, { nome: "cbo", rotulo: "CBO (6 dígitos)", ajuda: "Classificação Brasileira de Ocupações, exigida no eSocial." }, { nome: "salario_centavos", rotulo: "Salário base (R$)", tipo: "reais" }, { nome: "descricao", rotulo: "Descrição", tipo: "area", largura: 2 }], [{ titulo: "Cargo", valor: (c) => c.nome }, { titulo: "CBO", valor: (c) => c.cbo ?? "—" }, { titulo: "Salário base", valor: (c) => reais(c.salario_centavos) }]);
const departamentos = async () => {
  const usuarios = ctxAtual.pode("admin") ? await get("/usuarios") : [];
  return crudSimples("departamentos", "Departamentos", [{ nome: "nome", rotulo: "Departamento", obrigatorio: true, largura: 2 }, { nome: "gestor_id", rotulo: "Gestor (usuário do painel)", tipo: "select", opcoes: [["", "—"], ...usuarios.filter((u) => u.papel === "gestor").map((u) => [u.id, u.nome])], largura: 2 }], [{ titulo: "Departamento", valor: (d) => d.nome }, { titulo: "Gestor", valor: (d) => usuarios.find((u) => u.id === d.gestor_id)?.nome ?? "—" }])();
};

async function feriados() {
  const ano = new Date().getFullYear();
  const [lista, nacionais] = await Promise.all([get("/feriados"), get(`/feriados/nacionais/${ano}`)]);
  const f = formulario([{ nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true }, { nome: "nome", rotulo: "Feriado", obrigatorio: true }]);
  return h(
    "div",
    { class: "grade-form" },
    h("section", { class: "cartao" }, h("h2", {}, "Feriados estaduais, municipais e da empresa"), h("form", { class: "pilha", onsubmit: (e) => (e.preventDefault(), acao(e.submitter, async () => (await post("/feriados", f.ler()), desenhar()))) }, f.el, h("button", { class: "btn btn-primario", type: "submit" }, "Adicionar")), tabela([{ titulo: "Data", valor: (x) => dataBR(x.data) }, { titulo: "Feriado", valor: (x) => x.nome }, { titulo: "", valor: (x) => h("button", { class: "btn-icone", "aria-label": "Excluir", onclick: async () => (await del(`/feriados/${x.id}`), desenhar()) }, icone("lixo", 16)) }], lista, { vazio: "Nenhum. Inclua o aniversário da cidade, Carnaval (se a empresa folga), Corpus Christi…" })),
    h("section", { class: "cartao" }, h("h2", {}, `Feriados nacionais de ${ano} (automáticos)`), h("ul", { class: "lista-simples" }, nacionais.map((x) => h("li", {}, `${dataBR(x.data)} · ${x.nome}`)))),
  );
}

async function usuarios() {
  const [lista, deps] = await Promise.all([get("/usuarios"), get("/departamentos")]);
  const novo = () => {
    const f = formulario([{ nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 }, { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largura: 2 }, { nome: "senha", rotulo: "Senha inicial", tipo: "senha", obrigatorio: true }, { nome: "papel", rotulo: "Perfil", tipo: "select", opcoes: Object.entries(PAPEIS) }, { nome: "departamento_id", rotulo: "Departamento (gestor)", tipo: "select", opcoes: [["", "—"], ...deps.map((d) => [d.id, d.nome])] }]);
    janela({ titulo: "Novo usuário do painel", conteudo: h("div", { class: "pilha" }, f.el, h("p", { class: "suave pequeno" }, "Administrador: tudo. RH: tudo menos usuários e certificado. Gestor: só a própria equipe (ponto, ajustes e férias).")), acoes: [{ texto: "Criar", classe: "btn-primario", fn: (e, fechar) => acao(e.currentTarget, async () => (await post("/usuarios", f.ler()), fechar(), desenhar())) }] });
  };
  return h(
    "section",
    { class: "cartao" },
    h("div", { class: "cartao-topo" }, h("h2", {}, "Usuários do painel"), botao("Novo usuário", novo, "btn-primario btn-pequeno", "mais")),
    tabela([{ titulo: "Nome", valor: (u) => u.nome }, { titulo: "E-mail", valor: (u) => u.email }, { titulo: "Perfil", valor: (u) => PAPEIS[u.papel] }, { titulo: "Situação", valor: (u) => (u.ativo ? situacao("ativo") : h("span", { class: "chip" }, "desativado")) }, { titulo: "", valor: (u) => (u.id === ctxAtual.eu.usuario.id ? h("small", { class: "suave" }, "você") : botao(u.ativo ? "Desativar" : "Reativar", (e) => acao(e.currentTarget, async () => (await put(`/usuarios/${u.id}`, { ativo: !u.ativo }), desenhar())), "btn-pequeno btn-fantasma")) }], lista),
  );
}

async function esocial() {
  const e = await get("/empresa");
  const c = e.config.esocial;
  const f = formulario([
    { nome: "ativo", rotulo: "Gerar eventos do eSocial automaticamente", tipo: "check", largura: 2 },
    { nome: "ambiente", rotulo: "Ambiente", tipo: "select", opcoes: [["2", "Produção restrita (testes)"], ["1", "Produção (envio oficial)"]], largura: 2 },
    { nome: "class_trib", rotulo: "Classificação tributária", tipo: "select", opcoes: [["99", "99 · Pessoa jurídica em geral"], ["01", "01 · Simples Nacional (sem substituição)"], ["02", "02 · Simples Nacional (com substituição)"], ["03", "03 · Simples Nacional (com CPP)"], ["04", "04 · MEI"], ["22", "22 · Produtor rural PF/segurado especial"]], largura: 2 },
    { nome: "cnae", rotulo: "CNAE preponderante (7 dígitos)" },
    { nome: "fpas", rotulo: "FPAS", ajuda: "515 comércio/serviços, 507 indústria…" },
    { nome: "cod_tercs", rotulo: "Código de terceiros", padrao: "0115" },
    { nome: "rat", rotulo: "Alíquota RAT (1, 2 ou 3)" },
    { nome: "fap", rotulo: "FAP", ajuda: "Ex.: 1.0000" },
    { nome: "inicio_validade", rotulo: "Início de validade das tabelas (AAAA-MM)", tipo: "mes" },
  ], { ...c, ambiente: String(c.ambiente) });
  const transm = formulario([{ nome: "transmissor_cnpj", rotulo: "CNPJ do transmissor (se for o contador, com procuração)", ajuda: "Vazio = a própria empresa." }], e.config);
  const pfx = h("input", { type: "file", class: "entrada", accept: ".pfx,.p12" });
  const senha = h("input", { type: "password", class: "entrada", autocomplete: "off" });
  const cert = e.config.certificado;
  return h(
    "div",
    { class: "grade-form" },
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "Certificado digital A1"),
      cert ? h("p", {}, `✅ ${cert.titular}`, h("br"), h("small", { class: "suave" }, `Válido até ${dataHora(cert.valido_ate)} · enviado em ${dataHora(cert.enviado_em)}`)) : h("p", { class: "suave" }, "Nenhum certificado. Use o e-CNPJ A1 (arquivo .pfx) da empresa ou do procurador."),
      h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Arquivo .pfx"), pfx),
      h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Senha do certificado"), senha),
      h("p", { class: "suave pequeno" }, "O arquivo e a senha ficam criptografados (AES-256) no servidor e nunca voltam ao navegador. Usados para assinar eventos (XMLDSig), o AFD (CAdES) e a conexão segura com o eSocial."),
      h(
        "div",
        { class: "barra-salvar" },
        cert ? botao("Remover", (ev) => acao(ev.currentTarget, async () => (await confirmar("Remover o certificado?", { perigo: true })) && (await del("/esocial/certificado"), desenhar())), "btn-perigo-fantasma") : null,
        botao("Enviar certificado", (ev) => acao(ev.currentTarget, async () => { const a = pfx.files[0]; if (!a) throw new Error("Escolha o arquivo .pfx."); const r = await fetch("/api/esocial/certificado", { method: "POST", headers: { "x-nexor": "1", "Content-Type": "application/x-pkcs12", "x-senha": encodeURIComponent(senha.value) }, body: a }); const d = await r.json(); if (!r.ok) throw new Error(d.erro); aviso(`Certificado de ${d.titular} instalado.`); desenhar(); }), "btn-primario", "upload"),
      ),
    ),
    h("form", { class: "cartao", onsubmit: (ev) => (ev.preventDefault(), acao(ev.submitter, async () => { const d = f.ler(); d.ambiente = Number(d.ambiente); if (d.ambiente === 1 && !(await confirmar("No ambiente de PRODUÇÃO os eventos têm valor legal. Já testou em produção restrita?", { botao: "Sim, usar produção" }))) return; await put("/empresa", { config: { esocial: d, ...transm.ler() } }); aviso("Configuração do eSocial salva."); })) }, h("h2", {}, "Dados do empregador"), f.el, transm.el, h("div", { class: "barra-salvar" }, h("button", { class: "btn btn-primario", type: "submit" }, "Salvar"))),
  );
}

async function tabelas() {
  const t = await get("/tabelas");
  const area = h("textarea", { class: "entrada mono", rows: 22, disabled: !ctxAtual.pode("admin") });
  area.value = JSON.stringify(t.vigentes, null, 2);
  const faixa = (lista) => h("ul", { class: "lista-simples" }, lista.map((f) => h("li", {}, `${f.ate ? `até ${reais(f.ate)}` : "acima"}: ${(f.aliquota * 100).toFixed(1).replace(".", ",")}%${f.deducao ? ` (dedução ${reais(f.deducao)})` : ""}`)));
  return h(
    "div",
    { class: "grade-form" },
    h("section", { class: "cartao" }, h("h2", {}, `Tabelas vigentes ${t.personalizadas ? "(personalizadas)" : `(padrão ${t.vigentes.vigencia})`}`), h("p", {}, `Salário mínimo: ${reais(t.vigentes.salario_minimo)}`), h("h3", {}, "INSS (progressivo)"), faixa(t.vigentes.inss), h("h3", {}, "IRRF mensal"), faixa(t.vigentes.irrf), h("p", { class: "suave pequeno" }, `Dedução por dependente ${reais(t.vigentes.irrf_dependente)} · desconto simplificado ${reais(t.vigentes.irrf_desconto_simplificado)} · redução da Lei 15.270/2025 a partir de ${t.vigentes.irrf_reducao?.desde ?? "—"} (isenção até ${reais(t.vigentes.irrf_reducao?.isento_ate)})`), h("p", { class: "suave pequeno" }, `Salário-família ${reais(t.vigentes.salario_familia.valor)} por filho até ${t.vigentes.salario_familia.idade_limite - 1} anos, para remuneração até ${reais(t.vigentes.salario_familia.ate_remuneracao)}`)),
    h(
      "section",
      { class: "cartao" },
      h("h2", {}, "Atualizar tabelas"),
      h("p", { class: "suave" }, "Os valores mudam todo ano (portaria do INSS em janeiro, salário mínimo, IRRF). Edite aqui quando sair a nova tabela. Valores em centavos."),
      area,
      ctxAtual.pode("admin") ? h("div", { class: "barra-salvar" }, botao("Restaurar padrão", (e) => acao(e.currentTarget, async () => (await put("/empresa", { config: { tabelas: null } }), desenhar())), "btn-fantasma"), botao("Salvar tabelas", (e) => acao(e.currentTarget, async () => { let v; try { v = JSON.parse(area.value); } catch { throw new Error("JSON inválido."); } await put("/empresa", { config: { tabelas: v } }); aviso("Tabelas atualizadas."); desenhar(); }), "btn-primario")) : null,
    ),
  );
}

async function auditoria() {
  const lista = await get("/auditoria");
  return h("section", { class: "cartao" }, h("h2", {}, "Registro de atividades"), tabela([{ titulo: "Quando", valor: (a) => dataHora(a.criado_em) }, { titulo: "Quem", valor: (a) => a.autor }, { titulo: "O quê", valor: (a) => a.acao.replace(/_/g, " ") }, { titulo: "Detalhe", valor: (a) => (a.detalhe && Object.keys(a.detalhe).length ? h("small", { class: "mono" }, JSON.stringify(a.detalhe)) : "") }], lista));
}

void api;
