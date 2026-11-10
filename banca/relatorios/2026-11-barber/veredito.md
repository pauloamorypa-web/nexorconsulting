# Veredito da Banca · Nexor Barber (barber/) · 2026-11-10
Nota geral: 5 de 10 · Pronto para produção: não

A base é boa. A disputa pelo mesmo horário é segura (100 e 500 clientes ao mesmo tempo, só 1 venceu). Senhas usam scrypt, os segredos ficam em AES-GCM, há proteção CSRF, o SQL é parametrizado, um cliente não acessa dados de outro e o dinheiro é tratado em centavos inteiros. O problema está no **dinheiro do clube e da comanda**: cobrança em dobro, pagamento forjado por funcionário, estorno que não tira o clube e assinaturas que continuam cobrando no Asaas depois de canceladas aqui. Também há uma tomada de conta do dono. Esses pontos impedem a venda e a implantação.

Como conferi:
- Li o código de todos os itens graves e altos.
- Rodei `npm test`: 25 de 25 passam. Nenhum dos achados abaixo é pego pela suíte.
- Reproduzi os principais itens de dinheiro e segurança com o servidor real e o Asaas falso de `test/ajuda.js`. O script é `/tmp/claude-0/-home-user-nexorconsulting/4db1d3bf-8b4e-5a33-a0c1-2f29abc64b1b/scratchpad/banca/veredito/v1.mjs` e reproduz V-03, V-04, V-05, V-06, V-07, V-08, V-14 e V-19.
- Usei as capturas e a saída dos scripts dos outros agentes para os itens de tela.
- Nenhum arquivo do alvo foi alterado.

## Resumo
| Gravidade | Quantidade | Esforço estimado |
|---|---|---|
| Grave | 7 | 21,5 h |
| Alto | 7 | 20,5 h |
| Médio | 18 | 39,5 h |
| Básico | 13 | 28,5 h |
| **Total** | **45** (de 74 achados brutos, depois de juntar os duplicados) | **~110 h** |

## Itens (do mais grave ao mais básico)

### V-01 · Comanda fechada duas vezes: venda, estoque e comissão em dobro. Cancelar ou "faltou" passam por cima de um atendimento concluído · GRAVE
- Origem: U-01, T-01
- Confirmado: sim. Os dois agentes reproduziram (`t2.mjs` e `corrida.mjs`): 200 e 200, 2 vendas pagas, estoque baixado duas vezes, 4 linhas de comissão e um agendamento "cancelado" com venda paga. Conferi a causa no código.
- Onde: `src/http/api.js:193-218`. As rotas `PUT /api/agendamentos/:id` e `POST .../concluir` leem o agendamento com `exigir` antes de `await ctx.corpo()`. `concluir()` (`src/servicos/nucleo.js:383`) confere o status nesse objeto já desatualizado, fora da transação.
- Impacto: o caixa e as comissões ficam errados e o estoque some. Basta um celular com rede lenta e a recepção fechando a mesma comanda.
- Correção:
  - Ler o corpo antes do registro.
  - Dentro de `repo.transacao`, reler com `repo.obter` e conferir o status, ou usar `UPDATE ... WHERE id=? AND status IN (...)` e conferir as linhas afetadas.
  - Criar um índice único parcial em `vendas(agendamento_id) WHERE status='paga'`.
  - Desabilitar o botão no painel enquanto a requisição está em andamento.
  - Teste de concorrência.
- Esforço: **3 h**

### V-02 · Pagamento manual da assinatura sem proteção contra envio duplo · GRAVE
- Origem: P-12, T-08
- Confirmado: sim. Os dois agentes reproduziram (`corrida2.mjs`): 2 cobranças pagas de R$ 89,90 e o ciclo estendido 2 meses. Conferi no código: sem `externoId`, toda chamada insere uma cobrança paga.
- Onde: `src/http/api.js:347-351` e `registrarPagamento` em `src/servicos/nucleo.js:462-475`.
- Impacto: o caixa do clube fica inflado e o cliente ganha um mês. Com o Asaas ligado, a cobrança aberta lá continua e o cliente pode pagar o mesmo mês duas vezes.
- Correção:
  - Chave de idempotência enviada pelo painel, ou recusar um 2º pagamento manual no mesmo ciclo em poucos minutos.
  - Com Asaas, dar baixa na cobrança aberta em vez de criar outra.
  - Desabilitar o botão enquanto envia.
  - Teste.
