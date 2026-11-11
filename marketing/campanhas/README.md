# Campanha de vendas da Nexor: plano mestre (novembro de 2026)

**Objetivo:** captar leads reais e quentes e transformar esses leads em clientes pagantes, com verba pequena no começo e escala só do que provar retorno.

**Assinatura em todas as peças e conversas:** IA com cuidado humano. A IA faz o trabalho pesado; o time da Nexor implanta junto, treina e acompanha, com nome e WhatsApp.

**Arquivos desta pasta:**

| Arquivo | O que tem |
|---|---|
| `README.md` | Este plano: meta, funil, canais, verba por fase, critérios, painel, inteligência de público, LGPD e testes A/B |
| [`atende.md`](atende.md), [`rh-ponto.md`](rh-ponto.md), [`contabil.md`](contabil.md), [`barber.md`](barber.md), [`agente.md`](agente.md), [`elo.md`](elo.md), [`ti.md`](ti.md), [`nexor-qualquer-cenario.md`](nexor-qualquer-cenario.md) | Um plano por campanha: ICP, filtros, mensagens, anúncios, abordagem ativa, objeções, demonstração, metas e links com UTM |
| [`projecao.json`](projecao.json) e [`PROJECAO.md`](PROJECAO.md) | Investimento e retorno por campanha (CPL, CAC, LTV/CAC, payback e MRR em 3, 6 e 12 meses), com as fontes |
| `../pecas/camp-*.png` | Criativos novos: um quadrado por campanha e o carrossel "um sistema para cada cenário" |

**Fontes internas:** preços, teste e fundadores em [`../../comercial/PLANOS-E-PRECOS.md`](../../comercial/PLANOS-E-PRECOS.md) e [`../../comercial/ELO-PRECOS.md`](../../comercial/ELO-PRECOS.md); prospects do Elo em [`../../comercial/ELO-ARAGUARI.md`](../../comercial/ELO-ARAGUARI.md); regras de canal em [`../CANAIS.md`](../CANAIS.md). Ainda **não existe** um estudo de preços do Brasil e de Araguari em `comercial/`. As faixas de mercado usadas aqui estão nas fontes do `PROJECAO.md`.

> **Como ler os números:** tudo o que é meta, taxa, CPL ou MRR neste plano é **hipótese conservadora**, não resultado. A Nexor ainda não tem histórico de mídia paga. A partir da semana 3 da Fase 0, troque as hipóteses pelos números reais no `projecao.json`.

---

## 1. Objetivo e meta de 90 dias

| Indicador (dias 1 a 90) | Meta | Piso aceitável | De onde vem |
|---|---:|---:|---|
| Leads (mídia paga) | 560 | 300 | Soma das 8 campanhas na Fase 0 e na Fase 1 com o CPL médio |
| **Leads quentes** (nota da Blue ≥ 70) | **110** | 60 | 12% a 25% dos leads, conforme a campanha |
| **Demonstrações feitas** (pacote `demo/`) | **55** | 30 | Cerca de metade dos quentes |
| Testes de 30 dias ativados | 35 | 20 | Quem viu a demonstração e aceitou o teste no ambiente dele |
| **Vendas** (contrato assinado ou teste convertido) | **15** | 8 | Cerca de 12 vindas da mídia + 3 a 5 da prospecção ativa e de parceiros |
| Vagas de fundador preenchidas (Contábil, Barber, Agente, Elo) | 8 de 40 | 4 | Fundador é a principal alavanca de fechamento |
| **MRR contratado no dia 90** | **R$ 7.000** | R$ 3.000 | Vendas × ticket médio do primeiro ano, já com desconto de fundador |
| Investimento em mídia nos 90 dias | até R$ 29 mil | | Ver tabela de verba |

**Por que o MRR é pequeno no dia 90:** o cliente só paga depois do teste de 30 dias, e a Fase 2 (escala) começa no mês 4. A projeção de 12 meses do cenário médio chega a **cerca de R$ 26 mil de MRR** com 4 ou 5 campanhas escaladas. No cenário de CPL alto, fica em **cerca de R$ 8,5 mil**. Os detalhes estão no [`PROJECAO.md`](PROJECAO.md).

