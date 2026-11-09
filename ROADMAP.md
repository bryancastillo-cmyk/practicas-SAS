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

### Fase B · El motor aprende a hacer misiones (HECHO en la rama `fase-b-misiones`, PR #4)

Lo que quedó implementado en `construir.js`:

1. **Modo misión** con `?mision=N` en la URL (3 a 40). La sesión termina a las N preguntas con la
   pantalla de cierre. Sin el parámetro, la práctica se comporta como antes. El índice pasa el
   tamaño que calcula para cada misión.
2. **Barra de misión**: "pregunta X de N" y "⏱ minutos transcurridos de ~estimados". No hay
   cuenta regresiva por pregunta.
3. **Pausa de movimiento** de 30 segundos a la mitad de la misión (misiones de 6 o más).
4. **Confianza antes de responder** (Seguro / Más o menos / Adivinando), opcional. Se guarda en
   `sas-progreso-v1.confianza`. Si estaba seguro y falla, la microlección sale de inmediato y el
   mensaje lo dice. Si acierta adivinando, no suma crédito de dominio y el tema vuelve pronto.
5. **Microlección al primer fallo** en modo misión (antes era al segundo).
6. **Cierre de misión**: puntos de la misión, preguntas, minutos activos, racha, temas que se
   movieron, pregunta "¿cuándo hacés la siguiente?" (se guarda en `sas-proxima` y el inicio lo
   recuerda al día siguiente), botones "Listo por hoy", "Una misión más" y "Ver el informe".
   Si el niño domina todo antes de N, también pasa por el cierre.

Pendiente de esta fase: reemplazar emojis del motor por SVG y alinear la paleta de las prácticas
con la del índice (bajo riesgo, cosmético). Prueba: `scripts/pruebas/mision.js`.

### Temario oficial de la ronda (HECHO, PR #5)

El colegio manda un PDF "Contenidos de pruebas" con todas las materias: fecha, habilidades,
temas, páginas del libro y material de apoyo. Ahora es una pieza de primera clase:

- Se sube una vez por ronda desde el admin (botón "Temario del colegio" en la fila de la ronda) a
  `materiales/rondas/<ronda>/`. El workflow `temario.yml` lo lee con Claude y escribe
  `docs/rondas/<ronda>.json` (esquema en `docs/rondas/README.md`).
- `scripts/repartir_temario.js <ronda>` escribe `materiales/<slug>/temario_<ronda>.md` por materia
  y pone las fechas de prueba en `docs/config.json`.
- `generar.yml` trata `temario_<ronda>.md` como autoridad: la práctica cubre exactamente esos temas,
  el resto del material es apoyo. Ignora temarios de otras rondas.
- Para 2026-11 el JSON se escribió a mano a partir del PDF y ya está repartido.

Hecho: la pestaña de materia muestra los temas del examen desde ese JSON aunque todavía no
exista práctica.

### Fase C · Pestaña por materia (HECHO, en producción)

`docs/materia.html?m=<slug>` (mockup "3 · Pestaña de materia" y "4b"). Barra de pestañas común
al inicio y a la pestaña: Hoy | una por materia de la ronda (punto de estado + fecha del examen)
| Mis logros. El slug sale del nombre de la materia sin tildes ni espacios (`estudios_sociales`).

Lo que muestra, solo de esa materia: encabezado con examen y estrellas; KPI (temas dominados,
todavía no, minutos efectivos, misiones y preguntas, aciertos); misiones (sugerida, repaso final
mezclado, práctica del profe o aviso de que falta la hoja); "Temas del examen" = subtemas del
temario oficial cruzados por nombre con los temas de la práctica (estado, barra, Repasar);
historial de sesiones; minutos por día de la semana; material y apoyo (temario, prácticas de esta
ronda y anteriores, lo que el profesor indicó repasar); "Para mamá y papá" con lo que más le cuesta.

Para eso el motor guarda ahora, dentro de `practicas[archivo]` del almacén global: `segundos`,
`puntos`, `misiones`, `dias{fecha:{segundos,respondidas,puntos,misiones}}` y
`sesiones[{t,tipo:mision|completa|parcial,preguntas,segundos,puntos,dominados[]}]` (máx. 40).
Progreso anterior a este cambio: si la materia es la única con práctica abierta, la pestaña usa
los totales globales y lo marca "(aprox.)". Las prácticas enlazan a su pestaña ("📘 Materia")
junto al botón Inicio. Prueba: `scripts/pruebas/materia.js`.

Pendiente de esta fase: listar páginas del libro y cuaderno subidos (`materiales/<slug>/`) sin API
de GitHub (`generar.yml` puede escribir `docs/materiales.json`); videos aprobados por materia.

