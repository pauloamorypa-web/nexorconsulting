/* Cadência de acompanhamento dos leads mornos: D+0, D+2 e D+7, por WhatsApp e e-mail.
   É só uma SUGESTÃO para a equipe: nada aqui envia mensagem. E só se sugere contato ativo para quem
   deu consentimento (opt-in, aceita_contato); sem opt-in, o primeiro passo é pedir permissão. */

import { UMBRELLA, campanhaPorId } from "./campanhas.js";

export const PASSOS = [0, 2, 7];

const preencher = (modelo, vars) =>
  (vars.nome ? modelo : modelo.replace(/,? \{nome\}/g, ""))
    .replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "")
    .replace(/ {2,}/g, " ")
    .replace(/ ([.,!?])/g, "$1")
    .trim();

/** Mensagens da cadência para um lead morno, já com nome, empresa e produto. */
export function cadenciaDoLead(lead, { inicio } = {}) {
  const campanha = campanhaPorId(lead.campanha) ?? UMBRELLA;
  const comeco = new Date(inicio ?? lead.qualificado_em ?? lead.registrado_em);
  const vars = {
    nome: lead.nome?.trim().split(/\s+/)[0] ?? "",
    empresa: lead.empresa ?? "sua empresa",
    produto: lead.produto_indicado ?? (campanha.umbrella ? "um projeto sob medida" : campanha.produto),
    // Preço só entra para quem pediu (tabela comercial em validação: confira antes de enviar)
    preco: lead.sinais?.pediu_preco ? `Valores de referência: ${campanha.preco}. ` : "",
  };
  vars.o_produto = vars.produto.startsWith("um ") ? vars.produto : vars.produto.startsWith("Soluções") ? `as ${vars.produto}` : `o ${vars.produto}`;
  const optIn = lead.aceita_contato === true;
  const passos = PASSOS.map((dia) => {
    const m = campanha.cadencia[`d${dia}`];
    const quando = new Date(comeco.getTime() + dia * 86400_000).toISOString().slice(0, 10);
    return {
      dia: `D+${dia}`,
      data: quando,
      whatsapp: preencher(m.whatsapp, vars),
      email: { assunto: preencher(m.email.assunto, vars), texto: preencher(m.email.texto, vars) },
    };
  });
  return {
    lead: lead.id,
    campanha: campanha.id,
    produto: vars.produto,
    opt_in: optIn,
    envio_automatico: false,
    aviso: optIn
      ? "Sugestão para a equipe enviar manualmente. Confira o preço na tabela comercial antes de mandar."
      : "Sem consentimento para contato ativo: antes da cadência, peça permissão (ex.: \"Posso te mandar um resumo por aqui?\").",
    passos: optIn ? passos : [{ ...passos[0], whatsapp: `Oi${vars.nome ? `, ${vars.nome}` : ""}! Aqui é da Nexor. Posso te mandar um resumo sobre ${vars.o_produto} por aqui ou por e-mail?`, email: null }],
  };
}

/** Passo que vence hoje (ou o próximo) para cada lead morno. */
export function cadenciaPendente(leads, agora = new Date()) {
  return leads
    .filter((l) => l.classe === "morno" || (l.temperatura === "morno" && !l.classe))
    .map((l) => {
      const c = cadenciaDoLead(l);
      const hoje = agora.toISOString().slice(0, 10);
      const proximo = c.passos.find((p) => p.data >= hoje) ?? null;
      return { ...c, nome: l.nome, contato: l.telefone ?? l.email, proximo };
    })
    .filter((c) => c.proximo);
}
