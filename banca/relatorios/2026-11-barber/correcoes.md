# Correções da Banca · Nexor Barber (barber/) · 2026-11-10

Fase 2, rodada 1: lotes 1 e 2 (aprovação do responsável: "Aprovou todos os lotes!"; nesta rodada só os lotes 1 e 2).
Ordem: V-07, V-03, V-01, V-02, V-04, V-05, V-06, V-08 (+ V-18, V-19), V-09, V-13, V-14, V-10, V-11, V-12.

Suíte antes de começar: `npm test` com 25 de 25 passando.

Testes novos ficam em `barber/test/correcoes.test.js` (um teste por item, com o nome do item).

## V-07 · Admin troca a senha do dono · corrigido
- Mudança:
  - `PUT /api/usuarios/:id` responde 403 quando o alvo é o dono e quem pede não é o próprio dono.
  - Ninguém troca a própria senha por essa rota (400). Para isso existe a rota nova `PUT /api/eu/senha { atual, nova }`, que confere a senha atual, tem limite de tentativas, encerra as outras sessões e audita.
  - Painel: botão "Trocar minha senha" (ícone de escudo) no rodapé do menu lateral.
- Arquivos: `barber/src/http/api.js`, `barber/public/js/app.js`.
- Teste: `test/correcoes.test.js` › "V-07: …". Antes: falhava (PUT da senha do dono feito por admin respondia 200). Depois: passa.
- Suíte: 26 de 26.

## V-03 · Token do webhook do Asaas entregue à recepção e ao barbeiro · corrigido
- Mudança:
  - `configPublica` (usada em `/api/config` e `/api/eu`, que toda a equipe lê) agora devolve só `true/false` em `asaas.token_webhook` e `whatsapp.verificacao`.
  - Rota nova `GET /api/canais`, só para dono e admin, com os dois valores que precisam ser colados na Meta e no Asaas (`configCanais`). `PUT /api/canais` devolve o mesmo formato. A aba Canais do painel passou a ler essa rota.
  - O token do Asaas só é gerado no servidor (24 bytes aleatórios, 32 caracteres) e fica cifrado (`asaas.token_webhook_cripto`, AES-GCM do cofre). O campo `token_webhook` vindo do painel é ignorado. O webhook recusa tokens com menos de 24 caracteres, o que também resolve o literal "false".
  - Opção nova "Gerar um token novo para o webhook do Asaas" na aba Canais (`asaas.novo_token_webhook: true`), com auditoria.
  - Migração idempotente (`nucleo.migrarConfig()`, chamada em `montarAplicacao`): um token antigo em texto puro com 24 ou mais caracteres é cifrado e continua valendo (sem quebrar o Asaas já configurado). Um token curto, "true" ou "false" é trocado por um novo e a troca é auditada.
- Decisão anotada: a migração **não** troca sozinha os tokens bons, porque isso pararia os pagamentos até alguém colar o token novo no Asaas. Como a equipe já pôde ver o token, **recomendo que o dono use "Gerar um token novo" depois de atualizar** e cole o novo no Asaas.
- Arquivos: `barber/src/http/validacao.js`, `barber/src/http/api.js`, `barber/src/servicos/nucleo.js`, `barber/src/servidor.js`, `barber/public/js/views/config.js`. Teste existente ajustado: `barber/test/seguranca.test.js` (a verificação do WhatsApp agora vem de `/api/canais`, mudança intencional).
- Teste: `test/correcoes.test.js` › "V-03: …" (recepção e barbeiro sem token, 403 em `/api/canais`, token cifrado no banco, token curto recusado, rotação, migração de banco antigo duas vezes). Antes: falhava. Depois: passa.
- Suíte: 27 de 27.

## V-01 · Comanda fechada duas vezes; cancelar ou "faltou" por cima de atendimento concluído · corrigido
- Mudança:
  - `PUT /api/agendamentos/:id` e `POST /api/agendamentos/:id/concluir` leem o corpo **antes** de buscar o agendamento.
  - `concluir()` e `cancelar()` releem o agendamento dentro de `repo.transacao` (BEGIN IMMEDIATE) e conferem o status ali. A troca de status do PUT também roda numa transação, com releitura.
  - Índice único parcial novo: `vendas_agendamento_paga ON vendas(agendamento_id) WHERE status='paga' AND agendamento_id IS NOT NULL`.
  - Criei a estrutura de migração que faltava: `migrar()` em `src/db.js`, idempotente e executada a cada abertura do banco. Se um banco antigo já tiver venda paga duplicada, o índice **não** é criado (o sistema sobe normalmente), o aviso vai para o log e a pendência vai para a auditoria (`migracao_pendente`, com os ids). O índice é criado sozinho na abertura seguinte, depois que a venda duplicada for cancelada pelo painel. Assim, o estoque e a comissão voltam pelo caminho normal.
  - Botão "Fechar comanda": o `acao()` do painel já desabilita o botão durante a requisição. Não precisou mudar nada.
