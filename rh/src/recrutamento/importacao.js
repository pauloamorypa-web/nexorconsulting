/* Entrada de candidatos vindos de outras plataformas:
   - Webhook: a plataforma (Gupy, Solides, formulários, Zapier/Make…) envia um JSON e o mapeamento diz onde está
     cada campo. Mapeamentos prontos para os formatos mais comuns, todos editáveis.
   - API: busca vagas e candidaturas na Gupy (ver gupy.js).
   - Planilha CSV: exportações de Catho, InfoJobs, Vagas.com, LinkedIn, Indeed, Gupy etc. As colunas são
     reconhecidas pelo nome.
   Candidatos repetidos (mesmo código externo, ou mesmo e-mail na mesma vaga) são atualizados, não duplicados. */

export const FONTES = {
  site: "Site da empresa",
  gupy: "Gupy",
  linkedin: "LinkedIn",
  indeed: "Indeed",
  infojobs: "InfoJobs",
  catho: "Catho",
  vagas: "Vagas.com",
  solides: "Solides",
  google: "Google Vagas",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  indicacao: "Indicação",
  feed: "Agregadores (feed)",
  outra: "Outra",
};

/* Lista de caminhos alternativos por campo: usa o primeiro que existir no JSON recebido */
export const MAPEAMENTOS = {
  generico: {
    externo_id: ["id", "candidate_id", "application_id", "candidatura.id"],
    nome: ["nome", "name", "candidate.name", "candidato.nome", "full_name"],
    email: ["email", "candidate.email", "candidato.email"],
    telefone: ["telefone", "phone", "celular", "mobile", "candidate.phone", "candidato.telefone"],
    cidade: ["cidade", "city", "candidate.city", "address.city"],
    linkedin: ["linkedin", "linkedin_url", "candidate.linkedin", "candidate.linkedinProfileUrl"],
    curriculo_url: ["curriculo", "curriculo_url", "resume", "resume_url", "cv", "candidate.resume", "candidate.curriculum"],
    mensagem: ["mensagem", "message", "cover_letter", "observacao"],
    vaga_codigo: ["vaga", "vaga_id", "job_id", "job.id", "jobId", "vaga.codigo"],
    vaga_titulo: ["vaga_titulo", "job_title", "job.name", "job.title", "vaga.titulo"],
    etapa: ["etapa", "stage", "step", "currentStep.name"],
  },
  // Formato das candidaturas da Gupy (a conferir com a documentação da sua conta)
  gupy: {
    externo_id: ["id", "application.id", "data.application.id", "data.id"],
    nome: ["candidate.name", "application.candidate.name", "data.candidate.name", "candidate.fullName", "name"],
    email: ["candidate.email", "application.candidate.email", "data.candidate.email", "email"],
    telefone: ["candidate.mobileNumber", "candidate.phoneNumber", "candidate.phone", "data.candidate.mobileNumber", "phone"],
    cidade: ["candidate.addressCity", "candidate.city", "data.candidate.addressCity"],
    linkedin: ["candidate.linkedinProfileUrl", "candidate.linkedin", "data.candidate.linkedinProfileUrl"],
    curriculo_url: ["candidate.curriculum", "candidate.resumeUrl", "data.candidate.curriculum"],
    mensagem: [],
    vaga_codigo: ["jobId", "job.id", "application.jobId", "data.job.id", "data.jobId"],
    vaga_titulo: ["job.name", "jobName", "data.job.name"],
    etapa: ["currentStep.name", "currentStepName", "data.currentStep.name", "status"],
  },
  solides: {
    externo_id: ["id", "candidato.id", "candidate.id"],
    nome: ["candidato.nome", "candidate.name", "nome", "name"],
    email: ["candidato.email", "candidate.email", "email"],
    telefone: ["candidato.celular", "candidato.telefone", "candidate.phone", "telefone"],
    cidade: ["candidato.cidade", "candidate.city", "cidade"],
    linkedin: ["candidato.linkedin", "candidate.linkedin"],
    curriculo_url: ["candidato.curriculo", "candidate.resume"],
    mensagem: [],
    vaga_codigo: ["vaga.id", "job.id", "vaga_id"],
    vaga_titulo: ["vaga.titulo", "vaga.nome", "job.title"],
    etapa: ["etapa", "status"],
  },
};

const pegar = (obj, caminho) => caminho.split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);

/** Aplica o mapeamento a um JSON recebido */
export function mapear(payload, mapa = MAPEAMENTOS.generico) {
  const r = {};
  for (const [campo, caminhos] of Object.entries(mapa)) {
    for (const c of [caminhos].flat()) {
      const v = pegar(payload, c);
      if (v !== undefined && v !== null && v !== "" && typeof v !== "object") {
        r[campo] = String(v).trim();
        break;
      }
    }
  }
  return r;
}

/* Etapas externas → etapas do funil */
const ETAPAS_EXTERNAS = [
  [/contrat|hired|admit/i, "contratado"],
  [/reprov|recus|declin|rejeit|reject|desclass|desist/i, "reprovado"],
  [/propost|offer/i, "proposta"],
  [/teste|test|case|avalia|assessment|din[aâ]mica/i, "teste"],
  [/entrevist|interview/i, "entrevista"],
];
export const etapaDoFunil = (texto) => ETAPAS_EXTERNAS.find(([re]) => re.test(texto ?? ""))?.[1] ?? null;

/* ---------- CSV ---------- */

/** Lê CSV com ; ou , e campos entre aspas */
export function lerCsv(texto) {
  const t = String(texto).replace(/^\ufeff/, "");
  const primeira = t.split(/\r?\n/, 1)[0];
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : primeira.includes("\t") ? "\t" : ",";
  const linhas = [];
  let campo = "";
  let linha = [];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') (campo += '"'), i++;
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) linha.push(campo), (campo = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}

