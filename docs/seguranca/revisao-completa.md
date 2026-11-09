# Revisão de segurança completa (novembro de 2026)

Revisão feita lendo o código de todo o monorepo (`rh`, `atende`, `barber`, `contabil`, `central`, `agent`, `nexor-agente`, app `rh/mobile`), com testes executados para confirmar cada item. Ela substitui as conclusões "provável" e "a verificar" da revisão anterior, que tinha sido feita sobre o índice do Graphify. Esse índice não cobre o repositório inteiro.

Este PR **não altera o código dos produtos**: só adiciona CI (`.github/`), testes (`*/test/isolamento*.js`) e este relatório. Outras sessões estão mexendo nos mesmos produtos (limite de login, LGPD, site/agent), então as correções sugeridas abaixo ficam para PRs separados.

Gravidade: **Alta** (dá para explorar sem credencial especial e o impacto é grande), **Média** (exige uma condição ou credencial parcial, ou o impacto é limitado), **Baixa** (endurecimento, inconsistência ou vazamento menor).

---

## 1. Resumo

| # | Item | Gravidade | Situação |
|---|------|-----------|----------|
| R-NA1 | Nexor Agente: `%2e%2e` escapa da lista de caminhos permitidos do conector | **Alta** | Real, confirmado por teste (`todo`) |
| R-C1 | Central: quem tem o código do cliente revincula a instalação e troca o token dela | **Média** | Real (leitura do código) |
| R-C2 | Central: o backup copia a chave privada que assina licenças **e** links de suporte | **Média** | Real (M7, ver item 2.4) |
| A5 | Licença e bloqueio assinados com Ed25519 e conferidos | — | Confirmado como seguro, com 3 ressalvas (Baixa) |
| R-A1 | Atende: qualquer atendente exporta a base inteira de contatos | **Média** | Real |
| R-AG1 | Blue (agent): IP do visitante vem de cabeçalho que o visitante controla | **Média** | Real se o Render for acessado sem passar pela Cloudflare |
| M3 | `%` inválido na URL ou no cookie vira 500 com stack no log; o processo não cai | Baixa | Real em rh, barber, contabil e central; o atende já trata |
| R-B1 | Exclusões com ID de outra empresa respondem 200 `{ok:false}` em vez de 404 | Baixa | Real, sem vazamento (teste `todo`) |
| R-B2 | RH: `GET /api/comunicados/:id/leituras` não confere se o comunicado existe | Baixa | Real, sem vazamento (teste `todo`) |
| R-B3 | RH: exclusões de local, departamento, cargo e jornada consultam colaboradores sem filtrar pela empresa | Baixa | Real (oráculo de existência) |
| R-L1 | Segredos e dados pessoais em log | Baixa | Real (agent, atende) |
| R-S1 | Cookie `Secure` depende de `NODE_ENV=production` | Baixa | Real (endurecimento) |
| M1 | `linkHttp` aceita `javascript:` | — | **Descartado** |
| — | IDOR entre empresas, SQL montado com texto, `innerHTML` com dado do usuário, path traversal | — | **Nada encontrado** (testes de isolamento passam) |

---

## 2. Itens da revisão anterior

### 2.1 A5: a resposta da Central que bloqueia ou libera o produto é assinada e verificada?

**Sim, é assinada e verificada.** A Central assina a licença com Ed25519 (`central/src/seguranca.js:137-140`). Cada produto confere a assinatura com a chave pública (`rh/src/nexor/central.js:20-30`, linha 25 é o `verify`). O mesmo arquivo existe, idêntico, em atende, barber, contabil e nexor-agente. A licença também precisa ter `tipo === "licenca"` e `inst` igual à instância (`rh/src/nexor/central.js:108` e `:163`). Uma licença com assinatura inválida não é gravada e a anterior continua valendo.

As situações 423 (bloqueado ou somente leitura) e 402 (limite do teste grátis) saem dessa licença conferida (`rh/src/servidor.js:207-211`, igual nos outros produtos). A pausa da IA usa a mesma licença (`atende/src/nexor/politica.js:56`, `nexor-agente/src/servidor.js:108-112`).

