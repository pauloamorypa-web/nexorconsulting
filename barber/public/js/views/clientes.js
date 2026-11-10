/* Clientes: busca, filtros (clube, sumidos, aniversariantes), ficha com histórico, clube e gasto. */

import { get, post, put } from "../api.js";
import { acao, aviso, debounce, entrada, h, icone, janela, limpar, reais } from "../ui.js";
import { formulario, tabela, topo } from "../comum.js";
import { dataBR, fone, novoAgendamento, sit } from "../base.js";

export async function render(area, ctx) {
  let filtro = "";
  let busca = "";
  const lista = h("div");
  const filtros = h(
    "div",
    { class: "segmentado" },
    [
      ["", "Todos"],
      ["assinantes", "Clube"],
      ["sumidos", "Sumidos"],
      ["aniversario", "Aniversariantes do mês"],
    ].map(([k, t]) => h("button", { class: k === filtro ? "ativa" : "", onclick: (e) => ((filtro = k), filtros.querySelectorAll("button").forEach((b) => b.classList.toggle("ativa", b === e.currentTarget)), carregar()) }, t)),
  );
  const pode = ctx.pode("dono", "admin", "recepcao");
  limpar(
    area,
    h(
      "div",
      { class: "pagina" },
      topo("Clientes", "Quem entra pelo app aparece aqui sozinho. Sumidos: passaram do próprio ciclo de corte há mais de uma semana.", pode ? h("button", { class: "btn btn-primario", onclick: () => editar() }, icone("mais", 16), "Novo cliente") : null),
      h("div", { class: "filtros" }, entrada({ placeholder: "Buscar por nome, celular ou e-mail", oninput: debounce((e) => ((busca = e.target.value.trim()), carregar())) }), filtros),
      h("section", { class: "cartao" }, lista),
    ),
  );

  function editar(c = null) {
    const f = formulario(
      [
        { nome: "nome", rotulo: "Nome", obrigatorio: true, largura: 2 },
        { nome: "fone", rotulo: "Celular (WhatsApp)", tipo: "tel", placeholder: "34 99999-0000" },
        { nome: "email", rotulo: "E-mail", tipo: "email" },
        { nome: "nascimento", rotulo: "Nascimento", tipo: "data" },
        { nome: "aceita_mensagens", rotulo: "Recebe lembretes e avisos", tipo: "check", padrao: true },
        { nome: "observacoes", rotulo: "Observações (só a equipe vê)", tipo: "area", largura: 2 },
      ],
      c ? { ...c, fone: c.fone ? c.fone.slice(2) : "" } : {},
    );
    const ok = h("button", { class: "btn btn-primario" }, "Salvar");
    const j = janela({ titulo: c ? "Editar cliente" : "Novo cliente", conteudo: f.el, acoes: [ok] });
    ok.onclick = () => acao(ok, async () => (c ? await put(`/clientes/${c.id}`, f.ler()) : await post("/clientes", f.ler()), aviso("Cliente salvo."), j.fechar(), carregar()));
  }

  async function ficha(c) {
    const d = await get(`/clientes/${c.id}`);
    const k = d.cliente;
    janela({
      titulo: k.nome,
      largura: 720,
      conteudo: h(
        "div",
        { class: "pilha" },
        h(
          "div",
          { class: "dados" },
          [
            ["Celular", k.fone ? h("a", { href: `https://wa.me/${k.fone}`, target: "_blank", rel: "noopener" }, fone(k.fone)) : "—"],
            ["Última visita", k.ultima_visita ? dataBR(k.ultima_visita) : "—"],
            ["Volta a cada", k.ciclo_dias ? `${k.ciclo_dias} dias` : "ainda aprendendo"],
            ["Gasto total", d.gasto_total_centavos === null ? "—" : reais(d.gasto_total_centavos)],
            ["Entrou com", k.google ? "Google" : k.fone ? "Celular" : "Balcão"],
          ].map(([r, v]) => h("div", { class: "dado" }, h("small", {}, r), h("strong", {}, v))),
        ),
        d.assinatura ? h("div", { class: "aviso-cartao" }, icone("coroa", 16), h("span", {}, `Clube ${d.assinatura.plano.nome} · `, sit(d.assinatura.status), (d.assinatura.pago_ate ?? d.assinatura.ciclo_fim) ? ` · pago até ${dataBR(d.assinatura.pago_ate ?? d.assinatura.ciclo_fim)}` : "")) : null,
        k.observacoes ? h("p", { class: "citacao" }, k.observacoes) : null,
        h("h3", {}, "Histórico"),
        tabela(
          [
            { titulo: "Dia", valor: (a) => `${dataBR(a.dia)} ${a.hora}` },
            { titulo: "Serviço", valor: (a) => a.servico.nome },
            { titulo: "Barbeiro", valor: (a) => a.barbeiro.nome },
            { titulo: "Situação", valor: (a) => sit(a.status) },
            { titulo: "Valor", valor: (a) => (a.clube ? "clube" : reais(a.preco_centavos)), classe: "direita" },
          ],
          d.historico,
          { vazio: "Nenhum atendimento ainda." },
        ),
      ),
      acoes: [
        ...(pode ? [{ texto: "Editar", classe: "btn-fantasma", fn: (_, f) => (f(), editar(k)) }] : []),
        { texto: "Agendar", classe: "btn-primario", fn: (_, f) => (f(), novoAgendamento(ctx, { cliente: k }, carregar)) },
      ],
    });
  }

  // A rota devolve 300 por página; "Ver mais clientes" busca a próxima e soma na lista
  const POR_PAGINA = 300;
  let pagina = 1;
  let todos = [];
  const verMais = (e) => acao(e.currentTarget, () => carregar({ mais: true }));
  async function carregar({ mais = false } = {}) {
    pagina = mais === true ? pagina + 1 : 1;
    const q = new URLSearchParams({ ...(busca ? { busca } : {}), ...(filtro ? { filtro } : {}), pagina: String(pagina) });
    const pag = await get(`/clientes?${q}`);
    todos = mais === true ? [...todos, ...pag] : pag;
    const r = todos;
    limpar(
      lista,
      tabela(
        [
          { titulo: "Cliente", valor: (c) => h("div", { class: "celula-pessoa" }, h("strong", {}, c.nome), c.assinante ? h("span", { class: "chip chip-ok" }, "clube") : null, c.sumido ? h("span", { class: "chip chip-alerta" }, "sumido") : null) },
          { titulo: "Celular", valor: (c) => (c.fone ? fone(c.fone) : "—") },
          { titulo: "Última visita", valor: (c) => (c.ultima_visita ? `${dataBR(c.ultima_visita)} · há ${c.dias_desde} dias` : "—") },
          { titulo: "Ciclo", valor: (c) => (c.ciclo_dias ? `${c.ciclo_dias} dias` : "—") },
        ],
        r,
        { aoClicar: ficha, vazio: busca || filtro ? "Nenhum cliente com esse filtro." : "Nenhum cliente ainda. Divulgue o link do app." },
      ),
      pag.length === POR_PAGINA ? h("button", { class: "btn btn-fantasma btn-bloco", onclick: verMais }, `Ver mais clientes (mostrando ${r.length})`) : null,
    );
  }
  await carregar();
}
