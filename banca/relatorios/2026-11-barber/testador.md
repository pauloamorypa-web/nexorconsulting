# Relatório do Agente Testador · Nexor Barber (/barber) · 2026-11-10
Suíte: 25 passaram / 0 falharam / 7,1 s · Rotas testadas: 83 rotas de API (todas, com e sem login, sem `x-nexor` e com dados inválidos), 2 webhooks, /health e 11 telas (9 do painel, 2 do app) · Carga: com 100 e com 500 requisições simultâneas, nenhum erro 5xx e nenhuma reserva duplicada (1.208 horários ativos). A única rota acima de 2 s foi `GET /api/clientes` com 500 simultâneas (p95 2,25 s). O login trava o servidor: 100 logins simultâneos levaram 34 s.

Ambiente: servidor em localhost:8804 com banco próprio na pasta de dados do testador, SMS falso em localhost:8814, Node 22.22. Scripts: `/tmp/claude-0/-home-user-nexorconsulting/4db1d3bf-8b4e-5a33-a0c1-2f29abc64b1b/scratchpad/banca/testador/` (e2e.mjs, corrida.mjs, corrida2.mjs, rotas.mjs, carga2.mjs, clientes2000b.mjs, falhas.mjs, porta9.mjs, buraco-teste.mjs). Nenhum arquivo do projeto foi alterado.

## Achados

### T-01 · Clique duplo em "fechar comanda" gera venda e comissão em dobro. Cancelar e "faltou" passam por cima de atendimento concluído
- Gravidade sugerida: alta
- Onde: `POST /api/agendamentos/:id/concluir` e `PUT /api/agendamentos/:id` (src/http/api.js, linhas ~194-218) e `concluir()` (src/servicos/nucleo.js). A rota lê o agendamento (`exigir`) **antes** de `await ctx.corpo()`. Depois `concluir()`/`cancelar()` conferem o status nesse objeto já lido e desatualizado, sem reler dentro da transação.
- Como reproduzir: `node corrida.mjs`. O script manda duas requisições com o corpo enviado devagar, como acontece num celular com 3G lento, e termina as duas ao mesmo tempo.
- Esperado × obtido:
  - 2× concluir no mesmo atendimento: esperado 1 venda e um 409. Obtido: **200 e 200, 2 vendas (R$ 100 em vez de R$ 50) e 2 comissões**.
  - Cancelar e concluir ao mesmo tempo: obtido agendamento **"cancelado" com venda paga** no caixa.
  - "faltou" enviado antes e concluído depois: o atendimento fica **"faltou" com `venda_id` preenchido**.
  - Na tela "Agenda de hoje" aparecem R$ 295 faturados e 0 concluídos.
- Correção sugerida: dentro de `repo.transacao`, reler o agendamento com `repo.obter` e conferir o status. Outra opção é um `UPDATE ... WHERE id = ? AND status IN (...)` que confira as linhas afetadas. No painel, desabilitar o botão enquanto a requisição está em andamento.

### T-02 · Login com scrypt síncrono congela o servidor inteiro
- Gravidade sugerida: alta
- Onde: `conferirSenha`/`gerarHashSenha` em src/seguranca.js (`scryptSync`, N=2^17, cerca de 300 ms por chamada), usados em `POST /api/entrar`, `/api/cadastro`, `/api/usuarios` e com `HASH_FALSO` quando o e-mail não existe.
- Como reproduzir: `node carga2.mjs` (bloco final). Ele faz 20 e depois 100 `POST /api/entrar` simultâneos com e-mails diferentes e mede o `/health` durante os logins.
- Esperado × obtido: esperado que o login não atrapalhe as outras rotas. Obtido:
  - 20 logins: p95 de 6,3 s, e o `/health` chegou a **6,2 s**.
  - 100 logins: média de 17 s, p95 de **33 s**, total de 34 s, com o `/health` até 3,6 s.
  - Durante esse tempo, o app do cliente e a agenda ficam parados. Com o T-05, qualquer um consegue repetir isso de fora.
- Correção sugerida: usar `crypto.scrypt` assíncrono (roda no pool de threads) com um limite de concorrência. Aplicar o limite por IP/e-mail antes de calcular o hash. Avaliar se N=2^17 cabe no servidor de produção.

