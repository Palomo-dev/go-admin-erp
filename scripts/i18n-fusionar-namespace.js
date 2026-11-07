#!/usr/bin/env node
/**
 * Fusiona un namespace en messages/{es,en,fr,pt}.json sin tocar los demás.
 *
 * Varias sesiones editan estos cuatro archivos a la vez. Editarlos a mano
 * (leer, cambiar, escribir minutos después) pisa el trabajo ajeno. Este script
 * lee, cambia solo `namespace` y escribe en el mismo instante, conservando el
 * formato del repositorio (2 espacios, LF, salto final).
 *
 * Uso:
 *   node scripts/i18n-fusionar-namespace.js <namespace> <dir-fragmentos>
 *
 * `<dir-fragmentos>` contiene es.json, en.json, fr.json y pt.json, cada uno con
 * el objeto del namespace (sin envolver). Falla si las claves no coinciden
 * entre los cuatro idiomas.
 */
const fs = require('fs');
const path = require('path');

const [, , namespace, dir] = process.argv;
if (!namespace || !dir) {
  console.error('Uso: node scripts/i18n-fusionar-namespace.js <namespace> <dir-fragmentos>');
  process.exit(1);
}

const IDIOMAS = ['es', 'en', 'fr', 'pt'];
const raiz = path.join(__dirname, '..', 'messages');

function claves(obj, prefijo = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? claves(v, `${prefijo}${k}.`) : [`${prefijo}${k}`],
  );
}

const fragmentos = Object.fromEntries(
  IDIOMAS.map((l) => [l, JSON.parse(fs.readFileSync(path.join(dir, `${l}.json`), 'utf8'))]),
);

const base = claves(fragmentos.es).sort().join('\n');
for (const l of IDIOMAS) {
  const k = claves(fragmentos[l]).sort().join('\n');
  if (k !== base) {
    console.error(`Las claves de ${l}.json no coinciden con es.json`);
    process.exit(1);
  }
}

for (const l of IDIOMAS) {
  const archivo = path.join(raiz, `${l}.json`);
  const actual = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  actual[namespace] = fragmentos[l];
  fs.writeFileSync(archivo, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
}
console.log(`namespace ${namespace}: ${claves(fragmentos.es).length} claves en ${IDIOMAS.join(', ')}`);
