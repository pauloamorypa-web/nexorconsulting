/* npm run demo: sobe o Atende IA em Modo Demonstração com os dados zerados (DEMO=1 DEMO_RESET=1).
   Funciona igual no Windows, macOS e Linux (sem depender da sintaxe de variáveis do terminal). */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const servidor = fileURLToPath(new URL("../servidor.js", import.meta.url));
const env = { ...process.env, DEMO: "1", DEMO_RESET: process.env.DEMO_RESET ?? "1" };
const filho = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", servidor], { stdio: "inherit", env });
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => filho.kill(s));
filho.on("exit", (codigo) => process.exit(codigo ?? 0));
