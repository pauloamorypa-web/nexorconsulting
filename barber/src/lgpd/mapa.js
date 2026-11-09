/* O que o Nexor Barber guarda de cada cliente (titular) e o que fazer num pedido de exclusão.
   Vendas e o clube de assinatura (cobranças) são registros financeiros com guarda legal: ficam bloqueados,
   e o cadastro do cliente é anonimizado (o histórico da barbearia continua, sem identificar a pessoa).
   Os prazos são padrões para revisão do jurídico e podem ser trocados por LGPD_PRAZOS (meses). */

export const PRAZOS_PADRAO = {
  cliente_inativo: { rotulo: "Cliente sem visita nem horário marcado (cadastro anonimizado)", meses: 24, acao: "anonimizar", base_legal: "Finalidade (atendimento e relacionamento) encerrada: LGPD arts. 15, I e 16" },
  registro_de_envios: { rotulo: "Registro de mensagens enviadas (lembretes, retorno, códigos)", meses: 12, acao: "apagar", base_legal: "Necessidade (LGPD art. 6º, III): só para conferir entregas e reclamações" },
  fiscal: { rotulo: "Vendas e comandas", meses: 60, acao: "bloquear", base_legal: "CTN arts. 173 e 195, parágrafo único (5 anos)" },
  financeiro: { rotulo: "Assinaturas do clube e cobranças", meses: 60, acao: "bloquear", base_legal: "CTN art. 195; Código Civil art. 206, § 5º, I (cobrança: 5 anos)" },
};

const DO_CLIENTE = "cliente_id = :id AND barbearia_id = :emp";

export function titularesBarber(repo) {
  return {
    cliente: {
      rotulo: "Cliente",
      tabela: "clientes",
      tenant: "barbearia_id",
      nome: (c) => c.nome,
      podeExcluir(c) {
        if (repo.um("SELECT 1 FROM assinaturas WHERE cliente_id = ? AND status IN ('pendente','ativa','atrasada')", c.id)) return "O cliente tem assinatura do clube em andamento. Cancele a assinatura antes de excluir os dados.";
        if (repo.um("SELECT 1 FROM agendamentos WHERE cliente_id = ? AND status IN ('agendado','chegou','em_atendimento')", c.id)) return "O cliente tem horário marcado. Cancele o horário antes de excluir os dados.";
        return null;
      },
      partes: [
        { nome: "sessoes_do_app", tabela: "sessoes", onde: "cliente_id = :id", tratamento: "apagar" },
        { nome: "codigos_de_acesso", tabela: "codigos", onde: "destino IN (SELECT fone FROM clientes WHERE id = :id AND fone IS NOT NULL UNION SELECT email FROM clientes WHERE id = :id AND email IS NOT NULL)", tratamento: "apagar" },
        { nome: "lista_de_espera", tabela: "espera", onde: DO_CLIENTE, tratamento: "apagar" },
        { nome: "reservas_de_produtos", tabela: "reservas", onde: DO_CLIENTE, tratamento: "apagar" },
        { nome: "mensagens_enviadas", tabela: "envios", onde: DO_CLIENTE, tratamento: "apagar" },
        // A agenda e as comissões da barbearia continuam; sai a observação sobre a pessoa
        { nome: "agendamentos", tabela: "agendamentos", onde: DO_CLIENTE, tratamento: "anonimizar", campos: { observacao: null } },
        { nome: "vendas", tabela: "vendas", onde: DO_CLIENTE, tratamento: "reter", categoria: "fiscal" },
        { nome: "assinaturas", tabela: "assinaturas", onde: DO_CLIENTE, tratamento: "reter", categoria: "financeiro" },
        { nome: "cobrancas", tabela: "cobrancas", onde: "barbearia_id = :emp AND assinatura_id IN (SELECT id FROM assinaturas WHERE cliente_id = :id)", tratamento: "reter", categoria: "financeiro" },
        { nome: "usos_do_clube", tabela: "usos", onde: "barbearia_id = :emp AND assinatura_id IN (SELECT id FROM assinaturas WHERE cliente_id = :id)", tratamento: "exportar" },
        {
          nome: "cadastro",
          tabela: "clientes",
          onde: "id = :id AND barbearia_id = :emp",
          tratamento: "anonimizar",
          campos: { nome: "Cliente removido (LGPD)", fone: null, email: null, google_sub: null, nascimento: null, observacoes: null, preferencias: null, aceita_mensagens: 0, marketing_optin: 0, marketing_optin_em: null, marketing_optin_origem: null, ciclo_dias: null, retorno_avisado_em: null, ativo: 0 },
        },
      ],
    },
  };
}

export function regrasBarber(repo) {
  return [
    {
      categoria: "cliente_inativo",
      titular: "cliente",
      // Sem visita no período (ou cadastrado há mais tempo e nunca veio), sem clube nem horário em aberto
      selecionar: (emp, corteMs, corteDia) =>
        repo
          .todos(
            "SELECT id FROM clientes c WHERE barbearia_id = ? AND ativo = 1 AND COALESCE(ultima_visita, '') < ? AND criado_em < ? AND NOT EXISTS (SELECT 1 FROM agendamentos a WHERE a.cliente_id = c.id AND a.inicio >= ?) LIMIT 2000",
            emp,
            corteDia,
            corteMs,
            corteMs,
          )
          .map((c) => c.id),
    },
    {
      categoria: "registro_de_envios",
      tratar: (emp, corteMs) => repo.rodar("DELETE FROM envios WHERE barbearia_id = ? AND criado_em < ?", emp, corteMs).changes + repo.rodar("DELETE FROM codigos WHERE expira_em < ?", corteMs).changes,
    },
  ];
}
