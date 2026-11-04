#!/usr/bin/env bash
# Instala os sistemas Nexor de UMA empresa num servidor Linux (Ubuntu 22.04/24.04 ou Debian 12).
# Uso (na pasta implantacao/ do repositório):
#   sudo ./instalar.sh                          → pergunta os sistemas (Nexor RH e/ou Nexor Contábil) + HTTPS pela Cloudflare
#   sudo SISTEMAS="contabil" ./instalar.sh       → só o Nexor Contábil (escritório de contabilidade)
#   sudo PERFIS="tunel agente" ./instalar.sh     → também o Nexor Agente
#   sudo PERFIS="caddy" ./instalar.sh            → HTTPS com portas 80/443 abertas, em vez do túnel
# Rodar de novo com o .env já criado só reconstrói e sobe (sem perguntar nada).
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
erro() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
chave() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-56; }

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
  [[ "$EMPRESA" =~ ^[a-z0-9-]{3,40}$ ]] || erro "Identificador inválido: use letras minúsculas, números e hífen."
  if [ -z "${SISTEMAS:-}" ]; then read -rp "Sistemas desta empresa (rh, contabil ou 'rh contabil') [rh]: " SISTEMAS; fi
  SISTEMAS="${SISTEMAS:-rh}"
  for s in $SISTEMAS; do [[ "$s" =~ ^(rh|contabil)$ ]] || erro "Sistema desconhecido: $s (use rh e/ou contabil)."; done
  sed -i "s|^EMPRESA=.*|EMPRESA=${EMPRESA}|; s|^SISTEMAS=.*|SISTEMAS=${SISTEMAS}|" .env
  for s in $SISTEMAS; do
    case "$s" in
      rh) read -rp "Endereço do Nexor RH (ex.: rh.paodourado.com.br): " DOM; P=RH ;;
      contabil) read -rp "Endereço do Nexor Contábil (ex.: contabil.limacontabilidade.com.br): " DOM; P=CONTABIL ;;
    esac
    [[ "$DOM" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || erro "Endereço inválido."
    sed -i "s|^${P}_PUBLIC_URL=.*|${P}_PUBLIC_URL=https://${DOM}|; s|^${P}_DOMINIO=.*|${P}_DOMINIO=${DOM}|; s|^${P}_MASTER_KEY=.*|${P}_MASTER_KEY=$(chave)|" .env
  done
  if [[ " $SISTEMAS " == *" contabil "* ]]; then
    read -rsp "Chave da Anthropic do escritório (leitura de documentos e WhatsApp; Enter para pular): " AK; echo
    [ -n "$AK" ] && sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${AK}|" .env
  fi
  if [[ " ${PERFIS:-tunel} " == *" tunel "* ]]; then
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
  printf '\n\033[1;33m⚠ GUARDE AGORA no cofre da Nexor as chaves *_MASTER_KEY do arquivo .env.\n  Sem elas, os arquivos e certificados guardados no sistema não podem ser lidos (nem pelos backups).\033[0m\n'
  read -rp "Já guardou as chaves? (s/n) " OK
  [[ "$OK" =~ ^[sS] ]] || erro "Instalação interrompida: guarde as chaves e rode de novo (o .env já foi criado)."
fi

. ./perfis.sh
mkdir -p backups
# o backup roda como o usuário node (uid 1000) do container
chown 1000:1000 backups 2>/dev/null || chmod 777 backups

# 3. Subir
say "Construindo e subindo: ${LISTA_SISTEMAS} (${PERFIS})"
docker compose "${ARGS_PERFIS[@]}" up -d --build

# 4. Conferir cada sistema e mostrar o código de instalação
say "Pronto!"
for s in $LISTA_SISTEMAS; do
  PORTA="$(porta_de "$s")"
  OKS=""
  for i in $(seq 1 30); do
    if docker compose exec -T "$s" node -e "fetch('http://127.0.0.1:${PORTA}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then OKS=1; break; fi
    sleep 2
  done
  [ "$OKS" = 1 ] || { docker compose logs --tail 50 "$s"; erro "O sistema $s não respondeu. Veja o log acima."; }
  P="$( [ "$s" = rh ] && echo RH || echo CONTABIL )"
  DOM="$(grep "^${P}_DOMINIO=" .env | cut -d= -f2)"
  COD="$(docker compose exec -T "$s" sh -c 'cat /dados/codigo-instalacao.txt 2>/dev/null' || true)"
  if [ "$s" = rh ]; then
    echo "  Nexor RH:                https://${DOM}   (app do colaborador: https://${DOM}/app/)"
  else
    echo "  Nexor Contábil:          https://${DOM}   (portal dos clientes: https://${DOM}/portal/)"
  fi
  [ -n "$COD" ] && echo "    Código de instalação:  ${COD}   (use para criar o primeiro usuário)"
done
echo "  Backups diários em:      $(pwd)/backups   (copie para fora do servidor: ver README)"
echo "  Ver situação:            docker compose ${ARGS_PERFIS[*]} ps"
