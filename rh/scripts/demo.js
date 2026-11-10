/* Semeia a demonstração (empresa fictícia "Padaria Pão Dourado") num banco comum, sem ligar o Modo Demonstração.
   O jeito recomendado de demonstrar é `npm run demo` (DEMO=1: faixa, papéis, simuladores, sem chamadas externas; ver DEMO.md).
   Uso: DATA_DIR=./data-demo npm run demo:semear  ·  Login do painel: demo@nexorrh.com.br / demo12345 */

import { join } from "node:path";
import { lerConfig } from "../src/config.js";
import { abrirBanco } from "../src/db.js";
import { criarCofre } from "../src/seguranca.js";
import { criarNucleo } from "../src/servicos/nucleo.js";
import { CODIGO_APP_DEMO, SENHA_DEMO, USUARIOS_DEMO, semear } from "../src/demo/semente.js";

const cfg = lerConfig();
const repo = abrirBanco(join(cfg.pastaDados, "rh.db"));
if (repo.usuarioPorEmail(USUARIOS_DEMO.admin.email)) {
  console.log("A demonstração já existe neste banco.");
  process.exit(0);
}
const nucleo = criarNucleo({ repo, cofre: criarCofre(cfg), cfg });
const r = semear({ repo, nucleo });
console.log(`Demonstração criada em ${cfg.pastaDados}: ${r.marcacoes} marcações.`);
console.log(`Painel: ${Object.values(USUARIOS_DEMO).map((u) => u.email).join(" · ")} (senha ${SENHA_DEMO})`);
console.log(`App do trabalhador (novato Henrique Alves): código ${CODIGO_APP_DEMO}`);
repo.fechar();
