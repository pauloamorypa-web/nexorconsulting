# Nexor Sales Agent

Projeto de extensão do Nexor Assist para operação comercial B2B da Nexor. A Blue permanece como canal de atendimento; o Sales Agent organiza prospecção autorizada, pesquisa de contas, qualificação, recomendação de solução, reuniões e follow-up consentido.

## Estado da implementação neste PR

Implementado: intake autenticado e qualificação determinística, recomendação inicial, rascunho com Claude após permissão documentada, consulta de disponibilidade e criação/cancelamento de eventos do Google Calendar, templates WhatsApp de lembrete 24 h/30 min, opt-out, dedupe durável de webhooks, timeouts e redação de logs. Os envios de lembrete são at-most-once para evitar duplicidade em caso de timeout.

Ainda depende de credenciais e de validação operacional: OAuth próprio do Google, templates de utilidade aprovados na Meta e `SALES_API_TOKEN`. A conexão do Google Calendar dentro do ChatGPT não fornece credenciais ao serviço hospedado. LinkedIn Lead Gen Forms e pesquisa de mercado com provedor licenciado ainda não têm adaptadores conectados; nesta fase, os leads entram por integração interna autenticada ou registro manual autorizado. LinkedIn outbound continua apenas em rascunho/revisão.

Não ligar `SALES_ENABLED` antes de cadastrar o `SALES_API_TOKEN`. `GOOGLE_CALENDAR_REQUIRED=true` é intencional no Render: até configurar OAuth, o agente se recusa a confirmar horário sem gravar na agenda correta. Os lembretes só enviam com templates Meta aprovados, credenciais WhatsApp e consentimento da pessoa.

## Resultado esperado

- Centralizar leads do site, LinkedIn Lead Gen Forms, indicações e importações autorizadas.
- Pesquisar empresas com fontes públicas permitidas e registrar a fonte/data de cada evidência.
- Priorizar leads com fit, intenção recente e permissão de contato.
- Preparar abordagens individuais e contextualizadas, com transparência de que é assistente virtual quando conversando diretamente.
- Recomendar a solução Nexor adequada com base em catálogo validado; nunca inventar preço, prazo, integração ou resultado.
- Oferecer link da agenda, criar evento após escolha explícita do contato e acompanhar confirmação.
- Enviar lembretes via WhatsApp 24 h e 30 min antes, somente com opt-in e regras/templates da Meta respeitados.
- Entregar contexto e próxima ação a uma pessoa da equipe sempre que solicitado ou quando houver risco, objeção comercial ou baixa confiança.

## Princípios de canal e segurança

1. LinkedIn: usar APIs e produtos oficiais habilitados para a conta (p.ex. Lead Gen Forms e publicação autorizada). OAuth com escopos mínimos. Não raspar perfis, automatizar convites, ler mensagens privadas por meios não autorizados nem fazer envio em massa. Se a API não permitir uma ação, o agente prepara uma tarefa ou rascunho para a equipe.
2. WhatsApp: Cloud API oficial. Resposta livre dentro da janela de atendimento vigente; fora dela, usar somente template aprovado adequado à categoria. Lembretes exigem consentimento registrável, número válido, preferência/canal, modelo aprovado e opção de parar. Cancelamento/opt-out interrompe tarefas pendentes imediatamente.
3. Identidade: linguagem natural e personalizada, sem alegar ser uma pessoa. O agente se identifica como assistente virtual da Nexor quando inicia conversa ou quando perguntado; não simula intimidade nem inventa pesquisa.
4. LGPD: Nexor define finalidade e base legal com assessoria adequada; guardar evidência da origem, consentimento/opt-out, finalidade e prazo de retenção. Minimizar dados, atender correção/exclusão e não coletar dados sensíveis para prospecção.
5. Pesquisa: apenas fontes públicas ou licenciadas. Guardar URL, data de consulta e trecho/fato usado; separar fato de hipótese. Não inferir atributos sensíveis.
6. Segurança: segredos apenas no ambiente do cliente, criptografados em repouso, nunca em logs. OAuth state/PKCE, validação Zod em toda entrada, HMAC nos webhooks, rate limits, idempotência, RBAC e trilha de auditoria.
7. Aprovação humana configurável: obrigatório antes de qualquer mensagem outbound no LinkedIn; WhatsApp outbound só é automático para lembretes de reunião com opt-in válido e template ativo. O primeiro contato exige revisão até haver política aprovada pela Nexor.

## Catálogo inicial

