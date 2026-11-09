// Idiomas do app: o texto em português é a chave; DIC traz [inglês, espanhol].
// O idioma fica em localStorage "idioma", a mesma chave do portfólio (mesmo domínio), então os dois andam juntos.
// No HTML: data-i18n traduz o texto do elemento; data-i18n-attr="placeholder,title,aria-label" traduz atributos.

export const IDIOMAS = ["pt", "en", "es"];
const LOCALES = { pt: "pt-BR", en: "en-US", es: "es-ES" };
let atual = null;

export const idioma = () => atual;
export const localeAtual = () => LOCALES[atual];

export function t(s, vars) {
  const tr = atual !== "pt" && DIC[s] ? DIC[s][atual === "en" ? 0 : 1] : s;
  return vars ? tr.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : tr;
}

// Define o idioma: o pedido, senão o salvo, senão o do navegador. Devolve true se mudou.
export function definirIdioma(pedido, gravar = true) {
  let novo = IDIOMAS.includes(pedido) ? pedido : null;
  if (!novo) {
    try { const s = localStorage.getItem("idioma"); if (IDIOMAS.includes(s)) novo = s; } catch { /* sem armazenamento */ }
  }
  if (!novo) {
    const n = (navigator.languages?.[0] || navigator.language || "pt").toLowerCase();
    novo = n.startsWith("pt") ? "pt" : n.startsWith("es") ? "es" : "en";
  }
  if (novo === atual) return false;
  atual = novo;
  if (gravar && pedido) {
    try { localStorage.setItem("idioma", novo); } catch { /* sem armazenamento */ }
  }
  document.documentElement.lang = LOCALES[novo];
  return true;
}

export function aplicarTextos(raiz = document) {
  raiz.querySelectorAll("[data-i18n]").forEach((el) => {
    el.dataset.i18nPt ??= el.textContent.trim();
    el.textContent = t(el.dataset.i18nPt);
  });
  raiz.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    for (const a of el.dataset.i18nAttr.split(",")) {
      const chave = `i18nPt${a.replace(/(^|-)(\w)/g, (m, h, c) => c.toUpperCase())}`;
      el.dataset[chave] ??= el.getAttribute(a) ?? "";
      el.setAttribute(a, t(el.dataset[chave]));
    }
  });
}

