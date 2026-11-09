// Prueba de humo de la pestaña por materia: (1) la práctica registra tiempo, misiones y sesiones por práctica;
// (2) materia.html?m=science lo pinta (KPI, temas del examen, historial, pestañas); (3) el inicio muestra las pestañas.
// Uso: NODE_PATH=/tmp/prueba/node_modules TZ=America/Costa_Rica node scripts/pruebas/materia.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const REPO = process.cwd();

function storage() {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, key: i => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; }, _m: m };
}
const ls = storage();
ls.setItem('sas-sesion', JSON.stringify({ alias: 'tono', nombre: 'Toño' }));
const CLAVE_P = 'sas-progreso-v1:tono';
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const ARCHIVO = 'science_adaptativa_2026-11.html';

function fetchFalso(w) {
  w.fetch = (u) => {
    if (/videos\.json/.test(String(u))) return Promise.resolve({ ok: true, json: () => Promise.resolve({ v: 1, materias: { science: [{ titulo: 'Renewable and nonrenewable resources', url: 'https://www.youtube.com/watch?v=abc', minutos: 5 }] } }) });
    const ruta = path.join(REPO, 'docs', decodeURIComponent(String(u).split('?')[0]));
    if (fs.existsSync(ruta)) return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(ruta, 'utf8'))) });
    return Promise.resolve({ ok: false, json: () => Promise.reject(new Error('404 ' + u)) });
  };
}

async function pruebaPractica() {
  const html = fs.readFileSync(path.join(REPO, 'docs/practicas', ARCHIVO), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/practicas/' + ARCHIVO, pretendToBeVisual: true,
    beforeParse(w) { Object.defineProperty(w, 'localStorage', { value: ls }); w.speechSynthesis = { getVoices: () => [], cancel(){}, speak(){}, addEventListener(){} }; w.scrollTo = () => {}; w.AudioContext = function(){ return { currentTime:0, createOscillator(){return{connect(){},start(){},stop(){},frequency:{}}}, createGain(){return{connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}}}, destination:{} }; }; } });
  const w = dom.window;
  await espera(50);
  const SAS = w.SAS, estado = w.estado, DATOS = w.DATOS;
  // enlace a la pestaña de la materia en la pantalla de inicio de la práctica
  const enlaces = [...w.document.querySelectorAll('a[href*="materia.html"]')].map(a => a.getAttribute('href'));
  console.log('enlace a la materia en la práctica:', enlaces[0] || 'NO HAY');
  if (!enlaces.length || enlaces[0] !== '../materia.html?m=science') throw new Error('la práctica debería enlazar a ../materia.html?m=science');
  // sesión: 4 respuestas, 2 temas dominados, misión completa
  SAS.setActivo(true);
  const t0 = DATOS.temas[0], t1 = DATOS.temas[1], t2 = DATOS.temas[2];
  estado.temas[t0.id].intentos = 2; estado.temas[t0.id].dominado = true;
  estado.temas[t1.id].intentos = 2; estado.temas[t1.id].dominado = true;
  estado.temas[t2.id].intentos = 2; estado.temas[t2.id].fallos = 2; // todavía no
  SAS.respuesta(true, false); SAS.respuesta(true, false); SAS.respuesta(false, false); SAS.respuesta(true, true);
  SAS.dominado(t0.nombre); SAS.dominado(t1.nombre);
  estado.respondidas = 4; w.guardarProgreso();
  SAS.misionCompleta({ preguntas: 4, materia: DATOS.materia });
  let g = JSON.parse(ls.getItem(CLAVE_P));
  const p = g.practicas[ARCHIVO];
  console.log('práctica → puntos:', p.puntos, '| misiones:', p.misiones, '| sesiones:', p.sesiones.length, '| dominados en sesión:', p.sesiones[0].dominados.join(', '), '| días:', Object.keys(p.dias).join(','));
  if (p.puntos !== 145) throw new Error('puntos de la práctica esperados 145 (10+10+10+15+50+50), hay ' + p.puntos);
  if (p.misiones !== 1 || p.sesiones.length !== 1 || p.sesiones[0].preguntas !== 4 || p.sesiones[0].dominados.length !== 2) throw new Error('la sesión no quedó registrada como se esperaba');
  if (g.puntos !== 145) throw new Error('los puntos globales también deberían ser 145, hay ' + g.puntos);
  // simular tiempo activo guardado por la práctica: 20 minutos hoy en esta práctica
  const hoy = Object.keys(p.dias)[0];
  p.segundos = 1200; p.dias[hoy].segundos = 1200; g.dias[hoy].segundos = 1200;
  ls.setItem(CLAVE_P, JSON.stringify(g));
  w.close();
}

