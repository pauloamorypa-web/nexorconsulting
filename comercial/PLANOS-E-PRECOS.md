# Planos, preços, comissões e programa de fundadores

Tabela comercial da Nexor (novembro de 2026). É uma **proposta para validar**: os valores foram montados a partir das tabelas que já estavam nas fichas do Contábil e do Agente e das faixas de mercado de cada segmento. Ajuste depois das primeiras vendas.

**Onde os valores moram:** a Nexor Central lê tudo de [`central/src/planos.js`](../central/src/planos.js). Mudou um preço, mude lá e aqui. No painel da Central, a tela **Planos e preços** mostra a tabela em vigor.

**Regras que valem para tudo:**
- Consumo de IA (Anthropic), mensagens pagas da Meta, SMS e nuvem são **pagos direto pelo cliente**, na conta dele. A proposta traz uma estimativa.
- **Pagamento anual:** paga 10 mensalidades e usa 12 (16,7% de desconto).
- **Reajuste anual pelo IPCA**, exceto para fundadores no período de preço travado.
- Implantação é cobrada uma vez, na contratação (a Central gera a fatura sozinha).

---

## 1. Teste grátis de 30 dias

O teste grátis passou de 12 horas para **30 dias**. Ele tem **funções limitadas**, e depois **só continua com o plano contratado**.

| Produto | Limitações no teste |
|---|---|
| Nexor RH e Ponto | Até 10 colaboradores ativos. Sem eSocial e sem recrutamento |
| Nexor Atende IA | Até 30 conversas com a IA por dia. Sem campanhas |
| Nexor Contábil | Até 5 empresas na carteira e 100 documentos no mês |
| Nexor Barber | Até 2 barbeiros e 150 agendamentos no mês. Sem relatórios |
| Nexor Agente | Até 10 ações aprovadas por dia |

**Como funciona:**
1. **Início.** A equipe cadastra o cliente na Central e escolhe "Começar no teste grátis". O sistema é instalado e vinculado pelo código do cliente, como sempre.
2. **Durante os 30 dias.** O sistema mostra uma faixa com os dias que faltam e o botão de contratar, que abre o WhatsApp da Nexor. Quando o cliente passa de um limite, o sistema explica o que o plano libera.
3. **Fim do teste.** Sem contratação, o sistema fica **bloqueado** até o pagamento. Os dados ficam guardados por 60 dias. No RH, o registro de ponto e os arquivos legais continuam funcionando, pela mesma regra de proteção trabalhista do bloqueio.
4. **Contratação.** Na Central, "Contratar plano" encerra o teste, libera tudo em até 5 minutos, gera a fatura de implantação e começa as mensalidades.

A equipe pode **prorrogar o teste** pelo painel, no máximo 30 dias por vez.

**No site,** "Testar grátis" abre a demonstração interativa, que roda no navegador, e o pré-cadastro vira lead para a Nexor ativar o teste de 30 dias no ambiente do cliente.

---

## 2. Planos por produto

### Nexor RH e Ponto (por colaborador ativo)
| Plano | Inclui | Mensalidade | Implantação |
|---|---|---|---|
| Ponto | Ponto pelo app (digital, rosto, QR Code e GPS), quiosque, espelho, banco de horas, AFD e AEJ | R$ 9,90 por colaborador (mínimo R$ 149) | R$ 990 |
| RH Completo | Tudo do Ponto + folha, férias, 13º, rescisão, holerite no app, eSocial e recrutamento | R$ 19,90 por colaborador (mínimo R$ 299) | R$ 1.990 |

### Nexor Atende IA
| Plano | Inclui | Mensalidade | Implantação |
|---|---|---|---|
| Essencial | 1 número de WhatsApp, até 1.500 conversas por mês, agenda e funil | R$ 497 | R$ 1.500 |
| Profissional | Até 4.000 conversas por mês, campanhas, Instagram e chat do site, 5 usuários | R$ 997 | R$ 3.000 |
| Avançado | Até 10.000 conversas por mês, integração com ERP e CRM, usuários ilimitados | R$ 1.997 | R$ 5.000 |

