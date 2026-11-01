# Nexor Atende IA

Atendimento inteligente no WhatsApp com a **API oficial da Meta (WhatsApp Cloud API)** e o **Claude** (Anthropic). Um painel completo para a empresa acompanhar as conversas em tempo real, assumir quando quiser e ensinar a IA, que fica mais inteligente a cada correção.

## O que ele faz

**Atendente virtual**
- Responde no WhatsApp 24 horas, no tom de voz da empresa, com mensagens curtas e naturais.
- **Entende fotos e PDFs** que o cliente envia (comprovantes, fotos de produto, documentos).
- **Agrupa mensagens seguidas**: espera o cliente terminar de digitar e responde tudo de uma vez, como uma pessoa. Mostra "digitando…" enquanto pensa.
- Consulta a **base de conhecimento** (busca BM25 com radicais em português: "entregas", "entrega" e "entregamos" casam) e o **catálogo** (preço, estoque, foto do produto).
- Envia **botões e listas clicáveis** do WhatsApp.
- **Agenda, remarca e cancela** horários respeitando o expediente e a duração de cada serviço, e manda lembrete antes.
- **Preenche o CRM sozinho**: nome, e-mail, interesse, etiquetas, etapa do funil e valor estimado.
- **Transfere para a equipe** quando o cliente pede, reclama, negocia ou quando ela não sabe — com resumo pronto. Sabe se a equipe está no horário e avisa quando volta.
- **Retoma conversas paradas** com uma mensagem personalizada (dentro da janela de 24 h da Meta).
- Lembra do cliente entre atendimentos (o histórico anterior vai junto).
- Nunca inventa preço, prazo ou política; trata mensagens do cliente como informação, não como ordem.

**Inteligência para a equipe**
- **Análise automática de cada conversa**: sentimento, intenção, urgência, **temperatura do lead (0–100)**, objeções, resumo e **próxima ação recomendada**. Alerta quando o cliente precisa de uma pessoa.
- O funil avança sozinho conforme a conversa.
- **Copiloto**: escreve a resposta para a pessoa revisar, com ou sem orientação ("ofereça 10% à vista"), e reescreve o texto digitado (mais simpático, profissional, curto, persuasivo, empático, ou só corrige o português).
- **Modo copiloto**: a IA prepara cada resposta e a equipe aprova com um clique.
- **Ensinar a IA**: em qualquer resposta da IA, clique em *Ensinar* e escreva como deveria ser. Quando a equipe edita uma sugestão do copiloto, a correção também vira exemplo. A IA segue esses exemplos em todas as conversas.
- **Simulador**: converse com a IA como um cliente e veja nos bastidores o que ela faria (consultar a base, atualizar o CRM, agendar, transferir), sem enviar nada no WhatsApp.
- **Organizar conhecimento com IA**: cole o texto do site, cardápio ou manual e a IA monta as perguntas frequentes para você revisar.
- **Modelos escritos pela IA**: descreva o objetivo e ela escreve um modelo dentro das regras da Meta.

**Painel**
- Caixa de entrada em tempo real (SSE), filtros (aguardando, minhas, com a IA, com a equipe), busca, respostas rápidas com `/atalho`, notas internas, anexos, reações, status de entrega (enviada, entregue, lida, falhou com o motivo em português), atribuição e prioridade.
- Indicador da janela de 24 h: quando fecha, o painel oferece os modelos aprovados.
- Início com guia de configuração, indicadores (automação, resolvidas pela IA, tempo de 1ª resposta, horas economizadas), gráficos por dia, horários de pico, funil, leads quentes e sentimento.
- Contatos em lista ou **funil (kanban)** com arrastar e soltar, importação e exportação CSV.
- Campanhas com modelos aprovados, público por etiqueta e etapa, variáveis personalizadas (`{primeiro_nome}`, `{campo:cidade}`), agendamento e métricas (entregues, lidas, responderam). Quem responde é atendido pela IA na hora; quem responde "parar" sai da lista.
- Equipe com papéis (dono, administrador, atendente), histórico de ações, tema claro e escuro, notificações do navegador e uso no celular.

**Integração com a Meta**
- Webhook com verificação e assinatura `X-Hub-Signature-256` (segredo global do app ou um por empresa).
- Texto, imagem, vídeo, áudio, documento, figurinha, localização, contatos, botões, listas, link (CTA), reações, modelos com variáveis e cabeçalho de mídia, "marcar como lida" com "digitando…".
- Download das mídias recebidas (a URL da Meta expira em minutos) e upload das enviadas.
- Modelos: sincronizar, criar, excluir e acompanhar aprovação pelo webhook `message_template_status_update`.
- Número: testar conexão, qualidade, registrar com PIN, perfil comercial, assinatura automática do webhook na conta (WABA).
- **Cadastro incorporado** (Embedded Signup) opcional: o cliente conecta o número com o login do Facebook.
- Erros da Meta traduzidos (ex.: 131047 janela de 24 h, 131026 número sem WhatsApp, 190 token expirado) e novas tentativas automáticas em erros temporários.
- Várias empresas no mesmo servidor (multiempresa), cada uma com os próprios números, dados e IA.

## Arquitetura

```
WhatsApp ── Meta Cloud API ──► POST /webhook/whatsapp ─► atendimento.js ─┬─► agente.js ─► Claude (ferramentas)
                                                                          ├─► copiloto.js (análise, sugestões)
Painel (public/) ◄── SSE /api/eventos ◄── eventos.js ◄────────────────────┤
Painel ──► /api/* (api.js) ──────────────────────────────────────────────┘    db.js (SQLite) · midia.js
agendador.js: campanhas · follow-up · lembretes
```