O catálogo deve ser importado da fonte canônica do site e validado pelo responsável comercial. Lista de referência do README: Nexor Atende IA, Nexor Commerce, Nexor Gestão, Nexor Site Pro, Automação e Sob Medida. As três soluções de TI e detalhes de escopo devem vir do catálogo atual em `assets/js/solucoes.js`; não duplicar preço ou promessas em código.

Recomendação por necessidade, nunca por porte isolado:
- WhatsApp, alto volume, demora ou perda de conversas → avaliar Nexor Atende IA.
- Venda em canais digitais/marketplaces → avaliar Nexor Commerce.
- Processos operacionais e controle empresarial → avaliar Nexor Gestão.
- Presença digital ou aquisição via site → avaliar Nexor Site Pro.
- Tarefa repetitiva específica → avaliar Automação.
- Requisito singular ou integração fora do padrão → avaliar Sob Medida.
Cada recomendação inclui evidências, confiança e perguntas ainda abertas. Confiança baixa resulta em diagnóstico humano.

## Arquitetura proposta

Manter Node.js ESM e validação Zod do `agent/`. A primeira implantação deve permanecer uma instância Node 22 com banco SQLite persistente (ou Postgres antes de escalar horizontalmente). Não ampliar o agente conversacional para executar ações de canal irrestritas.

```
Website / LinkedIn Lead Gen / Importação permitida
                    │
             adaptadores inbound
                    ▼
     validação → consentimento → dedupe
                    ▼
     CRM comercial + pesquisa/evidências
                    ▼
   score/fit → recomendação → rascunho
                    │               │
            aprovação humana       ├─ LinkedIn oficial (se habilitado)
                                    └─ WhatsApp Cloud API
Agenda (Google/Microsoft ou link existente) → reunião → lembretes 24h/30min
                    │
           webhook CRM / dashboard
```

### Componentes sugeridos

- `src/vendas/modelo.js`: enums, schemas Zod, estados e regras de transição.
- `src/vendas/catalogo.js`: leitura do catálogo validado e recomendação explicável.
- `src/vendas/qualificacao.js`: scoring determinístico, faixa e motivos; IA só resume evidências.
- `src/vendas/pesquisa.js`: interfaces de provedores aprovados, fontes e cache com TTL; sem crawler de LinkedIn.
- `src/vendas/pipeline.js`: idempotência, funil, tarefas, opt-out e aprovação.
- `src/vendas/mensagens.js`: prompts, geração curta, checagem de afirmações e rascunhos.
- `src/vendas/canais/linkedin.js`: OAuth e APIs oficialmente concedidas; por padrão, ingestão de formulários e publicação/tarefas aprovadas.
- `src/vendas/canais/whatsapp.js`: adaptador sobre o cliente oficial existente, templates e envio agendado.
- `src/vendas/agenda.js`: adaptador de disponibilidade, criação/alteração/cancelamento e URL de reunião.
- `src/vendas/lembretes.js`: jobs duráveis e idempotentes em 24 h e 30 min; cancela em alteração/cancelamento.
- `src/vendas/auditoria.js`: eventos imutáveis de consentimento, decisão, aprovação, envio e resultado.
- `src/vendas/worker.js`: fila com concorrência limitada, retry exponencial com jitter e dead-letter.
- `src/http/vendas.js`: endpoints autenticados para revisão, aprovação e estado do pipeline.

## Fluxo comercial

1. Entrada: valida payload, normaliza empresa/contato, valida fonte e preferência de contato, deduplica por identificador normalizado.
2. Pesquisa: coleta dados públicos permitidos em tarefas limitadas; evidencia cada fato com URL e data. Sem fonte confiável, marca “não verificado”.
3. Qualificação: score explicável de 0–100: intenção explícita/recência 0–35, encaixe de necessidade 0–30, adequação operacional 0–20, engajamento consentido 0–15. Penalidades por dado antigo, contato inválido ou opt-out; opt-out bloqueia comunicação independentemente do score. Faixas configuráveis: quente ≥70, morno 40–69, frio <40. Não usar score sozinho para enviar mensagem.
4. Encaixe: compara necessidade declarada com catálogo e apresenta até duas soluções, por que encaixam e o que precisa ser confirmado.
5. Abordagem: agente prepara mensagem de até 500 caracteres em tom humano, menciona contexto verificável, uma pergunta útil e uma saída simples (“se não fizer sentido, me avise”). Salva rascunho e fonte. Sem cadência automática de insistência.
6. Resposta: atualiza etapa, responde dúvidas com base no catálogo, oferece diagnóstico e agenda. Negociação, reclamação, pedido de humano, baixa confiança e temas contratuais passam para a equipe.
7. Reunião: envia link de agenda; só cria reunião depois da escolha/confirmação. Evento inclui fuso America/Sao_Paulo, duração, assunto, participantes e link. Mudança ou cancelamento propaga para o calendário e cancela lembretes antigos.
8. Lembretes: job em 24 h e 30 min, com chave idempotente por reunião/horário/tipo. Envia apenas com opt-in e template utilitário aprovado se necessário. Se a reunião foi marcada com menos de 24 h, envia só o lembrete de 30 min. Registra status da Meta e falhas; não faz retry de erro permanente.
9. Pós-reunião: tarefa interna de follow-up com resumo/evidências; nenhuma proposta comercial ou compromisso financeiro é enviado sem aprovação humana.

