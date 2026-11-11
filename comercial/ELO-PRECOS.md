# Nexor Elo: planos, preços, comissões e simulações

Tabela comercial do **Nexor Elo**, a rede que liga fornecedores e instaladores (novembro de 2026). Segue o formato de [`PLANOS-E-PRECOS.md`](PLANOS-E-PRECOS.md) e é uma **proposta para validar**: ajuste depois do primeiro fornecedor âncora e das primeiras 50 propostas pagas.

**Onde os valores vão morar:** quando o Elo entrar na Central, os planos abaixo precisam ser cadastrados em `central/src/planos.js` (este documento não altera a Central). Mudou um preço, mude lá e aqui.

**Como o Elo cobra, em uma frase:** o fornecedor paga uma mensalidade pelo porte e uma pequena taxa sobre os produtos que ele vendeu e **já recebeu** pelo split; o instalador usa grátis ou assina o Pro; a mão de obra e a margem do instalador **nunca** pagam taxa da Nexor.

**Regras que valem para tudo:**
- **Taxa por venda liquidada:** incide só sobre a parte dos **produtos do fornecedor** que foi efetivamente paga pelo cliente final e liquidada no split. Proposta recusada, vencida ou estornada não paga nada.
- **Taxa do meio de pagamento** (Pix, boleto ou cartão, pelo Asaas): é da conta do Asaas e sai de cada parte do split na proporção do valor dela. A proposta mostra isso antes do envio, na calculadora de preço.
- **Nota fiscal** (Focus NFe ou PlugNotas), mensagens pagas do WhatsApp e SMS ficam na conta de quem emite ou envia, como nos outros produtos.
- **Pagamento anual:** paga 10 mensalidades e usa 12 (16,7% de desconto). Vale também para o instalador Pro.
- **Reajuste anual pelo IPCA**, exceto para fundadores no período de preço travado.
- Implantação é cobrada uma vez, na contratação, só do fornecedor. O instalador não paga implantação.

---

## 1. Planos do fornecedor (por porte da rede)

O porte é medido pelos **instaladores ativos** (com pelo menos uma proposta enviada nos últimos 90 dias) vinculados ao fornecedor.

| Plano | Para quem | Inclui | Mensalidade | Implantação | Taxa por venda liquidada |
|---|---|---|---|---|---|
| **Loja** | Loja ou revenda de bairro | Até 30 instaladores ativos, 1 unidade, 3 usuários, catálogo e estoque, reserva com prazo, split, privacidade do cliente final | R$ 397 | R$ 1.500 | 2,5% |
| **Distribuidor** | Distribuidor regional | Até 150 instaladores ativos, 3 unidades, 10 usuários, **crédito e bloqueio por inadimplência**, score do instalador, kits inteligentes, tabelas de preço por instalador | R$ 997 | R$ 3.500 | 2,0% |
| **Atacado** | Atacadista ou rede com filiais | Até 500 instaladores ativos, unidades e usuários ilimitados, integração com o ERP (estoque e pedidos), relatórios por filial, suporte prioritário | R$ 1.997 | R$ 7.000 | 1,5% |
| **Rede** | Acima de 500 instaladores ou integração sob medida | Tudo do Atacado + conectores sob medida | sob consulta | sob consulta | negociada (mínimo 1%) |

**Detalhes:**
- Passou do limite de instaladores ativos por 2 meses seguidos, o sistema avisa e sugere o plano seguinte. Ninguém é bloqueado no meio do mês.
- Integração com ERP fora do Atacado: R$ 2.000 a R$ 5.000 por conector, como no Nexor Agente.
- A taxa por venda é calculada e retida no próprio split. Não há boleto extra para o fornecedor pagar.

## 2. Planos do instalador

| Plano | Inclui | Preço |
|---|---|---|
| **Grátis** | 1 usuário, **até 5 propostas por mês** e 5 ordens de serviço por mês, fornecedores vinculados sem limite, comparador de fornecedores, kits prontos, link da proposta com pagamento por Pix, boleto ou cartão e split automático. A proposta sai com o selo "Feito com Nexor Elo" | R$ 0 |
| **Pro** | Propostas e ordens de serviço **ilimitadas**, dono + 2 técnicos (técnico extra: R$ 19 por mês), **marca própria** na proposta, calculadora com impostos completa (Simples, ISS, taxas e lucro líquido), NFS-e facilitada, **contratos de manutenção recorrentes** cobrados sozinhos, garantia por número de série, relatórios de conversão | **R$ 79 por mês** ou R$ 790 por ano |

