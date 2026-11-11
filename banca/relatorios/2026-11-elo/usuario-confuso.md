# Relatório do Agente Usuário Confuso · Nexor Elo (localhost:8823, modo demo) · 2026-11-11
Telas e fluxos testados: app do instalador em 390×844 com toque (nova proposta, itens, preço/quantidade, calculadora, salvar/enviar, duas abas, voltar/avançar, recarregar, sessão expirada, link interno sem login, OS: fotos, checklist, assinatura); página do cliente `/p/:token` em 360×640 e 360×380 (teclado aberto): aceitar, pagar, duas abas, rede lenta, sem rede, voltar depois de pagar, link invalidado; painel do fornecedor (desktop e 390 px): aprovar, bloquear/desbloquear, ajuste de estoque, importação de CSV malformado, mensagens.

Capturas: `/home/user/nexorconsulting/banca/relatorios/2026-11-elo/capturas-confuso/`. Scripts Playwright: `/tmp/claude-0/-home-user-nexorconsulting/4db1d3bf-8b4e-5a33-a0c1-2f29abc64b1b/scratchpad/scripts/` (t1–t19).

## Achados

### U-01 · Cliente com duas abas paga duas vezes; estoque baixa em dobro
- Gravidade sugerida: crítica
- Onde: página do cliente `/p/:token` → `POST /api/publico/propostas/:token/pagar`; `src/servicos/negocio.js` (`pagar`, `confirmarPagamento`)
- Como reproduzir: o cliente aceita a proposta #25 (2 câmeras, R$ 500). Ele tem a proposta aberta em duas abas. Na aba A toca em "Pagar com Pix" e recebe a cobrança Pix. Na aba B, que não foi atualizada, escolhe Cartão e toca em "Pagar". O servidor cria uma segunda cobrança no Asaas e marca a cobrança Pix como `cancelado` só no banco local: no Asaas ela continua valendo. O cliente paga o Pix que já estava aberto e depois o cartão. Simulei os dois avisos `PAYMENT_RECEIVED` no `/webhook/asaas` com o token válido.
- O que aconteceu: as duas cobranças foram aceitas. `pagamentos` = `[CREDIT_CARD pago, PIX pago]`. O estoque do produto foi de 68 para 64 numa proposta de 2 unidades, com duas reservas `baixada` de 2. Os repasses ficaram duplicados (fornecedor 2× R$ 281,42; instalador 2× R$ 206,08; Nexor 2× R$ 12,50). `confirmarPagamento` processa um pagamento `cancelado` como se fosse válido e baixa o estoque de novo pelo caminho "reserva vencida, baixa direto". O Simulador do Asaas registrou as duas cobranças (PIX e CREDIT_CARD de R$ 500).
- O que deveria acontecer: uma cobrança viva por proposta. Ao trocar a forma de pagamento, a cobrança anterior deve ser cancelada também no Asaas (`DELETE /payments/:id`). Se uma cobrança cancelada ou uma segunda cobrança for paga numa proposta já `paga`, não deve haver nova baixa nem novos repasses: o caso deve ir para estorno ou análise.
- Evidência: `capturas-confuso/inst-proposta-paga-duas-vezes.png`, `cliente-aba-A-depois-cartao.png`; saída do t13: `antes: estoque 68 reservado 8 | depois PIX: estoque 66 | depois CARTÃO: estoque 64 … reservas [["baixada",2],["baixada",2]]`.
- Correção sugerida: em `pagar`, cancelar no Asaas a cobrança pendente anterior antes de criar outra e serializar por proposta (trava ou `UPDATE … WHERE status='aceita'`). Em `confirmarPagamento`, se `pg.status==='cancelado'` ou a proposta já estiver `paga`, não baixar estoque nem lançar repasses: registrar o caso e abrir estorno.

### U-02 · Mesma proposta enviada duas vezes por duas abas: duas reservas de estoque
- Gravidade sugerida: alta
- Onde: app do instalador, Nova proposta (`public/app/proposta.js`: `salvar`/`btEnviar`; rascunho compartilhado em `localStorage` `nx-elo-rascunho`)
- Como reproduzir: monte uma proposta nova (3× CAM-BL-1080 da Vigia Forte, cliente Juliana). Abra "Nova proposta" em outra aba (o rascunho aparece igual) e toque "Enviar" → "Confirmar envio" nas duas.
- O que aconteceu: foram criadas e enviadas duas propostas, #22 e #23, cada uma com uma reserva ativa de 3 unidades. Isso prende 6 câmeras no estoque do fornecedor. Com a opção "Mandar o link ao cliente" marcada (padrão), o cliente recebe dois links. Também acontece em sequência: a aba antiga, sem `id`, faz um novo `POST`.
- O que deveria acontecer: um rascunho gera uma proposta só. A segunda aba deveria ser avisada ("Esta proposta já foi enviada em outra aba: #22").
- Evidência: `capturas-confuso/app-duas-abas-envio.png`; saída do t6: `propostas "Duas abas CFTV": ['#23 enviada', '#22 enviada'] / #23 reservas [["ativa",3]] / #22 reservas [["ativa",3]]`.
- Correção sugerida: gerar uma chave de idempotência (UUID) ao criar o rascunho local e mandá-la no `POST /propostas`. O servidor devolve a proposta que já existe para a mesma chave. Ouvir o evento `storage` para atualizar `E.id` nas outras abas.

