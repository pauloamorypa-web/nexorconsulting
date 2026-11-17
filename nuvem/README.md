# Nuvem Nexor na VPS da Hostinger

Uma VPS só roda tudo o que é da Nexor e os clientes que não têm servidor nem domínio:

| O quê | Endereço | Onde fica |
|---|---|---|
| Nexor Central (e o portal do parceiro) | `central.nexorconsultingit.com.br` | `interno/` |
| Blue (chat do site e WhatsApp comercial) | `api.nexorconsultingit.com.br` | `interno/` |
| Sistemas dos clientes hospedados | `<cliente>.nexorconsultingit.com.br` | `implantacao/clientes/<cliente>/` |
| Borda (entrega cada endereço ao sistema certo) | — | `nuvem/` (esta pasta) |

```
 visitante ──HTTPS──► Cloudflare ──túnel──► VPS Hostinger (nenhuma porta aberta)
                                              ├─ central.…  → Nexor Central
                                              ├─ api.…      → Blue
                                              └─ *.…        → borda ─► barbearia-navalha → Barber
                                                                     ├► padaria-trigo     → RH + Ponto
                                                                     └► lima-contabil     → Contábil
```

Cada cliente continua isolado: rede, banco, arquivos, chaves e backups próprios. A borda só encaminha.

## 1. Antes de começar (uma vez)
1. **VPS na Hostinger:** plano **KVM 2** (2 vCPU, 8 GB de RAM, 100 GB NVMe) com **Ubuntu 24.04**. Ele aguenta a Central, a Blue e de 15 a 25 clientes pequenos (Barber, Ponto, Contábil).
   - Passe para o **KVM 4** quando o `docker stats` mostrar a memória acima de 70% por uma semana.
   - O Atende IA e o Agente usam mais memória: conte cada um como 3 clientes pequenos.
2. **DNS do domínio na Cloudflare (grátis).**
   - Se o `nexorconsultingit.com.br` ainda não está na Cloudflare, adicione o domínio lá e troque os servidores DNS no Registro.br.
   - Copie antes os registros do site (GitHub Pages) para nada sair do ar.
3. **Túnel na Cloudflare.**
   1. Abra Zero Trust → Networks → Tunnels → Create a tunnel e escolha Cloudflared.
   2. Dê o nome `nexor-vps`.
   3. Copie o **token**. Ele vai **só** no instalador, na VPS. Nunca em chat ou e-mail.
4. **Endereços do túnel** (Public hostnames), nesta ordem:

   | Subdomínio | Serviço |
   |---|---|
   | `central` | `http://central:8800` |
   | `api` | `http://assist:8787` |
   | `*` (curinga) | `http://borda:80` |

   O endereço curinga não cria o DNS sozinho. Em DNS → Records, crie um **CNAME `*`** apontando para `<id-do-túnel>.cfargotunnel.com`, com a nuvem laranja (proxy) ligada. O `www` e o domínio principal do site continuam com os registros próprios e não são afetados.

## 2. Instalar na VPS
Entre na VPS pelo terminal da Hostinger (ou por SSH) e rode:

```bash
sudo apt update && sudo apt install -y git
sudo git clone https://github.com/pauloamorypa-web/nexorconsulting.git /opt/nexor
cd /opt/nexor/interno
sudo ./endurecer.sh      # firewall, fail2ban, atualizações, SSH só com chave
sudo ./instalar.sh       # Central + Blue + túnel (pede o token do passo 1.3)
cd ../nuvem
sudo ./instalar.sh       # borda dos clientes hospedados
```

O `interno/instalar.sh` mostra o **código de instalação** da Central no final. Guarde para o próximo passo.

## 3. Primeiro acesso à Nexor Central
1. Abra `https://central.nexorconsultingit.com.br`.
2. Crie a conta do **Dono** com o código de instalação.
3. Escaneie o QR Code com o Google Authenticator ou o Microsoft Authenticator. O login sempre pede o código de 6 dígitos.
4. Em **Equipe**, crie os usuários do Financeiro e do Suporte.
5. Guarde no cofre:
   - a `CENTRAL_MASTER_KEY` e o `REPORT_TOKEN` do arquivo `interno/.env`;
   - a chave das licenças (o backup diário já copia).

## 4. Portal do parceiro
O portal não tem senha. Cada parceiro recebe um link próprio e secreto.
1. Na Central, abra **Parceiros e comissões → Novo vendedor ou parceiro**. Para conhecer o portal, cadastre você mesmo como parceiro de teste.
2. Clique em **Link do portal** e abra o link no celular ou no computador.
3. No portal, o parceiro:
   - acompanha os clientes e as comissões;
   - envia indicações, que caem na Central.
4. Link vazou? **Novo link do portal** derruba o antigo na hora.

