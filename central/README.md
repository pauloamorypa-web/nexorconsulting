# Nexor Central

O centro de controle da Nexor. Tudo sobre os clientes num só painel, só para a equipe Nexor:

- **Clientes e contratos:** plano, mensalidade, vencimento e a régua de cobrança de cada um.
- **Faturas:** as mensalidades são geradas sozinhas. A cobrança pode ser automática pelo Asaas (Pix, boleto ou cartão no mesmo link) ou manual, com o botão "Recebida".
- **Bloqueio e desbloqueio automáticos:** com fatura em atraso, o sistema do cliente passa por **aviso → somente leitura → suspenso**. Quando o pagamento é confirmado, ele volta sozinho em até 5 minutos.
- **Sistemas instalados:** mostra, para cada instalação, se está no ar, a versão, o último contato, o último backup e o tamanho do banco. Alertas aparecem na visão geral.
- **Suporte Nexor:** um clique abre o sistema do cliente como administrador "Suporte Nexor", sem senha e por link assinado de uso único. Lá dentro existe a aba **Nexor · desenvolvedor**, onde você esconde do cliente os módulos, abas e campos que não devem ser alterados.
- **Equipe e segurança:** todos entram com senha e **2FA obrigatório**, num aplicativo autenticador. Há três perfis: Dono, Financeiro e Suporte. A auditoria registra tudo.

- **Comercial:**
  - **Teste grátis de 30 dias** com funções limitadas por produto. No fim do teste, o sistema bloqueia até a contratação.
  - **Contratação pelo catálogo,** que puxa a mensalidade e a implantação do plano escolhido.
  - **Programa de fundadores,** com 40% por 12 meses, 50% na implantação e preço travado por 24 meses.
  - **Vendedores e parceiros** com comissões automáticas: carência de 30 dias e estorno em cancelamento.
  - **Portal do parceiro** (`/parceiro/`), onde o parceiro vê os clientes, as comissões e envia indicações.
  - A tabela fica em [`src/planos.js`](src/planos.js). A explicação para a equipe está em [`comercial/PLANOS-E-PRECOS.md`](../comercial/PLANOS-E-PRECOS.md).

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

### Teste grátis na licença

**O que a licença carrega.** No teste, a licença assinada leva:
- `plano: "teste"` e a data de fim;
- os **limites**: são contagens que o sistema já envia como saúde, como colaboradores, barbeiros e empresas na carteira;
- os **módulos travados**.

**O que cada sistema faz.** Ele recusa (HTTP 402) criar além do limite e abrir um módulo travado, e explica o que o plano libera. No Atende IA, a IA pausa acima das conversas do dia. No Agente, o limite é de ações aprovadas por dia.

**Faixa e fim do teste.** A faixa de aviso mostra os dias que faltam e um link de contratação pelo WhatsApp da Nexor (`SUPPORT_WHATSAPP`). No dia seguinte ao último dia, a Central manda "bloqueado". No RH, o ponto continua funcionando, pela mesma regra do bloqueio.

### O que cada situação faz em cada sistema

**Atende IA e Nexor Agente**

| Situação | Atende IA | Nexor Agente |
|---|---|---|
| **Em dia / Aviso** | normal (no aviso, aparece a faixa com o link de pagamento) | normal |
| **Somente leitura** | painel só para consulta; **a IA continua atendendo** os clientes no WhatsApp | consulta os sistemas, mas **não executa ações aprovadas** |
| **Suspenso** | painel suspenso e **a IA pausa**. As mensagens continuam chegando e ficam guardadas | responde ao dono que está pausado, com o link de pagamento |

- **Suporte Nexor:** funciona no Nexor RH e no Atende IA. O Agente não tem painel, então é configurado pelo `.env` e pelo `conectores.json`.
- **No pacote de implantação:** cada sistema é cadastrado na Central como um "sistema" à parte. O Atende e o Agente usam `ATENDE_NEXOR_*` e `AGENTE_NEXOR_*` no `.env`, e a Central já mostra as linhas com esses nomes.

**Nexor RH**

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

## Instalar no seu servidor

1. **Domínio e túnel na Cloudflare.**
   1. Abra Zero Trust → Networks → Tunnels → Create a tunnel.
   2. Em Public Hostname, ligue `central.nexorconsultingit.com.br` a `http://central:8800`.
   3. Copie o token.

   Se o servidor já tem nginx ou Caddy com HTTPS, pule o túnel: use `SEM_TUNEL=1` e aponte o proxy para `127.0.0.1:8800`.
