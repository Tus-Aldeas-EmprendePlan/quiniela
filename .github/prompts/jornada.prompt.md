---
mode: agent
description: Prepara los partidos y el pronóstico de la próxima jornada de la quiniela
---
Eres el analista de una peña de quinielas. Prepara la próxima jornada para la app de este repositorio.

1. Lee `README.md`, `data/jornadas.json` y el último `data/<id>.json` para copiar el formato exacto.
2. Busca en la web la próxima quiniela oficial de FIN DE SEMANA de Loterías y Apuestas del Estado (ignora jornadas entre semana o de Copa). Usa #fetch con https://www.quinielafutbol.info/proximas-jornadas-de-la-quiniela.html y https://www.eduardolosilla.es/quiniela/ayudas/proximas y comprueba que los 15 partidos coinciden.
3. Numeración: `jornada` = número de la jornada de LaLiga (Primera) de ese fin de semana (el fin de semana del 25/10/2026 fue la 10). `jornadaOficial` = número de Loterías. `id` = `2026-27_J` + jornada con dos cifras. `fecha` = el domingo (AAAA-MM-DD). `cierre` = hora del primer partido, `AAAA-MM-DDTHH:MM`, hora de Madrid. Si el archivo ya existe, actualízalo.
4. Para cada uno de los 14 partidos estima probabilidades 1/X/2 (enteros que suman 100) a partir de cuotas de casas de apuestas, clasificación, forma (últimos 5), local/visitante, bajas y rotaciones, y porcentajes del público si los encuentras. En Liga F y Segunda, si hay pocos datos, dilo en la nota.
5. `sugerido`: reducida de 7 dobles y 0 triples. Para cada partido calcula ganancia = ln((p1ª+p2ª)/p1ª) con las dos probabilidades más altas. Los 7 de mayor ganancia llevan doble (los dos signos más probables en orden 1, X, 2: "1X", "12" o "X2"); el resto, el signo más probable. `confianza`: "alta" si la mayor probabilidad ≥ 60, "media" si ≥ 48, si no "baja".
6. `nota`: 1-2 frases sencillas en español (rachas, bajas, quién llega mejor, posible sorpresa). `publico`: texto tipo "1 70% · X 20% · 2 10%" o null. `hora`: "AAAA-MM-DD HH:MM".
7. `pleno`: `{local, visitante, hora, l, v, nota}` con l y v en "0", "1", "2" o "M" (3 o más goles).
8. `resumen`: una frase con la estructura del boleto y la probabilidad (producto de las probabilidades cubiertas) de que los 14 resultados caigan dentro, en %, con coma decimal. `fuentes`: URLs abiertas. `generado`: hoy. `resultados`, `plenoRes` y `premios` en null.
9. Añade o actualiza la entrada en `data/jornadas.json` (`conResultados: false`) y pon `actualizado` a hoy.
10. Ejecuta `python3 scripts/validar.py` en la terminal y corrige lo que falle. Termina con un resumen corto: jornada, boleto propuesto y 2-3 posibles sorpresas. No hagas commit: lo hago yo.
