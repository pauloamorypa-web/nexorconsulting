# Relatório do Agente Programador Sênior · Central de Chamados TI v1.11 (agente 1.11) · 2026-11-11
Arquivos lidos: server.js, inventario.js, db.js, email.js, equipes.js, public/app.js (trechos: assumir, filtros, temporizadores, SSE), public/grade.js (leitura rápida), scripts/testar.js (estrutura e casos de assumir/comandos), scripts/backup.js, scripts/backup.sh, scripts/criar-admin.js, README.md, VERSAO.txt, Dockerfile, docker-compose.yml · Tamanho: server.js 1149 linhas, inventario.js 1100, db.js 250, email.js 128, equipes.js 49, app.js 2252 (259 KB), grade.js 186, testar.js 735. Os agentes `.bat` e `.sh` não foram revisados linha a linha.

Como verifiquei: rodei a suíte existente numa cópia em scratchpad (`node scripts/testar.js`: 312 de 312 passam) e reproduzi P-01 e P-03 com o servidor apontando para um DATA_DIR temporário. O código do alvo não foi alterado.

## Achados

### P-01 · Uma URL malformada derruba o servidor inteiro (sem login)
- Gravidade sugerida: crítica
- Onde: server.js:1066 e server.js:1110
- Trecho: `let p = decodeURIComponent(url.pathname);` dentro de `estatico()`, chamado em `if (!url.pathname.startsWith("/api/")) return estatico(req, res, url);`, que fica **fora** do `try` (o `try` só começa na linha 1111) de um handler `async`.
- Por que é um problema: `GET /%E0%A4%A` lança `URIError`, a promessa do handler é rejeitada sem tratamento e o Node 22 encerra o processo. Reproduzido: `/api/saude` respondeu 200, depois a requisição malformada, e então `/api/saude` deu 000; o log mostra `at estatico (server.js:1066)` e `Node.js v22.22.0`. O `restart: unless-stopped` do compose religa o processo, mas um laço de requisições mantém a Central fora do ar, derruba as conexões SSE e as escutas dos agentes (`esperando`) e perde os temporizadores em memória. A suíte testa `/%2e%2e/...` (testar.js:73), que decodifica sem erro, por isso não pega o caso.
- Correção sugerida: colocar `estatico` dentro do `try` e tratar a decodificação: `let p; try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }`. Também registrar `process.on("unhandledRejection", e => console.error(e))` como rede de segurança.

### P-02 · Qualquer técnico pode rodar comandos arbitrários como SYSTEM em todos os computadores, e os arquivos não são cifrados como diz o README
- Gravidade sugerida: crítica
- Onde: inventario.js:323, 712-717, 730-743, 796-807; equipes.js:147; inventario.js:752 e 889
- Trecho: `const exigeGerente = u => exigePerm(u, "inventario_admin");` · `if (t === "cmd") { const linha = txt(p.linha, 1000); return linha ? { t, linha } : null; }` · `const BASE = { ..., inventario: true, inventario_admin: true, usuarios: true };` · `fs.writeFileSync(path.join(dir, nome), body);`
- Por que é um problema: dentro do inventário, a função chamada "exigeGerente" não exige gerente: ela exige `inventario_admin`, que vem ligado por padrão nas equipes Infraestrutura e Sistemas. Com isso, qualquer técnico cria um pacote com passo `cmd` (por exemplo `del /q /s ...`, como no próprio testar.js:540) e implanta com `pc: "todos"`. O agente executa porque o manifesto sai assinado pela Central (linha 819). O mesmo vale para desligar e reiniciar todos (622-645). O README diz "Só o Radmin é instalado nas máquinas (não há opção de instalar outros programas)" e "Os arquivos ficam cifrados no servidor", mas VERSAO.txt anuncia "instalar qualquer programa/comando/BAT" e o código grava o MSI e o `.reg` do Radmin em texto puro em `data/pacotes/`. Uma conta de técnico comprometida vira execução remota em toda a empresa.
- Correção sugerida: criar uma permissão própria (`implantar`, `energia`), desligada por padrão. Exigir `papel === "gerente"` para os passos `cmd`/`exe` e para o alvo "todos". Renomear o helper para `exigeInvAdmin`, para o nome não enganar. Corrigir o README ou cifrar de fato (AES-GCM com chave fora do banco).

