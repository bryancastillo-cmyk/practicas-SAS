#!/usr/bin/env node
/*
 * repartir_temario.js — A partir de docs/rondas/<ronda>.json (el temario oficial del colegio ya
 * estructurado), escribe:
 *   - materiales/<slug>/temario_<ronda>.md   → lo lee generar.yml como autoridad de qué temas entran
 *   - docs/config.json                        → fechasQuiz[ronda][materia] y periodos[ronda] si falta
 *
 * Uso: node scripts/repartir_temario.js 2026-11
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ronda = process.argv[2];
if (!ronda) { console.error('Uso: node scripts/repartir_temario.js <ronda>'); process.exit(1); }

const rutaJson = path.join('docs', 'rondas', `${ronda}.json`);
if (!fs.existsSync(rutaJson)) { console.error('No existe ' + rutaJson); process.exit(1); }
const t = JSON.parse(fs.readFileSync(rutaJson, 'utf8'));

const rutaCfg = path.join('docs', 'config.json');
const cfg = JSON.parse(fs.readFileSync(rutaCfg, 'utf8'));
cfg.periodos = cfg.periodos || {};
cfg.fechasQuiz = cfg.fechasQuiz || {};
if (!cfg.periodos[ronda]) cfg.periodos[ronda] = t.nombre || ronda;
cfg.fechasQuiz[ronda] = cfg.fechasQuiz[ronda] || {};

function slugDe(nombre) {
  return String(nombre).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function fechaLarga(iso) {
  const d = new Date(iso + 'T00:00:00');
  const s = d.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

let escritos = 0;
Object.keys(t.materias || {}).forEach((materia) => {
  const m = t.materias[materia];
  const slug = m.slug || slugDe(materia);
  if (m.fecha) cfg.fechasQuiz[ronda][materia] = m.fecha;

  const L = [];
  L.push(`# Temario oficial · ${materia} · ${t.nombre || ronda}`);
  L.push('');
  L.push(`Fuente: ${t.fuente || 'documento del colegio'} (${t.titulo || ''}).`);
  if (m.fecha) L.push(`Fecha de la prueba: ${fechaLarga(m.fecha)}.`);
  L.push('');
  L.push('> Este es el temario oficial de la ronda. La práctica debe cubrir EXACTAMENTE estos temas y');
  L.push('> ninguno más. El resto del material de la carpeta (libro, cuaderno, prácticas del profesor)');
  L.push('> se usa solo como apoyo para redactar ejercicios de estos temas.');
  if (m.notas) { L.push('>'); L.push(`> ${m.notas}`); }
  L.push('');
  (m.bloques || []).forEach((b, i) => {
    L.push(`## ${i + 1}. ${b.tema}`);
    if (b.paginas) L.push(`Páginas del libro: ${b.paginas}`);
    L.push('');
    if (b.subtemas && b.subtemas.length) {
      L.push('Subtemas:');
      b.subtemas.forEach((s) => L.push(`- ${s}`));
      L.push('');
    }
    if (b.habilidades && b.habilidades.length) {
      L.push('Habilidades que se evalúan:');
      b.habilidades.forEach((h) => L.push(`- ${h}`));
      L.push('');
    }
  });
  if (m.apoyo && m.apoyo.length) {
    L.push('## Material de apoyo que indica el colegio');
    m.apoyo.forEach((a) => L.push(`- ${a}`));
    L.push('');
  }
  const dir = path.join('materiales', slug);
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, `temario_${ronda}.md`);
  fs.writeFileSync(destino, L.join('\n'), 'utf8');
  escritos++;
  console.log('Temario → ' + destino + (m.fecha ? ' (prueba ' + m.fecha + ')' : ''));
});

fs.writeFileSync(rutaCfg, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log(`Listo: ${escritos} temarios y fechas de la ronda ${ronda} en docs/config.json.`);
