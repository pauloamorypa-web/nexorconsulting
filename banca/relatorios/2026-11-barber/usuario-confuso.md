# Relatório do Agente Usuário Confuso · Nexor Barber (barber/) · 09–10/11/2026
Telas e fluxos testados: app do cliente em 390×844 com toque (entrar por SMS, agendar em 4 passos, confirmar com clique/toque duplo e rede lenta, duas abas no mesmo horário, voltar/avançar/recarregar no meio do fluxo, sem internet, sessão expirada, cancelar horário, clube: assinar/cancelar, loja: reservar, perfil, navegação só por teclado); painel do dono em 1366 px e 390 px (login, link direto sem login, Agenda de hoje: Chegou, Na cadeira, Fechar comanda com clique duplo/triplo e rede lenta, desconto maluco, Novo agendamento com encaixe; Produtos com dados malucos; Clube: registrar pagamento; todas as telas do menu no celular); API direta para requisições simultâneas e upload lento.

Ambiente: localhost:8802, dados próprios em `scratchpad/banca/confuso-dados`, SMS falso na 8812. Capturas em `/tmp/claude-0/-home-user-nexorconsulting/4db1d3bf-8b4e-5a33-a0c1-2f29abc64b1b/scratchpad/banca/confuso-capturas/` (abaixo citadas só pelo nome do arquivo). Scripts em `.../scratchpad/banca/confuso/t*.mjs`. Nenhum arquivo do repositório foi alterado (só este relatório).

## Achados

### U-01 · "Fechar comanda" em duas telas com rede lenta gera duas vendas do mesmo atendimento
- Gravidade sugerida: crítica
- Onde: painel › Agenda › Fechar comanda; `src/http/api.js` rota `POST /api/agendamentos/:id/concluir` (lê o agendamento com `exigir` e só depois faz `await ctx.corpo()`); `src/servicos/nucleo.js` `concluir()` confere `a.status` do objeto lido antes, fora da transação.
- Como reproduzir: o barbeiro fecha a comanda no celular com 3G (o corpo da requisição demora ~1,5 s para subir) e, ao mesmo tempo, a recepção fecha a mesma comanda no computador. Reproduzido com `t2.mjs` (cabeçalhos enviados na hora, corpo 1,5 s depois, e uma segunda requisição normal no meio).
- O que aconteceu × o que deveria acontecer: as duas respostas foram **200**. Ficaram **2 vendas pagas** de R$ 125,00 para o mesmo atendimento (dinheiro), a pomada saiu **duas vezes** do estoque (11 → 9), o caixa do dia somou as duas e foram criadas **4 linhas de comissão** (o dobro). Deveria existir uma venda só; a segunda tela deveria receber "Este atendimento já foi encerrado". Com três requisições normais e rápidas ao mesmo tempo o bloqueio funcionou (1 × 200 e 2 × 409), então o problema aparece justamente na rede lenta.
- Evidência: saída do `t2.mjs`: `rapida 200 12500` · `lenta HTTP/1.1 200 OK` · `vendas pagas do mesmo atendimento: 2 [c96c1a8f 12500 dinheiro, 075f17b2 12500 dinheiro]` · `estoque pomada antes/depois 11 9` · `comissões linhas desta(s) venda(s) 4`.
- Correção sugerida: dentro da transação de `concluir`, reler o agendamento (`repo.obter`) e conferir o status ali, ou fazer `UPDATE agendamentos SET status='concluido' WHERE id=? AND status IN ('chegou','em_atendimento')` e abortar se nenhuma linha mudar. Vale o mesmo padrão (ler o corpo primeiro, reler o registro dentro da transação) em `PUT /api/agendamentos/:id`, `POST /api/assinaturas/:id/pagamento` e `POST /api/app/agendamentos/:id/reservas`. Um índice único em `vendas(agendamento_id)` para vendas pagas fecha a porta de vez.

