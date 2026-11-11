#!/usr/bin/env node
/*
 * analisis_materiales.js — Prepara y cierra el análisis que hace Claude cada vez que se sube material
 * desde el admin (workflow analizar.yml).
 *
 * Uso: node scripts/analisis_materiales.js inventario <materia-slug>
 *        Escribe contenido/<slug>/inventario.json: todos los archivos de materiales/<slug>/ con su
 *        etiqueta, cuáles son NUEVOS desde el análisis anterior y qué prácticas ya tiene la ronda actual.
 *        Borra el analisis.json anterior, para que el cierre sepa si Claude escribió uno nuevo.
 *      node scripts/analisis_materiales.js cerrar <materia-slug>
 *        Revisa y ordena el contenido/<slug>/analisis.json que escribió Claude, le agrega fecha, ronda
 *        y la lista de archivos vistos, y borra el inventario. Falla si Claude no lo escribió bien.
 *
 * El admin lee contenido/<slug>/analisis.json para mostrar el resumen y preguntar si se generan
 * prácticas nuevas. Las sugerencias traen tipo: "adaptativa", "fiel" o "extra".
 */
'use strict';
const fs = require('fs');
const path = require('path');

const NOMBRES = { matematicas: 'Matemáticas', science: 'Science', english: 'English', espanol: 'Español', estudios_sociales: 'Estudios Sociales' };
const CARPETAS = { libro: 'libro', cuaderno: 'cuaderno', diarias: 'diaria', otros: 'otro' };
const ETIQUETAS = { practica_profesor: 'Práctica del profesor', libro: 'Página del libro', diaria: 'Práctica diaria', cuaderno: 'Hoja del cuaderno', otro: 'Otro', temario: 'Temario', solucionario: 'Solucionario', notas: 'Notas' };
const MAX_SUGERENCIAS = 4;

function tituloCase(slug) { return slug.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' '); }
function nombreMateria(slug) { return NOMBRES[slug] || tituloCase(slug); }
function slugValido(slug) { return /^[a-z0-9][a-z0-9_]{0,39}$/.test(String(slug || '')); }

function etiquetaDeRaiz(nombre) {
  const n = nombre.toLowerCase();
  if (n === 'notas.md') return 'notas';
  if (/^temario/.test(n)) return 'temario';
  if (/solucionario|respuestas|answer/.test(n)) return 'solucionario';
  if (/practica|quiz|review|examen|prueba/.test(n)) return 'practica_profesor';
  return 'otro';
}