**Metas de processo (estas a equipe controla):**
- responder lead quente em **até 5 minutos** no horário comercial e até as 9h do dia seguinte fora dele;
- demonstração marcada em **até 48 horas** depois do lead quente;
- todo teste com uma conversa de acompanhamento no **dia 3**, no **dia 15** e no **dia 25**;
- 100% dos leads com origem (UTM) registrada na Central.

---

## 2. Funil

```
Anúncio / abordagem ativa / parceiro
        │  link com utm_campaign
        ▼
Página do produto com "Teste grátis de 30 dias"  ──► remarketing de quem não converteu
        │  pré-cadastro ou conversa com a Blue
        ▼
Blue qualifica (nota 0 a 100) e detecta a campanha pela UTM
        │  quente (≥ 70)        morno (40 a 69)          frio (< 40)
        ▼                        ▼                        ▼
Aviso imediato à equipe   cadência de nutrição      conteúdo e remarketing
        │  ligação ou WhatsApp em até 5 min (o lead deu o número no cadastro: há opt-in)
        ▼
Demonstração de 10 min com o pacote demo/ (roteiro no DEMO.md do produto)
        │
        ▼
Teste de 30 dias no ambiente do cliente (Central → "Começar no teste grátis")
        │  dia 3, dia 15 e dia 25: acompanhamento com números do próprio teste
        ▼
Oferta de fundador (Contábil, Barber, Agente e Elo) ou plano cheio com pagamento anual
        │
        ▼
Fechamento: Central → "Contratar plano" (fatura de implantação, comissão e selo de fundador)
        │
        ▼
Conversão offline enviada para Meta e Google (otimiza a compra de mídia) + pedido de depoimento e indicação
```

**Eventos de conversão** (nomes como estão hoje em `agent/src/meta.js`; confira de novo quando o outro agente terminar, antes de criar as conversões nas plataformas):

| Etapa | Evento | Uso |
|---|---|---|
| Pré-cadastro ou conversa com contato | `Lead` | Otimização inicial (Fase 0) |
| Nota ≥ 70 | `LeadQuente` (API de Conversões do Meta) e `LeadQualificado` (conversão do Google e do Meta) | Otimização a partir da Fase 1, quando houver volume |
| Demonstração marcada | `AgendouDemo` | Medir a taxa de reunião por campanha |
| Teste de 30 dias ativado | `StartTrial` (Meta) e `TesteAtivado` (Google), conversão offline vinda da Central | Medir o custo por teste por campanha |
| Contrato fechado | `Purchase` (Meta) e `Contrato` (Google), com o valor real (1ª mensalidade + implantação) | Calcular o CAC real e alimentar o lance por valor |

Os eventos de lead levam um valor em reais proporcional à nota do lead (por exemplo, nota 80 vale R$ 240 no `Lead`). É um valor de **sinal para o leilão**, não receita: não some esses valores no painel. Só o `Purchase`/`Contrato` leva receita de verdade (detalhes na seção "Conversão offline" abaixo).

### Conversão offline

1. **Central:** quando o cliente entra no teste de 30 dias (`teste_ativado`) e quando vira contrato (`contrato_fechado`, na contratação ou no 1º pagamento), a Nexor Central põe o evento numa fila e chama a Blue (`POST /api/conversao`). Configure `CONVERSAO_URL` e `CONVERSAO_TOKEN` na Central. A fila tenta de novo se a Blue estiver fora, e cada cliente gera no máximo um evento de cada tipo.
2. **Blue:** acha o lead pelo e-mail ou pelo telefone (em hash) e recupera a campanha, o `fbclid`/`fbc`/`fbp` e o `gclid`.
   - **Meta:** `StartTrial` e `Purchase`, com `value`/`currency` e `action_source: "system_generated"`.
   - **Google:** linha de conversão offline com `gclid`, nome da conversão (`GOOGLE_CONVERSAO_TESTE`, `GOOGLE_CONVERSAO_CONTRATO`) e valor, enviada para `LEAD_WEBHOOK_URL`, de onde se importa por planilha, n8n ou Zapier.