async function pruebaMateria() {
  const html = fs.readFileSync(path.join(REPO, 'docs/materia.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/materia.html?m=science', pretendToBeVisual: true,
    beforeParse(w) { Object.defineProperty(w, 'localStorage', { value: ls }); fetchFalso(w); } });
  const w = dom.window; await espera(250);
  const d = w.document;
  const txt = (sel) => [...d.querySelectorAll(sel)].map(e => e.textContent.replace(/\s+/g, ' ').trim());
  console.log('título:', d.title, '| h1:', txt('h1')[0]);
  if (!/^Science/.test(txt('h1')[0] || '')) throw new Error('debería pintar la materia Science');
  const tabs = [...d.querySelectorAll('#pestanas a')];
  console.log('pestañas:', tabs.map(a => a.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  if (tabs.length < 7) throw new Error('deberían verse Hoy + 5 materias + Mis logros, hay ' + tabs.length);
  const activa = d.querySelector('#pestanas a.activa');
  if (!activa || !/Science/.test(activa.textContent)) throw new Error('la pestaña activa debería ser Science');
  const kpis = txt('.kpi');
  console.log('KPI:', kpis.join(' // '));
  if (!/2 de \d+\s*temas dominados/.test(kpis[0])) throw new Error('KPI de temas dominados incorrecto: ' + kpis[0]);
  if (!/^1\s*todavía no/.test(kpis[1])) throw new Error('KPI todavía no incorrecto: ' + kpis[1]);
  if (!/20 min/.test(kpis[2])) throw new Error('KPI de minutos incorrecto: ' + kpis[2]);
  if (!/^1\s*misiones · 4 preguntas/.test(kpis[3])) throw new Error('KPI de misiones incorrecto: ' + kpis[3]);
  const temas = d.querySelectorAll('.temas li.tema'), dominados = d.querySelectorAll('.temas li.tema.dominado'), todavia = d.querySelectorAll('.temas li.tema.todavia');
  console.log('temas del examen:', temas.length, '| dominados:', dominados.length, '| todavía no:', todavia.length, '| bloques:', txt('.temas li.bloque').join(' / '));
  if (temas.length < 8 || dominados.length !== 2 || todavia.length !== 1) throw new Error('la lista de temas no refleja el progreso de la práctica');
  const filas = txt('tbody tr');
  console.log('historial:', filas.join(' // '));
  if (filas.length !== 1 || !/Misión/.test(filas[0]) || !/\+145/.test(filas[0]) || !/2 temas → dominado/.test(filas[0])) throw new Error('el historial no muestra la sesión');
  const sug = d.querySelector('.mision.sugerida');
  console.log('misión sugerida:', sug.textContent.replace(/\s+/g, ' ').trim(), '→', sug.getAttribute('href'));
  if (!/todavía no/.test(sug.textContent) || !/science_adaptativa_2026-11\.html\?mision=5/.test(sug.getAttribute('href'))) throw new Error('la misión sugerida debería ir al tema que todavía no');
  const minis = d.querySelectorAll('.miniaturas[data-galeria="libro"] button');
  console.log('páginas del libro (miniaturas):', minis.length, '| badge:', (d.querySelector('.miniaturas[data-galeria="libro"] .mas') || {}).textContent, '| videos:', txt('.videos b').join(', '), '| temario PDF:', (d.querySelector('a[href$="contenidos.pdf"]') || {}).getAttribute ? 'sí' : 'no');
  if (minis.length !== 4 || !/\+33/.test((d.querySelector('.miniaturas[data-galeria="libro"] .mas') || {}).textContent || '')) throw new Error('Science debería mostrar 4 miniaturas del libro y +33');
  if (!txt('.videos b').length) throw new Error('debería listar el video aprobado');
  minis[1].click();
  const visor = d.querySelector('.visor');
  console.log('visor:', visor ? visor.querySelector('.controles span').textContent + ' · ' + visor.querySelector('img').getAttribute('src') : 'NO ABRE');
  if (!visor || !/2 de 37/.test(visor.querySelector('.controles span').textContent)) throw new Error('el visor debería abrir en la página 2 de 37');
  visor.querySelector('[data-acc="sig"]').click();
  if (!/3 de 37/.test(d.querySelector('.visor .controles span').textContent)) throw new Error('Siguiente debería pasar a la 3');
  d.querySelector('.visor [data-acc="cerrar"]').click();
  if (d.querySelector('.visor')) throw new Error('Cerrar debería quitar el visor');
  console.log('papás:', txt('.papas p')[0]);
  console.log('semana:', txt('.semana .dia .v').filter(Boolean).join(','), 'min');
  // materia sin práctica todavía (English): debe mostrar el temario y la práctica en preparación
  w.close();
  const dom2 = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/materia.html?m=english', pretendToBeVisual: true,
    beforeParse(w2) { Object.defineProperty(w2, 'localStorage', { value: ls }); fetchFalso(w2); } });
  await espera(250);
  const d2 = dom2.window.document;
  const vac = d2.querySelector('.vacio');
  console.log('English →', d2.querySelector('h1').textContent, '|', vac ? vac.textContent.slice(0, 70) : 'sin aviso', '| temas:', d2.querySelectorAll('.temas li.tema').length);
  if (!vac || !/en preparación/.test(vac.textContent) || !d2.querySelectorAll('.temas li.tema').length) throw new Error('English debería mostrar práctica en preparación y los temas del temario');
  dom2.window.close();
  // sin sesión: redirige al inicio
  const vacio = storage();
  const dom3 = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/materia.html?m=science', pretendToBeVisual: true,
    beforeParse(w3) { Object.defineProperty(w3, 'localStorage', { value: vacio }); fetchFalso(w3); }, virtualConsole: new (require('jsdom').VirtualConsole)() });
  await espera(250);
  const t3 = dom3.window.document.getElementById('contenido').textContent;
  console.log('sin sesión →', /Entrá desde el inicio/.test(t3) ? 'puerta cerrada, manda al inicio' : 'ABIERTA: ' + t3.slice(0, 80));
  if (!/Entrá desde el inicio/.test(t3)) throw new Error('sin sesión debería mandar al inicio');
  dom3.window.close();
}

