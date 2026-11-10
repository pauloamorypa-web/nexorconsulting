/* Lista de espera relâmpago: entrar na fila, oferecer a vaga e aceitar.
   Parte do núcleo (criarNucleo em ../nucleo.js): recebe o espaço comum nx e acrescenta as suas funções nele. */

import { faz, horariosLivres } from "../../regras/agenda.js";
import { hojeBR, horaBR, paraMs, quando } from "../../regras/datas.js";
import { gerarToken, sha256 } from "../../seguranca.js";
import { recusar } from "./comum.js";

export function criarEspera(nx) {
  const { repo, agora } = nx;
  const agendar = (...a) => nx.agendar(...a);
  const barbeiroAtivo = (...a) => nx.barbeiroAtivo(...a);
  const exigirBarbearia = (...a) => nx.exigirBarbearia(...a);
  const hoje = (...a) => nx.hoje(...a);
  const linkApp = (...a) => nx.linkApp(...a);
  const notificar = (...a) => nx.notificar(...a);
  const ocupados = (...a) => nx.ocupados(...a);
  const servicoAtivo = (...a) => nx.servicoAtivo(...a);

  /* ---------- Lista de espera relâmpago ---------- */
  function entrarNaEspera({ cliente, servicoId, barbeiroId = null, dia, de, ate }) {
    const b = exigirBarbearia();
    servicoAtivo(servicoId);
    if (barbeiroId) barbeiroAtivo(barbeiroId);
    if (dia < hoje()) recusar(400, "Escolha um dia a partir de hoje.");
    if (de >= ate) recusar(400, "O horário final precisa ser depois do inicial.");
    const ja = repo.um("SELECT 1 FROM espera WHERE cliente_id = ? AND dia = ? AND status IN ('aguardando','oferecida')", cliente.id, dia);
    if (ja) recusar(409, "Você já está na lista de espera deste dia.");
    return repo.inserir("espera", { barbearia_id: b.id, cliente_id: cliente.id, servico_id: servicoId, barbeiro_id: barbeiroId, dia, de, ate });
  }

  /** Uma vaga abriu: oferece para até 3 pessoas da fila daquele dia. Quem confirmar primeiro leva. */
  async function oferecerVaga(vaga) {
    const b = exigirBarbearia();
    if (b.config.regras.lista_espera === false) return 0;
    const dia = hojeBR(vaga.inicio);
    const fila = repo.lista("espera", "WHERE dia = ? AND status = 'aguardando' ORDER BY criado_em", dia);
    let ofertas = 0;
    for (const e of fila) {
      if (ofertas >= 3) break;
      if (e.barbeiro_id && e.barbeiro_id !== vaga.barbeiro_id) continue;
      const servico = repo.obter("servicos", e.servico_id);
      const barbeiro = repo.obter("barbeiros", vaga.barbeiro_id);
      if (!servico?.ativo || !barbeiro?.ativo || !faz(barbeiro, servico.id)) continue;
      const hora = horaBR(vaga.inicio);
      if (hora < e.de || hora > e.ate) continue;
      const livresAgora = horariosLivres({ barbearia: b, barbeiro, servico, dia, ocupados: ocupados(barbeiro.id, dia), agora: agora() });
      if (!livresAgora.includes(hora)) continue;
      const token = gerarToken(18);
      repo.atualizar("espera", e.id, { status: "oferecida", oferta: { barbeiro_id: barbeiro.id, hora, expira_em: agora() + 30 * 60_000 }, oferta_hash: sha256(token), oferecida_em: agora() });
      const cliente = repo.obter("clientes", e.cliente_id);
      const quandoTxt = quando(paraMs(dia, hora));
      await notificar(cliente, "vaga", { texto: `⚡ ${cliente.nome.split(" ")[0]}, abriu um horário na ${b.nome}: ${servico.nome} com ${barbeiro.nome}, ${quandoTxt}. Quem confirmar primeiro leva: ${linkApp(`#vaga-${token}`)}`, parametros: [cliente.nome.split(" ")[0], quandoTxt, linkApp(`#vaga-${token}`)] });
      ofertas++;
    }
    return ofertas;
  }

  function vagaPorToken(token) {
    const e = repo.lista("espera", "WHERE oferta_hash = ?", sha256(String(token ?? "")))[0];
    if (!e) recusar(404, "Oferta não encontrada.");
    return e;
  }

  function aceitarVaga(token, cliente) {
    const e = vagaPorToken(token);
    if (e.cliente_id !== cliente.id) recusar(403, "Esta oferta foi enviada para outra pessoa.");
    if (e.status !== "oferecida" || !e.oferta || e.oferta.expira_em < agora()) recusar(410, "Esta oferta venceu ou alguém confirmou antes. Você continua na lista de espera.");
    try {
      const ag = agendar({ cliente, servicoId: e.servico_id, barbeiroId: e.oferta.barbeiro_id, dia: e.dia, hora: e.oferta.hora, origem: "espera", autor: cliente.nome });
      repo.atualizar("espera", e.id, { status: "atendida", oferta_hash: null });
      // Quem recebeu a mesma vaga e não confirmou volta para a fila
      repo.rodar("UPDATE espera SET status = 'aguardando', oferta = NULL WHERE dia = ? AND status = 'oferecida' AND id <> ? AND json_extract(oferta, '$.hora') = ? AND json_extract(oferta, '$.barbeiro_id') = ?", e.dia, e.id, e.oferta.hora, e.oferta.barbeiro_id);
      return ag;
    } catch (err) {
      if (err.status === 409) {
        repo.atualizar("espera", e.id, { status: "aguardando", oferta: null, oferta_hash: null });
        recusar(409, "Alguém confirmou antes. Você continua na lista de espera.");
      }
      throw err;
    }
  }

  Object.assign(nx, { entrarNaEspera, oferecerVaga, vagaPorToken, aceitarVaga });
}
