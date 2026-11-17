#!/usr/bin/env bash
# Copia o módulo comum de bancos (assets/bancos/) para src/bancos/ de cada sistema que usa.
# Rode na raiz do repositório depois de mudar assets/bancos/. Não edite as cópias.
set -euo pipefail
for p in rh contabil barber; do
  [ -d "$p/src" ] || continue
  mkdir -p "$p/src/bancos"
  cp assets/bancos/lista.js assets/bancos/pix.js assets/bancos/ofx.js assets/bancos/cnab240.js assets/bancos/pix-api.js "$p/src/bancos/"
  echo "ok  $p/src/bancos"
done
