# Manual de implantação do Nexor Contábil

Este é o passo a passo para colocar o Nexor Contábil em produção num escritório de contabilidade, do servidor até o primeiro mês fechado. Ele segue o mesmo modelo do Nexor RH: o sistema fica no servidor do escritório (ou numa nuvem no nome dele), com dados, chaves e backups separados, ligado à Nexor Central.

> **Tempo estimado:** de meio dia a um dia para instalar e configurar, mais 1 a 2 semanas de acompanhamento, até o escritório fechar o primeiro mês pelo sistema.

---

## 1. O que o escritório recebe (escopo desta versão)

| Módulo | O que faz |
|---|---|
| **Cobrança de documentos** | Lista do que cada cliente precisa mandar todo mês, conforme o regime. A régua cobra sozinha por WhatsApp e e-mail, numa mensagem única com tudo que falta. Painel do que falta por cliente. |
| **Leitura de documentos com IA** | Lê notas, extratos, boletos, recibos e comprovantes (PDF e foto). Confere CNPJ, se o documento é mesmo do cliente e se há duplicidade. Sugere lançamentos, aprende as contas com as correções do contador, concilia extrato com nota e exporta o arquivo de importação. |
| **Obrigações e prazos** | Catálogo de obrigações por regime e condição (funcionários, ICMS, ISS). As tarefas são criadas por cliente e competência, com prazo legal (feriado e dia útil) e prazo interno, responsável e tempo gasto. |
| **Portal do cliente e WhatsApp** | Portal com o nome e a cor do escritório: pendências, envio, guias, histórico e chamados. O WhatsApp do escritório recebe arquivos e guarda no cliente certo, e a IA responde com os dados daquele cliente. |

**Fica para as próximas fases** (não prometa ao cliente nesta versão):
- captura automática de XML na SEFAZ;
- monitor de certidões e de caixas postais (e-CAC);
- simulador da reforma tributária;
- relatórios gerenciais automáticos;
- calculadora de honorários;
- aplicativo nas lojas.

---

## 2. Antes de ir ao escritório (lista de contas e dados)

Peça com antecedência. **Nenhuma senha ou chave deve ser enviada por WhatsApp ou e-mail: elas são digitadas direto no servidor ou no painel.**

| Item | Quem providencia | Para quê |
|---|---|---|
| Servidor (VPS no nome do escritório, servidor próprio ou mini PC com nobreak) | Escritório, com orientação da Nexor | Onde o sistema roda |
| Domínio ou subdomínio, por exemplo `contabil.limacontabilidade.com.br` | Escritório | Endereço do painel e do portal |
| Conta na Cloudflare (gratuita), com o domínio apontado para ela | Escritório ou Nexor | HTTPS sem abrir portas |
| Conta na Anthropic (console.anthropic.com), com cartão do escritório | Escritório | Leitura de documentos e assistente do WhatsApp |
| WhatsApp Business **API oficial** (Meta Business Manager verificado + número dedicado) | Escritório | Cobrança, recebimento de arquivos e respostas |
| Conta no Resend (resend.com), com o domínio verificado | Escritório | E-mails de cobrança e avisos de guia |
| Planilha da carteira: razão social, CNPJ, regime, contato, WhatsApp, e-mail e se tem funcionários | Escritório | Cadastro dos clientes |
| Plano de contas usado nas importações e o leiaute de importação do sistema contábil (Domínio, Alterdata etc.) | Escritório | Exportação dos lançamentos |
| Código do cliente na Nexor Central (`NX-XXXX-XXXX`) | Nexor | Licença, monitoramento e suporte |

**Custos que o escritório paga direto** (deixe isto escrito na proposta):
- IA da Anthropic, por uso. Para referência, uma leitura de documento custa centavos.
- Mensagens pagas da Meta, quando o envio acontece fora da janela de 24 horas.
- Servidor ou nuvem.
- Plano do Resend, se passar da faixa gratuita.

---

## 3. Instalação no servidor

### 3.1 Cenários

