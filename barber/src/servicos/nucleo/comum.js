/* Peças comuns do núcleo: erro de regra de negócio, formas de pagamento e formatação de dinheiro. */

export class ErroRegra extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}
export const recusar = (status, mensagem) => {
  throw new ErroRegra(status, mensagem);
};

export const FORMAS = { dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", credito: "Crédito", clube: "Clube (assinatura)", outro: "Outro" };
export const reais = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
