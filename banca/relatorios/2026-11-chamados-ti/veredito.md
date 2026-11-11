# Veredito da Banca · Central de Chamados TI · 11/11/2026

**Nota: 3,5 de 10 na v1.11 · 8,0 de 10 na v1.12 · Pronta para produção com ressalvas.**
Na v1.11, uma URL malformada derrubava o servidor, e qualquer técnico podia assumir a conta do gerente e rodar comandos como SYSTEM em todos os computadores. A v1.12 fecha os 4 itens graves e os 7 altos, cada um com teste. Na conferência, o Veredito achou uma brecha que deixava parte de dois itens graves aberta (V-02 e V-03), corrigiu e acrescentou teste. Para chegar a "sim", faltam três coisas: a aprovação dos computadores pela gerência na atualização, um teste dos agentes em Windows e Mac reais e os itens da seção "Em aberto".

## Como foi a rodada
- Quatro agentes da banca rodaram em paralelo na v1.11: [Hacker](hacker.md), [Programador Sênior](programador-senior.md), [Testador](testador.md) e [Usuário Confuso](usuario-confuso.md). As capturas do Usuário Confuso ficam fora do repositório porque mostram a marca do cliente.
- Somados, os relatórios trouxeram 45 achados brutos (H 7, P 19, T 3, U 16). Juntando os duplicados, ficaram 36 itens: P-01 = T-01; H-01 = P-13; H-02 = P-02; H-03 = P-03 + P-04; P-06 = U-02; H-04 = U-10; P-17 = U-16. O P-19 (testes que não pegavam os defeitos) foi absorvido: cada item corrigido ganhou o próprio teste.
- A correção foi aprovada pelo responsável e aplicada em 11 commits sobre a v1.11. O Veredito conferiu o diff inteiro de `server.js` e `inventario.js` e reproduziu os itens graves e altos com a suíte.
- Suíte: 312 testes na v1.11, 407 na entrega da v1.12 e **421 de 421** depois da correção do Veredito.
- **O que a banca confirmou como sólido:**
  - Senhas com scrypt e sal, comparação em tempo constante e login com o mesmo tempo de resposta com ou sem usuário.
  - SQL sempre parametrizado nos valores.
  - Sem IDOR em chamados e anexos: nota interna oculta ao usuário e anexo servido com `sandbox` e `attachment`.
  - Caminho estático protegido contra path traversal.
  - Sessão com HMAC, `HttpOnly` e `SameSite`, que cai quando a senha muda.
  - CSP sem `unsafe-inline` na tela principal. `X-Frame-Options`, `nosniff` e HSTS sob HTTPS.
  - Saída sempre escapada no front-end: HTML digitado aparece como texto.
  - CSV protegido contra fórmulas.
  - Manifestos, pacotes e atualização do agente assinados com RSA, e o agente confere o SHA-256.
  - Duplo e triplo clique e Enter repetido em "Enviar chamado" geram um chamado só.
  - Carga de 500 requisições simultâneas com p95 abaixo de 1 s.
  - Sem rolagem lateral a 390 px nas telas de funcionário, técnico e gerência.
  - Projeto sem dependências externas.