## Estados e dados

Funil: `novo → pesquisando → qualificado → aguardando_aprovacao → contato_iniciado → em_conversa → reuniao_oferecida → reuniao_marcada → reuniao_realizada → proposta_em_revisao → ganho|perdido|pausado`. `opt_out` é uma trava global, não uma etapa reversível por automação.

Entidades mínimas:
- `lead`: UUID, nome, empresa, domínio, cargo (opcional), canal, contato mínimo, necessidade, solução sugerida, score/motivos, estado, responsável, created/updated.
- `evidence`: lead_id, URL/fonte, data de consulta, tipo, resumo factual, retenção.
- `permission`: lead_id, canal, finalidade, base/aviso apresentado, origem, timestamp, versão do texto, revogação.
- `message`: lead_id, canal, rascunho, template_id, aprovação/autor, status externo, timestamps.
- `meeting`: calendar_event_id, timezone, start/end, URL, status, reminder states.
- `audit_event`: ator, ação, entidade, timestamp, request_id e metadados redigidos.

Usar restrições únicas para IDs externos e `(meeting_id, reminder_type, scheduled_for)`; transações para criação/alteração de reunião. Índices por etapa, responsável, data de próxima ação e identificadores de dedupe.

## Conectores e configuração

Configuração opcional, desativada por padrão; não ativar sem credenciais e consentimentos:

```env
SALES_ENABLED=false
SALES_DATABASE_URL=
SALES_ENCRYPTION_KEY=
SALES_REVIEW_REQUIRED=true
SALES_MAX_OUTBOUND_PER_DAY=20
SALES_RESEARCH_TTL_HOURS=168
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=
LINKEDIN_LEAD_FORM_ORG_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_CALENDAR_ID=
WHATSAPP_REMINDER_24H_TEMPLATE=
WHATSAPP_REMINDER_30M_TEMPLATE=
WHATSAPP_OPT_OUT_KEYWORDS=parar,sair,stop
SALES_WEBHOOK_SECRET=
```

- LinkedIn OAuth/API: habilitar somente produtos e escopos aprovados para a Nexor; validar estado e assinatura/origem dos webhooks. O adaptador retorna `capability_unavailable` em recursos não concedidos; sem automação via navegador.
- Google Calendar: OAuth escopado ao calendário escolhido; refresh token criptografado. Alternativamente, o link de agendamento já usado pela Nexor pode ser o MVP, com confirmação via webhook.
- WhatsApp: reaproveitar `src/whatsapp.js` e a assinatura Cloud API; acrescentar envio de templates aprovado e recebimento de status. Não criar client paralelo.
- CRM: webhook assinado para CRM/n8n/Make existente com allowlist de destino, timeout e retries; payload mínimo.
- Pesquisa: primeiro MVP usa fontes fornecidas pela equipe + websites/domínios públicos aprovados. Adicionar provedor comercial só após revisão de licença, custo e retenção.

## Endpoints propostos

- `POST /api/vendas/leads/importar`: ingestão autenticada ou webhook assinado; limite e idempotência.
- `GET /api/vendas/leads?etapa=&responsavel=&score_min=`: lista paginada, RBAC e campos mínimos.
- `GET /api/vendas/leads/:id`: detalhes, evidências e auditoria permitidas.
- `POST /api/vendas/leads/:id/pesquisar`: enfileira pesquisa; não bloqueia request.
- `POST /api/vendas/leads/:id/rascunho`: gera/atualiza rascunho sem enviar.
- `POST /api/vendas/mensagens/:id/aprovar`: aprovação humana com ator explícito.
- `POST /api/vendas/reunioes`: confirma reunião após aceite e verificação de disponibilidade.
- `POST /api/vendas/reunioes/:id/cancelar`: cancela e elimina jobs futuros.
- `POST /webhook/linkedin`, `/webhook/calendar`, `/webhook/whatsapp-status`: assinatura verificada, resposta rápida e processamento assíncrono.
- `POST /api/vendas/leads/:id/opt-out`: grava supressão atômica e cancela ações futuras.
Todos exigem HTTPS, schema estrito, autenticação onde aplicável, limites, correlation ID e respostas sem dados pessoais desnecessários.

