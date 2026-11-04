/* Backup da Nexor Central: banco (cópia consistente) + chave que assina as licenças.
   Sem a chave-licenca.pem, todas as instalações dos clientes precisariam receber uma chave pública nova.
   Uso: DATA_DIR=./data BACKUP_DIR=./backups node scripts/backup.js  (guarda os últimos BACKUP_MANTER, padrão 30) */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const pasta = process.env.DATA_DIR ?? "./data";
const base = process.env.BACKUP_DIR ?? join(pasta, "backups");
const manter = Math.max(1, Number(process.env.BACKUP_MANTER) || 30);
const banco = join(pasta, "central.db");
if (!existsSync(banco)) {
  console.error(`Banco não encontrado em ${banco}`);
  process.exit(1);
}
const destino = join(base, `central-${new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 13)}`);
mkdirSync(destino, { recursive: true });
const db = new DatabaseSync(banco);
db.exec("PRAGMA busy_timeout = 10000");
db.prepare("VACUUM INTO ?").run(join(destino, "central.db"));
db.close();
const conf = new DatabaseSync(join(destino, "central.db"));
const ok = Object.values(conf.prepare("PRAGMA integrity_check").get())[0] === "ok";
conf.close();
if (!ok) {
  console.error("Falha na verificação de integridade do backup");
  process.exit(2);
}
for (const arq of ["chave-licenca.pem"]) if (existsSync(join(pasta, arq))) copyFileSync(join(pasta, arq), join(destino, arq));
const todos = readdirSync(base).filter((n) => n.startsWith("central-") && statSync(join(base, n)).isDirectory()).sort();
for (const velho of todos.slice(0, Math.max(0, todos.length - manter))) rmSync(join(base, velho), { recursive: true, force: true });
console.log(`Backup OK: ${destino}`);
