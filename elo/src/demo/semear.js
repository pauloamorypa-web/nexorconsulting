/* Modo Demonstração: monta a rede fictícia (Distribuidora Vigia Forte, Elétrica Triângulo e Instala Seg Araguari)
   com 60 dias de história, usando a API real com um relógio que "volta no tempo". Assim reservas, pagamentos com
   split, títulos, score, ordens de serviço e notificações ficam coerentes entre si.
   Tudo é fictício: CNPJs e CPFs gerados (formato válido), telefones (34) 99999-xxxx, e-mails .demo. */

import { rmSync } from "node:fs";
import { join } from "node:path";
import { hashSenha } from "../seguranca.js";
import { hojeBR, paraMs, somarDias } from "../regras/datas.js";
import { gerarCnpj, gerarCpf } from "../regras/documentos.js";
import { CNPJS_DEMO } from "./simulador.js";

export const DEMO_SENHA = "demo-elo-2026";
export const PAPEIS = [
  { papel: "fornecedor_dono", tipo: "fornecedor", email: "marcos@vigiaforte.demo", nome: "Marcos Vieira", descricao: "Dono da Distribuidora Vigia Forte: reservas, vínculos, crédito, repasses e score", destino: "/fornecedor/#/painel" },
  { papel: "fornecedor_comercial", tipo: "fornecedor", email: "patricia@vigiaforte.demo", nome: "Patrícia Lemos", descricao: "Comercial da Vigia Forte: catálogo, tabelas de preço e aprovação de instaladores", destino: "/fornecedor/#/painel" },
  { papel: "fornecedor_financeiro", tipo: "fornecedor", email: "sergio@vigiaforte.demo", nome: "Sérgio Antunes", descricao: "Financeiro da Vigia Forte: títulos, bloqueio por inadimplência e repasses", destino: "/fornecedor/#/painel" },
  { papel: "fornecedor2_dono", tipo: "fornecedor", email: "helena@eletricatriangulo.demo", nome: "Helena Prado", descricao: "Dona da Elétrica Triângulo (segundo fornecedor, para o comparador de preços)", destino: "/fornecedor/#/painel" },
  { papel: "instalador_dono", tipo: "instalador", email: "diego@instalaseg.demo", nome: "Diego Martins", descricao: "Dono da Instala Seg Araguari: propostas, comparador, calculadora, OS e contratos", destino: "/app/#/inicio" },
  { papel: "instalador_tecnico", tipo: "instalador", email: "rafael@instalaseg.demo", nome: "Rafael Souza", descricao: "Técnico da Instala Seg: só as ordens de serviço dele (checklist, fotos, assinatura)", destino: "/app/#/os" },
  { papel: "nexor", tipo: "nexor", email: "operacao@nexor.demo", nome: "Operação Nexor", descricao: "Operador Nexor: aprova fornecedores e vê métricas agregadas", destino: "/nexor/#/painel" },
  { papel: "cliente", tipo: "cliente", nome: "Cliente final", descricao: "Página pública da proposta (sem login): ver, aceitar e pagar", destino: "/p/" },
];

export const EMPRESAS = {
  vigia: { cnpj: gerarCnpj("31415926"), razao_social: "Distribuidora Vigia Forte Ltda", nome_fantasia: "Vigia Forte", cidade: "Araguari", uf: "MG" },
  triangulo: { cnpj: gerarCnpj("16180339"), razao_social: "Elétrica Triângulo Distribuidora Ltda", nome_fantasia: "Elétrica Triângulo", cidade: "Uberlândia", uf: "MG" },
  instala: { cnpj: gerarCnpj("27182818"), razao_social: "Instala Seg Araguari Ltda", nome_fantasia: "Instala Seg Araguari", cnae_fiscal: 8020001, secundarios: [4321500, 4329104], cidade: "ARAGUARI" },
  rocha: { cnpj: gerarCnpj("14142135"), razao_social: "Eletro Rocha Instalações Ltda", nome_fantasia: "Eletro Rocha", cnae_fiscal: 4321500, secundarios: [], cidade: "ARAGUARI" },
  conecta: { cnpj: gerarCnpj("17320508"), razao_social: "Conecta Redes e Segurança Ltda", nome_fantasia: "Conecta Redes", cnae_fiscal: 8020001, secundarios: [6190699], cidade: "UBERLANDIA" },
};
for (const k of ["instala", "rocha", "conecta"]) {
  const e = EMPRESAS[k];
  CNPJS_DEMO.set(e.cnpj, { razao_social: e.razao_social, nome_fantasia: e.nome_fantasia, cnae_fiscal: e.cnae_fiscal, cnae_fiscal_descricao: "Atividade principal", cnaes_secundarios: e.secundarios.map((codigo) => ({ codigo, descricao: "" })), municipio: e.cidade, uf: "MG", descricao_situacao_cadastral: "ATIVA" });
}

