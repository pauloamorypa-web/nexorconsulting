# Preços sugeridos (novembro de 2026)

Proposta montada a partir da pesquisa de mercado em [`PESQUISA-PRECOS-2026.md`](PESQUISA-PRECOS-2026.md). Todos os preços de concorrente foram vistos em 17/11/2026 e têm a fonte na pesquisa.

**Ainda não vale.** A tabela em vigor continua em [`PLANOS-E-PRECOS.md`](PLANOS-E-PRECOS.md) e em `central/src/planos.js`. Quando o dono aprovar, os dois são atualizados juntos.

## Resumo: o que muda
| Produto | Hoje | Mercado | Sugestão | Por quê |
|---|---|---|---|---|
| Barber | R$ 89 a R$ 349 + implantação de R$ 390 a R$ 1.290 | R$ 55 a R$ 220; com app próprio, R$ 299. Ninguém cobra implantação | Mensalidades quase iguais; **implantação grátis** no Solo e no Barbearia | Implantação assusta quem compara com AppBarber e Trinks |
| RH · Ponto | R$ 9,90 por colaborador (mínimo R$ 149) + R$ 990 | R$ 2 a R$ 6 por colaborador (Pontomais: R$ 59,90 para 10) | **R$ 5,90** por colaborador (mínimo R$ 69) + implantação grátis até 30 pessoas | Estava quase o dobro do mercado |
| RH · Completo | R$ 19,90 por colaborador (mínimo R$ 299) | R$ 10 a R$ 16 (Convenia, Factorial) | **R$ 14,90** (mínimo R$ 199) | Entra na faixa com eSocial e app incluídos |
| Atende IA | R$ 497 / R$ 997 / R$ 1.997 | Entrada R$ 370 a R$ 600; médio R$ 850 a R$ 2.500 | **Manter** | Está na faixa |
| Contábil | R$ 397 / R$ 997 / R$ 1.997 | Quase ninguém publica; terceiro cita R$ 300 a R$ 2.500 | **Manter** | Está na faixa |
| Agente | R$ 497 + R$ 2.500 de entrada | ERP inteiro custa de R$ 60 a R$ 1.250; BI no WhatsApp, de R$ 62 a R$ 183 | **Novo plano Start de R$ 197** + R$ 690 | A porta de entrada atual custa mais que o ERP do cliente |
| Elo · instalador Pro | R$ 79 | Field Control: R$ 525 para 3 técnicos | **R$ 99** e novo **Pro Equipe de R$ 199** | Ainda muito abaixo e ganha um degrau para equipes maiores |
| Elo · fornecedor | R$ 397 a R$ 1.997 + taxa de 1,5% a 2,5% | Sem concorrente direto | **Manter** | Sem referência para mudar |
| Service Desk | R$ 299 por 5 técnicos (cerca de R$ 60 cada) | Milvus: R$ 160 a R$ 205 por agente; Freshservice: US$ 19 a 99 | **R$ 99 por técnico** (mínimo de 3, R$ 297) | Continua metade do líder nacional e não fica barato demais |
| Site Pro | R$ 149 por mês + R$ 2.900 a R$ 6.900 | Manutenção de R$ 97 a R$ 600; criação de R$ 2.000 a R$ 7.000 | **Manter** | Está na faixa |

## 1. Planos sugeridos por produto

### Nexor Barber
| Plano | Mensalidade | Implantação |
|---|---|---|
| Solo (1 barbeiro) | R$ 89 | **grátis** (configuração guiada) |
| Barbearia (até 5) | R$ 189 | **grátis** |
| Premium (até 12, app com a marca) | **R$ 299** | R$ 490 (migração dos clientes e do histórico) |

### Nexor RH + Ponto
| Plano | Por colaborador | Mínimo | Implantação |
|---|---|---|---|
| Ponto | **R$ 5,90** | **R$ 69** | **grátis até 30 pessoas**; R$ 490 acima disso |
| RH Completo | **R$ 14,90** | **R$ 199** | R$ 990 |

### Nexor Agente
| Plano | Inclui | Mensalidade | Implantação |
|---|---|---|---|
| **Start (novo)** | 1 pessoa e 1 sistema. Só consulta: vendas, metas, estoque e clientes parados | **R$ 197** | **R$ 690** |
| Essencial | 1 dono, 2 sistemas e ações com aprovação | R$ 497 | **R$ 1.500** |
| Profissional | 3 pessoas e 5 sistemas | R$ 997 | R$ 3.500 |
| Empresarial | Sem limite, com conectores sob medida | R$ 1.997 | R$ 8.000 |

O Start é a porta de entrada. Quem usa e quer o Agente agindo sobe para o Essencial.

### Nexor Elo (instalador)
| Plano | Inclui | Preço |
|---|---|---|
| Grátis | igual ao de hoje | R$ 0 |
| Pro | dono + 2 técnicos | **R$ 99** (R$ 990 por ano) |
| **Pro Equipe (novo)** | até 6 técnicos, painel da equipe e metas | **R$ 199** |

### Nexor Service Desk
| Plano | Mensalidade | Implantação |
|---|---|---|
| Equipe | **R$ 99 por técnico**, mínimo de 3 (R$ 297) | R$ 990 |
| Agentes nos computadores | incluídos, sem limite | — |

Na venda, use este argumento: "metade do preço do líder nacional, com o seu servidor e os seus dados".

## 2. Parceiros e revendedores

A tabela de comissões em vigor ([`PLANOS-E-PRECOS.md`](PLANOS-E-PRECOS.md), seção 5) já está na faixa do mercado:
- indicação paga 10% recorrente, como no Bling;
- revenda paga de 20% a 30%.

Ela continua igual. Ao lado dela, sugiro quatro modalidades novas, para públicos que o mercado já atende assim.

| Modalidade | Para quem | Como ganha | Exigência |
|---|---|---|---|
| **Contador parceiro** | Escritórios de contabilidade (RH, Ponto, Agente) | 20% recorrente sobre o que indicar e **30% de desconto no próprio Nexor Contábil** enquanto tiver 3 ou mais clientes ativos indicados | Cadastro no portal do parceiro |
| **Revenda de TI** | Empresas de TI e suporte que atendem PMEs (Service Desk) | Compra por **R$ 59 por técnico** e revende pelo preço que quiser. Pode usar a marca própria (white label) | 5 clientes ativos e suporte de nível 1 feito por ela |
| **Agência parceira** | Agências de marketing (Atende IA, Site Pro) | **40% de desconto** sobre a tabela para revender, ou 20% recorrente se só indicar | 3 clientes ativos e o primeiro atendimento feito por ela |
| **Instalador embaixador** | Instaladores do Elo | **1 mês do Pro grátis** por instalador indicado que fechar a primeira proposta paga | Nenhuma |

**Regras que valem para todas (as mesmas de hoje):**
- comissão sobre o valor recebido;
- carência de 30 dias;
- estorno se o cliente cancelar em até 90 dias;
- nada sobre o consumo de IA, Meta e SMS.

## 3. Próximo passo
1. O dono aprova ou ajusta a tabela.
2. A Nexor atualiza `central/src/planos.js` e `PLANOS-E-PRECOS.md` juntos e cadastra as modalidades novas na Central.
3. Os clientes fundadores mantêm o preço que já foi travado.