async function pruebaIndice() {
  const html = fs.readFileSync(path.join(REPO, 'docs/index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) { Object.defineProperty(w, 'localStorage', { value: ls }); fetchFalso(w); w.navigator.sendBeacon = () => true; } });
  await espera(250);
  const d = dom.window.document;
  const tabs = [...d.querySelectorAll('#pestanas a')];
  console.log('inicio → pestañas:', tabs.map(a => a.textContent.replace(/\s+/g, ' ').trim() + ' [' + a.getAttribute('href') + ']').join(' | '));
  if (tabs.length < 7) throw new Error('el inicio debería mostrar Hoy + materias + Mis logros');
  if (!tabs.some(a => a.getAttribute('href') === 'materia.html?m=science')) throw new Error('falta la pestaña de Science');
  const seg = [...d.querySelectorAll('.materia a')].filter(a => /seguimiento/i.test(a.textContent));
  console.log('botones "Ver seguimiento":', seg.length);
  if (seg.length < 5) throw new Error('cada materia debería tener Ver seguimiento');
  dom.window.close();
}

(async () => {
  await pruebaPractica();
  await pruebaMateria();
  await pruebaIndice();
  console.log('SMOKE MATERIA OK');
  process.exit(0);
})().catch(e => { console.error('FALLÓ:', e.message); process.exit(1); });
