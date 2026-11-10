/* Modo Demonstração: monta a "Barbearia Navalha" (fictícia) com 75 dias de história, usando as próprias regras do
   sistema. Um relógio controlado "volta no tempo" e o roteiro agenda, atende, fecha comandas, vende produtos e cobra o
   clube pela API real — então caixa, comissões, estoque, clube e relatórios ficam coerentes entre si.
   Tudo é fictício: nomes inventados, celulares (34) 99999-xxxx, nenhum contato real. */

import { createHmac } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { hojeBR, paraMs, somarDias } from "../regras/datas.js";
import { criarSimulador } from "./simulador.js";

export const DEMO_SENHA = "demo-navalha-1";
export const PAPEIS = [
  { papel: "dono", email: "rafael@navalha.demo", nome: "Rafael Lima", descricao: "Dono: agenda, caixa, clube, relatórios e configurações", url: "/demo/entrar?papel=dono" },
  { papel: "recepcao", email: "carla@navalha.demo", nome: "Carla Mendes", descricao: "Recepção: agenda do dia, comandas e clube", url: "/demo/entrar?papel=recepcao" },
  { papel: "barbeiro", email: "bruno@navalha.demo", nome: "Bruno Rocha", descricao: "Barbeiro: só a própria agenda e as próprias comissões", url: "/demo/entrar?papel=barbeiro" },
  { papel: "cliente", nome: "Lucas Andrade", descricao: "Cliente no app: agenda em segundos, clube e loja", url: "/demo/entrar?papel=cliente" },
];
export const SEGREDO_WHATSAPP = "segredo-meta-demonstracao";
export const CLIENTE_APP_FONE = "34999990001";

const NOMES = ["Lucas Andrade", "Pedro Henrique", "Gabriel Souza", "Matheus Oliveira", "Rafael Costa", "Guilherme Martins", "Felipe Araújo", "João Vitor", "Thiago Ribeiro", "Bruno Carvalho", "Leonardo Alves", "Gustavo Pereira", "Vinícius Rocha", "Eduardo Lima", "Diego Fernandes", "André Santos", "Caio Moreira", "Renan Barbosa", "Rodrigo Teixeira", "Marcelo Nunes", "Igor Cardoso", "Daniel Freitas", "Samuel Duarte", "Otávio Pinto", "Henrique Gomes", "Arthur Mendes", "Murilo Castro", "Enzo Ramos", "Davi Correia", "Heitor Batista", "Miguel Farias", "Bernardo Lopes", "Fábio Monteiro", "Ricardo Viana", "Paulo César", "Alexandre Melo", "Júlio Campos", "Wesley Dias", "Kauã Rezende", "Nicolas Siqueira", "Alan Prado", "Cristiano Faria", "Luan Medeiros", "Danilo Brito", "Jonas Paiva", "Hugo Bastos", "Emanuel Cunha", "Yuri Antunes", "Fernando Queiroz", "Zuléica Amaral"];
const PRODUTOS = [
  { nome: "Pomada modeladora efeito seco", categoria: "Cabelo", preco_centavos: 4500, custo_centavos: 1900, estoque: 18, estoque_minimo: 5 },
  { nome: "Óleo para barba Navalha", categoria: "Barba", preco_centavos: 3900, custo_centavos: 1500, estoque: 12, estoque_minimo: 4 },
  { nome: "Balm hidratante para barba", categoria: "Barba", preco_centavos: 4200, custo_centavos: 1700, estoque: 4, estoque_minimo: 5 },
  { nome: "Shampoo anticaspa 250 ml", categoria: "Cabelo", preco_centavos: 3500, custo_centavos: 1400, estoque: 15, estoque_minimo: 4 },
  { nome: "Minoxidil 5% 60 ml", categoria: "Barba", preco_centavos: 6900, custo_centavos: 3100, estoque: 9, estoque_minimo: 3 },
  { nome: "Pente de madeira", categoria: "Acessórios", preco_centavos: 2500, custo_centavos: 800, estoque: 20, estoque_minimo: 5 },
];