### Puerta de cortesía: alias y clave (HECHO, en producción)

Mientras no exista Cloudflare Access, el sitio pide alias y clave numérica (`docs/acceso.json`,
claves con hash sha256(sal|alias|clave), nunca en texto plano). Se administra desde el admin,
tarjeta "Estudiantes y acceso". Efectos:

- El alias es el perfil del estudiante: el progreso se guarda en `sas-progreso-v1:<alias>`, así
  dos hermanos comparten tableta sin mezclar puntos. "Cambiar de estudiante" en el botón de perfil.
- Las prácticas abiertas sin sesión (`sas-sesion`) muestran "Entrá desde el inicio" cuando se
  sirven por http(s). Como archivo local siguen abriendo.
- Si `acceso.json` no existe o no tiene usuarios, el sitio queda abierto como antes.

Límite honesto: es verificación en el navegador. Detiene a un curioso, no a alguien técnico, y
los archivos siguen accesibles por URL directa. Una clave de 4 dígitos con hash público se puede
adivinar por fuerza bruta en milisegundos. El candado real es la Fase D, y esta puerta convive
con ella (Access decide quién entra al sitio, el alias decide qué perfil se usa).

### Estadísticas de uso (HECHO el cliente y el servidor; falta desplegar el servidor)

Dos capas:

1. **En el dispositivo** (ya en producción): `docs/familia.html` ("Para mamá y papá" en el pie del
   inicio) muestra, por cada alias que practicó en ese aparato, ingresos en 30 días, tiempo efectivo
   (7 días y total, con barras por día), misiones, prácticas completas y la tabla de prácticas. El
   inicio registra cada ingreso en `sas-progreso-v1:<alias>.ingresos` (uno por día con sesión vigente).
2. **Central** (código listo en `worker/`, pendiente de desplegar): un Cloudflare Worker con D1 que
   recibe eventos `ingreso`, `activo` (segundos), `mision`, `dominado` y `practica_completa` desde
   el inicio y las prácticas (`navigator.sendBeacon`, solo si `config.telemetria.url` existe) y los
   resume por estudiante. El admin lo muestra en la tarjeta "Estadísticas de uso" y, mientras no
   exista, muestra ahí mismo los 5 pasos para desplegarlo. Despliegue: `worker/README.md` (cuenta de
   Cloudflare + 3 secrets en GitHub + correr el workflow `deploy-worker.yml`, que escribe la URL en
   `config.json`). Solo acepta alias que existan en `acceso.json`. Pruebas: `scripts/pruebas/worker.js`.

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

`estado` es `pendiente`, `progreso` o `dominado`. `confianza` acumula aciertos y fallos por nivel
(`seguro`, `medio`, `adivino`). "Todavía no" en el índice = `progreso` con
`fallos > 0`. Las fechas de `dias` son locales (no UTC). Otros valores locales: `sas-nombre`
(nombre del estudiante), `sas-sesion` (alias y nombre con los que entró; define la clave de progreso
`sas-progreso-v1:<alias>`), `sas-mensaje-papas` (texto que muestra el inicio), `sas-proxima` (momento
elegido para la siguiente misión, con la fecha para la que aplica), `practica-<sal>`
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
TZ=America/Costa_Rica node scripts/pruebas/mision.js        # modo misión: confianza, pausa, cierre, puntos
TZ=America/Costa_Rica node scripts/pruebas/materia.js       # pestaña por materia: práctica registra por materia, materia.html pinta, pestañas en el inicio
node scripts/repartir_temario.js 2026-11                     # reparte docs/rondas/2026-11.json a materiales/ y config
node --no-warnings scripts/pruebas/worker.js                 # worker de estadísticas con D1 simulada (node:sqlite)
CFG=/ruta/config_con_ronda_vacia.json TZ=America/Costa_Rica node scripts/pruebas/indice.js

# Ver el sitio nuevo en local
npx serve docs      # http://localhost:3000  y  http://localhost:3000/admin/
```

---

## 7. Cómo pedirle trabajo a Claude Code con este documento

Ejemplos de instrucciones que funcionan bien:

- "Leé ROADMAP.md y hacé la Fase B, punto 1 y 4 (modo misión y pantalla de cierre). Probá con
  scripts/pruebas/indice.js y regenerá las prácticas."
- "Leé ROADMAP.md. Preparame los pasos exactos de Cloudflare Pages + Access (Fase D) para este repo,
  sin ejecutar nada todavía."

Siempre: trabajar en rama, correr las pruebas de la sección 6 y abrir PR contra `main`.
