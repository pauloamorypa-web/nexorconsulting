/* Regras de prazo: feriados, dias úteis, vencimentos de cada tipo e leitura conferida por código. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { OBRIGACOES_PADRAO } from "../src/regras/catalogo.js";
import { ajustar, diaUtil, enesimoDiaUtil, feriadosNacionais, somarMeses, ultimoDiaUtil } from "../src/regras/datas.js";
import { aplicaNaCompetencia, obrigacaoServe, prazoInterno, prazoLegal } from "../src/regras/geracao.js";
import { chaveAprendizado, cnpjValido, conferir, sugerirLancamentos } from "../src/ia/leitura.js";
import { mesmoFone } from "../src/servicos/canais.js";
import { CONTAS_PADRAO } from "../src/regras/catalogo.js";

const ob = (codigo) => ({ ...OBRIGACOES_PADRAO.find((o) => o.codigo === codigo), ativo: true });

test("feriados nacionais: fixos, Consciência Negra e Sexta-feira Santa móvel", () => {
  const f = feriadosNacionais(2026);
  assert.ok(f.has("2026-11-20"));
  assert.ok(f.has("2026-04-03"), "Páscoa 2026 é 05/04: Sexta Santa 03/04");
  assert.ok(feriadosNacionais(2027).has("2027-03-26"), "Páscoa 2027 é 28/03");
  assert.equal(diaUtil("2026-11-21"), false, "sábado");
  assert.equal(diaUtil("2026-11-23"), true);
});

test("ajustes de vencimento e dias úteis", () => {
  assert.equal(ajustar("2026-11-15", "antecipa"), "2026-11-13");
  assert.equal(ajustar("2026-11-15", "posterga"), "2026-11-16");
  assert.equal(ajustar("2026-11-15", "nenhum"), "2026-11-15");
  assert.equal(enesimoDiaUtil("2026-12", 10), "2026-12-14");
  assert.equal(ultimoDiaUtil("2027-01"), "2027-01-29");
  assert.equal(somarMeses("2026-12", 2), "2027-02");
});

test("prazos das obrigações padrão", () => {
  assert.equal(prazoLegal(ob("DAS"), "2026-10"), "2026-11-23");
  assert.equal(prazoLegal(ob("PIS_COFINS"), "2026-10"), "2026-11-25");
  assert.equal(prazoLegal(ob("EFD_CONTRIB"), "2026-10"), "2026-12-14", "10º dia útil do 2º mês");
  assert.equal(prazoLegal(ob("IRPJ_CSLL"), "2026-09"), "2026-10-30", "último dia útil do mês seguinte ao trimestre");
  assert.equal(aplicaNaCompetencia(ob("IRPJ_CSLL"), "2026-10"), false);
  assert.equal(prazoLegal(ob("DEFIS"), "2026-12"), "2027-03-31");
  assert.equal(prazoLegal(ob("DASN_SIMEI"), "2026-12"), "2027-05-31");
  assert.equal(prazoLegal(ob("ECF"), "2026-12"), "2027-07-30");
  assert.equal(prazoInterno("2026-11-23", 3), "2026-11-19", "3 dias antes cai no feriado de 20/11: antecipa para 19/11");
});

test("obrigação só para quem se encaixa (regime e condições)", () => {
  const cli = { regime: "simples", tem_funcionarios: false, contribuinte_icms: false, presta_servico: true };
  assert.equal(obrigacaoServe(ob("DAS"), cli), true);
  assert.equal(obrigacaoServe(ob("FGTS"), cli), false, "sem funcionários, sem FGTS");
  assert.equal(obrigacaoServe(ob("FGTS"), { ...cli, tem_funcionarios: true }), true);
  assert.equal(obrigacaoServe(ob("PIS_COFINS"), cli), false);
  assert.equal(obrigacaoServe(ob("EFD_ICMS"), { ...cli, regime: "presumido" }), false, "só contribuinte de ICMS");
});

test("conferência e sugestões de lançamento", () => {
  assert.equal(cnpjValido("45723174000110"), true);
  assert.equal(cnpjValido("45723174000111"), false);
  assert.equal(cnpjValido("52998224725"), true, "CPF também");
  const cliente = { cnpj: "45723174000110" };
  const saida = { tipo: "nota_fiscal_entrada", emitente_cnpj: "45723174000110", destinatario_cnpj: "19131243000197", valor_total: 100, confianca: "alta", movimentos: [], observacoes: null };
  assert.ok(conferir(saida, cliente).some((a) => a.includes("pode ser nota de saída")));
  const sug = sugerirLancamentos({ ...saida, tipo: "nota_fiscal_saida", data_emissao: "2026-10-10", numero: "55", destinatario_nome: "Mercado" }, cliente, CONTAS_PADRAO, () => null);
  assert.equal(sug[0].debito, CONTAS_PADRAO.clientes);
  assert.equal(sug[0].credito, CONTAS_PADRAO.receita);
  assert.equal(sug[0].chave, "CNPJ:19131243000197");
  assert.equal(chaveAprendizado("PIX ENVIADO - Distribuidora Água"), "PIX ENVIADO DISTRIBUIDORA");
});

test("WhatsApp com e sem o 9", () => {
  assert.equal(mesmoFone("5534999990001", "553499990001"), true);
  assert.equal(mesmoFone("(34) 99999-0001", "5534999990001"), true);
  assert.equal(mesmoFone("5534999990001", "5511999990001"), false, "DDD diferente");
});