### U-03 · "Salvar" e depois "Enviar" com rede lenta cria um rascunho órfão
- Gravidade sugerida: média
- Onde: app do instalador, Nova proposta (`salvar()` chamado pelos dois botões sem trava em comum)
- Como reproduzir: com rede lenta (3 s), numa proposta nova toque "Salvar". Antes de terminar, toque "Enviar" e, 1 s depois, "Confirmar envio".
- O que aconteceu: #20 ficou em rascunho (órfão) e #21 foi enviada.
- O que deveria acontecer: enquanto um salvamento está em andamento, o envio deveria esperar por ele e reusar o `id`.
- Evidência: `capturas-confuso/app-salvar-enviar-corrida.png`; saída: `novas: ['#21 enviada', '#20 rascunho']`.
- Correção sugerida: guardar a promessa do salvamento em curso (`salvando ??= salvar()`) e fazer o envio aguardá-la. A chave de idempotência do U-02 também resolve.

### U-04 · Checklist da OS diz "salvo" mas o servidor ficou com menos itens
- Gravidade sugerida: média
- Onde: app do instalador, OS → Checklist (`public/app/os.js` `salvarCheck`: cada toque manda a lista inteira, sem ordem nem fila)
- Como reproduzir: com sinal oscilando (primeira requisição atrasada 3 s), marque dois itens seguidos.
- O que aconteceu: a tela mostra 5 itens marcados e "5 de 9 feitos · salvo", mas o servidor tem 4. A resposta antiga chegou por último e sobrescreveu a nova. Sem rede, o item fica marcado na tela e some ao recarregar (só aparece o aviso passageiro).
- O que deveria acontecer: o que a tela mostra como "salvo" precisa estar salvo.
- Evidência: saída do t11: `marcadas na tela 5 no servidor 4 | estado: 5 de 9 feitos · salvo`; `capturas-confuso/os-checklist-offline.png`.
- Correção sugerida: fila sequencial (uma PUT por vez, sempre a lista mais recente) ou PATCH por item. Se der erro, desmarcar a caixa ou mostrar "não salvo" de forma persistente.

### U-05 · Assinatura do cliente aceita um único toque
- Gravidade sugerida: média
- Onde: OS → Assinatura do cliente (`quadroAssinatura`: `riscou = true` já no `pointerdown`)
- Como reproduzir: toque uma vez no quadro (um ponto), escreva o nome "Zé" e toque "Salvar assinatura".
- O que aconteceu: "Assinatura registrada." A OS fica "Assinado por Zé" com um ponto como assinatura e não dá para refazer.
- O que deveria acontecer: exigir um traço mínimo (comprimento ou área) e um nome com mais de 2 letras, e permitir refazer antes de concluir a OS.
- Evidência: `capturas-confuso/os-assinatura-um-toque.png`.
- Correção sugerida: medir o comprimento do traço (por exemplo, mais de 80 px) antes de considerar o quadro preenchido. Pedir nome com pelo menos 2 palavras ou 5 letras.

### U-06 · Importação de CSV: "1.000" no estoque vira 1 unidade, sem aviso
- Gravidade sugerida: alta
- Onde: Fornecedor → Produtos → Importar CSV (`src/http/fornecedor.js`: `Number(l.estoque)`)
- Como reproduzir: importe `CONF-4;Milhar BR;M;C;1.234,56;1.000;un;2;`.
- O que aconteceu: o produto foi criado com estoque = 1. O preço "1.234,56" foi lido certo (R$ 1.234,56), o estoque com o mesmo formato brasileiro não. Nenhum erro na linha. Se o fornecedor atualizar o catálogo com a planilha dele, todos os estoques acima de mil caem para 1–9 e os instaladores deixam de conseguir reservar.
- O que deveria acontecer: ler "1.000" como mil (mesma regra do preço) ou recusar a linha com uma mensagem clara.
- Evidência: saída do t17: `CONF-4 estoque=1 preco=123456`; `capturas-confuso/forn-csv-campos-ruins.png`.
- Correção sugerida: tirar os pontos de milhar do estoque (`/^\d{1,3}(\.\d{3})+$/`) ou recusar estoque com ponto ou vírgula.

