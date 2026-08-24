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
const archivo = `practicas/${slug}_${modo}.html`;
const hoy = new Date().toISOString().slice(0, 10);

const entrada = {
  materia: materiaNombre,
  nombre: contenido.titulo || tituloCase(slug),
  modo,
  archivo,
  fecha: hoy,
  estado: 'publicada'
};

const sinLaAnterior = catalogo.filter((p) => !(p.materia === materiaNombre && p.modo === modo));
sinLaAnterior.push(entrada);

fs.writeFileSync(rutaCatalogo, JSON.stringify(sinLaAnterior, null, 2) + '\n', 'utf8');
console.log('Catálogo actualizado: ' + materiaNombre + ' (' + modo + ') → ' + archivo);
