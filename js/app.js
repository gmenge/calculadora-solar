import { simular, comImpostos, percentualFioB, ICMS_UF, PREMISSAS_PADRAO, DISPONIBILIDADE } from "./calculo.js";
import { buscarCep, buscarIrradiacao, carregarTarifas, carregarPrecos, distribuidorasDoMunicipio } from "./dados.js";
import { t, idioma, localeAtual, definirIdioma, aplicarTextos, IDIOMAS } from "./i18n.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const form = $("#form");

// Formatação pelo idioma (a moeda continua sendo o real)
let brl, brl2, n0, n1, n2, curto, fmtData, meses;
function criarFormatos() {
  const l = localeAtual();
  brl = new Intl.NumberFormat(l, { style: "currency", currency: "BRL", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 });
  brl2 = new Intl.NumberFormat(l, { style: "currency", currency: "BRL", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  n0 = new Intl.NumberFormat(l, { maximumFractionDigits: 0 });
  n1 = new Intl.NumberFormat(l, { maximumFractionDigits: 1 });
  n2 = new Intl.NumberFormat(l, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  curto = new Intl.NumberFormat(l, { notation: "compact", maximumFractionDigits: 1 });
  fmtData = new Intl.DateTimeFormat(l, { day: "2-digit", month: "2-digit", year: "numeric" });
  const fm = new Intl.DateTimeFormat(l, { month: "short" });
  meses = Array.from({ length: 12 }, (_, i) => {
    const m = fm.format(new Date(2026, i, 15)).replace(".", "");
    return m.charAt(0).toUpperCase() + m.slice(1);
  });
}
const pct = (v, d = 0) => `${(v * 100).toLocaleString(localeAtual(), { maximumFractionDigits: d })}%`;
const data = (iso) => fmtData.format(new Date(`${iso.slice(0, 10)}T12:00:00`));
const sem00 = (s) => s.replace(/[,.]00$/, "");

const CHAVE = "calculadora-solar:v2";
const CHAVE_TEMA = "calculadora-solar:tema";

const estado = {
  local: null,        // { cep, cidade, uf, ibge, lat, lon }
  hsp: null,          // 12 valores
  tarifas: null,      // data/tarifas.json
  precos: null,       // data/precos.json (coleta diária) ou null
  tarifaManual: false,
  mesAMes: false,
  abaMensal: "energia",
  ultimo: null,       // último resultado (padrões exibidos nas premissas)
  inicial: {},        // valores salvos ou do link, usados uma vez (distribuidora e marcas)
  status: null,       // última mensagem do local { texto, vars, tipo }
};

// ---------- premissas: definição única (gera a gaveta, a leitura e o contador) ----------

const PREMISSAS_UI = [
  { grupo: "Sistema", campos: [
    { nome: "potenciaModuloW", rotulo: "Potência do módulo", unidade: "W", min: 100, max: 900, step: 5,
      explica: "Módulos residenciais atuais ficam entre 550 e 620 W." },
    { nome: "desempenho", rotulo: "Desempenho do sistema", unidade: "%", pct: true, min: 50, max: 95, step: 1,
      explica: "Perdas por calor, cabos, inversor e sujeira. O usual fica entre 75% e 82%." },
    { nome: "cobertura", rotulo: "Cobertura do consumo", unidade: "%", pct: true, min: 10, max: 130, step: 5,
      explica: "Quanto do consumo anual o sistema deve gerar." },
    { nome: "simultaneidade", rotulo: "Consumo durante o dia", unidade: "%", pct: true, min: 0, max: 100, step: 5,
      explica: "Parte da geração usada na hora, sem passar pela rede (não paga Fio B). Casa vazia de dia: 20% a 30%." },
    { nome: "degradacao", rotulo: "Perda de geração por ano", unidade: "%", pct: true, min: 0, max: 3, step: 0.1,
      explica: "Envelhecimento dos módulos. Os fabricantes garantem perdas de 0,4% a 0,55% ao ano." },
  ] },
  { grupo: "Custos", campos: [
    { nome: "precoWp", rotulo: "Preço do seu orçamento", unidade: "R$/Wp", min: 0, max: 20, step: 0.05, vazio: true,
      explica: "Tem orçamento? Divida o valor total pela potência em Wp. Vazio: preços de mercado coletados." },
    { nome: "estruturaWp", rotulo: "Estrutura, cabos e proteções", unidade: "R$/Wp", min: 0, max: 3, step: 0.05,
      explica: "Suportes do telhado, cabos, conectores, string box e disjuntores." },
    { nome: "instalacao", rotulo: "Instalação, projeto e margem", unidade: "%", pct: true, min: 0, max: 150, step: 5,
      explica: "Mão de obra, projeto, homologação na distribuidora e margem do instalador, sobre os equipamentos." },
    { nome: "manutencao", rotulo: "Manutenção por ano", unidade: "%", pct: true, min: 0, max: 5, step: 0.1,
      explica: "Limpeza e revisões, em proporção ao investimento." },
    { nome: "trocaInversorAno", rotulo: "Troca do inversor no ano", unidade: "ano", min: 0, max: 30, step: 1,
      explica: "Inversores duram de 10 a 15 anos. Use 0 para não considerar a troca." },
    { nome: "trocaInversorFracao", rotulo: "Custo da troca", unidade: "%", pct: true, min: 0, max: 50, step: 1,
      explica: "Em proporção ao investimento inicial." },
  ] },
  { grupo: "Financeiro", campos: [
    { nome: "anoInstalacao", rotulo: "Ano da instalação", unidade: "", min: 2023, max: 2040, step: 1,
      explica: "Define a parte do Fio B paga em cada ano, pela Lei 14.300." },
    { nome: "anos", rotulo: "Horizonte da análise", unidade: "anos", min: 5, max: 30, step: 1,
      explica: "Vida útil considerada. Os módulos têm garantia de 25 a 30 anos." },
    { nome: "reajusteTarifa", rotulo: "Reajuste da tarifa", unidade: "% a.a.", pct: true, min: 0, max: 30, step: 0.5,
      explica: "A tarifa tem subido acima da inflação nos últimos anos." },
    { nome: "taxaDesconto", rotulo: "Taxa de desconto", unidade: "% a.a.", pct: true, min: 0, max: 50, step: 0.5,
      explica: "Quanto o dinheiro renderia em outra aplicação. Usada no VPL e no retorno descontado." },
  ] },
  { grupo: "Impostos na tarifa", campos: [
    { nome: "icms", rotulo: "ICMS", unidade: "%", pct: true, min: 0, max: 40, step: 0.5, vazio: true,
      explica: "Vazio: alíquota padrão do estado do CEP. Alguns estados cobram por faixa de consumo." },
    { nome: "pisCofins", rotulo: "PIS/COFINS", unidade: "%", pct: true, min: 0, max: 15, step: 0.1,
      explica: "Muda todo mês na conta; em média fica entre 4% e 6%." },
  ] },
];
const CAMPOS = PREMISSAS_UI.flatMap((g) => g.campos);
const campoPremissa = (nome) => $(`#campos-premissas [name="${nome}"]`);

function padraoDe(c) {
  if (c.nome === "icms") return ICMS_UF[estado.local?.uf] ?? null;
  if (c.nome === "precoWp") return estado.ultimo ? estado.ultimo.sistema.precoWpCalculado : null;
  return PREMISSAS_PADRAO[c.nome];
}
const paraCampo = (c, v) => (c.pct ? +(v * 100).toFixed(2) : v);
const doCampo = (c, v) => (c.pct ? v / 100 : v);

function montarPremissas() {
  const valores = $("#campos-premissas").children.length ? lerPremissasBrutas() : null;
  $("#campos-premissas").innerHTML = PREMISSAS_UI.map((g) => `
    <section class="grupo"><h3>${t(g.grupo)}</h3>
      ${g.campos.map((c) => `
        <div class="premissa" data-premissa="${c.nome}">
          <label for="p-${c.nome}">${t(c.rotulo)}</label>
          <div class="valor-campo">
            <div class="campo-unidade"><input id="p-${c.nome}" name="${c.nome}" type="number" inputmode="decimal"
              min="${c.min}" max="${c.max}" step="${c.step}"><span>${t(c.unidade)}</span></div>
            <span class="padrao"></span>
          </div>
          <p class="explica">${t(c.explica)}</p>
        </div>`).join("")}
    </section>`).join("");
  if (valores) for (const [nome, v] of Object.entries(valores)) campoPremissa(nome).value = v;
}

function lerPremissasBrutas() {
  return Object.fromEntries(CAMPOS.map((c) => [c.nome, campoPremissa(c.nome).value]));
}

function preencherPremissas(valores) {
  for (const c of CAMPOS) {
    const v = valores[c.nome];
    campoPremissa(c.nome).value = v === null || v === undefined ? "" : paraCampo(c, v);
  }
  marcarPremissas();
}

function lerPremissas() {
  const p = {};
  for (const c of CAMPOS) {
    const el = campoPremissa(c.nome);
    if (el.value === "") continue;
    const v = Number(el.value);
    if (Number.isFinite(v)) p[c.nome] = doCampo(c, v);
  }
  return p;
}

// Marca as alteradas, mostra o padrão de cada uma e atualiza o contador
function marcarPremissas() {
  let alteradas = 0;
  for (const c of CAMPOS) {
    const el = campoPremissa(c.nome);
    const linha = el.closest(".premissa");
    const padrao = padraoDe(c);
    const temPadrao = padrao !== null && padrao !== undefined;
    const atual = el.value === "" ? null : doCampo(c, Number(el.value));
    const alterada = atual !== null && (!temPadrao || Math.abs(atual - padrao) > 1e-9);
    linha.classList.toggle("alterada", alterada);
    linha.dataset.rotuloAlterada = t("alterada");
    if (alterada) alteradas++;
    linha.querySelector(".padrao").innerHTML = alterada
      ? `<button type="button" class="link" data-restaurar="${c.nome}">${t("restaurar")}</button>`
      : temPadrao ? t("padrão {v}", { v: c.step >= 1 ? String(paraCampo(c, padrao)) : sem00(n2.format(paraCampo(c, padrao))) }) : "";
    if (c.vazio) el.placeholder = temPadrao ? sem00(n2.format(paraCampo(c, padrao))) : t("auto");
  }
  const cont = $("#contador-premissas");
  cont.hidden = alteradas === 0;
  cont.textContent = t(alteradas === 1 ? "{n} alterada" : "{n} alteradas", { n: alteradas });
}

function icmsAtual() {
  const v = campoPremissa("icms").value;
  if (v !== "") return Number(v) / 100;
  return ICMS_UF[estado.local?.uf] ?? 0.18;
}

function abrirPremissas(abrir) {
  $("#premissas").hidden = !abrir;
  $("#abrir-premissas").setAttribute("aria-expanded", String(abrir));
  document.body.style.overflow = abrir ? "hidden" : "";
  if (abrir) { marcarPremissas(); campoPremissa(CAMPOS[0].nome).focus(); } else $("#abrir-premissas").focus();
}

// ---------- consumo ----------

function montarMeses() {
  const valores = $$("[data-mes]").map((el) => el.value);
  $("#meses").innerHTML = meses.map((m, i) =>
    `<label>${m}<input type="number" min="0" step="1" inputmode="numeric" data-mes="${i}" value="${valores[i] ?? ""}"></label>`).join("");
}

function lerConsumo() {
  if (estado.mesAMes) {
    const vals = $$("[data-mes]").map((el) => Number(el.value));
    const validos = vals.filter((v) => v > 0);
    if (!validos.length) return null;
    const media = validos.reduce((a, b) => a + b, 0) / validos.length;
    return vals.map((v) => (v > 0 ? v : media)); // meses vazios recebem a média
  }
  const c = Number(form.elements.consumo.value);
  return c > 0 ? Array(12).fill(c) : null;
}

function textoAlternarMeses() {
  $("#alternar-meses").textContent = t(estado.mesAMes ? "Usar a média" : "Informar mês a mês");
}

function alternarMeses() {
  estado.mesAMes = !estado.mesAMes;
  $("#meses").hidden = !estado.mesAMes;
  form.elements.consumo.disabled = estado.mesAMes;
  textoAlternarMeses();
  if (estado.mesAMes && form.elements.consumo.value) {
    $$("[data-mes]").forEach((el) => { if (!el.value) el.value = form.elements.consumo.value; });
  }
  salvar();
  calcular();
}

// ---------- distribuidora e tarifa ----------

function distribuidoraAtual() {
  const cnpj = form.elements.distribuidora.value;
  return estado.tarifas?.distribuidoras.find((d) => d.cnpj === cnpj) ?? null;
}

function atualizarTarifa() {
  const d = distribuidoraAtual();
  const det = $("#detalhe-tarifa");
  $("#tarifa-aneel").hidden = !estado.tarifaManual || !d;
  if (!d) { det.textContent = ""; return; }
  const icms = icmsAtual();
  const pis = lerPremissas().pisCofins ?? PREMISSAS_PADRAO.pisCofins;
  const valor = comImpostos(d.te + d.tusd, icms, pis);
  if (!estado.tarifaManual) form.elements.tarifa.value = valor.toFixed(2);
  const vars = { valor: brl2.format(valor), nome: d.nome, icms: pct(icms, 1), pis: pct(pis, 1), data: data(d.inicio),
    base: brl2.format((d.te + d.tusd) / 1000) };
  det.textContent = estado.tarifaManual
    ? t("Valor digitado. Pela ANEEL seria {valor} ({nome}, com ICMS {icms} e PIS/COFINS {pis}).", vars)
    : t("{nome}, vigente desde {data}: TE + TUSD de {base}, com ICMS {icms} e PIS/COFINS {pis}. Confira com a sua conta.", vars);
}

async function preencherDistribuidoras(ibge) {
  const sel = form.elements.distribuidora;
  const atual = sel.value;
  const sugeridas = ibge ? await distribuidorasDoMunicipio(ibge) : [];
  const cnpjs = new Set(sugeridas.map((d) => d.cnpj));
  const outras = estado.tarifas.distribuidoras.filter((d) => !cnpjs.has(d.cnpj));
  const opt = (d) => `<option value="${d.cnpj}">${d.nome}</option>`;
  sel.innerHTML = (sugeridas.length ? `<optgroup label="${t("Atendem {cidade}", { cidade: estado.local.cidade })}">${sugeridas.map(opt).join("")}</optgroup>` : "")
    + `<optgroup label="${t(sugeridas.length ? "Outras distribuidoras" : "Escolha a distribuidora")}">${outras.map(opt).join("")}</optgroup>`;
  const existe = (c) => c && estado.tarifas.distribuidoras.some((d) => d.cnpj === c);
  // preferência salva ou do link vale uma vez; depois, a distribuidora sugerida para o município
  const preferida = estado.inicial.distribuidora;
  estado.inicial.distribuidora = null;
  sel.value = existe(preferida) ? preferida : (cnpjs.has(atual) ? atual : (sugeridas[0]?.cnpj ?? outras[0].cnpj));
  sel.disabled = false;
}

// ---------- preços de mercado e marcas ----------

const temPrecos = () => Boolean(estado.precos?.modulo && estado.precos?.inversorCurva);

function montarMarcas() {
  if (!temPrecos()) return;
  const p = estado.precos;
  const fm = form.elements.marcaModulo, fi = form.elements.marcaInversor;
  const atualM = fm.value || estado.inicial.marcaModulo || "";
  const atualI = fi.value || estado.inicial.marcaInversor || "";
  estado.inicial.marcaModulo = estado.inicial.marcaInversor = null;
  fm.innerHTML = `<option value="">${t("Média do mercado")} · ${brl2.format(p.modulo.valor)}/Wp</option>`
    + p.marcasModulo.map((m) => `<option value="${m.marca}">${m.marca} · ${brl2.format(m.valor)}/Wp</option>`).join("");
  fi.innerHTML = `<option value="">${t("Média do mercado")}</option>`
    + p.marcasInversor.map((m) => {
      const dif = Math.round((m.fator - 1) * 100);
      return `<option value="${m.marca}">${m.marca} · ${dif === 0 ? t("na média") : t("{d}% vs. média", { d: `${dif > 0 ? "+" : ""}${dif}` })}</option>`;
    }).join("");
  if (p.marcasModulo.some((m) => m.marca === atualM)) fm.value = atualM;
  if (p.marcasInversor.some((m) => m.marca === atualI)) fi.value = atualI;
  $("#detalhe-precos").textContent = t("Preços de {o} ofertas em {l} lojas, atualizados em {d}.", {
    o: p.modulo.ofertas + p.inversorCurva.ofertas, l: p.fontes.filter((f) => f.ok).length, d: data(p.gerado) });
  $("#equipamentos").hidden = false;
}

function precosResolvidos() {
  if (!temPrecos()) return null;
  const p = estado.precos;
  const mm = p.marcasModulo.find((m) => m.marca === form.elements.marcaModulo.value);
  const mi = p.marcasInversor.find((m) => m.marca === form.elements.marcaInversor.value);
  return { moduloRsWp: mm?.valor ?? p.modulo.valor, inversorA: p.inversorCurva.a, inversorB: p.inversorCurva.b,
    inversorFator: mi?.fator ?? 1, marcaModulo: mm?.marca, marcaInversor: mi?.marca };
}

// ---------- local ----------

function statusLocal(texto, vars = {}, tipo = "") {
  estado.status = { texto, vars, tipo };
  const s = $("#status-local");
  s.textContent = texto ? t(texto, vars) : "";
  s.className = `ajuda ${tipo}`;
}

async function buscarLocal() {
  const botao = $("#buscar-cep");
  statusLocal("Buscando o CEP...", {}, "carregando");
  botao.disabled = true;
  if (!estado.hsp) $("#vazio-titulo").textContent = t("Buscando os dados do local...");
  try {
    estado.tarifas ??= await carregarTarifas();
    const local = await buscarCep(form.elements.cep.value);
    estado.local = local;
    statusLocal("{cidade}/{uf}. Buscando a irradiação solar...", { cidade: local.cidade, uf: local.uf }, "carregando");
    await preencherDistribuidoras(local.ibge);
    estado.hsp = await buscarIrradiacao(local.lat, local.lon);
    const media = estado.hsp.reduce((a, b) => a + b, 0) / 12;
    statusLocal("{cidade}/{uf}: {hsp} kWh/m² de sol por dia, em média.", { cidade: local.cidade, uf: local.uf, hsp: n2.format(media) });
    atualizarTarifa();
    salvar();
    calcular();
  } catch (e) {
    statusLocal(e.name === "AbortError" ? "O serviço demorou para responder. Tente de novo." : (e.message || "Não foi possível buscar o CEP."), {}, "erro");
  } finally {
    botao.disabled = false;
    $("#vazio-titulo").textContent = t("Comece pelo CEP e pelo consumo");
  }
}

// ---------- persistência, link e tema ----------

function lerSalvo() {
  try { return JSON.parse(localStorage.getItem(CHAVE)); } catch { return null; }
}

function salvar() {
  const s = {
    cep: form.elements.cep.value, distribuidora: form.elements.distribuidora.value,
    ligacao: form.elements.ligacao.value, consumo: form.elements.consumo.value,
    meses: $$("[data-mes]").map((el) => el.value), mesAMes: estado.mesAMes,
    tarifa: estado.tarifaManual ? form.elements.tarifa.value : "", premissas: lerPremissas(),
    marcaModulo: form.elements.marcaModulo.value, marcaInversor: form.elements.marcaInversor.value,
  };
  try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* sem armazenamento */ }
}

// Link com a simulação inteira: ?cep=&consumo= (ou meses=) &ligacao=&dist=&tarifa=&mm=&mi=&p_<premissa>=&lang=
function linkSimulacao() {
  const q = new URLSearchParams();
  q.set("cep", form.elements.cep.value.replace(/\D/g, ""));
  if (estado.mesAMes) q.set("meses", $$("[data-mes]").map((el) => el.value || "").join(","));
  else q.set("consumo", form.elements.consumo.value);
  q.set("ligacao", form.elements.ligacao.value);
  if (form.elements.distribuidora.value) q.set("dist", form.elements.distribuidora.value);
  if (estado.tarifaManual) q.set("tarifa", form.elements.tarifa.value);
  if (form.elements.marcaModulo.value) q.set("mm", form.elements.marcaModulo.value);
  if (form.elements.marcaInversor.value) q.set("mi", form.elements.marcaInversor.value);
  for (const [nome, v] of Object.entries(lerPremissas())) {
    if (v !== PREMISSAS_PADRAO[nome]) q.set(`p_${nome}`, String(+v.toFixed(6)));
  }
  if (idioma() !== "pt") q.set("lang", idioma());
  return `${location.origin}${location.pathname}?${q}`;
}

function lerLink() {
  const q = new URLSearchParams(location.search);
  if (!q.get("cep")) return null;
  const premissas = {};
  for (const c of CAMPOS) {
    const v = q.get(`p_${c.nome}`);
    if (v !== null && v !== "" && Number.isFinite(Number(v))) premissas[c.nome] = Number(v);
  }
  const meses = q.get("meses")?.split(",");
  return {
    cep: q.get("cep"), consumo: q.get("consumo") ?? "", meses: meses ?? [], mesAMes: Boolean(meses),
    ligacao: DISPONIBILIDADE[q.get("ligacao")] ? q.get("ligacao") : "monofasico",
    distribuidora: q.get("dist") ?? "", tarifa: q.get("tarifa") ?? "", premissas,
    marcaModulo: q.get("mm") ?? "", marcaInversor: q.get("mi") ?? "",
  };
}

async function copiarLink(botao) {
  const url = linkSimulacao();
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch { /* sem permissão */ }
  if (!ok) { prompt(t("Copie o link da simulação:"), url); return; }
  const texto = botao.querySelector("span");
  texto.textContent = t("Link copiado");
  setTimeout(() => { texto.textContent = t("Copiar link"); }, 2000);
}

const TEMAS = ["", "light", "dark"];
const NOMES_TEMA = { "": "automático", light: "claro", dark: "escuro" };
const ICONES_TEMA = {
  "": '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  dark: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};
function aplicarTema(tema) {
  if (tema) document.documentElement.dataset.theme = tema; else delete document.documentElement.dataset.theme;
  const b = $("#tema");
  b.title = t("Tema: {nome}", { nome: t(NOMES_TEMA[tema]) });
  b.querySelector("svg").innerHTML = ICONES_TEMA[tema];
}

// ---------- idioma ----------

function trocarIdioma(l, gravar = true) {
  if (!definirIdioma(l, gravar)) return;
  criarFormatos();
  aplicarTextos();
  $$(".idiomas button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === idioma())));
  aplicarTema(document.documentElement.dataset.theme ?? "");
  montarMeses();
  montarPremissas();
  textoAlternarMeses();
  if (estado.status) statusLocal(estado.status.texto, estado.status.vars, estado.status.tipo);
  if (estado.local && estado.tarifas) preencherDistribuidoras(estado.local.ibge);
  montarMarcas();
  atualizarTarifa();
  calcular();
}

// ---------- cálculo ----------

function calcular() {
  const consumo = lerConsumo();
  const d = distribuidoraAtual();
  const tarifa = Number(form.elements.tarifa.value);
  const pronto = Boolean(consumo && estado.hsp && d && tarifa > 0);
  const conteudo = $("#conteudo");
  const estavaOculto = conteudo.hidden;
  $("#vazio").hidden = pronto;
  conteudo.hidden = !pronto;
  if (!pronto) { marcarPremissas(); return; }

  const premissas = lerPremissas();
  const pis = premissas.pisCofins ?? PREMISSAS_PADRAO.pisCofins;
  // Fio B com os mesmos impostos e na mesma proporção da tarifa usada
  const tarifaAneel = comImpostos(d.te + d.tusd, icmsAtual(), pis);
  const fioB = comImpostos(d.fioB, icmsAtual(), pis) * (tarifa / tarifaAneel);
  const ligacao = form.elements.ligacao.value;
  const precos = precosResolvidos();
  const r = simular({ consumo, hsp: estado.hsp, ligacao, tarifa, fioB, premissas, precos });
  estado.ultimo = r;
  marcarPremissas();
  render(r, { consumo, tarifa, d, ligacao, precos, premissas: { ...PREMISSAS_PADRAO, ...premissas } });
  if (estavaOculto) {
    conteudo.classList.add("entrando");
    setTimeout(() => conteudo.classList.remove("entrando"), 600);
  }
}

// ---------- resultados ----------

function anosMeses(v) {
  if (v === null) return t("não se paga");
  const a = Math.floor(v), m = Math.round((v - a) * 12);
  const [aa, mm] = m === 12 ? [a + 1, 0] : [a, m];
  const partes = [aa && t(aa === 1 ? "{n} ano" : "{n} anos", { n: aa }), mm && t(mm === 1 ? "{n} mês" : "{n} meses", { n: mm })];
  return partes.filter(Boolean).join(t(" e ")) || t("menos de 1 mês");
}

const ICONES = {
  painel: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M3 10h18M9 4v12M15 4v12M12 16v4M8 20h8"/>',
  raio: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  area: '<path d="M3 3h7M3 3v7M21 21h-7M21 21v-7M3 3l7 7M21 21l-7-7"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  pdf: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M12 11v6M9 14l3 3 3-3"/>',
};
const icone = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[k]}</svg>`;
const cartao = (ic, titulo, valor, sub) => `<div class="painel cartao"><div class="icone">${icone(ic)}</div>
  <div class="titulo">${titulo}</div><div class="valor">${valor}</div><div class="sub">${sub}</div></div>`;

function render(r, ctx) {
  const s = r.sistema;
  const a1 = r.primeiroAno;
  const p = ctx.premissas;
  const contaAntes = a1.semSolar / 12;
  const contaDepois = a1.comSolar / 12;
  const economia = contaAntes - contaDepois;
  const geracaoMedia = s.geracao.reduce((a, b) => a + b, 0) / 12;
  const consumoMedio = ctx.consumo.reduce((a, b) => a + b, 0) / 12;
  const avisos = [];
  if (ctx.ligacao === "monofasico" && s.inversorKw > 10) avisos.push(t("Inversor acima de 10 kW costuma exigir ligação bifásica ou trifásica. Consulte a distribuidora."));
  if (ctx.d.fioBOrigem !== "ANEEL") avisos.push(t("A ANEEL ainda não publicou o Fio B do ciclo atual da {nome}; usamos a proporção mais recente conhecida.", { nome: ctx.d.nome }));
  if (consumoMedio < DISPONIBILIDADE[ctx.ligacao] * 2) avisos.push(t("Com consumo tão baixo, a economia fica limitada pelo custo mínimo da ligação."));
  if (r.payback === null) avisos.push(t("Com estas premissas o investimento não se paga em {n} anos.", { n: p.anos }));
  if (!ctx.precos) avisos.push(t("Preços de mercado indisponíveis no momento; o investimento usa uma referência por porte do sistema."));
  else if ((Date.now() - Date.parse(estado.precos.gerado)) / 864e5 > 10) avisos.push(t("Os preços de mercado são de {d}; a coleta diária pode estar parada.", { d: data(estado.precos.gerado) }));
  const energia = estado.abaMensal === "energia";
  const ligacoes = { monofasico: "Monofásica", bifasico: "Bifásica", trifasico: "Trifásica" };

  $("#conteudo").innerHTML = `
    <div class="cabecalho-impressao so-impressao">
      <div><strong>${t("Calculadora Solar")}</strong> · ${t("Simulação de {d}", { d: fmtData.format(new Date()) })}</div>
      <div>${estado.local.cidade}/${estado.local.uf} · ${ctx.d.nome}</div>
    </div>

    <div class="acoes-resultado nao-imprimir">
      <button type="button" class="botao secundario" data-acao="link">${icone("link")}<span>${t("Copiar link")}</span></button>
      <button type="button" class="botao" data-acao="pdf">${icone("pdf")}<span>${t("Baixar relatório em PDF")}</span></button>
    </div>

    <div class="painel destaque-principal">
      <div class="economia">
        <div class="titulo">${t("Economia estimada no 1º ano")}</div>
        <div class="valor">${brl.format(economia)}<small> ${t("/mês")}</small></div>
        <div class="sub">${t("{p} a menos na parte de energia da conta, {v} no ano.", { p: pct(economia / contaAntes), v: brl.format(economia * 12) })}</div>
        <div class="barra-conta" aria-hidden="true">
          <div class="linha"><span>${t("Conta hoje")}</span><div class="trilho"><div class="cheio" style="width:100%"></div></div><span class="num">${brl.format(contaAntes)}</span></div>
          <div class="linha"><span>${t("Com o sistema")}</span><div class="trilho"><div class="cheio depois" style="width:${Math.max(1, (contaDepois / contaAntes) * 100)}%"></div></div><span class="num">${brl.format(contaDepois)}</span></div>
        </div>
      </div>
      <div class="lado">
        <div class="metrica"><div class="titulo">${t("Investimento estimado")}</div><div class="valor">${brl.format(s.investimento)}</div>
          <div class="sub">${t("{v} por Wp instalado", { v: brl2.format(s.precoWp) })}${p.precoWp ? ` ${t("(seu valor)")}` : ""}</div></div>
        <div class="metrica"><div class="titulo">${t("Retorno do investimento")}</div><div class="valor">${anosMeses(r.payback)}</div>
          <div class="sub">${t("{v} considerando {t} a.a.", { v: anosMeses(r.paybackDescontado), t: pct(p.taxaDesconto, 1) })}</div></div>
        <div class="metrica"><div class="titulo">${t("Ganho em {n} anos", { n: p.anos })}</div><div class="valor">${brl.format(r.lucro25)}</div>
          <div class="sub">${t("já descontado o investimento")}</div></div>
      </div>
    </div>

    <div class="cartoes">
      ${cartao("painel", t("Potência"), `${n2.format(s.kwp)} kWp`, t("{n} módulos de {w} W", { n: s.modulos, w: p.potenciaModuloW }))}
      ${cartao("raio", t("Inversor"), `${n1.format(s.inversorKw)} kW`, t("relação {r} CC/CA", { r: n2.format(s.kwp / s.inversorKw) }))}
      ${cartao("area", t("Área no telhado"), `≈ ${n0.format(s.areaM2)} m²`, t("sem contar espaçamentos"))}
      ${cartao("sol", t("Geração média"), `${n0.format(geracaoMedia)} ${t("kWh/mês")}`, t("consumo de {c} kWh/mês", { c: n0.format(consumoMedio) }))}
    </div>

    <div class="painel grafico" id="grafico-mensal">
      <div class="cabecalho-painel">
        <h2>${t("Mês a mês no 1º ano")}</h2>
        <div class="abas nao-imprimir" role="tablist">
          <button type="button" role="tab" data-aba="energia" aria-selected="${energia}">${t("Energia")}</button>
          <button type="button" role="tab" data-aba="conta" aria-selected="${!energia}">${t("Conta")}</button>
        </div>
      </div>
      ${energia
        ? graficoMensal([ctx.consumo, s.geracao], [t("Consumo"), t("Geração")], (v) => `${n0.format(v)} kWh`)
        : graficoMensal([a1.meses.map((m) => m.semSolar), a1.meses.map((m) => m.comSolar)], [t("Sem o sistema"), t("Com o sistema")], (v) => brl.format(v))}
      <div class="legenda">
        <span><i style="background:var(--serie-a)"></i>${t(energia ? "Consumo" : "Sem o sistema")}</span>
        <span><i style="background:${energia ? "var(--serie-b)" : "var(--positivo)"}"></i>${t(energia ? "Geração estimada" : "Com o sistema")}</span>
      </div>
    </div>

    <div class="painel grafico">
      <div class="cabecalho-painel"><h2>${t("Saldo acumulado do investimento")}</h2></div>
      ${graficoAcumulado(r.anos, s.investimento)}
      <details id="detalhe-anos">
        <summary class="link nao-imprimir">${t("Ver tabela ano a ano")}</summary>
        <div class="tabela-rolagem">${tabela(r.anos)}</div>
      </details>
    </div>

    <div class="duas-colunas">
      ${painelComposicao(s, ctx)}
      ${painelMercado(s, ctx)}
    </div>

    <div class="duas-colunas">
      <div class="painel">
        <h2>${t("Indicadores")}</h2>
        <dl class="lista-dados" style="margin-top:14px">
          <dt>${t("Taxa interna de retorno (TIR)")}</dt><dd>${r.tir === null ? "-" : `${pct(r.tir, 1)} ${t("a.a.")}`}</dd>
          <dt>${t("Valor presente líquido (VPL)")}</dt><dd>${brl.format(r.vpl)}</dd>
          <dt>${t("Economia na conta em {n} anos", { n: p.anos })}</dt><dd>${brl.format(r.economia25)}</dd>
          <dt>${t("Tarifa usada")}</dt><dd>${brl2.format(ctx.tarifa)}/kWh</dd>
          <dt>${t("Fio B pago no 1º ano")}</dt><dd>${brl.format(a1.fioBPago)} (${pct(a1.pctFioB)})</dd>
        </dl>
        <p class="nota">${t("Valores sem iluminação pública e bandeiras tarifárias, que continuam na conta. A parte do Fio B paga sobe até {p} em 2028.", { p: pct(percentualFioB(2028)) })}</p>
      </div>
      <div class="painel fontes">
        <h2>${t("Como calculamos")}</h2>
        <ul>
          <li>${t("Irradiação média mensal da {nasa} para {cidade}, com desempenho de {d}.", { nasa: '<a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener">NASA POWER</a>', cidade: `${estado.local.cidade}/${estado.local.uf}`, d: pct(p.desempenho) })}</li>
          <li>${t("Tarifa residencial da {aneel}, dados de {d}.", { aneel: '<a href="https://dadosabertos.aneel.gov.br/" target="_blank" rel="noopener">ANEEL</a>', d: data(estado.tarifas.gerado) })}</li>
          <li>${t("Lei 14.300: Fio B escalonado sobre a energia compensada (100% a partir de 2029, por prudência) e custo mínimo de {n} kWh só quando o consumo da rede fica abaixo dele.", { n: r.minimo })}</li>
          <li>${t("Reajuste de {r} a.a., perda de geração de {g} a.a., manutenção e {troca}.", { r: pct(p.reajusteTarifa, 1), g: pct(p.degradacao, 1), troca: p.trocaInversorAno ? t("troca do inversor no ano {n}", { n: p.trocaInversorAno }) : t("sem troca do inversor") })}</li>
        </ul>
        ${avisos.map((a) => `<div class="alerta">${a}</div>`).join("")}
      </div>
    </div>

    <div class="painel so-impressao">
      <h2>${t("Dados informados")}</h2>
      <dl class="lista-dados" style="margin-top:12px">
        <dt>${t("Local")}</dt><dd>${estado.local.cidade}/${estado.local.uf} (CEP ${estado.local.cep.replace(/(\d{5})(\d{3})/, "$1-$2")})</dd>
        <dt>${t("Distribuidora")}</dt><dd>${ctx.d.nome}</dd>
        <dt>${t("Tipo de ligação")}</dt><dd>${t(ligacoes[ctx.ligacao])}</dd>
        <dt>${t("Consumo médio mensal")}</dt><dd>${n0.format(consumoMedio)} kWh</dd>
        <dt>${t("Tarifa com impostos")}</dt><dd>${brl2.format(ctx.tarifa)}/kWh</dd>
        ${CAMPOS.map((c) => {
          const v = c.nome === "icms" ? icmsAtual() : c.nome === "precoWp" ? p.precoWp : p[c.nome];
          if (v === null || v === undefined) return "";
          const valor = c.step >= 1 ? String(paraCampo(c, v)) : sem00(n2.format(paraCampo(c, v)));
          return `<dt>${t(c.rotulo)}</dt><dd>${valor} ${t(c.unidade)}</dd>`;
        }).join("")}
      </dl>
      <p class="nota">${t("Link da simulação:")} ${linkSimulacao()}</p>
      <p class="nota">${t("Estimativa para orientação. Não substitui o projeto de um engenheiro nem o orçamento de um instalador.")}</p>
    </div>`;
}

function painelComposicao(s, ctx) {
  const p = ctx.premissas;
  if (!s.composicao) {
    return `<div class="painel"><h2>${t("Investimento")}</h2>
      <p class="nota">${t("Referência de {v} por Wp para um sistema de {k} kWp, já instalado. Os preços de mercado aparecem aqui quando a coleta diária está disponível.", { v: brl2.format(s.precoWpCalculado), k: n2.format(s.kwp) })}</p></div>`;
  }
  const c = s.composicao;
  const total = c.modulos + c.inversor + c.estrutura + c.instalacao;
  const partes = [
    ["modulos", `${t("Módulos")}${ctx.precos.marcaModulo ? ` ${ctx.precos.marcaModulo}` : ""}`, c.modulos, t("{n} × {w} W a {v}/Wp", { n: s.modulos, w: p.potenciaModuloW, v: brl2.format(ctx.precos.moduloRsWp) })],
    ["inversor", `${t("Inversor")}${ctx.precos.marcaInversor ? ` ${ctx.precos.marcaInversor}` : ""}`, c.inversor, `${n1.format(s.inversorKw)} kW`],
    ["estrutura", t("Estrutura, cabos e proteções"), c.estrutura, `${brl2.format(p.estruturaWp)}/Wp`],
    ["instalacao", t("Instalação, projeto e margem"), c.instalacao, t("{p} dos equipamentos", { p: pct(p.instalacao) })],
  ];
  const orcamento = p.precoWp
    ? `<div class="alerta">${t("O resultado usa o preço do seu orçamento ({v}, {w}/Wp). Pelos preços de mercado seria {m}.", { v: brl.format(s.investimento), w: brl2.format(s.precoWp), m: brl.format(total) })}</div>`
    : "";
  return `<div class="painel">
    <div class="cabecalho-painel"><h2>${t("Composição do investimento")}</h2><strong>${brl.format(total)}</strong></div>
    <div class="barra-composicao" aria-hidden="true">${partes.map(([k, nome, v]) =>
      `<span class="c-${k}" style="width:${(v / total) * 100}%" data-dica="${nome}: ${brl.format(v)} (${pct(v / total)})"></span>`).join("")}</div>
    <dl class="lista-composicao">${partes.map(([k, nome, v, sub]) =>
      `<dt><i class="c-${k}"></i>${nome}<small>${sub}</small></dt><dd>${brl.format(v)}</dd>`).join("")}</dl>
    ${orcamento}
  </div>`;
}

function painelMercado(s, ctx) {
  const pr = estado.precos;
  if (!ctx.precos) return `<div class="painel fontes"><h2>${t("Preços de mercado")}</h2><p class="nota">${t("A coleta de preços não está disponível agora.")}</p></div>`;
  const linhas = pr.fontes.filter((f) => f.ok).map((f) => {
    const mod = pr.modulo.porLoja[f.nome];
    const inv = pr.inversorCurva.porLoja[f.nome];
    return `<tr><td><a href="${f.site}" target="_blank" rel="noopener">${f.nome}</a></td>
      <td>${mod ? `${brl2.format(mod)}/Wp` : "-"}</td><td>${inv ? t(inv === 1 ? "{n} oferta" : "{n} ofertas", { n: inv }) : "-"}</td></tr>`;
  }).join("");
  const precoInv = pr.inversorCurva.a * s.inversorKw ** pr.inversorCurva.b;
  return `<div class="painel fontes">
    <div class="cabecalho-painel"><h2>${t("Preços de mercado")}</h2><span class="nota" style="margin:0">${data(pr.gerado)}</span></div>
    <div class="tabela-rolagem" style="margin-top:0"><table>
      <thead><tr><th>${t("Loja")}</th><th>${t("Módulos (mediana)")}</th><th>${t("Inversores on-grid")}</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
    <ul>
      <li>${t("Módulos: média entre lojas de {v}/Wp, ofertas de {min} a {max}/Wp.", { v: brl2.format(pr.modulo.valor), min: brl2.format(pr.modulo.min), max: brl2.format(pr.modulo.max) })}</li>
      <li>${t("Inversor de {k} kW: {v} na média do mercado, pela curva de preço × potência de {n} ofertas.", { k: n1.format(s.inversorKw), v: brl.format(precoInv), n: pr.inversorCurva.ofertas })}</li>
      <li>${t("Só itens em estoque, sem valores extremos. Nos módulos cada loja pesa igual; na curva dos inversores, lojas com mais ofertas pesam um pouco mais.")}</li>
    </ul>
  </div>`;
}

function graficoMensal(series, nomes, fmt) {
  const W = 680, H = 230, m = { t: 12, r: 6, b: 26, l: 52 };
  const max = Math.max(...series.flat()) * 1.12 || 1;
  const passo = (W - m.l - m.r) / 12;
  const larg = passo * 0.34;
  const y = (v) => H - m.b - (v / max) * (H - m.t - m.b);
  const cores = estado.abaMensal === "energia" ? ["var(--serie-a)", "var(--serie-b)"] : ["var(--serie-a)", "var(--positivo)"];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f / 1.12);
  let svg = ticks.map((v) => `<line class="${v ? "grade" : "zero"}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>
    <text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${curto.format(v)}</text>`).join("");
  meses.forEach((mes, i) => {
    const x = m.l + i * passo + passo / 2;
    const dica = `${mes}\n${nomes[0]}: ${fmt(series[0][i])}\n${nomes[1]}: ${fmt(series[1][i])}`;
    svg += `<g data-dica="${dica}"><rect x="${x - passo / 2}" y="${m.t}" width="${passo}" height="${H - m.t - m.b}" fill="transparent"/>`;
    series.forEach((s, k) => {
      const h = Math.max(0, y(0) - y(s[i]));
      svg += `<rect x="${x - larg - 1 + k * (larg + 2)}" y="${y(0) - h}" width="${larg}" height="${h}" rx="3" fill="${cores[k]}"/>`;
    });
    svg += `</g><text x="${x}" y="${H - 7}" text-anchor="middle">${mes}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${nomes.join(" / ")}">${svg}</svg>`;
}

function graficoAcumulado(anos, investimento) {
  const W = 680, H = 230, m = { t: 12, r: 6, b: 26, l: 60 };
  const vals = [-investimento, ...anos.map((a) => a.acumulado)];
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const faixa = max - min || 1;
  const passo = (W - m.l - m.r) / vals.length;
  const y = (v) => m.t + ((max - v) / faixa) * (H - m.t - m.b);
  // linhas de referência sem rótulos sobrepostos ao zero
  const ticks = [0, ...[min, min + faixa / 2, max].filter((v) => Math.abs(v) > faixa * 0.1)];
  let svg = ticks.map((v) => `<line class="${v ? "grade" : "zero"}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>
    <text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v ? `R$ ${curto.format(v)}` : "0"}</text>`).join("");
  vals.forEach((v, i) => {
    const x = m.l + i * passo;
    const topo = Math.min(y(v), y(0)), alt = Math.max(1, Math.abs(y(v) - y(0)));
    const ano = anos[i - 1];
    const dica = i === 0 ? `${t("Instalação")}\n${t("Investimento")}: ${brl.format(investimento)}`
      : `${t("Ano {n}", { n: i })} (${ano.anoCalendario})\n${t("Saldo do ano")}: ${brl.format(ano.fluxo)}\n${t("Acumulado")}: ${brl.format(v)}`;
    svg += `<g data-dica="${dica}"><rect x="${x}" y="${m.t}" width="${passo}" height="${H - m.t - m.b}" fill="transparent"/>
      <rect x="${x + passo * 0.16}" y="${topo}" width="${passo * 0.68}" height="${alt}" rx="2" fill="${v < 0 ? "var(--negativo)" : "var(--positivo)"}"/></g>`;
    if (i % 5 === 0) svg += `<text x="${x + passo / 2}" y="${H - 7}" text-anchor="middle">${i === 0 ? t("início") : t("ano {n}", { n: i })}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("Saldo acumulado do investimento")}">${svg}</svg>`;
}

function tabela(anos) {
  const linhas = anos.map((a) => `<tr><td>${a.ano} (${a.anoCalendario})</td><td>${n0.format(a.gerado)}</td>
    <td>${brl.format(a.semSolar)}</td><td>${brl.format(a.comSolar)}</td><td>${pct(a.pctFioB)}</td>
    <td>${brl.format(a.manutencao + a.troca)}</td><td>${brl.format(a.fluxo)}</td>
    <td class="${a.acumulado < 0 ? "neg" : "pos"}">${brl.format(a.acumulado)}</td></tr>`).join("");
  return `<table><thead><tr><th>${t("Ano")}</th><th>${t("Geração (kWh)")}</th><th>${t("Conta sem")}</th><th>${t("Conta com")}</th><th>Fio B</th>
    <th>${t("Manutenção")}</th><th>${t("Saldo do ano")}</th><th>${t("Acumulado")}</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

// ---------- dica dos gráficos ----------

function iniciarDicas() {
  const dica = $("#dica");
  let ativo = null;
  const esconder = () => { dica.hidden = true; ativo?.classList.remove("ativo"); ativo = null; };
  const mostrar = (e) => {
    const g = e.target.closest?.("[data-dica]");
    if (!g) { esconder(); return; }
    if (g !== ativo) { ativo?.classList.remove("ativo"); ativo = g; g.classList.add("ativo"); dica.textContent = g.dataset.dica; }
    dica.hidden = false;
    const r = dica.getBoundingClientRect();
    const x = Math.min(e.clientX + 14, innerWidth - r.width - 8);
    const y = e.clientY - r.height - 12 < 8 ? e.clientY + 16 : e.clientY - r.height - 12;
    dica.style.left = `${Math.max(8, x)}px`;
    dica.style.top = `${y}px`;
  };
  const conteudo = $("#conteudo");
  conteudo.addEventListener("pointermove", mostrar);
  conteudo.addEventListener("pointerdown", mostrar);
  conteudo.addEventListener("pointerleave", esconder);
  addEventListener("scroll", esconder, { passive: true });
}

// ---------- início ----------

function iniciar() {
  const q = new URLSearchParams(location.search);
  definirIdioma(q.get("lang"), false);
  criarFormatos();
  aplicarTextos();
  $$(".idiomas button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === idioma())));
  montarMeses();
  montarPremissas();
  iniciarDicas();
  let tema = "";
  try { tema = localStorage.getItem(CHAVE_TEMA) ?? ""; } catch { /* sem armazenamento */ }
  aplicarTema(TEMAS.includes(tema) ? tema : "");

  const salvo = lerLink() ?? lerSalvo();
  estado.inicial = { distribuidora: salvo?.distribuidora, marcaModulo: salvo?.marcaModulo, marcaInversor: salvo?.marcaInversor };
  preencherPremissas({ ...PREMISSAS_PADRAO, ...(salvo?.premissas ?? {}) });
  carregarPrecos().then((p) => { estado.precos = p; montarMarcas(); calcular(); });
  if (salvo) {
    form.elements.cep.value = salvo.cep ?? "";
    form.elements.consumo.value = salvo.consumo ?? "";
    if (salvo.ligacao && DISPONIBILIDADE[salvo.ligacao]) form.querySelector(`[name=ligacao][value=${salvo.ligacao}]`).checked = true;
    $$("[data-mes]").forEach((el, i) => { el.value = salvo.meses?.[i] ?? ""; });
    if (salvo.mesAMes) alternarMeses();
    if (salvo.tarifa) { form.elements.tarifa.value = salvo.tarifa; estado.tarifaManual = true; }
    if (salvo.cep) buscarLocal();
  }

  form.elements.cep.addEventListener("input", (e) => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 8);
    e.target.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    if (d.length === 8) buscarLocal();
  });
  form.elements.cep.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); buscarLocal(); } });
  $("#buscar-cep").addEventListener("click", buscarLocal);
  $("#alternar-meses").addEventListener("click", alternarMeses);
  $("#tarifa-aneel").addEventListener("click", () => { estado.tarifaManual = false; atualizarTarifa(); salvar(); calcular(); });

  form.addEventListener("input", (e) => {
    if (e.target.name === "cep") return;
    if (e.target.name === "tarifa") estado.tarifaManual = true;
    if (["distribuidora", "tarifa"].includes(e.target.name)) atualizarTarifa();
    salvar();
    calcular();
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  // gaveta de premissas
  $("#abrir-premissas").addEventListener("click", () => abrirPremissas(true));
  $("#premissas").addEventListener("click", (e) => {
    if (e.target.closest("[data-fechar]")) abrirPremissas(false);
    const r = e.target.closest("[data-restaurar]");
    if (r) {
      const c = CAMPOS.find((x) => x.nome === r.dataset.restaurar);
      const padrao = PREMISSAS_PADRAO[c.nome];
      campoPremissa(c.nome).value = c.vazio || padrao === null || padrao === undefined ? "" : paraCampo(c, padrao);
      aoMudarPremissa();
    }
  });
  $("#campos-premissas").addEventListener("input", aoMudarPremissa);
  $("#restaurar").addEventListener("click", () => { preencherPremissas(PREMISSAS_PADRAO); aoMudarPremissa(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#premissas").hidden) abrirPremissas(false); });

  // abas, ações, tema e idioma
  $("#conteudo").addEventListener("click", (e) => {
    const aba = e.target.closest("[data-aba]");
    if (aba && aba.dataset.aba !== estado.abaMensal) { estado.abaMensal = aba.dataset.aba; calcular(); }
    const acao = e.target.closest("[data-acao]");
    if (acao?.dataset.acao === "link") copiarLink(acao);
    if (acao?.dataset.acao === "pdf") print();
  });
  // a impressão abre a tabela ano a ano e volta como estava
  let tabelaAberta = false;
  addEventListener("beforeprint", () => { const d = $("#detalhe-anos"); if (d) { tabelaAberta = d.open; d.open = true; } });
  addEventListener("afterprint", () => { const d = $("#detalhe-anos"); if (d) d.open = tabelaAberta; });

  $("#tema").addEventListener("click", () => {
    const atual = document.documentElement.dataset.theme ?? "";
    const prox = TEMAS[(TEMAS.indexOf(atual) + 1) % TEMAS.length];
    aplicarTema(prox);
    try { localStorage.setItem(CHAVE_TEMA, prox); } catch { /* sem armazenamento */ }
  });
  $$(".idiomas button").forEach((b) => b.addEventListener("click", () => trocarIdioma(b.dataset.lang)));

  // Ao entrar num campo, seleciona o conteúdo: o que for digitado substitui o valor anterior.
  // O setTimeout evita que o clique do mouse desfaça a seleção logo depois do foco.
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!el.matches?.("input:not([type=radio]):not([type=checkbox])")) return;
    setTimeout(() => { if (document.activeElement === el) el.select(); }, 0);
  });
  // o portfólio (mesmo domínio) grava o idioma em "idioma": acompanha a troca feita lá
  addEventListener("storage", (e) => { if (e.key === "idioma" && IDIOMAS.includes(e.newValue)) trocarIdioma(e.newValue, false); });
}

function aoMudarPremissa() {
  atualizarTarifa();
  salvar();
  calcular();
}

iniciar();
