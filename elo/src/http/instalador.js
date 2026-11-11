/* Rotas do app do INSTALADOR (cookie nx_elo_i). Papéis: dono (tudo) e técnico (só as ordens de serviço dele). */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { calcularPreco } from "../regras/calculadora.js";
import { hojeBR, paraMs, somarMeses } from "../regras/datas.js";
import { cnaesCompativeis } from "../regras/documentos.js";
import { criarAsaas } from "../servicos/adaptadores.js";
import { FORMAS } from "../servicos/negocio.js";
import { gerarToken, mascarar, sha256 } from "../seguranca.js";
import { falha } from "./roteador.js";
import { centavos, dia, documento, email, endereco, id, op, pct, qtd, t, telefone, uf, validar } from "./validacao.js";

/** Modelos de kit por segmento (o sistema procura cada item no catálogo dos fornecedores vinculados) */
export const MODELOS_KIT = [
  { id: "modelo:cftv-4", segmento: "seguranca", nome: "CFTV 4 câmeras", descricao: "DVR 4 canais, 4 câmeras, HD, fonte, cabos e conectores", itens: [{ termo: "dvr 4", quantidade: 1 }, { termo: "câmera", quantidade: 4 }, { termo: "hd", quantidade: 1 }, { termo: "fonte", quantidade: 1 }, { termo: "cabo coaxial", quantidade: 1 }, { termo: "conector bnc", quantidade: 8 }] },
  { id: "modelo:alarme", segmento: "seguranca", nome: "Alarme residencial", descricao: "Central, sensores, sirene e bateria", itens: [{ termo: "central de alarme", quantidade: 1 }, { termo: "sensor", quantidade: 4 }, { termo: "sirene", quantidade: 1 }, { termo: "bateria", quantidade: 1 }] },
  { id: "modelo:quadro", segmento: "eletrica", nome: "Quadro de distribuição", descricao: "Quadro, disjuntores, DR e DPS", itens: [{ termo: "quadro", quantidade: 1 }, { termo: "disjuntor", quantidade: 8 }, { termo: "dr", quantidade: 1 }, { termo: "dps", quantidade: 1 }] },
  { id: "modelo:solar-5", segmento: "solar", nome: "Kit solar 5 kWp", descricao: "Módulos, inversor, estrutura e string box", itens: [{ termo: "módulo", quantidade: 9 }, { termo: "inversor", quantidade: 1 }, { termo: "estrutura", quantidade: 9 }, { termo: "string box", quantidade: 1 }] },
];

const imagemBase64 = z.string().max(3_000_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "envie a imagem como data:image/jpeg;base64,...");
/** Confere os primeiros bytes (a imagem é mesmo JPEG/PNG/WebP) */
function lerImagem(dataUrl, limite) {
  const [, tipo, b64] = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
  const buf = Buffer.from(b64, "base64");
  if (buf.length > limite) falha(413, `Imagem grande demais (máximo ${Math.round(limite / 1024)} KB).`);
  const ok = tipo === "jpeg" ? buf[0] === 0xff && buf[1] === 0xd8 : tipo === "png" ? buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) : buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  if (!ok) falha(400, "O arquivo não é uma imagem válida.");
  return { buf, tipo: `image/${tipo}`, ext: tipo === "jpeg" ? "jpg" : tipo };
}

