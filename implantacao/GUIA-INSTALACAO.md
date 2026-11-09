# Guia de instalação dos sistemas Nexor

Para técnicos da Nexor. Cobre os cinco sistemas (Nexor RH e Ponto, Nexor Contábil, Nexor Barber, Nexor Atende IA e Nexor Agente), todos os cenários de cliente e os dois casos de endereço (com e sem domínio).
Tempo médio: **40 a 90 minutos** por empresa, mais a configuração do produto com o cliente.

**Atualizado em novembro de 2026:**
- teste grátis de 30 dias pela Nexor Central;
- vinculação pelo código do cliente (`NX-XXXX-XXXX`);
- Contábil, Barber, Atende e Agente no mesmo instalador;
- checklist de entrega com segurança e LGPD.

---

## Fluxo padrão de um cliente novo

**1. Na Nexor Central.** Cadastre o cliente em **Clientes → Novo cliente**.
- **Para começar pelo teste grátis,** escolha "Começar no teste grátis de 30 dias" e o produto.
- **Se ele já fechou,** use **Contratar plano** (fundador, se for o caso).
- Copie o **código do cliente** (`NX-XXXX-XXXX`).

**2. No servidor do cliente.** Instale com `instalar.sh` (seção 3) e informe o código quando ele pedir. O sistema aparece na Central na hora, já com licença e acesso de suporte.

**3. Com o cliente.** Configure o produto (seção 4) e faça o teste de aceite.

**4. Durante o teste.** O sistema mostra a faixa com os dias que faltam e funciona com as limitações do produto. A Central avisa em "Precisa de atenção" quando faltam 7 dias.

**5. Contratação.** Na Central, use **Contratar plano**. Isso faz quatro coisas sozinho:
- libera tudo em até 5 minutos;
- gera a fatura de implantação;
- começa as mensalidades;
- registra o vendedor e o parceiro, que passam a receber comissão.

**6. Sem contratação.** No dia seguinte ao último dia, o sistema bloqueia. Os dados ficam guardados por 60 dias. No RH, o ponto e os arquivos legais continuam funcionando.

| Limitações do teste grátis | |
|---|---|
| Nexor RH e Ponto | até 10 colaboradores, sem eSocial e recrutamento |
| Nexor Atende IA | até 30 conversas com a IA por dia, sem campanhas |
| Nexor Contábil | até 5 empresas na carteira e 100 documentos no mês |
| Nexor Barber | até 2 barbeiros e 150 agendamentos no mês, sem relatórios |
| Nexor Agente | até 10 ações aprovadas por dia |

A tabela de preços, o teste e as comissões estão em [`comercial/PLANOS-E-PRECOS.md`](../comercial/PLANOS-E-PRECOS.md).

---

## 0. Antes de ir ao cliente (escolhas que não mudam depois)

| Decisão | Opções | Atenção |
|---|---|---|
| **Onde roda** | A. servidor Linux · B. servidor Windows · C. mini PC novo · D. nuvem (VPS) · E. notebook · F. servidor da Nexor | Veja a seção 1 |
| **Endereço (domínio)** | `rh.empresadocliente.com.br` **ou** `empresa.nexorconsultingit.com.br` | **A biometria fica presa ao endereço.** Trocar depois obriga todos os colaboradores a cadastrar a digital de novo. Decida antes. |
| **Identificador da empresa** | ex.: `padaria-pao-dourado` | Letras minúsculas, números e hífen |
| **Sistemas** | `rh`, `contabil`, `barber` (variável `SISTEMAS`) e `atende`, `agente` (variável `PERFIS`) | Pode ter mais de um na mesma empresa, cada um com o seu endereço |

**Leve ou tenha em mãos (todos os sistemas):**
- acesso de administrador ao servidor;
- conta na Cloudflare (a da Nexor ou a do cliente);
- o cofre de senhas da Nexor, para guardar as chaves mestras;
- o **código do cliente na Nexor Central** (`NX-XXXX-XXXX`).

**Por sistema:**

