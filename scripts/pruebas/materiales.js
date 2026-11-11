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
  const puts = [], despachos = [];
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

  // el análisis también se puede pedir a mano
  tarjeta().querySelector('.btn-analizar').click();
  await hasta(() => despachos.length === 6, 'el análisis a mano');
  afirmar(despachos[5].workflow === 'analizar.yml', 'el botón "Analizar el material" dispara el análisis');
  await hasta(() => /¿Desea generar/.test(tarjeta().querySelector('.estado-analisis').textContent), 'la pregunta otra vez');
  w.close();
}

(async () => {
  probarScripts();
  await probarAdmin();
  console.log('MATERIALES OK');
})().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
