# Nexor Consulting · instruções permanentes

Leia este arquivo e pare. **Não releia o repositório inteiro, o histórico de conversas nem relatórios fechados.** O que já foi decidido e aprendido está em `docs/base/` (7 documentos curtos). Abra só o documento da base que o pedido toca e só os arquivos que vai alterar.

## Como trabalhar aqui
1. **Idioma:** tudo em português do Brasil (respostas, código novo, comentários, commits, relatórios de agentes). Linguagem simples, frases curtas.
2. **Economia:** não refaça o que existe. Antes de criar, confira o mapa (`docs/base/06-MAPA-DO-REPOSITORIO.md`); se já existe, avise "já existe em …" e siga.
3. **Não revise o que já foi revisado.** Produto com veredito da Banca só volta à Banca nos casos listados nas regras. Corrigiu algo? Teste só o que mudou e rode a suíte do produto.
4. **Padrões prontos:** produto novo copia a arquitetura de `elo/` e segue `docs/base/03-PADROES-REUTILIZAVEIS.md`. Não reinvente segurança, demonstração, design nem estrutura de documentos.
5. **Agentes:** use só quando houver trabalho paralelo de verdade. O pedido ao agente aponta para `docs/base/` em vez de repetir contexto, e manda responder em português, em poucas linhas.
6. **Entrega:** commit e push no branch de trabalho, PR e merge na main com as ferramentas do GitHub. Sem force push. Sem nome de modelo em commit, PR ou código.
7. **Segredos:** nunca peça senha, token ou chave no chat. Chaves vão em variável de ambiente ou no servidor.
8. **Dados de cliente:** o repositório é público. Nada de marca, nome, login, domínio ou dado real de cliente. Trabalho com material de cliente fica fora do repositório.
9. **Marca:** não altere a marca Nexor. Cidade: Araguari (MG). Assinatura: "IA com cuidado humano".
10. **Ao terminar algo que muda uma regra, decisão ou padrão,** atualize o documento certo de `docs/base/` na mesma entrega (uma linha basta). Histórico de conversa não é regra: só entra na base o que o dono confirmou.

## Base de conhecimento
| Documento | Para quê |
|---|---|
| `docs/base/01-REGRAS-VIGENTES.md` | O que vale sempre |
| `docs/base/02-DECISOES-APROVADAS.md` | O que o dono já decidiu (não reabrir) |
| `docs/base/03-PADROES-REUTILIZAVEIS.md` | Técnica, segurança, design, demonstração, documentos, marketing, prospecção, auditoria |
| `docs/base/04-OBSOLETOS.md` | O que não vale mais |
| `docs/base/05-DUVIDAS-PENDENTES.md` | O que falta o dono decidir ou conferir |
| `docs/base/06-MAPA-DO-REPOSITORIO.md` | Onde está cada coisa e o estado de cada produto |
| `docs/base/07-CHECKLIST-PRODUTO-NOVO.md` | O que todo produto novo precisa entregar |