const DIC = {
  // página
  "Calculadora Solar": ["Solar Calculator", "Calculadora Solar"],
  "Estime o sistema fotovoltaico, o investimento e o retorno com irradiação do seu local, tarifa da sua distribuidora e as regras da Lei 14.300.":
    ["Estimate the PV system, investment and payback using your location's solar irradiance, your utility's rate and Brazil's Law 14.300.",
     "Estime el sistema fotovoltaico, la inversión y el retorno con la irradiación de su ubicación, la tarifa de su distribuidora y las reglas de la Ley 14.300."],
  "Alternar tema": ["Toggle theme", "Cambiar tema"],
  "Idioma": ["Language", "Idioma"],
  "Quanto você economiza com energia solar?": ["How much can you save with solar energy?", "¿Cuánto ahorra con energía solar?"],
  "Dimensionamento, investimento e retorno com a irradiação do seu endereço, a tarifa da sua distribuidora e as regras atuais de geração distribuída.":
    ["System sizing, investment and payback based on the solar irradiance at your address, your utility's rate and Brazil's current distributed generation rules.",
     "Dimensionamiento, inversión y retorno con la irradiación de su dirección, la tarifa de su distribuidora y las reglas actuales de generación distribuida de Brasil."],
  "Irradiação NASA POWER": ["NASA POWER irradiance", "Irradiación NASA POWER"],
  "Tarifas ANEEL": ["ANEEL rates", "Tarifas ANEEL"],
  "Lei 14.300": ["Law 14.300", "Ley 14.300"],
  "Local": ["Location", "Ubicación"],
  "CEP do imóvel": ["Property ZIP code (CEP)", "Código postal del inmueble (CEP)"],
  "Buscar": ["Search", "Buscar"],
  "Distribuidora de energia": ["Electric utility", "Distribuidora de energía"],
  "Informe o CEP primeiro": ["Enter the ZIP code first", "Ingrese primero el código postal"],
  "Consumo": ["Consumption", "Consumo"],
  "Tipo de ligação": ["Service type", "Tipo de conexión"],
  "Monofásica": ["Single-phase", "Monofásica"],
  "Bifásica": ["Two-phase", "Bifásica"],
  "Trifásica": ["Three-phase", "Trifásica"],
  "Consumo médio mensal": ["Average monthly consumption", "Consumo medio mensual"],
  "Informar mês a mês": ["Enter month by month", "Ingresar mes a mes"],
  "Usar a média": ["Use the average", "Usar el promedio"],
  "Está na conta de luz, no histórico dos últimos 12 meses.": ["It's on your electricity bill, in the 12-month history.", "Está en la factura de luz, en el historial de los últimos 12 meses."],
  "Tarifa": ["Electricity rate", "Tarifa"],
  "Tarifa com impostos": ["Rate with taxes", "Tarifa con impuestos"],
  "Usar valor da ANEEL": ["Use ANEEL value", "Usar valor de ANEEL"],
  "Equipamentos": ["Equipment", "Equipos"],
  "Marca dos módulos": ["Panel brand", "Marca de los paneles"],
  "Marca do inversor": ["Inverter brand", "Marca del inversor"],
  "Premissas do cálculo": ["Calculation assumptions", "Supuestos del cálculo"],
  "Comece pelo CEP e pelo consumo": ["Start with the ZIP code and consumption", "Empiece por el código postal y el consumo"],
  "Em poucos segundos você vê o sistema indicado, quanto custa, quanto a conta cai e em quanto tempo o investimento se paga.":
    ["In a few seconds you'll see the recommended system, its cost, how much your bill drops and how long the investment takes to pay off.",
     "En pocos segundos verá el sistema indicado, cuánto cuesta, cuánto baja la factura y en cuánto tiempo se paga la inversión."],
  "Os resultados se atualizam enquanto você altera. Tem um orçamento? Coloque o preço por Wp.":
    ["Results update as you change values. Have a quote? Enter the price per Wp.", "Los resultados se actualizan mientras cambia los valores. ¿Tiene un presupuesto? Ingrese el precio por Wp."],
  "Fechar": ["Close", "Cerrar"],
  "Restaurar todos os padrões": ["Restore all defaults", "Restaurar todos los valores"],
  "Ver resultado": ["See results", "Ver resultado"],
  "Estimativa para orientação. Não substitui o projeto de um engenheiro nem o orçamento de um instalador.":
    ["Estimate for guidance only. It does not replace an engineer's design or an installer's quote.",
     "Estimación orientativa. No reemplaza el proyecto de un ingeniero ni el presupuesto de un instalador."],

  // premissas
  "Sistema": ["System", "Sistema"],
  "Custos": ["Costs", "Costos"],
  "Financeiro": ["Financial", "Financiero"],
  "Impostos na tarifa": ["Taxes on the rate", "Impuestos en la tarifa"],
  "Potência do módulo": ["Panel power", "Potencia del panel"],
  "Módulos residenciais atuais ficam entre 550 e 620 W.": ["Current residential panels are between 550 and 620 W.", "Los paneles residenciales actuales tienen entre 550 y 620 W."],
  "Desempenho do sistema": ["System performance", "Rendimiento del sistema"],
  "Perdas por calor, cabos, inversor e sujeira. O usual fica entre 75% e 82%.": ["Losses from heat, cables, inverter and dirt. Usually between 75% and 82%.", "Pérdidas por calor, cables, inversor y suciedad. Lo usual es entre 75% y 82%."],
  "Cobertura do consumo": ["Consumption coverage", "Cobertura del consumo"],
  "Quanto do consumo anual o sistema deve gerar.": ["How much of the annual consumption the system should generate.", "Cuánto del consumo anual debe generar el sistema."],
  "Consumo durante o dia": ["Daytime consumption", "Consumo durante el día"],
  "Parte da geração usada na hora, sem passar pela rede (não paga Fio B). Casa vazia de dia: 20% a 30%.":
    ["Share of generation used immediately, without going through the grid (no Fio B grid fee). Empty home during the day: 20% to 30%.",
     "Parte de la generación usada en el momento, sin pasar por la red (no paga Fio B). Casa vacía de día: 20% a 30%."],
  "Perda de geração por ano": ["Generation loss per year", "Pérdida de generación por año"],
  "Envelhecimento dos módulos. Os fabricantes garantem perdas de 0,4% a 0,55% ao ano.": ["Panel aging. Manufacturers warrant losses of 0.4% to 0.55% per year.", "Envejecimiento de los paneles. Los fabricantes garantizan pérdidas de 0,4% a 0,55% al año."],
  "Preço do seu orçamento": ["Your quote price", "Precio de su presupuesto"],
  "Tem orçamento? Divida o valor total pela potência em Wp. Vazio: preços de mercado coletados.":
    ["Have a quote? Divide the total by the power in Wp. Empty: collected market prices.", "¿Tiene presupuesto? Divida el total por la potencia en Wp. Vacío: precios de mercado recopilados."],
  "Estrutura, cabos e proteções": ["Mounting, cables and protection", "Estructura, cables y protecciones"],
  "Suportes do telhado, cabos, conectores, string box e disjuntores.": ["Roof mounts, cables, connectors, string box and breakers.", "Soportes del techo, cables, conectores, string box y disyuntores."],
  "Instalação, projeto e margem": ["Installation, design and margin", "Instalación, proyecto y margen"],
  "Mão de obra, projeto, homologação na distribuidora e margem do instalador, sobre os equipamentos.":
    ["Labor, design, utility approval and installer margin, as a share of equipment cost.", "Mano de obra, proyecto, homologación en la distribuidora y margen del instalador, sobre los equipos."],
  "Manutenção por ano": ["Maintenance per year", "Mantenimiento por año"],
  "Limpeza e revisões, em proporção ao investimento.": ["Cleaning and inspections, as a share of the investment.", "Limpieza y revisiones, en proporción a la inversión."],
  "Troca do inversor no ano": ["Inverter replacement in year", "Cambio del inversor en el año"],
  "Inversores duram de 10 a 15 anos. Use 0 para não considerar a troca.": ["Inverters last 10 to 15 years. Use 0 to skip the replacement.", "Los inversores duran de 10 a 15 años. Use 0 para no considerar el cambio."],
  "Custo da troca": ["Replacement cost", "Costo del cambio"],
  "Em proporção ao investimento inicial.": ["As a share of the initial investment.", "En proporción a la inversión inicial."],
  "Ano da instalação": ["Installation year", "Año de instalación"],
  "Define a parte do Fio B paga em cada ano, pela Lei 14.300.": ["Sets the share of the Fio B grid fee paid each year under Law 14.300.", "Define la parte del Fio B pagada cada año, según la Ley 14.300."],
  "Horizonte da análise": ["Analysis horizon", "Horizonte del análisis"],
  "Vida útil considerada. Os módulos têm garantia de 25 a 30 anos.": ["Lifetime considered. Panels have 25 to 30-year warranties.", "Vida útil considerada. Los paneles tienen garantía de 25 a 30 años."],
  "Reajuste da tarifa": ["Rate increase", "Reajuste de la tarifa"],
  "A tarifa tem subido acima da inflação nos últimos anos.": ["Rates have risen above inflation in recent years.", "La tarifa ha subido por encima de la inflación en los últimos años."],
  "Taxa de desconto": ["Discount rate", "Tasa de descuento"],
  "Quanto o dinheiro renderia em outra aplicação. Usada no VPL e no retorno descontado.":
    ["What the money would earn elsewhere. Used for NPV and discounted payback.", "Cuánto rendiría el dinero en otra inversión. Se usa en el VPN y en el retorno descontado."],
  "Vazio: alíquota padrão do estado do CEP. Alguns estados cobram por faixa de consumo.":
    ["Empty: standard rate of the ZIP code's state. Some states charge by consumption tier.", "Vacío: alícuota estándar del estado del código postal. Algunos estados cobran por franja de consumo."],
  "Muda todo mês na conta; em média fica entre 4% e 6%.": ["Changes monthly on the bill; usually between 4% and 6%.", "Cambia cada mes en la factura; en promedio entre 4% y 6%."],
  "ano": ["year", "año"],
  "anos": ["years", "años"],
  "% a.a.": ["%/yr", "% anual"],
  "alterada": ["changed", "modificado"],
  "restaurar": ["restore", "restaurar"],
  "padrão {v}": ["default {v}", "estándar {v}"],
  "auto": ["auto", "auto"],
  "{n} alterada": ["{n} changed", "{n} modificado"],
  "{n} alteradas": ["{n} changed", "{n} modificados"],

  // tarifa, distribuidora, marcas
  "Valor digitado. Pela ANEEL seria {valor} ({nome}, com ICMS {icms} e PIS/COFINS {pis}).":
    ["Value entered manually. ANEEL data gives {valor} ({nome}, with ICMS {icms} and PIS/COFINS {pis}).", "Valor ingresado. Según ANEEL sería {valor} ({nome}, con ICMS {icms} y PIS/COFINS {pis})."],
  "{nome}, vigente desde {data}: TE + TUSD de {base}, com ICMS {icms} e PIS/COFINS {pis}. Confira com a sua conta.":
    ["{nome}, in effect since {data}: TE + TUSD of {base}, with ICMS {icms} and PIS/COFINS {pis}. Check it against your bill.",
     "{nome}, vigente desde {data}: TE + TUSD de {base}, con ICMS {icms} y PIS/COFINS {pis}. Verifique con su factura."],
  "Atendem {cidade}": ["Serving {cidade}", "Atienden {cidade}"],
  "Outras distribuidoras": ["Other utilities", "Otras distribuidoras"],
  "Escolha a distribuidora": ["Choose the utility", "Elija la distribuidora"],
  "Média do mercado": ["Market average", "Promedio del mercado"],
  "na média": ["average", "en el promedio"],
  "{d}% vs. média": ["{d}% vs. average", "{d}% vs. promedio"],
  "Preços de {o} ofertas em {l} lojas, atualizados em {d}.": ["Prices from {o} offers in {l} stores, updated on {d}.", "Precios de {o} ofertas en {l} tiendas, actualizados el {d}."],

  // local
  "Buscando o CEP...": ["Looking up the ZIP code...", "Buscando el código postal..."],
  "Buscando os dados do local...": ["Fetching location data...", "Buscando los datos de la ubicación..."],
  "{cidade}/{uf}. Buscando a irradiação solar...": ["{cidade}/{uf}. Fetching solar irradiance...", "{cidade}/{uf}. Buscando la irradiación solar..."],
  "{cidade}/{uf}: {hsp} kWh/m² de sol por dia, em média.": ["{cidade}/{uf}: {hsp} kWh/m² of sun per day on average.", "{cidade}/{uf}: {hsp} kWh/m² de sol por día, en promedio."],
  "O serviço demorou para responder. Tente de novo.": ["The service took too long to respond. Please try again.", "El servicio tardó en responder. Intente de nuevo."],
  "Não foi possível buscar o CEP.": ["Couldn't look up the ZIP code.", "No fue posible buscar el código postal."],
  "CEP deve ter 8 dígitos": ["The ZIP code must have 8 digits", "El código postal debe tener 8 dígitos"],
  "CEP não encontrado": ["ZIP code not found", "Código postal no encontrado"],
  "Localização não encontrada": ["Location not found", "Ubicación no encontrada"],
  "Irradiação indisponível para este local": ["Irradiance unavailable for this location", "Irradiación no disponible para esta ubicación"],

  // link e tema
  "Copie o link da simulação:": ["Copy the simulation link:", "Copie el enlace de la simulación:"],
  "Link copiado": ["Link copied", "Enlace copiado"],
  "Copiar link": ["Copy link", "Copiar enlace"],
  "Tema: {nome}": ["Theme: {nome}", "Tema: {nome}"],
  "automático": ["automatic", "automático"],
  "claro": ["light", "claro"],
  "escuro": ["dark", "oscuro"],

  // prazos
  "não se paga": ["doesn't pay off", "no se paga"],
  "{n} ano": ["{n} year", "{n} año"],
  "{n} anos": ["{n} years", "{n} años"],
  "{n} mês": ["{n} month", "{n} mes"],
  "{n} meses": ["{n} months", "{n} meses"],
  " e ": [" and ", " y "],
  "menos de 1 mês": ["less than 1 month", "menos de 1 mes"],

  // resultados
  "Inversor acima de 10 kW costuma exigir ligação bifásica ou trifásica. Consulte a distribuidora.":
    ["Inverters above 10 kW usually require a two-phase or three-phase service. Check with your utility.", "Un inversor de más de 10 kW suele requerir conexión bifásica o trifásica. Consulte a la distribuidora."],
  "A ANEEL ainda não publicou o Fio B do ciclo atual da {nome}; usamos a proporção mais recente conhecida.":
    ["ANEEL hasn't published {nome}'s current Fio B yet; we use the latest known ratio.", "ANEEL aún no publicó el Fio B del ciclo actual de {nome}; usamos la proporción más reciente conocida."],
  "Com consumo tão baixo, a economia fica limitada pelo custo mínimo da ligação.": ["With such low consumption, savings are limited by the minimum service charge.", "Con un consumo tan bajo, el ahorro queda limitado por el costo mínimo de la conexión."],
  "Com estas premissas o investimento não se paga em {n} anos.": ["With these assumptions the investment doesn't pay off within {n} years.", "Con estos supuestos la inversión no se paga en {n} años."],
  "Preços de mercado indisponíveis no momento; o investimento usa uma referência por porte do sistema.":
    ["Market prices unavailable right now; the investment uses a reference by system size.", "Precios de mercado no disponibles en este momento; la inversión usa una referencia por tamaño del sistema."],
  "Os preços de mercado são de {d}; a coleta diária pode estar parada.": ["Market prices are from {d}; the daily collection may be stalled.", "Los precios de mercado son del {d}; la recopilación diaria puede estar detenida."],
  "Simulação de {d}": ["Simulation from {d}", "Simulación del {d}"],
  "Baixar relatório em PDF": ["Download PDF report", "Descargar informe en PDF"],
  "Economia estimada no 1º ano": ["Estimated savings in year 1", "Ahorro estimado en el 1.er año"],
  "/mês": ["/month", "/mes"],
  "{p} a menos na parte de energia da conta, {v} no ano.": ["{p} less on the energy part of your bill, {v} per year.", "{p} menos en la parte de energía de la factura, {v} al año."],
  "Conta hoje": ["Bill today", "Factura hoy"],
  "Com o sistema": ["With the system", "Con el sistema"],
  "Sem o sistema": ["Without the system", "Sin el sistema"],
  "Investimento estimado": ["Estimated investment", "Inversión estimada"],
  "{v} por Wp instalado": ["{v} per installed Wp", "{v} por Wp instalado"],
  "(seu valor)": ["(your value)", "(su valor)"],
  "Retorno do investimento": ["Payback", "Retorno de la inversión"],
  "{v} considerando {t} a.a.": ["{v} at {t} per year", "{v} considerando {t} anual"],
  "Ganho em {n} anos": ["Gain over {n} years", "Ganancia en {n} años"],
  "já descontado o investimento": ["net of the investment", "ya descontada la inversión"],
  "Potência": ["Power", "Potencia"],
  "{n} módulos de {w} W": ["{n} panels of {w} W", "{n} paneles de {w} W"],
  "Inversor": ["Inverter", "Inversor"],
  "relação {r} CC/CA": ["{r} DC/AC ratio", "relación {r} CC/CA"],
  "Área no telhado": ["Roof area", "Área en el techo"],
  "sem contar espaçamentos": ["not counting spacing", "sin contar espaciados"],
  "Geração média": ["Average generation", "Generación media"],
  "kWh/mês": ["kWh/month", "kWh/mes"],
  "consumo de {c} kWh/mês": ["consumption of {c} kWh/month", "consumo de {c} kWh/mes"],
  "Mês a mês no 1º ano": ["Month by month in year 1", "Mes a mes en el 1.er año"],
  "Energia": ["Energy", "Energía"],
  "Conta": ["Bill", "Factura"],
  "Geração": ["Generation", "Generación"],
  "Geração estimada": ["Estimated generation", "Generación estimada"],
  "Saldo acumulado do investimento": ["Cumulative investment balance", "Saldo acumulado de la inversión"],
  "Ver tabela ano a ano": ["See year-by-year table", "Ver tabla año a año"],
  "Indicadores": ["Indicators", "Indicadores"],
  "Taxa interna de retorno (TIR)": ["Internal rate of return (IRR)", "Tasa interna de retorno (TIR)"],
  "a.a.": ["per year", "anual"],
  "Valor presente líquido (VPL)": ["Net present value (NPV)", "Valor presente neto (VPN)"],
  "Economia na conta em {n} anos": ["Bill savings over {n} years", "Ahorro en la factura en {n} años"],
  "Tarifa usada": ["Rate used", "Tarifa usada"],
  "Fio B pago no 1º ano": ["Fio B paid in year 1", "Fio B pagado en el 1.er año"],
  "Valores sem iluminação pública e bandeiras tarifárias, que continuam na conta. A parte do Fio B paga sobe até {p} em 2028.":
    ["Values exclude public lighting fees and tariff flags, which remain on the bill. The share of Fio B paid rises to {p} in 2028.",
     "Valores sin alumbrado público ni banderas tarifarias, que siguen en la factura. La parte del Fio B pagada sube hasta {p} en 2028."],
  "Como calculamos": ["How we calculate", "Cómo calculamos"],
  "Irradiação média mensal da {nasa} para {cidade}, com desempenho de {d}.": ["Average monthly irradiance from {nasa} for {cidade}, with {d} performance.", "Irradiación media mensual de {nasa} para {cidade}, con rendimiento de {d}."],
  "Tarifa residencial da {aneel}, dados de {d}.": ["Residential rate from {aneel}, data from {d}.", "Tarifa residencial de {aneel}, datos del {d}."],
  "Lei 14.300: Fio B escalonado sobre a energia compensada (100% a partir de 2029, por prudência) e custo mínimo de {n} kWh só quando o consumo da rede fica abaixo dele.":
    ["Law 14.300: phased-in Fio B grid fee on credited energy (100% from 2029, to be conservative) and a minimum charge of {n} kWh only when grid consumption falls below it.",
     "Ley 14.300: Fio B escalonado sobre la energía compensada (100% desde 2029, por prudencia) y costo mínimo de {n} kWh solo cuando el consumo de la red queda por debajo."],
  "Reajuste de {r} a.a., perda de geração de {g} a.a., manutenção e {troca}.": ["Rate increase of {r} per year, generation loss of {g} per year, maintenance and {troca}.", "Reajuste de {r} anual, pérdida de generación de {g} anual, mantenimiento y {troca}."],
  "troca do inversor no ano {n}": ["inverter replacement in year {n}", "cambio del inversor en el año {n}"],
  "sem troca do inversor": ["no inverter replacement", "sin cambio del inversor"],
  "Dados informados": ["Inputs", "Datos ingresados"],
  "Distribuidora": ["Utility", "Distribuidora"],
  "Link da simulação:": ["Simulation link:", "Enlace de la simulación:"],
  "Investimento": ["Investment", "Inversión"],
  "Referência de {v} por Wp para um sistema de {k} kWp, já instalado. Os preços de mercado aparecem aqui quando a coleta diária está disponível.":
    ["Reference of {v} per Wp for an installed {k} kWp system. Market prices appear here when the daily collection is available.",
     "Referencia de {v} por Wp para un sistema de {k} kWp instalado. Los precios de mercado aparecen aquí cuando la recopilación diaria está disponible."],
  "Módulos": ["Panels", "Paneles"],
  "{n} × {w} W a {v}/Wp": ["{n} × {w} W at {v}/Wp", "{n} × {w} W a {v}/Wp"],
  "{p} dos equipamentos": ["{p} of equipment", "{p} de los equipos"],
  "O resultado usa o preço do seu orçamento ({v}, {w}/Wp). Pelos preços de mercado seria {m}.":
    ["Results use your quote price ({v}, {w}/Wp). At market prices it would be {m}.", "El resultado usa el precio de su presupuesto ({v}, {w}/Wp). A precios de mercado sería {m}."],
  "Composição do investimento": ["Investment breakdown", "Composición de la inversión"],
  "Preços de mercado": ["Market prices", "Precios de mercado"],
  "A coleta de preços não está disponível agora.": ["Price collection isn't available right now.", "La recopilación de precios no está disponible ahora."],
  "{n} oferta": ["{n} offer", "{n} oferta"],
  "{n} ofertas": ["{n} offers", "{n} ofertas"],
  "Loja": ["Store", "Tienda"],
  "Módulos (mediana)": ["Panels (median)", "Paneles (mediana)"],
  "Inversores on-grid": ["Grid-tie inverters", "Inversores on-grid"],
  "Módulos: média entre lojas de {v}/Wp, ofertas de {min} a {max}/Wp.": ["Panels: average across stores of {v}/Wp, offers from {min} to {max}/Wp.", "Paneles: promedio entre tiendas de {v}/Wp, ofertas de {min} a {max}/Wp."],
  "Inversor de {k} kW: {v} na média do mercado, pela curva de preço × potência de {n} ofertas.":
    ["{k} kW inverter: {v} at market average, from the price × power curve of {n} offers.", "Inversor de {k} kW: {v} en el promedio del mercado, por la curva de precio × potencia de {n} ofertas."],
  "Só itens em estoque, sem valores extremos. Nos módulos cada loja pesa igual; na curva dos inversores, lojas com mais ofertas pesam um pouco mais.":
    ["In-stock items only, outliers removed. For panels each store weighs the same; in the inverter curve, stores with more offers weigh a bit more.",
     "Solo artículos en stock, sin valores extremos. En los paneles cada tienda pesa igual; en la curva de inversores, las tiendas con más ofertas pesan un poco más."],
  "Instalação": ["Installation", "Instalación"],
  "Ano {n}": ["Year {n}", "Año {n}"],
  "Saldo do ano": ["Year balance", "Saldo del año"],
  "Acumulado": ["Cumulative", "Acumulado"],
  "início": ["start", "inicio"],
  "ano {n}": ["year {n}", "año {n}"],
  "Ano": ["Year", "Año"],
  "Geração (kWh)": ["Generation (kWh)", "Generación (kWh)"],
  "Conta sem": ["Bill without", "Factura sin"],
  "Conta com": ["Bill with", "Factura con"],
  "Manutenção": ["Maintenance", "Mantenimiento"],
};
