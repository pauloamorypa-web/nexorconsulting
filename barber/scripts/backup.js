/* Backup do Nexor Barber com o sistema no ar.
   Copia o banco de forma consistente (VACUUM INTO, seguro mesmo com o servidor gravando) e mantém os últimos N.

   Uso:   DATA_DIR=./data node --disable-warning=ExperimentalWarning scripts/backup.js
   Opções: BACKUP_DIR (padrão: DATA_DIR/backups) · BACKUP_MANTER (padrão: 14)
   Restaurar: pare o servidor, copie barber.db do backup para DATA_DIR e suba de novo (com a mesma MASTER_KEY). */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const pasta = process.env.DATA_DIR ?? "./data";
const destinoBase = process.env.BACKUP_DIR ?? join(pasta, "backups");
const manter = Math.max(1, Number(process.env.BACKUP_MANTER) || 14);
const banco = join(pasta, "barber.db");
if (!existsSync(banco)) {
  console.error(`Banco não encontrado em ${banco}. Confira o DATA_DIR.`);
  process.exit(1);
}
const carimbo = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 13);
const destino = join(destinoBase, `barber-${carimbo}`);
mkdirSync(destino, { recursive: true });
const db = new DatabaseSync(banco);
db.exec("PRAGMA busy_timeout = 10000");
const arquivo = join(destino, "barber.db");
db.prepare("VACUUM INTO ?").run(arquivo);
db.close();
const c = new DatabaseSync(arquivo);
const integro = Object.values(c.prepare("PRAGMA integrity_check").get())[0];
const clientes = c.prepare("SELECT COUNT(*) n FROM clientes").get().n;
const agendamentos = c.prepare("SELECT COUNT(*) n FROM agendamentos").get().n;
c.close();
if (integro !== "ok") {
  console.error("Falha na verificação de integridade do backup:", integro);
  process.exit(2);
}
writeFileSync(join(destino, "LEIA-ME.txt"), `Backup do Nexor Barber de ${new Date().toISOString()}\nClientes: ${clientes} · Agendamentos: ${agendamentos}\nRestaurar: pare o servidor, copie barber.db para DATA_DIR e suba de novo (com a mesma MASTER_KEY).\n`);
try {
  writeFileSync(join(pasta, "ultimo-backup.json"), JSON.stringify({ em: Date.now(), clientes, agendamentos }));
} catch {
  /* pasta de dados só leitura */
}
const backups = readdirSync(destinoBase).filter((n) => n.startsWith("barber-") && statSync(join(destinoBase, n)).isDirectory()).sort();
for (const velho of backups.slice(0, Math.max(0, backups.length - manter))) rmSync(join(destinoBase, velho), { recursive: true, force: true });
console.log(`Backup OK: ${destino} (${clientes} clientes, ${agendamentos} agendamentos; mantendo os últimos ${manter})`);
