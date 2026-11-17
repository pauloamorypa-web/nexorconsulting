#!/usr/bin/env bash
# Instala a borda da Nuvem Nexor na VPS (rode depois de interno/instalar.sh). Uso: sudo ./instalar.sh
# Pode rodar de novo quando quiser: só confere e sobe.
set -euo pipefail
cd "$(dirname "$0")"
say() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
erro() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }
command -v docker >/dev/null || erro "Docker não encontrado. Rode antes: ../interno/instalar.sh"
mkdir -p sites
say "Rede da borda"
docker network create nexor-borda >/dev/null 2>&1 || true
say "Conferindo a configuração"
docker compose run --rm --no-deps borda caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null || erro "Configuração da borda inválida (veja o Caddyfile e sites/)."
say "Subindo a borda"
docker compose up -d
docker compose ps
say "Pronto"
echo "  Na Cloudflare (túnel do servidor interno), confira o endereço curinga:"
echo "    *.nexorconsultingit.com.br  →  http://borda:80"
echo "  Cliente novo na nuvem:  cd ../implantacao && SISTEMAS=\"barber\" ./nova-empresa.sh nome-do-cliente auto"
echo "  Endereços ligados:      ./subdominio.sh listar"