| Sistema | O que providenciar antes |
|---|---|
| **RH e Ponto** | Número do registro do REP-P no INPI. Certificado A1 do cliente para o eSocial (só depois da contratação: no teste, o eSocial fica travado) |
| **Contábil** | Chave da Anthropic **no nome do escritório**. Número de WhatsApp para a API oficial da Meta. Layout de importação do sistema contábil do escritório. Veja [`contabil/MANUAL-IMPLANTACAO.md`](../contabil/MANUAL-IMPLANTACAO.md) |
| **Barber** | Número de WhatsApp para a API oficial. Opcionais: conta Twilio para SMS, projeto Google para "Entrar com Google" e conta Asaas para o clube. Veja [`barber/MANUAL-IMPLANTACAO.md`](../barber/MANUAL-IMPLANTACAO.md) |
| **Atende IA** | Número de WhatsApp para a API oficial e a chave da Anthropic no nome do cliente. Informações da empresa: produtos, preços, horários e regras |
| **Agente** | Chave da Anthropic, números dos donos autorizados, WhatsApp da API oficial e acesso de API aos sistemas que serão conectados |

**Chaves e tokens:** nunca peça para o cliente mandar por WhatsApp ou e-mail. Ele digita direto no servidor ou no painel, ou você copia do cofre da Nexor.

---

## 1. Qual cenário usar

| | Cenário | Quando | Disponibilidade | Custo para o cliente |
|---|---|---|---|---|
| **A** | Servidor **Linux** do cliente | Já tem servidor Linux ou máquina virtual | ★★★★★ | R$ 0 |
| **B** | Servidor **Windows** do cliente | Tem Windows Server com espaço | ★★★★☆ | R$ 0 |
| **C** | **Mini PC** dedicado | Não tem servidor e pode investir | ★★★★☆ | R$ 1.500 a 3.000 (uma vez) + nobreak |
| **D** | **Nuvem (VPS)** em nome do cliente | Não quer equipamento na empresa | ★★★★★ | R$ 30 a 80/mês |
| **E** | **Notebook** do setor | Última opção, temporária | ★★☆☆☆ | R$ 0 |
| **F** | **Servidor da Nexor** | O cliente prefere não cuidar de nada | ★★★★★ | Mensalidade de hospedagem da Nexor |

**Recomendação:** D ou A primeiro. **E só como solução temporária**, com o cliente avisado por escrito dos riscos: notebook desligado significa ponto parado, e notebook perdido ou roubado leva o banco junto se não houver cópia externa. **F muda a LGPD:** a Nexor passa a guardar os dados (veja a seção 6).

**Requisitos mínimos:**

| Instalação | Processador | Memória | Disco (SSD) |
|---|---|---|---|
| Um sistema (RH, Contábil ou Barber) | 2 núcleos | 4 GB (2 GB livres para a Nexor) | 20 GB livres |
| Dois ou três sistemas | 2 a 4 núcleos | 8 GB | 40 GB livres |
| Com Atende IA e Agente | 4 núcleos | 8 GB | 40 GB livres |

O **Contábil** guarda os documentos dos clientes do escritório: conte de 5 a 20 GB a mais por ano, conforme a carteira. Em todos os casos é preciso internet estável.

---

## 2. Endereço: cliente COM e SEM domínio

O app do colaborador e a biometria **exigem HTTPS**. O jeito padrão da Nexor é o **Cloudflare Tunnel** (gratuito): funciona atrás de qualquer roteador, sem IP fixo e sem abrir portas. Também funciona com a internet das operadoras que compartilham o mesmo IP entre vários clientes (CGNAT), o que é comum no Brasil.

### 2.1 Cliente COM domínio (ex.: `paodourado.com.br`)

**Caso 1: o domínio já está na Cloudflare.** Use direto (passo 2.3).

**Caso 2: o domínio está no Registro.br ou em outro provedor de DNS.** Há duas formas:
- **a) Levar o DNS para a Cloudflare (recomendado):**
  1. Na Cloudflare: **Add a domain** → `paodourado.com.br` → plano **Free**. Ela copia os registros atuais.
  2. **Confira, um por um,** se vieram todos: site, **e-mail (MX, SPF, DKIM)** e outros.
  3. No **Registro.br** → o domínio → **DNS** → **Alterar servidores DNS** → coloque os dois servidores que a Cloudflare mostrar.
  4. Em algumas horas (até 24), a Cloudflare mostra **Active**.
  5. **Combine isso com o responsável pelo site e pelo e-mail do cliente.** Um registro esquecido derruba o e-mail.
