"""Coleta preços de módulos fotovoltaicos e inversores on-grid em lojas com catálogo público.

Saídas:
  data/precos.json            resumo usado pelo app (R$/Wp de módulos, R$/kW de inversores por faixa, marcas)
  data/precos-historico.csv   uma linha por dia, para acompanhar a evolução

Fontes (só APIs públicas da própria loja, respeitando o robots.txt, uma requisição por segundo):
  Neosolar      Magento GraphQL   https://www.neosolar.com.br/graphql
  Energia Total Tray web_api      https://www.energiatotal.com.br/web_api/products
  Solar Brasil  Magento GraphQL   https://www.solarbrasil.com.br/graphql (POST)
  Mercado Livre API oficial       só se ML_CLIENT_ID e ML_CLIENT_SECRET estiverem definidos

Lojas que bloqueiam acesso automatizado (desafio anti-robô, 403) ficam de fora.
Uso: python scripts/coletar_precos.py [--detalhes]
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import re
import statistics
import time
import urllib.parse
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
UA = "Mozilla/5.0 (compatible; calculadora-solar/2.0; +https://gmenge.github.io/calculadora-solar/)"
PAUSA = 1.0

# Faixas de inversor (kW) usadas no app para interpolar o preço
FAIXAS_INV = [(0, 3.5), (3.5, 5.5), (5.5, 8.5), (8.5, 12.5), (12.5, 20.5), (20.5, 40.5), (40.5, 80)]

MARCAS_MODULO = ["JA Solar", "Jinko", "Trina", "LONGi", "Canadian", "Risen", "Astronergy", "BYD", "Leapton", "Resun",
                 "Osda", "DAH", "Tongwei", "ZNShine", "Sunova", "Honor", "Ztroon", "Aiko", "Maxeon", "Era Solar",
                 "Runergy", "Helius", "Bluesun", "Komaes", "Ulica", "Hanersun", "Gokin", "Seraphim", "Yingli",
                 "Sinosola", "Phono", "Tsun", "DMEGC", "Elgin", "Sunergy", "Jetion", "Minasol", "Ronma"]
MARCAS_INVERSOR = ["Growatt", "Deye", "Sungrow", "Solis", "GoodWe", "Huawei", "Fronius", "SAJ", "Hoymiles", "APsystems",
                   "Canadian", "WEG", "Sofar", "Chint", "Hopewind", "WDC", "Livoltek", "FoxESS", "Tsuness", "NEP",
                   "Enphase", "Refusol", "SMA", "ABB", "Ecosolys", "Kehua", "Afore", "Intelbras", "Elgin", "Auxsol"]
APELIDOS = {"astroenergy": "Astronergy", "chint astro": "Astronergy", "ja ": "JA Solar", "jinko solar": "Jinko",
            "trina solar": "Trina", "canadian solar": "Canadian", "risen energy": "Risen", "hoymiles": "Hoymiles",
            "ap systems": "APsystems", "solplanet": "Solplanet", "znshine": "ZNShine", "goodwe": "GoodWe", "foxess": "FoxESS"}


def pedir(url, dados=None, cabecalhos=None, tentativas=3):
    cab = {"User-Agent": UA, "Accept": "application/json"}
    cab.update(cabecalhos or {})
    corpo = None
    if dados is not None:
        corpo = json.dumps(dados).encode() if isinstance(dados, dict) else dados
        cab.setdefault("Content-Type", "application/json")
    for t in range(tentativas):
        try:
            req = urllib.request.Request(url, data=corpo, headers=cab)
            with urllib.request.urlopen(req, timeout=60) as r:
                time.sleep(PAUSA)
                return json.load(r)
        except Exception:
            if t == tentativas - 1:
                raise
            time.sleep(5 * (t + 1))


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def marca(nome, lista, dica=""):
    texto = f" {dica} {nome} ".lower()
    for apelido, m in APELIDOS.items():
        if apelido in texto:
            return m if m in lista or m == "Solplanet" else m
    for m in lista:
        if re.search(rf"(?<![a-z]){re.escape(m.lower())}(?![a-z])", texto):
            return m
    return None


# ---------- classificação pelo nome ----------

RE_EXCLUI_MOD = re.compile(r"flex[ií]vel|port[aá]til|pallet|palete|container|cont[eê]iner|bomba|carregador|"
                           r"led|lumin|refletor|poste|ventilador|controlador|bateria|suporte|estrutura|grampo|cabo|"
                           r"usad|avariad|outlet|mostru", re.I)
RE_EXCLUI_INV = re.compile(r"h[ií]brido|hybrid|off[\s-]?grid|bomba|drive|carregador|onda|senoidal|bateria|kit|"
                           r"string box|stringbox|datalogger|wi-?fi|monitor|medidor|smart meter|cabo|conector|"
                           r"usad|avariad|outlet|mostru|12v|24v|48v", re.I)


def watts_modulo(nome):
    """(watts, unidades) de um módulo avulso ou pacote "Kit com N painéis"; None se não for módulo."""
    if not re.search(r"painel|pain[eé]is|placa|m[oó]dulo", nome, re.I) or RE_EXCLUI_MOD.search(nome):
        return None
    unidades = 1
    if re.search(r"\bkit\b", nome, re.I):
        k = re.search(r"kit\s+(?:com\s+)?(\d+)\s*(?:pain|placa|m[oó]dulo)", nome, re.I)
        if not k:
            return None  # kit de sistema (com inversor), não serve para preço de módulo
        unidades = int(k.group(1))
    m = re.search(r"(\d{3})\s?w(?:p)?\b", nome, re.I)
    if not m:
        return None
    w = int(m.group(1))
    return (w, unidades) if 400 <= w <= 800 and unidades >= 1 else None


def kw_inversor(nome):
    if not re.search(r"inversor|microinversor", nome, re.I) or RE_EXCLUI_INV.search(nome):
        return None
    micro = bool(re.search(r"micro", nome, re.I))
    m = re.search(r"(\d+(?:[.,]\d+)?)\s?kw(?!h)", nome, re.I)
    if m:
        kw = float(m.group(1).replace(",", "."))
    else:
        m = re.search(r"(\d{3,5})\s?w\b", nome, re.I) or re.search(r"(\d{4,5})\s?(?:tl|ktl)", nome, re.I)
        if not m:
            m2 = re.search(r"(?:sun-?|sg|csi-?)(\d{1,2}(?:[.,]\d)?)k", nome, re.I)
            if not m2:
                return None
            kw = float(m2.group(1).replace(",", "."))
        else:
            kw = int(m.group(1)) / 1000
    if not 0.3 <= kw <= 80:
        return None
    return kw, micro


def classificar(nome, preco, loja, url, marca_loja=""):
    nome = norm(nome)
    if not preco or preco <= 0:
        return None
    wm = watts_modulo(nome)
    if wm:
        w, unidades = wm
        return {"tipo": "modulo", "loja": loja, "nome": nome, "preco": round(preco / unidades, 2), "w": w,
                "unidades": unidades, "rsWp": round(preco / unidades / w, 4), "marca": marca(nome, MARCAS_MODULO, marca_loja), "url": url}
    k = kw_inversor(nome)
    if k:
        kw, micro = k
        return {"tipo": "micro" if micro else "inversor", "loja": loja, "nome": nome, "preco": round(preco, 2),
                "kw": kw, "rsKw": round(preco / kw, 2), "marca": marca(nome, MARCAS_INVERSOR, marca_loja), "url": url}
    return None


# ---------- fontes ----------

def magento(loja, base, buscas, post=False):
    itens, vistos = [], set()
    consulta = ("query($q:String!,$p:Int!){products(search:$q,pageSize:100,currentPage:$p){total_count "
                "page_info{total_pages} items{sku name url_key stock_status "
                "price_range{minimum_price{final_price{value}}}}}}")
    for busca in buscas:
        pagina = 1
        while True:
            vars_ = {"q": busca, "p": pagina}
            if post:
                r = pedir(base + "/graphql", {"query": consulta, "variables": vars_})
            else:
                qs = urllib.parse.urlencode({"query": consulta, "variables": json.dumps(vars_)})
                r = pedir(f"{base}/graphql?{qs}")
            prod = r["data"]["products"]
            for i in prod["items"]:
                if i["sku"] in vistos or i["stock_status"] != "IN_STOCK":
                    continue
                vistos.add(i["sku"])
                preco = i["price_range"]["minimum_price"]["final_price"]["value"]
                c = classificar(i["name"], preco, loja, f"{base}/{i['url_key']}.html" if i.get("url_key") else base)
                if c:
                    itens.append(c)
            if pagina >= min(prod["page_info"]["total_pages"], 10):
                break
            pagina += 1
    return itens


def tray(loja, base):
    itens, pagina = [], 1
    while True:
        r = pedir(f"{base}/web_api/products?limit=50&page={pagina}")
        for p in r.get("Products", []):
            p = p["Product"]
            if str(p.get("available")) != "1" or str(p.get("available_for_purchase", "1")) == "0":
                continue
            preco = float(p.get("promotional_price") or 0) or float(p.get("price") or 0)
            url = p.get("url", {}).get("https") if isinstance(p.get("url"), dict) else base
            c = classificar(p["name"], preco, loja, url or base, p.get("brand") or "")
            if c:
                itens.append(c)
        pag = r["paging"]
        if pag["page"] * pag["limit"] >= pag["total"] or pagina >= 40:
            break
        pagina += 1
    return itens


def mercado_livre():
    cid, seg = os.environ.get("ML_CLIENT_ID"), os.environ.get("ML_CLIENT_SECRET")
    if not (cid and seg):
        return None
    tok = pedir("https://api.mercadolibre.com/oauth/token",
                urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": cid,
                                        "client_secret": seg}).encode(),
                {"Content-Type": "application/x-www-form-urlencoded"})["access_token"]
    cab = {"Authorization": f"Bearer {tok}"}
    itens, vistos = [], set()
    for busca in ["painel solar 550w", "painel solar 580w", "painel solar 610w", "painel solar 700w",
                  "inversor on grid 3kw", "inversor on grid 5kw", "inversor on grid 8kw", "inversor on grid 10kw",
                  "inversor on grid 15kw", "inversor on grid 25kw", "microinversor 2kw"]:
        for offset in (0, 50):
            r = pedir("https://api.mercadolibre.com/sites/MLB/search?" + urllib.parse.urlencode(
                {"q": busca, "condition": "new", "limit": 50, "offset": offset}), cabecalhos=cab)
            for i in r.get("results", []):
                if i["id"] in vistos:
                    continue
                vistos.add(i["id"])
                c = classificar(i["title"], float(i.get("price") or 0), "Mercado Livre", i.get("permalink", ""))
                if c:
                    itens.append(c)
    return itens


FONTES = [
    ("Neosolar", "https://www.neosolar.com.br",
     lambda: magento("Neosolar", "https://www.neosolar.com.br", ["painel solar", "inversor on grid", "microinversor"])),
    ("Energia Total", "https://www.energiatotal.com.br",
     lambda: tray("Energia Total", "https://www.energiatotal.com.br")),
    ("Solar Brasil", "https://www.solarbrasil.com.br",
     lambda: magento("Solar Brasil", "https://www.solarbrasil.com.br", ["painel", "inversor"], post=True)),
    ("Mercado Livre", "https://www.mercadolivre.com.br", mercado_livre),
]


# ---------- estatística ----------

def sem_extremos(valores):
    """Remove valores fora de 1,5 intervalo interquartil (com 4 ou mais valores)."""
    if len(valores) < 4:
        return valores
    q1, _, q3 = statistics.quantiles(valores, n=4)
    iqr = q3 - q1
    return [v for v in valores if q1 - 1.5 * iqr <= v <= q3 + 1.5 * iqr]


def resumo(itens, campo, faixa_ok):
    """Média das medianas de cada loja (cada loja pesa igual) e faixa de preços."""
    por_loja = {}
    for i in itens:
        if faixa_ok[0] <= i[campo] <= faixa_ok[1]:
            por_loja.setdefault(i["loja"], []).append(i[campo])
    medianas, todos = {}, []
    for loja, vals in por_loja.items():
        vals = sem_extremos(vals)
        if vals:
            medianas[loja] = round(statistics.median(vals), 4)
            todos += vals
    if not medianas:
        return None
    return {"valor": round(statistics.mean(medianas.values()), 4), "porLoja": medianas,
            "min": round(min(todos), 4), "max": round(max(todos), 4), "ofertas": len(todos)}


def curva_inversor(invs, faixa):
    """Ajusta preço = a * kW^b (mínimos quadrados em log), cada oferta com peso 1/raiz(ofertas da loja).
    Remove ofertas cujo resíduo fica fora de 1,5 intervalo interquartil e ajusta de novo."""
    import math
    pontos = [i for i in invs if faixa[0] <= i["rsKw"] <= faixa[1]]
    if len({round(i["kw"]) for i in pontos}) < 3:
        return None

    def ajustar(pts):
        por_loja = {}
        for i in pts:
            por_loja[i["loja"]] = por_loja.get(i["loja"], 0) + 1
        w = [por_loja[i["loja"]] ** -0.5 for i in pts]  # 1/raiz(n): loja grande pesa mais, sem dominar
        x = [math.log(i["kw"]) for i in pts]
        y = [math.log(i["preco"]) for i in pts]
        sw = sum(w)
        mx = sum(wi * xi for wi, xi in zip(w, x)) / sw
        my = sum(wi * yi for wi, yi in zip(w, y)) / sw
        b = sum(wi * (xi - mx) * (yi - my) for wi, xi, yi in zip(w, x, y)) / sum(wi * (xi - mx) ** 2 for wi, xi in zip(w, x))
        return math.exp(my - b * mx), b

    a, b = ajustar(pontos)
    residuos = [math.log(i["preco"] / (a * i["kw"] ** b)) for i in pontos]
    if len(residuos) >= 6:
        q1, _, q3 = statistics.quantiles(residuos, n=4)
        iqr = q3 - q1
        pontos = [p for p, r in zip(pontos, residuos) if q1 - 1.5 * iqr <= r <= q3 + 1.5 * iqr]
        a, b = ajustar(pontos)
    lojas = {}
    for i in pontos:
        lojas[i["loja"]] = lojas.get(i["loja"], 0) + 1
    return {"a": round(a, 2), "b": round(b, 4), "ofertas": len(pontos), "porLoja": lojas,
            "deKw": min(i["kw"] for i in pontos), "ateKw": max(i["kw"] for i in pontos)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--detalhes", action="store_true", help="grava data/precos-itens.json com todas as ofertas")
    args = ap.parse_args()
    DATA.mkdir(exist_ok=True)

    itens, fontes = [], []
    for nome, site, coletar in FONTES:
        try:
            r = coletar()
        except Exception as e:  # uma loja fora do ar não derruba a coleta
            print(f"{nome}: falhou ({e})")
            fontes.append({"nome": nome, "site": site, "ok": False})
            continue
        if r is None:
            continue  # fonte opcional não configurada
        print(f"{nome}: {sum(i['tipo'] == 'modulo' for i in r)} módulos, {sum(i['tipo'] == 'inversor' for i in r)} inversores, "
              f"{sum(i['tipo'] == 'micro' for i in r)} microinversores")
        fontes.append({"nome": nome, "site": site, "ok": True, "ofertas": len(r)})
        itens += r

    mods = [i for i in itens if i["tipo"] == "modulo"]
    invs = [i for i in itens if i["tipo"] == "inversor"]
    micros = [i for i in itens if i["tipo"] == "micro"]
    faixa_mod = (0.35, 3.0)    # R$/Wp plausível para módulo avulso
    faixa_inv = (100, 4000)    # R$/kW plausível para inversor on-grid

    modulo = resumo(mods, "rsWp", faixa_mod)
    inversores = []
    for a, b in FAIXAS_INV:
        r = resumo([i for i in invs if a < i["kw"] <= b], "rsKw", faixa_inv)
        if r:
            kws = [i["kw"] for i in invs if a < i["kw"] <= b]
            inversores.append({"deKw": a, "ateKw": b, "kwMedio": round(statistics.median(kws), 2), **r})

    def marcas(lista, campo, faixa, minimo=2):
        grupos = {}
        for i in lista:
            if i["marca"] and faixa[0] <= i[campo] <= faixa[1]:
                grupos.setdefault(i["marca"], []).append(i)
        saida = []
        for m, its in sorted(grupos.items()):
            if len(its) < minimo:
                continue
            vals = sem_extremos([i[campo] for i in its])
            saida.append({"marca": m, "valor": round(statistics.median(vals), 4), "ofertas": len(vals),
                          "lojas": sorted({i["loja"] for i in its})})
        return saida

    curva = curva_inversor(invs, faixa_inv)
    # fator da marca: preço da oferta dividido pelo preço da curva na mesma potência
    invs_fator = [{**i, "fator": i["preco"] / (curva["a"] * i["kw"] ** curva["b"])} for i in invs] if curva else []

    saida = {
        "gerado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "metodo": "Mediana das ofertas em estoque de cada loja, sem valores extremos; valor final = média entre as lojas.",
        "fontes": fontes,
        "modulo": modulo,
        "inversorCurva": curva,
        "inversores": inversores,
        "microinversor": resumo(micros, "rsKw", faixa_inv),
        "marcasModulo": marcas(mods, "rsWp", faixa_mod),
        "marcasInversor": [{**m, "fator": m.pop("valor")} for m in marcas(invs_fator, "fator", (0.2, 5))],
    }
    (DATA / "precos.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")

    hist = DATA / "precos-historico.csv"
    inv5 = next((f["valor"] for f in inversores if f["deKw"] < 5 <= f["ateKw"]), "")
    linha = f"{saida['gerado'][:10]},{modulo['valor'] if modulo else ''},{inv5},{len(itens)}\n"
    linhas = hist.read_text(encoding="utf-8").splitlines(keepends=True) if hist.exists() else ["data,modulo_rs_wp,inversor_5kw_rs_kw,ofertas\n"]
    linhas = [l for l in linhas if not l.startswith(saida["gerado"][:10])] + [linha]
    hist.write_text("".join(linhas), encoding="utf-8")

    if args.detalhes:
        (DATA / "precos-itens.json").write_text(json.dumps(itens, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"módulo: {modulo and modulo['valor']} R$/Wp; faixas de inversor: {len(inversores)}; "
          f"marcas: {len(saida['marcasModulo'])} módulos, {len(saida['marcasInversor'])} inversores")


if __name__ == "__main__":
    main()
