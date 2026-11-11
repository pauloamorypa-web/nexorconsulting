# Blue — assistente de IA da Nexor Consulting

A Blue é a assistente de atendimento e vendas da Nexor. Ela responde clientes no **chat do site** e no **WhatsApp**, usando o Claude (Anthropic). O mesmo servidor recebe os **leads do site** (pré-cadastro do teste grátis, calculadora, formulários abandonados) e faz a IA do **teste grátis do Nexor Atende IA**.

O que ele faz:

- Entende a necessidade do cliente e explica a solução da Nexor que resolve (Atende IA, RH + Ponto, Contábil, Barber, Agente, Elo, soluções de TI, Commerce, Gestão, Site Pro, Automação, Sob Medida).
- Reconhece a **campanha** de onde a pessoa veio, abre a conversa no contexto certo, qualifica com poucas perguntas e dá uma **nota de 0 a 100** explicável (ver "Campanhas de captação").
- Registra o lead e avisa a equipe.
- Mostra horários livres e **agenda o diagnóstico gratuito**.
- Calcula uma **estimativa de retorno** da automação com IA.
- **Passa para uma pessoa** quando o cliente pede ou quando o assunto pede, e fica em silêncio nessa conversa por 12 horas.

Regras importantes estão em `src/conhecimento.js`: não inventa preços, prazos nem casos de clientes; pede só os dados necessários.

## Como funciona

```
Site (leads) ──POST /api/lead──────────┐
Site (chat)  ──POST /api/chat──────────┤
                                       ├─► servidor.js ─► agente.js ─► Claude
WhatsApp ──POST /webhook/whatsapp──────┘                      │
                                                              └─► ferramentas.js
                                                                   ├─ registrar_lead
                                                                   ├─ ver_horarios_diagnostico
                                                                   ├─ agendar_diagnostico
                                                                   ├─ estimar_retorno
                                                                   ├─ qualificar_lead
                                                                   └─ transferir_para_humano
```

| Arquivo | Para que serve |
| --- | --- |
| `src/campanhas.js` | Registro das campanhas (ICP, abertura, perguntas, sinais, preço de referência, cadência) e detecção da campanha. |
| `src/qualificacao.js` | Nota do lead (0 a 100) com os motivos, filtros anti-curioso e indicação de produto. |
| `src/cadencia.js` | Cadência sugerida para os mornos (D+0, D+2, D+7). |
| `src/conhecimento.js` | Quem é a Nexor, tom de voz e regras do atendimento. Edite aqui para mudar o comportamento. |
| `src/ferramentas.js` | Ações que o agente pode executar, com validação das entradas. |
| `src/agente.js` | Ciclo com o Claude, histórico das conversas, limite de mensagens. |
| `src/servidor.js` | Endpoints HTTP do site (chat, leads, modo de teste) e do WhatsApp. |
| `src/whatsapp.js` | Assinatura do webhook, leitura e envio de mensagens na WhatsApp Cloud API. |
| `src/config.js` | Configurações lidas das variáveis de ambiente. |

Leads ficam em `data/leads.jsonl` e agendamentos em `data/agendamentos.json`. Cada lead, agendamento e transferência também é enviado para a equipe no WhatsApp (`TEAM_WHATSAPP`) e, se configurado, para `LEAD_WEBHOOK_URL` (planilha, CRM, n8n, Make, Zapier).

## Leads do site (`POST /api/lead`)

O site envia leads em vários momentos, sempre com a pontuação de engajamento do visitante (tempo no site, seções vistas, uso da calculadora, testes abertos):

| Tipo | Quando | Avisa a equipe? |
| --- | --- | --- |
| `teste` | Pré-cadastro de um teste grátis de 12 h | Sim |
| `interesse` | Clicou em "Quero implantar" durante o teste | Sim |
| `calculadora` | Pediu o estudo de retorno | Sim |
| `blue` | A Blue coletou os dados na conversa | Sim |
| `saida` | Deixou o contato na oferta antes de sair do site | Sim |
| `parcial` | Digitou nome e WhatsApp/e-mail num formulário e não enviou | Só se a pontuação for 8 ou mais (lead quente) |