- Esforço: **2,5 h**

### V-03 · Token do webhook do Asaas entregue a recepção e barbeiro, que conseguem forjar pagamento · GRAVE
- Origem: H-01, S-01, S-02, P-25 (token sem tamanho mínimo e literal "false")
- Confirmado: sim, de ponta a ponta. Reproduzi com o Asaas falso:
  - A recepção e o barbeiro recebem `asaas.token_webhook` em claro, em `/api/config` e `/api/eu`.
  - Com esse token, um `PAYMENT_RECEIVED` com o id de pagamento inventado `pay_FORJADO` respondeu 200 e a assinatura ficou "ativa" com um ciclo novo.
  - A recepção também lista as assinaturas (`/api/assinaturas`, papel EQUIPE), e a linha traz `asaas_assinatura`, que é tudo o que falta para forjar.
  - A suspeita S-01 do hacker deixa de ser suspeita.
- Onde: `configPublica` em `src/http/validacao.js:49-55` (não mascara `token_webhook` nem `whatsapp.verificacao`), `src/http/api.js:476` e `:120`, e a gravação em texto puro em `:524`.
- Impacto: um funcionário ativa o clube de graça para quem quiser, ou marca assinantes como atrasados. A `verificacao` do WhatsApp também vaza.
- Correção:
  - Mascarar os dois campos em `configPublica`.
  - Servir a aba Canais por uma rota só para dono e admin.
  - Criptografar `token_webhook`, exigir no mínimo 24 caracteres e só gerar no servidor.
  - Teste de papel.
- Esforço: **3 h**

### V-04 · Estorno não tira o clube, e o pagamento reenviado depois do estorno renova mais um mês · GRAVE
- Origem: P-04
- Confirmado: sim. Reproduzi o REFUNDED do `pay_2` seguido do RECEIVED do mesmo `pay_2` de novo: o ciclo saltou para 10/01 a 09/02/2027. A idempotência olha `status === "paga"`, e o estorno muda a cobrança para "cancelada". `PAYMENT_CHARGEBACK_*` nem é tratado.
- Onde: `src/servicos/nucleo.js:469` e `:509`, e `acaoAsaas` em `src/servicos/canais.js:113-119`.
- Impacto: o cliente estorna o Pix ou contesta o cartão e continua usando o clube. Uma reentrega comum do Asaas dá mais um mês sem pagamento.
- Correção:
  - Idempotência por "já processado" (`pago_em IS NOT NULL` ou uma tabela `eventos_asaas` com id único).
  - No estorno ou chargeback, desfazer o ciclo (ou marcar como atrasada) e auditar.
  - Testes.
- Esforço: **4 h**

### V-05 · Assinatura órfã no Asaas continua cobrando o cliente · GRAVE
- Origem: P-03, U-10, T-16
- Confirmado: sim. Reproduzi assinar duas vezes enquanto a primeira está pendente: 2 `POST /subscriptions`, 0 `DELETE`, e as duas ficaram "cancelada" no banco local. Os dois outros caminhos estão no código:
  - Dois pedidos ao mesmo tempo passam pela conferência antes do `await`.
  - Uma falha depois de `POST /subscriptions` cai no `catch`, que cancela só no banco.
- Observação: o Usuário Confuso não reproduziu porque não sabia que `test/ajuda.js` injeta um Asaas falso por `fetchFn`.
- Onde: `assinar()` em `src/servicos/nucleo.js:435-457`.
- Impacto: cobrança duplicada no cartão ou boleto do cliente, sem nenhum registro aqui. Somado ao V-06, ela ainda reativa a assinatura quando é paga.
- Correção:
  - Trava por cliente: um índice único parcial em `assinaturas(cliente_id) WHERE status IN ('pendente','ativa','atrasada')`, ou um Set em memória.
  - Devolver a pendente do mesmo plano (com o link) em vez de criar outra.
  - Chamar `asaas.cancelar` ao substituir uma pendente e no `catch` quando a subscription já existir.
  - Separar os passos de `asaas.assinar` para guardar o id assim que ele for criado.
  - Testes.
- Esforço: **5 h**

