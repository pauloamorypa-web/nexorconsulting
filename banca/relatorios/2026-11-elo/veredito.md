# Veredito da Banca · Nexor Elo · 11/11/2026

**Nota: 9,0 de 10 · Pronto para piloto com um fornecedor âncora.**
Os itens médios foram corrigidos na segunda rodada (11/11/2026), com teste. Antes da produção aberta, falta confirmar as tarifas do contrato Asaas. Os itens baixos que restam são de acabamento e não bloqueiam (lista abaixo).

## Como foi a rodada
- Três agentes da banca rodaram em paralelo: [Hacker](hacker.md), [Programador Sênior](programador-senior.md) e [Usuário Confuso](usuario-confuso.md), este com capturas em `capturas-confuso/`.
- Somados, os relatórios trouxeram 35 achados brutos. Juntando os duplicados, ficaram 29 itens.
- **O que a banca confirmou como sólido:**
  - Dinheiro em centavos inteiros; a divisão do pagamento fecha no total por construção.
  - Reserva de estoque atômica: `BEGIN IMMEDIATE`, UPDATE condicional e CHECK no banco. Não há venda além do estoque.
  - Webhook do Asaas impossível de forjar e idempotente.
  - Isolamento entre empresas, sem IDOR.
  - Privacidade do cliente final por projeção em lista branca: 0 de 66 notificações vazaram dados do cliente.
  - Papéis, sessão, CSRF, cabeçalhos, uploads e segredos cifrados.
  - Toques duplos em Salvar, Aceitar e Pagar não duplicam nada.
  - Sem rolagem lateral em 360 e 390 px.

## Corrigidos (com teste em `elo/test/banca.test.js`)
| Item | Origem | Gravidade | O que era | Correção |
|---|---|---|---|---|
| V-01 | P-01, H-01, U-01 | Grave | Uma cobrança substituída, ou de proposta cancelada, continuava valendo no Asaas. Se fosse paga, baixava o estoque e duplicava os repasses | Agora é cancelada no Asaas, com nova tentativa na rotina. Se for paga mesmo assim, fica marcada como "indevida": não baixa o estoque, não gera repasse e avisa para estornar |
| V-02 | P-02 | Alto | Dois cliques em pagar, com o Asaas lento, criavam duas cobranças | Trava por proposta e releitura depois da chamada ao Asaas. O teste foi comprovado contra o defeito |
| V-03 | P-03 | Alto | Estorno e chargeback eram ignorados: repasses e títulos continuavam, e o instalador ficava bloqueado | Agora desfazem os repasses, cancelam o título sem wallet e avisam o fornecedor e o instalador |
| V-04 | P-04 | Alto | A tarifa do Asaas não entrava no split; no cartão parcelado a cobrança podia ser recusada | A tarifa estimada sai da parte do instalador, coerente com a calculadora. Os splits fixos nunca passam do líquido. As tarifas são configuráveis (`ASAAS_TARIFA_*`) |
| V-05 | U-02 | Alto | Duas abas com o mesmo rascunho geravam duas propostas e duas reservas | O rascunho ganhou uma chave criada junto com ele. A segunda aba recebe a mesma proposta |
| V-06 | U-06 | Alto | No CSV, estoque "1.000" virava 1 unidade | Agora "1.000" vale mil. "1,5" é recusado com a mensagem certa |
| V-07 | P-07 | Médio | Um boleto vencido travava a reabertura da proposta para sempre | `PAYMENT_OVERDUE` e `PAYMENT_DELETED` liberam a proposta |
| V-08 | P-06 | Médio | Renovar a reserva passava por cima do bloqueio por inadimplência | A renovação agora respeita o bloqueio |
| V-09 | P-11 | Médio | A assinatura do cliente podia ser trocada depois de feita | Depois de assinada, recusa uma nova assinatura |
| V-10 | U-07, U-08 | Médio | Erros do CSV em inglês e limites aparecendo em centavos com nome técnico | Mensagens em português, com valores em reais e rótulos de gente |

A suíte passou de 20 para 29 testes, todos verdes.

## Corrigidos na segunda rodada (com teste em `elo/test/banca-medios.test.js`)
Cada teste de servidor foi rodado contra o código anterior (falhou) e contra o corrigido (passou). Os itens de tela foram conferidos com Playwright a 390 px, também com a versão antiga do arquivo para comparar.