| Cenário | Recomendação |
|---|---|
| **VPS no nome do escritório** (Hostinger, Contabo, AWS Lightsail, 2 vCPU / 4 GB / 40 GB) | ✅ Melhor opção: sempre ligado e sem depender da energia do escritório. |
| **Servidor do escritório** (Linux, ou Windows com Hyper-V ou WSL, ligado 24 h e com nobreak) | ✅ Os dados ficam fisicamente no escritório. |
| **Mini PC dedicado** (N100/i3, 16 GB, SSD de 512 GB, nobreak) | ✅ Compra única, sem mensalidade. |
| **Nuvem Nexor** (servidor da Nexor com o ambiente isolado por escritório) | ✅ O mais simples para o escritório. **Muda o papel na LGPD:** a Nexor passa a armazenar os dados (use o Contrato 2 e o anexo de tratamento de dados, versão Armazenamento). |
| **Notebook** | ⚠️ Só como solução temporária, com o Termo de ciência assinado. O portal e o WhatsApp dos clientes param quando o notebook desliga. |

Requisitos: Ubuntu 22.04/24.04 ou Debian 12, Docker (o instalador coloca) e internet comum. O túnel funciona atrás de qualquer roteador.

### 3.2 Túnel e domínio (Cloudflare)

1. Coloque o domínio do escritório na Cloudflare.
2. Abra **Zero Trust → Networks → Tunnels → Create a tunnel**, tipo **Cloudflared**, com o nome do escritório. Copie o **token**.
3. Em **Public Hostname**, ligue `contabil.limacontabilidade.com.br` a **Service** `http://contabil:8793`.

Se o escritório também tiver o Nexor RH, crie um segundo hostname, por exemplo `rh.limacontabilidade.com.br`, ligado a `http://rh:8791`, no mesmo túnel.

### 3.3 Instalar

```bash
sudo apt update && sudo apt install -y git
sudo git clone https://github.com/pauloamorypa-web/nexorconsulting.git /opt/nexor   # repositório privado: use um token de leitura
cd /opt/nexor/implantacao
sudo SISTEMAS="contabil" ./instalar.sh            # escritório com RH também: SISTEMAS="rh contabil"
```

O instalador pergunta:
- o identificador do escritório (por exemplo `lima-contabilidade`);
- o endereço do sistema;
- a chave da Anthropic;
- o token do túnel;
- o **código do cliente na Nexor Central**.

Depois ele:
1. gera a `CONTABIL_MASTER_KEY`;
2. sobe o sistema com backup diário;
3. mostra o **código de instalação**.

**Guarde a `CONTABIL_MASTER_KEY` (arquivo `.env`) no cofre da Nexor e num segundo lugar seguro.** Ela criptografa os documentos dos clientes do escritório e os tokens. Sem ela, nem os backups abrem.

### 3.4 Conferir

- `https://contabil.limacontabilidade.com.br/health` responde `{"ok":true}`.
- Na **Nexor Central**, o sistema aparece no cliente como **no ar**. Ele se vincula sozinho pelo código.
- `docker compose --profile contabil --profile tunel ps` mostra `contabil` e `backup-contabil` rodando.

---

## 4. Primeiro acesso e configuração (com o responsável do escritório)

Siga esta ordem. Cada passo é uma tela em **Configurações**.

1. **Conta do escritório.**
   1. Abra o endereço do sistema e use o código de instalação.
   2. Crie a conta com razão social, CNPJ e os dados do sócio responsável, que fica com o perfil **Dono**.
2. **Escritório.**
   1. Preencha o nome que os clientes vão ver, o CRC e a cor do portal.
   2. Escreva a mensagem de boas-vindas.
   3. Defina a assinatura do assistente do WhatsApp.
3. **Equipe.**
   1. Cadastre cada pessoa com o departamento dela (Fiscal, Contábil, DP, Societário).
   2. Use o perfil **Equipe** para o dia a dia e **Administrador** só para quem configura.
4. **WhatsApp e e-mail.**
   - **WhatsApp:**
     1. Preencha o **ID do número**, o **token permanente** e o **segredo do app**.
     2. No painel da Meta, em Webhooks, cole a **URL do webhook** e o **token de verificação** que aparecem na tela.
     3. Assine o campo `messages`.
   - **Modelos (templates) na Meta**, categoria *Utilidade*, idioma pt_BR. São obrigatórios para cobrar fora da janela de 24 h:
     - `cobranca_documentos`: *"Olá, {{1}}! Aqui é do {{2}}. Para fecharmos o mês, ainda faltam: {{3}}. Envie respondendo esta mensagem ou pelo portal: {{4}}"*
     - `aviso_guia`: *"Olá, {{1}}! O {{2}} disponibilizou: {{3}}. Baixe no portal: {{4}}"*

     Depois de aprovados, coloque os nomes dos modelos na tela.
   - **E-mail:** informe o remetente (com o domínio verificado no Resend) e a chave.
   - Use **Testar envio** com o seu número e o seu e-mail.
