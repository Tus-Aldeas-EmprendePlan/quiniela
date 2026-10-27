#!/usr/bin/env python3
"""Rellena resultados, Pleno al 15 y premios de las jornadas terminadas con los datos oficiales
de Loterías y Apuestas del Estado (su buscador de sorteos, el mismo que usa su web).
Lo ejecuta GitHub Actions al final de cada jornada (.github/workflows/resultados.yml)."""
import datetime, json, pathlib, sys, urllib.request
from zoneinfo import ZoneInfo

API = ("https://www.loteriasyapuestas.es/servicios/buscadorSorteos?game_id=LAQU&celebrados=true"
       "&fechaInicioInclusiva={ini}&fechaFinInclusiva={fin}")
DATA = pathlib.Path(__file__).resolve().parent.parent / "data"
MADRID = ZoneInfo("Europe/Madrid")
CATEG = {2: "14", 3: "13", 4: "12", 5: "11", 6: "10", 1: "15"}

def bajar(ini, fin):
    url = API.format(ini=ini.strftime("%Y%m%d"), fin=fin.strftime("%Y%m%d"))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (quiniela de la peña)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def goles(g):
    g = int(g)
    return "M" if g >= 3 else str(g)

def euros(s):
    return round(float(str(s).strip().replace(".", "").replace(",", ".") or 0), 2)

def temporada_lae(t):  # "2026/27" -> "2026-2027"
    a = int(t[:4]); return f"{a}-{a + 1}"

def main():
    ahora = datetime.datetime.now(MADRID)
    idx_path = DATA / "jornadas.json"
    idx = json.loads(idx_path.read_text(encoding="utf-8"))
    cambios = False
    for e in idx["jornadas"]:
        if e.get("conResultados"): continue
        f = DATA / f"{e['id']}.json"
        d = json.loads(f.read_text(encoding="utf-8"))
        horas = [p["hora"] for p in d["partidos"]] + [d.get("pleno", {}).get("hora") or ""]
        ultimo = datetime.datetime.strptime(max(h for h in horas if h), "%Y-%m-%d %H:%M").replace(tzinfo=MADRID)
        if ultimo + datetime.timedelta(hours=2) > ahora:
            print(f"{e['id']}: la jornada aún no ha terminado (último partido {ultimo:%d/%m %H:%M})"); continue
        fecha = datetime.date.fromisoformat(d.get("fecha") or e["fecha"])
        sorteos = bajar(fecha - datetime.timedelta(days=8), fecha + datetime.timedelta(days=3))
        print(f"Loterías leída correctamente: {len(sorteos)} sorteos")
        s = next((x for x in sorteos if str(x.get("jornada")) == str(d["jornadaOficial"])
                  and x.get("temporada") == temporada_lae(d["temporada"])), None)
        if not s:
            print(f"{e['id']}: Loterías aún no tiene la jornada {d['jornadaOficial']}"); continue
        ps = sorted(s.get("partidos") or [], key=lambda p: int(p["posicion"]))
        signos = [str(p.get("signo") or "").strip().upper() for p in ps[:14]]
        if len(ps) < 15 or any(x not in ("1", "X", "2") for x in signos):
            print(f"{e['id']}: faltan resultados oficiales"); continue
        for i, (p, q) in enumerate(zip(d["partidos"], ps[:14]), 1):
            a = p["local"].split()[0].lower().rstrip(".")
            if a[:4] not in q["local"].lower():
                print(f"Aviso: partido {i} '{p['local']}' frente a '{q['local']}' en Loterías")
        pl = ps[14]
        if pl.get("marcador") and "-" in pl["marcador"]:
            l, v = [x.strip() for x in pl["marcador"].split("-")[:2]]
            pleno = {"l": goles(l), "v": goles(v)}
        else:
            l, v = [x.strip().upper() for x in str(pl.get("signo", "")).split("-")[:2]]
            pleno = {"l": l, "v": v}
        if d.get("resultados") != signos or d.get("plenoRes") != pleno:
            d["resultados"], d["plenoRes"] = signos, pleno
            cambios = True
            print(f"{e['id']}: resultados {' '.join(signos)} · pleno {pleno['l']}-{pleno['v']}")
        esc = {CATEG[int(c["categoria"])]: euros(c["premio"]) for c in (s.get("escrutinio") or []) if int(c["categoria"]) in CATEG}
        if len(esc) == 6 and any(esc[k] > 0 for k in ("14", "13", "12", "11", "10")):
            premios = {k: esc[k] for k in ("15", "14", "13", "12", "11", "10")}
            if d.get("premios") != premios:
                d["premios"] = premios; cambios = True
                print(f"{e['id']}: premios {premios}")
            e["conResultados"] = True
        else:
            print(f"{e['id']}: los premios aún no están publicados")
        f.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if cambios or any(e.get("conResultados") for e in idx["jornadas"]):
        nuevo = json.dumps(idx, ensure_ascii=False, indent=1) + "\n"
        if nuevo != idx_path.read_text(encoding="utf-8"):
            idx["actualizado"] = ahora.date().isoformat()
            idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

if __name__ == "__main__":
    try:
        if "--prueba" in sys.argv:  # solo comprueba que GitHub puede leer Loterías
            hoy = datetime.date.today()
            xs = bajar(hoy - datetime.timedelta(days=10), hoy)
            print(f"Loterías leída correctamente: {len(xs)} sorteos; último: jornada {xs[0].get('jornada')} · {xs[0].get('combinacion')}")
        else:
            main()
    except Exception as ex:
        print(f"Error leyendo Loterías: {ex}"); sys.exit(1)
