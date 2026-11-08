// Prueba de humo del modo misión: ?mision=6 → confianza, respuestas, pausa a la mitad, cierre, puntos.
// Uso: npm i jsdom && TZ=America/Costa_Rica node scripts/pruebas/mision.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const REPO = process.cwd();

function storage() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; }
const ls = storage();
ls.setItem('sas-sesion', JSON.stringify({ alias: 'tono', nombre: 'Toño' }));
const espera = (ms) => new Promise(r => setTimeout(r, ms));

async function pruebaPuerta() {
  const archivo = 'matematicas_adaptativa_2026-10.html';
  const html = fs.readFileSync(path.join(REPO, 'docs/practicas', archivo), 'utf8');
  const sinSesion = storage();
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/practicas/' + archivo, pretendToBeVisual: true,
    beforeParse(w) { Object.defineProperty(w, 'localStorage', { value: sinSesion }); w.speechSynthesis = { getVoices: () => [], cancel(){}, speak(){}, addEventListener(){} }; w.scrollTo = () => {}; } });
  await espera(50);
  const t = dom.window.document.getElementById('app').textContent;
  console.log('sin sesión →', /Entrá desde el inicio/.test(t) ? 'puerta cerrada, manda al inicio' : 'ABIERTA: ' + t.slice(0, 80));
  if (!/Entrá desde el inicio/.test(t)) throw new Error('la práctica debería pedir entrar desde el inicio');
  dom.window.close();
}

(async () => {
  await pruebaPuerta();
  const archivo = 'matematicas_adaptativa_2026-10.html';
  const html = fs.readFileSync(path.join(REPO, 'docs/practicas', archivo), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/practicas/' + archivo + '?mision=6', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: ls });
      w.speechSynthesis = { getVoices: () => [], cancel(){}, speak(){}, addEventListener(){} };
      w.AudioContext = function(){ return { currentTime:0, createOscillator(){return{connect(){},start(){},stop(){},frequency:{}}}, createGain(){return{connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}}}, destination:{} }; };
      w.scrollTo = () => {};
    } });
  const w = dom.window, d = w.document;
  await espera(50);
  const texto = () => d.getElementById('app').textContent.replace(/\s+/g, ' ').trim();
  if (!w.MISION.activa || w.MISION.meta !== 6) throw new Error('MISION no se activó con ?mision=6');

  // pantalla de inicio: usar el orden sugerido y comenzar
  const bSug = d.getElementById('btn-sugerido'); if (!bSug) throw new Error('no hay botón de orden sugerido');
  bSug.click(); await espera(20);
  const bCom = d.getElementById('btn-comenzar') || [...d.querySelectorAll('button')].find(b => /comenzar|empezar|despegar/i.test(b.textContent));
  if (bCom) { bCom.click(); await espera(20); }
  if (!d.getElementById('zona-respuesta')) throw new Error('no apareció la primera pregunta: ' + texto().slice(0, 120));
  console.log('barra:', [...d.querySelectorAll('.pill')].map(p => p.textContent).join(' | '));
  if (!d.querySelector('.progreso.mision')) throw new Error('falta la barra de misión');
  if (d.querySelectorAll('.chip-conf').length !== 3) throw new Error('faltan los chips de confianza');

  // responder 6 preguntas: 1ª seguro y mal (micro al primer fallo), 2ª y 3ª bien, pausa a la mitad, 4ª adivinando y bien, 5ª y 6ª bien → cierre
  async function responder(ok, conf) {
    if (conf) { d.querySelector('.chip-conf[data-c="' + conf + '"]').click(); }
    const tema = w.temaPorId(w.estado.actual.temaId), v = w.estado.actual.variante;
    w.responder(tema, v, null, ok);
    await espera(1500);
  }
  await responder(false, 'seguro');
  const fb1 = d.querySelector('.overlay');
  console.log('1ª (seguro, todavía no) → overlay microlección:', !!fb1, '| feedback dijo "Estabas seguro":', /Estabas seguro/.test(texto()));
  if (!fb1) throw new Error('en modo misión la microlección debe salir al primer fallo');
  fb1.querySelector('.btn-principal').click(); await espera(20);

  await responder(true, null);
  await responder(true, null);
  const pausa = d.getElementById('btn-seguir-pausa');
  console.log('3ª (bien) → pausa de movimiento a la mitad:', !!pausa, '| contador:', pausa && d.getElementById('contador-pausa').textContent);
  if (!pausa) throw new Error('faltó la pausa de movimiento a la mitad');
  pausa.click(); await espera(20);

  await responder(true, 'adivino');
  console.log('4ª (adivinando, bien) → feedback:', (d.getElementById('feedback') || {}).textContent);
  await responder(true, null);
  await responder(true, null);

  const cierre = texto();
  console.log('cierre:', cierre.slice(0, 200));
  if (!/Misión completa/.test(cierre)) throw new Error('no apareció el cierre de misión');
  if (!d.getElementById('btn-listo-hoy') || !d.getElementById('btn-ver-informe')) throw new Error('faltan botones del cierre');
  const celdas = [...d.querySelectorAll('.cierre-celda .num')].map(e => e.textContent);
  console.log('celdas (puntos, preguntas, minutos, racha):', celdas.join(' · '));
  if (celdas[1] !== '6') throw new Error('el cierre debería contar 6 preguntas');

  d.querySelector('.chips-proxima button[data-p="Después de cenar"]').click();
  const prox = JSON.parse(ls.getItem('sas-proxima'));
  console.log('próxima guardada:', prox.texto, 'para', prox.para, '|', d.getElementById('proxima-msg').textContent);

  const g = JSON.parse(ls.getItem('sas-progreso-v1:tono'));
  const hoy = Object.keys(g.dias)[0];
  console.log('almacén → puntos:', g.puntos, '| misiones hoy:', g.dias[hoy].misiones, '| confianza:', JSON.stringify(g.confianza));
  if (g.dias[hoy].misiones !== 1) throw new Error('la misión no quedó contada');
  if (!g.confianza || !g.confianza.seguro || g.confianza.seguro.fallo !== 1) throw new Error('la confianza no se registró');

  // "Una misión más" reinicia el conteo
  const otra = d.getElementById('btn-otra-mision');
  if (otra) { otra.click(); await espera(20); console.log('una misión más → pregunta en pantalla:', !!d.getElementById('zona-respuesta'), '| barra:', d.querySelector('.pill').textContent); }
  w.close();
  console.log('SMOKE MISION OK');
})().catch(e => { console.error('FALLÓ:', e.message); process.exit(1); });