### P-03 · O token do agente sai no cadastro público e já vale antes da aprovação: qualquer pessoa da internet escreve no inventário e baixa os pacotes
- Gravidade sugerida: alta
- Onde: server.js:278 e 281; inventario.js:328-331, 337-350, 936-943, 229 e server.js:798
- Trecho: `const agente = INV.tokenUsuario(login); ... return { login, pendente: ..., agente };` · `if (us && us.pendente) return { login: us.login, nome: us.nome, pendente: true };` · `rota("GET", "/api/inventario/pacote-arquivo/:id/:nome", true, ({ req, params, res }) => { autAgente(req); ...`
- Por que é um problema: reproduzi `POST /api/cadastro` sem login, que devolveu `"agente":"u_..."`, e com esse token três `POST /api/inventario/agente` com hostnames inventados criaram três linhas em `inv_pc` (até 4 MB cada, sem limite de quantidade): dá para encher o disco. O mesmo token baixa qualquer arquivo de pacote (`pacote-arquivo`), inclusive o `.reg` de configuração do Radmin, e o script assinado do agente. Computadores cuja chave cai no hostname (`chavePc`, linha 224: `"h:" + d.hostname` quando UUID e série são inválidos) podem ser sequestrados: o envio falso troca `usuario_login` para o pendente (linha 348), o PC some da lista (`pcs()` esconde pendentes, linha 229) e, se a TI recusar o pedido, `DELETE FROM inv_pc WHERE usuario_login=?` (server.js:798) apaga o computador verdadeiro.
- Correção sugerida: para conta pendente, o token só deve permitir `/api/inventario/agente`, com limite de PCs por token (ex.: 2) e por IP. Exigir token geral ou usuário ativo em `pacote-arquivo`, `pacote-manifesto` e `agente-script`. Não reatribuir `usuario_login` de um PC que já pertence a outro usuário ativo.

### P-04 · Resultado e passo de comando aceitos de qualquer agente, sem conferir o computador
- Gravidade sugerida: alta
- Onde: inventario.js:944-953 e 683-690
- Trecho: `autAgente(req); const c = db.prepare("SELECT c.*, p.hostname FROM inv_comando c JOIN inv_pc p ON p.id=c.pc_id WHERE c.id=?").get(+body.id); if (!c || c.status !== "enviado") return { ok: false }; ... UPDATE inv_comando SET status=?`
- Por que é um problema: o `id` é sequencial e o servidor não confere se o comando é do PC de quem envia. Qualquer portador de token (inclusive o de P-03) marca como "feito" a desinstalação de um programa proibido em outra máquina. O alerta continua, mas o histórico e a auditoria (linha 950, gravada em nome de `c.por`, ou seja, do gerente) registram um sucesso falso. `comando-passo` ainda renova `enviado_em` de qualquer comando, o que impede a reentrega.
- Correção sugerida: o agente manda uuid, série e hostname (como já faz em `/comandos`). O servidor resolve o `pc_id` e usa `WHERE id=? AND pc_id=? AND status='enviado'`. Melhor ainda: um segredo por PC, emitido no primeiro inventário.