3. **Consentimento (LGPD):** saem só o e-mail e o telefone em hash e os valores. Sem consentimento de medição, ou sem lead encontrado, a conversão fica só registrada na Blue. Sem `gclid`, ela vai só ao Meta.
4. **Relatório:** `GET /api/relatorio?dias=30&investimento=barber: R$ 500; contabil: R$ 300` traz, por campanha, testes, contratos, receita, custo por teste e **CAC real** (investimento ÷ contratos). Em `conversao_offline`, traz o total, o CAC geral e as conversões que não acharam o lead (vindas de indicação ou de outro canal).
5. **Nas plataformas:** no Meta, use `Purchase` como evento de otimização por valor só quando houver volume. No Google, crie as conversões `TesteAtivado` e `Contrato` com origem "importação" (cliques), primeiro como secundárias. A janela do Google aceita cliques de até 90 dias, e o Meta aceita eventos de até 7 dias.

**Regra de otimização:** o Meta precisa de volume de eventos para sair da fase de aprendizado (a referência da própria plataforma é de cerca de 50 eventos por semana por conjunto de anúncios). Com verba pequena, otimize para **Lead** na Fase 0 e passe para **Lead quente** só quando a campanha somar pelo menos 15 a 20 quentes por semana. No Google, importe o lead quente e a contratação como conversões secundárias desde o primeiro dia e promova a principal quando houver 30 conversões em 30 dias.

---

## 3. Canais e verba por fase

### Papel de cada canal

| Canal | Para quê | Campanhas em que entra |
|---|---|---|
| **Google Search** (palavras exatas e de frase) | Capturar quem já procura a solução: a intenção de compra mais alta | Todas, com peso maior em `rh-ponto`, `contabil`, `ti` e `atende` |
| **Meta (Instagram e Facebook)** | Gerar demanda com a dor e a tela real; formulário instantâneo ou página | `barber`, `atende`, `rh-ponto`, `elo` e o remarketing de todas |
| **LinkedIn** | Atingir quem decide por cargo e setor | `contabil`, `agente`, `ti`, `rh-ponto` (cargo de RH) e `elo` (dono de distribuidora) |
| **Prospecção ativa** (e-mail, ligação, LinkedIn e visita) | Contas certas que não clicam em anúncio | `agente`, `elo`, `contabil`, `ti` |
| **Parceiros e indicação** | Venda com confiança emprestada e CAC baixo | `contabil` (contador revenda), `rh-ponto` (via contadores), `barber` (distribuidores de cosméticos), `elo` (representantes de fabricantes) |
| **Perfil da Empresa no Google** | Busca local "perto de mim" no Triângulo | `rh-ponto`, `barber`, umbrella |

### Verba mensal por fase (hipótese)

| Campanha | Fase 0: testes (2 a 3 semanas) | Fase 1: validação (meses 2 e 3) | Fase 2: escala (mês 4 em diante, só quem passar) |
|---|---:|---:|---:|
| `atende` | R$ 750 | R$ 2.000 | R$ 5.000 |
| `rh-ponto` | R$ 750 | R$ 2.000 | R$ 5.000 |
| `contabil` | R$ 750 | R$ 1.800 | R$ 3.500 |
| `barber` | R$ 450 | R$ 1.200 | R$ 3.000 |
| `agente` | R$ 750 | R$ 1.800 | R$ 4.000 |
| `elo` | R$ 450 | R$ 1.000 | R$ 2.000 |
| `ti` | R$ 600 | R$ 1.500 | R$ 3.500 |
| `nexor-qualquer-cenario` | R$ 600 | R$ 1.200 | R$ 2.500 |
| **Total por mês** | **R$ 5.100** (cerca de R$ 3.800 nas 3 semanas) | **R$ 12.500** | **até R$ 28.500** se todas passarem |

**Fase 0 (testes, 2 a 3 semanas, verba pequena):**
- **Objetivo:** descobrir oferta, criativo e público que geram lead quente, não volume.
- 3 anúncios por campanha (as variações de cada arquivo), 1 ou 2 públicos e uma página.
- Divisão sugerida da verba de cada campanha: 50% Google Search, 40% Meta e 10% remarketing. LinkedIn só com formulário nativo e verba de R$ 300 a R$ 500 nas campanhas em que ele entra.
- **Decisão no fim da Fase 0:** mantém as 2 melhores variações por campanha e desliga o resto.

