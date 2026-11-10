/* Roteiro de dados do Modo Demonstração: o "Escritório Exemplo Contabilidade" com 12 empresas na carteira.
   Tudo é fictício e determinístico (mesma demonstração toda vez), com datas relativas a hoje: o mês que está
   fechando, os dois anteriores de histórico, obrigações vencendo, atrasadas e entregues, documentos lidos pela
   IA (passando pelo caminho real do sistema), guias, chamados, WhatsApp e honorários (um pago pelo Asaas). */

import { gerarHashSenha } from "../seguranca.js";
import { competenciaAnterior, diasEntre, hojeBR, nomeMes, somarDias, somarMeses } from "../regras/datas.js";
import { gerarPendencias, gerarTarefas, semearEscritorio, semearEsperados } from "../regras/geracao.js";
import { normalizarFone } from "../servicos/canais.js";
import { pdfDemo } from "./simulador.js";

export const SENHA_DEMO = "demo1234";
export const ID_NUMERO_DEMO = "100000000000001";
export const EMAILS = { dono: "marina@escritorioexemplo.demo", colaborador: "rafael@escritorioexemplo.demo", cliente: "juliana@paodourado.demo" };

export const TABELA_HONORARIOS = `CREATE TABLE IF NOT EXISTS demo_honorarios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL, vencimento TEXT NOT NULL, valor_centavos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','pago')), pago_em INTEGER, forma TEXT,
  asaas_id TEXT, link TEXT, criado_em INTEGER NOT NULL)`;

/** Gerador pseudoaleatório com semente (mulberry32): a mesma demonstração toda vez */
function sorteio(semente) {
  let a = semente >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (min, max) => min + Math.floor(f() * (max - min + 1));
  f.um = (lista) => lista[Math.floor(f() * lista.length)];
  return f;
}

