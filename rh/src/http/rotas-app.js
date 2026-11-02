/* Aplicativo do trabalhador (PWA): ativação por CPF + código, biometria do celular (WebAuthn), registro de ponto
   com QR Code e GPS, comprovante, espelho com assinatura, solicitações (ajuste, férias, atestado), holerites,
   comunicados e documentos. */

import { z } from "zod";
import { gerarHashSenha, sha256 } from "../seguranca.js";
import { conferirCadastro, conferirConfirmacao, criarDesafios, opcoesCadastro, opcoesConfirmacao } from "../ponto/biometria.js";
import { dataLocal, horaLocal, instante, somarDias } from "../ponto/calendario.js";
import { conferirGps, conferirQr } from "../ponto/presenca.js";
import { comprovante, ErroMarcacao, registrarMarcacao } from "../ponto/registro.js";
import { periodosFerias } from "../folha/calculo.js";
import { competencia, cpf, data, horario, op, t, validar } from "./validacao.js";
import { enviarArquivo } from "./rotas-cadastros.js";
import { falha, lerCorpo } from "./roteador.js";
import { COOKIE_APP } from "./validacao.js";

const APP = { app: true };

export function rotasApp({ r, repo, nucleo, cfg, agora, limitar, iniciarSessao, auditar, aviso, base }) {
  const desafios = criarDesafios();
  const rp = (req) => {
    const u = new URL(base(req));
    return { rpId: u.hostname, origens: [u.origin] };
  };
  const credenciaisDe = (id) => repo.todos("SELECT * FROM credenciais WHERE colaborador_id = ?", id);
  const ctxApp = (ctx) => ({ ...ctx, usuario: null });

  /* ---------- Ativação ---------- */

  r.post("/api/app/ativar", { publico: true }, async ({ corpo, res, ip }) => {
    const d = validar(z.object({ cpf, codigo: z.string().regex(/^\d{6}$/, "O código tem 6 números.") }), await corpo());
    limitar(`ativar:${ip}`, 20);
    limitar(`ativar:${d.cpf}`, 6);
    const candidatos = repo.todos("SELECT * FROM colaboradores WHERE cpf = ? AND status != 'desligado'", d.cpf);
    const c = candidatos.find((x) => repo.um("SELECT 1 FROM convites_app WHERE codigo_hash = ? AND expira_em > ?", sha256(`${x.id}:${d.codigo}`), agora()));
    if (!c) falha(401, "CPF ou código incorretos (ou o código venceu). Peça um novo código ao RH.");
    repo.rodar("DELETE FROM convites_app WHERE colaborador_id = ?", c.id);
    iniciarSessao(res, { colaborador_id: c.id });
    repo.auditar(c.empresa_id, c.nome, "app_ativado", { ip });
    return { ok: true };
  });

  r.post("/api/app/sair", APP, ({ cookies, res }) => {
    if (cookies[COOKIE_APP]) repo.encerrarSessao(sha256(cookies[COOKIE_APP]));
    res.setHeader("Set-Cookie", `${COOKIE_APP}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  function estadoHoje(c) {
    const hoje = dataLocal(agora());
    const ms = repo.marcacoesEntre(c.id, instante(hoje) - 6 * 3600_000, instante(somarDias(hoje, 1))).filter((m) => m.status === "valida" && (dataLocal(m.momento) === hoje || agora() - m.momento < 14 * 3600_000));
    const nomes = ["Entrada", "Saída para intervalo", "Volta do intervalo", "Saída"];
    return {
      marcacoes: ms.map((m, i) => ({ id: m.id, hora: horaLocal(m.momento), rotulo: nomes[i] ?? (i % 2 ? "Saída" : "Entrada"), biometria: Boolean(m.biometria), qr: Boolean(m.qr), nsr: m.nsr })),
      proxima: nomes[ms.length] ?? (ms.length % 2 ? "Saída" : "Entrada"),
    };
  }

  r.get("/api/app/eu", APP, ({ colaborador: c, empresa }) => {
    const cargo = c.cargo_id ? repo.obter("cargos", empresa.id, c.cargo_id) : null;
    const estab = c.estabelecimento_id ? repo.obter("estabelecimentos", empresa.id, c.estabelecimento_id) : null;
    const jornada = c.jornada_id ? repo.obter("jornadas", empresa.id, c.jornada_id) : null;
    return {
      colaborador: { id: c.id, nome: c.nome, primeiro_nome: c.nome.split(" ")[0], matricula: c.matricula, cpf: c.cpf, cargo: cargo?.nome ?? null, admissao: c.admissao, status: c.status, tem_pin: Boolean(c.pin_hash), email: c.email, telefone: c.telefone },
      empresa: { nome: empresa.nome_fantasia || empresa.razao_social, razao_social: empresa.razao_social, cnpj: empresa.cnpj },
      local: estab ? { nome: estab.nome, exige_qr: estab.exige_qr, exige_gps: estab.exige_gps && estab.lat !== null } : null,
      jornada: jornada ? { nome: jornada.nome, banco_horas: jornada.banco_horas } : null,
      ponto: { exige_biometria: empresa.config.ponto.exige_biometria, biometrias: credenciaisDe(c.id).length },
      hoje: estadoHoje(c),
      saldo_banco: repo.saldoBanco(c.id),
      nao_lidos: repo.um("SELECT COUNT(*) n FROM comunicados m WHERE m.empresa_id = ? AND NOT EXISTS (SELECT 1 FROM comunicado_leituras l WHERE l.comunicado_id = m.id AND l.colaborador_id = ?)", empresa.id, c.id).n,
    };
  });

  r.put("/api/app/pin", APP, async ({ colaborador: c, corpo }) => {
    const d = validar(z.object({ pin: z.string().regex(/^\d{4,6}$/, "O PIN tem de 4 a 6 números.") }), await corpo());
    if (/^(\d)\1+$/.test(d.pin) || "0123456789".includes(d.pin)) falha(400, "Escolha um PIN menos óbvio.");
    repo.atualizar("colaboradores", c.empresa_id, c.id, { pin_hash: gerarHashSenha(d.pin) });
    return { ok: true };
  });

  /* ---------- Biometria (WebAuthn) ---------- */

  r.post("/api/app/biometria/opcoes", APP, ({ colaborador: c, empresa, req }) => {
    const { rpId } = rp(req);
    return opcoesCadastro({ desafio: desafios.novo(`cad:${c.id}`), rpId, rpNome: `Ponto ${empresa.nome_fantasia || empresa.razao_social}`.slice(0, 60), colaborador: c, excluir: credenciaisDe(c.id).map((k) => k.id) });
  });
  r.post("/api/app/biometria", APP, async (ctx) => {
    const d = validar(z.object({ id: t(512), resposta: z.object({ clientDataJSON: t(4000), attestationObject: t(20000) }), aparelho: op(200) }), await ctx.corpo());
    const desafio = desafios.usar(`cad:${ctx.colaborador.id}`);
    if (!desafio) falha(400, "Tempo esgotado. Tente de novo.");
    let cred;
    try {
      cred = conferirCadastro({ resposta: d.resposta, desafio, ...rp(ctx.req) });
    } catch (e) {
      falha(400, `Não foi possível cadastrar a biometria: ${e.message}`);
    }
    repo.rodar("INSERT OR REPLACE INTO credenciais (id, colaborador_id, chave, alg, contador, aparelho, criada_em) VALUES (?,?,?,?,?,?,?)", cred.id, ctx.colaborador.id, cred.chave, cred.alg, cred.contador, d.aparelho ?? null, agora());
    auditar(ctxApp(ctx), "biometria_cadastrada", { aparelho: d.aparelho });
    return { ok: true };
  });

  /* ---------- Registro de ponto ---------- */

  r.post("/api/app/ponto/preparar", APP, ({ colaborador: c, empresa, req }) => {
    const creds = credenciaisDe(c.id);
    const estab = c.estabelecimento_id ? repo.obter("estabelecimentos", empresa.id, c.estabelecimento_id) : null;
    return {
      biometria: creds.length ? opcoesConfirmacao({ desafio: desafios.novo(`ponto:${c.id}`), rpId: rp(req).rpId, credenciais: creds }) : null,
      exige_biometria: empresa.config.ponto.exige_biometria,
      exige_qr: Boolean(estab?.exige_qr),
      exige_gps: Boolean(estab?.exige_gps && estab.lat !== null) || repo.listar("estabelecimentos", empresa.id, { ativo: true }).some((e) => e.exige_gps && e.lat !== null),
      proxima: estadoHoje(c).proxima,
    };
  });

  r.post("/api/app/ponto", APP, async (ctx) => {
    const { colaborador: c, empresa } = ctx;
    const d = validar(
      z.object({
        lat: z.number().min(-90).max(90).optional().nullable(),
        lng: z.number().min(-180).max(180).optional().nullable(),
        precisao: z.number().min(0).max(100000).optional().nullable(),
        qr: z.string().max(200).optional().nullable(),
        biometria: z.object({ id: t(512), clientDataJSON: t(4000), authenticatorData: t(4000), signature: t(2000) }).optional().nullable(),
        aparelho: op(200),
      }),
      await ctx.corpo(),
    );
    const estabs = repo.listar("estabelecimentos", empresa.id, { ativo: true });
    const meu = estabs.find((e) => e.id === c.estabelecimento_id);

    // 1. Biometria do aparelho
    let biometria = false;
    if (d.biometria) {
      const desafio = desafios.usar(`ponto:${c.id}`);
      const cred = repo.um("SELECT * FROM credenciais WHERE id = ? AND colaborador_id = ?", d.biometria.id, c.id);
      if (!desafio || !cred) falha(400, "Biometria expirada. Toque de novo para registrar.");
      try {
        const { contador } = conferirConfirmacao({ resposta: d.biometria, desafio, ...rp(ctx.req), credencial: cred });
        repo.rodar("UPDATE credenciais SET contador = ?, usada_em = ? WHERE id = ?", contador, agora(), cred.id);
        biometria = true;
      } catch (e) {
        falha(401, `Biometria não confirmada: ${e.message}`);
      }
    } else if (empresa.config.ponto.exige_biometria) {
      falha(400, credenciaisDe(c.id).length ? "Confirme com sua digital ou rosto para registrar." : "Cadastre sua biometria no app antes de registrar o ponto.");
    }

    // 2. QR Code do quiosque
    let estabelecimento_id = meu?.id ?? null;
    let qr = false;
    if (d.qr) {
      const v = conferirQr(d.qr, (id) => estabs.find((e) => e.id === id)?.qr_segredo, agora(), cfg.qrSegundos);
      if (!v.ok) falha(400, v.motivo);
      estabelecimento_id = v.estabelecimento_id;
      qr = true;
    } else if (meu?.exige_qr) {
      falha(400, "Escaneie o QR Code do quiosque para registrar o ponto.");
    }

    // 3. Localização (cerca virtual). Com QR válido, a presença já está comprovada.
    let distancia_m = null;
    if (!qr) {
      const cerca = estabs.filter((e) => e.exige_gps && e.lat !== null);
      if (cerca.length) {
        const g = conferirGps(cerca, d.lat ?? undefined, d.lng ?? undefined, d.precisao ?? 0);
        if (!g.ok) falha(400, g.motivo);
        distancia_m = g.distancia ?? null;
        estabelecimento_id = g.estabelecimento_id ?? estabelecimento_id;
      }
    }

    let m;
    try {
      m = registrarMarcacao(repo, { empresa_id: empresa.id, colaborador: c, origem: qr ? "app_qr" : "app", coletor: "01", lat: d.lat ?? null, lng: d.lng ?? null, precisao: d.precisao ?? null, distancia_m, estabelecimento_id, biometria, qr, ip: ctx.ip, aparelho: d.aparelho ?? String(ctx.req.headers["user-agent"] ?? "").slice(0, 200), agora: agora() });
    } catch (e) {
      if (e instanceof ErroMarcacao) falha(e.status, e.message);
      throw e;
    }
    aviso(empresa.id, "marcacao", { colaborador_id: c.id });
    const estab = estabelecimento_id ? repo.obter("estabelecimentos", empresa.id, estabelecimento_id) : null;
    return { marcacao: { id: m.id, hora: horaLocal(m.momento), nsr: m.nsr, biometria, qr }, comprovante: comprovante({ empresa, estabelecimento: estab, colaborador: c, marcacao: m, registroInpi: empresa.config.registro_inpi }), hoje: estadoHoje(c) };
  });

  r.get("/api/app/marcacoes", APP, ({ colaborador: c, query }) => {
    const comp = validar(competencia, query.get("competencia") ?? dataLocal(agora()).slice(0, 7));
    const ini = instante(`${comp}-01`);
    const fim = instante(somarDias(somarDias(`${comp}-28`, 4).slice(0, 7) + "-01", 0));
    return repo.marcacoesEntre(c.id, ini, fim).map((m) => ({ id: m.id, dia: dataLocal(m.momento), hora: horaLocal(m.momento), nsr: m.nsr, origem: m.origem, biometria: m.biometria, qr: m.qr, status: m.status }));
  });

  r.get("/api/app/comprovante/:id", APP, ({ colaborador: c, empresa, params }) => {
    const m = repo.obter("marcacoes", empresa.id, params.id);
    if (!m || m.colaborador_id !== c.id) falha(404, "Marcação não encontrada.");
    const estab = m.estabelecimento_id ? repo.obter("estabelecimentos", empresa.id, m.estabelecimento_id) : null;
    return comprovante({ empresa, estabelecimento: estab, colaborador: c, marcacao: m, registroInpi: empresa.config.registro_inpi });
  });

  /* ---------- Espelho ---------- */

  r.get("/api/app/espelho/:competencia", APP, ({ colaborador: c, params }) => nucleo.espelhoDe(c, validar(competencia, params.competencia)));
  r.post("/api/app/espelho/:competencia/assinar", APP, (ctx) => {
    const comp = validar(competencia, ctx.params.competencia);
    const e = nucleo.espelhoDe(ctx.colaborador, comp);
    if (comp >= dataLocal(agora()).slice(0, 7)) falha(400, "O espelho só pode ser assinado depois que o mês terminar.");
    if (e.assinatura) falha(409, "Você já assinou este espelho.");
    const hash = sha256(JSON.stringify({ comp, dias: e.dias.map((d) => [d.data, d.marcacoes.map((m) => m.hora), d.trabalhado]), totais: e.totais }));
    repo.inserir("espelho_assinaturas", { empresa_id: ctx.empresa.id, colaborador_id: ctx.colaborador.id, competencia: comp, hash, ip: ctx.ip, assinado_em: agora() });
    return { ok: true, hash };
  });

  /* ---------- Solicitações ---------- */

  r.get("/api/app/ajustes", APP, ({ colaborador: c, empresa }) => repo.listar("ajustes", empresa.id, { colaborador_id: c.id }, { limite: 100 }));
  r.post("/api/app/ajustes", APP, async (ctx) => {
    const d = validar(z.object({ data, tipo: z.enum(["inclusao", "abono"]), horario: horario.optional(), motivo: t(500), anexo: op(40) }), await ctx.corpo());
    if (d.data > dataLocal(agora())) falha(400, "Não é possível pedir ajuste de um dia que ainda não chegou.");
    if (d.tipo === "inclusao" && !d.horario) falha(400, "Informe o horário que você esqueceu de registrar.");
    if (repo.um("SELECT 1 FROM fechamentos WHERE empresa_id = ? AND competencia = ?", ctx.empresa.id, d.data.slice(0, 7))) falha(409, "O ponto deste mês já foi fechado. Fale com o RH.");
    if (d.anexo && repo.obter("arquivos", ctx.empresa.id, d.anexo)?.colaborador_id !== ctx.colaborador.id) falha(400, "Anexo inválido.");
    const a = repo.inserir("ajustes", { ...d, empresa_id: ctx.empresa.id, colaborador_id: ctx.colaborador.id });
    aviso(ctx.empresa.id, "solicitacao", { tipo: "ajuste", nome: ctx.colaborador.nome });
    return a;
  });

  r.get("/api/app/ferias", APP, ({ colaborador: c, empresa }) => {
    const ferias = repo.listar("ferias", empresa.id, { colaborador_id: c.id }, { ordem: "inicio DESC" });
    return { periodos: periodosFerias(c.admissao, ferias, dataLocal(agora())), ferias: ferias.map(({ valores, ...f }) => ({ ...f, liquido: valores?.liquido ?? null, pagar_ate: valores?.pagar_ate ?? null })) };
  });
  r.post("/api/app/ferias", APP, async (ctx) => {
    const d = validar(z.object({ inicio: data, dias: z.number().int().min(5).max(30), abono_dias: z.number().int().min(0).max(10).optional(), adiantar_13: z.boolean().optional(), observacao: op(500) }), await ctx.corpo());
    if (d.inicio <= somarDias(dataLocal(agora()), 30)) falha(400, "Peça as férias com pelo menos 30 dias de antecedência.");
    const c = ctx.colaborador;
    const p = periodosFerias(c.admissao, repo.listar("ferias", ctx.empresa.id, { colaborador_id: c.id }), d.inicio).find((x) => x.completo && x.saldo > 0);
    if (!p) falha(400, "Você ainda não tem saldo de férias disponível.");
    if (d.dias + (d.abono_dias ?? 0) > p.saldo) falha(400, `Seu saldo é de ${p.saldo} dias.`);
    const f = repo.inserir("ferias", { ...d, empresa_id: ctx.empresa.id, colaborador_id: c.id, aquisitivo_inicio: p.inicio, aquisitivo_fim: p.fim, status: "solicitada", solicitado_por: c.nome });
    aviso(ctx.empresa.id, "solicitacao", { tipo: "ferias", nome: c.nome });
    return f;
  });

  r.post("/api/app/arquivos", APP, async (ctx) => {
    const dados = await lerCorpo(ctx.req, cfg.limites.tamanhoArquivo);
    if (!dados.length) falha(400, "Arquivo vazio.");
    const mime = String(ctx.req.headers["content-type"] ?? "");
    if (!/^(image\/(jpeg|png|webp|heic)|application\/pdf)$/.test(mime)) falha(400, "Envie uma foto ou um PDF.");
    const a = await nucleo.salvarArquivo({ empresa_id: ctx.empresa.id, nome: decodeURIComponent(ctx.req.headers["x-nome"] ?? "atestado"), mime, dados, enviado_por: ctx.colaborador.nome, colaborador_id: ctx.colaborador.id });
    return { id: a.id, nome: a.nome };
  });
  r.get("/api/app/atestados", APP, ({ colaborador: c, empresa }) => repo.listar("afastamentos", empresa.id, { colaborador_id: c.id }, { ordem: "inicio DESC", limite: 50 }));
  r.post("/api/app/atestados", APP, async (ctx) => {
    const d = validar(z.object({ inicio: data, fim: data, cid: op(10), medico: op(120), observacao: op(500), anexo: t(40) }), await ctx.corpo());
    if (d.fim < d.inicio) falha(400, "A data final é antes da inicial.");
    if (repo.obter("arquivos", ctx.empresa.id, d.anexo)?.colaborador_id !== ctx.colaborador.id) falha(400, "Envie a foto do atestado.");
    const a = repo.inserir("afastamentos", { ...d, motivo: "03", status: "pendente", empresa_id: ctx.empresa.id, colaborador_id: ctx.colaborador.id, enviado_por: ctx.colaborador.nome });
    aviso(ctx.empresa.id, "solicitacao", { tipo: "atestado", nome: ctx.colaborador.nome });
    return a;
  });

  /* ---------- Holerites, comunicados e documentos ---------- */

  r.get("/api/app/holerites", APP, ({ colaborador: c, empresa }) =>
    repo.todos("SELECT i.id, f.competencia, f.tipo, i.bruto, i.descontos, i.liquido, i.visualizado_em, json_extract(f.totais,'$.data_pagamento') data_pagamento FROM folha_itens i JOIN folhas f ON f.id = i.folha_id WHERE i.colaborador_id = ? AND f.empresa_id = ? AND f.status = 'fechada' ORDER BY f.competencia DESC, f.tipo", c.id, empresa.id),
  );
  r.get("/api/app/holerites/:id", APP, ({ colaborador: c, empresa, params }) => {
    const i = repo.um("SELECT i.*, f.competencia, f.tipo, f.status, json_extract(f.totais,'$.data_pagamento') data_pagamento FROM folha_itens i JOIN folhas f ON f.id = i.folha_id WHERE i.id = ? AND i.colaborador_id = ? AND f.status = 'fechada'", params.id, c.id);
    if (!i) falha(404, "Holerite não encontrado.");
    if (!i.visualizado_em) repo.rodar("UPDATE folha_itens SET visualizado_em = ? WHERE id = ?", agora(), i.id);
    const cargo = c.cargo_id ? repo.obter("cargos", empresa.id, c.cargo_id) : null;
    return { ...repo.ler("folha_itens", i), competencia: i.competencia, tipo: i.tipo, data_pagamento: i.data_pagamento, empresa: { razao_social: empresa.razao_social, cnpj: empresa.cnpj }, colaborador: { nome: c.nome, matricula: c.matricula, cpf: c.cpf, cargo: cargo?.nome, admissao: c.admissao } };
  });

  r.get("/api/app/comunicados", APP, ({ colaborador: c, empresa }) =>
    repo.todos("SELECT m.id, m.titulo, m.texto, m.fixado, m.autor, m.criado_em, l.lido_em FROM comunicados m LEFT JOIN comunicado_leituras l ON l.comunicado_id = m.id AND l.colaborador_id = ? WHERE m.empresa_id = ? ORDER BY m.fixado DESC, m.criado_em DESC LIMIT 100", c.id, empresa.id),
  );
  r.post("/api/app/comunicados/:id/lido", APP, ({ colaborador: c, empresa, params }) => {
    if (!repo.obter("comunicados", empresa.id, params.id)) falha(404, "Comunicado não encontrado.");
    repo.rodar("INSERT OR IGNORE INTO comunicado_leituras (comunicado_id, colaborador_id, lido_em) VALUES (?,?,?)", params.id, c.id, agora());
    return { ok: true };
  });

  r.get("/api/app/documentos", APP, ({ colaborador: c, empresa }) => repo.todos("SELECT d.id, d.tipo, d.nome, d.arquivo, d.validade, d.criado_em FROM documentos d JOIN arquivos a ON a.id = d.arquivo WHERE d.colaborador_id = ? AND d.empresa_id = ? AND a.publico = 1 ORDER BY d.criado_em DESC", c.id, empresa.id));
  r.get("/api/app/arquivos/:id", APP, async ({ colaborador: c, params, res }) => {
    const a = await nucleo.lerArquivo(params.id);
    if (!a || a.colaborador_id !== c.id || (!a.publico && a.enviado_por !== c.nome)) falha(404, "Arquivo não encontrado.");
    enviarArquivo(res, a);
  });
}
