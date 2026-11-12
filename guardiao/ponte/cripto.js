/* Formato cifrado dos trechos do Nexor Guardião (compartilhado entre a ponte e o servidor; só node:crypto).

   Arquivo do trecho ("NXG1"):
     cabeçalho (15 bytes) = "NXG1" | tamanho do bloco (uint32 BE) | prefixo do nonce (7 bytes aleatórios)
     blocos               = cifrado (até `bloco` bytes) | etiqueta GCM (16 bytes)
   Cada bloco usa AES-256-GCM com a DEK do trecho e nonce = prefixo (7) | contador (uint32 BE) | último (1 byte).
   O contador impede trocar blocos de lugar; o byte "último" impede cortar o final; os dados associados (AAD =
   "camera|inicio") amarram o arquivo à câmera e ao instante: um arquivo válido posto no lugar de outro não abre.
   Por ser em blocos, o servidor decifra em fluxo (confere cada bloco antes de entregá-lo) e atende Range sem
   decifrar o arquivo inteiro nem gravar nada em claro.

   DEK selada: a ponte só conhece a chave PÚBLICA da câmera (X25519). Para cada trecho ela gera a DEK, sela com uma
   chave efêmera (ECDH X25519 + HKDF-SHA256 + AES-256-GCM) e esquece a DEK. Quem roubar a ponte ou a fila em disco
   não abre nenhum trecho: a chave privada da câmera nunca sai do servidor.
     selada (base64) = pública efêmera (32) | iv (12) | etiqueta (16) | DEK cifrada (32) */

import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { Transform } from "node:stream";

export const MAGICA = Buffer.from("NXG1");
export const CABECALHO = 15;
export const ETIQUETA = 16;
export const BLOCO_PADRAO = 64 * 1024;

const PREFIXO_SPKI = Buffer.from("302a300506032b656e032100", "hex");
const publicaDeBruta = (b) => createPublicKey({ key: Buffer.concat([PREFIXO_SPKI, b]), format: "der", type: "spki" });
const brutaDePublica = (k) => k.export({ format: "der", type: "spki" }).subarray(-32);

/** Par de chaves da câmera: { publica (base64, 32 bytes), privada (Buffer PKCS8 DER) } */
export function gerarParCamera() {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return { publica: brutaDePublica(publicKey).toString("base64"), privada: privateKey.export({ format: "der", type: "pkcs8" }) };
}

const chaveDeSelo = (segredo, efemera, destino, aad) => Buffer.from(hkdfSync("sha256", segredo, Buffer.concat([efemera, destino]), `nexor-guardiao/dek/v1|${aad}`, 32));

/** Sela a DEK para a chave pública da câmera (só o servidor, com a privada, abre) */
export function selarDek(publicaB64, dek, aad = "") {
  const destino = Buffer.from(publicaB64, "base64");
  if (destino.length !== 32 || dek.length !== 32) throw new Error("chave com tamanho inválido");
  const ef = generateKeyPairSync("x25519");
  const efPub = brutaDePublica(ef.publicKey);
  const chave = chaveDeSelo(diffieHellman({ privateKey: ef.privateKey, publicKey: publicaDeBruta(destino) }), efPub, destino, aad);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(dek), c.final()]);
  return Buffer.concat([efPub, iv, c.getAuthTag(), ct]).toString("base64");
}

/** Abre a DEK selada com a chave privada da câmera (PKCS8 DER). Lança erro se foi adulterada ou é de outra câmera. */
export function abrirDek(privadaDer, selada, aad = "") {
  const b = Buffer.from(String(selada ?? ""), "base64");
  if (b.length !== 32 + 12 + 16 + 32) throw new Error("DEK selada com formato inválido");
  const privada = createPrivateKey({ key: privadaDer, format: "der", type: "pkcs8" });
  const destino = brutaDePublica(createPublicKey(privada));
  const efPub = b.subarray(0, 32);
  const chave = chaveDeSelo(diffieHellman({ privateKey: privada, publicKey: publicaDeBruta(efPub) }), efPub, destino, aad);
  const d = createDecipheriv("aes-256-gcm", chave, b.subarray(32, 44));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(b.subarray(44, 60));
  return Buffer.concat([d.update(b.subarray(60)), d.final()]);
}

const nonce = (prefixo, contador, ultimo) => {
  const n = Buffer.alloc(12);
  prefixo.copy(n, 0);
  n.writeUInt32BE(contador, 7);
  n[11] = ultimo ? 1 : 0;
  return n;
};