/** CNPJ com dígitos verificadores válidos a partir de 8 dígitos de raiz (fictício) */
export function cnpjDemo(raiz) {
  const d = `${String(raiz).padStart(8, "0").slice(0, 8)}0001`.split("").map(Number);
  const dv = (nums) => {
    const pesos = nums.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((s, p, i) => s + nums[i] * p, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join("");
}

const fone = (n) => `349999900${String(n).padStart(2, "0")}`;

export const CARTEIRA = [
  { chave: "padaria", razao_social: "Padaria Pão Dourado Ltda", nome_fantasia: "Padaria Pão Dourado", regime: "simples", tem_funcionarios: true, contribuinte_icms: true, presta_servico: false, contato_nome: "Juliana Prado", municipio: "Uberlândia", honorario: 890_00, venc: 5, resp: "colaborador" },
  { chave: "mercadinho", razao_social: "Mercadinho Bom Preço Ltda", nome_fantasia: "Mercadinho Bom Preço", regime: "simples", tem_funcionarios: true, contribuinte_icms: true, presta_servico: false, contato_nome: "Carlos Menezes", municipio: "Uberlândia", honorario: 1150_00, venc: -9, resp: "colaborador" },
  { chave: "oficina", razao_social: "Oficina Mecânica Torque Ltda", nome_fantasia: "Oficina Torque", regime: "simples", tem_funcionarios: true, contribuinte_icms: false, presta_servico: true, contato_nome: "Anderson Reis", municipio: "Araguari", honorario: 760_00, venc: -7, resp: "colaborador" },
  { chave: "clinica", razao_social: "Clínica Sorriso Odontologia Ltda", nome_fantasia: "Clínica Sorriso", regime: "presumido", tem_funcionarios: true, contribuinte_icms: false, presta_servico: true, contato_nome: "Dra. Fernanda Alves", municipio: "Uberlândia", honorario: 1890_00, venc: -5, resp: "dono" },
  { chave: "studio", razao_social: "Patrícia Gomes Estética MEI", nome_fantasia: "Studio Bella Estética", regime: "mei", tem_funcionarios: false, contribuinte_icms: false, presta_servico: true, contato_nome: "Patrícia Gomes", municipio: "Uberlândia", honorario: 290_00, venc: -4, resp: "colaborador" },
  { chave: "transportes", razao_social: "Transportes Rota Certa Ltda", nome_fantasia: "Rota Certa Transportes", regime: "presumido", tem_funcionarios: true, contribuinte_icms: true, presta_servico: true, contato_nome: "Roberto Siqueira", municipio: "Uberaba", honorario: 2400_00, venc: -3, resp: "dono" },
  { chave: "construtora", razao_social: "Construtora Alicerce Forte Ltda", nome_fantasia: "Construtora Alicerce", regime: "real", tem_funcionarios: true, contribuinte_icms: true, presta_servico: true, contato_nome: "Eduardo Tavares", municipio: "Uberlândia", honorario: 4200_00, venc: -2, atrasado: true, resp: "dono" },
  { chave: "agencia", razao_social: "Pixel Criativo Comunicação Ltda", nome_fantasia: "Agência Pixel Criativo", regime: "simples", tem_funcionarios: false, contribuinte_icms: false, presta_servico: true, contato_nome: "Larissa Mota", municipio: "Uberlândia", honorario: 980_00, venc: 3, resp: "colaborador" },
  { chave: "restaurante", razao_social: "Restaurante Sabor da Terra Ltda", nome_fantasia: "Restaurante Sabor da Terra", regime: "simples", tem_funcionarios: true, contribuinte_icms: true, presta_servico: false, contato_nome: "Sebastião Freitas", municipio: "Monte Carmelo", honorario: 1250_00, venc: -12, atrasado: true, atrasadoAnterior: true, resp: "colaborador" },
  { chave: "petshop", razao_social: "Amigo Fiel Pet Shop Ltda", nome_fantasia: "Pet Shop Amigo Fiel", regime: "simples", tem_funcionarios: false, contribuinte_icms: true, presta_servico: true, contato_nome: "Vanessa Rocha", municipio: "Uberlândia", honorario: 690_00, venc: -6, atrasado: true, resp: "colaborador" },
  { chave: "nuvem", razao_social: "TI Nuvem Soluções em Tecnologia Ltda", nome_fantasia: "TI Nuvem Soluções", regime: "presumido", tem_funcionarios: true, contribuinte_icms: false, presta_servico: true, contato_nome: "Gustavo Lins", municipio: "Uberlândia", honorario: 1650_00, venc: -1, asaas: true, resp: "dono" },
  { chave: "eletricista", razao_social: "Lucas Ferreira Serviços Elétricos MEI", nome_fantasia: "Lucas Eletricista", regime: "mei", tem_funcionarios: false, contribuinte_icms: false, presta_servico: true, contato_nome: "Lucas Ferreira", municipio: "Araguari", honorario: 250_00, venc: 8, resp: "colaborador" },
].map((c, i) => ({ ...c, cnpj: cnpjDemo(31_400_100 + i * 7_919), whatsapp: fone(i + 1), email: `financeiro@${c.chave}.demo`, uf: "MG" }));

const FORNECEDORES = [
  { nome: "Distribuidora Horizonte Ltda", cnpj: cnpjDemo(28_417_465), item: "Mercadorias para revenda" },
  { nome: "Atacadão Central de Alimentos Ltda", cnpj: cnpjDemo(33_120_870), item: "Farinha, açúcar e insumos" },
  { nome: "Energia Triângulo S.A.", cnpj: cnpjDemo(17_155_730), item: "Energia elétrica" },
  { nome: "Telecom Cerrado Ltda", cnpj: cnpjDemo(40_432_544), item: "Internet e telefone" },
  { nome: "Auto Peças Paranaíba Ltda", cnpj: cnpjDemo(21_908_331), item: "Peças e lubrificantes" },
  { nome: "Dental Minas Suprimentos Ltda", cnpj: cnpjDemo(26_771_049), item: "Materiais odontológicos" },
  { nome: "Posto Estrela da Rodovia Ltda", cnpj: cnpjDemo(19_604_212), item: "Óleo diesel" },
  { nome: "Cimento & Aço Materiais de Construção Ltda", cnpj: cnpjDemo(35_802_617), item: "Cimento, vergalhão e areia" },
];
const BANCOS = ["Banco Exemplo · ag 0001 · cc 10203-4", "Cooperativa Exemplo · ag 3021 · cc 55120-7", "Banco Digital Exemplo · ag 0001 · cc 9988776-1"];

const dia2 = (n) => String(n).padStart(2, "0");
const reaisDe = (c) => Math.round(c) / 100;

/** Os dados que a "IA" vai ler de cada documento da demonstração (coerentes com o cliente e o mês) */
function leituraDe(tipo, cliente, comp, s) {
  const dia = (d) => `${comp}-${dia2(d)}`;
  const forn = s.um(cliente.regime === "mei" ? FORNECEDORES.slice(2, 4) : FORNECEDORES);
  const base = { emitente_nome: null, emitente_cnpj: null, destinatario_nome: null, destinatario_cnpj: null, numero: null, data_emissao: null, data_vencimento: null, valor_total: null, competencia: comp, descricao: null, banco: null, movimentos: [], confianca: "alta", observacoes: null };
  const escala = (cliente.honorario_centavos || 1000_00) / 1000_00;
  if (tipo === "extrato") {
    const movs = [];
    for (let i = 0; i < s.int(4, 7); i++) {
      const entrada = s() < 0.5;
      movs.push({ data: dia(s.int(2, 27)), descricao: entrada ? s.um(["PIX RECEBIDO", "CRED CARTAO DEBITO", "TED RECEBIDA CLIENTE", "DEPOSITO"]) : s.um(["PAGTO BOLETO FORNECEDOR", "TARIFA PACOTE SERVICOS", "PIX ENVIADO", "DEBITO AUTOMATICO ENERGIA"]), valor: Math.round((entrada ? 1 : -1) * s.int(180, 6800) * escala * 100) / 100 });
    }
    movs.sort((a, b) => a.data.localeCompare(b.data));
    return { ...base, tipo: "extrato_bancario", destinatario_nome: cliente.razao_social, destinatario_cnpj: cliente.cnpj, banco: s.um(BANCOS), descricao: `Extrato de ${nomeMes(comp)}`, movimentos: movs };
  }
  if (tipo === "notas_entrada") return { ...base, tipo: "nota_fiscal_entrada", emitente_nome: forn.nome, emitente_cnpj: forn.cnpj, destinatario_nome: cliente.razao_social, destinatario_cnpj: cliente.cnpj, numero: String(s.int(10000, 99999)), data_emissao: dia(s.int(3, 22)), valor_total: Math.round(s.int(400, 5200) * escala * 100) / 100, descricao: forn.item };
  if (tipo === "notas_saida" || tipo === "faturamento") return { ...base, tipo: tipo === "faturamento" ? "nota_fiscal_saida" : "nota_servico_prestado", emitente_nome: cliente.razao_social, emitente_cnpj: cliente.cnpj, destinatario_nome: "Diversos tomadores", numero: String(s.int(100, 2500)), data_emissao: dia(s.int(25, 28)), valor_total: Math.round(s.int(2500, 42000) * escala * 100) / 100, descricao: tipo === "faturamento" ? `Faturamento consolidado de ${nomeMes(comp)}` : "Serviços prestados no mês" };
  if (tipo === "comprovantes") return { ...base, tipo: "comprovante_pagamento", emitente_nome: forn.nome, emitente_cnpj: forn.cnpj, destinatario_nome: cliente.razao_social, destinatario_cnpj: cliente.cnpj, data_emissao: dia(s.int(5, 25)), valor_total: Math.round(s.int(150, 2400) * escala * 100) / 100, banco: s.um(BANCOS), descricao: `Pagamento · ${forn.item}` };
  if (tipo === "folha") return { ...base, tipo: "folha_pagamento", emitente_nome: cliente.razao_social, emitente_cnpj: cliente.cnpj, valor_total: Math.round(s.int(6000, 32000) * escala * 100) / 100, descricao: "Variáveis da folha: horas extras e faltas do mês" };
  return { ...base, tipo: "outro", destinatario_nome: cliente.razao_social, destinatario_cnpj: cliente.cnpj, descricao: `Posição de estoque em ${nomeMes(comp)}` };
}
const NOME_ARQUIVO = { extrato: "extrato", notas_entrada: "nf-compras", notas_saida: "notas-emitidas", comprovantes: "comprovantes", faturamento: "faturamento", folha: "variaveis-folha", estoque: "estoque" };

/**
 * Semeia o banco vazio. ia.definirAtraso(0) deixa as leituras instantâneas durante a semeadura.
 * @returns {Promise<{ empresa: any, usuarios: Record<string, any>, clientes: Record<string, any> }>}
 */
export async function semear({ repo, nucleo, cofre, agora = () => Date.now(), senhaHash }) {
  const s = sorteio(20261110);
  const t0 = agora();
  const hoje = hojeBR(t0);
  const c1 = competenciaAnterior(hoje);
  const comps = [somarMeses(c1, -2), somarMeses(c1, -1), c1];
  const H = 3600_000;
  const D = 24 * H;
  // Momento (ms) de um dia AAAA-MM-DD às hh:mm de Brasília, nunca no futuro
  const em = (d, hh = 10, mm = 0) => Math.min(Date.parse(`${d}T${dia2(hh)}:${dia2(mm)}:00-03:00`), t0 - 5 * 60_000);
  repo.db.exec(TABELA_HONORARIOS);

  const empresa = repo.inserir("empresas", {
    razao_social: "Escritório Exemplo Contabilidade Ltda",
    nome_fantasia: "Escritório Exemplo Contabilidade",
    cnpj: cnpjDemo(12_345_678),
    crc: "CRC-MG 000000/O-0",
    config: {
      whatsapp: { token_cripto: cofre.cifrar("demo-token-whatsapp"), segredo_cripto: cofre.cifrar("demo-segredo-app"), id_numero: ID_NUMERO_DEMO, verificacao: "demo-verificacao", template_cobranca: "cobranca_documentos", template_aviso: "aviso_guia_disponivel", idioma: "pt_BR" },
      email: { chave_cripto: cofre.cifrar("re_demo_chave"), remetente: "Escritório Exemplo <nao-responda@escritorioexemplo.demo>" },
      assistente: { ativo: true, assinatura: "Equipe Escritório Exemplo" },
      portal: { cor: "#0f766e", boas_vindas: "Bem-vindo ao portal do Escritório Exemplo! Aqui você envia documentos, baixa suas guias e fala com a nossa equipe." },
      ultima_rotina: hoje,
    },
  });
  const E = empresa.id;
  repo.rodar("UPDATE empresas SET criada_em = ? WHERE id = ?", t0 - 400 * D, E);
  semearEscritorio(repo, E);

  const senha = senhaHash ?? gerarHashSenha(SENHA_DEMO);
  const usuarios = {
    dono: repo.inserir("usuarios", { empresa_id: E, nome: "Marina Couto", email: EMAILS.dono, senha_hash: senha, papel: "dono", departamento: "contabil" }),
    colaborador: repo.inserir("usuarios", { empresa_id: E, nome: "Rafael Lima", email: EMAILS.colaborador, senha_hash: senha, papel: "equipe", departamento: "fiscal" }),
    beatriz: repo.inserir("usuarios", { empresa_id: E, nome: "Beatriz Nunes", email: "beatriz@escritorioexemplo.demo", senha_hash: senha, papel: "equipe", departamento: "dp" }),
  };

  /* ---------- Carteira ---------- */
  const clientes = {};
  for (const [i, c] of CARTEIRA.entries()) {
    const { chave, honorario, venc, resp, atrasado, atrasadoAnterior, asaas, ...campos } = c;
    const cl = repo.inserir("clientes", { ...campos, empresa_id: E, responsavel_id: usuarios[resp].id, honorario_centavos: honorario, cobrar: true, observacoes: i === 0 ? "Cliente desde 2019. Prefere WhatsApp." : null });
    repo.rodar("UPDATE clientes SET criado_em = ?, atualizado_em = ? WHERE id = ?", t0 - (380 - i * 20) * D, t0 - (30 - i) * D, cl.id);
    semearEsperados(repo, cl);
    clientes[chave] = { ...cl, demo: c };
  }
  const portalJuliana = repo.inserir("portal_usuarios", { empresa_id: E, cliente_id: clientes.padaria.id, nome: "Juliana Prado", email: EMAILS.cliente, whatsapp: clientes.padaria.whatsapp, senha_hash: senha, ultimo_acesso: t0 - 2 * D });
  repo.inserir("portal_usuarios", { empresa_id: E, cliente_id: clientes.clinica.id, nome: "Fernanda Alves", email: "fernanda@clinica.demo", whatsapp: clientes.clinica.whatsapp, senha_hash: senha, ultimo_acesso: t0 - 5 * D });

  /* ---------- Pendências e obrigações ---------- */
  for (const comp of comps) {
    gerarPendencias(repo, E, hoje, { competencia: comp });
    gerarTarefas(repo, E, hoje, { competencia: comp });
  }
  gerarPendencias(repo, E, hoje); // variáveis da folha do mês corrente
  gerarTarefas(repo, E, hoje);

  // Documentos: o cliente "mandou" e a IA leu, pelo caminho real (receber → ler → conferir → lançar)
  const porId = Object.fromEntries(Object.values(clientes).map((c) => [c.id, c]));
  const pendencias = repo.lista("pendencias", "WHERE empresa_id = ? ORDER BY competencia, prazo, nome", E);
  const recebidas = [];
  const faltamDe = new Set(["mercadinho", "restaurante", "construtora", "petshop", "oficina"]); // quem ainda deve documento do mês
  for (const p of pendencias) {
    const cl = porId[p.cliente_id];
    const atual = p.competencia === c1 || p.competencia === hoje.slice(0, 7);
    if (p.tipo === "folha" && p.competencia === hoje.slice(0, 7)) continue; // folha do mês: prazo dia 25
    if (atual && faltamDe.has(cl.demo.chave) && s() < 0.75) continue;
    if (atual && p.prazo > hoje && s() < 0.5) continue;
    if (!atual && cl.demo.chave === "studio" && p.tipo === "extrato" && p.competencia === comps[0]) {
      repo.atualizar("pendencias", E, p.id, { status: "dispensado" });
      continue;
    }
    const meta = leituraDe(p.tipo, cl, p.competencia, s);
    const origem = s.um(["portal", "whatsapp", "whatsapp", "equipe"]);
    const nome = `${NOME_ARQUIVO[p.tipo] ?? "documento"}-${p.competencia}.pdf`;
    const doc = await nucleo.receberDocumento({ empresa_id: E, cliente_id: cl.id, dados: pdfDemo(`${nome} · ${cl.razao_social}`, meta), mime: "application/pdf", nome, origem, enviado_por: origem === "equipe" ? usuarios.colaborador.nome : cl.contato_nome, competencia: p.competencia, pendencia_id: p.id });
    recebidas.push({ p, doc, cl, origem });
  }
  // Dois documentos com alerta para o contador ver a conferência da IA
  const extra1 = await nucleo.receberDocumento({ empresa_id: E, cliente_id: clientes.mercadinho.id, dados: pdfDemo("nf-48213", { ...leituraDe("notas_entrada", clientes.mercadinho, c1, s), destinatario_nome: "Mercado Outro Dono Ltda", destinatario_cnpj: cnpjDemo(44_556_677), numero: "48213" }), mime: "application/pdf", nome: "nota-fornecedor-48213.pdf", origem: "whatsapp", enviado_por: clientes.mercadinho.contato_nome, competencia: c1 });
  const extra2 = await nucleo.receberDocumento({ empresa_id: E, cliente_id: clientes.oficina.id, dados: pdfDemo("foto-recibo", { ...leituraDe("comprovantes", clientes.oficina, c1, s), tipo: "recibo", confianca: "baixa", observacoes: "Foto tremida: o número do recibo está ilegível." }), mime: "application/pdf", nome: "foto-recibo-pecas.pdf", origem: "whatsapp", enviado_por: clientes.oficina.contato_nome, competencia: c1 });
  // Arquivo que chegou de um número que não está no cadastro: a equipe direciona
  const semCliente = await nucleo.receberDocumento({ empresa_id: E, cliente_id: null, dados: pdfDemo("comprovante"), mime: "application/pdf", nome: "whatsapp-comprovante.pdf", origem: "whatsapp", enviado_por: "+55 34 99999-0099" });
  await nucleo.ocioso();

  // Datas e situação realistas: histórico conferido e exportado, o mês atual com uma fila a conferir
  const novos = new Set();
  const doMes = recebidas.filter((r) => r.p.competencia === c1).sort((a, b) => a.p.prazo.localeCompare(b.p.prazo));
  for (const r of doMes.slice(-9)) novos.add(r.doc.id);
  for (const r of recebidas) {
    const comp = r.p.competencia;
    const mesEnvio = r.p.tipo === "folha" ? comp : somarMeses(comp, 1);
    const ultimoDia = mesEnvio === hoje.slice(0, 7) ? Math.max(1, Math.min(9, Number(hoje.slice(8)))) : 9;
    const enviadoDia = `${mesEnvio}-${dia2(s.int(1, ultimoDia))}`;
    const quando = em(enviadoDia > hoje ? hoje : enviadoDia, s.int(8, 18), s.int(0, 59));
    const conferido = !novos.has(r.doc.id);
    repo.rodar("UPDATE documentos SET criado_em = ?, atualizado_em = ?, status = ?, conferido_por = ?, conferido_em = ? WHERE id = ?", quando, quando + H, conferido ? "conferido" : "novo", conferido ? s.um([usuarios.colaborador.nome, usuarios.dono.nome]) : null, conferido ? quando + s.int(2, 30) * H : null, r.doc.id);
    repo.rodar("UPDATE pendencias SET recebido_em = ? WHERE id = ?", quando, r.p.id);
    repo.rodar("UPDATE arquivos SET criado_em = ? WHERE id = (SELECT arquivo_id FROM documentos WHERE id = ?)", quando, r.doc.id);
    const st = !conferido ? "sugerido" : comp === c1 ? "aprovado" : "exportado";
    repo.rodar("UPDATE lancamentos SET status = ?, criado_em = ?, atualizado_em = ?, exportado_em = ? WHERE documento_id = ?", st, quando, quando, st === "exportado" ? quando + 3 * D : null, r.doc.id);
  }
  for (const [d, horas] of [[extra1, 20], [extra2, 6], [semCliente, 3]]) repo.rodar("UPDATE documentos SET criado_em = ?, atualizado_em = ? WHERE id = ?", t0 - horas * H, t0 - horas * H, d.id);

  // Régua de cobrança: o que ainda falta já foi lembrado pelo WhatsApp e e-mail
  for (const p of repo.lista("pendencias", "WHERE empresa_id = ? AND status = 'pendente' AND competencia = ?", E, c1)) {
    const cl = porId[p.cliente_id];
    const vezes = p.prazo < hoje ? Math.min(3, 1 + Math.floor(diasEntre(hoje, p.prazo) / 3)) : 1;
    repo.rodar("UPDATE pendencias SET cobrancas = ?, ultima_cobranca = ? WHERE id = ?", vezes, t0 - s.int(20, 60) * H, p.id);
  }
  for (const cl of Object.values(clientes)) {
    const n = repo.um("SELECT MAX(cobrancas) n FROM pendencias WHERE cliente_id = ? AND status = 'pendente'", cl.id)?.n ?? 0;
    for (let i = 0; i < n; i++) {
      const quando = t0 - (2 + i * 3) * D - s.int(1, 5) * H;
      for (const canal of ["whatsapp", "email"]) {
        const v = repo.inserir("envios", { empresa_id: E, cliente_id: cl.id, canal, destino: canal === "whatsapp" ? cl.whatsapp : cl.email, motivo: "cobranca", status: "enviado" });
        repo.rodar("UPDATE envios SET criado_em = ? WHERE id = ?", quando, v.id);
      }
    }
  }

  /* ---------- Obrigações: entregues, vencendo e atrasadas ---------- */
  const responsaveis = [usuarios.colaborador, usuarios.dono, usuarios.beatriz];
  const tarefas = repo.lista("tarefas", "WHERE empresa_id = ? ORDER BY prazo_legal, nome", E);
  const atrasar = new Set();
  // Duas atrasadas do mês anterior e uma do mês que está fechando (se já venceu)
  const ant = tarefas.filter((t) => t.competencia === comps[1] && ["restaurante", "construtora"].includes(porId[t.cliente_id].demo.chave) && t.departamento !== "dp");
  if (ant[0]) atrasar.add(ant[0].id);
  const antC = ant.find((t) => porId[t.cliente_id].demo.chave !== porId[ant[0].cliente_id].demo.chave);
  if (antC) atrasar.add(antC.id);
  const venc = tarefas.filter((t) => t.competencia === c1 && t.prazo_legal < hoje && porId[t.cliente_id].demo.chave === "mercadinho");
  if (venc[0]) atrasar.add(venc[0].id);
  for (const t of tarefas) {
    const dep = t.departamento === "dp" ? usuarios.beatriz : porId[t.cliente_id].demo.resp === "dono" ? usuarios.dono : usuarios.colaborador;
    let concluir;
    if (atrasar.has(t.id)) concluir = false;
    else if (t.prazo_legal < hoje) concluir = true;
    else if (t.competencia !== c1) concluir = s() < 0.3;
    else concluir = diasEntre(t.prazo_legal, hoje) > 7 ? s() < 0.35 : s() < 0.25;
    const campos = { responsavel_id: dep.id ?? s.um(responsaveis).id };
    if (concluir) {
      const fim = Math.min(em(somarDias(t.prazo_interno, -s.int(0, 3)), s.int(9, 17), s.int(0, 59)), t0 - s.int(1, 40) * H);
      Object.assign(campos, { status: "concluida", concluida_em: fim, concluida_por: dep.nome, minutos: s.int(10, 90) });
    } else if (t.prazo_interno <= somarDias(hoje, 3) && s() < 0.5) campos.status = "em_andamento";
    repo.atualizar("tarefas", E, t.id, campos);
  }

  /* ---------- Guias e relatórios no portal ---------- */
  const guiaDe = { DAS: "DAS", DAS_MEI: "DAS-MEI", PIS_COFINS: "DARF PIS/COFINS", FGTS: "Guia do FGTS", DARF_FOLHA: "DARF INSS/IRRF", ISS: "Guia do ISS" };
  const obrig = Object.fromEntries(repo.lista("obrigacoes", "WHERE empresa_id = ?", E).map((o) => [o.id, o.codigo]));
  for (const t of repo.lista("tarefas", "WHERE empresa_id = ? AND status = 'concluida' AND competencia IN (?, ?)", E, comps[1], c1)) {
    const cod = obrig[t.obrigacao_id];
    if (!guiaDe[cod]) continue;
    const cl = porId[t.cliente_id];
    const titulo = `${guiaDe[cod]} ${nomeMes(t.competencia)}`;
    const valor = Math.round(cl.demo.honorario * (cod === "DAS_MEI" ? 0.28 : cod === "DAS" ? s.int(60, 140) / 100 : s.int(30, 220) / 100));
    const a = await nucleo.salvarArquivo(E, { nome: `${titulo}.pdf`, mime: "application/pdf", dados: pdfDemo(titulo) });
    const vencida = t.prazo_legal < hoje;
    const status = vencida ? (cl.demo.chave === "restaurante" ? "visualizada" : "paga") : s.um(["disponivel", "visualizada"]);
    const en = repo.inserir("entregas", { empresa_id: E, cliente_id: cl.id, arquivo_id: a.id, titulo, tipo: "guia", competencia: t.competencia, vencimento: t.prazo_legal, valor_centavos: valor, status, tarefa_id: t.id, enviado_por: t.concluida_por, visualizado_em: status !== "disponivel" ? t.concluida_em + 6 * H : null, pago_em: status === "paga" ? Math.min(em(t.prazo_legal, 11), t0 - H) : null, avisado: true });
    repo.rodar("UPDATE entregas SET criado_em = ? WHERE id = ?", t.concluida_em, en.id);
    const v = repo.inserir("envios", { empresa_id: E, cliente_id: cl.id, canal: "whatsapp", destino: cl.whatsapp, motivo: "aviso_entrega", status: "enviado" });
    repo.rodar("UPDATE envios SET criado_em = ? WHERE id = ?", t.concluida_em + 60_000, v.id);
  }
  for (const chave of ["clinica", "transportes", "construtora", "nuvem"]) {
    const cl = clientes[chave];
    const titulo = `Balancete de ${nomeMes(comps[1])}`;
    const a = await nucleo.salvarArquivo(E, { nome: `${titulo}.pdf`, mime: "application/pdf", dados: pdfDemo(titulo) });
    const en = repo.inserir("entregas", { empresa_id: E, cliente_id: cl.id, arquivo_id: a.id, titulo, tipo: "relatorio", competencia: comps[1], status: "visualizada", enviado_por: usuarios.dono.nome, avisado: true });
    repo.rodar("UPDATE entregas SET criado_em = ? WHERE id = ?", em(`${c1}-${dia2(s.int(10, 20))}`), en.id);
  }

  /* ---------- Chamados ---------- */
  const chamado = (chave, assunto, departamento, origem, status, conversa, horasAtras) => {
    const cl = clientes[chave];
    let tt = t0 - horasAtras * H;
    const mensagens = conversa.map(([de, texto]) => ({ de, nome: de === "cliente" ? cl.contato_nome : usuarios.dono.nome, texto, em: (tt += s.int(20, 200) * 60_000) }));
    const ch = repo.inserir("chamados", { empresa_id: E, cliente_id: cl.id, assunto, departamento, origem, status, mensagens });
    repo.rodar("UPDATE chamados SET criado_em = ?, atualizado_em = ? WHERE id = ?", t0 - horasAtras * H, Math.min(tt, t0 - 60_000), ch.id);
    return ch;
  };
  chamado("clinica", "Distribuição de lucros para as sócias", "contabil", "portal", "aberto", [["cliente", "Boa tarde! Queremos distribuir lucros este mês. Qual o valor máximo sem tributação, considerando o presumido?"]], 26);
  chamado("restaurante", "Parcelamento do DAS em atraso", "fiscal", "whatsapp", "aberto", [["cliente", "Posso parcelar o DAS que ficou atrasado?"]], 30);
  chamado("transportes", "Admissão de motorista", "dp", "whatsapp", "respondido", [["cliente", "Vamos contratar um motorista na segunda. O que vocês precisam?"], ["escritorio", "Oi, Roberto! Envie RG, CPF, CTPS digital, comprovante de endereço e o exame admissional. Com isso registramos no eSocial no mesmo dia."]], 72);
  chamado("padaria", "Alteração de endereço no contrato social", "societario", "portal", "resolvido", [["cliente", "Mudamos a padaria de endereço. Precisa alterar o contrato?"], ["escritorio", "Precisa sim, Juliana. Já protocolamos a alteração na Junta Comercial; o novo CNPJ com endereço atualizado está nos seus documentos."]], 240);
  chamado("agencia", "Nota de serviço para cliente no exterior", "fiscal", "portal", "aberto", [["cliente", "Fechamos um job para uma empresa de Portugal. Como emito a nota? Tem ISS?"]], 5);

  /* ---------- Conversas do WhatsApp ---------- */
  const conversa = (chave, linhas, horasAtras) => {
    const cl = clientes[chave];
    let tt = t0 - horasAtras * H;
    for (const [direcao, texto, extra = {}] of linhas) {
      tt += s.int(1, 12) * 60_000;
      const m = repo.inserir("mensagens", { empresa_id: E, cliente_id: cl.id, wa_id: normalizarFone(cl.whatsapp), direcao, tipo: extra.documento_id ? "arquivo" : "texto", texto, documento_id: extra.documento_id ?? null, wamid: direcao === "entrada" ? `wamid.demo.semente.${chave}.${tt}` : null });
      repo.rodar("UPDATE mensagens SET criado_em = ? WHERE id = ?", Math.min(tt, t0 - 60_000), m.id);
    }
  };
  const docPadaria = recebidas.find((r) => r.cl.demo.chave === "padaria" && r.p.competencia === c1 && r.origem === "whatsapp")?.doc;
  conversa("padaria", [["saida", `[modelo cobranca_documentos] Juliana · Escritório Exemplo Contabilidade · Extrato bancário de ${nomeMes(c1)}`], ["entrada", "Bom dia! Segue o extrato 👇"], ["entrada", null, { documento_id: docPadaria?.id ?? null }], ["saida", "Recebi seu arquivo ✅ Já está com a equipe do Escritório Exemplo Contabilidade."], ["entrada", "Obrigada!"], ["saida", "Por nada! Qualquer coisa é só chamar por aqui. 😊\n— Equipe Escritório Exemplo"]], 52);
  conversa("mercadinho", [["entrada", "Oi, o que ainda falta eu mandar esse mês?"], ["saida", `Para fecharmos o mês do Mercadinho Bom Preço, ainda faltam: o extrato bancário e as notas de compras de ${nomeMes(c1)}. Pode mandar a foto ou o PDF aqui mesmo.\n— Equipe Escritório Exemplo`], ["entrada", "Mando amanhã cedo"]], 20);
  conversa("oficina", [["entrada", "Preciso da segunda via do DAS"], ["saida", "Claro! A guia do DAS está disponível no portal, com vencimento e valor. Se preferir, peço para a equipe mandar o PDF aqui.\n— Equipe Escritório Exemplo"], ["entrada", "Consegui baixar, valeu"]], 9);
  conversa("restaurante", [["entrada", "Posso parcelar o DAS que ficou atrasado?"], ["saida", "Ótima pergunta! Isso pede uma análise do contador com os números da Restaurante Sabor da Terra. Já passei para a equipe fiscal, que te responde ainda hoje. 👍\n— Equipe Escritório Exemplo"]], 30);
  conversa("transportes", [["entrada", "Vamos contratar um motorista na segunda. O que vocês precisam?"], ["saida", "Certo! Assuntos de folha ficam com o nosso Departamento Pessoal. Já encaminhei sua mensagem e a equipe te chama por aqui.\n— Equipe Escritório Exemplo"], ["saida", "Oi, Roberto! Envie RG, CPF, CTPS digital, comprovante de endereço e o exame admissional. Com isso registramos no eSocial no mesmo dia."]], 72);
  conversa("studio", [["entrada", "Bom dia! O DAS do MEI desse mês já saiu?"], ["saida", "Bom dia, Patrícia! Já está no portal: DAS-MEI com vencimento no dia 20. Quer que eu mande o PDF aqui?\n— Equipe Escritório Exemplo"], ["entrada", "Pode mandar sim"]], 4);

  /* ---------- Honorários (cobrança do escritório) ---------- */
  const mes0 = hoje.slice(0, 7);
  const honorario = (cl, competencia, vencimento, pago, extra = {}) =>
    repo.rodar(
      "INSERT INTO demo_honorarios (id, empresa_id, cliente_id, competencia, vencimento, valor_centavos, status, pago_em, forma, asaas_id, link, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      `hon-${cl.demo.chave}-${competencia}`,
      E,
      cl.id,
      competencia,
      vencimento,
      cl.demo.honorario,
      pago ? "pago" : "aberto",
      pago ? (extra.pago_em ?? Math.min(em(somarDias(vencimento, -s.int(0, 3)), s.int(8, 19)), t0 - H)) : null,
      pago ? (extra.forma ?? s.um(["Pix", "Pix", "Boleto", "Transferência"])) : null,
      extra.asaas_id ?? null,
      extra.link ?? null,
      em(somarDias(vencimento, -10)),
    );
  for (const cl of Object.values(clientes)) {
    const d = cl.demo;
    const venc0 = somarDias(hoje, d.venc);
    for (const k of [2, 1]) {
      const v = somarDias(venc0, -30 * k);
      honorario(cl, somarMeses(mes0, -k), v, !(k === 1 && d.atrasadoAnterior));
    }
    if (d.asaas) honorario(cl, mes0, venc0, true, { pago_em: t0 - 22 * H, forma: "Pix · Asaas", asaas_id: "pay_demo000001", link: "/demo/pagamento/pay_demo000001" });
    else honorario(cl, mes0, venc0, d.venc < 0 && !d.atrasado);
  }

  repo.auditar(E, "Nexor", "demonstracao_semeada", { clientes: CARTEIRA.length });
  return { empresa, usuarios, clientes, portal: portalJuliana };
}
