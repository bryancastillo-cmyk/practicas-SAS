#!/usr/bin/env node
/*
 * preguntas_catalogo.js — Cuántas preguntas trae cada práctica, para que la página de la materia diga
 * «N preguntas · unos M minutos» antes de abrirla.
 *
 * Se cuenta desde el HTML publicado (docs/practicas/*.html), que es lo que de verdad ve el estudiante:
 *   - Práctica del profe con motor de prácticas (DATOS.fiel): una vez cada pregunta → total de variantes.
 *   - Práctica del profe con formato de examen (EXAMEN): suma de sus partes p1, p2, … → exacto.
 *   - Adaptativa y extras: termina cuando cada tema se acierta creditosNecesarios veces en momentos
 *     distintos → temas × créditos es lo mínimo para terminarla (con errores son algunas más).
 * Se guarda en docs/practicas.json como "preguntas": N. Que sea exacto o aproximado lo dice el modo
 * ("fiel" exacto; el resto, «unas N»).
 *
 * Uso: node scripts/preguntas_catalogo.js     completa "preguntas" en todas las entradas del catálogo.
 * También lo usa scripts/actualizar_catalogo.js al publicar una práctica.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* Lee el objeto JSON que empieza en s[i] ('{'), respetando textos entre comillas. */
function objetoDesde(s, i) {
  if (s[i] !== '{') return null;
  let prof = 0, enTexto = false, escape = false;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (enTexto) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') enTexto = false;
      continue;
    }
    if (c === '"') enTexto = true;
    else if (c === '{') prof++;
    else if (c === '}') { prof--; if (prof === 0) { try { return JSON.parse(s.slice(i, k + 1)); } catch (e) { return null; } } }
  }
  return null;
}

/* Datos de la práctica dentro del HTML: { tipo: 'datos'|'examen', obj }. */
function datosDeHtml(html) {
  for (const nombre of ['DATOS', 'EXAMEN']) {
    const m = new RegExp('(?:var|const|let)\\s+' + nombre + '\\s*=\\s*').exec(html);
    if (!m) continue;
    const obj = objetoDesde(html, m.index + m[0].length);
    if (obj) return { tipo: nombre === 'DATOS' ? 'datos' : 'examen', obj };
  }
  return null;
}

/* Cantidad de preguntas para terminar la práctica (0 si no se pudo leer). */
function preguntasDeHtml(html) {
  const d = datosDeHtml(html);
  if (!d) return 0;
  if (d.tipo === 'examen') {
    return Object.keys(d.obj).filter((k) => /^p\d+$/.test(k) && Array.isArray(d.obj[k]))
      .reduce((n, k) => n + d.obj[k].length, 0);
  }
  const temas = Array.isArray(d.obj.temas) ? d.obj.temas : [];
  if (d.obj.fiel) return temas.reduce((n, t) => n + (Array.isArray(t.variantes) ? t.variantes.length : 0), 0);
  const creditos = Number(d.obj.creditosNecesarios) > 0 ? Number(d.obj.creditosNecesarios) : 2;
  return temas.length * creditos;
}

/* Completa "preguntas" en las entradas cuyo HTML existe. Devuelve cuántas cambió. */
function completarPreguntas(raiz, catalogo) {
  let cambios = 0;
  for (const entrada of catalogo) {
    const ruta = path.join(raiz, 'docs', String(entrada.archivo || ''));
    if (!entrada.archivo || !fs.existsSync(ruta)) continue;
    const n = preguntasDeHtml(fs.readFileSync(ruta, 'utf8'));
    if (n > 0 && entrada.preguntas !== n) { entrada.preguntas = n; cambios++; }
  }
  return cambios;
}

module.exports = { objetoDesde, datosDeHtml, preguntasDeHtml, completarPreguntas };

if (require.main === module) {
  const raiz = process.cwd();
  const rutaCatalogo = path.join(raiz, 'docs', 'practicas.json');
  const catalogo = JSON.parse(fs.readFileSync(rutaCatalogo, 'utf8'));
  const cambios = completarPreguntas(raiz, catalogo);
  if (cambios) fs.writeFileSync(rutaCatalogo, JSON.stringify(catalogo, null, 2) + '\n', 'utf8');
  console.log(`Preguntas del catálogo: ${cambios} entrada(s) actualizada(s) de ${catalogo.length}.`);
}
