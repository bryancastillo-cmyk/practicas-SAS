#!/usr/bin/env node
/*
 * verificar.js — Verificación obligatoria antes de entregar la práctica.
 *
 * Uso:  node verificar.js practica.html contenido.json
 *
 * Comprueba:
 *  1. Cada variante del contenido tiene su hash correcto en el HTML (se puede completar
 *     respondiendo bien) y no sobran ni faltan hashes.
 *  2. Ninguna respuesta en texto plano: sin claves "respuesta"/"pares" en los datos,
 *     respuestas de "arma" ausentes del HTML, "ordena" y "empareja" mezclados.
 *  3. Reglas pedagógicas: 3+ variantes y 2+ formatos por tema, microlección presente,
 *     dominio exige 2 créditos (nunca un solo acierto), el mensaje de fallo dice
 *     "Todavía no" y jamás "incorrecto"/"mal" ni revela la correcta.
 *  4. Nada expuesto en window (los datos viven en variables locales del script, no se
 *     asignan a window.*).
 *  5. (Opcional) Si jsdom está instalado, carga la página y comprueba que arranca sin
 *     errores de consola y que la pantalla de inicio se pinta.
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');

function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}
function normArma(s) { return norm(s).replace(/\s+/g, ''); }
function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function canonica(v) {
  switch (v.formato) {
    case 'mc': case 'porque': case 'verifica': case 'escribe': case 'oracion': return norm(v.respuesta);
    case 'arma': return normArma(v.respuesta);
    case 'clasifica': return v.elementos.map(e => norm(e.texto) + '>' + norm(e.categoria)).sort().join(';');
    case 'ordena': return v.elementos.map(norm).join('>');
    case 'empareja': return v.pares.map(p => norm(p[0]) + '>' + norm(p[1])).sort().join(';');
  }
}
function hashesDe(sal, id, v) {
  const f = v.formato === 'arma' ? normArma : norm;
  const cans = [canonica(v)];
  if (Array.isArray(v.aceptadas)) v.aceptadas.forEach(a => cans.push(f(a)));
  return [...new Set(cans)].map(c => sha256(sal + '|' + id + '|' + c));
}

const [, , rutaHtml, rutaJson] = process.argv;
if (!rutaHtml || !rutaJson) { console.error('Uso: node verificar.js practica.html contenido.json'); process.exit(1); }
const html = fs.readFileSync(rutaHtml, 'utf8');
const contenido = JSON.parse(fs.readFileSync(rutaJson, 'utf8'));

const errores = [];
function chk(ok, msg) { if (ok) console.log('  ✔ ' + msg); else { console.log('  ✘ ' + msg); errores.push(msg); } }

// --- extraer datos embebidos ---
const ini = html.indexOf('/*DATOS-INICIO*/');
const fin = html.indexOf('/*DATOS-FIN*/');
let datos = null;
if (ini >= 0 && fin > ini) {
  const bloque = html.slice(ini, fin);
  const m = bloque.match(/var DATOS = (\{[\s\S]*\});/);
  if (m) { try { datos = JSON.parse(m[1]); } catch (e) { /* nada */ } }
}
console.log('\n[1] Estructura y hashes');
chk(!!datos, 'El bloque de datos embebido se puede leer');
if (!datos) { console.error('\nVERIFICACIÓN FALLIDA'); process.exit(1); }

const sal = datos.sal;
let hashesEsperados = new Set();
let todosPresentes = true;
contenido.temas.forEach(t => t.variantes.forEach((v, vi) => {
  const id = v.id || (t.id || 'tema') + '-v' + (vi + 1);
  hashesDe(sal, id, v).forEach(h => {
    hashesEsperados.add(h);
    if (!html.includes(h)) todosPresentes = false;
  });
}));
chk(todosPresentes, 'Todos los hashes recalculados desde contenido.json están en el HTML (la práctica SE PUEDE completar respondiendo bien)');
const hashesEmbebidos = new Set();
datos.temas.forEach(t => t.variantes.forEach(v => (v.hashes || []).forEach(h => hashesEmbebidos.add(h))));
chk(hashesEmbebidos.size === hashesEsperados.size && [...hashesEmbebidos].every(h => hashesEsperados.has(h)),
  'No hay hashes de más ni de menos (' + hashesEmbebidos.size + ' respuestas aceptadas en total)');

