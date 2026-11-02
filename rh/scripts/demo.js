/* Dados de demonstração (empresa fictícia "Padaria Pão Dourado"): colaboradores, um mês de marcações,
   pedidos pendentes, folha fechada, eventos do eSocial, vagas e comunicados.
   Uso: DATA_DIR=./data node --disable-warning=ExperimentalWarning scripts/demo.js
   Login do painel: demo@nexorrh.com.br / demo12345 */

import { join } from "node:path";
import { lerConfig } from "../src/config.js";
import { abrirBanco } from "../src/db.js";
import { criarCofre, gerarHashSenha, gerarToken, sha256 } from "../src/seguranca.js";
import { criarNucleo } from "../src/servicos/nucleo.js";
import { dataLocal, diaSemana, instante, somarDias } from "../src/ponto/calendario.js";
import { previstoNoDia } from "../src/ponto/espelho.js";
import { registrarMarcacao } from "../src/ponto/registro.js";

const cfg = lerConfig();
const repo = abrirBanco(join(cfg.pastaDados, "rh.db"));
const cofre = criarCofre(cfg);
const nucleo = criarNucleo({ repo, cofre, cfg });

if (repo.usuarioPorEmail("demo@nexorrh.com.br")) {
  console.log("A demonstração já existe neste banco.");
  process.exit(0);
}

// CPF válido a partir de 9 dígitos
const cpf = (base) => {
  const d = String(base).padStart(9, "0").split("").map(Number);
  for (const n of [9, 10]) {
    const s = d.slice(0, n).reduce((a, x, i) => a + x * (n + 1 - i), 0);
    d.push(((s * 10) % 11) % 10);
  }
  return d.join("");
};

let semente = 7;
const aleatorio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const variar = (min) => Math.round((aleatorio() - 0.5) * 2 * min);

const emp = repo.inserir("empresas", { razao_social: "Padaria Pão Dourado Ltda", nome_fantasia: "Pão Dourado", cnpj: "11222333000181", endereco: { logradouro: "Av. Paulista, 1000", cidade: "São Paulo", uf: "SP" }, config: { registro_inpi: "BR512026000123-4", esocial: { ambiente: 2, class_trib: "01", cnae: "1091102", fpas: "507", rat: "2", fap: "1.0000" } } });
repo.inserir("usuarios", { empresa_id: emp.id, nome: "Marina Souza", email: "demo@nexorrh.com.br", senha_hash: gerarHashSenha("demo12345"), papel: "admin" });
const loja = repo.inserir("estabelecimentos", { empresa_id: emp.id, nome: "Loja Paulista", cnpj: "11222333000181", lat: -23.5649, lng: -46.6519, raio_m: 120, exige_gps: true, qr_segredo: gerarToken(32) });
const fabrica = repo.inserir("estabelecimentos", { empresa_id: emp.id, nome: "Fábrica Mooca", lat: -23.5585, lng: -46.5986, raio_m: 200, exige_gps: true, qr_segredo: gerarToken(32) });
const dep = Object.fromEntries(["Atendimento", "Produção", "Administrativo"].map((n) => [n, repo.inserir("departamentos", { empresa_id: emp.id, nome: n })]));
const cargo = Object.fromEntries(
  [
    ["Atendente de balcão", "521140", 210000],
    ["Padeiro", "848305", 260000],
    ["Confeiteira", "848310", 270000],
    ["Auxiliar de produção", "784205", 190000],
    ["Analista administrativo", "411010", 380000],
    ["Gerente de loja", "141410", 650000],
  ].map(([n, cbo, s]) => [n, repo.inserir("cargos", { empresa_id: emp.id, nome: n, cbo, salario_centavos: s })]),
);
const seg = (e, s, i) => Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, { entrada: e, saida: s, intervalo_min: i }]));
const comercial = repo.inserir("jornadas", { empresa_id: emp.id, nome: "Comercial 44h (seg a sex)", dias: seg("08:00", "17:48", 60), horas_semanais: 44 });
const loja6x1 = repo.inserir("jornadas", { empresa_id: emp.id, nome: "Loja 6x1 (seg a sáb 7h–15h20)", dias: { ...seg("07:00", "15:20", 60), 6: { entrada: "07:00", saida: "15:20", intervalo_min: 60 } }, horas_semanais: 44, banco_horas: true });
const madrugada = repo.inserir("jornadas", { empresa_id: emp.id, nome: "Produção madrugada (22h–6h)", dias: { ...seg("22:00", "06:00", 60), 6: { entrada: "22:00", saida: "04:00", intervalo_min: 15 } }, horas_semanais: 44 });