- **b) O cliente não quer mexer no DNS dele:** use o **subdomínio da Nexor** (seção 2.2, opção 2), ou o cenário com **Caddy** se houver IP fixo e portas 80/443 abertas: um registro `A rh → IP fixo` no Registro.br e `PERFIS="caddy"` na instalação.

### 2.2 Cliente SEM domínio

| Opção | Endereço final | Prós | Contras |
|---|---|---|---|
| **1. Comprar um domínio** (recomendado) | `rh.paodourado.com.br` | Marca do cliente, endereço definitivo | Cerca de R$ 40/ano no Registro.br, no CNPJ do cliente |
| **2. Subdomínio da Nexor** | `paodourado.nexorconsultingit.com.br` | Sem custo, pronto na hora | O endereço depende da Nexor. Se o cliente sair, os colaboradores cadastram a digital de novo no domínio novo |

**Para a opção 2**, o domínio `nexorconsultingit.com.br` precisa estar na Cloudflare. **Isso é feito uma única vez pela Nexor:**
1. **Cloudflare** → Add a domain → `nexorconsultingit.com.br` (Free).
2. **Confira se vieram:**
   - o site no GitHub Pages: registros `A` do `@` para `185.199.108.153`, `.109.153`, `.110.153` e `.111.153`, e `CNAME www` para `pauloamorypa-web.github.io`, todos com a **nuvem cinza (DNS only)**;
   - o e-mail Zoho (MX, SPF, DKIM, DMARC).
3. **Registro.br** → nexorconsultingit.com.br → **Alterar servidores DNS** → os da Cloudflare.

> ⚠️ Não use os endereços temporários `trycloudflare.com` em produção: eles mudam a cada reinício, e a biometria e os QR Codes param de funcionar.

### 2.3 Criar o túnel (vale para qualquer cenário com domínio na Cloudflare)
1. **Cloudflare** → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel** → **Cloudflared**.
2. Nome: `nexor-padaria-pao-dourado` → **Save**.
3. Na tela "Install connector", **copie só o token** (o texto longo depois de `--token`). **Não instale nada** por essa tela: o kit da Nexor já traz o conector.
4. **Public Hostname** → **Add**:
   - **Subdomain:** `rh` (ou `paodourado`, se for no domínio da Nexor)
   - **Domain:** o domínio
   - **Service:** **HTTP** e o serviço do sistema:

     | Sistema | Service no túnel | Exemplo de endereço |
     |---|---|---|
     | RH e Ponto | `rh:8791` | `rh.paodourado.com.br` |
     | Contábil | `contabil:8793` | `contabil.limacontabilidade.com.br` |
     | Barber | `barber:8795` | `agenda.barbearianavalha.com.br` |
     | Atende IA | `atende:8790` | `atendimento.empresa.com.br` |
     | Agente | `agente:8792` | `agente.empresa.com.br` (só o webhook do WhatsApp) |

   Com mais de um sistema, adicione um **Public Hostname por sistema** no mesmo túnel.
5. **Save**. O token vai ser pedido pelo `instalar.sh`.

**Segurança:** guarde o token no cofre da Nexor. Quem tem o token consegue publicar no lugar do servidor. Se ele vazar, recrie o túnel.

---

## 3. Instalação por cenário

### Cenário A: servidor Linux do cliente (Ubuntu 22.04/24.04 ou Debian 12)
```bash
sudo apt update && sudo apt install -y git openssl rsync
sudo git clone https://github.com/pauloamorypa-web/nexorconsulting.git /opt/nexor
cd /opt/nexor/implantacao
sudo ./instalar.sh
```
O script instala o Docker e pergunta:
- o identificador da empresa;
- os **sistemas** (`rh`, `contabil`, `barber`);
- o endereço de cada um;
- o token do túnel;
- o **código do cliente na Nexor Central**.

Depois, gera as chaves mestras e sobe os sistemas, cada um com o backup diário. **Guarde as chaves mestras (`*_MASTER_KEY`) no cofre quando ele pedir.**

Atalhos:
```bash
sudo SISTEMAS="rh" ./instalar.sh                    # só o Nexor RH e Ponto
sudo SISTEMAS="contabil" ./instalar.sh              # só o Nexor Contábil
sudo SISTEMAS="barber" ./instalar.sh                # só o Nexor Barber
sudo SISTEMAS="rh barber" ./instalar.sh             # dois sistemas na mesma empresa
sudo PERFIS="tunel atende agente" ./instalar.sh     # com Atende IA e Agente
sudo PERFIS="caddy" ./instalar.sh                   # HTTPS com IP fixo e portas 80/443, sem túnel
```

