# practicas-SAS

Sitio con prácticas interactivas de repaso escolar (4to grado), generadas a
partir del material que entrega el profesor.

## Cómo funciona

- `index.html` — página principal: lista todas las prácticas agrupadas por materia.
- `practicas/` — cada práctica es un archivo HTML independiente, autocontenido
  (sin dependencias externas), con las respuestas cifradas por hash.
- `practicas/manifest.json` — índice que alimenta la página principal. Cada
  práctica nueva agrega una entrada:

  ```json
  {
    "titulo": "Repaso: multiplicación de 2 dígitos",
    "materia": "Matemáticas",
    "tema": "Multiplicación",
    "archivo": "practicas/2026-08-24-multiplicacion.html",
    "fecha": "2026-08-24"
  }
  ```

## Agregar una práctica nueva

1. Subir o pegar el material del profesor (PDF, foto, texto) en el chat con Claude.
2. Claude genera el archivo HTML de la práctica dentro de `practicas/`.
3. Se agrega la entrada correspondiente en `practicas/manifest.json`.
4. Se sube el cambio (commit) a este repositorio — la página se actualiza sola.

## Publicación (GitHub Pages)

El sitio se sirve directo desde la rama `main`, sin build ni backend.
Configuración (una sola vez): **Settings → Pages → Source: Deploy from a
branch → Branch: `main` / `(root)` → Save**.