### P-05 · A fila de comandos não expira e reentrega comandos que não podem rodar duas vezes (desligar, reiniciar, instalar)
- Gravidade sugerida: alta
- Onde: inventario.js:653-656, 636-638, 613-619
- Trecho: `SELECT * FROM inv_comando WHERE pc_id=? AND (status='pendente' OR (status='enviado' AND enviado_em<?)) ... .all(pcId, agora - 20 * 60e3)`
- Por que é um problema: (1) um "Desligar em 60 s" mandado na sexta para um PC já desligado fica `pendente` para sempre e desliga a máquina quando o funcionário a liga na segunda; a tela até conta esses casos como `offline++` (linha 638). (2) Se o agente reinicia ou desliga antes de mandar o resultado, o comando fica `enviado`, volta 20 minutos depois e é executado de novo. Com "reiniciar", isso pode virar um ciclo de reinícios. (3) Cancelar um comando `enviado` (linha 617) marca `cancelado` enquanto o agente já executa, e o resultado real é descartado depois (`c.status !== "enviado"`, linha 947). Não há contador de tentativas nem prazo de validade.
- Correção sugerida: colunas `expira_em` e `tentativas`. Energia expira em ~10 min e nunca é reentregue (`WHERE tipo NOT IN ('desligar','reiniciar')` na reentrega). Instalar e desinstalar no máximo 3 tentativas, depois `erro`. Cancelar só o que está `pendente`, e para `enviado` mostrar "em execução, não dá mais para cancelar".

### P-06 · "Assumir" toma o chamado de outro técnico sem aviso
- Gravidade sugerida: alta
- Onde: server.js:534-537; public/app.js:1057 e 1106
- Trecho: `if (body.seLivre && t.tecnico && t.tecnico !== u.login) throw new Erro(409, ...); set(t.id, { tecnico: u.login, ... })` · app.js:1057 `${t.tecnico !== me.login && me.papel === "tecnico" || !t.tecnico ? '<button ... id="bassumir">Assumir chamado</button>' : ""}` · app.js:1106 `acao("assumir", null, ...)`, que não manda `seLivre`
- Por que é um problema: a proteção contra dois técnicos assumindo depende de uma bandeira que o cliente escolhe mandar. Só o cartão de aviso manda `seLivre` (app.js:150). Na tela do chamado, o botão aparece para qualquer técnico mesmo com outro dono e sobrescreve o dono em silêncio. Isso ainda contorna a permissão `atribuir` (linha 547), que é justamente a que impede passar o chamado de outra pessoa. Num único processo Node a checagem e o `set` são síncronos, então não há corrida de banco. A falha é de regra de negócio: a trava existe e é opcional. testar.js:272 testa assumir sem `seLivre` só num chamado livre.
- Correção sugerida: no servidor, sempre recusar quando `t.tecnico && t.tecnico !== u.login`, a menos que o usuário tenha `atribuir`. Gravar de forma atômica: `UPDATE chamados SET tecnico=? ... WHERE id=? AND (tecnico IS NULL OR tecnico=?)` e conferir `changes === 1`. Isso também protege se um dia houver mais de uma instância.

### P-07 · O IP do registro de atividades sai de uma variável global e pode ficar errado sob concorrência
- Gravidade sugerida: alta
- Onde: server.js:98-99, 1108, 1122
- Trecho: `let ipAtual = "";` · `function auditar(...) { ... .run(Date.now(), por || null, acao, ..., ipAtual); }` · `ipAtual = ipDe(req);` e depois `const body = ... await lerCorpo(req, limite)`
- Por que é um problema: `ipAtual` é gravado antes do `await` que lê o corpo. Se outra requisição chega enquanto a primeira faz upload, `auditar()` da primeira grava o IP da segunda. O mesmo vale para os `.then` assíncronos (linha 450) e para o `auditar("automatico", ...)` disparado pelo agente. O README vende o registro "com data, hora e IP real" para LGPD e Marco Civil, e uma prova de autoria com IP trocado não serve.
- Correção sugerida: passar o IP explicitamente (`auditar(por, acao, detalhe, ip)`) ou usar `AsyncLocalStorage` por requisição.

