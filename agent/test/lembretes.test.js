import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { criarArmazenamento } from "../src/armazenamento.js";
import { criarAgendadorLembretes } from "../src/vendas/lembretes.js";

const pastas = new Set();
after(async () => Promise.all([...pastas].map((p) => rm(p, { recursive: true, force: true }))));

async function bancoReuniao({ optin = true, link = "https://meet.google.com/abc-defg-hij" } = {}) {
  const pasta = await mkdtemp(path.join(process.cwd(), ".nexor-reminders-"));
  pastas.add(pasta);
  const armazenamento = criarArmazenamento(pasta);
  const horario = "2026-11-10T15:00";
  const inicio = new Date(`${horario}:00-03:00`);
  await armazenamento.reservar({ id: "meeting-1", horario, status: "agendado", nome: "Ana", contato: "+55 (34) 99999-0000", whatsapp_optin: optin, link_reuniao: link });
  return { armazenamento, inicio };
}

test("lembrete 24h usa template aprovado, timezone local e envia no máximo uma vez", async () => {
  const { armazenamento, inicio } = await bancoReuniao();
  const agora = new Date(inicio.getTime() - 24 * 60 * 60_000);
  const enviados = [];
  const worker = criarAgendadorLembretes({
    armazenamento,
    configuracao: { templateLembrete24h: "nexor_reuniao_24h", templateLembrete30m: "nexor_reuniao_30m" },
    agora: () => agora,
    enviar: async (...args) => { enviados.push(args); return { messages: [{ id: "wamid.mock" }] }; },
  });
  await Promise.all([worker.executar(), worker.executar()]);
  await worker.executar();
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0][0], "5534999990000");
  assert.equal(enviados[0][1], "nexor_reuniao_24h");
  assert.match(enviados[0][2][1], /10\/11\/2026/);
  const salvo = (await armazenamento.listarAgendamentos())[0];
  assert.equal(salvo.lembretes["24h"].status, "enviado");
  assert.equal(salvo.lembretes["24h"].detalhe, "wamid.mock");
});

test("sem opt-in, link, template ou WhatsApp válido não há envio", async () => {
  const { armazenamento, inicio } = await bancoReuniao({ optin: false });
  let envios = 0;
  const worker = criarAgendadorLembretes({ armazenamento, configuracao: { templateLembrete24h: "template" }, agora: () => new Date(inicio.getTime() - 24 * 60 * 60_000), enviar: async () => { envios++; } });
  await worker.executar();
  const semLink = await bancoReuniao({ link: null });
  const worker2 = criarAgendadorLembretes({ armazenamento: semLink.armazenamento, configuracao: { templateLembrete24h: "template" }, agora: () => new Date(semLink.inicio.getTime() - 24 * 60 * 60_000), enviar: async () => { envios++; } });
  await worker2.executar();
  assert.equal(envios, 0);
});

test("falha ambígua da Meta não causa retry automático", async () => {
  const { armazenamento, inicio } = await bancoReuniao();
  let tentativas = 0;
  const worker = criarAgendadorLembretes({
    armazenamento,
    configuracao: { templateLembrete24h: "nexor_reuniao_24h" },
    agora: () => new Date(inicio.getTime() - 24 * 60 * 60_000),
    enviar: async () => { tentativas++; throw new Error("timeout"); },
  });
  await worker.executar();
  await worker.executar();
  assert.equal(tentativas, 1);
  assert.equal((await armazenamento.listarAgendamentos())[0].lembretes["24h"].status, "falhou");
});

test("claim concorrente e opt-out cancelam lembrete pendente", async () => {
  const { armazenamento, inicio } = await bancoReuniao();
  const executar = () => armazenamento.reivindicarLembrete("meeting-1", "24h", new Date(inicio.getTime() - 86400_000).toISOString(), new Date(inicio.getTime() - 86400_000).toISOString());
  const claims = await Promise.all([executar(), executar(), executar()]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await armazenamento.revogarLembretes("5534999990000", new Date().toISOString()), 1);
  const salvo = (await armazenamento.listarAgendamentos())[0];
  assert.equal(salvo.whatsapp_optin, false);
  assert.equal(salvo.lembretes["24h"].status, "cancelado");
  assert.equal(await executar(), false);
});

test("IDs de webhook persistem dedupe após reinício e entradas fora do formato são recusadas", async () => {
  const pasta = await mkdtemp(path.join(process.cwd(), ".nexor-webhook-id-"));
  pastas.add(pasta);
  const primeira = criarArmazenamento(pasta);
  assert.equal(await primeira.reivindicarEventoWhatsApp("wamid.HBgNNTUzNDk5OTk5MDAwMBUCABIYFDNFQjA"), true);
  assert.equal(await primeira.reivindicarEventoWhatsApp("../../etc/passwd"), false);
  const reiniciada = criarArmazenamento(pasta);
  assert.equal(await reiniciada.reivindicarEventoWhatsApp("wamid.HBgNNTUzNDk5OTk5MDAwMBUCABIYFDNFQjA"), false);
});

test("cancelar reunião marca evento e lembretes como cancelados e libera o horário", async () => {
  const { armazenamento } = await bancoReuniao();
  const cancelados = await armazenamento.cancelarAgendamentos("+55 34 99999-0000", new Date().toISOString());
  assert.equal(cancelados.length, 1);
  assert.equal(cancelados[0].calendar_event_id, null);
  const salvo = (await armazenamento.listarAgendamentos())[0];
  assert.equal(salvo.status, "cancelado");
  assert.equal(salvo.whatsapp_optin, false);
  assert.equal(await armazenamento.reivindicarLembrete("meeting-1", "24h", new Date().toISOString(), new Date().toISOString()), false);
});