### U-02 · Toque duplo em "Cancelar" cancela o horário sem a confirmação
- Gravidade sugerida: alta
- Onde: app do cliente › Início › cartão do próximo horário › Cancelar (`public/app/app.js`, `ticket()`); mesmo padrão em Clube › "Cancelar assinatura" (`clube()`).
- Como reproduzir: no celular, com um horário marcado, dar dois toques rápidos (ou clique duplo) em "Cancelar".
- O que aconteceu × o que deveria acontecer: o primeiro toque troca o texto para "Toque de novo para cancelar" e devolve o botão; o segundo toque do mesmo gesto já cancela. Testei duas vezes (clique duplo e dois toques) e os **dois horários foram cancelados**, com aviso "Horário cancelado.". A vaga vai direto para a lista de espera, então o cliente pode perder o horário de vez. O mesmo clique duplo em "Cancelar assinatura" cancelou a assinatura do clube. Deveria exigir uma confirmação de verdade (janela "Cancelar o horário de quarta às 10:30?" com "Sim, cancelar" / "Manter").
- Evidência: `app-08-inicio-com-horarios.png` (antes), `app-09-cancelou-com-duplo-clique.png`, `app-14-cancelou-assinatura.png`; saída do `t6.mjs`: `antes ['2026-11-12 08:30 agendado', ...]` → `depois de duplo clique em Cancelar: ['2026-11-12 08:30 cancelado', ...]` → `depois de 2 toques rápidos: [... cancelado, ... cancelado]`.
- Correção sugerida: usar uma janela de confirmação, ou ignorar o segundo toque por ~1 s depois de armar a confirmação (guardar `Date.now()` em `dataset` e só aceitar após 800 ms).

### U-03 · Painel no celular: tela de Configurações fica com 1.200 px de largura e o botão "Salvar" some à direita
- Gravidade sugerida: alta
- Onde: painel › Configurações em 390×844 (a fileira de abas `.abas` estica a página inteira); também Agenda de hoje (botão "+ Agendar" e indicadores cortados).
- Como reproduzir: entrar no painel pelo celular e abrir Configurações (ou Agenda de hoje).
- O que aconteceu × o que deveria acontecer: o conteúdo (`.conteudo`) tem 1.198 px para 390 px de tela; os campos passam da borda e o botão "Salvar" fica em x = 1106–1177 px, fora da tela, só alcançável rolando a página para o lado. Na Agenda de hoje o botão "+ Agendar" aparece cortado ("+ Ag") e os cartões "Concluídos" e "Faturado no dia" ficam pela metade. O dono que usa o celular não acha onde salvar. Deveria caber em 390 px: abas com rolagem própria (só a fileira de abas rola) e formulário em uma coluna.
- Evidência: `m-painel-config.png`, `m-painel-hoje.png`; saída do `t13.mjs`: `Salvar x=1106-1177 y=792`, `conteudo { sw: 1198, cw: 390 }`, `DIV.abas w=1182`.
- Correção sugerida: em `.abas` usar `overflow-x:auto; max-width:100%` e `min-width:0` nos pais (grid/flex); no topo da Agenda deixar `.acoes-topo` quebrar linha (`flex-wrap: wrap`); indicadores em `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))`.

### U-04 · Preço digitado errado ("abc", "1,234.56") salva o produto por R$ 0,00 e ele vai para a vitrine do app
- Gravidade sugerida: alta
- Onde: painel › Produtos › Novo produto, campo "Preço de venda (R$)" (`public/js/comum.js` `paraCentavos`: o que não vira número vira 0 sem avisar).
- Como reproduzir: Novo produto, Nome "Teste preço abc", Preço "abc", Salvar. Repetir com "1,234.56" (formato americano colado de planilha).
- O que aconteceu × o que deveria acontecer: os dois aparecem como "Produto salvo." e ficam com preço **R$ 0,00**; como "Mostrar no app" vem marcado, o produto já aparece na Loja do app do cliente por R$ 0,00 e pode ser reservado e vendido de graça na comanda. Deveria recusar com "Preço inválido. Use o formato 25,00".
- Evidência: `painel-09-preco-abc.png`, `m-app-loja.png` (cartões "Teste preço abc R$ 0,00" e "Teste preço us R$ 0,00"); saída do `t10.mjs`: `produtos criados: ['Teste preço abc=0', 'Teste preço us=0']`.
- Correção sugerida: `paraCentavos` deve devolver `null`/NaN para texto inválido e o formulário deve mostrar "Preço inválido" no campo; o servidor pode exigir `preco_centavos > 0` quando `vitrine` estiver marcado, ou pedir confirmação para preço zero.

