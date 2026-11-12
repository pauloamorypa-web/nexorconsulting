/* Cofre de chaves do Nexor Guardião: envelope AES-256-GCM em 4 níveis.

     chave-mestra (GUARDIAO_MASTER_KEY, fora do banco)
       └─ KEK da conta (uma por conta; e uma "KEK da plataforma" para segredos sem conta, como o 2FA)
            └─ chave privada da câmera (X25519; a ponte só recebe a pública)
                 └─ DEK do trecho (gerada pela ponte, selada com a pública da câmera)

   O que cada nível protege (resumo; detalhes em SEGURANCA.md):
   - DEK por trecho: apagar a DEK torna o trecho ilegível mesmo que o arquivo sobreviva em backup (retenção).
   - Chave da câmera: a ponte roubada não abre nada (só tem a pública); uma câmera não abre a outra.
   - KEK da conta: destruir a KEK apaga criptograficamente TUDO da conta (encerramento), inclusive backups.
   - Chave-mestra: quem copiar o banco e os arquivos, sem a variável de ambiente, não abre nada.
     Trocar a chave-mestra reembrulha só as KEK (segundos), sem regravar vídeo.

   O formato do arquivo e o selo da DEK ficam em ponte/cripto.js (código único, usado pela ponte e pelo servidor). */

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CABECALHO, abrirDek, criarCifrador, criarDecifrador, faixaCifrada, gerarParCamera, lerCabecalho } from "../ponte/cripto.js";

export * from "../ponte/cripto.js";

/** Embrulha bytes com AES-256-GCM. `aad` amarra o embrulho ao dono (ex.: "kek|<conta>"): não serve em outro lugar. */
export function embrulhar(chave, dados, aad = "") {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(dados), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}

export function desembrulhar(chave, guardado, aad = "") {
  const [v, iv, tag, ct] = String(guardado ?? "").split(".");
  if (v !== "v1" || !iv || !tag) throw new Error("formato de chave embrulhada desconhecido");
  const d = createDecipheriv("aes-256-gcm", chave, Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct ?? "", "base64url")), d.final()]);
}

/** Deriva a chave-mestra de 32 bytes a partir do texto da variável de ambiente */
export const derivarMestra = (texto) => Buffer.from(hkdfSync("sha256", Buffer.from(String(texto), "utf8"), Buffer.from("nexor-guardiao"), "chave-mestra/v1", 32));
/** Identificador público da chave-mestra (para perceber, na subida, que a chave configurada não é a do banco) */
export const idDaMestra = (mestra) => createHash("sha256").update("id|").update(mestra).digest("hex").slice(0, 16);

const AAD_KEK = (contaId) => `kek|${contaId}`;
const AAD_CAM = (cameraId) => `camera|${cameraId}`;
export const KEK_PLATAFORMA = "plataforma";

/**
 * Cofre ligado a uma chave-mestra. Sem GUARDIAO_MASTER_KEY (desenvolvimento e testes) uma chave é gerada em
 * <pasta>/.chave-mestra; em produção a variável é obrigatória.
 */
