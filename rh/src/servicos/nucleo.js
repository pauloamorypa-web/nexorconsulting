/* Regras de negócio compartilhadas pelas rotas: espelho de ponto, folha, arquivos, certificado digital e
   geração automática dos eventos do eSocial a cada fato do RH (admissão, alteração, afastamento, desligamento,
   fechamento da folha). */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { assinarXml, lerCertificado } from "../esocial/assinatura.js";
import * as EV from "../esocial/eventos.js";
import { calcular13, calcularMensal, RUBRICAS } from "../folha/calculo.js";
import { tabelasDaEmpresa } from "../folha/tabelas.js";
import { dataLocal, feriadosNacionais, instante, somarDias } from "../ponto/calendario.js";
import { calcularEspelho } from "../ponto/espelho.js";

export const CONFIG_PADRAO = {
  ponto: { exige_biometria: false, permitir_quiosque_pin: true, lembrar_marcacao: true },
  esocial: { ativo: true, ambiente: 2, class_trib: "99", cnae: "", fpas: "515", cod_tercs: "0115", rat: "1", fap: "1.0000", inicio_validade: "" },
  registro_inpi: "",
  transmissor_cnpj: "",
};

/** Configuração da empresa com os padrões preenchidos */
export function configCompleta(c = {}) {
  return {
    ...CONFIG_PADRAO,
    ...c,
    ponto: { ...CONFIG_PADRAO.ponto, ...(c.ponto ?? {}) },
    esocial: { ...CONFIG_PADRAO.esocial, ...(c.esocial ?? {}) },
  };
}

const CAMPOS_CONTRATUAIS = ["salario_centavos", "cargo_id", "jornada_id", "categoria_esocial", "tipo_contrato", "estabelecimento_id", "insalubridade_pct", "periculosidade"];
const CAMPOS_CADASTRAIS = ["nome", "nome_social", "sexo", "estado_civil", "raca_cor", "escolaridade", "endereco", "email", "telefone"];

