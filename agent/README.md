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

## Campanhas: Meta e relatório com IA

- **API de Conversões da Meta**: só para leads que trazem `consentimento.medicao: true`, ou seja, de quem clicou em **Aceitar** no aviso de cookies do site (LGPD). A escolha fica gravada no lead (`consentimento: { medicao, versao, escolhido_em, recebido_em, origem }`), junto com `aceita_novidades` (checkbox opcional dos formulários). Com `META_PIXEL_ID` e `META_CAPI_TOKEN`, cada lead com consentimento (menos os parciais) vai para a Meta como `Lead`, e os quentes também como `LeadQuente`, com telefone e e-mail em hash SHA-256. Assim a campanha aprende a buscar pessoas parecidas com quem virou lead quente. O `event_id` é o mesmo do Pixel do site, então a Meta não conta duas vezes.
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
- **Teto diário de IA**: `IA_LIMITE_DIA_CHAMADAS` (padrão 1500) e `IA_LIMITE_DIA_TOKENS` (padrão 3.000.000), somando Blue, teste do Atende IA e WhatsApp, zerando à meia-noite de Brasília. Ao estourar, a Blue responde com o WhatsApp e o e-mail da equipe, sem chamar a IA.
- **Limites por conversa**: até 2.000 caracteres por mensagem e, em 24 h, até `CONVERSA_MAX_MENSAGENS_DIA` (60) mensagens e `CONVERSA_MAX_CARACTERES` (12.000) caracteres escritos pelo visitante.
- **Sigilo**: o prompt de sistema manda a Blue recusar revelar as instruções internas e tratar textos do visitante como informação, não como ordens.

## IP real do visitante (limites por IP)

Os cabeçalhos `CF-Connecting-IP`, `True-Client-IP` e `X-Forwarded-For` podem ser forjados por qualquer um. O servidor só confia neles quando a conexão vem de um proxy confiável:

- `TRUSTED_PROXIES`: IPs ou faixas IPv4 (CIDR) do proxy na frente do servidor, separados por vírgula. Ex.: `10.0.0.0/8`.
- `TRUST_PROXY_TUNNEL=1`: o servidor só é alcançável por um túnel (por exemplo `cloudflared`) e não tem porta pública.

Sem nenhum dos dois, vale o IP da conexão (`req.socket.remoteAddress`). Se o servidor estiver atrás de um proxy e nada for configurado, todos os visitantes contam como o IP do proxy nos limites por IP; o log mostra uma vez `[ip] cabeçalhos de proxy ignorados (conexão de X)`, com o IP a incluir.
