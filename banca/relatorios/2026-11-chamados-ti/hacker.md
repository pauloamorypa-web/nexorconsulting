# Relatório do Agente Hacker · Central de Chamados TI v1.11 · 2026-11-11

Escopo testado: alvo local em `http://127.0.0.1:8841` (código em `.../scratchpad/ti/trabalho`, dados de teste em `.../scratchpad/ti/dados-hacker`). Teste autorizado pelo dono, só em localhost. Cobertura: agente de inventário e acesso remoto (`inventario.js` + `agentes/`), autenticação/sessão (`server.js`), papéis/permissões (`equipes.js`), IDOR de chamados/anexos, uploads, painel compartilhado (TV), CSRF/cabeçalhos/CSP/XSS (`public/app.js`, `grade.js`, `painel.html`), SMTP (`email.js`), instaladores `.sh`/`.bat` e Docker.
Fora do escopo / não exercido a fundo: Radmin real e agentes Windows/mac em máquina real (sem ambiente Windows); SMTP real (sem servidor); varredura de rede; fluxo completo multiusuário de IDOR de anexos entre dois usuários reais (avaliado por código + teste sem sessão). Sem `npm audit` (projeto sem dependências).

## Achados

### H-01 · Técnico comum assume a conta do gerente (escalação de privilégio) — PROVADO
- Gravidade sugerida: crítica
- Onde: `server.js:614-618` (PATCH `/api/usuarios/:login` ramo `novaSenha`) + `equipes.js:19,30-35` (perm `usuarios` em todas as equipes por padrão)
- Como reproduzir: logado como técnico comum (equipe Infraestrutura padrão), `PATCH /api/usuarios/gerente.exemplo {"novaSenha":"takeover9"}` → `{"ok":true}`. Em seguida `POST /api/login {login:"gerente.exemplo",senha:"takeover9"}` → entra. `GET /api/bootstrap` → `gerente.exemplo / gerente`.
- Evidência: o técnico redefiniu a senha do gerente e logou como gerente (papel confirmado). O ramo `novaSenha` não impede alvo com papel `gerente`.
- Impacto: qualquer técnico vira gerente (controle total: inventário, comandos remotos, exclusões, LGPD, equipes). A migração `migrarUsuariosTodos` deu `usuarios` a TODA equipe, então isto vale para todos os técnicos.
- Correção sugerida: bloquear reset/edição de contas `gerente` (e promoção a gerente) salvo quando o ator é gerente; separar "redefinir senha" de "gerenciar gerentes"; não conceder `usuarios` por padrão a toda equipe.

### H-02 · Técnico padrão tem comando remoto total (desligar/reiniciar/instalar) em qualquer máquina — PROVADO
- Gravidade sugerida: alta
- Onde: `equipes.js:19` (`BASE` inclui `inventario_admin`); `inventario.js:323,622` (`exigeGerente = exigePerm(u,"inventario_admin")`)
- Como reproduzir: como técnico comum, `POST /api/inventario/energia {"acao":"desligar","pc":1,"segundos":30}` → `{"ok":true,"qtd":1}`. Também habilita instalar pacotes, BAT, Radmin, trocar token do agente etc.
- Evidência: comando de desligamento enfileirado por técnico sem ser gerência.
- Impacto: parada/instalação em massa nas estações por qualquer técnico; viola menor privilégio. Combinado com H-01, é controle total do parque.
- Correção sugerida: `inventario_admin` desligado por padrão; separar "ver inventário" de "executar comando remoto/desligar/instalar"; exigir confirmação/registro reforçado.

### H-03 · Token do agente é um segredo único compartilhado, sem vínculo com a máquina — PROVADO
- Gravidade sugerida: alta
- Onde: `inventario.js:105-113,325-334,337-351,666-681,936-943,1006-1013`
- Como reproduzir: com o token único (`X-Inventario-Token`, igual em todas as máquinas, gravado em `instalar-inventario.bat` e devolvido por `/api/inventario/agente-script`):
  1. Enviar inventário como qualquer host: `POST /api/inventario/agente {hostname:"CEO-NOTEBOOK",uuid:"AAAA...",...}` → cria/sobrescreve a máquina.
  2. Reenviar com `radmin.rodando=false` / esconder programa proibido → adultera o monitoramento.
  3. Interceptar comandos de outra máquina: `POST /api/inventario/comandos {uuid:"AAAA...",hostname:"CEO-NOTEBOOK"}` devolveu o `reiniciar` e `atualizar-agente` daquela máquina (texto base64, sem assinatura).
  4. Baixar qualquer arquivo de pacote: `GET /api/inventario/pacote-arquivo/<id>/segredo.cmd` → conteúdo do instalador.
- Evidência: inventário falso aceito; polling spoofado retornou os comandos; download do arquivo do pacote com só o token.
- Impacto: quem obtém o token (está em texto em toda estação) pode falsificar/adulterar inventário, espionar e SUPRIMIR comandos (o polling marca `enviado` e a máquina real fica 20 min sem receber), e baixar instaladores internos. Comandos de energia/instalar trafegam SEM assinatura (só pacote/manifesto/agente-script são assinados). Não permite, sozinho, injetar comando numa máquina real (só a gerência enfileira; a execução vem da Central por HTTPS).
- Correção sugerida: token por máquina emitido no registro e vinculado à `chave`; autenticar o polling pela máquina dona; assinar também as linhas de comando; não expor o código-fonte do agente/segredos a qualquer portador do token.

