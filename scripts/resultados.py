#!/usr/bin/env python3
"""Rellena resultados, Pleno al 15 y premios de las jornadas terminadas.
Fuente: la API de escrutinios de Eduardo Losilla, que copia el escrutinio oficial de Loterías
(la web de Loterías no deja entrar a los servidores de GitHub).
Lo ejecuta GitHub Actions al final de cada jornada (.github/workflows/resultados.yml)."""
import datetime, json, pathlib, sys, urllib.request
from zoneinfo import ZoneInfo

API = "https://api.eduardolosilla.es/escrutinios?num_jornada={j}&num_temporada={t}"
DATA = pathlib.Path(__file__).resolve().parent.parent / "data"
MADRID = ZoneInfo("Europe/Madrid")
CABECERAS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
             "Accept": "application/json, text/plain, */*", "Accept-Language": "es-ES,es;q=0.9",
             "Origin": "https://www.eduardolosilla.es", "Referer": "https://www.eduardolosilla.es/"}
CATS = ("15", "14", "13", "12", "11", "10")

def bajar(jornada, temporada_fin):
    req = urllib.request.Request(API.format(j=jornada, t=temporada_fin), headers=CABECERAS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def temporada_fin(t):  # "2026/27" -> 2027
    return int(t[:4]) + 1

def main():
    ahora = datetime.datetime.now(MADRID)
    idx_path = DATA / "jornadas.json"
    original = idx_path.read_text(encoding="utf-8")
    idx = json.loads(original)
    for e in idx["jornadas"]:
        if e.get("conResultados"): continue
        f = DATA / f"{e['id']}.json"
        d = json.loads(f.read_text(encoding="utf-8"))
        horas = [p.get("hora") for p in d["partidos"]] + [(d.get("pleno") or {}).get("hora")]
        ultimo = datetime.datetime.strptime(max(h for h in horas if h), "%Y-%m-%d %H:%M").replace(tzinfo=MADRID)
        if ultimo + datetime.timedelta(hours=2) > ahora:
            print(f"{e['id']}: la jornada aún no ha terminado (último partido {ultimo:%d/%m %H:%M})"); continue
        tf = temporada_fin(d["temporada"])
        s = bajar(d["jornadaOficial"], tf)
        if str(s.get("jornada")) != str(d["jornadaOficial"]) or int(s.get("temporada") or 0) != tf:
            print(f"{e['id']}: la fuente aún no tiene la jornada {d['jornadaOficial']}"); continue
        ps = sorted(s.get("partidos") or [], key=lambda p: int(p["num"]))
        signos = [str(p.get("signo") or "").strip().upper() for p in ps[:14]]
        sg15 = str((ps[14] if len(ps) > 14 else {}).get("signo_goles") or "").strip().upper()
        if len(ps) < 15 or any(x not in ("1", "X", "2") for x in signos) or len(sg15) != 2 or any(c not in "012M" for c in sg15):
            print(f"{e['id']}: faltan resultados"); continue
        for i, (p, q) in enumerate(zip(d["partidos"], ps[:14]), 1):
            print(f"  {i:2} {p['local']} - {p['visitante']}  ←  {q['local']} - {q['visitante']}  {q.get('resultado')}  {q.get('signo')}")
        pleno = {"l": sg15[0], "v": sg15[1]}
        d["resultados"], d["plenoRes"] = signos, pleno
        print(f"{e['id']}: resultados {' '.join(signos)} · pleno {pleno['l']}-{pleno['v']}")
        ac = {str(a["acierto"]): round(float(a.get("premio") or 0), 2) for a in (s.get("acertantes") or [])}
        if s.get("estado") == "ESCRUTADA" and all(k in ac for k in CATS) and any(ac[k] > 0 for k in ("14", "13", "12", "11")):
            d["premios"] = {k: ac[k] for k in CATS}
            e["conResultados"] = True
            print(f"{e['id']}: premios {d['premios']}")
        else:
            print(f"{e['id']}: los premios aún no están publicados")
        f.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if idx != json.loads(original):
        idx["actualizado"] = ahora.date().isoformat()
        idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

if __name__ == "__main__":
    try:
        if "--prueba" in sys.argv:  # solo comprueba que GitHub puede leer la fuente
            s = bajar(16, 2027)
            print(f"Fuente leída correctamente: jornada {s.get('jornada')} · {s.get('estado')} · "
                  f"{' '.join(p.get('signo') or '?' for p in s.get('partidos', []))}")
        else:
            main()
    except Exception as ex:
        detalle = ""
        if hasattr(ex, "read"):
            try: detalle = ex.read()[:200].decode("utf-8", "replace").replace("\n", " ")
            except Exception: pass
        print(f"::error::Error leyendo los resultados: {ex!r} {detalle}"); sys.exit(1)
