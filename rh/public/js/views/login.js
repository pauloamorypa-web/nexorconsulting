/* Login e criação da conta da empresa. */

import { post } from "../api.js";
import { acao, h, icone, limpar } from "../ui.js";
import { formulario } from "../comum.js";

const DESTAQUES = [
  ["digital", "Ponto com biometria do celular ou QR Code", "O colaborador registra em 2 toques. Digital ou rosto conferidos pelo próprio aparelho, com cerca de GPS."],
  ["escudo", "REP-P conforme a Portaria 671", "NSR, hash encadeado, comprovante, AFD e AEJ prontos para a fiscalização."],
  ["dinheiro", "Folha, férias, 13º e rescisão", "INSS, IRRF (com a nova isenção de 2026), FGTS, DSR, adicional noturno e holerite no app."],
  ["governo", "eSocial integrado", "Admissão, alterações, afastamentos, desligamento e folha viram eventos assinados com seu certificado A1."],
];

export function renderLogin(raiz, estado, aoEntrar) {
  let modo = estado.primeiroAcesso ? "cadastro" : "entrar";
  const desenhar = () => {
    const f =
      modo === "entrar"
        ? formulario([
            { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largura: 2 },
            { nome: "senha", rotulo: "Senha", tipo: "senha", obrigatorio: true, largura: 2 },
          ])
        : formulario([
            { nome: "razao_social", rotulo: "Razão social", obrigatorio: true, largura: 2 },
            { nome: "nome_fantasia", rotulo: "Nome fantasia", largura: 2 },
            { nome: "cnpj", rotulo: "CNPJ", obrigatorio: true, largura: 2, placeholder: "00.000.000/0000-00" },
            { nome: "nome", rotulo: "Seu nome", obrigatorio: true, largura: 2 },
            { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largura: 2 },
            { nome: "senha", rotulo: "Senha", tipo: "senha", obrigatorio: true, largura: 2, ajuda: "Mínimo de 8 caracteres." },
          ]);
    const botao = h("button", { class: "btn btn-primario btn-grande", type: "submit" }, modo === "entrar" ? "Entrar" : "Criar conta da empresa");
    const form = h(
      "form",
      {
        class: "login-form",
        onsubmit: (e) => {
          e.preventDefault();
          acao(botao, async () => {
            await post(modo === "entrar" ? "/entrar" : "/cadastro", f.ler());
            aoEntrar();
          });
        },
      },
      h("img", { src: "/img/logo-mark.webp", alt: "", width: 48, height: 48, class: "login-logo" }),
      h("h1", {}, modo === "entrar" ? "Entrar no Nexor RH" : "Vamos cadastrar sua empresa"),
      h("p", { class: "suave" }, modo === "entrar" ? "Acesso do RH, administradores e gestores." : "Depois você convida o RH e os gestores."),
      f.el,
      botao,
      !estado.primeiroAcesso && estado.cadastroAberto ? h("button", { type: "button", class: "btn-link", onclick: () => ((modo = modo === "entrar" ? "cadastro" : "entrar"), desenhar()) }, modo === "entrar" ? "Cadastrar nova empresa" : "Já tenho conta") : null,
      h("p", { class: "suave pequeno centro" }, "É colaborador? ", h("a", { href: "/app/" }, "Abra o app de ponto")),
    );
    limpar(
      raiz,
      h(
        "div",
        { class: "login" },
        h(
          "section",
          { class: "login-vitrine" },
          h("div", { class: "login-marca" }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 36, height: 36 }), h("span", {}, h("strong", {}, "Nexor"), " RH")),
          h("h2", {}, "Todo o RH da sua empresa ", h("span", { class: "gradiente" }, "num só lugar, com o ponto no bolso do time.")),
          h("ul", { class: "login-destaques" }, DESTAQUES.map(([ic, t, d]) => h("li", {}, h("span", { class: "login-ic" }, icone(ic, 20)), h("div", {}, h("strong", {}, t), h("p", {}, d))))),
          h("small", { class: "login-rodape" }, "Nexor Consulting · nexorconsultingit.com.br"),
        ),
        h("section", { class: "login-painel" }, form),
      ),
    );
    form.querySelector("input")?.focus();
  };
  desenhar();
}
