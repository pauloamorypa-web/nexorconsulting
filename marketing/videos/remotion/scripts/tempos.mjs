/* Mede os trechos falados de uma locução e grava src/tempos/<id>.ts.
   Uso: node scripts/tempos.mjs <id>
   Lê as frases do produto em src/produtos.tsx (campo frases, na pasta <id>), estima onde cada
   frase termina pelo tamanho do texto e escolhe, perto de cada estimativa, a maior pausa real
   do áudio (ffmpeg silencedetect). Devolve [início, fim] de cada frase, em segundos do áudio. */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const id = process.argv[2];
const fonte = readFileSync("src/produtos.tsx", "utf8");
const bloco = fonte.split(/\n  \{\n/).find((b) => b.includes(`pasta: "${id}"`));
if (!bloco) throw new Error(`Produto com pasta "${id}" não achado em src/produtos.tsx`);
const frases = [...bloco.split("frases: [")[1].split("],")[0].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
const n = frases.length;

const txt = execSync(`ffmpeg -hide_banner -i public/${id}/locucao.mp3 -af silencedetect=noise=-30dB:d=0.1 -f null - 2>&1`, { encoding: "utf8" });
const [h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(txt).slice(1).map(Number);
const dur = h * 3600 + m * 60 + s;
const ini = [...txt.matchAll(/silence_start: ([\d.]+)/g)].map((x) => Number(x[1]));
const fim = [...txt.matchAll(/silence_end: ([\d.]+)/g)].map((x) => Number(x[1]));
const comeco = ini[0] === 0 ? fim[0] : 0;
const termino = ini.length > fim.length ? ini[ini.length - 1] : dur;
const pausas = ini.map((a, i) => ({ a, b: fim[i] ?? dur })).filter((p) => p.a > comeco + 0.1 && p.b < termino - 0.05);

/* Estimativa de cada fronteira pela proporção de caracteres falados */
const tam = frases.map((f) => f.length + 8);
const total = tam.reduce((a, b) => a + b, 0);
const escolhidas = [];
let acum = 0;
for (let i = 0; i < n - 1; i++) {
  acum += tam[i];
  const alvo = comeco + ((termino - comeco) * acum) / total;
  const candidatas = pausas.filter((p) => !escolhidas.includes(p) && Math.abs((p.a + p.b) / 2 - alvo) < 2.2 && (!escolhidas.length || p.a > escolhidas[escolhidas.length - 1].b));
  if (!candidatas.length) throw new Error(`Sem pausa perto de ${alvo.toFixed(2)} s (fim da frase ${i + 1})`);
  /* maior pausa, com leve preferência pela mais próxima da estimativa */
  candidatas.sort((x, y) => (y.b - y.a) - Math.abs((y.a + y.b) / 2 - alvo) * 0.08 - ((x.b - x.a) - Math.abs((x.a + x.b) / 2 - alvo) * 0.08));
  escolhidas.push(candidatas[0]);
}
const saida = [];
let t = comeco;
for (const p of escolhidas) { saida.push([+t.toFixed(2), +p.a.toFixed(2)]); t = p.b; }
saida.push([+t.toFixed(2), +termino.toFixed(2)]);
writeFileSync(`src/tempos/${id}.ts`, `// Gerado por scripts/tempos.mjs a partir de public/${id}/locucao.mp3 (não editar à mão)\nexport default ${JSON.stringify({ duracao: +dur.toFixed(2), frases: saida })} as const;\n`);
console.log(id, dur.toFixed(2), saida.map((f, i) => `${f[0]}–${f[1]} «${frases[i].slice(0, 22)}»`).join("\n  "));
