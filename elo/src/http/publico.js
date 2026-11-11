/* Rotas públicas (sem login): proposta do cliente final (/p/:token) e acompanhamento da OS (/os/:token).
   O cliente vê o que é dele (itens com preço de venda, condições, garantia) e nunca o custo nem quem é o fornecedor. */

import { z } from "zod";
import { cnaesCompativeis, mascararDoc } from "../regras/documentos.js";
import { FORMAS } from "../servicos/negocio.js";
import { falha } from "./roteador.js";
import { documento, email, t, validar } from "./validacao.js";

export function rotasPublicas(h) {
  const { r, repo, negocio, cfg, agora, conferirLimite, contarTentativa, limitar, cnpjs } = h;
  const P = { publico: true };

  /** Token errado conta como tentativa (por IP): dificulta varrer tokens */
  function buscar(tabela, ctx) {
    const chave = `token:${ctx.ip}`;
    conferirLimite(chave, cfg.limites.tokensPublicos);
    const x = negocio.porToken(tabela, ctx.params.token);
    if (!x) {
      contarTentativa(chave);
      falha(404, tabela === "propostas" ? "Proposta não encontrada. Confira o link com o instalador." : "Ordem de serviço não encontrada.");
    }
    return x;
  }

  function propostaPublica(p) {
    const inst = repo.obter("contas", p.instalador_id);
    const cli = p.cliente_id ? repo.obter("clientes", p.cliente_id) : null;
    const itens = negocio.itensDa(p.id).map((i) => ({ tipo: i.tipo === "servico" ? "servico" : "produto", descricao: i.descricao, unidade: i.unidade, foto_url: i.foto_url, quantidade: i.quantidade, preco_unit_centavos: i.preco_unit_centavos, total_centavos: i.preco_unit_centavos * i.quantidade }));
    const pg = repo.ler("pagamentos", repo.um("SELECT * FROM pagamentos WHERE proposta_id = ? AND status IN ('pendente','pago') ORDER BY criado_em DESC LIMIT 1", p.id));
    const reservaOk = p.reserva_expira_em && p.reserva_expira_em > agora();
    return {
      numero: p.numero,
      titulo: p.titulo,
      status: p.status,
      empresa: { nome: negocio.nomeConta(inst), cnpj: inst.cnpj, cidade: inst.cidade, uf: inst.uf, telefone: inst.telefone },
      cliente: cli ? { nome: cli.nome, documento: mascararDoc(cli.documento), endereco_obra: { cidade: cli.endereco?.cidade ?? null, uf: cli.endereco?.uf ?? null, bairro: cli.endereco?.bairro ?? null } } : null,
      itens,
      subtotal_centavos: p.subtotal_centavos,
      desconto_centavos: p.desconto_centavos,
      total_centavos: p.total_centavos,
      validade_dia: p.validade_dia,
      condicoes: p.condicoes,
      garantia: p.garantia,
      observacoes: p.observacoes,
      enviada_em: p.enviada_em,
      reserva_expira_em: p.reserva_expira_em,
      aceite: p.aceite ? { nome: p.aceite.nome, em: p.aceite.em } : null,
      pagamento: pg ? { status: pg.status, forma: pg.forma, parcelas: pg.parcelas, link: pg.status === "pendente" ? pg.link : null, pago_em: pg.pago_em } : null,
      pode_aceitar: ["enviada", "vista"].includes(p.status),
      pode_pagar: p.status === "aceita" && Boolean(reservaOk),
      formas: FORMAS,
    };
  }

  r.get("/api/publico/propostas/:token", P, (ctx) => propostaPublica(negocio.registrarVista(buscar("propostas", ctx))));
  r.post("/api/publico/propostas/:token/aceitar", P, async (ctx) => {
    const p = buscar("propostas", ctx);
    const d = validar(z.object({ nome: t(160, 3), documento: documento.optional(), concordo: z.literal(true, { message: "confirme que leu e concorda com a proposta" }) }), await ctx.corpo());
    return propostaPublica(negocio.aceitar(p, { nome: d.nome, documento: d.documento, ip: ctx.ip }));
  });
  r.post("/api/publico/propostas/:token/pagar", P, async (ctx) => {
    const p = buscar("propostas", ctx);
    limitar(`pagar:${ctx.ip}`, 20);
    const d = validar(z.object({ forma: z.enum(FORMAS), parcelas: z.number().int().min(1).max(12).optional(), documento: documento.optional(), email: email.optional() }), await ctx.corpo());
    const pg = await negocio.pagar(p, d);
    return { link: pg.link, forma: pg.forma, parcelas: pg.parcelas, valor_centavos: pg.valor_centavos, status: pg.status };
  });

  r.get("/api/publico/os/:token", P, (ctx) => h.osPublica(buscar("ordens", ctx)));
  r.get("/api/publico/os/:token/fotos/:foto", P, (ctx) => h.servirFoto(ctx.res, buscar("ordens", ctx), ctx.params.foto));
  r.get("/api/publico/os/:token/assinatura", P, (ctx) => h.servirAssinatura(ctx.res, buscar("ordens", ctx)));

  // Consulta pública de CNPJ para preencher o cadastro (limitada por IP; usa o mesmo adaptador e cache)
  r.get("/api/publico/cnpj/:cnpj", P, async (ctx) => {
    limitar(`cnpj:${ctx.ip}`, 20);
    const d = validar(z.object({ cnpj: z.string().regex(/^\d{14}$/, "CNPJ com 14 números") }), { cnpj: String(ctx.params.cnpj).replace(/\D/g, "") });
    const x = await cnpjs.consultar(d.cnpj);
    // Quantos fornecedores ativos aceitam algum CNAE deste CNPJ (só o número; os nomes aparecem depois do cadastro)
    const fornecedores_compativeis = repo.lista("contas", "WHERE tipo = 'fornecedor' AND status = 'ativo'").filter((f) => cnaesCompativeis(x.cnaes ?? [], f.cnaes ?? []).length > 0).length;
    return { cnpj: x.cnpj, razao_social: x.razao_social, nome_fantasia: x.nome_fantasia, situacao: x.situacao, cnaes: x.cnaes, cnae_descricao: x.cnae_descricao, cidade: x.cidade, uf: x.uf, fornecedores_compativeis, compativel: fornecedores_compativeis > 0 };
  });
}
