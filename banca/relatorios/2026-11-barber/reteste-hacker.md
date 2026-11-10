# Relatório do Agente Hacker · Reteste · Nexor Barber · 2026-11-10

Escopo testado: alvo local (código em `/home/user/nexorconsulting/barber`), subido em processo no localhost com banco próprio em memória, relógio controlado (terça 10/11/2026 08:00 BRT) e rede falsa de `test/ajuda.js` (Asaas, WhatsApp, SMS, Google). Pasta de trabalho dos scripts: `/tmp/claude-0/-home-user-nexorconsulting/4db1d3bf-8b4e-5a33-a0c1-2f29abc64b1b/scratchpad/banca/reteste-hacker`. Cobri os itens pedidos (V-03, V-04, V-07, V-14, V-16, V-23, V-31, V-32, V-33, V-36, V-44) e as regressões nas rotas novas (`PUT /api/eu/senha`, `GET/PUT /api/canais`, `PUT /api/app/reservas/:id`, `src/http/permissoes.js`). Não alterei nenhum arquivo do alvo. Suíte oficial do projeto: 71/71 passando.

Fora do escopo: ataque real a Asaas/Meta/Google (APIs externas, substituídas pela rede falsa); timing real do `timingSafeEqual` do V-44 (verificado por código, não por medição de microssegundos).

## Reteste dos itens (segura / falhou, com a prova)

- **V-03 · segura.** Recepção e barbeiro leem `token_webhook` só como booleano: `GET /api/eu` e `GET /api/config` → `asaas.token_webhook = true` (nunca o valor); `GET /api/canais` → 403 para os dois; `/api/assinaturas` (recepção 200, barbeiro 403) sem vazar o token. Busca pelo token literal no JSON de `/api/eu`, `/api/config`, `/api/canais` e `/api/assinaturas` da recepção e do barbeiro: não encontrado. Prova de que o token é o segredo de autenticação: `POST /webhook/asaas` sem token → 401, token errado → 401, token real (só do dono, via `/api/canais`) → 200. O token agora é gerado no servidor (24 bytes, 32 chars) e fica cifrado (`token_webhook_cripto`).
- **V-04 · segura.** Asaas ativo, assinatura paga por webhook `PAYMENT_RECEIVED` → `ativa`, `pago_ate=2026-12-09`. `PAYMENT_REFUNDED` → cobrança `cancelada` com `estornada_em`, assinatura cai para `atrasada`, `pago_ate` recua para `2026-11-09` (tira o mês pago). Reentrega do `PAYMENT_RECEIVED` (mesmo `payment.id`) → `{ok:true}` sem reativar: status segue `atrasada` (idempotência por `pago_em`, não mais por `status='paga'`).
- **V-07 · segura.** Admin em `PUT /api/usuarios/<dono> {senha}` → 403 "Só o dono pode alterar a própria conta." O dono continua logando com a senha original (200).
- **V-14 · segura.** Barbeiro com `barbeiro_id = NULL` forçado no banco (dado antigo): `GET /api/hoje` → 403, `GET /api/clientes` → 403, enquanto `GET /api/eu` → 200 e `PUT /api/eu/senha` → 400 (senha atual errada, ou seja, a rota é alcançada, não bloqueada por vínculo). O recorte vem de `semVinculo()` em `src/servidor.js:152`.
- **V-16 · segura.** 8 logins corretos seguidos no mesmo IP/e-mail: nenhum 429 (só as falhas contam). Falhas seguidas: `[401×8, 429, 429]` — o 429 só no 9º, respeitando `tentativasLogin=8`. O acerto zera o contador do e-mail.
- **V-23 · segura.** 10 pedidos de código em paralelo para o mesmo número: 5×200 e 5×429; exatamente 5 SMS saíram (teto `codigosPorHora=5`). O código é gravado antes do `await` do envio e os usados/vencidos ficam `expira_em=0` mas continuam contando por 1 h.
- **V-31 · segura.** `GET /api/clientes/%ZZ` (percent inválido) → 400 "Endereço inválido" (não 500); cookie malformado (`%E0%A4%A; %ZZ`) em `/api/estado` → 200 (não 500); agendamento em `2026-02-31` → 400 "esta data não existe no calendário".
- **V-32 · segura.** Barbeiro (Bruno) não vê cliente que só tem horário com outro barbeiro: ausente da lista e ficha dá 404; vê o próprio cliente. Teto de desconto: venda com R$40 de desconto sobre corte de R$50 (>20%) → 403 "Seu perfil pode dar até 20% de desconto"; R$5 (10%) → 200.
- **V-33 · segura.** Com `TRUST_PROXY=0` (padrão), 12 falhas de login variando o `X-Forwarded-For` a cada tentativa ainda acumulam no IP do socket: `[401×8, 429×4]`. O cabeçalho é ignorado, então não fura o limite.
- **V-36 · segura.** `POST /api/entrar` com corpo ~300 KB (acima de 256 KB) → **413** "Arquivo ou conteúdo grande demais" com `Connection: close`, sem reset de conexão.
- **V-44 · segura.** `conferirCodigo` compara o HMAC com `iguais()` (`timingSafeEqual`, `src/servicos/nucleo.js:145`). Funcional: código errado → 400, código certo → 200.

