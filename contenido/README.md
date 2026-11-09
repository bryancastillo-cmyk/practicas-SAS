# contenido/

JSON generado por el workflow `generar.yml` a partir de `materiales/<materia>/` — es la fuente
de verdad para reconstruir una práctica (`node .claude/skills/practicas-interactivas/assets/construir.js`).

Estructura: `contenido/<materia>/<modo>.json` (`modo` es `adaptativa` o `fiel`).

Si Claude encontró algo ambiguo en el material y no pudo generar el JSON, deja en su lugar
`contenido/<materia>/preguntas.md` con las dudas — la página admin lo muestra para que se
responda en las notas de esa materia y se vuelva a generar.

Esta carpeta empieza vacía: se llena con la primera generación real desde `/admin/`.

## Práctica de la profe con revisión (`profe_<periodo>.json`)

`contenido/<materia>/profe_<periodo>.json` guarda la práctica del profesor tal cual (opción múltiple,
respuesta corta, pareo y ensayo) con sus claves y rúbricas. `node scripts/examen_profe.js <materia> <periodo>`
la convierte en `docs/practicas/<materia>_fiel_<periodo>.html` (las claves de opción múltiple y pareo
quedan cifradas por hash) y actualiza su entrada «fiel» en `docs/practicas.json`. Las respuestas escritas
reciben una revisión preliminar por ideas clave y ortografía, con un botón para copiarlas con su rúbrica
y pegárselas a Claude. Primera: Science 2026-11.