### T-03 · A busca e os filtros de clientes ignoram quem passou do 2.000º cliente
- Gravidade sugerida: média
- Onde: `GET /api/clientes` (src/http/api.js ~248). A rota faz `SELECT ... ORDER BY nome LIMIT 2000` e só **depois** filtra por nome, celular, e-mail, assinantes, sumidos e aniversário, em JavaScript.
- Como reproduzir: `node clientes2000b.mjs`, com cerca de 2.100 clientes cadastrados e a cliente "Zuleica Ultima" (celular 34993334444). Depois `GET /api/clientes?busca=zuleica` e `?busca=34993334444`.
- Esperado × obtido: esperado 1 resultado. Obtido **0** nas duas buscas. Com 1.600 clientes, a mesma busca achava a cliente.
- Correção sugerida: filtrar no SQL (`WHERE nome LIKE ? OR fone LIKE ?` e os filtros) e só então aplicar `LIMIT`/paginação.

### T-04 · `GET /api/clientes` passa de 2 s sob carga
- Gravidade sugerida: média
- Onde: `GET /api/clientes` (mesma causa do T-03: carrega até 2.000 linhas para devolver 300).
- Como reproduzir: `node carga2.mjs` com cerca de 1.800 clientes.
- Esperado × obtido: esperado menos de 2 s. Com 100 simultâneas: média de 224 ms e p95 de 440 ms. Com 500 simultâneas: média de 1,19 s, **p95 de 2,25 s e 71 respostas acima de 2 s**. As outras rotas ficaram abaixo de 1,5 s.
- Correção sugerida: a mesma do T-03, com paginação e filtro no banco.

### T-05 · Os limites por IP caem trocando o cabeçalho X-Forwarded-For
- Gravidade sugerida: média
- Onde: `ipCliente()` em src/servidor.js e `TRUST_PROXY` com padrão 1 em src/config.js. Por causa disso, o servidor confia no XFF mesmo quando não há proxy na frente.
- Como reproduzir: 11× `POST /api/app/codigo` com `X-Forwarded-For: 10.1.1.1`: a 11ª recebe 429. Com `X-Forwarded-For: 10.1.1.2`, recebe 200 de novo (`carga.mjs`). Foi assim que criei 600 clientes logados em 4,9 s.
- Esperado × obtido: esperado 429 por IP real. Obtido: o limite é contornado nos códigos (custo de SMS/WhatsApp), no login, no cadastro e na verificação.
- Correção sugerida: deixar `TRUST_PROXY=0` como padrão e ligar só quando houver proxy (documentado no manual). O limite de 5 códigos por celular por hora continua valendo e está correto.

### T-06 · Com WhatsApp/SMS fora, os lembretes se perdem e a rotina fica presa
- Gravidade sugerida: média
- Onde: `rotina()` em src/servicos/nucleo.js. Ela marca `lembrete_em` **antes** de enviar e manda uma mensagem por vez, com timeout de 20 s por canal (`pedir` em src/servicos/canais.js). Não há trava contra duas rotinas ao mesmo tempo (`setInterval` em src/servidor.js).
- Como reproduzir: SMS apontado para um servidor que aceita a conexão e nunca responde (`buraco.mjs`, porta 8815), 3 horários marcados nas próximas 3 h, depois `POST /api/rotina` (`buraco-teste.mjs`).
- Esperado × obtido:
  - Esperado: o lembrete é tentado de novo quando o canal volta, e a rotina responde rápido.
  - Obtido: `POST /api/rotina` levou **60 s** (20 s × 3).
  - Os 3 lembretes ficaram com `lembrete_em` marcado e envio com status "erro". Uma 2ª rotina não tenta de novo (**lembrete perdido**).
  - `POST /api/app/codigo` deixa o cliente esperando **20 s** antes do 502.
- Correção sugerida: marcar `lembrete_em` só se o envio der certo, ou guardar as tentativas com um limite. Usar timeout curto (5 s) para mensagens, enviar em paralelo com limite e travar a rotina para não rodar duas ao mesmo tempo.