## Regressões nas rotas novas (todas seguram)

- **`PUT /api/eu/senha` · segura.** Senha atual errada → 400; troca correta → 200, a sessão que trocou segue válida (200) e as outras sessões do mesmo usuário caem (401); login com a senha nova → 200. Limite de tentativas por usuário presente.
- **`GET/PUT /api/canais` · segura.** Só dono/admin (`ADM`); barbeiro em `PUT /api/canais` → 403. `remover:["asaas"]` apaga a chave (`asaas.chave` vira `false`, `cobranca_online=false` no app).
- **`PUT /api/app/reservas/:id` · segura.** IDOR barrado pelo guarda `meu()`: atacante em `PUT` e `DELETE` da reserva da vítima → 404; a dona altera a própria → 200; quantidade 99 (> máx 5) → 400.
- **`src/http/permissoes.js` · sem regressão observada.** Tabela de papéis coerente; papel desconhecido cai no `SEM_PERMISSAO` (restrito ao próprio, sem campos, sem teto) — falha fechada.

## Achados novos

Nenhum achado explorável novo introduzido pelas correções.

### H-informativo · Token do webhook do Asaas sobrevive à remoção da chave
- Gravidade sugerida: informativa
- Onde: `src/http/api.js:587-590` (`remover`) e `src/servidor.js:233` (`webhookAsaas`).
- Observação: `remover:["asaas"]` apaga `chave_cripto`, mas mantém `token_webhook_cripto`. Depois disso, `POST /webhook/asaas` com o token antigo ainda autentica (200), embora o Asaas esteja inativo e `eventoAsaas` não ache assinatura correspondente (nenhum efeito). O token continua secreto (só dono/admin o veem em `/api/canais`), então não é explorável; é só uma inconsistência de limpeza. Sugestão opcional: apagar `token_webhook_cripto` junto ao remover o canal Asaas, ou rotacioná-lo.

## O que resistiu bem (reconfirmado)
- Autenticação do webhook Asaas (401 sem/err token, 200 com token) e segregação do segredo por papel.
- Idempotência de pagamento por `pago_em` (estorno + reentrega não renovam).
- Autorização por papel via tabela central (`permissoes.js`), incluindo barbeiro sem vínculo (falha fechada) e teto de desconto por perfil.
- Limite de login só por falha, com reset no acerto; limite de código à prova de corrida; XFF ignorado por padrão.
- 413 com resposta antes de fechar; decode de URL/cookie tolerante a malformação; datas impossíveis recusadas.
- IDOR no app barrado por posse (`meu()`), inclusive na rota nova de reservas; troca da própria senha pede a atual e derruba outras sessões.
