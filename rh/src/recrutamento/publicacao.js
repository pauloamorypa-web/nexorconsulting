/* Publicação das vagas fora do sistema:
   - Página própria de cada vaga com dados estruturados schema.org/JobPosting (Google Vagas / Google for Jobs)
     e prévia para LinkedIn, WhatsApp e Facebook (Open Graph).
   - Feed XML no formato usado por agregadores (Indeed, Jooble, Talent.com, Careerjet, Adzuna e outros):
     você cadastra o endereço do feed uma vez e as vagas abertas são lidas sozinhas.
   - Sitemap das vagas para o Google encontrar as páginas. */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cdata = (s) => `<![CDATA[${String(s ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
const iso = (ms) => new Date(ms).toISOString();

export const TIPOS_CONTRATO = { clt: ["FULL_TIME", "Efetivo (CLT)"], meio_periodo: ["PART_TIME", "Meio período"], temporario: ["TEMPORARY", "Temporário"], estagio: ["INTERN", "Estágio"], pj: ["CONTRACTOR", "Prestador de serviço (PJ)"], aprendiz: ["OTHER", "Jovem aprendiz"] };

export const linkVaga = (base, vaga, origem) => `${base}/vagas/v/${vaga.id}${origem ? `?origem=${encodeURIComponent(origem)}` : ""}`;

/** Lê "R$ 2.500 a R$ 3.000" → { min: 2500, max: 3000 } (em reais) */
export function faixaSalarial(texto) {
  const nums = [...String(texto ?? "").matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?/g)].map((m) => Number(m[1].replace(/\./g, "")) + (m[2] ? Number(m[2]) / 100 : 0)).filter((n) => n >= 100);
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** Dados estruturados da vaga para o Google (JobPosting) */
export function jobPosting({ vaga, empresa, base }) {
  const validade = vaga.validade || new Date(vaga.criada_em + 60 * 86400_000).toISOString().slice(0, 10);
  const descricao = [vaga.descricao, vaga.requisitos ? `Requisitos:\n${vaga.requisitos}` : ""].filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const faixa = faixaSalarial(vaga.salario);
  const remoto = vaga.modalidade === "remoto";
  const j = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: vaga.titulo,
    description: descricao || `<p>${esc(vaga.titulo)}</p>`,
    identifier: { "@type": "PropertyValue", name: empresa.nome_fantasia || empresa.razao_social, value: vaga.id },
    datePosted: iso(vaga.criada_em).slice(0, 10),
    validThrough: `${validade}T23:59:59-03:00`,
    employmentType: (TIPOS_CONTRATO[vaga.tipo_contrato] ?? TIPOS_CONTRATO.clt)[0],
    hiringOrganization: { "@type": "Organization", name: empresa.nome_fantasia || empresa.razao_social, sameAs: base },
    directApply: true,
    url: linkVaga(base, vaga),
  };
  if (remoto) {
    j.jobLocationType = "TELECOMMUTE";
    j.applicantLocationRequirements = { "@type": "Country", name: "BR" };
  } else {
    j.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: vaga.local || empresa.endereco?.cidade || "", addressRegion: vaga.estado || empresa.endereco?.uf || "", addressCountry: "BR" } };
  }
  if (faixa) j.baseSalary = { "@type": "MonetaryAmount", currency: "BRL", value: { "@type": "QuantitativeValue", ...(faixa.min === faixa.max ? { value: faixa.min } : { minValue: faixa.min, maxValue: faixa.max }), unitText: "MONTH" } };
  return j;
}

/** Página HTML de uma vaga (renderizada no servidor para o Google e para as prévias de link) */
export function paginaVaga({ vaga, empresa, base, aberta }) {
  const nomeEmpresa = empresa.nome_fantasia || empresa.razao_social;
  const resumo = String(vaga.descricao ?? "").replace(/\s+/g, " ").slice(0, 180);
  const ld = aberta ? `<script type="application/ld+json">${JSON.stringify(jobPosting({ vaga, empresa, base })).replace(/</g, "\\u003c")}</script>` : `<meta name="robots" content="noindex">`;
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(vaga.titulo)} · ${esc(nomeEmpresa)}</title>
    <meta name="description" content="${esc(resumo)}" />
    <link rel="canonical" href="${esc(linkVaga(base, vaga))}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Vaga: ${esc(vaga.titulo)} · ${esc(nomeEmpresa)}" />
    <meta property="og:description" content="${esc(resumo || "Candidate-se pelo link.")}" />
    <meta property="og:url" content="${esc(linkVaga(base, vaga))}" />
    <meta property="og:image" content="${esc(base)}/img/icone-512.png" />
    <meta name="twitter:card" content="summary" />
    <link rel="icon" href="/img/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/app.css" />
    <link rel="stylesheet" href="/vagas/vagas.css" />
    ${ld}
  </head>
  <body>
    <main id="vagas" class="vagas-pagina" data-empresa="${esc(vaga.empresa_id)}" data-vaga="${esc(vaga.id)}">
      <article class="cartao vaga"><h1>${esc(vaga.titulo)}</h1><p class="texto-longo">${esc(vaga.descricao ?? "")}</p></article>
    </main>
    <div id="toasts" aria-live="polite"></div>
    <script type="module" src="/vagas/vagas.js"></script>
  </body>
</html>`;
}

/** Feed XML de vagas (formato aceito pelos principais agregadores de vagas) */
export function feedXml({ empresa, vagas, base, agora = Date.now() }) {
  const nome = empresa.nome_fantasia || empresa.razao_social;
  const itens = vagas
    .map((v) => {
      const faixa = faixaSalarial(v.salario);
      return `  <job>
    <title>${cdata(v.titulo)}</title>
    <date>${cdata(new Date(v.criada_em).toUTCString())}</date>
    <referencenumber>${cdata(v.id)}</referencenumber>
    <requisitionid>${cdata(v.codigo_externo || v.id.slice(0, 8))}</requisitionid>
    <url>${cdata(linkVaga(base, v, "feed"))}</url>
    <company>${cdata(nome)}</company>
    <sourcename>${cdata(nome)}</sourcename>
    <city>${cdata(v.modalidade === "remoto" ? "" : v.local || empresa.endereco?.cidade || "")}</city>
    <state>${cdata(v.estado || empresa.endereco?.uf || "")}</state>
    <country>${cdata("BR")}</country>
    <description>${cdata([v.descricao, v.requisitos ? `Requisitos:\n${v.requisitos}` : ""].filter(Boolean).join("\n\n"))}</description>
    <salary>${cdata(faixa ? v.salario : "")}</salary>
    <jobtype>${cdata((TIPOS_CONTRATO[v.tipo_contrato] ?? TIPOS_CONTRATO.clt)[1])}</jobtype>
    <remotetype>${cdata(v.modalidade === "remoto" ? "Totalmente remoto" : v.modalidade === "hibrido" ? "Híbrido" : "")}</remotetype>
  </job>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>${cdata(nome)}</publisher>
  <publisherurl>${cdata(`${base}/vagas/?e=${empresa.id}`)}</publisherurl>
  <lastBuildDate>${cdata(new Date(agora).toUTCString())}</lastBuildDate>
${itens}
</source>
`;
}

export function sitemapVagas({ vagas, base }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${vagas.map((v) => `  <url><loc>${esc(linkVaga(base, v))}</loc><lastmod>${iso(v.criada_em).slice(0, 10)}</lastmod></url>`).join("\n")}
</urlset>
`;
}
