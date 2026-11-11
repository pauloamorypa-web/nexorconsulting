/* Fluxo completo: cadastro (CNPJ consultado), aprovação Nexor, vínculo por CNAE, catálogo com tabela de preço,
   comparador, proposta, reserva, página pública, aceite, pagamento com split, baixa de estoque, repasses, títulos, OS e notas. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CNPJ_BAIXADO, CNPJ_SEM_CNAE, SENHA, cenario, enviarProposta, subir, webhookPago } from "./ajuda.js";
import { gerarCnpj } from "../src/regras/documentos.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==";

test("Fluxo: cadastro, vínculo, catálogo, proposta, reserva, aceite, pagamento com split, baixa e repasses", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const { fa, fb, pa, pb, inst } = c;
    // Instalador cadastrado com os dados da Receita (razão social, cidade e CNAEs vieram da consulta)
    const eu = await inst.ok.get("/api/instalador/eu");
    assert.equal(eu.conta.razao_social, "Instala Seg Teste Ltda");
    assert.deepEqual(eu.conta.cnaes, ["8020001", "4321500"]);
    assert.equal(eu.conta.config.wallet, "••••ador", "walletId mascarado");

    // Catálogo com o preço da tabela Ouro (10% de desconto) e comparador entre fornecedores
    const cat = await inst.ok.get(`/api/instalador/fornecedores/${fa.id}/catalogo`);
    assert.equal(cat.find((p) => p.codigo === "CAM-1").preco_centavos, 18000);
    const cmp = await inst.ok.get("/api/instalador/comparar?codigo=CAM-1&quantidade=2");
    assert.equal(cmp.length, 2);
    assert.equal(cmp[0].fornecedor_id, fb.id, "o mais barato primeiro");
    assert.equal(cmp[0].melhor, true);
    const combo = await inst.ok.post("/api/instalador/comparar", { itens: [{ codigo: "CAM-1", quantidade: 2 }, { codigo: "DVR-4", quantidade: 1 }] });
    assert.equal(combo.total_centavos, 2 * 17000 + 36000);
    assert.equal(combo.fornecedores.length, 2);

    // Proposta dividida entre os dois fornecedores, com serviço e desconto
    const itens = [
      { tipo: "fornecedor", produto_id: pb["CAM-1"].id, quantidade: 2, preco_unit_centavos: 25000 },
      { tipo: "fornecedor", produto_id: pa["DVR-4"].id, quantidade: 1, preco_unit_centavos: 50000 },
      { tipo: "fornecedor", produto_id: pa["HD-1"].id, quantidade: 1, preco_unit_centavos: 40000 },
      { tipo: "servico", descricao: "Instalação e configuração", quantidade: 1, preco_unit_centavos: 50000 },
    ];
    const { p, r, token } = await enviarProposta(c, itens, { desconto_centavos: 10000, garantia: "12 meses" });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.status, "enviada");
    assert.equal(r.dados.total_centavos, 180000);
    assert.equal(r.dados.custo_fornecedores_centavos, 34000 + 36000 + 27000);
    assert.equal(r.dados.taxa_plataforma_centavos, 4500);
    assert.match(r.dados.link, /^https:\/\/elo\.teste\/p\/[\w-]+$/);
    const prodA = (await fa.c.ok.get("/api/fornecedor/produtos")).find((x) => x.codigo === "DVR-4");
    assert.equal(prodA.reservado, 1);
    assert.equal(prodA.disponivel, 4);
    assert.ok((await fa.c.ok.get("/api/fornecedor/notificacoes")).some((n) => n.tipo === "reserva_nova"));
    assert.equal((await fa.c.ok.get("/api/fornecedor/reservas?status=ativa")).length, 2);

    // Página pública: o cliente vê preço de venda, nunca custo nem fornecedor
    const pub = s.cliente();
    const vista = await pub.ok.get(`/api/publico/propostas/${token}`);
    assert.equal(vista.status, "vista");
    assert.equal(vista.total_centavos, 180000);
    const txt = JSON.stringify(vista);
    assert.ok(!/custo|fornecedor|Distribuidora/.test(txt), "sem custo nem fornecedor na página do cliente");
    assert.equal((await pub.post(`/api/publico/propostas/${token}/pagar`, { forma: "PIX" })).status, 409, "precisa aceitar antes");
    assert.equal((await pub.post(`/api/publico/propostas/${token}/aceitar`, { nome: "Zuleika P. Amarantes" })).status, 400, "precisa concordar");
    const aceita = await pub.ok.post(`/api/publico/propostas/${token}/aceitar`, { nome: "Zuleika P. Amarantes", concordo: true });
    assert.equal(aceita.status, "aceita");
    const det = await inst.ok.get(`/api/instalador/propostas/${p.id}`);
    assert.equal(det.aceite.nome, "Zuleika P. Amarantes");
    assert.ok(det.aceite.ip && det.aceite.em, "aceite com IP e data");

    // Pagamento: cobrança no Asaas com split (fornecedor A com wallet = custo dos itens dele; instalador = resto menos a taxa)
    const pg = await pub.ok.post(`/api/publico/propostas/${token}/pagar`, { forma: "PIX" });
    assert.match(pg.link, /asaas\.teste/);
    const cob = s.rede.asaas.find((x) => x.caminho.endsWith("/payments"));
    assert.equal(cob.chave, "chave-asaas-plataforma");
    assert.equal(cob.corpo.value, 1800);
    assert.deepEqual(cob.corpo.split, [{ walletId: "wallet-fornecedor-a", fixedValue: 630 }, { walletId: "wallet-instalador", fixedValue: 1125 }]);
    assert.equal(cob.corpo.split.reduce((a, x) => a + x.fixedValue, 0) + 45, 1800, "split + taxa Nexor = total (a parte do fornecedor sem wallet fica com o instalador, que a deve num título)");
    const repetida = await pub.ok.post(`/api/publico/propostas/${token}/pagar`, { forma: "PIX" });
    assert.equal(repetida.link, pg.link, "não cria cobrança em dobro");

    // Webhook: token errado é recusado; o certo dá baixa
    const falso = await fetch(`${s.url}/webhook/asaas`, { method: "POST", headers: { "asaas-access-token": "errado" }, body: "{}" });
    assert.equal(falso.status, 401);
    const asaasId = s.app.repo.um("SELECT asaas_id FROM pagamentos WHERE proposta_id = ?", p.id).asaas_id;
    assert.equal((await webhookPago(s, asaasId)).status, 200);
    assert.equal((await webhookPago(s, asaasId)).dados.repetido, true, "idempotente");
    const paga = await inst.ok.get(`/api/instalador/propostas/${p.id}`);
    assert.equal(paga.status, "paga");
    const dvr = (await fa.c.ok.get("/api/fornecedor/produtos")).find((x) => x.codigo === "DVR-4");
    assert.deepEqual([dvr.estoque, dvr.reservado], [4, 0], "estoque saiu");
    const camB = (await fb.c.ok.get("/api/fornecedor/produtos")).find((x) => x.codigo === "CAM-1");
    assert.deepEqual([camB.estoque, camB.reservado], [8, 0]);
    assert.ok(paga.reservas.every((x) => x.status === "baixada"));

    // Repasses: A recebeu pelo split; B (sem wallet) tem um título a receber; Nexor e instalador registrados
    const rep = Object.fromEntries(paga.repasses.map((x) => [`${x.destino}:${x.via}`, x]));
    assert.equal(rep["fornecedor:split"].valor_centavos, 63000);
    assert.equal(rep["fornecedor:split"].status, "recebido");
    assert.equal(rep["fornecedor:titulo"].valor_centavos, 34000);
    assert.equal(rep["nexor:retido"].valor_centavos, 4500);
    assert.equal(rep["instalador:split"].valor_centavos, 112500);
    const finA = await fa.c.ok.get("/api/fornecedor/repasses");
    assert.equal(finA.resumo.recebido_split_centavos, 63000);
    const titB = await fb.c.ok.get("/api/fornecedor/titulos");
    assert.equal(titB.length, 1);
    assert.equal(titB[0].valor_centavos, 34000);
    assert.equal(titB[0].origem, "sem_wallet");
    const baixa = await fb.c.ok.post(`/api/fornecedor/titulos/${titB[0].id}/baixar`);
    assert.equal(baixa.pago_no_prazo, true);
    assert.equal((await fb.c.ok.get("/api/fornecedor/repasses")).repasses[0].status, "recebido");
    assert.ok((await fa.c.ok.get("/api/fornecedor/notificacoes")).some((n) => n.tipo === "proposta_paga"));
    const score = await fa.c.ok.get(`/api/fornecedor/instaladores/${c.instId}/score`);
    assert.equal(score.conversao.pagas, 1);
    assert.equal(score.volume_90d.centavos, 63000);

    // Notas: NFS-e do instalador e NF-e do fornecedor para o instalador (simuladas fora de produção, sem token)
    const nfse = await inst.ok.post(`/api/instalador/propostas/${p.id}/nfse`);
    assert.equal(nfse.simulada, true);
    const nfe = await fa.c.ok.post(`/api/fornecedor/propostas/${p.id}/nfe`);
    assert.equal(nfe.tipo, "nfe");
    // Com token da Focus: chama o provedor
    await fa.c.ok.put("/api/fornecedor/conta", { focus_token: "token-focus" });
    const nfeB = await fb.c.ok.put("/api/fornecedor/conta", { focus_token: "token-focus-b" });
    assert.equal(nfeB.config.focus_token, true);
    await fb.c.ok.post(`/api/fornecedor/propostas/${p.id}/nfe`);
    assert.equal(s.rede.focus.length, 1);
    assert.equal(s.rede.focus[0].corpo.cnpj_destinatario, eu.conta.cnpj, "destinatário é o instalador");

    // Ordem de serviço da proposta paga: técnico, checklist, série, foto, assinatura e link público
    const tec = await inst.ok.post("/api/instalador/equipe", { nome: "Rafael Técnico", email: "rafael@inst.teste", senha: SENHA, papel: "tecnico" });
    const os = await inst.ok.post("/api/instalador/os", { proposta_id: p.id, tecnico_id: tec.id, agendada_dia: "2026-11-11", agendada_hora: "09:00" });
    assert.equal(os.series.length, 4, "um número de série por equipamento");
    assert.ok(os.checklist.length >= 3);
    const tecnico = s.cliente();
    await tecnico.ok.post("/api/instalador/entrar", { email: "rafael@inst.teste", senha: SENHA });
    assert.equal((await tecnico.ok.get("/api/instalador/os")).length, 1);
    await tecnico.ok.post(`/api/instalador/os/${os.id}/status`, { status: "a_caminho" });
    await tecnico.ok.put(`/api/instalador/os/${os.id}/checklist`, { checklist: os.checklist.map((x) => ({ ...x, feito: true })) });
    const ser = await tecnico.ok.put(`/api/instalador/os/${os.id}/series`, { series: os.series.map((x, i) => ({ ...x, serie: `SN${i}`, garantia_meses: 12 })) });
    assert.equal(ser.series[0].garantia_ate, "2027-11-10");
    const comFoto = await tecnico.ok.post(`/api/instalador/os/${os.id}/fotos`, { imagem: PNG, legenda: "DVR no rack" });
    assert.equal(comFoto.fotos.length, 1);
    assert.equal((await tecnico.post(`/api/instalador/os/${os.id}/fotos`, { imagem: "data:image/png;base64,AAAAAAAA" })).status, 400, "não é imagem");
    const grande = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(700 * 1024)]).toString("base64")}`;
    assert.equal((await tecnico.post(`/api/instalador/os/${os.id}/fotos`, { imagem: grande })).status, 413);
    await tecnico.ok.post(`/api/instalador/os/${os.id}/assinatura`, { imagem: PNG, nome: "Zuleika P. Amarantes" });
    await tecnico.ok.post(`/api/instalador/os/${os.id}/status`, { status: "concluida" });
    const link = (await inst.ok.get(`/api/instalador/os/${os.id}`)).link;
    const osPub = await s.cliente().ok.get(`/api/publico/os/${link.split("/").at(-1)}`);
    assert.equal(osPub.status, "concluida");
    assert.deepEqual(osPub.historico.map((h) => h.status), ["agendada", "a_caminho", "a_caminho", "concluida"]);
    assert.equal(osPub.assinado, true);
    assert.ok(!JSON.stringify(osPub).includes(c.cliente.documento), "OS pública sem documento");
    const foto = await fetch(`${s.url}/api/publico/os/${link.split("/").at(-1)}/fotos/${comFoto.fotos[0].id}`);
    assert.equal(foto.headers.get("content-type"), "image/png");
    // A assinatura do cliente também aparece na página pública da OS
    const assin = await fetch(`${s.url}/api/publico/os/${link.split("/").at(-1)}/assinatura`);
    assert.equal(assin.status, 200);
    assert.equal(assin.headers.get("content-type"), "image/png");
    // Lista de notas fiscais do instalador numa chamada só
    const notas = await inst.ok.get("/api/instalador/notas");
    assert.ok(notas.some((n) => n.tipo === "nfse" && n.proposta_id === p.id));
    const pagina = await fetch(link.replace("https://elo.teste", s.url));
    assert.equal(pagina.status, 200);
    assert.equal(pagina.headers.get("referrer-policy"), "no-referrer");

    // Auditoria das ações sensíveis
    const aud = (await fa.c.ok.get("/api/fornecedor/auditoria")).map((x) => x.acao);
    for (const a of ["wallet_alterado", "vinculo_aprovado", "conta_criada"]) assert.ok(aud.includes(a), a);
    const audI = (await inst.ok.get("/api/instalador/auditoria")).map((x) => x.acao);
    for (const a of ["proposta_enviada", "proposta_aceita", "proposta_paga", "os_assinada"]) assert.ok(audI.includes(a), a);
  } finally {
    s.fechar();
  }
});

test("Cadastro do instalador: CNPJ consultado (com cache), situação e vínculo por CNAE", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const antes = s.rede.consultas();
    const consulta = await s.cliente().ok.get(`/api/publico/cnpj/${(await c.inst.ok.get("/api/instalador/eu")).conta.cnpj}`);
    assert.equal(typeof consulta.compativel, "boolean", "diz antes do cadastro se há fornecedor compatível");
    assert.equal(s.rede.consultas(), antes, "resposta da BrasilAPI cacheada");
    assert.equal((await s.cliente().post("/api/instalador/cadastro", { cnpj: CNPJ_BAIXADO, nome: "X", email: "x@x.teste", senha: SENHA })).status, 400);
    assert.equal((await s.cliente().post("/api/instalador/cadastro", { cnpj: gerarCnpj("11223344"), nome: "X", email: "y@x.teste", senha: SENHA })).status, 400, "CNPJ não encontrado");
    assert.equal((await s.cliente().post("/api/instalador/cadastro", { cnpj: "11.111.111/1111-11", nome: "X", email: "z@x.teste", senha: SENHA })).status, 400, "CNPJ inválido");
    const padaria = s.cliente();
    await padaria.ok.post("/api/instalador/cadastro", { cnpj: CNPJ_SEM_CNAE, nome: "Padeiro", email: "pao@x.teste", senha: SENHA });
    const forn = await padaria.ok.get("/api/instalador/fornecedores");
    assert.equal(forn.find((f) => f.id === c.fa.id).compativel, false);
    const r = await padaria.post("/api/instalador/vinculos", { fornecedor_id: c.fa.id });
    assert.equal(r.status, 422);
    assert.equal(r.dados.codigo, "cnae");
    // Sem vínculo aprovado, o catálogo não abre
    assert.equal((await padaria.get(`/api/instalador/fornecedores/${c.fa.id}/catalogo`)).status, 403);
    // Fornecedor pendente não aparece para os instaladores
    const novo = s.cliente();
    const fn = await novo.ok.post("/api/fornecedor/cadastro", { cnpj: gerarCnpj("50505050"), razao_social: "Nova Ltda", cnaes: ["8020"], cidade: "Araguari", uf: "MG", nome: "Nova", email: "nova@f.teste", senha: SENHA });
    assert.equal(fn.conta.status, "pendente");
    assert.ok(!(await c.inst.ok.get("/api/instalador/fornecedores")).some((f) => f.id === fn.conta.id));
    assert.ok((await c.nexor.ok.get("/api/nexor/fornecedores?status=pendente")).some((f) => f.id === fn.conta.id));
  } finally {
    s.fechar();
  }
});

test("Catálogo: importação CSV, visibilidade por tabela, tabela de lista e kits", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    const csv = "codigo;nome;marca;categoria;preco;estoque;unidade\nCAM-1;Câmera bullet 1080p v2;Marca;CFTV;210,00;12;un\nSIR-1;Sirene 120 dB;Marca;Alarme;29,90;50;un\n;sem código;;;10;1;un\nX-1;Preço ruim;;;abc;1;un";
    const imp = await c.fa.c.ok.post("/api/fornecedor/produtos/importar", { csv });
    assert.deepEqual([imp.criados, imp.atualizados, imp.erros.length], [1, 1, 2]);
    const cam = (await c.fa.c.ok.get("/api/fornecedor/produtos")).find((p) => p.codigo === "CAM-1");
    assert.equal(cam.preco_centavos, 21000);
    // Item visível só para a tabela Prata: o instalador (tabela Ouro) não vê
    const prata = await c.fa.c.ok.post("/api/fornecedor/tabelas", { nome: "Prata", tipo: "lista", precos: {} });
    await c.fa.c.ok.put(`/api/fornecedor/produtos/${c.pa["HD-1"].id}`, { visibilidade: "tabelas", tabelas: [prata.id] });
    assert.ok(!(await c.inst.ok.get(`/api/instalador/fornecedores/${c.fa.id}/catalogo`)).some((p) => p.codigo === "HD-1"));
    const p = await c.inst.post("/api/instalador/propostas", { titulo: "x", itens: [{ tipo: "fornecedor", produto_id: c.pa["HD-1"].id, quantidade: 1, preco_unit_centavos: 1 }] });
    assert.equal(p.status, 403, "não dá para orçar item invisível");
    // Tabela de lista: preço fixo por item
    await c.fa.c.ok.put(`/api/fornecedor/tabelas/${prata.id}`, { precos: { [c.pa["DVR-4"].id]: 33333 } });
    await c.fa.c.ok.put(`/api/fornecedor/vinculos/${c.va.id}/tabela`, { tabela_id: prata.id });
    const cat = await c.inst.ok.get(`/api/instalador/fornecedores/${c.fa.id}/catalogo`);
    assert.equal(cat.find((x) => x.codigo === "DVR-4").preco_centavos, 33333);
    assert.ok(cat.some((x) => x.codigo === "HD-1"), "agora a tabela libera o item");
    // Kit modelo vira itens (melhor oferta de cada termo)
    const kits = await c.inst.ok.get("/api/instalador/kits");
    assert.ok(kits.some((k) => k.id === "modelo:cftv-4"));
    const meu = await c.inst.ok.post("/api/instalador/kits", { nome: "Kit 2 câmeras", itens: [{ codigo: "CAM-1", quantidade: 2 }, { codigo: "DVR-4", quantidade: 1 }, { termo: "inexistente", quantidade: 1 }] });
    const rasc = await c.inst.ok.post("/api/instalador/propostas", { titulo: "Do kit", cliente_id: c.cliente.id });
    const ap = await c.inst.ok.post(`/api/instalador/kits/${meu.id}/aplicar`, { proposta_id: rasc.id });
    assert.equal(ap.itens.length, 2);
    assert.equal(ap.faltando.length, 1);
    assert.equal(ap.itens[0].fornecedor_id, c.fb.id, "câmera mais barata no fornecedor B");
    assert.equal((await c.inst.ok.get(`/api/instalador/propostas/${rasc.id}`)).itens.length, 2);
  } finally {
    s.fechar();
  }
});

test("Contrato recorrente: assinatura no Asaas do instalador, sem split, e webhook próprio", async () => {
  const s = await subir();
  try {
    const c = await cenario(s);
    assert.equal((await c.inst.post("/api/instalador/contratos", { cliente_id: c.cliente.id, descricao: "Monitoramento", valor_centavos: 8990, dia_vencimento: 10 })).status, 409, "sem chave do Asaas");
    const conta = await c.inst.ok.put("/api/instalador/conta", { asaas_chave: "chave-do-instalador" });
    assert.equal(conta.config.asaas_chave, true);
    assert.ok(!JSON.stringify(conta).includes("chave-do-instalador"), "chave não volta");
    const ct = await c.inst.ok.post("/api/instalador/contratos", { cliente_id: c.cliente.id, descricao: "Monitoramento", valor_centavos: 8990, dia_vencimento: 10 });
    const sub = s.rede.asaas.find((x) => x.caminho.endsWith("/subscriptions"));
    assert.equal(sub.chave, "chave-do-instalador");
    assert.equal(sub.corpo.cycle, "MONTHLY");
    assert.equal(sub.corpo.split, undefined, "sem split");
    assert.equal(sub.corpo.nextDueDate, "2026-11-10");
    const wh = conta.webhook_contratos;
    const evento = { event: "PAYMENT_RECEIVED", payment: { id: "pay_ct_1", subscription: ct.asaas_assinatura, value: 89.9, dueDate: "2026-11-10" } };
    assert.equal((await fetch(`${s.url}/webhook/asaas/instalador/${c.instId}`, { method: "POST", headers: { "asaas-access-token": s.app.tokenWebhookAsaas() }, body: JSON.stringify(evento) })).status, 401, "o token da plataforma não vale aqui");
    assert.equal((await fetch(wh.url.replace("https://elo.teste", s.url), { method: "POST", headers: { "asaas-access-token": wh.token }, body: JSON.stringify(evento) })).status, 200);
    const lista = await c.inst.ok.get("/api/instalador/contratos");
    assert.equal(lista[0].cobrancas[0].status, "paga");
    assert.equal((await c.inst.ok.post(`/api/instalador/contratos/${ct.id}/cancelar`)).status, "cancelado");
  } finally {
    s.fechar();
  }
});