**Se a Central ficar fora do ar:** vale a última licença até `valido_ate` (15 dias, `LICENSE_DAYS`). Depois disso o sistema fica **restrito**, ou seja, somente leitura, e o app de ponto continua funcionando. Ele nunca fica bloqueado só por falta de contato, a menos que a última licença recebida já dissesse "bloqueado" (`rh/src/nexor/central.js:118-121`). Quando a Central volta, o sistema se normaliza no próximo contato, que acontece a cada 5 minutos.

Ressalvas (Baixa):
- **Sem licença válida guardada, o sistema fica ativo.** Com o sistema vinculado mas sem token válido no arquivo, a situação volta a "ativo" (`rh/src/nexor/central.js:116`, origem `aguardando`). Quem tem acesso ao disco do servidor e apaga o campo `token` de `DATA_DIR/nexor-licenca.json` sai do bloqueio até o próximo contato bem-sucedido. Isso é inerente à instalação no cliente. *Correção sugerida:* depois do primeiro contato (`recebida_em` gravado), tratar "sem licença" como `restrito`.
- **A vinculação aceita `http://`** (`rh/src/nexor/central.js:129`). A chave pública chega na resposta da vinculação (confiança no primeiro uso). Com uma Central configurada em http, quem estiver no meio da rede troca a chave e passa a assinar licenças e links de suporte. *Correção:* exigir `https://` em produção.
- **Licença antiga reaproveitada:** `sincronizar()` aceita qualquer licença válida da instância, sem conferir se `emitida` é mais nova que a guardada. Na prática exige a chave privada ou a resposta da própria Central, então o risco é baixo. *Correção:* recusar licença com `emitida` menor que a guardada.

### 2.2 M1: `linkHttp` recusa `javascript:` e outros esquemas?

**Descartado.** Em `rh/src/http/validacao.js:22-28`, qualquer valor com esquema que não seja `http`/`https` é recusado. Valores sem esquema ganham `https://`. Testei `javascript:alert(1)`, `JavaScript:`, `data:text/html,...`, `vbscript:`, `java\tscript:`, espaço antes do esquema e aspas com atributo: todos foram recusados. Além disso, a tela só monta o link se ele começar com `http(s)://` (`rh/public/js/views/recrutamento.js:127` e `:130`), com `rel="noopener"`.

### 2.3 M3: `decodeURIComponent` com `%` inválido vira 500 ou derruba o processo?

**Vira 500 e não derruba o processo.** Testado em cada servidor com `/%E0%A4%A`, com uma rota `/api/x/%E0%A4%A` e com o cookie `x=%E0%A4%A`:

| Produto | Arquivo estático | Parâmetro de rota | Cookie | `/health` depois |
|---|---|---|---|---|
| rh | 500 | 500 | 500 | 200 |
| atende | 404 | 404 | 401 | 200 |
| barber | 404 | 500 | 500 | 200 |
| contabil | 404 | 500 | 500 | 200 |
| central | 500 | 500 | 500 | 200 |

Onde acontece: `rh/src/servidor.js:139`, `rh/src/http/roteador.js:35` e `:73` (a mesma coisa em `barber/` e `contabil/`), `central/src/servidor.js:63`, `:658` e `:696`. O `try/catch` do servidor (`rh/src/servidor.js:269-273`) segura o erro, mas grava o stack inteiro no log a cada requisição. Um cookie malformado de outro sistema no mesmo domínio derruba todas as chamadas da API para aquele navegador.

*Correção sugerida:* copiar o tratamento do atende (`atende/src/http/roteador.js`): `try/catch` no cookie, que é ignorado, e no parâmetro, que vira 404. No arquivo estático, responder 400.

### 2.4 M7: o backup copia o arquivo `.chave` junto com o banco?