### P-08 · O fluxo de status não tem máquina de estados: o técnico fecha sem a confirmação do usuário e cria estados incoerentes
- Gravidade sugerida: média
- Onde: server.js:538-541, 551-553, 542-549, 513
- Trecho: `case "status": if (!ehStaff) negado(); if (!STATUS.includes(valor)) invalido(); set(t.id, { status: valor, resolvido: ... })` · `case "setor": ... set(t.id, { setor: valor, tecnico: null })`
- Por que é um problema: (1) o técnico manda `status: "Fechado"` direto, sem solução registrada e sem a confirmação do usuário que o README promete, e o painel conta isso como resolvido no prazo (linha 854). (2) `status: "Novo"` mantém o técnico, e a fila (linha 475, `tecnico IS NULL`) não o mostra. (3) Transferir de setor ou remover o técnico deixa "Em atendimento" sem técnico. (4) Mensagem do usuário num chamado "Resolvido" não reabre o chamado (só "Aguardando usuário" volta, linha 513), então a resposta "não resolveu" fica perdida no estado Resolvido. Também não existe fechamento automático de "Resolvido" sem confirmação, e a fila acumula.
- Correção sugerida: uma tabela de transições permitidas, por exemplo `{Novo:["Em atendimento"], "Em atendimento":["Aguardando usuário","Resolvido"], "Aguardando usuário":["Em atendimento","Resolvido"], Resolvido:["Fechado","Em atendimento"]}`, com "Fechado" só pelo solicitante ou por um job de auto-fechamento após N dias. Transferir e remover técnico voltam o status para "Novo".

### P-09 · O SLA conta horas corridas sem pausa, e a prioridade recalcula o prazo a partir da abertura
- Gravidade sugerida: média
- Onde: server.js:390, 556, 533; server.js:859; server.js:444 vs 78
- Trecho: `agora + SLA_HORAS[p] * H` · `set(t.id, { prioridade: valor, prazo: t.criado + SLA_HORAS[valor] * H })` · `hoje.setHours(0, 0, 0, 0)` · `toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })`
- Por que é um problema: um chamado Baixa (72 h) aberto na sexta às 17 h vence na segunda às 17 h, contando o fim de semana. Não há horário comercial nem feriados. O tempo em "Aguardando usuário" conta contra a TI e entra em `vencidos` (linha 855). Reabrir mantém o prazo antigo, então o chamado volta já vencido. Subir para Crítica um chamado com 5 h de vida produz um prazo no passado. O "hoje" e os 14 dias do painel usam o fuso do processo: no Docker funciona (`TZ=America/Sao_Paulo` no Dockerfile), mas a instalação sem Docker depende do `.env` e, sem TZ, o dia vira à meia-noite UTC (21 h em Brasília). O e-mail fixa `America/Sao_Paulo` em vez de usar `FUSO`.
- Correção sugerida: uma função `calcularPrazo(inicio, horas, calendario)` com horário comercial configurável. Coluna `pausado_ms`, acumulada ao entrar e sair de "Aguardando usuário". Ao reabrir, novo prazo a partir de agora. Calcular o início do dia com `Intl.DateTimeFormat(..., { timeZone: FUSO })`.