/** Quantos blocos e bytes cifrados um conteúdo de `claro` bytes ocupa (sempre há pelo menos um bloco) */
export const blocosDe = (claro, bloco = BLOCO_PADRAO) => Math.max(1, Math.ceil(claro / bloco));
export const tamanhoCifrado = (claro, bloco = BLOCO_PADRAO) => CABECALHO + claro + ETIQUETA * blocosDe(claro, bloco);

/** Cifra um trecho inteiro em memória (a ponte trabalha com trechos de segundos). Devolve o arquivo NXG1. */
export function cifrarTrecho(claro, dek, aad = "", bloco = BLOCO_PADRAO) {
  const prefixo = randomBytes(7);
  const cab = Buffer.alloc(CABECALHO);
  MAGICA.copy(cab, 0);
  cab.writeUInt32BE(bloco, 4);
  prefixo.copy(cab, 8);
  const partes = [cab];
  const total = blocosDe(claro.length, bloco);
  for (let i = 0; i < total; i++) {
    const c = createCipheriv("aes-256-gcm", dek, nonce(prefixo, i, i === total - 1));
    c.setAAD(Buffer.from(aad));
    partes.push(c.update(claro.subarray(i * bloco, (i + 1) * bloco)), c.final(), c.getAuthTag());
  }
  return Buffer.concat(partes);
}

/** Cifrador em fluxo (exportações): recebe claro, emite NXG1. Precisa saber o tamanho? Não: o último bloco é marcado no final. */
export function criarCifrador(dek, aad = "", bloco = BLOCO_PADRAO) {
  const prefixo = randomBytes(7);
  let pendente = Buffer.alloc(0);
  let contador = 0;
  let iniciou = false;
  const selar = (dados, ultimo) => {
    const c = createCipheriv("aes-256-gcm", dek, nonce(prefixo, contador++, ultimo));
    c.setAAD(Buffer.from(aad));
    return Buffer.concat([c.update(dados), c.final(), c.getAuthTag()]);
  };
  return new Transform({
    transform(parte, _, pronto) {
      if (!iniciou) {
        const cab = Buffer.alloc(CABECALHO);
        MAGICA.copy(cab, 0);
        cab.writeUInt32BE(bloco, 4);
        prefixo.copy(cab, 8);
        this.push(cab);
        iniciou = true;
      }
      pendente = pendente.length ? Buffer.concat([pendente, parte]) : parte;
      // Mantém sempre ao menos 1 byte pendente: só no final se sabe qual é o último bloco
      while (pendente.length > bloco) {
        this.push(selar(pendente.subarray(0, bloco), false));
        pendente = pendente.subarray(bloco);
      }
      pronto();
    },
    flush(pronto) {
      if (!iniciou) {
        const cab = Buffer.alloc(CABECALHO);
        MAGICA.copy(cab, 0);
        cab.writeUInt32BE(bloco, 4);
        prefixo.copy(cab, 8);
        this.push(cab);
      }
      this.push(selar(pendente, true));
      pronto();
    },
  });
}

/** Lê o cabeçalho NXG1: { bloco, prefixo } */
export function lerCabecalho(cab) {
  if (cab.length < CABECALHO || !cab.subarray(0, 4).equals(MAGICA)) throw new Error("arquivo cifrado com formato desconhecido");
  const bloco = cab.readUInt32BE(4);
  if (bloco < 1024 || bloco > 8 * 1024 * 1024) throw new Error("tamanho de bloco inválido");
  return { bloco, prefixo: Buffer.from(cab.subarray(8, 15)) };
}

/**
 * Para entregar os bytes claros [inicio, fim] (inclusive) de um trecho: que faixa do arquivo cifrado ler.
 * Devolve { primeiroBloco, de, ate (inclusive), pular (bytes claros a descartar no começo), entregar (bytes claros) }.
 */
export function faixaCifrada(tamanhoClaro, bloco, inicio = 0, fim = tamanhoClaro - 1) {
  const total = blocosDe(tamanhoClaro, bloco);
  const primeiroBloco = Math.floor(inicio / bloco);
  const ultimoBloco = Math.min(total - 1, Math.floor(Math.max(fim, 0) / bloco));
  const de = CABECALHO + primeiroBloco * (bloco + ETIQUETA);
  const fimClaroUltimo = Math.min(tamanhoClaro, (ultimoBloco + 1) * bloco);
  const ate = CABECALHO + fimClaroUltimo + ETIQUETA * (ultimoBloco + 1) - 1;
  return { primeiroBloco, de, ate, pular: inicio - primeiroBloco * bloco, entregar: Math.max(0, fim - inicio + 1), total };
}

