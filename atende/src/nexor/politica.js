/* O que cada situação do contrato permite no Atende IA e o que o Suporte Nexor pode esconder do cliente.

   - ativo / aviso: tudo funciona (no aviso, faixa amarela no painel)
   - restrito:      painel só para consulta (não salva alterações); a IA continua atendendo os clientes no WhatsApp
   - bloqueado:     painel suspenso e a IA para de responder. As mensagens que chegam continuam sendo
                    recebidas e guardadas (nada se perde) e voltam a ser atendidas quando o contrato normalizar.
   O usuário Suporte Nexor nunca é bloqueado. */

/** Teste grátis: as conversas com a IA são limitadas por dia em iaLiberada(); aqui só os módulos travados */
export const LIMITES_TESTE = {};

export const CATALOGO = {
  modulos: {
    "modulo.campanhas": { rotulo: "Campanhas", api: ["/api/campanhas", "/api/modelos"] },
    "modulo.agenda": { rotulo: "Agenda", api: ["/api/agenda"] },
    "modulo.ia": { rotulo: "Cérebro da IA (conhecimento, produtos, treino)", api: ["/api/conhecimento", "/api/aprendizados", "/api/produtos", "/api/playground"] },
    "modulo.contatos": { rotulo: "Contatos e funil", api: ["/api/contatos", "/api/funil"] },
  },
  abas: {
    "config.whatsapp": { rotulo: "WhatsApp (conexão com a Meta)", api: ["/api/canais"] },
    "config.horarios": { rotulo: "Horários e serviços", api: [] },
    "config.equipe": { rotulo: "Equipe", api: ["/api/usuarios"] },
    "config.rapidas": { rotulo: "Respostas rápidas", api: ["/api/respostas-rapidas"] },
    "config.empresa": { rotulo: "Empresa", api: ["/api/empresa"] },
    "config.auditoria": { rotulo: "Histórico", api: [] },
  },
  campos: {},
};
const TODAS = { ...CATALOGO.modulos, ...CATALOGO.abas, ...CATALOGO.campos };
export const chaveValida = (k) => Object.hasOwn(TODAS, k);
const sob = (caminho, prefixos) => prefixos.some((p) => caminho === p || caminho.startsWith(p + "/"));

export function bloqueadoPorAjuste(ocultos, metodo, caminho) {
  for (const k of ocultos) {
    const m = CATALOGO.modulos[k];
    if (m && sob(caminho, m.api)) return m.rotulo;
    const a = CATALOGO.abas[k];
    if (a && metodo !== "GET" && sob(caminho, a.api)) return a.rotulo;
  }
  return null;
}

const SEMPRE = new Set(["/api/estado", "/api/entrar", "/api/sair", "/api/eu", "/api/cadastro"]);

/** null = permitido; texto = motivo da recusa */
export function recusaPorLicenca(lic, metodo, caminho) {
  if (!lic || lic.situacao === "ativo" || lic.situacao === "aviso") return null;
  if (SEMPRE.has(caminho) || caminho.startsWith("/api/nexor/")) return null;
  if (lic.situacao === "restrito") return metodo === "GET" ? null : lic.mensagem || "Sistema em modo somente leitura. Fale com a Nexor.";
  return lic.mensagem || "Sistema suspenso. Fale com a Nexor.";
}

/** A IA pode responder os clientes no WhatsApp? */
/** A IA responde, salvo com o sistema suspenso ou, no teste grátis, acima das conversas do dia
    (contar() devolve a saúde: conversas_hoje inclui a conversa que acabou de chegar) */
export function iaLiberada(lic, contar = () => ({})) {
  if (lic?.situacao === "bloqueado") return false;
  const max = lic?.plano === "teste" ? lic.limites?.conversas_hoje : undefined;
  return !(Number.isFinite(max) && (contar()?.conversas_hoje ?? 0) > max);
}
