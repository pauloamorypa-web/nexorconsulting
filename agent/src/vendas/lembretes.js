const FUSO = "America/Sao_Paulo";
const REGRAS = [
  { tipo: "24h", antesMs: 24 * 60 * 60_000, toleranciaMs: 2 * 60 * 60_000, template: "templateLembrete24h" },
  { tipo: "30m", antesMs: 30 * 60_000, toleranciaMs: 10 * 60_000, template: "templateLembrete30m" },
];

export function criarAgendadorLembretes({ armazenamento, enviar, configuracao, agora = () => new Date(), intervaloMs = 60_000, log = () => {} }) {
  let timer;
  let rodando = false;

  async function executar() {
    if (rodando) return;
    rodando = true;
    try {
      const atual = agora();
      const agenda = await armazenamento.listarAgendamentos();
      for (const reuniao of agenda) {
        if (reuniao.status !== "agendado" || reuniao.whatsapp_optin !== true || !reuniao.link_reuniao) continue;
        const telefone = String(reuniao.contato ?? "").replace(/\D/g, "");
        if (!/^\d{8,15}$/.test(telefone)) continue;
        const inicio = new Date(`${reuniao.horario}:00-03:00`);
        if (!Number.isFinite(inicio.getTime()) || inicio <= atual) continue;
        for (const regra of REGRAS) {
          const template = configuracao[regra.template];
          if (!template || reuniao.lembretes?.[regra.tipo]) continue;
          const enviarEm = new Date(inicio.getTime() - regra.antesMs);
          if (atual < enviarEm) continue;
          const reivindicado = await armazenamento.reivindicarLembrete(reuniao.id, regra.tipo, enviarEm.toISOString(), atual.toISOString());
          if (!reivindicado) continue;
          if (atual.getTime() - enviarEm.getTime() > regra.toleranciaMs) {
            await armazenamento.concluirLembrete(reuniao.id, regra.tipo, "expirado", atual.toISOString());
            continue;
          }
          const horaLocal = inicio.toLocaleString("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" });
          try {
            const resposta = await enviar(telefone, template, [String(reuniao.nome ?? "").slice(0, 80), horaLocal, reuniao.link_reuniao]);
            const idMensagem = resposta?.messages?.[0]?.id;
            await armazenamento.concluirLembrete(reuniao.id, regra.tipo, "enviado", agora().toISOString(), idMensagem);
          } catch (erro) {
            // Sem retry automático: timeout pode ocorrer depois de a Meta aceitar a mensagem.
            await armazenamento.concluirLembrete(reuniao.id, regra.tipo, "falhou", agora().toISOString(), erro?.name ?? "erro");
            log("lembrete WhatsApp falhou; precisa de revisão humana", { tipo: regra.tipo });
          }
        }
      }
    } catch (erro) {
      log("worker de lembretes falhou", { erro: erro?.name ?? "Error" });
    } finally {
      rodando = false;
    }
  }

  return {
    executar,
    iniciar() {
      if (timer) return;
      timer = setInterval(executar, intervaloMs);
      timer.unref?.();
      void executar();
    },
    parar() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
