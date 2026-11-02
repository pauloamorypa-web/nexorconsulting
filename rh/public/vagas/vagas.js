/* Página pública de vagas: lista as vagas abertas da empresa e recebe candidaturas (com consentimento LGPD). */

import { h, limpar, acao, aviso, icone } from "/js/ui.js";

const raiz = document.getElementById("vagas");
const empresa = new URLSearchParams(location.search).get("e");

const lerBase64 = (arquivo) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(",")[1]); r.onerror = reject; r.readAsDataURL(arquivo); });

async function enviar(vaga, form, botao) {
  await acao(botao, async () => {
    const d = Object.fromEntries(new FormData(form));
    const arquivo = form.querySelector("input[type=file]").files[0];
    if (arquivo && arquivo.size > 5 * 1024 * 1024) throw new Error("O currículo pode ter até 5 MB.");
    const corpo = { nome: d.nome, email: d.email, telefone: d.telefone, cidade: d.cidade || undefined, linkedin: d.linkedin || undefined, mensagem: d.mensagem || undefined, consentimento: form.querySelector("[name=consentimento]").checked };
    if (arquivo) corpo.curriculo = { nome: arquivo.name, tipo: arquivo.type, base64: await lerBase64(arquivo) };
    const r = await fetch(`/api/publico/vagas/${empresa}/${vaga.id}`, { method: "POST", headers: { "Content-Type": "application/json", "x-nexor": "1" }, body: JSON.stringify(corpo) });
    const x = await r.json();
    if (!r.ok) throw new Error(x.erro);
    limpar(form, h("p", { class: "chip chip-ok" }, "✅ Candidatura enviada! Se o seu perfil combinar, entraremos em contato."));
  });
}

async function iniciar() {
  if (!empresa) return limpar(raiz, h("div", { class: "vazio" }, h("h3", {}, "Link incompleto"), h("p", {}, "Peça o link da página de vagas para a empresa.")));
  const r = await fetch(`/api/publico/vagas/${encodeURIComponent(empresa)}`);
  const d = await r.json();
  if (!r.ok) return limpar(raiz, h("div", { class: "vazio" }, h("h3", {}, d.erro)));
  document.title = `Trabalhe conosco · ${d.empresa}`;
  const alvo = location.hash.slice(1);
  limpar(
    raiz,
    h("header", { class: "vagas-cabeca" }, h("small", { class: "suave" }, d.empresa), h("h1", {}, "Trabalhe conosco"), h("p", { class: "suave" }, d.vagas.length ? `${d.vagas.length} vaga(s) aberta(s).` : "No momento não há vagas abertas. Volte em breve!")),
    d.vagas.map((v) => {
      const botao = h("button", { class: "btn btn-primario largo", type: "submit" }, "Enviar candidatura");
      const form = h(
        "form",
        { hidden: alvo !== v.id, onsubmit: (e) => (e.preventDefault(), enviar(v, form, botao)) },
        h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Nome completo *"), h("input", { class: "entrada", name: "nome", required: true, autocomplete: "name" })),
        h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "E-mail *"), h("input", { class: "entrada", name: "email", type: "email", required: true, autocomplete: "email" })),
        h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Celular / WhatsApp *"), h("input", { class: "entrada", name: "telefone", type: "tel", required: true, autocomplete: "tel" })),
        h("label", { class: "campo" }, h("span", { class: "campo-rotulo" }, "Cidade"), h("input", { class: "entrada", name: "cidade" })),
        h("label", { class: "campo largo" }, h("span", { class: "campo-rotulo" }, "LinkedIn"), h("input", { class: "entrada", name: "linkedin", type: "url" })),
        h("label", { class: "campo largo" }, h("span", { class: "campo-rotulo" }, "Currículo (PDF ou Word, até 5 MB)"), h("input", { class: "entrada", type: "file", accept: ".pdf,.doc,.docx" })),
        h("label", { class: "campo largo" }, h("span", { class: "campo-rotulo" }, "Conte um pouco sobre você"), h("textarea", { class: "entrada", name: "mensagem", rows: 3 })),
        h("label", { class: "linha-check largo" }, h("input", { type: "checkbox", name: "consentimento", required: true }), h("span", {}, `Autorizo ${d.empresa} a usar meus dados somente para este processo seletivo (LGPD).`)),
        botao,
      );
      return h(
        "article",
        { class: "cartao vaga", id: v.id },
        h("h2", {}, v.titulo),
        h("div", { class: "tags" }, v.modalidade ? h("span", { class: "chip" }, v.modalidade) : null, v.local ? h("span", { class: "chip" }, icone("local", 12), ` ${v.local}`) : null, v.salario ? h("span", { class: "chip chip-ok" }, v.salario) : null),
        v.descricao ? h("p", { class: "texto-longo" }, v.descricao) : null,
        v.requisitos ? h("div", {}, h("strong", {}, "Requisitos"), h("p", { class: "texto-longo" }, v.requisitos)) : null,
        form.hidden ? h("button", { class: "btn btn-primario", onclick: (e) => ((form.hidden = false), e.currentTarget.remove()) }, "Quero me candidatar") : null,
        form,
      );
    }),
    h("p", { class: "suave pequeno centro" }, "Página de vagas por Nexor RH"),
  );
  if (alvo) document.getElementById(alvo)?.scrollIntoView();
}
iniciar().catch((e) => aviso(e.message, "erro"));