### Nexor Contábil (por porte da carteira, não por usuário)
| Plano | Carteira | Mensalidade | Implantação |
|---|---|---|---|
| Autônomo | até 40 empresas | R$ 397 | R$ 1.500 |
| Escritório | até 150 empresas | R$ 997 | R$ 3.000 |
| Profissional | até 400 empresas | R$ 1.997 | R$ 6.000 |
| Rede | acima de 400 ou várias unidades | sob consulta | sob consulta |

### Nexor Barber
| Plano | Inclui | Mensalidade | Implantação |
|---|---|---|---|
| Solo | 1 barbeiro, app do cliente, agenda, produtos e caixa | R$ 89 | R$ 390 |
| Barbearia | Até 5 barbeiros, clube de assinatura, comissões e lista de espera | R$ 189 | R$ 690 |
| Premium | Até 12 barbeiros, relatórios completos e suporte prioritário | R$ 349 | R$ 1.290 |

As taxas do Asaas no clube de assinatura e o SMS de login ficam na conta da barbearia.

### Nexor Agente
| Plano | Inclui | Mensalidade | Implantação |
|---|---|---|---|
| Essencial | 1 dono, até 2 sistemas conectados | R$ 497 | R$ 2.500 |
| Profissional | Até 3 pessoas, até 5 sistemas conectados | R$ 997 | R$ 5.000 |
| Empresarial | Equipe e sistemas sem limite, conectores sob medida | R$ 1.997 | R$ 8.000 |

Cada conector novo sob medida custa de R$ 2.000 a R$ 5.000.

### Nexor Service Desk
| Plano | Inclui | Mensalidade | Implantação |
|---|---|---|---|
| Equipe | Até 5 técnicos: chamados com SLA, inventário com agente, ações remotas com permissão, painel, painel da TV e LGPD | R$ 299 (+ R$ 49 por técnico além de 5) | R$ 990 |

Teste grátis de 30 dias com todas as funções e até 5 técnicos.

### Outros produtos e projetos
| Produto | Mensalidade | Implantação |
|---|---|---|
| Nexor Cofre | R$ 199 até 20 usuários (+ R$ 7 por usuário) | R$ 690 |
| Nexor IT Platform | R$ 9,90 por máquina (mínimo R$ 299) | R$ 1.490 |
| Nexor Site Pro | R$ 149 (hospedagem, ajustes e segurança) | R$ 2.900 a R$ 6.900 por projeto |
| Nexor Commerce | a partir de R$ 497 | a partir de R$ 7.900 |
| Nexor Gestão (ERP e CRM) | a partir de R$ 990 | a partir de R$ 14.900 |
| Nexor Automação | R$ 297 por automação | a partir de R$ 3.500 por processo |
| Consultoria de LGPD | projeto fechado | a partir de R$ 3.900 |

---

## 3. Desenvolvimento sob demanda

| Modalidade | Valor |
|---|---|
| Hora avulsa | R$ 190 |
| Pacote de 20 horas | R$ 3.400 (R$ 170/h) |
| Pacote de 40 horas | R$ 6.400 (R$ 160/h) |
| Pacote de 80 horas | R$ 12.000 (R$ 150/h) |
| Projeto fechado | estimativa em horas × R$ 170 |
| Evolução mensal (10 h por mês) | R$ 1.600 |

**Regras dos projetos:**
- Pagamento em três parcelas: 40% na aprovação, 30% na homologação e 30% na entrega.
- Garantia de 90 dias para correções.
- Código-fonte e documentação são do cliente.
- Pacotes de horas valem por 6 meses.

---

## 4. Programa de fundadores

**Para quem:** os 10 primeiros clientes de cada um destes produtos: **Nexor Contábil, Nexor Barber, Nexor Agente e Nexor Service Desk** (o Nexor Elo tem condições próprias em `ELO-PRECOS.md`).

