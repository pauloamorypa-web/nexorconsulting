# Relatório do Agente Usuário Confuso · Central de Chamados TI v1.11 · 2026-11-11

Ambiente: cópia de trabalho no scratchpad, rodando só em localhost:8843 (`COOKIE_SEGURO=0`, `DATA_DIR=.../ti/dados-confuso`). O código não foi alterado. No fim, parei o meu processo pelo PID.
Usuários fictícios: `gerente.teste` (criado na primeira inicialização), `tecnico.um` (criado pelo `scripts/criar-admin.js`, que só cria gerente), os técnicos `bruno.ficticio` e `carla.ficticia` (criados na tela Usuários) e a funcionária `joana.teste` (cadastro pela tela de login, aprovada na tela de Pedidos de acesso). WhatsApps fictícios (34) 99999-000x.
Capturas: `/home/user/nexorconsulting/banca/relatorios/2026-11-chamados-ti/capturas (guardadas fora do repositório, mostram a marca do cliente)/` (só com esses dados fictícios).

Telas e fluxos testados: login, primeiro acesso (aviso LGPD, WhatsApp, troca de senha), criar acesso pela tela de login (390 px), aprovação de pedido, Usuários (criação com duplo clique), Abrir chamado (duplo e triplo clique, Enter repetido, duas abas, rede lenta, sem rede, voltar/avançar, recarregar, anexos grandes, proibidos e vazios, texto de 10 mil caracteres, HTML no título), sessão derrubada e expirada no meio do formulário, link direto sem login, Esqueci a senha com WhatsApp errado em vários formatos, técnico assumindo o mesmo chamado em duas abas e dois técnicos ao mesmo tempo, Painel da gerência, Painel TV compartilhado (1920 px, 390 px, link inválido), Solicitação de Acesso (busca de CEP), manual, Aviso de Privacidade, navegação só pelo teclado, contraste e rolagem lateral em todas as telas de técnico e gerência a 390 px.

## Achados

