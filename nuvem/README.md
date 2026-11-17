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

## 6. Cuidados
- **Backup fora da VPS:** os backups diários de cada cliente ficam em `implantacao/clientes/<cliente>/backups`. Copie para fora todo dia, por exemplo com `DESTINO_EXTERNO` em `interno/backup.sh`. Ative também o backup semanal da Hostinger.
- **LGPD:** na nuvem, a Nexor guarda os dados do cliente e vira **operadora**. Use o contrato de operador (`POLITICA-IMPLANTACAO-LGPD.md`) na venda.
- **Ponto (Portaria 671):** o RH na nuvem precisa ficar no ar 24 horas. Por isso a VPS precisa de backup externo e de monitoramento, como o UptimeRobot grátis nos endereços dos clientes.
- **Saída do cliente:** o endereço `*.nexorconsultingit.com.br` é da Nexor. Se o cliente sair, entregue o backup. No RH, os colaboradores cadastram a digital de novo no endereço novo.
