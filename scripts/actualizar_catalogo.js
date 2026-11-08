#!/usr/bin/env node
/*
 * actualizar_catalogo.js — Agrega o reemplaza una entrada en docs/practicas.json
 * después de que construir.js + verificar.js generaron una práctica con éxito.
 *
 * Uso: node actualizar_catalogo.js <materia-slug> <modo>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const NOMBRES_MATERIA = {
  matematicas: 'Matemáticas',
  science: 'Science',
  english: 'English',
  espanol: 'Español',
  estudios_sociales: 'Estudios Sociales'
};

function tituloCase(slug) {
  return slug.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

const [, , slug, modo] = process.argv;
if (!slug || !modo) {
  console.error('Uso: node actualizar_catalogo.js <materia-slug> <modo>');
  process.exit(1);
}

const rutaContenido = path.join('contenido', slug, `${modo}.json`);
if (!fs.existsSync(rutaContenido)) {
  console.error('No existe ' + rutaContenido);
  process.exit(1);
}
const contenido = JSON.parse(fs.readFileSync(rutaContenido, 'utf8'));

const rutaCatalogo = path.join('docs', 'practicas.json');
let catalogo = [];
if (fs.existsSync(rutaCatalogo)) {
  try { catalogo = JSON.parse(fs.readFileSync(rutaCatalogo, 'utf8')); } catch (e) { catalogo = []; }
}

const materiaNombre = NOMBRES_MATERIA[slug] || tituloCase(slug);
const hoy = new Date().toISOString().slice(0, 10);
// La ronda actual la define docs/config.json (la crea el admin). Si no hay, se usa el mes.
let periodo = hoy.slice(0, 7);
try {
  const cfg = JSON.parse(fs.readFileSync(path.join('docs', 'config.json'), 'utf8'));
  if (cfg && cfg.periodoActual) periodo = String(cfg.periodoActual);
} catch (e) { /* sin config: se usa el mes */ }
const archivo = `practicas/${slug}_${modo}_${periodo}.html`;

const entrada = {
  materia: materiaNombre,
  nombre: contenido.titulo || tituloCase(slug),
  modo,
  archivo,
  fecha: hoy,
  estado: 'publicada',
  periodo
};

// Reemplaza solo la entrada del MISMO periodo (misma ronda de quiz); las de
// periodos anteriores quedan intactas para la pestaña "Prácticas anteriores".
// La ronda nueva se crea desde el admin (docs/config.json), no hace falta tocar el HTML.
const sinLaAnterior = catalogo.filter((p) => !(p.materia === materiaNombre && p.modo === modo && p.periodo === periodo));
sinLaAnterior.push(entrada);

fs.writeFileSync(rutaCatalogo, JSON.stringify(sinLaAnterior, null, 2) + '\n', 'utf8');
console.log('Catálogo actualizado: ' + materiaNombre + ' (' + modo + ') → ' + archivo);
