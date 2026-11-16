/* Configuração dos vídeos verticais de cada produto.
   frases: o texto falado na locução, um item por trecho separado por "..." no ElevenLabs.
   cenas: uma por frase (o número da frase diz quando a cena entra). *texto* = destaque em degradê.
   foco: ponto da tela (x, y em %) e quanto aproximar, para a parte citada na fala. */
import type { Produto } from "./VideoProduto";
import tBarber from "./tempos/barber";
import tAtende from "./tempos/atende";

export const PRODUTOS: Produto[] = [
  {
    id: "NexorBarber30s",
    nome: "Nexor Barber",
    pasta: "barber",
    tempos: tBarber,
    frases: [
      "Parou o corte pra atender o telefone?",
      "No Nexor Barber, o cliente agenda sozinho, em um toque.",
      "Recebe o lembrete no WhatsApp, entra na lista de espera se alguém cancelar, e ainda pode assinar o clube da barbearia.",
      "No fim do dia, o caixa e as comissões já estão fechados.",
      "Você corta. O sistema cuida do resto.",
      "Teste grátis por trinta dias. O link está na bio.",
    ],
    cenas: [
      { tipo: "gancho", frase: 0, emoji: "📞", texto: "Parou o corte pra *atender o telefone?*" },
      { tipo: "tela", frase: 1, src: "barber/app-agendar.webp", foco: { x: 50, y: 30, escala: 1.55 }, titulo: "O cliente agenda *em um toque.*" },
      { tipo: "tela", frase: 2, src: "barber/agenda.webp", foco: { x: 40, y: 45, escala: 1.6 }, titulo: "Lembrete no WhatsApp e *lista de espera.*" },
      { tipo: "tela", frase: 2, inicio: 9.61, src: "barber/clube.webp", foco: { x: 18, y: 32, escala: 1.75 }, titulo: "Clube de *assinatura.*" },
      { tipo: "tela", frase: 3, src: "barber/caixa.webp", foco: { x: 40, y: 38, escala: 1.6 }, titulo: "Caixa e comissões *já fechados.*" },
      { tipo: "frase", frase: 4, linha1: "Você corta.", linha2: "*O sistema cuida do resto.*" },
      { tipo: "final", frase: 5, chamada: "Teste grátis por *30 dias*", botao: "Link na bio →" },
    ],
  },
  {
    id: "NexorAtende30s",
    nome: "Nexor Atende IA",
    pasta: "atende",
    tempos: tAtende,
    frases: [
      "Dez da noite. Um cliente perguntou o preço no WhatsApp. E ninguém respondeu.",
      "Com o Nexor Atende IA, a inteligência artificial responde na hora, com os preços e as regras da sua empresa.",
      "Ela tira as dúvidas, agenda e confirma o horário.",
      "E passa para a sua equipe quando precisa, com o resumo pronto.",
      "Cada conversa vira um contato, e você sabe quem está pronto para comprar.",
      "Seu WhatsApp atendendo vinte e quatro horas.",
      "Teste grátis por trinta dias. O link está na bio.",
    ],
    cenas: [
      { tipo: "gancho", frase: 0, emoji: "🌙", texto: "22h. Cliente perguntou o preço. *Ninguém respondeu.*" },
      { tipo: "tela", frase: 1, src: "atende/conversa.webp", foco: { x: 50, y: 40, escala: 1.6 }, titulo: "A IA responde *na hora.*" },
      { tipo: "tela", frase: 2, src: "atende/agenda.webp", foco: { x: 45, y: 40, escala: 1.6 }, titulo: "Tira dúvidas, *agenda e confirma.*" },
      { tipo: "tela", frase: 3, src: "atende/transferencia.webp", foco: { x: 55, y: 40, escala: 1.6 }, titulo: "Passa para a equipe *com o resumo.*" },
      { tipo: "tela", frase: 4, src: "atende/funil.webp", foco: { x: 40, y: 40, escala: 1.55 }, titulo: "Quem está *pronto para comprar.*" },
      { tipo: "frase", frase: 5, linha1: "Seu WhatsApp atendendo", linha2: "*24 horas.*" },
      { tipo: "final", frase: 6, chamada: "Teste grátis por *30 dias*", botao: "Link na bio →" },
    ],
  },
];
