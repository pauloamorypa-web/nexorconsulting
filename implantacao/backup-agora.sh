#!/usr/bin/env bash
# Faz um backup na hora de cada sistema desta empresa e, se configurado, copia para fora do servidor.
# Cópia externa (recomendada, regra 3-2-1): defina DESTINO_EXTERNO, por exemplo
#   DESTINO_EXTERNO="usuario@servidor-backup:/backups/empresa"   (rsync por SSH)
#   DESTINO_EXTERNO="/mnt/hd-externo/nexor"                     (HD/NAS montado)
# Para agendar todo dia às 23h:  crontab -e  →  0 23 * * * /caminho/implantacao/backup-agora.sh >> /var/log/nexor-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
. ./perfis.sh
for s in $LISTA_SISTEMAS; do
  docker compose "${ARGS_PERFIS[@]}" exec -T "$(backup_de "$s")" node --disable-warning=ExperimentalWarning scripts/backup.js
done
if [ -n "${DESTINO_EXTERNO:-}" ]; then
  echo "▶ Copiando para ${DESTINO_EXTERNO}"
  rsync -a --delete backups/ "${DESTINO_EXTERNO%/}/"
fi
echo "✔ Backup concluído"