- Decisão anotada: a migração não cancela vendas duplicadas sozinha, porque isso mexeria em dinheiro sem ninguém olhar. A correção fica com o dono, pela auditoria.
- Arquivos: `barber/src/db.js`, `barber/src/http/api.js`, `barber/src/servicos/nucleo.js`, `barber/test/ajuda.js` (helper `lenta()`, uma requisição com corpo lento para reproduzir a corrida).
- Testes: `test/correcoes.test.js`:
  - "V-01: comanda fechada duas vezes…": 2× concluir, cancelar e faltou ao mesmo tempo, com corpo lento. Antes: 2 vendas. Depois: 1 venda, estoque baixado uma vez e o banco recusa uma 2ª venda paga.
  - "V-01: migração do índice único…": banco em arquivo com duplicata, reaberto 3 vezes.
  - Os dois falhavam antes e passam depois.
- Suíte: 29 de 29.

## V-02 · Pagamento manual da assinatura sem proteção contra envio duplo · corrigido
- Mudança:
  - Função nova `nucleo.pagamentoManual()`, usada por `POST /api/assinaturas/:id/pagamento`, que agora lê o corpo antes do registro:
    - Aceita uma chave de idempotência `chave`, que o painel gera a cada janela "Registrar pagamento" e grava como `externo_id = manual:<chave>`. O mesmo pedido reenviado devolve 200 sem registrar de novo.
    - Recusa (409) um 2º pagamento manual da mesma assinatura em 5 minutos.
    - Tem uma trava em memória por assinatura enquanto fala com o Asaas.
    - Com Asaas ligado e uma cobrança aberta lá, dá baixa nela (`POST /payments/{id}/receiveInCash`) e marca essa mesma cobrança como paga, sem criar outra. Se o Asaas falhar, responde 502 e nada é registrado.
  - Coluna nova `cobrancas.registrado_por` (migração `ADD COLUMN` idempotente), para separar o pagamento lançado no balcão do que veio do Asaas.
  - Painel (`clube.js`): a janela de pagamento manda a chave, e o botão já fica desabilitado durante o envio.
- Decisão anotada: a janela de 5 minutos impede lançar dois meses seguidos no mesmo instante. Para pagar dois meses de uma vez, é preciso esperar 5 minutos entre os lançamentos (a mensagem explica).
- Arquivos: `barber/src/servicos/nucleo.js`, `barber/src/servicos/canais.js` (`receberEmDinheiro`), `barber/src/http/api.js`, `barber/src/db.js`, `barber/public/js/views/clube.js`, `barber/test/ajuda.js` (o Asaas falso responde `receiveInCash`).
- Teste: `test/correcoes.test.js` › "V-02: …" (dois envios simultâneos com corpo lento, mesma chave duas vezes, baixa no Asaas sem cobrança nova, 2º toque logo depois). Antes: falhava (2 cobranças pagas). Depois: passa.
- Suíte: 30 de 30.

## V-04 · Estorno não tira o clube, e o pagamento reenviado depois do estorno renova · corrigido
- Mudança:
  - A idempotência do pagamento passou a ser "já processado" (`pago_em IS NOT NULL`), não `status = 'paga'`. Um RECEIVED reentregue depois do estorno é ignorado.
  - `acaoAsaas`: `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED` e `PAYMENT_CHARGEBACK_DISPUTE` agora viram "estornada". `PAYMENT_DELETED` continua como "cancelada", mas só em cobrança ainda não paga.
  - `estornar()` (em transação): a cobrança fica `cancelada` com `estornada_em` e deixa de entrar no caixa do clube. A assinatura volta para o último período pago que sobrou; se nenhum cobrir hoje, fica "atrasada". O estorno é auditado (`assinatura_estornada`).
  - Cada pagamento grava o período que cobriu: colunas novas `cobrancas.ciclo_inicio`, `ciclo_fim` e `estornada_em` (migração `ADD COLUMN` idempotente). Para cobranças antigas, sem período gravado, o estorno tira o último mês da assinatura.
