# Relatório do Agente Programador Sênior · Nexor Barber (barber/) · 2026-11-10
Arquivos lidos: src/config.js, src/db.js, src/seguranca.js, src/servidor.js, src/http/api.js, src/http/app.js, src/http/roteador.js, src/http/validacao.js, src/nexor/central.js, src/nexor/politica.js, src/regras/datas.js, src/regras/agenda.js, src/regras/clube.js, src/servicos/canais.js, src/servicos/nucleo.js (todos linha a linha); test/ajuda.js e os títulos dos testes; public/ só nos pontos de dinheiro e de montagem de HTML (js/comum.js, js/ui.js, app/app.js) · Tamanho: servidor 2.889 linhas · front 3.681 linhas (JS + CSS + HTML) · `npm test`: 25 de 25 passam.

Método: li o código e confirmei cada achado marcado **[reproduzido]** com scripts que sobem o servidor real pelo `test/ajuda.js` (banco em memória, rede falsa). Os scripts ficaram fora do repositório. Nenhum arquivo do alvo foi alterado.

## Resumo

| # | Achado | Gravidade |
|---|---|---|
| P-01 | Renovação paga antes do fim do ciclo tira o clube do cliente no resto do mês já pago | crítica |
| P-02 | Webhook "paga" reativa assinatura cancelada; o cancelamento no Asaas falha calado | alta |
| P-03 | `assinar` deixa assinaturas órfãs no Asaas (repetir o pedido, corrida, erro no meio) | alta |
| P-04 | Estorno não desfaz o ciclo, e o RECEIVED reentregue depois do estorno renova de novo | alta |
| P-05 | Admin troca a senha do dono e toma a conta | alta |
| P-06 | Retorno: `slice(0, 40)` antes do filtro trava o aviso para sempre | alta |
| P-07 | Remarcar não confere o clube de novo: uso fica no ciclo antigo, serviço sai grátis fora do plano | alta |
| P-08 | "Faltou" e horário nunca fechado prendem o estoque reservado para sempre | média |
| P-09 | Mesmo produto em duas linhas da venda deixa o estoque negativo | média |
| P-10 | Status livre no PUT: faltou → agendado deixa o serviço grátis sem gastar uso | média |
| P-11 | `concluir` não confere de novo a assinatura | média |
| P-12 | Pagamento manual sem idempotência: dois cliques valem dois meses | média |
| P-13 | Webhook PAYMENT_OVERDUE fora de ordem marca "atrasada" quem já pagou | média |
| P-14 | Webhook sem `value` dá 500 (o Asaas reenvia e pode interromper a fila) | média |
| P-15 | Cliente reserva o estoque inteiro (reservas sem teto) | média |
| P-16 | Usuário "barbeiro" sem `barbeiro_id` vê a agenda e as vendas de todos | média |
| P-17 | Busca de clientes só olha os 2.000 primeiros em ordem alfabética | média |
| P-18 | Limite de códigos por celular furado por pedidos ao mesmo tempo | média |
| P-19 | Corrida no primeiro cadastro cria duas barbearias e dois donos | baixa |
| P-20 | Desempenho: N+1 no `detalhar`, faixas sem limite, índices faltando | média |
| P-21 | Comanda cobra o preço atual do serviço, não o preço confirmado ao cliente | baixa |
| P-22 | Erros de borda: cookie malformado dá 500, data impossível é aceita | baixa |
| P-23 | Lembrete diz "hoje" quando o horário é amanhã | baixa |
| P-24 | Bloqueio por e-mail no login permite trancar o dono de fora | baixa |
| P-25 | Detalhes de segurança: comparação comum de HMAC, token de webhook sem tamanho mínimo, erro externo repassado | baixa |
| P-26 | Manutenção e testes | informativa |

## Achados

### P-01 · Renovação paga antes do fim do ciclo tira o clube do cliente no resto do mês já pago **[reproduzido]**
- Gravidade sugerida: crítica
- Onde: src/servicos/nucleo.js:466-473 e src/regras/clube.js:9
- Trecho:
  ```js
  const inicio = atual.status === "ativa" && atual.ciclo_fim >= hoje() ? somarDias(atual.ciclo_fim, 1) : hoje();
  const ciclo = cicloDe(inicio);
  ...
  return repo.atualizar("assinaturas", a.id, { status: "ativa", ...ciclo });
  // clube.js
  export const assinaturaValida = (a, dia) => Boolean(a && a.status === "ativa" && a.ciclo_inicio <= dia && dia <= a.ciclo_fim);
  ```