const normal = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const COLUNAS_CSV = {
  nome: ["nome", "nomecompleto", "name", "fullname", "candidato", "nomedocandidato", "firstname"],
  sobrenome: ["sobrenome", "lastname"],
  email: ["email", "emailaddress", "emaildocandidato"],
  telefone: ["telefone", "celular", "phone", "phonenumber", "whatsapp", "mobile", "telefonecelular", "fone"],
  cidade: ["cidade", "city", "localidade", "location", "municipio"],
  linkedin: ["linkedin", "perfillinkedin", "linkedinurl", "profileurl"],
  curriculo_url: ["curriculo", "cv", "resume", "linkdocurriculo", "resumeurl"],
  vaga_titulo: ["vaga", "jobtitle", "job", "cargo", "titulodavaga", "position"],
  externo_id: ["id", "codigo", "idcandidato", "candidateid", "applicationid"],
  etapa: ["etapa", "status", "stage", "fase"],
};

/** Transforma o CSV em candidatos, reconhecendo as colunas pelo nome */
export function candidatosDoCsv(texto) {
  const linhas = lerCsv(texto);
  if (linhas.length < 2) return { colunas: {}, candidatos: [] };
  const cab = linhas[0].map(normal);
  const colunas = {};
  for (const [campo, nomes] of Object.entries(COLUNAS_CSV)) {
    const i = cab.findIndex((c) => nomes.includes(c));
    if (i >= 0) colunas[campo] = i;
  }
  const candidatos = linhas.slice(1).map((l) => {
    const d = {};
    for (const [campo, i] of Object.entries(colunas)) if (l[i]?.trim()) d[campo] = l[i].trim();
    if (d.sobrenome) d.nome = `${d.nome ?? ""} ${d.sobrenome}`.trim();
    delete d.sobrenome;
    return d;
  });
  return { colunas: Object.fromEntries(Object.entries(colunas).map(([k, i]) => [k, linhas[0][i]])), candidatos: candidatos.filter((c) => c.nome || c.email) };
}

/* ---------- Gravação ---------- */

/**
 * Cria ou atualiza o candidato. Vaga: pelo id, pelo código externo, pelo título, ou a vaga padrão informada.
 * Se nenhuma vaga existir, cria uma vaga "pausada" com o título recebido (para não perder o candidato).
 * @returns {{ candidato, criado: boolean, vagaCriada: boolean } | { erro: string }}
 */
export function gravarCandidato(repo, empresa_id, dados, { origem, vagaPadrao } = {}) {
  if (!dados.nome && !dados.email) return { erro: "sem nome nem e-mail" };
  let vaga = null;
  if (dados.vaga_codigo) vaga = repo.um("SELECT * FROM vagas WHERE empresa_id = ? AND (id = ? OR codigo_externo = ?)", empresa_id, dados.vaga_codigo, dados.vaga_codigo);
  if (!vaga && dados.vaga_titulo) vaga = repo.um("SELECT * FROM vagas WHERE empresa_id = ? AND lower(titulo) = lower(?) ORDER BY status = 'aberta' DESC, criada_em DESC LIMIT 1", empresa_id, dados.vaga_titulo);
  if (!vaga && vagaPadrao) vaga = repo.um("SELECT * FROM vagas WHERE empresa_id = ? AND id = ?", empresa_id, vagaPadrao);
  let vagaCriada = false;
  if (!vaga) {
    vaga = repo.inserir("vagas", { empresa_id, titulo: (dados.vaga_titulo || `Vaga importada (${FONTES[origem] ?? origem})`).slice(0, 120), codigo_externo: dados.vaga_codigo ?? null, status: "pausada", descricao: `Criada automaticamente ao receber candidatos de ${FONTES[origem] ?? origem}.` });
    vagaCriada = true;
  }
  const email = dados.email?.toLowerCase().slice(0, 160) || null;
  const existente =
    (dados.externo_id && repo.um("SELECT * FROM candidatos WHERE empresa_id = ? AND origem = ? AND externo_id = ?", empresa_id, origem, dados.externo_id)) ||
    (email && repo.um("SELECT * FROM candidatos WHERE empresa_id = ? AND vaga_id = ? AND lower(email) = ?", empresa_id, vaga.id, email));
  const etapa = etapaDoFunil(dados.etapa);
  const campos = {
    nome: (dados.nome || email).slice(0, 150),
    email,
    telefone: dados.telefone?.slice(0, 20) ?? null,
    cidade: dados.cidade?.slice(0, 80) ?? null,
    linkedin: /^https?:\/\//.test(dados.linkedin ?? "") ? dados.linkedin.slice(0, 200) : null,
    curriculo_url: /^https?:\/\//.test(dados.curriculo_url ?? "") ? dados.curriculo_url.slice(0, 500) : null,
    mensagem: dados.mensagem?.slice(0, 4000) ?? null,
  };
  if (existente) {
    const atual = { ...Object.fromEntries(Object.entries(campos).filter(([, v]) => v)), ...(etapa ? { etapa } : {}) };
    return { candidato: repo.atualizar("candidatos", empresa_id, existente.id, atual), criado: false, vagaCriada };
  }
  const c = repo.inserir("candidatos", { ...campos, empresa_id, vaga_id: vaga.id, origem: origem in FONTES ? origem : "outra", externo_id: dados.externo_id?.slice(0, 120) ?? null, ...(etapa ? { etapa } : {}) });
  return { candidato: c, criado: true, vagaCriada };
}