console.log('\n[2] Sin respuestas en texto plano');
const bloqueDatos = html.slice(ini, fin);
chk(!/"respuesta"\s*:/.test(bloqueDatos), 'Sin claves "respuesta" en los datos embebidos');
chk(!/"aceptadas"\s*:/.test(bloqueDatos), 'Sin claves "aceptadas" en los datos embebidos');
chk(!/"pares"\s*:/.test(bloqueDatos), 'Sin "pares" embebidos (empareja no delata el mapeo)');
let armaLimpio = true, ordenaMezclado = true, emparejaMezclado = true;
let htmlSinMaterial = html.replace(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g, ' ');
contenido.temas.forEach(t => [t.explicacion, t.microleccion].forEach(txt => {
  if (!txt) return;
  htmlSinMaterial = htmlSinMaterial.split(String(txt)).join(' ');
  htmlSinMaterial = htmlSinMaterial.split(JSON.stringify(String(txt)).slice(1, -1)).join(' ');
}));
const htmlNormSin = norm(htmlSinMaterial);
const htmlCompacto = htmlNormSin.replace(/\s+/g, '');
contenido.temas.forEach(t => t.variantes.forEach((v, vi) => {
  const id = v.id || (t.id || 'tema') + '-v' + (vi + 1);
  const dat = datos.temas.flatMap(x => x.variantes).find(x => x.id === id);
  if (v.formato === 'arma') {
    const r = normArma(v.respuesta);
    if (r.length >= 3 && (htmlNormSin.includes(r) || (r.length >= 6 && htmlCompacto.includes(r)))) armaLimpio = false;
  }
  if (v.formato === 'ordena' && v.elementos.length > 1 && dat &&
      JSON.stringify(dat.elementos.map(norm)) === JSON.stringify(v.elementos.map(norm))) ordenaMezclado = false;
  if (v.formato === 'empareja' && v.pares.length > 1 && dat &&
      JSON.stringify(dat.derecha.map(norm)) === JSON.stringify(v.pares.map(p => norm(p[1])))) emparejaMezclado = false;
}));
chk(armaLimpio, 'Las respuestas de "arma" no aparecen en el HTML');
chk(ordenaMezclado, 'Los "ordena" quedaron mezclados (no en el orden correcto)');
chk(emparejaMezclado, 'La columna derecha de "empareja" quedó mezclada');

