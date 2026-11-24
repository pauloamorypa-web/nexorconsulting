/* Efeitos sonoros sintetizados (sem direitos autorais) para o vídeo cinematográfico.
   Uso: node scripts/sfx-cinema.mjs → public/cinema/sfx-*.wav */
import { writeFileSync } from "node:fs";
const SR = 44100;
let sem = 11;
const ruido = () => ((sem = (sem * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;
function grava(nome, dur, fn) {
  const n = Math.floor(dur * SR), L = new Float32Array(n), R = new Float32Array(n);
  fn(L, R, n);
  let p = 1e-6; for (let i = 0; i < n; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i]));
  const b = Buffer.alloc(44 + n * 4);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 4, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round((L[i] / p) * 0.9 * 32767), 44 + i * 4); b.writeInt16LE(Math.round((R[i] / p) * 0.9 * 32767), 46 + i * 4); }
  writeFileSync(`public/cinema/sfx-${nome}.wav`, b);
}
/* whoosh: ruído filtrado que sobe e desce, passando da esquerda para a direita */
grava("whoosh", 1.1, (L, R, n) => { let lp = 0; for (let i = 0; i < n; i++) { const t = i / n; const env = Math.sin(Math.PI * t) ** 2; const a = 0.02 + 0.25 * Math.sin(Math.PI * t); lp += a * (ruido() - lp); L[i] = lp * env * (1 - t); R[i] = lp * env * t; } });
/* impacto grave */
grava("impacto", 2.2, (L, R, n) => { for (let i = 0; i < n; i++) { const s = i / SR; const v = Math.sin(2 * Math.PI * (32 + 70 * Math.exp(-s * 7)) * s) * Math.exp(-s * 1.8) + 0.25 * ruido() * Math.exp(-s * 14); L[i] = R[i] = v; } });
/* toque na tela */
grava("toque", 0.25, (L, R, n) => { for (let i = 0; i < n; i++) { const s = i / SR; const v = Math.sin(2 * Math.PI * 1800 * s) * Math.exp(-s * 60) + 0.4 * ruido() * Math.exp(-s * 120); L[i] = R[i] = v; } });
/* notificação: dois toques doces */
grava("notifica", 0.5, (L, R, n) => { for (let i = 0; i < n; i++) { const s = i / SR; const a = Math.sin(2 * Math.PI * 1320 * s) * Math.exp(-s * 14); const b2 = s > 0.11 ? Math.sin(2 * Math.PI * 1760 * (s - 0.11)) * Math.exp(-(s - 0.11) * 12) : 0; L[i] = (a + b2) * 0.9; R[i] = (a + b2) * 0.7; } });
/* scanner: bipe que varre */
grava("scan", 0.9, (L, R, n) => { for (let i = 0; i < n; i++) { const s = i / SR; const f = 600 + 1800 * (s / 0.9); const v = Math.sin(2 * Math.PI * f * s) * 0.35 * Math.sin(Math.PI * s / 0.9) + (s > 0.78 ? Math.sin(2 * Math.PI * 2400 * s) * Math.exp(-(s - 0.78) * 30) : 0); L[i] = R[i] = v; } });
/* impressora térmica */
grava("impressora", 1.4, (L, R, n) => { for (let i = 0; i < n; i++) { const s = i / SR; const g = (Math.floor(s * 38) % 2 ? 1 : 0.35); const v = ruido() * 0.5 * g * Math.min(1, s * 8) * Math.min(1, (1.4 - s) * 6) + Math.sin(2 * Math.PI * 220 * s) * 0.08; L[i] = R[i] = v; } });
/* subida (riser) para a marca */
grava("subida", 2.0, (L, R, n) => { for (let i = 0; i < n; i++) { const s = i / SR, t = s / 2; const v = (ruido() * 0.5 + Math.sin(2 * Math.PI * (200 + 1600 * t * t) * s) * 0.4) * t ** 2.2; L[i] = v * (1 - t * 0.3); R[i] = v; } });
console.log("sfx ok");
