---
mode: agent
description: Añade los resultados y premios oficiales de la última jornada de la quiniela
---
Actualiza la app de este repositorio con los resultados oficiales.

1. Lee `data/jornadas.json` y elige la jornada más reciente con `conResultados: false` cuya `fecha` ya haya pasado.
2. Busca con #fetch los resultados oficiales de esa quiniela (número `jornadaOficial`) en loteriasyapuestas.es y compruébalos en otra fuente (eduardolosilla.es o quinielafutbol.info).
3. En `data/<id>.json` rellena `resultados` (14 signos "1", "X", "2" en el orden del archivo), `plenoRes` (`{l, v}` con "0", "1", "2" o "M") y `premios` (euros por apuesta acertada: `{"15": …, "14": …, "13": …, "12": …, "11": …, "10": …}`, 0 si quedó desierta). Si los premios aún no están publicados, deja `premios` en null.
4. Si ya hay premios, pon `conResultados: true` en `data/jornadas.json`; pon `actualizado` a hoy.
5. Ejecuta `python3 scripts/validar.py` y corrige lo que falle. Termina con los 14 signos, el pleno y lo que pagan 14, 13, 12, 11 y 10. No hagas commit: lo hago yo.
