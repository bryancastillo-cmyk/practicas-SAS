# contenido/

JSON generado por el workflow `generar.yml` a partir de `materiales/<materia>/` — es la fuente
de verdad para reconstruir una práctica (`node .claude/skills/practicas-interactivas/assets/construir.js`).

Estructura: `contenido/<materia>/<modo>.json` (`modo` es `adaptativa` o `fiel`).

Si Claude encontró algo ambiguo en el material y no pudo generar el JSON, deja en su lugar
`contenido/<materia>/preguntas.md` con las dudas — la página admin lo muestra para que se
responda en las notas de esa materia y se vuelva a generar.

Esta carpeta empieza vacía: se llena con la primera generación real desde `/admin/`.
