/* Roteiro de dados da demonstração: empresa fictícia "Padaria Pão Dourado".
   Tudo é relativo a hoje (ponto de hoje com batidas, pendências recentes, folha do mês anterior para fechar,
   eSocial com histórico processado e eventos novos para enviar, recrutamento e comunicados).
   Semente determinística: a mesma demonstração toda vez (só as datas acompanham o dia de hoje).
   Todos os dados são fictícios: CPFs válidos só no formato, telefones 99999-xxxx, e-mails em domínio .example. */

import { generateKeyPairSync } from "node:crypto";
import forge from "node-forge";
import { gerarHashSenha, gerarToken, sha256 } from "../seguranca.js";
import { dataLocal, feriadosNacionais, instante, somarDias } from "../ponto/calendario.js";
import { previstoNoDia } from "../ponto/espelho.js";
import { registrarMarcacao } from "../ponto/registro.js";

export const SENHA_DEMO = "demo12345";
export const CODIGO_APP_DEMO = "246810";
export const PIN_QUIOSQUE_DEMO = "2580";
/** Link fixo do quiosque (tablet com QR Code rotativo) da Loja Paulista */
export const TOKEN_QUIOSQUE_DEMO = "demonstracao-quiosque-loja-paulista";

/** Usuários do painel e o colaborador do app usados nos papéis de /demo/entrar */
export const USUARIOS_DEMO = {
  admin: { nome: "Marina Souza", email: "demo@nexorrh.com.br" },
  rh: { nome: "Paula Ribeiro", email: "rh@paodourado.example" },
  gestor: { nome: "Felipe Andrade", email: "felipe@paodourado.example" },
};

// CPF válido a partir de 9 dígitos (gerado, não pertence a ninguém)
export const gerarCpf = (base) => {
  const d = String(base).padStart(9, "0").split("").map(Number);
  for (const n of [9, 10]) {
    const s = d.slice(0, n).reduce((a, x, i) => a + x * (n + 1 - i), 0);
    d.push(((s * 10) % 11) % 10);
  }
  return d.join("");
};

