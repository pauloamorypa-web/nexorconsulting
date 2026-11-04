#!/usr/bin/env bash
# Servidor da Nexor (ou servidor de um cliente com várias empresas): cria o ecossistema de UMA empresa nova,
# isolado das outras (rede, volumes, chaves, backups e domínio próprios).
#
# Uso:  ./nova-empresa.sh padaria-pao-dourado rh.paodourado.com.br [token-do-tunel]
# Depois, para administrar essa empresa:
#   ./empresa.sh padaria-pao-dourado ps | logs rh | up -d --build | down
set -euo pipefail
cd "$(dirname "$0")"

SLUG="${1:?informe o identificador da empresa, ex.: padaria-pao-dourado}"
DOMINIO="${2:?informe o endereço do Nexor RH, ex.: rh.paodourado.com.br}"
TOKEN="${3:-}"
[[ "$SLUG" =~ ^[a-z0-9-]{3,40}$ ]] || { echo "Identificador inválido"; exit 1; }
DIR="clientes/${SLUG}"
[ -e "$DIR/.env" ] && { echo "A empresa ${SLUG} já existe em ${DIR}"; exit 1; }

mkdir -p "$DIR/backups"
chown 1000:1000 "$DIR/backups" 2>/dev/null || chmod 777 "$DIR/backups"
cp conectores.json "$DIR/conectores.json"
CHAVE="$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-56)"
sed -e "s|^EMPRESA=.*|EMPRESA=${SLUG}|" \
    -e "s|^RH_PUBLIC_URL=.*|RH_PUBLIC_URL=https://${DOMINIO}|" \
    -e "s|^RH_DOMINIO=.*|RH_DOMINIO=${DOMINIO}|" \
    -e "s|^RH_MASTER_KEY=.*|RH_MASTER_KEY=${CHAVE}|" \
    -e "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=${TOKEN}|" \
    -e "s|^BACKUP_PASTA=.*|BACKUP_PASTA=./${DIR}/backups|" \
    -e "s|^CONECTORES_ARQUIVO=.*|CONECTORES_ARQUIVO=./${DIR}/conectores.json|" \
    .env.exemplo > "$DIR/.env"
chmod 600 "$DIR/.env"

PERFIS="${PERFIS:-tunel}"
ARGS=()
for p in $PERFIS; do ARGS+=(--profile "$p"); done
docker compose -p "nexor-${SLUG}" --env-file "$DIR/.env" "${ARGS[@]}" up -d --build

echo
echo "✔ Empresa ${SLUG} criada."
echo "  Painel: https://${DOMINIO}"
echo "  ⚠ Guarde no cofre da Nexor a RH_MASTER_KEY de ${DIR}/.env"
sleep 5
echo "  Código de instalação: $(docker compose -p "nexor-${SLUG}" --env-file "$DIR/.env" exec -T rh cat /dados/codigo-instalacao.txt 2>/dev/null || echo 'veja em alguns segundos com ./empresa.sh '"${SLUG}"' exec rh cat /dados/codigo-instalacao.txt')"
