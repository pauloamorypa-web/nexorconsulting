/* Regras do Nexor Guardião: contas e chaves, ingestão (com cadeia de hashes), saúde e alertas, acesso às imagens,
   retenção, verificação da cadeia, inadimplência, encerramento (apagamento criptográfico), consumo e relatório mensal.
   Preservação, exportação, laudo e compartilhamento ficam em evidencias.js. */

import { CABECALHO, KEK_PLATAFORMA, aadTrecho, fluxoClaro, juntar, lerCabecalho, tamanhoCifrado } from "../cofre.js";
import { falha } from "../http/roteador.js";
import { ipPermitido } from "../http/validacao.js";
import { GENESE, conferirAuditoria, conferirCadeia, hashTrecho } from "../regras/cadeia.js";
import { diaSemana, hojeBR, horaBR, minutos, paraMs } from "../regras/datas.js";
import { BITRATE_MAXIMO_KBPS, COMERCIAL, FAIXAS_KBPS, acimaDaFaixa, comDesconto, descontoRevendaBps, descontoVolumeBps, faixaDoBitrate } from "../regras/precos.js";

const DIA = 86400_000;
const MIME = { mp4: "video/mp4", ts: "video/mp2t" };

export const TIPOS_ALERTA = {
  camera_sem_sinal: { gravidade: "alta", nome: "Câmera sem sinal" },
  imagem_preta: { gravidade: "alta", nome: "Imagem preta" },
  imagem_tampada: { gravidade: "alta", nome: "Câmera tampada" },
  tudo_caiu: { gravidade: "critica", nome: "Tudo caiu junto" },
  ponte_fora: { gravidade: "critica", nome: "Ponte sem contato" },
  atraso_envio: { gravidade: "media", nome: "Atraso no envio" },
  disco_dvr: { gravidade: "alta", nome: "HD do DVR com falha" },
  sem_gravacao: { gravidade: "alta", nome: "Câmera sem gravar" },
  acima_da_faixa: { gravidade: "baixa", nome: "Bitrate acima da faixa contratada" },
  cadeia_quebrada: { gravidade: "critica", nome: "Integridade: cadeia quebrada" },
};