**Nos produtos, não. Na Central, sim, com outra chave.**
- `rh`, `barber` e `contabil` (`scripts/backup.js`) copiam só o banco (`VACUUM INTO`) e a pasta `arquivos/`, que já está cifrada (`rh/scripts/backup.js:35`, `:49`). O `.chave` (`rh/src/seguranca.js:53`) só existe sem `MASTER_KEY`, e produção exige `MASTER_KEY` (`rh/src/seguranca.js:51`). Ressalva: o destino padrão é `DATA_DIR/backups`, no mesmo disco dos dados. Recomendo `BACKUP_DIR` em outro volume.
- **R-C2 (Média), `central/scripts/backup.js:29`:** copia `chave-licenca.pem` em texto puro para cada pasta de backup. Essa chave Ed25519 assina as licenças **e os links de acesso de suporte** (`central/src/servidor.js:535`). Quem tem um backup consegue gerar links `/api/nexor/entrar?t=…` e entrar como administrador ("Suporte Nexor") no RH, Atende, Contábil e Barber de **todos** os clientes, além de liberar licenças.
  - *Como explorar:* ler o backup, assinar `{tipo:"acesso", inst:<id do sistema>, exp:agora+60s, nonce}` e abrir `https://<sistema>/api/nexor/entrar?t=…`.
  - *Correção:* guardar a chave em `LICENSE_PRIVATE_KEY` (cofre do provedor), fora do disco e do backup. Se for preciso copiá-la, cifrar com uma senha que não fica no servidor. Também vale usar chaves diferentes para licença e para acesso de suporte.

### 2.5 Cookies de sessão

| Produto | Cookie | HttpOnly | Secure | SameSite | Validade | Logout invalida no servidor |
|---|---|---|---|---|---|---|
| rh painel | `nx_rh` | sim | só com `NODE_ENV=production` | Lax | 14 dias fixos (`SESSION_DAYS`) | sim, `rh/src/http/api.js:155` |
| rh app | `nx_app` ou Bearer | sim | idem | Lax | 90 dias, renovada a cada uso (`rh/src/http/api.js:84`) | sim, `rh/src/http/rotas-app.js:58` |
| rh Suporte Nexor | `nx_rh` | sim | idem | Lax | 8 horas (`rh/src/http/rotas-nexor.js:34`) | sim |
| atende | painel | sim | idem | Lax | 14 dias | sim, `atende/src/http/api.js:169` |
| barber | painel / cliente | sim | idem | Lax | 7 dias / 90 dias | sim, `barber/src/http/api.js:110`, `barber/src/http/app.js:96` |
| contabil | painel / portal | sim | idem | Lax | 7 dias / 30 dias | sim, `contabil/src/http/api.js:104`, `contabil/src/http/portal.js:66` |
| central | `nx_central` | sim | idem | **Strict** | 12 horas, e só vale depois do 2FA | sim, `central/src/servidor.js:295` |

O token guardado no banco é só o SHA-256, nunca o valor do cookie (`rh/src/http/api.js:61`). Trocar a senha derruba as outras sessões (`rh/src/http/api.js:184`). Desligar um colaborador apaga as sessões dele (`rh/src/http/rotas-folha.js:230`). Requisições que alteram dados exigem o cabeçalho `x-nexor: 1` (CSRF; `rh/src/servidor.js:190`).

**R-S1 (Baixa):** o atributo `Secure` só entra com `cfg.producao` (`rh/src/http/api.js:51`). Uma instalação sem `NODE_ENV=production` atrás de HTTPS envia o cookie sem `Secure`. *Correção:* incluir `Secure` sempre que `PUBLIC_URL` começar com `https://`, ou usar o prefixo `__Host-`.

### 2.6 Convites e QR do app de ponto: uso único e validade