### U-01 · O mesmo chamado aberto em duas abas vira dois chamados
- Gravidade sugerida: alta (pedido duplicado)
- Onde: Abrir chamado, `POST /api/chamados` (server.js, linhas 368-398), sem proteção contra envio repetido
- Como reproduzir: a funcionária abre a Central em duas abas (ou no PC e depois de novo após um "travou?"), preenche o mesmo chamado e clica em "Enviar chamado" nas duas.
- O que aconteceu × o que deveria acontecer: foram criados os chamados #1005 e #1006, ambos "T-duas-abas", e os dois caíram na fila de Sistemas. O certo seria criar um só ou, no mínimo, avisar: "Você abriu um chamado igual há 1 minuto (#1005). Quer mesmo abrir outro?".
- Evidência: o banco tem 2 registros com o mesmo título, e a fila aparece em `capturas (guardadas fora do repositório, mostram a marca do cliente)/27-tecnico-inicio.png` (#1005 e #1006). Na mesma aba, o duplo clique, o triplo clique e Enter apertado 5 vezes geraram só 1 chamado cada.
- Correção sugerida: gerar uma chave de idempotência (UUID) ao abrir o formulário e mandá-la no POST, recusando chave repetida. Complementar com um aviso de duplicidade por solicitante, título e categoria nos últimos 10 minutos.

### U-02 · Um técnico "toma" o chamado de outro sem nenhum aviso
- Gravidade sugerida: alta
- Onde: tela do chamado, botão "Assumir chamado" (app.js, linha 1057: o botão aparece mesmo quando já existe outro técnico; linha 1106: a ação vai sem `seLivre`). No servidor, `acao: "assumir"` só confere o dono quando recebe `seLivre`.
- Como reproduzir: Bruno e Carla abrem o chamado #1002. Bruno clica em "Assumir chamado". A tela da Carla continua mostrando "Técnico —" e o botão "Assumir". Carla clica.
- O que aconteceu × o que deveria acontecer: o chamado passou para a Carla sem aviso para nenhum dos dois. O histórico ficou com "Bruno assumiu" seguido de "Carla assumiu", e os dois podem atender o mesmo problema. Com o mesmo técnico em duas abas, o histórico registra "assumiu o chamado" duas vezes. O certo seria a Carla ver "Este chamado já foi assumido por Bruno Ficticio. Quer assumir no lugar dele?". O botão "Assumir" da fila já faz isso certo (devolve 409 para o segundo).
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/28-carla-ve-chamado-ja-assumido.png` e `capturas (guardadas fora do repositório, mostram a marca do cliente)/29-carla-tomou-chamado-do-bruno.png`.
- Correção sugerida: mandar `seLivre: true` também no botão da tela do chamado. Se vier 409, pedir confirmação explícita ("passar para mim"). Não registrar "assumiu" de novo quando o técnico já é o dono. Atualizar a tela do chamado aberto quando chegar o evento ao vivo.

### U-03 · Entrar pelo celular derruba o PC na hora e apaga o que estava sendo digitado
- Gravidade sugerida: alta
- Onde: regra "um acesso por vez" (server.js, linhas 34-75) e evento `encerrada` (app.js, linha 2249). O mesmo acontece com a sessão expirada no envio (app.js, linha 16).
- Como reproduzir: a funcionária escreve um chamado longo no PC e, enquanto isso, entra pelo celular para ver outro chamado.
- O que aconteceu × o que deveria acontecer: o PC voltou na hora para a tela de login com "Sua conta foi acessada em outro lugar..." e o texto digitado se perdeu. Com a sessão expirada, clicar em "Enviar chamado" também leva para o login e descarta o formulário. O certo seria guardar o rascunho e, depois de entrar de novo, devolver a pessoa ao formulário preenchido. Na equipe de TI, celular e PC ao mesmo tempo é o normal: a regra precisa ser opcional ou permitir pelo menos 2 aparelhos.
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/20-pc-apos-login-no-celular.png` e `capturas (guardadas fora do repositório, mostram a marca do cliente)/22-sessao-expirada-no-envio.png`.
- Correção sugerida: salvar o rascunho do formulário em `localStorage` a cada digitação. Permitir N sessões por usuário (configurável) ou, pelo menos, avisar no aparelho novo antes de derrubar o outro.

### U-04 · Os botões Voltar e Recarregar do navegador perdem o fluxo
- Gravidade sugerida: média
- Onde: o aplicativo inteiro (app.js não usa `history`/`hash`, e a URL é sempre `/`)
- Como reproduzir: preencher metade do chamado e apertar Voltar no celular ou F5.
- O que aconteceu × o que deveria acontecer: Voltar saiu do sistema (foi para a página anterior do navegador). Avançar voltou para "Meus chamados" com o formulário vazio. F5 também zerou tudo. Links diretos (`/#novo`) não levam a nenhuma tela, o que impede mandar ao técnico um link do tipo "veja o chamado #1008". O certo seria Voltar retornar à tela anterior do sistema e o rascunho continuar lá.
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/16-depois-de-voltar-e-avancar.png`.
- Correção sugerida: rotas com hash (`#/novo`, `#/chamado/1008`) e `popstate`, rascunho em `localStorage` e aviso `beforeunload` quando houver texto não enviado.

### U-05 · Sem internet, o erro aparece em inglês: "Failed to fetch"
- Gravidade sugerida: média
- Onde: Abrir chamado e todas as telas que usam `api()` (app.js, linha 13). Erros de rede não são tratados.
- Como reproduzir: o Wi-Fi cai e a pessoa clica em "Enviar chamado".
- O que aconteceu × o que deveria acontecer: apareceu "Failed to fetch" em vermelho. O certo seria algo como "Sem conexão com a Central. Seu texto foi mantido; confira a internet e clique em Enviar de novo."
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/12-offline-ao-enviar.png`.
- Correção sugerida: envolver o `fetch` em `try/catch` e trocar `TypeError` por uma mensagem em português. Tratar 413 e 502/504 (proxy e Cloudflare) com mensagens próprias.

### U-06 · Texto colado longo é cortado sem aviso
- Gravidade sugerida: média
- Onde: `txt()` com limite de 5000 (server.js, linha 119) e título com `maxlength=120`
- Como reproduzir: colar um log ou e-mail de cerca de 10 mil caracteres na descrição e enviar.
- O que aconteceu × o que deveria acontecer: o chamado foi gravado com 5000 caracteres, e o final (onde costuma estar a mensagem de erro) sumiu sem aviso. O certo seria um contador ("5000/5000") e a orientação "Texto muito longo: anexe como arquivo .txt".
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/17-chamado-com-html-e-texto-gigante.png` (o texto termina em "...Lo").
- Correção sugerida: `maxlength` e contador no textarea, mensagem clara no servidor (400) em vez de cortar e, para textos longos, criar um anexo .txt automaticamente.

### U-07 · Uma palavra longa (link, código de erro) quebra a tela e cria rolagem lateral
- Gravidade sugerida: média
- Onde: título do chamado (`h1`), lista "Aguardando um técnico assumir" do Painel e histórico
- Como reproduzir: abrir um chamado com um título que tenha uma URL comprida ou um código sem espaços.
- O que aconteceu × o que deveria acontecer: no celular a página ficou com 1185 px de largura em vez de 390, e no desktop com 1429 em vez de 1366. No Painel da gerência, o título passa por cima da etiqueta "Baixa". O certo seria o texto quebrar dentro da largura da tela.
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/19-chamado-html-celular.png`, `capturas (guardadas fora do repositório, mostram a marca do cliente)/19-chamado-html-desktop.png` e `capturas (guardadas fora do repositório, mostram a marca do cliente)/30-painel-gerente-1366.png`.
- Correção sugerida: `overflow-wrap:anywhere` em títulos, mensagens e células, e `min-width:0` nos itens de grid e flex.

### U-08 · Esqueci a senha: o WhatsApp certo é recusado e a pessoa fica sem saída
- Gravidade sugerida: média
- Onde: tela "Esqueci minha senha" (`mascaraWhats` corta em 11 dígitos, app.js, linha 190) e `POST /api/esqueci`
- Como reproduzir: errar a senha 2 vezes, clicar em "Pedir nova senha" e digitar o número como ele aparece na agenda: "+55 34 99999-0004".
- O que aconteceu × o que deveria acontecer: a máscara transformou o número em "(55) 34999-9900" e a resposta foi "Usuário e WhatsApp não conferem com o cadastro. Confira os dados ou fale com a TI." Com "034999990004", virou "(03) 49999-9000". Quem não sabe a senha não tem como "falar com a TI" pela Central, e a tela não mostra telefone nem ramal. Outros problemas: a opção só aparece depois de errar a senha 2 vezes (quem já sabe que esqueceu precisa errar de propósito), e o texto da tela de login diz "Esqueceu a senha? Peça para a TI redefinir.", o que contradiz o fluxo e o manual. O usuário digitado como "Joana.Teste " (maiúsculas e espaço) foi aceito, o que é bom.
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/23-login-2-erros-390.png`, `capturas (guardadas fora do repositório, mostram a marca do cliente)/24-esqueci-whats-errado-390.png`, `capturas (guardadas fora do repositório, mostram a marca do cliente)/25-esqueci-mais55-truncado-390.png` e `capturas (guardadas fora do repositório, mostram a marca do cliente)/26-esqueci-ok-390.png`.
- Correção sugerida: tirar o 55 e o 0 iniciais antes de aplicar a máscara (o servidor já faz isso). Deixar o link "Esqueci a senha" sempre visível. Mostrar um contato da TI configurável no `.env` na mensagem de erro. Corrigir o texto da ajuda do login.

### U-09 · A busca automática de CEP e CNPJ da Solicitação de Acesso nunca funciona
- Gravidade sugerida: média
- Onde: `buscaCEP`/`buscaCNPJ` (app.js, linhas 640-670) contra a CSP `connect-src 'self'` (server.js, linha 1074)
- Como reproduzir: Abrir chamado → Acessos e permissões → preencher o CEP.
- O que aconteceu × o que deveria acontecer: o navegador bloqueia a chamada para viacep.com.br e brasilapi.com.br ("violates the following Content Security Policy directive: connect-src 'self'"), e a pessoa sempre vê "Não deu para consultar o CEP agora. Preencha à mão.". O recurso anunciado não funciona em nenhum caso.
- Evidência: saída do Playwright com a violação de CSP registrada no console (mesmo com a rede simulada respondendo OK). Tela: `capturas (guardadas fora do repositório, mostram a marca do cliente)/39-solicitacao-acesso.png`.
- Correção sugerida: liberar `https://viacep.com.br https://brasilapi.com.br` no `connect-src` ou fazer a consulta pelo servidor (`/api/cep/:cep`).

### U-10 · O Painel TV público mostra nome de pessoa e "Esqueci a senha"
- Gravidade sugerida: média
- Onde: Painel compartilhado (`/painel.html?t=...&modo=tv`), lista "Últimos chamados". O título é gerado pelo servidor como `Esqueci a senha: <nome>` (server.js, linha 297).
- Como reproduzir: um funcionário pede nova senha. A TV da sala mostra o pedido.
- O que aconteceu × o que deveria acontecer: a TV exibiu "#1009 Média Esqueci a senha: Joana Teste". O README promete que o link mostra "só números, títulos e técnicos", mas o título traz o nome da pessoa e o motivo, à vista de qualquer um. No celular, o aviso amarelo "Clique aqui uma vez para ligar o som" fica fixo por cima dos dados.
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/31-painel-tv.png` e `capturas (guardadas fora do repositório, mostram a marca do cliente)/31-painel-celular.png`.
- Correção sugerida: título neutro ("Pedido de nova senha") com o nome só nos campos internos, opção de ocultar títulos no modo TV e aviso de som menor, que some sozinho.

### U-11 · Mensagens de erro antigas continuam na tela do cadastro
- Gravidade sugerida: baixa
- Onde: Criar acesso (tela de login), campos com `required`/`minlength` que o navegador valida antes do script
- Como reproduzir: errar o nome (aparece "Digite nome e sobrenome usando só letras."), corrigir o nome e digitar uma senha de 3 letras.
- O que aconteceu × o que deveria acontecer: a mensagem vermelha continuou dizendo que o nome está errado, enquanto o navegador mostrava o próprio balão sobre a senha. Desmarcar "Li o Aviso" deixou na tela a mensagem anterior, sobre o WhatsApp. Num navegador em inglês o balão nativo aparece como "Please fill out this field.". O certo seria uma única mensagem, atual, junto do campo com problema.
- Evidência: saída do teste (sequência de 9 tentativas) e `capturas (guardadas fora do repositório, mostram a marca do cliente)/06-cadastro-vazio-390.png`.
- Correção sugerida: `novalidate` no formulário e validação própria em português, limpando `#cerr` a cada tentativa e marcando o campo com `aria-invalid`.

### U-12 · Detalhes de anexos que confundem
- Gravidade sugerida: baixa
- Onde: caixa de anexos (Abrir chamado e respostas)
- Como reproduzir e o que aconteceu:
  - um arquivo de 0 byte aparece como "1 KB" e só é recusado no envio ("O arquivo "vazio.png" está vazio.");
  - um arquivo de 6 bytes também aparece como "1 KB";
  - o mesmo PDF pode ser anexado 4 vezes sem aviso;
  - ao passar do limite, a mensagem diz só "Máximo de 5 arquivos.", sem dizer quais ficaram de fora;
  - um `.exe` renomeado para `.pdf` é aceito, porque só a extensão é verificada (informativo para o agente de segurança).
  
  Funcionou bem: 11 MB foi recusado com "tem 10,5 MB e passa do limite de 10 MB", `.exe`/`.svg`/`.html` foram recusados com mensagem clara, e 5 PDFs de 9 MB foram enviados em cerca de 3 s.
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/13-anexo-grande.png`, `capturas (guardadas fora do repositório, mostram a marca do cliente)/14-anexo-proibido.png` e `capturas (guardadas fora do repositório, mostram a marca do cliente)/15-anexo-vazio-erro.png`.
- Correção sugerida: recusar arquivo vazio na hora de anexar, mostrar o tamanho em bytes ou KB reais, avisar sobre arquivo repetido, listar os arquivos ignorados e conferir a assinatura (magic bytes) no servidor.

### U-13 · "Cancelar" durante o "Enviando…" não cancela
- Gravidade sugerida: baixa
- Onde: Abrir chamado (botão Cancelar continua ativo durante o envio)
- Como reproduzir: no celular com rede lenta, tocar em Enviar e logo em seguida em Cancelar.
- O que aconteceu × o que deveria acontecer: o chamado foi criado e a tela abriu nele. Para a pessoa, ela tinha desistido. O certo seria desativar o Cancelar durante o envio ou trocar o texto para "Enviando, aguarde".
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/37-apos-cancelar-durante-envio-390.png`.
- Correção sugerida: desativar o Cancelar enquanto `#benv` estiver desativado.

### U-14 · O Aviso de Privacidade não conta tudo o que o agente faz
- Gravidade sugerida: média
- Onde: `/privacidade.html` e a tela de ciência no primeiro acesso
- O que aconteceu × o que deveria acontecer: o aviso diz que o agente "só coleta os dados técnicos" e "não lê ... o que aparece na tela". A versão 1.11 (VERSAO.txt), porém, instala e mantém o Radmin, que é acesso remoto à tela, desliga e reinicia o computador a distância e executa "qualquer programa/comando/BAT". Nada disso está no aviso. Outros pontos: o encarregado aparece como "a definir", e as fontes vêm do Google (fonts.googleapis.com), o que envia o IP de cada pessoa ao Google sem menção no aviso. O certo seria o funcionário saber exatamente o que a TI consegue fazer no computador dele.
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/32-privacidade-1366.png` e `capturas (guardadas fora do repositório, mostram a marca do cliente)/02-gerente-primeiro-acesso.png` (resumo da ciência).
- Correção sugerida: incluir no aviso o acesso remoto (Radmin), os comandos remotos e quando são usados. Exigir `ENCARREGADO_*` na instalação. Servir as fontes localmente.

### U-15 · Pequenas falhas de acessibilidade
- Gravidade sugerida: baixa
- Onde e o que aconteceu:
  - o botão "Sair" não mostra foco ao navegar com Tab, por causa do `all:unset` em `.side .who button`, style.css, linha 87;
  - o logo do manual não tem `alt`;
  - a etiqueta "Novo" tem contraste de 4,33:1 em 12,5 px, abaixo de 4,5;
  - os toasts escuros ficam vários segundos sobre o conteúdo e cobriram a lista e os botões nas capturas de 1366 e 390 px.
  
  O restante foi bem: a ordem de Tab é lógica, o foco é visível nos campos e botões, os botões de olho têm `aria-label`, `lang="pt-BR"` está presente e o HTML digitado em nomes e títulos aparece como texto, sem executar.
- Evidência: `capturas (guardadas fora do repositório, mostram a marca do cliente)/33-foco-teclado.png` e `capturas (guardadas fora do repositório, mostram a marca do cliente)/36-detalhes-390.png` (toast sobre os tipos).
- Correção sugerida: `:focus-visible` explícito no Sair, `alt` no logo, cor da etiqueta mais escura e toasts no topo, menores e com tempo ajustado ao tamanho do texto.

### U-16 · Aparência: o que dá cara de sistema feito em casa e o que fazer para vender
- Gravidade sugerida: informativa (prioridade comercial)
- Onde: todas as telas
- O que parece amador hoje:
  1. **Produto preso a um cliente.** Logo Cliente, "Motos e Bikes Elétricas", sistemas Genesis/OMIE/MobControl, Traccar, e-mail padrão `@clientepaineis.com.br` e "Cliente Equipamentos Ltda" estão fixos no código. Não dá para vender a outra empresa sem editar código.
  2. **Painéis com muito espaço vazio.** No Painel da gerência, "Precisam de atenção" e "Alertas do inventário" são caixas enormes com uma frase só, e o gráfico de 14 dias tem uma barra só, sem o rótulo de hoje (os rótulos pulam um dia). Fica a sensação de tela inacabada (`capturas (guardadas fora do repositório, mostram a marca do cliente)/30-painel-gerente-1366.png`, `capturas (guardadas fora do repositório, mostram a marca do cliente)/31-painel-tv.png`).
  3. **Menu lateral só com texto**, sem ícones, com 11 itens iguais para a gerência. No celular o menu vira um bloco escuro de cerca de 250 px antes do conteúdo (`capturas (guardadas fora do repositório, mostram a marca do cliente)/34-funcionario-celular-inicio.png`).
  4. **Fonte mono em excesso** (datas, usuário, "Gerência de TI" em amarelo mono, prazos), o que lembra tela técnica.
  5. **Abertura de chamado longa no celular.** São 8 cartões de tipo empilhados e 4 seções. A pessoa rola cerca de 3 telas até o título, e a tela não rola sozinha para o passo seguinte quando ela escolhe "Sistemas" (`capturas (guardadas fora do repositório, mostram a marca do cliente)/36-detalhes-390.png`).
  6. **Estados vazios só com texto cinza**, sem ilustração nem ação sugerida.
  7. **Toasts escuros sobre o conteúdo** e mensagens técnicas (ver U-05).
  8. **Favicon genérico** e nada de identidade do produto (nome próprio do produto, tela "Sobre", versão).
- O que já está bom: paleta coerente (azul petróleo e amarelo da marca), cartões de escolha claros, etiquetas de prioridade e status legíveis, login limpo, modo TV escuro bem resolvido a 1920 px sem rolagem, manual interativo bonito e responsivo.
- Prioridades para virar produto vendável:
  1. Marca configurável (logo, nome, cores, textos de categorias e e-mail em `.env` ou tela de Configuração) e nome próprio do produto.
  2. Corrigir os achados de fluxo U-01 a U-05 (duplicidade, perda de digitação, erro em inglês), que são o que o cliente sente primeiro.
  3. Painel com grid que se ajusta ao conteúdo (sem caixas vazias de altura fixa) e gráfico com o rótulo de hoje.
  4. Abertura de chamado "mobile first": tipo como lista compacta ou busca ("Descreva o problema") e rolagem automática ao próximo passo.
  5. Ícones no menu, menu recolhível no celular (barra inferior ou hambúrguer) e redução da fonte mono a números.
  6. Estados vazios e toasts com cuidado visual, e um sistema de design único (tokens de cor, espaçamento e tipografia) aplicado também ao painel e ao manual.

## O que funcionou bem
- Duplo clique, triplo clique e Enter repetido em "Enviar chamado" geraram 1 chamado só. O botão vira "Enviando…" e fica desativado, inclusive com rede lenta (`capturas (guardadas fora do repositório, mostram a marca do cliente)/11-enviando-rede-lenta.png`).
- O duplo clique em "Criar usuário" e em "Pedir nova senha" não duplicou. Um segundo pedido de senha devolve o chamado já aberto.
- Na fila, o botão "Assumir" com dois técnicos ao mesmo tempo dá certo para um só (o outro recebe 409 com o nome de quem assumiu).
- As mensagens do servidor estão em português, claras e com o que fazer (anexo grande, tipo proibido, WhatsApp repetido, campos faltando listados).
- HTML e `<script>` em títulos e descrições aparecem como texto, e o nome com emoji ou `<script>` é recusado no cadastro.
- Sem rolagem lateral da página a 390 px nas telas de funcionário, técnico e gerência (as tabelas rolam dentro da própria caixa). O manual e a privacidade se adaptam bem ao celular.
- O Painel TV a 1920×1080 encaixa sem rolagem, e o link inválido explica o que fazer.
- Link direto sem login leva à tela de login, e a API devolve 401 em português.
- A navegação por Tab segue ordem lógica, com foco visível na maioria dos controles.
