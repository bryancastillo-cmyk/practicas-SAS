// Prueba de humo: (1) una práctica registra progreso global al responder; (2) el índice lo lee y pinta misiones.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const REPO = process.cwd();

function storage() {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m };
}
const ls = storage();

async function pruebaPractica() {
  const archivo = 'matematicas_adaptativa_2026-10.html';
  const html = fs.readFileSync(path.join(REPO, 'docs/practicas', archivo), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/practicas/' + archivo, pretendToBeVisual: true,
    beforeParse(w) { Object.defineProperty(w, 'localStorage', { value: ls }); w.speechSynthesis = { getVoices: () => [], cancel(){}, speak(){}, addEventListener(){} }; w.AudioContext = function(){ return { currentTime:0, createOscillator(){return{connect(){},start(){},stop(){},frequency:{}}}, createGain(){return{connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}}}, destination:{} }; }; } });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 50));
  const SAS = w.SAS, estado = w.estado, DATOS = w.DATOS;
  if (!SAS) throw new Error('SAS no existe en la práctica');
  // simular: pregunta en pantalla, 3 respuestas (una reintento), un tema dominado
  SAS.setActivo(true);
  const tema = DATOS.temas[0], st = estado.temas[tema.id];
  st.intentos = 1; st.fallos = 1;
  SAS.respuesta(false, false);
  SAS.respuesta(true, true);   // reintento: 15
  st.dominado = true; SAS.dominado();
  estado.respondidas = 2;
  w.guardarProgreso();          // sincroniza temas al almacén global
  SAS.misionCompleta();
  const g = JSON.parse(ls.getItem('sas-progreso-v1'));
  const hoy = Object.keys(g.dias)[0];
  console.log('práctica → puntos:', g.puntos, '| respondidas hoy:', g.dias[hoy].respondidas, '| misiones:', g.dias[hoy].misiones, '| temas registrados:', Object.keys(g.practicas[archivo].temas).length, '| estado tema0:', g.practicas[archivo].temas[tema.id].estado);
  if (g.puntos !== 75) throw new Error('puntos esperados 75, hay ' + g.puntos);
  if (!g.practicas[archivo]) throw new Error('la práctica no quedó registrada por nombre de archivo');
  // simular tiempo activo: 10 s
  g.dias[hoy].segundos = 600; ls.setItem('sas-progreso-v1', JSON.stringify(g));
  w.close();
}

async function pruebaIndice() {
  const html = fs.readFileSync(path.join(REPO, 'docs/index.html'), 'utf8');
  const cfg = fs.readFileSync((process.env.CFG || path.join(REPO, 'docs/config.json')), 'utf8');
  const pr = fs.readFileSync(path.join(REPO, 'docs/practicas.json'), 'utf8');
  ls.setItem('sas-nombre', 'Nico');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: ls });
      w.fetch = (u) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(u.indexOf('config') >= 0 ? cfg : pr)) });
    } });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 200));
  const d = w.document;
  const txt = id => d.getElementById(id).textContent.replace(/\s+/g, ' ').trim();
  console.log('chip:', txt('chip-puntos'), '| perfil:', txt('perfil-texto'));
  console.log('hero:', d.querySelector('#hero h1').textContent, '|', d.querySelector('#hero p').textContent);
  console.log('misiones:', [...d.querySelectorAll('.mision .nombre')].map(e => e.textContent).join(' // '));
  console.log('materias:', d.querySelectorAll('.materia').length, '| estrellas mate:', d.querySelector('.materia .estrellas').getAttribute('aria-label'), '|', d.querySelectorAll('.materia .est')[0].textContent);
  console.log('stats:', txt('stats').slice(0, 160));
  console.log('logros ok:', d.querySelectorAll('.logro:not(.pend)').length, '/', d.querySelectorAll('.logro').length, '| anteriores:', d.querySelectorAll('#lista-anteriores li').length);
  const errores = [];
  w.addEventListener('error', e => errores.push(e.message));
  if (!d.querySelectorAll('.mision').length) throw new Error('sin misiones');
  w.close();
}

(async () => {
  await pruebaPractica();
  await pruebaIndice();
  console.log('SMOKE OK');
})().catch(e => { console.error('FALLÓ:', e.message); process.exit(1); });