### T-07 · Não dá para desligar o Asaas pelo painel. Depois de configurado, a assinatura pelo app depende dele
- Gravidade sugerida: média
- Onde: `PUT /api/canais` (src/http/api.js ~505). `novoSegredo("")` mantém a chave antiga, e o mesmo vale para os tokens do WhatsApp e do SMS. A tela de configurações não tem a opção "remover".
- Como reproduzir: `PUT /api/canais {"asaas":{"chave":"$aact_x"}}` e depois `{"asaas":{"chave":""}}`. `GET /api/config` continua com `asaas.chave: true`. Em seguida, `POST /api/assinaturas` sem CPF recebe 400 "Informe o CPF", e com o Asaas fora o app recebe **502 em toda assinatura**.
- Esperado × obtido: esperado poder voltar a "pagar no balcão". Obtido: não há como remover pela API ou pela tela.
- Correção sugerida: tratar `null` (ou um campo `remover: true`) como apagar o segredo e mostrar o botão "Remover" na configuração.

### T-08 · Pagamento de assinatura sem proteção contra envio duplo
- Gravidade sugerida: média
- Onde: `POST /api/assinaturas/:id/pagamento` → `registrarPagamento` (src/servicos/nucleo.js).
- Como reproduzir: `node corrida2.mjs`, que manda dois pagamentos "pix" ao mesmo tempo para a mesma assinatura.
- Esperado × obtido: esperado 1 pagamento. Obtido 200 e 200, **2 cobranças pagas de R$ 89,90** e o ciclo estendido 2 meses (até 08/02/2027). O mesmo acontece com dois cliques seguidos.
- Correção sugerida: usar uma chave de idempotência vinda do painel ou recusar um 2º pagamento em poucos segundos sem confirmação. Desabilitar o botão enquanto envia.

### T-09 · `GET /api/hoje` sem `?dia=` devolve 400
- Gravidade sugerida: baixa
- Onde: src/http/api.js ~132: `validar(dia.optional(), query.get("dia") || undefined)`. Como `validar` usa `dados ?? {}`, `undefined` vira `{}` e a validação falha.
- Como reproduzir: `GET /api/hoje` logado como dono ou barbeiro.
- Esperado × obtido: esperado a agenda de hoje. Obtido 400 "dados: Invalid input: expected string, received object". O painel não é afetado porque sempre manda `?dia=`, mas integrações e chamadas futuras quebram.
- Correção sugerida: `validar(dia, query.get("dia") || hoje())`, como fazem as outras rotas.

### T-10 · `%` malformado na URL da API gera 500
- Gravidade sugerida: baixa
- Onde: `encontrar()` em src/http/roteador.js:73 (`decodeURIComponent` sem try).
- Como reproduzir: `GET /api/clientes/%E0%A4%A` (logado).
- Esperado × obtido: esperado 400/404. Obtido **500 "Erro interno."** com URIError no log.
- Correção sugerida: envolver o decode em try/catch e responder 400.

### T-11 · Corpo acima de 256 KB derruba a conexão sem responder 413
- Gravidade sugerida: baixa
- Onde: `lerCorpo()` em src/http/roteador.js. O `req.destroy()` corta o socket antes do `json(res, 413)`.
- Como reproduzir: `POST /api/clientes` com um nome de 300 KB (`rotas2.mjs`).
- Esperado × obtido: esperado 413 "Arquivo ou conteúdo grande demais.". Obtido: a conexão fecha sem resposta (`UND_ERR_SOCKET`) e o painel mostra um erro genérico de rede.
- Correção sugerida: parar de ler (`req.unpipe`/`req.resume`), responder 413 com `Connection: close` e só então fechar.

### T-12 · Mensagens de falha externa pouco claras e nenhum aviso no painel
- Gravidade sugerida: baixa
- Onde: `/api/canais/testar` ("Falhou: fetch failed"), `/api/nexor/vincular` (400 "fetch failed") e `/api/app/codigo`.
  - Com SMS fora, o código responde "Tente pelo WhatsApp" mesmo com o WhatsApp desligado.
  - Quando o canal cai, o painel (`/api/eu`) não mostra aviso nenhum: as falhas só aparecem em `/api/envios`.
- Como reproduzir: `porta9.mjs` e `falhas.mjs`.
- Esperado × obtido: esperado uma mensagem em português dizendo qual serviço está fora e um alerta no painel. Obtido o texto técnico `fetch failed` e nenhum alerta.
- Correção sugerida: traduzir os erros de rede ("Não foi possível falar com o Twilio/Meta/Asaas"), sugerir o outro canal só se ele estiver ativo e mostrar no painel uma contagem de envios com erro nas últimas 24 h.

