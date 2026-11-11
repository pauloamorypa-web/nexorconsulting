/* Nexor Elo · comunicação com o servidor (JSON, cookie de sessão, CSRF com o cabeçalho x-nexor: 1). */

export class ErroApi extends Error {
  constructor(status, dados) {
    super(dados?.erro ?? (status === 429 ? "Muitas tentativas agora. Espere alguns segundos e tente de novo." : status >= 500 ? "O servidor não respondeu como esperado. Tente de novo em instantes." : `Erro ${status}`));
    this.status = status;
    this.codigo = dados?.codigo;
  }
}

/** Cliente da API de uma área: criarApi("fornecedor") → get("/painel") chama /api/fornecedor/painel */
export function criarApi(area, { aoDeslogar = () => {} } = {}) {
  async function api(caminho, { metodo = "GET", corpo } = {}) {
    const url = caminho.startsWith("/api/") ? caminho : `/api/${area}${caminho}`;
    let r;
    try {
      r = await fetch(url, {
        method: metodo,
        credentials: "same-origin",
        cache: "no-store",
        headers: { "x-nexor": "1", ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      throw new ErroApi(0, { erro: "Sem conexão com o servidor. Confira a internet e tente de novo." });
    }
    const ehJson = (r.headers.get("content-type") ?? "").includes("json");
    const dados = ehJson ? await r.json().catch(() => null) : null;
    if (r.status === 401 && !/\/(entrar|cadastro|primeiro-acesso|estado)$/.test(url)) aoDeslogar();
    if (!r.ok) throw new ErroApi(r.status, dados);
    return dados;
  }
  return {
    api,
    get: (c) => api(c),
    post: (c, corpo = {}) => api(c, { metodo: "POST", corpo }),
    put: (c, corpo = {}) => api(c, { metodo: "PUT", corpo }),
    del: (c) => api(c, { metodo: "DELETE" }),
    definirAoDeslogar: (fn) => (aoDeslogar = fn),
  };
}
