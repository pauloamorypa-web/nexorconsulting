#!/usr/bin/env node
/* Demonstração Nexor: sobe todos os sistemas em Modo Demonstração (DEMO=1) e abre a página inicial.
   Uso:  node demo/iniciar.mjs              (todos)
         node demo/iniciar.mjs barber rh    (só alguns)
   Precisa do Node 22 ou mais novo. Tudo roda só neste computador (127.0.0.1) e nada sai para a internet. */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL = Number(process.env.DEMO_PORTAL_PORT ?? 8780);
export const SISTEMAS = [
  { id: "barber", nome: "Nexor Barber", pasta: "barber", porta: 8795, resumo: "Agenda, app do cliente, clube de assinatura, comandas e comissões" },
  { id: "rh", nome: "Nexor RH + Ponto", pasta: "rh", porta: 8791, resumo: "Ponto eletrônico, folha, eSocial, recrutamento e portal do colaborador" },
  { id: "atende", nome: "Nexor Atende IA", pasta: "atende", porta: 8790, resumo: "WhatsApp com IA que atende, agenda e passa para humano" },
  { id: "agente", nome: "Nexor Agente", pasta: "nexor-agente", porta: 8792, resumo: "Agente de IA que executa tarefas da empresa com aprovação" },
  { id: "contabil", nome: "Nexor Contábil", pasta: "contabil", porta: 8793, resumo: "Escritório contábil: obrigações, documentos com IA, honorários e portal" },
];

const versao = Number(process.versions.node.split(".")[0]);
if (versao < 22) {
  console.error(`A demonstração precisa do Node 22 ou mais novo (este computador tem o ${process.versions.node}). Baixe em nodejs.org.`);
  process.exit(1);
}

const pedidos = process.argv.slice(2);
const escolhidos = pedidos.length ? SISTEMAS.filter((s) => pedidos.includes(s.id)) : SISTEMAS;
const filhos = [];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function preparar(s) {
  const pasta = join(RAIZ, s.pasta);
  if (!existsSync(join(pasta, "package.json"))) return false;
  if (!existsSync(join(pasta, "node_modules"))) {
    console.log(`Instalando ${s.nome} (só na primeira vez)...`);
    const r = spawnSync(npm, ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: pasta, stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) {
      console.error(`Não consegui instalar ${s.nome}.`);
      return false;
    }
  }
  return true;
}

function subir(s) {
  const pasta = join(RAIZ, s.pasta);
  const env = { ...process.env, DEMO: "1", DEMO_RESET: "1", PORT: String(s.porta), DATA_DIR: join(pasta, "data-demo"), NODE_ENV: "development" };
  delete env.DEMO_PUBLICO;
  const filho = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/servidor.js"], { cwd: pasta, env, stdio: ["ignore", "pipe", "pipe"] });
  const prefixo = `[${s.id}]`.padEnd(11);
  const linha = (d) => String(d).split("\n").filter(Boolean).forEach((l) => console.log(prefixo, l));
  filho.stdout.on("data", linha);
  filho.stderr.on("data", linha);
  filho.on("exit", (c) => c && console.log(prefixo, `parou (código ${c})`));
  filhos.push(filho);
}

async function estado(s) {
  try {
    const r = await fetch(`http://127.0.0.1:${s.porta}/api/demo`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return { ...s, no_ar: false };
    const d = await r.json();
    return { ...s, no_ar: true, empresa: d.empresa ?? null, papeis: d.papeis ?? [], ia: d.ia ?? null };
  } catch {
    return { ...s, no_ar: false };
  }
}

const pagina = readFileSync(join(RAIZ, "demo", "index.html"));
const portal = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; connect-src 'self'");
  if (req.url === "/estado") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(JSON.stringify(await Promise.all(escolhidos.map(estado))));
  }
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(pagina);
  }
  res.writeHead(404).end();
});

function abrirNavegador(url) {
  if (process.env.DEMO_SEM_NAVEGADOR) return;
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref();
  } catch {}
}

const prontos = escolhidos.filter(preparar);
prontos.forEach(subir);
portal.listen(PORTAL, "127.0.0.1", () => {
  const url = `http://localhost:${PORTAL}`;
  console.log(`\nDemonstração Nexor: ${url}\nOs sistemas levam cerca de 1 minuto para montar os dados fictícios. Ctrl+C encerra tudo.\n`);
  abrirNavegador(url);
});

const encerrar = () => {
  for (const f of filhos) f.kill("SIGTERM");
  portal.close();
  setTimeout(() => process.exit(0), 500);
};
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
