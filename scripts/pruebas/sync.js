// Prueba de la sincronización del progreso (docs/sync.js) con dos aparatos simulados (jsdom) contra
// el worker real con una D1 simulada sobre node:sqlite.
// Uso: node --no-warnings scripts/pruebas/sync.js
const { DatabaseSync } = require('node:sqlite');
const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');
const REPO = process.cwd();
const acceso = JSON.parse(fs.readFileSync(path.join(REPO, 'docs/acceso.json'), 'utf8'));
const fuente = fs.readFileSync(path.join(REPO, 'docs/sync.js'), 'utf8');

function d1Falsa() {
  const db = new DatabaseSync(':memory:');
  function stmt(sql, params = []) {
    return { bind: (...p) => stmt(sql, p), run: async () => { db.prepare(sql).run(...params); return { success: true }; }, all: async () => ({ results: db.prepare(sql).all(...params) }) };
  }
  return { prepare: (sql) => stmt(sql), batch: async (ss) => { for (const s of ss) await s.run(); } };
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const src = fs.readFileSync(path.join(REPO, 'worker/src/index.js'), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).default;
  const fetchNode = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => acceso });   // el worker lee acceso.json del sitio
  const env = { DB: d1Falsa(), SITIO_URL: 'https://ejemplo.test/docs/', ADMIN_CLAVE: 'x' };
  const peticiones = [];
  let servidorCaido = false;

  // Un "aparato": su propio localStorage, la misma sesión, y fetch/sendBeacon conectados al worker.
  function aparato(alias, progresoInicial) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sitio.test/docs/index.html', runScripts: 'outside-only' });
    const w = dom.window;
    w.localStorage.setItem('sas-sesion', JSON.stringify({ alias, nombre: alias }));
    w.localStorage.setItem('sas-telemetria', 'https://w.test/evento');
    if (progresoInicial) w.localStorage.setItem('sas-progreso-v1:' + alias, JSON.stringify(progresoInicial));
    async function alWorker(url, init) {
      if (servidorCaido) throw new Error('sin conexión');
      const cuerpo = init && init.body ? (typeof init.body === 'string' ? init.body : await init.body.text()) : undefined;
      peticiones.push({ url: String(url), metodo: (init && init.method) || 'GET', bytes: cuerpo ? cuerpo.length : 0, cuerpo: cuerpo || '' });
      const r = await worker.fetch(new Request(String(url), { method: (init && init.method) || 'GET', body: cuerpo }), env);
      const texto = await r.text();
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => JSON.parse(texto) };
    }
    w.fetch = async (url, init) => /acceso\.json/.test(String(url)) ? { ok: true, json: async () => acceso } : alWorker(url, init);
    w.navigator.sendBeacon = (url, blob) => { alWorker(url, { method: 'POST', body: blob }).catch(() => {}); return true; };
    w.eval(fuente);
    return {
      w,
      prog: () => JSON.parse(w.localStorage.getItem('sas-progreso-v1:' + alias) || 'null'),
      guardar: (g) => w.localStorage.setItem('sas-progreso-v1:' + alias, JSON.stringify(g)),
      sync: () => w.SASSync.ahora()
    };
  }
  const ok = [];
  const P = 'matematicas_adaptativa_2026-11.html';
  const base = () => ({
    v: 1, puntos: 300, ingresos: ['2026-11-14T20:00:00.000Z'],
    dias: { '2026-11-14': { segundos: 600, respondidas: 20, puntos: 300, misiones: 1 } },
    practicas: { [P]: { titulo: 'Mate', materia: 'Matemáticas', modo: 'adaptativa', respondidas: 20, ultimaVez: '2026-11-14T20:10:00.000Z', completada: false, segundos: 600, puntos: 300, misiones: 1,
      temas: { t1: { nombre: 'Capacidad', estado: 'dominado', fallos: 0, intentos: 3 }, t2: { nombre: 'Moda', estado: 'progreso', fallos: 1, intentos: 2 } },
      dias: { '2026-11-14': { segundos: 600, respondidas: 20, puntos: 300, misiones: 1 } }, sesiones: [{ t: '2026-11-14T20:10:00.000Z', tipo: 'mision', preguntas: 20, segundos: 600, puntos: 300, dominados: ['Capacidad'] }] } }
  });

  // 1. La tableta del estudiante tiene progreso; al abrir el sitio se sube solo.
  const tableta = aparato('tono', base());
  await tableta.w.SASSync.iniciar(); await espera(20);
  const filas = (await env.DB.prepare('SELECT parte FROM progreso WHERE alias = ?').bind('tono').all()).results;
  ok.push(['la tableta sube sola su progreso (meta, día y práctica)', filas.length === 3]);

  // 2. El teléfono del papá, sin nada guardado, entra con el mismo alias y ve todo.
  const telefono = aparato('tono', null);
  let cambios = 0; telefono.w.addEventListener('sas-sync', (ev) => { if (ev.detail.cambio) cambios++; });
  await telefono.w.SASSync.iniciar(); await espera(20);
  const gt = telefono.prog();
  ok.push(['el teléfono baja el progreso completo', !!gt && gt.puntos === 300 && gt.dias['2026-11-14'].segundos === 600 && gt.practicas[P].temas.t1.estado === 'dominado' && gt.ingresos.length === 1]);
  ok.push(['el teléfono avisa a la página para que se repinte', cambios === 1]);

  // 3. Sin cambios no viaja ninguna parte.
  let antes = peticiones.length;
  await telefono.sync(); await tableta.sync();
  const posts = peticiones.slice(antes).filter((p) => p.metodo === 'POST');
  ok.push(['sin cambios no se sube nada', posts.length === 0]);

  // 4. El estudiante sigue en la tableta: solo viaja lo que cambió (no todo el historial).
  let g = tableta.prog();
  g.puntos = 450; g.dias['2026-11-15'] = { segundos: 300, respondidas: 10, puntos: 150, misiones: 1 };
  g.practicas[P].ultimaVez = '2026-11-15T21:00:00.000Z'; g.practicas[P].temas.t2.estado = 'dominado'; g.practicas[P].completada = true; g.practicas[P].segundos = 900; g.practicas[P].puntos = 450;
  g.practicas['espanol_fiel_2026-11.html'] = { titulo: 'Español', materia: 'Español', modo: 'fiel', temas: {}, respondidas: 0, ultimaVez: '2026-11-10T00:00:00.000Z', completada: false, dias: {}, sesiones: [], segundos: 0, puntos: 0, misiones: 0 };
  tableta.guardar(g);
  antes = peticiones.length;
  await tableta.sync();
  await telefono.sync(); await espera(20);
  const g2 = telefono.prog();
  ok.push(['lo nuevo de la tableta llega al teléfono', g2.puntos === 450 && g2.practicas[P].completada === true && g2.practicas[P].temas.t2.estado === 'dominado' && g2.dias['2026-11-15'].misiones === 1 && !!g2.practicas['espanol_fiel_2026-11.html']]);
  const subida = peticiones.slice(antes).find((p) => p.metodo === 'POST');
  ok.push(['la subida no repite el día viejo (solo partes cambiadas)', !!subida && !subida.cuerpo.includes('dia:2026-11-14') && subida.cuerpo.includes('dia:2026-11-15')]);

  // 5. Los dos aparatos practican sin verse (conflicto): al sincronizar no se pierde nada.
  let ga = tableta.prog(), gb = telefono.prog();
  ga.puntos = 500; ga.dias['2026-11-16'] = { segundos: 120, respondidas: 5, puntos: 50, misiones: 0 }; ga.practicas[P].segundos = 1020;
  ga.practicas[P].sesiones.push({ t: '2026-11-16T15:00:00.000Z', tipo: 'parcial', preguntas: 5, segundos: 120, puntos: 50, dominados: [] });
  gb.puntos = 470; gb.dias['2026-11-16'] = { segundos: 60, respondidas: 2, puntos: 20, misiones: 1 }; gb.ingresos.push('2026-11-16T16:00:00.000Z');
  gb.practicas[P].sesiones.push({ t: '2026-11-16T16:00:00.000Z', tipo: 'mision', preguntas: 2, segundos: 60, puntos: 20, dominados: [] });
  tableta.guardar(ga); telefono.guardar(gb);
  await tableta.sync(); await telefono.sync(); await tableta.sync(); await espera(20);
  ga = tableta.prog(); gb = telefono.prog();
  const igual = JSON.stringify(tableta.w.SASSync._partir(ga).meta.puntos) === JSON.stringify(telefono.w.SASSync._partir(gb).meta.puntos);
  ok.push(['tras el conflicto los dos aparatos quedan iguales', igual && tableta.w.SASSync._huella(ga.practicas[P]) === telefono.w.SASSync._huella(gb.practicas[P]) && tableta.w.SASSync._huella(ga.dias) === telefono.w.SASSync._huella(gb.dias)]);
  ok.push(['no se pierde nada: puntos, sesiones de ambos, ingresos y completada', ga.puntos === 500 && ga.practicas[P].sesiones.length === 3 && ga.ingresos.length === 2 && ga.practicas[P].completada === true && ga.dias['2026-11-16'].segundos === 120 && ga.dias['2026-11-16'].misiones === 1]);

  // 6. Sin conexión no se rompe nada y lo pendiente sube cuando vuelve.
  servidorCaido = true;
  g = tableta.prog(); g.puntos = 560; tableta.guardar(g);
  await tableta.sync();
  ok.push(['sin conexión el progreso sigue en el aparato y queda pendiente', tableta.prog().puntos === 560 && tableta.w.SASSync.estado().pendientes === 1]);
  servidorCaido = false;
  await tableta.sync(); await telefono.sync(); await espera(20);
  ok.push(['al volver la conexión sube solo y llega al otro aparato', telefono.prog().puntos === 560 && tableta.w.SASSync.estado().pendientes === 0]);

  // 7. Al cerrar la página se manda con sendBeacon lo que falte.
  g = tableta.prog(); g.puntos = 600; tableta.guardar(g);
  tableta.w.dispatchEvent(new tableta.w.Event('pagehide')); await espera(30);
  await telefono.sync(); await espera(20);
  ok.push(['al cerrar la página lo pendiente sale por sendBeacon', telefono.prog().puntos === 600]);

  // 8. Volumen: un historial grande viaja en paquetes de menos de 50 KB.
  const grande = { v: 1, puntos: 99999, dias: {}, practicas: {} };
  for (let i = 0; i < 60; i++) grande.practicas['practica_' + i + '.html'] = { titulo: 'P' + i, ultimaVez: '2026-11-01T00:00:00.000Z', temas: {}, dias: {}, segundos: i, puntos: i, misiones: 0, completada: false, sesiones: Array.from({ length: 40 }, (_, k) => ({ t: '2026-10-' + String(1 + (k % 28)).padStart(2, '0') + 'T10:' + String(k).padStart(2, '0') + ':00.000Z', tipo: 'mision', preguntas: 10, segundos: 300, puntos: 100, dominados: ['Tema largo número ' + k] })) };
  antes = peticiones.length;
  const pesado = aparato('nachis', grande);
  await pesado.w.SASSync.iniciar(); await espera(50);
  const ps = peticiones.slice(antes).filter((p) => p.metodo === 'POST');
  const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM progreso WHERE alias = ?').bind('nachis').all()).results[0].n;
  ok.push(['historial grande: varios paquetes, todos de menos de 50 KB', ps.length > 1 && ps.every((p) => p.bytes < 52000)]);
  ok.push(['historial grande: llegan las 61 partes', total === 61]);

  // 9. Otro alias no se mezcla con este.
  ok.push(['el progreso de un alias no toca el de otro', !pesado.prog().practicas[P] && !tableta.prog().practicas['practica_1.html']]);

  // 10. Sin sesión o sin servidor configurado, no hace nada.
  const anonimo = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sitio.test/docs/index.html', runScripts: 'outside-only' });
  let llamadas = 0; anonimo.window.fetch = async () => { llamadas++; return { ok: false }; };
  anonimo.window.eval(fuente); await espera(10);
  ok.push(['sin sesión no se manda nada', llamadas === 0 && anonimo.window.SASSync.estado().activo === false]);

  global.fetch = fetchNode;
  let fallos = 0;
  ok.forEach(([n, v]) => { console.log((v ? '✔ ' : '✘ ') + n); if (!v) fallos++; });
  if (fallos) { console.error('FALLÓ: ' + fallos + ' comprobación(es)'); process.exit(1); }
  console.log('SYNC OK');
  process.exit(0);
})().catch((e) => { console.error('FALLÓ:', e.stack || e.message); process.exit(1); });