## 5. Cliente novo hospedado (sem servidor e sem domínio)
1. Cadastre o cliente na Central, que gera o código do cliente.
2. Na VPS, crie o sistema dele com o endereço automático:
   ```bash
   cd /opt/nexor/implantacao
   SISTEMAS="barber" sudo -E ./nova-empresa.sh barbearia-navalha auto
   # → https://barbearia-navalha.nexorconsultingit.com.br
   SISTEMAS="rh contabil" sudo -E ./nova-empresa.sh padaria-trigo auto
   # → https://padaria-trigo.nexorconsultingit.com.br (RH) e https://padaria-trigo-contabil.nexorconsultingit.com.br
   ```
3. Abra o endereço e vincule o sistema com o código do cliente, como sempre.

**Cliente com domínio próprio, mas sem servidor:**
1. Crie o sistema com `NUVEM=1 sudo -E ./nova-empresa.sh slug agenda.cliente.com.br`.
2. Na Cloudflare, adicione esse endereço no túnel, apontando para `http://borda:80`.

**Administrar depois:**
- `./empresa.sh <cliente> ps`
- `./empresa.sh <cliente> logs -f barber`
- `../nuvem/subdominio.sh listar`

**Cancelamento:**
1. Rode `../nuvem/subdominio.sh desligar <endereço>` e depois `./empresa.sh <cliente> down`.
2. Entregue o backup ao cliente e só então apague a pasta `clientes/<cliente>`.

## 6. Duas VPS: a Nexor separada dos clientes (recomendado ao crescer)
Comece com uma VPS só. **Separe ao fechar o 10º cliente hospedado ou o primeiro cliente de RH grande.** A Central guarda a chave que libera as licenças de todos. Ela não deve dividir a máquina com os sistemas dos clientes: se um deles for invadido, a Central continua fora de alcance.

| VPS | O que roda | Plano | Túnel da Cloudflare |
|---|---|---|---|
| **Nexor** | `interno/` (Central e Blue) | KVM 1 ou KVM 2 | `nexor-vps`: `central` e `api` |
| **Clientes** | `nuvem/` e `implantacao/` | KVM 2, depois KVM 4 | `nexor-clientes`: `*` → `http://borda:80` |

**Montar a VPS Clientes do zero:**
1. Na Cloudflare, crie o túnel `nexor-clientes` com o endereço curinga `*` → `http://borda:80`.
2. Troque o CNAME `*` do DNS para `<id-do-novo-túnel>.cfargotunnel.com`.
3. Na VPS nova, rode:
   ```bash
   sudo apt update && sudo apt install -y git
   sudo git clone https://github.com/pauloamorypa-web/nexorconsulting.git /opt/nexor
   cd /opt/nexor/interno && sudo ./endurecer.sh
   cd ../nuvem && sudo ./instalar.sh     # sem o interno nesta máquina, ele pede o token do túnel nexor-clientes
   ```

**Mudar os clientes de uma VPS para a outra (fora do horário comercial):**
1. Na VPS antiga, para cada cliente:
   - faça o backup de agora com `sudo ./empresa.sh <cliente> exec -T backup node --disable-warning=ExperimentalWarning scripts/backup.js` (no Contábil, troque `backup` por `backup-contabil`; no Barber, por `backup-barber`);
   - copie a pasta inteira `implantacao/clientes/<cliente>` para a VPS nova. Ela leva o `.env` com a `MASTER_KEY`, sem a qual o backup não abre, e os backups.
2. Na VPS nova, para cada cliente:
   - suba com `./empresa.sh <cliente> up -d`;
   - restaure como em **"Restaurar"** no `implantacao/README.md`, usando `./empresa.sh <cliente>` no lugar de `docker compose` (ex.: `./empresa.sh <cliente> stop rh`, `./empresa.sh <cliente> cp clientes/<cliente>/backups/rh-AAAAMMDD-HHMM/. rh:/dados/` e `./empresa.sh <cliente> start rh`);
   - ligue o endereço com `../nuvem/subdominio.sh ligar <cliente>.nexorconsultingit.com.br <cliente>-<sistema>:<porta>`.
3. Na Cloudflare, tire o curinga `*` do túnel `nexor-vps` (lá ficam só `central` e `api`). Os endereços dos clientes não mudam.
4. Na VPS antiga, desligue os clientes com `./empresa.sh <cliente> down`.

## 7. Cloudflare Access: a Central protegida antes do login
Com o Access, quem abre a Central primeiro passa pela Cloudflare, que pede o seu e-mail e manda um código. Sem isso, nem a tela de login aparece. Ele é grátis até 50 pessoas.

**Importante:** algumas partes da Central precisam continuar públicas:
- os sistemas dos clientes sincronizam a licença por ela;
- o Asaas avisa os pagamentos;
- os parceiros abrem o portal pelo link deles.

Por isso são **duas** aplicações no Access.

1. **Zero Trust → Access → Applications → Add an application → Self-hosted:**
   - **Nome:** `Nexor Central · equipe`
   - **Domínio:** `central.nexorconsultingit.com.br` (caminho vazio = o site inteiro)
   - **Política:** Allow · Emails · o seu e-mail e os da equipe
   - **Duração da sessão:** 24 horas
