/* O que cada situação do contrato permite no Nexor Barber e o que o Suporte Nexor pode esconder.

   - ativo / aviso: tudo funciona (no aviso, faixa no painel)
   - restrito:      painel só para consulta; o app dos clientes continua agendando (os clientes não são prejudicados)
   - bloqueado:     painel e agendamento online suspensos; lembretes e ofertas pausados.
   O usuário Suporte Nexor nunca é bloqueado. */

/** Teste grátis: o que cada limite da licença conta (chave da saúde) e quais POST criam mais um */
export const LIMITES_TESTE = {
  barbeiros: { rotas: ["/api/barbeiros"], rotulo: "barbeiros" },
  agendamentos_mes: { rotas: ["/api/agendamentos", "/api/app/agendar"], rotulo: "agendamentos no mês" },
};

export const CATALOGO = {
  modulos: {
    "modulo.clube": { rotulo: "Clube de assinatura", api: ["/api/planos", "/api/assinaturas", "/api/app/assinar", "/api/app/assinatura"] },
    "modulo.produtos": { rotulo: "Produtos e estoque", api: ["/api/produtos"] },
    "modulo.espera": { rotulo: "Lista de espera", api: ["/api/espera", "/api/app/espera", "/api/app/vaga"] },
    "modulo.relatorios": { rotulo: "Relatórios", api: ["/api/relatorios"] },
  },
  abas: {
    "config.barbearia": { rotulo: "Dados e regras da barbearia", api: ["/api/config"] },
    "config.canais": { rotulo: "WhatsApp, SMS, Google e Asaas", api: ["/api/canais"] },
    "config.equipe": { rotulo: "Acessos da equipe", api: ["/api/usuarios"] },
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

const SEMPRE = new Set(["/api/estado", "/api/entrar", "/api/sair", "/api/eu", "/api/cadastro", "/api/app/info", "/api/app/eu", "/api/app/sair"]);

export function recusaPorLicenca(lic, metodo, caminho) {
  if (!lic || lic.situacao === "ativo" || lic.situacao === "aviso") return null;
  if (SEMPRE.has(caminho) || caminho.startsWith("/api/nexor/")) return null;
  const app = caminho.startsWith("/api/app/");
  if (lic.situacao === "restrito") return app || metodo === "GET" ? null : lic.mensagem || "Sistema em modo somente leitura. Fale com a Nexor.";
  return app ? "O agendamento online está temporariamente indisponível. Fale com a barbearia pelo telefone." : lic.mensagem || "Sistema suspenso. Fale com a Nexor.";
}
