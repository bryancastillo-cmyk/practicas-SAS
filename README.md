# practicas-SAS

Sitio con prácticas interactivas de repaso escolar (4to grado), generadas a
partir del material que entrega el profesor.

## ⚠️ Dos sistemas conviven ahora mismo

- **El sitio actual (en vivo, sin tocar)**: raíz del repo (`index.html`, `acerca.html`,
  `practicas/`, `assets/`). Es lo que hoy publica GitHub Pages. Sigue igual, descrito
  en la sección "Sistema actual" más abajo.
- **El sistema nuevo (en `docs/`, todavía NO publicado)**: página admin con generación
  automática vía GitHub Actions. Está construido y probado localmente, pero GitHub Pages
  **sigue sirviendo la raíz**, no `docs/` — no reemplaza nada hasta que se apruebe el
  cambio a propósito. Ver "Sistema nuevo" más abajo.

---

## Sistema actual (en producción)

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

  El campo `"materia"` debe ser exactamente uno de estos cinco, para que la
  práctica quede en la sección correcta:
  `Matemáticas`, `Science`, `English`, `Español`, `Estudios Sociales`.

- `materiales/<materia>/` — el material original que entrega el profesor
  (temarios, hojas de práctica en PDF/foto) que dio origen a cada práctica,
  guardado como respaldo y referencia. No se muestra en el sitio. **Esta carpeta
  la comparten ambos sistemas** (el admin nuevo sube acá también).

### Agregar una práctica nueva (a mano, como hasta ahora)

1. Subir o pegar el material del profesor (PDF, foto, texto) en el chat con Claude.
2. Claude genera el archivo HTML de la práctica dentro de `practicas/`.
3. Se agrega la entrada correspondiente en `practicas/manifest.json`.
4. Se sube el cambio (commit) a este repositorio — la página se actualiza sola.

### Publicación (GitHub Pages) — configuración actual, no tocar todavía

El sitio se sirve directo desde la rama `main`, sin build ni backend.
Configuración actual: **Settings → Pages → Source: Deploy from a
branch → Branch: `main` / `(root)`**.

---

## Sistema nuevo (listo, pendiente de activar)

Arquitectura: la página `/docs/admin/` (protegida con PIN + token de GitHub) sube
materiales y dispara el workflow `generar.yml`, que corre Claude Code con la skill
`practicas-interactivas` dentro de GitHub Actions, construye la práctica y la publica
en `docs/practicas/`. `docs/index.html` es el índice para el niño; lee `docs/practicas.json`.

```
docs/
├── index.html          ← índice para el niño (lee practicas.json)
├── practicas.json       ← catálogo: materia, nombre, modo, archivo, fecha, estado
├── practicas/            ← <materia>_<modo>.html (adaptativa | fiel)
├── admin/index.html     ← página de administración
└── robots.txt            ← Disallow: /

.claude/skills/practicas-interactivas/   ← copia de la skill (SKILL.md + assets/)
.github/workflows/
├── generar.yml           ← genera una práctica (workflow_dispatch: materia, modo)
└── pages.yml              ← publica docs/ en Pages (manual por ahora, ver nota abajo)
contenido/<materia>/<modo>.json   ← fuente de verdad para reconstruir cada práctica
scripts/actualizar_catalogo.js    ← agrega/reemplaza la entrada en docs/practicas.json
```

Ya se migró (copiado, no movido) el contenido actual a `docs/practicas/` con la
convención `<materia>_<modo>.html`, así que el sitio nuevo tiene desde ya las mismas
3 prácticas que el sitio actual, más quiere decir que el día que se apruebe el cambio,
no arranca vacío.

### Modo fiel

La skill ahora soporta `"modo": "fiel"` en `contenido.json`: copia la práctica del
profesor tal cual (mismo orden, sin variantes ni repetición espaciada), en vez de la
práctica adaptativa con ejercicios similares. Conviven las dos por materia.

### Lo que falta para activarlo (pasos manuales, no los puede hacer Claude)

1. **Crear la API key de Anthropic**: console.anthropic.com → crear una key, ponerle un
   límite de gasto mensual bajo. Guardarla en **Settings → Secrets and variables →
   Actions → New repository secret** con el nombre `ANTHROPIC_API_KEY`.
2. **Crear los tokens fine-grained de GitHub** (uno por persona que vaya a usar el
   admin): GitHub → Settings de la cuenta → Developer settings → Fine-grained tokens
   → Only select repositories → `practicas-sas` → permisos **Contents: Read and write**
   y **Actions: Read and write** → vencimiento sugerido: 1 año. Si es para otra persona
   (ej. su esposa), esa persona lo crea desde su propia cuenta de GitHub, y hay que
   agregarla como colaboradora del repo primero (Settings → Collaborators).
3. **Probar `/admin/` en local antes de publicar**: `npx serve docs` y abrir
   `http://localhost:3000/admin/`, cargar el token + PIN, y probar subir un archivo
   de prueba y disparar "Generar práctica fiel" para una materia. Confirmar que el
   workflow corre en la pestaña **Actions** del repo.
4. **Cuando esté conforme, avisar para el corte**: recién ahí se cambia
   Settings → Pages → Source de "Deploy from a branch" a **"GitHub Actions"**, se le
   agrega el disparo automático (`on: push`) a `pages.yml`, y se puede borrar o archivar
   el sitio de la raíz (`index.html`, `acerca.html`, `practicas/`, `assets/`). Este
   paso lo dispara solo el dueño del repo — no se hace solo.

### Riesgos que hay que tener presentes (igual que en el plan original)

- **Sin revisión humana antes de publicar** en el flujo automático: por eso existe
  `preguntas.md` (Claude no inventa, pregunta) y el botón "Reemplazar" con confirmación.
  Recomendado: revisar cada práctica nueva la primera vez que se abre.
- **Repo público**: los PDF del profesor y las páginas del libro quedan públicos por
  URL (igual que hoy). Alternativa si molesta: repo privado con GitHub Pro (~USD 4/mes).
- **Progreso del niño**: se guarda en el navegador donde practica, no en el servidor.
  Cambiar de dispositivo es empezar de cero — limitación de un sitio sin backend.
- **Reordenar páginas del libro**: se hace ANTES de subir (con las flechas ▲▼ en la
  cola de subida), no después — es una simplificación respecto al plan original, que
  hablaba de reordenar archivos ya subidos al repo (más complejo con la API de
  contenidos de GitHub, que no soporta "renombrar", solo crear/borrar).
