# Lido pelos scripts: monta os perfis do docker compose a partir de SISTEMAS (do .env) + PERFIS (acesso e extras).
#   SISTEMAS: rh, contabil, barber (padrão: rh, como nas primeiras instalações)
#   PERFIS:   tunel (padrão), caddy, atende, agente
# Uso: ARQ_ENV=.env . ./perfis.sh  →  define ARGS_PERFIS e LISTA_SISTEMAS
ARQ_ENV="${ARQ_ENV:-.env}"
if [ -z "${SISTEMAS:-}" ] && [ -f "$ARQ_ENV" ]; then SISTEMAS="$(grep -E '^SISTEMAS=' "$ARQ_ENV" | tail -1 | cut -d= -f2- | tr -d '"')"; fi
LISTA_SISTEMAS="${SISTEMAS:-rh}"
# Nuvem Nexor (NUVEM=1 no .env): a empresa fica atrás da borda da VPS (nuvem/), sem túnel próprio
if [ -z "${NUVEM:-}" ] && [ -f "$ARQ_ENV" ]; then NUVEM="$(grep -E '^NUVEM=' "$ARQ_ENV" | tail -1 | cut -d= -f2- | tr -d '"')"; fi
ARGS_PERFIS=()
if [ "${NUVEM:-}" = "1" ]; then
  ARGS_PERFIS+=(-f docker-compose.yml -f nuvem.override.yml)
  PERFIS="${PERFIS:-}"
  PERFIS="$(echo " $PERFIS " | sed 's/ tunel / /g; s/ caddy / /g' | xargs)"
else
  PERFIS="${PERFIS:-tunel}"
fi
for p in $LISTA_SISTEMAS $PERFIS; do ARGS_PERFIS+=(--profile "$p"); done
porta_de() { case "$1" in rh) echo 8791 ;; contabil) echo 8793 ;; barber) echo 8795 ;; esac; }
backup_de() { case "$1" in rh) echo backup ;; contabil) echo backup-contabil ;; barber) echo backup-barber ;; esac; }
