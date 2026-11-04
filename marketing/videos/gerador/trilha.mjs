// Trilha instrumental sintetizada (sem direitos autorais): pad, arpejo, baixo e batida leve. Uso: node trilha.mjs <segundos> <saida.wav> [semente]
import { writeFileSync } from "node:fs";
const [dur, saida, semente = "0"] = process.argv.slice(2);
const SR = 44100, N = Math.ceil(Number(dur) * SR), bpm = 108, bat = 60 / bpm;
const L = new Float32Array(N), R = new Float32Array(N);
const f = (m) => 440 * 2 ** ((m - 69) / 12);
const progs = [[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], [[50, 53, 57], [55, 58, 62], [48, 52, 55], [53, 57, 60]], [[52, 55, 59], [48, 52, 55], [55, 59, 62], [57, 60, 64]]];
const prog = progs[Number(semente) % progs.length];
let rnd = 12345 + Number(semente);
const ruido = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;
function nota(ini, durS, freq, vol, tipo, pan = 0) {
  const a = Math.floor(ini * SR), n = Math.floor(durS * SR);
  for (let i = 0; i < n && a + i < N; i++) {
    const t = i / SR;
    let env, v;
    if (tipo === "pad") { env = Math.min(1, t / 0.6) * Math.min(1, (durS - t) / 0.6); v = Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(2 * Math.PI * freq * 2.003 * t) + 0.25 * Math.sin(2 * Math.PI * freq * 3.01 * t); }
    else if (tipo === "plk") { env = Math.exp(-t * 7) * Math.min(1, t / 0.004); v = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * t) * Math.exp(-t * 12); }
    else if (tipo === "bx") { env = Math.exp(-t * 3) * Math.min(1, t / 0.01); v = Math.tanh(2 * Math.sin(2 * Math.PI * freq * t)); }
    else if (tipo === "kick") { env = Math.exp(-t * 9); v = Math.sin(2 * Math.PI * (48 + 90 * Math.exp(-t * 30)) * t); }
    else { env = Math.exp(-t * 40); v = ruido(); }
    const s = v * env * vol;
    L[a + i] += s * (1 - pan) ; R[a + i] += s * (1 + pan);
  }
}
const compasso = 4 * bat;
for (let c = 0, t = 0; t < Number(dur); c++, t += compasso) {
  const acorde = prog[c % 4];
  for (const m of acorde) nota(t, compasso + 0.3, f(m), 0.055, "pad", (m % 3 - 1) * 0.3);
  nota(t, compasso, f(acorde[0] - 24), 0.16, "bx");
  nota(t + 2 * bat, compasso / 2, f(acorde[0] - 24), 0.12, "bx");
  const arp = [acorde[0] + 12, acorde[1] + 12, acorde[2] + 12, acorde[1] + 24, acorde[2] + 12, acorde[1] + 12, acorde[0] + 24, acorde[2] + 12];
  arp.forEach((m, i) => nota(t + i * bat / 2, bat, f(m), 0.07, "plk", i % 2 ? 0.45 : -0.45));
  if (t > 3.5) for (let b = 0; b < 4; b++) { nota(t + b * bat, 0.4, 0, 0.32, "kick"); nota(t + b * bat + bat / 2, 0.08, 0, 0.035, "hat", 0.2); }
}
// eco simples e volume geral com entrada e saída suaves
const atraso = Math.floor(bat * 0.75 * SR);
for (let i = atraso; i < N; i++) { L[i] += R[i - atraso] * 0.22; R[i] += L[i - atraso] * 0.22; }
let pico = 0; for (let i = 0; i < N; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const g = Math.min(1, i / (SR * 1.5), (N - i) / (SR * 2.5)) * 0.82 / pico;
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
}
writeFileSync(saida, buf);
