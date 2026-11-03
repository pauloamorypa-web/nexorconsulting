# Nexor Contábil

**Para escritórios de contabilidade e contadores autônomos.**
Frase do produto: *O escritório no piloto automático. O contador no papel de consultor.*

Status: **em breve** (prévia publicada no site, seção Em breve). Este documento é a especificação de produto: dores, concorrência, módulos, diferenciais, preço, parceria e plano de lançamento.

---

## 1. As dores do mercado (pesquisa 2026)

| Dor | O que a pesquisa mostra |
|---|---|
| **Retrabalho manual** | É a dor nº 1 dos escritórios (34%). Em seguida vêm a falta de tempo para análise e consultoria (20%), a dificuldade de integrar sistemas e dados (17%) e os erros humanos em tarefas repetitivas (15%). Fonte: pesquisa Robolabs 2026. |
| **Gestão antes da tecnologia** | Pesquisa Connectabil + RDD com 644 escritórios: falta de tempo e processos internos não documentados são as barreiras mais citadas. |
| **Cobrar documentos pelo WhatsApp** | Apontada como a tarefa que mais consome tempo sem gerar valor. Arquivos se perdem em conversas e grupos, o cliente esquece documentos e o retrabalho raramente é cobrado. |
| **Documentos em celular pessoal** | Risco de LGPD e de sigilo profissional: documentos circulando em grupos e aparelhos particulares. |
| **Conciliação bancária** | Consome boa parte do tempo do setor contábil e fica mais sensível na transição da reforma. |
| **Reforma tributária (IBS e CBS)** | Convivência de dois sistemas de 2026 a 2032. Mais de 60% dos contadores se dizem despreparados (número divulgado por fornecedores, sem origem confirmada). Em 2027, as empresas do Simples escolhem se recolhem IBS e CBS dentro ou fora do Simples: é uma decisão consultiva por cliente. |
| **Honorário defasado e cliente que não dá lucro** | Sem medir horas por cliente, o escritório não sabe quem dá prejuízo nem tem argumento para reajuste. |
| **Comunicação com o cliente** | O cliente percebe falhas de comunicação e controles paralelos, o que afeta a valorização do escritório. |
| **IA** | 58% dos profissionais acreditam que a IA aumentará o valor estratégico do contador (CFC, Fenacon e IOB). |

## 2. Concorrência: forças e fraquezas

| Grupo | Exemplos | Forças | Fraquezas (a oportunidade da Nexor) |
|---|---|---|---|
| **Sistemas contábeis completos** | Domínio (Thomson Reuters), Alterdata, Questor, Fortes, SCI, Contmatic, Calima | Fiscal, folha e contábil integrados; maduros; base instalada enorme | Interface antiga; relatos de suporte lento e instabilidade; pouca IA de verdade; nada de WhatsApp nativo; cobram de R$ 90 a R$ 300 por usuário |
| **Gestão de processos e tarefas** | Gestta, Acessórias, e-Kontroll, Tareffa (Questor) | Controle de obrigações, prazos e entregas | Não leem nem entendem documentos; a cobrança ainda depende de regras manuais; pouco foco em rentabilidade e consultoria |
| **Captura de documentos fiscais** | Qive e similares | Busca automática de XML na SEFAZ | Resolvem só um pedaço; não falam com o cliente |
| **Atendimento no WhatsApp** | Digisac, SocialHub, chatbots genéricos | Centralizam o WhatsApp do escritório | Não entendem contabilidade, não arquivam por competência, não integram ao sistema contábil |
| **Contabilidade online** | Contabilizei, Agilize | Preço baixo e experiência digital para o cliente | São **concorrentes** do escritório, não ferramentas para ele |

**Conclusão:** hoje o escritório precisa de 4 ou 5 ferramentas que não conversam entre si, e nenhuma usa IA para ler documentos, conversar com o cliente **e** medir a rentabilidade. Esse é o espaço do Nexor Contábil.

## 3. Proposta e posicionamento

**Não competimos com o Domínio. Fazemos o Domínio render o dobro.**

O Nexor Contábil é a **camada de inteligência e atendimento** que fica entre o cliente do escritório e o sistema contábil que ele já usa. O escritório não troca de sistema e não migra a contabilidade, então a resistência de compra é baixa. Ele ganha:

1. **Cliente atendido pela IA no WhatsApp, com a marca do escritório**, de dia e de noite.
2. **Documentos cobrados, recebidos, lidos, conferidos e arquivados** sem ninguém da equipe tocar.
3. **Pré-lançamentos e conciliação** prontos para importar no sistema contábil.
4. **Gestão do escritório com números**: rentabilidade, retrabalho, honorário e reajuste.
5. **Nova receita**: consultoria de reforma tributária, relatórios gerenciais e revenda de soluções Nexor para a carteira.

## 4. Módulos

### 4.1 Assistente do escritório no WhatsApp
Construído sobre o Nexor Atende IA, com a marca, o nome e o número do escritório.
- **Recebe** fotos e PDFs, identifica o tipo (nota, extrato, recibo, boleto, contrato, folha), o cliente e a competência, e arquiva sozinho.
- **Responde dúvidas frequentes** com os dados do próprio cliente: "quanto vai dar meu imposto?", "quando vence?", "minha certidão está em dia?". Valores e guias só depois da conferência do contador.
- **Entrega** guias, holerites e relatórios, lembra o vencimento e confirma o pagamento.
- Passa para a pessoa certa da equipe (fiscal, DP, contábil) com o histórico, nos assuntos de interpretação ou decisão.

### 4.2 Cobrança inteligente de documentos
- Lista de documentos esperados por cliente, regime e competência, que aprende com o histórico. Exemplo: "esse cliente sempre tem extrato do Sicoob e do Itaú".
- Régua de cobrança personalizada, por WhatsApp e e-mail, em tom humano.
- Painel do que falta, por cliente e por departamento.
- **Registro de atraso e retrabalho** do cliente, que vira argumento para cobrança extra (módulo 4.8).

### 4.3 Leitura de documentos e pré-lançamento com IA
Construído sobre o Nexor Documentos IA.
- Leitura de notas, extratos (OFX, PDF e foto), recibos, boletos e comprovantes.
- Conferência de valores, CNPJ e duplicidades.
- **Classificação contábil sugerida, que aprende** com as correções do contador.
- **Conciliação bancária sugerida** entre o extrato, as notas e os pagamentos.
- **Exportação nos layouts de importação** dos sistemas contábeis: Domínio, Alterdata, Questor, Fortes e outros. A compatibilidade de cada layout é validada no projeto.

### 4.4 Captura automática fiscal
Com o certificado digital do cliente, guardado no cofre do escritório.
- Busca de XML de NF-e, CT-e e NFS-e e manifestação do destinatário.
- Monitor de **certidões negativas** com alerta de vencimento.
- Monitor das **caixas postais** do e-CAC e dos domicílios eletrônicos estaduais, com resumo das mensagens pela IA.
- Acesso por **procuração eletrônica** e com o consentimento do cliente.

### 4.5 Central de obrigações e prazos
- Calendário de obrigações por cliente, regime e município, com responsável e prazo interno.
- Tarefas por departamento, prazo de execução (SLA) e painel da sócia ou do sócio.
- Alertas: MEI perto do limite de faturamento, mudança de regime, obrigação nova.
- **Procedimentos documentados** por tarefa, que atacam a dor de "processos não documentados" e facilitam treinar gente nova.

### 4.6 Reforma tributária (IBS e CBS), de 2026 a 2033
- **Simulador por cliente**: IBS e CBS dentro ou fora do Simples (opção de 2027), considerando quantos clientes empresariais aproveitariam o crédito.
- Relatório de impacto pronto para enviar ao cliente, com a marca do escritório.
- Painel da carteira com quem é mais impactado.
- **Transforma a reforma em consultoria vendida**, em vez de trabalho sem cobrança.
- As regras são atualizadas a cada regulamentação. O simulador é uma estimativa e sempre passa pela revisão do contador.

### 4.7 Portal e app do cliente, com a marca do escritório
- Documentos, guias, holerites, certidões, relatórios e pedidos de serviço num só lugar.
- Envio de documentos por arrastar e soltar, como alternativa ao WhatsApp.
- Abertura de chamados, como pedidos de alteração contratual, admissões e declarações.

### 4.8 Gestão do escritório e honorários
- **Rentabilidade por cliente**: horas da equipe (medidas automaticamente pelas tarefas e documentos) contra o honorário.
- Honorários por Pix e boleto com régua de cobrança (Nexor Cobra IA), 13º honorário e reajuste anual.
- **Serviços extras e retrabalho** cobrados conforme o contrato, com proposta sugerida pela IA.
- **Calculadora de honorários** por regime, número de notas, funcionários e complexidade, para propostas novas.