- Por que é um problema: a assinatura guarda um ciclo só. Quando o pagamento do mês seguinte chega antes do fim do ciclo atual (boleto ou Pix pago adiantado, o que é comum no Asaas, ou pagamento no balcão), `ciclo_inicio` passa para uma data futura. A partir daí `assinaturaValida` dá falso para todos os dias que faltam do mês já pago. Reproduzido: ciclo 10/11 a 09/12, renovação em 05/12 grava 10/12 a 09/01, e em 06/12 o app responde `coberto:false` com `motivo:null`. O cliente pagou dois meses e fica sem clube até 10/12, sem nenhuma explicação na tela. No sentido contrário, quem paga dentro dos 3 dias de tolerância (`ciclo_fim < hoje`) recomeça o ciclo em `hoje()`, e o ciclo vai se afastando do vencimento do Asaas.
- Correção sugerida: validar pelo período pago, não pelo ciclo "atual". Uma forma: guardar `pago_ate` e validar com `dia <= pago_ate`, calculando o ciclo de uso pela data, com âncora fixa em `ciclo_ancora`. Outra forma: gravar o próximo ciclo em campos separados (`proximo_inicio`/`proximo_fim`) e promovê-los na rotina. Na renovação atrasada, partir de `somarDias(atual.ciclo_fim, 1)` e não de `hoje()`.

### P-02 · Webhook "paga" reativa assinatura cancelada; o cancelamento no Asaas falha calado **[reproduzido]**
- Gravidade sugerida: alta
- Onde: src/servicos/nucleo.js:481, 491, 499-500
- Trecho:
  ```js
  if (asaas.ativo && a.asaas_assinatura) await asaas.cancelar(a.asaas_assinatura).catch((e) => console.error("[asaas]", e.message));
  ...
  const a = p.subscription ? repo.um("SELECT * FROM assinaturas WHERE asaas_assinatura = ?", p.subscription) : null;
  ...
  if (acao === "paga") { registrarPagamento(repo.ler("assinaturas", a), {...}); return { ok: true }; }
  ```
- Por que é um problema: se o DELETE no Asaas falha (rede, 5xx, chave trocada), a assinatura fica `cancelada` aqui e continua viva lá, gerando cobranças. Quando o cliente paga, o webhook chama `registrarPagamento` sem olhar o status e grava `status: "ativa"`. Reproduzido: assinatura cancelada mais PAYMENT_RECEIVED volta a `ativa`. Isso também vale para as órfãs do P-03. O resultado é cobrança contra a vontade do cliente, que aparece como assinante ativo sem ter pedido.
- Correção sugerida: em `cancelarAssinatura`, não engolir o erro: devolver 502 ou marcar `cancelamento_pendente` e tentar de novo na rotina. Em `eventoAsaas`, quando `a.status === "cancelada"`, registrar o pagamento e auditar sem reativar (`return { ignorado: "assinatura cancelada" }`), e avisar a equipe para estornar.

### P-03 · `assinar` deixa assinaturas órfãs no Asaas **[reproduzido]**
- Gravidade sugerida: alta
- Onde: src/servicos/nucleo.js:439-455
- Trecho:
  ```js
  const atual = assinaturaAtual(cliente.id);
  if (atual && atual.status !== "pendente") recusar(409, ...);
  if (atual) repo.atualizar("assinaturas", atual.id, { status: "cancelada", cancelada_em: agora() });   // não cancela no Asaas
  let a = repo.inserir("assinaturas", { ... status: "pendente", cpf });
  ...
  const r = await asaas.assinar({ ... });          // cliente + subscription + GET payments
  ...
  } catch (e) {
    repo.atualizar("assinaturas", a.id, { status: "cancelada", cancelada_em: agora() });   // subscription criada fica lá
  ```
- Por que é um problema: há três caminhos.
  - (a) O cliente toca "Assinar" de novo enquanto a primeira está pendente (link perdido, troca de plano). A pendente anterior é cancelada só no banco, e a subscription dela continua cobrando no Asaas.
  - (b) Dois pedidos ao mesmo tempo. A conferência e o insert ficam antes do `await`, então os dois passam. Reproduzido: dois POST `/api/app/assinar` simultâneos criaram 2 subscriptions no Asaas e 0 DELETE, e as duas assinaturas ficaram `cancelada` no banco.
  - (c) Falha depois de `POST /subscriptions`: no GET de pagamentos, ou no insert de `cobrancas` com `externo_id` UNIQUE. O `catch` cancela só no banco.

  Somado ao P-02, a órfã reativa a assinatura quando é paga.
- Correção sugerida: travar por cliente, por exemplo com um Set `assinando` em memória ou um índice único parcial `assinaturas(cliente_id) WHERE status IN ('pendente','ativa','atrasada')`. Ao substituir uma pendente com `asaas_assinatura`, chamar `asaas.cancelar`. No `catch`, se `r?.assinatura` já existe, cancelar no Asaas. O ideal é separar `asaas.assinar` em passos e guardar o id da subscription assim que ela é criada.

### P-04 · Estorno não desfaz o ciclo, e o RECEIVED reentregue depois do estorno renova de novo **[reproduzido]**
- Gravidade sugerida: alta
- Onde: src/servicos/nucleo.js:469, 509 e src/servicos/canais.js:117
- Trecho:
  ```js
  if (cob?.status === "paga") return atual; // webhook repetido
  ...
  if (acao === "cancelada") repo.rodar("UPDATE cobrancas SET status = 'cancelada' WHERE externo_id = ?", p.id);
  ```