5. **Régua de cobrança.** O padrão é:
   - lembrete 2 dias antes do prazo;
   - depois, a cada 3 dias;
   - no máximo 4 vezes;
   - por WhatsApp e e-mail.

   Ajuste com o escritório.
6. **Obrigações.** **Confira o catálogo com o escritório.**
   - Os prazos vêm padrão (federais) e são editáveis.
   - **Ajuste o ISS** ao município e a **EFD ICMS/IPI** ao estado da carteira.
   - Desative o que o escritório não faz.
   - Mudar um prazo recalcula as tarefas em aberto.
7. **Exportação e contas.**
   1. Troque as contas padrão pelas contas (código ou nome) do plano do escritório.
   2. Monte o layout na ordem do leiaute de importação do sistema contábil: separador, formato da data, decimal e colunas.
   3. **Faça uma importação de teste com um cliente** no Domínio, Alterdata ou outro sistema antes de liberar para a carteira.
8. **Vincular à Nexor.** Se o código não foi informado na instalação, use **Configurações → Escritório → Vincular à Nexor**.

---

## 5. Carteira de clientes

1. **Cadastre os clientes** (Clientes → Novo cliente) com:
   - regime;
   - se tem funcionários, se é contribuinte de ICMS e se presta serviços;
   - contato, WhatsApp e e-mail;
   - responsável no escritório.

   Ao salvar, o sistema cria a **lista de documentos esperados** do regime, as **pendências do mês** e as **obrigações**.
2. **Ajuste os documentos esperados** de cada cliente. Por exemplo, um extrato por banco ("Extrato do Sicoob", "Extrato do Itaú") e prazos diferentes.
3. **Portal:**
   1. Em Clientes → cliente → Portal do cliente → **Dar acesso**, informe nome, e-mail e WhatsApp.
   2. Envie o link de convite. Ele vale 7 dias e funciona uma vez, e o cliente cria a própria senha.
   3. **O WhatsApp cadastrado aqui (ou no cliente) é o que liga os arquivos recebidos à empresa certa.**
4. **Comece com 3 a 5 clientes piloto** por uma semana. Depois libere a carteira.

> Número de WhatsApp usado por mais de uma empresa (o dono de duas empresas, por exemplo): os arquivos caem em **Documentos → Sem cliente**, e a equipe escolhe a empresa. Quando o cliente é escolhido, a IA lê na hora.

---

## 6. Treinamento (2 encontros de 1 h)

**Encontro 1, com a equipe:**
- **Documentos:** caixa de entrada, conferência e alertas (CNPJ, duplicidade, documento de outra empresa), correção de contas (o sistema aprende), Conferido e Rejeitado (a pendência volta para a cobrança).
- **Lançamentos:** exportar por cliente e competência. Só os documentos conferidos entram.
- **Obrigações:** filtros por departamento e "só as minhas", concluir com o tempo gasto e tarefa avulsa.
- **Guias e relatórios:** enviar a guia ligada à obrigação (a tarefa é concluída) e o aviso automático ao cliente.
- **Chamados:** responder. Se o chamado veio pelo WhatsApp, a resposta vai para o WhatsApp do cliente.

**Encontro 2, com o sócio responsável:**
- painel do Início;
- régua;
- catálogo de obrigações;
- equipe;
- auditoria;
- leitura da tela de Cobrança para cobrar retrabalho.

---

## 7. Checklist de entrada em produção

- [ ] `/health` respondendo e sistema **no ar** na Nexor Central
- [ ] `CONTABIL_MASTER_KEY` no cofre da Nexor e num segundo lugar seguro
- [ ] Conta do escritório criada, equipe cadastrada com departamentos e senhas pessoais
- [ ] WhatsApp: webhook verificado, os dois modelos aprovados e teste de envio feito
- [ ] E-mail: domínio verificado no Resend e teste de envio feito
- [ ] Catálogo de obrigações conferido (ISS do município, EFD do estado, prazos do ano)
- [ ] Contas e layout de exportação configurados e **importação de teste feita** no sistema contábil
- [ ] Clientes piloto cadastrados, documentos esperados ajustados, convites do portal aceitos
- [ ] Um documento de cada tipo lido e conferido (nota, extrato, recibo)
- [ ] Backup diário funcionando **e** cópia externa agendada (`backup-agora.sh` com `DESTINO_EXTERNO`), com uma restauração de teste feita
- [ ] Contrato assinado com o anexo de tratamento de dados e o SLA, e Termo de entrega e aceite assinado