## Corrigidos (com teste em `scripts/testar.js`, grupos "1.12")
| Item | Origem | Gravidade | O que era | Correção |
|---|---|---|---|---|
| V-01 | P-01, T-01 | Grave | `GET /%E0%A4%A`, sem login, derrubava o processo Node e deixava a Central fora do ar | A decodificação ficou dentro do `try` e responde 400. `unhandledRejection`, `uncaughtException` e `clientError` registram o erro sem derrubar. O teste confere que o servidor continua no ar |
| V-02 | H-01, P-13 | Grave | Um técnico com a permissão Usuários (todos têm, por padrão) redefinia a senha do gerente e entrava como ele. Também criava gerente, desativava todos os gerentes e "aprovava" para reativar quem fora desativado | Só a gerência altera, redefine a senha, desativa, exclui ou anonimiza um gerente. Ninguém cria nem promove alguém acima do próprio perfil. A trava do último gerente vale em todos os caminhos. "Aprovar" só vale para pedido pendente. **Complemento do Veredito:** a senha temporária do "Esqueci a senha" ainda saía para técnico quando o pedido era de um gerente. Agora só a gerência gera essa senha |
| V-03 | H-02, P-02 | Grave | A permissão `inventario_admin`, ligada por padrão, deixava qualquer técnico desligar, reiniciar e instalar, inclusive com passo `cmd` como SYSTEM em "todos". O README prometia arquivos cifrados, o que não era verdade | Permissão nova `comando_remoto`, desligada para todas as equipes, inclusive as que já existiam. O helper ganhou um nome honesto (`exigeInvAdmin`). O README foi corrigido. **Complemento do Veredito:** um técnico com Usuários podia se mover para uma equipe com `comando_remoto`, criar um técnico nela com senha conhecida ou redefinir a senha de quem estava nela. Agora ninguém entra nem põe alguém numa equipe com permissões que a própria equipe não tem, nem mexe na conta de quem está nela |
| V-04 | H-03, P-03, P-04 | Grave | O token do agente era um só para todas as máquinas e saía no cadastro público, antes da aprovação. Com ele dava para falsificar inventário, interceptar e suprimir comandos de outra máquina, baixar pacotes, marcar como "feito" o comando de outro PC e, pela recusa do cadastro, apagar um computador verdadeiro | O código de inscrição (geral ou pessoal) só registra a máquina. Cada computador recebe um código próprio, guardado como hash, que só vale depois da aprovação da gerência. Um pessoal pendente tem no máximo 3 pedidos. Pedidos, resultados, passos e pacotes ficam presos ao computador do código. O pacote só sai para quem tem pedido válido. A aprovação não troca o dono de um PC que já tem dono |
| V-05 | P-05 | Alto | A fila não expirava. Um "desligar" de sexta desligava a máquina na segunda, um reinício podia entrar em ciclo, e cancelar um pedido já entregue descartava o resultado real | `expira_em` e `tentativas`. Energia vale 15 min e nunca é reentregue. Instalar sai uma vez só. Os outros pedidos saem no máximo 3 vezes. O que já foi entregue não pode mais ser cancelado |
| V-06 | P-06, U-02 | Alto | Na tela do chamado, "Assumir" tomava o chamado de outro técnico em silêncio e passava por cima da permissão `atribuir` | O servidor sempre recusa com 409. Tomar o chamado exige `forcar` e a permissão `atribuir`, e fica no registro. O UPDATE é atômico, com conferência de `changes`. A tela pede confirmação |
| V-07 | U-01 | Alto | O mesmo chamado aberto em duas abas virava dois chamados | O formulário gera uma chave de envio, com índice único no banco. A segunda aba recebe o chamado que já existe. Vale também para a Solicitação de Acesso |
| V-08 | P-07 | Alto | O IP do Registro de atividades vinha de uma variável global e podia ser o de outra requisição | `AsyncLocalStorage` por requisição. O teste usa uma requisição lenta concorrente |
| V-09 | U-03 | Alto | Entrar pelo celular derrubava o PC na hora e apagava o texto digitado | Até `SESSOES_MAX` (padrão 5) sessões por pessoa. Sair encerra só o aparelho atual. Trocar a senha encerra os outros. O rascunho do chamado e da resposta fica guardado. As sessões abertas na 1.11 continuam valendo |
| V-10 | H-04, U-10 | Alto | O link da TV, sem login, mostrava hostnames e títulos com nome de pessoa ("Esqueci a senha: <nome>") | No modo TV o título vira "categoria · #número", sem assuntos digitados nem nome de computador. O chamado do "Esqueci a senha" ganhou título neutro |
| V-11 | P-12 | Alto | O backup copiava só o banco: anexos, pacotes e `.secret` ficavam de fora. Arquivos ficavam órfãos quando a transação desfazia | O backup inclui anexos, pacotes e `.secret` e sai com código de erro quando falha. Os anexos são gravados antes da transação e apagados se ela desfizer. A reconciliação roda a cada 6 h e na tela Espaço |
| V-12 | P-10 | Médio | O bootstrap trazia todos os chamados com toda a conversa, o técnico carregava tudo duas vezes, havia consultas N+1, e cada passo do agente fazia todas as telas recarregarem | A conversa vem ao abrir o chamado (`GET /api/chamados/:id`). O inventário fica em cache de 30 s. As expressões dos programas proibidos são montadas uma vez. O N+1 saiu, há índices novos, e os eventos dizem o que mudou (`chamados`, `inventario`, `pc:<id>`) |
| V-13 | P-08 | Médio | Não havia máquina de estados: o técnico fechava sem a confirmação do usuário, e sobravam "Em atendimento" sem técnico e respostas perdidas em "Resolvido" | Tabela de transições. "Resolvido" só com solução registrada. "Fechado" só pelo solicitante ou sozinho depois de `AUTO_FECHAR_DIAS` (7). Transferir ou remover o técnico devolve o chamado à fila. Resposta do solicitante num chamado resolvido reabre |
| V-14 | P-09 | Médio | O SLA corria em "Aguardando usuário", a prioridade nova dava prazo no passado e o "hoje" seguia o fuso do processo | O prazo pausa e soma o tempo parado. A prioridade nova parte de agora e mantém a proporção já gasta. Reabrir dá prazo novo. "Hoje" usa o `FUSO`. **Horário comercial ficou em aberto** |
| V-15 | P-11 | Médio | Instaladores de 96 MB e anexos de até 71 MB ficavam inteiros na memória | Instaladores e arquivos do Radmin são gravados em streaming, com o SHA-256 calculado no caminho. Anexos acima de 8 MB: no máximo `ENVIOS_GRANDES_MAX` (3) ao mesmo tempo, o resto recebe 503. **Anexo em base64 na memória ficou em aberto** |
| V-16 | P-14 | Médio | A anonimização deixava o nome em títulos, campos extras e mensagens, e reescrevia o Registro de atividades | Nome, usuário, WhatsApp e e-mail saem de títulos, extras, mensagens e inventário. O Registro de atividades fica intacto e ganha uma linha |
| V-17 | P-15 | Médio | Editar categorias tirava a marca "interna" da Solicitação de Acesso | As categorias internas são preservadas, e `garantirCatAcesso()` roda junto |
| V-18 | P-17, U-16 | Médio | Logins nominais com privilégio de Parceiro, domínio de e-mail e e-mail de acessos fixos no código e no seed | Agora vêm do `.env` (`PARCEIRO_LOGINS`, `EMAIL_DOMINIO`, `EMAIL_ACESSOS`), vazios por padrão. A cópia LGPD usa `EMPRESA_NOME`. Menu com ícones e estados vazios. **Parcial:** veja "Em aberto" |
| V-19 | H-05 | Médio | Senha mínima de 6 caracteres, sem filtro | Mínimo de 10 caracteres, diferente do usuário e fora de uma lista de senhas óbvias, em todos os caminhos. A senha temporária passou para 10 caracteres |
| V-20 | T-03 | Médio | Com o banco travado, a escrita esperava 5 s e respondia 500 opaco | Espera de 2,5 s (`DB_ESPERA_MS`) e resposta 503 "Sistema ocupado" |
| V-21 | U-04 | Médio | Voltar e Recarregar perdiam o fluxo, e não havia link direto para um chamado | Endereço por hash (`#/lista`, `#/chamado/123`) e rascunho guardado |
| V-22 | U-05 | Médio | Sem rede, aparecia "Failed to fetch" | Mensagem em português, e o texto digitado é mantido |
| V-23 | U-06 | Médio | Texto acima de 5.000 caracteres era cortado sem aviso | O servidor responde 400 com orientação, e a tela tem contador e `maxlength` |
| V-24 | U-08 | Médio | "+55 34 9..." era recusado no "Esqueci a senha", e a pessoa ficava sem saída | A máscara tira o 55 e o 0. O link fica sempre visível, a tela mostra o contato da TI (`CONTATO_TI`) e o texto de ajuda foi corrigido |
| V-25 | U-09 | Médio | A consulta de CEP e CNPJ nunca funcionava (CSP) | A consulta sai do servidor, com 6 s de limite e cache de 24 h |
| V-26 | U-14 | Médio | O Aviso de Privacidade omitia o Radmin, os comandos remotos e as fontes do Google, e o encarregado aparecia como "a definir" | O aviso foi completado, e o encarregado vem do `.env`. **As fontes continuam no Google (em aberto)** |
| V-27 | T-02 | Básico | Corpo `null`, número ou lista gerava 500 | Só objeto é aceito (ou lista, quando a rota pede). O resto recebe 400 |
| V-28 | H-06 | Básico | O CSRF dependia só do `Origin` | Pedido que muda dados exige também `X-Requested-With`. As rotas do agente ficam de fora |
| V-29 | H-07 | Básico | `do-usuario` exigia só "ser da TI" | Agora exige a permissão `inventario` |
| V-30 | P-16 | Básico | Mapas em memória que só cresciam, e a senha temporária zerava o bloqueio de todos os IPs | Janela de 15 min e poda periódica. A senha temporária libera só o bloqueio daquele usuário |
| V-31 | P-18 | Básico | Código duplicado e exports mortos | Uma só `lerCorpo`, `migrarColuna`, lista única das tabelas com login (agora com pedidos e pacotes) e exports mortos removidos. Os arquivos grandes não foram divididos |
| V-32 a V-36 | U-07, U-11, U-12, U-13, U-15 | Básico | Palavra longa quebrando a tela, mensagem de erro antiga, tamanhos de anexo, Cancelar durante o envio e foco no Sair | `overflow-wrap`, validação própria com `novalidate`, tamanhos reais, arquivo vazio ou repetido recusado na hora, Cancelar que interrompe o envio, `:focus-visible` e contraste da etiqueta "Novo". A assinatura (magic bytes) do anexo não é conferida |

