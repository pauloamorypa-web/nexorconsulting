/* Roteador HTTP mínimo, sem dependências: rotas com parâmetros, leitura de corpo, cookies e respostas JSON. */

export class ErroHttp extends Error {
  constructor(status, mensagem, extra = {}) {
    super(mensagem);
    this.status = status;
    Object.assign(this, extra);
  }
}

export const falha = (status, mensagem, extra) => {
  throw new ErroHttp(status, mensagem, extra);
};

export function lerCorpo(req, limite) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    req.on("data", (p) => {
      tamanho += p.length;
      if (tamanho > limite) {
        reject(new ErroHttp(413, "Arquivo ou conteúdo grande demais."));
        req.destroy();
      } else partes.push(p);
    });
    req.on("end", () => resolve(Buffer.concat(partes)));
    req.on("error", reject);
  });
}

export function lerCookies(cabecalho = "") {
  const r = {};
  for (const parte of cabecalho.split(";")) {
    const i = parte.indexOf("=");
    if (i > 0) r[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return r;
}

export function json(res, status, corpo, cabecalhos = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cabecalhos });
  res.end(JSON.stringify(corpo));
}

export function criarRoteador() {
  const rotas = [];
  const adicionar = (metodo, caminho, opcoes, fn) => {
    if (typeof opcoes === "function") [fn, opcoes] = [opcoes, {}];
    const nomes = [];
    const padrao = new RegExp(
      "^" +
        caminho.replace(/\/:(\w+)/g, (_, n) => {
          nomes.push(n);
          return "/([^/]+)";
        }) +
        "$",
    );
    rotas.push({ metodo, padrao, nomes, opcoes, fn });
  };
  return {
    get: (c, o, f) => adicionar("GET", c, o, f),
    post: (c, o, f) => adicionar("POST", c, o, f),
    put: (c, o, f) => adicionar("PUT", c, o, f),
    delete: (c, o, f) => adicionar("DELETE", c, o, f),
    encontrar(metodo, caminho) {
      let caminhoExiste = false;
      for (const r of rotas) {
        const m = r.padrao.exec(caminho);
        if (!m) continue;
        caminhoExiste = true;
        if (r.metodo !== metodo) continue;
        const params = Object.fromEntries(r.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
        return { rota: r, params };
      }
      return { caminhoExiste };
    },
  };
}
