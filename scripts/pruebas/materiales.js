// Prueba de materiales con etiquetas, análisis al subir y prácticas extra.
// 1) scripts: publicar_materiales (diarias/ y otros/), actualizar_catalogo (extra), analisis_materiales.
// 2) admin: subir con etiqueta, análisis de Claude con la pregunta, generar desde una sugerencia y
//    generar una práctica más, con la API de GitHub simulada.
// Uso: node scripts/pruebas/materiales.js   (desde la raíz del repo, con jsdom instalado)
const { JSDOM } = require('jsdom');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const REPO = process.cwd();

function afirmar(cond, mensaje) { if (!cond) throw new Error(mensaje); console.log('  ok · ' + mensaje); }
function escribir(raiz, rel, texto) { const r = path.join(raiz, rel); fs.mkdirSync(path.dirname(r), { recursive: true }); fs.writeFileSync(r, texto); }
function leerJson(raiz, rel) { return JSON.parse(fs.readFileSync(path.join(raiz, rel), 'utf8')); }
function correr(raiz, script, ...args) { return execFileSync('node', [path.join(REPO, 'scripts', script), ...args], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function falla(raiz, script, ...args) { try { correr(raiz, script, ...args); return false; } catch (e) { return true; } }

function probarScripts() {
  console.log('Scripts');
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'sas-materiales-'));
  escribir(raiz, 'docs/config.json', JSON.stringify({ periodoActual: '2026-11', periodos: { '2026-11': 'Finales' } }));
  escribir(raiz, 'docs/practicas.json', JSON.stringify([
    { materia: 'Matemáticas', nombre: 'Vieja', modo: 'adaptativa', archivo: 'practicas/matematicas_adaptativa_2026-10.html', periodo: '2026-10', estado: 'publicada' },
    { materia: 'Matemáticas', nombre: 'Fracciones', modo: 'adaptativa', archivo: 'practicas/matematicas_adaptativa_2026-11.html', periodo: '2026-11', estado: 'publicada' }
  ]));
  escribir(raiz, 'contenido/matematicas/adaptativa_2026-11.json', '{"titulo":"Fracciones"}');
  escribir(raiz, 'materiales/matematicas/temario_2026-11.md', '# Temario');
  escribir(raiz, 'materiales/matematicas/practica_profesor_2026-11.pdf', 'pdf');
  escribir(raiz, 'materiales/matematicas/libro/01.jpg', 'a');
  escribir(raiz, 'materiales/matematicas/libro/02.jpg', 'b');
  escribir(raiz, 'materiales/matematicas/cuaderno/01.jpg', 'c');
  escribir(raiz, 'materiales/matematicas/diarias/01.jpg', 'd');
  escribir(raiz, 'materiales/matematicas/diarias/02.pdf', 'e');
  escribir(raiz, 'materiales/matematicas/otros/mapa_conceptual.pdf', 'f');
  escribir(raiz, 'materiales/matematicas/otros/.gitkeep', '');

  // publicar_materiales: las etiquetas nuevas llegan al sitio
  correr(raiz, 'publicar_materiales.js');
  const mat = leerJson(raiz, 'docs/materiales.json').materias.matematicas;
  afirmar(mat.diarias.length === 2 && mat.diarias[1].archivo === 'materiales/matematicas/diarias/02.pdf', 'las prácticas diarias se publican numeradas');
  afirmar(mat.libro.length === 2 && mat.cuaderno.length === 1, 'libro y cuaderno siguen igual');
  const otro = mat.archivos.find((a) => a.archivo === 'materiales/matematicas/otros/mapa_conceptual.pdf');
  afirmar(otro && otro.tipo === 'otro' && otro.nombre === 'mapa_conceptual.pdf', 'lo etiquetado como Otro se publica con su nombre');
  afirmar(fs.existsSync(path.join(raiz, 'docs/materiales/matematicas/diarias/01.jpg')) && fs.existsSync(path.join(raiz, 'docs/materiales/matematicas/otros/mapa_conceptual.pdf')), 'los archivos se copian a docs/materiales');
  afirmar(mat.archivos.some((a) => a.tipo === 'practica_profesor' && a.periodo === '2026-11'), 'la práctica del profesor queda con su ronda');

  // actualizar_catalogo: una extra se suma, no reemplaza
  afirmar(falla(raiz, 'actualizar_catalogo.js', 'matematicas', 'extra'), 'una extra sin número se rechaza');
  escribir(raiz, 'contenido/matematicas/extra-1_2026-11.json', '{"titulo":"Fracciones con la práctica diaria"}');
  correr(raiz, 'actualizar_catalogo.js', 'matematicas', 'extra', '1');
  escribir(raiz, 'contenido/matematicas/extra-2_2026-11.json', '{"titulo":"Problemas de fracciones"}');
  correr(raiz, 'actualizar_catalogo.js', 'matematicas', 'extra', '2');
  correr(raiz, 'actualizar_catalogo.js', 'matematicas', 'extra', '2');
  let cat = leerJson(raiz, 'docs/practicas.json');
  afirmar(cat.length === 4, 'el catálogo suma dos extras y no duplica al repetir');
  const e2 = cat.find((p) => p.archivo === 'practicas/matematicas_extra-2_2026-11.html');
  afirmar(e2 && e2.modo === 'extra' && e2.numero === 2 && e2.periodo === '2026-11' && e2.nombre === 'Problemas de fracciones', 'la extra queda con modo, número, ronda y título');
  afirmar(cat.some((p) => p.modo === 'adaptativa' && p.periodo === '2026-11') && cat.some((p) => p.periodo === '2026-10'), 'la adaptativa de la ronda y las de rondas anteriores no se tocan');
  escribir(raiz, 'contenido/matematicas/adaptativa.json', '{"titulo":"Fracciones v2"}');
  correr(raiz, 'actualizar_catalogo.js', 'matematicas', 'adaptativa');
  cat = leerJson(raiz, 'docs/practicas.json');
  afirmar(cat.length === 4 && cat.filter((p) => p.modo === 'extra').length === 2 && cat.some((p) => p.nombre === 'Fracciones v2'), 'regenerar la adaptativa la reemplaza y deja las extras');

  // analisis_materiales: inventario, novedades y cierre
  afirmar(falla(raiz, 'analisis_materiales.js', 'inventario', '../x'), 'un slug raro se rechaza');
  correr(raiz, 'analisis_materiales.js', 'inventario', 'matematicas');
  let inv = leerJson(raiz, 'contenido/matematicas/inventario.json');
  const etiquetas = Object.fromEntries(inv.archivos.map((a) => [a.ruta.replace('materiales/matematicas/', ''), a.etiqueta]));
  afirmar(etiquetas['diarias/01.jpg'] === 'diaria' && etiquetas['otros/mapa_conceptual.pdf'] === 'otro' && etiquetas['libro/02.jpg'] === 'libro' && etiquetas['cuaderno/01.jpg'] === 'cuaderno' && etiquetas['practica_profesor_2026-11.pdf'] === 'practica_profesor' && etiquetas['temario_2026-11.md'] === 'temario', 'cada archivo sale con su etiqueta');
  afirmar(!('otros/.gitkeep' in etiquetas), 'los .gitkeep no cuentan');
  afirmar(inv.nuevos.length === inv.archivos.length && inv.ronda === '2026-11', 'la primera vez todo el material es nuevo');
  afirmar(inv.practicas.length === 3 && inv.practicas.find((p) => p.modo === 'extra' && p.numero === 2).contenido === 'contenido/matematicas/extra-2_2026-11.json', 'el inventario trae las prácticas de la ronda con su contenido');
  afirmar(inv.temario === 'materiales/matematicas/temario_2026-11.md', 'el inventario apunta al temario de la ronda');
  afirmar(falla(raiz, 'analisis_materiales.js', 'cerrar', 'matematicas'), 'cerrar falla si Claude no escribió el análisis');
  escribir(raiz, 'contenido/matematicas/analisis.json', JSON.stringify({
    resumen: '  Hay dos prácticas diarias nuevas   de fracciones. ',
    materialNuevo: ['Práctica diaria 1: fracciones equivalentes', '', 7],
    temasCubiertos: ['Fracciones'], temasPendientes: ['Fracciones equivalentes'],
    sugerencias: [
      { tipo: 'adaptativa', titulo: 'Repaso de fracciones equivalentes', enfoque: 'Como la práctica diaria', motivo: 'Tema sin práctica' },
      { tipo: 'fiel', titulo: 'La hoja del profe', enfoque: '' },
      { tipo: 'fiel', titulo: 'Otra hoja', enfoque: '' },
      { tipo: 'loquesea', titulo: 'Problemas' },
      { tipo: 'extra', titulo: 'Sobra' },
      { titulo: '' }
    ],
    archivos: ['mentira']
  }));
  correr(raiz, 'analisis_materiales.js', 'cerrar', 'matematicas');
  const an = leerJson(raiz, 'contenido/matematicas/analisis.json');
  afirmar(an.resumen === 'Hay dos prácticas diarias nuevas de fracciones.' && an.materialNuevo.length === 2, 'el cierre limpia los textos');
  afirmar(an.sugerencias.length === 4 && an.sugerencias.map((s) => s.tipo).join(',') === 'extra,fiel,extra,extra', 'una sugerencia nunca pisa una práctica existente ni repite tipo, y son 4 como máximo');
  afirmar(an.archivos.length === inv.archivos.length && an.ronda === '2026-11' && an.conteo.diaria === 2 && an.nuevos === inv.archivos.length && !!an.fecha, 'el cierre agrega ronda, fecha, conteo y los archivos vistos');
  afirmar(!fs.existsSync(path.join(raiz, 'contenido/matematicas/inventario.json')), 'el inventario temporal se borra');
  escribir(raiz, 'materiales/matematicas/diarias/03.jpg', 'g');
  correr(raiz, 'analisis_materiales.js', 'inventario', 'matematicas');
  inv = leerJson(raiz, 'contenido/matematicas/inventario.json');
  afirmar(inv.nuevos.length === 1 && inv.nuevos[0] === 'materiales/matematicas/diarias/03.jpg', 'la segunda vez solo es nuevo lo que se subió después');
  afirmar(!fs.existsSync(path.join(raiz, 'contenido/matematicas/analisis.json')), 'el análisis anterior se retira mientras corre el nuevo');
  escribir(raiz, 'contenido/matematicas/analisis.json', '{"resumen":""}');
  afirmar(falla(raiz, 'analisis_materiales.js', 'cerrar', 'matematicas'), 'un análisis sin resumen se rechaza');

  // nada se da por visto sin haberse leído: lo que no cabe en una corrida queda para la siguiente
  const { normalizar, MAX_POR_CORRIDA } = require(path.join(REPO, 'scripts', 'analisis_materiales.js'));
  for (let i = 4; i <= 75; i++) escribir(raiz, `materiales/matematicas/libro/${String(i).padStart(2, '0')}.jpg`, 'x');
  escribir(raiz, 'materiales/matematicas/practica_profesor_2026-11_2.pdf', 'x');
  fs.rmSync(path.join(raiz, 'contenido/matematicas/analisis.json'), { force: true });
  correr(raiz, 'analisis_materiales.js', 'inventario', 'matematicas');
  inv = leerJson(raiz, 'contenido/matematicas/inventario.json');
  afirmar(inv.nuevos.length > MAX_POR_CORRIDA && inv.leer.length === MAX_POR_CORRIDA, `con ${inv.nuevos.length} archivos nuevos, a Claude se le piden ${MAX_POR_CORRIDA}`);
  afirmar(/practica_profesor/.test(inv.leer[0]) && /practica_profesor/.test(inv.leer[1]) && /diarias\//.test(inv.leer[2]) && /libro\//.test(inv.leer[inv.leer.length - 1]), 'primero se leen las hojas del profesor y las diarias, al final el libro');
  let n = normalizar({ resumen: 'ok', leidos: inv.leer.slice(0, 10).concat(['materiales/matematicas/libro/75.jpg', 'inventado']) }, inv);
  afirmar(n.leidos === 10 && n.faltan === inv.nuevos.length - 10 && n.archivos.length === 10 && n.total === inv.archivos.length, 'solo cuenta como leído lo que Claude dice que leyó, de lo que se le pidió');
  n = normalizar({ resumen: 'ok' }, inv);
  afirmar(n.leidos === MAX_POR_CORRIDA && n.faltan === inv.nuevos.length - MAX_POR_CORRIDA && n.sinLeer.every((r) => /libro\//.test(r)), 'lo que no cabe en la corrida queda como faltante, no como visto');
  escribir(raiz, 'contenido/matematicas/analisis.json', JSON.stringify({ resumen: 'Primera tanda.', leidos: inv.leer }));
  correr(raiz, 'analisis_materiales.js', 'cerrar', 'matematicas');
  correr(raiz, 'analisis_materiales.js', 'inventario', 'matematicas');
  inv = leerJson(raiz, 'contenido/matematicas/inventario.json');
  afirmar(inv.nuevos.length === n.faltan && inv.vistos.length === MAX_POR_CORRIDA, 'la siguiente corrida retoma exactamente lo que faltaba');
  escribir(raiz, 'contenido/matematicas/analisis.json', JSON.stringify({ resumen: 'Segunda tanda.', leidos: inv.leer }));
  correr(raiz, 'analisis_materiales.js', 'cerrar', 'matematicas');
  const fin = leerJson(raiz, 'contenido/matematicas/analisis.json');
  afirmar(fin.faltan === 0 && fin.archivos.length === fin.total, 'al terminar la segunda tanda ya no falta nada');

  // preguntas del adulto: contexto para Claude y respuesta al historial
  escribir(raiz, 'contenido/matematicas/preguntas.md', '¿Hay hoja del profesor de esta ronda?\n');
  escribir(raiz, 'contenido/matematicas/pendiente.json', JSON.stringify({ modo: 'fiel', enfoque: '' }));
  correr(raiz, 'analisis_materiales.js', 'contexto', 'matematicas');
  const ctx = leerJson(raiz, 'contenido/matematicas/contexto.json');
  afirmar(ctx.materialGuardado.total === fin.total && ctx.materialGuardado.porEtiqueta.libro === 74 && ctx.ultimoAnalisis.resumen === 'Segunda tanda.' && /hoja del profesor/.test(ctx.dudasDeClaudeSinResponder) && ctx.generacionDetenida.modo === 'fiel' && ctx.practicasDeLaRonda.length === 3, 'el contexto trae material, análisis, prácticas y dudas pendientes');
  afirmar(falla(raiz, 'analisis_materiales.js', 'responder', 'matematicas'), 'sin respuesta de Claude no se guarda nada');
  for (let i = 1; i <= 12; i++) {
    escribir(raiz, 'contenido/matematicas/respuesta.json', JSON.stringify({ respuesta: 'Respuesta ' + i + '\n\n\n\nPaso 2' }));
    execFileSync('node', [path.join(REPO, 'scripts', 'analisis_materiales.js'), 'responder', 'matematicas'], { cwd: raiz, env: { ...process.env, PREGUNTA: 'Pregunta ' + i } });
  }
  const cons = leerJson(raiz, 'contenido/matematicas/consultas.json').consultas;
  afirmar(cons.length === 10 && cons[9].pregunta === 'Pregunta 12' && cons[9].respuesta === 'Respuesta 12\n\nPaso 2' && cons[0].pregunta === 'Pregunta 3', 'el historial guarda las últimas 10 preguntas con su respuesta');
  afirmar(!fs.existsSync(path.join(raiz, 'contenido/matematicas/contexto.json')) && !fs.existsSync(path.join(raiz, 'contenido/matematicas/respuesta.json')), 'los archivos temporales de la consulta se borran');
  fs.rmSync(raiz, { recursive: true, force: true });
}

async function probarAdmin() {
  console.log('Admin');
  const html = fs.readFileSync(REPO + '/docs/admin/index.html', 'utf8');
  const cfg = { periodoActual: '2026-11', periodos: { '2026-11': 'Finales' }, fechasQuiz: {}, materias: ['Matemáticas'] };
  const archivos = {
    'docs/config.json': JSON.stringify(cfg),
    'docs/acceso.json': JSON.stringify({ v: 1, sal: 'x', usuarios: [] }),
    'docs/practicas.json': JSON.stringify([{ materia: 'Matemáticas', nombre: 'Fracciones', modo: 'adaptativa', archivo: 'practicas/matematicas_adaptativa_2026-11.html', periodo: '2026-11', estado: 'publicada' }]),
    'materiales/matematicas/practica_profesor_2026-11.pdf': 'x',
    'materiales/matematicas/libro/01.jpg': 'x',
    'materiales/matematicas/libro/04.jpg': 'x',
    'materiales/matematicas/diarias/01.jpg': 'x'
  };
  const ANALISIS = {
    v: 1, materia: 'Matemáticas', slug: 'matematicas', ronda: '2026-11', fecha: '2026-11-11T15:00:00.000Z', nuevos: 4,
    resumen: 'Las prácticas diarias nuevas traen fracciones equivalentes <b>y</b> problemas.',
    materialNuevo: ['Práctica diaria 2: fracciones equivalentes'], temasCubiertos: ['Fracciones'], temasPendientes: ['Fracciones equivalentes'],
    sugerencias: [
      { tipo: 'extra', titulo: 'Fracciones equivalentes', enfoque: 'Ejercicios como los de la práctica diaria 2', motivo: 'Tema sin práctica' },
      { tipo: 'adaptativa', titulo: 'Repaso general', enfoque: 'Todo', motivo: 'Por si acaso' }
    ]
  };
  const puts = [], despachos = [], borrados = [];
  let fallarGenerar = false;
  const corridas = {};
  let siguienteRun = 100;
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
  const respuesta = (status, body) => Promise.resolve({ ok: status < 300, status, statusText: 'x', json: () => Promise.resolve(body) });
  function listar(carpeta) {
    const hijos = {};
    Object.keys(archivos).filter((r) => r.startsWith(carpeta + '/')).forEach((r) => {
      const resto = r.slice(carpeta.length + 1).split('/');
      hijos[resto[0]] = resto.length > 1 ? 'dir' : 'file';
    });
    return Object.keys(hijos).sort().map((n) => ({ type: hijos[n], name: n, sha: 'sha-' + n }));
  }
  function fetchFalso(url, opts = {}) {
    const u = String(url), metodo = opts.method || 'GET';
    if (u.endsWith('/user')) return respuesta(200, { login: 'prueba' });
    if (u.endsWith('guia.md')) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(fs.readFileSync(REPO + '/docs/admin/guia.md', 'utf8')) });
    let m = u.match(/\/actions\/workflows\/([^/]+)\/dispatches$/);
    if (m && metodo === 'POST') {
      const cuerpo = JSON.parse(opts.body);
      const id = siguienteRun++;
      corridas[id] = { id, workflow: m[1], consultas: 0, created_at: new Date().toISOString(), html_url: 'https://github.com/x/y/actions/runs/' + id };
      despachos.push({ workflow: m[1], ref: cuerpo.ref, inputs: cuerpo.inputs });
      return respuesta(204, null);
    }
    m = u.match(/\/actions\/workflows\/([^/]+)\/runs/);
    if (m) return respuesta(200, { workflow_runs: Object.values(corridas).filter((c) => c.workflow === m[1]).reverse() });
    m = u.match(/\/actions\/runs\/(\d+)$/);
    if (m) {
      const c = corridas[m[1]];
      c.consultas++;
      if (c.consultas < 2) return respuesta(200, { status: 'in_progress', html_url: c.html_url });
      // al terminar, el workflow deja su resultado en el repo
      if (c.workflow === 'analizar.yml') archivos['contenido/matematicas/analisis.json'] = JSON.stringify(ANALISIS);
      if (c.workflow === 'preguntar.yml') archivos['contenido/matematicas/consultas.json'] = JSON.stringify({ v: 1, consultas: [{ fecha: '2026-11-11T16:00:00.000Z', pregunta: 'vieja', respuesta: 'vieja' }, { fecha: '2026-11-11T17:00:00.000Z', pregunta: '¿Se guardó todo?', respuesta: 'Sí, <todo> quedó guardado.\nNo suba nada otra vez.' }] });
      if (c.workflow === 'generar.yml' && fallarGenerar) {
        archivos['contenido/matematicas/preguntas.md'] = '¿La hoja es de esta ronda?\n¿Se omite el tema 2?\n';
        archivos['contenido/matematicas/pendiente.json'] = JSON.stringify({ modo: 'extra', enfoque: 'tablas' });
        return respuesta(200, { status: 'completed', conclusion: 'failure', html_url: c.html_url });
      }
      if (c.workflow === 'generar.yml') { delete archivos['contenido/matematicas/preguntas.md']; delete archivos['contenido/matematicas/pendiente.json']; }
      return respuesta(200, { status: 'completed', conclusion: 'success', html_url: c.html_url });
    }
    m = u.match(/\/contents\/([^?]+)/);
    if (m) {
      const ruta = decodeURI(m[1]);
      if (metodo === 'PUT') {
        const cuerpo = JSON.parse(opts.body);
        archivos[ruta] = Buffer.from(cuerpo.content, 'base64').toString('utf8');
        puts.push({ ruta, mensaje: cuerpo.message });
        return respuesta(201, { content: { path: ruta } });
      }
      if (metodo === 'DELETE') { delete archivos[ruta]; borrados.push(ruta); return respuesta(200, {}); }
      if (archivos[ruta] != null) return respuesta(200, { sha: 'abc', content: b64(archivos[ruta]) });
      const hijos = listar(ruta);
      if (hijos.length) return respuesta(200, hijos);
      return respuesta(404, { message: 'Not Found' });
    }
    return respuesta(404, { message: 'Not Found' });
  }

  const alertas = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/admin/', pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = fetchFalso; w.alert = (m) => alertas.push(m); w.confirm = () => true;
      Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto }); w.TextEncoder = TextEncoder;
      w.Element.prototype.scrollIntoView = () => {};
    } });
  const w = dom.window, d = w.document;
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  async function hasta(cond, que) { for (let i = 0; i < 200; i++) { if (cond()) return; await esperar(10); } throw new Error('no llegó: ' + que); }
  const tarjeta = () => d.querySelector('details.materia-card[data-slug="matematicas"]');
  const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();

  await esperar(50);
  w.eval('ESPERA.buscar = 5; ESPERA.sondeo = 5; TOKEN = "falso"; entrarConToken()');
  await hasta(() => tarjeta(), 'la tarjeta de la materia');
  await esperar(50);

  afirmar(d.querySelectorAll('#guia-contenido li').length > 10 && /Faltan archivos por leer/.test(d.getElementById('guia-contenido').textContent) && !d.getElementById('guia-contenido').textContent.includes('**'), 'la guía rápida se muestra en el admin');

  // etiquetas del selector
  const etiquetas = w.eval('ETIQUETAS.map((e) => e.nombre).join(" | ")');
  afirmar(etiquetas === 'Práctica del profesor | Página del libro | Práctica diaria | Hoja del cuaderno | Otro', 'las cinco etiquetas: ' + etiquetas);
  afirmar(/libro\/ \(páginas del libro\)/.test(txt(tarjeta().querySelector('.lista-archivos'))) && /diarias\/ \(prácticas diarias\)/.test(txt(tarjeta().querySelector('.lista-archivos'))), 'la lista de materiales muestra las carpetas por etiqueta');
  afirmar(tarjeta().querySelector('.estado-analisis').classList.contains('oculto'), 'sin análisis previo no se pregunta nada al entrar');

  // nombres al subir, sin pisar lo que ya existe
  const nombre = (id, original, ext, ocupados) => w.eval(`nombreParaSubir(ETIQUETAS.find((e) => e.id === ${JSON.stringify(id)}), ${JSON.stringify(original)}, ${JSON.stringify(ext)}, ${JSON.stringify(ocupados)})`);
  afirmar(nombre('libro', 'foto.png', '.jpg', ['01.jpg', '04.jpg']) === '05.jpg', 'una página nueva sigue después del número más alto, aunque haya huecos');
  afirmar(nombre('practica_profesor', 'Repaso.pdf', '.pdf', ['practica_profesor_2026-11.pdf']) === 'practica_profesor_2026-11_2.pdf', 'una segunda práctica del profesor no pisa la primera');
  afirmar(nombre('otro', 'Mapa de ideas (última).pdf', '.pdf', []) === 'Mapa_de_ideas_ultima.pdf', 'Otro conserva el nombre, limpio');

  // subir tres archivos con etiquetas distintas
  const zona = tarjeta().querySelector('.zona-soltar');
  const soltar = new w.Event('drop', { cancelable: true });
  soltar.dataTransfer = { files: [
    new w.File(['uno'], 'practica diaria martes.pdf', { type: 'application/pdf' }),
    new w.File(['dos'], 'Guía de estudio.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    new w.File(['tres'], 'repaso del profe.pdf', { type: 'application/pdf' })
  ] };
  zona.dispatchEvent(soltar);
  const selects = [...tarjeta().querySelectorAll('.cola-subida select')];
  afirmar(selects.length === 3 && selects.every((s) => s.options.length === 5), 'cada archivo en cola trae el selector con las cinco etiquetas');
  afirmar(selects.map((s) => s.value).join(',') === 'diaria,practica_profesor,practica_profesor', 'la etiqueta sugerida sale del nombre: ' + selects.map((s) => s.value).join(','));
  selects[1].value = 'otro'; selects[1].dispatchEvent(new w.Event('change'));
  tarjeta().querySelector('.btn-subir').click();
  await hasta(() => puts.length === 3, 'las tres subidas');
  afirmar(puts.map((p) => p.ruta).join(' ; ') === 'materiales/matematicas/diarias/02.pdf ; materiales/matematicas/otros/Guia_de_estudio.docx ; materiales/matematicas/practica_profesor_2026-11_2.pdf', 'cada archivo se guarda según su etiqueta: ' + puts.map((p) => p.ruta).join(' ; '));
  afirmar(/Práctica diaria/.test(puts[0].mensaje) && /Otro/.test(puts[1].mensaje), 'el mensaje del commit dice la etiqueta');

  const guardado = tarjeta().querySelector('.msg-guardado');
  await hasta(() => !guardado.classList.contains('oculto'), 'el aviso de guardado');
  afirmar(/Quedaron guardados 3 archivos\. No hace falta volver a subirlos/.test(guardado.textContent), 'al subir dice claro que quedó guardado y que no hay que subir de nuevo');

  // al terminar de subir se dispara el análisis y luego la pregunta
  await hasta(() => despachos.length === 1, 'el análisis automático');
  afirmar(despachos[0].workflow === 'analizar.yml' && despachos[0].inputs.materia === 'matematicas' && despachos[0].ref === 'main', 'subir material dispara analizar.yml para esa materia');
  const panel = tarjeta().querySelector('.estado-analisis');
  await hasta(() => /¿Desea generar prácticas nuevas\?/.test(panel.textContent), 'la pregunta');
  afirmar(!panel.classList.contains('oculto') && /Análisis de Claude/.test(panel.textContent) && /4 archivos nuevos/.test(panel.textContent), 'se muestra el análisis con cuántos archivos nuevos hay');
  afirmar(!panel.querySelector('p b:not(:first-child)') && panel.innerHTML.includes('&lt;b&gt;y&lt;/b&gt;'), 'el texto de Claude se muestra como texto, no como HTML');
  const botones = () => [...tarjeta().querySelectorAll('.btn-generar-sugerencia')];
  afirmar(botones().length === 2 && /Fracciones equivalentes/.test(panel.textContent) && /práctica extra/.test(panel.textContent), 'cada sugerencia trae su botón Generar');

  // generar desde la sugerencia: práctica extra con enfoque
  botones()[0].click();
  await hasta(() => despachos.length === 2, 'la generación de la sugerencia');
  afirmar(despachos[1].workflow === 'generar.yml' && despachos[1].inputs.modo === 'extra' && despachos[1].inputs.materia === 'matematicas' && /^Fracciones equivalentes\. Ejercicios como los de la práctica diaria 2$/.test(despachos[1].inputs.enfoque), 'la sugerencia genera una práctica extra con su enfoque');
  // mientras corre una, no se puede pedir otra de la misma materia
  tarjeta().querySelector('.btn-extra').click();
  await esperar(30);
  afirmar(despachos.length === 2 && alertas.some((a) => /Ya se está generando/.test(a)), 'no se piden dos generaciones a la vez para la misma materia');
  await hasta(() => !w.eval('GENERANDO.matematicas') && tarjeta() && botones().length === 2, 'que termine la generación y se repinte');
  await esperar(50);
  afirmar(botones()[0].disabled && /Ya se pidió/.test(botones()[0].textContent) && !botones()[1].disabled, 'al repintar, la sugerencia ya pedida queda marcada y la otra sigue disponible');

  // una sugerencia "adaptativa" no reemplaza la que ya existe: sale como extra
  botones()[1].click();
  await hasta(() => despachos.length === 3, 'la segunda sugerencia');
  afirmar(despachos[2].inputs.modo === 'extra', 'una sugerencia nunca reemplaza la práctica interactiva que ya existe');
  await hasta(() => !w.eval('GENERANDO.matematicas'), 'que termine');
  await esperar(50);

  // generar una práctica más cuando el adulto quiera
  const campo = tarjeta().querySelector('.in-enfoque');
  campo.value = 'problemas con fracciones';
  tarjeta().querySelector('.btn-extra').click();
  await hasta(() => despachos.length === 4, 'la práctica extra a pedido');
  afirmar(despachos[3].workflow === 'generar.yml' && despachos[3].inputs.modo === 'extra' && despachos[3].inputs.enfoque === 'problemas con fracciones', 'el botón "Generar una práctica más" pide una extra con el enfoque escrito');
  await hasta(() => !w.eval('GENERANDO.matematicas'), 'que termine');
  await esperar(50);
  tarjeta().querySelector('.btn-extra').click();
  await hasta(() => despachos.length === 5, 'otra extra sin enfoque');
  afirmar(!('enfoque' in despachos[4].inputs), 'sin enfoque también se puede');
  await hasta(() => !w.eval('GENERANDO.matematicas'), 'que termine');
  await esperar(50);

  // "Ahora no" guarda la decisión y no vuelve a preguntar por el mismo análisis
  tarjeta().querySelector('.btn-cerrar-analisis').click();
  afirmar(tarjeta().querySelector('.estado-analisis').classList.contains('oculto'), '"Ahora no" cierra la pregunta');
  w.eval('cargarMaterias()');
  await esperar(150);
  afirmar(tarjeta().querySelector('.estado-analisis').classList.contains('oculto'), 'y no se vuelve a preguntar por ese mismo análisis');

  // si el análisis no alcanzó a leer todo, lo dice y ofrece continuar (sin volver a subir)
  ANALISIS.fecha = '2026-11-11T18:00:00.000Z'; ANALISIS.faltan = 26; ANALISIS.total = 52;
  tarjeta().querySelector('.btn-analizar').click();
  await hasta(() => tarjeta().querySelector('.btn-leer-faltan'), 'el aviso de archivos por leer');
  const panel2 = tarjeta().querySelector('.estado-analisis');
  afirmar(/Faltan 26 archivos por leer/.test(panel2.textContent) && /Material guardado de esta materia: 52 archivos/.test(panel2.textContent) && /No hace falta subir nada otra vez/.test(panel2.textContent), 'dice cuántos faltan por leer y que todo está guardado');
  const antesFaltan = despachos.length;
  ANALISIS.fecha = '2026-11-11T18:10:00.000Z'; ANALISIS.faltan = 0;
  tarjeta().querySelector('.btn-leer-faltan').click();
  await hasta(() => despachos.length === antesFaltan + 1 && !tarjeta().querySelector('.btn-leer-faltan') && /¿Desea generar/.test(tarjeta().querySelector('.estado-analisis').textContent), 'la lectura de lo que faltaba');
  afirmar(despachos[despachos.length - 1].workflow === 'analizar.yml', '"Leer los que faltan" vuelve a correr el análisis y el aviso desaparece');

  // una generación que se detiene por dudas: la sugerencia se libera y las dudas se pueden responder
  fallarGenerar = true;
  const n0 = despachos.length;
  botones()[0].click();
  await hasta(() => despachos.length === n0 + 1, 'la generación que va a detenerse');
  const dudas = () => tarjeta().querySelector('.caja-dudas');
  await hasta(() => !dudas().classList.contains('oculto') && dudas().querySelectorAll('ol li').length === 2, 'la caja de dudas');
  afirmar(/Claude tiene dudas y no generó la práctica extra/.test(dudas().textContent) && /¿Se omite el tema 2\?/.test(dudas().textContent), 'las dudas de Claude se muestran en su propia caja');
  afirmar(!botones()[0].disabled && botones()[0].textContent === 'Generar', 'si no se publicó, la sugerencia vuelve a quedar disponible');
  dudas().querySelector('.btn-responder[data-generar]').click();
  await esperar(30);
  afirmar(/Escriba su respuesta/.test(dudas().querySelector('.msg-dudas').textContent) && despachos.length === n0 + 1, 'no deja continuar sin respuesta');
  dudas().querySelector('.txt-respuesta').value = 'Sí es de esta ronda. Omita el tema 2.';
  fallarGenerar = false;
  dudas().querySelector('.btn-responder[data-generar]').click();
  await hasta(() => despachos.length === n0 + 2, 'la regeneración con la respuesta');
  const notas = archivos['materiales/matematicas/notas.md'];
  afirmar(/Respuesta del adulto: Sí es de esta ronda\. Omita el tema 2\./.test(notas) && /- ¿La hoja es de esta ronda\?/.test(notas), 'la respuesta queda en las notas junto con las dudas');
  afirmar(despachos[n0 + 1].workflow === 'generar.yml' && despachos[n0 + 1].inputs.modo === 'extra' && despachos[n0 + 1].inputs.enfoque === 'tablas', 'y se retoma la misma práctica que se había detenido');
  await hasta(() => !w.eval('GENERANDO.matematicas'), 'que termine');
  await esperar(80);
  afirmar(dudas().classList.contains('oculto'), 'al publicarse, la caja de dudas desaparece');

  // descartar las dudas sin generar
  archivos['contenido/matematicas/preguntas.md'] = 'Duda\n'; archivos['contenido/matematicas/pendiente.json'] = JSON.stringify({ modo: 'fiel' });
  w.eval('cargarMaterias()');
  await hasta(() => tarjeta() && !dudas().classList.contains('oculto'), 'las dudas al volver a entrar');
  afirmar(/no generó la práctica fiel/.test(dudas().textContent), 'al volver a entrar al admin, las dudas pendientes siguen ahí');
  dudas().querySelector('.btn-descartar-dudas').click();
  await hasta(() => borrados.length === 2, 'el descarte');
  afirmar(borrados.join(',') === 'contenido/matematicas/preguntas.md,contenido/matematicas/pendiente.json' && dudas().classList.contains('oculto'), '"No generar esta práctica" quita las dudas');

  // pregúntele a Claude
  const nq = despachos.length;
  tarjeta().querySelector('.btn-consultar').click();
  await esperar(20);
  afirmar(despachos.length === nq && /Escriba su pregunta/.test(tarjeta().querySelector('.estado-consulta').textContent), 'no envía una pregunta vacía');
  tarjeta().querySelector('.txt-consulta').value = '  ¿Se guardó   todo?  ';
  tarjeta().querySelector('.btn-consultar').click();
  await hasta(() => despachos.length === nq + 1, 'la pregunta a Claude');
  afirmar(despachos[nq].workflow === 'preguntar.yml' && despachos[nq].inputs.materia === 'matematicas' && despachos[nq].inputs.pregunta === '¿Se guardó todo?', 'la caja envía la pregunta a Claude');
  await hasta(() => tarjeta().querySelectorAll('.consulta').length === 2, 'la respuesta');
  const primera = tarjeta().querySelector('.consulta');
  afirmar(/¿Se guardó todo\?/.test(primera.querySelector('.p').textContent) && primera.querySelector('.r').textContent === 'Sí, <todo> quedó guardado.\nNo suba nada otra vez.' && tarjeta().querySelector('.txt-consulta').value === '', 'la respuesta aparece arriba del historial, como texto');

  // el análisis también se puede pedir a mano
  const nm = despachos.length;
  tarjeta().querySelector('.btn-analizar').click();
  await hasta(() => despachos.length === nm + 1, 'el análisis a mano');
  afirmar(despachos[nm].workflow === 'analizar.yml', 'el botón "Analizar el material" dispara el análisis');
  await hasta(() => /¿Desea generar/.test(tarjeta().querySelector('.estado-analisis').textContent), 'la pregunta otra vez');
  w.close();
}

(async () => {
  probarScripts();
  await probarAdmin();
  console.log('MATERIALES OK');
})().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
