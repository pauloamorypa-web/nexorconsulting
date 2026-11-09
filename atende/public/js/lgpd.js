/* LGPD no painel: caixa de aceite do cadastro, tela de aceite de nova versão dos termos e os botões
   "Exportar dados" e "Excluir dados" da ficha de uma pessoa (só administrador). */

import { post } from "./api.js";
import { acao, aviso, confirmar, h, icone, janela } from "./ui.js";

export const URL_TERMOS = "https://nexorconsultingit.com.br/privacidade.html";

/** Caixa "li e aceito" (desmarcada por padrão) */
export function caixaAceite(url = URL_TERMOS) {
  const caixa = h("input", { type: "checkbox", required: true });
  const el = h("label", { class: "linha-check aceite-termos" }, caixa, h("span", {}, "Li e aceito os ", h("a", { href: url, target: "_blank", rel: "noopener" }, "Termos de Uso e a Política de Privacidade"), "."));
  return { el, marcado: () => caixa.checked };
}

/** Tela que bloqueia o painel até o aceite da versão vigente */
export function telaTermos(termos, aoAceitar) {
  const aceite = caixaAceite(termos.url || URL_TERMOS);
  const botao = h("button", { class: "btn btn-primario btn-grande", type: "submit" }, "Aceitar e continuar");
  return h(
    "div",
    { class: "login" },
    h(
      "section",
      { class: "login-painel" },
      h(
        "form",
        {
          class: "login-form",
          onsubmit: (e) => {
            e.preventDefault();
            if (!aceite.marcado()) return aviso("Marque que leu e aceita os termos.", "erro");
            acao(botao, async () => {
              await post("/termos/aceite", { aceito: true, versao: termos.versao });
              aoAceitar();
            });
          },
        },
        h("img", { src: "/img/logo-mark.webp", alt: "", width: 48, height: 48, class: "login-logo" }),
        h("h1", {}, termos.versao_anterior ? "Os termos mudaram" : "Termos de Uso e Privacidade"),
        h("p", { class: "suave" }, `Para continuar, leia e aceite a versão ${termos.versao} dos Termos de Uso e da Política de Privacidade. Registramos a data, a hora e o endereço IP do aceite.`),
        h("p", {}, h("a", { href: termos.url || URL_TERMOS, target: "_blank", rel: "noopener" }, icone("enviar", 14), " Abrir os termos")),
        aceite.el,
        botao,
        h("button", { type: "button", class: "btn-link", onclick: async () => (await post("/sair"), location.reload()) }, "Sair"),
      ),
    ),
  );
}

async function baixar(tipo, id) {
  const r = await fetch(`/api/lgpd/titulares/${tipo}/${id}/exportar`, { method: "POST", credentials: "same-origin", headers: { "x-nexor": "1" } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro ?? "Não foi possível exportar.");
  const nome = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? `dados-${tipo}.json`;
  const a = h("a", { href: URL.createObjectURL(await r.blob()), download: nome });
  document.body.append(a);
  a.click();
  a.remove();
}

/** Resumo do que a exclusão fez (apagado, anonimizado, bloqueado até) */
function resumo(r) {
  const itens = [
    ...Object.entries(r.apagados ?? {}).map(([k, n]) => `${k.replace(/_/g, " ")}: ${n} apagado(s)`),
    ...Object.entries(r.anonimizados ?? {}).map(([k, n]) => `${k.replace(/_/g, " ")}: ${n} anonimizado(s)`),
    ...(r.bloqueados ?? []).map((b) => `${b.parte.replace(/_/g, " ")}: ${b.quantidade} bloqueado(s) até ${b.guardar_ate.split("-").reverse().join("/")} (obrigação legal)`),
  ];
  janela({ titulo: "Pedido de exclusão registrado", conteudo: h("div", {}, h("ul", {}, itens.length ? itens.map((t) => h("li", {}, t)) : h("li", {}, "Nada a tratar.")), h("p", { class: "suave pequeno" }, "O pedido ficou na auditoria com data, hora e quem pediu.")), acoes: [{ texto: "Fechar", classe: "btn-primario", fn: (_, f) => f() }] });
}

/** Botões da ficha. aoExcluir é chamado depois da exclusão (para fechar a ficha ou recarregar a lista). */
export function botoesTitular(tipo, id, nome, { aoExcluir, aviso: textoAviso } = {}) {
  const exportar = h("button", { class: "btn btn-fantasma btn-pequeno", type: "button", title: "Baixa um arquivo JSON com todos os dados desta pessoa (LGPD art. 18)" }, icone("download", 16), "Exportar dados");
  exportar.onclick = () => acao(exportar, async () => (await baixar(tipo, id), aviso("Arquivo gerado. O pedido ficou registrado na auditoria.")));
  const excluir = h("button", { class: "btn btn-perigo-fantasma btn-pequeno", type: "button", title: "Apaga ou anonimiza os dados; o que a lei manda guardar fica bloqueado até o fim do prazo" }, icone("lixo", 16), "Excluir dados");
  excluir.onclick = async () => {
    const ok = await confirmar(textoAviso ?? `Excluir os dados de ${nome}? O que não tem obrigação legal de guarda será apagado ou anonimizado e não pode ser desfeito. Registros exigidos por lei ficam bloqueados até o fim do prazo.`, { titulo: "Excluir dados pessoais (LGPD)", botao: "Excluir dados", perigo: true });
    if (!ok) return;
    acao(excluir, async () => {
      const r = await post(`/lgpd/titulares/${tipo}/${id}/excluir`, { confirmar: true });
      resumo(r);
      aoExcluir?.(r);
    });
  };
  return h("div", { class: "acoes-lgpd" }, exportar, excluir);
}
