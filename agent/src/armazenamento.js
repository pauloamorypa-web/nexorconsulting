/* Persistência simples em arquivos: leads (JSON Lines) e agendamentos (JSON).
   Pensado para uma única instância do servidor. Para várias instâncias, troque por um banco. */

import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

export function criarArmazenamento(pasta) {
  const arqLeads = path.join(pasta, "leads.jsonl");
  const arqAgenda = path.join(pasta, "agendamentos.json");
  const arqEventos = path.join(pasta, "whatsapp-eventos.jsonl");
  let fila = Promise.resolve(); // serializa escritas na agenda
  let filaEventos = Promise.resolve();
  let eventosCache;

  const garantirPasta = () => mkdir(pasta, { recursive: true });

  const lerAgenda = async () => {
    try {
      return JSON.parse(await readFile(arqAgenda, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  };

  const salvarAgenda = async (agenda) => {
    await garantirPasta();
    const tmp = `${arqAgenda}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(agenda, null, 2));
    await rename(tmp, arqAgenda);
  };

  const lerEventos = async () => {
    if (eventosCache) return eventosCache;
    eventosCache = new Map();
    try {
      const linhas = (await readFile(arqEventos, "utf8")).split("\n").filter(Boolean);
      const limite = Date.now() - 30 * 86400_000;
      for (const linha of linhas.slice(-50_000)) {
        try {
          const item = JSON.parse(linha);
          if (typeof item.id === "string" && Number(item.em) >= limite) eventosCache.set(item.id, item.em);
        } catch { /* ignora apenas a linha corrompida; as demais continuam válidas */ }
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    return eventosCache;
  };

  return {
    async salvarLead(lead) {
      await garantirPasta();
      await appendFile(arqLeads, JSON.stringify(lead) + "\n");
    },

    async listarLeads() {
      try {
        return (await readFile(arqLeads, "utf8"))
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l));
      } catch (err) {
        if (err.code === "ENOENT") return [];
        throw err;
      }
    },

    reivindicarEventoWhatsApp(id) {
      const tarefa = filaEventos.then(async () => {
        if (typeof id !== "string" || !/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) return false;
        const eventos = await lerEventos();
        const hash = createHash("sha256").update(id).digest("hex");
        if (eventos.has(hash)) return false;
        const em = Date.now();
        eventos.set(hash, em);
        await garantirPasta();
        await appendFile(arqEventos, JSON.stringify({ id: hash, em }) + "\n");
        if (eventos.size > 50_000) {
          const recentes = new Map([...eventos].slice(-25_000));
          const conteudo = [...recentes].map(([eventId, timestamp]) => JSON.stringify({ id: eventId, em: timestamp })).join("\n") + "\n";
          const tmp = `${arqEventos}.${randomUUID()}.tmp`;
          await writeFile(tmp, conteudo);
          await rename(tmp, arqEventos);
          eventosCache = recentes;
        }
        return true;
      });
      filaEventos = tarefa.catch(() => {});
      return tarefa;
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
        await salvarAgenda(agenda);
        return true;
      });
      fila = tarefa.catch(() => {});
      return tarefa;
    },

    atualizarAgendamento(id, alteracoes) {
      const tarefa = fila.then(async () => {
        const agenda = await lerAgenda();
        const indice = agenda.findIndex((a) => a.id === id);
        if (indice < 0) return false;
        agenda[indice] = { ...agenda[indice], ...alteracoes };
        await salvarAgenda(agenda);
        return true;
      });
      fila = tarefa.catch(() => {});
      return tarefa;
    },

    reivindicarLembrete(id, tipo, agendadoPara, agoraIso) {
      const tarefa = fila.then(async () => {
        const agenda = await lerAgenda();
        const item = agenda.find((a) => a.id === id && a.status === "agendado" && a.whatsapp_optin === true);
        if (!item || !["24h", "30m"].includes(tipo)) return false;
        item.lembretes ??= {};
        if (item.lembretes[tipo]) return false; // at-most-once: estado ambíguo exige verificação humana, nunca reenvio cego
        item.lembretes[tipo] = { status: "enviando", agendado_para: agendadoPara, iniciado_em: agoraIso };
        await salvarAgenda(agenda);
        return true;
      });
      fila = tarefa.catch(() => {});
      return tarefa;
    },

    concluirLembrete(id, tipo, estado, agoraIso, detalhe) {
      const tarefa = fila.then(async () => {
        const agenda = await lerAgenda();
        const item = agenda.find((a) => a.id === id);
        if (!item?.lembretes?.[tipo]) return false;
        item.lembretes[tipo] = {
          ...item.lembretes[tipo],
          status: item.whatsapp_optin === true ? estado : "cancelado",
          concluido_em: agoraIso,
          ...(detalhe ? { detalhe: String(detalhe).slice(0, 80) } : {}),
        };
        await salvarAgenda(agenda);
        return true;
      });
      fila = tarefa.catch(() => {});
      return tarefa;
    },

    revogarLembretes(telefone, agoraIso) {
      const chave = String(telefone ?? "").replace(/\D/g, "");
      const tarefa = fila.then(async () => {
        const agenda = await lerAgenda();
        let alterados = 0;
        for (const item of agenda) {
          const contato = String(item.contato ?? "").replace(/\D/g, "");
          if (contato && contato === chave && item.whatsapp_optin === true) {
            item.whatsapp_optin = false;
            item.whatsapp_optout_em = agoraIso;
            for (const lembrete of Object.values(item.lembretes ?? {})) {
              if (lembrete.status === "agendado" || lembrete.status === "enviando") lembrete.status = "cancelado";
            }
            alterados++;
          }
        }
        if (alterados) await salvarAgenda(agenda);
        return alterados;
      });
      fila = tarefa.catch(() => {});
      return tarefa;
    },

    cancelarAgendamentos(telefone, agoraIso) {
      const chave = String(telefone ?? "").replace(/\D/g, "");
      const tarefa = fila.then(async () => {
        const agenda = await lerAgenda();
        const cancelados = [];
        for (const item of agenda) {
          const contato = String(item.contato ?? "").replace(/\D/g, "");
          if (contato && contato === chave && item.status === "agendado") {
            item.status = "cancelado";
            item.cancelado_em = agoraIso;
            item.whatsapp_optin = false; // opt-in é específico a esta reunião
            for (const lembrete of Object.values(item.lembretes ?? {})) {
              if (lembrete.status === "agendado" || lembrete.status === "enviando") lembrete.status = "cancelado";
            }
            cancelados.push({ id: item.id, calendar_event_id: item.calendar_event_id ?? null });
          }
        }
        if (cancelados.length) await salvarAgenda(agenda);
        return cancelados;
      });
      fila = tarefa.catch(() => {});
      return tarefa;
    },
  };
}