- **Convite do app (código de 6 dígitos):** vale 7 dias (`rh/src/http/rotas-cadastros.js:285`). É **de uso único**: a ativação apaga os convites do colaborador (`rh/src/http/rotas-app.js:48`). Gerar um convite novo invalida o anterior (`rh/src/http/rotas-cadastros.js:284`). A tentativa é limitada a 6 por CPF a cada 15 minutos e 15 por dia (`rh/src/http/rotas-app.js:42-44`). O hash amarra o código ao colaborador (`sha256(id:codigo)`).
- **QR rotativo do quiosque:** **não é de uso único**. É um HMAC do local por janela de 30 segundos (`QR_SECONDS`), e a janela anterior também é aceita, então o QR vale até cerca de 60 segundos (`rh/src/ponto/presenca.js:13-25`, linha 18). Uma foto do QR repassada a um colega dentro desse prazo funciona, a não ser que o local tenha coordenadas: aí o celular também precisa estar dentro da cerca de GPS (`rh/src/http/rotas-app.js:212-216`). Isso é coerente com o objetivo (prova de presença, não autenticação). Hoje a autenticação é a sessão do app mais a biometria, quando exigida.
  - *Sugestão (Baixa):* guardar o par (colaborador, janela) já usado para recusar duas marcações seguidas com o mesmo QR, e deixar `qr_exige_gps` sempre ligado quando o local tiver coordenadas.
- **Link do quiosque** (`#id.token`): vale até ser gerado de novo ou apagado no painel. Fica guardado só o hash (`rh/src/http/rotas-cadastros.js:139-146`).
- **Portal do Contábil** (`/api/portal/convite/:token`) e **vaga relâmpago do Barber** (`/api/app/vaga/:token`): o teste de isolamento confere que um token qualquer não abre nada (404).

### 2.7 Acesso de suporte da Central aos sistemas dos clientes

- **Assinatura verificada:** sim. O link `GET /api/nexor/entrar?t=…` só abre com uma assinatura Ed25519 válida, `tipo: "acesso"`, `inst` desta instalação, prazo vencendo no futuro e no máximo 10 minutos à frente (`rh/src/nexor/central.js:173-182`). A Central gera o link com 120 segundos (`ACCESS_SECONDS`, `central/src/servidor.js:530-538`).
- **Uso único:** sim, pelo `nonce` (`rh/src/nexor/central.js:178-180`), **mas a lista de nonces usados fica só na memória** (`:70`). Reiniciar o servidor dentro do prazo do link permite usá-lo de novo (Baixa). *Correção:* gravar os nonces usados no banco até `exp`.
- **Registrado dos dois lados:** sim. Na Central, `acesso_suporte` com o sistema e o usuário (`central/src/servidor.js:536`). No cliente, `acesso_suporte_nexor` com o e-mail da pessoa e o IP (`rh/src/http/rotas-nexor.js:35`, igual em atende, contabil e barber).
- Ressalvas: o token vai na query string, então pode ficar em logs de proxy (o uso único reduz o risco). A segurança inteira depende da chave privada da Central (ver R-C2).

---

## 3. Outras falhas encontradas