Todos ficam em `data/leads.jsonl` e vão para `LEAD_WEBHOOK_URL`, se configurado.

Cada lead chega com:

- **Temperatura** (`quente`, `morno`, `frio`), calculada pelo servidor a partir do tipo e do engajamento. Quente = pronto para vendas.
- **Origem**: `utm_source`, `utm_medium`, `utm_campaign`, `gclid`, `fbclid`... O aviso para a equipe mostra de qual campanha o lead veio.

## Campanhas: Meta e relatório com IA

- **API de Conversões da Meta**: com `META_PIXEL_ID` e `META_CAPI_TOKEN`, cada lead (menos os parciais) vai para a Meta como `Lead`, e os quentes também como `LeadQuente`, com telefone e e-mail em hash SHA-256. Assim a campanha aprende a buscar pessoas parecidas com quem virou lead quente. O `event_id` é o mesmo do Pixel do site, então a Meta não conta duas vezes.
- **Relatório**: `GET /api/relatorio?dias=7` com `Authorization: Bearer <REPORT_TOKEN>` devolve os leads por campanha e a taxa de leads quentes. Com `&analise=1`, o Claude escreve o que escalar, o que pausar e o que testar. Opcional: `&investimento=meta/teste12h: R$ 350; google/erp: R$ 280` para ele considerar o custo.

## Campanhas de captação

Cada campanha fica em `src/campanhas.js`: id e apelidos de `utm_campaign`, produto, público (ICP), abertura da Blue, 3 ou 4 perguntas de qualificação, sinais de compra e de descarte, preço de referência (de `comercial/PLANOS-E-PRECOS.md` e `comercial/ELO-PRECOS.md`) e textos da cadência.

| id | Produto | Exemplos de `utm_campaign` |
| --- | --- | --- |
| `atende-ia` | Nexor Atende IA | `atende-ia`, `teste12h`, `whatsapp-ia` |
| `rh-ponto` | Nexor RH + Ponto | `rh-ponto`, `ponto-eletronico`, `rh` |
| `contabil` | Nexor Contábil | `contabil`, `contador`, `google-contabil-fundadores` |
| `barber` | Nexor Barber | `barber`, `barbearia`, `meta-barber-teste30d` |
| `agente` | Nexor Agente | `nexor-agente`, `agente`, `ia-pessoal` |
| `elo` | Nexor Elo | `elo`, `elo-instaladores`, `fornecedores` |
| `ti` | Service Desk, Cofre, IT Platform | `ti`, `service-desk`, `cofre`, `it-platform`, `inventario` |
| `qualquer-cenario` | Diagnóstico (indica o produto certo) | `nexor-atende-qualquer-cenario`, `institucional`, `marca` |

O apelido vale como palavra inteira dentro da UTM: `meta-barber-teste30d` cai em `barber`; `retirada` não cai em `ti`.

**Detecção** (nessa ordem): `utm_campaign`, `utm_content`, `utm_source`, anúncio de clique para o WhatsApp (título e texto do anúncio que a Meta manda no webhook), página do site (`/solucoes/sistema-para-barbearia/`...) e texto da mensagem ("Quero o teste do Nexor Barber"). Sem nenhuma pista, a conversa vai para `qualquer-cenario`, que faz o diagnóstico; se depois aparecer uma pista, a campanha muda uma vez. O chat do site manda as UTMs guardadas por `assets/js/rastreio.js` (`origem`) e o consentimento de cookies (`consentimento`) em cada mensagem.

**Nota do lead (0 a 100).** A Blue preenche os sinais com a ferramenta `qualificar_lead`; a nota sai do código, sempre com a mesma regra e com o motivo de cada ponto:

| Bloco | Critério | Pontos |
| --- | --- | --- |
| Fit com o ICP (até 40) | segmento ou CNAE do ICP (fora do foco: 5) | 15 |
| | porte ideal / dentro do ICP (abaixo do mínimo: 0) | 10 / 6 |
| | cargo de decisor (influenciador: 4) | 10 |
| | Triângulo Mineiro e Alto Paranaíba / resto de MG / outra região | 5 / 3 / 1 |
| Intenção (até 30) | dor declarada | 12 |
| | urgência alta / média | 10 / 5 |
| | tem orçamento | 8 |
| Engajamento (até 30) | cada pergunta da campanha respondida (até 9) | 3 |
| | pediu demonstração, teste ou diagnóstico | 10 |
| | pediu preço · deixou WhatsApp · deixou e-mail | 4 · 4 · 3 |