- Limitação anotada: se o estorno for de um mês mais antigo e já existir um mês posterior pago e válido, o cliente continua coberto pelo mês posterior. Isso é raro; o estorno normal é o do mês mais recente.
- Arquivos: `barber/src/servicos/nucleo.js`, `barber/src/servicos/canais.js`, `barber/src/db.js`.
- Teste: `test/correcoes.test.js` › "V-04: …" (chargeback no meio do ciclo, reentrega, novo pagamento, estorno, reentrega, caixa e auditoria). Antes: falhava (continuava coberto depois do chargeback). Depois: passa.
- Suíte: 31 de 31.

## V-05 · Assinatura órfã no Asaas continua cobrando · corrigido
- Mudança (`assinar` em `nucleo.js`):
  - Trava por cliente em memória: um 2º pedido simultâneo recebe 409 enquanto o 1º fala com o Asaas.
  - Índice único parcial `assinaturas_cliente_vigente ON assinaturas(cliente_id) WHERE status IN ('pendente','ativa','atrasada')`, criado pela migração. Se houver duplicatas antigas, o comportamento é o mesmo do V-01: o sistema sobe, a pendência vai para a auditoria e o índice é criado depois da correção.
  - Pedido para o mesmo plano com uma pendente aberta: devolve a mesma assinatura, com o link de pagamento. Com "pago agora", registra o pagamento nela.
  - Troca de plano com uma pendente: cancela antes a assinatura anterior no Asaas (`DELETE`). Se o Asaas falhar, responde 502 e não cria a nova.
  - `criarAsaas.assinar` foi dividido em `criarCliente`, `criarAssinatura` e `primeiroPagamento`. Cada id é gravado assim que existe. Numa falha no meio, a assinatura já criada no Asaas é cancelada lá e a local fica "cancelada".
  - A falta de CPF agora é conferida antes de gravar qualquer coisa.
- Arquivos: `barber/src/servicos/nucleo.js`, `barber/src/servicos/canais.js`, `barber/src/db.js`, `barber/test/ajuda.js` (o Asaas falso numera as assinaturas, `sub_1`, `sub_2`…, e aceita falhas simuladas em `rede.falhas`).
- Teste: `test/correcoes.test.js` › "V-05: …" (assinar de novo, trocar de plano, dois pedidos simultâneos com corpo lento, falha depois do `POST /subscriptions`, índice único). Antes: falhava (2ª assinatura criada). Depois: passa.
- Suíte: 32 de 32.

## V-06 · Pagamento pelo webhook reativa assinatura cancelada; falha do cancelamento no Asaas engolida · corrigido
- Mudança:
  - `cancelarNoAsaas()`: se o `DELETE` no Asaas falhar (ou o Asaas estiver desligado), a assinatura fica com `cancelamento_pendente = 1` (coluna nova, migração idempotente) e a falha é auditada (`cancelamento_asaas_pendente`). Um 404 do Asaas conta como "já cancelada".
  - A rotina tenta de novo, até 20 por rodada, e informa `cancelamentos_asaas` no resultado.
  - `cancelarAssinatura` cancela localmente na hora: o cliente vê "cancelada" mesmo com o Asaas fora.
  - O desfazer do V-05 usa o mesmo caminho.
  - `eventoAsaas`: um `PAYMENT_RECEIVED` de assinatura cancelada registra a cobrança como paga, porque o dinheiro entrou, mas **não reativa** a assinatura. O evento é auditado (`pagamento_assinatura_cancelada`, com cliente e valor) e a assinatura volta a ficar com cancelamento pendente, para a rotina cancelar de novo no Asaas.
  - `pedir()` em `canais.js` passa a anexar `statusExterno` ao erro.
- Decisão anotada: o aviso à equipe é a entrada na Auditoria, mais um log `console.warn`. Não criei contador nem selo novo no painel (fica para o lote 3, junto com o V-37). A devolução do dinheiro ou a reativação fica a critério da barbearia.
- Arquivos: `barber/src/servicos/nucleo.js`, `barber/src/servicos/canais.js`, `barber/src/db.js`.
- Teste: `test/correcoes.test.js` › "V-06: …". Antes: falhava. Depois: passa.
- Suíte: 33 de 33.

