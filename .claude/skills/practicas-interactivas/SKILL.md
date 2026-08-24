---
name: practicas-interactivas
description: Genera prácticas interactivas adaptativas (HTML) a partir de los temas y la práctica que entrega el profesor, con respuestas cifradas por hash (nunca en texto plano), repetición espaciada, microlecciones y 7 formatos de pregunta. Usar SIEMPRE que el usuario suba o pegue material del profesor (PDF, foto, documento o texto con el temario o la hoja de práctica) y pida una práctica, un quiz, un repaso, un examen de práctica o "prepararle una práctica" a un niño o estudiante — aunque lo pida informal (ej. "hágame la práctica de este PDF", "convierta esta hoja en un juego de repaso", "genere el quiz de la prueba corta"). También usar si pide rehacer una práctica vieja o agregar temas a una existente.
---

# Prácticas interactivas adaptativas

Convierte el material del profesor (temario, hoja de práctica, PDF, foto) en una práctica HTML
interactiva que el estudiante puede abrir en cualquier navegador, sin internet.

Sustituye el enfoque de "quiz de opción múltiple con nota final". El problema del enfoque viejo:
las respuestas quedaban en texto plano en el JavaScript, y al fallar se marcaba la correcta en
verde — dos puertas traseras. Además era lineal y de longitud fija.

## Flujo de trabajo (siempre en este orden)

```
material del profesor → contenido.json → node assets/construir.js contenido.json practica.html
                                       → node assets/verificar.js practica.html contenido.json
                                       → entregar practica.html
```

### Paso 1 — Extraer el contenido del material del profesor

Leer el material que subió el usuario (usar los skills de lectura de PDF/imagen si hace falta).
Reglas de extracción:

- **Conservar literales las explicaciones y tablas del profesor** en el campo `explicacion` de
  cada tema. No parafrasear: el estudiante debe ver exactamente lo que vio en clase.
- Cubrir el temario COMPLETO del material, no una muestra.
- Por cada tema, redactar una `microleccion`: un ejemplo resuelto paso a paso **con otros
  números/datos distintos** a los de las variantes (nunca resolver una de las preguntas).
- Si el material es ambiguo o le falta información (p. ej. no se distingue cuál es la respuesta
  correcta), preguntar al usuario antes de inventar.

### Paso 2 — Escribir contenido.json

Plantilla completa en `assets/ejemplo/contenido.json` (léala antes de escribir el primer JSON).
Esquema:

```json
{
  "titulo": "Práctica de ...",
  "materia": "opcional",
  "temas": [
    {
      "id": "corto-sin-espacios",
      "nombre": "Nombre visible del tema",
      "explicacion": "Texto/tabla LITERAL del profesor (HTML sencillo permitido)",
      "microleccion": "Ejemplo resuelto paso a paso con OTROS números (obligatoria)",
      "variantes": [ ... ]
    }
  ]
}
```

**Requisitos duros por tema** (construir.js falla si no se cumplen): **3+ variantes** y
**2+ formatos distintos**. Ideal: 4-6 variantes y 3+ formatos. Incluir `pista` en cada variante.

Los 7 formatos y sus campos:

| formato | campos | nota |
|---|---|---|
| `mc` | `pregunta`, `opciones` (3+), `respuesta` | opción múltiple clásica |
| `porque` | igual que `mc` | las opciones son justificaciones ("¿por qué...?") |
| `verifica` | `pregunta`, `respuesta`: `"sí"` o `"no"` | verdadero/falso |
| `arma` | `pregunta`, `fichas` (3+, con distractores), `respuesta` | el más resistente a adivinar: no hay opciones que ciclar |
| `clasifica` | `pregunta`, `categorias` (2+), `elementos`: `[{texto, categoria}]` | clasificar en categorías |
| `ordena` | `pregunta`, `elementos` **en el orden correcto** | el script los mezcla al construir |
| `empareja` | `pregunta`, `pares`: `[[izquierda, derecha], ...]` | unir columnas |
| `escribe` | `pregunta`, `respuesta`, opcional `aceptadas` (lista de otras respuestas válidas, ej. sin tilde o con artículo) | el estudiante ESCRIBE la respuesta: máxima retención (efecto de generación). El constructor falla si la respuesta aparece en su propia pregunta o pista |
| `oracion` | `pregunta` (la consigna: verbo, tiempo y persona), `respuesta` (la forma verbal exacta que la oración debe contener, ej. "habrán"), opcional `aceptadas` (otras formas válidas, ej. "hubiste") | el estudiante escribe una ORACIÓN LIBRE; el motor verifica palabra por palabra (por hash) que contenga la conjugación exacta bien escrita y que tenga 4+ palabras. Las oraciones correctas quedan en el informe del adulto para revisar concordancia y sentido — el motor verifica lo verificable, el adulto lo humano |