const pessoas = [
  ["Ana Beatriz Lima", "F", "1994-11-14", "Atendente de balcão", "Atendimento", loja6x1, loja, "2023-03-06"],
  ["Bruno Carvalho", "M", "1988-02-20", "Padeiro", "Produção", madrugada, fabrica, "2021-08-02"],
  ["Camila Rocha", "F", "1991-11-02", "Confeiteira", "Produção", comercial, fabrica, "2022-01-10"],
  ["Diego Fernandes", "M", "1999-06-30", "Auxiliar de produção", "Produção", madrugada, fabrica, "2026-09-15"],
  ["Eduarda Martins", "F", "1996-04-08", "Atendente de balcão", "Atendimento", loja6x1, loja, "2025-10-20"],
  ["Felipe Andrade", "M", "1985-09-12", "Gerente de loja", "Atendimento", comercial, loja, "2019-05-13"],
  ["Gabriela Nunes", "F", "1993-12-01", "Analista administrativo", "Administrativo", comercial, loja, "2024-07-01"],
  ["Henrique Alves", "M", "2001-01-25", "Atendente de balcão", "Atendimento", loja6x1, loja, "2026-10-19"],
];
const colabs = pessoas.map(([nome, sexo, nasc, c, d, j, e, adm], i) =>
  repo.inserir("colaboradores", { empresa_id: emp.id, matricula: String(i + 1).padStart(5, "0"), nome, sexo, nascimento: nasc, cpf: cpf(123450000 + i * 7919), email: `${nome.split(" ")[0].toLowerCase()}@paodourado.com.br`, telefone: `1199${String(1000000 + i * 13579).slice(0, 7)}`, admissao: adm, cargo_id: cargo[c].id, departamento_id: dep[d].id, jornada_id: j.id, estabelecimento_id: e.id, salario_centavos: cargo[c].salario_centavos, insalubridade_pct: d === "Produção" ? 20 : 0, endereco: { logradouro: "Rua das Flores", numero: String(100 + i), bairro: "Centro", cep: "01001000", cidade: "São Paulo", uf: "SP", cod_municipio: "3550308" }, raca_cor: "parda", escolaridade: "medio", estado_civil: "solteiro" }),
);
// Férias já gozadas: todos os períodos completos, menos o mais recente (que fica para programar)
for (const c of colabs) {
  let ini = c.admissao;
  const periodos = [];
  while (somarDias(somarDias(ini, 365), -1) <= "2026-10-31") {
    periodos.push([ini, somarDias(somarDias(ini, 365), -1)]);
    ini = somarDias(ini, 365);
  }
  for (const [a, b] of periodos.slice(0, -1)) repo.inserir("ferias", { empresa_id: emp.id, colaborador_id: c.id, aquisitivo_inicio: a, aquisitivo_fim: b, inicio: somarDias(b, 60), dias: 30, status: "aprovada", solicitado_por: "RH" });
}
const empresaCompleta = nucleo.empresa(emp.id);
for (const c of colabs) nucleo.esocial.admissao(empresaCompleta, c);
repo.inserir("dependentes", { empresa_id: emp.id, colaborador_id: colabs[1].id, nome: "Lucas Carvalho", parentesco: "filho", nascimento: "2017-05-03", irrf: true, salario_familia: true });
const vt = repo.inserir("beneficios", { empresa_id: emp.id, nome: "Vale-transporte", tipo: "vt", valor_centavos: 22000 });
const vr = repo.inserir("beneficios", { empresa_id: emp.id, nome: "Vale-refeição", tipo: "vr", valor_centavos: 55000, desconto_tipo: "percentual", desconto_valor: 10 });
for (const c of colabs) repo.definirBeneficios(c.id, [{ beneficio_id: vt.id }, { beneficio_id: vr.id }]);

// Dois meses de marcações (setembro/2026 até hoje), com biometria, QR e pequenas variações
const hoje = dataLocal(Date.now());
const feriados = nucleo.feriados(emp.id, 2026);
const agoraMs = Date.now();
for (let d = "2026-09-01"; d <= hoje; d = somarDias(d, 1)) {
  for (const [i, c] of colabs.entries()) {
    if (d < c.admissao) continue;
    const j = repo.obter("jornadas", emp.id, c.jornada_id);
    const p = previstoNoDia(j, d);
    const trabalhaFeriado = feriados.has(d) && [0, 4, 7].includes(i);
    if (!p || (feriados.has(d) && !trabalhaFeriado)) continue;
    if (aleatorio() < 0.035) continue; // falta
    const [hE, mE] = p.entrada.split(":").map(Number);
    const ini = instante(d, p.entrada) + variar(6) * 60_000 + (aleatorio() < 0.06 ? 25 * 60_000 : 0);
    let fimPrev = instante(d, p.saida);
    if (fimPrev <= instante(d, p.entrada)) fimPrev += 86400_000;
    const fim = fimPrev + variar(8) * 60_000 + (aleatorio() < 0.15 ? Math.round(aleatorio() * 90) * 60_000 : 0);
    const meio = ini + Math.round((fim - ini) / 2) - 30 * 60_000;
    const volta = meio + (p.intervalo_min + variar(4)) * 60_000;
    const esquecer = aleatorio() < 0.03;
    const horarios = [ini, ...(p.intervalo_min && !esquecer ? [meio, volta] : []), fim].filter((t) => t <= agoraMs);
    for (const t of horarios) {
      const qr = c.estabelecimento_id === loja.id && aleatorio() < 0.4;
      registrarMarcacao(repo, { empresa_id: emp.id, colaborador: c, origem: qr ? "app_qr" : "app", lat: qr ? null : -23.5649 + variar(3) / 100000, lng: qr ? null : -46.6519 + variar(3) / 100000, precisao: 12, distancia_m: qr ? null : 8 + Math.round(aleatorio() * 40), estabelecimento_id: c.estabelecimento_id, biometria: i % 3 !== 2, qr, aparelho: i % 2 ? "iPhone" : "Android", agora: t });
    }
    void hE, mE, diaSemana;
  }
}