**Fase 1 (validação, meses 2 e 3):**
- **Objetivo:** provar o custo por lead quente, a taxa de demonstração e as primeiras vendas.
- Verba da tabela. Entram os testes A/B da seção 9, um por vez.
- Começa a prospecção ativa com as listas de CNAE e as parcerias.

**Fase 2 (escala, do mês 4 em diante):**
- Só para quem bater os critérios da seção 4. Aumento de **no máximo 20% a 30% por semana** em cada conjunto (aumento brusco reinicia o aprendizado das plataformas).
- O modelo assume que o CPL piora 25% na escala.
- Entram os públicos semelhantes dos leads quentes e dos clientes.

**Leitura antecipada da projeção (cenário médio, detalhes no `PROJECAO.md`):** `atende`, `rh-ponto`, `contabil` e `elo` tendem a passar; `barber` fica no limite e depende de CPL baixo; `agente`, `ti` e a umbrella **não se pagam só com mídia paga**. Nesses três, a mídia fica pequena e focada (Search exato e remarketing), e o peso vai para a prospecção ativa, o LinkedIn e as parcerias.

---

## 4. Critérios de corte e de escala

Avalie **por campanha**, toda segunda-feira, com os dados dos últimos 14 dias (ou 30 dias quando houver menos de 10 leads quentes).

| Métrica | Escalar quando | Otimizar quando | Cortar ou pausar quando |
|---|---|---|---|
| **Custo por lead quente** | ≤ o "lead quente máximo" da campanha (tabela do `PROJECAO.md`) | Até 30% acima | > 50% acima por 2 semanas seguidas |
| **Taxa de quente** (quentes ÷ leads) | ≥ a hipótese da campanha | Entre 50% e 100% da hipótese | < 50% da hipótese com mais de 40 leads |
| **Taxa de reunião** (demonstrações ÷ quentes) | ≥ 45% | 25% a 45% | < 25% com mais de 15 quentes (o problema costuma ser velocidade de resposta, não a mídia) |
| **CAC contra LTV** | LTV/CAC ≥ 3 e payback ≤ 12 meses | LTV/CAC entre 2 e 3 | LTV/CAC < 2 depois de 3 vendas, ou nenhuma venda depois de 10 demonstrações |
| **Gasto sem lead** | | | Anúncio ou conjunto que gastou 2× o CPL alto sem nenhum lead: desliga |

**Fórmulas (iguais às do `projecao.json`):**
- CAC = mídia do período ÷ vendas do período + comissão do vendedor (50% da 1ª mensalidade + 5% da implantação).
- LTV = mensalidade × 75% de margem bruta × meses de retenção + implantação × 40% de margem.
- Payback = (CAC − margem da implantação) ÷ margem mensal.
- Lead quente máximo = (LTV ÷ 3 − comissão) × taxa de reunião × taxa de fechamento.

**Regra de ouro:** não julgue uma campanha pelo CPL. Lead barato que não fica quente é o mais caro. A decisão é sempre pelo **custo por lead quente** e, depois das primeiras vendas, pelo **LTV/CAC**.

---

## 5. Métricas e painel

| O que medir | Onde | Frequência | Quem olha |
|---|---|---|---|
| Gasto, impressões, cliques, CTR, CPC e CPL por anúncio | Meta Ads, Google Ads e LinkedIn Campaign Manager | Diário (5 minutos) | Quem opera a mídia |
| Leads, nota da Blue, quente, morno e frio por `utm_campaign` e `utm_content` | Relatório da Blue (`agent/src/relatorio.js`, agrupado por origem e campanha) e Central | Diário | Comercial |
| Tempo até o primeiro contato com o lead quente | Central (registro do contato) | Diário | Comercial |
| Demonstrações marcadas e feitas, testes ativados | Central (etiquetas e status do teste) | Semanal | Comercial |
| Vendas, fundadores, ticket, implantação e comissões | Central → Planos e preços, Parceiros e comissões | Semanal | Dono |
| CAC, LTV/CAC, payback e MRR por campanha | Planilha do painel alimentada pela Central e pelas plataformas (mesmas fórmulas do `projecao.json`) | Semanal (decisão) e mensal (fechamento) | Dono |
| Cancelamentos e motivo | Central | Mensal | Dono e sucesso do cliente |
| Uso do sistema durante o teste (o que mais prevê compra) | Painel de cada produto | No dia 3, no dia 15 e no dia 25 do teste | Responsável pelo cliente |