| Item | Gravidade | Arquivo:linha | Como explorar | Correção sugerida |
|---|---|---|---|---|
| **R-NA1** Fuga da lista de caminhos do conector | **Alta** | `nexor-agente/src/conectores.js:84-92` | A lista `caminhos_permitidos` é conferida no texto cru e só depois a `URL` normaliza `%2e%2e`. Com `caminhos_permitidos: ["/clientes"]`, o caminho `/clientes/%2e%2e/admin/usuarios` passa e chama `https://crm/admin/usuarios` com as credenciais do conector. Quem consegue pôr texto na conversa (o próprio dono por engano, ou injeção de prompt vinda de dados lidos de outro sistema) faz leituras livres em qualquer endpoint da API, que por padrão não pedem aprovação. Teste: `nexor-agente/test/isolamento.test.js` (`todo`). | Conferir a lista **depois** de montar a URL, usando `url.pathname` (já normalizado), e recusar `%2e`, `%2f` e `%5c` no caminho. |
| **R-C1** Revinculação pelo código do cliente | **Média** | `central/src/servidor.js:545-568` (troca do token na linha 565) | `POST /api/v1/vincular` é público e só pede o código `NX-XXXX-XXXX`, que circula com o cliente e com o técnico. Se o produto e a URL forem iguais aos de um sistema existente, a Central **troca o token** dessa instância e devolve o novo. A instalação verdadeira passa a receber 401 e, depois de 15 dias, cai em somente leitura. O atacante fica com um token válido daquela instância. | Não reaproveitar uma instância que já fez contato (`ultimo_contato`) sem confirmação no painel. Ou exigir que o pedido venha da própria URL (desafio na URL). Avisar na Central quando um token for trocado por vinculação. |
| **R-A1** Exportação da base de contatos sem papel | **Média** | `atende/src/http/api.js:526` | Qualquer usuário, inclusive o papel `atendente`, baixa todos os contatos da empresa (nome, WhatsApp, e-mail, etiquetas) num CSV. Tem impacto LGPD, porque não segue o mínimo necessário. | `{ papeis: ["dono", "admin"] }` e registro na auditoria. |
| **R-AG1** Limite por IP burlável | **Média** | `agent/src/servidor.js:54-58` | O IP vem de `True-Client-IP`/`CF-Connecting-IP` ou da **primeira** entrada do `X-Forwarded-For`, cabeçalhos que o visitante envia. Chamando `*.onrender.com` direto, sem a Cloudflare, cada requisição com um IP inventado ganha cota nova de chat (custo de IA; o teto global de 600 por hora continua valendo) e de leads falsos. | Confiar nesses cabeçalhos só quando a conexão vem da Cloudflare (lista de IPs ou cabeçalho secreto), ou usar a entrada mais à direita do XFF como os outros produtos (`rh/src/servidor.js:38-43`). |
| **R-B1** 200 sem efeito com ID de outra empresa | Baixa | RH: `rh/src/http/rotas-folha.js:141`, `:151`; `rh/src/http/rotas-cadastros.js:134`, `:147`, `:158`, `:278`; `rh/src/http/rotas-pessoas.js:66`, `:85`, `:136`. Atende: `atende/src/http/api.js:664` | `DELETE` com ID da outra empresa responde 200 `{ok:false}` (ou `{ok:true}` no quiosque), em vez de 404. Nada muda e nada vaza, como o teste confere, mas o contrato fica inconsistente e esconde erros. | Responder 404 quando `remover()` não apagar nada, e conferir o local antes de apagar o quiosque. |
| **R-B2** Leituras de comunicado sem conferir o comunicado | Baixa | `rh/src/http/rotas-pessoas.js:137` | Com qualquer ID, devolve a lista de leitura dos colaboradores da **própria** empresa, sem dados da A. | `repo.obter("comunicados", empresa.id, id) ?? falha(404)`. |
| **R-B3** Oráculo de existência em exclusões | Baixa | `rh/src/http/rotas-cadastros.js:135`, `:160` | A checagem "há colaboradores usando" procura pelo ID **sem** `empresa_id`. A empresa B, com o ID de um local ou departamento da A que esteja em uso, recebe 409 em vez de `ok:false`, e assim descobre se o ID existe e está em uso. Não altera nada. | Incluir `AND empresa_id = ?` na consulta. |
| **R-L1** Segredos e dados pessoais em log | Baixa | `agent/src/servidor.js:72` (nome, telefone e e-mail do lead), `:256` (telefone); `atende/src/servidor.js:250` (token de verificação do webhook na inicialização) | Quem lê os logs do Render vê dados pessoais e o token de verificação. | Mascarar telefone e e-mail no log e não imprimir o token, só a dica de onde ele está. |
| **R-AG2** Token do relatório na URL | Baixa | `agent/src/servidor.js:283` | `?token=` fica em histórico do navegador e em logs de proxy. | Aceitar só `Authorization: Bearer`. |
| **R-S1** `Secure` condicionado ao `NODE_ENV` | Baixa | `rh/src/http/api.js:51` e equivalentes | Ver 2.5. | Ver 2.5. |

### O que foi procurado e não apareceu

