/* Escritor de ZIP em fluxo, sem dependências (método "store", sem compressão: vídeo já é comprimido).
   Usa descritor de dados (o CRC e o tamanho vêm depois do conteúdo), então cada entrada pode ser um fluxo de tamanho desconhecido.
   Limite: 4 GB por arquivo e no total (ZIP clássico); a exportação é limitada bem abaixo disso. */

import { crc32 } from "node:zlib";

const dataDos = (ms) => {
  const d = new Date(ms);
  return { hora: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1), dia: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate() };
};

/** Gerador assíncrono: recebe entradas [{ nome, fluxo | dados }] (iterável, pode ser assíncrono) e emite os bytes do ZIP */
export async function* gerarZip(entradas, agora = Date.now()) {
  const central = [];
  let posicao = 0;
  const { hora, dia } = dataDos(agora);
  for await (const e of entradas) {
    const nome = Buffer.from(e.nome, "utf8");
    const cab = Buffer.alloc(30);
    cab.writeUInt32LE(0x04034b50, 0);
    cab.writeUInt16LE(20, 4);
    cab.writeUInt16LE(0x0808, 6); // bit 3 (descritor de dados) + bit 11 (nomes em UTF-8)
    cab.writeUInt16LE(0, 8);
    cab.writeUInt16LE(hora, 10);
    cab.writeUInt16LE(dia, 12);
    cab.writeUInt16LE(nome.length, 26);
    const inicio = posicao;
    yield cab;
    yield nome;
    posicao += 30 + nome.length;
    let crc = 0;
    let tamanho = 0;
    for await (const parte of e.fluxo ?? [e.dados]) {
      const b = Buffer.isBuffer(parte) ? parte : Buffer.from(parte);
      crc = crc32(b, crc);
      tamanho += b.length;
      yield b;
    }
    posicao += tamanho;
    const desc = Buffer.alloc(16);
    desc.writeUInt32LE(0x08074b50, 0);
    desc.writeUInt32LE(crc, 4);
    desc.writeUInt32LE(tamanho, 8);
    desc.writeUInt32LE(tamanho, 12);
    yield desc;
    posicao += 16;
    central.push({ nome, crc, tamanho, inicio });
  }
  const inicioCentral = posicao;
  for (const c of central) {
    const r = Buffer.alloc(46);
    r.writeUInt32LE(0x02014b50, 0);
    r.writeUInt16LE(20, 4);
    r.writeUInt16LE(20, 6);
    r.writeUInt16LE(0x0808, 8);
    r.writeUInt16LE(0, 10);
    r.writeUInt16LE(hora, 12);
    r.writeUInt16LE(dia, 14);
    r.writeUInt32LE(c.crc, 16);
    r.writeUInt32LE(c.tamanho, 20);
    r.writeUInt32LE(c.tamanho, 24);
    r.writeUInt16LE(c.nome.length, 28);
    r.writeUInt32LE(c.inicio, 42);
    yield r;
    yield c.nome;
    posicao += 46 + c.nome.length;
  }
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(central.length, 8);
  fim.writeUInt16LE(central.length, 10);
  fim.writeUInt32LE(posicao - inicioCentral, 12);
  fim.writeUInt32LE(inicioCentral, 16);
  yield fim;
}
