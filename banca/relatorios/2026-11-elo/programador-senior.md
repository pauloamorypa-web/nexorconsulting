# Relatório do Agente Programador Sênior · Nexor Elo · 2026-11-11
Arquivos lidos: elo/PRODUTO.md, elo/API.md, src/servicos/negocio.js, src/servicos/adaptadores.js, src/servicos/privacidade.js, src/regras/calculadora.js, src/regras/datas.js, src/config.js, src/db.js, src/servidor.js, src/http/api.js, src/http/fornecedor.js, src/http/instalador.js, src/http/publico.js, src/http/validacao.js, src/seguranca.js (iguais), public/publico/proposta.js (pagamento), public/app/proposta.js (calculadora), test/privacidade.test.js, test/reservas.test.js · Tamanho: src 3.488 linhas; public JS 5.179 linhas · `npm test`: 20/20 passando

## Achados

### P-01 · Cobrança "cancelada" só no banco continua viva no Asaas e, se for paga, é confirmada (pagamento em dobro, estoque baixado duas vezes, proposta cancelada vira "paga")
- Gravidade sugerida: crítica
- Onde: src/servicos/negocio.js:331, :254, :345, :350, :359; src/servicos/adaptadores.js:65-77
- Trecho:
  ```js
  // negocio.js:331 (pagar, nova forma de pagamento)
  repo.rodar("UPDATE pagamentos SET status = 'cancelado', atualizado_em = ? WHERE proposta_id = ? AND status = 'pendente'", agora(), p.id);
  // negocio.js:254 (cancelar proposta)
  if (cancelar) repo.rodar("UPDATE pagamentos SET status = 'cancelado' ...");
  // negocio.js:345-350 (confirmarPagamento)
  if (pg.status === "pago") return { ok: true, repetido: true };
  ...
  repo.atualizar("propostas", p.id, { status: "paga", paga_em: agora() });
  // negocio.js:359 (sem reserva ativa: baixa direto)
  const ok = repo.rodar("UPDATE produtos SET estoque = estoque - ? ... WHERE id = ? AND estoque - reservado >= ?", ...)
  ```
  O adaptador do Asaas (adaptadores.js:65-77) só tem `criarCliente`, `criarCobranca`, `criarAssinatura` e `cancelarAssinatura`. Não existe chamada para cancelar (`DELETE /payments/{id}`) nem estornar uma cobrança.
- Por que é um problema: o cliente gera um Pix (QR guardado no celular) e depois pede o cartão em 3x. A linha 331 marca o Pix como `cancelado` só no banco, e o QR continua pagável no Asaas. Se o cliente pagar os dois: (1) o webhook do Pix chega, `pg.status` é `cancelado` (não é `pago`) e a confirmação roda inteira; (2) o webhook do cartão chega e roda tudo de novo. As reservas já estão `baixada`, então cai no ramo da linha 359 e o estoque é baixado de novo. Os repasses do segundo pagamento viram `recebido`, e os títulos `sem_wallet` da linha 367 são criados duas vezes. Com a proposta cancelada (linha 254) acontece o mesmo: a cobrança continua aberta no Asaas, o cliente paga e a proposta `cancelada` passa para `paga`, com baixa de estoque. Também não há trava contra a transição `cancelada → paga`.
- Correção sugerida: ao cancelar no banco, cancelar também no Asaas (`DELETE /payments/{id}`, ou `/installments/{id}` no parcelado), dentro de uma rotina que tente de novo quando falhar. Em `confirmarPagamento`, só processar quando `pg.status === 'pendente'` e a proposta não estiver `paga`/`cancelada`. Nos outros casos, gravar como "pagamento órfão", avisar a Nexor e o instalador, e estornar (`POST /payments/{id}/refund`):
  ```js
  if (pg.status !== "pendente" || ["paga","cancelada"].includes(p.status)) return registrarOrfao(pg, p);
  ```