### P-10 · Cada evento faz todos os clientes recarregarem tudo: bootstrap sem paginação, inventário reprocessado e consultas N+1
- Gravidade sugerida: alta
- Onde: server.js:158, 357, 359, 363; inventario.js:267-276, 290; server.js:849, 879; inventario.js:688, 698; public/app.js:2247 e 2237-2241; inventario.js:540, 726, 1033; server.js:950-951
- Trecho: `rows = db.prepare("SELECT * FROM chamados").all()` mais todo o `historico` (linha 165) · técnico: `carregar(u)` chamado **duas vezes** no mesmo bootstrap (357 e 359) · `statusAgente` → `pcsPorUsuario()` → `pcs()` + `JSON.parse(r.dados)` de **todos** os PCs (até 3000 programas cada) a cada bootstrap · `alertas: INV.alertasPainelTV()` → `calcular()` a cada `/api/painel/dados` · `comando-passo`/`agente-log` chamam `notificar()` · `fonte.addEventListener("atualizar", () => { atualizarSePuder(); ... })`
- Por que é um problema: num ano a gerência baixa todos os chamados com todo o histórico em todo bootstrap: a cada 60 s, a cada 10 s no painel e a cada evento SSE. Cada passo de um agente (desinstalação em 10 passos x 200 PCs) dispara `notificar()`, e todos os navegadores e TVs refazem o bootstrap e o painel. Cada painel varre `chamados` inteira, faz o parse de todo o inventário e roda `proibido()`, que recompila uma RegExp por padrão para cada programa (linha 84). Tudo síncrono no laço único do Node: a Central inteira trava enquanto isso roda. Há N+1 em `/api/inventario/programas` (uma consulta por programa encontrado, até 2000), `/api/inventario/pacotes`, `/api/inventario/agentes` e `/api/me/dados`. Faltam índices em `chamados(tecnico)`, `chamados(status)`, `inv_pc(usuario_login)` e `inv_comando(tipo, extra)`, colunas usadas em WHERE.
- Correção sugerida: bootstrap só com chamados abertos e dos últimos 30 dias, histórico carregado ao abrir o chamado (`GET /api/chamados/:id`), e lista paginada. Remover a chamada duplicada de `carregar`. Guardar o resultado de `calcular()` e de `pcsPorUsuario()` em cache, invalidado só quando chega inventário. `notificar()` só para mudanças de chamado; passo de agente vai num evento SSE separado, só para quem está na tela daquele PC. Criar os índices citados.

### P-11 · Uploads de até 71 MB em JSON/base64 e de 96 MB brutos ficam inteiros em memória
- Gravidade sugerida: média
- Onde: server.js:18, 1096-1097, 134; server.js:1081-1087; inventario.js:759 e 896
- Trecho: `const CORPO_MAX = Math.ceil(ANEXO_MAX_MB * ANEXO_MAX_QTD * 1.4 + 1) * 1e6;` (≈ 71 MB) · `ok(JSON.parse(Buffer.concat(partes).toString()))` · `Buffer.from(String(a.dados || ""), "base64")` · `{ raw: true, limite: 96e6 }`
- Por que é um problema: uma mensagem com 5 anexos de 10 MB passa por Buffer, string, objeto JSON e Buffer decodificado (cerca de 3 a 4 vezes 71 MB) e trava o laço durante o `JSON.parse`. Cinco usuários enviando prints grandes ao mesmo tempo bastam para estourar a memória de um container pequeno. O MSI de 96 MB também é acumulado com `Buffer.concat`.
- Correção sugerida: anexos em `multipart` ou `PUT` binário por arquivo, gravados com `pipeline(req, fs.createWriteStream(tmp))` e depois `rename`. Para pacotes, gravar em streaming e calcular o SHA-256 no caminho.

### P-12 · Anexos em disco e banco podem divergir, e o backup não cobre os arquivos
- Gravidade sugerida: média
- Onde: server.js:140-147, 388-395, 506-516; server.js:697-709, 727-728; scripts/backup.js:7-12
- Trecho: `fs.writeFileSync(path.join(ANEXOS_DIR, id), a.buf); db.prepare("INSERT INTO anexos ...")` dentro de `transacao(...)` · `for (const a of anx) { ... try { ... fs.unlinkSync(f); ... } catch {} }` · `backup(db, arq).then(...)`, sem `.catch`
- Por que é um problema: se o 3º arquivo falha (disco cheio) ou o INSERT falha, o ROLLBACK desfaz o banco, mas os arquivos já gravados ficam órfãos para sempre e nada os limpa. Na exclusão, o banco é apagado primeiro e o `unlink` falha em silêncio, o que deixa arquivo sem registro. `writeFileSync` de até 50 MB dentro da transação segura o lock do SQLite e o laço do Node. O backup copia só o `.db`: `data/anexos/`, `data/pacotes/` e `data/.secret` (sem ele, as sessões caem) ficam de fora. A rejeição do `backup()` não é tratada, então o cron registra sucesso falso ou estoura.
- Correção sugerida: gravar os arquivos em `anexos/tmp/` antes da transação, renomear depois do COMMIT e apagar os temporários no `catch`. Uma rotina de reconciliação (arquivo sem linha ou linha sem arquivo) na tela "Espaço". Incluir anexos e pacotes no backup (tar) e `.catch(e => { console.error(e); process.exit(1); })`.