Repositório privado: crie um *token de leitura* no GitHub (Settings → Developer settings → Fine-grained tokens, só leitura deste repositório) e clone com `https://TOKEN@github.com/pauloamorypa-web/nexorconsulting.git`.

### Cenário B: servidor Windows do cliente
**B1, recomendado: máquina virtual Ubuntu no Hyper-V**
1. **Gerenciador do Hyper-V** → Nova máquina virtual → Geração 2, 4 GB de RAM, 40 GB de disco, rede externa.
2. Instale o **Ubuntu Server 24.04**, marcando **OpenSSH server**.
3. Na máquina virtual, siga o **Cenário A**.
4. No Hyper-V, configure a máquina virtual para **iniciar automaticamente** com o Windows (Configurações → Ação de início automático → *Sempre iniciar*).

**B2, sem Hyper-V:** siga o **Cenário E** a partir do passo 2. O script de energia é opcional num servidor, que já não costuma suspender.

### Cenário C: mini PC dedicado novo
1. **BIOS/UEFI:** ative **Restore on AC Power Loss = Power On**, para ele ligar sozinho quando a energia voltar.
2. Instale o **Ubuntu Server 24.04** pelo pendrive (Rufus no Windows para gravar a ISO).
3. Ligue o mini PC no **nobreak** e no **cabo de rede**.
4. Siga o **Cenário A**.
5. Etiquete o equipamento com "SERVIDOR NEXOR – NÃO DESLIGAR" e o telefone de suporte da Nexor.

### Cenário D: nuvem (VPS) em nome do cliente
1. Crie a conta **no CNPJ do cliente**, por exemplo na Hostinger, Contabo, AWS Lightsail ou DigitalOcean. Escolha Ubuntu 24.04, 2 vCPU, 4 GB, região **São Paulo** de preferência.
2. Acesse por SSH (`ssh root@IP`) e crie um usuário administrador.
3. **Firewall** (com o túnel, nenhuma porta precisa ficar aberta além do SSH):
   ```bash
   sudo ufw allow OpenSSH && sudo ufw enable
   ```
4. Siga o **Cenário A**.
5. Ative os **snapshots/backup do provedor** (normalmente R$ 5 a 15/mês). Isso é um backup a mais, além do backup da Nexor.

### Cenário E: notebook do setor (Windows 10/11), com configuração contra hibernação
> Só como solução temporária, com o cliente ciente dos riscos. Exigências: **Windows 10 22H2 ou 11**, **8 GB de RAM**, SSD, **sempre na tomada** (de preferência num nobreak), **cabo de rede** e o notebook **fixo na empresa**.

**Passo 1: preparar o Windows (energia, rede, Windows Update e WSL)**
1. Copie a pasta `implantacao\windows` do repositório para o notebook. Por exemplo, baixe o ZIP do repositório no GitHub e extraia.
2. Abra o **PowerShell como Administrador** (botão direito no menu Iniciar → *Terminal (Administrador)*):
   ```powershell
   cd C:\caminho\implantacao\windows
   Set-ExecutionPolicy -Scope Process Bypass -Force
   .\preparar-notebook.ps1
   ```

O script faz automaticamente:

| Ajuste | Configuração |
|---|---|
| Suspender e hibernar na tomada | **Nunca** (`powercfg standby/hibernate-timeout-ac 0`, `powercfg /hibernate off`) |
| Fechar a tampa na tomada | **Não fazer nada** (na bateria continua suspendendo, para proteger o equipamento) |
| Tela | Apaga em 10 minutos (o sistema continua rodando) |
| Disco e USB | Sem desligamento por economia |
| Placa de rede e Wi-Fi | Sem economia de energia |
| Windows Update | Não reinicia sozinho com usuário logado; horário ativo das 6h às 23h |
| WSL 2 + Ubuntu 24.04 | Instalado, **sem desligar por inatividade** (`vmIdleTimeout=-1`) |
| Início automático | Tarefa **"Nexor - manter sistemas ligados"**: liga o Docker no boot, mesmo sem ninguém logado |

