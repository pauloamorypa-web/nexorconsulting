#!/usr/bin/env bash
# Servidor da Nexor (ou servidor de um cliente com várias empresas): cria o ecossistema de UMA empresa nova,
# isolado das outras (rede, volumes, chaves, backups e domínio próprios).
#
# Uso:  ./nova-empresa.sh padaria-pao-dourado rh.paodourado.com.br [token-do-tunel]
#       SISTEMAS="contabil" ./nova-empresa.sh lima-contabilidade contabil.limacontabil.com.br [token]
#       SISTEMAS="barber" ./nova-empresa.sh barbearia-navalha agenda.navalha.com.br [token]
#       (com dois sistemas, informe DOMINIO_CONTABIL=... ou DOMINIO_BARBER=... para o segundo endereço)
# Depois, para administrar essa empresa:
#   ./empresa.sh padaria-pao-dourado ps | logs rh | up -d --build | down
set -euo pipefail
cd "$(dirname "$0")"

SLUG="${1:?informe o identificador da empresa, ex.: padaria-pao-dourado}"
DOMINIO="${2:?informe o endereço do sistema, ex.: rh.paodourado.com.br}"
SISTEMAS="${SISTEMAS:-rh}"
TOKEN="${3:-}"
[[ "$SLUG" =~ ^[a-z0-9-]{3,40}$ ]] || { echo "Identificador inválido"; exit 1; }
DIR="clientes/${SLUG}"
[ -e "$DIR/.env" ] && { echo "A empresa ${SLUG} já existe em ${DIR}"; exit 1; }

mkdir -p "$DIR/backups"
chown 1000:1000 "$DIR/backups" 2>/dev/null || chmod 777 "$DIR/backups"
cp conectores.json "$DIR/conectores.json"
chave() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-56; }
DOM_RH="$DOMINIO"
DOM_CONTABIL="${DOMINIO_CONTABIL:-$DOMINIO}"
DOM_BARBER="${DOMINIO_BARBER:-$DOMINIO}"
[[ " $SISTEMAS " != *" rh "* ]] && DOM_RH=""
sed -e "s|^EMPRESA=.*|EMPRESA=${SLUG}|" \
    -e "s|^SISTEMAS=.*|SISTEMAS=${SISTEMAS}|" \
    -e "s|^RH_PUBLIC_URL=.*|RH_PUBLIC_URL=${DOM_RH:+https://${DOM_RH}}|" \
    -e "s|^RH_DOMINIO=.*|RH_DOMINIO=${DOM_RH}|" \
    -e "s|^RH_MASTER_KEY=.*|RH_MASTER_KEY=$(chave)|" \
    -e "s|^CONTABIL_PUBLIC_URL=.*|CONTABIL_PUBLIC_URL=https://${DOM_CONTABIL}|" \
    -e "s|^CONTABIL_DOMINIO=.*|CONTABIL_DOMINIO=${DOM_CONTABIL}|" \
    -e "s|^CONTABIL_MASTER_KEY=.*|CONTABIL_MASTER_KEY=$(chave)|" \
    -e "s|^BARBER_PUBLIC_URL=.*|BARBER_PUBLIC_URL=https://${DOM_BARBER}|" \
    -e "s|^BARBER_DOMINIO=.*|BARBER_DOMINIO=${DOM_BARBER}|" \
    -e "s|^BARBER_MASTER_KEY=.*|BARBER_MASTER_KEY=$(chave)|" \
    -e "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=${TOKEN}|" \
    -e "s|^BACKUP_PASTA=.*|BACKUP_PASTA=./${DIR}/backups|" \
    -e "s|^CONECTORES_ARQUIVO=.*|CONECTORES_ARQUIVO=./${DIR}/conectores.json|" \
    .env.exemplo > "$DIR/.env"
chmod 600 "$DIR/.env"

ARQ_ENV="$DIR/.env"
. ./perfis.sh
docker compose -p "nexor-${SLUG}" --env-file "$DIR/.env" "${ARGS_PERFIS[@]}" up -d --build

echo
echo "✔ Empresa ${SLUG} criada."
echo "  ⚠ Guarde no cofre da Nexor as chaves *_MASTER_KEY de ${DIR}/.env"
sleep 5
for s in $LISTA_SISTEMAS; do
  case "$s" in rh) D="$DOM_RH" ;; contabil) D="$DOM_CONTABIL" ;; barber) D="$DOM_BARBER" ;; esac
  echo "  ${s}: https://${D} · código de instalação: $(docker compose -p "nexor-${SLUG}" --env-file "$DIR/.env" "${ARGS_PERFIS[@]}" exec -T "$s" cat /dados/codigo-instalacao.txt 2>/dev/null || echo "veja com ./empresa.sh ${SLUG} exec ${s} cat /dados/codigo-instalacao.txt")"
done