- Por que é um problema: PAYMENT_REFUNDED muda só a cobrança. A assinatura continua `ativa` com o ciclo pago, então o cliente estorna e segue usando o clube. Pior: a idempotência olha `status === "paga"`. Depois do estorno, a cobrança está `cancelada`, e uma reentrega do PAYMENT_RECEIVED antigo (o Asaas reenvia em caso de timeout) passa como pagamento novo e soma mais um mês. Reproduzido: estorno, ciclo continua até 09/12; RECEIVED do mesmo `pay_z` de novo, ciclo vai até 09/01. PAYMENT_CHARGEBACK_* nem é tratado.
- Correção sugerida: a idempotência deve ser "já processei este `externo_id` para pagamento" (coluna `pago_em IS NOT NULL` ou uma tabela `eventos_asaas(id UNIQUE)` com o `evento.id` do webhook). No estorno ou chargeback, voltar o ciclo (ou marcar `atrasada`) e auditar.

### P-05 · Admin troca a senha do dono e toma a conta **[reproduzido]**
- Gravidade sugerida: alta
- Onde: src/http/api.js:562-569
- Trecho:
  ```js
  if (u.papel === "dono" && (d.papel || d.ativo === false)) falha(400, "O dono da conta não pode ser alterado.");
  ...
  const novo = repo.atualizar("usuarios", u.id, { ...d, senha: undefined, senha_hash: d.senha ? gerarHashSenha(d.senha) : undefined });
  if (d.ativo === false || d.senha) repo.rodar("DELETE FROM sessoes WHERE usuario_id = ?", u.id);
  ```
- Por que é um problema: a proteção do dono cobre papel e ativo, mas não `senha` nem `nome`. Um admin (ou a sessão roubada de um admin) muda a senha do dono, derruba as sessões dele e entra como dono. Reproduzido: PUT com `{senha}` no dono deu 200, e o login com a senha nova deu 200. O dono perde o acesso à própria barbearia.
- Correção sugerida: `if (u.papel === "dono" && ctx.usuario.id !== u.id) falha(403, ...)`, ou permitir só o campo `nome`. A troca de senha do dono fica apenas em uma rota "minha senha" que pede a senha atual.

### P-06 · Retorno: `slice(0, 40)` antes do filtro trava o aviso para sempre **[reproduzido]**
- Gravidade sugerida: alta
- Onde: src/servicos/nucleo.js:614-617
- Trecho:
  ```js
  const candidatos = repo.lista("clientes", "WHERE ativo = 1 AND aceita_mensagens = 1 AND fone IS NOT NULL AND ciclo_dias IS NOT NULL AND ultima_visita IS NOT NULL AND retorno_avisado_em IS NULL");
  for (const c of candidatos.slice(0, 40)) {
    const passaram = diasEntre(c.ultima_visita, hojeBR(t));
    if (passaram < c.ciclo_dias + margem) continue;
  ```
- Por que é um problema: o corte em 40 acontece antes de saber quem já passou do ciclo. Quem ainda não venceu nunca é marcado, então ocupa as 40 vagas em toda execução. Sem `ORDER BY`, o SQLite devolve pela ordem do índice `clientes_fone`. Com mais de 40 clientes com ciclo e menor número de celular, os outros nunca recebem o "retorno no tempo certo". Reproduzido: 45 clientes em dia na frente de 1 vencido, `retornos: 0`, `retorno_avisado_em` continua null. A função principal de retenção para de funcionar em qualquer barbearia média, sem nenhum erro aparente.
- Correção sugerida: filtrar no SQL e limitar depois, por exemplo `... AND julianday(?) - julianday(ultima_visita) >= ciclo_dias + ? ORDER BY ultima_visita LIMIT 40`, ou aplicar o `continue` antes de contar até 40.

### P-07 · Remarcar não confere o clube de novo **[reproduzido]**
- Gravidade sugerida: alta
- Onde: src/servicos/nucleo.js:309-321
- Trecho:
  ```js
  const r = cabe({ ... ocupados: ocupados(barbeiro.id, dia, a.id), ... });
  if (!r.ok) recusar(409, r.motivo);
  repo.atualizar("agendamentos", a.id, { inicio: r.inicio, fim: r.fim, barbeiro_id: barbeiro.id, lembrete_em: null });
  ```
- Por que é um problema: `preco_centavos: 0`, `assinatura_id` e o `uso` (com o `ciclo_inicio` antigo) ficam como estavam.
  - Remarcar para o ciclo seguinte gasta o uso do ciclo velho e deixa o novo intacto. Reproduzido: plano com 1 corte por ciclo, horário de 08/12 remarcado para 15/12 continua grátis, e o cliente ainda tem `coberto:true` para mais um corte em 16/12, ou seja, dois cortes num ciclo de um.
  - Também passa para um dia da semana fora do plano, para depois de `ciclo_fim` ou para depois do cancelamento da assinatura, e continua grátis.
  - O remarcar não repete a conferência de conflito do próprio cliente (`agendar` faz isso em nucleo.js:227). Dois horários do mesmo cliente podem se sobrepor.
