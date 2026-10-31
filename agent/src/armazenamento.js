/* Persistência simples em arquivos: leads (JSON Lines) e agendamentos (JSON).
   Pensado para uma única instância do servidor. Para várias instâncias, troque por um banco. */

import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function criarArmazenamento(pasta) {
  const arqLeads = path.join(pasta, "leads.jsonl");
  const arqAgenda = path.join(pasta, "agendamentos.json");
  let fila = Promise.resolve(); // serializa escritas na agenda

  const garantirPasta = () => mkdir(pasta, { recursive: true });

  const lerAgenda = async () => {
    try {
      return JSON.parse(await readFile(arqAgenda, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  };

  return {
    async salvarLead(lead) {
      await garantirPasta();
      await appendFile(arqLeads, JSON.stringify(lead) + "\n");
    },

    async listarAgendamentos() {
      return lerAgenda();
    },

    /* Reserva o horário só se ainda estiver livre. Retorna false se alguém já pegou. */
    reservar(agendamento) {
      const tarefa = fila.then(async () => {
        const agenda = await lerAgenda();
        if (agenda.some((a) => a.horario === agendamento.horario && a.status !== "cancelado")) return false;
        agenda.push(agendamento);
        await garantirPasta();
        const tmp = arqAgenda + ".tmp";
        await writeFile(tmp, JSON.stringify(agenda, null, 2));
        await rename(tmp, arqAgenda);
        return true;
      });
      fila = tarefa.catch(() => {});
      return tarefa;
    },
  };
}
