#!/usr/bin/env bash
# Instala o ecossistema Nexor de UMA empresa num servidor Linux (Ubuntu 22.04/24.04 ou Debian 12).
# Uso (na pasta implantacao/ do repositório):
#   ./instalar.sh                 → Nexor RH + backup diário + HTTPS pela Cloudflare (recomendado)
#   PERFIS="tunel agente" ./instalar.sh   → também o Nexor Agente
#   PERFIS="caddy" ./instalar.sh  → HTTPS com portas 80/443 abertas, em vez do túnel
set -euo pipefail
cd "$(dirname "$0")"

PERFIS="${PERFIS:-tunel}"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
erro() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  say "Instalando o Docker (script oficial em get.docker.com)"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || erro "O plugin 'docker compose' não está disponível. Atualize o Docker."

# 2. Configuração da empresa (.env)
if [ ! -f .env ]; then
  say "Criando o .env desta empresa"
  cp .env.exemplo .env
  read -rp "Identificador da empresa (ex.: padaria-pao-dourado): " EMPRESA
  read -rp "Endereço do Nexor RH (ex.: rh.paodourado.com.br): " DOMINIO
  [[ "$EMPRESA" =~ ^[a-z0-9-]{3,40}$ ]] || erro "Identificador inválido: use letras minúsculas, números e hífen."
  [[ "$DOMINIO" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || erro "Endereço inválido."
  CHAVE="$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-56)"
  sed -i "s|^EMPRESA=.*|EMPRESA=${EMPRESA}|; s|^RH_PUBLIC_URL=.*|RH_PUBLIC_URL=https://${DOMINIO}|; s|^RH_DOMINIO=.*|RH_DOMINIO=${DOMINIO}|; s|^RH_MASTER_KEY=.*|RH_MASTER_KEY=${CHAVE}|" .env
  if [[ " $PERFIS " == *" tunel "* ]]; then
    read -rsp "Token do Cloudflare Tunnel (Zero Trust → Networks → Tunnels → seu túnel): " TOKEN; echo
    sed -i "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=${TOKEN}|" .env
  fi
  read -rp "Código do cliente na Nexor Central (NX-XXXX-XXXX, Enter para pular): " NXCOD
  if [ -n "$NXCOD" ]; then
    sed -i "s|^NEXOR_CODIGO=.*|NEXOR_CODIGO=${NXCOD}|" .env
    read -rp "Endereço da sua Nexor Central (Enter = https://central.nexorconsultingit.com.br): " NXURL
    [ -n "$NXURL" ] && sed -i "s|^NEXOR_CENTRAL_URL=.*|NEXOR_CENTRAL_URL=${NXURL%/}|" .env
  fi
  chmod 600 .env
  printf '\n\033[1;33m⚠ GUARDE AGORA no cofre da Nexor a RH_MASTER_KEY do arquivo .env.\n  Sem ela, o certificado digital e os arquivos dos colaboradores não podem ser lidos (nem pelos backups).\033[0m\n'
  read -rp "Já guardou a chave? (s/n) " OK
  [[ "$OK" =~ ^[sS] ]] || erro "Instalação interrompida: guarde a chave e rode de novo (o .env já foi criado)."
fi

mkdir -p backups
# o backup roda como o usuário node (uid 1000) do container
chown 1000:1000 backups 2>/dev/null || chmod 777 backups

# 3. Subir
ARGS=()
for p in $PERFIS; do ARGS+=(--profile "$p"); done
say "Construindo e subindo os sistemas (${PERFIS})"
docker compose "${ARGS[@]}" up -d --build

# 4. Esperar o Nexor RH responder
say "Conferindo o Nexor RH"
for i in $(seq 1 30); do
  if docker compose exec -T rh node -e "fetch('http://127.0.0.1:8791/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then OKRH=1; break; fi
  sleep 2
done
[ "${OKRH:-}" = 1 ] || { docker compose logs --tail 50 rh; erro "O Nexor RH não respondeu. Veja o log acima."; }

CODIGO="$(docker compose exec -T rh sh -c 'cat /dados/codigo-instalacao.txt 2>/dev/null' || true)"
DOMINIO="$(grep '^RH_DOMINIO=' .env | cut -d= -f2)"
say "Pronto!"
echo "  Painel do RH:            https://${DOMINIO}"
echo "  App do colaborador:      https://${DOMINIO}/app/"
[ -n "$CODIGO" ] && echo "  Código de instalação:    ${CODIGO}   (use para criar o primeiro administrador)"
echo "  Backups diários em:      $(pwd)/backups   (copie para fora do servidor: ver README)"
echo "  Ver situação:            docker compose ps"
