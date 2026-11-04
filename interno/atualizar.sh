#!/usr/bin/env bash
# Atualiza o servidor interno para a versão do repositório (backup antes). Uso: sudo ./atualizar.sh
set -euo pipefail
cd "$(dirname "$0")"
./backup.sh
git -C .. pull --ff-only
docker compose up -d --build
docker compose ps