### U-05 · Mensagens de erro em inglês e com nome técnico do campo
- Gravidade sugerida: média
- Onde: todas as validações (`src/http/validacao.js` `validar()` repassa a mensagem padrão do zod com o caminho do campo); e no app quando a internet cai (`api()` em `public/app/app.js` repassa o erro do navegador).
- Como reproduzir: exemplos vistos na tela: Produto com preço "-5"; nome com 10.000 caracteres; desconto "-50" na comanda; perfil do app com nome vazio ou e-mail "eva@"; CPF inválido ao assinar; confirmar agendamento sem internet.
- O que aconteceu × o que deveria acontecer: o usuário lê `preco_centavos: Too small: expected number to be >=0`, `nome: Too big: expected string to have <=100 characters`, `desconto_centavos: Too small: expected number to be >=0`, `nome: Too small: expected string to have >=1 characters`, `email: Invalid email address`, `cpf: CPF inválido` e, sem internet, `Failed to fetch`. Deveria ler, por exemplo: "O preço não pode ser negativo.", "O nome pode ter até 100 letras.", "Digite seu nome.", "E-mail inválido.", "CPF inválido. Confira os números.", "Sem internet. Confira a conexão e toque de novo.".
- Evidência: `painel-10-preco-negativo.png`, `painel-11-nome-10k.png`, `painel-14-desconto-negativo.png`, `app-12-cpf-maluco.png`, `app-15-offline.png`; saída do `t8.mjs` (lista completa).
- Correção sugerida: configurar o zod em português (`z.config(z.locales.pt())` no zod 4 ou um `errorMap` próprio), trocar o caminho técnico por um rótulo amigável (`preco_centavos` → "Preço") e, no `api()` do app e do painel, transformar `TypeError` de rede em "Sem conexão com a internet".

### U-06 · Duplo clique em botões da janela "cai" na agenda e abre outra janela
- Gravidade sugerida: média
- Onde: painel › Agenda de hoje › janela do horário (botões "Chegou", "Na cadeira", "Fechar comanda"…); `public/js/views/hoje.js` `abrirHorario()` fecha a janela no primeiro clique.
- Como reproduzir: clicar no cartão de um cliente e dar clique duplo em "Chegou" (ou em "Fechar comanda").
- O que aconteceu × o que deveria acontecer: o primeiro clique marca "chegou" e fecha a janela; o segundo clique acerta a coluna da agenda que estava por baixo e abre **"Novo agendamento"** sem o usuário pedir. Com "Fechar comanda", o segundo clique acerta o cartão do cliente e ficam **duas janelas empilhadas** ("15:00 · Marcos Rocha" e "Comanda · Marcos Rocha"). Quem está com pressa acha que errou algo ou agenda alguém por engano. Deveria ignorar o segundo clique.
- Evidência: `painel-05-duplo-chegou.png` (janela "Novo agendamento" aberta e aviso "Marcos Rocha chegou."), `painel-06-duplo-abrir-comanda.png`.
- Correção sugerida: fechar a janela só depois que a ação terminar, ou ignorar cliques na coluna por ~400 ms depois de fechar uma janela (ou abrir a nova janela só no `click` com `event.detail === 1`).

### U-07 · Comanda mostra total errado com desconto negativo ou em "%"
- Gravidade sugerida: média
- Onde: painel › Fechar comanda, campo "Desconto (R$)" (`public/js/base.js` `comanda()`).
- Como reproduzir: abrir a comanda de um corte de R$ 50,00 e digitar "-50" no desconto; depois "10%"; depois "999".
- O que aconteceu × o que deveria acontecer: com "-50" o Total mostrado **sobe** (corte de R$ 50,00 vira R$ 100,00; barba de R$ 40,00 vira R$ 90,00: o desconto negativo vira acréscimo na tela) e só ao fechar vem o erro em inglês (U-05). Com "10%" o sistema entende **R$ 10,00** e não 10%. Com "999" o total vira R$ 0,00 sem nenhum aviso de que o desconto é maior que a conta. Deveria impedir o negativo no próprio campo, avisar "desconto maior que o total" e deixar claro que o desconto é em reais (ou aceitar %).
- Evidência: `painel-07-desconto-negativo.png`, `painel-14-desconto-negativo.png`; saída do `t9.mjs`/`t16.mjs`: `total com desconto -50: R$ 100,00`, `total com desconto "10%": R$ 40,00` (comanda de R$ 50), `Total exibido com desconto 999: R$ 0,00`.
- Correção sugerida: validar o campo ao digitar (mínimo 0, máximo = subtotal), mostrar a mensagem embaixo do campo e desabilitar "Fechar comanda" enquanto o valor for inválido; opcionalmente aceitar "10%".