### V-06 · Pagamento pelo webhook reativa uma assinatura cancelada, e a falha do cancelamento no Asaas é engolida · GRAVE
- Origem: P-02
- Confirmado: sim. Reproduzi: o cliente cancela pelo app, chega `PAYMENT_RECEIVED` e o status volta a "ativa". `cancelarAssinatura` faz `.catch(console.error)` no DELETE do Asaas.
- Onde: `src/servicos/nucleo.js:477-484` e `:499-501`.
- Impacto: o cliente cancela, continua sendo cobrado no Asaas e aparece de novo como assinante sem ter pedido. Isso gera reclamação e estorno.
- Correção:
  - Se o DELETE falhar, devolver erro ou marcar `cancelamento_pendente` e tentar de novo na rotina.
  - Em `eventoAsaas`, com a assinatura cancelada, registrar a cobrança sem reativar e avisar a equipe.
  - Teste.
- Esforço: **2,5 h**

### V-07 · Um admin troca a senha do dono e toma a conta · GRAVE
- Origem: P-05
- Confirmado: sim. Reproduzi: `PUT /api/usuarios/<dono> {senha}` feito por um admin deu 200. O login com a senha nova deu 200 e a sessão do dono caiu (401).
- Onde: `src/http/api.js:562-569`. A proteção do dono cobre só `papel` e `ativo`.
- Impacto: acesso indevido. O dono perde a própria barbearia, que fica nas mãos de um admin ou de uma sessão de admin roubada.
- Correção:
  - Recusar a alteração do dono por outro usuário (403), ou permitir só o campo `nome`.
  - Troca da própria senha numa rota que pede a senha atual.
  - Teste.
- Esforço: **1,5 h**

### V-08 · Renovação paga antes do fim do ciclo tira o clube no restante do mês já pago · ALTO
- Origem: P-01
- Confirmado: sim. Reproduzi a renovação no ciclo de 10/11 a 09/12: o ciclo passou a 10/12 a 09/01, e `assinaturaValida` exige `ciclo_inicio <= dia`. O cliente fica sem clube de hoje até 10/12, sem nenhuma mensagem.
- Onde: `src/servicos/nucleo.js:466-467` e `src/regras/clube.js:9`.
- Impacto: quem paga adiantado (comum com boleto e Pix do Asaas) é barrado no app e no caixa. É a funcionalidade principal do clube quebrada para uma parte dos assinantes. Fica abaixo de grave porque não há perda de dados nem cobrança em dobro.
- Correção:
  - Validar por `pago_ate` (período pago), não pelo ciclo atual.
  - Na renovação atrasada, partir de `ciclo_fim + 1` e não de `hoje()`.
  - Migração dos dados e testes.
- Esforço: **5 h**

### V-09 · Serviço sai grátis pelo clube sem cobertura válida (remarcar, voltar de "faltou", assinatura cancelada antes do atendimento) · ALTO
- Origem: P-07, P-10, P-11
- Confirmado: sim, no código:
  - `remarcar` (`nucleo.js:306-321`) não mexe em `preco_centavos`, `assinatura_id` nem `usos`.
  - `PUT` com status (`api.js:202-206`) não tem máquina de estados: "faltou" apaga o uso, mas mantém o preço 0.
  - `concluir` (`nucleo.js:386`) usa `clube: Boolean(a.assinatura_id)` sem reconferir a assinatura.
- Observação: o P-07 foi reproduzido pelo Sênior (2 cortes num ciclo de 1).
- Impacto: receita perdida e cota do plano furada. Remarcar também permite que dois horários do mesmo cliente se sobreponham.
- Correção:
  - Função única "recalcular cobertura" chamada em remarcar, em `faltou→agendado` e em concluir.
  - Tabela de transições de status permitidas.
  - Repetir a conferência de conflito do cliente no remarcar.
  - Testes.
- Esforço: **6 h**

### V-10 · Login com scrypt síncrono congela o servidor inteiro · ALTO
- Origem: T-02
- Confirmado: sim. `scryptSync` com N=2^17 em `src/seguranca.js:13` e `:23`. O Testador mediu 100 logins simultâneos: 34 s no total e o `/health` em até 6,2 s. O mesmo custo vale para e-mail inexistente (`HASH_FALSO`).
- Impacto: com poucos IPs, um atacante deixa o app do cliente e a agenda fora do ar. É uma falha explorável com esforço.
- Correção:
  - Usar `crypto.scrypt` assíncrono com um limite de concorrência (fila de 2 a 4).
  - Avaliar o custo N para o servidor do cliente.
  - Teste de não-bloqueio.