// [codigo, nome, marca, categoria, preço (centavos), estoque, unidade, prazo]
const CATALOGO_VIGIA = [
  ["DVR-4C", "DVR 4 canais 1080p", "Vigiatec", "CFTV", 38900, 25, "un", 1], ["DVR-8C", "DVR 8 canais 1080p", "Vigiatec", "CFTV", 58900, 12, "un", 1],
  ["CAM-BL-1080", "Câmera bullet 1080p infravermelho 30 m", "Vigiatec", "CFTV", 15990, 80, "un", 1], ["CAM-DM-1080", "Câmera dome 1080p infravermelho 20 m", "Vigiatec", "CFTV", 14990, 60, "un", 1],
  ["HD-1TB", "HD 1 TB para CFTV", "Datamax", "CFTV", 34900, 20, "un", 1], ["FNT-12V-10A", "Fonte 12V 10A colmeia", "Voltmax", "CFTV", 8990, 40, "un", 1],
  ["CABO-COAX-100", "Cabo coaxial bipolar 4 mm (rolo 100 m)", "Fiocerto", "CFTV", 21900, 30, "rl", 1], ["BNC-MOLA", "Conector BNC de mola", "Fiocerto", "CFTV", 250, 1000, "un", 1],
  ["BALUN-HD", "Balun passivo HD (par)", "Vigiatec", "CFTV", 1890, 200, "par", 1], ["ALM-CENTRAL-6", "Central de alarme 6 zonas com discadora", "Protec", "Alarme", 32900, 18, "un", 2],
  ["SNS-IVP", "Sensor infravermelho passivo", "Protec", "Alarme", 4990, 120, "un", 1], ["SNS-MAG", "Sensor magnético de abertura", "Protec", "Alarme", 1490, 300, "un", 1],
  ["SIR-120", "Sirene 120 dB", "Protec", "Alarme", 2990, 60, "un", 1], ["BAT-12V-7A", "Bateria selada 12V 7Ah", "Voltmax", "Alarme", 8900, 45, "un", 1],
  ["CERCA-CHOQUE", "Central de choque para cerca elétrica", "Protec", "Cerca e acesso", 27900, 10, "un", 2], ["FECH-ELET", "Fechadura elétrica de sobrepor", "Protec", "Cerca e acesso", 18900, 15, "un", 2],
  ["VIDEO-PORT", "Videoporteiro colorido com 2 monitores", "Vigiatec", "Cerca e acesso", 69900, 1, "un", 3],
  ["QD-12", "Quadro de distribuição 12 disjuntores", "Luminar", "Elétrica", 11900, 30, "un", 1], ["DJ-20A", "Disjuntor DIN 20A", "Luminar", "Elétrica", 1690, 400, "un", 1],
  ["DR-40A", "Interruptor DR 40A 30 mA", "Luminar", "Elétrica", 18900, 25, "un", 1], ["DPS-20KA", "DPS 20 kA", "Luminar", "Elétrica", 5990, 50, "un", 1],
  ["CABO-2.5-100", "Cabo flexível 2,5 mm² (rolo 100 m)", "Fiocerto", "Elétrica", 24900, 40, "rl", 1], ["CABO-4-100", "Cabo flexível 4 mm² (rolo 100 m)", "Fiocerto", "Elétrica", 38900, 20, "rl", 1],
  ["ELETRODUTO-34", "Eletroduto corrugado 3/4 (rolo 50 m)", "Luminar", "Elétrica", 6990, 60, "rl", 1],
];
const CATALOGO_TRIANGULO = [
  ["CAM-BL-1080", "Câmera bullet 1080p IR 30 m", "Vigiatec", "CFTV", 14990, 40, "un", 2], ["CAM-DM-1080", "Câmera dome 1080p IR 20 m", "Vigiatec", "CFTV", 15200, 35, "un", 2],
  ["DVR-4C", "DVR 4 canais 1080p", "Vigiatec", "CFTV", 37900, 10, "un", 3], ["HD-1TB", "HD 1 TB para CFTV", "Datamax", "CFTV", 35900, 15, "un", 2],
  ["FNT-12V-10A", "Fonte 12V 10A", "Voltmax", "CFTV", 9200, 30, "un", 2], ["SNS-IVP", "Sensor infravermelho passivo", "Protec", "Alarme", 4690, 80, "un", 2],
  ["QD-12", "Quadro de distribuição 12 disjuntores", "Luminar", "Elétrica", 12500, 20, "un", 2], ["DJ-20A", "Disjuntor DIN 20A", "Luminar", "Elétrica", 1550, 500, "un", 2],
  ["DR-40A", "Interruptor DR 40A 30 mA", "Luminar", "Elétrica", 17900, 18, "un", 2], ["CABO-2.5-100", "Cabo flexível 2,5 mm² (rolo 100 m)", "Fiocerto", "Elétrica", 23900, 25, "rl", 2],
];

