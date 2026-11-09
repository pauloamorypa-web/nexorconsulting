#!/usr/bin/env node
/* Checagem de licenças das dependências de PRODUÇÃO de um pacote npm, lida do package-lock.json (v2/v3),
   sem instalar nada. Falha (código 1) com GPL, AGPL ou SSPL. LGPL é aceita. Em licença dupla "(A OR B)",
   basta uma alternativa permitida; em "(A AND B)", todas precisam ser permitidas.
   Uso: node .github/scripts/licencas.mjs <pasta-do-pacote> [<pasta> ...] */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROIBIDA = /^(A?GPL|SSPL)(-|$)/i; // GPL-2.0, GPL-3.0-or-later, AGPL-3.0, SSPL-1.0 ... (LGPL não casa)

export function licencaProibida(expr) {
  const texto = String(expr ?? "").trim();
  if (!texto) return false;
  const limpa = texto.replace(/^\(|\)$/g, "");
  if (/\s+OR\s+/i.test(limpa)) return limpa.split(/\s+OR\s+/i).every(licencaProibida);
  if (/\s+AND\s+/i.test(limpa)) return limpa.split(/\s+AND\s+/i).some(licencaProibida);
  return PROIBIDA.test(limpa.replace(/\+$/, "").replace(/\s+WITH\s+.*$/i, ""));
}

function conferir(pasta) {
  const lock = JSON.parse(readFileSync(join(pasta, "package-lock.json"), "utf8"));
  if (!lock.packages) throw new Error(`${pasta}: package-lock.json sem "packages" (precisa ser lockfileVersion 2 ou 3)`);
  const achados = [];
  const semLicenca = [];
  let total = 0;
  for (const [caminho, p] of Object.entries(lock.packages)) {
    if (!caminho || p.dev || p.devOptional || p.link) continue; // raiz, dependências de desenvolvimento e links locais
    total++;
    const lic = typeof p.license === "string" ? p.license : Array.isArray(p.licenses) ? p.licenses.map((l) => l.type ?? l).join(" OR ") : "";
    const nome = caminho.replace(/^.*node_modules\//, "");
    if (!lic) semLicenca.push(`${nome}@${p.version}`);
    else if (licencaProibida(lic)) achados.push(`${nome}@${p.version}: ${lic}`);
  }
  return { total, achados, semLicenca };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pastas = process.argv.slice(2);
  if (!pastas.length) {
    console.error("Uso: node .github/scripts/licencas.mjs <pasta> [<pasta> ...]");
    process.exit(2);
  }
  let falhou = false;
  for (const pasta of pastas) {
    const { total, achados, semLicenca } = conferir(pasta);
    console.log(`${pasta}: ${total} dependências de produção conferidas`);
    for (const s of semLicenca) console.log(`  aviso: sem licença declarada no package-lock: ${s}`);
    for (const a of achados) console.log(`  PROIBIDA: ${a}`);
    if (achados.length) falhou = true;
  }
  if (falhou) {
    console.error("Há dependências de produção com licença GPL, AGPL ou SSPL.");
    process.exit(1);
  }
}
