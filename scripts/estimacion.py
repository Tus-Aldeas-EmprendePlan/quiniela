#!/usr/bin/env python3
"""Rellena el campo `estimacion` (recaudación, bote y porcentajes LAE) de la jornada en curso
con los datos que publica Eduardo Losilla en su página de estimación de premios.
Lo ejecuta GitHub Actions los domingos (.github/workflows/estimacion.yml)."""
import datetime, json, pathlib, re, sys, urllib.request
from zoneinfo import ZoneInfo

URL = "https://www.eduardolosilla.es/quiniela/ayudas/estimacion"
DATA = pathlib.Path(__file__).resolve().parent.parent / "data"
MADRID = ZoneInfo("Europe/Madrid")

def num(s):
    if isinstance(s, (int, float)): return float(s)
    return float(str(s).strip().replace(".", "").replace(",", "."))

def leer_estado(html):
    m = re.search(r'<script id="eduardo-losilla-state" type="application/json">(.*?)</script>', html, re.S)
    if not m: raise ValueError("la página no trae el bloque de datos")
    raw = m.group(1)
    for a, b in (("&q;", '"'), ("&s;", "'"), ("&l;", "<"), ("&g;", ">"), ("&a;", "&")): raw = raw.replace(a, b)
    return json.loads(raw)

def buscar(estado, prefijo, oficial):
    for k, v in estado.items():
        if re.fullmatch(rf"{prefijo}_{oficial}_\d+", k): return v
    return None

def estimacion_de(estado, oficial):
    jor, prob = buscar(estado, "jornada", oficial), buscar(estado, "probabilidades", oficial)
    if not jor or not jor.get("recaudacion"): return None
    est = {"recaudacion": round(num(jor["recaudacion"]), 2), "bote": 0.0, "precioApuesta": float(jor.get("costeApuesta") or 0.75),
           "porcentajes": None, "plenoPct": None, "definitiva": False, "fuentes": [URL]}
    bote = jor.get("boteEstimacion") or (jor.get("boteData") or {}).get("bote")
    if bote not in (None, ""): est["bote"] = round(num(bote), 2)
    lae = ((prob or {}).get("partidos") or {}).get("lae") or []
    filas = {int(p["numero"]): p for p in lae}
    if all(i in filas for i in range(1, 15)):
        pc = []
        for i in range(1, 15):
            q = {"1": int(filas[i]["porc_1"]), "X": int(filas[i]["porc_X"]), "2": int(filas[i]["porc_2"])}
            d = 100 - sum(q.values())
            if d: q[max(q, key=q.get)] += d          # redondeo para que sume 100
            pc.append(q)
        est["porcentajes"] = pc
    pq = ((prob or {}).get("plenoQuince") or {}).get("lae")
    if pq:
        orden = [("Primera", "0"), ("Segunda", "1"), ("Tercera", "2"), ("Cuarta", "M")]
        est["plenoPct"] = {"local": {g: int(pq[f"Porcentaje{o}L"]) for o, g in orden}, "visitante": {g: int(pq[f"Porcentaje{o}V"]) for o, g in orden}}
    est["definitiva"] = est["porcentajes"] is not None
    est["actualizado"] = datetime.datetime.now(MADRID).strftime("%Y-%m-%dT%H:%M")
    return est

API_PROB = "https://api.eduardolosilla.es/probabilidades?num_jornada={j}&num_temporada={t}"

def actualizar_publico(idx, ahora):
    """Antes del cierre: pone en cada partido lo que lleva apostado la gente (porcentajes LAE)
    para que la app pueda señalar dónde hay valor."""
    for e in idx.get("jornadas", []):
        if e.get("conResultados"): continue
        p = DATA / f"{e['id']}.json"; d = json.loads(p.read_text(encoding="utf-8"))
        if (d.get("cierre") or "0000") <= ahora: continue
        url = API_PROB.format(j=d["jornadaOficial"], t=int(d["temporada"][:4]) + 1)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36",
                                                       "Origin": "https://www.eduardolosilla.es", "Referer": "https://www.eduardolosilla.es/"})
            prob = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
        except Exception as ex:
            print(f"{p.name}: no se pudieron leer los porcentajes del público ({ex!r})"); continue
        if str(prob.get("numJornada")) != str(d["jornadaOficial"]):
            print(f"{p.name}: Losilla aún no tiene porcentajes de la jornada {d['jornadaOficial']}"); continue
        filas = {int(x["numero"]): x for x in ((prob.get("partidos") or {}).get("lae") or [])}
        if not all(i in filas for i in range(1, 15)):
            print(f"{p.name}: porcentajes del público incompletos"); continue
        for i, part in enumerate(d["partidos"], 1):
            f = filas[i]
            part["publico"] = f"1 {int(f['porc_1'])}% · X {int(f['porc_X'])}% · 2 {int(f['porc_2'])}%"
        d["publicoActualizado"] = datetime.datetime.now(MADRID).strftime("%Y-%m-%dT%H:%M")
        p.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{p.name}: porcentajes del público actualizados")

def main(html=None):
    idx = json.loads((DATA / "jornadas.json").read_text(encoding="utf-8"))
    ahora = datetime.datetime.now(MADRID).strftime("%Y-%m-%dT%H:%M")
    pendientes = []
    for e in idx.get("jornadas", []):
        if e.get("conResultados"): continue
        p = DATA / f"{e['id']}.json"; d = json.loads(p.read_text(encoding="utf-8"))
        if (d.get("cierre") or "9999") > ahora: continue
        if (d.get("estimacion") or {}).get("definitiva"): continue
        pendientes.append((p, d))
    if html is None:
        actualizar_publico(idx, ahora)
    if html is None:
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (compatible; quiniela-pena/1.0)", "Accept-Language": "es-ES"})
        html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    estado = leer_estado(html)
    vivas = sorted(k for k in estado if k.startswith("jornada_"))
    print("Página de Losilla leída correctamente. Jornadas con datos:", ", ".join(vivas) or "ninguna")
    if not pendientes: print("Nada que actualizar."); return 0
    cambios = 0
    for p, d in pendientes:
        est = estimacion_de(estado, d.get("jornadaOficial"))
        if not est: print(f"{p.name}: Losilla aún no publica la jornada {d.get('jornadaOficial')}."); continue
        d["estimacion"] = est
        p.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{p.name}: recaudación {est['recaudacion']} €, bote {est['bote']} €, porcentajes {'sí' if est['porcentajes'] else 'no'}.")
        cambios += 1
    return 0

if __name__ == "__main__":
    sys.exit(main(open(sys.argv[1], encoding="utf-8").read() if len(sys.argv) > 1 else None))