### P-02 · Corrida no `pagar()`: dois cliques geram duas cobranças reais no Asaas, e a proposta pode ter sido cancelada durante o `await`
- Gravidade sugerida: alta
- Onde: src/servicos/negocio.js:318-338; src/http/publico.js:63-66
- Trecho:
  ```js
  const aberto = repo.ler("pagamentos", repo.um("SELECT * FROM pagamentos WHERE proposta_id = ? AND status = 'pendente' AND forma = ? AND parcelas = ?", ...));
  if (aberto) return aberto;
  ...
  const cliente = await asaasPlataforma.criarCliente(...);
  const cobranca = await asaasPlataforma.criarCobranca(...);
  return repo.transacao(() => { repo.rodar("UPDATE pagamentos SET status = 'cancelado' ..."); ... });
  ```
  Em publico.js:63 a proposta `p` é lida antes de `await ctx.corpo()` e não é relida depois dos dois `await` do Asaas, que podem levar até 10 s cada (`PRAZO_MS`).
- Por que é um problema: duas requisições simultâneas (duplo toque, aba duplicada) passam pela checagem de `aberto`, porque nenhuma inseriu nada ainda, e criam duas cobranças no Asaas. A segunda transação cancela a primeira só no banco, e essa primeira já devolveu o link ao cliente. Volta-se ao P-01. Além disso, entre a leitura e a transação o instalador pode cancelar ou reabrir a proposta: `encerrar` (linha 250) não vê cobrança pendente porque ela ainda não existe. Resultado: um pagamento `pendente` fica ligado a uma proposta cancelada ou em rascunho, com a cobrança viva.
- Correção sugerida: reservar a vaga antes de chamar o Asaas. Dentro de `repo.transacao`, reler a proposta (`status === 'aceita'`, reserva válida) e inserir um pagamento `criando`, com índice único parcial `CREATE UNIQUE INDEX pag_aberto ON pagamentos(proposta_id) WHERE status IN ('criando','pendente')`. Depois do Asaas, passar para `pendente`. Se falhar, apagar o registro.

### P-03 · Estorno, chargeback, exclusão e vencimento da cobrança são ignorados: repasses, títulos e estoque nunca são desfeitos
- Gravidade sugerida: alta
- Onde: src/servicos/negocio.js:396, :404
- Trecho:
  ```js
  const pago = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED_IN_CASH"].includes(evento?.event);
  ...
  if (!pago) return { ignorado: evento?.event ?? "sem evento" };
  ```
  `grep -rn "REFUND|CHARGEBACK|DELETED|OVERDUE" src test` não retorna nada.
- Por que é um problema: o cliente paga no cartão e abre chargeback. Pelo Asaas o dinheiro volta, mas no Elo a proposta continua `paga`, os repasses continuam `recebido` (o painel do fornecedor, fornecedor.js:304, soma esse valor como recebido) e a taxa da Nexor continua contada em `/api/nexor/metricas` (api.js:244). Pior: o título `sem_wallet` (negocio.js:367) continua `aberto` contra o instalador, que não recebeu nada. Quando vence, o título bloqueia o instalador por inadimplência (negocio.js:110-111). Ninguém é avisado de que precisa recolher a mercadoria ou rever a baixa de estoque.
- Correção sugerida: tratar `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_DELETED` e `PAYMENT_OVERDUE`. Isso pede um status novo no pagamento (`estornado`/`contestado`), repasses `cancelado`, títulos `sem_wallet` da proposta `cancelado`, notificação para as três partes e auditoria. O estoque não volta sozinho (a mercadoria pode ter saído), mas o fornecedor recebe um aviso com a ação de "devolver ao estoque". Também é preciso um teste com cada evento.

### P-04 · A taxa do Asaas não entra no split: o valor fixo repassado é `total − taxa da plataforma`, e a tarifa do meio de pagamento fica sem dono
- Gravidade sugerida: alta
- Onde: src/servicos/negocio.js:305-309; src/servicos/adaptadores.js:71-72; src/config.js:349; public/app/proposta.js:43; src/http/api.js:244
- Trecho:
  ```js
  const taxa = p.taxa_plataforma_centavos;            // 2,5% (TAXA_PLATAFORMA_BPS=250)
  const instalador = p.total_centavos - comWallet - taxa;
  partes.push({ destino: "instalador", ..., centavos: instalador, via: "split", walletId: walletInst });
  // adaptadores.js:71
  split: split.map((s) => ({ walletId: s.walletId, totalFixedValue: reais(s.centavos) }))
  ```
  O app do instalador já vem com a taxa do meio de pagamento como custo dele: `taxa_meio_fixa_centavos: 199` (public/app/proposta.js:43). E a página pública promete "12x de total/12" (public/publico/proposta.js:46, :129), ou seja, sem repassar juros.
