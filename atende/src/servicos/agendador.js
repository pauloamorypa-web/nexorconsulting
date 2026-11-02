/* Tarefas automáticas que rodam em segundo plano:
   - campanhas: dispara modelos aprovados para o público escolhido, respeitando quem pediu para sair
   - follow-up: retoma conversas em que o cliente parou de responder (dentro da janela de 24 h)
   - lembretes: avisa o cliente antes do horário agendado */

import { configCompleta } from "../db.js";
import { formatarQuando } from "./agenda.js";
import { JANELA_MS, janelaAberta } from "./atendimento.js";

const LOTE_CAMPANHA = 20;

/** Troca {nome}, {primeiro_nome}, {telefone}, {email}, {etapa} e {campo:xxx} pelos dados do contato */
export function preencherVariavel(modelo, contato) {
  const nome = contato.nome || contato.nome_perfil || "";
  return String(modelo ?? "")
    .replace(/\{primeiro_nome\}/g, nome.split(/\s+/)[0] || "cliente")
    .replace(/\{nome\}/g, nome || "cliente")
    .replace(/\{telefone\}/g, contato.wa_id)
    .replace(/\{email\}/g, contato.email ?? "")
    .replace(/\{etapa\}/g, contato.etapa ?? "")
    .replace(/\{campo:([\w-]+)\}/g, (_, k) => String(contato.campos?.[k] ?? ""))
    .trim();
}