export function criarNegocio({ repo, cofre, cfg, agora, armazenamento, fetchFn = fetch }) {
  const pendentes = new Set();
  const emSegundoPlano = (p) => {
    const q = Promise.resolve(p).catch((e) => console.error("[segundo plano]", e.message)).finally(() => pendentes.delete(q));
    pendentes.add(q);
  };

  /* ================= plataforma, contas e chaves ================= */
  /** KEK da plataforma (segredos sem conta: 2FA dos usuários). Criada na primeira subida; confere a chave-mestra. */
  function prepararPlataforma() {
    const id = repo.plataforma("mestra_id");
    if (id && id !== cofre.id) throw new Error("GUARDIAO_MASTER_KEY não é a chave-mestra deste banco. Confira a variável (ou rode scripts/trocar-chave-mestra.js se a troca foi intencional).");
    if (!id) repo.definirPlataforma("mestra_id", cofre.id);
    if (!repo.plataforma("kek_plataforma")) repo.definirPlataforma("kek_plataforma", cofre.novaKek(KEK_PLATAFORMA));
  }
  const cifrarDaPlataforma = (texto, rotulo) => cofre.cifrarSegredo(KEK_PLATAFORMA, repo.plataforma("kek_plataforma"), texto, rotulo);
  const decifrarDaPlataforma = (guardado, rotulo) => cofre.decifrarSegredo(KEK_PLATAFORMA, repo.plataforma("kek_plataforma"), guardado, rotulo);

  function criarConta({ nome, cnpj = null, cidade = null, revenda_id = null }) {
    return repo.transacao(() => {
      const c = repo.inserir("contas", { nome, cnpj, cidade, revenda_id });
      return repo.atualizar("contas", c.id, { kek_embrulhada: cofre.novaKek(c.id) });
    });
  }
  const contaPublica = (c) => {
    if (!c) return null;
    const { kek_embrulhada, ...resto } = c;
    return { ...resto, chave_ativa: Boolean(kek_embrulhada), carencia_ate: c.bloqueada_em ? c.bloqueada_em + cfg.carenciaDias * DIA : null };
  };

  function criarCamera(conta, d) {
    return repo.transacao(() => {
      const cam = repo.inserir("cameras", { conta_id: conta.id, local_id: d.local_id, ponte_id: d.ponte_id ?? null, nome: d.nome, marca: d.marca ?? null, canal: d.canal ?? null, retencao_dias: d.retencao_dias, qualidade: d.qualidade ?? "padrao", modo: d.modo ?? "continuo", segundos_trecho: d.segundos_trecho ?? 30, formato: d.formato ?? "mp4", chave_publica: "-", cadeia_topo: GENESE });
      const par = cofre.novaChaveCamera(conta.id, conta.kek_embrulhada, cam.id);
      return repo.atualizar("cameras", cam.id, { chave_publica: par.publica, chave_privada_embrulhada: par.privadaEmbrulhada, rtsp_cripto: d.rtsp_url ? cofre.cifrarSegredo(conta.id, conta.kek_embrulhada, d.rtsp_url, `rtsp|${cam.id}`) : null });
    });
  }
  const rtspDe = (conta, cam) => {
    try {
      return cofre.decifrarSegredo(conta.id, conta.kek_embrulhada, cam.rtsp_cripto, `rtsp|${cam.id}`);
    } catch {
      return "";
    }
  };
  /** Câmera sem segredos (o RTSP tem senha: só aparece mascarado; chaves nunca saem) */
  function cameraPublica(cam, conta) {
    if (!cam) return null;
    const { rtsp_cripto, chave_privada_embrulhada, chave_publica, cadeia_topo, ...resto } = cam;
    const atraso = cam.ultimo_trecho_em ? Math.max(0, Math.round((agora() - cam.ultimo_trecho_em) / 1000)) : null;
    return { ...resto, rtsp_configurado: Boolean(rtsp_cripto), retencao_efetiva_dias: retencaoEfetiva(cam), atraso_s: atraso, faixa_medida: cam.bitrate_kbps ? faixaDoBitrate(cam.bitrate_kbps) : null, centavos_mes: conta ? precoCamera(cam, conta) : undefined };
  }

  /* ================= preços e faturamento ================= */
  function precoTabela(c, revendaId = null) {
    const linha = (rid) => repo.um("SELECT centavos_mes FROM precos WHERE COALESCE(revenda_id,'') = ? AND retencao_dias = ? AND qualidade = ? AND modo = ?", rid ?? "", c.retencao_dias, c.qualidade, c.modo);
    return (revendaId && linha(revendaId)?.centavos_mes) ?? linha(null)?.centavos_mes ?? 0;
  }
  /** Preço de venda da câmera ao cliente: tabela da revenda (se ela definiu) ou tabela Nexor */
  const precoCamera = (cam, conta) => precoTabela(cam, conta.revenda_id);

  /** Mensalidade estimada da conta: soma das câmeras ativas, desconto por volume (só venda direta) e mínimo por conta */
  function mensalidade(conta) {
    const cams = repo.lista("cameras", "WHERE conta_id = ? AND ativa = 1", conta.id);
    const bruto = cams.reduce((s, c) => s + precoCamera(c, conta), 0);
    const bps = conta.revenda_id ? 0 : descontoVolumeBps(cams.length);
    const liquido = comDesconto(bruto, bps);
    const minimo = conta.revenda_id || !cams.length ? 0 : COMERCIAL.minimo_conta_centavos;
    return { cameras: cams.length, bruto_centavos: bruto, desconto_volume_bps: bps, mensal_centavos: Math.max(liquido, minimo), minimo_aplicado: liquido < minimo, tabela_nexor_centavos: cams.reduce((s, c) => s + precoTabela(c), 0) };
  }
  /** Quanto a revenda paga à Nexor: tabela Nexor com o desconto da faixa dela (ou o negociado), com mínimo mensal */
  function custoRevenda(revenda) {
    const contas = repo.lista("contas", "WHERE revenda_id = ? AND status != 'encerrada'", revenda.id);
    let cameras = 0;
    let tabela = 0;
    let venda = 0;
    for (const c of contas) {
      const m = mensalidade(c);
      cameras += m.cameras;
      tabela += m.tabela_nexor_centavos;
      venda += m.mensal_centavos;
    }
    const bps = revenda.desconto_bps ?? descontoRevendaBps(cameras);
    const custo = comDesconto(tabela, bps);
    const devido = cameras ? Math.max(custo, COMERCIAL.minimo_revenda_centavos) : 0;
    return { contas: contas.length, cameras, tabela_nexor_centavos: tabela, desconto_bps: bps, devido_nexor_centavos: devido, minimo_aplicado: cameras > 0 && custo < COMERCIAL.minimo_revenda_centavos, venda_centavos: venda, margem_centavos: venda - devido };
  }

  /* ================= auditoria ================= */
  const auditar = (conta, ator, acao, detalhe = null, ip = null) => repo.auditar({ conta_id: conta?.id ?? null, revenda_id: conta?.revenda_id ?? ator?.revenda_id ?? null, ator, acao, detalhe, ip });

  /* ================= alertas ================= */
  function notificar(conta, texto) {
    const gestores = repo.lista("usuarios", "WHERE conta_id = ? AND perfil = 'gestor' AND ativo = 1", conta.id);
    const destinos = [...gestores.map((g) => ({ canal: "email", para: g.email })), ...gestores.filter((g) => g.telefone).map((g) => ({ canal: "whatsapp", para: g.telefone }))];
    if (!cfg.alertas.webhookUrl || !destinos.length) return "sem_canal";
    for (const d of destinos)
      emSegundoPlano(
        fetchFn(cfg.alertas.webhookUrl, { method: "POST", headers: { "content-type": "application/json", ...(cfg.alertas.webhookToken ? { authorization: `Bearer ${cfg.alertas.webhookToken}` } : {}) }, body: JSON.stringify({ ...d, conta: conta.nome, texto }), signal: AbortSignal.timeout(10_000) }).then((r) => {
          if (!r.ok) throw new Error(`webhook de alertas respondeu ${r.status}`);
        }),
      );
    return "enviado";
  }
  /** Abre o alerta se ainda não há um aberto igual (mesmo tipo e alvo). Devolve o alerta aberto. */
  function abrirAlerta(conta, tipo, alvo, mensagem, extra = {}) {
    const aberto = repo.um("SELECT * FROM alertas WHERE tipo = ? AND alvo = ? AND resolvido_em IS NULL", tipo, alvo);
    if (aberto) return aberto;
    const a = repo.inserir("alertas", { conta_id: conta.id, tipo, alvo, gravidade: TIPOS_ALERTA[tipo].gravidade, mensagem, aberto_em: agora(), ...extra });
    return repo.atualizar("alertas", a.id, { notificado: notificar(conta, `Nexor Guardião · ${TIPOS_ALERTA[tipo].nome}: ${mensagem}`) });
  }
  const resolverAlerta = (tipo, alvo) => repo.rodar("UPDATE alertas SET resolvido_em = ? WHERE tipo = ? AND alvo = ? AND resolvido_em IS NULL", agora(), tipo, alvo).changes > 0;

  /* ================= ingestão ================= */
  const chaveArquivo = (cam, inicio) => `contas/${cam.conta_id}/${cam.id}/${hojeBR(inicio)}/${inicio}.nxg`;
  const retencaoEfetiva = (cam) => (cam.reducao_efetiva_em && agora() < cam.reducao_efetiva_em ? Math.max(cam.retencao_dias, cam.retencao_anterior_dias ?? 0) : cam.retencao_dias);

  /** A conta ainda pode receber imagens? Encerrada: nunca. Bloqueada: só durante a carência. */
  function conferirContaRecebe(conta) {
    if (!conta || conta.status === "encerrada" || !conta.kek_embrulhada) falha(410, "Esta conta foi encerrada. A ponte pode ser desinstalada.", { codigo: "conta_encerrada" });
    if (conta.status === "bloqueada" && agora() > conta.bloqueada_em + cfg.carenciaDias * DIA) falha(402, "Conta bloqueada por falta de pagamento e fora do prazo de carência: o envio está suspenso.", { codigo: "inadimplente" });
  }

  /**
   * Confere os metadados de um trecho ANTES de aceitar qualquer byte. A ponte só grava nas câmeras ligadas a ela
   * (logo, só na própria conta). Devolve { conta, camera, existente } (existente = mesmo trecho já recebido: idempotência).
   */
  function conferirEnvio(ponte, m) {
    const conta = repo.obter("contas", ponte.conta_id);
    conferirContaRecebe(conta);
    const camera = repo.obter("cameras", m.camera_id);
    // Mesma resposta para câmera inexistente e câmera de outra ponte/conta: não revela o que existe
    if (!camera || camera.ponte_id !== ponte.id || camera.conta_id !== ponte.conta_id) falha(403, "Esta câmera não está ligada a esta ponte.", { codigo: "camera_alheia" });
    if (!camera.ativa) falha(409, "Esta câmera está desativada no painel.", { codigo: "camera_inativa" });
    const dur = (m.fim - m.inicio) / 1000;
    if (dur < cfg.trecho.minSegundos || dur > cfg.trecho.maxSegundos) falha(400, `O trecho precisa ter de ${cfg.trecho.minSegundos} a ${cfg.trecho.maxSegundos} segundos.`);
    if (m.fim > agora() + cfg.trecho.folgaFuturoMs) falha(400, "O horário do trecho está no futuro. Confira o relógio do computador da ponte.", { codigo: "relogio" });
    if (m.fim < agora() - retencaoEfetiva(camera) * DIA) falha(409, "Trecho mais antigo que o prazo de gravação do plano: descartado.", { codigo: "fora_da_retencao" });
    if (m.tamanho > cfg.trecho.maxBytes) falha(413, "Trecho grande demais.");
    if (m.tamanho !== tamanhoCifrado(m.tamanho_claro)) falha(400, "Tamanho do trecho inconsistente com o formato cifrado.");
    const kbps = Math.round((m.tamanho_claro * 8) / dur / 1000);
    if (kbps > BITRATE_MAXIMO_KBPS) falha(422, `Bitrate de ${kbps} kbps acima do máximo aceito (${BITRATE_MAXIMO_KBPS} kbps). Reduza a qualidade no DVR (H.265 ou subfluxo) ou fale com a Nexor.`, { codigo: "bitrate" });
    const existente = repo.um("SELECT * FROM trechos WHERE camera_id = ? AND inicio = ?", camera.id, m.inicio);
    if (existente && existente.sha256 !== m.sha256) falha(409, "Já existe um trecho diferente desta câmera com o mesmo início. O original foi mantido.", { codigo: "trecho_divergente" });
    return { conta, camera, existente, kbps };
  }

  /** Confere o arquivo já gravado (cabeçalho, tamanho e DEK selada para ESTA câmera) e o encadeia. Apaga o arquivo se algo falhar. */
  async function registrarTrecho({ conta, camera, m, chave, kbps }) {
    try {
      const cab = await juntar(await armazenamento.ler(chave, { inicio: 0, fim: CABECALHO - 1 }));
      const { bloco } = lerCabecalho(cab);
      if (tamanhoCifrado(m.tamanho_claro, bloco) !== m.tamanho) throw new Error("tamanho inconsistente");
      cofre.abrirDekTrecho(conta, camera, { dek_selada: m.dek_selada, inicio: m.inicio });
    } catch {
      await armazenamento.apagar(chave).catch(() => {});
      falha(422, "Trecho recusado: o arquivo não está no formato cifrado do Guardião ou a chave não é a desta câmera.", { codigo: "formato" });
    }
    const t = repo.transacao(() => {
      const repetido = repo.um("SELECT * FROM trechos WHERE camera_id = ? AND inicio = ?", camera.id, m.inicio);
      if (repetido) return { ...repetido, duplicado: true };
      const cam = repo.obter("cameras", camera.id);
      const linha = { conta_id: conta.id, camera_id: cam.id, seq: cam.cadeia_seq + 1, inicio: m.inicio, fim: m.fim, tamanho: m.tamanho, tamanho_claro: m.tamanho_claro, sha256: m.sha256, hash_anterior: cam.cadeia_topo ?? GENESE, dek_selada: m.dek_selada, tem_movimento: Boolean(m.tem_movimento), formato: m.formato ?? cam.formato, inicio_midia: m.inicio_midia ?? 0, chave_arquivo: chave, recebido_em: agora() };
      linha.hash_cadeia = hashTrecho(linha);
      const novo = repo.inserir("trechos", linha);
      // Média móvel do bitrate (a ponte mede; o servidor confere a faixa contratada)
      const media = cam.bitrate_kbps ? Math.round(cam.bitrate_kbps * 0.9 + kbps * 0.1) : kbps;
      repo.rodar("UPDATE cameras SET cadeia_seq = ?, cadeia_topo = ?, ultimo_trecho_em = MAX(COALESCE(ultimo_trecho_em, 0), ?), bitrate_kbps = ? WHERE id = ?", linha.seq, linha.hash_cadeia, m.fim, media, cam.id);
      repo.rodar("INSERT INTO consumo (conta_id, camera_id, dia, trechos, bytes, segundos) VALUES (?,?,?,1,?,?) ON CONFLICT(camera_id, dia) DO UPDATE SET trechos = trechos + 1, bytes = bytes + excluded.bytes, segundos = segundos + excluded.segundos", conta.id, cam.id, hojeBR(m.inicio), m.tamanho, Math.round((m.fim - m.inicio) / 1000));
      return { ...novo, media };
    });
    if (!t.duplicado) {
      resolverAlerta("sem_gravacao", camera.id);
      if (acimaDaFaixa(t.media, camera.qualidade)) abrirAlerta(conta, "acima_da_faixa", camera.id, `${camera.nome} está enviando ${t.media} kbps, acima da faixa ${camera.qualidade} (até ${FAIXAS_KBPS[camera.qualidade]} kbps). Ajuste o DVR (H.265 ou subfluxo) ou a câmera passa para a faixa "${faixaDoBitrate(t.media)}" na próxima fatura.`, { camera_id: camera.id, local_id: camera.local_id, detalhe: { kbps: t.media, faixa_medida: faixaDoBitrate(t.media) } });
      else resolverAlerta("acima_da_faixa", camera.id);
    }
    return { id: t.id, seq: t.seq, hash_cadeia: t.hash_cadeia, duplicado: Boolean(t.duplicado) };
  }

  /** Envio pelo servidor (driver de disco e demonstração): grava em fluxo conferindo o SHA-256 e encadeia */
  async function receberTrecho(ponte, m, fluxo) {
    const { conta, camera, existente, kbps } = conferirEnvio(ponte, m);
    if (existente) {
      fluxo.resume?.();
      return { id: existente.id, seq: existente.seq, hash_cadeia: existente.hash_cadeia, duplicado: true };
    }
    const chave = chaveArquivo(camera, m.inicio);
    const r = await armazenamento.gravar(chave, fluxo, { tamanho: m.tamanho, sha256: m.sha256 });
    if (r.tamanho !== m.tamanho) {
      await armazenamento.apagar(chave).catch(() => {});
      falha(422, "O arquivo recebido não tem o tamanho informado.", { codigo: "tamanho_divergente" });
    }
    return registrarTrecho({ conta, camera, m, chave, kbps });
  }

  /** Envio direto (driver S3): etapa 1. Devolve a URL pré-assinada; o vídeo não passa pelo servidor da aplicação. */
  function iniciarEnvio(ponte, m) {
    const { camera, existente } = conferirEnvio(ponte, m);
    if (existente) return { duplicado: true, id: existente.id };
    if (!armazenamento.urlDeEnvio) return { direto: false, enviar_para: "/api/ponte/trechos" };
    const chave = chaveArquivo(camera, m.inicio);
    const assinada = armazenamento.urlDeEnvio(chave, { tamanho: m.tamanho, sha256: m.sha256, validadeS: 300 });
    repo.rodar("DELETE FROM envios_pendentes WHERE camera_id = ? AND inicio = ?", camera.id, m.inicio);
    const e = repo.inserir("envios_pendentes", { ponte_id: ponte.id, camera_id: camera.id, inicio: m.inicio, dados: m, chave_arquivo: chave, expira_em: assinada.expira_em + 10 * 60_000 });
    return { direto: true, envio_id: e.id, metodo: "PUT", url: assinada.url, cabecalhos: assinada.cabecalhos, expira_em: assinada.expira_em };
  }
  /** Envio direto: etapa 2. Confere que o objeto existe com o tamanho certo (HEAD) antes de encadear. */
  async function concluirEnvio(ponte, envioId) {
    const e = repo.obter("envios_pendentes", envioId);
    if (!e || e.ponte_id !== ponte.id) falha(404, "Envio não encontrado ou expirado. Inicie de novo.", { codigo: "envio_desconhecido" });
    const m = e.dados;
    const { conta, camera, existente, kbps } = conferirEnvio(ponte, m);
    if (existente) return (repo.remover("envios_pendentes", e.id), { id: existente.id, seq: existente.seq, hash_cadeia: existente.hash_cadeia, duplicado: true });
    const tamanho = await armazenamento.tamanho(e.chave_arquivo);
    if (tamanho === null) falha(409, "O arquivo ainda não chegou ao armazenamento. Envie pela URL recebida e confirme de novo.", { codigo: "arquivo_ausente" });
    if (tamanho !== m.tamanho) {
      await armazenamento.apagar(e.chave_arquivo).catch(() => {});
      repo.remover("envios_pendentes", e.id);
      falha(422, "O arquivo no armazenamento não tem o tamanho informado.", { codigo: "tamanho_divergente" });
    }
    const r = await registrarTrecho({ conta, camera, m, chave: e.chave_arquivo, kbps });
    repo.remover("envios_pendentes", e.id);
    return r;
  }

  /* ================= saúde ================= */
  function saude(ponte, d, ip = null) {
    const conta = repo.obter("contas", ponte.conta_id);
    repo.atualizar("pontes", ponte.id, { visto_em: agora(), versao: d.versao ?? ponte.versao, fila_atraso_s: d.fila_atraso_s ?? 0, fila_trechos: d.fila_trechos ?? 0, fila_bytes: d.fila_bytes ?? 0, ip });
    resolverAlerta("ponte_fora", ponte.id);
    if ((d.fila_atraso_s ?? 0) > cfg.saude.atrasoFilaS) abrirAlerta(conta, "atraso_envio", ponte.id, `A ponte "${ponte.nome}" está com ${Math.round(d.fila_atraso_s / 60)} min de gravação esperando para enviar (internet lenta ou instável).`, { ponte_id: ponte.id, local_id: ponte.local_id });
    else resolverAlerta("atraso_envio", ponte.id);
    const minhas = new Map(repo.lista("cameras", "WHERE ponte_id = ? AND ativa = 1", ponte.id).map((c) => [c.id, c]));
    const relatos = (d.cameras ?? []).filter((r) => minhas.has(r.camera_id));
    // "Tudo caiu junto": todas as câmeras da ponte (duas ou mais) sem sinal no mesmo relato
    const tudoCaiu = minhas.size >= 2 && relatos.length === minhas.size && relatos.every((r) => r.estado === "sem_sinal");
    if (tudoCaiu) abrirAlerta(conta, "tudo_caiu", ponte.id, `Todas as ${minhas.size} câmeras da ponte "${ponte.nome}" caíram ao mesmo tempo: provável queda de energia, DVR desligado ou cabo cortado.`, { ponte_id: ponte.id, local_id: ponte.local_id, detalhe: { cameras: minhas.size } });
    else if (relatos.some((r) => r.estado === "ok")) resolverAlerta("tudo_caiu", ponte.id);
    const porEstado = { sem_sinal: ["camera_sem_sinal", "está sem sinal"], preta: ["imagem_preta", "está com a imagem preta (lente coberta, infravermelho queimado ou câmera com defeito)"], tampada: ["imagem_tampada", "parece ter sido tampada ou virada (possível sabotagem)"] };
    for (const r of relatos) {
      const cam = minhas.get(r.camera_id);
      repo.atualizar("cameras", cam.id, { estado: r.estado, disco_dvr: r.disco_dvr ?? null, ...(cam.estado !== r.estado ? { estado_em: agora() } : {}) });
      for (const [estado, [tipo, frase]] of Object.entries(porEstado)) {
        if (r.estado === estado && !(tudoCaiu && estado === "sem_sinal")) abrirAlerta(conta, tipo, cam.id, `${cam.nome} ${frase}.`, { camera_id: cam.id, local_id: cam.local_id });
        else if (r.estado !== estado) resolverAlerta(tipo, cam.id);
      }
      if (r.disco_dvr === "falha") abrirAlerta(conta, "disco_dvr", cam.id, `O gravador de ${cam.nome} informou falha no HD. As imagens continuam seguras na nuvem; troque o HD do DVR.`, { camera_id: cam.id, local_id: cam.local_id });
      else resolverAlerta("disco_dvr", cam.id);
    }
    return { ok: true, cameras: relatos.length };
  }

  /** Rotina: pontes que pararam de dar notícia e câmeras de gravação contínua que pararam de gravar */
  function conferirSaude() {
    const limite = agora() - cfg.saude.ponteForaMin * 60_000;
    for (const p of repo.lista("pontes", "WHERE status = 'ativa' AND visto_em IS NOT NULL AND visto_em < ?", limite)) {
      const conta = repo.obter("contas", p.conta_id);
      if (conta.status === "encerrada") continue;
      const cams = repo.um("SELECT COUNT(*) n FROM cameras WHERE ponte_id = ? AND ativa = 1", p.id).n;
      abrirAlerta(conta, "ponte_fora", p.id, `A ponte "${p.nome}" está sem contato há mais de ${cfg.saude.ponteForaMin} min${cams ? ` (${cams} câmera(s) pararam de enviar)` : ""}: computador desligado, sem internet, queda de energia ou equipamento retirado do local.`, { ponte_id: p.id, local_id: p.local_id });
    }
    const parada = agora() - Math.max(10, cfg.saude.ponteForaMin * 2) * 60_000;
    for (const c of repo.todos("SELECT c.* FROM cameras c JOIN pontes p ON p.id = c.ponte_id WHERE c.ativa = 1 AND c.modo = 'continuo' AND c.estado = 'ok' AND p.status = 'ativa' AND p.visto_em >= ? AND c.ultimo_trecho_em IS NOT NULL AND c.ultimo_trecho_em < ?", limite, parada)) {
      const conta = repo.obter("contas", c.conta_id);
      if (conta.status !== "encerrada") abrirAlerta(conta, "sem_gravacao", c.id, `${c.nome} está com sinal, mas não chega gravação nova há ${Math.round((agora() - c.ultimo_trecho_em) / 60_000)} min.`, { camera_id: c.id, local_id: c.local_id });
    }
  }

  /* ================= acesso às imagens ================= */
  const suporteAtivo = (usuario, contaId) => repo.um("SELECT * FROM acessos_suporte WHERE conta_id = ? AND solicitante_id = ? AND status = 'aprovado' AND expira_em > ? ORDER BY expira_em DESC LIMIT 1", contaId, usuario.id, agora());

  /** O operador está dentro do horário permitido? (horario = { dias: [0..6], inicio: "08:00", fim: "18:00" }, horário de Brasília) */
  function dentroDoHorario(horario) {
    if (!horario) return true;
    const dia = diaSemana(hojeBR(agora()));
    const m = minutos(horaBR(agora()));
    return (horario.dias ?? [0, 1, 2, 3, 4, 5, 6]).includes(dia) && m >= minutos(horario.inicio ?? "00:00") && m <= minutos(horario.fim ?? "23:59");
  }
  /** Restrições de quem é da conta (gestor e operador): IPs e países permitidos e horário do operador. Lança 403. */
  function conferirRestricoes(usuario, conta, ip, pais = null) {
    if (!conta || !["gestor", "operador"].includes(usuario.perfil)) return;
    const c = conta.config ?? {};
    if (!ipPermitido(ip, c.ips_permitidos)) falha(403, "Acesso bloqueado: este endereço de internet não está na lista permitida pela empresa.", { codigo: "ip_bloqueado" });
    if (c.paises_permitidos?.length && cfg.proxies > 0 && pais && !c.paises_permitidos.includes(String(pais).toUpperCase())) falha(403, "Acesso bloqueado: a empresa só permite acesso de alguns países.", { codigo: "pais_bloqueado" });
    if (usuario.perfil === "operador" && !dentroDoHorario(usuario.horario)) falha(403, "Fora do seu horário de acesso. Fale com o gestor da conta.", { codigo: "fora_do_horario" });
  }

  /**
   * Portão único das imagens. Quem pode ver: gestor (todas as câmeras da conta), operador (só as liberadas),
   * Nexor e revenda SOMENTE com pedido de suporte aprovado e dentro da validade. Conta bloqueada não vê.
   */
  function conferirImagens(usuario, conta) {
    if (conta.status === "encerrada") falha(410, "Esta conta foi encerrada: as imagens foram apagadas.", { codigo: "conta_encerrada" });
    if (["nexor", "revenda"].includes(usuario.perfil) && !suporteAtivo(usuario, conta.id)) falha(403, "Você não tem autorização do cliente para ver imagens desta conta. Peça acesso de suporte e aguarde a aprovação do gestor.", { codigo: "suporte_nao_autorizado" });
    if (conta.status === "bloqueada") falha(403, "Visualização bloqueada por falta de pagamento. As gravações continuam guardadas durante o prazo de carência; regularize para voltar a ver.", { codigo: "inadimplente" });
  }
  /** Câmera da conta que este usuário pode ver. `acao`: "ao_vivo" | "gravacoes". 404 para o que não é dele (sem revelar que existe). */
  function cameraPermitida(usuario, conta, cameraId, acao = "gravacoes") {
    const cam = repo.obter("cameras", cameraId);
    if (!cam || cam.conta_id !== conta.id) falha(404, "Câmera não encontrada.");
    if (usuario.perfil === "operador") {
      const p = repo.um("SELECT * FROM permissoes WHERE usuario_id = ? AND camera_id = ?", usuario.id, cam.id);
      if (!p) falha(404, "Câmera não encontrada.");
      if (!p[acao]) falha(403, acao === "ao_vivo" ? "Seu acesso não inclui o ao vivo desta câmera." : "Seu acesso não inclui as gravações desta câmera.");
    }
    return cam;
  }
  const camerasVisiveis = (usuario, conta) => (usuario.perfil === "operador" ? repo.todos("SELECT c.* FROM cameras c JOIN permissoes p ON p.camera_id = c.id WHERE p.usuario_id = ? AND c.conta_id = ? ORDER BY c.nome", usuario.id, conta.id).map((c) => repo.ler("cameras", c)) : repo.lista("cameras", "WHERE conta_id = ? ORDER BY nome", conta.id));

  /** Fluxo claro de um trecho (decifrado bloco a bloco, com Range). Nada em claro é gravado em disco. */
  async function fluxoTrecho(conta, camera, trecho, faixa = {}) {
    if (trecho.status !== "guardado" || !trecho.dek_selada) falha(410, "Este trecho já foi apagado pelo prazo do plano.", { codigo: "trecho_expirado" });
    let dek;
    try {
      dek = cofre.abrirDekTrecho(conta, camera, trecho);
    } catch (e) {
      if (e.status) throw e;
      falha(500, "Não foi possível abrir a chave deste trecho (integridade comprometida).", { codigo: "integridade" });
    }
    return fluxoClaro({ armazenamento, chave: trecho.chave_arquivo, dek, aad: aadTrecho(camera.id, trecho.inicio), tamanhoClaro: trecho.tamanho_claro, ...faixa });
  }

  /**
   * Auditoria agregada: uma "sessão de visualização" por pessoa + câmera + tipo. O primeiro trecho abre a sessão e gera UM
   * registro na auditoria; os seguintes só somam. Parada por alguns minutos, a rotina fecha a sessão com o resumo.
   */
  function registrarVisualizacao({ conta, camera, ator, tipo, origem = null, trecho, bytes = 0, contar = true, ip = null }) {
    const ociosa = agora() - cfg.saude.visualizacaoOciosaMin * 60_000;
    const v = repo.um("SELECT * FROM visualizacoes WHERE ator_id = ? AND camera_id = ? AND tipo = ? AND encerrada_em IS NULL AND ultima_em >= ? AND COALESCE(origem,'') = ?", ator.id, camera.id, tipo, ociosa, origem ?? "");
    if (v) {
      repo.rodar("UPDATE visualizacoes SET de = MIN(de, ?), ate = MAX(ate, ?), trechos = trechos + ?, bytes = bytes + ?, ultima_em = ? WHERE id = ?", trecho.inicio, trecho.fim, contar ? 1 : 0, bytes, agora(), v.id);
      return v.id;
    }
    const nova = repo.inserir("visualizacoes", { conta_id: conta.id, camera_id: camera.id, ator_id: ator.id, ator_nome: ator.nome, ator_perfil: ator.perfil, tipo, origem, de: trecho.inicio, ate: trecho.fim, trechos: 1, bytes, ip, aberta_em: agora(), ultima_em: agora() });
    auditar(conta, ator, tipo === "ao_vivo" ? "viu_ao_vivo" : tipo === "link" ? "link_assistido" : "viu_gravacao", { visualizacao_id: nova.id, camera_id: camera.id, camera: camera.nome, a_partir_de: trecho.inicio, ...(origem ? { origem } : {}) }, ip);
    return nova.id;
  }
  function fecharVisualizacoes() {
    const ociosa = agora() - cfg.saude.visualizacaoOciosaMin * 60_000;
    for (const v of repo.lista("visualizacoes", "WHERE encerrada_em IS NULL AND ultima_em < ? LIMIT 500", ociosa)) {
      repo.rodar("UPDATE visualizacoes SET encerrada_em = ? WHERE id = ?", agora(), v.id);
      repo.auditar({ conta_id: v.conta_id, ator: { id: v.ator_id, nome: v.ator_nome, perfil: v.ator_perfil }, acao: "visualizacao_encerrada", detalhe: { visualizacao_id: v.id, camera_id: v.camera_id, tipo: v.tipo, de: v.de, ate: v.ate, trechos: v.trechos, bytes: v.bytes }, ip: v.ip });
    }
  }

  /* ================= retenção ================= */
  const SQL_PRESERVADO = "EXISTS (SELECT 1 FROM preservacoes p WHERE p.camera_id = t.camera_id AND p.liberado_em IS NULL AND p.inicio < t.fim AND p.fim > t.inicio)";
  /** Apaga de verdade um trecho: arquivo E chave. A linha fica (sem DEK) para a cadeia continuar conferível. */
  async function apagarTrecho(t, motivo) {
    await armazenamento.apagar(t.chave_arquivo);
    repo.rodar("UPDATE trechos SET status = 'expirado', dek_selada = NULL, expirado_em = ?, motivo_expiracao = ? WHERE id = ?", agora(), motivo, t.id);
  }
  /** Expiração por retenção: cada câmera no seu plano; trechos preservados ficam até a liberação */
  async function expirar({ lote = 2000 } = {}) {
    let apagados = 0;
    for (const cam of repo.lista("cameras")) {
      const corte = agora() - retencaoEfetiva(cam) * DIA;
      for (const t of repo.todos(`SELECT t.* FROM trechos t WHERE t.camera_id = ? AND t.status = 'guardado' AND t.fim < ? AND NOT ${SQL_PRESERVADO} ORDER BY t.inicio LIMIT ?`, cam.id, corte, lote)) {
        await apagarTrecho(t, "retencao");
        apagados++;
      }
      if (cam.reducao_efetiva_em && agora() >= cam.reducao_efetiva_em) repo.rodar("UPDATE cameras SET retencao_anterior_dias = NULL, reducao_efetiva_em = NULL WHERE id = ?", cam.id);
    }
    repo.rodar("DELETE FROM envios_pendentes WHERE expira_em < ?", agora());
    repo.rodar("DELETE FROM sessoes_link WHERE expira_em < ?", agora());
    return apagados;
  }
  /** O que seria apagado se a câmera passasse para `dias` de retenção agora (para o aviso antes de confirmar a redução) */
  function excedente(cam, dias) {
    const r = repo.um(`SELECT COUNT(*) n, COALESCE(SUM(t.tamanho),0) bytes, MIN(t.inicio) mais_antigo FROM trechos t WHERE t.camera_id = ? AND t.status = 'guardado' AND t.fim < ? AND NOT ${SQL_PRESERVADO}`, cam.id, agora() - dias * DIA);
    return { trechos: r.n, bytes: r.bytes, mais_antigo: r.mais_antigo };
  }

  /* ================= verificação da cadeia ================= */
  /** Confere a cadeia de uma câmera. `profunda`: também recalcula o SHA-256 dos arquivos guardados (até `amostra` mais recentes; 0 = todos). */
  async function verificarCadeia(cam, { profunda = false, amostra = 0 } = {}) {
    const linhas = repo.todos("SELECT * FROM trechos WHERE camera_id = ? ORDER BY seq", cam.id);
    const r = conferirCadeia(linhas, repo.obter("cameras", cam.id));
    if (profunda) {
      let guardados = linhas.filter((t) => t.status === "guardado");
      if (amostra) guardados = guardados.slice(-amostra);
      for (const t of guardados) {
        const tam = await armazenamento.tamanho(t.chave_arquivo);
        if (tam === null) r.problemas.push({ seq: t.seq, tipo: "arquivo_ausente" });
        else if (tam !== t.tamanho || (await armazenamento.sha256(t.chave_arquivo)) !== t.sha256) r.problemas.push({ seq: t.seq, tipo: "arquivo_alterado" });
        if (r.problemas.length >= 50) break;
      }
      r.arquivos_conferidos = guardados.length;
      r.integra = r.problemas.length === 0;
    }
    repo.rodar("UPDATE cameras SET cadeia_verificada_em = ?, cadeia_integra = ? WHERE id = ?", agora(), r.integra ? 1 : 0, cam.id);
    return r;
  }
  async function verificarCadeias(opcoes = {}) {
    const resumo = { cameras: 0, quebradas: 0 };
    for (const cam of repo.lista("cameras")) {
      const conta = repo.obter("contas", cam.conta_id);
      if (conta.status === "encerrada") continue;
      const r = await verificarCadeia(cam, opcoes);
      resumo.cameras++;
      if (!r.integra) {
        resumo.quebradas++;
        const jaAberto = repo.um("SELECT 1 FROM alertas WHERE tipo = 'cadeia_quebrada' AND alvo = ? AND resolvido_em IS NULL", cam.id);
        abrirAlerta(conta, "cadeia_quebrada", cam.id, `A conferência de integridade de ${cam.nome} falhou (${r.problemas.length} problema(s)). A Nexor foi avisada; não confie nesse intervalo como prova até a apuração.`, { camera_id: cam.id, local_id: cam.local_id, detalhe: { problemas: r.problemas.slice(0, 10) } });
        if (!jaAberto) repo.auditar({ conta_id: conta.id, acao: "cadeia_quebrada", detalhe: { camera_id: cam.id, problemas: r.problemas.slice(0, 10) } });
      }
    }
    repo.definirPlataforma("cadeia_verificada_em", String(agora()));
    return resumo;
  }
  const verificarAuditoria = (cadeia) => conferirAuditoria(repo.lista("auditoria", "WHERE cadeia = ? ORDER BY id", cadeia));

  /* ================= inadimplência e encerramento ================= */
  function bloquearConta(conta, ator, motivo, ip) {
    if (conta.status !== "ativa") falha(409, conta.status === "bloqueada" ? "Esta conta já está bloqueada." : "Esta conta foi encerrada.");
    const c = repo.atualizar("contas", conta.id, { status: "bloqueada", bloqueada_em: agora(), bloqueio_motivo: motivo ?? "inadimplência" });
    auditar(c, ator, "conta_bloqueada", { motivo: c.bloqueio_motivo, carencia_ate: c.bloqueada_em + cfg.carenciaDias * DIA }, ip);
    notificar(c, `Nexor Guardião: a visualização das imagens de ${c.nome} foi bloqueada por falta de pagamento. As gravações continuam guardadas por ${cfg.carenciaDias} dias. Regularize para voltar a ver.`);
    return c;
  }
  function desbloquearConta(conta, ator, ip) {
    if (conta.status !== "bloqueada") falha(409, "Esta conta não está bloqueada.");
    const c = repo.atualizar("contas", conta.id, { status: "ativa", bloqueada_em: null, bloqueio_motivo: null });
    auditar(c, ator, "conta_desbloqueada", null, ip);
    return c;
  }
  /**
   * Encerramento: destrói a KEK da conta (apagamento criptográfico). Sem a KEK não se abre a chave de nenhuma câmera,
   * logo nenhuma DEK, logo nenhum trecho, nem os que ainda existam em backup. Os arquivos são removidos em seguida.
   * Conta bloqueada por inadimplência só pode ser encerrada depois da carência (salvo pedido do próprio cliente).
   */
  async function encerrarConta(conta, ator, { motivo, pedidoDoCliente = false } = {}, ip = null) {
    if (conta.status === "encerrada") falha(409, "Esta conta já foi encerrada.");
    if (conta.status === "bloqueada" && !pedidoDoCliente && agora() < conta.bloqueada_em + cfg.carenciaDias * DIA) falha(409, `Conta em carência até ${hojeBR(conta.bloqueada_em + cfg.carenciaDias * DIA)}: nada pode ser apagado antes disso, salvo pedido do próprio cliente.`, { codigo: "em_carencia" });
    const arquivos = repo.todos("SELECT chave_arquivo FROM trechos WHERE conta_id = ? AND status = 'guardado'", conta.id).map((t) => t.chave_arquivo).concat(repo.todos("SELECT chave_arquivo FROM exportacoes WHERE conta_id = ? AND chave_arquivo IS NOT NULL", conta.id).map((t) => t.chave_arquivo));
    repo.transacao(() => {
      repo.rodar("UPDATE contas SET status = 'encerrada', encerrada_em = ?, kek_embrulhada = NULL, atualizado_em = ? WHERE id = ?", agora(), agora(), conta.id);
      repo.rodar("UPDATE cameras SET chave_privada_embrulhada = NULL, rtsp_cripto = NULL, ativa = 0 WHERE conta_id = ?", conta.id);
      repo.rodar("UPDATE trechos SET status = 'expirado', dek_selada = NULL, expirado_em = ?, motivo_expiracao = 'conta_encerrada' WHERE conta_id = ? AND status = 'guardado'", agora(), conta.id);
      repo.rodar("UPDATE exportacoes SET dek_embrulhada = NULL, chave_arquivo = NULL WHERE conta_id = ?", conta.id);
      repo.rodar("UPDATE pontes SET status = 'revogada', revogada_em = ?, credencial_hash = NULL WHERE conta_id = ?", agora(), conta.id);
      repo.rodar("UPDATE compartilhamentos SET revogado_em = COALESCE(revogado_em, ?) WHERE conta_id = ?", agora(), conta.id);
      repo.rodar("DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE conta_id = ?)", conta.id);
    });
    auditar({ ...conta }, ator, "conta_encerrada", { motivo: motivo ?? null, arquivos: arquivos.length, apagamento: "KEK destruída" }, ip);
    for (const chave of arquivos) await armazenamento.apagar(chave).catch(() => {});
    return repo.obter("contas", conta.id);
  }

  /* ================= consumo e relatório mensal ================= */
  function consumoDaConta(conta) {
    const porCamera = repo.todos("SELECT c.id camera_id, c.nome, c.retencao_dias, c.qualidade, c.modo, c.bitrate_kbps, COALESCE(SUM(CASE WHEN t.status = 'guardado' THEN t.tamanho END),0) bytes_guardados, COUNT(CASE WHEN t.status = 'guardado' THEN 1 END) trechos_guardados FROM cameras c LEFT JOIN trechos t ON t.camera_id = c.id WHERE c.conta_id = ? GROUP BY c.id ORDER BY c.nome", conta.id);
    const desde = hojeBR(agora() - 30 * DIA);
    const banda = repo.todos("SELECT dia, SUM(bytes) bytes_enviados, SUM(bytes_vistos) bytes_vistos, SUM(segundos) segundos FROM consumo WHERE conta_id = ? AND dia >= ? GROUP BY dia ORDER BY dia", conta.id, desde);
    return { armazenamento_bytes: porCamera.reduce((s, c) => s + c.bytes_guardados, 0), cameras: porCamera, ultimos_30_dias: banda, mensalidade: mensalidade(conta) };
  }
  /** Relatório mensal ao gestor: horas gravadas, falhas, acessos, exportações */
  function relatorioMensal(conta, mes) {
    const de = paraMs(`${mes}-01`);
    const [a, m] = mes.split("-").map(Number);
    const ate = paraMs(`${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`);
    const n = (sql, ...p) => repo.um(sql, ...p).n;
    const cameras = repo.todos("SELECT c.id, c.nome, COALESCE(SUM(k.segundos),0) segundos, COALESCE(SUM(k.bytes),0) bytes FROM cameras c LEFT JOIN consumo k ON k.camera_id = c.id AND k.dia >= ? AND k.dia < ? WHERE c.conta_id = ? GROUP BY c.id ORDER BY c.nome", `${mes}-01`, hojeBR(ate), conta.id).map((c) => ({ camera_id: c.id, nome: c.nome, horas_gravadas: Math.round(c.segundos / 360) / 10, bytes: c.bytes }));
    return {
      conta: conta.nome, mes,
      horas_gravadas: Math.round(cameras.reduce((s, c) => s + c.horas_gravadas, 0) * 10) / 10,
      cameras,
      falhas: Object.fromEntries(repo.todos("SELECT tipo, COUNT(*) n FROM alertas WHERE conta_id = ? AND aberto_em >= ? AND aberto_em < ? GROUP BY tipo", conta.id, de, ate).map((x) => [x.tipo, x.n])),
      acessos: {
        sessoes_de_visualizacao: n("SELECT COUNT(*) n FROM visualizacoes WHERE conta_id = ? AND aberta_em >= ? AND aberta_em < ?", conta.id, de, ate),
        por_pessoa: repo.todos("SELECT ator_nome nome, ator_perfil perfil, COUNT(*) sessoes FROM visualizacoes WHERE conta_id = ? AND aberta_em >= ? AND aberta_em < ? GROUP BY ator_id ORDER BY sessoes DESC LIMIT 50", conta.id, de, ate),
        logins: n("SELECT COUNT(*) n FROM auditoria WHERE conta_id = ? AND acao = 'login' AND criado_em >= ? AND criado_em < ?", conta.id, de, ate),
        suporte_aprovado: n("SELECT COUNT(*) n FROM acessos_suporte WHERE conta_id = ? AND status IN ('aprovado','revogado') AND decidido_em >= ? AND decidido_em < ?", conta.id, de, ate),
      },
      exportacoes: n("SELECT COUNT(*) n FROM exportacoes WHERE conta_id = ? AND criado_em >= ? AND criado_em < ?", conta.id, de, ate),
      laudos: n("SELECT COUNT(*) n FROM laudos WHERE conta_id = ? AND criado_em >= ? AND criado_em < ?", conta.id, de, ate),
      compartilhamentos: n("SELECT COUNT(*) n FROM compartilhamentos WHERE conta_id = ? AND criado_em >= ? AND criado_em < ?", conta.id, de, ate),
      preservacoes_ativas: n("SELECT COUNT(*) n FROM preservacoes WHERE conta_id = ? AND liberado_em IS NULL", conta.id),
    };
  }
  /** No começo do mês, guarda o relatório do mês anterior e avisa o gestor (uma vez por conta e mês) */
  function fecharRelatorios() {
    const hoje = hojeBR(agora());
    const [a, m] = hoje.split("-").map(Number);
    const anterior = `${m === 1 ? a - 1 : a}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
    for (const conta of repo.lista("contas", "WHERE status != 'encerrada' AND criado_em < ?", paraMs(`${hoje.slice(0, 7)}-01`))) {
      if (repo.um("SELECT 1 FROM relatorios WHERE conta_id = ? AND mes = ?", conta.id, anterior)) continue;
      const dados = relatorioMensal(conta, anterior);
      repo.inserir("relatorios", { conta_id: conta.id, mes: anterior, dados });
      notificar(conta, `Nexor Guardião · relatório de ${anterior} de ${conta.nome}: ${dados.horas_gravadas} h gravadas, ${Object.values(dados.falhas).reduce((s, x) => s + x, 0)} alerta(s), ${dados.acessos.sessoes_de_visualizacao} acesso(s) às imagens, ${dados.exportacoes} exportação(ões). Veja no painel.`);
    }
  }

  /* ================= rotina ================= */
  let rodando = false;
  async function rotina() {
    if (rodando) return;
    rodando = true;
    try {
      conferirSaude();
      fecharVisualizacoes();
      await expirar();
      repo.rodar("UPDATE acessos_suporte SET status = 'negado', decidido_em = ?, decidido_por_nome = 'expirou sem resposta' WHERE status = 'pendente' AND criado_em < ?", agora(), agora() - 7 * DIA);
      fecharRelatorios();
      const ultima = Number(repo.plataforma("cadeia_verificada_em") ?? 0);
      if (agora() - ultima >= cfg.cadeiaHoras * 3600_000) await verificarCadeias({ profunda: true, amostra: 200 });
    } finally {
      rodando = false;
    }
  }

  return {
    prepararPlataforma, cifrarDaPlataforma, decifrarDaPlataforma, criarConta, contaPublica, criarCamera, cameraPublica, rtspDe,
    precoTabela, precoCamera, mensalidade, custoRevenda, auditar, notificar, abrirAlerta, resolverAlerta,
    conferirEnvio, receberTrecho, iniciarEnvio, concluirEnvio, saude, conferirSaude,
    suporteAtivo, dentroDoHorario, conferirRestricoes, conferirImagens, cameraPermitida, camerasVisiveis, fluxoTrecho, registrarVisualizacao, fecharVisualizacoes,
    retencaoEfetiva, expirar, excedente, apagarTrecho, verificarCadeia, verificarCadeias, verificarAuditoria,
    bloquearConta, desbloquearConta, encerrarConta, consumoDaConta, relatorioMensal, fecharRelatorios, rotina,
    mime: (formato) => MIME[formato] ?? "application/octet-stream",
    ocioso: () => Promise.all([...pendentes]),
    SQL_PRESERVADO,
  };
}
