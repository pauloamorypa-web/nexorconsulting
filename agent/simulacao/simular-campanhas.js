/* npm run simular-campanhas
   Roda todas as personas de test/personas pela Blue e imprime a matriz de acerto
   (classe esperada x classe dada) e o acerto da detecção de campanha.

   Com ANTHROPIC_API_KEY no ambiente, usa o modelo real (custa créditos: cerca de 2 chamadas por mensagem).
   Sem chave, ou com --simulado, usa o modelo simulado. --detalhes mostra nota e motivos de cada persona. */

import Anthropic from "@anthropic-ai/sdk";
import { carregarPersonas, clienteSimulado, imprimirMatriz, matrizDeAcerto, rodarPersona } from "./modelo-simulado.js";

const args = new Set(process.argv.slice(2));
const real = Boolean(process.env.ANTHROPIC_API_KEY) && !args.has("--simulado");
const personas = await carregarPersonas();

console.log(`Simulação das campanhas · ${personas.length} personas · modelo ${real ? "REAL (Claude)" : "SIMULADO"}\n`);

const resultados = [];
for (const p of personas) {
  // Modelo real: uma instância por persona, como cada conversa de verdade
  const r = await rodarPersona(p, { cliente: real ? new Anthropic() : clienteSimulado(), ...(real && { agora: () => new Date() }) });
  resultados.push(r);
  if (args.has("--detalhes")) {
    console.log(`${r.persona} [${r.campanha} via ${r.via}] ${r.classe} ${r.nota ?? "-"}${r.produto_indicado ? ` → ${r.produto_indicado}` : ""}${r.descarte ? ` · descarte: ${r.descarte}` : ""}`);
    for (const m of r.motivos) console.log(`    ${m}`);
  }
}

if (args.has("--detalhes")) console.log("");
const m = matrizDeAcerto(resultados);
imprimirMatriz(m);
process.exitCode = m.erros.length ? 1 : 0;