## Correção do Veredito (commit `5563d5a`, 14 testes no grupo "1.12 · Veredito")
A conferência por amostragem dos itens graves achou duas brechas que derrubavam parte de V-02 e V-03. Os 14 testes rodaram contra o código entregue (9 falharam) e depois contra o corrigido (passaram):
1. Num pedido de "Esqueci a senha" de um gerente, o técnico de Sistemas gerava a senha temporária e entrava como gerente. Quem sabe o WhatsApp do gerente, visível na guia Usuários, abre esse pedido pela tela de login. Agora `redefinir-senha` passa pela mesma trava das contas de gerente.
2. Um técnico com a permissão Usuários se movia para uma equipe com `comando_remoto`, criava nela um técnico com senha que ele conhecia ou redefinia a senha de quem já estava lá. Agora ninguém entra nem põe alguém numa equipe com permissões que a própria equipe não tem, nem altera, desativa ou redefine a senha de quem está nela. O que é da própria equipe (ou abaixo dela) continua com o técnico.

## Não confirmados ou descartados
- Nenhum achado foi descartado. Duas observações:
  - **P-06:** não havia corrida de banco, porque o processo é único e síncrono. O defeito era de regra de negócio, e foi corrigido assim.
  - **H-06:** o risco prático já era baixo (`SameSite=Lax` e corpo JSON). Foi reforçado mesmo assim.
