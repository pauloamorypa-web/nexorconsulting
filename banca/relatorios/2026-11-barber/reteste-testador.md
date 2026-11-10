# Relatório do Agente Testador · Nexor Barber (reteste) · 2026-11-10
Suíte: 71 passaram / 0 falharam / 40,4 s (em f86a18f; repetida em 02f01a0, que entrou durante o reteste: 71/0/39,8 s) · Rotas testadas: 24 · Carga: `/api/clientes` com 500 simultâneas p95 1,28 s; `/health` p95 3 ms durante 100 logins; `/api/hoje` com 500 simultâneas p95 222 ms; disputa de 500 pedidos pelo mesmo horário termina com 1 vencedor.

Ambiente: código atual em `localhost:8812`, banco em arquivo em `scratchpad/banca/reteste-testador/dados`. Meta, Twilio e Asaas falsos de `test/ajuda.js`, mais três modos de falha: 500, porta fechada (127.0.0.1:9) e provedor que não responde. Os scripts estão em `scratchpad/banca/reteste-testador/scripts` (`t-corridas.mjs`, `t-carga.mjs`, `t-v17.mjs`, `semear-antigo.mjs`, `migrar-atual.mjs`). Não alterei nada no alvo. O worktree temporário foi removido.

## Itens do reteste (uma linha por item)
- **V-01 · seguro.** 16 rodadas com 4 pedidos de corpo lento cada (concluir pelo dono, concluir pela recepção, cancelar e "faltou"), com ordem de chegada aleatória. Em todas as rodadas: um 200 e três 409, nenhum 500. 10 atendimentos concluídos geraram 10 vendas, 10 baixas de estoque e 20 comissões. Os 6 cancelados ou "faltou" ficaram com 0 venda.
- **V-02 · seguro.** 20 assinaturas, cada uma com 5 pagamentos manuais simultâneos (2 de corpo lento e 3 normais, de dois usuários). Em todas: `200,409,409,409,409`, 1 cobrança paga e `pago_ate` com um mês só.
- **V-05 · seguro.** 9 clientes no app e 20 no painel, 4 pedidos de assinar ao mesmo tempo por cliente (2 de corpo lento). Os 4 recebem 200 com a mesma assinatura. Cada cliente ficou com 1 assinatura vigente. Foram 29 `POST /subscriptions` para 29 clientes e nenhuma assinatura órfã.
- **V-10 · seguro (o servidor não congela).** Com 100 logins simultâneos, o `/health` respondeu 304 amostras com média de 1 ms, p95 de 3 ms e máximo de 28 ms (antes chegava a 6,2 s). O login em si continua lento sob rajada: p95 de 13,2 s, 34 respostas 503 e 58 acima de 2 s (ver T-03).
- **V-15 · seguro na base inteira e no tempo; falha parcial na busca sem acento.** Com 2.100 clientes, "zuléica" e "ZULÉICA" acham "Zuléica Souza" (o 2.100º). Também funcionam celular, "100%" com escape, `%` e `_`, 300 por página e página 9 vazia. Carga com metade das buscas filtradas: 100 simultâneas com p95 de 362 ms; 500 simultâneas com p95 de 1.276 ms, máximo de 1.348 ms, 0 erros e 0 acima de 2 s (antes 2,25 s). Já "zuleica", sem acento, devolve 0 resultado (T-01).
- **V-17 · falhou em parte.** O que funciona:
  - Com o canal fora (500 ou porta fechada) o lembrete volta para a fila.
  - A trava funciona: com o provedor sem resposta, 1 rotina rodou por 40 s e as outras 3 responderam `{ocupada:true}`.
  - O `/api/hoje` ficou com p95 de 4 ms durante esses 40 s.
  - Quando o canal voltou, os 16 lembretes pendentes saíram 1 vez cada.

  O que falha: 4 rotinas em sequência rápida durante uma queda curta (4 cliques em "Rodar rotina", ou relógio mais clique) gastam as 3 tentativas em cerca de 200 ms. Os 16 lembretes ficaram perdidos e 0 saiu quando o canal voltou (T-02).
- **V-08 · seguro.**
  - Pago em 10/11, depois adiantado em 05/12: o ciclo continua em 10/11 a 09/12, `pago_ate` vai para 09/01 e o cliente segue coberto em 05/12 e 08/12. A barba de dezembro fica liberada em 12/12.
  - Uma 2ª renovação adiantada (+30 min, com outra chave) leva `pago_ate` a 09/02.
  - Em 20/01 o ciclo virou sozinho para 10/01 a 09/02, com cobertura.
  - A migração de um banco antigo com ciclo "pulado" voltou ao ciclo correto: 10/11 a 09/12, pago até 09/01.
- **V-24 · seguro.**
  - Faixa de 31 dias: 200. Faixas de 32 e 365 dias, `ate` sozinho a 3 anos e faixa invertida: 400 com mensagem em português. Data inexistente: 400.
  - Os 18 índices existem.
  - `pagina=0`, `-5` e `abc` em `/api/assinaturas` caem na página 1, sem 500.