**Painel semanal (uma linha por campanha):** verba · leads · quentes · custo por lead quente · demonstrações · testes · vendas · CAC · LTV/CAC · decisão (escalar, otimizar ou cortar). Use os campos do `projecao.json` como colunas para que o simulador e o painel falem a mesma língua.

**Padrão de UTM (o mesmo em todos os arquivos):**

| Parâmetro | Valores |
|---|---|
| `utm_campaign` | `atende`, `rh-ponto`, `contabil`, `barber`, `agente`, `elo`, `ti`, `nexor-qualquer-cenario` (exatamente assim, em minúsculas) |
| `utm_source` | `meta`, `google`, `linkedin`, `instagram` (mensagem direta orgânica), `email`, `whatsapp`, `parceiro`, `indicacao`, `qrcode` |
| `utm_medium` | `paid_social`, `cpc`, `remarketing`, `outbound`, `referral`, `offline` |
| `utm_content` | Variação do anúncio: `a1`, `a2`, `a3`, `carrossel`, `story`; na abordagem ativa, `d0`, `d2`, `d7` |
| `utm_term` | No Google, `{keyword}` (parâmetro automático); no parceiro, o código do parceiro |

No Google Ads, ative a **marcação automática** (gclid) e use o modelo de acompanhamento `{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign=<id>&utm_content={creative}&utm_term={keyword}`.

---

## 6. Inteligência para chegar ao cliente certo

### 6.1 Públicos semelhantes (lookalike) a partir dos leads quentes
1. **Semente:** exporte da Central os leads com nota ≥ 70 e, à parte, os clientes pagantes, com e-mail e telefone (a plataforma faz o hash). Faça uma semente por produto quando houver volume; antes disso, uma semente única "quentes + clientes".
2. **Tamanho mínimo:** o Meta exige pelo menos 100 pessoas na semente e o LinkedIn, 300 contas ou contatos combinados (confira as regras atuais de cada plataforma). Até lá, use como semente **quem converteu no site** (pixel) e o público de quem conversou com a Blue.
3. **Público semelhante de 1% a 3% do Brasil** para produtos nacionais (`atende`, `contabil`, `barber`, `ti`) e "Minas Gerais + Goiás" para `rh-ponto` e `elo`.
4. **Exclua sempre** clientes ativos e quem já está em teste.
5. **LGPD:** só suba lista de quem deixou o contato com a Nexor, com a finalidade descrita na [política de privacidade](../../privacidade.html). Nunca suba lista comprada ou extraída.

### 6.2 Remarketing por página e por produto
| Público | Janela | Mensagem |
|---|---|---|
| Visitou a página do produto e não fez o pré-cadastro | 14 dias | A dor + "teste 30 dias" com outra variação de anúncio |
| Abriu a demonstração no navegador (`#testar-...`) | 30 dias | "Quer ver com os dados da sua empresa? O nosso time ativa o teste" |
| Conversou com a Blue e ficou morno | 30 dias | Prova (tela real, como funciona a implantação com gente) |
| Viu 50% do vídeo do produto | 30 dias | Oferta de fundador (onde houver) |
| Visitou a home e nenhuma página de produto | 14 dias | Carrossel "um sistema para cada cenário" (umbrella) |

Crie um público por página de `solucoes/` (a URL contém o nome do produto) e use o `utm_campaign` para não mostrar o produto errado a quem veio de outra campanha.

