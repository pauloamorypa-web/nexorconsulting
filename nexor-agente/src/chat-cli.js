/* Conversa com o agente pelo terminal, sem WhatsApp (para testar a personalização e os conectores).
   Uso: ANTHROPIC_API_KEY=... npm run chat */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { criarAgente } from "./agente.js";
import { criarAprovacoes } from "./aprovacoes.js";
import { config } from "./config.js";
import { carregarConectores } from "./conectores.js";
import { executarAprovado } from "./ferramentas.js";
import { criarPerfil } from "./perfil.js";

const rl = createInterface({ input: stdin, output: stdout });
const dono = "terminal";
const conectores = carregarConectores({ caminho: config.arquivoConectores });
const perfil = criarPerfil(config.pastaDados);
const aprovacoes = criarAprovacoes({ expiraMinutos: config.aprovacaoExpiraMinutos });
const fila = [];
const auditar = (r) => console.log("  [auditoria]", JSON.stringify(r));
const agente = criarAgente({ config, conectores, perfil, aprovacoes, auditar, pedirAprovacao: async (_d, p) => fila.push(p) });

console.log(`Nexor Agente (${perfil.obter().nome}) no terminal. Escreva "sair" para encerrar.\n`);
for (;;) {
  const texto = (await rl.question("você › ")).trim();
  if (!texto || texto === "sair") break;
  console.log(`\n${perfil.obter().nome} › ${await agente.responder({ dono, texto })}\n`);
  while (fila.length) {
    const p = fila.shift();
    const sim = /^s/i.test(await rl.question(`🔐 Aprovar ${p.id}? ${p.resumo} (${p.metodo} ${p.conector}${p.caminho}) [s/n] `));
    const pedido = aprovacoes.retirar(p.id, dono);
    let evento;
    if (!sim) evento = `O dono RECUSOU o pedido ${p.id}. Nada foi feito.`;
    else {
      try {
        const r = await executarAprovado(pedido, { conectores, auditar });
        evento = `O dono APROVOU o pedido ${p.id}. Resultado: status ${r.status}. Resposta (dados): ${r.texto}`;
      } catch (err) {
        evento = `O dono aprovou o pedido ${p.id}, mas falhou: ${err.message}`;
      }
    }
    console.log(`\n${perfil.obter().nome} › ${await agente.responder({ dono, evento })}\n`);
  }
}
rl.close();