- **Rota sem checagem de papel / IDOR por `empresa_id`:** os testes de isolamento percorreram todas as rotas registradas (seção 4) e não acharam vazamento nem alteração entre empresas. Com papéis, a Central recusa (403) o perfil suporte em todas as rotas de dinheiro e de equipe. Fora o R-A1, as rotas sem papel explícito conferem o papel dentro da função (por exemplo, `atende/src/http/api.js:834`).
- **SQL montado com texto:** todas as consultas usam `?`. As partes interpoladas são listas de `?`, nomes de coluna validados contra o esquema (`rh/src/db.js:279-290`) ou trechos fixos.
- **`innerHTML` com dado do usuário:** não há. As telas montam o DOM com `h()`, que usa `createTextNode` (`rh/public/js/ui.js:5-27`, igual nos outros), com CSP `script-src 'self'`. As páginas HTML geradas no servidor escapam o conteúdo (`rh/src/recrutamento/publicacao.js:8`, `rh/src/http/baixar.js:4`).
- **SSRF:** as chamadas de saída vão para hosts fixos (Meta, Asaas, Twilio, Google, Anthropic) ou para a Gupy com `redirect: "error"` (`rh/src/recrutamento/gupy.js:14`). As mídias da Meta vêm de URLs entregues pela própria Graph API, com token. A única chamada guiada por entrada é o conector do Nexor Agente (R-NA1).
- **Path traversal:** os arquivos estáticos normalizam o caminho e conferem o prefixo (`rh/src/servidor.js:142-143`). A mídia do atende exige o formato `uuid/uuid.ext` (`atende/src/servicos/midia.js:32`, `:45`). Os arquivos do RH e do Contábil ficam no banco ou cifrados, com ID gerado pelo sistema.
- **Webhooks:**
  - WhatsApp: assinatura HMAC `X-Hub-Signature-256` com `timingSafeEqual` em agent, nexor-agente, atende, barber e contabil. Evento repetido é ignorado: agent e nexor-agente guardam os IDs vistos na memória (`agent/src/servidor.js:233`), contabil confere o `wamid` no banco (`contabil/src/servicos/nucleo.js:326`) e barber responde no máximo uma vez por dia por número.
  - Asaas: token do cabeçalho conferido. O pagamento repetido não duplica cobrança nem comissão (`barber/src/servicos/nucleo.js:468-469`, `central/src/comercial.js:166-169`).
  - Ressalva (Baixa): nos agentes, a deduplicação fica na memória e se perde num reinício, quando a Meta pode reenviar. Gravar o `id` no disco resolve.

---

## 4. Testes de isolamento (novos)

Um arquivo por produto, rodando junto com `npm test`:

| Produto | Arquivo | O que cobre | Resultado |
|---|---|---|---|
| rh | `rh/test/isolamento.test.js` | 168 rotas: sem sessão → 401. Painel e app da empresa B com IDs de todas as tabelas da A → 403/404, sem vazar nem alterar | suíte do rh: 367 ok, **13 `todo`** (R-B1, R-B2), 0 falhas |
| atende | `atende/test/isolamento.test.js` | 84 rotas, painel da empresa B | suíte do atende: 221 ok, **1 `todo`** (R-B1), 0 falhas |
| barber | `barber/test/isolamento.test.js` | 83 rotas sem sessão. App do cliente B com IDs do cliente A. Cada instalação tem uma única barbearia | suíte do barber: 129 ok |
| contabil | `contabil/test/isolamento.test.js` | 86 rotas sem sessão. Portal da empresa B com IDs da A. Cada instalação tem um único escritório | suíte do contabil: 129 ok |
| central | `central/test/isolamento.test.js` | Todas as rotas sem sessão e com a sessão parada antes do 2FA. Parceiro B × A. Perfil suporte × rotas de dinheiro e de equipe | suíte da central: 91 ok |
| agent | `agent/test/isolamento.test.js` | Cada rota com a sua proteção (relatório, webhook, origem), mais evento repetido | suíte do agent: 40 ok |
| nexor-agente | `nexor-agente/test/isolamento.test.js` | Webhook (assinatura, repetição) e limites do conector | suíte do nexor-agente: 17 ok, **1 `todo`** (R-NA1) |