### U-07 · Mensagens em inglês e técnicas na importação de CSV
- Gravidade sugerida: média
- Onde: Fornecedor → Importar CSV (resultado por linha vem do zod sem tradução)
- Como reproduzir: importe linhas com estoque "abc", estoque -5, código vazio, prazo "dois" ou foto "nao-e-url".
- O que aconteceu: "Linha 2: estoque: Invalid input: expected number, received NaN", "Linha 4: estoque: Too small: expected number to be >=0", "Linha 7: codigo: Too small: expected string to have >=1 characters", "Linha 10: foto_url: Invalid URL; foto_url: endereço inválido (comece com https://)".
- O que deveria acontecer: frases em português dizendo o que corrigir, por exemplo "estoque precisa ser um número inteiro (ex.: 40)", "falta o código do produto", "prazo em dias, só números".
- Evidência: `capturas-confuso/forn-csv-campos-ruins.png`.
- Correção sugerida: usar o mesmo tradutor de erros das rotas JSON (`validacao.js`) no `safeParse` da importação e remover a mensagem duplicada da URL.

### U-08 · Limites mostrados em centavos e com nome técnico de campo
- Gravidade sugerida: média
- Onde: app do instalador (salvar proposta e calculadora); fornecedor (estoque)
- Como reproduzir: (a) preço de venda 99.999.999.999 → Salvar; (b) calculadora, "Custo da sua mão de obra" = 999999999999; (c) fornecedor, estoque somando 99999999999999.
- O que aconteceu: (a) "Preço de venda: pode ser no máximo 1000000000" (são centavos: o limite real é R$ 10 milhões, mas o usuário lê "1 bilhão"); (b) "Mao obra centavos: pode ser no máximo 1000000000" (nome interno sem acento, "centavos"); (c) "Estoque: pode ser no máximo 10000000" (sem separador de milhar). Em (b), depois de digitar "-20", o erro antigo continua na tela porque o valor negativo é ignorado em silêncio.
- O que deveria acontecer: "O preço por unidade pode ser no máximo R$ 10.000.000,00", "Custo da mão de obra: no máximo R$ 10.000.000,00", "Estoque: no máximo 10.000.000 unidades".
- Evidência: `capturas-confuso/app-salvar-valor-enorme.png`, `calc-mao-obra-enorme.png`.
- Correção sugerida: formatar o limite em reais nos campos `centavos` e usar rótulos humanos no tradutor de erros. Limitar também no campo do app.

### U-09 · Preço "abc" é aceito em silêncio e a proposta usa o valor antigo
- Gravidade sugerida: baixa
- Onde: app do instalador, item da proposta (`entradaDinheiro`)
- Como reproduzir: digite 150 no preço, depois troque por "abc" (ou "-50") e saia do campo.
- O que aconteceu: o campo mostra "abc" com borda vermelha e nenhum texto explicando. O total da linha e da proposta continua R$ 150,00 e "Salvar" grava 150. Valores absurdos de quantidade (1e9) passam a 100.000 sem aviso, e a tela chega a mostrar R$ 9.999.999.999.900.000,00.
- O que deveria acontecer: mensagem ao lado do campo ("Digite um valor como 150,00") e bloquear Salvar/Enviar enquanto houver campo inválido.
- Evidência: `capturas-confuso/app-preco-abc.png`.
- Correção sugerida: texto de erro com `aria-describedby`, desabilitar o envio com campos inválidos e avisar quando a quantidade for limitada.

### U-10 · Calculadora corta valores absurdos sem avisar
- Gravidade sugerida: baixa
- Onde: Nova proposta → Calculadora de precificação
- Como reproduzir: margem 999 (ou -10, "abc"), alíquota 80, taxa do pagamento 150.
- O que aconteceu: a conta usa 90%, 0%, 33% e 20% em silêncio, enquanto o campo continua mostrando 999/80/150. Só a alíquota negativa mostra erro ("Alíquota: precisa ser no mínimo 0"), o que é inconsistente.
- O que deveria acontecer: avisar no campo ("máximo 33%") ou corrigir o valor exibido.
- Evidência: `capturas-confuso/calc-margem-999.png`.
- Correção sugerida: validar no campo com limites visíveis (`min`/`max` e mensagem) e devolver o valor efetivo ao campo.

