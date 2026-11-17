#!/usr/bin/env bash
# Servidor da Nexor (ou servidor de um cliente com várias empresas): cria o ecossistema de UMA empresa nova,
# isolado das outras (rede, volumes, chaves, backups e domínio próprios).
#
# Uso:  ./nova-empresa.sh padaria-pao-dourado rh.paodourado.com.br [token-do-tunel]
#       SISTEMAS="contabil" ./nova-empresa.sh lima-contabilidade contabil.limacontabil.com.br [token]
#       SISTEMAS="barber" ./nova-empresa.sh barbearia-navalha agenda.navalha.com.br [token]
#       (com dois sistemas, informe DOMINIO_CONTABIL=... ou DOMINIO_BARBER=... para o segundo endereço)
#
# Nuvem Nexor (VPS da Nexor, cliente sem servidor e sem domínio): use "auto" no lugar do endereço.
#       SISTEMAS="barber" ./nova-empresa.sh barbearia-navalha auto
#   → https://barbearia-navalha.nexorconsultingit.com.br, ligado na borda (nuvem/) sem túnel próprio.
#   Com dois sistemas, o segundo vira <empresa>-<sistema>.nexorconsultingit.com.br.
#   Domínio próprio do cliente na Nuvem Nexor: NUVEM=1 ./nova-empresa.sh slug agenda.cliente.com.br
# Depois, para administrar essa empresa:
#   ./empresa.sh padaria-pao-dourado ps | logs rh | up -d --build | down
set -euo pipefail
cd "$(dirname "$0")"

SLUG="${1:?informe o identificador da empresa, ex.: padaria-pao-dourado}"
DOMINIO="${2:?informe o endereço do sistema, ex.: rh.paodourado.com.br}"
SISTEMAS="${SISTEMAS:-rh}"
TOKEN="${3:-}"
[[ "$SLUG" =~ ^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$ ]] || { echo "Identificador inválido (letras minúsculas, números e hífen)"; exit 1; }
NUVEM="${NUVEM:-}"
NUVEM_DOMINIO="${NUVEM_DOMINIO:-nexorconsultingit.com.br}"
if [ "$DOMINIO" = "auto" ]; then
  NUVEM=1
  PRIMEIRO="$(echo "$SISTEMAS" | awk '{print $1}')"
  DOMINIO="${SLUG}.${NUVEM_DOMINIO}"
  for s in $SISTEMAS; do
    [ "$s" = "$PRIMEIRO" ] && continue
    case "$s" in
      contabil) DOMINIO_CONTABIL="${DOMINIO_CONTABIL:-${SLUG}-contabil.${NUVEM_DOMINIO}}" ;;
      barber) DOMINIO_BARBER="${DOMINIO_BARBER:-${SLUG}-barber.${NUVEM_DOMINIO}}" ;;
      rh) echo "Na Nuvem Nexor, coloque o rh primeiro em SISTEMAS"; exit 1 ;;
    esac
  done
fi
if [ "$NUVEM" = "1" ]; then
  docker network inspect nexor-borda >/dev/null 2>&1 || { echo "A borda da Nuvem Nexor não está instalada. Rode antes: ../nuvem/instalar.sh"; exit 1; }
  [ -z "$TOKEN" ] || echo "Aviso: na Nuvem Nexor o túnel é o do servidor; o token informado será ignorado."
  TOKEN=""
fi
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
    -e "s|^NUVEM=.*|NUVEM=${NUVEM}|" \
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

# Nuvem Nexor: liga cada endereço ao sistema na borda
if [ "$NUVEM" = "1" ]; then
  for s in $LISTA_SISTEMAS; do
    case "$s" in rh) D="$DOM_RH" ;; contabil) D="$DOM_CONTABIL" ;; barber) D="$DOM_BARBER" ;; *) continue ;; esac
    ../nuvem/subdominio.sh ligar "$D" "${SLUG}-${s}:$(porta_de "$s")"
  done
fi

echo
echo "✔ Empresa ${SLUG} criada."
echo "  ⚠ Guarde no cofre da Nexor as chaves *_MASTER_KEY de ${DIR}/.env"
sleep 5
for s in $LISTA_SISTEMAS; do
  case "$s" in rh) D="$DOM_RH" ;; contabil) D="$DOM_CONTABIL" ;; barber) D="$DOM_BARBER" ;; esac
  echo "  ${s}: https://${D} · código de instalação: $(docker compose -p "nexor-${SLUG}" --env-file "$DIR/.env" "${ARGS_PERFIS[@]}" exec -T "$s" cat /dados/codigo-instalacao.txt 2>/dev/null || echo "veja com ./empresa.sh ${SLUG} exec ${s} cat /dados/codigo-instalacao.txt")"
done
