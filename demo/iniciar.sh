#!/usr/bin/env sh
# Demonstração Nexor (Mac e Linux): sobe todos os sistemas com dados fictícios e abre o navegador.
# Uso: ./demo/iniciar.sh            ou só alguns: ./demo/iniciar.sh barber rh
cd "$(dirname "$0")/.." || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Instale o Node 22 ou mais novo (nodejs.org) e rode de novo."
  exit 1
fi
exec node demo/iniciar.mjs "$@"
