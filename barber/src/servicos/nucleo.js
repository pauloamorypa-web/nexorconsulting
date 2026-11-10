/* Regras de negócio do Nexor Barber, usadas pelo painel, pelo app do cliente, pelos webhooks e pela rotina.
   Tudo o que mexe em agenda, estoque ou dinheiro roda dentro de uma transação. */

import { createHmac, randomInt } from "node:crypto";
import { REGRAS_PADRAO } from "../regras/agenda.js";
import { hojeBR } from "../regras/datas.js";
import { gerarToken, iguais, sha256 } from "../seguranca.js";
import { criarAsaas, criarSms, criarWhatsApp, normalizarFone } from "./canais.js";
import { recusar } from "./nucleo/comum.js";
import { criarAgenda } from "./nucleo/agenda.js";
import { criarClube } from "./nucleo/clube.js";
import { criarCaixa } from "./nucleo/caixa.js";
import { criarEspera } from "./nucleo/espera.js";
import { criarRotina } from "./nucleo/rotina.js";

export { ErroRegra, FORMAS } from "./nucleo/comum.js";

export function criarNucleo({ repo, cofre, cfg, fetchFn = fetch, agora = () => Date.now() }) {
  const hoje = () => hojeBR(agora());
  const segredo = (c) => {
    try {
      return cofre.decifrar(c);
    } catch {
      return "";
    }
  };
  const barbearia = () => {
    const b = repo.barbearia();
    if (!b) return null;
    b.config = { ...b.config, regras: { ...REGRAS_PADRAO, ...(b.config.regras ?? {}) } };
    return b;
  };
  const exigirBarbearia = () => barbearia() ?? recusar(409, "A barbearia ainda não foi criada.");

  /* ---------- Token do webhook do Asaas: gerado no servidor, guardado cifrado ---------- */
  const TOKEN_WEBHOOK_MIN = 24;
  const novoTokenWebhook = () => cofre.cifrar(gerarToken(24));
  /** Token em claro (para conferir o webhook e mostrar na aba Canais). Vazio se não houver ou for curto demais. */
  function tokenWebhookAsaas(b = barbearia()) {
    const a = b?.config.asaas ?? {};
    const t = a.token_webhook_cripto ? segredo(a.token_webhook_cripto) : "";
    return t.length >= TOKEN_WEBHOOK_MIN ? t : "";
  }
  /**
   * Migração de bancos antigos (idempotente): o token do webhook do Asaas saía em texto puro na configuração.
   * Tokens com 24+ caracteres são cifrados e continuam valendo; curtos (ou "true"/"false") são trocados por um novo.
   */
  function migrarConfig() {
    const b = repo.barbearia();
    const a = b?.config.asaas;
    if (!a || !("token_webhook" in a)) return false;
    const { token_webhook: antigo, ...resto } = a;
    const valido = typeof antigo === "string" && antigo.length >= TOKEN_WEBHOOK_MIN && antigo !== "true" && antigo !== "false";
    const asaas = { ...resto, token_webhook_cripto: resto.token_webhook_cripto || (valido ? cofre.cifrar(antigo) : antigo ? novoTokenWebhook() : undefined) };
    if (!asaas.token_webhook_cripto) delete asaas.token_webhook_cripto;
    repo.atualizar("barbearias", b.id, { config: { ...b.config, asaas } });
    if (antigo && !valido) repo.auditar(b.id, "sistema", "token_webhook_asaas_trocado", { motivo: "token antigo curto demais; cole o novo no painel do Asaas" });
    return true;
  }
  const linkApp = (caminho = "") => `${cfg.urlPublica || ""}/app/${caminho}`;

  function canais(b = exigirBarbearia()) {
    const w = b.config.whatsapp ?? {};
    const s = b.config.sms ?? {};
    const a = b.config.asaas ?? {};
    return {
      whatsapp: criarWhatsApp({ token: segredo(w.token_cripto), idNumero: w.id_numero, versao: cfg.meta.versaoGraph, idioma: w.idioma || "pt_BR", fetchFn }),
      sms: criarSms({ sid: s.sid, token: segredo(s.token_cripto), de: s.de, url: cfg.sms.url, fetchFn }),
      asaas: criarAsaas({ chave: segredo(a.chave_cripto), url: a.ambiente === "producao" ? cfg.asaas.producao : cfg.asaas.sandbox, fetchFn }),
      modelos: w.modelos ?? {},
    };
  }

  /* ---------- Mensagens ---------- */
  const registrar = (b, cliente_id, canal, motivo, status, erro = null) => repo.inserir("envios", { barbearia_id: b.id, cliente_id, canal, motivo, status, erro: erro ? String(erro).slice(0, 300) : null });

  /** Manda pelo WhatsApp (modelo aprovado, se houver) e, se não der, por SMS. Nunca derruba a operação. */
  async function notificar(cliente, motivo, { texto, parametros = [] }) {
    const b = exigirBarbearia();
    if (!cliente?.fone || !cliente.aceita_mensagens) return { enviado: false, pulado: true };
    const c = canais(b);
    if (c.whatsapp.ativo) {
      try {
        if (c.modelos[motivo]) await c.whatsapp.modelo(cliente.fone, c.modelos[motivo], parametros);
        else await c.whatsapp.texto(cliente.fone, texto);
        registrar(b, cliente.id, "whatsapp", motivo, "enviado");
        return { enviado: true, canal: "whatsapp" };
      } catch (e) {
        registrar(b, cliente.id, "whatsapp", motivo, "erro", e.message);
      }
    }
    if (c.sms.ativo && (b.config.sms?.avisos ?? true)) {
      try {
        await c.sms.enviar(cliente.fone, texto);
        registrar(b, cliente.id, "sms", motivo, "enviado");
        return { enviado: true, canal: "sms" };
      } catch (e) {
        registrar(b, cliente.id, "sms", motivo, "erro", e.message);
      }
    }
    // falhou: algum canal estava ativo e não conseguiu (vale tentar de novo); sem canal ativo, não há o que tentar
    return { enviado: false, falhou: c.whatsapp.ativo || (c.sms.ativo && (b.config.sms?.avisos ?? true)) };
  }

  /* ---------- Código de acesso (WhatsApp ou SMS) ---------- */
  const chaveCodigos = sha256(`codigos:${cfg.chaveMestra || cfg.pastaDados}`);
  const hashCodigo = (destino, codigo) => createHmac("sha256", chaveCodigos).update(`${destino}:${codigo}`).digest("hex");

  async function enviarCodigo(foneBruto, canal) {
    const b = exigirBarbearia();
    const fone = normalizarFone(foneBruto);
    if (!fone) recusar(400, "Digite o celular com DDD.");
    const recentes = repo.um("SELECT COUNT(*) n FROM codigos WHERE destino = ? AND criado_em > ?", fone, agora() - 3600_000).n;
    if (recentes >= cfg.limites.codigosPorHora) recusar(429, "Muitos códigos pedidos para este número. Tente de novo em uma hora.");
    const c = canais(b);
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const texto = `${codigo} é o seu código para entrar na ${b.nome}. Ele vale por 10 minutos.`;
    if (canal === "whatsapp" && !c.whatsapp.ativo) recusar(400, "O login pelo WhatsApp não está ativo nesta barbearia.");
    if (canal !== "whatsapp" && !c.sms.ativo) recusar(400, "O login por SMS não está ativo nesta barbearia.");
    // Grava o código antes de enviar: a contagem do limite por hora já vale para pedidos simultâneos (V-23).
    // Códigos usados, vencidos ou que não saíram ficam com expira_em = 0 e continuam contando por uma hora.
    repo.rodar("DELETE FROM codigos WHERE destino = ? AND criado_em < ?", fone, agora() - 3600_000);
    const reg = repo.inserir("codigos", { destino: fone, canal, hash: hashCodigo(fone, codigo), expira_em: agora() + 10 * 60_000 });
    try {
      if (canal === "whatsapp") {
        if (c.modelos.codigo) await c.whatsapp.codigo(fone, c.modelos.codigo, codigo);
        else await c.whatsapp.texto(fone, texto);
      } else await c.sms.enviar(fone, texto);
    } catch (e) {
      // O detalhe técnico fica no registro de envios; quem chama mostra uma mensagem simples (V-37)
      repo.rodar("UPDATE codigos SET expira_em = 0 WHERE id = ?", reg.id);
      registrar(b, null, canal, "codigo", "erro", e.message);
      throw e;
    }
    registrar(b, null, canal, "codigo", "enviado");
    return { fone, canal };
  }

  /** Confere o código; certo, ele é apagado (uso único). Cinco erros invalidam o código. */
  function conferirCodigo(foneBruto, codigo) {
    const fone = normalizarFone(foneBruto);
    const c = fone ? repo.um("SELECT * FROM codigos WHERE destino = ? AND expira_em > ? ORDER BY criado_em DESC LIMIT 1", fone, agora()) : null;
    if (!c) recusar(400, "Código vencido. Peça um novo.");
    if (c.tentativas >= 5) recusar(429, "Código bloqueado depois de muitas tentativas. Peça um novo.");
    if (!iguais(c.hash, hashCodigo(fone, String(codigo ?? "").replace(/\D/g, "")))) {
      repo.rodar("UPDATE codigos SET tentativas = tentativas + 1 WHERE id = ?", c.id);
      recusar(400, "Código incorreto.");
    }
    // Uso único: invalida os códigos do número, mas mantém os registros para o limite por hora
    repo.rodar("UPDATE codigos SET expira_em = 0 WHERE destino = ?", fone);
    return fone;
  }

  /* ---------- Módulos: cada um acrescenta as suas funções no espaço comum ---------- */
  const nx = { repo, cofre, cfg, fetchFn, agora, hoje, segredo, barbearia, exigirBarbearia, novoTokenWebhook, tokenWebhookAsaas, migrarConfig, linkApp, canais, registrar, notificar, hashCodigo, enviarCodigo, conferirCodigo };
  criarAgenda(nx);
  criarClube(nx);
  criarCaixa(nx);
  criarEspera(nx);
  criarRotina(nx);

  return {
    barbearia,
    exigirBarbearia,
    tokenWebhookAsaas,
    novoTokenWebhook,
    migrarConfig,
    canais,
    segredo,
    notificar,
    registrarEnvio: (cliente_id, canal, motivo, status, erro) => registrar(exigirBarbearia(), cliente_id, canal, motivo, status, erro),
    enviarCodigo,
    conferirCodigo,
    livres: nx.livres,
    diasDisponiveis: nx.diasDisponiveis,
    ocupados: nx.ocupados,
    agendar: nx.agendar,
    detalhar: nx.detalhar,
    detalharVarios: nx.detalharVarios,
    podeMudar: nx.podeMudar,
    cancelar: nx.cancelar,
    remarcar: nx.remarcar,
    mudarStatus: nx.mudarStatus,
    recalcularCobertura: nx.recalcularCobertura,
    vender: nx.vender,
    concluir: nx.concluir,
    cancelarVenda: nx.cancelarVenda,
    movimentarEstoque: nx.movimentarEstoque,
    disponivel: nx.disponivel,
    reservar: nx.reservar,
    mudarReserva: nx.mudarReserva,
    liberarReservas: nx.liberarReservas,
    atualizarRetorno: nx.atualizarRetorno,
    assinaturaAtual: nx.assinaturaAtual,
    usosNoCiclo: nx.usosNoCiclo,
    coberturaDoCliente: nx.coberturaDoCliente,
    identificarAssinante: nx.identificarAssinante,
    assinar: nx.assinar,
    registrarPagamento: nx.registrarPagamento,
    pagamentoManual: nx.pagamentoManual,
    cancelarAssinatura: nx.cancelarAssinatura,
    eventoAsaas: nx.eventoAsaas,
    entrarNaEspera: nx.entrarNaEspera,
    oferecerVaga: nx.oferecerVaga,
    vagaPorToken: nx.vagaPorToken,
    aceitarVaga: nx.aceitarVaga,
    rotina: nx.rotina,
    ics: nx.ics,
    linkApp,
  };
}