**Por que o instalador topa:** no Grátis ele já fecha proposta com o estoque do fornecedor e recebe garantido. O Pro se paga com **uma** proposta a mais fechada por mês ou com **um** contrato de manutenção recorrente.

---

## 3. Teste grátis de 30 dias

Mesmo modelo dos outros produtos: funções limitadas e, depois, só continua com o plano contratado.

| Perfil | Limitações no teste |
|---|---|
| **Fornecedor** | Até 10 instaladores convidados, até 200 itens no catálogo, 2 usuários. Sem crédito a prazo e sem integração com ERP. Vendas reais com split **liberadas até R$ 20 mil liquidados**, **sem taxa por venda** no teste |
| **Instalador** | O plano Grátis não tem prazo. O **Pro pode ser testado por 30 dias**; no fim, volta ao Grátis sozinho, sem perder propostas nem ordens de serviço |

**Como funciona:**
1. **Início.** A equipe cadastra o fornecedor na Central e escolhe "Começar no teste grátis". A Nexor importa o catálogo (planilha ou ERP) e convida os primeiros instaladores junto com o fornecedor.
2. **Durante os 30 dias.** O painel mostra a faixa com os dias que faltam e o botão de contratar, que abre o WhatsApp da Nexor. Ao passar de um limite, o sistema explica o que o plano libera.
3. **Fim do teste.** Sem contratação, o painel do fornecedor fica **bloqueado para novas reservas e propostas**. Propostas já pagas continuam com o split e a nota até o fim, e os dados ficam guardados por 60 dias. Os instaladores continuam com acesso ao histórico deles.
4. **Contratação.** "Contratar plano" encerra o teste, libera tudo em até 5 minutos, gera a fatura de implantação e começa a mensalidade. A taxa por venda passa a valer a partir daí.

A equipe pode prorrogar o teste pelo painel, no máximo 30 dias por vez.

---

## 4. Programa de fundadores do Elo

**Para quem:** os **10 primeiros fornecedores** do Nexor Elo (qualquer plano, Loja a Atacado).

| Benefício | Valor |
|---|---|
| Desconto na mensalidade | **40% por 12 meses** |
| Desconto na implantação | **50%** |
| Preço travado | **24 meses sem reajuste**, incluindo o **percentual da taxa por venda** |
| Para a rede do fundador | Os instaladores convidados pelo fornecedor fundador ganham **3 meses do Pro grátis** |
| Extra | Canal direto com o time e prioridade no que entra no produto (kits do segmento, integrações) |

**Contrapartidas do fundador** (as mesmas dos outros produtos):
- depoimento em vídeo ou texto;
- estudo de caso com os números do próprio sistema (propostas, conversão, prazo de recebimento);
- uma conversa de feedback por mês nos 3 primeiros meses;
- contrato mínimo de 12 meses;
- convidar pelo menos 10 instaladores da carteira nos primeiros 60 dias.

**Exemplo:** Distribuidor fundador paga R$ 598,20 por mês nos primeiros 12 meses (em vez de R$ 997), R$ 1.750 de implantação (em vez de R$ 3.500) e mantém 2,0% de taxa por venda até o mês 24.

---

## 5. Comissões