2. **Segunda aplicação, Self-hosted:**
   - **Nome:** `Nexor Central · público`
   - **Policy:** **Bypass** · Everyone
   - **Domínios:** `central.nexorconsultingit.com.br`, um para cada caminho abaixo:

   | Caminho | Quem usa |
   |---|---|
   | `/api/v1/*` | Sistemas dos clientes (licença e vínculo) |
   | `/api/webhooks/*` | Asaas (pagamentos) |
   | `/api/portal-parceiro*` | Portal do parceiro (dados) |
   | `/parceiro/*` | Portal do parceiro (página) |
   | `/js/*`, `/acesso/*`, `/img/*` | Arquivos de tela do portal |
   | `/app.css`, `/central.css`, `/rh.css` | Arquivos de tela do portal |
   | `/health` | Monitoramento |

   O caminho mais específico vence: o Bypass libera só esses endereços, e todo o resto fica atrás do e-mail.
3. **Confira** de qualquer computador:
   ```bash
   ./conferir-acesso.sh central.nexorconsultingit.com.br
   ```
   - Tudo com ✔: está certo.
   - Algum "BLOQUEADO": acrescente o caminho na aplicação de Bypass. Senão, os sistemas dos clientes deixam de sincronizar.
4. A Blue (`api.`) e os sistemas dos clientes **não** levam Access: o site e os clientes do cliente precisam abrir sem e-mail.
5. **Acesso à VPS:** entre pelo terminal do painel da Hostinger ou por SSH com chave. O `endurecer.sh` já desliga a senha no SSH.

## 8. Backup fora da VPS (regra 3-2-1)
**3 cópias, 2 lugares, 1 fora da VPS.** Os backups diários já existem dentro da VPS. Falta a cópia fora dela.

1. **Escolha o destino.** Sugestões:
   - **Backblaze B2:** cerca de US$ 6 por TB por mês;
   - **Google Drive** de uma conta da empresa.
2. **Instale e configure o rclone, com cifragem.** Os backups têm dados de clientes, então a cópia vai cifrada:
   1. Instale com `sudo apt install -y rclone`.
   2. Rode `sudo rclone config` e crie o remoto `nexor-nuvem` (B2 ou Drive).
   3. Ainda no `rclone config`, crie o remoto `nexor-cripto`:
      - tipo `crypt`;
      - apontando para `nexor-nuvem:nexor-backups`;
      - com duas senhas fortes. **Guarde as duas no cofre**: sem elas o backup não abre.
3. **Configure o destino** em `nuvem/backup.env`:
   ```bash
   echo 'DESTINO_EXTERNO="rclone:nexor-cripto:vps-1"' | sudo tee /opt/nexor/nuvem/backup.env
   sudo chmod 600 /opt/nexor/nuvem/backup.env
   ```
4. **Teste e agende:**
   ```bash
   sudo /opt/nexor/nuvem/backup-externo.sh             # copia agora
   sudo /opt/nexor/nuvem/backup-externo.sh --agendar   # todo dia às 3h
   ```
   Ele copia o servidor interno (se estiver nesta VPS), os backups de cada cliente e as rotas da borda. Com duas VPS, rode nas duas, com destinos diferentes (`vps-nexor` e `vps-clientes`).
5. **No painel da Hostinger,** ligue os **backups semanais** da VPS.
6. **Uma vez por mês, teste a restauração:**
   1. baixe o backup de um cliente;
   2. suba numa máquina de teste;
   3. confira se abre.

   Backup que nunca foi testado não é backup.

## 9. Monitoramento (UptimeRobot, grátis)
1. Crie a conta em uptimerobot.com e ligue o aviso pelo app no celular e por e-mail.
2. Crie um monitor **HTTP(s)**, de 5 em 5 minutos, para cada endereço:
   - `https://central.nexorconsultingit.com.br/health`
   - `https://api.nexorconsultingit.com.br/health`
   - `https://<cliente>.nexorconsultingit.com.br/health` para cada cliente; a lista sai de `./subdominio.sh listar`
3. **Palavra-chave esperada:** `"ok":true`. Assim um erro da borda não passa por sistema funcionando.
4. **Clientes de RH (ponto):** coloque aviso também por SMS ou ligação, porque o ponto não pode parar.

## 10. Cuidados
- **LGPD:** na nuvem, a Nexor guarda os dados do cliente e vira **operadora**. Use o contrato de operador (`POLITICA-IMPLANTACAO-LGPD.md`) na venda.
- **Ponto (Portaria 671):** o RH na nuvem precisa ficar no ar 24 horas. Por isso o backup externo (seção 8) e o monitoramento (seção 9) são obrigatórios antes do primeiro cliente de RH.
- **Saída do cliente:** o endereço `*.nexorconsultingit.com.br` é da Nexor. Se o cliente sair, entregue o backup. No RH, os colaboradores cadastram a digital de novo no endereço novo.
