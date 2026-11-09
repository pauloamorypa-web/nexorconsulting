/* O que o Nexor RH guarda de cada titular e o que fazer com cada parte num pedido de exclusão.
   Dados trabalhistas (ponto, folha, eSocial, férias, afastamentos, documentos) têm obrigação legal de guarda:
   ficam bloqueados até o fim do prazo e nunca são apagados automaticamente. Os prazos são padrões para
   revisão do jurídico e podem ser trocados por LGPD_PRAZOS (meses). */

export const PRAZOS_PADRAO = {
  candidato_nao_contratado: { rotulo: "Candidato não contratado (dados da candidatura e currículo)", meses: 12, acao: "apagar", base_legal: "Finalidade (processo seletivo) encerrada: LGPD arts. 15, I e 16" },
  ponto: { rotulo: "Registros de ponto, ajustes, banco de horas e espelhos assinados", meses: 60, acao: "bloquear", base_legal: "CF art. 7º, XXIX (prescrição trabalhista de 5 anos); Portaria MTP 671/2021" },
  folha: { rotulo: "Folha de pagamento, lançamentos, benefícios e dependentes", meses: 60, acao: "bloquear", base_legal: "CF art. 7º, XXIX; FGTS (STF ARE 709.212); CTN art. 173 (contribuições previdenciárias)" },
  esocial: { rotulo: "Eventos do eSocial", meses: 60, acao: "bloquear", base_legal: "Decreto 8.373/2014; CTN arts. 173 e 174" },
  trabalhista: { rotulo: "Contrato, férias e rescisão", meses: 60, acao: "bloquear", base_legal: "CF art. 7º, XXIX; CLT art. 11" },
  documentos_trabalhistas: { rotulo: "Documentos e arquivos do colaborador", meses: 60, acao: "bloquear", base_legal: "CF art. 7º, XXIX; CLT art. 11" },
  saude_ocupacional: { rotulo: "Afastamentos e atestados (dado de saúde)", meses: 240, acao: "bloquear", base_legal: "NR-7 (PCMSO: 20 anos após o desligamento); LGPD art. 11, II, a" },
};

const reter = (nome, tabela, onde, categoria, extra = {}) => ({ nome, tabela, onde, tratamento: "reter", categoria, ...extra });
const DO_COLAB = "colaborador_id = :id AND empresa_id = :emp";

export function titularesRh() {
  return {
    colaborador: {
      rotulo: "Colaborador",
      tabela: "colaboradores",
      nome: (c) => c.nome,
      podeExcluir: (c) => (c.status !== "desligado" ? "O colaborador ainda tem contrato ativo: os dados são necessários para cumpri-lo (LGPD art. 7º, V). Registre o desligamento antes de pedir a exclusão." : null),
      baseRetencao: (c) => {
        try {
          return JSON.parse(c.desligamento ?? "null")?.data ?? null;
        } catch {
          return null;
        }
      },
      partes: [
        { nome: "sessoes_do_aplicativo", tabela: "sessoes", onde: "colaborador_id = :id", tratamento: "apagar" },
        { nome: "convites_do_aplicativo", tabela: "convites_app", onde: "colaborador_id = :id", tratamento: "apagar" },
        { nome: "biometria_e_aparelhos", tabela: "credenciais", onde: "colaborador_id = :id", tratamento: "apagar" },
        { nome: "leituras_de_comunicados", tabela: "comunicado_leituras", onde: "colaborador_id = :id", tratamento: "apagar" },
        reter("dependentes", "dependentes", DO_COLAB, "folha"),
        reter("documentos", "documentos", DO_COLAB, "documentos_trabalhistas", { arquivos: (l) => [l.arquivo] }),
        reter("arquivos", "arquivos", DO_COLAB, "documentos_trabalhistas", { arquivos: (l) => [l.id] }),
        reter("marcacoes_de_ponto", "marcacoes", DO_COLAB, "ponto"),
        reter("ajustes_de_ponto", "ajustes", DO_COLAB, "ponto"),
        reter("banco_de_horas", "banco_horas", DO_COLAB, "ponto"),
        reter("espelhos_assinados", "espelho_assinaturas", DO_COLAB, "ponto"),
        reter("ferias", "ferias", DO_COLAB, "trabalhista"),
        reter("afastamentos", "afastamentos", DO_COLAB, "saude_ocupacional"),
        reter("beneficios", "colaborador_beneficios", "colaborador_id = :id", "folha"),
        reter("lancamentos_da_folha", "lancamentos", DO_COLAB, "folha"),
        reter("holerites", "folha_itens", DO_COLAB, "folha"),
        reter("eventos_esocial", "esocial_eventos", "empresa_id = :emp AND json_extract(referencia, '$.colaborador_id') = :id", "esocial"),
        // O cadastro fica (CPF, PIS, nome, admissão, salário são exigidos pelos registros acima); sai o que não é obrigatório
        { nome: "cadastro", tabela: "colaboradores", onde: "id = :id AND empresa_id = :emp", tratamento: "anonimizar", campos: { email: null, telefone: null, foto: null, observacoes: null, nome_social: null, pin_hash: null } },
      ],
    },
    candidato: {
      rotulo: "Candidato",
      tabela: "candidatos",
      nome: (c) => c.nome,
      partes: [{ nome: "candidatura", tabela: "candidatos", onde: "id = :id AND empresa_id = :emp", tratamento: "apagar", arquivos: (l) => [l.curriculo] }],
    },
  };
}

/** Expurgo automático: só o que pode ser apagado. Trabalhista e fiscal não entram (só bloqueio). */
export function regrasRh(repo) {
  return [
    {
      categoria: "candidato_nao_contratado",
      titular: "candidato",
      selecionar: (emp, corteMs) => repo.todos("SELECT id FROM candidatos WHERE empresa_id = ? AND etapa != 'contratado' AND atualizado_em < ? LIMIT 5000", emp, corteMs).map((c) => c.id),
    },
  ];
}