- Por que é um problema: a cobrança sai da conta Asaas da plataforma, então a tarifa do Asaas é descontada de lá. Os splits fixos somam `total − 2,5%`. Em qualquer forma cuja tarifa passe de 2,5% do valor, a soma dos splits fica maior que o líquido da cobrança: cartão em várias parcelas (com antecipação ainda mais), ou Pix/boleto de valor pequeno com tarifa fixa (ex.: proposta de R$ 50, em que 2,5% = R$ 1,25). Nesse caso, ou o Asaas recusa a criação (o cliente vê `502 O Asaas recusou...`), ou a Nexor paga a diferença do próprio bolso. É preciso conferir as tarifas do contrato Asaas da Nexor, mas a conta não fecha em nenhum lugar do código. Ao mesmo tempo, a calculadora desconta essa tarifa do lucro do instalador, coisa que o split real não faz. E a métrica `taxa_plataforma_centavos` (api.js:244) mostra receita bruta como se fosse líquida. Caso de borda: com `instalador === 0` (linha 307 permite), vai um split de R$ 0,00 para o Asaas.
- Correção sugerida: criar em `cfg.asaas` uma tabela de tarifas por forma e número de parcelas, calcular `tarifa_meio` em `totais()` e descontá-la da parte do instalador (`instalador = total − comWallet − taxa − tarifa_meio`). A validação de `reservar` (linha 157) passa a incluir a tarifa. A calculadora deve usar a mesma tabela, e `split.filter(x => x.centavos > 0)` resolve o caso de borda. Também é preciso um teste com 12x.

### P-05 · Limite de crédito do fornecedor sem walletId não considera as outras propostas com reserva ativa
- Gravidade sugerida: média
- Onde: src/servicos/negocio.js:98-106, :166
- Trecho:
  ```js
  "SELECT COALESCE(SUM(valor_centavos),0) abertos ... FROM titulos WHERE fornecedor_id = ? AND instalador_id = ? AND status = 'aberto'"
  disponivel_centavos: Math.max(0, v.limite_credito_centavos - t.abertos),
  ...
  if (!segredo(f.config.wallet_cripto) && custo > c.disponivel_centavos) falha(409, ...)
  ```
- Por que é um problema: o título só nasce no pagamento (linha 367). Com limite de R$ 10.000, o instalador envia três propostas de R$ 8.000 em sequência e as três passam na checagem, porque `abertos` continua 0. Se as três forem pagas, o fornecedor fica com R$ 24.000 a receber de alguém a quem deu crédito de R$ 10.000.
- Correção sugerida: em `credito()`, somar também `SUM(r.quantidade * i.custo_unit_centavos)` das reservas `ativa` e das propostas `aceita` com pagamento pendente desse fornecedor e instalador, sempre que o fornecedor não tiver wallet.

### P-06 · Renovar uma reserva ainda ativa ignora bloqueio manual e bloqueio por inadimplência
- Gravidade sugerida: média
- Onde: src/servicos/negocio.js:235-238
- Trecho:
  ```js
  const expira = agora() + prazo * 86400_000;
  for (const x of ativas) repo.atualizar("reservas", x.id, { expira_em: expira });
  repo.atualizar("propostas", p.id, { reserva_expira_em: expira, renovacoes: 1 });
  ```
- Por que é um problema: só o ramo da proposta `expirada` passa por `reservar()`, que checa `c.bloqueado` (linha 165). Um instalador com título vencido, ou bloqueado manualmente, consegue prender o estoque do fornecedor por mais N dias, e o PRODUTO.md diz que "títulos vencidos bloqueiam novas reservas". Também não se confere `validade_dia`.
- Correção sugerida: antes de estender, rodar para cada fornecedor da proposta a mesma checagem de `vinculo`/`credito().bloqueado` usada em `reservar`, e recusar se `p.validade_dia < hoje()`.

