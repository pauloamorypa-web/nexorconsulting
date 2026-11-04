# Guia de instalação dos sistemas Nexor

Para técnicos da Nexor. Cobre todos os cenários de cliente e os dois casos de endereço (com e sem domínio).
Tempo médio: **40 a 90 minutos** por empresa.

---

## 0. Antes de ir ao cliente (escolhas que não mudam depois)

| Decisão | Opções | Atenção |
|---|---|---|
| **Onde roda** | A. servidor Linux · B. servidor Windows · C. mini PC novo · D. nuvem (VPS) · E. notebook · F. servidor da Nexor | Veja a seção 1 |
| **Endereço (domínio)** | `rh.empresadocliente.com.br` **ou** `empresa.nexorconsultingit.com.br` | **A biometria fica presa ao endereço.** Trocar depois obriga todos os colaboradores a cadastrar a digital de novo. Decida antes. |
| **Identificador da empresa** | ex.: `padaria-pao-dourado` | Letras minúsculas, números e hífen |

**Leve ou tenha em mãos:**
- acesso de administrador ao servidor;
- conta na Cloudflare (a da Nexor ou a do cliente);
- o cofre de senhas da Nexor, para guardar a chave mestra;
- o número do registro do REP-P no INPI;
- o certificado A1 do cliente (para o eSocial).

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

**Requisitos mínimos (só Nexor RH):** 2 núcleos, 4 GB de RAM (2 GB livres para a Nexor), 20 GB livres em SSD, internet estável. Com Atende IA e Agente: 8 GB de RAM.

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
   - **Service:** **HTTP** · `rh:8791`
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
O script instala o Docker, pergunta o identificador da empresa, o endereço e o token do túnel, gera a chave mestra e sobe o Nexor RH e o backup diário. **Guarde a `RH_MASTER_KEY` quando ele pedir.**

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

## 4. Depois de instalar (todos os cenários)

1. **Primeiro administrador:** abra `https://ENDEREÇO` e preencha a empresa, o seu nome e o **código de instalação**. O código aparece no fim do `instalar.sh`. Se perdeu, veja com `docker compose exec rh cat /dados/codigo-instalacao.txt`.
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

Comandos úteis (na pasta `implantacao/`):
```bash
docker compose ps                 # situação
docker compose logs -f rh         # log do RH
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
