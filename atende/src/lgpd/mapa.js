/* O que o Nexor Atende IA guarda de cada contato (titular) e o que fazer num pedido de exclusão.
   Atendimento por WhatsApp não tem obrigação legal de guarda: tudo é apagado (agendamentos ficam sem o vínculo
   com a pessoa). Os prazos do expurgo são padrões para revisão do jurídico e podem ser trocados por LGPD_PRAZOS. */

export const PRAZOS_PADRAO = {
  conversa_atendimento: { rotulo: "Conversa de atendimento (mensagens, mídias, análise da IA)", meses: 24, acao: "apagar", base_legal: "Finalidade (atendimento) cumprida: LGPD arts. 15, I e 16; CDC art. 27 (5 anos) se houver reclamação de consumo" },
  lead: { rotulo: "Lead que não virou cliente, sem contato no período", meses: 12, acao: "apagar", base_legal: "Legítimo interesse/consentimento para prospecção encerrado: LGPD arts. 7º, IX, 15 e 16" },
};

const midiaDe = (m) => {
  try {
    return [JSON.parse(m.conteudo ?? "{}")?.midia?.arquivo];
  } catch {
    return [];
  }
};
const DAS_CONVERSAS = "empresa_id = :emp AND conversa_id IN (SELECT id FROM conversas WHERE empresa_id = :emp AND contato_id = :id)";

export function titularesAtende() {
  return {
    contato: {
      rotulo: "Contato",
      tabela: "contatos",
      nome: (c) => c.nome || c.nome_perfil || c.wa_id,
      partes: [
        { nome: "mensagens", tabela: "mensagens", onde: DAS_CONVERSAS, tratamento: "apagar", arquivos: midiaDe },
        { nome: "conversas", tabela: "conversas", onde: "empresa_id = :emp AND contato_id = :id", tratamento: "apagar" },
        { nome: "envios_de_campanha", tabela: "campanha_envios", onde: "contato_id = :id", tratamento: "apagar" },
        // O horário na agenda é da empresa; sai o vínculo com a pessoa e as observações
        { nome: "agendamentos", tabela: "agendamentos", onde: "empresa_id = :emp AND contato_id = :id", tratamento: "anonimizar", campos: { contato_id: null, observacoes: null } },
        { nome: "cadastro", tabela: "contatos", onde: "id = :id AND empresa_id = :emp", tratamento: "apagar" },
      ],
    },
  };
}

export function regrasAtende(repo, midia) {
  const db = repo.db;
  return [
    {
      categoria: "conversa_atendimento",
      async tratar(emp, corteMs) {
        const conversas = db.prepare("SELECT id FROM conversas WHERE empresa_id = ? AND ultima_msg_em < ? LIMIT 5000").all(emp, corteMs).map((c) => c.id);
        const arquivos = [];
        repo.transacao(() => {
          for (const id of conversas) {
            for (const m of db.prepare("SELECT conteudo FROM mensagens WHERE conversa_id = ?").all(id)) arquivos.push(...midiaDe(m));
            db.prepare("DELETE FROM conversas WHERE id = ? AND empresa_id = ?").run(id, emp);
          }
        });
        for (const a of arquivos.filter(Boolean)) await midia.remover(a).catch(() => {});
        return conversas.length;
      },
    },
    {
      categoria: "lead",
      titular: "contato",
      // Nunca virou cliente, sem mensagem nem atualização no período e sem conversa recente
      selecionar: (emp, corteMs) =>
        db
          .prepare("SELECT id FROM contatos c WHERE empresa_id = ? AND etapa != 'cliente' AND COALESCE(ultima_entrada_em, 0) < ? AND atualizado_em < ? AND NOT EXISTS (SELECT 1 FROM conversas v WHERE v.contato_id = c.id AND v.ultima_msg_em >= ?) LIMIT 5000")
          .all(emp, corteMs, corteMs, corteMs)
          .map((c) => c.id),
    },
  ];
}
