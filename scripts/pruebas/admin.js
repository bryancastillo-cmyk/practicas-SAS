// Prueba de humo del admin: crear una ronda nueva y hacerla actual, con la API de GitHub simulada.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const REPO = process.cwd();
const html = fs.readFileSync(REPO + '/docs/admin/index.html', 'utf8');

const archivos = {
  'docs/config.json': fs.readFileSync(REPO + '/docs/config.json', 'utf8'),
  'docs/practicas.json': fs.readFileSync(REPO + '/docs/practicas.json', 'utf8'),
  'docs/acceso.json': fs.readFileSync(REPO + '/docs/acceso.json', 'utf8')
};
const puts = [];
function b64(s) { return Buffer.from(s, 'utf8').toString('base64'); }
function respuesta(status, body) { return Promise.resolve({ ok: status < 300, status, statusText: 'x', json: () => Promise.resolve(body) }); }
function fetchFalso(url, opts = {}) {
  const u = String(url);
  if (u.endsWith('/user')) return respuesta(200, { login: 'prueba' });
  const m = u.match(/\/contents\/([^?]+)/);
  if (m) {
    const ruta = decodeURI(m[1]);
    if ((opts.method || 'GET') === 'PUT') {
      const body = JSON.parse(opts.body);
      archivos[ruta] = Buffer.from(body.content, 'base64').toString('utf8');
      puts.push({ ruta, mensaje: body.message });
      return respuesta(201, { content: { path: ruta } });
    }
    if (ruta === 'materiales') return respuesta(200, [{ type: 'dir', name: 'matematicas' }, { type: 'dir', name: 'espanol' }]);
    if (ruta.startsWith('materiales/')) return respuesta(200, []);
    if (archivos[ruta] != null) return respuesta(200, { sha: 'abc', content: b64(archivos[ruta]) });
    return respuesta(404, { message: 'Not Found' });
  }
  return respuesta(404, { message: 'Not Found' });
}

(async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/admin/', pretendToBeVisual: true,
    beforeParse(w) { w.fetch = fetchFalso; w.alert = (m) => { throw new Error('alert: ' + m); }; w.confirm = () => true; Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto }); w.TextEncoder = TextEncoder; } });
  const w = dom.window, d = w.document;
  await new Promise(r => setTimeout(r, 50));
  w.eval('TOKEN = "falso"; entrarConToken()');
  await new Promise(r => setTimeout(r, 300));
  const txt = (sel) => d.querySelector(sel).textContent.replace(/\s+/g, ' ').trim();
  console.log('rondas al entrar:', [...d.querySelectorAll('.fila-ronda .nombre')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  console.log('nota materias:', txt('#materias-ronda'));

  // abrir el formulario y crear la ronda nueva
  d.getElementById('btn-nueva-ronda').click();
  console.log('id sugerido:', d.getElementById('ronda-id').value, '| fechas en el form:', d.querySelectorAll('#ronda-fechas input').length);
  d.getElementById('ronda-nombre').value = 'Prácticas finales · Noviembre 2026';
  d.getElementById('ronda-id').value = '2026-11';
  d.querySelector('#ronda-fechas input[data-materia="Matemáticas"]').value = '2026-11-18';
  d.getElementById('form-ronda').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 300));

  const cfg = JSON.parse(archivos['docs/config.json']);
  console.log('guardado →', puts.map(p => p.ruta + ' (' + p.mensaje + ')').join(' ; '));
  console.log('periodoActual:', cfg.periodoActual, '| nombre:', cfg.periodos['2026-11'], '| fechas:', JSON.stringify(cfg.fechasQuiz['2026-11']), '| rondas:', Object.keys(cfg.periodos).join(','));
  console.log('fila actual en pantalla:', txt('.fila-ronda.actual .nombre'), '| form oculto:', d.getElementById('form-ronda').classList.contains('oculto'));
  console.log('nota materias:', txt('#materias-ronda'));

  // id duplicado debe rechazarse
  d.getElementById('btn-nueva-ronda').click();
  d.getElementById('ronda-nombre').value = 'Otra';
  d.getElementById('ronda-id').value = '2026-11';
  d.getElementById('form-ronda').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 100));
  console.log('duplicado →', txt('#err-ronda'));
  if (cfg.periodoActual !== '2026-11') throw new Error('la ronda nueva no quedó como actual');

  // estudiantes y acceso: listar y crear uno
  console.log('usuarios al entrar:', [...d.querySelectorAll('#lista-usuarios .fila-ronda .nombre')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  d.getElementById('btn-nuevo-usuario').click();
  d.getElementById('usr-nombre').value = 'Prueba'; d.getElementById('usr-alias').value = 'prueba'; d.getElementById('usr-clave').value = '1234';
  d.getElementById('form-usuario').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 300));
  const acc = JSON.parse(archivos['docs/acceso.json']);
  const nuevo = acc.usuarios.find(u => u.alias === 'prueba');
  const esperado = require('crypto').createHash('sha256').update(acc.sal + '|prueba|1234').digest('hex');
  console.log('usuario nuevo →', nuevo ? nuevo.nombre + ' hash ok: ' + (nuevo.hash === esperado) : 'NO GUARDADO', '| total:', acc.usuarios.length);
  if (!nuevo || nuevo.hash !== esperado) throw new Error('el estudiante nuevo no quedó guardado con el hash correcto');
  console.log('SMOKE ADMIN OK');
  w.close();
})().catch(e => { console.error('FALLÓ:', e.message); process.exit(1); });
