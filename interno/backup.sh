#!/usr/bin/env bash
# Backup na hora: banco da Central + chave das licenças + dados da Blue (leads e agenda).
# Cópia externa (obrigatória): DESTINO_EXTERNO="usuario@servidor:/backups/nexor" ./backup.sh
# Agendar todo dia às 23h:  sudo crontab -e  →  0 23 * * * DESTINO_EXTERNO="..." /opt/nexor/interno/backup.sh >> /var/log/nexor-interno.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups/assist
docker compose exec -T central-backup node --disable-warning=ExperimentalWarning scripts/backup.js
tar -czf "backups/assist/assist-$(date +%Y%m%d-%H%M).tar.gz" -C dados assist
ls -1t backups/assist/*.tar.gz | tail -n +31 | xargs -r rm -f
if [ -n "${DESTINO_EXTERNO:-}" ]; then
  echo "▶ Copiando para ${DESTINO_EXTERNO}"
  rsync -a --delete backups/ "${DESTINO_EXTERNO%/}/"
fi
echo "✔ Backup concluído"
