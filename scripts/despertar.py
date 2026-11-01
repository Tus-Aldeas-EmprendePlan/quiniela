#!/usr/bin/env python3
"""Mantiene despierta la base de datos de Supabase (el plan gratis la pausa tras 7 días sin uso).
Hace una consulta pequeña con la clave pública de config.js. No lee ni guarda datos de nadie.
Lo ejecuta GitHub Actions cada pocos días (.github/workflows/despertar.yml)."""
import pathlib, re, sys, urllib.request

cfg = (pathlib.Path(__file__).resolve().parent.parent / "config.js").read_text(encoding="utf-8")
url = re.search(r'supabaseUrl:\s*"([^"]+)"', cfg).group(1).rstrip("/")
key = re.search(r'supabaseKey:\s*"([^"]+)"', cfg).group(1)
ok = True
for ruta in ("/rest/v1/jugadores?select=nombre&limit=1", "/auth/v1/health"):
    req = urllib.request.Request(url + ruta, headers={"apikey": key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"{ruta}: {r.status}")
    except Exception as ex:
        ok = False
        print(f"::error::{ruta}: {ex!r}")
sys.exit(0 if ok else 1)