/** Cliente HTTP mínimo com cookies (o roteiro usa a API real do sistema) */
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
    return { status: r.status, dados };
  }
  const ok = async (p) => {
    const r = await p;
    if (r.status !== 200) throw new Error(`demo: ${JSON.stringify(r.dados)}`);
    return r.dados;
  };
  return { chamar, get: (c) => ok(chamar("GET", c)), post: (c, b = {}) => ok(chamar("POST", c, b)), put: (c, b = {}) => ok(chamar("PUT", c, b)), tentar: (m, c, b) => chamar(m, c, b) };
}

/** Semente determinística: a mesma demonstração toda vez */
function sorteio(semente = 20261110) {
  let s = semente;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return { r, item: (lista) => lista[Math.floor(r() * lista.length)], chance: (p) => r() < p };
}

/**
 * Apaga a pasta de dados e monta a demonstração do zero. `agoraReal` é o "hoje" da apresentação.
 * `montarAplicacao` vem do servidor (evita importação circular). Devolve o caminho do banco pronto.
 */
export async function semear({ cfg, montarAplicacao, agoraReal = Date.now(), dias = 75, log = () => {} }) {
  rmSync(cfg.pastaDados, { recursive: true, force: true });
  const hoje = hojeBR(agoraReal);
  let t = paraMs(somarDias(hoje, -dias), "07:00");
  const relogio = () => t;
  const ir = (dia, hora) => (t = paraMs(dia, hora));
  const sim = criarSimulador({ agora: relogio });
  const app = montarAplicacao({ cfg: { ...cfg, sessaoDias: 400, sessaoClienteDias: 400 }, agora: relogio, fetchFn: sim.fetchFn });
  await new Promise((ok) => app.servidor.listen(0, "127.0.0.1", ok));
  const api = cliente(`http://127.0.0.1:${app.servidor.address().port}`);
  const x = sorteio();
  try {
    // Barbearia, marca, horário (aberta de segunda a sábado e domingo de manhã), canais simulados
    await api.post("/api/cadastro", { barbearia: "Barbearia Navalha", nome: PAPEIS[0].nome, email: PAPEIS[0].email, senha: DEMO_SENHA, tambem_corta: true });
    const turnos = [["09:00", "12:00"], ["13:00", "19:00"]];
    await api.put("/api/config", {
      horario: { 0: [["09:00", "13:00"]], 1: turnos, 2: turnos, 3: turnos, 4: turnos, 5: [["09:00", "12:00"], ["13:00", "20:00"]], 6: [["08:00", "12:00"], ["13:00", "17:00"]] },
      marca: { slogan: "Corte na régua, atendimento de amigo", endereco: "Av. Brasil, 1500 · Centro · Araguari (MG)", telefone: "(34) 99999-0000", instagram: "@barbearianavalha.demo" },
      retorno: { ativo: true, margem_dias: 3 },
    });
    await api.put("/api/canais", { whatsapp: { id_numero: "1000000000", token: "token-demonstracao", segredo: SEGREDO_WHATSAPP }, sms: { sid: "ACdemonstracao", token: "token-demonstracao", de: "+5534999990000", avisos: true }, asaas: { chave: "chave-demonstracao-asaas", ambiente: "sandbox" } });

    const servicos = await api.get("/api/servicos");
    const S = Object.fromEntries(servicos.map((s) => [s.nome, s]));
    await api.post("/api/servicos", { nome: "Pigmentação de barba", duracao_min: 30, preco_centavos: 3500, categoria: "Barba" });
    const [rafael] = await api.get("/api/barbeiros");
    const bruno = await api.post("/api/barbeiros", { nome: "Bruno Rocha", comissao_servico: 50, comissao_produto: 10, cor: "#f97316", bio: "Especialista em degradê e barba desenhada." });
    const diego = await api.post("/api/barbeiros", { nome: "Diego Prado", comissao_servico: 45, comissao_produto: 10, cor: "#22c55e", bio: "Cortes clássicos e navalha." });
    const barbeiros = [rafael, bruno, diego];
    await api.post("/api/usuarios", { nome: PAPEIS[1].nome, email: PAPEIS[1].email, senha: DEMO_SENHA, papel: "recepcao" });
    await api.post("/api/usuarios", { nome: PAPEIS[2].nome, email: PAPEIS[2].email, senha: DEMO_SENHA, papel: "barbeiro", barbeiro_id: bruno.id });

    const produtos = [];
    for (const p of PRODUTOS) produtos.push(await api.post("/api/produtos", { ...p, vitrine: true }));
    const plano = await api.post("/api/planos", { nome: "Clube Navalha", descricao: "4 cortes por mês e 10% nos produtos", preco_centavos: 8990, itens: [{ servico_id: S.Corte.id, quantidade: 4 }], desconto_produtos: 10 });
    await api.post("/api/planos", { nome: "Clube Navalha Completo", descricao: "Corte e barba à vontade de terça a quinta", preco_centavos: 14990, itens: [{ servico_id: S["Corte + barba"].id, quantidade: 0 }], dias_semana: [2, 3, 4], desconto_produtos: 15 });

    const clientes = [];
    for (let i = 0; i < NOMES.length; i++) {
      const fone = `349999${String(90001 + i).slice(-5)}`.slice(0, 11);
      const nasc = `19${80 + (i % 20)}-${String(((i * 7) % 12) + 1).padStart(2, "0")}-${String(((i * 11) % 27) + 1).padStart(2, "0")}`;
      clientes.push(await api.post("/api/clientes", { nome: NOMES[i], fone, nascimento: i === 3 ? `1992-${hoje.slice(5, 7)}-15` : nasc }));
    }

    // Clube: 14 assinantes; os do Asaas renovam pelo webhook simulado, os do balcão pelo pagamento manual
    const assinantes = [];
    for (let i = 0; i < 14; i++) {
      const c = clientes[i];
      const a = await api.post("/api/assinaturas", { cliente_id: c.id, plano_id: plano.id, pago_agora: i % 2 ? "pix" : "dinheiro" });
      assinantes.push({ a, c, atrasa: i === 5 });
    }

    // História: cada dia aberto ganha de 9 a 16 atendimentos; ~85% concluídos, alguns com produto; algumas faltas
    const servicoDoDia = () => x.item([S.Corte, S.Corte, S.Corte, S["Corte + barba"], S["Corte + barba"], S.Barba, S.Sobrancelha]);
    const horas = ["09:00", "09:45", "10:30", "11:15", "13:00", "13:45", "14:30", "15:15", "16:00", "16:45", "17:30", "18:15"];
    const atender = async (dia, { ateHora = "23:59", agoraDia = false } = {}) => {
      ir(dia, "07:00");
      const marcados = [];
      for (const b of barbeiros)
        for (const h of horas) {
          if (!x.chance(agoraDia ? 0.82 : 0.48)) continue;
          const c = x.chance(0.3) ? assinantes[Math.floor(x.r() * assinantes.length)].c : x.item(clientes);
          const r = await api.tentar("POST", "/api/agendamentos", { cliente_id: c.id, servico_id: (x.chance(0.6) ? S.Corte : servicoDoDia()).id, barbeiro_id: b.id, dia, hora: h });
          if (r.status === 200) marcados.push(r.dados);
        }
      ir(dia, "08:30");
      await app.rotina().catch(() => {});
      for (const ag of marcados.sort((a, b) => a.inicio - b.inicio)) {
        if (ag.hora > ateHora) continue;
        t = ag.inicio + 35 * 60_000;
        if (x.chance(0.06)) {
          await api.tentar("PUT", `/api/agendamentos/${ag.id}`, { status: "faltou" });
          continue;
        }
        if (x.chance(0.04)) {
          await api.tentar("PUT", `/api/agendamentos/${ag.id}`, { status: "cancelado" });
          continue;
        }
        const levar = x.chance(0.22) ? [{ id: x.item(produtos).id, quantidade: 1 }] : [];
        await api.tentar("POST", `/api/agendamentos/${ag.id}/concluir`, { forma: x.item(["pix", "pix", "pix", "credito", "debito", "dinheiro"]), produtos: levar });
      }
      return marcados;
    };

    for (let d = dias; d >= 1; d--) {
      const dia = somarDias(hoje, -d);
      await atender(dia);
      // Renovação mensal do clube no aniversário do ciclo (um assinante fica em atraso)
      if (d % 30 === 0)
        for (const s of assinantes) {
          if (s.atrasa && d === 30) continue;
          ir(dia, "10:00");
          await api.tentar("POST", `/api/assinaturas/${s.a.id}/pagamento`, { forma: "pix" });
        }
      // Venda avulsa no balcão (cliente que só passou para comprar)
      if (x.chance(0.35)) {
        ir(dia, "17:50");
        await api.tentar("POST", "/api/vendas", { itens: [{ tipo: "produto", id: x.item(produtos).id, quantidade: 1 }], forma: "pix" });
      }
      // Reposição semanal do fornecedor (o produto que acaba volta à prateleira)
      if (d % 7 === 0) {
        ir(dia, "08:00");
        for (const p of await api.get("/api/produtos")) if (p.estoque < 8) await api.tentar("POST", `/api/produtos/${p.id}/estoque`, { tipo: "entrada", quantidade: 15, motivo: "Compra do fornecedor" });
      }
      if (d % 15 === 0) log(`demo: ${dias - d} de ${dias} dias`);
    }

    // Um produto abaixo do mínimo (o painel avisa para repor)
    ir(somarDias(hoje, -1), "18:30");
    const balm = (await api.get("/api/produtos")).find((p) => p.nome.startsWith("Balm"));
    if (balm && balm.estoque > 3) await api.tentar("POST", `/api/produtos/${balm.id}/estoque`, { tipo: "ajuste", quantidade: 3 - balm.estoque, motivo: "Conferência de estoque" });

    // Hoje: agenda cheia; o que já passou foi atendido, o horário atual está na cadeira e o próximo cliente chegou
    const horaAgora = new Date(agoraReal - 3 * 3600_000).toISOString().slice(11, 16);
    const deHoje = await atender(hoje, { ateHora: somarHora(horaAgora, -50), agoraDia: true });
    t = agoraReal - 60_000;
    const futuros = deHoje.filter((a) => a.hora >= somarHora(horaAgora, -50) && a.status === "agendado").sort((a, b) => a.inicio - b.inicio);
    if (futuros[0]) await api.tentar("PUT", `/api/agendamentos/${futuros[0].id}`, { status: "em_atendimento" });
    if (futuros[1]) await api.tentar("PUT", `/api/agendamentos/${futuros[1].id}`, { status: "chegou" });
    // Amanhã e depois: agenda já marcada (o cliente vê horários ocupados no app)
    for (const d of [1, 2]) {
      const dia = somarDias(hoje, d);
      ir(hoje, "06:00");
      for (const b of barbeiros)
        for (const h of horas) if (x.chance(0.4)) await api.tentar("POST", "/api/agendamentos", { cliente_id: x.item(clientes).id, servico_id: S.Corte.id, barbeiro_id: b.id, dia, hora: h });
    }
    // O cliente do app (Lucas) tem horário marcado para amanhã e é assinante do clube
    ir(hoje, "06:10");
    const lucas = clientes[0];
    for (const h of ["10:30", "14:30", "16:00"]) {
      const r = await api.tentar("POST", "/api/agendamentos", { cliente_id: lucas.id, servico_id: S.Corte.id, barbeiro_id: bruno.id, dia: somarDias(hoje, 1), hora: h });
      if (r.status === 200) break;
    }
    // Um assinante pelo Asaas com a cobrança em aberto (o vendedor simula o pagamento ao vivo)
    t = agoraReal - 30 * 60_000;
    await api.tentar("POST", "/api/assinaturas", { cliente_id: clientes[20].id, plano_id: plano.id, cpf: "52998224725" });
    t = agoraReal - 5 * 60_000;
    await app.rotina().catch(() => {});
    // Quase metade dos horários chega pelo app do cliente (o roteiro agenda pelo painel para controlar as datas)
    app.repo.db.exec("UPDATE agendamentos SET origem = 'app' WHERE (instr('0123456789abcdef', substr(id, 1, 1)) - 1) < 7 AND origem = 'painel'");
    log("demo: Barbearia Navalha pronta");
    return { banco: join(cfg.pastaDados, "barber.db") };
  } finally {
    app.fechar();
  }
}

function somarHora(hhmm, min) {
  const [h, m] = hhmm.split(":").map(Number);
  const tot = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + min));
  return `${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
}

/** Assinatura HMAC da Meta para simular uma mensagem chegando no webhook do WhatsApp */
export const assinarMeta = (corpo) => `sha256=${createHmac("sha256", SEGREDO_WHATSAPP).update(corpo).digest("hex")}`;
