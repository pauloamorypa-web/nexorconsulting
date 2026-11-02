/* Comunicação com o servidor: JSON, upload de arquivos e eventos em tempo real. */

export class ErroApi extends Error {
  constructor(status, dados) {
    super(dados?.erro ?? `Erro ${status}`);
    this.status = status;
    this.codigo = dados?.codigo;
  }
}

let aoDeslogar = () => {};
export const definirAoDeslogar = (fn) => (aoDeslogar = fn);

export async function api(caminho, { metodo = "GET", corpo, bruto, tipo } = {}) {
  const r = await fetch(`/api${caminho}`, {
    method: metodo,
    credentials: "same-origin",
    headers: { "x-nexor": "1", ...(bruto ? { "Content-Type": tipo } : corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: bruto ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined),
  });
  const ehJson = (r.headers.get("content-type") ?? "").includes("json");
  const dados = ehJson ? await r.json() : await r.text();
  if (r.status === 401 && !caminho.startsWith("/entrar") && !caminho.startsWith("/estado")) aoDeslogar();
  if (!r.ok) throw new ErroApi(r.status, dados);
  return dados;
}

export const get = (c) => api(c);
export const post = (c, corpo = {}) => api(c, { metodo: "POST", corpo });
export const put = (c, corpo = {}) => api(c, { metodo: "PUT", corpo });
export const del = (c) => api(c, { metodo: "DELETE" });
export const enviarArquivo = (arquivo) => api("/midia", { metodo: "POST", bruto: arquivo, tipo: arquivo.type || "application/octet-stream" });

/** Eventos em tempo real (SSE). Reconecta sozinho. */
export function conectarEventos(manipuladores) {
  let fonte;
  let fechado = false;
  const abrir = () => {
    fonte = new EventSource("/api/eventos");
    for (const [tipo, fn] of Object.entries(manipuladores)) {
      fonte.addEventListener(tipo, (e) => {
        try {
          fn(JSON.parse(e.data));
        } catch (err) {
          console.error(err);
        }
      });
    }
    fonte.onerror = () => {
      if (fechado) return;
      manipuladores.conexao?.(false);
    };
    fonte.onopen = () => manipuladores.conexao?.(true);
  };
  abrir();
  return () => {
    fechado = true;
    fonte?.close();
  };
}