### U-08 · Duas abas do mesmo cliente: a segunda diz que o horário "acabou de ser ocupado" (por ele mesmo)
- Gravidade sugerida: baixa
- Onde: app › Agendar › Confirmar agendamento (`src/regras/agenda.js` `cabe()`).
- Como reproduzir: abrir o app em duas abas, chegar ao passo "Confirme" no mesmo horário nas duas, confirmar na primeira e depois na segunda.
- O que aconteceu × o que deveria acontecer: o sistema não duplicou (ótimo), mas a segunda aba mostra "Esse horário acabou de ser ocupado. Escolha outro." e continua na tela "Confirme". O cliente pensa que perdeu o horário e marca outro. Deveria dizer "Você já marcou este horário" e levar para o Início com o horário marcado.
- Evidência: `app-05-segunda-aba.png`; saída do `t5.mjs`: `2a aba: Esse horário acabou de ser ocupado. Escolha outro. | tela: Confirme` e a lista do cliente com um só horário naquele dia.
- Correção sugerida: antes de recusar, conferir se o conflito é do próprio cliente no mesmo início/serviço e devolver o agendamento existente (ou uma mensagem própria).

### U-09 · Loja do app: cada toque em "Reservar" cria mais uma reserva e não há como desfazer
- Gravidade sugerida: média
- Onde: app › Loja (`public/app/app.js` `loja()`); a rota `DELETE /api/app/reservas/:id` existe, mas nenhuma tela a usa.
- Como reproduzir: com um horário marcado, ir à Loja e tocar "Reservar" no Shampoo; tocar de novo (ou clique duplo seguido de mais um toque).
- O que aconteceu × o que deveria acontecer: o clique duplo foi barrado (bom), mas cada novo toque reserva mais 1 unidade; o cartão continua dizendo só "Reservar", sem mostrar quantas já estão separadas; no Início aparece "Reservado para retirar: 1× Shampoo Duplo, 1× Shampoo Duplo" e não existe botão para tirar a reserva. Deveria mostrar "1 reservado · − / +" e permitir cancelar.
- Evidência: `app-17-loja-depois-reservar.png`, `app-18-inicio-reservas.png`; saída do `t14.mjs`: `reservas do Fábio: ['1x Shampoo Duplo reservado', '1x Shampoo Duplo reservado']`, texto do cartão `Shampoo Duplo R$ 25,00 Reservar`. Pelo `t3.mjs`, três toques num produto com estoque 2 deram 200, 200 e 409 "só 0 em estoque" (o estoque foi respeitado).
- Correção sugerida: juntar as reservas do mesmo produto no mesmo horário (somar a quantidade), mostrar a quantidade no cartão com − / + e usar a rota de cancelamento existente.

### U-10 · Assinar o clube com cobrança Asaas em duas abas pode gerar duas cobranças (risco visto no código)
- Gravidade sugerida: alta
- Onde: `src/servicos/nucleo.js` `assinar()`: se já existe assinatura "pendente", ela é marcada como cancelada **só no banco local** (não chama `asaas.cancelar`) e uma nova assinatura é criada no Asaas.
- Como reproduzir (não reproduzido de ponta a ponta: o endereço do Asaas é fixo em `config.js` e não dá para apontar para um servidor falso em localhost sem mudar o código): cliente abre o Clube em duas abas, toca "Assinar este plano" › "Continuar para o pagamento" na primeira (vai para o link do Asaas), volta para a segunda aba (que ainda mostra o botão) e assina de novo.
- O que aconteceu × o que deveria acontecer: pelo código, a primeira assinatura do Asaas continua ativa lá (cobrança mensal) enquanto o sistema local a dá como cancelada; o cliente recebe duas cobranças. Sem Asaas (pagamento no balcão), testei o mesmo fluxo com rede lenta e clique duplo: ficou só uma assinatura (bom). Deveria devolver a assinatura pendente existente (e seu link) em vez de criar outra, ou cancelar a anterior também no Asaas.
- Evidência: leitura de `nucleo.js` (`if (atual) repo.atualizar("assinaturas", atual.id, { status: "cancelada" ... })` seguido de `asaas.assinar(...)`); `t7.mjs` sem Asaas: `assinaturas apos duplo clique ['pendente cpf=-']`.
- Correção sugerida: se já houver pendente do mesmo plano, devolver ela (com o link); se for de outro plano, chamar `asaas.cancelar` antes de criar a nova. Pedir à banca de integração um teste com Asaas falso (tornar a URL configurável por variável de ambiente).

