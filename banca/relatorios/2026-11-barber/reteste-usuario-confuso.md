# Relatório do Agente Usuário Confuso · Nexor Barber (barber/) · RETESTE · 2026-11-10
Ambiente: localhost:8813, servidor montado com `montarAplicacao` e a rede falsa de `test/ajuda.js` (Asaas, WhatsApp e SMS falsos), relógio real, dados próprios em `/tmp/claude-0/-home-user-nexorconsulting/4db1d3bf-8b4e-5a33-a0c1-2f29abc64b1b/scratchpad/banca/reteste-confuso/dados`. Código no commit `f86a18f`, sem alterações.
Telas e fluxos testados: login do painel, Agenda (janela do horário, comanda), Produtos (novo produto), Clientes e Clube (Ver mais), Configurações (todas as abas, em 390 px), Trocar minha senha, app do cliente (entrar por SMS, agendar em 4 passos, Início, Clube e assinar, Loja, Perfil), sem rede, sessão expirada e duas abas. Viewports de 390×844 (toque) e 1280×900.
Scripts e saídas: `/tmp/claude-0/-home-user-nexorconsulting/4db1d3bf-8b4e-5a33-a0c1-2f29abc64b1b/scratchpad/banca/reteste-confuso/` (p1 a p6, a1 a a7, v1, v2). Capturas das falhas: `.../reteste-confuso/capturas/`.

## Itens do veredito
| Item | Resultado | Prova |
|---|---|---|
| V-01 · duplo toque na comanda com rede lenta | ok | `/concluir` atrasado 3 s por `route`, com duplo clique e um 3º clique em "Fechar comanda": o botão fica com o carregando e desabilitado, e sai **1 venda paga** de R$ 45,00 (`p1.mjs`) |
| V-12 · toque duplo em Cancelar (horário e assinatura) | ok, com ressalva (U-04) | Duplo toque e triplo toque (120 ms) só armam "Toque de novo para cancelar": o horário continua marcado. Na assinatura, o duplo toque mostra "Toque de novo para confirmar" e a assinatura continua pendente. Um toque deliberado 1,5 s depois cancela (`a3.mjs`, `a3b.mjs`) |
| V-13 · preço "abc" | ok | "abc", "1,234.56" e "-10" mostram "Preço de venda (R$): valor inválido. Use o formato 45,90." Vazio e "0" com vitrine mostram "Informe o preço para mostrar o produto na vitrine do app (ou tire da vitrine)." Nenhum produto foi gravado (`p4.mjs`) |
| V-22 · botões − e + da loja | ok | Duplo toque em "Reservar" dá qtd 1. Seis toques em + param em 5 e o + some. Duplo toque em − baixa de 5 para 4. O − no 1 desfaz a reserva e "Reservar" volta (`a4.mjs`) |
| V-26 · painel em 390 px, Configurações e "Salvar" | ok | `scrollWidth` = 390 em todas as 9 telas e nas 8 abas de Configurações. "Salvar" fica em x=284, y=792 (dentro da tela), e o toque salva com "Configurações salvas." (`p2.mjs`, `p3.mjs`). Achado novo na janela do horário: U-03 |
| V-27 · mensagens em português e sem rede | **falhou em parte** | No app, sem rede: "Sem conexão com a internet. Confira a conexão e toque de novo." Validações em português: "E-mail: e-mail inválido (ex.: nome@email.com)", "Celular: celular com DDD (ex.: 34 99999-0000)", "Data de nascimento: precisa ser uma data no passado". No **painel**, sem rede, abrir uma tela ainda não carregada mostra "Failed to fetch dynamically imported module: http://localhost:8813/js/views/clientes.js", e "Agendar" não faz nada nem avisa. Ver U-02 |
| V-28 · duplo clique na janela | ok | Duplo clique em "Na cadeira": 0 janelas abertas depois e um único "Atendimento começou." (`p1.mjs`) |
| V-29 · desconto negativo, com % e maior que a conta | ok | "-50" mostra "O desconto não pode ser negativo."; "999" mostra "O desconto é maior que o total da comanda (R$ 50,00)."; "abc" mostra "Desconto inválido…". Nos três casos o botão fica desabilitado e o total não muda. "10%" mostra "10% = R$ 5,00" e o total R$ 45,00; ao sair do campo vira "5,00" (`p1.mjs`) |
| V-38 · segunda aba | ok | As duas abas chegam ao mesmo horário. A 1ª confirma; a 2ª mostra "Você já tinha marcado este horário: Corte, quinta, 12/11 às 00:45. Ele está no Início." e abre o Início. Não houve duplicidade (`a2.mjs`) |
| V-40 · voltar e recarregar no agendamento | ok | O endereço muda para `#agendar/1..4`. O Voltar do 2º passo leva ao 1º e o Avançar volta ao 2º. Recarregar no 3º e no 4º passo mantém as escolhas. Um link `#agendar/4` colado numa aba nova abre o 1º passo, sem erro (`a1.mjs`, `a2.mjs`) |
| V-41 · sessão expirada | ok | Com o cookie apagado no 4º passo, o toque em Confirmar mostra "Sua sessão terminou. Entre de novo para continuar de onde parou." Depois de entrar por SMS, o app volta ao "Confirme" com o mesmo serviço, barbeiro e hora (Barba · Bruno · 14/11 01:00) (`a5.mjs`) |
| V-42 · textos por canal | ok | Só com SMS: "Lembrete por SMS antes de cada corte", "Vamos mandar um código por SMS.", "Você recebe a confirmação e um lembrete por SMS."; o assinar não pede CPF e diz "A primeira mensalidade é paga na barbearia…". Com WhatsApp e Asaas: "Lembrete pelo WhatsApp…", os botões "Entrar pelo WhatsApp" e "Entrar por SMS", o campo de CPF e "Pague por Pix, boleto ou cartão." (`a1.mjs`, `a3.mjs`, `a6.mjs`) |
| V-43 · teclado e alt | ok | O logo do login tem `alt="Nexor Barber"` (o logo ao lado do nome tem `alt=""`). A coluna "Agendar com Bruno neste dia" recebe foco (contorno sólido de 2 px) e o Enter abre "Novo agendamento". No app, Tab e Enter num serviço avançam para "Com quem?". Detalhe em U-05 |
| "Ver mais" em Clientes | ok | Com 324 clientes: "Ver mais clientes (mostrando 300)". Um duplo clique leva a 320 "Cliente Massa", sem repetir nenhum, e o botão some. Igual em 1280 e 390 px (`p2.mjs`) |
| "Ver mais" no Clube | ok | Com 205 assinantes: "Ver mais assinantes (mostrando 200)". Um duplo clique leva a 205, sem repetir nenhum, e o botão some (`p2.mjs`) |
| Troca da própria senha | ok | O botão de escudo aparece no celular. Senha atual errada: "A senha atual não confere.". Nova curta: "Nova: precisa ter pelo menos 8 caracteres". Um duplo toque com dados certos mostra "Senha trocada. Os outros aparelhos vão pedir login de novo.", a janela fecha e a senha nova funciona (a senha antiga dá 401) (`p3.mjs`) |

