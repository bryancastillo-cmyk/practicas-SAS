// Prueba de humo: (1) una práctica registra progreso global al responder; (2) el índice lo lee y pinta misiones.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const REPO = process.cwd();

function storage() {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, key: i => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; }, _m: m };
}
const ls = storage();
const ACCESO = JSON.parse(fs.readFileSync(path.join(REPO, 'docs/acceso.json'), 'utf8'));
ls.setItem('sas-sesion', JSON.stringify({ alias: 'tono', nombre: 'Toño' }));
const CLAVE_P = 'sas-progreso-v1:tono';
const ENVIADOS_IDX = [];

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
  const g = JSON.parse(ls.getItem(CLAVE_P));
  if (!g) throw new Error('el progreso no quedó bajo la clave del alias ' + CLAVE_P);
  const hoy = Object.keys(g.dias)[0];
  console.log('práctica → puntos:', g.puntos, '| respondidas hoy:', g.dias[hoy].respondidas, '| misiones:', g.dias[hoy].misiones, '| temas registrados:', Object.keys(g.practicas[archivo].temas).length, '| estado tema0:', g.practicas[archivo].temas[tema.id].estado);
  if (g.puntos !== 75) throw new Error('puntos esperados 75, hay ' + g.puntos);
  if (!g.practicas[archivo]) throw new Error('la práctica no quedó registrada por nombre de archivo');
  // simular tiempo activo: 10 s
  g.dias[hoy].segundos = 600; ls.setItem(CLAVE_P, JSON.stringify(g));
  w.close();
}

async function pruebaIndice() {
  const html = fs.readFileSync(path.join(REPO, 'docs/index.html'), 'utf8');
  const cfgObj = JSON.parse(fs.readFileSync((process.env.CFG || path.join(REPO, 'docs/config.json')), 'utf8'));
  cfgObj.telemetria = { url: 'https://w.test/evento', resumen: 'https://w.test/resumen' };
  const cfg = JSON.stringify(cfgObj);
  const pr = fs.readFileSync(path.join(REPO, 'docs/practicas.json'), 'utf8');
  ls.removeItem('sas-sesion'); // sin sesión: debe aparecer la pantalla de entrada
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: ls });
      w.fetch = (u) => {
        if (u.indexOf('rondas/') >= 0) {
          const ruta = path.join(REPO, 'docs', decodeURIComponent(u));
          if (fs.existsSync(ruta)) return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(ruta, 'utf8'))) });
          return Promise.resolve({ ok: false, json: () => Promise.reject(new Error('404')) });
        }
        if (u.indexOf('acceso') >= 0) return Promise.resolve({ ok: true, json: () => Promise.resolve(ACCESO) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(u.indexOf('config') >= 0 ? cfg : pr)) });
      };
      Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto }); w.TextEncoder = TextEncoder;
      w.navigator.sendBeacon = (url, blob) => { const fr = new w.FileReader(); fr.onload = () => ENVIADOS_IDX.push({ url, ev: JSON.parse(fr.result) }); fr.readAsText(blob); return true; };
    } });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 200));
  const d = w.document;
  const txt = id => d.getElementById(id).textContent.replace(/\s+/g, ' ').trim();
  // 1) sin sesión: pantalla de entrada visible, resto oculto
  if (d.getElementById('entrada').classList.contains('oculto')) throw new Error('sin sesión debería verse la pantalla de entrada');
  if (!d.querySelector('main').classList.contains('oculto')) throw new Error('sin sesión el contenido debería estar oculto');
  // 2) clave incorrecta
  d.getElementById('in-alias').value = 'tono'; d.getElementById('in-clave').value = '0000';
  d.getElementById('form-entrada').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 150));
  console.log('clave mala →', txt('entrada-error'));
  if (!/no coincide/.test(txt('entrada-error'))) throw new Error('la clave incorrecta debería rechazarse');
  // 3) clave correcta
  d.getElementById('in-clave').value = '2309';
  d.getElementById('form-entrada').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 200));
  if (!d.getElementById('entrada').classList.contains('oculto')) throw new Error('con la clave correcta debería entrar');
  const ses = JSON.parse(ls.getItem('sas-sesion'));
  console.log('sesión →', ses.alias, ses.nombre);
  // progreso huérfano (de antes de la entrada con alias): se ofrece adoptar
  ls.setItem('sas-progreso-v1', JSON.stringify({ v: 1, puntos: 300, dias: { '2026-11-08': { segundos: 900, respondidas: 22, puntos: 300, misiones: 1 } }, practicas: { 'science_adaptativa_2026-11.html': { titulo: 'Science', materia: 'Science', modo: 'adaptativa', temas: {}, respondidas: 22, completada: true } } }));
  w.eval('renderTodo()');
  await new Promise(r => setTimeout(r, 50));
  console.log('aviso de adopción:', !d.getElementById('adoptar').classList.contains('oculto') ? d.querySelector('#adoptar .texto').textContent : 'NO APARECE');
  if (d.getElementById('adoptar').classList.contains('oculto')) throw new Error('debería ofrecer adoptar el progreso sin alias');
  d.getElementById('btn-adoptar-si').click();
  await new Promise(r => setTimeout(r, 100));
  const gAd = JSON.parse(ls.getItem(CLAVE_P));
  console.log('tras adoptar → puntos:', gAd.puntos, '| huérfano borrado:', ls.getItem('sas-progreso-v1') === null, '| eventos reenviados:', ENVIADOS_IDX.filter(e => e.ev.datos && e.ev.datos.adoptado).map(e => e.ev.tipo).join(','));
  if (gAd.puntos < 300 || ls.getItem('sas-progreso-v1') !== null) throw new Error('la adopción no fusionó el progreso');
  const gIng = JSON.parse(ls.getItem(CLAVE_P));
  console.log('ingresos registrados:', (gIng.ingresos || []).length, '| evento enviado:', ENVIADOS_IDX.map((e) => e.ev.tipo).join(','));
  if (!(gIng.ingresos || []).length) throw new Error('el ingreso debería registrarse en el almacén del alias');
  if (!ENVIADOS_IDX.some((e) => e.ev.tipo === 'ingreso')) throw new Error('el ingreso debería enviarse al servidor');
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

async function pruebaFamilia() {
  const html = fs.readFileSync(path.join(REPO, 'docs/familia.html'), 'utf8');
  const cfg = fs.readFileSync(path.join(REPO, 'docs/config.json'), 'utf8');
  const pr = fs.readFileSync(path.join(REPO, 'docs/practicas.json'), 'utf8');
  const acc = fs.readFileSync(path.join(REPO, 'docs/acceso.json'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/familia.html', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: ls });
      w.fetch = (u) => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(u.indexOf('config') >= 0 ? cfg : (u.indexOf('acceso') >= 0 ? acc : pr))) });
    } });
  await new Promise(r => setTimeout(r, 200));
  const d = dom.window.document;
  const t = d.getElementById('contenido').textContent.replace(/\s+/g, ' ');
  console.log('familia →', d.querySelectorAll('.estudiante').length, 'estudiante(s) |', t.slice(0, 160));
  if (!d.querySelectorAll('.estudiante').length) throw new Error('familia.html debería mostrar al estudiante con progreso');
  if (!/ingresos en 30 días/.test(t) || !/tiempo efectivo/.test(t)) throw new Error('faltan indicadores en familia.html');
  dom.window.close();
}

(async () => {
  await pruebaPractica();
  await pruebaIndice();
  await pruebaFamilia();
  console.log('SMOKE OK');
})().catch(e => { console.error('FALLÓ:', e.message); process.exit(1); });