**Passo 2: conferir à mão o que o script não alcança**
- **BIOS:** Restore on AC Power Loss = **Power On** (se o notebook tiver essa opção).
- **Configurações → Sistema → Energia:** confira "Quando conectado, suspender após: **Nunca**".
- **Software do fabricante** (Dell Power Manager, Lenovo Vantage, HP): desative os modos que "economizam" na tomada. Se existir, ative o **limite de carga em 80%**, que preserva a bateria ligada 24 horas.
- **Antivírus:** libere o WSL ou o Docker se ele bloquear.
- Reinicie o Windows.

**Passo 3: dentro do Ubuntu**
1. Abra o **Ubuntu** no menu Iniciar. Na primeira vez, ele pede para criar um usuário e uma senha.
2. Rode:
   ```bash
   sudo apt update && sudo apt install -y git
   sudo git clone https://github.com/pauloamorypa-web/nexorconsulting.git /opt/nexor
   sudo bash /opt/nexor/implantacao/windows/preparar-ubuntu-wsl.sh
   ```
3. No **PowerShell**, rode `wsl --shutdown` e abra o Ubuntu de novo.
4. Instale:
   ```bash
   cd /opt/nexor/implantacao && sudo ./instalar.sh
   ```

**Passo 4: teste de resistência (obrigatório antes de entregar)**
- [ ] Reinicie o Windows **sem fazer login** e abra `https://ENDEREÇO/health` no celular, pela rede 4G. Deve responder `{"ok":true}`.
- [ ] Feche a tampa (na tomada) e espere 30 minutos. O `/health` continua respondendo.
- [ ] Tire da tomada por 1 minuto e recoloque. Os sistemas continuam no ar.
- [ ] Deixe o notebook parado de um dia para o outro e confira o `/health` de manhã.

### Cenário F: servidor da Nexor (várias empresas)
Faça uma única vez, para preparar o servidor: siga o **Cenário D**, com a conta **no nome da Nexor**.

Depois, para cada empresa nova:
1. Crie um túnel para a empresa (seção 2.3) e copie o token.
2. Rode:
   ```bash
   cd /opt/nexor/implantacao
   sudo ./nova-empresa.sh padaria-pao-dourado paodourado.nexorconsultingit.com.br TOKEN_DO_TUNEL
   sudo ./empresa.sh padaria-pao-dourado ps
   ```
3. Guarde a `RH_MASTER_KEY` de `clientes/padaria-pao-dourado/.env` no cofre.

Cada empresa roda isolada: projeto Docker, rede, volumes, backups e túnel próprios.

---

## 4. Depois de instalar

### 4.0 Para todos os sistemas
1. **Primeiro administrador:** abra `https://ENDEREÇO` e preencha a empresa, o seu nome e o **código de instalação**. O código aparece no fim do `instalar.sh`. Se perdeu, veja com `docker compose exec SISTEMA cat /dados/codigo-instalacao.txt`, trocando `SISTEMA` por `rh`, `contabil` ou `barber`.
2. **Vínculo com a Nexor Central:**
   - **Se informou o código na instalação,** o sistema aparece em Central → Clientes → cliente → Sistemas instalados, com a situação "Teste grátis" ou "Em dia".
   - **Se não informou,** digite o código em **Configurações → Nexor** dentro do sistema.
   - **Confira o endereço:** na Central, ele precisa estar cadastrado no sistema para o botão "Entrar como Suporte Nexor" funcionar.
3. **Backup externo (obrigatório):** veja o item 6 da seção 4.1. Ele vale para todos os sistemas, ajustando a pasta.
4. **Contrato e termos de uso:** confira se o cliente assinou o contrato com a cláusula de tratamento de dados antes de liberar o uso com dados reais. Guarde a cópia na pasta do cliente.

### 4.1 Nexor RH e Ponto
1. Faça o primeiro acesso como na seção 4.0.
2. **Configure o sistema:**
   - **Configurações → Empresa:** dados da empresa e **número do registro do REP-P no INPI**.
   - **Locais e quiosque:** marque cada local no mapa (GPS) e defina o raio. Gere o link do quiosque, se for usar.
   - **Jornadas, cargos, departamentos e feriados.**
   - **Tabelas da folha:** confira os valores do ano.