## V-08 · Renovação paga antes do fim do ciclo tira o clube no resto do mês pago · corrigido
- Mudança:
  - Coluna nova `assinaturas.pago_ate`: o último dia já pago, separado do ciclo atual (`ciclo_inicio`/`ciclo_fim`, que continua sendo o mês da contagem de usos).
  - `assinaturaValida` passa a valer por `pago_ate` (`regras/clube.js`). Funções novas: `pagoAte()` e `cicloNoDia()`.
  - `registrarPagamento`, por meio de `proximoPeriodo()`:
    - O novo pagamento cobre o mês seguinte ao último pago, tanto adiantado quanto atrasado dentro do mês. Assim, a renovação atrasada parte de `pago_ate + 1`, e não de hoje.
    - Sem período anterior, ou com mais de um mês sem pagar, começa hoje.
    - O ciclo atual só muda quando o período pago começa.
  - Virada de ciclo: quando o ciclo guardado termina e o seguinte já está pago, o ciclo avança sozinho (ao ler em `assinaturaAtual` e na rotina) e a contagem de usos recomeça. Usos de agendamentos num dia do ciclo seguinte já entram contados nesse ciclo.
  - Rotina: "atrasada" passa a usar `COALESCE(pago_ate, ciclo_fim)`, ainda com 3 dias de tolerância.
  - O estorno do V-04 passou a tirar do `pago_ate` exatamente o mês que a cobrança estornada pagou. Isso também resolve a limitação anotada no V-04 (estorno de um mês mais antigo).
  - Migração dos dados (idempotente, só mexe em `pago_ate IS NULL`):
    - Assinaturas antigas: `pago_ate = ciclo_fim`.
    - As que foram renovadas antes da hora pelo código antigo (ativas com `ciclo_inicio` no futuro) voltam para o ciclo de hoje. O início vem do último `usos.ciclo_inicio` anterior, ou de um mês antes. O `pago_ate` fica no fim do período já pago.
  - Telas: painel (Clube e ficha do cliente) e app mostram "pago até" quando é diferente do fim do ciclo. A janela de pagamento diz "O mês novo começa depois de <pago até>".
- Decisão anotada: segui o veredito. Na renovação atrasada o mês novo parte do fim do período pago, igual ao vencimento do Asaas, e não do dia em que o cliente pagou. Também vale para o pagamento no balcão.
- Arquivos: `barber/src/regras/clube.js`, `barber/src/servicos/nucleo.js`, `barber/src/db.js`, `barber/src/http/api.js`, `barber/src/http/app.js`, `barber/public/js/views/clube.js`, `barber/public/js/views/clientes.js`, `barber/public/app/app.js`.
- Testes: `test/correcoes.test.js`:
  - "V-08: renovação paga antes do fim do ciclo…": adiantada, contagem de barbas por ciclo, virada de ciclo e renovação atrasada.
  - "V-08: migração corrige assinaturas antigas…": banco em arquivo, reaberto duas vezes.
  - Os dois falhavam antes e passam depois.
- Suíte: 35 de 35.

## V-18 · PAYMENT_OVERDUE fora de ordem marca como atrasado quem já pagou · corrigido (aprovado junto, mesma função)
- Mudança: o `PAYMENT_OVERDUE` é ignorado (`{ ignorado, motivo }`) quando a cobrança já foi paga (`pago_em`) ou quando a assinatura está ativa e o período pago cobre hoje.
- Teste existente ajustado: `test/fluxo.test.js` › "clube pelo Asaas…". Ele mandava o OVERDUE no mesmo dia do pagamento e esperava "atrasada", que é justamente o comportamento do bug. Agora o relógio avança para 11/12, depois do período pago. Mudança intencional.
- Teste: `test/correcoes.test.js` › "V-18: …". Antes: falhava. Depois: passa.

## V-19 · Webhook do Asaas sem `value` ou `dueDate` responde 500 · corrigido (aprovado junto, mesma função)
- Mudança: o `payment` do webhook é validado com zod (`id`, `subscription`, `value` positivo como número ou texto numérico, `dueDate` AAAA-MM-DD, `invoiceUrl`, `billingType`). Evento malformado, ou `PAYMENT_CREATED` sem valor ou vencimento, responde 200 com `{ ignorado: true, motivo }` e gera um `console.warn`, sem mexer em nada.
- Arquivos (V-18 e V-19): `barber/src/servicos/nucleo.js` (`eventoAsaas`), `barber/test/fluxo.test.js`.
- Teste: `test/correcoes.test.js` › "V-19: …". Antes: falhava (500, NOT NULL). Depois: passa.
- Suíte depois de V-18 e V-19: 37 de 37.

