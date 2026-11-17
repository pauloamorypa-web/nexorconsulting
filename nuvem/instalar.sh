#!/usr/bin/env bash
# Instala a borda da Nuvem Nexor (clientes hospedados). Uso: sudo ./instalar.sh
#   VPS única (Central, Blue e clientes juntos): rode depois de ../interno/instalar.sh. Usa o túnel do interno.
#   VPS só de clientes (recomendado com mais de 10 clientes): rode sozinho. Pede o token de um túnel próprio.
# Pode rodar de novo quando quiser: só confere e sobe.
set -euo pipefail
cd "$(dirname "$0")"
say() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
erro() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }

if ! command -v docker >/dev/null; then
  say "Instalando o Docker"
  curl -fsSL https://get.docker.com | sh
fi
mkdir -p sites
docker network create nexor-borda >/dev/null 2>&1 || true

# Modo: se o servidor interno está nesta máquina, usa o túnel dele
if [ -f ../interno/.env ] && docker ps --format '{{.Names}}' | grep -q '^nexor-interno-tunel'; then
  MODO="unica"
else
  MODO="separada"
  if [ ! -f .env ] || ! grep -q '^TUNNEL_TOKEN=.\+' .env; then
    say "VPS só de clientes: túnel próprio"
    echo "Cole o token do túnel da Cloudflare desta VPS (Zero Trust → Tunnels → nexor-clientes)."
    echo "Ele fica só em nuvem/.env, nesta máquina."
    read -rsp "Token: " TOK; echo
    [ -n "$TOK" ] || erro "Token vazio."
    umask 077; printf 'TUNNEL_TOKEN=%s\n' "$TOK" > .env
  fi
  chmod 600 .env
fi

say "Conferindo a configuração"
docker compose run --rm --no-deps borda caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null || erro "Configuração da borda inválida (veja o Caddyfile e sites/)."

say "Subindo a borda (modo: VPS ${MODO})"
if [ "$MODO" = "separada" ]; then docker compose --profile tunel up -d; else docker compose up -d; fi
docker compose ps

say "Pronto"
if [ "$MODO" = "separada" ]; then
  echo "  Na Cloudflare, no túnel desta VPS:  *.nexorconsultingit.com.br  →  http://borda:80"
  echo "  E tire o curinga * do túnel da VPS da Nexor (lá ficam só central e api)."
else
  echo "  Na Cloudflare, no túnel do servidor interno:  *.nexorconsultingit.com.br  →  http://borda:80"
fi
echo "  Cliente novo:       cd ../implantacao && SISTEMAS=\"barber\" sudo -E ./nova-empresa.sh nome-do-cliente auto"
echo "  Backup externo:     sudo ./backup-externo.sh --agendar   (veja o README)"
echo "  Endereços ligados:  ./subdominio.sh listar"
