# docs/rondas/

Un JSON por ronda con el **temario oficial del colegio** ya estructurado. Lo produce el workflow
`temario.yml` a partir del documento "Contenidos de pruebas" que el admin sube a
`materiales/rondas/<ronda>/`. A partir de él, `scripts/repartir_temario.js` escribe un
`materiales/<slug>/temario_<ronda>.md` por materia (el que `generar.yml` usa como autoridad de qué
temas entran) y pone las fechas de prueba en `docs/config.json`.

El índice y la futura pantalla de materia también lo leen para mostrar los temas del examen.

## Esquema

```json
{
  "ronda": "2026-11",
  "nombre": "Prácticas finales · Noviembre 2026",
  "titulo": "Título tal como aparece en el documento del colegio",
  "fuente": "materiales/rondas/2026-11/contenidos.pdf",
  "generado": "2026-11-08",
  "materias": {
    "Matemáticas": {
      "slug": "matematicas",
      "fecha": "2026-11-17",
      "idioma": "es",
      "apoyo": ["Trabajos cotidianos 4 y 5", "Práctica de examen facilitada por el docente"],
      "notas": "Texto libre si el documento trae una aclaración para esta materia (opcional)",
      "bloques": [
        {
          "tema": "Las medidas de capacidad",
          "subtemas": ["Qué son las medidas de capacidad", "Conversión entre medidas de capacidad"],
          "habilidades": ["Identificar qué son las medidas de capacidad y realizar la conversión entre ellas"],
          "paginas": "118 a 123"
        }
      ]
    }
  }
}
```

Reglas:

- `materias` usa el nombre visible como clave: `Matemáticas`, `Español`, `Estudios Sociales`,
  `Science`, `English`. Si el colegio agrega otra materia, se usa su nombre tal cual y un `slug`
  en minúsculas con guiones bajos.
- `fecha` en formato `YYYY-MM-DD`. Vacía si el documento no la trae.
- `idioma`: `es` o `en`. Los temas de Science y English se copian en inglés.
- Un `bloque` por fila de la tabla del colegio. `tema` es el título de la fila, `subtemas` los
  puntos que lista, `habilidades` la columna de objetivos o habilidades, `paginas` la columna de
  páginas del libro tal como viene ("90 y 91", "164 a 167 y 169", "My Book · 205 a 234").
- Se copia fielmente. No se resume, no se agregan temas que no estén.
