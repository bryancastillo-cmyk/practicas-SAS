#!/usr/bin/env node
/*
 * examen_profe.js — Construye la «práctica del profe» de una materia como página que se revisa sola.
 *
 * Uso: node scripts/examen_profe.js <materia-slug> <periodo>
 *      (lee contenido/<slug>/profe_<periodo>.json y escribe docs/practicas/<slug>_fiel_<periodo>.html,
 *       y agrega/reemplaza su entrada «fiel» en docs/practicas.json)
 *
 * Formato fiel a la hoja del profe: opción múltiple, respuesta corta, pareo y ensayo, en el mismo orden.
 * - Opción múltiple y pareo: las claves se guardan como sha256(sal|pX-i|LETRA), nunca en texto plano.
 * - Respuesta corta y ensayo: revisión preliminar por ideas clave (con tolerancia de ortografía) y botón
 *   para copiar las respuestas con su rúbrica y pegárselas a Claude, o abrir la versión de claude.ai.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NOMBRES = { matematicas: 'Matemáticas', science: 'Science', english: 'English', espanol: 'Español', estudios_sociales: 'Estudios Sociales' };
const [, , slug, periodo] = process.argv;
if (!slug || !periodo) { console.error('Uso: node scripts/examen_profe.js <materia-slug> <periodo>'); process.exit(1); }
const raiz = path.join(__dirname, '..');
const fuente = path.join(raiz, 'contenido', slug, `profe_${periodo}.json`);
const c = JSON.parse(fs.readFileSync(fuente, 'utf8'));
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const LETRAS = 'ABCDEFGH';

function fallar(m) { console.error('[ERROR] ' + m); process.exit(1); }
if (!c.sal) fallar('Falta "sal" en ' + fuente);
c.parte1.forEach((q, i) => { if (!LETRAS.slice(0, q.opciones.length).includes(q.respuesta)) fallar('Part 1 #' + (i + 1) + ': respuesta inválida'); });
c.parte3.forEach((q, i) => { if (!LETRAS.slice(0, c.columnaA.length).includes(q.respuesta)) fallar('Part 3 fila ' + (i + 1) + ': respuesta inválida'); });

const datos = {
  titulo: c.titulo, materia: c.materia || NOMBRES[slug] || slug, sal: c.sal, enlaceClaude: c.enlaceClaude || '',
  puntosP2: c.puntosP2, puntosP4: c.puntosP4, colA: c.columnaA,
  p1: c.parte1.map((q, i) => ({ q: q.pregunta, o: q.opciones, h: sha(`${c.sal}|p1-${i}|${q.respuesta}`) })),
  p3: c.parte3.map((q, i) => ({ d: q.descripcion, h: sha(`${c.sal}|p3-${i}|${q.respuesta}`) })),
  p2: c.parte2.map((q) => ({ q: q.pregunta, rb: b64(q.rubrica), ideas: q.ideas })),
  p4: c.parte4.map((q) => ({ q: q.pregunta, rb: b64(q.rubrica), ideas: q.ideas }))
};
const json = JSON.stringify(datos).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
if (/"respuesta"\s*:/.test(json)) fallar('Fuga: el bloque de datos contiene "respuesta".');
const tpl = fs.readFileSync(path.join(__dirname, 'plantillas', 'examen_profe.html'), 'utf8');
const html = tpl.replace('/*EXAMEN*/', json)
  .replace('/*SHA*/', fs.readFileSync(path.join(__dirname, 'plantillas', 'sha256.js'), 'utf8'))
  .replace('/*TITULO*/', datos.materia.replace(/[<&]/g, '') + ' · práctica del profe');
const archivo = `practicas/${slug}_fiel_${periodo}.html`;
fs.writeFileSync(path.join(raiz, 'docs', archivo), html, 'utf8');

const rutaCat = path.join(raiz, 'docs', 'practicas.json');
const cat = JSON.parse(fs.readFileSync(rutaCat, 'utf8'));
const entrada = { materia: datos.materia, nombre: 'Copia literal de la práctica de la profe (' + c.titulo + ')', modo: 'fiel', archivo, fecha: new Date().toISOString().slice(0, 10), estado: 'publicada', periodo };
const resto = cat.filter((p) => !(p.materia === entrada.materia && p.modo === 'fiel' && p.periodo === periodo));
resto.push(entrada);
fs.writeFileSync(rutaCat, JSON.stringify(resto, null, 2) + '\n', 'utf8');
console.log('OK: docs/' + archivo + ' (' + Math.round(html.length / 1024) + ' KB) y catálogo actualizado.');