function leerJson(ruta, defecto) {
  try { return JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch (e) { return defecto; }
}

function rondaActual(raiz) {
  const cfg = leerJson(path.join(raiz, 'docs', 'config.json'), null);
  return (cfg && cfg.periodoActual) ? String(cfg.periodoActual) : new Date().toISOString().slice(0, 7);
}

/* Lista de archivos de materiales/<slug>/ con su etiqueta, en orden estable. */
function listarMateriales(raiz, slug) {
  const dir = path.join(raiz, 'materiales', slug);
  const salida = [];
  if (!fs.existsSync(dir)) return salida;
  const orden = (a, b) => a.localeCompare(b, 'es', { numeric: true });
  for (const f of fs.readdirSync(dir).sort(orden)) {
    const ruta = path.join(dir, f);
    if (fs.statSync(ruta).isDirectory()) {
      if (!CARPETAS[f]) continue;
      for (const g of fs.readdirSync(ruta).sort(orden)) {
        if (g === '.gitkeep' || fs.statSync(path.join(ruta, g)).isDirectory()) continue;
        salida.push({ ruta: `materiales/${slug}/${f}/${g}`, etiqueta: CARPETAS[f] });
      }
      continue;
    }
    if (f === '.gitkeep') continue;
    salida.push({ ruta: `materiales/${slug}/${f}`, etiqueta: etiquetaDeRaiz(f) });
  }
  return salida;
}

function practicasDeLaRonda(raiz, slug, ronda) {
  const catalogo = leerJson(path.join(raiz, 'docs', 'practicas.json'), []);
  const materia = nombreMateria(slug);
  return (Array.isArray(catalogo) ? catalogo : [])
    .filter((p) => p.materia === materia && String(p.periodo || '') === ronda && (p.estado || 'publicada') === 'publicada')
    .map((p) => {
      const modo = p.modo || 'adaptativa';
      const base = modo === 'extra' ? `extra-${p.numero}_${ronda}` : `${modo}_${ronda}`;
      const contenido = `contenido/${slug}/${base}.json`;
      return { modo, numero: p.numero || 0, nombre: p.nombre || '', archivo: p.archivo, contenido: fs.existsSync(path.join(raiz, contenido)) ? contenido : '' };
    });
}

function inventario(raiz, slug) {
  const ronda = rondaActual(raiz);
  const dirContenido = path.join(raiz, 'contenido', slug);
  fs.mkdirSync(dirContenido, { recursive: true });
  const rutaAnalisis = path.join(dirContenido, 'analisis.json');
  const anterior = leerJson(rutaAnalisis, null);
  const vistos = new Set((anterior && Array.isArray(anterior.archivos)) ? anterior.archivos : []);
  const archivos = listarMateriales(raiz, slug);
  const inv = {
    materia: nombreMateria(slug),
    slug,
    ronda,
    archivos,
    nuevos: archivos.filter((a) => !vistos.has(a.ruta)).map((a) => a.ruta),
    practicas: practicasDeLaRonda(raiz, slug, ronda),
    temario: fs.existsSync(path.join(raiz, 'materiales', slug, `temario_${ronda}.md`)) ? `materiales/${slug}/temario_${ronda}.md` : ''
  };
  fs.writeFileSync(path.join(dirContenido, 'inventario.json'), JSON.stringify(inv, null, 2) + '\n');
  fs.rmSync(rutaAnalisis, { force: true });
  return inv;
}

function texto(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }
function listaDeTextos(v, max) {
  return (Array.isArray(v) ? v : []).map((x) => texto(x, 200)).filter(Boolean).slice(0, max);
}

/* Ordena lo que escribió Claude. `inv` es el inventario con el que trabajó. */
function normalizar(crudo, inv) {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) throw new Error('analisis.json no es un objeto');
  const resumen = texto(crudo.resumen, 1200);
  if (!resumen) throw new Error('analisis.json no trae "resumen"');
  const tiene = (modo) => inv.practicas.some((p) => p.modo === modo);
  const sugerencias = [];
  for (const s of (Array.isArray(crudo.sugerencias) ? crudo.sugerencias : [])) {
    if (!s || typeof s !== 'object') continue;
    const titulo = texto(s.titulo, 120);
    if (!titulo) continue;
    let tipo = ['adaptativa', 'fiel', 'extra'].includes(s.tipo) ? s.tipo : 'extra';
    // Nunca se sugiere pisar una práctica que ya existe en la ronda: eso se convierte en extra.
    if (tipo !== 'extra' && tiene(tipo)) tipo = 'extra';
    if (tipo !== 'extra' && sugerencias.some((x) => x.tipo === tipo)) tipo = 'extra';
    sugerencias.push({ tipo, titulo, enfoque: texto(s.enfoque, 500), motivo: texto(s.motivo, 300) });
    if (sugerencias.length >= MAX_SUGERENCIAS) break;
  }
  return {
    v: 1,
    materia: inv.materia,
    slug: inv.slug,
    ronda: inv.ronda,
    fecha: new Date().toISOString(),
    resumen,
    materialNuevo: listaDeTextos(crudo.materialNuevo, 12),
    temasCubiertos: listaDeTextos(crudo.temasCubiertos, 20),
    temasPendientes: listaDeTextos(crudo.temasPendientes, 20),
    sugerencias,
    conteo: inv.archivos.reduce((c, a) => { c[a.etiqueta] = (c[a.etiqueta] || 0) + 1; return c; }, {}),
    nuevos: inv.nuevos.length,
    archivos: inv.archivos.map((a) => a.ruta)
  };
}

function cerrar(raiz, slug) {
  const dirContenido = path.join(raiz, 'contenido', slug);
  const rutaInv = path.join(dirContenido, 'inventario.json');
  const rutaAnalisis = path.join(dirContenido, 'analisis.json');
  const inv = leerJson(rutaInv, null);
  if (!inv) throw new Error('No existe ' + rutaInv + ' (corra primero "inventario")');
  if (!fs.existsSync(rutaAnalisis)) throw new Error('Claude no escribió ' + rutaAnalisis);
  let crudo;
  try { crudo = JSON.parse(fs.readFileSync(rutaAnalisis, 'utf8')); } catch (e) { throw new Error('analisis.json no es JSON válido: ' + e.message); }
  const final = normalizar(crudo, inv);
  fs.writeFileSync(rutaAnalisis, JSON.stringify(final, null, 2) + '\n');
  fs.rmSync(rutaInv, { force: true });
  return final;
}

module.exports = { listarMateriales, inventario, normalizar, cerrar, etiquetaDeRaiz, slugValido, ETIQUETAS };

if (require.main === module) {
  const [, , accion, slug] = process.argv;
  if (!['inventario', 'cerrar'].includes(accion) || !slugValido(slug)) {
    console.error('Uso: node scripts/analisis_materiales.js <inventario|cerrar> <materia-slug>');
    process.exit(1);
  }
  try {
    if (accion === 'inventario') {
      const inv = inventario(process.cwd(), slug);
      console.log(`Inventario de ${inv.materia} (ronda ${inv.ronda}): ${inv.archivos.length} archivos, ${inv.nuevos.length} nuevos, ${inv.practicas.length} prácticas en la ronda.`);
    } else {
      const a = cerrar(process.cwd(), slug);
      console.log(`Análisis de ${a.materia} listo: ${a.sugerencias.length} sugerencias.`);
    }
  } catch (e) {
    console.error('[ERROR] ' + e.message);
    process.exit(1);
  }
}
