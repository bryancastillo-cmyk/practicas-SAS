#!/usr/bin/env node
/*
 * construir.js — Genera una práctica interactiva adaptativa a partir de contenido.json.
 *
 * Uso:  node construir.js contenido.json practica.html
 *
 * Garantías:
 *  - Ninguna respuesta queda en texto plano en el HTML: cada respuesta se sustituye por
 *    sha256(sal|idVariante|respuestaCanonicaNormalizada).
 *  - Mezcla EN TIEMPO DE CONSTRUCCIÓN las opciones (mc/porque), las fichas (arma), los
 *    elementos (ordena, clasifica) y la columna derecha (empareja), para que el orden del
 *    archivo no delate la respuesta.
 *  - Audita el HTML final y FALLA si detecta fugas (claves "respuesta", respuestas de
 *    'arma' en texto plano, orden original sin mezclar, etc.).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FORMATOS = ['mc', 'porque', 'verifica', 'arma', 'clasifica', 'ordena', 'empareja', 'escribe', 'oracion'];

// --- utilidades -------------------------------------------------------------
function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}
function normArma(s) { return norm(s).replace(/\s+/g, ''); }
function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function hashRespuesta(sal, idVariante, canonica) { return sha256(sal + '|' + idVariante + '|' + canonica); }
function mezclar(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// mezcla garantizando que el resultado difiera del original (si es posible)
function mezclarDistinto(arr) {
  if (arr.length < 2) return arr.slice();
  let m = mezclar(arr);
  let intentos = 0;
  while (JSON.stringify(m) === JSON.stringify(arr) && intentos < 50) { m = mezclar(arr); intentos++; }
  if (JSON.stringify(m) === JSON.stringify(arr)) { m = arr.slice(); m.push(m.shift()); } // rotación forzada
  return m;
}
function fallar(msg) { console.error('\n[ERROR] ' + msg); process.exit(1); }
function avisar(msg) { console.warn('[aviso] ' + msg); }
function idYoutube(url) {
  const m = String(url).match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : null;
}
function escaparHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- validación del contenido ----------------------------------------------
function validar(contenido) {
  if (!contenido.titulo) fallar('Falta "titulo" en contenido.json');
  if (!Array.isArray(contenido.temas) || contenido.temas.length === 0) fallar('Falta la lista "temas"');
  const idsVistos = new Set();
  const fiel = contenido.modo === 'fiel';
  if (fiel) avisar('MODO FIEL: copia de la práctica del profesor en orden, una pasada, sin variantes ni repaso adaptativo. Las respuestas siguen cifradas.');
  contenido.temas.forEach((t, ti) => {
    if (!t.id) t.id = 'tema' + (ti + 1);
    if (!t.nombre) fallar('El tema ' + t.id + ' no tiene "nombre"');
    if (!t.microleccion || !String(t.microleccion).trim())
      fallar('El tema "' + t.nombre + '" no tiene "microleccion" (ejemplo resuelto con OTROS números/datos). Es obligatoria.');
    if (t.video !== undefined) {
      const url = typeof t.video === 'string' ? t.video : t.video.url;
      if (!idYoutube(url)) fallar('El tema "' + t.nombre + '": "video" debe ser un enlace de YouTube válido (watch, youtu.be o embed).');
      avisar('El tema "' + t.nombre + '" incluye un video de YouTube — verificar que sea de una fuente pre-aprobada (ver SKILL.md) o aprobado por el adulto.');
    }
    if (t.imagen !== undefined) {
      const iurl = typeof t.imagen === 'string' ? t.imagen : t.imagen.url;
      if (!/^https:\/\//.test(String(iurl))) fallar('El tema "' + t.nombre + '": "imagen" debe ser una URL https.');
      avisar('El tema "' + t.nombre + '" incluye una imagen externa — verificar licencia y contenido antes de entregar. Requiere internet.');
    }
    if (fiel && (!Array.isArray(t.variantes) || t.variantes.length < 1))
      fallar('El tema "' + t.nombre + '" no tiene variantes.');
    if (!fiel && (!Array.isArray(t.variantes) || t.variantes.length < 3))
      fallar('El tema "' + t.nombre + '" tiene ' + (t.variantes ? t.variantes.length : 0) + ' variantes; se exigen 3 o más.');
    const formatos = new Set(t.variantes.map(v => v.formato));
    if (!fiel && formatos.size < 2)
      fallar('El tema "' + t.nombre + '" usa un solo formato (' + [...formatos] + '); se exigen 2 o más formatos distintos.');
    t.variantes.forEach((v, vi) => {
      if (!v.id) v.id = t.id + '-v' + (vi + 1);
      if (idsVistos.has(v.id)) fallar('id de variante repetido: ' + v.id);
      idsVistos.add(v.id);
      if (!FORMATOS.includes(v.formato)) fallar('Variante ' + v.id + ': formato desconocido "' + v.formato + '". Válidos: ' + FORMATOS.join(', '));
      if (!v.pregunta) fallar('Variante ' + v.id + ': falta "pregunta"');
      if (!v.pista) avisar('Variante ' + v.id + ' no tiene "pista" — se recomienda incluirla.');
      if (v.grafico !== undefined) {
        if (!v.grafico || !['cuadricula', 'barra'].includes(v.grafico.tipo)) fallar('Variante ' + v.id + ': "grafico.tipo" debe ser "cuadricula" (100 partes) o "barra" (10 partes)');
        const maxG = v.grafico.tipo === 'cuadricula' ? 100 : 10;
        if (!Number.isInteger(v.grafico.pintadas) || v.grafico.pintadas < 0 || v.grafico.pintadas > maxG)
          fallar('Variante ' + v.id + ': "grafico.pintadas" debe ser un entero entre 0 y ' + maxG);
      }
      switch (v.formato) {
        case 'mc': case 'porque':
          if (!Array.isArray(v.opciones) || v.opciones.length < 3) fallar('Variante ' + v.id + ': "opciones" debe tener 3+ elementos');
          if (v.respuesta === undefined) fallar('Variante ' + v.id + ': falta "respuesta"');
          if (!v.opciones.some(o => norm(o) === norm(v.respuesta)))
            fallar('Variante ' + v.id + ': la "respuesta" no coincide con ninguna opción');
          break;
        case 'verifica':
          if (v.respuesta === undefined || !['si', 'no'].includes(norm(v.respuesta)))
            fallar('Variante ' + v.id + ' (verifica): "respuesta" debe ser "sí" o "no"');
          break;
        case 'arma':
          if (v.respuesta === undefined) fallar('Variante ' + v.id + ': falta "respuesta"');
          if (!Array.isArray(v.fichas) || v.fichas.length < 3) fallar('Variante ' + v.id + ' (arma): "fichas" debe tener 3+ piezas');
          break;
        case 'clasifica':
          if (!Array.isArray(v.categorias) || v.categorias.length < 2) fallar('Variante ' + v.id + ' (clasifica): faltan "categorias" (2+)');
          if (!Array.isArray(v.elementos) || v.elementos.length < 3) fallar('Variante ' + v.id + ' (clasifica): faltan "elementos" (3+) con {texto, categoria}');
          v.elementos.forEach(e => {
            if (!e.texto || !e.categoria) fallar('Variante ' + v.id + ': cada elemento necesita "texto" y "categoria"');
            if (!v.categorias.some(c => norm(c) === norm(e.categoria)))
              fallar('Variante ' + v.id + ': el elemento "' + e.texto + '" usa una categoría que no está en "categorias"');
          });
          break;
        case 'ordena':
          if (!Array.isArray(v.elementos) || v.elementos.length < 3) fallar('Variante ' + v.id + ' (ordena): "elementos" debe tener 3+ elementos EN EL ORDEN CORRECTO');
          break;
        case 'empareja':
          if (!Array.isArray(v.pares) || v.pares.length < 3) fallar('Variante ' + v.id + ' (empareja): "pares" debe tener 3+ pares [izquierda, derecha]');
          v.pares.forEach(p => { if (!Array.isArray(p) || p.length !== 2) fallar('Variante ' + v.id + ': cada par debe ser [izquierda, derecha]'); });
          break;
        case 'escribe':
          if (v.respuesta === undefined) fallar('Variante ' + v.id + ' (escribe): falta "respuesta"');
          if (contieneRespuesta(fiel, v))
            fallar('Variante ' + v.id + ' (escribe): la respuesta aparece dentro de su propia pregunta o pista.');
          break;
        case 'oracion':
          if (v.respuesta === undefined) fallar('Variante ' + v.id + ' (oracion): falta "respuesta" (la forma verbal exacta que la oración debe contener)');
          if (contieneRespuesta(fiel, v))
            fallar('Variante ' + v.id + ' (oracion): la forma verbal esperada aparece dentro de su propia pregunta o pista.');
          break;
      }
      if (v.contexto !== undefined && typeof v.contexto !== 'string')
        fallar('Variante ' + v.id + ': "contexto" debe ser un texto (se muestra sobre la pregunta, p. ej. una lectura)');
      if (v.aceptadas !== undefined) {
        if (!['escribe', 'arma', 'oracion'].includes(v.formato)) fallar('Variante ' + v.id + ': "aceptadas" solo se permite en los formatos escribe, arma y oracion');
        if (!Array.isArray(v.aceptadas) || v.aceptadas.some(a => typeof a !== 'string'))
          fallar('Variante ' + v.id + ': "aceptadas" debe ser una lista de textos');
      }
    });
  });
}

function contieneRespuesta(fiel, v) {
  const texto = norm(v.pregunta + ' ' + (v.pista || ''));
  const r = norm(v.respuesta);
  if (!fiel) return texto.includes(r);
  return (' ' + texto.replace(/[^a-z0-9ñ ]+/g, ' ') + ' ').includes(' ' + r + ' ');
}

// --- serialización canónica de la respuesta ---------------------------------
function canonica(v) {
  switch (v.formato) {
    case 'mc': case 'porque': return norm(v.respuesta);
    case 'verifica': return norm(v.respuesta); // "si" | "no" (norm quita la tilde)
    case 'arma': return normArma(v.respuesta);
    case 'escribe': return norm(v.respuesta);
    case 'oracion': return norm(v.respuesta);
    case 'clasifica':
      return v.elementos.map(e => norm(e.texto) + '>' + norm(e.categoria)).sort().join(';');
    case 'ordena': return v.elementos.map(norm).join('>');
    case 'empareja':
      return v.pares.map(p => norm(p[0]) + '>' + norm(p[1])).sort().join(';');
  }
}

// --- transformar a datos públicos (sin respuestas) ---------------------------
function hashesDe(sal, v) {
  const f = v.formato === 'arma' ? normArma : norm;
  const cans = [canonica(v)];
  if (Array.isArray(v.aceptadas)) v.aceptadas.forEach(a => cans.push(f(a)));
  return [...new Set(cans)].map(c => hashRespuesta(sal, v.id, c));
}
function construirDatos(contenido, sal) {
  return {
    titulo: contenido.titulo,
    materia: contenido.materia || '',
    sal: sal,
    creditosNecesarios: 2,
    fiel: contenido.modo === 'fiel',
    voz: contenido.voz !== false,
    temas: contenido.temas.map(t => ({
      id: t.id,
      nombre: t.nombre,
      explicacion: t.explicacion || '',   // literal del profesor
      microleccion: t.microleccion,       // ejemplo resuelto con otros números
      videoId: t.video ? idYoutube(typeof t.video === 'string' ? t.video : t.video.url) : null,
      videoTitulo: (t.video && t.video.titulo) ? t.video.titulo : '',
      imagenUrl: t.imagen ? (typeof t.imagen === 'string' ? t.imagen : t.imagen.url) : null,
      imagenTitulo: (t.imagen && t.imagen.titulo) ? t.imagen.titulo : '',
      variantes: t.variantes.map(v => {
        const base = { id: v.id, formato: v.formato, pregunta: v.pregunta, pista: v.pista || '', hashes: hashesDe(sal, v) };
        if (v.grafico) base.grafico = { tipo: v.grafico.tipo, pintadas: v.grafico.pintadas };
        if (v.contexto) base.contexto = v.contexto;
        switch (v.formato) {
          case 'mc': case 'porque': base.opciones = contenido.modo === 'fiel' ? v.opciones.slice() : mezclarDistinto(v.opciones); break;
          case 'verifica': base.opciones = ['Sí', 'No']; break;
          case 'arma': base.fichas = mezclarDistinto(v.fichas); break;
          case 'clasifica':
            base.categorias = v.categorias.slice();
            base.elementos = contenido.modo === 'fiel' ? v.elementos.map(e => e.texto) : mezclarDistinto(v.elementos.map(e => e.texto));
            break;
          case 'ordena': base.elementos = mezclarDistinto(v.elementos); break;
          case 'empareja':
            base.izquierda = v.pares.map(p => p[0]);
            base.derecha = mezclarDistinto(v.pares.map(p => p[1]));
            break;
        }
        return base;
      })
    }))
  };
}

// --- auditoría de fugas ------------------------------------------------------
function auditar(html, contenido, datos) {
  const problemas = [];
  const inicio = html.indexOf('/*DATOS-INICIO*/');
  const fin = html.indexOf('/*DATOS-FIN*/');
  if (inicio < 0 || fin < 0) problemas.push('No se encontraron los marcadores del bloque de datos.');
  const bloqueDatos = html.slice(inicio, fin);
  if (/"respuesta"\s*:/.test(bloqueDatos)) problemas.push('El bloque de datos contiene una clave "respuesta".');
  if (/"aceptadas"\s*:/.test(bloqueDatos)) problemas.push('El bloque de datos contiene una clave "aceptadas".');
  if (/"pares"\s*:/.test(bloqueDatos)) problemas.push('El bloque de datos contiene "pares" (delata emparejamientos).');
  // El material didáctico (explicaciones literales del profesor y microlecciones) se muestra
  // a propósito durante el repaso, así que se excluye del chequeo de respuestas de "arma".
  let htmlSinMaterial = html.replace(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g, ' ');
  contenido.temas.forEach(t => [t.explicacion, t.microleccion].forEach(txt => {
    if (!txt) return;
    htmlSinMaterial = htmlSinMaterial.split(String(txt)).join(' ');
    htmlSinMaterial = htmlSinMaterial.split(JSON.stringify(String(txt)).slice(1, -1)).join(' ');
  }));
  const htmlNorm = norm(htmlSinMaterial);
  const htmlCompacto = htmlNorm.replace(/\s+/g, '');
  contenido.temas.forEach(t => t.variantes.forEach(v => {
    if (v.formato === 'arma') {
      const resp = normArma(v.respuesta);
      // respuestas cortas: solo texto con espacios (evita falsos positivos entre palabras);
      // respuestas largas: también el texto compactado (atrapa fugas con espacios metidos)
      if (resp.length >= 3 && (htmlNorm.includes(resp) || (resp.length >= 6 && htmlCompacto.includes(resp))))
        problemas.push('La respuesta de "arma" de la variante ' + v.id + ' aparece en texto plano.');
    }
    if (v.formato === 'ordena') {
      const dat = datos.temas.find(x => x.id === t.id).variantes.find(x => x.id === v.id);
      if (v.elementos.length > 1 && JSON.stringify(dat.elementos.map(norm)) === JSON.stringify(v.elementos.map(norm)))
        problemas.push('Variante ' + v.id + ' (ordena): los elementos quedaron en el orden correcto (sin mezclar).');
    }
    if (v.formato === 'empareja') {
      const dat = datos.temas.find(x => x.id === t.id).variantes.find(x => x.id === v.id);
      const derCorrecta = v.pares.map(p => norm(p[1]));
      if (v.pares.length > 1 && JSON.stringify(dat.derecha.map(norm)) === JSON.stringify(derCorrecta))
        problemas.push('Variante ' + v.id + ' (empareja): la columna derecha quedó alineada con la izquierda.');
    }
  }));
  if (/incorrecto|¡mal!|respuesta correcta\s*:/i.test(html.replace(/todav[ií]a no/gi, '')))
    problemas.push('El HTML contiene lenguaje prohibido ("incorrecto", "mal" o revela la respuesta correcta).');
  if (problemas.length) {
    problemas.forEach(p => console.error('[FUGA] ' + p));
    fallar('Auditoría fallida: se detectaron ' + problemas.length + ' fuga(s). No se entrega el archivo.');
  }
}

