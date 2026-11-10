# Relatório do Agente Hacker · Nexor Barber · 2026-11-10

Escopo testado: alvo local em `http://localhost:8801` (código em `/home/user/nexorconsulting/barber`), subido com banco próprio em `DATA_DIR` de teste. Áreas cobertas: autenticação do painel (`/api/entrar`, `/api/cadastro`), autorização por papel (dono/admin, recepção, barbeiro), API do app do cliente (`/api/app/*`), webhooks (`/webhook/asaas`, `/webhook/whatsapp`), exposição de segredos em `/api/eu` e `/api/config`, CSRF, limite de tentativas de login, path traversal nos estáticos, cabeçalhos de segurança e tratamento de erros. Criei dados próprios: dono, um admin, uma recepção, um barbeiro (ligado ao barbeiro "Bruno"), dois clientes do painel e dois clientes do app (login por SMS via servidor falso em `localhost:8811`).

Fora do escopo / não testável: backdoor de suporte `/api/nexor/entrar` só pôde ser testado na recusa (exige vínculo com a Nexor Central e chave Ed25519 que não possuo — retornou "Link de acesso inválido", comportamento correto); integração real com Asaas/Meta/Google não é alcançável a partir do localhost (APIs externas), então a ativação ponta-a-ponta de uma assinatura via webhook forjado não pôde ser executada (ver suspeita S-01). Não alterei nenhum arquivo do projeto; todos os dados foram criados e destruídos no meu banco de teste; os processos que subi foram encerrados ao final.

## Achados

### H-01 · Segredos de webhook (Asaas e WhatsApp) entregues a qualquer papel do painel
- Gravidade sugerida: média
- Onde: `src/http/validacao.js:49-55` (`configPublica`) e as rotas que a devolvem sem restrição de papel: `src/http/api.js:120` (`GET /api/eu`) e `src/http/api.js:476` (`GET /api/config`). O token do webhook do Asaas é gravado em texto puro em `src/http/api.js:524`.
- Como reproduzir:
  1. Logar como barbeiro (papel mais baixo) ou recepção no painel.
  2. `GET /api/eu` ou `GET /api/config`.
  3. Ler `config.asaas.token_webhook` e `config.whatsapp.verificacao` em texto puro.
  4. Usar o token vazado contra o webhook: `POST /webhook/asaas` com cabeçalho `asaas-access-token: <token>`.
- Evidência (observada nos testes):
  - Como barbeiro: `GET /api/config` → 200, `asaas.token_webhook = u9t2rxeOO77ZnqthXbaczKNQ`, `whatsapp.verificacao = sfyDmcrtxjss56DnPtipUg`. Idem em `GET /api/eu`.
  - Como recepção: `GET /api/config` → 200, mesmo `token_webhook`.
  - Prova de que o token vale como autenticação: `POST /webhook/asaas` sem token → 401; token errado → 401; token vazado → **200** (`{"ignorado":true}`, ou seja, passou pela checagem de autenticação e entrou no processamento do evento).
  - Prova de que a verificação do WhatsApp vazada funciona: `GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=<verificacao>&hub.challenge=DESAFIO123` → 200, devolve `DESAFIO123`; com token errado → 403.
  - Contraste: os demais segredos vêm mascarados como booleano (`asaas.chave`, `whatsapp.token`, `whatsapp.segredo`, `sms.token`), mas `token_webhook` e `verificacao` saem em claro.
- Impacto: o `token_webhook` é o segredo que autentica os eventos do Asaas em `/webhook/asaas` (`src/servidor.js:230`). Um funcionário com o papel mais baixo (barbeiro) obtém esse segredo e pode forjar eventos de pagamento do clube: confirmar pagamentos (`PAYMENT_CONFIRMED` → `registrarPagamento` ativa a assinatura sem pagar, em `src/servicos/nucleo.js:499-501`) ou mandar `PAYMENT_OVERDUE`/cancelamento para atrapalhar assinantes. Esse token deveria existir só no painel do Asaas e nas mãos do dono/admin. A `verificacao` do WhatsApp permite completar o handshake de assinatura do webhook da Meta. É uma quebra de controle de acesso / exposição indevida de dados, agravada por o `token_webhook` ser guardado sem criptografia no banco.
- Correção sugerida: tratar `token_webhook` e `verificacao` como os outros segredos em `configPublica` (devolver só booleano "configurado"), ou restringir os campos secretos de `GET /api/config`/`GET /api/eu` a dono/admin. Esses valores já aparecem na aba de Configurações (admin) em `public/js/views/config.js:207`; convém servir essa aba por uma rota exclusiva de admin em vez de pelo `/api/eu` comum a todos os papéis. Adicionalmente, criptografar `token_webhook` no banco como se faz com `chave_cripto`.

