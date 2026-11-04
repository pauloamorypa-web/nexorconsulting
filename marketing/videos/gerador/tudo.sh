set -e
i=0
for x in rh contabil atende agente barber; do
  node renderizar.mjs $x
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 mudo-$x.mp4)
  node trilha.mjs $d trilha-$x.wav $i
  ffmpeg -loglevel error -y -i mudo-$x.mp4 -i trilha-$x.wav -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart nexor-$x.mp4
  i=$((i+1))
  echo "pronto $x $d"
done
