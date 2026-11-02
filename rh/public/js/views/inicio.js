/* Início: quem está trabalhando agora, pendências e alertas do RH (férias a vencer, experiência, documentos). */

import { get } from "../api.js";
import { avatar, h, icone, limpar, numero, reais } from "../ui.js";
import { dataBR, indicador, situacao, topo } from "../comum.js";

let raizAtual;
let ctxAtual;

export async function render(raiz, ctx) {
  raizAtual = raiz;
  ctxAtual = ctx;
  await desenhar();
  const t = setInterval(() => raizAtual?.isConnected && desenhar(), 60_000);
  return () => clearInterval(t);
}

export function aoEvento(tipo) {
  if (tipo === "marcacao" && raizAtual?.isConnected) desenhar();
}

const passo = (feito, titulo, texto, rota, botao) =>
  h("li", { class: `passo ${feito ? "feito" : ""}` }, h("span", { class: "passo-marca" }, feito ? icone("check", 14) : null), h("div", {}, h("strong", {}, titulo), h("p", {}, texto)), feito ? null : h("a", { class: "btn btn-pequeno", href: `#/${rota}` }, botao));

function alerta(ic, titulo, itens, vazioTexto, rota) {
  return h(
    "section",
    { class: "cartao" },
    h("div", { class: "cartao-topo" }, h("h2", {}, icone(ic, 18), " ", titulo), rota ? h("a", { class: "btn-link", href: `#/${rota}` }, "Ver tudo") : null),
    itens.length ? h("ul", { class: "lista-itens" }, itens) : h("p", { class: "suave" }, vazioTexto),
  );
}

