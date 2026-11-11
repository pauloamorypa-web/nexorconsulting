# Projeção de investimento e retorno por campanha

Os números estão em [`projecao.json`](projecao.json), no formato do simulador (`campanhas`, `premissas` e `fontes`). Este arquivo explica as hipóteses e mostra o resultado.

> **Tudo aqui é hipótese, não resultado.** A Nexor ainda não tem histórico de mídia paga. As faixas de CPL vêm de benchmarks públicos (fontes no fim), quase todos globais ou de mercados mistos, ajustados para baixo no custo e para cima na cautela. As taxas do funil são **conservadoras de propósito**. A partir da semana 3 da Fase 0, troque as hipóteses pelos números reais no `projecao.json` e recalcule.

## 1. Premissas

| Premissa | Valor | Por quê |
|---|---|---|
| Lead | Pré-cadastro no site ou conversa com a Blue com nome e WhatsApp ou e-mail válidos | É o que a Blue registra |
| Lead quente | Nota da Blue ≥ 70 (morno de 40 a 69, frio abaixo de 40) | Mesma régua do agente de vendas |
| Taxa de reunião | Demonstrações ÷ leads quentes | |
| Taxa de fechamento | Clientes pagantes ÷ demonstrações (depois do teste de 30 dias) | |
| Ticket mensal | Mensalidade média dos primeiros 12 meses, **já com o desconto de fundador** onde ele existe (Contábil, Barber, Agente e Elo) | Conservador: subestima o LTV depois do mês 12 |
| Ticket de implantação | Média esperada, com 50% de desconto para fundadores | |
| Margem bruta | 75% na mensalidade (IA, Meta e nuvem são pagos pelo cliente; o custo é suporte humano) e 40% na implantação (horas de equipe) | Hipótese da Nexor |
| CAC | Mídia ÷ vendas + comissão do vendedor interno (50% da 1ª mensalidade e 5% da implantação) | Não inclui salário fixo nem horas de demonstração: o CAC real é maior |
| LTV | Mensalidade × 75% × meses de retenção + implantação × 40% | |
| Payback | (CAC − margem da implantação) ÷ margem mensal | |
| Lead quente máximo | (LTV ÷ 3 − comissão) × taxa de reunião × taxa de fechamento | É o teto de custo por lead quente para manter LTV/CAC ≥ 3 |
| Defasagem | 1 mês entre o lead e a primeira mensalidade (o teste de 30 dias) | |
| Churn mensal | 1 ÷ meses de retenção | |
| CPL na escala | 25% pior que na validação | Público mais amplo e leilão mais disputado |
| Calendário | Mês 1: Fase 0 (3 semanas, 75% da verba de teste) · Meses 2 e 3: Fase 1 · Meses 4 a 12: Fase 2 só para quem passa (LTV/CAC ≥ 3 e payback ≤ 12 meses); quem fica entre 2 e 3 continua na validação; abaixo de 2, corta | |

**Mercado de Araguari:** a cidade é suficiente para começar `rh-ponto` (muitos empregadores, inclusive no café), `elo` (estratégia de âncora) e as palestras da umbrella, mas **é pequena para `contabil`, `barber`, `agente` e `ti` sustentarem mídia contínua**. Nesses quatro, a projeção já considera o Triângulo, Minas Gerais e o Brasil online. Para dimensionar cada mercado com dados reais, conte os CNPJs ativos por CNAE e município nos dados abertos da Receita (passo a passo no `README.md`, seção 6.6). Não estimamos o número de empresas sem essa contagem.

## 2. Verba mensal por fase

| Campanha | Fase 0 (teste) | Fase 1 (validação) | Fase 2 (escala) | Mercado |
|---|---:|---:|---:|---|
| atende | R$ 750 | R$ 2.000 | R$ 5.000 | Brasil (clínicas, imobiliárias, escolas e comércio com WhatsApp cheio); Triângulo no presencial |
| rh-ponto | R$ 750 | R$ 2.000 | R$ 5.000 | Triângulo Mineiro (presencial) + Brasil online; Araguari forte em café, comércio e serviços |
| contabil | R$ 750 | R$ 1.800 | R$ 3.500 | Araguari é pequeno: Triângulo + Minas Gerais + Brasil online |
| barber | R$ 450 | R$ 1.200 | R$ 3.000 | Araguari é pequeno: Triângulo + capitais e cidades médias do Brasil |
| agente | R$ 750 | R$ 1.800 | R$ 4.000 | Triângulo + Brasil (distribuidoras, indústrias e serviços com ERP) |
| elo | R$ 450 | R$ 1.000 | R$ 2.000 | Araguari e Triângulo (estratégia de âncora); depois Goiás e interior de SP |
| ti | R$ 600 | R$ 1.500 | R$ 3.500 | Brasil online (Google Search); Triângulo no presencial |
| nexor-qualquer-cenario | R$ 600 | R$ 1.200 | R$ 2.500 | Triângulo Mineiro (remarketing e marca) + Brasil |
| **Total se todas rodarem** | **R$ 5.100** | **R$ 12.500** | **R$ 28.500** | |