- Correção sugerida: dentro da transação, apagar o `uso`, recalcular `coberturaDoCliente(a.cliente_id, a.servico_id, dia)`, regravar `preco_centavos`, `assinatura_id` e `uso`, e repetir a conferência de conflito do cliente.

### P-08 · "Faltou" e horário nunca fechado prendem o estoque reservado **[reproduzido]**
- Gravidade sugerida: média
- Onde: src/http/api.js:204-205; ausência de limpeza em src/servicos/nucleo.js:578-625
- Trecho:
  ```js
  if (d.status === "faltou") repo.rodar("DELETE FROM usos WHERE agendamento_id = ?", a.id);
  repo.atualizar("agendamentos", a.id, { status: d.status, ... });
  ```
- Por que é um problema: só `cancelar` libera as reservas (nucleo.js:299). Marcar falta devolve o uso do clube, mas a reserva continua `reservado`. Reproduzido: 2 de 2 unidades reservadas, falta marcada, `disponivel = 0` e reserva `reservado`. Um horário que passou e ficou `agendado` (ninguém fechou) também prende o estoque, porque a rotina não expira reservas. Com o tempo a vitrine do app mostra "0 disponível" para produto que está na prateleira.
- Correção sugerida: no PUT com `faltou`, rodar o mesmo `UPDATE reservas SET status='cancelado' ...`. Na rotina, cancelar reservas cujo agendamento terminou há mais de X horas sem venda.

### P-09 · Mesmo produto em duas linhas da venda deixa o estoque negativo **[reproduzido]**
- Gravidade sugerida: média
- Onde: src/servicos/nucleo.js:346-348 e 364-366
- Trecho:
  ```js
  const p = repo.obter("produtos", it.id) ...
  if (p.estoque < qtd || disponivel(p) + reservado < qtd) recusar(409, ...);
  ...
  const p = repo.obter("produtos", l.id);
  const saldo = p.estoque - l.quantidade;
  repo.atualizar("produtos", p.id, { estoque: saldo });
  ```
- Por que é um problema: cada linha é conferida contra o estoque inteiro, sem descontar as linhas anteriores do mesmo produto. A baixa vem depois, linha a linha. Reproduzido: estoque 3, venda com `[{id:P,quantidade:2},{id:P,quantidade:2}]`, 200 e estoque −1. O mesmo acontece em `concluir` com produto extra igual a um item reservado quando o extra cabe sozinho. Isso contradiz `movimentarEstoque`, que recusa saldo negativo.
- Correção sugerida: somar as quantidades por produto antes de conferir (`Map produto → qtd total`, separando reservado e não reservado) ou agrupar as linhas. Como defesa, `CHECK (estoque >= 0)` na tabela.

### P-10 · Status livre no PUT: faltou → agendado deixa o serviço grátis sem gastar uso
- Gravidade sugerida: média
- Onde: src/http/api.js:202-206
- Trecho:
  ```js
  if (["concluido", "cancelado"].includes(a.status)) falha(409, ...);
  if (d.status === "faltou") repo.rodar("DELETE FROM usos WHERE agendamento_id = ?", a.id);
  repo.atualizar("agendamentos", a.id, { status: d.status, ... });
  ```
- Por que é um problema: não existe máquina de estados. Qualquer status volta para qualquer outro, exceto a partir de concluído e cancelado. Um horário do clube marcado como "faltou" perde o `uso`, mas mantém `assinatura_id` e `preco_centavos: 0`. Se a recepção volta o status para `agendado` ou `chegou` (o cliente chegou atrasado, ou foi engano) e fecha a comanda, o serviço sai pelo clube sem consumir a cota. `em_atendimento` também volta para `agendado` e reentra no lembrete.
- Correção sugerida: tabela de transições permitidas (`agendado→chegou→em_atendimento`, `agendado|chegou→faltou`, `faltou→agendado` só recriando o uso pela cobertura).

### P-11 · `concluir` não confere de novo a assinatura
- Gravidade sugerida: média
- Onde: src/servicos/nucleo.js:386
- Trecho: `const itens = [{ tipo: "servico", id: a.servico_id, quantidade: 1, clube: Boolean(a.assinatura_id) }];`
- Por que é um problema: a cobertura é decidida na hora de agendar (até 30 dias antes). Se a assinatura é cancelada, fica atrasada ou o plano muda nesse meio-tempo, o atendimento continua grátis no fechamento e a comissão "clube" é lançada. `cancelarAssinatura` (nucleo.js:477-484) não toca nos horários futuros.
- Correção sugerida: em `concluir`, se `a.assinatura_id`, chamar `assinaturaValida(repo.obter("assinaturas", a.assinatura_id), hojeBR(a.inicio))`. Se for falso, cobrar o preço e apagar o uso, avisando na resposta. Ou recalcular os horários futuros ao cancelar a assinatura.