### T-13 · Encaixe pelo painel aceita horário que já passou
- Gravidade sugerida: informativa
- Onde: `POST /api/agendamentos` com `encaixe: true`.
- Como reproduzir: às 21h, agendar hoje às 19:00 com `encaixe: true`: recebe 200 e o horário entra como "agendado".
- Esperado × obtido: pode ser intencional (lançar um atendimento já feito), mas o horário fica "agendado" no passado e conta na ocupação.
- Correção sugerida: confirmar a regra com o produto. Se for intencional, criar o atendimento já como "em_atendimento".

### T-14 · O papel de barbeiro vê a base inteira de clientes e pode dar 100% de desconto
- Gravidade sugerida: informativa
- Onde: `GET /api/clientes` (sem restrição de papel) e `POST /api/vendas` (o barbeiro lança venda de balcão).
- Como reproduzir: logado como barbeiro, `GET /api/clientes` lista todos, com celular. `POST /api/vendas {"itens":[{"tipo":"servico",...}],"desconto_centavos":5000}` recebe 200 com total R$ 0.
- Esperado × obtido: depende da política. Vale confirmar com o dono se o barbeiro pode exportar a carteira de clientes e zerar a comanda.
- Correção sugerida: limitar o desconto por papel (por exemplo, até X%) e decidir se o barbeiro vê só os clientes dele.

### T-15 · O limite de login por e-mail permite bloquear o dono
- Gravidade sugerida: informativa
- Onde: `limitar(\`login:${email}\`)` em src/http/api.js: 8 tentativas em 15 min, vindas de qualquer IP.
- Como reproduzir: durante os testes, depois de 8 logins do dono em 15 min, o próximo foi recusado. Um terceiro consegue repetir isso com senhas erradas e manter o dono fora do painel.
- Correção sugerida: contar só as tentativas **erradas**, zerar depois de um login certo e combinar com o IP.

### T-16 · Assinatura no Asaas pode ficar órfã quando falha no meio (só no código, não reproduzido)
- Gravidade sugerida: informativa
- Onde: `assinar()` em src/servicos/nucleo.js e `criarAsaas().assinar` em src/servicos/canais.js. São 3 chamadas (customers → subscriptions → payments). Se a 3ª falhar, a assinatura local vira "cancelada", mas a do Asaas continua criada e cobrando.
- Como reproduzir: não reproduzido (não há Asaas de teste disponível). Com o Asaas totalmente fora, o comportamento está correto: 502 "Não foi possível gerar a cobrança" e a assinatura local é cancelada.
- Correção sugerida: no `catch`, se `s.id` já existir, chamar `asaas.cancelar(s.id)`.

## Sem teste automatizado
Cobertura medida com `--experimental-test-coverage`: api.js 83% das linhas e 60% das funções, servidor.js 78%, app.js 91%, nucleo.js 92%.
1. Concorrência e clique duplo: concluir, cancelar, status e pagamento de assinatura (T-01, T-08). Não existe nenhum teste com requisições ao mesmo tempo.
2. `GET /api/clientes` com busca e filtros, sobretudo acima de 2.000 clientes (T-03). Também não têm teste `GET`/`PUT /api/clientes/:id`.
3. `PUT /api/config`: horário, exceções, regras, marca e validação de passo/turnos. A rota inteira está sem teste.
4. Rotina com canal falhando: lembrete que não sai, timeout e duas rotinas ao mesmo tempo (T-06).
5. `PUT /api/agendamentos/:id` remarcando pelo painel com troca de barbeiro, `GET /api/agendamentos` (semana) e `GET /api/horarios` (painel).
6. `GET`/`DELETE /api/bloqueios` e `DELETE /api/espera/:id` (painel).
7. Cadastro do catálogo: `POST`/`PUT /api/servicos`, `PUT /api/planos`, `PUT /api/produtos` e `POST /api/produtos/:id/estoque` (ajuste negativo).
8. `PUT /api/usuarios/:id` (troca de senha derruba as sessões, desativar acesso) e `GET /api/vendas`.
9. App do cliente: `remarcar`, `POST /agendamentos/:id/reservas`, `DELETE /api/app/reservas/:id`, `DELETE /api/app/espera/:id`, `POST /api/app/sair` e o caminho de 502 do Google.
10. `/api/canais/testar` com SMS e com erro (502), e a remoção de segredos em `PUT /api/canais` (T-07).
11. Relatórios: ranking de serviços e produtos (`top_servicos`/`top_produtos`) e período longo.
12. Erros de protocolo: URL malformada (T-10), corpo grande demais (T-11) e `GET /api/hoje` sem dia (T-09).
13. Webhook do WhatsApp: a resposta automática com o link do app (laço em servidor.js) e o limite de "uma vez por dia por número".
14. Banco cheio ou sem espaço em disco: não testado nesta rodada (precisa de um volume pequeno montado). Nenhum teste cobre esse caso.