export function criarNucleo({ repo, cofre, cfg, agora = () => Date.now() }) {
  const pastaArquivos = join(cfg.pastaDados, "arquivos");
  mkdirSync(pastaArquivos, { recursive: true });
  const cacheCert = new Map();

  const empresa = (id) => {
    const e = repo.obter("empresas", null, id);
    return e ? { ...e, config: configCompleta(e.config) } : null;
  };

  /* ---------- Feriados e espelho ---------- */

  function feriados(empresa_id, ano) {
    const s = new Set([...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)].map((f) => f.data));
    for (const f of repo.todos("SELECT data FROM feriados WHERE empresa_id = ?", empresa_id)) s.add(f.data);
    return s;
  }

  function espelhoDe(colaborador, competencia) {
    const jornada = colaborador.jornada_id ? repo.obter("jornadas", colaborador.empresa_id, colaborador.jornada_id) : null;
    const de = `${competencia}-01`;
    const ate = somarDias(somarDias(`${competencia}-28`, 4).slice(0, 7) + "-01", -1);
    const marcacoes = repo.marcacoesEntre(colaborador.id, instante(de) - 4 * 3600_000, instante(somarDias(ate, 1)) + 12 * 3600_000);
    const ajustes = repo.todos("SELECT * FROM ajustes WHERE colaborador_id = ? AND status = 'aprovado' AND data BETWEEN ? AND ?", colaborador.id, de, ate);
    const desconsideradas = new Set(ajustes.filter((a) => a.tipo === "desconsiderar").map((a) => a.marcacao_id));
    const esp = calcularEspelho({
      competencia,
      colaborador,
      jornada,
      marcacoes: marcacoes.filter((m) => !desconsideradas.has(m.id)),
      ajustes,
      feriados: feriados(colaborador.empresa_id, Number(competencia.slice(0, 4))),
      ferias: repo.feriasNoPeriodo(colaborador.id, de, ate),
      afastamentos: repo.afastamentosNoPeriodo(colaborador.id, de, ate),
      hoje: dataLocal(agora()),
    });
    // Antes da admissão e depois do desligamento não há falta
    for (const d of esp.dias) {
      if (d.data < colaborador.admissao || (colaborador.desligamento?.data && d.data > colaborador.desligamento.data)) {
        if (d.falta) esp.totais.faltas--;
        Object.assign(d, { status: "fora_contrato", falta: false, atraso: 0 });
      }
    }
    esp.totais.previsto = esp.dias.filter((d) => !["afastado", "ferias", "feriado", "folga", "fora_contrato"].includes(d.status)).reduce((s, d) => s + d.previsto, 0);
    esp.totais.atraso = esp.dias.reduce((s, d) => s + d.atraso, 0);
    esp.jornada = jornada ? { id: jornada.id, nome: jornada.nome, tolerancia_min: jornada.tolerancia_min } : null;
    esp.saldo_banco = repo.saldoBanco(colaborador.id);
    esp.fechado = Boolean(repo.um("SELECT 1 FROM fechamentos WHERE empresa_id = ? AND competencia = ?", colaborador.empresa_id, competencia));
    esp.assinatura = repo.um("SELECT assinado_em, hash FROM espelho_assinaturas WHERE colaborador_id = ? AND competencia = ?", colaborador.id, competencia) ?? null;
    return esp;
  }

  /* ---------- Folha ---------- */

  const mediaVariaveis = (colaborador_id, ano) => {
    const itens = repo.todos("SELECT i.rubricas FROM folha_itens i JOIN folhas f ON f.id = i.folha_id WHERE i.colaborador_id = ? AND f.tipo = 'mensal' AND f.competencia LIKE ?", colaborador_id, `${ano}-%`);
    if (!itens.length) return 0;
    const soma = itens.reduce((s, i) => s + JSON.parse(i.rubricas).filter((r) => ["HE50", "HE100", "ADN", "DSR"].includes(r.codigo)).reduce((a, r) => a + r.valor, 0), 0);
    return Math.round(soma / itens.length);
  };

  function calcularFolha(emp, competencia, tipo = "mensal") {
    const existente = repo.um("SELECT * FROM folhas WHERE empresa_id = ? AND competencia = ? AND tipo = ?", emp.id, competencia, tipo);
    if (existente?.status === "fechada") throw Object.assign(new Error("Esta folha já foi fechada. Para corrigir, reabra antes."), { status: 409 });
    const tabelas = tabelasDaEmpresa(emp);
    const fimMes = somarDias(somarDias(`${competencia}-28`, 4).slice(0, 7) + "-01", -1);
    const colaboradores = repo.todos("SELECT * FROM colaboradores WHERE empresa_id = ? AND admissao <= ? AND (status != 'desligado' OR json_extract(desligamento, '$.data') >= ?) ORDER BY nome", emp.id, fimMes, `${competencia}-01`).map((c) => repo.ler("colaboradores", c));
    const ano = Number(competencia.slice(0, 4));
    return repo.transacao(() => {
      if (existente) repo.rodar("DELETE FROM folhas WHERE id = ?", existente.id);
      const folha = repo.inserir("folhas", { empresa_id: emp.id, competencia, tipo, calculada_em: agora() });
      const totais = { colaboradores: 0, bruto: 0, descontos: 0, liquido: 0, inss: 0, irrf: 0, fgts: 0, inss_patronal_estimado: 0 };
      for (const c of colaboradores) {
        const dependentes = repo.listar("dependentes", emp.id, { colaborador_id: c.id });
        let res;
        if (tipo === "mensal") {
          const jornada = c.jornada_id ? repo.obter("jornadas", emp.id, c.jornada_id) : null;
          res = calcularMensal({
            colaborador: c,
            jornada,
            espelho: espelhoDe(c, competencia),
            beneficios: repo.beneficiosDoColaborador(c.id),
            lancamentos: repo.listar("lancamentos", emp.id, { colaborador_id: c.id, competencia }),
            dependentes,
            afastamentos: repo.afastamentosNoPeriodo(c.id, `${competencia}-01`, fimMes),
            competencia,
            tabelas,
          });
        } else {
          const parcela = tipo === "13_1" ? 1 : 2;
          const primeira = parcela === 2 ? repo.um("SELECT i.bruto FROM folha_itens i JOIN folhas f ON f.id = i.folha_id WHERE i.colaborador_id = ? AND f.tipo = '13_1' AND f.competencia LIKE ?", c.id, `${ano}-%`)?.bruto ?? 0 : 0;
          res = calcular13({ colaborador: c, ano, parcela, mediaVariaveis: mediaVariaveis(c.id, ano), primeiraParcelaPaga: primeira, dependentes, tabelas });
          if (!res.avos) continue;
        }
        repo.inserir("folha_itens", { folha_id: folha.id, empresa_id: emp.id, colaborador_id: c.id, rubricas: res.rubricas, bruto: res.bruto, descontos: res.descontos, liquido: res.liquido, base_inss: res.base_inss, inss: res.inss, base_irrf: res.base_irrf, irrf: res.irrf, base_fgts: res.base_fgts, fgts: res.fgts });
        totais.colaboradores++;
        for (const k of ["bruto", "descontos", "liquido", "inss", "irrf", "fgts"]) totais[k] += res[k];
        totais.inss_patronal_estimado += Math.round(res.base_inss * 0.2);
      }
      return repo.atualizar("folhas", emp.id, folha.id, { totais });
    });
  }

  function itensDaFolha(folha_id, empresa_id) {
    return repo.todos("SELECT i.*, c.nome, c.matricula, c.cpf, c.cargo_id, (SELECT nome FROM cargos WHERE id = c.cargo_id) cargo FROM folha_itens i JOIN colaboradores c ON c.id = i.colaborador_id WHERE i.folha_id = ? AND i.empresa_id = ? ORDER BY c.nome", folha_id, empresa_id).map((i) => repo.ler("folha_itens", i));
  }

  /* ---------- Arquivos (documentos, atestados, currículos) ---------- */

  async function salvarArquivo({ empresa_id, nome, mime, dados, enviado_por, colaborador_id, publico = false }) {
    const a = repo.inserir("arquivos", { id: randomUUID(), empresa_id, nome: String(nome || "arquivo").slice(0, 160), mime: mime || "application/octet-stream", tamanho: dados.length, enviado_por, colaborador_id, publico });
    await writeFile(join(pastaArquivos, a.id), cofre.cifrar(dados.toString("base64")));
    return a;
  }
  async function lerArquivo(id) {
    const a = repo.obter("arquivos", null, id);
    if (!a) return null;
    const conteudo = await readFile(join(pastaArquivos, a.id), "utf8").catch(() => null);
    return conteudo ? { ...a, dados: Buffer.from(cofre.decifrar(conteudo), "base64") } : null;
  }
  async function removerArquivo(id) {
    repo.rodar("DELETE FROM arquivos WHERE id = ?", id);
    await unlink(join(pastaArquivos, id)).catch(() => {});
  }

  /* ---------- Certificado digital ---------- */

  function guardarCertificado(emp, pfx, senha) {
    const c = lerCertificado(pfx, senha);
    if (c.validoAte < agora()) throw Object.assign(new Error("Este certificado está vencido."), { status: 400 });
    const config = { ...emp.config, certificado: { pfx: cofre.cifrar(Buffer.from(pfx).toString("base64")), senha: cofre.cifrar(senha), titular: c.titular, valido_de: c.validoDe, valido_ate: c.validoAte, enviado_em: agora() } };
    repo.atualizar("empresas", null, emp.id, { config });
    cacheCert.delete(emp.id);
    return { titular: c.titular, valido_ate: c.validoAte };
  }
  function certificado(emp) {
    const c = emp.config?.certificado;
    if (!c?.pfx) return null;
    const chave = `${emp.id}:${c.enviado_em}`;
    if (!cacheCert.has(chave)) cacheCert.set(chave, lerCertificado(Buffer.from(cofre.decifrar(c.pfx), "base64"), cofre.decifrar(c.senha)));
    return cacheCert.get(chave);
  }

  /* ---------- eSocial ---------- */

  function gerarEvento(emp, tipo, xml, descricao, referencia = {}) {
    const id = /Id="([^"]+)"/.exec(xml)[1];
    let xml_assinado = null;
    let status = "gerado";
    const cert = certificado(emp);
    if (cert) {
      xml_assinado = assinarXml(xml, cert);
      status = "assinado";
    }
    return repo.inserir("esocial_eventos", { empresa_id: emp.id, tipo, descricao, referencia, id_evento: id, xml, xml_assinado, status });
  }

  const ambiente = (emp) => Number(emp.config.esocial.ambiente) || 2;
  const ativo = (emp) => emp.config.esocial.ativo !== false;
  const inicioValidade = (emp) => emp.config.esocial.inicio_validade || dataLocal(agora()).slice(0, 7);
  const contexto = (emp, c) => ({
    empresa: emp,
    colaborador: c,
    cargo: c.cargo_id ? repo.obter("cargos", emp.id, c.cargo_id) : null,
    jornada: c.jornada_id ? repo.obter("jornadas", emp.id, c.jornada_id) : null,
    estabelecimento: c.estabelecimento_id ? repo.obter("estabelecimentos", emp.id, c.estabelecimento_id) : null,
    dependentes: repo.listar("dependentes", emp.id, { colaborador_id: c.id }),
    ambiente: ambiente(emp),
  });

  const esocial = {
    tabelasIniciais(emp) {
      const amb = ambiente(emp);
      const inicio = inicioValidade(emp);
      const criados = [gerarEvento(emp, "S-1000", EV.s1000({ empresa: emp, ambiente: amb, inicio }), `Informações do empregador ${emp.razao_social}`)];
      for (const e of repo.listar("estabelecimentos", emp.id, { ativo: true })) criados.push(gerarEvento(emp, "S-1005", EV.s1005({ empresa: emp, estabelecimento: e, ambiente: amb, inicio }), `Estabelecimento ${e.nome}`, { estabelecimento_id: e.id }));
      criados.push(gerarEvento(emp, "S-1020", EV.s1020({ empresa: emp, ambiente: amb, inicio }), "Lotação tributária GERAL"));
      for (const [codigo, rubrica] of Object.entries(RUBRICAS)) criados.push(gerarEvento(emp, "S-1010", EV.s1010({ empresa: emp, ambiente: amb, inicio, codigo, rubrica }), `Rubrica ${codigo} · ${rubrica.nome}`, { rubrica: codigo }));
      return criados;
    },
    admissao(emp, c) {
      if (!ativo(emp)) return null;
      return gerarEvento(emp, "S-2200", EV.s2200(contexto(emp, c)), `Admissão de ${c.nome}`, { colaborador_id: c.id });
    },
    alteracao(emp, antes, depois) {
      if (!ativo(emp)) return [];
      const mudou = (campos) => campos.some((k) => JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null));
      const data = dataLocal(agora());
      const r = [];
      if (mudou(CAMPOS_CADASTRAIS)) r.push(gerarEvento(emp, "S-2205", EV.s2205({ ...contexto(emp, depois), data }), `Alteração cadastral de ${depois.nome}`, { colaborador_id: depois.id }));
      if (mudou(CAMPOS_CONTRATUAIS)) r.push(gerarEvento(emp, "S-2206", EV.s2206({ ...contexto(emp, depois), data }), `Alteração contratual de ${depois.nome}`, { colaborador_id: depois.id }));
      return r;
    },
    afastamento(emp, c, a) {
      if (!ativo(emp) || !EV.MOTIVOS_AFASTAMENTO[a.motivo]) return null;
      // O eSocial só exige S-2230 de doença/acidente quando passa de 15 dias (ou é acidente do trabalho)
      const dias = a.fim ? Math.round((Date.parse(a.fim) - Date.parse(a.inicio)) / 86400_000) + 1 : 999;
      if (a.motivo === "03" && dias <= 15) return null;
      return gerarEvento(emp, "S-2230", EV.s2230({ ...contexto(emp, c), afastamento: a }), `Afastamento de ${c.nome} (${EV.MOTIVOS_AFASTAMENTO[a.motivo]})`, { colaborador_id: c.id, afastamento_id: a.id });
    },
    desligamento(emp, c, rescisao, data) {
      if (!ativo(emp)) return null;
      return gerarEvento(emp, "S-2299", EV.s2299({ ...contexto(emp, c), rescisao, data }), `Desligamento de ${c.nome}`, { colaborador_id: c.id });
    },
    folha(emp, folha, dataPagamento) {
      if (!ativo(emp)) return [];
      const amb = ambiente(emp);
      const ind = folha.tipo === "13_2" ? "2" : "1";
      if (folha.tipo === "13_1") return []; // 1ª parcela do 13º não gera S-1200 (vai junto com a 2ª)
      const r = [];
      for (const item of itensDaFolha(folha.id, emp.id)) {
        const c = repo.obter("colaboradores", emp.id, item.colaborador_id);
        const est = c.estabelecimento_id ? repo.obter("estabelecimentos", emp.id, c.estabelecimento_id) : null;
        r.push(gerarEvento(emp, "S-1200", EV.s1200({ empresa: emp, colaborador: c, item, competencia: folha.competencia, estabelecimento: est, ambiente: amb, indApuracao: ind }), `Remuneração ${folha.competencia} · ${c.nome}`, { colaborador_id: c.id, folha_id: folha.id }));
        r.push(gerarEvento(emp, "S-1210", EV.s1210({ empresa: emp, colaborador: c, item, competencia: folha.competencia, dataPagamento, ambiente: amb }), `Pagamento ${folha.competencia} · ${c.nome}`, { colaborador_id: c.id, folha_id: folha.id }));
      }
      r.push(gerarEvento(emp, "S-1299", EV.s1299({ empresa: emp, competencia: folha.competencia, ambiente: amb, indApuracao: ind }), `Fechamento dos eventos periódicos ${folha.competencia}`, { folha_id: folha.id }));
      return r;
    },
    assinarPendentes(emp) {
      const cert = certificado(emp);
      if (!cert) throw Object.assign(new Error("Envie o certificado digital A1 da empresa em Configurações → eSocial."), { status: 400 });
      let n = 0;
      for (const e of repo.listar("esocial_eventos", emp.id, { status: "gerado" })) {
        repo.atualizar("esocial_eventos", emp.id, e.id, { xml_assinado: assinarXml(e.xml, cert), status: "assinado" });
        n++;
      }
      return n;
    },
  };

  return { empresa, feriados, espelhoDe, calcularFolha, itensDaFolha, salvarArquivo, lerArquivo, removerArquivo, guardarCertificado, certificado, esocial, mediaVariaveis };
}
