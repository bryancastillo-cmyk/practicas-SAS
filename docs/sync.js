/*
 * Sincronización del progreso del estudiante con el servidor (worker/, ruta /progreso).
 *
 * El progreso sigue guardándose primero en el navegador (localStorage['sas-progreso-v1:<alias>']),
 * para que la práctica funcione sin conexión. Este archivo lo sube solo, y lo baja en cualquier otro
 * aparato donde el estudiante (o su papá o mamá) entre con el mismo alias.
 *
 * Volumen: el progreso se parte en piezas pequeñas (meta, una por día, una por práctica). Solo viaja
 * la pieza que cambió, en paquetes de menos de 50 KB, y al bajar solo se piden las piezas que
 * cambiaron desde la última vez (cursor). Un estudiante con mucho historial no sube más que uno nuevo.
 *
 * Lo cargan docs/index.html, docs/materia.html, docs/familia.html y cada práctica (../sync.js).
 */
(function () {
  'use strict';
  var ORIGEN = (function () { try { return new URL('.', document.currentScript.src).href; } catch (e) { return ''; } })();
  var MAX_PAQUETE = 50000, MIN_ENTRE_BAJADAS = 30000, CADA = 60000;

  /* ---------- utilidades ---------- */
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function escribir(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function sesion() { var s = leer('sas-sesion'); return (s && s.alias) ? s : null; }
  function urlProgreso() {
    var u = ''; try { u = localStorage.getItem('sas-telemetria') || ''; } catch (e) {}
    return u ? u.replace(/\/evento\/?$/, '').replace(/\/$/, '') + '/progreso' : '';
  }
  function estable(o) {
    if (o === null || typeof o !== 'object') return JSON.stringify(o === undefined ? null : o);
    if (Array.isArray(o)) return '[' + o.map(estable).join(',') + ']';
    return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + estable(o[k]); }).join(',') + '}';
  }
  function huella(o) { var s = estable(o), h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return s.length + ':' + (h >>> 0).toString(36); }
  function num(x) { return Number(x) || 0; }

  /* ---------- partir y armar el progreso ---------- */
  function vacio() { return { v: 1, puntos: 0, dias: {}, practicas: {} }; }
  function partir(g) {
    var partes = {};
    var meta = { puntos: num(g.puntos) };
    if (g.confianza) meta.confianza = g.confianza;
    if (g.ingresos && g.ingresos.length) meta.ingresos = g.ingresos;
    partes.meta = meta;
    Object.keys(g.dias || {}).forEach(function (k) { if (/^\d{4}-\d{2}-\d{2}$/.test(k)) partes['dia:' + k] = g.dias[k]; });
    Object.keys(g.practicas || {}).forEach(function (k) { if (/^[A-Za-z0-9._-]{1,120}$/.test(k)) partes['practica:' + k] = g.practicas[k]; });
    return partes;
  }
  function poner(g, nombre, datos) {
    if (nombre === 'meta') {
      g.puntos = num(datos.puntos);
      if (datos.confianza) g.confianza = datos.confianza;
      if (datos.ingresos) g.ingresos = datos.ingresos;
    } else if (nombre.indexOf('dia:') === 0) { g.dias[nombre.slice(4)] = datos; }
    else if (nombre.indexOf('practica:') === 0) { g.practicas[nombre.slice(9)] = datos; }
  }

  /* ---------- mezcla: nunca se pierde lo que ya se hizo en ningún aparato ---------- */
  function mezclarDia(a, b) {
    var r = {}; a = a || {}; b = b || {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (k) { r[k] = Math.max(num(a[k]), num(b[k])); });
    return r;
  }
  function mezclarMeta(a, b) {
    var r = { puntos: Math.max(num(a.puntos), num(b.puntos)) };
    if (a.confianza || b.confianza) {
      r.confianza = {};
      var ca = a.confianza || {}, cb = b.confianza || {};
      Object.keys(ca).concat(Object.keys(cb)).forEach(function (n) {
        var x = ca[n] || {}, y = cb[n] || {};
        r.confianza[n] = { ok: Math.max(num(x.ok), num(y.ok)), fallo: Math.max(num(x.fallo), num(y.fallo)) };
      });
    }
    var ing = {}; (a.ingresos || []).concat(b.ingresos || []).forEach(function (t) { ing[t] = 1; });
    var lista = Object.keys(ing).sort(); if (lista.length > 200) lista = lista.slice(-200);
    if (lista.length) r.ingresos = lista;
    return r;
  }
  function mezclarPractica(a, b) {
    // Lo que describe "cómo va" (temas, preguntas respondidas) viene del aparato donde se practicó
    // de último; los contadores (tiempo, puntos, misiones) toman el mayor; las sesiones se unen.
    var reciente = String(b.ultimaVez || '') > String(a.ultimaVez || '') ? b : a, otro = reciente === a ? b : a;
    var r = {}; Object.keys(otro).forEach(function (k) { r[k] = otro[k]; }); Object.keys(reciente).forEach(function (k) { r[k] = reciente[k]; });
    r.completada = !!(a.completada || b.completada);
    ['segundos', 'puntos', 'misiones'].forEach(function (k) { r[k] = Math.max(num(a[k]), num(b[k])); });
    r.dias = {};
    var da = a.dias || {}, db = b.dias || {};
    Object.keys(da).concat(Object.keys(db)).forEach(function (k) { r.dias[k] = mezclarDia(da[k], db[k]); });
    var ses = {}; (a.sesiones || []).concat(b.sesiones || []).forEach(function (s) { if (s && s.t) ses[s.t] = s; });
    r.sesiones = Object.keys(ses).sort().map(function (t) { return ses[t]; }).slice(-40);
    return r;
  }
  function mezclar(nombre, a, b) {
    if (!a) return b; if (!b) return a;
    if (nombre === 'meta') return mezclarMeta(a, b);
    if (nombre.indexOf('dia:') === 0) return mezclarDia(a, b);
    return mezclarPractica(a, b);
  }

  /* ---------- estado de la sincronización (por alias, en este aparato) ---------- */
  var S = null, HASH = '', listo = false, ocupado = false, ultimaBajada = 0, temporizador = null;
  function claveG() { return 'sas-progreso-v1:' + S.alias; }
  function claveE() { return 'sas-sync-v1:' + S.alias; }
  function cargarG() { var g = leer(claveG()); if (!g || g.v !== 1) g = vacio(); g.dias = g.dias || {}; g.practicas = g.practicas || {}; return g; }
  function cargarE() { var e = leer(claveE()); if (!e || e.v !== 1) e = { v: 1, partes: {}, cursor: '', subido: '', bajado: '' }; e.partes = e.partes || {}; return e; }
  function avisar(cambio) { try { window.dispatchEvent(new CustomEvent('sas-sync', { detail: { cambio: !!cambio } })); } catch (e) {} }

  // Aplica partes que vienen del servidor: mezcla con lo local y anota la revisión conocida.
  function recibir(partesServidor, e) {
    if (!partesServidor || !partesServidor.length) return false;
    var g = cargarG(), locales = partir(g), cambio = false;
    partesServidor.forEach(function (p) {
      var m = mezclar(p.parte, locales[p.parte], p.datos);
      if (huella(m) !== huella(locales[p.parte] || null)) { poner(g, p.parte, m); cambio = true; }
      e.partes[p.parte] = { rev: p.rev, h: huella(p.datos) };
    });
    if (cambio) escribir(claveG(), g);
    return cambio;
  }
  function pendientes(e) {
    var locales = partir(cargarG()), lista = [];
    Object.keys(locales).forEach(function (nombre) {
      var datos = locales[nombre], h = huella(datos), c = e.partes[nombre];
      if (nombre === 'meta' && !c && !num(datos.puntos) && !datos.ingresos && !datos.confianza) return;
      if (!c || c.h !== h) lista.push({ parte: nombre, rev: c ? c.rev : 0, datos: datos, h: h });
    });
    return lista;
  }
  function paquetes(lista) {
    var res = [], actual = [], peso = 0;
    lista.forEach(function (p) {
      var w = JSON.stringify(p.datos).length + p.parte.length + 40;
      if (actual.length && peso + w > MAX_PAQUETE) { res.push(actual); actual = []; peso = 0; }
      actual.push(p); peso += w;
    });
    if (actual.length) res.push(actual);
    return res;
  }
  function cuerpo(paq) { return JSON.stringify({ alias: S.alias, hash: HASH, partes: paq.map(function (p) { return { parte: p.parte, rev: p.rev, datos: p.datos }; }) }); }

  function bajar() {
    var e = cargarE();
    return fetch(urlProgreso() + '?alias=' + encodeURIComponent(S.alias) + '&hash=' + encodeURIComponent(HASH) + '&desde=' + encodeURIComponent(e.cursor || ''), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('bajar ' + r.status); return r.json(); })
      .then(function (j) {
        e = cargarE();
        var cambio = recibir(j.partes, e);
        e.cursor = j.cursor || e.cursor || ''; e.bajado = new Date().toISOString();
        escribir(claveE(), e); ultimaBajada = Date.now();
        return cambio;
      });
  }
  function subir(vuelta) {
    var e = cargarE(), lista = pendientes(e);
    if (!lista.length) return Promise.resolve(false);
    var paqs = paquetes(lista), reintentar = false;
    return paqs.reduce(function (antes, paq) {
      return antes.then(function () {
        return fetch(urlProgreso(), { method: 'POST', body: cuerpo(paq), headers: { 'Content-Type': 'text/plain' } })
          .then(function (r) { if (!r.ok) throw new Error('subir ' + r.status); return r.json(); })
          .then(function (j) {
            var e2 = cargarE(), porNombre = {}; paq.forEach(function (p) { porNombre[p.parte] = p; });
            (j.guardadas || []).forEach(function (x) { if (porNombre[x.parte]) e2.partes[x.parte] = { rev: x.rev, h: porNombre[x.parte].h }; });
            if (j.conflictos && j.conflictos.length) { recibir(j.conflictos, e2); reintentar = true; }
            e2.subido = new Date().toISOString();
            escribir(claveE(), e2);
          });
      });
    }, Promise.resolve()).then(function () {
      if (reintentar && (vuelta || 0) < 3) return subir((vuelta || 0) + 1);
      return true;
    });
  }
  // Al cerrar o esconder la página no hay tiempo de esperar respuesta: se manda y ya. La revisión se
  // pone al día en la siguiente sincronización (el servidor nunca pisa una parte con revisión vieja).
  function subirAlSalir() {
    if (!listo) return;
    try {
      var lista = pendientes(cargarE()); if (!lista.length) return;
      paquetes(lista).forEach(function (paq) {
        var c = cuerpo(paq);
        if (navigator.sendBeacon) navigator.sendBeacon(urlProgreso(), new Blob([c], { type: 'text/plain' }));
        else fetch(urlProgreso(), { method: 'POST', body: c, keepalive: true, headers: { 'Content-Type': 'text/plain' } });
      });
    } catch (e) {}
  }
  function ciclo(conBajada) {
    if (!listo || ocupado) return Promise.resolve();
    ocupado = true;
    var cambio = false;
    var p = (conBajada ? bajar().then(function (c) { cambio = c; }) : Promise.resolve())
      .then(function () { return subir(0); })
      .then(function () { avisar(cambio); })
      .catch(function () { avisar(false); });
    return p.then(function () { ocupado = false; });
  }

  function iniciar() {
    var s = sesion(), url = urlProgreso();
    if (!s || !url || !window.fetch) return Promise.resolve(false);
    if (listo && S && S.alias === s.alias) return Promise.resolve(true);
    S = s; listo = false;
    return fetch(ORIGEN + 'acceso.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (a) {
        var u = ((a && a.usuarios) || []).filter(function (x) { return String(x.alias).toLowerCase() === String(S.alias).toLowerCase(); })[0];
        if (!u || !u.hash) return false;
        HASH = u.hash; listo = true;
        if (!temporizador) temporizador = setInterval(function () { if (document.visibilityState === 'visible') ciclo(false); }, CADA);
        return ciclo(true).then(function () { return true; });
      })
      .catch(function () { return false; });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') { subirAlSalir(); return; }
    if (!listo) { iniciar(); return; }
    ciclo(Date.now() - ultimaBajada > MIN_ENTRE_BAJADAS);
  });
  window.addEventListener('pagehide', subirAlSalir);

  window.SASSync = {
    iniciar: iniciar,
    ahora: function () { return listo ? ciclo(true) : iniciar(); },
    estado: function () {
      var s = sesion(); if (!s || !urlProgreso()) return { activo: false };
      var alias = s.alias, e = leer('sas-sync-v1:' + alias) || {};
      var pend = 0; if (listo && S && S.alias === alias) { try { pend = pendientes(cargarE()).length; } catch (x) {} }
      return { activo: true, subido: e.subido || '', bajado: e.bajado || '', pendientes: pend };
    },
    _mezclar: mezclar, _partir: partir, _huella: huella
  };
  iniciar();
})();
