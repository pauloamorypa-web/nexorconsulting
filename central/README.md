# Nexor Central

O centro de controle da Nexor. Tudo sobre os clientes num só painel, só para a equipe Nexor:

- **Clientes e contratos:** plano, mensalidade, vencimento e a régua de cobrança de cada um.
- **Faturas:** as mensalidades são geradas sozinhas. A cobrança pode ser automática pelo Asaas (Pix, boleto ou cartão no mesmo link) ou manual, com o botão "Recebida".
- **Bloqueio e desbloqueio automáticos:** com fatura em atraso, o sistema do cliente passa por **aviso → somente leitura → suspenso**. Quando o pagamento é confirmado, ele volta sozinho em até 5 minutos.
- **Sistemas instalados:** mostra, para cada instalação, se está no ar, a versão, o último contato, o último backup e o tamanho do banco. Alertas aparecem na visão geral.
- **Suporte Nexor:** um clique abre o sistema do cliente como administrador "Suporte Nexor", sem senha e por link assinado de uso único. Lá dentro existe a aba **Nexor · desenvolvedor**, onde você esconde do cliente os módulos, abas e campos que não devem ser alterados.
- **Equipe e segurança:** todos entram com senha e **2FA obrigatório**, num aplicativo autenticador. Há três perfis: Dono, Financeiro e Suporte. A auditoria registra tudo.

## Como funciona

```
          Nexor Central (servidor da Nexor)
          clientes · faturas · régua · equipe · auditoria
                 ▲                          │
   a cada 5 min: │ saúde (só contagens)     │ licença assinada (Ed25519):
   versão,       │                          │ ativo · aviso · restrito · bloqueado
   backup        │                          ▼
   ┌──────────────────────────────────────────────┐
   │ Nexor RH do cliente (servidor do cliente     │
   │ ou Nuvem Nexor): aplica a situação           │
   └──────────────────────────────────────────────┘
```

- **O sistema do cliente é que chama a Central.** Não é preciso abrir porta no cliente, e funciona atrás de qualquer roteador.
- **A licença é assinada.** O sistema confere a assinatura com a chave pública, então ninguém consegue forjar um "ativo".
- **Sem internet, o cliente não é bloqueado.** A última licença vale por 15 dias. Depois disso o sistema fica só em **somente leitura**, nunca suspenso, e volta sozinho quando a conexão voltar.
- **Nenhum dado pessoal sai da instalação.** A Central recebe só números: quantidade de colaboradores, de usuários e de marcações do dia, tamanho do banco e data do último backup.

### O que cada situação faz no sistema do cliente

| Situação | Quando (padrão) | Painel do RH | Ponto (app e quiosque) | Arquivos legais (AFD, AEJ, espelho) |
|---|---|---|---|---|
| **Em dia** | sem atraso | normal | normal | sim |
| **Aviso** | 1 dia de atraso | normal, com faixa amarela e link de pagamento | normal | sim |
| **Somente leitura** | 10 dias | consulta e relatórios; não salva alterações | normal | sim |
| **Suspenso** | 20 dias, bloqueio manual ou contrato encerrado | tela "Sistema suspenso" com link de pagamento e contato | **continua**, se "manter ponto" estiver ligado (padrão) | sim |

**Por que o ponto continua por padrão:**
- O registro de jornada é obrigação do empregador, pela Portaria 671 e pela CLT.
- Se o ponto parar, o trabalhador fica sem registro, e a empresa e a Nexor ficam expostas a ações trabalhistas.
- Os arquivos legais continuam disponíveis para a fiscalização.

Você pode desligar "manter ponto" por cliente, mas faça isso só com cláusula no contrato.

Prazos, aviso e ponto podem ser ajustados por cliente. Há ainda duas ações manuais:
- **"Liberar até…"**: para promessa de pagamento. O sistema fica liberado até a data, mesmo com atraso.
- **"Bloquear agora"**: o motivo aparece para o cliente.

O **Suporte Nexor nunca é bloqueado**.

## Instalar no servidor da Nexor

1. **Domínio e túnel na Cloudflare.**
   1. Abra Zero Trust → Networks → Tunnels → Create a tunnel.
   2. Em Public Hostname, ligue `central.nexorconsultingit.com.br` a `http://central:8800`.
   3. Copie o token do túnel.
