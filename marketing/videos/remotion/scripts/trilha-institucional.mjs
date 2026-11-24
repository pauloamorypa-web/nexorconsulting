/* Trilha do institucional (sintetizada, sem direitos autorais).
   Piano e pad suaves no começo, subida e impacto quando a Nexor aparece, batida leve a partir
   do manifesto e acorde final na assinatura. As viradas seguem src/tempos/institucional.ts.
   Uso: node scripts/trilha-institucional.mjs  →  public/institucional/trilha.wav */
import { readFileSync, writeFileSync } from "node:fs";

/* Uso: node scripts/trilha-institucional.mjs [id]  (institucional ou ti) */
const ID = process.argv[2] || "institucional";
const MAPA = { institucional: { rev: 2, man: 3, bat: 5 }, ti: { rev: 3, man: 3, bat: 4 }, vendas: { rev: 1, man: 2, bat: 2 }, "v-barber": { rev: 1, man: 1, bat: 1 }, "v-cardapio": { rev: 1, man: 1, bat: 1 }, "v-crm": { rev: 1, man: 1, bat: 1 }, "v-restaurantes": { rev: 1, man: 1, bat: 1 } }[ID];
const t = JSON.parse(readFileSync(`src/tempos/${ID}.ts`, "utf8").split("export default ")[1].split(" as const")[0]);
const ATRASO = 0.4;
const ini = t.frases.map((x, i) => (i === 0 ? 0 : ATRASO + (t.frases[i - 1][1] + x[0]) / 2));
const DUR = ATRASO + t.frases[t.frases.length - 1][1] + 3.4;
const SR = 44100, N = Math.ceil(DUR * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
let semente = 7;
const ruido = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;

function nota(ini0, dur, freq, vol, tipo, pan = 0) {
  const a = Math.floor(ini0 * SR), n = Math.floor(dur * SR);
  for (let i = 0; i < n && a + i < N; i++) {
    if (a + i < 0) continue;
    const s = i / SR;
    let env, v;
    if (tipo === "pad") { env = Math.min(1, s / 1.2) * Math.min(1, (dur - s) / 1.2); v = Math.sin(2 * Math.PI * freq * s) + 0.45 * Math.sin(2 * Math.PI * freq * 2.004 * s) + 0.2 * Math.sin(2 * Math.PI * freq * 2.997 * s); }
    else if (tipo === "piano") { env = Math.exp(-s * 2.2) * Math.min(1, s / 0.005); v = Math.sin(2 * Math.PI * freq * s) + 0.35 * Math.sin(2 * Math.PI * freq * 2 * s) * Math.exp(-s * 4) + 0.12 * Math.sin(2 * Math.PI * freq * 3 * s) * Math.exp(-s * 6); }
    else if (tipo === "baixo") { env = Math.exp(-s * 1.6) * Math.min(1, s / 0.02); v = Math.sin(2 * Math.PI * freq * s) + 0.3 * Math.sin(4 * Math.PI * freq * s); }
    else if (tipo === "kick") { env = Math.exp(-s * 8); v = Math.sin(2 * Math.PI * (46 + 80 * Math.exp(-s * 28)) * s); }
    else if (tipo === "boom") { env = Math.exp(-s * 1.5); v = Math.sin(2 * Math.PI * (34 + 60 * Math.exp(-s * 6)) * s) + 0.3 * ruido() * Math.exp(-s * 10); }
    else if (tipo === "sobe") { env = (s / dur) ** 2.2; v = ruido() * 0.6 + Math.sin(2 * Math.PI * (200 + 1400 * (s / dur) ** 2) * s) * 0.3; }
    else { env = Math.exp(-s * 45); v = ruido(); }
    const x = v * env * vol;
    L[a + i] += x * (1 - pan);
    R[a + i] += x * (1 + pan);
  }
}

/* Harmonia: Lá menor com cor de maior (calma e esperança) */
const ACORDES = [[57, 64, 69, 72], [53, 60, 65, 69], [48, 55, 60, 64], [55, 62, 67, 71]];
const BPM = 84, bat = 60 / BPM, comp = 4 * bat;
const revelacao = ini[MAPA.rev], manifesto = ini[MAPA.man], batida = ini[MAPA.bat], final = ini[ini.length - 1];

for (let c = 0, s = 0; s < final; c++, s += comp) {
  const a = ACORDES[c % 4];
  const forte = s >= manifesto ? 1 : 0.6;
  for (const m of a.slice(0, 3)) nota(s, comp + 1.2, hz(m - 12), 0.035 * forte, "pad", ((m % 3) - 1) * 0.35);
  /* piano: arpejo lento antes, mais vivo depois do manifesto */
  const passos = s >= manifesto ? 8 : 4;
  for (let k = 0; k < passos; k++) {
    const m = a[(k * (passos === 8 ? 3 : 1)) % 4] + (k % 2 ? 12 : 0);
    nota(s + (k * comp) / passos, 2.4, hz(m), 0.06 * (s >= manifesto ? 0.85 : 1), "piano", k % 2 ? 0.3 : -0.3);
  }
  if (s >= manifesto) nota(s, comp, hz(a[0] - 24), 0.14, "baixo");
  if (s >= batida) {
    for (let k = 0; k < 4; k++) {
      nota(s + k * bat, 0.4, 0, 0.32, "kick");
      nota(s + k * bat + bat / 2, 0.08, 0, 0.035, "hat", 0.4);
    }
  }
}
/* subida e impacto na revelação da marca */
nota(revelacao - 2.2, 2.2, 0, 0.09, "sobe");
nota(revelacao, 4, 0, 0.5, "boom");
for (const m of [57, 64, 69, 76]) nota(revelacao, 5, hz(m), 0.05, "piano");
/* acorde final */
nota(final, 3, 0, 0.35, "boom");
for (const m of [45, 57, 64, 69, 72, 76]) { nota(final, DUR - final, hz(m), 0.06, "piano"); nota(final, DUR - final, hz(m - 12), 0.03, "pad"); }

/* ambiente: eco estéreo simples */
const atrasos = [[0.23, 0.32], [0.37, 0.22], [0.51, 0.14]];
for (const [d, g] of atrasos) {
  const k = Math.floor(d * SR);
  for (let i = N - 1; i >= k; i--) { L[i] += R[i - k] * g; R[i] += L[i - k] * g * 0.9; }
}
let pico = 0;
for (let i = 0; i < N; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round((L[i] / pico) * 0.89 * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round((R[i] / pico) * 0.89 * 32767), 46 + i * 4);
}
writeFileSync(`public/${ID}/trilha.wav`, buf);
console.log("trilha", DUR.toFixed(1), "s");