/** Certificado A1 autoassinado e fictício (só para a demonstração assinar e "enviar" os eventos do eSocial) */
function certificadoDemo(senha) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const chave = forge.pki.privateKeyFromPem(privateKey.export({ type: "pkcs8", format: "pem" }));
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: "spki", format: "pem" }));
  cert.serialNumber = "0D";
  cert.validity.notBefore = new Date(Date.now() - 30 * 86400_000);
  cert.validity.notAfter = new Date(Date.now() + 300 * 86400_000);
  const attrs = [{ name: "commonName", value: "PADARIA PAO DOURADO LTDA (DEMONSTRACAO):11222333000181" }, { name: "countryName", value: "BR" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(chave, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(chave, [cert], senha, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}

/**
 * Semeia a demonstração num banco vazio.
 * @returns {{ empresa_id: string, colaborador_app_id: string, marcacoes: number }}
 */
export function semear({ repo, nucleo, agora = () => Date.now() }) {
  let semente = 7;
  const aleatorio = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
  const variar = (min) => Math.round((aleatorio() - 0.5) * 2 * min);
  const agoraMs = agora();
  const hoje = dataLocal(agoraMs);
  const dia = (n) => somarDias(hoje, n);
  const ms = (n, hh = "10:00") => instante(dia(n), hh);
  const mes = (n) => {
    const [a, m] = hoje.split("-").map(Number);
    const d = new Date(Date.UTC(a, m - 1 + n, 15));
    return d.toISOString().slice(0, 7);
  };
  const M0 = mes(0);
  const M1 = mes(-1);
  const M2 = mes(-2);

  const emp = repo.inserir("empresas", {
    razao_social: "Padaria Pão Dourado Ltda",
    nome_fantasia: "Pão Dourado",
    cnpj: "11222333000181",
    endereco: { logradouro: "Av. Paulista", numero: "1000", bairro: "Bela Vista", cep: "01310100", cidade: "São Paulo", uf: "SP", cod_municipio: "3550308" },
    config: { registro_inpi: "BR512026000123-4", ponto: { exige_biometria: false, qr_exige_gps: false }, esocial: { ambiente: 2, class_trib: "01", cnae: "1091102", fpas: "507", rat: "2", fap: "1.0000", inicio_validade: M2 } },
  });
  const admin = repo.inserir("usuarios", { empresa_id: emp.id, nome: USUARIOS_DEMO.admin.nome, email: USUARIOS_DEMO.admin.email, senha_hash: gerarHashSenha(SENHA_DEMO), papel: "admin" });
  repo.inserir("usuarios", { empresa_id: emp.id, nome: USUARIOS_DEMO.rh.nome, email: USUARIOS_DEMO.rh.email, senha_hash: gerarHashSenha(SENHA_DEMO), papel: "rh" });
  // Cerca virtual desligada na demonstração: o vendedor bate o ponto de qualquer lugar (dá para ligar ao vivo em Configurações)
  const loja = repo.inserir("estabelecimentos", { empresa_id: emp.id, nome: "Loja Paulista", cnpj: "11222333000181", lat: -23.5649, lng: -46.6519, raio_m: 120, exige_gps: false, qr_segredo: gerarToken(32), quiosque_hash: sha256(TOKEN_QUIOSQUE_DEMO) });
  const fabrica = repo.inserir("estabelecimentos", { empresa_id: emp.id, nome: "Fábrica Mooca", lat: -23.5585, lng: -46.5986, raio_m: 200, exige_gps: false, qr_segredo: gerarToken(32) });
  const dep = Object.fromEntries(["Atendimento", "Produção", "Administrativo"].map((n) => [n, repo.inserir("departamentos", { empresa_id: emp.id, nome: n })]));
  // Gestor da loja: vê só a equipe de Atendimento
  const gestor = repo.inserir("usuarios", { empresa_id: emp.id, nome: USUARIOS_DEMO.gestor.nome, email: USUARIOS_DEMO.gestor.email, senha_hash: gerarHashSenha(SENHA_DEMO), papel: "gestor", departamento_id: dep.Atendimento.id });
  repo.rodar("UPDATE departamentos SET gestor_id = ? WHERE id = ?", gestor.id, dep.Atendimento.id);
  const cargo = Object.fromEntries(
    [
      ["Atendente de balcão", "521140", 210000],
      ["Padeiro", "848305", 260000],
      ["Confeiteira", "848310", 270000],
      ["Auxiliar de produção", "784205", 190000],
      ["Analista administrativo", "411010", 380000],
      ["Gerente de loja", "141410", 650000],
      ["Operadora de caixa", "421125", 215000],
    ].map(([n, cbo, s]) => [n, repo.inserir("cargos", { empresa_id: emp.id, nome: n, cbo, salario_centavos: s })]),
  );
  const seg = (e, s, i) => Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, { entrada: e, saida: s, intervalo_min: i }]));
  const comercial = repo.inserir("jornadas", { empresa_id: emp.id, nome: "Comercial 44h (seg a sex)", dias: seg("08:00", "17:48", 60), horas_semanais: 44 });
  const loja6x1 = repo.inserir("jornadas", { empresa_id: emp.id, nome: "Loja 6x1 (seg a sáb 7h–15h20)", dias: { ...seg("07:00", "15:20", 60), 6: { entrada: "07:00", saida: "15:20", intervalo_min: 60 } }, horas_semanais: 44, banco_horas: true });
  const madrugada = repo.inserir("jornadas", { empresa_id: emp.id, nome: "Produção madrugada (22h–6h)", dias: { ...seg("22:00", "06:00", 60), 6: { entrada: "22:00", saida: "04:00", intervalo_min: 15 } }, horas_semanais: 44 });

  // [nome, sexo, nascimento, cargo, departamento, jornada, local, admissão]
  const pessoas = [
    ["Ana Beatriz Lima", "F", "1994-11-14", "Atendente de balcão", "Atendimento", loja6x1, loja, "2023-03-06"],
    ["Bruno Carvalho", "M", "1988-02-20", "Padeiro", "Produção", madrugada, fabrica, "2021-08-02"],
    ["Camila Rocha", "F", "1991-11-02", "Confeiteira", "Produção", comercial, fabrica, "2022-01-10"],
    ["Diego Fernandes", "M", "1999-06-30", "Auxiliar de produção", "Produção", madrugada, fabrica, dia(-56)],
    ["Eduarda Martins", "F", "1996-04-08", "Atendente de balcão", "Atendimento", loja6x1, loja, dia(-386)],
    ["Felipe Andrade", "M", "1985-09-12", "Gerente de loja", "Atendimento", comercial, loja, "2019-05-13"],
    ["Gabriela Nunes", "F", "1993-12-01", "Analista administrativo", "Administrativo", comercial, loja, "2024-07-01"],
    ["Henrique Alves", "M", "2001-01-25", "Atendente de balcão", "Atendimento", loja6x1, loja, dia(-22)],
    ["Isabela Monteiro", "F", "1998-08-19", "Operadora de caixa", "Atendimento", loja6x1, loja, "2024-02-05"],
    ["João Pedro Santos", "M", "1990-03-27", "Padeiro", "Produção", madrugada, fabrica, "2020-11-03"],
  ];
  const colabs = pessoas.map(([nome, sexo, nasc, c, d, j, e, adm], i) =>
    repo.inserir("colaboradores", {
      empresa_id: emp.id,
      matricula: String(i + 1).padStart(5, "0"),
      nome,
      sexo,
      nascimento: nasc,
      cpf: gerarCpf(123450000 + i * 7919),
      email: `${nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@paodourado.example`,
      telefone: `1199999${String(1001 + i * 37).padStart(4, "0")}`,
      admissao: adm,
      cargo_id: cargo[c].id,
      departamento_id: dep[d].id,
      jornada_id: j.id,
      estabelecimento_id: e.id,
      salario_centavos: cargo[c].salario_centavos,
      insalubridade_pct: d === "Produção" ? 20 : 0,
      endereco: { logradouro: "Rua das Flores", numero: String(100 + i), bairro: "Centro", cep: "01001000", cidade: "São Paulo", uf: "SP", cod_municipio: "3550308" },
      raca_cor: "parda",
      escolaridade: "medio",
      estado_civil: i % 3 ? "solteiro" : "casado",
      criado_em: instante(adm < dia(-90) ? dia(-90) : adm, "09:00"),
    }),
  );
  const [ana, bruno, camila, diego, eduarda, , , henrique, isabela] = colabs;
  repo.atualizar("colaboradores", emp.id, ana.id, { pin_hash: gerarHashSenha(PIN_QUIOSQUE_DEMO) });

  // Férias já gozadas: todos os períodos completos menos o mais recente (que fica para programar)
  const ultimoPeriodo = new Map();
  for (const c of colabs) {
    let ini = c.admissao;
    const periodos = [];
    while (somarDias(somarDias(ini, 365), -1) <= hoje) {
      periodos.push([ini, somarDias(somarDias(ini, 365), -1)]);
      ini = somarDias(ini, 365);
    }
    ultimoPeriodo.set(c.id, periodos.at(-1));
    for (const [a, b] of periodos.slice(0, -1)) repo.inserir("ferias", { empresa_id: emp.id, colaborador_id: c.id, aquisitivo_inicio: a, aquisitivo_fim: b, inicio: somarDias(b, 60), dias: 30, status: "aprovada", solicitado_por: "RH" });
  }
  repo.inserir("dependentes", { empresa_id: emp.id, colaborador_id: bruno.id, nome: "Lucas Carvalho", parentesco: "filho", nascimento: "2017-05-03", irrf: true, salario_familia: true });
  repo.inserir("dependentes", { empresa_id: emp.id, colaborador_id: camila.id, nome: "Sofia Rocha", parentesco: "filho", nascimento: "2020-09-21", irrf: true, salario_familia: false });
  const vt = repo.inserir("beneficios", { empresa_id: emp.id, nome: "Vale-transporte", tipo: "vt", valor_centavos: 22000 });
  const vr = repo.inserir("beneficios", { empresa_id: emp.id, nome: "Vale-refeição", tipo: "vr", valor_centavos: 55000, desconto_tipo: "percentual", desconto_valor: 10 });
  for (const c of colabs) repo.definirBeneficios(c.id, [{ beneficio_id: vt.id }, { beneficio_id: vr.id }]);

  // Certificado A1 fictício: os eventos do eSocial já nascem assinados
  nucleo.guardarCertificado(nucleo.empresa(emp.id), certificadoDemo("demo"), "demo");
  let empresa = nucleo.empresa(emp.id);
  nucleo.esocial.tabelasIniciais(empresa);
  for (const c of colabs) nucleo.esocial.admissao(empresa, c);

  // Marcações desde o 1º dia de dois meses atrás até agora: biometria, QR, pequenos atrasos e horas extras
  const feriados = new Set([...feriadosNacionais(Number(M2.slice(0, 4))), ...feriadosNacionais(Number(hoje.slice(0, 4)))].map((f) => f.data));
  for (let d = `${M2}-01`; d <= hoje; d = somarDias(d, 1)) {
    for (const [i, c] of colabs.entries()) {
      if (d < c.admissao) continue;
      const j = repo.obter("jornadas", emp.id, c.jornada_id);
      const p = previstoNoDia(j, d);
      const trabalhaFeriado = feriados.has(d) && [0, 4, 7].includes(i);
      if (!p || (feriados.has(d) && !trabalhaFeriado)) continue;
      const ehHoje = d === hoje;
      if (!ehHoje && aleatorio() < 0.03) continue; // falta
      const ini = instante(d, p.entrada) + variar(6) * 60_000 + (aleatorio() < 0.06 ? 25 * 60_000 : 0);
      let fimPrev = instante(d, p.saida);
      if (fimPrev <= instante(d, p.entrada)) fimPrev += 86400_000;
      const fim = fimPrev + variar(8) * 60_000 + (aleatorio() < 0.15 ? Math.round(aleatorio() * 90) * 60_000 : 0);
      const meio = ini + Math.round((fim - ini) / 2) - 30 * 60_000;
      const volta = meio + (p.intervalo_min + variar(4)) * 60_000;
      const esquecer = !ehHoje && aleatorio() < 0.03;
      let horarios = [ini, ...(p.intervalo_min && !esquecer ? [meio, volta] : []), fim].filter((t) => t <= agoraMs - 2 * 60_000);
      // A colaboradora do app (Ana) chega hoje com só a entrada: o vendedor registra a próxima batida ao vivo
      if (ehHoje && c.id === ana.id) horarios = horarios.slice(0, 1);
      for (const t of horarios) {
        const qr = c.estabelecimento_id === loja.id && aleatorio() < 0.4;
        registrarMarcacao(repo, { empresa_id: emp.id, colaborador: c, origem: qr ? "app_qr" : "app", lat: qr ? null : -23.5649 + variar(3) / 100000, lng: qr ? null : -46.6519 + variar(3) / 100000, precisao: 12, distancia_m: qr ? null : 8 + Math.round(aleatorio() * 40), estabelecimento_id: c.estabelecimento_id, biometria: i % 3 !== 2, qr, aparelho: i % 2 ? "iPhone" : "Android", agora: t });
      }
    }
  }

  // Pedidos já resolvidos (histórico) e pendentes para aprovar ao vivo
  repo.inserir("ajustes", { empresa_id: emp.id, colaborador_id: ana.id, data: dia(-12), tipo: "inclusao", horario: "11:58", motivo: "Esqueci de bater a saída do almoço.", status: "aprovado", analisado_por: USUARIOS_DEMO.gestor.nome, analisado_em: ms(-11), criado_em: ms(-12, "16:00") });
  repo.inserir("ajustes", { empresa_id: emp.id, colaborador_id: eduarda.id, data: dia(-2), tipo: "inclusao", horario: "15:22", motivo: "Meu celular descarregou na saída.", criado_em: ms(-2, "19:40") });
  repo.inserir("ajustes", { empresa_id: emp.id, colaborador_id: diego.id, data: dia(-5), tipo: "abono", motivo: "Levei meu filho ao pediatra, tenho declaração.", criado_em: ms(-4, "08:10") });
  repo.inserir("ajustes", { empresa_id: emp.id, colaborador_id: isabela.id, data: dia(-1), tipo: "inclusao", horario: "07:04", motivo: "O app não abriu na entrada, cheguei no horário.", criado_em: ms(-1, "07:30") });
  const pBruno = ultimoPeriodo.get(bruno.id);
  if (pBruno) repo.inserir("ferias", { empresa_id: emp.id, colaborador_id: bruno.id, aquisitivo_inicio: pBruno[0], aquisitivo_fim: pBruno[1], inicio: dia(35), dias: 20, abono_dias: 10, status: "solicitada", solicitado_por: bruno.nome, criado_em: ms(-3, "21:15") });
  repo.inserir("afastamentos", { empresa_id: emp.id, colaborador_id: camila.id, motivo: "03", inicio: dia(-3), fim: dia(-2), observacao: "Gripe, atestado de 2 dias", status: "pendente", enviado_por: camila.nome, criado_em: ms(-3, "09:20") });
  repo.inserir("afastamentos", { empresa_id: emp.id, colaborador_id: ana.id, motivo: "03", inicio: dia(-40), fim: dia(-40), observacao: "Consulta médica", status: "aprovado", enviado_por: ana.nome, criado_em: ms(-40) });

  // Folha: dois meses atrás fechada e paga (holerites no app), mês passado calculada para fechar ao vivo
  empresa = nucleo.empresa(emp.id);
  const f2 = nucleo.calcularFolha(empresa, M2);
  const fechada = repo.atualizar("folhas", emp.id, f2.id, { status: "fechada", fechada_em: instante(`${M1}-03`, "17:00"), totais: { ...f2.totais, data_pagamento: `${M1}-05` } });
  nucleo.esocial.folha(empresa, fechada, `${M1}-05`);
  repo.rodar("UPDATE folha_itens SET visualizado_em = ? WHERE folha_id = ? AND colaborador_id != ?", instante(`${M1}-05`, "12:00"), f2.id, henrique.id);
  nucleo.calcularFolha(empresa, M1);

  // eSocial: histórico já processado pelo governo (com recibo); a admissão mais recente fica para enviar ao vivo
  const lote = repo.inserir("esocial_lotes", { empresa_id: emp.id, ambiente: 2, protocolo: "1.2.000000.0000000000000000001", status: "processado", resposta: { codigo: "201", descricao: "Lote processado com sucesso. (simulado)" }, enviado_em: instante(`${M1}-05`, "18:00"), consultado_em: instante(`${M1}-05`, "18:05") });
  let n = 0;
  for (const e of repo.todos("SELECT id, tipo, referencia FROM esocial_eventos WHERE empresa_id = ? ORDER BY criado_em", emp.id)) {
    const ref = JSON.parse(e.referencia || "{}");
    if (e.tipo === "S-2200" && ref.colaborador_id === henrique.id) continue;
    n++;
    repo.rodar("UPDATE esocial_eventos SET status = 'processado', lote_id = ?, recibo = ?, ocorrencias = '[]' WHERE id = ?", lote.id, `1.1.0000000000${String(9000000 + n).padStart(9, "0")}`, e.id);
  }

  // Recrutamento
  const vaga = repo.inserir("vagas", { empresa_id: emp.id, titulo: "Atendente de balcão (manhã)", departamento_id: dep.Atendimento.id, modalidade: "presencial", local: "Av. Paulista", salario: "R$ 2.100 + VT + VR", descricao: "Atendimento ao cliente, caixa e reposição.\nEscala 6x1, das 7h às 15h20.", requisitos: "Ensino médio completo. Experiência com atendimento é um diferencial.", criada_em: ms(-18) });
  const vaga2 = repo.inserir("vagas", { empresa_id: emp.id, titulo: "Confeiteiro(a)", departamento_id: dep["Produção"].id, modalidade: "presencial", local: "Mooca", salario: "R$ 2.700", descricao: "Produção de bolos, tortas e doces finos.", requisitos: "Curso de confeitaria e 1 ano de experiência.", criada_em: ms(-9) });
  const vaga3 = repo.inserir("vagas", { empresa_id: emp.id, titulo: "Auxiliar de produção (madrugada)", departamento_id: dep["Produção"].id, modalidade: "presencial", local: "Mooca", salario: "R$ 1.900 + adicional noturno", descricao: "Apoio ao padeiro na produção dos pães.", status: "pausada", criada_em: ms(-60) });
  const candidatos = [
    ["Juliana Prado", vaga, "triagem", null, -1, "site"],
    ["Marcos Vieira", vaga, "triagem", null, 0, "linkedin"],
    ["Larissa Freitas", vaga, "triagem", null, -2, "indeed"],
    ["Rafael Teixeira", vaga, "entrevista", 4, -8, "site"],
    ["Sabrina Costa", vaga, "proposta", 5, -15, "indicacao"],
    ["Otávio Lima", vaga, "reprovado", 2, -16, "site"],
    ["Tiago Moreira", vaga2, "triagem", null, -1, "gupy"],
    ["Patrícia Gomes", vaga2, "teste", 3, -6, "linkedin"],
    ["Renata Duarte", vaga2, "entrevista", 4, -5, "site"],
    ["Wagner Pires", vaga3, "contratado", 5, -50, "whatsapp"],
  ];
  for (const [i, [nome, v, etapa, nota, d, origem]] of candidatos.entries()) {
    repo.inserir("candidatos", { empresa_id: emp.id, vaga_id: v.id, nome, email: `${nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@email.example`, telefone: `1199999${String(5001 + i * 41).padStart(4, "0")}`, cidade: "São Paulo", etapa, nota, origem, mensagem: etapa === "triagem" ? "Moro perto e tenho disponibilidade de horário." : null, criado_em: ms(d, "09:30"), atualizado_em: ms(Math.min(0, d + 2), "11:00") });
  }

  // Comunicados (com leituras)
  const proximoFeriado = [...feriadosNacionais(Number(hoje.slice(0, 4))), ...feriadosNacionais(Number(hoje.slice(0, 4)) + 1)].find((f) => f.data > hoje);
  const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const c1 = repo.inserir("comunicados", { empresa_id: emp.id, titulo: `Horário especial no feriado de ${dm(proximoFeriado.data)}`, texto: `${proximoFeriado.nome}: a loja abre das 7h às 13h. A escala de quem trabalha já está no app. Horas do feriado são pagas a 100%.`, fixado: true, autor: USUARIOS_DEMO.admin.nome, criado_em: ms(-1, "18:00") });
  const c2 = repo.inserir("comunicados", { empresa_id: emp.id, titulo: "Campanha de vacinação da gripe", texto: "Na próxima quinta, das 9h às 12h, na fábrica. Traga sua carteirinha de vacinação.", autor: USUARIOS_DEMO.admin.nome, criado_em: ms(-4, "10:00") });
  const c3 = repo.inserir("comunicados", { empresa_id: emp.id, titulo: `Holerite de ${M2.slice(5, 7)}/${M2.slice(0, 4)} disponível no app`, texto: "O holerite já está na aba Holerites do app Meu Ponto. Qualquer dúvida, fale com o RH.", autor: USUARIOS_DEMO.admin.nome, criado_em: instante(`${M1}-05`, "09:00") });
  for (const [c, k] of [[c1, 4], [c2, 7], [c3, 9]]) for (const col of colabs.slice(0, k)) repo.rodar("INSERT INTO comunicado_leituras (comunicado_id, colaborador_id, lido_em) VALUES (?,?,?)", c.id, col.id, c.criado_em + 3600_000);

  // Todo o time já usa o app de ponto, menos o novato (que tem convite pendente)
  for (const c of colabs) if (c.id !== henrique.id) repo.criarSessao(sha256(gerarToken()), { colaborador_id: c.id }, 90);

  // Convite do app para o novato (código mostrado no DEMO.md)
  repo.rodar("INSERT INTO convites_app (codigo_hash, colaborador_id, expira_em) VALUES (?,?,?)", sha256(`${henrique.id}:${CODIGO_APP_DEMO}`), henrique.id, agoraMs + 30 * 86400_000);

  repo.auditar(emp.id, "Nexor", "demonstracao_semeada", { competencias: [M2, M1, M0] });
  void admin;
  return { empresa_id: emp.id, colaborador_app_id: ana.id, marcacoes: repo.um("SELECT COUNT(*) n FROM marcacoes").n };
}

/** Apaga todos os dados do banco (usado no "Reiniciar demonstração") */
export function limparBanco(repo) {
  const tabelas = repo.todos("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((t) => t.name);
  repo.db.exec("PRAGMA foreign_keys = OFF");
  try {
    repo.transacao(() => {
      for (const t of tabelas) repo.db.exec(`DELETE FROM "${t}"`);
    });
  } finally {
    repo.db.exec("PRAGMA foreign_keys = ON");
  }
}