## O que passou
- **Suíte existente:** 25/25 em 7,1 s, sem testes instáveis.
- **Fluxo de ponta a ponta:**
  - Cadastro (um 2º cadastro é recusado com 403), configuração, barbeiros, plano, produtos e SMS.
  - Cliente entra por código SMS; código errado dá 400 e o nome "Cliente" é recusado.
  - Dias e horários livres, agendamento com reserva de produto, horário ocupado some da lista e outro cliente recebe 409 no mesmo horário.
  - .ics, reserva extra, recusa acima do estoque (409), cancelamento de reserva, "estou chegando" recusado a mais de 2 h, remarcação, lista de espera (duplicada → 409, faixa invertida → 400) e limite de 3 horários futuros.
  - Assinatura no balcão; pagamento ativa o clube e o app mostra o corte coberto.
  - No painel: agendar, chegou, em atendimento, concluir com produto (caixa e comissão corretos), venda de balcão, cancelamento de venda com estorno de estoque, estoque negativo recusado, folga que zera horários e avisa quantos clientes estão no período, clientes (celular duplicado → 409, celular inválido → 400), serviço inativo some do app, relatórios, auditoria e envios.
- **Permissões:**
  - As 83 rotas devolvem 401 sem login (exceto as públicas), e toda requisição que não é GET sem `x-nexor` recebe 403.
  - A recepção não vê relatórios. O barbeiro vê só a própria agenda e não mexe em agendamento de outro (403).
  - Um cliente não cancela nem baixa o .ics de outro (404). Sair invalida a sessão (painel e app).
  - Segredos (tokens, hash de senha) não aparecem em nenhuma resposta.
- **Dados inválidos:** 0 respostas 5xx em todas as rotas com JSON quebrado, tipos errados, objetos com `__proto__`, datas impossíveis, ids inexistentes e busca de 5.000 caracteres (exceção: T-10). Path traversal nos estáticos (`/../../etc/passwd`, `%2f`) não vaza arquivos. Os webhooks recusam assinatura ou token errados (401/403/405).
- **Telas (Playwright):** 9 telas do painel e o app no celular (390 px) sem erros de JavaScript, sem respostas 4xx/5xx e sem rolagem horizontal.
- **Carga:**
  - 100 simultâneas: todas as rotas principais com p95 abaixo de 0,5 s e 0 erros.
  - 500 simultâneas: `hoje` p95 0,33 s, `app/horarios` 0,27 s, `agendar` no painel 1,40 s e no app 1,20 s, misto 0,93 s, com 0 erros 5xx.
  - **Disputa pelo mesmo horário:** com 100 e com 500 clientes ao mesmo tempo, exatamente 1 venceu e os outros receberam 409.
  - Nenhuma sobreposição nos 1.208 horários ativos depois da carga.
- **Falhas externas (porta fechada: SMS em `localhost:9`, Google e Central em `localhost:9`, WhatsApp e Asaas inalcançáveis):**
  - O servidor continua de pé e o `/health` responde em ~2 ms.
  - Agendar continua funcionando (200 em ~10 ms), com a confirmação registrada como "erro" em `envios`.
  - O código por SMS ou WhatsApp responde 502 com mensagem; o login Google responde 502 "Tente pelo WhatsApp".
  - A assinatura via Asaas responde 502, e a assinatura local é cancelada (sem lixo pendente). O vínculo com a Central responde 400 e a rotina responde 200.
  - Com o provedor **pendurado** (aceita a conexão e não responde), o servidor também continua de pé; os problemas desse caso estão no T-06.