### P-12 · Pagamento manual sem idempotência: dois cliques valem dois meses **[reproduzido]**
- Gravidade sugerida: média
- Onde: src/http/api.js:347-351 e src/servicos/nucleo.js:468-471
- Trecho:
  ```js
  let cob = externoId ? repo.um("SELECT * FROM cobrancas WHERE externo_id = ?", externoId) : null;
  ...
  else repo.inserir("cobrancas", { ... status: "paga", forma, externo_id: externoId, pago_em: agora() });
  ```
- Por que é um problema: sem `externoId`, cada chamada cria uma cobrança paga e empurra o ciclo um mês. Reproduzido: depois do pagamento inicial, dois POST `/pagamento` simultâneos deram 200 e 200, 3 cobranças pagas, e o ciclo pulou para 10/01 a 09/02. O caixa (`clube_recebido_centavos`) fica inflado. Se o Asaas está ligado, o pagamento manual não cancela a cobrança aberta lá, e o cliente pode pagar duas vezes o mesmo mês.
- Correção sugerida: chave de idempotência enviada pelo front, ou recusar um segundo pagamento manual do mesmo ciclo (`SELECT 1 FROM cobrancas WHERE assinatura_id=? AND status='paga' AND pago_em > agora()-10min`). Com Asaas, dar baixa na cobrança aberta (`receiveInCash`) em vez de criar outra.

### P-13 · Webhook PAYMENT_OVERDUE fora de ordem marca "atrasada" quem já pagou
- Gravidade sugerida: média
- Onde: src/servicos/nucleo.js:503-507
- Trecho:
  ```js
  if (acao === "atrasada" && a.status !== "cancelada") {
    repo.atualizar("assinaturas", a.id, { status: "atrasada", link: p.invoiceUrl ?? a.link });
  ```
- Por que é um problema: não confere se aquela cobrança já está paga nem se o ciclo atual a cobre. O Asaas reentrega eventos e eles chegam fora de ordem. Um OVERDUE atrasado depois do RECEIVED bloqueia o clube de quem pagou e ainda manda a mensagem "sua mensalidade está em aberto". A tolerância de 3 dias da rotina (nucleo.js:605) também é ignorada por esse caminho.
- Correção sugerida: `const cob = repo.um("SELECT status FROM cobrancas WHERE externo_id = ?", p.id); if (cob?.status === "paga") return { ignorado: true };` e só marcar atrasada se `ciclo_fim < hoje()`.

### P-14 · Webhook sem `value` dá 500 **[reproduzido]**
- Gravidade sugerida: média
- Onde: src/servicos/nucleo.js:495 e 500
- Trecho: `valor_centavos: Math.round(Number(p.value) * 100), vencimento: p.dueDate`
- Por que é um problema: `Number(undefined)` dá NaN, que é gravado como NULL, e o `NOT NULL constraint failed: cobrancas.valor_centavos` responde 500. Reproduzido com PAYMENT_CREATED sem `value`. O Asaas reenvia e, depois de falhas seguidas, interrompe a fila de webhooks da conta. A partir daí nenhum pagamento posterior chega, nem de outros clientes. `p.dueDate` ausente cai no mesmo erro (`vencimento NOT NULL`).
- Correção sugerida: validar o payload com zod (`value: z.number()`, `dueDate: dia`). Para evento malformado, responder 200 com `{ignorado}` e registrar em log, para não travar a fila.

### P-15 · Cliente reserva o estoque inteiro (reservas sem teto)
- Gravidade sugerida: média
- Onde: src/http/app.js:214-221 e src/servicos/nucleo.js:256-262
- Trecho:
  ```js
  const d = validar(z.object({ produto_id: id, quantidade: z.number().int().min(1).max(5) }), await ctx.corpo());
  nucleo.reservar(a, d.produto_id, d.quantidade);
  ```
- Por que é um problema: o teto de 5 vale por chamada. Não há limite por agendamento nem rate limit nessa rota. Um cliente com um horário marcado repete o POST até zerar `disponivel` de todos os produtos da vitrine, e junto com o P-08 a reserva nunca expira.
- Correção sugerida: limite de quantidade total por agendamento, somando as reservas existentes (por exemplo, 5 por produto e 10 no total), e `limitar("reserva:"+cliente.id, ...)`.

### P-16 · Usuário "barbeiro" sem `barbeiro_id` vê a agenda e as vendas de todos **[reproduzido]**
- Gravidade sugerida: média
- Onde: src/http/api.js:565-568 (PUT não exige vínculo), 143, 167, 381, 406
- Trecho:
  ```js
  const d = validar(z.object({ ..., papel: z.enum(["admin", "recepcao", "barbeiro"]).optional(), barbeiro_id: id.optional().nullable(), ...
  ...
  const filtro = ehBarbeiro(usuario) ? usuario.barbeiro_id : query.get("barbeiro") || null;   // null → sem filtro
  ```
