// Cálculo da calculadora solar: dimensionamento, conta de luz pela Lei 14.300 e fluxo de caixa.
// Módulo puro (sem DOM), testado em testes/calculo.test.mjs.

export const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Consumo mínimo faturável (custo de disponibilidade), em kWh
export const DISPONIBILIDADE = { monofasico: 30, bifasico: 50, trifasico: 100 };

// Alíquota modal de ICMS sobre energia por UF (estimativa; varia por faixa de consumo em alguns estados)
export const ICMS_UF = {
  AC: 0.19, AL: 0.19, AM: 0.20, AP: 0.18, BA: 0.205, CE: 0.20, DF: 0.20, ES: 0.17, GO: 0.19,
  MA: 0.23, MG: 0.18, MS: 0.17, MT: 0.17, PA: 0.19, PB: 0.20, PE: 0.205, PI: 0.225, PR: 0.195,
  RJ: 0.22, RN: 0.20, RO: 0.195, RR: 0.20, RS: 0.17, SC: 0.17, SE: 0.20, SP: 0.18, TO: 0.20,
};

// Potências comerciais de inversor (kW)
export const INVERSORES_KW = [1.5, 2, 2.5, 3, 3.6, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 36, 40, 50, 60, 75];

// Preço de referência do sistema instalado (R$/Wp) por faixa de potência. Só é usado quando
// data/precos.json (coleta diária) não está disponível.
export const PRECO_WP_FAIXAS = [
  { ateKwp: 3, precoWp: 3.4 },
  { ateKwp: 5, precoWp: 3.0 },
  { ateKwp: 10, precoWp: 2.75 },
  { ateKwp: 20, precoWp: 2.55 },
  { ateKwp: Infinity, precoWp: 2.35 },
];

export const PREMISSAS_PADRAO = {
  anoInstalacao: new Date().getFullYear(),
  desempenho: 0.78,         // performance ratio: perdas de temperatura, cabos, inversor, sujeira
  simultaneidade: 0.30,     // parte da geração consumida na hora (não passa pela rede)
  cobertura: 1.0,           // parte do consumo anual que o sistema deve gerar
  potenciaModuloW: 600,
  areaModuloM2: 2.7,
  precoWp: null,            // preço total do orçamento; null = composição pelos preços de mercado
  estruturaWp: 0.30,        // estrutura, cabos, string box e proteções (R$/Wp)
  instalacao: 0.30,         // instalação, projeto, homologação e margem, sobre os equipamentos
  reajusteTarifa: 0.055,    // ao ano
  taxaDesconto: 0.12,       // custo de oportunidade ao ano
  degradacao: 0.005,        // perda de geração ao ano
  manutencao: 0.005,        // limpeza/manutenção por ano, fração do investimento
  trocaInversorAno: 12,
  trocaInversorFracao: 0.15, // custo da troca, fração do investimento
  anos: 25,
  pisCofins: 0.05,
};

// Parte do Fio B paga sobre a energia compensada (Lei 14.300, art. 27). A partir de 2029 vale a
// regra que a ANEEL ainda vai definir (art. 17); por prudência, 100%.
export function percentualFioB(ano) {
  if (ano <= 2022) return 0;
  const tabela = { 2023: 0.15, 2024: 0.30, 2025: 0.45, 2026: 0.60, 2027: 0.75, 2028: 0.90 };
  return tabela[ano] ?? 1;
}

// R$/MWh sem impostos -> R$/kWh com ICMS e PIS/COFINS ("por dentro")
export function comImpostos(rsMWh, icms, pisCofins) {
  return rsMWh / 1000 / (1 - icms - pisCofins);
}

export function precoWpReferencia(kwp) {
  return PRECO_WP_FAIXAS.find((f) => kwp <= f.ateKwp).precoWp;
}

export function geracaoMensal(kwp, hsp, desempenho) {
  return hsp.map((h, i) => kwp * h * DIAS_MES[i] * desempenho);
}

// Custo do sistema. `precos` = { moduloRsWp, inversorA, inversorB, inversorFator } (preços de mercado já
// resolvidos para as marcas escolhidas) ou null (usa a tabela de referência por porte).
export function custoSistema(kwp, inversorKw, precos, premissas) {
  const p = { ...PREMISSAS_PADRAO, ...premissas };
  let composicao = null;
  let total;
  if (precos) {
    const modulos = kwp * 1000 * precos.moduloRsWp;
    const inversor = precos.inversorA * inversorKw ** precos.inversorB * (precos.inversorFator ?? 1);
    const estrutura = kwp * 1000 * p.estruturaWp;
    const instalacao = (modulos + inversor + estrutura) * p.instalacao;
    composicao = { modulos, inversor, estrutura, instalacao };
    total = modulos + inversor + estrutura + instalacao;
  } else {
    total = kwp * 1000 * precoWpReferencia(kwp);
  }
  const calculado = total;
  if (p.precoWp) total = kwp * 1000 * p.precoWp;
  return { total, calculado, composicao, precoWp: total / (kwp * 1000), precoWpCalculado: calculado / (kwp * 1000) };
}