- Esforço: **3 h**

### V-11 · "Retorno no tempo certo" para de funcionar com mais de 40 clientes com ciclo · ALTO
- Origem: P-06
- Confirmado: sim, no código (`src/servicos/nucleo.js:614-616`). O `slice(0, 40)` é feito antes do filtro, e quem ainda não venceu (ou já tem horário marcado) nunca é marcado e ocupa as 40 vagas para sempre. O Sênior reproduziu com 45 clientes.
- Impacto: a função de retenção vendida como diferencial fica muda em qualquer barbearia média, sem nenhum erro aparente.
- Correção: filtrar no SQL (`julianday` e margem) com `ORDER BY ultima_visita LIMIT 40`, mais um teste.
- Esforço: **1,5 h**

### V-12 · Toque duplo em "Cancelar" cancela o horário (ou a assinatura) sem confirmação · ALTO
- Origem: U-02
- Confirmado: sim. No código (`public/app/app.js:250-257` e `:524`), o 1º toque arma a confirmação e o 2º toque do mesmo gesto cancela. As capturas `app-09` e `app-14` mostram o efeito.
- Impacto: o cliente perde o horário, que vai direto para a lista de espera, ou cancela o clube sem querer.
- Correção: janela de confirmação, ou ignorar o 2º toque por cerca de 800 ms depois de armar.
- Esforço: **1,5 h**

### V-13 · Preço digitado errado ("abc", "1,234.56") salva o produto por R$ 0,00 e ele aparece na vitrine do app · ALTO
- Origem: U-04
- Confirmado: sim. `paraCentavos` (`public/js/comum.js:61-64`) devolve 0 para tudo que não vira número. A captura `m-app-loja.png` mostra os produtos a R$ 0,00.
- Impacto: o produto é reservado e vendido de graça. O mesmo vale para os campos de preço de serviço e de plano, que usam a mesma função.
- Correção:
  - `paraCentavos` devolve `null` para entrada inválida e o formulário mostra "Preço inválido".
  - No servidor, exigir `preco_centavos > 0` quando o produto vai para a vitrine, ou pedir confirmação.
- Esforço: **2 h**

### V-14 · Acesso "barbeiro" sem barbeiro vinculado vê a agenda, as vendas e as comissões de todos · ALTO
- Origem: P-16
- Confirmado: sim. Reproduzi: a recepção virou barbeiro pelo PUT sem `barbeiro_id` (200) e passou a receber `/api/comissoes` e `/api/vendas` com 200. O filtro `null` desliga o recorte.
- Onde: `src/http/api.js:565-568`. O POST exige o vínculo e o PUT não.
- Impacto: um funcionário vê o faturamento e a comissão dos colegas. Depende de um erro de configuração do admin.
- Correção:
  - Repetir no PUT a regra do POST.
  - Nas rotas, `ehBarbeiro && !barbeiro_id` responde 403.
  - Teste.
- Esforço: **1,5 h**

### V-15 · Busca e filtros de clientes ignoram quem passou do 2.000º; a rota fica lenta sob carga · MÉDIO
- Origem: P-17, T-03, T-04
- Confirmado: sim. O código (`src/http/api.js:250-253`) faz `LIMIT 2000` antes de filtrar em JS. O Testador reproduziu: "zuleica" com 0 resultado entre 2.100 clientes e p95 de 2,25 s com 500 requisições simultâneas.
- Correção: filtrar no SQL (nome, fone, e-mail e os três filtros por subconsulta) e paginar.
- Esforço: **3 h**

### V-16 · Limite de login conta os acertos e deixa trancar o dono por e-mail · MÉDIO
- Origem: P-24, T-15, U-11
- Confirmado: sim. `limitar()` roda antes de conferir a senha (`api.js:99-100`). Com 8 logins certos no mesmo Wi-Fi em 15 min, a equipe recebe 429. Um terceiro tranca o dono com 8 senhas erradas.
- Correção: contar só as falhas, zerar depois de um acerto e combinar e-mail com IP.
- Esforço: **1,5 h**