### P-13 · A permissão "Usuários", ligada por padrão para todo técnico, equivale a administrador total, sem a trava do último gerente
- Gravidade sugerida: média
- Onde: equipes.js:147 e 158-163; server.js:563-583, 601-606, 614-618
- Trecho: `if (!["usuario", "tecnico", "gerente"].includes(b.papel))` (o técnico pode criar gerente) · `if ("ativo" in b) { ... db.prepare("UPDATE usuarios SET ativo=? WHERE login=?").run(b.ativo ? 1 : 0, alvo.login);` · `if (b.novaSenha) { ... UPDATE usuarios SET senha_hash=? ...`
- Por que é um problema: qualquer técnico redefine a senha de um gerente (`novaSenha`) e entra como ele, ou cria um gerente novo. O README apresenta isso como escolha do cliente. Mesmo assim, a regra "sempre fica pelo menos um gerente ativo" só existe em `editarUsuario` e `excluirUsuario` (634, 670), e o caminho `ativo` (604) desativa todos os gerentes. `aprovar` (596-599) reativa um usuário desativado sem passar por essa checagem.
- Correção sugerida: proibir que um não gerente altere, redefina ou desative gerentes, ou crie gerentes. Aplicar a trava do último gerente em `ativo`. `aprovar` só quando `alvo.pendente`.

### P-14 · A anonimização deixa o nome nos textos e reescreve o registro de atividades
- Gravidade sugerida: média
- Onde: server.js:972-975; 301, 423, 430, 549
- Trecho: `for (const [t, c] of [... ["auditoria", "por"]]) db.prepare(\`UPDATE ${t} SET ${c}=? WHERE ${c}=?\`)` · títulos `Esqueci a senha: ${u.nome}`, `Solicitação de acesso — ... — ${principal}`, extras `"E-mail p/ cópia": emailSolic`, histórico `atribuiu para ${alvo.nome}`
- Por que é um problema: depois de "anonimizar", o nome continua nos títulos, nos `extras` (e-mail) e nos textos do histórico, então a eliminação prometida não acontece. Ao mesmo tempo, trocar `auditoria.por` pelo código aleatório apaga a autoria de ações que precisam ser guardadas (Marco Civil, 6 meses), que é o oposto do que se quer.
- Correção sugerida: limpar `titulo`, `extras` e menções em `historico.texto` (substituir nome, login, e-mail e WhatsApp). Manter `auditoria` intacta ou fazer o pseudônimo reversível só para a gerência.

### P-15 · Editar categorias tira a marca "interna" do formulário de Solicitação de Acesso
- Gravidade sugerida: baixa
- Onde: server.js:808 e 812; db.js:192-200; public/app.js:685
- Trecho: `...(c.nome === CAT_SENHA ? { interna: true } : {})` · `if (params.chave === "categorias") garantirCatSenha();` (não chama `garantirCatAcesso`)
- Por que é um problema: depois de qualquer gravação em Categorias, "Solicitação de acesso (formulário)" perde `interna` e passa a aparecer na abertura comum (app.js:685 filtra `!c.interna`), sem o formulário e com assuntos "Colaborador · Criação" soltos. Até o próximo reinício, que reaplica o flag, os chamados abertos assim chegam sem os dados obrigatórios.
- Correção sugerida: preservar `interna` de todas as categorias internas (`CAT_SENHA`, `CAT_ACESSO`) e chamar `garantirCatAcesso()` junto.