### H-04 · Painel TV (link sem login) expõe hostnames e dados operacionais além do previsto — PROVADO
- Gravidade sugerida: média
- Onde: `server.js:848-890` (`painelDados`/`/api/painel/dados`), `inventario.js:1097-1099` (`alertasPainelTV`), `public/painel.html:218`
- Como reproduzir: gerência cria link; `GET /api/painel/dados?t=<token>` sem cookie retorna `alertas` com `nome` = hostname (ex.: `CEO-NOTEBOOK`), além de `deptos`, `assuntos`, `equipe` (nomes), e `ultimos/atencao/aguardando` com títulos de chamados.
- Evidência: resposta sem login trouxe `{"titulo":"Radmin fechado / parado","nome":"CEO-NOTEBOOK"}` e a estrutura completa do dashboard.
- Impacto: o README promete "só números, títulos e técnicos", mas o link anônimo vaza nomes de máquinas e, via títulos (ex.: "Esqueci a senha: <Nome>", "Solicitação de acesso — … — <Nome>"), nomes de pessoas. Link vazado/colado num Smart TV ou IPTV expõe isso a terceiros.
- Correção sugerida: no modo token, remover hostnames (usar rótulo genérico) e títulos com dado pessoal; enviar só contadores/nível; revisar `alertasPainelTV`.

### H-05 · Senha fraca aceita (mínimo 6, sem complexidade) — PROVADO
- Gravidade sugerida: baixa
- Onde: `server.js:260,336,566,615` (todas exigem só `length >= 6`)
- Como reproduzir: `POST /api/cadastro {... "senha":"123456"}` → criado.
- Evidência: autocadastro aceitou `123456`.
- Impacto: facilita força-bruta/credential stuffing (limite por login é 10 erros/15 min, ajuda mas não resolve senha trivial).
- Correção sugerida: mínimo 8-10, bloquear senhas comuns/sequenciais; alinhar com o instalador (que já exige 8).

### H-06 · Verificação CSRF do servidor só atua quando o cabeçalho Origin existe — PROVADO (baixo risco residual)
- Gravidade sugerida: informativa
- Onde: `server.js:1116-1119`
- Como reproduzir: `POST /api/login` sem `Origin` é processado (HTTP 401 por credencial, não 403); com `Origin: http://evil.example` → 403.
- Evidência: requisição sem Origin não é barrada pela checagem.
- Impacto: residual baixo — o cookie é `SameSite=Lax` (não vai em POST cross-site) e o corpo é JSON (exige preflight CORS), então CSRF prático é mitigado. Fica a observação de defesa única.
- Correção sugerida: exigir Origin/Referer presente e da mesma origem em métodos mutáveis (rejeitar quando ausente), mantendo SameSite.

### H-07 · `/api/inventario/do-usuario/:login` exige só "ser da TI", não permissão de inventário — suspeita de excesso de exposição
- Gravidade sugerida: baixa
- Onde: `inventario.js:437-442` (usa `exigeTI` = qualquer não-usuário)
- Como reproduzir: técnico sem permissão `inventario` ainda lista computadores de um usuário (hostname, SO, IP, disco, RAM). Não reexecutado isoladamente (equipes padrão já têm `inventario`); verificado por código.
- Impacto: leve vazamento de inventário a staff sem a guia de inventário.
- Correção sugerida: trocar por `exigePerm(u,"inventario")`.

## O que resistiu bem
- IDOR de anexos/chamados: `GET /api/anexos/:id` sem sessão → 401; download e ações passam por `podeVer` (nota interna oculta ao usuário). `server.js:480-494,151-155`.
- Path traversal estático e em uploads: `estatico` normaliza e exige prefixo `PUBLIC`; `GET /../server.js` → 404. Anexos salvos com UUID (nome original não vira caminho), `nomeArqSeguro` nos pacotes. `server.js:1065-1077,127-146`.
- Hash de senha forte (scrypt + sal) e comparação com `timingSafeEqual`; login com tempo constante mesmo sem usuário. `db.js:21-30`, `server.js:204`.
- Sessão: cookie HMAC, `HttpOnly`+`SameSite=Lax` (+`Secure` com HTTPS), "impressão" da senha derruba sessões ao trocar senha, um acesso por vez. `server.js:31-52,327-331`.
- CSP razoável (`index.html` sem `unsafe-inline` em script), `X-Frame-Options: DENY`, `nosniff`, HSTS sob HTTPS, CSP `sandbox` nos anexos; front-end escapa saída com `esc()` de forma consistente (app.js/grade.js/painel.html). `server.js:1074,1103-1107,490`.
- Comandos/pacotes/manifesto do agente e atualização do agente são assinados (RSA-SHA256) e o agente valida o SHA-256 dos arquivos. `inventario.js:809-823,923-943,1006-1013`.
- Rate limit de login por rede e por usuário; CSV com proteção anti-fórmula; erros sem stack trace (500 genérico). `server.js:195-209,103,1144-1148`.
- Sem segredos reais versionados: só `.env.example` com placeholders; SMTP usa STARTTLS/SSL com verificação de certificado padrão; instaladores usam `curl|bash` apenas do Docker oficial e chaves de repositório assinadas.
