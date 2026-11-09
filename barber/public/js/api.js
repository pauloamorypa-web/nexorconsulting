/* Comunicação com o servidor: JSON, upload de arquivos e eventos em tempo real. */

export class ErroApi extends Error {
  constructor(status, dados) {
    super(dados?.erro ?? `Erro ${status}`);
    this.status = status;
    this.codigo = dados?.codigo;
  }
}

let aoDeslogar = () => {};
// App das lojas: servidor da empresa (outra origem) e token de sessão. No navegador ficam vazios (mesma origem + cookie).
let BASE = "";
let TOKEN = null;
export const configurarApi = ({ base = "", token = null } = {}) => {
  BASE = base.replace(/\/$/, "");
  TOKEN = token;
};
export const urlApi = (caminho) => `${BASE}/api${caminho}`;
export const cabecalhosApi = (extra = {}) => ({ "x-nexor": "1", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...extra });
export const definirAoDeslogar = (fn) => (aoDeslogar = fn);

export async function api(caminho, { metodo = "GET", corpo, bruto, tipo, cabecalhos = {} } = {}) {
  const r = await fetch(urlApi(caminho), {
    method: metodo,
    credentials: BASE ? "omit" : "same-origin",
    headers: cabecalhosApi({ ...(bruto ? { "Content-Type": tipo } : corpo !== undefined ? { "Content-Type": "application/json" } : {}), ...cabecalhos }),
    body: bruto ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined),
  });
  const ehJson = (r.headers.get("content-type") ?? "").includes("json");
  const dados = ehJson ? await r.json() : await r.text();
  if (r.status === 401 && !caminho.startsWith("/entrar") && !caminho.startsWith("/estado")) aoDeslogar();
  // Termos de uso mudaram durante o uso: recarrega para mostrar a tela de aceite
  if (r.status === 428) location.reload();
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