### U-11 · Limite de login conta também os logins certos
- Gravidade sugerida: média
- Onde: `src/http/api.js` `POST /api/entrar` (`limitar()` roda antes de conferir a senha e registra toda tentativa, inclusive as que dão certo).
- Como reproduzir: entrar no painel 8 vezes em 15 minutos a partir da mesma rede (ex.: dono, recepção e barbeiros no mesmo Wi-Fi, ou alguém que sai e entra várias vezes), depois tentar entrar de novo.
- O que aconteceu × o que deveria acontecer: depois de 8 logins **corretos**, a próxima tentativa recebe "Muitas tentativas. Aguarde alguns minutos." (HTTP 429), mesmo com a senha certa. Numa barbearia com várias pessoas no mesmo Wi-Fi isso trava a equipe toda. Deveria contar só as tentativas erradas.
- Evidência: saída do `t8.mjs`: `entrar senha errada 429 {"erro":"Muitas tentativas. Aguarde alguns minutos."}` depois de ~8 logins certos no mesmo IP (precisei reiniciar o servidor para continuar testando).
- Correção sugerida: registrar a tentativa só quando a senha falhar (e zerar o contador do e-mail após um login correto).

### U-12 · Encaixe aceita data no passado
- Gravidade sugerida: baixa
- Onde: painel › Agendar › "Encaixe fora do expediente" (`nucleo.agendar` com `encaixe: true` não confere se a data já passou; o campo de data só tem `min` visual).
- Como reproduzir: Novo agendamento › Cliente novo "Cliente do Passado" › marcar Encaixe › digitar 01/01/2020 e 10:00 › Agendar.
- O que aconteceu × o que deveria acontecer: "Agendado: Cliente do Passado às 10:00 com Diego." Um erro de digitação no ano cria um atendimento em 2020 que bagunça relatórios e o histórico do cliente. Deveria recusar ("Esse dia já passou") ou pedir confirmação.
- Evidência: `painel-13-encaixe-passado.png`; `t16.mjs`.
- Correção sugerida: no servidor, recusar `inicio < agora - margem` também no encaixe.

### U-13 · Datas impossíveis aceitas e mensagens confusas para data errada
- Gravidade sugerida: baixa
- Onde: validação `dia` em `src/http/validacao.js` (só confere o formato AAAA-MM-DD).
- Como reproduzir: cadastrar cliente com nascimento "2026-02-31"; no app, aniversário "2090-01-01"; agendar pelo painel com dia "2026-13-45".
- O que aconteceu × o que deveria acontecer: 31/02 e 2090 foram salvos; "2026-13-45" voltou como "Horário fora do expediente ou da antecedência mínima." (a mensagem fala de expediente quando o problema é a data). Deveria dizer "Data inválida" e não aceitar nascimento no futuro.
- Evidência: saída do `t8.mjs` (`cliente nasc 2026-02-31 200`, `app nascimento futuro 200`, `agendar dia 2026-13-45 409 Horário fora do expediente...`).
- Correção sugerida: conferir se a data existe (`new Date(d).toISOString().slice(0,10) === d`) e limitar nascimento a datas passadas.

### U-14 · Voltar do navegador ou recarregar no meio do agendamento perde o passo
- Gravidade sugerida: baixa
- Onde: app › Agendar (o passo fica só em memória, `S.fluxo`; a URL é sempre `#agendar`).
- Como reproduzir: escolher serviço e barbeiro (passo 3, "Quando?") e usar o botão Voltar do celular; ou recarregar a página.
- O que aconteceu × o que deveria acontecer: Voltar do celular sai do agendamento e vai para o Início (o cliente esperava voltar para "Com quem?"); recarregar volta ao passo 1 "Qual serviço?". Deveria voltar um passo e manter as escolhas ao recarregar.
- Evidência: `app-07-voltar-navegador.png`; saída do `t5.mjs`: `voltar do navegador no passo 3 -> hash #inicio`, `recarregar no passo 3 -> Qual serviço?`.
- Correção sugerida: pôr o passo na URL (`#agendar/3?servico=…&barbeiro=…`) ou usar `history.pushState` a cada passo e guardar o fluxo em `sessionStorage`.

