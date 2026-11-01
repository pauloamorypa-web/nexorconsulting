/* Busca na base de conhecimento da empresa (BM25 com normalização para português).
   Os textos são divididos em trechos; a IA consulta só os trechos relevantes, o que mantém o custo baixo
   mesmo com bases grandes (catálogos, políticas, manuais). */

const PARADAS = new Set(
  "a o e é de da do das dos em no na nos nas um uma uns umas para pra por com sem que se ou ao aos à às como mais mas foi ser são tem ter há eu você vc voces vocês ele ela eles elas meu minha seu sua isso isto esse essa este esta qual quais quando onde porque pq sim não nao já ja tá ta ok oi olá ola bom dia tarde noite me te lhe nos the of and to".split(" "),
);

export const normalizar = (t) =>
  String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Radical simples: tira plural, sufixos comuns e a vogal final, para "entregas", "entrega" e "entregamos" casarem */
const SUFIXOS = ["mente", "mento", "coe", "cao", "amo", "emo", "imo", "ando", "endo", "indo", "aram", "eram", "iram", "ado", "ada", "ido", "ida", "ar", "er", "ir"];
export function radical(p) {
  if (p.length <= 3) return p;
  if (p.endsWith("s") && p.length > 4) p = p.slice(0, -1);
  for (const s of SUFIXOS) {
    if (p.endsWith(s) && p.length - s.length >= 3) {
      p = p.slice(0, -s.length);
      break;
    }
  }
  if (p.length > 3 && /[aeo]$/.test(p)) p = p.slice(0, -1);
  return p;
}

export const termos = (t) =>
  normalizar(t)
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !PARADAS.has(p))
    .map(radical);

/** Divide um texto longo em trechos de ~700 caracteres, respeitando parágrafos */
export function dividirEmTrechos(texto, tamanho = 700) {
  const paragrafos = String(texto).split(/\n\s*\n|\n(?=[-•*]|\d+[.)])/).map((p) => p.trim()).filter(Boolean);
  const trechos = [];
  let atual = "";
  for (const p of paragrafos) {
    if ((atual + "\n" + p).length > tamanho && atual) {
      trechos.push(atual);
      atual = p;
    } else atual = atual ? `${atual}\n${p}` : p;
    while (atual.length > tamanho * 1.6) {
      const corte = atual.lastIndexOf(". ", tamanho) > tamanho / 2 ? atual.lastIndexOf(". ", tamanho) + 1 : tamanho;
      trechos.push(atual.slice(0, corte).trim());
      atual = atual.slice(corte).trim();
    }
  }
  if (atual) trechos.push(atual);
  return trechos;
}

/** Índice BM25 de uma lista de documentos {id, titulo, conteudo, tipo} */
export function criarIndice(documentos, { k1 = 1.4, b = 0.75 } = {}) {
  const trechos = [];
  for (const d of documentos) {
    for (const [i, t] of dividirEmTrechos(d.conteudo).entries()) {
      // O título pesa mais: entra duas vezes nos termos do trecho
      const tk = [...termos(d.titulo), ...termos(d.titulo), ...termos(t)];
      const freq = new Map();
      for (const x of tk) freq.set(x, (freq.get(x) ?? 0) + 1);
      trechos.push({ docId: d.id, titulo: d.titulo, tipo: d.tipo, parte: i, texto: t, freq, tamanho: tk.length });
    }
  }
  const df = new Map();
  for (const t of trechos) for (const x of t.freq.keys()) df.set(x, (df.get(x) ?? 0) + 1);
  const media = trechos.reduce((s, t) => s + t.tamanho, 0) / (trechos.length || 1);
  const N = trechos.length;

  return {
    tamanho: N,
    buscar(consulta, limite = 5) {
      const q = [...new Set(termos(consulta))];
      if (!q.length || !N) return [];
      const notas = trechos.map((t) => {
        let nota = 0;
        for (const x of q) {
          const f = t.freq.get(x);
          if (!f) continue;
          const idf = Math.log(1 + (N - df.get(x) + 0.5) / (df.get(x) + 0.5));
          nota += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * t.tamanho) / media)));
        }
        return { t, nota };
      });
      return notas
        .filter((n) => n.nota > 0)
        .sort((a, b) => b.nota - a.nota)
        .slice(0, limite)
        .map(({ t, nota }) => ({ id: t.docId, titulo: t.titulo, tipo: t.tipo, trecho: t.texto, relevancia: Math.round(nota * 100) / 100 }));
    },
  };
}

/** Guarda um índice por empresa e reconstrói quando a base muda */
export function criarCacheConhecimento(repo) {
  const cache = new Map();
  return {
    indice(empresa_id) {
      let c = cache.get(empresa_id);
      if (!c) {
        c = criarIndice(repo.conhecimento(empresa_id, true));
        cache.set(empresa_id, c);
      }
      return c;
    },
    invalidar: (empresa_id) => cache.delete(empresa_id),
  };
}
