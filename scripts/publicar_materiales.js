#!/usr/bin/env node
/**
 * Publica al sitio lo que hay en materiales/: copia los archivos a docs/materiales/ y escribe
 * docs/materiales.json con la lista por materia (páginas del libro, hojas del cuaderno, práctica
 * del profesor, solucionarios, temarios, otros) para que docs/materia.html los muestre.
 *
 * Uso: node scripts/publicar_materiales.js
 * Lo corre el workflow materiales.yml en cada push a materiales/**, y también temario.yml y
 * generar.yml antes de commitear. Es idempotente: borra docs/materiales/ y lo vuelve a armar.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = process.cwd();
const ORIGEN = path.join(RAIZ, 'materiales');
const DESTINO = path.join(RAIZ, 'docs', 'materiales');
const SALIDA = path.join(RAIZ, 'docs', 'materiales.json');
const NOMBRES = { matematicas: 'Matemáticas', science: 'Science', english: 'English', espanol: 'Español', estudios_sociales: 'Estudios Sociales' };
const IMAGEN = /\.(jpe?g|png|webp|gif)$/i;
const PUBLICABLE = /\.(jpe?g|png|webp|gif|pdf|md|txt|docx?|pptx?|xlsx?)$/i;

function tituloCase(slug) { return slug.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' '); }
function periodoDe(nombre) { const m = nombre.match(/(20\d\d-\d\d[a-z]?)/); return m ? m[1] : ''; }
function tipoDe(nombre) {
  const n = nombre.toLowerCase();
  if (n === 'notas.md') return 'notas';
  if (/^temario/.test(n)) return 'temario';
  if (/solucionario|respuestas|answer/.test(n)) return 'solucionario';
  if (/practica[_-]?profe|practica[_-]?profesor|practica|quiz|review|examen|prueba/.test(n)) return 'practica_profesor';
  return 'otro';
}
function etiquetaDe(tipo, nombre, periodo) {
  const base = { temario: 'Temario (texto)', solucionario: 'Solucionario', practica_profesor: 'Práctica del profesor', otro: nombre }[tipo] || nombre;
  return periodo && tipo !== 'otro' ? `${base} · ${periodo}` : base;
}
function paginas(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => IMAGEN.test(f) || /\.pdf$/i.test(f)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}
function copiar(rel) {
  const de = path.join(RAIZ, rel), a = path.join(RAIZ, 'docs', rel);
  fs.mkdirSync(path.dirname(a), { recursive: true });
  fs.copyFileSync(de, a);
  return Math.round(fs.statSync(de).size / 1024);
}

fs.rmSync(DESTINO, { recursive: true, force: true });
const salida = { v: 1, generado: new Date().toISOString().slice(0, 10), materias: {}, rondas: {} };

if (fs.existsSync(ORIGEN)) {
  for (const slug of fs.readdirSync(ORIGEN).sort()) {
    const dir = path.join(ORIGEN, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (slug === 'rondas') {
      for (const ronda of fs.readdirSync(dir).sort()) {
        const d2 = path.join(dir, ronda);
        if (!fs.statSync(d2).isDirectory()) continue;
        const archivos = fs.readdirSync(d2).filter((f) => PUBLICABLE.test(f)).map((f) => ({ nombre: f, archivo: `materiales/rondas/${ronda}/${f}`, kb: copiar(`materiales/rondas/${ronda}/${f}`) }));
        if (archivos.length) salida.rondas[ronda] = archivos;
      }
      continue;
    }
    const m = { nombre: NOMBRES[slug] || tituloCase(slug), libro: [], cuaderno: [], archivos: [], notas: '' };
    m.libro = paginas(path.join(dir, 'libro')).map((f, i) => ({ n: i + 1, archivo: `materiales/${slug}/libro/${f}`, kb: copiar(`materiales/${slug}/libro/${f}`) }));
    m.cuaderno = paginas(path.join(dir, 'cuaderno')).map((f, i) => ({ n: i + 1, archivo: `materiales/${slug}/cuaderno/${f}`, kb: copiar(`materiales/${slug}/cuaderno/${f}`) }));
    for (const f of fs.readdirSync(dir).sort()) {
      const ruta = path.join(dir, f);
      if (fs.statSync(ruta).isDirectory() || f === '.gitkeep' || !PUBLICABLE.test(f)) continue;
      const tipo = tipoDe(f);
      if (tipo === 'notas') { m.notas = fs.readFileSync(ruta, 'utf8').trim(); continue; }
      const periodo = periodoDe(f);
      m.archivos.push({ nombre: f, tipo, periodo, etiqueta: etiquetaDe(tipo, f, periodo), archivo: `materiales/${slug}/${f}`, kb: copiar(`materiales/${slug}/${f}`) });
    }
    m.archivos.sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)) || a.nombre.localeCompare(b.nombre));
    salida.materias[slug] = m;
  }
}

fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 2) + '\n');
const resumen = Object.keys(salida.materias).map((s) => `${s}: ${salida.materias[s].libro.length} libro, ${salida.materias[s].cuaderno.length} cuaderno, ${salida.materias[s].archivos.length} archivos`).join(' | ');
console.log(`docs/materiales.json listo. ${resumen}`);