- Por que é um problema: o POST exige `barbeiro_id` para o papel barbeiro (linha 556), mas o PUT não exige. Mudar um acesso para "barbeiro" sem escolher o barbeiro (ou com `barbeiro_id: null`) gera `filtro = null`, e as rotas de listagem deixam de filtrar. Reproduzido: recepção rebaixada para barbeiro, `/api/hoje` mostra os horários dos 2 barbeiros. O mesmo vale para `/api/agendamentos`, `/api/vendas` e `/api/comissoes`, onde ele vê a comissão de todos. O PUT também não confere se o `barbeiro_id` existe.
- Correção sugerida: no PUT, repetir as regras do POST (papel barbeiro exige `barbeiro_id` existente). Nas rotas, `if (ehBarbeiro(u) && !u.barbeiro_id) falha(403)`.

### P-17 · Busca de clientes só olha os 2.000 primeiros em ordem alfabética
- Gravidade sugerida: média
- Onde: src/http/api.js:250-253
- Trecho:
  ```js
  let lista = repo.lista("clientes", "WHERE ativo = 1 ORDER BY nome LIMIT 2000");
  if (busca) { lista = lista.filter((c) => c.nome.toLowerCase().includes(busca) || ...
  ```
- Por que é um problema: com mais de 2.000 clientes, quem tem nome depois do 2.000º em ordem alfabética nunca aparece na busca por nome ou celular. A recepção cria um cadastro duplicado, ou é barrada pelo índice único do celular sem conseguir achar o cliente. Os filtros "assinantes", "sumidos" e "aniversário" também ficam incompletos. Toda chamada carrega 2.000 linhas.
- Correção sugerida: filtrar no SQL (`WHERE ativo=1 AND (lower(nome) LIKE ? OR fone LIKE ? OR email LIKE ?) ORDER BY nome LIMIT 300`) e os filtros por subconsulta (`id IN (SELECT cliente_id FROM assinaturas WHERE status='ativa')`).

### P-18 · Limite de códigos por celular furado por pedidos ao mesmo tempo
- Gravidade sugerida: média
- Onde: src/servicos/nucleo.js:92-106
- Trecho:
  ```js
  const recentes = repo.um("SELECT COUNT(*) n FROM codigos WHERE destino = ? AND criado_em > ?", ...).n;
  if (recentes >= cfg.limites.codigosPorHora) recusar(429, ...);
  ...
  await c.whatsapp.texto(fone, texto);          // await antes do insert
  ...
  repo.inserir("codigos", { destino: fone, ... });
  ```
- Por que é um problema: a contagem acontece antes do `await` do envio e o insert depois. N pedidos simultâneos para o mesmo número passam todos pelo limite de 5 por hora (o limite por IP, de 10 por hora, só segura parcialmente com vários IPs). O efeito é bombardeio de SMS e WhatsApp contra um terceiro e custo de SMS para a barbearia. Além disso, `conferirCodigo` apaga todos os códigos do número quando acerta (linha 121), e isso zera a contagem por hora.
- Correção sugerida: inserir o registro (ou um marcador "enviando") antes do `await`, e apagá-lo se o envio falhar. Para a contagem por hora, usar uma tabela de envios que não é apagada no acerto (por exemplo `envios` com `motivo='codigo'`).

### P-19 · Corrida no primeiro cadastro cria duas barbearias e dois donos
- Gravidade sugerida: baixa
- Onde: src/http/api.js:81-91
- Trecho:
  ```js
  if (repo.contarUsuarios() > 0) falha(403, ...);
  limitar(`cadastro:${ip}`);
  const b = await corpo();              // a conferência fica antes do await
  ...
  const u = repo.transacao(() => { const bb = repo.inserir("barbearias", ...); ... });
  ```
- Por que é um problema: dois POST `/api/cadastro` simultâneos passam pela conferência e criam duas barbearias e dois donos. Todas as consultas são globais (não filtram por `barbearia_id`) e `repo.barbearia()` pega a primeira, então o segundo "dono" tem acesso total à barbearia real. Em produção o código de instalação reduz o risco. Sem `INSTALL_CODE` em ambiente não-produção, qualquer um que chegue primeiro vira dono.
- Correção sugerida: repetir `if (repo.contarUsuarios() > 0) falha(403)` dentro de `repo.transacao`.

### P-20 · Desempenho: N+1 no `detalhar`, faixas sem limite, índices faltando
- Gravidade sugerida: média
- Onde:
  - src/servicos/nucleo.js:268-285 (`detalhar` faz 4 consultas fixas, mais `identificarAssinante` com 2 a 3 e mais 2 a 3 em `assinanteDoHorario`, de 8 a 10 por horário)
  - src/http/api.js:164-169 (`/api/agendamentos?de=&ate=` sem limite de faixa)
  - src/http/api.js:333-341 (`/api/assinaturas`: sem LIMIT e com 3 consultas por linha)
  - src/http/api.js:318 (`/api/planos`: COUNT por plano)
  - src/http/api.js:356 e src/http/app.js:46 (`disponivel` por produto)
  - src/http/app.js:175-177 (`diasDisponiveis`: 21 dias × barbeiros × `livres`, cada um com `exigirBarbearia` e consultas, a cada abertura do app)
- Trecho:
  ```js
  return repo.lista("agendamentos", `WHERE inicio >= ? AND inicio < ? ...`, paraMs(de), paraMs(ate) + 86400_000, ...).map(nucleo.detalhar);
  ```
