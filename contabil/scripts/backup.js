/* Backup do Nexor Contábil com o sistema no ar.
   Copia o banco de forma consistente (VACUUM INTO, seguro mesmo com o servidor gravando) e a pasta de
   arquivos (já criptografados com a MASTER_KEY). Mantém os últimos N backups.

   Uso:   DATA_DIR=./data node --disable-warning=ExperimentalWarning scripts/backup.js
   Opções (variáveis de ambiente):
     BACKUP_DIR      pasta de destino (padrão: DATA_DIR/backups)
     BACKUP_MANTER   quantos backups guardar (padrão: 14)

   Restaurar: pare o servidor, copie rh.db e a pasta arquivos/ do backup para DATA_DIR e suba de novo.
   Sem a MASTER_KEY original, o certificado digital e os arquivos do backup não podem ser lidos. */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const pasta = process.env.DATA_DIR ?? "./data";
const destinoBase = process.env.BACKUP_DIR ?? join(pasta, "backups");
const manter = Math.max(1, Number(process.env.BACKUP_MANTER) || 14);
const banco = join(pasta, "contabil.db");

if (!existsSync(banco)) {
  console.error(`Banco não encontrado em ${banco}. Confira o DATA_DIR.`);
  process.exit(1);
}

const carimbo = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 13);
const destino = join(destinoBase, `contabil-${carimbo}`);
mkdirSync(destino, { recursive: true });

// 1. Banco: cópia consistente
const db = new DatabaseSync(banco);
db.exec("PRAGMA busy_timeout = 10000");
const arquivoBackup = join(destino, "contabil.db");
db.prepare("VACUUM INTO ?").run(arquivoBackup);
const conferencia = new DatabaseSync(arquivoBackup);
const integro = conferencia.prepare("PRAGMA integrity_check").get();
const colaboradores = conferencia.prepare("SELECT COUNT(*) n FROM clientes").get().n;
const marcacoes = conferencia.prepare("SELECT COUNT(*) n FROM documentos").get().n;
conferencia.close();
db.close();
if (Object.values(integro)[0] !== "ok") {
  console.error("Falha na verificação de integridade do backup:", integro);
  process.exit(2);
}

// 2. Arquivos (documentos dos clientes e guias): já estão criptografados
const arquivos = join(pasta, "arquivos");
if (existsSync(arquivos)) cpSync(arquivos, join(destino, "arquivos"), { recursive: true });

writeFileSync(join(destino, "LEIA-ME.txt"), `Backup do Nexor Contábil de ${new Date().toISOString()}\nClientes: ${colaboradores} · Documentos: ${marcacoes}\nRestaurar: pare o servidor, copie contabil.db e arquivos/ para DATA_DIR e suba de novo (com a mesma MASTER_KEY).\n`);

// Marca o último backup bom na pasta de dados: o sistema informa à Nexor Central (alerta de backup atrasado)
try {
  writeFileSync(join(pasta, "ultimo-backup.json"), JSON.stringify({ em: Date.now(), colaboradores, marcacoes }));
} catch {
  /* pasta de dados só leitura: segue sem a marca */
}

// 3. Retenção
const backups = readdirSync(destinoBase)
  .filter((n) => n.startsWith("contabil-") && statSync(join(destinoBase, n)).isDirectory())
  .sort();
for (const velho of backups.slice(0, Math.max(0, backups.length - manter))) rmSync(join(destinoBase, velho), { recursive: true, force: true });

console.log(`Backup OK: ${destino} (${colaboradores} clientes, ${marcacoes} documentos; mantendo os últimos ${manter})`);