// --- plantilla del motor -----------------------------------------------------
function cssFuentes() {
  // Andika (SIL, licencia OFL): fuente diseñada para alfabetización y lectores principiantes.
  // Se incrusta en base64 para que la práctica funcione sin internet.
  try {
    const dir = path.join(__dirname, 'fuentes');
    const f400 = fs.readFileSync(path.join(dir, 'andika-latin-400-normal.woff2')).toString('base64');
    const f700 = fs.readFileSync(path.join(dir, 'andika-latin-700-normal.woff2')).toString('base64');
    return '@font-face{font-family:"Andika";font-style:normal;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,' + f400 + ') format("woff2")}\n' +
           '@font-face{font-family:"Andika";font-style:normal;font-weight:700;font-display:swap;src:url(data:font/woff2;base64,' + f700 + ') format("woff2")}\n';
  } catch (e) {
    avisar('No se encontraron las fuentes Andika en assets/fuentes/ — se usará la pila de respaldo.');
    return '';
  }
}
function generarHtml(datos) {
  const datosJson = JSON.stringify(datos);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(datos.titulo)}</title>
<style>
${cssFuentes()}:root{
  --cielo1:#1B1464;--cielo2:#4A1E9E;--carta:#FFFFFF;--tinta:#2D2A5E;--tintaSuave:#6B6899;
  --sol:#FFB703;--solOscuro:#D89400;--menta:#06D6A0;--mentaOscuro:#04A87E;
  --nube:#FFD166;--nubeOscuro:#E0B04A;--cielitoBtn:#8ECAE6;--cielitoOscuro:#5FA8CC;
  --lila:#9B5DE5;--moradoTitulo:#3A1D8A;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;font-family:'Andika','Comic Sans MS','Chalkboard SE','Segoe UI',sans-serif;
  color:var(--tinta);min-height:100vh;overflow-x:hidden;
  font-size:17px;line-height:1.6;letter-spacing:.01em;
  background:linear-gradient(160deg,var(--cielo1) 0%,var(--cielo2) 55%,#7B2FBE 100%);
  background-attachment:fixed}
.estrella{position:fixed;color:#FFF;pointer-events:none;z-index:0;animation:titilar 3s ease-in-out infinite}
@keyframes titilar{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
.contenedor{max-width:640px;margin:0 auto;padding:14px;position:relative;z-index:1}
.carta{background:var(--carta);border-radius:22px;padding:20px;margin-bottom:14px;
  box-shadow:0 8px 24px rgba(20,10,60,.35);animation:aparecer .35s ease}
@keyframes aparecer{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
h1{font-size:1.55rem;margin:.2em 0;color:var(--moradoTitulo);letter-spacing:.3px}
h2{font-size:1.15rem;color:var(--moradoTitulo);margin:.3em 0 .5em}
.suave{color:var(--tintaSuave);font-size:.92rem}
button{font-family:inherit;font-size:1.02rem;border:0;border-radius:16px;padding:13px 16px;cursor:pointer;
  transition:transform .08s,box-shadow .08s;font-weight:700}
button:active{transform:translateY(4px)}
.btn-principal{background:var(--sol);color:#4A2500;width:100%;font-size:1.12rem;font-weight:800;
  box-shadow:0 5px 0 var(--solOscuro)}
.btn-principal:active{box-shadow:0 1px 0 var(--solOscuro)}
.btn-sec{background:var(--cielitoBtn);color:#0B3A52;box-shadow:0 4px 0 var(--cielitoOscuro)}
.btn-sec:active{box-shadow:0 1px 0 var(--cielitoOscuro)}
.btn-opcion{display:block;width:100%;text-align:left;background:#F5F3FF;color:var(--tinta);
  margin:9px 0;border:3px solid #E4DEFF;font-weight:600;box-shadow:0 3px 0 #E4DEFF}
.btn-opcion:hover{border-color:var(--lila);transform:translateY(-2px)}
.btn-opcion:active{transform:translateY(2px)}
.ficha{display:inline-block;background:#FFF4D6;border:3px solid var(--sol);color:#7A4E00;font-weight:800;
  margin:4px;padding:11px 15px;border-radius:14px;box-shadow:0 3px 0 var(--solOscuro)}
.ficha:active{transform:translateY(3px);box-shadow:none}
.zona-construccion{min-height:56px;background:#F5F3FF;border:3px dashed #C9BEF5;border-radius:16px;padding:8px;margin:10px 0}
.ruta-planetas{display:flex;gap:4px;justify-content:center;align-items:center;flex-wrap:wrap;
  background:rgba(255,255,255,.14);border-radius:99px;padding:8px 12px;margin-bottom:10px}
.planeta{font-size:1.45rem;filter:grayscale(1) opacity(.45);transition:filter .4s,transform .4s}
.planeta.dominado{filter:none;transform:scale(1.18);text-shadow:0 0 14px #FFD166}
.cohete{font-size:1.5rem;animation:flotar 2.6s ease-in-out infinite}
@keyframes flotar{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.barra{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}
.pill{background:rgba(255,255,255,.18);color:#FFF;border-radius:99px;padding:6px 13px;font-size:.85rem;font-weight:700}
.btn-icono{background:rgba(255,255,255,.18);color:#FFF;padding:6px 12px;border-radius:99px;box-shadow:none;font-size:.95rem}
.mascota{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}
.mascota .emoji-mascota{font-size:2.5rem;animation:flotar 3s ease-in-out infinite}
.burbuja{background:#FFF;border-radius:18px;border-bottom-left-radius:4px;padding:12px 15px;flex:1;
  box-shadow:0 5px 16px rgba(20,10,60,.3);font-size:.98rem}
.fila-orden{display:flex;align-items:center;gap:8px;background:#F5F3FF;border:3px solid #E4DEFF;border-radius:14px;padding:9px 11px;margin:7px 0}
.fila-orden span{flex:1;font-weight:600}
.fila-orden button{padding:7px 12px;background:var(--cielitoBtn);color:#0B3A52;box-shadow:0 3px 0 var(--cielitoOscuro)}
select{font-family:inherit;font-size:.95rem;padding:9px;border-radius:12px;border:3px solid #E4DEFF;background:#fff;max-width:100%;font-weight:600;color:var(--tinta)}
.fila-sel{display:flex;align-items:center;gap:10px;margin:9px 0;flex-wrap:wrap}
.fila-sel b{flex:1;min-width:120px}
.feedback{border-radius:16px;padding:15px;margin-top:12px;font-weight:800;font-size:1.05rem;text-align:center}
.fb-bien{background:#D9FBEF;color:#046B52;border:3px solid var(--menta);animation:rebotar .5s ease}
@keyframes rebotar{0%{transform:scale(.9)}45%{transform:scale(1.06)}100%{transform:scale(1)}}
.fb-nube{background:#FFF4D6;color:#7A5300;border:3px solid var(--nube);animation:mecer .6s ease}
@keyframes mecer{0%{transform:translateX(0)}30%{transform:translateX(-4px)}60%{transform:translateX(4px)}100%{transform:none}}
.overlay{position:fixed;inset:0;background:rgba(20,10,60,.65);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50}
.overlay .carta{max-width:520px;width:100%;max-height:85vh;overflow:auto}
.oculto{display:none!important}
.orden-num{display:inline-flex;width:28px;height:28px;border-radius:50%;background:var(--sol);color:#4A2500;
  align-items:center;justify-content:center;font-weight:800;margin-right:8px;font-size:.9rem}
table.informe{width:100%;border-collapse:collapse;font-size:.9rem}
table.informe th,table.informe td{border-bottom:1px solid #E4DEFF;padding:8px 6px;text-align:left}
.modo-adulto{font-family:system-ui,'Segoe UI',Arial,sans-serif}
.explicacion{background:#F5F3FF;border-left:5px solid var(--lila);padding:13px 15px;border-radius:10px;margin:12px 0;font-size:1rem;line-height:1.7;letter-spacing:.015em;max-width:60ch}
.progreso{height:10px;background:rgba(255,255,255,.18);border-radius:99px;overflow:hidden;margin:8px 0}
.progreso div{height:100%;background:linear-gradient(90deg,var(--menta),var(--sol));width:0%;transition:width .5s}
.tarjeta-repaso{margin:10px 0;cursor:pointer;transition:transform .2s}
.tarjeta-repaso.girando{transform:rotateY(90deg)}
.tarjeta-repaso .cara-frente{background:linear-gradient(135deg,var(--lila),#7B2FBE);color:#fff;font-weight:800;padding:17px;text-align:center;border-radius:16px;box-shadow:0 4px 0 #5B1E96}
.tarjeta-repaso .cara-dorso{background:#F5F3FF;border:3px solid var(--lila);border-radius:16px;padding:15px;font-size:1rem;line-height:1.7;letter-spacing:.015em}
.tarjeta-repaso.vista{cursor:default}
button:disabled{opacity:.45;cursor:not-allowed}
.respuesta-escrita{width:100%;font-family:inherit;font-size:1.1rem;padding:13px;border-radius:14px;border:3px solid #E4DEFF;box-sizing:border-box;margin:8px 0;font-weight:700;color:var(--tinta)}
.respuesta-escrita:focus{outline:none;border-color:var(--sol)}
textarea{width:100%;font-family:inherit;font-size:1rem;padding:11px;border-radius:14px;border:3px solid #E4DEFF;box-sizing:border-box;color:var(--tinta)}
textarea:focus{outline:none;border-color:var(--sol)}
.esquema{background:#F5F3FF;border-radius:16px;padding:12px}
.nodo-centro{background:linear-gradient(135deg,var(--moradoTitulo),var(--lila));color:#fff;font-weight:800;text-align:center;border-radius:99px;padding:11px 16px;margin-bottom:10px;box-shadow:0 4px 0 #2A1266}
.ramas{display:grid;grid-template-columns:1fr;gap:12px}
.rama{border-left:6px solid var(--lila);background:#fff;border-radius:0 14px 14px 0;padding:13px 16px;font-size:1rem;line-height:1.7;letter-spacing:.015em;max-width:60ch;box-shadow:0 2px 8px rgba(20,10,60,.08)}
.rama b{color:var(--moradoTitulo);display:block;margin-bottom:6px}
.rama-estrella{border-left-color:var(--sol);background:#FFF9E8}
.toast-insignia{position:fixed;top:12px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#FFF4D6,#FFE39A);border:3px solid var(--sol);color:#7A4E00;font-weight:800;border-radius:99px;padding:11px 19px;z-index:60;box-shadow:0 6px 18px rgba(0,0,0,.25);animation:toastIn .35s ease}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-14px) scale(.9)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
.confeti{position:fixed;top:-14px;width:10px;height:14px;z-index:55;border-radius:3px;animation:caerConfeti linear forwards}
@keyframes caerConfeti{to{transform:translateY(105vh) rotate(540deg)}}
.pulso{animation:pulsar 1.6s ease-in-out infinite}
@keyframes pulsar{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<div class="contenedor" id="app"></div>
<script>
/*DATOS-INICIO*/
var DATOS = ${datosJson};
/*DATOS-FIN*/

/* ---------- sha256 puro en JS (sin depender de crypto.subtle) ---------- */
function sha256hex(ascii){
function rr(v,c){return(v>>>c)|(v<<(32-c));}
var mw=Math.pow,ms=mw(2,32),i,j,result='';
var words=[],al=ascii.length*8;
var hash=sha256hex.h=sha256hex.h||[],k=sha256hex.k=sha256hex.k||[],pc=k.length;
var isC={};
for(var cand=2;pc<64;cand++){
if(!isC[cand]){for(i=0;i<313;i+=cand){isC[i]=cand;}
hash[pc]=(mw(cand,.5)*ms)|0;k[pc++]=(mw(cand,1/3)*ms)|0;}}
ascii+='\\x80';
while(ascii.length%64-56)ascii+='\\x00';
for(i=0;i<ascii.length;i++){j=ascii.charCodeAt(i);if(j>>8)return null;
words[i>>2]|=j<<((3-i)%4)*8;}
words[words.length]=(al/ms)|0;words[words.length]=al;
for(j=0;j<words.length;){
var w=words.slice(j,j+=16),oh=hash.slice(0,8);
for(i=16;i<64;i++){var w15=w[i-15],w2=w[i-2];
w[i]=((rr(w15,7)^rr(w15,18)^(w15>>>3))+w[i-7]+(rr(w2,17)^rr(w2,19)^(w2>>>10))+w[i-16])|0;}
for(i=0;i<64;i++){
var a=hash[0],e=hash[4];
var t1=(hash[7]+(rr(e,6)^rr(e,11)^rr(e,25))+((e&hash[5])^((~e)&hash[6]))+k[i]+w[i])|0;
var t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&hash[1])^(a&hash[2])^(hash[1]&hash[2])))|0;
hash=[(t1+t2)|0].concat(hash);hash[4]=(hash[4]+t1)|0;hash.length=8;}
for(i=0;i<8;i++)hash[i]=(hash[i]+oh[i])|0;}
for(i=0;i<8;i++)for(j=3;j+1;j--){var b=(hash[i]>>(j*8))&255;result+=((b>>4).toString(16))+((b&15).toString(16));}
return result;}
function utf8(s){return unescape(encodeURIComponent(s));}
function sha(s){return sha256hex(utf8(s));}

/* ---------- utilidades ---------- */
function norm(s){return String(s).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/\\s+/g,' ').trim();}
function normArma(s){return norm(s).replace(/\\s+/g,'');}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function el(id){return document.getElementById(id);}
function mezclarVista(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}

/* ---------- estado ---------- */
var estado={
  orden:[],            // ids de temas en el orden elegido por el niño/la niña
  cola:[],             // encuentros pendientes: ids de tema
  temas:{},            // id -> {creditos,fallos,intentos,pistas,dominado,usadas:[],ultimoFormato,microVista}
  actual:null,         // {temaId, variante}
  respondidas:0,
  guardadas:0,         // usos de "guardar para después" (máx 2)
  rondas:0,
  inicioRonda:0,
  fase:'normal',          // 'normal' | 'repaso'
  repasoLista:[],
  repasoIdx:0,
  refuerzoIntentos:0,
  insignias:{},
  dias:[],
  modosRepaso:[]
};
DATOS.temas.forEach(function(t){estado.temas[t.id]={creditos:0,fallos:0,intentos:0,pistas:0,dominado:false,usadas:[],ultimoFormato:null,microVista:false,reforzado:false,resumen:''};});

/* ---------- progreso guardado entre sesiones ---------- */
var CLAVE='practica-'+DATOS.sal;
function guardarProgreso(){
  try{
    var t={};
    DATOS.temas.forEach(function(x){var s=estado.temas[x.id];t[x.id]={creditos:s.creditos,fallos:s.fallos,intentos:s.intentos,pistas:s.pistas,dominado:s.dominado,usadas:s.usadas,ultimoFormato:s.ultimoFormato,microVista:s.microVista,reforzado:s.reforzado,resumen:s.resumen||'',oraciones:s.oraciones||[]};});
    localStorage.setItem(CLAVE,JSON.stringify({orden:estado.orden,temas:t,respondidas:estado.respondidas,guardadas:estado.guardadas,rondas:estado.rondas,insignias:estado.insignias,dias:estado.dias,modosRepaso:estado.modosRepaso}));
  }catch(e){}
}
function cargarProgreso(){try{var s=localStorage.getItem(CLAVE);return s?JSON.parse(s):null;}catch(e){return null;}}
function borrarProgreso(){try{localStorage.removeItem(CLAVE);}catch(e){}}

/* ---------- motivación: insignias por ESFUERZO (no solo por acertar) ---------- */
var INSIGNIAS={
  'primera-estrella':{emoji:'🎯',nombre:'Primera estrella',desc:'Dominaste tu primer tema'},
  'escritor':{emoji:'✍️',nombre:'Con mis palabras',desc:'Escribiste un resumen con tus propias palabras'},
  'no-me-rindo':{emoji:'💪',nombre:'No me rindo',desc:'Reforzaste un tema después de que te costara'},
  'explorador':{emoji:'🧭',nombre:'Explorador',desc:'Probaste las 3 formas de repasar'},
  'constante':{emoji:'🔥',nombre:'Constancia',desc:'Practicaste en 2 días distintos'},
  'super-constante':{emoji:'🌋',nombre:'Súper constancia',desc:'Practicaste en 5 días distintos'},
  'campeon':{emoji:'🏆',nombre:'Campeón del tema',desc:'Dominaste todos los temas'}
};
function otorgarInsignia(id){
  if(estado.insignias[id])return;
  estado.insignias[id]=true;
  guardarProgreso();
  var ins=INSIGNIAS[id];if(!ins)return;
  sonidoInsignia();
  var t=document.createElement('div');
  t.className='toast-insignia';
  t.textContent='🏅 ¡Nueva insignia! '+ins.emoji+' '+ins.nombre;
  document.body.appendChild(t);
  setTimeout(function(){t.remove();},2600);
}
function confeti(){
  var colores=['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed'];
  for(var i=0;i<28;i++){
    var c=document.createElement('div');
    c.className='confeti';
    c.style.left=(Math.random()*100)+'vw';
    c.style.background=colores[i%colores.length];
    c.style.animationDuration=(1.2+Math.random()*1.2)+'s';
    c.style.animationDelay=(Math.random()*0.3)+'s';
    document.body.appendChild(c);
    (function(x){setTimeout(function(){x.remove();},3000);})(c);
  }
}
function registrarDia(){
  var hoy=new Date().toISOString().slice(0,10);
  if(estado.dias.indexOf(hoy)<0)estado.dias.push(hoy);
  if(estado.dias.length>=2)otorgarInsignia('constante');
  if(estado.dias.length>=5)otorgarInsignia('super-constante');
}
function celebrarDominio(){
  confeti();
  otorgarInsignia('primera-estrella');
  if(DATOS.temas.every(function(t){return estado.temas[t.id].dominado;}))otorgarInsignia('campeon');
}

/* ---------- lectura en voz alta ---------- */
var vozElegida=null;
function elegirVoz(){
  try{
    var voces=speechSynthesis.getVoices().filter(function(v){return /^es/i.test(v.lang);});
    if(!voces.length)return null;
    function puntos(v){
      var n=v.name.toLowerCase(),p=0;
      if(n.indexOf('natural')>=0)p+=6;
      if(n.indexOf('neural')>=0)p+=6;
      if(n.indexOf('online')>=0)p+=3;
      if(n.indexOf('google')>=0)p+=4;
      if(/m[oó]nica|paulina|dalia|sabina|luciana|camila|jorge/.test(n))p+=2;
      var l=v.lang.toLowerCase();
      if(l.indexOf('es-us')===0||l.indexOf('es-419')===0||l.indexOf('es-mx')===0||l.indexOf('es-cr')===0)p+=2;
      return p;
    }
    voces.sort(function(a,b){return puntos(b)-puntos(a);});
    return voces[0];
  }catch(e){return null;}
}
try{speechSynthesis.addEventListener('voiceschanged',function(){vozElegida=elegirVoz();});}catch(e){}
function leerEnVoz(texto){
  try{
    var limpio=String(texto).replace(/<[^>]*>/g,' ')
      .replace(/[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]/g,' ')
      .replace(/[\\u2600-\\u27BF\\u2B00-\\u2BFF\\uFE0F\\u2716\\u2714]/g,' ')
      .replace(/→/g,', entonces, ')
      .replace(/\\s+/g,' ').trim();
    if(!limpio)return;
    if(!vozElegida)vozElegida=elegirVoz();
    speechSynthesis.cancel();
    var frases=limpio.match(/[^.!?…]+[.!?…]*/g)||[limpio];
    frases.forEach(function(f){
      f=f.trim();
      if(!f)return;
      var u=new SpeechSynthesisUtterance(f);
      u.lang=(vozElegida&&vozElegida.lang)||'es-US';
      if(vozElegida)u.voice=vozElegida;
      u.rate=0.98;
      u.pitch=1.05;
      speechSynthesis.speak(u);
    });
  }catch(e){}
}

/* ---------- mundo visual: cielo, planetas, mascota, sonido ---------- */
var PLANETAS=['🪐','🌍','🌕','☀️','🛸','🌈','⚡','💎','🌋','🌊'];
var COLORES=['#EF476F','#06D6A0','#118AB2','#FFB703','#9B5DE5','#FB5607','#00BBF9','#F15BB5','#2EC4B6','#E76F51'];
function temaIdx(id){for(var i=0;i<DATOS.temas.length;i++)if(DATOS.temas[i].id===id)return i;return 0;}
function emojiTema(id){return PLANETAS[temaIdx(id)%PLANETAS.length];}
function colorTema(id){return COLORES[temaIdx(id)%COLORES.length];}
function crearCielo(){
  for(var i=0;i<38;i++){
    var s=document.createElement('span');
    s.className='estrella';
    s.textContent=(i%7===0)?'✦':'·';
    s.style.left=(Math.random()*100)+'vw';
    s.style.top=(Math.random()*100)+'vh';
    s.style.fontSize=(8+Math.random()*10)+'px';
    s.style.animationDelay=(Math.random()*3)+'s';
    document.body.appendChild(s);
  }
}
function mascota(msg){
  return '<div class="mascota"><span class="emoji-mascota">⭐</span><div class="burbuja">'+msg+'</div></div>';
}
function rutaPlanetas(){
  var orden=estado.orden.length?estado.orden:DATOS.temas.map(function(t){return t.id;});
  var h='<div class="ruta-planetas">🚀';
  orden.forEach(function(id){
    h+='<span class="planeta'+(estado.temas[id].dominado?' dominado':'')+'" title="'+esc(temaPorId(id).nombre)+'">'+emojiTema(id)+'</span>';
  });
  return h+'</div>';
}
var sonidoOn=true;
try{sonidoOn=localStorage.getItem('practica-sonido')!=='off';}catch(e){}
function tono(secuencia){
  if(!sonidoOn)return;
  try{
    var ctx=tono.ctx=tono.ctx||new (window.AudioContext||window.webkitAudioContext)();
    var t=ctx.currentTime;
    secuencia.forEach(function(p){
      var o=ctx.createOscillator(),g=ctx.createGain();
      o.type='sine';o.frequency.value=p[0];
      g.gain.setValueAtTime(0.0001,t+p[1]);
      g.gain.exponentialRampToValueAtTime(0.12,t+p[1]+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,t+p[1]+p[2]);
      o.connect(g);g.connect(ctx.destination);
      o.start(t+p[1]);o.stop(t+p[1]+p[2]+0.05);
    });
  }catch(e){}
}
function sonidoBien(){tono([[523,0,.15],[659,.12,.15],[784,.24,.28]]);}
function sonidoSuave(){tono([[392,0,.2],[440,.16,.26]]);}
function sonidoInsignia(){tono([[659,0,.12],[784,.1,.12],[1047,.2,.3]]);}
function botonSonido(){return '<button class="btn-icono" id="btn-sonido">'+(sonidoOn?'🔊':'🔇')+'</button>';}
function bindSonido(){
  var b=el('btn-sonido');
  if(!b)return;
  b.addEventListener('click',function(){
    sonidoOn=!sonidoOn;
    try{localStorage.setItem('practica-sonido',sonidoOn?'on':'off');}catch(e){}
    b.textContent=sonidoOn?'🔊':'🔇';
    if(sonidoOn)sonidoBien();
  });
}

function temaPorId(id){for(var i=0;i<DATOS.temas.length;i++)if(DATOS.temas[i].id===id)return DATOS.temas[i];return null;}
function temasPendientes(){return DATOS.temas.filter(function(t){return !estado.temas[t.id].dominado;});}

/* ---------- selección de variantes ---------- */
function elegirVariante(tema,evitarFormato){
  var st=estado.temas[tema.id];
  if(DATOS.fiel){
    var sig=null;
    for(var k=0;k<tema.variantes.length;k++){if(st.usadas.indexOf(tema.variantes[k].id)<0){sig=tema.variantes[k];break;}}
    if(!sig)sig=tema.variantes[tema.variantes.length-1];
    if(st.usadas.indexOf(sig.id)<0)st.usadas.push(sig.id);
    st.ultimoFormato=sig.formato;
    return sig;
  }
  var cand=tema.variantes.filter(function(v){return st.usadas.indexOf(v.id)<0 && v.formato!==evitarFormato;});
  if(!cand.length)cand=tema.variantes.filter(function(v){return v.formato!==evitarFormato;});
  if(!cand.length)cand=tema.variantes.filter(function(v){return st.usadas.indexOf(v.id)<0;});
  if(!cand.length){st.usadas=[];cand=tema.variantes.slice();}
  var v=cand[Math.floor(Math.random()*cand.length)];
  if(st.usadas.indexOf(v.id)<0)st.usadas.push(v.id);
  st.ultimoFormato=v.formato;
  return v;
}

/* ---------- planificador ---------- */
function insertarEncuentro(temaId,distancia){
  var pos=Math.min(estado.cola.length,distancia);
  estado.cola.splice(pos,0,temaId);
}
function siguiente(){
  if(!estado.cola.length){
    var pend=temasPendientes();
    if(!pend.length){mostrarFinal();return;}
    estado.orden.forEach(function(id){if(pend.some(function(t){return t.id===id;}))estado.cola.push(id);});
  }
  // evitar dos encuentros seguidos del mismo tema si hay alternativa
  if(!DATOS.fiel&&estado.actual&&estado.cola.length>1&&estado.cola[0]===estado.actual.temaId){
    estado.cola.push(estado.cola.shift());
  }
  var temaId=estado.cola.shift();
  var tema=temaPorId(temaId);
  if(estado.temas[temaId].dominado){siguiente();return;}
  var evitar=(estado.actual&&estado.actual.temaId===temaId)?estado.actual.variante.formato:estado.temas[temaId].ultimoFormato;
  var v=elegirVariante(tema,evitar);
  estado.actual={temaId:temaId,variante:v};
  pintarPregunta(tema,v);
}

/* ---------- pantallas ---------- */
function pintarInicio(){
  var prog=cargarProgreso();
  if(prog&&prog.respondidas>0){
    var listos=0;DATOS.temas.forEach(function(t){if(prog.temas&&prog.temas[t.id]&&prog.temas[t.id].dominado)listos++;});
    var nIns=prog.insignias?Object.keys(prog.insignias).length:0;
    var h='<div class="carta" style="text-align:center"><h1>¡Hola de nuevo! 👋🚀</h1>';
    h+=mascota('¡Qué bueno verte otra vez! Tu nave quedó estacionada justo donde la dejaste.');
    h+='<p>Llevabas <b>'+prog.respondidas+' preguntas</b> y <b>'+listos+' de '+DATOS.temas.length+' planetas conquistados</b>.</p>';
    h+='<p class="suave">📅 Días practicados: '+((prog.dias&&prog.dias.length)||1)+(nIns?' · 🏅 Insignias: '+nIns:'')+'</p>';
    h+='<button class="btn-principal" id="btn-continuar" style="margin-bottom:8px">Continuar donde iba ▶</button>';
    h+='<button class="btn-sec" id="btn-explorar-v" style="width:100%;margin-bottom:8px">📚 Explorar los planetas</button>';
    h+='<button class="btn-sec" id="btn-cero" style="width:100%">🔄 Empezar de cero</button></div>';
    el('app').innerHTML=h;
    el('btn-continuar').addEventListener('click',function(){restaurarProgreso(prog);});
    el('btn-explorar-v').addEventListener('click',pintarExplorador);
    el('btn-cero').addEventListener('click',function(){borrarProgreso();pintarInicioNuevo();});
    return;
  }
  pintarInicioNuevo();
}
function restaurarProgreso(prog){
  estado.orden=prog.orden||DATOS.temas.map(function(t){return t.id;});
  estado.respondidas=prog.respondidas||0;
  estado.guardadas=prog.guardadas||0;
  estado.rondas=prog.rondas||0;
  estado.insignias=prog.insignias||{};
  estado.dias=prog.dias||[];
  estado.modosRepaso=prog.modosRepaso||[];
  DATOS.temas.forEach(function(t){
    var g=prog.temas&&prog.temas[t.id];
    if(g)Object.keys(g).forEach(function(k){estado.temas[t.id][k]=g[k];});
  });
  estado.cola=[];
  estado.inicioRonda=Date.now();
  registrarDia();
  siguiente();
}
function pintarInicioNuevo(){
  var h='<div class="carta"><h1>🚀 '+esc(DATOS.titulo)+'</h1>';
  if(DATOS.materia)h+='<p class="suave">'+esc(DATOS.materia)+'</p>';
  if(DATOS.fiel){estado.orden=DATOS.temas.map(function(t){return t.id;});h+=mascota('¡Hola! Soy <b>Cometa</b> ⭐. Esta es la práctica del profe <b>tal cual</b>, en versión web: se responde en orden, parte por parte, como en el papel. Nunca te digo la respuesta: si algo no sale, más adelante lo repasás con el libro.');}
  else h+=mascota('¡Hola! Soy <b>Cometa</b> ⭐ y esta es tu expedición: cada tema es un planeta por conquistar. Tocá los planetas en el orden que VOS quieras visitarlos.');
  h+='<div id="lista-temas">';
  DATOS.temas.forEach(function(t){
    h+='<button class="btn-opcion" data-tema="'+esc(t.id)+'" style="border-left:8px solid '+colorTema(t.id)+'"'+(DATOS.fiel?' disabled':'')+'><span class="orden-num oculto"></span>'+emojiTema(t.id)+' '+esc(t.nombre)+(DATOS.fiel?' <span class="suave">('+t.variantes.length+' ítems)</span>':'')+'</button>';
  });
  h+='</div><button class="'+(DATOS.fiel?'btn-principal pulso':'btn-sec')+'" id="btn-sugerido" style="margin-top:6px">'+(DATOS.fiel?'¡Comenzar la práctica! 🚀':'Usar el orden sugerido')+'</button>';
  h+='<button class="btn-sec" id="btn-explorar" style="width:100%;margin-top:8px">📚 Explorar los planetas (ver toda la materia)</button>';
  h+='<button class="btn-principal oculto pulso" id="btn-comenzar" style="margin-top:10px">¡Despegar! 🚀</button></div>';
  el('app').innerHTML=h;
  var botones=el('lista-temas').querySelectorAll('button');
  botones.forEach(function(b){
    b.addEventListener('click',function(){
      var id=b.getAttribute('data-tema');
      var i=estado.orden.indexOf(id);
      if(i>=0){estado.orden.splice(i,1);}else{estado.orden.push(id);}
      botones.forEach(function(bb){
        var idx=estado.orden.indexOf(bb.getAttribute('data-tema'));
        var num=bb.querySelector('.orden-num');
        if(idx>=0){num.classList.remove('oculto');num.textContent=idx+1;}
        else{num.classList.add('oculto');num.textContent='';}
      });
      el('btn-comenzar').classList.toggle('oculto',estado.orden.length!==DATOS.temas.length);
    });
  });
  el('btn-sugerido').addEventListener('click',function(){
    estado.orden=DATOS.temas.map(function(t){return t.id;});
    comenzar();
  });
  el('btn-explorar').addEventListener('click',pintarExplorador);
  el('btn-comenzar').addEventListener('click',comenzar);
}
function comenzar(){
  estado.cola=estado.orden.slice();
  estado.inicioRonda=Date.now();
  registrarDia();
  siguiente();
}

function barraSuperior(){
  if(estado.fase==='repaso'){
    return rutaPlanetas()+'<div class="barra"><span class="pill">🔁 Repaso final</span><span class="pill">Tema '+(estado.repasoIdx+1)+' de '+estado.repasoLista.length+'</span>'+botonSonido()+'<button class="btn-icono" id="btn-pausa">⏸</button></div>';
  }
  var dom=DATOS.temas.filter(function(t){return estado.temas[t.id].dominado;}).length;
  var pct=Math.round(100*dom/DATOS.temas.length);
  if(DATOS.fiel){var totV=0,hechas=0;DATOS.temas.forEach(function(t){totV+=t.variantes.length;hechas+=estado.temas[t.id].intentos;});pct=Math.round(100*hechas/totV);}
  var restanRonda=6-(estado.respondidas%6);
  return rutaPlanetas()+'<div class="barra"><span class="pill">Ronda '+(estado.rondas+1)+' · faltan '+restanRonda+'</span>'+botonSonido()+
    '<button class="btn-icono" id="btn-pausa">⏸ Pausa</button></div>'+
    '<div class="progreso"><div style="width:'+pct+'%"></div></div>';
}

function pintarPregunta(tema,v){
  var h=barraSuperior();
  h+='<div class="carta" style="border-top:8px solid '+colorTema(tema.id)+'"><p class="suave">'+emojiTema(tema.id)+' '+(DATOS.fiel?'':'Planeta: ')+'<b style="color:'+colorTema(tema.id)+'">'+esc(tema.nombre)+'</b>'+(DATOS.fiel?' · ítem '+(estado.temas[tema.id].usadas.length)+' de '+tema.variantes.length:'')+'</p>';
  if(DATOS.fiel&&tema.explicacion&&estado.temas[tema.id].usadas.length===1)h+='<div class="explicacion">'+tema.explicacion+'</div>';
  if(v.contexto)h+='<div class="explicacion">📖 '+esc(v.contexto)+'</div>';
  h+='<h2>'+esc(v.pregunta)+'</h2>';
  if(v.grafico)h+=graficoSvg(v.grafico);
  h+='<div id="zona-respuesta">';
  switch(v.formato){
    case 'mc': case 'porque': case 'verifica':
      v.opciones.forEach(function(o,i){h+='<button class="btn-opcion" data-op="'+i+'">'+esc(o)+'</button>';});
      break;
    case 'arma':
      h+='<div class="zona-construccion" id="construccion"></div><div id="fichas">';
      v.fichas.forEach(function(f,i){h+='<button class="ficha" data-f="'+i+'">'+esc(f)+'</button>';});
      h+='</div><div style="display:flex;gap:8px;margin-top:8px"><button class="btn-sec" id="btn-borrar">Borrar</button><button class="btn-principal" id="btn-comprobar" style="flex:1">Comprobar</button></div>';
      break;
    case 'clasifica':
      v.elementos.forEach(function(e,i){
        h+='<div class="fila-sel"><b>'+esc(e)+'</b><select data-el="'+i+'"><option value="">— elegir —</option>';
        v.categorias.forEach(function(c){h+='<option value="'+esc(c)+'">'+esc(c)+'</option>';});
        h+='</select></div>';
      });
      h+='<button class="btn-principal" id="btn-comprobar">Comprobar</button>';
      break;
    case 'ordena':
      h+='<div id="lista-ordena"></div><button class="btn-principal" id="btn-comprobar" style="margin-top:8px">Comprobar</button>';
      break;
    case 'empareja':
      var der=mezclarVista(v.derecha);
      v.izquierda.forEach(function(iz,i){
        h+='<div class="fila-sel"><b>'+esc(iz)+'</b><select data-iz="'+i+'"><option value="">— elegir —</option>';
        der.forEach(function(d){h+='<option value="'+esc(d)+'">'+esc(d)+'</option>';});
        h+='</select></div>';
      });
      h+='<button class="btn-principal" id="btn-comprobar">Comprobar</button>';
      break;
    case 'escribe':
      h+='<input type="text" class="respuesta-escrita" id="respuesta-texto" placeholder="Escribí tu respuesta aquí..." autocomplete="off" autocorrect="off" spellcheck="false">';
      h+='<button class="btn-principal" id="btn-comprobar">Comprobar</button>';
      break;
    case 'oracion':
      h+='<input type="text" class="respuesta-escrita" id="respuesta-texto" placeholder="Escribí tu oración completa aquí..." autocomplete="off" autocorrect="off" spellcheck="false">';
      h+='<button class="btn-principal" id="btn-comprobar">Comprobar</button>';
      break;
  }
  h+='</div><div id="feedback"></div>';
  h+='<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">';
  h+='<button class="btn-sec" id="btn-pista">💡 Pista</button>';
  if(DATOS.voz)h+='<button class="btn-sec" id="btn-oir-preg">🔊 Escuchar</button>';
  if(estado.fase==='normal'&&estado.guardadas<2)h+='<button class="btn-sec" id="btn-guardar">📌 Para después ('+(2-estado.guardadas)+')</button>';
  h+='</div></div>';
  el('app').innerHTML=h;
  el('btn-pausa').addEventListener('click',function(){pausaLibre();});
  bindSonido();
  var bOir=el('btn-oir-preg');
  if(bOir)bOir.addEventListener('click',function(){leerEnVoz(v.pregunta);});
  el('btn-pista').addEventListener('click',function(){
    estado.temas[tema.id].pistas++;
    mostrarOverlay('💡 Pista','<p>'+esc(v.pista||'Releé la pregunta con calma; fijate bien en cada palabra.')+'</p>','Seguir');
  });
  var bg=el('btn-guardar');
  if(bg)bg.addEventListener('click',function(){
    estado.guardadas++;
    estado.cola.push(tema.id);
    estado.actual=null;
    siguiente();
  });
  var construccion=[];
  switch(v.formato){
    case 'mc': case 'porque': case 'verifica':
      el('zona-respuesta').querySelectorAll('.btn-opcion').forEach(function(b){
        b.addEventListener('click',function(){responder(tema,v,norm(v.opciones[parseInt(b.getAttribute('data-op'),10)]));});
      });
      break;
    case 'arma':
      function pintarConstruccion(){
        var z=el('construccion');z.innerHTML='';
        construccion.forEach(function(f,i){
          var b=document.createElement('button');b.className='ficha';b.textContent=f;
          b.addEventListener('click',function(){construccion.splice(i,1);pintarConstruccion();});
          z.appendChild(b);
        });
      }
      el('fichas').querySelectorAll('.ficha').forEach(function(b){
        b.addEventListener('click',function(){construccion.push(v.fichas[parseInt(b.getAttribute('data-f'),10)]);pintarConstruccion();});
      });
      el('btn-borrar').addEventListener('click',function(){construccion=[];pintarConstruccion();});
      el('btn-comprobar').addEventListener('click',function(){responder(tema,v,normArma(construccion.join('')));});
      break;
    case 'clasifica':
      el('btn-comprobar').addEventListener('click',function(){
        var sels=el('zona-respuesta').querySelectorAll('select');
        var partes=[],completo=true;
        sels.forEach(function(s){
          var i=parseInt(s.getAttribute('data-el'),10);
          if(!s.value)completo=false;
          partes.push(norm(v.elementos[i])+'>'+norm(s.value));
        });
        if(!completo){avisoCompletar();return;}
        responder(tema,v,partes.sort().join(';'));
      });
      break;
    case 'ordena':
      var elems=v.elementos.slice();
      function pintarOrden(){
        var z=el('lista-ordena');z.innerHTML='';
        elems.forEach(function(e,i){
          var f=document.createElement('div');f.className='fila-orden';
          f.innerHTML='<span>'+esc(e)+'</span>';
          var up=document.createElement('button');up.textContent='▲';
          var dn=document.createElement('button');dn.textContent='▼';
          up.addEventListener('click',function(){if(i>0){var t=elems[i-1];elems[i-1]=elems[i];elems[i]=t;pintarOrden();}});
          dn.addEventListener('click',function(){if(i<elems.length-1){var t=elems[i+1];elems[i+1]=elems[i];elems[i]=t;pintarOrden();}});
          f.appendChild(up);f.appendChild(dn);z.appendChild(f);
        });
      }
      pintarOrden();
      el('btn-comprobar').addEventListener('click',function(){responder(tema,v,elems.map(norm).join('>'));});
      break;
    case 'empareja':
      el('btn-comprobar').addEventListener('click',function(){
        var sels=el('zona-respuesta').querySelectorAll('select');
        var partes=[],completo=true;
        sels.forEach(function(s){
          var i=parseInt(s.getAttribute('data-iz'),10);
          if(!s.value)completo=false;
          partes.push(norm(v.izquierda[i])+'>'+norm(s.value));
        });
        if(!completo){avisoCompletar();return;}
        responder(tema,v,partes.sort().join(';'));
      });
      break;
    case 'escribe':
      var inp=el('respuesta-texto');
      var enviarEscrita=function(){
        var val=inp.value.trim();
        if(!val){avisoCompletar();return;}
        responder(tema,v,norm(val));
      };
      el('btn-comprobar').addEventListener('click',enviarEscrita);
      inp.addEventListener('keydown',function(ev){if(ev.key==='Enter')enviarEscrita();});
      inp.focus();
      break;
    case 'oracion':
      var inpO=el('respuesta-texto');
      var enviarOracion=function(){
        var val=inpO.value.trim();
        if(!val){avisoCompletar();return;}
        var palabras=val.split(/\\s+/);
        if(palabras.length<4){
          el('feedback').innerHTML='<div class="feedback fb-nube">Escribí una oración COMPLETA, de al menos 4 palabras 😊</div>';
          return;
        }
        var ok=palabras.some(function(p){
          var pn=norm(p).replace(/[^a-z0-9ñü]/g,'');
          return pn&&v.hashes.indexOf(sha(DATOS.sal+'|'+v.id+'|'+pn))>=0;
        });
        estado.ultimaOracion=val;
        responder(tema,v,null,ok);
      };
      el('btn-comprobar').addEventListener('click',enviarOracion);
      inpO.addEventListener('keydown',function(ev){if(ev.key==='Enter')enviarOracion();});
      inpO.focus();
      break;
  }
}
function avisoCompletar(){
  el('feedback').innerHTML='<div class="feedback fb-nube">Te falta completar alguna parte 😊</div>';
}

/* ---------- respuesta ---------- */
function responder(tema,v,canonicaUsuario,okPrevio){
  var st=estado.temas[tema.id];
  st.intentos++;
  var ok=(okPrevio!==undefined&&canonicaUsuario===null)?okPrevio:(v.hashes.indexOf(sha(DATOS.sal+'|'+v.id+'|'+canonicaUsuario))>=0);
  if(ok&&v.formato==='oracion'&&estado.ultimaOracion){
    (st.oraciones=st.oraciones||[]).push(estado.ultimaOracion);
    estado.ultimaOracion=null;
  }
  estado.respondidas++;
  if(estado.fase==='repaso'){responderRepaso(tema,st,ok);return;}
  if(DATOS.fiel){
    if(ok){st.creditos++;sonidoBien();el('feedback').innerHTML='<div class="feedback fb-bien">¡Muy bien! ⭐</div>';}
    else{st.fallos++;sonidoSuave();el('feedback').innerHTML='<div class="feedback fb-nube">Todavía no 💪 Seguimos con la siguiente.</div>';}
    if(st.usadas.length<tema.variantes.length){insertarEncuentro(tema.id,0);}
    else{st.dominado=true;if(st.fallos===0)celebrarDominio();}
    guardarProgreso();
    desactivarZona();
    setTimeout(function(){
      if(!ok&&st.fallos>=2&&!st.microVista){st.microVista=true;mostrarMicro(tema);return;}
      despuesDeResponder();
    },1400);
    return;
  }
  if(ok){
    st.creditos++;
    if(st.creditos>=DATOS.creditosNecesarios){st.dominado=true;celebrarDominio();}
    else{insertarEncuentro(tema.id,3);} // vuelve más adelante: dominio en encuentros separados
    sonidoBien();
    el('feedback').innerHTML='<div class="feedback fb-bien">¡Muy bien! ⭐ '+(st.dominado?'¡Planeta conquistado!':'Este tema volverá una vez más para asegurarlo.')+'</div>';
  }else{
    st.fallos++;
    insertarEncuentro(tema.id,2); // vuelve pronto, con otra variante de otro formato
    sonidoSuave();
    el('feedback').innerHTML='<div class="feedback fb-nube">Todavía no 💪 Este tema volverá más adelante con otra pregunta.</div>';
  }
  guardarProgreso();
  desactivarZona();
  setTimeout(function(){
    if(!ok&&st.fallos>=2&&!st.microVista){st.microVista=true;mostrarMicro(tema);return;}
    despuesDeResponder();
  },1400);
}
function desactivarZona(){
  el('zona-respuesta').querySelectorAll('button,select').forEach(function(x){x.disabled=true;});
  var bp=el('btn-pista');if(bp)bp.disabled=true;
  var bg=el('btn-guardar');if(bg)bg.disabled=true;
}
function despuesDeResponder(){
  if(estado.respondidas%6===0){estado.rondas++;pausaRonda();return;}
  siguiente();
}

/* ---------- microlección ---------- */
function mostrarMicro(tema){
  var h='<p>Veamos un ejemplo parecido, paso a paso:</p><div class="explicacion">'+tema.microleccion+'</div>';
  if(tema.explicacion)h+='<details><summary class="suave">Ver la explicación del profesor</summary><div class="explicacion">'+tema.explicacion+'</div></details>';
  mostrarOverlay('📖 Mini-lección: '+esc(tema.nombre),h,'¡Entendido!',function(){despuesDeResponder();});
}

/* ---------- pausas ---------- */
function pausaRonda(){
  var min=Math.round((Date.now()-estado.inicioRonda)/60000);
  var h='<div class="carta" style="text-align:center"><h1>¡Ronda '+estado.rondas+' completada! 🎉</h1>';
  h+=mascota('¡Los astronautas también estiran! Levantate, saltá 10 veces o andá por un vaso de agua. 🤸');
  h+='<p>Llevás '+estado.respondidas+' preguntas'+(min>0?' en unos '+min+' minutos':'')+'.</p>';
  if(estado.rondas>=3){
    h+='<p>Ya hiciste 3 rondas. <b>Es un buen momento para parar</b> y seguir otro día.</p>';
    h+='<button class="btn-principal" id="btn-terminar" style="margin-bottom:8px">Terminar y ver el informe</button>';
    h+='<button class="btn-sec" id="btn-seguir" style="width:100%">Quiero seguir un poco más</button>';
  }else{
    h+='<button class="btn-principal" id="btn-seguir">¡Listo, sigamos!</button>';
  }
  h+='</div>';
  el('app').innerHTML=h;
  var bs=el('btn-seguir');
  if(bs)bs.addEventListener('click',function(){estado.inicioRonda=Date.now();siguiente();});
  var bt=el('btn-terminar');
  if(bt)bt.addEventListener('click',mostrarFinal);
}
function pausaLibre(){
  mostrarOverlay('⏸ En pausa','<p style="text-align:center;font-size:2rem">🧘</p><p style="text-align:center">Tomate el tiempo que necesités.</p>','Seguir practicando');
}

/* ---------- overlay genérico ---------- */
function mostrarOverlay(titulo,cuerpoHtml,textoBoton,alCerrar){
  var o=document.createElement('div');o.className='overlay';
  o.innerHTML='<div class="carta"><h2>'+titulo+'</h2>'+cuerpoHtml+'<button class="btn-principal" style="margin-top:10px">'+esc(textoBoton)+'</button></div>';
  o.querySelector('.btn-principal').addEventListener('click',function(){o.remove();if(alCerrar)alCerrar();});
  document.body.appendChild(o);
}

/* ---------- modo exploración: ver toda la materia sin responder ---------- */
function pintarExplorador(){
  var h='<div class="carta"><h1>📚 Explorar los planetas</h1>';
  h+=mascota('Acá podés pasear por TODA la materia sin responder nada: las ideas del libro, los ejemplos y los videos. Ideal para estudiar antes de practicar. Tocá un planeta:');
  DATOS.temas.forEach(function(t){
    h+='<button class="btn-opcion" data-explorar="'+esc(t.id)+'" style="border-left:8px solid '+colorTema(t.id)+'">'+emojiTema(t.id)+' '+esc(t.nombre)+'</button>';
  });
  h+='<button class="btn-sec" id="btn-volver-inicio" style="width:100%;margin-top:10px">⬅ Volver al inicio</button></div>';
  el('app').innerHTML=h;
  document.querySelectorAll('[data-explorar]').forEach(function(b){
    b.addEventListener('click',function(){pintarExploradorTema(temaPorId(b.getAttribute('data-explorar')));});
  });
  el('btn-volver-inicio').addEventListener('click',pintarInicio);
}
function pintarExploradorTema(t){
  var cartas=tarjetasDeTema(t);
  var h='<div class="carta" style="border-top:8px solid '+colorTema(t.id)+'"><h2>'+emojiTema(t.id)+' '+esc(t.nombre)+'</h2>';
  if(DATOS.voz)h+='<button class="btn-sec" id="btn-oir-explora" style="margin-bottom:10px">🔊 Escuchar</button>';
  if(t.imagenUrl)h+=imagenHtml(t);
  h+='<div class="esquema"><div class="nodo-centro">'+esc(t.nombre)+'</div><div class="ramas">';
  cartas.forEach(function(c){
    h+='<div class="rama'+(c.frente.indexOf('⭐')>=0?' rama-estrella':'')+'"><b>'+esc(c.frente)+'</b><div>'+(c.html?c.dorso:esc(c.dorso))+'</div></div>';
  });
  h+='</div></div>';
  if(t.videoId)h+='<div style="margin-top:12px">'+videoHtml(t)+'</div>';
  h+='<button class="btn-sec" id="btn-volver-explorar" style="width:100%;margin-top:10px">⬅ Volver a los planetas</button></div>';
  el('app').innerHTML=h;
  var bOirE=el('btn-oir-explora');
  if(bOirE)bOirE.addEventListener('click',function(){leerEnVoz(cartas.map(function(c){return c.dorso;}).join('. '));});
  el('btn-volver-explorar').addEventListener('click',pintarExplorador);
}

/* ---------- fase de repaso final ---------- */
function tarjetasDeTema(t){
  var cartas=[];
  var exp=String(t.explicacion||'').trim();
  if(exp){
    if(exp.indexOf('<')>=0){cartas.push({frente:'Idea clave',dorso:exp,html:true});}
    else{
      var partes=exp.split('. ').map(function(p){p=p.trim();return p?(/[.!?:]$/.test(p)?p:p+'.'):'';}).filter(Boolean);
      var maxCartas=5,tam=Math.max(1,Math.ceil(partes.length/maxCartas));
      for(var i=0;i<partes.length;i+=tam){cartas.push({frente:'Idea '+(cartas.length+1),dorso:partes.slice(i,i+tam).join(' '),html:false});}
    }
  }
  cartas.push({frente:'⭐ Ejemplo paso a paso',dorso:t.microleccion,html:true});
  return cartas;
}
function graficoSvg(g){
  var h='';
  if(g.tipo==='barra'){
    var w=310,c=28,gap=2;
    h='<svg viewBox="0 0 '+w+' 36" style="max-width:340px;width:100%;display:block;margin:10px auto" role="img" aria-label="Barra dividida en 10 partes, '+g.pintadas+' pintadas">';
    for(var i=0;i<10;i++){
      h+='<rect x="'+(i*(c+gap)+2)+'" y="3" width="'+c+'" height="30" rx="4" fill="'+(i<g.pintadas?'#118AB2':'#FFFFFF')+'" stroke="#2D2A5E" stroke-width="2"/>';
    }
    h+='</svg>';
  }else{
    var cel=26,gp=2,tam=10*(cel+gp)+4;
    h='<svg viewBox="0 0 '+tam+' '+tam+'" style="max-width:300px;width:100%;display:block;margin:10px auto" role="img" aria-label="Cuadrícula de 100 partes, '+g.pintadas+' pintadas">';
    for(var f=0;f<10;f++)for(var col=0;col<10;col++){
      var idx=f*10+col;
      h+='<rect x="'+(col*(cel+gp)+2)+'" y="'+(f*(cel+gp)+2)+'" width="'+cel+'" height="'+cel+'" rx="3" fill="'+(idx<g.pintadas?'#118AB2':'#FFFFFF')+'" stroke="#2D2A5E" stroke-width="1.5"/>';
    }
    h+='</svg>';
  }
  return h;
}
function imagenHtml(t){
  return '<img src="'+esc(t.imagenUrl)+'" alt="'+esc(t.imagenTitulo||t.nombre)+'" loading="lazy" '+
    'style="width:100%;border-radius:16px;box-shadow:0 6px 18px rgba(20,10,60,.25);display:block" '+
    'onerror="this.style.display=\\'none\\';this.nextElementSibling.textContent=\\'🖼 La imagen necesita internet.\\'">'+
    '<p class="suave">🖼 '+esc(t.imagenTitulo||'')+'</p>';
}
function videoHtml(t){
  return '<div style="position:relative;padding-top:56.25%;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(20,10,60,.3)">'+
    '<iframe src="https://www.youtube-nocookie.com/embed/'+t.videoId+'?rel=0&modestbranding=1" '+
    'style="position:absolute;inset:0;width:100%;height:100%;border:0" allowfullscreen loading="lazy" '+
    'title="'+esc(t.videoTitulo||'Video de repaso')+'"></iframe></div>'+
    '<p class="suave">🎬 '+esc(t.videoTitulo||'Video de repaso')+' · Necesita internet. Si no carga, usá otra forma de repasar.</p>';
}
function modoVideo(tema,alCompletar){
  var h='<p class="suave">Mirá el video con atención: después vas a demostrarlo. 👀</p>';
  h+=videoHtml(tema);
  h+='<button class="btn-sec" id="btn-video-listo" style="width:100%;margin-top:8px">¡Ya lo vi! ✅</button>';
  el('zona-modo').innerHTML=h;
  el('btn-video-listo').addEventListener('click',function(){
    el('btn-video-listo').textContent='Video visto ✔';
    alCompletar();
  });
}
function pintarRepaso(tema){
  var st=estado.temas[tema.id];
  var cartas=tarjetasDeTema(tema);
  var completado=false;
  var h=barraSuperior();
  h+='<div class="carta"><h2>🔁 Repaso: '+esc(tema.nombre)+'</h2>';
  h+='<p class="suave">Elegí CÓMO querés repasarlo. Al terminar cualquiera de las formas, vas a poder demostrarlo.</p>';
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
  h+='<button class="btn-sec" data-modo="tarjetas">📖 Tarjetas</button>';
  h+='<button class="btn-sec" data-modo="esquema">🗺️ Esquema</button>';
  h+='<button class="btn-sec" data-modo="escribir">✍️ Escribirlo</button>';
  if(tema.videoId)h+='<button class="btn-sec" data-modo="video">🎬 Video</button>';
  if(DATOS.voz)h+='<button class="btn-sec" id="btn-oir-repaso">🔊 Escuchar</button>';
  h+='</div>';
  h+='<div id="zona-modo">'+mascota('👆 Elegí una forma de repasar este planeta. ¡Todas valen! Usá la que más te guste hoy.')+'</div>';
  h+='<button class="btn-principal pulso" id="btn-demostrar" disabled style="margin-top:10px">¡Ya lo repasé, a demostrarlo! 💪</button></div>';
  el('app').innerHTML=h;
  el('btn-pausa').addEventListener('click',pausaLibre);
  bindSonido();
  var bOirR=el('btn-oir-repaso');
  if(bOirR)bOirR.addEventListener('click',function(){
    leerEnVoz(cartas.map(function(c){return c.dorso;}).join('. '));
  });
  function desbloquear(){if(!completado){completado=true;el('btn-demostrar').disabled=false;}}
  document.querySelectorAll('[data-modo]').forEach(function(b){
    b.addEventListener('click',function(){
      var m=b.getAttribute('data-modo');
      if(estado.modosRepaso.indexOf(m)<0){
        estado.modosRepaso.push(m);
        if(estado.modosRepaso.length>=3)otorgarInsignia('explorador');
      }
      if(m==='tarjetas')modoTarjetas(cartas,desbloquear);
      else if(m==='esquema')modoEsquema(tema,cartas,desbloquear);
      else if(m==='video')modoVideo(tema,desbloquear);
      else modoEscribir(cartas,desbloquear,st);
    });
  });
  el('btn-demostrar').addEventListener('click',function(){preguntaRefuerzo(tema);});
}
function modoTarjetas(cartas,alCompletar){
  var vistas=0;
  var h='<p class="suave">Tocá cada tarjeta para descubrir la idea.</p><div id="cartas-repaso">';
  cartas.forEach(function(c,i){
    h+='<div class="tarjeta-repaso" data-i="'+i+'"><div class="cara-frente">'+esc(c.frente)+' · tocá para ver 👆</div><div class="cara-dorso oculto"></div></div>';
  });
  h+='</div><p class="suave" id="contador-cartas">Tarjetas vistas: 0 de '+cartas.length+'</p>';
  el('zona-modo').innerHTML=h;
  document.querySelectorAll('.tarjeta-repaso').forEach(function(card){
    card.addEventListener('click',function(){
      if(card.classList.contains('vista'))return;
      var i=parseInt(card.getAttribute('data-i'),10);
      card.classList.add('girando');
      setTimeout(function(){
        card.querySelector('.cara-frente').classList.add('oculto');
        var dorso=card.querySelector('.cara-dorso');
        if(cartas[i].html)dorso.innerHTML=cartas[i].dorso;else dorso.textContent=cartas[i].dorso;
        dorso.classList.remove('oculto');
        card.classList.remove('girando');
        card.classList.add('vista');
        vistas++;
        el('contador-cartas').textContent='Tarjetas vistas: '+vistas+' de '+cartas.length;
        if(vistas===cartas.length)alCompletar();
      },200);
    });
  });
}
function modoEsquema(tema,cartas,alCompletar){
  var h='<p class="suave">Un mapa de ideas para verlo todo de un vistazo:</p>';
  if(tema.imagenUrl)h+=imagenHtml(tema);
  h+='<div class="esquema"><div class="nodo-centro">'+esc(tema.nombre)+'</div><div class="ramas">';
  cartas.forEach(function(c){
    h+='<div class="rama'+(c.frente.indexOf('⭐')>=0?' rama-estrella':'')+'"><b>'+esc(c.frente)+'</b><div>'+(c.html?c.dorso:esc(c.dorso))+'</div></div>';
  });
  h+='</div></div><button class="btn-sec" id="btn-esquema-listo" style="width:100%;margin-top:8px">¡Ya estudié el esquema! ✅</button>';
  el('zona-modo').innerHTML=h;
  el('btn-esquema-listo').addEventListener('click',function(){
    el('btn-esquema-listo').textContent='Esquema estudiado ✔';
    alCompletar();
  });
}
function modoEscribir(cartas,alCompletar,st){
  var h='<p class="suave">Escribí con TUS palabras lo más importante de este tema. Escribirlo vos ayuda muchísimo a recordarlo:</p>';
  h+='<textarea id="txt-resumen" rows="4" placeholder="Yo aprendí que..."></textarea>';
  h+='<button class="btn-sec" id="btn-comparar" style="width:100%;margin-top:8px" disabled>Comparar con las ideas del libro</button>';
  h+='<div id="zona-comparar"></div>';
  el('zona-modo').innerHTML=h;
  var t=el('txt-resumen');
  t.addEventListener('input',function(){el('btn-comparar').disabled=t.value.trim().length<15;});
  el('btn-comparar').addEventListener('click',function(){
    st.resumen=t.value.trim();
    var c='<p style="margin-top:10px"><b>Compará lo tuyo con las ideas del libro:</b></p>';
    cartas.forEach(function(x){c+='<div class="explicacion">'+(x.html?x.dorso:esc(x.dorso))+'</div>';});
    c+='<p class="suave">¿Se parece? Si te faltó algo, es normal: para eso repasamos 😉</p>';
    el('zona-comparar').innerHTML=c;
    guardarProgreso();
    otorgarInsignia('escritor');
    alCompletar();
  });
}
function preguntaRefuerzo(tema){
  var st=estado.temas[tema.id];
  // preferir formatos generativos (escribir/armar): recordar produciendo fija más la memoria
  var gen=tema.variantes.filter(function(x){return (x.formato==='escribe'||x.formato==='arma')&&st.usadas.indexOf(x.id)<0;});
  var v;
  if(gen.length){v=gen[Math.floor(Math.random()*gen.length)];if(st.usadas.indexOf(v.id)<0)st.usadas.push(v.id);st.ultimoFormato=v.formato;}
  else{v=elegirVariante(tema,st.ultimoFormato);}
  estado.actual={temaId:tema.id,variante:v};
  pintarPregunta(tema,v);
}
function responderRepaso(tema,st,ok){
  desactivarZona();
  if(ok){
    st.reforzado=true;
    guardarProgreso();
    confeti();
    sonidoBien();
    otorgarInsignia('no-me-rindo');
    el('feedback').innerHTML='<div class="feedback fb-bien">¡Eso es! 🌟 Tema reforzado.</div>';
    setTimeout(avanzarRepaso,1400);
  }else{
    st.fallos++;
    estado.refuerzoIntentos++;
    guardarProgreso();
    sonidoSuave();
    if(estado.refuerzoIntentos<2){
      el('feedback').innerHTML='<div class="feedback fb-nube">Todavía no 💪 Mirá el ejemplo otra vez y probá con otra pregunta.</div>';
      setTimeout(function(){
        mostrarOverlay('⭐ Ejemplo paso a paso','<div class="explicacion">'+tema.microleccion+'</div>','Probar otra vez',function(){preguntaRefuerzo(tema);});
      },1400);
    }else{
      el('feedback').innerHTML='<div class="feedback fb-nube">Todavía no — este tema lo seguimos practicando otro día 💙</div>';
      setTimeout(avanzarRepaso,1400);
    }
  }
}
function avanzarRepaso(){
  estado.refuerzoIntentos=0;
  estado.repasoIdx++;
  if(estado.repasoIdx<estado.repasoLista.length){pintarRepaso(temaPorId(estado.repasoLista[estado.repasoIdx]));}
  else{informeFinal();}
}

/* ---------- informe final ---------- */
function mostrarFinal(){
  if(DATOS.fiel){informeFinal();return;}
  if(estado.fase==='normal'){
    var lista=DATOS.temas.filter(function(t){var st=estado.temas[t.id];return st.fallos>0||(st.intentos>0&&!st.dominado);}).map(function(t){return t.id;});
    if(lista.length){
      var h='<div class="carta" style="text-align:center"><h1>🔁 ¡Último paso!</h1>';
      h+='<p>Hubo '+lista.length+' tema'+(lista.length>1?'s':'')+' que costaron un poquito. Vamos a repasarlos con tarjetas y después demostrás lo aprendido.</p>';
      h+='<button class="btn-principal" id="btn-ir-repaso" style="margin-bottom:8px">¡Vamos al repaso! ✨</button>';
      h+='<button class="btn-sec" id="btn-saltar-repaso" style="width:100%">Ver el informe ya</button></div>';
      el('app').innerHTML=h;
      el('btn-ir-repaso').addEventListener('click',function(){estado.fase='repaso';estado.repasoLista=lista;estado.repasoIdx=0;estado.refuerzoIntentos=0;pintarRepaso(temaPorId(lista[0]));});
      el('btn-saltar-repaso').addEventListener('click',informeFinal);
      return;
    }
  }
  informeFinal();
}
function informeFinal(){
  confeti();
  var h='<div class="carta" style="text-align:center"><h1>¡Misión cumplida! 🌟</h1>';
  h+=mascota('¡Qué gran expedición! Practicaste <b>'+estado.respondidas+' preguntas</b>'+(estado.dias.length>1?' a lo largo de <b>'+estado.dias.length+' días</b> 📅':'')+'. Abajo dejé el reporte para tu persona adulta.');
  h+='</div>';
  var ids=Object.keys(estado.insignias).filter(function(k){return INSIGNIAS[k];});
  if(ids.length){
    h+='<div class="carta"><h2>🏅 Insignias ganadas</h2>';
    ids.forEach(function(k){var i=INSIGNIAS[k];h+='<p>'+i.emoji+' <b>'+esc(i.nombre)+'</b> — '+esc(i.desc)+'</p>';});
    h+='</div>';
  }
  h+='<div class="carta modo-adulto"><h2>Informe para la persona adulta</h2><table class="informe"><tr><th>Tema</th><th>Intentos</th><th>Pistas</th><th>Estado</th></tr>';
  var repasar=[];
  DATOS.temas.forEach(function(t){
    var st=estado.temas[t.id];
    var estadoTxt;
    if(DATOS.fiel){
      var nV=t.variantes.length;
      if(st.dominado)estadoTxt=(st.creditos===nV?'✅ ':'🔄 ')+st.creditos+' de '+nV+' correctas';
      else if(st.intentos)estadoTxt='⏳ En curso: '+st.creditos+' de '+nV+' correctas';
      else estadoTxt='⬜ Sin ver';
      if(st.fallos>0)repasar.push(t.nombre+' ('+st.fallos+' por revisar)');
      h+='<tr><td>'+esc(t.nombre)+'</td><td>'+st.intentos+'</td><td>'+st.pistas+'</td><td>'+estadoTxt+'</td></tr>';
      return;
    }
    if(st.dominado)estadoTxt='✅ Dominado'+(st.reforzado?' · 💪 reforzado':'');
    else if(st.reforzado)estadoTxt='💪 Reforzado en el repaso';
    else if(st.intentos)estadoTxt='🔄 Para seguir practicando';
    else estadoTxt='⬜ Sin ver';
    if((st.fallos>0&&!st.reforzado)||(!st.dominado&&!st.reforzado&&st.intentos>0))repasar.push(t.nombre);
    h+='<tr><td>'+esc(t.nombre)+'</td><td>'+st.intentos+'</td><td>'+st.pistas+'</td><td>'+estadoTxt+'</td></tr>';
  });
  h+='</table>';
  if(repasar.length)h+='<p style="margin-top:12px"><b>Qué conviene repasar:</b> '+repasar.map(esc).join(', ')+'.</p>';
  else h+='<p style="margin-top:12px"><b>'+(DATOS.fiel?'Toda la práctica quedó correcta.':'Todos los temas quedaron dominados.')+'</b> 🎉</p>';
  h+='</div>';
  var escritos=DATOS.temas.filter(function(t){return estado.temas[t.id].resumen;});
  if(escritos.length){
    h+='<div class="carta"><h2>✍️ Lo que escribió con sus palabras</h2>';
    escritos.forEach(function(t){h+='<p><b>'+esc(t.nombre)+':</b> «'+esc(estado.temas[t.id].resumen)+'»</p>';});
    h+='</div>';
  }
  var conOraciones=DATOS.temas.filter(function(t){return (estado.temas[t.id].oraciones||[]).length;});
  if(conOraciones.length){
    h+='<div class="carta modo-adulto"><h2>📝 Oraciones escritas — revisar concordancia y sentido</h2>';
    h+='<p class="suave">El motor verificó la conjugación exacta y la ortografía del verbo; el resto de la oración lo revisa usted.</p>';
    conOraciones.forEach(function(t){
      (estado.temas[t.id].oraciones||[]).forEach(function(o){h+='<p>• «'+esc(o)+'»</p>';});
    });
    h+='</div>';
  }
  h+='<div class="carta modo-adulto"><button class="btn-sec" style="width:100%;margin-bottom:8px" id="btn-copiar">📋 Copiar informe (para WhatsApp o correo)</button>';
  h+='<p class="suave">El progreso queda guardado en este dispositivo: al abrir de nuevo la práctica se puede continuar. "Empezar de cero" borra todo el avance.</p>';
  h+='<button class="btn-sec" style="width:100%" id="btn-reiniciar">🔄 Empezar de cero</button></div>';
  el('app').innerHTML=h;
  el('btn-copiar').addEventListener('click',function(){
    var lineas=['📚 '+DATOS.titulo,'Preguntas practicadas: '+estado.respondidas+(estado.dias.length>1?' en '+estado.dias.length+' días':''),''];
    DATOS.temas.forEach(function(t){
      var s=estado.temas[t.id];
      var est=DATOS.fiel?(s.creditos+' de '+t.variantes.length+' correctas'):(s.dominado?'✅ Dominado':(s.reforzado?'💪 Reforzado':(s.intentos?'🔄 Seguir practicando':'⬜ Sin ver')));
      lineas.push('• '+t.nombre+': '+est+' ('+s.intentos+' intentos, '+s.pistas+' pistas)');
    });
    var conResumen=DATOS.temas.filter(function(t){return estado.temas[t.id].resumen;});
    if(conResumen.length){
      lineas.push('','✍️ Con sus palabras:');
      conResumen.forEach(function(t){lineas.push('• '+t.nombre+': «'+estado.temas[t.id].resumen+'»');});
    }
    var conOr=DATOS.temas.filter(function(t){return (estado.temas[t.id].oraciones||[]).length;});
    if(conOr.length){
      lineas.push('','📝 Oraciones escritas (revisar concordancia):');
      conOr.forEach(function(t){(estado.temas[t.id].oraciones||[]).forEach(function(o){lineas.push('• «'+o+'»');});});
    }
    var ins=Object.keys(estado.insignias).filter(function(k){return INSIGNIAS[k];});
    if(ins.length)lineas.push('','🏅 Insignias: '+ins.map(function(k){return INSIGNIAS[k].emoji+' '+INSIGNIAS[k].nombre;}).join(', '));
    var texto=lineas.join('\\n');
    try{
      navigator.clipboard.writeText(texto).then(function(){el('btn-copiar').textContent='¡Informe copiado! ✅';});
    }catch(e){el('btn-copiar').textContent='No se pudo copiar en este navegador';}
  });
  el('btn-reiniciar').addEventListener('click',function(){
    mostrarOverlay('🔄 Empezar de cero','<p>Se borrará todo el avance guardado y la práctica comenzará desde el principio. ¿Continuar?</p>','Sí, empezar de cero',function(){borrarProgreso();location.reload();});
  });
}

crearCielo();
pintarInicio();
</script>
</body>
</html>`;
}

// --- programa principal ------------------------------------------------------
function main() {
  const [, , entrada, salida] = process.argv;
  if (!entrada || !salida) {
    console.error('Uso: node construir.js contenido.json practica.html');
    process.exit(1);
  }
  const contenido = JSON.parse(fs.readFileSync(entrada, 'utf8'));
  validar(contenido);
  const sal = contenido.sal || crypto.randomBytes(12).toString('hex');
  const datos = construirDatos(contenido, sal);
  const html = generarHtml(datos);
  auditar(html, contenido, datos);
  fs.writeFileSync(salida, html, 'utf8');
  const nVar = contenido.temas.reduce((a, t) => a + t.variantes.length, 0);
  console.log('OK: ' + path.basename(salida) + ' generado — ' + contenido.temas.length + ' temas, ' + nVar + ' variantes. Auditoría de fugas: sin problemas.');
  console.log('Siguiente paso obligatorio: node verificar.js ' + salida + ' ' + entrada);
}
main();
