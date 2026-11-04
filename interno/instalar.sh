#!/usr/bin/env bash
# Instala (ou atualiza) o servidor interno da Nexor: Nexor Central + Blue + túnel + backup diário.
# Uso, na pasta interno/ do repositório:  sudo ./instalar.sh
# Rodar de novo com o .env já criado só reconstrói e sobe (sem perguntar nada).
set -euo pipefail
cd "$(dirname "$0")"
say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
erro() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
gera() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-"${1:-56}"; }

if ! command -v docker >/dev/null 2>&1; then
  say "Instalando o Docker (script oficial em get.docker.com)"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || erro "O plugin 'docker compose' não está disponível. Atualize o Docker."

if [ ! -f .env ]; then
  say "Configurando o servidor interno"
  cp .env.exemplo .env
  read -rp "Domínio da Nexor [nexorconsultingit.com.br]: " DOM; DOM="${DOM:-nexorconsultingit.com.br}"
  [[ "$DOM" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || erro "Domínio inválido."
  sed -i "s|^CENTRAL_PUBLIC_URL=.*|CENTRAL_PUBLIC_URL=https://central.${DOM}|; s|^CENTRAL_MASTER_KEY=.*|CENTRAL_MASTER_KEY=$(gera)|; s|^REPORT_TOKEN=.*|REPORT_TOKEN=$(gera 40)|; s|^WHATSAPP_VERIFY_TOKEN=.*|WHATSAPP_VERIFY_TOKEN=$(gera 24)|" .env
  read -rsp "Token do túnel da Cloudflare: " TOK; echo
  sed -i "s|^TUNNEL_TOKEN=.*|TUNNEL_TOKEN=${TOK}|" .env
  read -rsp "Chave da Anthropic da Nexor (a Blue usa; Enter para pular): " AK; echo
  [ -n "$AK" ] && sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${AK}|" .env
  chmod 600 .env
  printf '\n\033[1;33m⚠ GUARDE AGORA no cofre: CENTRAL_MASTER_KEY e REPORT_TOKEN do arquivo .env.\033[0m\n'
  read -rp "Já guardou? (s/n) " OK
  [[ "$OK" =~ ^[sS] ]] || erro "Instalação interrompida: guarde e rode de novo (o .env já foi criado)."
fi

mkdir -p backups dados/assist
chown -R 1000:1000 backups dados 2>/dev/null || chmod -R 777 backups dados

say "Construindo e subindo"
docker compose up -d --build

say "Conferindo"
for s in central:8800 assist:8787; do
  n="${s%%:*}"; p="${s##*:}"; ok=""
  for i in $(seq 1 30); do
    docker compose exec -T "$n" node -e "fetch('http://127.0.0.1:${p}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && { ok=1; break; }
    sleep 2
  done
  [ "$ok" = 1 ] || { docker compose logs --tail 50 "$n"; erro "$n não respondeu."; }
done

URL="$(grep '^CENTRAL_PUBLIC_URL=' .env | cut -d= -f2)"
COD="$(docker compose exec -T central sh -c 'cat /dados/codigo-instalacao.txt 2>/dev/null' || true)"
say "Servidor interno no ar"
echo "  Nexor Central:          ${URL}"
[ -n "$COD" ] && echo "    Código de instalação: ${COD}"
echo "  Blue (API do site):     https://api.${URL#https://central.}   → coloque em assets/js/config.js (NEXOR_API_URL)"
echo "  Webhook do WhatsApp:    https://api.${URL#https://central.}/webhook/whatsapp · token: $(grep '^WHATSAPP_VERIFY_TOKEN=' .env | cut -d= -f2)"
echo "  Backups:                $(pwd)/backups"