// Pedidos pendentes do app
repo.inserir("ajustes", { empresa_id: emp.id, colaborador_id: colabs[4].id, data: "2026-10-27", tipo: "inclusao", horario: "15:22", motivo: "Meu celular descarregou na saída." });
repo.inserir("ajustes", { empresa_id: emp.id, colaborador_id: colabs[3].id, data: "2026-10-22", tipo: "abono", motivo: "Levei meu filho ao pediatra, tenho declaração." });
repo.inserir("ferias", { empresa_id: emp.id, colaborador_id: colabs[1].id, aquisitivo_inicio: "2024-08-02", aquisitivo_fim: "2025-08-01", inicio: "2026-12-07", dias: 20, abono_dias: 10, status: "solicitada", solicitado_por: colabs[1].nome });
repo.inserir("afastamentos", { empresa_id: emp.id, colaborador_id: colabs[0].id, motivo: "03", inicio: "2026-10-29", fim: "2026-10-30", observacao: "Gripe", status: "pendente", enviado_por: colabs[0].nome });

// Folha de setembro fechada (holerites no app) e outubro calculada
for (const comp of ["2026-09"]) {
  const f = nucleo.calcularFolha(empresaCompleta, comp);
  const fechada = repo.atualizar("folhas", emp.id, f.id, { status: "fechada", fechada_em: Date.now(), totais: { ...f.totais, data_pagamento: "2026-10-05" } });
  nucleo.esocial.folha(empresaCompleta, fechada, "2026-10-05");
}
nucleo.calcularFolha(empresaCompleta, "2026-10");

// Recrutamento
const vaga = repo.inserir("vagas", { empresa_id: emp.id, titulo: "Atendente de balcão (manhã)", departamento_id: dep.Atendimento.id, modalidade: "presencial", local: "Av. Paulista", salario: "R$ 2.100 + VT + VR", descricao: "Atendimento ao cliente, caixa e reposição.\nEscala 6x1, das 7h às 15h20.", requisitos: "Ensino médio completo. Experiência com atendimento é um diferencial." });
const vaga2 = repo.inserir("vagas", { empresa_id: emp.id, titulo: "Confeiteiro(a)", departamento_id: dep["Produção"].id, modalidade: "presencial", local: "Mooca", salario: "R$ 2.700", descricao: "Produção de bolos, tortas e doces finos." });
for (const [n, v, etapa, nota] of [["Juliana Prado", vaga, "triagem", null], ["Rafael Teixeira", vaga, "entrevista", 4], ["Sabrina Costa", vaga, "proposta", 5], ["Tiago Moreira", vaga2, "triagem", null], ["Patrícia Gomes", vaga2, "teste", 3], ["Otávio Lima", vaga, "reprovado", 2]]) repo.inserir("candidatos", { empresa_id: emp.id, vaga_id: v.id, nome: n, email: `${n.split(" ")[0].toLowerCase()}@email.com`, telefone: "11988887777", cidade: "São Paulo", etapa, nota });

repo.inserir("comunicados", { empresa_id: emp.id, titulo: "Horário especial no feriado de 20 de novembro", texto: "A loja abre das 7h às 13h. A escala de quem trabalha já está no app. Horas do feriado são pagas a 100%.", fixado: true, autor: "Marina Souza" });
repo.inserir("comunicados", { empresa_id: emp.id, titulo: "Campanha de vacinação da gripe", texto: "Na próxima quinta, das 9h às 12h, na fábrica. Traga sua carteirinha de vacinação.", autor: "Marina Souza" });

// Convite de app para quem ainda não ativou (código mostrado no console)
const codigo = "246810";
repo.rodar("INSERT INTO convites_app (codigo_hash, colaborador_id, expira_em) VALUES (?,?,?)", sha256(`${colabs[0].id}:${codigo}`), colabs[0].id, Date.now() + 7 * 86400_000);

const total = repo.um("SELECT COUNT(*) n FROM marcacoes").n;
console.log(`Demonstração criada: ${colabs.length} colaboradores, ${total} marcações.`);
console.log("Painel: demo@nexorrh.com.br / demo12345");
console.log(`App do trabalhador: CPF ${colabs[0].cpf} · código ${codigo}`);
repo.fechar();
