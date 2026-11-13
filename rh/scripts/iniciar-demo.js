/* Inicia a demonstração com dados fictícios em Windows, macOS ou Linux. */
import { fileURLToPath } from "node:url";

process.env.DEMO = "1";
process.env.PORT ??= "8792";
process.env.DATA_DIR ??= "./data-demo-local";
process.env.DEMO_RESET = process.argv.includes("--reset") || process.env.DEMO_RESET === "1" ? "1" : "0";

process.argv[1] = fileURLToPath(new URL("../src/servidor.js", import.meta.url));
await import("../src/servidor.js");