| Item | Origem | Gravidade | O que era | Correção |
|---|---|---|---|---|
| V-11 | P-05 | Médio | O crédito do fornecedor sem walletId só descontava os títulos. Três propostas de R$ 8.000 passavam num limite de R$ 10.000, porque o título só nasce no pagamento | O limite agora desconta também os itens dele em reservas ativas e em propostas aceitas com cobrança aberta (`comprometido_centavos`). Com walletId nada muda, porque o fornecedor recebe pelo split |
| V-12 | P-08 | Médio | A NFS-e saía com o valor cheio dos serviços e ignorava o desconto | O desconto é rateado entre os itens pelo valor (maiores restos, fecha no centavo). A parte dos serviços vai em `desconto_incondicionado`, com `base_calculo` líquida. A nota repetida (dois cliques) devolve a já gravada em vez de 500, e a busca filtra pela conta |
| V-13 | P-10 | Médio | Um walletId que não decifrava virava "sem wallet" em silêncio. O dinheiro ia para o instalador e nascia um título | "Não configurado" e "não decifra" agora são casos separados. No segundo, o sistema registra no log e na auditoria, avisa o operador Nexor (uma vez por dia por conta) e recusa a cobrança com 503 e mensagem clara. Nada é cobrado. A conta mostra `wallet_ilegivel` |
| V-14 | P-12 | Médio | Faltavam índices em reservas, pagamentos, repasses, rotina, títulos, vínculos e tabelas-filhas | 25 índices numa migração idempotente (`CREATE INDEX IF NOT EXISTS` em `src/db.js`). O teste confere o plano de consulta |
| V-15 | P-13 | Médio | Consultas N+1 nos painéis (cerca de 2.700 consultas para 300 vínculos), listas sem limite, `/comparar` com item vazio e catálogo cortado antes da visibilidade | Vínculos, crédito, score, propostas, reservas, repasses, títulos e contratos agora são montados em lote, com o mesmo número de consultas para 1 ou 500 linhas. As listas aceitam `?limite=&pagina=` e respondem `X-Proxima-Pagina`. A resposta continua um array, então as telas não mudam. `/comparar` exige o código ou 2 letras. No catálogo, a visibilidade é filtrada no SQL |
| V-16 | U-03 | Médio | Com rede lenta, "Salvar" e logo depois "Enviar" | A chave do rascunho já impedia o rascunho órfão. A conferência mostrou outro defeito: o envio devolvia a proposta antiga e perdia o que foi editado no meio. No app, os salvamentos agora entram numa fila, e o envio parte do estado salvo mais recente |
| V-17 | U-04 | Médio | O checklist mostrava "salvo" antes da confirmação, e uma resposta antiga sobrescrevia a nova. Sem rede, a marcação sumia ao recarregar | O app grava uma vez por vez, sempre com a lista inteira mais recente, e só mostra "salvo" depois que o servidor confirma. Sem rede, mostra "Não salvo" com o botão "Tentar de novo" até dar certo |
| V-18 | U-05 | Médio | Um toque único no quadro valia como assinatura | O app exige um traço mínimo (80 px e 8 pontos). O servidor lê o PNG e recusa a imagem quase em branco (`assinatura_vazia`) |
| V-19 | P-15 | Baixo | Uma reserva que entrava durante a edição do estoque fazia o servidor responder 500 | O produto é relido depois de o corpo chegar, numa transação. Se perder a corrida, responde 409 com a mensagem |
| V-20 | P-14 | Baixo | A calculadora usava a alíquota digitada no Simples | A alíquota efetiva agora é calculada pela faixa e pelo anexo a partir da receita dos últimos 12 meses (RBT12), pelas tabelas da LC 123/2006. A alíquota manual continua disponível |

Também foi corrigido no app o atributo `hidden`, que não escondia campos com classe própria: a calculadora mostrava o ISS e a alíquota em qualquer regime. O cache do app subiu de versão (`elo-app-v2`).

A suíte passou de 30 para 38 testes, todos verdes.

## Em aberto (próxima versão; nenhum bloqueia o piloto)
- **Médios:** nenhum.
- **Baixos:**
  - Restos do P-13 e do P-08: a lista de OS do instalador ainda faz quatro consultas (com índice) por OS. Na corrida de dois cliques, a Focus pode receber a mesma nota duas vezes, mas é idempotente pela ref e o Elo grava uma só. P-14 parcial: venda mista no Simples ainda usa uma alíquota só.
  - P-16: texto livre do item chega ao fornecedor (orientar o instalador) e a auditoria guarda o IP do cliente.
  - P-17: fila de notificações só em memória.
  - P-18: código morto.
  - U-09 a U-14: acabamento de telas.
- **Informativos:** H-02 (rotas de demonstração só valem com `DEMO=1` e escuta local) e H-03 (o link da proposta mostra o nome do cliente a quem tiver o link, por desenho).

## Ação do responsável
- Conferir no contrato Asaas as tarifas de Pix, boleto e cartão (à vista e parcelado) e ajustar as variáveis `ASAAS_TARIFA_*`. Os valores atuais são estimativas.
- Validar o modelo: a cobrança sai da conta Asaas da Nexor, e a taxa de 2,5% (`TAXA_PLATAFORMA_BPS`) é da plataforma.