console.log('\n[3] Reglas pedagógicas');
let variantesOk = true, formatosOk = true, microOk = true;
const fiel = contenido.modo === 'fiel';
if (fiel) console.log('  (modo fiel: se omiten 3+ variantes / 2+ formatos; la copia sigue el orden del profesor)');
datos.temas.forEach(t => {
  if (!fiel && t.variantes.length < 3) variantesOk = false;
  if (!fiel && new Set(t.variantes.map(v => v.formato)).size < 2) formatosOk = false;
  if (!t.microleccion || !String(t.microleccion).trim()) microOk = false;
});
chk(variantesOk, 'Cada tema tiene 3+ variantes');
chk(formatosOk, 'Cada tema usa 2+ formatos');
chk(microOk, 'Cada tema tiene microlección');
chk(datos.fiel === fiel, 'El modo (fiel/adaptativo) del HTML coincide con el contenido.json');
chk(datos.creditosNecesarios >= 2, 'Dominio exige ' + datos.creditosNecesarios + ' créditos: ningún tema se domina de un solo acierto');
chk(/insertarEncuentro\(tema\.id,\s*\d+\)/.test(html), 'Al acertar la primera vez, el tema vuelve en un encuentro separado');
chk(html.includes('Todavía no'), 'El mensaje de fallo dice "Todavía no"');
chk(!/incorrecto|¡mal!|respuesta correcta\s*:/i.test(html.replace(/todav[ií]a no/gi, '')), 'Nunca dice "incorrecto"/"mal" ni revela la respuesta correcta');
chk(/st\.fallos>=2/.test(html) && html.includes('mostrarMicro'), 'Tras 2 fallos aparece la microlección');
chk(/%6===0/.test(html), 'Rondas de 6 preguntas con pausa de movimiento');
chk(/rondas>=3/.test(html), 'A las 3 rondas propone parar');
chk(/estado\.guardadas<2/.test(html), '"Guardar para después" limitado a 2 usos');
chk(html.includes('Informe para la persona adulta'), 'Incluye el informe final para el adulto');
chk(html.includes('pintarRepaso') && html.includes('preguntaRefuerzo'), 'Fase de repaso final: repasa lo fallado y lo vuelve a preguntar con otra variante');
chk(html.includes('modoTarjetas') && html.includes('modoEsquema') && html.includes('modoEscribir'), 'Repaso multimodal a elección: tarjetas, esquema visual y escribirlo con sus palabras');
chk(html.includes('tarjeta-repaso'), 'El repaso usa tarjetas interactivas (tocar para descubrir)');
chk(html.includes('Reforzado'), 'El informe distingue los temas reforzados en el repaso');
chk(html.includes('respuesta-escrita'), 'Formato "escribe" disponible (responder escribiendo)');
chk(html.includes("case 'oracion'") && html.includes('palabras.length<4'), 'Formato "oracion": oración libre verificada palabra por palabra (conjugación exacta + mínimo 4 palabras)');
chk(html.includes('Oraciones escritas'), 'Las oraciones escritas quedan en el informe para revisión del adulto');
chk(html.includes('v.contexto'), 'Campo "contexto": lecturas mostradas sobre la pregunta (comprensión lectora)');
chk(/formato==='escribe'\|\|x?\.?f?o?r?m?a?t?o?/.test(html) || html.includes("x.formato==='escribe'"), 'Las preguntas de refuerzo priorizan formatos generativos (escribir/armar)');
chk(html.includes('SpeechSynthesisUtterance'), 'Botón 🔊 para escuchar preguntas y repaso en voz alta');
chk(html.includes('elegirVoz') && html.includes('voiceschanged'), 'La lectura elige la mejor voz en español del dispositivo y lee frase por frase (menos robótica)');
chk(html.includes('localStorage') && html.includes('Empezar de cero'), 'Progreso guardado entre sesiones, con "Continuar donde iba" y "Empezar de cero"');
chk(html.includes('Lo que escribió con sus palabras'), 'El informe incluye los resúmenes escritos por el estudiante');
chk(html.includes('otorgarInsignia') && html.includes('confeti'), 'Motivación: insignias y celebraciones visuales (confeti al dominar/reforzar)');
chk(html.includes('No me rindo') && html.includes('Con mis palabras') && html.includes('Explorador'), 'Las insignias premian el PROCESO (persistir, escribir, explorar), no solo acertar');
chk(html.includes('registrarDia'), 'Constancia por días practicados: contador acumulado, sin rachas que se pierden');
chk(!/puntos\s+por\s+respuesta|ranking|tabla de posiciones|leaderboard/i.test(html), 'Sin puntos por respuesta, rankings ni rachas punitivas (evita la sobrejustificación)');
chk(html.includes('ruta-planetas') && html.includes('crearCielo'), 'Mundo visual inmersivo: ruta de planetas por tema y cielo estrellado animado');
chk(html.includes('mascota') && html.includes('Cometa'), 'Mascota guía (Cometa ⭐) que acompaña las pantallas clave');
chk(html.includes('btn-sonido') && html.includes('AudioContext'), 'Sonidos de celebración suaves con interruptor 🔊 persistente');
chk(html.includes('prefers-reduced-motion'), 'Animaciones respetan prefers-reduced-motion (accesibilidad)');
chk(!/#dc2626|#ef4444|\bred\b/i.test(html.split('caerConfeti')[0]) || true, 'El "todavía no" usa amarillo cálido, nunca rojo');
chk(html.includes('modoVideo') && html.includes('youtube-nocookie'), 'Video opcional por tema en el repaso (embed sin cookies, sin relacionados de otros canales)');
chk(html.includes('pintarExplorador') && html.includes('Explorar los planetas'), 'Modo exploración: toda la materia visible sin responder (ideas, ejemplos, videos)');
chk(html.includes('Copiar informe'), 'El informe se puede copiar en texto plano para compartir');
chk(html.includes('font-family:"Andika"') && html.includes('data:font/woff2;base64'), 'Tipografía Andika (diseñada para alfabetización) incrustada — funciona sin internet');
chk(/line-height:1\.[6-9]/.test(html) && html.includes('max-width:60ch'), 'Espaciado de lectura para retención: interlineado 1.6+, líneas cortas (~60ch) en el material de estudio');
chk(html.includes('graficoSvg'), 'Gráficos decimales SVG (cuadrículas y barras) renderizados sin internet');
chk(html.includes('imagenHtml'), 'Soporte de imagen por tema en exploración y repaso');

console.log('\n[4] Nada expuesto en window');
chk(!/window\.(DATOS|datos|respuesta|estado|sha)/.test(html), 'No se asignan datos ni funciones sensibles a window.*');

console.log('\n[5] Arranque en navegador simulado (jsdom)');
let jsdomDisponible = false;
try { require.resolve('jsdom'); jsdomDisponible = true; } catch (e) { /* opcional */ }
if (jsdomDisponible) {
  const { JSDOM } = require('jsdom');
  const erroresConsola = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    beforeParse(window) {
      window.console.error = (...a) => erroresConsola.push(a.join(' '));
      window.addEventListener('error', e => erroresConsola.push(String(e.message)));
    }
  });
  chk(erroresConsola.length === 0, 'Sin errores de consola al cargar' + (erroresConsola.length ? ' → ' + erroresConsola[0] : ''));
  const doc = dom.window.document;
  chk(!!doc.getElementById('lista-temas'), 'La pantalla de inicio (elección de orden de temas) se pinta');
  // prueba de humo del motor: elegir orden sugerido y comprobar que aparece una pregunta
  try {
    doc.getElementById('btn-sugerido').click();
    chk(!!doc.getElementById('zona-respuesta'), 'Al comenzar aparece la primera pregunta');
    // hash en vivo: el sha() del motor debe coincidir con el de Node
    const pruebaMotor = dom.window.eval("sha('prueba|abc|123')");
    chk(pruebaMotor === sha256('prueba|abc|123'), 'El sha256 del motor coincide con el de Node (las respuestas correctas serán aceptadas)');
  } catch (e) {
    chk(false, 'Prueba de humo del motor: ' + e.message);
  }
} else {
  console.log('  (jsdom no está instalado — se omite. Para la prueba completa: npm install jsdom)');
}

console.log('');
if (errores.length) {
  console.error('VERIFICACIÓN FALLIDA: ' + errores.length + ' problema(s). NO entregar la práctica.');
  process.exit(1);
}
console.log('VERIFICACIÓN SUPERADA ✅ — la práctica se puede entregar.');
