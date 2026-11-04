/* Regras de cobrança da Nexor Central: geração das mensalidades, situação de cada cliente
   (ativo → aviso → restrito → bloqueado) e o conteúdo da licença enviada aos sistemas. */

const FUSO = "America/Sao_Paulo";
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

/** Data de hoje em Brasília (AAAA-MM-DD) */
export const hojeBR = (ms = Date.now()) => fmt.format(new Date(ms));
const diaUTC = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
/** Dias de b até a (a - b) */
export const diasEntre = (a, b) => Math.round((diaUTC(a) - diaUTC(b)) / 86400_000);
export function somarDias(d, n) {
  const x = new Date(diaUTC(d) + n * 86400_000);
  return x.toISOString().slice(0, 10);
}
export const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/** Vencimento da competência AAAA-MM no dia escolhido (meses curtos: último dia) */
export function vencimentoDe(competencia, dia) {
  const [a, m] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${competencia}-${String(Math.min(Math.max(1, dia), ultimo)).padStart(2, "0")}`;
}
export function proximaCompetencia(c) {
  const [a, m] = c.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

export const regrasDe = (cliente, padrao) => ({ ...padrao, ...(cliente.regras ?? {}) });

/**
 * Situação do cliente hoje.
 * - bloqueio manual ou contrato cancelado → bloqueado
 * - liberação temporária (promessa de pagamento) válida → ativo
 * - senão, pelo atraso da fatura aberta mais antiga: ≥ bloqueio → bloqueado; ≥ restrito → restrito; ≥ aviso → aviso
 */
export function situacaoCliente(cliente, faturasAbertas, hoje, padrao) {
  const r = regrasDe(cliente, padrao);
  const vencidas = faturasAbertas.filter((f) => f.status === "aberta" && f.vencimento < hoje).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const maisAntiga = vencidas[0] ?? null;
  const atraso = maisAntiga ? diasEntre(hoje, maisAntiga.vencimento) : 0;
  const base = { atraso, fatura: maisAntiga, regras: r, link: maisAntiga?.link ?? null };
  if (cliente.status === "cancelado") return { ...base, situacao: "bloqueado", motivo: "cancelado", mensagem: "Contrato encerrado. Fale com a Nexor para reativar o sistema." };
  if (cliente.bloqueio_manual) return { ...base, situacao: "bloqueado", motivo: "manual", mensagem: `Sistema suspenso pela Nexor: ${cliente.bloqueio_manual}` };
  if (cliente.liberado_ate && cliente.liberado_ate >= hoje) return { ...base, situacao: "ativo", motivo: "liberado", mensagem: "" };
  if (!maisAntiga || atraso < r.aviso) return { ...base, situacao: "ativo", motivo: null, mensagem: "" };
  const venc = dataBR(maisAntiga.vencimento);
  const diaRestrito = dataBR(somarDias(maisAntiga.vencimento, r.restrito));
  const diaBloqueio = dataBR(somarDias(maisAntiga.vencimento, r.bloqueio));
  if (atraso >= r.bloqueio) return { ...base, situacao: "bloqueado", motivo: "inadimplencia", mensagem: `Sistema suspenso por falta de pagamento (fatura vencida em ${venc}). Assim que o pagamento for confirmado, o sistema volta sozinho.` };
  if (atraso >= r.restrito) return { ...base, situacao: "restrito", motivo: "inadimplencia", mensagem: `Sistema em modo somente leitura: a fatura de ${venc} está em aberto. A suspensão total acontece em ${diaBloqueio}.` };
  return { ...base, situacao: "aviso", motivo: "inadimplencia", mensagem: `A fatura da Nexor com vencimento em ${venc} está em aberto. Regularize para evitar restrições a partir de ${diaRestrito}.` };
}

/** Mensalidades que já deveriam existir: mês atual e o próximo, a partir da antecedência configurada */
export function mensalidadesDevidas(cliente, existentes, hoje, padrao) {
  if (cliente.status !== "ativo" || !(cliente.valor_centavos > 0)) return [];
  const r = regrasDe(cliente, padrao);
  const inicio = cliente.inicio_cobranca || hojeBR(cliente.criado_em);
  const ja = new Set(existentes.map((f) => f.competencia));
  const novas = [];
  for (let c = hoje.slice(0, 7), i = 0; i < 2; c = proximaCompetencia(c), i++) {
    const venc = vencimentoDe(c, cliente.dia_vencimento);
    if (venc < inicio || ja.has(c)) continue;
    if (diasEntre(venc, hoje) > r.antecedencia) continue;
    novas.push({ competencia: c, vencimento: venc, valor_centavos: cliente.valor_centavos, descricao: `Mensalidade ${c.slice(5)}/${c.slice(0, 4)}${cliente.plano ? ` · ${cliente.plano}` : ""}` });
  }
  return novas;
}

/** Conteúdo da licença de um sistema (assinado pela Central) */
export function conteudoLicenca(sistema, cliente, st, agora, diasValidade, contato = {}) {
  return {
    v: 1,
    tipo: "licenca",
    inst: sistema.id,
    cli: cliente.id,
    produto: sistema.produto,
    cliente: cliente.nome_fantasia || cliente.razao_social,
    situacao: st.situacao,
    mensagem: st.mensagem,
    link: st.link,
    manter_ponto: st.regras.manter_ponto !== false,
    contato: { whatsapp: contato.whatsapp || null, email: contato.email || null },
    emitida: agora,
    valido_ate: agora + diasValidade * 86400_000,
  };
}
