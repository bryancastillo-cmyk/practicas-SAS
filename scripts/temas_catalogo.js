#!/usr/bin/env node
/*
 * temas_catalogo.js — Lista corta de temas de cada práctica, para que la página del estudiante
 * muestre «qué trae» cada una sin abrirla.
 *
 * Los nombres salen del contenido de la práctica (contenido/<materia>/<modo>_<ronda>.json, campo
 * temas[].nombre) y se guardan en docs/practicas.json como "temas": ["...", "..."].
 *
 * Uso: node scripts/temas_catalogo.js        completa "temas" en las entradas del catálogo que
 *                                            tienen contenido y todavía no lo traen (o cambió).
 * También lo usa scripts/actualizar_catalogo.js al publicar una práctica.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MAX_TEMAS = 12;

/* Deja el nombre del tema corto y sin adornos: sin numeración, sin «Simulacro ·», sin páginas. */
function limpiar(nombre) {
  return String(nombre == null ? '' : nombre)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s*\((?:libro\s+)?(?:pp?\.|págs?\.|pág\.|pages?)[^)]*\)/gi, '')
    .replace(/^\s*\d+\s*[.)]\s+/, '')
    .replace(/^\s*Simulacro\s*[·:–-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function temasDe(contenido) {
  const lista = contenido && Array.isArray(contenido.temas) ? contenido.temas : [];
  const salida = [];
  for (const t of lista) {
    const n = limpiar(t && (t.nombre || t.titulo));
    if (n && !salida.some((x) => x.toLowerCase() === n.toLowerCase())) salida.push(n);
    if (salida.length >= MAX_TEMAS) break;
  }
  return salida;
}

/* Ruta del contenido de una entrada del catálogo: sale del nombre de su archivo publicado. */
function rutaContenido(raiz, entrada) {
  const m = /^practicas\/([a-z0-9_]+?)_((?:adaptativa|fiel)|extra-\d+)_(.+)\.html$/.exec(String(entrada.archivo || ''));
  if (!m) return '';
  const ruta = path.join(raiz, 'contenido', m[1], `${m[2]}_${m[3]}.json`);
  return fs.existsSync(ruta) ? ruta : '';
}

/* Completa "temas" en las entradas que tienen contenido. Devuelve cuántas cambió. */
function completar(raiz, catalogo) {
  let cambios = 0;
  for (const entrada of catalogo) {
    const ruta = rutaContenido(raiz, entrada);
    if (!ruta) continue;
    let temas = [];
    try { temas = temasDe(JSON.parse(fs.readFileSync(ruta, 'utf8'))); } catch (e) { continue; }
    if (!temas.length) continue;
    if (JSON.stringify(entrada.temas || null) !== JSON.stringify(temas)) { entrada.temas = temas; cambios++; }
  }
  return cambios;
}

module.exports = { limpiar, temasDe, completar, rutaContenido };

if (require.main === module) {
  const raiz = process.cwd();
  const rutaCatalogo = path.join(raiz, 'docs', 'practicas.json');
  const catalogo = JSON.parse(fs.readFileSync(rutaCatalogo, 'utf8'));
  const cambios = completar(raiz, catalogo);
  if (cambios) fs.writeFileSync(rutaCatalogo, JSON.stringify(catalogo, null, 2) + '\n', 'utf8');
  console.log(`Temas del catálogo: ${cambios} entrada(s) actualizada(s) de ${catalogo.length}.`);
}