2. **No servidor:**
   ```bash
   cd /opt/nexor/central
   cp .env.exemplo .env
   nano .env                      # PUBLIC_URL, MASTER_KEY (openssl rand -base64 48), TUNNEL_TOKEN, SUPPORT_WHATSAPP
   docker compose up -d --build
   docker compose exec central cat /dados/codigo-instalacao.txt
   ```
3. **Primeiro acesso.**
   1. Abra `https://central.nexorconsultingit.com.br`.
   2. Crie a conta do **Dono** usando o código de instalação.
   3. Escaneie o QR com o Google Authenticator ou o Microsoft Authenticator.
4. **Guarde no cofre:**
   - a `MASTER_KEY`;
   - o arquivo da chave que assina as licenças, que está no volume (`/dados/chave-licenca.pem`). O backup diário já copia esse arquivo para `./backups`.
   - **Se perder a chave, todas as instalações dos clientes precisam receber uma chave pública nova.**

> **Render:** não é recomendado. A Central precisa de disco persistente (banco e chave), e no Render isso exige plano pago com disco. O servidor da Nexor com Docker e túnel sai mais barato e é mais simples.

## Ligar o sistema de um cliente à Central

1. Na Central, vá em **Clientes → Novo cliente** e preencha o contrato e a régua.
2. No cliente, clique em **Novo sistema** e informe o produto Nexor RH e o endereço (ex.: `https://rh.paodourado.com.br`).
3. A Central mostra **4 linhas**. Cole as 4 no `.env` da instalação do cliente (em `implantacao/.env` ou `clientes/<empresa>/.env`):
   ```
   NEXOR_CENTRAL_URL=https://central.nexorconsultingit.com.br
   NEXOR_INSTANCIA=…
   NEXOR_TOKEN=nxs_…
   NEXOR_CHAVE_PUBLICA=MCow…
   ```
4. Aplique a mudança na instalação do cliente com `sudo ./atualizar.sh`, ou `./empresa.sh <empresa> up -d` na Nuvem Nexor. Em até 5 minutos o sistema aparece **no ar** na Central.

O token só é mostrado uma vez. Não mande por WhatsApp nem por e-mail: cole direto no servidor. Se ele vazar, use **Nova credencial**.

## Cobrança automática (Asaas)

1. Crie a conta no Asaas, que é empresa brasileira e cobra só por cobrança paga. Gere a **Chave de API** e coloque em `ASAAS_API_KEY`.
2. Configure o webhook no Asaas (Integrações → Webhooks):
   - URL: `https://central.nexorconsultingit.com.br/api/webhooks/asaas`;
   - Token: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`;
   - Eventos de cobrança: Pagamento recebido, Confirmado, Estornado e Removido.
3. A partir daí funciona sozinho:
   1. Cada mensalidade gerada vira uma cobrança no Asaas, e o link fica na fatura e na faixa de aviso do cliente.
   2. O Asaas avisa a Central quando o cliente paga.
   3. O sistema do cliente volta ao normal em até 5 minutos.

Para testar antes, use o sandbox: `ASAAS_URL=https://api-sandbox.asaas.com/v3`.

## Perfis da equipe

| Perfil | Pode |
|---|---|
| **Dono** | tudo, inclusive a equipe e o encerramento de contratos |
| **Financeiro** | clientes, faturas, bloqueio e liberação. Não entra nos sistemas dos clientes |
| **Suporte** | sistemas, credenciais e acesso de suporte aos clientes. Não altera faturas |

## LGPD e contrato

- O acesso de suporte é registrado nos dois lados: na Central, como "Entrou no sistema do cliente", e na **Auditoria do cliente**, como "acesso_suporte_nexor", com o nome de quem entrou. Isso cumpre o que está no contrato e no anexo de tratamento de dados (versão Suporte).
- O bloqueio por falta de pagamento e a régua precisam estar no contrato. A cláusula de suspensão está no documento "Contratos e termos da implantação Nexor". O aviso no sistema, que aparece desde o 1º dia de atraso, serve como notificação prévia.
- **Atenção:**
  - Na instalação no **servidor do cliente**, quem tem acesso ao servidor consegue, tecnicamente, desligar a verificação. A proteção real é o contrato.
  - Na **Nuvem Nexor**, o controle é total.

## Desenvolvimento

```bash
npm install
npm start          # http://localhost:8800 (fora de produção não pede código de instalação)
npm test           # 9 testes: 2FA, régua, licença assinada, webhook, Asaas, perfis
```
