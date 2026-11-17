#!/usr/bin/env bash
# Cópia dos backups para FORA da VPS (regra 3-2-1: se a VPS sumir, os dados continuam salvos).
# Copia o que existir nesta máquina:
#   - servidor interno: banco da Central, chave das licenças e dados da Blue (roda o interno/backup.sh antes);
#   - clientes da Nuvem Nexor: implantacao/clientes/<cliente>/backups (o backup diário de cada um);
#   - rotas da borda: nuvem/sites.
# Destino em nuvem/backup.env (chmod 600), uma das duas formas:
#   DESTINO_EXTERNO="rclone:nexor-cripto:vps-1"        → rclone com remoto cifrado (recomendado; veja o README)
#   DESTINO_EXTERNO="usuario@servidor:/backups/vps-1"   → rsync por SSH (outro servidor com chave SSH)
# Uso:  sudo ./backup-externo.sh             (copia agora)
#       sudo ./backup-externo.sh --agendar   (todo dia às 3h, com log em /var/log/nexor-backup-externo.log)
set -euo pipefail
cd "$(dirname "$0")"
RAIZ="$(cd .. && pwd)"
[ -f backup.env ] && . ./backup.env
DESTINO="${DESTINO_EXTERNO:-}"
[ -n "$DESTINO" ] || { echo "✖ Defina DESTINO_EXTERNO em nuvem/backup.env (veja o README)."; exit 1; }

if [ "${1:-}" = "--agendar" ]; then
  echo "0 3 * * * root ${RAIZ}/nuvem/backup-externo.sh >> /var/log/nexor-backup-externo.log 2>&1" > /etc/cron.d/nexor-backup-externo
  chmod 644 /etc/cron.d/nexor-backup-externo
  echo "✔ Agendado todo dia às 3h. Log: /var/log/nexor-backup-externo.log"
  exit 0
fi

echo "▶ $(date '+%F %T') backup externo"
PACOTE="$(mktemp -d)"
trap 'rm -rf "$PACOTE"' EXIT
if [ -f "$RAIZ/interno/.env" ]; then
  (cd "$RAIZ/interno" && ./backup.sh) && ln -s "$RAIZ/interno/backups" "$PACOTE/interno"
fi
if [ -d "$RAIZ/implantacao/clientes" ]; then
  mkdir -p "$PACOTE/clientes"
  for d in "$RAIZ"/implantacao/clientes/*/backups; do
    [ -d "$d" ] || continue
    c="$(basename "$(dirname "$d")")"
    ln -s "$d" "$PACOTE/clientes/$c"
  done
fi
ln -s "$RAIZ/nuvem/sites" "$PACOTE/rotas-da-borda"

case "$DESTINO" in
  rclone:*)
    command -v rclone >/dev/null || { echo "✖ rclone não instalado: sudo apt install -y rclone"; exit 1; }
    rclone sync --copy-links --transfers 4 "$PACOTE/" "${DESTINO#rclone:}"
    ;;
  *)
    rsync -a --copy-links --delete -e "ssh -o BatchMode=yes" "$PACOTE/" "${DESTINO%/}/"
    ;;
esac
echo "✔ $(date '+%F %T') backup externo concluído em ${DESTINO%%:*}…"
