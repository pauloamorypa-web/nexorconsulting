/* Rotas do painel do FORNECEDOR (cookie nx_elo_f).
   PRIVACIDADE: toda resposta que fala de proposta, reserva, pagamento ou repasse passa pelas projeções de
   servicos/privacidade.js. Nenhuma rota daqui lê a tabela de clientes. */

import { z } from "zod";
import { hojeBR } from "../regras/datas.js";
import { lerCsv, reaisParaCentavos } from "../regras/documentos.js";
import { instaladorParaFornecedor, propostaParaFornecedor, repasseParaFornecedor, reservaParaFornecedor } from "../servicos/privacidade.js";
import { falha } from "./roteador.js";
import { pode } from "./permissoes.js";
import { centavos, cnaes, dia, email, id, op, pct, t, telefone, uf, url, conferir, validar } from "./validacao.js";

export function rotasFornecedor(h) {
  const { r, repo, cofre, negocio, agora, auditar, daConta, contaPublica, fiscal } = h;
  const F = (acao) => ({ conta: "fornecedor", pode: acao });
  const hoje = () => hojeBR(agora());

  /* ---------- Conta ---------- */
  r.get("/api/fornecedor/conta", F("ver"), (ctx) => contaPublica(ctx.conta));
  r.put("/api/fornecedor/conta", F("configurar"), async (ctx) => {
    const d = validar(z.object({ nome_fantasia: op(120), telefone: telefone.optional(), email: email.optional(), cnaes: cnaes.optional(), cidade: t(80).optional(), uf: uf.optional(), prazo_reserva_dias: z.number().int().min(1).max(30).optional(), prazo_titulo_dias: z.number().int().min(1).max(120).optional(), focus_token: op(200) }), await ctx.corpo());
    const { prazo_reserva_dias, prazo_titulo_dias, focus_token, cnaes: novos, ...campos } = d;
    const config = { ...ctx.conta.config };
    if (prazo_reserva_dias) config.prazo_reserva_dias = prazo_reserva_dias;
    if (prazo_titulo_dias) config.prazo_titulo_dias = prazo_titulo_dias;
    if (focus_token !== undefined) config.focus_token_cripto = focus_token ? cofre.cifrar(focus_token) : undefined;
    const c = repo.atualizar("contas", ctx.conta.id, { ...campos, ...(novos ? { cnaes: [...new Set(novos)] } : {}), config });
    auditar(ctx, "conta_alterada", { campos: Object.keys(d).map((k) => (k === "focus_token" ? "focus_token (cifrado)" : k)) });
    return contaPublica(c);
  });
  // walletId: para onde vai o dinheiro dos produtos no split. Só o dono troca; fica cifrado e auditado.
  r.put("/api/fornecedor/conta/wallet", F("wallet"), async (ctx) => {
    const d = validar(z.object({ wallet_id: z.string().trim().regex(/^[0-9a-fA-F-]{8,64}$|^[\w-]{8,64}$/, "walletId inválido").nullable() }), await ctx.corpo());
    const c = repo.atualizar("contas", ctx.conta.id, { config: { ...ctx.conta.config, wallet_cripto: d.wallet_id ? cofre.cifrar(d.wallet_id) : undefined } });
    auditar(ctx, "wallet_alterado", { final: d.wallet_id ? d.wallet_id.slice(-4) : null });
    return contaPublica(c);
  });

  /* ---------- Catálogo ---------- */
  const produtoCampos = z.object({
    codigo: t(60), nome: t(200), marca: op(80), categoria: op(80), foto_url: url.optional().nullable(), preco_centavos: centavos, estoque: z.number().int().min(0).max(10_000_000).optional(),
    unidade: t(10).optional(), prazo_dias: z.number().int().min(0).max(120).optional(), visibilidade: z.enum(["todos", "tabelas"]).optional(), tabelas: z.array(id).max(50).optional(), ativo: z.boolean().optional(),
  });
  const conferirTabelas = (ctx, lista = []) => lista.forEach((tid) => daConta("tabelas", tid, "fornecedor_id", ctx.conta.id, "Tabela"));
  r.get("/api/fornecedor/produtos", F("ver"), ({ conta, query }) => {
    const busca = (query.get("busca") ?? "").trim().toLowerCase();
    const termo = `%${busca}%`;
    const cat = query.get("categoria") ?? "";
    const inativos = query.get("inativos") === "1";
    return repo.lista("produtos", "WHERE fornecedor_id = ? AND (? = 1 OR ativo = 1) AND (? = '' OR lower(nome) LIKE ? OR lower(codigo) LIKE ?) AND (? = '' OR categoria = ?) ORDER BY categoria, nome LIMIT 2000", conta.id, inativos ? 1 : 0, busca, termo, termo, cat, cat).map((p) => ({ ...p, disponivel: p.estoque - p.reservado }));
  });
  r.post("/api/fornecedor/produtos", F("catalogo"), async (ctx) => {
    const d = validar(produtoCampos, await ctx.corpo());
    conferirTabelas(ctx, d.tabelas);
    if (repo.um("SELECT 1 FROM produtos WHERE fornecedor_id = ? AND codigo = ?", ctx.conta.id, d.codigo)) falha(409, `Já existe um produto com o código ${d.codigo}.`);
    return repo.inserir("produtos", { fornecedor_id: ctx.conta.id, ...d });
  });
  r.put("/api/fornecedor/produtos/:id", F("catalogo"), async (ctx) => {
    const p = daConta("produtos", ctx.params.id, "fornecedor_id", ctx.conta.id, "Produto");
    const d = validar(produtoCampos.partial(), await ctx.corpo());
    conferirTabelas(ctx, d.tabelas);
    if (d.codigo && d.codigo !== p.codigo && repo.um("SELECT 1 FROM produtos WHERE fornecedor_id = ? AND codigo = ?", ctx.conta.id, d.codigo)) falha(409, `Já existe um produto com o código ${d.codigo}.`);
    if (d.estoque !== undefined && d.estoque < p.reservado) falha(409, `O estoque não pode ficar abaixo do reservado (${p.reservado}).`);
    if (d.ativo === false && p.reservado > 0) falha(409, "Há reservas ativas deste produto. Espere vencerem ou serem pagas para desativar.");
    return repo.atualizar("produtos", p.id, d);
  });
  r.delete("/api/fornecedor/produtos/:id", F("catalogo"), (ctx) => {
    const p = daConta("produtos", ctx.params.id, "fornecedor_id", ctx.conta.id, "Produto");
    if (p.reservado > 0) falha(409, "Há reservas ativas deste produto. Espere vencerem ou serem pagas para desativar.");
    return repo.atualizar("produtos", p.id, { ativo: false });
  });
  // CSV: codigo;nome;marca;categoria;preco;estoque;unidade;prazo_dias;foto_url (cria ou atualiza pelo código)
  r.post("/api/fornecedor/produtos/importar", { ...F("catalogo"), limite: 2 * 1024 * 1024 }, async (ctx) => {
    const d = validar(z.object({ csv: z.string().min(1).max(2_000_000) }), await ctx.corpo());
    const { cabecalho, linhas } = lerCsv(d.csv);
    for (const c of ["codigo", "nome", "preco"]) if (!cabecalho.includes(c)) falha(400, `O CSV precisa da coluna "${c}" no cabeçalho (ex.: codigo;nome;marca;categoria;preco;estoque;unidade;prazo_dias;foto_url).`);
    if (linhas.length > 5000) falha(400, "Envie no máximo 5.000 produtos por arquivo.");
    const res = { criados: 0, atualizados: 0, erros: [] };
    repo.transacao(() => {
      linhas.forEach((l, i) => {
        const linha = i + 2;
        const preco = reaisParaCentavos(l.preco);
        // Estoque como o brasileiro escreve: "1.000" = mil (banca U-06); "1,5" não é quantidade inteira
        const estoqueTxt = String(l.estoque ?? "").trim();
        const estoque = estoqueTxt === "" ? undefined : /^\d{1,3}(\.\d{3})+$/.test(estoqueTxt) ? Number(estoqueTxt.replaceAll(".", "")) : /^\d+$/.test(estoqueTxt) ? Number(estoqueTxt) : NaN;
        if (Number.isNaN(estoque)) return res.erros.push({ linha, erro: `Estoque: "${estoqueTxt}" não é uma quantidade inteira (use 1000 ou 1.000)` });
        const dados = { codigo: l.codigo, nome: l.nome, marca: l.marca || null, categoria: l.categoria || null, preco_centavos: preco, ...(estoque !== undefined ? { estoque } : {}), ...(l.unidade ? { unidade: l.unidade } : {}), ...(l.prazo_dias ? { prazo_dias: Number(l.prazo_dias) } : {}), ...(l.foto_url ? { foto_url: l.foto_url } : {}) };
        const ok = conferir(produtoCampos, dados);
        if (!ok.ok || preco === null) return res.erros.push({ linha, erro: preco === null ? `Preço: "${l.preco ?? ""}" não é um valor válido (ex.: 1.234,56)` : ok.erro });
        const atual = repo.um("SELECT id, reservado FROM produtos WHERE fornecedor_id = ? AND codigo = ?", ctx.conta.id, ok.dados.codigo);
        if (atual) {
          if (ok.dados.estoque !== undefined && ok.dados.estoque < atual.reservado) return res.erros.push({ linha, erro: `estoque abaixo do reservado (${atual.reservado})` });
          repo.atualizar("produtos", atual.id, { ...ok.dados, ativo: true });
          res.atualizados++;
        } else {
          repo.inserir("produtos", { fornecedor_id: ctx.conta.id, ...ok.dados });
          res.criados++;
        }
      });
    });
    auditar(ctx, "catalogo_importado", { criados: res.criados, atualizados: res.atualizados, erros: res.erros.length });
    return res;
  });

  /* ---------- Tabelas de preço ---------- */
  const tabelaCampos = z.object({ nome: t(80), tipo: z.enum(["desconto", "lista"]), desconto_pct: pct.optional(), precos: z.record(z.string().max(60), centavos).optional(), ativo: z.boolean().optional() });
  const gravarTabela = (ctx, d) => {
    if (d.precos) for (const pid of Object.keys(d.precos)) daConta("produtos", pid, "fornecedor_id", ctx.conta.id, "Produto da tabela");
    const { desconto_pct, ...resto } = d;
    return { ...resto, ...(desconto_pct !== undefined ? { desconto_bps: Math.round(desconto_pct * 100) } : {}) };
  };
  const tabelaPublica = (tb) => ({ ...tb, desconto_pct: tb.desconto_bps / 100, vinculos: repo.um("SELECT COUNT(*) n FROM vinculos WHERE tabela_id = ?", tb.id).n });
  r.get("/api/fornecedor/tabelas", F("ver"), ({ conta }) => repo.lista("tabelas", "WHERE fornecedor_id = ? ORDER BY nome", conta.id).map(tabelaPublica));
  r.post("/api/fornecedor/tabelas", F("catalogo"), async (ctx) => tabelaPublica(repo.inserir("tabelas", { fornecedor_id: ctx.conta.id, ...gravarTabela(ctx, validar(tabelaCampos, await ctx.corpo())) })));
  r.put("/api/fornecedor/tabelas/:id", F("catalogo"), async (ctx) => {
    const tb = daConta("tabelas", ctx.params.id, "fornecedor_id", ctx.conta.id, "Tabela");
    return tabelaPublica(repo.atualizar("tabelas", tb.id, gravarTabela(ctx, validar(tabelaCampos.partial(), await ctx.corpo()))));
  });
  r.delete("/api/fornecedor/tabelas/:id", F("catalogo"), (ctx) => {
    const tb = daConta("tabelas", ctx.params.id, "fornecedor_id", ctx.conta.id, "Tabela");
    return tabelaPublica(repo.atualizar("tabelas", tb.id, { ativo: false }));
  });

  /* ---------- Vínculos com instaladores ---------- */
  const vinculoPublico = (v) => {
    const inst = repo.obter("contas", v.instalador_id);
    const tb = v.tabela_id ? repo.obter("tabelas", v.tabela_id) : null;
    const s = negocio.score(v.instalador_id, v.fornecedor_id);
    return {
      id: v.id, status: v.status, criado_em: v.criado_em, decidido_em: v.decidido_em, decidido_por: v.decidido_por, motivo: v.motivo,
      instalador: { ...instaladorParaFornecedor(inst), cnaes: inst.cnaes },
      cnaes_compativeis: v.cnaes_compativeis,
      tabela: tb ? { id: tb.id, nome: tb.nome } : null,
      credito: negocio.credito(v),
      score: s.score,
    };
  };
  const meuVinculo = (ctx) => daConta("vinculos", ctx.params.id, "fornecedor_id", ctx.conta.id, "Vínculo");
  r.get("/api/fornecedor/vinculos", F("ver"), ({ conta, query }) => {
    const st = query.get("status") ?? "";
    return repo.lista("vinculos", "WHERE fornecedor_id = ? AND (? = '' OR status = ?) ORDER BY criado_em DESC", conta.id, st, st).map(vinculoPublico);
  });
  r.get("/api/fornecedor/vinculos/:id", F("ver"), (ctx) => vinculoPublico(meuVinculo(ctx)));
  const tabelaOuNulo = (ctx, tid) => (tid ? daConta("tabelas", tid, "fornecedor_id", ctx.conta.id, "Tabela").id : null);
  r.post("/api/fornecedor/vinculos/:id/aprovar", F("vinculos"), async (ctx) => {
    const v = meuVinculo(ctx);
    const d = validar(z.object({ tabela_id: id.optional().nullable(), limite_credito_centavos: centavos.optional() }), await ctx.corpo());
    if (d.limite_credito_centavos !== undefined && !pode(ctx.usuario, "credito")) falha(403, "Seu perfil não pode definir limite de crédito.");
    if (v.status === "aprovado") falha(409, "Este vínculo já está aprovado.");
    const n = repo.atualizar("vinculos", v.id, { status: "aprovado", tabela_id: tabelaOuNulo(ctx, d.tabela_id), ...(d.limite_credito_centavos !== undefined ? { limite_credito_centavos: d.limite_credito_centavos } : {}), decidido_por: ctx.usuario.nome, decidido_em: agora(), motivo: null });
    auditar(ctx, "vinculo_aprovado", { vinculo_id: v.id, instalador_id: v.instalador_id, tabela_id: n.tabela_id, limite_credito_centavos: n.limite_credito_centavos });
    negocio.avisar(v.instalador_id, "vinculo_aprovado", `${negocio.nomeConta(ctx.conta)} aprovou seu vínculo. O catálogo já está liberado.`, v.id);
    return vinculoPublico(n);
  });
  r.post("/api/fornecedor/vinculos/:id/recusar", F("vinculos"), async (ctx) => {
    const v = meuVinculo(ctx);
    const d = validar(z.object({ motivo: op(300) }), await ctx.corpo());
    if (repo.um("SELECT 1 FROM reservas WHERE fornecedor_id = ? AND status = 'ativa' AND proposta_id IN (SELECT id FROM propostas WHERE instalador_id = ?)", ctx.conta.id, v.instalador_id)) falha(409, "Há reservas ativas deste instalador. Use o bloqueio para impedir novas reservas.");
    const n = repo.atualizar("vinculos", v.id, { status: "recusado", motivo: d.motivo ?? null, decidido_por: ctx.usuario.nome, decidido_em: agora() });
    auditar(ctx, "vinculo_recusado", { vinculo_id: v.id, motivo: d.motivo ?? null });
    negocio.avisar(v.instalador_id, "vinculo_recusado", `${negocio.nomeConta(ctx.conta)} recusou o vínculo${d.motivo ? `: ${d.motivo}` : "."}`, v.id);
    return vinculoPublico(n);
  });
  r.put("/api/fornecedor/vinculos/:id/tabela", F("vinculos"), async (ctx) => {
    const v = meuVinculo(ctx);
    const d = validar(z.object({ tabela_id: id.nullable() }), await ctx.corpo());
    const n = repo.atualizar("vinculos", v.id, { tabela_id: tabelaOuNulo(ctx, d.tabela_id) });
    auditar(ctx, "vinculo_tabela", { vinculo_id: v.id, tabela_id: n.tabela_id });
    return vinculoPublico(n);
  });
  r.put("/api/fornecedor/vinculos/:id/credito", F("credito"), async (ctx) => {
    const v = meuVinculo(ctx);
    const d = validar(z.object({ limite_credito_centavos: centavos }), await ctx.corpo());
    const n = repo.atualizar("vinculos", v.id, d);
    auditar(ctx, "limite_credito", { vinculo_id: v.id, de: v.limite_credito_centavos, para: d.limite_credito_centavos });
    return vinculoPublico(n);
  });
  r.post("/api/fornecedor/vinculos/:id/bloquear", F("credito"), async (ctx) => {
    const v = meuVinculo(ctx);
    const d = validar(z.object({ motivo: op(300) }), await ctx.corpo());
    const n = repo.atualizar("vinculos", v.id, { bloqueado: true, motivo: d.motivo || "Bloqueio feito pelo fornecedor." });
    auditar(ctx, "vinculo_bloqueado", { vinculo_id: v.id, motivo: n.motivo });
    negocio.avisar(v.instalador_id, "vinculo_bloqueado", `${negocio.nomeConta(ctx.conta)} bloqueou novas reservas: ${n.motivo}`, v.id);
    return vinculoPublico(n);
  });
  r.post("/api/fornecedor/vinculos/:id/desbloquear", F("credito"), (ctx) => {
    const v = meuVinculo(ctx);
    const n = repo.atualizar("vinculos", v.id, { bloqueado: false, motivo: null });
    auditar(ctx, "vinculo_desbloqueado", { vinculo_id: v.id });
    negocio.avisar(v.instalador_id, "vinculo_desbloqueado", `${negocio.nomeConta(ctx.conta)} liberou novas reservas.`, v.id);
    return vinculoPublico(n);
  });
  r.get("/api/fornecedor/instaladores/:id/score", F("ver"), (ctx) => {
    const v = negocio.vinculo(ctx.conta.id, ctx.params.id);
    if (!v) falha(404, "Instalador não encontrado.");
    return { instalador: instaladorParaFornecedor(repo.obter("contas", v.instalador_id)), ...negocio.score(v.instalador_id, ctx.conta.id) };
  });

  /* ---------- Propostas e reservas que envolvem o fornecedor (projeção sem dados do cliente) ---------- */
  const propostasMinhas = (contaId, status = "") =>
    repo.lista("propostas", "WHERE status <> 'rascunho' AND id IN (SELECT proposta_id FROM proposta_itens WHERE fornecedor_id = ?) AND (? = '' OR status = ?) ORDER BY COALESCE(enviada_em, criado_em) DESC LIMIT 500", contaId, status, status);
  const projetar = (p, contaId) => {
    const pg = repo.ler("pagamentos", repo.um("SELECT * FROM pagamentos WHERE proposta_id = ? ORDER BY CASE status WHEN 'pago' THEN 0 WHEN 'pendente' THEN 1 ELSE 2 END, criado_em DESC LIMIT 1", p.id));
    return propostaParaFornecedor(p, negocio.itensDa(p.id), repo.obter("contas", p.instalador_id), contaId, { reservas: repo.lista("reservas", "WHERE proposta_id = ?", p.id), pagamento: pg });
  };
  const minhaProposta = (ctx) => {
    const p = repo.obter("propostas", ctx.params.id);
    if (!p || p.status === "rascunho" || !repo.um("SELECT 1 FROM proposta_itens WHERE proposta_id = ? AND fornecedor_id = ?", p.id, ctx.conta.id)) falha(404, "Proposta não encontrada.");
    return p;
  };
  r.get("/api/fornecedor/propostas", F("ver"), ({ conta, query }) => propostasMinhas(conta.id, query.get("status") ?? "").map((p) => projetar(p, conta.id)));
  r.get("/api/fornecedor/propostas/:id", F("ver"), (ctx) => projetar(minhaProposta(ctx), ctx.conta.id));
  r.get("/api/fornecedor/reservas", F("ver"), ({ conta, query }) => {
    const st = query.get("status") ?? "";
    return repo.lista("reservas", "WHERE fornecedor_id = ? AND (? = '' OR status = ?) ORDER BY criado_em DESC LIMIT 1000", conta.id, st, st).map((x) => {
      const p = repo.obter("propostas", x.proposta_id);
      return reservaParaFornecedor(x, repo.obter("produtos", x.produto_id), p, repo.obter("contas", p.instalador_id));
    });
  });

  /* ---------- Financeiro: repasses, títulos e notas ---------- */
  r.get("/api/fornecedor/repasses", F("financeiro"), ({ conta }) => {
    const lista = repo.lista("repasses", "WHERE destino = 'fornecedor' AND conta_id = ? AND status <> 'cancelado' ORDER BY criado_em DESC LIMIT 1000", conta.id);
    const soma = (f) => lista.filter(f).reduce((s, x) => s + x.valor_centavos, 0);
    const titulos = repo.um("SELECT COALESCE(SUM(valor_centavos),0) n FROM titulos WHERE fornecedor_id = ? AND status = 'aberto'", conta.id).n;
    return {
      resumo: { recebido_split_centavos: soma((x) => x.via === "split" && x.status === "recebido"), previsto_split_centavos: soma((x) => x.via === "split" && x.status === "previsto"), a_receber_titulos_centavos: titulos },
      repasses: lista.map((x) => {
        const p = repo.obter("propostas", x.proposta_id);
        return repasseParaFornecedor(x, p, repo.obter("contas", p.instalador_id));
      }),
    };
  });
  const tituloPublico = (x) => ({ ...x, vencido: x.status === "aberto" && x.vencimento < hoje(), instalador: instaladorParaFornecedor(repo.obter("contas", x.instalador_id)), proposta: x.proposta_id ? { id: x.proposta_id, numero: repo.obter("propostas", x.proposta_id)?.numero } : null });
  r.get("/api/fornecedor/titulos", F("financeiro"), ({ conta, query }) => {
    const st = query.get("status") ?? "";
    const inst = query.get("instalador_id") ?? "";
    const vencidos = query.get("vencidos") === "1";
    return repo.lista("titulos", "WHERE fornecedor_id = ? AND (? = '' OR status = ?) AND (? = '' OR instalador_id = ?) AND (? = 0 OR (status = 'aberto' AND vencimento < ?)) ORDER BY vencimento", conta.id, st, st, inst, inst, vencidos ? 1 : 0, hoje()).map(tituloPublico);
  });
  r.post("/api/fornecedor/titulos", F("financeiro"), async (ctx) => {
    const d = validar(z.object({ instalador_id: id, descricao: t(200), valor_centavos: centavos.refine((v) => v > 0, "precisa ser maior que zero"), vencimento: dia }), await ctx.corpo());
    const v = negocio.vinculo(ctx.conta.id, d.instalador_id);
    if (!v || v.status !== "aprovado") falha(404, "Instalador não vinculado.");
    const x = repo.inserir("titulos", { fornecedor_id: ctx.conta.id, ...d, status: "aberto", origem: "manual" });
    auditar(ctx, "titulo_criado", { titulo_id: x.id, valor_centavos: x.valor_centavos, vencimento: x.vencimento });
    negocio.avisar(d.instalador_id, "titulo_novo", `${negocio.nomeConta(ctx.conta)} lançou um título de R$ ${(d.valor_centavos / 100).toFixed(2).replace(".", ",")} com vencimento em ${d.vencimento.split("-").reverse().join("/")}.`, x.id);
    return tituloPublico(x);
  });
  const meuTitulo = (ctx) => daConta("titulos", ctx.params.id, "fornecedor_id", ctx.conta.id, "Título");
  r.post("/api/fornecedor/titulos/:id/baixar", F("financeiro"), (ctx) => {
    const x = meuTitulo(ctx);
    if (x.status !== "aberto") falha(409, "Este título não está em aberto.");
    const n = repo.transacao(() => {
      const y = repo.atualizar("titulos", x.id, { status: "pago", pago_em: agora(), pago_no_prazo: hoje() <= x.vencimento });
      if (x.proposta_id) repo.rodar("UPDATE repasses SET status = 'recebido', atualizado_em = ? WHERE proposta_id = ? AND conta_id = ? AND via = 'titulo' AND status = 'previsto'", agora(), x.proposta_id, ctx.conta.id);
      return y;
    });
    auditar(ctx, "titulo_baixado", { titulo_id: x.id, no_prazo: n.pago_no_prazo });
    return tituloPublico(n);
  });
  r.post("/api/fornecedor/titulos/:id/cancelar", F("financeiro"), (ctx) => {
    const x = meuTitulo(ctx);
    if (x.status !== "aberto") falha(409, "Este título não está em aberto.");
    auditar(ctx, "titulo_cancelado", { titulo_id: x.id });
    return tituloPublico(repo.atualizar("titulos", x.id, { status: "cancelado" }));
  });

  // NF-e de venda do fornecedor para o INSTALADOR (modelo fiscal do Elo: o fornecedor nunca precisa do cliente final)
  r.post("/api/fornecedor/propostas/:id/nfe", F("financeiro"), async (ctx) => {
    const p = minhaProposta(ctx);
    if (p.status !== "paga") falha(409, "A NF-e sai depois que a proposta for paga.");
    const ref = `elo-nfe-${p.id.slice(0, 8)}-${ctx.conta.id.slice(0, 8)}`;
    const ja = repo.ler("notas", repo.um("SELECT * FROM notas WHERE ref = ?", ref));
    if (ja) return ja;
    const vis = projetar(p, ctx.conta.id);
    const inst = repo.obter("contas", p.instalador_id);
    const dados = {
      natureza_operacao: "Venda de mercadoria", data_emissao: new Date(agora()).toISOString(), tipo_documento: 1, finalidade_emissao: 1,
      cnpj_emitente: ctx.conta.cnpj, cnpj_destinatario: inst.cnpj, nome_destinatario: inst.razao_social, municipio_destinatario: inst.cidade, uf_destinatario: inst.uf,
      valor_produtos: vis.total_itens_centavos / 100, valor_total: vis.total_itens_centavos / 100, modalidade_frete: 9,
      items: vis.itens.map((i, n) => ({ numero_item: n + 1, codigo_produto: i.codigo, descricao: i.descricao, unidade_comercial: i.unidade, quantidade_comercial: i.quantidade, valor_unitario_comercial: i.preco_unit_centavos / 100, valor_bruto: i.total_centavos / 100 })),
    };
    const res = await fiscal.emitir({ token: negocio.segredo(ctx.conta.config.focus_token_cripto), tipo: "nfe", ref, dados });
    const nota = repo.inserir("notas", { conta_id: ctx.conta.id, proposta_id: p.id, tipo: "nfe", ref, status: res.status, numero: res.numero, url: res.url, simulada: res.simulada, resposta: res.simulada ? { simulada: true } : res.dados });
    auditar(ctx, "nfe_emitida", { proposta_id: p.id, ref, simulada: res.simulada });
    return nota;
  });
  r.get("/api/fornecedor/notas", F("financeiro"), ({ conta }) => repo.lista("notas", "WHERE conta_id = ? ORDER BY criado_em DESC LIMIT 300", conta.id));

  /* ---------- Painel e notificações ---------- */
  r.get("/api/fornecedor/painel", F("ver"), ({ conta, usuario }) => {
    const n = (sql, ...p) => repo.um(sql, ...p).n;
    const porStatus = Object.fromEntries(["enviada", "vista", "aceita", "paga", "expirada"].map((s) => [s, 0]));
    for (const x of repo.todos("SELECT status, COUNT(*) n FROM propostas WHERE status <> 'rascunho' AND id IN (SELECT proposta_id FROM proposta_itens WHERE fornecedor_id = ?) GROUP BY status", conta.id)) porStatus[x.status] = x.n;
    const financeiro = pode(usuario, "financeiro");
    return {
      conta: { status: conta.status, nome: negocio.nomeConta(conta) },
      propostas: porStatus,
      reservas_ativas: n("SELECT COUNT(*) n FROM reservas WHERE fornecedor_id = ? AND status = 'ativa'", conta.id),
      itens_reservados: n("SELECT COALESCE(SUM(quantidade),0) n FROM reservas WHERE fornecedor_id = ? AND status = 'ativa'", conta.id),
      vinculos_pendentes: n("SELECT COUNT(*) n FROM vinculos WHERE fornecedor_id = ? AND status = 'pendente'", conta.id),
      instaladores: n("SELECT COUNT(*) n FROM vinculos WHERE fornecedor_id = ? AND status = 'aprovado'", conta.id),
      estoque_baixo: n("SELECT COUNT(*) n FROM produtos WHERE fornecedor_id = ? AND ativo = 1 AND estoque - reservado <= 2", conta.id),
      financeiro: financeiro
        ? {
            recebido_split_30d_centavos: n("SELECT COALESCE(SUM(valor_centavos),0) n FROM repasses WHERE destino = 'fornecedor' AND conta_id = ? AND via = 'split' AND status = 'recebido' AND atualizado_em >= ?", conta.id, agora() - 30 * 86400_000),
            a_receber_titulos_centavos: n("SELECT COALESCE(SUM(valor_centavos),0) n FROM titulos WHERE fornecedor_id = ? AND status = 'aberto'", conta.id),
            titulos_vencidos: n("SELECT COUNT(*) n FROM titulos WHERE fornecedor_id = ? AND status = 'aberto' AND vencimento < ?", conta.id, hoje()),
          }
        : null,
      nao_lidas: n("SELECT COUNT(*) n FROM notificacoes WHERE conta_id = ? AND lida = 0", conta.id),
    };
  });
  r.get("/api/fornecedor/notificacoes", F("ver"), ({ conta }) => repo.lista("notificacoes", "WHERE conta_id = ? ORDER BY criado_em DESC LIMIT 200", conta.id));
  r.post("/api/fornecedor/notificacoes/lidas", F("ver"), async (ctx) => {
    const d = validar(z.object({ ids: z.array(id).max(500).optional() }), await ctx.corpo());
    if (d.ids?.length) for (const x of d.ids) repo.rodar("UPDATE notificacoes SET lida = 1 WHERE id = ? AND conta_id = ?", x, ctx.conta.id);
    else repo.rodar("UPDATE notificacoes SET lida = 1 WHERE conta_id = ?", ctx.conta.id);
    return { ok: true };
  });
  r.get("/api/fornecedor/auditoria", F("auditoria"), ({ conta }) => repo.lista("auditoria", "WHERE conta_id = ? ORDER BY criado_em DESC LIMIT 300", conta.id));
}
