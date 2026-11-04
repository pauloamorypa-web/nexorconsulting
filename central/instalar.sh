#!/usr/bin/env bash
# Instala (ou atualiza) a Nexor Central num servidor Linux (Ubuntu 22.04/24.04 ou Debian 12).
# Uso, na pasta central/ do repositório:
#   sudo ./instalar.sh              → Central + backup diário + HTTPS pelo túnel da Cloudflare (recomendado)
#   sudo SEM_TUNEL=1 ./instalar.sh  → sem túnel: publique 127.0.0.1:8800 no nginx/Caddy que o servidor já tem
# Rodar de novo atualiza para a versão do repositório (git pull antes) sem apagar dados.
set -euo pipefail
cd "$(dirname "$0")"
say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
erro() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

if ! command -v docker >/dev/null 2>&1; then
  say "Instalando o Docker (script oficial em get.docker.com)"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || erro "O plugin 'docker compose' não está disponível. Atualize o Docker."

if [ ! -f .env ]; then
  say "Configurando a Nexor Central"
  cp .env.exemplo .env
  read -rp "Endereço da Central (ex.: central.nexorconsultingit.com.br): " DOMINIO
  [[ "$DOMINIO" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || erro "Endereço inválido."
  CHAVE="$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-56)"
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://${DOMINIO}|; s|^MASTER_KEY=.*|MASTER_KEY=${CHAVE}|" .env
  if [ -z "${SEM_TUNEL:-}" ]; then
    read -rsp "Token do túnel da Cloudflare (Public Hostname ${DOMINIO} → http://central:8800): " TOKEN; echo
    sed -i "s|^TUNNEL_TOKEN=.*|TUNNEL_TOKEN=${TOKEN}|" .env
  fi
  read -rp "WhatsApp de suporte da Nexor, só números com 55 (aparece na tela de sistema suspenso): " ZAP
  [ -n "$ZAP" ] && sed -i "s|^SUPPORT_WHATSAPP=.*|SUPPORT_WHATSAPP=${ZAP}|" .env
  chmod 600 .env
  printf '\n\033[1;33m⚠ GUARDE AGORA no cofre a MASTER_KEY do arquivo .env (protege o 2FA da equipe).\033[0m\n'
  read -rp "Já guardou? (s/n) " OK
  [[ "$OK" =~ ^[sS] ]] || erro "Instalação interrompida: guarde a chave e rode de novo (o .env já foi criado)."
fi

mkdir -p backups
chown 1000:1000 backups 2>/dev/null || chmod 777 backups

ARGS=()
grep -q '^TUNNEL_TOKEN=.\+' .env && [ -z "${SEM_TUNEL:-}" ] && ARGS+=(--profile tunel)
say "Construindo e subindo a Central"
docker compose "${ARGS[@]}" up -d --build

say "Conferindo"
for i in $(seq 1 30); do
  if docker compose exec -T central node -e "fetch('http://127.0.0.1:8800/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then OKC=1; break; fi
  sleep 2
done
[ "${OKC:-}" = 1 ] || { docker compose logs --tail 50 central; erro "A Central não respondeu. Veja o log acima."; }

URL="$(grep '^PUBLIC_URL=' .env | cut -d= -f2)"
CODIGO="$(docker compose exec -T central sh -c 'cat /dados/codigo-instalacao.txt 2>/dev/null' || true)"
say "Nexor Central no ar"
echo "  Endereço:               ${URL}"
[ -n "$CODIGO" ] && echo "  Código de instalação:   ${CODIGO}   (crie a conta do Dono com ele e ative o 2FA)"
echo "  Backups diários em:     $(pwd)/backups   (copie para fora do servidor junto com a chave-licenca.pem)"
echo "  Atualizar depois:       git pull && sudo ./instalar.sh"
echo "  Logs:                   docker compose logs -f central"