- Os itens de tela (V-21, V-22, V-24, V-26 e V-32 a V-36) foram conferidos pela leitura do código. Esta rodada não os repetiu num navegador.

## Em aberto (próxima versão; nenhum bloqueia a produção com as ações abaixo)
- **Médios:**
  - **Anexos em base64 na memória:** cada envio passa inteiro pela memória (até cerca de 71 MB). O limite de 3 envios grandes ao mesmo tempo segura um servidor pequeno, mas o certo é envio binário em streaming, como já é com os instaladores.
  - **SLA sem horário comercial nem feriados:** um chamado "Baixa" aberto na sexta às 17 h vence na segunda às 17 h. Falta uma função `calcularPrazo` com calendário configurável.
  - **Agentes `.bat` e `.sh` não testados em Windows e Mac reais:** registro, `maquina.tok`, espera da aprovação e atualização a partir da 1.11 foram conferidos pelo código e pela simulação na suíte. Antes de liberar para todas as estações, convém rodar o fluxo completo em uma máquina de cada sistema.
  - **Marca do cliente ainda fixa no código** (resto de V-18): logo, nome padrão da empresa, categorias, empresas do grupo, sistemas do formulário de acesso, nomes da tarefa agendada e da pasta do agente e a lista de senhas óbvias. Não atrapalha esta instalação, mas impede vender o sistema como produto sem editar código.
- **Básicos:**
  - **Google Fonts:** as telas ainda carregam as fontes de `fonts.googleapis.com`, o que manda o IP de cada pessoa ao Google. O aviso já cita isso. O ideal é servir as fontes pelo próprio servidor.
  - **`MANUAL-INSTALACAO.html` não revisado:** pode estar desatualizado em relação à 1.12 (código por computador, aprovação e variáveis novas do `.env`), e também tem a marca do cliente.
  - P-18: dividir `server.js` e `inventario.js`, que continuam com mais de mil linhas cada.
  - U-12: conferir a assinatura (magic bytes) dos anexos no servidor.

## Ação do responsável
- **Aprovar cada computador uma vez na atualização:** depois de subir a 1.12, os agentes se atualizam e se registram sozinhos. Até alguém aprovar, eles não enviam inventário nem recebem pedidos. Abra *Inventário → Computadores aguardando aprovação*, confira os nomes e use *Aprovar todos* (os que dizem *substitui* já estavam no inventário). Depois disso, aprove só computadores novos.
- **Dar a permissão `comando_remoto` só a quem precisa:** ela vem desligada em todas as equipes, inclusive nas que já existiam. Quem não tem a permissão não desliga, não reinicia, não instala e não mexe no Radmin. Ligue em *Equipes e permissões* só na equipe que faz esse trabalho.
- **Configurar no `.env`:**
  - `PARCEIRO_LOGINS`: quem pode pedir acesso de Parceiro (lista separada por vírgula). Instalações que vieram da 1.11 mantêm a marcação que já tinham.
  - `EMAIL_DOMINIO`: domínio do e-mail da empresa, usado na Solicitação de Acesso e no teste de e-mail.
  - `CONTATO_TI`: telefone, ramal ou WhatsApp da TI, mostrado no "Esqueci a senha".
  - `ENCARREGADO_NOME` e `ENCARREGADO_CONTATO`: o encarregado LGPD, mostrado no Aviso de Privacidade.
  - Confira também `EMPRESA_NOME` e `EMAIL_ACESSOS`.
