/* Login, primeiro acesso e criação de conta. */

import { post } from "../api.js";
import { acao, campo, entrada, h, icone, limpar } from "../ui.js";

const DESTAQUES = [
  ["raio", "Responde em segundos, 24 horas por dia", "IA que entende texto, fotos e PDFs, consulta seu catálogo e agenda horários."],
  ["cerebro", "Aprende com a sua equipe", "Corrija uma resposta uma vez e a IA passa a responder do seu jeito."],
  ["grafico", "Mostra quem está pronto para comprar", "Sentimento, intenção e temperatura de cada lead, em tempo real."],
  ["escudo", "API oficial da Meta", "Sem risco de banimento: WhatsApp Cloud API com modelos aprovados."],
];

export function renderLogin(raiz, estado, aoEntrar) {
  let modo = estado.primeiroAcesso ? "cadastro" : "entrar";

  const desenhar = () => {
    const nome = entrada({ autocomplete: "name", required: true, placeholder: "Seu nome" });
    const empresa = entrada({ required: true, placeholder: "Nome da empresa" });
    const segmento = entrada({ placeholder: "Ex.: clínica odontológica, loja de roupas" });
    const email = entrada({ type: "email", autocomplete: "email", required: true, placeholder: "voce@empresa.com.br" });
    const senha = entrada({ type: "password", autocomplete: modo === "entrar" ? "current-password" : "new-password", required: true, minlength: modo === "entrar" ? 1 : 8, placeholder: modo === "entrar" ? "Sua senha" : "Mínimo de 8 caracteres" });
    const botao = h("button", { class: "btn btn-primario btn-grande", type: "submit" }, modo === "entrar" ? "Entrar" : "Criar minha conta");

    const form = h(
      "form",
      {
        class: "login-form",
        onsubmit: (e) => {
          e.preventDefault();
          acao(botao, async () => {
            if (modo === "entrar") await post("/entrar", { email: email.value, senha: senha.value });
            else await post("/cadastro", { empresa: empresa.value, segmento: segmento.value || undefined, nome: nome.value, email: email.value, senha: senha.value });
            aoEntrar();
          });
        },
      },
      h("img", { src: "/img/logo-mark.webp", alt: "", width: 48, height: 48, class: "login-logo" }),
      h("h1", {}, modo === "entrar" ? "Bem-vindo de volta" : estado.primeiroAcesso ? "Vamos configurar seu atendimento" : "Crie sua conta"),
      h("p", { class: "suave" }, modo === "entrar" ? "Entre para acompanhar as conversas." : "Em poucos minutos sua IA estará atendendo no WhatsApp."),
      modo === "cadastro" ? [campo("Empresa", empresa), campo("Ramo de atuação", segmento, "Ajuda a IA a entender o seu negócio."), campo("Seu nome", nome)] : null,
      campo("E-mail", email),
      campo("Senha", senha),
      botao,
      !estado.primeiroAcesso && estado.cadastroAberto
        ? h(
            "button",
            {
              type: "button",
              class: "btn-link",
              onclick: () => {
                modo = modo === "entrar" ? "cadastro" : "entrar";
                desenhar();
              },
            },
            modo === "entrar" ? "Ainda não tem conta? Criar conta" : "Já tenho conta",
          )
        : null,
    );

    limpar(
      raiz,
      h(
        "div",
        { class: "login" },
        h(
          "section",
          { class: "login-vitrine" },
          h("div", { class: "login-marca" }, h("img", { src: "/img/logo-mark.webp", alt: "", width: 36, height: 36 }), h("span", {}, h("strong", {}, "Nexor"), " Atende IA")),
          h("h2", {}, "O atendente que nunca dorme e ", h("span", { class: "gradiente" }, "fica mais inteligente a cada conversa.")),
          h(
            "ul",
            { class: "login-destaques" },
            DESTAQUES.map(([ic, t, d]) => h("li", {}, h("span", { class: "login-ic" }, icone(ic, 20)), h("div", {}, h("strong", {}, t), h("p", {}, d)))),
          ),
          h("small", { class: "login-rodape" }, "Nexor Consulting · nexorconsultingit.com.br"),
        ),
        h("section", { class: "login-painel" }, form),
      ),
    );
    form.querySelector("input")?.focus();
  };
  desenhar();
}