## Performance e resiliência

- Paginação cursor-based; pesquisa e geração de texto fora do request HTTP.
- Cache de pesquisa por domínio com TTL; não persistir páginas completas.
- Timeout em conectores (3–8 s configuráveis), retry só em erros transitórios e com jitter.
- Fila limitada por canal e por tenant; circuit breaker, rate limit e dead-letter.
- IA com contexto enxuto, catálogo cacheado, limite de tokens e saída estruturada validada.
- Webhook retorna 2xx após validar e persistir/enfileirar, não após operação de IA.
- Métricas sem PII: latência, fila, sucesso por conector, custo IA, taxa de opt-out, reuniões marcadas e lembretes entregues.

## Plano de entrega

1. **MVP seguro**: catálogo, schemas, score, pesquisa manual/URLs permitidas, funil, rascunhos, aprovação humana, link de agenda e auditoria.
2. **Agenda**: integrar calendário/link escolhido, confirmação, mudança/cancelamento e jobs duráveis 24 h/30 min.
3. **WhatsApp**: templates utilitários aprovados, consentimento, opt-out, status, retries e dry-run.
4. **LinkedIn**: app OAuth aprovado e Lead Gen Forms disponíveis; ingestão e dedupe primeiro. Publicação/outbound só após validar acesso oficial e aprovação.
5. **Operação**: painel comercial com RBAC, métricas, exportação controlada, retenção e exclusão.
6. **Escala**: mover de SQLite para Postgres + worker/fila compartilhada antes de múltiplas instâncias.

## Critérios de aceite

- Nenhum outbound sem canal permitido e autorização registrada; LinkedIn sempre passa por revisão humana no MVP.
- Opt-out bloqueia mensagens e lembretes em todos os canais em até uma transação.
- Recomendações apontam para fatos do catálogo e identificam incerteza.
- Lead duplicado/webhook repetido não cria contatos, eventos ou lembretes duplicados.
- Agenda usa America/Sao_Paulo e reagendamento cancela jobs anteriores.
- WhatsApp respeita janela e modelo aprovado, registra IDs/status da Meta e tem fallback humano.
- Nenhum segredo ou PII aparece em logs de aplicação/telemetria.
- APIs têm RBAC, rate limit, validação estrita, trilha de auditoria e exclusão/retenção configuráveis.
- Funciona com conectores desligados; falha do LinkedIn/IA nunca impede registrar ou atender lead.

## Pré-requisitos para ativação

Credenciais e produtos aprovados no LinkedIn/Meta/Google; URL pública HTTPS; número e templates do WhatsApp; escolha entre link de agenda, Google Calendar ou Microsoft 365; catálogo comercial revisado; definição do responsável por aprovações; política de retenção e texto de opt-in. Até então, sistema opera em dry-run e preparação de tarefas.

## Configuração ativa do Google Calendar

Projeto Google Cloud: `Nexor Sales Agent` (`thermal-cathode-514215-j6`). A Calendar API está habilitada e o consentimento OAuth está em modo externo de teste, com `nexorconsultingit@gmail.com` como único usuário de teste. Cliente desktop: `Nexor Sales Agent Local OAuth`.

O utilitário `scripts/google-oauth-setup.js` gera um refresh token sem salvá-lo em arquivo. Para usar, coloque `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` somente no `agent/.env` local (ignorado pelo Git), execute `node --env-file=.env scripts/google-oauth-setup.js`, abra o link no navegador conectado à conta Nexor e copie o token exibido no terminal diretamente para o segredo `GOOGLE_REFRESH_TOKEN` do Render. Não cole credenciais em chat ou repositório. Copie o ID da agenda principal do Google Calendar para `GOOGLE_CALENDAR_ID`.

O app ainda está em Testing; tokens gerados nesse estado para os escopos Calendar expiram em 7 dias. Não use o token de teste em produção. Antes da operação estável, publique o app e conclua a verificação Google aplicável; depois gere um novo refresh token para o Render.