### 6.3 Segmentação por cargo, setor e CNAE
- **Cargo:** dono, sócio, diretor, gerente de RH, departamento pessoal, contador responsável, gerente de TI, coordenador de suporte e gerente comercial (o detalhe está em cada arquivo).
- **Setor:** use os setores de interesse no Meta só como ponto de partida; o melhor filtro é a **palavra-chave no Search** e o **cargo no LinkedIn**.
- **CNAE:** cada campanha traz os CNAEs-alvo. Confira cada código na [tabela da CONCLA/IBGE](https://concla.ibge.gov.br/busca-online-cnae.html) antes de filtrar.

### 6.4 Google Search com intenção de compra
- **Palavras exatas** (`[sistema de ponto eletrônico]`) e de frase (`"chatbot para whatsapp"`) com verba principal. Correspondência ampla só com lance por conversão e depois de 30 conversões.
- **Lista de negativas compartilhada** (vale para todas as campanhas): grátis para baixar, download, crack, apk, pirata, open source, código fonte, github, curso, apostila, pdf, tcc, monografia, o que é, significado, vaga, vagas, emprego, salário, estágio, concurso, como fazer, tutorial, modelo, planilha, excel, reclame aqui, login, entrar, 2ª via, telefone de outra empresa. As negativas próprias de cada produto estão nos arquivos.
- **Local:** produtos nacionais em todo o Brasil; `rh-ponto` e `elo` começam em um raio de 150 km de Araguari (Araguari, Uberlândia, Uberaba, Patos de Minas, Ituiutaba, Catalão) e abrem para o Brasil se o custo por lead quente estiver dentro da meta.
- **Extensões:** sitelink para o teste de 30 dias, para os fundadores (`/#fundadores`) e para o WhatsApp; frase de destaque "Implantação com o nosso time".

### 6.5 LinkedIn por cargo
- Formulário de geração de leads nativo (é mais barato que mandar para a página, segundo os benchmarks do `PROJECAO.md`), com 3 campos e uma pergunta de qualificação (por exemplo, "quantas empresas tem na carteira?").
- Segmentação: cargo + setor + porte (11 a 200 funcionários na maioria dos produtos) + localização. Público entre 20 mil e 80 mil pessoas.
- Em paralelo, o **perfil pessoal do fundador** publica 3 vezes por semana (os textos estão no `CANAIS.md`) e manda até 20 convites por dia para o ICP, com nota curta e sem anexar oferta no convite.

### 6.6 Prospecção ativa com as listas de CNAE da Receita (dados públicos)
1. Baixe o arquivo **Dados Abertos do CNPJ** da Receita Federal ([dados.gov.br](https://dados.gov.br/dados/conjuntos-dados/cadastro-nacional-da-pessoa-juridica---cnpj)). Ele é público e atualizado todo mês.
2. Filtre por: situação cadastral **ativa**, **CNAE principal** da campanha, **município** (a Receita usa um código próprio de município: use a tabela que vem no próprio arquivo) e porte.
3. Enriqueça só com fontes públicas da própria empresa (site, Google Maps, LinkedIn da empresa) e confirme se ela ainda funciona.
4. **Primeiro contato** por e-mail comercial, ligação para o telefone comercial ou LinkedIn. **Nunca** por WhatsApp sem opt-in (seção 7).
5. Registre na Central a origem ("Dados abertos da Receita + CNAE") e a data. Quem pedir para não receber sai da lista na hora.
6. **Cuidado:** o arquivo traz e-mail e telefone que, em empresário individual e MEI, costumam ser **dados pessoais**. Use só para oferta B2B ligada à atividade da empresa, com a base legal da seção 7.

### 6.7 Parcerias
| Parceiro | O que ele ganha | O que a Nexor ganha | Produtos |
|---|---|---|---|
| **Escritórios de contabilidade** | Parceiro revenda: 20% recorrente; o Nexor Contábil se paga com 3 ou 4 indicações | Acesso às carteiras de empregadores (ponto e RH) e de comércio (Atende) | `rh-ponto`, `contabil`, `atende`, `agente` |
| **Associação comercial de Araguari (ACIA)** e CDL | Benefício para associados (condição de associado no teste e palestra gratuita) | Palestra "IA com cuidado humano para o comércio", lista de presença com opt-in, selo de confiança local | Umbrella, `rh-ponto`, `atende` |
| **Sindicatos patronais e entidades** (comércio, contabilistas, delegacia regional do CRC-MG, Sebrae Minas) | Conteúdo para associados (eSocial, Portaria 671, LGPD) | Evento com inscrição (opt-in) e credibilidade | `rh-ponto`, `contabil` |
| **Distribuidores e representantes** (cosméticos para barbearias, fabricantes de segurança eletrônica e material elétrico) | Parceiro indicador: 10% enquanto o cliente estiver ativo | Visita conjunta e indicação quente | `barber`, `elo` |
| **Revendedores de TI e técnicos de informática** | Parceiro revenda ou estratégico (20% a 30%) | Venda do Service Desk, do Cofre e do IT Platform para a carteira deles | `ti` |

As regras de comissão estão em [`PLANOS-E-PRECOS.md`](../../comercial/PLANOS-E-PRECOS.md#5-comissões). Cada parceiro recebe o link do portal e um link com `utm_source=parceiro&utm_term=<codigo>`.

### 6.8 Indicação com comissão de parceiro
- Todo cliente novo vira **parceiro indicador** no dia 30 (10% enquanto o indicado estiver ativo). Peça a indicação junto com o depoimento.
- Use a peça `pecas/indicacao.png` e o link do portal do parceiro.
- Indicação entra como lead com nota inicial mais alta na Blue (confirme se a Blue já trata `utm_source=indicacao`).

### 6.9 WhatsApp só com opt-in
- **Pode:** responder quem chamou; falar com quem deixou o WhatsApp no pré-cadastro, no formulário do Meta ou do LinkedIn, ou com a Blue (o aviso de privacidade diz que a Nexor vai entrar em contato); enviar lista de transmissão a quem pediu novidades.
- **Não pode:** mandar mensagem fria para número tirado da lista da Receita, de diretório ou de grupo. Nesses casos, o primeiro contato é por e-mail, ligação ou LinkedIn, e o WhatsApp entra **depois** que a pessoa pedir ou autorizar.
- Toda mensagem ativa tem saída: "Se não quiser mais receber, responda SAIR." O pedido vale na hora.
- Na API oficial, mensagens iniciadas pela empresa fora da janela de 24 horas usam modelo aprovado pela Meta e exigem opt-in, pela política da própria Meta.

---

## 7. LGPD: como a campanha trata dados pessoais

| Situação | Base legal (LGPD, art. 7º) | Cuidados |
|---|---|---|
| Lead que preencheu formulário ou falou com a Blue | Procedimentos preliminares a contrato a pedido do titular (inciso V) e legítimo interesse (inciso IX) para o acompanhamento comercial | Aviso no formulário com link para a política de privacidade; finalidade clara ("contato sobre o teste e a proposta") |
| Prospecção ativa B2B com dados públicos de CNPJ | Legítimo interesse (inciso IX e art. 10), com teste de balanceamento registrado | Contato ligado à atividade da empresa, identificação clara de quem fala, saída fácil, registro da origem, exclusão quando não houver interesse |
| Públicos personalizados e semelhantes (lista de leads e clientes) | Legítimo interesse, com transparência na política de privacidade | Só a base própria, enviada com hash pela plataforma, e exclusão de quem pediu para sair |
| Pixel e cookies de marketing | Consentimento, quando o banner de cookies o exigir | Confira se o site carrega pixel só depois do aceite |
| Lista de transmissão e campanhas no WhatsApp | Consentimento (opt-in) | Registro da data e do canal do opt-in; descadastro imediato |

**Proibido nesta campanha:** comprar, alugar ou trocar lista de contatos; extrair contatos de grupos ou de redes sociais com robô; usar dados de cliente de um produto (por exemplo, a carteira de clientes de um escritório que usa o Contábil) para vender outro produto; guardar lead sem interesse por mais de 12 meses sem novo contato.

**Direitos do titular:** pedidos de acesso, correção ou exclusão vão para contato@nexorconsultingit.com.br e são atendidos em até 15 dias. A política de implantação está em [`POLITICA-IMPLANTACAO-LGPD.md`](../../POLITICA-IMPLANTACAO-LGPD.md).

---

## 8. Regras de comunicação nas peças
- **Sem preço de plano** nas artes e nos anúncios (regra do `CANAIS.md`). Fale em "teste grátis de 30 dias", "diagnóstico gratuito" e "vagas de fundador". As condições de fundador (40% por 12 meses, 50% na implantação, 24 meses de preço travado, 10 vagas) são públicas e podem aparecer.
- **Sem números de resultado de cliente** que não possamos provar. As telas são reais, com empresas fictícias: diga isso quando perguntarem.
- **Sempre com gente:** toda peça lembra que existe uma pessoa da Nexor responsável pelo cliente.
- **Fundador só existe** em Contábil, Barber, Agente (10 vagas cada) e Elo (10 vagas para fornecedores). Não ofereça fundador em Atende, RH ou TI.

---

## 9. Plano de testes A/B (antes de aplicar a verba toda)

**Regras:**
1. Uma variável por vez, por campanha. O resto fica igual.
2. Divisão de verba 50/50, mesmo público, mesmo período (use o teste A/B nativo do Meta e os experimentos do Google Ads).
3. **Tamanho mínimo para decidir:**
   - CTR do anúncio: 3.000 impressões e 60 cliques por variação;
   - CPL: 20 leads por variação, ou gasto de 2× o CPL médio sem lead (que já elimina a variação);
   - taxa de quente: 30 leads por variação;
   - taxa de demonstração ou de fechamento: não dá para testar com essa verba no curto prazo. Acompanhe, mas não decida o teste por elas.
4. **Só declare vencedor** com diferença de pelo menos 30% e o mínimo acima. Com menos que isso, fica a variação mais barata de produzir e o teste segue.
5. Duração máxima: 14 dias por teste. Registre hipótese, resultado e decisão em uma linha no painel.

**Ordem e hipóteses:**

| # | Variável | A | B | Hipótese | Métrica de decisão | Campanhas |
|---|---|---|---|---|---|---|
| 1 | **Oferta** | "Teste grátis de 30 dias" | "Vaga de fundador: 40% por 12 meses" | Nos produtos com fundador, a escassez gera mais lead quente, ainda que com CPL maior | Custo por lead quente | `contabil`, `barber`, `agente`, `elo` |
| 1b | **Oferta** | "Teste grátis de 30 dias" | "Diagnóstico gratuito de 30 minutos" | O diagnóstico atrai menos gente, mas mais decisores | Taxa de quente | `atende`, `rh-ponto`, `ti`, umbrella |
| 2 | **Criativo** | Dor com pergunta ("23h e o cliente perguntou o preço. Quem responde?") | Tela real do sistema com a solução | A dor gera CTR maior; a tela gera lead mais quente | CTR e depois taxa de quente | Todas |
| 3 | **Criativo** | Arte estática (`camp-*.png`) | Vídeo curto de 15 a 30 s da demonstração | O vídeo reduz o CPL no Meta e cria o público de remarketing de quem assistiu | CPL e custo por lead quente | `atende`, `barber`, `rh-ponto` |
| 4 | **Público** | Interesses e cargo | Público semelhante de leads e clientes | O semelhante vence depois de 100 pessoas na semente | Custo por lead quente | Todas na Fase 2 |
| 5 | **Público** | Triângulo (raio de 150 km) | Brasil | A região converte melhor na demonstração presencial, e o Brasil tem CPL menor | Custo por lead quente e taxa de reunião | `rh-ponto`, `elo`, `contabil` |
| 6 | **Página** | Página do produto (`/solucoes/...`) | Formulário instantâneo (Meta ou LinkedIn) | O formulário dá mais volume e menos qualidade | Custo por lead quente | Todas |
| 7 | **Página** | Botão "Testar grátis" | Botão "Falar com a Blue" | A conversa com a Blue qualifica melhor e aumenta a taxa de quente | Taxa de quente | Todas |

**Calendário:** semanas 1 a 3 (Fase 0) com os testes 2 e 6; semanas 4 a 7 com os testes 1 e 1b; semanas 8 a 12 com os testes 3, 5 e 7; Fase 2 com o teste 4.

---

## 10. Rotina da equipe

| Quando | O quê |
|---|---|
| Todo dia, 9h e 14h | Conferir leads quentes do dia, os que estão sem contato e o gasto das campanhas |
| Toda segunda-feira | Reunião de 30 minutos: painel semanal, decisão por campanha (escalar, otimizar ou cortar) e próximo teste A/B |
| Toda sexta-feira | Revisar os testes em andamento (dia 3, dia 15 e dia 25) e as propostas de fundador abertas |
| Fim de cada mês | Atualizar o `projecao.json` com os números reais e recalcular CAC, LTV/CAC e MRR |
| Dia 30 de cada cliente | Depoimento, estudo de caso (fundador) e pedido de indicação |
