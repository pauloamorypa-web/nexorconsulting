/* Armazenamento dos arquivos cifrados, por interface. Dois drivers:
   - disco local (padrão): <DATA_DIR>/arquivos/<chave>
   - S3 compatível (Backblaze B2, Wasabi, MinIO, AWS): assinatura SigV4 feita à mão com node:crypto, sem SDK.

   Interface (todas assíncronas):
     gravar(chave, fluxo, { tamanho, sha256? }) → { tamanho, sha256 }   grava em fluxo e devolve o SHA-256 do que gravou;
                                                                        se `sha256` foi informado e não confere, apaga e lança erro
     ler(chave, { inicio?, fim? }) → Readable                           faixa de bytes (fim inclusive)
     tamanho(chave) → número | null
     apagar(chave) → boolean
     sha256(chave) → hex
   Só passa por aqui conteúdo JÁ cifrado: quem acessar o disco ou o bucket vê apenas bytes ilegíveis. */

import { createHash, createHmac, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const erroHash = () => Object.assign(new Error("O arquivo recebido não confere com o SHA-256 informado."), { status: 422, codigo: "sha256_divergente" });
const chaveValida = (chave) => /^[\w.\-/]{1,400}$/.test(chave) && !chave.split("/").some((p) => p === "" || p === "." || p === "..");

/** Transform que conta bytes e calcula o SHA-256 do que passa */
export function medidor() {
  const h = createHash("sha256");
  let tamanho = 0;
  const t = new Transform({
    transform(p, _, ok) {
      h.update(p);
      tamanho += p.length;
      ok(null, p);
    },
  });
  t.resultado = () => ({ tamanho, sha256: h.digest("hex") });
  return t;
}

export function criarDisco({ pasta }) {
  const raiz = resolve(pasta);
  const caminho = (chave) => {
    if (!chaveValida(chave)) throw new Error("chave de armazenamento inválida");
    const alvo = normalize(join(raiz, chave));
    if (!alvo.startsWith(raiz + sep)) throw new Error("chave de armazenamento inválida");
    return alvo;
  };
  const d = {
    tipo: "disco",
    async gravar(chave, fluxo, { sha256 } = {}) {
      const alvo = caminho(chave);
      await mkdir(dirname(alvo), { recursive: true });
      const tmp = `${alvo}.${randomBytes(6).toString("hex")}.tmp`;
      const m = medidor();
      try {
        await pipeline(fluxo, m, createWriteStream(tmp, { mode: 0o600 }));
        const r = m.resultado();
        if (sha256 && r.sha256 !== sha256) throw erroHash();
        await rename(tmp, alvo);
        return r;
      } catch (e) {
        await rm(tmp, { force: true });
        throw e;
      }
    },
    async ler(chave, { inicio = 0, fim } = {}) {
      const alvo = caminho(chave);
      const info = await stat(alvo).catch(() => null);
      if (!info) throw Object.assign(new Error("Arquivo não encontrado no armazenamento."), { status: 404, codigo: "arquivo_ausente" });
      if (inicio >= info.size) return Readable.from([]);
      return createReadStream(alvo, { start: inicio, end: fim === undefined ? undefined : Math.min(fim, info.size - 1) });
    },
    tamanho: async (chave) => (await stat(caminho(chave)).catch(() => null))?.size ?? null,
    async apagar(chave) {
      const alvo = caminho(chave);
      const havia = Boolean(await stat(alvo).catch(() => null));
      await rm(alvo, { force: true });
      return havia;
    },
    async sha256(chave) {
      const m = medidor();
      await pipeline(await d.ler(chave), m, new Transform({ transform: (_p, _e, ok) => ok() }));
      return m.resultado().sha256;
    },
  };
  return d;
}

/* ---------- S3 compatível (SigV4) ---------- */
const hmac = (chave, dados) => createHmac("sha256", chave).update(dados).digest();
const hex = (dados) => createHash("sha256").update(dados).digest("hex");
const codificar = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const VAZIO = hex("");

/** Assina uma requisição S3 (AWS Signature Version 4). Devolve os cabeçalhos prontos (inclui Authorization). */
export function assinarS3({ metodo, host, caminho, consulta = "", cabecalhos = {}, hashCorpo = VAZIO, regiao, chaveAcesso, chaveSecreta, agora = new Date() }) {
  const data = agora.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dia = data.slice(0, 8);
  const cab = { ...Object.fromEntries(Object.entries(cabecalhos).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host, "x-amz-content-sha256": hashCorpo, "x-amz-date": data };
  const nomes = Object.keys(cab).sort();
  const canonica = [metodo, caminho, consulta, nomes.map((n) => `${n}:${cab[n]}\n`).join(""), nomes.join(";"), hashCorpo].join("\n");
  const escopo = `${dia}/${regiao}/s3/aws4_request`;
  const paraAssinar = ["AWS4-HMAC-SHA256", data, escopo, hex(canonica)].join("\n");
  const chave = hmac(hmac(hmac(hmac(`AWS4${chaveSecreta}`, dia), regiao), "s3"), "aws4_request");
  cab.authorization = `AWS4-HMAC-SHA256 Credential=${chaveAcesso}/${escopo}, SignedHeaders=${nomes.join(";")}, Signature=${hmac(chave, paraAssinar).toString("hex")}`;
  return cab;
}

/**
 * URL pré-assinada (SigV4 na query) para a ponte enviar o trecho DIRETO ao armazenamento, sem passar pelo servidor.
 * Validade curta; o tamanho (content-length) e o SHA-256 (x-amz-content-sha256) entram nos cabeçalhos assinados:
 * a URL só serve para enviar exatamente aquele arquivo.
 */
export function preAssinarS3({ metodo = "PUT", protocolo, host, caminho, cabecalhos = {}, hashCorpo = "UNSIGNED-PAYLOAD", validadeS = 300, regiao, chaveAcesso, chaveSecreta, agora = new Date() }) {
  const data = agora.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dia = data.slice(0, 8);
  const escopo = `${dia}/${regiao}/s3/aws4_request`;
  const cab = { ...Object.fromEntries(Object.entries(cabecalhos).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host };
  const nomes = Object.keys(cab).sort();
  const consulta = [["X-Amz-Algorithm", "AWS4-HMAC-SHA256"], ["X-Amz-Credential", `${chaveAcesso}/${escopo}`], ["X-Amz-Date", data], ["X-Amz-Expires", String(validadeS)], ["X-Amz-SignedHeaders", nomes.join(";")]].map(([k, v]) => `${codificar(k)}=${codificar(v)}`).join("&");
  const canonica = [metodo, caminho, consulta, nomes.map((n) => `${n}:${cab[n]}\n`).join(""), nomes.join(";"), hashCorpo].join("\n");
  const chave = hmac(hmac(hmac(hmac(`AWS4${chaveSecreta}`, dia), regiao), "s3"), "aws4_request");
  const assinatura = hmac(chave, ["AWS4-HMAC-SHA256", data, escopo, hex(canonica)].join("\n")).toString("hex");
  const { host: _h, ...enviar } = cab;
  return { url: `${protocolo}//${host}${caminho}?${consulta}&X-Amz-Signature=${assinatura}`, cabecalhos: enviar, expira_em: agora.getTime() + validadeS * 1000 };
}

export function criarS3({ endpoint, regiao = "us-east-1", bucket, chaveAcesso, chaveSecreta, prefixo = "", agora = () => new Date() }) {
  if (!endpoint || !bucket || !chaveAcesso || !chaveSecreta) throw new Error("Armazenamento S3: informe S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY e S3_SECRET_KEY.");
  const base = new URL(endpoint);
  const pedir = base.protocol === "https:" ? httpsRequest : httpRequest;
  const caminhoDe = (chave) => {
    if (!chaveValida(chave)) throw new Error("chave de armazenamento inválida");
    // Estilo "path" (endpoint/bucket/chave): funciona em MinIO, B2, Wasabi e AWS
    return `${base.pathname.replace(/\/$/, "")}/${codificar(bucket)}/${`${prefixo}${chave}`.split("/").map(codificar).join("/")}`;
  };
  function chamar(metodo, chave, { cabecalhos = {}, hashCorpo = VAZIO, corpo } = {}) {
    const caminho = caminhoDe(chave);
    const cab = assinarS3({ metodo, host: base.host, caminho, cabecalhos, hashCorpo, regiao, chaveAcesso, chaveSecreta, agora: agora() });
    return new Promise((ok, falhou) => {
      const req = pedir({ protocol: base.protocol, hostname: base.hostname, port: base.port || undefined, method: metodo, path: caminho, headers: cab }, ok);
      req.on("error", (e) => falhou(Object.assign(new Error(`Armazenamento S3 fora do ar: ${e.message}`), { status: 503 })));
      req.setTimeout(60_000, () => req.destroy(new Error("tempo esgotado")));
      if (corpo) pipeline(corpo, req).catch((e) => (req.destroy(e), falhou(e)));
      else req.end();
    });
  }
  const descartar = async (res) => {
    let texto = "";
    for await (const p of res) if (texto.length < 600) texto += p.toString("utf8");
    return texto;
  };
  const falha = async (res, acao) => Object.assign(new Error(`Armazenamento S3 recusou ${acao} (HTTP ${res.statusCode}).`), { status: res.statusCode === 404 ? 404 : 502, codigo: res.statusCode === 404 ? "arquivo_ausente" : "s3", detalhe: await descartar(res) });

  const s3 = {
    tipo: "s3",
    /** Envio direto: devolve { url, cabecalhos, expira_em } para um PUT daquele arquivo exato (tamanho e SHA-256 amarrados) */
    urlDeEnvio: (chave, { tamanho, sha256, validadeS = 300 }) =>
      preAssinarS3({ protocolo: base.protocol, host: base.host, caminho: caminhoDe(chave), cabecalhos: { "content-length": tamanho, "x-amz-content-sha256": sha256 }, hashCorpo: sha256, validadeS, regiao, chaveAcesso, chaveSecreta, agora: agora() }),
    /** Envio em fluxo. Com o SHA-256 informado (a ponte sempre informa), ele vai na assinatura e o S3 confere; sem ele, o corpo vai sem assinatura de conteúdo (só por HTTPS). */
    async gravar(chave, fluxo, { tamanho, sha256 } = {}) {
      if (!Number.isInteger(tamanho)) throw new Error("Armazenamento S3: o tamanho do arquivo é obrigatório para enviar em fluxo.");
      const m = medidor();
      const res = await chamar("PUT", chave, { cabecalhos: { "content-length": tamanho, "content-type": "application/octet-stream" }, hashCorpo: sha256 ?? "UNSIGNED-PAYLOAD", corpo: Readable.from(fluxo).pipe(m) });
      if (res.statusCode >= 300) {
        const e = await falha(res, "a gravação");
        throw /XAmzContentSHA256Mismatch|BadDigest/.test(e.detalhe) ? erroHash() : e;
      }
      await descartar(res);
      const r = m.resultado();
      if ((sha256 && r.sha256 !== sha256) || r.tamanho !== tamanho) {
        await s3.apagar(chave);
        throw erroHash();
      }
      return r;
    },
    async ler(chave, { inicio = 0, fim } = {}) {
      const faixa = inicio || fim !== undefined ? { range: `bytes=${inicio}-${fim ?? ""}` } : {};
      const res = await chamar("GET", chave, { cabecalhos: faixa });
      if (res.statusCode === 416) return (await descartar(res), Readable.from([]));
      if (res.statusCode >= 300) throw await falha(res, "a leitura");
      return res;
    },
    async tamanho(chave) {
      const res = await chamar("HEAD", chave);
      await descartar(res);
      if (res.statusCode === 404) return null;
      if (res.statusCode >= 300) throw await falha(res, "a consulta");
      return Number(res.headers["content-length"]);
    },
    async apagar(chave) {
      const havia = (await s3.tamanho(chave)) !== null;
      const res = await chamar("DELETE", chave);
      if (res.statusCode >= 300 && res.statusCode !== 404) throw await falha(res, "a remoção");
      await descartar(res);
      return havia;
    },
    async sha256(chave) {
      const m = medidor();
      await pipeline(await s3.ler(chave), m, new Transform({ transform: (_p, _e, ok) => ok() }));
      return m.resultado().sha256;
    },
  };
  return s3;
}

export function criarArmazenamento(cfg) {
  const a = cfg.armazenamento;
  return a.driver === "s3" ? criarS3(a.s3) : criarDisco({ pasta: join(cfg.pastaDados, "arquivos") });
}
