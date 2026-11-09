# Banca de Testes Nexor

Cinco agentes especialistas que testam aplicações, sites, sistemas e APIs como um time de qualidade completo. As definições ficam em [`.claude/agents/`](../.claude/agents/) e funcionam em qualquer projeto aberto no Claude Code.

| Agente | Arquivo | O que faz | Altera código? |
|---|---|---|---|
| **Hacker** | `banca-hacker.md` | Teste de invasão autorizado: login e sessão, acesso aos dados de outro usuário, injeção, segredos expostos, configuração insegura | Não |
| **Usuário Confuso** | `banca-usuario-confuso.md` | Usa como gente de verdade: cliques duplos e simultâneos, várias abas, voltar no meio, digitação errada, celular e rede lenta | Não |
| **Programador Sênior** | `banca-programador-senior.md` | Revisão profunda do código: lógica, dinheiro, datas, concorrência, tratamento de erro, desempenho e manutenção | Não |
| **Testador** | `banca-testador.md` | Roda a suíte, todas as rotas e fluxos, carga de 100 e 500 acessos simultâneos e falhas de serviços externos | Não |
| **Veredito** | `banca-veredito.md` | Confere os achados, junta duplicados, classifica de básico a grave e corrige **só depois da aprovação humana** | Só com aprovação |

## Como rodar uma banca

1. **Autorização.** Para sistemas da Nexor, o responsável pelo produto autoriza. Para sistemas de clientes, só com o termo de autorização assinado e só em ambiente de teste ou homologação (Lei 12.737/2012). O Agente Hacker recusa alvos fora disso.
2. **Rodada de testes, com os quatro agentes em paralelo.** Cada um recebe o alvo, uma porta e uma pasta de dados próprias, e grava o relatório em `banca/relatorios/<AAAA-MM>-<alvo>/<agente>.md`.
   - No Claude Code, peça: "Use o agente banca-hacker no sistema X, porta 8801, relatório em banca/relatorios/…".
   - Ou rode os quatro de uma vez: "Rode a Banca de Testes Nexor no sistema X".
3. **Veredito.** Chame o `banca-veredito` com a pasta dos relatórios. Ele devolve `veredito.md`, com nota de 0 a 10, a resposta para "pronto para produção" e os itens do mais grave ao mais básico, com esforço estimado.
4. **Aprovação humana.** O responsável escolhe o que corrigir, por exemplo: "aprovo V-01, V-02 e V-05".
5. **Correção.** O Veredito corrige item por item, cria um teste para cada um e roda a suíte inteira. Depois, faça uma nova rodada curta só nos itens corrigidos.

## Escala de gravidade

| Gravidade | Exemplos | Prazo |
|---|---|---|
| **Grave** | Vazamento de dados, acesso indevido, cobrança ou agendamento duplicado, sistema fora do ar | Antes de vender ou implantar |
| **Alto** | Função principal quebrada para parte dos usuários, falha de segurança explorável com esforço | Na mesma semana |
| **Médio** | Erro com contorno, lentidão, mensagem confusa | Na próxima versão |
| **Básico** | Acabamento, texto, manutenção | Quando houver tempo |

## Quando rodar
- Antes de lançar um produto novo ou uma versão grande.
- Antes de implantar num cliente grande.
- A cada 3 meses em todos os produtos em produção.
- Depois de qualquer incidente de segurança.

## Relatórios
- [Novembro de 2026 · Nexor Barber](relatorios/2026-11-barber/)