### P-07 · Cobrança vencida nunca sai de "pendente": o instalador não consegue mais reabrir a proposta, e a reserva vence antes do boleto
- Gravidade sugerida: média
- Onde: src/servicos/negocio.js:250, :404, :412-415; src/config.js:355
- Trecho:
  ```js
  if (repo.um("SELECT 1 FROM pagamentos WHERE proposta_id = ? AND status = 'pendente'", p.id) && !cancelar) falha(409, "Há uma cobrança em aberto para esta proposta.");
  ...
  vencimentoDias: 3,
  ```
- Por que é um problema: o cliente gera um boleto e não paga. Como `PAYMENT_OVERDUE` é ignorado (P-03), o pagamento fica `pendente` para sempre, e "reabrir para editar" devolve 409 eternamente (só sobra cancelar, que cai no P-01). Além disso, a rotina (linhas 412-415) vence propostas `aceita` com cobrança pendente, porque só poupa as que já têm pagamento `pago`. A reserva de 1 a 2 dias acaba e o estoque é liberado, enquanto o boleto vale 3 dias. O cliente paga dentro do prazo do boleto e cai em `estoque_insuficiente` (linhas 376-379).
- Correção sugerida: tratar `PAYMENT_OVERDUE` (marcar vencido e liberar a reabertura). Na rotina, adiar a expiração enquanto houver cobrança pendente dentro do vencimento, ou gerar a cobrança com `dueDate <= hojeBR(reserva_expira_em)`.

### P-08 · NFS-e ignora o desconto; idempotência das notas é "consulta e depois emite"
- Gravidade sugerida: média
- Onde: src/http/instalador.js:246-252, :262; src/http/fornecedor.js:270-272, :282; src/db.js:124
- Trecho:
  ```js
  const valor = servicos.reduce((s, i) => s + i.preco_unit_centavos * i.quantidade, 0);   // sem desconto
  ...
  const ja = repo.ler("notas", repo.um("SELECT * FROM notas WHERE ref = ?", ref));
  if (ja) return ja;
  const res = await fiscal.emitir(...);
  const nota = repo.inserir("notas", {...});   // ref UNIQUE
  ```
- Por que é um problema: proposta com R$ 1.000 de serviço, R$ 2.000 de produtos e R$ 300 de desconto. O cliente pagou R$ 2.700, mas a NFS-e sai com R$ 1.000 de serviço, porque o desconto não é rateado. O ISS fica superestimado e o documento não confere com o recebido. Em dois cliques simultâneos, os dois passam pelo `ja` e chamam a Focus. O segundo `inserir` estoura a `UNIQUE(ref)`, devolve 500 "Erro interno" e não grava resposta nenhuma. A busca por `ref` também não filtra `conta_id` (fornecedor.js:271), e a ref usa só 8 caracteres de cada UUID.
- Correção sugerida: ratear `desconto_centavos` proporcionalmente entre os itens, ajustando o último centavo para a soma bater, e usar o valor rateado na NFS-e. Gravar a nota como `emitindo` numa transação antes do `await` e completar depois. Na busca, usar `WHERE ref = ? AND conta_id = ?` e o UUID inteiro na ref.

### P-09 · Aceite público usa a proposta lida antes do `await` e grava sem rechecar o status
- Gravidade sugerida: baixa
- Onde: src/http/publico.js:58-60; src/servicos/negocio.js:279-283
- Trecho:
  ```js
  const p = buscar("propostas", ctx);
  const d = validar(..., await ctx.corpo());
  return propostaPublica(negocio.aceitar(p, ...));
  // negocio.js:283
  repo.atualizar("propostas", p.id, { status: "aceita", ... });
  ```
- Por que é um problema: se o instalador cancela ou reabre enquanto o corpo da requisição ainda chega, `aceitar` grava `status: "aceita"` por cima de uma proposta `cancelada`/`rascunho`. Dois aceites simultâneos também gravam duas vezes, e o último nome sobrescreve o primeiro.
- Correção sugerida: dentro de `repo.transacao`, reler a proposta e usar um UPDATE condicional (`... WHERE id = ? AND status IN ('enviada','vista')`), conferindo `changes`.

### P-10 · `segredo()` engole erro de decifragem: um walletId corrompido vira "fornecedor sem wallet" em silêncio
- Gravidade sugerida: média
- Onde: src/servicos/negocio.js:18-24, :166, :301-302
- Trecho:
  ```js
  const segredo = (v) => { try { return v ? cofre.decifrar(v) : ""; } catch { return ""; } };
  ...
  partes.push({ destino: "fornecedor", ..., via: w ? "split" : "titulo", walletId: w || null });
  ```