## O que resistiu bem

- **Acesso cruzado entre clientes do app (IDOR) — o ponto mais importante:** todas as tentativas do cliente "Atacante" sobre o agendamento/espera da "Vítima" retornaram 404 pelo guarda de posse `meu()` (`src/http/app.js:27-31`): `cancelar`, `remarcar`, `cheguei`, `ics` e `reservas` → 404 "Agendamento não encontrado"; `DELETE /api/app/espera/:id` de outro → 404. `GET /api/app/eu` só devolve os próprios registros.
- **Autorização por papel no painel:** barbeiro recebeu 403 em `GET /api/usuarios`, `/api/auditoria`, `/api/relatorios`, `/api/envios` e `/api/nexor/ajustes`; `POST /api/usuarios` (criar admin) → 403; `PUT /api/barbeiros/<outro>` → 403 ("Você só pode mexer na sua própria agenda"); ao tentar alterar a própria comissão (`PUT /api/barbeiros/<bruno> {comissao_servico:99}`) a mudança foi ignorada e o valor permaneceu 50 (`src/http/api.js:312` filtra campos de não-admin). Dados financeiros de outro barbeiro vieram vazios/`null` para o barbeiro.
- **CSRF:** qualquer método não-GET sem o cabeçalho `x-nexor: 1` → 403 "requisição recusada" (`src/servidor.js:137`).
- **Força bruta no login:** sequência de senhas erradas resultou em 429 após o limite; limitador por IP e por e-mail (`src/http/api.js:43-50, 97-108`); usuário inexistente usa hash falso (`HASH_FALSO`) evitando enumeração por tempo.
- **Hash de senha:** scrypt N=2^17 com comparação em tempo constante (`timingSafeEqual`) e re-hash no login quando o custo é menor (`src/seguranca.js:11-28`).
- **Backdoor de suporte Nexor (`/api/nexor/entrar`):** token assinado em Ed25519, uso único, vinculado à instância, expiração ≤10 min (`src/nexor/central.js:173-182`); sem a chave da Central não é forjável — retornou "Link de acesso inválido".
- **Webhooks autenticados:** WhatsApp confere HMAC `x-hub-signature-256` (`src/servidor.js:204`); Asaas confere token (`:230`). Sem credencial válida → 401.
- **Path traversal nos estáticos:** `/../../../../etc/passwd` e `/%2e%2e/...` → 200 devolvendo o SPA (`index.html`), nunca o arquivo do sistema; normalização + `startsWith(PUBLICO)` em `src/servidor.js:107-115` seguram.
- **Cabeçalhos e cookies:** CSP, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` presentes; HSTS só em produção; cookie de sessão `HttpOnly; SameSite=Lax` (sem `Secure` apenas fora de produção, por design de localhost).
- **Tratamento de erros:** JSON malformado → 400 "JSON inválido"; erros internos → "Erro interno." sem stack trace (`src/servidor.js:256-260`).
- **Integridade de preço/valores:** vendas e agendamentos usam preços do servidor; o corpo do cliente não injeta `clube`/`reserva_id`/preço (esquemas em `src/http/api.js:385` e `src/http/app.js:194`).

## Suspeitas não confirmadas

- **S-01 · Ativação ponta-a-ponta de assinatura via webhook Asaas forjado** — gravidade informativa. Provei o desvio de autenticação (o `token_webhook` vazado passa em `/webhook/asaas`, 200 vs 401) e o caminho de código que ativa a assinatura (`eventoAsaas` → `registrarPagamento`, `src/servicos/nucleo.js:499-501`). Não consegui executar a ativação completa porque ela exige uma assinatura com `asaas_assinatura` preenchido, o que depende da API real do Asaas, inalcançável no teste local. A exploração é consequência direta e documentada do código, mas marco como não provada ponta-a-ponta por rigor.
- **S-02 · `token_webhook` em texto puro no banco** — gravidade informativa. Diferente de `chave_cripto`/`token_cripto`, o `token_webhook` do Asaas é persistido sem criptografia no `config` (`src/http/api.js:524`). Só vira risco concreto se houver leitura do banco; relato como reforço de defesa em profundidade, não como achado explorável por si só.