### V-17 · Lembretes perdidos com o canal fora, rotina presa e texto "hoje" para horário de amanhã · MÉDIO
- Origem: T-06, P-23
- Confirmado: sim.
  - `lembrete_em` é marcado antes do envio (`nucleo.js:588`) e nunca é tentado de novo.
  - O envio é sequencial, com timeout de 20 s (`canais.js:28`).
  - Não há trava contra duas rotinas ao mesmo tempo (`servidor.js:277`).
  - O texto é fixo em "hoje às".
  - O Testador mediu 60 s para 3 lembretes.
- Observação: marcar antes do envio evita mensagem em dobro (o Sênior cita isso como ponto forte). A correção precisa manter essa proteção.
- Correção:
  - Estado "enviando" com tentativas e limite.
  - Timeout de 5 s para mensagens e envio em paralelo com limite.
  - Trava da rotina.
  - Usar `quando(a.inicio)` no texto.
- Esforço: **4 h**

### V-18 · Webhook PAYMENT_OVERDUE fora de ordem marca como atrasado quem já pagou · MÉDIO
- Origem: P-13
- Confirmado: sim, no código (`nucleo.js:503-507`). Não confere se a cobrança já está paga nem respeita a tolerância.
- Impacto: o clube é bloqueado e uma cobrança indevida é enviada. O contorno é registrar o pagamento de novo.
- Correção: ignorar se a cobrança já está "paga" ou se o ciclo atual cobre o dia.
- Esforço: **1 h**

### V-19 · Webhook do Asaas sem `value` ou `dueDate` responde 500 · MÉDIO
- Origem: P-14
- Confirmado: sim. Reproduzi: `PAYMENT_CREATED` sem `value` deu 500 com `NOT NULL constraint failed`.
- Impacto: depois de falhas seguidas, o Asaas pausa a fila de webhooks da conta. É pouco provável com eventos legítimos.
- Correção: validar o payload com zod, responder 200 com `{ignorado}` para evento malformado e registrar em log.
- Esforço: **1 h**

### V-20 · "Faltou" e horário nunca fechado prendem o estoque reservado · MÉDIO
- Origem: P-08
- Confirmado: sim, no código. Só `cancelar` libera as reservas, e a rotina não expira nenhuma.
- Correção: função única `liberarReservas(agId)`, chamada no "faltou" e na rotina para horários passados sem venda.
- Esforço: **2 h**

### V-21 · Mesmo produto em duas linhas da venda deixa o estoque negativo · MÉDIO
- Origem: P-09
- Confirmado: sim, no código (`nucleo.js:346-348`). Cada linha é conferida contra o estoque inteiro.
- Correção: somar as quantidades por produto antes de conferir e criar `CHECK (estoque >= 0)`.
- Esforço: **1,5 h**

### V-22 · Reservas da loja sem teto, sem agrupar e sem desfazer · MÉDIO
- Origem: P-15, U-09
- Confirmado: sim. O limite de 5 vale por chamada (`app.js:214-221`). Cada toque cria uma linha nova, e a rota `DELETE /api/app/reservas/:id` existe mas nenhuma tela a usa.
- Impacto: um cliente zera a vitrine, e junto com o V-20 isso fica para sempre.
- Correção: teto por agendamento, somar a quantidade da mesma reserva, botões − e + no app e limite de pedidos por cliente.
- Esforço: **3 h**

### V-23 · Limite de 5 códigos por celular furado por pedidos simultâneos · MÉDIO
- Origem: P-18
- Confirmado: sim, no código (`nucleo.js:92-106`). A contagem é feita antes do `await` do envio e o registro depois. O acerto apaga todos os códigos e zera a contagem.
- Impacto: bombardeio de SMS contra um terceiro e custo de SMS para a barbearia.
- Correção: gravar um marcador "enviando" antes do `await` e contar pela tabela `envios`.
- Esforço: **1,5 h**

### V-24 · Desempenho: N+1 no `detalhar`, faixa de datas sem limite e índices faltando · MÉDIO
- Origem: P-20 (a medição do T-04 entra no V-15)
- Confirmado: sim, no código.
  - `/api/agendamentos?de=&ate=` não tem limite de faixa.
  - `detalhar` faz de 8 a 10 consultas por horário.
  - Faltam os índices `assinaturas(asaas_assinatura)`, `agendamentos(status, inicio)`, `reservas(...)` e `usos(...)`.
