// Prueba del worker de estadísticas con una D1 simulada sobre node:sqlite (Node 22+).
// Uso: node --experimental-sqlite scripts/pruebas/worker.js   (en Node 22.13+ no hace falta la bandera)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const REPO = process.cwd();

// D1 simulada: prepare().bind().run()/all() y batch()
function d1Falsa() {
  const db = new DatabaseSync(':memory:');
  function stmt(sql, params = []) {
    return {
      bind: (...p) => stmt(sql, p),
      run: async () => { db.prepare(sql).run(...params); return { success: true }; },
      all: async () => ({ results: db.prepare(sql).all(...params) })
    };
  }
  return { prepare: (sql) => stmt(sql), batch: async (ss) => { for (const s of ss) await s.run(); } };
}

(async () => {
  // cargar el módulo ESM del worker
  const src = fs.readFileSync(path.join(REPO, 'worker/src/index.js'), 'utf8');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const worker = mod.default;
  const acceso = JSON.parse(fs.readFileSync(path.join(REPO, 'docs/acceso.json'), 'utf8'));
  // fetch del sitio simulado (acceso.json)
  global.fetch = async (u) => ({ ok: true, json: async () => acceso });
  const env = { DB: d1Falsa(), SITIO_URL: 'https://ejemplo.test/docs/', ADMIN_CLAVE: 'secreta123' };
  const pedir = (metodo, ruta, cuerpo) => worker.fetch(new Request('https://w.test' + ruta, { method: metodo, body: cuerpo ? JSON.stringify(cuerpo) : undefined }), env);

  const ok = [];
  let r = await pedir('POST', '/evento', { alias: 'tono', tipo: 'ingreso', datos: {}, t: new Date().toISOString() }); ok.push(['ingreso aceptado', r.status === 200]);
  r = await pedir('POST', '/evento', { alias: 'tono', tipo: 'activo', practica: 'science_adaptativa_2026-11.html', datos: { segundos: 300 } }); ok.push(['activo aceptado', r.status === 200]);
  r = await pedir('POST', '/evento', { alias: 'tono', tipo: 'activo', practica: 'science_adaptativa_2026-11.html', datos: { segundos: 420 } }); ok.push(['activo 2 aceptado', r.status === 200]);
  r = await pedir('POST', '/evento', { alias: 'tono', tipo: 'mision', practica: 'science_adaptativa_2026-11.html', datos: { preguntas: 10 } }); ok.push(['misión aceptada', r.status === 200]);
  r = await pedir('POST', '/evento', { alias: 'tono', tipo: 'dominado', practica: 'science_adaptativa_2026-11.html', datos: { tema: 'Hydropower' } }); ok.push(['dominado aceptado', r.status === 200]);
  r = await pedir('POST', '/evento', { alias: 'tono', tipo: 'practica_completa', practica: 'science_adaptativa_2026-11.html', datos: {} }); ok.push(['práctica completa aceptada', r.status === 200]);
  r = await pedir('POST', '/evento', { alias: 'nachis', tipo: 'ingreso', datos: {} }); ok.push(['segundo alias aceptado', r.status === 200]);
  r = await pedir('POST', '/evento', { alias: 'intruso', tipo: 'ingreso', datos: {} }); ok.push(['alias desconocido rechazado (403)', r.status === 403]);
  r = await pedir('POST', '/evento', { alias: 'tono', tipo: 'hackeo', datos: {} }); ok.push(['tipo inválido rechazado (400)', r.status === 400]);
  r = await pedir('POST', '/evento', { alias: 'tono', tipo: 'activo', datos: { segundos: 999999 } }); ok.push(['segundos recortados a 3600', r.status === 200]);
  r = await pedir('GET', '/resumen?clave=mala'); ok.push(['resumen sin clave rechazado (401)', r.status === 401]);
  r = await pedir('GET', '/resumen?clave=secreta123'); const res = await r.json();
  const tono = (res.estudiantes || []).find((e) => e.alias === 'tono');
  ok.push(['resumen devuelve estudiantes', !!tono && res.estudiantes.length === 2]);
  ok.push(['tono: 1 ingreso', tono && tono.ingresos30 === 1]);
  ok.push(['tono: 720 + 3600 segundos', tono && Number(tono.segundosTotal) === 4320]);
  ok.push(['tono: 1 misión, 1 dominado, 1 práctica completa', tono && tono.misiones === 1 && tono.dominados === 1 && tono.practicasCompletas === 1]);
  r = await pedir('GET', '/eventos?clave=secreta123&alias=tono&limite=10'); const ev = await r.json();
  ok.push(['eventos por alias', ev.eventos && ev.eventos.length === 7 && typeof ev.eventos[0].datos === 'object']);
  r = await worker.fetch(new Request('https://w.test/evento', { method: 'OPTIONS' }), env); ok.push(['CORS preflight 204', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === '*']);

  // ----- progreso por partes (/progreso) -----
  const hTono = acceso.usuarios.find((u) => u.alias === 'tono').hash;
  const leerP = async (desde) => (await pedir('GET', '/progreso?alias=tono&hash=' + hTono + '&desde=' + encodeURIComponent(desde || ''))).json();
  r = await pedir('POST', '/progreso', { alias: 'tono', hash: 'malo', partes: [{ parte: 'meta', rev: 0, datos: { puntos: 5 } }] }); ok.push(['progreso con hash malo rechazado (403)', r.status === 403]);
  r = await pedir('GET', '/progreso?alias=tono&hash=malo'); ok.push(['leer progreso con hash malo rechazado (403)', r.status === 403]);
  r = await pedir('POST', '/progreso', { alias: 'tono', hash: hTono, partes: [{ parte: 'meta', rev: 0, datos: { puntos: 120 } }, { parte: 'dia:2026-11-15', rev: 0, datos: { segundos: 300 } }, { parte: '../etc', rev: 0, datos: {} }] });
  let jp = await r.json();
  ok.push(['progreso: guarda 2 partes y rechaza el nombre inválido', r.status === 200 && jp.guardadas.length === 2 && jp.rechazadas.length === 1 && jp.guardadas[0].rev === 1]);
  r = await pedir('POST', '/progreso', { alias: 'tono', hash: hTono, partes: [{ parte: 'meta', rev: 1, datos: { puntos: 150 } }] }); jp = await r.json();
  ok.push(['progreso: con la revisión correcta actualiza (rev 2)', jp.guardadas.length === 1 && jp.guardadas[0].rev === 2]);
  r = await pedir('POST', '/progreso', { alias: 'tono', hash: hTono, partes: [{ parte: 'meta', rev: 1, datos: { puntos: 10 } }] }); jp = await r.json();
  ok.push(['progreso: con revisión vieja NO pisa y devuelve lo del servidor', jp.guardadas.length === 0 && jp.conflictos.length === 1 && jp.conflictos[0].rev === 2 && jp.conflictos[0].datos.puntos === 150]);
  r = await pedir('POST', '/progreso', { alias: 'tono', hash: hTono, partes: [{ parte: 'meta', rev: 0, datos: { puntos: 150 } }] }); jp = await r.json();
  ok.push(['progreso: contenido idéntico no es conflicto', jp.guardadas.length === 1 && jp.guardadas[0].rev === 2 && jp.conflictos.length === 0]);
  let lp = await leerP('');
  ok.push(['progreso: leer todo trae 2 partes y cursor', lp.partes.length === 2 && !!lp.cursor && lp.partes.find((x) => x.parte === 'meta').datos.puntos === 150]);
  const cursor1 = lp.cursor;
  lp = await leerP(cursor1); ok.push(['progreso: sin cambios, el cursor no trae nada', lp.partes.length === 0 && lp.cursor === cursor1]);
  await pedir('POST', '/progreso', { alias: 'tono', hash: hTono, partes: [{ parte: 'practica:science_adaptativa_2026-11.html', rev: 0, datos: { completada: true } }] });
  lp = await leerP(cursor1); ok.push(['progreso: desde el cursor solo trae la parte nueva', lp.partes.length === 1 && lp.partes[0].parte === 'practica:science_adaptativa_2026-11.html' && lp.cursor > cursor1]);
  r = await pedir('POST', '/progreso', { alias: 'tono', hash: hTono, partes: [{ parte: 'dia:2026-11-16', rev: 0, datos: { x: 'a'.repeat(50000) } }] }); jp = await r.json();
  ok.push(['progreso: una parte demasiado grande se rechaza', jp.rechazadas.length === 1 && jp.guardadas.length === 0]);
  const hNachis = acceso.usuarios.find((u) => u.alias === 'nachis').hash;
  lp = await (await pedir('GET', '/progreso?alias=nachis&hash=' + hNachis)).json(); ok.push(['progreso: cada alias ve solo lo suyo', lp.partes.length === 0]);

  let fallos = 0;
  ok.forEach(([n, v]) => { console.log((v ? '✔ ' : '✘ ') + n); if (!v) fallos++; });
  if (fallos) { console.error('FALLÓ: ' + fallos + ' comprobación(es)'); process.exit(1); }
  console.log('SMOKE WORKER OK');
})().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