## 3. Funil esperado na Fase 1 (por mês, CPL médio)

| Campanha (Fase 1, CPL médio) | Leads/mês | Quentes | Demonstrações | Vendas |
|---|---:|---:|---:|---:|
| atende | 44 | 8,9 | 4,4 | 0,98 |
| rh-ponto | 36 | 8,0 | 4,0 | 1,00 |
| contabil | 26 | 6,4 | 3,5 | 0,88 |
| barber | 55 | 9,8 | 5,4 | 1,62 |
| agente | 23 | 3,4 | 1,7 | 0,30 |
| elo | 15 | 3,8 | 2,3 | 0,46 |
| ti | 17 | 3,3 | 1,7 | 0,37 |
| nexor-qualquer-cenario | 30 | 3,6 | 1,6 | 0,29 |

## 4. CPL e taxas do funil

O **lead quente máximo** é o teto de custo por lead quente para a campanha manter LTV/CAC ≥ 3. Quando o custo esperado (coluna "Lead quente (médio)") passa do teto, a campanha só se paga se as taxas reais forem melhores que as hipóteses.

| Campanha | CPL baixo | CPL médio | CPL alto | Lead quente (médio) | Lead quente máximo | Quente | Reunião | Fechamento |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| atende | R$ 25 | R$ 45 | R$ 80 | R$ 225 | R$ 279 | 20% | 50% | 22% |
| rh-ponto | R$ 30 | R$ 55 | R$ 95 | R$ 250 | R$ 346 | 22% | 50% | 25% |
| contabil | R$ 40 | R$ 70 | R$ 120 | R$ 280 | R$ 417 | 25% | 55% | 25% |
| barber | R$ 12 | R$ 22 | R$ 40 | R$ 122 | R$ 105 | 18% | 55% | 30% |
| agente | R$ 45 | R$ 80 | R$ 140 | R$ 533 | R$ 197 | 15% | 50% | 18% |
| elo | R$ 35 | R$ 65 | R$ 120 | R$ 260 | R$ 471 | 25% | 60% | 20% |
| ti | R$ 50 | R$ 90 | R$ 160 | R$ 450 | R$ 240 | 20% | 50% | 22% |
| nexor-qualquer-cenario | R$ 20 | R$ 40 | R$ 70 | R$ 333 | R$ 156 | 12% | 45% | 18% |

**De onde vêm as faixas de CPL:** os benchmarks globais de B2B apontam cerca de US$ 27,66 por lead no Meta, US$ 70 no Google e de US$ 110 a mais de US$ 200 no LinkedIn; os CPCs no Brasil costumam ser bem menores que nos EUA (a V4 estima US$ 2 a US$ 5 de CPC no LinkedIn brasileiro); compilações brasileiras citam R$ 35 a R$ 85 por lead no Google Search; e o custo por lead no Brasil subiu 33,6% entre 2024 e 2025. Por isso as faixas vão de R$ 12 a R$ 40 para a barbearia (Meta, decisor pessoa física) até R$ 50 a R$ 160 para TI (Search com clique caro e LinkedIn).

## 5. Economia por cliente (Fase 1)