async function desenhar() {
  const [p, hoje, eu, locais, esoc] = await Promise.all([get("/painel"), get("/ponto/hoje"), ctxAtual.recarregarEu(), get("/estabelecimentos"), ctxAtual.pode("admin", "rh") ? get("/esocial/resumo").catch(() => null) : null]);
  const c = eu.contagem;
  const r = hoje.resumo;
  const pendentes = c.ajustes + c.ferias + c.afastamentos;
  const presentes = hoje.lista.filter((x) => ["trabalhando", "intervalo"].includes(x.situacao));
  const atrasados = hoje.lista.filter((x) => x.situacao === "atrasado");
  const checklist = [
    passo(locais.some((l) => l.lat !== null), "Marque o local de trabalho no mapa", "Ativa a cerca de GPS: o ponto só vale perto da empresa.", "config/locais", "Configurar"),
    passo(p.ativos > 0, "Cadastre os colaboradores", "Admissão completa já gera o evento S-2200 do eSocial.", "colaboradores", "Admitir"),
    passo(p.ativos > 0 && p.sem_app < p.ativos, "Convide o time para o app de ponto", "Cada um recebe um código de 6 números para ativar no celular.", "colaboradores", "Convidar"),
    passo(locais.some((l) => l.quiosque_ativo), "Coloque o quiosque de QR Code (opcional)", "Um tablet na entrada mostra o QR que muda a cada 30 segundos.", "config/locais", "Gerar link"),
    esoc ? passo(Boolean(esoc.certificado), "Envie o certificado digital A1", "Para assinar e transmitir os eventos do eSocial.", "config/esocial", "Enviar") : null,
  ].filter(Boolean);
  const faltam = checklist.filter((x) => !x.classList.contains("feito")).length;

  limpar(
    raizAtual,
    h(
      "div",
      { class: "pagina" },
      topo(`Olá, ${eu.usuario.nome.split(" ")[0]}!`, `${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}${hoje.feriado ? " · feriado" : ""}`, h("a", { class: "btn btn-primario", href: "#/colaboradores/novo" }, icone("mais", 16), "Admitir colaborador")),
      faltam ? h("section", { class: "cartao guia-topo" }, h("div", { class: "cartao-topo" }, h("h2", {}, "Primeiros passos"), h("span", { class: "chip" }, `${checklist.length - faltam} de ${checklist.length}`)), h("ol", { class: "passos" }, checklist)) : null,
      h(
        "div",
        { class: "indicadores" },
        indicador("pessoa", "Colaboradores ativos", numero(p.ativos), `${p.por_status.ferias} em férias · ${p.por_status.afastado} afastados`),
        indicador("relogio", "Trabalhando agora", numero(r.trabalhando + r.intervalo), `${r.intervalo} em intervalo · ${r.saiu} já saíram`, "var(--verde)"),
        indicador("alerta", "Atrasados hoje", numero(r.atrasados), r.aguardando ? `${r.aguardando} ainda no horário` : "", r.atrasados ? "var(--vermelho)" : null),
        indicador("sino", "Pedidos para analisar", numero(pendentes), `${c.ajustes} de ponto · ${c.ferias} de férias · ${c.afastamentos} atestados`, pendentes ? "var(--amarelo)" : null),
        ctxAtual.pode("admin", "rh") ? indicador("dinheiro", "Folha salarial (base)", reais(p.folha_salarial), `Turnover no ano: ${String(p.turnover_ano).replace(".", ",")}%`) : null,
      ),
      h(
        "div",
        { class: "grade-painel" },
        h(
          "section",
          { class: "cartao" },
          h("div", { class: "cartao-topo" }, h("h2", {}, "Agora"), h("a", { class: "btn-link", href: "#/ponto" }, "Ponto do dia")),
          atrasados.length || presentes.length
            ? h(
                "ul",
                { class: "lista-itens" },
                [...atrasados, ...presentes].slice(0, 12).map((x) =>
                  h(
                    "li",
                    { class: "item-linha" },
                    avatar(x.nome, x.id, 32),
                    h("div", { class: "item-texto" }, h("strong", {}, x.nome), h("small", { class: "suave" }, x.marcacoes.map((m) => m.hora).join(" · ") || (x.previsto ? `Entrada prevista ${x.previsto.entrada}` : ""))),
                    situacao(x.situacao),
                  ),
                ),
              )
            : h("p", { class: "suave" }, "Ninguém registrou o ponto ainda hoje."),
        ),
        h(
          "section",
          { class: "cartao" },
          h("div", { class: "cartao-topo" }, h("h2", {}, "Pessoas por departamento")),
          p.por_departamento.length
            ? h("div", { class: "barras-h" }, p.por_departamento.map((d) => h("div", { class: "barra-h" }, h("span", {}, d.nome), h("div", { class: "barra-h-trilho" }, h("i", { style: { width: `${(d.n / Math.max(...p.por_departamento.map((x) => x.n))) * 100}%` } })), h("strong", {}, d.n))))
            : h("p", { class: "suave" }, "Sem colaboradores ainda."),
        ),
      ),
      h(
        "div",
        { class: "grade-painel tres" },
        alerta(
          "mala",
          "Férias a vencer",
          p.ferias_alerta.slice(0, 6).map((f) => h("li", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, f.nome), h("small", { class: "suave" }, `${f.saldo} dias · conceder até ${dataBR(f.limite)}`)), h("span", { class: `chip ${f.dias < 30 ? "chip-perigo" : "chip-alerta"}` }, f.dias < 0 ? "vencida (em dobro)" : `${f.dias} dias`))),
          "Nenhuma férias perto do limite. 👏",
          "ferias",
        ),
        alerta(
          "nota",
          "Contratos de experiência",
          p.experiencia.map((e) => h("li", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, e.nome), h("small", { class: "suave" }, `Vence em ${dataBR(e.vence)}`)), h("a", { class: "btn btn-pequeno", href: `#/colaboradores/${e.id}` }, "Decidir"))),
          "Nenhum vencimento nos próximos 10 dias.",
        ),
        alerta(
          "estrela",
          "Aniversários do mês",
          [...p.aniversariantes.map((a) => h("li", { class: "item-linha" }, h("span", {}, a.hoje ? "🎉" : "🎂"), h("div", { class: "item-texto" }, h("strong", {}, a.nome), h("small", { class: "suave" }, `dia ${a.dia}`)))), ...p.tempo_casa.map((t) => h("li", { class: "item-linha" }, h("span", {}, "🏅"), h("div", { class: "item-texto" }, h("strong", {}, t.nome), h("small", { class: "suave" }, `${t.anos} ano(s) de casa hoje`))))],
          "Sem aniversariantes este mês.",
        ),
      ),
      p.documentos_vencendo.length ? alerta("alerta", "Documentos vencendo (ASO, CNH, certificados)", p.documentos_vencendo.map((d) => h("li", { class: "item-linha" }, h("div", { class: "item-texto" }, h("strong", {}, `${d.nome} · ${d.colaborador_nome}`), h("small", { class: "suave" }, `Validade ${dataBR(d.validade)}`)), h("a", { class: "btn btn-pequeno", href: `#/colaboradores/${d.colaborador_id}` }, "Abrir"))), "") : null,
    ),
  );
}