export function criarCofre({ chaveMestra, pastaDados, producao }) {
  let mestra;
  if (chaveMestra) mestra = derivarMestra(chaveMestra);
  else {
    if (producao) throw new Error("GUARDIAO_MASTER_KEY é obrigatória em produção (use um texto aleatório longo e guarde no cofre da Nexor).");
    mkdirSync(pastaDados, { recursive: true });
    const arquivo = join(pastaDados, ".chave-mestra");
    if (!existsSync(arquivo)) writeFileSync(arquivo, randomBytes(32).toString("base64"), { mode: 0o600 });
    mestra = derivarMestra(readFileSync(arquivo, "utf8").trim());
  }

  const cofre = {
    id: idDaMestra(mestra),

    /* ----- nível 2: KEK da conta ----- */
    /** Gera a KEK de uma conta; devolve só a versão embrulhada (a KEK em claro nunca é guardada) */
    novaKek: (contaId) => embrulhar(mestra, randomBytes(32), AAD_KEK(contaId)),
    abrirKek(contaId, kekEmbrulhada) {
      if (!kekEmbrulhada) throw Object.assign(new Error("A chave desta conta foi destruída: as imagens não podem mais ser abertas."), { status: 410, codigo: "chave_destruida" });
      return desembrulhar(mestra, kekEmbrulhada, AAD_KEK(contaId));
    },
    /** Troca da chave-mestra: abre a KEK com esta mestra e embrulha com a do `cofreNovo`. Nenhum vídeo é regravado. */
    reembrulharKek: (contaId, kekEmbrulhada, cofreNovo) => cofreNovo.embrulharKekBruta(contaId, cofre.abrirKek(contaId, kekEmbrulhada)),
    embrulharKekBruta: (contaId, kek) => embrulhar(mestra, kek, AAD_KEK(contaId)),

    /* ----- nível 3: chave da câmera ----- */
    /** Par de chaves da câmera: a pública vai para a ponte, a privada fica embrulhada pela KEK da conta */
    novaChaveCamera(contaId, kekEmbrulhada, cameraId) {
      const par = gerarParCamera();
      return { publica: par.publica, privadaEmbrulhada: embrulhar(cofre.abrirKek(contaId, kekEmbrulhada), par.privada, AAD_CAM(cameraId)) };
    },
    abrirChaveCamera: (conta, camera) => desembrulhar(cofre.abrirKek(conta.id, conta.kek_embrulhada), camera.chave_privada_embrulhada, AAD_CAM(camera.id)),

    /* ----- nível 4: DEK do trecho ----- */
    abrirDekTrecho: (conta, camera, trecho) => abrirDek(cofre.abrirChaveCamera(conta, camera), trecho.dek_selada, `${camera.id}|${trecho.inicio}`),

    /* ----- segredos pequenos sob a KEK (endereço RTSP com senha, segredo do 2FA) ----- */
    cifrarSegredo: (donoId, kekEmbrulhada, texto, rotulo) => (texto ? embrulhar(cofre.abrirKek(donoId, kekEmbrulhada), Buffer.from(String(texto), "utf8"), `segredo|${rotulo}`) : ""),
    decifrarSegredo: (donoId, kekEmbrulhada, guardado, rotulo) => (guardado ? desembrulhar(cofre.abrirKek(donoId, kekEmbrulhada), guardado, `segredo|${rotulo}`).toString("utf8") : ""),

    /* ----- exportações: arquivo cifrado com DEK própria embrulhada direto pela KEK da conta ----- */
    novaDekExportacao(conta, exportacaoId) {
      const dek = randomBytes(32);
      return { dek, embrulhada: embrulhar(cofre.abrirKek(conta.id, conta.kek_embrulhada), dek, `exportacao|${exportacaoId}`) };
    },
    abrirDekExportacao: (conta, exp) => desembrulhar(cofre.abrirKek(conta.id, conta.kek_embrulhada), exp.dek_embrulhada, `exportacao|${exp.id}`),
  };
  return cofre;
}

/**
 * Fluxo claro de um arquivo NXG1 guardado, com Range: lê só a faixa cifrada necessária e decifra bloco a bloco.
 * `armazenamento.ler(chave, { inicio, fim })` devolve um Readable. Nada em claro toca o disco.
 */
export async function fluxoClaro({ armazenamento, chave, dek, aad, tamanhoClaro, inicio = 0, fim = tamanhoClaro - 1 }) {
  const cab = await juntar(await armazenamento.ler(chave, { inicio: 0, fim: CABECALHO - 1 }));
  const { bloco, prefixo } = lerCabecalho(cab);
  const f = faixaCifrada(tamanhoClaro, bloco, inicio, fim);
  const cifrado = await armazenamento.ler(chave, { inicio: f.de, fim: f.ate });
  const dec = criarDecifrador({ dek, aad, bloco, prefixo, tamanhoClaro, primeiroBloco: f.primeiroBloco, pular: f.pular, entregar: f.entregar });
  cifrado.on("error", (e) => dec.destroy(e));
  return cifrado.pipe(dec);
}

export async function juntar(fluxo) {
  const partes = [];
  for await (const p of fluxo) partes.push(p);
  return Buffer.concat(partes);
}

export { criarCifrador };
