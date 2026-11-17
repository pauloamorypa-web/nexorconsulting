#!/usr/bin/env bash
# Depois de ligar o Cloudflare Access na Central, confere se o que precisa ficar público continua público
# e se o painel ficou protegido. Rode de qualquer computador:  ./conferir-acesso.sh central.nexorconsultingit.com.br
set -uo pipefail
H="${1:-central.nexorconsultingit.com.br}"
ok=0; falhou=0
teste() { # nome, caminho, método, esperado (publico|protegido)
  local cod loc
  cod="$(curl -s -o /dev/null -w '%{http_code}' -X "$3" --max-time 15 "https://${H}$2")"
  loc="$(curl -s -o /dev/null -w '%{redirect_url}' -X "$3" --max-time 15 "https://${H}$2")"
  if [ "$4" = "protegido" ]; then
    if [[ "$loc" == *cloudflareaccess.com* ]] || [ "$cod" = "403" ]; then echo "✔ $1: protegido"; ok=$((ok+1)); else echo "✖ $1: ABERTO (HTTP $cod)"; falhou=$((falhou+1)); fi
  else
    if [[ "$loc" == *cloudflareaccess.com* ]]; then echo "✖ $1: BLOQUEADO pelo Access (precisa ficar público)"; falhou=$((falhou+1)); else echo "✔ $1: público (HTTP $cod)"; ok=$((ok+1)); fi
  fi
}
teste "Painel da Central"                 "/"                         GET  protegido
teste "API do painel"                     "/api/estado"               GET  protegido
teste "Saúde"                             "/health"                   GET  publico
teste "Licença dos sistemas (vincular)"   "/api/v1/vincular"          POST publico
teste "Licença dos sistemas (sincronizar)" "/api/v1/sincronizar"      POST publico
teste "Webhook do Asaas"                  "/api/webhooks/asaas"       POST publico
teste "Portal do parceiro (página)"       "/parceiro/"                GET  publico
teste "Portal do parceiro (dados)"        "/api/portal-parceiro"      GET  publico
teste "Arquivos do portal"                "/js/ui.js"                 GET  publico
echo; echo "Certos: $ok · com problema: $falhou"
[ "$falhou" = 0 ]