> A partir daqui, a pedido do coordenador: uma linha por item, itens agrupados e a suíte inteira rodada ao fim de cada grupo.

- **V-09** · corrigido · `recalcularCobertura()` é chamada em remarcar, na volta de "faltou" e em concluir. Há uma tabela `TRANSICOES` (`nucleo.mudarStatus`), o remarcar confere conflito com outros horários do cliente e a volta de "faltou" confere se a vaga do barbeiro continua livre · `src/servicos/nucleo.js`, `src/http/api.js` · teste: os dois "V-09: …" (falhavam antes) · suíte: 39 de 39.
- **V-13** · corrigido · `paraCentavos` devolve `null` para entrada inválida, e o formulário e o desconto da comanda mostram "valor inválido" (função nova `descontoCentavos`). No servidor, produto na vitrine exige preço > 0 (POST e PUT), a vitrine do app esconde produtos antigos com preço 0 e a reserva recusa esses produtos · `public/js/comum.js`, `public/js/base.js`, `public/js/views/produtos.js`, `src/http/api.js`, `src/http/app.js`, `src/servicos/nucleo.js` · teste: "V-13: …" (falhava antes).
- **V-14** · corrigido · o PUT de usuário exige o barbeiro vinculado, como o POST. Em `tratarApi`, um barbeiro sem vínculo recebe 403 em tudo, menos `/api/eu` e `/api/eu/senha`. Isso também cobre dados antigos que já estão errados no banco · `src/http/api.js`, `src/servidor.js` · teste: "V-14: …" (falhava antes) · suíte (grupo V-13 e V-14): 41 de 41.
- **V-10** · corrigido · `hashSenha` e `senhaConfere` usam `crypto.scrypt` assíncrono, com fila de 2 cálculos simultâneos e até 64 esperando (acima disso, 503 com mensagem). Todos os pontos de login, cadastro, acessos e troca de senha da API passaram a usá-los. O custo N = 2^17 ficou mantido (decisão: a fila já limita o uso de memória a ~256 MB) · `src/seguranca.js`, `src/http/api.js`, `src/servidor.js` · teste: "V-10: …" (o laço de eventos roda durante o cálculo e o `/health` responde durante 6 logins; falhava antes).
- **V-11** · corrigido · o retorno filtra no SQL (`julianday` + margem, sem horário futuro) e aplica `ORDER BY ultima_visita LIMIT 40` depois do filtro · `src/servicos/nucleo.js` · teste: "V-11: …" (45 clientes ainda não vencidos + 1 vencido; falhava antes) · suíte (grupo V-10 e V-11): 43 de 43.
- **V-12** · corrigido · módulo novo `public/app/confirmar.js` (`decidirToque` e `confirmarNoBotao`): ignora o 2º toque nos primeiros 800 ms depois de armar, e a confirmação vence em 8 s. Usado em "Cancelar" (horário) e em "Cancelar assinatura" · `public/app/confirmar.js`, `public/app/app.js` · teste: "V-12: …" (falhava antes) · suíte: 44 de 44.

## Fechamento da rodada (lotes 1 e 2)
- Feitos: V-07, V-03, V-01, V-02, V-04, V-05, V-06, V-08, V-18, V-19, V-09, V-13, V-14, V-10, V-11, V-12 (16 itens). Nenhum ficou parcial.
- Suíte: de 25 de 25 para 44 de 44 (19 testes novos em `test/correcoes.test.js`).
- Dois testes antigos foram ajustados de propósito:
  - `seguranca.test.js`: a verificação do WhatsApp agora vem de `/api/canais`.
  - `fluxo.test.js`: o OVERDUE agora só depois do período pago.
- Pontos fortes mantidos: `BEGIN IMMEDIATE` na disputa por horário, `lembrete_em` marcado antes do envio, CSRF, CSP e cabeçalhos, e dinheiro em centavos. `central.js` não foi tocado.
- Recomendações para o responsável:
  - Gerar um token novo do webhook do Asaas depois de atualizar (V-03).
  - Olhar a Auditoria por `migracao_pendente` (V-01 e V-05) e por `pagamento_assinatura_cancelada` (V-06).