3. **Colaboradores:** cadastre e envie os convites. Cada colaborador baixa o **Meu Ponto** (ou usa `https://ENDEREÇO/app/`) e ativa com o CPF e o código.
4. **Teste no local** com 2 ou 3 pessoas: ponto dentro e fora da área, QR do quiosque e comprovante.
5. **eSocial:** envie o certificado A1 e teste no ambiente **produção restrita** antes de mudar para produção.
6. **Backup externo (obrigatório):**
   ```bash
   sudo crontab -e
   0 23 * * * DESTINO_EXTERNO="usuario@servidor-backup:/backups/padaria" /opt/nexor/implantacao/backup-agora.sh >> /var/log/nexor-backup.log 2>&1
   ```
   No notebook (cenário E), use um HD externo ou um NAS em `DESTINO_EXTERNO`, ou a pasta do OneDrive ou Google Drive do cliente montada no Windows, acessível em `/mnt/c/...`.
7. **Integrações (se houver Nexor Agente ou Atende IA):** no RH, vá em **Configurações → Integrações → Nova chave** → coloque em `NEXOR_RH_CHAVE` no `.env` → `sudo PERFIS="tunel agente" ./instalar.sh`.

### 4.2 Nexor Contábil
Siga o [manual do Contábil](../contabil/MANUAL-IMPLANTACAO.md) a partir da seção 4:
1. **Dados do escritório e marca:** nome, logo e cores, que aparecem no portal e nas mensagens.
2. **WhatsApp do escritório e e-mail de envio.**
3. **Régua de cobrança** e catálogo de documentos por regime.
4. **Catálogo de obrigações:** confira os prazos estaduais e municipais.
5. **Layout de exportação e plano de contas** do sistema contábil do escritório.
6. **Carteira:** importe ou cadastre as empresas. No teste grátis, o limite é de 5 empresas.
7. **Portal:** convide um cliente piloto.

Teste de aceite:
- receber uma nota pelo portal;
- conferir a leitura da IA;
- exportar um lançamento;
- cobrar um documento e ver a mensagem chegar.

### 4.3 Nexor Barber
Siga o [manual do Barber](../barber/MANUAL-IMPLANTACAO.md) a partir da seção 3:
1. **Barbearia:** endereço, expediente, feriados, serviços e preços.
2. **Barbeiros:** cada um com login próprio e percentual de comissão. No teste grátis, o limite é de 2 barbeiros.
3. **Canais:**
   - WhatsApp (obrigatório para lembretes e vaga relâmpago);
   - SMS, Google e Asaas, se o cliente quiser.
4. **Clube e produtos:** planos, estoque e estoque mínimo.

Teste de aceite: um cliente de teste entra pelo app, agenda "o de sempre", reserva um produto, e a comanda é fechada no balcão. Por fim, divulgue o link do app com o QR Code no balcão.

### 4.4 Nexor Atende IA
1. Primeiro acesso no endereço do Atende.
2. **Conhecimento da IA:** produtos, preços, horários, regras e perguntas frequentes. Teste no **Simulador** antes de ligar o WhatsApp.
3. **WhatsApp (API oficial da Meta):**
   - token, ID do número e segredo do app;
   - webhook `https://ENDEREÇO/webhook/whatsapp`, com o campo **messages** assinado.
4. **Equipe e transferência:** quem recebe as conversas que a IA passa adiante.
5. **Agenda e funil,** se forem usados.

Teste de aceite: mande 10 perguntas reais pelo WhatsApp e confira as respostas, a transferência e o registro no funil. No teste grátis, a IA atende até 30 conversas por dia.

### 4.5 Nexor Agente
1. No `.env`, preencha:
   - `AGENTE_DONOS`: os números autorizados, com DDI e DDD;
   - `AGENTE_WHATSAPP_*`;
   - a chave da Anthropic.
2. **Conectores:** edite `conectores.json` com os sistemas do cliente. As credenciais ficam em variáveis do `.env` (`${NOME}`), nunca no JSON. Comece com a escrita no modo `aprovar`.
3. **Webhook do WhatsApp:** `https://ENDEREÇO/webhook/whatsapp`.
4. Rode `sudo PERFIS="tunel agente" ./instalar.sh` para aplicar.

Teste de aceite:
- o dono faz uma consulta;
- pede uma ação e recebe Aprovar e Recusar;
- aprova e confere no sistema conectado;
- um número não autorizado recebe a recusa.