- Correção: limitar a faixa a 31 dias, paginar `/api/assinaturas`, carregar em Map por chamada e criar os índices.
- Esforço: **6 h**

### V-25 · Não há como remover a chave do Asaas, do WhatsApp ou do SMS pelo painel · MÉDIO
- Origem: T-07
- Confirmado: sim, no código. `novoSegredo("")` mantém o valor antigo (`api.js:511`).
- Impacto: a barbearia não volta para "pagar no balcão". Com o Asaas fora, toda assinatura pelo app recebe 502.
- Correção: um campo `remover: true` (ou `null`) apaga o segredo, e a tela ganha o botão "Remover".
- Esforço: **2 h**

### V-26 · Painel no celular: Configurações com 1.200 px de largura e o "Salvar" fora da tela · MÉDIO
- Origem: U-03
- Confirmado: sim. A captura `m-painel-config.png` mostra o conteúdo cortado na borda direita e as abas estourando a largura.
- Impacto: o "Salvar" só é alcançado rolando para o lado ou no computador, que é o contorno disponível.
- Correção: `.abas` com `overflow-x: auto`, `min-width: 0` nos pais, `flex-wrap` no topo da Agenda e indicadores com `auto-fit`.
- Esforço: **2 h**

### V-27 · Mensagens de erro em inglês e com o nome técnico do campo · MÉDIO
- Origem: U-05
- Confirmado: sim. `validar()` repassa a mensagem do zod com o caminho do campo (`validacao.js:40`). As capturas mostram os textos.
- Correção: zod em português, rótulos amigáveis no lugar dos nomes de campo e "Sem conexão com a internet" para `TypeError` de rede.
- Esforço: **3 h**

### V-28 · Duplo clique na janela do horário "cai" na agenda e abre outra janela · MÉDIO
- Origem: U-06
- Confirmado: sim, pelas capturas `painel-05` e `painel-06`.
- Correção: fechar a janela só depois que a ação terminar, ou ignorar cliques por cerca de 400 ms.
- Esforço: **1,5 h**

### V-29 · Comanda mostra total errado com desconto negativo, com "%" ou maior que a conta · MÉDIO
- Origem: U-07
- Confirmado: sim, pelas capturas. O servidor já recusa o negativo e limita ao subtotal, então o problema é só de tela.
- Correção: validar ao digitar (mínimo 0, máximo igual ao subtotal), mostrar o aviso no campo e, se o produto quiser, aceitar "%".
- Esforço: **1,5 h**

### V-30 · A comanda cobra o preço atual do serviço, não o preço confirmado ao cliente · MÉDIO
- Origem: P-21
- Confirmado: sim, no código. `vender` usa `s.preco_centavos` (`nucleo.js:343`) e ignora o `a.preco_centavos` gravado no agendamento.
- Impacto: depois de um reajuste, o cliente paga mais do que o app mostrou.
- Correção: usar o preço do agendamento na linha do serviço.
- Esforço: **1 h**

### V-31 · Datas impossíveis aceitas e URL ou cookie malformados geram 500 · MÉDIO
- Origem: P-22, T-10, U-13
- Confirmado: sim, no código. `dia` só confere o formato (`2026-02-31` vira 03/03 em silêncio, ou seja, o horário é gravado em outro dia). `decodeURIComponent` não tem try em `roteador.js:34` e `:73`.
- Correção: `dia.refine` para conferir se a data existe, nascimento só no passado, try/catch no decode com resposta 400.
- Esforço: **2 h**

### V-32 · O papel de barbeiro vê a base inteira de clientes (com celular) e pode dar 100% de desconto · MÉDIO
- Origem: T-14
- Confirmado: sim, no código. `/api/clientes` e `/api/vendas` não têm restrição de papel.
- Depende de decisão do produto: exportar a carteira de clientes é um risco de LGPD e de perda do cliente quando o barbeiro sai.
- Correção, se aprovada: barbeiro vê só os próprios clientes e o desconto tem teto por papel.
- Esforço: **2 h**