Regressões visuais: nenhuma tela do painel nem do app rola para o lado (`scrollWidth` igual à largura em 390 e 1280 px, inclusive nos 4 passos do agendamento, na janela "Novo agendamento" e na comanda). O app no desktop fica centralizado e sem quebras. Os dois problemas visuais encontrados (U-01 e U-03) **já existiam** antes das correções: `app.css` não mudou nas rodadas da banca. Eles não são regressões, mas nenhum relatório anterior os registrou.

## Achados novos
### U-01 · A forma de pagamento escolhida (e o filtro de Clientes) não aparece marcada
- Gravidade sugerida: média
- Onde: comanda (`public/js/base.js:140`) e filtros de Clientes (`public/js/views/clientes.js:20`). O JS marca o botão com a classe `ativa`, mas o CSS só estiliza `.segmentado button.ativo` (`public/app.css:217`).
- Como reproduzir: Agenda › horário › Fechar comanda. Olhe "Forma de pagamento" e toque em "Dinheiro". Em Clientes, toque em "Clube".
- O que aconteceu × o que deveria acontecer: nenhum botão fica destacado. A comanda já vem com Pix escolhido sem mostrar, então a recepção pode fechar em Pix uma venda paga em dinheiro, e o caixa por forma fica errado. Em Clientes, não dá para saber qual filtro está ativo. O certo é a opção escolhida ficar destacada.
- Evidência: `/tmp/claude-0/-home-user-nexorconsulting/4db1d3bf-8b4e-5a33-a0c1-2f29abc64b1b/scratchpad/banca/reteste-confuso/capturas/U-01-comanda-forma-sem-destaque.png` e `.../capturas/U-01-clientes-filtro-sem-destaque.png`
- Correção sugerida: usar o mesmo nome de classe nos dois lados (`ativa` no CSS ou `ativo` no JS) e pôr `aria-pressed` nos botões.

### U-02 · Painel sem rede: erro técnico em inglês ao abrir uma tela, e "Agendar" falha calado (resto do V-27)
- Gravidade sugerida: média
- Onde: `public/js/app.js:91-93` (o `import()` da tela mostra `e.message`) e o botão "Agendar" da Agenda (`novoAgendamento` chamado sem `acao()`, `public/js/base.js:62`)
- Como reproduzir: entre no painel, desligue a rede e toque em "Clientes" (ou em outra tela ainda não aberta). Depois, na Agenda, toque em "+ Agendar".
- O que aconteceu × o que deveria acontecer: aparece "Não foi possível abrir esta tela · Failed to fetch dynamically imported module: http://localhost:8813/js/views/clientes.js". No "Agendar", nada acontece e nenhuma mensagem aparece. O certo é mostrar "Sem conexão com a internet. Confira a rede e tente de novo." com um botão "Tentar de novo".
- Evidência: `/tmp/claude-0/-home-user-nexorconsulting/4db1d3bf-8b4e-5a33-a0c1-2f29abc64b1b/scratchpad/banca/reteste-confuso/capturas/U-02-painel-offline-ingles.png`. Console: `TypeError: Failed to fetch dynamically imported module`.
- Correção sugerida: no `catch` da rota, tratar `TypeError` (ou `!navigator.onLine`) com a mensagem de conexão. Envolver "Agendar" (e as outras aberturas de janela que fazem `get`) em `acao()`, que já mostra o erro.

