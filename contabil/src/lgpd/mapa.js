/* O que o Nexor Contábil guarda de cada titular e o que fazer num pedido de exclusão.
   Titulares: o cliente do escritório (dados da pessoa de contato; a razão social e o CNPJ são dado da empresa)
   e cada contato com acesso ao portal. Documentos fiscais, guias, tarefas e lançamentos contábeis têm guarda
   legal: ficam bloqueados e nunca são apagados automaticamente. Os prazos são padrões para revisão do jurídico
   e podem ser trocados por LGPD_PRAZOS (meses). */

export const PRAZOS_PADRAO = {
  conversa_atendimento: { rotulo: "Mensagens de WhatsApp com o cliente", meses: 24, acao: "apagar", base_legal: "Finalidade (atendimento) cumprida: LGPD arts. 15, I e 16" },
  chamado_resolvido: { rotulo: "Chamados resolvidos do portal", meses: 24, acao: "apagar", base_legal: "Finalidade (atendimento) cumprida: LGPD arts. 15, I e 16" },
  registro_de_envios: { rotulo: "Registro de avisos e cobranças enviados", meses: 12, acao: "apagar", base_legal: "Necessidade (LGPD art. 6º, III)" },
  fiscal: { rotulo: "Documentos fiscais, guias, pendências e obrigações", meses: 60, acao: "bloquear", base_legal: "CTN arts. 173 e 195, parágrafo único (5 anos)" },
  escrituracao_contabil: { rotulo: "Lançamentos e escrituração contábil", meses: 120, acao: "bloquear", base_legal: "Código Civil arts. 1.194 e 205; NBC (guarda enquanto houver prescrição ou decadência)" },
};

const DO_CLIENTE = "empresa_id = :emp AND cliente_id = :id";

export function titularesContabil() {
  return {
    cliente: {
      rotulo: "Cliente",
      tabela: "clientes",
      nome: (c) => c.contato_nome || c.nome_fantasia || c.razao_social,
      podeExcluir: (c) => (c.ativo ? "O cliente ainda está ativo no escritório: o contrato de contabilidade precisa desses dados (LGPD art. 7º, V). Desative o cliente antes de pedir a exclusão." : null),
      partes: [
        { nome: "sessoes_do_portal", tabela: "sessoes", onde: "portal_id IN (SELECT id FROM portal_usuarios WHERE empresa_id = :emp AND cliente_id = :id)", tratamento: "apagar" },
        { nome: "contatos_do_portal", tabela: "portal_usuarios", onde: DO_CLIENTE, tratamento: "apagar" },
        { nome: "mensagens_whatsapp", tabela: "mensagens", onde: DO_CLIENTE, tratamento: "apagar" },
        { nome: "chamados", tabela: "chamados", onde: DO_CLIENTE, tratamento: "apagar" },
        { nome: "avisos_enviados", tabela: "envios", onde: DO_CLIENTE, tratamento: "apagar" },
        { nome: "documentos", tabela: "documentos", onde: DO_CLIENTE, tratamento: "reter", categoria: "fiscal", arquivos: (l) => [l.arquivo_id] },
        { nome: "entregas_e_guias", tabela: "entregas", onde: DO_CLIENTE, tratamento: "reter", categoria: "fiscal", arquivos: (l) => [l.arquivo_id] },
        { nome: "pendencias", tabela: "pendencias", onde: DO_CLIENTE, tratamento: "reter", categoria: "fiscal" },
        { nome: "tarefas", tabela: "tarefas", onde: DO_CLIENTE, tratamento: "reter", categoria: "fiscal" },
        { nome: "lancamentos", tabela: "lancamentos", onde: DO_CLIENTE, tratamento: "reter", categoria: "escrituracao_contabil" },
        { nome: "documentos_esperados", tabela: "esperados", onde: DO_CLIENTE, tratamento: "exportar" },
        // Razão social e CNPJ ficam (exigidos pelos registros fiscais); sai o que identifica a pessoa de contato
        { nome: "cadastro", tabela: "clientes", onde: "id = :id AND empresa_id = :emp", tratamento: "anonimizar", campos: { contato_nome: null, whatsapp: null, email: null, observacoes: null } },
      ],
    },
    contato: {
      rotulo: "Contato do portal",
      tabela: "portal_usuarios",
      nome: (p) => p.nome,
      partes: [
        { nome: "sessoes_do_portal", tabela: "sessoes", onde: "portal_id = :id", tratamento: "apagar" },
        { nome: "mensagens_whatsapp", tabela: "mensagens", onde: "empresa_id = :emp AND wa_id = (SELECT whatsapp FROM portal_usuarios WHERE id = :id AND whatsapp IS NOT NULL)", tratamento: "apagar" },
        { nome: "cadastro", tabela: "portal_usuarios", onde: "id = :id AND empresa_id = :emp", tratamento: "apagar" },
      ],
    },
  };
}

export function regrasContabil(repo) {
  return [
    { categoria: "conversa_atendimento", tratar: (emp, corteMs) => repo.rodar("DELETE FROM mensagens WHERE empresa_id = ? AND criado_em < ?", emp, corteMs).changes },
    { categoria: "chamado_resolvido", tratar: (emp, corteMs) => repo.rodar("DELETE FROM chamados WHERE empresa_id = ? AND status = 'resolvido' AND atualizado_em < ?", emp, corteMs).changes },
    { categoria: "registro_de_envios", tratar: (emp, corteMs) => repo.rodar("DELETE FROM envios WHERE empresa_id = ? AND criado_em < ?", emp, corteMs).changes },
  ];
}