### U-11 · Bloquear o instalador em duas abas manda o aviso duas vezes
- Gravidade sugerida: baixa
- Onde: Fornecedor → Instaladores → Bloquear (`POST /vinculos/:id/bloquear` sem checar se já está bloqueado)
- Como reproduzir: abra Instaladores em duas abas e bloqueie a Conecta Redes nas duas.
- O que aconteceu: dois registros `vinculo_bloqueado` na auditoria e 2 WhatsApp + 2 e-mails ao instalador ("Vigia Forte bloqueou novas reservas"). O duplo clique na mesma aba está protegido. Detalhe: o duplo clique em "Aprovar" abre e fecha a janela na hora (o segundo clique cai no fundo escuro), e o usuário acha que o botão não funciona.
- O que deveria acontecer: segunda tentativa responde "Este instalador já está bloqueado" (409) sem novo aviso.
- Evidência: `capturas-confuso/forn-bloquear-duas-abas.png`; saída do t16 (4 mensagens "bloqueou").
- Correção sugerida: em bloquear/desbloquear, retornar 409 se o estado já for o pedido. Ignorar cliques no fundo nos primeiros ~300 ms depois de abrir a janela.

### U-12 · Cliente não consegue trocar a forma de pagamento depois de gerar a cobrança
- Gravidade sugerida: baixa
- Onde: `/p/:token`, bloco Pagamento
- Como reproduzir: escolha Boleto e toque Pagar. Depois tente pagar com Pix.
- O que aconteceu: a página só mostra "Abrir o pagamento" da cobrança gerada, sem opção de trocar. A troca só é possível por uma aba antiga, que é justamente o caminho que leva ao U-01.
- O que deveria acontecer: um botão "Trocar forma de pagamento" que cancela a anterior (também no Asaas) e gera a nova.
- Evidência: `capturas-confuso/cliente-aba-A-depois-cartao.png`.
- Correção sugerida: oferecer a troca de forma explícita, junto com a correção do U-01.

### U-13 · Link reaberto pelo instalador mostra "Proposta não encontrada"
- Gravidade sugerida: informativa
- Onde: `/p/:token` depois de "Reabrir para editar" ou "Cancelar"
- Como reproduzir: o cliente está com a proposta aberta. O instalador reabre para editar e o cliente toca "Aceitar".
- O que aconteceu: "Proposta não encontrada. Confira o link com o instalador." A mensagem é clara, mas o cliente não sabe que a proposta mudou.
- O que deveria acontecer: "Esta proposta foi alterada pelo instalador. Peça o link novo." (sem revelar dados).
- Evidência: `capturas-confuso/cliente-aceitar-link-morto.png`, `cliente-link-morto.png`.
- Correção sugerida: guardar o hash dos tokens antigos para responder 410 com a mensagem acima.

### U-14 · Barra fixa "Aceitar proposta" duplica o botão com o teclado aberto
- Gravidade sugerida: informativa
- Onde: `/p/:token` em 360×380 (teclado virtual aberto)
- O que aconteceu: a barra fixa ocupa cerca de 25% da tela visível e repete "Aceitar proposta" logo abaixo do botão real do formulário. Quem toca a barra só vê a página rolar.
- Evidência: `capturas-confuso/cliente-teclado-aberto-360.png`.
- Correção sugerida: esconder a barra fixa quando o formulário `#acao` estiver visível ou um campo estiver com foco.

## O que funcionou bem
- Duplo e triplo toque em "Salvar", "Pagar com Pix", "Aceitar" (com a confirmação em dois toques) e "Salvar estoque" geraram um registro só. Aceitar a mesma proposta em duas abas gerou um aceite e uma notificação.
- Rede lenta (4 s) com toques repetidos em Pagar: uma cobrança. Sem rede: faixa fixa "Sem conexão com a internet…" e aviso claro, em português.
- Recarregar e voltar/avançar no meio da proposta mantêm o rascunho. Sessão expirada no meio do formulário: "Faça login para continuar." e o rascunho continua lá depois de entrar de novo. Links internos sem login (`/app/#/propostas/nova`, `/fornecedor/#/produtos`) levam à tela de entrada.
- Fotos: JPEG de 51 MB (8000×6000) e PNG de 212 MB (12000×9000) foram reduzidos no aparelho e enviados em menos de 2 s. Arquivo que não é imagem: "Não foi possível ler esta imagem. Tente tirar a foto de novo." Assinatura em branco é recusada.
- Estoque abaixo do reservado: a prévia avisa ("Fica 1: abaixo do reservado (7).") e o servidor recusa com uma frase clara. CSV sem cabeçalho mostra exemplo do cabeçalho esperado. Linha que baixaria o estoque abaixo do reservado é recusada.
- `<script>`, `<img onerror>` e emojis em títulos e nomes aparecem como texto. Título de 10 mil caracteres é cortado em 160. Título só com espaços é recusado.
- Sem rolagem lateral em 390 px (app e todas as telas do fornecedor) e em 360 px (página do cliente). Todos os campos têm nome acessível, o foco é visível no Tab (contorno de 2–3 px), há link "Pular para o conteúdo", `lang="pt-BR"`, e nenhuma imagem está sem `alt`.
- Depois de pago, voltar/avançar mostra "Pagamento confirmado" sem opção de pagar de novo.