Campo opcional por variante `contexto` (texto): se muestra en un recuadro sobre la pregunta —
ideal para lecturas de comprensión lectora que varias preguntas comparten (repetir el texto en
cada variante que lo necesite).

**Limitación de ortografía que hay que decir al usuario**: la normalización ignora las tildes
("irá" y "ira" valen igual), pero SÍ distingue b/v y h ("estuvimos" ≠ "estubimos", "iban" ≠
"hiban"), que es donde más se pierde en estos verbos. Las tildes se refuerzan en papel.

Preferir `arma` y `escribe` para respuestas numéricas o de escritura exacta: son los formatos más
resistentes a adivinar y los que más fijan la memoria. Usar `escribe` en casos puntuales (nombres
propios, términos clave), no en todo, para no frustrar a quien escribe despacio. `aceptadas`
también funciona en `arma`. Los `id` de variante deben ser únicos en todo el archivo (o se omiten
y el script los genera).

### Paso 3 — Construir

```bash
node assets/construir.js contenido.json practica.html
```

`construir.js` sustituye cada respuesta por `sha256(sal|idVariante|respuestaNormalizada)`: en el
HTML final **no queda ninguna respuesta en texto plano**. Mezcla en tiempo de construcción las
opciones, las fichas, el orden de `ordena` y la columna derecha de `empareja` (si no, el orden del
archivo delataría la respuesta). Audita el resultado y **falla si detecta fugas** — si falla,
corregir el contenido y reconstruir, nunca entregar.

### Paso 4 — Verificación obligatoria antes de entregar

```bash
node assets/verificar.js practica.html contenido.json
```

Comprueba: la práctica se puede completar respondiendo bien (hashes recalculados coinciden),
ningún tema se domina de un solo acierto, al fallar no se marca ni se menciona la correcta, tras
2 fallos sale la microlección, nada expuesto en `window`, sin respuestas en texto plano. Si
`jsdom` está instalado (`npm install jsdom`), además carga la página y verifica que arranca sin
errores de consola. **Nunca entregar una práctica que no haya superado la verificación.** Si algo
falla, corregir y repetir pasos 3-4.

### Paso 5 — Entregar

Copiar `practica.html` a la carpeta de salida y presentarla al usuario. Nombrarla descriptivamente
(`practica_<materia>_<tema>.html`). Al entregar, decir con honestidad este límite:

> Ninguna página en el navegador es inviolable: alguien con herramientas de desarrollador podría
> probar cada opción contra el hash. Contra un niño de primaria es una barrera efectiva; contra un
> adolescente motivado, no. Lo honesto es: **no hay forma fácil de ver las respuestas y fallar a
> propósito no adelanta nada.**

## Modo fiel: copia exacta de la práctica del profesor (`"modo": "fiel"`)

