/* Limite de tentativas (rate limit) em memória, sem dependências.
   O produto roda num único processo com SQLite, então um Map basta: cada chave guarda os instantes das tentativas
   que ainda estão dentro da janela, e uma limpeza periódica descarta as chaves vencidas. Reiniciar o servidor zera
   tudo, o que é aceitável para conter força bruta (LGPD art. 46; OWASP ASVS 2.2).
   Estourou: erro 429 com o cabeçalho Retry-After (em segundos) e a mensagem no formato { erro } que a API já usa.
   Este arquivo é igual em todos os produtos da Nexor (rh, atende, barber, contabil, central): mude em todos. */

export class ErroLimite extends Error {
  constructor(segundos, mensagem = mensagemEspera(segundos)) {
    super(mensagem);
    this.status = 429;
    this.cabecalhos = { "Retry-After": String(segundos) };
  }
}

/** Mensagem neutra: não diz se o e-mail, o CPF ou o celular existem */
export function mensagemEspera(segundos) {
  const minutos = Math.ceil(segundos / 60);
  return minutos <= 1 ? "Muitas tentativas. Aguarde um minuto e tente de novo." : `Muitas tentativas. Aguarde ${minutos} minutos e tente de novo.`;
}

/** Números padrão do login: 20 tentativas por IP e 5 falhas por conta a cada 15 minutos */
export const LIMITE_LOGIN = Object.freeze({ porIp: 20, porConta: 5, janelaMs: 15 * 60_000 });

export function criarLimites({ agora = () => Date.now(), maxChaves = 20_000, limpezaMs = 60_000 } = {}) {
  /** @type {Map<string, { vezes: number[], janelaMs: number }>} */
  const registros = new Map();

  function vivas(chave, janelaMs, t) {
    const r = registros.get(chave);
    if (!r) return [];
    r.vezes = r.vezes.filter((x) => t - x < janelaMs);
    return r.vezes;
  }

  /** Recusa com 429 se a chave já tem `maximo` registros na janela (não conta esta tentativa) */
  function conferir(chave, maximo, janelaMs = LIMITE_LOGIN.janelaMs, mensagem) {
    const t = agora();
    const v = vivas(chave, janelaMs, t);
    if (v.length < maximo) return;
    // Libera quando o registro que fez estourar sair da janela
    const segundos = Math.max(1, Math.ceil((v[v.length - maximo] + janelaMs - t) / 1000));
    throw new ErroLimite(segundos, mensagem);
  }

  /** Guarda mais um registro na chave e devolve quantos ela tem na janela */
  function registrar(chave, janelaMs = LIMITE_LOGIN.janelaMs) {
    const t = agora();
    const r = registros.get(chave);
    if (r) {
      r.janelaMs = Math.max(r.janelaMs, janelaMs);
      r.vezes = r.vezes.filter((x) => t - x < r.janelaMs);
      r.vezes.push(t);
      return r.vezes.length;
    }
    if (registros.size >= maxChaves) {
      // Primeiro descarta o que venceu: inundar o mapa com chaves novas não pode "zerar" o limite de uma conta atacada
      limpar();
      if (registros.size >= maxChaves) registros.delete(registros.keys().next().value);
    }
    registros.set(chave, { vezes: [t], janelaMs });
    return 1;
  }

  /** Conta toda tentativa (deu certo ou não) e recusa a partir de `maximo` na janela */
  function contar(chave, maximo, janelaMs = LIMITE_LOGIN.janelaMs, mensagem) {
    conferir(chave, maximo, janelaMs, mensagem);
    return registrar(chave, janelaMs);
  }

  const zerar = (chave) => registros.delete(chave);

  function limpar() {
    const t = agora();
    for (const [k, r] of registros) if (!r.vezes.some((x) => t - x < r.janelaMs)) registros.delete(k);
  }

  /**
   * Tentativa de entrar (senha, PIN, código ou TOTP), com duas chaves:
   * - por IP conta toda tentativa (`porIp`), contra quem testa muitas contas;
   * - por conta (e-mail ou telefone normalizado) conta só as falhas (`porConta`), contra quem testa muitas senhas.
   * Quem estourou recebe 429 antes da senha ser conferida, então acertar durante o bloqueio também espera.
   * A conta é contada mesmo quando não existe: a resposta não revela quais contas existem.
   */
  function tentativa(prefixo, { ip, conta }, { porIp = LIMITE_LOGIN.porIp, porConta = LIMITE_LOGIN.porConta, janelaMs = LIMITE_LOGIN.janelaMs } = {}) {
    const chaveIp = `${prefixo}:ip:${ip || "desconhecido"}`;
    const chaveConta = `${prefixo}:conta:${String(conta ?? "").trim().toLowerCase()}`;
    contar(chaveIp, porIp, janelaMs);
    conferir(chaveConta, porConta, janelaMs);
    return {
      /** Registra a falha e devolve quantas a conta já tem na janela */
      falhou: () => registrar(chaveConta, janelaMs),
      /** Login certo zera o contador da conta */
      acertou: () => zerar(chaveConta),
    };
  }

  const relogio = setInterval(limpar, limpezaMs);
  relogio.unref?.();

  return {
    contar,
    conferir,
    registrar,
    zerar,
    limpar,
    tentativa,
    parar: () => clearInterval(relogio),
    get tamanho() {
      return registros.size;
    },
  };
}