- Por que é um problema: se a cifra de uma conta não decifrar (troca de `MASTER_KEY`, restauração parcial, campo corrompido), o dinheiro dos produtos vai para o instalador e nasce um título. O fornecedor deixa de receber pelo split sem nenhum log ou alerta.
- Correção sugerida: diferenciar "não configurado" (`!v`) de "falha ao decifrar". No segundo caso, registrar `console.error` e auditoria, e recusar a cobrança com 503 em vez de rebaixar para título.

### P-11 · OS: garantia recalculada a cada edição, status sem máquina de estados, assinatura sobrescrevível e arquivos sem limpeza
- Gravidade sugerida: média
- Onde: src/http/instalador.js:373-374, :352-361, :394-401, :383-387
- Trecho:
  ```js
  const base = hoje();
  const series = d.series.map((s) => ({ ...s, garantia_ate: s.serie && s.garantia_meses ? somarMeses(base, s.garantia_meses) : null }));
  ...
  if (["concluida", "cancelada"].includes(o.status)) falha(409, ...);   // única regra de transição
  ...
  const arquivo = `assinatura.${img.ext}`;   // sem checar status nem se já assinou
  ...
  const f = repo.inserir("os_fotos", { ..., arquivo: "pendente" }); writeFileSync(...);
  ```
- Por que é um problema: (1) corrigir um número de série um ano depois empurra a garantia de todos os itens para mais um ano a partir da data da correção. A base deveria ser a conclusão ou instalação. (2) Dá para ir de `agendada` direto para `concluida`, ou de `em_execucao` de volta para `agendada`, e o histórico público mostra isso ao cliente. (3) Depois de `concluida`, o técnico ainda pode trocar a assinatura do cliente, porque o arquivo fixo é sobrescrito, e assim a prova do aceite se perde. (4) Se o `writeFileSync` falhar, fica uma linha `pendente` que conta no limite de 30 fotos. Não há rota nem rotina que apague fotos e assinaturas de OS canceladas (retenção LGPD), e não há tratamento de arquivo ausente: `readFileSync` (linha 419) devolve 500.
- Correção sugerida: guardar `garantia_ate` calculada uma vez, a partir de `concluida_em` (ou do dia da instalação), e só recalcular quando `garantia_meses` mudar. Criar um mapa de transições permitidas (`agendada→a_caminho|em_execucao|cancelada`, ...). Recusar assinatura com a OS encerrada ou já assinada. Gravar a foto numa transação com o arquivo `${id}.${ext}` definido antes, apagando a linha se a escrita falhar. Criar uma rotina de retenção.

### P-12 · Faltam índices nas colunas mais filtradas (consultas fazem varredura completa)
- Gravidade sugerida: média
- Onde: src/db.js:73-95, :111-112
- Trecho: só existem `reservas_status (status, expira_em)`, `itens_proposta`, `itens_fornecedor`, `titulos_vinculo (fornecedor_id, instalador_id, ...)`, `notificacoes_conta` e `auditoria_conta`. Consultas sem índice:
  - `reservas WHERE proposta_id` (negocio.js:186, :227, :351; fornecedor.js:201; instalador.js:183) e `reservas WHERE fornecedor_id` (fornecedor.js:155, :212, :297-298);
  - `pagamentos WHERE proposta_id` (negocio.js:250, :318, :331, :415; fornecedor.js:200; publico.js:30);
  - `repasses WHERE pagamento_id / proposta_id / conta_id` (negocio.js:364, :374; fornecedor.js:220, :304; instalador.js:458);
  - `propostas WHERE status IN (...) AND reserva_expira_em` (rotina, negocio.js:412, :426, a cada 5 min);
  - `titulos WHERE status='aberto' AND vencimento < ? AND vencido_avisado=0` (negocio.js:432) e `titulos WHERE instalador_id` (instalador.js:104, :461): o índice existente começa por `fornecedor_id`;
  - `vinculos WHERE instalador_id` (negocio.js:76; instalador.js:72): o UNIQUE começa por `fornecedor_id`;
  - `clientes WHERE instalador_id`, `os_fotos/os_historico WHERE os_id`, `contrato_cobrancas WHERE contrato_id`, `notas/envios WHERE conta_id`, `sessoes WHERE usuario_id`.
