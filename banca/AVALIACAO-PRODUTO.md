# Vale a pena vender a Banca de Testes como produto da Nexor?

**Recomendação: sim.** Mas como **serviço com gente da Nexor junto**, encaixado no Nexor Shield (que hoje está em "em breve"), e não como software que o cliente opera sozinho. Antes, rode a banca em todos os produtos da própria Nexor: é a melhor demonstração de venda e o melhor controle de qualidade interno.

## O que a primeira rodada mostrou (Nexor Barber, novembro de 2026)

| Indicador | Resultado |
|---|---|
| Testes automáticos que já existiam | 25 de 25 passando: pela suíte, o produto estava "pronto" |
| O que a banca achou | Cerca de 60 apontamentos brutos nos 4 relatórios; o número de itens únicos e confirmados está no [veredito](relatorios/2026-11-barber/veredito.md) |
| Tipos de falha que nenhum teste existente pegava | Venda e comissão em dobro com internet lenta, cliente que paga adiantado e perde o clube, admin que toma a conta do dono, servidor que congela com 100 logins, aviso de retorno que para depois de 40 clientes |
| Tempo | Cerca de 15 minutos com os 4 agentes em paralelo, mais o veredito |
| Escopo coberto | Invasão, uso real no celular, revisão do código inteiro (cerca de 6.500 linhas), 83 rotas, carga de 100 e 500 usuários simultâneos, falhas de serviços externos |

O ponto de venda está aí: **os testes automáticos diziam que estava tudo certo, e a banca achou problemas que custariam dinheiro e clientes**. Um time humano levaria dias para cobrir o mesmo escopo.

## Mercado
- **Pentest no Brasil:** de R$ 3.000 a R$ 60.000 por projeto, com a maioria das contratações entre R$ 8.000 e R$ 18.000. Aplicação web pequena fica entre R$ 8.000 e R$ 20.000. Consultorias de boa reputação cobram de R$ 400 a R$ 600 por hora.
- **QA terceirizado:** cobrado por hora de testador, na faixa da hora de desenvolvimento (de R$ 100 a R$ 300 por hora).
- **Quem compra:** agências e software houses que entregam sistemas a clientes, empresas que vão lançar um app ou sistema, empresas que precisam mostrar segurança a um cliente grande ou a uma auditoria, e startups antes de captar investimento.
- **Concorrência:** pentest manual (caro e lento) e ferramentas automáticas de varredura (baratas, mas superficiais, sem entender a regra de negócio). A banca fica no meio: entende o negócio (dinheiro, clube, estoque, comissão), roda em horas e custa uma fração do pentest manual.

## Proposta de produto: Nexor Shield · Banca de Testes

| Pacote | O que inclui | Preço sugerido |
|---|---|---|
| **Avaliação Express** | Site ou sistema pequeno (até cerca de 20 telas): os 5 agentes, veredito com nota e lista priorizada, reunião de 30 minutos com um especialista | R$ 1.900 a R$ 2.900 |
| **Avaliação Completa** | Sistema médio: os 5 agentes, conferência humana de cada item grave, plano de correção com horas estimadas e reteste depois das correções | R$ 4.900 a R$ 8.900 |
| **Banca Contínua** | Rodada mensal (ou a cada versão), comparação com a rodada anterior e alerta de regressão | R$ 497 a R$ 997 por mês |
| **Correção** | O Veredito corrige os itens aprovados, com teste para cada um | Pela tabela de hora sob demanda |

Os valores ficam **abaixo do pentest manual** e acima da varredura automática. A margem é alta porque a maior parte do trabalho é dos agentes.

## Riscos e como tratar

| Risco | Como tratar |
|---|---|
| **Legal:** testar invasão sem autorização é crime (Lei 12.737/2012) | Termo de autorização assinado, escopo por escrito, só ambiente de homologação ou local. O Agente Hacker já recusa alvos fora disso |
| **Falso positivo** (agente apontar problema que não existe) | O Veredito confere cada item, e um especialista da Nexor revisa os graves antes da entrega |
| **Promessa demais:** a banca não substitui certificações formais (ISO 27001, PCI) | Vender como "avaliação de qualidade e segurança", não como certificação. Escrever isso no contrato |
| **Sigilo do código do cliente** | Rodar no ambiente do cliente ou em máquina isolada da Nexor, apagar a cópia ao final, contrato com cláusula de confidencialidade e de tratamento de dados (LGPD) |
| **Custo de IA por rodada** | Medir no painel da Anthropic nas primeiras 5 rodadas e embutir no preço com folga; rodadas grandes consomem bastante, porque cada agente lê o código inteiro |
| **Responsabilidade por correções** | Só corrige com aprovação escrita, item por item, com teste para cada correção |

## Próximos passos sugeridos
1. **Corrigir o Nexor Barber** com os itens aprovados no veredito.
2. **Rodar a banca nos outros produtos:** RH, Contábil, Atende, Agente e Central. Cada rodada vira estudo de caso interno.
3. **Montar o material de venda:** página do Nexor Shield com um relatório de exemplo, termo de autorização e contrato.
4. **Oferecer a 3 clientes piloto** (agências e software houses da região) com desconto de fundador, para validar preço e prazo.