- **Quente (70 ou mais):** a equipe recebe na hora o aviso no WhatsApp (`TEAM_WHATSAPP`) e em `LEAD_WEBHOOK_URL`, com a nota e os motivos. A Blue oferece a demonstração.
- **Morno (40 a 69):** entra na cadência.
- **Frio (menos de 40):** recebe conteúdo; o relatório guarda o motivo (`concorrente`, `estudante`, `pessoa_fisica`, `fora_do_icp`, `pouca_informacao`).
- **Filtros anti-curioso:** concorrente (nota até 10), estudante (até 15) e pessoa física sem empresa em produto B2B (até 25). Profissional autônomo (barbeiro, contador, instalador) não conta como pessoa física. Quem **só quer preço** e não tem nota de morno vira morno (40) com o material de preços: nunca é descartado de forma grosseira.
- Na campanha `qualquer-cenario` (e quando o segmento não combina com a campanha), a nota usa o ICP do produto indicado, que aparece em `produto_indicado`.

**Conversões (Meta e Google), com valor proporcional à nota:** `Lead` (uma vez, quando já há contato e alguma qualificação; valor 3 × nota), `LeadQualificado` (quando fica quente; 3 × nota) e `AgendouDemo` (quando a Blue agenda; 4 × nota). Concorrente, estudante e pessoa física não geram evento. Vai só o necessário: telefone e e-mail em hash SHA-256, nota, classe, campanha e produto; nada do texto da conversa.
- Site: só com o consentimento de medição do aviso de cookies.
- WhatsApp: só para conversas que vieram de anúncio de clique para o WhatsApp (`ctwa_clid`) e com `META_CAPI_WHATSAPP=1` (desligado por padrão; preveja na política de privacidade antes de ligar).
- Google Ads: o servidor não chama a API do Google. Com `gclid` e consentimento, ele manda a linha de conversão offline para `LEAD_WEBHOOK_URL` (`tipo: "conversao_google"`), para importar por planilha, n8n ou Zapier.
- Os leads dos formulários do site continuam com os eventos de antes (`Lead` e `LeadQuente`, com o mesmo `event_id` do Pixel).

**Relatório por campanha:** `GET /api/relatorio?dias=7` agora traz também `porCampanha`: leads, quentes, mornos, frios, % de quentes, nota média, demonstrações agendadas, motivos de descarte, produtos indicados, tempo até a primeira resposta da Blue, tempo até o primeiro contato da equipe e quentes ainda sem contato. Com `&investimento=barber: R$ 350; meta/teste12h: R$ 280`, calcula o custo por lead e o **custo por lead quente**. A equipe registra o primeiro contato com `POST /api/contato` (`{"telefone": "..."}`, `{"lead": "..."}` ou `{"conversa": "..."}`, com o mesmo `REPORT_TOKEN`).

**Cadência dos mornos:** `&cadencia=1` no relatório devolve, para cada morno, a mensagem do dia (D+0, D+2 ou D+7) por WhatsApp e por e-mail, com o texto do produto. É só uma sugestão para a equipe: **nada é enviado automaticamente**. Sem opt-in (a pessoa aceitar receber o material na conversa), a sugestão é só pedir permissão.

**Preços na conversa:** a Blue continua sem citar preço. Com `CAMPANHA_MOSTRAR_PRECO=1`, ela pode citar só o preço de entrada do produto da campanha. A cadência sugerida à equipe traz o preço de referência quando a pessoa pediu preço (a tabela comercial ainda está em validação: confira antes de enviar).

### Testar as campanhas