| Campanha | Ticket mensal | Implantação | Retenção | LTV | CAC (baixo / médio / alto) | LTV/CAC (baixo / médio / alto) | Payback médio |
|---|---:|---:|---:|---:|---:|---:|---:|
| atende | R$ 597 | R$ 1.800 | 18 meses | R$ 8.780 | R$ 1.525 / R$ 2.434 / R$ 4.025 | 5,8 / 3,6 / 2,2 | 3,8 meses |
| rh-ponto | R$ 380 | R$ 1.300 | 30 meses | R$ 9.070 | R$ 1.346 / R$ 2.255 / R$ 3.710 | 6,7 / 4,0 / 2,4 | 6,1 meses |
| contabil | R$ 420 | R$ 1.100 | 30 meses | R$ 9.890 | R$ 1.429 / R$ 2.301 / R$ 3.756 | 6,9 / 4,3 / 2,6 | 5,9 meses |
| barber | R$ 150 | R$ 450 | 18 meses | R$ 2.205 | R$ 502 / R$ 838 / R$ 1.444 | 4,4 / 2,6 / 1,5 | 5,9 meses |
| agente | R$ 450 | R$ 1.900 | 20 meses | R$ 7.510 | R$ 3.653 / R$ 6.246 / R$ 10.690 | 2,1 / 1,2 / 0,7 | 16,3 meses |
| elo | R$ 700 | R$ 900 | 24 meses | R$ 12.960 | R$ 1.562 / R$ 2.562 / R$ 4.395 | 8,3 / 5,1 / 2,9 | 4,2 meses |
| ti | R$ 380 | R$ 1.100 | 24 meses | R$ 7.280 | R$ 2.518 / R$ 4.336 / R$ 7.518 | 2,9 / 1,7 / 1,0 | 13,7 meses |
| nexor-qualquer-cenario | R$ 450 | R$ 1.500 | 18 meses | R$ 6.675 | R$ 2.358 / R$ 4.415 / R$ 7.502 | 2,8 / 1,5 / 0,9 | 11,3 meses |

## 6. MRR projetado em 3, 6 e 12 meses

Cenário médio (CPL médio) e cenário conservador (CPL alto). O MRR é a receita recorrente faturada no mês, depois do teste de 30 dias e já descontado o churn. **Não inclui** as vendas da prospecção ativa, dos parceiros e dos eventos, nem as implantações (que entram uma vez só).

| Campanha | Decisão no cenário médio | MRR mês 3 | MRR mês 6 | MRR mês 12 | Clientes no mês 12 | Mídia em 12 meses | Decisão no cenário alto | MRR mês 12 (CPL alto) |
|---|---|---:|---:|---:|---:|---:|---|---:|
| atende | escalar | R$ 739 | R$ 3.413 | R$ 8.523 | 14,3 | R$ 49.563 | otimizar (fica na validação) | R$ 2.625 |
| rh-ponto | escalar | R$ 483 | R$ 2.286 | R$ 6.062 | 16,0 | R$ 49.563 | otimizar (fica na validação) | R$ 1.942 |
| contabil | escalar | R$ 483 | R$ 1.919 | R$ 4.755 | 11,3 | R$ 35.663 | otimizar (fica na validação) | R$ 1.916 |
| barber | otimizar (fica na validação) | R$ 308 | R$ 948 | R$ 1.943 | 13,0 | R$ 13.538 | cortar | R$ 186 |
| agente | cortar | R$ 177 | R$ 275 | R$ 202 | 0,4 | R$ 4.163 | cortar | R$ 116 |
| elo | escalar | R$ 428 | R$ 1.685 | R$ 4.101 | 5,9 | R$ 20.338 | otimizar (fica na validação) | R$ 1.494 |
| ti | cortar | R$ 179 | R$ 286 | R$ 221 | 0,6 | R$ 3.450 | cortar | R$ 125 |
| nexor-qualquer-cenario | cortar | R$ 178 | R$ 267 | R$ 189 | 0,4 | R$ 2.850 | cortar | R$ 108 |
| **Total** | | **R$ 2.975** | **R$ 11.080** | **R$ 25.997** | **61,8** | **R$ 179.125** | | **R$ 8.512** |

**Implantações nos 12 meses (cenário médio):** cerca de **R$ 87 mil** de receita única, que ajuda a pagar a mídia do primeiro ano.

## 7. Leitura

1. **Quatro campanhas carregam a projeção:** `atende`, `rh-ponto`, `contabil` e `elo` passam no critério de escala no cenário médio. Elas devem receber a verba da Fase 2 primeiro.
2. **`barber` fica no limite** (LTV/CAC de cerca de 2,6). Escala só se o CPL real ficar perto de R$ 12 a R$ 18 ou se a venda vier por visita, distribuidor parceiro e indicação.
3. **`agente`, `ti` e a umbrella não se pagam só com mídia** com estas hipóteses. Não é motivo para abandonar os produtos, e sim para vendê-los por outro canal: prospecção ativa e LinkedIn (`agente`), parceiros de TI (`ti`) e remarketing e eventos (umbrella). A mídia deles fica no mínimo e é revista depois de 5 demonstrações.
4. **No cenário de CPL alto, nenhuma campanha escala** e o MRR do mês 12 cai para cerca de R$ 8,5 mil. É o piso honesto: com ele, a mídia do ano custa mais do que devolve no primeiro ano, e o retorno vem da retenção e das implantações.
5. **O que mais muda o resultado** não é o CPL, e sim a **taxa de quente** e a **taxa de fechamento**. Cinco pontos a mais no fechamento (por exemplo, de 22% para 27% no Atende) melhoram o CAC mais do que baixar o CPL em R$ 10. Por isso o plano mestre cobra resposta em 5 minutos, demonstração em 48 horas e acompanhamento do teste no dia 3, no dia 15 e no dia 25.
6. **Payback curto** nas campanhas que passam (de 4 a 6 meses): a implantação paga parte do CAC logo na contratação.