### U-03 · No celular, a janela do horário "Agendado" fica mais larga que a tela: "Na cadeira" e o X somem
- Gravidade sugerida: média
- Onde: Agenda › tocar num horário com status Agendado, em 390 px. `.modal-rodape` não quebra linha (`public/app.css:248`), e os 5 botões (Chegou, Faltou, Remarcar, Cancelar, Na cadeira) empurram a janela para 507 px.
- Como reproduzir: abra o painel num celular, toque num horário agendado e procure "Na cadeira" ou o X de fechar.
- O que aconteceu × o que deveria acontecer: a janela é cortada na borda direita. "Na cadeira" (x=402-502) e o botão de fechar ficam fora da tela, e o fundo fixo não rola. O contorno é tocar em "Chegou", reabrir e aí usar "Na cadeira" ou "Fechar comanda". O certo é todos os botões caberem, quebrando em duas linhas. Já existia antes das correções: a captura antiga `m-painel-modal-horario.png` era de um horário concluído, sem botões.
- Evidência: `/tmp/claude-0/-home-user-nexorconsulting/4db1d3bf-8b4e-5a33-a0c1-2f29abc64b1b/scratchpad/banca/reteste-confuso/capturas/U-03-modal-horario-390-cortado.png`. Medição (`v2.mjs`): `DIV.modal w=507` dentro de uma tela de 390 px.
- Correção sugerida: `.modal-rodape { flex-wrap: wrap; }` e `.modal { min-width: 0; max-width: 100%; }`. No celular, botões em grade de 2 colunas.

### U-04 · Toques repetidos e impacientes ainda cancelam o horário
- Gravidade sugerida: baixa
- Onde: app › Início › Cancelar (`public/app/confirmar.js`)
- Como reproduzir: toque em "Cancelar" 4 vezes seguidas, uma a cada 300 ms, como quem acha que o app travou.
- O que aconteceu × o que deveria acontecer: o 2º e o 3º toques são ignorados, mas o 4º (cerca de 900 ms depois do 1º) confirma, e o horário é cancelado (`a3b.mjs`: agendados 1 → 0). O duplo e o triplo toque rápidos estão resolvidos. O certo é cada toque ignorado reiniciar a espera, para que só confirme um toque depois de uma pausa real.
- Evidência: saída de `a3b.mjs`, "4 toques a cada 300 ms: agendados 0"
- Correção sugerida: em `decidirToque`, quando a decisão for "ignorar", atualizar o último toque e exigir de 600 a 800 ms de pausa desde o último toque, não desde o armar.

### U-05 · Detalhes de texto e acessibilidade (informativo)
- Gravidade sugerida: informativa
- Onde e o quê:
  - Os botões − e + da Loja não têm `aria-label`. No passo "Confirme" eles têm ("Menos" e "Mais").
  - Mensagens com rótulo repetido ou cortado: "CPF: CPF inválido" e "Nova: precisa ter pelo menos 8 caracteres" (o campo se chama "Nova senha").
  - Com dois horários futuros, os dois cartões do Início dizem "SEU PRÓXIMO HORÁRIO".
  - Na Agenda, a coluna do barbeiro só recebe foco depois de 22 Tabs (não há atalho "pular para a agenda").
- Correção sugerida: `aria-label` "Menos uma"/"Mais uma" na Loja, rótulos amigáveis nesses dois campos, "Depois" no 2º cartão e um link "Pular para a agenda".

## O que funcionou bem
- Nenhuma duplicidade em todas as tentativas: comanda com rede lenta e três cliques, duas abas no mesmo horário, duplo toque em "Assinar", "Reservar", −, + e "Ver mais".
- O fluxo de agendamento guarda o passo no endereço e sobrevive a Voltar, Avançar, recarregar e sessão vencida, voltando exatamente onde o cliente parou.
- A validação de dinheiro na tela está firme: preço e desconto recusam texto, formato americano e negativo com mensagem clara, e o "%" no desconto é bem resolvido.
- Os textos do app seguem os canais ligados (SMS, WhatsApp, Asaas), e o CPF só é pedido quando a cobrança é online.
- Em 390 px, todas as telas do painel e do app ficam sem rolagem lateral, e o "Salvar" das Configurações fica fixo e alcançável.