/**
 * Decifrador em fluxo: recebe os bytes cifrados a partir do bloco `primeiroBloco` (sem o cabeçalho) e emite o claro.
 * Cada bloco só é entregue depois de conferida a etiqueta: adulteração, troca de ordem ou corte interrompem o fluxo com erro.
 */
export function criarDecifrador({ dek, aad = "", bloco, prefixo, tamanhoClaro, primeiroBloco = 0, pular = 0, entregar = Infinity }) {
  const total = blocosDe(tamanhoClaro, bloco);
  let pendente = Buffer.alloc(0);
  let contador = primeiroBloco;
  let faltaPular = pular;
  let falta = entregar;
  const tamanhoDoBloco = (i) => (i === total - 1 ? tamanhoClaro - i * bloco : bloco) + ETIQUETA;
  return new Transform({
    transform(parte, _, pronto) {
      pendente = pendente.length ? Buffer.concat([pendente, parte]) : parte;
      try {
        while (contador < total && pendente.length >= tamanhoDoBloco(contador)) {
          const n = tamanhoDoBloco(contador);
          const d = createDecipheriv("aes-256-gcm", dek, nonce(prefixo, contador, contador === total - 1));
          d.setAAD(Buffer.from(aad));
          d.setAuthTag(pendente.subarray(n - ETIQUETA, n));
          let claro = Buffer.concat([d.update(pendente.subarray(0, n - ETIQUETA)), d.final()]);
          pendente = pendente.subarray(n);
          contador++;
          if (faltaPular) {
            const corte = Math.min(faltaPular, claro.length);
            claro = claro.subarray(corte);
            faltaPular -= corte;
          }
          if (claro.length > falta) claro = claro.subarray(0, falta);
          falta -= claro.length;
          if (claro.length) this.push(claro);
        }
        pronto();
      } catch {
        pronto(Object.assign(new Error("Trecho adulterado ou chave incorreta: a conferência de integridade falhou."), { codigo: "integridade" }));
      }
    },
    flush(pronto) {
      // Ainda havia o que entregar e os blocos acabaram antes: o arquivo foi cortado
      if (contador < total && falta > 0) return pronto(Object.assign(new Error("Trecho incompleto: o arquivo cifrado foi cortado."), { codigo: "integridade" }));
      pronto();
    },
  });
}

/** Decifra um arquivo NXG1 inteiro em memória (testes, ponte em modo de conferência) */
export function decifrarTrecho(arquivo, dek, aad = "") {
  const { bloco, prefixo } = lerCabecalho(arquivo);
  const partes = [];
  let pos = CABECALHO;
  let i = 0;
  if (pos >= arquivo.length) throw new Error("arquivo cifrado vazio");
  while (pos < arquivo.length) {
    const fim = Math.min(arquivo.length, pos + bloco + ETIQUETA);
    const ultimo = fim === arquivo.length;
    if (fim - pos < ETIQUETA) throw new Error("arquivo cifrado cortado");
    const d = createDecipheriv("aes-256-gcm", dek, nonce(prefixo, i++, ultimo));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(arquivo.subarray(fim - ETIQUETA, fim));
    partes.push(d.update(arquivo.subarray(pos, fim - ETIQUETA)), d.final());
    pos = fim;
  }
  return Buffer.concat(partes);
}

export const sha256Hex = (b) => createHash("sha256").update(b).digest("hex");
/** Dados associados de um trecho: amarra o arquivo e a DEK à câmera e ao instante de início */
export const aadTrecho = (cameraId, inicioMs) => `${cameraId}|${inicioMs}`;

/** Onde termina a parte de inicialização de um MP4 fragmentado (ftyp+moov), isto é, o deslocamento do primeiro "moof". 0 se não for MP4. */
export function inicioDaMidiaMp4(claro) {
  let pos = 0;
  while (pos + 8 <= claro.length) {
    let tam = claro.readUInt32BE(pos);
    const tipo = claro.toString("latin1", pos + 4, pos + 8);
    if (tam === 1 && pos + 16 <= claro.length) tam = Number(claro.readBigUInt64BE(pos + 8));
    if (tipo === "moof") return pos;
    if (tam < 8) return 0;
    pos += tam;
  }
  return 0;
}
