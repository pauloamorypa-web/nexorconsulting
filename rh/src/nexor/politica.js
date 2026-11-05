/* O que cada situação do contrato permite e o que o Suporte Nexor pode ocultar no sistema do cliente.

   Situações (vindas da licença da Nexor Central):
   - ativo:     tudo funciona
   - aviso:     tudo funciona, com faixa de aviso no painel
   - restrito:  painel em somente leitura (consulta e relatórios); o ponto continua funcionando
   - bloqueado: painel suspenso. Continuam: login, a tela de aviso e os arquivos legais do ponto (AFD, AEJ, espelho),
                que a empresa precisa ter para a fiscalização. O ponto pelo app e pelo quiosque continua
                se o contrato manter_ponto = true (padrão), para não deixar o trabalhador sem registro.
   O usuário Suporte Nexor nunca é bloqueado. */

/** Itens que o Suporte Nexor pode esconder do cliente. Módulos somem do menu e a API recusa; abas de
    configuração somem da tela e a API recusa alterações (a leitura continua para as outras telas). */
/** Teste grátis: o que cada limite da licença conta (chave da saúde) e quais POST criam mais um */
export const LIMITES_TESTE = { colaboradores: { rotas: ["/api/colaboradores"], rotulo: "colaboradores ativos" } };

export const CATALOGO = {
  modulos: {
    "modulo.folha": { rotulo: "Folha de pagamento", api: ["/api/folhas", "/api/lancamentos", "/api/rescisao", "/api/beneficios"] },
    "modulo.recrutamento": { rotulo: "Recrutamento", api: ["/api/vagas", "/api/candidatos", "/api/recrutamento"] },
    "modulo.esocial": { rotulo: "eSocial", api: ["/api/esocial"] },
    "modulo.comunicados": { rotulo: "Comunicados", api: ["/api/comunicados"] },
    "modulo.ferias": { rotulo: "Férias e ausências", api: ["/api/ferias", "/api/afastamentos"] },
  },
  abas: {
    "config.locais": { rotulo: "Locais e quiosque", api: ["/api/estabelecimentos"] },
    "config.jornadas": { rotulo: "Jornadas", api: [] },
    "config.cargos": { rotulo: "Cargos", api: [] },
    "config.departamentos": { rotulo: "Departamentos", api: [] },
    "config.feriados": { rotulo: "Feriados", api: [] },
    "config.usuarios": { rotulo: "Usuários", api: ["/api/usuarios"] },
    "config.esocial": { rotulo: "eSocial (certificado e parâmetros)", api: ["/api/esocial/certificado"] },
    "config.tabelas": { rotulo: "Tabelas da folha", api: [] },
    "config.integracoes": { rotulo: "Integrações (chaves de API)", api: ["/api/integracoes"] },
    "config.auditoria": { rotulo: "Auditoria", api: [] },
  },
  campos: {
    "campo.regras_ponto": { rotulo: "Regras do ponto (biometria, PIN no quiosque)" },
    "campo.registro_inpi": { rotulo: "Registro do REP-P no INPI" },
    "campo.dados_empresa": { rotulo: "Dados cadastrais da empresa (razão social, CNPJ)" },
  },
};
const TODAS = { ...CATALOGO.modulos, ...CATALOGO.abas, ...CATALOGO.campos };
export const chaveValida = (k) => Object.hasOwn(TODAS, k);

const sobPrefixo = (caminho, prefixos) => prefixos.some((p) => caminho === p || caminho.startsWith(p + "/"));

/** Recurso escondido pelo Suporte Nexor? (só para usuários do cliente) */
export function bloqueadoPorAjuste(ocultos, metodo, caminho) {
  for (const k of ocultos) {
    const item = CATALOGO.modulos[k];
    if (item && sobPrefixo(caminho, item.api)) return item.rotulo;
    const aba = CATALOGO.abas[k];
    if (aba && metodo !== "GET" && sobPrefixo(caminho, aba.api)) return aba.rotulo;
  }
  return null;
}

const SEMPRE = new Set(["/api/estado", "/api/entrar", "/api/sair", "/api/eu", "/api/cadastro"]);
const ARQUIVOS_LEGAIS = ["/api/ponto/afd", "/api/ponto/aej", "/api/ponto/afd-assinatura", "/api/ponto/espelho"];
const DO_PONTO = ["/api/app/ponto", "/api/app/eu", "/api/app/biometria", "/api/app/servidor", "/api/app/ativar", "/api/app/aparelho", "/api/app/marcacoes", "/api/app/comprovante", "/api/app/sair", "/api/quiosque"];

/**
 * A licença permite esta requisição? Devolve null (permite) ou a mensagem de recusa.
 * @param {{situacao:string, mensagem:string, manter_ponto:boolean}} lic
 */
export function recusaPorLicenca(lic, metodo, caminho) {
  if (!lic || lic.situacao === "ativo" || lic.situacao === "aviso") return null;
  if (SEMPRE.has(caminho) || caminho.startsWith("/api/nexor/")) return null;
  const app = caminho.startsWith("/api/app/") || caminho.startsWith("/api/quiosque/");
  if (lic.situacao === "restrito") {
    if (app || metodo === "GET") return null;
    return lic.mensagem || "Sistema em modo somente leitura. Fale com a Nexor.";
  }
  // bloqueado
  if (app) return lic.manter_ponto && sobPrefixo(caminho, DO_PONTO) ? null : "Sistema suspenso. Procure o RH da sua empresa.";
  if (metodo === "GET" && sobPrefixo(caminho, ARQUIVOS_LEGAIS)) return null;
  return lic.mensagem || "Sistema suspenso. Fale com a Nexor.";
}