- Por que é um problema: no SQLite, uma chave estrangeira não cria índice. `GET /api/fornecedor/propostas` faz até 500 projeções, e cada uma varre `reservas` e `pagamentos` inteiras. Com 50 mil reservas, são dezenas de milhões de linhas lidas de forma síncrona no laço de eventos, e o servidor inteiro trava.
- Correção sugerida: acrescentar ao ESQUEMA (`CREATE INDEX IF NOT EXISTS`): `reservas(proposta_id)`, `reservas(fornecedor_id, status)`, `pagamentos(proposta_id, status)`, `repasses(pagamento_id)`, `repasses(conta_id, destino, status)`, `propostas(status, reserva_expira_em)`, `titulos(status, vencimento)`, `titulos(instalador_id, status)`, `vinculos(instalador_id, status)`, `clientes(instalador_id)`, `os_fotos(os_id)`, `os_historico(os_id)`, `contrato_cobrancas(contrato_id)`, `notas(conta_id)`, `envios(conta_id)`, `sessoes(usuario_id)`.

### P-13 · Consultas N+1 e listas sem paginação nos painéis
- Gravidade sugerida: média
- Onde: src/http/fornecedor.js:122-139, :197-216, :232-237; src/http/instalador.js:61-66, :72, :94-101, :104, :426; src/servicos/negocio.js:84
- Trecho:
  ```js
  // fornecedor.js:125 — para cada vínculo, score() faz 6 consultas (uma com subquery em proposta_itens e um JOIN)
  const s = negocio.score(v.instalador_id, v.fornecedor_id);
  ...
  return repo.lista("vinculos", "WHERE fornecedor_id = ? AND (? = '' OR status = ?) ORDER BY criado_em DESC", ...)   // sem LIMIT
  // fornecedor.js:236 — títulos sem LIMIT
  // instalador.js:95 — POST /comparar: 100 itens; codigo/termo opcionais
  z.array(z.object({ codigo: op(60), termo: op(80), quantidade: qtd })).min(1).max(100)
  ```
- Por que é um problema: um fornecedor com 300 instaladores faz cerca de 2.700 consultas cada vez que abre a tela de vínculos. `GET /propostas` chega a 500 × 4 consultas (somando o P-12). `POST /api/instalador/comparar` com 100 itens vazios (`{}` passa no esquema) roda `catalogo()` com busca vazia para cada fornecedor vinculado: 100 × N × 500 produtos montados num único pedido síncrono. O catálogo corta em `LIMIT 500` antes do filtro `visivel` (negocio.js:84-85), então produtos além do 500º nunca aparecem e não há página seguinte.
- Correção sugerida: paginação (`limite`/`cursor`) nas listas. Score calculado em lote (um `GROUP BY instalador_id`) ou em cache por dia. No esquema de `/comparar`, exigir `codigo` ou `termo` com 2 ou mais letras, como o GET já faz (instalador.js:90). No catálogo, mover a visibilidade para o SQL e paginar.

### P-14 · Calculadora: alíquota efetiva do Simples não é calculada, uma única alíquota vale para venda mista, e "outros" conta como serviço
- Gravidade sugerida: baixa
- Onde: src/regras/calculadora.js:267-270, :286-289; src/http/instalador.js:273
- Trecho:
  ```js
  if (regime.tipo === "simples") { ... return { itens: [["Simples Nacional (DAS)", regime.aliquota_pct]], avisos }; }
  ...
  const parcelaServico = custos > 0 ? (servicos + outros) / custos : 1;
  ```
- Por que é um problema: a fórmula principal está correta (P − impostos − taxas − custos = margem × P, conferida no teste e na conta). Os problemas estão nas entradas. (1) O PRODUTO promete a "alíquota efetiva" do Simples, mas o código usa o número digitado. O anexo só muda o texto, e um instalador que digitar a alíquota nominal da faixa (ex.: 11,2% do anexo III, faixa 2) superestima o imposto. A efetiva `(RBT12 × Alíq − PD) / RBT12` não é calculada. (2) Uma proposta com produtos (anexo I) e serviço (anexo III) usa uma alíquota só. O Presumido divide pela proporção, o Simples não. (3) No Presumido, `outros` entra como serviço (presunção de 32% em vez de 8%/12%). (4) A taxa do meio de pagamento é descontada do instalador, mas o split real não faz isso (P-04).
- Correção sugerida: aceitar `rbt12_centavos` e calcular a efetiva pelas tabelas da LC 123/2006 por anexo. Para o Simples misto, aceitar duas alíquotas (comércio e serviço) e aplicar a mesma `parcelaServico`. Deixar `outros` como categoria escolhida pelo usuário.

