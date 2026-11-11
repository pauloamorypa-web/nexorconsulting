/* Acompanhamento da ordem de serviço pelo cliente (/os/:token), sem login: linha do tempo do status,
   fotos, números de série com garantia e assinatura. Atualiza sozinho a cada 30 segundos. */
import { aplicarTemaSalvo, chamar, dataHora, diaBR, h, ic, iniciais, limpar, PASSOS_OS, STATUS_OS, vigiarConexao } from "/app/nucleo.js";

aplicarTemaSalvo();
vigiarConexao();
const raiz = document.getElementById("pagina");
const token = location.pathname.split("/")[2] ?? "";
const API = `/api/publico/os/${encodeURIComponent(token)}`;
const FRASE = { agendada: "Seu serviço está agendado.", a_caminho: "O técnico está a caminho.", em_execucao: "O serviço está sendo feito agora.", concluida: "Serviço concluído. Obrigado!", cancelada: "Esta ordem de serviço foi cancelada." };

async function carregar(silencioso = false) {
  let o;
  try {
    o = await chamar(API);
  } catch (e) {
    if (silencioso) return;
    limpar(raiz, h("div", { class: "tela-entrar" }, h("div", { class: "cartao" }, h("h1", {}, e.status === 404 ? "Ordem de serviço não encontrada" : "Não foi possível abrir"), h("p", { class: "suave" }, e.message))));
    return;
  }
  desenhar(o);
}

function desenhar(o) {
  document.title = `OS #${o.numero} · ${o.empresa}`;
  const atual = PASSOS_OS.indexOf(o.status);
  const tempo = h("ol", { class: "tempo" }, PASSOS_OS.map((s, i) => {
    const ev = o.historico.find((x) => x.status === s);
    const cls = o.status === "cancelada" ? (ev ? "feito" : "") : i < atual || (i === atual && s === "concluida") ? "feito" : i === atual ? "atual" : "";
    return h("li", { class: cls, "aria-current": i === atual ? "step" : null }, h("span", { class: "ponto" }, ev ? ic("check", 14) : null), h("div", {}, h("strong", {}, STATUS_OS[s][0]), h("span", { class: "pequeno suave" }, ev ? `${dataHora(ev.em)}${ev.nota && !/^Assinado por/.test(ev.nota) ? ` · ${ev.nota}` : ""}` : s === "agendada" && o.agendada_para ? dataHora(o.agendada_para) : "—")));
  }));
  const feitos = o.checklist.filter((c) => c.feito).length;
  const series = o.series.filter((s) => s.serie);
  limpar(
    raiz,
    h("header", { class: "hero" },
      h("div", { class: "empresa" }, h("span", { class: "avatar", "aria-hidden": "true" }, iniciais(o.empresa)), h("div", {}, h("strong", {}, o.empresa), h("small", { class: "suave", style: { display: "block" } }, `Ordem de serviço #${o.numero}`))),
      h("div", { class: "pilha", style: { gap: "4px" } }, h("small", {}, o.cliente ? `Olá, ${o.cliente}!` : "Olá!"), h("h1", {}, o.titulo)),
      h("div", { class: "selos" }, h("span", { class: "selo" }, ic(o.status === "concluida" ? "check" : "relogio", 14), STATUS_OS[o.status]?.[0] ?? o.status), o.tecnico ? h("span", { class: "selo" }, ic("conta", 14), `Técnico: ${o.tecnico}`) : null, o.agendada_para ? h("span", { class: "selo" }, ic("relogio", 14), dataHora(o.agendada_para)) : null)),
    h("section", { class: "secao", "aria-live": "polite" }, h("div", { class: `aviso-faixa ${o.status === "concluida" ? "ok" : o.status === "cancelada" ? "" : "info"}` }, ic(o.status === "concluida" ? "check" : "relogio"), h("strong", {}, FRASE[o.status] ?? ""))),
    h("section", { class: "secao", "aria-labelledby": "t-tempo" }, h("h2", { id: "t-tempo" }, "Andamento"), h("div", { class: "cartao" }, tempo)),
    o.checklist.length ? h("section", { class: "secao", "aria-labelledby": "t-check" }, h("h2", { id: "t-check" }, "O que está sendo feito"), h("div", { class: "cartao" }, h("div", { class: "linha pequeno" }, h("span", {}, `${feitos} de ${o.checklist.length} etapas`), h("strong", {}, `${Math.round((feitos / o.checklist.length) * 100)}%`)), h("div", { class: "progresso", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(o.checklist.length), "aria-valuenow": String(feitos), "aria-label": "Etapas concluídas" }, h("i", { style: { width: `${(feitos / o.checklist.length) * 100}%` } })), h("ul", { class: "lista-limpa" }, o.checklist.map((c) => h("li", { class: "linha-esq", style: { flexWrap: "nowrap", alignItems: "flex-start" } }, h("span", { class: c.feito ? "ok" : "fraco" }, ic(c.feito ? "check" : "relogio", 18)), h("span", { class: c.feito ? "" : "suave" }, c.item, h("span", { class: "so-leitor" }, c.feito ? " (feito)" : " (pendente)"))))))) : null,
    o.fotos.length ? h("section", { class: "secao", "aria-labelledby": "t-fotos" }, h("h2", { id: "t-fotos" }, "Fotos do serviço"), h("div", { class: "cartao" }, h("div", { class: "fotos" }, o.fotos.map((f) => h("figure", {}, h("img", { src: `${API}/fotos/${encodeURIComponent(f.id)}`, alt: f.legenda || "Foto do serviço", loading: "lazy" }), f.legenda ? h("figcaption", {}, f.legenda) : null))))) : null,
    series.length ? h("section", { class: "secao", "aria-labelledby": "t-gar" }, h("h2", { id: "t-gar" }, "Equipamentos e garantia"), h("div", { class: "cartao" }, series.map((s) => h("div", { class: "item" }, h("div", { class: "miniatura" }, ic("escudo")), h("div", { class: "meio" }, h("strong", { class: "quebra" }, s.produto), h("div", { class: "pequeno suave quebra" }, `Nº de série ${s.serie}`)), s.garantia_ate ? h("div", { class: "direita pequeno" }, h("span", { class: "fraco" }, "Garantia até"), h("div", {}, h("strong", { class: "ok" }, diaBR(s.garantia_ate)))) : null)), h("small", { class: "fraco" }, "Guarde esta página: ela vale como registro da garantia de cada equipamento."))) : null,
    h("section", { class: "secao", "aria-labelledby": "t-ass" }, h("h2", { id: "t-ass" }, "Assinatura"), h("div", { class: "cartao" }, o.assinado ? h("div", { class: "linha-esq" }, h("span", { class: "ok" }, ic("caneta")), h("span", {}, `Assinado por ${o.assinado_por ?? "cliente"}${o.assinado_em ? ` em ${dataHora(o.assinado_em)}` : ""}.`)) : h("span", { class: "suave" }, "A assinatura é colhida pelo técnico ao final do serviço."))),
    h("footer", { class: "rodape-publico" }, h("span", {}, `Acompanhamento de ${o.empresa}`), h("span", {}, "Nexor Elo")),
  );
}

carregar();
setInterval(() => document.visibilityState === "visible" && carregar(true), 30000);
