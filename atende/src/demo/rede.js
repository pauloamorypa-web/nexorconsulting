/* Trava de rede do Modo Demonstração ("cinto e suspensório").
   Os simuladores já respondem no lugar da Meta, da Anthropic e da Central; esta trava garante que,
   mesmo se algum caminho escapar, nenhuma requisição saia do notebook. Só passam localhost/127.0.0.1
   e, com DEMO_IA_REAL=1 e chave da Anthropic, api.anthropic.com. */

const LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class RedeBloqueada extends Error {
  constructor(host) {
    super(`Modo demonstração: chamada externa bloqueada (${host}). Nenhum dado sai deste computador.`);
    this.name = "RedeBloqueada";
    this.host = host;
  }
}

export function hostDe(entrada) {
  const bruto = typeof entrada === "string" || entrada instanceof URL ? String(entrada) : (entrada?.url ?? String(entrada));
  try {
    return new URL(bruto).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export const hostPermitido = (host, { iaReal = false } = {}) => LOCAIS.has(host) || (iaReal && host === "api.anthropic.com");

/** Troca globalThis.fetch pela trava. Devolve a função que desfaz a troca. */
export function instalarTravaDeRede({ iaReal = false } = {}) {
  const original = globalThis.fetch;
  if (original?.travaDemo) return () => {};
  const trava = async (entrada, init) => {
    const host = hostDe(entrada);
    if (!hostPermitido(host, { iaReal })) throw new RedeBloqueada(host || String(entrada));
    return original(entrada, init);
  };
  trava.travaDemo = true;
  globalThis.fetch = trava;
  return () => {
    if (globalThis.fetch === trava) globalThis.fetch = original;
  };
}
