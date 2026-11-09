"""Gera os dados estáticos usados pelo app a partir dos dados abertos da ANEEL.

Saídas:
  data/tarifas.json    tarifa B1 residencial convencional vigente (TE, TUSD, Fio B) por distribuidora
  data/municipios.json distribuidoras que atendem cada município (código IBGE), da mais comum para a menos comum

Uso:
  python scripts/atualizar_dados.py                    # só tarifas
  python scripts/atualizar_dados.py --gd arquivo.parquet  # tarifas + municípios (precisa de pyarrow)

O parquet de municípios é a base "Relação de empreendimentos de geração distribuída" da ANEEL:
https://dadosabertos.aneel.gov.br/dataset/relacao-de-empreendimentos-de-geracao-distribuida
"""
import argparse
import datetime as dt
import json
import pathlib
import time
import urllib.parse
import urllib.request

API = "https://dadosabertos.aneel.gov.br/api/3/action/"
RES_TARIFAS = "fcf2906c-7c32-4b9b-a637-054e7a5234f4"  # tarifas-homologadas-distribuidoras-energia-eletrica.csv
PACOTE_COMPONENTES = "componentes-tarifarias"
RAIZ = pathlib.Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"

# Nomes comerciais atuais (a ANEEL mantém siglas antigas)
NOMES = {
    "CEA": "CEA Equatorial", "CEEE-D": "CEEE Equatorial", "CELESC": "Celesc", "CEMIG-D": "Cemig",
    "COELBA": "Neoenergia Coelba", "COPEL-DIS": "Copel", "COSERN": "Neoenergia Cosern",
    "CPFL-PAULISTA": "CPFL Paulista", "CPFL-PIRATINING": "CPFL Piratininga", "DMED": "DME Poços de Caldas",
    "EAC": "Energisa Acre", "ELEKTRO": "Neoenergia Elektro", "ELETROPAULO": "Enel SP", "EMR": "Energisa Minas Rio",
    "EMS": "Energisa Mato Grosso do Sul", "EMT": "Energisa Mato Grosso", "ENEL CE": "Enel CE", "ENEL RJ": "Enel RJ",
    "EPB": "Energisa Paraíba", "ERO": "Energisa Rondônia", "ESE": "Energisa Sergipe", "ESS": "Energisa Sul-Sudeste",
    "ETO": "Energisa Tocantins", "EQUATORIAL AL": "Equatorial Alagoas", "EQUATORIAL GO": "Equatorial Goiás",
    "EQUATORIAL MA": "Equatorial Maranhão", "EQUATORIAL PA": "Equatorial Pará", "EQUATORIAL PI": "Equatorial Piauí",
    "LIGHT SESA": "Light", "RGE": "RGE (CPFL)", "SULGIPE": "Sulgipe", "CHESP": "Chesp", "CERSAD DISTRIBUI": "CERSAD",
}


def chamar(acao, **params):
    url = API + acao + "?" + urllib.parse.urlencode(params)
    for tentativa in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.load(r)["result"]
        except Exception:
            if tentativa == 3:
                raise
            time.sleep(5 * (tentativa + 1))


def buscar_todos(resource_id, filtros):
    registros, offset = [], 0
    while True:
        res = chamar("datastore_search", resource_id=resource_id, limit=5000, offset=offset,
                     filters=json.dumps(filtros, ensure_ascii=False))
        registros += res["records"]
        offset += len(res["records"])
        if not res["records"] or offset >= res["total"]:
            return registros


def num(v):
    return float(str(v).replace(",", "."))