export function dimensionar({ consumo, hsp, premissas, precos = null }) {
  const p = { ...PREMISSAS_PADRAO, ...premissas };
  const consumoAnual = consumo.reduce((a, b) => a + b, 0);
  const geracaoPorKwp = geracaoMensal(1, hsp, p.desempenho).reduce((a, b) => a + b, 0);
  const kwpNecessario = (consumoAnual * p.cobertura) / geracaoPorKwp;
  const modulos = Math.max(1, Math.ceil((kwpNecessario * 1000) / p.potenciaModuloW));
  const kwp = (modulos * p.potenciaModuloW) / 1000;
  // inversor: menor potência comercial com relação CC/CA de até 1,3
  const inversorKw = INVERSORES_KW.find((s) => kwp / s <= 1.3) ?? Math.ceil(kwp / 1.3);
  const custo = custoSistema(kwp, inversorKw, precos, p);
  return {
    kwpNecessario, modulos, kwp, inversorKw,
    areaM2: modulos * p.areaModuloM2,
    precoWp: custo.precoWp,
    precoWpCalculado: custo.precoWpCalculado,
    composicao: custo.composicao,
    investimento: custo.total,
    geracao: geracaoMensal(kwp, hsp, p.desempenho),
  };
}

// Conta de um mês (só a parte de energia, sem iluminação pública e bandeiras)
function contaMes({ consumo, geracao, banco, tarifa, fioB, pctFioB, minimo, simultaneidade }) {
  const autoconsumo = Math.min(geracao * simultaneidade, consumo);
  const injetado = geracao - autoconsumo;
  const daRede = consumo - autoconsumo;
  const disponivel = banco + injetado;
  const compensado = Math.min(daRede, disponivel);
  let conta = (daRede - compensado) * tarifa + compensado * fioB * pctFioB;
  // art. 16 §1º: mínimo faturável só se o consumo medido (da rede) for menor que o mínimo
  if (daRede < minimo) conta = Math.max(conta, minimo * tarifa);
  return { conta, banco: disponivel - compensado, compensado, autoconsumo, injetado };
}

export function simular({ consumo, hsp, ligacao, tarifa, fioB, premissas, precos = null }) {
  const p = { ...PREMISSAS_PADRAO, ...premissas };
  const sis = dimensionar({ consumo, hsp, premissas: p, precos });
  const minimo = DISPONIBILIDADE[ligacao];
  const anos = [];
  let banco = 0;
  let acumulado = -sis.investimento;
  let acumuladoDesc = -sis.investimento;
  const fluxos = [-sis.investimento];
  let primeiroAno = null;

  for (let a = 1; a <= p.anos; a++) {
    const fatorTarifa = (1 + p.reajusteTarifa) ** (a - 1);
    const fatorGeracao = (1 - p.degradacao) ** (a - 1);
    const pct = percentualFioB(p.anoInstalacao + a - 1);
    let semSolar = 0, comSolar = 0, gerado = 0, compensado = 0, fioBPago = 0;
    const meses = [];
    for (let m = 0; m < 12; m++) {
      const t = tarifa * fatorTarifa;
      const sem = Math.max(consumo[m], minimo) * t;
      const r = contaMes({
        consumo: consumo[m], geracao: sis.geracao[m] * fatorGeracao, banco,
        tarifa: t, fioB: fioB * fatorTarifa, pctFioB: pct, minimo, simultaneidade: p.simultaneidade,
      });
      banco = r.banco;
      semSolar += sem;
      comSolar += r.conta;
      gerado += sis.geracao[m] * fatorGeracao;
      compensado += r.compensado;
      fioBPago += r.compensado * fioB * fatorTarifa * pct;
      meses.push({ semSolar: sem, comSolar: r.conta });
    }
    const manutencao = sis.investimento * p.manutencao * fatorTarifa;
    const troca = a === p.trocaInversorAno ? sis.investimento * p.trocaInversorFracao : 0;
    const fluxo = semSolar - comSolar - manutencao - troca;
    acumulado += fluxo;
    acumuladoDesc += fluxo / (1 + p.taxaDesconto) ** a;
    fluxos.push(fluxo);
    const linha = { ano: a, anoCalendario: p.anoInstalacao + a - 1, pctFioB: pct, semSolar, comSolar,
      gerado, compensado, fioBPago, manutencao, troca, fluxo, acumulado, acumuladoDesc };
    anos.push(linha);
    if (a === 1) primeiroAno = { ...linha, meses };
  }

  return {
    sistema: sis,
    minimo,
    anos,
    primeiroAno,
    economia25: anos.reduce((s, l) => s + l.semSolar - l.comSolar, 0),
    lucro25: acumulado,
    vpl: acumuladoDesc,
    tir: tir(fluxos),
    payback: payback(anos, "acumulado", sis.investimento),
    paybackDescontado: payback(anos, "acumuladoDesc", sis.investimento),
  };
}

// Anos (fracionários) até o acumulado ficar positivo; null se não pagar no horizonte
function payback(anos, campo, investimento) {
  let anterior = -investimento;
  for (const l of anos) {
    if (l[campo] >= 0) return l.ano - 1 + -anterior / (l[campo] - anterior);
    anterior = l[campo];
  }
  return null;
}

export function tir(fluxos) {
  const vpl = (r) => fluxos.reduce((s, f, i) => s + f / (1 + r) ** i, 0);
  let lo = -0.99, hi = 10;
  if (vpl(lo) * vpl(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (vpl(lo) * vpl(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