### P-16 · Mapas em memória que só crescem e limpeza global da proteção contra força bruta
- Gravidade sugerida: baixa
- Onde: server.js:53, 192-194, 224, 285, 322
- Trecho: `setInterval(() => { ... if (v.ate < a && v.n === 0) m.delete(k); }, ...)` · `const derrubadasAvisadas = new Set();` · `cadastrosIp`/`esqueciIp` nunca podados · `tentativas.clear(); tentLogin.delete(alvo.login);`
- Por que é um problema: entradas com `n > 0` (1 a 39 erros por IP, 1 a 9 por login) nunca saem, e o contador de login não zera com o tempo: 9 erros em março mais 1 em outubro bloqueiam por 15 min. `derrubadasAvisadas`, `cadastrosIp` e `esqueciIp` crescem sem limite. Gerar uma senha temporária zera o bloqueio de **todos** os IPs, inclusive o de quem está testando senhas naquele momento.
- Correção sugerida: janela deslizante com expiração (`desde`) também em `tentLogin`. A poda remove `ate < agora && desde < agora - 15 min`. Podar listas vazias de `cadastrosIp`/`esqueciIp`. Trocar `tentativas.clear()` por nada: o bloqueio por login já é removido.

### P-17 · Acoplamento ao cliente (Cliente, Cliente e Traccar) fixo em código, dados e telas
- Gravidade sugerida: média
- Onde: db.js:128, 135, 137-151, 203-210, 212-215; server.js:251, 426, 439, 461, 947; public/app.js:222, 415, 617, 680, 795, 1922, 2077-2081; public/index.html:6; public/painel.html:122 e 131; public/privacidade.html:33 e 40
- Trecho: `{ nome: "Rastreamento de motos", ... categoria: "Rastreamento (Traccar)" }` · `empresas: ["KASA SOLAR", "AGL SOLAR", ..., "CLIENTE"]` · `for (const l of ["gustavo.borges", "maria.felix"]) ... pode_parceiro=1` · `u.login + "@clientepaineis.com.br"` · `"... Central de Chamados de TI da Cliente Equipamentos Ltda (LGPD, art. 18)."` · `schtasks /Delete /TN "Cliente Inventario ao ligar"`
- Por que é um problema: uma busca no projeto (js, html, bat, sh) encontra 52 ocorrências de "cliente", 81 de "cliente" e 18 de "traccar". Um segundo cliente receberia categorias de motos, cidades do Amapá, empresas do grupo, dois logins com privilégio de Parceiro (que, se existirem lá, ganham a permissão sem ninguém pedir), o domínio de e-mail da Cliente no formulário e no teste de SMTP, e o nome da Cliente na exportação LGPD, mesmo com `EMPRESA_NOME` definido no `.env` (a linha 947 não usa a variável). O nome da tarefa agendada e da pasta do agente ("ClienteInventario") também está fixo. Do jeito que está, o sistema não pode ser vendido como produto.
- Correção sugerida: um `config/cliente.json` (ou tabela `config`) com marca, logos, domínio de e-mail, e-mail de acessos, empresas e catálogo inicial de categorias. Mover Traccar e Solicitação de Acesso para "módulos" opcionais. Ler `EMPRESA_NOME` em todos os textos. Apagar o seed de logins nominais. Parametrizar o nome da tarefa e da pasta do agente no gerador do instalador.

