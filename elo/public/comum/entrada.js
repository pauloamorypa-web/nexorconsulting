/* Página de entrada do Nexor Elo: escolher o caminho (fornecedor, instalador, operação Nexor) e cadastrar um fornecedor. */

import { h, icone, limpar, acao, aviso, formulario } from "./ui.js";
import { criarApi } from "./api.js";
import { botaoTema } from "./casca.js";

// Endereços antigos com hash (a demonstração redireciona para /#/fornecedor, /#/instalador/os e /#/nexor)
const antigo = location.hash.match(/^#\/(fornecedor|nexor|instalador)(\/.*)?$/);
if (antigo) {
  const [, area, resto = ""] = antigo;
  location.replace(area === "instalador" ? `/app/${resto ? `#${resto}` : ""}` : `/${area}/`);
} else montar();

function montar() {
  const api = criarApi("fornecedor");
  const raiz = document.getElementById("app");

  const caminho = (href, ic, titulo, texto, chamada) =>
    h("a", { class: "caminho", href }, h("span", { class: "vazio-icone" }, icone(ic, 26)), h("h2", {}, titulo), h("p", {}, texto), h("span", { class: "btn-link" }, chamada, " ", icone("seta", 14)));

  const form = formulario([
    { titulo: "Empresa" },
    { nome: "cnpj", rotulo: "CNPJ", obrigatorio: true, placeholder: "00.000.000/0000-00", inputmode: "numeric", maxlength: 18 },
    { nome: "razao_social", rotulo: "Razão social", obrigatorio: true, maxlength: 160 },
    { nome: "nome_fantasia", rotulo: "Nome fantasia", maxlength: 120 },
    { nome: "email_empresa", rotulo: "E-mail da empresa", tipo: "email", ajuda: "Se ficar em branco, usamos o seu e-mail." },
    { nome: "cidade", rotulo: "Cidade", obrigatorio: true, maxlength: 80 },
    { nome: "uf", rotulo: "UF", obrigatorio: true, placeholder: "MG", maxlength: 2 },
    { nome: "cnaes", rotulo: "CNAEs aceitos dos instaladores", obrigatorio: true, largura: 2, placeholder: "8020, 4321500", ajuda: "Separe por vírgula. 4 dígitos aceitam o grupo inteiro (ex.: 4321 = instalações elétricas). Só instaladores com um destes CNAEs podem pedir vínculo." },
    { nome: "prazo_reserva_dias", rotulo: "Prazo da reserva de estoque (dias)", tipo: "numero", min: 1, max: 30, padrao: 7, ajuda: "Quanto tempo o estoque fica separado depois que o instalador envia a proposta." },
    { titulo: "Seu acesso (dono da conta)" },
    { nome: "nome", rotulo: "Seu nome", obrigatorio: true, autocomplete: "name" },
    { nome: "telefone", rotulo: "Celular com DDD", tipo: "tel", autocomplete: "tel" },
    { nome: "email", rotulo: "Seu e-mail", tipo: "email", obrigatorio: true, autocomplete: "email" },
    { nome: "senha", rotulo: "Senha", tipo: "senha", obrigatorio: true, autocomplete: "new-password", ajuda: "Pelo menos 8 caracteres." },
  ]);
  const cnpjEl = form.entrada("cnpj");
  const buscar = h("button", { type: "button", class: "btn btn-pequeno" }, icone("busca", 14), "Buscar dados do CNPJ");
  buscar.addEventListener("click", () =>
    acao(buscar, async () => {
      const d = cnpjEl.value.replace(/\D/g, "");
      if (d.length !== 14) throw new Error("Digite os 14 números do CNPJ.");
      const r = await api.get(`/api/publico/cnpj/${d}`);
      const por = (n, v) => v && !form.entrada(n).value && (form.entrada(n).value = v);
      por("razao_social", r.razao_social);
      por("nome_fantasia", r.nome_fantasia);
      por("cidade", r.cidade);
      por("uf", r.uf);
      aviso(r.situacao && r.situacao !== "ATIVA" ? `Situação na Receita: ${r.situacao}.` : "Dados da Receita preenchidos. Confira antes de enviar.", r.situacao && r.situacao !== "ATIVA" ? "erro" : "ok");
    }),
  );
  cnpjEl.closest(".campo").append(buscar);
  buscar.style.justifySelf = "start";

  const resultado = h("div", { role: "status", "aria-live": "polite" });
  const enviar = h("button", { type: "submit", class: "btn btn-primario btn-grande" }, "Enviar cadastro");
  const formEl = h("form", { class: "cartao pilha", novalidate: true, "aria-labelledby": "titulo-cadastro" }, h("h2", { id: "titulo-cadastro" }, "Cadastro de fornecedor"), form.el, resultado, enviar);
  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    acao(enviar, async () => {
      const d = form.ler();
      const corpo = {
        ...d,
        cnpj: d.cnpj.replace(/\D/g, ""),
        uf: d.uf.toUpperCase(),
        cnaes: d.cnaes.split(/[,;\s]+/).map((c) => c.replace(/\D/g, "")).filter(Boolean),
      };
      if (!corpo.telefone) delete corpo.telefone;
      if (!corpo.nome_fantasia) delete corpo.nome_fantasia;
      if (!corpo.email_empresa) delete corpo.email_empresa;
      const r = await api.post("/cadastro", corpo);
      limpar(
        formEl,
        h("h2", {}, icone("check"), "Cadastro recebido"),
        h("p", {}, r.aviso ?? "A equipe Nexor confere os dados e libera o fornecedor para os instaladores."),
        h("p", { class: "suave" }, "Enquanto isso, você já pode entrar no painel para montar o catálogo e as tabelas de preço."),
        h("a", { class: "btn btn-primario", href: "/fornecedor/" }, "Abrir o painel do fornecedor"),
      );
      formEl.querySelector("h2").setAttribute("tabindex", "-1");
      formEl.querySelector("h2").focus();
    });
  });

  limpar(
    raiz,
    h(
      "header",
      { class: "entrada-topo" },
      h(
        "div",
        { class: "conteudo-largo" },
        h("div", { class: "linha-entre" }, h("div", { class: "login-marca" }, h("img", { src: "/comum/img/logo-mark.webp", alt: "", width: 32, height: 32 }), "Nexor Elo"), botaoTema("btn-icone")),
        h("h1", {}, "A rede que liga ", h("span", { class: "gradiente" }, "fornecedores e instaladores")),
        h("p", {}, "O instalador monta o orçamento com o estoque do fornecedor, o cliente final aprova e paga, e o dinheiro já cai separado para cada um. O fornecedor nunca vê o cliente do instalador."),
      ),
    ),
    h(
      "main",
      { id: "conteudo" },
      h(
        "nav",
        { class: "caminhos", "aria-label": "Como você quer entrar" },
        caminho("/fornecedor/", "predio", "Sou fornecedor", "Catálogo com estoque, tabelas de preço, vínculos e crédito dos instaladores, repasses do split e notas.", "Entrar no painel"),
        caminho("/app/", "ferramenta", "Sou instalador", "Propostas com o estoque reservado, comparador de fornecedores, kits, calculadora, OS e contratos.", "Abrir o app"),
        caminho("/nexor/", "escudo", "Operação Nexor", "Aprovar fornecedores, acompanhar métricas da rede, integrações e auditoria.", "Entrar na operação"),
      ),
      h(
        "section",
        { class: "secao-cadastro", id: "cadastro", "aria-label": "Cadastro de fornecedor" },
        h(
          "div",
          { class: "pilha" },
          h("h2", {}, "Seja um fornecedor da rede"),
          h("p", { class: "suave" }, "Distribuidoras de segurança eletrônica, material elétrico, solar, climatização, redes, hidráulica e automação."),
          h(
            "ul",
            {},
            h("li", {}, "Estoque reservado por prazo quando o instalador envia a proposta."),
            h("li", {}, "Pagamento do cliente dividido no ato: a parte dos produtos cai direto na sua conta."),
            h("li", {}, "Limite de crédito e bloqueio automático por título vencido."),
            h("li", {}, "Score de cada instalador: conversão, pontualidade e volume."),
            h("li", {}, "Privacidade por desenho: você vê o instalador, os itens e a cidade da obra, nunca o cliente final."),
          ),
          h("p", { class: "pequeno suave" }, "Já tem conta? ", h("a", { href: "/fornecedor/" }, "Entrar no painel"), "."),
        ),
        formEl,
      ),
    ),
    h("footer", { class: "rodape-entrada" }, "Nexor Consulting · Nexor Elo · dados protegidos pela LGPD"),
  );
  if (location.hash === "#cadastro") document.getElementById("cadastro")?.scrollIntoView();
}