- Por que é um problema: `?de=2026-01-01&ate=2026-12-31` monta milhares de horários com cerca de 10 consultas cada, em SQLite síncrono. Isso trava o event loop de todo o servidor (app do cliente, webhooks) durante a montagem. Faltam índices para os filtros mais usados:
  - `reservas(produto_id, status)` e `reservas(agendamento_id)`
  - `usos(assinatura_id, servico_id, ciclo_inicio)`
  - `espera(dia, status)` e `espera(oferta_hash)`
  - `bloqueios(barbeiro_id, inicio)`
  - `assinaturas(asaas_assinatura)`, usado em todo webhook
  - `agendamentos(status, inicio)`, usado no lembrete a cada 5 min
  - `comissoes(dia)` sem barbeiro e `vendas(cliente_id)`
  - `cobrancas(pago_em)`
- Correção sugerida: limitar a faixa (por exemplo 31 dias) e paginar `/api/assinaturas`. Em `detalhar` para listas, carregar serviços, barbeiros e clientes em Map uma vez por chamada e as reservas com `WHERE agendamento_id IN (...)`. Criar os índices listados no `ESQUEMA`.

### P-21 · Comanda cobra o preço atual do serviço, não o preço confirmado ao cliente
- Gravidade sugerida: baixa
- Onde: src/servicos/nucleo.js:342-344
- Trecho: `linhas.push({ tipo: "servico", ..., unitario_centavos: s.preco_centavos, total_centavos: clube ? 0 : s.preco_centavos * qtd, ...`
- Por que é um problema: o agendamento grava `preco_centavos` (nucleo.js:238) e o app mostra esse preço ao cliente. Se o dono reajusta a tabela, quem agendou antes paga o preço novo no fechamento, e o relatório mistura os dois valores.
- Correção sugerida: em `concluir`, passar o `a.preco_centavos` (ou o preço do agendamento quando não é clube) como unitário da linha do serviço.

### P-22 · Erros de borda: cookie malformado dá 500, data impossível é aceita **[reproduzido]**
- Gravidade sugerida: baixa
- Onde: src/http/roteador.js:35 e 73; src/http/validacao.js:11; src/regras/datas.js:9
- Trecho:
  ```js
  if (i > 0) r[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  export const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, ...);
  ```
- Por que é um problema: `Cookie: nx_barber=%E0%A4%A` lança URIError e o servidor responde 500 com log de erro (reproduzido). O mesmo vale para `%` solto num parâmetro de rota. `dia` aceita `2026-02-31`, e `Date.parse` o converte em silêncio para 03/03: o horário é gravado num dia diferente do que a string diz, e a string vai para `espera.dia` e `entrarNaEspera`. `2026-13-45` vira NaN e devolve listas vazias com 200, em vez de 400.
- Correção sugerida: `try { decodeURIComponent } catch { ignorar o cookie }`. No zod, `dia.refine((v) => hojeBR(paraMs(v)) === v, "data inválida")`.

### P-23 · Lembrete diz "hoje" quando o horário é amanhã
- Gravidade sugerida: baixa
- Onde: src/servicos/nucleo.js:586 e 591
- Trecho: ``texto: `⏰ ... lembrete: ${d.servico.nome} com ${d.barbeiro.nome} hoje às ${d.hora}...` ``
- Por que é um problema: `lembrete_horas` aceita até 48 (api.js:475). Com o padrão de 3 h o texto quase sempre acerta, mas com 12 h ou 24 h (configuração comum para lembrete na véspera) o cliente recebe "hoje às 09:00" no dia anterior. O lembrete também é marcado como enviado (`lembrete_em`) antes do envio e nunca é tentado de novo se WhatsApp e SMS falharem.
- Correção sugerida: usar `quando(a.inicio)` no texto, como o modelo já faz nos parâmetros, e só gravar `lembrete_em` se `envio.enviado`, com limite de tentativas.

### P-24 · Bloqueio por e-mail no login permite trancar o dono de fora
- Gravidade sugerida: baixa
- Onde: src/http/api.js:99-100
- Trecho: ``limitar(`login:${ip}`); limitar(`login:${d.email}`);``
- Por que é um problema: qualquer pessoa que sabe o e-mail do dono faz 8 tentativas erradas a cada 15 min, de IPs diferentes, e o dono não consegue entrar enquanto isso durar. O contador também conta logins certos.
- Correção sugerida: contar só as falhas, por e-mail, com janela crescente, e não bloquear o par e-mail + IP que já entrou com sucesso.

### P-25 · Detalhes de segurança no código
- Gravidade sugerida: baixa
- Onde:
  - src/servicos/nucleo.js:117 (`if (c.hash !== hashCodigo(...))`, comparação comum de HMAC)
  - src/http/api.js:498 e 524 (`token_webhook` aceita 1 caractere e aceita o literal `"false"`; o sentinela `"true"` é frágil)
  - src/servicos/nucleo.js:454 e src/servidor.js:259 (status 502 devolve `e.message` do Asaas, da Meta ou do Twilio ao cliente final)