| Arquivo | Para que serve |
| --- | --- |
| `src/meta/cloud-api.js` | Cliente da Graph API: envio de todos os tipos, mídia, modelos, perfil, número, erros em português |
| `src/meta/webhook.js` | Assinatura e leitura dos eventos da Meta |
| `src/ia/agente.js` | Monta a conversa (texto, imagens, PDFs) e roda o ciclo de ferramentas |
| `src/ia/ferramentas.js` | Ferramentas da IA com validação (zod) |
| `src/ia/prompt.js` | Instruções de cada empresa (estáveis, em cache) e contexto de cada mensagem |
| `src/ia/conhecimento.js` | Busca BM25 na base de conhecimento |
| `src/ia/copiloto.js` | Análise estruturada, sugestões, reescrita, modelos e organização da base |
| `src/servicos/atendimento.js` | Recebe, decide quem responde, envia, transfere, analisa |
| `src/servicos/agendador.js` | Campanhas, follow-up e lembretes |
| `src/servicos/agenda.js` | Horários livres e expediente (horário de Brasília) |
| `src/http/api.js` | API do painel (login por cookie HttpOnly, proteção CSRF, papéis) |
| `src/db.js` | Banco SQLite nativo do Node (sem dependências) |
| `public/` | Painel (HTML, CSS e JavaScript puro, sem build) |

Dependências: só `@anthropic-ai/sdk` e `zod`. Banco: SQLite nativo do Node 22.

## Rodar no computador

```bash
cd atende
npm install
cp .env.example .env    # preencha ANTHROPIC_API_KEY e MASTER_KEY
npm test                # testes automáticos (não usam a API nem a Meta)
node --env-file=.env --disable-warning=ExperimentalWarning src/servidor.js
```

Abra http://localhost:8790: o primeiro acesso cria a empresa e o usuário dono. Para a Meta alcançar o webhook no computador, use um túnel (ex.: `cloudflared tunnel --url http://localhost:8790`) e coloque o endereço em `PUBLIC_URL`.

## Publicar

1. No [Render](https://render.com), **New + → Blueprint** apontando para este repositório. O `render.yaml` da raiz já cria o serviço `nexor-atende-ia` com um disco persistente para o banco e as mídias (o disco exige um plano pago; sem ele, os dados somem a cada publicação).
2. Preencha `ANTHROPIC_API_KEY`, `META_APP_SECRET` e `PUBLIC_URL` (ex.: `https://atende.nexorconsultingit.com.br`). `MASTER_KEY` e `META_VERIFY_TOKEN` são gerados automaticamente.
3. Opcional: aponte um subdomínio (`atende.nexorconsultingit.com.br`) para o serviço.

Também roda em qualquer VPS, Railway ou Fly.io com Node 22.13+ e um disco persistente em `DATA_DIR`.

## Conectar o WhatsApp

O painel tem o passo a passo em **Configurações → WhatsApp**. Resumo:

1. Em [developers.facebook.com/apps](https://developers.facebook.com/apps), crie um app do tipo **Empresa** e adicione o produto **WhatsApp**.
2. Adicione o número da empresa. Ele não pode estar ativo no app WhatsApp comum ao mesmo tempo (a não ser no modo de coexistência da Meta).
3. No Gerenciador de Negócios → **Usuários do sistema**, gere um **token permanente** com `whatsapp_business_messaging` e `whatsapp_business_management`.
4. Em WhatsApp → Configuração → **Webhook**, cole a URL e o token de verificação mostrados no painel e assine os campos `messages` e `message_template_status_update`.
5. No painel, informe o ID do número, o ID da conta (WABA) e o token. O sistema testa, assina o webhook da conta e sincroniza os modelos.

Para oferecer o botão **Conectar com o Facebook** (cadastro incorporado), configure `META_APP_ID` e `META_CONFIG_ID` (Login do Facebook para Empresas → Configurações, tipo WhatsApp Embedded Signup). Isso exige que o app seja Provedor de Tecnologia verificado na Meta.

## Regras da Meta que o sistema respeita

- Mensagens livres só até 24 horas depois da última mensagem do cliente. Depois, apenas modelos aprovados (o painel bloqueia e oferece os modelos; o follow-up e os lembretes também respeitam).
- Campanhas só para quem não pediu para sair; "parar", "sair" e "stop" descadastram na hora.
- A Meta cobra por modelo entregue (marketing, utilidade, autenticação). Respostas dentro da janela de atendimento não são cobradas.

## Custos da IA e ajustes

- Modelo padrão `claude-opus-5-5` com esforço `low` no atendimento (rápido e econômico). Troque com `NEXOR_MODEL` e `NEXOR_EFFORT`.
- As instruções de cada empresa ficam em cache (prompt caching): o contexto que muda (hora, cliente, horário de atendimento) vai na mensagem, não nas instruções.
- O consumo de tokens por empresa e por dia fica na tabela `uso_ia`.
- Se o modelo recusar um pedido por política, a API tenta outro modelo na mesma chamada (fallback do servidor).
- Áudios de voz são guardados e tocam no painel; a IA pede com gentileza que o cliente escreva, porque o Claude não transcreve áudio. Para transcrever, ligue um serviço de transcrição em `conteudo.transcricao` da mensagem (o agente já usa esse campo).
