/*
 * Worker de estadísticas de Prácticas SAS.
 *
 * POST /evento   → recibe un evento del navegador del estudiante (alias, tipo, práctica, datos, t)
 *                  y lo guarda en D1. Solo acepta alias que existan en docs/acceso.json del sitio.
 * GET  /resumen  → ?clave=<ADMIN_CLAVE>  resumen por estudiante (lo lee el admin).
 * GET  /eventos  → ?clave=<ADMIN_CLAVE>&alias=<alias>&limite=200  últimos eventos de un alias.
 *
 * Variables: SITIO_URL (var, en wrangler.toml), ADMIN_CLAVE (secret). Binding D1: DB.
 */
const TIPOS = new Set(['ingreso', 'activo', 'mision', 'dominado', 'practica_completa']);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });
}

let tablaLista = false;
async function asegurarTabla(db) {
  if (tablaLista) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, alias TEXT NOT NULL, tipo TEXT NOT NULL, practica TEXT, datos TEXT, t TEXT NOT NULL, recibido TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_eventos_alias ON eventos(alias, tipo, t)')
  ]);
  tablaLista = true;
}

let cacheAcceso = { t: 0, aliases: null };
async function aliasesPermitidos(env) {
  const ahora = Date.now();
  if (cacheAcceso.aliases && ahora - cacheAcceso.t < 5 * 60 * 1000) return cacheAcceso.aliases;
  try {
    const r = await fetch(String(env.SITIO_URL).replace(/\/?$/, '/') + 'acceso.json', { cf: { cacheTtl: 300 } });
    if (r.ok) {
      const a = await r.json();
      cacheAcceso = { t: ahora, aliases: new Set((a.usuarios || []).map((u) => String(u.alias).toLowerCase())) };
      return cacheAcceso.aliases;
    }
  } catch (e) { /* sin acceso.json: se acepta cualquier alias con formato válido */ }
  cacheAcceso = { t: ahora, aliases: null };
  return null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    await asegurarTabla(env.DB);

    if (req.method === 'POST' && (url.pathname === '/evento' || url.pathname === '/')) {
      let cuerpo;
      try {
        const texto = await req.text();
        if (texto.length > 4000) return json({ error: 'demasiado grande' }, 413);
        cuerpo = JSON.parse(texto);
      } catch (e) { return json({ error: 'json inválido' }, 400); }
      const alias = String(cuerpo.alias || '').toLowerCase();
      const tipo = String(cuerpo.tipo || '');
      if (!/^[a-z0-9._-]{2,20}$/.test(alias)) return json({ error: 'alias inválido' }, 400);
      if (!TIPOS.has(tipo)) return json({ error: 'tipo inválido' }, 400);
      const permitidos = await aliasesPermitidos(env);
      if (permitidos && !permitidos.has(alias)) return json({ error: 'alias desconocido' }, 403);
      const t = (typeof cuerpo.t === 'string' && !isNaN(Date.parse(cuerpo.t))) ? new Date(cuerpo.t).toISOString() : new Date().toISOString();
      const practica = String(cuerpo.practica || '').slice(0, 120);
      const datos = cuerpo.datos && typeof cuerpo.datos === 'object' ? cuerpo.datos : {};
      if (tipo === 'activo') { datos.segundos = Math.max(0, Math.min(3600, Math.round(Number(datos.segundos) || 0))); if (!datos.segundos) return json({ ok: true, ignorado: true }); }
      await env.DB.prepare('INSERT INTO eventos (alias, tipo, practica, datos, t, recibido) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(alias, tipo, practica, JSON.stringify(datos).slice(0, 2000), t, new Date().toISOString()).run();
      return json({ ok: true });
    }

    if (req.method === 'GET' && (url.pathname === '/resumen' || url.pathname === '/eventos')) {
      if (!env.ADMIN_CLAVE || url.searchParams.get('clave') !== env.ADMIN_CLAVE) return json({ error: 'no autorizado' }, 401);
      if (url.pathname === '/eventos') {
        const alias = String(url.searchParams.get('alias') || '').toLowerCase();
        const limite = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limite') || '200', 10) || 200));
        const r = await env.DB.prepare('SELECT tipo, practica, datos, t FROM eventos WHERE alias = ? ORDER BY t DESC LIMIT ?').bind(alias, limite).all();
        return json({ alias, eventos: (r.results || []).map((e) => ({ ...e, datos: JSON.parse(e.datos || '{}') })) });
      }
      const sql = `
        SELECT alias,
          SUM(CASE WHEN tipo='ingreso' AND t >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS ingresos30,
          SUM(CASE WHEN tipo='ingreso' THEN 1 ELSE 0 END) AS ingresosTotal,
          MAX(CASE WHEN tipo='ingreso' THEN t END) AS ultimoIngreso,
          MAX(t) AS ultimaActividad,
          COALESCE(SUM(CASE WHEN tipo='activo' THEN json_extract(datos,'$.segundos') END),0) AS segundosTotal,
          COALESCE(SUM(CASE WHEN tipo='activo' AND t >= datetime('now','-7 days') THEN json_extract(datos,'$.segundos') END),0) AS segundos7,
          SUM(CASE WHEN tipo='mision' THEN 1 ELSE 0 END) AS misiones,
          SUM(CASE WHEN tipo='mision' AND t >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS misiones7,
          SUM(CASE WHEN tipo='dominado' THEN 1 ELSE 0 END) AS dominados,
          COUNT(DISTINCT CASE WHEN tipo='practica_completa' THEN practica END) AS practicasCompletas,
          COUNT(DISTINCT CASE WHEN tipo IN ('activo','mision','dominado','practica_completa') AND practica <> '' THEN practica END) AS practicasAbiertas
        FROM eventos GROUP BY alias ORDER BY ultimaActividad DESC`;
      const r = await env.DB.prepare(sql).all();
      const completas = await env.DB.prepare("SELECT alias, practica, MIN(t) AS primera, COUNT(*) AS veces FROM eventos WHERE tipo='practica_completa' GROUP BY alias, practica ORDER BY primera DESC").all();
      const porDia = await env.DB.prepare("SELECT alias, substr(t,1,10) AS dia, SUM(json_extract(datos,'$.segundos')) AS segundos FROM eventos WHERE tipo='activo' AND t >= datetime('now','-14 days') GROUP BY alias, dia").all();
      return json({ generado: new Date().toISOString(), estudiantes: r.results || [], practicasCompletas: completas.results || [], minutosPorDia: porDia.results || [] });
    }

    if (req.method === 'GET' && url.pathname === '/') return json({ ok: true, servicio: 'practicas-sas-eventos' });
    return json({ error: 'no encontrado' }, 404);
  }
};
