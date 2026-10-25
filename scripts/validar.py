#!/usr/bin/env python3
"""Comprueba que los archivos de data/ tienen el formato que espera la app."""
import json, math, pathlib, sys
DATA = pathlib.Path(__file__).resolve().parent.parent / "data"
SIG, GOL = {"1", "X", "2"}, {"0", "1", "2", "M"}
errores = []
def err(f, m): errores.append(f"{f}: {m}")
try:
    idx = json.loads((DATA / "jornadas.json").read_text(encoding="utf-8"))
except Exception as e:
    print(f"jornadas.json no es JSON válido: {e}"); sys.exit(1)
for e in idx.get("jornadas", []):
    f = f"{e.get('id')}.json"; p = DATA / f
    if not p.exists(): err("jornadas.json", f"falta el archivo {f}"); continue
    try: d = json.loads(p.read_text(encoding="utf-8"))
    except Exception as ex: err(f, f"JSON no válido ({ex})"); continue
    for k in ("temporada", "jornada", "fecha", "partidos", "pleno", "resumen"):
        if k not in d: err(f, f"falta el campo {k}")
    if d.get("jornada") != e.get("jornada"): err(f, "el número de jornada no coincide con jornadas.json")
    ps = d.get("partidos") or []
    if len(ps) != 14: err(f, f"tiene {len(ps)} partidos y deben ser 14")
    dobles = 0
    for i, pt in enumerate(ps, 1):
        for k in ("local", "visitante", "hora", "p1", "pX", "p2", "sugerido", "confianza", "nota"):
            if k not in pt: err(f, f"partido {i}: falta {k}")
        try:
            if pt["p1"] + pt["pX"] + pt["p2"] != 100: err(f, f"partido {i}: las probabilidades no suman 100")
        except Exception: pass
        s = pt.get("sugerido", "")
        if not s or set(s) - SIG or len(s) > 2: err(f, f"partido {i}: signos sugeridos no válidos ({s})")
        dobles += len(s) == 2
        if pt.get("confianza") not in ("alta", "media", "baja"): err(f, f"partido {i}: confianza no válida")
    if ps and dobles != 7: err(f, f"tiene {dobles} dobles y la reducida necesita 7")
    pl = d.get("pleno") or {}
    if pl.get("l") not in GOL or pl.get("v") not in GOL: err(f, "pleno: goles no válidos")
    r = d.get("resultados")
    if r is not None and (len(r) != 14 or any(x not in SIG for x in r)): err(f, "resultados: deben ser 14 signos 1, X o 2")
    pr = d.get("plenoRes")
    if pr is not None and (pr.get("l") not in GOL or pr.get("v") not in GOL): err(f, "plenoRes no válido")
    pm = d.get("premios")
    if pm is not None and not all(isinstance(pm.get(k), (int, float)) for k in ("14", "13", "12", "11", "10")): err(f, "premios: faltan categorías o no son números")
    est = d.get("estimacion")
    if est is not None:
        if not isinstance(est.get("recaudacion"), (int, float)) or est["recaudacion"] <= 0: err(f, "estimacion: falta la recaudación (número en euros)")
        pc = est.get("porcentajes")
        if pc is not None:
            if len(pc) != 14: err(f, "estimacion: porcentajes debe tener 14 partidos")
            for i, q in enumerate(pc or [], 1):
                try:
                    t = q["1"] + q["X"] + q["2"]
                    if abs(t - 100) > 2: err(f, f"estimacion: porcentajes del partido {i} suman {t}")
                except Exception: err(f, f"estimacion: porcentajes del partido {i} no válidos")
        pp = est.get("plenoPct")
        if pp is not None:
            for lado in ("local", "visitante"):
                q = pp.get(lado) or {}
                if set(q) != GOL: err(f, f"estimacion: plenoPct.{lado} debe tener 0, 1, 2 y M")
if errores:
    print("Hay errores:"); [print(" -", x) for x in errores]; sys.exit(1)
print(f"Todo correcto: {len(idx.get('jornadas', []))} jornadas revisadas.")
