/* Laudo de integridade: documento HTML imprimível (Ctrl+P → PDF) que acompanha a exportação.
   Mostra o que foi exportado, por quem, quando e de onde; os hashes de cada trecho e a posição de cada um na cadeia de
   custódia; e o código de verificação que qualquer pessoa confere na página pública /verificar. */

import { createHash } from "node:crypto";
import { hojeBR, horaBR } from "./datas.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const dataHora = (ms) => {
  const d = hojeBR(ms);
  const s = new Date(ms - 3 * 3600_000).toISOString().slice(17, 19);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${horaBR(ms)}:${s}`;
};
const tamanhoLegivel = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

/** Hash do laudo: SHA-256 do JSON dos dados (é o que a página de verificação recalcula) */
export const hashDoLaudo = (dados) => createHash("sha256").update(JSON.stringify(dados)).digest("hex");
export const formatarCodigo = (c) => `GD-${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;

/** Texto da marca-d'água: quem, quando e de onde (dissuade vazamento por foto de tela) */
export const marcaDagua = ({ nome, email, ip, quando, extra }) => [nome, email, dataHora(quando), ip ? `IP ${String(ip).replace(/^::ffff:/, "")}` : null, extra].filter(Boolean).join(" · ");

export function laudoHtml(d, hash, urlVerificar) {
  const linhas = d.trechos.map((t) => `<tr><td>${t.seq}</td><td>${esc(dataHora(t.inicio))}</td><td>${esc(dataHora(t.fim))}</td><td class="n">${t.tamanho}</td><td class="h">${esc(t.sha256)}</td><td class="h">${esc(t.hash_cadeia)}</td></tr>`).join("");
  const marca = esc(d.marca_dagua);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Laudo de integridade ${esc(d.codigo)}</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:0;padding:24px;line-height:1.45;font-size:13px;position:relative}
main{max-width:900px;margin:0 auto;position:relative;z-index:1}
h1{font-size:20px;margin:0 0 2px}h2{font-size:14px;margin:22px 0 8px;border-bottom:1px solid #999;padding-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
.sub{color:#444;margin:0 0 14px}.cod{font-family:ui-monospace,Consolas,monospace;font-size:20px;font-weight:700;letter-spacing:.06em;border:2px solid #111;display:inline-block;padding:6px 12px;border-radius:6px}
dl{display:grid;grid-template-columns:200px 1fr;gap:4px 12px;margin:0}dt{color:#444}dd{margin:0;word-break:break-word}
table{border-collapse:collapse;width:100%;font-size:10.5px}th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}
.h{font-family:ui-monospace,Consolas,monospace;word-break:break-all;font-size:9.5px}.n{text-align:right;white-space:nowrap}
.ok{color:#0a6b2d;font-weight:700}.ruim{color:#a40000;font-weight:700}.nota{color:#444;font-size:11.5px}
.marca{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;opacity:.09;font-size:15px;font-weight:700;line-height:64px;transform:rotate(-24deg) scale(1.6);white-space:pre-wrap;word-spacing:40px}
@media print{body{padding:0}.marca{opacity:.08}}
</style></head><body>
<div class="marca" aria-hidden="true">${`${marca}     `.repeat(60)}</div>
<main>
<h1>Laudo de integridade de gravação</h1>
<p class="sub">Nexor Guardião · cadeia de custódia digital</p>
<p><span class="cod">${esc(d.codigo)}</span></p>
<p class="nota">Confira este laudo em <strong>${esc(urlVerificar)}</strong> informando o código acima. A página recalcula os hashes e diz se o laudo e o arquivo são os originais.</p>

<h2>Identificação</h2>
<dl>
<dt>Empresa (controladora)</dt><dd>${esc(d.conta.nome)}${d.conta.cnpj ? ` · CNPJ ${esc(d.conta.cnpj)}` : ""}</dd>
<dt>Local e câmera</dt><dd>${esc(d.camera.local)} · ${esc(d.camera.nome)}</dd>
<dt>Intervalo exportado</dt><dd>${esc(dataHora(d.intervalo.inicio))} a ${esc(dataHora(d.intervalo.fim))} (horário de Brasília)</dd>
<dt>Motivo informado</dt><dd>${esc(d.motivo || "não informado")}</dd>
<dt>Exportado por</dt><dd>${esc(d.exportado_por.nome)} (${esc(d.exportado_por.perfil)}) · ${esc(d.exportado_por.email)}</dd>
<dt>Data, hora e origem</dt><dd>${esc(dataHora(d.emitido_em))} · IP ${esc(d.ip || "não registrado")}</dd>
</dl>

<h2>Arquivo exportado</h2>
<dl>
<dt>Nome</dt><dd>${esc(d.arquivo.nome)}</dd>
<dt>Formato</dt><dd>${d.arquivo.formato === "zip" ? "Pacote .zip com os trechos originais" : "Vídeo único (trechos concatenados sem recomprimir)"}</dd>
<dt>Tamanho</dt><dd>${esc(tamanhoLegivel(d.arquivo.tamanho))} (${d.arquivo.tamanho} bytes)</dd>
<dt>SHA-256 do arquivo</dt><dd class="h">${esc(d.arquivo.sha256)}</dd>
</dl>

<h2>Cadeia de custódia</h2>
<dl>
<dt>Conferência na emissão</dt><dd>${d.cadeia.integra ? '<span class="ok">ÍNTEGRA</span>' : '<span class="ruim">COM FALHA</span>'} · ${d.cadeia.total} elos conferidos em ${esc(dataHora(d.cadeia.conferida_em))}</dd>
<dt>Último elo da câmera</dt><dd>nº ${d.cadeia.topo_seq} · <span class="h">${esc(d.cadeia.topo_hash)}</span></dd>
<dt>Trechos neste laudo</dt><dd>${d.trechos.length}</dd>
<dt>Hash deste laudo</dt><dd class="h">${esc(hash)}</dd>
</dl>
<p class="nota">Cada trecho saiu do local já cifrado (AES-256-GCM) e recebeu, na chegada, o SHA-256 do arquivo cifrado e um elo na cadeia de hashes da câmera: cada elo contém o hash do elo anterior. Trocar, cortar ou remover um trecho quebra a conta dos elos seguintes e aparece na conferência.</p>

<h2>Trechos</h2>
<table><thead><tr><th>Elo</th><th>Início</th><th>Fim</th><th>Bytes</th><th>SHA-256 do trecho cifrado</th><th>Hash do elo na cadeia</th></tr></thead><tbody>${linhas}</tbody></table>

<p class="nota">Marca-d'água: ${marca}. Documento gerado automaticamente pelo ${esc(d.sistema)}. Este laudo atesta a integridade técnica do arquivo desde o recebimento pela plataforma; não substitui perícia oficial.</p>
</main></body></html>`;
}
