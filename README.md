# Quiniela de la Peña

Mini app (web instalable en el móvil) para la peña de Choncha, Fede y Quino:
pronóstico de cada jornada, boleto de la reducida de 7 dobles por turnos,
escrutinio automático, ranking, histórico y reparto de fin de temporada.

## Cómo está hecha

| Pieza | Dónde vive | Coste |
|---|---|---|
| La app (HTML, CSS, JS) | GitHub Pages, desde este repositorio | Gratis |
| Usuarios y quinielas | Supabase (plan Free) | Gratis |
| Partidos, pronóstico, resultados y premios | `data/*.json` en este repositorio | Gratis |

- `config.js`: dirección y clave pública de Supabase. Vacío = modo demostración.
- `supabase/instalar.sql`: crea las tablas, las reglas de seguridad y carga el histórico.
- Seguridad: todos ven todas las quinielas; cada uno solo puede crear, cambiar o borrar
  las suyas. Choncha (admin) puede rellenar por quien aún no tenga usuario.

## Formato de `data/`

`data/jornadas.json` lista las jornadas disponibles:

```json
{ "actualizado": "2026-10-21",
  "jornadas": [ { "id": "2026-27_J10", "temporada": "2026/27", "jornada": 10, "jornadaOficial": 16, "fecha": "2026-10-25", "conResultados": false } ] }
```

Cada `data/<id>.json` tiene:

- `temporada`, `jornada` (numeración de la peña), `jornadaOficial` (número de Loterías), `fecha`, `cierre` (`AAAA-MM-DDTHH:MM`, hora de Madrid)
- `partidos`: 14 objetos `{local, visitante, hora, p1, pX, p2, publico, nota, sugerido, confianza}`
  - `p1/pX/p2`: probabilidades en % (suman 100)
  - `sugerido`: signos del boleto propuesto (7 partidos con doble, 7 con uno)
  - `confianza`: `alta` | `media` | `baja`
- `pleno`: `{local, visitante, hora, l, v, nota}` con `l`/`v` en `0`, `1`, `2` o `M`
- `resumen`, `fuentes` (URLs), `generado`
- Tras la jornada: `resultados` (14 signos), `plenoRes` `{l, v}` y `premios`
  `{"15": €, "14": €, "13": €, "12": €, "11": €, "10": €}` por apuesta acertada.

Cuando un archivo trae `resultados` (y `premios`), la app escruta sola la quiniela
de esa jornada al abrirla quien la jugó.
