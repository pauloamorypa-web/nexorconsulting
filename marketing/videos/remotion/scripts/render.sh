#!/bin/sh
# Uso: sh scripts/render.sh <id da composição> <nome do arquivo> [pasta da folha de conferência]
# Renderiza ../<nome>.mp4 e, se pedir, monta uma folha com um quadro a cada 1,6 s.
set -e
npx remotion render "$1" "../$2.mp4" --browser-executable=/opt/pw-browsers/chromium --log=error
[ -n "$3" ] && ffmpeg -hide_banner -loglevel error -y -i "../$2.mp4" -vf "fps=1/1.6,scale=270:-1,tile=6x3" -frames:v 1 "$3/folha-$2.jpg"
ffprobe -v error -show_entries format=duration -of csv=p=0 "../$2.mp4"