### U-15 · Sessão expirada no meio do agendamento: só um aviso e nenhum caminho
- Gravidade sugerida: baixa
- Onde: app › Confirmar agendamento quando o cookie do cliente expirou.
- Como reproduzir: chegar ao passo "Confirme", apagar o cookie (simula sessão vencida) e tocar "Confirmar agendamento".
- O que aconteceu × o que deveria acontecer: aparece o aviso "Entre para continuar." por alguns segundos e a tela continua em "Confirme"; tocar de novo repete o aviso. Deveria abrir a tela de entrar e, depois do código, voltar ao "Confirme" com as mesmas escolhas.
- Evidência: `app-16-sessao-expirada.png`.
- Correção sugerida: no `api()` do app, em 401 guardar o fluxo, mostrar `telaEntrar()` e retomar ao entrar.

### U-16 · Textos que não batem com a configuração (WhatsApp × SMS, CPF no pagamento no balcão)
- Gravidade sugerida: baixa
- Onde: app › tela "Horário marcado!" e Clube › "Assinar".
- Como reproduzir: barbearia só com SMS configurado (sem WhatsApp, sem Asaas). Marcar um horário; depois ir ao Clube › Assinar este plano.
- O que aconteceu × o que deveria acontecer: o sucesso diz "Você recebe a confirmação e um lembrete no WhatsApp", mas as confirmações saíram por SMS (12 envios `sms/confirmacao`). Na assinatura aparece "Pague por Pix, boleto ou cartão" e um campo "CPF (para a cobrança)", mas o pagamento é no balcão; o cliente digita CPF à toa e, se errar, recebe "cpf: CPF inválido". Deveria citar o canal configurado e esconder o CPF quando não há cobrança online.
- Evidência: `app-04-depois-duplo.png`, `app-11-assinar.png`, `app-12-cpf-maluco.png`.
- Correção sugerida: usar `S.info.entrar` (canais ativos) para montar o texto; esconder o CPF quando `pagar_no_balcao`.

### U-17 · Pequenos ajustes de acessibilidade e layout
- Gravidade sugerida: informativa
- Onde: painel.
- O que aconteceu: o logo da tela de login do painel não tem texto alternativo (`/img/logo-mark.webp`, 2 imagens sem `alt`); na janela "Novo agendamento" a frase "Sem horários livres neste dia. Use o encaixe ou outro dia." fica espremida numa coluna estreita (`painel-05-duplo-chegou.png`); clicar num espaço vazio da agenda para agendar só funciona com mouse (a coluna é um `div` com `onclick`, sem foco por teclado). No app, a navegação só com Tab/Enter funcionou e o foco é visível (contorno de 2 px).
- Correção sugerida: `alt="Nexor Barber"` (ou `alt=""` se decorativo); a mensagem com `grid-column: 1 / -1`; um botão "Agendar às HH:MM" acessível por teclado.

## O que funcionou bem
- **Confirmar agendamento**: clique duplo, triplo e toque duplo com rede lenta (2,5 s) criaram **um** horário só; o botão fica desativado e mostra carregando.
- **Duas abas / dois clientes no mesmo horário**: um vence e o outro recebe 409; "Quem estiver livre" em paralelo distribuiu entre barbeiros sem sobrepor. Depois de voltar, o horário ocupado já não aparece na lista.
- **Fechar comanda** com clique triplo e rede lenta na mesma tela: uma venda só (o problema do U-01 é entre telas diferentes com o corpo da requisição lento).
- **Assinar o clube** (pagamento no balcão) com clique duplo e rede lenta: uma assinatura só; o painel recusa assinatura duplicada para o mesmo cliente.
- **Reservas**: estoque respeitado mesmo com toques seguidos ("só 0 em estoque").
- **Salvar produto** com clique duplo: um cadastro só. Nome só com espaços: "Preencha: Nome".
- **HTML/`<script>` em nomes** (`<img src=x onerror=alert(1)>Pomada 💈`) aparece como texto no painel e no app, sem executar nada; emojis e acentos aparecem bem.
- **Link direto** `/#/caixa` sem login mostra a tela de entrar; senha errada diz "E-mail ou senha incorretos."; requisição sem `x-nexor` é recusada; JSON quebrado volta "JSON inválido.".
- **Telefone errado** no painel: "fone: celular com DDD (ex.: 34 99999-0000)" e no app "Digite o celular com DDD." (claras, fora o prefixo técnico do painel). Bloqueio de folga com fim antes do início e estoque negativo têm mensagens boas em português.
- **App do cliente em 390 px**: nenhuma tela rola para o lado, nenhum botão some; tabelas do painel (Clube, Produtos, Caixa) rolam dentro do próprio cartão.
- Nenhum erro de JavaScript no console em todas as rodadas.
