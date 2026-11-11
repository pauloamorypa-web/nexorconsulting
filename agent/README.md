# Blue — assistente de IA da Nexor Consulting

A Blue é a assistente de atendimento e vendas da Nexor. Ela responde clientes no **chat do site** e no **WhatsApp**, usando o Claude (Anthropic). O mesmo servidor recebe os **leads do site** (pré-cadastro do teste grátis, calculadora, formulários abandonados) e faz a IA do **teste grátis do Nexor Atende IA**.

O que ele faz:

- Entende a necessidade do cliente e explica a solução da Nexor que resolve (Atende IA, Commerce, Gestão, Site Pro, Automação, Sob Medida).
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
                                                                   └─ transferir_para_humano
```

| Arquivo | Para que serve |
| --- | --- |
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

## Sales Agent (MVP fechado)

O primeiro núcleo comercial está em `src/vendas/`. `POST /api/vendas/qualificar` valida a origem e os dados, calcula uma pontuação explicável, sugere uma solução, salva o lead e avisa a equipe para revisão. `POST /api/vendas/rascunho` prepara uma abordagem curta com Claude apenas quando há permissão documentada para o canal e a finalidade; o modelo recebe o contexto comercial mínimo, sem e-mail ou telefone. Ambos exigem Bearer token de pelo menos 32 caracteres e permanecem ocultos até `SALES_ENABLED=true`.

O MVP **não pesquisa nem aborda pessoas automaticamente**. Permissão documentada habilita retorno comercial para revisão, mas nunca liga envio automático. LinkedIn só pode entrar por Lead Gen Forms/API oficialmente concedidos; sem isso, use importação manual autorizada. O envio ao cliente só entra após configurar os conectores oficiais e aprovar templates e consentimentos.

Exemplo de chamada interna:

```json
{
  "nome": "Ana Silva",
  "empresa": "Clínica Horizonte",
  "cargo": "Diretora",
  "necessidade": "Precisamos atender pacientes pelo WhatsApp e reduzir o tempo de resposta.",
  "segmento": "clínica",
  "canal_origem": "linkedin_lead_form",
  "fonte_url": "https://www.linkedin.com/company/exemplo/",
  "contato": { "email": "ana@example.com" }
}
```

Para ligar os endpoints, defina `SALES_ENABLED=true` e `SALES_API_TOKEN` (segredo aleatório com pelo menos 32 caracteres). Faça a requisição com `Authorization: Bearer ...`; nunca coloque o token na URL ou no frontend público. O score não é autorização de contato. `/api/vendas/rascunho` tem limite separado de 10 chamadas por minuto por IP e 100 por hora global.

O schema de lead usa `canal_origem` (`site`, `linkedin_lead_form`, `indicacao` ou `manual`), `necessidade`, `empresa` e `contato`. Para solicitar um rascunho, informe também `permissao` com `canal`, `autorizacao_registrada: true`, `finalidade: "retorno_comercial"`, `origem` e `registrada_em` em ISO 8601. A permissão tem que corresponder ao contato disponível. Mesmo assim, o retorno marca `aprovacao_humana_obrigatoria: true` e `envio_automatico_habilitado: false`.

### Google Calendar e WhatsApp

O conector selecionado é Google Calendar com WhatsApp Cloud API oficial. O adaptador Google está em `src/vendas/google-calendar.js`; consulta busy/free, cria evento privado com Meet, mantém os tokens OAuth só em memória e usa o refresh token configurado pelo ambiente. Solicite apenas os escopos `calendar.events.owned` e `calendar.events.freebusy` numa conta que possua a agenda. A data/hora é gravada com `America/Sao_Paulo` mesmo que a agenda esteja configurada em UTC.

Defina `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` e `GOOGLE_CALENDAR_ID` no gerenciador de segredos. `GOOGLE_CALENDAR_REQUIRED=true` bloqueia agendamentos quando a integração estiver sem credenciais; deixe `false` durante a configuração para manter a agenda interna legada. A criação de eventos envia convite do Google Calendar por email quando o lead informou email.

O worker dos lembretes já está implementado; para ativá-lo, configure `WHATSAPP_REMINDER_24H_TEMPLATE` e `WHATSAPP_REMINDER_30M_TEMPLATE` com nomes de templates **UTILIDADE aprovados pela Meta**, ambos com três variáveis de corpo: nome, horário local e link Meet. `WHATSAPP_TEMPLATE_LANGUAGE` define o idioma do template (padrão `pt_BR`). O agente só registra opt-in quando a pessoa escreve uma confirmação explícita que menciona lembretes e WhatsApp; “pode mandar o link” não conta. `PARAR`, `SAIR`, `STOP`, `CANCELAR`, `REMOVER` e `DESCADASTRAR` cancelam lembretes pendentes. Envios são at-most-once: se o resultado da Meta ficar ambíguo, não há retry automático para evitar mensagem duplicada; a equipe revisa o estado.

O adaptador segue a API oficial: [FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query) para disponibilidade, [Events insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert) para criar reunião e [escopos do Calendar](https://developers.google.com/workspace/calendar/api/auth) para limitar acesso. Até configurar credenciais da Meta, nenhum lembrete outbound é enviado.

### IP de origem e proxy

Por padrão, cabeçalhos de IP enviados pelo cliente são ignorados. Só configure `TRUSTED_PROXY_SECRET` quando a borda/proxy adicionar `X-Nexor-Proxy-Secret` com o mesmo segredo e impedir que esse valor seja definido por acesso direto à origem. Não reutilize `X-Forwarded-For` sem autenticar a borda. O token de relatório só é aceito no cabeçalho Authorization; token em URL é recusado para evitar vazamento em logs e histórico do navegador.

## Campanhas: Meta e relatório com IA

- **API de Conversões da Meta**: com `META_PIXEL_ID` e `META_CAPI_TOKEN`, cada lead (menos os parciais) vai para a Meta como `Lead`, e os quentes também como `LeadQuente`, com telefone e e-mail em hash SHA-256. Assim a campanha aprende a buscar pessoas parecidas com quem virou lead quente. O `event_id` é o mesmo do Pixel do site, então a Meta não conta duas vezes.
- **Relatório**: `GET /api/relatorio?dias=7` com `Authorization: Bearer <REPORT_TOKEN>` devolve os leads por campanha e a taxa de leads quentes. Com `&analise=1`, o Claude escreve o que escalar, o que pausar e o que testar. Opcional: `&investimento=meta/teste12h: R$ 350; google/erp: R$ 280` para ele considerar o custo.

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
