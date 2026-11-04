# Servidor interno da Nexor

O que é **da Nexor** (não dos clientes) roda aqui, num servidor Linux:

| Serviço | Para quê | Endereço | Dentro do servidor |
|---|---|---|---|
| **Nexor Central** | Clientes, cobrança com bloqueio automático, licenças, Suporte Nexor | `central.nexorconsultingit.com.br` | `http://central:8800` |
| **Blue (Nexor Assist)** | Chat do site, leads, agenda do diagnóstico, WhatsApp comercial, relatório de campanhas | `api.nexorconsultingit.com.br` | `http://assist:8787` |
| Túnel Cloudflare | HTTPS sem abrir portas | — | — |
| Backup diário | Banco da Central, chave das licenças, leads e agenda | `./backups` | — |

Isto substitui o `central/instalar.sh` (que continua servindo para uma Central sozinha) e o Render para a Blue.

```bash
sudo apt update && sudo apt install -y git
sudo git clone https://github.com/pauloamorypa-web/nexorconsulting.git /opt/nexor
cd /opt/nexor/interno
sudo ./endurecer.sh     # firewall, fail2ban, atualizações de segurança, SSH só com chave, relógio
sudo ./instalar.sh      # Central + Blue + túnel + backup
```

Passo a passo completo, com checklists: **manual interativo**, aba “Servidor interno Nexor”.

- Atualizar: `sudo ./atualizar.sh` (faz backup antes)
- Backup na hora e cópia externa: `sudo DESTINO_EXTERNO="usuario@backup:/nexor" ./backup.sh`
- Situação e logs: `sudo docker compose ps` · `sudo docker compose logs -f central` · `sudo docker compose logs -f assist`