## 8. Como usar no simulador

Cada item de `campanhas` tem os campos de entrada:
- `id`, `nome` e `mercado`;
- `verba_mensal` (`teste`, `validacao` e `escala`);
- `cpl` (`baixo`, `medio` e `alto`);
- `taxa_quente`, `taxa_reuniao` e `taxa_fechamento`;
- `ticket_mensal`, `ticket_implantacao` e `retencao_meses`.

E dois blocos calculados, só para conferência: `derivados_validacao` (leads, quentes, reuniões, vendas, CAC, LTV, LTV/CAC, payback e custo por lead quente, nos três CPLs) e `projecao` (decisão e MRR nos meses 3, 6 e 12, por cenário). As fórmulas estão em `premissas`. O simulador pode recalcular tudo a partir dos campos de entrada; se os blocos calculados divergirem, vale o recálculo.

**Atualização mensal:** troque `cpl`, as três taxas e `ticket_mensal` pelos valores reais do mês (painel do `README.md`, seção 5), mantenha as fontes e registre a data em `versao`.

## 9. Fontes

Buscas feitas em novembro de 2026. Quase todos os benchmarks são globais ou de mercados mistos; os do Brasil são panoramas gerais, não específicos de software B2B. Use como ordem de grandeza.

- [Leadster, Panorama de Geração de Leads 2025 (resumo no blog da Agendor)](https://www.agendor.com.br/blog/panorama-de-geracao-de-leads-no-brasil/): conversão média de sites no Brasil de 2,98%, em 2.861 sites e 3,7 milhões de leads.
- [Mundo do Marketing](https://mundodomarketing.com.br/conversao-de-leads-volta-a-crescer-no-brasil-apos-tres-anos-de-queda): o custo por lead no Brasil subiu 33,6% entre 2024 e 2025.
- [Conversion, Google Ads Benchmarks 2024](https://www.conversion.com.br/blog/google-ads-benchmarks-2024): conversão média de 6,96% e CPL médio de US$ 66,69 no Google Ads.
- [Conversion, calculadora de CPL](https://www.conversion.com.br/blog/calculadora-de-custo-por-lead-cpl): conversão por segmento no Panorama 2025.
- [Search Engine Land, custos do Google Ads em 2025](https://searchengineland.com/google-ads-costs-keep-rising-but-conversion-rates-improved-in-2025-477927): CPC médio de US$ 5,42 em 2025 (US$ 4,66 em 2024), com conversão melhorando.
- [Snov.io, estatísticas de geração de leads](https://snov.io/blog/br/estatisticas-de-geracao-de-leads/): CPL B2B médio de US$ 84; Google Ads US$ 70,11; Meta Ads US$ 27,66; LinkedIn cerca de US$ 110.
- [Metadata.io, benchmarks de publicidade B2B](https://metadata.io/b2b-advertising-benchmarks): LinkedIn de US$ 193 por lead com formulário nativo a US$ 346 com landing page.
- [Search Engine Land, CPC do LinkedIn Ads](https://searchengineland.com/linkedin-ads-cpc-benchmarks-how-costs-compare-with-google-ads-481010): CPC médio de US$ 13,94 em prospecção; SaaS B2B, US$ 11,02.
- [V4 Company, LinkedIn Ads](https://v4company.com/blog/marketing-digital/linkedin-ads): CPC estimado de US$ 2 a US$ 5 no Brasil.
- [Babi Tonhela, custo por lead no Brasil](https://babitonhela.com/blog/custo-por-lead-brasil-benchmarks/): R$ 35 a R$ 85 por lead no Google Search (compilação, sem estudo primário).
- [Superads, custo por lead no Facebook Ads no Brasil](https://www.superads.ai/facebook-ads-costs/cost-per-lead/brazil): referência de CPL do Meta no Brasil.
- Preços, teste de 30 dias, fundadores e comissões: [`PLANOS-E-PRECOS.md`](../../comercial/PLANOS-E-PRECOS.md) e [`ELO-PRECOS.md`](../../comercial/ELO-PRECOS.md).
