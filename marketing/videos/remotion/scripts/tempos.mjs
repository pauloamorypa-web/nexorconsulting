/* Mede os trechos falados de uma locução e grava src/tempos/<id>.ts.
   Uso: node scripts/tempos.mjs <id> <número de frases>
   As frases são separadas por "..." no texto da locução; aqui achamos as N-1 maiores pausas
   e devolvemos [início, fim] de cada frase, em segundos do áudio original. */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const [id, n] = [process.argv[2], Number(process.argv[3])];
const saida = execFileSync("ffmpeg", ["-hide_banner", "-i", `public/${id}/locucao.mp3`, "-af", "silencedetect=noise=-30dB:d=0.1", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).toString();
let txt = saida;
try { txt = execFileSync("sh", ["-c", `ffmpeg -hide_banner -i public/${id}/locucao.mp3 -af silencedetect=noise=-30dB:d=0.1 -f null - 2>&1`], { encoding: "utf8" }); } catch {}
const dur = Number(/Duration: (\d+):(\d+):([\d.]+)/.exec(txt).slice(1).reduce((a, v, i) => a + Number(v) * [3600, 60, 1][i], 0).toFixed(3));
const ini = [...txt.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
const fim = [...txt.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
const pausas = ini.map((a, i) => ({ a, b: fim[i] ?? dur })).filter((p) => p.a > 0.2 && p.b < dur - 0.05);
const escolhidas = [...pausas].sort((x, y) => (y.b - y.a) - (x.b - x.a)).slice(0, n - 1).sort((x, y) => x.a - y.a);
if (escolhidas.length !== n - 1) throw new Error(`Achei ${escolhidas.length} pausas, esperava ${n - 1}`);
const comeco = ini[0] === 0 ? fim[0] : 0;
const ultimoFim = ini.length && fim.length < ini.length ? ini[ini.length - 1] : dur;
const frases = [];
let t = comeco;
for (const p of escolhidas) { frases.push([+t.toFixed(2), +p.a.toFixed(2)]); t = p.b; }
frases.push([+t.toFixed(2), +Math.min(ultimoFim, dur).toFixed(2)]);
writeFileSync(`src/tempos/${id}.ts`, `// Gerado por scripts/tempos.mjs a partir de public/${id}/locucao.mp3 (não editar à mão)\nexport default ${JSON.stringify({ duracao: dur, frases })} as const;\n`);
console.log(id, dur, frases.map((f) => f.join("–")).join("  "));
