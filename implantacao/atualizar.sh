#!/usr/bin/env bash
# Atualiza os sistemas Nexor desta empresa para a versão mais nova do repositório,
# fazendo um backup antes. Os dados ficam nos volumes e não são apagados.
# Uso: ./atualizar.sh            (mesmos perfis da instalação: PERFIS="tunel agente" ./atualizar.sh)
set -euo pipefail
cd "$(dirname "$0")"
PERFIS="${PERFIS:-tunel}"
ARGS=()
for p in $PERFIS; do ARGS+=(--profile "$p"); done

echo "▶ Backup antes de atualizar"
docker compose exec -T -e BACKUP_DIR=/dados/backups-atualizacao rh node --disable-warning=ExperimentalWarning scripts/backup.js

echo "▶ Baixando a versão nova"
git -C .. pull --ff-only

echo "▶ Reconstruindo e reiniciando"
docker compose "${ARGS[@]}" up -d --build

docker compose ps
echo "✔ Atualizado. Se algo der errado: git -C .. checkout <versão anterior> && ./atualizar.sh"
