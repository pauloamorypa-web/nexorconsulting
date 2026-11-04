// Uso: node renderizar.mjs <produto> [previa]   → previa: um quadro por cena (folha de contato); senão MP4 30 fps
import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { spawn } from "node:child_process";
import { ROTEIROS } from "./roteiros.js";
const [produto, modo] = process.argv.slice(2);
const r = ROTEIROS[produto];
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
await p.goto(`file://${process.cwd()}/motor.html`);
await p.evaluate(() => document.fonts.ready);
const total = await p.evaluate((rot) => window.montar(rot), r);
if (modo === "previa") {
  let ini = 0;
  let i = 0;
  for (const c of r.cenas) {
    const t = ini + c.dur * 0.82;
    await p.evaluate((t) => window.quadro(t), t);
    await p.screenshot({ path: `previa-${produto}-${String(i++).padStart(2, "0")}.jpg`, type: "jpeg", quality: 70 });
    ini += c.dur;
  }
} else {
  const fps = 30;
  const n = Math.round(total * fps);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `mudo-${produto}.mp4`], { stdio: ["pipe", "inherit", "inherit"] });
  for (let f = 0; f < n; f++) {
    await p.evaluate((t) => window.quadro(t), f / fps);
    const img = await p.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(img)) await new Promise((ok) => ff.stdin.once("drain", ok));
  }
  ff.stdin.end();
  await new Promise((ok) => ff.on("close", ok));
}
console.log(produto, "duração", total.toFixed(1), "s", erros.length ? erros : "sem erros");
await b.close();