export function rotasInstalador(h) {
  const { r, repo, cofre, cfg, negocio, agora, auditar, daConta, contaPublica, fiscal, fetchFn } = h;
  const I = (acao) => ({ conta: "instalador", pode: acao });
  const hoje = () => hojeBR(agora());
  const pastaOs = (osId) => join(cfg.pastaDados, "arquivos", "os", osId);

  /* ---------- Conta ---------- */
  r.get("/api/instalador/conta", I("ver"), (ctx) => contaPublica(ctx.conta));
  r.put("/api/instalador/conta", I("configurar"), async (ctx) => {
    const d = validar(z.object({ nome_fantasia: op(120), telefone: telefone.optional(), email: email.optional(), cidade: t(80).optional(), uf: uf.optional(), wallet_id: z.string().trim().regex(/^[\w-]{8,64}$/, "walletId inválido").nullable().optional(), focus_token: op(200), asaas_chave: op(300), inscricao_municipal: op(30), codigo_municipio: op(10), item_lista_servico: op(10), aliquota_iss_pct: pct.optional() }), await ctx.corpo());
    const { wallet_id, focus_token, asaas_chave, inscricao_municipal, codigo_municipio, item_lista_servico, aliquota_iss_pct, ...campos } = d;
    const config = { ...ctx.conta.config };
    const fiscalCfg = { inscricao_municipal, codigo_municipio, item_lista_servico, aliquota_iss_pct };
    for (const [k, v] of Object.entries(fiscalCfg)) if (v !== undefined) config[k] = v;
    if (wallet_id !== undefined) config.wallet_cripto = wallet_id ? cofre.cifrar(wallet_id) : undefined;
    if (focus_token !== undefined) config.focus_token_cripto = focus_token ? cofre.cifrar(focus_token) : undefined;
    if (asaas_chave !== undefined) {
      config.asaas_chave_cripto = asaas_chave ? cofre.cifrar(asaas_chave) : undefined;
      if (asaas_chave && !config.asaas_webhook_cripto) config.asaas_webhook_cripto = cofre.cifrar(gerarToken(24));
    }
    const c = repo.atualizar("contas", ctx.conta.id, { ...campos, config });
    if (wallet_id !== undefined) auditar(ctx, "wallet_alterado", { final: wallet_id ? wallet_id.slice(-4) : null });
    auditar(ctx, "conta_alterada", { campos: Object.keys(d) });
    return { ...contaPublica(c), webhook_contratos: c.config.asaas_webhook_cripto ? { url: `${cfg.urlPublica}/webhook/asaas/instalador/${c.id}`, token: negocio.segredo(c.config.asaas_webhook_cripto) } : null };
  });

  /* ---------- Fornecedores e vínculos ---------- */
  r.get("/api/instalador/fornecedores", I("comercial"), ({ conta }) =>
    repo.lista("contas", "WHERE tipo = 'fornecedor' AND status = 'ativo' ORDER BY razao_social").map((f) => {
      const v = negocio.vinculo(f.id, conta.id);
      return { id: f.id, razao_social: f.razao_social, nome_fantasia: f.nome_fantasia, cidade: f.cidade, uf: f.uf, cnaes_aceitos: f.cnaes, compativel: cnaesCompativeis(conta.cnaes, f.cnaes).length > 0, prazo_reserva_dias: f.config.prazo_reserva_dias ?? 7, vinculo: v ? { id: v.id, status: v.status } : null };
    }),
  );
  const vinculoParaInstalador = (v) => {
    const f = repo.obter("contas", v.fornecedor_id);
    const c = negocio.credito(v);
    return { id: v.id, status: v.status, motivo: v.status === "recusado" ? v.motivo : null, fornecedor: { id: f.id, razao_social: f.razao_social, nome_fantasia: f.nome_fantasia, cidade: f.cidade, uf: f.uf }, tabela: negocio.tabelaDo(v)?.nome ?? null, credito: { limite_centavos: c.limite_centavos, disponivel_centavos: c.disponivel_centavos, em_aberto_centavos: c.em_aberto_centavos, bloqueado: c.bloqueado, motivo: c.motivo } };
  };
  r.get("/api/instalador/vinculos", I("comercial"), ({ conta }) => repo.lista("vinculos", "WHERE instalador_id = ? ORDER BY criado_em DESC", conta.id).map(vinculoParaInstalador));
  r.post("/api/instalador/vinculos", I("comercial"), async (ctx) => {
    const d = validar(z.object({ fornecedor_id: id }), await ctx.corpo());
    const f = repo.obter("contas", d.fornecedor_id);
    if (!f || f.tipo !== "fornecedor" || f.status !== "ativo") falha(404, "Fornecedor não encontrado.");
    const comp = cnaesCompativeis(ctx.conta.cnaes, f.cnaes);
    if (!comp.length) falha(422, `Seu CNPJ não tem nenhum CNAE aceito por ${negocio.nomeConta(f)} (aceitos: ${f.cnaes.join(", ")}).`, { codigo: "cnae" });
    const ja = negocio.vinculo(f.id, ctx.conta.id);
    if (ja && ja.status !== "recusado") falha(409, ja.status === "aprovado" ? "Você já tem vínculo com este fornecedor." : "Seu pedido já está com o fornecedor.");
    const v = ja ? repo.atualizar("vinculos", ja.id, { status: "pendente", cnaes_compativeis: comp, motivo: null, decidido_em: null, decidido_por: null }) : repo.inserir("vinculos", { fornecedor_id: f.id, instalador_id: ctx.conta.id, status: "pendente", cnaes_compativeis: comp });
    auditar(ctx, "vinculo_pedido", { fornecedor_id: f.id, cnaes: comp });
    negocio.avisar(f.id, "vinculo_pedido", `${negocio.nomeConta(ctx.conta)} (${ctx.conta.cidade}/${ctx.conta.uf}) pediu vínculo. CNAE compatível: ${comp.join(", ")}.`, v.id);
    return vinculoParaInstalador(v);
  });
  r.get("/api/instalador/fornecedores/:id/catalogo", I("comercial"), ({ conta, params, query }) => negocio.catalogo(conta.id, params.id, { busca: query.get("busca") ?? "", categoria: query.get("categoria") ?? "" }));
  r.get("/api/instalador/comparar", I("comercial"), ({ conta, query }) => {
    const codigo = (query.get("codigo") ?? "").trim();
    const termo = (query.get("termo") ?? "").trim();
    if (!codigo && termo.length < 2) falha(400, "Informe o código ou pelo menos 2 letras para comparar.");
    return negocio.comparar(conta.id, { codigo, termo, quantidade: Math.max(1, Math.floor(Number(query.get("quantidade") ?? 1)) || 1) });
  });
  // Combinação mais barata para uma lista de itens (pode dividir entre fornecedores; o split vai para cada um)
  r.post("/api/instalador/comparar", I("comercial"), async (ctx) => {
    const d = validar(z.object({ itens: z.array(z.object({ codigo: op(60), termo: op(80), quantidade: qtd })).min(1).max(100) }), await ctx.corpo());
    const linhas = d.itens.map((i) => {
      const ofertas = negocio.comparar(ctx.conta.id, { codigo: i.codigo ?? "", termo: i.termo ?? "", quantidade: i.quantidade });
      const melhor = ofertas.find((o) => o.atende_quantidade) ?? null;
      return { pedido: i, melhor, alternativas: ofertas.slice(0, 5) };
    });
    return { itens: linhas, total_centavos: linhas.reduce((s, l) => s + (l.melhor?.total_centavos ?? 0), 0), fornecedores: [...new Set(linhas.map((l) => l.melhor?.fornecedor_id).filter(Boolean))], faltando: linhas.filter((l) => !l.melhor).map((l) => l.pedido) };
  });
  r.get("/api/instalador/titulos", I("comercial"), ({ conta }) =>
    repo.lista("titulos", "WHERE instalador_id = ? ORDER BY vencimento", conta.id).map((x) => ({ ...x, vencido: x.status === "aberto" && x.vencimento < hoje(), fornecedor: negocio.nomeConta(repo.obter("contas", x.fornecedor_id)) })),
  );

  /* ---------- Kits ---------- */
  const itemKit = z.object({ codigo: op(60), termo: op(80), quantidade: qtd, descricao: op(200) }).refine((i) => i.codigo || i.termo, "informe o código ou o termo de busca");
  const kitCampos = z.object({ nome: t(120), segmento: op(40), descricao: op(300), itens: z.array(itemKit).min(1).max(60) });
  r.get("/api/instalador/kits", I("comercial"), ({ conta }) => [...MODELOS_KIT.map((k) => ({ ...k, modelo: true })), ...repo.lista("kits", "WHERE instalador_id = ? ORDER BY nome", conta.id).map((k) => ({ ...k, modelo: false }))]);
  r.post("/api/instalador/kits", I("comercial"), async (ctx) => repo.inserir("kits", { instalador_id: ctx.conta.id, ...validar(kitCampos, await ctx.corpo()) }));
  r.put("/api/instalador/kits/:id", I("comercial"), async (ctx) => repo.atualizar("kits", daConta("kits", ctx.params.id, "instalador_id", ctx.conta.id, "Kit").id, validar(kitCampos.partial(), await ctx.corpo())));
  r.delete("/api/instalador/kits/:id", I("comercial"), (ctx) => ({ ok: repo.remover("kits", daConta("kits", ctx.params.id, "instalador_id", ctx.conta.id, "Kit").id) }));
  /** Transforma o kit em itens de proposta (melhor oferta de cada item entre os fornecedores vinculados) */
  r.post("/api/instalador/kits/:id/aplicar", I("comercial"), async (ctx) => {
    const kit = MODELOS_KIT.find((k) => k.id === ctx.params.id) ?? daConta("kits", ctx.params.id, "instalador_id", ctx.conta.id, "Kit");
    const d = validar(z.object({ proposta_id: id.optional(), multiplicar: z.number().int().min(1).max(100).optional() }), await ctx.corpo());
    const vezes = d.multiplicar ?? 1;
    const itens = [];
    const faltando = [];
    for (const k of kit.itens) {
      const q = k.quantidade * vezes;
      const ofertas = negocio.comparar(ctx.conta.id, { codigo: k.codigo ?? "", termo: k.codigo ? "" : k.termo, quantidade: q });
      const o = ofertas.find((x) => x.atende_quantidade) ?? ofertas[0];
      if (!o) faltando.push({ ...k, quantidade: q });
      else itens.push({ tipo: "fornecedor", produto_id: o.id, fornecedor_id: o.fornecedor_id, descricao: k.descricao || o.nome, codigo: o.codigo, quantidade: q, custo_unit_centavos: o.preco_centavos, preco_unit_centavos: o.preco_centavos, disponivel: o.disponivel, atende_quantidade: o.atende_quantidade });
    }
    if (d.proposta_id) {
      const p = daConta("propostas", d.proposta_id, "instalador_id", ctx.conta.id, "Proposta");
      if (p.status !== "rascunho") falha(409, "Só dá para incluir itens numa proposta em rascunho.");
      const atuais = negocio.itensDa(p.id);
      const novos = negocio.prepararItens(ctx.conta.id, itens.map(({ disponivel, atende_quantidade, ...i }) => i));
      repo.transacao(() => novos.forEach((i, n) => repo.inserir("proposta_itens", { ...colunasItem(i), proposta_id: p.id, ordem: atuais.length + n })));
      recalcular(p.id);
    }
    return { kit: { id: kit.id, nome: kit.nome }, itens, faltando };
  });

  /* ---------- Clientes do instalador (dados que nunca saem para o fornecedor) ---------- */
  const clienteCampos = z.object({ nome: t(160), documento: documento.optional().nullable(), telefone: telefone.optional(), email: email.optional().nullable(), endereco: endereco.optional() });
  r.get("/api/instalador/clientes", I("comercial"), ({ conta, query }) => {
    const b = `%${(query.get("busca") ?? "").trim().toLowerCase()}%`;
    return repo.lista("clientes", "WHERE instalador_id = ? AND (lower(nome) LIKE ? OR coalesce(documento,'') LIKE ? OR coalesce(telefone,'') LIKE ?) ORDER BY nome LIMIT 500", conta.id, b, b, b);
  });
  r.get("/api/instalador/clientes/:id", I("comercial"), (ctx) => daConta("clientes", ctx.params.id, "instalador_id", ctx.conta.id, "Cliente"));
  r.post("/api/instalador/clientes", I("comercial"), async (ctx) => repo.inserir("clientes", { instalador_id: ctx.conta.id, ...validar(clienteCampos, await ctx.corpo()) }));
  r.put("/api/instalador/clientes/:id", I("comercial"), async (ctx) => {
    const c = daConta("clientes", ctx.params.id, "instalador_id", ctx.conta.id, "Cliente");
    const d = validar(clienteCampos.partial(), await ctx.corpo());
    return repo.atualizar("clientes", c.id, { ...d, ...(d.endereco ? { endereco: { ...c.endereco, ...d.endereco } } : {}) });
  });

  /* ---------- Propostas ---------- */
  const itemProposta = z.discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("fornecedor"), produto_id: id, quantidade: qtd, preco_unit_centavos: centavos, descricao: op(200) }),
    z.object({ tipo: z.literal("proprio"), descricao: t(200), codigo: op(60), unidade: op(10), quantidade: qtd, custo_unit_centavos: centavos.optional(), preco_unit_centavos: centavos }),
    z.object({ tipo: z.literal("servico"), descricao: t(200), unidade: op(10), quantidade: qtd, custo_unit_centavos: centavos.optional(), preco_unit_centavos: centavos }),
  ]);
  const propostaCampos = z.object({ cliente_id: id.nullable().optional(), titulo: t(160), validade_dia: dia.nullable().optional(), condicoes: op(2000), garantia: op(2000), observacoes: op(2000), desconto_centavos: centavos.optional(), itens: z.array(itemProposta).max(200).optional(), chave: z.string().regex(/^[\w-]{16,64}$/).optional() });
  const colunasItem = (i) => ({ ordem: i.ordem, tipo: i.tipo, fornecedor_id: i.fornecedor_id ?? null, produto_id: i.produto_id ?? null, codigo: i.codigo ?? null, descricao: i.descricao, unidade: i.unidade ?? null, foto_url: i.foto_url ?? null, quantidade: i.quantidade, custo_unit_centavos: i.custo_unit_centavos ?? 0, preco_unit_centavos: i.preco_unit_centavos });
  function recalcular(propostaId) {
    const p = repo.obter("propostas", propostaId);
    return repo.atualizar("propostas", propostaId, negocio.totais(p, negocio.itensDa(propostaId)));
  }
  function gravarItens(ctx, p, itens) {
    const prontos = negocio.prepararItens(ctx.conta.id, itens);
    repo.rodar("DELETE FROM proposta_itens WHERE proposta_id = ?", p.id);
    for (const i of prontos) repo.inserir("proposta_itens", { ...colunasItem(i), proposta_id: p.id });
  }
  const minha = (ctx, idp = ctx.params.id) => daConta("propostas", idp, "instalador_id", ctx.conta.id, "Proposta");
  function propostaCompleta(p) {
    const itens = negocio.itensDa(p.id);
    const nomes = new Map();
    const nomeF = (fid) => (nomes.has(fid) ? nomes.get(fid) : nomes.set(fid, negocio.nomeConta(repo.obter("contas", fid))).get(fid));
    const token = negocio.tokenDe(p);
    const lucroBruto = itens.reduce((s, i) => s + (i.preco_unit_centavos - i.custo_unit_centavos) * i.quantidade, 0) - p.desconto_centavos - p.taxa_plataforma_centavos;
    return {
      ...p, token_hash: undefined, token_cripto: undefined,
      link: token ? negocio.linkProposta(token) : null,
      cliente: p.cliente_id ? repo.obter("clientes", p.cliente_id) : null,
      itens: itens.map((i) => ({ ...i, fornecedor: i.fornecedor_id ? nomeF(i.fornecedor_id) : null })),
      margem_estimada_centavos: lucroBruto,
      reservas: repo.lista("reservas", "WHERE proposta_id = ? ORDER BY criado_em", p.id),
      pagamentos: repo.lista("pagamentos", "WHERE proposta_id = ? ORDER BY criado_em DESC", p.id),
      repasses: repo.lista("repasses", "WHERE proposta_id = ? AND status <> 'cancelado' ORDER BY destino", p.id).map((x) => ({ ...x, conta: x.conta_id && x.destino === "fornecedor" ? nomeF(x.conta_id) : null })),
      notas: repo.lista("notas", "WHERE proposta_id = ? AND conta_id = ?", p.id, p.instalador_id),
    };
  }
  r.get("/api/instalador/propostas", I("comercial"), ({ conta, query }) => {
    const st = query.get("status") ?? "";
    return repo.lista("propostas", "WHERE instalador_id = ? AND (? = '' OR status = ?) ORDER BY numero DESC LIMIT 500", conta.id, st, st).map((p) => ({ ...p, token_hash: undefined, token_cripto: undefined, cliente: p.cliente_id ? repo.obter("clientes", p.cliente_id)?.nome : null }));
  });
  r.post("/api/instalador/propostas", I("comercial"), async (ctx) => {
    const d = validar(propostaCampos, await ctx.corpo());
    if (d.cliente_id) daConta("clientes", d.cliente_id, "instalador_id", ctx.conta.id, "Cliente");
    const { itens = [], ...campos } = d;
    // O mesmo rascunho enviado de duas abas (ou reenviado com rede lenta) devolve a proposta que já existe
    const existente = d.chave ? repo.ler("propostas", repo.um("SELECT * FROM propostas WHERE instalador_id = ? AND chave = ?", ctx.conta.id, d.chave)) : null;
    if (existente) return propostaCompleta(existente);
    const p = repo.transacao(() => {
      const nova = repo.inserir("propostas", { instalador_id: ctx.conta.id, numero: repo.proximoNumero("propostas", ctx.conta.id), status: "rascunho", ...campos });
      gravarItens(ctx, nova, itens);
      return recalcular(nova.id);
    });
    return propostaCompleta(p);
  });
  r.get("/api/instalador/propostas/:id", I("comercial"), (ctx) => propostaCompleta(minha(ctx)));
  r.put("/api/instalador/propostas/:id", I("comercial"), async (ctx) => {
    const p = minha(ctx);
    if (p.status !== "rascunho") falha(409, "Só uma proposta em rascunho pode ser editada. Reabra a proposta para editar.");
    const d = validar(propostaCampos.partial(), await ctx.corpo());
    if (d.cliente_id) daConta("clientes", d.cliente_id, "instalador_id", ctx.conta.id, "Cliente");
    const { itens, ...campos } = d;
    const n = repo.transacao(() => {
      repo.atualizar("propostas", p.id, campos);
      if (itens) gravarItens(ctx, p, itens);
      return recalcular(p.id);
    });
    return propostaCompleta(n);
  });
  r.post("/api/instalador/propostas/:id/enviar", I("comercial"), async (ctx) => {
    const d = validar(z.object({ avisar_cliente: z.boolean().optional() }), await ctx.corpo());
    const res = negocio.enviar(minha(ctx), { autor: ctx.usuario.nome });
    if (d.avisar_cliente) {
      const cli = repo.obter("clientes", res.proposta.cliente_id);
      const texto = `Olá, ${cli.nome.split(" ")[0]}! ${negocio.nomeConta(ctx.conta)} enviou sua proposta "${res.proposta.titulo}": ${res.link}`;
      if (cli.telefone) negocio.enviarDireto(ctx.conta.id, "whatsapp", cli.telefone, texto);
      if (cli.email) negocio.enviarDireto(ctx.conta.id, "email", cli.email, texto);
    }
    return { ...propostaCompleta(res.proposta), link: res.link };
  });
  r.post("/api/instalador/propostas/:id/renovar", I("comercial"), (ctx) => propostaCompleta(negocio.renovar(minha(ctx), { autor: ctx.usuario.nome })));
  r.post("/api/instalador/propostas/:id/reabrir", I("comercial"), (ctx) => propostaCompleta(negocio.encerrar(minha(ctx), { autor: ctx.usuario.nome, cancelar: false })));
  r.post("/api/instalador/propostas/:id/cancelar", I("comercial"), (ctx) => propostaCompleta(negocio.encerrar(minha(ctx), { autor: ctx.usuario.nome, cancelar: true })));
  r.post("/api/instalador/propostas/:id/duplicar", I("comercial"), (ctx) => {
    const p = minha(ctx);
    const n = repo.transacao(() => {
      const nova = repo.inserir("propostas", { instalador_id: ctx.conta.id, numero: repo.proximoNumero("propostas", ctx.conta.id), status: "rascunho", cliente_id: p.cliente_id, titulo: `${p.titulo} (cópia)`, condicoes: p.condicoes, garantia: p.garantia, observacoes: p.observacoes, desconto_centavos: p.desconto_centavos });
      for (const i of negocio.itensDa(p.id)) repo.inserir("proposta_itens", { ...colunasItem(i), proposta_id: nova.id });
      return recalcular(nova.id);
    });
    return propostaCompleta(n);
  });

  // NFS-e do serviço do instalador para o cliente final (dados preenchidos pela proposta)
  r.post("/api/instalador/propostas/:id/nfse", I("comercial"), async (ctx) => {
    const p = minha(ctx);
    if (p.status !== "paga") falha(409, "A NFS-e sai depois que a proposta for paga.");
    const ref = `elo-nfse-${p.id.slice(0, 13)}`;
    const ja = repo.ler("notas", repo.um("SELECT * FROM notas WHERE ref = ?", ref));
    if (ja) return ja;
    const cli = repo.obter("clientes", p.cliente_id);
    const servicos = negocio.itensDa(p.id).filter((i) => i.tipo === "servico");
    if (!servicos.length) falha(409, "Esta proposta não tem serviços para a NFS-e.");
    const valor = servicos.reduce((s, i) => s + i.preco_unit_centavos * i.quantidade, 0);
    const c = ctx.conta.config;
    const doc = cli?.documento ?? "";
    const dados = {
      data_emissao: new Date(agora()).toISOString(),
      prestador: { cnpj: ctx.conta.cnpj, inscricao_municipal: c.inscricao_municipal ?? null, codigo_municipio: c.codigo_municipio ?? null },
      tomador: { ...(doc.length === 11 ? { cpf: doc } : { cnpj: doc }), razao_social: cli?.nome, email: cli?.email ?? undefined, telefone: cli?.telefone ?? undefined, endereco: cli?.endereco ?? {} },
      servico: { aliquota: c.aliquota_iss_pct ?? 0, discriminacao: servicos.map((i) => `${i.quantidade}x ${i.descricao}`).join("; ") + ` · Proposta #${p.numero}`, iss_retido: false, item_lista_servico: c.item_lista_servico ?? null, valor_servicos: valor / 100 },
    };
    const res = await fiscal.emitir({ token: negocio.segredo(c.focus_token_cripto), tipo: "nfse", ref, dados });
    const nota = repo.inserir("notas", { conta_id: ctx.conta.id, proposta_id: p.id, tipo: "nfse", ref, status: res.status, numero: res.numero, url: res.url, simulada: res.simulada, resposta: res.simulada ? { simulada: true } : res.dados });
    auditar(ctx, "nfse_emitida", { proposta_id: p.id, ref, simulada: res.simulada });
    return nota;
  });

  /* ---------- Calculadora ---------- */
  r.post("/api/instalador/calculadora", I("comercial"), async (ctx) => {
    const d = validar(
      z.object({
        custos: z.object({ produtos_centavos: centavos.optional(), mao_obra_centavos: centavos.optional(), deslocamento_centavos: centavos.optional(), outros_centavos: centavos.optional() }),
        margem_pct: z.number().min(0).max(90),
        regime: z.discriminatedUnion("tipo", [z.object({ tipo: z.literal("mei") }), z.object({ tipo: z.literal("simples"), anexo: z.enum(["I", "II", "III", "IV", "V"]), aliquota_pct: z.number().min(0).max(33) }), z.object({ tipo: z.literal("presumido") })]),
        iss_pct: z.number().min(0).max(5).optional(),
        taxa_meio_pct: z.number().min(0).max(20).optional(),
        taxa_meio_fixa_centavos: centavos.optional(),
        preco_centavos: centavos.optional(),
      }),
      await ctx.corpo(),
    );
    const r2 = calcularPreco({ ...d, taxa_plataforma_pct: cfg.taxaPlataformaBps / 100 });
    if (r2.erro) falha(400, r2.erro);
    return { ...r2, taxa_plataforma_pct: cfg.taxaPlataformaBps / 100 };
  });

  /* ---------- Ordens de serviço ---------- */
  const STATUS_OS = ["agendada", "a_caminho", "em_execucao", "concluida", "cancelada"];
  const daOs = (ctx) => {
    const o = daConta("ordens", ctx.params.id, "instalador_id", ctx.conta.id, "Ordem de serviço");
    if (ctx.usuario.papel === "tecnico" && o.tecnico_id !== ctx.usuario.id) falha(404, "Ordem de serviço não encontrada.");
    return o;
  };
  const tecnicoValido = (ctx, tid) => {
    if (!tid) return null;
    const u = repo.obter("usuarios", tid);
    if (!u || u.conta_id !== ctx.conta.id || !u.ativo) falha(400, "Técnico não encontrado na sua equipe.");
    return u.id;
  };
  function osCompleta(o, { publica = false } = {}) {
    const cli = o.cliente_id ? repo.obter("clientes", o.cliente_id) : null;
    const tec = o.tecnico_id ? repo.obter("usuarios", o.tecnico_id) : null;
    const token = negocio.tokenDe(o);
    const base = {
      id: o.id, numero: o.numero, titulo: o.titulo, descricao: o.descricao, status: o.status, agendada_para: o.agendada_para,
      checklist: o.checklist, series: o.series, assinado: Boolean(o.assinatura_arquivo), assinado_por: o.assinado_por, assinado_em: o.assinado_em,
      historico: repo.lista("os_historico", "WHERE os_id = ? ORDER BY criado_em", o.id).map((x) => ({ status: x.status, nota: x.nota, em: x.criado_em, autor: publica ? undefined : x.autor })),
      fotos: repo.lista("os_fotos", "WHERE os_id = ? ORDER BY criado_em", o.id).map((f) => ({ id: f.id, legenda: f.legenda, tipo: f.tipo, criado_em: f.criado_em })),
    };
    if (publica) return { ...base, tecnico: tec ? tec.nome.split(" ")[0] : null, empresa: negocio.nomeConta(repo.obter("contas", o.instalador_id)), cliente: cli ? cli.nome.split(" ")[0] : null };
    return { ...base, proposta_id: o.proposta_id, tecnico: tec ? { id: tec.id, nome: tec.nome } : null, cliente: cli, link: token ? negocio.linkOs(token) : null, criado_em: o.criado_em, atualizado_em: o.atualizado_em };
  }
  const historico = (o, status, autor, nota = null) => repo.inserir("os_historico", { os_id: o.id, status, autor, nota });
  const quando = z.object({ agendada_dia: dia.optional(), agendada_hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use o formato HH:MM").optional() });
  const instante = (d) => (d.agendada_dia ? paraMs(d.agendada_dia, d.agendada_hora ?? "08:00") : undefined);

  r.get("/api/instalador/os", I("os"), (ctx) => {
    const st = ctx.query.get("status") ?? "";
    const soMinhas = ctx.usuario.papel === "tecnico" ? ctx.usuario.id : "";
    return repo.lista("ordens", "WHERE instalador_id = ? AND (? = '' OR status = ?) AND (? = '' OR tecnico_id = ?) ORDER BY COALESCE(agendada_para, criado_em) LIMIT 500", ctx.conta.id, st, st, soMinhas, soMinhas).map((o) => osCompleta(o));
  });
  r.post("/api/instalador/os", I("comercial"), async (ctx) => {
    const d = validar(quando.extend({ proposta_id: id.optional(), cliente_id: id.optional(), tecnico_id: id.optional().nullable(), titulo: t(160).optional(), descricao: op(2000), checklist: z.array(t(200)).max(60).optional() }), await ctx.corpo());
    let p = null;
    if (d.proposta_id) {
      p = minha(ctx, d.proposta_id);
      if (p.status !== "paga") falha(409, "A OS a partir de proposta exige a proposta paga. Para serviço avulso, crie sem proposta.");
    }
    const clienteId = p?.cliente_id ?? d.cliente_id;
    if (!clienteId) falha(400, "Escolha o cliente da OS.");
    daConta("clientes", clienteId, "instalador_id", ctx.conta.id, "Cliente");
    const itens = p ? negocio.itensDa(p.id) : [];
    const checklist = (d.checklist ?? itens.filter((i) => i.tipo !== "servico").map((i) => `Instalar ${i.quantidade}x ${i.descricao}`).concat(["Testar o sistema com o cliente", "Orientar o cliente sobre o uso"])).map((item) => ({ item, feito: false }));
    const series = itens.filter((i) => i.tipo === "fornecedor").flatMap((i) => Array.from({ length: Math.min(i.quantidade, 20) }, () => ({ produto: i.descricao, codigo: i.codigo, serie: null, garantia_meses: 12 })));
    const token = gerarToken(24);
    const o = repo.transacao(() => {
      const nova = repo.inserir("ordens", { instalador_id: ctx.conta.id, numero: repo.proximoNumero("ordens", ctx.conta.id), proposta_id: p?.id ?? null, cliente_id: clienteId, tecnico_id: tecnicoValido(ctx, d.tecnico_id), titulo: d.titulo ?? p?.titulo ?? "Serviço", descricao: d.descricao ?? null, agendada_para: instante(d) ?? null, status: "agendada", checklist, series, token_hash: sha256(token), token_cripto: cofre.cifrar(token) });
      historico(nova, "agendada", ctx.usuario.nome, "OS aberta");
      return nova;
    });
    if (o.tecnico_id) negocio.avisar(ctx.conta.id, "os_atribuida", `OS #${o.numero} atribuída a ${repo.obter("usuarios", o.tecnico_id).nome}.`, o.id);
    return osCompleta(o);
  });
  r.get("/api/instalador/os/:id", I("os"), (ctx) => osCompleta(daOs(ctx)));
  r.put("/api/instalador/os/:id", I("comercial"), async (ctx) => {
    const o = daOs(ctx);
    const d = validar(quando.extend({ tecnico_id: id.optional().nullable(), titulo: t(160).optional(), descricao: op(2000) }), await ctx.corpo());
    const { agendada_dia, agendada_hora, ...campos } = d;
    if ("tecnico_id" in d) campos.tecnico_id = tecnicoValido(ctx, d.tecnico_id);
    const ms = instante(d);
    return osCompleta(repo.atualizar("ordens", o.id, { ...campos, ...(ms ? { agendada_para: ms } : {}) }));
  });
  r.post("/api/instalador/os/:id/status", I("os"), async (ctx) => {
    const o = daOs(ctx);
    const d = validar(z.object({ status: z.enum(STATUS_OS), nota: op(500) }), await ctx.corpo());
    if (["concluida", "cancelada"].includes(o.status)) falha(409, "Esta OS já foi encerrada.");
    if (d.status === "cancelada" && ctx.usuario.papel === "tecnico") falha(403, "Só o dono cancela uma OS.");
    if (d.status === o.status) falha(409, "A OS já está nesta situação.");
    const n = repo.transacao(() => {
      historico(o, d.status, ctx.usuario.nome, d.nota ?? null);
      return repo.atualizar("ordens", o.id, { status: d.status });
    });
    auditar(ctx, "os_status", { os_id: o.id, de: o.status, para: d.status });
    return osCompleta(n);
  });
  r.put("/api/instalador/os/:id/checklist", I("os"), async (ctx) => {
    const o = daOs(ctx);
    const d = validar(z.object({ checklist: z.array(z.object({ item: t(200), feito: z.boolean() })).max(60) }), await ctx.corpo());
    return osCompleta(repo.atualizar("ordens", o.id, d));
  });
  r.put("/api/instalador/os/:id/series", I("os"), async (ctx) => {
    const o = daOs(ctx);
    const d = validar(z.object({ series: z.array(z.object({ produto: t(200), codigo: op(60), serie: op(80), garantia_meses: z.number().int().min(0).max(120).optional() })).max(200) }), await ctx.corpo());
    const base = hoje();
    const series = d.series.map((s) => ({ ...s, garantia_ate: s.serie && s.garantia_meses ? somarMeses(base, s.garantia_meses) : null }));
    auditar(ctx, "os_series", { os_id: o.id, quantidade: series.filter((s) => s.serie).length });
    return osCompleta(repo.atualizar("ordens", o.id, { series }));
  });
  r.post("/api/instalador/os/:id/fotos", { ...I("os"), limite: 4 * 1024 * 1024 }, async (ctx) => {
    const o = daOs(ctx);
    const d = validar(z.object({ imagem: imagemBase64, legenda: op(200) }), await ctx.corpo());
    if (repo.um("SELECT COUNT(*) n FROM os_fotos WHERE os_id = ?", o.id).n >= cfg.uploads.fotosPorOs) falha(409, `No máximo ${cfg.uploads.fotosPorOs} fotos por OS.`);
    const img = lerImagem(d.imagem, cfg.uploads.fotoMaxBytes);
    const f = repo.inserir("os_fotos", { os_id: o.id, arquivo: "pendente", tipo: img.tipo, tamanho: img.buf.length, legenda: d.legenda ?? null });
    mkdirSync(pastaOs(o.id), { recursive: true });
    const arquivo = `${f.id}.${img.ext}`;
    writeFileSync(join(pastaOs(o.id), arquivo), img.buf, { mode: 0o600 });
    repo.rodar("UPDATE os_fotos SET arquivo = ? WHERE id = ?", arquivo, f.id);
    return osCompleta(o);
  });
  r.get("/api/instalador/os/:id/fotos/:foto", I("os"), (ctx) => {
    const o = daOs(ctx);
    servirFoto(ctx.res, o, ctx.params.foto);
  });
  r.post("/api/instalador/os/:id/assinatura", { ...I("os"), limite: 1024 * 1024 }, async (ctx) => {
    const o = daOs(ctx);
    const d = validar(z.object({ imagem: imagemBase64, nome: t(160) }), await ctx.corpo());
    // Banca P-11: a assinatura do cliente é a prova do serviço; depois de feita, não se troca
    if (o.assinatura_arquivo) falha(409, `Esta OS já foi assinada por ${o.assinado_por ?? "o cliente"}.`);
    const img = lerImagem(d.imagem, cfg.uploads.assinaturaMaxBytes);
    mkdirSync(pastaOs(o.id), { recursive: true });
    const arquivo = `assinatura.${img.ext}`;
    writeFileSync(join(pastaOs(o.id), arquivo), img.buf, { mode: 0o600 });
    const n = repo.atualizar("ordens", o.id, { assinatura_arquivo: arquivo, assinado_por: d.nome, assinado_em: agora() });
    historico(o, o.status, ctx.usuario.nome, `Assinado por ${d.nome}`);
    auditar(ctx, "os_assinada", { os_id: o.id, ip: ctx.ip });
    return osCompleta(n);
  });
  function servirAssinatura(res, o) {
    if (!o.assinatura_arquivo) falha(404, "OS sem assinatura.");
    res.writeHead(200, { "Content-Type": o.assinatura_arquivo.endsWith(".png") ? "image/png" : o.assinatura_arquivo.endsWith(".webp") ? "image/webp" : "image/jpeg", "Cache-Control": "private, no-store" });
    res.end(readFileSync(join(pastaOs(o.id), o.assinatura_arquivo)));
  }
  h.servirAssinatura = servirAssinatura;
  r.get("/api/instalador/os/:id/assinatura", I("os"), (ctx) => servirAssinatura(ctx.res, daOs(ctx)));
  // Todas as notas fiscais (NFS-e) da conta, da mais nova para a mais antiga
  r.get("/api/instalador/notas", I("comercial"), (ctx) => repo.lista("notas", "WHERE conta_id = ? ORDER BY criado_em DESC LIMIT 300", ctx.conta.id));
  function servirFoto(res, o, fotoId) {
    const f = repo.ler("os_fotos", repo.um("SELECT * FROM os_fotos WHERE id = ? AND os_id = ?", fotoId, o.id));
    if (!f || f.arquivo === "pendente") falha(404, "Foto não encontrada.");
    res.writeHead(200, { "Content-Type": f.tipo, "Cache-Control": "private, max-age=3600", "Content-Security-Policy": "default-src 'none'" });
    res.end(readFileSync(join(pastaOs(o.id), f.arquivo)));
  }
  h.osPublica = (o) => osCompleta(o, { publica: true });
  h.servirFoto = servirFoto;

  /* ---------- Contratos recorrentes (Asaas do próprio instalador, sem split) ---------- */
  const asaasDo = (c) => criarAsaas({ fetchFn, url: cfg.asaas.url, chave: negocio.segredo(c.config.asaas_chave_cripto) });
  r.get("/api/instalador/contratos", I("comercial"), ({ conta }) => repo.lista("contratos", "WHERE instalador_id = ? ORDER BY criado_em DESC", conta.id).map((c) => ({ ...c, cliente: repo.obter("clientes", c.cliente_id)?.nome, cobrancas: repo.lista("contrato_cobrancas", "WHERE contrato_id = ? ORDER BY vencimento DESC LIMIT 24", c.id) })));
  r.post("/api/instalador/contratos", I("comercial"), async (ctx) => {
    const d = validar(z.object({ cliente_id: id, descricao: t(200), valor_centavos: centavos.refine((v) => v >= 500, "mínimo de R$ 5,00"), dia_vencimento: z.number().int().min(1).max(28), inicio: dia.optional() }), await ctx.corpo());
    const cli = daConta("clientes", d.cliente_id, "instalador_id", ctx.conta.id, "Cliente");
    if (!cli.documento) falha(400, "Cadastre o CPF/CNPJ do cliente para cobrar pelo Asaas.");
    if (!ctx.conta.config.asaas_chave_cripto) falha(409, "Cadastre a chave da sua conta Asaas em Configurações para criar contratos recorrentes.");
    const a = asaasDo(ctx.conta);
    const base = d.inicio ?? hoje();
    let prox = `${base.slice(0, 8)}${String(d.dia_vencimento).padStart(2, "0")}`;
    if (prox < base) prox = somarMeses(prox, 1);
    const cliente = await a.criarCliente({ nome: cli.nome, documento: cli.documento, email: cli.email, telefone: cli.telefone, referencia: `elo-cliente-${cli.id}` });
    const ass = await a.criarAssinatura({ cliente: cliente.id, valor_centavos: d.valor_centavos, proximo_vencimento: prox, descricao: d.descricao, referencia: `elo-contrato-${ctx.conta.id}` });
    const c = repo.inserir("contratos", { instalador_id: ctx.conta.id, cliente_id: cli.id, descricao: d.descricao, valor_centavos: d.valor_centavos, dia_vencimento: d.dia_vencimento, inicio: prox, status: "ativo", asaas_cliente: cliente.id, asaas_assinatura: ass.id });
    auditar(ctx, "contrato_criado", { contrato_id: c.id, valor_centavos: c.valor_centavos });
    return c;
  });
  r.post("/api/instalador/contratos/:id/cancelar", I("comercial"), async (ctx) => {
    const c = daConta("contratos", ctx.params.id, "instalador_id", ctx.conta.id, "Contrato");
    if (c.status !== "ativo") falha(409, "Este contrato já foi cancelado.");
    if (c.asaas_assinatura) await asaasDo(ctx.conta).cancelarAssinatura(c.asaas_assinatura);
    auditar(ctx, "contrato_cancelado", { contrato_id: c.id });
    return repo.atualizar("contratos", c.id, { status: "cancelado", cancelado_em: agora() });
  });

  /* ---------- Painel e notificações ---------- */
  r.get("/api/instalador/painel", I("ver"), ({ conta, usuario }) => {
    const n = (sql, ...p) => repo.um(sql, ...p).n;
    if (usuario.papel === "tecnico") return { os_hoje: n("SELECT COUNT(*) n FROM ordens WHERE tecnico_id = ? AND agendada_para >= ? AND agendada_para < ?", usuario.id, paraMs(hoje()), paraMs(hoje()) + 86400_000), os_abertas: n("SELECT COUNT(*) n FROM ordens WHERE tecnico_id = ? AND status NOT IN ('concluida','cancelada')", usuario.id) };
    const porStatus = Object.fromEntries(repo.todos("SELECT status, COUNT(*) n FROM propostas WHERE instalador_id = ? GROUP BY status", conta.id).map((x) => [x.status, x.n]));
    return {
      propostas: porStatus,
      vendido_30d_centavos: n("SELECT COALESCE(SUM(total_centavos),0) n FROM propostas WHERE instalador_id = ? AND status = 'paga' AND paga_em >= ?", conta.id, agora() - 30 * 86400_000),
      recebido_30d_centavos: n("SELECT COALESCE(SUM(valor_centavos),0) n FROM repasses WHERE destino = 'instalador' AND conta_id = ? AND status = 'recebido' AND atualizado_em >= ?", conta.id, agora() - 30 * 86400_000),
      reservas_vencendo: n("SELECT COUNT(*) n FROM propostas WHERE instalador_id = ? AND status IN ('enviada','vista','aceita') AND reserva_expira_em <= ?", conta.id, agora() + 2 * 86400_000),
      os_abertas: n("SELECT COUNT(*) n FROM ordens WHERE instalador_id = ? AND status NOT IN ('concluida','cancelada')", conta.id),
      titulos_abertos_centavos: n("SELECT COALESCE(SUM(valor_centavos),0) n FROM titulos WHERE instalador_id = ? AND status = 'aberto'", conta.id),
      titulos_vencidos: n("SELECT COUNT(*) n FROM titulos WHERE instalador_id = ? AND status = 'aberto' AND vencimento < ?", conta.id, hoje()),
      contratos_ativos: n("SELECT COUNT(*) n FROM contratos WHERE instalador_id = ? AND status = 'ativo'", conta.id),
      recorrente_mensal_centavos: n("SELECT COALESCE(SUM(valor_centavos),0) n FROM contratos WHERE instalador_id = ? AND status = 'ativo'", conta.id),
      wallet: Boolean(conta.config.wallet_cripto),
      nao_lidas: n("SELECT COUNT(*) n FROM notificacoes WHERE conta_id = ? AND lida = 0", conta.id),
    };
  });
  r.get("/api/instalador/notificacoes", I("comercial"), ({ conta }) => repo.lista("notificacoes", "WHERE conta_id = ? ORDER BY criado_em DESC LIMIT 200", conta.id));
  r.post("/api/instalador/notificacoes/lidas", I("comercial"), async (ctx) => {
    const d = validar(z.object({ ids: z.array(id).max(500).optional() }), await ctx.corpo());
    if (d.ids?.length) for (const x of d.ids) repo.rodar("UPDATE notificacoes SET lida = 1 WHERE id = ? AND conta_id = ?", x, ctx.conta.id);
    else repo.rodar("UPDATE notificacoes SET lida = 1 WHERE conta_id = ?", ctx.conta.id);
    return { ok: true };
  });
  r.get("/api/instalador/envios", I("comercial"), ({ conta }) => repo.lista("envios", "WHERE conta_id = ? ORDER BY criado_em DESC LIMIT 100", conta.id));
  r.get("/api/instalador/auditoria", I("auditoria"), ({ conta }) => repo.lista("auditoria", "WHERE conta_id = ? ORDER BY criado_em DESC LIMIT 300", conta.id));
  h.formas = FORMAS;
  h.mascarar = mascarar;
}
