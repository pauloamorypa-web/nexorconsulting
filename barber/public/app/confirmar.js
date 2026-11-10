/* Confirmação em dois toques ("Toque de novo para cancelar") à prova de toque duplo (V-12):
   o 2º toque só confirma depois de uma pausa; toques colados ao primeiro (o mesmo gesto) são ignorados,
   e a confirmação armada vence depois de alguns segundos. */

export const ESPERA_MS = 800;
export const VALIDADE_MS = 8000;

/** O que fazer com um toque: "armar" (pedir confirmação), "ignorar" (toque duplo) ou "confirmar" */
export function decidirToque(armadoEm, agora, { espera = ESPERA_MS, validade = VALIDADE_MS } = {}) {
  if (!armadoEm || agora - armadoEm > validade) return "armar";
  if (agora - armadoEm < espera) return "ignorar";
  return "confirmar";
}

/** Usa no botão: devolve true só quando o toque confirma; arma e troca o texto no primeiro toque */
export function confirmarNoBotao(botao, textoConfirmar, agora = Date.now()) {
  const decisao = decidirToque(Number(botao.dataset.armadoEm) || 0, agora);
  if (decisao === "armar") {
    botao.dataset.armadoEm = String(agora);
    if (!botao.dataset.textoOriginal) botao.dataset.textoOriginal = botao.lastChild.textContent;
    botao.lastChild.textContent = textoConfirmar;
    setTimeout(() => {
      if (botao.dataset.armadoEm === String(agora)) {
        delete botao.dataset.armadoEm;
        botao.lastChild.textContent = botao.dataset.textoOriginal;
      }
    }, VALIDADE_MS).unref?.();
  }
  return decisao === "confirmar";
}
