/* Personalização do agente, feita pelo próprio dono conversando no WhatsApp:
   nome, jeito de falar, instruções permanentes e coisas para lembrar. Fica num arquivo JSON. */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PERFIL_PADRAO = {
  nome: "Blue",
  empresa: "",
  tom: "próximo e direto, como uma assistente de confiança",
  instrucoes: [],
  memorias: [],
};

const LIMITES = { nome: 40, empresa: 80, tom: 200, item: 400, itens: 60 };

export function criarPerfil(pasta) {
  const arquivo = path.join(pasta, "perfil.json");
  let perfil;
  try {
    perfil = { ...PERFIL_PADRAO, ...JSON.parse(readFileSync(arquivo, "utf8")) };
  } catch {
    perfil = structuredClone(PERFIL_PADRAO);
  }
  const salvar = () => {
    mkdirSync(pasta, { recursive: true });
    writeFileSync(arquivo + ".tmp", JSON.stringify(perfil, null, 2));
    renameSync(arquivo + ".tmp", arquivo);
  };

  return {
    obter: () => structuredClone(perfil),
    ajustar(campo, valor) {
      if (!["nome", "empresa", "tom"].includes(campo)) throw new Error("campo inválido");
      const v = String(valor ?? "").trim().slice(0, LIMITES[campo]);
      if (!v) throw new Error("valor vazio");
      perfil[campo] = v;
      salvar();
      return `${campo} atualizado para: ${v}`;
    },
    adicionar(lista, texto) {
      if (!["instrucoes", "memorias"].includes(lista)) throw new Error("lista inválida");
      const t = String(texto ?? "").trim().slice(0, LIMITES.item);
      if (!t) throw new Error("texto vazio");
      if (perfil[lista].length >= LIMITES.itens) throw new Error("limite de itens atingido: remova algum antes");
      perfil[lista].push(t);
      salvar();
      return `guardado em ${lista} (nº ${perfil[lista].length})`;
    },
    remover(lista, numero) {
      if (!["instrucoes", "memorias"].includes(lista)) throw new Error("lista inválida");
      const i = Number(numero) - 1;
      if (!Number.isInteger(i) || i < 0 || i >= perfil[lista].length) throw new Error("número inexistente");
      const [tirado] = perfil[lista].splice(i, 1);
      salvar();
      return `removido de ${lista}: ${tirado}`;
    },
  };
}

/** Bloco de sistema com a personalidade. Vai depois das instruções fixas (que ficam em cache). */
export function textoDoPerfil(p) {
  const n = (arr) => (arr.length ? arr.map((x, i) => `${i + 1}. ${x}`).join("\n") : "(nenhuma)");
  return `<perfil_definido_pelo_dono>
Seu nome: ${p.nome}
Empresa do dono: ${p.empresa || "(não informada)"}
Jeito de falar: ${p.tom}
Instruções permanentes do dono:
${n(p.instrucoes)}
Coisas que o dono pediu para você lembrar:
${n(p.memorias)}
</perfil_definido_pelo_dono>`;
}