### P-15 · Editar estoque usa o `reservado` lido antes do `await`, e a corrida termina em 500
- Gravidade sugerida: baixa
- Onde: src/http/fornecedor.js:59-63; src/db.js:45
- Trecho:
  ```js
  const p = daConta("produtos", ctx.params.id, ...);
  const d = validar(produtoCampos.partial(), await ctx.corpo());
  if (d.estoque !== undefined && d.estoque < p.reservado) falha(409, ...);
  ```
- Por que é um problema: se uma reserva entra enquanto o corpo da requisição ainda chega, a checagem usa o `reservado` antigo. O `CHECK (reservado <= estoque)` impede o estoque negativo (ponto bom), mas o fornecedor recebe "Erro interno." em vez do 409 explicativo.
- Correção sugerida: ler o produto depois do `await` (ou dentro de `repo.transacao`) e usar `UPDATE produtos SET estoque = ? WHERE id = ? AND reservado <= ?`, conferindo `changes`.

### P-16 · Privacidade: texto livre do instalador chega ao fornecedor e à NF-e; o score expõe dados gerais; a auditoria da Nexor guarda nome e IP do cliente; links com token ficam em claro
- Gravidade sugerida: baixa
- Onde: src/servicos/negocio.js:142; src/servicos/privacidade.js:149; src/http/fornecedor.js:279; src/servicos/negocio.js:446-457; src/servicos/negocio.js:284 com src/http/api.js:265; src/http/instalador.js:223-225 com src/servicos/adaptadores.js:129
- Trecho:
  ```js
  descricao: i.descricao || p.nome            // negocio.js:142 — descrição digitada pelo instalador
  descricao: i.descricao,                     // privacidade.js:149 — vai para o fornecedor
  items: vis.itens.map((i, n) => ({ ..., descricao: i.descricao, ... }))   // fornecedor.js:279 — vai para a NF-e
  const geral = conv("");                     // negocio.js:447 — conversão do instalador com TODOS os fornecedores
  repo.auditar(p.instalador_id, `cliente: ${nome}`, "proposta_aceita", { proposta_id: p.id, ip }, ip);  // visível em /api/nexor/auditoria
  return repo.inserir("envios", { conta_id, canal, para, texto, status, erro });   // texto contém o link /p/<token>
  ```
- Por que é um problema: a projeção pela lista branca está certa, mas a descrição do item de fornecedor aceita texto livre ("Câmera – casa da Sra. Zuleika, Rua X"), que aparece no painel do fornecedor e sai impresso na NF-e dele. O teste de privacidade só pega isso porque usa nomes fixos. O score mostra ao fornecedor quantas propostas o instalador enviou e fechou com a concorrência. O operador Nexor vê nome e IP do cliente final na auditoria geral, o que contradiz o "sem dados de cliente" da API. A tabela `envios` guarda o token da proposta em texto puro, enquanto `propostas` guarda só o `sha256` dele.
- Correção sugerida: para itens de fornecedor, enviar ao fornecedor e à NF-e sempre o `produto.nome` (descrição do catálogo) e deixar a descrição personalizada só na página do cliente. No score, mostrar ao fornecedor só os números "com você". Na auditoria, gravar `autor: "cliente"` sem o nome. Em `envios`, mascarar o token (`/p/••••`).

### P-17 · A fila de notificações vive na memória, é sequencial e não tem limite
- Gravidade sugerida: baixa
- Onde: src/servicos/negocio.js:17, :36, :41
- Trecho:
  ```js
  let fila = Promise.resolve();
  for (const k of canais) fila = fila.then(() => notificador.enviar({ ... })).catch(...);
  ```
