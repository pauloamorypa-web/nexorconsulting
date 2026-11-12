#!/usr/bin/env bash
# Copia o padrão das telas de acesso (assets/acesso/) para a pasta public de cada sistema.
# Rode na raiz do repositório depois de mudar assets/acesso/. Não edite as cópias.
set -euo pipefail
for p in atende rh contabil barber central elo nexor-agente; do
  mkdir -p "$p/public/acesso"
  cp assets/acesso/fundo-rede.js assets/acesso/acesso.css "$p/public/acesso/"
  echo "ok  $p/public/acesso"
done