### 4.9 Relatórios gerenciais com IA (consultoria escalável)
- Relatório mensal automático para cada cliente: resultado do mês, fluxo de caixa, indicadores e alertas, com comentários claros escritos pela IA e revisados pelo contador.
- O escritório vende isso como **plano premium** e aumenta o honorário médio.

### 4.10 Comercial do escritório
- Site e assistente para captar clientes (Nexor Site Pro + Blue).
- Proposta automática com a calculadora de honorários.
- **Entrada de cliente novo**: contrato digital, lista de documentos, procurações e dados cadastrais coletados pelo WhatsApp.

### 4.11 Departamento pessoal integrado
Construído sobre o Nexor RH.
- Os clientes do escritório usam ponto pelo celular, e o escritório recebe as marcações prontas para a folha.
- Folha, férias, rescisão e eSocial no Nexor RH, ou exportação para o sistema de folha que o escritório já usa.

### 4.12 Segurança, sigilo e LGPD
- **Instalado no servidor ou na nuvem do escritório.** A Nexor não guarda os dados dos clientes do escritório.
- Certificados digitais dos clientes no **Nexor Cofre**, com permissão por pessoa e registro de cada uso.
- Perfis por departamento, login em dois fatores e trilha de auditoria.
- **Documentos fora de celulares pessoais e grupos.**
- Apoio ao sigilo profissional previsto no Código de Ética do contador e à LGPD (o escritório é o controlador e a Nexor, operadora no suporte).

## 5. Diferenciais (o que ninguém junta hoje)
1. **Uma IA que conversa com o cliente, lê o documento e prepara o lançamento**, do WhatsApp ao sistema contábil.
2. **Funciona com o sistema que o escritório já tem**, sem migração.
3. **Com a marca do escritório**: o cliente vê o escritório, não a Nexor.
4. **Rentabilidade por cliente e cobrança de retrabalho com dados.**
5. **Reforma tributária como produto de consultoria.**
6. **Dados no servidor do escritório.**
7. **O escritório ganha dinheiro revendendo Nexor** (seção 7).

## 6. Preço sugerido

O mercado cobra de R$ 90 a R$ 300 por usuário em sistemas contábeis completos. O Nexor Contábil cobra **por porte da carteira**, não por usuário, para não penalizar o escritório que cresce a equipe.

| Plano | Carteira | Implantação | Mensalidade |
|---|---|---|---|
| **Autônomo** | até 40 empresas | R$ 1.500 | **R$ 397** |
| **Escritório** | até 150 empresas | R$ 3.000 | **R$ 997** |
| **Profissional** | até 400 empresas | R$ 6.000 | **R$ 1.997** |
| **Rede** | acima de 400 empresas ou várias unidades | sob consulta | sob consulta |

- **Pago à parte, direto pelo escritório:** consumo de IA (Anthropic), mensagens pagas da Meta e nuvem. A proposta traz uma estimativa por empresa da carteira.
- **Módulos extras:** Departamento pessoal com Nexor RH, cobrado por colaborador conforme a tabela do Nexor RH. Integração com sistema contábil fora da lista padrão, de R$ 2.000 a R$ 5.000.
- **Escritórios fundadores (primeiros 20):** 30% de desconto nos 12 primeiros meses, em troca de participar dos testes, dar depoimento e autorizar um estudo de caso.
- **Garantia de resultado:** se em 90 dias o escritório não economizar pelo menos o valor da mensalidade em horas de equipe (medidas pelo próprio sistema), a mensalidade do 4º mês é gratuita.

## 7. Escritório parceiro (revenda para a carteira)
Cada escritório tem dezenas de empresas clientes que precisam de ponto, atendimento no WhatsApp, cobrança, site e sistema. O escritório indica ou revende Nexor para a carteira e ganha **20% da mensalidade enquanto o cliente estiver ativo** (tabela de parceiros Nexor).
- Para o escritório, é receita recorrente nova e cliente mais preso, porque os dados ficam integrados.
- Para a Nexor, cada escritório vira um canal de vendas com dezenas de empresas.
- **O Nexor Contábil pode se pagar com 3 ou 4 indicações.**

## 8. Plano de lançamento

