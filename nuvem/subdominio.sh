#!/usr/bin/env bash
# Liga um endereço a um sistema na borda da Nuvem Nexor.
# Uso:
#   ./subdominio.sh ligar  paodourado.nexorconsultingit.com.br paodourado-rh:8791
#   ./subdominio.sh ligar  central.nexorconsultingit.com.br central:8800
#   ./subdominio.sh desligar paodourado.nexorconsultingit.com.br
#   ./subdominio.sh listar
# O destino é o apelido do container na rede nexor-borda e a porta do sistema.
set -euo pipefail
cd "$(dirname "$0")"
ACAO="${1:-listar}"
recarregar() { docker compose exec -T borda caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null; }
case "$ACAO" in
  ligar)
    HOST="${2:?informe o endereço, ex.: paodourado.nexorconsultingit.com.br}"
    DEST="${3:?informe o destino, ex.: paodourado-rh:8791}"
    [[ "$HOST" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || { echo "Endereço inválido: $HOST"; exit 1; }
    [[ "$DEST" =~ ^[a-z0-9][a-z0-9-]{0,62}:[0-9]{2,5}$ ]] || { echo "Destino inválido: $DEST (use apelido:porta)"; exit 1; }
    printf 'http://%s {\n\tencode gzip\n\treverse_proxy %s\n}\n' "$HOST" "$DEST" > "sites/${HOST}.caddy"
    recarregar
    echo "✔ ${HOST} → ${DEST}"
    ;;
  desligar)
    HOST="${2:?informe o endereço}"
    [[ "$HOST" =~ ^[a-z0-9.-]+$ ]] || { echo "Endereço inválido"; exit 1; }
    rm -f "sites/${HOST}.caddy"
    recarregar
    echo "✔ ${HOST} desligado"
    ;;
  listar)
    for f in sites/*.caddy; do [ -e "$f" ] || continue; h="$(basename "$f" .caddy)"; d="$(grep -o 'reverse_proxy [^ ]*' "$f" | cut -d' ' -f2)"; echo "${h} → ${d}"; done
    ;;
  *) echo "Ações: ligar, desligar, listar"; exit 1 ;;
esac