- **V-35 · seguro.** `/api/hoje` sem `?dia=` e com `?dia=` vazio: 200 com o dia de hoje (2026-11-10). `2026-02-30` e `lixo`: 400.
- **Disputa por horário · segura.** 500 `POST /api/agendamentos` simultâneos no mesmo horário: exatamente 1 com 200 e 499 com 409 ("Esse horário acabou de ser ocupado"), 1 linha gravada, total de 1,04 s e p95 de 994 ms. No app, 9 clientes no mesmo horário: 1 com 200 e 8 com 409. Outros 50 pedidos com sobreposição parcial (14:45 e 15:15 sobre 15:00–15:45): 50 com 409. O banco ficou sem nenhum par de horários sobrepostos.
- **Migração de banco da versão anterior (cd3c4b1) · segura, com 2 ressalvas (T-04 e T-05).** Usei um banco criado pelo código antigo com:
  - assinatura pendente no Asaas;
  - assinatura renovada antes da hora;
  - assinatura duplicada vigente;
  - venda duplicada da mesma comanda (corrida do V-01);
  - venda avulsa;
  - token antigo do webhook em texto puro (32 caracteres);
  - sessão antiga do dono.

  O código atual abriu esse banco 2 vezes sem erro:
  - O token foi cifrado e o texto puro saiu da configuração. O webhook com o token antigo respondeu 200 e ativou a assinatura pendente. Um token errado recebeu 401.
  - Com a sessão antiga, as 13 rotas do painel responderam 200.
  - A rotina rodou.
  - Os índices únicos ficaram pendentes (aviso no console e na auditoria). Depois que cancelei a venda e a assinatura duplicadas pelo painel, a 2ª abertura criou os 2 índices.

  Na cópia com token curto (`abc123`), o token foi trocado por um novo e o webhook passou a responder 401, como projetado.
- **Falhas externas · seguro.**
  - Asaas com porta fechada: assinar responde 502 em 7 ms, com mensagem em português.
  - Asaas sem resposta: 502 em 20 s. O `/health` continuou 200.
  - "Testar WhatsApp" com porta fechada: 502 com mensagem clara.

## Achados
### T-01 · Busca de clientes sem acento não acha nome com acento
- Gravidade sugerida: média
- Onde: `GET /api/clientes?busca=`, `src/http/api.js` (rota de clientes) e a função `minusculas` em `src/db.js`
- Como reproduzir: crie 2.100 clientes, um deles "Zuléica Souza", e chame `/api/clientes?busca=zuleica`. O mesmo vale para "joao" contra "João".
- Esperado × obtido: esperado 1 resultado; obtido 0. Só "zuléica", com acento, acha. Quem digita no celular costuma omitir o acento, e a recepção conclui que o cliente não existe e cria uma duplicata.
- Efeito secundário: `ORDER BY c.nome` é binário, então nomes que começam com acento ("Ágata", "Érica") vão para o fim da lista, depois de "Z" (estavam na página 8 de 8).
- Correção sugerida: uma função `semAcento` (`normalize("NFD").replace(/\p{M}/gu, "")` + `toLowerCase`) usada no `LIKE` e no `ORDER BY`, ou uma coluna `nome_busca` com índice preenchida na gravação.

### T-02 · As 3 tentativas do lembrete são gastas em segundos; uma queda de 15 min perde os lembretes
- Gravidade sugerida: média
- Onde: `src/servicos/nucleo/rotina.js` (lembretes, `MAX_TENTATIVAS_LEMBRETE`) e `POST /api/rotina`
- Como reproduzir: 16 agendamentos dentro da janela do lembrete, Meta e Twilio devolvendo 500, e 4 chamadas a `POST /api/rotina` em sequência rápida. Depois disso, `lembrete_tentativas = 3` e `lembrete_em` preenchido nos 16. Com o canal de volta, a rotina envia 0.
- Esperado × obtido: esperado um intervalo mínimo entre tentativas, com uma última tentativa perto do horário. Obtido: a trava só impede rotinas sobrepostas; não impede rotinas seguidas. No relógio normal (5 min), uma queda de cerca de 15 min da Meta perde todos os lembretes da janela, sem aviso no painel. Só sobra o registro de envios.
- Correção sugerida: guardar `lembrete_proxima_em` com espera crescente (5, 15 e 45 min, limitada a `inicio - 30 min`). Não contar tentativa quando a rotina roda antes desse prazo. Mostrar no painel "N lembretes não enviados".

