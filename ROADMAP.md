# ROADMAP · Prácticas SAS

Guía de trabajo para continuar el rediseño desde Claude Code. Leer completo antes de tocar código.
Rama de trabajo: `rediseno-estudiante` (PR #3). Fecha de este documento: 2026-11-08.

---

## 1. Qué es esto y qué hay hoy

Sitio estático con prácticas interactivas de repaso escolar (4to grado), generadas con la skill
`practicas-interactivas` a partir del material del profesor. Dos sistemas conviven:

| | Sitio en producción (raíz) | Sistema nuevo (`docs/`) |
|---|---|---|
| Publicado por GitHub Pages | Sí, desde `main` / `(root)` | **No todavía** |
| Índice | `index.html` (catálogo plano) | `docs/index.html` (misiones, puntos, progreso) |
| Catálogo | `practicas/manifest.json` | `docs/practicas.json` + `docs/config.json` |
| Admin | No tiene | `docs/admin/` (PIN + token de GitHub, dispara `generar.yml`) |
| Prácticas | `practicas/*.html` | `docs/practicas/<materia>_<modo>_<ronda>.html` |

**Lo que ya está hecho en la rama `rediseno-estudiante`:**

- Motor (`construir.js`): módulo `SAS` que registra en `localStorage['sas-progreso-v1']` puntos de
  esfuerzo, minutos activos y estado de cada tema, bajo el nombre del archivo de la práctica.
- `docs/index.html`: inicio del estudiante con misión de hoy, plan de 3 misiones, materias con
  estrellas, nivel, minutos de la semana, racha con escudo, logros, temas "todavía no", anteriores.
- `docs/config.json`: ronda actual, rondas, fechas de quiz por ronda y materia, metas, niveles.
- Admin: tarjeta "Rondas de práctica" (crear, editar, marcar actual). `generar.yml` y
  `scripts/actualizar_catalogo.js` toman la ronda de `config.json`.
- Si la ronda actual no tiene práctica de una materia, el inicio ofrece la más reciente de rondas
  anteriores como "Repaso para el examen".
- Pruebas automáticas en `scripts/pruebas/` (ver sección 6).

**Mockup de referencia (Claude Design):** https://claude.ai/artifact/1MzczRpHvMDhx4jpt6RrGy
Pantallas: Acceso, Inicio, Materia, Móvil, Sesión de práctica, Cierre de misión, Admin, Configuración.

---

## 2. Decisiones de diseño que NO se renegocian sin hablarlo

Paleta (roles, no decoración):

| Rol | Color | Uso |
|---|---|---|
| Fondo | `#FFF8EE` | Crema, menos deslumbramiento que blanco |
| Tinta | `#241F1A` | Texto |
| Acción | `#FF8A3D` | **Un solo botón por pantalla**, siempre el siguiente paso. Texto oscuro encima |
| Calma | `#0E7C78` | Estructura, navegación, tiempo. Nunca compite con la acción |
| Recompensa | `#FFC43D` | Solo puntos, estrellas, logros |
| Todavía no | `#B45309` sobre `#FDE7C8` | Nunca rojo |
| Dominado | `#15803D` sobre `#DCFCE7` | |

Tipografía: Nunito en el índice. Las prácticas usan Andika (embebida). Pendiente decidir si se unifica.

Reglas pedagógicas que ya están en el código y deben mantenerse:

1. Nunca "mal", siempre "todavía no".
2. Puntos por esfuerzo, nunca por velocidad: 10 respuesta, 15 reintento, 50 tema dominado,
   20 tema reforzado, 25 repaso final. Reintentar vale más que acertar a la primera.
3. Minutos activos cuentan solo con una pregunta en pantalla y la pestaña visible.
4. Racha con un escudo por semana. Sin leaderboards ni comparación entre niños.
5. Niveles cada 1.500 puntos. Desbloquean solo cosas cosméticas, nunca contenido.
6. Logros por constancia y persistencia, nunca por comparación.
7. Sin confeti ni animación en cada acierto. La celebración grande es al cerrar.
8. Sin cuenta regresiva por pregunta. Presión de tiempo por ítem aumenta ansiedad.
9. El admin se queda en paleta calmada: es para el adulto.

---

## 3. Siguiente paso recomendado (orden)

Las prácticas finales son ahora, así que el orden prioriza lo que se necesita esta semana.

### Fase A · Publicar y usar (esta semana)

1. Mezclar el PR #3 en `main`.
2. Publicar `docs/`: GitHub → Settings → Pages → Source "Deploy from a branch" → Branch `main` /
   carpeta `/docs`. Es un cambio de configuración, sin código. El sitio nuevo queda en vivo en
   la misma URL. La raíz deja de servirse. (Alternativa: Cloudflare Pages, ver Fase D.)
3. Crear la ronda de finales desde `/admin/` → "Rondas de práctica" → "+ Nueva ronda". Nombre,
   identificador (`2026-11`), fechas de examen por materia, marcar como actual.
4. Subir el material de las prácticas finales por materia y generar (adaptativa y fiel).
5. Revisar cada práctica nueva una vez abierta (el flujo automático no tiene revisión humana).

Pendientes manuales que siguen igual que en el README: secret `ANTHROPIC_API_KEY` en el repo y
token fine-grained de GitHub para el admin.

### Fase B · El motor aprende a hacer misiones (antes del próximo ciclo)

Hoy el índice promete "10 preguntas, 12 minutos" pero la práctica corre hasta dominar todos los
temas. Hay que cerrar esa brecha en `construir.js`:

1. **Modo misión**: parámetro por URL (`?mision=10`) o configuración en `contenido.json`. La
   sesión termina a las N preguntas con una pantalla de cierre, sin perder el progreso adaptativo.
2. **Anillo de tiempo visible** durante la sesión (tiempo estimado, no cuenta regresiva por
   pregunta) y **pausa de movimiento** de 30 segundos a la mitad.
3. **Confianza antes de responder**: "Seguro / Más o menos / Adivinando". Guardar junto con la
   respuesta. Es metacognición y aprovecha el efecto de hipercorrección.
4. **Pantalla de cierre de misión** (mockup "Cierre"): puntos ganados con desglose, minutos
   activos, temas que cambiaron de estado, racha, logro nuevo, pregunta "¿cuándo hacés la siguiente
   mañana?" (intención de implementación) y botón principal "Listo por hoy".
5. Panel "Todavía no. Fijate en esto" con microlección de tres líneas antes de reintentar
   (ya existe `mostrarMicro`, hay que mostrarlo al primer fallo en modo misión, no al segundo).
6. Reemplazar emojis del motor por SVG inline y alinear paleta con la del índice. Opcional, bajo
   riesgo, dejarlo para el final de la fase.

Regla de oro: `construir.js` es la plantilla de TODAS las prácticas. Cada cambio se prueba con
`node construir.js` + `node verificar.js` sobre un JSON real y con `scripts/pruebas/indice.js`.

### Fase C · Pantalla de materia

`docs/materia.html?m=matematicas` (mockup "Materia"): temas del temario con estado y barra,
botones adaptativa y fiel, material del profesor visible (temario, práctica, páginas del libro,
cuaderno desde `materiales/<slug>/`), videos aprobados, tarjeta "Para mamá y papá" con lo que más
le cuesta. Lee lo mismo que el índice: `practicas.json`, `config.json`, progreso global. Para
listar materiales sin API de GitHub, `generar.yml` puede escribir `docs/materiales.json`.

### Fase D · Acceso para otras familias

Recomendación: Cloudflare Pages + Cloudflare Access (plan Zero Trust gratuito hasta 50 usuarios).

1. Conectar el repo a Cloudflare Pages (carpeta de salida `docs`). Permite repo privado sin pagar.
2. Access: aplicación sobre el dominio, política "correo en lista" con código de un solo uso por
   correo. Sin contraseñas, sin cuentas. El admin mantiene la lista de correos.
3. Segunda política para `/admin/*` solo con el correo del dueño.
4. Access protege también PDF y fotos del profesor (hoy públicos por URL).
5. Después: un Worker con el token de GitHub como secreto, para que el admin no pida token a cada
   persona, y para guardar progreso por estudiante en KV o D1 usando el correo verificado por Access.

Descartado por ahora: PIN compartido en la página (no es seguridad), Supabase o Firebase (más
código desde el día uno, se puede migrar después si hace falta).

### Fase E · Perfiles y sincronización

Varios estudiantes por familia, selector de perfil al entrar (mockup "Acceso"), progreso que
sigue al estudiante entre dispositivos (Worker + KV/D1), mensaje de mamá o papá en el inicio
(ya hay un hueco en el índice: `localStorage['sas-mensaje-papas']`), resumen semanal para el adulto.

### Fase F · Admin completo

Materiales con tipo (temario, práctica, solucionario, libro, cuaderno), cola de preguntas de
Claude con respuesta en pantalla, configuración por práctica (mockup "Configuración": fuentes,
formatos, cantidad de preguntas, repaso final, videos, visibilidad), estudiantes y familias.

---

## 4. Convenciones del repo

- Nombres de archivo de prácticas: `docs/practicas/<materia>_<modo>_<ronda>.html`. `materia` es el
  slug (`matematicas`, `espanol`, `estudios_sociales`, `science`, `english`). `modo` es
  `adaptativa` o `fiel`. `ronda` es el identificador de `config.json` (`2026-11`, `2026-11b`).
- `materia` en `practicas.json` y en `config.json` va con el nombre visible: `Matemáticas`,
  `Español`, `Estudios Sociales`, `Science`, `English`.
- `contenido/<materia>/<modo>.json` es la fuente de verdad de la ronda en curso. Al publicar se
  archiva como `<modo>_<ronda>.json`. Las prácticas sin JSON no se pueden regenerar.
- Al regenerar una práctica cambia su `sal`, así que su progreso interno (planetas) se reinicia.
  El progreso global no se pierde porque va por nombre de archivo.
- Español neutro en toda la interfaz del estudiante, voseo en los textos del motor que ya existen.
  Textos para adultos en "usted".
- Sin punto y coma ni rayas largas en textos de interfaz y documentación.
- No tocar `index.html`, `practicas/`, `assets/` de la raíz hasta que se haga el corte a `docs/`.

---

## 5. Almacén de progreso (`localStorage['sas-progreso-v1']`)

```json
{
  "v": 1,
  "puntos": 1240,
  "dias": { "2026-11-08": { "segundos": 720, "respondidas": 24, "puntos": 135, "misiones": 1 } },
  "practicas": {
    "matematicas_adaptativa_2026-11.html": {
      "titulo": "…", "materia": "Matemáticas", "modo": "adaptativa",
      "respondidas": 24, "ultimaVez": "2026-11-08T18:00:00.000Z", "completada": false,
      "temas": { "t1": { "nombre": "…", "estado": "dominado", "fallos": 1, "intentos": 3, "reforzado": false } }
    }
  }
}
```

`estado` es `pendiente`, `progreso` o `dominado`. "Todavía no" en el índice = `progreso` con
`fallos > 0`. Las fechas de `dias` son locales (no UTC). Otros valores locales: `sas-nombre`
(nombre del estudiante), `sas-mensaje-papas` (texto que muestra el inicio), `practica-<sal>`
(progreso interno de cada práctica, del motor original).

---

## 6. Cómo probar

```bash
# Dependencia de pruebas (una vez)
npm i jsdom

# Motor: generar y verificar una práctica real
S=.claude/skills/practicas-interactivas/assets
node $S/construir.js contenido/matematicas/adaptativa_2026-10.json /tmp/m.html
node $S/verificar.js /tmp/m.html contenido/matematicas/adaptativa_2026-10.json

# Regenerar todas las prácticas con JSON (después de cambiar construir.js)
for j in contenido/*/*.json; do m=$(basename $(dirname $j)); f=$(basename $j .json); \
  node $S/construir.js "$j" "docs/practicas/${m}_${f}.html" && node $S/verificar.js "docs/practicas/${m}_${f}.html" "$j"; done

# Pruebas de punta a punta con navegador simulado
TZ=America/Costa_Rica node scripts/pruebas/indice.js        # práctica registra, índice lee y arma misiones
TZ=America/Costa_Rica node scripts/pruebas/admin.js         # crear ronda, duplicado rechazado, marcar actual
CFG=/ruta/config_con_ronda_vacia.json TZ=America/Costa_Rica node scripts/pruebas/indice.js

# Ver el sitio nuevo en local
npx serve docs      # http://localhost:3000  y  http://localhost:3000/admin/
```

---

## 7. Cómo pedirle trabajo a Claude Code con este documento

Ejemplos de instrucciones que funcionan bien:

- "Leé ROADMAP.md y hacé la Fase B, punto 1 y 4 (modo misión y pantalla de cierre). Probá con
  scripts/pruebas/indice.js y regenerá las prácticas."
- "Leé ROADMAP.md, sección 2 y 4. Construí docs/materia.html según la Fase C, usando el mockup
  como referencia de layout."
- "Leé ROADMAP.md. Preparame los pasos exactos de Cloudflare Pages + Access (Fase D) para este repo,
  sin ejecutar nada todavía."

Siempre: trabajar en rama, correr las pruebas de la sección 6 y abrir PR contra `main`.
