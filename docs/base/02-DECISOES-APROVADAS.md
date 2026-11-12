# 2. Decisões aprovadas

Decididas pelo dono. Não reabrir sem pedido dele. Atualizado em 12/11/2026.

## Comercial
| Decisão | Detalhe |
|---|---|
| Teste grátis | 30 dias, sem cartão, com funções limitadas por produto (`central/src/planos.js`, `TESTE`) |
| Programa de fundadores | 10 vagas por produto: 40% na mensalidade por 12 meses, 50% na implantação, preço travado por 24 meses, contrato mínimo de 12 meses, em troca de depoimento e feedback |
| Produtos com vaga de fundador | Contábil, Barber, Agente, Elo e **Service Desk** (decidido em 11/11/2026) |
| Fonte única de preços | `central/src/planos.js` e `comercial/PLANOS-E-PRECOS.md` (manter iguais). Elo em `comercial/ELO-PRECOS.md` |
| Service Desk | Plano Equipe: R$ 299 até 5 técnicos, R$ 49 por técnico extra, implantação R$ 990 |
| Comissões | Tabela em `central/src/planos.js` (`COMISSOES`): vendedor, representante, indicador, revenda, estratégico |

## Produtos
| Decisão | Detalhe |
|---|---|
| Modo Demonstração | Todo produto tem `DEMO=1` com empresa fictícia, só no notebook, sem internet. Um comando sobe todos (`demo/`) |
| Nexor Elo | O instalador é obrigado a informar o custo também dos **serviços**. Pagamento dividido pelo Asaas. O fornecedor não vê o cliente do instalador |
| Nexor Service Desk | Produto white-label da Nexor, feito a partir da ferramenta de TI de um cliente. Página no mesmo endereço (`solucoes/sistema-de-chamados`). A página cita a Banca de Testes |
| Conversão offline | Ligada: a Central avisa a Blue quando o teste é ativado e quando o contrato fecha; a Blue envia ao Meta e ao Google |
| Nexor Guardião | **Cancelado em 12/11/2026** (o dono não achou viável). Arquivos removidos do repositório; ficam só no histórico do Git |
| Telas de acesso | Todas com o fundo de rede animado e caixas de vidro (padrão em `assets/acesso/`), decidido em 12/11/2026 |
| Lançamento oficial | A Nexor está sendo organizada para lançar no mercado: regras, segurança, design, prospecção e manuais padronizados em `docs/base/` |

## Método
| Decisão | Detalhe |
|---|---|
| Banca de Testes | 5 agentes (Hacker, Programador Sênior, Testador, Usuário Confuso, Veredito). O Veredito só corrige com aprovação do dono |
| Base de conhecimento | Regras, decisões e padrões ficam em `docs/base/`; histórico de conversa é só referência |
| Marketing por campanha | Uma campanha por público de produto, mais uma campanha geral ("qualquer cenário"), com a Blue qualificando e pontuando os contatos |