def tarifas():
    hoje = dt.date.today().isoformat()
    filtros = {
        "DscSubGrupo": "B1", "DscModalidadeTarifaria": "Convencional", "DscClasse": "Residencial",
        "DscSubClasse": "Residencial", "DscBaseTarifaria": "Tarifa de Aplicação", "DscDetalhe": "Não se aplica",
    }
    vigentes = {}
    for r in buscar_todos(RES_TARIFAS, filtros):
        if r["DatInicioVigencia"] > hoje or r["DscUnidadeTerciaria"] != "MWh":
            continue
        atual = vigentes.get(r["NumCNPJDistribuidora"])
        if atual is None or r["DatInicioVigencia"] > atual["DatInicioVigencia"]:
            vigentes[r["NumCNPJDistribuidora"]] = r

    # Fio B (TUSD_FioB) e TUSD dos componentes tarifários dos últimos três anos
    pacote = chamar("package_show", id=PACOTE_COMPONENTES)
    ano = dt.date.today().year
    anos = {str(ano - i) for i in range(3)}
    comp = {}  # (cnpj, inicio) -> {"TUSD_FioB": v, "TUSD": v}
    for res in pacote["resources"]:
        if not any(res["name"].endswith(a + ".csv") for a in anos) or not res.get("datastore_active"):
            continue
        filtros_c = {
            "DscSubGrupoTarifario": "B1", "DscModalidadeTarifaria": "Convencional",
            "DscClasseConsumidor": "Residencial", "DscSubClasseConsumidor": "Residencial",
            "DscBaseTarifaria": "Tarifa de Aplicação", "DscDetalheConsumidor": "Não se aplica",
            "DscComponenteTarifario": ["TUSD_FioB", "TUSD"],
        }
        for r in buscar_todos(res["id"], filtros_c):
            comp.setdefault((r["NumCPFCNPJ"], r["DatInicioVigencia"]), {})[r["DscComponenteTarifario"]] = num(r["VlrComponenteTarifario"])

    # proporção Fio B / TUSD mais recente de cada distribuidora (para quem não publicou a do ciclo atual)
    proporcao = {}
    for (cnpj, inicio), v in sorted(comp.items(), key=lambda kv: kv[0][1]):
        if v.get("TUSD_FioB") and v.get("TUSD"):
            proporcao[cnpj] = v["TUSD_FioB"] / v["TUSD"]
    valores = sorted(proporcao.values())
    mediana = valores[len(valores) // 2] if valores else 0.40

    corte = (dt.date.today() - dt.timedelta(days=180)).isoformat()
    lista = []
    for cnpj, r in sorted(vigentes.items(), key=lambda kv: NOMES.get(kv[1]["SigAgente"], kv[1]["SigAgente"]).lower()):
        if r["DatFimVigencia"] < corte or r["SigAgente"] == "Não Informado":
            continue  # distribuidora incorporada ou sem reajuste recente
        tusd, te = num(r["VlrTUSD"]), num(r["VlrTE"])
        fb = comp.get((cnpj, r["DatInicioVigencia"]), {}).get("TUSD_FioB")
        origem = "ANEEL"
        if not fb:
            fb, origem = (tusd * proporcao[cnpj], "proporcao") if cnpj in proporcao else (tusd * mediana, "mediana")
        lista.append({
            "cnpj": cnpj, "nome": NOMES.get(r["SigAgente"], r["SigAgente"]), "te": te, "tusd": tusd,
            "fioB": round(fb, 2), "fioBOrigem": origem,
            "inicio": r["DatInicioVigencia"], "fim": r["DatFimVigencia"],
        })
    return lista


def municipios(parquet, cnpjs):
    import pyarrow.parquet as pq
    from collections import Counter, defaultdict

    tab = pq.read_table(parquet, columns=["CodMunicipioIbge", "NumCNPJDistribuidora", "SigTipoGeracao"])
    cont = defaultdict(Counter)
    for mun, cnpj, tipo in zip(*(tab.column(c).to_pylist() for c in tab.column_names)):
        if mun and cnpj and tipo == "UFV":
            cont[str(mun)][str(cnpj).zfill(14)] += 1
    indice = {c: i for i, c in enumerate(cnpjs)}
    saida = {}
    for mun, c in cont.items():
        total = sum(c.values())
        # distribuidoras com pelo menos 3% das usinas do município
        sel = [indice[k] for k, n in c.most_common() if k in indice and n / total >= 0.03]
        if sel:
            saida[mun] = sel
    return dict(sorted(saida.items()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gd", help="parquet de empreendimentos de geração distribuída")
    args = ap.parse_args()
    DATA.mkdir(exist_ok=True)

    lista = tarifas()
    gerado = dt.date.today().isoformat()
    (DATA / "tarifas.json").write_text(json.dumps(
        {"gerado": gerado, "fonte": "ANEEL - Tarifas homologadas e componentes tarifárias (dados abertos)",
         "unidade": "R$/MWh sem impostos", "distribuidoras": lista},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"tarifas.json: {len(lista)} distribuidoras, {sum(d['fioBOrigem'] != 'ANEEL' for d in lista)} com Fio B estimado")

    if args.gd:
        mun = municipios(args.gd, [d["cnpj"] for d in lista])
        (DATA / "municipios.json").write_text(json.dumps(
            {"gerado": gerado, "fonte": "ANEEL - Relação de empreendimentos de geração distribuída", "municipios": mun},
            separators=(",", ":")), encoding="utf-8")
        print(f"municipios.json: {len(mun)} municípios")


if __name__ == "__main__":
    main()