### V-33 · Limites por IP confiam no X-Forwarded-For por padrão (`TRUST_PROXY=1`) · BÁSICO
- Origem: T-05
- Confirmado: em parte. Em localhost, trocar o XFF contorna o limite. Na implantação do manual (Cloudflare Tunnel), a última entrada do XFF é posta pela Cloudflare e o servidor usa justamente a última, então não dá para falsificar. O risco existe só se a porta 8795 ficar exposta direto. Por isso fica abaixo do "média" que o Testador sugeriu.
- Correção: padrão `TRUST_PROXY=0`, ligado explicitamente no `.env` do manual.
- Esforço: **0,5 h**

### V-34 · Corrida no primeiro cadastro cria duas barbearias e dois donos · BÁSICO
- Origem: P-19
- Confirmado: sim, no código. A conferência fica antes do `await`. Em produção, o código de instalação reduz o risco.
- Correção: repetir a conferência dentro da transação.
- Esforço: **0,5 h**

### V-35 · `GET /api/hoje` sem `?dia=` responde 400 · BÁSICO
- Origem: T-09
- Confirmado: sim, no código. `validar(dia.optional(), undefined)` vira `{}`. O painel não é afetado.
- Correção: `query.get("dia") || hoje()`.
- Esforço: **0,25 h**

### V-36 · Corpo acima de 256 KB fecha a conexão sem responder 413 · BÁSICO
- Origem: T-11
- Confirmado: sim, no código. `req.destroy()` é chamado antes da resposta (`roteador.js:21-23`).
- Correção: responder 413 com `Connection: close` e só então fechar.
- Esforço: **0,5 h**

### V-37 · Mensagens de falha externa técnicas ("fetch failed") ou que mostram o erro do provedor ao cliente; nenhum aviso no painel · BÁSICO
- Origem: T-12, P-25 (o `e.message` do Asaas, da Meta e do Twilio é repassado)
- Confirmado: sim, no código (`nucleo.js:454` e `servidor.js:259`).
- Correção: mensagem fixa em português, detalhe só no log ou em `envios`, sugerir o outro canal só se ele estiver ativo, e um contador de envios com erro no painel.
- Esforço: **2 h**

### V-38 · Segunda aba do mesmo cliente diz que o horário "acabou de ser ocupado" (por ele mesmo) · BÁSICO
- Origem: U-08
- Confirmado: sim (`app-05`). Não há duplicidade, só a mensagem errada.
- Correção: reconhecer o próprio agendamento e levar o cliente para o Início.
- Esforço: **1 h**

### V-39 · Encaixe aceita data no passado · BÁSICO
- Origem: U-12, T-13
- Confirmado: sim. Pode ser intencional (lançar um atendimento já feito), mas aceita até 2020.
- Correção: recusar além de uma margem (por exemplo, o próprio dia) ou criar já como "em_atendimento". Confirmar a regra com o produto.
- Esforço: **0,5 h**

### V-40 · Voltar do navegador ou recarregar no meio do agendamento perde o passo · BÁSICO
- Origem: U-14
- Confirmado: sim (`app-07`).
- Correção: `history.pushState` por passo e o fluxo guardado em `sessionStorage`.
- Esforço: **3 h**

### V-41 · Sessão expirada no meio do agendamento só mostra um aviso · BÁSICO
- Origem: U-15
- Confirmado: sim (`app-16`).
- Correção: em 401, guardar o fluxo, abrir a tela de entrar e retomar depois.
- Esforço: **2 h**

### V-42 · Textos que não batem com a configuração (WhatsApp em vez de SMS; CPF pedido no pagamento no balcão) · BÁSICO
- Origem: U-16
- Confirmado: sim (`app-04`, `app-11` e `app-12`).
- Correção: montar o texto pelos canais ativos e esconder o CPF sem Asaas.
- Esforço: **1 h**

### V-43 · Acessibilidade e layout: logo sem `alt`, mensagem espremida, agendar pela grade só com mouse · BÁSICO
- Origem: U-17
- Confirmado: sim.
- Correção: colocar `alt`, `grid-column: 1 / -1` na mensagem e um botão acessível por teclado.
- Esforço: **1 h**

### V-44 · Comparação comum (`!==`) do HMAC do código de acesso · BÁSICO
- Origem: P-25
- Confirmado: sim (`nucleo.js:117`). O risco prático é mínimo porque o HMAC tem chave.
- Correção: usar o `iguais()` que o projeto já tem.
- Esforço: **0,25 h**

