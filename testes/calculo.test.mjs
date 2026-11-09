// node --test testes/
import test from "node:test";
import assert from "node:assert/strict";
import { simular, dimensionar, custoSistema, percentualFioB, comImpostos, tir, DIAS_MES } from "../js/calculo.js";

const HSP_POA = [6.53, 5.96, 5.05, 3.93, 2.9, 2.42, 2.64, 3.31, 3.99, 5.04, 6.3, 6.73]; // NASA POWER, Porto Alegre
const consumo = Array(12).fill(400);
const base = { consumo, hsp: HSP_POA, ligacao: "monofasico", tarifa: comImpostos(944.61, 0.17, 0.05), fioB: comImpostos(300.4, 0.17, 0.05) };

test("Fio B escalonado da Lei 14.300", () => {
  assert.equal(percentualFioB(2022), 0);
  assert.equal(percentualFioB(2026), 0.6);
  assert.equal(percentualFioB(2028), 0.9);
  assert.equal(percentualFioB(2030), 1);
});

test("dimensionamento gera o consumo anual", () => {
  const s = dimensionar({ consumo, hsp: HSP_POA, premissas: {} });
  const gerado = s.geracao.reduce((a, b) => a + b, 0);
  assert.ok(gerado >= 4800 && gerado < 4800 * 1.15, `gerado ${gerado}`);
  assert.equal(s.kwp, (s.modulos * 600) / 1000);
  assert.ok(s.kwp / s.inversorKw <= 1.3);
});

test("conta com solar menor que sem solar e acima de zero (Fio B)", () => {
  const r = simular({ ...base, premissas: { anoInstalacao: 2026 } });
  const a1 = r.primeiroAno;
  assert.ok(a1.comSolar < a1.semSolar * 0.35, `com ${a1.comSolar} sem ${a1.semSolar}`);
  assert.ok(a1.comSolar > 0);
  assert.ok(r.payback > 2 && r.payback < 8, `payback ${r.payback}`);
  assert.ok(r.paybackDescontado > r.payback);
});

test("sem Fio B e geração total, a conta cai ao mínimo só se o consumo da rede for baixo", () => {
  const r = simular({ ...base, fioB: 0, premissas: { anoInstalacao: 2026, simultaneidade: 0 } });
  // consumo da rede (400) acima do mínimo: não paga disponibilidade, conta ~0 nos meses cobertos
  assert.ok(r.primeiroAno.comSolar < base.tarifa * 400 * 12 * 0.12);
});

test("custo pelos preços de mercado e pelo orçamento", () => {
  const precos = { moduloRsWp: 1.2, inversorA: 678, inversorB: 0.93, inversorFator: 1 };
  const c = custoSistema(5, 4, precos, { estruturaWp: 0.3, instalacao: 0.3 });
  const equip = 5000 * 1.2 + 678 * 4 ** 0.93 + 5000 * 0.3;
  assert.ok(Math.abs(c.total - equip * 1.3) < 1e-6);
  assert.equal(c.total, c.calculado);
  const o = custoSistema(5, 4, precos, { precoWp: 3 });
  assert.equal(o.total, 15000);
  assert.ok(o.calculado !== o.total);
  assert.equal(custoSistema(5, 4, null, {}).composicao, null); // sem dados de mercado: referência
});

test("TIR de fluxo conhecido", () => {
  assert.ok(Math.abs(tir([-100, 110]) - 0.1) < 1e-6);
  assert.equal(DIAS_MES.reduce((a, b) => a + b, 0), 365);
});
