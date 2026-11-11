# Relatório do Agente Testador · Central de Chamados TI v1.11 · 2026-11-11
Suíte: 312 passaram / 0 falharam / ~5,0 s (`node --no-warnings scripts/testar.js`) · Rotas testadas: ~70 (todas as de server.js e inventario.js) · Carga: listagem e abertura 100/500 simultâneas e 100 agentes de inventário, todos < 1 s de p95 (sem erros).

Ambiente de teste: localhost:8842, dados em `.../scratchpad/ti/dados-testador`, processo próprio parado pelo PID (o servidor inclusive caiu sozinho no teste T-01). Nenhum código do alvo foi alterado. O processo de outra sessão (dados-confuso) não foi tocado.

## Achados

### T-01 · URL malformada derruba o servidor inteiro (DoS sem login)
- Gravidade sugerida: crítica
- Onde: `server.js:1066`, função `estatico()` (`let p = decodeURIComponent(url.pathname)`), chamada antes do `try/catch` em `server.js:1110`. Vale para qualquer caminho que não comece com `/api/`.
- Como reproduzir: com o servidor no ar, `curl "http://127.0.0.1:8842/%E0%A4%A"`. A requisição é GET, sem autenticação.
- Esperado × obtido: esperado 400/404 e servidor seguir no ar × obtido `URIError: URI malformed` não capturado, o processo Node encerra e todas as conexões passam a responder `000` (fora do ar). Confirmado: `/api/saude` respondia 200 antes e passou a falhar depois do request.
- Correção sugerida: envolver o `decodeURIComponent` em try/catch (ou usar `url.pathname` sem decodificar e tratar erro) e, como rede de segurança, registrar `process.on("uncaughtException")` + `server.on("clientError")` para não derrubar o processo. Hoje o `try/catch` só cobre o ramo `/api/`; o ramo de arquivos estáticos fica desprotegido.

### T-02 · Corpo JSON `null` em POST gera 500 em vez de 400
- Gravidade sugerida: baixa
- Onde: `server.js:1097` (`lerCorpo` devolve `null` quando o corpo é o literal `null`) combinado com os handlers que leem `body.xxx` sem checar (ex.: `POST /api/chamados`, `server.js:368`).
- Como reproduzir: autenticado, `POST /api/chamados` com corpo bruto `null` (Content-Type application/json). Resposta: `500 {"erro":"Erro interno. Tente novamente."}`.
- Esperado × obtido: esperado 400 "preencha os campos" × obtido 500 (TypeError ao ler propriedade de null). Afeta, em tese, todos os POST/PUT/PATCH que acessam `body` direto.
- Correção sugerida: em `lerCorpo`, normalizar `null`/não-objeto para `{}` (ex.: `const o = JSON.parse(...); ok(o && typeof o === "object" ? o : {})`).

### T-03 · Banco travado: requisição de escrita fica presa ~5 s e devolve 500 opaco
- Gravidade sugerida: média
- Onde: `db.js:11` (`PRAGMA busy_timeout = 5000`); qualquer rota que escreve (ex.: `/api/login`, que faz UPDATE em `usuarios`).
- Como reproduzir: segurar um `BEGIN IMMEDIATE` no arquivo `chamados.db` por outra conexão e chamar `POST /api/login`. A resposta demora ~5.100 ms e retorna `500 "Erro interno. Tente novamente."`. Leituras (WAL) seguem normais (`/api/saude` 200 em 5 ms). Ao liberar o lock, o login volta a 200 em ~60 ms (o servidor se recupera).
- Esperado × obtido: esperado uma mensagem tipo "sistema ocupado, tente novamente" (e, idealmente, prazo menor) × obtido bloqueio de 5 s por requisição e 500 genérico. Sob contenção real, 5 s por escrita pode esgotar conexões.
- Correção sugerida: detectar `SQLITE_BUSY`/`SQLITE_LOCKED` e responder 503 com mensagem amigável; avaliar `busy_timeout` menor com retry curto.

## O que resistiu bem (sem achado)
- SMTP fora (host/porta fechados): `POST /api/solicitacao-acesso/testar-email` devolve `502 "O servidor de e-mail recusou: ECONNREFUSED"` em ~9 ms, servidor segue no ar. Com SMTP desligado, o chamado abre normalmente e a cópia por e-mail fica desligada (envio é assíncrono, não bloqueia a abertura).
- Anexo grande: arquivo > 10 MB → `400` com mensagem clara; extensão proibida (.exe) → `400`; corpo acima do limite global (~80 MB) → `413 "Conteúdo muito grande"`. Servidor segue no ar.
- Carga (sem erros, p95 bem abaixo de 2 s): bootstrap x100 p95 146 ms / x500 p95 565 ms; abrir chamado x100 p95 172 ms / x500 p95 652 ms; 100 agentes de inventário p95 115 ms.
- Autenticação: todas as rotas protegidas responderam 401 sem cookie; entradas inválidas em geral retornaram 400/404/405 (exceto T-01 e T-02).

## Fluxos de ponta a ponta verificados (todos OK)
- Autocadastro (`/api/cadastro`) com aprovação (`PATCH /api/usuarios/:login {aprovar}`) → login do novo usuário.
- Abrir chamado com anexo (`POST /api/chamados` com base64) e baixar o anexo (`GET /api/anexos/:id`).
- Triagem completa: assumir → pedir informação (status "Aguardando usuário") → usuário responde (volta para "Em atendimento") → solucionar (status "Resolvido") → solicitante confirma/fecha (status "Fechado").
- Transferir por setor e atribuir técnico (respeitando permissões da equipe).
- Esqueci a senha (`POST /api/esqueci`) → abre chamado em Sistemas → técnico com permissão gera senha temporária (`/api/chamados/:id/redefinir-senha`) → login com a senha temporária.
- Painel (`/api/painel/dados`), exportação CSV de chamados (`/api/relatorio.csv`) e de inventário (`/api/inventario.csv`).
- Painel TV: criar link (`POST /api/painel/compartilhar`), acesso por token válido (200) e token inválido (403).
- Inventário: registro do agente (token geral e token errado → 403), listar, enviar comando desinstalar, agente puxa o comando, confirma resultado (status "feito"), estado/manutenção do Radmin e energia (reiniciar).

## Sem teste automatizado (priorizado)
1. Tratamento de URL malformada em caminhos estáticos (causa do T-01) — nenhum teste cobre `decodeURIComponent` falhando; a suíte testa apenas path traversal (`/../server.js`), que retorna 404 corretamente.
2. Robustez de corpo malformado/`null`/tipos errados nos POST/PUT (T-02) — a suíte valida campos ausentes, mas não corpo `null` ou não-objeto.
3. Resiliência a banco travado / `SQLITE_BUSY` (T-03) — sem teste; não há cenário de concorrência de escrita.
4. Carga e concorrência — a suíte é toda sequencial; não há teste de 100/500 requisições simultâneas nem de muitos agentes reportando ao mesmo tempo.
5. Falhas externas: SMTP indisponível (timeout/recusa) e envio assíncrono da cópia de `solicitacao-acesso` não têm teste automatizado (a suíte não configura SMTP).
6. Comportamento sob disco cheio na gravação de anexos/pacotes (`fs.writeFileSync` em `gravarAnexos`, Radmin, pacotes) — não testado (ambiente não permitiu encher o disco com segurança).
7. SSE (`/api/eventos`) e o fluxo de longa-espera do agente (`/api/inventario/comandos` com `espera`) — a suíte toca o básico; faltam testes de muitos clientes SSE simultâneos e de queda de conexão.