### T-03 · Login sob rajada: a fila do scrypt rejeita logins legítimos
- Gravidade sugerida: baixa
- Onde: `POST /api/entrar`, `src/seguranca.js` (fila de 2 cálculos e 64 em espera)
- Como reproduzir: 100 `POST /api/entrar` simultâneos (75 válidos de 3 usuários e 25 com e-mail inexistente), sem esperar entre eles.
- Esperado × obtido: o servidor continua de pé (o `/health` teve p95 de 3 ms, então o V-10 está resolvido). Mas 34 pedidos receberam 503, o p95 do login foi 13,2 s e o máximo 14,1 s. O 503 cai em qualquer pedido, inclusive nos válidos. O limite é por e-mail + IP (V-16), então de um IP só dá para manter a fila cheia variando o e-mail, e o dono não consegue entrar enquanto isso durar.
- Correção sugerida: um limite por IP, contado antes de entrar na fila (por exemplo, 3 cálculos em andamento por IP). Opcionalmente, baixar o N para 2^15 com `maxmem` ajustado, para encurtar a fila.

### T-04 · O token curto do webhook é trocado em silêncio na migração
- Gravidade sugerida: média
- Onde: `migrarConfig` em `src/servicos/nucleo.js` e a tela Configurações > Canais (`public/js/views/config.js`)
- Como reproduzir: banco da versão cd3c4b1 com `asaas.token_webhook = "abc123"`. Abra com o código atual e envie um evento do Asaas com o token antigo.
- Esperado × obtido: esperado um aviso visível no painel ("cole o novo token no Asaas") até a troca ser feita. Obtido: só uma linha na Auditoria (`token_webhook_asaas_trocado`). Daí em diante, todos os pagamentos do Asaas recebem 401, o clube não renova e as assinaturas ficam "atrasadas", sem nenhum alerta. O Asaas acaba pausando a fila do webhook depois de várias falhas.
- Correção sugerida: uma faixa de alerta no painel (como a do Suporte Nexor) enquanto existir esse registro sem confirmação. Ou registrar no envio de saúde e contar os 401 do webhook.

### T-05 · A pendência da migração não aparece no painel e não sai depois de corrigida
- Gravidade sugerida: baixa
- Onde: `migrar` em `src/db.js` (`migracao_pendente`) e a tela de Auditoria
- Como reproduzir: banco antigo com venda e assinatura duplicadas. Abra, cancele as duplicadas pelo painel e abra de novo.
- Esperado × obtido: o índice é criado na 2ª abertura (correto). Mas o aviso só existe no console e na Auditoria, onde ninguém procura, e o registro antigo continua lá sem nenhum "resolvido". Enquanto a pendência existe, o banco não impede uma nova venda duplicada nem uma nova assinatura duplicada.
- Correção sugerida: mostrar a pendência no painel com links para os registros e auditar `migracao_resolvida` quando o índice for criado.

### T-06 · A rotina leva cerca de 2,5 s por lembrete quando o canal não responde
- Gravidade sugerida: informativa
- Onde: `src/servicos/nucleo/rotina.js` e `src/servicos/canais.js` (5 s no WhatsApp e mais 5 s no SMS, 4 em paralelo)
- Medido: 16 lembretes com Meta e Twilio sem resposta levaram 40 s com a trava presa. Com cerca de 120 lembretes na janela, uma rodada passa dos 5 min do intervalo, e as rodadas do relógio são puladas (`ocupada`). Não perde dados.
- Correção sugerida: depois de 2 tempos esgotados seguidos no mesmo provedor, pular o restante da rodada (disjuntor).

## Sem teste automatizado
1. Busca sem acento e ordenação com acento em `/api/clientes` (T-01).
2. Tempo entre tentativas do lembrete e várias rotinas seguidas durante uma queda (T-02). O teste do V-17 cobre só rotinas exatamente simultâneas.
3. Abrir um banco gerado pela versão anterior de verdade. Os testes de migração atuais montam o banco antigo à mão e não cobrem a sessão antiga, o webhook com o token migrado nem a assinatura renovada antes da hora vinda do código antigo.
4. Rajada de logins acima da fila (o 503) e o limite por IP (T-03).
5. Disputa por horário com muitos pedidos e sobreposição parcial. Hoje há o V-38 (mesmo cliente) e a corrida de 2.
6. Asaas sem resposta (20 s) no assinar, e o tempo que o app do cliente fica esperando.

## O que passou
- `npm test`: 71/71, em f86a18f e em 02f01a0.
- V-01, V-02, V-05, V-08, V-24, V-35 e a disputa por horário estão seguros sob concorrência, com conferência no banco.
- V-10: o servidor não congela.
- V-15: a busca alcança a base inteira e o p95 fica abaixo de 2 s com 500 simultâneas.
- V-17: a parte de reenfileirar, a trava e o texto estão corretos.
- Migração da versão cd3c4b1: sobe, é idempotente, cifra o token, mantém sessões e webhook e cria os índices depois da correção.
- Falhas externas (Asaas e WhatsApp fora) não derrubam o servidor e mostram mensagem em português.
- Nenhum 500 em toda a rodada.