- Trecho: ``recusar(502, `Não foi possível gerar a cobrança: ${e.message}`);`` e `json(res, status, { erro: status < 500 || status === 502 ? err.message : "Erro interno." });`
- Por que é um problema: o vazamento por tempo é pequeno porque o HMAC tem chave, mas o projeto já tem `iguais()`. Um token de webhook curto ou previsível autentica webhooks falsos de pagamento, e isso ativa o clube de graça. A mensagem do provedor pode expor detalhes da conta (por exemplo "invalid access_token for wallet X") ao cliente do app.
- Correção sugerida: usar `iguais(c.hash, ...)`, exigir `token_webhook` com `min(24)` (ou só gerar no servidor), e devolver uma mensagem fixa ao cliente com o detalhe só no log ou em `envios`.

### P-26 · Manutenção e testes
- Gravidade sugerida: informativa
- Onde e trecho:
  - src/servicos/nucleo.js:24-675: `criarNucleo` é um único fechamento de 650 linhas com agenda, caixa, estoque, clube, Asaas, fila e rotina. Mexer em qualquer regra exige ler o arquivo inteiro.
  - Código morto: `const reais = ...` em nucleo.js:22 não é usado. `competencia` (datas.js:18) e `mesmoFone` (canais.js:14) não têm chamadas.
  - Duplicação: o cálculo de "sumido" aparece em api.js:257 e de novo em api.js:466. A receita do clube aparece em api.js:336 e api.js:449. O caminho de cancelar reserva existe em nucleo.js:299 e app.js:225, e falta no "faltou" (P-08).
  - api.js:566-568 e 312: as regras de permissão estão espalhadas em `if`s dentro das rotas, e foi isso que gerou o P-05 e o P-16.
  - Relatórios: `servicos_centavos + produtos_centavos` não fecha com `total_centavos` quando há desconto manual (api.js:397-400 somam `total_centavos` das linhas antes do desconto).
  - `oferta_hash` não é limpo quando a oferta volta para a fila (nucleo.js:566 e 598). É inofensivo, mas deixa lixo de estado.
  - `cancelarVenda` (nucleo.js:407) apaga comissões de meses já fechados sem trava de período.
  - Testes: os 25 passam, mas nenhum cobre estorno, reentrega de webhook, renovação antecipada, remarcar no clube, falta com reserva, venda com linha repetida, retorno com mais de 40 clientes ou pedidos simultâneos. Os achados P-01 a P-14 passam todos pela suíte atual.
- Correção sugerida: separar `nucleo.js` em `agenda.js`, `caixa.js`, `clube.js` e `espera.js` (o `repo` continua compartilhado). Criar uma função única `liberarReservas(agId)`, uma tabela de permissões por papel e testes de regressão para cada achado acima.

## Pontos fortes do código
- **Dinheiro em centavos inteiros** de ponta a ponta. O zod valida `centavos` como inteiro (validacao.js:15), o desconto é limitado ao subtotal (nucleo.js:356), o rateio do desconto na base das comissões usa um fator e `Math.round` (nucleo.js:361-374) e `paraCentavos` no front arredonda (public/js/comum.js:61-64).
- **Concorrência de agenda bem resolvida**: `node:sqlite` síncrono, `BEGIN IMMEDIATE` e `busy_timeout` (db.js:136 e 169), e conferência e insert na mesma transação síncrona (nucleo.js:206-246). Dois clientes não pegam o mesmo horário, o que o teste confirma. A vaga relâmpago também é segura: a aceitação passa por `agendar`, e quem perde volta para a fila (nucleo.js:558-575).
- **Datas de Brasília centralizadas** em um único módulo, com UTC−3 fixo (correto desde 2019) e aritmética de dias ao meio-dia UTC para evitar erro de virada (datas.js:11-12). `somarMeses` trata 31/01 → 28/02.
- **Segurança de base sólida**:
  - scrypt com N = 2^17 e refazer o hash no login
  - AES-256-GCM para os segredos
  - `timingSafeEqual` em senha, token de instalação, webhook da Meta e do Asaas
  - CSRF por cabeçalho `x-nexor`
  - CSP separada para o painel e para o app
  - caminho estático protegido contra `..`
  - HMAC por destino nos códigos de acesso
  - login falso com `HASH_FALSO` contra enumeração de e-mail
- **Mapas em memória limitados** (`tentativas` em 20.000, `respondidos` em 5.000, `usados` com limpeza) e timers com `unref()`.
- **SQL parametrizado** em todo lugar. A única interpolação é de nomes de tabela e coluna vindos do próprio código e filtrados por `colunas[tabela]` (db.js:157).
- **Lembrete e retorno marcados antes do `await`**, o que evita mensagem duplicada mesmo com execuções da rotina sobrepostas.
- **Idempotência básica do webhook** por `externo_id UNIQUE`, que cobre o par PAYMENT_CONFIRMED + PAYMENT_RECEIVED do cartão (a falha está no caso de estorno, P-04).
