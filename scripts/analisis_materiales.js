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
 *      node scripts/analisis_materiales.js contexto <materia-slug>
 *        Junta en contenido/<slug>/contexto.json el estado de la materia, para que Claude responda una
 *        pregunta del adulto (workflow preguntar.yml).
 *      PREGUNTA="..." node scripts/analisis_materiales.js responder <materia-slug>
 *        Pasa la respuesta.json de Claude al historial contenido/<slug>/consultas.json.
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
// Cuántos archivos nuevos lee Claude por corrida. Lo que no cabe NO se da por visto: queda para la
// siguiente corrida ("Leer los que faltan" en el admin). Primero va lo que más define una práctica.
const MAX_POR_CORRIDA = 60;
const PRIORIDAD = ['practica_profesor', 'diaria', 'cuaderno', 'otro', 'solucionario', 'temario', 'notas', 'libro'];
const MAX_CONSULTAS = 10;

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
  const nuevos = archivos.filter((a) => !vistos.has(a.ruta))
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (PRIORIDAD.indexOf(x.a.etiqueta) - PRIORIDAD.indexOf(y.a.etiqueta)) || (x.i - y.i))
    .map((x) => x.a.ruta);
  const inv = {
    materia: nombreMateria(slug),
    slug,
    ronda,
    archivos,
    nuevos,
    leer: nuevos.slice(0, MAX_POR_CORRIDA),
    vistos: archivos.filter((a) => vistos.has(a.ruta)).map((a) => a.ruta),
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
  // Solo se da por visto lo que Claude dice que leyó (de la lista que se le pidió leer). Si no lo
  // dice, se asume que leyó toda esa lista. Lo demás queda pendiente para la siguiente corrida.
  const pedidos = Array.isArray(inv.leer) ? inv.leer : inv.nuevos;
  let leidos = (Array.isArray(crudo.leidos) ? crudo.leidos : []).filter((r) => pedidos.includes(r));
  if (!Array.isArray(crudo.leidos)) leidos = pedidos.slice();
  leidos = [...new Set(leidos)];
  const sinLeer = inv.nuevos.filter((r) => !leidos.includes(r));
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
    leidos: leidos.length,
    faltan: sinLeer.length,
    sinLeer: sinLeer.slice(0, 200),
    total: inv.archivos.length,
    archivos: [...(Array.isArray(inv.vistos) ? inv.vistos : []), ...leidos]
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

/* ---- Preguntas del adulto a Claude desde el admin (workflow preguntar.yml) ---- */
function leerTexto(ruta) { try { return fs.readFileSync(ruta, 'utf8'); } catch (e) { return ''; } }

/* Junta en contenido/<slug>/contexto.json todo lo que Claude necesita para responder sin adivinar. */
function contexto(raiz, slug) {
  const ronda = rondaActual(raiz);
  const dir = path.join(raiz, 'contenido', slug);
  fs.mkdirSync(dir, { recursive: true });
  const cfg = leerJson(path.join(raiz, 'docs', 'config.json'), {}) || {};
  const archivos = listarMateriales(raiz, slug);
  const analisis = leerJson(path.join(dir, 'analisis.json'), null);
  const ctx = {
    materia: nombreMateria(slug),
    slug,
    ronda,
    nombreRonda: (cfg.periodos && cfg.periodos[ronda]) || ronda,
    fechaExamen: (cfg.fechasQuiz && cfg.fechasQuiz[ronda] && cfg.fechasQuiz[ronda][nombreMateria(slug)]) || '',
    hoy: new Date().toISOString().slice(0, 10),
    materialGuardado: { total: archivos.length, porEtiqueta: archivos.reduce((c, a) => { c[a.etiqueta] = (c[a.etiqueta] || 0) + 1; return c; }, {}), archivos },
    practicasDeLaRonda: practicasDeLaRonda(raiz, slug, ronda),
    ultimoAnalisis: analisis ? { fecha: analisis.fecha, resumen: analisis.resumen, materialNuevo: analisis.materialNuevo, temasCubiertos: analisis.temasCubiertos, temasPendientes: analisis.temasPendientes, sugerencias: analisis.sugerencias, archivosLeidos: (analisis.archivos || []).length, archivosSinLeer: analisis.sinLeer || [] } : null,
    dudasDeClaudeSinResponder: leerTexto(path.join(dir, 'preguntas.md')).trim(),
    generacionDetenida: leerJson(path.join(dir, 'pendiente.json'), null),
    notasDelAdulto: leerTexto(path.join(raiz, 'materiales', slug, 'notas.md')).trim()
  };
  fs.writeFileSync(path.join(dir, 'contexto.json'), JSON.stringify(ctx, null, 2) + '\n');
  fs.rmSync(path.join(dir, 'respuesta.json'), { force: true });
  return ctx;
}

/* Guarda la respuesta de Claude en contenido/<slug>/consultas.json (las últimas MAX_CONSULTAS). */
function responder(raiz, slug, pregunta) {
  const dir = path.join(raiz, 'contenido', slug);
  const rutaResp = path.join(dir, 'respuesta.json');
  if (!fs.existsSync(rutaResp)) throw new Error('Claude no escribió ' + rutaResp);
  let crudo;
  try { crudo = JSON.parse(fs.readFileSync(rutaResp, 'utf8')); } catch (e) { throw new Error('respuesta.json no es JSON válido: ' + e.message); }
  const respuesta = String((crudo && crudo.respuesta) || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
  if (!respuesta) throw new Error('respuesta.json no trae "respuesta"');
  const rutaConsultas = path.join(dir, 'consultas.json');
  const previas = leerJson(rutaConsultas, null);
  const lista = (previas && Array.isArray(previas.consultas)) ? previas.consultas : [];
  lista.push({ fecha: new Date().toISOString(), pregunta: texto(pregunta, 600), respuesta });
  const salida = { v: 1, consultas: lista.slice(-MAX_CONSULTAS) };
  fs.writeFileSync(rutaConsultas, JSON.stringify(salida, null, 2) + '\n');
  fs.rmSync(rutaResp, { force: true });
  fs.rmSync(path.join(dir, 'contexto.json'), { force: true });
  return salida;
}

module.exports = { listarMateriales, inventario, normalizar, cerrar, contexto, responder, etiquetaDeRaiz, slugValido, ETIQUETAS, MAX_POR_CORRIDA };

if (require.main === module) {
  const [, , accion, slug] = process.argv;
  if (!['inventario', 'cerrar', 'contexto', 'responder'].includes(accion) || !slugValido(slug)) {
    console.error('Uso: node scripts/analisis_materiales.js <inventario|cerrar|contexto|responder> <materia-slug>');
    process.exit(1);
  }
  try {
    if (accion === 'inventario') {
      const inv = inventario(process.cwd(), slug);
      console.log(`Inventario de ${inv.materia} (ronda ${inv.ronda}): ${inv.archivos.length} archivos, ${inv.nuevos.length} nuevos (se leen ${inv.leer.length}), ${inv.practicas.length} prácticas en la ronda.`);
    } else if (accion === 'contexto') {
      const c = contexto(process.cwd(), slug);
      console.log(`Contexto de ${c.materia} listo: ${c.materialGuardado.total} archivos, ${c.practicasDeLaRonda.length} prácticas en la ronda.`);
    } else if (accion === 'responder') {
      // La pregunta llega por variable de entorno (PREGUNTA), nunca por la línea de comandos.
      const r = responder(process.cwd(), slug, process.env.PREGUNTA || '');
      console.log(`Respuesta guardada. Consultas en el historial: ${r.consultas.length}.`);
    } else {
      const a = cerrar(process.cwd(), slug);
      console.log(`Análisis de ${a.materia} listo: ${a.sugerencias.length} sugerencias.`);
    }
  } catch (e) {
    console.error('[ERROR] ' + e.message);
    process.exit(1);
  }
}