- `test/personas/*.json`: 32 personas fictícias, 4 por campanha (quentes, mornos, frios e curiosos).
- `npm test` roda cada conversa pela Blue com o modelo simulado (`simulacao/modelo-simulado.js`, no mesmo padrão do cliente falso dos testes) e confere campanha, nota, classe, descarte, motivos, aviso à equipe e eventos.
- `npm run simular-campanhas` imprime a matriz de acerto (classe esperada × classe dada) e o acerto da campanha. Com `ANTHROPIC_API_KEY` no ambiente, usa o Claude de verdade (custa créditos); `--simulado` força o simulado e `--detalhes` mostra a nota e os motivos de cada persona.

## Modo de teste do Atende IA

No teste grátis, o visitante descreve a empresa dele e conversa com o "atendente virtual" dela. O site chama `/api/chat` com `modo: "demo"`; o servidor usa as instruções de `INSTRUCOES_DEMO` (em `src/conhecimento.js`), sem ferramentas, e trata a descrição da empresa como informação, não como ordem.

## Rodar no computador

```bash
cd agent
npm install
cp .env.example .env        # preencha ANTHROPIC_API_KEY
npm test                     # testes automáticos, não usam a API
node --env-file=.env src/chat-cli.js   # conversa pelo terminal
node --env-file=.env src/servidor.js   # sobe o servidor em http://localhost:8787
```

## Publicar

O GitHub Pages só hospeda o site estático, então o agente precisa de um servidor Node.js. O jeito mais simples:

1. Crie uma conta no [Render](https://render.com) e escolha **New + → Blueprint**, apontando para este repositório. O arquivo `render.yaml` na raiz já configura tudo.
2. Preencha `ANTHROPIC_API_KEY` (crie em [console.anthropic.com](https://console.anthropic.com)).
3. Quando o serviço estiver no ar, copie o endereço (ex.: `https://nexor-assist.onrender.com`) e coloque em `assets/js/config.js`:
   ```js
   const NEXOR_API_URL = "https://nexor-assist.onrender.com";
   ```
   A partir daí a Blue responde com IA, os leads chegam para a equipe e o teste do Atende IA usa IA de verdade. Antes disso, a Blue faz um atendimento guiado e os leads ficam guardados no navegador do visitante, esperando o servidor.

O disco dos planos gratuitos de hospedagem costuma ser apagado a cada nova publicação. Configure `LEAD_WEBHOOK_URL` ou use os avisos no WhatsApp para não perder leads. Também funciona em Railway, Fly.io ou qualquer VPS com Node 20+.

## Ligar ao WhatsApp (WhatsApp Cloud API)

1. Em [developers.facebook.com](https://developers.facebook.com), crie um app do tipo **Empresa** e adicione o produto **WhatsApp**.
2. Cadastre o número da Nexor e gere um **token permanente** (usuário do sistema no Gerenciador de Negócios). Preencha `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_APP_SECRET` (Configurações do app → Básico).
3. Em WhatsApp → Configuração → Webhook, use a URL `https://SEU-SERVIDOR/webhook/whatsapp` e o mesmo texto de `WHATSAPP_VERIFY_TOKEN`. Assine o campo **messages**.

Atenção:

- Um número ligado à Cloud API não funciona ao mesmo tempo no app WhatsApp Business comum, a não ser que a conta use o modo de coexistência da Meta. Se a equipe quiser continuar atendendo pelo app, use um segundo número para o agente.
- A Meta cobra por conversa iniciada pela empresa fora da janela de 24 horas. As respostas do agente acontecem dentro da janela, porque é o cliente quem escreve primeiro.
- Os avisos para `TEAM_WHATSAPP` só chegam se esse número tiver mandado mensagem para o número do agente nas últimas 24 horas. Para avisos sempre garantidos, use `LEAD_WEBHOOK_URL`.

## Custos e ajustes

- Modelo padrão: `claude-opus-5-5`, com esforço `low` (respostas rápidas). Troque por `NEXOR_MODEL` e `NEXOR_EFFORT`.
- As instruções da Nexor ficam em cache entre as mensagens (prompt caching), o que reduz o custo de cada resposta.
- Cada conversa recomeça após 24 horas sem mensagens. Há limite de 20 mensagens a cada 10 minutos por cliente.
