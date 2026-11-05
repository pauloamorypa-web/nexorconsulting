/* O que cada situação do contrato permite no Nexor Contábil e o que o Suporte Nexor pode esconder.

   - ativo / aviso: tudo funciona (no aviso, faixa no painel)
   - restrito:      painel do escritório só para consulta; o portal e o WhatsApp dos clientes continuam
                    recebendo documentos (os clientes do escritório não são prejudicados)
   - bloqueado:     painel e portal suspensos, régua de cobrança, leitura com IA e respostas automáticas pausadas.
                    O que chega pelo WhatsApp continua guardado e é tratado quando o contrato normalizar.
   O usuário Suporte Nexor nunca é bloqueado. */

/** Teste grátis: o que cada limite da licença conta (chave da saúde) e quais POST criam mais um */
export const LIMITES_TESTE = {
  carteira: { rotas: ["/api/clientes"], rotulo: "empresas na carteira" },
  documentos_mes: { rotas: ["/api/documentos", "/api/portal/documentos"], rotulo: "documentos no mês" },
};

export const CATALOGO = {
  modulos: {
    "modulo.leitura": { rotulo: "Leitura de documentos e lançamentos", api: ["/api/lancamentos"] },
    "modulo.obrigacoes": { rotulo: "Obrigações e prazos", api: ["/api/tarefas", "/api/obrigacoes"] },
    "modulo.cobranca": { rotulo: "Cobrança de documentos", api: ["/api/pendencias", "/api/cobrar"] },
    "modulo.portal": { rotulo: "Portal do cliente (guias e chamados)", api: ["/api/entregas", "/api/chamados"] },
  },
  abas: {
    "config.escritorio": { rotulo: "Escritório", api: ["/api/escritorio"] },
    "config.usuarios": { rotulo: "Equipe", api: ["/api/usuarios"] },
    "config.canais": { rotulo: "WhatsApp e e-mail", api: ["/api/canais"] },
    "config.regua": { rotulo: "Régua de cobrança", api: ["/api/regua"] },
    "config.obrigacoes": { rotulo: "Catálogo de obrigações", api: ["/api/obrigacoes"] },
    "config.exportacao": { rotulo: "Layout de exportação e contas", api: ["/api/exportacao"] },
    "config.auditoria": { rotulo: "Auditoria", api: [] },
  },
  campos: {},
};
const TODAS = { ...CATALOGO.modulos, ...CATALOGO.abas };
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

const SEMPRE = new Set(["/api/estado", "/api/entrar", "/api/sair", "/api/eu", "/api/cadastro", "/api/portal/estado", "/api/portal/entrar", "/api/portal/sair", "/api/portal/eu"]);

export function recusaPorLicenca(lic, metodo, caminho) {
  if (!lic || lic.situacao === "ativo" || lic.situacao === "aviso") return null;
  if (SEMPRE.has(caminho) || caminho.startsWith("/api/nexor/")) return null;
  const portal = caminho.startsWith("/api/portal/");
  if (lic.situacao === "restrito") return portal || metodo === "GET" ? null : lic.mensagem || "Sistema em modo somente leitura. Fale com a Nexor.";
  return portal ? "O portal está temporariamente indisponível. Fale com o seu escritório de contabilidade." : lic.mensagem || "Sistema suspenso. Fale com a Nexor.";
}
