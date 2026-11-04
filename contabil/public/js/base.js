/* Peças comuns do painel do Nexor Contábil: situações, prazos e envio de arquivos. */

import { h } from "./ui.js";
import { dataBR, hojeISO } from "./comum.js";

const SIT = {
  pendente: ["Pendente", "alerta"],
  recebido: ["Recebido", "ok"],
  dispensado: ["Dispensado", ""],
  novo: ["A conferir", "alerta"],
  conferido: ["Conferido", "ok"],
  rejeitado: ["Rejeitado", "perigo"],
  a_fazer: ["A fazer", ""],
  em_andamento: ["Em andamento", "info"],
  concluida: ["Concluída", "ok"],
  dispensada: ["Dispensada", ""],
  sugerido: ["Sugerido", "alerta"],
  aprovado: ["Aprovado", "ok"],
  exportado: ["Exportado", "info"],
  disponivel: ["Disponível", "info"],
  visualizada: ["Visualizada", "info"],
  paga: ["Paga", "ok"],
  aberto: ["Aberto", "alerta"],
  respondido: ["Respondido", "info"],
  resolvido: ["Resolvido", "ok"],
  lendo: ["Lendo…", "info"],
  lido: ["Lido pela IA", "ok"],
  erro: ["Erro na leitura", "perigo"],
  sem_ia: ["Sem leitura", ""],
};
export function sit(chave, texto) {
  const [r, cor] = SIT[chave] ?? [chave, ""];
  return h("span", { class: `chip ${cor ? `chip-${cor}` : ""}` }, texto ?? r);
}
/** Prazo com destaque: atrasado (vermelho), hoje (amarelo) */
export function prazo(d, aberto = true) {
  if (!d) return "—";
  const hoje = hojeISO();
  return h("span", { class: aberto && d < hoje ? "prazo-atrasado" : aberto && d === hoje ? "prazo-hoje" : "" }, dataBR(d), aberto && d < hoje ? " · atrasado" : aberto && d === hoje ? " · hoje" : "");
}
export const ORIGEM = { portal: "Portal", whatsapp: "WhatsApp", equipe: "Equipe" };
export const TIPOS_ESPERADO = { extrato: "Extrato bancário", notas_entrada: "Notas de entrada", notas_saida: "Notas de saída", comprovantes: "Comprovantes", faturamento: "Faturamento", folha: "Folha (variáveis)", estoque: "Estoque", outro: "Outro" };

/** Envia arquivos para a API (corpo bruto + nome no cabeçalho) */
export async function enviarArquivo(caminho, arquivo) {
  const r = await fetch(`/api${caminho}`, { method: "POST", credentials: "same-origin", headers: { "x-nexor": "1", "Content-Type": arquivo.type || "application/octet-stream", "x-nome": encodeURIComponent(arquivo.name) }, body: arquivo });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro ?? `Erro ${r.status}`);
  return d;
}

/** Área de arrastar e soltar (ou clicar) */
export function areaEnvio(aoEscolher, texto = "Arraste os arquivos aqui ou clique para escolher") {
  const input = h("input", { type: "file", multiple: true, hidden: true, accept: ".pdf,.jpg,.jpeg,.png,.webp,.xml,.ofx,.csv,.txt,.xls,.xlsx", onchange: () => (aoEscolher([...input.files]), (input.value = "")) });
  const area = h("div", { class: "area-envio", tabindex: 0, role: "button", onclick: () => input.click(), onkeydown: (e) => (e.key === "Enter" || e.key === " ") && input.click() }, texto, input);
  area.addEventListener("dragover", (e) => (e.preventDefault(), area.classList.add("sobre")));
  area.addEventListener("dragleave", () => area.classList.remove("sobre"));
  area.addEventListener("drop", (e) => (e.preventDefault(), area.classList.remove("sobre"), aoEscolher([...e.dataTransfer.files])));
  return area;
}
export const nomeCliente = (c) => c?.nome_fantasia || c?.razao_social || c?.cliente || "—";