Como funciona (`test/isolamento-ajuda.js`, igual em rh, atende, barber, contabil e central):
1. **Lista de rotas:** o teste lê as rotas dos fontes (`r.get("/api/…")`, `rota("GET", …)`) e acrescenta as montadas com texto variável, que ficam declaradas em `EXTRAS`. Cada uma é chamada no servidor de verdade. Se o roteador não a reconhecer (404/405 "não encontrado"), o teste falha, então a lista não fica velha sem ninguém ver.
2. **Rotas públicas:** a lista é explícita (`PUBLICAS`), com a proteção de cada uma anotada. Rota pública nova sem entrada nessa lista faz o teste "sem sessão" falhar.
3. **Empresa B com IDs da A:** para cada rota com ID na URL, o teste tenta um ID de cada tabela da A e espera 403 ou 404. Em **todas** as rotas, ele também confere que a resposta não traz marcadores da A (nome, CPF, CNPJ) e que as linhas da A no banco continuam iguais (hash por tabela). O corpo e a consulta levam IDs da A em todos os campos `*_id`.
4. Um 400 (validação recusou o corpo antes de ler o ID) só é aceito se o banco da A não mudou e nada da A voltou na resposta.
5. As falhas reais ficam em `PENDENTES`, como `todo`, com o código do item deste relatório. Quando a correção entrar, basta tirar a linha.

---

## 5. Segurança no CI (`.github/`)

- `.github/dependabot.yml`: npm em `rh`, `atende`, `barber`, `contabil`, `central`, `agent`, `nexor-agente` e `rh/mobile`; Gradle em `rh/mobile/android`; GitHub Actions. Versões maiores ficam fora das atualizações de rotina (só chegam por alerta de segurança). Não há Podfile (CocoaPods): o iOS usa Swift Package Manager, num `Package.swift` gerado pelo Capacitor a partir do npm de `rh/mobile`.
- `.github/workflows/seguranca.yml`, em todo PR, push na `main`, toda segunda-feira e sob demanda:
  - `npm ci`, `npm audit --audit-level=high` e `npm test` em cada produto (matriz);
  - `npm audit --omit=dev --audit-level=high` no app `rh/mobile`;
  - licenças: `.github/scripts/licencas.mjs` lê o `package-lock.json` e falha com GPL, AGPL ou SSPL nas dependências de produção (aceita LGPL e licença dupla com alternativa permitida);
  - segredos: gitleaks no histórico inteiro (`fetch-depth: 0`), com as regras padrão. A configuração `.github/gitleaks.toml` ignora só as pastas `test/` (tokens falsos das fixtures) e os `.env` de exemplo;
  - CodeQL JavaScript/TypeScript com `security-extended`.

### Resultado da execução local (9/11/2026)

| Verificação | Resultado |
|---|---|
| `npm audit --audit-level=high` nos 7 produtos | **0 vulnerabilidades** em todos |
| `npm audit` em `rh/mobile` | 8 **moderadas**, todas em ferramentas de desenvolvimento (`@capacitor/assets` → `@trapezedev/project` → `xcode`). Não bloqueiam (nível alto) e não foram atualizadas, porque a correção é versão maior |
| Licenças (produção) | Nenhuma GPL, AGPL ou SSPL. `node-forge` (rh) é `(BSD-3-Clause OR GPL-2.0)` e passa pela alternativa BSD |
| Segredos | O binário do gitleaks não pôde ser baixado nesta sessão. Em troca, rodei uma varredura por padrões (chaves Anthropic, AWS, GitHub, Slack, Google, Stripe, Asaas, Meta `EAA…`, chaves privadas PEM) em **todo o histórico** do git: **nenhum segredo encontrado**. Só arquivos `.env.exemplo`/`.env.example` são versionados, com valores de exemplo. O gitleaks roda no CI |
| CodeQL | Não roda localmente (precisa do CLI). Roda no CI |
| Testes | Todos os produtos verdes, com os `todo` listados na seção 4 |