Mesmas regras de [`PLANOS-E-PRECOS.md`](PLANOS-E-PRECOS.md#5-comissões): sempre sobre o **valor efetivamente recebido**, já com desconto, com carência de 30 dias, estorno nos primeiros 90 dias e portal do parceiro.

| Quem | 1ª mensalidade | Mensalidades seguintes | Implantação | Receita da taxa por venda | Instalador Pro |
|---|---|---|---|---|---|
| **Vendedor interno** (com fixo) | 50% | 5% por 12 meses | 5% | 5% por 12 meses | — |
| **Representante comercial** (PJ, sem fixo) | 100% | 10% por 12 meses | 10% | 10% por 12 meses | 10% por 12 meses |
| **Parceiro indicador** | — | 10% enquanto ativo | 5% | 10% enquanto ativo | 10% enquanto ativo |
| **Parceiro revenda** (a partir de 5 clientes ativos) | — | 20% enquanto ativo | 10% | 15% enquanto ativo | 20% enquanto ativo |
| **Parceiro estratégico** (a partir de 15 clientes ativos) | — | 30% enquanto ativo | 15% | 20% enquanto ativo | 30% enquanto ativo |

**Regras específicas do Elo:**
- **"Receita da taxa por venda"** é o que a Nexor recebeu de taxa (por exemplo, 2% do produto liquidado), **nunca** o valor da venda. Com R$ 240 mil liquidados no mês a 2%, a base é R$ 4.800.
- **Fornecedor que traz instaladores** não é comissionado em dinheiro: ganha **10% do Pro de cada instalador que ele convidou** como crédito na própria mensalidade, enquanto o instalador estiver ativo (limite: a mensalidade do mês).
- **Instalador que indica fornecedor** entra como parceiro indicador: 10% da mensalidade do fornecedor enquanto ativo, ou 3 meses do Pro grátis, à escolha dele.
- **Bons parceiros naturais:** representantes de fabricantes (Intelbras, WEG, Hikvision e outros) que visitam as mesmas revendas, contadores de instaladores e associações comerciais.

---

## 6. Justificativa com o mercado

| Referência | O que entrega | Quanto custa | Fonte |
|---|---|---|---|
| **Auvo** | Ordem de serviço e equipe em campo. Não liga estoque do fornecedor nem divide o pagamento | a partir de **R$ 225 por mês** (preço de comparador, a confirmar com a empresa) | [B2BStack](https://www.b2bstack.com.br/produto/auvo) |
| **Field Control** | Ordem de serviço, geolocalização e técnicos. Sem estoque do fornecedor nem split | por volta de **R$ 295 por usuário por mês** no plano básico (preço de terceiro, a confirmar) | [SoftwareFinder](https://softwarefinder.com/field-service/field-control), [TrustRadius](https://www.trustradius.com/compare-products/field-control) |
| **Marketplace (Mercado Livre)** | Vitrine e pagamento, sem orçamento técnico, sem instalação e sem privacidade da carteira | **10% a 14%** por venda no anúncio Clássico e **15% a 19%** no Premium, mais custo fixo em itens baratos | [Rua CEP (2026)](https://www.ruacep.com.br/guias/ecommerce/comissao-marketplace-ml-amazon-shopee-magalu-2026/), [Bling](https://blog.bling.com.br/taxas-mercado-livre/) |
| **oHub / Loja Intelbras** | Geram lead de cliente final para o instalador | não ligam estoque nem pagamento | pesquisa de mercado em [`elo/PRODUTO.md`](../elo/PRODUTO.md) |

**Leitura:**
- **Para o instalador,** um sistema de ordem de serviço custa de R$ 225 a R$ 295 por mês (ou por usuário). O **Elo Pro custa R$ 79** e ainda traz o estoque do fornecedor, a proposta com pagamento e o recebimento garantido. O Grátis tira a barreira de entrada, que é o que faz a rede crescer.
- **Para o fornecedor,** marketplace cobra de 10% a 19% por venda e não leva o produto até a obra. O Elo cobra **1,5% a 2,5% só do produto liquidado**, menos que a taxa de um cartão parcelado, e o fornecedor ganha um canal de venda que é a própria carteira de instaladores.
- **Ninguém mais junta** orçamento com estoque reservado + pagamento dividido + privacidade do cliente do instalador + crédito e bloqueio. Por isso a mensalidade fica na mesma faixa dos outros produtos da Nexor (R$ 397 a R$ 1.997), e a taxa é o que acompanha o resultado.

---

## 7. Simulações de receita

As simulações usam **hipóteses**, não resultados de clientes. Troque pelos números reais do fornecedor na visita.

### 7.1 Fornecedor: Distribuidor com 40 instaladores ativos

**Hipóteses:** cada instalador fecha 2 propostas por mês pelo Elo, com R$ 3.000 de produtos em cada; margem bruta do distribuidor de 25%; hoje ele vende a prazo de 30 dias para o instalador, com 2% de inadimplência; custo do dinheiro de 1,8% ao mês.

| Item | Valor por mês |
|---|---|
| Produtos liquidados pelo Elo | 40 × 2 × R$ 3.000 = **R$ 240.000** |
| Custo do Elo | R$ 997 + 2% × R$ 240.000 = **R$ 5.797** (2,4% das vendas) |
| Capital de giro liberado (recebe no split em vez de 30 dias) | **R$ 240.000** de uma vez; economia de juros de cerca de **R$ 4.320 por mês** |
| Inadimplência evitada (2% do que era vendido a prazo) | **R$ 4.800 por mês** |
| **Só com prazo e calote, o Elo já empata** | R$ 9.120 de ganho contra R$ 5.797 de custo |

**Giro de estoque:** com estoque médio de R$ 600 mil e custo das vendas de R$ 180 mil por mês, o giro é de **3,6 vezes por ano (101 dias)**. Se o Elo trouxer 10% a mais de vendas (instaladores fechando mais, kits puxando o mix certo) e a reserva com prazo permitir manter 10% menos de estoque parado, o giro vai para **4,4 vezes por ano (83 dias)**: são **18 dias a menos** com o dinheiro parado na prateleira.

**Ponto de equilíbrio pela margem:** o Elo se paga com **R$ 23.200 de vendas novas por mês** (R$ 5.797 ÷ 25% de margem), ou seja, cerca de 4 propostas a mais de R$ 3.000 por semana em toda a rede.

### 7.2 Instalador: autônomo com 8 propostas por mês

**Hipóteses:** 8 propostas por mês; serviço + margem de R$ 1.500 por proposta fechada; hoje fecha 30% e perde 5% do que fatura com cliente que não paga.

| Item | Hoje (WhatsApp e PDF) | Com o Elo Pro |
|---|---|---|
| Propostas fechadas | 30% → 2,4 por mês | 40% → 3,2 por mês (link bonito, parcelamento no cartão, aceite na hora) |
| Serviço + margem | R$ 3.600 | R$ 4.800 |
| Calote | −R$ 180 | R$ 0 (o cliente paga antes, no link) |
| Custo | R$ 0 | −R$ 79 |
| **Resultado do mês** | **R$ 3.420** | **R$ 4.721 (+R$ 1.301)** |

Ainda entra o que não está na conta: **não precisa comprar o material antes** (o split paga o fornecedor), não perde tempo cotando em três lojas (o comparador faz) e pode vender **contrato de manutenção mensal** cobrado sozinho.

### 7.3 Nexor: Araguari e Triângulo Mineiro

**Mês 12 (cenário conservador):** 1 Distribuidor âncora fundador, 2 Lojas fundadoras, 2 Lojas no preço cheio, 100 instaladores ativos, 25 deles no Pro.

| Receita | Valor por mês |
|---|---|
| Mensalidades dos fornecedores | R$ 598,20 + 2 × R$ 238,20 + 2 × R$ 397 = **R$ 1.868,60** |
| Taxa por venda (Distribuidor R$ 240 mil a 2%; Lojas fundadoras R$ 60 mil a 2,5%; Lojas R$ 40 mil a 2,5%) | R$ 4.800 + R$ 3.000 + R$ 2.000 = **R$ 9.800** |
| Instaladores Pro (25 × R$ 79) | **R$ 1.975** |
| **Receita recorrente no mês 12** | **R$ 13.643,60** |
| Implantações no ano (únicas) | R$ 1.750 + 2 × R$ 750 + 2 × R$ 1.500 = **R$ 6.250** |

**Mês 24 (meta):** 3 Distribuidores, 8 Lojas, 1 Atacado (R$ 600 mil liquidados a 1,5%) e 90 instaladores Pro: cerca de **R$ 48 mil de receita recorrente por mês** (R$ 7.448 de mensalidades, R$ 33.400 de taxa e R$ 7.110 do Pro).

**O que mais pesa:** a taxa por venda é cerca de 70% da receita. Por isso a estratégia é **um fornecedor âncora com muitos instaladores ativos**, e não muitos fornecedores com rede pequena (ver [`ELO-ARAGUARI.md`](ELO-ARAGUARI.md)).

---

## 8. Como apresentar: IA com cuidado humano

- **A IA faz o trabalho pesado:** monta o orçamento com o estoque do fornecedor, compara preços, calcula impostos e margem, cobra e divide o pagamento.
- **O time da Nexor cuida de você:** importa o catálogo, convida os instaladores junto com o fornecedor, treina a equipe de balcão e acompanha os números, com nome e WhatsApp.
- **Quem decide é uma pessoa:** o fornecedor aprova cada instalador e define o crédito; o instalador aprova o preço final; o cliente final aceita a proposta.
- **Frase de abertura:** "Seu orçamento já sai com o estoque do fornecedor e o dinheiro já cai dividido."
