// Busca de dados externos: CEP -> município e coordenadas, irradiação (NASA POWER), tarifas (ANEEL).

const MESES_NASA = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

async function json(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function cacheLer(chave) {
  try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; }
}
function cacheGravar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
}

const normalizar = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function codigoIbge(cidade, uf) {
  const lista = await json(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
  const alvo = normalizar(cidade);
  return String(lista.find((m) => normalizar(m.nome) === alvo)?.id ?? "");
}

async function coordenadas(cidade, uf) {
  const q = new URLSearchParams({ city: cidade, state: uf, country: "Brasil", format: "json", limit: "1" });
  const r = await json(`https://nominatim.openstreetmap.org/search?${q}`);
  if (!r.length) throw new Error("Localização não encontrada");
  return { lat: Number(r[0].lat), lon: Number(r[0].lon) };
}

// CEP -> { cep, cidade, uf, ibge, lat, lon }
export async function buscarCep(cepBruto) {
  const cep = cepBruto.replace(/\D/g, "");
  if (cep.length !== 8) throw new Error("CEP deve ter 8 dígitos");
  const salvo = cacheLer(`cep:${cep}`);
  if (salvo) return salvo;

  let cidade, uf, ibge = "", lat = NaN, lon = NaN;
  try {
    const b = await json(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    cidade = b.city; uf = b.state; ibge = b.ibge?.city ?? "";
    lat = Number(b.location?.coordinates?.latitude);
    lon = Number(b.location?.coordinates?.longitude);
  } catch {
    const v = await json(`https://viacep.com.br/ws/${cep}/json/`);
    if (v.erro) throw new Error("CEP não encontrado");
    cidade = v.localidade; uf = v.uf; ibge = v.ibge ?? "";
  }
  if (!cidade) throw new Error("CEP não encontrado");
  if (!ibge) ibge = await codigoIbge(cidade, uf).catch(() => "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) ({ lat, lon } = await coordenadas(cidade, uf));

  const res = { cep, cidade, uf, ibge, lat, lon };
  cacheGravar(`cep:${cep}`, res);
  return res;
}

// Irradiação global horizontal média por mês (kWh/m²/dia = horas de sol pleno), média 2001-hoje
export async function buscarIrradiacao(lat, lon) {
  const la = lat.toFixed(2), lo = lon.toFixed(2);
  const chave = `hsp:${la},${lo}`;
  const salvo = cacheLer(chave);
  if (salvo) return salvo;
  const url = "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN"
    + `&community=RE&longitude=${lo}&latitude=${la}&format=JSON`;
  const r = await json(url, 25000);
  const p = r.properties.parameter.ALLSKY_SFC_SW_DWN;
  const hsp = MESES_NASA.map((m) => p[m]);
  if (hsp.some((v) => !(v > 0))) throw new Error("Irradiação indisponível para este local");
  cacheGravar(chave, hsp);
  return hsp;
}

let tarifasPromise, municipiosPromise, precosPromise;
// Preços de mercado da coleta diária; null se o arquivo faltar (o app usa a tabela de referência)
export const carregarPrecos = () => (precosPromise ??= json("data/precos.json").catch(() => null));
export const carregarTarifas = () => (tarifasPromise ??= json("data/tarifas.json"));
export const carregarMunicipios = () => (municipiosPromise ??= json("data/municipios.json"));

// Distribuidoras que atendem o município, da mais comum para a menos comum
export async function distribuidorasDoMunicipio(ibge) {
  const [t, m] = await Promise.all([carregarTarifas(), carregarMunicipios()]);
  return (m.municipios[ibge] ?? []).map((i) => t.distribuidoras[i]).filter(Boolean);
}