### V-45 · Manutenção e testes · BÁSICO
- Origem: P-26 e a seção "Sem teste automatizado" do T
- Confirmado: sim.
  - `nucleo.js` é um único fechamento de 650 linhas.
  - Há código morto e duplicações.
  - As permissões estão espalhadas em `if`s, e foi isso que gerou o V-07 e o V-14.
  - O relatório não fecha quando há desconto.
  - `cancelarVenda` apaga comissões de meses já fechados.
  - Nenhum teste cobre concorrência, estorno ou reentrega de webhook.
- Correção: separar o `nucleo` em agenda, caixa, clube e espera; criar uma tabela de permissões por papel e uma trava de período nas comissões. Os testes de regressão de cada item já estão contados no esforço de cada item.
- Esforço: **16 h**

## Não confirmados ou descartados
- **Nenhum achado foi descartado como falso positivo.** Todos os 74 achados brutos (H 1+2, U 17, P 26, T 16) foram confirmados no código, pela reprodução ou pela evidência, e agrupados nos 45 itens acima.
- **Ajustes de gravidade em relação ao que os agentes sugeriram:**
  - **H-01 / S-01** subiu de média para **grave** (V-03): a ativação ponta a ponta foi reproduzida com o Asaas falso, e a recepção tem acesso a todos os dados necessários.
  - **U-10 / T-16** passou de "risco visto no código" para reproduzido (V-05). A URL do Asaas não precisa ser trocada, porque `test/ajuda.js` injeta um `fetchFn` falso.
  - **T-01 / P-12 / T-08** sobem para **grave** (V-01 e V-02) pela regra da banca: cobrança duplicada.
  - **P-01** foi sugerido como crítico e fica **alto** (V-08): é funcionalidade quebrada para parte dos assinantes, sem cobrança em dobro nem perda de dados. Entra no lote 1 porque mexe com dinheiro.
  - **U-03** foi sugerido como alto e fica **médio** (V-26): existe contorno (rolar para o lado ou usar o computador).
  - **T-05** foi sugerido como médio e fica **básico** (V-33): na implantação documentada (Cloudflare Tunnel) o XFF não é falsificável.
  - **P-14** fica **médio** (V-19): eventos legítimos do Asaas sempre trazem `value`.
- **Pontos fortes conferidos e mantidos:**
  - Disputa por horário segura (`BEGIN IMMEDIATE` e conferência com insert na mesma transação síncrona).
  - Guarda de posse no app (IDOR).
  - CSRF, CSP e path traversal.
  - Cabeçalhos de segurança.
  - Backdoor da Nexor com Ed25519 e uso único.
  - SQL parametrizado.
  - Dinheiro em centavos.

## Plano de correção sugerido
Cada item inclui um teste automatizado que falha antes da correção e passa depois, e a suíte inteira roda depois de cada item.

| Lote | Itens | Esforço | Quando |
|---|---|---|---|
| **1 · Graves e altos de dinheiro e segurança** | V-01, V-02, V-03, V-04, V-05, V-06, V-07 (graves) + V-08, V-09, V-10, V-13, V-14 (altos) | **39 h** | Antes de vender ou implantar |
| **2 · Altos restantes** | V-11, V-12 | **3 h** | Nesta semana |
| **3 · Médios** | V-15 a V-32 | **39,5 h** | Próxima versão |
| **4 · Básicos** | V-33 a V-45 | **28,5 h** (12,5 h sem a refatoração do V-45) | Quando houver tempo |

Ordem sugerida dentro do lote 1, para não mexer duas vezes no mesmo código:
1. **V-07** e **V-03** (segurança, rápidos: 4,5 h).
2. **V-01** (comanda).
3. **V-02** (pagamento manual).
4. Bloco do clube e do Asaas, todo em `assinar`, `registrarPagamento` e `eventoAsaas`: **V-04 → V-05 → V-06 → V-08**. Vale trazer junto os médios **V-18** e **V-19**, que estão na mesma função (+2 h).
5. **V-09** (cobertura do clube).
6. **V-13**, **V-14** e **V-10**.

Com o lote 1 e o lote 2 feitos (cerca de 42 h, ou 44 h com V-18 e V-19), a recomendação passa a "pronto para produção com ressalvas".

---
**Quais itens o responsável aprova corrigir?** Responda com a lista, por exemplo: "aprovo o lote 1", "aprovo V-01, V-03 e V-07" ou "aprovo os lotes 1 e 2".