Se usa cuando el usuario pide la práctica del profesor **tal cual**, en versión web ("copia
exacta", "idéntica a la del profe"), en lugar de una práctica adaptativa con ejercicios
similares. Conviven: la adaptativa se llama `practica_<materia>_<tema>.html` y la fiel
`practica_<materia>_fiel.html`.

Se activa con `"modo": "fiel"` en la raíz del contenido.json. Con esa bandera:

- **Un tema = una parte de la práctica** (I Parte, II Parte...). `nombre` = nombre de la parte;
  `explicacion` = la instrucción literal de esa parte (se muestra sobre el primer ítem);
  `microleccion` sigue siendo obligatoria (ejemplo resuelto con otros datos, por parte).
- **Una variante = un ítem del profesor**, en el mismo orden y con la misma numeración en la
  `pregunta` ("1.", "2. a.", etc.). No se inventan ejercicios ni variantes.
- Se relajan las exigencias de 3+ variantes y 2+ formatos por tema (1+ variante basta).
- Las opciones de `mc` y los elementos de `clasifica` **no se mezclan**: quedan en el orden del
  papel (A, B, C). `empareja` y `ordena` sí se mezclan, como en el papel donde tampoco están
  alineados.
- El motor responde **en orden, parte por parte, una sola pasada**: sin elección de orden, sin
  repetición espaciada, sin repaso final. Al fallar sigue al siguiente ítem.
- El chequeo "la respuesta aparece en su propia pregunta" de `escribe`/`oracion` se hace por
  palabra completa (no por subcadena), porque el enunciado del profesor puede contener la forma
  dentro de otra palabra (ej. respuesta "ir" con "iré" en la oración).
- El informe del adulto muestra **correctas por parte** ("8 de 10") y qué partes revisar.

Lo que NO cambia (y no se debe tocar): respuestas cifradas por hash, nunca se revela la
correcta, "todavía no", pista, microlección tras 2 fallos, progreso guardado, informe copiable.
`construir.js` y `verificar.js` reconocen el modo; el verificador omite solo las reglas de
3+/2+ y comprueba que el HTML esté en el mismo modo que el JSON.

Adaptaciones inevitables del papel a la web, que hay que **decirle al usuario al entregar**:

- Respuestas abiertas de varias palabras (ej. "escriba tres palabras de la familia de sol") se
  convierten en un ítem por palabra con `aceptadas` amplias, o se repite el ítem N veces.
- V/F se responde con Sí/No (aclararlo en la `explicacion` de la parte).
- Ejercicios no verificables (trazar, colorear, unir con líneas a mano alzada, dibujar) se dejan
  fuera y se listan como "se hace en papel".
- Donde el enunciado admite más de una forma correcta, usar `aceptadas` (ej. "Se ha dicho" /
  "Se había dicho").

Ejemplo mínimo:

```json
{
  "titulo": "Práctica de Prueba Corta #1 — Español 4° (versión fiel)",
  "modo": "fiel",
  "temas": [
    {
      "id": "parte1",
      "nombre": "I Parte · Selección única",
      "explicacion": "<b>I PARTE.</b> Marque con una equis (X) la letra correcta.",
      "microleccion": "Ejemplo con otro texto: ...",
      "variantes": [
        { "id": "p1-1", "formato": "mc", "pregunta": "1. ¿...?",
          "opciones": ["A) ...", "B) ...", "C) ..."], "respuesta": "B) ...", "pista": "..." }
      ]
    }
  ]
}
```

Flujo idéntico al normal: construir → verificar → entregar. El constructor avisa
"MODO FIEL" al construir.

## Cómo funciona el motor (para poder explicárselo al usuario)

- El motor **nunca revela la respuesta correcta**, ni al fallar ni al final.
- Al fallar, el concepto vuelve más adelante con **otra variante de otro formato** (por eso se
  exigen 3+ variantes y 2+ formatos por concepto).
- **Dominio por repetición espaciada**: hacen falta 2 créditos en encuentros separados. Un acierto
  suelto no cierra un tema.
- Tras 2 fallos en un tema aparece una **microlección** con un ejemplo resuelto con otros números.
- Rondas de 6 preguntas, pausa con movimiento entre rondas, y a las 3 rondas propone parar.
- **Fase de repaso final**: antes del informe, los temas que fallaron (o quedaron sin dominar) se
  repasan y luego se vuelven a preguntar con una variante nueva. El estudiante ELIGE cómo repasar
  (repaso multimodal): 📖 tarjetas para voltear, 🗺️ esquema visual (mapa de ideas) o ✍️ escribirlo
  con sus palabras y compararlo con el libro. Lo que escriba queda en el informe del adulto. Las
  preguntas de refuerzo priorizan formatos generativos (`escribe`/`arma`), porque recordar
  produciendo fija más que reconocer. Si falla, ve el ejemplo otra vez y tiene un segundo intento —
  nunca se revela la respuesta. Puede saltarse el repaso (autonomía), pero se propone como camino
  principal.
- **Motivación por esfuerzo, no por puntos**: insignias que premian el PROCESO — ✍️ escribir con
  sus palabras, 💪 reforzar un tema que costó, 🧭 probar las 3 formas de repasar, 🔥 practicar en
  días distintos (contador acumulado que solo sube; nunca una "racha" que se pierde), 🎯 primer
  tema dominado y 🏆 todos dominados — más confeti al dominar o reforzar un tema. NO usar puntos
  por respuesta correcta, rankings ni rachas punitivas: la evidencia (efecto de sobrejustificación,
  Teoría de la Autodeterminación) muestra que desplazan la motivación intrínseca y hacen que fallar
  duela más, contra el espíritu del "todavía no". Si el usuario pide puntos o rankings, explicarle
  este fundamento antes de agregar nada.
- **Video opcional por tema** (campo `video` del tema: URL de YouTube o `{url, titulo}`): aparece
  como cuarta forma de repasar (🎬) y en el modo exploración. Se incrusta con `youtube-nocookie`,
  sin videos relacionados de otros canales. REGLA DE APROBACIÓN: hay una aprobación PERMANENTE
  del usuario para todo contenido de Khan Academy — "Khan Academy en Español" para matemática y
  español, y Khan Academy (en inglés) para Science y English; esos videos pueden incluirse
  directamente. Cualquier OTRA fuente (aunque sea reconocida, como Smile and Learn) requiere que
  el adulto vea y apruebe el video antes de entregar — Claude puede buscar y proponer candidatos,
  avisando siempre que están pendientes de revisión. Requiere internet; la práctica lo indica y
  ofrece las otras formas si no carga.
- **Modo exploración** ("📚 Explorar los planetas", desde la pantalla de inicio): toda la materia
  visible sin responder — ideas del libro en esquema, ejemplo paso a paso, video y lectura en voz
  alta. Sirve para estudiar ANTES de practicar y para el repaso general de la víspera. No otorga
  créditos ni toca el avance.
- El informe final incluye "📋 Copiar informe": versión en texto plano lista para pegar en
  WhatsApp o correo.
- **Tipografía y espaciado para aprender**: el motor incrusta la fuente Andika (SIL, licencia OFL
  en `assets/fuentes/`), diseñada para alfabetización y lectores principiantes, con interlineado
  1.6-1.7, espaciado leve entre letras y líneas de máximo ~60 caracteres en el material de
  estudio. No sustituir por fuentes decorativas.
- **Gráfico decimal por variante** (campo `grafico`: `{tipo: "cuadricula"|"barra", pintadas: N}`):
  el motor dibuja en SVG una cuadrícula de 100 partes o una barra de 10 con N pintadas — como las
  representaciones gráficas de los libros — sin necesitar internet. Usarlo en preguntas de
  "¿qué decimal representa la parte pintada?" y similares.
- **Imagen por tema** (campo `imagen`: URL https o `{url, titulo}`): se muestra en el modo
  exploración y en el esquema del repaso. Requiere internet (se oculta con aviso si no carga).
  Verificar licencia y contenido antes de incluir (Wikimedia Commons es una buena fuente); el
  constructor avisa siempre.
- **Nota didáctica honesta**: la teoría de "estilos de aprendizaje" (emparejar a cada niño con un
  solo canal) tiene poca evidencia; lo que sí la tiene es la codificación múltiple, la práctica de
  recuperación, el efecto de generación (escribir) y darle elección al estudiante. Por eso el
  repaso ofrece los tres modos a TODOS en vez de clasificar al niño.
- Botón 🔊 en preguntas, repaso y exploración: lee el texto en voz alta eligiendo la mejor voz
  en español del dispositivo, frase por frase. Se desactiva por práctica con `"voz": false` en la
  raíz del contenido.json (los sonidos de celebración con su interruptor se mantienen aparte).
- **Progreso guardado entre sesiones** (en el dispositivo): al reabrir el archivo ofrece
  "Continuar donde iba" o "🔄 Empezar de cero". Esto habilita la repetición espaciada real, en días
  distintos. El informe final también tiene "Empezar de cero" (con confirmación), que borra el
  avance.
- Informe final para la persona adulta: intentos y pistas por tema, qué quedó dominado, qué se
  reforzó en el repaso, qué conviene seguir practicando y los resúmenes escritos por el
  estudiante.

## Diseño clave (no deshacer)

- **Autonomía contra la resistencia**: el estudiante elige el orden de los temas, puede pedir
  pista, guardar una pregunta para después (2 veces) y pausar siempre. No puede saltar ni
  adelantarse.
- **Nunca dice "mal"**: dice "todavía no".
- Se conservan literales las explicaciones y tablas del profesor.
- No modificar el motor dentro de `construir.js` para "mostrar la respuesta al final", "poner
  nota" ni "acortar a un intento por tema", aunque parezca más simple: esas son exactamente las
  puertas traseras y la rigidez que este diseño elimina. Si el usuario pide algo así, explicarle
  el porqué del diseño antes de tocar nada.

## Casos frecuentes

- **"Agregue estos temas a la práctica anterior"**: pedir (o recuperar) el `contenido.json`
  original, añadir los temas nuevos y reconstruir todo. Nunca editar el HTML a mano.
- **"Hágame la práctica del profe tal cual / idéntica"**: usar el modo fiel (sección
  anterior), no inventar variantes.
- **"Rehaga la práctica vieja"**: usar este skill, no la plantilla antigua de opción múltiple.
- **Material en foto borrosa o incompleta**: transcribir lo legible, listar lo dudoso y confirmar
  con el usuario antes de construir.