---

## 8. Operação, backup e atualização

- **Rotina diária automática** (9 h, horário de Brasília):
  - gera as pendências e as obrigações do mês;
  - envia as cobranças devidas.

  Para rodar na hora: Configurações → Régua de cobrança → **Rodar a rotina agora**.
- **Backup:**
  - **Automático:** uma cópia por dia, consistente e verificada, em `implantacao/backups/` (guarda as últimas 14).
  - **Cópia externa** (obrigatória):
    ```bash
    sudo crontab -e
    0 23 * * * DESTINO_EXTERNO="usuario@backup:/backups/lima" /opt/nexor/implantacao/backup-agora.sh >> /var/log/nexor-backup.log 2>&1
    ```
- **Restaurar:**
  1. `docker compose --profile contabil stop contabil`
  2. Copie `contabil.db` e `arquivos/` do backup para o volume: `docker compose --profile contabil cp ./backups/contabil-AAAAMMDD-HHMM/. contabil:/dados/`
  3. `docker compose --profile contabil start contabil`

  A restauração exige a **mesma** `CONTABIL_MASTER_KEY`.
- **Atualizar:** `cd /opt/nexor/implantacao && sudo ./atualizar.sh`. Ele faz o backup antes, baixa a versão nova e reinicia.
- **Suporte:**
  - Na Nexor Central, use **Entrar como Suporte Nexor** no sistema do escritório. O acesso fica na auditoria do escritório.
  - Pela aba **Nexor · desenvolvedor**, você esconde módulos e abas que o escritório não contratou.

---

## 9. Problemas comuns

| Sintoma | O que verificar |
|---|---|
| Documentos ficam "Sem leitura" | `ANTHROPIC_API_KEY` no `.env` (depois `sudo ./atualizar.sh`) e crédito na conta da Anthropic. A faixa amarela no painel avisa quando a chave falta. |
| "Erro na leitura" | Arquivo ilegível ou cortado. Peça outro ao cliente, ou clique em **Ler de novo** (a IA pode ter estado indisponível). |
| Cobrança não sai pelo WhatsApp | Em Clientes → cliente → Mensagens enviadas, "Fora da janela de 24 h e sem modelo aprovado" significa cadastrar os modelos da Meta. Confira também o token e o número. |
| Arquivo do WhatsApp não chega | Webhook verificado na Meta, campo `messages` assinado e segredo do app igual ao do painel. Veja o log com `docker compose logs -f contabil`. |
| Arquivo chega "Sem cliente" | O número do WhatsApp não está no cadastro do cliente nem no acesso do portal, ou está em mais de uma empresa. |
| Importação recusada no sistema contábil | Ajuste a ordem das colunas, o separador, a data e o decimal em Exportação. As contas precisam existir no plano. |
| Sistema "Somente leitura" ou "Suspenso" | Situação do contrato na Nexor Central (fatura ou sem contato com a Central há mais de 15 dias). |

---

## 10. LGPD e sigilo profissional

- **O escritório é o controlador** dos dados dos clientes dele. **A Nexor é operadora:**
  - só no suporte, quando o sistema está no servidor do escritório;
  - também no armazenamento, na Nuvem Nexor.
- Os documentos ficam **criptografados no disco** (AES-256-GCM, com a chave do escritório), e o download é sempre isolado (sandbox).
- **Suboperadores:**
  - Anthropic: leitura dos documentos e respostas do WhatsApp, que recebe só o documento ou a mensagem daquele momento;
  - Meta: WhatsApp;
  - Resend: e-mail;
  - Cloudflare: túnel.

  Todos com transferência internacional nas cláusulas-padrão da ANPD. Tudo isso está no anexo de tratamento de dados.
- O portal é isolado por empresa. Cada cliente do escritório vê só os próprios documentos, guias e chamados.
- A IA **não dá opinião tributária** e passa para a equipe qualquer assunto de interpretação ou decisão.
- Recomende ao escritório incluir no contrato com os clientes dele o uso do portal e do WhatsApp, e a leitura por IA com conferência humana.
