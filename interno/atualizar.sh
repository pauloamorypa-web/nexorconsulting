#!/usr/bin/env bash
# Atualiza o servidor interno para a versão do repositório (backup antes). Uso: sudo ./atualizar.sh
set -euo pipefail
cd "$(dirname "$0")"
./backup.sh
git -C .. pull --ff-only
docker network create nexor-borda >/dev/null 2>&1 || true  # rede da borda da Nuvem Nexor (nuvem/)
docker compose up -d --build
docker compose ps