2. **No servidor**, um comando só:
   ```bash
   sudo apt update && sudo apt install -y git
   sudo git clone https://github.com/pauloamorypa-web/nexorconsulting.git /opt/nexor
   cd /opt/nexor/central
   sudo ./instalar.sh              # ou: sudo SEM_TUNEL=1 ./instalar.sh
   ```
   O instalador:
   - instala o Docker;
   - pergunta o endereço, o token do túnel e o WhatsApp de suporte;
   - gera a `MASTER_KEY`;
   - sobe a Central com backup diário;
   - mostra o **código de instalação**.
3. **Primeiro acesso.**
   1. Abra o endereço e crie a conta do **Dono** com o código de instalação.
   2. Escaneie o QR com o Google Authenticator ou o Microsoft Authenticator.
   3. Na Equipe, crie os usuários Financeiro e Suporte.
4. **Guarde no cofre:**
   - a `MASTER_KEY` do `.env`;
   - a chave das licenças (`/dados/chave-licenca.pem`, já copiada pelo backup diário em `./backups`).

   **Se perder a chave das licenças, todas as instalações dos clientes precisam ser vinculadas de novo.**
5. **Atualizar depois:** `cd /opt/nexor && sudo git pull && cd central && sudo ./instalar.sh`. Os dados ficam no volume e não são apagados.

> **Render:** não é recomendado. A Central precisa de disco persistente, e no Render isso exige plano pago com disco.

## Ligar os sistemas do cliente: código do cliente (vinculação imediata)

Cada cliente cadastrado ganha um **código único**, por exemplo `NX-7K4P-2QM9`. Ele aparece em Clientes → cliente.

O **mesmo código vincula todos os produtos** daquele cliente: Nexor RH, Atende IA, Nexor Agente e Nexor Contábil.

Há três jeitos de usar o código, do mais rápido ao manual:

1. **Na instalação:** o `instalar.sh` do pacote de implantação pergunta o código. Também dá para colocar `NEXOR_CODIGO=NX-…` no `.env`. Cada sistema se vincula sozinho ao subir.
2. **Pelo painel do sistema:** o administrador do cliente, ou o técnico, abre **Configurações → Empresa → Vincular à Nexor** e digita o código. Pode ser em minúsculas e sem hífen.
3. **Manual:** em **Novo sistema**, a Central mostra as 4 linhas `NEXOR_*` para colar no `.env`.

O que acontece ao vincular:
- O sistema aparece **na hora** na tela do cliente, já com licença, monitoramento e o botão de suporte.
- Reinstalar o mesmo produto no mesmo endereço reaproveita o cadastro, então o histórico continua.

Segurança do código:
- Tentativas com código errado ficam na auditoria, e cada IP só pode tentar 10 vezes a cada 15 minutos.
- Se o código vazar, use **Gerar outro**. Os sistemas já vinculados continuam funcionando.
- Clientes com contrato encerrado não vinculam.

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

## Conversão offline (Meta e Google)

Com `CONVERSAO_URL` e `CONVERSAO_TOKEN`, a Central avisa dois marcos de cada cliente:

| Marco | Quando | Valor |
|---|---|---|
| `teste_ativado` | Cliente criado no teste grátis ou "Começar teste" (a prorrogação não conta) | menor mensalidade do produto no catálogo |
| `contrato_fechado` | "Contratar plano" ou, para quem já estava em contrato, o 1º pagamento | mensalidade com desconto + implantação |

- O padrão é a Blue: `CONVERSAO_URL=https://<endereço da Blue>/api/conversao` e `CONVERSAO_TOKEN` igual ao `CONVERSAO_TOKEN` (ou `REPORT_TOKEN`) da Blue. A Blue acha o lead e manda `StartTrial`/`Purchase` ao Meta e a linha com `gclid` ao Google.
- **Fila com novas tentativas** (tabela `conversoes`): se a Blue estiver fora, tenta de novo em 1, 2, 4, 8... minutos (no máximo 6 h); depois de 10 tentativas fica como `falhou`. `GET /api/conversoes` mostra a fila e `POST /api/conversoes/:id/reenviar` volta um evento que falhou.
- **Idempotência:** um evento por cliente e tipo. Prorrogar o teste, pagar outra fatura ou reprocessar não envia de novo; a nova tentativa usa o mesmo `id`, e a Blue descarta a repetição.
- **LGPD:** só saem o e-mail e o telefone do cliente em hash SHA-256, o produto, o plano e os valores. Nome, CNPJ e o id do cliente ficam na Central.

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
npm test           # 2FA, régua, licença assinada, webhook, Asaas, perfis, comercial e conversão offline
```

O código que fala com a Central nos sistemas é o mesmo arquivo em `rh/src/nexor/central.js`, `atende/src/nexor/central.js` e `nexor-agente/src/nexor/central.js`. Altere os três juntos. Os testes de ponta a ponta ficam em `rh/test/nexor.test.js`, `atende/test/nexor.test.js` e `nexor-agente/test/fluxo.test.js`.
