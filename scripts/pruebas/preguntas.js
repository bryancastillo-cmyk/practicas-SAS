// Prueba del conteo de preguntas por práctica (scripts/preguntas_catalogo.js).
// Uso: node scripts/pruebas/preguntas.js
'use strict';
const fs = require('fs');
const path = require('path');
const { objetoDesde, preguntasDeHtml, completarPreguntas } = require('../preguntas_catalogo.js');

let fallas = 0;
function igual(nombre, real, esperado) {
  const ok = real === esperado;
  if (!ok) fallas++;
  console.log((ok ? 'ok   ' : 'MAL  ') + nombre + ': ' + real + (ok ? '' : ' (esperado ' + esperado + ')'));
}

// 1) El lector de objetos respeta llaves y comillas dentro de los textos.
igual('objeto con llaves dentro de un texto', JSON.stringify(objetoDesde('x={"a":"} {","b":{"c":1}};', 2)), '{"a":"} {","b":{"c":1}}');

// 2) Adaptativa: temas × créditos necesarios (lo mínimo para terminarla).
const adapt = '<script>var DATOS = {"creditosNecesarios":2,"fiel":false,"temas":[{"id":"a","nombre":"A","variantes":[{},{},{}]},{"id":"b","nombre":"B","variantes":[{}]}]};</script>';
igual('adaptativa: 2 temas × 2 créditos', preguntasDeHtml(adapt), 4);

// 3) La del profe con el motor: una vez cada pregunta.
const fiel = '<script>var DATOS = {"fiel":true,"temas":[{"id":"a","nombre":"A","variantes":[{},{},{}]},{"id":"b","nombre":"B","variantes":[{},{}]}]};</script>';
igual('del profe (motor): total de variantes', preguntasDeHtml(fiel), 5);

// 4) La del profe con formato de examen: suma de las partes p1, p2, …
const examen = '<script>const EXAMEN = {"titulo":"x","colA":[1,2,3],"p1":[1,2],"p2":[1,2,3],"p10":[1]};</script>';
igual('del profe (examen): p1+p2+p10, sin colA', preguntasDeHtml(examen), 6);

// 5) Sin datos reconocibles: 0 (la página no muestra la línea).
igual('HTML sin datos', preguntasDeHtml('<p>hola</p>'), 0);

// 6) Con el repositorio real: toda práctica publicada del catálogo queda con un número.
const raiz = process.cwd();
const catalogo = JSON.parse(fs.readFileSync(path.join(raiz, 'docs', 'practicas.json'), 'utf8'));
completarPreguntas(raiz, catalogo);
const sinNumero = catalogo.filter((p) => fs.existsSync(path.join(raiz, 'docs', p.archivo)) && !(p.preguntas > 0));
igual('prácticas publicadas sin número de preguntas', sinNumero.map((p) => p.archivo).join(', ') || 'ninguna', 'ninguna');

if (fallas) { console.error(fallas + ' prueba(s) fallaron.'); process.exit(1); }
console.log('Todo bien.');