| Fase | Prazo | Entrega |
|---|---|---|
| **MVP** | 0 a 3 meses | Assistente no WhatsApp com a marca do escritório (4.1), cobrança de documentos (4.2), arquivamento por cliente e competência, leitura de notas e extratos (4.3), exportação para 1 sistema contábil (o mais usado pelos fundadores) e painel do escritório |
| **V1** | 3 a 6 meses | Conciliação sugerida, captura de XML e certidões (4.4), central de obrigações (4.5), portal do cliente (4.7), honorários e rentabilidade (4.8) |
| **V2** | 6 a 12 meses | Simulador da reforma tributária (4.6), relatórios gerenciais com IA (4.9), comercial (4.10), departamento pessoal (4.11), mais layouts de sistemas contábeis |

**Validação antes de construir tudo:** recrutar de 5 a 10 escritórios fundadores em Uberlândia e região, entrevistar sobre as dores, acompanhar uma competência de fechamento e medir as horas gastas com cobrança e organização de documentos. Esse número vira o argumento de venda.

## 9. Métricas de sucesso
- Horas poupadas por escritório por mês (meta: mais de 60 horas no plano Escritório).
- Percentual de documentos recebidos sem intervenção da equipe (meta: mais de 80%).
- Dias de atraso no fechamento da competência.
- Honorário médio por cliente antes e depois (relatórios premium e cobrança de retrabalho).
- Indicações de soluções Nexor feitas pela carteira do escritório.

## 10. Cuidados obrigatórios
- **A IA prepara, o contador decide.** Toda guia, valor e lançamento passa pela conferência do contador antes de chegar ao cliente. Isso protege a responsabilidade técnica do profissional.
- **Certificados digitais e procurações:** guarda em cofre, uso registrado, autorização expressa do cliente e contrato prevendo a custódia.
- **LGPD:** acordo de tratamento de dados entre a Nexor e o escritório, e modelo de cláusula para o escritório usar com os clientes dele.
- **Integrações com sistemas de terceiros:** usar os layouts oficiais de importação e as APIs públicas. Não acessar bancos de dados de sistemas de terceiros sem autorização do fornecedor e do escritório.
- **Reforma tributária:** o simulador é uma estimativa, com a data da regra usada e o aviso de que a decisão é do contador.

---

### Fontes da pesquisa
- Robolabs, IA na contabilidade (pesquisa 2026): https://blog.robolabs.com.br/inteligencia-artificial-na-contabilidade-8-fatos-pesquisa-2026/
- Escola Exchange, benchmark dos desafios do setor contábil (cita a pesquisa Connectabil + RDD): https://escolaexchange.com.br/benchmark-desafios-do-setor-contabil/
- CFC, pesquisa sobre IA na rotina contábil: https://cfc.org.br/noticias/pesquisa-mostra-avanco-da-inteligencia-artificial-na-rotina-dos-profissionais-da-contabilidade/
- Ledware, erros dos escritórios com o novo modelo tributário: https://www.ledware.com.br/2026/02/21/erros-que-os-escritorios-contabeis-nao-poderao-cometer-em-2026-com-o-novo-modelo-tributario/
- Ledware, portal do cliente e cobrança de documentos: https://www.ledware.com.br/2026/08/09/portal-do-cliente-contabil-documentos/
- Contábeis, tarefa que rouba produtividade: https://www.contabeis.com.br/noticias/70772/essa-tarefa-contabil-parece-inofensiva-mas-rouba-tempo-e-produtividade-do-seu-dia/
- Site Contábil, cobrança de retrabalho: https://sitecontabil.com.br/noticias_empresariais/ler/descubra-se-retrabalho-nos-escritorios-contabeis-deve-ser-cobrado-de-clientes-e-como-fazer-isso
- Pasta Contábil, sistemas para escritório 2026: https://pastacontabil.com.br/blog/melhores-sistemas-escritorio-contabilidade-2026
- Robolabs, top sistemas contábeis: https://blog.robolabs.com.br/top-5-sistemas-contabeis-para-contadores-no-brasil-2025/
- Keevo, novo perfil do cliente contábil 2026: https://keevo.com.br/blog-ec/novo-perfil-cliente-contabil-2026/
- Domínio Sistemas, desafios das empresas de contabilidade: https://www.dominiosistemas.com.br/blog/top-7-desafios-das-empresas-de-contabilidade/