### 4.6 Checklist de entrega (todos os sistemas)
- [ ] Sistema vinculado na Nexor Central, na situação certa (teste grátis ou contratado).
- [ ] Chaves mestras e token do túnel no cofre da Nexor. Nenhuma chave enviada por WhatsApp ou e-mail.
- [ ] Backup diário rodando e **um backup restaurado em teste**.
- [ ] Backup externo configurado (HD, NAS ou nuvem do cliente).
- [ ] `https://ENDEREÇO/health` respondendo pela rede 4G.
- [ ] Primeiro administrador com senha forte. Nenhum usuário genérico, como "admin" ou "teste", ficou ativo.
- [ ] Contrato e termos de uso assinados, com cópia guardada.
- [ ] Contato do responsável pela LGPD do cliente anotado na Central (observações).
- [ ] Cliente sabe como pedir suporte e em quanto tempo a Nexor responde.
- [ ] No cenário E, termo de ciência dos riscos do notebook assinado.

---

## 5. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Endereço não abre, mas `docker compose ps` mostra o rh *healthy* | Túnel parado ou hostname errado | `docker compose logs tunel`; na Cloudflare, confira se o Service é `http://rh:8791` |
| "PUBLIC_URL é obrigatória" no log | `.env` incompleto | Confira `RH_PUBLIC_URL=https://...` sem barra no final |
| Biometria não cadastra | Acesso sem HTTPS ou endereço diferente do `RH_PUBLIC_URL` | Use sempre o endereço HTTPS oficial |
| Ponto recusado "fora do local" | Coordenadas ou raio errados | Configurações → Locais: ajuste o pino e o raio (100 a 200 m) |
| Notebook parou à noite | Suspensão, Windows Update ou software do fabricante | Refaça o Cenário E, passos 1 e 2. Confira a tarefa "Nexor - manter sistemas ligados" no Agendador de Tarefas |
| WSL não sobe sozinho após reiniciar | Tarefa sem senha ou a senha do Windows mudou | Rode `preparar-notebook.ps1` de novo |
| `BACKUP FALHOU` no log do backup | Disco cheio ou permissão | `df -h`; `sudo chown 1000:1000 backups` |
| Esqueci a chave mestra | — | **Não há recuperação.** Por isso ela vai para o cofre na instalação |
| Sistema não aparece na Central | Código errado ou sem internet de saída | Confira em Configurações → Nexor. O servidor precisa acessar `central.nexorconsultingit.com.br` (porta 443) |
| Faixa "Teste grátis" não some depois de contratar | A licença atualiza a cada 5 minutos | Espere 5 minutos ou, no RH, use Configurações → Nexor → "Sincronizar agora" |
| "Não faz parte do teste grátis" ou "limite do teste" | Cliente ainda em teste | Contrate o plano na Central ou prorrogue o teste |
| Contábil não lê documentos | Chave da Anthropic ausente ou sem crédito | Confira `ANTHROPIC_API_KEY` no `.env` e rode `sudo ./atualizar.sh` |
| Barber não envia lembretes | WhatsApp não configurado ou modelo de mensagem não aprovado pela Meta | Configurações → Canais. Confira os modelos aprovados no Gerenciador do WhatsApp |

Comandos úteis (na pasta `implantacao/`):
```bash
docker compose ps                 # situação
docker compose logs -f rh         # log do RH (ou contabil, barber, atende, agente)
sudo ./backup-agora.sh            # backup na hora
sudo ./atualizar.sh               # atualizar (faz backup antes)
```

---

## 6. LGPD e contrato por cenário

| Cenário | Quem guarda os dados | Papel da Nexor | Documento |
|---|---|---|---|
| A, B, C, D, E | O cliente (equipamento ou conta dele) | Operadora só no suporte | Contrato com cláusula de tratamento de dados |
| F | A Nexor | **Operadora que armazena** | Acordo de tratamento de dados (DPA), política de segurança e plano de incidentes. **Ajustar o site e a política de privacidade**, que hoje dizem que a Nexor não guarda dados |

Em todos os casos, entregue ao cliente:
- o endereço do sistema;
- a confirmação de que a chave mestra está guardada;
- onde ficam os backups;
- o contato de suporte;
- no cenário E, **o termo de ciência dos riscos do notebook**.
