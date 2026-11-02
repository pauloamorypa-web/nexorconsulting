/* Arquivos de mídia (fotos, áudios, documentos). A Meta apaga a URL da mídia em poucos minutos,
   então tudo que chega é baixado e guardado aqui. */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";

const EXTENSOES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};
const TIPOS = Object.fromEntries(Object.entries(EXTENSOES).map(([t, e]) => [e, t]));

export const ARQUIVO_VALIDO = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

export function criarMidia(pasta) {
  const raiz = join(pasta, "midia");
  return {
    async salvar(empresa_id, dados, tipo) {
      const ext = EXTENSOES[String(tipo).split(";")[0].trim()] ?? "bin";
      const arquivo = `${empresa_id}/${randomUUID()}.${ext}`;
      await mkdir(join(raiz, empresa_id), { recursive: true });
      await writeFile(join(raiz, arquivo), dados);
      return arquivo;
    },
    ler(arquivo) {
      if (!ARQUIVO_VALIDO.test(arquivo)) return Promise.reject(new Error("arquivo inválido"));
      return readFile(join(raiz, normalize(arquivo)));
    },
    tipoDe: (arquivo) => TIPOS[arquivo.split(".").pop()] ?? "application/octet-stream",
  };
}

/** Tipo de mensagem do WhatsApp para um tipo de arquivo */
export function tipoWhatsApp(mime) {
  if (/^image\/(jpeg|png)$/.test(mime)) return "image";
  if (mime === "image/webp") return "sticker";
  if (/^audio\//.test(mime)) return "audio";
  if (/^video\/(mp4|3gpp)$/.test(mime)) return "video";
  return "document";
}