const CLIENTES = [
  ["Carolina Mendes Ribeiro", "Centro"], ["Supermercado Bom Lugar Ltda", "Gutierrez"], ["Antônio Carlos Faria", "Santa Helena"], ["Clínica Sorriso Araguari Ltda", "Centro"],
  ["Juliana Teixeira Rocha", "Bosque"], ["Paulo Henrique Amaral", "Amorim"], ["Colégio Novo Saber Ltda", "Sibipiruna"], ["Fernanda Lopes Cardoso", "Miranda"],
  ["Ricardo Alves Pimenta", "Brasília"], ["Padaria Trigo de Ouro Ltda", "Centro"],
];

// PNG 1x1 (cinza) para as fotos e a assinatura de exemplo
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==";

function cliente(url) {
  const cookies = new Map();
  async function chamar(metodo, caminho, corpo) {
    const r = await fetch(url + caminho, { method: metodo, headers: { "x-nexor": "1", cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(corpo !== undefined ? { "content-type": "application/json" } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    for (const c of r.headers.getSetCookie()) {
      const [k, v] = c.split(";")[0].split("=");
      if (v) cookies.set(k, v);
      else cookies.delete(k);
    }
    const dados = (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : await r.text();
    if (r.status !== 200) throw new Error(`demo ${metodo} ${caminho}: ${JSON.stringify(dados)}`);
    return dados;
  }
  return { get: (c) => chamar("GET", c), post: (c, b = {}) => chamar("POST", c, b), put: (c, b = {}) => chamar("PUT", c, b) };
}

/** Semeia a pasta de dados da demonstração. Devolve o caminho do banco. */
export async function semear({ cfg, montarAplicacao, log = () => {} }) {
  for (const a of ["elo.db", "elo.db-wal", "elo.db-shm", "elo-original.db", "arquivos"]) rmSync(join(cfg.pastaDados, a), { recursive: true, force: true });
  const hoje = hojeBR(Date.now());
  let t = paraMs(somarDias(hoje, -60), "09:00");
  const agora = () => t;
  const ir = (offset, hora = "09:00") => (t = paraMs(somarDias(hoje, offset), hora));
  const app = montarAplicacao({ cfg: { ...cfg, demoReiniciar: false, sessaoDias: 400 }, agora });
  await new Promise((ok) => app.servidor.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${app.servidor.address().port}`;
  const banco = join(cfg.pastaDados, "elo.db");
  const { repo, negocio } = app;
  const pessoa = (tipo) => PAPEIS.find((p) => p.papel === tipo);
  try {
    // Operador Nexor
    const nexorConta = repo.inserir("contas", { tipo: "nexor", razao_social: "Nexor Consulting", status: "ativo" });
    repo.inserir("usuarios", { conta_id: nexorConta.id, tipo: "nexor", nome: pessoa("nexor").nome, email: pessoa("nexor").email, senha_hash: await hashSenha(DEMO_SENHA), papel: "operador" });
    const nexor = cliente(url);
    await nexor.post("/api/nexor/entrar", { email: pessoa("nexor").email, senha: DEMO_SENHA });

    // Fornecedores: cadastro → aprovação Nexor → equipe, tabelas e catálogo
    async function fornecedor(chave, dono, cnaes, prazo, catalogo, tabelas, wallet) {
      const e = EMPRESAS[chave];
      const c = cliente(url);
      const r = await c.post("/api/fornecedor/cadastro", { cnpj: e.cnpj, razao_social: e.razao_social, nome_fantasia: e.nome_fantasia, cnaes, cidade: e.cidade, uf: e.uf, prazo_reserva_dias: prazo, nome: dono.nome, email: dono.email, senha: DEMO_SENHA, telefone: "34999990100" });
      await nexor.post(`/api/nexor/fornecedores/${r.conta.id}/aprovar`, {});
      if (wallet) await c.put("/api/fornecedor/conta/wallet", { wallet_id: wallet });
      const tbs = {};
      for (const [nome, pctDesc] of tabelas) tbs[nome] = (await c.post("/api/fornecedor/tabelas", { nome, tipo: "desconto", desconto_pct: pctDesc })).id;
      const prods = {};
      for (const [codigo, nome, marca, categoria, preco_centavos, estoque, unidade, prazo_dias] of catalogo) prods[codigo] = await c.post("/api/fornecedor/produtos", { codigo, nome, marca, categoria, preco_centavos, estoque, unidade, prazo_dias, ...(codigo === "VIDEO-PORT" ? { visibilidade: "tabelas", tabelas: [tbs["Instalador Ouro"]] } : {}) });
      return { c, id: r.conta.id, tbs, prods };
    }
    log("· fornecedores e catálogos");
    const vigia = await fornecedor("vigia", pessoa("fornecedor_dono"), ["8020", "4321", "4329"], 5, CATALOGO_VIGIA, [["Instalador Ouro", 12], ["Instalador Prata", 7]], "a1b2c3d4-0000-4000-8000-00000000f0f1");
    await vigia.c.post("/api/fornecedor/equipe", { nome: pessoa("fornecedor_comercial").nome, email: pessoa("fornecedor_comercial").email, senha: DEMO_SENHA, papel: "comercial" });
    await vigia.c.post("/api/fornecedor/equipe", { nome: pessoa("fornecedor_financeiro").nome, email: pessoa("fornecedor_financeiro").email, senha: DEMO_SENHA, papel: "financeiro" });
    const tri = await fornecedor("triangulo", pessoa("fornecedor2_dono"), ["4321", "8020"], 4, CATALOGO_TRIANGULO, [["Parceiro", 8]], null);

    // Instaladores (CNPJ consultado na "Receita" simulada) e vínculos por CNAE
    log("· instaladores e vínculos");
    async function instalador(chave, nome, email) {
      const c = cliente(url);
      const r = await c.post("/api/instalador/cadastro", { cnpj: EMPRESAS[chave].cnpj, nome, email, senha: DEMO_SENHA, telefone: "34999990200" });
      return { c, id: r.conta.id };
    }
    const inst = await instalador("instala", pessoa("instalador_dono").nome, pessoa("instalador_dono").email);
    await inst.c.put("/api/instalador/conta", { wallet_id: "inst-wallet-demo-0001", asaas_chave: "demo-asaas-instalador", aliquota_iss_pct: 3, codigo_municipio: "3103504", item_lista_servico: "1406" });
    const tecnico = await inst.c.post("/api/instalador/equipe", { nome: pessoa("instalador_tecnico").nome, email: pessoa("instalador_tecnico").email, senha: DEMO_SENHA, papel: "tecnico", telefone: "34999990210" });
    const rocha = await instalador("rocha", "Joaquim Rocha", "joaquim@eletrorocha.demo");

    const vincular = async (i, f, tabela, limite) => {
      const v = await i.c.post("/api/instalador/vinculos", { fornecedor_id: f.id });
      await f.c.post(`/api/fornecedor/vinculos/${v.id}/aprovar`, { tabela_id: tabela, limite_credito_centavos: limite });
      return v;
    };
    await vincular(inst, vigia, vigia.tbs["Instalador Ouro"], 1_500_000);
    await vincular(inst, tri, tri.tbs.Parceiro, 800_000);
    await vincular(rocha, vigia, vigia.tbs["Instalador Prata"], 300_000);

    // Clientes do instalador (só ele vê)
    const clientes = [];
    for (const [i, [nome, bairro]] of CLIENTES.entries()) {
      const pj = nome.endsWith("Ltda");
      clientes.push(await inst.c.post("/api/instalador/clientes", { nome, documento: pj ? gerarCnpj(String(40000000 + i * 7919)) : gerarCpf(String(123456000 + i * 101)), telefone: `349999901${String(i).padStart(2, "0")}`, email: `${nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")}${i}@cliente.demo`, endereco: { logradouro: `Rua ${["das Acácias", "Goiás", "Minas Gerais", "Afonso Pena", "dos Ipês"][i % 5]}`, numero: String(100 + i * 37), bairro, cidade: "Araguari", uf: "MG", cep: "38440-000" } }));
    }

    // Propostas: itens [fornecedor, codigo, qtd] + serviços; margem de ~35% nos produtos
    const V = (codigo, q) => ({ f: vigia, codigo, q });
    const T = (codigo, q) => ({ f: tri, codigo, q });
    const KITS = {
      cftv4: [V("DVR-4C", 1), T("CAM-BL-1080", 4), V("HD-1TB", 1), V("FNT-12V-10A", 1), V("CABO-COAX-100", 1), V("BNC-MOLA", 8)],
      cftv8: [V("DVR-8C", 1), V("CAM-BL-1080", 6), V("CAM-DM-1080", 2), V("HD-1TB", 2), V("FNT-12V-10A", 2), V("CABO-COAX-100", 2), V("BNC-MOLA", 16)],
      alarme: [V("ALM-CENTRAL-6", 1), V("SNS-IVP", 4), V("SNS-MAG", 3), V("SIR-120", 1), V("BAT-12V-7A", 1)],
      quadro: [V("QD-12", 1), T("DJ-20A", 8), V("DR-40A", 1), V("DPS-20KA", 2), V("CABO-2.5-100", 1)],
      cerca: [V("CERCA-CHOQUE", 1), V("BAT-12V-7A", 1), V("SIR-120", 1)],
    };
    const SERVICOS = { cftv4: [["Instalação e configuração do CFTV", 65000], ["Deslocamento", 6000]], cftv8: [["Instalação e configuração do CFTV", 120000], ["Deslocamento", 6000]], alarme: [["Instalação e programação do alarme", 45000]], quadro: [["Montagem do quadro e testes", 55000], ["Deslocamento", 6000]], cerca: [["Instalação da cerca elétrica (até 40 m)", 80000]] };
    async function proposta(kit, cli, extra = {}) {
      const itens = KITS[kit].map(({ f, codigo, q }) => {
        const p = f.prods[codigo];
        const custo = negocio.preco(p, negocio.tabelaDo(negocio.vinculo(f.id, inst.id)));
        return { tipo: "fornecedor", produto_id: p.id, quantidade: q, preco_unit_centavos: Math.round((custo * 1.35) / 10) * 10 };
      });
      for (const [descricao, preco] of SERVICOS[kit]) itens.push({ tipo: "servico", descricao, quantidade: 1, preco_unit_centavos: preco });
      return inst.c.post("/api/instalador/propostas", { cliente_id: cli.id, titulo: { cftv4: "CFTV com 4 câmeras", cftv8: "CFTV com 8 câmeras", alarme: "Alarme monitorado", quadro: "Quadro de distribuição novo", cerca: "Cerca elétrica" }[kit], validade_dia: somarDias(hojeBR(t), 15), condicoes: "Pagamento à vista no Pix ou boleto, ou cartão em até 10x.", garantia: "12 meses nos equipamentos e 6 meses na instalação.", itens, ...extra });
    }
    const token = (link) => link.split("/").at(-1);
    const publico = cliente(url);
    async function fluxo(kit, cli, { ate = "paga", forma = "PIX", dias = [0, 0, 1, 1] } = {}) {
      const base = Math.floor((t - paraMs(hoje)) / 86400_000);
      // A linha do tempo só anda para frente: enviada → vista → aceita → paga (pelo menos 20 min entre cada passo)
      const passo = (offset, hora) => (t = Math.max(t + 20 * 60_000, paraMs(somarDias(hoje, base + offset), hora)));
      const p = await proposta(kit, cli);
      const env = await inst.c.post(`/api/instalador/propostas/${p.id}/enviar`, {});
      const tk = token(env.link);
      if (ate === "enviada") return env;
      passo(dias[1], "19:30");
      await publico.get(`/api/publico/propostas/${tk}`);
      if (ate === "vista") return env;
      passo(dias[2], "08:10");
      await publico.post(`/api/publico/propostas/${tk}/aceitar`, { nome: cli.nome, concordo: true });
      if (ate === "aceita") return env;
      await publico.post(`/api/publico/propostas/${tk}/pagar`, { forma, ...(forma === "CREDIT_CARD" ? { parcelas: 6 } : {}) });
      if (ate === "cobrada") return env;
      passo(dias[3], "10:00");
      const pg = repo.um("SELECT asaas_id FROM pagamentos WHERE proposta_id = ? AND status = 'pendente'", p.id);
      negocio.eventoAsaas({ event: "PAYMENT_RECEIVED", payment: { id: pg.asaas_id } });
      return env;
    }

    log("· 60 dias de propostas, pagamentos e títulos");
    // Contratos recorrentes de monitoramento (Asaas do instalador, sem split)
    ir(-59, "10:00");
    const contratos = [];
    for (const ci of [0, 3]) contratos.push(await inst.c.post("/api/instalador/contratos", { cliente_id: clientes[ci].id, descricao: "Monitoramento e manutenção preventiva mensal", valor_centavos: ci ? 14990 : 8990, dia_vencimento: 10 }));
    // Linha do tempo: [dia, kit, cliente, até onde vai]. "vista"/"enviada" viram expiradas (o cliente não respondeu a tempo).
    const roteiro = [
      [-58, "cftv4", 0], [-52, "alarme", 2], [-47, "quadro", 4], [-41, "cftv8", 1], [-36, "cerca", 6], [-30, "cftv4", 7],
      [-27, "cftv8", 1, "vista"], [-24, "alarme", 9], [-18, "quadro", 3], [-15, "cerca", 6, "enviada"], [-12, "cftv4", 5], [-10, "alarme", 8],
    ];
    const pagas = [];
    for (const [dia, kit, ci, ate] of roteiro) {
      ir(dia, "08:00");
      await app.rotina();
      // A Elétrica Triângulo não tem conta de split: o instalador paga os títulos dela em dia
      for (const x of repo.lista("titulos", "WHERE fornecedor_id = ? AND status = 'aberto'", tri.id)) await tri.c.post(`/api/fornecedor/titulos/${x.id}/baixar`);
      if (dia === -25 || dia === -24) {
        // Eletro Rocha: título de compra a prazo que vai vencer sem pagamento (bloqueio automático na Vigia Forte)
        if (!repo.um("SELECT 1 FROM titulos WHERE instalador_id = ?", rocha.id)) await vigia.c.post("/api/fornecedor/titulos", { instalador_id: rocha.id, descricao: "Compra a prazo: material elétrico (NF 1187)", valor_centavos: 184000, vencimento: somarDias(hoje, -6) });
      }
      ir(dia, "10:30");
      const env = await fluxo(kit, clientes[ci], { ate: ate ?? "paga", forma: ["PIX", "BOLETO", "CREDIT_CARD"][Math.abs(dia) % 3] });
      if (!ate) pagas.push(env);
    }
    ir(-9, "06:00");
    await app.rotina();
    for (const [i, d] of [-40, -10].entries())
      for (const c of contratos) negocio.eventoAsaas({ event: "PAYMENT_RECEIVED", payment: { id: `pay_contrato_${c.id.slice(0, 6)}_${i}`, subscription: c.asaas_assinatura, value: c.valor_centavos / 100, dueDate: somarDias(hoje, d) } }, { instaladorId: inst.id });

    // Ordens de serviço das propostas pagas
    log("· ordens de serviço e contratos");
    const propPaga = (env) => env.id;
    ir(-9, "08:00");
    const osConcluida = await inst.c.post("/api/instalador/os", { proposta_id: propPaga(pagas.at(-2)), tecnico_id: tecnico.id, agendada_dia: somarDias(hoje, -8), agendada_hora: "08:30" });
    ir(-8, "08:20");
    for (const s of ["a_caminho", "em_execucao"]) await inst.c.post(`/api/instalador/os/${osConcluida.id}/status`, { status: s });
    await inst.c.put(`/api/instalador/os/${osConcluida.id}/checklist`, { checklist: osConcluida.checklist.map((c) => ({ ...c, feito: true })) });
    await inst.c.put(`/api/instalador/os/${osConcluida.id}/series`, { series: osConcluida.series.map((s, i) => ({ ...s, serie: `VT${2026}${String(4410 + i).padStart(6, "0")}`, garantia_meses: 12 })) });
    await inst.c.post(`/api/instalador/os/${osConcluida.id}/fotos`, { imagem: PNG, legenda: "DVR instalado no rack" });
    await inst.c.post(`/api/instalador/os/${osConcluida.id}/assinatura`, { imagem: PNG, nome: clientes[5].nome });
    ir(-8, "16:40");
    await inst.c.post(`/api/instalador/os/${osConcluida.id}/status`, { status: "concluida", nota: "Sistema entregue e cliente orientado." });

    ir(-3, "09:00");
    await app.rotina();
    for (const x of repo.lista("titulos", "WHERE fornecedor_id = ? AND status = 'aberto'", tri.id)) await tri.c.post(`/api/fornecedor/titulos/${x.id}/baixar`);

    // Hoje: propostas em todos os status e uma OS em andamento
    log("· o dia de hoje");
    ir(-2, "09:30");
    const emExecucao = await fluxo("cftv8", clientes[1], { dias: [0, 0, 0, 1] });
    ir(-1, "11:00");
    const amanha = await fluxo("quadro", clientes[9], { dias: [0, 0, 0, 0] });
    ir(-1, "15:00");
    await fluxo("alarme", clientes[7], { ate: "vista" });
    ir(0, "08:00");
    const os1 = await inst.c.post("/api/instalador/os", { proposta_id: emExecucao.id, tecnico_id: tecnico.id, agendada_dia: hoje, agendada_hora: "08:30" });
    ir(0, "08:25");
    await inst.c.post(`/api/instalador/os/${os1.id}/status`, { status: "a_caminho" });
    ir(0, "08:50");
    await inst.c.post(`/api/instalador/os/${os1.id}/status`, { status: "em_execucao", nota: "Passando os cabos no forro." });
    await inst.c.put(`/api/instalador/os/${os1.id}/checklist`, { checklist: os1.checklist.map((c, i) => ({ ...c, feito: i < 3 })) });
    await inst.c.post(`/api/instalador/os/${os1.id}/fotos`, { imagem: PNG, legenda: "Câmeras do estacionamento fixadas" });
    await inst.c.post("/api/instalador/os", { proposta_id: amanha.id, tecnico_id: tecnico.id, agendada_dia: somarDias(hoje, 1), agendada_hora: "09:00" });
    ir(0, "09:10");
    await fluxo("cerca", clientes[2], { ate: "cobrada", dias: [0, 0, 0, 0] });
    ir(0, "09:40");
    await fluxo("cftv4", clientes[4], { ate: "enviada" });
    ir(0, "10:00");
    await proposta("alarme", clientes[8], { titulo: "Alarme para a casa de praia (rascunho)" });
    // Pedido de vínculo esperando a Vigia Forte
    const conecta = await instalador("conecta", "Luana Ferraz", "luana@conectaredes.demo");
    await conecta.c.post("/api/instalador/vinculos", { fornecedor_id: vigia.id });
    await app.rotina();
    await app.ocioso();
    log("Demonstração pronta.");
    return { banco };
  } finally {
    app.fechar();
  }
}
