#!/usr/bin/env bash
# Atalho para administrar o ecossistema de uma empresa criada com nova-empresa.sh.
# Os sistemas vêm de SISTEMAS no .env da empresa. Exemplos:
#   ./empresa.sh padaria-pao-dourado ps
#   ./empresa.sh padaria-pao-dourado logs -f rh
#   ./empresa.sh lima-contabilidade logs -f contabil
#   PERFIS="tunel agente" ./empresa.sh padaria-pao-dourado up -d --build
set -euo pipefail
cd "$(dirname "$0")"
SLUG="${1:?informe o identificador da empresa}"
shift
DIR="clientes/${SLUG}"
[ -f "$DIR/.env" ] || { echo "Empresa ${SLUG} não encontrada em ${DIR}"; exit 1; }
ARQ_ENV="$DIR/.env"
. ./perfis.sh
exec docker compose -p "nexor-${SLUG}" --env-file "$DIR/.env" "${ARGS_PERFIS[@]}" "$@"
