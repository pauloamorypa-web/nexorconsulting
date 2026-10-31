/* Conversa com o Nexor Assist pelo terminal, para testar antes de publicar: npm run chat */

import { createInterface } from "node:readline/promises";
import { criarAgente } from "./agente.js";
import { criarArmazenamento } from "./armazenamento.js";
import { config } from "./config.js";

const agente = criarAgente({
  armazenamento: criarArmazenamento(config.pastaDados),
  notificar: async (texto) => console.log(`\n  [aviso para a equipe]\n  ${texto.replace(/\n/g, "\n  ")}\n`),
});

const terminal = createInterface({ input: process.stdin, output: process.stdout });
console.log(`Nexor Assist · ${config.modelo} · digite "sair" para encerrar\n`);

while (true) {
  const texto = (await terminal.question("Você: ")).trim();
  if (!texto) continue;
  if (texto.toLowerCase() === "sair") break;
  const { resposta } = await agente.responder({ idConversa: "terminal", canal: "site", texto });
  console.log(`\nNexor: ${resposta ?? "(conversa com a equipe humana)"}\n`);
}
terminal.close();
