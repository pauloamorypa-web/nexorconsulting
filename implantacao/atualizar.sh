#!/usr/bin/env bash
# Atualiza os sistemas Nexor desta empresa para a versão mais nova do repositório, fazendo um backup antes.
# Os dados ficam nos volumes e não são apagados. Os sistemas vêm de SISTEMAS no .env (rh, contabil, barber).
# Uso: sudo ./atualizar.sh            (extras: PERFIS="tunel agente" ./atualizar.sh)
set -euo pipefail
cd "$(dirname "$0")"
. ./perfis.sh

for s in $LISTA_SISTEMAS; do
  echo "▶ Backup de $s antes de atualizar"
  docker compose "${ARGS_PERFIS[@]}" exec -T -e BACKUP_DIR=/dados/backups-atualizacao "$s" node --disable-warning=ExperimentalWarning scripts/backup.js || echo "  (sem backup: o $s ainda não estava no ar)"
done

echo "▶ Baixando a versão nova"
git -C .. pull --ff-only

echo "▶ Reconstruindo e reiniciando"
docker compose "${ARGS_PERFIS[@]}" up -d --build

docker compose "${ARGS_PERFIS[@]}" ps
echo "✔ Atualizado. Se algo der errado: git -C .. checkout <versão anterior> && ./atualizar.sh"