- Por que é um problema: cada envio pode levar até 10 s (`PRAZO_MS`), um atrás do outro, numa cadeia única para toda a plataforma. Uma rotina que vence 200 reservas gera mais de 800 envios, e com o WhatsApp lento o atraso chega a horas, com a fila crescendo na memória. Se o processo reiniciar, os envios pendentes se perdem sem registro (a linha de `envios` só nasce depois do envio).
- Correção sugerida: gravar `envios` com status `pendente` antes de enviar e despachar pela rotina, com concorrência limitada (ex.: 4) e nova tentativa.

### P-18 · Manutenção: código morto, dados gravados e nunca lidos, e duplicação
- Gravidade sugerida: baixa
- Onde: src/servidor.js:82 e src/http/api.js:251, :260; src/http/instalador.js:478-479; src/servicos/negocio.js:204 com :173 e :232; src/http/fornecedor.js:244, :259-263; src/http/instalador.js:64
- Trecho:
  ```js
  const walletNexor = () => cfg.asaas.walletNexor || decifrar(...);   // só exibido; nunca entra no split
  h.formas = FORMAS; h.mascarar = mascarar;                          // ninguém lê
  custo_fornecedores_centavos: res.custo_fornecedores_centavos       // gravado; nenhum ponto lê; fica velho após renovar (linha 232 não atualiza, linha 173 reprecifica itens)
  `R$ ${(d.valor_centavos / 100).toFixed(2).replace(".", ",")}`      // fornecedor.js:244 — sem separador de milhar; formatarReais já existe
  return tituloPublico(repo.atualizar("titulos", x.id, { status: "cancelado" }));   // repasse 'titulo' continua 'previsto'
  prazo_reserva_dias: f.config.prazo_reserva_dias ?? 7                // duplica PRAZO_RESERVA_PADRAO
  ```
- Por que é um problema: o operador configura um "wallet Nexor" que não faz nada, o que dá a falsa impressão de que a taxa é repassada para essa wallet. Na renovação de uma proposta expirada os custos são reprecificados, mas `custo_fornecedores_centavos` e `total_centavos` não são revistos. Cancelar um título deixa o repasse `previsto` para sempre. O arquivo `instalador.js` (480 linhas) mistura conta, vínculos, kits, propostas, NFS-e, calculadora, OS, arquivos e contratos.
- Correção sugerida: remover o `walletNexor` ou usá-lo de fato. Atualizar os totais em `renovar` (ou parar de gravar o custo). No cancelamento de título, cancelar junto o repasse `titulo` da proposta. Usar `formatarReais` e `PRAZO_RESERVA_PADRAO`. Dividir `instalador.js` em `propostas.js`, `os.js` e `contratos.js`.

## Pontos fortes do código
- Dinheiro sempre em centavos inteiros. No split, a soma fecha por construção (`instalador = total − fornecedores com wallet − taxa`, negocio.js:306), sem resíduo de arredondamento. A conversão para reais só acontece na borda (adaptadores.js:64), e o parcelado usa `totalFixedValue` corretamente.
- Reserva bem feita: `BEGIN IMMEDIATE` (db.js:205), `UPDATE ... WHERE estoque - reservado >= ?` com conferência de `changes` (negocio.js:174) e `CHECK (estoque >= 0 AND reservado >= 0 AND reservado <= estoque)` no banco (db.js:45), com teste real de rajada simultânea (test/reservas.test.js:103-129).
- Reentrega do webhook de pagamento aceito é idempotente (negocio.js:345). O token do webhook é comparado em tempo constante (seguranca.js:93-98). A assinatura de contrato tem `UNIQUE(asaas_id)`.
- Datas em Brasília com deslocamento fixo de UTC-3 (correto desde 2019), dias como `AAAA-MM-DD` comparados como texto, vencimento do próprio dia ainda não bloqueia (`vencimento < hoje`) e `pago_no_prazo` usa `<=`, coerente.
- A privacidade segue uma lista branca única (privacidade.js), e o teste lê o roteador para varrer todas as rotas GET do fornecedor, em todos os perfis e status.
- Mapa de tentativas com teto (api.js:47), `setInterval`/`setTimeout` com `unref` (servidor.js:241-243), uploads com conferência dos bytes iniciais e nomes de arquivo gerados pelo servidor (UUID), sem risco de travessia de pasta.