| Benefício | Valor |
|---|---|
| Desconto na mensalidade | **40% por 12 meses** |
| Desconto na implantação | **50%** |
| Preço travado | **24 meses sem reajuste** |
| Extra | Canal direto com o time e prioridade no que entra no produto |

**Contrapartidas do fundador:**
- depoimento em vídeo ou texto;
- estudo de caso com os números do próprio sistema;
- uma conversa de feedback por mês nos 3 primeiros meses;
- contrato mínimo de 12 meses.

**Na Central:** em "Contratar plano", marque "Programa de fundadores". A Central faz o resto sozinha:
- confere se o produto participa e se ainda há vaga;
- aplica os descontos nas faturas;
- marca o selo "Fundador";
- registra até quando o preço fica travado.

A tela Planos e preços mostra as vagas usadas.

---

## 5. Comissões

A comissão é sempre sobre o **valor efetivamente recebido**, já com desconto. Não incide sobre consumo de IA, Meta, SMS ou nuvem.

| Quem | 1ª mensalidade | Mensalidades seguintes | Implantação | Sob medida |
|---|---|---|---|---|
| **Vendedor interno** (com salário fixo) | 50% | 5% por 12 meses | 5% | 3% |
| **Representante comercial** (sem fixo, PJ) | 100% | 10% por 12 meses | 10% | 5% |
| **Parceiro indicador** (indica, a Nexor vende) | — | 10% enquanto o cliente estiver ativo | 5% | 3% |
| **Parceiro revenda** (vende e faz o 1º atendimento; a partir de 5 clientes ativos) | — | 20% enquanto ativo | 10% | 5% |
| **Parceiro estratégico** (revende e faz suporte nível 1; a partir de 15 clientes ativos) | — | 30% enquanto ativo | 15% | 5% |

**Regras:**
- **Quando nasce a comissão.** Ela é gerada sozinha na Central quando a fatura do cliente é paga, seja no Asaas ou com o botão "Recebida".
- **Carência de 30 dias.** A comissão fica "em carência" por 30 dias e depois passa para "a pagar".
- **Pagamento.** A Nexor paga por Pix e marca "Paguei" na Central.
- **Estorno.** Se o cliente cancelar nos primeiros 90 dias, a comissão da 1ª mensalidade e a da implantação que ainda não foram pagas são estornadas. Fatura reaberta ou cancelada também estorna a comissão dela.
- **Dois comissionados no mesmo cliente.** Um cliente pode ter vendedor e parceiro ao mesmo tempo, e cada um recebe pela própria regra.
- **Percentual especial.** Dá para combinar um percentual diferente para alguém específico: é só preencher em "Percentuais próprios" no cadastro.
- **Escritórios de contabilidade parceiros.** Entram como parceiro revenda (20% recorrente). O Nexor Contábil se paga com 3 ou 4 indicações.

### Portal do parceiro
Cada vendedor ou parceiro recebe um **link próprio do portal**. O link é gerado em Central → Parceiros e comissões → "Link do portal".

**No portal, o parceiro:**
- acompanha os clientes dele, inclusive os que estão em teste;
- vê as comissões em carência, a receber e já recebidas;
- vê a própria regra de comissão;
- **envia indicações**, que aparecem na Central para a equipe dar andamento.

O portal não mostra CNPJ, contatos nem faturas dos clientes. Se o link vazar, "Novo link do portal" derruba o antigo na hora.

---

## 6. Como apresentar: IA que trabalha, gente que cuida

A Nexor vende inteligência artificial, mas o cliente compra tranquilidade. Em toda conversa, proposta e peça:
- **A IA faz o trabalho pesado:** responde, lê documentos, agenda, cobra e calcula.
- **O time da Nexor cuida de você:** implanta junto, treina a equipe, acompanha os números e atende quando precisar, com nome e WhatsApp.
- **Nada de "robô sozinho":** cada produto tem uma pessoa da Nexor responsável pelo cliente, e a IA sempre deixa a decisão importante com uma pessoa (o contador confere, o dono aprova, a equipe assume a conversa).
