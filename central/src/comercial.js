/* Rotas comerciais da Nexor Central:
   - catálogo (planos, teste grátis, fundadores, comissões, sob demanda)
   - teste grátis de 30 dias por cliente e contratação de um plano (com fundador e fatura de implantação)
   - vendedores e parceiros, comissões geradas quando a fatura é paga, indicações
   - portal do parceiro (/parceiro/), que entra por um link com token de uso contínuo, trocável pela Nexor */

import { ANUAL, COMISSOES, FUNDADORES, PLANOS, PROJETOS, REGRAS_COMISSAO, SOB_DEMANDA, TESTE, TIPOS_PARCEIRO, comDesconto, mensalidadeDe, planoPorId, plural } from "./planos.js";
import { dataBR, somarDias, somarMeses } from "./regras.js";
import { gerarToken, sha256 } from "./seguranca.js";
import { mensalidadeEfetiva, valorReferencia } from "./conversao.js";

export function registrarComercial({ rota, repo, cfg, V, falha, hoje, auditar, rotina, limitar, PRODUTOS, papeis, conversao = { registrar: () => false } }) {
  const { FIN, TODOS, DONO } = papeis;
  const nomeCliente = (c) => c?.nome_fantasia || c?.razao_social || "";
  const exigirCliente = (id) => repo.obter("clientes", id) ?? falha(404, "Cliente não encontrado.");
  const exigirParceiro = (id) => repo.obter("parceiros", id) ?? falha(404, "Vendedor ou parceiro não encontrado.");
  const vagasUsadas = (produto) => repo.um("SELECT COUNT(*) n FROM clientes WHERE fundador = 1 AND produto = ?", produto).n;
  const percentuais = (p) => ({ ...COMISSOES[p.tipo], ...(p.percentuais ?? {}) });

  /* ---------- Catálogo ---------- */
  rota("GET", "/api/catalogo", TODOS, () => ({
    produtos: PRODUTOS,
    planos: PLANOS,
    projetos: PROJETOS,
    sob_demanda: SOB_DEMANDA,
    anual: ANUAL,
    teste: TESTE,
    fundadores: { ...FUNDADORES, usadas: Object.fromEntries(FUNDADORES.produtos.map((p) => [p, vagasUsadas(p)])) },
    comissoes: COMISSOES,
    regras_comissao: REGRAS_COMISSAO,
  }));

  /* ---------- Teste grátis ---------- */
  // Inicia (ou prorroga) o teste grátis do cliente para um produto. Prorrogação: no máximo +30 dias por vez.
  rota("POST", "/api/clientes/:id/teste", FIN, async (ctx) => {
    const c = exigirCliente(ctx.params.id);
    const b = await ctx.corpo();
    const produto = b.produto ?? c.produto;
    if (!TESTE.produtos[produto]) falha(400, "Escolha o produto do teste.");
    if (c.fase === "contrato" && c.contratado_em) falha(409, "Este cliente já tem plano contratado.");
    const dias = V.inteiro(b.dias, 1, 30, "dias de teste") ?? TESTE.dias;
    const base = c.fase === "teste" && c.teste_ate && c.teste_ate >= hoje() ? c.teste_ate : hoje();
    const teste_ate = somarDias(base, c.fase === "teste" ? dias : dias - 1);
    auditar(ctx, c.fase === "teste" ? "teste_prorrogado" : "teste_iniciado", c.id, { produto, ate: teste_ate });
    const novo = repo.atualizar("clientes", c.id, { fase: "teste", produto, teste_ate, bloqueio_manual: null });
    // Conversão offline: só a ativação conta (prorrogação não); a fila também não repete o mesmo cliente
    if (c.fase !== "teste") conversao.registrar(novo, "teste_ativado", { mensal_centavos: valorReferencia(produto) });
    return novo;
  });

  /* ---------- Contratação ---------- */
  rota("POST", "/api/clientes/:id/contratar", FIN, async (ctx) => {
    const c = exigirCliente(ctx.params.id);
    const b = await ctx.corpo();
    const plano = planoPorId(b.plano_id) ?? falha(400, "Escolha o plano.");
    const quantidade = plano.por_unidade ? V.inteiro(b.quantidade, 1, 100000, `quantidade de ${plural(plano.unidade)}`) ?? falha(400, `Informe a quantidade de ${plural(plano.unidade)}.`) : null;
    const mensal = V.inteiro(b.valor_centavos, 0, 100_000_000, "mensalidade") ?? mensalidadeDe(plano, quantidade);
    const fundador = Boolean(b.fundador);
    if (fundador) {
      if (!FUNDADORES.produtos.includes(plano.produto)) falha(400, `O programa de fundadores vale para: ${FUNDADORES.produtos.map((p) => PRODUTOS[p]).join(", ")}.`);
      if (!c.fundador && vagasUsadas(plano.produto) >= FUNDADORES.vagas) falha(409, `As ${FUNDADORES.vagas} vagas de fundador do ${PRODUTOS[plano.produto]} já foram preenchidas.`);
    }
    const desconto = fundador ? FUNDADORES.desconto_mensal : V.inteiro(b.desconto_pct, 0, 50, "desconto") ?? 0;
    const mesesDesc = fundador ? FUNDADORES.meses : V.inteiro(b.desconto_meses, 1, 24, "meses de desconto") ?? 0;
    const competencia = hoje().slice(0, 7);
    const implantacaoCheia = V.inteiro(b.implantacao_centavos, 0, 100_000_000, "implantação") ?? plano.implantacao;
    const implantacao = comDesconto(implantacaoCheia, fundador ? FUNDADORES.desconto_implantacao : 0);
    for (const k of ["vendedor_id", "parceiro_id"]) if (b[k]) exigirParceiro(b[k]);
    const regras = { ...c.regras };
    if (fundador) regras.preco_travado_ate = somarMeses(competencia, FUNDADORES.preco_travado_meses);
    const novo = repo.atualizar("clientes", c.id, {
      fase: "contrato",
      teste_ate: null,
      produto: plano.produto,
      plano_id: plano.id,
      plano: `${PRODUTOS[plano.produto]} · ${plano.nome}${quantidade ? ` (${quantidade} ${plano.unidade}es)` : ""}`,
      quantidade,
      valor_centavos: mensal,
      fundador,
      desconto_pct: desconto,
      desconto_ate: desconto > 0 && mesesDesc ? somarMeses(competencia, mesesDesc - 1) : null,
      dia_vencimento: V.inteiro(b.dia_vencimento, 1, 31, "dia do vencimento") ?? c.dia_vencimento,
      inicio_cobranca: V.data(b.inicio_cobranca, "início da cobrança") ?? hoje(),
      contratado_em: hoje(),
      vendedor_id: b.vendedor_id === undefined ? undefined : b.vendedor_id || null,
      parceiro_id: b.parceiro_id === undefined ? undefined : b.parceiro_id || null,
      status: "ativo",
      bloqueio_manual: null,
      regras,
    });
    if (implantacao > 0 && b.cobrar_implantacao !== false)
      repo.inserir("faturas", { cliente_id: c.id, tipo: "implantacao", descricao: `Implantação · ${PRODUTOS[plano.produto]} ${plano.nome}${fundador ? ` · fundador ${FUNDADORES.desconto_implantacao}%` : ""}`, valor_centavos: implantacao, vencimento: somarDias(hoje(), 3) });
    auditar(ctx, "plano_contratado", c.id, { plano: plano.id, mensal, fundador, desconto, implantacao });
    conversao.registrar(novo, "contrato_fechado", { mensal_centavos: mensalidadeEfetiva(novo), implantacao_centavos: implantacao > 0 && b.cobrar_implantacao !== false ? implantacao : 0 });
    await rotina();
    return repo.obter("clientes", novo.id);
  });

  /* ---------- Vendedores e parceiros ---------- */
  function dadosParceiro(b, parcial) {
    if (!parcial || b.tipo !== undefined) if (!TIPOS_PARCEIRO.includes(b.tipo)) falha(400, "Escolha o tipo (vendedor, representante ou nível de parceiro).");
    let pcts;
    if (b.percentuais !== undefined) {
      pcts = {};
      for (const k of ["primeira", "recorrente", "implantacao", "sob_medida"]) if (b.percentuais?.[k] !== undefined && b.percentuais[k] !== "") {
        const n = Number(b.percentuais[k]);
        if (!(n >= 0 && n <= 100)) falha(400, `Percentual de ${k}: entre 0 e 100.`);
        pcts[k] = n;
      }
      if (b.percentuais?.meses !== undefined && b.percentuais.meses !== "") pcts.meses = V.inteiro(b.percentuais.meses, 0, 120, "meses de recorrência");
    }
    return {
      nome: V.texto(b.nome, 120, { obrig: !parcial, rotulo: "nome" }),
      tipo: b.tipo,
      empresa: V.texto(b.empresa, 150),
      documento: b.documento ? V.cnpj(b.documento) : b.documento === undefined ? undefined : null,
      email: V.email(b.email),
      telefone: V.texto(b.telefone, 30),
      pix: V.texto(b.pix, 120),
      observacoes: V.texto(b.observacoes, 1000),
      ativo: b.ativo === undefined ? undefined : Boolean(b.ativo),
      percentuais: pcts,
    };
  }
  const parceiroPublico = ({ portal_hash, ...p }) => {
    const totais = repo.um("SELECT COALESCE(SUM(CASE WHEN status IN ('prevista','a_pagar') THEN valor_centavos END),0) aberto, COALESCE(SUM(CASE WHEN status = 'paga' THEN valor_centavos END),0) pago FROM comissoes WHERE parceiro_id = ?", p.id);
    const clientes = repo.um("SELECT COUNT(*) n FROM clientes WHERE (parceiro_id = ? OR vendedor_id = ?) AND status = 'ativo'", p.id, p.id).n;
    return { ...p, portal: Boolean(portal_hash), regra: percentuais(p), clientes_ativos: clientes, comissao_aberta: totais.aberto, comissao_paga: totais.pago };
  };
  rota("GET", "/api/parceiros", TODOS, () => repo.lista("parceiros", "ORDER BY ativo DESC, nome").map(parceiroPublico));
  rota("POST", "/api/parceiros", FIN, async (ctx) => {
    const p = repo.inserir("parceiros", dadosParceiro(await ctx.corpo(), false));
    auditar(ctx, "parceiro_criado", null, { parceiro: p.id, tipo: p.tipo });
    return parceiroPublico(repo.obter("parceiros", p.id));
  });
  rota("PUT", "/api/parceiros/:id", FIN, async (ctx) => {
    const p = exigirParceiro(ctx.params.id);
    const d = dadosParceiro(await ctx.corpo(), true);
    auditar(ctx, "parceiro_alterado", null, { parceiro: p.id });
    return parceiroPublico(repo.atualizar("parceiros", p.id, d));
  });
  // Gera (ou troca) o link do portal do parceiro. O link antigo para de funcionar.
  rota("POST", "/api/parceiros/:id/portal", FIN, (ctx) => {
    const p = exigirParceiro(ctx.params.id);
    const token = `nxp_${gerarToken(32)}`;
    repo.atualizar("parceiros", p.id, { portal_hash: sha256(token) });
    auditar(ctx, "portal_parceiro_link", null, { parceiro: p.id });
    return { link: `${cfg.urlPublica || `http://localhost:${cfg.porta}`}/parceiro/#t=${token}` };
  });

  /* ---------- Comissões ---------- */
  // Gera as comissões de uma fatura paga para o vendedor e o parceiro do cliente
  function comissionar(fatura) {
    const f = repo.obter("faturas", fatura.id);
    if (!f || f.status !== "paga") return [];
    const c = repo.obter("clientes", f.cliente_id);
    const criadas = [];
    const pagasAntes = repo.um("SELECT COUNT(*) n FROM faturas WHERE cliente_id = ? AND tipo = 'mensalidade' AND status = 'paga' AND id != ? AND (pago_em < ? OR (pago_em = ? AND vencimento < ?))", c.id, f.id, f.pago_em, f.pago_em, f.vencimento).n;
    for (const pid of new Set([c.vendedor_id, c.parceiro_id].filter(Boolean))) {
      const p = repo.obter("parceiros", pid);
      if (!p?.ativo) continue;
      const r = percentuais(p);
      let tipo = null;
      let pct = 0;
      if (f.tipo === "implantacao") [tipo, pct] = ["implantacao", r.implantacao];
      else if (f.tipo === "avulsa") [tipo, pct] = ["sob_medida", r.sob_medida];
      else if (pagasAntes === 0 && r.primeira > 0) [tipo, pct] = ["primeira", r.primeira];
      else if (!r.meses || pagasAntes <= r.meses) [tipo, pct] = ["recorrente", r.recorrente];
      if (!(pct > 0)) continue;
      const dados = { tipo, base_centavos: f.valor_centavos, pct, valor_centavos: Math.round((f.valor_centavos * pct) / 100), liberar_em: somarDias(f.pago_em ?? hoje(), REGRAS_COMISSAO.carencia_dias) };
      const ja = repo.um("SELECT id, status FROM comissoes WHERE parceiro_id = ? AND fatura_id = ?", p.id, f.id);
      // Fatura reaberta e paga de novo: a comissão estornada volta; a que já existe não duplica
      if (ja?.status === "estornada") criadas.push(repo.atualizar("comissoes", ja.id, { ...dados, status: "prevista", pago_em: null }));
      else if (!ja) criadas.push(repo.inserir("comissoes", { parceiro_id: p.id, fatura_id: f.id, cliente_id: c.id, ...dados }));
    }
    return criadas;
  }
  // Fatura reaberta ou cancelada: a comissão ainda não paga é estornada
  function estornarFatura(fatura_id) {
    repo.rodar("UPDATE comissoes SET status = 'estornada', atualizado_em = ? WHERE fatura_id = ? AND status IN ('prevista','a_pagar')", Date.now(), fatura_id);
  }
  // Cancelou nos primeiros dias: estorna a comissão da 1ª mensalidade e da implantação ainda não paga
  function estornarCancelamento(cliente) {
    if (!cliente.contratado_em || somarDias(cliente.contratado_em, REGRAS_COMISSAO.estorno_cancelamento_dias) < hoje()) return 0;
    return repo.rodar("UPDATE comissoes SET status = 'estornada', atualizado_em = ? WHERE cliente_id = ? AND tipo IN ('primeira','implantacao') AND status IN ('prevista','a_pagar')", Date.now(), cliente.id).changes;
  }
  // Passada a carência, a comissão fica disponível para pagamento
  function liberarComissoes() {
    return repo.rodar("UPDATE comissoes SET status = 'a_pagar', atualizado_em = ? WHERE status = 'prevista' AND liberar_em <= ?", Date.now(), hoje()).changes;
  }
  rota("GET", "/api/comissoes", TODOS, ({ query }) => {
    const cond = [];
    const p = [];
    if (["prevista", "a_pagar", "paga", "estornada"].includes(query.get("status"))) cond.push("x.status = ?"), p.push(query.get("status"));
    if (query.get("parceiro")) cond.push("x.parceiro_id = ?"), p.push(query.get("parceiro"));
    return repo.todos(`SELECT x.*, p.nome parceiro, COALESCE(c.nome_fantasia, c.razao_social) cliente, f.descricao fatura FROM comissoes x JOIN parceiros p ON p.id = x.parceiro_id JOIN clientes c ON c.id = x.cliente_id JOIN faturas f ON f.id = x.fatura_id ${cond.length ? `WHERE ${cond.join(" AND ")}` : ""} ORDER BY x.criado_em DESC LIMIT 500`, ...p);
  });
  rota("POST", "/api/comissoes/:id/pagar", FIN, async (ctx) => {
    const x = repo.obter("comissoes", ctx.params.id) ?? falha(404, "Comissão não encontrada.");
    if (x.status !== "a_pagar") falha(409, x.status === "prevista" ? `Ainda em carência até ${dataBR(x.liberar_em)}.` : "Esta comissão não está disponível para pagamento.");
    const b = await ctx.corpo();
    auditar(ctx, "comissao_paga", x.cliente_id, { comissao: x.id, valor: x.valor_centavos });
    return repo.atualizar("comissoes", x.id, { status: "paga", pago_em: V.data(b.data, "data do pagamento") ?? hoje() });
  });

  /* ---------- Indicações ---------- */
  rota("GET", "/api/indicacoes", TODOS, () => repo.todos("SELECT i.*, p.nome parceiro FROM indicacoes i JOIN parceiros p ON p.id = i.parceiro_id ORDER BY i.criado_em DESC LIMIT 300"));
  rota("PUT", "/api/indicacoes/:id", FIN, async (ctx) => {
    const i = repo.obter("indicacoes", ctx.params.id) ?? falha(404, "Indicação não encontrada.");
    const b = await ctx.corpo();
    if (b.status && !["nova", "em_contato", "teste", "fechada", "perdida"].includes(b.status)) falha(400, "Situação inválida.");
    let cliente_id;
    if (b.cliente_id !== undefined) {
      cliente_id = b.cliente_id || null;
      if (cliente_id) {
        const c = exigirCliente(cliente_id);
        // A indicação fechada vincula o cliente ao parceiro, que passa a receber as comissões
        if (!c.parceiro_id) repo.atualizar("clientes", c.id, { parceiro_id: i.parceiro_id });
      }
    }
    auditar(ctx, "indicacao_alterada", cliente_id ?? null, { indicacao: i.id, status: b.status });
    return repo.atualizar("indicacoes", i.id, { status: b.status, cliente_id });
  });

  /* ---------- Portal do parceiro ---------- */
  function parceiroDoToken(ctx) {
    limitar(`portal:${ctx.ip}`, 120, 5 * 60_000);
    const token = String(ctx.req.headers.authorization ?? "").match(/^Parceiro\s+(nxp_[\w-]{20,80})$/)?.[1];
    const p = token ? repo.um("SELECT * FROM parceiros WHERE portal_hash = ? AND ativo = 1", sha256(token)) : null;
    if (!p) falha(401, "Link do portal inválido ou trocado. Peça um novo link à Nexor.");
    return repo.ler("parceiros", p);
  }
  rota("GET", "/api/portal-parceiro", { publico: true, maquina: true }, (ctx) => {
    const p = parceiroDoToken(ctx);
    const clientes = repo.lista("clientes", "WHERE parceiro_id = ? OR vendedor_id = ? ORDER BY razao_social", p.id, p.id).map((c) => ({
      nome: nomeCliente(c),
      plano: c.plano,
      fase: c.fase,
      status: c.status,
      fundador: c.fundador,
      teste_ate: c.teste_ate,
      contratado_em: c.contratado_em,
      mensalidade: c.valor_centavos,
    }));
    const comissoes = repo.todos("SELECT x.tipo, x.base_centavos, x.pct, x.valor_centavos, x.status, x.liberar_em, x.pago_em, x.criado_em, COALESCE(c.nome_fantasia, c.razao_social) cliente FROM comissoes x JOIN clientes c ON c.id = x.cliente_id WHERE x.parceiro_id = ? ORDER BY x.criado_em DESC LIMIT 300", p.id);
    const soma = (st) => comissoes.filter((x) => st.includes(x.status)).reduce((s, x) => s + x.valor_centavos, 0);
    return {
      parceiro: { nome: p.nome, tipo: p.tipo, tipo_nome: COMISSOES[p.tipo]?.nome ?? p.tipo, regra: percentuais(p) },
      totais: { carencia: soma(["prevista"]), a_receber: soma(["a_pagar"]), recebido: soma(["paga"]), clientes_ativos: clientes.filter((c) => c.status === "ativo" && c.fase === "contrato").length, em_teste: clientes.filter((c) => c.fase === "teste").length },
      clientes,
      comissoes,
      indicacoes: repo.todos("SELECT empresa, contato, produto, status, criado_em FROM indicacoes WHERE parceiro_id = ? ORDER BY criado_em DESC LIMIT 100", p.id),
      produtos: PRODUTOS,
      regras: REGRAS_COMISSAO,
      contato: cfg.contato,
    };
  });
  rota("POST", "/api/portal-parceiro/indicacoes", { publico: true, maquina: true }, async (ctx) => {
    const p = parceiroDoToken(ctx);
    limitar(`indicacao:${p.id}`, 30, 60 * 60_000);
    const b = await ctx.corpo();
    if (b.produto && !PRODUTOS[b.produto]) falha(400, "Produto inválido.");
    const i = repo.inserir("indicacoes", { parceiro_id: p.id, empresa: V.texto(b.empresa, 150, { obrig: true, rotulo: "empresa" }), contato: V.texto(b.contato, 120), telefone: V.texto(b.telefone, 30), email: V.email(b.email), produto: b.produto || null, observacao: V.texto(b.observacao, 1000) });
    repo.auditar(p.nome, "indicacao_recebida", null, { indicacao: i.id });
    return { ok: true };
  });

  return { comissionar, estornarFatura, estornarCancelamento, liberarComissoes, linkContratar: (c, produto) => (cfg.contato.whatsapp ? `https://wa.me/${String(cfg.contato.whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(`Olá! Quero contratar o ${PRODUTOS[produto] ?? "sistema"} (cliente ${c.codigo}).`)}` : null) };
}