export function criarAgendador({ repo, atendimento, eventos, agora = () => Date.now(), intervaloMs = 15_000 }) {
  let rodando = false;
  let timer;

  async function prepararCampanhas() {
    for (const c of repo.campanhasProntas()) {
      const publico = repo.contatosParaCampanha(c.empresa_id, { tags: c.filtro.tags ?? [], etapas: c.filtro.etapas ?? [] });
      const ids = (c.filtro.contatos?.length ? publico.filter((p) => c.filtro.contatos.includes(p.id)) : publico).map((p) => p.id);
      repo.adicionarEnvios(c.id, ids);
      repo.statusCampanha(c.id, "enviando", { total: ids.length });
      eventos.emitir(c.empresa_id, "campanha", repo.campanha(c.empresa_id, c.id));
    }
  }

  async function enviarCampanhas() {
    for (const c of repo.campanhasEnviando()) {
      const lote = repo.proximosEnvios(c.id, LOTE_CAMPANHA);
      for (const envio of lote) {
        const contato = repo.contato(c.empresa_id, envio.contato_id);
        if (!contato || contato.opt_out) {
          repo.marcarEnvio(envio.id, "falhou", { erro: "contato pediu para não receber" });
          continue;
        }
        let conversa = repo.conversaAtiva(c.empresa_id, contato.id);
        // A conversa da campanha fica com a IA: quem responder já é atendido na hora
        if (!conversa) conversa = repo.criarConversa({ empresa_id: c.empresa_id, contato_id: contato.id, canal_id: c.canal_id, modo: "ia" });
        try {
          const m = await atendimento.enviar({
            empresa_id: c.empresa_id,
            conversa: { ...conversa, canal_id: c.canal_id },
            contato,
            autor: "campanha",
            tipo: "modelo",
            dados: { nome: c.modelo_nome, idioma: c.idioma, variaveis: c.variaveis.map((v) => preencherVariavel(v, contato)), cabecalhoMidia: c.filtro.cabecalho_midia },
          });
          repo.marcarEnvio(envio.id, "enviado", { wamid: m.wamid });
        } catch (err) {
          repo.marcarEnvio(envio.id, "falhou", { erro: err.message });
        }
      }
      const r = repo.recontarCampanha(c.id);
      if (!r.fila) repo.statusCampanha(c.id, "concluida", { concluida_em: agora() });
      eventos.emitir(c.empresa_id, "campanha", repo.campanha(c.empresa_id, c.id));
    }
  }

  async function followups() {
    const candidatas = repo.conversasParaFollowup(agora() - 3600_000);
    for (const conv of candidatas) {
      const empresa = repo.empresa(conv.empresa_id);
      const cfg = configCompleta(empresa.config);
      if (!cfg.followup.ativo || cfg.agente.modo !== "automatico" || conv.followups >= cfg.followup.maximo) continue;
      if (agora() - conv.ultima_msg_em < cfg.followup.horas * 3600_000) continue;
      const contato = repo.contato(conv.empresa_id, conv.contato_id);
      // Só dentro da janela de 24 h e com folga de 30 min
      if (!janelaAberta(contato, agora() + 30 * 60_000)) continue;
      await atendimento.responderConversa(conv.empresa_id, conv.id, {
        followup: true,
        notaFinal:
          "<instrucao_do_sistema>O cliente não respondeu à sua última mensagem. Escreva UMA mensagem curta e gentil para retomar a conversa, ligada ao que ele queria (ex.: tirar uma dúvida que ficou, lembrar de um benefício, oferecer ajuda). Não repita a mensagem anterior, não pressione e não use ferramentas, a não ser que precise de uma informação.</instrucao_do_sistema>",
      });
    }
  }

  async function lembretes() {
    for (const empresa of repo.empresas()) {
      const cfg = configCompleta(empresa.config);
      if (!cfg.agenda.ativa || !cfg.agenda.lembrete_horas) continue;
      for (const a of repo.agendamentosParaLembrete(agora() + cfg.agenda.lembrete_horas * 3600_000).filter((x) => x.empresa_id === empresa.id)) {
        repo.marcarLembrete(a.id);
        const contato = a.contato_id && repo.contato(empresa.id, a.contato_id);
        if (!contato) continue;
        const conversa = repo.conversaAtiva(empresa.id, contato.id) ?? repo.criarConversa({ empresa_id: empresa.id, contato_id: contato.id, canal_id: repo.canais(empresa.id)[0]?.id, modo: "ia" });
        const quando = formatarQuando(a.inicio);
        try {
          if (janelaAberta(contato, agora())) {
            await atendimento.enviar({
              empresa_id: empresa.id,
              conversa,
              contato,
              autor: "sistema",
              tipo: "botoes",
              dados: { texto: `Oi${contato.nome ? `, ${contato.nome.split(" ")[0]}` : ""}! Passando para lembrar: *${a.servico}* ${quando}. Podemos confirmar?`, botoes: [{ id: "confirmar", titulo: "Confirmar" }, { id: "remarcar", titulo: "Remarcar" }] },
            });
          } else if (cfg.agenda.modelo_lembrete?.nome) {
            const nome = contato.nome || contato.nome_perfil || "cliente";
            await atendimento.enviar({
              empresa_id: empresa.id,
              conversa,
              contato,
              autor: "sistema",
              tipo: "modelo",
              dados: { nome: cfg.agenda.modelo_lembrete.nome, idioma: cfg.agenda.modelo_lembrete.idioma ?? "pt_BR", variaveis: [nome.split(" ")[0], a.servico, quando] },
            });
          } else {
            atendimento.nota(empresa.id, conversa.id, `⏰ Lembrete não enviado (janela de 24 h fechada e sem modelo de lembrete): ${a.servico} ${quando}`);
          }
        } catch (err) {
          atendimento.nota(empresa.id, conversa.id, `⚠️ Falha ao enviar lembrete: ${err.message}`);
        }
      }
    }
  }

  async function ciclo() {
    if (rodando) return;
    rodando = true;
    try {
      await prepararCampanhas();
      await enviarCampanhas();
      await followups();
      await lembretes();
    } catch (err) {
      console.error("[agendador]", err);
    } finally {
      rodando = false;
    }
  }

  return {
    ciclo,
    iniciar() {
      timer = setInterval(ciclo, intervaloMs);
      timer.unref?.();
    },
    parar: () => clearInterval(timer),
    JANELA_MS,
  };
}
