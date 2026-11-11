# Veredito da Banca · Nexor Elo · 11/11/2026

**Nota: 8,5 de 10 · Pronto para piloto com um fornecedor âncora.**
Antes da produção aberta, é preciso confirmar as tarifas do contrato Asaas e tratar os itens médios que ainda estão em aberto (lista abaixo).

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

## Em aberto (para a próxima versão, antes da produção aberta)
- **Médios:**
  - P-05: o crédito do fornecedor sem walletId não soma as outras reservas ativas.
  - P-08: a NFS-e ignora o desconto.
  - P-10: um erro ao decifrar o walletId vira silenciosamente "sem wallet".
  - P-12 e P-13: índices, N+1 e listas sem limite.
  - U-03: rascunho órfão com rede lenta.
  - U-04: o checklist mostra "salvo" com rede oscilando.
  - U-05: a assinatura aceita um único toque.
- **Baixos:**
  - P-14: a calculadora deveria calcular a alíquota efetiva do Simples pela faixa.
  - P-15: corrida ao editar o estoque responde 500.
  - P-16: texto livre do item chega ao fornecedor (orientar o instalador) e a auditoria guarda o IP do cliente.
  - P-17: fila de notificações só em memória.
  - P-18: código morto.
  - U-09 a U-14: acabamento de telas.
- **Informativos:** H-02 (rotas de demonstração só valem com `DEMO=1` e escuta local) e H-03 (o link da proposta mostra o nome do cliente a quem tiver o link, por desenho).

## Ação do responsável
- Conferir no contrato Asaas as tarifas de Pix, boleto e cartão (à vista e parcelado) e ajustar as variáveis `ASAAS_TARIFA_*`. Os valores atuais são estimativas.
- Validar o modelo: a cobrança sai da conta Asaas da Nexor, e a taxa de 2,5% (`TAXA_PLATAFORMA_BPS`) é da plataforma.
