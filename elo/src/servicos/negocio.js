/* Regras de negócio do Elo: preço por tabela, visibilidade, crédito e bloqueio, reserva de estoque,
   expiração, aceite, pagamento com split, baixa, repasses, títulos, score e notificações. */

import { ErroHttp, falha } from "../http/roteador.js";
import { hojeBR, somarDias } from "../regras/datas.js";
import { documentoValido, soDigitos } from "../regras/documentos.js";
import { gerarToken, sha256 } from "../seguranca.js";

const reais = (c) => `R$ ${(c / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
export const formatarReais = reais;
export const PRAZO_RESERVA_PADRAO = 7;
export const PRAZO_TITULO_PADRAO = 7;
export const FORMAS = ["PIX", "BOLETO", "CREDIT_CARD"];

export function criarNegocio({ repo, cofre, cfg, agora, asaasPlataforma, notificador }) {
  const hoje = () => hojeBR(agora());
  let fila = Promise.resolve();
  const segredo = (v) => {
    try {
      return v ? cofre.decifrar(v) : "";
    } catch {
      return "";
    }
  };
  const conta = (id) => repo.obter("contas", id);
  const nomeConta = (c) => c?.nome_fantasia || c?.razao_social || "";

  /* ---------- Notificações ---------- */
  /** Registra a notificação no painel da conta e manda por WhatsApp/e-mail em segundo plano (sem travar a resposta) */
  function avisar(conta_id, tipo, texto, ref = null) {
    const n = repo.inserir("notificacoes", { conta_id, tipo, texto, ref });
    const c = conta(conta_id);
    const canais = [];
    if (c?.telefone) canais.push({ canal: "whatsapp", para: c.telefone });
    if (c?.email) canais.push({ canal: "email", para: c.email });
    for (const k of canais) fila = fila.then(() => notificador.enviar({ conta_id, ...k, texto: `Nexor Elo: ${texto}` })).catch((e) => console.error("[aviso]", e.message));
    return n;
  }
  /** Mensagem direta para um contato (ex.: link da proposta para o cliente do instalador) */
  function enviarDireto(conta_id, canal, para, texto) {
    fila = fila.then(() => notificador.enviar({ conta_id, canal, para, texto })).catch((e) => console.error("[envio]", e.message));
  }

  /* ---------- Vínculo, preço e visibilidade ---------- */
  const vinculo = (fornecedor_id, instalador_id) => repo.ler("vinculos", repo.um("SELECT * FROM vinculos WHERE fornecedor_id = ? AND instalador_id = ?", fornecedor_id, instalador_id));
  const tabelaDo = (v) => (v?.tabela_id ? repo.obter("tabelas", v.tabela_id) : null);

  function preco(produto, tabela) {
    if (tabela?.ativo) {
      if (tabela.tipo === "lista" && Number.isInteger(tabela.precos?.[produto.id])) return tabela.precos[produto.id];
      if (tabela.tipo === "desconto" && tabela.desconto_bps) return Math.round((produto.preco_centavos * (10000 - tabela.desconto_bps)) / 10000);
    }
    return produto.preco_centavos;
  }
  const visivel = (produto, v) => produto.ativo && (produto.visibilidade === "todos" || (v?.tabela_id && produto.tabelas.includes(v.tabela_id)));

  /** Produto como o instalador vinculado vê: preço da tabela dele, disponível e prazo */
  const produtoParaInstalador = (p, tabela, fornecedor) => ({
    id: p.id,
    fornecedor_id: p.fornecedor_id,
    fornecedor: fornecedor ? nomeConta(fornecedor) : undefined,
    codigo: p.codigo,
    nome: p.nome,
    marca: p.marca,
    categoria: p.categoria,
    foto_url: p.foto_url,
    unidade: p.unidade,
    preco_centavos: preco(p, tabela),
    preco_base_centavos: p.preco_centavos,
    disponivel: p.estoque - p.reservado,
    prazo_dias: p.prazo_dias,
  });

  /** Fornecedores aprovados para o instalador (vínculo aprovado e fornecedor ativo) */
  const vinculosAprovados = (instalador_id) =>
    repo.lista("vinculos", "WHERE instalador_id = ? AND status = 'aprovado' AND fornecedor_id IN (SELECT id FROM contas WHERE tipo = 'fornecedor' AND status = 'ativo')", instalador_id);

  /**
   * Catálogo como o instalador vê. Banca P-13: a visibilidade (todos ou só as tabelas escolhidas) é filtrada no SQL, antes do
   * LIMIT; assim o produto visível depois do 500º invisível aparece, e a página seguinte existe (limite/offset).
   */
  function catalogo(instalador_id, fornecedor_id, { busca = "", categoria = "", codigo = "", limite = 500, offset = 0 } = {}) {
    const v = vinculo(fornecedor_id, instalador_id);
    const f = conta(fornecedor_id);
    if (!v || v.status !== "aprovado" || f?.status !== "ativo") falha(403, "Você ainda não tem vínculo aprovado com este fornecedor.");
    const tabela = tabelaDo(v);
    const termo = `%${busca.trim().toLowerCase()}%`;
    const tid = v.tabela_id ?? "";
    const lista = repo.lista(
      "produtos",
      "WHERE fornecedor_id = ? AND ativo = 1 AND (visibilidade = 'todos' OR (? <> '' AND EXISTS (SELECT 1 FROM json_each(produtos.tabelas) WHERE value = ?))) AND (? = '' OR lower(nome) LIKE ? OR lower(codigo) LIKE ? OR lower(coalesce(marca,'')) LIKE ?) AND (? = '' OR categoria = ?) AND (? = '' OR codigo = ?) ORDER BY categoria, nome, id LIMIT ? OFFSET ?",
      fornecedor_id, tid, tid, busca.trim(), termo, termo, termo, categoria, categoria, codigo, codigo, limite, offset,
    );
    return lista.filter((p) => visivel(p, v)).map((p) => produtoParaInstalador(p, tabela, f));
  }

  /** Comparador: para cada item, os fornecedores vinculados com preço, disponível e prazo (o melhor primeiro) */
  function comparar(instalador_id, { codigo = "", termo = "", quantidade = 1 }) {
    const ofertas = [];
    for (const v of vinculosAprovados(instalador_id)) for (const p of catalogo(instalador_id, v.fornecedor_id, codigo ? { codigo } : { busca: termo })) ofertas.push(p);
    const atende = (o) => o.disponivel >= quantidade;
    ofertas.sort((a, b) => Number(atende(b)) - Number(atende(a)) || a.preco_centavos - b.preco_centavos || a.prazo_dias - b.prazo_dias);
    return ofertas.map((o, i) => ({ ...o, atende_quantidade: atende(o), melhor: i === 0 && atende(o), total_centavos: o.preco_centavos * quantidade }));
  }

  /* ---------- Crédito e bloqueio ---------- */
  /**
   * Crédito de vários vínculos de uma vez (banca P-13: sem uma consulta por vínculo).
   * Banca P-05: para o fornecedor SEM walletId, o que já está comprometido também consome o limite: itens dele em propostas com
   * reserva ativa e em propostas aceitas com cobrança aberta (o título só nasce no pagamento; antes disso, três propostas de
   * R$ 8.000 passavam num limite de R$ 10.000). Com walletId o fornecedor recebe pelo split e o limite não entra.
   */
  function creditos(vinculos) {
    const ids = JSON.stringify(vinculos.map((v) => v.id));
    const tit = new Map(repo.todos(
      "SELECT v.id vid, COALESCE(SUM(t.valor_centavos),0) abertos, COALESCE(SUM(CASE WHEN t.vencimento < ? THEN t.valor_centavos ELSE 0 END),0) vencidos_valor, COALESCE(SUM(CASE WHEN t.vencimento < ? THEN 1 ELSE 0 END),0) vencidos FROM vinculos v JOIN titulos t ON t.fornecedor_id = v.fornecedor_id AND t.instalador_id = v.instalador_id AND t.status = 'aberto' WHERE v.id IN (SELECT value FROM json_each(?)) GROUP BY v.id",
      hoje(), hoje(), ids,
    ).map((x) => [x.vid, x]));
    const comp = new Map(repo.todos(
      `SELECT v.id vid, COALESCE(SUM(i.custo_unit_centavos * i.quantidade),0) n FROM vinculos v
       JOIN contas f ON f.id = v.fornecedor_id AND json_extract(f.config, '$.wallet_cripto') IS NULL
       JOIN propostas p ON p.instalador_id = v.instalador_id AND p.status IN ('enviada','vista','aceita')
       JOIN proposta_itens i ON i.proposta_id = p.id AND i.fornecedor_id = v.fornecedor_id AND i.tipo = 'fornecedor'
       WHERE v.id IN (SELECT value FROM json_each(?))
         AND (EXISTS (SELECT 1 FROM reservas r WHERE r.proposta_id = p.id AND r.fornecedor_id = v.fornecedor_id AND r.status = 'ativa')
              OR (p.status = 'aceita' AND EXISTS (SELECT 1 FROM pagamentos g WHERE g.proposta_id = p.id AND g.status = 'pendente')))
       GROUP BY v.id`,
      ids,
    ).map((x) => [x.vid, x.n]));
    return new Map(vinculos.map((v) => {
      const t = tit.get(v.id) ?? { abertos: 0, vencidos_valor: 0, vencidos: 0 };
      const comprometido = comp.get(v.id) ?? 0;
      return [v.id, {
        limite_centavos: v.limite_credito_centavos,
        em_aberto_centavos: t.abertos,
        comprometido_centavos: comprometido,
        disponivel_centavos: Math.max(0, v.limite_credito_centavos - t.abertos - comprometido),
        vencidos: t.vencidos,
        vencidos_centavos: t.vencidos_valor,
        bloqueio_manual: Boolean(v.bloqueado),
        bloqueio_inadimplencia: t.vencidos > 0,
        bloqueado: Boolean(v.bloqueado) || t.vencidos > 0,
        motivo: v.bloqueado ? v.motivo || "Bloqueio feito pelo fornecedor." : t.vencidos > 0 ? "Há título vencido com este fornecedor." : null,
      }];
    }));
  }
  const credito = (v) => creditos([v]).get(v.id);

  /* ---------- Conta de recebimento (walletId) ---------- */
  /**
   * walletId decifrado. Banca P-10: "não configurado" (devolve "") é diferente de "não deu para decifrar" (troca de MASTER_KEY,
   * restauração parcial, campo corrompido). No segundo caso o dinheiro NÃO pode ir em silêncio para o instalador como título:
   * registra no log e na auditoria, avisa o operador Nexor (uma vez por dia por conta) e recusa a cobrança com 503.
   */
  function walletDe(c) {
    const v = c?.config?.wallet_cripto;
    if (!v) return "";
    try {
      return cofre.decifrar(v);
    } catch (e) {
      console.error(`[wallet] walletId da conta ${c.id} (${nomeConta(c)}) não pôde ser decifrado: ${e.message}`);
      repo.auditar(c.id, "sistema", "wallet_ilegivel", { erro: String(e.message).slice(0, 200) });
      for (const op of repo.lista("contas", "WHERE tipo = 'nexor'")) {
        if (repo.um("SELECT 1 FROM notificacoes WHERE conta_id = ? AND tipo = 'wallet_ilegivel' AND ref = ? AND criado_em > ?", op.id, c.id, agora() - 86400_000)) continue;
        avisar(op.id, "wallet_ilegivel", `O walletId de ${nomeConta(c)} (${c.tipo}) não pôde ser lido: chave mestra trocada ou dado corrompido. As cobranças que dependem dele estão recusadas até o walletId ser cadastrado de novo.`, c.id);
      }
      falha(503, `Não foi possível gerar a cobrança agora: a conta de recebimento ${c.tipo === "fornecedor" ? "de um dos fornecedores" : "do instalador"} está com problema. A Nexor já foi avisada. Tente de novo mais tarde.`, { codigo: "wallet_ilegivel" });
    }
  }

  /* ---------- Proposta: totais ---------- */
  const itensDa = (proposta_id) => repo.lista("proposta_itens", "WHERE proposta_id = ? ORDER BY ordem", proposta_id);
  function totais(p, itens) {
    const subtotal = itens.reduce((s, i) => s + i.preco_unit_centavos * i.quantidade, 0);
    const total = Math.max(0, subtotal - (p.desconto_centavos ?? 0));
    const custoFornecedores = itens.filter((i) => i.tipo === "fornecedor").reduce((s, i) => s + i.custo_unit_centavos * i.quantidade, 0);
    const taxa = Math.round((total * cfg.taxaPlataformaBps) / 10000);
    return { subtotal_centavos: subtotal, total_centavos: total, custo_fornecedores_centavos: custoFornecedores, taxa_plataforma_centavos: taxa };
  }
  /**
   * Banca P-08: rateia o desconto da proposta entre os itens, proporcional ao valor de cada um (maiores restos: os centavos que
   * sobram do arredondamento vão para os itens com a maior fração). A soma dos líquidos é sempre subtotal − desconto.
   */
  function ratearDesconto(itens, desconto = 0) {
    const brutos = itens.map((i) => i.preco_unit_centavos * i.quantidade);
    const subtotal = brutos.reduce((s, b) => s + b, 0);
    const d = Math.min(Math.max(0, desconto ?? 0), subtotal);
    const exato = brutos.map((b) => (subtotal ? (d * b) / subtotal : 0));
    const partes = exato.map(Math.floor);
    let sobra = d - partes.reduce((s, x) => s + x, 0);
    for (const n of exato.map((x, n) => [x - Math.floor(x), n]).sort((a, b) => b[0] - a[0]).map(([, n]) => n)) {
      if (sobra <= 0) break;
      partes[n] += 1;
      sobra -= 1;
    }
    return itens.map((i, n) => ({ ...i, bruto_centavos: brutos[n], desconto_rateado_centavos: partes[n], liquido_centavos: brutos[n] - partes[n] }));
  }
  /** Por fornecedor: soma do custo dos itens dele */
  function porFornecedor(itens) {
    const m = new Map();
    for (const i of itens.filter((x) => x.tipo === "fornecedor")) m.set(i.fornecedor_id, (m.get(i.fornecedor_id) ?? 0) + i.custo_unit_centavos * i.quantidade);
    return m;
  }

  /** Confere e completa os itens de fornecedor (preço da tabela do instalador, vínculo aprovado, visibilidade) */
  function prepararItens(instalador_id, itens) {
    const cacheV = new Map();
    return itens.map((i, ordem) => {
      if (i.tipo !== "fornecedor") return { ...i, ordem, fornecedor_id: null, produto_id: null, codigo: i.codigo ?? null, custo_unit_centavos: i.custo_unit_centavos ?? 0 };
      const p = repo.obter("produtos", i.produto_id);
      if (!p || !p.ativo) falha(400, `Produto não encontrado (item ${ordem + 1}).`);
      if (!cacheV.has(p.fornecedor_id)) cacheV.set(p.fornecedor_id, vinculo(p.fornecedor_id, instalador_id));
      const v = cacheV.get(p.fornecedor_id);
      if (!v || v.status !== "aprovado" || !visivel(p, v)) falha(403, `Produto ${p.codigo} indisponível para você.`);
      return { ...i, ordem, fornecedor_id: p.fornecedor_id, codigo: p.codigo, descricao: i.descricao || p.nome, unidade: p.unidade, foto_url: p.foto_url, custo_unit_centavos: preco(p, tabelaDo(v)) };
    });
  }

  /* ---------- Envio: reserva de estoque ---------- */
  /**
   * Reserva o estoque de todos os itens de fornecedor, de uma vez (transação exclusiva). Recusa se algum fornecedor
   * bloqueou (manual ou título vencido), se faltar estoque, ou se faltar crédito para a parte sem walletId.
   * Duas propostas disputando o último item: o UPDATE condicional só reserva para a primeira.
   */
  function reservar(p, { renovacao = false } = {}) {
    const itens = prepararItens(p.instalador_id, itensDa(p.id));
    if (!itens.length) falha(400, "Inclua pelo menos um item na proposta.");
    const t = totais(p, itens);
    if (t.total_centavos <= 0) falha(400, "O total da proposta precisa ser maior que zero.");
    if (t.total_centavos < t.custo_fornecedores_centavos + t.taxa_plataforma_centavos) falha(400, `O total (${reais(t.total_centavos)}) não cobre o custo dos produtos (${reais(t.custo_fornecedores_centavos)}) mais a taxa da plataforma (${reais(t.taxa_plataforma_centavos)}).`);
    const custos = porFornecedor(itens);
    let prazo = Infinity;
    for (const [fid, custo] of custos) {
      const f = conta(fid);
      const v = vinculo(fid, p.instalador_id);
      if (f?.status !== "ativo" || v?.status !== "aprovado") falha(409, `O vínculo com ${nomeConta(f)} não está ativo.`);
      const c = credito(v);
      if (c.bloqueado) falha(409, `${nomeConta(f)} bloqueou novas reservas: ${c.motivo}`, { codigo: "bloqueado", fornecedor_id: fid });
      if (!f.config.wallet_cripto && custo > c.disponivel_centavos) falha(409, `${nomeConta(f)} ainda não recebe pelo split e seu limite de crédito disponível (${reais(c.disponivel_centavos)}) não cobre ${reais(custo)}.`, { codigo: "credito", fornecedor_id: fid });
      prazo = Math.min(prazo, f.config.prazo_reserva_dias ?? PRAZO_RESERVA_PADRAO);
    }
    if (!Number.isFinite(prazo)) prazo = PRAZO_RESERVA_PADRAO;
    const expira = agora() + prazo * 86400_000;
    for (const i of itens) {
      if (i.tipo !== "fornecedor") continue;
      repo.rodar("UPDATE proposta_itens SET custo_unit_centavos = ?, descricao = ?, codigo = ?, unidade = ?, foto_url = ? WHERE id = ?", i.custo_unit_centavos, i.descricao, i.codigo, i.unidade, i.foto_url, i.id);
      const ok = repo.rodar("UPDATE produtos SET reservado = reservado + ?, atualizado_em = ? WHERE id = ? AND ativo = 1 AND estoque - reservado >= ?", i.quantidade, agora(), i.produto_id, i.quantidade).changes;
      if (!ok) {
        const prod = repo.obter("produtos", i.produto_id);
        falha(409, `Sem estoque suficiente de ${prod.codigo} · ${prod.nome}: disponível ${prod.estoque - prod.reservado}, pedido ${i.quantidade}.`, { codigo: "estoque", produto_id: prod.id });
      }
      repo.inserir("reservas", { proposta_id: p.id, item_id: i.id, fornecedor_id: i.fornecedor_id, produto_id: i.produto_id, quantidade: i.quantidade, status: "ativa", expira_em: expira });
    }
    return { ...t, expira, fornecedores: [...custos.keys()], renovacao };
  }

  /** Devolve ao estoque livre as reservas ativas da proposta */
  function liberarReservas(proposta_id, status = "liberada") {
    for (const r of repo.lista("reservas", "WHERE proposta_id = ? AND status = 'ativa'", proposta_id)) {
      repo.rodar("UPDATE produtos SET reservado = MAX(0, reservado - ?), atualizado_em = ? WHERE id = ?", r.quantidade, agora(), r.produto_id);
      repo.atualizar("reservas", r.id, { status });
    }
  }

  function enviar(p, { autor }) {
    if (p.status !== "rascunho") falha(409, "Só uma proposta em rascunho pode ser enviada.");
    if (!p.cliente_id) falha(400, "Escolha o cliente da proposta.");
    if (p.validade_dia && p.validade_dia < hoje()) falha(400, "A validade da proposta já passou.");
    // Todo serviço precisa do custo (mão de obra, deslocamento): sem ele, a margem e o lucro da proposta ficam errados
    const semCusto = itensDa(p.id).filter((i) => i.tipo === "servico" && !(i.custo_unit_centavos > 0));
    if (semCusto.length) falha(400, `Informe o seu custo ${semCusto.length === 1 ? "no serviço" : "nos serviços"} ${semCusto.map((i) => `"${i.descricao}"`).join(", ")} (mão de obra, deslocamento, material de consumo) para calcular a margem.`, { codigo: "custo_servico" });
    const token = gerarToken(24);
    const r = repo.transacao(() => {
      const atual = repo.obter("propostas", p.id);
      if (atual.status !== "rascunho") falha(409, "Só uma proposta em rascunho pode ser enviada.");
      const res = reservar(atual);
      const cli = repo.obter("clientes", atual.cliente_id);
      repo.atualizar("propostas", p.id, {
        status: "enviada", enviada_em: agora(), reserva_expira_em: res.expira, renovacoes: 0,
        subtotal_centavos: res.subtotal_centavos, total_centavos: res.total_centavos, custo_fornecedores_centavos: res.custo_fornecedores_centavos, taxa_plataforma_centavos: res.taxa_plataforma_centavos,
        obra_cidade: cli?.endereco?.cidade ?? null, obra_uf: cli?.endereco?.uf ?? null,
        token_hash: sha256(token), token_cripto: cofre.cifrar(token), vista_em: null, aceita_em: null, aceite: null, expirada_em: null,
      });
      return res;
    });
    const final = repo.obter("propostas", p.id);
    const inst = conta(p.instalador_id);
    for (const fid of r.fornecedores) {
      const n = itensDa(p.id).filter((i) => i.fornecedor_id === fid).reduce((s, i) => s + i.quantidade, 0);
      avisar(fid, "reserva_nova", `${nomeConta(inst)} enviou a proposta #${final.numero} e reservou ${n} ${n === 1 ? "item" : "itens"} seus (obra em ${final.obra_cidade ?? "?"}/${final.obra_uf ?? "?"}). A reserva vale até ${hojeBR(r.expira).split("-").reverse().join("/")}.`, p.id);
    }
    repo.auditar(p.instalador_id, autor, "proposta_enviada", { proposta_id: p.id, numero: final.numero, total_centavos: final.total_centavos });
    return { proposta: final, token, link: linkProposta(token) };
  }

  /** Renovar a reserva (uma vez). Ainda ativa: estende o prazo. Expirada: reserva o estoque de novo. */
  function renovar(p, { autor }) {
    if ((p.renovacoes ?? 0) >= 1) falha(409, "A reserva desta proposta já foi renovada uma vez.");
    if (!["enviada", "vista", "aceita", "expirada"].includes(p.status)) falha(409, "Esta proposta não tem reserva para renovar.");
    const r = repo.transacao(() => {
      const atual = repo.obter("propostas", p.id);
      if ((atual.renovacoes ?? 0) >= 1) falha(409, "A reserva desta proposta já foi renovada uma vez.");
      const ativas = repo.lista("reservas", "WHERE proposta_id = ? AND status = 'ativa'", p.id);
      const fids = fornecedoresDa(p.id);
      // Banca P-06: renovar também respeita o bloqueio (título vencido ou bloqueio manual do fornecedor)
      for (const fid of fids) {
        const v = vinculo(fid, p.instalador_id);
        if (!v) continue;
        const c = credito(v);
        if (c.bloqueado) falha(409, `${nomeConta(conta(fid))} bloqueou novas reservas: ${c.motivo}`, { codigo: "bloqueado", fornecedor_id: fid });
      }
      const prazo = fids.length ? Math.min(...fids.map((fid) => conta(fid)?.config?.prazo_reserva_dias ?? PRAZO_RESERVA_PADRAO)) : PRAZO_RESERVA_PADRAO;
      if (atual.status === "expirada") {
        const res = reservar(atual, { renovacao: true });
        repo.atualizar("propostas", p.id, { status: atual.aceita_em ? "aceita" : atual.vista_em ? "vista" : "enviada", reserva_expira_em: res.expira, renovacoes: 1, expirada_em: null });
        return { expira: res.expira, fornecedores: res.fornecedores };
      }
      const expira = agora() + prazo * 86400_000;
      for (const x of ativas) repo.atualizar("reservas", x.id, { expira_em: expira });
      repo.atualizar("propostas", p.id, { reserva_expira_em: expira, renovacoes: 1 });
      return { expira, fornecedores: [...new Set(ativas.map((x) => x.fornecedor_id))] };
    });
    const final = repo.obter("propostas", p.id);
    for (const fid of r.fornecedores) avisar(fid, "reserva_renovada", `A reserva da proposta #${final.numero} de ${nomeConta(conta(p.instalador_id))} foi renovada até ${hojeBR(r.expira).split("-").reverse().join("/")}.`, p.id);
    repo.auditar(p.instalador_id, autor, "reserva_renovada", { proposta_id: p.id });
    return final;
  }

  /** Volta para rascunho (libera reservas e invalida o link) ou cancela */
  function encerrar(p, { autor, cancelar }) {
    if (["paga", "cancelada"].includes(p.status)) falha(409, "Esta proposta não pode mais ser alterada.");
    if (!cancelar && p.status === "aceita") falha(409, "O cliente já aceitou esta proposta. Cancele se precisar refazer.");
    if (repo.um("SELECT 1 FROM pagamentos WHERE proposta_id = ? AND status = 'pendente'", p.id) && !cancelar) falha(409, "Há uma cobrança em aberto para esta proposta.");
    repo.transacao(() => {
      liberarReservas(p.id);
      repo.atualizar("propostas", p.id, cancelar ? { status: "cancelada", cancelada_em: agora(), token_hash: null, token_cripto: null } : { status: "rascunho", token_hash: null, token_cripto: null, reserva_expira_em: null, enviada_em: null, vista_em: null, aceita_em: null, aceite: null, expirada_em: null, renovacoes: 0 });
      if (cancelar) repo.rodar("UPDATE pagamentos SET status = 'cancelado', cancelar_asaas = 1, atualizado_em = ? WHERE proposta_id = ? AND status = 'pendente'", agora(), p.id);
    });
    const fornecedores = [...new Set(itensDa(p.id).filter((i) => i.fornecedor_id).map((i) => i.fornecedor_id))];
    if (p.status !== "rascunho") for (const fid of fornecedores) avisar(fid, "reserva_liberada", `A proposta #${p.numero} de ${nomeConta(conta(p.instalador_id))} foi ${cancelar ? "cancelada" : "reaberta para edição"}; a reserva foi liberada.`, p.id);
    repo.auditar(p.instalador_id, autor, cancelar ? "proposta_cancelada" : "proposta_reaberta", { proposta_id: p.id });
    if (cancelar) cancelarNoAsaas().catch(() => {});
    return repo.obter("propostas", p.id);
  }

  const linkProposta = (token) => `${cfg.urlPublica}/p/${token}`;
  const linkOs = (token) => `${cfg.urlPublica}/os/${token}`;
  const tokenDe = (registro) => segredo(registro?.token_cripto);
  const porToken = (tabela, token) => (token && token.length >= 20 && token.length <= 64 ? repo.ler(tabela, repo.um(`SELECT * FROM ${tabela} WHERE token_hash = ?`, sha256(token))) : null);

  /* ---------- Cliente final: ver, aceitar, pagar ---------- */
  function registrarVista(p) {
    if (p.status !== "enviada") return p;
    repo.atualizar("propostas", p.id, { status: "vista", vista_em: agora() });
    const inst = conta(p.instalador_id);
    avisar(p.instalador_id, "proposta_vista", `O cliente abriu a proposta #${p.numero}.`, p.id);
    for (const fid of fornecedoresDa(p.id)) avisar(fid, "proposta_vista", `A proposta #${p.numero} de ${nomeConta(inst)} foi vista pelo cliente.`, p.id);
    return repo.obter("propostas", p.id);
  }
  const fornecedoresDa = (proposta_id) => repo.todos("SELECT DISTINCT fornecedor_id f FROM proposta_itens WHERE proposta_id = ? AND fornecedor_id IS NOT NULL", proposta_id).map((x) => x.f);

  function aceitar(p, { nome, documento, ip }) {
    if (p.status === "aceita" || p.status === "paga") falha(409, "Esta proposta já foi aceita.");
    if (!["enviada", "vista"].includes(p.status)) falha(409, p.status === "expirada" ? "Esta proposta expirou. Fale com o instalador." : "Esta proposta não está disponível.");
    if (p.validade_dia && p.validade_dia < hoje()) falha(409, "A validade desta proposta já passou. Fale com o instalador.");
    const aceite = { nome, documento: documento ? soDigitos(documento) : null, ip: ip || null, em: agora() };
    repo.atualizar("propostas", p.id, { status: "aceita", aceita_em: agora(), aceite, vista_em: p.vista_em ?? agora() });
    repo.auditar(p.instalador_id, `cliente: ${nome}`, "proposta_aceita", { proposta_id: p.id, ip }, ip);
    const inst = conta(p.instalador_id);
    avisar(p.instalador_id, "proposta_aceita", `${nome} aceitou a proposta #${p.numero} (${reais(p.total_centavos)}).`, p.id);
    for (const fid of fornecedoresDa(p.id)) avisar(fid, "proposta_aceita", `A proposta #${p.numero} de ${nomeConta(inst)} foi aceita pelo cliente.`, p.id);
    return repo.obter("propostas", p.id);
  }

  /** Tarifa estimada do Asaas para a cobrança (banca P-04): sai da parte do instalador, igual à calculadora */
  function tarifaAsaas(total, forma = "PIX", parcelas = 1) {
    const t = cfg.asaas.tarifas ?? {};
    if (forma === "CREDIT_CARD") return Math.ceil((total * (parcelas > 1 ? t.cartaoParceladoBps ?? 349 : t.cartaoAvistaBps ?? 299)) / 10000) + (t.cartaoFixoCentavos ?? 49);
    return forma === "BOLETO" ? (t.boletoCentavos ?? 199) : (t.pixCentavos ?? 199);
  }

  /**
   * Divisão do valor: cada fornecedor com walletId recebe o custo dos itens dele (valor fixo); o instalador recebe o restante
   * menos a taxa da plataforma e a tarifa estimada do Asaas; a conta da plataforma fica com taxa + tarifa (o Asaas desconta a tarifa
   * dela). Assim a soma dos splits fixos nunca passa do valor líquido da cobrança.
   */
  function planoDeSplit(p, forma = "PIX", parcelas = 1) {
    const itens = itensDa(p.id);
    const custos = porFornecedor(itens);
    const inst = conta(p.instalador_id);
    const walletInst = walletDe(inst);
    if (!walletInst) falha(409, "O instalador ainda não configurou a conta de recebimento. Fale com ele.", { codigo: "wallet_instalador" });
    const partes = [];
    let comWallet = 0;
    for (const [fid, centavos] of custos) {
      const w = walletDe(conta(fid));
      partes.push({ destino: "fornecedor", conta_id: fid, centavos, via: w ? "split" : "titulo", walletId: w || null });
      if (w) comWallet += centavos;
    }
    const taxa = p.taxa_plataforma_centavos;
    const tarifa = tarifaAsaas(p.total_centavos, forma, parcelas);
    const instalador = p.total_centavos - comWallet - taxa - tarifa;
    if (instalador < 0) falha(409, "O valor da proposta não cobre os repasses e a tarifa do meio de pagamento.");
    partes.push({ destino: "nexor", conta_id: null, centavos: taxa + tarifa, via: "retido", walletId: null, taxa_centavos: taxa, tarifa_asaas_centavos: tarifa });
    partes.push({ destino: "instalador", conta_id: p.instalador_id, centavos: instalador, via: "split", walletId: walletInst });
    return partes;
  }

  /** Cancela no Asaas as cobranças marcadas (substituídas ou de proposta cancelada); o que falhar a rotina tenta de novo */
  async function cancelarNoAsaas() {
    for (const pg of repo.lista("pagamentos", "WHERE cancelar_asaas = 1 LIMIT 50")) {
      try {
        await asaasPlataforma.cancelarCobranca(pg.asaas_id, { parcelado: pg.parcelas > 1 });
        repo.atualizar("pagamentos", pg.id, { cancelar_asaas: 0 });
      } catch (e) {
        console.error("[asaas] cancelar cobrança", pg.id, e.message);
      }
    }
  }
  const pagando = new Set();

  async function pagar(p, opcoes) {
    // Dois cliques em "pagar" ao mesmo tempo não geram duas cobranças (banca P-02)
    if (pagando.has(p.id)) falha(409, "Estamos gerando a sua cobrança. Aguarde alguns segundos.");
    pagando.add(p.id);
    try {
      return await pagarSemConcorrencia(p, opcoes);
    } finally {
      pagando.delete(p.id);
    }
  }

  async function pagarSemConcorrencia(p, { forma, parcelas = 1, documento, email }) {
    p = repo.obter("propostas", p.id);
    if (p.status === "paga") falha(409, "Esta proposta já está paga.");
    if (p.status !== "aceita") falha(409, "Aceite a proposta antes de pagar.");
    if (!p.reserva_expira_em || p.reserva_expira_em <= agora()) falha(409, "A reserva dos produtos venceu. Fale com o instalador para renovar.");
    if (forma !== "CREDIT_CARD") parcelas = 1;
    const aberto = repo.ler("pagamentos", repo.um("SELECT * FROM pagamentos WHERE proposta_id = ? AND status = 'pendente' AND forma = ? AND parcelas = ?", p.id, forma, parcelas));
    if (aberto) return aberto;
    const cli = repo.obter("clientes", p.cliente_id);
    const doc = soDigitos(documento || cli?.documento || p.aceite?.documento || "");
    if (!documentoValido(doc)) falha(400, "Informe um CPF ou CNPJ válido para gerar a cobrança.");
    const partes = planoDeSplit(p, forma, parcelas);
    const cliente = await asaasPlataforma.criarCliente({ nome: p.aceite?.nome || cli?.nome, documento: doc, email: email || cli?.email, telefone: cli?.telefone, referencia: `elo-cliente-${cli?.id}` });
    const cobranca = await asaasPlataforma.criarCobranca({
      cliente: cliente.id, forma, parcelas, valor_centavos: p.total_centavos, vencimento: somarDias(hoje(), cfg.asaas.vencimentoDias),
      descricao: `Proposta #${p.numero} · ${nomeConta(conta(p.instalador_id))}`, referencia: `elo-proposta-${p.id}`,
      split: partes.filter((x) => x.via === "split" && x.walletId).map((x) => ({ walletId: x.walletId, centavos: x.centavos })),
    });
    const novo = repo.transacao(() => {
      // Releitura depois das chamadas ao Asaas: a proposta pode ter sido cancelada ou paga nesse meio tempo
      const atual = repo.obter("propostas", p.id);
      if (atual.status !== "aceita") return { recusada: atual.status };
      // A cobrança anterior (outra forma de pagamento) é cancelada aqui e no Asaas (banca P-01)
      repo.rodar("UPDATE pagamentos SET status = 'cancelado', cancelar_asaas = 1, atualizado_em = ? WHERE proposta_id = ? AND status = 'pendente'", agora(), p.id);
      const pg = repo.inserir("pagamentos", {
        proposta_id: p.id, asaas_id: cobranca.installment ?? cobranca.id, forma, parcelas, valor_centavos: p.total_centavos, status: "pendente",
        link: cobranca.invoiceUrl ?? null, split: partes.map(({ walletId, ...x }) => ({ ...x, wallet: walletId ? `••••${walletId.slice(-4)}` : null })),
      });
      for (const x of partes) repo.inserir("repasses", { pagamento_id: pg.id, proposta_id: p.id, destino: x.destino, conta_id: x.conta_id, valor_centavos: x.centavos, via: x.via, status: "previsto" });
      return pg;
    });
    if (novo.recusada) {
      // A cobrança recém-criada não vale: cancela no Asaas para o cliente não pagar algo que não existe mais
      await asaasPlataforma.cancelarCobranca(cobranca.installment ?? cobranca.id, { parcelado: Boolean(cobranca.installment) }).catch((e) => console.error("[asaas] cancelar cobrança órfã", e.message));
      falha(409, novo.recusada === "paga" ? "Esta proposta já está paga." : "Esta proposta não está mais disponível para pagamento.");
    }
    await cancelarNoAsaas();
    return novo;
  }

  /** Pagamento confirmado (webhook do Asaas): dá baixa nas reservas, registra repasses, cria títulos sem wallet e avisa */
  function confirmarPagamento(asaasId) {
    const pg = repo.ler("pagamentos", repo.um("SELECT * FROM pagamentos WHERE asaas_id = ?", asaasId));
    if (!pg) return { ignorado: "pagamento desconhecido" };
    if (pg.status === "pago") return { ok: true, repetido: true };
    const p = repo.obter("propostas", pg.proposta_id);
    // Cliente pagou uma cobrança substituída ou de proposta cancelada/já paga (banca P-01): registra, NÃO baixa estoque nem
    // gera repasses/títulos de novo, e avisa para estornar
    if (pg.status === "cancelado" || p.status === "cancelada" || (p.status === "paga" && repo.um("SELECT 1 FROM pagamentos WHERE proposta_id = ? AND status = 'pago' AND id <> ?", p.id, pg.id))) {
      repo.atualizar("pagamentos", pg.id, { status: "pago", pago_em: agora(), indevido: 1 });
      repo.rodar("UPDATE repasses SET status = 'cancelado', atualizado_em = ? WHERE pagamento_id = ?", agora(), pg.id);
      repo.auditar(p.instalador_id, "Asaas", "pagamento_indevido", { proposta_id: p.id, pagamento_id: pg.id, valor_centavos: pg.valor_centavos });
      avisar(p.instalador_id, "pagamento_indevido", `Chegou um pagamento de ${reais(pg.valor_centavos)} de uma cobrança que não vale mais (proposta #${p.numero}). Nada foi baixado do estoque. A Nexor vai estornar ao cliente.`, p.id);
      for (const op of repo.lista("contas", "WHERE tipo = 'nexor'")) avisar(op.id, "pagamento_indevido", `Estornar no Asaas: pagamento indevido de ${reais(pg.valor_centavos)} na proposta #${p.numero} (cobrança ${pg.asaas_id}).`, p.id);
      return { ok: true, indevido: true };
    }
    const faltas = [];
    repo.transacao(() => {
      repo.atualizar("pagamentos", pg.id, { status: "pago", pago_em: agora() });
      repo.atualizar("propostas", p.id, { status: "paga", paga_em: agora() });
      const ativas = new Map(repo.lista("reservas", "WHERE proposta_id = ? AND status = 'ativa'", p.id).map((r) => [r.item_id, r]));
      for (const i of itensDa(p.id).filter((x) => x.tipo === "fornecedor")) {
        const r = ativas.get(i.id);
        if (r) {
          repo.rodar("UPDATE produtos SET estoque = estoque - ?, reservado = reservado - ?, atualizado_em = ? WHERE id = ?", r.quantidade, r.quantidade, agora(), r.produto_id);
          repo.atualizar("reservas", r.id, { status: "baixada" });
        } else {
          // Reserva vencida e o cliente pagou mesmo assim: baixa direto se houver estoque livre; senão avisa as duas partes
          const ok = repo.rodar("UPDATE produtos SET estoque = estoque - ?, atualizado_em = ? WHERE id = ? AND estoque - reservado >= ?", i.quantidade, agora(), i.produto_id, i.quantidade).changes;
          if (ok) repo.inserir("reservas", { proposta_id: p.id, item_id: i.id, fornecedor_id: i.fornecedor_id, produto_id: i.produto_id, quantidade: i.quantidade, status: "baixada", expira_em: agora() });
          else faltas.push(i);
        }
      }
      for (const r of repo.lista("repasses", "WHERE pagamento_id = ?", pg.id)) {
        if (r.via === "titulo") {
          const f = conta(r.conta_id);
          repo.inserir("titulos", { fornecedor_id: r.conta_id, instalador_id: p.instalador_id, proposta_id: p.id, descricao: `Produtos da proposta #${p.numero} (pago pelo cliente; fornecedor sem conta de split)`, valor_centavos: r.valor_centavos, vencimento: somarDias(hoje(), f?.config?.prazo_titulo_dias ?? PRAZO_TITULO_PADRAO), status: "aberto", origem: "sem_wallet" });
        } else repo.atualizar("repasses", r.id, { status: "recebido" });
      }
    });
    const inst = conta(p.instalador_id);
    repo.auditar(p.instalador_id, "Asaas", "proposta_paga", { proposta_id: p.id, pagamento_id: pg.id, valor_centavos: pg.valor_centavos });
    avisar(p.instalador_id, "proposta_paga", `Pagamento confirmado da proposta #${p.numero}: ${reais(pg.valor_centavos)}.`, p.id);
    for (const r of repo.lista("repasses", "WHERE pagamento_id = ? AND destino = 'fornecedor'", pg.id))
      avisar(r.conta_id, "proposta_paga", r.via === "split" ? `Proposta #${p.numero} de ${nomeConta(inst)} paga: ${reais(r.valor_centavos)} para você pelo split. Os itens reservados saíram do estoque.` : `Proposta #${p.numero} de ${nomeConta(inst)} paga. Como sua conta de split não está configurada, foi gerado um título de ${reais(r.valor_centavos)} a receber do instalador.`, p.id);
    for (const i of faltas) {
      avisar(i.fornecedor_id, "estoque_insuficiente", `A proposta #${p.numero} foi paga depois do vencimento da reserva e faltou estoque de ${i.codigo} (${i.quantidade}). Combine com ${nomeConta(inst)}.`, p.id);
      avisar(p.instalador_id, "estoque_insuficiente", `A proposta #${p.numero} foi paga, mas o fornecedor não tem mais ${i.quantidade} de ${i.codigo}. Fale com ele.`, p.id);
    }
    return { ok: true, proposta_id: p.id };
  }

  /** Mensalidade de contrato recorrente paga na conta Asaas do próprio instalador */
  function cobrancaContrato(contrato, pay, pago) {
    const existe = repo.um("SELECT id FROM contrato_cobrancas WHERE asaas_id = ?", pay.id);
    const valor = Math.round(Number(pay.value ?? 0) * 100);
    if (existe) {
      if (pago) repo.rodar("UPDATE contrato_cobrancas SET status = 'paga', pago_em = COALESCE(pago_em, ?) WHERE id = ?", agora(), existe.id);
    } else repo.inserir("contrato_cobrancas", { contrato_id: contrato.id, asaas_id: pay.id, valor_centavos: valor || contrato.valor_centavos, vencimento: pay.dueDate ?? null, status: pago ? "paga" : "pendente", pago_em: pago ? agora() : null });
    if (pago && !existe) avisar(contrato.instalador_id, "contrato_pago", `Mensalidade recebida: ${contrato.descricao} (${reais(valor || contrato.valor_centavos)}).`, contrato.id);
    return { ok: true, contrato_id: contrato.id };
  }

  function eventoAsaas(evento, { instaladorId = null } = {}) {
    const pay = evento?.payment ?? {};
    const pago = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED_IN_CASH"].includes(evento?.event);
    if (instaladorId) {
      if (!pay.subscription) return { ignorado: "sem assinatura" };
      const c = repo.ler("contratos", repo.um("SELECT * FROM contratos WHERE asaas_assinatura = ? AND instalador_id = ?", pay.subscription, instaladorId));
      if (!c) return { ignorado: "contrato desconhecido" };
      if (!pago && evento?.event !== "PAYMENT_CREATED") return { ignorado: evento?.event };
      return cobrancaContrato(c, pay, pago);
    }
    const id = pay.installment && repo.um("SELECT 1 FROM pagamentos WHERE asaas_id = ?", pay.installment) ? pay.installment : pay.id;
    if (pago) return confirmarPagamento(id);
    if (["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE", "PAYMENT_AWAITING_CHARGEBACK_REVERSAL"].includes(evento?.event)) return estornarPagamento(id, evento.event);
    if (["PAYMENT_DELETED", "PAYMENT_OVERDUE"].includes(evento?.event)) {
      // Boleto vencido ou cobrança excluída no Asaas: deixa de travar a proposta (pode reabrir ou gerar outra cobrança)
      const pg = repo.ler("pagamentos", repo.um("SELECT * FROM pagamentos WHERE asaas_id = ? AND status = 'pendente'", id));
      if (!pg) return { ignorado: evento.event };
      repo.atualizar("pagamentos", pg.id, { status: "cancelado" });
      repo.rodar("UPDATE repasses SET status = 'cancelado', atualizado_em = ? WHERE pagamento_id = ?", agora(), pg.id);
      return { ok: true, cancelado: true };
    }
    return { ignorado: evento?.event ?? "sem evento" };
  }

  /** Estorno ou contestação (chargeback) de um pagamento já confirmado (banca P-03) */
  function estornarPagamento(asaasId, motivo) {
    const pg = repo.ler("pagamentos", repo.um("SELECT * FROM pagamentos WHERE asaas_id = ?", asaasId));
    if (!pg || pg.status !== "pago" || pg.estornado_em) return { ignorado: "nada a estornar" };
    const p = repo.obter("propostas", pg.proposta_id);
    repo.transacao(() => {
      repo.atualizar("pagamentos", pg.id, { status: "cancelado", estornado_em: agora() });
      repo.rodar("UPDATE repasses SET status = 'cancelado', atualizado_em = ? WHERE pagamento_id = ?", agora(), pg.id);
      // O título "sem wallet" nasceu do pagamento do cliente: sem pagamento, ele não vale (não bloqueia o instalador)
      if (!pg.indevido) repo.rodar("UPDATE titulos SET status = 'cancelado' WHERE proposta_id = ? AND origem = 'sem_wallet' AND status = 'aberto'", p.id);
      if (!pg.indevido && p.status === "paga") repo.atualizar("propostas", p.id, { status: "cancelada", cancelada_em: agora() });
    });
    const inst = conta(p.instalador_id);
    const texto = motivo === "PAYMENT_REFUNDED" ? "foi estornado" : "foi contestado no cartão (chargeback)";
    repo.auditar(p.instalador_id, "Asaas", "pagamento_estornado", { proposta_id: p.id, pagamento_id: pg.id, motivo });
    avisar(p.instalador_id, "pagamento_estornado", `O pagamento da proposta #${p.numero} (${reais(pg.valor_centavos)}) ${texto}. Os repasses foram desfeitos; confira os produtos já entregues.`, p.id);
    if (!pg.indevido) for (const fid of fornecedoresDa(p.id)) avisar(fid, "pagamento_estornado", `O pagamento da proposta #${p.numero} de ${nomeConta(inst)} ${texto}. O repasse dos seus itens foi desfeito pelo Asaas; combine a devolução ou a cobrança dos produtos com o instalador.`, p.id);
    return { ok: true, estornado: true };
  }

  /* ---------- Rotina: expiração de reservas, aviso de vencimento, títulos vencidos ---------- */
  function rotina() {
    // Cobranças que ficaram para cancelar no Asaas (falha de rede na hora): tenta de novo
    cancelarNoAsaas().catch(() => {});
    const r = { expiradas: 0, avisos_vencendo: 0, titulos_vencidos: 0 };
    const vencidas = repo.lista("propostas", "WHERE status IN ('enviada','vista','aceita') AND reserva_expira_em IS NOT NULL AND reserva_expira_em <= ?", agora());
    for (const p of vencidas) {
      // Com cobrança paga a caminho (webhook atrasado), não expira
      if (repo.um("SELECT 1 FROM pagamentos WHERE proposta_id = ? AND status = 'pago'", p.id)) continue;
      repo.transacao(() => {
        liberarReservas(p.id, "expirada");
        repo.atualizar("propostas", p.id, { status: "expirada", expirada_em: agora() });
      });
      r.expiradas++;
      const inst = conta(p.instalador_id);
      avisar(p.instalador_id, "reserva_expirada", `A reserva da proposta #${p.numero} venceu e o estoque foi liberado.${p.renovacoes ? "" : " Você pode renovar uma vez."}`, p.id);
      for (const fid of fornecedoresDa(p.id)) avisar(fid, "reserva_expirada", `A reserva da proposta #${p.numero} de ${nomeConta(inst)} venceu; os itens voltaram ao estoque livre.`, p.id);
    }
    // Reserva vencendo nas próximas 24 h: um aviso só por proposta
    for (const p of repo.lista("propostas", "WHERE status IN ('enviada','vista','aceita') AND reserva_expira_em > ? AND reserva_expira_em <= ?", agora(), agora() + 86400_000)) {
      if (repo.um("SELECT 1 FROM notificacoes WHERE conta_id = ? AND tipo = 'reserva_vencendo' AND ref = ?", p.instalador_id, p.id)) continue;
      avisar(p.instalador_id, "reserva_vencendo", `A reserva da proposta #${p.numero} vence em menos de 24 horas.`, p.id);
      r.avisos_vencendo++;
    }
    // Títulos vencidos: bloqueiam novas reservas (automático) e avisam as duas partes uma vez
    for (const t of repo.lista("titulos", "WHERE status = 'aberto' AND vencimento < ? AND vencido_avisado = 0", hoje())) {
      repo.atualizar("titulos", t.id, { vencido_avisado: true });
      const f = conta(t.fornecedor_id);
      const inst = conta(t.instalador_id);
      avisar(t.fornecedor_id, "titulo_vencido", `Título de ${nomeConta(inst)} venceu em ${t.vencimento.split("-").reverse().join("/")} (${reais(t.valor_centavos)}). Novas reservas dele estão bloqueadas até a baixa.`, t.id);
      avisar(t.instalador_id, "titulo_vencido", `Seu título com ${nomeConta(f)} venceu (${reais(t.valor_centavos)}). Novas reservas com este fornecedor ficam bloqueadas até o pagamento.`, t.id);
      r.titulos_vencidos++;
    }
    return r;
  }

  /* ---------- Score do instalador (visto pelo fornecedor) ---------- */
  /** Score de vários instaladores de uma vez (banca P-13: 5 consultas agrupadas no lugar de 6 por instalador) */
  function scores(fornecedor_id, instalador_ids) {
    const ids = JSON.stringify([...new Set(instalador_ids)]);
    const desde = agora() - 90 * 86400_000;
    const porInst = (sql, ...p) => new Map(repo.todos(sql, ...p).map((x) => [x.inst, x]));
    const geral = porInst("SELECT instalador_id inst, COUNT(*) enviadas, COALESCE(SUM(CASE WHEN status = 'paga' THEN 1 ELSE 0 END),0) pagas FROM propostas WHERE instalador_id IN (SELECT value FROM json_each(?)) AND enviada_em IS NOT NULL GROUP BY instalador_id", ids);
    const comigo = porInst("SELECT instalador_id inst, COUNT(*) enviadas, COALESCE(SUM(CASE WHEN status = 'paga' THEN 1 ELSE 0 END),0) pagas FROM propostas WHERE instalador_id IN (SELECT value FROM json_each(?)) AND enviada_em IS NOT NULL AND id IN (SELECT proposta_id FROM proposta_itens WHERE fornecedor_id = ?) GROUP BY instalador_id", ids, fornecedor_id);
    const tit = porInst("SELECT instalador_id inst, COUNT(*) pagos, COALESCE(SUM(CASE WHEN pago_no_prazo = 1 THEN 1 ELSE 0 END),0) em_dia FROM titulos WHERE fornecedor_id = ? AND instalador_id IN (SELECT value FROM json_each(?)) AND status = 'pago' GROUP BY instalador_id", fornecedor_id, ids);
    const venc = porInst("SELECT instalador_id inst, COUNT(*) n FROM titulos WHERE fornecedor_id = ? AND instalador_id IN (SELECT value FROM json_each(?)) AND status = 'aberto' AND vencimento < ? GROUP BY instalador_id", fornecedor_id, ids, hoje());
    const vol = porInst("SELECT p.instalador_id inst, COALESCE(SUM(i.custo_unit_centavos * i.quantidade),0) v, COUNT(DISTINCT p.id) n FROM proposta_itens i JOIN propostas p ON p.id = i.proposta_id WHERE p.instalador_id IN (SELECT value FROM json_each(?)) AND i.fornecedor_id = ? AND p.status = 'paga' AND p.paga_em >= ? GROUP BY p.instalador_id", ids, fornecedor_id, desde);
    const r = new Map();
    for (const inst of JSON.parse(ids)) {
      const g = geral.get(inst) ?? { enviadas: 0, pagas: 0 };
      const c = comigo.get(inst) ?? { enviadas: 0, pagas: 0 };
      const t = tit.get(inst) ?? { pagos: 0, em_dia: 0 };
      const vencidos = venc.get(inst)?.n ?? 0;
      const v = vol.get(inst) ?? { v: 0, n: 0 };
      const taxaConv = g.enviadas ? g.pagas / g.enviadas : 0;
      const pontualidade = t.pagos + vencidos ? t.em_dia / (t.pagos + vencidos) : 1;
      r.set(inst, {
        score: Math.round(40 * taxaConv + 40 * pontualidade + 20 * Math.min(1, v.v / 5_000_000)),
        conversao: { enviadas: g.enviadas, pagas: g.pagas, taxa_pct: Math.round(taxaConv * 100), com_voce: { enviadas: c.enviadas, pagas: c.pagas } },
        pagamentos: { titulos_pagos: t.pagos, em_dia: t.em_dia, vencidos_abertos: vencidos, pontualidade_pct: Math.round(pontualidade * 100) },
        volume_90d: { centavos: v.v, propostas_pagas: v.n },
      });
    }
    return r;
  }
  const score = (instalador_id, fornecedor_id) => scores(fornecedor_id, [instalador_id]).get(instalador_id);

  return {
    avisar, enviarDireto, vinculo, tabelaDo, preco, visivel, catalogo, comparar, credito, creditos, scores, walletDe, ratearDesconto, itensDa, totais, prepararItens,
    enviar, renovar, encerrar, registrarVista, aceitar, pagar, planoDeSplit, confirmarPagamento, eventoAsaas, rotina, score,
    liberarReservas, tarifaAsaas, estornarPagamento, linkProposta, linkOs, tokenDe, porToken, fornecedoresDa, segredo, nomeConta, produtoParaInstalador, vinculosAprovados,
    formatarReais: reais,
    ocioso: () => fila,
  };
}

export { ErroHttp };