### P-18 · Arquivos gigantes, uma função de 770 linhas e código duplicado
- Gravidade sugerida: média
- Onde: inventario.js:320-1090 (todas as rotas dentro de `registrar()`); server.js:1081-1090 vs 1091-1100; server.js:103 vs inventario.js:1079; server.js:245 vs 972; inventario.js:745-759 vs 884-896; server.js:258 e 268 vs 238 e 226-229; server.js:62-65 e inventario.js:29-34
- Trecho: `function lerBruto(req, limite)` e `function lerCorpo(req, limite)` com o mesmo corpo · `const celula = v => {...}` repetida como `const q = v => {...}` · a mesma lista de 6 tabelas em `trocarLogin` e na anonimização · 13 `PRAGMA table_info(...)` repetidos, um por coluna
- Por que é um problema: server.js tem 86 KB em 1149 linhas, e 102 linhas de server.js e inventario.js passam de 300 caracteres (várias rotas inteiras numa linha só, como a 1113 e a 1128), o que torna inviável revisar diff e cobrir com teste. A duplicação já gerou divergência: a lista de tabelas de `trocarLogin` e da anonimização não inclui os campos `por` de `inv_comando` e `inv_pacote`, então um técnico renomeado perde a autoria dos comandos que mandou. `/api/cadastro` refaz à mão as regras de `NOME_OK` e `nomeEmUso`. Há código morto: `precisaAviso`, `ALERTAS`, `PAINEL_PADRAO` e `tokenInv` são exportados e não são usados em server.js; a coluna `urgencia` é sempre 0.
- Correção sugerida: separar `rotas/chamados.js`, `rotas/usuarios.js`, `rotas/limpeza.js`, `inventario/{coleta,comandos,pacotes,radmin}.js`. Um helper `migrarColuna(tabela, def)`. Uma função única `reatribuirUsuario(antigo, novo)` com a lista de tabelas num só lugar. Um único `lerCorpo({ raw })`. Remover os exports mortos.

### P-19 · Os testes existentes não cobrem os casos que quebram
- Gravidade sugerida: informativa
- Onde: scripts/testar.js:73, 234-237, 272, 376-377
- Trecho: `for (const p of ["/../server.js", "/%2e%2e/server.js", ...])` · `{ acao: "assumir", seLivre: true }` · `comando-resultado` só testado com o token geral e o id certo
- Por que é um problema: os 312 testes passam e mesmo assim não pegam P-01 (URL malformada), P-06 (assumir sem `seLivre` num chamado com dono), P-04 (resultado de comando de outro PC), P-05 (expiração e reentrega) nem P-03 (token de pendente). Eles testam o caminho feliz que a interface usa, e por isso dão uma confiança maior do que a cobertura real.
- Correção sugerida: acrescentar esses cinco casos como testes de regressão antes de corrigir.

## Pontos fortes do código
- Sem dependências externas, e o que existe é bem feito: scrypt com sal e `timingSafeEqual` (db.js:21-30), comparação de token e assinatura em tempo constante (server.js:45, 827-832; inventario.js:110-113).
- SQL sempre parametrizado nos valores. As interpolações que existem são de nomes de coluna e tabela tirados de listas fixas do próprio código (server.js:124, 245-246).
- Sessão boa: HMAC, "impressão" da senha para derrubar sessões ao trocar a senha e sessão única com auditoria (server.js:32-52, 67-76).
- Cuidado com detalhes que costumam escapar: proteção contra fórmulas no CSV (server.js:103), `Content-Security-Policy: sandbox` e `attachment` nos anexos (server.js:487-491), `path.basename` e lista de extensões no upload, caminho estático com `normalize` e `startsWith`, IP real só confiando em cabeçalho vindo de proxy local (server.js:109-115).
- Transações onde mais importam (abertura de chamado, mensagem, ações, renomear equipe, exclusão em lotes de 400) e `setInterval(...).unref()` nos temporizadores de manutenção.
- Atualização do agente e manifestos assinados com RSA (inventario.js:819, 1009), e o agente confere o SHA-256.
- Suíte de ponta a ponta com 312 verificações que roda isolada em pasta temporária: uma base boa para acrescentar os testes de regressão de P-19.
