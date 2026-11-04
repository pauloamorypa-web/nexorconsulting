#!/usr/bin/env bash
# Roda DENTRO do Ubuntu do WSL (notebook ou servidor Windows), uma vez, antes do instalar.sh.
# Liga o systemd (necessário para o Docker subir sozinho) e instala o Docker Engine.
# Uso:  sudo bash preparar-ubuntu-wsl.sh   → depois, no PowerShell:  wsl --shutdown   → abra o Ubuntu de novo
set -euo pipefail

if ! grep -q "systemd=true" /etc/wsl.conf 2>/dev/null; then
  printf '[boot]\nsystemd=true\n' >> /etc/wsl.conf
  echo "systemd ativado em /etc/wsl.conf"
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl git openssl rsync
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker >/dev/null 2>&1 || true

echo
echo "Pronto. Agora, no PowerShell do Windows:  wsl --shutdown"
echo "Abra o Ubuntu de novo e siga o guia (instalar.sh)."
